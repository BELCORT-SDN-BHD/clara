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
// runId is NOT a bearer capability (F1). Before ANY resume/read the route BINDS the run to
// the caller: a client run binds to its plan's durable 'interview_run' item (answer.run_id
// must equal the supplied runId, and the plan must be in the caller's firm); a firm run
// binds to the pre-firm principal recorded in its FIRST streamed {type:'interview_owner'}
// marker (principalUserId must equal the caller's sub). A binding mismatch is an
// indistinguishable 404 — a bookkeeper of firm B can neither consume nor read firm A's run.
//
// Replay note: a client retry that receives 409 not_pending should treat the park as
// already-delivered and refresh via GET /state (the park index advanced under it).
//
// Call-lane law: the human-floor verbs (begin/commit/cancel_client_onboarding,
// create_firm, resolve_onboarding_plan_item) are clara_authenticated-only and run on the
// DASHBOARD (PostgREST), NEVER here. This route only: (1) enqueues the durable run via the
// registry, (2) delivers a validated answer into a hook (the answerer uuid rides the hook
// payload → update_onboarding_plan.p_answered_by, which the DB re-validates as an active
// bookkeeper+ — the real boundary), (3) reads plan state. No secret ever transits here
// (P19); a firm commit receipt is rebuilt to a bare {firmId, planId} so the admission token
// (or any extra field) can never enter the hook payload or run history.

