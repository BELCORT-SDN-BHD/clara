// THE DURABLE-WORK READS — direct RLS table reads through `getRows`, exactly as
// the journals workbench reads the books (lib/journals/api.ts's own header for
// the mechanism split). No read RPC is introduced: migration 0178 grants
// `select` on `clara.accounting_work` and `clara.operation_receipts` to
// `clara_authenticated` with the same client-scoping predicate
// `clara.journal_entries` already uses, so a plain filtered GET is the whole
// authority story and adding an RPC would be a second one.
//
// RLS SCOPES BY FIRM; EVERY READ BELOW FILTERS THE CLIENT ITSELF. Same discipline
// lib/journals/api.ts states: the policy stops another firm's rows, the filter
// stops another CLIENT's rows from this firm appearing under this client's
// heading. Both filters are sent on every read, so a Work belonging to client B
// cannot render on client A's page even if someone types its id into the URL —
// it simply resolves to no row, which is the not-found state.
//
// A MALFORMED ID NEVER REACHES POSTGREST. `id=eq.not-a-work` on a `uuid` column
// is HTTP 400 `22P02`, which THROWS — and a throw on a route reaches the error
// boundary ("Something went wrong") instead of the scoped not-found state this
// page owns. That is the exact defect lib/client-id.ts was written for; the same
// guard is applied here, to the WORK id, before any request is built.

import { getRows } from "@/lib/read";
import { isUuidShape } from "@/lib/client-id";
import { listCoaAccounts } from "@/lib/journals/api";
import { getPendingInterruptionForTask } from "@/lib/journals/governance-doors";
import type { AgentInterruptionRow, CoaAccountRow, JournalEntryRow, JournalLineRow } from "@/lib/journals/types";
import type { SessionTokenAccessor } from "@/lib/session";
import {
  ACCOUNTING_WORK_SELECT,
  OPERATION_RECEIPT_SELECT,
  WORK_TASK_SELECT,
  type AccountingWorkRow,
  type OperationReceiptRow,
  type WorkTaskRow,
} from "./types";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** The ceiling on a client's Work list. Same posture as lib/journals/api.ts's
 *  `FETCH_CAP`: request one MORE than the cap and treat a full answer as PROOF
 *  the list is incomplete, rather than letting PostgREST's own `db-max-rows`
 *  truncate silently. */
const WORK_FETCH_CAP = 200;

export type BoundedWork = { rows: AccountingWorkRow[]; truncated: boolean };

/** Every Work for one client, newest first — the client Work queue's own read. */
export async function listAccountingWork(
  clientId: string,
  opts: Opts = {},
): Promise<BoundedWork> {
  if (!isUuidShape(clientId)) return { rows: [], truncated: false };
  const rows = await getRows<AccountingWorkRow>("accounting_work", {
    select: ACCOUNTING_WORK_SELECT,
    filters: { client_id: `eq.${clientId}` },
    order: "created_at.desc",
    limit: WORK_FETCH_CAP + 1,
    ...opts,
  });
  return rows.length > WORK_FETCH_CAP
    ? { rows: rows.slice(0, WORK_FETCH_CAP), truncated: true }
    : { rows, truncated: false };
}

/** ONE Work, addressed by BOTH its id and its client. Null when RLS admits no
 *  such row — the database's honest answer, never an error it did not raise. */
export async function getAccountingWork(
  clientId: string,
  workId: string,
  opts: Opts = {},
): Promise<AccountingWorkRow | null> {
  const rows = await getRows<AccountingWorkRow>("accounting_work", {
    select: ACCOUNTING_WORK_SELECT,
    filters: { id: `eq.${workId}`, client_id: `eq.${clientId}` },
    limit: 1,
    ...opts,
  });
  return rows[0] ?? null;
}

/** The Work's current run, off the MASKED human view the shell's task queue
 *  already reads — never the base table. */
export async function getWorkTask(taskId: string, opts: Opts = {}): Promise<WorkTaskRow | null> {
  if (!isUuidShape(taskId)) return null;
  const rows = await getRows<WorkTaskRow>("agent_tasks_visible", {
    select: WORK_TASK_SELECT,
    filters: { id: `eq.${taskId}` },
    limit: 1,
    ...opts,
  });
  return rows[0] ?? null;
}

/** Every receipt this Work has produced, newest first. A COMMITTED one is the
 *  authoritative record of the posting; the list is read rather than a single
 *  row because one logical operation may carry at most one committed receipt but
 *  the table is not the place this UI enforces that. */
export async function listOperationReceipts(
  clientId: string,
  workId: string,
  opts: Opts = {},
): Promise<OperationReceiptRow[]> {
  return getRows<OperationReceiptRow>("operation_receipts", {
    select: OPERATION_RECEIPT_SELECT,
    filters: { work_id: `eq.${workId}`, client_id: `eq.${clientId}` },
    order: "created_at.desc",
    limit: 20,
    ...opts,
  });
}

async function getEntry(
  clientId: string,
  entryId: string,
  opts: Opts,
): Promise<JournalEntryRow | null> {
  if (!isUuidShape(entryId)) return null;
  const rows = await getRows<JournalEntryRow>("journal_entries", {
    select:
      "id,client_id,status,posting_date,memo,origin,document_id,coding_kind,revision_token," +
      "maker_actor,checker_actor,approved_at,reversal_of,reversed_by,reversal_reason," +
      "withdrawn_at,withdrawal_reason,created_at",
    filters: { id: `eq.${entryId}`, client_id: `eq.${clientId}` },
    limit: 1,
    ...opts,
  });
  return rows[0] ?? null;
}

