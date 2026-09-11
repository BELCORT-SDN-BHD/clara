// #623's own mock lane — the durable-Work journey (C3 compose → B3 detail → B6
// chat card), a file-disjoint sibling of `journals-table-mock.mjs` and
// `agentic-finish-mock.mjs`, consulted by `serve-built.mjs` through the hooks
// that module's header describes.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real
// same-origin runtime proxy (`app/api/runtime/[...path]/route.ts`, with its firm
// -scope guard and its header allow-list) and every line of client code under
// test are REAL. What is faked is what sits behind them: PostgREST's reads and
// the RUNTIME's `/api/work/*` legs. So this walk proves the JOURNEY, the client's
// own wire shapes and its state machine — it proves NOTHING about whether
// Postgres would accept a basis, whether `clara.admit_journal_work` idempotency
// really keys on `(firm, intent_key)`, or whether `claraWork_v1` ever runs. The
// database lane's suite and the runtime lane's world e2e own those.
//
// THE IDEMPOTENCY HERE IS A MODEL OF THE DATABASE'S, and it is modelled rather
// than asserted about: `POST /api/work/journal` keys on `intentKey`, answers the
// SAME work with `replayed: true` for the same basis, and 409s
// `intent_payload_conflict` for a different one. That is the behaviour the
// composer's lost-response arm is written against, so faking it faithfully is
// what makes the lost-response cell mean anything at all.
//
// EVERY REFUSAL BODY BELOW IS THE REAL ONE, TRANSCRIBED FROM THE ROUTE — never a
// shape invented to make a cell go green. Two of them carry machine-readable
// slots the client acts on, so getting either wrong would make a walk prove the
// opposite of the product:
//
//   400 `{ "error": "invalid_basis", "field", "reason" }` — `field` is the
//   DATABASE'S spelling (snake_case, no `basis.` prefix) and its line index is
//   ONE-BASED, because the DB generates the path from `with ordinality`
//   (packages/runtime/src/workRoutes.ts's WIRE FIELD PATHS note; the mapper is
//   apps/web/lib/work/journal-basis.ts's `fieldForServerPath`). A mock that made
//   up a field name would have let a zero-based mapper pass a browser walk while
//   focusing the wrong money control in production. This lane does not GUESS
//   which basis to refuse — nothing a composer can build reaches the route
//   invalid, by construction — so the refusal is INJECTED through the control
//   endpoint, exactly as the run's own state transitions are.
//
//   409 `{ "error": "intent_payload_conflict", "work_id" }` — the id of the Work
//   that intent key ALREADY names, which is what lets the composer's conflict
//   Alert offer a route to it instead of an apology.
//
// EVERY HANDLER IS SCOPED TO THIS LANE'S OWN CLIENT, and each one says how —
// `e2e-fixture-ownership.test.ts` exists because three lanes learned the hard way
// that a handler claiming a SHARED endpoint replaces everyone else's fixture.
// This lane claims no unfiltered register, no shared session list and no
// firm-wide read: `/rest/v1/clients` is answered only for `id=eq.<ours>`, every
// relation read is gated on `client_id=eq.<ours>` (or on an id this module
// itself minted), and the ONE chat thread it owns is APPENDED to serve-built's
// shared `sessions` array rather than answered from a second list.
//
// A COVERAGE LIMIT OF THAT GATE, NAMED HERE AS fs4's and home-board's rows do:
// the census reads `path === "<literal>"` handlers. The runtime half's
// `GET /api/work/:workId` and `POST /api/work/:workId/retry` are matched with a
// REGEX because their paths carry an id, so the census cannot see them. Both are
// scoped the same way everything else here is — they resolve only ids this module
// minted, and return false otherwise — but that is a property a reader has to
// check in this file, not one the gate measures.

import { createHash } from "node:crypto";

/** The shared subject and firm `serve-built.mjs` signs every walk in as. Re-typed
 *  rather than imported because that module starts an HTTPS server and a
 *  `next start` child at import time; the fixture-ownership gate reads BOTH
 *  files' literals and would red if these drifted. */
const SUBJECT = "11111111-1111-1111-1111-111111111111";
const FIRM_ID = "33333333-3333-4333-8333-333333333333";

