import express from "express";
import { workflowNames } from "../workflows/registry.js";
import { checkReadiness } from "../lib/health.mjs";
import { chatRoutes } from "./chatRoutes.js";
import { streamRoutes } from "./streamRoute.js";

// Clara agent-runtime HTTP surface (Slice 4). The durable chat loop, SSE, and the
// admission/turn routes ride on top of the WDK Postgres world (started by
// plugins/startWorld.ts when CLARA_START_WORLD=1). The control listener, relay+drain,
// and reconciler run in that same plugin so the whole process is one crash-only group.
const app = express();
app.use(express.json({ limit: "1mb" }));

// Liveness — is the process up? No dependencies.
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "clara-runtime", pid: process.pid, ts: new Date().toISOString() });
});

// Readiness — should we receive traffic? FAILS (503) only on DB unreachable, world
// dead, control listener dead, or taxonomy HALT (§4.7); relay lag / dead-letters /
// backlog are warnings[] (degraded, still serving). Bounded + sanitized.
app.get("/ready", async (_req, res) => {
  const r = await checkReadiness();
  res.status(r.ready ? 200 : 503).json({ ready: r.ready, checks: r.checks, warnings: r.warnings, ts: new Date().toISOString() });
});

// The registered workflows (the versioning hook point; freeze-lint guards bodies).
app.get("/workflows", (_req, res) => {
  res.json({ registered: workflowNames });
});

// Chat: sessions, messages, turns (admission + enqueue), and the SSE stream.
app.use(chatRoutes());
app.use(streamRoutes());

export default app;
