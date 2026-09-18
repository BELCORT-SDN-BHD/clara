import pg from "pg";
import { createHook, getWritable } from "workflow";

const { Pool } = pg;

type WorkInput = { workId: string };
type Answer = { kind: "answer" | "cancel"; answerId: string; text?: string };

export async function durableWorkV1(input: WorkInput) {
  "use workflow";

  await emit({ type: "accepted", bodyVersion: "v1", workId: input.workId });
  using hook = createHook<Answer>({ token: `answer:${input.workId}` });
  const answer = await hook;
  if (answer.kind === "cancel") {
    await emit({ type: "cancelled", bodyVersion: "v1", workId: input.workId });
    await closeOutput();
    return { status: "cancelled", bodyVersion: "v1", workId: input.workId };
  }

  const result = await recheckTrustedStateAndRecord(input.workId, answer.answerId, answer.text ?? "");
  await emit({ type: result.status, bodyVersion: "v1", workId: input.workId, ...result });
  await closeOutput();
  return { bodyVersion: "v1", workId: input.workId, ...result };
}

export async function durableWorkV2(input: WorkInput) {
  "use workflow";

  await emit({ type: "accepted", bodyVersion: "v2", workId: input.workId });
  using hook = createHook<Answer>({ token: `answer:${input.workId}` });
  const answer = await hook;
  if (answer.kind === "cancel") {
    await emit({ type: "cancelled", bodyVersion: "v2", workId: input.workId });
    await closeOutput();
    return { status: "cancelled", bodyVersion: "v2", workId: input.workId };
  }

  const result = await recheckTrustedStateAndRecord(input.workId, answer.answerId, answer.text ?? "");
  await emit({ type: result.status, bodyVersion: "v2", workId: input.workId, ...result });
  await closeOutput();
  return { bodyVersion: "v2", workId: input.workId, ...result };
}

async function recheckTrustedStateAndRecord(workId: string, answerId: string, text: string) {
  "use step";

  const pool = new Pool({ connectionString: requiredEnv("RIG_DATABASE_URL") });
  try {
    const state = await pool.query(
      `select t.role, t.active, t.authority_revision, t.knowledge_revision,
              w.required_authority_revision, w.required_knowledge_revision
         from rig.work_snapshot w
         join rig.trusted_state t on t.actor_id = w.actor_id
        where w.work_id = $1`,
      [workId],
    );
    if (state.rowCount !== 1) throw new Error(`missing trusted state for ${workId}`);
    const row = state.rows[0];
    const authorized =
      row.active === true &&
      row.role === "bookkeeper" &&
      row.authority_revision === row.required_authority_revision &&
      row.knowledge_revision === row.required_knowledge_revision;
    if (!authorized) {
      return {
        status: "blocked_authority" as const,
        observed: {
          role: row.role,
          active: row.active,
          authorityRevision: row.authority_revision,
          knowledgeRevision: row.knowledge_revision,
        },
      };
    }

    const operationKey = `${workId}:${answerId}`;
    const insert = () =>
      pool.query(
        `insert into rig.effects(operation_key, work_id, answer_text)
         values ($1, $2, $3)
         on conflict (operation_key) do nothing
         returning receipt_id`,
        [operationKey, workId, text],
      );
    const attempts = await Promise.all([insert(), insert()]);
    const receipt = attempts.flatMap((attempt) => attempt.rows)[0]?.receipt_id;
    const persisted = await pool.query(
      "select receipt_id from rig.effects where operation_key = $1",
      [operationKey],
    );
    return {
      status: "completed" as const,
      receiptId: receipt ?? persisted.rows[0].receipt_id,
      concurrentInsertCounts: attempts.map((attempt) => attempt.rowCount),
    };
  } finally {
    await pool.end();
  }
}

async function emit(event: unknown) {
  "use step";
  const writer = getWritable<Uint8Array>().getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
  } finally {
    writer.releaseLock();
  }
}

async function closeOutput() {
  "use step";
  const writer = getWritable<Uint8Array>().getWriter();
  await writer.close();
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}
