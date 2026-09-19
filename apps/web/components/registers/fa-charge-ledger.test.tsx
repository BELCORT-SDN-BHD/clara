// #651 — the immutable charge ledger, driven through its real render states.
//
// WHAT EACH CELL PINS:
//   ledger.rows        every charge renders with its period, its exact cents, the date it took
//                      effect and a link to the journal entry it posted.
//   ledger.unwind      an unwinding row is LABELLED and the row it unwound is STRUCK THROUGH —
//                      both stay visible, because clara.fa_depreciation is append-only and a
//                      correction is a ROW, never an erasure.
//   ledger.empty       two empty states, told apart: "nothing charged yet" and "nothing charged yet
//                      BECAUSE the particulars are still outstanding" are different facts, and only
//                      one of them says what to do next.
//   ledger.narrow      the 320px reading strategy (appendix D row 57): the period cell WRAPS and
//                      the entry id truncates with the full value on its title, so no column is
//                      clipped silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { FaChargeLedger, faUnwoundChargeIds } from "./fa-charge-ledger";
import { intlApp, faCharge, findAll, tid, attr, FA_CLIENT } from "./fa-depreciation-test-fixtures";

enableDomInspection();

const render = (charges: unknown[], particularsComplete = true) =>
  renderComponent(intlApp(createElement(FaChargeLedger, {
    clientId: FA_CLIENT, charges: charges as never, particularsComplete,
  })));

test("ledger.rows every charge renders its period, exact cents, effective date and a link to the entry it posted", async () => {
  const h = await render([
    faCharge(),
    faCharge({ id: "ch-2", period_start: "2026-04-01", period_end: "2026-04-30", amount_cents: 10000, effective_date: "2026-04-30", entry_id: "e-4444" }),
  ]);
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const rows = findAll(h.container as never, (n) => n.tagName === "TR" && tid(n).startsWith("fa-charge-row-"));
    assert.equal(rows.length, 2);
    // Oldest period first — a ledger is read forwards.
    assert.equal(tid(rows[0]!), "fa-charge-row-ch-1");
    const text = h.text();
    assert.match(text, /2026-03-01/, "the period start");
    assert.match(text, /2026-03-31/, "…and end");
    assert.match(text, /100\.00/, "EXACT minor units, from the DB's own figure");
    const link = h.find((n) => n.tagName === "A" && textOf(n).includes("e-2222".slice(0, 8)));
    assert.ok(link, "the charge links the journal entry it posted");
    const href = attr(link as never, "href");
    assert.match(String(href), /\/journals\?tab=posted&entry=e-2222/,
      "…through the journals workbench's own URL state, not a bare list");
  } finally {
    await h.unmount();
  }
});

test("ledger.unwind an unwinding row is LABELLED and the row it unwound is STRUCK THROUGH — neither is removed", async () => {
  const h = await render([
    faCharge(),
    faCharge({ id: "ch-u", amount_cents: 10000, effective_date: "2026-05-15", entry_id: "e-5555", unwind_of: "ch-1" }),
  ]);
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const rows = findAll(h.container as never, (n) => n.tagName === "TR" && tid(n).startsWith("fa-charge-row-"));
    assert.equal(rows.length, 2, "BOTH rows render — an append-only ledger never erases");
    const original = rows.find((r) => tid(r) === "fa-charge-row-ch-1")!;
    const unwind = rows.find((r) => tid(r) === "fa-charge-row-ch-u")!;
    assert.equal(attr(original as never, "data-unwound"), "true",
      "the row that WAS unwound is marked, and its cells carry the strike-through class");
    assert.match(textOf(original), /Unwound/);
    assert.match(textOf(unwind), /Unwinding/, "…and the row that DID the unwinding says so");
    assert.equal(attr(unwind as never, "data-unwound"), null);

    const struck = findAll(original as never, (n) => String(attr(n as never, "class") ?? "").includes("line-through"));
    assert.ok(struck.length >= 1, "the unwound figure is struck through, not merely labelled");
  } finally {
    await h.unmount();
  }

  assert.deepEqual([...faUnwoundChargeIds([faCharge(), faCharge({ id: "ch-u", unwind_of: "ch-1" })] as never)], ["ch-1"]);
});

test("ledger.empty the two empty states are told apart, and only one of them says what to do next", async () => {
  const complete = await render([], true);
  try {
    for (let i = 0; i < 3; i++) await complete.settle();
    assert.match(complete.text(), /No depreciation has been charged for this asset yet\./);
    assert.doesNotMatch(complete.text(), /particulars/i);
  } finally {
    await complete.unmount();
  }

  const blocked = await render([], false);
  try {
    for (let i = 0; i < 3; i++) await blocked.settle();
    assert.match(blocked.text(), /because this asset's depreciation particulars are still outstanding/i,
      "an asset that CANNOT be charged yet says WHY — 'no charges' and 'no charges yet, because…' are different facts");
  } finally {
    await blocked.unmount();
  }
});

test("ledger.narrow the 320px reading strategy: the period wraps and the entry id truncates with the full value reachable", async () => {
  const h = await render([faCharge()]);
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const row = h.find((n) => n.tagName === "TR" && tid(n).startsWith("fa-charge-row-"));
    const wrapping = findAll(row as never, (n) => String(attr(n as never, "class") ?? "").includes("whitespace-normal"));
    assert.ok(wrapping.length >= 1,
      "the period cell WRAPS rather than clipping — appendix D row 57 preserves the reading strategy on a narrow screen");
    const link = h.find((n) => n.tagName === "A");
    assert.equal(attr(link as never, "title"), "e-2222",
      "…and the truncated id keeps its full value on the row, so nothing is lost, only shortened");
    assert.equal(textOf(link!), "e-2222".slice(0, 8));
  } finally {
    await h.unmount();
  }
});
