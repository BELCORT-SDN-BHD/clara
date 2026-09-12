import { useTranslations } from "next-intl";
import Link from "next/link";

import { StateBanner } from "@/components/common/state";
import { TechnicalDetail } from "@/components/common/technical-detail";
import { CheckoutWaitingRefresh } from "@/components/entry/checkout-waiting";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { businessDateTime } from "@/lib/business-date";
import { paymentFailureKindFrom } from "@/lib/checkout/payment-failure";
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
 * state. The arm that would tempt a spinner — money in flight, no payment row
 * yet — renders a typed message and a control that RE-READS THE SERVER, never
 * an animation that implies the page is about to fix itself.
 *
 * #628 CHANGED ONE CLAUSE OF THAT, AND IT IS WORTH STATING WHAT AND WHY. This
 * header used to end "(It also never auto-refreshes: a page that silently
 * re-POSTs is a page that spends attempts nobody asked it to.)" The reasoning
 * was about POSTING — spending rate-wall budget, minting Stripe objects — and
 * it still holds absolutely: nothing on this page posts by itself. What was
 * wrong was the conclusion drawn from it. An applicant whose bank is confirming
 * a payment was told "leave this page and come back", which asks a person who
 * has just paid money to invent their own polling loop. A bounded, read-only
 * refresh is not the thing that clause forbade; `checkout-waiting.tsx` carries
 * the full argument and the bound.
 *
 * TEN FACES, NOT FIVE. Migration 0186's `checkout_intents.status` is what made
 * "we have not seen your payment" separable into waiting, processing, failed,
 * expired and cancelled — four of which used to read as the first one, so a
 * person whose card was DECLINED was told their payment would probably arrive
 * on its own. See `lib/checkout/success-state.ts` for the decision, which this
 * component renders and never re-derives.
 *
 * NO NAME AND NO ID CROSSES THE WIRE (NIT-6). There is no hidden field on any
 * form here: the claim, cancel and retry routes all read the registration from
 * the caller's own session. The registration reference DOES reach the screen on
 * exactly one arm — after the bounded wait has given up — because at that point
 * the only remaining act is a person quoting it to support. Rendering a value
 * is not the same as accepting one.
 */
export type CheckoutSuccessState =
  /** A payment row exists and is unconsumed — the one arm with a claim control. */
  | { readonly kind: "claimable" }
  /** The registration already carries a firm: the door ran, here or in
   *  another tab. Terminal and happy. */
  | { readonly kind: "already_open" }
  /** #628 — the intent is `processing`: an asynchronous payment the bank is
   *  confirming. Bounded auto-refresh plus a manual re-read; no claim control,
   *  because there is nothing yet to claim. */
  | {
      readonly kind: "processing";
      readonly statusAt: string | null;
      readonly registration: string;
    }
  /** Checkout was opened at Stripe and nothing has come back about it yet —
   *  Stripe retries, and the applier sweeps, so this usually resolves on its
   *  own; it is never a state this page hides.
   *
   *  NOT A-M4, though an earlier label said so. A-M4 is the paid-THEN-joined-a-
   *  firm stranding, and that one reaches the person through the `refused` arm
   *  carrying the door's own `CLR10 actor already belongs to a firm`. */
  | {
      readonly kind: "awaiting_payment";
      readonly statusAt: string | null;
      /** Non-null ⇒ a live Session exists, so "cancel and start again" has
       *  something to cancel. Null ⇒ the control is not offered. */
      readonly sessionId: string | null;
      readonly registration: string;
    }
  /** #628 — the payment was REFUSED. The one waiting-shaped state whose answer
   *  is a new checkout rather than more waiting. */
  | { readonly kind: "payment_failed"; readonly reason: string | null }
  /** #628 — the Session ran out of time. */
  | { readonly kind: "expired" }
  /** #628 — the applicant cancelled it, here or in another tab. */
  | { readonly kind: "cancelled" }
  /** #628 — admission is full. No pay control, deliberately. */
  | { readonly kind: "capacity_full" }
  /** No open registration for this caller at all. */
  | { readonly kind: "no_registration" }
  /** The reads did not answer. Named, never rendered as "nothing to do". */
  | { readonly kind: "unavailable" }
  /** The claim POST came back with the door's own refusal — verbatim. */
  | { readonly kind: "refused"; readonly code: string; readonly message: string };

/** The DB's own timestamp, in the business timezone, or nothing at all. A
 *  value that does not parse renders NO line rather than "Invalid Date" — an
 *  unreadable time beside a payment is worse than no time. */
function statusTimeLine(statusAt: string | null): string | null {
  if (statusAt === null) return null;
  const parsed = new Date(statusAt);
  return Number.isFinite(parsed.getTime()) ? businessDateTime(parsed) : null;
}

