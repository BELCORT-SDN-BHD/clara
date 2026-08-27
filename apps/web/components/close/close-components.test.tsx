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
import { CloseProposalPanel } from "./CloseProposalPanel";
import { GateCheckRow, toAttestItemKey } from "./GateCheckRow";
import { CloseDoors, deriveCorrectionTarget, finalizeNeedsAttestation, reopenNeedsAttestation } from "./CloseDoors";
import { FiscalYearPicker } from "./FiscalYearPicker";
import { Button } from "@/components/ui/button";
import type { ClosePlan, ClosePlanCheck } from "@/lib/close/types";

function render(el: ReactElement): string {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", messages, children: el }));
}

test("CloseProposalPanel honestly states 'Clara proposes close' is not built, naming the missing verb/carrier", () => {
  const html = render(createElement(CloseProposalPanel));
  assert.match(html, /Clara proposes close/);
  assert.match(html, /close_proposals/);
  assert.match(html, /wake_propose_close/);
});

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
  const html = render(createElement(GateCheckRow, { check: check({}), closeRunId: null, busy: false, onAttest: async () => {} }));
  assert.match(html, /not yet measured/);
});

test("GateCheckRow renders a pass/fail glyph+label (never hue alone)", () => {
  const passHtml = render(
    createElement(GateCheckRow, {
      check: check({ result: { state: "pass", measured: {}, measured_digest: "d", evaluated_at: "t" } }),
      closeRunId: null, busy: false, onAttest: async () => {},
    }),
  );
  assert.match(passHtml, /✓/);
  assert.match(passHtml, /\bpass<\/span>/);

  const failHtml = render(
    createElement(GateCheckRow, {
      check: check({ result: { state: "fail", measured: {}, measured_digest: "d", evaluated_at: "t" } }),
      closeRunId: null, busy: false, onAttest: async () => {},
    }),
  );
  assert.match(failHtml, /✕/);
  assert.match(failHtml, /\bfail<\/span>/);
});

test("GateCheckRow: an unattested drawer-2 item offers Attest only when a close run exists", () => {
  const drawer2 = check({
    drawer: 2,
    items: [{ item_key: "line_1", attestation: { state: "absent" } }],
  });
  const withRun = render(createElement(GateCheckRow, { check: drawer2, closeRunId: "run1", busy: false, onAttest: async () => {} }));
  assert.match(withRun, /no attestation/);
  assert.match(withRun, /Attest/);

  const withoutRun = render(createElement(GateCheckRow, { check: drawer2, closeRunId: null, busy: false, onAttest: async () => {} }));
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
  const html = render(createElement(GateCheckRow, { check: drawer2, closeRunId: "run1", busy: false, onAttest: async () => {} }));
  assert.ok(
    triggerIsEnabled(html, "Attest"),
    "the Attest trigger must be operable before a reason is typed — it is the ONLY way to reach the reason field",
  );
});

test("BLOCKER: the Abandon and Reopen triggers are ENABLED before their in-dialog fields are filled", () => {
  const inProgress = render(
    createElement(CloseDoors, {
      plan: plan({ close_run: { state: "present", close_run_id: "r1", run_state: "in_progress", started_by: "u1", started_at: "t", ended_by: null, ended_at: null, end_reason: null } }),
      busy: false, refusal: null,
      onBegin: async () => {}, onFinalize: async () => {}, onAbandon: async () => {}, onReopen: async () => {},
    }),
  );
  assert.ok(triggerIsEnabled(inProgress, "Abandon close"), "Abandon's reason textarea is inside its own dialog");

  const closed = render(
    createElement(CloseDoors, {
      plan: plan({ fiscal_year: { id: "fy1", client_id: "c1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status: "closed", fy_end_source: "asserted" } }),
      busy: false, refusal: null,
      onBegin: async () => {}, onFinalize: async () => {}, onAbandon: async () => {}, onReopen: async () => {},
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
  const html = render(createElement(GateCheckRow, { check: wholeGate, closeRunId: "run1", busy: false, onAttest: async () => {} }));
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
      plan: plan({}), busy: false, refusal: null,
      onBegin: async () => {}, onFinalize: async () => {}, onAbandon: async () => {}, onReopen: async () => {},
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
      busy: false, refusal: null,
      onBegin: async () => {}, onFinalize: async () => {}, onAbandon: async () => {}, onReopen: async () => {},
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
      plan: closedPlan, busy: false, refusal: null,
      onBegin: async () => {}, onFinalize: async () => {}, onAbandon: async () => {}, onReopen: async () => {},
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
      plan: closedPlan, busy: false, refusal: { code: "CLR05", reason: "self_attestation" },
      onBegin: async () => {}, onFinalize: async () => {}, onAbandon: async () => {}, onReopen: async () => {},
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