export const JOURNAL_WORK = {
  clientId: "62362362-6236-4623-8623-623623623623",
  clientName: "PENANG SPICE TRADING",
  /** #629 (B6) — the question the seeded transcript's `work_question` part names. Answered before
   *  the transcript is ever replayed, which is the state that makes the card a convergence. */
  seededQuestionId: "a2309999-a230-4a23-8a23-a230a230a230",
  /** This lane's ONE chat thread — the B6 transcript that carries the
   *  `work_accepted` card. */
  threadId: "62362362-1111-4111-8111-623623623623",
  /** A Work that was admitted, ran and COMPLETED before the walk started: the
   *  durable record the chat card links to, so that cell proves the LINK rather
   *  than re-proving admission. */
  seededWorkId: "62309001-6230-4623-8623-623062309001",
  /** The intent key the seeded Work already spent. A draft carrying it with
   *  DIFFERENT figures is the conflict arm, and the 409 names that Work. */
  seededIntentKey: "seeded-chat-intent",
  seededTaskId: "72309001-7230-4723-8723-723072309001",
  seededEntryId: "82309001-8230-4823-8823-823082309001",
  seededReceiptId: "92309001-9230-4923-8923-923092309001",
  /** The two chart codes the composer picks from, and one that is NOT in the
   *  chart — the unknown-account rule needs a code the select cannot offer. */
  rentAccount: "6100",
  bankAccount: "1100",
  unknownAccount: "9999",
  /** The control endpoint, as the BROWSER addresses it: the same-origin proxy
   *  maps `/api/runtime/<p>` onto the runtime's `/api/<p>`. */
  controlPath: "/api/runtime/e2e-journal-work/control",
};

/** This lane's thread row, exported so `serve-built.mjs` can APPEND it to the ONE
 *  shared `/api/chat/sessions` list. It carries the shared SUBJECT and its OWN
 *  client id, so `selectOwnSession`'s `(created_by, client_id)` resolution can
 *  only reach it from this lane's own client — never at the firm altitude, which
 *  is the claim `e2e-fixture-ownership.test.ts` N6 fences. */
export const JOURNAL_WORK_SESSIONS = [
  {
    id: JOURNAL_WORK.threadId,
    firm_id: FIRM_ID,
    client_id: JOURNAL_WORK.clientId,
    created_by: SUBJECT,
    visibility: "private",
    title: "Documentless journal entry",
    created_at: "2026-09-05T00:00:00.000Z",
  },
];

