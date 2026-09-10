// #629 — THE SHARED WORK QUESTION, AS THE WEB READS AND ANSWERS IT.
//
// ONE RECORD, THREE SURFACES. B3 (the Work detail), B4 (Needs-you) and B6 (the Clara rail) all
// read `clara.get_work_question` / `clara.get_work_pending_question` and all post to
// `clara.answer_work_question`. There is deliberately no per-surface shape here: the acceptance
// line is "render the same pending and settled record on B3/B4/B6 rather than creating
// surface-specific questions", and a second projection is how two surfaces come to disagree about
// which version is current.
//
// WHY READ RPCs AND NOT `getRows`. `lib/work/reads.ts` states the estate's default correctly —
// migration 0178 grants `clara_authenticated` a firm-scoped SELECT on `clara.accounting_work`, so
// a plain filtered GET is the whole authority story there. It is NOT the whole story here, for two
// measured reasons: `clara.agent_interruptions` carries no client column a PostgREST filter could
// scope by (its human policy is firm-wide), and the record every surface needs includes the WORK's
// own status, which lives in a relation the human role cannot join to in one request. One door
// returning one record is what makes "the same record on three surfaces" mechanical rather than
// three transcriptions that drift.
//
// THE OP KEY IS STABLE PER (question, version, draft), AND THAT IS THE WHOLE LOST-RESPONSE STORY.
// `clara.answer_work_question` reserves before it acts (`_reserve_op`), so the SAME key with the
// SAME payload REPLAYS the original receipt and the same key with a DIFFERENT payload is refused
// `op_key_conflict`. A random key per submit would turn a retry after a lost acknowledgement into a
// SECOND answer attempt — which the first-answer gate would then refuse as `already_answered`,
// telling the person their own answer beat them. A key derived from the draft turns it into a
// replay, which is what actually happened.

import { callDoor } from "@/lib/doors";
import { isUuidShape } from "@/lib/client-id";
import { RefusalError } from "@/lib/wire";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** The five field kinds `clara._assert_work_question_fields` admits, and the same five
 *  `claraWork.v2.tools.ts` lets a model declare. */
export const WORK_FIELD_KINDS = ["text", "money", "date", "choice", "account"] as const;
export type WorkFieldKind = (typeof WORK_FIELD_KINDS)[number];

export type WorkQuestionOption = { value: string; label: string };

/** ONE typed field of a question. `required` is OPTIONAL ON THE WIRE and defaults to TRUE — the
 *  database's own default — so a field that omits it is required, never optional-by-absence. */
export type WorkQuestionField = {
  key: string;
  label: string;
  kind: WorkFieldKind | string;
  required?: boolean;
  options?: WorkQuestionOption[];
  unit?: string;
};

/** The record `clara.get_work_question` returns. Transcribed field for field from migration 0180's
 *  `clara._work_question_record`; nothing is added, renamed or widened to make a card nicer. */
export type WorkQuestionRecord = {
  question_id: string;
  work_id: string;
  client_id: string;
  task_id: string;
  firm_id: string;
  question_version: number;
  status: "pending" | "answered" | "expired" | "cancelled" | string;
  question: string | null;
  context: string | null;
  reason: string | null;
  fields: WorkQuestionField[];
  source_ref: Record<string, unknown> | null;
  basis_digest: string | null;
  expires_at: string | null;
  created_at: string;
  answer: Record<string, unknown> | null;
  answered_by: string | null;
  answered_at: string | null;
  answered_role: string | null;
  delivery_state: string;
  delivery_attempts: number;
  work_status: string;
  work_basis_digest: string | null;
};

/** The value a human typed for one field, before it is sent. `null` means "left blank", which is
 *  legal for an optional field and refused for a required one — by the DATABASE, which is the
 *  authority on its own question. */
export type WorkAnswerValue = string | number | null;
export type WorkAnswerDraft = Record<string, WorkAnswerValue>;

/**
 * WHAT A SUBMIT CAN COME BACK AS. Four kinds, and each one is a DIFFERENT next action for the
 * person in front of the form — which is why they are not collapsed into "error":
 *
 *   invalid   — the values are wrong for this question. The field is named, so the form focuses
 *               it. The draft is kept, obviously: it is what needs correcting.
 *   converge  — the question moved on without this person (answered elsewhere, a newer version,
 *               expired, cancelled, the Work's basis or state changed). The form re-reads the
 *               authoritative record and shows it; the draft is KEPT VISIBLE as a note, because a
 *               still-useful draft is exactly what the interaction contract refuses to throw away.
 *   denied    — the caller may no longer act (an inactive client, a lost role). Read-only.
 *   failed    — transport. Nothing is known about whether the answer landed, so the next attempt
 *               must REPLAY the same op key rather than answer twice.
 */
