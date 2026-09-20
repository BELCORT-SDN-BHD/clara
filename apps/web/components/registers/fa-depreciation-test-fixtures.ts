// #651 — the shared fixtures for the depreciation surfaces' unit cells. NOT a test file (the name
// does not end in `.test.tsx`), so the manifest does not list it.
//
// THE NAVIGATION STUB IS `documents-test-fixtures.ts`'s, deliberately reused in SHAPE rather than
// imported: the asset detail's `?tab=` is the same contract the Documents workbench's `?document=`
// is, and the thing both cells must be able to assert is the HISTORY VERB — a push and a replace
// reach the same address and differ only in what Back then does, so a cell that asserted the
// address would pass on the exact defect it exists to catch.

import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import messages from "../../messages/en.json";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import type { FaDepreciationAuthorityEnvelope } from "../../lib/registers/depreciation";

export const FA_CLIENT = "c1111111-1111-4111-8111-111111111111";
export const FA_ASSET = "a1111111-1111-4111-8111-111111111111";
export const FA_ASSET_PRED = "a0000000-0000-4000-8000-000000000000";
export const FA_PATHNAME = `/clients/${FA_CLIENT}/registers/assets/${FA_ASSET}`;

export type Navigation = {
  router: { replace: (url: string) => void; push: (url: string) => void; back: () => void; forward: () => void; refresh: () => void; prefetch: () => void };
  search: () => string;
  entries: () => string[];
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

export function faApp(children: ReactElement, nav: Navigation, pathname = FA_PATHNAME): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams(nav.search()) as never },
      createElement(
        AppRouterContext.Provider as never,
        { value: nav.router as never },
        createElement(PathnameContext.Provider as never, { value: pathname as never },
          createElement("div", null, createElement("h1", null, "Fixed asset"), children) as never),
      ),
    ),
  }) as ReactElement;
}

/** A plain intl wrapper for the surfaces that do not read the router. */
export function intlApp(children: ReactElement): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement("div", null, createElement("h1", null, "Fixed assets"), children),
  }) as ReactElement;
}

const baseRow = {
  status: "active", particulars_complete: true, acquired_date: "2026-03-01",
  superseded_at: null, residual_cents: 0, accumulated_cents: 0, nbv_cents: 360000,
  rate_bps: null, asset_account: "1510", accum_account: "1519", expense_account: "6510",
  ca_class: null, is_commercial_vehicle: null, is_new: null,
  superseded_by_asset_id: null, disposed_at: null, disposal_entry_id: null,
  uncharged_due_count: 0, split_month_advisory_count: 0,
  disposal_draft_outstanding: false, disposal_draft_entry_id: null,
  acquisition_entry_id: "e-1111", acquisition_line_id: "l-1111", acquisition_document_id: null,
  change_class: null as string | null, change_reason: null as string | null,
};

export const faRow = (over: Record<string, unknown> = {}) => ({
  ...baseRow,
  id: FA_ASSET, description: "Air compressor", cost_cents: 360000,
  effective_from: "2026-06-01", method: "straight_line", useful_life_months: 48, start_date: "2026-03-01",
  change_class: "estimate", change_reason: "the plant survey revised the life to 48 months",
  ...over,
});

/** The generation this asset superseded — no class, because it is a ROOT row. */
export const faPredecessor = (over: Record<string, unknown> = {}) => ({
  ...baseRow,
  id: FA_ASSET_PRED, description: "Air compressor", cost_cents: 360000, status: "superseded",
  effective_from: null, method: "straight_line", useful_life_months: 36, start_date: "2026-03-01",
  change_class: null, change_reason: null, superseded_by_asset_id: FA_ASSET,
  ...over,
});

export const faCharge = (over: Record<string, unknown> = {}) => ({
  id: "ch-1", period_start: "2026-03-01", period_end: "2026-03-31", amount_cents: 10000,
  effective_date: "2026-03-31", entry_id: "e-2222", run_id: "r-1", unwind_of: null,
  ...over,
});

export const faAcquisition = {
  entry_id: "e-1111", line_id: "l-1111", document_id: null, document_filename: null,
  document_mime: null, document_sha256: null, document_kind: null,
  posting_date: "2026-03-01", approved_at: "2026-03-01T02:00:00Z", entry_status: "approved",
  entry_origin: "agent", memo: "Compressor purchased", reversal_of: null, reversed_by: null,
  acquired_date: "2026-03-01", cost_cents: 360000, currency: "MYR", asset_account: "1510",
  work_id: null, receipt_id: null, receipt_logical_op_id: null, receipt_created_at: null,
  on_behalf_of: null, work_status: null, work_purpose: null, derived_from: "acquisition_entry",
};

