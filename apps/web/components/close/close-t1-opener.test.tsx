// T1 (port-wave, 2026-08-29) — interaction tests for the fiscal-year opener
// (FiscalYearOpener: set_client_fy_end / propose_fiscal_year /
// open_fiscal_year) plus the whole-ClosePage heading-order probe and the
// client-scoped keyboard-walk gate. Split out of the original
// close-t1-workbench.test.tsx (1043 lines; the local max-file-size hook
// flags >500) at rev-t1's round-2 re-verify — three files by surface:
// this one (opener), close-t1-hold-receipts.test.tsx (close-prep hold +
// agent-act receipts), close-t1-proposal-readiness.test.tsx (close
// readiness + close proposal + future attestation). Mounts the REAL
// surfaces (renderComponent, fetch mocked only) — never renderToStaticMarkup
// for anything that self-fetches via useHydratedPart, per this file's own
// house precedent (close-a11y.test.tsx's header). Every dialog interaction
// rides `clickButton`/`setFieldValue` from test/hookHarness.ts
// (apps/web/AGENTS.md's two dialog-testing laws) — `h.fireEvent` never
// touches anything inside an open dialog's portal in this file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { FiscalYearOpener, openFiscalYearNeedsLengthReason } from "./FiscalYearOpener";
import { ClosePrepHoldPanel } from "./ClosePrepHoldPanel";
import { FutureAttestationPanel } from "./FutureAttestationPanel";
import { ClosePage } from "./ClosePage";

enableDomInspection();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function withProvider(el: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Close"), el),
  });
}

function bodyOf() {
  return (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
}

function findByAttr(root: unknown, attr: string, value: string): unknown {
  const getAttr = (root as { getAttribute?: (n: string) => string | null }).getAttribute;
  if (getAttr && getAttr.call(root, attr) === value) return root;
  for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
    const found = findByAttr(c, attr, value);
    if (found) return found;
  }
  return null;
}
function findAllButtonsByText(root: unknown, label: string, out: unknown[] = []): unknown[] {
  if ((root as { tagName?: string }).tagName === "BUTTON" && textOf(root as never) === label) out.push(root);
  for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) findAllButtonsByText(c, label, out);
  return out;
}

// M7 house pattern (CloseDoors.tsx's own header): a refusal-gated field
// renders ONLY once the refusal has actually named it.
test("openFiscalYearNeedsLengthReason is true ONLY for CLR10 fy_length_reason_required", () => {
  assert.equal(openFiscalYearNeedsLengthReason(null), false);
  assert.equal(openFiscalYearNeedsLengthReason({ code: "CLR10", reason: "fy_length_reason_required" }), true);
  assert.equal(openFiscalYearNeedsLengthReason({ code: "CLR10", reason: "fy_range_invalid" }), false, "a DIFFERENT CLR10 reason must not show the field");
  assert.equal(openFiscalYearNeedsLengthReason({ code: "CLR11", reason: "fy_length_reason_required" }), false, "the code must match too");
});

