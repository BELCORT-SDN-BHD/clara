// @frozen
//
// FROZEN — the PURE interview core shared by firmInterview_v1 + clientOnboarding_v1
// (Wave B, B-II / FORK-8). NO "workflow"/"use step" import: this module is closure-
// testable with zero WDK engine (the s6-closure-logic / wave-a-autodraft pattern). It
// holds the salvaged validators (BELCORT firm-bootstrap 11-Q + client-onboarding 13-Q),
// the answer classifier + echo-back gate, the plan-item builders (AMB-11 opening item
// keys, FORK-3 must-asks as plan items, FORK-7 non-straight-line todo), the DETERMINISTIC
// hook-token format (a runId-scoped token the answer route can reconstruct — the "typed
// sibling lane" replacing open_interruption, whose agent_tasks row is unavailable to a
// non-chat/non-wake kind), and the segment interaction driver askAndConfirmSegment.
//
// P19 (never-store-flawed-data): a value is validated BEFORE any echo, echo-confirmed
// BEFORE any persist. Nothing here persists — persistence is the caller's update_onboarding_plan
// step. No secret ever appears in a question/echo/plan payload (the firm admission token
// never reaches the runtime — the dashboard holds it; see firmInterview.v1.ts).

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

export type Scope = "firm" | "client";
export type ItemKind = "must_ask" | "capture" | "todo";
export type ItemState = "pending" | "answered" | "resolved" | "deferred";

/** One onboarding_plan_items element as update_onboarding_plan consumes it. */
export type PlanItemInput = {
  item_key: string;
  item_kind: ItemKind;
  question: string | null;
  answer: unknown;
  state: ItemState;
  required_for_commit: boolean;
};

/** A validator verdict — either a normalized value + a human echo, or a refusal reason. */
export type Validation =
  | { ok: true; value: unknown; echo: string }
  | { ok: false; reason: string };

/** A segment of the interview: one field, its prompt, and how to validate/skip it. */
export type Segment = {
  /** The stable onboarding_plan_items item_key (also the salvaged FIELD marker). */
  key: string;
  /** The human question text (the interview prompt). */
  question: string;
  /** Whether the answer blocks the commit (FORK-3 must-ask → required_for_commit). */
  requiredForCommit: boolean;
  /** Whether a "skip"/empty answer is lawful (optional fields). */
  skippable: boolean;
  /** Validate + normalize a raw answer for this segment. */
  validate: (raw: unknown, prior: Readonly<Record<string, unknown>>) => Validation;
  /** The plan item(s) a confirmed answer produces (default: one capture/must_ask item). */
  toItems?: (value: unknown, seg: Segment) => PlanItemInput[];
};

/** The resolution a park delivers (from resumeHook via the answer/cancel route). */
export type Resolution =
  | { kind: "answer"; value: unknown; answeredBy: string }
  | { kind: "cancelled" }
  | { kind: "expired" };

/** The outcome of one fully-driven segment (question → validate → echo → confirm). `echo` on
 *  an answered result is the SANITIZED human echo the validator produced (e.g. "SSM 202401…",
 *  "email bk@acme.my") — never the raw submission, never a secret — so the workflow can stream it
 *  as an interview_activity chunk (the /state activity[] surface; see interviewRoutes). */
export type SegmentResult =
  | { outcome: "answered"; value: unknown; answeredBy: string; items: PlanItemInput[]; echo: string }
  | { outcome: "skipped" }
  | { outcome: "cancelled" }
  | { outcome: "expired" };

/** What a park prompt carries to the client (streamed; the token is NEVER included).
 *  `expects` (firm commit park only) tags a prompt whose delivered answer the route must
 *  rebuild as a create_firm receipt {firmId, planId} — the raw value never reaches the hook
 *  (F7/F8; see interviewRoutes buildFirmReceipt). `op_key` (firm commit park only) is the STABLE
 *  create_firm idempotency key surfaced as a TYPED field (F5) so the dashboard reads it without
 *  parsing the human question prose — the prose stays human; the token/secret is never streamed. */
export type Prompt = { seg: string; phase: "q" | "c"; question: string; expects?: string; op_key?: string };

/** The FIRST streamed chunk of every interview run — the binding marker the answer/cancel +
 *  /state routes check BEFORE resuming a hook or reading a prompt stream (F1). A firm run
 *  binds to its pre-firm principal (`principalUserId`); a client run binds to its plan
 *  (`planId`), which additionally carries the durable 'interview_run' item (interviewRunBinding). */
export type OwnerMarker = {
  type: "interview_owner";
  scope: Scope;
  principalUserId?: string;
  planId?: string;
};

/** True iff a firm-run owner marker binds to `sub` (the caller's authenticated principal).
 *  Fail-closed: a missing/malformed marker or a mismatch is false (the route then 404s). */
export function firmOwnerMatches(owner: OwnerMarker | null | undefined, sub: string): boolean {
  return (
    !!owner &&
    owner.type === "interview_owner" &&
    owner.scope === "firm" &&
    typeof owner.principalUserId === "string" &&
    owner.principalUserId.length > 0 &&
    owner.principalUserId === sub
  );
}

