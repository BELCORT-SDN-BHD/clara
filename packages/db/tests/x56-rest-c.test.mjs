// 0056 (Wave E lane beta, the close model) rig -- PART 7: the closing entry's
// authoring-path census (A19e), the continuity pin's HOW + all four arms of
// A19g (the no-activity right answer, the forged-divergence refusal, and the
// seed-approval pair (i)/(ii)), and the E-R11 key-2/key-3 independence matrix
// (A28). No named skips in this file.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG. 0045's
// EXISTING (pre-0056, already-shipped) approve-writer census regex is read here to
// REPLICATE it live against the current catalog -- that is the cell's own method,
// not a migration-file read of 0056.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, beginClose, finalizeClose, reopenFY,
  grantCapability, revokeCapability, freshActiveClient, proposeFY, openFY, addDaysStr,
  forgeClosedPeriodMovement, setupCloseCoa, plainEntry, BANK1, RE1, REVN, EXPN,
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
  if (!ready) { noteLane("0011 surface absent -- x56 rest-c suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-rest-c"); printSkipCount("x56-rest-c"); await endPool(); });

// ===========================================================================
// A19e -- the closing entry's authoring path: born status='draft', flipped by a
// literal UPDATE matching the LIVE approve-writer census detector (0045's own
// instrument, replicated here against the current catalog); the pinned roster
// grows from four to five WITH the per-hook disposition proven.
// ===========================================================================

test("A19e finalize_close authors the closing entry in-body (draft then census-visible flip); the approve-writer census grows 4 -> 5", async (t) => {
  if (skip56(t)) return;
  // 0045_wave_d_b2_recurring_adjustments.sql:7843-7849's EXACT instrument, replicated
  // live -- never a diff against migration file text.
  const census = (await rootQuery(`
    select count(*)::int as n,
           string_agg(p.proname::text, ', ' order by p.proname::text collate "C") as names
      from pg_proc p
     where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
       and lower(regexp_replace(regexp_replace(regexp_replace(
             (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')),
             '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g'))
           ~* 'update[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\\.[[:space:]]*)?journal_entries[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*''approved'''
  `)).rows[0];
  assert.equal(census.n, 5, `expected exactly 5 approve-writers (got ${census.n}: ${census.names})`);
  assert.equal(
    census.names,
    "_approve_entry_core, _approve_opening_entry, approve_wrong_client_correction, finalize_close, reverse_entry",
    "the pinned four PLUS finalize_close, in collate \"C\" order",
  );

  // The body itself: born draft, flipped by a literal UPDATE (never an insert-approved,
  // which would be invisible to the census above).
  const body = (await rootQuery(
    "select pg_get_functiondef('clara.finalize_close(uuid,text,text)'::regprocedure) as def",
  )).rows[0].def;
  const insertIdx = body.search(/insert into clara\.journal_entries/i);
  const draftIdx = body.search(/'draft'/);
  const flipIdx = body.search(/update clara\.journal_entries set status\s*=\s*'approved'/i);
  assert.ok(insertIdx >= 0 && draftIdx > insertIdx && draftIdx < flipIdx, "the entry is INSERTed as 'draft' first, then flipped by a separate UPDATE later in the body");
  assert.ok(/is_year_end/.test(body), "the closing entry carries is_year_end (high-stakes by construction)");
  assert.ok(/checker_actor\s*=\s*c\.actor/.test(body), "the flip stamps checker_actor (the maker/checker branch)");
  assert.ok(/_subledger_on_approve\(v_entry\)/.test(body), "the subledger hook is CALLED, not argued a no-op");
  assert.ok(/the closing entry minted % open item/.test(body), "the no-op is then ASSERTED, not assumed -- a non-zero open_items count for the closing entry raises");

  // Behavioural: a real close proves all three dispositions on the actual row.
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "a19e", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  const entryRow = (await rootQuery(
    "select is_year_end, checker_actor, status from clara.journal_entries where id=$1",
    [closed.close_entry_id],
  )).rows[0];
  assert.equal(entryRow.is_year_end, true);
  assert.equal(entryRow.checker_actor, owner);
  assert.equal(entryRow.status, "approved");
  const openItemCount = (await rootQuery(
    "select count(*)::int as n from clara.open_items where entry_id=$1",
    [closed.close_entry_id],
  )).rows[0].n;
  assert.equal(openItemCount, 0, "the P&L->RE close moved no subledger, proven per close");
});

