// #938/#942 — the `accrual_bill_conflict` inline needs-you act, under test.
//
// The lane shipped this affordance covered only by the browser walk, and three review findings
// landed on exactly what a walk over ONE happy row cannot see. Each cell below names one:
//
//   1. SPEC-01 / SPEC-06 — AC2 asks BOTH surfaces to render "the accrual, THE BILL and the period
//      named". The inbox row rendered neither the document nor the period nor the side; only the
//      Accruals page did. The inbox is where a firm-wide reader meets this item first.
//   2. ADV-02 — "skip this period's next occurrence" is a FORWARD-looking remedy: it cannot
//      un-post an accrual that already stands, so the flagged period keeps both amounts and keeps
//      its row. The surface has to say so, or a person clicks it and reads the unchanged row as a
//      failure.
//   3. ADV-03 — both remedies are plan-lane doors that refuse a plan which is not active. The row
//      must not go away (the double count has not), so the buttons go away and the reason arrives
//      in their place: a control whose only possible outcome is a refusal is not offered.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { AccrualBillConflictAffordance } from "./accrual-bill-conflict-affordance";
import type { ReviewQueueRow } from "@/lib/firm/needs-you";

type Stub = { tagName?: string } & Record<string, unknown>;

enableDomInspection();

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENTRY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function row(over: Partial<ReviewQueueRow> = {}): ReviewQueueRow {
  return {
    row_kind: "accrual_bill_conflict", section: "needs_you", client_id: CLIENT,
    counterparty_id: null, filing_id: null, entry_id: ENTRY, question_id: null,
    task_id: null, document_id: null, lane: "needs_you", auto: false, rule_backed: false,
    high_stakes: false, aged_since: null, amount_cents: 120000, period: "2026-07-31",
    question_text: "A document-sourced entry posted inside the accrued period 2026-07-01 to 2026-07-31 for \"Monthly office rent\"",
    created_at: "2026-08-01T00:00:00Z", id: PLAN,
    coding_kind: null, watch_id: null, tier: null, finding_id: null,
    asset_id: null, advance_id: null,
    client_name: null, batch_ids: null, open_proposal_count: null, authority_id: null,
    accrual_side: "expense", accrual_plan_status: "active",
    ...over,
  } as ReviewQueueRow;
}

function App(over: Partial<ReviewQueueRow> = {}) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(AccrualBillConflictAffordance, {
      row: row(over), busy: false, error: null, act: async () => true,
    }),
  });
}

/** The harness offers `find` (first match) alone; a claim about WHICH controls are offered needs
 *  every match, so this walks the mounted tree the way `find` does. */
function collect(node: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  if (predicate(node)) out.push(node);
  for (const c of ((node as { childNodes?: Stub[] }).childNodes ?? [])) out.push(...collect(c, predicate));
  return out;
}

const buttons = (h: Awaited<ReturnType<typeof renderComponent>>) =>
  collect(h.container, (n) => n.tagName === "BUTTON").map((n) => textOf(n));

const links = (h: Awaited<ReturnType<typeof renderComponent>>) =>
  collect(h.container, (n) => n.tagName === "A").map((n) => ({
    href: (n as { getAttribute?: (a: string) => string | null }).getAttribute?.("href") ?? "",
    text: textOf(n),
  }));

test("AccrualBillConflictAffordance: the inbox item names the document, the flagged period and the side — not only the sentence (SPEC-01, SPEC-06)", async () => {
  const h = await renderComponent(App());
  try {
    const link = links(h).find((l) => l.text.includes("View the document"));
    assert.ok(link, `the inbox row links to the document that collided (got ${JSON.stringify(links(h))})`);
    assert.match(link.href, new RegExp(`entry=${ENTRY}`),
      "…at the journal entry the row names, never a bare journals tab");
    assert.match(h.text(), /Accrued period: 2026-07-31/,
      "the period is the flagged occurrence's own due date, the value both remedies send back");
    assert.match(h.text(), /Expense accrual/, "…and which way the accrual it flags runs");
  } finally {
    await h.unmount();
  }
});

test("AccrualBillConflictAffordance: a revenue accrual's item says revenue — the inbox is two-sided too (ADV-06)", async () => {
  const h = await renderComponent(App({ accrual_side: "revenue" }));
  try {
    assert.match(h.text(), /Revenue accrual/);
    assert.doesNotMatch(h.text(), /Expense accrual/);
  } finally {
    await h.unmount();
  }
});

test("AccrualBillConflictAffordance: the two remedies say what each one settles, so a skip that leaves this period flagged is not read as a failure (ADV-02)", async () => {
  const h = await renderComponent(App());
  try {
    assert.deepEqual(buttons(h), ["Reverse now", "Skip this period's next occurrence"]);
    assert.match(h.text(), /Reverse now settles this period/);
    assert.match(h.text(), /Skipping affects the NEXT period only/);
  } finally {
    await h.unmount();
  }
});

test("AccrualBillConflictAffordance: once the plan is ended the item stays but offers no control whose only outcome is a refusal — it gives the reason instead (ADV-03)", async () => {
  const h = await renderComponent(App({ accrual_plan_status: "ended" }));
  try {
    assert.deepEqual(buttons(h), [], "neither plan-lane door can succeed, so neither is offered");
    assert.match(h.text(), /This plan has ended, so neither remedy is available/);
    assert.match(h.text(), /journal entry of its own/, "…and says what a bookkeeper can still do");
    // The item itself is NOT hidden: the double count it names is still on the books.
    assert.match(h.text(), /Accrued period: 2026-07-31/);
  } finally {
    await h.unmount();
  }
});

test("AccrualBillConflictAffordance: a paused plan reads as paused, not as ended (ADV-03)", async () => {
  const h = await renderComponent(App({ accrual_plan_status: "paused" }));
  try {
    assert.deepEqual(buttons(h), []);
    assert.match(h.text(), /This plan is paused, so neither remedy is available/);
  } finally {
    await h.unmount();
  }
});
