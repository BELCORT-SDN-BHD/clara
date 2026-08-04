// Wave D-b — S2 wire client for the staff-advance register (design
// `wave-d-b-design.md` §3, rulings WDB-G5..G8/G15; the builder ABI
// `wave-d-b-design-abi.md` §A "Reads (viewer+, grant-loop)" + §D.4-6). HUMAN
// lane only (PostgREST as clara_authenticated); every writer carries a FRESH
// op_key (the DB is idempotent on firm,fn,op_key). No figure is computed
// here — the DB owns every cents value. The three reads below (staff_advance_
// summary/statement/tie) are ABI §A PINNED — arg/return names transcribed
// verbatim; the writers are equally pinned. See adjustmentApi.ts's header for
// the sibling S1 file's shape-honesty note (this file needs none — every RPC
// it calls has an exact ABI signature). Row types + mappers live in
// ../advances/advancesModel.ts (the agingApi.ts/agingModel.ts split precedent).
//
// [as-built ladder round 2 — THE FIX THIS FILE EXISTS TO CARRY] all three reads
// return ONE jsonb OBJECT (an envelope), exactly like the D-a quartet — NOT a
// bare array. This file used to unwrap them with `Array.isArray(out) ? out : []`,
// which is ALWAYS false on an object: the register table, the running statement
// and the register↔GL tie strip therefore rendered permanently EMPTY over a
// populated register, and an empty tie strip reads as "nothing to reconcile" —
// the confident wrong answer this product exists to refuse. The reads below now
// go through advancesModel's `to*Read` envelope mappers, which carry the
// `available` SHAPE signal so a future divergence surfaces as `unavailable`
// rather than as a silent empty. `advancesApi.test.ts` feeds each mapper a REAL
// captured envelope so this cannot regress unnoticed.

import { rpc } from "./wire";
import {
  toStaffAdvanceSummaryRead, toStaffAdvanceStatementRead, toStaffAdvanceTieRead,
  type StaffAdvanceSummaryRead, type StaffAdvanceStatementRead, type StaffAdvanceTieRead,
  type StaffAdvanceSummaryRow,
} from "../advances/advancesModel";

const opKey = () => crypto.randomUUID();

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

/** `asOf === null` hands the DATE ITSELF to the DB — `staff_advance_summary`
 *  does `coalesce(p_as_of, clara._fa_today())`, and `_fa_today()` is
 *  `(now() at time zone 'Asia/Kuala_Lumpur')::date`. The named argument is still
 *  SENT (as SQL null), because PostgREST resolves an overload by the exact set
 *  of named arguments supplied and this function declares no default. */
export async function staffAdvanceSummary(token: string, clientId: string, asOf: string | null): Promise<StaffAdvanceSummaryRead> {
  const out = await rpc("staff_advance_summary", { p_client: clientId, p_as_of: asOf }, token);
  return toStaffAdvanceSummaryRead(out);
}

export async function staffAdvanceStatement(
  token: string, clientId: string, accountCode: string, from: string, to: string,
): Promise<StaffAdvanceStatementRead> {
  const out = await rpc(
    "staff_advance_statement",
    { p_client: clientId, p_account_code: accountCode, p_from: from, p_to: to },
    token,
  );
  return toStaffAdvanceStatementRead(out);
}

export async function staffAdvanceTie(token: string, clientId: string, asOf: string): Promise<StaffAdvanceTieRead> {
  const out = await rpc("staff_advance_tie", { p_client: clientId, p_as_of: asOf }, token);
  return toStaffAdvanceTieRead(out);
}

/** The `staff_advance` card's read. Three OUTCOMES, never two — see the type. */
export type GetStaffAdvanceRead = {
  advance: StaffAdvanceSummaryRow | null;
  /** Was the register itself readable and well-shaped? `false` ⇒ we know
   *  NOTHING about this advance; `advance: null` then means "could not ask",
   *  not "not on the register". */
  available: boolean;
  /** The date the DB actually answered as of — rendered so the reader can see
   *  which day's register they are looking at. */
  as_of: string | null;
};

/** [D4-precedent fix, restated] there is no single-row `get_staff_advance` in
 *  the ABI (§A names only summary/statement/tie) — this reads THROUGH
 *  `staff_advance_summary` and picks the one row by `advance_id`, exactly
 *  mirroring `reconApi.ts`'s `getBankRule` reading through `list_bank_rules`.
 *
 *  [round-3 fix — THE DB OWNS THE DATE, NEVER THE BROWSER] this used to compute
 *  `new Date().toISOString().slice(0, 10)` — the BROWSER's **UTC** date — and
 *  pass it as `p_as_of`, while the register is anchored to the DB's
 *  Asia/Kuala_Lumpur date (`clara._fa_today()`). Malaysia is UTC+8, so for the
 *  eight hours between 00:00 and 08:00 MYT the browser asked for YESTERDAY, and
 *  `staff_advance_summary` filters `a.issue_date <= v_as_of` — an advance issued
 *  today was simply ABSENT, so the card returned null for an advance that
 *  genuinely exists. `p_as_of: null` hands the date to the DB, which is the only
 *  clock in this system entitled to have an opinion about what day it is.
 *
 *  A WRONG-SHAPED envelope returns `available: false`, so the card can say
 *  "unavailable" instead of rendering the same blank it renders for "not on the
 *  register". A THROW is deliberately NOT swallowed here: the governed refusal
 *  carries the DB's verbatim message, and `useCard` is what renders it (the
 *  house "the CLR badge rides ALONGSIDE the DB's own text" law). The card
 *  treats both as unavailable. */
