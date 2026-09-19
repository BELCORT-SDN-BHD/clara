// #631 — MODEL EGRESS OBEYS CURRENT PURPOSE AUTHORISATION, AND THE REDACTED EXECUTION TRACE:
// the battery's frontier gate, legal-basis helper, verb wrappers and readers (NOT a test file:
// the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// It sits BESIDE `work-journal-fixtures.mjs` for the reason #634's and #643's sibling modules
// state: 0195 is a separate frontier from 0178/0182/0184/0194, and the lanes' cells must be able
// to skip independently when `db-slice-frontiers` runs this package against a database pinned
// between them.
//
// THE WIRE CONTRACT THIS MODULE ENCODES:
//
//   clara.prepare_egress_dispatch(p_firm, p_client, 'accounting_work', p_event_seq,
//                                 p_event_type, NULL)      -> {verdict, authorization_id}
//   clara.consume_egress_dispatch(p_firm, p_authorization, p_client, 'accounting_work',
//                                 p_event_seq, p_event_type, NULL)          -> {verdict}
//   clara.prepare_work_egress_dispatch(p_task, p_run)       -> {verdict, authorization_id,
//                                                               firm_id, client_id, event_seq,
//                                                               event_type, purpose}
//   clara.record_work_execution_trace(...)                  -> uuid
//   clara.get_work_execution_trace(p_work)                  -> jsonb[]
//   clara.prune_work_execution_traces(p_before, p_limit)    -> {pruned_before, traces_deleted}
//   clara.restore_client_egress_purpose(p_client, p_purpose, p_op_key)
//                                                           -> {consent_id, activation_id, status}
//   clara.grant_client_egress_purpose(..., 'accounting_work', ...)
//                                                           -> CLR10 purpose_derived_not_grantable
//
// THE ACTIVATION BASIS THIS MODULE MATERIALISES (the #631 ASSUMPTION the owner must confirm):
// there is NO per-client "AI on" switch. Model egress authority for `accounting_work` is derived
// from (a) an ACTIVE OWNER of the firm having accepted BOTH published legal documents (terms and
// dpa) at their CURRENT published versions, and (b) the client being active. `acceptLegalNow`
// below is how a rig world acquires that basis — through the estate's own acceptance door, as the
// owner, never by a root insert.

import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, namedCall, opk, ROLES, noteLane,
} from "./work-journal-fixtures.mjs";
import { withActor, PG } from "./rig-helpers.mjs";

/** The standard SQLSTATEs this battery asserts directly (42501 for the table-read probe). */
export { PG };
import { markSkip } from "./wave-a-helpers.mjs";

export * from "./work-journal-fixtures.mjs";

// ===========================================================================================
// 1 · The #631 frontier gate — keyed on the migration's STABLE STEM, never its number.
// ===========================================================================================

/** The #631 migration's STABLE STEM. */
export const EGRESS_STEM = "work_egress_purpose_and_execution_trace$";

let _ready = null;
export async function egressLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [EGRESS_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateEgress(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gateEgress(t) {
  if (await egressLaneReady()) return false;
  markSkip();
  t.skip(`#631 work-egress lane absent (no ${EGRESS_STEM} migration applied)`);
  return true;
}

// #811
/** The #811 shape-bounds migration's STABLE STEM — the numeric `observed_revisions` ceiling and
 *  the `run` grammar's long-digit clause. A cell pinned below it skips rather than reds. */
export const TRACE_SHAPE_STEM = "work_trace_shape_bounds$";

let _shapeReady = null;
export async function traceShapeBoundsReady() {
  if (_shapeReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [TRACE_SHAPE_STEM]);
      _shapeReady = r.rows[0].n > 0;
    } catch {
      _shapeReady = false;
    }
  }
  return _shapeReady;
}

/** `if (await gateTraceShape(t)) return;` — #811's own per-cell frontier gate. */
export async function gateTraceShape(t) {
  if (await gateEgress(t)) return true;
  if (await traceShapeBoundsReady()) return false;
  markSkip();
  t.skip(`#811 trace shape bounds absent (no ${TRACE_SHAPE_STEM} migration applied)`);
  return true;
}
// #811

// ===========================================================================================
// 2 · The closed vocabulary.
// ===========================================================================================

export const WORK_EGRESS_PURPOSE = "accounting_work";
export const WORK_EGRESS_EVENT_TYPE = "work.segment";

