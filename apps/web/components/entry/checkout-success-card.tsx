import { useTranslations } from "next-intl";
import Link from "next/link";

import { StateBanner } from "@/components/common/state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * ⑧'s FACE — `/checkout/success`, paint-only (checkout-gate-design part 3 §2,
 * M9). Stripe's `success_url` is a top-level navigation, so this arrives as a
 * GET, and a GET must never create a firm: this component renders a verdict
 * and, on exactly one arm, an explicit POST button. The same GET-is-inert
 * discipline `/auth/confirm` already has, applied to the surface that CREATES
 * THE TENANT — which is where the first draft of the design did not have it.
 *
 * NO OPTIMISTIC UI AND NO SPINNER. Every arm below is a positively observed
 * state, and the one that would tempt a spinner — paid money, no payment row
 * yet, because the webhook has not been applied — is the security pass's A-M4
 * stranding case. It renders a typed message pointing at support with the
 * facts a support operator needs, never an animation that implies the page is
 * about to fix itself. (It also never auto-refreshes: a page that silently
 * re-POSTs is a page that spends attempts nobody asked it to.)
 *
 * NO NAME AND NO ID CROSSES THE WIRE (NIT-6). There is no hidden field on the
 * form: the claim route reads the registration from the caller's own session,
 * and `claim_paid_firm` reads the firm's name from
 * `firm_registration_requests.firm_name` INSIDE the door. The registration is
 * the authority for what the firm is called; a form field would be a name the
 * browser could retype.
 */
export type CheckoutSuccessState =
  /** A payment row exists and is unconsumed — the one arm with a control. */
  | { readonly kind: "claimable" }
  /** The registration already carries a firm: the door ran, here or in
   *  another tab. Terminal and happy. */
  | { readonly kind: "already_open" }
  /** A-M4. Checkout completed at Stripe, and no payment row has been applied
   *  yet — Stripe retries, and the applier sweeps every minute, so this
   *  usually resolves on its own; it is never a state this page hides. */
  | { readonly kind: "awaiting_payment" }
  /** No open registration for this caller at all. */
  | { readonly kind: "no_registration" }
  /** The reads did not answer. Named, never rendered as "nothing to do". */
  | { readonly kind: "unavailable" }
  /** The claim POST came back with the door's own refusal — verbatim. */
  | { readonly kind: "refused"; readonly code: string; readonly message: string };

export function CheckoutSuccessCard({ state }: { state: CheckoutSuccessState }) {
  const t = useTranslations("CheckoutSuccess");

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t(`${state.kind}.title`)}</h1>
        <CardDescription>{t(`${state.kind}.description`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.kind === "claimable" && (
          <>
            <StateBanner tone="info">{t("claimable.banner")}</StateBanner>
            {/* A REAL form POST to a sibling route, not a fetch: this is the
                act that creates the firm, and it must be an explicit,
                non-idempotent, same-origin navigation the person chose. */}
            <form method="post" action="/checkout/success/claim">
              <Button type="submit" className="w-full">
                {t("claimable.open")}
              </Button>
            </form>
          </>
        )}

        {state.kind === "already_open" && (
          <>
            <StateBanner tone="info">{t("already_open.banner")}</StateBanner>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              {t("already_open.go")}
            </Link>
          </>
        )}

        {state.kind === "awaiting_payment" && (
          // A-M4, and the wording is the point: it says the money is not lost,
          // says what happens next without promising a time, and gives the
          // person somewhere to go. No control, because there is nothing here
          // for them to do that would help.
          <StateBanner tone="warning">{t("awaiting_payment.banner")}</StateBanner>
        )}

        {state.kind === "no_registration" && (
          <StateBanner tone="neutral">{t("no_registration.banner")}</StateBanner>
        )}

        {state.kind === "unavailable" && (
          <StateBanner tone="error">{t("unavailable.banner")}</StateBanner>
        )}

        {state.kind === "refused" && (
          // The door's OWN sentence and code, verbatim — never re-worded and
          // never retried (apps/web/AGENTS.md).
          <StateBanner tone="error" code={state.code}>
            {state.message}
          </StateBanner>
        )}

        <Link href="/pending" className="text-sm text-primary underline">
          {t("backToStatus")}
        </Link>
      </CardContent>
    </Card>
  );
}
