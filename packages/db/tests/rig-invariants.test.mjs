// Slice-2 rig — the BOOKS invariants.
// Families (v1 §6 as amended by v2 §D/§E/§F): T4 provenance, T5 client attribution,
// T7 maker/checker (amount-derived high-stakes + monotonic flags), T8 revision
// token (rotation + concurrent approve), T9 balance + rounding, T11 reverse-not-
// delete (routine + high-stakes linkage-on-approval), T12 idempotency, T15 money
// shape, T19-audit (receipts + append-only + viewer read floor).
//
// Every negative assertion checks an EXACT SQLSTATE (a small code set only where
// the contract itself names one — e.g. "CLR10/CHECK"). Assertions encode the
// CONTRACT; a schema that disagrees is a suspected lane-M defect, not weakened.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  PG,
  ROLES,
  HIGH_STAKES_CENTS,
  ROUTINE_CENTS,
  assertRaises,
  assertRaisesOneOf,
  balanced,
  opk,
  rootQuery,
  humanQuery,
  human,
  ensureReady,
  buildWorld,
  endPool,
  draftEntry,
  approveEntry,
  reverseEntry,
  recordResolution,
  ingestDocument,
  createClient,
  upsertAccount,
  freshResolution,
  mintWake,
} from "./rig-fixtures.mjs";
import {
  commitRawUnbalanced,
  commitRawProvenanceMismatch,
  insertRawNullPair,
  commitRawMovedLine,
  raceApprove,
  reparentLineFromApproved,
  moveLineBetweenDraftsRotatesTokens,
  truncateGuardError,
} from "./rig-txn.mjs";

let world = null;
let ready = false;

before(async () => {
  ready = await ensureReady();
  if (ready) world = await buildWorld();
});
after(endPool);

function unready(t) {
  if (!ready) {
    t.skip("Slice-2 governed schema not present — lane-M migrations not yet applied");
    return true;
  }
  return false;
}

// --- local helpers ---------------------------------------------------------
async function draftRoutine(sub, client, coa, amount = ROUTINE_CENTS, extra = {}) {
  const resolution = await freshResolution(sub, client);
  return draftEntry(human(sub), { client, resolution, lines: balanced(coa, amount), opKey: opk(), ...extra });
}
async function approvedRoutine(sub, client, coa, amount = ROUTINE_CENTS) {
  const r = await draftRoutine(sub, client, coa, amount);
  await approveEntry(sub, { entry: r.entry_id, expectedRevision: r.revision_token, opKey: opk() });
  return r.entry_id;
}
async function docResolution(sub, client, docId, confidence = 0.98) {
  return recordResolution(human(sub), { client, subjectKind: "document", subjectId: docId, confidence, opKey: opk("dres") });
}
async function tokenOf(entry) {
  const r = await rootQuery("select revision_token from clara.journal_entries where id = $1", [entry]);
  return r.rows[0].revision_token;
}

