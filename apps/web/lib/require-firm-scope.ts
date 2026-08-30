// THE SCOPE SPINE — one implementation, three entrances.
//
// P4-2, design of record `docs/plan/active/p4-design-2026-08-27.md` §4 E.
//
// WHY THIS IS NOT A LAYOUT CHECK. `app/(firm)` is not the only authenticated
// surface. `app/(full)` (both Clara full-screen escalation routes) and
// `app/api/runtime` are its SIBLINGS, not its children: a Next.js route group adds
// no URL segment and wraps nothing outside itself. A check placed only in
// `(firm)/layout.tsx` therefore leaves a session with no active membership able to
// reach `/clara/:threadId` and the runtime proxy — landing in exactly the
// NULL-`jwt_firm()` state this train exists to eliminate, where every RLS read
// returns zero rows and every governed write raises `CLR04`.
//
// So: ONE decision (`resolveFirmScope`), THREE entrances calling it —
//   1. app/(firm)/layout.tsx              → redirect to the holding route
//   2. app/(full)/layout.tsx              → redirect to the holding route
//   3. app/api/runtime/[...path]/route.ts → 403, NEVER a redirect
// A redirect is not an answer to a data request, which is why the third entrance
// gets its own adapter rather than sharing the layouts'. A FOURTH authenticated
// surface later means calling this helper — the seam is visible, not implicit.
//
// THIS IS NOT THE SECURITY BOUNDARY. `clara._human_ctx` is (design §4 D). RLS
// already returns zero rows and the governed doors already refuse `CLR04` for a
// caller with no membership; this spine exists so the person meets an honest
// holding page instead of an empty, silently-broken app. It fails closed in the
// same direction the DB does, and it never grants anything the DB would not.
//
// FAIL-CLOSED IN EVERY DIRECTION (review law 2 — absence is not evidence, and a
// derived state is not evidence). Only a read that POSITIVELY returned exactly one
// well-formed context row grants. Zero rows, more than one row, a row missing the
// pinned shape, and a read that threw are four DIFFERENT facts and four SEPARATE
// denial reasons — but all four deny. `resolveFirmScope` has no branch that grants
// on anything else.

import { redirect } from "next/navigation";

import {
  loadCallerContext,
  type CallerContextRow,
} from "@/lib/firm/caller-context";
import { serverSessionTokenAccessor } from "@/lib/supabase/server-session";

/**
 * Where a session with no firm scope is sent. ONE constant, so the two layout
 * entrances cannot drift to two different destinations.
 *
 * ORDERING NOTE, recorded rather than papered over: `/pending` is built by P4-3
 * (the (entry) route group), which forks AFTER this train merges. Between the two
 * merges this redirect resolves to Next's not-found page. That is the fail-closed
 * outcome — a no-membership session reaches nothing firm-scoped either way — and
 * it is deliberately NOT softened into "redirect only once the page exists": a
 * conditional wall is a wall with a hole in it, and the window is one train long.
 *
 * `/pending` is NOT public. `lib/supabase/proxy.ts`'s `PUBLIC_PATH_PREFIXES` is
 * unchanged by this train and must stay unchanged: the holding route requires a
 * session, it just does not require a firm (design §4 E). It also must never live
 * under `(firm)` or `(full)` — a holding page inside a scoped group would redirect
 * to itself forever. P4-3 puts it in `(entry)`, a third sibling group this spine
 * does not touch.
 */
export const HOLDING_ROUTE = "/pending";

/** The status the API entrance answers with. Named so the test asserts a STATUS,
 *  not a redirect — the whole point of the third entrance being different. */
export const FIRM_SCOPE_FORBIDDEN_STATUS = 403;

/** The machine-readable body of that refusal. Not user-facing prose, so it does
 *  not route through next-intl: nothing renders it — `lib/documents/intake.ts`
 *  and the bytes viewer read the STATUS. It deliberately says only that firm scope
 *  is missing, never which of the four denial reasons applied: an unauthenticated
 *  probe learns nothing about the estate from it. */
