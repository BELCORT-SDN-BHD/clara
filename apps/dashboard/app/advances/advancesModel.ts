// Wave D-b — /advances' pure model (design `wave-d-b-design.md` §3.4; the
// builder ABI `wave-d-b-design-abi.md` §A "Reads"). PURE: zero network, zero
// React (the agingModel.ts/assetsModel.ts precedent). Every cents figure here
// is a DB-owned value from staff_advance_summary/staff_advance_statement/
// staff_advance_tie — this module maps, labels, and derives DISPLAY-ONLY
// predicates. It NEVER computes a financial figure: outstanding/running/tie
// cents are all DB-projected (design §3.2 "the outstanding equation" is a
// DB-side derivation, never re-derived here).
//
// ENVELOPE LAW (as-built ladder round 2). All three reads return ONE jsonb
// OBJECT — never a bare array — exactly like the D-a quartet:
//   staff_advance_summary   -> {client_id, as_of, advances[], outstanding_cents,
//                               incomplete_count, policy_notes[]}
//   staff_advance_statement -> {client_id, account_code, from, to, opening_cents,
//                               closing_cents, rows[], generations[]}
//   staff_advance_tie       -> {client_id, as_of, tie, accounts[]}
// The `to*Read` mappers below are the ONLY sanctioned way in, and each carries an
// `available` SHAPE signal (was the rows array present?) so a wrong shape reads
// as `unavailable`, never as a confident empty (the assetsModel `available` law).

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
/** A DB boolean that may be genuinely ABSENT — kept tri-state so "the DB did not
 *  say" can never be rendered as "the DB said false". */
function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
/** The shape probe every envelope mapper shares: `raw` is an object AND the named
 *  key holds an array. */
function hasArray(raw: unknown, key: string): boolean {
  return typeof raw === "object" && raw !== null && Array.isArray((raw as Record<string, unknown>)[key]);
}

// ---------------------------------------------------------------------------
// staff_advance_summary(client, as_of) — ABI §A. `policy_notes` is an ENVELOPE
// key (the EA 1955 advisory is one effective-dated set per firm-day, ABI §D.7
// `ea1955_policy`), NOT a per-row key: the notes are about the statute, not
// about any one advance.
// ---------------------------------------------------------------------------

/** One EA 1955 advisory note (ea1955_policy, ABI §D.7) — never a blocking rule,
 *  purely informational (design §3.4). */
export type PolicyNote = { fact: string; note: string; source_note: string };

export function toPolicyNote(raw: unknown): PolicyNote {
  const o = rec(raw);
  return { fact: s(o.fact) ?? "", note: s(o.note) ?? "", source_note: s(o.source_note) ?? "" };
}

export type StaffAdvanceSummaryRow = {
  enrolment_id: string;
  account_code: string;
  person_label: string;
  advance_id: string;
  issue_date: string | null;
  amount_cents: number | null;
  outstanding_cents: number | null;
  days_outstanding: number | null;
  purpose: string | null;
  reference: string | null;
  /** The DB's OWN set-once particulars verdict (`purpose is not null`), read
   *  rather than re-derived — the register owns what "complete" means. */
  particulars_complete: boolean;
  /** Is the enrolment generation that owns this advance still active? A retired
   *  generation's advances stay on the register; only new movement is walled. */
  enrolment_active: boolean;
  voided: boolean;
};

export function toStaffAdvanceSummaryRow(raw: unknown): StaffAdvanceSummaryRow {
  const o = rec(raw);
  return {
    enrolment_id: s(o.enrolment_id) ?? "",
    account_code: s(o.account_code) ?? "",
    person_label: s(o.person_label) ?? "",
    advance_id: s(o.advance_id) ?? "",
    issue_date: s(o.issue_date),
    amount_cents: numOrNull(o.amount_cents),
    outstanding_cents: numOrNull(o.outstanding_cents),
    days_outstanding: numOrNull(o.days_outstanding),
    purpose: s(o.purpose),
    reference: s(o.reference),
    particulars_complete: bool(o.particulars_complete),
    enrolment_active: bool(o.enrolment_active),
    voided: bool(o.voided),
  };
}