// ===========================================================================
// T4 — provenance (invariant 2)
// ===========================================================================
test("T4 provenance: mismatched/foreign/cross-client documents are refused; correct pair posts", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const goodSha = "a".repeat(64);
  const doc = await ingestDocument(human(users.bob), { client: clients.A1, sha256: goodSha, opKey: opk() });
  const lines = balanced(coa.A1, 1000);

  // Wrong sha for a real doc → CLR02 (resolution is about the doc, so CLR01 passes first).
  const dres = await docResolution(users.bob, clients.A1, doc);
  await assertRaises(CLR.provenance, () => draftEntry(human(users.bob), { client: clients.A1, resolution: dres, document: doc, sha256: "b".repeat(64), lines, opKey: opk() }), "wrong sha");

  // Nonexistent document → CLR02.
  const missingDoc = randomUUID();
  const dresMissing = await docResolution(users.bob, clients.A1, missingDoc);
  await assertRaises(CLR.provenance, () => draftEntry(human(users.bob), { client: clients.A1, resolution: dresMissing, document: missingDoc, sha256: goodSha, lines, opKey: opk() }), "nonexistent doc");

  // Document of ANOTHER firm → CLR02.
  const bSha = "c".repeat(64);
  const bDoc = await ingestDocument(human(users.dave), { client: clients.B1, sha256: bSha, opKey: opk() });
  const dresForeign = await docResolution(users.bob, clients.A1, bDoc);
  await assertRaises(CLR.provenance, () => draftEntry(human(users.bob), { client: clients.A1, resolution: dresForeign, document: bDoc, sha256: bSha, lines, opKey: opk() }), "foreign-firm doc");

  // Cross-CLIENT document (same firm, wrong client) → CLR02 (v2 §E exact-client).
  const a2Sha = "d".repeat(64);
  const a2Doc = await ingestDocument(human(users.bob), { client: clients.A2, sha256: a2Sha, opKey: opk() });
  const dresCross = await docResolution(users.bob, clients.A1, a2Doc);
  await assertRaises(CLR.provenance, () => draftEntry(human(users.bob), { client: clients.A1, resolution: dresCross, document: a2Doc, sha256: a2Sha, lines, opKey: opk() }), "cross-client doc");

  // Exact document-binding (v2 §D): a resolution ABOUT document A cannot back a
  // draft that cites document B — even when both docs are valid for this client.
  // assert_client_resolved requires subject_id = p_document, so this is exactly CLR01.
  const bSha2 = "f".repeat(64);
  const docB2 = await ingestDocument(human(users.bob), { client: clients.A1, sha256: bSha2, opKey: opk() });
  const dresAboutDoc = await docResolution(users.bob, clients.A1, doc);
  await assertRaises(CLR.client, () => draftEntry(human(users.bob), { client: clients.A1, resolution: dresAboutDoc, document: docB2, sha256: bSha2, lines, opKey: opk() }), "resolution about doc A, draft cites doc B → CLR01");

  // Broken pair (doc without sha / sha without doc) → CLR10 or the both-or-neither CHECK.
  await assertRaisesOneOf([CLR.badRequest, PG.checkViolation], () => draftEntry(human(users.bob), { client: clients.A1, resolution: dres, document: doc, lines, opKey: opk() }), "doc without sha");
  const manualRes = await freshResolution(users.bob, clients.A1);
  await assertRaisesOneOf([CLR.badRequest, PG.checkViolation], () => draftEntry(human(users.bob), { client: clients.A1, resolution: manualRes, sha256: goodSha, lines, opKey: opk() }), "sha without doc");

  // Non-document entry with an EMPTY memo → refused (a basis is required, v2 §E);
  // enforced either as a fn guard (CLR10) or a table CHECK.
  const memoRes = await freshResolution(users.bob, clients.A1);
  await assertRaisesOneOf([CLR.badRequest, PG.checkViolation], () => draftEntry(human(users.bob), { client: clients.A1, resolution: memoRes, memo: "", lines, opKey: opk() }), "empty memo non-document entry");

  // Correct pair → ok.
  const okRes = await docResolution(users.bob, clients.A1, doc);
  const receipt = await draftEntry(human(users.bob), { client: clients.A1, resolution: okRes, document: doc, sha256: goodSha, lines, opKey: opk() });
  assert.ok(receipt.entry_id, "correct (doc, sha) pair posts");

  // Raw superuser paths: deferred provenance trigger catches a mismatch at COMMIT;
  // a null-paired document violates the both-or-neither CHECK immediately.
  await assertRaisesOneOf([CLR.provenance, PG.checkViolation], () => commitRawProvenanceMismatch({ client: clients.A1, maker: users.bob, documentId: doc, wrongSha: "e".repeat(64), coa: coa.A1 }), "raw mismatched pair at commit");
  await assertRaises(PG.checkViolation, () => insertRawNullPair({ client: clients.A1, maker: users.bob, documentId: doc }), "raw null-paired document");
});

