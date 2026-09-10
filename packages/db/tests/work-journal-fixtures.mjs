// #623 — the FIRST PERSISTENT CLARA SUCCESSOR (a documentless journal entry): the battery's
// world, gates and verb wrappers (NOT a test file: the name does not end in `.test.mjs`, so
// `node --test` ignores it).
//
// CONTRACT-BLIND. Every name, argument and shape here is derived from the #623 shared contract
// (the "DB contract" section) and from ticket #623's own acceptance criteria — never by reading
// `0178_accounting_work_journal_successor.sql`. When the migration lands, a divergence between
// this module and it is a real FINDING on one side or the other, decided at integration.
//
// THE WIRE CONTRACT THIS MODULE ENCODES:
//
//   clara.admit_journal_work(p_client, p_author, p_intent_key, p_basis, p_basis_origin,
//                            p_source_refs, p_model) -> {work_id, task_id, logical_op_id,
//                                                        status, replayed}
//   clara.retry_accounting_work(p_work, p_author, p_op_key)          -> same shape
//   clara.claim_work_run(p_task, p_workflow_run_id, p_bundle)        -> {claimed, ...}
//   clara.settle_work_run(p_task, p_outcome, p_error_code, p_error, p_result)
//   clara.wake_record_journal_entry(p_client, p_work, p_logical_op_id, p_basis,
//                                   p_bundle_digest, p_run_id, p_rationale)
//                                                                    -> {posted, entry_id, ...}
//
// THE FRONTIER GATE keys on the migration's STABLE STEM, never its number — numbers are claimed
// at MERGE (standing law), and a `like '0178_%'` gate would stop gating the moment the file is
// renumbered. The `db-slice-frontiers` matrix runs this package against databases pinned at
// EARLIER frontiers, where an unconditional assertion about a not-yet-born object reds the leg
// while saying nothing about the thing under test.

import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, wakeQuery, humanQuery, namedCall, opk, buildWorld, endPool,
  AGENT_USER_ID, assertRaises,
} from "./rig-fixtures.mjs";
import { markSkip, printSkipCount } from "./wave-a-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { upsertAccountClassed } from "./s6-helpers.mjs";
import { withTxnOrNull } from "./f-a2-post-fixtures.mjs";

