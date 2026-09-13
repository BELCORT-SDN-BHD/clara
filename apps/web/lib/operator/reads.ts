// THE OPERATOR SUPPORT DESTINATION'S READ SEAM (#615, refresh spec #612 journey D3) — the wire
// contract for `clara.list_operator_support_queue` / `clara.get_operator_support_case`
// (packages/db/migrations/0188_operator_support_console.sql), the destination's URL-state model
// (`?kind=&settled=&case=<kind>:<id>`), and the two pure judgements the surface is built on: WHICH
// state a read outcome is, and WHICH act (if any) the estate actually supports for a case.
//
// GROUNDING, at the LIVE bodies (apps/web/AGENTS.md: "a migration citation must chase the LIVE
// body"), 0188 §1-§3:
//   clara.list_operator_support_queue(p_include_settled boolean default false)
//     -> SETOF the twenty columns `SupportQueueRow` names below, ordered `(occurred_at desc,
//        case_id desc)`. Over PostgREST a `returns table` RPC answers a JSON ARRAY, so `callDoor`
//        resolves `SupportQueueRow[]` — the same shape `lib/coding/reads.ts` already relies on for
//        `list_uncoded_filings`.
//   clara.get_operator_support_case(p_kind text, p_id text)
//     -> jsonb: every queue field for that arm PLUS the arm's own detail (`note`, `intent_id`,
//        `stripe_session_id`, `stripe_event_id`, `event_type`, `payment_status`, `livemode`,
//        `consumed_firm_id`). NO existence oracle: an unknown id, a kind outside the closed three
//        and a mismatched pair all answer ONE CLR11 `support_case_not_found`, byte-identical, so
//        this module never tries to tell them apart either. `p_id` is TEXT, not uuid (0181:468-474
//        took the same decision for `get_activity_event`): a detail door is reached from a
//        hand-edited deep link, and a uuid-typed parameter answers such a value with a raw
//        PostgREST 400 `22P02` before the body runs — a database error code in a banner instead of
//        the one not-found face. A NON-UUID id is a case that does not exist, and says so.
//
// AUTHORITY IS THE DB'S, NOT THIS FILE'S. Both doors carry
// `clara.approve_firm_registration`'s own owner+operator-firm predicate, re-derived at call time
// (0145 §D, 0188 §2/§3). `lib/registration/doors.ts`'s `isOperatorConsoleEligible` — which the
// navigation registry and this destination's own gate both read — is an AFFORDANCE that mirrors
// it, never the wall: a caller who types `/operator` still meets CLR04.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO. It computes no totals, resolves no display names
// (`clara.users_visible` requires the target share the CALLER's firm, and an applicant has no
// membership anywhere — `lib/registration/doors.ts`'s own header records that measured gap), and
// invents no recovery act. `supportedActionFor` returns "none" for every state the estate has no
// governed writer for, and the UI says so in those words rather than offering a control that would
// refuse.

import { callDoor, isDoorError, isDoorRefusal } from "@/lib/doors";
import { isUuidShape } from "@/lib/client-id";
import type { SessionTokenAccessor } from "@/lib/session";

// ── the closed case vocabulary ────────────────────────────────────────────────

export const SUPPORT_CASE_KINDS = ["registration", "payment", "problem"] as const;
export type SupportCaseKind = (typeof SUPPORT_CASE_KINDS)[number];

export function isSupportCaseKind(value: string): value is SupportCaseKind {
  return (SUPPORT_CASE_KINDS as readonly string[]).includes(value);
}

/** One row of `clara.list_operator_support_queue`, copied column-for-column from 0188 §2's own
 *  `returns table` declaration. Every field the door can leave null is typed nullable here rather
 *  than defaulted: a support case with no checkout intent is a real, ordinary case (a registration
 *  that never reached checkout), and painting a default over it would be this build inventing a
 *  state the database never reported. */
export type SupportQueueRow = {
  case_kind: SupportCaseKind;
  case_id: string;
  occurred_at: string;
  registration_id: string | null;
  applicant: string | null;
  firm_name: string | null;
  request_status: string | null;
  firm_id: string | null;
  intent_status: string | null;
  intent_status_at: string | null;
  intent_status_reason: string | null;
  payment_recorded_at: string | null;
  payment_consumed_at: string | null;
  problem_kind: string | null;
  problem_noticed_at: string | null;
  problem_detail: Record<string, unknown> | null;
  decided_by: string | null;
  decided_at: string | null;
  decided_reason: string | null;
  settled: boolean;
};

