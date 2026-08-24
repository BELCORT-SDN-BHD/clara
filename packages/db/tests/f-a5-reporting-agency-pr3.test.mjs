// F-A5 PR-3 -- the signed-original archive doors' battery, for
// migrations/UNNUMBERED_f_a5_pr3_signed_original_archive.sql.
//
// SCOPE. PR-3's real substance -- the first real seal path exercised end to end through the wake
// door, and the byte-reproduction drill against that real artifact -- is a Docker+Typst drill,
// not a `node --test` cell (this package's rig carries no rendering engine): see
// scripts/fa5-pr3-real-seal-drill.mjs (this package) and its companion engine helper
// packages/reporting-render/scripts/fa5-pr3-render-one.mjs. This file covers the two NEW human
// doors annex B.11 names (archive_signed_original, retrieve_signed_original) plus their
// differential refusals -- the part that fits the rig's own battery shape. Design of record:
// docs/plan/active/reporting-agency-design.md (v2) SS3.8, annex A.5, battery B.11.
//
// EVERY WALL IS FORCED IN BOTH POLARITIES (law 31): each refusal below has an admitting twin, and
// the two differ in exactly the term under test.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool, opk } from "./rig-helpers.mjs";
import { call, caught, errorDetail, firmIdOf, buildManifest, sha64 } from "./epsilon-fixtures.mjs";
import { sealedRun, sealArtifact, asRuntime } from "./zeta-fixtures.mjs";
import { pr2Ready, mintWake, wakeModel, RATIONALE, callWrapper } from "./f-a5-reporting-agency-pr2-fixtures.mjs";

/** THE CAPABILITY GATE -- both new doors, or neither; a partial apply is drift. */
async function pr3Ready() {
  const r = await rootQuery(
    `select to_regprocedure('clara.archive_signed_original(uuid,text,bigint,jsonb,text,text)') is not null as archive,
            to_regprocedure('clara.retrieve_signed_original(uuid)') is not null as retrieve`);
  const { archive, retrieve } = r.rows[0];
  if (!archive && !retrieve) return false;
  if (archive !== retrieve) {
    throw new Error(`F-A5 PR-3 DRIFT: archive_signed_original=${archive} retrieve_signed_original=${retrieve} -- apply the migration as a whole.`);
  }
  return true;
}

const archive = (sub, args) => call(sub, "archive_signed_original", args, { p_signature_evidence: "jsonb" });
const retrieve = (sub, runId) => call(sub, "retrieve_signed_original", [["p_report_run_id", runId]]);

const evidence = (who = "Alice Tan") => ({ kind: "wet_signature", signer_name: who, signed_at: "2026-08-24T09:00:00Z" });

let ready = false;
let pr2ready = false;
before(async () => { ready = await pr3Ready(); pr2ready = await pr2Ready(); });
after(async () => { await endPool(); });

