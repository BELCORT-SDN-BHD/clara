// 0056 (Wave E lane beta, the close model) rig -- PART 2: cells that need NO completed
// close (independent of the finalize_close/close_receipt_id defect reported separately):
// A21a/A21b (FY contiguity), A23 (fy_end_source honesty), A9 (the agent-role privilege
// sweep over the close/approve-class verb set).
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG, never by
// reading 0056_wave_e_close_model.sql.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, roleQuery, humanQuery, ROLES, PG,
  endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, assertRaises,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, freshActiveClient, proposeFY, openFY,
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
  if (!ready) { noteLane("0011 surface absent -- x56 independent-cells suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-independent-cells"); printSkipCount("x56-independent-cells"); await endPool(); });

// ===========================================================================
// A21a -- a one-month GAP is refused by the before-insert contiguity trigger,
// naming the prior FY's ends_on and the proposed starts_on.
// ===========================================================================

test("A21a a fiscal year with a GAP before it is REFUSED by the contiguity trigger, naming both boundary dates", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "a21a");
  const fy1 = await openFY(owner, { client, label: "FY1", startsOn: "2025-01-01", endsOn: "2025-12-31" });
  assert.ok(fy1?.fiscal_year_id, "mandatory setup: FY(n) 2025-01-01..2025-12-31 registered");

  // A one-month gap: 2026-02-01 instead of the contiguous 2026-01-01.
  const err = await caught(() => openFY(owner, { client, label: "FY2 gap", startsOn: "2026-02-01", endsOn: "2026-12-31", lengthReason: "x56 a21a deliberate gap probe" }));
  assert.ok(err, "a fiscal year starting after a gap must be refused");
  assert.equal(err.code, "CLR10", `expected CLR10 (got ${err.code} -- ${err.message})`);
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.reason, "fy_not_contiguous");
  assert.equal(String(det.prior_ends_on), "2025-12-31", "detail names the prior FY's ends_on");
  assert.equal(String(det.starts_on), "2026-02-01", "detail names the proposed starts_on");
});

// ===========================================================================
// A21b -- an OVERLAP is refused; the contiguous successor is ADMITTED; an
// 18-month first FY is admitted, a 19-month one refused by the span bound.
// ===========================================================================

test("A21b an OVERLAPPING fiscal year is refused; the contiguous successor is admitted; 18 months admitted, 19 months refused by the DDL span bound", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "a21b");
  const fy1 = await openFY(owner, { client, label: "FY1", startsOn: "2025-01-01", endsOn: "2025-12-31" });
  assert.ok(fy1?.fiscal_year_id);

  // Overlapping: 2025-07-01..2026-06-30 (starts mid FY1).
  const errOverlap = await caught(() => openFY(owner, { client, label: "FY2 overlap", startsOn: "2025-07-01", endsOn: "2026-06-30", lengthReason: "x56 a21b overlap probe" }));
  assert.ok(errOverlap, "an overlapping fiscal year must be refused");
  assert.equal(errOverlap.code, "CLR10", `expected CLR10 (got ${errOverlap.code} -- ${errOverlap.message})`);
  assert.equal(JSON.parse(errOverlap.detail ?? "{}").reason, "fy_not_contiguous");

  // Right answer: the contiguous successor is ADMITTED.
  const fy2 = await openFY(owner, { client, label: "FY2", startsOn: "2026-01-01", endsOn: "2026-12-31" });
  assert.ok(fy2?.fiscal_year_id, "the contiguous successor is admitted");

  // 18-month first FY (a separate, fresh client): admitted.
  const client18 = await freshActiveClient(owner, "a21b-18mo");
  const fy18 = await openFY(owner, { client: client18, label: "18mo", startsOn: "2025-01-01", endsOn: "2026-06-30", lengthReason: "x56 a21b 18-month first year" });
  assert.ok(fy18?.fiscal_year_id, "an 18-month first FY is admitted (exactly at the exclusive span bound)");

  // 19-month first FY (another fresh client): refused by the DDL span bound.
  const client19 = await freshActiveClient(owner, "a21b-19mo");
  const err19 = await caught(() => openFY(owner, { client: client19, label: "19mo", startsOn: "2025-01-01", endsOn: "2026-07-31", lengthReason: "x56 a21b 19-month first year" }));
  assert.ok(err19, "a 19-month first FY must be refused");
  assert.equal(err19.code, PG.checkViolation, `expected the DDL CHECK violation ${PG.checkViolation} (got ${err19.code} -- ${err19.message})`);
});

