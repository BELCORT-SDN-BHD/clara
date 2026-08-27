// The P3 Journals workbench's data layer (mission: replace the
// app/(firm)/clients/[clientId]/journals/page.tsx placeholder). Grounded against
// the LIVE catalog at frontier 0136 — every relation/RPC name below is cited by
// migration file:line in this module's own comments, never guessed.
//
// MECHANISM SPLIT (mohe-grill-rulings-2026-08-27.md Q8/Q9 + the firm lane's DB
// census, relayed by the conductor mid-build):
//   - A genuine RLS-scoped TABLE read (journal_entries/journal_lines/
//     coa_accounts/counterparties — all table-level `grant select … to
//     clara_authenticated`, no dedicated view exists for any of them) rides
//     `getRows` (lib/read.ts).
//   - "THE review queue" is not a table or a view — it is
//     `clara.list_review_queue(p_scope,p_cursor,p_limit)`, a READ RPC (0011/0016;
//     see `listReviewQueue` below). A read RPC still rides `callDoor` as its
//     TRANSPORT (callDoor is just the POST /rpc/<fn> primitive), but it is NOT a
//     governed act: no confirmation UI, no refusal-verbatim-never-retry posture
//     beyond what any failed read gets, and no re-read-after-mutation semantics
//     of its own (the workbench's own act() reload covers that already).
//
// GOVERNED WRITES (approve_entry / revise_entry / reverse_entry /
// record_client_resolution / draft_entry) ride `callDoor` for real — a thrown
// `DoorRefusal` from any of these is the DB's considered answer, rendered
// verbatim, never retried by this module (doors.ts's own header).

import { getRows, type GetRowsOptions } from "@/lib/read";
import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type {
  CoaAccountRow,
  CounterpartyRow,
  EntryLineInput,
  JournalEntryRow,
  JournalLineRow,
  JournalsData,
  ReviewQueueCounts,
  ReviewQueueRow,
} from "./types";

const opKey = () => crypto.randomUUID();

// =====================================================================
// Reads — direct RLS table reads (getRows).
// =====================================================================

/** FIX-1 (independent review): Supabase/PostgREST's documented `db-max-rows`
 *  default is 1000 — a plain `getRows` call with no `limit` silently returns
 *  AT MOST that many rows with no signal that more exist. Every bounded read
 *  below requests `FETCH_CAP + 1` and treats a full `FETCH_CAP + 1`-row answer
 *  as PROOF of truncation (never a guess): if the table held exactly
 *  `FETCH_CAP + 1` rows this reports a false positive, which is the correct
 *  failure direction — an honest "might be incomplete" beats a silent wrong
 *  total. */
const FETCH_CAP = 1000;

type Bounded<T> = { rows: T[]; truncated: boolean };

async function fetchBounded<T>(path: string, opts: Omit<GetRowsOptions, "limit">): Promise<Bounded<T>> {
  const rows = await getRows<T>(path, { ...opts, limit: FETCH_CAP + 1 });
  if (rows.length > FETCH_CAP) return { rows: rows.slice(0, FETCH_CAP), truncated: true };
  return { rows, truncated: false };
}

const ENTRY_SELECT =
  "id,client_id,status,posting_date,memo,origin,document_id,coding_kind,revision_token," +
  "maker_actor,checker_actor,approved_at,reversal_of,reversed_by,reversal_reason," +
  "withdrawn_at,withdrawal_reason,created_at";

/** clara.journal_entries, packages/db/migrations/0003_books_core.sql:101-128 —
 *  every status (draft/approved/withdrawn) for one client; the caller partitions
 *  by `.status` (drafts vs. posted vs. withdrawn — the last of which this
 *  mission's SCOPE does not surface). RLS scopes by FIRM only (0003:504-517), so
 *  `client_id` is filtered here, not left to the policy. Bounded per `FETCH_CAP`
 *  above — `.truncated` must be surfaced, never silently dropped. */