export {
  ROLES, rootQuery, roleQuery, wakeQuery, humanQuery, namedCall, opk, buildWorld, endPool,
  AGENT_USER_ID, assertRaises, noteLane, printLaneNotes, printSkipCount, withTxnOrNull,
};

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** The #623 migration's STABLE STEM. */
export const WORK_STEM = "accounting_work_journal_successor$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function workLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [WORK_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateWork(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gateWork(t) {
  if (await workLaneReady()) return false;
  markSkip();
  t.skip(`#623 accounting-work lane absent (no ${WORK_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary. Every assertion in this battery uses THESE strings.
// ===========================================================================================

/** The typed `detail.reason` tokens the contract obliges each verb to raise. */
export const REASON = {
  invalidIntentKey: "invalid_intent_key",
  invalidOpKey: "invalid_op_key",
  clientNotFound: "client_not_found",
  clientInactive: "client_inactive",
  actorNotActive: "actor_not_active",
  insufficientRole: "insufficient_role",
  invalidBasis: "invalid_basis",
  invalidBasisOrigin: "invalid_basis_origin",
  invalidSourceRefs: "invalid_source_refs",
  intentConflict: "intent_payload_conflict",
  workNotFound: "work_not_found",
  notRetryable: "not_retryable",
  taskNotFound: "task_not_found",
  wrongTaskKind: "wrong_task_kind",
  invalidRunId: "invalid_run_id",
  invalidBundle: "invalid_bundle",
  invalidOutcome: "invalid_outcome",
  invalidErrorCode: "invalid_error_code",
  noWakeCredential: "no_wake_credential",
  wrongWakeKind: "wrong_wake_kind",
  credentialClientPin: "credential_client_pin",
  wakeOboUnbound: "wake_obo_unbound",
  oboNotActive: "obo_not_active",
  // Added at integration review: a credential minted OBO ANY live bookkeeper of the firm could
  // commit somebody else's Work, and the receipt's `on_behalf_of` — the estate's record of whose
  // authority was rechecked — then named a human who never asked for the entry.
  oboNotInitiator: "obo_not_initiator",
  logicalOpMismatch: "logical_op_mismatch",
  basisMismatch: "basis_mismatch",
  operationConflict: "operation_payload_conflict",
  unknownAccount: "unknown_account",
  genericControlLeg: "generic_control_leg",
  closedPeriod: "write_into_closed_period",
};

export const CLR = {
  wake: "CLR03", authz: "CLR04", balance: "CLR07", immutable: "CLR08",
  badRequest: "CLR10", notFound: "CLR11", conflict: "CLR13", period: "CLR19",
};

/** The chart this battery posts against. Codes are distinct from `rig-fixtures`' own COA so a
 *  shared world can carry both. */
export const WCHART = {
  expense: "6100",       // expense, no control class — the debit leg
  bank: "1150",          // asset,   no control class — the credit leg
  receivable: "3050",    // asset,   account_class='receivable' — the CONTROL leg B14 refuses
  retired: "6199",       // expense, deactivated after birth — the inactive-account probe
};

export const MODEL = "clara-opus-5-test";
export const BUNDLE_DIGEST = "a".repeat(64);
export const RATIONALE = "#623 rig: the accountant asked for this exact posting";

// ===========================================================================================
// 3 · The world.
// ===========================================================================================

/** Build the shared world and the classed chart both clients need. */
export async function buildWorkWorld() {
  const world = await buildWorld();
  for (const [key, client] of [["A1", world.clients.A1], ["A2", world.clients.A2]]) {
    await ensureWorkChart(world.users.alice, client, key);
  }
  await ensureWorkChart(world.users.dave, world.clients.B1, "B1");
  return world;
}

/** A brand-new client of the author's firm, carrying this battery's chart. Used where a cell
 *  makes an IRREVERSIBLE change to a client's books (an append-only fiscal year, say) and must
 *  not leak it into a sibling cell that shares the world. */
export async function freshWorkClient(sub, tag = "w623") {
  const { createClient } = await import("./rig-fixtures.mjs");
  const client = await createClient(sub, {
    name: `w623_${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    opKey: opk("w623-cli"),
  });
  await ensureWorkChart(sub, client, tag);
  return client;
}

async function ensureWorkChart(sub, client, label) {
  const mk = (code, name, type, accountClass) =>
    upsertAccountClassed(sub, { client, code, name, type, accountClass, opKey: opk("w623-coa") })
      .catch((e) => noteLane(`ensureWorkChart(${label}/${code}) raised ${e.code}: ${e.message}`));
  await mk(WCHART.expense, "Office Rent", "expense", null);
  await mk(WCHART.bank, "Maybank Current", "asset", null);
  await mk(WCHART.receivable, "Trade Debtors (623)", "asset", "receivable");
  await mk(WCHART.retired, "Retired Expense", "expense", null);
  // `upsert_account` carries no is_active argument, so the retirement is a root UPDATE. Stated
  // rather than hidden: this is a FIXTURE shortcut around an absent writer, not a claim that the
  // estate has a retire door.
  await rootQuery(
    "update clara.coa_accounts set is_active=false where client_id=$1 and account_code=$2",
    [client, WCHART.retired]);
}

// ===========================================================================================
// 4 · Basis builders. Exact minor units only — never a float anywhere in this module.
// ===========================================================================================

/** The canonical happy basis: Dr 6100 / Cr 1150, balanced to the cent. */
export function basis({
  postingDate = "2026-09-01",
  memo = "Office rent paid from Maybank",
  currency = "MYR",
  cents = 120000,
  debitAccount = WCHART.expense,
  creditAccount = WCHART.bank,
  lines = null,
} = {}) {
  return {
    posting_date: postingDate,
    memo,
    currency,
    lines: lines ?? [
      { account_code: debitAccount, debit_cents: cents, credit_cents: 0, description: "rent" },
      { account_code: creditAccount, debit_cents: 0, credit_cents: cents, description: "bank" },
    ],
  };
}

