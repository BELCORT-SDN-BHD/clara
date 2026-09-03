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

/**
 * FS-4 C-5 item 12 — THE TURN ROUTE'S COMPLETE REFUSAL MAP, censused rather than guessed.
 *
 * THE DEFECT (found by the chat-parity lane on PR #508). This route mapped CLR14, CLR13, 23505,
 * CLR11 and CLR04 and nothing else, so a six-attachment turn or a malformed `parts` array
 * reached the caller as a bare `{"error":"internal"}` 500 — an operator-visible incident for
 * what is an ordinary client mistake, and a client with no way to tell "fix your request" from
 * "the server is broken".
 *
 * THE CENSUS IS OF THE LIVE CATALOG, NOT OF MIGRATION TEXT, AND IT INCLUDES THE TRIGGERS. A
 * prosrc call-graph walk over `clara.begin_chat_turn` finds NO called clara function — it names
 * only `agent_tasks` and `chat_messages` — which would have made this look like a five-code
 * surface. The refusals that actually bite live in the TRIGGERS on those two relations, which no
 * call-graph walk can see. Measured on a 0161 rig, the reachable set is:
 *
 *   CLR04  begin_chat_turn — author is not a live active member of the session firm
 *   CLR08  _tf_append_only / _tf_no_truncate / _tf_agent_task_update — immutability refusals
 *   CLR10  begin_chat_turn (turn_key required) · _tf_agent_task_insert (11 shape refusals) ·
 *          _tf_chat_message_insert (3) · _tf_validate_chat_attachments (parts not an array;
 *          "a chat turn may contain at most five attachments")  ← the reported defect
 *   CLR11  begin_chat_turn (unknown session / session not found) ·
 *          _tf_validate_chat_attachments (attachment is not an adopted intake for this author
 *          and firm; attachment admission context is invalid)
 *   CLR13  begin_chat_turn (a turn is already live) · _tf_agent_task_update (illegal transition)
 *   CLR14  begin_chat_turn (concurrent compute-run cap)
 *
 * plus PostgreSQL's own `23505` on a unique violation. `tests/c5-chat-clr-census-db.test.mjs`
 * re-runs that census against the live catalog and fails if any reachable code is missing from
 * the map below — so a future migration that adds a code cannot slip through as a 500.
 *
 * NO CATCH-ALL, AND CLR08 IS MAPPED HONESTLY. CLR08 is raised only by UPDATE/DELETE/TRUNCATE
 * triggers, and this route's admission path only INSERTs, so it is NOT reachable here today.
 * It is mapped anyway, to 409, as a fail-safe for a future writer — and this sentence is the
 * whole of the claim: the mapping exists, the reachability does not (裁-112).
 *
 * Exported so a cell drives THIS function rather than a copy of its predicate (裁-107).
 */
export function turnErrorStatus(code: string | undefined): number | null {
  switch (code) {
    case "CLR14":
      return 429; // the concurrent compute-run floor
    case "CLR13":
    case "23505":
    case "CLR08":
      return 409; // a live turn, a duplicate key, or an immutability refusal
    case "CLR11":
      return 404; // unknown / foreign-private session, or an attachment that is not the author's
    case "CLR04":
      return 403;
    case "CLR10":
      return 400; // a malformed request: no turn_key, bad parts shape, >5 attachments
    default:
      return null;
  }
}

/** Every CLR code `turnErrorStatus` claims to map. The census cell compares this with the live
 *  catalog's reachable set in BOTH directions — a code here that nothing raises is as much a lie
 *  as a raised code that is missing. */
export const TURN_MAPPED_CODES = Object.freeze(["CLR04", "CLR08", "CLR10", "CLR11", "CLR13", "CLR14", "23505"]);

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
      const status = turnErrorStatus(code);
      if (status === 429) {
        res.status(429).json(turnLimitPayload((err as Error).message));
        return;
      }
      if (status === 409) {
        res.status(409).json({ error: "conflict", message: "this session already has a turn in progress" });
        return;
      }
      if (status === 404) {
        // unknown / foreign-private session, or an attachment that is not this author's
        // adopted intake — indistinguishable not-found either way (§3.2's masked-view law).
        res.status(404).json({ error: "not_found", message: "not found" });
        return;
      }
      if (status === 403) {
        res.status(403).json({ error: "forbidden", message: "not permitted" });
        return;
      }
      if (status === 400) {
        // CLR10 — the request itself is wrong (no turn_key, a bad parts shape, more than five
        // attachments). The DOOR'S OWN MESSAGE is surfaced: it already names the live limit
        // ("a chat turn may contain at most five attachments") and it is not an existence
        // oracle — every CLR10 in the censused set describes the caller's own payload, never
        // whether some other tenant's object exists. Still logged, because a client sending
        // malformed turns is worth seeing.
        console.error("[clara-runtime] turn refused (CLR10):", (err as Error)?.message ?? err);
        res.status(400).json({ error: "bad_request", message: (err as Error)?.message ?? "bad request" });
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
