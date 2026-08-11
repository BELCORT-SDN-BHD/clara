// 0056 (Wave E lane beta, the close model) rig -- PART 3: the CLOSE LIFECYCLE
// (matrix A1, A2/A24, A3, A20, A22). Priority order per the work order: wall
// battery -> E-R6 -> close lifecycle (this file) -> concurrency -> the rest.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG,
// never by reading 0056_wave_e_close_model.sql.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, 
  endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, plainEntry, birthCounterparty, forceControlMismatch,
  beginClose, attestClose, finalizeClose, abandonClose, verifyClose,
  AR1, AP1, REVN, EXPN, BANK1, addDaysStr,
} from "./x56-fixtures.mjs";

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
  if (!ready) { noteLane("0011 surface absent -- x56 close-lifecycle suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-close-lifecycle"); printSkipCount("x56-close-lifecycle"); await endPool(); });

// ===========================================================================
// A1 -- close a clean FY: the receipt exists ONCE; verify_close reports
// verified:true from a FRESH recompute; the P&L->RE roll ties to the cent,
// both sides read directly and independently.
// ===========================================================================

test("A1 a clean FY closes: the receipt exists ONCE, verify_close(fresh recompute)=true, the P&L->RE roll ties in cents (both sides read independently)", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a1", prepSub: preparer, startsOn: "2027-01-01", revCents: 500000, expCents: 200000 });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed?.receipt_id, "the close succeeded");

  const receiptCount = (await rootQuery(
    "select count(*)::int as n from clara.close_receipts where fiscal_year_id=$1 and kind='close'", [fx.fy],
  )).rows[0].n;
  assert.equal(receiptCount, 1, "the close receipt row exists EXACTLY ONCE");

  const verified = await verifyClose(owner, { receipt: closed.receipt_id });
  assert.equal(verified.verified, true, `verify_close reports verified:true from a FRESH recompute (got ${JSON.stringify(verified.strict)})`);

  // The P&L->RE roll, ties to the cent -- read BOTH sides independently, never one derived
  // from the other: (a) the receipt's own reported net; (b) a raw journal_lines sum over
  // every APPROVED entry inside the FY, EXCLUDING the closing entry itself.
  const pl = (await rootQuery(
    `select coalesce(sum(case when jl.account_code in ($3,$4) then -(jl.debit_cents-jl.credit_cents)
                              else 0 end),0)::bigint as net
       from clara.journal_lines jl join clara.journal_entries je on je.id=jl.entry_id
      where je.client_id=$1 and je.status='approved' and je.posting_date between $2::date and $5::date
        and je.id <> $6`,
    [fx.client, fx.startsOn, REVN, EXPN, fx.endsOn, closed.close_entry_id],
  )).rows[0].net;
  const independentNet = Number(pl);
  assert.equal(independentNet, 500000 - 200000, "mandatory setup: the independent recompute itself reads the expected 300000 net");
  assert.equal(closed.pl_net_cents, independentNet, `the receipt's pl_net_cents TIES to the independently-recomputed net, in cents (receipt=${closed.pl_net_cents}, recompute=${independentNet})`);
});

// ===========================================================================
// A2 -- drawer 1, the AR arm: a control tie break refuses, naming domain,
// control account, both measured sides in cents, and the difference; no
// override argument exists on the closing verb.
// ===========================================================================

test("A2 drawer-1 AR control tie break REFUSES close, naming domain/control account/both sides/diff; no override argument on finalize_close", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a2", prepSub: preparer, startsOn: "2027-01-01" });
  // Break the AR tie: a phantom subledger row (forceControlMismatch) with NO matching GL
  // movement -- subledger moves, GL does not. See the helper's own header for why this is
  // NOT reachable through any audited verb, and why that is the drawer-1 identity working
  // as designed.
  const cust = await birthCounterparty(preparer, { client: fx.client, name: `X56 A2 ${randomUUID().slice(0, 6)}`, kind: "customer" });
  await forceControlMismatch(preparer, { client: fx.client, domain: "ar", groundEntry: fx.revenueEntry, counterparty: cust, cents: 77700 });

  await beginClose(owner, { fy: fx.fy });
  const err = await caught(() => finalizeClose(owner, { fy: fx.fy }));
  assert.ok(err, "a broken AR control tie must refuse the close");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.reason, "drawer1_identity_failed");
  assert.equal(det.check_key, "ar_control_tie");
  assert.equal(det.measured.domain, "ar");
  assert.ok(det.measured.control_accounts.includes(AR1), "the control account is named");
  assert.equal(Number(det.measured.gl_cents), 0, "the GL side, in cents (untouched)");
  assert.equal(Number(det.measured.subledger_cents), 77700, "the subledger side, in cents (the phantom item)");
  assert.equal(Number(det.measured.diff_cents), -77700, "the difference, in cents");

  const args = (await rootQuery(
    "select pg_get_function_identity_arguments('clara.finalize_close(uuid,text,text)'::regprocedure) as a",
  )).rows[0].a;
  assert.doesNotMatch(args, /override/i, `finalize_close carries no override argument (got: ${args})`);
});

