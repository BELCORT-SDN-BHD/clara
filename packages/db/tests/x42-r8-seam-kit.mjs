// ---------------------------------------------------------------------------
// x42.r8s — SHARED KIT for the BANK × ADVANCE SEAM cells (as-built ladder round
// 8, fix lane M3). Instruments and fixtures only: not one figure is computed
// here, every number comes back off the DB.
//
// WHY A KIT AT ALL. The seam cells drive the SAME five-step chain (enrol ->
// disburse -> bank line -> except -> book) from four different angles, and the
// x42-af2 shared wrapper cannot carry the round-8 acknowledgement argument
// without colliding with the sibling fix lanes editing that file this round.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { opk, humanQuery, namedCall } from "./a21-helpers.mjs";
import {
  BANKCOA, ADVCODE,
  freshBankAccount, enterStatement, rootQuery,
} from "./x42-af2-world.mjs";

/** The DETAIL's `axis` discriminant. `reasonOf` (a21-helpers) reads the sibling
 *  `reason`; several D-b tokens cover more than one mistake and the AXIS is what
 *  tells them apart (the 0041 `disposal_request_invalid` precedent), so a cell
 *  that asserts only the reason is asserting half a refusal. */
export const axisOf = (err) =>
  /"axis"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;

/** The bank GL movement a client's books actually carry, in cents, read off the
 *  approved journal lines. "The line is booked exactly once" is arithmetic on
 *  the ledger, never a count of match groups. */
