// AdjustmentRunReceiptCard tests — round-7 F-F1: the /rules panel promised a
// correction lane (`reverse_adjustment_pair`) with no door anywhere in the
// dashboard, and its "…/reverse_entry" fallback named a verb this app never
// wires at all (grep-verified). Pattern: renderToStaticMarkup + PURE state
// (the StaffAdvanceCard.test.tsx / ComplianceWatchCard.test.tsx precedent —
// no jsdom in this repo's runner, so interactive clicks are never simulated;
// every reachable UI STATE is instead rendered directly from props).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AdjustmentRunReceiptCard, AdjustmentRunReceiptView, correctionPhase, correctionActPairId,
  type RunCorrectionState,
} from "./AdjustmentRunReceiptCard";
import type { PairReversalResult } from "../adjustmentApi";
import type { AdjustmentRunRow } from "../../rules/adjustmentModel";
import type { AdjustmentRunReceiptPart } from "../parts";

const PART: AdjustmentRunReceiptPart = {
  type: "adjustment_run_receipt", client_id: "c1", run_id: "run-1", label: "Audit fee accrual",
};

const PAIRED_RUN: AdjustmentRunRow = {
  id: "run-1", client_id: "c1", template_id: "t1", period_start: "2026-06-01", period_end: "2026-06-30",
  mode: "post", entry_id: "occ-1", reversal_entry_id: "mirror-1", amount_cents: 50000, created_at: "2026-07-01T00:00:00Z",
  correctable: true, active_pair_id: null, active_pair_status: null,
  correction_verb: "clara.reverse_adjustment_pair", correction_wall: "adjustment_pair_locked",
  correction_entry: "occ-1", correction_wall_advice: null,
};
// [round-9] RE-DERIVED FROM A MEASURED get_adjustment_run, not from an assumption.
// The old fixture pinned correctable:false for a solo run and was green over a live
// DB answering correctable:TRUE with verb 'clara.reverse_entry' — which is exactly
// the state the card mis-rendered. A fixture that assumes the DB cannot catch the
// DB (cell x42.r9n1g is the measurement).
const SOLO_RUN: AdjustmentRunRow = {
  ...PAIRED_RUN, reversal_entry_id: null,
  correctable: true, correction_verb: "clara.reverse_entry", correction_wall: null,
};