export const FIRM_SCOPE_FORBIDDEN_BODY = { error: "no_firm_scope" } as const;

/** The granted context — the caller's own row of `clara.caller_context`. */
export type FirmScope = CallerContextRow;

/**
 * Why a caller was denied. Every value here DENIES; the taxonomy exists so the
 * denial is legible in a log or a test, never so a caller can treat one of them as
 * a soft failure.
 *
 *  - `no_membership` — the read returned zero rows. The ordinary, expected case:
 *    a signed-in person who has not yet been added to a firm. This is the holding
 *    state's own trigger (design §4 E), not an error.
 *  - `ambiguous` — the read returned more than one row. `uq_membership_active_user`
 *    says this cannot happen; if it does, the DB's own invariant has broken and
 *    picking one row would be this module inventing an answer.
 *  - `malformed` — exactly one row, but it does not carry the pinned shape. A
 *    projection drift or a truncated body; a derived "probably fine" is not
 *    evidence.
 *  - `read_failed` — the read threw: no session, 401, 403, a transport failure, a
 *    malformed body. lib/read.ts's `ReadError` already classified it; the spine
 *    needs only that it did not succeed.
 */
export type ScopeDenialReason =
  | "no_membership"
  | "ambiguous"
  | "malformed"
  | "read_failed";

export type ScopeOutcome =
  | { granted: true; context: FirmScope }
  | { granted: false; reason: ScopeDenialReason };

/** The injectable read. Exists so every fail-closed branch above can be driven in
 *  a test WITHOUT a live PostgREST — a wall whose refusal branch cannot be
 *  exercised is a wall nobody has ever seen close. The three real entrances pass
 *  NOTHING and take the default; `tests/require-firm-scope.test.ts` asserts that
 *  by reading the app tree, so this seam cannot become a way to hand an entrance a
 *  permissive reader. */
export type CallerContextReader = () => Promise<CallerContextRow[]>;

/** The production reader: the caller's own context, on the server request's own
 *  session (lib/supabase/server-session.ts explains why not the browser
 *  singleton). */
export const defaultCallerContextReader: CallerContextReader = () =>
  loadCallerContext(serverSessionTokenAccessor);

/** A row carries the pinned shape only if the three columns this spine and its
 *  consumers actually depend on are present and of the declared type. `role_rank`
 *  is checked as `number | null` because the DB genuinely permits null there (see
 *  lib/firm/caller-context.ts's census) — a null rank is a real, grantable
 *  context, and consumers compare it fail-closed. */
function hasPinnedShape(row: unknown): row is CallerContextRow {
  if (typeof row !== "object" || row === null) return false;
  const r = row as Record<string, unknown>;
  if (typeof r.user_id !== "string" || r.user_id.length === 0) return false;
  if (typeof r.firm_id !== "string" || r.firm_id.length === 0) return false;
  if (typeof r.role !== "string" || r.role.length === 0) return false;
  if (r.role_rank !== null && typeof r.role_rank !== "number") return false;
  return true;
}

/**
 * THE decision — the one implementation. Framework-free on purpose: it neither
 * redirects nor builds a Response, so the same logic can be proven once and then
 * adapted three ways below. Never throws.
 */
export async function resolveFirmScope(
  read: CallerContextReader = defaultCallerContextReader,
): Promise<ScopeOutcome> {
  let rows: CallerContextRow[];
  try {
    rows = await read();
  } catch {
    // Deliberately swallows the classified `ReadError` rather than re-throwing:
    // a failed read must land the caller in the SAME place an empty one does
    // (design §4 E — "a failed read and an empty result both route to the holding
    // state or the 403, and both grant nothing"). Letting it propagate would give
    // a transport blip a different, louder outcome than a genuine absence, and
    // one of the two would eventually be handled as "retry and continue".
    return { granted: false, reason: "read_failed" };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { granted: false, reason: "no_membership" };
  }
  if (rows.length > 1) {
    return { granted: false, reason: "ambiguous" };
  }
  const row = rows[0];
  if (!hasPinnedShape(row)) {
    return { granted: false, reason: "malformed" };
  }
  return { granted: true, context: row };
}

