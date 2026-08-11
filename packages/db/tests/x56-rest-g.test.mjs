// 0056 (Wave E lane beta, the close model) rig -- PART 10: the Codex R1 batch's
// NEW cells, first half. (a) close-ordering (B3's begin_close guard). (b) the
// per-item attest E2E (M1's full lifecycle: blanket refuse -> partial attest ->
// finalize still refuses naming the OTHER item -> both attested -> close). (c) the
// recon-window boundary (B4: period_start <= fy_end <= period_end, not period_end
// alone). (d) latest-gate-result determinism (B1: seq, not evaluated_at/id, breaks
// same-instant ties).
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG, never
// by reading 0056_wave_e_close_model.sql (live function bodies ARE read for MY OWN
// authorial grounding, per established practice).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, proposeFY, openFY, addDaysStr,
  beginClose, attestClose, finalizeClose, cleanCloseableFY,
} from "./x56-fixtures.mjs";
import { addBankAccount, enterStatement } from "./x38-match-fixtures.mjs";
import { completeRecon } from "./x42-af2-helpers.mjs";

let ready = false;
let has56 = false;
let world = null;

function skip56(t) {
  if (!ready || !has56) {
    markSkip();
    t.skip("0056 (close model) not present");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x56 rest-g suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-g"); printSkipCount("x56-rest-g"); await endPool(); });

// ===========================================================================
// (a) CLOSE-ORDERING (Codex R1 BLOCKER 3): begin_close refuses on a LATER FY
// while an EARLIER one is not closed; closing the earlier year first admits it.
// ===========================================================================

test("close-ordering: begin_close on FY2 refuses CLR41/close_ordering_violation while FY1 is still open; closing FY1 first admits FY2 (right-answer half)", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx1 = await cleanCloseableFY(owner, { tag: "ordering-1", prepSub: preparer, startsOn: "2027-01-01" });
  // FY2, contiguous, opened but never touched -- FY1 stays 'open' throughout.
  const fy2Start = addDaysStr(fx1.endsOn, 1);
  const proposal2 = await proposeFY(owner, { client: fx1.client, startsOn: fy2Start });
  const fy2 = await openFY(owner, { client: fx1.client, label: "ordering FY2", startsOn: fy2Start, endsOn: proposal2.ends_on });

  const err = await caught(() => beginClose(owner, { fy: fy2.fiscal_year_id }));
  assert.ok(err, "begin_close on FY2 must refuse while an earlier fiscal year (FY1) is not closed");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "close_ordering_violation");

  // Structural: the guard lives in begin_close, checked UNDER the 004/007 lock pair
  // (the R1.5 TOCTOU lesson applied at authoring time -- read here, not assumed).
  const body = (await rootQuery(
    "select pg_get_functiondef('clara.begin_close(uuid,text)'::regprocedure) as def",
  )).rows[0].def;
  const lock007Pos = body.indexOf("pg_advisory_xact_lock(203005007");
  const orderingPos = body.indexOf("close_ordering_violation");
  assert.ok(lock007Pos > 0 && orderingPos > 0, "mandatory setup: both the 007 lock and the ordering refusal are present in the live body");
  assert.ok(lock007Pos < orderingPos, "the ordering guard is checked AFTER (under) the 007 lock, not before it");

  // Right answer: close FY1 first, then FY2 admits.
  await beginClose(owner, { fy: fx1.fy });
  const closed1 = await finalizeClose(owner, { fy: fx1.fy });
  assert.ok(closed1.receipt_id, "mandatory setup: FY1 closes cleanly");
  const begun2 = await beginClose(owner, { fy: fy2.fiscal_year_id });
  assert.ok(begun2.close_run_id, "FY2's begin_close now admits, once FY1 is closed");
});

// ===========================================================================
// (b) PER-ITEM ATTEST E2E (Codex R1 MAJOR 1, E-R2's ruled shape, matrix A26/B2):
// TWO uncoded documents -> a blanket attest refuses naming both filing_ids ->
// attest item 1 only -> finalize refuses drawer2_unattested naming item 2 ->
// attest item 2 -> close succeeds -> the receipt's attestations array carries
// BOTH with distinct item_keys + who/why/when each.
// ===========================================================================