// ===========================================================================
// T5 — client attribution (invariant 1) + resolution authority (v2 §D)
// ===========================================================================
test("T5 client attribution: only a same-client, ≥0.95, non-superseded human/rule resolution posts", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const lines = balanced(coa.A1, ROUTINE_CENTS);

  await assertRaises(CLR.client, () => draftEntry(human(users.bob), { client: clients.A1, resolution: randomUUID(), lines, opKey: opk() }), "no such resolution");

  const low = await freshResolution(users.bob, clients.A1, { confidence: 0.94 });
  await assertRaises(CLR.client, () => draftEntry(human(users.bob), { client: clients.A1, resolution: low, lines, opKey: opk() }), "confidence 0.94");

  const superseded = await freshResolution(users.bob, clients.A1);
  await rootQuery("update clara.client_resolutions set superseded_at = now() where id = $1", [superseded]);
  await assertRaises(CLR.client, () => draftEntry(human(users.bob), { client: clients.A1, resolution: superseded, lines, opKey: opk() }), "superseded resolution");

  const otherClient = await freshResolution(users.bob, clients.A2);
  await assertRaises(CLR.client, () => draftEntry(human(users.bob), { client: clients.A1, resolution: otherClient, lines, opKey: opk() }), "resolution for a different client");

  // Agent-method resolution never satisfies the gate on its own (v2 §D).
  const cred = await mintWake({ kind: "interactive", firm: world.firms.A });
  const agentRes = await recordResolution({ kind: "wake", role: ROLES.wakeInteractive, secret: cred.secret }, { client: clients.A1, confidence: 0.99, opKey: opk(), wake: true });
  const agentMethod = await rootQuery("select method from clara.client_resolutions where id = $1", [agentRes]);
  assert.equal(agentMethod.rows[0].method, "agent", "wake fn stamps method=agent regardless of args");
  await assertRaises(CLR.client, () => draftEntry(human(users.bob), { client: clients.A1, resolution: agentRes, lines, opKey: opk() }), "agent-method resolution rejected");

  // Human fn stamps method=human even when the caller passes 'agent'.
  const stamped = await recordResolution(human(users.bob), { client: clients.A1, method: "agent", confidence: 0.98, opKey: opk() });
  const stampedMethod = await rootQuery("select method from clara.client_resolutions where id = $1", [stamped]);
  assert.equal(stampedMethod.rows[0].method, "human", "human fn stamps method=human");

  // 0.95 exactly → ok.
  const okRes = await freshResolution(users.bob, clients.A1, { confidence: 0.95 });
  const receipt = await draftEntry(human(users.bob), { client: clients.A1, resolution: okRes, lines, opKey: opk() });
  assert.ok(receipt.entry_id, "0.95 resolution posts");
});