// ===========================================================================
// A24 -- drawer 1, the AP arm (the same identity, the other domain).
// ===========================================================================

test("A24 drawer-1 AP control tie break REFUSES close on the AP LEG specifically, naming domain/control account/both sides/diff", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a24", prepSub: preparer, startsOn: "2027-01-01" });
  // Break the AP tie: a phantom subledger row, same mechanism as A2, on the AP domain.
  const vend = await birthCounterparty(preparer, { client: fx.client, name: `X56 A24 ${randomUUID().slice(0, 6)}`, kind: "vendor" });
  await forceControlMismatch(preparer, { client: fx.client, domain: "ap", groundEntry: fx.revenueEntry, counterparty: vend, cents: 41300 });

  await beginClose(owner, { fy: fx.fy });
  const err = await caught(() => finalizeClose(owner, { fy: fx.fy }));
  assert.ok(err, "a broken AP control tie must refuse the close");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.reason, "drawer1_identity_failed");
  assert.equal(det.check_key, "ap_control_tie", "the break is reported on the AP leg SPECIFICALLY, not folded into the AR check");
  assert.equal(det.measured.domain, "ap");
  assert.ok(det.measured.control_accounts.includes(AP1));
  assert.equal(Number(det.measured.gl_cents), 0, "the GL side, in cents (untouched)");
  assert.equal(Number(det.measured.subledger_cents), 41300, "the subledger side, in cents (the phantom item)");
  assert.equal(Number(det.measured.diff_cents), -41300);
});

// ===========================================================================
// A3 -- drawer 2: an unapproved in-period draft refuses close without an
// attestation; WITH an attestation, the close succeeds and the attestation is
// written into the receipt PERMANENTLY (who/why/when).
// ===========================================================================

test("A3 drawer-2 unapproved draft: refuses without attestation; attested, the close succeeds and the attestation is PERMANENT in the receipt", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a3", prepSub: preparer, startsOn: "2027-01-01" });
  const { draftEntryV3, freshResolution } = await import("./wave-a-fixtures.mjs");
  const stray = await draftEntryV3(preparer, {
    client: fx.client, resolution: freshResolution(preparer, fx.client, { subjectKind: "manual", subjectId: null }),
    memo: "x56 a3 stray draft", postingDate: addDaysStr(fx.startsOn, 15),
    lines: [{ account_code: EXPN, debit_cents: 900, credit_cents: 0, description: "dr" }, { account_code: AP1, debit_cents: 0, credit_cents: 900, description: "cr" }],
    opKey: opk("x56-a3-draft"),
  });

  const begun = await beginClose(owner, { fy: fx.fy });
  const gate = (begun.gates ?? []).find((g) => g.check_key === "unapproved_drafts_in_period");
  assert.equal(gate?.state, "fail", "mandatory setup: the stray draft trips the gate");

  const errNoAttest = await caught(() => finalizeClose(owner, { fy: fx.fy }));
  assert.ok(errNoAttest, "close without an attestation must refuse");
  assert.equal(errNoAttest.code, "CLR41", `expected CLR41 (got ${errNoAttest.code} -- ${errNoAttest.message})`);
  assert.equal(JSON.parse(errNoAttest.detail ?? "{}").reason, "drawer2_unattested");

  // unapproved_drafts_in_period is ITEMIZED (Codex R1 MAJOR 1): a blanket call refuses
  // CLR10/attest_item_required -- name the stray draft's own entry_id.
  const errBlanket = await caught(() => attestClose(owner, { closeRun: begun.close_run_id, checkKey: "unapproved_drafts_in_period", reason: "x56 a3: blanket attempt, deliberately no item_key" }));
  assert.ok(errBlanket, "a blanket attestation on the now-itemized gate is refused");
  assert.equal(errBlanket.code, "CLR10", `expected CLR10 (got ${errBlanket.code} -- ${errBlanket.message})`);
  const detBlanket = JSON.parse(errBlanket.detail ?? "{}");
  assert.equal(detBlanket.reason, "attest_item_required");
  assert.deepEqual(detBlanket.outstanding_items, [stray.entry_id], "the blanket refusal names the one outstanding item by its entry_id");

  const reasonText = "x56 a3: the stray draft is a known year-end timing item, accepted";
  const att = await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "unapproved_drafts_in_period", reason: reasonText, itemKey: stray.entry_id });
  assert.ok(att?.attestation_id, "the attestation is recorded");
  assert.equal(att.item_key, stray.entry_id, "the recorded attestation carries the item_key");

  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed?.receipt_id, "the attested close SUCCEEDS");

  const row = (await rootQuery("select snapshot from clara.close_receipts where id=$1", [closed.receipt_id])).rows[0];
  const attestations = row.snapshot.attestations ?? [];
  const mine = attestations.find((a) => a.check_key === "unapproved_drafts_in_period");
  assert.ok(mine, "the attestation is written into the receipt PERMANENTLY");
  assert.equal(mine.attested_by, owner, "WHO");
  assert.equal(mine.reason, reasonText, "WHY");
  assert.ok(mine.attested_at, "WHEN");
});

