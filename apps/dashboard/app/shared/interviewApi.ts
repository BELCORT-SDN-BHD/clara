// The AGENT-lane wire client for the Wave-B durable interview surface (settled
// dashboard plan §3.1 /state v2; F4/F6). The interview runs on the Clara runtime as a
// durable WDK workflow (firmInterview_v1 / clientOnboarding_v1); the dashboard talks to
// its same-origin routes (`/api/interview/*`, Bearer = the user's Supabase session JWT).
// This lane NEVER computes a figure and NEVER touches governance — the human-floor verbs
// (begin/commit/cancel_client_onboarding, create_firm, resolve_onboarding_plan_item) are
// clara_authenticated PostgREST calls in ./onboardingApi.ts (the HUMAN lane), never here.
//
// The R1 route implements the pinned §3.1 /state v2 shape exactly ({ pending_park,
// terminal, activity, … }) with the commit park's op_key as a TYPED field — the primary
// path here is that pin. `normalizeInterviewState`'s legacy `current_prompt` branch is a
// DEFENSIVE DEAD FALLBACK retained per the house defensive-mapper idiom (cf. wire.ts
// parseClrCode). `commitOpKeyFromPrompt` is TYPED-ONLY (F-M16): a commit park missing the
// typed op_key is a runtime contract violation, never a prose parse of the question text.

import { runtimeBase } from "./wire";

// ---------------------------------------------------------------------------
// Errors + config.
// ---------------------------------------------------------------------------

/** The typed runtime error envelope (settled plan §3.5): every non-2xx interview route
 *  reply is `{ error: <code>, message? }`; we surface it as {status, code, message}. The
 *  409/not_pending branch (F6) is `code === "not_pending"` — a LOSSY status that conflates
 *  "already delivered" with "dropped", so it is never read as delivery on its own; see
 *  `answerInterview`, which disambiguates it against /state. */
export class RuntimeApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RuntimeApiError";
    this.status = status;
    this.code = code;
  }
}

/** The lossy status, EXACTLY. Deliberately narrow: it matches the documented `not_pending` code
 *  and nothing else. An earlier version also matched any bare 409, which would have handed a
 *  future unrelated conflict (a plan that is not open, say) to the answer re-POST path. */
export function isNotPending(err: unknown): boolean {
  return err instanceof RuntimeApiError && err.code === "not_pending";
}

async function runtimeFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${runtimeBase()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function errorFrom(status: number, body: Record<string, unknown>): RuntimeApiError {
  const code = typeof body.error === "string" ? body.error : `http_${status}`;
  const message = typeof body.message === "string" ? body.message : code;
  return new RuntimeApiError(status, code, message);
}

// ---------------------------------------------------------------------------
// Types — the pinned semantic view (§3.1) this client exposes to the UI.
// ---------------------------------------------------------------------------

export type InterviewScope = "firm" | "client";

/** The open question at the current park (the pinned `pending_park`). `opKey` is present
 *  only on the firm commit park (F5); `expects === "create_firm_receipt"` tags it. */
export type PendingPark = {
  parkIndex: number;
  seg: string;
  phase: "q" | "c";
  question: string;
  expects?: string;
  opKey?: string;
};

export type InterviewTerminal = { outcome: string } & Record<string, unknown>;

/** A sanitized confirmed answer (§3.1 activity[]). Client scope MAY be [] — the plan page
 *  is the durable answer surface; firm scope has no plan, so its thread is stream-driven. */
export type ActivityEntry = { kind: "answered"; seg: string; phase?: string; echo: string; at?: string };

/** A plan item as /state returns it (client scope only; the plan page reads the full row). */
export type StatePlanItem = {
  item_key: string;
  item_kind: string;
  state: string;
  required_for_commit: boolean;
  question: string | null;
  answer: unknown;
};

/** The derived run chip (§3.1 chip law + the parked=awaiting_you framing). */
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
  /** The current park's segment ordinal — "step N" (null when no park / unknown segment).
   *  F-M15: NO fabricated total — the hard-coded seg-count was a client fabrication; a real
   *  total would have to come from the runtime, which /state v2 does not (yet) supply. */
  progress: { index: number; seg: string } | null;
};