test("per-item attest E2E: two outstanding items, blanket refuses naming both, partial coverage still refuses naming the ONE left, full coverage closes with both recorded", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "perite2m", prepSub: preparer, startsOn: "2027-01-01" });
  const { filedDocument } = await import("./wave-a-fixtures.mjs");
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [fx.client])).rows[0].firm_id;
  const doc1 = await filedDocument(preparer, { firm, client: fx.client, financialDate: addDaysStr(fx.startsOn, 10) });
  const doc2 = await filedDocument(preparer, { firm, client: fx.client, financialDate: addDaysStr(fx.startsOn, 11) });

  const begun = await beginClose(owner, { fy: fx.fy });
  const gate = (begun.gates ?? []).find((g) => g.check_key === "uncoded_documents");
  assert.equal(gate?.state, "fail", "mandatory setup: BOTH uncoded documents trip the gate");

  // Blanket refuses, naming BOTH outstanding filing_ids.
  const errBlanket = await caught(() => attestClose(owner, { closeRun: begun.close_run_id, checkKey: "uncoded_documents", reason: "per-item E2E: deliberate blanket attempt" }));
  assert.ok(errBlanket, "a blanket attestation on a two-item gate is refused");
  assert.equal(errBlanket.code, "CLR10");
  const detBlanket = JSON.parse(errBlanket.detail ?? "{}");
  assert.equal(detBlanket.reason, "attest_item_required");
  assert.deepEqual([...detBlanket.outstanding_items].sort(), [doc1.filingId, doc2.filingId].sort(), "the refusal names BOTH outstanding filing_ids");

  // Attest item 1 ONLY.
  const att1 = await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "uncoded_documents", reason: "per-item E2E: item 1 accepted, a known one-off", itemKey: doc1.filingId });
  assert.equal(att1.item_key, doc1.filingId);

  // finalize still refuses -- item 2 carries no attestation.
  const errPartial = await caught(() => finalizeClose(owner, { fy: fx.fy }));
  assert.ok(errPartial, "finalize still refuses with only ONE of two items attested");
  assert.equal(errPartial.code, "CLR41");
  const detPartial = JSON.parse(errPartial.detail ?? "{}");
  assert.equal(detPartial.reason, "drawer2_unattested");
  assert.deepEqual(detPartial.missing_items, [doc2.filingId], "the refusal names EXACTLY item 2 -- item 1's live attestation already covers it");

  // Attest item 2 -- both now covered, the close succeeds.
  const t2 = new Date().toISOString();
  const att2 = await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "uncoded_documents", reason: "per-item E2E: item 2 accepted, a genuinely late filing", itemKey: doc2.filingId });
  assert.equal(att2.item_key, doc2.filingId);
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "the close succeeds once BOTH outstanding items carry live attestations");

  // The receipt's attestations array carries both, with distinct item_keys + who/why/when.
  const row = (await rootQuery("select snapshot from clara.close_receipts where id=$1", [closed.receipt_id])).rows[0];
  const rows = (await rootQuery(
    "select item_key, attested_by, reason, attested_at from clara.close_attestations where close_run_id=$1 and check_key='uncoded_documents' order by attested_at",
    [begun.close_run_id],
  )).rows;
  assert.equal(rows.length, 2, "exactly two attestation rows -- one per item, neither superseding the other (different item_keys)");
  assert.deepEqual([...rows.map((r) => r.item_key)].sort(), [doc1.filingId, doc2.filingId].sort());
  for (const r of rows) {
    assert.equal(r.attested_by, owner, "WHO, per item");
    assert.ok(r.reason?.length > 0, "WHY, per item");
    assert.ok(r.attested_at, "WHEN, per item");
  }
  // (Codex R2 MINOR: item_key now rides the PERMANENT snapshot record, not just the
  // live close_attestations table -- assert the SNAPSHOT's own item_keys directly,
  // never just its row COUNT (a count alone false-greens if item_key were silently
  // dropped or wrong; the snapshot is what a reader sees years after the live table
  // could theoretically be pruned).
  const snapAttestations = (row.snapshot.attestations ?? []).filter((a) => a.check_key === "uncoded_documents");
  assert.equal(snapAttestations.length, 2, "the receipt's own snapshot ALSO carries both attestation records");
  assert.deepEqual([...snapAttestations.map((a) => a.item_key)].sort(), [doc1.filingId, doc2.filingId].sort(),
    "the snapshot's OWN attestation records name BOTH item_keys correctly, read from the permanent record itself, not inferred from the live table");
  void t2;
});

// ===========================================================================
// (c) RECON-WINDOW (Codex R1 BLOCKER 4): a completed reconciliation whose period
// does NOT contain fy.ends_on (period_start > fy_end, a next-year-only window)
// does NOT cover -- the close reads unknown. One whose period SPANS fy_end
// (period_start <= fy_end <= period_end) covers, and the close proceeds.
// ===========================================================================

