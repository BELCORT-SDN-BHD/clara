// Wave E lane EPSILON -- phase 2: claim assessment and GATE 1. NOT a test file.
//
// Proves all four ruled states and the whole gate-1 matrix: no assessment row REFUSES a
// pre_sign; `failed` REFUSES; `eligible`, `not_applicable` and `stripped` ALL SEAL; `stripped`
// records the removal on the artifact ROW and in the manifest. Plus the draft-definition arm:
// uncertified is set, and the seal refuses a pre_sign for it -- "draft never statutory" as
// structure, not as a label.

import {
  assert, rootQuery, withActor, ROLES, caught, errorDetail, assertRefusal,
  sealArtifact, sealDataset, assessClaim, approveIssue, buildManifest, sha64, MPERS_SECTIONS,
  proposeMetricDefinition, approveMetricDefinition, supersedeMetricDefinition,
  evaluateMetricHuman, randomUUID, measure, metricAst,
} from "./epsilon-fixtures.mjs";
import {
  buildEpsilonWorld, seedRigProfile, seedVerifiedWording, assessmentRow,
  artifactRows, ensureEpsilonAdmin,
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
    // THE FIXTURE IS RIG-LOCAL, and that is the whole correction. This cell used to bind the
    // SHIPPED mpers_company profile and assert it fails "because owner task #43 has landed no
    // verified wording" -- which tested whether the owner had done #43 yet, not whether epsilon
    // enforces the law. It went red the moment the wording lane seeded real rows.
    //
    // The law is: a pack whose REQUIRED wording is unverified assesses `failed` and cannot seal a
    // pre_sign. Proven here against a profile this test seeds itself and deliberately leaves
    // unworded, so it holds in every world -- before #43, after it, and after whatever the owner
    // verifies next. (Its sibling below seeds the SAME rig shape WITH verified wording and gets
    // `eligible`; the pair is the real evidence, and only one of them was written correctly.)
    const rig = await seedRigProfile("unverified");
    const w = await buildEpsilonWorld(world, { tag: "claim-failed", reportClass: "statutory",
      profileVersionId: rig.profileVersionId, sections: MPERS_SECTIONS });
    assert.equal(w.sealed.claim_assessment.status, "failed",
      "required wording that cannot be verified fails the pack, whatever else the estate has seeded");
    const row = await assessmentRow(w.runId);
    assert.deepEqual(row.reason_codes, ["required_wording_unverified"]);
    assert.equal(row.check_receipt.unverified_required_wording_keys.length, MPERS_SECTIONS.length,
      "the receipt names every required wording key it could not verify -- counted from the fixture, not pinned to a literal");

    const sha = sha64(`failed-${w.runId}`);
    const refused = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "pre_sign",
      sha256: sha, manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: sha }) }));
    assertRefusal(refused, "CLR42", "claim_assessment_failed");
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
    assertRefusal(refused, "CLR42", "nonstat_definition_in_dataset");
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
    assertRefusal(refused, "CLR42", "draft_definition_in_dataset");

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
    assertRefusal(refused, "CLR42", "nonstat_definition_in_dataset");
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
    assertRefusal(refused, "CLR42", "assessment_stale");
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
      assertRefusal(error, "CLR42", "claim_assessment_absent");
    }
  });

  await t.test("a run whose dataset is not sealed cannot mint any artifact", async () => {
    const w = await buildEpsilonWorld(world, { tag: "claim-unsealed", reportClass: "management", seal: false });
    assert.equal((await rootQuery("select state from clara.report_runs where id=$1", [w.runId])).rows[0].state,
      "drafting");
    const sha = sha64(`unsealed-${w.runId}`);
    const error = await caught(() => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
      sha256: sha, manifest: { any: "thing" } }));
    assertRefusal(error, "CLR42", "dataset_not_sealed");
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
    // THE ABSENCE IS MANUFACTURED, not borrowed. This cell used to point at ms and zh because the
    // owner had not supplied their policy rows yet -- so it tested the owner's to-do list, and the
    // moment the wording lane seeds ms/zh it would have gone red while the law it cared about was
    // still perfectly enforced. The law: a locale whose claim policy does not resolve REFUSES,
    // rather than silently rendering a compliance claim in a language nobody verified.
    //
    // EXPIRED, not deleted, and driven through the GRANTED door -- two corrections this cell
    // earned while being written. A DELETE is refused by report_claim_assessments' FK the moment
    // any earlier pack has cited the row, which is most databases. And assess_report_claim
    // resolves a human context, so it cannot be called from the fn_owner transaction that does the
    // expiring (CLR04, no authenticated actor) -- the state change and the exercise are separate
    // acts by separate principals, which is what the product does too.
    //
    // Expiry is also the truer shape: assess resolves the policy by EFFECTIVE WINDOW against the
    // run's period_start, so closing that window is exactly the "no policy is effective for this
    // locale" state the refusal exists for.
    const locale = "en";                       // the one locale guaranteed populated in every world
    const w = await buildEpsilonWorld(world, { tag: "claim-locale", reportClass: "management",
      locale, seal: false });
    const before = (await rootQuery(
      "select id, effective_to from clara.claim_policy_versions where locale = $1 order by id",
      [locale])).rows;
    assert.ok(before.length > 0, `${locale} has a policy to expire, so the refusal below is about its absence`);
    let refusal;
    try {
      await withTriggersOff("claim_policy_versions", () => rootQuery(
        "update clara.claim_policy_versions set effective_to = $2::date - 1 where locale = $1",
        [locale, w.period.period_start]));
      refusal = await caught(() => assessClaim(owner, w.runId));
    } finally {
      // Restored per row from what was read, not blanket-nulled: a locale the owner lands later
      // may carry a real end date, and a test that "restores" by inventing one is a test that
      // quietly edits reference data.
      for (const row of before) {
        await withTriggersOff("claim_policy_versions", () => rootQuery(
          "update clara.claim_policy_versions set effective_to = $2 where id = $1", [row.id, row.effective_to]));
      }
    }
    const detail = assertRefusal(refusal, "CLR10", "claim_policy_absent", locale);
    assert.equal(detail.locale, locale, "the refusal names the locale, not whichever one it fell back to");
    assert.match(detail.fix ?? "", /claim-policy row for this locale/);

    // And with the policy restored, the SAME run assesses -- without which the refusal above
    // would be consistent with a claim policy that never resolves for anybody.
    assert.equal((await assessClaim(owner, w.runId)).status, "not_applicable",
      "the policy resolves again once restored, so the refusal was about its absence");

    // NOTE: the exact per-locale lexicon census that used to live here has MOVED to the wording
    // lane's own tests, where the data it describes is maintained. An exact key census is worth
    // having -- it is what turns an unintended phrase addition into a red test rather than a
    // silent change -- but it is an assertion about THEIR seed, and a test over another lane's
    // reference data is the defect this whole cell is the fix for.
  });

  await t.test("a run evaluated AGAIN after its dataset was sealed cannot mint an artifact", async () => {
    // The counts-are-blind hole. Arm 2b re-derives draft/non-statutory COUNTS, and a second
    // APPROVED definition moves neither: 0/0 before, 0/0 after. So the assessment still reads
    // true while the dataset it describes has stopped being this run's population, and a
    // one-point dataset would seal as the pre-sign of a two-cell run. Nothing is arithmetically
    // wrong in that artifact; it simply documents a run that moved on.
    const admin = await ensureEpsilonAdmin(world);
    const w = await buildEpsilonWorld(world, { tag: "population-drift", reportClass: "management" });
    const sealedPoints = Number((await rootQuery(
      `select count(*)::int n from clara.report_dataset_points p
         join clara.report_datasets d on d.id = p.dataset_id
        where d.report_run_id=$1 and d.chart_spec_version_id is null`, [w.runId])).rows[0].n);
    assert.ok(sealedPoints >= 1, "the run sealed a dataset over the cells it had");

    // A second definition, APPROVED -- so it is invisible to every count arm 2b looks at.
    const second = await proposeMetricDefinition(admin, {
      client: w.client, key: `drift_${randomUUID().slice(0, 8)}`, unit: "money",
      ast: metricAst({ root: measure({ set: "expense" }), unit: "money" }),
    });
    await approveMetricDefinition(owner, second);
    await evaluateMetricHuman(owner, { client: w.client, definitionVersion: second,
      periodIds: [w.period.id], snapshotId: w.snapshotId, runId: w.runId });

    const assessed = await assessmentRow(w.runId);
    assert.equal(assessed.check_receipt.draft_definition_cells, 0);
    assert.equal(assessed.check_receipt.non_statutory_cells, 0);
    assert.equal(Number((await rootQuery(
      "select count(*)::int n from clara.metric_cells where run_id=$1", [w.runId])).rows[0].n),
      sealedPoints + 1, "the run now carries a cell the sealed dataset never saw");

    for (const kind of ["draft_watermarked", "pre_sign"]) {
      const sha = sha64(`drift-${kind}-${w.runId}`);
      const error = await caught(async () => sealArtifact(owner, { runId: w.runId, kind, sha256: sha,
        manifest: await buildManifest({ runId: w.runId, kind, sha256: sha }) }));
      const detail = assertRefusal(error, "CLR42", "dataset_population_stale", kind);
      assert.equal(detail.sealed_cells, sealedPoints);
      assert.equal(detail.current_cells, sealedPoints + 1);
      assert.equal(detail.cells_missing_from_dataset.length, 1,
        "and the refusal names the cell the dataset does not carry");
    }
    assert.equal((await artifactRows(w.runId)).length, 0,
      "neither kind minted a row -- a watermarked draft of a stale population is still a document");
  });

  await t.test("the seal HOLDS a lock that a concurrent supersession must wait for", async () => {
    // The TOCTOU window: re-deriving the assessment proves it true at the instant of the read,
    // and the artifact lands later in the same transaction. Without a lock shared with delta's
    // supersession path, a supersede can commit in between and the seal inserts over a verdict
    // that stopped being true mid-transaction.
    //
    // A pause cannot be injected into the function, so the property is proven from the OTHER
    // side, which is the side that matters: with the seal's transaction still open, delta's
    // supersession UPDATE against a contributing definition version must BLOCK. If it can
    // proceed, the window is open by definition.
    const w = await buildEpsilonWorld(world, { tag: "seal-lock", reportClass: "management" });
    const sha = sha64(`seal-lock-${w.runId}`);
    const manifest = await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: sha });
    const contributing = (await rootQuery(
      "select distinct definition_version_id d from clara.metric_cells where run_id=$1 and definition_version_id is not null",
      [w.runId])).rows[0].d;
    assert.ok(contributing, "the run has a contributing definition version to contend over");

    const supersedeUnderTimeout = () => caught(() =>
      withActor({ role: ROLES.fnOwner, transaction: true }, async (b) => {
        await b.query("set local lock_timeout='700ms'");
        return b.query("update clara.metric_definition_versions set state='superseded' where id=$1",
          [contributing]);
      }));

    let blocked;
    const done = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true }, async (a) => {
      await a.query(
        `select clara._seal_report_artifact_core($1,$2,$3,'draft_watermarked','pdf',$4,4096,$5::jsonb,null,$6)`,
        [world.firms.A, owner, w.runId, sha, JSON.stringify(manifest), `seal-lock-${sha.slice(0, 8)}`]);
      // A's transaction is still open here, so its FOR SHARE locks are still held.
      blocked = await supersedeUnderTimeout();
      throw new Error("rollback the seal");
    }));
    assert.match(done?.message ?? "", /rollback the seal/, "the seal transaction was rolled back");
    assert.equal(blocked?.code, "55P03",
      `a supersession racing an open seal must WAIT, not proceed: ${blocked?.code} ${blocked?.message}`);

    // THE CONTROL, without which the arm above proves only that something refused: once the
    // seal's transaction is gone, the same statement no longer times out on a lock. Whatever
    // happens to it then, it is not 55P03 -- so the block came from the seal's lock and not from
    // a standing condition on the row.
    const afterwards = await supersedeUnderTimeout();
    assert.notEqual(afterwards?.code, "55P03",
      "with no seal in flight the same UPDATE is not lock-blocked");
    assert.equal((await artifactRows(w.runId)).length, 0, "the rolled-back seal left no artifact");

    // THE ARM THE FIRST VERSION OF THIS CELL LACKED, and the gap that let a residual survive a
    // round: superseding a PRE-EXISTING contributing row is the easy half, because that row was
    // enumerated and locked. The dangerous half is a definition that BECOMES contributing while
    // the seal is in flight -- it is derived over but was never in the enumeration to be locked.
    // The run lock is what closes it: EVALUATION is the only way a new definition joins a run's
    // population, and the evaluator serializes on the same key this seal now holds.
    const w2 = await buildEpsilonWorld(world, { tag: "seal-lock-add", reportClass: "management" });
    const sha2 = sha64(`seal-lock-add-${w2.runId}`);
    const manifest2 = await buildManifest({ runId: w2.runId, kind: "draft_watermarked", sha256: sha2 });
    const newcomer = await proposeMetricDefinition(await ensureEpsilonAdmin(world), {
      client: w2.client, key: `newcomer_${randomUUID().slice(0, 8)}`, unit: "money",
      ast: metricAst({ root: measure({ set: "expense" }), unit: "money" }),
    });
    await approveMetricDefinition(owner, newcomer);

    let addBlocked;
    const done2 = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true }, async (a) => {
      await a.query(
        `select clara._seal_report_artifact_core($1,$2,$3,'draft_watermarked','pdf',$4,4096,$5::jsonb,null,$6)`,
        [world.firms.A, owner, w2.runId, sha2, JSON.stringify(manifest2), `lock-add-${sha2.slice(0, 8)}`]);
      // A holds the run lock. An evaluation into THIS run must now wait for it.
      addBlocked = await caught(() => withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true },
        async (b) => {
          await b.query("set local lock_timeout='700ms'");
          return b.query(
            "select clara.evaluate_metric_v1($1::uuid,$2::uuid,$3::uuid[],$4::uuid,$5::uuid)",
            [w2.client, newcomer, [w2.period.id], w2.snapshotId, w2.runId]);
        }));
      throw new Error("rollback the seal");
    }));
    assert.match(done2?.message ?? "", /rollback the seal/);
    assert.equal(addBlocked?.code, "55P03",
      `an evaluation joining a run mid-seal must WAIT: ${addBlocked?.code} ${addBlocked?.message}`);
  });

  await t.test("both epsilon writers hold the EVALUATOR'S key, proven by identity and by exclusion", async () => {
    // "Reproduced verbatim" is a claim about SPELLING, and spelling is not identity (review law
    // 3). Two locks that merely look alike exclude nothing, and the failure is silent: everything
    // passes, forever, while the window stays open. So the key is proven twice over, and neither
    // proof reads the migration text.
    //
    // The dataset seal needs this even more than the artifact seal, because it is the writer that
    // FREEZES the population into a digest -- and it is the one arm the previous round left
    // untested, which is exactly the shape a volunteered fix tends to have.
    const w = await buildEpsilonWorld(world, { tag: "lock-identity", reportClass: "management", seal: false });
    const expected = (await rootQuery(
      "select hashtextextended($1::uuid::text || ':' || $2::uuid::text, 0) k",
      [world.firms.A, w.runId])).rows[0].k;

    // (1) IDENTITY, read from pg_locks rather than from either body: with the dataset seal's
    // transaction open, the advisory lock the backend actually HOLDS must be the key delta's
    // evaluator computes. A 64-bit advisory key is split across classid/objid.
    let held; let evalBlocked;
    const done = await caught(() => withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true },
      async (a) => {
        await a.query("select clara.seal_report_dataset($1::uuid, null, $2)",
          [w.runId, `lock-identity-${w.runId.slice(0, 8)}`]);
        held = (await a.query(
          `select count(*)::int n from pg_locks
            where locktype='advisory' and pid=pg_backend_pid()
              and ((classid::bigint << 32) | objid::bigint) = $1::bigint`, [expected])).rows[0].n;
        // (2) EXCLUSION, the instrument that cannot be fooled by arithmetic: an evaluation into
        // this run must WAIT. If the keys differed this would sail straight through.
        evalBlocked = await caught(() => withActor({ role: ROLES.authenticated, jwtSub: owner, transaction: true },
          async (b) => {
            await b.query("set local lock_timeout='700ms'");
            return b.query("select clara.evaluate_metric_v1($1::uuid,$2::uuid,$3::uuid[],$4::uuid,$5::uuid)",
              [w.client, w.definitionVersionId, [w.period.id], w.snapshotId, w.runId]);
          }));
        throw new Error("rollback the dataset seal");
      }));
    assert.match(done?.message ?? "", /rollback the dataset seal/);
    assert.equal(held, 1,
      "seal_report_dataset holds the evaluator's OWN key -- not a key of epsilon's that resembles it");
    assert.equal(evalBlocked?.code, "55P03",
      `and an evaluation into the same run waits on it: ${evalBlocked?.code} ${evalBlocked?.message}`);
    assert.equal((await rootQuery(
      "select state from clara.report_runs where id=$1", [w.runId])).rows[0].state, "drafting",
      "the rolled-back seal left the run where it was");
  });

  await t.test("the fail-closed branches nothing else reaches are proven to refuse", async () => {
    // EV-8 for the three arms no happy path can walk into. Each is set up inside a transaction
    // that always rolls back, with the walls that make the state unreachable lifted for the
    // duration -- so the branch is exercised without the database ever holding the state.
    const w = await buildEpsilonWorld(world, { tag: "failclosed", reportClass: "management" });
    const sha = sha64(`failclosed-${w.runId}`);
    const manifest = await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: sha });

    // (a) A claim status this gate has never been taught to read. Unreachable today because the
    // CHECK admits only the four ruled states -- which is exactly why the ELSE branch would
    // otherwise never be measured, and would rot the day a fifth state is ruled.
    const unreadable = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true }, async (db) => {
      await db.query("alter table clara.report_claim_assessments disable trigger user");
      await db.query(`alter table clara.report_claim_assessments
                        drop constraint report_claim_assessments_status_check`);
      await db.query("update clara.report_claim_assessments set status='quantum' where report_run_id=$1",
        [w.runId]);
      return db.query(
        `select clara._seal_report_artifact_core($1,$2,$3,'draft_watermarked','pdf',$4,4096,$5::jsonb,null,$6)`,
        [world.firms.A, owner, w.runId, sha, JSON.stringify(manifest), `failclosed-${sha.slice(0, 8)}`]);
    }));
    assertRefusal(unreadable, "CLR42", "claim_status_unreadable", "an unruled claim status");
    assert.equal(errorDetail(unreadable).status, "quantum",
      "the refusal names the status it could not read, so the next ruling knows where to land");
    assert.equal((await assessmentRow(w.runId)).status, "not_applicable",
      "and the rolled-back transaction left the real assessment untouched");

    // (b) A run whose state SAYS sealed while its dataset row is gone. A derived state is not
    // evidence (review law 2): the gate reads the dataset row itself.
    const stranded = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true }, async (db) => {
      await db.query("alter table clara.report_dataset_points disable trigger user");
      await db.query("alter table clara.report_datasets disable trigger user");
      await db.query(`delete from clara.report_dataset_points where dataset_id in
                        (select id from clara.report_datasets where report_run_id=$1)`, [w.runId]);
      await db.query("delete from clara.report_datasets where report_run_id=$1", [w.runId]);
      return db.query(
        `select clara._seal_report_artifact_core($1,$2,$3,'draft_watermarked','pdf',$4,4096,$5::jsonb,null,$6)`,
        [world.firms.A, owner, w.runId, sha, JSON.stringify(manifest), `stranded-${sha.slice(0, 8)}`]);
    }));
    assertRefusal(stranded, "CLR42", "dataset_not_sealed", "a run that says sealed with no dataset");
    assert.equal((await rootQuery(
      "select count(*)::int n from clara.report_datasets where report_run_id=$1", [w.runId])).rows[0].n, 1,
      "and the rolled-back transaction left the real dataset in place");

    // (c) Approval before any pre-sign exists. Reachable through the granted door, so it is
    // driven through it. The approver is the firm OWNER, who holds key 2 without a grant, so the
    // capability floor and the state check both pass and the MISSING ARTIFACT is what refuses --
    // the segregation wall sits further down the body and never gets a say here.
    const early = await caught(() => approveIssue(owner, { runId: w.runId, expectedSha256: sha }));
    assertRefusal(early, "CLR42", "pre_sign_artifact_absent", "approval before any pre-sign");
    assert.equal((await rootQuery("select state from clara.report_runs where id=$1", [w.runId])).rows[0].state,
      "dataset_sealed", "the refused approval moved nothing");
  });
}