// [round-9 F3] the reachable states as the SLICE correctionPhase consumes them
// (RunCorrectionState) — RE-DERIVED from `_adj_correction_door`'s measured answers
// (cell x42.r9n1g): the door names the VERB, and the card wires only the pair verb.
// [round-10 F4] correction_wall/reversal_entry_id join the slice — see PAIR_COMPLETED's
// own comment below for why UNCORRECTED/PAIR_PENDING carry the values they do.
// [round-11 W2 finding 5] `correction_wall_advice` joins the slice — `_adj_run_json` now
// exports the wall-owning body's own remedy sentence. These fixtures are ABI-SHAPED, not
// captured off a rig: the DB half of this fix wave is being built in the same wave, and
// the one advice string reproduced verbatim below (WALLED_ADVANCE) is the sentence r11's
// W2 lens MEASURED on the door, quoted in r11-W2-report.json's cleared list.
const UNCORRECTED: RunCorrectionState = {
  correctable: true, active_pair_id: null, active_pair_status: null, correction_verb: "clara.reverse_adjustment_pair",
  correction_wall: "adjustment_pair_locked", correction_wall_advice: null, reversal_entry_id: "mirror-1",
};
const SOLO: RunCorrectionState = {
  correctable: true, active_pair_id: null, active_pair_status: null, correction_verb: "clara.reverse_entry",
  correction_wall: null, correction_wall_advice: null, reversal_entry_id: null,
};
const PAIR_PENDING: RunCorrectionState = {
  correctable: false, active_pair_id: "p1", active_pair_status: "pending", correction_verb: null,
  correction_wall: "pair_already_active", correction_wall_advice: null, reversal_entry_id: "mirror-1",
};
// [round-10, r10-Z2-report.json finding 4] MEASURED DB-UNREACHABLE: `_adj_correction_door`'s
// pair lookup is scoped to `status in ('pending','approving')`, so a COMPLETED pair can never
// carry an `active_pair_id` — this exact envelope (active_pair_id SET alongside
// active_pair_status:'completed') cannot come off a live get_adjustment_run read. Kept as a
// DEFENSIVE case (correctionPhase must still do the right thing if the DB's shape ever widens
// to report a real completed pair id — see the O2 report's cross-section patch proposal, which
// would make this reachable), never cited as proof of what the DB does today. The REAL,
// DB-reachable completed state is COMPLETED_VIA_WALL below.
const PAIR_COMPLETED: RunCorrectionState = {
  correctable: false, active_pair_id: "p1", active_pair_status: "completed", correction_verb: null,
  correction_wall: "entry_already_reversed", correction_wall_advice: "This entry has already been reversed; a further correction would double the reversal.",
  reversal_entry_id: "mirror-1",
};
// [round-10 F4] THE REAL DB-REACHABLE COMPLETED STATE (r10-Z2-report.json finding 4, MEASURED
// on both stake levels): active_pair_id/active_pair_status are NULL once the pair that owned
// this occurrence completes — the door has no pair left to report. `correction_wall` +
// `reversal_entry_id` are the only signals a completed, ONCE-paired occurrence still carries.
const COMPLETED_VIA_WALL: RunCorrectionState = {
  correctable: false, active_pair_id: null, active_pair_status: null, correction_verb: null,
  correction_wall: "entry_already_reversed", correction_wall_advice: "This entry has already been reversed; a further correction would double the reversal.",
  reversal_entry_id: "mirror-1",
};
// The SAME wall on a run that was NEVER paired (reversal_entry_id null) — a hypothetical solo
// reverse_entry completion this dashboard does not wire anywhere today, but the door's wall
// alone cannot tell it apart from a paired completion; correctionPhase must not claim a pair.
const SOLO_REVERSED_NO_PAIR: RunCorrectionState = {
  correctable: false, active_pair_id: null, active_pair_status: null, correction_verb: null,
  correction_wall: "entry_already_reversed", correction_wall_advice: "This entry has already been reversed; a further correction would double the reversal.",
  reversal_entry_id: null,
};
// [round-11 W2 finding 5] THE WALLED STATES. `advance_movement_unregistered` is the exact
// composite W2 drove end to end (a parked pair over a code later lawfully enrolled as a staff
// advance): the door reports the wall and carries the OWNING body's own sentence verbatim,
// reproduced here from r11-W2-report.json. Before the fix this state's phase was {kind:'none'}
// and the token appeared NOWHERE in the markup.
const WALLED_ADVANCE: RunCorrectionState = {
  correctable: false, active_pair_id: null, active_pair_status: null, correction_verb: null,
  correction_wall: "advance_movement_unregistered",
  correction_wall_advice: "Reverse a pre-enrolment entry BEFORE the code is enrolled, or carry the balance down onto a fresh dedicated code.",
  reversal_entry_id: "mirror-1",
};
// A refusing door that carries NO sentence — W2's own door-side census measured wall_advice
// NULL on several branches, so "walled with no advice" is a real state and must render as
// its own thing rather than as an empty remedy.
const WALLED_NO_ADVICE: RunCorrectionState = {
  ...WALLED_ADVANCE, correction_wall: "fa_reversal_blocked", correction_wall_advice: null,
};

function noop() {}

