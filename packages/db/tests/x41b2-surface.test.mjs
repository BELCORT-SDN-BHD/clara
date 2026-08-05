// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x41-surface.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x41-surface.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (1): x41.k1
// CELLS IN THE SIBLING FORK(S): b0 → D-b0
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x41-surface.test.mjs lands with its own slice.
// ===========================================================================
// 0041 Wave D-a — the FA REGISTER battery, part 5: THE RIDE-ALONGS (AF-1's hard
// refuse · the reverse_entry MYT splice, WD-R13) · THE STRUCTURAL CENSUSES (design
// §9.5: exactly one 'scheduled_run' writer, exactly two proposal-key writers, the
// generic drafter's wall) · EVENTS + TAXONOMY · GRANTS · THE READ SURFACE · THE QUEUE
// KIND · run-vs-dispose SERIALIZATION under the 203005004 client rung.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs header).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, namedCall, opk, noteLane, ROLES, CLR, endPool, printLaneNotes,
  printSkipCount, reverseEntry, draftEntryV3, approveEntry, roleCanExecute, idOf,
  collectRowKind, listReviewQueue, human, counterpartyRows, normalize, x41EnsureReady, skip41,
  refuses, caught, T, ACCUM, EXPENSE, BANK, AR1, AP1, OTHER, mon, dayIn, disposeAsset,
  runPeriod, runDueAsHuman, listFixedAssets, getFixedAsset, listDepreciationRuns, getAuthority,
  faRegisterTie, faWorld, faRow, entryRowOf, manualRes, liveRanges, assertNoOverlaps,
  freshFaClient, buyAsset, approvedEntry, approvedControlEntry, completeSL, liveAuthority,
  earnRamp, runAndSettle,
} from "./x41-fa-world.mjs";
import {
  DISPOSE_SQL, RUN_SQL, raceOnRung, beginHuman, beginRuntime, rungFixture,
} from "./x41-surface-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-surface");
  printSkipCount("x41-surface");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a surface battery");

// ===========================================================================
// x41.j — THE RIDE-ALONGS (WD-R13).
// ===========================================================================

/** Birth a counterparty through draft+approve of a tiny NON-control entry. */
async function birth(sub, { client, name, kind = "vendor" }) {
  const proposal = { new: { name } };
  if (kind === "customer") proposal.kind = "customer";
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `x41 birth ${name}`,
    postingDate: dayIn(mon(-4), 2),
    lines: [
      { account_code: OTHER, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: BANK, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    vendor: proposal, opKey: opk("x41birth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x41birtha") });
  const want = normalize(name);
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want);
  assert.ok(cp?.id, `the counterparty ${name} was born (mandatory setup)`);
  return cp.id;
}

