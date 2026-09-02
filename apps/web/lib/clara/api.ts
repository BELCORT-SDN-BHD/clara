// The Clara AGENT-lane wire client (P2-RAIL): sessions, messages, turns. Ported from
// the sealed `apps/dashboard/app/chat/api.ts` (the shape stays load-bearing; naming and
// behaviour here track it deliberately) with one change: every call takes a
// `SessionTokenAccessor` instead of a raw token string — the token-accessor seam this
// lane was asked to build (`lib/clara/sessionContract.ts`).
//
// P2 FOLD SEAM B: `parts` are typed as the canonical `ClaraPart` union
// (`lib/parts/types.ts`, owned by the sibling p2-parts lane) rather than this lane's
// former local, structural `ClaraPartLike` stand-in. Re-exported here so callers that
// already `import type { ClaraPartLike } from "./api"` (now `ClaraPart`) don't need to
// reach into `lib/parts/` directly — every call site in this lane only ever reads
// `.type`, so the swap is type-level only.
//
// HUMAN-lane governance RPCs (`answer_interruption`, `cancel_agent_task`,
// `share_chat_session`, …) are deliberately NOT ported here — they ride PostgREST via
// `lib/wire.ts`, which is out of this lane's scope by the work order.

import type { SessionTokenAccessor } from "@/lib/session";

export type { ClaraPart } from "@/lib/parts/types";
import type { ClaraPart } from "@/lib/parts/types";

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

export type TurnResult =
  | { kind: "accepted"; taskId: string }
  | { kind: "conflict"; message: string }
  | { kind: "limit"; message: string; resetCopy: string | null; resetUtc: string | null }
  | { kind: "error"; message: string };

/** The banner text for a `limit` turn result — ported verbatim from
 *  `apps/dashboard/app/chat/api.ts` `limitBanner` (a named, testable seam because the
 *  failure it guards is silent: joining a null `resetCopy` renders the literal string
 *  "null" into a user-facing banner). */
export function limitBanner(message: string, resetCopy: string | null): string {
  return [message, resetCopy].filter((s): s is string => typeof s === "string" && s.trim().length > 0).join(" ");
}

export function runtimeBase(): string {
  return (process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL ?? "").replace(/\/+$/, "");
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Resolves the bearer token or throws a clear, catchable error — every AGENT-lane call
 *  below goes through this so "signed out" never silently becomes an unauthenticated
 *  fetch. */
async function requireToken(auth: SessionTokenAccessor): Promise<string> {
  const token = await auth.getAccessToken();
  if (!token) throw new Error("not signed in");
  return token;
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

async function expectJson<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${what} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads only the `sub` projection from the exact bearer sent to the runtime.
 * This does not authenticate or authorise anything: the runtime independently
 * verifies the bearer before returning the session rows. It only lets the
 * browser choose the caller's own row from that already-authorised result.
 */
export function callerSubjectFromAccessToken(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed: unknown = JSON.parse(globalThis.atob(base64));
    if (typeof parsed !== "object" || parsed === null) return null;
    const subject = (parsed as Record<string, unknown>).sub;
    return typeof subject === "string" && UUID_RE.test(subject) ? subject : null;
  } catch {
    return null;
  }
}

export async function listSessions(auth: SessionTokenAccessor): Promise<SessionRow[]> {
  const token = await requireToken(auth);
  const res = await runtimeFetch("/api/chat/sessions", token);
  const body = await expectJson<{ sessions: SessionRow[] }>(res, "list sessions");
  return body.sessions ?? [];
}

/** One token resolution binds the caller projection to the rows it requested. */
export async function listSessionsForCaller(
  auth: SessionTokenAccessor,
): Promise<{ sessions: SessionRow[]; callerSubject: string }> {
  const token = await requireToken(auth);
  const callerSubject = callerSubjectFromAccessToken(token);
  if (callerSubject === null) throw new Error("session identity is unavailable");
  const res = await runtimeFetch("/api/chat/sessions", token);
  const body = await expectJson<{ sessions: SessionRow[] }>(res, "list sessions");
  return { sessions: body.sessions ?? [], callerSubject };
}

export async function createSession(
  auth: SessionTokenAccessor,
  opts: { title?: string; clientId?: string } = {},
): Promise<string> {
  const token = await requireToken(auth);
  const res = await runtimeFetch("/api/chat/sessions", token, {
    method: "POST",
    body: JSON.stringify({ title: opts.title || undefined, clientId: opts.clientId || undefined }),
  });
  const body = await expectJson<{ session_id: string }>(res, "create session");
  return body.session_id;
}

export async function getMessages(auth: SessionTokenAccessor, sessionId: string): Promise<MessageRow[]> {
  const token = await requireToken(auth);
  const res = await runtimeFetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, token);
  const body = await expectJson<{ messages: MessageRow[] }>(res, "load messages");
  return body.messages ?? [];
}

/** Posts a turn with a client-generated `turnKey` (idempotency key). 202 -> accepted
 *  with a `taskId`; 409/429 come back typed rather than thrown, so the caller can
 *  render them without a try/catch. This resolving does NOT mean the turn is "sent" —
 *  only the stream actually opening does (see `lib/clara/stream.ts` `openTaskStream`). */
export async function postTurn(
  auth: SessionTokenAccessor,
  sessionId: string,
  text: string,
  turnKey: string,
): Promise<TurnResult> {
  let token: string;
  try {
    token = await requireToken(auth);
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
  let res: Response;
  try {
    res = await runtimeFetch(`/api/chat/${encodeURIComponent(sessionId)}/turns`, token, {
      method: "POST",
      body: JSON.stringify({ turnKey, parts: [{ type: "text", text }] }),
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

/** Resolves the bearer token for `lib/clara/stream.ts` (which is not itself an AGENT-
 *  lane wire function — it opens the stream directly against `runtimeBase()`). */
export async function resolveStreamAuth(auth: SessionTokenAccessor): Promise<{ token: string; runtimeBase: string }> {
  return { token: await requireToken(auth), runtimeBase: runtimeBase() };
}