function render(props: Partial<Parameters<typeof AdjustmentRunReceiptView>[0]> = {}): string {
  return renderToStaticMarkup(createElement(AdjustmentRunReceiptView, {
    part: PART, run: PAIRED_RUN, loading: false, busy: false, clr: null, err: null,
    phase: { kind: "offer" },
    reason: "", onReasonChange: noop, attestation: "", onAttestationChange: noop,
    cancelReason: "", onCancelReasonChange: noop,
    onOpenReason: noop, onAbandonReason: noop, onSubmitCorrection: noop, onSubmitApprove: noop, onSubmitCancel: noop,
    ...props,
  }));
}

// --- correctionPhase: the pure state machine ------------------------------------

test("correctionPhase: a solo (non-auto-reverse) run is correctable via reverse_entry, which this card honestly does NOT wire", () => {
  // [round-9 F3] The DB answers correctable:true with verb 'clara.reverse_entry' for a
  // solo occurrence (measured, x42.r9n1g). The card's only wired door is the PAIR verb,
  // so the honest render is 'no_door' NAMING the verb — never a dead button (round-8's
  // corridor) and never a false 'none' (the old fixture's assumption the live DB
  // contradicted).
  assert.deepEqual(correctionPhase(SOLO, false, null), { kind: "no_door", verb: "clara.reverse_entry" });
  assert.deepEqual(correctionPhase(SOLO, true, null), { kind: "no_door", verb: "clara.reverse_entry" }, "reasonOpen cannot open a door this card does not wire");
  assert.deepEqual(correctionPhase(null, false, null), { kind: "none" }, "a run still loading (null) offers no door — 'unknown' must not read as 'correctable'");
});

// [round-10 F5, r10-Z2-report.json finding 3] THE DEFECT THIS ROUND FIXED: `no_door` rendered
// byte-identically to `none` — the verb the phase carries never reached a pixel. Driven from
// `correctionPhase(SOLO_RUN, ...)` itself (not a fabricated `{kind:'none'}` substitution — the
// exact shortcut the r10 lens found this test taking) so the assertions are honest about which
// phase this run actually produces.
test("[round-10 F5] correctionPhase(SOLO_RUN) is honestly no_door, and its render is distinguishable from none — the verb reaches a pixel", () => {
  const phase = correctionPhase(SOLO_RUN, false, null);
  assert.deepEqual(phase, { kind: "no_door", verb: "clara.reverse_entry" });
  const html = render({ run: SOLO_RUN, phase });
  assert.match(html, /Correctable via/);
  assert.match(html, /<code>clara\.reverse_entry<\/code>/);
  assert.ok(!html.includes("Correct this run"), "a solo run must not offer a button that would refuse");
  // The regression itself: no_door and none must NOT render the same markup on the same run.
  const noneHtml = render({ run: SOLO_RUN, phase: { kind: "none" } });
  assert.notEqual(html, noneHtml, "no_door must render distinctly from none (the exact byte-identical-render regression r10 Z2 measured)");
});

test("correctionPhase: an UNCORRECTED run offers, then opens the reason form, on the SAME occurrence", () => {
  assert.deepEqual(correctionPhase(UNCORRECTED, false, null), { kind: "offer" });
  assert.deepEqual(correctionPhase(UNCORRECTED, true, null), { kind: "reason_form" });
});

// [round-8 F4] THE DEFECT THIS ROUND FIXED: an already-corrected/parked pair must
// render its OWN state, not the button — read straight off the DB's own
// active_pair_id/active_pair_status, with NO local pairResult required (e.g. a
// second page load of a run someone else already corrected).
test("[round-8 F4] correctionPhase reads PAIR PENDING and PAIR COMPLETED straight off the DB triplet — no local action required", () => {
  assert.deepEqual(correctionPhase(PAIR_PENDING, false, null), { kind: "pending", pairId: "p1" });
  assert.deepEqual(correctionPhase(PAIR_COMPLETED, false, null), { kind: "completed", pairId: "p1" });
  // reasonOpen cannot override an active pair — the SAME authority that would
  // refuse a new correction already says one is in flight or done.
  assert.deepEqual(correctionPhase(PAIR_PENDING, true, null), { kind: "pending", pairId: "p1" });
});

