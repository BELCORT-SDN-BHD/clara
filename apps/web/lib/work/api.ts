// The durable-Work RUNTIME lane — `POST /api/work/journal`, `POST
// /api/work/:id/retry`, `GET /api/work/:id`, all same-origin through
// `app/api/runtime/[...path]/route.ts`.
//
// WHY THIS IS NOT `lib/doors.ts`. Admission is not a PostgREST RPC the browser
// may call: `clara.admit_journal_work` is granted to the RUNTIME's pool role,
// and admitting Work also ENQUEUES a workflow run — a second effect PostgREST
// cannot produce. So the write goes to the runtime and the runtime calls the
// verb, exactly as a chat turn already does (lib/clara/api.ts). The READS stay
// on PostgREST under the caller's own RLS (lib/work/reads.ts): the runtime is
// the writer, the database is the reader, and neither borrows the other's job.
//
// THE PATH ARITHMETIC IS lib/clara/api.ts's, unchanged: the proxy maps
// `/api/runtime/<p…>` → `${CLARA_RUNTIME_URL}/api/<p…>`, so the browser path is
// the runtime path with `/api` REPLACED by `/api/runtime`, never with
// `/api/runtime` glued in front of it. `./api.test.ts` pins the exact strings.
//
// EVERY OUTCOME IS TYPED, AND ONE OF THEM IS THE REASON THIS MODULE EXISTS.
// `lost` is not `unavailable`. `unavailable` means the server ANSWERED and said
// it is not accepting work (503 shutting_down, a 5xx): nothing was admitted, and
// a human may retry when they like. `lost` means NO answer was observed — the
// request may have been admitted and the acknowledgement lost on the way back,
// which is the shape refresh-spec §3 ("Lost response") is written for: the
// caller must READ THE CURRENT STATE (here: re-POST the SAME `intentKey`, which
// the database resolves to the original Work) before it offers a distinct
// resubmit. Collapsing the two into one "it failed" would either strand a Work
// nobody can find, or admit a second one for the same intent.
//
// NOTHING HERE RETRIES ON ITS OWN. A retry is a decision with an identity
// attached (the same `intentKey`, or a fresh `opKey` for a new run of the same
// Work); this module reports, the composer decides. Same posture doors.ts takes
// about a refusal.

import type { SessionTokenAccessor } from "@/lib/session";

/** The wire shape `POST /api/work/journal` accepts — camelCase, because this is
 *  the RUNTIME's HTTP contract, not PostgREST's. The runtime maps it onto the
 *  snake_case jsonb `clara.accounting_work.basis` stores. */
export type JournalBasisWire = {
  postingDate: string;
  memo: string;
  currency: "MYR";
  lines: ReadonlyArray<{
    accountCode: string;
    debitCents: number;
    creditCents: number;
    description?: string;
  }>;
};

/** The 202 body, identical for admission and for retry. */
export type WorkAdmission = {
  workId: string;
  taskId: string | null;
  logicalOpId: string | null;
  status: string;
  /** The database's own word for "this intent key already named this Work" — the
   *  lost-acknowledgement resolution, never a second effect. */
  replayed: boolean;
};

export type SubmitJournalWorkResult =
  | ({ kind: "accepted" } & WorkAdmission)
  /** 400 — the runtime rejected the basis. `field`/`reason` are the DB's own
   *  typed detail, mapped onto a control by the composer, never re-worded. */
  | { kind: "invalid_basis"; field: string | null; reason: string | null }
  /** 409 — the same intent key already named a DIFFERENT payload. `workId` is
   *  present only when the response carries one; a link is never invented. */
  | { kind: "conflict"; workId: string | null }
  /** 409 — #634: the chosen SOURCE DOCUMENT already backs a posted entry. A
   *  DIFFERENT refusal from `conflict` because the next action is different: an
   *  attachment conflict opens IMPACT OR CORRECTION on the entry that already
   *  stands there, and must never be resolved by rotating the intent key and
   *  submitting again — that would be the second effect the rule exists to
   *  prevent. Both ids are present only when the response carried them. */
  | { kind: "source_conflict"; entryId: string | null; documentId: string | null }
  | { kind: "denied" }
  | { kind: "not_found" }
  /** The server answered and is not accepting: 503, or any other 5xx. */
  | { kind: "unavailable"; message: string }
  /** No answer was observed. The request may have been admitted. */
  | { kind: "lost"; message: string };

export type RetryWorkResult =
  | ({ kind: "accepted" } & WorkAdmission)
  /** 409 — the Work is not in a state a new run may be admitted from. `status`
   *  is the DB's current value, rendered verbatim beside the refusal. */
  | { kind: "not_retryable"; status: string | null }
  | { kind: "denied" }
  | { kind: "not_found" }
  | { kind: "unavailable"; message: string }
  | { kind: "lost"; message: string };