export const EGRESS_REASON = {
  notAuthorized: "egress_not_authorized",
};

/** The four phases a trace row may carry. */
export const TRACE_PHASES = ["dispatch", "model_call", "tool_call", "settle"];

/** The CLOSED observed-revision key vocabulary `clara.record_work_execution_trace` admits. */
export const OBSERVED_REVISION_KEYS = [
  "knowledge_version", "books_version", "chart_revision", "basis_digest",
  "source_sha256", "question_version",
];

// ===========================================================================================
// 3 · The derived activation basis.
// ===========================================================================================

/** The CURRENT published version + bytes of one legal kind, or null when nothing is published. */
export async function publishedLegal(kind) {
  const r = await rootQuery(
    "select version, body_sha256 from clara.legal_documents where kind=$1 and status='published'",
    [kind]);
  return r.rows[0] ?? null;
}

/** Accept BOTH published legal documents as `sub`, through the estate's own door. Idempotent by
 *  (user, kind, version): a second call replays the original acceptance. */
export async function acceptLegalNow(sub) {
  const out = {};
  for (const kind of ["terms", "dpa"]) {
    const doc = await publishedLegal(kind);
    if (doc === null) {
      noteLane(`acceptLegalNow: no published ${kind} document — 0187 did not apply`);
      continue;
    }
    const r = await humanQuery(sub, namedCall("accept_legal_document", [
      { name: "p_kind", cast: "text" }, { name: "p_version", cast: "integer" },
      { name: "p_body_sha256", cast: "text" }, { name: "p_op_key", cast: "text" },
    ]), [kind, doc.version, doc.body_sha256, opk("w631-legal")]);
    out[kind] = r.rows[0].result;
  }
  return out;
}

/** Publish a NEWER version of one legal kind — the estate's own supersession, which is what
 *  "revocation" means for this derived purpose. Returns the new version. */
export async function publishNewerLegal(kind, { title = null, body = null } = {}) {
  const current = await publishedLegal(kind);
  const version = (current?.version ?? 0) + 1;
  const text = body ?? `#631 rig: ${kind} version ${version} — ${randomUUID()}`;
  await rootQuery("select clara._publish_legal_document_rig($1,$2,$3,$4)", [kind, version, title ?? `${kind} v${version}`, text])
    .catch(async () => {
      // No rig helper exists; do it the way 0187 does — supersede, then insert published.
      await rootQuery("update clara.legal_documents set status='superseded' where kind=$1 and status='published'", [kind]);
      await rootQuery(
        `insert into clara.legal_documents(kind,version,status,title,body,body_sha256,source_path,
           effective_from,published_at)
         values($1,$2,'published',$3,$4,encode(sha256(convert_to($4,'UTF8')),'hex'),
           'docs/ops/legal/rig-631.md', now(), now())`,
        [kind, version, title ?? `${kind} v${version}`, text]);
    });
  return version;
}

// #1008
/** LABELLED FIXTURE DML (root): put the platform's LEGAL ENFORCEMENT MODE at `mode` and answer the
 *  value that was there, so a cell can put it back.
 *
 *  WHY ROOT. `clara.legal_enforcement` (0234) carries FORCE ROW LEVEL SECURITY and no application
 *  role holds any privilege on it; its only human writer, `clara.set_legal_enforcement_mode`, is
 *  floored on the OPERATOR FIRM's owner, and the estate admits exactly one operator firm at a time.
 *  Minting one here would put a second, irrelevant authority inside every cell that arranged the
 *  mode — the same disposition `publishNewerLegal` above carries for the publish door.
 *
 *  FRONTIER-TOLERANT. On a chain below 0234 the relation does not exist and there IS no mode: the
 *  estate behaves exactly as `enforce`, so a cell asking for `enforce` is asking for what it
 *  already has and this is a no-op. */
export async function forceLegalEnforcementMode(mode) {
  try {
    const before = await rootQuery("select e.mode from clara.legal_enforcement e where e.id");
    await rootQuery("update clara.legal_enforcement set mode = $1 where id", [mode]);
    return before.rows[0]?.mode ?? null;
  } catch {
    noteLane(`forceLegalEnforcementMode(${mode}): clara.legal_enforcement is absent -- this chain is below #1008's frontier, where the estate has only the enforce rule`);
    return null;
  }
}
// #1008