export const faParticularsBlock = {
  complete: true, method: "straight_line", useful_life_months: 48, rate_bps: null,
  residual_cents: 0, start_date: "2026-03-01", description: "Air compressor", ca_class: null,
  is_commercial_vehicle: null, is_new: null, non_depreciable: false,
};

export const faHistoryBlock = {
  status: "active", acquisition_entry_id: "e-1111", acquisition_reversed_by: null,
  acquisition_reversed_at: null, acquisition_reverses: null, supersedes_asset_id: FA_ASSET_PRED,
  superseded_by_asset_id: null, superseded_at: null, disposed_at: null, disposal_entry_id: null,
  related: [], chain_open: false,
};

export const faDetail = (over: Record<string, unknown> = {}) => ({
  asset: faRow(), lineage: [faPredecessor()], charges: [faCharge()], schedule: [],
  uncharged_due: [], acquisition: faAcquisition, particulars: faParticularsBlock,
  history: faHistoryBlock,
  ...over,
});

export const FA_COA = [
  { account_code: "1510", name: "Plant & machinery", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "1519", name: "Accumulated depreciation", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "6510", name: "Depreciation expense", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
];

export const faPreview = (over: Record<string, unknown> = {}) => ({
  client_id: FA_CLIENT, due: true, reason: null,
  period_start: "2026-07-01", period_end: "2026-07-31", cadence: "monthly",
  authority_from: "2026-03-01", authority_ref: { kind: "chat_task", id: "t-1" },
  skipped_closed: [],
  charges: [{ asset_id: FA_ASSET, description: "Air compressor", period_start: "2026-07-01", period_end: "2026-07-31", amount_cents: 7500 }],
  skipped: [],
  legs: [
    { account_code: "6510", debit_cents: 7500, credit_cents: 0 },
    { account_code: "1519", debit_cents: 0, credit_cents: 7500 },
  ],
  charged_cents: 7500, entries: 1, mode_would_be: "draft", ramp_earned: false,
  ...over,
});

// #979: typed `Partial<FaDepreciationAuthorityEnvelope>` rather than `Record<string, unknown>`
// (this file's other `over` params) — this fixture is passed DIRECTLY as `AuthorityCeremony`'s
// strictly-typed `data` prop (unlike `faPreview`, whose callers always go through `jsonResponse`,
// which erases to `unknown`), so a status override needs its literal ("retired") preserved rather
// than widened to `string`.
export const faAuthorityEnvelope = (over: Partial<FaDepreciationAuthorityEnvelope> = {}): FaDepreciationAuthorityEnvelope => ({
  client_id: FA_CLIENT,
  authority: {
    id: "au-1", status: "live", cadence: "monthly", proposed_by: "u1", signed_by: "u2",
    retired_by: null, created_at: "2026-03-01T00:00:00Z",
    authority_from: "2026-03-01", authority_kind: "explicit_instruction",
    authority_ref: { kind: "chat_task", id: "t-1111111-1111-4111-8111-111111111111" },
  },
  ramp_earned: false,
  fy_end: { month: 12, day: 31, fallback: false },
  high_stakes_threshold_cents: 1000000,
  ...over,
});

export const faRun = (over: Record<string, unknown> = {}) => ({
  id: "run-1", authority_id: "au-1", period_start: "2026-06-01", period_end: "2026-06-30",
  mode: "draft", entries: 1, charged_cents: 10000, skipped: [], entry_id: "e-3333",
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

/** Every node under `root` matching `pred`, in document order. `RenderHarness` exposes `find`
 *  (first match) but not `findAll`, and several cells here are about how MANY rows render. */
export type StubNode = {
  tagName?: string;
  childNodes?: StubNode[];
  getAttribute?: (n: string) => string | null;
  props?: Record<string, unknown>;
};
export function findAll(root: StubNode, pred: (n: StubNode) => boolean): StubNode[] {
  const out: StubNode[] = [];
  const walk = (n: StubNode) => {
    if (pred(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

/** A node attribute, or null. The render harness's own `Stub` type does not declare
 *  `getAttribute` as callable, so every attribute read in these cells goes through here. */
export const attr = (n: StubNode, name: string): string | null => n.getAttribute?.(name) ?? null;

/** A node's `data-testid`, or "". */
export const tid = (n: StubNode): string => String(n.getAttribute?.("data-testid") ?? "");

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Run `run()` with `fetch` stubbed and a session token configured, restoring both afterwards. */
export function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
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
