// The durable interview routes (Wave B, B-II / FORK-8): firm-bootstrap + client
// onboarding as durable WDK runs. These clone chatRoutes' auth + delivery discipline.
//
// PARK/DELIVER — the "typed sibling lane" (see clientOnboarding.v1.ts header): an
// interview cannot own an agent_tasks row (kind is CHECK-locked to chat_turn/wake and
// 0017 does not widen it; chat_turn collides with the reconciler, wake cannot park), so
// open_interruption/agent_interruptions are unavailable. Each park is a pure WDK hook
// with a DETERMINISTIC token (interview.v1.core hookToken over the run id + a monotonic
// park index); the ANSWER/CANCEL routes reconstruct the token from {scope, runId,
// parkIndex} and resumeHook it server-side (resumeHook is never exposed to a client).
//
// Call-lane law: the human-floor verbs (begin/commit/cancel_client_onboarding,
// create_firm, resolve_onboarding_plan_item) are clara_authenticated-only and run on the
// DASHBOARD (PostgREST), NEVER here. This route only: (1) enqueues the durable run via the
// registry, (2) delivers a validated answer into a hook (the answerer uuid rides the hook
// payload → update_onboarding_plan.p_answered_by, which the DB re-validates as an active
// bookkeeper+ — the real boundary), (3) reads plan state. No secret ever transits here
// (P19); the firm admission token stays on the dashboard.

import express from "express";
import { start, getRun, resumeHook } from "workflow/api";
import { authenticate, validateJwt, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { workflows } from "../workflows/registry.js";
import { hookToken, type Resolution } from "../workflows/interview.v1.core.js";

/** Firm role ranks (mirror clara.role_rank) — the bookkeeper+ floor the DB re-validates. */
const RANK: Record<string, number> = { viewer: 0, bookkeeper: 1, admin: 2, owner: 3 };
const BOOKKEEPER_RANK = 1;
const isBookkeeperPlus = (role: string): boolean => (RANK[role] ?? -1) >= BOOKKEEPER_RANK;

/** True iff a thrown error is the engine's single-shot "hook already gone" signal — the
 *  answer was already delivered by a prior attempt (idempotent success). */
function isHookNotFound(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  return !!e && (e.name === "HookNotFoundError" || /hook not found/i.test(String(e?.message || "")));
}

function sendAuthError(res: express.Response, err: unknown): boolean {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.code, message: err.status === 404 ? "not found" : err.message });
    return true;
  }
  return false;
}