/** The run id bound in a client plan's durable 'interview_run' capture item, or null when the
 *  plan carries no binding. Accepts both the snake-cased route row (`item_key`/`answer`) and the
 *  camel-cased writer snapshot (`itemKey`) so the route and the workflow share ONE decision. */
export function interviewRunBinding(items: ReadonlyArray<Record<string, unknown>>): string | null {
  for (const it of items) {
    const key = (it.item_key ?? it.itemKey) as unknown;
    if (key !== "interview_run") continue;
    const ans = it.answer as { run_id?: unknown } | null | undefined;
    const runId = ans && typeof ans === "object" ? ans.run_id : undefined;
    return typeof runId === "string" && runId.length > 0 ? runId : null;
  }
  return null;
}

/** The single primitive the driver needs: park with a prompt, get a resolution. In
 *  production `ask` streams the prompt, opens a WDK hook, and awaits it; in tests it is
 *  a scripted queue. `phase` disambiguates the question park ('q') from the echo-confirm
 *  park ('c') so the answer route can address the exact hook token. */
export type AskFn = (p: Prompt) => Promise<Resolution>;

// ---------------------------------------------------------------------------
// Deterministic hook-token format (the "typed sibling lane").
// ---------------------------------------------------------------------------

/** The hook token for a given run + monotonic park index. DETERMINISTIC (runId is an
 *  unguessable WDK uuid; parkIndex increments once per park in deterministic control
 *  flow) so the answer route reconstructs it from {scope, runId, parkIndex} without a DB
 *  metadata table (agent_interruptions is unavailable: it needs an agent_tasks row of a
 *  kind an interview cannot own). A WDK replay reproduces the same token (a pure function
 *  of stable inputs). resumeHook is a server-only call, so a derivable token leaks no
 *  resume capability to any client. */
export function hookToken(scope: Scope, runId: string, parkIndex: number): string {
  const prefix = scope === "firm" ? "fi" : "co";
  return `${prefix}:${runId}:${parkIndex}`;
}

// ---------------------------------------------------------------------------
// Validators (salvaged from BELCORT firm-bootstrap / client-onboarding SKILL.md).
// ---------------------------------------------------------------------------

const asText = (raw: unknown): string => (typeof raw === "string" ? raw : raw == null ? "" : String(raw)).trim();

/** SSM number — accepts the modern 12-digit form (202401001234-K) AND the old ROC
 *  form (1050274-A). Never rejects an old-format SSM just for not being 12 digits. */
export function validateSsm(raw: unknown): Validation {
  const s = asText(raw).toUpperCase();
  if (!s) return { ok: false, reason: "SSM number is required (e.g. 202401001234-K or 1050274-A)." };
  if (/^\d{6,12}-[A-Z0-9]{1,2}$/.test(s) || /^\d{12}$/.test(s)) return { ok: true, value: s, echo: `SSM ${s}` };
  return { ok: false, reason: "SSM must be a 12-digit number (202401001234-K) or an old ROC number (1050274-A)." };
}

/** MyInvois TIN — a lenient LHDN shape (optional 1–2 letter prefix + digits). Required
 *  only when the turnover band is not <RM1M (the caller enforces that ordering). */
export function validateTin(raw: unknown): Validation {
  const s = asText(raw).toUpperCase();
  if (!s) return { ok: false, reason: "MyInvois TIN is required for this turnover band." };
  if (/^[A-Z]{0,2}\d{6,13}$/.test(s)) return { ok: true, value: s, echo: `TIN ${s}` };
  return { ok: false, reason: "TIN must look like IG56003500070 or C2584563222 (optional 1–2 letter prefix, then digits)." };
}

export function validateEmail(raw: unknown): Validation {
  const s = asText(raw);
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return { ok: true, value: s, echo: `email ${s}` };
  return { ok: false, reason: "That does not look like an email address (name@example.com)." };
}

export function validateMsic(raw: unknown): Validation {
  const s = asText(raw);
  if (/^\d{5}$/.test(s)) return { ok: true, value: s, echo: `MSIC ${s}` };
  return { ok: false, reason: "MSIC must be a 5-digit code (e.g. 46900)." };
}

export function validateFye(raw: unknown): Validation {
  const s = asText(raw);
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return { ok: true, value: n, echo: `financial year-end month ${n}` };
  return { ok: false, reason: "Financial year-end month must be a whole number 1–12." };
}

export function validateNonEmpty(label: string) {
  return (raw: unknown): Validation => {
    const s = asText(raw);
    if (s) return { ok: true, value: s, echo: `${label} “${s}”` };
    return { ok: false, reason: `${label} cannot be empty.` };
  };
}

/** Free-text optional field — any value (incl. empty) is accepted; empty ⇒ null. */
export function validateOptionalText(label: string) {
  return (raw: unknown): Validation => {
    const s = asText(raw);
    return { ok: true, value: s || null, echo: s ? `${label} “${s}”` : `${label}: none` };
  };
}

