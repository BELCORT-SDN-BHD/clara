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
import { GateCheckRow } from "./GateCheckRow";
import { CloseDoors } from "./CloseDoors";
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
      plan: plan({}), busy: false,
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
      busy: false,
      onBegin: async () => {}, onFinalize: async () => {}, onAbandon: async () => {}, onReopen: async () => {},
    }),
  );
  assert.match(html, /Finalize close/);
  assert.match(html, /Abandon close/);
  assert.doesNotMatch(html, />Begin close</);
});

test("CloseDoors: a closed year offers ONLY Reopen year", () => {
  const html = render(
    createElement(CloseDoors, {
      plan: plan({ fiscal_year: { id: "fy1", client_id: "c1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status: "closed", fy_end_source: "asserted" } }),
      busy: false,
      onBegin: async () => {}, onFinalize: async () => {}, onAbandon: async () => {}, onReopen: async () => {},
    }),
  );
  assert.match(html, /Reopen year/);
  assert.doesNotMatch(html, />Begin close</);
  assert.doesNotMatch(html, /Finalize close/);
});
