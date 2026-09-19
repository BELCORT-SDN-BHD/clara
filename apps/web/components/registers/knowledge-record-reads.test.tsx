// #658 — "WORK THAT READ THIS RECORD" on C13's record detail: the HUMAN half of AC5's historical
// basis, through DECISIONS.md:83's seventh door.
//
// THE PRODUCT CLAIMS THESE CELLS MAKE:
//   1. each row names the Work, the version and the period it read at, its purpose and its FACE
//      WORD (ok / partial / unknown / denied — never a fifth), and LINKS to the Work rather than
//      offering an act: a record page is not a second entrance to a Work;
//   2. a firm-scope record's rows link to the ROW's own client, not the page's — the door lists
//      every client that was actually reading the firm default;
//   3. an empty list reads as "no Work has recorded a read of this record", never as "this record
//      is unused" and never as an error;
//   4. `truncated` renders the partial line with the door's own hidden count;
//   5. a DENIED reads-read gets its own banner and the revision timeline beside it still renders —
//      this read fails independently of the two the page already makes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { KnowledgeRecordReads } from "./knowledge-record-reads";
import { KnowledgeDetail } from "./knowledge-detail";
import type { KnowledgeRecordRow, WorkKnowledgeReadRow } from "../../lib/registers/knowledge";

enableDomInspection();

/** The harness's stub nodes are `Record<string, unknown>`, so an attribute read needs the
 *  estate's own cast (journal-composer.test.tsx:113's idiom) — `next build` runs a stricter
 *  TypeScript than `pnpm typecheck` does and rejects the bare optional call. */
const attr = (n: unknown, k: string): string | null =>
  (n as { getAttribute?: (key: string) => string | null }).getAttribute?.(k) ?? null;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function refusal(code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message, details: null, hint: null }), {
    status: 400, headers: { "content-type": "application/json" },
  });
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

function read(over: Partial<WorkKnowledgeReadRow> = {}): WorkKnowledgeReadRow {
  return {
    work_id: "w-1",
    client_id: "c1",
    run_id: "wrun_01M20WGD9ETKK6RWCBA8CWG1GE",
    seq: 1,
    read_at: "2026-09-19T02:00:00Z",
    purpose: "accounting_work",
    as_of: "2026-09-19",
    knowledge_version: "42",
    status: "ok",
    reason: null,
    ...over,
  };
}

function App(props: { clientId?: string } = {}) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(KnowledgeRecordReads, {
      clientId: props.clientId ?? "c1", recordId: "rec-1",
    }),
  });
}

function mockReads(envelope: unknown): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rpc/list_work_knowledge_reads_for_record")) return jsonResponse(envelope);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
}

