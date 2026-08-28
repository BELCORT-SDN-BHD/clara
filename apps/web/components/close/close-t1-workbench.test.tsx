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
        assert.match(h.text(), /not on hold/i);
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
        const confirmButtons = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Adopt" && n !== adoptTrigger);
        // AdoptDialog has no extra fields, so its Confirm is reachable
        // straight from the trigger click via the SAME predicate — find it
        // in `body` (the portal), not `h.container`.
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
        void confirmButtons;
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

test("FutureAttestationPanel: Confirm stays disabled until every field is filled, and a REAL CLR03 refusal renders verbatim", async () => {
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

        function findByAria(root: unknown, label: string): unknown {
          const getAttr = (root as { getAttribute?: (n: string) => string | null }).getAttribute;
          if (getAttr && getAttr.call(root, "aria-label") === label) return root;
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
            const found = findByAria(c, label);
            if (found) return found;
          }
          return null;
        }
        function findAllBtn(root: unknown, label: string, out: unknown[] = []): unknown[] {
          if ((root as { tagName?: string }).tagName === "BUTTON" && textOf(root as never) === label) out.push(root);
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) findAllBtn(c, label, out);
          return out;
        }
        const confirmButton = findAllBtn(body, "Record")[0];
        assert.ok(confirmButton, "the dialog's own Confirm must render");
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm must stay disabled with every field empty");

        const cents = findByAria(body, "Expected amount (RM)");
        assert.ok(cents);
        setFieldValue(cents as never, "500.00");
        for (let i = 0; i < 2; i++) await h.settle();
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm must STILL be disabled — the other required fields remain empty");
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
