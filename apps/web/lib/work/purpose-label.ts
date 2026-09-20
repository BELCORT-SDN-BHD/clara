// #643 — THE ONE MAPPING FROM `clara.accounting_work.purpose` TO A HUMAN LABEL.
//
// WHY IT IS A MODULE AND NOT THREE INLINE TERNARIES. #634 rendered the purpose on the Work detail
// and on the journals row with `purpose === "journal_entry" ? t(…) : purpose`, and the firm
// Activity feed carried a third copy of the same shape. That was honest while the column's CHECK
// admitted exactly one value; migration 0194 admits three, and three independent ternaries are
// three places for the fourth to be forgotten — the day a payroll obligation renders as
// `payroll_obligation` on one surface and as "Supplied payroll obligation" on another, the product
// is telling a reader two things about one row.
//
// AN UNKNOWN PURPOSE RENDERS VERBATIM, which is the rule #634 established here and which matters
// MORE now that the vocabulary can grow: a build that has not learned a value shows the value,
// rather than crashing on a missing message key or inventing a label for something it does not
// know. That is `basis_origin`'s posture on the same page, and `activity.ts`'s own note about a
// purpose "this build has not registered a label for".

/** The message-key suffix for a purpose, under whichever namespace the caller reads. `null` when
 *  this build has no label for the value — the caller renders the raw string. */
// #984 — THE FOURTH VALUE, and the first that is not model-served. Migration 0239 widened
// `clara.accounting_work.purpose` to admit `opening_balance`: approving an opening seed or an
// opening correction now mints one Work and one operation receipt for the batch, on the owner's
// ruling of 2026-09-20. It reaches every surface below through this one map, which is exactly why
// the map exists — the alternative was a fourth place to forget.
const SUFFIX: Readonly<Record<string, string>> = Object.freeze({
  journal_entry: "JournalEntry",
  periodic_stock_adjustment: "PeriodicStockAdjustment",
  payroll_obligation: "PayrollObligation",
  opening_balance: "OpeningBalance",
});

/**
 * The label for one purpose, or the purpose itself when this build does not know it.
 *
 * `t` is the caller's own translator, and `prefix` its key stem — `ManualJournal`'s
 * `links.purpose…` on the Work detail and the journals row, which is where those two surfaces
 * already read their copy from. The mapping (which purposes exist, and which one is which) lives
 * here; the words stay with the surface that shows them.
 */
export function purposeLabel(
  purpose: string | null | undefined,
  t: (key: string) => string,
  prefix: string,
): string {
  if (purpose === null || purpose === undefined || purpose === "") return "";
  const suffix = SUFFIX[purpose];
  return suffix === undefined ? purpose : t(`${prefix}${suffix}`);
}

/** The Activity feed's own reading of the same fact: its labels are SENTENCES ("Recorded a journal
 *  entry") under a keyed map rather than nouns, so it takes the raw value as the key and falls
 *  back to the value for anything this build has not registered. */
export function isKnownWorkPurpose(purpose: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUFFIX, purpose);
}
