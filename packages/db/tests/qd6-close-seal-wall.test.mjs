// Q-D6 — THE CLOSE-SEAL WALL WHILE THE DEFERRED-OPENING BANNER IS UP.
// Behavioural battery for `migrations/UNNUMBERED_qd6_close_seal_wall.sql`.
// NEVER LIVE: this file drives writes and runs only against a disposable rig.
//
// THE RULING (owner's own, constraint 1 — `docs/plan/active/fa7b-gate-record.md:44-46`):
//   "Q-D6 — RULED: a close may NOT SEAL while the deferred-opening banner is up, and NO
//    owner-override door ships. Drawer-1 (absolute, no attestation path) is the mechanism."
//
// THE 裁-108 SKIP, stated so nobody mistakes it for coverage: the migration ships
// UNNUMBERED, and `scripts/migrate.mjs`'s own file filter (`MIGRATION_LIKE = /^\d+.*\.sql$/`,
// migrate.mjs:59) SILENTLY SKIPS any file that does not start with four digits. So on CI,
// and on any rig migrated before the number is claimed, the gate does not exist and every
// cell below skips LOUDLY through `qd6Gate()`. The number claim at merge prep is what ARMS
// this file — that is 裁-108's whole point, and the merge-prep re-verify is the step that
// proves these cells then run for real rather than skipping.
//
// CONTRACT-BLIND: every claim is proved against the LIVE CATALOG and through the SHIPPED
// doors. No cell re-implements the gate's predicate and asserts against its own copy
// (裁-112) — the wall is measured by calling `finalize_close` and reading what it refused.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, upsertAccountClassed,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, freshActiveClient, setupCloseCoa, proposeFY, openFY, beginClose,
  finalizeClose, abandonClose, attestClose, getCloseReadiness, grantCapability, plainEntry,
  BANK1, RE1, REVN, EXPN, addDaysStr,
} from "./x56-fixtures.mjs";
import { getClosePlan, detailOf } from "./er9-corpus-fixtures.mjs";

const KEY = "deferred_opening_resolved";
const EVALUATOR = "clara._close_gate_deferred_opening(uuid,uuid)";
const OBE_QD6 = "905-QD6";          // the seed's opening-balance-equity marker
const FY_STARTS = "2027-01-01";
const SEED_AS_OF = "2026-12-31";    // strictly BEFORE the FY, so real GL at as_of is 0
                                    // and the K5 tie's targets equal the draft batch.
const OPEN_CENTS = 100_000;

// The thirteen 0056 keys plus 0104's fourteenth — named individually so an arrival can
// never be absorbed by a bare count (er9/f-a4 census C15's own discipline).
const PRE_KEYS = [
  "ar_control_tie", "ap_control_tie", "fa_control_tie", "bank_recon_identity",
  "pl_retained_earnings_roll", "opening_continuity_tie", "depreciation_through_fy_end",
  "closing_stock_present", "unapproved_drafts_in_period", "open_bank_recon_items",
  "uncoded_documents", "undated_documents", "bank_recon_informational", "fa_register_tie_view",
];

let ready = false, has56 = false, hasQd6 = false, world = null;
let walled = null;      // the deferred-opening client, walled
let control = null;     // a client with no onboarding plan at all

function qd6Gate(t) {
  if (!ready || !has56) { markSkip(); t.skip("0056 (close model) not present"); return true; }
  if (!hasQd6) { markSkip(); t.skip("Q-D6 wall not applied (the migration is still UNNUMBERED — 裁-108)"); return true; }
  return false;
}

/** A client born through the REAL onboarding doors and activated on
 *  `commit_client_onboarding`'s THIRD arm — the `carry_down_deferred` item, which is the
 *  posture design D-6 names (playbooks ③ bank-only / ④ shoebox take NO opening seed).
 *  hana opens the plan and bob answers it (both become contributors), so alice — who
 *  touched neither — is the eligible non-contributor committer the admin floor requires.
 *  Returns everything the later cells need to drive a close on it. */