export type AnswerRefusal =
  | { kind: "invalid"; field: string | null; constraint: string | null; message: string }
  | { kind: "converge"; reason: string; current: Record<string, unknown> | null; message: string }
  | { kind: "denied"; reason: string | null; message: string }
  | { kind: "failed"; message: string };

export type AnswerAccepted = {
  question_id: string;
  work_id: string;
  question_version: number;
  status: "answered";
  answered_by: string | null;
  answered_role: string | null;
  answered_at: string | null;
};

export type AnswerOutcome = { ok: true; receipt: AnswerAccepted } | { ok: false; refusal: AnswerRefusal };

/** The CLR13 reasons that mean "the question moved on without you". Spelled as data so the mapper
 *  and the copy layer read one list, and an unknown CLR13 still converges rather than falling
 *  through to a generic failure — a refusal this build has not met is still a refusal. */
export const CONVERGE_REASONS = [
  "already_answered",
  "stale_question",
  "expired",
  "cancelled",
  "basis_changed",
  "state_changed",
  "operation_in_flight",
] as const;

export function isConvergeReason(reason: string | null): boolean {
  return reason !== null && (CONVERGE_REASONS as readonly string[]).includes(reason);
}

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

/** ONE question by id. `null` means the database admitted no such question to this caller — an
 *  unknown id, another firm's, or a chat clarify. The door does not distinguish, and neither does
 *  this: an existence oracle is what it refuses to be. */
export async function getWorkQuestion(questionId: string, opts: Opts = {}): Promise<WorkQuestionRecord | null> {
  if (!isUuidShape(questionId)) return null;
  const out = await callDoor<WorkQuestionRecord | null>("get_work_question", { p_question: questionId }, opts);
  return out ?? null;
}

/** The question a Work is CURRENTLY parked on, or null. This is B3's read: the page knows the Work
 *  and does not know the question until it asks. */
export async function getPendingWorkQuestion(workId: string, opts: Opts = {}): Promise<WorkQuestionRecord | null> {
  if (!isUuidShape(workId)) return null;
  const out = await callDoor<WorkQuestionRecord | null>("get_work_pending_question", { p_work: workId }, opts);
  return out ?? null;
}

// ---------------------------------------------------------------------------
// The op key.
// ---------------------------------------------------------------------------

/**
 * A STABLE operation key for (question, version, draft).
 *
 * DERIVED FROM THE DRAFT'S OWN CONTENT, canonicalised by sorted keys, so:
 *   · pressing Submit twice, or retrying after a lost response, sends the SAME key with the SAME
 *     payload — which the database REPLAYS, returning the original receipt;
 *   · editing a value and submitting again sends a DIFFERENT key, which is a genuinely different
 *     intent and gets its own reservation, not an `op_key_conflict`;
 *   · answering a re-asked question (a new version) can never collide with the old one's key.
 *
 * A NON-CRYPTOGRAPHIC HASH IS THE RIGHT TOOL HERE and the reason is worth stating rather than
 * assuming: this key is not a secret and not a capability — the door authenticates the caller
 * independently and scopes the reservation to their firm. What it must be is DETERMINISTIC for the
 * same input and DIFFERENT for a different one, and a 64-bit FNV-1a over canonical text is that,
 * without pulling `crypto.subtle` (async, and unavailable in the jsdom test environment) into a
 * pure function every render calls.
 */
