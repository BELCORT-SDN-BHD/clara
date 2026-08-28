// GATE (c) — keyboard-walk tests for T7's coding-lane door dialogs:
// open_coding_task / open_question(document) (UncodedFilingActions),
// resolve_lint_finding (LintFindingActions). documents-governance-
// keyboard.test.tsx's own `findIn`/`body.appendChild` precedent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { UncodedFilingActions } from "./uncoded-filing-actions";
import { LintFindingActions } from "./lint-finding-actions";
import { CodingTaskActions } from "./coding-task-actions";

enableDomInspection();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// The OPEN CODING TASK journey below clicks a REAL confirm through to a real
// `openCodingTask()` call (lib/coding/doors.ts, embedded inside
// UncodedFilingActions itself — not test-injectable the way journals'
// `onWithdraw` prop is) — it needs a live-looking session + fetch, unlike
// the other two journeys here which only prove reachability/gating and never
// click confirm.
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

type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

function body(): Node {
  return (globalThis as unknown as { document: { body: Node } }).document.body;
}

function detach(h: Awaited<ReturnType<typeof renderComponent>>, b: Node): Promise<void> {
  return h.unmount().then(() => {
    const bodyEl = b as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
    if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
  });
}

test("OPEN CODING TASK journey: the dialog opens, its reason field and Confirm/Cancel are keyboard-reachable, Confirm gated until a reason is typed", async () => {
  let calls = 0;
  let posted = false;
  await withMockedEnv(
    async (url) => {
      if (String(url).includes("/rpc/open_coding_task")) { posted = true; return jsonResponse({ coding_task_id: "t1", status: "open" }); }
      throw new Error(`unexpected fetch: ${String(url)}`);
    },
    async () => {
      const h = await renderComponent(
        App(createElement(UncodedFilingActions, {
          clientId: "c1", documentId: "d1", filingId: "f1", busy: false,
          act: async (fn: () => Promise<void>) => { calls += 1; await fn(); },
        })),
      );
      const b = body();
      (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Open coding task$/) !== null);
    assert.ok(trigger, "the open-task trigger must render");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const reasonField = findIn(b, (n) => n.tagName === "TEXTAREA");
    assert.ok(reasonField, "the reason field must render as a real <textarea>");
    const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Open coding task$/) !== null && n !== trigger);
    const cancelButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null);
    assert.ok(confirmButton, "the confirm control must render");
    assert.ok(cancelButton, "the cancel control must render");
    assert.ok(
      !focusableElements(b as never).includes(confirmButton as never),
      "confirm must be unreachable (disabled) while the reason is empty",
    );

    await h.act(() => { setFieldValue(reasonField as never, "vendor could not be matched"); });
    const confirmAfter = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Open coding task$/) !== null && n !== trigger);
    assert.ok(focusableElements(b as never).includes(confirmAfter as never), "confirm must become reachable once a reason is typed");
    assert.deepEqual(checkKeyboardWalk(b as never), [], "no tabindex-order/focus-visible violations in the open dialog");

    (reasonField as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), reasonField, "focusing the reason field must move document.activeElement to it");

    await h.act(() => { clickButton(confirmAfter as never); });
    for (let i = 0; i < 6; i++) await h.settle();
    assert.equal(calls, 1, "confirm must invoke act() exactly once");
    assert.ok(posted, "open_coding_task must actually have been posted");
    assert.doesNotMatch(textOf(b as never), /Open a coding task/, "the dialog must actually close on a real confirm");
      } finally {
        await detach(h, b);
      }
    },
  );
});

test("ASK QUESTION journey: the dialog opens, its question field and Confirm/Cancel are keyboard-reachable", async () => {
  const h = await renderComponent(
    App(createElement(UncodedFilingActions, {
      clientId: "c1", documentId: "d1", filingId: "f1", busy: false,
      act: async (fn: () => Promise<void>) => { await fn(); },
    })),
  );
  const b = body();
  (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Ask a question$/) !== null);
    assert.ok(trigger, "the ask-question trigger must render");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const questionField = findIn(b, (n) => n.tagName === "TEXTAREA");
    const cancelButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null);
    assert.ok(questionField, "the question field must render as a real <textarea>");
    assert.ok(cancelButton, "the cancel control must render");

    const confirmBefore = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Ask question$/) !== null && n !== trigger);
    assert.ok(confirmBefore, "the confirm control must render even while disabled");
    assert.ok(!focusableElements(b as never).includes(confirmBefore as never), "confirm must be unreachable while the question is empty");
    assert.deepEqual(checkKeyboardWalk(b as never), [], "no tabindex-order/focus-visible violations in the open dialog");
  } finally {
    await detach(h, b);
  }
});

