// #842 — THE ADJUSTMENT HISTORY DISCLOSURE's particulars loop renders every stored basis key
// VERBATIM, but "verbatim" still means the house money component for a cents-typed key: the
// same row's `amount_cents` already renders through `Money`, so a stated `settled_cents` (#797)
// showing up as a raw minor-unit integer string is the same figure told two different ways in
// one disclosure. An ABSENT `settled_cents` (`null`) already renders nothing for that key — the
// particulars filter drops null/undefined/empty before the loop ever sees it (commit `8a06138a`,
// one day before migration 0212) — and this file's second cell guards that half so a future edit
// cannot regress it silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { PeriodicAdjustmentsTable } from "./periodic-adjustments-table";
import type { PeriodicAdjustmentRow } from "../../lib/work/periodic-adjustment-reads";

enableDomInspection();

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function row(basis: Record<string, unknown>): PeriodicAdjustmentRow {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    work_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    logical_op_id: "op-842-1",
    purpose: "payroll_obligation",
    period_start: "2026-07-01",
    period_end: "2026-07-31",
    basis,
    amount_cents: 500000,
    currency: "MYR",
    entry_id: "11111111-1111-4111-8111-111111111111",
    entry_status: "posted",
    posting_date: "2026-08-01",
    reversed_by: null,
    receipt_id: "rcpt-842-1",
    source_document_id: null,
    corrects_adjustment_id: null,
    corrected_by_adjustment_id: null,
    recorded_by: "22222222-2222-4222-8222-222222222222",
    on_behalf_of: CLIENT,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function app(node: ReactElement) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: node });
}

test("842.stated — a payroll row's stated settled_cents renders through the money component, like amount_cents", async () => {
  const h = await renderComponent(
    app(
      createElement(PeriodicAdjustmentsTable, {
        clientId: CLIENT,
        load: async () => [row({ obligation_kind: "epf", settled_cents: 150050 })],
      }),
    ),
  );
  try {
    for (let i = 0; i < 6; i++) await h.settle();
    const text = h.text();
    assert.match(text, /RM\s*1,500\.50/, "settled_cents renders as formatted money, exactly as amount_cents does");
    assert.doesNotMatch(text, /\b150050\b/, "the raw minor-unit integer never renders");
  } finally {
    await h.unmount();
    for (let i = 0; i < 3; i++) await h.settle();
  }
});

test("842.absent — a null settled_cents still renders nothing for that key (the half that already worked)", async () => {
  const h = await renderComponent(
    app(
      createElement(PeriodicAdjustmentsTable, {
        clientId: CLIENT,
        load: async () => [row({ obligation_kind: "epf", settled_cents: null })],
      }),
    ),
  );
  try {
    for (let i = 0; i < 6; i++) await h.settle();
    const text = h.text();
    assert.doesNotMatch(text, /settled_cents/, "a null particular is filtered out before the loop, key included");
  } finally {
    await h.unmount();
    for (let i = 0; i < 3; i++) await h.settle();
  }
});