test("recon-window: a completed reconciliation with period_start AFTER fy_end does NOT cover (close refuses unknown); one spanning fy_end covers (close proceeds)", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const { BANK1 } = await import("./x56-fixtures.mjs");

  // Arm 1: the account's ONLY statement/reconciliation is entirely in the NEXT
  // year -- period_end >= fy_end (the old, insufficient predicate) but
  // period_start > fy_end too, so the FIXED predicate correctly excludes it.
  // revCents/expCents:0 -- no GL activity through BANK1 at all, so completeRecon
  // finds no aged outstanding items to acknowledge (a genuinely separate concern
  // from the covering-window predicate this cell targets).
  const fxBad = await cleanCloseableFY(owner, { tag: "reconwin-bad", prepSub: preparer, startsOn: "2027-01-01", revCents: 0, expCents: 0 });
  const bankAcctBad = await addBankAccount(owner, { client: fxBad.client, bankCode: "MBB", accountNumber: "8801100001", coaAccountCode: BANK1, opKey: opk("x56-reconwin-bad-acct") });
  const bankAccountIdBad = bankAcctBad.bank_account_id ?? bankAcctBad.id;
  const nextYearStart = addDaysStr(fxBad.endsOn, 1); // 2028-01-01
  const nextYearEnd = addDaysStr(nextYearStart, 30); // 2028-01-31
  const stBad = await enterStatement(owner, {
    client: fxBad.client, bankAccount: bankAccountIdBad, keepPeriod: true,
    periodStart: nextYearStart, periodEnd: nextYearEnd, opening: 0, specs: [],
    opKey: opk("x56-reconwin-bad-stmt"),
  });
  await completeRecon(owner, { statement: stBad.statementId, ackOutstanding: [], opKey: opk("x56-reconwin-bad-complete") });

  const beganBad = await beginClose(owner, { fy: fxBad.fy });
  const bankGateBad = (beganBad.gates ?? []).find((g) => g.check_key === "bank_recon_identity");
  assert.equal(bankGateBad?.state, "unknown", "mandatory setup: the next-year-only reconciliation does NOT cover fy_end -- the drawer-1 gate reads unknown");
  const stateBad = await rootQuery(
    "select measured from clara.close_gate_results where close_run_id=$1 and check_key='bank_recon_identity' order by seq desc limit 1",
    [beganBad.close_run_id],
  );
  const acctBad = (stateBad.rows[0].measured.accounts ?? [])[0];
  assert.equal(acctBad?.state, "unknown");
  assert.equal(acctBad?.strict?.reason, "no_completed_reconciliation_covering_fy_end", "the account-level reason names the covering failure specifically");
  const errBad = await caught(() => finalizeClose(owner, { fy: fxBad.fy }));
  assert.ok(errBad, "the close refuses -- a drawer-1 identity may not be attested past");
  assert.equal(errBad.code, "CLR41");
  assert.equal(JSON.parse(errBad.detail ?? "{}").reason, "drawer1_state_unknown");

  // Arm 2 (right answer, a fresh client): a reconciliation whose period SPANS
  // fy_end (period_start <= fy_end <= period_end) covers -- the close proceeds.
  const fxGood = await cleanCloseableFY(owner, { tag: "reconwin-good", prepSub: preparer, startsOn: "2027-01-01", revCents: 0, expCents: 0 });
  const bankAcctGood = await addBankAccount(owner, { client: fxGood.client, bankCode: "MBB", accountNumber: "8801100002", coaAccountCode: BANK1, opKey: opk("x56-reconwin-good-acct") });
  const bankAccountIdGood = bankAcctGood.bank_account_id ?? bankAcctGood.id;
  const stGood = await enterStatement(owner, {
    client: fxGood.client, bankAccount: bankAccountIdGood, keepPeriod: true,
    periodStart: fxGood.startsOn, periodEnd: fxGood.endsOn, opening: 0, specs: [],
    opKey: opk("x56-reconwin-good-stmt"),
  });
  await completeRecon(owner, { statement: stGood.statementId, ackOutstanding: [], opKey: opk("x56-reconwin-good-complete") });

  const beganGood = await beginClose(owner, { fy: fxGood.fy });
  const bankGateGood = (beganGood.gates ?? []).find((g) => g.check_key === "bank_recon_identity");
  assert.equal(bankGateGood?.state, "pass", "the fy_end-spanning reconciliation covers -- the drawer-1 gate reads pass");
  // enterStatement's own provenance binding files the statement's source document --
  // an uncoded-but-genuine side effect of this fixture, orthogonal to what this cell
  // targets, so attest past it (itemized, named by its own filing_id).
  const docsGate = (beganGood.gates ?? []).find((g) => g.check_key === "uncoded_documents");
  if (docsGate?.state === "fail") {
    const filingRow = (await rootQuery("select id from clara.document_filings where document_id=$1 and client_id=$2", [stGood.documentId, fxGood.client])).rows[0];
    await attestClose(owner, { closeRun: beganGood.close_run_id, checkKey: "uncoded_documents", reason: "x56 recon-window good arm: the statement's own provenance document, not the concern of this cell", itemKey: filingRow.id });
  }
  const closedGood = await finalizeClose(owner, { fy: fxGood.fy });
  assert.ok(closedGood.receipt_id, "the close proceeds once a genuinely covering reconciliation exists");
});