function draining(): boolean {
  return !!(globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor?.shuttingDown;
}

export function interviewRoutes(): express.Router {
  const router = express.Router();

  // POST firm start — a PRE-FIRM principal (no membership yet), so validateJwt only.
  router.post("/api/interview/firm/start", async (req, res) => {
    if (draining()) return void res.status(503).json({ error: "shutting_down" });
    try {
      const { sub } = await validateJwt(req.header("authorization"));
      const run = await start(workflows.firmInterview, [{ principalUserId: sub }]);
      res.status(202).json({ run_id: run.runId, scope: "firm" });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      console.error("[clara-runtime] interview firm start:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  });

  // POST client start — the client + plan are already born (dashboard begin_client_onboarding);
  // the caller must be a member of the plan's firm. Enqueue the durable run.
  router.post("/api/interview/client/start", async (req, res) => {
    if (draining()) return void res.status(503).json({ error: "shutting_down" });
    const body = (req.body ?? {}) as { clientId?: string; planId?: string };
    const { clientId, planId } = body;
    if (!clientId || !planId) return void res.status(400).json({ error: "bad_request", message: "clientId and planId are required" });
    try {
      const runId = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query(
          "select firm_id, client_id, state from clara.onboarding_plans where id = $1",
          [planId],
        );
        const plan = r.rows[0] as { firm_id?: string; client_id?: string; state?: string } | undefined;
        if (!plan || plan.firm_id !== p.firmId || plan.client_id !== clientId) {
          throw new AuthError(404, "not_found", "not found"); // indistinguishable (§3.2)
        }
        if (plan.state !== "open") throw new AuthError(409, "conflict", "onboarding plan is not open");
        const run = await start(workflows.clientOnboarding, [{ clientId, planId }]);
        return run.runId;
      });
      res.status(202).json({ run_id: runId, scope: "client" });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      console.error("[clara-runtime] interview client start:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  });

  // POST answer — deliver a validated answer into the park's hook. The answerer uuid
  // rides the payload into update_onboarding_plan.p_answered_by (DB-revalidated). A firm
  // answer is a pre-firm principal (validateJwt only); a client answer requires an active
  // bookkeeper+ member (the floor the DB re-checks).
  router.post("/api/interview/answer", async (req, res) => {
    await deliver(req, res, "answer");
  });

  // POST cancel — deliver a cancel signal to the open hook; the workflow terminates having
  // persisted nothing flawed (for a client the human then runs cancel_client_onboarding).
  router.post("/api/interview/cancel", async (req, res) => {
    await deliver(req, res, "cancel");
  });

  async function deliver(req: express.Request, res: express.Response, mode: "answer" | "cancel"): Promise<void> {
    const body = (req.body ?? {}) as { runId?: string; parkIndex?: number; scope?: string; value?: unknown };
    const scope = body.scope === "firm" ? "firm" : body.scope === "client" ? "client" : null;
    if (!body.runId || scope === null || typeof body.parkIndex !== "number" || !Number.isInteger(body.parkIndex)) {
      return void res.status(400).json({ error: "bad_request", message: "runId, integer parkIndex, and scope are required" });
    }
    try {
      let answeredBy: string;
      if (scope === "firm") {
        // Pre-firm principal — no membership (the firm may not exist yet pre-commit).
        const { sub } = await validateJwt(req.header("authorization"));
        answeredBy = sub;
      } else {
        const p = await withRuntime((c) => authenticate(c, req.header("authorization")));
        if (!isBookkeeperPlus(p.role)) throw new AuthError(403, "forbidden", "a bookkeeper or above must answer");
        answeredBy = p.sub;
      }
      const token = hookToken(scope, body.runId, body.parkIndex);
      const payload: Resolution =
        mode === "cancel" ? { kind: "cancelled" } : { kind: "answer", value: body.value ?? null, answeredBy };
      try {
        await resumeHook(token, payload);
      } catch (err) {
        if (isHookNotFound(err)) return void res.status(409).json({ error: "not_pending", message: "no open question at that park index (already answered or resumed)" });
        throw err;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      console.error(`[clara-runtime] interview ${mode}:`, (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  }

  // GET state — the plan (client) + the run status + a best-effort current prompt. Reads
  // ride the authz read lane; a foreign plan is an indistinguishable 404.
  router.get("/api/interview/state", async (req, res) => {
    const runId = typeof req.query.runId === "string" ? req.query.runId : "";
    const scope = req.query.scope === "firm" ? "firm" : "client";
    const planId = typeof req.query.planId === "string" ? req.query.planId : null;
    try {
      let plan: Record<string, unknown> | null = null;
      let items: Array<Record<string, unknown>> = [];
      if (scope === "firm") {
        await validateJwt(req.header("authorization"));
      } else {
        await withRuntime(async (c) => {
          const p = await authenticate(c, req.header("authorization"));
          if (!planId) throw new AuthError(400, "bad_request", "planId is required for a client interview");
          const r = await c.query(
            "select id, firm_id, client_id, state, revision_token, revision_n from clara.onboarding_plans where id = $1",
            [planId],
          );
          const row = r.rows[0] as { firm_id?: string } | undefined;
          if (!row || row.firm_id !== p.firmId) throw new AuthError(404, "not_found", "not found");
          plan = r.rows[0]!;
          const it = await c.query(
            "select item_key, item_kind, state, required_for_commit, question, answer from clara.onboarding_plan_items where plan_id = $1 order by created_at",
            [planId],
          );
          items = it.rows;
        });
      }
      const currentPrompt = runId ? await readCurrentPrompt(runId) : null;
      const status = runId ? await runStatus(runId) : null;
      res.json({ run_id: runId || null, scope, status, plan, items, current_prompt: currentPrompt });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      console.error("[clara-runtime] interview state:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
}

/** The run's engine status (a parked run reports 'running'; S4-P1a). Best-effort. */
async function runStatus(runId: string): Promise<string | null> {
  try {
    return await getRun(runId).status;
  } catch {
    return null;
  }
}

/** Best-effort snapshot of the latest streamed interview prompt/terminal from the run's
 *  persisted readable (bounded — the buffered chunks replay fast; we cap the wait). */
async function readCurrentPrompt(runId: string): Promise<Record<string, unknown> | null> {
  type Reader = { read(): Promise<{ done: boolean; value: unknown }>; cancel(): Promise<unknown> };
  let reader: Reader | null = null;
  try {
    reader = getRun(runId).getReadable({ startIndex: 0 }).getReader() as unknown as Reader;
  } catch {
    return null;
  }
  const deadline = Date.now() + 800;
  let latest: Record<string, unknown> | null = null;
  try {
    while (Date.now() < deadline) {
      const winner = await Promise.race([
        reader.read(),
        new Promise<"t">((r) => setTimeout(() => r("t"), Math.max(20, deadline - Date.now()))),
      ]);
      if (winner === "t") break;
      if ((winner as { done: boolean }).done) break;
      const v = (winner as { value: unknown }).value as Record<string, unknown> | null;
      if (v && (v.type === "interview_prompt" || v.type === "interview_terminal")) latest = v;
    }
  } catch {
    /* transient — return whatever we have */
  } finally {
    await reader.cancel().catch(() => {});
  }
  return latest;
}