// =================================================================================================
// ARCHIVE -- the positive path, and the chain it must land on.
// =================================================================================================
test("PR-3.1 -- archive_signed_original writes a signed_original row chained to the run's pre_sign, carrying the evidence", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const { eps } = await sealedRun("pr3-archive-happy");
  const { artifactId: presignId, sha256: presignSha } = await sealArtifact(eps, "pr3-archive-worker", "pre_sign");
  const owner = await ownerOf(eps);

  const ev = evidence();
  const signedSha = "c".repeat(64);
  const out = await archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", signedSha], ["p_byte_size", 8192],
    ["p_signature_evidence", JSON.stringify(ev)], ["p_answers_pre_sign_sha256", presignSha],
    ["p_op_key", "pr3-archive-happy-key"],
  ]);
  assert.ok(out.report_artifact_id, "archive_signed_original returns a report_artifact_id");

  const row = (await rootQuery(
    `select kind, sha256, byte_size, prior_artifact_id, manifest, directed_by, prepared_by_agent
       from clara.report_artifacts where id=$1`, [out.report_artifact_id])).rows[0];
  assert.equal(row.kind, "signed_original");
  assert.equal(row.sha256, signedSha);
  assert.equal(row.byte_size, "8192");
  assert.equal(row.prior_artifact_id, presignId, "the signed original chains DIRECTLY to the pre-sign it answers (0071's own chain law)");
  assert.equal(row.manifest.signed_original_pdf_sha256, signedSha);
  assert.deepEqual(row.manifest.signature_evidence, ev, "the evidence lands verbatim on the sealed manifest");
  assert.equal(row.manifest.pre_sign_pdf_sha256, presignSha, "the pre-sign pin the door copied forward is still the hash it answers");
  assert.equal(row.directed_by, null, "a plain human archive (no OBO) carries no director -- inherited from the run, not invented here");
  assert.equal(row.prepared_by_agent, false);
  // THIS CELL IS ALSO THE FOLD-IN WALL'S ADMITTING DIFFERENTIAL TWIN (annex A.4, S3's live gap):
  // the human door succeeds through the exact call shape PR-3.9 below proves the agent lane
  // cannot reach -- sealed_by is the wall's discriminant, not this run's prepared_by_agent, so an
  // ordinary human archive is untouched regardless of who prepared the run.
});

test("PR-3.2 -- archive_signed_original refuses when the run has no sealed pre-sign artifact yet", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const { eps } = await sealedRun("pr3-archive-no-presign"); // dataset sealed, NO artifact sealed
  const owner = await ownerOf(eps);
  const e = await caught(() => archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", "d".repeat(64)], ["p_byte_size", 1024],
    ["p_signature_evidence", JSON.stringify(evidence())], ["p_answers_pre_sign_sha256", "e".repeat(64)],
    ["p_op_key", "pr3-archive-no-presign-key"],
  ]));
  assert.equal(errorDetail(e)?.reason, "artifact_chain_break");
});

test("PR-3.3 -- archive_signed_original refuses a pre-sign hash that does not match the sealed one (differential: the matching hash succeeds)", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const { eps } = await sealedRun("pr3-archive-mismatch");
  const { sha256: presignSha } = await sealArtifact(eps, "pr3-mismatch-worker", "pre_sign");
  const owner = await ownerOf(eps);

  const wrongSha = "1".repeat(64);
  assert.notEqual(wrongSha, presignSha, "the fixture's wrong hash must actually differ from the real one");
  const e = await caught(() => archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", "2".repeat(64)], ["p_byte_size", 1024],
    ["p_signature_evidence", JSON.stringify(evidence())], ["p_answers_pre_sign_sha256", wrongSha],
    ["p_op_key", "pr3-archive-mismatch-key"],
  ]));
  assert.equal(errorDetail(e)?.reason, "artifact_hash_mismatch");

  // THE DIFFERENTIAL TWIN: the SAME run, the CORRECT hash, succeeds -- proving the refusal above
  // was about the hash disagreeing, not about this run being unarchivable at all.
  const ok = await archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", "3".repeat(64)], ["p_byte_size", 1024],
    ["p_signature_evidence", JSON.stringify(evidence())], ["p_answers_pre_sign_sha256", presignSha],
    ["p_op_key", "pr3-archive-mismatch-ok-key"],
  ]);
  assert.ok(ok.report_artifact_id);
});

