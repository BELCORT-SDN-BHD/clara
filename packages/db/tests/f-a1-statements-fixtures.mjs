// F-A1 (Wave-F Track A) PR-4 — shared rig fixtures for the statement-witness battery
// (NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it —
// the x38-match-fixtures.mjs split precedent, done here purely to keep
// f-a1-statements.test.mjs under the repo's 500-line gate). Everything here is written
// CONTRACT-BLIND from docs/plan/active/f-a1-witness-pair-design.md §3.7 plus a READ of the
// LIVE `clara._persist_statement_core` (0038:1385-1864) and its two normalizers
// (0038:1175-1338) — never from this PR's own migration file. See the test file's header
// for the full reading list and the harness note on why every task gets a direct
// `processing_call_reservations` row.
//
// ONE EXCEPTION, NAMED SO THE CONTRACT-BLIND CLAIM ABOVE STAYS TRUE: the three helpers the
// PART-3 provenance battery needs — `witnessReadersPerChannel`, `taskOnLane` and
// `coreV2Direct` — are NOT contract-blind. They exist to reach the witness arm's own new
// refusals, whose identity is their message, and there is nothing else to read that from.
// Everything parts 1-2 use is unchanged and still blind.

import { randomUUID } from "node:crypto";
import { ROLES, rootQuery, roleQuery, opk } from "./rig-helpers.mjs";
import { firmOf, filedDocument, upsertAccountClassed, idOf } from "./s6-helpers.mjs";
import { addBankAccount, chainLines } from "./x38-match-fixtures.mjs";

export const WITNESS_PURPOSE = "witness_extraction";
export const BANK_CODE = "MBB"; // the seeded reference institution code every other bank battery uses

/** THE READINESS PROBE, in the f-a1-walls idiom: the CATALOG, never `clara.schema_migrations`. */
export async function f_a1sReady() {
  const r = await rootQuery(
    "select to_regprocedure('clara.persist_statement_facts_v2(uuid,jsonb)') is not null as ok");
  return r.rows[0].ok;
}

const digitsOnly = (s) => String(s).replace(/[^0-9]/g, "");

let coaSeq = 0;
/** A FRESH asset, non-control COA code for `client` — add_bank_account's own congruence
 *  (x38.b) demands one live bank account per COA code, so every registration in this file
 *  gets its own rather than trying to share/reuse across cells. */
export async function freshCoa(sub, client) {
  coaSeq += 1;
  // ck_coa_account_code_0009: `^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$` -- EXACTLY 3 digits
  // before the hyphen, so the prefix is "9" + a 2-digit counter, not a 3-digit one.
  const code = `9${String(coaSeq % 100).padStart(2, "0")}-FA1S`;
  await upsertAccountClassed(sub, { client, code, name: `fa1s bank gl ${coaSeq}`, type: "asset", opKey: opk(`fa1s-coa-${coaSeq}`) });
  return code;
}

export function freshAcctNumber() {
  const n = randomUUID().replace(/[^0-9]/g, "").padEnd(12, "1").slice(0, 10);
  const printed = `114-5-${n.slice(0, 5)}-${n.slice(5, 7)}`;
  return { printed, digits: digitsOnly(printed) };
}

/** Register a LIVE bank account for `client` on the seeded MBB institution, at a fresh COA
 *  code and a fresh, never-before-seen account number. Returns the digits-only identity the
 *  witness header binds on. */
export async function registerAccount(sub, client) {
  const coa = await freshCoa(sub, client);
  const acct = freshAcctNumber();
  const receipt = await addBankAccount(sub, { client, bankCode: BANK_CODE, accountNumber: acct.printed, coaAccountCode: coa });
  return { bankAccountId: idOf(receipt, "bank_account_id", "id"), ...acct };
}

const iso = (d) => d.toISOString().slice(0, 10);
/** Calendar-month bounds, ISO. `month` is 1-12. */
export function ymBounds(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { periodStart: iso(start), periodEnd: iso(end) };
}

/** A closing chain whose line dates fall inside [periodStart, periodEnd] — reuses
 *  x38-match-fixtures' chainLines (the SAME running-balance/printed-totals arithmetic every
 *  other bank battery trusts) so this file adds no second chain implementation. */
