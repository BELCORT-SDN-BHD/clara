// The P3 Journals workbench's read shapes — DIRECT RLS reads (Q8/Q9: "workbench-
// first… direct RLS reads + governed doors — zero wire change"), never an RPC
// envelope. Every field below is transcribed from the LIVE catalog, cited by
// migration file:line (grounded 2026-08-27, frontier = 0136):
//
//   clara.journal_entries  packages/db/migrations/0003_books_core.sql:101-128
//     (+filing_id/withdrawn_* 0007:405-409, +ck withdrawn status 0007:1012-1019,
//     +proposed_counterparty/match_fingerprint/coding_kind/flags 0009:847-879)
//   clara.journal_lines    packages/db/migrations/0003_books_core.sql:137-151
//     (+counterparty_id 0009:881)
//   clara.coa_accounts     packages/db/migrations/0003_books_core.sql:47-59
//     (+account_class 0009:763, +is_bank_account 0038:252)
//   clara.counterparties   packages/db/migrations/0009_coding_floor.sql:812-839
//
// All four relations carry a table-level `grant select … to clara_authenticated`
// (0003_books_core.sql:522-525 for the first three; 0009_coding_floor.sql:2879-2880
// for counterparties) with forced RLS scoping every row to `firm_id =
// clara.jwt_firm()` (0003:504-517) — there is no dedicated view (grepped: no
// `create view` for any of these across every migration), so `getRows` reads the
// base table directly. RLS scopes by FIRM only, never by client — every read below
// filters `client_id=eq.<clientId>` itself.
//
// REVIEW FIX-ROUND (2026-08-27, independent review): every claim of "no later
// redefinition" this module made in its first pass was WRONG for three of the
// six live catalog verbs, caught by the estate's own documented failure mode —
// 0037_wave_c_a_subledger.sql:157-195's census names it: a bare `create (or
// replace)? function clara.<name>` grep is STRUCTURALLY BLIND to the
// change-of-record idiom this repo uses constantly (`pg_get_functiondef` ->
// `replace` -> a dynamic `EXECUTE` install, which contains no `create function`
// text at all). Every per-function header below now cites every PATCH this
// build found via that census — a migration's OWN prestate/tail assertions
// (its own `pg_get_functiondef` pulls, diffed against a named marker) are the
// only trustworthy record of a body's real history; a single migration file's
// text is not. Signatures (the arg list PostgREST calls through) are UNCHANGED
// by every patch found — only prosrc bodies were spliced.

/** journal_entries.status — 'draft'|'approved'|'withdrawn' after the 0007 ALTER
 *  (ck_journal_entries_status, 0007:1013-1014). `string` keeps the type honest
 *  against a value this module has not enumerated (never silently coerced). */
export type JournalEntryStatus = "draft" | "approved" | "withdrawn" | (string & {});

/** journal_entries.origin — 'manual'|'document'|'agent'|'reversal' (0003:108,
 *  widened by a later ALTER at 0041:766-767 whose exact new members this module
 *  does not need — `string` keeps it honest either way). */
export type JournalEntryOrigin = "manual" | "document" | "agent" | "reversal" | (string & {});

export type JournalEntryRow = {
  id: string;
  client_id: string;
  status: JournalEntryStatus;
  posting_date: string | null;
  memo: string | null;
  origin: JournalEntryOrigin;
  document_id: string | null;
  coding_kind: string | null;
  /** uuid — the optimistic-concurrency token `approve_entry`/`revise_entry`
   *  require as `p_expected_revision` (0003:119; CLR06 "stale revision token"
   *  on a mismatch, e.g. 0016_a21_compliance_watch.sql:4814-4816). */
  revision_token: string;
  maker_actor: string | null;
  checker_actor: string | null;
  approved_at: string | null;
  reversal_of: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  withdrawn_at: string | null;
  withdrawal_reason: string | null;
  created_at: string | null;
};

export type JournalLineRow = {
  id: string;
  entry_id: string;
  line_no: number;
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  description: string | null;
  counterparty_id: string | null;
};

export type CoaAccountRow = {
  client_id: string;
  account_code: string;
  name: string;
  account_type: string;
  is_active: boolean;
};

export type CounterpartyRow = {
  id: string;
  name: string;
};

/** The line shape every writer below sends as one element of `p_lines` (a bare
 *  jsonb array — the legacy/simple shape `revise_entry` still accepts byte-
 *  identically per its own header, 0016_a21_compliance_watch.sql:4781-4786;
 *  `draft_entry`/`_draft_entry_core` never accepted the wrapper shape at all). */
