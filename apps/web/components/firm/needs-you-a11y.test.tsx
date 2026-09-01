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
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
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
      client_name: null, batch_ids: null, open_proposal_count: null,
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
        // M3, independent review (pin the fixes): SweepStatusPanel is genuinely
        // MOUNTED inside NeedsYouInbox — the SAME envelope's `sweep` field this
        // test already reads, never a second call.
        assert.match(h.text(), /No sweep run is currently open/, "SweepStatusPanel must actually be mounted inside NeedsYouInbox");
        // M5, independent review: OpenQuestionDetail is genuinely mounted
        // inside the open_question row's own OpenQuestionAffordance.
        assert.match(h.text(), /View details/, "OpenQuestionDetail's reveal trigger must actually be mounted on the open_question row");
        // FS-8 (P6-T honest-note sweep): the two new static notes actually
        // render — the F-T2 statutory-deadlines gap (needs-you-inbox.tsx)
        // and the client-alias hygiene gap beside the identifier-promotion
        // list (needs-you-gaps.tsx).
        assert.match(h.text(), /This feed is F-T2's, paused/, "the F-T2 statutory-deadlines note must render in the inbox");
        assert.match(h.text(), /add_client_alias and retire_client_alias are live doors/, "the client-alias hygiene note must render beside the identifier-promotion list");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// A row bearing a HOSTILE row_kind — Object.prototype's own member names —
// never reaches the DB today (independent review, fix-required, 2026-08-28:
// this is the render-level half of the pinned finding; needs-you-affordances.
// test.ts pins the pure-function half). Before the fix, the affordance
// registry lookup resolved these to INHERITED functions instead of
// `undefined`, so needs-you-row.tsx tried to render "constructor" as a
// component (a THROW) or "toString" as one (the literal text
// "[object Undefined]"). This envelope is intentionally separate from the
// shared ENVELOPE above so the other two tests' own assertions are untouched.
const HOSTILE_ENVELOPE: ReviewQueueEnvelope = {
  watermark: "w2",
  counts: { ready: 0, needs_review: 1, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [
    {
      row_kind: "constructor", section: "needs_review", client_id: "c1", counterparty_id: null, filing_id: null,
      entry_id: null, question_id: null, task_id: null, document_id: null, lane: null, auto: false,
      rule_backed: false, high_stakes: false, aged_since: null, amount_cents: null, period: null,
      question_text: null, created_at: "2026-04-01T00:00:00Z", id: "hostile-1",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null, advance_id: null,
      client_name: null, batch_ids: null, open_proposal_count: null,
    },
    {
      row_kind: "toString", section: "needs_review", client_id: "c1", counterparty_id: null, filing_id: null,
      entry_id: null, question_id: null, task_id: null, document_id: null, lane: null, auto: false,
      rule_backed: false, high_stakes: false, aged_since: null, amount_cents: null, period: null,
      question_text: null, created_at: "2026-04-01T00:00:00Z", id: "hostile-2",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null, advance_id: null,
      client_name: null, batch_ids: null, open_proposal_count: null,
    },
  ],
  next_cursor: null,
};

function mockGapsAndQueueFetchHostile(u: string): Response {
  if (u.includes("/rpc/list_review_queue")) return jsonResponse(HOSTILE_ENVELOPE);
  if (u.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([]);
  if (u.includes("/rest/v1/client_identifier_promotions_visible")) return jsonResponse([]);
  if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
  throw new Error(`unexpected fetch: ${u}`);
}

test("firm needs-you inbox: a row bearing 'constructor' or 'toString' as its row_kind renders no inline affordance and does not crash", async () => {
  await withMockedEnv(
    async (u) => mockGapsAndQueueFetchHostile(String(u)),
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
        // Rendered at all (no throw) and the honest "unrecognized" label —
        // never a raw next-intl key path, never the hostile name itself
        // executed as a component — is what proves the getter's own
        // undefined-for-hostile-keys contract actually reaches the DOM.
        assert.match(h.text(), /Unrecognized item \(constructor\)/, "the 'constructor' row must render the honest unrecognized-kind label");
        assert.match(h.text(), /Unrecognized item \(toString\)/, "the 'toString' row must render the honest unrecognized-kind label");
        assert.ok(!h.text().includes("[object Undefined]"), "must never render an inherited toString() call's own output");
        assert.equal(h.find((n) => n.tagName === "BUTTON") === null, true, "neither hostile row may carry ANY inline act button");
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

// T7 (F9, independent review): the THREE new row kinds, rendered through the
// REAL needs-you registry dispatch (NEEDS_YOU_AFFORDANCES via
// getNeedsYouAffordance — never a standalone render of the affordance
// component), with a discriminating post-condition driven on one dialog.
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

const T7_ENVELOPE: ReviewQueueEnvelope = {
  watermark: "w3",
  counts: { ready: 0, needs_review: 3, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 1, compliance_watches: 0, lint_findings: 1 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [
    {
      row_kind: "uncoded_filing", section: "needs_review", client_id: "c1", counterparty_id: null, filing_id: "f1",
      entry_id: null, question_id: null, task_id: null, document_id: "d1", lane: "needs_review", auto: false,
      rule_backed: false, high_stakes: false, aged_since: null, amount_cents: null, period: null,
      question_text: null, created_at: "2026-04-01T00:00:00Z", id: "f1",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null, advance_id: null,
      client_name: null, batch_ids: null, open_proposal_count: null,
    },
    {
      row_kind: "coding_task", section: "needs_review", client_id: "c1", counterparty_id: null, filing_id: "f2",
      entry_id: null, question_id: null, task_id: "t1", document_id: "d2", lane: null, auto: false,
      rule_backed: false, high_stakes: false, aged_since: null, amount_cents: null, period: null,
      question_text: null, created_at: "2026-04-02T00:00:00Z", id: "t1",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null, advance_id: null,
      client_name: null, batch_ids: null, open_proposal_count: null,
    },
    {
      row_kind: "lint_finding", section: "needs_review", client_id: "c1", counterparty_id: null, filing_id: null,
      entry_id: null, question_id: null, task_id: null, document_id: null, lane: null, auto: false,
      rule_backed: false, high_stakes: false, aged_since: null, amount_cents: null, period: null,
      question_text: "Lint: stale_claim", created_at: "2026-04-03T00:00:00Z", id: "lf1",
      coding_kind: null, watch_id: null, tier: "warn", finding_id: "lf1", asset_id: null, advance_id: null,
      client_name: null, batch_ids: null, open_proposal_count: null,
    },
  ],
  next_cursor: null,
};

function mockT7Fetch(u: string): Response {
  if (u.includes("/rpc/list_review_queue")) return jsonResponse(T7_ENVELOPE);
  if (u.includes("/rpc/open_coding_task")) return jsonResponse({ coding_task_id: "new-task", status: "open" });
  if (u.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([]);
  if (u.includes("/rest/v1/client_identifier_promotions_visible")) return jsonResponse([]);
  if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
  if (u.includes("/rest/v1/journal_entries")) return jsonResponse([]);
  throw new Error(`unexpected fetch: ${u}`);
}

test("firm needs-you inbox: uncoded_filing / coding_task / lint_finding rows, dispatched through the REAL registry, have zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockT7Fetch(String(u)),
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
        // Registry dispatch actually resolved a real affordance for each of
        // the three kinds — proven by the presence of each one's own trigger
        // text, never asserted from the row_kind label alone.
        assert.ok(h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Open coding task$/) !== null), "uncoded_filing must dispatch to UncodedFilingActions");
        assert.ok(h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Complete$/) !== null), "coding_task must dispatch to CodingTaskActions");
        assert.ok(h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Resolve$/) !== null), "lint_finding must dispatch to LintFindingActions");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// 裁-17 (mohe-grill-rulings-2026-08-28.md): the NINTH row_kind, rendered through
// the REAL registry dispatch (NEEDS_YOU_AFFORDANCES via getNeedsYouAffordance),
// never a standalone render of SeedingProposalAffordance. Discriminating
// post-condition: the deep link's href names the OWNING TAB
// (/clients/:id/reports, where T9's SeedingBatchesPanel is mounted), never the
// client-workspace root (/clients/:id) — a link to the root would ALSO match a
// substring-only assertion, which is exactly why this asserts the full href.
const SEEDING_ENVELOPE: ReviewQueueEnvelope = {
  watermark: "w4",
  counts: { ready: 0, needs_review: 1, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [
    {
      row_kind: "seeding_proposal", section: "needs_review", client_id: "c1", counterparty_id: null, filing_id: null,
      entry_id: null, question_id: null, task_id: null, document_id: null, lane: null, auto: false,
      rule_backed: false, high_stakes: false, aged_since: "2026-08-01T00:00:00Z", amount_cents: null, period: null,
      question_text: "2 open seeding proposals pending review", created_at: "2026-08-01T00:00:00Z", id: "c1",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null, advance_id: null,
      client_name: "Acme Sdn Bhd", batch_ids: ["b1", "b2"], open_proposal_count: 2,
    },
  ],
  next_cursor: null,
};

function mockSeedingFetch(u: string): Response {
  if (u.includes("/rpc/list_review_queue")) return jsonResponse(SEEDING_ENVELOPE);
  if (u.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([]);
  if (u.includes("/rest/v1/client_identifier_promotions_visible")) return jsonResponse([]);
  if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
  throw new Error(`unexpected fetch: ${u}`);
}

test("firm needs-you inbox: a seeding_proposal row, dispatched through the REAL registry, links to the client's Reports tab (owning tab, not the workspace root)", async () => {
  await withMockedEnv(
    async (u) => mockSeedingFetch(String(u)),
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
        assert.match(h.text(), /2 open seeding proposals pending review/, "the seeding_proposal row must have actually loaded");
        // needs-you-row.tsx ALSO renders a generic "Open client" link to the
        // workspace root on EVERY row (client_id present or not) — that link is
        // NOT this affordance's own, so its presence is expected, not a defect.
        // The discriminating assertion is that the REGISTRY-dispatched link
        // (SeedingProposalAffordance, via getNeedsYouAffordance) ALSO renders,
        // and points at the OWNING TAB specifically.
        const reportsLink = h.find((n) => n.tagName === "A" && (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("href") === "/clients/c1/reports");
        assert.ok(reportsLink, "the registry dispatched a REAL link to the owning tab (/clients/c1/reports)");
        assert.match(textOf(reportsLink as never), /Review in Reports/, "the deep-link text is the affordance's own label, not the generic \"Open client\" text");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("firm needs-you inbox: the uncoded_filing row's open_coding_task dialog, driven through the REAL registry to a real confirm, posts the door and the trigger row's error clears — discriminating post-condition", async () => {
  await withMockedEnv(
    async (u) => mockT7Fetch(String(u)),
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Needs you"), createElement(NeedsYouInbox)),
        }),
      );
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Open coding task$/) !== null);
        assert.ok(trigger, "the open-task trigger must render");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(reasonField, "the reason field must render as a real <textarea>");
        await h.act(() => { setFieldValue(reasonField as never, "vendor could not be matched"); });

        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Open coding task$/) !== null && n !== trigger);
        assert.ok(confirmButton, "the confirm control must render");
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();

        // Discriminating post-condition: the dialog genuinely closed (a
        // fabricated success would leave it open, or the reason text still
        // visible) — proven, not assumed, since this same envelope is
        // returned again on the re-read (the row itself does not vanish).
        assert.doesNotMatch(textOf(body as never), /Open a coding task/, "the dialog must actually close on a real confirm");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
        const bodyRef = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyRef.childNodes?.includes(h.container)) bodyRef.removeChild(h.container);
      }
    },
  );
});