test("RESOLVE LINT FINDING journey: the dialog opens, its conclusion select + note field + Confirm/Cancel are keyboard-reachable, Confirm gated until BOTH are filled", async () => {
  const h = await renderComponent(
    App(createElement(LintFindingActions, {
      findingId: "lf1", busy: false,
      act: async (fn: () => Promise<void>) => { await fn(); },
    })),
  );
  const b = body();
  (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Resolve$/) !== null);
    assert.ok(trigger, "the resolve trigger must render");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const select = findIn(b, (n) => n.tagName === "SELECT");
    const noteField = findIn(b, (n) => n.tagName === "TEXTAREA");
    assert.ok(select, "the conclusion select must render as a real <select>");
    assert.ok(noteField, "the note field must render as a real <textarea>");

    const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Resolve finding$/) !== null);
    assert.ok(confirmButton, "the confirm control must render");
    assert.ok(!focusableElements(b as never).includes(confirmButton as never), "confirm must be unreachable while both fields are empty");

    // The select is portalled (base-ui Dialog content lives in document.body,
    // a delegation root `h.fireEvent` (scoped to the mount container) never
    // reaches — hookHarness.ts's `clickButton` own header explains the same
    // gap for onClick; `setFieldValue` sidesteps it identically for onChange.
    await h.act(() => { setFieldValue(select as never, "corrected"); });
    assert.ok(
      !focusableElements(b as never).includes(confirmButton as never),
      "confirm must STILL be unreachable — a conclusion alone is not enough, the note is required too",
    );

    await h.act(() => { setFieldValue(noteField as never, "fixed the stale page reference"); });
    assert.ok(
      focusableElements(b as never).includes(confirmButton as never),
      "confirm must become reachable once BOTH the conclusion and the note are filled",
    );
    assert.deepEqual(checkKeyboardWalk(b as never), [], "no tabindex-order/focus-visible violations in the open dialog");
  } finally {
    await detach(h, b);
  }
});

test("COMPLETE CODING TASK journey: the dialog opens, its (async-fetched) entry picker + Confirm/Cancel are keyboard-reachable, Confirm gated on a picked entry", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/journal_entries")) {
        return jsonResponse([{ id: "e1", posting_date: "2026-04-05", memo: "April invoice" }]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        App(createElement(CodingTaskActions, {
          taskId: "t1", filingId: "f1", busy: false,
          act: async (fn: () => Promise<void>) => { await fn(); },
        })),
      );
      const b = body();
      (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Complete$/) !== null);
        assert.ok(trigger, "the complete trigger must render");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        const select = findIn(b, (n) => n.tagName === "SELECT");
        assert.ok(select, "the entry picker must render as a real <select> once its (async) fetch resolves");
        const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Complete task$/) !== null);
        assert.ok(confirmButton, "the confirm control must render");
        assert.ok(!focusableElements(b as never).includes(confirmButton as never), "confirm must be unreachable until an entry is picked");
        assert.ok(focusableElements(b as never).includes(select as never), "the entry picker must be keyboard-reachable");

        await h.act(() => { setFieldValue(select as never, "e1"); });
        assert.ok(focusableElements(b as never).includes(confirmButton as never), "confirm must become reachable once an entry is picked");
        assert.deepEqual(checkKeyboardWalk(b as never), [], "no tabindex-order/focus-visible violations in the open dialog");
      } finally {
        await detach(h, b);
      }
    },
  );
});

test("DISMISS CODING TASK journey: the dialog opens, its reason field and Confirm/Cancel are keyboard-reachable", async () => {
  const h = await renderComponent(
    App(createElement(CodingTaskActions, {
      taskId: "t1", filingId: "f1", busy: false,
      act: async (fn: () => Promise<void>) => { await fn(); },
    })),
  );
  const b = body();
  (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  try {
    for (let i = 0; i < 4; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Dismiss$/) !== null);
    assert.ok(trigger, "the dismiss trigger must render");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const reasonField = findIn(b, (n) => n.tagName === "TEXTAREA");
    assert.ok(reasonField, "the reason field must render as a real <textarea>");
    const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Dismiss task$/) !== null);
    assert.ok(!focusableElements(b as never).includes(confirmButton as never), "confirm must be unreachable while the reason is empty");

    await h.act(() => { setFieldValue(reasonField as never, "duplicate task"); });
    assert.ok(focusableElements(b as never).includes(confirmButton as never), "confirm must become reachable once a reason is typed");
    assert.deepEqual(checkKeyboardWalk(b as never), [], "no tabindex-order/focus-visible violations in the open dialog");
  } finally {
    await detach(h, b);
  }
});