test("PR-3.4 -- a second archive_signed_original on the same run refuses at the chain law (MEASURED, not assumed: this door always points at the run's pre-sign, and after the first archive the run's most-recent artifact is the signed original, so the second call's unchanged prior disagrees with it)", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const { eps } = await sealedRun("pr3-archive-twice");
  const { sha256: presignSha } = await sealArtifact(eps, "pr3-twice-worker", "pre_sign");
  const owner = await ownerOf(eps);

  const first = await archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", "4".repeat(64)], ["p_byte_size", 1024],
    ["p_signature_evidence", JSON.stringify(evidence())], ["p_answers_pre_sign_sha256", presignSha],
    ["p_op_key", "pr3-archive-twice-1"],
  ]);
  assert.ok(first.report_artifact_id);

  const e = await caught(() => archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", "5".repeat(64)], ["p_byte_size", 1024],
    ["p_signature_evidence", JSON.stringify(evidence())], ["p_answers_pre_sign_sha256", presignSha],
    ["p_op_key", "pr3-archive-twice-2"],
  ]));
  // 0071's chain check (unmodified) is what actually fires here, and it is the STRONGER proof: a
  // second signed_original is refused not because a unique index happened to trip, but because the
  // run's chain has already moved past the pre-sign this door (correctly, unchangingly) points at.
  // `uq_report_artifacts_one_signed` stays as defence-in-depth behind it -- unreachable through
  // this door's own call shape precisely because the chain law above it already closes every path
  // to a second signed_original, which is the stronger property to have measured.
  assert.equal(errorDetail(e)?.reason, "artifact_chain_break",
    `expected the chain law to refuse a second signed_original whose prior no longer matches the run's latest artifact; got ${e?.code} ${e?.message}`);
  const signedCount = (await rootQuery(
    "select count(*)::int n from clara.report_artifacts where report_run_id=$1 and kind='signed_original'",
    [eps.runId])).rows[0].n;
  assert.equal(signedCount, 1, "exactly one signed_original exists for the run after the refused second attempt");
});

// =================================================================================================
// THE FOLD-IN WALL -- A.4's human-act reservation, held mechanically by a BEFORE INSERT trigger on
// clara.report_artifacts (S3, a review finding: the wake-lane grant existed, 0116, but the wall did
// not). Exercised THROUGH THE WAKE WRAPPER on an agent-directed call, per the conductor's ruling,
// because wake_seal_report_artifact -> _seal_report_artifact_core never touches
// clara.archive_signed_original at all -- a wall inside this file's own new door would guard
// nothing. Both polarities: PR-3.9 refuses kind='signed_original'; PR-3.10, the SAME wake call
// shape, admits any OTHER kind -- proving the wall is specific to signed_original, not a blanket
// refusal of the wake lane. PR-3.1 above is this wall's admitting twin from the OTHER side (the
// human door, untouched).
// =================================================================================================
test("PR-3.9 -- wake_seal_report_artifact refuses kind='signed_original' (the fold-in wall; A.4's reservation held mechanically -- MEASURED: before this wall, this exact call was ACCEPTED on main)", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  if (!pr2ready) return t.skip("F-A5 PR-2 (the wake wrapper) not applied -- this wall is exercised THROUGH the wrapper, per the conductor's ruling");
  const { eps, world } = await sealedRun("pr3-foldin-agent");
  const { artifactId: presignId, sha256: presignSha } = await sealArtifact(eps, "pr3-foldin-worker", "pre_sign");
  const cred = await mintWake({ kind: "interactive", firm: world.firms.A, onBehalfOf: null });

  const sha = sha64("pr3-foldin-signed");
  const manifest = await buildManifest({ runId: eps.runId, kind: "signed_original", sha256: sha, presignSha256: presignSha });
  const e = await caught(() => callWrapper(cred.secret, "wake_seal_report_artifact", [
    ["p_report_run_id", eps.runId], ["p_kind", "signed_original"], ["p_key_extension", "pdf"],
    ["p_sha256", sha], ["p_byte_size", 4096], ["p_manifest", JSON.stringify(manifest)],
    ["p_prior_artifact_id", presignId], ["p_rationale", RATIONALE], ["p_model", JSON.stringify(wakeModel())],
    ["p_op_key", opk("pr3-foldin-agent")],
  ], { p_byte_size: "bigint", p_manifest: "jsonb", p_model: "jsonb" }));
  assert.equal(e?.code, "CLR04", `expected the fold-in wall's CLR04; got ${e?.code} ${e?.message}`);
  assert.equal(errorDetail(e)?.reason, "signed_original_agent_seal_forbidden",
    `expected the fold-in wall to refuse; got ${e?.code} ${e?.message}`);
  const signedCount = (await rootQuery(
    "select count(*)::int n from clara.report_artifacts where report_run_id=$1 and kind='signed_original'",
    [eps.runId])).rows[0].n;
  assert.equal(signedCount, 0, "no signed_original row exists after the refused agent-directed attempt -- the trigger fired BEFORE INSERT, not after");
});