// ===========================================================================
// A19g -- the HOW: approve_opening_seed is a SPLICED body (never a from-file
// rewrite), harvested + patched to call _assert_seed_matches_prior_pin, with its
// two pre-existing 0018 guards (correction_draft_present, _assert_opening_tie)
// still present. Plus ALL THREE close-arms of the pin: (iii) no seed at all, a
// continuously-operating client's FY(n+1) close SUCCEEDS because the recompute
// at starts_on-1 IS the exact instant the pin was taken (right answer, no
// forgery needed); the FORGED-divergence arm, where a genuine post-pin movement
// of the opening side IS refused; and the SEED-approval pair (i)/(ii) below.
//
// THE SEED-APPROVAL CONSTRUCTION. The door: create_opening_seed's plan FK
// requires a REAL onboarding_plans row, and opening_seed_registry is ONE SEED
// PER CLIENT FOR LIFE (its own unique_violation branch says so) -- a client
// born via begin_client_onboarding gets client+plan+seed together atomically,
// so a FRESH seed against an already-seeded client can never reach the pin-tie
// check. bootstrap_client_plan(p_client, p_op_key) is the other door: built for
// pre-0017 clients that were ALREADY active with no onboarding_plans row, it
// mints a MINIMAL plan (one pre-resolved carry_down_deferred item) WITHOUT
// touching client status or creating a seed. That plan_id is then usable with
// create_opening_seed for the FIRST time, AFTER FY(n) has already closed --
// exactly the "prior receipt exists" case _assert_seed_matches_prior_pin's own
// comment anticipates.
//
// THE ARITHMETIC LAW (team-lead): K5's tie (_assert_opening_tie) compares
// targets against (real approved GL at as_of + the draft batch) -- BY DESIGN,
// so a seed formalized on top of existing books cannot double-count. Targets
// declare the TOTAL position at as_of; drafts may only fill the GAP:
// drafts_per_account = targets - real_GL_at_as_of. This client's real GL
// already equals the pin exactly (FY(n)'s close put it there), so the gap is
// ZERO on every account for (i), and exactly 1 cent on BANK1 for (ii) -- see
// each cell for the construction.
// ===========================================================================

/** A close-capable client (freshActiveClient, already 'active' -- never touches
 *  begin_client_onboarding) retroactively bootstrapped with a minimal onboarding
 *  plan via bootstrap_client_plan, so create_opening_seed has a real plan FK to
 *  target for the FIRST (and only) time, later, once FY(n) has already closed.
 *  FY(n) closes clean under 0056 exactly like cleanCloseableFY; one extra OBE
 *  marker account is added so the keyed lane's auto-generated offset legs (per
 *  gl_balance item) have a home. Returns { client, plan, endsOn } with FY(n)
 *  CLOSED and its pin recorded (BANK1=300000, RE1=-300000, the same shape A19f
 *  and the forged-divergence arm both use). */
