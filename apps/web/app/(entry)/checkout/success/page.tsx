import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { CheckoutSuccessCard } from "@/components/entry/checkout-success-card";
import {
  checkoutFlashCookie,
  parseCheckoutFlash,
} from "@/lib/checkout/checkout-flash";
import { checkoutSuccessDecisionFrom } from "@/lib/checkout/success-state";
import { NO_CHECKOUT_PROGRESS } from "@/lib/registration/checkout-progress-reads";
import { loadOwnRegistrationRequests } from "@/lib/registration/server-reads";

export async function generateMetadata() {
  const t = await getTranslations("CheckoutSuccess");
  return { title: t("metaTitle") };
}

/**
 * `/checkout/success` — Stripe's `success_url`, and therefore a GET.
 *
 * PAINT-ONLY, WHICH IS THE WHOLE POINT (design part 3 §2, M9). A GET that
 * created a firm would be run by anything that follows a URL: a prefetch, a
 * mail scanner, a browser restoring tabs, a person hitting refresh. The door
 * that creates the tenant is behind an explicit POST on a sibling route, and
 * this page's only job is to say which of the five states the applicant is in
 * and, on exactly one of them, offer the button.
 *
 * WHY IT IS REGISTERED IN `SCOPE_UNSCOPED_SURFACES` AND NOT PUBLIC. It needs a
 * session (the reads are the caller's own) and must NOT need a firm — the firm
 * is what the next click creates. That is the same shape `/pending` has, and
 * it is registered the same way: no `public: true`, absent from
 * `PUBLIC_PATH_PREFIXES`, and `requireFirmScope()` is never called here
 * because it would redirect a firm-less caller to the holding page, which is
 * precisely the person this page exists for.
 *
 * THE READ IS WRAPPED, like `/pending`'s: a transport failure renders the
 * `unavailable` card rather than throwing this route into the error boundary.
 * A person who has just paid money must never meet a stack trace.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A refusal from the sibling claim POST, if this render follows one. The
  // marker is opaque and the values come from the cookie — see
  // `lib/checkout/checkout-flash.ts` for why a refusal never rides the URL.
  const params = await searchParams;
  const marker = typeof params.claim === "string" ? params.claim : undefined;
  const jar = await cookies();
  const flash = parseCheckoutFlash(jar.get(checkoutFlashCookie().name)?.value, marker);
  if (flash !== null) {
    // The claim route only ever sets `refused` or `unavailable` on this
    // surface; anything else in the cookie is a shape this page will not
    // render, and `unavailable` is the honest card for it.
    return flash.kind === "refused"
      ? <CheckoutSuccessCard state={{ kind: "refused", code: flash.code, message: flash.message }} />
      : <CheckoutSuccessCard state={{ kind: "unavailable" }} />;
  }

  try {
    const result = await loadOwnRegistrationRequests();
    const progress = result.ok ? result.checkoutProgress : NO_CHECKOUT_PROGRESS;
    const decision = checkoutSuccessDecisionFrom(result, progress);
    // `claimable` carries the registration id for the POST's own use; the card
    // never renders it and no hidden field carries it (NIT-6).
    const kind = decision.kind === "claimable" ? "claimable" : decision.kind;
    return <CheckoutSuccessCard state={{ kind }} />;
  } catch {
    return <CheckoutSuccessCard state={{ kind: "unavailable" }} />;
  }
}