async function deferredOpeningClient(tag) {
  const onb = await wb.onboardingClient(world.users.hana, `qd6_${tag}_${opk("n").slice(-8)}`);
  await wb.updatePlan({
    plan: onb.plan, expectedRevision: onb.revision, answeredBy: world.users.bob,
    items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }],
  });
  const commit = await wb.commitOnboarding(world.users.alice, {
    client: onb.client, plan: onb.plan, expectedPlanRevision: await wb.planRevision(onb.plan),
  });
  assert.equal(commit.status, "active",
    "mandatory setup: the client activated on the DEFERRED arm — the opening was never captured");
  await setupCloseCoa(world.users.alice, onb.client);
  // The opening seed's contra home. setupCloseCoa carries a retained-earnings marker but
  // no opening-balance-equity one, and draft_opening_item refuses `obe_not_nil` without it.
  await upsertAccountClassed(world.users.alice, {
    client: onb.client, code: OBE_QD6, name: "Opening Balance Equity (qd6)", type: "equity",
    special: "opening_balance_equity", opKey: opk("qd6-obe"),
  });
  const proposal = await proposeFY(world.users.alice, { client: onb.client, startsOn: FY_STARTS });
  const opened = await openFY(world.users.alice, {
    client: onb.client, label: `qd6 ${tag} FY1`, startsOn: FY_STARTS, endsOn: proposal.ends_on,
  });
  // bob prepares, alice closes — finalize_close's segregation arm wants a closer who is
  // not the year's last human preparer.
  const mid = addDaysStr(FY_STARTS, 90);
  await plainEntry(world.users.bob, { client: onb.client, debit: BANK1, credit: REVN, cents: 500_000, postingDate: mid, memo: "qd6 revenue" });
  await plainEntry(world.users.bob, { client: onb.client, debit: EXPN, credit: BANK1, cents: 200_000, postingDate: mid, memo: "qd6 expense" });
  return { client: onb.client, plan: onb.plan, fy: opened.fiscal_year_id, endsOn: proposal.ends_on };
}

/** THE RESOLUTION ACT, driven through the real doors and nothing else: create the keyed
 *  seed, draft one gl_balance carry-down plus the OBE-balancing equity_net, record both
 *  targets, and approve the batch. `approve_opening_seed` is the ONLY human door (with its
 *  correction sibling) that sets `opening_seed_registry.state='finalized'` — measured on
 *  the rig, not assumed — and that state IS what this wall reads as "captured".
 *  alice drafts; hana approves (K5 is admin-floor and refuses a self-approval while the
 *  firm carries two or more eligible checkers). */
