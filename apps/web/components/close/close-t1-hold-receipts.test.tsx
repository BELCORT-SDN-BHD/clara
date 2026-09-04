// T1 (port-wave, 2026-08-29) — interaction tests for the close-prep hold
// (ClosePrepHoldPanel: hold_close_prep / release_close_prep) and agent-act
// receipts (AgentActReceiptsPanel: list_agent_act_receipts). Split out of
// the original close-t1-workbench.test.tsx (1043 lines; the local
// max-file-size hook flags >500) at rev-t1's round-2 re-verify — see
// close-t1-opener.test.tsx's own header for the full three-file split.
// Mounts the REAL surfaces (renderComponent, fetch mocked only) — never
// renderToStaticMarkup for anything that self-fetches via useHydratedPart.
// Every dialog interaction rides `clickButton`/`setFieldValue` from
// test/hookHarness.ts (apps/web/AGENTS.md's two dialog-testing laws) —
// `h.fireEvent` never touches anything inside an open dialog's portal here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClosePrepHoldPanel } from "./ClosePrepHoldPanel";
import { AgentActReceiptsPanel } from "./AgentActReceiptsPanel";

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
test("FIX-1: a REAL hold_close_prep refusal renders verbatim AND the Hold trigger still renders AND the typed reason survives (no remount) — PROBE R5: also RIGHT during the loading window, not only after it settles", async () => {
  let closePrepHoldsCalls = 0;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_prep_holds")) {
        closePrepHoldsCalls += 1;
        if (closePrepHoldsCalls > 1) {
          // PROBE R5 (rev-t1, round-2 re-verify). A same-microtask-resolving
          // mock lets React batch straight from the pre-attempt state to the
          // final settled state without ever COMMITTING the intermediate
          // `loading===true, data===null` render — exactly the render the
          // `!hold.loading` half of the OLD guard unmounted on. Without a
          // real delay here, restoring `!hold.loading` ALONE (leaving
          // `!hold.err` fixed) survives this test, because that intermediate
          // render is never observed. A few real macrotask ticks force React
          // to actually commit it.
          for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
        }
        return jsonResponse([]);
      }
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
        // R5's own delay adds four real macrotask ticks inside the mocked
        // reload — settle well past that window before reading anything.
        for (let i = 0; i < 14; i++) await h.settle();

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

        // R4 (rev-t1, optional upgrade — taken), RE-CUT for CB-AE2E-004: the
        // BEHAVIOURAL claim directly, not only the structural proxy above. There is
        // no reopen step any more, because the dialog never closed — a refused
        // confirm now KEEPS it open (single-fire-guard.ts's widened outcome +
        // hooks.ts's `act` boolean), which is the stronger form of the very
        // guarantee this cell was written to make. Confirm's OWN live-derived gate
        // (`confirmDisabled={reason.trim().length === 0}`) reads enabled with no
        // retyping, which is only possible if `reason` genuinely survived.
        const confirmStillOpen = findAllButtonsByText(body, "Hold")[0];
        assert.ok(confirmStillOpen, "the dialog's own Confirm must STILL render — a refusal does not close the dialog");
        assert.equal(
          (confirmStillOpen as unknown as { disabled: boolean }).disabled,
          false,
          "Confirm must read ENABLED — `reason` still holds the typed text, so `reason.trim().length === 0` is false with no retyping",
        );
        assert.equal(
          (findByAttr(body, "aria-label", "Hold close prep") as unknown as { value: string }).value,
          typedReason,
          "and the typed reason is still IN the field, verbatim",
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
