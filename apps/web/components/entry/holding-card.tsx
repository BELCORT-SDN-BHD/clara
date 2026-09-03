import { useTranslations } from "next-intl";
import Link from "next/link";

import type { CheckoutFlashPayload } from "@/lib/checkout/checkout-flash";
import type { HoldingState } from "@/lib/registration/holding-state";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { StateBanner } from "@/components/common/state";
import { LogoutButton } from "@/components/logout-button";

/**
 * THE HOLDING PAGE's CARD — the fourth entry face (裁-2 4b), rendering one of
 * `holdingStateFrom`'s six answers and nothing else.
 *
 * ===========================================================================
 * THREE ANTI-PATTERNS, NAMED AND AVOIDED (Mobbin grounding §1)
 * ===========================================================================
 * The references for this screen — Airwallex's "We are reviewing your details",
 * Stripe's task-progress rail, OKX's "Reviewing", Amie's request-access
 * confirmation — supply three things this screen deliberately does NOT copy:
 *
 *  - **NO STEPPER.** Airwallex's and Stripe's "three steps" are two states
 *    dressed as three. This screen has states, not graduated progress, and a
 *    progress bar would be inventing a position in a sequence the DB does not
 *    track.
 *  - **NO ETA SENTENCE.** OKX promises "up to 24 hours" and Airwallex "1-3
 *    business days"; both are backed by an SLA their own systems enforce.
 *    Clara's queue has none. A fabricated duration is `AGENTS.md` constraint 2
 *    — no model-generated figure in a durable artifact — extended to time, and
 *    it is the easiest lie on this whole screen to tell by accident.
 *  - **NO CROSS-SELL.** Airwallex's "explore while you wait" block below the
 *    fold is the named anti-pattern. Nothing but the state and the one action
 *    renders here.
 *
 * ONE ACTION: LOG OUT, secondary variant. "Return to Dashboard" does not exist
 * for this person — `jwt_firm()` is NULL, so there is no dashboard to return to.
 * `app/logout/route.ts` is EXEMPT from the scope spine BY NECESSITY for exactly
 * this reason (`SCOPE_EXEMPT_SURFACES`): it is the only way out of here, and
 * gating it on membership would strand the very people this screen exists for.
 *
 * ===========================================================================
 * THE CHECKOUT SEAM (裁-58, 裁-68) — NOW BUILT
 * ===========================================================================
 * Under 裁-68 the tier-3 gate is three walls plus payment, and **Stripe checkout
 * success IS the approval** — there is no operator queue for a self-serve firm
 * (裁-43, restated by 裁-57). Every piece of that now exists: the DPA door
 * (`sign_dpa`), `POST /checkout`, C-5's webhook and applier, and the folded
 * `claim_paid_firm`. So the `NotBuiltNote` this card used to carry is REMOVED
 * rather than narrowed — design part 1 §2.1's own instruction, "removed by this
 * train because the thing it names now exists, not edited to say less".
 *
 * 裁-58 binds the words: every plan is FREE until the amounts are ruled, and the
 * UI renders a TRIAL state — **never "RM0"** (裁-42's design wall stands). The
 * copy in `messages/en.json` says "trial", and
 * `components/entry/pending-a11y.test.tsx` pins
 * that no entry-face string contains an RM amount at all.
 *
 * WHAT THE DB SAYS, AND WHY BOTH ROADS STILL RENDER. `request_firm_registration`
 * writes an `open` row, and TWO doors can now close it: the operator's
 * `approve_firm_registration`, and the self-serve `claim_paid_firm` this train
 * wires. So `rejected` and `approved` keep reporting the operator road — it is
 * still real, for an invited firm — while the three arms below carry the paid
 * road. The card reports the row's actual status either way and never guesses
 * which road a given applicant is on.
 *
 * ===========================================================================
 * FS-4 C-6 (裁-92, checkout-gate-design.md §2.1) — THE THREE ARMS, ALL LIVE
 * ===========================================================================
 * `pending` — "continue to checkout" links to `/signup`, which, once an open
 * registration exists, renders the DPA step (`signup-dpa-form.tsx`) instead of
 * the firm form again. A `<Link>`, because that destination is a real GET page.
 *
 * `checkout_open` — "resume checkout" is a FORM POST to `/checkout`, not a
 * link, and the difference is load-bearing twice over. `/checkout` is POST-only
 * (a GET would let a prefetch open a Stripe Session and spend a rate-wall
 * attempt), and re-POSTing mints a FRESH Session rather than reopening the
 * stored one: `open_checkout_intent` reuses only an UNSTAMPED current-plan
 * intent, so a stamped one is never handed back. That is what closes N4 — the
 * "check the Stripe session's status and expiry first" contract PR #488 left
 * for this lane. There is nothing stale to check, because nothing stored is
 * reused.
 *
 * `paid` — "finish opening your firm" is a `<Link>` to `/checkout/success`,
 * which is a PAINT-ONLY GET. The door that creates the firm sits behind an
 * explicit POST on that page (M9): a GET that minted a tenant would be run by
 * a prefetch, a mail scanner or a restored tab.
 *
 * BOTH NEW ARMS ARE NOW REACHABLE FROM A LIVE READ.
 * `checkout-progress-reads.ts` calls `clara.get_own_checkout_progress`, the
 * self-scoped door this train adds — the two C-3 tables themselves stay
 * ungranted to every application role, permanently, which is why a door and
 * not a grant.
 */