// ===========================================================================
// T7 — maker / checker (v2 §E amount-derived high-stakes + monotonic flags)
// ===========================================================================
test("T7 maker/checker: self-approval of high-stakes blocked; routine self-approve ok; solo attests", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;

  // High-stakes by amount: bob (maker) self-approve → CLR05; a distinct human ok.
  const hs = await draftRoutine(users.bob, clients.A1, coa.A1, HIGH_STAKES_CENTS);
  await assertRaises(CLR.makerChecker, () => approveEntry(users.bob, { entry: hs.entry_id, expectedRevision: hs.revision_token, opKey: opk() }), "bob self-approve high-stakes");
  await approveEntry(users.alice, { entry: hs.entry_id, expectedRevision: hs.revision_token, opKey: opk() });
  const checker = await rootQuery("select checker_actor from clara.journal_entries where id = $1", [hs.entry_id]);
  assert.equal(checker.rows[0].checker_actor, users.alice, "checker recorded = alice");

  // Routine self-approve is fine.
  const routine = await draftRoutine(users.bob, clients.A1, coa.A1, ROUTINE_CENTS);
  await approveEntry(users.bob, { entry: routine.entry_id, expectedRevision: routine.revision_token, opKey: opk() });

  // Monotonic flag: a below-threshold entry with tax_affecting=true is forced high-stakes.
  const flagged = await draftRoutine(users.bob, clients.A1, coa.A1, ROUTINE_CENTS, { flags: { tax_affecting: true } });
  await assertRaises(CLR.makerChecker, () => approveEntry(users.bob, { entry: flagged.entry_id, expectedRevision: flagged.revision_token, opKey: opk() }), "self-approve flag-forced high-stakes");

  // Solo firm: the lone owner must attest to self-approve a high-stakes entry.
  const solo = await draftRoutine(users.erin, clients.S1, coa.S1, HIGH_STAKES_CENTS);
  await assertRaises(CLR.makerChecker, () => approveEntry(users.erin, { entry: solo.entry_id, expectedRevision: solo.revision_token, opKey: opk() }), "solo self-approve without attestation");
  await approveEntry(users.erin, { entry: solo.entry_id, expectedRevision: solo.revision_token, attestation: "sole practitioner attests", opKey: opk() });
  const att = await rootQuery("select self_approval_attestation from clara.journal_entries where id = $1", [solo.entry_id]);
  assert.ok(att.rows[0].self_approval_attestation, "attestation stored");

  // Agent-drafted high-stakes (last_human_editor NULL): a single human may approve,
  // but WA-D5 now REQUIRES a non-blank attestation (else CLR05 attestation_required).
  const humanRes = await freshResolution(users.bob, clients.A1);
  const cred = await mintWake({ kind: "interactive", firm: world.firms.A });
  const wakeReceipt = await draftEntry({ kind: "wake", role: ROLES.wakeInteractive, secret: cred.secret }, { client: clients.A1, resolution: humanRes, lines: balanced(coa.A1, HIGH_STAKES_CENTS), opKey: opk(), wake: true });
  await approveEntry(users.alice, { entry: wakeReceipt.entry_id, expectedRevision: wakeReceipt.revision_token, attestation: "reviewed agent draft", opKey: opk() });
  const wchk = await rootQuery("select checker_actor, self_approval_attestation from clara.journal_entries where id = $1", [wakeReceipt.entry_id]);
  assert.equal(wchk.rows[0].checker_actor, users.alice, "human checker on agent-drafted high-stakes");
  assert.ok(wchk.rows[0].self_approval_attestation, "WA-D5 attestation stored on the agent-drafted high-stakes approval");
});

// ===========================================================================
// T8 — revision token (rotation on draft mutation + concurrent approve)
// ===========================================================================
test("T8 revision token: a draft-line change rotates the token; the stale token fails approve", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const draft = await draftRoutine(users.bob, clients.A1, coa.A1);
  const t0 = draft.revision_token;

  await rootQuery("update clara.journal_lines set description = 'rig-mutate' where entry_id = $1 and line_no = 1", [draft.entry_id]);
  const t1 = await tokenOf(draft.entry_id);
  assert.notEqual(t1, t0, "a draft-line change rotates revision_token");

  await assertRaises(CLR.revision, () => approveEntry(users.bob, { entry: draft.entry_id, expectedRevision: t0, opKey: opk() }), "stale token");
  await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: t1, opKey: opk() });
});

test("T8 concurrent approve: exactly one wins, the other loses (CLR06 or CLR10)", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const draft = await draftRoutine(users.bob, clients.A1, coa.A1);
  const out = await raceApprove({ entry: draft.entry_id, expectedRevision: draft.revision_token, subA: users.bob, subB: users.bob });
  const winners = [out.a, out.b].filter((r) => r && r.ok).length;
  assert.equal(winners, 1, `exactly one approve wins (got ${JSON.stringify(out)})`);
  assert.ok(out.b && out.b.ok === false && [CLR.revision, CLR.badRequest].includes(out.b.code), `loser raised CLR06/CLR10 (got ${JSON.stringify(out.b)})`);
});

