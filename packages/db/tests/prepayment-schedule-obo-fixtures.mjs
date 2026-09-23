// #915 — THE PREPAYMENT-SCHEDULE DOOR'S `clara_runtime` TWIN AND THE MACHINE-LANE READ OF THE
// RECORDED TERM: this battery's frontier gate, verb wrappers and readers (NOT a test file: the
// name does not end in `.test.mjs`, so `node --test` ignores it).
//
// IT EXTENDS #940'S BATTERY RATHER THAN BUILDING A FIFTH WORLD.
// `prepayment-account-roster-fixtures.mjs` already re-exports #939's and #653's whole prepayment
// world — a closeable fiscal year, an ENROLLED prepaid-asset account, an expense target, an
// APPROVED document-bound recognition, the memo-only recognition and the roster's own two doors.
// Everything below is the one thing those batteries have no shape for: a call that arrives on a
// REAL `clara_runtime` connection carrying NO human JWT, acting on behalf of a NAMED human.
//
// THE FRONTIER GATE keys on this migration's STABLE STEM (`prepayment_schedule_obo_twin$`), never
// its number — numbers are claimed at MERGE (packages/db/README.md), and the `db-slice-frontiers`
// matrix runs this package against databases pinned at EARLIER frontiers.

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import { rootQuery, roleQuery, ROLES, namedCall, opk } from "./rig-helpers.mjs";

export * from "./prepayment-account-roster-fixtures.mjs";
export { roleQuery, ROLES };

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** This migration's STABLE STEM. */
export const OBO_STEM = "prepayment_schedule_obo_twin$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function oboLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [OBO_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** The pre-integration discriminator: a FOCUSED run against a database without the lane is a real
 *  failure, and only the package-wide sweep's preloaded gate module turns it into a skip. A skip
 *  is not evidence. */