test("PR-3.10 -- differential twin: the SAME wake wrapper sealing kind='draft_watermarked' still succeeds (the wall is specific to signed_original, not a blanket refusal of the wake lane)", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  if (!pr2ready) return t.skip("F-A5 PR-2 (the wake wrapper) not applied");
  const { eps, world } = await sealedRun("pr3-foldin-twin");
  const cred = await mintWake({ kind: "interactive", firm: world.firms.A, onBehalfOf: null });

  const sha = sha64("pr3-foldin-twin-draft");
  const manifest = await buildManifest({ runId: eps.runId, kind: "draft_watermarked", sha256: sha });
  const out = await callWrapper(cred.secret, "wake_seal_report_artifact", [
    ["p_report_run_id", eps.runId], ["p_kind", "draft_watermarked"], ["p_key_extension", "pdf"],
    ["p_sha256", sha], ["p_byte_size", 2048], ["p_manifest", JSON.stringify(manifest)],
    ["p_prior_artifact_id", null], ["p_rationale", RATIONALE], ["p_model", JSON.stringify(wakeModel())],
    ["p_op_key", opk("pr3-foldin-twin")],
  ], { p_byte_size: "bigint", p_manifest: "jsonb", p_model: "jsonb" });
  assert.ok(out.report_artifact_id, "the SAME wake call shape succeeds for a non-signed_original kind -- the term under test is kind, nothing broader");
});

// =================================================================================================
// RETRIEVE -- audited, and it regenerates nothing.
// =================================================================================================
test("PR-3.5 -- retrieve_signed_original returns the custody pointer and the evidence, never regenerating bytes", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const { eps } = await sealedRun("pr3-retrieve-happy");
  const { sha256: presignSha } = await sealArtifact(eps, "pr3-retrieve-worker", "pre_sign");
  const owner = await ownerOf(eps);
  const ev = evidence("Bob Lim");
  const signedSha = "6".repeat(64);
  await archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", signedSha], ["p_byte_size", 2048],
    ["p_signature_evidence", JSON.stringify(ev)], ["p_answers_pre_sign_sha256", presignSha],
    ["p_op_key", "pr3-retrieve-happy-archive"],
  ]);

  const out = await retrieve(owner, eps.runId);
  assert.equal(out.sha256, signedSha);
  assert.equal(out.byte_size, 2048);
  assert.equal(out.storage_key, `firms/${await firmIdOf(eps.client)}/reports/${signedSha}.pdf`);
  assert.deepEqual(out.signature_evidence, ev);
  assert.equal(out.answers_pre_sign_sha256, presignSha);
  assert.ok(!("bytes" in out) && !("pdf" in out), "the retrieval carries a pointer only -- no byte payload, nothing regenerated");
  // S4: sealed_by names the human who archived it (never the agent -- the fold-in wall makes that
  // structural); prepared_by_agent is the RUN's own provenance, surfaced so a viewer can render
  // "Clara prepared this run" without a second query.
  assert.equal(out.sealed_by, owner, "sealed_by names the archiving human");
  assert.equal(out.prepared_by_agent, false, "an ordinary sealedRun is human-prepared -- this run's own provenance, not the archiver's");
});