// ===========================================================================
// A20 -- attestation staleness: changing the underlying facts after an
// attestation makes it stale; the close names BOTH digests; a fresh
// attestation clears it; BOTH attestations survive in the receipt history.
// ===========================================================================

test("A20 attestation staleness -- a moved fact makes the prior attestation STALE (both digests named); a fresh attestation clears it; both survive", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a20", prepSub: preparer, startsOn: "2027-01-01" });
  // The "moved fact" is an UNCODED DOCUMENT (clara.document_filings), not a stray draft:
  // journal_lines carries its own period wall (_tf_period_wall_lines), which blocks ANY
  // new line -- draft included -- once the FY status is 'closing', so a fact that must
  // move DURING the close window (between begin_close and finalize_close) needs a table
  // the wall does not cover. document_filings is exactly that.
  const { filedDocument } = await import("./wave-a-fixtures.mjs");
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [fx.client])).rows[0].firm_id;
  const doc1 = await filedDocument(preparer, { firm, client: fx.client, financialDate: addDaysStr(fx.startsOn, 12) });

  const begun = await beginClose(owner, { fy: fx.fy });
  const gate = (begun.gates ?? []).find((g) => g.check_key === "uncoded_documents");
  assert.equal(gate?.state, "fail", "mandatory setup: the one uncoded document trips the gate");
  // uncoded_documents is ITEMIZED (Codex R1 MAJOR 1) -- name doc1's own filing_id.
  const att1 = await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "uncoded_documents", reason: "x56 a20: attesting the ONE known uncoded document", itemKey: doc1.filingId });
  const digest1 = att1.measured_digest;
  assert.ok(digest1, "mandatory setup: the first attestation binds a real digest");

  // Move the underlying fact: a SECOND uncoded document appears, DURING the close window
  // (FY status is 'closing' here) -- document_filings is not wall-covered, so this succeeds.
  const doc2 = await filedDocument(preparer, { firm, client: fx.client, financialDate: addDaysStr(fx.startsOn, 13) });

  const errStale = await caught(() => finalizeClose(owner, { fy: fx.fy }));
  assert.ok(errStale, "the close must refuse -- the attestation signed a state that has since moved");
  assert.equal(errStale.code, "CLR41", `expected CLR41 (got ${errStale.code} -- ${errStale.message})`);
  const det = JSON.parse(errStale.detail ?? "{}");
  assert.equal(det.reason, "close_attestation_stale");
  assert.equal(det.attested_digest, digest1, "detail names the ATTESTED (old) digest");
  assert.notEqual(det.fresh_digest, digest1, "detail names the FRESH (new, different) digest");
  assert.deepEqual([...det.missing_or_stale_items].sort(), [doc1.filingId, doc2.filingId].sort(),
    "the stale detail names BOTH items outstanding under the fresh (2-document) digest -- doc1's attestation no longer covers the whole-gate digest it was bound to, doc2 was never attested at all");

  // attest_close_exception now self-measures: it calls clara._evaluate_one_gate (a
  // single-gate evaluator that commits its own fresh result as PART OF the attest
  // transaction). PER-ITEM (Codex R1 MAJOR 1): clearing the gate now takes ONE fresh
  // attestation PER outstanding item -- re-attest doc1, then attest doc2 (newly outstanding).
  const att2a = await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "uncoded_documents", reason: "x56 a20: re-attesting item 1 fresh (its old digest no longer covers doc2)", itemKey: doc1.filingId });
  const att2b = await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "uncoded_documents", reason: "x56 a20: attesting item 2 (the newly-appeared document)", itemKey: doc2.filingId });
  assert.notEqual(att2a.measured_digest, digest1, "the fresh attestation on item 1 binds the NEW (2-document) digest");
  assert.equal(att2b.measured_digest, att2a.measured_digest, "both fresh attestations bind the SAME fresh digest -- one in-transaction measurement basis per attest call, and neither call moved the underlying facts");
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed?.receipt_id, "the close now succeeds once BOTH outstanding items carry live attestations bound to the fresh digest");

  const allAttestations = (await rootQuery(
    "select id, item_key, superseded_at from clara.close_attestations where close_run_id=$1 and check_key='uncoded_documents' order by attested_at",
    [begun.close_run_id],
  )).rows;
  assert.equal(allAttestations.length, 3, "ALL THREE attestations survive in history -- the stale one superseded, never deleted; two live, one per item");
  assert.equal(allAttestations[0].item_key, doc1.filingId);
  assert.ok(allAttestations[0].superseded_at, "the first (stale) attestation on item 1 is marked superseded");
  assert.equal(allAttestations[1].item_key, doc1.filingId);
  assert.equal(allAttestations[1].superseded_at, null, "the second attestation on item 1 (fresh) is live");
  assert.equal(allAttestations[2].item_key, doc2.filingId);
  assert.equal(allAttestations[2].superseded_at, null, "the item-2 attestation is live and was never superseded (nothing preceded it)");
});