// [round-10 F4] THE DEFECT THIS ROUND FIXED (r10-Z2-report.json finding 4): a COMPLETED pair
// reads active_pair_id:null (the door's pair lookup excludes finished pairs by construction),
// so the round-8 branch above never fires for it — a completed correction rendered exactly
// like an uncorrected run. correctionPhase must re-key off correction_wall instead, off the
// DB-REACHABLE envelope (COMPLETED_VIA_WALL), not the impossible one (PAIR_COMPLETED, above).
test("[round-10 F4] correctionPhase re-keys a COMPLETED pair off correction_wall when active_pair_id has already dropped out — the DB-reachable shape, not the impossible one", () => {
  assert.deepEqual(correctionPhase(COMPLETED_VIA_WALL, false, null), { kind: "completed", pairId: null },
    "no pair id is knowable off the wall alone — the phase must not fabricate one");
  assert.deepEqual(correctionPhase(COMPLETED_VIA_WALL, true, null), { kind: "completed", pairId: null },
    "reasonOpen cannot reopen a correction that already happened");
  // A fresh local pairResult (this same browser session just finished the pair) still wins —
  // the wall-based re-key is a FALLBACK for a rehydrated page load, never a substitute for the
  // real id this session already knows.
  const r: PairReversalResult = { pair_id: "p9", status: "completed" };
  assert.deepEqual(correctionPhase(COMPLETED_VIA_WALL, false, r), { kind: "completed", pairId: "p9" },
    "a fresh local result must still win over the wall-derived fallback");
});

test("[WDB-R4 off-path, round-10 F4] correctionPhase does not claim a pair for a solo (never-paired) occurrence that reads entry_already_reversed — reversal_entry_id, not the wall alone, is what proves a pair ever existed", () => {
  // SOLO_REVERSED_NO_PAIR carries the SAME correction_wall as COMPLETED_VIA_WALL but no
  // reversal_entry_id — a run that was never paired cannot have been completed BY a pair, so
  // the wall-based re-key must not fire and NO pair may be claimed.
  //
  // [round-11 W2 finding 5] RE-CUT, and the round-10 assertion this replaces is preserved
  // exactly: the phase must still name no pair. What changed is the OTHER half — it used to
  // read {kind:'none'}, i.e. byte-identical silence, and this state is a refusing door with a
  // reason. It now names the wall and carries the DB's sentence, and the assertions below say
  // BOTH things: no pair id anywhere, and the wall on a pixel.
  const phase = correctionPhase(SOLO_REVERSED_NO_PAIR, false, null);
  assert.deepEqual(phase, {
    kind: "walled", wall: "entry_already_reversed",
    advice: "This entry has already been reversed; a further correction would double the reversal.",
  });
  assert.ok(!("pairId" in phase), "the round-10 law is intact: no pair may be claimed from the wall alone");
});

test("correctionPhase: a low-stakes result is COMPLETED — inert, names the pair", () => {
  const r: PairReversalResult = { pair_id: "p1", status: "completed" };
  assert.deepEqual(correctionPhase(UNCORRECTED, false, r), { kind: "completed", pairId: "p1" });
  // reasonOpen is moot once a result exists — the result always wins.
  assert.deepEqual(correctionPhase(UNCORRECTED, true, r), { kind: "completed", pairId: "p1" });
});

test("correctionPhase: a high-stakes result PARKS — actionable, never silent", () => {
  const r: PairReversalResult = { pair_id: "p1", status: "pending" };
  assert.deepEqual(correctionPhase(UNCORRECTED, false, r), { kind: "pending", pairId: "p1" });
});

