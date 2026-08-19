// Extraction slice X1 (migration 0022) — clara.request_reextraction, the ADMISSION half.
//
// WHY THIS VERB EXISTS AT ALL, in one paragraph, because it is what the cells are testing:
// there was no re-extraction path anywhere in migrations 0001..0021. `enqueue_invoice_facts`
// short-circuits with `already_completed` the moment a done extraction exists
// (0016:3436-3443), no add-region verb was ever built, and clara_runtime holds SELECT only
// on the extraction tables. So a corrected mapper reached ONLY documents extracted after it
// deployed — including, absurdly, not the Gate-P vehicle itself. That is FATAL 1 of
// docs/plan/research/wave-b/gate-p-build-refused-2026-07-27.md and the reason the naive
// Gate-P build closed nothing.
//
// The cells below drive the verb through the DATABASE as a real firm member and read the
// committed rows back. The SETTLEMENT half — supersession, the authoritative pointer, and
// what happens to a draft mid-review — lives in x1-supersede.test.mjs.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, CLR, rootQuery, roleQuery, opk, endPool, buildWorld, assertRaises, firmOf,
  has0022, fail0022, requestReextraction, extractedDoc, laneTasks, auditArgs, holdThenContend,
} from "./x1-helpers.mjs";
import { grantPurpose, activatePurpose, consentEvidenceDoc } from "./wave-b/wb-0020-helpers.mjs";

// F-A1 PR-3 CUTOVER (UNNUMBERED_f_a1_cutover.sql, design D7/D9): request_reextraction's
// invoice-shaped-document arm now mints llm_witness -- its OWN version_n counter, its OWN
// engine literal -- never invoice_facts (no dual-run). Every cell below that reads back the
// MINTED task now reads the llm_witness lane specifically; extractedDoc's own fixture task
// stays on invoice_facts (it is the LEGACY population the re-extraction targets), so a cell
// that wants "everything on this document" reads both lanes explicitly rather than relying on
// laneTasks' invoice_facts default.
const WITNESS_ENGINE_ID = "llm-openai:gpt-5.6-terra:v1";

let W = null;
let live = false;

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  live = await has0022();
  if (live) W = await buildWorld();
});
after(async () => { await endPool(); });

const gate = () => fail0022(live);

// ===========================================================================

test("[0022/F-A1 PR-3] a bookkeeper re-extracts an already-extracted document: a NEW queued task on the llm_witness lane, its own version 1", async () => {
  gate();
  const client = W.clients.A1;
  const doc = await extractedDoc(W.users.alice, { client });
  const before_ = await laneTasks(doc.documentId);
  assert.equal(before_.length, 1, "the fixture settled exactly one invoice_facts task (mandatory setup)");
  assert.equal(before_[0].status, "done", "…and it is done — the population `already_completed` locks out");
  const beforeWitness = await laneTasks(doc.documentId, "llm_witness");
  assert.equal(beforeWitness.length, 0, "no llm_witness task exists yet (mandatory setup)");

  const res = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "the total read 1,350.00 but the document says 1,530.00",
    opKey: opk("rex"),
  });
  assert.equal(res.document_id, doc.documentId, "the receipt names the document");
  assert.equal(res.status, "queued", "…and a QUEUED task, not a short-circuit receipt");
  assert.equal(res.reused, false, "…genuinely minted, not recovered");
  // F-A1 PR-3 (D7): the mint targets llm_witness, a lane this document has never carried a
  // task on before -- its OWN version counter starts at 1, independent of the invoice_facts
  // lane's own count.
  assert.equal(res.version_n, 1, "the llm_witness lane's own version counter starts at 1");

  const after_ = await laneTasks(doc.documentId);
  assert.equal(after_.length, 1, "the invoice_facts lane is untouched by the re-extraction");
  const afterWitness = await laneTasks(doc.documentId, "llm_witness");
  assert.equal(afterWitness.length, 1, "exactly one llm_witness task now exists");
  const fresh = afterWitness.find((t) => t.id === res.task_id);
  assert.equal(fresh.status, "queued", "the committed row is queued");
  assert.equal(fresh.engine_id, WITNESS_ENGINE_ID,
    "…on the SAME engine literal the cutover router mints — a re-extraction and a first extraction now buy the identical product");
  assert.equal(fresh.error_code, null, "…and carries no error code");

  // The prior extraction is untouched until the NEW one settles: re-extraction is a
  // request, not a retraction. Nothing about the current evidence changes at this point.
  // (Counted over the invoice_facts chain only. Under the original kind-blind 0017 trigger
  // the fixture's PRIMARY OCR extraction was cross-kind-superseded the moment the facts
  // extraction landed; since 0089's kind-scoped recut the OCR row stays unsuperseded.
  // Either way this count reads the invoice_facts kind alone, so the assertion is
  // regime-independent — comment trued at PR-1 assembly.)
  const live = await rootQuery(
    `select count(*)::int n from clara.document_extractions
      where document_id=$1 and engine_kind='invoice_facts' and superseded_by is not null`,
    [doc.documentId]);
  assert.equal(live.rows[0].n, 0, "no extraction is superseded merely by ASKING for a re-extraction");
});

