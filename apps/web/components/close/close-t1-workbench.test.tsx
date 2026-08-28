// T1 (port-wave, 2026-08-29) — interaction tests for the fiscal-year opener,
// close-prep hold, agent-act receipts, close readiness and the rewritten
// close-proposal workbench. Mounts the REAL surfaces (renderComponent,
// fetch mocked only) — never renderToStaticMarkup for anything that
// self-fetches via useHydratedPart, per this file's own house precedent
// (close-a11y.test.tsx's header). Every dialog interaction rides
// `clickButton`/`setFieldValue` from test/hookHarness.ts (apps/web/AGENTS.md's
// two dialog-testing laws) — `h.fireEvent` never touches anything inside an
// open dialog's portal in this file.

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
import { AgentActReceiptsPanel } from "./AgentActReceiptsPanel";
import { CloseReadinessPanel } from "./CloseReadinessPanel";
import { CloseProposalPanel } from "./CloseProposalPanel";
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
          1,
          "DISCRIMINATING POST-CONDITION: the dialog's own Confirm must be GONE from document.body after it settles — only the trigger remains",
        );

        const bodyText = textOf(body as never);
        assert.match(bodyText, /CLR38/, "the refusal code must render verbatim in the persistent banner");
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

test("ClosePrepHoldPanel: visibility follows the DB's own hold state — not held shows Hold only, held shows Release + the reason", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_prep_holds")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(ClosePrepHoldPanel, { clientId: "c1", session: sessionTokenAccessor })));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /no close-prep hold is visible/i);
        assert.ok(h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Hold close prep")));
        assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Release hold")), null);
      } finally {
        await h.unmount();
      }
    },
  );

  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_prep_holds")) {
        return jsonResponse([{ id: "h1", client_id: "c1", purpose: "close_prep", held_by: "u1", reason: "awaiting a document", held_at: "2026-08-01T00:00:00Z", released_by: null, released_at: null, release_reason: null }]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(ClosePrepHoldPanel, { clientId: "c1", session: sessionTokenAccessor })));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /awaiting a document/);
        assert.ok(h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Release hold")));
        assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Hold close prep")), null, "the Hold trigger must NOT render while already held");
      } finally {
        await h.unmount();
      }
    },
  );
});

