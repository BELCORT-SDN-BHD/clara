// The CHILD half of `tests/work-knowledge-e2e.mjs` (#658). NOT a test file on its own.
//
// It checks out as `clara_runtime` — the ONLY role migration 0230 grants
// `clara.record_work_knowledge_read` to — writes ONE read-set row through the door, prints
// `WROTE <id>` and then HANGS FOREVER so the parent can SIGKILL it between the write and its
// acknowledgement. A child that exited on its own would be proving that a retry works, not that a
// RESUME does.
//
// It calls the door through `packages/runtime/lib/knowledge-retrieval.mjs` rather than by hand, so
// the leg exercises the module `claraWork_v5` will import — the named-argument binding, the
// `faceStatusOf` mapping and the never-throws contract included.

import pg from "pg";

import { recordWorkKnowledgeRead } from "../lib/knowledge-retrieval.mjs";

const [taskId, runId, seq] = process.argv.slice(2);

const ANSWER = {
  status: "ok",
  knowledge_version: "42",
  as_of: "2026-09-19",
  tiers: { core: 3, requested: 0, remainder: 4 },
  keys: ["accounting_basis", "sst_regime"],
  truncated: false,
  hidden_count: 0,
  core_ok: true,
  records: [{}, {}, {}, {}, {}, {}, {}],
};

const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  database: process.env.PGDATABASE,
});

await client.connect();
// THE LEAST PRIVILEGE THAT SHOULD SUCCEED. The rig connects as `postgres`, a member of every role,
// so a leg that did not SET ROLE would prove nothing about the grant 0230 actually made.
await client.query("set role clara_runtime");

const out = await recordWorkKnowledgeRead(client, {
  taskId, runId, seq: Number(seq), answer: ANSWER,
});

if (out.ok) {
  console.log(`WROTE ${out.receipt?.read_id ?? "(no id)"}`);
} else {
  console.log(`REFUSED ${out.code ?? "none"} ${out.reason ?? ""}`.trim());
  await client.end();
  process.exit(0);
}

// HANG. The parent kills us here, which is the whole point of the leg.
await new Promise(() => {});