export function answerOpKey(questionId: string, version: number, draft: WorkAnswerDraft): string {
  const canonical = JSON.stringify(
    Object.keys(draft)
      .sort()
      .map((k) => [k, draft[k] ?? null]),
  );
  // FNV-1a, 64-bit, in two 32-bit halves (JS bitwise ops are 32-bit).
  let hi = 0x811c9dc5;
  let lo = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    const c = canonical.charCodeAt(i);
    lo = Math.imul(lo ^ (c & 0xff), 0x01000193) >>> 0;
    hi = Math.imul(hi ^ ((c >>> 8) & 0xff) ^ lo, 0x01000193) >>> 0;
  }
  const digest = `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
  return `wq:${questionId}:${version}:${digest}`;
}

// ---------------------------------------------------------------------------
// The write.
// ---------------------------------------------------------------------------

/**
 * Answer one question. NEVER THROWS a refusal: every outcome is a value, because all four of them
 * are things this form has to RENDER rather than escalate. A thrown abort still propagates
 * (`AbortError` is not a refusal and a cancelled read must not paint one).
 *
 * THE OP KEY IS THE CALLER'S, not minted here, and that is deliberate: the caller holds the draft
 * across a re-render and a retry, so the caller is the only thing that can keep the key stable
 * across them. `answerOpKey` above is the derivation every caller should use.
 */
export async function answerWorkQuestion(
  questionId: string,
  version: number,
  answer: Record<string, unknown>,
  opKey: string,
  opts: Opts = {},
): Promise<AnswerOutcome> {
  try {
    const receipt = await callDoor<AnswerAccepted>(
      "answer_work_question",
      { p_question: questionId, p_question_version: version, p_answer: answer, p_op_key: opKey },
      opts,
    );
    return { ok: true, receipt };
  } catch (e) {
    if (e instanceof RefusalError) return { ok: false, refusal: mapAnswerRefusal(e) };
    if (isAbort(e)) throw e;
    return { ok: false, refusal: { kind: "failed", message: messageOf(e) } };
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * The refusal → outcome mapping, PURE and exported so the unit cell drives the real mapper rather
 * than a copy of it.
 *
 * THE PAIR IS THE KEY, NEVER THE CODE ALONE. CLR10 is "malformed request" for the whole estate, so
 * `invalid_answer` (a value the person can fix) and `op_key_conflict` (a key this browser already
 * spent on a different draft) both arrive as CLR10 and mean completely different things to the
 * person in front of the form. The F-A2 pair-classifier lesson, applied.
 */
export function mapAnswerRefusal(e: RefusalError): AnswerRefusal {
  const detail = e.detail ?? {};
  const reason = e.reason;
  if (e.code === "CLR10" && reason === "invalid_answer") {
    return {
      kind: "invalid",
      field: typeof detail.field === "string" ? detail.field : null,
      constraint: typeof detail.constraint === "string" ? detail.constraint : null,
      message: e.message,
    };
  }
  if (e.code === "CLR10" && reason === "op_key_conflict") {
    // The SAME key with a DIFFERENT payload. Not a converge — nothing about the question moved —
    // and not a validation error either: this browser already spent this key on another draft. It
    // is handled as `invalid` with no field, so the form keeps the draft and lets the person
    // submit again (a changed draft mints a new key, which is the fix).
    return { kind: "invalid", field: null, constraint: "op_key_conflict", message: e.message };
  }
  if (e.code === "CLR13") {
    return {
      kind: "converge",
      reason: reason ?? "state_changed",
      current: detail.current !== undefined && detail.current !== null && typeof detail.current === "object"
        ? (detail.current as Record<string, unknown>)
        : null,
      message: e.message,
    };
  }
  if (e.code === "CLR04" || e.code === "CLR11") {
    // CLR11 is the door's no-oracle answer for "not yours / not found" and CLR04 is its authority
    // refusal. Both leave this caller unable to act, and neither may be rendered as a validation
    // problem the person could fix by typing something else.
    return { kind: "denied", reason, message: e.message };
  }
  return { kind: "failed", message: e.message };
}

// ---------------------------------------------------------------------------
// Draft persistence.
// ---------------------------------------------------------------------------

/**
 * The localStorage key a draft is preserved under: (user, firm, client, question, version).
 *
 * ALL FIVE, AND EACH ONE IS LOAD-BEARING. The interaction contract says a draft is preserved "under
 * the same user/firm/client/object/question version" and that a scope change NEVER transfers one
 * into a different client. A key missing the user would hand one person's half-typed answer to the
 * next person on a shared machine; one missing the version would offer a draft written for a
 * question that has since been re-asked.
 */
export function workAnswerDraftKey(scope: {
  userId: string;
  firmId: string;
  clientId: string;
  questionId: string;
  version: number;
}): string {
  return `clara.wq.draft.${scope.userId}.${scope.firmId}.${scope.clientId}.${scope.questionId}.${scope.version}`;
}

/** Read a preserved draft. Every access is wrapped: a private window, cleared site data or a
 *  browser configured to block storage all THROW on access, and a form that cannot remember a
 *  draft must still render. */
export function readWorkAnswerDraft(key: string): WorkAnswerDraft | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as WorkAnswerDraft)
      : null;
  } catch {
    return null;
  }
}

export function writeWorkAnswerDraft(key: string, draft: WorkAnswerDraft): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(draft));
  } catch {
    /* storage is unavailable — the draft lives in component state for this visit */
  }
}

export function clearWorkAnswerDraft(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* nothing to do — see above */
  }
}
