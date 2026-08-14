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
import { mintInteractive, filedDocument } from "./s6-helpers.mjs";

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

test("T3 a real fiscal year in a FOREIGN firm reads as the BYTE-IDENTICAL refusal to a nonexistent one -- never foreign data, never an oracle in the text", async (t) => {
  if (skipTheta(t)) return;
  const owner = world.users.alice; // firm A
  const foreignOwner = world.users.dave; // firm B
  const fx = await cleanCloseableFY(owner, { tag: "theta-t3", startsOn: "2027-01-01" });

  // Positive control first: the real owner CAN read it.
  const own = await getClosePlan(owner, { fy: fx.fy });
  assert.equal(own.fiscal_year.id, fx.fy, "mandatory setup: the owning firm's read succeeds");

  const nonexistentErr = await caught(() => getClosePlan(owner, { fy: randomUUID() }));
  const foreignErr = await caught(() => getClosePlan(foreignOwner, { fy: fx.fy }));
  assert.ok(nonexistentErr, "a random fiscal_year_id must refuse, never return an empty plan");
  assert.ok(foreignErr, "firm B must be refused firm A's fiscal year");
  assert.equal(nonexistentErr.code, "CLR11", `expected CLR11 (got ${nonexistentErr.code} -- ${nonexistentErr.message})`);
  assert.equal(foreignErr.code, "CLR11", `expected CLR11 (got ${foreignErr.code} -- ${foreignErr.message})`);
  // THE NO-ORACLE PROOF, byte-for-byte (fix-docket finding 4): SQLSTATE
  // equality alone lets an oracle hide in the message or detail text -- an
  // implementation that returns CLR11 for both cases but embeds "exists in
  // another firm" only in the foreign-FY message would still pass a
  // code-only assertion. message and detail must be IDENTICAL strings.
  assert.equal(foreignErr.message, nonexistentErr.message,
    "the foreign-FY refusal's MESSAGE must be byte-identical to the nonexistent-FY refusal's -- any difference is an oracle");
  assert.equal(foreignErr.detail, nonexistentErr.detail,
    "the foreign-FY refusal's DETAIL must be byte-identical to the nonexistent-FY refusal's -- any difference is an oracle");
  const detail = JSON.parse(foreignErr.detail ?? "{}");
  assert.equal(detail.reason, "fiscal_year_not_in_firm");
});

// ===========================================================================
// T4 -- the clara_agent_ro grant, asserted NEGATIVELY (T17's ruling,
// rig-isolation.test.mjs:531): no shipped consumer calls get_close_plan
// through the agent read lane today -- grepped across packages/runtime and
// the whole repo, nothing outside this lane's own files does -- so the grant
// this file originally shipped was speculative surface-widening (the
// ADR-0070 ruling 8 shape) and was revoked from the migration. Both
// instruments, matrix-style, the same discipline a positive grant would get,
// just flipped: the privilege STATE is false, and a REAL wake-credential call
// is refused (42501, before the body ever runs -- the design's own §3.1
// negative-battery shape for an agent-denied read). clara_authenticated's
// grant is checked positively in the same test, so the row reads as one
// matrix rather than two disconnected assertions.
// ===========================================================================

test("T4 clara_agent_ro CANNOT execute get_close_plan (no shipped consumer, T17); clara_authenticated can", async (t) => {
  if (skipTheta(t)) return;
  const owner = world.users.alice; // firm A
  const fx = await cleanCloseableFY(owner, { tag: "theta-t4", startsOn: "2027-01-01" });

  const priv = await rootQuery(
    "select has_function_privilege('clara_authenticated','clara.get_close_plan(uuid)','execute') as auth, " +
    "has_function_privilege('clara_agent_ro','clara.get_close_plan(uuid)','execute') as agent",
  );
  assert.equal(priv.rows[0].auth, true, "clara_authenticated must hold EXECUTE on get_close_plan -- the /close consumer needs it");
  assert.equal(priv.rows[0].agent, false, "clara_agent_ro must NOT hold EXECUTE on get_close_plan -- no shipped agent-lane consumer exists");

  // The human lane's real call still succeeds (positive control -- revoking
  // the agent grant must never collaterally break the shipped consumer).
  const humanPlan = await getClosePlan(owner, { fy: fx.fy });
  assert.equal(humanPlan.fiscal_year.id, fx.fy, "mandatory setup: the human lane's real call still succeeds");

  // Absence is not evidence -- a real, denied call is the only positive proof
  // the revoke actually took, not just a privilege-table read.
  const cred = await mintInteractive(world.firms.A);
  const err = await caught(() => wakeQuery(ROLES.agentRo, cred.secret,
    "select clara.get_close_plan(p_fiscal_year_id => $1) as r", [fx.fy]));
  assert.ok(err, "a real wake-credential call must be refused -- the grant is gone, not merely unused");
  assert.equal(err.code, "42501", `expected 42501 (permission denied, before the body ever runs) -- got ${err.code} -- ${err.message}`);
});

