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
// gets its own adapter. A FOURTH authenticated surface later means calling this
// helper — the seam is visible, not implicit, and
// `tests/firm-scope-surfaces.test.ts` enumerates EVERY route leaf in the tree and
// reds on any it cannot classify.
//
// ONE PRINCIPAL, START TO FINISH (Codex review of #451, HIGH-1). The decision
// resolves the caller's session ONCE — `{accessToken, subject}`, the subject
// verified from that very token — and RETURNS it on a grant. Entrance 3 then
// forwards THAT token to the runtime, overwriting whatever `Authorization` the
// browser sent. Before this, the guard read the cookie session while the proxy
// forwarded a caller-controlled bearer: a caller holding a scoped cookie A could
// send `Authorization: Bearer B` and have A's scope authorise B's request. The
// guard and the governed request are now the same principal by construction, not
// by coincidence.
//
// THIS IS NOT THE SECURITY BOUNDARY. `clara._human_ctx` is (design §4 D). RLS
// already returns zero rows and the governed doors already refuse `CLR04` for a
// caller with no membership; this spine exists so the person meets an honest
// holding page instead of an empty, silently-broken app. It fails closed in the
// same direction the DB does, and it never grants anything the DB would not.
//
// FAIL-CLOSED IN EVERY DIRECTION (review law 2 — absence is not evidence, and a
// derived state is not evidence). Only a read that POSITIVELY returned exactly one
// row carrying every pinned column grants. No session, zero rows, more than one
// row, a row that fails validation, and a read that threw are five DIFFERENT facts
// and five SEPARATE denial reasons — but all five deny.

import { redirect } from "next/navigation";

import {
  isCallerContextRow,
  loadCallerContext,
  type CallerContextRow,
} from "@/lib/firm/caller-context";
import {
  fixedTokenAccessor,
  resolveServerSession,
  type ServerSession,
} from "@/lib/supabase/server-session";

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
 *  is missing, never which denial reason applied: a probe learns nothing. */
export const FIRM_SCOPE_FORBIDDEN_BODY = { error: "no_firm_scope" } as const;

/** The granted context — the caller's own row of `clara.caller_context`. */
export type FirmScope = CallerContextRow;

/**
 * Why a caller was denied. Every value here DENIES; the taxonomy exists so the
 * denial is legible in a log or a test, never so a caller can treat one of them as
 * a soft failure.
 *
 *  - `no_session`    — no usable session, or its subject could not be verified
 *    from its own token. Unreachable through a layout (`lib/supabase/proxy.ts`
 *    redirects an unauthenticated request to /login before any layout renders),
 *    which is exactly why it is checked rather than assumed.
 *  - `no_membership` — the read returned zero rows. The ordinary, expected case:
 *    a signed-in person not yet added to a firm. This is the holding state's own
 *    trigger (design §4 E), not an error.
 *  - `ambiguous`     — more than one row. `uq_membership_active_user` says this
 *    cannot happen; if it does, the DB's own invariant has broken and picking one
 *    row would be this module inventing an answer.
 *  - `malformed`     — exactly one row, but it does not carry every pinned column
 *    at its declared type.
 *  - `read_failed`   — the read threw: 401, 403, a transport failure, a malformed
 *    body. `lib/read.ts`'s `ReadError` already classified it; the spine needs only
 *    that it did not succeed.
 */
export type ScopeDenialReason =
  | "no_session"
  | "no_membership"
  | "ambiguous"
  | "malformed"
  | "read_failed";

/**
 * The outcome. A grant carries BOTH the context and the session it was decided
 * from — that pairing is HIGH-1's fix in the type system: an entrance that needs a
 * token to forward can only get one that this very decision verified, and cannot
 * reach for a second, unverified source.
 */
export type ScopeOutcome =
  | { granted: true; context: FirmScope; session: ServerSession }
  | { granted: false; reason: ScopeDenialReason };

/** The injectable seams. They exist so every fail-closed branch can be DRIVEN in a
 *  test WITHOUT a live request scope — a wall whose refusal branch cannot be
 *  exercised is a wall nobody has ever seen close. The three real entrances pass
 *  NOTHING and take the defaults; `tests/firm-scope-surfaces.test.ts` asserts that
 *  by reading the app tree, so this seam cannot become a way to hand an entrance a
 *  permissive reader. */