async function bootstrappedClosedClient(owner, prepSub, tag) {
  const client = await freshActiveClient(owner, tag);
  await setupCloseCoa(owner, client);
  await humanQuery(owner, "select clara.upsert_account(p_client => $1, p_code => $2, p_name => $3, p_type => $4, p_special_acc_type => $5, p_op_key => $6) as r",
    [client, "905-C56", "OBE (x56 seed arm)", "equity", "opening_balance_equity", opk("x56-obe")]);
  const plan = (await humanQuery(owner, "select clara.bootstrap_client_plan(p_client => $1, p_op_key => $2) as r", [client, opk("x56-bootstrap")])).rows[0].r.plan_id;
  const startsOn = "2027-01-01";
  const proposal = await proposeFY(owner, { client, startsOn });
  const opened = await openFY(owner, { client, label: "seed-arm FY1", startsOn, endsOn: proposal.ends_on });
  const midYear = addDaysStr(startsOn, 90);
  await plainEntry(prepSub, { client, debit: BANK1, credit: REVN, cents: 500_000, postingDate: midYear, memo: "x56 seed-arm revenue" });
  await plainEntry(prepSub, { client, debit: EXPN, credit: BANK1, cents: 200_000, postingDate: midYear, memo: "x56 seed-arm expense" });
  await beginClose(owner, { fy: opened.fiscal_year_id });
  await finalizeClose(owner, { fy: opened.fiscal_year_id });
  return { client, plan, endsOn: proposal.ends_on };
}

test("A19g(i) RIGHT ANSWER: an opening seed for FY(n+1) that MATCHES the pin to the cent SUCCEEDS", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const drafter = world.users.hana; // distinct from the approver (maker-checker, per-item)
  const setup = await bootstrappedClosedClient(owner, drafter, "19gi");

  const nextStart = addDaysStr(setup.endsOn, 1);
  const nextProposal = await proposeFY(owner, { client: setup.client, startsOn: nextStart });
  await openFY(owner, { client: setup.client, label: "seed-arm FY2", startsOn: nextStart, endsOn: nextProposal.ends_on });

  const seedR = await wb.createOpeningSeed(owner, { client: setup.client, plan: setup.plan, asOf: nextStart });
  const seed = seedR.seed_id ?? seedR.id;
  // THE ARITHMETIC LAW (team-lead, measured against _opening_seed_basis's own
  // query): K5's tie compares targets against (real approved GL at as_of +
  // the draft batch) -- so drafts_per_account = targets - real_GL_at_as_of,
  // never the account's TOTAL. This client's real GL already equals the pin
  // exactly (FY(n)'s close put it there), so the gap is ZERO on every
  // account -- drafting the pin's full values on top (the earlier, wrong
  // attempt) double-counted. Targets are recorded at the PIN's values
  // (0056's pin-tie reads targets directly); the draft batch fills a ZERO
  // gap: approve_opening_seed refuses an itemless batch ("opening seed has
  // no draft entries"), so a NEUTRAL pair on BANK1 (dr 1 cent, cr 1 cent)
  // supplies "at least one draft" while contributing net zero to BOTH BANK1
  // (their own amounts cancel) and OBE (their auto-offset legs cancel too)
  // -- RE1 is never touched by either item, so its actual stays exactly the
  // real GL figure, matching its target.
  await wb.recordOpeningTarget(drafter, { seed, line: { line_key: "bank", account_code: BANK1, source_label: "x56 seed bank", debit_cents: 300_000, credit_cents: 0, provenance_kind: "keyed", entered_by: drafter } });
  await wb.recordOpeningTarget(drafter, { seed, line: { line_key: "re", account_code: RE1, source_label: "x56 seed re", debit_cents: 0, credit_cents: 300_000, provenance_kind: "keyed", entered_by: drafter } });
  const d1 = await wb.draftOpeningItem(drafter, {
    client: setup.client, seed, resolution: wb.keyedRes(drafter, { client: setup.client, seed }),
    item: { item_kind: "gl_balance", item_key: "seed:bank-up" },
    lines: [{ account_code: BANK1, debit_cents: 1, credit_cents: 0 }],
  });
  const d2 = await wb.draftOpeningItem(drafter, {
    client: setup.client, seed, resolution: wb.keyedRes(drafter, { client: setup.client, seed }),
    item: { item_kind: "gl_balance", item_key: "seed:bank-down" },
    lines: [{ account_code: BANK1, debit_cents: 0, credit_cents: 1 }],
  });
  const receipt = await wb.approveOpeningSeed(owner, {
    seed, planRevision: await wb.planRevision(setup.plan), entryRevisions: wb.revMapOf([d1, d2]), opKey: opk("x56-a19gi"),
  });
  assert.ok(receipt, "the matching opening seed approves successfully");
  const regRow = (await rootQuery("select state from clara.opening_seed_registry where id=$1", [seed])).rows[0];
  assert.equal(regRow.state, "finalized", "the registry finalized -- the pin-tie did not block a genuinely matching seed");
});

