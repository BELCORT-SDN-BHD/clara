// 0056 (Wave E lane beta, the close model) rig -- PART 12: the Codex R2 batch's
// verification cells (the non-FA ones -- FA disposal tie + depreciation
// eligibility live in x56-rest-j.test.mjs, which needs the heavier x41 fixture
// world). (3) stale-applicability: the always-evaluate fix. (5) readiness's
// per-item 'attested' field, digest-bound not row-identity-bound. (6) a passing
// gate takes no exception. (7) the tenant oracle close in get_close_readiness.
// (8) a services client's gate summary carries closing_stock_present as a
// positive pass/not_goods_trading row, not a skip.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG,
// never by reading 0056_wave_e_close_model.sql (live function bodies ARE read
// for MY OWN authorial grounding, per established practice).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, 
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, recordClientFact,
  beginClose, attestClose, finalizeClose, getCloseReadiness,
  proposeFY, openFY, addDaysStr,
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
  if (!ready) { noteLane("0011 surface absent -- x56 rest-i suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-i"); printSkipCount("x56-rest-i"); await endPool(); });

// ===========================================================================
// (3) STALE-APPLICABILITY (Codex R2 MAJOR 2): _evaluate_close_gates now ALWAYS
// evaluates every check -- no more applies_when skip. begin_close on a
// goods-trader fails closing_stock_present; correcting trade_nature to
// 'services' mid-close (client_facts is NOT wall-covered) then finalizing
// succeeds with a FRESH pass row, not a stale goods-failure the old skip would
// have left standing.
//
// RED-PROOF: pre-fix, the skip meant finalize's OWN re-evaluation pass never
// touched this check_key once trade_nature read 'services' again -- the
// drawer sweep then found the STALE begin_close-time 'fail' row (the newest
// row that check_key ever got) and refused on it. Verified directly: applying
// 5c835b3's _evaluate_close_gates body (the applies_when skip, pulled via git
// show) to this cell reproduces exactly that refusal.
// ===========================================================================

test("stale-applicability: correcting trade_nature to services MID-CLOSE clears closing_stock_present with a FRESH pass row; finalize succeeds", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "staleappl", prepSub: preparer, startsOn: "2027-01-01" });
  // Override the shared fixture's 'services' default -- this cell needs the
  // goods-trading branch to fail FIRST.
  await recordClientFact(world.users.hana, { client: fx.client, factKey: "trade_nature", factValue: "goods_trading", basis: "x56 stale-appl: a goods trader by fixture design", basisKind: "owner_instruction" });

  const begun = await beginClose(owner, { fy: fx.fy });
  const gate1 = (begun.gates ?? []).find((g) => g.check_key === "closing_stock_present");
  assert.equal(gate1?.state, "fail", "mandatory setup: no marker entry, goods-trading -> the gate fails at begin_close time");

  // Correct the fact MID-CLOSE (client_facts is on the serialize roster but only
  // takes a SHARED lock -- begin_close's own exclusive hold already released at
  // commit, so this proceeds immediately).
  await recordClientFact(world.users.hana, { client: fx.client, factKey: "trade_nature", factValue: "services", basis: "x56 stale-appl: correcting mid-close, this really is a services business", basisKind: "owner_instruction" });

  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "the close succeeds -- finalize's own re-evaluation reads the CORRECTED fact, not the stale goods-failure");

  const rows = (await rootQuery(
    "select state, measured, seq from clara.close_gate_results where close_run_id=$1 and check_key='closing_stock_present' order by seq",
    [begun.close_run_id],
  )).rows;
  assert.ok(rows.length >= 2, "mandatory setup: at least two rows exist for this check_key in this run (begin_close's fail, finalize's fresh pass)");
  const latest = rows[rows.length - 1];
  assert.equal(latest.state, "pass", "the LATEST row is a FRESH pass, not the stale fail");
  assert.equal(latest.measured.reason, "not_goods_trading", "the fresh row's own reason names the corrected fact");
  assert.equal(rows[0].state, "fail", "the FIRST (begin_close-time) row is still the original fail -- never rewritten, only superseded by a later row");
});

// ===========================================================================
// (5) READINESS COVERAGE (Codex R2 MAJOR 5): 'attested' means what finalize
// will accept -- every outstanding item covered by a live attestation bound to
// the CURRENT digest. Two uncoded docs: attest one -> false; attest both ->
// true; POST-FINALIZE (finalize mints its own fresh same-digest rows) -> STILL
// true -- the digest rule, never row identity.
// ===========================================================================

