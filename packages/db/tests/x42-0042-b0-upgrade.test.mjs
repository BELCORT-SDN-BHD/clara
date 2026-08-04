// WAVE D-b SPLIT — DRILL 1 of 4: 0042 `wave_d_b0_shared_authorities` DEPLOY-ONTO-EXISTING.
//
// census §6 ADJUDICATED one drill per slice. D-b0's OWN deploy risk is the sharpest of the
// four and it is the only one that is IRREVERSIBLE-shaped:
//   * `fixed_assets.cost_cents SET NOT NULL` against a POPULATED register (S5.1 / WDB-G12) —
//     SECTION-0 probe 12 must refuse a corpus carrying a NULL BY NAME, with its remedy, not
//     with a bare constraint error;
//   * 25 live-body splices whose prestate marker counts are measured against the LIVE catalog
//     of a database that has already been deployed to;
//   * `journal_entries.auto_reversal_of` — census §4 Option A's named DEVIATION: a dormant
//     column shipped ~3 slices before its first writer. The drill asserts it lands NULL on
//     every pre-existing row and stays 100% NULL, which is the whole cost of the deviation.
//
// AND the split's own new claim: D-b0 must ship NOTHING of D-b1/D-b3/D-b2. A slice that leaks
// a later slice's relation would green its own drill while breaking the ship order.
//
// RESET-GATED (drops schema clara) — run ALONE, its own CI step, its own throwaway DB:
//   PGDATABASE=clara_x42_b0_upgrade_ci CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 \
//     CLARA_RIG_DB=1 node --test tests/x42-0042-b0-upgrade.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, printLaneNotes, noteLane, rootQuery, mon, opk,
  drainDue, disposeAndSettle, retireFaProfile, faRegisterTie,
} from "./x41-fa-world.mjs";
import {
  MIG_DIR, skipUnlessReset, freshDb, buildPre0042Book,
  assertB0Floor, assertNoLaterSliceObjects, assertPreExistingSurfacesStillWork,
  tableExists, columnExists, appliedCount, fnExists, strippedDef, COST, ACCUM, EXPN_FA,
  wb, upsertAccountClassed,
} from "./x42-split-upgrade-kit.mjs";
import { randomUUID } from "node:crypto";

after(async () => { printLaneNotes("x42-0042-b0-upgrade"); await endPool(); });

test("D-b0 upgrade drill: a populated pre-0042 book (FA lineage + a signed authority + a posted charge, a live bank settle, a high-stakes PENDING settle, an open exception) survives the 0042 apply — cost_cents constrains, auto_reversal_of lands dormant, ZERO later-slice objects ship, and both pre-existing surfaces still work", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();

  // The drill really starts at the D-a frontier.
  assert.equal(await appliedCount("^0041_"), 1, "the drill starts with 0041 applied");
  assert.equal(await appliedCount("^004[2-9]_"), 0, "…and NO D-b slice applied");
  assert.equal(await tableExists("adjustment_templates"), false, "the drill really starts pre-D-b (no adjustment family yet)");
  assert.equal(await tableExists("staff_advance_accounts"), false, "…no advance family yet");
  assert.equal(await columnExists("bank_matches", "resolution_exception_id"), false, "…and bank_matches carries no resolution columns yet");
  assert.equal(await columnExists("journal_entries", "auto_reversal_of"), false, "…and journal_entries carries no auto_reversal_of yet");

  const h = await buildPre0042Book();
  const jeBefore = Number((await rootQuery("select count(*)::int as n from clara.journal_entries")).rows[0].n);
  assert.ok(jeBefore > 0, "mandatory setup: the pre-apply book really carries journal entries");

  // ===================== THE APPLY =====================
  await migrate({ dir: MIG_DIR, log: () => {} });
  assert.equal(await appliedCount("^0042_"), 1, "0042 applied onto the populated book");

  // (a) D-b0's floor: cost_cents NOT NULL, auto_reversal_of + its partial unique, the shared bodies.
  await assertB0Floor();

  // (b) THE DEVIATION'S WHOLE COST, measured: the dormant column is NULL on every pre-existing
  //     row and has no writer yet (census §4 Option A: "the D-b0 upgrade drill can assert it
  //     stays 100% NULL").
  const arv = (await rootQuery(
    "select count(*)::int as total, count(auto_reversal_of)::int as nonnull from clara.journal_entries")).rows[0];
  assert.equal(Number(arv.total), jeBefore, "0042 minted no journal entries of its own");
  assert.equal(Number(arv.nonnull), 0, "auto_reversal_of is 100% NULL after the apply — the column ships dormant, exactly as the deviation promised");

  // (c) the FA-only reservation shells exist but the advance arms do NOT — the Class B split.
  //     Measured on the COMMENT-STRIPPED definition: every slice carries `[SPLIT D-bN]` notes
  //     that NAME the later-slice objects it deliberately does not ship, and pg_get_functiondef
  //     returns them verbatim, so the raw text is the wrong instrument (E19).
  const arSrc = await strippedDef("_acct_role_reserved");
  assert.equal(/staff_advance/.test(arSrc), false, "_acct_role_reserved ships FA-ONLY at D-b0 (no advance arm yet) — census §2 Class B");

  // (d) the re-run gate ships with its FA arms and FAILS CLOSED on the adjustment stamp
  //     (R1's CLR10 period_stamp_no_rerun_arm) rather than answering "sound" vacuously.
  assert.equal(await fnExists("_wdb_rerun_breach"), true, "the re-run gate exists");
  const rerunSrc = await strippedDef("_wdb_rerun_breach");
  assert.ok(/recurring_adjustment/.test(rerunSrc), "…and its recurring_adjustment arm is NAMED (it raises rather than silently passing)");
  assert.equal(/clara\.adjustment_/.test(rerunSrc), false, "…while reading NO adjustment relation at D-b0");

  // (e) THE SPLIT'S OWN CLAIM: nothing of D-b1 / D-b3 / D-b2 shipped.
  await assertNoLaterSliceObjects({ advances: true, af2: true, adjustments: true });
  assert.equal(await appliedCount("^004[3-9]_"), 0, "…and no later slice recorded itself as applied");

  // (f) pre-existing behaviour intact.
  await assertPreExistingSurfacesStillWork(h, "D-b0");
  noteLane("D-b0 drill: the whole post-state pinned on a populated pre-0042 book");
});