test("A19g(ii) a 1-cent-diverging opening seed is REFUSED, drawer 1, naming the account/pinned/proposed/diff -- the internally-consistent rewrite the pin tie exists to catch", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const drafter = world.users.hana;
  const setup = await bootstrappedClosedClient(owner, drafter, "19gii");

  const nextStart = addDaysStr(setup.endsOn, 1);
  const nextProposal = await proposeFY(owner, { client: setup.client, startsOn: nextStart });
  await openFY(owner, { client: setup.client, label: "seed-arm FY2", startsOn: nextStart, endsOn: nextProposal.ends_on });

  const seedR = await wb.createOpeningSeed(owner, { client: setup.client, plan: setup.plan, asOf: nextStart });
  const seed = seedR.seed_id ?? seedR.id;
  // This time the batch genuinely ADDS the 1-cent gap (BANK1 dr 1 via
  // gl_balance, OBE/RE contra via a 1-cent plug) rather than a neutral pair --
  // and targets are recorded to MATCH that genuinely-drafted total exactly
  // (300,001 on both BANK1 and RE1), so K5's OWN tie passes: the books are
  // internally consistent. TWO ORTHOGONAL TIES, two different jobs: K5
  // (_assert_opening_tie) catches internal inconsistency between what was
  // declared and what was drafted -- it has nothing to say about whether an
  // internally-consistent figure is HONEST against history. The pin tie
  // (_assert_seed_matches_prior_pin) is the one that catches a seed which
  // ties perfectly to itself while quietly rewriting a pinned close -- that
  // is the whole reason it exists, and this cell is the semantically exact
  // case: an internally-consistent formalization diverging from history.
  await wb.recordOpeningTarget(drafter, { seed, line: { line_key: "bank", account_code: BANK1, source_label: "x56 seed bank +1", debit_cents: 300_001, credit_cents: 0, provenance_kind: "keyed", entered_by: drafter } });
  await wb.recordOpeningTarget(drafter, { seed, line: { line_key: "re", account_code: RE1, source_label: "x56 seed re +1", debit_cents: 0, credit_cents: 300_001, provenance_kind: "keyed", entered_by: drafter } });
  const d1 = await wb.draftOpeningItem(drafter, {
    client: setup.client, seed, resolution: wb.keyedRes(drafter, { client: setup.client, seed }),
    item: { item_kind: "gl_balance", item_key: "seed:bank-gap" },
    lines: [{ account_code: BANK1, debit_cents: 1, credit_cents: 0 }],
  });
  const d2 = await wb.draftOpeningItem(drafter, {
    client: setup.client, seed, resolution: wb.keyedRes(drafter, { client: setup.client, seed }),
    item: { item_kind: "obe_plug", item_key: "seed:plug-gap", amount_cents: -1 },
  });
  const planRev = await wb.planRevision(setup.plan);
  const err = await caught(() => wb.approveOpeningSeed(owner, {
    seed, planRevision: planRev, entryRevisions: wb.revMapOf([d1, d2]), opKey: opk("x56-a19gii"),
  }));
  assert.ok(err, "a 1-cent-diverging seed must be refused");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.reason, "drawer1_identity_failed");
  assert.equal(det.check_key, "opening_continuity_tie");
  const bankDiff = (det.diffs ?? []).find((d) => d.account_code === BANK1);
  assert.ok(bankDiff, "BANK1 appears in the diffs, naming the account");
  assert.equal(bankDiff.pinned_cents, 300_000, "names the pinned side");
  assert.equal(bankDiff.seed_cents, 300_001, "names the proposed (seed) side");
  assert.equal(bankDiff.seed_cents - bankDiff.pinned_cents, 1, "names a diff of exactly 1 cent");
  const regRow = (await rootQuery("select state from clara.opening_seed_registry where id=$1", [seed])).rows[0];
  assert.equal(regRow.state, "open", "the registry stays open -- nothing was finalized on a refused approval");
});

