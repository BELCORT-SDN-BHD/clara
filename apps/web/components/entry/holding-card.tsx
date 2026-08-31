import { useTranslations } from "next-intl";

import type { HoldingState } from "@/lib/registration/holding-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { NotBuiltNote } from "@/components/common/not-built-note";
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
 * THE CHECKOUT SEAM (裁-58, 裁-68) — honest, dated, and named
 * ===========================================================================
 * Under 裁-68 the tier-3 gate is three walls plus payment, and **Stripe checkout
 * success IS the approval** — there is no operator queue for a self-serve firm
 * (裁-43, restated by 裁-57). That surface does not exist on this tip: no
 * checkout route, no plan flag, no webhook. So this card names the missing train
 * in a `NotBuiltNote` rather than either (a) inventing a "Continue to payment"
 * control that goes nowhere, or (b) staying silent and letting the applicant
 * believe an operator is about to rule on them.
 *
 * 裁-58 binds the words: every plan is FREE until the amounts are ruled, and the
 * UI renders a TRIAL state — **never "RM0"** (裁-42's design wall stands). The
 * copy in `messages/en.json` says "trial", and
 * `components/entry/pending-a11y.test.tsx` pins
 * that no entry-face string contains an RM amount at all.
 *
 * WHAT THE DB STILL SAYS, MEANWHILE. `request_firm_registration` writes an
 * `open` row that `approve_firm_registration` decides, so the pending and
 * rejected renderings below report the operator-queue model the DB actually
 * implements today. This screen tells the truth about both: the row's real
 * status, and the fact that the payment step that will supersede that queue is
 * not built. Reporting only one of the two would be a half-truth either way.
 */
export function HoldingCard({ state }: { state: HoldingState }) {
  const t = useTranslations("Pending");

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t(`${state.kind}.title`)}</h1>
        <CardDescription>{t(`${state.kind}.description`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.kind === "pending" && (
          <>
            <StateBanner tone="info" title={state.firmName}>
              {t("pending.banner")}
            </StateBanner>
            <NotBuiltNote>{t("checkoutNotBuilt")}</NotBuiltNote>
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