// ===========================================================================
// T9 — balance + rounding (no 'drafting'; deferred trigger on the raw path)
// ===========================================================================
test("T9 balance + rounding: >5c refused; 1-5c auto-rounds; no rounding acct → CLR10", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;

  const res1 = await freshResolution(users.bob, clients.A1);
  const over = [
    { account_code: coa.A1.cash, debit_cents: 10000, credit_cents: 0 },
    { account_code: coa.A1.sales, debit_cents: 0, credit_cents: 9990 },
  ];
  await assertRaises(CLR.balance, () => draftEntry(human(users.bob), { client: clients.A1, resolution: res1, lines: over, opKey: opk() }), "residual > 5c");

  const res2 = await freshResolution(users.bob, clients.A1);
  const round = [
    { account_code: coa.A1.cash, debit_cents: 10000, credit_cents: 0 },
    { account_code: coa.A1.sales, debit_cents: 0, credit_cents: 9997 },
  ];
  const rr = await draftEntry(human(users.bob), { client: clients.A1, resolution: res2, lines: round, opKey: opk() });
  const legs = await rootQuery("select account_code, debit_cents, credit_cents from clara.journal_lines where entry_id = $1", [rr.entry_id]);
  assert.equal(legs.rows.length, 3, "a rounding leg was auto-appended");
  const dr = legs.rows.reduce((s, l) => s + Number(l.debit_cents), 0);
  const cr = legs.rows.reduce((s, l) => s + Number(l.credit_cents), 0);
  assert.equal(dr, cr, "entry ties exactly after rounding");
  assert.ok(legs.rows.some((l) => l.account_code === coa.A1.rounding), "rounding leg lands in the special account");

  // A client with NO rounding account → CLR10.
  const nrClient = await createClient(users.alice, { name: `${world.prefix}_nr`, opKey: opk() });
  await upsertAccount(users.alice, { client: nrClient, code: "1000", name: "Cash", type: "asset", opKey: opk() });
  await upsertAccount(users.alice, { client: nrClient, code: "4000", name: "Sales", type: "income", opKey: opk() });
  const res3 = await freshResolution(users.alice, nrClient);
  const nrLines = [
    { account_code: "1000", debit_cents: 10000, credit_cents: 0 },
    { account_code: "4000", debit_cents: 0, credit_cents: 9997 },
  ];
  await assertRaises(CLR.badRequest, () => draftEntry(human(users.alice), { client: nrClient, resolution: res3, lines: nrLines, opKey: opk() }), "residual with no rounding account");

  // Degenerate shapes. A single-line entry trips the <2-lines guard → exactly CLR10.
  const res4 = await freshResolution(users.bob, clients.A1);
  await assertRaises(CLR.badRequest, () => draftEntry(human(users.bob), { client: clients.A1, resolution: res4, lines: [{ account_code: coa.A1.cash, debit_cents: 100, credit_cents: 0 }], opKey: opk() }), "single-line entry");
  // Zero-amount line: keep the entry BALANCED (100=100) so the per-line
  // exactly-one-of-debit/credit rule is what fires, not the balance guard.
  // [S6 N-F8] shared validator pre-empts the table CHECK: CLR10 ("each line must carry
  // exactly one positive debit or credit") — 0009 _validate_entry_lines runs before 23514.
  const res5 = await freshResolution(users.bob, clients.A1);
  await assertRaises(CLR.badRequest, () => draftEntry(human(users.bob), { client: clients.A1, resolution: res5, lines: [{ account_code: coa.A1.cash, debit_cents: 100, credit_cents: 0 }, { account_code: coa.A1.sales, debit_cents: 0, credit_cents: 100 }, { account_code: coa.A1.expense, debit_cents: 0, credit_cents: 0 }], opKey: opk() }), "zero-amount line");
});

test("T9 raw path: deferred balance trigger holds at COMMIT; a moved line must leave both balanced", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  await assertRaises(CLR.balance, () => commitRawUnbalanced({ client: clients.A1, maker: users.bob, coa: coa.A1 }), "raw unbalanced at commit");
  await assertRaises(CLR.balance, () => commitRawMovedLine({ client: clients.A1, maker: users.bob, coa: coa.A1 }), "moved line unbalances both entries");
});