export type ScopeDeps = {
  readonly resolveSession?: () => Promise<ServerSession | null>;
  readonly read?: (session: ServerSession) => Promise<CallerContextRow[]>;
};

/** The production read: the caller's own context, on the SAME token the grant will
 *  carry. */
const defaultRead = (session: ServerSession): Promise<CallerContextRow[]> =>
  loadCallerContext(fixedTokenAccessor(session.accessToken));

/**
 * THE decision — the one implementation. Framework-free on purpose: it neither
 * redirects nor builds a Response, so the same logic is proven once and adapted
 * twice below. Never throws.
 */
export async function resolveFirmScope(deps: ScopeDeps = {}): Promise<ScopeOutcome> {
  const resolveSession = deps.resolveSession ?? resolveServerSession;
  const read = deps.read ?? defaultRead;

  let session: ServerSession | null;
  try {
    session = await resolveSession();
  } catch {
    return { granted: false, reason: "no_session" };
  }
  if (session === null) return { granted: false, reason: "no_session" };

  let rows: CallerContextRow[];
  try {
    rows = await read(session);
  } catch {
    // Deliberately swallows the classified `ReadError` rather than re-throwing: a
    // failed read must land the caller in the SAME place an empty one does
    // (design §4 E — "a failed read and an empty result both route to the holding
    // state or the 403, and both grant nothing"). Letting it propagate would give
    // a transport blip a different, louder outcome than a genuine absence, and one
    // of the two would eventually be handled as "retry and continue".
    return { granted: false, reason: "read_failed" };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { granted: false, reason: "no_membership" };
  }
  if (rows.length > 1) {
    return { granted: false, reason: "ambiguous" };
  }
  const row = rows[0];
  if (!isCallerContextRow(row)) {
    return { granted: false, reason: "malformed" };
  }
  return { granted: true, context: row, session };
}

/**
 * ENTRANCES 1 AND 2 — the two Server Component layouts.
 *
 * Returns the caller's context on a grant; on any denial it calls Next's own
 * `redirect()`, which throws `NEXT_REDIRECT` and terminates rendering of the route
 * segment. Nothing downstream of a denial renders, so there is no window in which
 * a firm-scoped layout paints for a caller who has no firm.
 */
export async function requireFirmScope(deps: ScopeDeps = {}): Promise<FirmScope> {
  const outcome = await resolveFirmScope(deps);
  if (!outcome.granted) {
    redirect(HOLDING_ROUTE);
  }
  return outcome.context;
}

/** What entrance 3 gets back. A discriminated union rather than a nullable
 *  Response: on a grant the caller receives the VERIFIED SESSION it must forward,
 *  so "check the scope" and "know whose request this is" cannot come apart. */
export type FirmScopeGuard =
  | { readonly ok: false; readonly response: Response }
  | { readonly ok: true; readonly session: ServerSession };

/**
 * ENTRANCE 3 — the runtime API route.
 *
 * Answers with a `Response` on denial instead of redirecting: a 307 to an HTML
 * page is not an answer to `fetch`, and `lib/documents/intake.ts` would read it as
 * an unrecognisable failure rather than a refusal.
 *
 * On a grant it hands back the session whose `accessToken` the caller MUST send
 * onward. The caller does not choose that token and must not read one off the
 * inbound request (HIGH-1).
 *
 * Plain `Response.json`, not `NextResponse.json`: this module is imported by two
 * layouts as well, and nothing here needs the Next wrapper. Route Handlers are
 * dynamic by default, so the refusal is not cached.
 */
export async function firmScopeGuard(deps: ScopeDeps = {}): Promise<FirmScopeGuard> {
  const outcome = await resolveFirmScope(deps);
  if (!outcome.granted) {
    return {
      ok: false,
      response: Response.json(FIRM_SCOPE_FORBIDDEN_BODY, {
        status: FIRM_SCOPE_FORBIDDEN_STATUS,
      }),
    };
  }
  return { ok: true, session: outcome.session };
}

/**
 * THE ENTRANCE REGISTRY — every surface that calls this spine, as data.
 *
 * `tests/firm-scope-surfaces.test.ts` matches this list against the real `app/`
 * tree BOTH WAYS, and separately classifies every route leaf in the tree against
 * it. That is what makes design §4 E's "a fourth authenticated surface later means
 * calling the helper — the seam is visible, not implicit" a gate rather than a
 * hope.
 */
