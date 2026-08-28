// components/firm/compliance-watch-affordance.tsx — behavior tests through the
// REAL NeedsYouInbox mount (registry dispatch, not a hand-mounted component):
// each of ack/snooze/resolve fires EXACTLY the door this train's own header
// grounds, a successful act clears the open inline form (a discriminating
// post-condition — true only after a real success, not merely "a click
// happened"), and a governed refusal renders VERBATIM in the row's own
// persistent banner while the human's typed input survives it (Wave-A lesson:
// "a click test must assert something true ONLY after the click").

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { NeedsYouInbox } from "./needs-you-inbox";
import messages from "../../messages/en.json";
import type { ReviewQueueEnvelope } from "../../lib/firm/needs-you";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function driveHandler(node: Node, handlerName: "onChange" | "onClick", patch?: Record<string, unknown>): void {
  if (patch) Object.assign(node as object, patch);
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const props = propsKey ? (node as unknown as Record<string, Record<string, (e: unknown) => void>>)[propsKey] : undefined;
  const nativeEvent = { type: "input", target: node, defaultPrevented: false };
  props?.[handlerName]?.({
    target: node, currentTarget: node, nativeEvent,
    persist() {}, preventDefault() {}, stopPropagation() {},
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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

function envelope(): ReviewQueueEnvelope {
  return {
    watermark: "w1",
    counts: { ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
    sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
    rows: [
      {
        row_kind: "compliance_watch", section: "needs_you", client_id: "c1", counterparty_id: null, filing_id: null,
        entry_id: null, question_id: null, task_id: null, document_id: null, lane: null, auto: false,
        rule_backed: false, high_stakes: false, aged_since: "2026-07-01T00:00:00Z", amount_cents: null, period: "2026-07-31",
        question_text: "SST registration threshold watch (digital_services)", created_at: "2026-07-01T00:00:00Z", id: "w1",
        coding_kind: null, watch_id: "w1", tier: "crossed", finding_id: null, asset_id: null, advance_id: null,
      },
    ],
    next_cursor: null,
  };
}

const NO_GAPS = { "/rest/v1/firm_open_questions_visible": [], "/rest/v1/client_identifier_promotions_visible": [], "/rest/v1/clients": [] };

function mockFetchFactory(actResponse: { url: string; body: unknown; status: number }) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (init?.body) calls.push({ url: u, body: JSON.parse(String(init.body)) });
    if (u.includes(actResponse.url)) return jsonResponse(actResponse.body, actResponse.status);
    if (u.includes("/rpc/list_review_queue")) return jsonResponse(envelope());
    for (const [path, body] of Object.entries(NO_GAPS)) {
      if (u.includes(path)) return jsonResponse(body);
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return { impl, calls };
}

async function mount() {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement("div", null, createElement("h1", null, "Needs you"), createElement(NeedsYouInbox)),
    }),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 4; i++) await h.settle();
  return { h, body };
}

test("Acknowledge: fires ack_compliance_watch with p_watch/p_rationale, and a REAL success closes the inline form (a post-condition true only after the click)", async () => {
  const { impl, calls } = mockFetchFactory({ url: "/rpc/ack_compliance_watch", body: { watch_id: "w1", acknowledged: true }, status: 200 });
  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const ackTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Acknowledge");
      assert.ok(ackTrigger, "the Acknowledge trigger must render");
      await h.fireEvent(ackTrigger! as never, "click");
      await h.settle();

      const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(textarea, "the rationale textarea must be reachable after opening Acknowledge");
      await h.act(() => { driveHandler(textarea as never, "onChange", { value: "Client's SST registration filed today, receipt on hand." }); });

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Acknowledge" && (n as unknown) !== (ackTrigger as unknown),
      );
      assert.ok(confirmButton, "the inline form's own submit button must be reachable, distinct from the trigger");
      await h.act(() => { driveHandler(confirmButton as never, "onClick"); });
      for (let i = 0; i < 6; i++) await h.settle();

      const call = calls.find((c) => c.url.includes("/rpc/ack_compliance_watch"));
      assert.ok(call, "ack_compliance_watch must have been called exactly once");
      assert.equal(call!.body.p_watch, "w1");
      assert.equal(call!.body.p_rationale, "Client's SST registration filed today, receipt on hand.");
      assert.equal(typeof call!.body.p_op_key, "string");

      // Discriminating post-condition: the rationale textarea and the
      // inline Cancel control (both present only while the form is OPEN)
      // must be gone — a click test that only checks "a fetch happened"
      // would pass even if the form never actually closed.
      assert.equal(findIn(body as never, (n) => n.tagName === "TEXTAREA"), null, "the rationale textarea must be gone after a real success — the form must have genuinely closed, not merely stopped submitting");
      // The mock re-serves the SAME (unmodified) row on the follow-up reload
      // (hydrate-never-trust re-reads; this test does not simulate the DB's
      // own state transition) — so the row itself still renders, and this
      // asserts the AFFORDANCE reverted to its closed (three-trigger) state
      // rather than staying stuck showing the just-submitted form.
      assert.ok(
        findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Snooze"),
        "the affordance must have reverted to its closed state (all three triggers visible) after a real success",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("Resolve refusal (CLR04, not_liable_documented requires admin): the CLR code + message render VERBATIM in the row's own banner, and the typed evidence SURVIVES the refusal", async () => {
  const { impl, calls } = mockFetchFactory({
    url: "/rpc/resolve_compliance_watch",
    body: { code: "CLR04", message: "a not-liable resolution requires admin" },
    status: 400,
  });
  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const resolveTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Resolve");
      assert.ok(resolveTrigger, "the Resolve trigger must render");
      await h.fireEvent(resolveTrigger! as never, "click");
      await h.settle();

      const select = findIn(body as never, (n) => n.tagName === "SELECT");
      assert.ok(select, "the conclusion select must be reachable");
      await h.act(() => { driveHandler(select as never, "onChange", { value: "not_liable_documented" }); });

      const evidenceText = "Below the SST threshold this period; screening proxy attached.";
      const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(textarea, "the evidence textarea must be reachable");
      await h.act(() => { driveHandler(textarea as never, "onChange", { value: evidenceText }); });

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Resolve" && (n as unknown) !== (resolveTrigger as unknown),
      );
      assert.ok(confirmButton, "the inline form's own submit button must be reachable, distinct from the trigger");
      await h.act(() => { driveHandler(confirmButton as never, "onClick"); });
      for (let i = 0; i < 6; i++) await h.settle();

      const call = calls.find((c) => c.url.includes("/rpc/resolve_compliance_watch"));
      assert.ok(call, "resolve_compliance_watch must have been called");
      assert.equal(call!.body.p_conclusion, "not_liable_documented", "the conclusion select was never hidden on a client-side role guess — this train's own security law");

      const bodyText = textOf(body as never);
      assert.match(bodyText, /CLR04/, "the CLR code must render, verbatim");
      assert.match(bodyText, /requires admin/, "the DB's own message must render, verbatim — never re-worded");

      // N13's own rule, and this train's own header comment: a refusal must
      // NOT discard what the human typed — the evidence textarea must still
      // carry the same text, not be reset to empty.
      const stillOpenTextarea = findIn(body as never, (n) => n.tagName === "TEXTAREA") as unknown as { value: string } | null;
      assert.ok(stillOpenTextarea, "the evidence form must still be open after a refusal");
      assert.equal(stillOpenTextarea!.value, evidenceText, "the typed evidence must survive the refusal — never discarded");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("Snooze: fires snooze_compliance_watch with p_watch/p_until/p_rationale, exactly once", async () => {
  const { impl, calls } = mockFetchFactory({ url: "/rpc/snooze_compliance_watch", body: { watch_id: "w1", snoozed_until: "2026-09-15T00:00:00Z" }, status: 200 });
  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const snoozeTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Snooze");
      assert.ok(snoozeTrigger, "the Snooze trigger must render");
      await h.fireEvent(snoozeTrigger! as never, "click");
      await h.settle();

      const dateInput = findIn(body as never, (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type === "date");
      assert.ok(dateInput, "the until-date input must be reachable");
      await h.act(() => { setFieldValue(dateInput as never, "2026-09-15"); });

      const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(textarea, "the rationale textarea must be reachable");
      await h.act(() => { driveHandler(textarea as never, "onChange", { value: "Waiting on the client's registration certificate." }); });

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Snooze" && (n as unknown) !== (snoozeTrigger as unknown),
      );
      assert.ok(confirmButton, "the inline form's own submit button must be reachable");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "both required fields are filled — submit must be enabled");
      await h.act(() => { driveHandler(confirmButton as never, "onClick"); });
      for (let i = 0; i < 6; i++) await h.settle();

      const matches = calls.filter((c) => c.url.includes("/rpc/snooze_compliance_watch"));
      assert.equal(matches.length, 1, "exactly one governed call — never a batch");
      const [snoozeCall] = matches;
      assert.ok(snoozeCall);
      assert.equal(snoozeCall.body.p_watch, "w1");
      assert.equal(snoozeCall.body.p_until, "2026-09-15T00:00:00Z");
      assert.equal(snoozeCall.body.p_rationale, "Waiting on the client's registration certificate.");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