// ===========================================================================
// T10 (HIGH 3) — an approved entry can never lose a line through a reparenting
// UPDATE; a draft-to-draft move rotates BOTH parents' revision tokens.
// ===========================================================================
test("T10 reparent: moving a line OUT OF an approved entry raises CLR08; a draft move rotates both tokens", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;

  // Approved entry (2 lines) + a fresh draft (2 lines). Moving an approved line onto
  // the draft is rejected by the line-immutability trigger inspecting the OLD parent.
  const approved = await approvedRoutine(users.bob, clients.A1, coa.A1);
  const draft = await draftRoutine(users.bob, clients.A1, coa.A1);
  await assertRaises(CLR.immutable, () => reparentLineFromApproved({ approvedEntry: approved, draftEntry: draft.entry_id }), "reparent a line out of an approved entry");
  const stillTwo = await rootQuery("select count(*)::int as n from clara.journal_lines where entry_id = $1", [approved]);
  assert.equal(stillTwo.rows[0].n, 2, "the approved entry kept all its lines");

  // A draft→draft line move rotates BOTH the source and destination tokens.
  const dA = await draftRoutine(users.bob, clients.A1, coa.A1);
  const dB = await draftRoutine(users.bob, clients.A1, coa.A1);
  const rot = await moveLineBetweenDraftsRotatesTokens({ draftA: dA.entry_id, draftB: dB.entry_id });
  assert.equal(rot.rotatedSource, true, "the source draft's token rotated (its stale revision is now invalid)");
  assert.equal(rot.rotatedDest, true, "the destination draft's token rotated");
});

// ===========================================================================
// T11 — reverse-not-delete (routine + high-stakes linkage-on-approval)
// ===========================================================================
test("T11 routine reversal: mirror is approved with swapped legs, original stays approved+linked", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const entry = await approvedRoutine(users.bob, clients.A1, coa.A1);

  await assertRaises(CLR.badRequest, () => reverseEntry(users.bob, { entry, reason: "", opKey: opk() }), "reverse without a reason");

  const rev = await reverseEntry(users.bob, { entry, reason: "correction", opKey: opk() });
  const mirror = rev.reversal_id;
  const m = await rootQuery("select status, reversal_of, posting_date = current_date as today from clara.journal_entries where id = $1", [mirror]);
  assert.equal(m.rows[0].status, "approved", "routine mirror is approved");
  assert.equal(m.rows[0].reversal_of, entry, "mirror links to the original");
  assert.equal(m.rows[0].today, true, "mirror posting_date is today (never back-dated)");
  const orig = await rootQuery("select status, reversed_by from clara.journal_entries where id = $1", [entry]);
  assert.equal(orig.rows[0].status, "approved", "original stays 'approved'");
  assert.equal(orig.rows[0].reversed_by, mirror, "original.reversed_by links to the mirror");
  // Legs swapped: the cash account is a debit in the original, a credit in the mirror.
  const ml = await rootQuery("select credit_cents from clara.journal_lines where entry_id = $1 and account_code = $2", [mirror, coa.A1.cash]);
  assert.ok(Number(ml.rows[0].credit_cents) > 0, "mirror swaps Dr↔Cr");

  await assertRaises(CLR.badRequest, () => reverseEntry(users.bob, { entry, reason: "again", opKey: opk() }), "reversing twice");
  await assertRaises(CLR.badRequest, () => reverseEntry(users.bob, { entry: mirror, reason: "x", opKey: opk() }), "reversing a reversal");
});

test("T11 high-stakes reversal: mirror lands draft; original not-reversed until a distinct human approves", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const hs = await draftRoutine(users.bob, clients.A1, coa.A1, HIGH_STAKES_CENTS);
  await approveEntry(users.alice, { entry: hs.entry_id, expectedRevision: hs.revision_token, opKey: opk() });

  const rev = await reverseEntry(users.bob, { entry: hs.entry_id, reason: "hs correction", opKey: opk() });
  const mirror = rev.reversal_id;
  const m = await rootQuery("select status from clara.journal_entries where id = $1", [mirror]);
  assert.equal(m.rows[0].status, "draft", "high-stakes mirror lands as draft (needs a distinct approver)");
  let orig = await rootQuery("select reversed_by from clara.journal_entries where id = $1", [hs.entry_id]);
  assert.equal(orig.rows[0].reversed_by, null, "original.reversed_by stays NULL until the mirror is approved");

  const mtok = await tokenOf(mirror);
  await assertRaises(CLR.makerChecker, () => approveEntry(users.bob, { entry: mirror, expectedRevision: mtok, opKey: opk() }), "reverser self-approves the mirror");
  await approveEntry(users.alice, { entry: mirror, expectedRevision: mtok, opKey: opk() });
  orig = await rootQuery("select reversed_by from clara.journal_entries where id = $1", [hs.entry_id]);
  assert.equal(orig.rows[0].reversed_by, mirror, "approving the mirror links original.reversed_by");

  // Abandoned high-stakes mirror leaves the original reversible.
  const hs2 = await draftRoutine(users.bob, clients.A1, coa.A1, HIGH_STAKES_CENTS);
  await approveEntry(users.alice, { entry: hs2.entry_id, expectedRevision: hs2.revision_token, opKey: opk() });
  await reverseEntry(users.bob, { entry: hs2.entry_id, reason: "first (abandoned)", opKey: opk() });
  const again = await reverseEntry(users.bob, { entry: hs2.entry_id, reason: "second", opKey: opk() });
  assert.ok(again.reversal_id, "an abandoned draft mirror does not block a later reversal");
});

