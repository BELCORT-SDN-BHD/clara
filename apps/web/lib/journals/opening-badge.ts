// #656 — C3's half of "the opening journal as an inspectable accounting result".
//
// THE DEFECT THIS CLOSES, stated plainly. An approved opening item posts an ordinary
// `clara.journal_entries` row with `origin='manual'`, `is_opening_balance=true` and
// `flags={opening_seed_id, opening_item_key}` (`0017:3375-3384`). `ENTRY_SELECT` did not read
// `is_opening_balance`, so on the client's Journals tab an opening balance was
// INDISTINGUISHABLE from a hand-keyed journal a colleague typed this morning — same origin word,
// same everything. A professional auditing the books could not tell which rows were the client's
// starting position and which were this period's work.
//
// WHY A SEPARATE MODULE FOR ONE BOOLEAN. `apps/web/lib/journals/api.ts` belongs to #655 this
// wave, and #656's whole allowance there is ONE hunk adding the column to `ENTRY_SELECT`. The
// derived question the face asks — "is this an opening entry, and where does it link back to?" —
// lives here instead, so the badge has a home and a test that does not touch a file another
// ticket is editing.

/** The tab an opening entry belongs to. `?tab=opening` already exists — `RegistersWorkbench`
 *  keeps the tab in the URL and is deliberately absent from the sidebar, so the link back is how
 *  a person reaches it from the books. */
export function openingBasisHref(clientId: string): string {
  return `/clients/${clientId}/registers?tab=opening`;
}

/** True for a row the opening lane posted. Read off the DATABASE'S OWN COLUMN — never inferred
 *  from `origin`, which is `'manual'` for an opening entry and for a hand-keyed one alike, and
 *  never from `memo` text. */
export function isOpeningEntry(entry: { is_opening_balance?: boolean | null }): boolean {
  return entry.is_opening_balance === true;
}
