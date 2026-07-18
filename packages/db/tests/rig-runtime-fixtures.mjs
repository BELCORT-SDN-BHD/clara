// Slice-4 rig — fixture creators + fn wrappers for the durable-runtime surface
// (NOT a test file). Re-exports rig-runtime-helpers so test files import ONE
// module. Contract-blind: every fn is called with the NAMED parameters the
// contract states (§3.2/§3.3/§3.6); where the contract is silent on a column
// name the adaptive core maps semantic fields onto the live catalog and records
// a LANE_NOTE on any divergence.

import { randomUUID } from "node:crypto";
import {
  ROLES,
  rootQuery,
  roleQuery,
  humanQuery,
  human,
  opk,
  sha,
  ingestDocument,
  DEFAULT_MODEL,
  adaptiveInsert,
  columnMap,
  firstPresent,
  laneQuery,
  noteLane,
  readRow,
  readRowsWhere,
  assertIdent,
} from "./rig-runtime-helpers.mjs";

export * from "./rig-runtime-helpers.mjs";

// ---------------------------------------------------------------------------
// §3.5 chat sessions.
// ---------------------------------------------------------------------------

/** A chat session (runtime-lane INSERT; the author trigger must validate that
 *  the author is a live active member of the SESSION'S firm). */
export async function createChatSession({ firm, author, visibility = "private", client = null, lane = "runtime" }) {
  const byName = await columnMap("chat_sessions");
  const desired = { firm_id: firm };
  const authorCol = firstPresent(byName, ["created_by", "author_id", "owner_id", "user_id"]);
  if (authorCol) desired[authorCol] = author;
  else noteLane("chat_sessions: no author-shaped column found (created_by/author_id/owner_id/user_id) — §3.5 author stamp unverifiable by name");
  if (byName.has("visibility")) desired.visibility = visibility;
  else noteLane("chat_sessions: no 'visibility' column — §0.9 visibility law unverifiable by name");
  if (client != null && byName.has("client_id")) desired.client_id = client;
  const r = await adaptiveInsert("chat_sessions", desired, { lane, label: "create chat_session" });
  return r.rows[0].id;
}

/** The author-shaped column name of chat_sessions (for masking assertions). */
export async function sessionAuthorColumn() {
  return firstPresent(await columnMap("chat_sessions"), ["created_by", "author_id", "owner_id", "user_id"]);
}

// ---------------------------------------------------------------------------
// §3.6 begin/settle (runtime-only writers).
// ---------------------------------------------------------------------------

export async function beginChatTurn({ session, author, turnKey, parts, model = DEFAULT_MODEL }) {
  const r = await roleQuery(
    ROLES.runtime,
    "select clara.begin_chat_turn(p_session => $1, p_author => $2, p_turn_key => $3, p_user_parts => $4::jsonb, p_model => $5) as result",
    [session, author, turnKey, JSON.stringify(parts ?? [{ type: "text", text: "rig user turn" }]), model],
  );
  return r.rows[0].result;
}

/** Pull the task id out of a begin receipt (shape contract-silent: jsonb or uuid). */
export function taskIdOf(receipt) {
  if (receipt == null) return null;
  if (typeof receipt === "string") return receipt;
  return receipt.task_id ?? receipt.task ?? receipt.id ?? null;
}

export async function settleChatTurn({ task, parts, tokens = 10, outcome = "completed", errorCode = null }) {
  const r = await roleQuery(
    ROLES.runtime,
    "select clara.settle_chat_turn(p_task => $1, p_parts => $2::jsonb, p_tokens => $3, p_outcome => $4, p_error_code => $5) as result",
    [task, JSON.stringify(parts ?? [{ type: "text", text: "rig assistant" }]), tokens, outcome, errorCode],
  );
  return r.rows[0].result;
}

/** Drive an agent_task through engine statuses (runtime lane; 42501 → root+note).
 *  A structural transition rejection (CLR13) PROPAGATES — that is signal. */