test("[WDB-R4 off-path] correctionPhase: an UNRECOGNISED status defaults to pending, never to silence", () => {
  const r = { pair_id: "p1", status: "something_new" } as unknown as PairReversalResult;
  assert.deepEqual(correctionPhase(UNCORRECTED, false, r), { kind: "pending", pairId: "p1" },
    "a status this card does not recognise must still read as 'needs a human', not vanish");
});

test("[WDB-R4 off-path, x42.c3] correctionPhase: a CANCELLED pair returns 'cancelled' (never a silent fall-through) even off a STALE (pre-cancel) run snapshot", () => {
  const r: PairReversalResult = { pair_id: "p1", status: "cancelled" };
  // A FRESH local result always wins over `run` — proven here by deliberately
  // passing the STALE pre-cancel PAIR_PENDING triplet (the row is never
  // re-fetched after an action): the branch must not depend on `run` catching up.
  assert.deepEqual(correctionPhase(PAIR_PENDING, false, r), { kind: "cancelled", pairId: "p1" });
});

// --- view: every phase renders honestly ------------------------------------------

test("no token: the card asks for a JWT and offers no correction affordance", () => {
  const html = renderToStaticMarkup(createElement(AdjustmentRunReceiptCard, { token: null, part: PART }));
  assert.match(html, /Paste a session JWT/);
  assert.ok(!html.includes("Correct this run"));
});

test("a PAIRED run's offer phase shows the button and NEVER the phantom reverse_entry promise", () => {
  const html = render({ phase: { kind: "offer" } });
  assert.match(html, /Correct this run/);
  assert.match(html, /reverse_adjustment_pair/);
  // The exact defect this round fixed: the old copy told the user a correction
  // "rides reverse_adjustment_pair/reverse_entry" — a verb this app never wires.
  assert.ok(!html.includes("reverse_entry"), "no path may still promise the unwired verb");
});

// [round-10 F5] RETITLED, NOT REMOVED: this tests the `none` phase's OWN render (still a real,
// reachable phase — e.g. a run this card has not finished hydrating correction facts for) —
// it is NOT what correctionPhase(SOLO_RUN) actually produces (that is 'no_door', asserted
// separately above). Kept generic/defensive rather than framed as "the SOLO run's phase", the
// exact conflation Z2 measured (r10-Z2-report.json finding 3: the card's own test substituted
// {kind:'none'} for the phase the card actually computes for SOLO_RUN).
test("the `none` phase (no correction door reachable) offers no button, and a solo run's static header text names no phantom verb regardless of phase", () => {
  const html = render({ run: SOLO_RUN, phase: { kind: "none" } });
  assert.match(html, /NO auto-reversal pair/);
  assert.match(html, /not_an_auto_pair/);
  assert.ok(!html.includes("Correct this run"), "the none phase must not offer a button that would refuse");
  assert.ok(!html.includes("reverse_entry"), "no phantom fallback verb either");
});

test("the reason_form phase renders the input and a disabled-until-typed confirm", () => {
  const html = render({ phase: { kind: "reason_form" }, reason: "" });
  assert.match(html, /Reason for the correction/);
  assert.match(html, /<button[^>]*disabled[^>]*>Confirm — reverse this pair<\/button>/);
  const filled = render({ phase: { kind: "reason_form" }, reason: "wrong accrual" });
  assert.ok(!/<button[^>]*disabled[^>]*>Confirm — reverse this pair<\/button>/.test(filled),
    "a non-blank reason must enable the confirm");
});

test("a COMPLETED correction is inert — no button, states the pair id", () => {
  const html = render({ phase: { kind: "completed", pairId: "abcdef12-0000-0000-0000-000000000000" } });
  assert.match(html, /Correction completed/);
  assert.ok(!html.includes("Correct this run"));
  assert.ok(!html.includes("Approve"));
});