// ===========================================================================
// THE ABORT SIDE. `cost_cents SET NOT NULL` is D-b0's ONLY irreversible-shaped act, so its
// prestate probe must refuse a corpus that genuinely carries a NULL — BY NAME and atomically.
// This is the whole-unit drill's second cell, unchanged in substance: it now belongs to D-b0
// because D-b0 is the slice that carries S5.1.
// ===========================================================================

test("D-b0 upgrade drill (abort side): a pre-0042 fixed_assets row carrying a NULL cost_cents REFUSES the 0042 apply, atomically and by name", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();

  const w = await wb.buildWaveBWorld();
  const o = await wb.onboardingClient(w.users.hana, `u42null_${randomUUID().slice(0, 6)}`);
  await wb.seedOpeningCoa(w.users.alice, o.client);
  for (const [code, name, type] of [[COST, "Plant (u42n)", "asset"], [ACCUM, "Accum (u42n)", "asset"], [EXPN_FA, "Depr Exp (u42n)", "expense"]]) {
    await upsertAccountClassed(w.users.alice, { client: o.client, code, name, type });
  }
  const doc = await wb.openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await wb.createOpeningSeed(w.users.bob, { client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  const seed = sr.seed_id ?? sr.id;

  // WHY THE ROW IS STAGED BY FIXTURE (the whole-unit drill's own measured correction, carried
  // forward verbatim in substance): a NULL cost_cents is NOT reachable through seed_fixed_asset
  // today — 0017's books-grade arm does not fire (`v_cost <= 0` is NULL, not TRUE), the composer
  // derives an opening line whose debit is NULL, and `_validate_entry_lines` refuses opaquely.
  // So the audited verb already declines, just by accident of line validation rather than by
  // name — which is exactly the gap [WDB-G12] closes. That leaves the prestate probe defending
  // against rows of some OTHER origin (a historical insert, a path since closed). Those are what
  // the ceremony must survive, so the row is manufactured HERE, in the pre-0042 world only.
  const goodAsset = {
    description: "u42 null-cost asset", acquired_date: mon(-6).start,
    useful_life_months: 60, depreciation_method: "straight_line",
    asset_account_code: COST, accum_depr_account_code: ACCUM, depr_expense_account_code: EXPN_FA,
    accumulated_depreciation_cents: 0, depreciation_start_date: mon(-6).start, residual_cents: 0,
    item_key: "fa:u42null", cost_cents: 120_000,
  };
  const receipt = await wb.seedFixedAsset(w.users.bob, { client: o.client, seed, asset: goodAsset });
  const faId = receipt.fixed_asset_id ?? receipt.asset_id ?? receipt.id;
  assert.ok(faId, `mandatory setup: seed_fixed_asset mints the register row — got ${JSON.stringify(receipt)}`);

  await rootQuery("set session_replication_role = 'replica'");
  try {
    await rootQuery("update clara.fixed_assets set cost_cents = null where id = $1", [faId]);
  } finally {
    await rootQuery("set session_replication_role = 'origin'");
  }
  assert.equal((await rootQuery("select cost_cents from clara.fixed_assets where id=$1", [faId])).rows[0].cost_cents, null,
    "mandatory setup: the register row really carries a NULL cost_cents pre-0042");

  await assert.rejects(
    () => migrate({ dir: MIG_DIR, log: () => {} }),
    /cost_cents/i,
    "0042 REFUSES a corpus carrying a NULL cost_cents register row by name — the prestate probe, not a silent ALTER failure",
  );
  assert.equal(await columnExists("journal_entries", "auto_reversal_of"), false, "the abort rolled 0042 back WHOLE — not even the dormant column landed");
  assert.equal(await appliedCount("^0042_"), 0, "…and 0042 is not recorded as applied");
  noteLane("D-b0 NULL-cost abort verified: the prestate probe refuses the apply atomically, named by 'cost_cents'");
});

// ===========================================================================
// THE WALK GATE. D-b0 ships S5.15 — the writer change that makes a TERMINAL register row
// RELEASE its three account codes — so it must also ship the reader that pairs with it
// (S5.19-b0). Shipping the release alone was MEASURED to leave clara.fa_register_tie walking
// an account no live register row or profile holds: the moment another register lawfully
// claims that released code, its postings land inside a fixed-asset tie row as a difference
// NO ACCOUNTING ACT CAN CLEAR (the terminal row can never move again). This cell is the
// FRONTIER claim: at 0042, writer and reader agree.
// ===========================================================================
const GAIN_U42 = "530-U42";
const LOSS_U42 = "901-U42";

test("D-b0 upgrade drill (walk gate): after the apply a code whose only register rows are TERMINAL and whose profile is retired is RELEASED by the writer (S5.15) and DROPPED from fa_register_tie's walk (S5.19-b0) — the pair ships in one migration", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();
  const h = await buildPre0042Book();

  await migrate({ dir: MIG_DIR, log: () => {} });
  assert.equal(await appliedCount("^0042_"), 1, "mandatory setup: 0042 applied onto the populated book");

  // the two disposal legs the drill's own chart does not carry
  await upsertAccountClassed(h.sub, { client: h.client, code: GAIN_U42, name: "Gain on Disposal (u42)", type: "income", opKey: opk("u42gain") });
  await upsertAccountClassed(h.sub, { client: h.client, code: LOSS_U42, name: "Loss on Disposal (u42)", type: "expense", opKey: opk("u42loss") });

  // EVERY live register row on the code goes terminal, then its profile retires: nothing in
  // the fixed-asset family holds the code any more.
  const liveRows = (await rootQuery(
    "select id from clara.fixed_assets where client_id=$1 and asset_account_code=$2 and status in ('pending','active') order by created_at",
    [h.client, COST])).rows;
  assert.ok(liveRows.length > 0, "mandatory setup: the pre-0042 book really carries a live register row on the code");
  // the book deliberately leaves depreciation due; a disposal is refused while a period is
  // uncharged (CLR38), so drain the ladder first -- which also exercises the sweep at this
  // slice's own frontier.
  await drainDue(h.client);
  for (const r of liveRows) {
    await disposeAndSettle(h.sub, {
      client: h.client, asset: r.id, disposalDate: mon(-1).end, proceedsCents: 0,
      proceedsAccount: null, gainAccount: GAIN_U42, lossAccount: LOSS_U42,
      memo: "u42 walk-gate disposal", opKey: opk("u42wgdisp"),
    });
  }
  const stillLive = (await rootQuery(
    "select count(*)::int as n from clara.fixed_assets where client_id=$1 and asset_account_code=$2 and status in ('pending','active')",
    [h.client, COST])).rows[0].n;
  assert.equal(Number(stillLive), 0, "mandatory setup: every register row on the code is terminal");
  await retireFaProfile(h.sub, { client: h.client, assetAccount: COST });

  // (i) THE WRITER (S5.15, this slice): the code is released.
  const held = (await rootQuery(
    "select count(*)::int as n from clara._fa_reserved_roles($1) r where r.account_code=$2", [h.client, COST])).rows[0].n;
  assert.equal(Number(held), 0, "S5.15: a terminal register row with no active profile RELEASES its codes");

  // (ii) THE READER (S5.19-b0, this slice): the released code leaves the walk in the SAME
  // migration. A slice that shipped (i) without (ii) would leave a permanent, unclearable
  // difference reachable at its own frontier.
  const tie = await faRegisterTie(h.sub, h.client, mon(0).start);
  const codes = (tie.accounts ?? []).map((a) => a.asset_account);
  assert.equal(codes.includes(COST), false,
    `S5.19-b0: fa_register_tie must not walk a code no live register row or profile holds (got ${JSON.stringify(codes)})`);
  noteLane("D-b0 walk gate: the writer releases the code and the reader stops walking it, in ONE migration");
});