export async function assertOboLanePresent(t) {
  if (await oboLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_SCHEDULE_OBO === "1") {
    console.warn(
      `SKIP prepayment-schedule-obo: no ${OBO_STEM} migration applied (pre-integration run).`);
    t.skip("#915 prepayment-schedule OBO lane absent — explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#915: the prepayment-schedule OBO lane is absent. Apply 0307_prepayment_schedule_obo_twin.sql, "
    + "or set CLARA_ALLOW_MISSING_PREPAYMENT_SCHEDULE_OBO=1 for the package-wide pre-integration sweep.");
  return true;
}

// ===========================================================================================
// 2 · The signatures and the closed vocabulary this battery asserts on. #915 mints NO new refusal
//     token for any rule the human door already answers — that is its whole point (AC4) — and
//     adds exactly THREE of its own, all of them about the OBO identity the human lane resolves
//     from a JWT instead.
// ===========================================================================================

export const TWIN_SIG =
  "clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)";
export const HUMAN_SIG = "clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)";
export const READ_SIG = "clara.read_prepayment_source_for(uuid,uuid,uuid)";
export const CORE_SIG =
  "clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)";
export const PLAN_CORE_SIG =
  "clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)";

/** The three tokens the OBO identity adds. `authority_lost` and `insufficient_role` are
 *  `clara.create_accrual_adjustment_for`'s OWN spellings (0222), carried through rather than
 *  re-invented; `client_not_found` is the estate's no-existence-oracle answer, which is exactly
 *  what a non-member must be told. */
export const OBO_REASON = {
  authorityLost: "authority_lost",
  insufficientRole: "insufficient_role",
  clientNotFound: "client_not_found",
  invalidAuthor: "invalid_author",
};

/** The machine-lane read's own two tokens. */
export const READ_REASON = {
  scopeRequired: "prepayment_read_scope_required",
  sourceNotFound: "prepayment_source_not_found",
};

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

/** The battery's own stated grounds for the expense classification. */
export const PREPAY_BASIS =
  "#915 battery: the conversation stated a twelve-month subscription, charged to subscriptions";

const TWIN_SPECS = [
  { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
  { name: "p_source_entry", cast: "uuid" }, { name: "p_expense_account", cast: "text" },
  { name: "p_expense_basis", cast: "text" }, { name: "p_purpose", cast: "text" },
  { name: "p_authority_ref", cast: "jsonb" }, { name: "p_op_key", cast: "text" },
];

/**
 * THE OBO DOOR — `clara_runtime` ONLY, the actor taken from an ARGUMENT because a runtime
 * connection carries no human JWT. Invoked on a REAL least-privileged runtime connection, never as
 * root: a door reached as `postgres` would prove nothing about the grant it rides.
 */
export async function createPrepaymentScheduleFor({
  client, author, sourceEntry, expenseAccount, expenseBasis = PREPAY_BASIS,
  purpose = "Prepaid subscription amortisation", authorityRef, opKey = null,
}) {
  const r = await roleQuery(ROLES.runtime, namedCall("create_prepayment_schedule_for", TWIN_SPECS),
    [client, author, sourceEntry, expenseAccount, expenseBasis, purpose,
      JSON.stringify(authorityRef), opKey ?? opk("p915-obo")]);
  return r.rows[0].result;
}

/** The same call on whatever role a cell names — the instrument for "no other lane reaches it". */
export async function createPrepaymentScheduleForAs(role, {
  client, author, sourceEntry, expenseAccount, expenseBasis = PREPAY_BASIS,
  purpose = "Prepaid subscription amortisation", authorityRef, opKey = null,
}) {
  const r = await roleQuery(role, namedCall("create_prepayment_schedule_for", TWIN_SPECS),
    [client, author, sourceEntry, expenseAccount, expenseBasis, purpose,
      JSON.stringify(authorityRef), opKey ?? opk("p915-obo")]);
  return r.rows[0].result;
}

/** THE MACHINE-LANE READ of the recorded term — `clara_runtime` ONLY, scope-explicit. */
export async function readPrepaymentSourceFor({ firm, client, sourceEntry }) {
  const r = await roleQuery(ROLES.runtime, namedCall("read_prepayment_source_for", [
    { name: "p_firm", cast: "uuid" }, { name: "p_client", cast: "uuid" },
    { name: "p_source_entry", cast: "uuid" },
  ]), [firm, client, sourceEntry]);
  return r.rows[0].result;
}

export async function readPrepaymentSourceForAs(role, { firm, client, sourceEntry }) {
  const r = await roleQuery(role, namedCall("read_prepayment_source_for", [
    { name: "p_firm", cast: "uuid" }, { name: "p_client", cast: "uuid" },
    { name: "p_source_entry", cast: "uuid" },
  ]), [firm, client, sourceEntry]);
  return r.rows[0].result;
}

/**
 * DRIVE A CALL THAT MUST REFUSE AND RETURN ITS WHOLE ANSWER — the SQLSTATE, the sentence a person
 * would read, and the parsed payload. The AC4 cell compares the three as ONE value, because a
 * divergence that kept the token and changed the sentence is still a divergence: the sentence is
 * what a surface renders.
 *
 * A call that SUCCEEDS fails by name rather than returning a null answer that a `deepEqual` of two
 * nulls would then happily accept — which is exactly how a comparison cell goes vacuous.
 */
export async function refusalOf(fn, label = "operation") {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  if (err === null) assert.fail(`${label}: expected a refusal, the call SUCCEEDED`);
  let detail = null;
  try {
    detail = typeof err.detail === "string" ? JSON.parse(err.detail) : (err.detail ?? null);
  } catch {
    detail = { unparseable: String(err.detail) };
  }
  return { code: err.code, message: err.message, detail };
}

// ===========================================================================================
// 4 · The chat lane's authority. The CONVERSATION is the instruction (0250/#977): a `chat_turn`
//     task whose `created_by` a person stamped. Built the way f-a4-pr2c-fixtures.mjs builds one,
//     through the session row's own trigger, so the firm/client derivation is the estate's.
// ===========================================================================================

const CHAT_MODEL = { name: "clara-opus-5", version: "p915" };

export async function chatTaskRef({ firm, client, author, kind = "chat_turn", createdBy }) {
  const s = await rootQuery(
    `insert into clara.chat_sessions(firm_id,client_id,created_by,visibility)
       values($1,$2,$3,'private') returning id`, [firm, client, author]);
  const t = await rootQuery(
    `insert into clara.agent_tasks(session_id,kind,status,created_by,model_snapshot)
       values($1,$2,'queued',$3,$4) returning id, firm_id, client_id`,
    [s.rows[0].id, kind, createdBy === undefined ? author : createdBy, JSON.stringify(CHAT_MODEL)]);
  const row = t.rows[0];
  if (row.firm_id !== firm || row.client_id !== client) {
    throw new Error("#915 fixture: the chat task trigger did not derive the session's firm/client");
  }
  return { kind: "chat_task", id: row.id };
}

// ===========================================================================================
// 5 · Readers. `rootQuery` ONLY, and ONLY ever for the corroborating half of an assertion whose
//     SUBJECT was exercised through a door.
// ===========================================================================================

/** Every clara function of the PREPAYMENT LANE with the six application roles' EXECUTE bits, read
 *  POSITIVELY off the catalog. The instrument AC5's grant census rides: "the runtime role reaches
 *  the twin and the narrow read and NOTHING ELSE in the lane" is a claim about every member of the
 *  lane, so the lane is enumerated rather than sampled. */
export async function prepaymentLaneGrants() {
  const r = await rootQuery(
    `select p.oid::regprocedure::text as signature, p.proname,
            has_function_privilege('clara_authenticated', p.oid, 'execute') as authenticated,
            has_function_privilege('clara_runtime', p.oid, 'execute') as runtime,
            has_function_privilege('clara_agent_ro', p.oid, 'execute') as agent_ro,
            has_function_privilege('clara_wake_interactive', p.oid, 'execute') as wake_interactive,
            has_function_privilege('clara_wake_proactive', p.oid, 'execute') as wake_proactive,
            has_function_privilege('public', p.oid, 'execute') as pub
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and (p.proname ~ 'prepayment' or p.proname ~ 'amortis')
      order by 1`);
  return r.rows;
}

/** One plan row, for the "the plan's authority is the HUMAN's, never the run's" half. */
export async function planAuthority(planId) {
  const r = await rootQuery(
    `select authorised_by, created_by, kind, status, purpose, authority_kind, authority_ref,
            authority_from::text as authority_from, current_revision
       from clara.accounting_plans where id = $1`, [planId]);
  return r.rows[0];
}

/** The op receipts under one key prefix, so a cell can see that BOTH lanes reserved in ONE
 *  namespace rather than in two that happen to look alike. */
export async function opReceiptsFor(firm, opKey) {
  const r = await rootQuery(
    `select fn, op_key, result is not null as finished, result
       from clara.op_receipts where firm_id = $1 and op_key = $2 order by fn`, [firm, opKey]);
  return r.rows;
}

export const nowhereObo = () => randomUUID();
