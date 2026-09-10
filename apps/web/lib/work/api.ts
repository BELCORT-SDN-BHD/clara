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