/** An enum with Malaysian-variant synonym normalization (maps common typed forms to the
 *  canonical code BEFORE re-asking; only genuinely ambiguous input re-prompts). */
export function validateEnum(label: string, canonical: readonly string[], synonyms: Record<string, string> = {}) {
  const set = new Set(canonical);
  return (raw: unknown): Validation => {
    const s = asText(raw);
    const norm = s.toLowerCase().replace(/\s+/g, "_");
    const mapped = synonyms[norm] ?? synonyms[s.toLowerCase()] ?? (set.has(s) ? s : set.has(norm) ? norm : null);
    if (mapped && set.has(mapped)) return { ok: true, value: mapped, echo: `${label} ${mapped}` };
    return { ok: false, reason: `${label} must be one of: ${canonical.join(", ")}.` };
  };
}

export const TURNOVER_BANDS = ["<RM1M", "RM1M-5M", "RM5M-25M", "RM25M-100M", "RM100M+"] as const;
export function validateTurnover(raw: unknown): Validation {
  const s = asText(raw);
  const synonyms: Record<string, string> = {
    "below_rm1m": "<RM1M", "under_1m": "<RM1M", "<1m": "<RM1M", "less_than_1m": "<RM1M",
  };
  const norm = s.toLowerCase().replace(/\s+/g, "_");
  const mapped = synonyms[norm] ?? ((TURNOVER_BANDS as readonly string[]).includes(s) ? s : null);
  if (mapped) return { ok: true, value: mapped, echo: `turnover band ${mapped}` };
  return { ok: false, reason: `Turnover band must be one of: ${TURNOVER_BANDS.join(", ")}.` };
}

/** True iff the band exempts the firm/client from a mandatory TIN (salvaged Q8/Q4). */
export function tinExempt(turnoverBand: unknown): boolean {
  return asText(turnoverBand) === "<RM1M";
}

// ---------------------------------------------------------------------------
// The segment interaction driver (question → validate → echo → confirm).
// ---------------------------------------------------------------------------

/** Interpret a confirm ('c') answer as yes/no. Anything clearly negative re-asks. */
export function isAffirmative(raw: unknown): boolean {
  const s = asText(raw).toLowerCase();
  if (typeof raw === "boolean") return raw;
  return ["yes", "y", "confirm", "confirmed", "correct", "ok", "okay", "true", "save", "looks good"].includes(s);
}

/** Drive ONE segment to a terminal SegmentResult, parking via `ask`. Each round:
 *   1. ask the question ('q', with any prior refusal reason prefixed).
 *   2. a lawful skip on a skippable segment ends the segment 'skipped'.
 *   3. validators refuse garbage → re-ask with the reason (NO persist — P19).
 *   4. a valid value is echoed back and confirmed ('c') — the caller persists ONLY on a
 *      returned 'answered'; a "no"/"change" re-asks the question.
 *  A cancel/expire at ANY park terminates the segment cleanly (nothing persisted here). */
export async function askAndConfirmSegment(
  seg: Segment,
  ask: AskFn,
  prior: Readonly<Record<string, unknown>>,
): Promise<SegmentResult> {
  let prefix = "";
  // The loop is bounded only by human patience (the salvage law: iterate as many rounds
  // as it takes). A cancel/expire is the sole non-answer exit.
  for (;;) {
    const q = await ask({ seg: seg.key, phase: "q", question: prefix + seg.question });
    if (q.kind !== "answer") return terminal(q);
    if (seg.skippable && isSkip(q.value)) return { outcome: "skipped" };

    const v = seg.validate(q.value, prior);
    if (!v.ok) {
      prefix = `${v.reason}\n\n`; // re-ask the SAME question with the reason — persist nothing
      continue;
    }

    const c = await ask({ seg: seg.key, phase: "c", question: `I recorded: ${v.echo}. Is that correct? (yes / change)` });
    if (c.kind !== "answer") return terminal(c);
    if (!isAffirmative(c.value)) {
      prefix = ""; // "no" → re-ask the plain question
      continue;
    }
    return answered(seg, v, c);
  }
}

function isSkip(raw: unknown): boolean {
  const s = asText(raw).toLowerCase();
  return s === "skip" || s === "none" || s === "";
}

function terminal(r: Resolution): SegmentResult {
  return r.kind === "expired" ? { outcome: "expired" } : { outcome: "cancelled" };
}

function answered(seg: Segment, v: { value: unknown; echo: string }, r: Extract<Resolution, { kind: "answer" }>): SegmentResult {
  const items = seg.toItems ? seg.toItems(v.value, seg) : [defaultItem(seg, v.value)];
  return { outcome: "answered", value: v.value, answeredBy: r.answeredBy, items, echo: v.echo };
}

/** The default plan item for a confirmed answer: a captured (or must-ask) answered item. */
export function defaultItem(seg: Segment, value: unknown): PlanItemInput {
  return {
    item_key: seg.key,
    item_kind: seg.requiredForCommit ? "must_ask" : "capture",
    question: seg.question,
    answer: value ?? null,
    state: "answered",
    required_for_commit: seg.requiredForCommit,
  };
}