export async function driveTaskStatus(task, path) {
  for (const s of path) {
    const r = await laneQuery(
      "runtime",
      "update clara.agent_tasks set status = $2 where id = $1 returning status",
      [task, s],
      `drive task → ${s}`,
    );
    if (!r.rowCount) throw new Error(`driveTaskStatus: 0 rows moving task ${task} → ${s}`);
  }
}

// ---------------------------------------------------------------------------
// §3.1 wake intents (consumption lifecycle).
// ---------------------------------------------------------------------------

/** A fresh consumable wake intent — ingest a doc (human lane) then insert the
 *  intent (runtime lane) with the v1 background_review routing. */
export async function makeConsumableIntent({ sub, client }) {
  await ingestDocument(human(sub), { client, sha256: sha(randomUUID()), opKey: opk("s4int") });
  const ev = (
    await rootQuery(
      `select de.id, de.firm_id, de.seq, de.event_type from clara.domain_events de
       where de.client_id = $1 and de.event_type = 'document.ingested' order by de.seq desc limit 1`,
      [client],
    )
  ).rows[0];
  if (!ev) throw new Error("makeConsumableIntent: no document.ingested event found");
  const r = await roleQuery(
    ROLES.runtime,
    "insert into clara.wake_intents (event_id, firm_id, event_seq, event_type, decision, taxonomy_version) values ($1, $2, $3, $4, 'background_review', 1) returning id",
    [ev.id, ev.firm_id, ev.seq, ev.event_type],
  );
  return { intentId: r.rows[0].id, eventId: ev.id, firm: ev.firm_id };
}

/** §3.1: the ONLY legal update — pending→consumed (runtime lane; consumed_by required). */
export async function consumeIntent(intent, consumedBy = randomUUID()) {
  const r = await roleQuery(
    ROLES.runtime,
    "update clara.wake_intents set status = 'consumed', consumed_by = $2 where id = $1 and status = 'pending' returning to_jsonb(wake_intents) as row",
    [intent, consumedBy],
  );
  return r.rows[0]?.row ?? null;
}

// ---------------------------------------------------------------------------
// §3.2 agent_tasks direct inserts (stamping/derivation tests).
// ---------------------------------------------------------------------------

/** A held wake task projected from a consumed intent (the drain projection). */
export async function insertWakeTask({ intent, firm = null, status = "held", createdBy = undefined, lane = "runtime", extra = {} }) {
  const desired = { kind: "wake", status, origin_intent_id: intent, ...extra };
  if (firm != null) desired.firm_id = firm;
  if (createdBy !== undefined) desired.created_by = createdBy;
  const r = await adaptiveInsert("agent_tasks", desired, { lane, label: "insert wake task" });
  return r.rows[0].id;
}

/** A chat_turn task inserted DIRECTLY (stamping tests; normal path = begin_chat_turn). */
export async function insertChatTask({ session, firm = null, client = undefined, status = "queued", createdBy = undefined, lane = "runtime", extra = {} }) {
  const desired = { kind: "chat_turn", status, session_id: session, model_snapshot: DEFAULT_MODEL, ...extra };
  if (firm != null) desired.firm_id = firm;
  if (client !== undefined) desired.client_id = client;
  if (createdBy !== undefined) desired.created_by = createdBy;
  const r = await adaptiveInsert("agent_tasks", desired, { lane, label: "insert chat task" });
  return r.rows[0].id;
}

// ---------------------------------------------------------------------------
// §3.3 interruptions (clarify).
// ---------------------------------------------------------------------------

