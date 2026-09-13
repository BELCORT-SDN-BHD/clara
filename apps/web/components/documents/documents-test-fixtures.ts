// SHARED TEST FIXTURES for the Documents workbench's RTL battery — deliberately NOT a `.test.ts`
// file, the same discipline `components/firm/activity/activity-test-fixtures.ts` and
// `components/admin/members-fixtures.ts` already established: importing one test file from another
// re-runs its cases inside the importer, inflating counts and hiding which file proved what.
// `scripts/check-test-manifest.mjs` globs `*.test.{ts,tsx,js,jsx,mjs,cjs}` and correctly ignores
// this one, so it stays out of the manifest and out of the runner.
//
// THE NAVIGATION STUB IS STATEFUL, and that is the whole reason this file exists. Selecting a
// document is now a `router.push` and the selection is read back out of `?document=` — so a router
// whose `push` does nothing leaves the component reading the URL it started with, the detail panel
// never mounts, and every cell downstream of a row click passes or fails for the wrong reason.
// `makeNavigation` therefore keeps a real history stack: push appends, replace rewrites the top,
// and `back()` pops. A test calls `sync()` after a navigation to re-render the tree with the new
// search params, which is exactly what the App Router does to a client component when only the
// query changes.

import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import messages from "../../messages/en.json";

export const DOCUMENTS_CLIENT = "c1111111-1111-4111-8111-111111111111";
export const DOCUMENTS_PATHNAME = `/clients/${DOCUMENTS_CLIENT}/documents`;

export const DOC_PDF = "d1111111-1111-4111-8111-111111111111";
export const DOC_XML = "d2222222-2222-4222-8222-222222222222";

export const DOC_ROWS: Record<string, Record<string, unknown>> = {
  [DOC_PDF]: {
    id: DOC_PDF, sha256: "a".repeat(64), original_filename: "invoice-april.pdf",
    mime_type: "application/pdf", byte_size: 20480, storage_path: "docs/pdf", uploaded_by: "u1",
    created_at: "2026-04-01T00:00:00Z", bytes_verified_at: "2026-04-01T00:00:01Z", page_count: 1,
    extraction_status: "done", document_kind: "invoice", financial_date: "2026-04-01",
    retention_state: "unanchored", retain_until: null, retention_basis: null,
    legal_hold: false, legal_hold_reason: null,
  },
  [DOC_XML]: {
    id: DOC_XML, sha256: "b".repeat(64), original_filename: "myinvois-e-invoice.xml",
    mime_type: "application/xml", byte_size: 4096, storage_path: "docs/xml", uploaded_by: "u1",
    created_at: "2026-04-02T00:00:00Z", bytes_verified_at: "2026-04-02T00:00:01Z", page_count: null,
    extraction_status: "stored_unparsed", document_kind: "e_invoice_xml", financial_date: "2026-04-02",
    retention_state: "unanchored", retain_until: null, retention_basis: null,
    legal_hold: false, legal_hold_reason: null,
  },
};

export const FILING_ROWS = [
  {
    id: "f1111111-1111-4111-8111-111111111111", document_id: DOC_PDF, client_id: DOCUMENTS_CLIENT,
    filed_at: "2026-04-02T09:00:00Z", filed_by: "u1", basis: "human",
    retired_at: null, retirement_reason: null, revision_token: "rev-pdf-1",
  },
  {
    id: "f2222222-2222-4222-8222-222222222222", document_id: DOC_XML, client_id: DOCUMENTS_CLIENT,
    filed_at: "2026-04-03T09:00:00Z", filed_by: "u1", basis: "human",
    retired_at: null, retirement_reason: null, revision_token: "rev-xml-1",
  },
];

export type Navigation = {
  /** The stub handed to `AppRouterContext` — the same six methods the real one exposes. */
  router: { replace: (url: string) => void; push: (url: string) => void; back: () => void; forward: () => void; refresh: () => void; prefetch: () => void };
  /** The current query string, without the leading `?`. */
  search: () => string;
  /** Every URL this stub has been navigated to, in order — a cell asserts on the SHAPE of the
   *  history, not only on where it ended up (a push and a replace reach the same address). */
  entries: () => string[];
  /** How each navigation was performed, in order: "push" | "replace" | "back". */
  kinds: () => string[];
};

export function makeNavigation(initialSearch = ""): Navigation {
  const stack: string[] = [initialSearch];
  const kinds: string[] = [];
  const visited: string[] = [initialSearch];

  const searchOf = (url: string): string => {
    const i = url.indexOf("?");
    return i === -1 ? "" : url.slice(i + 1);
  };

  return {
    router: {
      push: (url: string) => { kinds.push("push"); stack.push(searchOf(url)); visited.push(searchOf(url)); },
      replace: (url: string) => { kinds.push("replace"); stack[stack.length - 1] = searchOf(url); visited.push(searchOf(url)); },
      back: () => {
        kinds.push("back");
        if (stack.length > 1) stack.pop();
        visited.push(stack[stack.length - 1]!);
      },
      forward: () => {},
      refresh: () => {},
      prefetch: () => {},
    },
    search: () => stack[stack.length - 1]!,
    entries: () => [...visited],
    kinds: () => [...kinds],
  };
}

export function documentsApp(children: ReactElement, nav: Navigation): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams(nav.search()) as never },
      createElement(
        AppRouterContext.Provider as never,
        { value: nav.router as never },
        createElement(PathnameContext.Provider as never, { value: DOCUMENTS_PATHNAME as never }, children as never),
      ),
    ),
  }) as ReactElement;
}

/** PostgREST's reads for this surface, counted by relation so a cell can assert a RE-READ happened
 *  (a re-read that returns identical rows is invisible to a rendered-text assertion). `docs`
 *  decides which document rows exist — a cell that wants an unknown id simply omits it. */
export function documentsFetch(opts: {
  counts?: Record<string, number>;
  docs?: Record<string, Record<string, unknown>>;
} = {}): typeof fetch {
  const counts = opts.counts ?? {};
  const docs = opts.docs ?? DOC_ROWS;
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const relation = /\/rest\/v1\/(?:rpc\/)?([a-z_]+)/.exec(url)?.[1] ?? "unknown";
    counts[relation] = (counts[relation] ?? 0) + 1;

    const body = (() => {
      switch (relation) {
        case "document_filings":
          return FILING_ROWS.filter((f) => docs[f.document_id] !== undefined);
        case "documents": {
          const ids = /id=in\.\(([^)]*)\)/.exec(url)?.[1]?.split(",").map((v) => decodeURIComponent(v.trim())) ?? [];
          return ids.map((id) => docs[id]).filter(Boolean);
        }
        case "clients": return [{ id: DOCUMENTS_CLIENT, name: "Rome Properties", status: "active" }];
        case "attribution_candidates": return [];
        case "document_extractions": return [];
        case "document_regions": return [];
        case "document_processing_tasks_visible": return [];
        case "journal_entries": return [];
        case "coding_tasks_visible": return [];
        case "lint_findings": return [];
        default: return [];
      }
    })();
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