/** Give (firm, client) the derived accounting_work egress basis: an ACTIVE OWNER of the firm who
 *  has accepted both current published legal documents. `owner` is the user whose acceptance is
 *  taken (it must actually hold the owner role in that firm). */
export async function ensureWorkEgressBasis({ owner }) {
  return acceptLegalNow(owner);
}

// ===========================================================================================
// 4 · Verb wrappers. Named arguments only.
// ===========================================================================================

const RUNTIME = ROLES.runtime;

export async function prepareEgressDispatch({
  firm, client, purpose = WORK_EGRESS_PURPOSE, eventSeq, eventType = WORK_EGRESS_EVENT_TYPE,
  documentSha256 = null,
}) {
  const r = await roleQuery(RUNTIME, namedCall("prepare_egress_dispatch", [
    { name: "p_firm", cast: "uuid" }, { name: "p_client", cast: "uuid" },
    { name: "p_purpose", cast: "text" }, { name: "p_event_seq", cast: "bigint" },
    { name: "p_event_type", cast: "text" }, { name: "p_document_sha256", cast: "text" },
  ]), [firm, client, purpose, String(eventSeq), eventType, documentSha256]);
  return r.rows[0].result;
}

export async function consumeEgressDispatch({
  firm, authorization, client, purpose = WORK_EGRESS_PURPOSE, eventSeq,
  eventType = WORK_EGRESS_EVENT_TYPE, documentSha256 = null,
}) {
  const r = await roleQuery(RUNTIME, namedCall("consume_egress_dispatch", [
    { name: "p_firm", cast: "uuid" }, { name: "p_authorization", cast: "uuid" },
    { name: "p_client", cast: "uuid" }, { name: "p_purpose", cast: "text" },
    { name: "p_event_seq", cast: "bigint" }, { name: "p_event_type", cast: "text" },
    { name: "p_document_sha256", cast: "text" },
  ]), [firm, authorization, client, purpose, String(eventSeq), eventType, documentSha256]);
  return r.rows[0].result;
}

export async function prepareWorkEgressDispatch({ task, runId }) {
  const r = await roleQuery(RUNTIME, namedCall("prepare_work_egress_dispatch", [
    { name: "p_task", cast: "uuid" }, { name: "p_run", cast: "text" },
  ]), [task, runId]);
  return r.rows[0].result;
}

/** The event seq the core binds on — server-derived from (work, run), never caller-chosen. */
export async function workEgressEventSeq({ work, runId }) {
  const r = await rootQuery("select clara._work_egress_event_seq($1::uuid,$2::text) as seq", [work, runId]);
  return r.rows[0].seq;
}

/** THE WHOLE DISPATCH, as the runtime performs it: prepare through the task-bound wrapper, then
 *  consume the SAME intent. Returns the consume verdict beside the prepared authorization. */
export async function authoriseWorkRun({ task, runId }) {
  const prepared = await prepareWorkEgressDispatch({ task, runId });
  if (prepared?.verdict !== "granted") return { prepared, consumed: null };
  const consumed = await consumeEgressDispatch({
    firm: prepared.firm_id, authorization: prepared.authorization_id, client: prepared.client_id,
    purpose: prepared.purpose, eventSeq: prepared.event_seq, eventType: prepared.event_type,
  });
  return { prepared, consumed };
}

/** The writer's parameter spec, spelled ONCE: the plain wrapper and the BOUNDED (lock-probe)
 *  variant must present the same call or the probe would prove something else. */
const TRACE_WRITER_SPEC = [
  { name: "p_task", cast: "uuid" }, { name: "p_run", cast: "text" },
  { name: "p_seq", cast: "integer" }, { name: "p_phase", cast: "text" },
  { name: "p_capability_id", cast: "text" }, { name: "p_registry_version", cast: "text" },
  { name: "p_bundle_id", cast: "text" }, { name: "p_bundle_digest", cast: "text" },
  { name: "p_instructions_id", cast: "text" }, { name: "p_skills", cast: "jsonb" },
  { name: "p_tools_id", cast: "text" }, { name: "p_model_id", cast: "text" },
  { name: "p_purpose", cast: "text" }, { name: "p_authorization_id", cast: "uuid" },
  { name: "p_input_digest", cast: "text" }, { name: "p_observed_revisions", cast: "jsonb" },
  { name: "p_started_at", cast: "timestamptz" }, { name: "p_ended_at", cast: "timestamptz" },
  { name: "p_outcome", cast: "text" }, { name: "p_refusal", cast: "jsonb" },
  { name: "p_receipt_id", cast: "uuid" },
];

