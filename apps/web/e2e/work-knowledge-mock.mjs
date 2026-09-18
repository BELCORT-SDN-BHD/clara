// #658's mock lane (the B3 Work-knowledge walk) — a file-disjoint sibling of the other lane
// mocks, consulted by `serve-built.mjs` through ONE hook, exactly as those modules' own headers
// describe. Every id below is distinct from theirs and every handler is ID-SCOPED, so no walk can
// starve another's fixtures (`e2e-fixture-ownership.test.ts` enforces this mechanically — this
// file's declaration row is `{ unscopeable: [], debt: [] }`).
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL: `WorkDetail`, `WorkKnowledgeBlock`, `WorkDiagnostics`, `WorkQuestionForm`,
// `lib/work/knowledge.ts`'s reader and its drift judgement, and the draft machinery that must
// survive a banner arriving. What is faked is PostgREST. So this walk proves the JOURNEY and what
// the surface does with each outcome; the door's own floors, its firm-scope shadow and its
// `relevant is NULL, never false` rule are proven against a real Postgres under real
// least-privileged roles in `packages/db/tests/knowledge-retrieval.test.mjs`.
//
// TWO WORKS, ONE PER OBSERVATION THE SURFACE MUST DISTINGUISH:
//   workRead   — a RECORDED read-set: keys, tiers, version, face word. Its knowledge basis can be
//                MOVED through this lane's own control endpoint, which is what a human correcting
//                a record elsewhere in the estate does to it.
//   workTrace  — a v4-shaped run: an execution trace carrying `knowledge_version` and NOTHING
//                about which records it read. Its drift answer is `relevant: null`, and the
//                surface must say so rather than claiming the change is unrelated.
//
// THE CONTROL ENDPOINT IS THIS LANE'S OWN and is SCOPED like every other handler here: a request
// that does not name this lane's client falls through, so it can never advance another lane's
// fixture. The discriminant travels as a QUERY PARAMETER, not in the body — `return false` means
// "someone else will read this request", so it may only be taken while the request is still
// READABLE, and a body read drains it (`mock-dispatch.mjs`'s own header states the rule).

import { readCachedJson } from "./mock-dispatch.mjs";

const FIRM_ID = "00000000-0000-4000-8000-000000000f11";
const SUBJECT = "00000000-0000-4000-8000-00000000d001";

export const WK = {
  clientId: "658aa658-1111-4777-8777-658aa6580001",
  workRead: "658dd658-4444-4777-8777-658dd6580001",
  workTrace: "658dd658-4444-4777-8777-658dd6580002",
  taskRead: "658ee658-5555-4777-8777-658ee6580001",
  taskTrace: "658ee658-5555-4777-8777-658ee6580002",
  questionId: "658ff658-6666-4777-8777-658ff6580001",
  runRead: "wrun_01M20WGD9ETKK6RWCBA8CWG1GE",
  runTrace: "wrun_01M20WGD9ETKK6RWCBA8CWG1GF",
};

