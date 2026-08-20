// F-A1 (Wave-F Track A) PR-4 — THE STATEMENT WITNESS CUTOVER battery, PART 1 of 2 (cells a-d;
// e-j live in f-a1-statements-2.test.mjs — split purely to keep each file under the repo's
// 500-line gate, the x38-wave-c-b-bank.test.mjs / x38-wave-c-b-match.test.mjs precedent). For
// migrations/0098_f_a1_statements.sql (authored UNNUMBERED; number claimed at merge). Design:
// docs/plan/active/f-a1-witness-pair-design.md §3.7 (binding). Cells a-d are contract-blind (▣
// in the work order) — from the design's own prose plus a READ of the LIVE
// `clara._persist_statement_core` (0038:1385-1864) and its two normalizers (0038:1175-1338),
// never from this PR's own migration file. A divergence between an expectation here and the
// applied migration is a FINDING, never a silent test edit.
//
// WHAT IS UNDER TEST: `clara.persist_statement_facts_v2(p_task uuid, p_payload jsonb)` on lane
// `statement_facts`, and `clara._persist_statement_core_v2` beneath it. The payload shape is
// IDENTICAL to v1's OCR-lane shape — {pages_used, corroboration, readers:{reader1,reader2}} —
// except reader1 = the TEXT channel, reader2 = the VISION channel, and BOTH channels' engine_id
// MUST equal the claiming TASK's own engine_id (the M15 inversion of the legacy pair's
// distinct-engine-id law, 0038:1769-1780).
//
// HARNESS PLUMBING (not product behaviour): every task here is a DIRECT insert
// (f-a1-writer.test.mjs's `runningTask` idiom, not x38's enqueue+claim dance), one fresh
// document per sub-case. `persist_statement_facts_v2` settles the daily page-budget
// reservation UNCONDITIONALLY (v1 settles only on the `statement_facts` lane), so every witness
// task also gets a direct `processing_call_reservations` row — see f-a1-statements-fixtures.mjs.
//
// READ FIRST: docs/plan/active/f-a1-witness-pair-design.md §3.7 · 0038:1175-1338 (the two
// normalizers) · 0038:1385-1864 (`_persist_statement_core`, the refusal ORDER and vocabulary) ·
// 0092/0093 (the witness predicate + the cross-regime dispatcher's lane key, cell i's law) ·
// packages/db/tests/x38-wave-c-b-bank.test.mjs (the statement world idiom) ·
// packages/db/tests/f-a1-writer.test.mjs (the direct-running-task idiom) ·
// packages/db/tests/f-a1-walls.test.mjs (the readiness-gate idiom: FAIL loud, never skip).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { firmOf, seedCitedDocument, assertRaisesReason } from "./s6-helpers.mjs";
import { printLaneNotes } from "./rig-runtime-helpers.mjs";
import { witnessShape, landWitnessPair, evaluatePair } from "./f-a1-fixtures.mjs";
import {
  f_a1sReady, registerAccount, freshAcctNumber, ymBounds, witnessChain, stmtHeader,
  witnessReaders, agreeingWitnessPayload, filedStatementDoc, statementWitnessTask, persistV2,
  landWitnessStatement,
} from "./f-a1-statements-fixtures.mjs";

const CLR10 = "CLR10";

let world = null;
let ready = false;

/** THE READINESS GATE, in the f-a1-walls idiom: absent -> FAIL LOUD, never `t.skip()`. */
function mustBeReady() {
  assert.ok(ready, "clara.persist_statement_facts_v2(uuid,jsonb) is not applied on this database (0098_f_a1_statements.sql is not in the chain) — this battery must FAIL, not skip, against a pre-cutover chain");
}

before(async () => {
  ready = await f_a1sReady();
  if (!ready) return;
  world = await buildWorld();
});
after(async () => {
  printLaneNotes("f-a1-statements");
  await endPool();
});

test("META: clara.persist_statement_facts_v2 is applied", () => { mustBeReady(); });

// ===========================================================================
// f-a1s.a — THE PAIR PERSISTS TWO-KIND, UN-COIN-FLIPPED (design §3.7/§3.9 note 5): two
// DIFFERENT engine_kind rows sharing one engine_id can never trip the 0089 kind-scoped
// supersede trigger's uuid coin flip (it compares WITHIN a kind), so the pair lands clean by
// construction. Losing this means a real witness read silently self-supersedes on landing.
// ===========================================================================