import express from "express";
import { start, getRun, resumeHook } from "workflow/api";
import { authenticate, validateJwt, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { workflows } from "../workflows/registry.js";
import { hookToken, firmOwnerMatches, interviewRunBinding, type Resolution, type OwnerMarker } from "../workflows/interview.v1.core.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The max serialized size of a delivered answer value (F7) — nothing larger reaches a hook. */
const MAX_ANSWER_BYTES = 8 * 1024;

/** Firm role ranks (mirror clara.role_rank) — the bookkeeper+ floor the DB re-validates. */
const RANK: Record<string, number> = { viewer: 0, bookkeeper: 1, admin: 2, owner: 3 };
const BOOKKEEPER_RANK = 1;
const isBookkeeperPlus = (role: string): boolean => (RANK[role] ?? -1) >= BOOKKEEPER_RANK;

/** Rebuild a firm commit answer into a BARE {firmId, planId} receipt (F7/F8). Accepts BOTH the
 *  create_firm snake shape ({firm_id, plan_id} — migration 0017 returns snake) AND the camel
 *  shape; validates each as a uuid. EVERY other field (e.g. an admission_token) is dropped — only
 *  these two keys are ever forwarded to the hook. A malformed receipt is a 400 (never delivered). */
export function buildFirmReceipt(value: unknown): { firmId: string; planId: string } {
  const v = (value ?? {}) as Record<string, unknown>;
  const firmId = (v.firmId ?? v.firm_id) as unknown;
  const planId = (v.planId ?? v.plan_id) as unknown;
  if (typeof firmId !== "string" || !UUID_RE.test(firmId) || typeof planId !== "string" || !UUID_RE.test(planId)) {
    throw new AuthError(400, "bad_receipt", "a create_firm receipt requires firmId and planId (uuid)");
  }
  return { firmId, planId };
}

/** Guard a NON-receipt answer value (F7): it must be a JSON-serializable primitive or plain
 *  object/array and serialize to ≤ 8KB. Anything else (a class instance, a function/symbol, an
 *  oversized blob) is a 400 — nothing else reaches resumeHook. */
export function validateAnswerValue(value: unknown): void {
  const t = typeof value;
  const isPrimitive = value === null || t === "string" || t === "boolean" || (t === "number" && Number.isFinite(value as number));
  const proto = t === "object" && value !== null ? Object.getPrototypeOf(value) : undefined;
  const isPlain = t === "object" && value !== null && (Array.isArray(value) || proto === Object.prototype || proto === null);
  if (!isPrimitive && !isPlain) {
    throw new AuthError(400, "bad_value", "answer must be a JSON primitive or plain object");
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new AuthError(400, "bad_value", "answer is not JSON-serializable");
  }
  if (serialized === undefined) throw new AuthError(400, "bad_value", "answer is not JSON-serializable");
  if (Buffer.byteLength(serialized, "utf8") > MAX_ANSWER_BYTES) throw new AuthError(400, "bad_value", "answer exceeds the 8KB limit");
}

/** True iff a streamed prompt chunk is the firm commit park (its delivered answer must be
 *  rebuilt into a create_firm receipt, not passed through). */
export function promptExpectsFirmReceipt(prompt: Record<string, unknown> | null | undefined): boolean {
  return !!prompt && prompt.expects === "create_firm_receipt";
}

/** One sanitized confirmed-answer row in /state's activity[] (folded from interview_activity
 *  chunks). `echo` is the validator's human echo — never a raw submission, never a secret. */
export type ActivityItem = { kind: "answered"; seg: unknown; phase: unknown; echo: unknown; at?: unknown };

export type RunMarkers = {
  owner: OwnerMarker | null;
  prompt: Record<string, unknown> | null;
  terminal: Record<string, unknown> | null;
  latest: Record<string, unknown> | null;
  /** Confirmed-answer echoes in stream order (the firm-scope /state activity[] surface). */
  activity: ActivityItem[];
  /** True once the LATEST prompt has been consumed — a terminal ended the run, or an
   *  interview_activity chunk followed it (its segment was confirmed and the run moved on). While
   *  false, the latest prompt is the OPEN park; the /state pending_park is null once true. */
  promptConsumed: boolean;
};

/** Fold a run's streamed chunks into the binding/current markers (pure — the stream read is
 *  separate). `owner` is the FIRST interview_owner chunk (the binding); `prompt`/`terminal` are
 *  the LATEST of each; `latest` is the most recent prompt-or-terminal (what /state renders);
 *  `activity` collects the confirmed-answer echoes in order; `promptConsumed` tracks whether the
 *  latest prompt is still open (a fresh prompt re-opens it; an activity/terminal after it closes it). */
export function reduceRunMarkers(chunks: ReadonlyArray<Record<string, unknown> | null | undefined>): RunMarkers {
  let owner: OwnerMarker | null = null;
  let prompt: Record<string, unknown> | null = null;
  let terminal: Record<string, unknown> | null = null;
  let latest: Record<string, unknown> | null = null;
  const activity: ActivityItem[] = [];
  let promptConsumed = false;
  for (const c of chunks) {
    if (!c || typeof c !== "object") continue;
    if (c.type === "interview_owner") {
      if (owner === null) owner = c as OwnerMarker;
    } else if (c.type === "interview_prompt") {
      prompt = c;
      latest = c;
      promptConsumed = false; // a newly-streamed park re-opens the pending question
    } else if (c.type === "interview_terminal") {
      terminal = c;
      latest = c;
      promptConsumed = true; // the run ended — no open park
    } else if (c.type === "interview_activity") {
      const item: ActivityItem = { kind: "answered", seg: c.seg, phase: c.phase, echo: c.echo };
      if (c.at !== undefined) item.at = c.at;
      activity.push(item);
      promptConsumed = true; // a segment was confirmed after the latest prompt — that park is spent
    }
  }
  return { owner, prompt, terminal, latest, activity, promptConsumed };
}

/** The §3.1 pending_park projection of the latest prompt chunk (the typed fields the dashboard
 *  renders; op_key/expects ride only when present). Null when there is no prompt. */
export function toPendingPark(prompt: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!prompt) return null;
  const pp: Record<string, unknown> = { parkIndex: prompt.parkIndex, seg: prompt.seg, phase: prompt.phase, question: prompt.question };
  if (prompt.expects !== undefined) pp.expects = prompt.expects;
  if (prompt.op_key !== undefined) pp.op_key = prompt.op_key;
  return pp;
}

