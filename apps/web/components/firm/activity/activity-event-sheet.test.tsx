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

// =============================================================================================
// #630 (round-6 review, findings [0]/[2]) — TWO PEOPLE, TOLD APART, ON THE AUDIT SURFACE.
//
// 0184 §A made `clara.accounting_work.initiator` MUTABLE: `clara.take_over_accounting_work` moves
// it to the colleague who takes responsibility, and the immutable "who asked" moved to
// `initiated_by`. `get_activity_event`'s operation_receipt arm projects all three (0184:2350), and
// until this round the Sheet rendered only `initiator` under a label reading "Initiator" — so a
// receipt from a Work that had been handed over told every reader that the TAKER had asked for the
// posting, and the person who actually asked appeared nowhere on the firm's only firm-wide
// history surface.
//
// THE PAIR IS UNCONDITIONAL, and that is the pinned decision. `work-detail.tsx` shows
// "Responsible now" only when it has MOVED, which is right for a page that already names who
// asked; this is an audit record, where "who asked" must be STATED rather than inferred from the
// absence of a second row. Two lines always, equal or not.
// =============================================================================================

const RECEIPT_ID = "0e17f24c-9d2b-4a53-8f61-2b7c9f0a1d34";
const ASKED = "ab56fe9f-1111-4111-8111-111111111111";
const TOOK_OVER = "bbf06337-2222-4222-8222-222222222222";

function ReceiptRowHarness() {
  const [event, setEvent] = useState<{ source: ActivitySource; id: string } | null>(null);
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { type: "button", id: "row-open-button", onClick: () => setEvent({ source: "operation_receipt", id: RECEIPT_ID }) },
      "Open row",
    ),
    createElement(ActivityEventSheet, {
      event,
      onOpenChange: (open: boolean) => { if (!open) setEvent(null); },
      memberNames: NO_MEMBERS,
    }),
  );
}

/** The operation_receipt arm's detail, as 0184:2341-2350 projects it. */
function receiptDetail(extra: Record<string, unknown>) {
  return {
    id: RECEIPT_ID, source: "operation_receipt", event_type: null,
    description: "An operation was committed.", client_id: null, client_name: null,
    actor: TOOK_OVER, on_behalf_of: TOOK_OVER, via_wake_kind: null,
    occurred_at: "2026-06-01T00:00:00Z", object_kind: "entry", object_id: "e1",
    work_id: "9c0f1d2e-3333-4333-8333-333333333333", receipt_id: RECEIPT_ID, document_id: null,
    original_entry_id: null, replacement_entry_id: null, status: "approved", kind: "work",
    purpose: "post_journal_entry", basis_origin: "user_direct",
    ...extra,
  };
}

async function openReceipt(detail: Record<string, unknown>): Promise<string> {
  let rendered = "";
  await withMockedEnv(
    async (url) => {
      const u = String(url);
      if (u.includes("get_activity_event")) return jsonResponse(detail);
      throw new Error(`unexpected fetch ${u}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(ReceiptRowHarness)) as never);
      const body = (globalThis as unknown as { document: { body: StubNode & { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container as unknown as StubNode);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const rowButton = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Open row");
        await h.act(async () => { await clickButton(rowButton as never); });
        for (let i = 0; i < 5; i++) await h.settle();
        rendered = textOf(body as never);
      } finally {
        await h.unmount();
      }
    },
  );
  return rendered;
}

test("ActivityEventSheet: a HANDED-OVER Work's receipt names who asked AND who is responsible", async () => {
  const text = await openReceipt(receiptDetail({
    initiator: TOOK_OVER, responsible: TOOK_OVER, initiated_by: ASKED,
  }));

  assert.match(text, /Initiated by/, "the person who ASKED is a labelled fact on the audit surface");
  assert.match(text, /Responsible/, "…and so is the person the Work now runs as");
  assert.doesNotMatch(text, /Initiator/,
    "the old label is retired: after 0184 §A it named the TAKER, so 'Initiator' asserted the one "
    + "thing this row cannot claim");

  // `MemberName` falls back to a shortened raw id when no resolver knows the user (NO_MEMBERS
  // here), which is what makes the two humans distinguishable in this harness at all.
  assert.match(text, new RegExp(ASKED.slice(0, 8)),
    "the human who asked appears on the record — before this round they appeared nowhere");
  assert.match(text, new RegExp(TOOK_OVER.slice(0, 8)),
    "…beside the human who took responsibility");
});

test("ActivityEventSheet: a Work nobody took over still renders BOTH lines, naming the same person twice", async () => {
  const text = await openReceipt(receiptDetail({
    initiator: ASKED, responsible: ASKED, initiated_by: ASKED,
  }));

  assert.match(text, /Initiated by/, "the pair is unconditional: an audit row STATES who asked");
  assert.match(text, /Responsible/,
    "…and states who is answerable, rather than making the reader infer 'nobody took it over' "
    + "from a row that is not there");
});

test("ActivityEventSheet: a receipt with no Work behind it renders neither line", async () => {
  // `get_activity_event` LEFT JOINs clara.accounting_work, so a receipt with no work_id carries
  // all three keys as null. Two labelled rows over two blanks would be the surface inventing a
  // provenance it was not given.
  const text = await openReceipt(receiptDetail({
    work_id: null, initiator: null, responsible: null, initiated_by: null,
  }));

  assert.doesNotMatch(text, /Initiated by/, "no Work, no provenance pair");
  assert.doesNotMatch(text, /Responsible/, "no Work, no provenance pair");
});
