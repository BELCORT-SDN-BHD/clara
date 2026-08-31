// Client-scope durable interview wire client. This is a contract port from
// apps/dashboard/app/shared/interviewApi.ts, adapted only to apps/web's
// same-origin runtime proxy and SessionTokenAccessor convention. The long
// comments around COMPLETE_OUTCOMES and 409/not_pending are intentionally
// retained: they describe safety decisions, not implementation trivia.

import type { SessionTokenAccessor } from "@/lib/session";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { kindForStatus } from "@/lib/wire-error-kind";
import { expectRuntimeOk, RuntimeError, safeRuntimeFetch } from "@/lib/documents/runtime-wire";

export type InterviewOpts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** Typed runtime error envelope. Interview routes carry a stable `error` code;
 *  409/not_pending must remain distinguishable from every other conflict. */
export class RuntimeApiError extends RuntimeError {
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message, { status, kind: kindForStatus(status) });
    this.name = "RuntimeApiError";
    this.code = code;
  }
}

/** Deliberately narrow. A bare 409 is not enough: only the documented lossy
 *  runtime code earns the answer re-read/retry path. */
export function isNotPending(err: unknown): boolean {
  return err instanceof RuntimeApiError && err.code === "not_pending";
}

const INTERVIEW_FETCH_TIMEOUT_MS = 15_000;

async function requireToken(opts: InterviewOpts): Promise<string> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (!token) throw new Error("not signed in — no live session");
  return token;
}

function signalFor(signal?: AbortSignal): AbortSignal {
  return signal ?? AbortSignal.timeout(INTERVIEW_FETCH_TIMEOUT_MS);
}