const WORK_BASE = "/api/runtime/work";

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// THE OPAQUE-REDIRECT ARM, and why it reads as DENIED here rather than as a
// transport failure. `proxy.ts` is this app's only auth gate and its matcher
// covers `/api/…`, so an expired or missing cookie session answers a 307 to
// `/login`. Followed (the fetch default) that becomes a 200 `text/html` login
// page every reader below would try to parse; `redirect: "manual"` surfaces it
// as an `opaqueredirect` (`status: 0`) instead. The session is gone — which is
// exactly what `denied` means to the composer, and it is emphatically NOT
// `lost`: the request never reached the runtime, so no Work was admitted and
// there is nothing to resolve by replaying an intent key. lib/clara/api.ts's
// `REDIRECTED` constant is the same 307 named for a human; this lane needs the
// CLASSIFICATION rather than the sentence, so it does not import the string.

async function runtimePost(
  path: string,
  token: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(path, {
    method: "POST",
    cache: "no-store",
    redirect: "manual",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/** Reads the body without ever letting a malformed one become the failure. A
 *  runtime answering 202 with unparseable bytes is still an acceptance we cannot
 *  read, so the caller sees `lost` (the request may have been admitted) rather
 *  than a parse error dressed up as a refusal. */
async function readBody(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function admissionOf(body: Record<string, unknown>): WorkAdmission | null {
  const workId = str(body.work_id);
  if (workId === null) return null;
  return {
    workId,
    taskId: str(body.task_id),
    logicalOpId: str(body.logical_op_id),
    status: str(body.status) ?? "queued",
    replayed: body.replayed === true,
  };
}

/** #634 — the OPTIONAL evidence a composer may send with an admission. At most
 *  one document per Work in this journey; `kind` is a literal because the only
 *  other source-ref kind the estate mints (`chat_task`) belongs to the frozen
 *  chat workflow, and a browser asserting one would be a client claiming
 *  provenance it does not have. */
export type JournalSourceRefWire = { kind: "document"; documentId: string };

/**
 * Admit ONE journal Work, with or without a source document.
 *
 * `intentKey` IS THE CALLER'S IDENTITY FOR THIS INTENT, minted once when the
 * draft starts and carried across every attempt at THAT draft — a resubmit of
 * the same figures resolves to the same Work (`replayed: true`), and a resubmit
 * of DIFFERENT figures under the same key is a typed 409 rather than a second
 * entry. A genuinely new intent gets a new key; see lib/work/journal-draft.ts,
 * which owns that lifecycle.
 */
export async function submitJournalWork(
  auth: SessionTokenAccessor,
  input: {
    clientId: string;
    intentKey: string;
    basis: JournalBasisWire;
    /** Omitted entirely for a documentless Work — the route reads an absent,
     *  null or empty list identically, and sending `[]` would be the same
     *  request with more bytes. */
    sourceRefs?: ReadonlyArray<JournalSourceRefWire>;
  },
  signal?: AbortSignal,
): Promise<SubmitJournalWorkResult> {
  const token = await auth.getAccessToken();
  if (!token) return { kind: "denied" };

  let res: Response;
  try {
    res = await runtimePost(`${WORK_BASE}/journal`, token, input, signal);
  } catch (err) {
    // A network failure, a timeout, an aborted socket: NO answer was observed.
    return { kind: "lost", message: (err as Error).message };
  }
  // BEFORE any status read: an opaque redirect reports `status: 0`, which is
  // none of the cases below and would fall through to the 5xx arm.
  if (res.type === "opaqueredirect") return { kind: "denied" };

  const body = (await readBody(res)) ?? {};
  if (res.status === 202) {
    const admission = admissionOf(body);
    // A 202 whose body does not name a Work is an acknowledgement we cannot
    // act on. Treated as LOST — the safe direction: the caller re-POSTs the
    // same intent key and the database answers with the row it already has.
    return admission === null ? { kind: "lost", message: "the runtime accepted the work without naming it" } : { kind: "accepted", ...admission };
  }
  if (res.status === 400) {
    return { kind: "invalid_basis", field: str(body.field), reason: str(body.reason) };
  }
  if (res.status === 401 || res.status === 403) return { kind: "denied" };
  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 409) {
    // TWO CONFLICTS, TWO NEXT ACTIONS, and the body's own `error` is what tells
    // them apart. `intent_payload_conflict` says these figures are a new intent
    // (rotate the key); `source_already_posted` says the DOCUMENT is spoken for
    // and no key rotation can change that — the human goes to the entry that
    // already stands on it. Collapsing them would offer "try again" for the one
    // case where trying again is exactly what must not happen.
    if (str(body.error) === "source_already_posted") {
      return { kind: "source_conflict", entryId: str(body.entry_id), documentId: str(body.document_id) };
    }
    return { kind: "conflict", workId: str(body.work_id) };
  }
  return {
    kind: "unavailable",
    message: str(body.error) ?? str(body.message) ?? `the runtime answered ${res.status}`,
  };
}

/**
 * A NEW run for the SAME Work — same `logical_op_id`, so a replayed commit
 * resolves the ORIGINAL receipt rather than posting a second entry.
 *
 * `opKey` is FRESH per attempt, and that is not a contradiction of the sentence
 * above. The two keys answer two different questions: `logical_op_id` (the
 * server's, unchanged) is "which economic effect is this", and `opKey` is "is
 * this button press the same one I already handled". A human pressing Retry
 * twice must not queue two runs; a human pressing Retry after a genuine failure
 * must get one.
 */
export async function retryWork(
  auth: SessionTokenAccessor,
  input: { workId: string; opKey: string },
  signal?: AbortSignal,
): Promise<RetryWorkResult> {
  const token = await auth.getAccessToken();
  if (!token) return { kind: "denied" };

  let res: Response;
  try {
    res = await runtimePost(
      `${WORK_BASE}/${encodeURIComponent(input.workId)}/retry`,
      token,
      { opKey: input.opKey },
      signal,
    );
  } catch (err) {
    return { kind: "lost", message: (err as Error).message };
  }
  if (res.type === "opaqueredirect") return { kind: "denied" };

  const body = (await readBody(res)) ?? {};
  if (res.status === 202) {
    const admission = admissionOf(body);
    return admission === null ? { kind: "lost", message: "the runtime accepted the retry without naming it" } : { kind: "accepted", ...admission };
  }
  if (res.status === 401 || res.status === 403) return { kind: "denied" };
  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 409) return { kind: "not_retryable", status: str(body.status) };
  return {
    kind: "unavailable",
    message: str(body.error) ?? str(body.message) ?? `the runtime answered ${res.status}`,
  };
}

export type WorkProbeResult =
  | { kind: "found"; workId: string; status: string; taskStatus: string | null; taskErrorCode: string | null }
  | { kind: "not_found" }
  | { kind: "denied" }
  | { kind: "unavailable"; message: string }
  | { kind: "lost"; message: string };

/**
 * `GET /api/work/:id` — the runtime's own view of one Work.
 *
 * THE WORK DETAIL PAGE DOES NOT USE THIS, and the asymmetry is deliberate rather
 * than an oversight: that page reads `clara.accounting_work` under the caller's
 * OWN RLS (lib/work/reads.ts), which is the authoritative read and needs no
 * runtime hop. This probe exists for the case a PostgREST read cannot answer —
 * a lost acknowledgement whose Work the browser has no id for yet — and for the
 * browser walk, which uses it to observe the runtime's own state without
 * asserting through the same surface it is testing.
 */
export async function probeWork(
  auth: SessionTokenAccessor,
  workId: string,
  signal?: AbortSignal,
): Promise<WorkProbeResult> {
  const token = await auth.getAccessToken();
  if (!token) return { kind: "denied" };

  let res: Response;
  try {
    res = await fetch(`${WORK_BASE}/${encodeURIComponent(workId)}`, {
      cache: "no-store",
      redirect: "manual",
      headers: { authorization: `Bearer ${token}` },
      signal,
    });
  } catch (err) {
    return { kind: "lost", message: (err as Error).message };
  }
  if (res.type === "opaqueredirect") return { kind: "denied" };

  const body = (await readBody(res)) ?? {};
  if (res.status === 200) {
    const work = (body.work ?? null) as Record<string, unknown> | null;
    const task = (body.task ?? null) as Record<string, unknown> | null;
    const id = work === null ? null : str(work.id);
    if (id === null) return { kind: "unavailable", message: "the runtime answered without a work row" };
    return {
      kind: "found",
      workId: id,
      status: str(work?.status) ?? "queued",
      taskStatus: task === null ? null : str(task.status),
      taskErrorCode: task === null ? null : str(task.error_code),
    };
  }
  if (res.status === 401 || res.status === 403) return { kind: "denied" };
  if (res.status === 404) return { kind: "not_found" };
  return { kind: "unavailable", message: str(body.error) ?? `the runtime answered ${res.status}` };
}

// ===========================================================================
// #630 — CANCEL WORK, and TAKE RESPONSIBILITY.
//
// BOTH ARE RUNTIME WRITES FOR THE SAME REASON ADMISSION IS: `clara.cancel_accounting_work` and
// `clara.take_over_accounting_work` are granted to the runtime's pool role alone, and a cancel
// also has to reach the ENGINE (the door NOTIFYs `clara_runtime_ctl` inside its own transaction,
// which the control listener is waiting on). PostgREST could do neither.
//
// THE CANCEL'S ANSWER IS NOT A BOOLEAN, and that is the whole shape of this ticket. The database
// decides between admission and cancellation on ONE row lock, and there are four different true
// things it can come back with:
//
//   stopping            the abort is requested and an already-admitted operation may still be
//                       settling. NOT a terminal — the surface shows "stopping" and keeps reading.
//   cancelled           there was no run to abort, so the Work is terminal now and nothing posted.
//   already_completed   the operation WON the race. An entry and a receipt exist, the Work is
//                       `completed`, and the answer names both so the surface can link to them.
//                       A cancel never reverses a posted entry — that is a separate, linked act.
//   already_terminal    the Work had already settled. A second cancel is not an error.
//
// Collapsing those into `{ok:true}` would leave the composer guessing, and the one guess that
// matters ("did anything get posted?") is the one it must never make.
// ===========================================================================

/** `POST /api/work/:id/cancel` — the door's own jsonb, field by field. */
export type WorkCancelAnswer = {
  workId: string;
  taskId: string | null;
  /** `clara.accounting_work.status` AS THE DOOR LEFT IT. Never derived here. */
  status: string;
  /** TRUE only when this call is what stopped it. `already_*` answers are false. */
  cancelled: boolean;
  /** `already_terminal` | `already_completed` | `already_stopping`, or null when this call acted. */
  reason: string | null;
  /** Present only on `already_completed`: the effect that won the race. */
  receiptId: string | null;
  entryId: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  replayed: boolean;
};

export type CancelWorkResult =
  | ({ kind: "answered" } & WorkCancelAnswer)
  /** 409 with the DB's own `status` — rendered verbatim beside the refusal. */
  | { kind: "conflict"; reason: string | null; status: string | null }
  /**
   * 409 `{error:'transient'}` — PostgreSQL broke a deadlock or a serialization failure and the
   * STATEMENT NEVER RAN. It is not a conflict with the world: the Work is in exactly the state it
   * was, and pressing the same button again is the whole remedy. Kept apart from `conflict`
   * because that arm sends a person to read a row for an explanation that is not in it.
   */
  | { kind: "transient" }
  | { kind: "denied" }
  | { kind: "not_found" }
  | { kind: "invalid"; reason: string | null }
  | { kind: "unavailable"; message: string }
  | { kind: "lost"; message: string };

function cancelAnswerOf(body: Record<string, unknown>): WorkCancelAnswer | null {
  const workId = str(body.work_id);
  if (workId === null) return null;
  return {
    workId,
    taskId: str(body.task_id),
    status: str(body.status) ?? "stopping",
    cancelled: body.cancelled === true,
    reason: str(body.reason),
    receiptId: str(body.receipt_id),
    entryId: str(body.entry_id),
    cancelledBy: str(body.cancelled_by),
    cancelledAt: str(body.cancelled_at),
    replayed: body.replayed === true,
  };
}

/**
 * Cancel the remaining Work.
 *
 * `opKey` IS THE CALLER'S, AND IT MUST SURVIVE AN UNOBSERVED OUTCOME. `lost` and `unavailable`
 * both mean nobody can say whether the door ran, so the retry rides the SAME key and lets
 * `clara._reserve_op` answer — a fresh key would ask the database a second question it has no way
 * to connect to the first. A deliberate SECOND cancel (a human pressing it again after seeing an
 * answer) is a new decision and takes a new key; the door answers `already_terminal` either way.
 */
export async function cancelWork(
  auth: SessionTokenAccessor,
  input: { workId: string; opKey: string },
  signal?: AbortSignal,
): Promise<CancelWorkResult> {
  const token = await auth.getAccessToken();
  if (!token) return { kind: "denied" };

  let res: Response;
  try {
    res = await runtimePost(
      `${WORK_BASE}/${encodeURIComponent(input.workId)}/cancel`,
      token,
      { opKey: input.opKey },
      signal,
    );
  } catch (err) {
    return { kind: "lost", message: (err as Error).message };
  }
  if (res.type === "opaqueredirect") return { kind: "denied" };

  const body = (await readBody(res)) ?? {};
  if (res.status === 200) {
    const answer = cancelAnswerOf(body);
    return answer === null
      ? { kind: "lost", message: "the runtime answered without naming the Work" }
      : { kind: "answered", ...answer };
  }
  if (res.status === 401 || res.status === 403) return { kind: "denied" };
  if (res.status === 404) return { kind: "not_found" };
  // THE TRANSIENT IS READ BEFORE THE CONFLICT, because it arrives on the same status code and
  // means the opposite thing: `workRoutes.ts` answers `409 {error:'transient'}` for a 40P01/40001
  // the database broke, and the statement never ran. Collapsing it into `conflict` told a preparer
  // "the database refused the request in the state it found" and sent them to read an unchanged row.
  if (res.status === 409 && str(body.error) === "transient") return { kind: "transient" };
  if (res.status === 409) return { kind: "conflict", reason: str(body.error), status: str(body.status) };
  if (res.status === 400) return { kind: "invalid", reason: str(body.reason) ?? str(body.error) };
  return {
    kind: "unavailable",
    message: str(body.error) ?? str(body.message) ?? `the runtime answered ${res.status}`,
  };
}

/** The 202 body of `POST /api/work/:id/take-over` — a NEW run of the SAME logical identity, plus
 *  the two humans the handover told apart. */
export type WorkTakeOver = WorkAdmission & {
  responsible: string | null;
  previousResponsible: string | null;
  /** Who ASKED for this Work. Immutable; a takeover never rewrites it. */
  initiatedBy: string | null;
  takenOver: boolean;
};

export type TakeOverWorkResult =
  | ({ kind: "accepted" } & WorkTakeOver)
  /** 409 — the Work is not available to take over (still authorised, or its run is live). */
  | { kind: "not_takeable"; status: string | null }
  /** 409 `{error:'transient'}` — see `CancelWorkResult`'s own arm: nothing happened, try again. */
  | { kind: "transient" }
  /** 400 — the basis was INTERPRETED and the colleague has not confirmed the one they read.
   *  `basisDigest` is what the resubmit must carry back. */
  | { kind: "confirm_basis"; basisDigest: string | null; basisOrigin: string | null }
  | { kind: "denied" }
  | { kind: "not_found" }
  | { kind: "invalid"; reason: string | null }
  | { kind: "unavailable"; message: string }
  | { kind: "lost"; message: string };

/**
 * Take responsibility for a Work whose person lost authority.
 *
 * `basisDigest` is OMITTED on the first attempt on purpose. A `user_direct` basis is the human's
 * own typed figures and needs no confirmation, so asking for one every time would be ceremony; a
 * `clara_interpreted` one is refused 400 `basis_confirmation_required` CARRYING the digest, and the
 * surface then shows the interpreted basis and resubmits with it. The database decides which case
 * this is — the browser never guesses from `basis_origin` it happens to have read.
 */
export async function takeOverWork(
  auth: SessionTokenAccessor,
  input: { workId: string; opKey: string; basisDigest?: string | null },
  signal?: AbortSignal,
): Promise<TakeOverWorkResult> {
  const token = await auth.getAccessToken();
  if (!token) return { kind: "denied" };

  let res: Response;
  try {
    res = await runtimePost(
      `${WORK_BASE}/${encodeURIComponent(input.workId)}/take-over`,
      token,
      { opKey: input.opKey, basisDigest: input.basisDigest ?? null },
      signal,
    );
  } catch (err) {
    return { kind: "lost", message: (err as Error).message };
  }
  if (res.type === "opaqueredirect") return { kind: "denied" };

  const body = (await readBody(res)) ?? {};
  if (res.status === 202) {
    const admission = admissionOf(body);
    if (admission === null) return { kind: "lost", message: "the runtime accepted the takeover without naming it" };
    return {
      kind: "accepted",
      ...admission,
      responsible: str(body.responsible),
      previousResponsible: str(body.previous_responsible),
      initiatedBy: str(body.initiated_by),
      takenOver: body.taken_over === true,
    };
  }
  if (res.status === 401 || res.status === 403) return { kind: "denied" };
  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 409 && str(body.error) === "transient") return { kind: "transient" };
  if (res.status === 409) return { kind: "not_takeable", status: str(body.status) };
  if (res.status === 400) {
    if (str(body.error) === "basis_confirmation_required") {
      return { kind: "confirm_basis", basisDigest: str(body.basis_digest), basisOrigin: str(body.basis_origin) };
    }
    return { kind: "invalid", reason: str(body.reason) ?? str(body.error) };
  }
  return {
    kind: "unavailable",
    message: str(body.error) ?? str(body.message) ?? `the runtime answered ${res.status}`,
  };
}