test("T11 reversal copies the risk flags from the original to the mirror", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  // Below-threshold entry made high-stakes by flags (tax_affecting + is_year_end).
  const flagged = await draftRoutine(users.bob, clients.A1, coa.A1, ROUTINE_CENTS, { flags: { tax_affecting: true, is_year_end: true } });
  await approveEntry(users.alice, { entry: flagged.entry_id, expectedRevision: flagged.revision_token, opKey: opk() });
  const rev = await reverseEntry(users.bob, { entry: flagged.entry_id, reason: "flag copy", opKey: opk() });
  const f = await rootQuery("select is_opening_balance, is_year_end, tax_affecting from clara.journal_entries where id = $1", [rev.reversal_id]);
  assert.equal(f.rows[0].tax_affecting, true, "mirror copies tax_affecting");
  assert.equal(f.rows[0].is_year_end, true, "mirror copies is_year_end");
  assert.equal(f.rows[0].is_opening_balance, false, "mirror copies is_opening_balance (false)");
});

// ===========================================================================
// T12 — idempotency (firm-scoped op_receipts; different args/fn independent)
// ===========================================================================
test("T12 idempotency: same key replays; different args → CLR10; cross-firm/fn independent", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const res = await freshResolution(users.bob, clients.A1);
  const key = opk("dedupe");
  const lines = balanced(coa.A1, ROUTINE_CENTS);
  const first = await draftEntry(human(users.bob), { client: clients.A1, resolution: res, lines, opKey: key });
  const replay = await draftEntry(human(users.bob), { client: clients.A1, resolution: res, lines, opKey: key });
  assert.deepEqual(replay, first, "same op_key replays the identical receipt");
  const count = await rootQuery("select count(*)::int as n from clara.journal_entries where id = $1", [first.entry_id]);
  assert.equal(count.rows[0].n, 1, "no second entry was created");

  // Same key, DIFFERENT args → CLR10.
  await assertRaises(CLR.badRequest, () => draftEntry(human(users.bob), { client: clients.A1, resolution: res, lines: balanced(coa.A1, ROUTINE_CENTS + 1), opKey: key }), "same key, different args");

  // Same op_key value in firm A and firm B → two INDEPENDENT operations.
  const shared = opk("cross");
  const resB = await freshResolution(users.dave, clients.B1);
  const a = await draftEntry(human(users.bob), { client: clients.A1, resolution: res, lines, opKey: shared });
  const b = await draftEntry(human(users.dave), { client: clients.B1, resolution: resB, lines: balanced(coa.B1, ROUTINE_CENTS), opKey: shared });
  assert.notEqual(a.entry_id, b.entry_id, "same op_key in two firms → two independent entries");

  // Different fn, SAME key → two independent operations (op_receipts PK includes fn).
  const k2 = opk("fnkey");
  const cid = await createClient(users.alice, { name: `${world.prefix}_fnkey`, opKey: k2 });
  assert.ok(cid, "create_client with a shared key succeeds");
  // The exact same op_key on a DIFFERENT writer (upsert_account) must not collide.
  await upsertAccount(users.alice, { client: cid, code: "1000", name: "Cash", type: "asset", opKey: k2 });
  const receipts = await rootQuery("select count(distinct fn)::int as n from clara.op_receipts where firm_id = $1 and op_key = $2", [world.firms.A, k2]);
  assert.equal(receipts.rows[0].n, 2, "same op_key on two different fns → two independent receipts");
});

