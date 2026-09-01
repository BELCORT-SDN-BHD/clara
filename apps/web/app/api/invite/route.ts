import { handleInviteRequest } from "@/lib/members/courier";

/**
 * "/api/invite" — POST only. The SERVER-ONLY MAIL COURIER for
 * `clara.invite_member` (design §4 C; P4-4's order).
 *
 * It exists because `invite_member` hands its caller the PLAINTEXT invite token
 * exactly once, above persistence (`0147:418-423`), and because sending the mail
 * needs a Supabase service-role key. Neither may reach a browser. So the browser
 * posts `{email, role}` here, this handler calls the door AS THE CALLER — the
 * caller's own session, so `clara._human_ctx(clara.role_rank('admin'))` performs
 * the authority check against the real person — and only on a successful return
 * does it use the service key to mint the Supabase half of the link and send. The
 * plaintext goes into the mail body and nowhere else.
 *
 * DELIBERATELY EXEMPT FROM THE SCOPE SPINE (P4-2, design §4 E) — do not "fix"
 * this by adding `requireFirmScope()`. This handler returns no firm-scoped data
 * on its own authority; it calls a governed door as the caller, and
 * `_human_ctx(role_rank('admin'))` already raises CLR04 for a caller with no
 * active membership. THE DB IS THE WALL. A scope check in front would be the
 * courier pretending to be a guard, and would put a second, drifting copy of an
 * authority decision ahead of the real one. The exemption is registered as data
 * in `lib/require-firm-scope.ts`'s `SCOPE_EXEMPT_SURFACES` and asserted by
 * `tests/firm-scope-surfaces.test.ts`, which goes RED if this file starts calling
 * the spine.
 *
 * The decision itself lives in `lib/members/courier.ts`: a Next.js route file may
 * only export the route contract (the HTTP verbs and the segment config), so
 * judgement logic that deserves its own tests cannot live here — the same reason
 * `lib/same-origin.ts` exists rather than sitting inside `app/logout/route.ts`.
 * `tests/invite-courier.test.ts` drives every branch through
 * `handleInviteRequest`, including the one that matters most: NO MAIL WHEN THE
 * DOOR REFUSED, with a positive control proving the send-observer would have
 * fired.
 *
 * POST only, and no GET: issuing an invite is a mutation that sends an
 * irreversible email. A GET route is link-prefetchable and crawlable, which is
 * how a stray link becomes a sent invitation — `app/logout/route.ts`'s own
 * reasoning, and the same same-origin wall backs it up inside the handler.
 */
export async function POST(request: Request): Promise<Response> {
  return handleInviteRequest(request);
}