/** The §3.1 terminal projection — the terminal chunk minus its stream `type` tag ({outcome, …}).
 *  The workflow never puts a secret/receipt token in a terminal (firmId/planId are navigable ids,
 *  not secrets), so this is a straight pass-through. Null when the run has not terminated. */
export function toTerminal(terminal: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!terminal) return null;
  const rest: Record<string, unknown> = { ...terminal };
  delete rest.type;
  return rest;
}

/** Map the WDK engine run status (+ the streamed terminal marker) to the §3.1 status enum
 *  'running'|'complete'|'cancelled'|'unknown'. The terminal marker is authoritative for our
 *  workflows (a cancel/expire returns normally, so the engine alone cannot distinguish it). */
export function normalizeStatus(engineStatus: string | null | undefined, terminal: Record<string, unknown> | null | undefined): "running" | "complete" | "cancelled" | "unknown" {
  if (terminal) {
    const o = terminal.outcome;
    return o === "cancelled" || o === "expired" ? "cancelled" : "complete";
  }
  if (engineStatus === "running") return "running";
  if (engineStatus === "complete" || engineStatus === "completed") return "complete";
  if (engineStatus === "cancelled") return "cancelled";
  return "unknown";
}

/** Build the §3.1 /state v2 body from a run's folded markers + the plan read. pending_park is the
 *  latest UN-consumed prompt (null once answered/terminal); activity[] folds from the stream for a
 *  firm run (a firm owns no plan mid-interview) and is [] for a client run (the plan page is the
 *  answer surface — R1 interface note). All figures/counts stay DB-authored in `plan`/`items`. */
export function buildInterviewState(
  markers: RunMarkers | null,
  opts: { runId: string; scope: "firm" | "client"; engineStatus: string | null; plan: Record<string, unknown> | null; items: Array<Record<string, unknown>> },
): Record<string, unknown> {
  const terminal = toTerminal(markers?.terminal ?? null);
  const pendingPark = markers && !markers.promptConsumed ? toPendingPark(markers.prompt) : null;
  const activity = opts.scope === "firm" ? (markers?.activity ?? []) : [];
  return {
    run_id: opts.runId || null,
    scope: opts.scope,
    status: normalizeStatus(opts.engineStatus, markers?.terminal ?? null),
    pending_park: pendingPark,
    terminal,
    activity,
    plan: opts.plan,
    items: opts.items,
  };
}

/** The §3.1 derived chip law (a client-side decision, exported so the dashboard shares ONE
 *  definition and R1 can prove it): pending_park && !terminal ⇒ 'awaiting_you'; a terminal ⇒ its
 *  outcome; a running run with no open park ⇒ 'working'; else the status verbatim. */
