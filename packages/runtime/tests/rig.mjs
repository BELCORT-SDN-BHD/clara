// Slice-4 runtime rig — DB fixtures for the durable-runtime tests. Builds on the
// existing relay-fixtures persona helpers (asRoot / asRuntime / asHuman) and adds
// the §3 runtime surface (sessions, turns, intents, interruptions). Runs against
// the throwaway clara_rt_test at 127.0.0.1:5544 with RELAY_TEST_MODE=1 (the pools
// connect as the env user then SET ROLE — never AS the bare login, N10).

import { randomUUID } from "node:crypto";

// Env-ONLY (the documented secrets law — no hardcoded credential fallback). The
// runner MUST supply the DB target; fail loudly rather than silently connecting to
// node-postgres's own defaults. RELAY_TEST_MODE is a test-MODE flag (not a
// credential), so the rig may default it.
if (!process.env.PGHOST && !process.env.DATABASE_URL) {
  throw new Error(
    "runtime tests need a DB target in the ENVIRONMENT (PGHOST/PGPORT/PGUSER/PGDATABASE or DATABASE_URL). " +
      "e.g. PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test RELAY_TEST_MODE=1 node --test tests/",
  );
}
process.env.RELAY_TEST_MODE ??= "1";

import * as fx from "./relay-fixtures.mjs";
export * from "./relay-fixtures.mjs";

export const DEFAULT_MODEL = "gpt-5.6-terra";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** SKIP the whole file cleanly when 0006 is absent (probe once per process). */
export async function runtimeReady() {
  const r = await fx.rootQuery(
    `select
       (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname='clara' and c.relname='agent_tasks' limit 1) as tbl,
       (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='clara' and p.proname='begin_chat_turn' limit 1) as fn`,
  );
  return r.rows[0].tbl != null && r.rows[0].fn != null;
}

/** SKIP document-pipeline tests cleanly when migration 0007 is absent. */
export async function documentPipelineReady() {
  const r = await fx.rootQuery(
    `select
       to_regclass('clara.document_intakes') is not null as intakes,
       to_regclass('clara.document_processing_tasks') is not null as tasks,
       to_regprocedure('clara.finalize_document_intake(uuid,text,text,jsonb,integer,text,uuid,uuid,text)') is not null as finalizer`,
  );
  return r.rows[0].intakes === true && r.rows[0].tasks === true && r.rows[0].finalizer === true;
}

export const readDocumentIntake = (id) =>
  fx.rootQuery("select * from clara.document_intakes where id=$1", [id]).then((r) => r.rows[0] ?? null);
export const readDocumentTask = (id) =>
  fx.rootQuery("select * from clara.document_processing_tasks where id=$1", [id]).then((r) => r.rows[0] ?? null);
export const readDocument = (id) =>
  fx.rootQuery("select * from clara.documents where id=$1", [id]).then((r) => r.rows[0] ?? null);

/** Create a real 0007 intake receipt as clara_runtime (token remains hash-only). */
export async function createDocumentIntakeFixture({ owner, origin = "documents_tab", session = null, filename = "fixture.pdf", mime = "application/pdf", bytes = 16 }) {
  const token = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  const tokenHash = fx.sha(token);
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const r = await fx.asRuntime((c) =>
    c.query("select clara.create_document_intake($1,$2,$3,$4,$5,$6,$7,$8,$9) as receipt", [
      owner,
      origin,
      session,
      filename,
      mime,
      bytes,
      tokenHash,
      expiresAt,
      fx.opk("intake"),
    ]),
  );
  return { ...r.rows[0].receipt, token, tokenHash };
}

// ---------------------------------------------------------------------------
// Membership (a second member for firm-shared / cross-member tests).
// ---------------------------------------------------------------------------

/** Add a member to a firm via the human writer (owner acts). Returns the user id. */
export async function addMember(ownerSub, firm, { role = "bookkeeper", prefix = "m" } = {}) {
  const userId = await fx.insertUser(`${prefix}_${Date.now().toString(36)}`, randomUUID().slice(0, 6));
  await fx.humanQuery(ownerSub, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    firm,
    userId,
    role,
    `addmem_${randomUUID().slice(0, 8)}`,
  ]);
  return userId;
}

// ---------------------------------------------------------------------------
// §3.5 sessions / §3.6 turns.
// ---------------------------------------------------------------------------

export async function createChatSession({ author, client = null, visibility = "private", title = null }) {
  const r = await fx.asRuntime((c) =>
    c.query(
      "insert into clara.chat_sessions (created_by, client_id, visibility, title) values ($1,$2,$3,$4) returning id",
      [author, client, visibility, title],
    ),
  );
  return r.rows[0].id;
}

export async function beginChatTurn({ session, author, turnKey = null, parts = null, model = DEFAULT_MODEL }) {
  const r = await fx.asRuntime((c) =>
    c.query("select clara.begin_chat_turn($1,$2,$3,$4::jsonb,$5) as receipt", [
      session,
      author,
      turnKey ?? `tk_${randomUUID().slice(0, 12)}`,
      JSON.stringify(parts ?? [{ type: "text", text: "hi" }]),
      model,
    ]),
  );
  return r.rows[0].receipt;
}

