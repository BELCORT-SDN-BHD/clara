// Wire clients for the Slice-4 plumbing chat page (contract §4.8). Two lanes,
// never mixed:
//   AGENT lane  — the Clara runtime HTTP surface (sessions / messages / turns /
//                 SSE), Bearer = the user's Supabase session JWT.
//   HUMAN lane  — Supabase PostgREST as clara_authenticated (governance acts:
//                 answer_interruption / cancel_agent_task / share_chat_session,
//                 plus reads of agent_tasks_visible + agent_interruptions).
//                 Governance NEVER transits the runtime (§4.2).

// ---------------------------------------------------------------------------
// Types. The ClaraPart union + its supporting scalar types now live in the ONE
// canonical dashboard-side module (INTERFACE-PINS §5 / PIN-DELTA-3). This file
// re-exports them so every existing `import { … ClaraPart } from "./api"` keeps
// resolving; api.ts is not frozen, so the re-export is lawful. The wire-envelope
// row types (SessionRow / MessageRow / …) stay local — they are not parts.
// ---------------------------------------------------------------------------

import type { ClaraPart, AttachmentPart, ProvenanceTier, Uncertainty, RefusalCode } from "../shared/parts";
export type { ClaraPart, AttachmentPart, ProvenanceTier, Uncertainty, RefusalCode };

export type SessionRow = {
  id: string;
  title: string | null;
  client_id: string | null;
  visibility: "private" | "firm";
  created_by: string;
  created_at: string;
};

export type MessageRow = {
  id: string;
  role: "user" | "assistant";
  parts: ClaraPart[];
  turn_key: string | null;
  task_id: string | null;
  seq: number;
  created_at: string;
};

export type TaskRow = {
  id: string;
  kind: string;
  status: string;
  error_code: string | null;
  session_id: string | null;
  created_at: string;
};

export type InterruptionRow = {
  id: string;
  status: string;
  question: { question?: string; context?: string | null; framing?: string } | null;
  expires_at: string;
};

export type TurnResult =
  | { kind: "accepted"; taskId: string }
  | { kind: "conflict"; message: string }
  | { kind: "limit"; message: string; resetCopy: string | null; resetUtc: string | null }
  | { kind: "error"; message: string };

export type SseEvent = { event: string; data: unknown };

// ---------------------------------------------------------------------------
// Config. Empty runtime base = same-origin (next.config.mjs proxies /api/chat +
// /api/tasks to the runtime — it serves no CORS headers, so direct cross-origin
// browser calls need NEXT_PUBLIC_CLARA_RUNTIME_URL on a CORS-enabled deployment).
// ---------------------------------------------------------------------------

export function runtimeBase(): string {
  return (process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL ?? "").replace(/\/+$/, "");
}

export function supabaseBase(): string | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return url.length > 0 ? url : null;
}

/** Best-effort sub claim from the pasted JWT (labels "my" sessions; not authz). */
export function jwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1] ?? "";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// AGENT lane — the runtime.
// ---------------------------------------------------------------------------

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

async function expectJson<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${what} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function listSessions(token: string): Promise<SessionRow[]> {
  const res = await runtimeFetch("/api/chat/sessions", token);
  const body = await expectJson<{ sessions: SessionRow[] }>(res, "list sessions");
  return body.sessions ?? [];
}

export async function createSession(
  token: string,
  opts: { title?: string; clientId?: string },
): Promise<string> {
  const res = await runtimeFetch("/api/chat/sessions", token, {
    method: "POST",
    body: JSON.stringify({ title: opts.title || undefined, clientId: opts.clientId || undefined }),
  });
  const body = await expectJson<{ session_id: string }>(res, "create session");
  return body.session_id;
}

export async function getMessages(token: string, sessionId: string): Promise<MessageRow[]> {
  const res = await runtimeFetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, token);
  const body = await expectJson<{ messages: MessageRow[] }>(res, "load messages");
  return body.messages ?? [];
}

/** Post a turn with a client-generated turn_key. 202 → taskId; 409/429 typed.
 *  Attachment parts (already adopted — document_id known) ride in the SAME parts
 *  array as the text, present at begin_chat_turn (append-only; §4.5). */
export async function postTurn(
  token: string,
  sessionId: string,
  text: string,
  turnKey: string,
  attachments: AttachmentPart[] = [],
): Promise<TurnResult> {
  let res: Response;
  try {
    res = await runtimeFetch(`/api/chat/${encodeURIComponent(sessionId)}/turns`, token, {
      method: "POST",
      body: JSON.stringify({ turnKey, parts: [{ type: "text", text }, ...attachments] }),
    });
  } catch (err) {
    return { kind: "error", message: `network error: ${(err as Error).message}` };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 202) return { kind: "accepted", taskId: String(body.task_id) };
  if (res.status === 409)
    return { kind: "conflict", message: asString(body.message) ?? "this session already has a turn in progress" };
  if (res.status === 429)
    return {
      kind: "limit",
      message: asString(body.message) ?? "usage limit reached",
      resetCopy: asString(body.reset_copy),
      resetUtc: asString(body.reset_utc),
    };
  return { kind: "error", message: `${res.status}: ${asString(body.message) ?? asString(body.error) ?? "request failed"}` };
}

/** SSE attach via streaming fetch (the runtime authenticates on the Authorization
 *  header — streamRoute.ts:29 — which the EventSource API cannot send). */