test("A19g the HOW: approve_opening_seed is a harvested SPLICE (never a from-file rewrite); its two 0018 guards are still present; it calls the NEW pin-tie assertion", async (t) => {
  if (skip56(t)) return;
  // A repo-wide search for a from-scratch rewrite -- the cell's own method.
  const { execFileSync } = await import("node:child_process");
  let grepHit = "";
  try {
    grepHit = execFileSync(
      "grep", ["-rl", "--include=*.sql", "create or replace function clara.approve_opening_seed", "packages/db/migrations"],
      { cwd: process.cwd().endsWith("db") ? "../.." : process.cwd(), encoding: "utf8" },
    ).trim();
  } catch (e) {
    // grep exits 1 (and throws) when there are zero matches -- that IS the pass.
    grepHit = e.status === 1 ? "" : (() => { throw e; })();
  }
  assert.equal(grepHit, "", "no migration file contains a from-scratch CREATE OR REPLACE for approve_opening_seed -- its live body is 0017's text as spliced");

  const body = (await rootQuery(
    "select pg_get_functiondef('clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure) as def",
  )).rows[0].def;
  assert.ok(/_assert_seed_matches_prior_pin\(p_seed\)/.test(body), "the splice calls the NEW pin-tie assertion");
  assert.ok(/correction_draft_present/.test(body), "0018 guard 1 (the K5 correction-draft block) is still present");
  assert.ok(/_assert_opening_tie\(p_seed\)/.test(body), "0018 guard 2 (the DB-authored opening tie) is still present");

  const tieFnRow = (await rootQuery(
    "select 1 from pg_proc where pronamespace='clara'::regnamespace and proname='_assert_seed_matches_prior_pin'",
  )).rows;
  assert.equal(tieFnRow.length, 1, "the pin-tie function exists in the live catalog");

  // The catalog fact A19g(ii) would exercise, asserted structurally: the pin-tie
  // check_key is drawer 1, and attest_close_exception's own item-domain CHECK
  // (already proven behaviourally in A25b/A3-family cells) refuses any drawer != 2
  // check_key by construction -- read here, not assumed.
  const checkRow = (await rootQuery(
    "select drawer from clara.close_gate_checks where check_key='opening_continuity_tie'",
  )).rows[0];
  assert.equal(checkRow.drawer, 1, "opening_continuity_tie is drawer 1 -- no attestation path exists, for anybody");
  const attestBody = (await rootQuery(
    "select pg_get_functiondef('clara.attest_close_exception(uuid,text,text,text)'::regprocedure) as def",
  )).rows[0].def;
  assert.ok(/v_chk\.drawer\s*<>\s*2/.test(attestBody), "attest_close_exception's own item-domain CHECK refuses any non-drawer-2 check_key, structurally -- opening_continuity_tie included");
});

