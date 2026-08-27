// Pure, presentation-only helpers — no DB call, no door, no authoritative number
// of their own. Every value these compute is derived from rows the caller
// already read from the DB; the SUM below is explicitly a CLIENT-SIDE
// PRESENTATION SUM, not a DB-owned figure (hard constraint 2) — callers must
// label it as such wherever it renders (see components/journals's usage).

/** Widened to a structural subset (not the full `JournalLineRow`) so this ONE
 *  sum is reusable for both a read row (`JournalLineRow`, has `.id`/`.
 *  entry_id`/`.line_no`) and an in-progress edit (`EntryLineInput`, has
 *  neither) — N8 (independent review): reused by EntryLinesEditor's own
 *  footer instead of a THIRD hand-rolled reduce living next to this one. */
type Amounts = { debit_cents: number; credit_cents: number };

export type LineBalance = {
  /** Sum of `debit_cents` across the given lines — a client-side presentation
   *  sum for display only; the authoritative figure is whatever the DB itself
   *  reports (e.g. the review-queue row's own `amount_cents`, computed IN the
   *  DB — see api.ts's `listReviewQueue`). */
  debitCents: number;
  /** Sum of `credit_cents` across the given lines — same caveat as above. */
  creditCents: number;
  /** True when debit and credit sums are exactly equal — a PRESENTATION check
   *  only (the DB's own `_assert_balanced` is the real, authoritative gate a
   *  write can never bypass; this never blocks or overrides a door call). */
  balanced: boolean;
};

export function sumLines(lines: Amounts[]): LineBalance {
  let debitCents = 0;
  let creditCents = 0;
  for (const line of lines) {
    debitCents += line.debit_cents;
    creditCents += line.credit_cents;
  }
  return { debitCents, creditCents, balanced: debitCents === creditCents };
}

/** Cents -> "RM 1,234.56". Presentation formatting only — never a computed
 *  figure, just a display transform of a number the caller already has.
 *
 *  N9 (independent review): NOT the render path any more —
 *  components/journals/money.tsx's `<Money>` (next-intl's `useFormatter`) is,
 *  so every currency string in the UI goes through ONE locale-aware
 *  mechanism. This plain-string version is kept (and tested, below) as the
 *  documented fallback for a non-JSX/non-hook context — there is none in this
 *  module today, but a future server-side receipt line or a plain-text export
 *  would need exactly this, not a hook. */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const ringgit = Math.floor(abs / 100);
  const sen = String(abs % 100).padStart(2, "0");
  const withThousands = ringgit.toLocaleString("en-MY");
  return `${sign}RM ${withThousands}.${sen}`;
}