// ===========================================================================
// T15 — money shape
// ===========================================================================
test("T15 money shape: fractional/negative/both-sides lines are refused", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const resFrac = await freshResolution(users.bob, clients.A1);
  const resNeg = await freshResolution(users.bob, clients.A1);
  const resBoth = await freshResolution(users.bob, clients.A1);

  // Fractional cents: the core's `(->>'debit_cents')::bigint` fails and is re-raised
  // as CLR10 (exact contract code — not the raw 22P02).
  await assertRaises(CLR.badRequest, () => draftEntry(human(users.bob), { client: clients.A1, resolution: resFrac, lines: [{ account_code: coa.A1.cash, debit_cents: 12.5, credit_cents: 0 }, { account_code: coa.A1.sales, debit_cents: 0, credit_cents: 12 }], opKey: opk() }), "fractional cents");
  // Negative cents: [S6 N-F8] shared validator pre-empts the table CHECK: CLR10
  // ("each line must carry exactly one positive debit or credit") — 0009 _validate_entry_lines
  // runs before the `debit_cents >= 0` table CHECK's 23514.
  await assertRaises(CLR.badRequest, () => draftEntry(human(users.bob), { client: clients.A1, resolution: resNeg, lines: [{ account_code: coa.A1.cash, debit_cents: -100, credit_cents: 0 }, { account_code: coa.A1.sales, debit_cents: 0, credit_cents: -100 }], opKey: opk() }), "negative cents");
  // Both-sides line (totals BALANCED 200=200): [S6 N-F8] shared validator pre-empts the
  // exactly-one-side table CHECK: CLR10 (fires before 23514).
  await assertRaises(CLR.badRequest, () => draftEntry(human(users.bob), { client: clients.A1, resolution: resBoth, lines: [{ account_code: coa.A1.cash, debit_cents: 100, credit_cents: 100 }, { account_code: coa.A1.sales, debit_cents: 100, credit_cents: 100 }], opKey: opk() }), "both sides on one line");
});

// ===========================================================================
// T19-audit — receipts produced, append-only enforced, viewer read floor
// ===========================================================================
test("T19-audit: writers leave receipts; audit_log is append-only; viewers cannot read it", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  await approvedRoutine(users.bob, clients.A1, coa.A1);

  const drafts = await rootQuery("select count(*)::int as n from clara.audit_log where firm_id = $1 and fn = 'draft_entry'", [firms.A]);
  assert.ok(drafts.rows[0].n >= 1, "draft_entry left an audit receipt");
  const approvals = await rootQuery("select count(*)::int as n from clara.audit_log where firm_id = $1 and fn = 'approve_entry'", [firms.A]);
  assert.ok(approvals.rows[0].n >= 1, "approve_entry left an audit receipt");

  // Append-only: even superuser cannot UPDATE / DELETE / TRUNCATE.
  await assertRaises(CLR.immutable, () => rootQuery("update clara.audit_log set fn = 'x' where firm_id = $1", [firms.A]), "UPDATE audit_log");
  await assertRaises(CLR.immutable, () => rootQuery("delete from clara.audit_log where firm_id = $1", [firms.A]), "DELETE audit_log");
  // audit_log is written by every writer; under the concurrent suite a TRUNCATE can
  // lose a deadlock race before the append-only guard fires — retry the transient race.
  const tal = await truncateGuardError("truncate clara.audit_log");
  assert.equal(tal && tal.code, CLR.immutable, "TRUNCATE audit_log → CLR08");

  // Read floor: a viewer (carol) sees zero audit rows; a bookkeeper (bob) sees them.
  const carolSees = await humanQuery(users.carol, "select count(*)::int as n from clara.audit_log");
  assert.equal(carolSees.rows[0].n, 0, "viewer sees no audit rows (rank floor in RLS)");
  const bobSees = await humanQuery(users.bob, "select count(*)::int as n from clara.audit_log");
  assert.ok(bobSees.rows[0].n >= 1, "bookkeeper sees audit rows");
});