const allocatePayment = async (sub, o) => (await humanQuery(sub, namedCall("allocate_payment", [
  { name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" },
  { name: "p_memo" }, { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" },
  { name: "p_allocations", cast: "jsonb" }, { name: "p_op_key" }, { name: "p_control_account" },
]), [o.client, o.counterparty, o.postingDate, o.memo ?? "x41 payment", BANK, o.amountCents,
  JSON.stringify(o.allocations), o.opKey ?? opk("x41pay"), AP1])).rows[0].result;

const allocateReceipt = async (sub, o) => (await humanQuery(sub, namedCall("allocate_receipt", [
  { name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" },
  { name: "p_memo" }, { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" },
  { name: "p_allocations", cast: "jsonb" }, { name: "p_op_key" }, { name: "p_control_account" },
]), [o.client, o.counterparty, o.postingDate, o.memo ?? "x41 receipt", BANK, o.amountCents,
  JSON.stringify(o.allocations), o.opKey ?? opk("x41rcpt"), AR1])).rows[0].result;

const applyOpenItems = async (sub, o) => (await humanQuery(sub, namedCall("apply_open_items", [
  { name: "p_client" }, { name: "p_applications", cast: "jsonb" }, { name: "p_reason" }, { name: "p_op_key" },
]), [o.client, JSON.stringify(o.applications), o.reason ?? "x41 apply", o.opKey ?? opk("x41apply")])).rows[0].result;

const openItemsOf = async (entry) =>
  (await rootQuery("select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1", [entry])).rows.map((x) => x.row);

// ===========================================================================
// x41.k — THE STRUCTURAL CENSUSES (design §9.5). Proposal authenticity is
// structural, and these keep a later migration from silently re-opening it.
// ===========================================================================

/** A body with its SQL comments removed — block comments first, then line comments. A
 *  census must count what a body DOES, not what it SAYS: 0042's `_pair_reverse_core` names
 *  'scheduled_run' four times in COMMENTS while writing origin='reversal', and the raw
 *  `prosrc like` instrument counted it as a writer. The two-instrument lesson, tail 3. */
const stripSqlComments = (src) => (src ?? "")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

/** Every clara function whose COMMENT-STRIPPED body both inserts a journal entry and names
 *  `fragment` — the structural-census instrument (design §9.5, re-cut for 0042). */
async function bodiesNaming(fragment) {
  const r = await rootQuery(
    "select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara'");
  return r.rows.map((x) => ({ n: x.proname, b: stripSqlComments(x.prosrc) }))
    .filter((x) => x.b.includes("insert into clara.journal_entries") && x.b.includes(fragment))
    .map((x) => x.n).sort();
}

test("x41.k1 single-writer censuses: EXACTLY the three pinned bodies insert origin='scheduled_run' (0042 widened it), and exactly one each writes the depreciation_charges and fa_disposal proposal keys", async (t) => {
  if (skipHere(t)) return;
  // [0042 · D-b design §8] THE CENSUS GREW FROM ONE TO THREE and is re-pinned at its NEW
  // membership — never loosened to a bare count. `_fa_run_period_core` is D-a's depreciation
  // sweep (the original single writer); `_adj_run_occurrence_core` is D-b's recurring-
  // adjustment occurrence poster (design §2.3); `_adj_on_approve` is the auto-reversal MIRROR
  // born on the occurrence's approval (design §2.4). Nothing else may issue a machine-origin
  // entry — the issuer-authenticity half of design §1.6 — so a FOURTH name still fails here.
  const originWriters = await bodiesNaming("scheduled_run");
  assert.deepEqual(originWriters, ["_adj_on_approve", "_adj_run_occurrence_core", "_fa_run_period_core"],
    `EXACTLY the three pinned scheduled_run writers may exist — got: ${originWriters.join(", ")}`);

  // …and the false positive the RAW-prosrc instrument produced is pinned AS one:
  // `_pair_reverse_core` names 'scheduled_run' only inside comments and writes
  // origin='reversal', because a pair correction is a HUMAN corrective act (design §2.4/§8).
  const pairSrc = (await rootQuery(
    "select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_pair_reverse_core'",
  )).rows.map((x) => x.prosrc).join(" ");
  assert.ok(pairSrc.includes("scheduled_run"),
    "NON-VACUOUS: _pair_reverse_core really does name 'scheduled_run' — a raw-prosrc census would still miscount it");
  assert.ok(!stripSqlComments(pairSrc).includes("scheduled_run"),
    "…but ONLY inside comments — the comment-stripped body never names it");
  assert.ok((await bodiesNaming("'reversal'")).includes("_pair_reverse_core"),
    "…because both correction drafts are born origin='reversal' (design §2.4)");

  const chargeWriters = await bodiesNaming("depreciation_charges");
  assert.equal(chargeWriters.length, 1,
    `exactly ONE function writes the depreciation_charges proposal key (design §9.5) — got: ${chargeWriters.join(", ")}`);
  const disposalWriters = await bodiesNaming("fa_disposal");
  assert.equal(disposalWriters.length, 1,
    `exactly ONE function writes the fa_disposal proposal key (design §9.5) — got: ${disposalWriters.join(", ")}`);
  assert.notEqual(chargeWriters[0], disposalWriters[0], "…and they are TWO distinct audited verbs, not one widened door");

  const core = (await rootQuery(
    "select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_draft_entry_core'",
  )).rows.map((x) => x.prosrc).join(" ");
  assert.ok(!core.includes("depreciation_charges"), "_draft_entry_core does not name depreciation_charges — it is NEVER widened");
  assert.ok(!core.includes("fa_disposal"), "_draft_entry_core does not name fa_disposal either");

  // [ASSEMBLY] MEASURED against the shared 0040 rig: clara.journal_entries has carried the
  // same nine grants since long before D-a (clara_fn_owner holds the full owner set; the two
  // read roles hold SELECT), and 0041 adds none. The structural claim that actually holds —
  // and the one proposal forgery depends on — is that NO role but the function owner may
  // WRITE the table, so a proposal can only be minted from inside a definer verb.
  const writeGrants = (await rootQuery(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema='clara' and table_name='journal_entries'
        and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
        and grantee <> 'clara_fn_owner' order by 1, 2`,
  )).rows;
  assert.deepEqual(writeGrants, [],
    `NO role but clara_fn_owner may write clara.journal_entries — proposal forgery stays structurally impossible (got ${JSON.stringify(writeGrants)})`);
});