export async function checkpointTurn({ task, segment = 0, tokens = 0, parts = [] }) {
  await fx.asRuntime((c) => c.query("select clara.checkpoint_turn($1,$2,$3,$4::jsonb)", [task, segment, tokens, JSON.stringify(parts)]));
}

export async function settleChatTurn({ task, parts = [], tokens = 10, outcome = "completed", errorCode = null }) {
  const r = await fx.asRuntime((c) =>
    c.query("select clara.settle_chat_turn($1,$2::jsonb,$3,$4,$5) as receipt", [
      task,
      JSON.stringify(parts),
      tokens,
      outcome,
      errorCode,
    ]),
  );
  return r.rows[0].receipt;
}

/** Move a task through statuses directly (runtime lane) — for reconcile/cancel setups. */
export async function driveTask(task, statuses) {
  await fx.asRuntime(async (c) => {
    for (const s of statuses) {
      const r = await c.query("update clara.agent_tasks set status=$2 where id=$1 returning status", [task, s]);
      if (!r.rowCount) throw new Error(`driveTask: 0 rows moving ${task} -> ${s}`);
    }
  });
}

/** Bind a fake engine run id onto a queued task (running) — reconcile fixtures. */
export async function bindRun(task, runId) {
  await fx.asRuntime((c) =>
    c.query("update clara.agent_tasks set workflow_run_id=$2, status='running' where id=$1 and status='queued'", [task, runId]),
  );
}

// ---------------------------------------------------------------------------
// §3.1 consumable wake intents (for the drain).
// ---------------------------------------------------------------------------

export async function makeConsumableIntent({ ownerSub, client }) {
  // Post-0007 the ingest_document wake path is retired; emit the rig's synthetic
  // wake-bound event instead and stamp the intent under the ACTIVE taxonomy (v2,
  // where WAKE_EVENT_TYPE routes to background_review). The wake_intents stamping
  // trigger derives firm_id/event_seq/event_type and validates the (version, type,
  // decision) triple — so we provide only (event_id, decision, taxonomy_version),
  // exactly like the real relay's insertWakeIntent (version=1 no longer holds).
  const firm = await fx.firmOfClient(client);
  const ev = await fx.emitWakeEvent(firm, { actor: ownerSub });
  const version = await fx.activeTaxonomyVersion();
  const r = await fx.asRuntime((c) =>
    c.query(
      `insert into clara.wake_intents (event_id, decision, taxonomy_version)
         values ($1, 'background_review', $2) returning id`,
      [ev.id, version],
    ),
  );
  return { intentId: r.rows[0].id, eventId: ev.id, firm: ev.firm_id };
}

// ---------------------------------------------------------------------------
// §3.3 interruptions (clarify) — mirrors the workflow's recordInterruptionStep.
// ---------------------------------------------------------------------------

export async function insertInterruption({ task, hookToken = null, question = "Which client?", expiresInDays = 14 }) {
  const q = { type: "clarify", question, context: null, framing: "visible to your firm" };
  const tok = hookToken ?? `clarify:${randomUUID()}`;
  const r = await fx.asRuntime((c) =>
    c.query(
      `insert into clara.agent_interruptions (task_id, hook_token, question, expires_at)
         values ($1,$2,$3::jsonb, now() + ($4 || ' days')::interval) returning id`,
      [task, tok, JSON.stringify(q), String(expiresInDays)],
    ),
  );
  return r.rows[0].id;
}

// ---------------------------------------------------------------------------
// Root readers (bypass RLS — see every firm).
// ---------------------------------------------------------------------------

export const readTask = (id) => fx.rootQuery("select * from clara.agent_tasks where id=$1", [id]).then((r) => r.rows[0] ?? null);
export const readInterruption = (id) =>
  fx.rootQuery("select * from clara.agent_interruptions where id=$1", [id]).then((r) => r.rows[0] ?? null);
export const readAssistantMessage = (task) =>
  fx.rootQuery("select * from clara.chat_messages where task_id=$1 and role='assistant'", [task]).then((r) => r.rows[0] ?? null);
export const readOutboxForIntent = (intent) =>
  fx.rootQuery("select * from clara.wakes_outbox where intent_id=$1", [intent]).then((r) => r.rows[0] ?? null);
export const readTaskForIntent = (intent) =>
  fx.rootQuery("select * from clara.agent_tasks where origin_intent_id=$1", [intent]).then((r) => r.rows[0] ?? null);
export const readIntent = (id) => fx.rootQuery("select * from clara.wake_intents where id=$1", [id]).then((r) => r.rows[0] ?? null);
export const readUsage = (firm) => fx.rootQuery("select * from clara.firm_usage_daily where firm_id=$1", [firm]).then((r) => r.rows);
