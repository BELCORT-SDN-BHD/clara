// #635 — the plan/payment card, mounted, with the two things it must never do.
//
// AXE LIVES IN `firm-settings-a11y.test.tsx` (a card mounted alone starts at h2 with no h1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { CommercialStateCard } from "./commercial-state-card";
import type { FirmCommercialState } from "../../lib/firm/commercial-reads";
import type { FirmSettingsView } from "./firm-settings-view";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function state(over: Partial<FirmCommercialState> = {}): FirmCommercialState {
  return {
    firm: { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Tan & Partners", createdAt: "2026-01-02T00:00:00.000Z", isOperator: false },
    plan: { localKey: "clara-beta-2026", name: "Clara Beta", currency: "MYR", amountCents: 0, amountsRuled: false },
    payment: { recorded: false, recordedAt: null, subscriptionPresent: false, customerPresent: false },
    invoices: { available: false, reason: "not_collected" },
    capacity: { docsPerDay: null, pagesPerDay: null, ocrConcurrency: null, llmWitnessConcurrency: null, source: "firm_document_limits" },
    ...over,
  };
}

async function mount(view: FirmSettingsView<FirmCommercialState>) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(CommercialStateCard, { view, onRetry: () => {} }),
    }),
  );
}

/** A number in a money position, in ANY of the shapes this product spells one. */
const MONEY_RE = /(RM|MYR|USD)\s?[\d,]+(\.\d\d)?|\b\d+\.\d\d\b/;

function manageBilling(h: { find: (p: (n: Stub) => boolean) => Stub | null }): boolean {
  return h.find((n) => (n.tagName === "BUTTON" || n.tagName === "A") && /manage billing/i.test(textOf(n))) !== null;
}

test("p635.web.no_numeral_when_unruled an UNRULED plan renders the FACT and not one numeral anywhere on the card", async () => {
  const h = await mount({ status: "ready", data: state() });
  try {
    const text = h.text();
    assert.match(text, /Beta — no price has been set for this plan yet/);
    assert.doesNotMatch(text, MONEY_RE,
      "never RM 0.00 and never a substitute figure: amounts_ruled=false is the DATABASE saying the price is not set (C-01 / C-56)");
    assert.doesNotMatch(text, /\bRM\b/, "…and not even the currency, which would imply a figure was withheld rather than never set");
  } finally { await h.unmount(); }
});

test("p635.web.ruled_plan_shows_its_figure with NO code change — amounts_ruled is the render condition, not a comment", async () => {
  const h = await mount({
    status: "ready",
    data: state({ plan: { localKey: "clara-2027", name: "Clara", currency: "MYR", amountCents: 19900, amountsRuled: true } }),
  });
  try {
    assert.match(h.text(), /MYR 199\.00/,
      "the same component, the same props path — only the database's own flag moved");
  } finally { await h.unmount(); }
});

test("p635.web.commercial_absent_named_zero an absent payment is a NAMED ZERO after a complete read, never an Empty", async () => {
  const h = await mount({ status: "ready", data: state() });
  try {
    const text = h.text();
    assert.match(text, /No payment is recorded for this firm/,
      "the primary branch on this estate: firm_registration_payments is empty (p635.measure.payment_row_absent)");
    assert.match(text, /No subscription is attached/);
    assert.match(text, /Clara does not collect subscription invoices for your firm/,
      "an absence with a REASON — an empty list would invite a reader to wait for rows that are not coming");
  } finally { await h.unmount(); }
});

test("p635.web.commercial_payment_recorded a recorded payment reads as a date and two booleans, and never as an identifier", async () => {
  const h = await mount({
    status: "ready",
    data: state({ payment: { recorded: true, recordedAt: "2026-02-03T08:00:00.000Z", subscriptionPresent: true, customerPresent: true } }),
  });
  try {
    const text = h.text();
    assert.match(text, /Recorded on 03 Feb 2026/, "the house calendar (Asia/Kuala_Lumpur) for an ACT's date");
    assert.match(text, /A subscription is attached to that payment/);
    assert.doesNotMatch(text, /cus_|sub_/, "no raw Stripe identifier can reach this card — the door sends booleans");
  } finally { await h.unmount(); }
});

test("p635.web.no_billing_control there is no Manage-billing control at ANY rank, and a support route instead", async () => {
  for (const view of [
    { status: "ready", data: state() } as const,
    { status: "ready", data: state({ payment: { recorded: true, recordedAt: "2026-02-03T08:00:00.000Z", subscriptionPresent: true, customerPresent: true } }) } as const,
  ]) {
    const h = await mount(view);
    try {
      assert.equal(manageBilling(h), false,
        "nothing in this estate can change a firm's commercial arrangement — a control that could only refuse is worse than none (裁-187)");
      assert.match(h.text(), /Write to support about a commercial arrangement/);
      const mailto = h.find((n) => (n as Stub).tagName === "A" && /Write to support/.test(textOf(n as Stub)));
      assert.ok(mailto, "…and the support route is a real link, not a sentence");
    } finally { await h.unmount(); }
  }
});

test("p635.web.commercial_denied_clears a CLR04 on a re-read leaves NO figure behind — the view carries no data to go stale", async () => {
  const h = await mount({ status: "ready", data: state({ plan: { localKey: "k", name: "Clara Beta", currency: "MYR", amountCents: 19900, amountsRuled: true }, payment: { recorded: true, recordedAt: "2026-02-03T08:00:00.000Z", subscriptionPresent: true, customerPresent: true } }) });
  try {
    assert.match(h.text(), /MYR 199\.00/, "the figures are on screen before the demotion");

    // The demotion lands: the panel re-reads, the door answers CLR04, and the view is REPLACED.
    await h.rerender(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        timeZone: "Asia/Kuala_Lumpur",
        children: createElement(CommercialStateCard, { view: { status: "denied", message: "insufficient role" }, onRetry: () => {} }),
      }),
    );
    const text = h.text();
    assert.doesNotMatch(text, /MYR 199\.00/, "the figures are GONE, not greyed behind a disabled control");
    assert.doesNotMatch(text, /Recorded on/);
    assert.match(text, /insufficient role/, "the database's own sentence, verbatim (0004:299-309 carries no detail.reason)");
    assert.match(text, /CLR04/);
  } finally { await h.unmount(); }
});

test("p635.web.commercial_failed offers a retry and paints no commercial state at all", async () => {
  const h = await mount({ status: "failed", message: "fetch failed" });
  try {
    const text = h.text();
    assert.match(text, /This could not be read\./);
    assert.doesNotMatch(text, /No payment is recorded/, "a failed read is not an absence, and must not be rendered as one");
    assert.ok(h.find((n) => (n as Stub).tagName === "BUTTON" && textOf(n as Stub).includes("Try again")));
  } finally { await h.unmount(); }
});