test("f-a1s.a the pair persists two-kind, un-coin-flipped: one engine_id, one version_n, neither superseded, and the document pointer lands deterministically on the TEXT row", async () => {
  mustBeReady();
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);
  const acct = await registerAccount(sub, client);
  const { periodStart, periodEnd } = ymBounds(2026, 4);
  const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
  const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
  const doc = await filedStatementDoc(sub, client);
  const { taskId, engineId, versionN } = await statementWitnessTask(firm, doc.documentId);

  const r = await persistV2(taskId, agreeingWitnessPayload(engineId, h, ch));
  assert.equal(r.status, "done", `a well-formed witness statement pair must persist (got ${JSON.stringify(r)})`);
  assert.ok(r.reader1_extraction_id && r.reader2_extraction_id, "both extraction ids are returned");

  const rows = (await rootQuery(
    `select id, engine_kind, engine_id, version_n, superseded_by from clara.document_extractions
      where document_id=$1 order by extracted_at`, [doc.documentId])).rows;
  assert.equal(rows.length, 2, `exactly two document_extractions rows land for the document (got ${rows.length})`);
  assert.deepEqual(rows.map((x) => x.engine_kind).sort(), ["llm_text_facts", "llm_vision_facts"], "one of each witness kind, no third");
  assert.ok(rows.every((x) => x.engine_id === engineId), "both rows share the claiming TASK's own engine_id");
  assert.ok(rows.every((x) => x.version_n === versionN), "both rows share one version_n");
  for (const row of rows) {
    assert.equal(row.superseded_by, null, `${row.engine_kind} must not carry superseded_by — two DIFFERENT kinds can never coin-flip under the 0089 trigger (design §3.9 note 5)`);
  }

  const textRow = rows.find((x) => x.engine_kind === "llm_text_facts");
  assert.equal(textRow.id, r.reader1_extraction_id, "the wrapper names the TEXT row as reader1_extraction_id");
  const docRow = (await rootQuery("select authoritative_extraction_id from clara.documents where id=$1", [doc.documentId])).rows[0];
  assert.equal(docRow.authoritative_extraction_id, textRow.id, "the document-wide pointer lands DETERMINISTICALLY on the TEXT row (vision inserted first, an earlier clock — design §3.9 note 4)");
});

// ===========================================================================
// f-a1s.b — THE REFUSAL ORDER IS THE LIVE ONE. `_persist_statement_core` walks its checks in a
// fixed sequence (0038:1385-1864); a splice reordering even one pair changes WHICH reason a
// human sees on a genuinely multi-broken statement — the ORDER is the law, not just reachability.
// ===========================================================================

