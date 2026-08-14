// Wave E lane theta -- clara.get_close_plan(uuid), the typed plan document (the
// CLOSE half of plan-as-document, plumbing grade). CONTRACT-BLIND on the migration
// file: every claim here is proved against the LIVE CATALOG and the fixture's own
// audited-verb calls, never against 0064_wave_e_theta_close_plan.sql's text.
// A fiscal year is built ONLY through the audited close-model verbs (0056):
// propose/open_fiscal_year, begin_close, attest_close_exception, finalize_close --
// never a hand-written fiscal_years/close_runs/close_gate_results row.
//
// PRESENCE GATE: with CLARA_ALLOW_MISSING_WAVE_E_THETA=1 (set by the package-wide
// sweep's tests/theta-preintegration-gate.mjs --import) an un-migrated database
// SKIPS loudly; with the variable unset, a FOCUSED run against a pre-theta
// database FAILS instead of greening through silently (gateTheta(), below --
// the delta/epsilon/eta shape, verbatim).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, draftEntryV3, freshResolution,
} from "./wave-a-fixtures.mjs";
import { ROLES, wakeQuery } from "./rig-helpers.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, beginClose, finalizeClose, attestClose,
  BANK1, REVN, addDaysStr,
} from "./x56-fixtures.mjs";
import { mintInteractive } from "./s6-helpers.mjs";

let ready = false;
let has56 = false;
let hasTheta = false;
let world = null;

async function hasThetaFn() {
  return (await rootQuery(
    "select to_regprocedure('clara.get_close_plan(uuid)') is not null as ok",
  )).rows[0].ok;
}

/** Pre-integration gating, stated once: a PACKAGE-WIDE run may precede theta's own
 *  migration landing as a numbered file, so tests/theta-preintegration-gate.mjs
 *  (preloaded by the package test script) sets CLARA_ALLOW_MISSING_WAVE_E_THETA and
 *  this suite skips LOUDLY. A FOCUSED run does not preload the gate, so a pre-theta
 *  database fails here instead of greening through -- the delta/epsilon/eta shape,
 *  verbatim. This is separate from the ordinary ready/has56 prerequisite skips
 *  below (0011 / 0056 being absent is a different, already-settled problem; this
 *  gate is specifically about THIS lane's own function going silently missing). */
function gateTheta(t) {
  if (hasTheta) return true;
  if (process.env.CLARA_ALLOW_MISSING_WAVE_E_THETA === "1") {
    console.warn("SKIP theta contract: clara.get_close_plan is not applied to this database (explicit pre-integration run).");
    markSkip();
    t.skip("Wave E theta not applied -- explicit pre-integration run");
    return false;
  }
  assert.fail("Wave E theta (clara.get_close_plan) is required for a focused or post-migration run: apply the theta migration, or set CLARA_ALLOW_MISSING_WAVE_E_THETA=1 for the package-wide pre-integration sweep");
  return false;
}

function skipTheta(t) {
  if (!ready || !has56) {
    markSkip();
    t.skip("0011 surface or 0056 (close model) absent -- theta cannot be tested");
    return true;
  }
  return !gateTheta(t);
}

