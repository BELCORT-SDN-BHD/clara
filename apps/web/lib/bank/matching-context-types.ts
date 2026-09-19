// #657 — the MATCH RECEIPT the door states about itself, and the LINE MATCHING CONTEXT read
// (migration 0226). Split from match-types.ts under the repo's file-size discipline, the same
// way match-types.ts was split from types.ts.
//
// TWO THINGS LIVE HERE AND NOTHING ELSE DOES.
//
// 1. `MatchReceipt` — `match_bank_line`'s OWN answer, widened by 0226 §6 with `entry_ids`,
//    `line_ids`, `bank_account_id`, `account_code`, `new_journal_entries` and
//    `settlement_objects`. The last two are the machine-readable form of AC3/AC5: the success
//    block renders "no new cash entry was created" FROM THE DOOR'S FIELD, never from
//    client-side reasoning about what a match is supposed to do. A face that asserts a
//    negative on its own behalf is a face that will one day assert it wrongly.
//
// 2. `BankLineMatchingContext` — `clara.get_bank_line_matching_context(p_line)`. Everything ONE
//    statement line can say about itself before a match is decided: its own facts, its
//    statement's header/lineage/filename, the period coverage (the `tie` object LIFTED from
//    `clara.list_bank_statements`, so the product has no second cash expression on this side),
//    the governing `bank_line_exceptions` row, `clara._wdb_line_booking_block`'s payload
//    verbatim, and one DETERMINISTIC basis row per candidate entry.
//
// THE BASIS IS NEVER A SCORE (Q3 / SYNTHESIS J2). `amount_exact` is a boolean, not a closeness;
// `date_delta_days` is a signed whole-day count; `counterparty_match` is one of three NAMED
// rungs ('id' — an identifier of the canonical counterparty appears as a whole word in the line
// description; 'name' — its name-family token does; 'none'). There is no 0–1 number anywhere in
// this lane, `list_bank_line_suggestions` (dropped whole at 0129:395) is not revived, and #665's
// classifier-retirement AC3 is not fought.

import { s, numOrNull, bool, rec } from "./types";

/** One prior group a candidate entry rode on this bank account's COA. */
export type MatchHistoryRow = {
  match_id: string;
  status: string | null;
  matched_cents: number | null;
  acted_at: string | null;
};

export function toMatchHistory(raw: unknown): MatchHistoryRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((h) => {
    const r = rec(h);
    return {
      match_id: s(r.match_id) ?? "",
      status: s(r.status),
      matched_cents: numOrNull(r.matched_cents),
      acted_at: s(r.acted_at),
    };
  });
}

export type MatchReceipt = Record<string, unknown> & {
  match_id?: string;
  id?: string;
  status?: string;
  line_cents?: number;
  entry_cents?: number;
  adjustment_cents?: number;
  entry_ids?: string[];
  line_ids?: string[];
  bank_account_id?: string | null;
  account_code?: string | null;
  new_journal_entries?: number;
  settlement_objects?: number;
  period_exceptions?: number;
  /** The operation key this decision was submitted under, attached by `matchBankLine` (review
   *  A6). It is NOT a door field — `_finish_op`'s payload (0038:4233-4238, widened by 0226 §6)
   *  carries no op_key — but it IS the key `clara._reserve_op` stored the receipt under, so the
   *  outcome block can name it for a human to quote. Optional, because a receipt read back from
   *  anywhere other than that door call has no key to attach. */
  op_key?: string;
};

export type MatchBasisRow = {
  entry_id: string;
  amount_exact: boolean;
  date_delta_days: number | null;
  counterparty_match: "id" | "name" | "none";
  class_hint: string | null;
};

export type BankLineMatchingContext = {
  schema: string;
  line: {
    line_id: string;
    client_id: string | null;
    statement_id: string | null;
    bank_account_id: string | null;
    bank_account_display: string | null;
    coa_account_code: string | null;
    line_no: number | null;
    entry_date: string | null;
    value_date: string | null;
    description: string | null;
    amount_cents: number | null;
    running_balance_cents: number | null;
    class_hint: string | null;
    group_status: string | null;
    match_id: string | null;
  };
  statement: {
    id: string | null;
    status: string | null;
    superseded_by: string | null;
    voided_by: string | null;
    voided_at: string | null;
    voided_reason: string | null;
    ingest_mode: string | null;
    period_start: string | null;
    period_end: string | null;
    statement_date: string | null;
    opening_cents: number | null;
    closing_cents: number | null;
    source_doc_sha256: string | null;
    document_id: string | null;
    original_filename: string | null;
  };
  coverage: {
    line_count: number | null;
    total_debit_cents: number | null;
    total_credit_cents: number | null;
    tie: { gl_balance_cents: number | null; unmatched_cents: number | null } | null;
  };
  exception: {
    id: string;
    kind: string | null;
    reason: string | null;
    status: string | null;
    created_at: string | null;
    resolved_at: string | null;
    resolution_disposition: string | null;
    resolution_note: string | null;
    evidence_document_id: string | null;
    counterpart_line_id: string | null;
  } | null;
  /** `clara._wdb_line_booking_block`'s payload, VERBATIM. `blocking` is the verdict and
   *  `remedy_calls` (inside each booking) are what the face turns into links into the
   *  Exceptions tab. #657 renders them and offers NO resolve control — that door is #671's. */
  booking_block: {
    reason: string;
    blocking: boolean;
    line_id: string | null;
    exception_id: string | null;
    remedy: string | null;
    bookings: Array<Record<string, unknown>>;
  } | null;
  candidate_basis: MatchBasisRow[];
};

