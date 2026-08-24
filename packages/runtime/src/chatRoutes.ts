// Chat session + turn routes (Slice 4, contract §4.2). The trusted-ingress
// boundary: every route resolves the principal through lib/authz (JWT → live
// membership) before any DB work, applies the session visibility predicate, and
// maps the admission function's structured errors to HTTP. Governance never
// transits here (the dashboard talks to PostgREST as clara_authenticated).
//
// Admission is clara.begin_chat_turn (one atomic transaction — advisory lock,
// turn_key replay, the compute-run cap, user-message + task insert; the daily
// token budget was removed at F-A9 PR-0, see turnLimitPayload below). AFTER it
// commits we enqueue the durable run and bind its id onto the task (the S4-V1
// run-listing dedupe: the reconciler re-enqueues only unbound queued tasks).

import express from "express";
import { start } from "workflow/api";
import { authenticate, assertSessionAccess, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { workflows } from "../workflows/registry.js";

const DEFAULT_MODEL = process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";

/** The 429 payload for a CLR14 admission refusal.
 *
 *  SINCE F-A9 PR-0 THERE IS EXACTLY ONE SUCH REFUSAL: the concurrent compute-run floor
 *  (`max_concurrent_runs` — engine protection, digest law 76's carve-out). The daily token
 *  budget that used to share this SQLSTATE was removed by owner ruling (TA-P12 = A, the
 *  2026-08-22 Track-A sitting; "meter, never cap").
 *
 *  SO THE RESET PAIR IS GONE, AND BOTH HALVES GO TOGETHER. This route used to emit a
 *  `reset_copy` sentence naming a firm-wide spend reset at the UTC/MYT day boundary, and a
 *  `reset_utc` of the next UTC midnight. (The retired sentence is deliberately not repeated
 *  here: it would survive into the shipped bundle as a comment and answer a future
 *  substring sweep for it.) A concurrency floor has no reset instant — a slot frees
 *  when a run finishes, not at midnight — so keeping either half would have the dashboard
 *  render a confident, precise, wrong sentence on top of a correct one (law 22: a visible
 *  record must not lie). Rewording the copy while still shipping the timestamp would have
 *  been the worse half-fix, which is why they are decided as one unit here.
 *
 *  THE KEYS STAY, NULLED, rather than vanishing: `apps/dashboard/app/chat/api.ts`'s `postTurn`
 *  429 branch maps them onto its `limit` TurnResult and `page.tsx` renders them through
 *  `limitBanner`, both already `string | null`, so nulling is the
 *  change the whole three-hop chain already handles — and the null keeps saying, explicitly,
 *  "there is no reset for this refusal" instead of leaving a reader to infer it from a
 *  missing field. `message` is the DB's own text, which already names the live numbers
 *  ("concurrent compute-run cap reached for firm (3 of 3 running)").
 *
 *  Exported so the battery can read the produced payload without standing up a server —
 *  the `documentRouteStatus` precedent in `documentRoutes.ts`. */
export function turnLimitPayload(message: string | undefined): {
  error: "limit";
  message: string;
  reset_copy: null;
  reset_utc: null;
} {
  return {
    error: "limit",
    message: message && message.length > 0 ? message : "concurrent run limit reached",
    reset_copy: null,
    reset_utc: null,
  };
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

  // Create a session — ALWAYS private (ruling 9 / S4-AB10). Sharing is a separate,
  // audited, AUTHOR-ONLY act via clara.share_chat_session (dashboard → PostgREST);
  // the runtime ingress never accepts a visibility field.
  router.post("/api/chat/sessions", async (req, res) => {
    const body = (req.body ?? {}) as { title?: string; clientId?: string };
    try {
      const out = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        // clara_runtime holds INSERT on chat_sessions; the BEFORE trigger derives
        // firm_id from the author's active membership and validates the client.
        // visibility defaults to 'private' in the schema — we never pass 'firm'.
        const r = await c.query(
          `insert into clara.chat_sessions (created_by, client_id, title)
             values ($1, $2, $3) returning id`,
          [p.sub, body.clientId ?? null, body.title ?? null],
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
    // Stop intake during graceful shutdown (S4-AB7d) — the durable engine is intact,
    // so the client simply retries against a live machine.
    const sup = (globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor;
    if (sup?.shuttingDown) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
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
        // Only kick off a run when the task is fresh (queued + unbound). The WORKFLOW
        // self-binds (S4-AB3 claimRunStep), so we never bind here; a turn_key replay of
        // an already-started task is skipped.
        const st = await c.query("select status, workflow_run_id from clara.agent_tasks where id = $1", [receipt.task_id]);
        const row = st.rows[0];
        return { taskId: receipt.task_id, needsStart: row?.status === "queued" && row?.workflow_run_id == null };
      });
      taskId = admitted.taskId;

      if (admitted.needsStart) {
        // Post-commit enqueue (best-effort — the reconciler re-enqueues an unbound
        // queued task, so a failure here is recoverable, never a lost turn). The
        // workflow's first step CAS-binds itself; duplicate starts self-abort.
        try {
          await start(workflows.chatTurn, [{ taskId }]);
        } catch (err) {
          console.error("[clara-runtime] enqueue failed (reconciler will re-enqueue):", (err as Error)?.message ?? err);
        }
      }
    } catch (err) {
      if (sendAuthError(res, err)) return;
      const code = (err as { code?: string })?.code;
      if (code === "CLR14") {
        res.status(429).json(turnLimitPayload((err as Error).message));
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