// ===========================================================================
// A22 -- abandon_close: the ruled closing->open transition. The run is
// STAMPED abandoned (actor/reason/timestamp), never deleted; a subsequent
// begin_close mints a NEW run; the wall disarms.
// ===========================================================================

test("A22 abandon_close returns the FY to open; the run is STAMPED abandoned (never deleted); a new begin_close mints a fresh run; the wall disarms", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a22", prepSub: preparer, startsOn: "2027-01-01" });
  const begun = await beginClose(owner, { fy: fx.fy });

  const reasonText = "x56 a22: abandoning to re-check a late adjustment before the real close";
  const abandoned = await abandonClose(owner, { closeRun: begun.close_run_id, reason: reasonText });
  assert.equal(abandoned.state, "abandoned");

  const fyRow = (await rootQuery("select status from clara.fiscal_years where id=$1", [fx.fy])).rows[0];
  assert.equal(fyRow.status, "open", "the FY returns to open");

  const runRow = (await rootQuery("select state, ended_by, end_reason, ended_at from clara.close_runs where id=$1", [begun.close_run_id])).rows[0];
  assert.equal(runRow.state, "abandoned");
  assert.equal(runRow.ended_by, owner, "actor stamped");
  assert.equal(runRow.end_reason, reasonText, "reason stamped");
  assert.ok(runRow.ended_at, "timestamp stamped");

  const begun2 = await beginClose(owner, { fy: fx.fy });
  assert.notEqual(begun2.close_run_id, begun.close_run_id, "a subsequent begin_close mints a NEW run, not a reused one");
  await abandonClose(owner, { closeRun: begun2.close_run_id, reason: "x56 a22: abandon again to prove the wall disarms" });

  // The wall disarms: a plain posting into the FY now succeeds.
  const ok = await plainEntry(preparer, { client: fx.client, debit: EXPN, credit: BANK1, cents: 555, postingDate: addDaysStr(fx.startsOn, 40), memo: "x56 a22 post after abandon" });
  assert.ok(ok, "a posting into the FY succeeds after abandon -- the wall is disarmed");
});