test("kr7.01 each row names the Work, the version, the period, the purpose and the face word", async () => {
  await withMockedEnv(
    mockReads({
      status: "ok", record_id: "rec-1", knowledge_key: "sst_regime", scope_kind: "client",
      client_id: "c1",
      reads: [read({ status: "partial", reason: "remainder truncated" })],
      truncated: false, hidden_count: 0, computed_at: "2026-09-19T03:00:00Z",
    }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Read partial/, "the FACE WORD, and it is one of the estate's four");
        assert.ok(!/unavailable/i.test(text), "the runtime's own word never reaches a face");
        assert.match(text, /Read at version 42/);
        assert.match(text, /for 2026-09-19/, "the PERIOD it read for, not the instant it read at");
        assert.match(text, /accounting_work/);
        assert.match(text, /remainder truncated/, "the door's own reason token, verbatim");
        const link = h.find((n) => n.tagName === "A" && String(attr(n, "href") ?? "").includes("/work/"));
        assert.ok(link, "the Work is reachable");
        assert.equal(attr(link, "href"), "/clients/c1/work/w-1");
        // READ-ONLY: no act hangs off a row. The only button on this surface is the failed-read
        // re-read, and this render has no failure.
        assert.equal(h.find((n) => n.tagName === "BUTTON"), null,
          "a record page must not become a second entrance to a Work");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("kr7.02 a firm-scope record links each row to the ROW's own client, not the page's", async () => {
  await withMockedEnv(
    mockReads({
      status: "ok", record_id: "rec-firm", knowledge_key: "reporting_framework",
      scope_kind: "firm", client_id: null,
      reads: [read({ work_id: "w-b", client_id: "c2" })],
      truncated: false, hidden_count: 0, computed_at: "2026-09-19T03:00:00Z",
    }),
    async () => {
      const h = await renderComponent(App({ clientId: "c1" }));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const link = h.find((n) => n.tagName === "A" && String(attr(n, "href") ?? "").includes("/work/"));
        assert.equal(attr(link, "href"), "/clients/c2/work/w-b",
          "a firm default is read by many clients; a link built from the page's client would point at the wrong workspace");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("kr7.03 an empty list says NO WORK HAS RECORDED A READ — not `unused`, and not an error", async () => {
  await withMockedEnv(
    mockReads({
      status: "ok", record_id: "rec-1", knowledge_key: "sst_regime", scope_kind: "client",
      client_id: "c1", reads: [], truncated: false, hidden_count: 0,
      computed_at: "2026-09-19T03:00:00Z",
    }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /No Work has recorded a read of this record/);
        assert.ok(!/unused|never used|nothing uses/i.test(text),
          "a run that predates the read-set recorded nothing; calling the record unused would be a claim the estate cannot support");
        assert.ok(h.find((n) => attr(n, "data-testid") === "knowledge-record-reads-empty"),
          "the empty face is its own node, not an error banner");
        assert.equal(h.find((n) => attr(n, "role") === "alert"), null,
          "…and it is not styled or announced as a failure");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("kr7.04 truncated renders the partial line with the door's own hidden count", async () => {
  await withMockedEnv(
    mockReads({
      status: "ok", record_id: "rec-1", knowledge_key: "sst_regime", scope_kind: "client",
      client_id: "c1",
      reads: [read(), read({ seq: 2, run_id: "wrun_01M20WGD9ETKK6RWCBA8CWG1GF" })],
      truncated: true, hidden_count: 47, computed_at: "2026-09-19T03:00:00Z",
    }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Showing the 100 most recent/, "the bound is stated, not implied");
        assert.match(text, /47 older read/, "the number is the DOOR's, never a subtraction this surface invents");
        assert.ok(h.find((n) => attr(n, "data-testid") === "knowledge-record-reads-truncated"));
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("kr7.05 a DENIED reads-read gets its own banner, and the revision timeline beside it still renders", async () => {
  const rec: KnowledgeRecordRow = {
    record_id: "rec-1", revision_id: "rev-1", revision_n: 1, scope_kind: "client", client_id: "c1",
    knowledge_key: "sst_regime", kind: "assertion", value: "sales_tax", applies_when: {},
    applies_when_digest: "d0", effective_from: null, effective_to: null,
    source_kind: "user_statement", trust: "asserted",
    source: { document_id: null, extraction_id: null, region_id: null, field_path: null, work_id: null },
    basis: "the client said so", asserted_by: "u-1", asserted_by_name: "Tan Wei Ming",
    recorded_via: "human_ui", recorded_at: "2026-09-12T02:00:00Z", knowledge_version: "7",
    revision_kind: "capture", revision_reason: null, supersedes_id: null, superseded_by: null,
    superseded_at: null, state: "live", editable: true, correctable: true,
  };
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_work_knowledge_reads_for_record")) {
        return refusal("CLR04", "insufficient role");
      }
      if (u.includes("/rpc/get_knowledge_record")) {
        return jsonResponse({
          record: rec,
          key: {
            knowledge_key: "sst_regime", kind: "assertion", value_shape: "string",
            validated_against: "enum:SST_REGIMES_V1", allowed_values: null,
            description: "Which SST regime this client is registered under.",
            authority_bearing: false,
          },
          revision_count: 1,
        });
      }
      if (u.includes("/rpc/get_knowledge_history")) {
        return jsonResponse({ record_id: "rec-1", revisions: [rec] });
      }
      if (u.includes("/rpc/get_knowledge_applicability")) {
        return refusal("CLR04", "insufficient role");
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(createElement(NextIntlClientProvider, {
        locale: "en", messages,
        children: createElement(KnowledgeDetail, { clientId: "c1", recordId: "rec-1" }),
      }));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        const text = h.text();
        assert.match(text, /You do not have access to this list/,
          "the denied reads-read gets its OWN banner, distinct from the detail's");
        assert.match(text, /Revision 1/, "…and the revision timeline beside it is unaffected");
        assert.match(text, /sales_tax/, "…as is the record itself");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