function basisRow(raw: unknown): MatchBasisRow {
  const o = rec(raw);
  const cp = s(o.counterparty_match);
  return {
    entry_id: s(o.entry_id) ?? "",
    amount_exact: bool(o.amount_exact),
    date_delta_days: numOrNull(o.date_delta_days),
    counterparty_match: cp === "id" || cp === "name" ? cp : "none",
    class_hint: s(o.class_hint),
  };
}

export function toBankLineMatchingContext(raw: unknown): BankLineMatchingContext | null {
  if (raw === null || raw === undefined) return null;
  const o = rec(raw);
  const line = rec(o.line);
  const stmt = rec(o.statement);
  const cov = rec(o.coverage);
  const tie = cov.tie === null || cov.tie === undefined ? null : rec(cov.tie);
  const exc = o.exception === null || o.exception === undefined ? null : rec(o.exception);
  const block = o.booking_block === null || o.booking_block === undefined ? null : rec(o.booking_block);
  return {
    schema: s(o.schema) ?? "",
    line: {
      line_id: s(line.line_id) ?? "",
      client_id: s(line.client_id),
      statement_id: s(line.statement_id),
      bank_account_id: s(line.bank_account_id),
      bank_account_display: s(line.bank_account_display),
      coa_account_code: s(line.coa_account_code),
      line_no: numOrNull(line.line_no),
      entry_date: s(line.entry_date),
      value_date: s(line.value_date),
      description: s(line.description),
      amount_cents: numOrNull(line.amount_cents),
      running_balance_cents: numOrNull(line.running_balance_cents),
      class_hint: s(line.class_hint),
      group_status: s(line.group_status),
      match_id: s(line.match_id),
    },
    statement: {
      id: s(stmt.id),
      status: s(stmt.status),
      superseded_by: s(stmt.superseded_by),
      voided_by: s(stmt.voided_by),
      voided_at: s(stmt.voided_at),
      voided_reason: s(stmt.voided_reason),
      ingest_mode: s(stmt.ingest_mode),
      period_start: s(stmt.period_start),
      period_end: s(stmt.period_end),
      statement_date: s(stmt.statement_date),
      opening_cents: numOrNull(stmt.opening_cents),
      closing_cents: numOrNull(stmt.closing_cents),
      source_doc_sha256: s(stmt.source_doc_sha256),
      document_id: s(stmt.document_id),
      original_filename: s(stmt.original_filename),
    },
    coverage: {
      line_count: numOrNull(cov.line_count),
      total_debit_cents: numOrNull(cov.total_debit_cents),
      total_credit_cents: numOrNull(cov.total_credit_cents),
      tie: tie
        ? { gl_balance_cents: numOrNull(tie.gl_balance_cents), unmatched_cents: numOrNull(tie.unmatched_cents) }
        : null,
    },
    exception: exc
      ? {
          id: s(exc.id) ?? "",
          kind: s(exc.kind),
          reason: s(exc.reason),
          status: s(exc.status),
          created_at: s(exc.created_at),
          resolved_at: s(exc.resolved_at),
          resolution_disposition: s(exc.resolution_disposition),
          resolution_note: s(exc.resolution_note),
          evidence_document_id: s(exc.evidence_document_id),
          counterpart_line_id: s(exc.counterpart_line_id),
        }
      : null,
    booking_block: block
      ? {
          reason: s(block.reason) ?? "",
          blocking: bool(block.blocking),
          line_id: s(block.line_id),
          exception_id: s(block.exception_id),
          remedy: s(block.remedy),
          bookings: Array.isArray(block.bookings) ? block.bookings.map((b) => rec(b)) : [],
        }
      : null,
    candidate_basis: Array.isArray(o.candidate_basis) ? o.candidate_basis.map(basisRow) : [],
  };
}

/** The remedy calls a booking row carries, as plain strings. `_wdb_line_booking_block` writes
 *  `remedy_calls` as a jsonb value whose shape the block owns; #657 renders whatever it finds
 *  and invents nothing, so anything that is not a string or a `{call}`/`{name}` object is
 *  dropped rather than stringified into `[object Object]`. */
export function remedyCallsOf(booking: Record<string, unknown>): string[] {
  const raw = booking.remedy_calls;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === "string" && item.trim() !== "") out.push(item);
    else if (item && typeof item === "object") {
      const o = rec(item);
      const call = s(o.call) ?? s(o.name) ?? s(o.fn);
      if (call) out.push(call);
    }
  }
  return out;
}