const CLIENT = {
  id: JOURNAL_WORK.clientId,
  name: JOURNAL_WORK.clientName,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

const ACCOUNTS = [
  { client_id: JOURNAL_WORK.clientId, account_code: JOURNAL_WORK.bankAccount, name: "Cash at bank — Maybank", account_type: "asset", is_active: true },
  { client_id: JOURNAL_WORK.clientId, account_code: JOURNAL_WORK.rentAccount, name: "Office rent", account_type: "expense", is_active: true },
  // An INACTIVE row, so the composer's `is_active` filter is exercised by a real
  // fixture rather than only by a unit stub: it must never appear as an option.
  { client_id: JOURNAL_WORK.clientId, account_code: "6199", name: "Office rent (retired)", account_type: "expense", is_active: false },
];

const BUNDLE = { id: "clara-work/v1", digest: "9f2b7c1d4e6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c" };

/** The one basis the seeded Work was admitted with — RM 1,200 office rent paid
 *  from Maybank, which is journey B6's own worked example. */
function seededBasis() {
  return {
    posting_date: "2026-09-01",
    memo: "Office rent paid from Maybank",
    currency: "MYR",
    lines: [
      { account_code: JOURNAL_WORK.rentAccount, debit_cents: 120_000, credit_cents: 0, description: "September rent" },
      { account_code: JOURNAL_WORK.bankAccount, debit_cents: 0, credit_cents: 120_000, description: null },
    ],
  };
}

/** This lane's mutable fixture state. It lives for the server's lifetime, which
 *  is safe only because `playwright.config.ts` pins `workers: 1`; every spec that
 *  admits Work resets it first through the control endpoint below. */
const state = {
  minted: 0,
  works: new Map(),
  tasks: new Map(),
  intents: new Map(),
  receipts: [],
  entries: new Map(),
  lines: new Map(),
  /** The ONE injected 400, armed by the control endpoint and spent by the next
   *  admission — see this file's header for why a basis refusal has to be
   *  injected rather than provoked. */
  nextBasisRefusal: null,
  /** `clara.agent_interruptions` rows, in the shape `clara.open_interruption`
   *  writes them: one PENDING row per parked task, its `question` jsonb carrying
   *  the runtime's own `{ type, question, context, framing }`. */
  interruptions: [],
  /** #629 — `clara.get_work_question` records, keyed by question id: the ONE record B3, B4 and B6
   *  all read. The `agent_interruptions` array above is the pre-0180 shape the Work detail's
   *  BANNER still reads; this map is what the FORM reads. Both are written by the same `ask` op,
   *  because in the database they are one row. */
  questions: new Map(),
  /** The ONE injected answer refusal, armed by the control endpoint and spent by the next answer
   *  — the convergence arms cannot be provoked from a browser, so they are injected exactly as
   *  the basis refusal above is. */
  nextAnswerRefusal: null,
  /** #629 (B6) — whether this lane's transcript carries its `work_question` part.
   *
   *  ARMED, NEVER DEFAULT ON, and the reason is measured rather than tidy: the Clara rail renders on
   *  EVERY page of this app, so a transcript that always carried the part put a second
   *  `work-question-*` subtree beside the Work detail's own on every B3 cell — Playwright's strict
   *  mode then refused every `getByTestId` in this walk as a two-element match. The B6 cell arms it;
   *  `reset` disarms it. */
  showQuestionCard: false,
};

/** The two-field question this lane asks by default: a date and an amount in integer cents — the
 *  pair that makes the bounded stepper a stepper rather than a single Field. */
const DEFAULT_QUESTION_FIELDS = [
  { key: "posting_date", label: "Posting date", kind: "date", required: true },
  { key: "amount_cents", label: "Amount", kind: "money", required: true, unit: "MYR" },
];

function pad(n) {
  return String(n).padStart(4, "0");
}

function seed() {
  state.minted = 0;
  state.works.clear();
  state.tasks.clear();
  state.intents.clear();
  state.entries.clear();
  state.lines.clear();
  state.receipts.length = 0;
  state.nextBasisRefusal = null;
  state.interruptions.length = 0;
  state.questions.clear();
  state.nextAnswerRefusal = null;
  state.showQuestionCard = false;

  const work = newWorkRow({
    id: JOURNAL_WORK.seededWorkId,
    taskId: JOURNAL_WORK.seededTaskId,
    intentKey: JOURNAL_WORK.seededIntentKey,
    basis: seededBasis(),
    origin: "clara_interpreted",
    sourceRefs: [{ kind: "chat_task", task_id: JOURNAL_WORK.seededTaskId, session_id: JOURNAL_WORK.threadId }],
  });
  state.works.set(work.id, work);
  // #629 (B6) — THE QUESTION THE SEEDED TRANSCRIPT'S `work_question` PART NAMES, already ANSWERED.
  // A card mounted on a settled record IS the "answered elsewhere" convergence: the transcript is
  // replayed long after somebody answered the question from the Work detail or from Needs-you, and
  // what the card must then render is the AUTHORITATIVE accepted record — who, when, which version
  // — rather than a form offering a second answer. Seeded (not asked through the control endpoint)
  // precisely because nobody in this walk answers it: it was answered elsewhere.
  state.questions.set(JOURNAL_WORK.seededQuestionId, {
    question_id: JOURNAL_WORK.seededQuestionId,
    work_id: JOURNAL_WORK.seededWorkId,
    client_id: JOURNAL_WORK.clientId,
    task_id: JOURNAL_WORK.seededTaskId,
    firm_id: FIRM_ID,
    question_version: 1,
    status: "answered",
    question: "Which date should the September rent be posted on?",
    context: null,
    reason: "The admitted basis named no posting date.",
    fields: [{ key: "posting_date", label: "Posting date", kind: "date", required: true }],
    source_ref: { kind: "chat_task", id: JOURNAL_WORK.seededTaskId },
    basis_digest: "a".repeat(64),
    expires_at: "2026-09-30T00:00:00.000Z",
    created_at: "2026-09-05T00:00:03.000Z",
    answer: { posting_date: "2026-09-01" },
    answered_by: SUBJECT,
    answered_at: "2026-09-05T00:00:04.000Z",
    answered_role: "bookkeeper",
    delivery_state: "delivered",
    delivery_attempts: 1,
    work_status: "completed",
    work_basis_digest: "a".repeat(64),
  });
  // THE SEEDED WORK OWNS ITS INTENT KEY, exactly as an admitted row does in the
  // database: `clara.accounting_work` carries `unique (firm_id, intent_key)`, so
  // every Work that exists has already claimed one. Registering it is what lets
  // a walk reach the conflict arm — submit DIFFERENT figures under a key the
  // firm has already spent, and the door answers 409 naming the Work it points at.
  state.intents.set(work.intent_key, work.id);
  state.tasks.set(JOURNAL_WORK.seededTaskId, { id: JOURNAL_WORK.seededTaskId, status: "queued", error_code: null, created_at: work.created_at, updated_at: work.created_at });
  commit(work, JOURNAL_WORK.seededEntryId, JOURNAL_WORK.seededReceiptId);
}

function newWorkRow({ id, taskId, intentKey, basis, origin, sourceRefs }) {
  const at = new Date().toISOString();
  return {
    id,
    firm_id: FIRM_ID,
    client_id: JOURNAL_WORK.clientId,
    purpose: "journal_entry",
    status: "queued",
    initiator: SUBJECT,
    initiator_role: "owner",
    intent_key: intentKey,
    logical_op_id: `work:${id}:journal_entry:1`,
    basis,
    basis_digest: digestOf(basis),
    basis_origin: origin,
    source_refs: sourceRefs,
    current_task_id: taskId,
    bundle: null,
    result: null,
    error: null,
    created_at: at,
    updated_at: at,
  };
}

/**
 * A STAND-IN for `clara._hash`-style canonical hashing. It is only ever compared
 * against itself inside this process, and the walk never asserts its value — the
 * real digest is the database's, computed from the basis it stores.
 *
 * IT HASHES THE WHOLE BASIS, and it did not always. The first version base64'd
 * the JSON and kept the first 32 characters — which encode the first 24 BYTES,
 * i.e. `{"posting_date":"2026-09`. Every basis this lane can build shares that
 * prefix, so two DIFFERENT payloads under one intent key produced the SAME
 * digest and the fixture answered `replayed: true` where the database would
 * answer 409. A fixture that cannot tell two bases apart cannot model
 * idempotency at all, and the conflict arm was unreachable through it.
 */
function digestOf(basis) {
  return `sha256:${createHash("sha256").update(JSON.stringify(basis)).digest("hex")}`;
}

/** The whole committed effect, in one place: one approved entry, its lines, one
 *  `operation_receipts` row and the Work's own `result`. */
function commit(work, entryId, receiptId) {
  const at = new Date().toISOString();
  state.entries.set(entryId, {
    id: entryId, client_id: JOURNAL_WORK.clientId, status: "approved", posting_date: work.basis.posting_date,
    memo: work.basis.memo, origin: "agent", document_id: null, coding_kind: null, revision_token: `rev-${entryId}`,
    maker_actor: SUBJECT, checker_actor: SUBJECT, approved_at: at, reversal_of: null, reversed_by: null,
    reversal_reason: null, withdrawn_at: null, withdrawal_reason: null, created_at: at,
  });
  state.lines.set(
    entryId,
    work.basis.lines.map((line, i) => ({
      id: `${entryId}-${i + 1}`, entry_id: entryId, line_no: i + 1, account_code: line.account_code,
      debit_cents: line.debit_cents, credit_cents: line.credit_cents, description: line.description ?? null,
      counterparty_id: null,
    })),
  );
  state.receipts.push({
    id: receiptId, client_id: JOURNAL_WORK.clientId, work_id: work.id, purpose: "journal_entry",
    logical_op_id: work.logical_op_id, payload_digest: work.basis_digest, acting_actor: SUBJECT,
    on_behalf_of: SUBJECT, via_wake_kind: "interactive_client", bundle_digest: BUNDLE.digest,
    run_id: `run-${work.id}`, task_id: work.current_task_id, outcome: "committed",
    effects: { entry_id: entryId, revision_token: `rev-${entryId}` }, refusal: null, created_at: at,
  });
  work.status = "completed";
  work.bundle = BUNDLE;
  work.result = { entry_id: entryId, receipt_id: receiptId, posted_at: at };
  work.error = null;
  work.updated_at = at;
  const task = state.tasks.get(work.current_task_id);
  if (task) { task.status = "completed"; task.error_code = null; task.updated_at = at; }
}

seed();

/** `POST /api/work/journal`'s camelCase wire body, mapped onto the snake_case
 *  jsonb `clara.accounting_work.basis` stores — the same mapping the runtime does,
 *  and the reason the Work detail can render a basis the composer never sent in
 *  that shape. */
function basisFromWire(wire) {
  return {
    posting_date: String(wire?.postingDate ?? ""),
    memo: String(wire?.memo ?? ""),
    currency: String(wire?.currency ?? "MYR"),
    lines: (Array.isArray(wire?.lines) ? wire.lines : []).map((line) => ({
      account_code: String(line?.accountCode ?? ""),
      debit_cents: Number(line?.debitCents ?? 0),
      credit_cents: Number(line?.creditCents ?? 0),
      description: typeof line?.description === "string" ? line.description : null,
    })),
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function admissionBody(work, replayed) {
  return {
    work_id: work.id,
    task_id: work.current_task_id,
    logical_op_id: work.logical_op_id,
    status: work.status,
    replayed,
  };
}

// ── the runtime half ─────────────────────────────────────────────────────────

/** The runtime legs the same-origin proxy forwards. Returns true when it
 *  answered. Hooked BEFORE `handleChat` in serve-built's delegate chain, which is
 *  safe in both directions: this module claims only `/api/work/*` and its own
 *  control path, and it falls through for any client but its own. */
export async function handleJournalWorkRuntime(request, response, url) {
  const path = url.pathname;

  if (request.method === "POST" && path === "/api/work/journal") {
    const body = await readJson(request);
    // SCOPED BY THE REQUEST'S OWN CLIENT — another lane's admission (there is
    // none today) would fall through to the shared fallback rather than being
    // answered with this lane's Work.
    if (body?.clientId !== JOURNAL_WORK.clientId) return false;
    const intentKey = String(body?.intentKey ?? "");
    const basis = basisFromWire(body?.basis);
    // THE INJECTED 400, BEFORE the idempotency arms — the route validates the
    // basis before it reaches `clara.admit_journal_work`, so a refused shape
    // never touches the intent key and nothing is admitted.
    if (state.nextBasisRefusal !== null) {
      const refusal = state.nextBasisRefusal;
      state.nextBasisRefusal = null;
      send(response, 400, { error: "invalid_basis", field: refusal.field, reason: refusal.reason });
      return true;
    }
    const known = state.intents.get(intentKey);
    if (known !== undefined) {
      const work = state.works.get(known);
      // THE TWO IDEMPOTENCY ARMS, as `clara.admit_journal_work` defines them:
      // same key + same digest resolves the ORIGINAL Work; same key + a
      // different payload is a typed conflict and admits nothing.
      if (work.basis_digest !== digestOf(basis)) {
        send(response, 409, { error: "intent_payload_conflict", work_id: work.id });
        return true;
      }
      send(response, 202, admissionBody(work, true));
      return true;
    }
    state.minted += 1;
    const id = `6230${pad(state.minted)}-6230-4623-8623-623062306230`;
    const taskId = `7230${pad(state.minted)}-7230-4723-8723-723072307230`;
    const work = newWorkRow({ id, taskId, intentKey, basis, origin: "user_direct", sourceRefs: [] });
    state.works.set(id, work);
    state.tasks.set(taskId, { id: taskId, status: "queued", error_code: null, created_at: work.created_at, updated_at: work.created_at });
    state.intents.set(intentKey, id);
    send(response, 202, admissionBody(work, false));
    return true;
  }

  // THE CONTROL ENDPOINT — this lane's own, the same idiom P6-5's `/e2e-p6-5/reset`
  // uses, except that it rides the RUNTIME leg so the browser can reach it through
  // the app's real proxy with the real session it already holds. It is SCOPED like
  // every other handler here: a body that does not name this lane's client falls
  // through, so it can never advance another lane's fixture.
  if (request.method === "POST" && path === "/api/e2e-journal-work/control") {
    const body = await readJson(request);
    if (body?.client !== JOURNAL_WORK.clientId) return false;
    send(response, 200, control(body));
    return true;
  }

  const retry = /^\/api\/work\/([^/]+)\/retry$/.exec(path);
  if (request.method === "POST" && retry) {
    const work = state.works.get(decodeURIComponent(retry[1]));
    if (work === undefined) return false;
    await readJson(request); // the opKey; this mock does not model op-key replay
    if (!["refused", "failed", "expired"].includes(work.status)) {
      send(response, 409, { error: "not_retryable", status: work.status });
      return true;
    }
    // A NEW RUN FOR THE SAME WORK — a new task id, the SAME `logical_op_id`.
    state.minted += 1;
    const taskId = `7230${pad(state.minted)}-7230-4723-8723-723072307230`;
    state.tasks.set(taskId, { id: taskId, status: "queued", error_code: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    work.current_task_id = taskId;
    work.status = "queued";
    work.error = null;
    work.updated_at = new Date().toISOString();
    send(response, 202, admissionBody(work, false));
    return true;
  }

  // THIS LANE'S ONE TRANSCRIPT, by EXACT thread id. `handleChat` in
  // `serve-built.mjs` claims the whole `/api/chat/sessions/…/messages` shape and
  // is LAST in the delegate chain, so answering here for one id — and only one —
  // takes nothing from any sibling walk.
  if (request.method === "GET" && path === `/api/chat/sessions/${JOURNAL_WORK.threadId}/messages`) {
    send(response, 200, { messages: journalWorkTranscript() });
    return true;
  }

  const probe = /^\/api\/work\/([^/]+)$/.exec(path);
  if (request.method === "GET" && probe) {
    const work = state.works.get(decodeURIComponent(probe[1]));
    if (work === undefined) return false;
    const task = state.tasks.get(work.current_task_id) ?? null;
    send(response, 200, {
      work,
      task: task === null ? null : { id: task.id, status: task.status, error_code: task.error_code, workflow_run_id: task.status !== "queued" },
    });
    return true;
  }

  return false;
}

/** The state machine a spec drives by hand, so a status is never a race against a
 *  timer: `queued → running → completed`, or `→ refused`, exactly when the walk
 *  says so. */
function control(body) {
  if (body.op === "reset") {
    seed();
    return { reset: true };
  }
  // ARMS THE NEXT ADMISSION'S 400. The body it will send is taken VERBATIM from
  // the caller, so a walk states the exact wire path it expects the composer to
  // resolve — and a wrong `fieldForServerPath` reds the walk instead of quietly
  // focusing another row.
  if (body.op === "card") {
    // Arm the transcript's `work_question` part for the B6 cell. See `state.showQuestionCard`.
    state.showQuestionCard = true;
    return { showQuestionCard: true };
  }
  if (body.op === "refuse_basis") {
    state.nextBasisRefusal = { field: String(body.field ?? "basis"), reason: String(body.reason ?? "invalid_basis") };
    return { armed: state.nextBasisRefusal };
  }
  // #629 — ARMS THE NEXT ANSWER'S REFUSAL. The wire body is taken VERBATIM from the caller, so a
  // walk states the exact (code, reason) pair it expects the form to converge on, and a mapper
  // that read the code alone would red the walk rather than quietly rendering the wrong sentence.
  if (body.op === "refuse_answer") {
    state.nextAnswerRefusal = {
      code: String(body.code ?? "CLR13"),
      reason: String(body.reason ?? "already_answered"),
      message: String(body.message ?? "this question is no longer open (answered)"),
      current: body.current ?? null,
      settle: body.settle ?? null,
    };
    return { armed: state.nextAnswerRefusal };
  }
  const work = state.works.get(String(body.workId ?? ""));
  if (work === undefined) return { error: "no_such_work" };
  const task = state.tasks.get(work.current_task_id);
  const at = new Date().toISOString();
  work.updated_at = at;

  if (body.op === "run") {
    work.status = "running";
    work.bundle = BUNDLE;
    if (task) { task.status = "running"; task.updated_at = at; }
    return { status: work.status };
  }
  if (body.op === "ask") {
    // THE PARK, as the estate performs it: `clara.open_interruption` writes ONE
    // pending row against the TASK and flips the task to `awaiting_input`, and
    // 0178's mirror trigger carries that onto the Work. Two records, one
    // transition — modelled here in the same order.
    work.status = "awaiting_input";
    work.bundle = BUNDLE;
    if (task) { task.status = "awaiting_input"; task.updated_at = at; }
    const questionId = `a230${pad(state.interruptions.length + 1)}-a230-4a23-8a23-a230a230a230`;
    // #629 — THE SAME ROW, WITH THE WORK IDENTITY ON IT. `clara.open_work_question` (0180) writes
    // everything `clara.open_interruption` writes plus the Work id, the version, the Work's basis
    // digest and the TYPED FIELDS; the read doors project that as one record. Modelled here so
    // the browser walk exercises the real client shapes rather than a form built from props.
    state.questions.set(questionId, {
      question_id: questionId,
      work_id: work.id,
      client_id: JOURNAL_WORK.clientId,
      task_id: work.current_task_id,
      firm_id: FIRM_ID,
      // PER WORK, exactly as `clara.open_work_question` counts it (0180: 1 + the number of
      // interruptions this Work has already opened) — never per fixture. A fixture-wide counter made
      // the FIRST question a walk asks "Question 2" the moment this module seeded any other one.
      question_version: [...state.questions.values()].filter((q) => q.work_id === work.id).length + 1,
      status: "pending",
      question: String(body.question ?? "Which Maybank account did this rent leave from?"),
      context: String(body.context ?? "This client has two accounts coded 1100."),
      reason: String(body.reason ?? "The admitted basis names no posting date and no amount."),
      fields: Array.isArray(body.fields) && body.fields.length > 0 ? body.fields : DEFAULT_QUESTION_FIELDS,
      // #629 — THE SUPPORTING SOURCE. `clara.open_work_question` takes it from the run's own
      // `ask_question` call (claraWork.v2.tools.ts's closed `{kind, id?}`), so the walk arms it the
      // same way it arms everything else about the question.
      source_ref: body.source_ref ?? null,
      basis_digest: "a".repeat(64),
      expires_at: "2026-09-30T00:00:00.000Z",
      created_at: at,
      answer: null,
      answered_by: null,
      answered_at: null,
      answered_role: null,
      delivery_state: "pending",
      delivery_attempts: 0,
      work_status: "awaiting_input",
      work_basis_digest: "a".repeat(64),
    });
    state.interruptions.push({
      id: questionId,
      task_id: work.current_task_id,
      kind: "clarify",
      // `question`, NEVER `text` — the live writer is `openInterruptionStep`
      // (H-32; apps/web/lib/journals/governance-doors.ts's own reader note).
      question: {
        type: "clarify",
        question: String(body.question ?? "Which Maybank account did this rent leave from?"),
        context: String(body.context ?? "This client has two accounts coded 1100."),
        framing: "Answer in one line.",
      },
      answer: null,
      status: "pending",
      asked_of: SUBJECT,
      answered_by: null,
      expires_at: "2026-09-30T00:00:00.000Z",
      created_at: at,
      answered_at: null,
    });
    return { status: work.status };
  }
  if (body.op === "complete") {
    state.minted += 1;
    commit(work, `8230${pad(state.minted)}-8230-4823-8823-823082308230`, `9230${pad(state.minted)}-9230-4923-8923-923092309230`);
    return { status: work.status, entry_id: work.result.entry_id };
  }
  if (body.op === "refuse") {
    work.status = "refused";
    work.bundle = BUNDLE;
    // A TYPED refusal, in the shape `clara.settle_work_run` writes and the Work
    // detail renders verbatim — the DB's own words, never re-worded by the UI.
    work.error = {
      code: String(body.code ?? "CLR10"),
      reason: String(body.reason ?? "write_into_closed_period"),
      message: String(body.message ?? "The period for 2026-09-01 is closed, so this entry was not posted."),
      recoverable: true,
    };
    if (task) { task.status = "failed"; task.error_code = "tool_error"; task.updated_at = at; }
    return { status: work.status };
  }
  return { error: "no_such_op" };
}

// ── the PostgREST half ───────────────────────────────────────────────────────

function eqParam(url, name) {
  const value = url.searchParams.get(name);
  return value?.startsWith("eq.") ? value.slice(3) : null;
}

/** Returns true when it answered. Every branch is gated on THIS lane's client (or
 *  on an id this module minted) and falls through otherwise. */
export async function handleJournalWorkSupabase(request, response, path, url, sendJson, cors) {
  const ours = JOURNAL_WORK.clientId;

  if (request.method === "GET" && path === "/rest/v1/clients") {
    // ID-SCOPED ONLY. The UNFILTERED read is the client REGISTER every walk
    // shares; claiming it broke another lane's navigation cell once already.
    if (eqParam(url, "id") !== ours) return false;
    sendJson(response, 200, [CLIENT], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (eqParam(url, "client_id") !== ours) return false;
    sendJson(response, 200, ACCOUNTS, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/accounting_work") {
    if (eqParam(url, "client_id") !== ours) return false;
    const id = eqParam(url, "id");
    const rows = [...state.works.values()]
      .filter((row) => id === null || row.id === id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    sendJson(response, 200, rows, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/operation_receipts") {
    if (eqParam(url, "client_id") !== ours) return false;
    const workId = eqParam(url, "work_id");
    sendJson(response, 200, state.receipts.filter((r) => workId === null || r.work_id === workId), cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/journal_entries") {
    if (eqParam(url, "client_id") !== ours) return false;
    const id = eqParam(url, "id");
    const row = id === null ? null : (state.entries.get(id) ?? null);
    sendJson(response, 200, row === null ? [] : [row], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/journal_lines") {
    // ID-SCOPED, and there is no client filter on this read to scope by: the
    // entry id IS the discriminant, and only ids this module minted resolve.
    const entryId = eqParam(url, "entry_id");
    if (entryId === null || !state.lines.has(entryId)) return false;
    sendJson(response, 200, state.lines.get(entryId), cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/agent_interruptions") {
    // SCOPED TO A TASK THIS MODULE MINTED. The journals workbench reads the same
    // relation FIRM-WIDE (`status=eq.pending` with no task filter) and the chat
    // rail reads it per chat task; both carry a `task_id` this lane never minted
    // — or none at all — so both fall through to the shared fixture.
    const taskId = eqParam(url, "task_id");
    if (taskId === null || !state.tasks.has(taskId)) return false;
    const status = eqParam(url, "status");
    sendJson(
      response,
      200,
      state.interruptions.filter((row) => row.task_id === taskId && (status === null || row.status === status)),
      cors,
    );
    return true;
  }

  // #629 — THE THREE DOORS. `callDoor` posts to `/rest/v1/rpc/<fn>`, so these are the exact wire
  // shapes `apps/web/lib/work/questions.ts` builds and the exact refusal envelope
  // `apps/web/lib/wire.ts` classifies (`code` = the SQLSTATE, `details` = the typed detail JSON).
  // Every one is ID-SCOPED to a question this module minted and falls through otherwise.
  // #629 (B4) — THE FIRM INBOX, but ONLY while this lane actually holds a pending work question.
  //
  // SCOPED THAT WAY ON PURPOSE. `clara.list_review_queue` is firm-wide and carries no client filter
  // a lane hook could key on, so answering it unconditionally would hand every OTHER spec's
  // Needs-you page this lane's row. Gating on "a pending question exists" makes the hook inert for
  // every walk that never drove this lane's control endpoint, and `serve-built.mjs`'s generic
  // empty-envelope default keeps answering them. A spec that wants a different queue installs its
  // own `page.route`, which wins over the server either way.
  if (request.method === "POST" && path === "/rest/v1/rpc/list_review_queue") {
    const pending = [...state.questions.values()].filter((q) => q.status === "pending");
    if (pending.length === 0) return false;
    sendJson(response, 200, {
      counts: {
        ready: 0, needs_review: 0, needs_you: pending.length, open_drafts: 0, open_questions: 0,
        open_tasks: 0, compliance_watches: 0, lint_findings: 0, work_questions: pending.length,
      },
      sweep: null,
      compliance: { stale_evaluator: false, clients: [] },
      lint: null,
      // The EXACT 30-key row shape `clara.list_review_queue` returns — #629 added a row KIND, never
      // a key (0180's header states why), so a row that carried an extra one would be a fixture
      // lying about the door.
      rows: pending.map((q) => ({
        row_kind: "work_question", section: "needs_you", sort: q.created_at,
        client_id: q.client_id, counterparty_id: null, filing_id: null, entry_id: null,
        question_id: q.question_id, task_id: q.task_id, document_id: null,
        lane: "needs_you", auto: false, rule_backed: false, high_stakes: false,
        aged_since: q.created_at, amount_cents: null, period: null,
        question_text: q.question, created_at: q.created_at, id: q.question_id,
        coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null,
        advance_id: null, autodraft: null, client_name: null, batch_ids: null,
        open_proposal_count: null,
      })),
      next_cursor: null,
    }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/get_work_pending_question") {
    const body = await readJson(request);
    const work = state.works.get(String(body?.p_work ?? ""));
    if (work === undefined) return false;
    const found = [...state.questions.values()].find((q) => q.work_id === work.id && q.status === "pending");
    sendJson(response, 200, found ?? null, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/get_work_question") {
    const body = await readJson(request);
    const found = state.questions.get(String(body?.p_question ?? ""));
    if (found === undefined) return false;
    sendJson(response, 200, found, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/answer_work_question") {
    const body = await readJson(request);
    const found = state.questions.get(String(body?.p_question ?? ""));
    if (found === undefined) return false;
    const armed = state.nextAnswerRefusal;
    if (armed !== null) {
      state.nextAnswerRefusal = null;
      if (armed.settle !== null && typeof armed.settle === "object") Object.assign(found, armed.settle);
      sendJson(
        response,
        400,
        {
          code: armed.code,
          message: armed.message,
          details: JSON.stringify(armed.current === null ? { reason: armed.reason } : { reason: armed.reason, current: armed.current }),
        },
        cors,
      );
      return true;
    }
    // THE FIRST-ANSWER GATE, modelled: one accepted answer, and a REPLAY of the same op key with
    // the same payload returns the ORIGINAL receipt rather than answering twice.
    if (found.status === "answered" && found.answer_key === String(body?.p_op_key ?? "")) {
      sendJson(response, 200, found.receipt, cors);
      return true;
    }
    const at = new Date().toISOString();
    found.status = "answered";
    found.answer = body?.p_answer ?? {};
    found.answered_by = SUBJECT;
    found.answered_role = "bookkeeper";
    found.answered_at = at;
    found.answer_key = String(body?.p_op_key ?? "");
    found.receipt = {
      question_id: found.question_id,
      work_id: found.work_id,
      question_version: found.question_version,
      status: "answered",
      answered_by: SUBJECT,
      answered_role: "bookkeeper",
      answered_at: at,
    };
    const q = state.interruptions.find((row) => row.id === found.question_id);
    if (q !== undefined) {
      q.status = "answered";
      q.answer = found.answer;
      q.answered_by = SUBJECT;
      q.answered_at = at;
    }
    sendJson(response, 200, found.receipt, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/agent_tasks_visible") {
    // Scoped to tasks this module minted. The rail reads the same relation with
    // `session_id`, and the journals lane with `id=in.(…)`; both fall through.
    const id = eqParam(url, "id");
    if (id === null || !state.tasks.has(id)) return false;
    sendJson(response, 200, [state.tasks.get(id)], cors);
    return true;
  }

  return false;
}

// ── the chat leg ─────────────────────────────────────────────────────────────

/** THE B6 TRANSCRIPT, for this lane's ONE thread id and no other. The parts are
 *  written in the wire shapes `apps/web/lib/parts/types.ts` declares for the
 *  durable-Work kinds — `work_accepted`, `work_status`, `work_result` — which is
 *  what makes this cell a check of the READER against a transcript rather than of
 *  a component against its own props. */
export function journalWorkTranscript() {
  return [
    { id: `message-${JOURNAL_WORK.threadId}-1`, role: "user", parts: [{ type: "text", text: "Record RM 1,200 office rent paid from Maybank on 2026-09-01: Dr 6100 / Cr 1100." }], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-05T00:00:01.000Z" },
    {
      id: `message-${JOURNAL_WORK.threadId}-2`,
      role: "assistant",
      parts: [
        { type: "text", text: "I have admitted that as accounting work." },
        { type: "work_accepted", work_id: JOURNAL_WORK.seededWorkId, client_id: JOURNAL_WORK.clientId, purpose: "journal_entry", logical_op_id: `work:${JOURNAL_WORK.seededWorkId}:journal_entry:1` },
        { type: "work_status", work_id: JOURNAL_WORK.seededWorkId, status: "running" },
        ...(state.showQuestionCard
          ? [{ type: "work_question", work_id: JOURNAL_WORK.seededWorkId, client_id: JOURNAL_WORK.clientId, question_id: JOURNAL_WORK.seededQuestionId, question_version: 1, status: "pending" }]
          : []),
        { type: "work_result", work_id: JOURNAL_WORK.seededWorkId, client_id: JOURNAL_WORK.clientId, entry_id: JOURNAL_WORK.seededEntryId, receipt_id: JOURNAL_WORK.seededReceiptId },
      ],
      turn_key: null,
      task_id: JOURNAL_WORK.seededTaskId,
      seq: 2,
      created_at: "2026-09-05T00:00:02.000Z",
    },
  ];
}