export async function insertInterruption({ task, firm = null, question = "Which client should this be attributed to?", askedOf = null, expiresAt = null, status = undefined, lane = "runtime", extra = {} }) {
  const byName = await columnMap("agent_interruptions");
  const desired = { ...extra };
  const taskCol = firstPresent(byName, ["task_id", "agent_task_id"]);
  if (taskCol) desired[taskCol] = task;
  else noteLane("agent_interruptions: no task linkage column (task_id/agent_task_id) — §3.3 parent unverifiable by name");
  if (firm != null && byName.has("firm_id")) desired.firm_id = firm;
  const qCol = firstPresent(byName, ["question", "prompt", "question_text", "question_parts", "body", "content"]);
  if (qCol) desired[qCol] = question;
  else noteLane("agent_interruptions: no question-shaped column found — §0.5 clarify content unverifiable by name");
  if (askedOf != null && byName.has("asked_of")) desired.asked_of = askedOf;
  if (byName.has("expires_at")) desired.expires_at = expiresAt ?? new Date(Date.now() + 14 * 86400e3).toISOString();
  else noteLane("agent_interruptions: no 'expires_at' column — §0.6 deadline unverifiable by name");
  if (status !== undefined && byName.has("status")) desired.status = status;
  const kindCol = byName.get("kind");
  if (kindCol && kindCol.is_nullable === "NO" && kindCol.column_default == null && !("kind" in desired)) desired.kind = "clarify";
  const r = await adaptiveInsert("agent_interruptions", desired, { lane, label: "insert interruption" });
  return r.rows[0].id;
}

/** The interruption's task-linkage + question column names (for readbacks/greps). */
export async function interruptionColumns() {
  const byName = await columnMap("agent_interruptions");
  return {
    taskCol: firstPresent(byName, ["task_id", "agent_task_id"]),
    questionCol: firstPresent(byName, ["question", "prompt", "question_text", "question_parts", "body", "content"]),
  };
}

// ---------------------------------------------------------------------------
// §3.4 wakes_outbox.
// ---------------------------------------------------------------------------

export async function insertOutbox({ intent, firm = null, condition = undefined, lane = "runtime", extra = {} }) {
  const byName = await columnMap("wakes_outbox");
  const desired = { ...extra };
  const iCol = firstPresent(byName, ["intent_id", "origin_intent_id", "wake_intent_id"]);
  if (iCol) desired[iCol] = intent;
  else noteLane("wakes_outbox: no intent linkage column found — §3.4 stamping source unverifiable by name");
  if (firm != null && byName.has("firm_id")) desired.firm_id = firm;
  const cCol = firstPresent(byName, ["condition", "decision", "wake_condition"]);
  if (condition !== undefined && cCol) desired[cCol] = condition;
  const r = await adaptiveInsert("wakes_outbox", desired, { lane, label: "insert outbox row" });
  return { id: r.rows[0].id, intentCol: iCol, conditionCol: cCol };
}

export async function outboxRowsForIntent(intent) {
  const iCol = firstPresent(await columnMap("wakes_outbox"), ["intent_id", "origin_intent_id", "wake_intent_id"]);
  if (!iCol) return [];
  return readRowsWhere("wakes_outbox", iCol, intent);
}

// ---------------------------------------------------------------------------
// §3.7 trace spans (upsert key (trace_id, span_id); identity derived from task).
// ---------------------------------------------------------------------------

export async function insertSpan({ traceId, spanId, task = undefined, firm = null, lane = "runtime", extra = {} }) {
  const byName = await columnMap("trace_spans");
  const desired = { trace_id: traceId, span_id: spanId, ...extra };
  if (task !== undefined && byName.has("task_id")) desired.task_id = task;
  if (firm != null && byName.has("firm_id")) desired.firm_id = firm;
  const nameCol = firstPresent(byName, ["name", "span_name", "op", "operation"]);
  if (nameCol && !(nameCol in desired)) desired[nameCol] = "rig.span";
  if (byName.has("started_at") && !("started_at" in desired)) desired.started_at = new Date().toISOString();
  return adaptiveInsert("trace_spans", desired, { lane, returning: null, label: "insert trace span" });
}

export async function spanRows(traceId, spanId) {
  const r = await rootQuery("select to_jsonb(t) as row from clara.trace_spans t where t.trace_id = $1 and t.span_id = $2", [traceId, spanId]);
  return r.rows.map((x) => x.row);
}

