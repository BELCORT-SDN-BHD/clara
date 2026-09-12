import { useTranslations } from "next-intl";
import Link from "next/link";

import type { CheckoutFlashPayload } from "@/lib/checkout/checkout-flash";
import { paymentFailureKindFrom } from "@/lib/checkout/payment-failure";
import type { PaymentsMode } from "@/lib/checkout/payments-mode";
import type { HoldingState } from "@/lib/registration/holding-state";
import { businessDateTime } from "@/lib/business-date";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { StateBanner } from "@/components/common/state";
import { TechnicalDetail } from "@/components/common/technical-detail";
import { PostControl } from "@/components/entry/post-control";
import { RegistrationReference } from "@/components/entry/registration-reference";
import { Badge } from "@/components/ui/badge";
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
 * (裁-43, restated by 裁-57). Every piece of that now exists: the legal
 * acceptance door (`accept_legal_document`), `POST /checkout`, C-5's webhook and applier, and the folded
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
 * registration exists, renders the LEGAL STAGE (`signup-legal-stage.tsx` —
 * both agreements, each accepted on its own) instead of the firm form again. A
 * `<Link>`, because that destination is a real GET page.
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
 * ===========================================================================
 * #628 — `checkout_open` SPLITS INTO FIVE FACES, AND THE MODE IS DECLARED
 * ===========================================================================
 * `checkout_open` said one thing — "a session is open, resume it" — about five
 * different worlds, and the resume control was offered in all of them. An
 * applicant whose card was DECLINED read "it won't complete on its own — resume
 * it below" and pressed a button that opened a second checkout; an applicant
 * whose bank was still confirming read the same sentence and was invited to pay
 * twice. Migration 0186's `checkout_intents.status` is what makes the five
 * separable, and each now carries the ONE act that is actually available:
 * resume, wait, try again, start again, or nothing at all.
 *
 * THE BETA/TEST BADGE IS THE SERVER'S DECLARED MODE, NOT A GUESS.
 * `CLARA_STRIPE_LIVEMODE` is the same variable `stripe-session.ts`'s key-class
 * gate and the runtime's webhook gate both read, parsed by that module's own
 * closed vocabulary — never `Boolean(raw)`, because `Boolean("false")` is true
 * and a deployment meaning test mode would be badged live. Test ⇒ a visible
 * badge saying nothing is charged; live ⇒ no badge (a live deployment does not
 * need to reassure anyone); UNSET ⇒ a plain statement that payments are not
 * configured, which is a DIFFERENT sentence from "temporarily unavailable"
 * because no amount of waiting fixes it.
 *
 * BOTH NEW ARMS ARE NOW REACHABLE FROM A LIVE READ.
 * `checkout-progress-reads.ts` calls `clara.get_own_checkout_progress`, the
 * self-scoped door this train adds — the two C-3 tables themselves stay
 * ungranted to every application role, permanently, which is why a door and
 * not a grant.
 */
/** The deployment's declared Stripe mode, as the page resolved it server-side
 *  from `CLARA_STRIPE_LIVEMODE`. Moved to `lib/checkout/payments-mode.ts` when
 *  `/checkout/success` grew the same badge (#628 review, 7.3) and re-exported
 *  here so this card's existing callers keep one name for it. */
export type { PaymentsMode };

/** The faces where a payment is still AHEAD of the person, and therefore the
 *  faces that owe a statement about what a payment would do. `paid`,
 *  `checkout_processing` and `capacity_full` are deliberately absent: the money
 *  is already committed, or there is no pay control to qualify. */
const PRE_PAYMENT_FACES: ReadonlySet<HoldingState["kind"]> = new Set([
  "pending",
  "checkout_open",
  "checkout_awaiting_payment",
  "checkout_failed",
  "checkout_expired",
  "checkout_cancelled",
]);

/** The DB's own timestamp in the business timezone, or nothing. An unreadable
 *  value renders NO line rather than "Invalid Date". */
function statusTimeLine(statusAt: string | null): string | null {
  if (statusAt === null) return null;
  const parsed = new Date(statusAt);
  return Number.isFinite(parsed.getTime()) ? businessDateTime(parsed) : null;
}

