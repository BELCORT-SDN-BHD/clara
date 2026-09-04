// Presentational rendering tests, ported mechanism-for-mechanism from
// lib/parts/catalog.test.tsx's own precedent: renderToStaticMarkup (no jsdom,
// no effects) is the right instrument for what these components render given a
// FIXED prop shape — the async data-fetching behavior itself is proven at the
// lib/close/api.test.ts layer and by lib/parts/hooks.test.ts's own hook
// mechanism tests, which this file does not re-derive. Every component here
// calls useTranslations, so each render is wrapped in a real
// NextIntlClientProvider carrying the app's own messages/en.json — never a
// hand-rolled stub dictionary that could drift from what actually ships.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { GateCheckRow, toAttestItemKey } from "./GateCheckRow";
import {
  CloseDoors,
  canBeginClose,
  deriveCorrectionTarget,
  finalizeNeedsAttestation,
  finalizePreflight,
  isRestartOfAbandonedClose,
  preflightIsClear,
  reopenNeedsAttestation,
} from "./CloseDoors";
import { FiscalYearPicker } from "./FiscalYearPicker";
import { Button } from "@/components/ui/button";
import type { ClosePlan, ClosePlanCheck } from "@/lib/close/types";

function render(el: ReactElement): string {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", messages, children: el }));
}

// T1 (port-wave, 2026-08-29): CloseProposalPanel is no longer the fixed-props
// NotBuiltNote this file's own renderToStaticMarkup instrument was built for
// — it now self-fetches via useHydratedPart (a live `close_proposals` read +
// the `settle_close_proposal` door), so it belongs with the OTHER self-
// fetching close surfaces (ClosePlanPanel's own precedent: close-a11y.test.tsx
// / close-keyboard.test.tsx use `renderComponent` + mocked fetch, never a
// static pass). Its real coverage — the open-proposal render, Adopt/Withdraw,
// a live CLR41 refusal, Cancel — is in close-t1-workbench.test.tsx.

function check(overrides: Partial<ClosePlanCheck>): ClosePlanCheck {
  return {
    check_key: "ar_control_tie",
    drawer: 1,
    title: "AR control tie",
    applies_when: "always",
    result: { state: "not_yet_measured" },
    items: [],
    ...overrides,
  };
}

test("GateCheckRow renders the not-yet-measured state honestly", () => {
  const html = render(createElement(GateCheckRow, { check: check({}), closeRunId: null, busy: false, onAttest: async () => true }));
  assert.match(html, /not yet measured/);
});

test("GateCheckRow renders a pass/fail glyph+label (never hue alone)", () => {
  const passHtml = render(
    createElement(GateCheckRow, {
      check: check({ result: { state: "pass", measured: {}, measured_digest: "d", evaluated_at: "t" } }),
      closeRunId: null, busy: false, onAttest: async () => true,
    }),
  );
  assert.match(passHtml, /✓/);
  // H-56: the badge used to print the RAW `close_gate_results.state` token
  // ("pass"/"unknown") beside translated copy in the same row. It now renders the
  // ClientClose.gates.state label; the glyph above is still the shape cue.
  assert.match(passHtml, /passed<\/span>/);
  assert.doesNotMatch(passHtml, />\s*✓<\/span> pass<\/span>/, "the raw token must not be what renders");

  const failHtml = render(
    createElement(GateCheckRow, {
      check: check({ result: { state: "fail", measured: {}, measured_digest: "d", evaluated_at: "t" } }),
      closeRunId: null, busy: false, onAttest: async () => true,
    }),
  );
  assert.match(failHtml, /✕/);
  assert.match(failHtml, /failed<\/span>/);
});

