"use client";

// #628 REVIEW — THE PENDING STATE ON EVERY POST CONTROL ON THE MONEY SURFACES
// (design appendix C, "Short mutation": the initiating control shows a pending
// label, prevents a duplicate local submit, and does not freeze anything else).
//
// ===========================================================================
// WHY THESE FORMS STAY NATIVE, AND WHAT THAT COSTS
// ===========================================================================
// Every control here is a REAL `<form method="post" action="…">` posting to a
// `route.ts`, and that is deliberate to the point of being load-bearing: the
// checkout routes are POST-only precisely so a prefetch, a mail scanner or a
// restored tab cannot start or end a payment, and a native form works with no
// JavaScript, is keyboard-operable for free, and ends in a real navigation the
// browser owns.
//
// The cost is that React's `useFormStatus` reports NOTHING here. It is wired to
// a form whose `action` is a FUNCTION (a Server Action or a form action React
// runs); a form that navigates is submitted by the browser, and React never
// learns it happened. There is no `SubmitButton` idiom in `components/entry` to
// reuse either — `signup-account-form.tsx` and `signup-legal-stage.tsx` both
// drive their own `fetch` and own their own `busy` flag, which is a shape that
// does not apply to a navigating form. So the pending state is observed the one
// way a navigating form allows: the form's own `submit` event.
//
// ===========================================================================
// THE SUBMIT HANDLER DOES NOT PREVENT THE DEFAULT, AND MUST NOT
// ===========================================================================
// It records that a submission started and lets the browser get on with it.
// Disabling the submitter from inside the `submit` handler is safe: the form's
// entry list is built BEFORE the event is dispatched, so a button disabled
// afterwards still submitted. What it stops is the SECOND press — a person
// double-clicking "Open my firm" on a slow connection — which is the whole
// point of the pending state on a control that creates a tenant.
//
// IT IS NOT THE REAL PROTECTION, AND THIS COMMENT IS NOT A CLAIM THAT IT IS.
// Server idempotency is: every one of these routes mints an op key and the
// doors are keyed on the durable identity (`open_checkout_intent` on the
// applicant's one unstamped intent, `record_checkout_session` on the session
// id, `claim_paid_firm` and `cancel_checkout_intent` on replay). A disabled
// button is a courtesy to the person's eyes and thumbs; the database is what
// makes a duplicate harmless. A control that relied on this flag for
// correctness would be a control that breaks the moment JavaScript does not
// run — which, for these forms, is a state they are built to survive.
//
// NOTHING ELSE FREEZES. The flag is local to ONE form, so the other controls on
// the same card, the "back to your status" link and the bounded re-read all
// keep working while one POST is in flight.
//
// AND IT IS RESTORED. A navigating POST has no failure callback — if it fails,
// the browser stays on the page or the person presses Back. Both arrive as
// `pageshow` (a bfcache restore fires it with `persisted`), which clears the
// flag, so a control is never left permanently dead under a person who came
// back to use it. `aria-busy` carries the same fact to a screen reader that the
// label change carries to a sighted one.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function PostControl({
  action,
  label,
  variant = "outline",
}: {
  action: string;
  label: string;
  /** `"default"` for the one control that creates a tenant; every other POST on
   *  these two cards is a secondary act beside a state. */
  variant?: "default" | "outline";
}) {
  const t = useTranslations("Common");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // A restored page (Back, or a submission that never navigated) must hand
    // the control back. `pageshow` fires on both the initial load and a
    // bfcache restore; clearing on either is correct — a page being shown is a
    // page whose in-flight POST is over, one way or another.
    const restore = () => setPending(false);
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  // NO `preventDefault()`, and the event is not read at all. The browser owns
  // this navigation; all this handler does is note that it started. See the
  // header for why disabling the submitter here does not cancel the submission
  // that is already under way.
  const onSubmit = () => setPending(true);

  return (
    <form method="post" action={action} className="w-full" onSubmit={onSubmit}>
      <Button
        type="submit"
        variant={variant}
        className="w-full"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? t("working") : label}
      </Button>
    </form>
  );
}
