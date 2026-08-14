// Wave E lane EPSILON -- phase 4: the sealed-artifact registry. NOT a test file.
//
// Proves insert-once + blocked UPDATE/DELETE, the chain, the manifest REQUIRED-key refusal (each
// missing class named), the manifest self-bindings, the content-addressed key with no filename
// anywhere, verify_report_artifact's strict pass + tamper detection + its honest byte limit, and
// approve_report_for_issue's key-2 floor, exact-hash binding and approver-is-not-preparer rule.

import {
  assert, randomUUID, rootQuery, humanQuery, withActor, ROLES, opk,
  caught, reasonOf, errorDetail, sealArtifact, approveIssue, verifyArtifact,
  buildManifest, sha64,
} from "./epsilon-fixtures.mjs";
import { buildEpsilonWorld, artifactRows } from "./epsilon-world.mjs";

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

  await t.test("a missing manifest key is a REFUSAL that names it -- never a default", async () => {
    const classes = [
      ["the dataset pin", "dataset_sha256"],
      ["the books watermark", "books_event_sequence"],
      ["the renderer image digest", "renderer_image_digest"],
      ["the font engine version", "font_engine_version"],
      ["every font/logo/image hash", "asset_hashes"],
      ["the canonical manifest hash", "render_manifest_sha256"],
      ["the gate-3 extracted-text hash", "extracted_text_sha256"],
      ["the pinned extraction tool", "extraction_tool"],
      ["the claim-assessment receipt", "claim_assessment"],
      ["the uncertified flag", "uncertified"],
    ];
    for (const [label, key] of classes) {
      const error = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "draft_watermarked",
        sha256: draftSha,
        manifest: await buildManifest({ runId: w.runId, kind: "draft_watermarked", sha256: draftSha, omit: [key] }) }));
      assert.equal(reasonOf(error), "manifest_key_missing", `${label}: ${error?.message}`);
      assert.deepEqual(errorDetail(error).missing_keys, [key], label);
    }
    // The pre-sign hash is required for a pre_sign and NOT for a draft: the key list is
    // kind-dependent, which is the only reason a draft can seal at all.
    const presignMissing = await caught(async () => sealArtifact(owner, { runId: w.runId, kind: "pre_sign",
      sha256: presignSha,
      manifest: await buildManifest({ runId: w.runId, kind: "pre_sign", sha256: presignSha, omit: ["pre_sign_pdf_sha256"] }) }));
    assert.deepEqual(errorDetail(presignMissing).missing_keys, ["pre_sign_pdf_sha256"]);
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
