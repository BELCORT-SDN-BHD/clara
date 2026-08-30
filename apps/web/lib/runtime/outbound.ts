// The outbound credential and header set for the same-origin runtime proxy
// (`app/api/runtime/[...path]/route.ts`).
//
// WHY THIS IS A MODULE AND NOT SIX LINES INSIDE THE ROUTE. It carries the rule
// that the request leaving this app is made as the principal the scope guard
// authorised (#451 Codex HIGH-1) — a rule too load-bearing to prove by reading the
// route's source and trusting the read. A Route Handler file cannot export a
// helper for a test to call (Next validates route exports), so the logic lives
// here and the route composes it.
//
// THE PROXY CARRIES TWO KINDS OF CREDENTIAL, AND CONFLATING THEM BREAKS INTAKE.
// The first version of this fix overwrote `Authorization` on EVERY leg with the
// verified session JWT. The independent review of #451 caught what that would do,
// and the runtime's own contract confirms it (`packages/runtime/README.md:77-81`,
// enforced at `packages/runtime/src/intakeRoutes.ts:76` vs `:101`/`:120`):
//
//   POST /api/intake/documents            → authenticated JWT + live membership
//   PUT  /api/intake/documents/:id/bytes  → Bearer UPLOAD CAPABILITY
//   POST /api/intake/documents/:id/finalize → Bearer UPLOAD CAPABILITY
//
// TWO legs take a capability, not one — `finalize` as well as `bytes`
// (`apps/web/lib/documents/intake.ts:70` and `:105` both send
// `Bearer ${uploadToken}`). Overwriting either with a session JWT would make the
// runtime's `bearerCapability()` reject it and break every document upload.
//
// So the rule is LEG-AWARE, and it is never "both":
//   - SESSION legs: `Authorization` is written from the verified session token.
//     The inbound header is not read. Not preferred-then-fallen-back — never read.
//     Honouring it would let a caller holding a scoped cookie A send
//     `Authorization: Bearer B` and have A's firm scope authorise a request the
//     runtime executes as B.
//   - CAPABILITY legs: the caller's own short-lived upload capability IS the
//     credential the runtime expects, so it is forwarded — but it is REFUSED if it
//     is JWT-shaped, and the session token is never substituted. A capability leg
//     must never carry a JWT and a session leg must never carry the caller's
//     bearer; the request is one or the other, never both.
//     The scope guard still runs for every leg — the cookie session is gated
//     regardless of which credential travels onward.
//
// WHY THE JWT-SHAPE REFUSAL CANNOT FALSE-POSITIVE, measured rather than assumed:
// the runtime mints the capability as `randomBytes(32).toString("base64url")`
// (`packages/runtime/lib/intake.mjs:163`) — ONE base64url segment, no dots. A
// legitimate capability can therefore never look like the three dot-separated
// segments this refuses.
//
// TWO INDEPENDENT WALLS, BOTH PRE-EXISTING AND BOTH PRESERVED (independent review
// 2026-08-27, F3/note16): the outbound header set is BUILT, never copied from the
// inbound request, because a wholesale copy is how the old `rewrites()` proxy
// leaked the entire Supabase cookie jar — refresh token included — to the runtime.

/** The two inbound headers that describe the BODY, and the only ones whose value
 *  the caller legitimately owns. `Cookie`, `Origin`, `Referer` and everything else
 *  are dropped by construction — they are never read. */
const BODY_HEADERS = ["content-type", "content-length"] as const;

export type OutboundLeg = "session" | "capability";

/**
 * The legs that take the caller's upload capability instead of the session JWT,
 * as DATA — matched against the proxied path (everything after `/api/runtime/`),
 * with `*` standing for one dynamic segment.
 *
 * A registry, not a regex, because adding one is a decision someone should have to
 * write down: every entry here is a leg on which a caller-supplied bearer travels
 * to the runtime, which is exactly the shape HIGH-1 was about. The DEFAULT IS
 * `session` — an unknown leg gets our own verified identity, never the caller's
 * header, so the fail-closed direction holds for a route nobody has classified.
 */
export const CAPABILITY_LEGS: ReadonlyArray<{
  readonly path: readonly string[];
  readonly why: string;
}> = [
  {
    path: ["intake", "documents", "*", "bytes"],
    why: "PUT …/bytes — packages/runtime/README.md:79 'Bearer upload capability'; intakeRoutes.ts:101 bearerCapability()",
  },
  {
    path: ["intake", "documents", "*", "finalize"],
    why: "POST …/finalize — packages/runtime/README.md:80 'Bearer upload capability'; intakeRoutes.ts:120 bearerCapability()",
  },
];

/** Which credential this leg takes. Session unless the path matches a registered
 *  capability leg exactly (same length, `*` matching one segment). */
export function legFor(path: readonly string[]): OutboundLeg {
  for (const leg of CAPABILITY_LEGS) {
    if (leg.path.length !== path.length) continue;
    if (leg.path.every((seg, i) => seg === "*" || seg === path[i])) return "capability";
  }
  return "session";
}

/** Three dot-separated base64url segments — a JWS/JWT on the wire. The signature
 *  segment may be empty (`alg: none`), which is precisely the shape a smuggler
 *  would reach for, so it is matched too. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export function isJwtShaped(token: string): boolean {
  return JWT_SHAPE.test(token);
}

/** The bearer value of an `Authorization` header, or `null`. */
export function bearerValue(header: string | null): string | null {
  if (header === null) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? (m[1] as string).trim() : null;
}

export const CAPABILITY_LEG_REFUSAL_STATUS = 400;
export const CAPABILITY_LEG_REFUSAL_BODY = { error: "jwt_on_capability_leg" } as const;

export type OutboundResult =
  | { readonly ok: true; readonly headers: Headers }
  | { readonly ok: false; readonly response: Response };

/**
 * Build the outbound headers for one proxied request.
 *
 * `accessToken` is the token `firmScopeGuard()` verified and whose `caller_context`
 * row authorised this request. On a session leg it becomes the `Authorization`
 * outright. On a capability leg it is NOT sent: the caller's own capability is what
 * the runtime expects there, and substituting a JWT would break the upload.
 *
 * A capability leg with NO inbound `Authorization` forwards no credential at all —
 * the runtime answers its own 401. Substituting the session JWT to "help" would put
 * a real bearer on a leg that never takes one.
 *
 * The runtime authenticates whatever arrives, itself. That is not redundancy to be
 * optimised away — it is the actual authority (hard constraint 2); this function
 * only decides which identity is presented to it.
 */
export function buildOutbound(
  inbound: Headers,
  path: readonly string[],
  accessToken: string,
): OutboundResult {
  const headers = new Headers();
  for (const name of BODY_HEADERS) {
    const value = inbound.get(name);
    if (value) headers.set(name, value);
  }

  if (legFor(path) === "session") {
    headers.set("authorization", `Bearer ${accessToken}`);
    return { ok: true, headers };
  }

  const capability = bearerValue(inbound.get("authorization"));
  if (capability === null) return { ok: true, headers };
  if (isJwtShaped(capability)) {
    return {
      ok: false,
      response: Response.json(CAPABILITY_LEG_REFUSAL_BODY, {
        status: CAPABILITY_LEG_REFUSAL_STATUS,
      }),
    };
  }
  headers.set("authorization", `Bearer ${capability}`);
  return { ok: true, headers };
}
