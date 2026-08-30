import type { Server } from "node:http";
import express from "express";
import { workflowNames } from "../workflows/registry.js";
import { startStorageProbe } from "../lib/storage-probe.mjs";
import { readinessHandler } from "../lib/readiness-http.mjs";
import { chatRoutes } from "./chatRoutes.js";
import { intakeRoutes } from "./intakeRoutes.js";
import { streamRoutes } from "./streamRoute.js";
import { documentRoutes } from "./documentRoutes.js";
import { interviewRoutes } from "./interviewRoutes.js";
import { openingRoutes } from "./openingRoutes.js";
import { seedingRoutes } from "./seedingRoutes.js";

// Clara agent-runtime HTTP surface (Slice 4). The durable chat loop, SSE, and the
// admission/turn routes ride on top of the WDK Postgres world (started by
// plugins/startWorld.ts when CLARA_START_WORLD=1). The control listener, relay+drain,
// and reconciler run in that same plugin so the whole process is one crash-only group.
type Sup = { shuttingDown: boolean; stops: Array<() => unknown>; activeRequests: number; httpServer?: Server };
const sup = ((globalThis as unknown as { __claraSupervisor?: Sup }).__claraSupervisor ??= {
  shuttingDown: false,
  stops: [],
  activeRequests: 0,
});

const app = express();

// Spend the Fly grace period proving storage, before the first /ready request. The cached
// verdict remains fail-closed until this boot-started cycle produces its first success.
startStorageProbe();

// Graceful-shutdown gate + active-request tracking (S4-FX2). Runs BEFORE every route:
// captures the HTTP listener (so serve.mjs can server.close() on SIGTERM), refuses
// NEW requests with 503 GLOBALLY while draining (except /health liveness and /ready's
// structured shutdown response), and counts in-flight requests + SSE streams so the
// supervisor can wait for zero-active.
app.use((req, res, next) => {
  if (!sup.httpServer) {
    const s = (req.socket as unknown as { server?: Server }).server;
    if (s) sup.httpServer = s;
  }
  const normalizedPath = req.path.replace(/\/+$/, "").toLowerCase();
  const drainExempt =
    (req.method === "GET" || req.method === "HEAD") &&
    (normalizedPath === "/health" || normalizedPath === "/ready");
  if (sup.shuttingDown && !drainExempt) {
    res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
    return;
  }
  sup.activeRequests += 1;
  let done = false;
  const dec = () => {
    if (done) return;
    done = true;
    sup.activeRequests -= 1;
  };
  res.on("close", dec);
  res.on("finish", dec);
  next();
});

// Intake owns its own tiny JSON parser and its byte PUT stays a raw backpressured
// stream. Mount it before the global JSON parser so no middleware can consume it.
app.use(intakeRoutes());

app.use(express.json({ limit: "1mb" }));

// Liveness — is the process up? No dependencies.
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "clara-runtime", pid: process.pid, ts: new Date().toISOString() });
});

// Readiness — should we receive traffic? FAILS (503) on DB unreachable, world dead,
// control listener dead, taxonomy HALT, cold/unknown storage, or the second consecutive
// warm-state storage-write failure. Hard failures are failures[]; relay lag / dead-letters /
// backlog stay warnings[]. Bounded + sanitized.
app.get("/ready", readinessHandler);

// The registered workflows (the versioning hook point; freeze-lint guards bodies).
app.get("/workflows", (_req, res) => {
  res.json({ registered: workflowNames });
});

// Chat: sessions, messages, turns (admission + enqueue), and the SSE stream.
app.use(chatRoutes());
app.use(streamRoutes());
// Durable interview family (Wave B, B-II): firm-bootstrap + client onboarding as durable
// runs. Enqueue/answer/cancel/state; governance verbs stay on the dashboard (PostgREST).
app.use(interviewRoutes());
// Wave-B onboarding document lanes (R2): the opening-targets parse route (bookkeeper+;
// deterministic extraction-surface read -> record_opening_targets_parsed) and the
// prior-GL seeding-prepare route (admin; typed S1 proposals -> create_seeding_batch).
app.use(openingRoutes());
app.use(seedingRoutes());
// Document bytes for the doc_review split-view (PIN-DELTA-4) — human JWT -> definer read ->
// Storage stream with the runtime custody credential; the browser never holds a credential.
app.use(documentRoutes());

export default app;
