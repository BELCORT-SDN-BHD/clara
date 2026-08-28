// GATE (b) — structural a11y scan of the firm-wide Needs-you inbox (owner
// ruling Q7). See test/domInspect.ts's header for why this rides a
// hand-written rule engine (test/a11yRules.ts) rather than real axe-core.
//
// NeedsYouInbox self-fetches list_review_queue (lib/firm/needs-you.ts) — one
// mocked RPC, matching that module's own `listReviewQueue` call shape.
// NeedsYouGaps (rendered at the bottom of NeedsYouInbox's own tree) now
// self-fetches its own two live reads (lib/firm/needs-you-gaps.ts, 0137) plus
// the client register (lib/firm/reads.ts) for its resolve form's client
// select — three more mocked GETs, below.
//
// Wrapped in a synthetic <h1> — the same idiom used in
// components/documents/documents-a11y.test.tsx and
// components/bank/bank-a11y.test.tsx: on the real page
// (app/(firm)/needs-you/page.tsx) NeedsYouInbox always renders under
// PageHeader's own <h1>. NeedsYouGaps' own SectionHeader level={2} (a real
// h2 — see that component's own fold-seam note) is a valid section heading
// under that ambient h1 in production; scanning it standalone without that
// h1 would flag a heading-order violation that is an artifact of testing an
// interior component in isolation, not a real defect.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { NeedsYouInbox } from "./needs-you-inbox";
import messages from "../../messages/en.json";
import type { ReviewQueueEnvelope } from "../../lib/firm/needs-you";

enableDomInspection();

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

const ENVELOPE: ReviewQueueEnvelope = {
  watermark: "w1",
  counts: { ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 1, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [
    {
      row_kind: "open_question", section: "needs_you", client_id: "c1", counterparty_id: null, filing_id: null,
      entry_id: null, question_id: "q1", task_id: null, document_id: null, lane: "needs_you", auto: false,
      rule_backed: false, high_stakes: false, aged_since: null, amount_cents: null, period: null,
      question_text: "Which account should this fee post to?", created_at: "2026-04-01T00:00:00Z", id: "q1",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null, advance_id: null,
    },
  ],
  next_cursor: null,
};

// The two 0137 read surfaces (lib/firm/needs-you-gaps.ts) plus the client
// register their resolve form's select reads (lib/firm/reads.ts).
const FIRM_QUESTION = {
  id: "q1", firm_id: "f1", document_id: "d1", kind: "unattributed",
  question_text: "Which client does this belong to?", candidates: [],
  status: "open", opened_by: "u1", opened_at: "2026-08-01T00:00:00Z",
  settled_by: null, settled_at: null, settlement_text: null, named_client: null, receipt_id: null,
};
const IDENTIFIER_PROMOTION = {
  id: "p1", firm_id: "f1", client_id: "c1", kind: "tin", value_normalized: "c12345678090",
  sightings: 3, citations: [{ document_id: "d2" }], rationale: "Seen on three filed statements.",
  model: { provider: "anthropic", model: "claude", version: "5" }, status: "proposed",
  proposed_by: "agent", proposed_at: "2026-08-02T00:00:00Z",
  settled_by: null, settled_at: null, identifier_id: null,
};
const CLIENTS = [{ id: "c1", name: "Acme Sdn Bhd", status: "active", created_at: "2026-01-01T00:00:00Z" }];

function mockGapsAndQueueFetch(u: string): Response {
  if (u.includes("/rpc/list_review_queue")) return jsonResponse(ENVELOPE);
  if (u.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([FIRM_QUESTION]);
  if (u.includes("/rest/v1/client_identifier_promotions_visible")) return jsonResponse([IDENTIFIER_PROMOTION]);
  if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
  throw new Error(`unexpected fetch: ${u}`);
}

// "Resolve" is ambiguous by text alone: the review-queue's own open_question
// row (NeedsYouRow) AND the firm-question row (FirmQuestionRow, below it)
// both render a button with this exact label, reusing the SAME translation
// key by design. Ported from matching-section.test.tsx's `checkboxNear`
// idiom — content-scoped, never a DOM-order assumption.
type Node = { tagName?: string; parentNode?: Node | null; childNodes?: Node[] };

function findAll(root: Node, predicate: (n: Node) => boolean): Node[] {
  const found: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) found.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return found;
}

function buttonInRowNamed(h: Awaited<ReturnType<typeof renderComponent>>, label: string, rowNeedle: string): Node {
  const candidates = findAll(h.container as unknown as Node, (n) => n.tagName === "BUTTON" && textOf(n as never) === label);
  const match = candidates.find((btn) => {
    let ancestor: Node | null | undefined = btn.parentNode;
    while (ancestor && ancestor.tagName !== "LI") ancestor = ancestor.parentNode;
    return ancestor ? textOf(ancestor as never).includes(rowNeedle) : false;
  });
  assert.ok(match, `no "${label}" button found in the row containing "${rowNeedle}"`);
  return match!;
}

test("firm needs-you inbox (queue + the two 0137 gap lists) has zero violations", async () => {
  await withMockedEnv(
    async (u) => mockGapsAndQueueFetch(String(u)),
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          // Ambient <h1> stand-in — see this file's own header note.
          children: createElement("div", null, createElement("h1", null, "Needs you"), createElement(NeedsYouInbox)),
        }),
      );
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /Which account should this fee post to/, "the queue row must have actually loaded");
        assert.match(h.text(), /Which client does this belong to\?/, "the firm-questions row must have actually loaded");
        assert.match(h.text(), /c12345678090/, "the identifier-promotion row must have actually loaded");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("firm needs-you inbox: the firm-question resolve form (open, with its client select) has zero violations", async () => {
  await withMockedEnv(
    async (u) => mockGapsAndQueueFetch(String(u)),
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Needs you"), createElement(NeedsYouInbox)),
        }),
      );
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const resolveBtn = buttonInRowNamed(h, "Resolve", "Which client does this belong to?");
        await h.fireEvent(resolveBtn as never, "click");
        await h.settle();
        assert.ok(h.find((n) => n.tagName === "SELECT"), "the resolve form's client select must be open");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});