test("[0022] the audit row carries the reason, the lane, the version and the human", async () => {
  gate();
  const client = W.clients.A1;
  const doc = await extractedDoc(W.users.alice, { client });
  const reason = "vendor name OCR'd as RM instead of the supplier";
  const res = await requestReextraction(W.users.bob, { document: doc.documentId, reason, opKey: opk("rex") });

  const aud = await auditArgs("request_reextraction", "task_id", res.task_id);
  assert.ok(aud, "an audit row names the task");
  assert.equal(aud.actor, W.users.bob, "…attributed to the human who asked");
  assert.equal(aud.on_behalf_of, null, "…with on_behalf_of NULL: nobody delegated this");
  assert.equal(aud.via_wake_kind, null, "…and no wake kind: this is not a wake lane");
  assert.equal(aud.args.reason, reason,
    "the REASON is on the audit row — an unexplained re-extraction is an unexplained change "
    + "to the evidence a posted entry rests on, and the reason is the whole audit value here");
  assert.equal(aud.args.lane, "llm_witness", "…with the lane (F-A1 PR-3: the invoice-shaped re-extraction arm now targets llm_witness)");
  assert.equal(aud.args.version_n, res.version_n, "…and the version");
  assert.equal(aud.outcome, "ok", "…as a completed action");
});

test("[0022] the floor is BOOKKEEPER (ADR-047 Q2): a viewer is refused, a bookkeeper is not", async () => {
  gate();
  // The draft proposed admin; the owner widened it deliberately — the person doing intake
  // is the person who sees a bad extraction, and re-extracting authorizes nothing on its
  // own (the new extraction still has to corroborate; a post still passes human approval).
  const doc = await extractedDoc(W.users.alice, { client: W.clients.A1 });
  await assertRaises(CLR.authz,
    () => requestReextraction(W.users.carol, { document: doc.documentId, opKey: opk("rex") }),
    "carol (viewer) requesting a re-extraction");
  const ok = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("rex") });
  assert.ok(ok.task_id, "the same call from a bookkeeper succeeds — a floor, not a blanket deny");
});

test("[0022] a document with NO completed extraction is refused — the ordinary pipeline is the right door", async () => {
  gate();
  const client = W.clients.A2; // a FRESH client — cell 1's grant on A1 must not leak in here
  const firm = await firmOf(client);
  // F-A1 PR-3: the coding-time backstop's auto-enqueue now targets llm_witness, which is
  // consent-gated AT ENQUEUE (0090 wall 6/§7e, live since the cutover) — unlike the retired
  // invoice_facts path, which had no enqueue-time consent gate at all. Without a live
  // witness_extraction consent the backstop's own task lands 'failed'/witness_consent_inactive
  // immediately, which then opens 0051's failed_retry door (a document whose lane's newest
  // task is 'failed' is eligible for recovery, regardless of WHY it failed) — a widened-but-
  // safe admission surface this cell does not intend to exercise. Granting consent FIRST
  // restores the exact precondition 0051's own header names: "the coding-time backstop leaves
  // its lane task 'queued', never 'failed'".
  const evidence = await consentEvidenceDoc(W.users.alice, { firm });
  const grant = await grantPurpose(W.users.alice, { client, purpose: "witness_extraction", evidenceDocument: evidence.documentId });
  await activatePurpose(W.users.alice, { client, purpose: "witness_extraction", consent: grant.consent_id });

  const { seedCitedDocument } = await import("./x1-helpers.mjs");
  const fresh = await seedCitedDocument(W.users.alice, { firm, client, kind: "invoice" });
  // NB: filing an invoice-kind document already enqueues the ordinary first-extraction task
  // (the coding-time backstop, now on llm_witness), so the assertion is that the verb adds
  // NOTHING, not that the lane is empty.
  const before_ = (await laneTasks(fresh.documentId, "llm_witness")).length;
  assert.equal((await rootQuery(
    "select status from clara.document_processing_tasks where document_id=$1 and lane='llm_witness' order by id limit 1",
    [fresh.documentId])).rows[0]?.status, "queued",
    "the backstop's own llm_witness task must be QUEUED (consent live), never failed — the failed_retry door's precondition");
  assert.equal((await rootQuery(
    "select count(*)::int n from clara.document_extractions where document_id=$1 and engine_kind='invoice_facts' and status='done'",
    [fresh.documentId])).rows[0].n, 0, "the document carries no DONE extraction (mandatory setup)");
  await assertRaises("CLR16",
    () => requestReextraction(W.users.bob, { document: fresh.documentId, opKey: opk("rex") }),
    "re-extracting a document that has never been extracted");
  assert.equal((await laneTasks(fresh.documentId, "llm_witness")).length, before_,
    "…and the verb queued nothing: routing a FIRST extraction through a human verb would "
    + "hide it from the intake path's own receipts");
});

