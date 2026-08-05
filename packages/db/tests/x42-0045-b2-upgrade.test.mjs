// WAVE D-b SPLIT — DRILL 4 of 4: 0045 `wave_d_b2_recurring_adjustments` DEPLOY-ONTO-EXISTING.
//
// D-b2 ships LAST and it is the slice that CLOSES the unit, so this drill carries two jobs:
//   1. its OWN deploy risk — three new relations plus TWO PARTIAL INDEXES ON clara.journal_
//      entries (`ix_je_adj_draft`, `ix_je_adj_occurrence`), built against a table that already
//      carries the whole book; and the S5.8-b2 hook splice, which must insert
//      `clara._adj_on_approve(p_entry)` ABOVE the advance line D-b1 already left there
//      (errata E8 — the ORDER is load-bearing and stated in the body's own comment);
//   2. the WHOLE-UNIT regression floor — D-b0's, D-b1's and D-b3's post-states all re-asserted,
//      which is the only place the four slices are proven to compose into the unit the whole
//      0042 was (census §6: "each drill inherits the prior slices' assertions as a regression
//      floor");
//   3. the `auto_reversal_of` TRANSITION — 0 rows → live. The b0/b1/b3 drills each prove the
//      column D-b0 ships THREE SLICES EARLY (census §4 Option A's named deviation) stays 100%
//      NULL; this drill is the only place the deviation is proved to PAY OFF, by driving a real
//      auto-reversing template through one approving act and watching the mirror take the link
//      (R4 handoff item 4 / cross-lens F7 — the claim was asserted dormant three times and live
//      nowhere).
//
// RESET-GATED (drops schema clara) — run ALONE, its own CI step, its own throwaway DB:
//   PGDATABASE=clara_x42_b2_upgrade_ci CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 \
//     CLARA_RIG_DB=1 node --test tests/x42-0045-b2-upgrade.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { endPool, printLaneNotes, noteLane, rootQuery, humanQuery, namedCall, opk, mon, upsertAccountClassed } from "./x41-fa-world.mjs";
import {
  MIG_DIR, skipUnlessReset, freshDb, buildPre0042Book,
  assertB0Floor, assertB1Floor, assertB3Floor, assertB2Floor, assertPreExistingSurfacesStillWork,
  tableExists, appliedCount, strippedDef, EXPN,
  approveEntry, entryRowOf,
} from "./x42-split-upgrade-kit.mjs";

after(async () => { printLaneNotes("x42-0045-b2-upgrade"); await endPool(); });

const ACCR_U45 = "480-U45";