// 裁-187 (owner, 2026-09-04) — attestation ceremonies are not offered up front.
// The Attest affordance now needs BOTH an in-progress close run AND a standing
// refusal that NAMED an attestation (finalize_close's own CLR41
// `drawer2_unattested` / `close_attestation_stale`, 0128:199-232). Until the DB
// asks, nothing here invites a human into a ceremony.
test("GateCheckRow: 裁-187 — Attest appears only with a close run AND a refusal that named an attestation", () => {
  const drawer2 = check({
    drawer: 2,
    items: [{ item_key: "line_1", attestation: { state: "absent" } }],
  });
  const named = { code: "CLR41", reason: "drawer2_unattested" };

  const offered = render(createElement(GateCheckRow, {
    check: drawer2, closeRunId: "run1", busy: false,
    refusal: named, refusalMessage: "drawer-2 gate x is fail and 1 item(s) carry no live attestation",
    onAttest: async () => true,
  }));
  assert.match(offered, /no attestation/);
  assert.match(offered, /Attest/);

  // A close run, but NO refusal has named an attestation — the ceremony is not offered.
  const notYetAsked = render(createElement(GateCheckRow, {
    check: drawer2, closeRunId: "run1", busy: false, onAttest: async () => true,
  }));
  assert.match(notYetAsked, /no attestation/);
  assert.doesNotMatch(notYetAsked, /Attest this gate exception/);

  // A refusal that names something ELSE must not reveal it either — the gate is the
  // reason token, not merely "something failed".
  const otherRefusal = render(createElement(GateCheckRow, {
    check: drawer2, closeRunId: "run1", busy: false,
    refusal: { code: "CLR41", reason: "drawer1_state_unknown" }, refusalMessage: "drawer-1 identity could not be evaluated",
    onAttest: async () => true,
  }));
  assert.doesNotMatch(otherRefusal, /Attest this gate exception/);

  // No close run at all: still nothing, even with the naming refusal.
  const withoutRun = render(createElement(GateCheckRow, {
    check: drawer2, closeRunId: null, busy: false,
    refusal: named, refusalMessage: "drawer-2 gate x is fail", onAttest: async () => true,
  }));
  assert.match(withoutRun, /no attestation/);
  assert.doesNotMatch(withoutRun, /Attest this gate exception/);
});

// -----------------------------------------------------------------------------
// THE UNREACHABLE-DOOR REGRESSION (a11y lane; WCAG 2.1.1 + 4.1.2, and a
// functional product blocker). CloseDoorDialog/DoorDialog used to hand their
// `disabled` prop to the DialogTrigger, while every condition that prop tested
// was typed into a field INSIDE the dialog that trigger opens. Six doors were
// therefore disabled from first paint and could never become enabled, by
// keyboard or mouse: attest, abandon, reopen, issue-for-approval,
// archive-signed-original, register-recipient.
//
// WHAT THESE TESTS PROVE, AND WHAT THEY DO NOT: they assert on the TRIGGER,
// which is where the defect lived and the only half a static render can see —
// Base UI's Dialog Popup does not mount at all while closed (this file's own
// header, and the reason CloseDoors' M7/F3 predicates are exported as pure
// functions). The confirm button's own `busy || confirmDisabled` gate and the
// single-fire guard behind it are NOT covered here; the guard itself is proven
// in lib/parts/single-fire-guard.test.ts.
//
// Reads the ATTRIBUTE, never the word. A naive `.includes("disabled")` over the
// open tag passes on EVERY button in this app — the shadcn Button's own class
// string carries `disabled:pointer-events-none disabled:opacity-50`, and
// @base-ui/react adds `data-disabled` besides. `\sdisabled=` matches neither
// (`disabled:` has no `=`; `data-disabled=` has no space before `disabled`).
// The positive control below is what proves this can still say NO.
function triggerIsEnabled(html: string, label: string): boolean {
  const idx = html.indexOf(`>${label}<`);
  if (idx < 0) return false;
  const openTag = html.lastIndexOf("<button", idx);
  if (openTag < 0) return false;
  return !/\sdisabled=/.test(html.slice(openTag, idx));
}

test("the trigger-enabled probe can still say NO (positive control for the two BLOCKER tests below)", () => {
  const enabled = render(createElement(Button, { children: "Probe" }));
  const disabled = render(createElement(Button, { disabled: true, children: "Probe" }));
  assert.ok(triggerIsEnabled(enabled, "Probe"), "an enabled Button must read as enabled");
  assert.equal(
    triggerIsEnabled(disabled, "Probe"),
    false,
    "a genuinely disabled Button must read as disabled — otherwise the BLOCKER assertions are vacuous",
  );
});