/** `clara.get_operator_support_case`'s answer: the queue row plus the arm's own detail. */
export type SupportCaseDetail = SupportQueueRow & {
  note: string | null;
  intent_id: string | null;
  stripe_session_id: string | null;
  stripe_event_id: string | null;
  event_type: string | null;
  payment_status?: string | null;
  livemode?: boolean | null;
  consumed_firm_id?: string | null;
};

export type OperatorReadOptions = {
  session?: SessionTokenAccessor;
  signal?: AbortSignal;
};

/** The estate's open support cases, newest first — the door's own order, never re-sorted here. */
export async function listOperatorSupportQueue(
  { includeSettled = false }: { includeSettled?: boolean } = {},
  opts: OperatorReadOptions = {},
): Promise<SupportQueueRow[]> {
  const rows = await callDoor<SupportQueueRow[] | null>(
    "list_operator_support_queue",
    { p_include_settled: includeSettled },
    { session: opts.session, signal: opts.signal },
  );
  // Hydrate-never-trust's own honesty rule (this repo's AGENTS.md): a malformed envelope is
  // reported as an EMPTY LIST rather than a caller crashing on `.map`. A REFUSAL never reaches
  // here at all — `callDoor` throws it, and `operatorQueueOutcome` below is what keeps a thrown
  // refusal from being rendered as an empty queue.
  return Array.isArray(rows) ? rows : [];
}

/** One case, addressed by the OPAQUE (kind, id) pair a queue row — or the `?case=` URL param —
 *  already carries. A kind outside the closed three, an absent id and a mismatched pair are
 *  indistinguishable CLR11 refusals at the door; this module does not attempt to tell them apart. */
export function getOperatorSupportCase(
  kind: SupportCaseKind,
  id: string,
  opts: OperatorReadOptions = {},
): Promise<SupportCaseDetail> {
  return callDoor<SupportCaseDetail>(
    "get_operator_support_case",
    { p_kind: kind, p_id: id },
    { session: opts.session, signal: opts.signal },
  );
}

// ── the `?case=` param: <kind>:<id>, split on the FIRST colon ────────────────

export function formatCaseParam(kind: SupportCaseKind, id: string): string {
  return `${kind}:${id}`;
}

/** `null` for an absent, empty, unrecognised-kind or non-uuid param — never a thrown error: a stale
 *  or hand-edited URL is a "no case open" state, not a page crash.
 *
 *  THE ID IS SHAPE-CHECKED, and it is defence in depth rather than the wall.
 *  `clara.get_operator_support_case` takes `p_id text` and answers the SAME
 *  `support_case_not_found` for a non-uuid (0188 §3), so nothing breaks if a malformed id reaches
 *  it. What this buys is that a hand-edited `?case=problem:xyz` costs no round trip and cannot be
 *  the thing that renders a database error code in a banner — exactly the posture
 *  `parseActivityUrlState` takes for `?client=` via the same `isUuidShape` predicate. The nil uuid
 *  passes: it is syntactically a uuid that simply names no case, and the door says so. */
export function parseCaseParam(raw: string | null | undefined): { kind: SupportCaseKind; id: string } | null {
  if (!raw) return null;
  const i = raw.indexOf(":");
  if (i < 1 || i === raw.length - 1) return null;
  const kind = raw.slice(0, i);
  const id = raw.slice(i + 1);
  if (!isSupportCaseKind(kind)) return null;
  if (!isUuidShape(id)) return null;
  return { kind, id };
}

// ── the URL-state model ──────────────────────────────────────────────────────

export type OperatorUrlState = {
  /** Narrow the queue to one arm, or `null` for all three. */
  kind: SupportCaseKind | null;
  /** Include decided/consumed/resolved cases — the receipts view. */
  settled: boolean;
  /** The case whose detail Sheet is open, or `null`. */
  caseRef: { kind: SupportCaseKind; id: string } | null;
};

/** Parse the destination's THREE query params off a `URLSearchParams` (or any string-keyed reader
 *  with a compatible `.get`). Every field degrades to its empty default on a malformed value
 *  rather than throwing — the URL is user-editable input, not a trusted wire contract. */
export function parseOperatorUrlState(params: Pick<URLSearchParams, "get">): OperatorUrlState {
  const rawKind = params.get("kind");
  const settled = params.get("settled");
  return {
    kind: rawKind && isSupportCaseKind(rawKind) ? rawKind : null,
    settled: settled === "1" || settled === "true",
    caseRef: parseCaseParam(params.get("case")),
  };
}

/** The inverse, folded onto an existing `URLSearchParams` so a caller updating ONE field — say,
 *  opening the Sheet — keeps every other param untouched. An empty/absent field DELETES its key
 *  rather than writing `""`, so the URL never accumulates dead `?kind=&settled=` noise. Returns a
 *  NEW `URLSearchParams`; the input is not mutated. */
