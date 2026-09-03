// The chat-parity walk's mock lane, kept OUT of serve-built.mjs the way
// live-stack/serve-live.mjs is kept out of it: a file-disjoint sibling that
// serve-built.mjs consults through three small hooks, so the entry-faces, signup and
// firm-navigation walks share none of this surface.
//
// WHAT IT MOCKS, AND WHAT THAT LEAVES REAL. The browser, the built Next bundle, the
// SAME-ORIGIN runtime proxy route (`app/api/runtime/[...path]/route.ts`, firm-scope
// guard and header allow-list included) and every line of client code under test are
// REAL. What is faked is what sits BEHIND them: the runtime's three intake legs (a
// tiny HTTP server this module starts, reached through the real proxy via
// CLARA_RUNTIME_URL), the chat/stream legs the browser calls same-origin, and
// PostgREST. It therefore proves the JOURNEY and the client's own wire shapes. It
// proves NOTHING about whether Postgres or the runtime would accept those shapes —
// `clara._tf_validate_chat_attachments`, `clara.open_interruption`'s linearization and
// `clara.answer_interruption` are not exercised here, only the calls made to them.
//
// The SSE stream is HELD OPEN after the clarify chunk on purpose: that is what a
// parked task looks like on the wire (packages/runtime/src/streamRoute.ts sends the
// terminal `message` only once the task reaches a terminal status), and it is the only
// state in which a clarify is answerable at all.

import { createServer as createHttpServer } from "node:http";

export const CHAT_PARITY = {
  clientId: "55555555-5555-4555-8555-555555555555",
  threadId: "66666666-6666-4666-8666-666666666666",
  taskId: "77777777-7777-4777-8777-777777777777",
  interruptionId: "88888888-8888-4888-8888-888888888888",
  intakeId: "99999999-9999-4999-8999-999999999999",
  documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  question: "Which client owns this invoice?",
};

/** THE PRODUCTION WRITE ORDER, modelled (fold round, review B1). The runtime writes the
 *  clarify tool-call chunk inside `runModelSegmentStepV16` and INSERTs the
 *  `agent_interruptions` row three durable WDK step boundaries LATER —
 *  `chatTurn.v16.ts:104` → `:105` (`checkpointStep`) → `:127` (`mintHookTokenStep`) →
 *  `:129` (`openInterruptionStep`). The first cut of this mock answered the pending read
 *  unconditionally from a `pending` seed, so the browser walk was green on the one
 *  ordering production never produces, and the blocker hid under it.
 *
 *  The row is therefore withheld until BOTH the chunk has actually been sent AND at least
 *  one pending read has already come back empty. Read-ORDER rather than wall-clock: it
 *  reproduces exactly what the card experiences, and it cannot flake on a slow machine the
 *  way a timer would. */
const ROW_APPEARS_AFTER_EMPTY_READS = 1;

const state = {
  turns: [],
  chunkSent: false,
  emptyReads: 0,
  interruption: { status: "pending", answer: null, answered_by: null, answered_at: null },
};

/** A fresh turn is a fresh task, so the park it will produce starts unwritten again. Keeps
 *  the walks independent of each other's order. */
function resetPark() {
  state.chunkSent = false;
  state.emptyReads = 0;
  state.interruption = { status: "pending", answer: null, answered_by: null, answered_at: null };
}

function rowExistsYet() {
  return state.chunkSent && state.emptyReads >= ROW_APPEARS_AFTER_EMPTY_READS;
}

