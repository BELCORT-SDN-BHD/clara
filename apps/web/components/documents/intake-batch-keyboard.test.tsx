// #636 — KEYBOARD AND FOCUS RETURN on the batch card.
//
// AC6's two cells that only a mounted card can answer: a person who acts on a child row must land
// back INSIDE the table rather than at the top of the document, and a person who opens the cancel
// dialog must land back on the control they opened it from. A dialog that closes into the void is
// where keyboard users lose their place, and a row action that drops focus to `body` makes a
// forty-row batch unusable without a mouse.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkKeyboardWalk, focusableElements, positiveTabIndexElements } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import { IntakeBatchCard, type IntakeBatchCardState } from "./intake-batch-card";
import { toIntakeBatchPack } from "../../lib/documents/intake-batch";

enableDomInspection();

type Stub = Record<string, unknown>;

const BATCH = "b1111111-1111-4111-8111-111111111111";
const CLIENT = "c1111111-1111-4111-8111-111111111111";

const READY: IntakeBatchCardState = {
  kind: "ready",
  pack: toIntakeBatchPack(BATCH, {
    computed_at: "2026-04-05T02:00:00Z",
    preview_limit: 10,
    batch: { id: BATCH, label: "April sources", origin: "documents_tab", state: "open", opened_by: "u1", opened_at: "2026-04-05T01:00:00Z", cancel_requested_at: null },
    facets: {
      admitted: { status: "ok", count: 2, coverage: "ok", coverage_reason: null, rows: [
        { member_id: "m1", work_id: "w1", client_id: CLIENT, document_id: "d1", work_status: "running", created_at: "2026-04-05T01:10:00Z" },
        { member_id: "m2", work_id: "w2", client_id: CLIENT, document_id: "d2", work_status: "queued", created_at: "2026-04-05T01:11:00Z" },
      ] },
      settled: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, uncounted_completions: 0, rows: [] },
      waiting: { status: "ok", count: 1, coverage: "ok", coverage_reason: null, rows: [
        { member_id: "m3", intake_id: "i3", document_id: "d3", filename: "receipt.pdf", dependency: "awaiting_fact", dependency_reason: "which client?", has_open_question: true, created_at: "2026-04-05T01:12:00Z" },
      ] },
      failed: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
      unassigned: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
    },
    waiting_basis: { by_question: 1, by_dependency: { awaiting_fact: 1, awaiting_attribution: 0, awaiting_capacity: 0 }, by_unfiled: 1, by_capacity_failure: 0 },
    capacity: { window: "utc_day", resets_at_local: "08:00", timezone: "Asia/Kuala_Lumpur" },
  }),
};

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

async function mount() {
  const h = await renderComponent(App(createElement(
    "div", null,
    createElement("h1", null, "Documents"),
    createElement(IntakeBatchCard, {
      state: READY, clientId: CLIENT, facet: "all", onFacetChange: () => {}, onRefresh: () => {},
    } as never),
  )));
  for (let i = 0; i < 2; i += 1) await h.settle();
  return h;
}

function collect(root: Stub, out: Stub[] = []): Stub[] {
  out.push(root);
  for (const c of ((root.childNodes as Stub[] | undefined) ?? [])) collect(c, out);
  return out;
}
const attrOf = (n: Stub, name: string): string | null =>
  (typeof n.getAttribute === "function" ? (n.getAttribute as (k: string) => string | null)(name) : null);
const bodyNode = (): Stub => (globalThis as unknown as { document: { body: Stub } }).document.body;
function findIn(root: Stub, predicate: (n: Stub) => boolean): Stub | null {
  if (predicate(root)) return root;
  for (const c of ((root.childNodes as Stub[] | undefined) ?? [])) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

test("intake batch card: no keyboard-walk violations, and no positive tabindex anywhere", async () => {
  const h = await mount();
  assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  assert.deepEqual(positiveTabIndexElements(h.container as never), [],
    "a positive tabindex would reorder the whole page's tab sequence around this card");
  await h.unmount();
});

test("intake batch card: every control and every row link is reachable by keyboard", async () => {
  const h = await mount();
  const focusables = focusableElements(h.container as never);
  assert.ok(focusables.length >= 8,
    `the five facet toggles, Refresh, Stop and the row links are all reachable (${focusables.length})`);
  await h.unmount();
});

test("FOCUS RETURNS INTO THE TABLE after a child row acts — never to the top of the document", async () => {
  const h = await mount();
  const nodes = collect(h.container as Stub);
  const link = nodes.find((n) => n.tagName === "A" && String(attrOf(n, "href") ?? "").includes("/work/w1")) as Stub;
  assert.ok(link, "the first child row carries its own address");
  // The row refs are registered with `tabIndex={-1}` precisely so focus can be PUT there
  // programmatically without adding them to the tab sequence (`upload-panel.tsx`'s rowRefs idiom).
  const rows = nodes.filter((n) => n.tagName === "TR" && attrOf(n, "tabindex") === "-1");
  assert.ok(rows.length >= 3, `every rendered child row is a focus TARGET (${rows.length}), without joining the tab order`);
  // The card puts focus back with the `upload-panel.tsx` rowRefs idiom. Observe the CALL rather
  // than the stub DOM's focus bookkeeping: what must be true is that acting on a row asks a ROW
  // for focus, not that this harness's `document.activeElement` tracks it.
  let focusedRow: Stub | null = null;
  for (const row of rows) (row as Record<string, unknown>).focus = () => { focusedRow = row; };
  await clickButton(link as never);
  for (let i = 0; i < 2; i += 1) await h.settle();
  assert.ok(focusedRow !== null,
    "after a child row acts, focus is put back INSIDE the table — not on <body> and not on the page heading");
  assert.equal((focusedRow as unknown as Stub).tagName, "TR");
  await h.unmount();
});

test("FOCUS RETURNS TO THE TRIGGER when the cancel dialog closes", async () => {
  const h = await mount();
  const trigger = findIn(h.container as Stub, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Stop this batch") as Stub;
  assert.ok(trigger, "the Stop control renders on a client-scoped mount");
  let focused = false;
  (trigger as Record<string, unknown>).focus = () => { focused = true; };
  await clickButton(trigger as never);
  for (let i = 0; i < 3; i += 1) await h.settle();
  const dismiss = findIn(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Keep going") as Stub;
  assert.ok(dismiss, "the dialog opened, with the SAFE action present");
  await clickButton(dismiss as never);
  for (let i = 0; i < 3; i += 1) await h.settle();
  assert.equal(focused, true, "closing the dialog returns focus to the control that opened it");
  await h.unmount();
});

test("the FIRM-LEAF mount (clientId null) still reaches Stop, and its trigger is focusable", async () => {
  // FIX ROUND 1 (STANDARDS `firm-leaf-cancel-unreachable`). This cell used to assert the OPPOSITE
  // — that the firm leaf offers no Stop — which is how the inversion survived review: the brief
  // and the component's own prop comment both said "read-only APART FROM CANCEL", and the
  // `readOnly` flag gated that one button and nothing else. The flag is gone; the two mounts
  // differ by `clientId` alone.
  const h = await renderComponent(App(createElement(IntakeBatchCard, {
    state: READY, clientId: null, facet: "all", onFacetChange: () => {}, onRefresh: () => {},
  } as never)));
  for (let i = 0; i < 2; i += 1) await h.settle();
  const trigger = findIn(h.container as Stub, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Stop this batch");
  assert.ok(trigger, "the one act a firm-wide board needs is reachable from it");
  assert.notEqual((trigger as Stub).tabIndex, -1, "…and by keyboard, like every other control here");
  await h.unmount();
});
