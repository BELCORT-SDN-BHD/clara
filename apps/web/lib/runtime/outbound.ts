// The outbound header set for the same-origin runtime proxy
// (`app/api/runtime/[...path]/route.ts`).
//
// WHY THIS IS A MODULE AND NOT SIX LINES INSIDE THE ROUTE. It carries the fix for
// the Codex review of #451, HIGH-1 — the rule that the request leaving this app
// is made as the SAME principal the scope guard just authorised — and a rule that
// load-bearing has to be provable by driving it, not by reading the route's source
// and trusting the read. A Route Handler file cannot export a helper for a test to
// call (Next validates route exports), so the logic lives here and the route
// composes it.
//
// TWO INDEPENDENT WALLS, BOTH PRE-EXISTING AND BOTH PRESERVED (independent review
// 2026-08-27, F3/note16): the outbound header set is BUILT, never copied from the
// inbound request, because a wholesale copy is exactly how the old `rewrites()`
// proxy leaked the entire Supabase cookie jar — refresh token included — to the
// runtime. Only `content-type` and `content-length` are carried across, and only
// because a streamed body is meaningless without them.

/** The two inbound headers that describe the BODY, and are therefore the only ones
 *  whose value the caller legitimately owns. `Cookie`, `Origin`, `Referer` and
 *  everything else are dropped by construction — they are never read. */
const BODY_HEADERS = ["content-type", "content-length"] as const;

/**
 * Build the outbound headers for one proxied request.
 *
 * `accessToken` is the token `firmScopeGuard()` verified and whose
 * `caller_context` row authorised this request. It is written into
 * `Authorization` UNCONDITIONALLY:
 *
 *   - The inbound `Authorization` is never read. Not preferred-then-fallen-back,
 *     not merged — never read. It is caller-controlled, so honouring it would let
 *     a caller holding a scoped cookie A send `Authorization: Bearer B` and have
 *     A's firm scope authorise a request the runtime then executes as B. The guard
 *     and the governed request would be different principals, which is precisely
 *     what the guard exists to prevent.
 *   - A "use theirs if present, else ours" fallback is the same hole with better
 *     manners: every request that chooses to send a header re-opens it.
 *   - A missing inbound `Authorization` still yields ours, so the honest client
 *     (which does send one) and a client that sends none reach the runtime as the
 *     same, correct principal.
 *
 * The runtime still authenticates this bearer itself. That is not redundancy to be
 * optimised away — it is the actual authority (hard constraint 2); this function
 * only guarantees which identity is presented to it.
 */
export function buildOutboundHeaders(
  inbound: Headers,
  accessToken: string,
): Headers {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${accessToken}`);
  for (const name of BODY_HEADERS) {
    const value = inbound.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}
