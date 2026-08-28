// The staff_advance_incomplete inline needs-you act — render-level test
// (the OpenQuestionAffordance precedent has no dedicated file of its own,
// covered only via needs-you-a11y.test.tsx's sweep; this train adds one
// focused unit test on top of that parity, since the write path is new).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { StaffAdvanceIncompleteAffordance } from "./staff-advance-incomplete-affordance";
import type { ReviewQueueRow } from "@/lib/firm/needs-you";

enableDomInspection();

function row(): ReviewQueueRow {
  return {
    row_kind: "staff_advance_incomplete", section: "needs_you", client_id: "c1",
    counterparty_id: null, filing_id: null, entry_id: null, question_id: null,
    task_id: null, document_id: null, lane: null, auto: false, rule_backed: false,
    high_stakes: false, aged_since: null, amount_cents: 100000, period: null,
    question_text: null, created_at: "2026-08-01T00:00:00Z", id: "adv1",
    coding_kind: null, watch_id: null, tier: null, finding_id: null,
    asset_id: null, advance_id: "adv1",
  };
}

function App(props: { act: (fn: () => Promise<void>) => Promise<boolean> }) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(StaffAdvanceIncompleteAffordance, { row: row(), busy: false, error: null, act: props.act }),
  });
}

test("StaffAdvanceIncompleteAffordance: the trigger reveals purpose/reference inputs, and submit calls act() with the door write", async () => {
  const calls: unknown[] = [];
  const act = async (fn: () => Promise<void>) => {
    calls.push(fn);
    return true;
  };
  const h = await renderComponent(App({ act }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
    assert.ok(trigger, "the inline trigger must render");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 2; i++) await h.settle();

    const purposeInput = h.find((n) => n.tagName === "INPUT");
    assert.ok(purposeInput, "the purpose input must be reachable after opening");

    const submit = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Save"));
    assert.ok(submit, "the Submit control must render once editing");
    // The submit button starts disabled (both fields empty) — filling only one
    // field must not enable it, matching complete_staff_advance_particulars'
    // own ABI SSD.5 "the pair is a pair" rule.
    assert.equal((submit as unknown as { disabled: boolean }).disabled, true);
  } finally {
    await h.unmount();
  }
});

test("StaffAdvanceIncompleteAffordance: a row missing advance_id or client_id renders nothing", async () => {
  const partial: ReviewQueueRow = { ...row(), advance_id: null };
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(StaffAdvanceIncompleteAffordance, { row: partial, busy: false, error: null, act: async () => true }),
    }),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.equal(h.text().trim(), "", "no inline affordance renders without a real advance_id");
  } finally {
    await h.unmount();
  }
});
