// The durable-Work read shapes — the web's TRANSCRIPTION of the rows migration
// 0178 declares, in the same discipline lib/journals/types.ts states for the
// books tables: the DATABASE is the declarer, this module is the reader, and a
// field is never widened or renamed here to make a component nicer.
//
// SHAPES THIS LANE CODED AGAINST, and where they came from. The three workers on
// this ticket (database, runtime, web) built in parallel against one written
// contract; the rows below are transcribed from its "DB contract" section rather
// than from a migration this worktree can read, because 0178 lands on another
// branch. THAT IS A REAL LIMIT AND IT IS NAMED HERE rather than implied: until
// the three branches merge and one live read runs, every field below is a
// CLAIM about the schema, proven only against mocks. The integration step's own
// job is to confirm it — and the shape most worth confirming is `basis`, since
// it is the one payload this UI renders as MONEY.
//
// WHAT IS DELIBERATELY NOT HERE: a `work_id` column on `agent_tasks_visible`.
// 0178 adds `work_id` to the BASE table `clara.agent_tasks`; whether the MASKED
// view republishes it is the database worker's call, and this lane does not need
// it either way — `accounting_work.current_task_id` addresses the task directly,
// so nothing below depends on a view column nobody has promised.

/** `clara.accounting_work.status` — the nine-member CHECK, verbatim and in the
 *  migration's own order. `string` keeps the union open exactly as
 *  `JournalEntryStatus` does: a status this module has not enumerated renders
 *  through the unknown arm rather than crashing a `t()` lookup. */
export type AccountingWorkStatus =
  | "queued"
  | "running"
  | "awaiting_input"
  | "stopping"
  | "completed"
  | "refused"
  | "failed"
  | "cancelled"
  | "expired"
  | (string & {});

/** The five statuses after which nothing more happens on its own. A poll stops
 *  here; a Retry is offered only on the recoverable subset below. */
export const TERMINAL_WORK_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "refused",
  "failed",
  "cancelled",
  "expired",
]);

/**
 * The three states a NEW run for the SAME Work is admitted from — transcribed
 * from `clara.retry_accounting_work`'s own precondition ("allowed only when the
 * work is `refused`, `failed` or `expired` AND its current task is terminal").
 *
 * OFFERING THE CONTROL IS NOT RE-DERIVING THE DOOR'S JUDGEMENT. The verb
 * rechecks the author's live role and the task's terminality at call time and
 * answers `not_retryable` with the current status when it disagrees; this set
 * only decides whether a button is worth showing, and the refusal still renders
 * verbatim when it comes (lib/doors.ts's own rule, applied to the runtime lane).
 */
export const RETRYABLE_WORK_STATUSES: ReadonlySet<string> = new Set(["refused", "failed", "expired"]);

/**
 * #630 — the three statuses a "Cancel Work" control is worth offering from.
 *
 * `stopping` IS DELIBERATELY NOT HERE, and the reason is the ticket's own: a Work that is already
 * stopping has an admitted operation settling, and the only honest thing to show while that
 * boundary is unknown is "stopping" — not a second button that could do nothing. The door agrees
 * (`already_stopping`), so offering it would only produce a press with no effect.
 *
 * OFFERING THE CONTROL IS NOT RE-DERIVING THE DOOR'S JUDGEMENT, exactly as
 * `RETRYABLE_WORK_STATUSES` states above: `clara.cancel_accounting_work` rechecks the author's live
 * role and the Work's state at call time, and its refusal renders verbatim when it comes.
 */
export const CANCELLABLE_WORK_STATUSES: ReadonlySet<string> = new Set(["queued", "running", "awaiting_input"]);

export type WorkBasisOrigin = "user_direct" | "clara_interpreted" | (string & {});

/** One line of `accounting_work.basis.lines`. CENTS ARE INTEGERS — the column is
 *  jsonb, so this module treats a non-integer as a wire fault rather than
 *  rendering it (see `basisLineIsExact`). */
export type WorkBasisLine = {
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  description?: string | null;
};

export type WorkBasis = {
  posting_date: string;
  memo: string;
  currency: string;
  lines: WorkBasisLine[];
};

/** `accounting_work.source_refs` — an EMPTY ARRAY is the documentless case and
 *  is the whole point of this journey, so the UI says "no source document" for
 *  `[]` and never confuses it with "not read yet" (which is `null` data, a
 *  different state entirely). */
export type WorkSourceRef = { kind: string; task_id?: string | null; session_id?: string | null };

/** `accounting_work.bundle` — the run's own immutable identity, recorded by the
 *  workflow when it claims the run. Null until then. */
export type WorkBundle = { id?: string | null; digest?: string | null };

/** `accounting_work.result` — written by `settle_work_run` on a completed Work. */
export type WorkResult = { entry_id?: string | null; receipt_id?: string | null; posted_at?: string | null };

/** `accounting_work.error` — the typed refusal or failure, written by the same
 *  verb. `recoverable` is the DB's own verdict and is never re-derived here. */
export type WorkError = {
  code?: string | null;
  reason?: string | null;
  message?: string | null;
  recoverable?: boolean | null;
};

