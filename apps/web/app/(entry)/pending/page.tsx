import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { HoldingCard } from "@/components/entry/holding-card";
import { checkoutFlashCookie, parseCheckoutFlash } from "@/lib/checkout/checkout-flash";
import { holdingStateFrom, type HoldingDecision } from "@/lib/registration/holding-state";
import { loadOwnRegistrationRequests } from "@/lib/registration/server-reads";

export async function generateMetadata() {
  const t = await getTranslations("Pending");
  return { title: t("metaTitle") };
}

/**
 * "/pending" — THE HOLDING STATE (design §4 E), and the FOURTH entry face
 * (裁-2 4b, which extended R2's original three-face text by explicit ruling).
 *
 * It is the one screen in this app that must work with `clara.jwt_firm()` NULL:
 * an authenticated session that belongs to no firm. `lib/require-firm-scope.ts`'s
 * `HOLDING_ROUTE` is this URL — every denial at all three scope entrances that
 * redirects, redirects here.
 *
 * ===========================================================================
 * IT MUST NOT CALL `requireFirmScope()`, AND THE REASON IS STRUCTURAL
 * ===========================================================================
 * The spine sends a no-firm caller HERE. A check on this page would send them
 * here again, forever. It is registered in `SCOPE_UNSCOPED_SURFACES` with that
 * reason written out, and `tests/firm-scope-surfaces.test.ts` reds if this file
 * ever starts calling the spine.
 *
 * NOT PUBLIC, EITHER. It requires a SESSION; it just does not require a firm.
 * That is why /pending is absent from `PUBLIC_PATH_PREFIXES` in
 * `lib/supabase/proxy.ts` and why its registry entry carries no `public: true`.
 * An unauthenticated stranger is redirected to /login by the proxy before this
 * page renders — which matters, because this page's whole content is a report on
 * the caller's own registration.
 *
 * ===========================================================================
 * THE READ, AND THE POSITIVE MEMBERSHIP FORK
 * ===========================================================================
 * `loadOwnRegistrationRequests` is SELF-scoped twice over: the view's own
 * `applicant = clara.jwt_sub()` predicate, plus an explicit applicant filter on
 * top of it. Both are needed — the view's predicate is a DISJUNCTION with an
 * operator arm, so an operator-firm owner calling an unfiltered "my requests"
 * read would receive the whole estate's queue (`lib/registration/reads.ts`'s
 * header). No firm-scoped data crosses this page at all.
 *
 * Alongside the SELF-scope registration read, this page positively reads the
 * caller-context projection. A proved member leaves the holding route; an
 * ambiguous or malformed membership fails closed. Only a positively observed
 * `no_membership` denial permits registration history to choose the card.
 *
 * The registration read can succeed, report an unverifiable caller, or THROW. The throw is
 * caught here — and this is not a swallowed guard: nothing on this page decides
 * authority, so there is no denial to lose. What the catch buys is the order
 * §0.5 rule that loading, empty and error stay three distinguishable states. An
 * uncaught throw would hand the person the framework's error boundary, which
 * says nothing about their registration; a silently empty page would tell them
 * they never applied. `read-failed` says what actually happened.
 *
 * `holdingStateFrom` — a pure function in `lib/registration/holding-state.ts` —
 * owns the decision, so every branch including the two fail-closed ones is
 * driven directly by `tests/holding-state.test.ts` with a RED-before mutant
 * each, rather than being reachable only through a live request scope.
 */
export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A refusal from POST /checkout, if this render follows one. The URL carries
  // only an opaque marker; every rendered value comes from an httpOnly,
  // SameSite=Strict cookie nobody but this server could have set for this
  // browser. See lib/checkout/checkout-flash.ts for why a money-surface
  // refusal must never be linkable.
  const params = await searchParams;
  const marker = typeof params.checkout === "string" ? params.checkout : undefined;
  const jar = await cookies();
  const checkoutRefusal = parseCheckoutFlash(jar.get(checkoutFlashCookie().name)?.value, marker);

  let state: HoldingDecision;
  try {
    const result = await loadOwnRegistrationRequests();
    state = holdingStateFrom(result, result.ok ? result.subject : null);
  } catch {
    state = { kind: "read-failed", reason: "read_error" };
  }
  if (state.kind === "member") redirect("/");
  return <HoldingCard state={state} checkoutRefusal={checkoutRefusal} />;
}
