import express from "express";
import { checkDb } from "../lib/db.js";
import { workflowNames } from "../workflows/registry.js";

// Clara agent-runtime skeleton. Slice 1 wires ONLY the durable substrate +
// health/ready probes + the workflow-versioning hook point. No agent/LLM logic
// yet (Slice 4). The engine's own routes live under /.well-known/workflow/v1/*
// (mounted by the workflow/nitro module).
const app = express();
app.use(express.json());

// Liveness — is the process up? No dependencies. Used for restart/keepalive.
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "clara-runtime", pid: process.pid, ts: new Date().toISOString() });
});

// Readiness — should we receive traffic? Checks DB connectivity (the single
// source of truth must be reachable). Returns 503 when not ready so a load
// balancer / orchestrator holds traffic. This is the GAP1-7 fix: readiness, not
// liveness-only.
app.get("/ready", async (_req, res) => {
  const db = await checkDb();
  const worldEnabled = process.env.CLARA_START_WORLD === "1";
  const ready = db.ok;
  res.status(ready ? 200 : 503).json({
    ready,
    checks: { db, world: { enabled: worldEnabled } },
    ts: new Date().toISOString(),
  });
});

// The versioning hook point: the workflows the runtime knows about (newest
// version per class, from the registry). The freeze-lint guards their bodies.
app.get("/workflows", (_req, res) => {
  res.json({ registered: workflowNames });
});

export default app;