test("[0022] the kind gate and the mime gate both refuse, by name", async () => {
  gate();
  const client = W.clients.A1;
  const doc = await extractedDoc(W.users.alice, { client });

  // AMENDMENT 0040 (WCC splice register 12): 'bank_statement' gained its OWN re-fire path
  // through the E2 router, so it is no longer a refusing kind. The kind gate itself is
  // unchanged and is still proven here, with a kind that remains excluded.
  await rootQuery("update clara.documents set document_kind='payroll_summary' where id=$1", [doc.documentId]);
  await assertRaises("CLR16",
    () => requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("rex") }),
    "re-extracting a non-invoice kind through the invoice engine");

  await rootQuery("update clara.documents set document_kind='invoice', mime_type='text/plain' where id=$1",
    [doc.documentId]);
  await assertRaises("CLR16",
    () => requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("rex") }),
    "re-extracting a document whose mime reaches no facts lane");

  await rootQuery("update clara.documents set mime_type='application/pdf' where id=$1", [doc.documentId]);
  const ok = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("rex") });
  assert.ok(ok.task_id, "with the kind and mime restored the same call succeeds — the gates are specific");
});

test("[0022] a document in ANOTHER firm is an honest refusal, not a silent no-op", async () => {
  gate();
  const doc = await extractedDoc(W.users.alice, { client: W.clients.A1 });
  const before_ = (await laneTasks(doc.documentId)).length;
  await assertRaises(CLR.notFound,
    () => requestReextraction(W.users.dave, { document: doc.documentId, opKey: opk("rex") }),
    "dave (firm B) re-extracting firm A's document");
  assert.equal((await laneTasks(doc.documentId)).length, before_, "…and nothing was queued");
});

test("[0022] the arguments are validated before anything is reserved", async () => {
  gate();
  const doc = await extractedDoc(W.users.alice, { client: W.clients.A1 });
  for (const [label, args] of [
    ["a blank reason", { reason: "   ", opKey: opk("rex") }],
    ["a reason of nothing", { reason: "", opKey: opk("rex") }],
    ["a null op_key", { reason: "fine", opKey: null }],
    ["a blank op_key", { reason: "fine", opKey: "  " }],
  ]) {
    await assertRaises(CLR.badRequest,
      () => requestReextraction(W.users.bob, { document: doc.documentId, ...args }), label);
  }
  assert.equal((await laneTasks(doc.documentId)).length, 1, "no refused call left a task behind");
});

test("[0022] the same op_key REPLAYS its receipt; a changed reason under it is REFUSED, not ignored", async () => {
  gate();
  const doc = await extractedDoc(W.users.alice, { client: W.clients.A1 });
  const key = opk("rex");
  const first = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "the tax line is missing", opKey: key });
  const replay = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "the tax line is missing", opKey: key });
  assert.deepEqual(replay, first, "the exact op_key returns the stored receipt byte-identically");
  assert.equal((await laneTasks(doc.documentId, "llm_witness")).length, 1, "one llm_witness task, however many times the call arrives");

  // The reason is IN the request hash, so correcting it under the old key must be an honest
  // refusal — otherwise a bookkeeper who improves the explanation and presses again gets a
  // stale receipt for the request they were trying to fix, with the old reason on the audit.
  await assertRaises(CLR.badRequest,
    () => requestReextraction(W.users.bob, {
      document: doc.documentId, reason: "the tax line is wrong, not missing", opKey: key }),
    "a corrected reason under the same op_key");
  // A blank and a whitespace reason are the SAME request, since the hash sees the trimmed
  // value the audit row will store.
  const again = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "  the tax line is missing  ", opKey: key });
  assert.deepEqual(again, first, "…while a whitespace-only difference still replays");
});