function traceWriterArgs({
  task, runId, seq, phase, capabilityId = null, registryVersion = null, bundleId = null,
  bundleDigest = null, instructionsId = null, skills = [], toolsId = null, modelId = null,
  purpose = null, authorizationId = null, inputDigest = null, observedRevisions = {},
  startedAt = null, endedAt = null, outcome = "ok", refusal = null, receiptId = null,
}) {
  return [task, runId, seq, phase, capabilityId, registryVersion, bundleId, bundleDigest,
    instructionsId, JSON.stringify(skills), toolsId, modelId, purpose, authorizationId,
    inputDigest, JSON.stringify(observedRevisions), startedAt, endedAt, outcome,
    refusal === null ? null : JSON.stringify(refusal), receiptId];
}

/** Write ONE trace row through the DEFINER door, as the runtime. RAW: it presents exactly what
 *  the caller hands it, so this is the positive control for the DATABASE's own field grammars —
 *  `packages/runtime/lib/work-trace.mjs` conforms its values first and would never reach them. */
export async function recordWorkExecutionTrace(args) {
  const r = await roleQuery(RUNTIME, namedCall("record_work_execution_trace", TRACE_WRITER_SPEC),
    traceWriterArgs(args));
  return r.rows[0].result;
}

/** The same call under a hard `statement_timeout`, so a cell that expects NOT to block can fail
 *  with 57014 instead of hanging the battery behind a lock somebody else holds. */
export async function recordWorkExecutionTraceBounded(args, { timeoutMs = 3000 } = {}) {
  return withActor({ role: RUNTIME }, async (c) => {
    await c.query(`set statement_timeout = ${Number(timeoutMs)}`);
    const r = await c.query(namedCall("record_work_execution_trace", TRACE_WRITER_SPEC),
      traceWriterArgs(args));
    return r.rows[0].result;
  });
}

/**
 * Hold `clara.accounting_work`'s row lock on ONE Work — the exact lock
 * `clara._record_journal_entry_core` holds for the length of a posting transaction — on a SECOND
 * connection, run `fn()` against it, then release. This is the shape of the review's measurement:
 * with a composite FK on the trace relation the insert took `FOR KEY SHARE` and waited behind
 * this lock; without one it does not.
 */
export async function withWorkRowLocked(work, fn) {
  let release = null;
  const held = new Promise((resolve) => { release = resolve; });
  let locked = null;
  const ready = new Promise((resolve) => { locked = resolve; });
  const holder = withActor({ role: ROLES.fnOwner }, async (c) => {
    await c.query("begin");
    await c.query("select 1 from clara.accounting_work where id=$1 for update", [work]);
    locked();
    await held;
    await c.query("rollback");
  });
  await ready;
  try {
    return await fn();
  } finally {
    release();
    await holder;
  }
}

export async function getWorkExecutionTrace(sub, { work }) {
  const r = await humanQuery(sub, namedCall("get_work_execution_trace", [
    { name: "p_work", cast: "uuid" },
  ]), [work]);
  return r.rows[0].result;
}

export async function pruneWorkExecutionTraces({ before, limit = 10000 }) {
  const r = await roleQuery(RUNTIME, namedCall("prune_work_execution_traces", [
    { name: "p_before", cast: "timestamptz" }, { name: "p_limit", cast: "integer" },
  ]), [before, limit]);
  return r.rows[0].result;
}

// ===========================================================================================
// 5 · Readers.
// ===========================================================================================

export async function authorizationRow(id) {
  const r = await rootQuery("select * from clara.egress_dispatch_authorizations where id=$1", [id]);
  return r.rows[0] ?? null;
}

export async function authorizationsFor(client) {
  const r = await rootQuery(
    `select id, purpose, event_seq, event_type, consumed_at, invalidated_at, invalidated_reason,
            expires_at, document_sha256
       from clara.egress_dispatch_authorizations where client_id=$1 order by issued_at`, [client]);
  return r.rows;
}

