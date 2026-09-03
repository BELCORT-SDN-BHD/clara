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
//
// EVERY CALL BELOW IS SAME-ORIGIN, THROUGH `app/api/runtime/[...path]/route.ts`.
// It was not always: this file used to prefix each path with a `runtimeBase()` read
// off the browser-exposed `NEXT_PUBLIC_CLARA_RUNTIME_URL`, and the FS-10 cutover prep
// measured that BOTH of that variable's states are broken on a deployed origin —
//   UNSET → `runtimeBase()` is "" → the browser asks apps/web's own origin for
//           `/api/chat/…` and `/api/tasks/…`, which this app has no Route Handler
//           for: a 404 on every chat call and every stream attach.
//   SET   → a cross-origin browser call to the Fly runtime, whose CORS middleware is
//           mounted on `/api/intake` ONLY (`packages/runtime/src/intakeRoutes.ts:60-82`;
//           `chatRoutes`/`streamRoutes` are mounted separately at `index.ts:94-95` and
//           inherit nothing), so the response carries no `Access-Control-Allow-Origin`
//           and the browser blocks it — while re-freezing a URL into the bundle at
//           build time and putting the Supabase JWT back on a direct browser→Fly wire,
//           the two shapes the 2026-08-27 review (F1/F2/F3) and the 2026-07-26 intake
//           incident were about.
// So the chat lane now does what `lib/documents/intake.ts` and `lib/interview/api.ts`
// already did: it asks its OWN origin, and the proxy reads the (server-side-only)
// `CLARA_RUNTIME_URL` at REQUEST time and attaches the guard-verified session bearer
// itself (`lib/runtime/outbound.ts:123-131` defaults every unclassified leg to
// `session`; `:196-198` writes it). `NEXT_PUBLIC_CLARA_RUNTIME_URL` is gone from this
// app entirely — there is no dev-only override, because an override is exactly how the
// broken shape came back.
//
// THE PATH ARITHMETIC, because getting it wrong is silent. The proxy maps
// `/api/runtime/<p…>` → `${CLARA_RUNTIME_URL}/api/<p…>` (`route.ts:53`) — it re-adds
// the runtime's own `/api/` itself. The browser path is therefore the runtime path
// with its `/api` prefix REPLACED by `/api/runtime`, never with `/api/runtime` glued
// in front of it: `/api/runtime` + `/api/chat/sessions` would arrive at the runtime as
// `/api/api/chat/sessions` and 404 there. `lib/clara/api.test.ts` pins the exact
// string every call site below sends.

import type { SessionTokenAccessor } from "@/lib/session";

export type { ClaraPart } from "@/lib/parts/types";
import type { AttachmentPart, ClaraPart } from "@/lib/parts/types";

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

/** `path` is the SAME-ORIGIN proxy path (`/api/runtime/…`), never a runtime-absolute
 *  one — see this module's header for the arithmetic.
 *
 *  `redirect: "manual"` is not cosmetic now that these calls are same-origin: `proxy.ts`
 *  is this app's ONLY auth gate and its matcher covers `/api/…`, so an expired or missing
 *  cookie session answers a 307 to `/login`. Followed (the fetch default) that becomes a
 *  200 `text/html` login page — `expectJson` would try to parse it, and a STREAM attach
 *  would read it as SSE, see no events, and enter the reattach loop. Manual, it surfaces
 *  as an `opaqueredirect` (`status: 0`, `ok: false`) and is classified honestly, exactly
 *  as `lib/documents/runtime-wire.ts:45-54` already does for the intake legs. */
async function runtimeFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    cache: "no-store",
    redirect: "manual",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

/** The one shape a `redirect: "manual"` fetch can return that a status read cannot
 *  describe: an opaque-redirect response reports `status: 0`, so "failed (0)" would be
 *  the honest-looking wrong answer. Named here so both readers below say the same thing. */
const REDIRECTED = "redirected (the session cookie is likely missing or expired)";

async function expectJson<T>(res: Response, what: string): Promise<T> {
  if (res.type === "opaqueredirect") throw new Error(`${what} failed: ${REDIRECTED}`);
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
  const res = await runtimeFetch("/api/runtime/chat/sessions", token);
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
  const res = await runtimeFetch("/api/runtime/chat/sessions", token);
  const body = await expectJson<{ sessions: SessionRow[] }>(res, "list sessions");
  return { sessions: body.sessions ?? [], callerSubject };
}

export async function createSession(
  auth: SessionTokenAccessor,
  opts: { title?: string; clientId?: string } = {},
): Promise<string> {
  const token = await requireToken(auth);
  const res = await runtimeFetch("/api/runtime/chat/sessions", token, {
    method: "POST",
    body: JSON.stringify({ title: opts.title || undefined, clientId: opts.clientId || undefined }),
  });
  const body = await expectJson<{ session_id: string }>(res, "create session");
  return body.session_id;
}

export async function getMessages(auth: SessionTokenAccessor, sessionId: string): Promise<MessageRow[]> {
  const token = await requireToken(auth);
  const res = await runtimeFetch(`/api/runtime/chat/sessions/${encodeURIComponent(sessionId)}/messages`, token);
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
  attachments: AttachmentPart[] = [],
): Promise<TurnResult> {
  let token: string;
  try {
    token = await requireToken(auth);
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
  let res: Response;
  try {
    res = await runtimeFetch(`/api/runtime/chat/${encodeURIComponent(sessionId)}/turns`, token, {
      method: "POST",
      body: JSON.stringify({ turnKey, parts: [{ type: "text", text }, ...attachments] }),
    });
  } catch (err) {
    return { kind: "error", message: `network error: ${(err as Error).message}` };
  }
  // BEFORE the status reads: an opaque-redirect response reports `status: 0`, which is
  // none of the four cases below and would fall through to `0: request failed`.
  if (res.type === "opaqueredirect") return { kind: "error", message: `post turn failed: ${REDIRECTED}` };
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
 *  lane wire function — it opens the stream itself, same-origin, on the proxy path it
 *  owns).
 *
 *  IT NO LONGER HANDS OUT A BASE URL. It used to return `runtimeBase()` beside the
 *  token, and that pair was the whole mechanism by which the SSE attach inherited the
 *  build-time browser URL — deleting the field is what makes the old shape
 *  unreachable rather than merely unused. The token stays because a signed-out attach
 *  must fail HERE, loudly, rather than as a proxy 403 the reattach loop would retry. */
export async function resolveStreamAuth(auth: SessionTokenAccessor): Promise<{ token: string }> {
  return { token: await requireToken(auth) };
}