async function runtimeFetch(
  path: string,
  token: string,
  what: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<Response> {
  const response = await safeRuntimeFetch(
    path,
    {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: signalFor(signal),
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    },
    what,
  );
  if (response.type === "opaqueredirect") await expectRuntimeOk(response, what);
  return response;
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

// N2 (review round 1): this DOES quote `body.message` into the thrown error,
// which is a deliberate, narrow exception to runtime-wire.ts's own
// no-raw-body discipline ("RAW RUNTIME BODY TEXT IS NEVER SURFACED
// UNCLASSIFIED"). That rule guards an arbitrary upstream body; this body is
// a first-party typed envelope this same runtime mints on purpose
// (`{error: <code>, message?: string}` — interviewRoutes.ts's own
// `res.status(...).json({error, message})` calls), never third-party or
// user-controlled text, so quoting it verbatim is safe and preferred over a
// generic `kindForStatus`-only message.
function errorFrom(status: number, body: Record<string, unknown>): RuntimeApiError {
  const code = typeof body.error === "string" ? body.error : `http_${status}`;
  const message = typeof body.message === "string" ? body.message : code;
  return new RuntimeApiError(status, code, message);
}

async function errorFromResponse(res: Response, what: string): Promise<Error> {
  if (res.type === "opaqueredirect") {
    await expectRuntimeOk(res, what);
  }
  return errorFrom(res.status, await bodyOf(res));
}

export type InterviewScope = "firm" | "client";

export type PendingPark = {
  parkIndex: number;
  seg: string;
  phase: "q" | "c";
  question: string;
  expects?: string;
  opKey?: string;
};

export type InterviewTerminal = { outcome: string } & Record<string, unknown>;

export type ActivityEntry = { kind: "answered"; seg: string; phase?: string; echo: string; at?: string };

export type StatePlanItem = {
  item_key: string;
  item_kind: string;
  state: string;
  required_for_commit: boolean;
  question: string | null;
  answer: unknown;
};

export type InterviewChip = "awaiting_you" | "working" | "complete" | "cancelled" | "expired" | "ended" | "unknown";

export type InterviewState = {
  runId: string | null;
  scope: InterviewScope;
  status: string | null;
  chip: InterviewChip;
  pendingPark: PendingPark | null;
  terminal: InterviewTerminal | null;
  activity: ActivityEntry[];
  plan: Record<string, unknown> | null;
  items: StatePlanItem[];
  /** The current client segment ordinal. No total is fabricated: /state does
   *  not supply one. */
  progress: { index: number; seg: string } | null;
};

/** Client list only. Firm bootstrap is deliberately outside FS-5. */
export const CLIENT_SEG_KEYS: readonly string[] = [
  "legal_name", "entity_type", "ssm", "turnover", "tin", "msic", "sst_regime",
  "sst_no", "statutory", "banks", "currency", "fye", "framework", "coa_seed",
  "opening_position", "fa_depreciation", "sample_invoices",
];

export function segmentProgress(
  scope: InterviewScope,
  seg: string | null | undefined,
): { index: number; seg: string } | null {
  if (scope !== "client" || !seg) return null;
  const i = CLIENT_SEG_KEYS.indexOf(seg);
  if (i < 0) return null;
  return { index: i + 1, seg };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toPendingPark(chunk: Record<string, unknown>): PendingPark | null {
  const parkIndex = chunk.parkIndex;
  if (typeof parkIndex !== "number" || !Number.isInteger(parkIndex)) return null;
  const seg = typeof chunk.seg === "string" ? chunk.seg : "";
  const phase = chunk.phase === "c" ? "c" : "q";
  const question = typeof chunk.question === "string" ? chunk.question : "";
  const expects = typeof chunk.expects === "string" ? chunk.expects : undefined;
  const opKey = typeof chunk.op_key === "string" ? chunk.op_key : typeof chunk.opKey === "string" ? chunk.opKey : undefined;
  return { parkIndex, seg, phase, question, expects, opKey };
}

/** Terminal outcomes meaning the run reached its INTENDED end (not cancelled,
 *  expired or otherwise stopped). Shared by deriveChip, delivery
 *  disambiguation, and useInterviewRun's error lifetime.
 *
 *  SAFETY-LOAD-BEARING — NOT a display list. Widening this to make a chip
 *  render nicer silently widens what counts as proof that an answer landed and
 *  what may clear a refusal from the human's screen. */
export const COMPLETE_OUTCOMES: ReadonlySet<string> = new Set(["firm_created", "interview_complete", "complete", "completed"]);

export function deriveChip(
  pendingPark: PendingPark | null,
  terminal: InterviewTerminal | null,
  status: string | null,
): InterviewChip {
  if (terminal) {
    const o = terminal.outcome;
    if (COMPLETE_OUTCOMES.has(o)) return "complete";
    if (o === "cancelled" || o === "canceled") return "cancelled";
    if (o === "expired") return "expired";
    return "ended";
  }
  if (pendingPark) return "awaiting_you";
  const s = (status ?? "").toLowerCase();
  if (s === "running" || s === "active" || s === "awaiting_input" || s === "queued") return "working";
  if (s === "complete" || s === "completed" || s === "succeeded") return "complete";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "failed" || s === "terminated" || s === "errored") return "ended";
  return "unknown";
}

export function normalizeInterviewState(raw: unknown): InterviewState {
  const r = asRecord(raw) ?? {};
  const scope: InterviewScope = r.scope === "firm" ? "firm" : "client";
  const runId = typeof r.run_id === "string" && r.run_id.length > 0 ? r.run_id : null;
  const status = typeof r.status === "string" ? r.status : null;

  let pendingPark: PendingPark | null = null;
  let terminal: InterviewTerminal | null = null;

  const pinnedPark = asRecord(r.pending_park);
  if (pinnedPark) pendingPark = toPendingPark(pinnedPark);
  const pinnedTerminal = asRecord(r.terminal);
  if (pinnedTerminal && typeof pinnedTerminal.outcome === "string") terminal = pinnedTerminal as InterviewTerminal;

  const current = asRecord(r.current_prompt);
  if (current) {
    if (current.type === "interview_terminal" && !terminal && typeof current.outcome === "string") {
      terminal = current as InterviewTerminal;
    } else if (current.type === "interview_prompt" && !pendingPark) {
      pendingPark = toPendingPark(current);
    } else if (!current.type && !pendingPark && !terminal) {
      pendingPark = toPendingPark(current);
    }
  }

  const activity: ActivityEntry[] = Array.isArray(r.activity)
    ? (r.activity as unknown[]).flatMap((a) => {
        const ar = asRecord(a);
        if (!ar || ar.kind !== "answered" || typeof ar.seg !== "string") return [];
        return [{
          kind: "answered" as const,
          seg: ar.seg,
          phase: typeof ar.phase === "string" ? ar.phase : undefined,
          echo: typeof ar.echo === "string" ? ar.echo : "",
          at: typeof ar.at === "string" ? ar.at : undefined,
        }];
      })
    : [];

  const items: StatePlanItem[] = Array.isArray(r.items)
    ? (r.items as unknown[]).flatMap((it) => {
        const ir = asRecord(it);
        if (!ir || typeof ir.item_key !== "string") return [];
        return [{
          item_key: ir.item_key,
          item_kind: typeof ir.item_kind === "string" ? ir.item_kind : "",
          state: typeof ir.state === "string" ? ir.state : "",
          required_for_commit: ir.required_for_commit === true,
          question: typeof ir.question === "string" ? ir.question : null,
          answer: ir.answer ?? null,
        }];
      })
    : [];

  const chip = deriveChip(pendingPark, terminal, status);
  const progress = pendingPark ? segmentProgress(scope, pendingPark.seg) : null;

  return {
    runId,
    scope,
    status,
    chip,
    pendingPark,
    terminal,
    activity,
    plan: asRecord(r.plan),
    items,
    progress,
  };
}

export type StartResult = { runId: string; scope: InterviewScope; existing: boolean };

/** Idempotent client start/resume: 202 is fresh; 200 existing:true reuses the
 *  run already bound to the plan. */
export async function startClientInterview(
  args: { clientId: string; planId: string },
  opts: InterviewOpts = {},
): Promise<StartResult> {
  const token = await requireToken(opts);
  const res = await runtimeFetch(
    "/api/runtime/interview/client/start",
    token,
    "start client interview",
    { method: "POST", body: JSON.stringify({ clientId: args.clientId, planId: args.planId }) },
    opts.signal,
  );
  const body = await bodyOf(res);
  if (res.status === 202) return { runId: String(body.run_id ?? ""), scope: "client", existing: false };
  if (res.status === 200 && body.existing === true) return { runId: String(body.run_id ?? ""), scope: "client", existing: true };
  throw errorFrom(res.status, body);
}

export type StateQuery = { runId?: string | null; scope: InterviewScope; planId?: string | null };

export async function getInterviewState(q: StateQuery, opts: InterviewOpts = {}): Promise<InterviewState> {
  const token = await requireToken(opts);
  const params = new URLSearchParams();
  params.set("scope", q.scope);
  if (q.runId) params.set("runId", q.runId);
  if (q.planId) params.set("planId", q.planId);
  const res = await runtimeFetch(
    `/api/runtime/interview/state?${params.toString()}`,
    token,
    "read interview state",
    {},
    opts.signal,
  );
  if (!res.ok) throw await errorFromResponse(res, "read interview state");
  await expectRuntimeOk(res, "read interview state");
  return normalizeInterviewState(await res.json().catch(() => ({})));
}

export type AnswerArgs = {
  runId: string;
  scope: InterviewScope;
  parkIndex: number;
  value: unknown;
  planId?: string | null;
};

function postAnswer(token: string, a: AnswerArgs, signal?: AbortSignal): Promise<Response> {
  return runtimeFetch(
    "/api/runtime/interview/answer",
    token,
    "answer interview",
    {
      method: "POST",
      body: JSON.stringify({
        runId: a.runId,
        scope: a.scope,
        parkIndex: a.parkIndex,
        value: a.value,
        planId: a.planId ?? undefined,
      }),
    },
    signal,
  );
}

export type Delivery = "delivered" | "still_open" | "unknown";

/** Classify a RAW /state body. This intentionally does not use the tolerant
 *  UI normalizer: delivery requires literal run/scope/plan identity, followed
 *  by one of two positive facts only — complete-class terminal or a strictly
 *  higher park index. Unknown never means delivered. */
export function classifyDeliveryBody(r: Record<string, unknown>, a: AnswerArgs): Delivery {
  if (r.run_id !== a.runId) return "unknown";
  if (r.scope !== a.scope) return "unknown";
  if (a.planId != null) {
    const plan = asRecord(r.plan);
    if (!plan || plan.id !== a.planId) return "unknown";
  }

  if (r.terminal !== undefined && r.terminal !== null) {
    const outcome = asRecord(r.terminal)?.outcome;
    return typeof outcome === "string" && COMPLETE_OUTCOMES.has(outcome) ? "delivered" : "unknown";
  }

  const idx = asRecord(r.pending_park)?.parkIndex;
  if (typeof idx !== "number" || !Number.isInteger(idx)) return "unknown";
  if (idx > a.parkIndex) return "delivered";
  if (idx === a.parkIndex) return "still_open";
  return "unknown";
}

async function readDeliveryWithToken(
  token: string,
  a: AnswerArgs,
  signal?: AbortSignal,
): Promise<Delivery> {
  try {
    const params = new URLSearchParams();
    params.set("scope", a.scope);
    params.set("runId", a.runId);
    if (a.planId) params.set("planId", a.planId);
    const res = await runtimeFetch(
      `/api/runtime/interview/state?${params.toString()}`,
      token,
      "read interview delivery",
      {},
      signal,
    );
    if (!res.ok) return "unknown";
    const raw = asRecord(await res.json());
    return raw ? classifyDeliveryBody(raw, a) : "unknown";
  } catch {
    return "unknown";
  }
}

export async function readDelivery(a: AnswerArgs, opts: InterviewOpts = {}): Promise<Delivery> {
  const token = await requireToken(opts);
  return readDeliveryWithToken(token, a, opts.signal);
}

/** Full GH #152 disambiguation: POST; on typed not_pending re-read; retry once
 *  only when the same park is positively still open; if the retry also says
 *  not_pending, re-read once more. At most two POSTs and two reads. */
export async function answerInterview(a: AnswerArgs, opts: InterviewOpts = {}): Promise<void> {
  const token = await requireToken(opts);
  const res = await postAnswer(token, a, opts.signal);
  if (res.status === 200) return;

  const refusal = errorFrom(res.status, await bodyOf(res));
  if (!isNotPending(refusal)) throw refusal;

  const first = await readDeliveryWithToken(token, a, opts.signal);
  if (first === "delivered") return;
  if (first === "unknown") throw refusal;

  const retry = await postAnswer(token, a, opts.signal);
  if (retry.status === 200) return;
  const retryRefusal = errorFrom(retry.status, await bodyOf(retry));
  if (!isNotPending(retryRefusal)) throw retryRefusal;

  if ((await readDeliveryWithToken(token, a, opts.signal)) === "delivered") return;
  throw retryRefusal;
}

export type CancelArgs = {
  runId: string;
  scope: InterviewScope;
  parkIndex: number;
  planId?: string | null;
};
export type CancelResult = { delivered: boolean; alreadyResolved: boolean };

/** Runtime cancel is the first half of client cancellation. Its 409 is not an
 *  error: the caller must continue to the idempotent DB cancellation door. */
export async function cancelInterview(c: CancelArgs, opts: InterviewOpts = {}): Promise<CancelResult> {
  const token = await requireToken(opts);
  const res = await runtimeFetch(
    "/api/runtime/interview/cancel",
    token,
    "cancel interview",
    {
      method: "POST",
      body: JSON.stringify({
        runId: c.runId,
        scope: c.scope,
        parkIndex: c.parkIndex,
        planId: c.planId ?? undefined,
      }),
    },
    opts.signal,
  );
  if (res.status === 200) return { delivered: true, alreadyResolved: false };
  if (res.status === 409) return { delivered: false, alreadyResolved: true };
  throw errorFrom(res.status, await bodyOf(res));
}