async function captureOpening({ client, plan }) {
  const receipt = await wb.createOpeningSeed(world.users.alice, {
    client, plan, asOf: SEED_AS_OF, tieDocument: null, tieSha256: null,
  });
  const seed = receipt.seed_id ?? receipt.id;
  const revMap = {};
  const gl = await wb.draftOpeningItem(world.users.alice, {
    client, seed,
    item: { item_kind: "gl_balance", item_key: "qd6-bank-open" },
    lines: [{ account_code: BANK1, debit_cents: OPEN_CENTS, credit_cents: 0 }],
    resolution: wb.keyedRes(world.users.alice, { client, seed }),
  });
  revMap[gl.entry_id] = gl.revision_token;
  await wb.recordOpeningTarget(world.users.alice, {
    seed, line: { line_key: "qd6-bank-open", account_code: BANK1, debit_cents: OPEN_CENTS, credit_cents: 0 },
  });
  // Each item's OBE contra is the exact negation of its own leg, so the balancing
  // equity_net's amount is the signed sum of the others — x40's arithmetic law, reused.
  const bal = await wb.draftOpeningItem(world.users.alice, {
    client, seed,
    item: { item_kind: "equity_net", item_key: "qd6-obe-balance", amount_cents: OPEN_CENTS },
    resolution: wb.keyedRes(world.users.alice, { client, seed }),
  });
  revMap[bal.entry_id] = bal.revision_token;
  await wb.recordOpeningTarget(world.users.alice, {
    seed, line: { line_key: "qd6-obe-balance", account_code: RE1, debit_cents: 0, credit_cents: OPEN_CENTS },
  });
  await wb.approveOpeningSeed(world.users.hana, {
    seed, planRevision: await wb.planRevision(plan), tieSha256: null, entryRevisions: revMap,
  });
  return seed;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent — Q-D6 battery skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied — close model absent"); return; }
  // THE WITNESS IS THE EVALUATOR BODY, BY EXACT SIGNATURE — and deliberately NOT the catalog
  // row. Measured the hard way on the rig: gating on the ROW made "somebody dropped the gate
  // row" indistinguishable from "the migration was never applied", so the RED-before mutant
  // that deletes the row SKIPPED the whole battery instead of reddening it — a false green in
  // the instrument itself. The migration creates the body and the row in one transaction, so
  // the body is a faithful applied-or-not witness; the ROW is then something C0 and the wall
  // cells ASSERT, which is what makes dropping it a red.
  hasQd6 = (await rootQuery(
    "select to_regprocedure($1) is not null as ok", [EVALUATOR])).rows[0].ok;
  if (!hasQd6) {
    noteLane("Q-D6 wall ABSENT — the migration is still UNNUMBERED and migrate.mjs skips it by filename (裁-108). Claim the number to arm this battery.");
    return;
  }
  world = await wb.buildWaveBWorld();
  walled = await deferredOpeningClient("wall");
  control = { client: await freshActiveClient(world.users.alice, "qd6ctl") };
  await setupCloseCoa(world.users.alice, control.client);
  const p = await proposeFY(world.users.alice, { client: control.client, startsOn: FY_STARTS });
  const o = await openFY(world.users.alice, {
    client: control.client, label: "qd6 control FY1", startsOn: FY_STARTS, endsOn: p.ends_on,
  });
  control.fy = o.fiscal_year_id;
  const mid = addDaysStr(FY_STARTS, 90);
  await plainEntry(world.users.bob, { client: control.client, debit: BANK1, credit: REVN, cents: 500_000, postingDate: mid, memo: "qd6 ctl revenue" });
  await plainEntry(world.users.bob, { client: control.client, debit: EXPN, credit: BANK1, cents: 200_000, postingDate: mid, memo: "qd6 ctl expense" });
});

after(async () => {
  printLaneNotes("qd6-close-seal-wall");
  printSkipCount("qd6-close-seal-wall");
  await endPool();
});

// =====================================================================================
// C0 — THE CATALOG. The ruling's mechanism is DRAWER 1, and drawer is data a reviewer diffs.
// =====================================================================================

test("qd6.C0 the gate catalog carries FIFTEEN checks and the fifteenth is a DRAWER-1 identity wired to a real evaluator — every pre-existing key still named individually", async (t) => {
  if (qd6Gate(t)) return;
  const rows = (await rootQuery(
    "select check_key, drawer, title, evaluator_fn, applies_when from clara.close_gate_checks order by check_key")).rows;
  assert.equal(rows.length, 15, "the catalog is fifteen rows");
  const keys = rows.map((r) => r.check_key);
  for (const k of PRE_KEYS) {
    assert.ok(keys.includes(k), `the pre-existing key ${k} survives — the catalog is append-only and nothing may be lost`);
  }
  assert.deepEqual([...keys].sort(), [...PRE_KEYS, KEY].sort(),
    "the catalog is EXACTLY the fourteen pre-existing keys plus deferred_opening_resolved — no other key arrived");
  assert.equal(rows.filter((r) => r.drawer === 1).length, 7, "drawer 1 grows from six to seven");
  assert.equal(rows.filter((r) => r.drawer === 2).length, 6, "six drawer-2 checks, unmoved");
  assert.equal(rows.filter((r) => r.drawer === 3).length, 2, "two drawer-3 advisory checks, unmoved");

  const row = rows.find((r) => r.check_key === KEY);
  assert.equal(row.drawer, 1,
    "DRAWER 1 is the ruling itself — absolute, with no attestation path, for anybody");
  assert.equal(row.applies_when, "always",
    "the deferred-opening posture is possible for any client, not only a goods trader");
  assert.equal(row.evaluator_fn, "clara._close_gate_deferred_opening");
  // The name is a PROJECTION of the thing (review law 3) — resolve it, never trust it.
  const resolves = (await rootQuery(
    "select to_regprocedure($1 || '(uuid,uuid)') is not null as ok", [row.evaluator_fn])).rows[0].ok;
  assert.equal(resolves, true, "the catalog's evaluator_fn names a function that actually exists at the exact signature");
});