test("f-a1s.b the refusal ORDER matches the live ladder, pinned by payloads that violate several controls at once", async () => {
  mustBeReady();
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);

  // (1) readers_disagree BEFORE account binding — both readers name the SAME unregistered
  // account identity (would be account_unregistered if reached) but disagree on a total.
  {
    const acct = freshAcctNumber(); // deliberately NOT registered
    const { periodStart, periodEnd } = ymBounds(2026, 5);
    const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
    const h1 = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
    const h2 = { ...h1, total_credit_cents: h1.total_credit_cents + 1 };
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    await assertRaisesReason(CLR10, "readers_disagree",
      () => persistV2(taskId, witnessReaders(engineId, h1, ch.lines.map((l) => ({ ...l })), h2, ch.lines.map((l) => ({ ...l })))),
      "f-a1s.b(1) readers_disagree before account binding");
  }

  // (2a) header_unreadable BEFORE non_myr_statement — reader1's own header is unreadable
  // (blank institution code) AND states an explicit non-MYR currency in the SAME header.
  {
    const acct = freshAcctNumber();
    const { periodStart, periodEnd } = ymBounds(2026, 5);
    const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
    const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch, currency: "SGD" });
    h.institution_code = "";
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    await assertRaisesReason(CLR10, "header_unreadable",
      () => persistV2(taskId, agreeingWitnessPayload(engineId, h, ch)),
      "f-a1s.b(2a) header_unreadable before non_myr_statement");
  }

  // (2b) account binding (account_unregistered) BEFORE non_myr_statement. Unlike every other
  // reason in this ladder, the account-binding verdicts are RETURNED by the core (0038:1609-
  // 1612), not raised — the wrapper's proposal branch then RETURNS {status:'failed',reason}
  // rather than throwing, so this is checked on the settled result, not via assertRaisesReason.
  {
    const acct = freshAcctNumber(); // NOT registered
    const { periodStart, periodEnd } = ymBounds(2026, 5);
    const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
    const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch, currency: "SGD" });
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    const r = await persistV2(taskId, agreeingWitnessPayload(engineId, h, ch));
    assert.equal(r.status, "failed", `f-a1s.b(2b): account binding must settle as a failed task, not a raised exception (got ${JSON.stringify(r)})`);
    assert.equal(r.reason, "account_unregistered", `f-a1s.b(2b): account_unregistered must be reached BEFORE the non_myr_statement check ever runs (got ${JSON.stringify(r)})`);
    assert.ok(r.proposal_id, "the proposal branch mints a proposal id in the SAME committed receipt");
    const proposal = (await rootQuery(
      "select task_id, reason, bank_code, account_number_normalized, status from clara.bank_account_proposals where id=$1", [r.proposal_id])).rows[0];
    assert.ok(proposal, "the returned proposal_id names a real, committed bank_account_proposals row");
    assert.equal(proposal.task_id, taskId);
    assert.equal(proposal.reason, "account_unregistered");
    assert.equal(proposal.bank_code, "MBB");
    assert.equal(proposal.account_number_normalized, acct.digits, "the proposal names the SGD-header's own unregistered account, not the currency check's target");
    assert.equal(proposal.status, "open");
  }

  // (3) non_myr_statement BEFORE duplicate_period.
  {
    const acct = await registerAccount(sub, client);
    const { periodStart, periodEnd } = ymBounds(2026, 6);
    const baseline = await landWitnessStatement(sub, client, { accountDigits: acct.digits, periodStart, periodEnd });
    assert.equal(baseline.result.status, "done", "the baseline live statement must land");
    const ch2 = witnessChain(periodStart, periodEnd, 100000, [10000, -5000]);
    const h2 = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch: ch2, currency: "SGD" });
    const doc2 = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc2.documentId);
    await assertRaisesReason(CLR10, "non_myr_statement",
      () => persistV2(taskId, agreeingWitnessPayload(engineId, h2, ch2)),
      "f-a1s.b(3) non_myr_statement before duplicate_period");
  }

  // (4a) duplicate_period BEFORE chain_broken — same (account,period_end) as a live statement,
  // AND the chain does not close.
  {
    const acct = await registerAccount(sub, client);
    const { periodStart, periodEnd } = ymBounds(2026, 6);
    const baseline = await landWitnessStatement(sub, client, { accountDigits: acct.digits, periodStart, periodEnd });
    assert.equal(baseline.result.status, "done");
    const ch2 = witnessChain(periodStart, periodEnd, 100000, [10000, -5000]);
    const h2 = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch: ch2, closingOverride: ch2.closingCents + 100 });
    const doc2 = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc2.documentId);
    await assertRaisesReason(CLR10, "duplicate_period",
      () => persistV2(taskId, agreeingWitnessPayload(engineId, h2, ch2)),
      "f-a1s.b(4a) duplicate_period before chain_broken");
  }

  // (4b) overlapping_period BEFORE chain_broken — an OVERLAPPING (not identical) period against
  // a live statement, AND the chain does not close.
  {
    const acct = await registerAccount(sub, client);
    const m = ymBounds(2026, 7);
    const baseline = await landWitnessStatement(sub, client, { accountDigits: acct.digits, periodStart: m.periodStart, periodEnd: m.periodEnd });
    assert.equal(baseline.result.status, "done");
    const overlapStart = "2026-07-15"; const overlapEnd = "2026-08-15";
    const ch2 = witnessChain(overlapStart, overlapEnd, 100000, [20000, -10000]);
    const h2 = stmtHeader({ accountDigits: acct.digits, periodStart: overlapStart, periodEnd: overlapEnd, ch: ch2, closingOverride: ch2.closingCents + 100 });
    const doc2 = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc2.documentId);
    await assertRaisesReason(CLR10, "overlapping_period",
      () => persistV2(taskId, agreeingWitnessPayload(engineId, h2, ch2)),
      "f-a1s.b(4b) overlapping_period before chain_broken");
  }

  // (5) chain_broken BEFORE continuity_mismatch — an adjacent month whose printed opening
  // disagrees with the prior month's closing AND whose own chain does not close.
  {
    const acct = await registerAccount(sub, client);
    const m1 = ymBounds(2026, 8);
    const prior = await landWitnessStatement(sub, client, { accountDigits: acct.digits, periodStart: m1.periodStart, periodEnd: m1.periodEnd });
    assert.equal(prior.result.status, "done");
    const m2 = ymBounds(2026, 9); // contiguous with August
    const ch2 = witnessChain(m2.periodStart, m2.periodEnd, prior.ch.closingCents + 500, [10000, -5000]);
    const h2 = stmtHeader({ accountDigits: acct.digits, periodStart: m2.periodStart, periodEnd: m2.periodEnd, ch: ch2, closingOverride: ch2.closingCents + 100 });
    const doc2 = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc2.documentId);
    await assertRaisesReason(CLR10, "chain_broken",
      () => persistV2(taskId, agreeingWitnessPayload(engineId, h2, ch2)),
      "f-a1s.b(5) chain_broken before continuity_mismatch");
  }

  // totals_unreadable fires when EITHER channel omits a printed total — mandatory on the
  // two-read lane (0038:1488-1498).
  {
    const acct = await registerAccount(sub, client);
    const { periodStart, periodEnd } = ymBounds(2026, 10);
    const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000]);
    const h1 = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
    const h2 = { ...h1 }; delete h2.total_debit_cents;
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    await assertRaisesReason(CLR10, "totals_unreadable",
      () => persistV2(taskId, witnessReaders(engineId, h1, ch.lines.map((l) => ({ ...l })), h2, ch.lines.map((l) => ({ ...l })))),
      "f-a1s.b(totals) totals_unreadable when either channel omits a printed total");
  }
});