// FIX-1 (rev-t1, HIGH — PROBE R1). `act()` makes a refusal STICKY
// (lib/parts/hooks.ts:232-237): the instant hold_close_prep refuses, the
// OLD guard (`!hold.loading && hold.data === null && !hold.err`) made the
// entire not-held block — INCLUDING HoldDialog itself — return null the
// moment `hold.err` was set, unmounting HoldDialog and losing its own
// `reason` state. The Hold trigger was then gone until a page reload, with
// no way to retry the very refusal just shown. The fix drops `&& !hold.err`
// from that guard (the banner at ClosePrepHoldPanel.tsx:45 already renders
// the refusal on its own, unconditionally).
test("FIX-1: a REAL hold_close_prep refusal renders verbatim AND the Hold trigger still renders AND the typed reason survives (no remount)", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_prep_holds")) return jsonResponse([]);
      if (url.includes("/rpc/hold_close_prep")) {
        return jsonResponse({ code: "CLR11", message: "client is not in your firm" }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(ClosePrepHoldPanel, { clientId: "c1", session: sessionTokenAccessor })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Hold close prep"));
        assert.ok(trigger, "the Hold trigger must render before any attempt");
        await clickButton(trigger as never);
        for (let i = 0; i < 3; i++) await h.settle();

        const reasonField = findByAttr(body, "aria-label", "Hold close prep");
        assert.ok(reasonField, "the reason textarea must be reachable inside the open dialog");
        const typedReason = "awaiting the bank statement, per the client's email";
        setFieldValue(reasonField as never, typedReason);
        for (let i = 0; i < 2; i++) await h.settle();

        const confirmButton = findAllButtonsByText(body, "Hold")[0];
        assert.ok(confirmButton, "the dialog's own Confirm must render");
        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /CLR11/, "the refusal code must render verbatim in the persistent banner");
        assert.match(bodyText, /client is not in your firm/, "the refusal message must render verbatim");

        // THE BUG: with the old `&& !hold.err` (and, chased one layer
        // deeper, `&& !hold.loading` — every act() reload flips `loading`
        // true then false, RE-TRIGGERING the same unmount) guard, this
        // block — HoldDialog included — returned null the instant EITHER
        // fired, unmounting HoldDialog and resetting its own `reason`
        // useState.
        //
        // PROOF INSTRUMENT, stated precisely: this harness's base-ui Dialog
        // stub does not faithfully reproduce a REAL browser's controlled-
        // value re-hydration on a Popup's own internal remount (confirmed by
        // an isolated probe: even a bare CloseDoorDialog with no
        // ClosePrepHoldPanel involved reads an EMPTY textarea after a plain
        // Cancel+reopen, though React's own `reason` state is provably
        // untouched) — so reading the REOPENED textarea's DOM `.value` is
        // NOT a reliable instrument for "did HoldDialog unmount" in this
        // harness, and asserting on it would be liable to a FALSE negative
        // having nothing to do with this component's own code. Reference
        // IDENTITY of the trigger node is the reliable proxy instead: `mkNode`
        // creates a genuinely NEW node object for every fresh commit — if
        // the not-held block had returned null and re-rendered, `trigger`
        // and the node found here would be DIFFERENT objects. `===` proves
        // the whole subtree (HoldDialog, and its `reason` state, included)
        // was NEVER removed from the tree — the same guarantee "the reason
        // survives" needs, proven at the layer this harness CAN see.
        const triggerAfterRefusal = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Hold close prep"));
        assert.ok(triggerAfterRefusal, "the Hold trigger must STILL render after a refusal — the not-held block must not unmount on hold.err or hold.loading");
        assert.equal(
          triggerAfterRefusal,
          trigger,
          "the trigger must be the SAME node object across the refusal — a different object would prove the not-held block (HoldDialog, and its reason state, included) was unmounted and freshly re-rendered",
        );
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
// MUTANT NOTE: a heading-order scan flags a SKIPPED rung, not an absolute
// level per heading — with the other two already h2, reverting only ONE of
// the three back to level={3} leaves a valid h1->h2->h3 path elsewhere in
// DOM order and does NOT red this test (measured). The mutant that
// reproduces the ORIGINAL bug (and does red) is reverting ALL THREE.
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
// The contiguity refusal's own DETAIL `reason` key was not captured during
// the rung-5 walk (only `.code`/`.message` were) — this test proves
// DISCRIMINATION (a DIFFERENT reason correctly does NOT surface the length
// field), not the DB's exact wire shape for that specific refusal.
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

        // The dialog ALWAYS closes once the attempt settles (house pattern —
        // CloseDoorDialog's own header), so the length-reason field's OWN
        // appearance can only be observed by reopening: `refusal` is a PROP
        // sourced from the PARENT's own `fyEnd.clr` (which persists reliably
        // — the parent never unmounts), so a fresh mount of the dialog's
        // content correctly reflects it — unlike a per-dialog LOCAL useState,
        // this needs no state-preservation-across-remount guarantee at all.
        const triggerAfterRefusal = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Open fiscal year"));
        assert.ok(triggerAfterRefusal, "the Open-fiscal-year trigger must still render after the refusal");
        await clickButton(triggerAfterRefusal as never);
        for (let i = 0; i < 4; i++) await h.settle();
        assert.ok(
          findByAttr(body, "id", "fy-open-length-reason"),
          "the length-reason field must NOW appear on reopen — the refusal named exactly this",
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
          { code: "CLR10", message: "fiscal year starting 2027-01-01 is not contiguous with its predecessor ending 2026-06-30 -- periods admit no gap and no overlap", details: '{"reason":"fy_not_contiguous"}' },
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

test("AgentActReceiptsPanel: renders a live receipt's act_kind, verdict and model verbatim", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_agent_act_receipts")) {
        return jsonResponse([
          {
            receipt_id: "r1", act_kind: "close_gate_evaluate", subject_kind: "close_run", subject_id: "run1",
            verdict: "pass", rung_vector: {}, model: { name: "claude-sonnet-5", version: "1" },
            rationale: "every gate measured clean", via_wake_kind: "close_prep", wake_task_id: "wk1",
            on_behalf_of: null, created_at: "2026-08-01T00:00:00Z",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(AgentActReceiptsPanel, { clientId: "c1", session: sessionTokenAccessor })));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /close_gate_evaluate/);
        assert.match(h.text(), /claude-sonnet-5/);
        assert.match(h.text(), /every gate measured clean/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("AgentActReceiptsPanel: zero receipts renders the honest empty state, never a fabricated row", async () => {
  await withMockedEnv(
    async () => jsonResponse([]),
    async () => {
      const h = await renderComponent(withProvider(createElement(AgentActReceiptsPanel, { clientId: "c1", session: sessionTokenAccessor })));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /No agent act receipts yet/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("CloseReadinessPanel: cross-references get_close_readiness's bare check_key against the live close_gate_checks catalog — measured gates show state+attested, an absent one shows 'not yet measured'", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_gate_checks")) {
        return jsonResponse([
          { check_key: "ar_control_tie", drawer: 1, title: "AR control account = Σ open receivable items", applies_when: "always" },
          { check_key: "uncoded_documents", drawer: 2, title: "No FY-dated filings without an entry", applies_when: "always" },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const readiness = {
        fiscal_year_id: "fy1", close_run_id: "run1", run_state: "in_progress" as const, fy_end_source: "asserted" as const,
        gates: [{ check_key: "ar_control_tie", drawer: 1 as const, state: "pass" as const, measured: {}, measured_digest: "d1", attested: true }],
      };
      const h = await renderComponent(
        withProvider(createElement(CloseReadinessPanel, { readiness, loading: false, err: null, session: sessionTokenAccessor })),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const text = h.text();
        const arIdx = text.indexOf("AR control account");
        const passIdx = text.indexOf("pass");
        const attestedIdx = text.indexOf("attested");
        const undatedIdx = text.indexOf("No FY-dated filings without an entry");
        const notYetIdx = text.indexOf("not yet measured");
        assert.ok(arIdx >= 0 && passIdx > arIdx, "the MEASURED gate's own state ('pass') must render after its catalog title");
        assert.ok(attestedIdx > passIdx && attestedIdx < undatedIdx, "the measured gate's own 'attested' badge renders in its own row, before the next catalog row starts");
        assert.ok(undatedIdx >= 0 && notYetIdx > undatedIdx, "a check_key ABSENT from get_close_readiness's gates[] must render 'not yet measured' honestly, never be silently omitted");
      } finally {
        await h.unmount();
      }
    },
  );
});

// N1 (rev-t1 nit, made cheap and worth pinning): a lookup-table Badge-variant
// map (STATE_VARIANT / VERDICT_VARIANT) can be silently swapped — pass<->fail
// — and nothing in the tests above notices, because they only assert the
// STATE WORD renders, never which colour class it renders WITH. Reads the
// class attribute (enableDomInspection's real getAttribute), never the word,
// matching close-components.test.tsx's own `triggerIsEnabled` precedent.
function findExactTextNode(root: unknown, tag: string, text: string): unknown {
  if ((root as { tagName?: string }).tagName === tag && textOf(root as never) === text) return root;
  for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
    const found = findExactTextNode(c, tag, text);
    if (found) return found;
  }
  return null;
}

test("N1: CloseReadinessPanel's pass/fail badges carry DISTINCT, correctly-assigned colour classes — a silently-swapped STATE_VARIANT would not be caught by matching the word alone", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_gate_checks")) {
        return jsonResponse([
          { check_key: "ar_control_tie", drawer: 1, title: "AR control account = Σ open receivable items", applies_when: "always" },
          { check_key: "open_bank_recon_items", drawer: 2, title: "No unmatched statement lines", applies_when: "always" },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const readiness = {
        fiscal_year_id: "fy1", close_run_id: "run1", run_state: "in_progress" as const, fy_end_source: "asserted" as const,
        gates: [
          { check_key: "ar_control_tie", drawer: 1 as const, state: "pass" as const, measured: {}, measured_digest: "d1", attested: true },
          { check_key: "open_bank_recon_items", drawer: 2 as const, state: "fail" as const, measured: {}, measured_digest: "d2", attested: false },
        ],
      };
      const h = await renderComponent(
        withProvider(createElement(CloseReadinessPanel, { readiness, loading: false, err: null, session: sessionTokenAccessor })),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const passBadge = findExactTextNode(h.container, "SPAN", "pass");
        const failBadge = findExactTextNode(h.container, "SPAN", "fail");
        assert.ok(passBadge, "the pass badge must render");
        assert.ok(failBadge, "the fail badge must render");
        const passClass = (passBadge as { getAttribute?: (n: string) => string | null }).getAttribute?.("class") ?? "";
        const failClass = (failBadge as { getAttribute?: (n: string) => string | null }).getAttribute?.("class") ?? "";
        assert.match(passClass, /bg-primary/, "pass must carry the DEFAULT (non-alarming) variant class");
        assert.doesNotMatch(passClass, /bg-destructive/, "pass must NOT carry the destructive class");
        assert.match(failClass, /bg-destructive/, "fail must carry the DESTRUCTIVE (alarming) variant class");
        assert.doesNotMatch(failClass, /bg-primary/, "fail must NOT carry the default class");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("N1: AgentActReceiptsPanel's pass/fail verdict badges carry DISTINCT, correctly-assigned colour classes", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_agent_act_receipts")) {
        return jsonResponse([
          { receipt_id: "r1", act_kind: "a", subject_kind: "close_run", subject_id: "run1", verdict: "pass", rung_vector: {}, model: { name: "m", version: "1" }, rationale: null, via_wake_kind: "close_prep", wake_task_id: "wk1", on_behalf_of: null, created_at: "2026-08-01T00:00:00Z" },
          { receipt_id: "r2", act_kind: "b", subject_kind: "close_run", subject_id: "run1", verdict: "fail", rung_vector: {}, model: { name: "m", version: "1" }, rationale: null, via_wake_kind: "close_prep", wake_task_id: "wk1", on_behalf_of: null, created_at: "2026-08-01T00:00:00Z" },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(AgentActReceiptsPanel, { clientId: "c1", session: sessionTokenAccessor })));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const passBadge = findExactTextNode(h.container, "SPAN", "pass");
        const failBadge = findExactTextNode(h.container, "SPAN", "fail");
        assert.ok(passBadge && failBadge);
        const passClass = (passBadge as { getAttribute?: (n: string) => string | null }).getAttribute?.("class") ?? "";
        const failClass = (failBadge as { getAttribute?: (n: string) => string | null }).getAttribute?.("class") ?? "";
        assert.match(passClass, /bg-primary/);
        assert.match(failClass, /bg-destructive/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("CloseReadinessPanel: a read failure renders the banner, never a stale/blank readiness", async () => {
  const h = await renderComponent(
    withProvider(createElement(CloseReadinessPanel, { readiness: null, loading: false, err: "network error", session: sessionTokenAccessor })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.match(h.text(), /network error/);
  } finally {
    await h.unmount();
  }
});

test("CloseProposalPanel: an open proposal renders its narrative/rationale/model, Adopt succeeds and reloads the plan", async () => {
  let reloaded = false;
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_proposals")) {
        return jsonResponse([
          {
            id: "p1", firm_id: "f1", client_id: "c1", fiscal_year_id: "fy1", close_run_id: "run1", state: "open",
            proposed_by: "agent", bound_digests: {}, drafted: [{ check_key: "ar_control_tie", item_key: null }],
            narrative: "the AR control tie was measured clean this period", model_name: "claude-sonnet-5", model_version: "1",
            rationale: "every drafted item carries a live attestation", settled_by: null, settled_at: null, settle_reason: null,
            created_at: "2026-08-01T00:00:00Z",
          },
        ]);
      }
      if (url.includes("/rpc/settle_close_proposal")) return jsonResponse({ proposal_id: "p1", state: "adopted" });
      throw new Error(`unexpected fetch: ${url} ${String(init?.body)}`);
    },
    async () => {
      const h = await renderComponent(
        withProvider(createElement(CloseProposalPanel, { closeRunId: "run1", session: sessionTokenAccessor, reloadPlan: async () => { reloaded = true; } })),
      );
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /the AR control tie was measured clean this period/);
        assert.match(h.text(), /claude-sonnet-5/);

        const adoptTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Adopt");
        assert.ok(adoptTrigger);
        await clickButton(adoptTrigger as never);
        for (let i = 0; i < 3; i++) await h.settle();

        // FIX-4 (rev-t1, law 71 — a consent shows what it approves): the
        // OPEN dialog must show the narrative + the drafted-item count, not
        // just a title + a generic sentence. `basisDrafted`'s own wording
        // ("covers N drafted item(s)") is DISTINCT from the row's own
        // always-visible `proposal.drafted` string ("N drafted item(s)"), so
        // matching it discriminates "the dialog's children rendered" from
        // "the panel's own row text was already on the page anyway".
        const dialogText = textOf(body as never);
        assert.match(dialogText, /the AR control tie was measured clean this period/, "the dialog must show the SAME narrative the human is about to bind the firm to");
        assert.match(dialogText, /covers 1 drafted item/, "the dialog must show the drafted-item count — via basisDrafted, not the row's own separate string");
        assert.match(dialogText, /proposed by claude-sonnet-5 1/, "the dialog must show the proposing model/version");

        // AdoptDialog's Confirm is reachable straight from the trigger click
        // via the SAME predicate — find it in `body` (the portal), not
        // `h.container`.
        function findAllAdopt(root: unknown, out: unknown[] = []): unknown[] {
          if ((root as { tagName?: string }).tagName === "BUTTON" && textOf(root as never) === "Adopt") out.push(root);
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) findAllAdopt(c, out);
          return out;
        }
        const all = findAllAdopt(body);
        assert.equal(all.length, 2, "trigger + dialog confirm must both render as 'Adopt' buttons");
        await clickButton(all[1] as never);
        for (let i = 0; i < 6; i++) await h.settle();

        assert.equal(reloaded, true, "a settle must ALWAYS trigger the plan's own reload");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

test("CloseProposalPanel: Withdraw's CLR41 close_proposal_already_settled refusal renders verbatim in the persistent banner", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_proposals")) {
        return jsonResponse([
          {
            id: "p1", firm_id: "f1", client_id: "c1", fiscal_year_id: "fy1", close_run_id: "run1", state: "open",
            proposed_by: "agent", bound_digests: {}, drafted: [],
            narrative: "n", model_name: "claude-sonnet-5", model_version: "1", rationale: "r",
            settled_by: null, settled_at: null, settle_reason: null, created_at: "2026-08-01T00:00:00Z",
          },
        ]);
      }
      if (url.includes("/rpc/settle_close_proposal")) {
        return jsonResponse({ code: "CLR41", message: "close proposal p1 is already adopted; a settled proposal is terminal", details: '{"reason":"close_proposal_already_settled","state":"adopted"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        withProvider(createElement(CloseProposalPanel, { closeRunId: "run1", session: sessionTokenAccessor, reloadPlan: async () => {} })),
      );
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const withdrawTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Withdraw");
        assert.ok(withdrawTrigger);
        await clickButton(withdrawTrigger as never);
        for (let i = 0; i < 3; i++) await h.settle();

        function findByTag(root: unknown, tag: string): unknown {
          if ((root as { tagName?: string }).tagName === tag) return root;
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
            const found = findByTag(c, tag);
            if (found) return found;
          }
          return null;
        }
        const textarea = findByTag(body, "TEXTAREA");
        assert.ok(textarea);
        setFieldValue(textarea as never, "the analysis was superseded by a later document");
        for (let i = 0; i < 2; i++) await h.settle();

        function findAllWithdraw(root: unknown, out: unknown[] = []): unknown[] {
          if ((root as { tagName?: string }).tagName === "BUTTON" && textOf(root as never) === "Withdraw") out.push(root);
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) findAllWithdraw(c, out);
          return out;
        }
        const confirmButton = findAllWithdraw(body)[1];
        assert.ok(confirmButton);
        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /CLR41/);
        assert.match(bodyText, /already adopted; a settled proposal is terminal/);
        assert.equal(findAllWithdraw(body).length, 1, "the dialog's own Confirm must be gone from document.body after it settles");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

// Shared by both FutureAttestationPanel tests below — kept local to this
// file (this file's own established convention: close-t1-workbench.test.tsx
// re-declares small tree-walkers per test rather than importing a shared
// helper module none of the other close test files needs either).
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

/** Fills every one of FutureAttestationPanel's five required fields inside
 *  its OPEN dialog — the shared setup FIX-3 (rev-t1) found missing: the
 *  original test filled only ONE field, asserted `disabled === true`, and
 *  stopped — Confirm was never clicked, so the CLR03 mock branch this test's
 *  own NAME promised was unreachable dead code (R2's `throw` mutant still
 *  passed). */
async function fillFutureAttestationForm(body: unknown): Promise<void> {
  setFieldValue(findByAttr(body, "id", "fa-service-group") as never, "G");
  setFieldValue(findByAttr(body, "aria-label", "Expected amount (RM)") as never, "500.00");
  setFieldValue(findByAttr(body, "id", "fa-horizon") as never, "2026-01-01");
  setFieldValue(findByAttr(body, "id", "fa-expires") as never, "2027-01-01");
  setFieldValue(findByAttr(body, "id", "fa-evidence") as never, "signed engagement mandate on file");
}

test("FutureAttestationPanel: Confirm stays disabled until every field is filled, a REAL CLR03 refusal renders verbatim after Confirm actually runs, and the success path shows the recorded id", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/record_future_attestation")) {
        return jsonResponse({ code: "CLR03", message: "agent identity cannot attest the future method" }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(FutureAttestationPanel, { clientId: "c1", session: sessionTokenAccessor })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Record future-method attestation"));
        assert.ok(trigger && (trigger as unknown as { disabled: boolean }).disabled === false, "the trigger itself must be reachable — every field it gates lives inside the dialog it opens");
        await clickButton(trigger as never);
        for (let i = 0; i < 3; i++) await h.settle();

        const confirmButton = findAllButtonsByText(body, "Record")[0];
        assert.ok(confirmButton, "the dialog's own Confirm must render");
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm must stay disabled with every field empty");

        setFieldValue(findByAttr(body, "aria-label", "Expected amount (RM)") as never, "500.00");
        for (let i = 0; i < 2; i++) await h.settle();
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm must STILL be disabled — the other four required fields remain empty");

        // Fill the remaining four fields — Confirm must become enabled.
        setFieldValue(findByAttr(body, "id", "fa-service-group") as never, "G");
        setFieldValue(findByAttr(body, "id", "fa-horizon") as never, "2026-01-01");
        setFieldValue(findByAttr(body, "id", "fa-expires") as never, "2027-01-01");
        setFieldValue(findByAttr(body, "id", "fa-evidence") as never, "signed engagement mandate on file");
        for (let i = 0; i < 2; i++) await h.settle();
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "Confirm must be ENABLED once every field is filled — the actual gate this test now drives THROUGH, not just up to");

        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /CLR03/, "the refusal code must render verbatim in the persistent banner");
        assert.match(bodyText, /agent identity cannot attest the future method/, "the refusal message must render verbatim, never re-worded");
        // The trigger's OWN label is "Record future-method attestation" — it
        // never matches the exact string "Record" (the Confirm button's
        // label), so the discriminating count here is 0, not 1: the dialog's
        // Confirm is the ONLY node this predicate can ever match, and it
        // must be gone once the attempt settles.
        assert.equal(
          findAllButtonsByText(body, "Record").length,
          0,
          "DISCRIMINATING POST-CONDITION: the dialog's own Confirm ('Record') must be GONE from document.body after it settles",
        );
        assert.ok(
          h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Record future-method attestation")),
          "the trigger itself must still be reachable — it is a DIFFERENT label from the settled Confirm",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 4; i++) await h.settle();
      }
    },
  );
});

test("FutureAttestationPanel: the SUCCESS path renders the recorded id banner, never the refusal banner", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/record_future_attestation")) return jsonResponse({ id: "9f1c2a3b-0000-4000-8000-000000000001", expires_at: "2027-01-01" });
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(FutureAttestationPanel, { clientId: "c1", session: sessionTokenAccessor })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Record future-method attestation"));
        await clickButton(trigger as never);
        for (let i = 0; i < 3; i++) await h.settle();
        await fillFutureAttestationForm(body);
        for (let i = 0; i < 2; i++) await h.settle();

        const confirmButton = findAllButtonsByText(body, "Record")[0];
        assert.ok(confirmButton && (confirmButton as unknown as { disabled: boolean }).disabled === false, "Confirm must be enabled once every field is filled");
        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /9f1c2a3b-0000-4000-8000-000000000001/, "the recorded id must render verbatim — the DB's own answer, never invented");
        assert.doesNotMatch(bodyText, /CLR/, "a SUCCESSFUL call must never leave a stale refusal banner painted");
      } finally {
        await h.unmount();
        for (let i = 0; i < 4; i++) await h.settle();
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