// =====================================================================================
// W1 — THE WALL. The cell that must red when the gate is removed.
// =====================================================================================

test("qd6.W1 THE WALL: a client activated on the deferred-opening arm CANNOT finalize its close — CLR41 drawer1_identity_failed naming deferred_opening_resolved, with the plan and item that hold the posture in the measurement", async (t) => {
  if (qd6Gate(t)) return;
  await beginClose(world.users.alice, { fy: walled.fy });
  const err = await caught(() => finalizeClose(world.users.alice, { fy: walled.fy }));
  assert.ok(err, "finalize must REFUSE while the opening is uncaptured");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} — ${err.message})`);
  // THE PROSE, pinned as well as the code: this is what a human actually reads, and
  // finalize_close's drawer-1 arm (0128:189-190) states the absoluteness in the message
  // itself. A refusal that stopped saying "no attestation path exists" would be a different
  // promise even if the errcode were unchanged.
  assert.equal(err.message,
    `drawer-1 identity ${KEY} FAILED -- no attestation path exists, for anybody`,
    `the refusal prose is the shipped drawer-1 sentence, naming this gate (got: ${err.message})`);
  const d = detailOf(err);
  assert.equal(d.reason, "drawer1_identity_failed",
    "a drawer-1 identity failure, which is the arm that has no attestation branch anywhere");
  assert.equal(d.check_key, KEY, "and it names THIS gate, not some neighbouring drawer-1 tie");
  assert.equal(d.measured.reason, "deferred_opening_unresolved");
  assert.equal(d.measured.finalized_seed_id, null, "no opening seed has been finalized for this client");
  assert.equal(d.measured.deferred_count, 1);
  assert.equal(d.measured.deferred[0].plan_id, walled.plan,
    "the refusal names WHICH plan owes the opening — a reader is told what to go and fix");
  assert.equal(d.measured.deferred[0].item_state, "deferred");

  // The year is still mid-close and NOTHING was sealed: no receipt, status unmoved.
  const fy = (await rootQuery("select status from clara.fiscal_years where id=$1", [walled.fy])).rows[0];
  assert.equal(fy.status, "closing", "a refused finalize leaves the year mid-close, never half-sealed");
  const receipts = (await rootQuery(
    "select count(*)::int as n from clara.close_receipts where fiscal_year_id=$1", [walled.fy])).rows[0].n;
  assert.equal(receipts, 0, "and mints no close receipt");
});

// =====================================================================================
// S1 — THE READER SEES IT FIRST. A wall a human meets only by trying is a bad wall.
// =====================================================================================

test("qd6.S1 get_close_readiness and get_close_plan surface the refusal BEFORE finalize is called — the failing gate, its drawer and its measured reason are all readable on the in-progress run", async (t) => {
  if (qd6Gate(t)) return;
  const readiness = await getCloseReadiness(world.users.alice, { client: walled.client, fy: walled.fy });
  assert.equal(readiness.gates.length, 15, "every catalog check rides the readiness read");
  const g = readiness.gates.find((x) => x.check_key === KEY);
  assert.ok(g, "the new gate is present on the readiness read, not silently omitted");
  assert.equal(g.drawer, 1);
  assert.equal(g.state, "fail", "and it reads FAIL — the human learns why finalize will refuse without trying it");
  assert.equal(g.measured.reason, "deferred_opening_unresolved");

  const plan = await getClosePlan(world.users.alice, walled.fy);
  assert.equal(plan.checks.length, 15, "the close plan lists all fifteen checks");
  const pc = plan.checks.find((c) => c.check_key === KEY);
  assert.ok(pc, "including this one");
  assert.equal(pc.drawer, 1);
  assert.equal(pc.result.state, "fail");
});

// =====================================================================================
// W2 — NO OVERRIDE DOOR. Measured through the SHIPPED guard, not a restatement of it.
// =====================================================================================

test("qd6.W2 NO owner-override door: attest_close_exception REFUSES this gate for an admin and for the firm owner alike — drawer 1 has no override, for anybody", async (t) => {
  if (qd6Gate(t)) return;
  const run = (await rootQuery(
    "select id from clara.close_runs where fiscal_year_id=$1 and state='in_progress'", [walled.fy])).rows[0].id;
  // MANDATORY SETUP, and the reason this cell is not vacuous: attest_close_exception's FIRST
  // wall is the close_and_attest capability (CLR04). An admin without it would be refused
  // before the drawer guard was ever reached, and the cell would "prove" the wall while
  // measuring a different refusal entirely. hana is granted the capability so the CLR41 she
  // gets back is genuinely the DRAWER guard biting on a fully-capable admin.
  await grantCapability(world.users.alice, {
    user: world.users.hana, capability: "close_and_attest",
    reason: "qd6 rig: a fully-capable admin, so the drawer-1 refusal is the one being measured",
  });
  const capable = (await rootQuery(
    `select count(*)::int as n from clara.firm_capability_grants
      where user_id=$1 and capability='close_and_attest' and revoked_at is null`,
    [world.users.hana])).rows[0].n;
  assert.equal(capable, 1, "mandatory setup: the admin really does hold close_and_attest now");
  for (const [who, label] of [[world.users.alice, "the owner"], [world.users.hana, "a capability-holding admin"]]) {
    const err = await caught(() => attestClose(who, {
      closeRun: run, checkKey: KEY, reason: "qd6 rig: an override that must not exist",
    }));
    assert.ok(err, `${label} must be refused an attestation on a drawer-1 identity`);
    assert.equal(err.code, "CLR41", `expected CLR41 for ${label} (got ${err.code} — ${err.message})`);
    assert.equal(detailOf(err).reason, "drawer1_identity_failed");
    assert.equal(detailOf(err).drawer, 1);
  }
  // No attestation row was minted by either attempt — the refusals are real, not cosmetic.
  const n = (await rootQuery(
    "select count(*)::int as n from clara.close_attestations where close_run_id=$1 and check_key=$2",
    [run, KEY])).rows[0].n;
  assert.equal(n, 0);
});

test("qd6.W2b ABSENCE CLAIM, with its instrument and its scope NAMED: inside schema `clara`, the ONLY function body that mentions this check_key is the shipped dispatch, and the only one that mentions the evaluator is that same dispatch — there is no second, bypassing entrance", async (t) => {
  if (qd6Gate(t)) return;
  // INSTRUMENT: pg_proc.prosrc over every function in schema clara (not a repo grep, which
  // cannot see a body constructed at deploy time). SCOPE: schema clara only; the catalog row
  // itself is data, not a body, and is excluded by construction.
  const byKey = (await rootQuery(
    `select p.oid::regprocedure::text as sig from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.prosrc like '%' || $1 || '%' order by 1`, [KEY])).rows.map((r) => r.sig);
  assert.deepEqual(byKey, ["clara._measure_one_gate(text,uuid,uuid)"],
    "exactly one body knows this check_key — the catalog dispatch. A second one would be a second entrance.");
  const byFn = (await rootQuery(
    `select p.oid::regprocedure::text as sig from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.prosrc like '%_close_gate_deferred_opening%' order by 1`)).rows.map((r) => r.sig);
  assert.deepEqual(byFn, ["clara._measure_one_gate(text,uuid,uuid)"],
    "and exactly one body calls the evaluator");
});

// =====================================================================================
// U1 — WHAT THE RULING DOES NOT FORBID stays reachable. The wall is on SEALING only.
// =====================================================================================

test("qd6.U1 abandon_close is UNTOUCHED: the same walled client can abandon its run while the gate is failing — the ruling forbids sealing, not stepping back", async (t) => {
  if (qd6Gate(t)) return;
  const run = (await rootQuery(
    "select id from clara.close_runs where fiscal_year_id=$1 and state='in_progress'", [walled.fy])).rows[0].id;
  await abandonClose(world.users.alice, { closeRun: run, reason: "qd6 rig: capture the opening first" });
  const fy = (await rootQuery("select status from clara.fiscal_years where id=$1", [walled.fy])).rows[0];
  assert.equal(fy.status, "open", "the year returns to open");
  const state = (await rootQuery("select state from clara.close_runs where id=$1", [run])).rows[0].state;
  assert.equal(state, "abandoned");
});

// =====================================================================================
// R1 — THE RESOLUTION. Measured, not assumed: the SAME client, after the real capture act.
// =====================================================================================

test("qd6.R1 THE RESOLUTION ARM: the SAME client, once approve_opening_seed has finalized its opening, closes clean — the gate reads pass/opening_seed_finalized and finalize seals", async (t) => {
  if (qd6Gate(t)) return;
  const seed = await captureOpening({ client: walled.client, plan: walled.plan });
  const reg = (await rootQuery(
    "select state from clara.opening_seed_registry where id=$1", [seed])).rows[0];
  assert.equal(reg.state, "finalized",
    "mandatory setup: the capture act really did finalize the registry — this is the fact the wall reads");

  await beginClose(world.users.alice, { fy: walled.fy });
  const receipt = await finalizeClose(world.users.alice, { fy: walled.fy });
  assert.ok(receipt.close_receipt_id ?? receipt.receipt_id ?? receipt.id,
    `the close now SEALS (got ${JSON.stringify(receipt)})`);

  const run = (await rootQuery(
    "select id from clara.close_runs where fiscal_year_id=$1 and state='finalized'", [walled.fy])).rows[0].id;
  const g = (await rootQuery(
    `select distinct on (check_key) state, measured from clara.close_gate_results
      where close_run_id=$1 and check_key=$2 order by check_key, seq desc`, [run, KEY])).rows[0];
  assert.equal(g.state, "pass");
  assert.equal(g.measured.reason, "opening_seed_finalized",
    "and it passes for the RIGHT reason — the seed was finalized, not because the posture vanished");
  assert.equal(g.measured.finalized_seed_id, seed);
  assert.equal(g.measured.deferred_count, 1,
    "the deferred item is still on the plan — approve_opening_seed never resolves it, which is exactly why the wall could not key on that item alone");
});

// =====================================================================================
// K1/G1 — THE CONTROLS. A wall that reds everything is not a wall.
// =====================================================================================

test("qd6.K1 CONTROL + THE PRECEDENCE CONJUNCT: an ordinary rig client — first-year-zero opening, carry-down todo resolved — closes exactly as before, and the gate reads no_deferred_opening even though a carry_down_deferred row IS on its plan", async (t) => {
  if (qd6Gate(t)) return;
  // MANDATORY SETUP: this client carries BOTH opening keys, so the cell exercises the
  // PRECEDENCE and not the trivial "no such item" path. It is the same precedence the web
  // surface applies (opening-position-gate.tsx:83-85), read here from the live rows.
  const items = (await rootQuery(
    `select i.item_key, i.state from clara.onboarding_plan_items i
       join clara.onboarding_plans p on p.id = i.plan_id
      where p.client_id=$1 and p.scope_kind='client' order by i.item_key`, [control.client])).rows;
  assert.deepEqual(items.map((r) => `${r.item_key}:${r.state}`).sort(),
    ["carry_down_deferred:resolved", "first_year_zero_opening:answered"],
    "the rig's activation bridge answers first-year-zero and settles the carry-down todo");
  await beginClose(world.users.alice, { fy: control.fy });
  const receipt = await finalizeClose(world.users.alice, { fy: control.fy });
  assert.ok(receipt.close_receipt_id ?? receipt.receipt_id ?? receipt.id,
    `an ordinary client still closes (got ${JSON.stringify(receipt)})`);
  const run = (await rootQuery(
    "select id from clara.close_runs where fiscal_year_id=$1 and state='finalized'", [control.fy])).rows[0].id;
  const g = (await rootQuery(
    `select distinct on (check_key) state, measured from clara.close_gate_results
      where close_run_id=$1 and check_key=$2 order by check_key, seq desc`, [run, KEY])).rows[0];
  assert.equal(g.state, "pass");
  assert.equal(g.measured.reason, "no_deferred_opening",
    "first_year_zero_opening WINS — a client whose opening is zero has nothing to carry down");
});

test("qd6.G1 THE SEED GRAIN, this file's one deliberate divergence from the banner: an OPEN opening seed does NOT lift the wall — only a FINALIZED one does, because a half-drafted seed is not a captured opening", async (t) => {
  if (qd6Gate(t)) return;
  const c = await deferredOpeningClient("grain");
  const receipt = await wb.createOpeningSeed(world.users.alice, {
    client: c.client, plan: c.plan, asOf: SEED_AS_OF, tieDocument: null, tieSha256: null,
  });
  const seed = receipt.seed_id ?? receipt.id;
  const reg = (await rootQuery("select state from clara.opening_seed_registry where id=$1", [seed])).rows[0];
  assert.equal(reg.state, "open",
    "mandatory setup: a freshly created seed is OPEN — the web surface stops showing the banner from here, and this wall deliberately does not");

  await beginClose(world.users.alice, { fy: c.fy });
  const err = await caught(() => finalizeClose(world.users.alice, { fy: c.fy }));
  assert.ok(err, "an open seed must NOT lift the wall");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} — ${err.message})`);
  const d = detailOf(err);
  assert.equal(d.check_key, KEY);
  assert.equal(d.measured.reason, "deferred_opening_unresolved");
  assert.equal(d.measured.finalized_seed_id, null,
    "and the payload says why: nothing has been FINALIZED, whatever is in flight");
});

