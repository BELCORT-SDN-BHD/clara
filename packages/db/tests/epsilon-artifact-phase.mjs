// Wave E lane EPSILON -- phase 4: the sealed-artifact registry. NOT a test file.
//
// Proves insert-once + blocked UPDATE/DELETE, the chain, the manifest REQUIRED-key refusal (each
// missing class named), the manifest self-bindings, the content-addressed key with no filename
// anywhere, verify_report_artifact's strict pass + tamper detection + its honest byte limit, and
// approve_report_for_issue's key-2 floor, exact-hash binding and approver-is-not-preparer rule.

import {
  assert, randomUUID, rootQuery, humanQuery, withActor, ROLES, opk,
  caught, reasonOf, errorDetail, assertRefusal, sealArtifact, approveIssue, verifyArtifact,
  buildManifest, sha64, MPERS_SECTIONS,
} from "./epsilon-fixtures.mjs";
import { buildEpsilonWorld, artifactRows, profileVersion } from "./epsilon-world.mjs";

async function withTriggersOff(table, fn) {
  await rootQuery(`alter table clara.${table} disable trigger user`);
  try { return await fn(); } finally {
    await rootQuery(`alter table clara.${table} enable trigger user`);
  }
}

export async function registerArtifactPhase(t, world) {
  const owner = world.users.alice;
  const w = await buildEpsilonWorld(world, { tag: "artifact", reportClass: "management" });
  const draftSha = sha64(`art-draft-${w.runId}`);
  const presignSha = sha64(`art-presign-${w.runId}`);

  await t.test("EVERY required manifest key is refused when missing -- the matrix is the DB's own list", async () => {
    // Driven off clara._report_manifest_required_keys rather than a hand-picked sample: a
    // sample proves the ten keys somebody thought of, and the twenty-two it omitted are exactly
    // where a silently-dropped requirement would live. Reading the list here also means a key
    // added later is covered the day it is added, without anyone remembering to extend a test.
    const required = (await rootQuery(
      "select clara._report_manifest_required_keys($1) k", ["draft_watermarked"])).rows[0].k;
    assert.equal(required.length, 32, "the draft key list is the 32 the design pinned");
    for (const key of required) {
      const error = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
        sha256: draftSha,
        manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha, omit: [key] }) }));
      assert.equal(error?.code, "CLR42", `omitting ${key}: ${error?.code} ${error?.message}`);
      assert.equal(reasonOf(error), "manifest_key_missing", `omitting ${key}: ${error?.message}`);
      assert.deepEqual(errorDetail(error).missing_keys, [key], `omitting ${key} names ${key}`);
    }
    // The kind-dependent keys, each on its own kind. A draft can seal at all only because the
    // list is kind-dependent, so this is where that branching earns its keep.
    for (const [kind, sha, extraKeys] of [
      ["pre_sign", presignSha, ["pre_sign_pdf_sha256"]],
      ["signed_original", sha64(`art-signed-${w.runId}`),
        ["pre_sign_pdf_sha256", "signed_original_pdf_sha256", "signature_evidence"]],
    ]) {
      const kindKeys = (await rootQuery("select clara._report_manifest_required_keys($1) k", [kind])).rows[0].k;
      assert.deepEqual(kindKeys.filter((k) => !required.includes(k)).sort(), [...extraKeys].sort(),
        `${kind} adds exactly its own evidence keys`);
      for (const key of extraKeys) {
        const error = await caught(async () => sealArtifact(owner, { runId: w.runId, kind,
          sha256: sha,
          manifest: await buildManifest({ runId: w.runId, kind, sha256: sha, presignSha256: presignSha, omit: [key] }) }));
        assert.equal(error?.code, "CLR42", `${kind} omitting ${key}: ${error?.message}`);
        assert.deepEqual(errorDetail(error).missing_keys, [key], `${kind} omitting ${key}`);
      }
    }
    assert.equal((await artifactRows(w.runId)).length, 0, "not one refused attempt left a row behind");
  });

  await t.test("a NULL at a required manifest key is refused -- presence is not evidence", async () => {
    // The other half of the same wall, and the one a presence check cannot see: a manifest that
    // carries `extracted_text_sha256: null` HAS the key and considered the question, then
    // recorded nothing. Sealing over that is sealing over evidence of nothing.
    const shaped = (await rootQuery(
      `select k, clara._report_manifest_key_shape(k) shape
         from unnest(clara._report_manifest_required_keys('draft_watermarked')) k
        where clara._report_manifest_key_shape(k) <> 'db_derived' order by k`)).rows;
    assert.ok(shaped.length >= 20,
      `the render side attests ${shaped.length} keys in its own right, and every one is shape-enforced`);
    for (const { k, shape } of shaped) {
      const error = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
        sha256: draftSha,
        manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha,
          overrides: { [k]: null } }) }));
      assert.equal(error?.code, "CLR42", `null at ${k}: ${error?.code} ${error?.message}`);
      assert.equal(reasonOf(error), "manifest_evidence_invalid", `null at ${k}: ${error?.message}`);
      assert.equal(errorDetail(error).key, k, `the refusal names ${k}`);
      assert.equal(errorDetail(error).expected, shape, `the refusal names the expected shape of ${k}`);
    }
    // And the wrong SHAPE at the right key, one per shape family -- a null is not the only way
    // to attest nothing.
    for (const [label, key, value] of [
      ["a truncated digest", "extracted_text_sha256", "abc123"],
      ["an uppercase digest", "render_manifest_sha256", sha64("x").toUpperCase()],
      ["a blank version pin", "node_version", "   "],
      ["a stringified map", "asset_hashes", "logo=abc"],
      ["an empty evaluator list", "evaluator_versions", []],
      ["a stringified flag", "uncertified", "false"],
      ["a bare digest where an image reference belongs", "renderer_image_digest", "not-a-digest"],
    ]) {
      const error = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
        sha256: draftSha,
        manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha,
          overrides: { [key]: value } }) }));
      assert.equal(reasonOf(error), "manifest_evidence_invalid", `${label}: ${error?.message}`);
      assert.equal(errorDetail(error).key, key, label);
    }
    // signature_evidence is the one key whose whole purpose is to be evidence, so an EMPTY
    // object is refused where an empty map elsewhere would be lawful.
    const signedSha = sha64(`art-empty-evidence-${w.runId}`);
    const empty = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "signed_original",
      sha256: signedSha,
      manifest: await buildManifest({ runId: w.runId, kind: "signed_original", sha256: signedSha,
        presignSha256: presignSha, overrides: { signature_evidence: {} } }) }));
    assert.equal(reasonOf(empty), "manifest_evidence_invalid", empty?.message);
    assert.equal(errorDetail(empty).key, "signature_evidence", empty?.message);
    assert.equal((await artifactRows(w.runId)).length, 0, "not one refused attempt left a row behind");
  });

  await t.test("the DB-owned pins are RE-DERIVED at seal, not carried on trust", async () => {
    // Presence and shape both pass here; what fails is the value. A manifest may name a real
    // profile version beside a fabricated hash for it, and its own self-hash would cover the
    // fabrication exactly as faithfully as the truth.
    const pins = (await rootQuery("select clara._report_render_pins_v1($1) p", [w.runId])).rows[0].p;
    const derived = Object.keys(pins);
    assert.ok(derived.includes("statutory_profile_sha256") && derived.includes("house_style_sha256")
      && derived.includes("chart_spec_sha256") && derived.includes("statutory_wording_sha256"),
      "the four hashes codex named as fabricable are among the re-derived");
    for (const key of derived) {
      // A value of the right shape and the wrong content, per key.
      const forged = key.endsWith("_sha256") ? sha64(`forged-${key}`)
        : key === "chart_spec_version_ids" ? [randomUUID()]
        : randomUUID();
      if (pins[key] === forged) continue;
      const error = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
        sha256: draftSha,
        manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha,
          overrides: { [key]: forged } }) }));
      assert.equal(error?.code, "CLR42", `forging ${key}: ${error?.code} ${error?.message}`);
      assert.equal(reasonOf(error), "manifest_binding_mismatch", `forging ${key}: ${error?.message}`);
      assert.ok((errorDetail(error).keys ?? []).includes(key),
        `the refusal names ${key} among the disagreeing pins`);
    }
    assert.equal((await artifactRows(w.runId)).length, 0, "not one refused attempt left a row behind");
  });

  await t.test("the manifest must BIND this run's own pinned inputs, and disagreement refuses", async () => {
    const cases = [
      ["a foreign dataset id", { dataset_id: randomUUID() }, "manifest_binding_mismatch"],
      ["a wrong dataset hash", { dataset_sha256: sha64("wrong") }, "manifest_binding_mismatch"],
      ["a foreign books snapshot", { books_snapshot_id: randomUUID() }, "manifest_binding_mismatch"],
      ["a foreign spec version", { report_spec_version_id: randomUUID() }, "manifest_binding_mismatch"],
      ["a claim status the DB never assessed", { claim_assessment: { id: randomUUID(), status: "eligible", claim_removed: false } }, "claim_manifest_mismatch"],
      ["a flipped uncertified flag", { uncertified: true }, "claim_manifest_mismatch"],
    ];
    for (const [label, overrides, reason] of cases) {
      const error = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
        sha256: draftSha,
        manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha, overrides }) }));
      assert.equal(reasonOf(error), reason, `${label}: ${error?.message}`);
    }
    // A tampered canonical hash: the manifest no longer hashes to what it says it does.
    const good = await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha });
    const tampered = await caught(() => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
      sha256: draftSha, manifest: { ...good, render_manifest_sha256: sha64("lie") } }));
    assert.equal(reasonOf(tampered), "manifest_binding_mismatch");
    const restated = await caught(() => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
      sha256: draftSha, manifest: { ...good, timezone: "UTC" } }));
    assert.equal(reasonOf(restated), "manifest_binding_mismatch",
      "changing ANY key without restating the canonical hash breaks the self-binding");
  });

  await t.test("artifacts seal, chain to their predecessor, and are insert-once thereafter", async () => {
    const draft = await sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked", sha256: draftSha,
      manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha }) });
    assert.equal(draft.storage_key, `firms/${world.firms.A}/reports/${draftSha}.pdf`);

    const orphan = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "pre_sign",
      sha256: presignSha, prior: null,
      manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: presignSha }) }));
    assert.equal(reasonOf(orphan), "artifact_chain_break",
      "only the FIRST artifact of a run claims the no-predecessor exemption");
    assert.equal(errorDetail(orphan).expected_prior, draft.report_artifact_id);

    const presign = await sealArtifact(owner, { runId: w.runId, kind: "pre_sign", sha256: presignSha,
      prior: draft.report_artifact_id,
      manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: presignSha }) });
    assert.equal(presign.kind, "pre_sign");

    const second = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "pre_sign",
      sha256: sha64("second-presign"), prior: presign.report_artifact_id,
      manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: sha64("second-presign") }) }));
    assert.equal(second?.code, "23505", `one pre_sign per run: ${second?.message}`);

    // The ONLY caller-supplied part of a storage key is the extension, and it is a two-value
    // enumeration -- so there is no text a user or a model can put into the path at all.
    const badExtension = await caught(async () => sealArtifact(owner, { runId: w.runId,
      kind: "draft_watermarked", sha256: sha64("ext"), keyExtension: "exe", prior: presign.report_artifact_id,
      manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: sha64("ext") }) }));
    assert.equal(badExtension?.code, "23514", `an arbitrary extension is refused: ${badExtension?.message}`);

    const rows = await artifactRows(w.runId);
    assert.deepEqual(rows.map((r) => [r.kind, r.prior_artifact_id]),
      [["draft_watermarked", null], ["pre_sign", draft.report_artifact_id]]);
    world.epsilonArtifact = { ...w, draftId: draft.report_artifact_id,
      presignId: presign.report_artifact_id, presignSha };
  });

  await t.test("a sealed artifact is never updated, never deleted, never truncated", async () => {
    const { presignId } = world.epsilonArtifact;
    const before = (await rootQuery("select * from clara.report_artifacts where id=$1", [presignId])).rows[0];
    for (const [sql, label] of [
      ["update clara.report_artifacts set sha256=repeat('b',64) where id=$1", "rewrite the hash"],
      ["update clara.report_artifacts set manifest='{}'::jsonb where id=$1", "empty the manifest"],
      ["update clara.report_artifacts set claim_removed=not claim_removed where id=$1", "flip the strip flag"],
      ["delete from clara.report_artifacts where id=$1", "delete the row"],
    ]) {
      const error = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true },
        (db) => db.query(sql, [presignId])));
      assert.equal(error?.code, "CLR08", `${label}: ${error?.message}`);
    }
    assert.deepEqual((await rootQuery("select * from clara.report_artifacts where id=$1", [presignId])).rows[0],
      before, "the registry is byte-identical after every refused attempt");
  });

  await t.test("a signed original requires this run's pre-sign and binds both hashes", async () => {
    const { runId, presignId, presignSha } = world.epsilonArtifact;
    const signedSha = sha64(`signed-${runId}`);
    const wrongPresign = await caught(async () => sealArtifact(owner, { runId, kind: "signed_original",
      sha256: signedSha, prior: presignId,
      manifest: await buildManifest({ runId, kind: "signed_original", sha256: signedSha,
        presignSha256: sha64("not-the-presign") }) }));
    assert.equal(reasonOf(wrongPresign), "manifest_binding_mismatch");

    const signed = await sealArtifact(owner, { runId, kind: "signed_original", sha256: signedSha,
      prior: presignId,
      manifest: await buildManifest({ runId, kind: "signed_original", sha256: signedSha,
        presignSha256: presignSha }) });
    assert.equal(signed.kind, "signed_original");
    assert.equal((await artifactRows(runId)).length, 3);
  });

  await t.test("verify_report_artifact passes strictly, then CATCHES a corrupted manifest", async () => {
    const { presignId } = world.epsilonArtifact;
    const clean = await verifyArtifact(owner, presignId);
    assert.equal(clean.verified, true, JSON.stringify(clean.diffs));
    assert.deepEqual(clean.diffs, []);
    assert.equal(clean.byte_reproduction, "unverified_by_this_function",
      "the DB half never claims a byte result it cannot have");
    assert.match(clean.byte_reproduction_note, /produced outside the database/i);
    assert.match(clean.byte_reproduction_note, /render lane|double-render|DR/i);

    // The corruption is manufactured with the append-only wall lifted, because no product path
    // can produce it -- which is exactly why a verifier exists at all. A restored backup or a
    // hand-edited row is the real-world shape of this.
    const trueHash = (await rootQuery(
      "select encode(dataset_sha256,'hex') h from clara.report_datasets where report_run_id=$1 and chart_spec_version_id is null",
      [world.epsilonArtifact.runId])).rows[0].h;
    const setDatasetHash = (value) => withTriggersOff("report_artifacts", () => rootQuery(
      "update clara.report_artifacts set manifest=jsonb_set(manifest,'{dataset_sha256}',to_jsonb($2::text)) where id=$1",
      [presignId, value]));
    await setDatasetHash(sha64("corrupt"));
    try {
      const dirty = await verifyArtifact(owner, presignId);
      assert.equal(dirty.verified, false);
      const terms = dirty.diffs.map((d) => d.term).sort();
      assert.ok(terms.includes("manifest.dataset_sha256"), JSON.stringify(terms));
      assert.ok(terms.includes("render_manifest_sha256"),
        "a manifest edit also breaks the canonical self-hash, so one tamper trips two reads");
      assert.equal(dirty.byte_reproduction, "unverified_by_this_function",
        "even on a failure the byte claim stays honest");
    } finally {
      await setDatasetHash(trueHash);
    }
    assert.equal((await verifyArtifact(owner, presignId)).verified, true, "restored");
  });

  await t.test("every verification leaves an audit row -- including the one that found corruption", async () => {
    // A verification that leaves no trace is not evidence that anyone verified. Who asked, about
    // what, and what the answer was, are the facts a later reader needs -- most of all when the
    // answer was "corrupt".
    const { presignId, runId } = world.epsilonArtifact;
    const before = Number((await rootQuery(
      "select count(*)::int n from clara.audit_log where fn='verify_report_artifact'")).rows[0].n);
    await verifyArtifact(owner, presignId);
    const pass = (await rootQuery(
      `select actor, args from clara.audit_log where fn='verify_report_artifact'
        order by id desc limit 1`)).rows[0];
    assert.equal(pass.actor, owner, "the audit row names WHO asked");
    assert.equal(pass.args.artifact_id, presignId);
    assert.equal(pass.args.report_run_id, runId);
    assert.equal(pass.args.verified, true, "and what the answer was");
    assert.equal(pass.args.diff_count, 0);

    // The corrupt answer is audited with the same fidelity, naming the terms that disagreed.
    const trueHash = (await rootQuery(
      "select encode(dataset_sha256,'hex') h from clara.report_datasets where report_run_id=$1 and chart_spec_version_id is null",
      [runId])).rows[0].h;
    const setDatasetHash = (value) => withTriggersOff("report_artifacts", () => rootQuery(
      "update clara.report_artifacts set manifest=jsonb_set(manifest,'{dataset_sha256}',to_jsonb($2::text)) where id=$1",
      [presignId, value]));
    await setDatasetHash(sha64("audit-corrupt"));
    try {
      await verifyArtifact(owner, presignId);
      const fail = (await rootQuery(
        `select args from clara.audit_log where fn='verify_report_artifact'
          order by id desc limit 1`)).rows[0].args;
      assert.equal(fail.verified, false, "a detected corruption is recorded as one");
      assert.ok(fail.diff_count > 0);
      assert.ok(fail.diff_terms.includes("manifest.dataset_sha256"),
        `the row names which terms disagreed: ${JSON.stringify(fail.diff_terms)}`);
    } finally {
      await setDatasetHash(trueHash);
    }

    // And an artifact this firm cannot see: the receipt is null either way, so auditing the
    // attempt leaks nothing and records a read worth having a record of.
    assert.equal(await verifyArtifact(owner, randomUUID()), null);
    const missing = (await rootQuery(
      `select args from clara.audit_log where fn='verify_report_artifact' order by id desc limit 1`)).rows[0].args;
    assert.equal(missing.outcome, "not_found_in_firm");

    const after = Number((await rootQuery(
      "select count(*)::int n from clara.audit_log where fn='verify_report_artifact'")).rows[0].n);
    assert.equal(after - before, 3, "three verifications, three rows -- none of them silent");
  });

  await t.test("a JSON null on the two statutory-profile keys is licensed by CLASS, not tolerated", async () => {
    // The collision worth naming: ck_rtv_statutory_profile FORCES statutory_profile_version_id
    // null for a management template, and V5 rules a JSON null a positive statement of "none" --
    // so a blanket non-null rule on those keys would make every management pack unsealable,
    // including the watermarked-draft preview path, which is management-class by construction.
    //
    // Both rules hold at once because the CHECK is a BICONDITIONAL: class and profile-presence
    // are the same fact, so re-deriving the pin from the template answers the class question by
    // reading the data. These three cells are that claim, measured.
    const profileKeys = ["statutory_profile_version_id", "statutory_profile_sha256"];
    const biconditional = (await rootQuery(
      `select count(*)::int n from clara.report_template_versions
        where (report_class='statutory') <> (statutory_profile_version_id is not null)`)).rows[0].n;
    assert.equal(biconditional, 0,
      "every template version on this database agrees class with profile-presence, so the licence is structural");

    // (1) A MANAGEMENT pack whose profile keys are null SEALS. This is the cell that would have
    // gone red on a blanket non-null rule, and with it every draft preview in the product.
    const mgmt = await buildEpsilonWorld(world, { tag: "null-licence-mgmt", reportClass: "management" });
    const mgmtPins = (await rootQuery("select clara._report_render_pins_v1($1) p", [mgmt.runId])).rows[0].p;
    for (const key of profileKeys) {
      assert.equal(mgmtPins[key], null, `the DB itself says a management pack has no ${key}`);
    }
    const mgmtSha = sha64(`null-licence-mgmt-${mgmt.runId}`);
    const sealed = await sealArtifact(owner, { runId: mgmt.runId, kind: "draft_watermarked", sha256: mgmtSha,
      manifest: await buildManifest({ runId: mgmt.runId, kind: "draft_watermarked", sha256: mgmtSha }) });
    assert.ok(sealed.report_artifact_id, "a management pack seals with both profile keys null");
    const sealedManifest = (await rootQuery("select manifest m from clara.report_artifacts where id=$1",
      [sealed.report_artifact_id])).rows[0].m;
    for (const key of profileKeys) {
      assert.ok(key in sealedManifest, `${key} is PRESENT -- the key is required whatever the class`);
      assert.equal(sealedManifest[key], null, `and null, which is what "this pack has no profile" looks like`);
    }

    // (2) A STATUTORY pack with those keys nulled REFUSES. The class is what licensed the none,
    // and this pack does not have it.
    const mpers = await profileVersion("mpers_company", 1);
    const stat = await buildEpsilonWorld(world, { tag: "null-licence-stat", reportClass: "statutory",
      profileVersionId: mpers, sections: MPERS_SECTIONS });
    const statPins = (await rootQuery("select clara._report_render_pins_v1($1) p", [stat.runId])).rows[0].p;
    for (const key of profileKeys) {
      assert.notEqual(statPins[key], null, `the DB says a statutory pack HAS a ${key}`);
    }
    const statSha = sha64(`null-licence-stat-${stat.runId}`);
    const nulled = await caught(async () => sealArtifact(owner, { runId: stat.runId, kind: "draft_watermarked",
      sha256: statSha,
      manifest: await buildManifest({ runId: stat.runId, kind: "draft_watermarked", sha256: statSha,
        overrides: { statutory_profile_version_id: null, statutory_profile_sha256: null } }) }));
    const detail = assertRefusal(nulled, "CLR42", "manifest_binding_mismatch", "a statutory pack claiming no profile");
    assert.deepEqual([...detail.keys].sort(), [...profileKeys].sort(),
      "and the refusal names both keys, so the render side is told exactly what to carry");

    // (3) The mirror: a MANAGEMENT pack whose manifest claims a profile. Refused for the same
    // reason and by the same read -- the DB says null and the manifest says otherwise.
    const claimed = await caught(async () => sealArtifact(owner, { runId: mgmt.runId, kind: "draft_watermarked",
      sha256: sha64(`null-licence-claim-${mgmt.runId}`),
      manifest: await buildManifest({ runId: mgmt.runId, kind: "draft_watermarked",
        sha256: sha64(`null-licence-claim-${mgmt.runId}`),
        overrides: { statutory_profile_version_id: mpers } }) }));
    assertRefusal(claimed, "CLR42", "manifest_binding_mismatch", "a management pack claiming a profile");
    // And the template that would make such a pack lawful cannot be published at all -- the
    // biconditional is enforced statically, so this is a wall in front of a wall.
    assert.equal(biconditional, 0);
  });

  await t.test("issue is a key-2 act, binds the EXACT hash, and the approver is not the preparer", async () => {
    const { runId, presignSha, presignId } = world.epsilonArtifact;
    const bob = world.users.bob;

    const noKey = await caught(() => approveIssue(bob, { runId, expectedSha256: presignSha }));
    assert.equal(noKey?.code, "CLR04", noKey?.message);
    assert.equal(reasonOf(noKey), "capability_required");
    assert.equal(errorDetail(noKey).capability, "close_and_attest");

    // alice is the firm OWNER, so _has_capability answers yes without a grant -- and she is also
    // the preparer, which is the wall this cell is really about (firm A has >= 2 eligible humans).
    const selfApproval = await caught(() => approveIssue(owner, { runId, expectedSha256: presignSha }));
    assert.equal(selfApproval?.code, "CLR05", selfApproval?.message);
    assert.equal(reasonOf(selfApproval), "report_issue_segregation_violation");
    assert.equal(errorDetail(selfApproval).requested_by, owner);

    // The grant rides its own audited verb (owner-literal floor), never a direct insert.
    await humanQuery(owner,
      "select clara.grant_firm_capability(p_user => $1, p_capability => 'close_and_attest', p_reason => $2, p_op_key => $3) r",
      [bob, "epsilon battery: key 2 for the checker", opk("eps-key2")]);

    const wrongHash = await caught(() => approveIssue(bob, { runId, expectedSha256: sha64("other") }));
    assert.equal(reasonOf(wrongHash), "artifact_hash_mismatch",
      "an approval that names other bytes is an approval of another document");
    assert.equal(errorDetail(wrongHash).sealed_sha256, presignSha);

    const noReason = await caught(() => approveIssue(bob, { runId, expectedSha256: presignSha, reason: "  " }));
    assert.equal(reasonOf(noReason), "issue_reason_required");

    const issued = await approveIssue(bob, { runId, expectedSha256: presignSha });
    assert.equal(issued.issue_mode, "two_person");
    assert.equal(issued.issued_artifact_id, presignId);
    const run = (await rootQuery("select * from clara.report_runs where id=$1", [runId])).rows[0];
    assert.deepEqual([run.state, run.issued_by, run.issued_artifact_id],
      ["issued", bob, presignId]);
    assert.ok(run.issued_at, "the issue is stamped");

    const again = await caught(() => approveIssue(bob, { runId, expectedSha256: presignSha }));
    assert.equal(reasonOf(again), "report_run_state_illegal", "a run is issued once");
  });

  await t.test("the BYTE SEALER is a preparer too, even when someone else opened the run", async () => {
    // The cell above uses one human as both requested_by and sealed_by, so deleting the
    // `sealed_by` half of the segregation test would leave it green -- and a person who produced
    // the bytes could then approve another preparer's run. This cell separates the two
    // identities: alice opens the run, BOB seals the pre-sign, and bob (who holds key 2 from the
    // cell above) must still be refused.
    const bob = world.users.bob;
    const solo = await buildEpsilonWorld(world, { tag: "sealer-checker", reportClass: "management" });
    const sha = sha64(`sealer-presign-${solo.runId}`);
    const sealed = await sealArtifact(bob, { runId: solo.runId, kind: "pre_sign", sha256: sha,
      manifest: await buildManifest({ runId: solo.runId, kind: "pre_sign", sha256: sha }) });
    const row = (await rootQuery(
      `select r.requested_by, a.sealed_by from clara.report_artifacts a
         join clara.report_runs r on r.id = a.report_run_id where a.id = $1`,
      [sealed.report_artifact_id])).rows[0];
    assert.notEqual(row.sealed_by, row.requested_by,
      "the two preparer identities are genuinely different in this cell -- otherwise it proves nothing");
    assert.equal(row.sealed_by, bob, "bob produced the bytes");

    const error = await caught(() => approveIssue(bob, { runId: solo.runId, expectedSha256: sha }));
    assert.equal(error?.code, "CLR05", error?.message);
    assert.equal(reasonOf(error), "report_issue_segregation_violation", error?.message);
    assert.equal(errorDetail(error).sealed_by, bob,
      "and the refusal names the SEALER as the disqualifying identity, not the opener");
    assert.equal((await rootQuery("select state from clara.report_runs where id=$1", [solo.runId])).rows[0].state,
      "dataset_sealed", "the refused approval moved nothing");
  });

  await t.test("a run's identity is immutable and its state never moves backwards", async () => {
    const { runId } = world.epsilonArtifact;
    for (const [sql, label] of [
      ["update clara.report_runs set state='drafting' where id=$1", "rewind to drafting"],
      ["update clara.report_runs set requested_by=issued_by where id=$1", "rewrite the preparer"],
      ["delete from clara.report_runs where id=$1", "delete the run"],
    ]) {
      const error = await caught(() => withActor({ role: ROLES.fnOwner, transaction: true },
        (db) => db.query(sql, [runId])));
      assert.equal(error?.code, "CLR08", `${label}: ${error?.message}`);
    }
  });
}