test("PR-3.12 -- archive_signed_original raises typed CLR10 for a NULL byte size or a blank op_key, not a raw not-null-violation (S8, both terms)", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const { eps } = await sealedRun("pr3-s8-typed");
  const { sha256: presignSha } = await sealArtifact(eps, "pr3-s8-worker", "pre_sign");
  const owner = await ownerOf(eps);

  const eByteSize = await caught(() => archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", "c".repeat(64)], ["p_byte_size", null],
    ["p_signature_evidence", JSON.stringify(evidence())], ["p_answers_pre_sign_sha256", presignSha],
    ["p_op_key", "pr3-s8-bytesize-key"],
  ]));
  assert.equal(eByteSize?.code, "CLR10", `expected CLR10, not a raw not-null-violation; got ${eByteSize?.code} ${eByteSize?.message}`);
  assert.equal(errorDetail(eByteSize)?.class, "byte_size");

  const eOpKey = await caught(() => archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", "d".repeat(64)], ["p_byte_size", 1024],
    ["p_signature_evidence", JSON.stringify(evidence())], ["p_answers_pre_sign_sha256", presignSha],
    ["p_op_key", null],
  ]));
  assert.equal(eOpKey?.code, "CLR10", `expected CLR10, not a raw not-null-violation; got ${eOpKey?.code} ${eOpKey?.message}`);
  assert.equal(errorDetail(eOpKey)?.class, "op_key");

  // THE DIFFERENTIAL TWIN IS ALREADY PR-3.1: the same shape, both fields present, succeeds.
});

test("PR-3.6 -- retrieve_signed_original returns null (and still audits) when no signed original has been archived", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const { eps } = await sealedRun("pr3-retrieve-absent");
  const owner = await ownerOf(eps);

  const before = (await rootQuery(
    "select count(*)::int n from clara.audit_log where args->>'report_run_id'=$1 and fn='retrieve_signed_original'",
    [eps.runId])).rows[0].n;
  // A MISS RETURNS NULL RATHER THAN RAISING (mirroring verify_report_artifact, 0072) -- the ONLY
  // shape under which its own audit insert can survive: `_audit` is a plain INSERT with no
  // autonomous-transaction trick, so a raise in the same call would roll its own row back too.
  // MEASURED on this rig: the first draft raised here and the "not found" audit row it claimed to
  // write never existed after the call returned.
  const out = await retrieve(owner, eps.runId);
  assert.equal(out, null, "an absent signed original is a null read, not a refusal -- so its own audit row can survive");
  const after = (await rootQuery(
    "select count(*)::int n, bool_or(args->>'outcome'='not_found_in_firm') any_not_found from clara.audit_log where args->>'report_run_id'=$1 and fn='retrieve_signed_original'",
    [eps.runId])).rows[0];
  assert.ok(after.n > before, "a refused retrieval STILL writes its audit row -- absence of a signed original is itself a fact worth keeping");
  assert.equal(after.any_not_found, true);
});

test("PR-3.7 -- retrieve_signed_original writes its audit row for a successful read too (differential: found vs not-found are both audited, distinctly)", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const { eps } = await sealedRun("pr3-retrieve-audit");
  const { sha256: presignSha } = await sealArtifact(eps, "pr3-audit-worker", "pre_sign");
  const owner = await ownerOf(eps);
  await archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", "7".repeat(64)], ["p_byte_size", 1024],
    ["p_signature_evidence", JSON.stringify(evidence())], ["p_answers_pre_sign_sha256", presignSha],
    ["p_op_key", "pr3-retrieve-audit-archive"],
  ]);
  await retrieve(owner, eps.runId);
  const found = (await rootQuery(
    "select args->>'outcome' outcome, args->>'artifact_id' artifact_id from clara.audit_log where args->>'report_run_id'=$1 and fn='retrieve_signed_original' order by at desc limit 1",
    [eps.runId])).rows[0];
  assert.equal(found.outcome, "found");
  assert.ok(found.artifact_id, "the successful-read audit row names the artifact it answered");
});