async function listEntryLines(entryId: string, opts: Opts): Promise<JournalLineRow[]> {
  if (!isUuidShape(entryId)) return [];
  return getRows<JournalLineRow>("journal_lines", {
    select: "id,entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id",
    filters: { entry_id: `eq.${entryId}` },
    order: "line_no.asc",
    ...opts,
  });
}

/**
 * THE WHOLE PICTURE FOR ONE WORK, in one hydration cycle.
 *
 * `null` means the Work is NOT VISIBLE — an unknown id, another client's Work,
 * another firm's. Distinguishing that from a read FAILURE is the caller's job and
 * it matters: one is a not-found page, the other keeps the last dated value on
 * screen with a Retry.
 *
 * THE POSTED ENTRY IS READ ONLY WHEN THE WORK SAYS THERE IS ONE, and it is read
 * by the id the DATABASE wrote into `result.entry_id` — never by guessing at a
 * join. A completed Work whose entry has since been reversed still resolves the
 * entry, with its own live status: the receipt records what happened, the entry
 * records what is true now, and the page shows both rather than picking one.
 */
export type WorkDetailData = {
  work: AccountingWorkRow;
  task: WorkTaskRow | null;
  entry: JournalEntryRow | null;
  lines: JournalLineRow[];
  receipts: OperationReceiptRow[];
  /**
   * THE QUESTION THIS WORK IS PARKED ON, when it is parked on one.
   *
   * Read ONLY while the Work says `awaiting_input`, and read by TASK — a run
   * parks by calling `clara.open_interruption`, which writes one
   * `clara.agent_interruptions` row against `accounting_work.current_task_id`
   * and flips the task (and, through 0178's mirror trigger, the Work) to
   * `awaiting_input`. `getPendingInterruptionForTask` is the estate's own exact
   * addressing of that row: `(task_id, status='pending')` names AT MOST ONE, and
   * its `limit=2` keeps a second pending row observable as ambiguity rather than
   * truncating it into a false certainty (lib/journals/governance-doors.ts's own
   * ADDRESSING LAW note).
   *
   * IT IS NOT THE NEEDS-YOU INBOX'S READ, and the difference is a relation
   * rather than a preference. `/work?view=needs-you` renders
   * `clara.list_review_queue`, whose `open_question` rows come from
   * `clara.open_questions` — a different table, which a parked agent run does
   * not write. The two surfaces answer the same human question from the two
   * places the estate actually stores it; this page reads the one its own run
   * parked on.
   *
   * `null` covers three cases this page deliberately does not distinguish: the
   * Work is not parked, the row is not visible to this caller (the read is
   * firm-scoped, floored at bookkeeper+), or there is more than one pending row.
   * All three render the same honest "a question is waiting" banner with the
   * link to the inbox that can answer it.
   */
  interruption: AgentInterruptionRow | null;
  /** The client's chart, for the basis table's account NAMES. A failed chart
   *  read degrades to an empty list — the basis still renders with its codes,
   *  which are the values the database actually holds. */
  accounts: CoaAccountRow[];
};

export async function loadWorkDetail(
  clientId: string,
  workId: string,
  /** `session` is REQUIRED here, unlike the single-relation reads above, because
   *  this loader delegates one of its reads to `listCoaAccounts`, whose signature
   *  takes an accessor rather than defaulting to the blessed singleton. Requiring
   *  it is the honest way to satisfy that; a non-null assertion would be the
   *  same requirement written where nobody reads it. */
  opts: { session: SessionTokenAccessor; signal?: AbortSignal },
): Promise<WorkDetailData | null> {
  // BOTH ids, BEFORE any request. The client id is already guarded by the
  // route's own layout; this is the second half of the same defence in depth
  // lib/client-id.ts's header argues for.
  if (!isUuidShape(clientId) || !isUuidShape(workId)) return null;

  const work = await getAccountingWork(clientId, workId, opts);
  if (work === null) return null;

  const entryId = typeof work.result?.entry_id === "string" ? work.result.entry_id : null;
  // THE PARKED QUESTION IS READ ONLY WHEN THE WORK SAYS IT IS PARKED. Every other
  // status would spend a request on a relation that has nothing to say, on a page
  // that re-reads itself every three seconds.
  const parked = work.status === "awaiting_input" && work.current_task_id !== null;
  const [task, receipts, accounts, entry, interruption] = await Promise.all([
    work.current_task_id === null ? Promise.resolve(null) : getWorkTask(work.current_task_id, opts),
    listOperationReceipts(clientId, workId, opts),
    listCoaAccounts(opts.session, clientId, opts.signal).catch(() => [] as CoaAccountRow[]),
    entryId === null ? Promise.resolve(null) : getEntry(clientId, entryId, opts),
    // DEGRADES TO null RATHER THAN FAILING THE PAGE, the same posture the chart
    // read above takes: a Work that cannot show its question is still a Work
    // whose status, basis and receipt a human came here to read.
    parked
      ? getPendingInterruptionForTask(work.current_task_id!, opts).catch(() => null)
      : Promise.resolve(null),
  ]);
  const lines = entry === null ? [] : await listEntryLines(entry.id, opts);

  return { work, task, entry, lines, receipts, accounts, interruption };
}

/** account_code → name, for the basis and entry tables. A code with no chart row
 *  renders as itself: a retired or unknown code is still what the database holds
 *  on the line, and inventing a name for it would be worse than showing none. */
export function accountNames(accounts: readonly CoaAccountRow[]): ReadonlyMap<string, string> {
  return new Map(accounts.map((a) => [a.account_code, a.name]));
}
