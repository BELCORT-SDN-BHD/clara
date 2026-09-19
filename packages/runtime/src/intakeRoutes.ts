import { randomUUID } from "node:crypto";
import express from "express";
import { start } from "workflow/api";
import { assertSessionAccess, authenticate, AuthError } from "../lib/authz.mjs";
import {
  bearerCapability,
  beginDocumentIntake,
  finalizeDocumentIntake,
  isTypedIntakeError,
  mapIntakeError,
  uploadDocumentBytes,
} from "../lib/intake.mjs";
import { removeIntakeSpool } from "../lib/spool.mjs";
// #636 — the intake-batch lane. Every line of batch logic lives in this NEW, non-frozen module:
// `lib/intake.mjs` is one manifest line from freezing (five real reverse importers, none frozen
// today), so logic written inside it would become unamendable the day one of them is frozen.
import {
  beginIntakeInBatch, cancelBatch as cancelIntakeBatch, openBatch as openIntakeBatch,
  recordCapacityWait,
} from "../lib/intake-batches.mjs";
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

function clientErrorStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const candidate = err as { status?: unknown; statusCode?: unknown };
  for (const value of [candidate.status, candidate.statusCode]) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 400 && value < 500) return value;
  }
  return null;
}

function sendSanitizedClientError(res: express.Response, status: number): void {
  const payload = status === 413
    ? { error: "payload_too_large", message: "payload too large" }
    : { error: "bad_request", message: "bad request" };
  res.status(status).json(payload);
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
    // #636: an OPTIONAL batch id. When present the begin and the attach commit TOGETHER (the
    // helper opens an explicit transaction, because withRuntime is autocommit); when absent this
    // path is byte-unchanged.
    const batchId = typeof req.body?.batch_id === "string" ? req.body.batch_id : null;
    if (batchId !== null && !UUID_RE.test(batchId)) {
      res.status(400).json({ error: "bad_request", message: "batch_id must be a uuid" });
      return;
    }
    try {
      const out = await withRuntime(async (client) => {
        const principal = await authenticate(client, req.header("authorization"));
        if (req.body?.origin === "chat") await assertSessionAccess(client, req.body?.session_id, principal);
        if (batchId === null) return beginDocumentIntake(client, principal, req.body ?? {});
        return beginIntakeInBatch({
          client,
          principal,
          input: req.body ?? {},
          batchId,
          opKey: `intake-batch-attach:${batchId}:${randomUUID()}`,
          begin: beginDocumentIntake,
          cleanup: removeIntakeSpool,
        });
      });
      res.status(201).json(out);
    } catch (err) {
      sendError(res, err);
    }
  });

  // #636: open a durable intake batch. The governed door is clara_runtime-only and takes its
  // actor as an ARGUMENT, so the JWT is decoded here and the human is passed on — the
  // create_document_intake precedent (0007:2780-2799), and the reason there is no PostgREST verb.
  router.post("/api/intake/batches", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down" });
      return;
    }
    try {
      const out = await withRuntime(async (client) => {
        const principal = await authenticate(client, req.header("authorization"));
        if (req.body?.origin === "chat") await assertSessionAccess(client, req.body?.session_id, principal);
        return openIntakeBatch(client, {
          actor: principal.sub,
          origin: typeof req.body?.origin === "string" ? req.body.origin : "documents_tab",
          label: typeof req.body?.label === "string" ? req.body.label : "",
          sessionId: typeof req.body?.session_id === "string" ? req.body.session_id : null,
          opKey: typeof req.body?.opKey === "string" ? req.body.opKey : "",
        });
      });
      if (out.status !== "ok") {
        sendError(res, Object.assign(new Error(out.message ?? "batch refused"), {
          code: out.code, detail: JSON.stringify(out.detail ?? {}),
        }));
        return;
      }
      res.status(201).json(out.batch);
    } catch (err) {
      sendError(res, err);
    }
  });

  // #636: stop a batch. ONE confirm performs exactly ONE governed decision; the FAN-OUT is the
  // server's, one clara.cancel_accounting_work per live child, one call per transaction — never N
  // calls from the browser (DocumentsDoorDialog.tsx:8-9's house rule).
  router.post("/api/intake/batches/:id/cancel", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down" });
      return;
    }
    const batchId = req.params.id;
    if (typeof batchId !== "string" || !UUID_RE.test(batchId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    try {
      const principal = await withRuntime((client) => authenticate(client, req.header("authorization")));
      const out = await cancelIntakeBatch(withRuntime, {
        actor: principal.sub,
        batchId,
        opKey: typeof req.body?.opKey === "string" ? req.body.opKey : "",
      });
      if (out.status !== "ok") {
        sendError(res, Object.assign(new Error(out.message ?? "cancellation refused"), {
          code: out.code, detail: JSON.stringify(out.detail ?? {}),
        }));
        return;
      }
      // NO OBJECT SPREAD: `check-parts-parity.mjs` refuses one anywhere in this file. Every field
      // of the decision is named, which also documents the wire shape the browser reads.
      const decision = out.decision ?? {};
      res.status(202).json({
        batch_id: decision.batch_id ?? batchId,
        state: decision.state ?? null,
        cancel_op_key: decision.cancel_op_key ?? null,
        cancel_requested_by: decision.cancel_requested_by ?? null,
        children: decision.children ?? [],
        replayed: decision.replayed ?? false,
        fanned_out: (out.cancelled ?? []).length,
        deferred: (out.deferred ?? []).length,
        refused: (out.refused ?? []).length,
      });
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
    const token = bearerCapability(req.header("authorization"));
    try {
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
    const token = bearerCapability(req.header("authorization"));
    try {
      const out = await finalizeDocumentIntake({
        withRuntime,
        intakeId,
        token,
        enqueue: (taskId: string) => start(workflows.documentIngest, [{ task_id: taskId }]),
      });
      res.status(202).json(out);
    } catch (err) {
      // #636: a CAPACITY refusal after custody is a WAITING state, not a death. The DB's own
      // CLR18 becomes an explicit `awaiting_capacity` dependency on this intake's batch member,
      // reached through the governed door with the actor read off the upload sidecar (this route
      // carries a capability token and no principal). Best-effort and self-swallowing: it must
      // never turn the honest 429 below into a 500.
      await recordCapacityWait(withRuntime, intakeId, err, { log: (m: string) => console.error(m) });
      sendError(res, err);
    }
  });

  // Express 5 forwards parser errors and async throw/rejections to the next
  // four-argument error middleware. Keep bearerCapability() outside each local
  // catch so its typed IntakeError reaches the existing 404 mapping. Preserve
  // typed auth/intake errors first; parser-produced 4xx status/statusCode values
  // then keep their caller-fault status but receive only sanitized JSON. Unknown
  // errors still use the intake mapping below.
  router.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    if (err instanceof AuthError || isTypedIntakeError(err)) {
      sendError(res, err);
      return;
    }
    const status = clientErrorStatus(err);
    if (status !== null) {
      sendSanitizedClientError(res, status);
      return;
    }
    sendError(res, err);
  });

  return router;
}