export const bankGlOf = async (client) =>
  Number((await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as c
       from clara.journal_lines l
       join clara.journal_entries j on j.id = l.entry_id
      where l.client_id = $1 and l.account_code = $2 and j.status = 'approved'`,
    [client, BANKCOA])).rows[0].c);

/** The release report, line-keyed — the body /bank's release receipt renders. */
export const block = async (line) =>
  (await rootQuery("select clara._wdb_line_booking_block($1) as r", [line])).rows[0].r;

/** The register's own outstanding equation at an as-of date (design §3.2). */
export const outAt = async (advance, asOf) =>
  Number((await rootQuery("select clara._adv_outstanding($1,$2::date) as o", [advance, asOf])).rows[0].o);

/** The DB's MYT today, read as TEXT: node-postgres parses a DATE into a
 *  local-midnight JS Date, and toISOString() then reports the day before. */
export const mytToday = async () =>
  (await rootQuery("select clara._book_today()::text as d")).rows[0].d;

export const openExceptionOf = async (line) =>
  (await rootQuery(
    "select id from clara.bank_line_exceptions where line_id=$1 and status='open' order by created_at desc limit 1",
    [line])).rows[0]?.id ?? null;

export const revisionOf = async (entry) =>
  (await rootQuery("select revision_token from clara.journal_entries where id=$1", [entry])).rows[0].revision_token;

export const staffAdvanceTie = async (sub, client, asOf) =>
  (await humanQuery(sub, "select clara.staff_advance_tie($1::uuid,$2::date) as r", [client, asOf])).rows[0].r;

const J = (v) => JSON.stringify(v);

/** THE AF-2 COMPOSITE, with the round-8 `p_ack_period_exceptions` argument.
 *  `undefined` means "do not send the argument at all"; an explicit value IS
 *  sent, so a cell can probe `false` distinctly from omission. */
export async function resolveAndBookAck(sub, {
  client, exception, disposition = "matched_booking", note = "x42.r8s note",
  draft = undefined, allocations = undefined, advanceApplications = undefined,
  attestation = undefined, ackPeriodExceptions = undefined, opKey = null,
}) {
  const specs = [{ name: "p_client" }, { name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" }];
  const vals = [client, exception, disposition, note];
  if (draft !== undefined) { specs.push({ name: "p_draft", cast: "jsonb" }); vals.push(draft === null ? null : J(draft)); }
  if (allocations !== undefined) { specs.push({ name: "p_allocations", cast: "jsonb" }); vals.push(allocations === null ? null : J(allocations)); }
  if (advanceApplications !== undefined) {
    specs.push({ name: "p_advance_applications", cast: "jsonb" });
    vals.push(advanceApplications === null ? null : J(advanceApplications));
  }
  if (attestation !== undefined) { specs.push({ name: "p_attestation" }); vals.push(attestation); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("x42r8s"));
  if (ackPeriodExceptions !== undefined) {
    specs.push({ name: "p_ack_period_exceptions", cast: "boolean" });
    vals.push(ackPeriodExceptions);
  }
  const r = await humanQuery(sub, namedCall("resolve_and_book_bank_line", specs), vals);
  return r.rows[0].result;
}

/** clara.book_staff_advance_application, named-arg verbatim (ABI §A). */
export async function bookStaffAdvanceApplication(sub, {
  client, postingDate, memo, lines, allocations, kind = "bank_return", reason = "x42.r8s", opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("book_staff_advance_application", [
    { name: "p_client" }, { name: "p_posting_date", cast: "date" }, { name: "p_memo" },
    { name: "p_lines", cast: "jsonb" }, { name: "p_allocations", cast: "jsonb" },
    { name: "p_kind" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, postingDate, memo, J(lines), J(allocations), kind, reason, opKey ?? opk("x42r8s-bsaa")]);
  return r.rows[0].result;
}

/** clara.resolve_bank_line_exception, the DIRECT verb (never the composite). */
export async function resolveBankLineExceptionDirect(sub, { exception, disposition, note, opKey = null }) {
  const r = await humanQuery(sub, namedCall("resolve_bank_line_exception", [
    { name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" }, { name: "p_op_key" }]),
    [exception, disposition, note, opKey ?? opk("x42r8s-rble")]);
  return r.rows[0].result;
}

export async function retireStaffAdvanceAccount(sub, { client, enrolment, reason, opKey = null }) {
  const r = await humanQuery(sub, namedCall("retire_staff_advance_account", [
    { name: "p_client" }, { name: "p_enrolment" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, enrolment, reason, opKey ?? opk("x42r8s-ret")]);
  return r.rows[0].result;
}

export const activeEnrolmentOf = async (client, code = ADVCODE) =>
  (await rootQuery(
    "select id from clara.staff_advance_accounts where client_id=$1 and account_code=$2 order by enrolled_at desc limit 1",
    [client, code])).rows[0].id;

/** A one-line statement in a PAST period, one fresh bank account per call.
 *
 *  WHY NOT THE SHARED `bankLine`: it mints 2035 periods, which is exactly right
 *  for the DATE-ORDERING wall (a mirror stamped at MYT-today would unwind a
 *  movement that has not happened) and exactly wrong for every re-book cell,
 *  where that same wall would refuse before this lane's question could be
 *  asked. Both shapes are used deliberately, and each cell says which it needs.
 *  `amountCents` is SIGNED: + = money into the bank, − = money out. */
let _pseq = 0;
export async function pastBankLine(sub, { client, amountCents, description }) {
  const bankAccount = await freshBankAccount(sub, client);
  _pseq += 1;
  const mm = String(((_pseq - 1) % 12) + 1).padStart(2, "0");
  const yy = 2020 + Math.floor((_pseq - 1) / 12);
  const start = `${yy}-${mm}-01`;
  const end = new Date(Date.UTC(yy, Number(mm), 0)).toISOString().slice(0, 10);
  const mid = `${yy}-${mm}-15`;
  const stmt = await enterStatement(sub, {
    client, bankAccount, periodStart: start, periodEnd: end, opening: 0, keepPeriod: true,
    specs: [{ amountCents, entryDate: mid, description }],
  });
  assert.ok(stmt.lines?.[0]?.id, "the fixture statement carries its one line");
  return { bankAccount, period: { start, end, mid }, statement: stmt.statementId, line: stmt.lines[0] };
}

/** The repayment hand-draft: money INTO the bank, clearing the advance code. */
export const repaymentDraft = (postingDate, cents, memo) => ({
  posting_date: postingDate, memo,
  lines: [
    { account_code: BANKCOA, debit_cents: cents, credit_cents: 0, description: "into the bank" },
    { account_code: ADVCODE, debit_cents: 0, credit_cents: cents, description: "advance cleared" },
  ],
});

/** The p_advance_applications payload for that draft's line 2. */
export const application = (advance, cents, reason = "x42.r8s") => ({
  kind: "bank_return", reason,
  allocations: [{ line_no: 2, advance_id: advance, amount_cents: cents }],
});
