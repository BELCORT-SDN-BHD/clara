// Chat session + turn routes (Slice 4, contract §4.2). The trusted-ingress
// boundary: every route resolves the principal through lib/authz (JWT → live
// membership) before any DB work, applies the session visibility predicate, and
// maps the admission function's structured errors to HTTP. Governance never
// transits here (the dashboard talks to PostgREST as clara_authenticated).
//
// Admission is clara.begin_chat_turn (one atomic transaction — advisory lock,
// turn_key replay, budget + compute-cap, user-message + task insert). AFTER it
// commits we enqueue the durable run and bind its id onto the task (the S4-V1
// run-listing dedupe: the reconciler re-enqueues only unbound queued tasks).

import express from "express";
import { start } from "workflow/api";
import { authenticate, assertSessionAccess, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { bindChatRun } from "../lib/reconciler.mjs";
import { workflows } from "../workflows/registry.js";

const DEFAULT_MODEL = process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";

/** Next UTC midnight — the budget day boundary (08:00 MYT), for CLR14 copy. */
function nextUtcResetIso(): string {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return reset.toISOString();
}

function sendAuthError(res: express.Response, err: unknown): boolean {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.code, message: err.status === 404 ? "not found" : err.message });
    return true;
  }
  return false;
}

export function chatRoutes(): express.Router {
  const router = express.Router();

  // Create a session (private by default; author = the JWT sub).
  router.post("/api/chat/sessions", async (req, res) => {
    const body = (req.body ?? {}) as { title?: string; clientId?: string; visibility?: string };
    try {
      const out = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        // clara_runtime holds INSERT on chat_sessions; the BEFORE trigger derives
        // firm_id from the author's active membership and validates the client.
        const r = await c.query(
          `insert into clara.chat_sessions (created_by, client_id, visibility, title)
             values ($1, $2, $3, $4) returning id`,
          [p.sub, body.clientId ?? null, body.visibility === "firm" ? "firm" : "private", body.title ?? null],
        );
        return r.rows[0].id as string;
      });
      res.status(201).json({ session_id: out });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      res.status(500).json({ error: "internal" });
    }
  });

  // List the caller's visible sessions (own + firm-shared).
  router.get("/api/chat/sessions", async (req, res) => {
    try {
      const rows = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query(
          `select id, title, client_id, visibility, created_by, created_at
             from clara.chat_sessions
            where firm_id = $1 and (visibility = 'firm' or created_by = $2)
            order by created_at desc limit 200`,
          [p.firmId, p.sub],
        );
        return r.rows;
      });
      res.json({ sessions: rows });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      res.status(500).json({ error: "internal" });
    }
  });

  // Messages of a session (typed parts) — session access enforced, 404 indistinguishable.
  router.get("/api/chat/sessions/:id/messages", async (req, res) => {
    try {
      const rows = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        await assertSessionAccess(c, req.params.id, p);
        const r = await c.query(
          "select id, role, parts, turn_key, task_id, seq, created_at from clara.chat_messages where session_id = $1 order by seq",
          [req.params.id],
        );
        return r.rows;
      });
      res.json({ messages: rows });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      res.status(500).json({ error: "internal" });
    }
  });

  // Post a turn: admit (begin_chat_turn), then enqueue + bind, then 202 {task_id}.
  router.post("/api/chat/:sessionId/turns", async (req, res) => {
    const body = (req.body ?? {}) as { turnKey?: string; parts?: unknown };
    if (typeof body.turnKey !== "string" || body.turnKey.length === 0) {
      res.status(400).json({ error: "turn_key_required", message: "a turnKey is required (idempotency key)" });
      return;
    }
    const userParts = Array.isArray(body.parts) ? body.parts : [{ type: "text", text: String((body as { text?: string }).text ?? "") }];

    let taskId: string;
    try {
      const admitted = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        await assertSessionAccess(c, req.params.sessionId, p);
        const r = await c.query("select clara.begin_chat_turn($1, $2, $3, $4::jsonb, $5) as receipt", [
          req.params.sessionId,
          p.sub,
          body.turnKey,
          JSON.stringify(userParts),
          DEFAULT_MODEL,
        ]);
        const receipt = r.rows[0].receipt as { task_id: string };
        // Read the current binding so a turn_key replay does not double-enqueue.
        const bound = await c.query("select workflow_run_id from clara.agent_tasks where id = $1", [receipt.task_id]);
        return { taskId: receipt.task_id, alreadyBound: bound.rows[0]?.workflow_run_id != null };
      });
      taskId = admitted.taskId;

      if (!admitted.alreadyBound) {
        // Post-commit enqueue + bind (best-effort — the reconciler re-enqueues an
        // unbound queued task, so a failure here is recoverable, never a lost turn).
        try {
          const run = await start(workflows.chatTurn, [{ taskId }]);
          await withRuntime((c) => bindChatRun(c, taskId, run.runId));
        } catch (err) {
          console.error("[clara-runtime] enqueue failed (reconciler will re-enqueue):", (err as Error)?.message ?? err);
        }
      }
    } catch (err) {
      if (sendAuthError(res, err)) return;
      const code = (err as { code?: string })?.code;
      if (code === "CLR14") {
        res.status(429).json({
          error: "limit",
          message: (err as Error).message || "usage limit reached",
          reset_utc: nextUtcResetIso(),
          reset_copy: "Your firm's daily budget resets at 00:00 UTC (08:00 Malaysia time).",
        });
        return;
      }
      if (code === "CLR13" || code === "23505") {
        res.status(409).json({ error: "conflict", message: "this session already has a turn in progress" });
        return;
      }
      if (code === "CLR11") {
        // unknown / foreign-private session — indistinguishable not-found.
        res.status(404).json({ error: "not_found", message: "not found" });
        return;
      }
      if (code === "CLR04") {
        res.status(403).json({ error: "forbidden", message: "not permitted" });
        return;
      }
      console.error("[clara-runtime] turn error:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
      return;
    }
    res.status(202).json({ task_id: taskId });
  });

  return router;
}