export type EntryLineInput = {
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  description?: string | null;
};

/** The combined read this workbench hydrates on mount and after every door call
 *  (hydrate-never-trust, lib/parts/hooks.ts's header) — one client's full
 *  journals picture, fetched in parallel. */
export type JournalsData = {
  entries: JournalEntryRow[];
  /** FIX-1 (independent review): `getRows` requests one MORE row than
   *  `FETCH_CAP` (api.ts) — `true` here means the table actually holds more
   *  rows than were returned, i.e. `entries` is an INCOMPLETE page, not the
   *  whole table. A PostgREST/Supabase `db-max-rows` ceiling (1000 by default)
   *  would otherwise truncate a large client's history SILENTLY. */
  entriesTruncated: boolean;
  lines: JournalLineRow[];
  /** Same caveat as `entriesTruncated`, for `journal_lines` — this is the field
   *  that actually matters: a truncated line set makes EVERY client-side sum
   *  derived from `lines` unverifiable, not just the affected entry's (line
   *  order is `entry_id.asc`, a UUID sort with no relation to recency, so a
   *  truncation can silently drop lines from ANY entry, not only the newest). */
  linesTruncated: boolean;
  accounts: CoaAccountRow[];
  counterparties: CounterpartyRow[];
  /** row_kind === 'draft' rows only (client-side filtered — the RPC's own union
   *  also carries uncoded_filing/open_question/coding_task/compliance_watch rows
   *  that belong to OTHER tabs' future queues, never this one). See api.ts's
   *  `listReviewQueue` header for why this rides an RPC, not `getRows`. */
  queueRows: ReviewQueueRow[];
  /** FIX-6 (independent review): the envelope's `counts` block, DB-computed
   *  over the FULL union BEFORE `p_limit` truncates the page
   *  (0016_a21_compliance_watch.sql:4674-4681) — `counts.open_drafts` is the
   *  TRUE total draft count regardless of how many `queueRows` this tab could
   *  fit under its own `p_limit`. Comparing the two is the only honest way to
   *  tell "no drafts" apart from "more drafts than this page could hold". */
  queueCounts: ReviewQueueCounts;
};

// --- clara.list_review_queue (READ RPC — see api.ts's listReviewQueue header) --
// Envelope + row shape PORTED from apps/dashboard/app/shared/reviewTypes.ts's
// `QueueRow`/`toQueueRow` (the FINAL pin for this same live DB function) —
// mechanism, not look; trimmed to the fields this tab renders. Every row_kind
// the union can carry stays in the type (never narrowed away) so an
// unfiltered/non-draft row degrades honestly instead of typing as something it
// is not; this tab only ever DISPLAYS the ones where `row_kind === 'draft'`.
//
// PATCH HISTORY (N2 correction): created 0011_daily_loop.sql:3748, recut
// 0016_a21_compliance_watch.sql:4558-4909, then PATCHED (additive-only, an
// 'autodraft' attempt-budget key) at 0036's section C (~0036:1000-1073) — see
// this file's own header for why a bare grep missed that patch. Signature
// `(jsonb,jsonb,int)` unaffected; the `rows`/`counts` shape this module reads
// is unaffected too (0036's own tail assertion, ~0036:1743, requires the patch
// stay additive-only — "must be additive only", i.e. never drop an existing key).

export type ReviewQueueCounts = {
  open_drafts: number;
};

export type ReviewQueueRowKind =
  | "draft" | "uncoded_filing" | "open_question" | "coding_task" | "compliance_watch"
  | (string & {});
export type ReviewQueueSection = "needs_review" | "needs_you" | (string & {});

export type ReviewQueueRow = {
  row_kind: ReviewQueueRowKind;
  section: ReviewQueueSection;
  /** The 5-element cursor tuple for `p_cursor` continuation — carried through
   *  unused today (this tab does not paginate past `p_limit`; see api.ts). */
  sort: string[];
  client_id: string | null;
  entry_id: string | null;
  document_id: string | null;
  filing_id: string | null;
  lane: "ready" | "needs_review" | "needs_you" | null;
  high_stakes: boolean;
  aged_since: string | null;
  /** DB-COMPUTED (sum(debit_cents) over the entry's lines, done IN the
   *  list_review_queue query itself — 0016_a21_compliance_watch.sql:4599-4600),
   *  never a client-side sum: safe to render directly as the amount. */
  amount_cents: number | null;
  period: string | null;
  created_at: string | null;
  id: string;
  coding_kind: string | null;
};