export async function getStaffAdvance(token: string, clientId: string, advanceId: string): Promise<GetStaffAdvanceRead> {
  const read = await staffAdvanceSummary(token, clientId, null);
  if (!read.available) return { advance: null, available: false, as_of: read.as_of };
  return {
    advance: read.advances.find((r) => r.advance_id === advanceId) ?? null,
    available: true,
    as_of: read.as_of,
  };
}

// ---------------------------------------------------------------------------
// Governed writers — EXACT verb + arg names from ABI §A. No local role gating
// (the DB's role/CLR refusal is the enforcement — the /assets precedent).
// ---------------------------------------------------------------------------

/** enrol_staff_advance_account(...) → admin+ (ABI §A/§3.1). `attestation` is
 *  the G15 related-party evidence (non-blank, stored verbatim). */
export async function enrolStaffAdvanceAccount(
  token: string,
  args: { clientId: string; accountCode: string; personLabel: string; confirmDedicated: boolean; attestation: string },
): Promise<{ enrolment_id: string; status: string }> {
  const out = await rpc(
    "enrol_staff_advance_account",
    {
      p_client: args.clientId, p_account_code: args.accountCode, p_person_label: args.personLabel,
      p_confirm_dedicated: args.confirmDedicated, p_attestation: args.attestation, p_op_key: opKey(),
    },
    token,
  );
  const o = rec(out);
  return { enrolment_id: s(o.enrolment_id) ?? "", status: s(o.status) ?? "active" };
}

/** retire_staff_advance_account(...) → admin+; refuses `advance_outstanding_
 *  on_retire` while any advance under it has outstanding > 0 (ABI §F). */
export async function retireStaffAdvanceAccount(
  token: string, clientId: string, enrolmentId: string, reason: string,
): Promise<{ enrolment_id: string; status: string }> {
  const out = await rpc(
    "retire_staff_advance_account",
    { p_client: clientId, p_enrolment: enrolmentId, p_reason: reason, p_op_key: opKey() },
    token,
  );
  const o = rec(out);
  return { enrolment_id: s(o.enrolment_id) ?? "", status: s(o.status) ?? "retired" };
}

/** complete_staff_advance_particulars(...) → bookkeeper+, set-once; refuses
 *  `particulars_already_set` (ABI §A/§F). */
export async function completeStaffAdvanceParticulars(
  token: string, clientId: string, advanceId: string, purpose: string, reference: string,
): Promise<{ advance_id: string; purpose: string; reference: string }> {
  const out = await rpc(
    "complete_staff_advance_particulars",
    { p_client: clientId, p_advance: advanceId, p_purpose: purpose, p_reference: reference, p_op_key: opKey() },
    token,
  );
  const o = rec(out);
  return { advance_id: s(o.advance_id) ?? advanceId, purpose: s(o.purpose) ?? purpose, reference: s(o.reference) ?? reference };
}

export type StaffAdvanceApplicationKind = "payroll_deduction" | "bank_return" | "claim";

export type BookStaffAdvanceApplicationResult = { status: "posted" | "drafted" | string; entry_id: string | null; application_ids: string[] };

/** book_staff_advance_application(...) → bookkeeper+ (ABI §A/§3.3): direct
 *  drafts with `flags.staff_advance_application` (ABI §B); the DEFERRED belt
 *  re-derives coverage under the held rung — the temporal cap included. */
export async function bookStaffAdvanceApplication(
  token: string,
  args: {
    clientId: string; postingDate: string; memo: string;
    lines: { account_code: string; debit_cents: number; credit_cents: number; description?: string | null }[];
    allocations: { line_no: number; advance_id: string; amount_cents: number }[];
    kind: StaffAdvanceApplicationKind; reason: string;
  },
): Promise<BookStaffAdvanceApplicationResult> {
  const out = await rpc(
    "book_staff_advance_application",
    {
      p_client: args.clientId, p_posting_date: args.postingDate, p_memo: args.memo,
      p_lines: args.lines, p_allocations: args.allocations, p_kind: args.kind, p_reason: args.reason,
      p_op_key: opKey(),
    },
    token,
  );
  const o = rec(out);
  const ids = (Array.isArray(o.application_ids) ? o.application_ids : []).filter((x): x is string => typeof x === "string");
  return { status: s(o.status) ?? "drafted", entry_id: s(o.entry_id), application_ids: ids };
}