const CLIENT_ROW = {
  id: WK.clientId,
  name: "658 Work Knowledge Fixture",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

/** The keys this lane's recorded read actually read. The drift banner names the INTERSECTION of
 *  these with what has moved — never every moved key. */
const READ_KEYS = ["accounting_basis", "sst_regime"];

/** Mutable, deliberately: a knowledge correction landing elsewhere in the estate is a PERSISTENT
 *  fact this Work's drift read must then report. The control endpoint is how the walk lands one.
 *  A fresh module load (one per `serve-built.mjs` process) starts from this state. */
const state = {
  /** null = nothing has moved since the read. Otherwise the keys that moved. */
  moved: /** @type {string[]} */ ([]),
  currentVersion: "42",
  answered: /** @type {Record<string, unknown> | null} */ (null),
};

function resetState() {
  state.moved = [];
  state.currentVersion = "42";
  state.answered = null;
}

function workRow({ id, taskId }) {
  return {
    id,
    firm_id: FIRM_ID,
    client_id: WK.clientId,
    purpose: "journal_entry",
    status: "awaiting_input",
    initiator: SUBJECT,
    initiated_by: SUBJECT,
    initiator_role: "owner",
    intent_key: `p658-intent-${id}`,
    logical_op_id: `work:${id}:journal_entry:1`,
    basis: { posting_date: "2026-09-05", memo: "September rent", lines: [] },
    basis_digest: "a".repeat(64),
    basis_origin: "user_direct",
    source_refs: [],
    current_task_id: taskId,
    bundle: null,
    result: null,
    error: null,
    created_at: "2026-09-18T01:00:00.000Z",
    updated_at: "2026-09-18T01:00:00.000Z",
  };
}

const WORKS = new Map([
  [WK.workRead, workRow({ id: WK.workRead, taskId: WK.taskRead })],
  [WK.workTrace, workRow({ id: WK.workTrace, taskId: WK.taskTrace })],
]);

const TASKS = new Map([
  [WK.taskRead, { id: WK.taskRead, status: "awaiting_input", error_code: null, created_at: "2026-09-18T01:00:00.000Z", updated_at: "2026-09-18T01:00:00.000Z" }],
  [WK.taskTrace, { id: WK.taskTrace, status: "awaiting_input", error_code: null, created_at: "2026-09-18T01:00:00.000Z", updated_at: "2026-09-18T01:00:00.000Z" }],
]);

/** The execution trace of ONE run. The `model_call` step carries
 *  `observed_revisions.knowledge_version` — exactly what deployed `claraWork_v4` writes
 *  (`claraWork.v4.impl.ts:593`) and what B3's Diagnostics section now renders. */
function traceRun(runId, taskId, knowledgeVersion) {
  const base = Date.parse("2026-09-18T02:00:00.000Z");
  const steps = [
    { seq: 1, phase: "dispatch", capability: "accounting_work.model_segment", ms: 40 },
    { seq: 2, phase: "model_call", capability: "accounting_work.model_segment", ms: 1240 },
  ];
  return steps.map((step, index) => ({
    id: `${runId}-${step.seq}`,
    run_id: runId,
    seq: step.seq,
    phase: step.phase,
    capability_id: step.capability,
    registry_version: "clara-capability-registry/v1",
    bundle_id: "clara-work/v4",
    bundle_digest: "c".repeat(64),
    instructions_id: "clara-work-instructions/v4",
    skills: ["journal-entry/v4"],
    tools_id: "clara-work-tools/v4",
    model_id: "gpt-5.6-terra",
    purpose: "accounting_work",
    authorization_id: null,
    consent_ref: null,
    activation_ref: null,
    input_digest: step.phase === "model_call" ? "b".repeat(64) : null,
    observed_revisions: step.phase === "model_call" ? { knowledge_version: knowledgeVersion } : {},
    started_at: new Date(base + index * 2000).toISOString(),
    ended_at: new Date(base + index * 2000 + step.ms).toISOString(),
    duration_ms: step.ms,
    outcome: "ok",
    refusal: null,
    receipt_id: null,
    task_id: taskId,
  }));
}

/** THE DRIFT ENVELOPE, in `clara.work_knowledge_drift`'s own shape (migration 0230). */
function driftFor(workId) {
  if (workId === WK.workRead) {
    const moved = state.moved;
    const relevant = moved.some((k) => READ_KEYS.includes(k));
    return {
      observed_version: "42",
      current_version: state.currentVersion,
      observed_from: "read",
      drifted: state.currentVersion !== "42",
      moved_keys: moved,
      read_keys: READ_KEYS,
      relevant,
      as_of: "2026-09-18",
      read: {
        status: "partial",
        reason: "remainder truncated",
        purpose: "accounting_work",
        tiers: { core: 3, requested: 0, remainder: 6 },
        records_shown: 9,
        truncated: true,
        run_id: WK.runRead,
        seq: 1,
        read_at: "2026-09-18T02:00:00.000Z",
        keys: READ_KEYS,
      },
      work_id: workId,
      client_id: WK.clientId,
    };
  }
  if (workId === WK.workTrace) {
    // THE v4 ARM: a version and nothing else. `relevant` is NULL — never false — because no
    // read-set was recorded, and pretending otherwise is the null-as-empty defect #658 kills.
    return {
      observed_version: "7",
      current_version: state.currentVersion === "42" ? "7" : state.currentVersion,
      observed_from: "trace",
      drifted: state.currentVersion !== "42",
      moved_keys: state.moved,
      read_keys: null,
      relevant: null,
      as_of: null,
      read: null,
      work_id: workId,
      client_id: WK.clientId,
    };
  }
  return null;
}

function questionRow() {
  return {
    question_id: WK.questionId,
    work_id: WK.workRead,
    client_id: WK.clientId,
    task_id: WK.taskRead,
    firm_id: FIRM_ID,
    question_version: 1,
    status: state.answered === null ? "pending" : "answered",
    question: "Which date should the September rent be posted on?",
    context: null,
    reason: "The admitted basis names no posting date.",
    fields: [{ key: "posting_date", label: "Posting date", kind: "date", required: true }],
    source_ref: null,
    basis_digest: "a".repeat(64),
    expires_at: "2026-09-30T00:00:00.000Z",
    created_at: "2026-09-18T01:00:00.000Z",
    answer: state.answered,
    answered_by: state.answered === null ? null : SUBJECT,
    answered_at: state.answered === null ? null : "2026-09-19T01:00:00.000Z",
    answered_role: state.answered === null ? null : "owner",
    delivery_state: "delivered",
    delivery_attempts: 1,
    work_status: "awaiting_input",
    work_basis_digest: "a".repeat(64),
  };
}

const eq = (url, key) => {
  const raw = url.searchParams.get(key);
  return raw && raw.startsWith("eq.") ? raw.slice(3) : null;
};

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

/** The RUNTIME half — this lane's control endpoint, which lands a knowledge correction the way a
 *  human correcting a record elsewhere in the estate does. Returns true when it answered; the
 *  `(request, response, url)` signature is the one `serve-built.mjs`'s runtime chain calls. */
export async function handleWorkKnowledgeRuntime(request, response, url) {
  const path = url.pathname;
  if (request.method !== "POST" || path !== "/api/e2e-work-knowledge/control") return false;
  // THE DISCRIMINANT IS ON THE WIRE, NOT IN THE BODY — a fall-through may only be taken while the
  // request is still readable (mock-dispatch.mjs's own rule).
  if (url.searchParams.get("client") !== WK.clientId) return false;
  const body = await readCachedJson(request);
  const action = String(body?.action ?? "");
  if (action === "reset") {
    resetState();
  } else if (action === "move") {
    // A CORRECTION LANDED. `keys` names what moved; the watermark advances either way, because a
    // revision anywhere in scope moves it (0192's watermark spans every revision, not the emitted
    // rows).
    state.moved = Array.isArray(body?.keys) ? body.keys.map(String) : ["sst_regime"];
    state.currentVersion = "50";
  }
  send(response, 200, { ok: true, moved: state.moved, current_version: state.currentVersion });
  return true;
}

/** The PostgREST half. Returns true when it answered, false to fall through — the ONE hook
 *  `serve-built.mjs` consults, and every branch below is scoped to a #658 id. */
export async function handleWorkKnowledgeSupabase(request, response, path, url, sendJson, cors) {
  if (request.method === "GET") {
    if (path === "/rest/v1/clients") {
      if (eq(url, "id") !== WK.clientId) return false;
      sendJson(response, 200, [CLIENT_ROW], cors);
      return true;
    }
    if (path === "/rest/v1/accounting_work") {
      if (eq(url, "client_id") !== WK.clientId) return false;
      const id = eq(url, "id");
      const rows = [...WORKS.values()].filter((w) => id === null || w.id === id);
      sendJson(response, 200, rows, cors);
      return true;
    }
    if (path === "/rest/v1/agent_tasks_visible") {
      const id = eq(url, "id");
      if (id === null || !TASKS.has(id)) return false;
      sendJson(response, 200, [TASKS.get(id)], cors);
      return true;
    }
    if (path === "/rest/v1/coa_accounts") {
      if (eq(url, "client_id") !== WK.clientId) return false;
      sendJson(response, 200, [], cors);
      return true;
    }
    if (path === "/rest/v1/operation_receipts") {
      if (eq(url, "client_id") !== WK.clientId) return false;
      sendJson(response, 200, [], cors);
      return true;
    }
    // ONE OPENER PER HANDLER, deliberately: `e2e-fixture-ownership.test.ts`'s N5 census counts
    // openers two ways (a per-line walk and a whole-source match) and a line carrying two would
    // make the two instruments disagree — which is the positive control that proves the scan is
    // reading the file at all. So these four empties are four blocks, not one disjunction.
    if (path === "/rest/v1/journal_entries") {
      if (eq(url, "client_id") !== WK.clientId) return false;
      sendJson(response, 200, [], cors);
      return true;
    }
    if (path === "/rest/v1/journal_lines") {
      if (eq(url, "client_id") !== WK.clientId) return false;
      sendJson(response, 200, [], cors);
      return true;
    }
    if (path === "/rest/v1/entry_evidence_links") {
      if (eq(url, "client_id") !== WK.clientId) return false;
      sendJson(response, 200, [], cors);
      return true;
    }
    if (path === "/rest/v1/document_filings") {
      if (eq(url, "client_id") !== WK.clientId) return false;
      sendJson(response, 200, [], cors);
      return true;
    }
    if (path === "/rest/v1/agent_interruptions") {
      const taskId = eq(url, "task_id");
      if (taskId === null || !TASKS.has(taskId)) return false;
      // The parked question is read through `clara.get_work_pending_question`; this relation read
      // degrades to null on the page and the fixture says "nothing here" rather than inventing a
      // second, disagreeing copy of the same question.
      sendJson(response, 200, [], cors);
      return true;
    }
    return false;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);

  // #658 — THE DRIFT READ. Exclusive to this lane.
  if (verb === "work_knowledge_drift") {
    const body = await readCachedJson(request);
    const answer = driftFor(String(body?.p_work ?? ""));
    if (answer === null) return false;
    sendJson(response, 200, answer, cors);
    return true;
  }

  // #631's diagnostics read, answered here for THIS lane's two works. Declared SHARED with
  // `journal-work-mock.mjs`, which answers it for its own; both fall through on a foreign id.
  if (verb === "get_work_execution_trace") {
    const body = await readCachedJson(request);
    const workId = String(body?.p_work ?? "");
    if (workId === WK.workRead) {
      sendJson(response, 200, traceRun(WK.runRead, WK.taskRead, "42"), cors);
      return true;
    }
    if (workId === WK.workTrace) {
      sendJson(response, 200, traceRun(WK.runTrace, WK.taskTrace, "7"), cors);
      return true;
    }
    return false;
  }

  if (verb === "get_work_plan_origin") {
    const body = await readCachedJson(request);
    if (!WORKS.has(String(body?.p_work ?? ""))) return false;
    // The door's own SQL NULL: no plan scheduled this Work. Inventing one would make two mocks
    // disagree about the same verb (journal-work-mock.mjs states the same rule for its own).
    sendJson(response, 200, null, cors);
    return true;
  }

  if (verb === "get_work_claim_origin") {
    const body = await readCachedJson(request);
    if (!WORKS.has(String(body?.p_work ?? ""))) return false;
    sendJson(response, 200, null, cors);
    return true;
  }

  if (verb === "get_work_pending_question") {
    const body = await readCachedJson(request);
    const workId = String(body?.p_work ?? "");
    if (!WORKS.has(workId)) return false;
    sendJson(response, 200, workId === WK.workRead ? questionRow() : null, cors);
    return true;
  }

  if (verb === "get_work_question") {
    const body = await readCachedJson(request);
    if (String(body?.p_question ?? "") !== WK.questionId) return false;
    sendJson(response, 200, questionRow(), cors);
    return true;
  }

  if (verb === "answer_work_question") {
    const body = await readCachedJson(request);
    if (String(body?.p_question ?? "") !== WK.questionId) return false;
    state.answered = body?.p_answer ?? {};
    sendJson(response, 200, questionRow(), cors);
    return true;
  }

  if (verb === "list_entry_links") {
    const body = await readCachedJson(request);
    const subject = String(body?.p_client ?? body?.p_work ?? "");
    if (subject !== WK.clientId && !WORKS.has(subject)) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (verb === "list_spoken_for_documents") {
    const body = await readCachedJson(request);
    const subject = String(body?.p_client ?? body?.p_work ?? "");
    if (subject !== WK.clientId && !WORKS.has(subject)) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  return false;
}