export async function synthesisedConsent(client) {
  const r = await rootQuery(
    `select id, purpose, scope_note, evidence_document_id, legal_acceptance_id, granted_by,
            revoked_at
       from clara.client_egress_purpose_consents
      where client_id=$1 and purpose=$2`, [client, WORK_EGRESS_PURPOSE]);
  return r.rows[0] ?? null;
}

export async function traceRows(work) {
  const r = await rootQuery(
    `select * from clara.work_execution_traces where work_id=$1 order by run_id, seq`, [work]);
  return r.rows;
}

export async function traceCount(work) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.work_execution_traces where work_id=$1", [work]);
  return r.rows[0].n;
}

/** Revoke the accounting_work purpose for a client through the OWNER door. This is what an
 *  explicit withdrawal looks like: it revokes the consent, deactivates the activation and
 *  INVALIDATES every outstanding authorization. */
export async function revokeWorkEgress(sub, { client, reason = "#631 rig: withdrawn", opKey = null }) {
  const r = await humanQuery(sub, namedCall("revoke_client_egress_purpose", [
    { name: "p_client", cast: "uuid" }, { name: "p_purpose", cast: "text" },
    { name: "p_reason", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [client, WORK_EGRESS_PURPOSE, reason, opKey ?? opk("w631-revoke")]);
  return r.rows[0].result;
}

/** Restore a WITHDRAWN derived accounting_work consent through the OWNER door (#631 S1). The
 *  revoked consent stays standing as history; a FRESH consent+activation pair is minted from the
 *  firm's CURRENT accepted legal texts, so the next dispatch grants again. */
export async function restoreWorkEgress(sub, { client, purpose = WORK_EGRESS_PURPOSE, opKey = null }) {
  const r = await humanQuery(sub, namedCall("restore_client_egress_purpose", [
    { name: "p_client", cast: "uuid" }, { name: "p_purpose", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [client, purpose, opKey ?? opk("w631-restore")]);
  return r.rows[0].result;
}

// #812
/** Deactivate a client's typed egress ACTIVATION through the OWNER door. This is the withdrawal
 *  #812 measures: it stamps the activation and invalidates the client's still-UNCONSUMED dispatch
 *  authorizations, and it NEVER revokes the consent — which is what makes the way back possible. */
export async function deactivateWorkEgressPurpose(sub, {
  client, purpose = WORK_EGRESS_PURPOSE, reason = "#812 rig: paused", opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("deactivate_client_egress_purpose", [
    { name: "p_client", cast: "uuid" }, { name: "p_purpose", cast: "text" },
    { name: "p_reason", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [client, purpose, reason, opKey ?? opk("w812-deact")]);
  return r.rows[0].result;
}

/** Activate a typed egress purpose through the OWNER door, naming the consent. 0195's own door,
 *  unchanged — the cell that names the SURVIVING consent is the measurement. */
export async function activateWorkEgressPurpose(sub, {
  client, purpose = WORK_EGRESS_PURPOSE, consent, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("activate_client_egress_purpose", [
    { name: "p_client", cast: "uuid" }, { name: "p_purpose", cast: "text" },
    { name: "p_consent", cast: "uuid" }, { name: "p_op_key", cast: "text" },
  ]), [client, purpose, consent, opKey ?? opk("w812-act")]);
  return r.rows[0].result;
}

/** The #812 recovery door: re-activate a DEACTIVATED accounting_work activation without the
 *  caller having to name a consent id no lawful read exposes to `clara_authenticated`. */
export async function reactivateWorkEgress(sub, {
  client, purpose = WORK_EGRESS_PURPOSE, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("reactivate_client_egress_purpose", [
    { name: "p_client", cast: "uuid" }, { name: "p_purpose", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [client, purpose, opKey ?? opk("w812-react")]);
  return r.rows[0].result;
}

/** Every activation row for a client and purpose, oldest first — a re-activation leaves TWO, the
 *  first one still carrying its `deactivated_at` and `deactivation_reason` as history. */
export async function activationRows(client, purpose = WORK_EGRESS_PURPOSE) {
  const r = await rootQuery(
    `select id, consent_id, activated_by, activated_at, deactivated_at, deactivation_reason
       from clara.client_egress_purpose_activations
      where client_id=$1 and purpose=$2 order by activated_at, id`, [client, purpose]);
  return r.rows;
}

/** The #812 recovery migration's STABLE STEM, for the lane's per-cell frontier gate. */
export const EGRESS_RECOVERY_STEM = "accounting_work_egress_recovery$";

let _recoveryReady = null;
export async function egressRecoveryReady() {
  if (_recoveryReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [EGRESS_RECOVERY_STEM]);
      _recoveryReady = r.rows[0].n > 0;
    } catch {
      _recoveryReady = false;
    }
  }
  return _recoveryReady;
}

/** `if (await gateEgressRecovery(t)) return;` — #812's own per-cell frontier gate. */
export async function gateEgressRecovery(t) {
  if (await gateEgress(t)) return true;
  if (await egressRecoveryReady()) return false;
  markSkip();
  t.skip(`#812 egress recovery door absent (no ${EGRESS_RECOVERY_STEM} migration applied)`);
  return true;
}
// #812

/** The MANUAL grant door, for the cells that prove it refuses the DERIVED purpose by name. */
export async function grantEgressPurpose(sub, {
  client, purpose, evidenceDocument = null, scopeNote = "#631 rig", opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("grant_client_egress_purpose", [
    { name: "p_client", cast: "uuid" }, { name: "p_purpose", cast: "text" },
    { name: "p_evidence_document", cast: "uuid" }, { name: "p_scope_note", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [client, purpose, evidenceDocument, scopeNote, opKey ?? opk("w631-grant")]);
  return r.rows[0].result;
}

/** Every consent row for a client and purpose, oldest first — a restore leaves TWO. */
export async function consentRows(client, purpose = WORK_EGRESS_PURPOSE) {
  const r = await rootQuery(
    `select id, evidence_document_id, legal_acceptance_id, granted_by, granted_at, revoked_at,
            revoke_reason
       from clara.client_egress_purpose_consents
      where client_id=$1 and purpose=$2 order by granted_at, id`, [client, purpose]);
  return r.rows;
}

/** How many audit rows this firm carries for one fn name. */
export async function auditCount(firm, fn) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.audit_log where firm_id=$1 and fn=$2", [firm, fn]);
  return r.rows[0].n;
}

/** The domain events of one type for one client, oldest first. */
export async function eventsOfType(firm, type, client = null) {
  const r = await rootQuery(
    `select seq, event_type, client_id, actor, payload from clara.domain_events
      where firm_id=$1 and event_type=$2 and ($3::uuid is null or client_id=$3)
      order by seq`, [firm, type, client]);
  return r.rows;
}

/** The prune ledger 0006 owns, newest first. */
export async function tracePruneLog(relation = "work_execution_traces") {
  const r = await rootQuery(
    "select pruned_before, spans_deleted, relation from clara.trace_prune_log where relation=$1 order by id desc",
    [relation]);
  return r.rows;
}

/** Read the trace RELATION directly as a human — the PostgREST-shaped probe. No application role
 *  holds a privilege on it, so this must raise 42501 for every human, whatever their role. */
export async function readTraceTableAs(sub, work) {
  const r = await humanQuery(sub,
    "select id, model_id, refusal from clara.work_execution_traces where work_id=$1", [work]);
  return r.rows;
}

/** Set a client inactive at the root — the estate has no "deactivate client" door in this lane,
 *  and this is a FIXTURE shortcut around an absent writer, stated rather than hidden. */
export async function deactivateClient(client) {
  await rootQuery("update clara.clients set status='archived' where id=$1", [client]);
}

/** Move an authorization's expiry instant BACK past the 120-second TTL. A fixture shortcut around
 *  an absent clock: `t_egress_dispatch_authorizations_update` admits exactly one terminal
 *  transition and nothing else, so the trigger is disabled for this one statement at the root.
 *  Stated rather than hidden — this is not a claim that the estate has an expiry door. */
export async function expireAuthorization(id) {
  await rootQuery("alter table clara.egress_dispatch_authorizations disable trigger t_egress_dispatch_authorizations_update");
  try {
    await rootQuery(
      "update clara.egress_dispatch_authorizations set expires_at = clock_timestamp() - interval '1 second' where id=$1",
      [id]);
  } finally {
    await rootQuery("alter table clara.egress_dispatch_authorizations enable trigger t_egress_dispatch_authorizations_update");
  }
}

export async function reactivateClient(client) {
  await rootQuery("update clara.clients set status='active' where id=$1", [client]);
}