export type StaffAdvanceSummaryRead = {
  client_id: string | null;
  as_of: string | null;
  advances: StaffAdvanceSummaryRow[];
  /** The register's DB-summed open balance across every row. Rendered verbatim;
   *  this module never adds the rows up itself. */
  outstanding_cents: number | null;
  incomplete_count: number | null;
  policy_notes: PolicyNote[];
  available: boolean;
};

export function toStaffAdvanceSummaryRead(raw: unknown): StaffAdvanceSummaryRead {
  const o = rec(raw);
  const available = hasArray(raw, "advances");
  return {
    client_id: s(o.client_id),
    as_of: s(o.as_of),
    advances: available ? (o.advances as unknown[]).map(toStaffAdvanceSummaryRow) : [],
    outstanding_cents: numOrNull(o.outstanding_cents),
    incomplete_count: numOrNull(o.incomplete_count),
    policy_notes: arr(o.policy_notes).map(toPolicyNote),
    available,
  };
}

/** A row still worth chasing (nonzero outstanding, not voided) — the /aging
 *  agingRowHasBalance precedent (a zeroed-out row is filtered by the caller). */
export function advanceRowHasOutstanding(row: Pick<StaffAdvanceSummaryRow, "outstanding_cents" | "voided">): boolean {
  return !row.voided && typeof row.outstanding_cents === "number" && row.outstanding_cents !== 0;
}

/** Particulars-pending predicate — the register's own row_kind trigger
 *  (queue's `staff_advance_incomplete`, design §3.4): a disbursed advance whose
 *  purpose has not been recorded. The DB reports `particulars_complete`; this
 *  reads it rather than second-guessing it. */
export function advanceIsIncomplete(row: Pick<StaffAdvanceSummaryRow, "particulars_complete" | "voided">): boolean {
  return !row.voided && !row.particulars_complete;
}

// ---------------------------------------------------------------------------
// staff_advance_statement(client, account_code, from, to) — ABI §A. The envelope
// carries the window's OPENING and CLOSING balances (both DB-summed) and every
// enrolment GENERATION the code has ever had, so a re-issued code cannot read as
// one person's impossible history.
// ---------------------------------------------------------------------------

export type StaffAdvanceStatementKind = "disbursement" | "application" | "void" | string;

export type StaffAdvanceStatementRow = {
  date: string | null;
  kind: StaffAdvanceStatementKind;
  entry_id: string | null;
  advance_id: string | null;
  amount_cents: number | null;
  running_cents: number | null;
  application_kind: string | null;
  reason: string | null;
};

export function toStaffAdvanceStatementRow(raw: unknown): StaffAdvanceStatementRow {
  const o = rec(raw);
  return {
    date: s(o.date),
    kind: s(o.kind) ?? "disbursement",
    entry_id: s(o.entry_id),
    advance_id: s(o.advance_id),
    amount_cents: numOrNull(o.amount_cents),
    running_cents: numOrNull(o.running_cents),
    application_kind: s(o.application_kind),
    reason: s(o.reason),
  };
}

/** One enrolment generation of an account code (design §3.1): who held it, from
 *  when, and the G15 related-party attestation given at enrolment. */
export type StaffAdvanceGeneration = {
  enrolment_id: string;
  person_label: string;
  enrolled_at: string | null;
  retired_at: string | null;
  active: boolean;
  attestation: string | null;
};

export function toStaffAdvanceGeneration(raw: unknown): StaffAdvanceGeneration {
  const o = rec(raw);
  return {
    enrolment_id: s(o.enrolment_id) ?? "",
    person_label: s(o.person_label) ?? "",
    enrolled_at: s(o.enrolled_at),
    retired_at: s(o.retired_at),
    active: bool(o.active),
    attestation: s(o.attestation),
  };
}

export type StaffAdvanceStatementRead = {
  client_id: string | null;
  account_code: string | null;
  from: string | null;
  to: string | null;
  opening_cents: number | null;
  closing_cents: number | null;
  rows: StaffAdvanceStatementRow[];
  generations: StaffAdvanceGeneration[];
  available: boolean;
};