/**
 * ENTRANCES 1 AND 2 — the two Server Component layouts.
 *
 * Returns the caller's context on a grant; on any denial it calls Next's own
 * `redirect()`, which throws `NEXT_REDIRECT` and terminates rendering of the route
 * segment. Nothing downstream of a denial renders, so there is no window in which
 * a firm-scoped layout paints for a caller who has no firm.
 */
export async function requireFirmScope(
  read: CallerContextReader = defaultCallerContextReader,
): Promise<FirmScope> {
  const outcome = await resolveFirmScope(read);
  if (!outcome.granted) {
    redirect(HOLDING_ROUTE);
  }
  return outcome.context;
}

/**
 * ENTRANCE 3 — the runtime API route.
 *
 * Answers with a `Response` on denial instead of redirecting: a 307 to an HTML
 * page is not an answer to `fetch`, and `lib/documents/intake.ts` would read it as
 * an unrecognisable failure rather than a refusal. Returns `null` on a grant so
 * the caller reads `if (refusal) return refusal;` — the guard cannot be
 * accidentally ignored the way a boolean can.
 *
 * Plain `Response.json`, not `NextResponse.json`: this module is imported by two
 * layouts as well, and there is nothing here that needs the Next wrapper. Route
 * Handlers are dynamic by default, so the refusal is not cached.
 */
export async function firmScopeRefusal(
  read: CallerContextReader = defaultCallerContextReader,
): Promise<Response | null> {
  const outcome = await resolveFirmScope(read);
  if (outcome.granted) return null;
  return Response.json(FIRM_SCOPE_FORBIDDEN_BODY, {
    status: FIRM_SCOPE_FORBIDDEN_STATUS,
  });
}

/**
 * THE EXEMPTION REGISTRY — the two authenticated surfaces that deliberately do NOT
 * call this spine, and why.
 *
 * Written as DATA, not prose, because `tests/require-firm-scope.test.ts` asserts
 * each entry against the real app tree: an exempt file that starts calling
 * `requireFirmScope` goes red, and so does an exemption whose reason has been
 * deleted. An unexplained exemption is exactly the thing a later lane "fixes".
 *
 * The rule both entries imply, and the one a fourth surface should be measured
 * against: A SURFACE CALLS `requireFirmScope()` WHEN IT RENDERS OR RETURNS
 * FIRM-SCOPED DATA ON ITS OWN AUTHORITY, AND DOES NOT WHEN A GOVERNED DOOR IS
 * ALREADY THE WALL.
 */
export const SCOPE_EXEMPT_SURFACES: ReadonlyArray<{
  readonly path: string;
  readonly reason: string;
}> = [
  {
    path: "app/logout/route.ts",
    reason:
      "EXEMPT BY NECESSITY. A session with no firm must still be able to log out. " +
      "Gating logout on membership would strand exactly the people the holding " +
      "state exists for — the only way out of /pending is this route. It returns " +
      "no firm-scoped data at all, and its own walls are the ones that matter " +
      "there: an exact same-origin proof (Origin + Sec-Fetch-Site, both " +
      "fail-closed) and POST-only.",
  },
  {
    path: "app/api/invite/route.ts",
    reason:
      "EXEMPT ON PRINCIPLE. P4-4's mail courier calls clara.invite_member AS THE " +
      "CALLER, and clara._human_ctx(role_rank('admin')) already raises CLR04 for a " +
      "caller with no active membership — so THE DB IS THE WALL. Adding a scope " +
      "check in front would be the courier pretending to be a guard, and would put " +
      "a second, drifting copy of an authority decision in front of the real one. " +
      "Built by P4-4; until then this entry binds the file that does not exist yet.",
  },
];