export function witnessChain(periodStart, periodEnd, openingCents, deltas) {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const span = Math.max(1, Math.round((end - start) / 86400000));
  const specs = deltas.map((amountCents, i) => ({
    amountCents, entryDate: iso(new Date(start.getTime() + Math.min(span, i + 1) * 86400000)),
  }));
  const { rows, closing, totalDebit, totalCredit } = chainLines(openingCents, specs);
  return { openingCents, closingCents: closing, totalDebitCents: totalDebit, totalCreditCents: totalCredit, lines: rows };
}

/** The bank_statements-shaped header a reader would emit (0038:1175-1273's normalizer input
 *  shape). `omitCurrency`/`closingOverride` are the two knobs the combined-violation cells
 *  (f-a1s.b/c/d) need. */
export function stmtHeader({ bankCode = BANK_CODE, accountDigits, currency = "MYR", omitCurrency = false, periodStart, periodEnd, statementDate = null, ch, closingOverride = undefined }) {
  const h = {
    institution_code: bankCode, account_number: accountDigits,
    period_start: periodStart, period_end: periodEnd, statement_date: statementDate ?? periodEnd,
    opening_cents: ch.openingCents,
    closing_cents: closingOverride === undefined ? ch.closingCents : closingOverride,
    total_debit_cents: ch.totalDebitCents, total_credit_cents: ch.totalCreditCents,
  };
  if (!omitCurrency) h.currency = currency;
  return h;
}

/** The raw {readers:{reader1,reader2}} envelope, fully explicit per channel — the combined-
 *  violation cells build reader1/reader2 independently; everything else uses the agreeing
 *  convenience wrapper below. */
export function witnessReaders(engineId, h1, lines1, h2, lines2) {
  return {
    pages_used: 2, corroboration: { verdict: "recorded-by-runtime" },
    readers: {
      reader1: { engine_id: engineId, header: h1, lines: lines1 },
      reader2: { engine_id: engineId, header: h2, lines: lines2 },
    },
  };
}
export function agreeingWitnessPayload(engineId, h, ch) {
  return witnessReaders(engineId, { ...h }, ch.lines.map((l) => ({ ...l })), { ...h }, ch.lines.map((l) => ({ ...l })));
}

/** The same envelope with an INDEPENDENT engine_id per channel. `witnessReaders` stamps ONE id
 *  on both readers — which is why no cell built on it can ever reach the witness arm's
 *  provenance guards — so the provenance battery (part 3) needs this shape instead. Passing
 *  `undefined` for a channel OMITS its `engine_id` key entirely, which is the SILENCE case:
 *  0038's carried `v_e2 := coalesce(nullif(btrim(...)), p_task_engine_id)` turns an absent
 *  reader2 engine_id INTO the task stamp, so on the witness arm silence must be refused on the
 *  RAW payload value or the equality test below it is vacuous for that channel. */
export function witnessReadersPerChannel({ engine1, engine2, h1, lines1, h2, lines2 }) {
  const channel = (engineId, header, lines) => {
    const r = { header, lines };
    if (engineId !== undefined) r.engine_id = engineId;
    return r;
  };
  return {
    pages_used: 2, corroboration: { verdict: "recorded-by-runtime" },
    readers: { reader1: channel(engine1, h1, lines1), reader2: channel(engine2, h2, lines2) },
  };
}

/** A witness-mode envelope carrying ONLY reader1 — the shape the two-read ladder must refuse
 *  (`v_two` is true for 'witness' exactly as it is for 'ocr', so a missing second channel is
 *  `readers_disagree`, never a quietly-accepted single read). */
export function reader1OnlyPayload(engineId, h, ch) {
  return {
    pages_used: 2, corroboration: { verdict: "recorded-by-runtime" },
    readers: { reader1: { engine_id: engineId, header: { ...h }, lines: ch.lines.map((l) => ({ ...l })) } },
  };
}

export async function filedStatementDoc(sub, client) {
  const firm = await firmOf(client);
  return filedDocument(sub, { firm, client, kind: "bank_statement" });
}

/** A direct-inserted 'running' statement_facts task PLUS its processing-call reservation
 *  (`_settle_processing_call` requires one unconditionally in v2 — the ONE piece of harness
 *  plumbing the test file's header calls out explicitly). Mirrors f-a1-writer.test.mjs's
 *  `runningTask` for the llm_witness lane, adapted to `statement_facts` + the reservation. */