// ===========================================================================
// f-a1s.c — BOTH-EDGE CONTINUITY, WRITE-TIME ONLY (0038:1730-1754). Both edges matter because a
// void-and-reingest could otherwise change a closing balance the FOLLOWING month already
// committed to; write-time-only (contiguity, not nearest-neighbour) matters so a firm receiving
// statements out of order can still catch up without a gap-filler tripping a phantom refusal.
// ===========================================================================

test("f-a1s.c both-edge continuity is enforced at WRITE TIME only — contiguity, never nearest-neighbour", async () => {
  mustBeReady();
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);

  // PRIOR edge: month N is live; month N+1's opening disagrees with N's closing.
  {
    const acct = await registerAccount(sub, client);
    const n = ymBounds(2026, 4);
    const nStmt = await landWitnessStatement(sub, client, { accountDigits: acct.digits, periodStart: n.periodStart, periodEnd: n.periodEnd });
    assert.equal(nStmt.result.status, "done");
    const n1 = ymBounds(2026, 5);
    const ch2 = witnessChain(n1.periodStart, n1.periodEnd, nStmt.ch.closingCents + 777, [10000, -3000]);
    const h2 = stmtHeader({ accountDigits: acct.digits, periodStart: n1.periodStart, periodEnd: n1.periodEnd, ch: ch2 });
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    await assertRaisesReason(CLR10, "continuity_mismatch",
      () => persistV2(taskId, agreeingWitnessPayload(engineId, h2, ch2)),
      "f-a1s.c PRIOR edge: opening disagreeing with N's closing");
  }

  // NEXT edge: month N+1 is already live; ingesting month N whose closing disagrees with N+1's
  // opening refuses (the chain closes internally fine — only the cross-statement edge disagrees).
  {
    const acct = await registerAccount(sub, client);
    const n1 = ymBounds(2026, 5);
    const n1Stmt = await landWitnessStatement(sub, client, { accountDigits: acct.digits, periodStart: n1.periodStart, periodEnd: n1.periodEnd }); // opening=100000 (default)
    assert.equal(n1Stmt.result.status, "done");
    const n = ymBounds(2026, 4);
    const ch2 = witnessChain(n.periodStart, n.periodEnd, 100000, [10000, -3000]); // closes at 107000 != N+1's opening 100000
    const h2 = stmtHeader({ accountDigits: acct.digits, periodStart: n.periodStart, periodEnd: n.periodEnd, ch: ch2 });
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    await assertRaisesReason(CLR10, "continuity_mismatch",
      () => persistV2(taskId, agreeingWitnessPayload(engineId, h2, ch2)),
      "f-a1s.c NEXT edge: closing disagreeing with N+1's opening");
  }

  // WRITE-TIME ONLY: a NON-ADJACENT gap (April then June, May genuinely missing) does NOT
  // refuse — the law is date-contiguity, never nearest-neighbour.
  {
    const acct = await registerAccount(sub, client);
    const apr = ymBounds(2026, 4);
    const aprStmt = await landWitnessStatement(sub, client, { accountDigits: acct.digits, periodStart: apr.periodStart, periodEnd: apr.periodEnd });
    assert.equal(aprStmt.result.status, "done");
    const jun = ymBounds(2026, 6); // May is missing — April and June are NOT adjacent
    const ch2 = witnessChain(jun.periodStart, jun.periodEnd, 999000, [5000, -2000]);
    const h2 = stmtHeader({ accountDigits: acct.digits, periodStart: jun.periodStart, periodEnd: jun.periodEnd, ch: ch2 });
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    const r = await persistV2(taskId, agreeingWitnessPayload(engineId, h2, ch2));
    assert.equal(r.status, "done", `a non-adjacent gap must NOT refuse on continuity (got ${JSON.stringify(r)})`);
  }
});