export async function listJournalEntries(
  session: SessionTokenAccessor,
  clientId: string,
  signal?: AbortSignal,
): Promise<Bounded<JournalEntryRow>> {
  return fetchBounded<JournalEntryRow>("journal_entries", {
    select: ENTRY_SELECT,
    filters: { client_id: `eq.${clientId}` },
    order: "created_at.desc",
    session,
    signal,
  });
}

const LINE_SELECT = "id,entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id";

/** clara.journal_lines, 0003_books_core.sql:137-151 (+counterparty_id, 0009:881).
 *  Fetched for the WHOLE client (never per-entry) so the workbench's one combined
 *  loader stays a single hydration cycle — the caller groups by `entry_id`.
 *  Bounded per `FETCH_CAP` above: `order` sorts by `entry_id` (a UUID, unrelated
 *  to recency), so a truncation can drop lines from ANY entry, not only the
 *  newest — `.truncated` must gate EVERY client-side sum derived from `rows`,
 *  not just the entries a naive "only the newest is at risk" guess would flag. */
export async function listJournalLines(
  session: SessionTokenAccessor,
  clientId: string,
  signal?: AbortSignal,
): Promise<Bounded<JournalLineRow>> {
  return fetchBounded<JournalLineRow>("journal_lines", {
    select: LINE_SELECT,
    filters: { client_id: `eq.${clientId}` },
    order: "entry_id.asc,line_no.asc",
    session,
    signal,
  });
}

/** clara.coa_accounts, 0003_books_core.sql:47-59 (+account_class, 0009:763).
 *  Every account (active and retired) — a retired code can still appear on an
 *  old line, and hiding its name would be a worse-than-honest degrade. */
export async function listCoaAccounts(
  session: SessionTokenAccessor,
  clientId: string,
  signal?: AbortSignal,
): Promise<CoaAccountRow[]> {
  return getRows<CoaAccountRow>("coa_accounts", {
    select: "client_id,account_code,name,account_type,is_active",
    filters: { client_id: `eq.${clientId}` },
    order: "account_code.asc",
    session,
    signal,
  });
}

/** clara.counterparties, 0009_coding_floor.sql:812-839 (grant at 0009:2879-2880).
 *  Used only to resolve a line's `counterparty_id` to a display name — optional
 *  context, never load-bearing for a number. */
export async function listCounterparties(
  session: SessionTokenAccessor,
  clientId: string,
  signal?: AbortSignal,
): Promise<CounterpartyRow[]> {
  return getRows<CounterpartyRow>("counterparties", {
    select: "id,name",
    filters: { client_id: `eq.${clientId}` },
    session,
    signal,
  });
}

// =====================================================================
// Reads — the review-queue READ RPC (transport: callDoor; not a governed act).
// =====================================================================

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function strArr(v: unknown): string[] {
  return arr(v).map((x) => (typeof x === "string" ? x : String(x)));
}

function toReviewQueueCounts(raw: unknown): ReviewQueueCounts {
  const o = (raw ?? {}) as Record<string, unknown>;
  return { open_drafts: numOrNull(o.open_drafts) ?? 0 };
}

function toReviewQueueRow(raw: unknown): ReviewQueueRow {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    row_kind: s(o.row_kind) ?? "draft",
    section: s(o.section) ?? "needs_review",
    sort: strArr(o.sort),
    client_id: s(o.client_id),
    entry_id: s(o.entry_id),
    document_id: s(o.document_id),
    filing_id: s(o.filing_id),
    lane: (s(o.lane) as ReviewQueueRow["lane"]) ?? null,
    high_stakes: bool(o.high_stakes),
    aged_since: s(o.aged_since),
    amount_cents: numOrNull(o.amount_cents),
    period: s(o.period),
    created_at: s(o.created_at),
    id: s(o.id) ?? "",
    coding_kind: s(o.coding_kind),
  };
}