test("PR-3.11 -- retrieve_signed_original's firm-scope term does something (MF2, MUTATION M6): firm B's caller gets null for firm A's signed original, and its OWN not_found_in_firm audit row lands under firm B -- deleting `and firm_id = c.firm` at the migration would leave every OTHER cell in this file green", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const { eps, world } = await sealedRun("pr3-firmscope");
  const { sha256: presignSha } = await sealArtifact(eps, "pr3-firmscope-worker", "pre_sign");
  const owner = await ownerOf(eps);
  await archive(owner, [
    ["p_report_run_id", eps.runId], ["p_sha256", "a".repeat(64)], ["p_byte_size", 1024],
    ["p_signature_evidence", JSON.stringify(evidence())], ["p_answers_pre_sign_sha256", presignSha],
    ["p_op_key", "pr3-firmscope-archive"],
  ]);

  // THE ADMITTING TWIN IS ALREADY PR-3.5/PR-3.7: firm A's own owner retrieves this exact
  // artifact successfully. This cell is the refusing half of the SAME firm_id term -- firm B's
  // owner, asking about the SAME run id, must get nothing, not merely "a different answer" --
  // and firm B's OWN audit trail (not firm A's) must show the refusal.
  const before = (await rootQuery(
    "select count(*)::int n from clara.audit_log where args->>'report_run_id'=$1 and fn='retrieve_signed_original' and firm_id=$2",
    [eps.runId, world.firms.B])).rows[0].n;
  const out = await retrieve(world.users.dave, eps.runId);
  assert.equal(out, null, "firm B's caller must not see firm A's signed original -- a cross-firm existence oracle is exactly what this term prevents");
  const after = (await rootQuery(
    "select count(*)::int n, bool_or(args->>'outcome'='not_found_in_firm') any_not_found from clara.audit_log where args->>'report_run_id'=$1 and fn='retrieve_signed_original' and firm_id=$2",
    [eps.runId, world.firms.B])).rows[0];
  assert.ok(after.n > before, "firm B's refused retrieval still writes ITS OWN audit row, under firm B");
  assert.equal(after.any_not_found, true,
    "the audit row records not_found_in_firm -- M6 (deleting the firm_id term at the migration) would make this an ordinary miss rather than a cross-firm refusal, and every OTHER existing cell would stay green, which is exactly the blindness this cell closes");
});

// =================================================================================================
// GRANT SURFACE -- neither door is reachable by a wake or runtime role (the migration's own tail
// asserts this from the catalog; this cell forces the CALL itself, the estate's "a roster read
// proves the row absent, not the door shut" lesson applied to a fresh pair of functions).
// =================================================================================================
test("PR-3.8 -- neither signed-original door is EXECUTE-reachable by clara_runtime (a live attempt, not only a grant read)", async (t) => {
  if (!ready) return t.skip("F-A5 PR-3 not applied");
  const e1 = await caught(() => asRuntime("select clara.archive_signed_original($1,$2,$3,$4::jsonb,$5,$6)",
    [world_run_placeholder(), "8".repeat(64), 1, JSON.stringify(evidence()), "9".repeat(64), "pr3-runtime-probe-1"]));
  assert.match(String(e1?.message ?? ""), /permission denied/i);
  const e2 = await caught(() => asRuntime("select clara.retrieve_signed_original($1)", [world_run_placeholder()]));
  assert.match(String(e2?.message ?? ""), /permission denied/i);
});

/** A syntactically valid uuid with no live row -- the probe above only needs to reach the ACL
 *  check, which fires before any row lookup, so no real run is needed to prove the grant is absent. */
function world_run_placeholder() { return "00000000-0000-4000-8000-000000000000"; }

/** The world's owner (bookkeeper+) for a run built by sealedRun/buildEpsilonWorld -- both mint the
 *  run under `world.users.alice`, but the fixtures return only `eps`, so this reads the owning
 *  firm's owner back from the client the world attached. */
async function ownerOf(eps) {
  const row = (await rootQuery(
    `select m.user_id from clara.firm_memberships m
       join clara.clients c on c.firm_id=m.firm_id
      where c.id=$1 and m.role='owner' and m.status='active' and m.removed_at is null limit 1`,
    [eps.client])).rows[0];
  assert.ok(row, "the client's firm has a live owner membership");
  return row.user_id;
}