/** Ensure a task carries a trace_id (stamp one via the runtime lane if absent). */
export async function ensureTaskTrace(task) {
  const row = await readRow("agent_tasks", task);
  if (row?.trace_id) return row.trace_id;
  const tid = randomUUID();
  await laneQuery("runtime", "update clara.agent_tasks set trace_id = $2 where id = $1", [task, tid], "stamp trace_id");
  return (await readRow("agent_tasks", task))?.trace_id ?? null;
}

// ---------------------------------------------------------------------------
// Governance wrappers (human lane — §3.2 / §3.3 / §3.5).
// ---------------------------------------------------------------------------

export async function answerInterruption(sub, { id, answer, opKey }) {
  // As-landed (observed at run time, not from 0006): p_answer is jsonb — a plain
  // text answer fails 22P02. Structure-first is §0.5-consistent; strings are
  // encoded as a JSON string literal. (Recorded as a lane observation.)
  const payload = JSON.stringify(answer ?? null);
  const r = await humanQuery(
    sub,
    "select clara.answer_interruption(p_id => $1, p_answer => $2::jsonb, p_op_key => $3) as result",
    [id, payload, opKey],
  );
  return r.rows[0].result;
}

export async function cancelAgentTask(sub, { task, opKey }) {
  const r = await humanQuery(
    sub,
    "select clara.cancel_agent_task(p_task => $1, p_op_key => $2) as result",
    [task, opKey],
  );
  return r.rows[0].result;
}

/** share_chat_session — the contract names the fn + p_op_key but not the session
 *  param name; try the house-style p_session, fall back to positional + a note. */
export async function shareChatSession(sub, { session, opKey }) {
  try {
    const r = await humanQuery(
      sub,
      "select clara.share_chat_session(p_session => $1, p_op_key => $2) as result",
      [session, opKey],
    );
    return r.rows[0].result;
  } catch (e) {
    if (e.code === "42883") {
      noteLane("share_chat_session: p_session named-arg call failed 42883 — falling back to positional (param-name divergence to record)");
      const r = await humanQuery(sub, "select clara.share_chat_session($1, $2) as result", [session, opKey]);
      return r.rows[0].result;
    }
    throw e;
  }
}

/** audit_log rows for one fn in one firm (root reader — newest first). */
export async function auditRows(firm, fn) {
  const r = await rootQuery(
    "select to_jsonb(a) as row from clara.audit_log a where a.firm_id = $1 and a.fn = $2 order by a.id desc",
    [firm, fn],
  );
  return r.rows.map((x) => x.row);
}

// ---------------------------------------------------------------------------
// Metering readers/writers (column names contract-silent → discovered).
// ---------------------------------------------------------------------------

export async function usageSnapshot(firm) {
  const r = await rootQuery("select to_jsonb(t) as row from clara.firm_usage_daily t where t.firm_id = $1", [firm]);
  return r.rows.map((x) => x.row);
}

/** The numeric column carrying the day's token usage: the largest counter ≥ minVal. */
export function usageCounterColumn(rows, minVal = 1) {
  const best = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
      if (Number.isNaN(n)) continue;
      if (/(^|_)id$/.test(k) || /version/.test(k)) continue;
      if (!(k in best) || n > best[k]) best[k] = n;
    }
  }
  const cands = Object.entries(best).filter(([, v]) => v >= minVal);
  cands.sort((a, b) => b[1] - a[1]);
  return cands[0]?.[0] ?? null;
}

export async function setDailyUsage(firm, column, value) {
  assertIdent(column);
  const r = await rootQuery(`update clara.firm_usage_daily set ${column} = $2 where firm_id = $1 returning ${column}`, [firm, value]);
  return r.rowCount;
}

export async function taskUsageRows(task) {
  try {
    return await readRowsWhere("task_usage", "task_id", task);
  } catch (e) {
    noteLane(`task_usage read by task_id failed (${e.message}) — column-name divergence`);
    return [];
  }
}