export function HoldingCard({
  state,
  checkoutRefusal = null,
}: {
  state: HoldingState;
  /** The outcome of a `POST /checkout` that refused and redirected here, read
   *  from its unforgeable flash cookie. `null` on an ordinary visit. */
  checkoutRefusal?: CheckoutFlashPayload | null;
}) {
  const t = useTranslations("Pending");

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t(`${state.kind}.title`)}</h1>
        <CardDescription>{t(`${state.kind}.description`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* THE CHECKOUT REFUSAL, ABOVE THE STATE. A person who just tried to
            pay and was refused needs to read WHY before they read where their
            application stands. A door's refusal renders its own CLR code and
            its own sentence, verbatim (apps/web/AGENTS.md); every other arm
            has one typed card and no invented cause. */}
        {checkoutRefusal !== null && (
          <StateBanner
            tone="error"
            code={checkoutRefusal.kind === "refused" ? checkoutRefusal.code : undefined}
          >
            {checkoutRefusal.kind === "refused"
              ? checkoutRefusal.message
              : t(`checkoutRefusal.${checkoutRefusal.kind}`)}
          </StateBanner>
        )}

        {state.kind === "pending" && (
          <>
            <StateBanner tone="info" title={state.firmName}>
              {t("pending.banner")}
            </StateBanner>
            {/* A REAL link — /signup renders the DPA step for an open
                registration (signup-step.tsx's third fork). Not a Button:
                this is navigation and must work as a link (§ header). */}
            <Link
              href="/signup"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              {t("pending.continueToCheckout")}
            </Link>
            {/* 裁-58 — the words are TRIAL, never an amount. This line used to
                live inside the retired NotBuiltNote; the framing outlives the
                note, so it stays as a plain true statement. */}
            <p className="text-xs text-muted-foreground">{t("pending.trialNote")}</p>
          </>
        )}

        {state.kind === "checkout_open" && (
          <>
            <StateBanner tone="info" title={state.firmName}>
              {t("checkout_open.banner")}
            </StateBanner>
            {/* WIRED (Lane B). A form POST, never a <Link>: /checkout is
                POST-only, and re-POSTing it mints a FRESH Stripe Session
                rather than re-opening a stored one — open_checkout_intent
                reuses only an UNSTAMPED current-plan intent, so a stale
                session_id can never produce a dead link (N4, closed by the
                control's shape rather than by a freshness field). */}
            <form method="post" action="/checkout" className="w-full">
              <Button type="submit" variant="outline" className="w-full">
                {t("checkout_open.resume")}
              </Button>
            </form>
          </>
        )}

        {state.kind === "paid" && (
          <>
            <StateBanner tone="info" title={state.firmName}>
              {t("paid.banner")}
            </StateBanner>
            {/* WIRED (Lane B). A <Link> here, not a form: /checkout/success is
                a PAINT-ONLY GET that reads the person's state and offers the
                explicit claim POST on its own page. The door that creates the
                firm is one deliberate click further on (M9). */}
            <Link
              href="/checkout/success"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              {t("paid.finish")}
            </Link>
          </>
        )}

        {state.kind === "rejected" && (
          <StateBanner tone="warning" title={state.firmName}>
            {/* The DB's OWN reason, VERBATIM — or an honest statement that none
                was recorded. `reason` is nullable (0145:333), and "no reason was
                recorded" is a different fact from an empty reason: rendering a
                blank line for the first would look like a rendering bug, and
                inventing a reason for it would be worse. */}
            {state.reason ?? t("rejected.noReason")}
          </StateBanner>
        )}

        {state.kind === "approved" && (
          <StateBanner tone="info" title={state.firmName}>
            {t("approved.banner")}
          </StateBanner>
        )}

        {state.kind === "invite-expected" && (
          <StateBanner tone="neutral">{t("invite-expected.banner")}</StateBanner>
        )}

        {/* The two fail-closed branches. Both are `tone="error"` and both say
            plainly that nothing was read — never an empty page, which would be
            indistinguishable from "you have no requests" (order §0.5: loading,
            empty and error are three distinguishable states). */}
        {state.kind === "unidentified" && (
          <StateBanner tone="error">{t("unidentified.banner")}</StateBanner>
        )}
        {state.kind === "read-failed" && (
          <StateBanner tone="error">{t("read-failed.banner")}</StateBanner>
        )}

        {/* THE ONE ACTION — secondary variant, full width. See
            `components/logout-button.tsx`'s header for why this is the same
            component the firm shell uses rather than a second copy. */}
        <LogoutButton variant="outline" align="stretch" fullWidth />
      </CardContent>
    </Card>
  );
}