export async function* streamTask(token: string, taskId: string, signal: AbortSignal): AsyncGenerator<SseEvent> {
  const res = await fetch(`${runtimeBase()}/api/tasks/${encodeURIComponent(taskId)}/stream`, {
    headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
    cache: "no-store",
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`stream attach failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) continue;
        try {
          yield { event, data: JSON.parse(dataLines.join("\n")) };
        } catch {
          // a malformed frame is skipped, never fatal
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// HUMAN lane — Supabase PostgREST (session JWT + anon apikey; the clara schema
// must be among the API's exposed schemas — the Profile headers select it).
// ---------------------------------------------------------------------------

function pgrestHeaders(token: string, forWrite: boolean): Record<string, string> {
  const h: Record<string, string> = {
    authorization: `Bearer ${token}`,
    [forWrite ? "Content-Profile" : "Accept-Profile"]: "clara",
  };
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (anon) h.apikey = anon;
  if (forWrite) h["content-type"] = "application/json";
  return h;
}

export type PgrestError = Error & { pgCode?: string; pgDetails?: string; clr?: string | null; reason?: string | null };

async function pgrestError(res: Response, what: string): Promise<PgrestError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string; hint?: string; details?: string };
  const detail = [body.code, body.message].filter(Boolean).join(" — ");
  const err = new Error(`${what} failed (${res.status})${detail ? `: ${detail}` : ""}`) as PgrestError;
  // Surface the governed CLR envelope so the je_review card can branch honestly:
  // the CLR code IS the SQLSTATE (PostgREST reports it as `body.code`); the machine
  // reason token lives in the exception DETAIL as `{"reason": <token>}`
  // (INTERFACE-PINS §2 / C-20). Kept in step with shared/wire.ts parseClrCode — this
  // module deliberately keeps its own copies (sealed Slice-4 artifact).
  err.pgCode = body.code;
  err.pgDetails = body.details;
  err.clr = parseClrCode(body.code, body.message);
  err.reason = parseReasonToken(body.details);
  return err;
}

/** The governed CLR code rides in the SQLSTATE (`using errcode='CLR21'`), which
 *  PostgREST reports as `body.code`. No governed raise embeds the token in its message
 *  text, so the message regex is a defensive fallback only. */
export function parseClrCode(code?: string, message?: string): string | null {
  if (code && /^CLR\d{2}$/.test(code)) return code;
  return (message ?? "").match(/CLR\d{2}/)?.[0] ?? null;
}

/** The CLR21 discriminant (`amount_conflict` / `currency_unsupported` / …) rides in
 *  the exception DETAIL as a json object (INTERFACE-PINS §2). Defensive parse. */
function parseReasonToken(details?: string): string | null {
  if (!details) return null;
  try {
    const j = JSON.parse(details) as { reason?: unknown };
    return typeof j.reason === "string" ? j.reason : null;
  } catch {
    return null;
  }
}

export async function rpc(fn: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  const base = supabaseBase();
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured (governance acts need PostgREST)");
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: pgrestHeaders(token, true),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw await pgrestError(res, fn);
  return res.json().catch(() => null);
}

async function pgrestSelect<T>(pathAndQuery: string, token: string): Promise<T[]> {
  const base = supabaseBase();
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    headers: pgrestHeaders(token, false),
    cache: "no-store",
  });
  if (!res.ok) throw await pgrestError(res, "read");
  return (await res.json()) as T[];
}

/** Live chat_turn tasks of a session, via the masked view (§4.8: the page reads
 *  agent_tasks_visible only). session_id is unmasked for the author + shared. */
export async function liveTasks(token: string, sessionId: string): Promise<TaskRow[]> {
  const q =
    `agent_tasks_visible?session_id=eq.${encodeURIComponent(sessionId)}` +
    `&kind=eq.chat_turn&status=in.(queued,running,awaiting_input,cancel_requested)` +
    `&select=id,kind,status,error_code,session_id,created_at&order=created_at.desc`;
  return pgrestSelect<TaskRow>(q, token);
}

export async function taskById(token: string, taskId: string): Promise<TaskRow | null> {
  const q =
    `agent_tasks_visible?id=eq.${encodeURIComponent(taskId)}` +
    `&select=id,kind,status,error_code,session_id,created_at`;
  const rows = await pgrestSelect<TaskRow>(q, token);
  return rows[0] ?? null;
}

export async function pendingInterruption(token: string, taskId: string): Promise<InterruptionRow | null> {
  const q =
    `agent_interruptions?task_id=eq.${encodeURIComponent(taskId)}&status=eq.pending` +
    `&select=id,status,question,expires_at&order=created_at.desc&limit=1`;
  const rows = await pgrestSelect<InterruptionRow>(q, token);
  return rows[0] ?? null;
}

/** The clarify ANSWER — human lane by governance law (§4.2), typed payload. */
export async function answerInterruption(token: string, interruptionId: string, answerText: string): Promise<void> {
  await rpc(
    "answer_interruption",
    { p_id: interruptionId, p_answer: { type: "text", text: answerText }, p_op_key: crypto.randomUUID() },
    token,
  );
}

export async function cancelTask(token: string, taskId: string): Promise<void> {
  await rpc("cancel_agent_task", { p_task: taskId, p_op_key: crypto.randomUUID() }, token);
}

export async function shareSession(token: string, sessionId: string): Promise<void> {
  await rpc("share_chat_session", { p_session: sessionId, p_op_key: crypto.randomUUID() }, token);
}
