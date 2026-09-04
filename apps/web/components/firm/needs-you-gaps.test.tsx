// components/firm/needs-you-gaps.test.tsx — interaction coverage for
// NeedsYouGaps (lib/firm/needs-you-gaps.ts's two read/act surfaces): a
// successful act re-reads and the settled row leaves the list
// (hydrate-never-trust); a governed refusal renders VERBATIM on the acted-on
// row, never a page banner, while the row is still present. The a11y scan
// itself lives in needs-you-a11y.test.tsx (GATE (b)) — this file is the
// mechanism test alongside it, same split as close-components.test.tsx vs
// close-a11y.test.tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, setNativeValue } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { NeedsYouGaps } from "./needs-you-gaps";
import messages from "../../messages/en.json";
import type { FirmOpenQuestionRow, IdentifierPromotionRow } from "../../lib/firm/needs-you-gaps";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const QUESTION: FirmOpenQuestionRow = {
  id: "q1", firm_id: "f1", document_id: "d1", kind: "unattributed",
  question_text: "Which client does this invoice belong to?", candidates: [],
  status: "open", opened_by: "u1", opened_at: "2026-08-01T00:00:00Z",
  settled_by: null, settled_at: null, settlement_text: null, named_client: null, receipt_id: null,
};

const PROMOTION: IdentifierPromotionRow = {
  id: "p1", firm_id: "f1", client_id: "c1", kind: "tin", value_normalized: "c12345678090",
  sightings: 3, citations: [{ document_id: "d2" }], rationale: "Seen on three filed statements.",
  model: { provider: "anthropic", model: "claude", version: "5" }, status: "proposed",
  proposed_by: "agent", proposed_at: "2026-08-02T00:00:00Z",
  settled_by: null, settled_at: null, identifier_id: null,
};

/** A stateful dispatcher: each list starts populated and flips to empty the
 *  moment its act door reports success — the SAME shape a real re-read would
 *  see once the row's status leaves 'open'/'proposed'. `refuseDismiss`/
 *  `refuseDecline` let one test prove that door's refusal path without
 *  touching the others. */
/** What the caller's ONE `loadClientRegister` read returns, handed to this panel
 *  as a prop exactly as `needs-you-inbox.tsx` hands it in (review-550). */
const CLIENTS = [{ id: "c1", name: "Acme Sdn Bhd", status: "active", created_at: "2026-01-01T00:00:00Z" }];

function makeFetch(opts: { refuseDismiss?: boolean; refuseDecline?: boolean } = {}) {
  let questionOpen = true;
  let promotionOpen = true;
  const bodies: Record<string, unknown> = {};
  const impl = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    if (u.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse(questionOpen ? [QUESTION] : []);
    if (u.includes("/rest/v1/client_identifier_promotions_visible")) return jsonResponse(promotionOpen ? [PROMOTION] : []);
    // review-550: this panel no longer reads `clara.clients` itself — the caller
    // does, once, and passes the rows down. The handler stays as a REFUTER: if a
    // future change re-adds the read here, `/needs-you` is back to two calls and
    // this throws rather than quietly answering.
    if (u.includes("/rest/v1/clients")) {
      throw new Error("NeedsYouGaps must not read clara.clients — the caller hoisted that read (review-550)");
    }
    if (u.includes("/rpc/resolve_firm_question")) {
      bodies.resolve = JSON.parse(String(init?.body));
      questionOpen = false;
      return jsonResponse({ question_id: "q1", status: "resolved", named_client: "c1" });
    }
    if (u.includes("/rpc/dismiss_firm_question")) {
      bodies.dismiss = JSON.parse(String(init?.body));
      if (opts.refuseDismiss) return jsonResponse({ code: "CLR10", message: "firm question is not open" }, 400);
      questionOpen = false;
      return jsonResponse({ question_id: "q1", status: "dismissed" });
    }
    if (u.includes("/rpc/confirm_identifier_promotion")) {
      bodies.confirm = JSON.parse(String(init?.body));
      promotionOpen = false;
      return jsonResponse({ promotion_id: "p1", status: "confirmed", identifier_id: "i1" });
    }
    if (u.includes("/rpc/decline_identifier_promotion")) {
      bodies.decline = JSON.parse(String(init?.body));
      if (opts.refuseDecline) return jsonResponse({ code: "CLR10", message: "identifier promotion is not open" }, 400);
      promotionOpen = false;
      return jsonResponse({ promotion_id: "p1", status: "declined" });
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  return { impl, bodies };
}

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

function render() {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      // review-550: the client register is READ BY THE CALLER now
      // (needs-you-inbox.tsx) and passed down, so `/needs-you` no longer issues
      // `clara.clients` twice. The fixture supplies what that one read returns.
      children: createElement(NeedsYouGaps, { clients: CLIENTS, clientsUnavailable: false }),
    }),
  );
}