// =====================================================================================
// F1/E1 — THE EVALUATOR'S OWN WALLS.
// =====================================================================================

test("qd6.F1 FAIL CLOSED ON THE MISSING: asked about a fiscal year that does not exist, the gate answers unknown/fiscal_year_not_found — and it is reached through the SHIPPED dispatch, never a copy of it", async (t) => {
  if (qd6Gate(t)) return;
  // EXECUTE THE GATE, not a re-implementation of its predicate (裁-112): the call goes
  // through `_measure_one_gate` by key, which is the same body finalize_close calls.
  const probe = (await rootQuery(
    "select clara._measure_one_gate($1, null, null) as r", [KEY])).rows[0].r;
  assert.equal(probe.state, "unknown",
    "an unevaluable drawer-1 identity is `unknown`, which finalize_close refuses as drawer1_state_unknown — an unevaluated identity has not passed");
  assert.equal(probe.measured.reason, "fiscal_year_not_found");
  // The DISCRIMINATOR: a missing dispatch arm answers no_evaluator_wired, a raising body
  // answers error+sqlstate. Neither is what came back, so the arm really is wired to ours.
  assert.notEqual(probe.measured.reason, "no_evaluator_wired");
  assert.equal(probe.measured.sqlstate, undefined);
});

test("qd6.E1 THE D1 RECUT IS EXTEND-ONLY, proved by reconstruction: deleting the one added dispatch arm from the LIVE _measure_one_gate prosrc reproduces 0104's pinned pre-image byte for byte", async (t) => {
  if (qd6Gate(t)) return;
  const PRE_SHA = "5dde819aa69e85150f8554370453385a10258e43415c6b68a0b9d6ae5c24c71c";
  const ARM = "      when 'deferred_opening_resolved' then clara._close_gate_deferred_opening(p_client, v_fy.id)\n";
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._measure_one_gate(text,uuid,uuid)'::regprocedure")).rows[0].prosrc;
  const occurrences = src.split(ARM).length - 1;
  assert.equal(occurrences, 1, "the added arm occurs exactly once in the live body");
  const sha = (await rootQuery(
    "select encode(sha256(convert_to($1,'UTF8')),'hex') as sha", [src.split(ARM).join("")])).rows[0].sha;
  assert.equal(sha, PRE_SHA,
    "with the arm deleted the body IS 0104's pinned pre-image — the fourteen pre-existing arms, the v_state derivation, the exception wrapper and the return shape are provably untouched");
  const now = (await rootQuery(
    "select encode(sha256(convert_to($1,'UTF8')),'hex') as sha", [src])).rows[0].sha;
  assert.notEqual(now, PRE_SHA, "and the live body really did move — this is the D1 inventory's `after` sha");
});