// [round-10 F4, r10-Z2-report.json finding 4] THE REAL DB-REACHABLE COMPLETED RENDER: no pair
// id is knowable (see COMPLETED_VIA_WALL's own comment) — the card must say the correction
// completed WITHOUT fabricating an identifier, and must not offer a button.
test("[round-10 F4] a COMPLETED correction with NO known pair id (the wall-derived fallback) is still inert and honest — no fabricated identifier, no button", () => {
  const phase = correctionPhase(COMPLETED_VIA_WALL, false, null);
  assert.deepEqual(phase, { kind: "completed", pairId: null });
  const html = render({ run: PAIRED_RUN, phase });
  assert.match(html, /Correction completed/);
  assert.ok(!html.includes("Correct this run"));
  assert.ok(!html.includes("Approve"));
  assert.ok(!html.includes("pair abcdef"), "no fabricated pair id — this fixture carries none");
  // Contrast: the SAME render function on a real pair id still names it (the branch above,
  // proven again here so the two are read side by side, not only in separate test files).
  const withId = render({ phase: { kind: "completed", pairId: "p1" } });
  assert.match(withId, /pair/);
});

test("a PENDING (high-stakes) correction offers BOTH approve and cancel — never leaves its own park stranded", () => {
  const html = render({ phase: { kind: "pending", pairId: "abcdef12-0000-0000-0000-000000000000" } });
  assert.match(html, /Approve — complete the correction/);
  assert.match(html, /<button[^>]*disabled[^>]*>Cancel the correction<\/button>/, "cancel needs a reason first");
  const withReason = render({ phase: { kind: "pending", pairId: "p1" }, cancelReason: "wrong period" });
  assert.ok(!/<button[^>]*disabled[^>]*>Cancel the correction<\/button>/.test(withReason));
});

test("[WDB-R4 off-path] a CANCELLED correction re-offers the SAME occurrence rather than showing a dead end", () => {
  const html = render({ phase: { kind: "cancelled", pairId: "p1" } });
  assert.match(html, /was cancelled/);
  assert.match(html, /Correct this run/, "the DB allows a second pair on the same occurrence (x42.c3) — the card must too");
});

test("a governed refusal (CLR) renders its badge — never swallowed by the correction flow", () => {
  const html = render({ clr: { code: "CLR10", reason: "not_an_auto_pair" }, err: "clara.reverse_adjustment_pair: this occurrence is not an auto-reversing pair" });
  assert.match(html, /CLR10/);
  assert.match(html, /not_an_auto_pair/);
  assert.match(html, /is not an auto-reversing pair/);
});

// === ROUND-11 W2 FINDING 2 — THE PARK'S COMPLETER =================================
// THE DEFECT: `submitApprove`/`submitCancel` both opened `if (!token || !pairResult)
// return;` while `pairResult` is set ONLY by this session's own submit*. MEASURED: the
// checker is by DB law a DIFFERENT human (CLR05 `distinct_checker` refuses the maker; a
// second human succeeds) — a different browser session — so `pairResult` was null for
// every human permitted to press either button, both buttons rendered, and clicking fired
// NO RPC and showed NO error. Measured further: there is no other completer (plain
// approve_entry on a correction draft refuses CLR39 `pair_draft_locked`, this card is the
// sole call site of both pair verbs, and no review-queue door exists), so the park had no
// completer ANYWHERE in the product.

test("[round-11 W2 F2] the RELOAD-shaped park (pairResult null) yields a real acting pair id — the state and the act now come from the same authority", () => {
  // Exactly the checker's situation: a fresh session, no local result, the DB's own
  // active_pair_id on the row. The phase already read this correctly (round 8); the ACT did
  // not, which is why the two are asserted together here.
  const phase = correctionPhase(PAIR_PENDING, false, null);
  assert.deepEqual(phase, { kind: "pending", pairId: "p1" });
  assert.equal(correctionActPairId(phase), "p1",
    "the act must reach the DB's own pair key on a page the checker merely loaded");
  // The pre-fix selector, spelled out so the divergence is on the record rather than implied:
  // it is null in exactly this state, which is why both buttons were inert.
  const preFixSelector: string | null = (null as PairReversalResult | null)?.pair_id ?? null;
  assert.equal(preFixSelector, null);
});