/** READ RPC — transport via callDoor; not a governed act: no confirmation UI, no
 *  re-read-after semantics (the workbench's own reload already covers that).
 *
 *  clara.list_review_queue(p_scope jsonb, p_cursor jsonb, p_limit int default 50)
 *  — 0011_daily_loop.sql:3748, recut 0016:4558-4909, then DYNAMICALLY SPLICED
 *  at 0017 (lint_finding), 0036 §C (additive; its :1052 tail pins the 0017
 *  marker), 0041 (fixed_asset_incomplete), 0043 (staff_advance_incomplete) —
 *  types.ts's header explains why a bare grep missed the patches. Granted to clara_authenticated at viewer+
 *  (`_human_ctx(role_rank('viewer'))`, 0016:4563) — a plain read, not
 *  bookkeeper-gated. `p_scope` is `{}` (firm-wide) or `{client_id: uuid}`
 *  (0016:4564-4575); this module always scopes to the one client. `p_cursor`
 *  stays `null` here — this tab does not paginate past `p_limit` (see FIX-6
 *  below for how the empty-state honesty is preserved despite that).
 *
 *  Returns the union of draft/uncoded_filing/open_question/coding_task/
 *  compliance_watch rows for the scope (ordered section-first, so a large
 *  needs_you backlog of OTHER row kinds can push every draft off a `p_limit`
 *  page — FIX-6, independent review); this tab keeps only `row_kind ===
 *  'draft'` rows AND the envelope's `counts` block (DB-computed over the FULL
 *  union, BEFORE `p_limit` — 0016:4674-4681) so a caller can tell "no drafts"
 *  apart from "more drafts than this page could hold". `row_kind`/`section`
 *  are rendered VERBATIM by the caller — this mapper never relabels either. */
export async function listReviewQueue(
  session: SessionTokenAccessor,
  clientId: string,
  limit = 200,
  signal?: AbortSignal,
): Promise<{ rows: ReviewQueueRow[]; counts: ReviewQueueCounts }> {
  const out = await callDoor<unknown>(
    "list_review_queue",
    { p_scope: { client_id: clientId }, p_cursor: null, p_limit: limit },
    { session, signal },
  );
  const envelope = (out ?? {}) as Record<string, unknown>;
  return {
    rows: arr(envelope.rows).map(toReviewQueueRow).filter((row) => row.row_kind === "draft"),
    counts: toReviewQueueCounts(envelope.counts),
  };
}

// =====================================================================
// The combined hydration read — one client's full journals picture.
// =====================================================================

export async function loadJournalsWorkbench(
  session: SessionTokenAccessor,
  clientId: string,
  signal?: AbortSignal,
): Promise<JournalsData> {
  const [entriesRead, linesRead, accounts, counterparties, queue] = await Promise.all([
    listJournalEntries(session, clientId, signal),
    listJournalLines(session, clientId, signal),
    listCoaAccounts(session, clientId, signal),
    listCounterparties(session, clientId, signal),
    listReviewQueue(session, clientId, 200, signal),
  ]);
  return {
    entries: entriesRead.rows,
    entriesTruncated: entriesRead.truncated,
    lines: linesRead.rows,
    linesTruncated: linesRead.truncated,
    accounts,
    counterparties,
    queueRows: queue.rows,
    queueCounts: queue.counts,
  };
}

// =====================================================================
// Governed writes — callDoor, refusal verbatim, never retried.
// =====================================================================

