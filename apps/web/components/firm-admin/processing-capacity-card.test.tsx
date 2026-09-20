// #960 — the processing-capacity card, now that the firm can SET its four caps.
//
// The card is presentational: it holds the four fields and hands an EDIT SET to the `save`
// function its parent gives it. The parent (`FirmSettingsPanelView`) owns the door call and the
// re-read, exactly as it already owns the three reads — so what these cells drive is the card's
// own contract, and the stub `save` records what it was handed.
//
// WHO SEES THE CONTROL. The card renders it when, and only when, the ADMIN-FLOORED read behind
// it answered (`view.status === "ready"`). That is not a client-side rank guess: the figures and
// the control come from the same `clara.get_firm_commercial_state` answer, whose own floor is
// `clara._human_ctx(clara.role_rank('admin'))` — and the door re-derives that floor for itself,
// so a viewer who somehow reached the control would still meet the database's CLR04.
//
// AXE LIVES IN `firm-settings-a11y.test.tsx`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { ProcessingCapacityCard } from "./processing-capacity-card";
import type { ProcessingCapEdits, SetProcessingCapsOutcome } from "../../lib/firm/capacity-doors";
import type { FirmCommercialState } from "../../lib/firm/commercial-reads";
import type { FirmSettingsView } from "./firm-settings-view";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const CAPS = {
  docsPerDay: 250, pagesPerDay: 2500, ocrConcurrency: 3, llmWitnessConcurrency: 4,
};

function state(capacity: FirmCommercialState["capacity"]): FirmCommercialState {
  return {
    firm: { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Tan & Partners", createdAt: "2026-01-02T00:00:00.000Z", isOperator: false },
    plan: { localKey: "clara-beta-2026", name: "Clara Beta", currency: "MYR", amountCents: 0, amountsRuled: false },
    payment: { recorded: false, recordedAt: null, subscriptionPresent: false, customerPresent: false },
    invoices: { available: false, reason: "not_collected" },
    capacity,
  };
}

const STORED = state({ ...CAPS, source: "firm_document_limits" });
const NO_ROW = state({
  docsPerDay: null, pagesPerDay: null, ocrConcurrency: null, llmWitnessConcurrency: null,
  source: "firm_document_limits",
});

const ACCEPTED: SetProcessingCapsOutcome = {
  kind: "set",
  caps: { ...CAPS, pagesPerDay: 3000 },
  previous: { ...CAPS },
  changed: ["pagesPerDay"],
  created: false,
};

async function mount(
  view: FirmSettingsView<FirmCommercialState>,
  save?: (edits: ProcessingCapEdits) => Promise<SetProcessingCapsOutcome>,
) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(ProcessingCapacityCard, { view, save }),
    }),
  );
}

const fieldFor = (h: { find: (p: (n: Stub) => boolean) => Stub | null }, cap: string) =>
  h.find((n) => n.tagName === "INPUT" && n.id === `firm-capacity-${cap}`);

const saveButton = (h: { find: (p: (n: Stub) => boolean) => Stub | null }) =>
  h.find((n) => n.tagName === "BUTTON" && /save processing caps/i.test(textOf(n)));

test("ticket 960 — the card renders one field per cap, pre-filled from the stored numbers", async () => {
  const h = await mount({ status: "ready", data: STORED }, async () => ACCEPTED);
  try {
    assert.equal(fieldFor(h, "docs-per-day")?.value, "250");
    assert.equal(fieldFor(h, "pages-per-day")?.value, "2500");
    assert.equal(fieldFor(h, "ocr-concurrency")?.value, "3");
    assert.equal(fieldFor(h, "llm-witness-concurrency")?.value, "4");
    assert.ok(saveButton(h), "the owner/admin gets a working control");
  } finally { await h.unmount(); }
});

test("ticket 960 — a firm with no stored row keeps its NAMED ZERO and still gets empty fields to write into", async () => {
  const h = await mount({ status: "ready", data: NO_ROW }, async () => ACCEPTED);
  try {
    // The named zero, unchanged by #960: the card never pre-fills the relation's first-insert
    // values, because a number nobody stored is not this firm's cap.
    assert.match(h.text(), /No per-firm processing caps are recorded for this firm/);
    assert.equal(fieldFor(h, "docs-per-day")?.value, "");
    assert.equal(fieldFor(h, "pages-per-day")?.value, "");
    assert.ok(saveButton(h), "…and the first write is still reachable from here");
  } finally { await h.unmount(); }
});

test("ticket 960 — a denied or still-loading read renders NO control at all", async () => {
  for (const view of [
    { status: "denied", message: "insufficient role" } as FirmSettingsView<FirmCommercialState>,
    { status: "loading" } as FirmSettingsView<FirmCommercialState>,
    { status: "failed", message: "CLR13: busy" } as FirmSettingsView<FirmCommercialState>,
  ]) {
    const h = await mount(view, async () => ACCEPTED);
    try {
      assert.equal(saveButton(h), null, `${view.status}: no control`);
      assert.equal(fieldFor(h, "docs-per-day"), null, `${view.status}: no field`);
    } finally { await h.unmount(); }
  }
});

test("ticket 960 — saving sends ONLY the caps the person actually changed", async () => {
  const seen: ProcessingCapEdits[] = [];
  const h = await mount({ status: "ready", data: STORED }, async (edits) => {
    seen.push(edits);
    return ACCEPTED;
  });
  try {
    await h.act(() => { setFieldValue(fieldFor(h, "pages-per-day") as Stub, "3000"); });
    await clickButton(saveButton(h) as Stub);
    await h.settle();
    // ONE cap, not four. A field the person never touched is not an instruction, and re-sending
    // it would clobber whatever another admin changed since this page's read.
    assert.deepEqual(seen, [{ pagesPerDay: 3000 }]);
  } finally { await h.unmount(); }
});

test("ticket 960 — an accepted save reports the resulting four caps; a refusal renders the database's own sentence", async () => {
  const h = await mount({ status: "ready", data: STORED }, async () => ACCEPTED);
  try {
    await h.act(() => { setFieldValue(fieldFor(h, "pages-per-day") as Stub, "3000"); });
    await clickButton(saveButton(h) as Stub);
    await h.settle();
    const text = h.text();
    for (const n of ["250", "3,000", "3", "4"]) {
      assert.ok(text.includes(n), `the receipt states every resulting cap -- missing ${n} in ${text}`);
    }
  } finally { await h.unmount(); }

  const refused = await mount({ status: "ready", data: STORED }, async () => ({
    kind: "refused",
    code: "CLR10",
    reason: "cap_above_ceiling",
    message: "docs_per_day may not exceed the estate ceiling of 10000",
  }));
  try {
    await refused.act(() => { setFieldValue(fieldFor(refused, "docs-per-day") as Stub, "99999"); });
    await clickButton(saveButton(refused) as Stub);
    await refused.settle();
    // VERBATIM. The ceiling refusal is the only place this build learns the number, so it is
    // rendered as the database wrote it and never re-worded into a house string.
    assert.match(refused.text(), /docs_per_day may not exceed the estate ceiling of 10000/);
    assert.match(refused.text(), /CLR10/, "and the code travels with it");
  } finally { await refused.unmount(); }
});