export function deriveInterviewChip(state: { pending_park?: unknown; terminal?: { outcome?: unknown } | null; status?: unknown }): string {
  if (state.terminal) return String(state.terminal.outcome ?? "complete");
  if (state.pending_park) return "awaiting_you";
  if (state.status === "running") return "working";
  return String(state.status ?? "unknown");
}

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

  // POST firm start — a PRE-FIRM principal (no membership yet). Refuse an existing member
  // (403 already_member — the pre-firm floor mirroring create_firm's own refusal). clara_runtime
  // cannot read firm_memberships directly (0006 §8), so membership rides resolve_chat_principal.
  router.post("/api/interview/firm/start", async (req, res) => {
    if (draining()) return void res.status(503).json({ error: "shutting_down" });
    try {
      const { sub } = await validateJwt(req.header("authorization"));
      const activeFirm = await withRuntime(async (c) => {
        const r = await c.query("select firm_id from clara.resolve_chat_principal($1)", [sub]);
        const row = r.rows[0] as { firm_id?: string } | undefined;
        return row && row.firm_id != null ? String(row.firm_id) : null;
      });
      if (activeFirm) return void res.status(403).json({ error: "already_member", message: "you already belong to a firm" });
      const run = await start(workflows.firmInterview, [{ principalUserId: sub }]);
      res.status(202).json({ run_id: run.runId, scope: "firm" });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      console.error("[clara-runtime] interview firm start:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  });

  // POST client start — the client + plan are already born (dashboard begin_client_onboarding);
  // the caller must be a bookkeeper+ member of the plan's firm (the DB re-validates startedBy on
  // the binding write). IDEMPOTENT: a plan already bound to a run returns that run (no second run).
  router.post("/api/interview/client/start", async (req, res) => {
    if (draining()) return void res.status(503).json({ error: "shutting_down" });
    const body = (req.body ?? {}) as { clientId?: string; planId?: string };
    const { clientId, planId } = body;
    if (!clientId || !planId) return void res.status(400).json({ error: "bad_request", message: "clientId and planId are required" });
    try {
      const outcome = await withRuntime(async (c) => {
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
        if (!isBookkeeperPlus(p.role)) throw new AuthError(403, "forbidden", "a bookkeeper or above must start onboarding");
        // Idempotent: if the plan already carries an 'interview_run' binding, return that run.
        const it = await c.query(
          "select item_key, answer from clara.onboarding_plan_items where plan_id = $1 and item_key = 'interview_run'",
          [planId],
        );
        const bound = interviewRunBinding(it.rows);
        if (bound) return { existing: true as const, runId: bound };
        const run = await start(workflows.clientOnboarding, [{ clientId, planId, startedBy: p.sub }]);
        return { existing: false as const, runId: run.runId };
      });
      if (outcome.existing) return void res.status(200).json({ run_id: outcome.runId, scope: "client", existing: true });
      res.status(202).json({ run_id: outcome.runId, scope: "client" });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      console.error("[clara-runtime] interview client start:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  });

  // POST answer — deliver a validated answer into the park's hook (after BINDING the run to the
  // caller). The answerer uuid rides the payload into update_onboarding_plan.p_answered_by
  // (DB-revalidated bookkeeper+). A firm answer binds to the pre-firm principal; a client answer
  // binds to the plan (in the caller's firm) and requires bookkeeper+.
  router.post("/api/interview/answer", async (req, res) => {
    await deliver(req, res, "answer");
  });

  // POST cancel — deliver a cancel signal to the open hook (same binding as answer); the workflow
  // terminates having persisted nothing flawed (for a client the human then runs cancel_client_onboarding).
  router.post("/api/interview/cancel", async (req, res) => {
    await deliver(req, res, "cancel");
  });

  async function deliver(req: express.Request, res: express.Response, mode: "answer" | "cancel"): Promise<void> {
    const body = (req.body ?? {}) as { runId?: string; parkIndex?: number; scope?: string; value?: unknown; planId?: string };
    const scope = body.scope === "firm" ? "firm" : body.scope === "client" ? "client" : null;
    if (!body.runId || scope === null || typeof body.parkIndex !== "number" || !Number.isInteger(body.parkIndex)) {
      return void res.status(400).json({ error: "bad_request", message: "runId, integer parkIndex, and scope are required" });
    }
    try {
      let answeredBy: string;
      let payloadValue: unknown = null;
      if (scope === "firm") {
        // Bind: the run's FIRST owner marker must name this caller (F1). No DB — a stream read.
        const { sub } = await validateJwt(req.header("authorization"));
        const markers = await readRunMarkers(body.runId);
        if (!firmOwnerMatches(markers.owner, sub)) throw new AuthError(404, "not_found", "not found");
        answeredBy = sub;
        if (mode === "answer") {
          // F7/F8: on the commit park, rebuild the receipt (drops any extra field); else guard the value.
          if (promptExpectsFirmReceipt(markers.prompt)) {
            payloadValue = buildFirmReceipt(body.value);
          } else {
            payloadValue = body.value ?? null;
            validateAnswerValue(payloadValue);
          }
        }
      } else {
        // Bind: the plan (in the caller's firm) must carry an 'interview_run' item matching runId.
        if (!body.planId) throw new AuthError(400, "bad_request", "planId is required for a client interview");
        answeredBy = await withRuntime(async (c) => {
          const p = await authenticate(c, req.header("authorization"));
          const r = await c.query("select firm_id from clara.onboarding_plans where id = $1", [body.planId]);
          const plan = r.rows[0] as { firm_id?: string } | undefined;
          if (!plan || plan.firm_id !== p.firmId) throw new AuthError(404, "not_found", "not found");
          if (!isBookkeeperPlus(p.role)) throw new AuthError(403, "forbidden", "a bookkeeper or above must answer");
          const it = await c.query(
            "select item_key, answer from clara.onboarding_plan_items where plan_id = $1 and item_key = 'interview_run'",
            [body.planId],
          );
          if (interviewRunBinding(it.rows) !== body.runId) throw new AuthError(404, "not_found", "not found");
          return p.sub;
        });
        if (mode === "answer") {
          payloadValue = body.value ?? null;
          validateAnswerValue(payloadValue);
        }
      }
      const token = hookToken(scope, body.runId, body.parkIndex);
      const payload: Resolution =
        mode === "cancel" ? { kind: "cancelled" } : { kind: "answer", value: payloadValue, answeredBy };
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

  // GET state — the plan (client) + the run status + a best-effort current prompt. BINDS before
  // exposing the prompt stream: a firm run's stream is readable only by its principal; a client
  // run's plan+stream only by a member of its firm whose plan carries the matching binding.
  router.get("/api/interview/state", async (req, res) => {
    const runId = typeof req.query.runId === "string" ? req.query.runId : "";
    const scope = req.query.scope === "firm" ? "firm" : "client";
    const planId = typeof req.query.planId === "string" ? req.query.planId : null;
    try {
      const markers = runId ? await readRunMarkers(runId) : null;
      let plan: Record<string, unknown> | null = null;
      let items: Array<Record<string, unknown>> = [];
      if (scope === "firm") {
        const { sub } = await validateJwt(req.header("authorization"));
        // A firm run's prompt stream is readable only by its bound principal (F1). With no runId
        // there is no stream to expose.
        if (runId && !firmOwnerMatches(markers?.owner, sub)) throw new AuthError(404, "not_found", "not found");
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
          // The run's prompt stream is exposed only when the plan carries the matching binding.
          if (runId && interviewRunBinding(items) !== runId) throw new AuthError(404, "not_found", "not found");
        });
      }
      // v2 (§3.1): the binding/authz above is UNCHANGED (bind-before-act); only the response
      // projection changes — typed pending_park + terminal + folded activity[], no prose to parse.
      const engineStatus = runId ? await runStatus(runId) : null;
      res.json(buildInterviewState(markers, { runId, scope, engineStatus, plan, items }));
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

/** Bounded snapshot of a run's streamed markers (the buffered chunks replay fast; we cap the
 *  wait). Reads from index 0 so the FIRST owner marker (the binding) is always captured. */
async function readRunMarkers(runId: string): Promise<RunMarkers> {
  type Reader = { read(): Promise<{ done: boolean; value: unknown }>; cancel(): Promise<unknown> };
  let reader: Reader | null = null;
  try {
    reader = getRun(runId).getReadable({ startIndex: 0 }).getReader() as unknown as Reader;
  } catch {
    return reduceRunMarkers([]);
  }
  const deadline = Date.now() + 800;
  const chunks: Array<Record<string, unknown>> = [];
  try {
    while (Date.now() < deadline) {
      const winner = await Promise.race([
        reader.read(),
        new Promise<"t">((r) => setTimeout(() => r("t"), Math.max(20, deadline - Date.now()))),
      ]);
      if (winner === "t") break;
      if ((winner as { done: boolean }).done) break;
      const v = (winner as { value: unknown }).value;
      if (v && typeof v === "object") chunks.push(v as Record<string, unknown>);
    }
  } catch {
    /* transient — fold whatever we have */
  } finally {
    await reader.cancel().catch(() => {});
  }
  return reduceRunMarkers(chunks);
}
