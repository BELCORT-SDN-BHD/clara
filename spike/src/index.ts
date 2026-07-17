import { randomUUID } from "node:crypto";
import express from "express";
import { getRun, resumeHook, start } from "workflow/api";
import { closeDemo } from "../workflows/closeDemo.js";
import { pingDemo } from "../workflows/pingDemo.js";

// Control surface for the spike. The engine does NOT need these routes to
// execute runs - they exist so the acceptance tests can enqueue/resume/inspect
// over HTTP. The engine's own routes live under /.well-known/workflow/v1/*
// (mounted by the workflow/nitro module, called by the embedded queue worker).
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    pid: process.pid,
    world: process.env.WORKFLOW_TARGET_WORLD ?? "(default)",
    fault: process.env.FAULT ?? null,
  });
});

// Start a close-demo run. Body (optional): { opKey?: string, amountCents?: number }
app.post("/demo/enqueue", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const amountCents = typeof body.amountCents === "number" ? Math.trunc(body.amountCents) : 12345;
    const opKey =
      typeof body.opKey === "string" && body.opKey.length > 0 ? body.opKey : `op-${randomUUID()}`;
    const run = await start(closeDemo, [opKey, amountCents]);
    res.json({ runId: run.runId, opKey, amountCents, hookToken: `approval:${opKey}` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Resume a parked hook. Body: { token: string, approved?: boolean, approver?: string }
app.post("/demo/resume", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const token = body.token;
  if (typeof token !== "string" || token.length === 0) {
    res.status(400).json({ error: "body must include { token }" });
    return;
  }
  const approved = body.approved !== false;
  const approver = typeof body.approver === "string" ? body.approver : "spike-operator";
  try {
    const result = await resumeHook(token, { approved, approver });
    res.json({ resumed: true, runId: result.runId, token, approved, approver });
  } catch (err) {
    // Hook not found / not yet registered - the caller may retry.
    res.status(404).json({ resumed: false, token, error: String(err) });
  }
});

// Run status via the engine API (works for any world, incl. Local in dryrun).
app.get("/demo/run/:runId", async (req, res) => {
  const runId = req.params.runId;
  try {
    const run = getRun(runId);
    const [status, workflowName, createdAt, startedAt, completedAt] = await Promise.all([
      run.status,
      run.workflowName,
      run.createdAt,
      run.startedAt,
      run.completedAt,
    ]);
    let returnValue: unknown = null;
    if (status === "completed") {
      returnValue = await run.returnValue;
    }
    res.json({
      runId,
      status,
      workflowName,
      createdAt,
      startedAt: startedAt ?? null,
      completedAt: completedAt ?? null,
      returnValue,
    });
  } catch (err) {
    res.status(500).json({ runId, error: String(err) });
  }
});

// DB-free enqueue used by `pnpm dryrun` (Local World, no DATABASE_URL).
app.post("/dryrun/enqueue", async (_req, res) => {
  try {
    const key = `dr-${randomUUID().slice(0, 8)}`;
    const run = await start(pingDemo, [key]);
    res.json({ runId: run.runId, key, hookToken: `dryrun:${key}` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default app;