test("[round-11 W2 F2] the SAME-SESSION park still acts on this session's own receipt — pairResult stays a freshness override, it is not merely dropped", () => {
  const fresh: PairReversalResult = { pair_id: "p9", status: "pending" };
  // A STALE run snapshot deliberately: the row still says p1, this session just parked p9.
  const phase = correctionPhase(PAIR_PENDING, false, fresh);
  assert.deepEqual(phase, { kind: "pending", pairId: "p9" });
  assert.equal(correctionActPairId(phase), "p9", "the freshest fact this card holds still wins");
});

test("[round-11 W2 F2] no NON-parked phase can hand an act a pair id — the acts exist only where a park does", () => {
  for (const phase of [
    correctionPhase(UNCORRECTED, false, null),
    correctionPhase(UNCORRECTED, true, null),
    correctionPhase(SOLO, false, null),
    correctionPhase(COMPLETED_VIA_WALL, false, null),
    correctionPhase(WALLED_ADVANCE, false, null),
    correctionPhase(null, false, null),
    correctionPhase(UNCORRECTED, false, { pair_id: "p1", status: "cancelled" }),
    correctionPhase(UNCORRECTED, false, { pair_id: "p1", status: "completed" }),
  ]) {
    assert.equal(correctionActPairId(phase), null, `${phase.kind} must offer no pair to act on`);
  }
});

test("[round-11 W2 F2] the card's approve/cancel handlers no longer gate on session-local pairResult", async () => {
  // A SOURCE cell (the StaffAdvanceCard.test.tsx precedent): the defect was a guard clause
  // in a click handler, and this repo's runner has no jsdom to click through — so the guard
  // itself is what gets asserted. Red on the pre-fix file, where both handlers read
  // `if (!token || !pairResult) return;` and then `pairResult.pair_id`.
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("./AdjustmentRunReceiptCard.tsx", import.meta.url), "utf8"));
  const approve = src.slice(src.indexOf("const submitApprove"), src.indexOf("const submitCancel"));
  const cancel = src.slice(src.indexOf("const submitCancel"), src.indexOf("if (!token) {"));
  assert.ok(approve.length > 0 && cancel.length > 0, "the handlers were not found — this cell would pass vacuously");
  for (const [label, body] of [["approve", approve], ["cancel", cancel]] as const) {
    assert.ok(!/pairResult/.test(body),
      `submit${label} still reads session-local pairResult — the checker never has one (setPairResult is a different identifier and is expected here)`);
    assert.match(body, /actPairId/, `submit${label} must take the pair id from the phase`);
  }
});

// === ROUND-11 W2 FINDING 5 — EVERY WALL RENDERED AS SILENCE ========================
// MEASURED: for advance_movement_unregistered, pair_half_not_approved,
// pair_half_already_reversed, allocated_items_present, live_bank_match_present and
// fa_reversal_blocked the phase was {kind:'none'} and the wall token appeared NOWHERE in
// the markup — a refused run rendered exactly like a healthy uncorrected one minus a
// button, under a static line still promising the correction "rides reverse_adjustment_
// pair", the verb measured to refuse CLR40 in that very state.