test("A19g(iii) RIGHT ANSWER: with NO opening seed, a client continuing unbroken still closes FY(n+1) cleanly -- the pin ties automatically because nothing resets the GL at the boundary", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "a19g3", prepSub: world.users.hana, startsOn: "2027-01-01", revCents: 500_000, expCents: 200_000 });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "mandatory setup: FY(n) closes and pins its closing_position");

  // FY(n+1): opened, no opening seed approved. FY(n+1).starts_on - 1 IS FY(n).ends_on
  // -- the exact instant the pin was taken -- so with no intervening activity the
  // recompute ties trivially: this is the RIGHT ANSWER (a continuing client is never
  // falsely blocked), not the refusal this cell originally expected (see the SKIP note).
  const nextStart = addDaysStr(fx.endsOn, 1);
  const nextProposal = await proposeFY(owner, { client: fx.client, startsOn: nextStart });
  const nextOpened = await openFY(owner, { client: fx.client, label: "A19g3 FY2", startsOn: nextStart, endsOn: nextProposal.ends_on });
  const fy2 = nextOpened.fiscal_year_id;

  await beginClose(owner, { fy: fy2 });
  const closed2 = await finalizeClose(owner, { fy: fy2 });
  assert.ok(closed2.receipt_id, "FY(n+1) closes cleanly with no seed at all -- the continuity tie holds without one");
  const receipt2 = (await rootQuery("select snapshot from clara.close_receipts where id=$1", [closed2.receipt_id])).rows[0];
  assert.equal(receipt2.snapshot.opening_tie.basis, "prior_receipt_pin", "the receipt records that it ties against the stored pin, not a re-derivation");
  assert.deepEqual(receipt2.snapshot.opening_tie.diffs, [], "zero diffs -- the identity held");
});

test("A19g the FORGED-divergence refusal arm: a genuine post-pin movement of the opening side is REFUSED (drawer 1, absolute, naming the measured diffs)", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "a19gforge", prepSub: world.users.hana, startsOn: "2027-01-01", revCents: 500_000, expCents: 200_000 });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed.receipt_id, "mandatory setup: FY(n) closes and pins BANK1=300000, RE1=-300000");

  // FORGE a movement dated INSIDE the already-closed FY(n), AFTER the pin was taken:
  // +1,000 cents into BANK1, offset against REVN (a non-control account -- no subledger
  // belt engagement). No audited verb can reach this write; see forgeClosedPeriodMovement's
  // own doc comment for why, and the x40/forceControlMismatch precedent it extends.
  await forgeClosedPeriodMovement(owner, {
    client: fx.client, postingDate: fx.endsOn, debit: "170-C56", credit: "684-C56", cents: 1_000,
  });

  const nextStart = addDaysStr(fx.endsOn, 1);
  const nextProposal = await proposeFY(owner, { client: fx.client, startsOn: nextStart });
  const nextOpened = await openFY(owner, { client: fx.client, label: "A19g-forge FY2", startsOn: nextStart, endsOn: nextProposal.ends_on });
  const fy2 = nextOpened.fiscal_year_id;

  await beginClose(owner, { fy: fy2 });
  const err = await caught(() => finalizeClose(owner, { fy: fy2 }));
  assert.ok(err, "FY(n+1)'s close must refuse: the opening side genuinely moved after the pin was taken");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.reason, "drawer1_identity_failed");
  assert.equal(det.check_key, "opening_continuity_tie");
  assert.ok(Array.isArray(det.diffs) && det.diffs.length > 0, "the refusal names the measured diffs");
  const bankDiff = det.diffs.find((d) => d.account_code === "170-C56");
  assert.ok(bankDiff, "BANK1 appears in the diffs -- the exact account that moved");
  assert.equal(bankDiff.pinned_cents, 300_000, "the pinned side is untouched, exactly as FY(n) recorded it");
  assert.equal(bankDiff.current_cents, 301_000, "the current side reflects the forged +1,000 movement");

  // Negative/right-answer pairing: a close WITHOUT the forgery (a sibling client) still
  // succeeds cleanly -- the refusal above is caused by the movement, not by the mere
  // presence of a successor FY (already shown by the right-answer cell above, restated
  // here as this cell's own negative case per its ruling's convention).
  const clean = await cleanCloseableFY(owner, { tag: "a19gforge-clean", prepSub: world.users.hana, startsOn: "2027-01-01", revCents: 500_000, expCents: 200_000 });
  await beginClose(owner, { fy: clean.fy });
  await finalizeClose(owner, { fy: clean.fy });
  const cleanNextStart = addDaysStr(clean.endsOn, 1);
  const cleanNextProposal = await proposeFY(owner, { client: clean.client, startsOn: cleanNextStart });
  const cleanNextOpened = await openFY(owner, { client: clean.client, label: "A19g-forge clean FY2", startsOn: cleanNextStart, endsOn: cleanNextProposal.ends_on });
  await beginClose(owner, { fy: cleanNextOpened.fiscal_year_id });
  const cleanClosed = await finalizeClose(owner, { fy: cleanNextOpened.fiscal_year_id });
  assert.ok(cleanClosed.receipt_id, "without the forged movement, the successor closes cleanly -- isolating the forgery as the cause");
});

