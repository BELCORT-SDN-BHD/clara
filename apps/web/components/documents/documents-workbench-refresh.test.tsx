// D1 (web half) + SIBLING FLAW P1 — what a filing-changing act must re-read.
//
// THIS FILE EXISTS BECAUSE THE MUTANT PANEL FOUND ITS OWN GAP. Deleting
// `candidates.reload()` from `refreshFiled` left every existing cell green,
// including the browser leg's confirm-and-file walk — because a confirm goes
// through `candidates.act`, which re-reads that cell by itself
// (lib/parts/hooks.ts:229). The paths that were actually broken are the OTHER
// two callers of `refreshFiled`: an upload that auto-files, and a wrong-client
// correction. Both change the candidate population and neither re-read it.
//
// So the cells below drive `refreshFiled` through the one caller a unit
// environment can reach honestly — retiring a filing, whose act routes
// `DocumentDetail` -> `actAndRefreshFiled` -> `onFiledChanged` -> `refreshFiled`
// — and COUNT the reads on the wire. A count, not a rendered string: the
// candidates list legitimately looks identical before and after a re-read that
// returns the same rows, so "the list changed" could never have been the
// assertion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, clickButton, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DocumentsWorkbench } from "./documents-workbench";
import messages from "../../messages/en.json";

// The detail panel mounts @base-ui/react primitives (DocumentAdmin's Select,
// the door dialogs) whose floating-ui internals feature-detect against
// `window.Element`/`Node`. Without this the whole subtree throws "Element is
// not defined" from inside the primitive, surfacing only as an AggregateError
// out of React's act() — see test/domInspect.ts:435-460.
enableDomInspection();

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

const CLIENT = "client-1";
const DOCUMENT = "doc-1";
const FILING = "filing-1";

const DOC_ROW = {
  id: DOCUMENT, sha256: "abc123", original_filename: "invoice-april.pdf", mime_type: "application/pdf",
  byte_size: 20480, storage_path: "docs/doc-1.pdf", uploaded_by: "user-1", created_at: "2026-04-01T00:00:00Z",
  bytes_verified_at: "2026-04-01T00:00:01Z", page_count: 1, extraction_status: "done",
  document_kind: "invoice", financial_date: "2026-04-01", retention_state: "unanchored", retain_until: null,
  retention_basis: null, legal_hold: false, legal_hold_reason: null,
};

const FILING_ROW = {
  id: FILING, document_id: DOCUMENT, client_id: CLIENT, filed_at: "2026-04-02T00:00:00Z",
  filed_by: "user-1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "rev-1",
};

/** Counts every read this workbench makes, by relation. The mock answers each
 *  with the SAME rows every time — a re-read that returns identical data is the
 *  hard case, and the one a rendered-text assertion cannot see. */
function makeFetch(counts: Record<string, number>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const relation = /\/rest\/v1\/(?:rpc\/)?([a-z_]+)/.exec(url)?.[1] ?? "unknown";
    counts[relation] = (counts[relation] ?? 0) + 1;

    const body = (() => {
      switch (relation) {
        case "document_filings": return [FILING_ROW];
        case "documents": return [DOC_ROW];
        case "attribution_candidates": return [];
        case "clients": return [{ id: CLIENT, name: "Rome Properties", status: "active" }];
        case "document_extractions": return [];
        case "document_regions": return [];
        case "document_processing_tasks_visible": return [];
        case "journal_entries": return [];
        case "coding_tasks_visible": return [];
        case "lint_findings": return [];
        case "retire_document_filing": return { ok: true };
        default: return [];
      }
    })();
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function withWorkbench(run: (h: Awaited<ReturnType<typeof renderComponent>>, counts: Record<string, number>) => Promise<void>): Promise<void> {
  const counts: Record<string, number> = {};
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = makeFetch(counts);
  configureSessionTokenSource(async () => "tok");
  const h = await renderComponent(App(createElement(DocumentsWorkbench, { clientId: CLIENT })));
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    await run(h, counts);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

test("[the defect] retiring a filing re-reads the CANDIDATES cell, not only the filed cell", async () => {
  await withWorkbench(async (h, counts) => {
    const filedBefore = counts.document_filings ?? 0;
    const candidatesBefore = counts.attribution_candidates ?? 0;
    assert.ok(candidatesBefore > 0, "control: the candidates cell must have been read at least once on mount");

    // Select the filed document so its detail panel — and its Retire control —
    // mount at all.
    const row = h.find((n) => n.tagName === "TR" && textOf(n).includes("invoice-april.pdf"));
    assert.ok(row, "the filed document's row must render");
    await h.fireEvent(row!, "click");
    for (let i = 0; i < 8; i++) await h.settle();

    // Retire needs a reason before its button admits a click; `clickButton`
    // THROWS on a disabled node, so the gate is asserted by acting on it.
    const reasonField = h.find((n) => n.tagName === "INPUT" && (n as { getAttribute?: (k: string) => unknown }).getAttribute?.("aria-label") === "Reason (required to retire)");
    assert.ok(reasonField, "the retire-reason field must render");
    await h.act(() => { setFieldValue(reasonField!, "filed to the wrong period"); });
    for (let i = 0; i < 3; i++) await h.settle();

    const retire = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Retire");
    assert.ok(retire, "the retire control must render");
    await clickButton(retire!);
    for (let i = 0; i < 10; i++) await h.settle();

    // THE DISCRIMINATING POST-CONDITION, and it is a COUNT. Both cells must
    // have been re-read. Before this fix only `document_filings` grew.
    assert.ok(
      (counts.document_filings ?? 0) > filedBefore,
      "control: the filed cell must re-read after a retire — if this fails the act never fired and the cell below proves nothing",
    );
    assert.ok(
      (counts.attribution_candidates ?? 0) > candidatesBefore,
      `the candidates cell must be re-read after a filing-changing act — saw ${counts.attribution_candidates} reads, unchanged from ${candidatesBefore}`,
    );
  });
});

test("SIBLING P1: a filing-changing act also re-hydrates the coding lane's own cells", async () => {
  // `CodingLanePanel` hydrates three cells on mount and re-reads them only
  // after ITS OWN acts, so every filing act on this tab left them stale. The
  // epoch key remounts the whole panel; a re-read of `lint_findings` (a cell
  // NOTHING on the documents half touches directly) is the sharpest evidence
  // that the remount happened rather than some other read firing.
  await withWorkbench(async (h, counts) => {
    const lintBefore = counts.lint_findings ?? 0;
    assert.ok(lintBefore > 0, "control: the coding lane's lint cell must have been read on mount");

    const row = h.find((n) => n.tagName === "TR" && textOf(n).includes("invoice-april.pdf"));
    await h.fireEvent(row!, "click");
    for (let i = 0; i < 8; i++) await h.settle();
    const reasonField = h.find((n) => n.tagName === "INPUT" && (n as { getAttribute?: (k: string) => unknown }).getAttribute?.("aria-label") === "Reason (required to retire)");
    await h.act(() => { setFieldValue(reasonField!, "filed to the wrong period"); });
    for (let i = 0; i < 3; i++) await h.settle();
    await clickButton(h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Retire")!);
    for (let i = 0; i < 10; i++) await h.settle();

    assert.ok(
      (counts.lint_findings ?? 0) > lintBefore,
      `the coding lane must re-hydrate after a filing act — saw ${counts.lint_findings} lint reads, unchanged from ${lintBefore}`,
    );
  });
});
