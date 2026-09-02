// T10's own copy of the cents formatter — same reasoning as
// components/reports/DoorDialog.tsx's header on why it duplicates rather than
// cross-imports components/close's near-identical twin, and as
// lib/bank/money.ts's own duplicate of lib/registers/money.ts's
// parseAmountToCents: one small formatter per domain, file-disjoint by
// construction, so components/firm-admin stays independently reviewable.
// This module renders ONLY — every cents figure it formats is a DB-owned
// bigint copied verbatim, whether from list_review_queue's `compliance`
// envelope or (N2, independent review, PR #489 — FS-8 PR-2 widened this
// module's own consumers) a plain `clara.firms.high_stakes_amount_cents`
// column read; it never computes one. The one genuinely NEW write surface
// FS-8 PR-2 adds (a human-typed threshold amount) needed the opposite
// direction — a parser, not a formatter — so that lives in
// `./settings.ts` instead of here, to keep this file's own "renders ONLY"
// contract true rather than merely stated.

/** Rendered when a cents value is absent. */
export const CENTS_UNAVAILABLE = "—";

function isSafeCents(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isSafeInteger(v);
}

/** Format integer cents as `RM 1,234.56`. `unsafeLabel` is the i18n'd marker
 *  for the "present but not a safe JS integer" case (lib/registers/money.ts's
 *  own header explains why this is a real, checked condition rather than
 *  theoretical). */
export function fmtCents(cents: number | null | undefined, unsafeLabel: string): string {
  if (cents === null || cents === undefined) return CENTS_UNAVAILABLE;
  if (!isSafeCents(cents)) return unsafeLabel;
  const neg = cents < 0;
  const s = (Math.abs(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}RM ${s}`;
}

/** A short id chip label (first 8 chars) — matches the house `id.slice(0, 8)` idiom. */
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : CENTS_UNAVAILABLE;
}
