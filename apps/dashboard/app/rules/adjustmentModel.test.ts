// The AdjustmentTemplatePanel's pure-model tests (the rules/model.test.ts
// sibling idiom): mappers + the display-only predicates the panel branches on.
// No network, no React.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readAdvisory, advisoryOk, advisoryUnavailable, templateBlockState, templateDueState,
  type AdjustmentRunDue,
  toAdjustmentTemplateRow, toListAdjustmentTemplatesRead, toListAdjustmentRunsRead,
  toAdjustmentRunDue, toAdjustmentRunRow, latestRunForTemplate, templateIsBlocked, blockedReasonLabel,
  canSignTemplate, canRetireTemplate, templateLinesBalance,
  predecessorOf, retiredTemplates, proposeWarningAxisLabel, proposeRefusalLabel,
} from "./adjustmentModel";

test("toAdjustmentTemplateRow accepts the 0042 `template_id` spelling AND the bare DDL `id` fallback", () => {
  assert.equal(toAdjustmentTemplateRow({ template_id: "t1" }).template_id, "t1");
  assert.equal(toAdjustmentTemplateRow({ id: "t2" }).template_id, "t2");
  assert.equal(
    toAdjustmentTemplateRow({ template_id: "t1", occurrence_draft_entry_id: "e9" }).occurrence_draft_entry_id, "e9",
    "the blocking draft's id rides the row so the panel can point at it",
  );
  assert.equal(toAdjustmentTemplateRow({ template_id: "t1" }).occurrence_draft_entry_id, null);
});

test("toListAdjustmentTemplatesRead flags a wrong shape as unavailable rather than as an empty registry", () => {
  const ok = toListAdjustmentTemplatesRead({ client_id: "c1", templates: [{ template_id: "t1", status: "proposed" }], live_count: 0, draft_blocked_count: 0 });
  assert.equal(ok.available, true);
  assert.equal(ok.templates[0]?.status, "proposed");
  assert.equal(ok.live_count, 0);

  const bad = toListAdjustmentTemplatesRead([{ template_id: "t1" }]);
  assert.equal(bad.available, false, "a bare array is an UNKNOWN shape — a 404/shape drift must never read as 'no templates'");
  assert.deepEqual(bad.templates, []);
  assert.equal(toListAdjustmentTemplatesRead(null).available, false);
});

test("latestRunForTemplate takes the DB's head row for that template and never re-sorts", () => {
  const read = toListAdjustmentRunsRead({
    client_id: "c1",
    runs: [
      { id: "r-jul", template_id: "t1", period_end: "2026-07-31", amount_cents: 40000, mode: "draft" },
      { id: "r-jun", template_id: "t1", period_end: "2026-06-30", amount_cents: 40000, mode: "post" },
      { id: "r-x", template_id: "t2", period_end: "2026-07-31", amount_cents: 30000, mode: "draft" },
    ],
  });
  assert.equal(read.available, true);
  assert.equal(latestRunForTemplate(read.runs, "t1")?.id, "r-jul");
  assert.equal(latestRunForTemplate(read.runs, "t2")?.id, "r-x");
  assert.equal(latestRunForTemplate(read.runs, "t3"), null, "a template with no run yet is null, not a crash");
});

