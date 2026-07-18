import express from "express";
import { start } from "workflow/api";
import { assertSessionAccess, authenticate, AuthError } from "../lib/authz.mjs";
import {
  bearerCapability,
  beginDocumentIntake,
  finalizeDocumentIntake,
  mapIntakeError,
  uploadDocumentBytes,
} from "../lib/intake.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { workflows } from "../workflows/registry.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function origins(): Set<string> {
  return new Set(
    String(process.env.CLARA_INTAKE_CORS_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function sendError(res: express.Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.code, message: err.status === 404 ? "not found" : err.message });
    return;
  }
  const mapped = mapIntakeError(err);
  res.status(mapped.status).json({ error: mapped.code, message: mapped.status === 404 ? "not found" : mapped.message });
}

function shuttingDown(): boolean {
  return Boolean(
    (globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor?.shuttingDown,
  );
}

export function intakeRoutes(): express.Router {
  const router = express.Router();

  // This middleware is mounted only on /api/intake. An Origin is either an exact
  // allowlist member or receives no cross-origin authority at all.
  router.use("/api/intake", (req, res, next) => {
    const origin = req.header("origin");
    if (origin) {
      if (!origins().has(origin)) {
        res.status(403).json({ error: "cors_forbidden" });
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Router-scoped JSON parsing leaves application/octet-stream untouched. The
  // router itself is mounted before the application's global 1MB JSON parser.
  router.use("/api/intake", express.json({ limit: "32kb" }));

  router.post("/api/intake/documents", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down" });
      return;
    }
    try {
      const out = await withRuntime(async (client) => {
        const principal = await authenticate(client, req.header("authorization"));
        if (req.body?.origin === "chat") await assertSessionAccess(client, req.body?.session_id, principal);
        return beginDocumentIntake(client, principal, req.body ?? {});
      });
      res.status(201).json(out);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put("/api/intake/documents/:id/bytes", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down" });
      return;
    }
    const intakeId = req.params.id;
    if (typeof intakeId !== "string" || !UUID_RE.test(intakeId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    if (String(req.header("content-type") || "").toLowerCase().replace(/;.*/, "").trim() !== "application/octet-stream") {
      res.status(415).json({ error: "bad_type", message: "content-type must be application/octet-stream" });
      return;
    }
    try {
      const token = bearerCapability(req.header("authorization"));
      await uploadDocumentBytes({ withRuntime, intakeId, token, readable: req });
      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/api/intake/documents/:id/finalize", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down" });
      return;
    }
    const intakeId = req.params.id;
    if (typeof intakeId !== "string" || !UUID_RE.test(intakeId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    try {
      const token = bearerCapability(req.header("authorization"));
      const out = await finalizeDocumentIntake({
        withRuntime,
        intakeId,
        token,
        enqueue: (taskId: string) => start(workflows.documentIngest, [{ task_id: taskId }]),
      });
      res.status(202).json(out);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