// ===========================================================================================
// 5 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

const RUNTIME = ROLES.runtime;

export async function admitJournalWork({
  client, author, intentKey = null, basis: b = null, origin = "user_direct",
  sourceRefs = [], model = MODEL,
}) {
  const r = await roleQuery(RUNTIME, namedCall("admit_journal_work", [
    { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_intent_key", cast: "text" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_basis_origin", cast: "text" }, { name: "p_source_refs", cast: "jsonb" },
    { name: "p_model", cast: "text" },
  ]), [client, author, intentKey ?? `intent-${randomUUID()}`, JSON.stringify(b ?? basis()),
    origin, JSON.stringify(sourceRefs), model]);
  return r.rows[0].result;
}

export async function retryAccountingWork({ work, author, opKey = null }) {
  const r = await roleQuery(RUNTIME, namedCall("retry_accounting_work", [
    { name: "p_work", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_op_key", cast: "text" },
  ]), [work, author, opKey ?? opk("w623-retry")]);
  return r.rows[0].result;
}

export async function claimWorkRun({ task, runId, bundle = null }) {
  const r = await roleQuery(RUNTIME, namedCall("claim_work_run", [
    { name: "p_task", cast: "uuid" }, { name: "p_workflow_run_id", cast: "text" },
    { name: "p_bundle", cast: "jsonb" },
  ]), [task, runId, JSON.stringify(bundle ?? defaultBundle())]);
  return r.rows[0].result;
}

export const defaultBundle = () => ({
  id: "clara-work/v1", digest: BUNDLE_DIGEST,
  instructions: "clara-work-instructions/v1", tools: "clara-work-tools/v1",
  skills: ["journal-entry/v1"],
  budgets: { segments: 4, modelCalls: 8, toolCalls: 12, replans: 2, transientRetries: 3 },
  model: MODEL,
});

export async function settleWorkRun({ task, outcome, errorCode = null, error = null, result = null }) {
  const r = await roleQuery(RUNTIME, namedCall("settle_work_run", [
    { name: "p_task", cast: "uuid" }, { name: "p_outcome", cast: "text" },
    { name: "p_error_code", cast: "text" }, { name: "p_error", cast: "jsonb" },
    { name: "p_result", cast: "jsonb" },
  ]), [task, outcome, errorCode, error === null ? null : JSON.stringify(error),
    result === null ? null : JSON.stringify(result)]);
  return r.rows[0].result;
}

/** Cancel a run through the ESTATE'S OWN human door (clara.cancel_agent_task, 0006/0133) — the
 *  door #623 must survive without editing. It is deliberately called as a HUMAN, because that is
 *  the only way it is ever reached: a bookkeeper pressing Stop on a run that is already holding
 *  the pen. Returns `{task_id, status}` — `cancel_requested` for a live run, `cancelled` for one
 *  that never started. */
export async function cancelAgentTask(sub, { task, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.cancel_agent_task(p_task => $1::uuid, p_op_key => $2::text) as result",
    [task, opKey ?? opk("w623-cancel")]);
  return r.rows[0].result;
}

/** Mint the PINNED chat wake kind OBO a human, exactly as the runtime's write pool does. */
export async function mintClientObo({ firm, obo, client, kind = "interactive_client", ttl = "15 minutes" }) {
  const r = await rootQuery(
    "select credential_id, secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)",
    [kind, firm, obo, ttl, kind === "interactive" ? null : client]);
  return { credentialId: r.rows[0].credential_id, secret: r.rows[0].secret };
}

/** Call the wake verb under `clara_wake_interactive` + a txn-local wake secret — the exact
 *  posture `withWriteWakeScoped` gives it in the runtime. */
export async function wakeRecordJournalEntry(secret, {
  client, work, logicalOpId, basis: b, bundleDigest = BUNDLE_DIGEST,
  runId = null, rationale = RATIONALE,
}) {
  const r = await wakeQuery(ROLES.wakeInteractive, secret, namedCall("wake_record_journal_entry", [
    { name: "p_client", cast: "uuid" }, { name: "p_work", cast: "uuid" },
    { name: "p_logical_op_id", cast: "text" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_bundle_digest", cast: "text" }, { name: "p_run_id", cast: "text" },
    { name: "p_rationale", cast: "text" },
  ]), [client, work, logicalOpId, JSON.stringify(b), bundleDigest,
    runId ?? `run-${randomUUID()}`, rationale]);
  return r.rows[0].result;
}

// ===========================================================================================
// 6 · Readers and assertions.
// ===========================================================================================

export async function workRow(id) {
  const r = await rootQuery("select * from clara.accounting_work where id=$1", [id]);
  return r.rows[0] ?? null;
}

export async function taskRow(id) {
  const r = await rootQuery("select * from clara.agent_tasks where id=$1", [id]);
  return r.rows[0] ?? null;
}

export async function tasksForWork(work) {
  const r = await rootQuery(
    "select id, status, kind, error_code, workflow_run_id from clara.agent_tasks where work_id=$1 order by created_at", [work]);
  return r.rows;
}

/** The audit rows one verb wrote about one Work, newest first. `clara.audit_log` names the verb
 *  in `fn` and carries its payload in `args` (0002). */
export async function auditFor(fn, work) {
  const r = await rootQuery(
    "select fn, args from clara.audit_log where fn=$1 and args->>'work'=$2 order by at desc, id desc",
    [fn, work]);
  return r.rows;
}

export async function receiptsForWork(work) {
  const r = await rootQuery(
    "select * from clara.operation_receipts where work_id=$1 order by created_at", [work]);
  return r.rows;
}

/** `posting_date` comes back as ::text on purpose: the driver hands a `date` column to JS as a
 *  local-midnight Date, and `toISOString()` on one shifts the calendar day under any non-UTC
 *  offset (MYT is UTC+8). #623 is a cell about EXACT money and EXACT dates, so the date never
 *  passes through a timezone at all. */
export async function entriesForClient(client) {
  const r = await rootQuery(
    "select id, status, origin, posting_date::text as posting_date, memo, maker_actor, checker_actor,"
    + " document_id, source_doc_sha256, revision_token"
    + " from clara.journal_entries where client_id=$1 order by created_at", [client]);
  return r.rows;
}

export async function linesOf(entry) {
  const r = await rootQuery(
    "select line_no, account_code, debit_cents, credit_cents, description from clara.journal_lines where entry_id=$1 order by line_no",
    [entry]);
  return r.rows;
}

/** Count this client's journal entries — the "no journal rows" half of every refusal cell. */
export async function entryCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.journal_entries where client_id=$1", [client]);
  return r.rows[0].n;
}

export async function committedReceiptCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.operation_receipts where client_id=$1 and outcome='committed'",
    [client]);
  return r.rows[0].n;
}

/** Parse a raise's `detail` as JSON. The contract obliges a TYPED detail on every raise, so a
 *  detail that is absent or unparseable is itself the finding — never silently tolerated. */
export function detailOf(err) {
  if (err?.detail == null) return null;
  try {
    return typeof err.detail === "string" ? JSON.parse(err.detail) : err.detail;
  } catch {
    return { unparseable: String(err.detail) };
  }
}

/** Assert a call raises EXACTLY (errcode, detail.reason). Both halves, always: an errcode alone
 *  cannot tell a currency refusal from a money wall (the F-A2 pair-classifier lesson). */
export async function assertPair(code, reason, fn, label) {
  const err = await assertRaises(code, fn, label);
  const d = detailOf(err);
  if (d?.reason !== reason) {
    throw new Error(
      `${label}: expected detail.reason=${JSON.stringify(reason)} beside ${code}, got `
      + `${JSON.stringify(d)} — message was: ${err.message}`);
  }
  return { err, detail: d };
}