test("NeedsYouGaps: renders both live lists with real content", async () => {
  const { impl } = makeFetch();
  await withMockedEnv(impl, async () => {
    const h = await render();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Which client does this invoice belong to\?/);
      assert.match(h.text(), /c12345678090/);
    } finally {
      await h.unmount();
    }
  });
});

test("NeedsYouGaps: 裁-22 -- an identifier promotion's RESOLVED citation renders (the region/document id text, not just the count)", async () => {
  const { impl } = makeFetch();
  await withMockedEnv(impl, async () => {
    const h = await render();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      // PROMOTION's fixture citation carries document_id "d2" -- the resolved shape
      // _resolve_proposal_basis actually returns, not the pre-裁-22 unresolved placeholder.
      // This is DISCRIMINATING against the vacuous case: deleting the citations details
      // block entirely would still pass the sightings/count assertions elsewhere but fail
      // THIS one, since "d2" only ever renders from the resolved-citation dump.
      assert.match(h.text(), /d2/);
    } finally {
      await h.unmount();
    }
  });
});

test("NeedsYouGaps: resolve posts p_client from the select, then the row leaves the list on re-read", async () => {
  const { impl, bodies } = makeFetch();
  await withMockedEnv(impl, async () => {
    const h = await render();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const resolveBtn = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Resolve");
      await h.fireEvent(resolveBtn!, "click");
      const textInput = h.find((n) => n.tagName === "INPUT");
      // base-ui's <Input> wraps onChange, so a plain dispatched event never
      // reaches it — setFieldValue invokes the consumer onChange directly
      // (hookHarness.ts's own header explains why).
      await h.act(() => { setFieldValue(textInput!, "It is Acme Sdn Bhd."); });
      const select = h.find((n) => n.tagName === "SELECT");
      // NativeSelect stays a REAL <select> on purpose (its own header) — a
      // plain native "change" dispatch reaches its onChange normally.
      await h.fireEvent(select!, "change", (n) => setNativeValue(n, "value", "c1"));
      const submitBtn = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Submit");
      await h.fireEvent(submitBtn!, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      const resolveBody = bodies.resolve as { p_question: string; p_resolution: string; p_client: string; p_op_key: string };
      assert.equal(resolveBody.p_question, "q1");
      assert.equal(resolveBody.p_resolution, "It is Acme Sdn Bhd.");
      assert.equal(resolveBody.p_client, "c1");
      assert.ok(typeof resolveBody.p_op_key === "string" && resolveBody.p_op_key.length > 0);
      assert.doesNotMatch(h.text(), /Which client does this invoice belong to\?/);
    } finally {
      await h.unmount();
    }
  });
});

test("NeedsYouGaps: a governed dismiss refusal renders VERBATIM on the row, which stays present", async () => {
  const { impl } = makeFetch({ refuseDismiss: true });
  await withMockedEnv(impl, async () => {
    const h = await render();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const dismissBtn = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Dismiss");
      await h.fireEvent(dismissBtn!, "click");
      const textInput = h.find((n) => n.tagName === "INPUT");
      await h.act(() => { setFieldValue(textInput!, "not relevant"); });
      const submitBtn = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Submit");
      await h.fireEvent(submitBtn!, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      assert.match(h.text(), /CLR10/);
      assert.match(h.text(), /firm question is not open/);
      // The row is STILL present — a refusal must never silently disappear the item.
      assert.match(h.text(), /Which client does this invoice belong to\?/);
    } finally {
      await h.unmount();
    }
  });
});

test("NeedsYouGaps: confirm is a single click (no text step), then the promotion leaves the list on re-read", async () => {
  const { impl, bodies } = makeFetch();
  await withMockedEnv(impl, async () => {
    const h = await render();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const confirmBtn = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Confirm");
      await h.fireEvent(confirmBtn!, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      assert.equal((bodies.confirm as { p_proposal: string }).p_proposal, "p1");
      assert.doesNotMatch(h.text(), /c12345678090/);
    } finally {
      await h.unmount();
    }
  });
});

test("NeedsYouGaps: a governed decline refusal renders VERBATIM on the row, which stays present", async () => {
  const { impl, bodies } = makeFetch({ refuseDecline: true });
  await withMockedEnv(impl, async () => {
    const h = await render();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const declineBtn = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Decline");
      await h.fireEvent(declineBtn!, "click");
      const textInput = h.find((n) => n.tagName === "INPUT");
      await h.act(() => { setFieldValue(textInput!, "wrong account"); });
      const submitBtn = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Submit");
      await h.fireEvent(submitBtn!, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      assert.equal((bodies.decline as { p_reason: string }).p_reason, "wrong account");
      assert.match(h.text(), /CLR10/);
      assert.match(h.text(), /identifier promotion is not open/);
      // The row is STILL present — a refusal must never silently disappear the item.
      assert.match(h.text(), /c12345678090/);
    } finally {
      await h.unmount();
    }
  });
});
