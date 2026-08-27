// The shared RUNTIME-lane wire primitive (independent review 2026-08-27, N11) —
// lib/documents/intake.ts and bytes.ts's common transport, mirroring lib/wire.ts's
// own discipline (a genuine network failure always surfaces typed, never a raw
// unhandled rejection; a deliberate abort stays distinguishable) but for the
// same-origin runtime proxy (app/api/runtime/[...path]/route.ts) instead of
// PostgREST. RAW RUNTIME BODY TEXT IS NEVER SURFACED UNCLASSIFIED: a failed
// response's body is drained (never left hanging) but never quoted into the thrown
// message — the message names the OPERATION + the STATUS-derived `kind` only;
// copy.ts's `readErrorCopy`-style honest-kind rendering is the caller's job.

import { kindForStatus, type WireErrorKind } from "@/lib/wire-error-kind";

export class RuntimeError extends Error {
  readonly status: number | null;
  readonly kind: WireErrorKind;
  constructor(message: string, opts: { status: number | null; kind: WireErrorKind }) {
    super(message);
    this.name = "RuntimeError";
    this.status = opts.status;
    this.kind = opts.kind;
  }
}

export function isRuntimeError(e: unknown): e is RuntimeError {
  return e instanceof RuntimeError;
}

/** `fetch` itself can reject on a genuine network failure — wrap ONLY that, so it
 *  always surfaces as a typed `RuntimeError`. A DELIBERATE ABORT is explicitly not
 *  wrapped (wire.ts's own carve-out, ported): re-thrown UNCHANGED so a superseded
 *  request (unmount, Remove) stays distinguishable from a real failure. */
export async function safeRuntimeFetch(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e instanceof Error && e.name === "AbortError") || init.signal?.aborted) throw e;
    throw new RuntimeError(`${what}: network request failed`, { status: null, kind: "transport" });
  }
}

/** Classifies a FAILED response by STATUS ONLY. The body is drained (a route
 *  handler upstream may otherwise leave the connection hanging) but never
 *  quoted into the thrown message — see this module's own header.
 *
 *  A REDIRECT is classified explicitly (dev-smoke finding, 2026-08-27): this
 *  app's own `updateSession()` proxy gates EVERY route except /login and
 *  /invite/:token, `/api/runtime/*` included — an expired/missing cookie
 *  session 307s to `/login`. Every caller in this module passes
 *  `redirect: "manual"` (never the fetch default of silently following it),
 *  so that 307 surfaces here as an `opaqueredirect` response (`status: 0`,
 *  `ok: false`) rather than being followed into a 200 `text/html` login page
 *  — the exact "an unauthenticated redirect-follow reports ok:true" class
 *  the intake-allowlist content-type check in bytes.ts also guards against,
 *  closed here at its source instead of only downstream of it. */
export async function expectRuntimeOk(res: Response, what: string): Promise<void> {
  if (res.type === "opaqueredirect") {
    throw new RuntimeError(`${what}: redirected (the session cookie is likely missing or expired)`, { status: null, kind: "unauthenticated" });
  }
  if (res.ok) return;
  await res.text().catch(() => "");
  throw new RuntimeError(`${what} failed`, { status: res.status, kind: kindForStatus(res.status) });
}
