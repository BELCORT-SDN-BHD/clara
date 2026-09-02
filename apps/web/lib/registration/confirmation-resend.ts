// THE LANE-B SEAM — the confirmation code's RESEND control.
//
// ORCHESTRATOR RULING (M3, fix round 2026-09-01), superseding this file's
// first cut. The independent review's finding: `email-confirmation-card.tsx`
// called `supabase.auth.resend({type:"signup", email})` DIRECTLY from the
// browser, with a user-typed address, reachable by an UNAUTHENTICATED
// visitor simply by loading `/auth/confirm?status=expired` (or `?status=
// locked`) — no session, no C1/C2 wall, no rate limit of any kind. Supabase's
// own documented posture puts every email-send path under a PROJECT-WIDE
// hourly budget, so that one unwalled button could exhaust the quota shared
// with every legitimate signup's confirmation email — the exact class of
// hole this train's whole thesis (the confirm surface is walled before it
// touches auth) exists to close, reopened by its own resend control.
//
// THE FIX IS THE SAME SHAPE AS EVERY OTHER LANE-B SEAM IN THIS TRAIN, NOT A
// SPECIAL CASE: the browser never calls Supabase directly for this action.
// `requestConfirmationResend` stands in for a future server-side call that
// will run the SAME C1/C2 attempt wall a verify attempt runs
// (`app/(entry)/auth/confirm/verify/confirmation-wall.ts`) before it ever
// asks Supabase to send mail. Its production default REFUSES honestly as
// `{kind:"unavailable"}` — never a fabricated "sent" — for the identical
// reason every other seam here does: a control that looked like it worked
// while doing nothing is the fake receipt `apps/web/AGENTS.md` forbids, and
// a control that silently allowed unwalled resends because "the real wall
// isn't wired yet" would be worse than either.
//
// LANE B'S COMPLETION CONTRACT. Wire this to a route handler (never a direct
// browser-to-Supabase call) that: (1) runs the same confirmation-attempt
// wall this train already built for the verify path, keyed on the SAME
// email + origin digest so a resend spree counts against the identical C1/C2
// budget as a guess spree would; (2) only then calls `supabase.auth.resend`
// server-side. Until that lands, this function is the ONLY path the UI has
// to a resend, and it always refuses.
//
// NOTE FOR THE SEAM↔DOOR COMPLETION TABLE (PR #488, 2026-09-01): unlike
// every other Lane-B seam in this train, `requestConfirmationResend` has NO
// design-specified door to diff against — `checkout-gate-design.md`/`-part2`
// /`-part3` name no resend door at all. Lane B INVENTS the route above
// (and, if it needs one, a door) rather than implementing one already
// specified. Recorded explicitly so a reader of that table can tell
// "no design door exists" apart from "the table forgot this seam".

export type ConfirmationResendOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "unavailable" };

export type RequestConfirmationResend = (
  email: string,
) => Promise<ConfirmationResendOutcome>;

/** THE PRODUCTION DEFAULT. See this module's header. */
export const requestConfirmationResend: RequestConfirmationResend = async () => ({
  kind: "unavailable",
});