export function applyOperatorUrlState(
  base: URLSearchParams,
  patch: Partial<OperatorUrlState>,
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  const setOrDelete = (key: string, value: string | null) => {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  };
  if ("kind" in patch) setOrDelete("kind", patch.kind ?? null);
  if ("settled" in patch) setOrDelete("settled", patch.settled ? "1" : null);
  if ("caseRef" in patch) {
    setOrDelete("case", patch.caseRef ? formatCaseParam(patch.caseRef.kind, patch.caseRef.id) : null);
  }
  return next;
}

// ── permission-shaped failures ───────────────────────────────────────────────

/** A refusal that means "you may not have this", as opposed to "this did not work". The SAME rule
 *  `components/firm/activity/use-activity-feed.ts` applies to the Activity feed, restated here
 *  rather than imported because that module is `"use client"` and this one is isomorphic — the
 *  rule itself (CLR04, or a 401/403/no-session transport kind) is the shared thing, and
 *  `lib/operator/reads.test.ts` pins all four spellings. */
export function isPermissionShaped(error: unknown): boolean {
  if (isDoorRefusal(error)) return error.code === "CLR04";
  if (isDoorError(error)) {
    return error.kind === "forbidden" || error.kind === "no_session" || error.kind === "unauthenticated";
  }
  return false;
}

// ── THE FOUR (plus two) DISTINCT READ STATES ─────────────────────────────────
//
// Spec appendix C §3, the "Empty" row: "Actual read outcome, not caught error mapped to an empty
// array." That sentence is the whole reason this function exists as a pure, separately-tested
// judgement rather than a chain of `if (err)` branches inside a component: a REFUSAL and an EMPTY
// QUEUE are the two answers an operator must never see conflated, because one means "there is
// nothing to do" and the other means "you were not allowed to ask".

export type OperatorQueueOutcome =
  /** The FIRST read, still in flight: no rows and no error yet. */
  | { kind: "loading" }
  /** The read was REFUSED as a permission loss. Rows are cleared — a denied target never shows
   *  stale data — and the surface explains the access state. */
  | { kind: "denied"; error: unknown }
  /** The FIRST read failed outright for an ordinary reason. Distinct from "stale" (there is no
   *  prior answer to call stale) and from "empty" (a read that did not answer proves nothing
   *  about whether the estate has cases). */
  | { kind: "failedFirstRead"; error: unknown }
  /** A LATER read failed for an ordinary reason: the prior rows are still the ones on screen, and
   *  they are labelled as possibly out of date rather than silently trusted. */
  | { kind: "stale"; rows: SupportQueueRow[]; error: unknown }
  /** A read that SUCCEEDED and returned nothing. `filtered` distinguishes first-use emptiness
   *  from "no results under these filters", which are different sentences and different offers. */
  | { kind: "empty"; filtered: boolean }
  | { kind: "ready"; rows: SupportQueueRow[] };

export type OperatorQueueInput = {
  /** `null` until a read has SUCCEEDED at least once. An empty array is a real answer. */
  rows: SupportQueueRow[] | null;
  /** The last read's failure, or `null`. */
  error: unknown;
  /** Whether any filter (arm, or the settled view) is active. */
  filtered: boolean;
};

/** `refreshing` is deliberately NOT an input here. "A later read is in flight" is a decoration on
 *  top of whichever of these six states is already true — the prior rows stay, labelled — while
 *  "no read has ever succeeded" is a state of its own. Folding the two into one enum is how a
 *  surface ends up flashing a skeleton over data it already has. */
export function operatorQueueOutcome(input: OperatorQueueInput): OperatorQueueOutcome {
  const { rows, error, filtered } = input;
  const failed = error !== null && error !== undefined;
  // ORDER IS THE CONTRACT. A permission loss wins over everything, INCLUDING a prior successful
  // page: denied targets never leak data the caller may no longer have.
  if (failed && isPermissionShaped(error)) return { kind: "denied", error };
  if (failed) {
    // A failure with NO prior answer is not "stale" — there is nothing to be stale.
    if (rows === null) return { kind: "failedFirstRead", error };
    return { kind: "stale", rows, error };
  }
  if (rows === null) return { kind: "loading" };
  if (rows.length === 0) return { kind: "empty", filtered };
  return { kind: "ready", rows };
}