// ===========================================================================
// f-a1s.d — CURRENCY: absence reads MYR (WC-R5) and is PRESERVED verbatim; the invoice regime's
// OPPOSITE posture (absence never corroborates, 0092:385-405) stays untouched. Design §3.7 is
// explicit these two must never be silently unified.
// ===========================================================================

test("f-a1s.d currency: absence reads MYR on the statement side, an explicit non-MYR refuses, and the invoice regime's opposite posture is unmoved", async () => {
  mustBeReady();
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);

  // (i) ABSENCE -> MYR PRESERVED: neither channel prints a currency at all.
  {
    const acct = await registerAccount(sub, client);
    const { periodStart, periodEnd } = ymBounds(2026, 4);
    const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000]);
    const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch, omitCurrency: true });
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    const r = await persistV2(taskId, agreeingWitnessPayload(engineId, h, ch));
    assert.equal(r.status, "done", `a header never printing currency on EITHER channel must persist — absence reads MYR (WC-R5), unmoved by the cutover (got ${JSON.stringify(r)})`);
  }

  // (ii) an EXPLICIT non-MYR currency on both channels refuses.
  {
    const acct = await registerAccount(sub, client);
    const { periodStart, periodEnd } = ymBounds(2026, 4);
    const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000]);
    const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch, currency: "SGD" });
    const doc = await filedStatementDoc(sub, client);
    const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
    await assertRaisesReason(CLR10, "non_myr_statement",
      () => persistV2(taskId, agreeingWitnessPayload(engineId, h, ch)),
      "f-a1s.d(ii) explicit non-MYR currency");
  }

  // (iii) THE CROSS-REGIME HALF. The invoice side is BEHAVIOURALLY OPPOSITE: absence
  // (`not_printed`) reduces to '' at 0092:392-401, v_tmyr/v_vmyr land on 'none' (never 'myr'),
  // and v_ok requires BOTH channels to independently confirm 'myr' (0092:443-448) — so an
  // invoice witness pair whose currency is not_printed on both channels can never corroborate.
  // THESE TWO POSTURES MUST NEVER BE UNIFIED (design §3.7): statement silence = home currency;
  // invoice silence = unconfirmed.
  {
    const invClient = world.clients.A2;
    const invFirm = await firmOf(invClient);
    const cited = await seedCitedDocument(sub, { firm: invFirm, client: invClient, kind: "invoice" });
    // invoice.currency is deliberately OMITTED from `fields` -> witnessShape answers it
    // not_printed on BOTH channels; every other belt field is answered.
    const fields = {
      "invoice.total": 10375, "invoice.total_excl_tax": 9430, "invoice.tax_total": 566,
      "invoice.rounding": 2, "invoice.service_charge": 377, "invoice.type_code": "01",
    };
    const shape = witnessShape({ fields });
    const pair = await landWitnessPair(cited.documentId, shape);
    const verdict = await evaluatePair(cited.documentId, pair.textId, pair.visionId);
    assert.notEqual(verdict.corroborated, true, `an invoice witness pair whose currency is not_printed on both channels must NOT corroborate (got ${JSON.stringify(verdict)})`);
  }
});

// Cells e-j (egress dispatch, description non-load-bearing, repointed reader columns, re-run
// discipline, the cross-regime fail-closed cell, and the ancestor's continued existence) live
// in f-a1-statements-2.test.mjs.
