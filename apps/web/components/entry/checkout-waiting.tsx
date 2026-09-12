"use client";

// #628 — THE BOUNDED WAIT, and the two rules that shape it.
//
// ===========================================================================
// RULE 1: THE PAGE NEVER GUESSES. IT RE-READS, OR IT SAYS NOTHING NEW.
// ===========================================================================
// `checkout-success-card.tsx` used to carry, in print, "NO OPTIMISTIC UI AND NO
// SPINNER … it also never auto-refreshes: a page that silently re-POSTs is a
// page that spends attempts nobody asked it to". Both halves of that were
// right, and this component keeps both: it POSTs nothing, it decides nothing,
// and it invents no state. All it does is ask the SERVER to render again
// (`router.refresh()`), which re-runs `loadOwnRegistrationRequests` and
// `get_own_checkout_progress` and paints whatever the database now says.
//
// The state that made this necessary is `processing`: an asynchronous payment
// the bank is confirming, which resolves in seconds to minutes with no act
// available to the person. The old card's answer was "leave this page and come
// back", which is a real instruction and a poor one — it asks somebody who has
// just paid money and been told nothing to invent their own polling loop.
//
// ===========================================================================
// RULE 2: IT STOPS, AND IT SAYS SO.
// ===========================================================================
// An unbounded poll is a page that quietly costs a person battery and a server
// requests, forever, on a tab nobody is reading. So the loop has a BUDGET
// measured in wall-clock time, and when it runs out it does not fail silently
// and it does not keep going — it renders a plain sentence saying it has
// stopped checking, leaves the manual "Check again" control the card already
// has, and prints the registration reference a support operator needs to find
// the payment. Two minutes is the bound: long enough to cover the ordinary
// asynchronous settlement, short enough that a person is never left watching a
// page that will not change.
//
// WALL-CLOCK, NOT A TICK COUNT. A background tab has its timers throttled to
// roughly once a minute by every current browser, so counting 24 ticks would
// make the budget mean "two minutes of foreground" and could stretch to half an
// hour on a tab left open. The deadline is a timestamp taken at mount and
// compared on every tick, so the bound is the same whether the tab is watched
// or not.
//
// REDUCED MOTION HAS NOTHING TO GATE HERE, and that is a claim rather than an
// omission: this component renders no animation, no spinner, no skeleton and no
// transition. The only thing that changes on screen is text, appearing once, at
// the end. `prefers-reduced-motion` asks for less MOVEMENT; there is none.
//
// IT IS NOT A LIVE REGION OF ITS OWN. The stopped notice is a `StateBanner`,
// whose `role="status"` announces it when it appears and stays quiet on first
// paint — the wanted asymmetry, and exactly what the rest of the estate does.
// The refreshed CARD around it is server-rendered; when the state genuinely
// changes, the person reads a different heading, which is a navigation-grade
// change and not something to also shout about.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";

/** Every 5 seconds. Slow enough that a slow render never overlaps itself, fast
 *  enough that a settled payment is on screen before somebody reaches for the
 *  manual control beside it. */
export const CHECKOUT_REFRESH_INTERVAL_MS = 5_000;

/** Two minutes of wall-clock, from mount. See RULE 2. */
export const CHECKOUT_REFRESH_BUDGET_MS = 120_000;

export function CheckoutWaitingRefresh({
  registration,
  /** Injectable ONLY so a cell can drive the exhausted arm on a real timer in
   *  milliseconds instead of faking the clock. Production passes nothing, so
   *  the shipped bound is never the value under test and no test can silently
   *  weaken it — the same discipline `stripe-session.ts` applies to its own
   *  deadline. */
  intervalMs = CHECKOUT_REFRESH_INTERVAL_MS,
  budgetMs = CHECKOUT_REFRESH_BUDGET_MS,
}: {
  registration: string;
  intervalMs?: number;
  budgetMs?: number;
}) {
  const t = useTranslations("CheckoutSuccess");
  const router = useRouter();
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    const deadline = Date.now() + budgetMs;
    const id = setInterval(() => {
      if (Date.now() >= deadline) {
        clearInterval(id);
        setStopped(true);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, budgetMs]);

  if (!stopped) return null;
  return (
    <StateBanner tone="neutral">
      <p>{t("waiting.stopped")}</p>
      {/* THE REFERENCE, AND ONLY ONCE THE AUTOMATIC CHECKING HAS GIVEN UP.
          NIT-6 keeps identifiers OFF the wire — nothing here is posted, and no
          hidden field carries it. What it does is put on screen the one value a
          support operator needs to find this applicant's payment, at the exact
          moment the product has run out of things to tell them. */}
      <p className="mt-1.5 font-mono text-xs wrap-anywhere">{registration}</p>
    </StateBanner>
  );
}