test("readiness coverage: attested reads false with one of two items covered, true with both, and STAYS true after finalize mints a fresh same-digest row", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const { filedDocument } = await import("./wave-a-fixtures.mjs");
  const fx = await cleanCloseableFY(owner, { tag: "readycov", prepSub: preparer, startsOn: "2027-01-01" });
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [fx.client])).rows[0].firm_id;
  const doc1 = await filedDocument(preparer, { firm, client: fx.client, financialDate: addDaysStr(fx.startsOn, 10) });
  const doc2 = await filedDocument(preparer, { firm, client: fx.client, financialDate: addDaysStr(fx.startsOn, 11) });

  const begun = await beginClose(owner, { fy: fx.fy });
  const readiness1 = await getCloseReadiness(owner, { client: fx.client, fy: fx.fy });
  const gate1 = (readiness1.gates ?? []).find((g) => g.check_key === "uncoded_documents");
  assert.equal(gate1?.state, "fail", "mandatory setup: two uncoded documents trip the gate");
  assert.equal(gate1?.attested, false, "mandatory setup: NEITHER item is attested yet");

  await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "uncoded_documents", reason: "readiness-coverage: item 1 only", itemKey: doc1.filingId });
  const readiness2 = await getCloseReadiness(owner, { client: fx.client, fy: fx.fy });
  const gate2 = (readiness2.gates ?? []).find((g) => g.check_key === "uncoded_documents");
  assert.equal(gate2?.attested, false, "attested reads false with only ONE of two outstanding items covered");

  await attestClose(owner, { closeRun: begun.close_run_id, checkKey: "uncoded_documents", reason: "readiness-coverage: item 2, now both", itemKey: doc2.filingId });
  const readiness3 = await getCloseReadiness(owner, { client: fx.client, fy: fx.fy });
  const gate3 = (readiness3.gates ?? []).find((g) => g.check_key === "uncoded_documents");
  assert.equal(gate3?.attested, true, "attested reads true once BOTH outstanding items are covered");

  // get_close_readiness's own gates array carries no result_id (that field lives
  // only in begin_close's _evaluate_close_gates summary) -- read the raw rows
  // directly to prove finalize minted a genuinely NEW row, not just re-asserting it.
  const priorLatest = (await rootQuery(
    "select id from clara.close_gate_results where close_run_id=$1 and check_key='uncoded_documents' order by seq desc limit 1",
    [begun.close_run_id],
  )).rows[0].id;

  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "the close proceeds -- both items attested at the fresh digest");

  const postLatest = (await rootQuery(
    "select id, measured_digest from clara.close_gate_results where close_run_id=$1 and check_key='uncoded_documents' order by seq desc limit 1",
    [begun.close_run_id],
  )).rows[0];
  assert.notEqual(String(postLatest.id), String(priorLatest), "MEASURED not assumed: finalize's own re-evaluation minted a genuinely NEW row for this check_key, a different id");

  const readiness4 = await getCloseReadiness(owner, { client: fx.client, fy: fx.fy });
  const gate4 = (readiness4.gates ?? []).find((g) => g.check_key === "uncoded_documents");
  assert.equal(gate4?.measured_digest, postLatest.measured_digest, "mandatory setup: readiness is reading the FRESH (post-finalize) row");
  assert.equal(gate4?.measured_digest, gate3.measured_digest, "...and that fresh row's digest is IDENTICAL to the pre-finalize one -- nothing about the underlying facts changed");
  assert.equal(gate4?.attested, true, "attested STAYS true against the fresh row -- the coverage rule is digest equality, never row identity");
});

// ===========================================================================
// (6) ATTEST-ON-PASS (Codex R2 MINOR 1): an attestation is an acceptance of a
// FAILING/UNKNOWN/ERROR state -- attesting a gate that just measured PASS
// refuses CLR10/attest_gate_not_failing, and no attestation row is written.
// ===========================================================================