/** clara.approve_entry(p_entry uuid, p_expected_revision uuid, p_attestation text
 *  default null, p_op_key text default null) — WRAPPER created
 *  packages/db/migrations/0004_governed_fns.sql:519, recut 0005/0007/0009,
 *  current wrapper body 0015_ar_myinvois_rules.sql:1536-1545 (grepped: exactly
 *  those definitions; the wrapper itself carries no logic beyond a role check
 *  and a delegation, so it is a poor dynamic-patch target — but see this
 *  file's types.ts header before trusting that as proof). It delegates to
 *  `_approve_entry_core`, whose LIVE body is the recut at
 *  0037_wave_c_a_subledger.sql:1750 (5-arity CREATE OR REPLACE — 0037's own
 *  census at :165-172 quoting the 0035:140-483 fifth recut is that file's
 *  PRESTATE, superseded by 0037 itself; the fold-delta review caught the
 *  off-by-one) — CLR06/CLR05 below are cited against the 0037 body. Bookkeeper+ (`_human_ctx`).
 *  The revision/idempotency pattern this ports from apps/dashboard/app/chat/
 *  review.ts:272-283 (`approveEntry`): `p_expected_revision` is the row's OWN
 *  `revision_token` at read time — a mismatch raises CLR06 "stale revision
 *  token"; a fresh `p_op_key` per call makes a retried click idempotent
 *  (`_reserve_op`/`_finish_op`). A high-stakes entry needing a DISTINCT checker
 *  from its maker raises CLR05 — rendered verbatim, never retried (doors.ts's
 *  header). */
export async function approveEntry(
  session: SessionTokenAccessor,
  entryId: string,
  expectedRevision: string,
  attestation?: string | null,
): Promise<void> {
  await callDoor(
    "approve_entry",
    { p_entry: entryId, p_expected_revision: expectedRevision, p_attestation: attestation ?? null, p_op_key: opKey() },
    { session },
  );
}

/** clara.revise_entry(p_entry uuid, p_lines jsonb, p_proposed_counterparty jsonb,
 *  p_evidence jsonb, p_expected_revision uuid, p_op_key text, p_amount_override
 *  jsonb default null, p_duplicate_override jsonb default null) — created
 *  packages/db/migrations/0009_coding_floor.sql:1750, recut 0011/0015, recut
 *  again 0016_a21_compliance_watch.sql:4765-4909, then PATCHED TWICE per
 *  0037_wave_c_a_subledger.sql:184-193's verified census — 0017:291-308 (a
 *  CLR31 opening-boundary preflight) and 0028:1443-1532 (binding-divergence +
 *  vendor-binding-resolution regions) — a bare `create (or replace)? function`
 *  grep finds only 0016 and is wrong by two changes of record (see types.ts's
 *  header). SIGNATURE unaffected by either patch. For a manual entry
 *  (`coding_kind is null`) neither a counterparty proposal nor cited evidence
 *  is required (the 0016 body's own gate, `coding_kind in
 *  ('supplier_bill','sales_invoice','sales_credit_note')`, is structural and
 *  not one of the two patched regions) — this workbench always passes `null`
 *  for both, matching the manual-compose ceremony `draftManualEntry` below
 *  uses. Replaces EVERY line (DELETE + bulk INSERT keyed by array position) —
 *  the caller sends the full new line set, not a delta. Returns
 *  `{revision_token}`: the NEW token, required for the next `approveEntry`
 *  call on this same entry (hydrate-never-trust: the caller still re-reads the
 *  row rather than trusting this value as the entry's whole new state — see
 *  FIX-5, drafts-queue-panel.tsx, for the lost-update this exists to prevent).
 *  CLR06 stale revision token; CLR07 unbalanced by more than 5c; CLR22 only a
 *  draft can be revised. */
export async function reviseEntry(
  session: SessionTokenAccessor,
  entryId: string,
  lines: EntryLineInput[],
  expectedRevision: string,
): Promise<string> {
  const out = await callDoor<{ revision_token?: string }>(
    "revise_entry",
    {
      p_entry: entryId,
      p_lines: lines,
      p_proposed_counterparty: null,
      p_evidence: null,
      p_expected_revision: expectedRevision,
      p_op_key: opKey(),
      p_amount_override: null,
      p_duplicate_override: null,
    },
    { session },
  );
  const next = out?.revision_token;
  if (!next) throw new Error("revise_entry returned no revision_token");
  return next;
}