// ---------------------------------------------------------------------------
// Segment order (mirrors the FROZEN interview.v1.questions inventories, verbatim keys).
// Used only to render the "step N" segment ordinal; an unknown seg degrades progress to null.
// If a future interview_vN reorders segments, this list is refreshed alongside the vN dash
// surface — the keys are the stable contract, and mismatch degrades gracefully (never throws).
// ---------------------------------------------------------------------------

export const FIRM_SEG_KEYS: readonly string[] = [
  "legal_name", "ssm", "entity_type", "address", "mia", "bookkeeper_email",
  "turnover", "tin", "fye", "currency", "framework", "commit",
];

export const CLIENT_SEG_KEYS: readonly string[] = [
  "legal_name", "entity_type", "ssm", "turnover", "tin", "msic", "sst_regime",
  "sst_no", "statutory", "banks", "currency", "fye", "framework", "coa_seed",
  "opening_position", "fa_depreciation", "sample_invoices",
];

export function segmentProgress(scope: InterviewScope, seg: string | null | undefined): { index: number; seg: string } | null {
  if (!seg) return null;
  const keys = scope === "firm" ? FIRM_SEG_KEYS : CLIENT_SEG_KEYS;
  const i = keys.indexOf(seg);
  if (i < 0) return null;
  // F-M15: emit the segment ordinal only — the total is NOT ours to fabricate.
  return { index: i + 1, seg };
}

// ---------------------------------------------------------------------------
// Normalizer — accepts BOTH the pinned shape and the as-built `current_prompt` shape.
// ---------------------------------------------------------------------------

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

/** The stable create_firm op_key the workbench passes to `createFirm` (§3.1/F5). F-M16:
 *  TYPED-ONLY — the commit park MUST carry the typed `op_key` field. A park missing it is a
 *  runtime contract violation (the caller surfaces "refresh /state"), NEVER a prose parse of
 *  the question text. Returns null only when the typed field is absent (⇒ the error state). */
export function commitOpKeyFromPrompt(park: PendingPark | null | undefined): string | null {
  if (!park) return null;
  if (typeof park.opKey === "string" && park.opKey.length > 0) return park.opKey;
  return null;
}

/** Terminal outcomes meaning the run reached its INTENDED end (not cancelled, expired or
 *  otherwise stopped). Shared by `deriveChip` and the answer verb's delivery test so the two
 *  can never drift apart. */
const COMPLETE_OUTCOMES = new Set(["firm_created", "interview_complete", "complete", "completed"]);

/** Derive the run chip (§3.1). Terminal wins; then a pending park (awaiting_you, incl.
 *  the parked framing); then a running engine status (working); else unknown. */
