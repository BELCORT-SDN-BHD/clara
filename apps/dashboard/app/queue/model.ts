// Pure queue logic (contract §4 / DIRECTION List model) — no React, no DB, fully
// unit-testable: the URL cursor codec (fail-closed), the five-screen-state selector,
// the always-on fuzzy filter, section grouping, and the batch selection model
// (high-stakes rows are NOT selectable — the DB re-refuses regardless, WA-R7/WA-D5).

import type { QueueRow } from "../shared/reviewTypes";

// --- URL cursor codec (keyset; malformed → null so the list resets to page 1) ---

export function encodeCursor(cursor: { tuple: string[] } | null): string {
  if (!cursor || cursor.tuple.length === 0) return "";
  try {
    return encodeURIComponent(JSON.stringify(cursor.tuple));
  } catch {
    return "";
  }
}

/** Decode the URL cursor param fail-closed: any malformed value yields null (§6 row 10
 *  — the DB also re-validates and refuses CLR10). */
export function decodeCursor(raw: string | null | undefined): { tuple: string[] } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((x) => typeof x === "string")) return null;
    return parsed.length > 0 ? { tuple: parsed as string[] } : null;
  } catch {
    return null;
  }
}

// --- Five screen states (DIRECTION §4.5: Empty · Loading · Error · Partial · Ideal) ---

export type ScreenState = "loading" | "error" | "empty" | "partial" | "ideal";

export function queueScreenState(env: {
  loading: boolean;
  error: boolean;
  totalRows: number;
  visibleRows: number;
  loadingMore: boolean;
  hasMore: boolean;
}): ScreenState {
  if (env.error && env.totalRows === 0) return "error";
  if (env.loading && env.totalRows === 0) return "loading";
  if (env.totalRows === 0) return "empty";
  if (env.visibleRows === 0) return "empty"; // filtered to nothing — still an empty state (with guidance)
  if (env.loadingMore || env.hasMore) return "partial";
  return "ideal";
}

// --- Always-on fuzzy filter (client-side, over the loaded page) ----------------

/** A cheap subsequence match over a row's human-visible tokens. Case-insensitive.
 *  Empty query matches everything. */
export function rowMatches(row: QueueRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const hay = [
    row.question_text ?? "",
    row.period ?? "",
    row.lane ?? "",
    row.row_kind,
    row.client_id ?? "",
    row.counterparty_id ?? "",
  ]
    .join(" ")
    .toLowerCase();
  let i = 0;
  for (const ch of q) {
    i = hay.indexOf(ch, i);
    if (i === -1) return false;
    i += 1;
  }
  return true;
}

export function filterRows(rows: QueueRow[], query: string): QueueRow[] {
  return rows.filter((r) => rowMatches(r, query));
}

// --- Section grouping (by lane band; the envelope's total order is preserved) --

export type QueueSectionKey = "needs_review" | "needs_you";
/** needs_you renders FIRST (WA21-R14, ADR-031): the exception/blocking band — open
 *  questions, needs_you-lane filings/drafts, crossed/overdue watches — outranks routine
 *  throughput, matching the envelope's rank-1-first total order and the §2.3
 *  top-of-queue contract. (Envelope wrinkle: needs_you-lane DRAFTS are rank 2 in the
 *  0016 sort tuple — DB alignment is a 0017 candidate; the UI hoists them per page.) */
export const SECTION_ORDER: QueueSectionKey[] = ["needs_you", "needs_review"];
export const SECTION_TITLE: Record<QueueSectionKey, string> = {
  needs_review: "Needs review",
  needs_you: "Needs you",
};

export function groupBySection(rows: QueueRow[]): { key: QueueSectionKey; rows: QueueRow[] }[] {
  return SECTION_ORDER.map((key) => ({ key, rows: rows.filter((r) => r.section === key) })).filter((g) => g.rows.length > 0);
}

// --- Batch selection model (WA-R7: routine-only; high-stakes excluded) ---------

/** Only an open DRAFT that is NOT high-stakes may be batch-selected. The DB's
 *  approve_routine_entry re-refuses high-stakes regardless (CLR05) — this is the UI
 *  half of a defense-in-depth pair, never the sole guard. */
export function isSelectable(row: QueueRow): boolean {
  return row.row_kind === "draft" && !row.high_stakes && !!row.entry_id;
}

export function selectableRows(rows: QueueRow[]): QueueRow[] {
  return rows.filter(isSelectable);
}