test("attest-on-pass: attesting a gate that just measured PASS refuses CLR10/attest_gate_not_failing, no row written", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "attestpass", prepSub: preparer, startsOn: "2027-01-01" });
  const begun = await beginClose(owner, { fy: fx.fy });
  const gate = (begun.gates ?? []).find((g) => g.check_key === "unapproved_drafts_in_period");
  assert.equal(gate?.state, "pass", "mandatory setup: this clean fixture has no stray drafts -- the gate passes");

  const before = (await rootQuery(
    "select count(*)::int as n from clara.close_attestations where close_run_id=$1 and check_key='unapproved_drafts_in_period'",
    [begun.close_run_id],
  )).rows[0].n;
  const err = await caught(() => attestClose(owner, { closeRun: begun.close_run_id, checkKey: "unapproved_drafts_in_period", reason: "attest-on-pass: a deliberately pointless attestation" }));
  assert.ok(err, "attesting a PASSING gate must refuse");
  assert.equal(err.code, "CLR10", `expected CLR10 (got ${err.code} -- ${err.message})`);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "attest_gate_not_failing");
  const after = (await rootQuery(
    "select count(*)::int as n from clara.close_attestations where close_run_id=$1 and check_key='unapproved_drafts_in_period'",
    [begun.close_run_id],
  )).rows[0].n;
  assert.equal(after, before, "no attestation row was written -- the refusal happened BEFORE any insert");
});

// ===========================================================================
// (7) TENANT ORACLE (Codex R2 MAJOR 6): get_close_readiness's fy_end_source
// read is now BOUND to the already-validated client (fy.id=$1 AND
// fy.client_id=$2) -- a caller's own client plus a FOREIGN firm's fy uuid
// reads NULL, not that firm's real fy_end_source. The two-firm world (A9's
// own fixtures) proves it: carol (firm-A viewer) + firm-B's real fy.
// ===========================================================================

test("tenant oracle: get_close_readiness with YOUR OWN client but a FOREIGN firm's fy uuid reads fy_end_source NULL -- the cross-firm oracle is closed", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice; // firm A owner
  const bStart = "2027-01-01";
  const bProposal = await proposeFY(world.users.dave, { client: world.clients.B1, startsOn: bStart });
  const bFy = await openFY(world.users.dave, { client: world.clients.B1, label: "tenant-oracle firm-B FY", startsOn: bStart, endsOn: bProposal.ends_on });
  const bRow = (await rootQuery("select fy_end_source from clara.fiscal_years where id=$1", [bFy.fiscal_year_id])).rows[0];
  assert.ok(bRow?.fy_end_source, "mandatory setup: firm B's real fiscal year carries a REAL fy_end_source -- something for the oracle to have leaked");

  // carol is firm A's viewer -- role_rank('viewer') is get_close_readiness's own
  // floor, and she is unambiguously NOT firm B. Her own client (A1) + firm B's fy.
  const crossRead = await getCloseReadiness(world.users.carol, { client: world.clients.A1, fy: bFy.fiscal_year_id });
  assert.equal(crossRead.fy_end_source, null, "the cross-tenant read reveals NOTHING about firm B's fiscal year -- fy_end_source reads null, not firm B's real value");
  assert.equal(crossRead.close_run_id, null, "no close_run is found either -- the (fy, client) pair simply does not resolve for a foreign fy");
  void owner;
});

// ===========================================================================
// (8) SERVICES SUMMARY (Codex R2, the flip side of MAJOR 2): a services
// client's begin_close gate summary now INCLUDES closing_stock_present as a
// POSITIVE pass/not_goods_trading row -- the always-evaluate fix means the
// skip is gone; this is what a services client's summary looks like now.
// ===========================================================================

test("services summary: a services client's gate summary carries closing_stock_present as pass/not_goods_trading -- positive evidence, not an absent skip", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  // cleanCloseableFY's shared setupCloseCoa already records trade_nature='services' --
  // the default, unmodified fixture is exactly the positive case this cell targets.
  const fx = await cleanCloseableFY(owner, { tag: "servsummary", prepSub: preparer, startsOn: "2027-01-01" });
  const begun = await beginClose(owner, { fy: fx.fy });
  const gate = (begun.gates ?? []).find((g) => g.check_key === "closing_stock_present");
  assert.ok(gate, "closing_stock_present is PRESENT in the summary at all -- the old applies_when skip omitted it entirely for a services client");
  assert.equal(gate.state, "pass");
  const measured = (await rootQuery("select measured from clara.close_gate_results where id=$1", [gate.result_id])).rows[0].measured;
  assert.equal(measured.reason, "not_goods_trading", "the measured reason names WHY it passes -- a real evaluation, not an inferred skip");
  assert.equal(measured.trade_nature, "services");
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "the close proceeds normally");
});