export const SCOPE_ENTRANCES: ReadonlyArray<{
  readonly path: string;
  readonly onDenial: "redirect" | "403";
}> = [
  { path: "app/(firm)/layout.tsx", onDenial: "redirect" },
  { path: "app/(full)/layout.tsx", onDenial: "redirect" },
  { path: "app/api/runtime/[...path]/route.ts", onDenial: "403" },
];

/**
 * THE UNSCOPED REGISTRY — surfaces that must NOT call the spine, each with the
 * reason it would be wrong to add one.
 *
 * This is the third registry the independent review of #451 asked for (FIND-2),
 * and it exists because "not an entrance and not an exemption" was previously
 * decided by a URL-prefix rule rather than named file by file. A page that renders
 * nothing firm-scoped is not automatically fine — it is fine for a REASON, and the
 * reason belongs where the next lane will read it.
 *
 * `public: true` additionally means the proxy lets the request through with no
 * session at all. Those entries are cross-checked BOTH WAYS against
 * `lib/supabase/proxy.ts`'s own `PUBLIC_PATH_PREFIXES`, so the app's auth gate and
 * this spine's idea of "public" cannot drift apart — that cross-check is what will
 * make P4-3 register `/signup` here when it appends it there.
 *
 * Next's built-in `/_not-found` is deliberately ABSENT: this app ships no
 * `app/not-found.tsx`, so there is no file to register and registering a
 * non-existent path would be an exemption for something nobody can read.
 */
export const SCOPE_UNSCOPED_SURFACES: ReadonlyArray<{
  readonly path: string;
  readonly url?: string;
  readonly public?: true;
  readonly reason: string;
}> = [
  {
    path: "app/login/page.tsx",
    url: "/login",
    public: true,
    reason:
      "The sign-in surface. It must render with NO session, so it can carry no " +
      "session-scoped check at all; gating it would make signing in require being " +
      "signed in.",
  },
  {
    path: "app/invite/[token]/page.tsx",
    url: "/invite",
    public: true,
    reason:
      "The invite-acceptance journey, which by definition runs BEFORE the invitee " +
      "has a membership — accept_invite is the door that mints one. A scope check " +
      "here would refuse every invitee at the exact moment the estate wants them " +
      "in, and it is why the spine lives in the two route-group layouts rather " +
      "than in the root one.",
  },
  {
    path: "app/layout.tsx",
    reason:
      "The ROOT layout wraps every group — the entry surfaces and the holding page " +
      "included. A check here would redirect the invitee mid-acceptance and would " +
      "send /pending to itself forever. Scope belongs to the two scoped groups and " +
      "the one API route, never above them.",
  },
];

/**
 * THE EXEMPTION REGISTRY — authenticated surfaces that deliberately do NOT call
 * this spine, and why.
 *
 * Written as DATA, not prose, because `tests/firm-scope-surfaces.test.ts` asserts
 * each entry against the real app tree: an exempt file that starts calling
 * `requireFirmScope` goes red, and so does an exemption whose reason has been
 * deleted. An unexplained exemption is exactly the thing a later lane "fixes".
 *
 * `pending: true` means the file does not exist yet. A pending exemption grants
 * nothing and excuses nothing — when the file lands, the suite requires it to be
 * re-classified deliberately rather than inheriting an exemption written before
 * anyone could read its body (Codex review of #451, MEDIUM-3).
 *
 * The rule both entries imply, and the one a fourth surface should be measured
 * against: A SURFACE CALLS `requireFirmScope()` WHEN IT RENDERS OR RETURNS
 * FIRM-SCOPED DATA ON ITS OWN AUTHORITY, AND DOES NOT WHEN A GOVERNED DOOR IS
 * ALREADY THE WALL.
 */
