import express from "express";
import pg from "pg";
import { getHookByToken, getRun, resumeHook, start } from "workflow/api";
import { durableWorkV1, durableWorkV2 } from "./workflows/durable-work";
import { toolLoopWorkV3 } from "./workflows/tool-loop-work";
import { runtimeBoundaryWorkV4 } from "./workflows/runtime-boundary-work";

const { Pool } = pg;
const pool = new Pool({ connectionString: requiredEnv("RIG_DATABASE_URL") });
const app = express();
app.use(express.json());

app.get("/health", (_request, response) => response.json({ ok: true, pid: process.pid, node: process.version }));

app.post("/seed/:workId", async (request, response) => {
  const { workId } = request.params;
  const body = request.body as { actorId: string; role?: string; active?: boolean; authorityRevision?: number; knowledgeRevision?: number };
  const role = body.role ?? "bookkeeper";
  const active = body.active ?? true;
  const authorityRevision = body.authorityRevision ?? 1;
  const knowledgeRevision = body.knowledgeRevision ?? 1;
  await pool.query(
    `insert into rig.trusted_state(actor_id, role, active, authority_revision, knowledge_revision)
     values ($1, $2, $3, $4, $5)
     on conflict (actor_id) do update set role=excluded.role, active=excluded.active,
       authority_revision=excluded.authority_revision, knowledge_revision=excluded.knowledge_revision`,
    [body.actorId, role, active, authorityRevision, knowledgeRevision],
  );
  await pool.query(
    `insert into rig.work_snapshot(work_id, actor_id, required_authority_revision, required_knowledge_revision)
     values ($1, $2, $3, $4)`,
    [workId, body.actorId, authorityRevision, knowledgeRevision],
  );
  await pool.query("insert into rig.chat_messages(work_id, body) values ($1, $2)", [workId, "synthetic user message"]);
  response.json({ workId, actorId: body.actorId, authorityRevision, knowledgeRevision });
});

app.post("/start/:version/:workId", async (request, response) => {
  const { version, workId } = request.params;
  const body = request.body as { mode?: "crash_effect" | "basis_resume" };
  const selectedVersion = version === "default" ? "v4" : version;
  const run = selectedVersion === "v1"
    ? await start(durableWorkV1, [{ workId }])
    : selectedVersion === "v2"
      ? await start(durableWorkV2, [{ workId }])
      : selectedVersion === "v3"
        ? await start(toolLoopWorkV3, [{ workId }])
        : selectedVersion === "v4"
          ? await start(runtimeBoundaryWorkV4, [{ workId, mode: body.mode }])
          : null;
  if (!run) return response.status(400).json({ error: `unknown workflow version ${version}` });
  await pool.query("update rig.work_snapshot set workflow_run_id=$2 where work_id=$1", [workId, run.runId]);
  response.json({ runId: run.runId, version: selectedVersion, requestedVersion: version });
});

app.get("/hook/:workId", async (request, response) => {
  const token = `answer:${request.params.workId}`;
  try {
    await getHookByToken(token);
    response.json({ active: true, token });
  } catch {
    response.status(404).json({ active: false, token });
  }
});

app.post(["/answer/:workId", "/cancel/:workId"], async (request, response) => {
  const kind = request.path.startsWith("/cancel/") ? "cancel" : "answer";
  const body = request.body as { answerId: string; text?: string };
  try {
    const result = await resumeHook(`answer:${request.params.workId}`, { kind, answerId: body.answerId, text: body.text });
    response.json({ accepted: true, result });
  } catch (error) {
    response.status(409).json({ accepted: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/admit-answer/:workId", async (request, response) => {
  const { workId } = request.params;
  const body = request.body as { operationKey: string; answerId: string; text: string };
  const client = await pool.connect();
  let receiptId: string;
  let replayed = false;
  try {
    await client.query("begin");
    const existing = await client.query(
      `select receipt_id, work_id, answer_id, answer_text, delivered_at
         from rig.answer_receipts
        where operation_key = $1
        for update`,
      [body.operationKey],
    );
    if (existing.rowCount === 1) {
      const row = existing.rows[0];
      if (row.work_id !== workId || row.answer_id !== body.answerId || row.answer_text !== body.text) {
        await client.query("rollback");
        return response.status(409).json({ accepted: false, error: "operation key payload conflict" });
      }
      receiptId = String(row.receipt_id);
      replayed = true;
      await client.query("commit");
      return response.json({ accepted: true, replayed, receiptId, delivered: row.delivered_at !== null });
    }

    const interruption = await client.query(
      `select status
         from rig.interruptions
        where work_id = $1
        for update`,
      [workId],
    );
    if (interruption.rowCount !== 1 || interruption.rows[0].status !== "pending") {
      await client.query("rollback");
      return response.status(409).json({ accepted: false, error: "question is no longer pending" });
    }
    const inserted = await client.query(
      `insert into rig.answer_receipts(operation_key, work_id, answer_id, answer_text)
       values ($1, $2, $3, $4)
       returning receipt_id`,
      [body.operationKey, workId, body.answerId, body.text],
    );
    receiptId = String(inserted.rows[0].receipt_id);
    await client.query(
      `update rig.interruptions
          set status='answered', accepted_answer_id=$2, accepted_answer_text=$3
        where work_id=$1`,
      [workId, body.answerId, body.text],
    );
    await client.query("update rig.work_basis set accepted_answer=$2 where work_id=$1", [workId, body.text]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  try {
    const result = await resumeHook(`answer:${workId}`, { kind: "answer", answerId: body.answerId, text: body.text });
    await pool.query("update rig.answer_receipts set delivered_at=clock_timestamp() where receipt_id=$1", [receiptId]);
    response.json({ accepted: true, replayed, receiptId, delivered: true, result });
  } catch (error) {
    response.status(503).json({
      accepted: true,
      replayed,
      receiptId,
      delivered: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/state/:workId", async (request, response) => {
  const { workId } = request.params;
  const snapshot = await pool.query("select workflow_run_id from rig.work_snapshot where work_id=$1", [workId]);
  if (snapshot.rowCount !== 1 || !snapshot.rows[0].workflow_run_id) return response.status(404).json({ error: "run not found" });
  const runId = snapshot.rows[0].workflow_run_id as string;
  const run = getRun(runId);
  const status = await run.status;
  const returnValue = ["completed", "failed", "cancelled"].includes(status) ? await run.returnValue.catch((error) => ({ error: String(error) })) : null;
  const effects = await pool.query("select receipt_id, operation_key, answer_text from rig.effects where work_id=$1 order by receipt_id", [workId]);
  response.json({ runId, status, returnValue, effects: effects.rows });
});

app.get("/stream/:workId", async (request, response) => {
  const { workId } = request.params;
  const snapshot = await pool.query("select workflow_run_id from rig.work_snapshot where work_id=$1", [workId]);
  if (snapshot.rowCount !== 1 || !snapshot.rows[0].workflow_run_id) return response.status(404).json({ error: "run not found" });
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const reader = getRun(snapshot.rows[0].workflow_run_id).getReadable({ startIndex: 0 }).getReader();
  request.on("close", () => void reader.cancel());
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(`data: ${JSON.stringify({ chunk: new TextDecoder().decode(value) })}\n\n`);
    }
    response.end();
  } catch (error) {
    if (!response.destroyed) response.destroy(error as Error);
  }
});

export default app;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}
