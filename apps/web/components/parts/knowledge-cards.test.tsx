// The governed-knowledge receipt card (#644, minted by chatTurn_v19), one component-harness test
// per property the card claims.
//
// THE ASSERTION SHAPE — "the wire body, rendered", the same property
// `v14-receipt-cards.test.tsx` established and for the same reason: the runtime declares a kind
// (`packages/runtime/workflows/chatTurn.v19.parts.ts`) and this app is its READER, so the failure
// worth catching is a declared kind reaching a transcript and painting the "Unsupported part"
// warning chip. Every test here asserts the wire's own values appear AND that the fallback chip
// does not.
//
// AND WHAT MUST NOT APPEAR. The card carries no value, no trust and no state, deliberately — a
// knowledge record is correctable and withdrawable while a transcript stays on screen forever
// (../KnowledgeCards.tsx's header). A future hand that "improved" the card by printing the value
// reds the last test in this file.
//
// INSTRUMENT: test/hookHarness.ts's `renderComponent` (a real react-dom/client mount) plus
// test/domInspect.ts, which is what makes `getAttribute("href")` readable — hookHarness's own
// `setAttribute` is a no-op, so an href assertion without domInspect would silently pass against
// nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "./PartRenderer";
import type { ClaraPart, KnowledgeReceiptPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function App(part: ClaraPart): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(PartRenderer, { part }),
  });
}

/** Every <a href> the card rendered, in document order. */
function hrefs(h: { container: Stub }): string[] {
  const out: string[] = [];
  const walk = (n: Stub) => {
    if (n.tagName === "A") {
      const href = (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of ((n.childNodes as Stub[] | undefined) ?? [])) walk(c);
  };
  walk(h.container);
  return out;
}

// Wire body per packages/runtime/workflows/chatTurn.v19.parts.ts, field for field.
const CAPTURED: KnowledgeReceiptPart = {
  type: "knowledge_receipt",
  record_id: "7c1f0a20-record",
  client_id: "9b71cc40-client",
  knowledge_key: "trade_nature",
  knowledge_version: "7",
  revision_kind: "capture",
};

test("knowledge_receipt renders the capture: the key, the act, the watermark and a link to the record's own page", async () => {
  const h = await renderComponent(App(CAPTURED));
  try {
    await h.settle();
    const text = h.text();
    assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "knowledge_receipt must never reach the unsupported-part chip");
    assert.match(text, /Client information recorded/);
    assert.match(text, /trade_nature/, "knowledge_key must render");
    assert.match(text, /knowledge version\s*7/, "knowledge_version must render — the watermark a later trace compares against");
    assert.match(text, /first record/, "revision_kind `capture` reads as the act, not as a raw token");
    // The link is a REAL route in this app's tree — lib/navigation/tree.ts's knowledgeRecordHref,
    // which is the C13 detail page (#644).
    assert.deepEqual(hrefs(h), ["/clients/9b71cc40-client/knowledge/7c1f0a20-record"]);
  } finally {
    await h.unmount();
  }
});

test("knowledge_receipt distinguishes a CORRECTION from a first capture, because the database does", async () => {
  const corrected: KnowledgeReceiptPart = { ...CAPTURED, record_id: "7c1f0a20-record", revision_kind: "correction" };
  const h = await renderComponent(App(corrected));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /correction/, "0192's own revision_kind reaches the reader as a different word");
    assert.doesNotMatch(text, /first record/, "…and the two acts are not rendered as the same thing");
  } finally {
    await h.unmount();
  }
});

test("knowledge_receipt renders a revision kind this build does not know VERBATIM, never through a missing key", async () => {
  // The checked-lookup discipline `work_status` already follows: a future `withdrawal` token must
  // reach the screen as itself rather than as a next-intl key error or as a silently dropped row.
  const future: KnowledgeReceiptPart = { ...CAPTURED, revision_kind: "some_future_kind" };
  const h = await renderComponent(App(future));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /some_future_kind/);
    assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX));
  } finally {
    await h.unmount();
  }
});

test("knowledge_receipt with an unfilled client_id renders the receipt but NO link — never /clients//knowledge/…", async () => {
  const h = await renderComponent(App({ ...CAPTURED, client_id: "" }));
  try {
    await h.settle();
    assert.match(h.text(), /trade_nature/, "the receipt itself must still render");
    assert.deepEqual(hrefs(h), [], "no client id on the wire means no link at all");
  } finally {
    await h.unmount();
  }
});

test("knowledge_receipt renders NO value, NO trust and NO state — the record's own page owns all three", async () => {
  // The property ../KnowledgeCards.tsx exists to hold: a card that printed "services" would go on
  // asserting it after somebody corrected the record to "mixed", inside a transcript a professional
  // may later read as evidence of what Clara was told.
  const h = await renderComponent(App(CAPTURED));
  try {
    await h.settle();
    const text = h.text();
    for (const forbidden of ["services", "asserted", "inferred", "user_statement", "live"]) {
      assert.doesNotMatch(text, new RegExp(forbidden, "i"), `the card must not render '${forbidden}' — it is not on the wire and it moves`);
    }
  } finally {
    await h.unmount();
  }
});