function interruptionRow() {
  return {
    id: CHAT_PARITY.interruptionId,
    task_id: CHAT_PARITY.taskId,
    kind: "clarify",
    question: { question: CHAT_PARITY.question },
    answer: state.interruption.answer,
    status: state.interruption.status,
    asked_of: null,
    answered_by: state.interruption.answered_by,
    expires_at: "2026-09-16T00:00:00.000Z",
    created_at: "2026-09-02T00:00:00.000Z",
    answered_at: state.interruption.answered_at,
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

async function drain(request) {
  for await (const _chunk of request) void _chunk;
}

/** The PostgREST half. Returns true when it answered. Placed BEFORE serve-built's own
 *  404 fallback and AFTER its existing routes, so nothing already mocked changes. */
export async function handleChatParitySupabase(request, response, path, url, sendJson, cors) {
  // ID-SCOPED, and that is what lets this hook run BEFORE the parity-holes fixtures
  // (merge of origin/main `cea3da39` / #507, which brought its own `clients` and
  // `chat_sessions` lists). Each of these answers ONLY for the chat-parity ids and
  // otherwise returns false, so the two walks' fixtures cannot starve each other in
  // either direction. An unfiltered list falls through on purpose: the chat-parity walk
  // navigates straight to its own thread and needs no list at all.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (url.searchParams.get("id") !== `eq.${CHAT_PARITY.clientId}`) return false;
    sendJson(response, 200, [{
      id: CHAT_PARITY.clientId,
      name: "ROME PROPERTIES",
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
    }], cors);
    return true;
  }

  // #507's `(full)/clients/[clientId]/clara/[threadId]` route now refuses a
  // client/thread MISMATCH as not-found (`sessionBelongsToClient`,
  // lib/clara/thread-scope.ts), so the chat-parity thread has to be a positively-seen
  // session at its own client's altitude — the walk 404s otherwise.
  if (request.method === "GET" && path === "/rest/v1/chat_sessions") {
    if (url.searchParams.get("id") !== `eq.${CHAT_PARITY.threadId}`) return false;
    sendJson(response, 200, [{
      id: CHAT_PARITY.threadId,
      firm_id: "33333333-3333-3333-3333-333333333333",
      client_id: CHAT_PARITY.clientId,
      created_by: "11111111-1111-1111-1111-111111111111",
      visibility: "private",
      title: "Chat parity",
      created_at: "2026-09-02T01:00:00.000Z",
    }], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/agent_interruptions") {
    // TASK-SCOPED, added by P6-5 and required by this module's own ID-SCOPED discipline.
    // This branch used to claim EVERY `agent_interruptions` read regardless of subject, and
    // answer it from the chat-parity park — so a sibling walk asking about its OWN task got
    // `[]` (this walk's park has not started) and its question silently never rendered. The
    // by-id read is left unscoped-by-task on purpose: it carries no `task_id` filter at all,
    // and its own id comparison below is already exact.
    const taskFilter = url.searchParams.get("task_id");
    if (taskFilter && taskFilter !== `eq.${CHAT_PARITY.taskId}`) return false;
    // The filters are HONOURED, not ignored: the card asks "what is pending on this
    // task" first and "this exact row by id" after it has answered, and a mock that
    // answered both with the same row would hide a card that never learned the
    // difference.
    const wantsPending = url.searchParams.get("status") === "eq.pending";
    const byId = url.searchParams.get("id");
    const row = interruptionRow();
    if (byId) {
      // The settled re-read, addressed exactly. It can only follow an answer, by which
      // point the row certainly exists.
      sendJson(response, 200, byId === `eq.${CHAT_PARITY.interruptionId}` ? [row] : [], cors);
      return true;
    }
    if (wantsPending && !rowExistsYet()) {
      state.emptyReads += 1;
      sendJson(response, 200, [], cors); // the row is not written yet — see ROW_APPEARS_AFTER_EMPTY_READS
      return true;
    }
    if (wantsPending && row.status !== "pending") { sendJson(response, 200, [], cors); return true; }
    sendJson(response, 200, [row], cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/answer_interruption") {
    const body = await readJson(request);
    state.interruption = {
      status: "answered",
      answer: body.p_answer ?? null,
      answered_by: "11111111-1111-1111-1111-111111111111",
      answered_at: "2026-09-02T00:05:00.000Z",
    };
    sendJson(response, 200, { status: "answered" }, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/document_intakes_visible") {
    sendJson(response, 200, [{
      id: CHAT_PARITY.intakeId,
      uploaded_by: "11111111-1111-1111-1111-111111111111",
      origin: "chat",
      original_filename: "invoice.pdf",
      declared_mime: "application/pdf",
      declared_bytes: 12,
      status: "adopted",
      document_id: CHAT_PARITY.documentId,
      failure_code: null,
      expires_at: null,
      created_at: "2026-09-02T00:00:00.000Z",
      updated_at: "2026-09-02T00:00:01.000Z",
    }], cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/record_client_resolution") {
    await drain(request);
    sendJson(response, 200, { resolution_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/file_document") {
    state.turns.filedWith = await readJson(request);
    sendJson(response, 200, null, cors);
    return true;
  }

  return false;
}

/** The same-origin chat legs. `lib/clara/api.ts`'s `runtimeBase()` is empty in this
 *  harness (no NEXT_PUBLIC_CLARA_RUNTIME_URL), so the browser calls these paths on the
 *  app origin directly — they never reach `next start`. */
export async function handleChatParityApp(request, response, url) {
  const path = url.pathname;

  if (request.method === "GET" && path === `/api/chat/sessions/${CHAT_PARITY.threadId}/messages`) {
    // Deliberately always empty. A parked task has NO persisted assistant row yet —
    // `clara.settle_chat_turn` is what writes one, and it cancels the pending
    // interruption in the same breath.
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ messages: [] }));
    return true;
  }

  if (request.method === "POST" && path === `/api/chat/${CHAT_PARITY.threadId}/turns`) {
    state.turns.push(await readJson(request));
    resetPark();
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({ task_id: CHAT_PARITY.taskId }));
    return true;
  }

  if (request.method === "GET" && path === `/api/tasks/${CHAT_PARITY.taskId}/stream`) {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const chunk = {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "clarify",
      input: { question: CHAT_PARITY.question },
    };
    response.write(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`);
    // The chunk is out; the ROW is still three step boundaries away. `rowExistsYet()`
    // above is what makes the browser walk face the real ordering.
    state.chunkSent = true;
    // No terminal `message`, no `done`, no close: the task is PARKED.
    return true;
  }

  return false;
}

/** The runtime's three intake legs, behind the REAL same-origin proxy. */
export function startMockRuntime(port = Number(process.env.CLARA_E2E_RUNTIME_PORT ?? 3102)) {
  const server = createHttpServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const json = (status, body) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.method === "POST" && url.pathname === "/api/intake/documents") {
      void readJson(request).then(() => json(201, {
        intake_id: CHAT_PARITY.intakeId,
        upload_token: "e2e-upload-token",
        expires_at: null,
      }));
      return;
    }
    if (request.method === "PUT" && url.pathname === `/api/intake/documents/${CHAT_PARITY.intakeId}/bytes`) {
      void drain(request).then(() => { response.writeHead(204); response.end(); });
      return;
    }
    if (request.method === "POST" && url.pathname === `/api/intake/documents/${CHAT_PARITY.intakeId}/finalize`) {
      void readJson(request).then(() => json(202, { status: "finalized", document_id: CHAT_PARITY.documentId }));
      return;
    }
    json(404, { error: "not_found", message: `unhandled e2e runtime route: ${request.method} ${url.pathname}` });
  });
  server.listen(port, "127.0.0.1");
  return { server, origin: `http://127.0.0.1:${port}` };
}