async function getClosePlan(sub, { fy }) {
  const r = await humanQuery(sub, "select clara.get_close_plan(p_fiscal_year_id => $1) as r", [fy]);
  return r.rows[0].r;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- theta-close-plan suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent, theta cannot be tested"); return; }
  hasTheta = await hasThetaFn();
  if (!hasTheta) { noteLane("clara.get_close_plan not applied -- theta lane absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("theta-close-plan"); printSkipCount("theta-close-plan"); await endPool(); });

// ===========================================================================
// T1 -- the plan document's shape at every stage: before any close begins
// (every check 'not_yet_measured', every attestation 'absent', receipt
// 'absent'), after begin_close (measured results land, one drawer-2 gate
// FAILS with a named outstanding item), after attest_close_exception (that
// item's attestation goes 'live'), and after finalize_close (receipt
// 'present', kind='close', pinned to the FY).
// ===========================================================================

test("T1 the plan document tracks not_yet_measured -> measured/fail -> attested(live) -> receipt(present)", async (t) => {
  if (skipTheta(t)) return;
  const owner = world.users.alice;
  const prep = world.users.hana; // admin, distinct from the closer (segregation, matrix A12)
  const startsOn = "2027-01-01";

  const fx = await cleanCloseableFY(owner, { tag: "theta-t1", prepSub: prep, startsOn });

  // BEFORE any close run: every one of the 13 catalog checks reads
  // 'not_yet_measured' (an honest absence, never a fabricated 'unknown'); every
  // check's sole '__gate__' item carries an explicit attestation absence; no
  // close run, no receipt.
  const pre = await getClosePlan(owner, { fy: fx.fy });
  assert.equal(pre.fiscal_year.id, fx.fy, "the plan names the fiscal year it was asked about");
  assert.equal(pre.fiscal_year.status, "open");
  assert.equal(pre.close_run.state, "absent", "no close run has begun yet");
  assert.equal(pre.receipt.state, "absent", "no receipt before any close");
  assert.equal(pre.checks.length, 13, "all 13 catalog checks ride the plan, unfiltered by applies_when");
  for (const c of pre.checks) {
    assert.equal(c.result.state, "not_yet_measured", `${c.check_key}: unmeasured before any close run`);
    assert.ok(Array.isArray(c.items) && c.items.length >= 1, `${c.check_key}: carries at least the __gate__ item`);
    for (const it of c.items) {
      assert.equal(it.attestation.state, "absent", `${c.check_key}/${it.item_key}: no attestation exists yet`);
    }
  }
  // Drawer/title/applies_when ride the catalog verbatim (a plan without them is
  // a plan the UI cannot render a shape+label row from).
  const arRow = pre.checks.find((c) => c.check_key === "ar_control_tie");
  assert.ok(arRow, "ar_control_tie is in the catalog");
  assert.equal(arRow.drawer, 1);
  assert.equal(typeof arRow.title, "string");
  assert.ok(arRow.title.length > 0);

  // A DRAFT (never approved) entry inside the FY -- forces unapproved_drafts_in_period
  // to FAIL with a named outstanding item (entry_id), a real drawer-2 exception.
  const midYear = addDaysStr(startsOn, 120);
  const draftD = await draftEntryV3(prep, {
    client: fx.client,
    resolution: await freshResolution(prep, fx.client, { subjectKind: "manual", subjectId: null }),
    memo: "theta t1: forces unapproved_drafts_in_period FAIL",
    postingDate: midYear,
    lines: [
      { account_code: BANK1, debit_cents: 1_000, credit_cents: 0, description: "dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 1_000, description: "cr" },
    ],
    opKey: opk("theta-t1-draft"),
  });
  const draftEntryId = draftD.entry_id;

  const begun = await beginClose(owner, { fy: fx.fy, opKey: opk("theta-t1-begin") });
  assert.ok(begun.close_run_id, "mandatory setup: begin_close succeeds");

  const mid = await getClosePlan(owner, { fy: fx.fy });
  assert.equal(mid.close_run.state, "present");
  assert.equal(mid.close_run.close_run_id, begun.close_run_id);
  assert.equal(mid.close_run.run_state, "in_progress");
  assert.equal(mid.receipt.state, "absent", "still no receipt -- not finalized yet");

  const draftsRow = mid.checks.find((c) => c.check_key === "unapproved_drafts_in_period");
  assert.ok(draftsRow, "unapproved_drafts_in_period rides the plan");
  assert.equal(draftsRow.result.state, "fail", "the forged draft makes this gate FAIL");
  assert.ok(typeof draftsRow.result.measured_digest === "string" && draftsRow.result.measured_digest.length > 0);
  const outstanding = draftsRow.items.map((it) => it.item_key);
  assert.ok(outstanding.includes(draftEntryId), "the draft entry's id is a named outstanding item, not a bare count");
  for (const it of draftsRow.items) {
    assert.equal(it.attestation.state, "absent", `${it.item_key}: not yet attested`);
  }
  // A passing drawer-1 gate, sanity: AR control ties (no AR activity in the fixture).
  const arMid = mid.checks.find((c) => c.check_key === "ar_control_tie");
  assert.equal(arMid.result.state, "pass");

  // Attest the exception -- per-item, naming the reason (the object-level verb
  // the dashboard's row-level attest action wires to).
  const attested = await attestClose(owner, {
    closeRun: begun.close_run_id, checkKey: "unapproved_drafts_in_period",
    itemKey: draftEntryId, reason: "theta t1: accepted for the rig fixture",
    opKey: opk("theta-t1-attest"),
  });
  assert.ok(attested, "mandatory setup: attest_close_exception succeeds");

  const afterAttest = await getClosePlan(owner, { fy: fx.fy });
  const draftsAfterAttest = afterAttest.checks.find((c) => c.check_key === "unapproved_drafts_in_period");
  const attestedItem = draftsAfterAttest.items.find((it) => it.item_key === draftEntryId);
  assert.ok(attestedItem, "the attested item is still named in the plan");
  assert.equal(attestedItem.attestation.state, "live", "a fresh attestation at the CURRENT digest reads live");
  assert.equal(attestedItem.attestation.attested_by, owner, "the plan names who attested");
  assert.equal(attestedItem.attestation.reason, "theta t1: accepted for the rig fixture");
  assert.ok(attestedItem.attestation.attested_at, "the plan carries when");

  // Finalize: the attested exception clears the gate; the receipt appears.
  const closed = await finalizeClose(owner, { fy: fx.fy, opKey: opk("theta-t1-finalize") });
  assert.ok(closed.receipt_id, "mandatory setup: finalize_close succeeds with the drawer-2 exception attested");

  const afterFinalize = await getClosePlan(owner, { fy: fx.fy });
  assert.equal(afterFinalize.fiscal_year.status, "closed");
  assert.equal(afterFinalize.close_run.run_state, "finalized");
  assert.equal(afterFinalize.receipt.state, "present", "the close receipt now rides the plan");
  assert.equal(afterFinalize.receipt.receipt_id, closed.receipt_id);
  assert.equal(afterFinalize.receipt.kind, "close");
  assert.equal(afterFinalize.receipt.status, "active");
  assert.equal(afterFinalize.receipt.closed_by, owner);
  assert.ok(afterFinalize.receipt.closing_position && typeof afterFinalize.receipt.closing_position === "object",
    "the receipt's closing_position pin rides the plan (never omitted -- it is what a successor FY ties against)");
  // The attested item survives finalize, still live (finalize did not touch the
  // attestation ledger, and the digest did not move underneath it).
  const draftsAfterFinalize = afterFinalize.checks.find((c) => c.check_key === "unapproved_drafts_in_period");
  const finalItem = draftsAfterFinalize.items.find((it) => it.item_key === draftEntryId);
  assert.equal(finalItem.attestation.state, "live");
});

// ===========================================================================
// T2 -- the named refusal for a fiscal year that does not exist: CLR11, the
// standing no-existence-oracle code -- never a crash, never a fabricated plan.
// ===========================================================================

test("T2 a nonexistent fiscal_year_id refuses CLR11 (no existence oracle)", async (t) => {
  if (skipTheta(t)) return;
  const owner = world.users.alice;
  const err = await caught(() => getClosePlan(owner, { fy: randomUUID() }));
  assert.ok(err, "a random fiscal_year_id must refuse, never return an empty plan");
  assert.equal(err.code, "CLR11", `expected CLR11 (got ${err.code} -- ${err.message})`);
});

// ===========================================================================
// T3 -- cross-firm isolation: firm B's owner (dave) asking about firm A's
// fiscal year gets the IDENTICAL refusal as T2's nonexistent id -- never
// foreign data, never a distinguishable "exists but not yours" answer.
// ===========================================================================

test("T3 a real fiscal year in a FOREIGN firm reads as the identical not-found refusal -- never foreign data", async (t) => {
  if (skipTheta(t)) return;
  const owner = world.users.alice; // firm A
  const foreignOwner = world.users.dave; // firm B
  const fx = await cleanCloseableFY(owner, { tag: "theta-t3", startsOn: "2027-01-01" });

  // Positive control first: the real owner CAN read it.
  const own = await getClosePlan(owner, { fy: fx.fy });
  assert.equal(own.fiscal_year.id, fx.fy, "mandatory setup: the owning firm's read succeeds");

  const err = await caught(() => getClosePlan(foreignOwner, { fy: fx.fy }));
  assert.ok(err, "firm B must be refused firm A's fiscal year");
  assert.equal(err.code, "CLR11", `expected CLR11 (got ${err.code} -- ${err.message})`);
  const detail = JSON.parse(err.detail ?? "{}");
  assert.equal(detail.reason, "fiscal_year_not_in_firm");
});

// ===========================================================================
// T4 -- the clara_agent_ro grant, asserted POSITIVELY: not just a privilege
// check (state, not text) but a REAL successful call under a minted wake
// credential, whose answer matches the human lane's for the same firm/FY.
// ===========================================================================

test("T4 clara_agent_ro can execute get_close_plan (privilege state) and a real wake-credential call succeeds with the same answer as the human lane", async (t) => {
  if (skipTheta(t)) return;
  const owner = world.users.alice; // firm A
  const fx = await cleanCloseableFY(owner, { tag: "theta-t4", startsOn: "2027-01-01" });

  // Absence is not evidence -- a real call is the only positive proof this grant
  // works, but the privilege STATE is checked too (both instruments, matrix-style).
  const priv = await rootQuery(
    "select has_function_privilege('clara_agent_ro','clara.get_close_plan(uuid)','execute') as ok",
  );
  assert.equal(priv.rows[0].ok, true, "clara_agent_ro must hold EXECUTE on get_close_plan");

  const cred = await mintInteractive(world.firms.A);
  const agentRes = await wakeQuery(ROLES.agentRo, cred.secret,
    "select clara.get_close_plan(p_fiscal_year_id => $1) as r", [fx.fy]);
  const agentPlan = agentRes.rows[0].r;
  assert.ok(agentPlan, "the agent lane's call must actually succeed, not merely be granted");
  assert.equal(agentPlan.fiscal_year.id, fx.fy, "the agent lane resolves the SAME fiscal year the human lane would");
  assert.equal(agentPlan.fiscal_year.status, "open");
  assert.equal(agentPlan.checks.length, 13);

  const humanPlan = await getClosePlan(owner, { fy: fx.fy });
  assert.deepEqual(agentPlan, humanPlan, "the agent lane and the human lane see the identical plan for the same firm");

  // Cross-firm under the agent lane too: a wake credential minted for firm A
  // must not see firm B's data even by construction (there is none to leak
  // here, but the SAME refusal code must fire).
  const fxB = await cleanCloseableFY(world.users.dave, { tag: "theta-t4-b", startsOn: "2027-01-01" });
  let crossErr = null;
  try {
    await wakeQuery(ROLES.agentRo, cred.secret,
      "select clara.get_close_plan(p_fiscal_year_id => $1) as r", [fxB.fy]);
  } catch (e) { crossErr = e; }
  assert.ok(crossErr, "firm A's wake credential must be refused firm B's fiscal year");
  assert.equal(crossErr.code, "CLR11", `expected CLR11 (got ${crossErr.code} -- ${crossErr.message})`);
});
