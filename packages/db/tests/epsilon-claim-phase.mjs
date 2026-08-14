// Wave E lane EPSILON -- phase 2: claim assessment and GATE 1. NOT a test file.
//
// Proves all four ruled states and the whole gate-1 matrix: no assessment row REFUSES a
// pre_sign; `failed` REFUSES; `eligible`, `not_applicable` and `stripped` ALL SEAL; `stripped`
// records the removal on the artifact ROW and in the manifest. Plus the draft-definition arm:
// uncertified is set, and the seal refuses a pre_sign for it -- "draft never statutory" as
// structure, not as a label.

import {
  assert, rootQuery, withActor, ROLES, caught, reasonOf, errorDetail,
  sealArtifact, sealDataset, assessClaim, buildManifest, sha64, MPERS_SECTIONS,
  proposeMetricDefinition, approveMetricDefinition, supersedeMetricDefinition,
  measure, metricAst,
} from "./epsilon-fixtures.mjs";
import {
  buildEpsilonWorld, seedRigProfile, seedVerifiedWording, profileVersion, assessmentRow,
  ensureEpsilonAdmin,
} from "./epsilon-world.mjs";

/** Disable a table's user triggers for one statement, then always put them back. */
async function withTriggersOff(table, fn) {
  await rootQuery(`alter table clara.${table} disable trigger user`);
  try { return await fn(); } finally {
    await rootQuery(`alter table clara.${table} enable trigger user`);
  }
}

