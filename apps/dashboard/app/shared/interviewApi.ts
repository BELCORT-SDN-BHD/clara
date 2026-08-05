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

/** Derive the run chip (§3.1). Terminal wins; then a pending park (awaiting_you, incl.
 *  the parked framing); then a running engine status (working); else unknown. */
export function deriveChip(pendingPark: PendingPark | null, terminal: InterviewTerminal | null, status: string | null): InterviewChip {
  if (terminal) {
    const o = terminal.outcome;
    if (o === "firm_created" || o === "interview_complete" || o === "complete" || o === "completed") return "complete";
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
 *  UNKNOWN (the ADR-059 armour law): only POSITIVE evidence counts as delivery, everything else
 *  surfaces the original refusal. Re-read ONCE and classify:
 *    · a park at a HIGHER index      ⇒ the park moved past ours  ⇒ delivered, return.
 *    · a COMPLETE-class terminal     ⇒ the run reached its end   ⇒ delivered, return.
 *    · the SAME park still open      ⇒ nothing landed            ⇒ re-POST ONCE.
 *    · cancelled / expired / ended   ⇒ our answer never landed   ⇒ surface the refusal.
 *    · no park and not terminal, a LOWER park index, an unparseable body, a failed read
 *                                    ⇒ undiagnosable            ⇒ surface the refusal.
 *  The last line is the one that matters: a `{}` body or a momentarily park-less "working" state
 *  must NEVER read as delivery, or the dropped-answer bug walks straight back in through the
 *  recovery meant to close it.
 *
 *  KNOWN RESIDUAL, named rather than papered over: "a higher park ⇒ my answer landed" is an
 *  inference, not a receipt. A SECOND client on the same run (two tabs of the same principal —
 *  a different principal is already refused by F1) could win the park with a different value and
 *  advance it, and this lane would call that delivery. Closing it needs a server-authored
 *  per-(run, park) delivery receipt the client can match its own value against; that is a runtime
 *  contract change, not a client one. Until then the same-owner two-tab race stands.
 *
 *  Only a retry that ALSO fails is surfaced. A caller that sees this throw therefore knows the
 *  answer is not confirmed delivered — `deliverValue`'s F-M10 receipt retention relies on it. */
export async function answerInterview(token: string, a: AnswerArgs): Promise<void> {
  const res = await postAnswer(token, a);
  if (res.status === 200) return;

  const refusal = errorFrom(res.status, await bodyOf(res));
  // Narrow ON PURPOSE: only the documented lossy status earns a re-read. Any OTHER 409 is a
  // genuine conflict (a plan that is not open, say) and is reported as-is, never re-POSTed.
  if (!isNotPending(refusal)) throw refusal;

  let s: InterviewState;
  try {
    s = await getInterviewState(token, { runId: a.runId, scope: a.scope, planId: a.planId });
  } catch {
    throw refusal; // cannot tell delivered from dropped — keep the runtime's own word for it
  }

  if (s.pendingPark) {
    if (s.pendingPark.parkIndex > a.parkIndex) return; // the park moved PAST ours ⇒ delivered
    if (s.pendingPark.parkIndex < a.parkIndex) throw refusal; // a different/restarted run
    // Same park, still open: nothing landed. This is the ONE path that retries.
    const retry = await postAnswer(token, a);
    if (retry.status === 200) return;
    throw errorFrom(retry.status, await bodyOf(retry));
  }

  // No open park. Only a COMPLETE-class end proves the run consumed its answers; a cancelled,
  // expired or otherwise ended run proves the opposite, and a park-less running run proves
  // nothing at all.
  //
  // THE OUTCOME IS READ OFF THE TERMINAL OBJECT, NEVER OFF `chip` [cross-model review B-1].
  // `chip` is DERIVED: with no terminal in hand `deriveChip` falls back to the engine status,
  // and a CANCELLED interview run's engine status is deterministically "completed" — while the
  // terminal chunk is exactly what `/state`'s 800ms bounded marker replay drops first. A
  // chip-based test therefore reads a DROPPED terminal as proof of delivery, which is the same
  // "absence is evidence" mistake this whole function exists to stop, one branch over. Only a
  // terminal the read actually SAW may count; everything else falls through to the refusal.
  const outcome = s.terminal?.outcome;
  if (outcome === "firm_created" || outcome === "interview_complete"
      || outcome === "complete" || outcome === "completed") return;
  throw refusal;
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