export function deriveChip(pendingPark: PendingPark | null, terminal: InterviewTerminal | null, status: string | null): InterviewChip {
  if (terminal) {
    const o = terminal.outcome;
    if (COMPLETE_OUTCOMES.has(o)) return "complete";
    if (o === "cancelled" || o === "canceled") return "cancelled";
    if (o === "expired") return "expired";
    return "ended"; // plan_gone / superseded_by_existing_run / anything else terminal
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

  // Pinned fields take precedence; the as-built `current_prompt` union is the fallback.
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
      // A bare current_prompt with no discriminator: treat as a prompt if it has a parkIndex.
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

// ---------------------------------------------------------------------------
// The routes (same-origin `/api/interview/*`; Bearer JWT).
// ---------------------------------------------------------------------------

export type StartResult = { runId: string; scope: InterviewScope; existing: boolean };

/** POST /firm/start — a PRE-FIRM principal (no membership). 403 already_member if the caller
 *  already belongs to a firm; 202 → {run_id}. */
export async function startFirmInterview(token: string): Promise<StartResult> {
  const res = await runtimeFetch("/api/interview/firm/start", token, { method: "POST" });
  const body = await bodyOf(res);
  if (res.status === 202) return { runId: String(body.run_id ?? ""), scope: "firm", existing: false };
  throw errorFrom(res.status, body);
}

/** POST /client/start — the client + plan already exist (begin_client_onboarding). Idempotent:
 *  a plan already bound to a run returns that run (200 existing:true); a fresh start is 202. */
export async function startClientInterview(token: string, args: { clientId: string; planId: string }): Promise<StartResult> {
  const res = await runtimeFetch("/api/interview/client/start", token, {
    method: "POST",
    body: JSON.stringify({ clientId: args.clientId, planId: args.planId }),
  });
  const body = await bodyOf(res);
  if (res.status === 202) return { runId: String(body.run_id ?? ""), scope: "client", existing: false };
  if (res.status === 200 && body.existing === true) return { runId: String(body.run_id ?? ""), scope: "client", existing: true };
  throw errorFrom(res.status, body);
}

export type StateQuery = { runId?: string | null; scope: InterviewScope; planId?: string | null };

/** GET /state — the resume surface (§3.1). Returns the normalized pinned view. */
export async function getInterviewState(token: string, q: StateQuery): Promise<InterviewState> {
  const params = new URLSearchParams();
  params.set("scope", q.scope);
  if (q.runId) params.set("runId", q.runId);
  if (q.planId) params.set("planId", q.planId);
  const res = await runtimeFetch(`/api/interview/state?${params.toString()}`, token);
  if (!res.ok) throw errorFrom(res.status, await bodyOf(res));
  return normalizeInterviewState(await res.json().catch(() => ({})));
}

export type AnswerArgs = { runId: string; scope: InterviewScope; parkIndex: number; value: unknown; planId?: string | null };

function postAnswer(token: string, a: AnswerArgs): Promise<Response> {
  return runtimeFetch("/api/interview/answer", token, {
    method: "POST",
    body: JSON.stringify({ runId: a.runId, scope: a.scope, parkIndex: a.parkIndex, value: a.value, planId: a.planId ?? undefined }),
  });
}

/** POST /answer — deliver a validated answer into the current park's hook.
 *
 *  THE not_pending CONTRACT IS LOSSY, AND THIS IS ITS CLIENT HALF (GH #152 / PR #186). The
 *  route answers 409 `not_pending` for two facts it cannot tell apart: the park genuinely
 *  advanced (our answer already landed — benign), and the hook was not armed when we POSTed
 *  (our answer was DROPPED). PR #186 closed the runtime half — v3 arms the hook before the park
 *  is announced, so the drop is no longer reachable through that window — but the STATUS stays
 *  ambiguous by construction, and assuming "already delivered" is precisely how the original
 *  bug stayed invisible in production: the answer vanished and the human just retyped.
 *
 *  So a 409 is DISAMBIGUATED against /state, never assumed — and the reading is FAIL-CLOSED ON
 *  UNKNOWN (the ADR-059 armour law): only POSITIVE evidence about THIS run counts as delivery,
 *  and everything else surfaces the original refusal. `classifyDelivery` below is that reading;
 *  a `{}` body, a momentarily park-less "working" state, a cancelled run, or a reply about some
 *  OTHER run must never read as delivery, or the dropped-answer bug walks straight back in
 *  through the recovery meant to close it.
 *
 *  KNOWN RESIDUAL, named rather than papered over: "a higher park ⇒ my answer landed" is an
 *  INFERENCE, NOT A RECEIPT. A concurrent submitter can win the single hook and advance the park,
 *  and this lane would read that advance as its own delivery. The exposure is wider than one
 *  person's two tabs: a CLIENT-scope answer authorises on the plan's firm plus a bookkeeper+ floor
 *  (interviewRoutes.ts — "a bookkeeper or above must answer"), so ANY bookkeeper+ of the firm can
 *  be the winner; only the FIRM scope is bound to a single pre-firm principal. Closing it needs a
 *  server-authored per-(run, park, submission) receipt the client can match its own submission id
 *  against — a RUNTIME CONTRACT change, not a client one, and out of scope here. What this lane
 *  does do is shrink the fail-open set from "every 409" (the shipped behaviour) to exactly this
 *  concurrent-winner case. The residual is a tracked follow-up, not a solved problem.
 *
 *  A caller that sees this throw knows the answer is NOT CONFIRMED DELIVERED — either the retry
 *  also failed, or the state could not be read as evidence at all. That is the guarantee
 *  `deliverValue`'s F-M10 receipt retention relies on; it is deliberately weaker than "the answer
 *  definitely failed", because proving THAT needs a receipt the runtime does not yet issue. */
type Delivery = "delivered" | "still_open" | "unknown";

/** Classify a RAW /state body as evidence about OUR answer.
 *
 *  IT READS THE RAW BODY ON PURPOSE, not `normalizeInterviewState`. That normalizer is a
 *  deliberately TOLERANT UI mapper — it coerces an absent or unrecognised `scope` to "client",
 *  drops a malformed terminal, and degrades junk to empty fields, all of which are right for
 *  rendering and WRONG for a safety decision. Deciding delivery from a lossy projection is the
 *  same mistake as deciding it from the derived chip, one layer down.
 *
 *  IDENTITY FIRST, by literal equality and with no defaulting: a reply about a different run, a
 *  different scope, or a different plan is not weak evidence, it is NO evidence.
 *
 *  Then, and only from a reply that is about us:
 *    · a terminal PRESENT AT ALL is AUTHORITATIVE — complete-class ⇒ delivered, and anything
 *      else (cancelled, expired, ended, or a malformed outcome) ⇒ unknown. It is checked BEFORE
 *      the park so a stale park cannot outvote a run that has actually ended.
 *    · a park at a HIGHER index ⇒ the park moved past ours ⇒ delivered
 *    · our OWN park still open  ⇒ nothing landed           ⇒ still_open
 *    · anything else            ⇒ unknown, and unknown NEVER means delivered. */
function classifyDeliveryBody(r: Record<string, unknown>, a: AnswerArgs): Delivery {
  if (r.run_id !== a.runId) return "unknown";
  if (r.scope !== a.scope) return "unknown"; // absent/unknown scope is NOT silently "client"
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
  return "unknown"; // a LOWER index — a different or restarted run, not our evidence
}

/** One classified /state read. Anything that is not a clean 2xx JSON object — a non-2xx, an
 *  unparseable body, a thrown fetch — is "unknown", never evidence either way. */
async function readDelivery(token: string, a: AnswerArgs): Promise<Delivery> {
  try {
    const params = new URLSearchParams();
    params.set("scope", a.scope);
    params.set("runId", a.runId);
    if (a.planId) params.set("planId", a.planId);
    const res = await runtimeFetch(`/api/interview/state?${params.toString()}`, token);
    if (!res.ok) return "unknown";
    const raw = asRecord(await res.json());
    return raw ? classifyDeliveryBody(raw, a) : "unknown";
  } catch {
    return "unknown";
  }
}

export async function answerInterview(token: string, a: AnswerArgs): Promise<void> {
  const res = await postAnswer(token, a);
  if (res.status === 200) return;

  const refusal = errorFrom(res.status, await bodyOf(res));
  // Narrow ON PURPOSE: only the documented lossy status earns a re-read. Any OTHER 409 is a
  // genuine conflict (a plan that is not open, say) and is reported as-is, never re-POSTed.
  if (!isNotPending(refusal)) throw refusal;

  const first = await readDelivery(token, a);
  if (first === "delivered") return;
  if (first === "unknown") throw refusal;

  // still_open: our park is genuinely unanswered. This is the ONE path that retries.
  const retry = await postAnswer(token, a);
  if (retry.status === 200) return;
  const retryRefusal = errorFrom(retry.status, await bodyOf(retry));
  if (!isNotPending(retryRefusal)) throw retryRefusal;

  // The retry ALSO says not_pending. Two readings remain: our first answer had in fact landed and
  // the park markers were merely LAGGING behind it (the duplicate-submit-of-the-last-answer case,
  // where throwing here would be a FALSE refusal at the natural end of an interview), or it is
  // still being dropped. One more read decides, and anything short of positive evidence is still
  // a refusal. Bounded by construction: at most two POSTs and two reads, no loop.
  if ((await readDelivery(token, a)) === "delivered") return;
  throw retryRefusal;
}

export type CancelArgs = { runId: string; scope: InterviewScope; parkIndex: number; planId?: string | null };
export type CancelResult = { delivered: boolean; alreadyResolved: boolean };

/** POST /cancel — deliver a cancel into the open hook. A 409/not_pending means the run had no
 *  open park (already answered/cancelled/terminated) — for the two-step client cancel that is
 *  NOT an error: the caller proceeds to the idempotent DB cancel_client_onboarding regardless.
 *  Returns whether the runtime cancel was actually delivered. */
export async function cancelInterview(token: string, c: CancelArgs): Promise<CancelResult> {
  const res = await runtimeFetch("/api/interview/cancel", token, {
    method: "POST",
    body: JSON.stringify({ runId: c.runId, scope: c.scope, parkIndex: c.parkIndex, planId: c.planId ?? undefined }),
  });
  if (res.status === 200) return { delivered: true, alreadyResolved: false };
  if (res.status === 409) return { delivered: false, alreadyResolved: true };
  throw errorFrom(res.status, await bodyOf(res));
}