test("[0022] an ACTIVE task is RETURNED, never double-queued", async () => {
  gate();
  const doc = await extractedDoc(W.users.alice, { client: W.clients.A1 });
  const first = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("rex") });
  // A DIFFERENT op_key: op-key replay is not what protects here — the active-task check is.
  const second = await requestReextraction(W.users.bob, { document: doc.documentId, opKey: opk("rex") });
  assert.equal(second.task_id, first.task_id, "the second request names the SAME in-flight task");
  assert.equal(second.reused, true, "…and says so honestly");
  assert.equal((await laneTasks(doc.documentId, "llm_witness")).length, 1,
    "two live tasks on one document/lane would race to persist and the loser would fail on "
    + "the (document_id, engine_id, version_n) unique — a confusing failure for someone who "
    + "simply pressed the button twice");
});

test("[0022] the version computation starts ABOVE a terminal task (compute-over-terminal, NOT the retry)", async () => {
  gate();
  // HONEST TITLE (adversarial round 2 — MAJOR). This cell was originally claimed as the
  // retry proof and it is not one: pre-planting a COMMITTED terminal row at version N means
  // the verb's own `max(version_n)+1` immediately picks N+1 and its FIRST insert succeeds.
  // The loop never runs, and the pre-fix single-shot implementation would pass this cell
  // unchanged. It still earns its place — it proves the version computation counts terminal
  // rows rather than skipping them — but the retry itself is proven by the NEXT cell, which
  // forces the conflict for real.
  const doc = await extractedDoc(W.users.alice, { client: W.clients.A1 });
  // F-A1 PR-3: the re-extraction mint targets llm_witness (D7), an EMPTY lane for this
  // document at this point (extractedDoc only ever touches invoice_facts) — so the terminal
  // winner this cell plants is the lane's very FIRST version, and the retry must land at 2.
  const witnessTasks = await laneTasks(doc.documentId, "llm_witness");
  assert.equal(witnessTasks.length, 0, "no llm_witness task exists yet (mandatory setup)");
  const nextVersion = 1;
  const firm = await rootQuery("select firm_id from clara.documents where id=$1", [doc.documentId]);
  // The winner: terminal, never claimed, exactly the shape _reserve_processing_call's CLR18
  // branch leaves behind (workflow_run_id null, started_at null, error_code 'budget') --
  // except the LANE and ENGINE are now the ones the cutover router mints (llm_witness never
  // reserves a page budget at all, D6, but the never-claimed FAILED shape this cell plants is
  // agnostic to why the task terminated — it exists to prove the version arithmetic, not to
  // reproduce a real budget refusal).
  await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,finished_at)
     values($1,$2,$3,'{}'::jsonb,$4,'llm_witness','failed','budget',now())`,
    [firm.rows[0].firm_id, doc.documentId, WITNESS_ENGINE_ID, nextVersion]);

  const res = await requestReextraction(W.users.bob, {
    document: doc.documentId, reason: "after the budget failure", opKey: opk("rex") });

  assert.ok(res.task_id, "the receipt names a task — NOT the malformed {document_id, reused} shell");
  assert.ok(res.version_n, "…and a version");
  assert.ok(res.status, "…and a status");
  assert.equal(res.version_n, nextVersion + 1,
    "the retry recomputed the version ABOVE the terminal winner rather than colliding again");
  assert.equal(res.status, "queued", "…and minted a live task");
  assert.equal(res.reused, false, "…genuinely fresh, not a recovered in-flight task");

  const committed = await laneTasks(doc.documentId, "llm_witness");
  const fresh = committed.find((t) => t.id === res.task_id);
  assert.equal(fresh.version_n, nextVersion + 1, "the committed row carries that version");
  assert.equal(fresh.status, "queued", "…and is queued");
  // The op receipt must hold the SAME complete shape — that is the thing that was permanent.
  const receipt = await rootQuery(
    "select result from clara.op_receipts where fn='request_reextraction' and result->>'task_id'=$1",
    [res.task_id]);
  assert.equal(receipt.rows.length, 1, "one stored receipt names the task");
  assert.ok(receipt.rows[0].result.version_n, "…and the STORED receipt is complete too, not a shell");
});

test("[0022] the RETRY, forced for real: a conflict lost to a task that goes terminal converges", async () => {
  gate();
  // THE ACTUAL RETRY PATH, driven by a forced two-session schedule rather than described.
  // The schedule reproduces the over-budget race exactly:
  //   A (root)  begins, inserts a task at version N and HOLDS it uncommitted — the shape a
  //             caller leaves behind when _reserve_processing_call raises CLR18 and it marks
  //             its own row failed/budget inside the same transaction;
  //   B (human) calls the verb. Its snapshot cannot see A's row, so it computes N too, and
  //             its `insert ... on conflict do nothing` BLOCKS on A's uncommitted unique
  //             index entry — proven via pg_blocking_pids, not inferred from timing;
  //   A commits. B wakes: the insert conflicts, do-nothing yields no id, the ACTIVE
  //             re-select finds nothing (A's row is terminal), and the loop recomputes
  //             N+1 and succeeds.
  // Before the fix B fell out of that sequence with a NULL task and finished
  // `{document_id, reused:true}` into its op receipt — permanently.
  const doc = await extractedDoc(W.users.alice, { client: W.clients.A1 });
  const firm = (await rootQuery("select firm_id from clara.documents where id=$1", [doc.documentId])).rows[0].firm_id;
  // F-A1 PR-3: the re-extraction mint targets llm_witness (D7) — an EMPTY lane for this
  // document, so the winner this cell plants takes that lane's own first version.
  const witnessTasks = await laneTasks(doc.documentId, "llm_witness");
  const N = witnessTasks.length ? Math.max(...witnessTasks.map((t) => t.version_n)) + 1 : 1;

  const out = await holdThenContend({
    a: {
      run: (c) => c.query(
        `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
            version_n,lane,status,error_code,finished_at)
         values($1,$2,$3,'{}'::jsonb,$4,'llm_witness','failed','budget',now())`,
        [firm, doc.documentId, WITNESS_ENGINE_ID, N]),
    },
    b: {
      role: ROLES.authenticated, jwtSub: W.users.bob,
      run: async (c) => (await c.query(
        "select clara.request_reextraction(p_document => $1, p_reason => $2, p_op_key => $3) as r",
        [doc.documentId, "forced conflict", opk("rex")])).rows[0].r,
    },
  });

  assert.ok(out.a.ok, `the holder's insert succeeded (got ${out.a.code}: ${out.a.message})`);
  assert.equal(out.provedBlocked, true,
    "the verb BLOCKED on the uncommitted conflicting version — proven via pg_blocking_pids, so "
    + "the retry path was genuinely entered rather than skipped by a lucky version number");
  assert.ok(out.b.ok, `the verb succeeded after the holder committed (got ${out.b.code}: ${out.b.message})`);

  const r = out.b.receipt;
  assert.ok(r.task_id, "the receipt names a task — NOT the malformed {document_id, reused} shell");
  assert.equal(r.version_n, N + 1, "…at the version ABOVE the terminal winner it lost to");
  assert.equal(r.status, "queued", "…live");
  assert.equal(r.reused, false, "…and freshly minted, not a recovered in-flight task");

  const committed = await laneTasks(doc.documentId, "llm_witness");
  assert.equal(committed.filter((t) => t.version_n === N)[0].status, "failed",
    "the winner it lost to is the terminal budget row");
  assert.equal(committed.find((t) => t.id === r.task_id).status, "queued", "…and the verb's own task is queued");
  const receipt = await rootQuery(
    "select result from clara.op_receipts where fn='request_reextraction' and result->>'task_id'=$1",
    [r.task_id]);
  assert.equal(receipt.rows.length, 1, "one stored receipt names the task");
  assert.ok(receipt.rows[0].result.version_n && receipt.rows[0].result.status,
    "…and the STORED receipt is complete — that is the thing that used to be permanent");
});

test("[0022] NO machine lane can request a re-extraction — this is the whole cost bound", async () => {
  gate();
  // ADR-047 Q4 declined a numeric per-document cap: the per-page cost is noise and a cap is
  // one more thing to reason about at the moment someone is trying to fix a document. What
  // replaces it is STRUCTURAL — if no workflow, sweep or wake can execute the verb, none can
  // spend Azure pages in a loop. That makes this cell load-bearing, not bookkeeping.
  const doc = await extractedDoc(W.users.alice, { client: W.clients.A1 });
  for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    if (!role) continue;
    const err = await roleQuery(role,
      "select clara.request_reextraction($1,'machine re-extract',$2)", [doc.documentId, opk("rex")])
      .then(() => null, (e) => e);
    assert.ok(err, `${role} must not be able to execute request_reextraction`);
    assert.equal(err.code, "42501", `${role} is refused at the GRANT, not inside the body`);
  }
  const allow = await rootQuery(
    "select count(*)::int n from clara.wake_fn_allowlist where function_name='request_reextraction'");
  assert.equal(allow.rows[0].n, 0, "…and no wake allowlist row admits it for any wake kind");
});