// ===========================================================================
// A23 -- fy_end_source honesty: the defaulted client reads 'default_1231',
// never 'asserted'; the asserted client reads 'asserted' and matches its
// own columns.
// ===========================================================================

test("A23 fy_end_source is honest: a client with NO fy_end set reads 'default_1231'; a client with fy_end SET reads 'asserted'", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;

  const defaultedClient = await freshActiveClient(owner, "a23-default");
  const proposalD = await proposeFY(owner, { client: defaultedClient, startsOn: "2027-01-01" });
  assert.equal(proposalD.fy_end.fallback, true, "mandatory setup: the proposal itself reports the fallback");
  const fyD = await openFY(owner, { client: defaultedClient, label: "defaulted", startsOn: "2027-01-01", endsOn: proposalD.ends_on });
  assert.equal(fyD.fy_end_source, "default_1231", "the defaulted client's FY reads default_1231, NEVER 'asserted'");
  const rowD = (await rootQuery("select fy_end_source from clara.fiscal_years where id=$1", [fyD.fiscal_year_id])).rows[0];
  assert.equal(rowD.fy_end_source, "default_1231", "the row itself matches");

  const assertedClient = await freshActiveClient(owner, "a23-asserted");
  const { getPool } = await import("./wave-a-fixtures.mjs");
  void getPool;
  await humanQuery(owner, "select clara.set_client_fy_end(p_client => $1, p_month => $2, p_day => $3, p_op_key => $4) as r", [assertedClient, 6, 30, opk("x56-a23-setfyend")]);
  const proposalA = await proposeFY(owner, { client: assertedClient, startsOn: "2027-01-01" });
  assert.equal(proposalA.fy_end.fallback, false, "mandatory setup: the proposal reports NO fallback once fy_end is set");
  const fyA = await openFY(owner, { client: assertedClient, label: "asserted", startsOn: "2027-01-01", endsOn: proposalA.ends_on, lengthReason: "x56 a23: a deliberate 6-month first year to the asserted fy_end" });
  assert.equal(fyA.fy_end_source, "asserted", "the asserted client's FY reads 'asserted'");
  const rowA = (await rootQuery("select fy_end_source, ends_on::text as ends_on from clara.fiscal_years where id=$1", [fyA.fiscal_year_id])).rows[0];
  assert.equal(rowA.fy_end_source, "asserted");
  assert.equal(rowA.ends_on, "2027-06-30", "the asserted client's FY end matches its own fy_end_month/day columns");
});

// ===========================================================================
// A9 -- the agent-role privilege sweep over the close/approve-class verb set:
// (i) a live call under clara_agent_ro raises 42501 before any body runs;
// (ii) a has_function_privilege sweep returns FALSE for agent_ro AND both
// wake roles, over every close/approve-class verb.
// ===========================================================================

const CLOSE_VERBS = [
  "clara.begin_close(uuid,text)",
  "clara.finalize_close(uuid,text,text)",
  "clara.attest_close_exception(uuid,text,text,text)",
  "clara.abandon_close(uuid,text,text)",
  "clara.reopen_fiscal_year(uuid,text,jsonb,text)",
  "clara.open_fiscal_year(uuid,text,date,date,text,text)",
  "clara.grant_firm_capability(uuid,text,text,text)",
  "clara.revoke_firm_capability(uuid,text,text,text)",
];

test("A9 the close/approve-class verb set: 42501 under clara_agent_ro before any body runs; a has_function_privilege sweep returns FALSE for agent_ro and BOTH wake roles over every verb", async (t) => {
  if (skip56(t)) return;
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(
    ROLES.agentRo, "select clara.begin_close(p_fy => $1, p_op_key => $2) as r",
    ["00000000-0000-4000-8000-000000000000", opk("x56-a9")],
  ), "agent_ro begin_close");

  for (const sig of CLOSE_VERBS) {
    const r = await rootQuery(
      `select has_function_privilege('clara_agent_ro', $1::regprocedure, 'EXECUTE') as agent_ro,
              has_function_privilege('clara_wake_proactive', $1::regprocedure, 'EXECUTE') as wake_proactive,
              has_function_privilege('clara_wake_interactive', $1::regprocedure, 'EXECUTE') as wake_interactive`,
      [sig],
    );
    const row = r.rows[0];
    assert.equal(row.agent_ro, false, `${sig}: clara_agent_ro must hold NO execute (got ${row.agent_ro})`);
    assert.equal(row.wake_proactive, false, `${sig}: clara_wake_proactive must hold NO execute (got ${row.wake_proactive})`);
    assert.equal(row.wake_interactive, false, `${sig}: clara_wake_interactive must hold NO execute (got ${row.wake_interactive})`);
  }
});