export function toStaffAdvanceStatementRead(raw: unknown): StaffAdvanceStatementRead {
  const o = rec(raw);
  const available = hasArray(raw, "rows");
  return {
    client_id: s(o.client_id),
    account_code: s(o.account_code),
    from: s(o.from),
    to: s(o.to),
    opening_cents: numOrNull(o.opening_cents),
    closing_cents: numOrNull(o.closing_cents),
    rows: available ? (o.rows as unknown[]).map(toStaffAdvanceStatementRow) : [],
    generations: arr(o.generations).map(toStaffAdvanceGeneration),
    available,
  };
}

// ---------------------------------------------------------------------------
// staff_advance_tie(client, as_of) — ABI §A / design §3.4: the register↔GL tie,
// window-scoped to the code's enrolment generations.
//
// `explained` IS A BOOLEAN, and it is the DB's own `register_cents = gl_cents`
// verdict — NOT a prose gloss (the round-2 finding: this model used to type it
// `string | null` and parse it with a string-only guard, so the column could
// only ever render an em-dash). Read it as a boolean; render it as a state.
// ---------------------------------------------------------------------------

export type StaffAdvanceTieRow = {
  account_code: string;
  register_cents: number | null;
  gl_cents: number | null;
  difference_cents: number | null;
  out_of_window_cents: number | null;
  explained: boolean | null;
  advance_count: number | null;
  incomplete_count: number | null;
  active_enrolment_id: string | null;
};

export function toStaffAdvanceTieRow(raw: unknown): StaffAdvanceTieRow {
  const o = rec(raw);
  return {
    account_code: s(o.account_code) ?? "",
    register_cents: numOrNull(o.register_cents),
    gl_cents: numOrNull(o.gl_cents),
    difference_cents: numOrNull(o.difference_cents),
    out_of_window_cents: numOrNull(o.out_of_window_cents),
    explained: boolOrNull(o.explained),
    advance_count: numOrNull(o.advance_count),
    incomplete_count: numOrNull(o.incomplete_count),
    active_enrolment_id: s(o.active_enrolment_id),
  };
}

export type StaffAdvanceTieRead = {
  client_id: string | null;
  as_of: string | null;
  /** The whole-client verdict: every account tied. Tri-state — a missing key is
   *  "the DB did not say", never "false". */
  tie: boolean | null;
  accounts: StaffAdvanceTieRow[];
  available: boolean;
};

export function toStaffAdvanceTieRead(raw: unknown): StaffAdvanceTieRead {
  const o = rec(raw);
  const available = hasArray(raw, "accounts");
  return {
    client_id: s(o.client_id),
    as_of: s(o.as_of),
    tie: boolOrNull(o.tie),
    accounts: available ? (o.accounts as unknown[]).map(toStaffAdvanceTieRow) : [],
    available,
  };
}

/** `tied` = a zero difference on a fully-reported row; `unavailable` when the
 *  DB did not report the two identity terms — never a fake tie (the
 *  reconTieState/tieBannerState fail-closed precedent, restated locally per
 *  house convention — each feature's model stays free of a cross-lane import). */
export type StaffAdvanceTieState = "tied" | "variance" | "unavailable";

export function staffAdvanceTieState(row: Pick<StaffAdvanceTieRow, "register_cents" | "gl_cents" | "difference_cents">): StaffAdvanceTieState {
  if (row.register_cents === null || row.gl_cents === null || row.difference_cents === null) return "unavailable";
  return row.difference_cents === 0 ? "tied" : "variance";
}

/** The `explained` column's rendered word. A NULL (the DB did not report it) is
 *  its own state and must not collapse into "no" — an unreported verdict and a
 *  negative verdict are different facts about the books. */
export function tieExplainedLabel(explained: boolean | null): string {
  if (explained === null) return "not reported";
  return explained ? "explained" : "unexplained";
}

// ---------------------------------------------------------------------------
// Screen state (the agingScreenState/assetsScreenState precedent).
// ---------------------------------------------------------------------------

export type ScreenState = "loading" | "error" | "empty" | "partial" | "unavailable" | "ideal";

export function advancesScreenState(env: { loading: boolean; error: boolean; totalRows: number; available?: boolean }): ScreenState {
  if (env.error && env.totalRows === 0) return "error";
  if (env.loading && env.totalRows === 0) return "loading";
  if (env.available === false) return "unavailable";
  if (env.totalRows === 0) return "empty";
  return "ideal";
}