// ── WHAT AN ACT'S FAILURE MEANS ──────────────────────────────────────────────
//
// Spec appendix C §3 again: "Empty queue, stale event, provider unavailable, unsupported action
// and duplicate operation remain distinct and offer only the permitted next step" (#615 AC3). The
// first and the fourth are read/shape states, above and below; the other three are what a governed
// act can come back as, and they are told apart HERE, by code and detail.reason, never by message
// text (AGENTS.md: "spelling is not identity").

export type SupportActFailure =
  /** The caller may not do this — or may no longer. */
  | { kind: "denied"; code: string | null; reason: string | null }
  /** The SAME operation identity was already used for DIFFERENT arguments, or is still in flight.
   *  `clara._reserve_op`'s own answers (CLR10 op-key reuse, CLR13 operation_in_flight). */
  | { kind: "duplicate"; code: string | null; reason: string | null }
  /** The entity moved under the caller: the request is no longer open, the problem is already
   *  resolved (CLR09). The surface re-reads rather than offering the same act again. */
  | { kind: "stale"; code: string | null; reason: string | null }
  /** The case vanished, or never was — CLR11, the no-oracle answer. */
  | { kind: "notFound"; code: string | null; reason: string | null }
  /** Nothing governed refused: the transport, the gateway or the provider is unavailable. This is
   *  the ONE failure a retry of the SAME operation identity is the right answer to. */
  | { kind: "providerUnavailable"; code: string | null; reason: string | null }
  /** Any other governed refusal — rendered with the DB's own code and message, never re-worded. */
  | { kind: "refused"; code: string | null; reason: string | null };

export function classifySupportFailure(error: unknown): SupportActFailure {
  if (isDoorRefusal(error)) {
    const code = error.code ?? null;
    const reason = error.reason ?? null;
    if (code === "CLR04") return { kind: "denied", code, reason };
    if (code === "CLR13") return { kind: "duplicate", code, reason };
    if (code === "CLR09") return { kind: "stale", code, reason };
    if (code === "CLR11") return { kind: "notFound", code, reason };
    // `clara._reserve_op`'s "op_key reused with different args" is an UNTYPED CLR10 at 0160's
    // resolve door (0004:57 raises it bare) and a detail-carrying one at 0186's capacity door
    // (`op_key_conflict`). Both mean the same thing to a person — this operation identity is
    // already spoken for — so both land on `duplicate`; every other CLR10 is an ordinary refusal.
    if (code === "CLR10" && (reason === "op_key_conflict" || reason === null)) {
      return { kind: "duplicate", code, reason };
    }
    return { kind: "refused", code, reason };
  }
  if (isDoorError(error)) {
    const code = error.kind;
    if (code === "forbidden" || code === "unauthenticated" || code === "no_session") {
      return { kind: "denied", code, reason: null };
    }
    if (code === "transport" || code === "server_error" || code === "not_found") {
      return { kind: "providerUnavailable", code, reason: null };
    }
    return { kind: "refused", code, reason: null };
  }
  return { kind: "providerUnavailable", code: null, reason: null };
}

// ── THE PERMITTED NEXT STEP ──────────────────────────────────────────────────
//
// #615's scope decision, stated in code rather than only in a comment: the console exposes EXACTLY
// the acts the estate already governs. There is no recovery writer for an unconsumed payment (the
// applicant's own `clara.claim_paid_firm` is the only door that consumes one) and none for a
// settled case, so those answer "none" and the surface says "no supported action for this state"
// instead of offering a button the database would refuse.

export type SupportAction = "decide" | "resolve" | "none";

export function supportedActionFor(row: Pick<SupportQueueRow, "case_kind" | "request_status" | "settled">): SupportAction {
  if (row.settled) return "none";
  if (row.case_kind === "registration") return row.request_status === "open" ? "decide" : "none";
  if (row.case_kind === "problem") return "resolve";
  return "none"; // payment — the applicant claims it; the estate has no operator-side writer
}

/** The ONE state sentence a case carries, as a message-key suffix under the `Operator` namespace.
 *  Derived from the DB's own fields, never from a label: a future arm or a new intent status shows
 *  up as `unknown` rather than being silently absorbed into a neighbouring state. */
export type SupportCaseState =
  | "awaitingDecision" | "decided"
  | "awaitingClaim" | "claimed"
  | "providerProblem" | "problemResolved"
  | "unknown";

export function supportCaseState(row: Pick<SupportQueueRow, "case_kind" | "request_status" | "settled">): SupportCaseState {
  switch (row.case_kind) {
    case "registration":
      return row.settled ? "decided" : "awaitingDecision";
    case "payment":
      return row.settled ? "claimed" : "awaitingClaim";
    case "problem":
      return row.settled ? "problemResolved" : "providerProblem";
    default:
      return "unknown";
  }
}