export const SCOPE_EXEMPT_SURFACES: ReadonlyArray<{
  readonly path: string;
  readonly reason: string;
  readonly pending?: true;
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
    // `pending` CLEARED BY P4-4, 2026-08-30, in the same PR that wrote the body —
    // which is the step MEDIUM-3 exists to force. What the capability-check of the
    // real body found, so a later reader can re-run it rather than trust it:
    //   · It calls `clara.invite_member` through `lib/members/courier.ts` with the
    //     CALLER'S OWN session accessor — not a service-role client — so
    //     `_human_ctx(role_rank('admin'))` (`0147:376`) judges the real person, and
    //     the role-ceiling wall (`0147:386`) judges their real rank.
    //   · WHAT IT ACTUALLY READS, stated in full because the previous version of
    //     this entry got it wrong. TWO reads, not one: (a) `caller_context`,
    //     self-scoped by the view itself, on the CALLER'S OWN token — used twice,
    //     once as the admin+ preflight and once for the mail's courtesy subject
    //     line; and (b) THE AUTH DIRECTORY, `listUsers` under the SERVICE-ROLE
    //     key, which is ESTATE-WIDE and answers about accounts in no firm at all.
    //     (b) is the reason (a) exists: it is an account-existence oracle, and it
    //     now sits BEHIND the preflight. Neither is a firm-scoped product
    //     relation, which is what this registry is about.
    //   · TRUED 2026-08-30 BY CODEX ROUND 2 (M5/N1). The two bullets here used to
    //     say the route made no pre-door authority-sensitive read and that "none
    //     [of its gates] reads a role". BOTH ARE NOW FALSE, and saying so is the
    //     point of this comment existing: the courier runs an ADMIN+ PREFLIGHT
    //     before the door (`lib/members/courier.ts` step 3b). It had to. Step 4b
    //     asks the auth provider whether an arbitrary address already has an
    //     account, and that question answers differently for an existing and a
    //     free address — an ACCOUNT-EXISTENCE ORACLE that, without the preflight,
    //     any signed-in viewer or membership-less account could walk. The owner's
    //     acceptance of that enumeration (裁-65) is explicitly bounded to admin+,
    //     and a bound enforced only by the door is no bound at all, because the
    //     disclosure happens before the door.
    //   · SO WHY IS THIS STILL EXEMPT? Because the preflight is FAIL-CLOSED AND
    //     CANNOT GRANT. It refuses six ways and admits exactly one shape, and
    //     `_human_ctx(role_rank('admin'))` still judges the request independently
    //     at the door. Two fail-closed checks in series cannot admit anything
    //     either would refuse — which is precisely NOT the "second, drifting copy
    //     of an authority decision" this list exists to keep out. What the spine
    //     would add here is different in kind: `requireFirmScope()` REDIRECTS a
    //     caller to the holding page, which is a page-render decision with no
    //     meaning for a POST-only JSON courier.
    //   · THE CONTROL-FLOW CENSUS FINDS EIGHT PRE-DOOR REFUSAL SITES across
    //     seven conceptual gates, not the five gates this entry used to claim:
    //     (1) same-origin — CSRF; (2) body shape; (3) raw-address ASCII support;
    //     (4) "is there a token at all"; (5) THE ADMIN+ PREFLIGHT, which reads a
    //     role; (6) a SERVER-CONFIG capability check; (7) the estate-wide
    //     directory/mintability check. Only (5) reads authority, and only to
    //     refuse. A wrong explanation the next lane trusts is precisely the
    //     hazard this registry exists to prevent, so the source census in
    //     `tests/firm-scope-surfaces.test.ts` pins the number and order.
    //   · The service-role key it holds never authorises the DB act — it mints the
    //     Supabase half of the invite link AFTER the door has already said yes.
    reason:
      "EXEMPT ON PRINCIPLE. P4-4's mail courier calls clara.invite_member AS THE " +
      "CALLER, and clara._human_ctx(role_rank('admin')) already raises CLR04 for a " +
      "caller with no active membership — so THE DB IS THE WALL. Adding a scope " +
      "check in front would be the courier pretending to be a guard, and would put " +
      "a second, drifting copy of an authority decision in front of the real one. " +
      "Verified against the landed body, not the plan: it returns no firm-scoped " +
      "data on its own authority. It DOES run its own admin+ preflight before the " +
      "door (round 3, N1 / native MEDIUM-1) — it reads the CALLER'S OWN rank from " +
      "caller_context, because the step behind it reads the ESTATE-WIDE auth " +
      "directory under the service-role key and that is an account-existence " +
      "oracle whose accepted audience is admin+. Eight pre-door refusal sites " +
      "across seven conceptual gates; one gate reads a role, and only ever to " +
      "REFUSE: it is not a second copy of " +
      "_human_ctx still judges the act independently.",
  },
];