/** clara.reverse_entry(p_entry uuid, p_reason text, p_op_key text) — LAW 6
 *  (reverse-not-delete): THERE IS NO DELETE VERB for a posted entry anywhere in
 *  the catalog (grepped: no `delete_entry`/`void_entry`/`delete from
 *  clara.journal_entries` reachable from the human lane) — this is the ONLY
 *  correction door. Created packages/db/migrations/0004_governed_fns.sql:560,
 *  recut 0005/0009, then PATCHED at LEAST THREE more times per the estate's own
 *  markers (a bare grep stops at 0009 and is wrong by three changes of record —
 *  see types.ts's header): 0017:255-271 (a CLR31 opening-boundary preflight),
 *  0037 section H.2 (~2125-2219, a subledger hook — an entry carrying open
 *  ALLOCATIONS now also refuses CLR10 "open items on this entry carry
 *  allocations; unallocate them first", detail `allocated_items_present`), and
 *  a "SEVENTH SPLICE" the 0043 migration's own header names (a staff-advance
 *  reversal wall, `_wdb_reversal_blocked`/`_adv_reversal_blocked` — an
 *  adjustment-pair half, an advance disbursement with outstanding
 *  applications, or a correction-carrying entry each refuse too). SIGNATURE
 *  `(uuid,text,text)` unaffected by any patch. This module does NOT replicate
 *  any of these gates client-side — the posted-panel's own affordance check is
 *  intentionally only `status==='approved' && !reversed_by && origin!=='reversal'`
 *  (the three conditions the DB itself makes structurally unrecoverable
 *  otherwise); every OTHER refusal above is real, expected, and rendered
 *  verbatim by FIX-2's per-row attribution rather than gated away. Bookkeeper+;
 *  requires a non-blank `p_reason`. Creates a mirror entry with every line's
 *  debit/credit SWAPPED and auto-approves it UNLESS it is itself high-stakes,
 *  in which case the mirror lands as a new DRAFT needing its own separate
 *  approval — the receipt's `status` reports which happened, but this module
 *  treats that as a REPORT only (doors.ts's header): the caller re-reads the
 *  entry list rather than painting the receipt's status as new UI truth. */
export async function reverseEntry(
  session: SessionTokenAccessor,
  entryId: string,
  reason: string,
): Promise<{ reversal_id: string; status: string }> {
  const out = await callDoor<{ reversal_id?: string; status?: string }>(
    "reverse_entry",
    { p_entry: entryId, p_reason: reason, p_op_key: opKey() },
    { session },
  );
  return { reversal_id: out?.reversal_id ?? "", status: out?.status ?? "" };
}