test("FiscalYearOpener: fy-end unset renders the honest badge, both triggers are real enabled buttons, and the collapsed surface has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "ROME PROPERTIES", fy_end_month: null, fy_end_day: null }]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(FiscalYearOpener, { clientId: "c1", session: sessionTokenAccessor, onOpened: async () => {} })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /FY end not set/);

        const setTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Set fiscal-year end"));
        const openTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Open fiscal year"));
        assert.ok(setTrigger && (setTrigger as unknown as { disabled: boolean }).disabled === false, "Set fiscal-year end must be a real, enabled button");
        assert.ok(openTrigger && (openTrigger as unknown as { disabled: boolean }).disabled === false, "Open fiscal year must be a real, enabled button — always available, never hidden");
        assert.ok(focusableElements(h.container as never).includes(setTrigger as never));
        assert.ok(focusableElements(h.container as never).includes(openTrigger as never));

        assert.deepEqual(checkAccessibility(body as never), [], "collapsed surface must have zero violations");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

test("FiscalYearOpener: a REAL CLR38 refusal on Set-fiscal-year-end renders verbatim in the persistent banner OUTSIDE the dialog, after the dialog closes", async () => {
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "ROME PROPERTIES", fy_end_month: null, fy_end_day: null }]);
      if (url.includes("/rpc/set_client_fy_end")) {
        return jsonResponse(
          {
            code: "CLR38",
            message: "this client has a live ANNUAL-cadence adjustment template (Depreciation); retire it before moving the financial-year end",
            details: '{"reason":"fy_end_locked_by_annual_cadence","axis":"adjustment_template"}',
          },
          400,
        );
      }
      throw new Error(`unexpected fetch: ${url} ${String(init?.body)}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(FiscalYearOpener, { clientId: "c1", session: sessionTokenAccessor, onOpened: async () => {} })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Set fiscal-year end"));
        assert.ok(trigger);
        await clickButton(trigger as never);
        for (let i = 0; i < 4; i++) await h.settle();

        function findById(root: unknown, id: string): unknown {
          const getAttr = (root as { getAttribute?: (n: string) => string | null }).getAttribute;
          if (getAttr && getAttr.call(root, "id") === id) return root;
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
            const found = findById(c, id);
            if (found) return found;
          }
          return null;
        }
        const monthField = findById(body, "fy-end-month");
        const dayField = findById(body, "fy-end-day");
        assert.ok(monthField && dayField, "the month/day fields must be reachable inside the open dialog");
        setFieldValue(monthField as never, "6");
        setFieldValue(dayField as never, "30");
        for (let i = 0; i < 2; i++) await h.settle();

        const confirmButtons = (n: unknown): n is { tagName?: string } => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n as never) === "Set fiscal-year end";
        // Two buttons share this text (trigger + confirm) — the confirm is the
        // SECOND one committed (base-ui's dialog content mounts after the
        // trigger in document order).
        function findAll(root: unknown, predicate: (n: unknown) => boolean, out: unknown[] = []): unknown[] {
          if (predicate(root)) out.push(root);
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) findAll(c, predicate, out);
          return out;
        }
        const matches = findAll(body, confirmButtons);
        assert.equal(matches.length, 2, "trigger + dialog confirm must both render as 'Set fiscal-year end' buttons");
        const confirmButton = matches[1];
        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        assert.equal(
          findAll(body, confirmButtons).length,
          2,
          "DISCRIMINATING POST-CONDITION (CB-AE2E-004, 2026-09-04): a REFUSED confirm keeps the dialog open — trigger AND confirm are both still in document.body. This assertion used to demand the opposite (length 1, 'Confirm must be GONE'), which is the class defect: the month/day the human typed went with it.",
        );
        assert.equal(
          (findById(body, "fy-end-month") as unknown as { value: string }).value,
          "6",
          "and what they typed is still in the field",
        );

        const bodyText = textOf(body as never);
        assert.match(bodyText, /CLR38/, "the refusal code must render verbatim");
        assert.match(bodyText, /retire it before moving the financial-year end/, "the refusal message must render verbatim, never re-worded");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

test("FiscalYearOpener: Cancel (via clickButton on DialogClose) removes the dialog's own Confirm from document.body — no write attempted", async () => {
  let sawWrite = false;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "ROME PROPERTIES", fy_end_month: null, fy_end_day: null }]);
      if (url.includes("/rpc/")) { sawWrite = true; return jsonResponse({}); }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(FiscalYearOpener, { clientId: "c1", session: sessionTokenAccessor, onOpened: async () => {} })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Set fiscal-year end"));
        await clickButton(trigger as never);
        for (let i = 0; i < 4; i++) await h.settle();

        function findIn(root: unknown, predicate: (n: unknown) => boolean): unknown {
          if (predicate(root)) return root;
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
            const found = findIn(c, predicate);
            if (found) return found;
          }
          return null;
        }
        const cancelButton = findIn(body, (n) => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n as never) === "Cancel");
        assert.ok(cancelButton, "the Cancel control must render as a real button");
        await clickButton(cancelButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const confirmStillThere = findIn(
          body,
          (n) => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n as never) === "Set fiscal-year end" && n !== trigger,
        );
        assert.equal(confirmStillThere, null, "DISCRIMINATING POST-CONDITION: the dialog's own Confirm button must be GONE from document.body after Cancel");
        assert.equal(sawWrite, false, "Cancel must never attempt the governed write");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

// FIX-2 (rev-t1, PROBE R3). WCAG heading-order on the DEFAULT (zero-FY)
// state of the REAL, ASSEMBLED ClosePage — this train's own case for a
// brand-new client. ClosePage.tsx's closePrep/futureAttestation section
// headings and AgentActReceiptsPanel's own heading used `level={3}` directly
// under PageHeader's h1; the only h2 anywhere on the page (ClosePlanPanel's
// own fiscal-year label) renders ONLY once a fiscal year is selected — a
// zero-FY client (unavoidably true for every client on its FIRST visit,
// port-wave-plan §9.3) jumped h1 straight to h3 three times. Fixed to
// level={2} (section-header.tsx's own doc: "2 = a major section of a page").
// MUTANT NOTE (corrected at rev-t1's round-2 re-verify): a heading-order
// scan flags a SKIPPED rung, not an absolute level per heading, so this is
// POSITION-dependent, not count-dependent. Reverting the FIRST heading in
// DOM order (ClosePage.tsx:62, closePrep) ALONE reproduces the h1->h3 skip
// directly and DOES red — measured. Reverting only ONE of the LATTER two
// (futureAttestation or AgentActReceiptsPanel) alone does NOT red: the
// closePrep heading earlier in DOM order is still a valid h2, so the path
// never skips. Reverting ALL THREE also reds (the original bug's own
// shape). All three cases measured directly, not inferred.
test("FIX-2: the ASSEMBLED ClosePage, in its default zero-fiscal-year state, has ZERO heading-order violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_fiscal_years")) return jsonResponse([]);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Sunrise Retail Sdn Bhd", fy_end_month: null, fy_end_day: null }]);
      if (url.includes("/rest/v1/close_prep_holds")) return jsonResponse([]);
      if (url.includes("/rpc/list_agent_act_receipts")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      // No extra <h1> wrapper here (unlike `withProvider`) — ClosePage's OWN
      // PageHeader already renders the real page h1; adding another would
      // manufacture a SECOND, unrelated violation and defeat the probe.
      const h = await renderComponent(
        createElement(NextIntlClientProvider, { locale: "en", messages, children: createElement(ClosePage, { clientId: "c1" }) }),
      );
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /No close-prep hold is visible here/, "the page must have actually rendered past its zero-FY default state");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], `zero-FY ClosePage must have no heading-order violations: ${JSON.stringify(violations)}`);
      } finally {
        await h.unmount();
      }
    },
  );
});

// N4 (rev-t1 nit): a component-level pin for BOTH refusals the rung-5 walk
// actually hit — length-reason (which the UI recovers from by showing a
// field) and the fiscal-year contiguity trigger (which the UI does NOT try
// to recover from with a field, since no field could fix it; the refusal
// still renders verbatim and the human must pick a different starts_on).
// The contiguity refusal's own DETAIL shape (rev-t1's own round-1 walk):
// `{"reason":"fy_not_contiguous","starts_on":"2027-01-01",
// "prior_ends_on":"2026-06-30"}`, built exactly that way by the live
// `clara._tf_fiscal_years_contiguity()` trigger — this mock matches the
// live wire for every field `parseReasonToken` reads.
test("N4: a real CLR10 fy_length_reason_required makes the length-reason field APPEAR; a DIFFERENT CLR10 (the contiguity shape) renders verbatim WITHOUT it", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Sunrise Retail Sdn Bhd", fy_end_month: 6, fy_end_day: 30 }]);
      if (url.includes("/rpc/propose_fiscal_year")) return jsonResponse({ starts_on: "2026-01-01", ends_on: "2026-06-30", fy_end: { month: 6, day: 30, fallback: false } });
      if (url.includes("/rpc/open_fiscal_year")) {
        return jsonResponse({ code: "CLR10", message: "a fiscal year spanning ~6 months needs its length_reason stated", details: '{"reason":"fy_length_reason_required"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(FiscalYearOpener, { clientId: "c1", session: sessionTokenAccessor, onOpened: async () => {} })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Open fiscal year"));
        await clickButton(trigger as never);
        for (let i = 0; i < 4; i++) await h.settle();

        setFieldValue(findByAttr(body, "id", "fy-open-label") as never, "FY2026");
        setFieldValue(findByAttr(body, "id", "fy-open-starts") as never, "2026-01-01");
        for (let i = 0; i < 3; i++) await h.settle(); // the propose_fiscal_year preview fires on starts_on change

        assert.equal(
          findByAttr(body, "id", "fy-open-length-reason"),
          null,
          "the length-reason field must NOT appear before any refusal has named it (M7 pattern)",
        );

        const confirmButton = findAllButtonsByText(body, "Open fiscal year")[1];
        assert.ok(confirmButton, "the dialog's own Confirm must render, distinct from the trigger");
        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /CLR10/, "the refusal code must render verbatim");
        assert.match(bodyText, /needs its length_reason stated/, "the refusal message must render verbatim");

        // CB-AE2E-004 (2026-09-04): the dialog STAYS OPEN on a refusal, so the
        // length-reason field's own appearance is observed IN PLACE — no reopen step.
        // This is strictly better evidence than the old reopen: it proves the field
        // appears beside the very refusal that named it, in the same dialog the human
        // is still looking at. `refusal` is a PROP sourced from the PARENT's own
        // `fyEnd.clr` (the parent never unmounts), so it needs no
        // state-preservation-across-remount guarantee either way.
        const triggerAfterRefusal = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Open fiscal year"));
        assert.ok(triggerAfterRefusal, "the Open-fiscal-year trigger must still render after the refusal");
        assert.ok(
          findByAttr(body, "id", "fy-open-length-reason"),
          "the length-reason field must appear IN the still-open dialog — the refusal named exactly this",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );

  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Sunrise Retail Sdn Bhd", fy_end_month: 6, fy_end_day: 30 }]);
      if (url.includes("/rpc/propose_fiscal_year")) return jsonResponse({ starts_on: "2026-07-01", ends_on: "2026-06-30", fy_end: { month: 6, day: 30, fallback: false } });
      if (url.includes("/rpc/open_fiscal_year")) {
        return jsonResponse(
          {
            code: "CLR10",
            message: "fiscal year starting 2027-01-01 is not contiguous with its predecessor ending 2026-06-30 -- periods admit no gap and no overlap",
            details: '{"reason":"fy_not_contiguous","starts_on":"2027-01-01","prior_ends_on":"2026-06-30"}',
          },
          400,
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(FiscalYearOpener, { clientId: "c1", session: sessionTokenAccessor, onOpened: async () => {} })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Open fiscal year"));
        await clickButton(trigger as never);
        for (let i = 0; i < 4; i++) await h.settle();

        setFieldValue(findByAttr(body, "id", "fy-open-label") as never, "FY2027");
        setFieldValue(findByAttr(body, "id", "fy-open-starts") as never, "2027-01-01");
        for (let i = 0; i < 3; i++) await h.settle();

        const confirmButton = findAllButtonsByText(body, "Open fiscal year")[1];
        assert.ok(confirmButton);
        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /CLR10/, "the contiguity refusal's code must render verbatim");
        assert.match(bodyText, /periods admit no gap and no overlap/, "the contiguity refusal's message must render verbatim");
        assert.equal(
          findByAttr(body, "id", "fy-open-length-reason"),
          null,
          "a DIFFERENT CLR10 (not fy_length_reason_required) must NOT surface the length-reason field — no field could fix a contiguity refusal",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

// GATE (c) — every T1 door trigger this train adds is a real, keyboard-
// reachable <button>, in DOM order, with no tabindex/focus-visible
// violation. Mirrors close-keyboard.test.tsx's own precedent, over the
// COLLAPSED (no dialog open) surface — the confirm-button-inside-a-portal
// case is already covered per-dialog by the refusal/cancel tests above.
test("GATE (c): every T1 client-scoped door trigger is keyboard-reachable with zero tabindex/focus-visible violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "ROME PROPERTIES", fy_end_month: 6, fy_end_day: 30 }]);
      if (url.includes("/rest/v1/close_prep_holds")) return jsonResponse([]);
      if (url.includes("/rpc/list_agent_act_receipts")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        withProvider(
          createElement(
            "div",
            null,
            createElement(FiscalYearOpener, { clientId: "c1", session: sessionTokenAccessor, onOpened: async () => {} }),
            createElement(ClosePrepHoldPanel, { clientId: "c1", session: sessionTokenAccessor }),
            createElement(FutureAttestationPanel, { clientId: "c1", session: sessionTokenAccessor }),
          ),
        ),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const triggers = ["Set fiscal-year end", "Open fiscal year", "Hold close prep", "Record future-method attestation"];
        for (const label of triggers) {
          const btn = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(label));
          assert.ok(btn, `${label} must render as a real button`);
          assert.ok(focusableElements(h.container as never).includes(btn as never), `${label} must be keyboard-reachable`);
        }
        assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations across the T1 client-scoped surface");
      } finally {
        await h.unmount();
      }
    },
  );
});