// ===========================================================================
// A28 -- key 2 (close_and_attest) and key 3 (reopen) are SEPARATELY grantable;
// neither implies the other. Grant only key 2: close succeeds, reopen refused.
// Revoke, grant only key 3: close refused, reopen succeeds.
// ===========================================================================

test("A28 key 2 and key 3 are independent: key-2-only admits close but not reopen; key-3-only admits reopen but not close", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const human = world.users.grace; // a non-owner human with NO capabilities in this file

  const fx = await cleanCloseableFY(owner, { tag: "a28", prepSub: world.users.bob, startsOn: "2027-01-01" });

  // Grant ONLY key 2.
  await grantCapability(owner, { user: human, capability: "close_and_attest", reason: "x56 a28: grant key 2 only" });
  const begun = await beginClose(human, { fy: fx.fy });
  assert.ok(begun.close_run_id, "key-2-only: close SUCCEEDS");
  const closed = await finalizeClose(human, { fy: fx.fy });
  assert.ok(closed.receipt_id, "key-2-only: finalize SUCCEEDS too (same capability governs both close verbs)");

  const reopenErr1 = await caught(() => reopenFY(human, {
    fy: fx.fy, reason: "x56 a28: key-2-only attempts reopen (expected refusal)",
    correctionTarget: { entry_ids: [fx.revenueEntry] },
  }));
  assert.ok(reopenErr1, "key-2-only: reopen is REFUSED -- key 2 does not imply key 3");
  assert.equal(reopenErr1.code, "CLR04");
  assert.equal(JSON.parse(reopenErr1.detail ?? "{}").capability, "reopen");

  // Revoke key 2, grant ONLY key 3.
  await revokeCapability(owner, { user: human, capability: "close_and_attest", reason: "x56 a28: revoke key 2" });
  await grantCapability(owner, { user: human, capability: "reopen", reason: "x56 a28: grant key 3 only" });

  const fx2 = await cleanCloseableFY(owner, { tag: "a28-2", prepSub: world.users.bob, startsOn: "2027-01-01" });
  const closeErr2 = await caught(() => beginClose(human, { fy: fx2.fy }));
  assert.ok(closeErr2, "key-3-only: close is REFUSED -- key 3 does not imply key 2");
  assert.equal(closeErr2.code, "CLR04");
  assert.equal(JSON.parse(closeErr2.detail ?? "{}").capability, "close_and_attest");

  const reopened2 = await reopenFY(human, {
    fy: fx.fy, reason: "x56 a28: key-3-only reopen succeeds",
    correctionTarget: { entry_ids: [fx.revenueEntry] },
  });
  assert.ok(reopened2.reopen_receipt_id, "key-3-only: reopen SUCCEEDS");

  // Each grant/revoke is its own audited row, and only the firm owner ever wrote one.
  const grantRows = (await rootQuery(
    "select granted_by, capability from clara.firm_capability_grants where user_id=$1 order by granted_at",
    [human],
  )).rows;
  assert.ok(grantRows.length >= 2, "at least the two grants this cell made are recorded");
  assert.ok(grantRows.every((r) => r.granted_by === owner), "every grant for this human was written by the firm owner, never by the grantee or anyone else");
});