// ===========================================================================
// T5 -- the stale attestation branch, reached for REAL (fix-docket finding
// 5): attest one outstanding item, change the measured set (a second uncoded
// document lands in the FY), force a fresh audited re-evaluation of the SAME
// check by attesting the new item (attest_close_exception re-measures the
// whole gate as part of attesting, 0056:1872's A20 recovery fix -- it does
// not trust a stored digest), and confirm the FIRST item's attestation now
// reads 'stale' -- bound to a digest the current measurement has moved past
// -- while the second item's fresh attestation reads 'live'.
//
// uncoded_documents, not unapproved_drafts_in_period, is the vehicle: once
// begin_close flips the FY to 'closing', the closed-period wall's LINES
// sibling (_tf_period_wall_lines, 0056) refuses EVERY journal_lines write
// tied to that FY -- including a fresh, never-approved draft -- because it
// walls the FY's close WINDOW, not the touch's approval state (measured
// directly: a second draft entry inserted here raises CLR19). document_filings
// carries only the SERIALIZE half of the wall (0056 S4(B)), never the refusal
// half, so filing a second uncoded document mid-close is the honest way to
// change a drawer-2 gate's measured set without fighting a wall this lane
// does not own.
// ===========================================================================

test("T5 an attestation goes stale when the measured set changes under a fresh audited re-evaluation", async (t) => {
  if (skipTheta(t)) return;
  const owner = world.users.alice;
  const startsOn = "2027-01-01";
  const fx = await cleanCloseableFY(owner, { tag: "theta-t5", startsOn });

  const docA = await filedDocument(owner, { firm: world.firms.A, client: fx.client, financialDate: addDaysStr(startsOn, 60) });

  const begun = await beginClose(owner, { fy: fx.fy, opKey: opk("theta-t5-begin") });

  const afterBegin = await getClosePlan(owner, { fy: fx.fy });
  const rowAfterBegin = afterBegin.checks.find((c) => c.check_key === "uncoded_documents");
  assert.equal(rowAfterBegin.result.state, "fail", "mandatory setup: an uncoded document inside the FY fails the gate");
  assert.ok(rowAfterBegin.items.some((it) => it.item_key === docA.filingId), "mandatory setup: A is a named outstanding item");

  // Attest A -- binds to a digest naming ONLY A outstanding (attest's own
  // fresh re-evaluation, 0056:1872).
  await attestClose(owner, {
    closeRun: begun.close_run_id, checkKey: "uncoded_documents",
    itemKey: docA.filingId, reason: "theta t5: accept A first", opKey: opk("theta-t5-attest-a"),
  });
  const afterA = await getClosePlan(owner, { fy: fx.fy });
  const rowAfterA = afterA.checks.find((c) => c.check_key === "uncoded_documents");
  const itemAAfterA = rowAfterA.items.find((it) => it.item_key === docA.filingId);
  assert.ok(itemAAfterA, "mandatory setup: A is still a named outstanding item");
  assert.equal(itemAAfterA.attestation.state, "live", "mandatory setup: A's attestation is live immediately after attesting");

  // Change the measured set: a SECOND uncoded document lands in the FY, mid-close.
  const docB = await filedDocument(owner, { firm: world.firms.A, client: fx.client, financialDate: addDaysStr(startsOn, 65) });

  // Force the fresh audited re-evaluation: attesting B re-measures the WHOLE
  // gate (both A and B are uncoded at this point), producing a NEW
  // close_gate_results row whose digest differs from the one A's attestation
  // bound to -- A's underlying condition (still uncoded) never went away, so
  // it stays a named outstanding item, now under a superseded digest.
  await attestClose(owner, {
    closeRun: begun.close_run_id, checkKey: "uncoded_documents",
    itemKey: docB.filingId, reason: "theta t5: accept B, re-measuring the gate", opKey: opk("theta-t5-attest-b"),
  });

  const afterB = await getClosePlan(owner, { fy: fx.fy });
  const rowAfterB = afterB.checks.find((c) => c.check_key === "uncoded_documents");
  const itemAAfterB = rowAfterB.items.find((it) => it.item_key === docA.filingId);
  const itemBAfterB = rowAfterB.items.find((it) => it.item_key === docB.filingId);
  assert.ok(itemAAfterB, "A is still a named outstanding item after the re-measurement -- its underlying document never got coded");
  assert.ok(itemBAfterB, "B is a named outstanding item too");
  assert.equal(itemAAfterB.attestation.state, "stale",
    "A's attestation is bound to a SUPERSEDED digest now that B's presence moved the measured set -- it must read stale, never live");
  assert.equal(itemBAfterB.attestation.state, "live",
    "B's attestation is fresh against the CURRENT digest");
  // Sanity: a genuinely absent attestation is still its own distinct state,
  // not conflated with stale (both are "not live", but for different reasons).
  assert.notEqual(itemAAfterB.attestation.state, "absent");
});