// ===========================================================================
// (d) LATEST-GATE-RESULT DETERMINISM (Codex R1 BLOCKER 1): evaluating the SAME
// gate twice inside one transaction can tie on evaluated_at (a transaction-
// stable now()) -- seq (a monotone GENERATED ALWAYS AS IDENTITY column) is what
// breaks the tie, never id (random uuid) or evaluated_at alone.
// ===========================================================================

test("latest-result determinism: two evaluations of the same gate in ONE transaction tie on evaluated_at; the seq-ordered latest is the SECOND row, not an arbitrary one", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "seqdet", prepSub: preparer, startsOn: "2027-01-01" });
  const begun = await beginClose(owner, { fy: fx.fy });

  // Structural: close_gate_results.seq is a GENERATED ALWAYS identity -- monotone
  // by construction, never reused, never derived from a timestamp.
  const col = (await rootQuery(
    "select is_identity, identity_generation from information_schema.columns where table_schema='clara' and table_name='close_gate_results' and column_name='seq'",
  )).rows[0];
  assert.equal(col.is_identity, "YES", "seq is a real identity column");
  assert.equal(col.identity_generation, "ALWAYS", "GENERATED ALWAYS -- never caller-supplied, never forgeable");

  // Behavioural: two evaluations of the SAME check_key, in ONE transaction (so
  // evaluated_at is genuinely transaction-stable and can tie for real).
  const { getPool } = await import("./wave-a-fixtures.mjs");
  const conn = await getPool().connect();
  let r1;
  let r2;
  try {
    await conn.query("begin");
    r1 = (await conn.query("select clara._evaluate_one_gate($1,$2) as r", [begun.close_run_id, "unapproved_drafts_in_period"])).rows[0].r;
    r2 = (await conn.query("select clara._evaluate_one_gate($1,$2) as r", [begun.close_run_id, "unapproved_drafts_in_period"])).rows[0].r;
    await conn.query("commit");
  } finally {
    await conn.query("rollback").catch(() => {});
    conn.release();
  }
  assert.notEqual(r1.result_id, r2.result_id, "mandatory setup: two genuinely distinct result rows were inserted");

  const rows = (await rootQuery(
    "select id, seq, evaluated_at from clara.close_gate_results where id in ($1,$2) order by seq",
    [r1.result_id, r2.result_id],
  )).rows;
  assert.equal(rows.length, 2);
  assert.ok(rows[0].seq < rows[1].seq, "seq strictly orders the two rows -- monotone by construction");
  assert.equal(String(rows[1].id), String(r2.result_id), "the HIGHER seq belongs to the SECOND (later) evaluation");
  if (String(rows[0].evaluated_at) === String(rows[1].evaluated_at)) {
    noteLane("seq-determinism cell: evaluated_at genuinely TIED between the two evaluations -- seq is not merely a tiebreaker here, it is the ONLY discriminant");
  }

  // The house "latest per check_key" idiom (order by check_key, seq desc) picks
  // r2, never r1 -- read live from finalize_close's own body, not assumed.
  const finalizeBody = (await rootQuery(
    "select pg_get_functiondef('clara.finalize_close(uuid,text,text)'::regprocedure) as def",
  )).rows[0].def;
  assert.match(finalizeBody, /order by r2\.check_key, r2\.seq desc/, "finalize_close's own drawer sweep orders by seq desc, matching the identity this cell just proved monotone");
  const latest = (await rootQuery(
    `select distinct on (check_key) id from clara.close_gate_results
       where close_run_id=$1 and check_key='unapproved_drafts_in_period'
       order by check_key, seq desc`,
    [begun.close_run_id],
  )).rows[0];
  assert.equal(String(latest.id), String(r2.result_id), "the house latest-per-check_key query picks the SECOND evaluation, matching finalize_close's own ordering exactly");
});