export type AccountingWorkRow = {
  id: string;
  firm_id: string;
  client_id: string;
  purpose: string;
  status: AccountingWorkStatus;
  /** #630 — THE HUMAN THIS WORK IS EXECUTED AS, and whose live authority every
   *  run of it spends. Equal to `initiated_by` until a colleague takes
   *  responsibility for it (`clara.take_over_accounting_work`). This is the
   *  column the runtime mints its credentials on behalf of, which is why the
   *  takeover has to move it rather than a column beside it. */
  initiator: string;
  /** #630 — WHO ASKED, immutable forever. Optional on the read because a
   *  database below the 0184 frontier does not have the column, and a UI that
   *  crashed on its absence would be asserting a schema it cannot see. */
  initiated_by?: string | null;
  /** The role at ADMISSION — an authority snapshot for display, and it describes
   *  `initiated_by`. The commit rereads live membership, so this is history,
   *  never a current permission. */
  initiator_role: string;
  intent_key: string;
  logical_op_id: string;
  basis: WorkBasis | null;
  basis_digest: string;
  basis_origin: WorkBasisOrigin;
  source_refs: WorkSourceRef[] | null;
  current_task_id: string | null;
  bundle: WorkBundle | null;
  result: WorkResult | null;
  error: WorkError | null;
  created_at: string | null;
  updated_at: string | null;
};

// `initiated_by` IS in this projection, and it carries a DEPLOY-ORDER OBLIGATION with it: PostgREST
// refuses the WHOLE select when one named column does not exist, so this app must not reach a
// database below the 0184 frontier. The estate's release order already guarantees that (migrations,
// then the runtime image, then the web), and the alternative was worse — without the column the
// detail page says "Entered by" over `initiator`, which after a takeover is the COLLEAGUE and not
// the person who entered the figures. A provenance line that is wrong is not a smaller problem than
// a read that fails loudly.
export const ACCOUNTING_WORK_SELECT =
  "id,firm_id,client_id,purpose,status,initiator,initiated_by,initiator_role,intent_key,logical_op_id," +
  "basis,basis_digest,basis_origin,source_refs,current_task_id,bundle,result,error,created_at,updated_at";

/** #630 — WHO ENTERED THE FIGURES, for display. `initiated_by` until a takeover moves `initiator`
 *  away from it; falls back to `initiator` for a row read from a database below the 0184 frontier,
 *  which is the state in which the two were the same value anyway. */
export function enteredBy(work: Pick<AccountingWorkRow, "initiator" | "initiated_by">): string {
  const asked = work.initiated_by;
  return typeof asked === "string" && asked !== "" ? asked : work.initiator;
}

/** #630 — TRUE when responsibility has moved: the human the Work now runs as is not the one who
 *  asked for it. Both halves must be present and different; an absent `initiated_by` is a row from
 *  an older frontier, never a handover. */
export function wasTakenOver(work: Pick<AccountingWorkRow, "initiator" | "initiated_by">): boolean {
  const asked = work.initiated_by;
  return typeof asked === "string" && asked !== "" && asked !== work.initiator;
}

/** `clara.operation_receipts` — the authoritative record that ONE logical
 *  operation had ONE effect. `effects.entry_id` is what ties it to the ledger. */
export type OperationReceiptRow = {
  id: string;
  client_id: string;
  work_id: string;
  purpose: string;
  logical_op_id: string;
  payload_digest: string;
  acting_actor: string;
  on_behalf_of: string;
  via_wake_kind: string;
  bundle_digest: string;
  run_id: string;
  task_id: string;
  outcome: string;
  effects: { entry_id?: string | null; revision_token?: string | null } | null;
  refusal: { code?: string | null; reason?: string | null; message?: string | null } | null;
  created_at: string | null;
};

export const OPERATION_RECEIPT_SELECT =
  "id,client_id,work_id,purpose,logical_op_id,payload_digest,acting_actor,on_behalf_of," +
  "via_wake_kind,bundle_digest,run_id,task_id,outcome,effects,refusal,created_at";

/** The task columns the Work detail reads off `clara.agent_tasks_visible` — the
 *  MASKED human view the shell's own task queue already reads
 *  (lib/coding/reads.ts), never the base table. */
export type WorkTaskRow = {
  id: string;
  status: string;
  error_code: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export const WORK_TASK_SELECT = "id,status,error_code,created_at,updated_at";

export function isTerminalWorkStatus(status: string): boolean {
  return TERMINAL_WORK_STATUSES.has(status);
}

export function isRetryableWorkStatus(status: string): boolean {
  return RETRYABLE_WORK_STATUSES.has(status);
}

export function isCancellableWorkStatus(status: string): boolean {
  return CANCELLABLE_WORK_STATUSES.has(status);
}

/**
 * #630 — TRUE when "Take responsibility" is worth offering.
 *
 * The database's own precondition is "terminal AND its responsible human is no longer authorised",
 * and the browser can only see the first half plus the STORED reason. So this predicate is
 * deliberately the narrow one: a Work refused for `authority_lost`, which is the case
 * `claraWork`'s authority recheck writes and the one a colleague can actually rescue. A Work that
 * failed for another reason may ALSO be takeable once its person is gone — the door re-reads
 * membership and decides — but offering the control on that guess would put a button in front of
 * people that answers `not_takeable` almost every time.
 */
export function isTakeOverable(work: Pick<AccountingWorkRow, "status" | "error">): boolean {
  if (!TERMINAL_WORK_STATUSES.has(work.status)) return false;
  if (work.status === "completed" || work.status === "cancelled") return false;
  return work.error?.reason === "authority_lost";
}

/** A persisted jsonb line is not type-checked at the wire, so a cents field can
 *  genuinely arrive as `null`, a float or a string. EXACT means: both sides are
 *  safe integers, neither is negative, and exactly one of them is positive —
 *  the same shape `clara.admit_journal_work` validates before it will admit a
 *  basis at all. A line that fails this is rendered as unreadable rather than
 *  formatted into a plausible-looking amount. */
export function basisLineIsExact(line: WorkBasisLine): boolean {
  const { debit_cents: debit, credit_cents: credit } = line;
  if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) return false;
  if (debit < 0 || credit < 0) return false;
  return (debit > 0) !== (credit > 0);
}