test("D-b2 upgrade drill: the WHOLE split chain 0042→0043→0044→0045 lands on a populated book — the three adjustment relations + the two journal_entries hot-loop indexes arrive, the approve hook carries the adjustment line ABOVE the advance line (E8), every earlier slice's post-state still holds, and the template lifecycle really works", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();

  assert.equal(await appliedCount("^0041_"), 1, "the drill starts with 0041 applied");
  assert.equal(await appliedCount("^004[2-9]_"), 0, "…and NO D-b slice applied");
  assert.equal(await tableExists("adjustment_templates"), false, "the drill really starts pre-adjustments");

  const h = await buildPre0042Book();
  await upsertAccountClassed(h.sub, {
    client: h.client, code: ACCR_U45, name: "Accruals (u45)", type: "liability", accountClass: null, opKey: opk("u45coa"),
  });
  const jeBefore = Number((await rootQuery("select count(*)::int as n from clara.journal_entries")).rows[0].n);

  // ===================== THE APPLY (the whole four-slice chain) =====================
  await migrate({ dir: MIG_DIR, log: () => {} });
  for (const v of ["^0042_", "^0043_", "^0044_", "^0045_"]) {
    assert.equal(await appliedCount(v), 1, `${v} applied onto the populated book`);
  }

  // (a) THE WHOLE-UNIT REGRESSION FLOOR — the only place the four slices are proven to compose.
  await assertB0Floor();
  await assertB1Floor();
  await assertB3Floor(h);
  // (b) D-b2's own post-state.
  await assertB2Floor();

  // (c) THE HOOK ORDER (errata E8). D-b1 left ONE line (`clara._adv_on_approve(p_entry)`);
  //     D-b2 inserts its own ABOVE it. Measured on the COMMENT-STRIPPED body (E19) — D-b1's
  //     anchor comment deliberately names the adjustment hook WITHOUT its open paren precisely
  //     so a raw-text probe could not confuse prose for code, and this is the test-side twin.
  const hook = await strippedDef("_subledger_on_approve");
  const iAdj = hook.indexOf("clara._adj_on_approve(p_entry)");
  const iAdv = hook.indexOf("clara._adv_on_approve(p_entry)");
  assert.ok(iAdj >= 0, "the approve hook calls clara._adj_on_approve(p_entry)");
  assert.ok(iAdv >= 0, "…and still calls clara._adv_on_approve(p_entry) — D-b1's line survived the splice");
  assert.ok(iAdj < iAdv, `the ADJUSTMENT hook line stands ABOVE the ADVANCE one (adj@${iAdj} < adv@${iAdv}) — the body's own comment says the order is load-bearing`);

  // (d) the two hot-loop partial indexes really landed ON the populated journal_entries, and
  //     0045 minted no rows of its own.
  assert.equal(Number((await rootQuery("select count(*)::int as n from clara.journal_entries")).rows[0].n), jeBefore,
    "0045 minted no journal entries of its own");
  assert.equal(Number((await rootQuery("select count(*)::int as n from clara.adjustment_runs")).rows[0].n), 0,
    "…and no occurrence receipts");

  // (d2) `auto_reversal_of` — THE APPLY SIDE of the transition. Census §4 Option A's named
  //      deviation ships the column THREE SLICES EARLY, and the b0/b1/b3 drills each prove it
  //      lands and STAYS 100% NULL. Proving it dormant three times and never proving it goes
  //      live is half a claim (R4 handoff item 4 / cross-lens F7): the deviation is only paid
  //      off if D-b2 — its first and only writer — actually writes it. So: still 0 at the apply…
  const arvAfterApply = (await rootQuery(
    "select count(*)::int as total, count(auto_reversal_of)::int as nonnull from clara.journal_entries")).rows[0];
  assert.equal(Number(arvAfterApply.nonnull), 0,
    "auto_reversal_of is still 100% NULL immediately after 0045 applies — the migration itself writes none");

  // (e) pre-existing behaviour intact after the LAST slice.
  await assertPreExistingSurfacesStillWork(h, "D-b2");

  // (f) HEADLINE SMOKE: the template lifecycle really works on the upgraded book — propose
  //     (bookkeeper+) then sign (admin+), the two floors the design names.
  //     The template is AUTO-REVERSING on purpose: it is what turns `auto_reversal_of` from a
  //     dormant column into a live one, in (g) below.
  const period = mon(-2);
  const proposed = (await humanQuery(h.w.users.bob, namedCall("propose_adjustment_template", [
    { name: "p_client" }, { name: "p_name" }, { name: "p_cadence" },
    { name: "p_start_date", cast: "date" }, { name: "p_end_date", cast: "date" },
    { name: "p_auto_reverse", cast: "boolean" }, { name: "p_lines", cast: "jsonb" },
    { name: "p_memo_template" }, { name: "p_op_key" },
  ]), [h.client, "u45 drill accrual", "monthly", period.start, mon(6).end, true,
    JSON.stringify([
      { account_code: EXPN, debit_cents: 50_000, credit_cents: 0, description: "u45 accrued expense" },
      { account_code: ACCR_U45, debit_cents: 0, credit_cents: 50_000, description: "u45 accrual" },
    ]), "u45 drill accrual for {period}", opk("u45prop")])).rows[0].result;
  const templateId = proposed?.template_id ?? proposed?.id;
  assert.ok(templateId, `the propose verb answers on the upgraded book — got ${JSON.stringify(proposed)}`);

  const signed = (await humanQuery(h.w.users.hana, namedCall("sign_adjustment_template", [
    { name: "p_client" }, { name: "p_template" }, { name: "p_op_key" },
  ]), [h.client, templateId, opk("u45sign")])).rows[0].result;
  assert.ok(signed, "the sign verb answers");
  const row = (await rootQuery("select status from clara.adjustment_templates where id=$1", [templateId])).rows[0];
  assert.equal(row.status, "live", "…and the template is LIVE on a book that pre-dates the whole unit");

  // …and the due oracle answers for it rather than raising. Called through a HUMAN read
  // context on purpose: `clara._assert_due_read_ctx` (a D-b0 body, moved forward by census §2
  // Class A) refuses a context-free root call with CLR03 "no valid read context", so a bare
  // rootQuery here would be the wrong instrument, not a finding.
  const due = (await humanQuery(h.sub, namedCall("adjustment_run_due", [{ name: "p_client" }]), [h.client])).rows[0].result;
  assert.ok(due && typeof due === "object", `the due oracle answers on the upgraded book — got ${JSON.stringify(due)}`);

  // (g) THE `auto_reversal_of` TRANSITION: 0 rows → LIVE, in this drill, on this upgraded book.
  //     ONE approval of an auto_reverse occurrence births the APPROVED mirror in the same act
  //     (WDB-G1/G2), and the ONLY thing linking the pair is the column D-b0 shipped three slices
  //     early. This is the assertion that pays census §4 Option A's deviation off; without it the
  //     split proves the column dormant three times and live never.
  const ran = (await humanQuery(h.w.users.bob, namedCall("run_adjustment_manual", [
    { name: "p_client" }, { name: "p_template" },
    { name: "p_period_start", cast: "date" }, { name: "p_period_end", cast: "date" },
    { name: "p_op_key" },
  ]), [h.client, templateId, period.start, period.end, opk("u45run")])).rows[0].result;
  const occurrence = ran?.entry_id ?? ran?.entry ?? null;
  assert.ok(occurrence, `the manual run minted an occurrence entry on the upgraded book — got ${JSON.stringify(ran)}`);
  const occRow = await entryRowOf(occurrence);
  if (occRow.status === "draft") {
    await approveEntry(h.sub, { entry: occurrence, expectedRevision: occRow.revision_token, opKey: opk("u45occa") });
  }
  assert.equal((await entryRowOf(occurrence)).status, "approved", "…and the single approving act lands");

  const mirror = (await rootQuery(
    "select id, auto_reversal_of, status from clara.journal_entries where auto_reversal_of=$1", [occurrence])).rows;
  assert.equal(mirror.length, 1, "ONE approval births EXACTLY ONE mirror linked by auto_reversal_of (WDB-G2)");
  assert.equal(mirror[0].auto_reversal_of, occurrence, "…and it points at the occurrence");
  assert.equal((await entryRowOf(occurrence)).auto_reversal_of, null, "…while the occurrence side stays NULL — the link is one-directional");
  const arvLive = (await rootQuery(
    "select count(auto_reversal_of)::int as nonnull from clara.journal_entries")).rows[0];
  assert.equal(Number(arvLive.nonnull), 1,
    "auto_reversal_of TRANSITIONED: 0 non-null rows across 0042/0043/0044 and at 0045's apply, exactly 1 once D-b2's first writer fires");
  noteLane("D-b2 drill: auto_reversal_of goes 0 → 1 on the upgraded book — census §4 Option A's dormant column is finally paid off");
  noteLane("D-b2 drill: the whole four-slice chain composes on a populated pre-0042 book, and the template lifecycle works on it");
});
