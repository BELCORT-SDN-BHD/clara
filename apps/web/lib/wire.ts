// The HUMAN-lane PostgREST wire client (contract §3.3 / frontend-handoff-2026-08-23
// §3.3): Supabase PostgREST as `clara_authenticated`, `Accept-Profile`/
// `Content-Profile: clara`. Every governed verb (approve, sign, retire, void,
// attest, resolve, dismiss, share, cancel) rides this lane and NEVER the runtime —
// this module deliberately does not touch the AGENT/SSE lane (chat's streaming
// fetch), which is a different sibling lane's build.
//
// Mechanism ported from apps/dashboard/app/shared/wire.ts: the same CLR/status
// classification, the same code-first parse (the CLR code IS the SQLSTATE —
// PostgREST reports it as `body.code`; no governed raise puts the token in its
// message text, so a message-only parse would yield null for every real refusal),
// and the same non-negotiable ordering — HTTP STATUS IS CHECKED BEFORE CLR, so an
// expired/invalid session JWT (a bare 401) can never masquerade as, or be shadowed
// by, a governed CLRxx refusal (dashboard finding 6a, apps/dashboard/app/opening/
// OpeningCeremony.tsx:96-100).
//
// Departure from the dashboard shape (deliberate, task-directed): pgrestSelect/
// pgrestRpc take an injected SessionTokenAccessor (./session-contract.ts) instead of
// a raw token string. apps/web starts fresh with Supabase SSR, where obtaining the
// current session's access token can require an async cookie read; an accessor lets
// every wire call late-bind the freshest token without every caller threading one
// through by hand, and lets a test inject a fixed/failing accessor with no real
// session at all.

import type { SessionTokenAccessor } from "./session-contract";

export function supabaseBase(): string | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return url.length > 0 ? url : null;
}

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

/** The governed CLR code rides in the SQLSTATE (`raise … using errcode='CLRxx'`), so
 *  PostgREST reports it as `body.code`. Code first; the message regex stays as a
 *  defensive fallback only (mirrors apps/dashboard/app/shared/wire.ts:74-77
 *  byte-for-byte — the same ordering, ported, not reinvented). */
export function parseClrCode(code?: string, message?: string): string | null {
  if (code && /^CLR\d{2}$/.test(code)) return code;
  return (message ?? "").match(/CLR\d{2}/)?.[0] ?? null;
}

/** The reason discriminant rides in the exception DETAIL as a json object. Defensive parse. */
export function parseReasonToken(details?: string): string | null {
  if (!details) return null;
  try {
    const j = JSON.parse(details) as { reason?: unknown };
    return typeof j.reason === "string" ? j.reason : null;
  } catch {
    return null;
  }
}

/** A governed refusal: the CLR code + message, carried VERBATIM — never re-worded
 *  (contract §3.3 / §4.8, the parts.tsx precedent). This is the only error shape a
 *  card may print a message from directly; every other failure is operational, not
 *  a business refusal, and must never render as one. */
export class RefusalError extends Error {
  readonly code: string;
  readonly reason: string | null;
  readonly status: number;
  constructor(code: string, message: string, opts: { reason: string | null; status: number }) {
    super(message);
    this.name = "RefusalError";
    this.code = code;
    this.reason = opts.reason;
    this.status = opts.status;
  }
}

/** Every other wire failure: an auth rejection (401 — never a governed refusal,
 *  finding 6a), a missing/unconfigured session, a network failure, or an ungoverned
 *  Postgres error (no CLR-shaped SQLSTATE). `status` is null when the request never
 *  reached the network (e.g. no session, no configured base URL). */
export class WireError extends Error {
  readonly status: number | null;
  readonly pgCode: string | null;
  constructor(message: string, opts: { status: number | null; pgCode?: string | null }) {
    super(message);
    this.name = "WireError";
    this.status = opts.status;
    this.pgCode = opts.pgCode ?? null;
  }
}

/** True when `status` is an auth-layer rejection — an expired/invalid session JWT —
 *  which must NEVER be parsed as a governed refusal even if its body happens to
 *  carry something CLR-shaped by coincidence (finding 6a). */
function isAuthRejection(status: number): boolean {
  return status === 401;
}

/** Classify a failed PostgREST response into a typed wire error. HTTP STATUS IS
 *  CHECKED FIRST, CLR PARSING SECOND — the non-negotiable ordering the frontend
 *  handoff names (§3.3): a 401 can never masquerade as, or be shadowed by, a CLRxx
 *  refusal. Exported (not just used internally) so callers and tests can classify a
 *  captured envelope without a live fetch — see lib/wire.test.ts. */
export function classifyPgrestFailure(
  status: number,
  body: { code?: string; message?: string; details?: string },
): RefusalError | WireError {
  // --- Status first. ---
  if (isAuthRejection(status)) {
    return new WireError(body.message || `session rejected (${status})`, { status, pgCode: body.code ?? null });
  }
  // --- CLR second, only once the status has cleared the auth branch. ---
  const clr = parseClrCode(body.code, body.message);
  if (clr) {
    const reason = parseReasonToken(body.details);
    return new RefusalError(clr, body.message ?? clr, { reason, status });
  }
  const detail = [body.code, body.message].filter(Boolean).join(" — ");
  return new WireError(detail || `request failed (${status})`, { status, pgCode: body.code ?? null });
}

async function wireError(res: Response): Promise<RefusalError | WireError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string; details?: string };
  return classifyPgrestFailure(res.status, body);
}

async function requireToken(session: SessionTokenAccessor): Promise<string> {
  const token = await session.getAccessToken();
  if (!token) throw new WireError("no live session", { status: null });
  return token;
}

/** A firm-scoped read: `GET /rest/v1/<pathAndQuery>`. `signal` is optional and
 *  additive — a caller racing a fast-changing selection (e.g. a client picker) can
 *  pass an AbortController's signal to cancel a superseded request in flight. */
export async function pgrestSelect<T>(
  pathAndQuery: string,
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<T[]> {
  const base = supabaseBase();
  if (!base) throw new WireError("NEXT_PUBLIC_SUPABASE_URL is not configured", { status: null });
  const token = await requireToken(session);
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    headers: pgrestHeaders(token, false),
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await wireError(res);
  return (await res.json()) as T[];
}

/** A governed function call: `POST /rest/v1/rpc/<fn>`. Returns the jsonb result (or
 *  null). `signal` is optional and additive — see pgrestSelect's note. */
export async function pgrestRpc(
  fn: string,
  args: Record<string, unknown>,
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<unknown> {
  const base = supabaseBase();
  if (!base) throw new WireError("NEXT_PUBLIC_SUPABASE_URL is not configured (governed writers need PostgREST)", { status: null });
  const token = await requireToken(session);
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: pgrestHeaders(token, true),
    body: JSON.stringify(args),
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw await wireError(res);
  return res.json().catch(() => null);
}