export async function statementWitnessTask(firm, documentId, { engineId = `llm-openai:gpt-witness:${randomUUID().slice(0, 8)}`, versionN = 1, pagesReserved = 5 } = {}) {
  const r = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
       status,workflow_run_id,started_at)
     values($1,$2,$3,$4,'statement_facts','running',$5,now()) returning id`,
    [firm, documentId, engineId, versionN, `rig-stmtwit-${randomUUID().slice(0, 8)}`]);
  const taskId = r.rows[0].id;
  await rootQuery(
    `insert into clara.processing_call_reservations(firm_id, task_id, state, pages_reserved)
     values($1,$2,'reserved',$3)`,
    [firm, taskId, pagesReserved]);
  return { taskId, engineId, versionN };
}

/** A direct-inserted 'running' task on an ARBITRARY lane, with NO processing-call reservation —
 *  the lane-guard cell needs a task the v2 wrapper will find and then refuse for its lane, and
 *  proving that means the row must genuinely exist. `engineId` must satisfy the lane<->engine
 *  prefix CHECK for the lane you pass. */
export async function taskOnLane(firm, documentId, { lane, engineId, versionN = 1 }) {
  const r = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
       status,workflow_run_id,started_at)
     values($1,$2,$3,$4,$5,'running',$6,now()) returning id`,
    [firm, documentId, engineId, versionN, lane, `rig-stmtlane-${randomUUID().slice(0, 8)}`]);
  return { taskId: r.rows[0].id, engineId, versionN, lane };
}

/** Call `clara._persist_statement_core_v2` DIRECTLY as root. The core is revoked from PUBLIC
 *  and deliberately NOT granted to clara_runtime (the one-ungranted-core law, 0004:6-12), so
 *  root is the only door — which is exactly what a cell needs to reach a guard the v2 wrapper
 *  structurally cannot deliver (it always passes the task's own, NOT NULL, engine_id). */
export async function coreV2Direct({ firm, client, documentId, payload, ingestMode = "witness", taskId, taskEngineId }) {
  const r = await rootQuery(
    `select clara._persist_statement_core_v2(
       p_firm => $1, p_client => $2, p_document => $3, p_payload => $4::jsonb,
       p_ingest_mode => $5, p_actor => null, p_task => $6, p_bank_account => null,
       p_engine_kind => 'statement_facts', p_task_engine_id => $7) as r`,
    [firm, client, documentId, JSON.stringify(payload), ingestMode, taskId, taskEngineId]);
  return r.rows[0].r;
}

export async function persistV2(taskId, payload) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.persist_statement_facts_v2(p_task => $1, p_payload => $2::jsonb) as r",
    [taskId, JSON.stringify(payload)]);
  return r.rows[0].r;
}

/** Land one live witness statement end-to-end (fresh document, fresh task+reservation), for
 *  the cells that need an EXISTING live statement as their setup. */
export async function landWitnessStatement(sub, client, { accountDigits, periodStart, periodEnd, openingCents = 100000, deltas = [50000, -20000, 30000] }) {
  const firm = await firmOf(client);
  const ch = witnessChain(periodStart, periodEnd, openingCents, deltas);
  const h = stmtHeader({ accountDigits, periodStart, periodEnd, ch });
  const doc = await filedStatementDoc(sub, client);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  const result = await persistV2(taskId, agreeingWitnessPayload(engineId, h, ch));
  return { result, doc, taskId, engineId, ch, h, firm };
}

/** The sha-bound 6/7-arg egress-dispatch overloads (0038 IA-7 idiom, x38/f-a1-walls' own local
 *  pattern), pinned to purpose=witness_extraction. */
export async function prepareDispatchSha({ firm, client, purpose = WITNESS_PURPOSE, eventSeq, eventType, documentSha256, role = ROLES.runtime }) {
  const r = await roleQuery(role,
    `select clara.prepare_egress_dispatch(p_firm => $1, p_client => $2, p_purpose => $3,
       p_event_seq => $4::bigint, p_event_type => $5, p_document_sha256 => $6) as r`,
    [firm, client, purpose, eventSeq, eventType, documentSha256]);
  return r.rows[0].r;
}
export async function consumeDispatchSha({ firm, authorization, client, purpose = WITNESS_PURPOSE, eventSeq, eventType, documentSha256, role = ROLES.runtime }) {
  const r = await roleQuery(role,
    `select clara.consume_egress_dispatch(p_firm => $1, p_authorization => $2, p_client => $3,
       p_purpose => $4, p_event_seq => $5::bigint, p_event_type => $6, p_document_sha256 => $7) as r`,
    [firm, authorization, client, purpose, eventSeq, eventType, documentSha256]);
  return r.rows[0].r;
}