test("[round-11 W2 F5] a refusing door is a `walled` phase carrying the wall AND the DB's own sentence", () => {
  assert.deepEqual(correctionPhase(WALLED_ADVANCE, false, null), {
    kind: "walled", wall: "advance_movement_unregistered",
    advice: "Reverse a pre-enrolment entry BEFORE the code is enrolled, or carry the balance down onto a fresh dedicated code.",
  });
  assert.deepEqual(correctionPhase(WALLED_ADVANCE, true, null), {
    kind: "walled", wall: "advance_movement_unregistered",
    advice: "Reverse a pre-enrolment entry BEFORE the code is enrolled, or carry the balance down onto a fresh dedicated code.",
  }, "reasonOpen cannot open a door the DB closed");
  // A wall with no sentence is still a wall — the token is the answer, and 'none' must not
  // absorb it.
  assert.deepEqual(correctionPhase(WALLED_NO_ADVICE, false, null), {
    kind: "walled", wall: "fa_reversal_blocked", advice: null,
  });
  // `none` keeps its own meaning: no door AND no reason (e.g. an envelope minted before the
  // correction keys existed). It must not become a synonym for walled.
  assert.deepEqual(
    correctionPhase({ correctable: false, active_pair_id: null, active_pair_status: null, correction_verb: null, correction_wall: null, correction_wall_advice: null, reversal_entry_id: null }, false, null),
    { kind: "none" },
  );
});

test("[round-11 W2 F5] the walled render puts the wall token AND its advice on a pixel, and is distinguishable from silence", () => {
  const phase = correctionPhase(WALLED_ADVANCE, false, null);
  const html = render({ run: PAIRED_RUN, phase });
  assert.match(html, /<code>advance_movement_unregistered<\/code>/, "the token the DB named must reach a pixel");
  assert.match(html, /carry the balance down onto a fresh dedicated code/, "…and the wall-owning body's own remedy sentence with it");
  assert.ok(!html.includes("Correct this run"), "a closed door offers no button");
  // The regression itself: this state used to render byte-identically to `none`.
  assert.notEqual(html, render({ run: PAIRED_RUN, phase: { kind: "none" } }),
    "walled must not render as silence (the exact byte-identical-render defect W2 measured)");

  // A wall with no sentence says so rather than printing an empty remedy.
  const bare = render({ run: PAIRED_RUN, phase: correctionPhase(WALLED_NO_ADVICE, false, null) });
  assert.match(bare, /<code>fa_reversal_blocked<\/code>/);
  assert.match(bare, /no remedy sentence of its own/);
});

test("[round-11 W2 F5] the static 'rides reverse_adjustment_pair' claim does not print in any state where that verb refuses", () => {
  const walled = render({ run: PAIRED_RUN, phase: correctionPhase(WALLED_ADVANCE, false, null) });
  assert.ok(!walled.includes("reverse_adjustment_pair"),
    "a refused run must not be told its correction rides a verb measured to refuse it");
  const parked = render({ run: PAIRED_RUN, phase: { kind: "pending", pairId: "p1" } });
  assert.ok(!parked.includes("reverse_adjustment_pair"), "pair_already_active refuses it too");
  const done = render({ run: PAIRED_RUN, phase: { kind: "completed", pairId: null } });
  assert.ok(!done.includes("reverse_adjustment_pair"), "entry_already_reversed refuses it too");
  // …and it still prints where the card genuinely offers that door, so the fix is not
  // "delete the sentence".
  assert.match(render({ run: PAIRED_RUN, phase: { kind: "offer" } }), /reverse_adjustment_pair/);
  assert.match(render({ run: PAIRED_RUN, phase: { kind: "reason_form" } }), /reverse_adjustment_pair/);
});

test("[round-11 W2 F5, x42.r10o2.f4a NOT BROKEN] a COMPLETED pair still renders as completed, never as walled — even though its wall now carries advice too", () => {
  // The completed-via-wall branch is checked BEFORE the walled branch, so the arrival of
  // `correction_wall_advice` on `entry_already_reversed` cannot re-route a finished
  // correction into the refusal render.
  assert.deepEqual(correctionPhase(COMPLETED_VIA_WALL, false, null), { kind: "completed", pairId: null });
  const html = render({ run: PAIRED_RUN, phase: correctionPhase(COMPLETED_VIA_WALL, false, null) });
  assert.match(html, /Correction completed/);
  assert.ok(!html.includes("cannot be corrected right now"), "a completed correction is not a closed door");
});