// M13, independent review (pin the fixes): a REFUSED confirm must NOT clear
// what the human typed. `CodingDoorDialog` closes on every confirm click
// regardless of outcome (its own `runOnce` reports whether `onConfirm` RAN,
// never whether the door succeeded — lib/parts/single-fire-guard.ts's own
// header), so the only observable proof is on REOPEN: the field must still
// hold the original text, not a blank one a `.then()`-style unconditional
// clear would have produced.
test("OPEN CODING TASK journey: a REFUSED confirm does not clear the typed reason — reopening the dialog shows it still there", async () => {
  let refusalCalls = 0;
  await withMockedEnv(
    async (url) => {
      if (String(url).includes("/rpc/open_coding_task")) {
        refusalCalls += 1;
        return jsonResponse({ code: "CLR24", message: "active coding-task filing not found" }, 400);
      }
      throw new Error(`unexpected fetch: ${String(url)}`);
    },
    async () => {
      const h = await renderComponent(
        App(createElement(UncodedFilingActions, {
          clientId: "c1", documentId: "d1", filingId: "f1", busy: false,
          // A refusal caught and swallowed HERE, never rethrown — the SAME
          // contract the real `useHydratedPart().act()`/needs-you `act()`
          // both honor (they catch internally and never reject; that is
          // what lets `onConfirm` reach its own `if (succeeded)` check
          // instead of throwing past it).
          act: async (fn: () => Promise<void>) => { try { await fn(); } catch { /* swallowed, matching the real act() */ } },
        })),
      );
      const b = body();
      (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Open coding task$/) !== null);
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        const reasonField = findIn(b, (n) => n.tagName === "TEXTAREA");
        await h.act(() => { setFieldValue(reasonField as never, "vendor could not be matched"); });
        const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Open coding task$/) !== null && n !== trigger);
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();
        assert.equal(refusalCalls, 1, "the refusal must actually have been reached exactly once");
        assert.doesNotMatch(textOf(b as never), /Open a coding task/, "the dialog closes regardless of outcome");

        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();
        // Read the value react itself last rendered onto the REOPENED
        // (freshly-mounted, per base-ui's own unmount-on-close default)
        // textarea's own props — the same `__reactProps$...` mechanism
        // setFieldValue already relies on — rather than the raw DOM
        // property, which a fresh stub node's own value-tracking quirks
        // make an unreliable read in this harness.
        const reopenedField = findIn(b, (n) => n.tagName === "TEXTAREA") as unknown as Record<string, unknown>;
        const propsKey = Object.keys(reopenedField).find((k) => k.startsWith("__reactProps"));
        const reactValue = propsKey ? (reopenedField[propsKey] as { value?: string }).value : undefined;
        assert.equal(reactValue, "vendor could not be matched", "the reason must survive a refusal — cleared only on SUCCESS");
      } finally {
        await detach(h, b);
      }
    },
  );
});

// M16, independent review (pin the fixes): a FAILED read of the entry picker
// must render as an error with a retry, never the honest-but-wrong "no
// approved entries exist" claim — that message is reserved for a read that
// genuinely succeeded and returned zero rows.
test("COMPLETE CODING TASK journey: a FAILED entry-picker read renders the error + retry, never the empty-entries claim", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/journal_entries")) {
        return jsonResponse({ code: "PGRST000", message: "connection reset" }, 500);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        App(createElement(CodingTaskActions, {
          taskId: "t1", filingId: "f1", busy: false,
          act: async (fn: () => Promise<void>) => { await fn(); },
        })),
      );
      const b = body();
      (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Complete$/) !== null);
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        assert.doesNotMatch(textOf(b as never), /No approved entry exists yet/, "a FAILED read must never render as a fabricated empty-entries fact");
        const retryButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Retry$/) !== null);
        assert.ok(retryButton, "a retry control must render on a failed read");
        assert.equal(findIn(b, (n) => n.tagName === "SELECT"), null, "no entry picker may render over a failed read");
      } finally {
        await detach(h, b);
      }
    },
  );
});