export async function registerClaimPhase(t, world) {
  const owner = world.users.alice;

  await t.test("a management pack assesses not_applicable and SEALS", async () => {
    const w = await buildEpsilonWorld(world, { tag: "claim-na", reportClass: "management" });
    assert.equal(w.sealed.claim_assessment.status, "not_applicable");
    assert.equal(w.sealed.claim_assessment.uncertified, false);
    const row = await assessmentRow(w.runId);
    assert.deepEqual([row.status, row.uncertified, row.reason_codes],
      ["not_applicable", false, ["claim_capability_no_claim"]]);
    assert.equal(row.check_receipt.report_class, "management");
    assert.ok(Number(row.check_receipt.contributing_cells) >= 1, "the receipt counts what it read");

    const sha = sha64(`na-${w.runId}`);
    const sealed = await sealArtifact(owner, { runId: w.runId, kind: "pre_sign", sha256: sha,
      manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: sha }) });
    assert.equal(sealed.claim_status, "not_applicable");
    assert.equal(sealed.claim_removed, false, "not_applicable is not a strip -- there was no claim to remove");
    assert.equal(sealed.storage_key, `firms/${world.firms.A}/reports/${sha}.pdf`,
      "the key is DB-derived and content-addressed; no filename parameter exists");
    world.epsilonNaRun = w;
  });

  await t.test("a statutory pack whose required wording is unverified assesses FAILED and refuses a pre_sign", async () => {
    const mpers = await profileVersion("mpers_company", 1);
    const w = await buildEpsilonWorld(world, { tag: "claim-failed", reportClass: "statutory",
      profileVersionId: mpers, sections: MPERS_SECTIONS });
    assert.equal(w.sealed.claim_assessment.status, "failed",
      "owner task #43 has landed no verified wording, so every statutory pack fails today");
    const row = await assessmentRow(w.runId);
    assert.deepEqual(row.reason_codes, ["required_wording_unverified"]);
    assert.equal(row.check_receipt.unverified_required_wording_keys.length, 5,
      "the receipt names every required wording key it could not verify");

    const sha = sha64(`failed-${w.runId}`);
    const refused = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "pre_sign",
      sha256: sha, manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: sha }) }));
    assert.equal(reasonOf(refused), "claim_assessment_failed", refused?.message);
    assert.deepEqual(errorDetail(refused).reason_codes, ["required_wording_unverified"]);

    // A failed run may still render a WATERMARKED, non-issuable draft so the preparer can see
    // what failed (design SS7 gate 2, builder choice).
    const draftSha = sha64(`failed-draft-${w.runId}`);
    const draft = await sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
      sha256: draftSha, manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha }) });
    assert.equal(draft.kind, "draft_watermarked");
    assert.equal(draft.claim_status, "failed");
  });

  await t.test("a conforming statutory pack assesses ELIGIBLE and a custom cut of it assesses STRIPPED", async () => {
    const rig = await seedRigProfile("eligible");
    await seedVerifiedWording({ profileKey: rig.profileKey, verifier: owner });

    const conforming = await buildEpsilonWorld(world, { tag: "claim-eligible", reportClass: "statutory",
      profileVersionId: rig.profileVersionId, sections: MPERS_SECTIONS });
    assert.equal(conforming.sealed.claim_assessment.status, "eligible");
    assert.deepEqual((await assessmentRow(conforming.runId)).reason_codes,
      ["presentation_profile_checks_passed"]);
    assert.equal(conforming.sealed.claim_assessment.label, "Presentation-profile checks passed.",
      "the label comes from a versioned policy row, never from a literal in a body");

    // THE CUSTOM CUT (matrix D6): the TEMPLATE lays out every required section, and the
    // instance SPEC drops one. That is user sovereignty, and it strips rather than blocks.
    const cut = await buildEpsilonWorld(world, { tag: "claim-stripped", reportClass: "statutory",
      profileVersionId: rig.profileVersionId, sections: MPERS_SECTIONS,
      specSections: MPERS_SECTIONS.filter((s) => s !== "notes") });
    assert.equal(cut.sealed.claim_assessment.status, "stripped");
    const cutRow = await assessmentRow(cut.runId);
    assert.deepEqual(cutRow.reason_codes, ["layout_omits_required_section"],
      "stripped is driven by SECTION deviation and nothing else");
    assert.deepEqual(cutRow.check_receipt.missing_required_sections, ["notes"]);
    // The other half of the de-conflation: every contributing cell is firm_approved, so the
    // provenance axis is clean and a genuine custom cut still SEALS. Closing the composition hole
    // must not have turned every stripped pack into a refusal.
    assert.equal(cutRow.uncertified, false);
    assert.deepEqual(cutRow.check_receipt.uncertified_reason_codes, []);

    // STRIPPED SEALS -- and the removal is recorded on the artifact ROW, not only in the
    // manifest. Absence is refusal; stripped is not absence.
    const sha = sha64(`stripped-${cut.runId}`);
    const sealed = await sealArtifact(owner, { runId: cut.runId, kind: "pre_sign", sha256: sha,
      manifest: await buildManifest({ runId: cut.runId, kind: "pre_sign", sha256: sha }) });
    assert.equal(sealed.claim_status, "stripped");
    assert.equal(sealed.claim_removed, true, "the strip is recorded, not implied");
    const artifact = (await rootQuery(
      "select claim_removed, uncertified, manifest->'claim_assessment' claim from clara.report_artifacts where id=$1",
      [sealed.report_artifact_id])).rows[0];
    assert.equal(artifact.claim_removed, true);
    assert.deepEqual(artifact.claim.status, "stripped");
    assert.deepEqual(artifact.claim.claim_removed, true);

    // The eligible pack seals too -- all three non-failed states seal.
    const eligibleSha = sha64(`eligible-${conforming.runId}`);
    const eligible = await sealArtifact(owner, { runId: conforming.runId, kind: "pre_sign",
      sha256: eligibleSha,
      manifest: await buildManifest({ runId: conforming.runId, kind: "pre_sign", sha256: eligibleSha }) });
    assert.equal(eligible.claim_status, "eligible");
    assert.equal(eligible.claim_removed, false);
    world.epsilonEligible = { ...conforming, artifactId: eligible.report_artifact_id, sha256: eligibleSha };
    world.epsilonRig = rig;
  });

  await t.test("an UNAPPROVED FORMULA refuses a pre_sign even when the layout conforms", async () => {
    // THE HOLE LANE ETA TRACED, closed and proven on a REACHABLE path -- no manufactured state.
    // A cell evaluated against a definition that is LATER superseded is exactly the shape the old
    // code mishandled: not a draft, so uncertified stayed false; not canonical/firm_approved, so
    // it mapped to `stripped` -- and stripped SEALS. A pack riding an unapproved formula could
    // therefore reach pre_sign and have an attestation bound to it.
    //
    // The composition case (definition_version_id IS NULL) is the same population and the same
    // arm; it is unreachable until lane eta's preview lane mints one, so this superseded cell is
    // the reachable member that proves the fix rather than asserting it.
    const rig = world.epsilonRig;
    const w = await buildEpsilonWorld(world, { tag: "claim-superseded", reportClass: "statutory",
      profileVersionId: rig.profileVersionId, sections: MPERS_SECTIONS, seal: false });
    const successor = await proposeMetricDefinition(await ensureEpsilonAdmin(world), {
      client: w.client, key: w.definitionKey, unit: "money",
      ast: metricAst({ root: measure({ set: "expense" }), unit: "money" }),
    });
    await approveMetricDefinition(owner, successor);
    await supersedeMetricDefinition(owner, { predecessor: w.definitionVersionId, successor });
    const sealed = await sealDataset(owner, { runId: w.runId });

    const row = await assessmentRow(w.runId);
    assert.equal(row.uncertified, true,
      "the provenance axis catches the whole not-canonical/firm_approved population, not only drafts");
    assert.equal(Number(row.check_receipt.non_statutory_cells), 1);
    assert.equal(Number(row.check_receipt.draft_definition_cells), 0, "this cell is superseded, not draft");
    assert.deepEqual(row.check_receipt.uncertified_reason_codes, ["nonstat_definition_in_dataset"]);
    // DE-CONFLATION, proven: every required section is laid out, so the PRESENTATION axis reads
    // eligible. A cell-definition problem must never masquerade as a custom cut.
    assert.equal(row.status, "eligible");
    assert.deepEqual(row.reason_codes, ["presentation_profile_checks_passed"]);
    assert.equal(sealed.claim_assessment.uncertified, true);

    const sha = sha64(`superseded-${w.runId}`);
    const refused = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "pre_sign",
      sha256: sha, manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: sha }) }));
    assert.equal(reasonOf(refused), "nonstat_definition_in_dataset",
      `an eligible-but-uncertified pack must NOT reach pre_sign: ${refused?.message}`);
    assert.match(errorDetail(refused).fix ?? "", /approve it, re-evaluate/,
      "the remedy names the approval lane, which is the only issuance path");

    // The watermarked draft still renders, so the preparer can see the pack they must fix.
    const draftSha = sha64(`superseded-wm-${w.runId}`);
    const draft = await sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
      sha256: draftSha,
      manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha }) });
    assert.equal(draft.uncertified, true);
  });

  await t.test("uncertified refuses a pre_sign and still seals a watermarked draft", async () => {
    // THE DRAFT MEMBER of the same population, and the token that names it. A draft-definition
    // cell cannot be produced through delta's PUBLIC evaluator at all -- evaluate_metric_v1
    // refuses a definition that is not canonical or firm_approved, which is design SS5's
    // lifecycle doing its job -- so the draft cell arrives only with lane ETA's preview wrapper.
    // The prestate is therefore manufactured with the append-only wall lifted, exactly as the
    // absence cell does it. The FLAG itself is proven on a reachable path in the cell above; this
    // one proves the gate picks the draft-specific token, so a preparer is not sent hunting for a
    // draft when their pack rides a composition, or vice versa.
    const rig = world.epsilonRig;
    const w = await buildEpsilonWorld(world, { tag: "claim-uncertified", reportClass: "statutory",
      profileVersionId: rig.profileVersionId, sections: MPERS_SECTIONS });
    const before = await assessmentRow(w.runId);
    assert.equal(before.uncertified, false,
      "every contributing cell is on an approved definition, so nothing is uncertified yet");

    const blocked = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true }, (db) =>
      db.query("update clara.report_claim_assessments set uncertified=true where report_run_id=$1", [w.runId])));
    assert.equal(blocked?.code, "CLR08",
      "the assessment is append-only through every product path -- the flag cannot be flipped by a caller");

    // The prestate must be CONSISTENT, not merely flagged: the seal now re-derives the population
    // at the enforcement point, so a receipt edited alone is caught as `assessment_stale` (proven
    // in its own cell below). So move the cells too -- point the run's cell at a real DRAFT
    // definition version -- and the receipt then describes reality.
    const draftVersion = await proposeMetricDefinition(await ensureEpsilonAdmin(world), {
      client: w.client, key: w.definitionKey, unit: "money",
      ast: metricAst({ root: measure({ set: "expense" }), unit: "money" }),
    });   // deliberately NOT approved: it stays `draft`
    await withTriggersOff("metric_cells", () => rootQuery(
      "update clara.metric_cells set definition_version_id=$2 where client_id=$3 and run_id=$1",
      [w.runId, draftVersion, w.client]));
    await withTriggersOff("report_claim_assessments", () => rootQuery(
      `update clara.report_claim_assessments
          set uncertified = true,
              check_receipt = jsonb_set(jsonb_set(check_receipt,
                '{draft_definition_cells}', '1'::jsonb), '{non_statutory_cells}', '1'::jsonb)
        where report_run_id = $1`, [w.runId]));

    const sha = sha64(`uncertified-${w.runId}`);
    const refused = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "pre_sign",
      sha256: sha, manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: sha }) }));
    assert.equal(reasonOf(refused), "draft_definition_in_dataset",
      `"draft never statutory" is structural, not a label: ${refused?.message}`);

    // The watermarked draft DOES seal, and carries the flag the renderer stamps every page from.
    const draftSha = sha64(`uncertified-wm-${w.runId}`);
    const draft = await sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
      sha256: draftSha,
      manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha }) });
    assert.equal(draft.uncertified, true);
    assert.equal((await rootQuery("select uncertified from clara.report_artifacts where id=$1",
      [draft.report_artifact_id])).rows[0].uncertified, true,
      "the flag is on the artifact ROW, so a renderer that loses the manifest still cannot lose it");
  });

  await t.test("a NULL-definition composition cell sets uncertified and refuses a pre_sign", async () => {
    // M19: the composition population (definition_version_id IS NULL) is the OTHER half of the
    // hole lane η traced, and it was previously unasserted -- a regression that cleared
    // `uncertified` for compositions only would have shipped green behind the superseded cell.
    // Unreachable through delta's evaluator until η's preview lane exists, so the cells and the
    // receipt are moved together, consistently, with the append-only wall lifted.
    const rig = world.epsilonRig;
    const w = await buildEpsilonWorld(world, { tag: "claim-composition", reportClass: "statutory",
      profileVersionId: rig.profileVersionId, sections: MPERS_SECTIONS });
    await withTriggersOff("metric_cells", () => rootQuery(
      "update clara.metric_cells set definition_version_id=null where client_id=$2 and run_id=$1",
      [w.runId, w.client]));
    await withTriggersOff("report_claim_assessments", () => rootQuery(
      `update clara.report_claim_assessments
          set uncertified = true,
              check_receipt = jsonb_set(jsonb_set(check_receipt,
                '{draft_definition_cells}', '0'::jsonb), '{non_statutory_cells}', '1'::jsonb)
        where report_run_id = $1`, [w.runId]));

    const sha = sha64(`composition-${w.runId}`);
    const refused = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "pre_sign",
      sha256: sha, manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: sha }) }));
    assert.equal(refused?.code, "CLR42", `SQLSTATE and token asserted together: ${refused?.message}`);
    assert.equal(reasonOf(refused), "nonstat_definition_in_dataset",
      "a cell with NO definition at all is an unapproved formula, and the token names it honestly");
    assert.match(errorDetail(refused).fix ?? "", /save the composition/,
      "and the remedy is the approval lane, which is the only issuance path");
  });

  await t.test("a claim assessment that no longer describes its cells REFUSES the seal", async () => {
    // B1: the stale-replay hole. Assess while every cell is canonical, THEN supersede through
    // delta's audited verb, then seal -- the stored row still says uncertified=false. The seal
    // re-derives at the enforcement point rather than inheriting the verdict, so the drift is
    // caught instead of minting a pre_sign over noncanonical data. Fully reachable: no lifted
    // walls, every step an audited verb.
    const rig = world.epsilonRig;
    const w = await buildEpsilonWorld(world, { tag: "claim-stale", reportClass: "statutory",
      profileVersionId: rig.profileVersionId, sections: MPERS_SECTIONS });
    const row = await assessmentRow(w.runId);
    assert.equal(row.uncertified, false, "assessed while the definition was still firm_approved");

    const successor = await proposeMetricDefinition(await ensureEpsilonAdmin(world), {
      client: w.client, key: w.definitionKey, unit: "money",
      ast: metricAst({ root: measure({ set: "expense" }), unit: "money" }),
    });
    await approveMetricDefinition(owner, successor);
    await supersedeMetricDefinition(owner, { predecessor: w.definitionVersionId, successor });

    const sha = sha64(`stale-${w.runId}`);
    const refused = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "pre_sign",
      sha256: sha, manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: sha }) }));
    assert.equal(refused?.code, "CLR42", refused?.message);
    assert.equal(reasonOf(refused), "assessment_stale",
      `a verdict is only worth what it still describes: ${refused?.message}`);
    assert.equal(Number(errorDetail(refused).current_non_statutory_cells), 1);
    assert.equal(Number(errorDetail(refused).assessed_non_statutory_cells), 0,
      "the refusal shows BOTH sides, so the reader can see what moved");
    assert.match(errorDetail(refused).fix ?? "", /re-assess/);
  });

  await t.test("delta's own lifecycle bars a draft definition from the public evaluator", async () => {
    // The other half of the same law, proven where it actually lives: epsilon never sees a draft
    // cell because delta refuses to mint one. Asserted rather than assumed, because "epsilon
    // handles draft cells" and "draft cells cannot exist yet" are different claims and a reader
    // seven years from now needs to know which one held.
    const rig = world.epsilonRig;
    const error = await caught(() => buildEpsilonWorld(world, { tag: "claim-draftbar",
      reportClass: "statutory", profileVersionId: rig.profileVersionId,
      sections: MPERS_SECTIONS, approveDefinition: false }));
    assert.match(error?.message ?? "", /not approved for this firm/i,
      `the public evaluator refuses an unapproved definition: ${error?.message}`);
  });

  await t.test("ABSENCE IS REFUSAL: a run with no assessment row seals nothing at all", async () => {
    const w = await buildEpsilonWorld(world, { tag: "claim-absent", reportClass: "management" });
    const before = await assessmentRow(w.runId);
    assert.ok(before, "the seal wrote one, as it must");
    // No product path can delete it (the append-only wall is asserted next), so the prestate is
    // manufactured as a superuser with the wall lifted -- a corruption, deliberately simulated.
    const blocked = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true },
      (db) => db.query("delete from clara.report_claim_assessments where report_run_id=$1", [w.runId])));
    assert.equal(blocked?.code, "CLR08", "the assessment is append-only through every product path");
    await withTriggersOff("report_claim_assessments", () =>
      rootQuery("delete from clara.report_claim_assessments where report_run_id=$1", [w.runId]));
    assert.equal(await assessmentRow(w.runId), null);

    for (const kind of ["draft_watermarked", "pre_sign", "signed_original"]) {
      const sha = sha64(`absent-${kind}-${w.runId}`);
      const error = await caught(() => sealArtifact(owner, { runId: w.runId, kind, sha256: sha,
        manifest: { report_spec_version_id: w.spec.report_spec_version_id } }));
      assert.equal(reasonOf(error), "claim_assessment_absent",
        `${kind}: a missing assessment refuses, it does not default: ${error?.message}`);
    }
  });

  await t.test("a run whose dataset is not sealed cannot mint any artifact", async () => {
    const w = await buildEpsilonWorld(world, { tag: "claim-unsealed", reportClass: "management", seal: false });
    assert.equal((await rootQuery("select state from clara.report_runs where id=$1", [w.runId])).rows[0].state,
      "drafting");
    const sha = sha64(`unsealed-${w.runId}`);
    const error = await caught(() => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
      sha256: sha, manifest: { any: "thing" } }));
    assert.equal(reasonOf(error), "dataset_not_sealed",
      "E-R14's persist-before-render is structural: nothing renders from an unsealed dataset");
  });

  await t.test("assess_report_claim writes ONE row per run and replays on a second call", async () => {
    const w = world.epsilonNaRun;
    const again = await assessClaim(owner, w.runId);
    assert.equal(again.replayed, true, "a second call READS the verdict, it never writes a second one");
    assert.equal(again.status, "not_applicable");
    assert.equal(Number((await rootQuery(
      "select count(*)::int n from clara.report_claim_assessments where report_run_id=$1", [w.runId])).rows[0].n), 1);
  });

  await t.test("a locale with no effective claim policy REFUSES rather than borrowing another's label", async () => {
    const w = await buildEpsilonWorld(world, { tag: "claim-locale", reportClass: "management",
      locale: "ms", seal: false });
    const error = await caught(() => assessClaim(owner, w.runId));
    assert.equal(reasonOf(error), "claim_policy_absent",
      "fail-closed: the product does not invent Malay claim wording nobody verified");
    assert.equal(errorDetail(error).locale, "ms");
    assert.match(errorDetail(error).fix ?? "", /claim-policy row for this locale/);
  });
}