// --- Manual JE compose (SCOPE d) — a real two-call ceremony, grounded --------
//
// There is no single "create a manual journal entry" verb. A manual entry needs
// a `client_resolutions` row satisfying `assert_client_resolved` first
// (invariant 1 — every entry carries a client-attribution basis), THEN
// `draft_entry` itself:
//   1. clara.record_client_resolution(p_client uuid, p_subject_kind text,
//      p_subject uuid, p_confidence numeric, p_method text, p_evidence jsonb,
//      p_op_key text) — packages/db/migrations/0004_governed_fns.sql:490-497.
//      Grepped: exactly one static `create function`, one call site — UNLIKE
//      revise_entry/reverse_entry/list_review_queue above, this has NOT been
//      independently checked for a dynamic (pg_get_functiondef -> replace)
//      patch of the kind types.ts's header documents; treat "never redefined"
//      here as unverified-but-unflagged, not proven. Stamps `method='human'`
//      regardless of `p_method` (0004:489,496). This module always sends
//      `p_subject_kind: 'manual'`, `p_subject: null`, `p_confidence: 1` —
//      `assert_client_resolved`'s current body
//      (0125_f_a7_alpha2_judgement_recut.sql:179-190) requires
//      `confidence >= 0.95`, `method in ('human','rule','judgement')`, and
//      (for a document-less entry) only `client_id` to match — satisfied.
//   2. clara.draft_entry(p_client uuid, p_resolution uuid, p_posting_date date,
//      p_memo text, p_lines jsonb, p_document uuid default null, p_sha256 text
//      default null, p_flags jsonb default '{}', p_op_key text default null,
//      p_proposed_counterparty jsonb default null, p_evidence jsonb default
//      null) — packages/db/migrations/0004_governed_fns.sql:499, current
//      WRAPPER body 0009_coding_floor.sql:1414-1430 (granted signature
//      confirmed at 0009:1427-1430). Same unverified-but-unflagged caveat as
//      above applies to `_draft_entry_core`'s body beyond
//      0016_a21_compliance_watch.sql:3970. Bookkeeper+. The core requires >=2
//      lines, every account_code to resolve to an ACTIVE account, and balances
//      to within 5c (auto-rounds 1-5c onto the client's
//      `special_acc_type='rounding'` account; >5c raises CLR07) — this module
//      does none of that client-side; the DB's own refusal is rendered verbatim.
//
// If step 2 refuses, step 1's resolution row is left standing (harmless — it is
// a client-attribution record, never a books number, and costs nothing sitting
// unlinked); a retried compose simply records a fresh one. Whichever step
// throws propagates UNCHANGED — the caller sees the real refusal from the real
// step, never a synthesized "compose failed" wrapper.
//
// N6 (independent review): a careless duplicate submit (the user reopens the
// dialog and resubmits before checking the reloaded drafts list) is NOT
// deduped by `op_key` — every compose call mints a FRESH one on purpose (a
// second manual entry is a legitimate, distinct action, unlike a retried
// click on the SAME action). The busy-gated submit button prevents a
// double-click race; a genuine accidental duplicate's exit is
// `clara.withdraw_draft` (0009_coding_floor.sql:1882) — a real verb, out of
// this mission's SCOPE to wire, but the way a human corrects this specific
// mistake today (via the dashboard, until a P3 follow-up wires it here too).

/** Step 1 of manual compose — see the header above. Exposed separately only so
 *  a test can exercise it in isolation; `composeManualEntry` is the intended
 *  call site. */
export async function recordManualResolution(session: SessionTokenAccessor, clientId: string): Promise<string> {
  const out = await callDoor<{ resolution_id?: string }>(
    "record_client_resolution",
    {
      p_client: clientId,
      p_subject_kind: "manual",
      p_subject: null,
      p_confidence: 1,
      p_method: "human",
      p_evidence: {},
      p_op_key: opKey(),
    },
    { session },
  );
  const id = out?.resolution_id;
  if (!id) throw new Error("record_client_resolution returned no resolution_id");
  return id;
}

/** Step 2 of manual compose — see the header above. */
export async function draftManualEntry(
  session: SessionTokenAccessor,
  clientId: string,
  resolutionId: string,
  postingDate: string,
  memo: string,
  lines: EntryLineInput[],
): Promise<{ entry_id: string; revision_token: string; status: string }> {
  const out = await callDoor<{ entry_id?: string; revision_token?: string; status?: string }>(
    "draft_entry",
    {
      p_client: clientId,
      p_resolution: resolutionId,
      p_posting_date: postingDate,
      p_memo: memo,
      p_lines: lines,
      p_document: null,
      p_sha256: null,
      p_flags: {},
      p_op_key: opKey(),
      p_proposed_counterparty: null,
      p_evidence: null,
    },
    { session },
  );
  if (!out?.entry_id) throw new Error("draft_entry returned no entry_id");
  return { entry_id: out.entry_id, revision_token: out.revision_token ?? "", status: out.status ?? "draft" };
}

export type ComposeManualEntryInput = {
  postingDate: string;
  memo: string;
  lines: EntryLineInput[];
};

/** The full manual-compose ceremony: record the resolution, then draft the
 *  entry against it. See the header above for the grounding + the orphaned-
 *  resolution-on-refusal note. */
export async function composeManualEntry(
  session: SessionTokenAccessor,
  clientId: string,
  input: ComposeManualEntryInput,
): Promise<{ entry_id: string; revision_token: string; status: string }> {
  const resolutionId = await recordManualResolution(session, clientId);
  return draftManualEntry(session, clientId, resolutionId, input.postingDate, input.memo, input.lines);
}
