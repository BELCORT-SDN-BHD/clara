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
// pgrestRpc take an injected SessionTokenAccessor (@/lib/session) instead of
// a raw token string. apps/web starts fresh with Supabase SSR, where obtaining the
// current session's access token can require an async cookie read; an accessor lets
// every wire call late-bind the freshest token without every caller threading one
// through by hand, and lets a test inject a fixed/failing accessor with no real
// session at all.
//
// FIX-ROUND (independent review, 2 MED findings): every `fetch` and every
// `res.json()` parse — on BOTH the failure path (already handled, `wireError`) and
// the SUCCESS path — is now wrapped so a GENUINE network failure or a malformed
// body always surfaces as a typed WireError, never a raw unhandled rejection; and
// RefusalError now carries `pgCode`/`codeSource` so a REAL governed SQLSTATE is
// distinguishable from a coincidental message-regex match (e.g. migration 0011's
// self-test probe, `code: "ZA011", message: "... CLR05 probe rollback"` — not a
// real refusal).
//
// ROUND-2 (independent review, 2 MED findings): a DELIBERATE ABORT is explicitly
// carved OUT of the "wrap as WireError" net — see safeFetch's own doc — so
// cancelling a superseded request stays distinguishable from a real failure.

import type { SessionTokenAccessor } from "@/lib/session";

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

/** Whether a `parseClrCode` match came from the SQLSTATE itself ("sqlstate" —
 *  trustworthy: PostgREST reported `body.code` as a CLR-shaped errcode) or only from
 *  the defensive message-regex fallback ("message" — a coincidental token loose in
 *  free text, e.g. migration 0011's self-test probe `code: "ZA011", message: "...
 *  CLR05 probe rollback"`, which is NOT a governed refusal). RefusalError.codeSource
 *  carries this same discriminant; exported so it can be checked independently of a
 *  live classification. */
export function clrSource(code?: string): "sqlstate" | "message" {
  return code && /^CLR\d{2}$/.test(code) ? "sqlstate" : "message";
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
  /** The RAW `body.code` PostgREST reported, independent of `code` — present even
   *  when `code` was recovered via the message-regex fallback (in which case
   *  `pgCode` will be a non-CLR-shaped SQLSTATE, e.g. "ZA011"); null when the
   *  response carried no `code` field at all. */
  readonly pgCode: string | null;
  /** "sqlstate" when `code` came from a REAL governed SQLSTATE — trustworthy.
   *  "message" when `code` was recovered only via the defensive message-regex
   *  fallback — a coincidental match, NOT proof of a governed refusal. A caller
   *  that must not act on a coincidental match should check
   *  `codeSource === "sqlstate"` before trusting `code`. */
  readonly codeSource: "sqlstate" | "message";
  constructor(
    code: string,
    message: string,
    opts: { reason: string | null; status: number; pgCode: string | null; codeSource: "sqlstate" | "message" },
  ) {
    super(message);
    this.name = "RefusalError";
    this.code = code;
    this.reason = opts.reason;
    this.status = opts.status;
    this.pgCode = opts.pgCode;
    this.codeSource = opts.codeSource;
  }
}

/** Every other wire failure: an auth rejection (401 — never a governed refusal,
 *  finding 6a), a missing/unconfigured session, a network failure (`fetch` itself
 *  rejected), a malformed response body, or an ungoverned Postgres error (no
 *  CLR-shaped SQLSTATE). `status` is null when the request never reached the
 *  network, or the network call itself failed before any status existed. */
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

/** Type guards — ergonomic, `instanceof`-equivalent predicates for callers/tests
 *  that would rather not import the classes directly. */
export function isRefusalError(e: unknown): e is RefusalError {
  return e instanceof RefusalError;
}
export function isWireError(e: unknown): e is WireError {
  return e instanceof WireError;
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
    return new RefusalError(clr, body.message || clr, {
      reason,
      status,
      pgCode: body.code ?? null,
      codeSource: clrSource(body.code),
    });
  }
  const detail = [body.code, body.message].filter(Boolean).join(" — ");
  return new WireError(detail || `request failed (${status})`, { status, pgCode: body.code ?? null });
}

