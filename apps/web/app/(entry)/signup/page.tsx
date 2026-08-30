import { getTranslations } from "next-intl/server";

import { SignupAccountForm } from "@/components/entry/signup-account-form";
import { SignupFirmForm } from "@/components/entry/signup-firm-form";
import { resolveServerSession } from "@/lib/supabase/server-session";

export async function generateMetadata() {
  const t = await getTranslations("Signup");
  return { title: t("title") };
}

/**
 * "/signup" — the tier-3 self-serve registration face (裁-57: beta is a PAID
 * launch; sign up, pay through Stripe, start your own firm). PUBLIC: it joins
 * `PUBLIC_PATH_PREFIXES` in `lib/supabase/proxy.ts`, and is registered in
 * `SCOPE_UNSCOPED_SURFACES` (`lib/require-firm-scope.ts`) with that reason —
 * `tests/firm-scope-surfaces.test.ts` cross-checks those two lists both ways.
 *
 * IT DOES NOT CALL `requireFirmScope()`, and must not. Its whole job is to serve
 * a caller who has no firm — and, on the first visit, no account at all.
 *
 * ===========================================================================
 * THE SESSION FORK — one route, two steps of one journey
 * ===========================================================================
 * The chain needs a session for its last two calls and cannot have one for its
 * first (email confirmation; see `SignupAccountForm`'s header). So this page
 * resolves the caller ONCE, on the server, and renders the step that is actually
 * reachable:
 *
 *   no session  → `SignupAccountForm`  — supabase.auth.signUp, then "check your
 *                                        email". The confirmation link returns
 *                                        the person to this same URL.
 *   session     → `SignupFirmForm`     — claim_identity, then
 *                                        request_firm_registration, then
 *                                        /pending.
 *
 * THIS FORK IS NOT A GUARD AND GRANTS NOTHING. It chooses which form to paint;
 * every wall on the journey belongs to Supabase Auth and to the two doors, each
 * of which refuses CLR04 on its own authority for a caller who is not
 * authenticated. Rendering the second form to a caller with no session would
 * cost them a refusal, not a leak — which is precisely why this is allowed to be
 * a rendering decision rather than a scope check.
 *
 * `resolveServerSession()` is the ONE server-lane resolution (its own module's
 * header: one principal, start to finish) and is `cache()`d per request. It
 * returns null for no session, an unverifiable one, or a non-uuid subject — all
 * three land on step 1, which is the honest place for a caller who cannot yet
 * call a door.
 *
 * A SIGNED-IN MEMBER WHO WANDERS HERE is not redirected away, and that is
 * deliberate: the second form's own `request_firm_registration` call refuses
 * CLR09 'actor already belongs to a firm' (0145:392) and the person reads the
 * DB's own sentence. A redirect would be this page pre-empting a verdict the DB
 * is the authority on, and it would have to guess where to send them.
 */
export default async function SignupPage() {
  const session = await resolveServerSession();
  return session === null ? <SignupAccountForm /> : <SignupFirmForm />;
}