test("templateIsBlocked + blockedReasonLabel distinguish the TRANSIENT reason from the TERMINAL one", () => {
  const due = toAdjustmentRunDue({
    due: false, reason: "all_blocked",
    blocked: [
      { template_id: "t1", reason: "occurrence_draft_outstanding" },
      { template_id: "t2", reason: "template_line_ineligible" },
    ],
  });
  assert.equal(templateIsBlocked("t1", due)?.reason, "occurrence_draft_outstanding");
  assert.equal(templateIsBlocked("t3", due), null);
  assert.match(blockedReasonLabel("occurrence_draft_outstanding"), /approve or withdraw/);
  assert.match(blockedReasonLabel("template_line_ineligible"), /retire it and propose a replacement/);
  // [as-built ladder round 5] the third reason: terminal for the PERIOD, and its gloss must
  // not promise an act that would not clear it (a hand entry is right accounting but does not
  // re-open the automatic lane).
  assert.match(blockedReasonLabel("period_correction_unsound"), /double the period's own balance/);
  assert.match(blockedReasonLabel("period_correction_unsound"), /retire this template/);
  assert.doesNotMatch(blockedReasonLabel("period_correction_unsound"), /approve or withdraw/);
  // [round 6] The generation gate's own reason. Its remedy is the OPPOSITE of the row above —
  // correcting the standing entry in its own period is what releases the month, and retiring
  // the new template would throw the correction away — so the gloss must not tell a bookkeeper
  // to retire anything.
  assert.match(blockedReasonLabel("period_shape_already_met"), /correct that entry within its own period/);
  assert.match(blockedReasonLabel("period_shape_already_met"), /distinct account codes/);
  assert.doesNotMatch(blockedReasonLabel("period_shape_already_met"), /retire/);
  assert.doesNotMatch(blockedReasonLabel("period_shape_already_met"), /approve or withdraw/);
  assert.equal(blockedReasonLabel("some_future_reason"), "some_future_reason", "an unnamed reason still renders verbatim");
});

test("the lifecycle gates: only a proposal can be signed; a retired template offers nothing", () => {
  assert.equal(canSignTemplate({ status: "proposed" }), true);
  assert.equal(canSignTemplate({ status: "live" }), false);
  assert.equal(canRetireTemplate({ status: "live" }), true);
  assert.equal(canRetireTemplate({ status: "retired" }), false);
});

test("templateLinesBalance is a PREVIEW only and refuses to call a one-line or zero-sum set balanced", () => {
  const ok = templateLinesBalance([
    { account_code: "900-000", debit_cents: 50000, credit_cents: 0 },
    { account_code: "400-000", debit_cents: 0, credit_cents: 50000 },
  ]);
  assert.equal(ok.balanced, true);
  assert.equal(ok.debitSum, 50000);
  assert.equal(templateLinesBalance([{ account_code: "900-000", debit_cents: 50000, credit_cents: 0 }]).balanced, false);
  assert.equal(templateLinesBalance([
    { account_code: "900-000", debit_cents: 0, credit_cents: 0 },
    { account_code: "400-000", debit_cents: 0, credit_cents: 0 },
  ]).balanced, false, "an all-zero set is not a balanced set — an occurrence always carries a charge");
});

// === ROUND-3 CELLS — the advisory tri-state ==================================
// The defect: AdjustmentTemplatePanel swallowed BOTH advisory reads with
// `.catch(() => null)`, so a failed `adjustment_run_due` rendered every template
// as un-blocked and never-due, and a failed `list_adjustment_runs` rendered
// every template as never-run — a CONFIDENT WRONG ANSWER about whether the
// sweep is stuck. These cells ask the questions the fix's own corridor did not:
// the SECOND failure mode (a resolved-but-wrong-shaped envelope), and whether
// "unknown" can still collapse into "clear" anywhere downstream.

test("[round-3] toAdjustmentRunDue carries a SHAPE signal — a wrong shape is not 'nothing is due'", () => {
  const real = toAdjustmentRunDue({ due: true, template_id: "t1", period_start: "2026-07-01", period_end: "2026-07-31", blocked: [] });
  assert.equal(real.available, true);
  assert.equal(real.due, true);
  // A bare array (the shape this wave's sibling reads were WRONGLY unwrapped as
  // in round 2), a null, and an envelope missing `due` are all UNAVAILABLE.
  for (const wrong of [[], null, undefined, { blocked: [] }, "nope"]) {
    const a = toAdjustmentRunDue(wrong);
    assert.equal(a.available, false, `${JSON.stringify(wrong)} must read as unavailable`);
    assert.equal(a.due, false, "…and its `due` must stay falsy, so only `available` can be trusted");
  }
});

test("[round-3] BOTH advisory failure modes land as unavailable — a THROW and a wrong SHAPE", async () => {
  const thrown = await readAdvisory(Promise.reject(new Error("PostgREST 404")), () => true);
  assert.equal(thrown.available, false);
  assert.equal(thrown.value, null);
  assert.match(thrown.error ?? "", /404/, "the reason must survive so the banner can name it");

  // The mode the old `.catch(() => null)` could NEVER have caught: the promise
  // RESOLVES, with an envelope that is the wrong shape.
  const wrongShape = await readAdvisory(Promise.resolve({ available: false }), (v) => v.available);
  assert.equal(wrongShape.available, false);
  assert.equal(wrongShape.value, null);

  const good = await readAdvisory(Promise.resolve({ available: true }), (v) => v.available);
  assert.equal(good.available, true);
  assert.deepEqual(good.value, { available: true });
});

test("[round-3] blocked/due are THREE-state — 'we could not ask' never collapses into 'all clear'", () => {
  const dueRead = toAdjustmentRunDue({ due: true, template_id: "t1", period_start: "2026-07-01", period_end: "2026-07-31", blocked: [{ template_id: "t2", reason: "occurrence_draft_outstanding" }] });
  const ok = advisoryOk(dueRead);
  assert.equal(templateDueState("t1", ok), "due");
  assert.equal(templateDueState("t2", ok), "not_due");
  assert.equal(templateBlockState("t2", ok).state, "blocked");
  assert.equal(templateBlockState("t1", ok).state, "clear");

  // …and when the oracle is unavailable, EVERY template is unknown — not clear,
  // not not-due. This is the assertion the old code could not have satisfied:
  // it had no third state to return.
  const gone = advisoryUnavailable<AdjustmentRunDue>("boom");
  assert.equal(templateDueState("t1", gone), "unknown");
  assert.equal(templateDueState("t2", gone), "unknown");
  assert.equal(templateBlockState("t1", gone).state, "unknown");
  assert.equal(templateBlockState("t2", gone).state, "unknown");

  // A well-formed-but-EMPTY oracle is a genuine "clear" and must stay one, so
  // the fix cannot be satisfied by calling everything unknown.
  const empty = advisoryOk(toAdjustmentRunDue({ due: false, blocked: [] }));
  assert.equal(templateBlockState("t1", empty).state, "clear");
  assert.equal(templateDueState("t1", empty), "not_due");
});

// === ROUND-8 F3 — toAdjustmentRunDue's top-level `reason` ======================
// The defect: `reason` was read nowhere on the envelope, so `client_not_found` — a
// well-formed `{due:false, reason:'client_not_found'}` boolean the caller could not
// even resolve to a client — rendered as a confident "nothing is due", the SAME
// class of false-clear `available` already guards against for a wrong SHAPE. These
// cells cover all three of 0042 §2.3's top-level reasons, not only the one that
// changes `available`.

test("[round-8 F3] toAdjustmentRunDue carries the top-level `reason`, and `client_not_found` alone flips `available` false", () => {
  const nothingDue = toAdjustmentRunDue({ due: false, reason: "nothing_due", blocked: [] });
  assert.equal(nothingDue.reason, "nothing_due");
  assert.equal(nothingDue.available, true, "an ordinary caught-up answer stays available — a well-formed due:false is not itself bad news");

  const allBlocked = toAdjustmentRunDue({
    due: false, reason: "all_blocked",
    blocked: [{ template_id: "t1", reason: "occurrence_draft_outstanding" }],
  });
  assert.equal(allBlocked.reason, "all_blocked");
  assert.equal(allBlocked.available, true, "all_blocked is a real, well-formed answer — the panel must be able to SHOW it, not hide it behind 'unavailable'");
  assert.equal(allBlocked.blocked.length, 1);

  const clientNotFound = toAdjustmentRunDue({ due: false, reason: "client_not_found" });
  assert.equal(clientNotFound.reason, "client_not_found");
  assert.equal(
    clientNotFound.available, false,
    "client_not_found is a well-formed due:false BOOLEAN but names a caller the DB could not resolve to a client — the module's existing 'wrong shape reads as unknown, never a confident empty' law extended to a wrong-CLIENT answer",
  );
  assert.equal(clientNotFound.due, false, "…and `due` itself must stay falsy, so only `available` can be trusted, exactly like the wrong-shape case above");

  // due:true never carries a top-level reason (0042 §2.3's jsonb_build_object omits it
  // on that branch) — must read as null, not as a stale leftover or an empty string.
  assert.equal(toAdjustmentRunDue({ due: true, template_id: "t1", period_start: "2026-01-01", period_end: "2026-01-31", blocked: [] }).reason, null);
});

// === ROUND-8 F4 — toAdjustmentRunRow's correctable/active_pair_* triplet =======
// M1 (a sibling lane) adds these three EXACT keys to the run json this round; this
// FIXTURE reproduces the spec M1-intersection-gate.md §Finding-4 pins (the four
// reachable states: uncorrected / pair pending / pair completed / solo). M1's own
// cells prove the DB actually emits this shape — this file only proves the mapper
// reads it, byte for byte.

test("[round-8 F4] toAdjustmentRunRow carries the correctable/active_pair_id/active_pair_status triplet across all four reachable DB states", () => {
  const uncorrected = toAdjustmentRunRow({ id: "r1", correctable: true, active_pair_id: null, active_pair_status: null });
  assert.equal(uncorrected.correctable, true);
  assert.equal(uncorrected.active_pair_id, null);
  assert.equal(uncorrected.active_pair_status, null);

  const pending = toAdjustmentRunRow({ id: "r1", correctable: false, active_pair_id: "p1", active_pair_status: "pending" });
  assert.equal(pending.correctable, false);
  assert.equal(pending.active_pair_id, "p1");
  assert.equal(pending.active_pair_status, "pending");

  const completed = toAdjustmentRunRow({ id: "r1", correctable: false, active_pair_id: "p1", active_pair_status: "completed" });
  assert.equal(completed.correctable, false);
  assert.equal(completed.active_pair_status, "completed");

  const solo = toAdjustmentRunRow({ id: "r1", correctable: false, active_pair_id: null, active_pair_status: null });
  assert.equal(solo.correctable, false);
  assert.equal(solo.active_pair_id, null);

  // An envelope minted BEFORE this key existed (assetsApi.ts's "dashboard deploys
  // before the migration merges" gap) must degrade to a HIDDEN correction door, never
  // a wrongly-offered one.
  const preM1 = toAdjustmentRunRow({ id: "r1" });
  assert.equal(preM1.correctable, false);
  assert.equal(preM1.active_pair_id, null);
  assert.equal(preM1.active_pair_status, null);
});

// === ROUND-11 W2 FINDING 4 — NO GLOSS MAY NAME AN ACT THE ROW DOES NOT OFFER ======
// THE DEFECT: two glosses opened "Run the template by hand first: the refusal names …".
// MEASURED (W2 probes p5/p6): a blocked template's due envelope is {due:false,
// reason:'all_blocked', blocked:[{template_id, reason}]} with no period at all, and the
// panel renders its Run control only while the oracle names a period for THIS template —
// so the row printing that instruction had no run affordance, and the whole remedy grammar
// the instruction promised was composed into a refusal the product could never elicit.

test("[round-11 W2 F4] no blocked gloss tells the reader to run the template by hand — the row carries no run affordance in any blocked state", () => {
  const reasons = [
    "occurrence_draft_outstanding", "template_line_ineligible", "period_correction_unsound",
    "period_shape_already_met", "replaced_generation_period_standing",
  ];
  for (const r of reasons) {
    assert.doesNotMatch(blockedReasonLabel(r), /[Rr]un (the )?(this )?template by hand/,
      `${r}: the gloss names an act the blocked row does not offer`);
  }
  // …and the glosses did NOT get emptied to satisfy that: each still names a real remedy.
  assert.match(blockedReasonLabel("template_line_ineligible"), /retire it and propose a replacement/);
  assert.match(blockedReasonLabel("period_shape_already_met"), /correct that entry within its own period/);
  assert.match(blockedReasonLabel("period_shape_already_met"), /distinct account codes/);
  assert.doesNotMatch(blockedReasonLabel("period_shape_already_met"), /retire/);
});

test("[round-11] the FIFTH blocked reason — the lineage prohibition — has its own gloss, and it names only reachable acts", () => {
  const g = blockedReasonLabel("replaced_generation_period_standing");
  assert.notEqual(g, "replaced_generation_period_standing", "the new CLR38 token must not render as a bare token");
  assert.match(g, /REPLACEMENT/, "the reader must learn that a DECLARED lineage is what turned this on");
  assert.doesNotMatch(g, /[Rr]un (the )?(this )?template by hand/);
  // The DB's own three remedies, in the DB's own order (MEASURED on rig clara_r11_fix: remedy =
  // ['correct_the_standing_entry_in_period','start_after_replaced_generation',
  // 're_propose_without_predecessor']). The gloss must carry all three — offering only the
  // first two would hide the one escape that always works.
  assert.match(g, /correct the predecessor's standing charges within their own periods/);
  assert.match(g, /start this template after the generation it replaces last charged/);
  assert.match(g, /propose it again naming no predecessor/);
  const order = ["correct the predecessor", "start this template after", "naming no predecessor"]
    .map((s) => g.indexOf(s));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "the acts must read in the DB's own remedy order");
  // THE CORRIDOR GUARD. An earlier draft said "declaring the same predecessor", which walks the
  // reader into CLR10 template_replaces_already_succeeded — the predecessor already has THIS
  // template as its successor. The gloss must warn instead of leading.
  assert.doesNotMatch(g, /declaring the same predecessor/);
  assert.match(g, /template_replaces_already_succeeded/, "the refusal it would hit is named, not left to be discovered");
});

// [round-12, Codex CXR4/E33] THE CORRIDOR GUARD ITSELF WAS MEASURED HALF-WRONG, and this cell is
// the split. The round-11 draft told every reader the re-proposal "must NOT name the same
// predecessor again". MEASURED against the DB (cell x42.r12f, rig clara_r12_fix): after retiring
// THIS template, re-proposing with the SAME predecessor and a later start date is ACCEPTED — a
// retired successor is in neither lineage index. So the two remedies have different rules and the
// gloss must say which is which: START-AFTER may keep the declaration (and should, because the
// declaration is what keeps the wall standing on the new row); only the "the lineage claim was
// wrong" case drops it. What the DB actually refuses is an ORDER, and both refusals are named.
test("[round-12 CXR4] the lineage gloss splits the two remedies: start-after MAY keep the predecessor, only the wrong-claim case drops it, and the refused ORDER is named with both tokens", () => {
  const g = blockedReasonLabel("replaced_generation_period_standing");
  assert.doesNotMatch(g, /must NOT name the same predecessor again/,
    "the sentence that was measured false is gone, not softened");
  assert.match(g, /Starting after MAY keep the same predecessor/,
    "the remedy the DB admits is described as admitted");
  assert.match(g, /only the case where the lineage claim itself was wrong drops it/,
    "…and the ONE remedy that omits the declaration is named as that case");
  assert.match(g, /retiring this template and proposing it afresh, in that order/,
    "the ordering is the load-bearing part, so it is stated as an order");
  assert.match(g, /template_replaces_already_succeeded/);
  assert.match(g, /template_lineage_root_occupied/,
    "round-12's root law has a token too, and a reader who meets it should have read it here first");
});

// [round-12, Codex CXR2] THE FIFTH LINEAGE REFUSAL gets a gloss. Round 11's law was keyed on the
// EDGE; the fork moved one generation up and left two live leaves booking the same months.
test("[round-12 CXR2] template_lineage_root_occupied is glossed, and it names the act that clears it", () => {
  const g = proposeRefusalLabel("template_lineage_root_occupied") ?? "";
  assert.notEqual(g, "", "a token this build ships a refusal for may not fall through to the raw message");
  assert.match(g, /one unretired continuation/, "the law, in the words the DB uses");
  assert.match(g, /retire that one first/, "…and an act that is on this panel");
  assert.match(g, /without naming a predecessor/, "…and the other one");
});

// === ROUND-11 XP2 — THE LINEAGE KEY, ITS LOOKUPS, AND THE PROPOSE LABELS ==========

test("[round-11 XP2] toAdjustmentTemplateRow carries replaces_template_id, and an envelope minted before it degrades to 'declares nothing'", () => {
  assert.equal(toAdjustmentTemplateRow({ template_id: "t1", replaces_template_id: "t0" }).replaces_template_id, "t0");
  assert.equal(toAdjustmentTemplateRow({ template_id: "t1", replaces_template_id: null }).replaces_template_id, null);
  assert.equal(toAdjustmentTemplateRow({ template_id: "t1" }).replaces_template_id, null,
    "an older envelope must read as 'replaces nothing', never crash the row");
});

test("[round-11 XP2] predecessorOf resolves a declaration out of the client's own list, and tells 'declares nothing' from 'declares something we cannot name'", () => {
  const t0 = toAdjustmentTemplateRow({ template_id: "t0", name: "Audit fee accrual (2025)", status: "retired" });
  const t1 = toAdjustmentTemplateRow({ template_id: "t1", name: "Audit fee accrual", status: "live", replaces_template_id: "t0" });
  const orphan = toAdjustmentTemplateRow({ template_id: "t2", status: "live", replaces_template_id: "t-gone" });
  assert.equal(predecessorOf([t0, t1], t1)?.name, "Audit fee accrual (2025)");
  assert.equal(predecessorOf([t0, t1], t0), null, "a template that declares nothing has no predecessor");
  assert.equal(predecessorOf([t0, t1], orphan), null,
    "an unresolvable declaration is also null here — the RENDER is what must tell the two apart, and it does");
});

test("[round-11 XP2] retiredTemplates is the ONLY legal predecessor set — a live one is refused by name, so offering one would rebuild the walled corridor", () => {
  const rows = [
    toAdjustmentTemplateRow({ template_id: "a", status: "retired" }),
    toAdjustmentTemplateRow({ template_id: "b", status: "live" }),
    toAdjustmentTemplateRow({ template_id: "c", status: "proposed" }),
    toAdjustmentTemplateRow({ template_id: "d", status: "retired" }),
  ];
  assert.deepEqual(retiredTemplates(rows).map((t) => t.template_id), ["a", "d"]);
  assert.deepEqual(retiredTemplates([]), []);
});

test("[round-11 XP2] the propose labels: three warning axes and four lineage refusals, each naming an act the form offers", () => {
  assert.match(proposeWarningAxisLabel("colliding_live_sibling"), /already covers this shape/);
  assert.match(proposeWarningAxisLabel("implausible_start_date"), /implausible/);
  assert.match(proposeWarningAxisLabel("replaced_period_overlap"), /periods this one would book/);
  assert.equal(proposeWarningAxisLabel("some_future_axis"), "some_future_axis", "an unnamed axis renders verbatim");

  assert.match(proposeRefusalLabel("template_replaces_unknown") ?? "", /not a template of this client/);
  assert.match(proposeRefusalLabel("template_replaces_not_retired") ?? "", /retire the one you are replacing first/);
  assert.match(proposeRefusalLabel("template_replaces_chain_too_long") ?? "", /length cap/);
  assert.match(proposeRefusalLabel("template_replaces_already_succeeded") ?? "", /already has a successor/);
  assert.equal(proposeRefusalLabel("something_else"), null,
    "an unknown token returns null so the caller falls back to the DB's own message rather than inventing a gloss");
  assert.equal(proposeRefusalLabel(null), null);
});

// === ROUND-11 W2 FINDING 5 — correction_wall_advice ================================

test("[round-11 W2 F5] toAdjustmentRunRow carries correction_wall_advice, and 'no advice' stays its own fact", () => {
  const walled = toAdjustmentRunRow({
    id: "r1", correctable: false, correction_wall: "advance_movement_unregistered",
    correction_wall_advice: "Reverse a pre-enrolment entry BEFORE the code is enrolled, or carry the balance down onto a fresh dedicated code.",
  });
  assert.equal(walled.correction_wall, "advance_movement_unregistered");
  assert.match(walled.correction_wall_advice ?? "", /carry the balance down onto a fresh dedicated code/);

  assert.equal(toAdjustmentRunRow({ id: "r1", correction_wall: "fa_reversal_blocked", correction_wall_advice: null }).correction_wall_advice, null);
  assert.equal(toAdjustmentRunRow({ id: "r1" }).correction_wall_advice, null,
    "an envelope minted before the key existed reads as 'no sentence', never as a crash");
});