/** The "since" line, rendered only when the DB's timestamp is readable. A tiny
 *  component rather than an inline guard so the null check and the use are the
 *  SAME expression — two separate `statusTimeLine` calls would be two chances
 *  for them to disagree. */
function SinceLine({
  statusAt,
  line,
}: {
  statusAt: string | null;
  line: (when: string) => string;
}) {
  const when = statusTimeLine(statusAt);
  if (when === null) return null;
  return <p className="mt-1.5">{line(when)}</p>;
}

/**
 * THE RE-READ CONTROL — a native GET form to this same page, not a button that
 * fetches.
 *
 * A REAL NAVIGATION IS THE POINT. It re-runs the server component, which
 * re-runs `loadOwnRegistrationRequests` and `get_own_checkout_progress` under
 * the caller's own session, so what the person reads afterwards is what the
 * database says — never a client-side guess, and never a cached router entry.
 * It needs no JavaScript, it is keyboard-operable for free, and it drops the
 * one-shot `?claim=` marker on its way, so a re-read after a refusal shows the
 * CURRENT state rather than replaying the refusal card.
 */
function CheckAgain({ label }: { label: string }) {
  return (
    <form method="get" action="/checkout/success" className="w-full">
      <Button type="submit" variant="outline" className="w-full">
        {label}
      </Button>
    </form>
  );
}

/** A same-origin POST to one of the two checkout routes. Never a `<Link>`:
 *  both are POST-only precisely so that a prefetch, a mail scanner or a
 *  restored tab cannot start or end a payment. */
function PostControl({ action, label }: { action: string; label: string }) {
  return (
    <form method="post" action={action} className="w-full">
      <Button type="submit" variant="outline" className="w-full">
        {label}
      </Button>
    </form>
  );
}

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

        {state.kind === "processing" && (
          <>
            <StateBanner tone="info">
              <p>{t("processing.banner")}</p>
              {/* THE DB's OWN TIME, never a prediction. `/pending`'s card
                  carries the estate's standing rule against an ETA sentence
                  (holding-card.tsx's "NO ETA SENTENCE"): saying WHEN a state
                  began is a fact the row holds; saying when it will end is a
                  promise nothing here can keep. */}
              <SinceLine statusAt={state.statusAt} line={(when) => t("processing.since", { when })} />
            </StateBanner>
            <CheckAgain label={t("checkAgain")} />
            <CheckoutWaitingRefresh registration={state.registration} />
          </>
        )}

        {state.kind === "awaiting_payment" && (
          <>
            <StateBanner tone="warning">
              <p>{t("awaiting_payment.banner")}</p>
              <SinceLine statusAt={state.statusAt} line={(when) => t("awaiting_payment.since", { when })} />
            </StateBanner>
            <CheckAgain label={t("checkAgain")} />
            {/* OFFERED ONLY WHEN THERE IS A SESSION TO CANCEL. With no stamped
                Session, `cancel_checkout_intent` has nothing for Stripe to
                expire, and a control that ends a payment must not appear on a
                screen where there is no payment to end. */}
            {state.sessionId !== null && (
              <PostControl action="/checkout/cancel" label={t("awaiting_payment.cancel")} />
            )}
            <CheckoutWaitingRefresh registration={state.registration} />
          </>
        )}

        {state.kind === "payment_failed" && (
          <>
            <StateBanner tone="error">
              {t(`paymentFailure.${paymentFailureKindFrom(state.reason)}`)}
            </StateBanner>
            {/* THE PROVIDER'S OWN TOKEN, in the estate's one sanctioned place
                for an internal identifier to reach a human. See
                `lib/checkout/payment-failure.ts` for why it is not the
                sentence. */}
            {state.reason !== null && <TechnicalDetail>{state.reason}</TechnicalDetail>}
            <PostControl action="/checkout" label={t("payment_failed.retry")} />
          </>
        )}

        {state.kind === "expired" && (
          <>
            <StateBanner tone="warning">{t("expired.banner")}</StateBanner>
            <PostControl action="/checkout" label={t("expired.startAgain")} />
          </>
        )}

        {state.kind === "cancelled" && (
          <>
            <StateBanner tone="neutral">{t("cancelled.banner")}</StateBanner>
            <PostControl action="/checkout" label={t("cancelled.startAgain")} />
          </>
        )}

        {state.kind === "capacity_full" && (
          // NO PAY CONTROL, AND THAT ABSENCE IS THE FEATURE. `open_checkout_
          // intent` refuses `capacity_reached`, so a "start checkout" button
          // here would be an invitation to a refusal — the exact shape the
          // legal stage avoids by not offering an acceptance the door would
          // reject. The person is told plainly and given the reference support
          // needs.
          <StateBanner tone="warning">{t("capacity_full.banner")}</StateBanner>
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