/** Parse a FAILED response's body defensively — a malformed error body degrades to
 *  `{}` (never throws), which `classifyPgrestFailure` turns into a generic WireError. */
async function wireError(res: Response): Promise<RefusalError | WireError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string; details?: string };
  return classifyPgrestFailure(res.status, body);
}

/** `fetch` itself can reject on a genuine network failure (DNS, connectivity, a
 *  CORS failure) — wrap ONLY that, so it ALWAYS surfaces as a typed WireError,
 *  never a raw, unhandled rejection reaching a card. A DELIBERATE ABORT is
 *  explicitly NOT wrapped (round-2 fix): `signal` exists exactly for the
 *  superseded-request cancellation race (pgrestSelect's own doc — a fast-changing
 *  client picker, an unmounted card), so painting a cancellation as a network
 *  failure would defeat the one thing callers build `signal` for — telling "the
 *  user moved on" apart from "the network failed". An abort re-throws UNCHANGED
 *  (the platform's own DOMException named "AbortError"), checked both by the
 *  thrown error's name AND the signal's own `.aborted` flag (belt-and-braces: some
 *  fetch implementations reject with a differently-shaped error on an
 *  already-aborted signal). */
async function safeFetch(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e instanceof Error && e.name === "AbortError") || init.signal?.aborted) {
      throw e;
    }
    throw new WireError(
      `${what}: network request failed${e instanceof Error && e.message ? ` (${e.message})` : ""}`,
      { status: null },
    );
  }
}

/** Parse a SUCCESSFUL response's body as JSON, required to be present (a read
 *  always returns an array — an empty result is `[]`, never an empty body). A
 *  malformed body throws WireError rather than letting a raw SyntaxError escape. */
async function parseJsonOrThrow<T>(res: Response, what: string): Promise<T> {
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    // The abort carve-out reaches here too: an abort landing mid-body-stream is
    // still cancellation, not a transport failure, and must stay distinguishable.
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new WireError(`${what}: failed to read the response body`, { status: res.status });
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new WireError(`${what}: malformed response body`, { status: res.status });
  }
}

/** Parse a SUCCESSFUL RPC response's body, where an EMPTY body is legitimate (a
 *  void governed function, or a 204) and resolves to `null` — but a NON-EMPTY body
 *  that fails to parse is a malformed response and throws WireError, never silently
 *  swallowed into `null` (the pre-fix behavior: `res.json().catch(() => null)` hid a
 *  malformed body as a false "no result"). */
async function parseOptionalJson(res: Response, what: string): Promise<unknown> {
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    // Same abort carve-out as parseJsonOrThrow — see there.
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new WireError(`${what}: failed to read the response body`, { status: res.status });
  }
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new WireError(`${what}: malformed response body`, { status: res.status });
  }
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
  const res = await safeFetch(
    `${base}/rest/v1/${pathAndQuery}`,
    { headers: pgrestHeaders(token, false), cache: "no-store", signal },
    "read",
  );
  if (!res.ok) throw await wireError(res);
  return parseJsonOrThrow<T[]>(res, "read");
}

/** A governed function call: `POST /rest/v1/rpc/<fn>`. Returns the jsonb result (or
 *  null for a void/empty-bodied response). `signal` is optional and additive — see
 *  pgrestSelect's note. */
export async function pgrestRpc(
  fn: string,
  args: Record<string, unknown>,
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<unknown> {
  const base = supabaseBase();
  if (!base) throw new WireError("NEXT_PUBLIC_SUPABASE_URL is not configured (governed writers need PostgREST)", { status: null });
  const token = await requireToken(session);
  const res = await safeFetch(
    `${base}/rest/v1/rpc/${fn}`,
    { method: "POST", headers: pgrestHeaders(token, true), body: JSON.stringify(args), cache: "no-store", signal },
    fn,
  );
  if (!res.ok) throw await wireError(res);
  return parseOptionalJson(res, fn);
}