export function HoldingCard({
  state,
  checkoutRefusal = null,
  paymentsMode = "unconfigured",
}: {
  state: HoldingState;
  /** The outcome of a `POST /checkout` that refused and redirected here, read
   *  from its unforgeable flash cookie. `null` on an ordinary visit. */
  checkoutRefusal?: CheckoutFlashPayload | null;
  /** #628 — the SERVER's declared Stripe mode. Defaults to `"unconfigured"`
   *  so a caller that has not resolved it says the most cautious true thing
   *  rather than silently implying a live deployment. */
  paymentsMode?: PaymentsMode;
}) {
  const t = useTranslations("Pending");
  // The agreements' names live in `Common`, once — `signup-legal-stage.tsx`
  // reads the same two keys (7.3). So, now, do the two payments-mode statements
  // and the reference label, which `/checkout/success` renders too.
  const tCommon = useTranslations("Common");
  // The seven failure sentences: ONE namespace, read by this face and by
  // `checkout-success-card.tsx`. They used to be duplicated under `Pending` and
  // `CheckoutSuccess`, two copies of one decision free to drift (7.3).
  const tFailure = useTranslations("PaymentFailure");

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
        {checkoutRefusal !== null && checkoutRefusal.kind === "legal_not_accepted" && (
          /* THE ONE REFUSAL WITH A NEXT STEP (#621). Every other arm tells the
             person what happened; this one also tells them where to go, because
             the fix is theirs to make and it is one link away. The outstanding
             agreements are the DOOR'S OWN list, named from `Common` so this card
             and the legal stage cannot drift apart about what they are called. */
          <StateBanner
            tone="error"
            action={
              <Link
                href="/signup"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {t("checkoutRefusalLegalAction")}
              </Link>
            }
          >
            <p>{t("checkoutRefusal.legal_not_accepted")}</p>
            {checkoutRefusal.missing.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4">
                {checkoutRefusal.missing.map((kind) => (
                  <li key={kind}>
                    {kind === "terms" ? tCommon("legalKindTerms") : tCommon("legalKindDpa")}
                  </li>
                ))}
              </ul>
            )}
          </StateBanner>
        )}
        {checkoutRefusal !== null && checkoutRefusal.kind !== "legal_not_accepted" && (
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
            {/* A REAL link — /signup renders the legal stage for an open
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
            <PostControl action="/checkout" label={t("checkout_open.resume")} />
          </>
        )}

        {/* #628 — THE FIVE INTENT FACES. Each carries the one act that is
            genuinely available to the person in that state, and NONE of them
            carries "resume checkout" unless resuming is actually possible. */}
        {state.kind === "checkout_awaiting_payment" && (
          <>
            <StateBanner tone="info" title={state.firmName}>
              <p>{t("checkout_awaiting_payment.banner")}</p>
              {statusTimeLine(state.statusAt) !== null && (
                <p className="mt-1.5">
                  {t("checkoutSince", { when: statusTimeLine(state.statusAt) as string })}
                </p>
              )}
            </StateBanner>
            {/* A form POST, never a <Link>: /checkout is POST-only, and the
                route now RESUMES rather than mints — `open_checkout_intent`
                refuses `checkout_in_progress` for a live Session and the route
                sends the person back to that same Session's hosted page. One
                live Session per applicant is the DB's rule; this control obeys
                it instead of racing it.

                GATED ON `resumable` (#628 review). `paid` and `consumed` reach
                this face too — money landed, no claimable payment row observed
                yet — and over those there is nothing to pick up and nothing to
                end. Both controls used to render anyway, because both keyed on
                a stamped Session id rather than on the status; pressing either
                bought a round trip to a refusal (`already_paid`). See
                `waitingActsFrom`. */}
            {state.resumable && (
              <PostControl action="/checkout" label={t("checkout_awaiting_payment.resume")} />
            )}
            {/* ONLY WITH A STAMPED SESSION THAT IS STILL ENDABLE.
                `cancel_checkout_intent` would have nothing for Stripe to expire
                otherwise, and a control that ends a payment must not appear
                where there is no payment left to end. */}
            {state.sessionId !== null && (
              <PostControl action="/checkout/cancel" label={t("checkout_awaiting_payment.cancel")} />
            )}
            {/* NOTHING TO RESUME AND NOTHING TO CANCEL — the settled arm. A
                face with no act at all would leave somebody staring at a
                sentence; a re-read is the one honest thing left, and it is the
                same GET form the processing face uses. */}
            {!state.resumable && (
              <>
                <StateBanner tone="neutral">
                  {t("checkout_awaiting_payment.settledBanner")}
                </StateBanner>
                <form method="get" action="/pending" className="w-full">
                  <Button type="submit" variant="outline" className="w-full">
                    {t("checkoutCheckAgain")}
                  </Button>
                </form>
              </>
            )}
          </>
        )}

        {state.kind === "checkout_processing" && (
          <>
            <StateBanner tone="info" title={state.firmName}>
              <p>{t("checkout_processing.banner")}</p>
              {statusTimeLine(state.statusAt) !== null && (
                <p className="mt-1.5">
                  {t("checkoutSince", { when: statusTimeLine(state.statusAt) as string })}
                </p>
              )}
            </StateBanner>
            {/* NO PAY CONTROL AND NO CANCEL. The money is with the bank; the
                only honest act is to look again. A GET form, so it is a real
                navigation that re-runs the server read rather than a cached
                router entry — and the bounded automatic re-read lives on
                `/checkout/success`, which is the page a person actually waits
                on after paying. This one is a status page they visit. */}
            <form method="get" action="/pending" className="w-full">
              <Button type="submit" variant="outline" className="w-full">
                {t("checkoutCheckAgain")}
              </Button>
            </form>
          </>
        )}

        {state.kind === "checkout_failed" && (
          <>
            <StateBanner tone="warning" title={state.firmName}>
              {/* The PROVIDER's token becomes OUR sentence; see
                  lib/checkout/payment-failure.ts for why it is never printed
                  raw into prose. */}
              {tFailure(paymentFailureKindFrom(state.reason))}
            </StateBanner>
            {state.reason !== null && <TechnicalDetail>{state.reason}</TechnicalDetail>}
            <PostControl action="/checkout" label={t("checkout_failed.retry")} />
          </>
        )}

        {state.kind === "checkout_expired" && (
          <>
            {/* THE SWEPT-TIMEOUT EXPIRY IS ITS OWN SENTENCE — `0186`'s applier
                moves a `processing` intent nobody answered for 24 hours to
                `expired` with `status_reason='processing_timeout'`, which is
                "the bank never came back", not "the checkout page ran out". */}
            <StateBanner tone="warning" title={state.firmName}>
              {paymentFailureKindFrom(state.reason) === "processing_timeout"
                ? tFailure("processing_timeout")
                : t("checkout_expired.banner")}
            </StateBanner>
            <PostControl action="/checkout" label={t("checkout_expired.startAgain")} />
          </>
        )}

        {state.kind === "checkout_cancelled" && (
          <>
            <StateBanner tone="neutral" title={state.firmName}>
              {t("checkout_cancelled.banner")}
            </StateBanner>
            <PostControl action="/checkout" label={t("checkout_cancelled.startAgain")} />
          </>
        )}

        {state.kind === "capacity_full" && (
          // NO CONTROL AT ALL, and the absence is the feature:
          // `open_checkout_intent` refuses `capacity_reached`, so a checkout
          // button here would be an invitation to a refusal.
          <StateBanner tone="warning" title={state.firmName}>
            <p>{t("capacity_full.banner")}</p>
            {/* THE REFERENCE THE COPY SENDS THEM TO SUPPORT WITH. The success
                page's own `capacity_full` promised one and rendered none
                (#628 review); both faces now keep the promise, through the one
                shared component. */}
            <RegistrationReference
              registration={state.registration}
              label={tCommon("registrationReferenceLabel")}
            />
          </StateBanner>
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

        {/* #628 — WHAT A PAYMENT WOULD DO, ON EVERY FACE WHERE ONE IS STILL
            AHEAD. One call site, not a badge repeated inside six arms: the
            statement is about the DEPLOYMENT, not about this applicant's
            state, so it belongs beside the states rather than inside one. */}
        {PRE_PAYMENT_FACES.has(state.kind) && paymentsMode === "test" && (
          <Badge variant="secondary" className="h-auto w-fit py-1 whitespace-normal">
            {tCommon("paymentsTestMode")}
          </Badge>
        )}
        {PRE_PAYMENT_FACES.has(state.kind) && paymentsMode === "unconfigured" && (
          // DISTINCT FROM "temporarily unavailable", deliberately. The
          // `stripe_unavailable` refusal above says "try again in a moment";
          // this says the deployment has not been configured to take payments
          // at all, which no amount of trying again changes.
          <StateBanner tone="warning">{tCommon("paymentsNotConfigured")}</StateBanner>
        )}

        {/* THE ONE ACTION — secondary variant, full width. See
            `components/logout-button.tsx`'s header for why this is the same
            component the firm shell uses rather than a second copy. */}
        <LogoutButton variant="outline" align="stretch" fullWidth />
      </CardContent>
    </Card>
  );
}
