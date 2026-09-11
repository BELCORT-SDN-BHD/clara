// The event detail Sheet's own focus contract (#632 review finding 16: "this lane skipped its
// RTL seam entirely"). Proves what apps/web/AGENTS.md's Sheet/Dialog contract asks for and what
// this environment can HONESTLY measure — same discipline
// `components/admin/invite-dialog-keyboard.test.tsx` already established for the (structurally
// identical, @base-ui/react-backed) invite Dialog:
//   - Title: a real accessible name for the open panel.
//   - Initial focus: the Title itself receives focus once the detail read settles (this is the
//     APP'S OWN `titleRef.current?.focus()` effect in activity-event-sheet.tsx, directly
//     provable — not base-ui's internal focus-trap mechanics, which this harness cannot exercise
//     for the reasons test/keyboardWalk.ts's own header records).
//   - Escape / close: the rendered close control (a real `<button>`, not a styled div) actually
//     closes the panel.
//   - Focus return: whatever was focused before the panel opened is REACHABLE again afterwards —
//     the same honest claim the invite Dialog's own "ESCAPE PATH" cell makes ("focus must not be
//     stranded"), not a claim that `document.activeElement` deterministically lands back on one
//     exact node, which no test in this repo claims for any dialog (there is no real focus
//     manager in this stub DOM).
//
// A tiny stateful harness plays the row's own role (open on click, close via onOpenChange) —
// exactly what `components/firm/activity/activity-feed.tsx` does for real, without needing that
// file's own next/navigation (`useRouter`/`useSearchParams`) wiring, which
// `ActivityEventSheet` itself never touches (it is a plain props-in component).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";

import { renderComponent, clickButton, textOf } from "../../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../../test/domInspect";
import { focusableElements } from "../../../test/keyboardWalk";
import { App, jsonResponse } from "./activity-test-fixtures";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../../lib/session-accessor";
import type { MemberNameResolver } from "../../../lib/members/use-member-names";
import type { ActivitySource } from "../../../lib/firm/activity";
import { ActivityEventSheet } from "./activity-event-sheet";

enableDomInspection();

const NO_MEMBERS: MemberNameResolver = { resolve: () => null, members: [], loading: false, error: null };

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

/** Plays the row's own role: a plain button that opens the Sheet on an `event`, exactly as
 *  `activity-row.tsx`'s own `onClick={() => onOpenDetail(row)}` does. */
function RowHarness() {
  const [event, setEvent] = useState<{ source: ActivitySource; id: string } | null>(null);
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { type: "button", id: "row-open-button", onClick: () => setEvent({ source: "event", id: "e1111111-1111-1111-1111-111111111111" }) },
      "Open row",
    ),
    createElement(ActivityEventSheet, {
      event,
      onOpenChange: (open: boolean) => { if (!open) setEvent(null); },
      memberNames: NO_MEMBERS,
    }),
  );
}

type StubNode = { tagName?: string; childNodes?: StubNode[]; getAttribute?: (n: string) => string | null };
function findIn(root: StubNode, predicate: (n: StubNode) => boolean): StubNode | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) { const found = findIn(c, predicate); if (found) return found; }
  return null;
}

test("ActivityEventSheet: opens with a real Title, moves focus to it once the read settles, and its close control actually closes it", async () => {
  await withMockedEnv(
    async (url) => {
      const u = String(url);
      if (u.includes("get_activity_event")) {
        return jsonResponse({
          id: "e1111111-1111-1111-1111-111111111111", source: "event", event_type: "document.filed",
          description: "A document was filed.", client_id: null, client_name: null,
          actor: "u1", on_behalf_of: null, via_wake_kind: null, occurred_at: "2026-06-01T00:00:00Z",
          object_kind: "document", object_id: "d1", work_id: null, receipt_id: null, document_id: "d1",
          original_entry_id: null, replacement_entry_id: null, status: null, kind: "documents",
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(RowHarness)) as never);
      const body = (globalThis as unknown as { document: { body: StubNode & { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container as unknown as StubNode);
      try {
        for (let i = 0; i < 3; i++) await h.settle();

        const rowButton = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Open row");
        assert.ok(rowButton, "the row's own trigger button must render");
        (rowButton as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), rowButton, "baseline: focus starts on the row, before the Sheet opens");

        await h.act(async () => { await clickButton(rowButton as never); });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.match(textOf(body as never), /Event detail/, "the Sheet must be open with its real Title text");
        const title = findIn(body, (n) => n.tagName === "H2" || (typeof n.getAttribute === "function" && n.getAttribute("data-slot") === "sheet-title"));
        assert.ok(title, "the Sheet must render a title node");
        assert.equal(
          activeElement(),
          title,
          "initial focus: the Title itself receives focus once the detail read settles (activity-event-sheet.tsx's own titleRef effect)",
        );

        const closeButton = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Close");
        assert.ok(closeButton, "the Sheet must render a real <button>Close</button>, not a styled div");
        await h.act(async () => { await clickButton(closeButton as never); });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.ok(!/Event detail/.test(textOf(body as never)), "the close control must actually close the Sheet");
        const rowAgain = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Open row");
        assert.ok(rowAgain, "the row's trigger must still exist");
        assert.ok(
          focusableElements(h.container as never).includes(rowAgain as never),
          "focus return: the row is REACHABLE again once the Sheet closes — not stranded behind an inert page",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});

test("ActivityEventSheet: a denied/failed detail read renders the error state instead of a blank or stale panel", async () => {
  await withMockedEnv(
    async (url) => {
      const u = String(url);
      if (u.includes("get_activity_event")) return jsonResponse({ code: "CLR11", message: "activity event not found", details: '{"reason":"activity_event_not_found"}' }, 400);
      throw new Error(`unexpected fetch ${u}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(RowHarness)) as never);
      const body = (globalThis as unknown as { document: { body: StubNode & { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container as unknown as StubNode);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const rowButton = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Open row");
        await h.act(async () => { await clickButton(rowButton as never); });
        for (let i = 0; i < 5; i++) await h.settle();

        assert.match(textOf(body as never), /activity event not found/, "the governed refusal's own message renders, never a blank panel");
      } finally {
        await h.unmount();
      }
    },
  );
});