test("BLOCKER: the drawer-2 Attest trigger is ENABLED with an empty reason — the reason field lives inside the dialog it opens", () => {
  const drawer2 = check({
    drawer: 2,
    items: [{ item_key: "__gate__", attestation: { state: "absent" } }],
  });
  // 裁-187: the ceremony is REVEALED by a refusal that named it. Once revealed, the
  // unreachable-door law below still holds — the trigger must be operable before a
  // reason is typed, because the reason field lives inside the dialog it opens.
  const html = render(createElement(GateCheckRow, {
    check: drawer2, closeRunId: "run1", busy: false,
    refusal: { code: "CLR41", reason: "drawer2_unattested" },
    refusalMessage: "drawer-2 gate x is fail and 1 item(s) carry no live attestation",
    onAttest: async () => true,
  }));
  assert.ok(
    triggerIsEnabled(html, "Attest"),
    "the Attest trigger must be operable before a reason is typed — it is the ONLY way to reach the reason field",
  );
});

test("BLOCKER: the Abandon and Reopen triggers are ENABLED before their in-dialog fields are filled", () => {
  const inProgress = render(
    createElement(CloseDoors, {
      plan: plan({ close_run: { state: "present", close_run_id: "r1", run_state: "in_progress", started_by: "u1", started_at: "t", ended_by: null, ended_at: null, end_reason: null } }),
      busy: false, refusal: null, refusalMessage: null,
      onBegin: async () => true, onFinalize: async () => true, onAbandon: async () => true, onReopen: async () => true,
    }),
  );
  assert.ok(triggerIsEnabled(inProgress, "Abandon close"), "Abandon's reason textarea is inside its own dialog");

  const closed = render(
    createElement(CloseDoors, {
      plan: plan({ fiscal_year: { id: "fy1", client_id: "c1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status: "closed", fy_end_source: "asserted" } }),
      busy: false, refusal: null, refusalMessage: null,
      onBegin: async () => true, onFinalize: async () => true, onAbandon: async () => true, onReopen: async () => true,
    }),
  );
  assert.ok(triggerIsEnabled(closed, "Reopen year"), "Reopen's reason + correction-target fields are inside its own dialog");
});

// F1 (independent review, HIGH): get_close_plan's '__gate__' sentinel item_key
// must never reach attest_close_exception's p_item_key, and must never print
// as a raw token to the user.
test("F1: toAttestItemKey maps the '__gate__' sentinel to null; a real item_key passes through unchanged", () => {
  assert.equal(toAttestItemKey("__gate__"), null, "the sentinel must map to null — attest_close_exception's own whole-gate path");
  assert.equal(toAttestItemKey("entry_id_123"), "entry_id_123", "a REAL item_key must pass through untouched");
});

test("F1: GateCheckRow renders the honest 'whole gate' label, never the raw '__gate__' token", () => {
  const wholeGate = check({
    drawer: 2,
    items: [{ item_key: "__gate__", attestation: { state: "absent" } }],
  });
  const html = render(createElement(GateCheckRow, { check: wholeGate, closeRunId: "run1", busy: false, onAttest: async () => true }));
  assert.doesNotMatch(html, /__gate__/, "the raw sentinel token must never be printed to the user");
  assert.match(html, /this gate as a whole/);
});

function plan(overrides: Partial<ClosePlan>): ClosePlan {
  return {
    fiscal_year: { id: "fy1", client_id: "c1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status: "open", fy_end_source: "asserted" },
    close_run: { state: "absent" },
    checks: [],
    receipt: { state: "absent" },
    ...overrides,
  };
}

test("CloseDoors: an open year with no run offers ONLY Begin close", () => {
  const html = render(
    createElement(CloseDoors, {
      plan: plan({}), busy: false, refusal: null, refusalMessage: null,
      onBegin: async () => true, onFinalize: async () => true, onAbandon: async () => true, onReopen: async () => true,
    }),
  );
  assert.match(html, /Begin close/);
  assert.doesNotMatch(html, /Finalize close/);
  assert.doesNotMatch(html, /Reopen year/);
});

test("CloseDoors: an in-progress run offers Finalize + Abandon, never Begin", () => {
  const html = render(
    createElement(CloseDoors, {
      plan: plan({ close_run: { state: "present", close_run_id: "run1", run_state: "in_progress", started_by: "u1", started_at: "t", ended_by: null, ended_at: null, end_reason: null } }),
      busy: false, refusal: null, refusalMessage: null,
      onBegin: async () => true, onFinalize: async () => true, onAbandon: async () => true, onReopen: async () => true,
    }),
  );
  assert.match(html, /Finalize close/);
  assert.match(html, /Abandon close/);
  assert.doesNotMatch(html, />Begin close</);
});

const closedPlan = plan({
  fiscal_year: { id: "fy1", client_id: "c1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status: "closed", fy_end_source: "asserted" },
});

test("CloseDoors: a closed year offers ONLY Reopen year", () => {
  const html = render(
    createElement(CloseDoors, {
      plan: closedPlan, busy: false, refusal: null, refusalMessage: null,
      onBegin: async () => true, onFinalize: async () => true, onAbandon: async () => true, onReopen: async () => true,
    }),
  );
  assert.match(html, /Reopen year/);
  assert.doesNotMatch(html, />Begin close</);
  assert.doesNotMatch(html, /Finalize close/);
});

// F3/M7 (independent review): Base UI's Dialog Popup does not mount into the
// tree while `open=false` — a renderToStaticMarkup pass over a closed
// CloseDoorDialog never sees ITS OWN children, so the dialog CONTENT's gating
// logic (F3's three correction-target variants, M7's refusal-gated
// attestation fields) is tested directly against the exported pure functions
// CloseDoors.tsx factors it into, not through the dialog's rendered markup.

test("F3: deriveCorrectionTarget sends the shape matching the SELECTED variant, never forcing check_key", () => {
  assert.deepEqual(
    deriveCorrectionTarget("check_key", { checkKey: "ar_control_tie", entryIds: "", documentId: "" }),
    { check_key: "ar_control_tie" },
  );
  assert.deepEqual(
    deriveCorrectionTarget("entry_ids", { checkKey: "", entryIds: "e1, e2 ,e3", documentId: "" }),
    { entry_ids: ["e1", "e2", "e3"] },
    "comma-separated entry ids parse into an array — the true correction target, not a gate key",
  );
  assert.deepEqual(
    deriveCorrectionTarget("document_id", { checkKey: "", entryIds: "", documentId: "doc1" }),
    { document_id: "doc1" },
  );
});

test("F3: deriveCorrectionTarget returns null when the selected variant's own field is empty (never a half-built target)", () => {
  assert.equal(deriveCorrectionTarget("check_key", { checkKey: "  ", entryIds: "e1", documentId: "d1" }), null);
  assert.equal(deriveCorrectionTarget("entry_ids", { checkKey: "c1", entryIds: " , , ", documentId: "d1" }), null);
  assert.equal(deriveCorrectionTarget("document_id", { checkKey: "c1", entryIds: "e1", documentId: "" }), null);
});

// M7 (independent review ruling, carried from the original build): the
// attestation field on Finalize/Reopen renders ONLY once a refusal has
// actually named it — never unconditionally pre-offered.
test("M7: finalizeNeedsAttestation is true ONLY for CLR41 close_self_attestation_required", () => {
  assert.equal(finalizeNeedsAttestation(null), false);
  assert.equal(finalizeNeedsAttestation({ code: "CLR41", reason: "close_self_attestation_required" }), true);
  assert.equal(finalizeNeedsAttestation({ code: "CLR41", reason: "close_not_in_progress" }), false, "a DIFFERENT CLR41 reason must not show the field");
  assert.equal(finalizeNeedsAttestation({ code: "CLR04", reason: "close_self_attestation_required" }), false, "the code must match too — not the reason alone");
});

test("M7: reopenNeedsAttestation is true ONLY for CLR05 attestation_required/self_attestation, not the OTHER two CLR05 arms", () => {
  assert.equal(reopenNeedsAttestation(null), false);
  assert.equal(reopenNeedsAttestation({ code: "CLR05", reason: "attestation_required" }), true);
  assert.equal(reopenNeedsAttestation({ code: "CLR05", reason: "self_attestation" }), true);
  assert.equal(reopenNeedsAttestation({ code: "CLR05", reason: "distinct_checker" }), false, "a DIFFERENT human must act — no text field fixes it");
  assert.equal(reopenNeedsAttestation({ code: "CLR05", reason: "no_eligible_human" }), false);
});

// CloseDoors itself still renders cleanly with the new `refusal` prop and the
// three-variant reopen dialog wired in (the dialog's own CONTENT is proven by
// the F3/M7 unit tests above — the Popup never mounts while closed, so a
// static render only ever sees the closed trigger button here).
test("CloseDoors: a closed year's Reopen trigger renders without throwing, refusal prop wired through", () => {
  const html = render(
    createElement(CloseDoors, {
      plan: closedPlan, busy: false, refusal: { code: "CLR05", reason: "self_attestation" }, refusalMessage: "solo reopen requires an attestation",
      onBegin: async () => true, onFinalize: async () => true, onAbandon: async () => true, onReopen: async () => true,
    }),
  );
  assert.match(html, /Reopen year/);
});

// M2 (independent review): 0056:2678-2682's honest tell — a year that reads
// 'open' but was once closed and reopened must be visibly distinct.
test("M2: FiscalYearPicker marks a year with has_active_reopen_receipt", () => {
  const years = [
    { fiscal_year_id: "fy1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status: "open" as const, fy_end_source: "asserted" as const, has_active_reopen_receipt: true },
    { fiscal_year_id: "fy2", label: "FY2024", ordinal: 0, starts_on: "2024-01-01", ends_on: "2024-12-31", status: "closed" as const, fy_end_source: "asserted" as const, has_active_reopen_receipt: false },
  ];
  const html = render(createElement(FiscalYearPicker, { years, err: null, selected: null, onSelect: () => {} }));
  assert.match(html, /previously reopened/);
  // Exactly one badge — FY2024 (no active reopen receipt) must not get it.
  assert.equal((html.match(/previously reopened/g) ?? []).length, 1);
});

// ---------------------------------------------------------------------------
// H-11 / CB-AE2E-016 — the stranded year, and the honest name for restarting it.
// ---------------------------------------------------------------------------
//
// `canBegin` used to test `close_run.state === "absent"`. get_close_plan selects the
// LATEST run for the year in ANY state (0064:182-184), and _abandon_close_core sets
// the run 'abandoned' AND the fiscal year back to 'open' (0120:1186-1189) — so after
// an Abandon the plan reads state:'present', run_state:'abandoned', fy:'open', and
// every one of the three branches rendered null: no door at all, on a year the DB
// would happily begin again (_begin_close_core's ONLY precondition is
// `v_fy.status not in ('open','reopened')`, 0120:1111-1115).

function abandonedRun() {
  return { state: "present" as const, close_run_id: "r1", run_state: "abandoned" as const, started_by: "u1", started_at: "t", ended_by: "u1", ended_at: "t2", end_reason: "the client resent the statements" };
}
function finalizedRun() {
  return { state: "present" as const, close_run_id: "r1", run_state: "finalized" as const, started_by: "u1", started_at: "t", ended_by: "u1", ended_at: "t2", end_reason: null };
}
function fy(status: "open" | "closing" | "closed" | "reopened") {
  return { id: "fy1", client_id: "c1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status, fy_end_source: "asserted" as const };
}
function doors(p: ClosePlan) {
  return render(
    createElement(CloseDoors, {
      plan: p, busy: false, refusal: null, refusalMessage: null,
      onBegin: async () => true, onFinalize: async () => true, onAbandon: async () => true, onReopen: async () => true,
    }),
  );
}

test("H-11: an ABANDONED run on an open year offers a door again — labelled Restart close", () => {
  const p = plan({ close_run: abandonedRun(), fiscal_year: fy("open") });
  assert.equal(canBeginClose(p), true, "the DB would accept a begin here");
  assert.equal(isRestartOfAbandonedClose(p), true);
  const html = doors(p);
  assert.match(html, /Restart close/, "the human must not be told a stranded year is virgin");
  assert.doesNotMatch(html, /Finalize close/);
});

test("H-11: a FINALIZED run on a REOPENED year offers Begin close (a new close of a corrected year, not a restart)", () => {
  const p = plan({ close_run: finalizedRun(), fiscal_year: fy("reopened") });
  assert.equal(canBeginClose(p), true);
  assert.equal(isRestartOfAbandonedClose(p), false, "only the abandoned case is a restart");
  const html = doors(p);
  assert.match(html, /Begin close/);
  assert.doesNotMatch(html, /Restart close/);
});

// MUST-NOT-RED CONTROL: the fiscal-year conjunct is load-bearing. A 'closing' year
// has a run in progress; the DB refuses a begin, and so does this predicate.
test("H-11 control: an abandoned run on a CLOSING year offers no Begin — the fy conjunct mirrors _begin_close_core", () => {
  const p = plan({ close_run: abandonedRun(), fiscal_year: fy("closing") });
  assert.equal(canBeginClose(p), false);
  const html = doors(p);
  assert.doesNotMatch(html, /Begin close/);
  assert.doesNotMatch(html, /Restart close/);
});

// The dialog's DESCRIPTION cannot be read from a static render — base-ui's Popup
// does not mount into the tree while `open=false` (this file's own header records
// the same constraint for CloseDoors' inner gating), so the copy is asserted where
// it actually lives: the shipped message catalog. That is the same catalog the
// component resolves at runtime, not a stub.
test("CB-AE2E-016: the Begin dialog's description states the period FREEZE, and names the DB's own refusal", () => {
  const begin = (messages as unknown as { ClientClose: { doors: { begin: Record<string, string | undefined> } } }).ClientClose.doors.begin;
  const say = (k: string): string => {
    const v = begin[k];
    assert.ok(typeof v === "string", `ClientClose.doors.begin.${k} must exist in the shipped catalog`);
    return v;
  };
  assert.match(say("description"), /FREEZES/, "the write freeze is the consequence a human most needs to know before beginning");
  assert.match(say("description"), /write_into_closed_period/, "and it names the DB's own refusal, so the two sentences agree");
  assert.match(say("description"), /Abandon puts the year back to open/, "…and the way out");
  assert.match(say("restartDescription"), /abandoned/, "the restart copy says the year is not virgin");
  assert.match(say("restartDescription"), /freezes the year again/i);
  assert.match(say("restartDescription"), /write_into_closed_period/, "the restart copy names the same DB refusal the first-begin copy does — one wall, one word for it");
  assert.equal(say("restartTrigger"), "Restart close");
});

// ---------------------------------------------------------------------------
// H-54 — the pre-flight reading above Finalize.
// ---------------------------------------------------------------------------
//
// finalize_close DOES refuse an unknown drawer-1 gate (0128:194-198
// drawer1_state_unknown) and an unattested drawer-2 one (0128:199-232
// drawer2_unattested). This is not a wall hole; it is a VISIBILITY fault —
// ClosePlanPanel renders the doors ABOVE the gate list, so Finalize was offered
// before a single gate state was on screen. The banner is a count of rows the DB
// already returned; it never disables Finalize (裁-187).

const inProgress = { state: "present" as const, close_run_id: "r1", run_state: "in_progress" as const, started_by: "u1", started_at: "t", ended_by: null, ended_at: null, end_reason: null };

test("H-54: finalizePreflight counts exactly what finalize_close's own two arms would refuse", () => {
  const pre = finalizePreflight([
    check({ check_key: "a", drawer: 1, title: "Drawer-one unknown", result: { state: "unknown", measured: {}, measured_digest: "d", evaluated_at: "t" } }),
    check({ check_key: "b", drawer: 1, title: "Drawer-one clean", result: { state: "pass", measured: {}, measured_digest: "d", evaluated_at: "t" } }),
    check({ check_key: "c", drawer: 2, title: "Drawer-two unattested", result: { state: "fail", measured: {}, measured_digest: "d", evaluated_at: "t" }, items: [{ item_key: "i1", attestation: { state: "absent" } }] }),
    check({ check_key: "d", drawer: 2, title: "Drawer-two attested", result: { state: "fail", measured: {}, measured_digest: "d", evaluated_at: "t" }, items: [{ item_key: "i1", attestation: { state: "live", attested_by: "u1", reason: "known", attested_at: "t" } }] }),
    check({ check_key: "e", drawer: 1, title: "Never measured", result: { state: "not_yet_measured" } }),
  ]);
  assert.deepEqual(pre.drawer1Unknown, ["Drawer-one unknown"]);
  assert.deepEqual(pre.drawer2Unattested, ["Drawer-two unattested"], "a LIVE attestation retires the item; a stale or absent one does not");
  assert.deepEqual(pre.notYetMeasured, ["Never measured"]);
  assert.equal(preflightIsClear(pre), false);
});

test("H-54: a plan with unknown gates renders the pre-flight warning AND still renders Finalize", () => {
  const html = doors(plan({
    close_run: inProgress,
    fiscal_year: fy("closing"),
    checks: [check({ check_key: "a", drawer: 1, title: "Drawer-one unknown", result: { state: "unknown", measured: {}, measured_digest: "d", evaluated_at: "t" } })],
  }));
  assert.match(html, /drawer1_state_unknown/, "the banner names the DB's own refusal reason");
  assert.match(html, /Finalize close/, "gating shapes, never hides — the DB is the boundary, not this reading");
});

test("H-54: a clean plan says so, without asserting the finalize will succeed", () => {
  const html = doors(plan({
    close_run: inProgress,
    fiscal_year: fy("closing"),
    checks: [check({ check_key: "a", drawer: 1, title: "Clean", result: { state: "pass", measured: {}, measured_digest: "d", evaluated_at: "t" } })],
  }));
  assert.match(html, /Nothing is standing in finalize/, "renderToStaticMarkup escapes the apostrophe — match the unescaped half");
  assert.match(html, /re-checks all of it in-transaction/, "the sentence must not promise an outcome the DB has not measured yet");
});

// ---------------------------------------------------------------------------
// H-56 — the gate-state label map, and its RAW-VALUE fallback.
// ---------------------------------------------------------------------------

test("H-56: every GateState and attestation state resolves to a translated label", () => {
  for (const [state, label] of [["pass", "passed"], ["fail", "failed"], ["unknown", "not evaluated"], ["error", "evaluation error"], ["advisory", "advisory"]] as const) {
    const html = render(createElement(GateCheckRow, {
      check: check({ result: { state, measured: {}, measured_digest: "d", evaluated_at: "t" } }),
      closeRunId: null, busy: false, onAttest: async () => true,
    }));
    assert.match(html, new RegExp(label), `GateState ${state} must render its own label`);
  }
  const attested = render(createElement(GateCheckRow, {
    check: check({ drawer: 2, items: [{ item_key: "i1", attestation: { state: "live", attested_by: "u1", reason: "known and accepted", attested_at: "t" } }] }),
    closeRunId: "run1", busy: false, onAttest: async () => true,
  }));
  assert.match(attested, /attested/, "the attestation state is translated too — it used to print the raw DB token");
  assert.match(attested, /known and accepted/, "the human's own reason still renders verbatim beside it");
});

test("H-56: an UNRECOGNISED state falls back to the raw token — never a missing-message throw out of the close plan", () => {
  const html = render(createElement(GateCheckRow, {
    // A state outside the closed set: the DB's CHECK could widen before this file does.
    check: check({ result: { state: "quarantined" as never, measured: {}, measured_digest: "d", evaluated_at: "t" } }),
    closeRunId: null, busy: false, onAttest: async () => true,
  }));
  assert.match(html, /quarantined/, "the raw value renders rather than the render throwing");
});
