"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";

import { signDpa as defaultSignDpa, type SignDpa, type SignDpaOutcome } from "@/lib/registration/dpa-doors";
import type { DpaDocumentState } from "@/lib/registration/dpa-server-reads";
import { newOpKey } from "@/lib/registration/op-key";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { StateBanner } from "@/components/common/state";

/**
 * SIGNUP's THIRD STEP — the DPA e-sign (checkout-gate-design.md §1.1 step ④,
 * part 3 §2's surface row). Rendered by `signup-step.tsx`'s third fork once
 * an OPEN registration exists for the caller (claim_identity +
 * request_firm_registration already ran) — see that file's header for why
 * the fork happens there rather than here.
 *
 * `document` is READ SERVER-SIDE (`signup-route.tsx` calls
 * `loadCurrentDpaDocumentState`) and handed down as a prop, per part 3 §2's
 * "the text is read by a server component ... and passed down as props" —
 * this component itself does no reading, isomorphic or otherwise.
 *
 * TWO HONEST DEGRADES, NEITHER A CRASH:
 *
 *  `document.kind === "unavailable"` — the row could not be read (the table
 *  is absent, ungranted, or every version has been superseded). Design's own
 *  words: "the step renders a NotBuiltNote and the checkout control is
 *  ABSENT, not disabled-looking" — nothing here may imply a document exists
 *  to sign when none could be shown.
 *
 *  A click on "sign" that the door REFUSES — `sign_dpa` raises `CLR10 the
 *  signed text does not match the current agreement` when the document was
 *  superseded between render and click (裁-90's byte-identity law), and
 *  `CLR09 that dpa version is not current` for a stale version. The DB's own
 *  sentence renders VERBATIM; nothing here re-words it and nothing retries.
 *
 * NAVIGATION, WIRED BY LANE B. A recorded signature reveals the next step —
 * a real `<form method="post" action="/checkout">`, which is ⑤. It is a form
 * POST and not a `<Link>` because `/checkout` is POST-only by design: a GET
 * there could be run by a prefetch or a pasted link, and it opens a Stripe
 * Session and spends a rate-wall attempt. The plain `<Link>` back to
 * `/pending` stays, so nobody is stranded.
 *
 * 裁-129'S SECOND DOCUMENT KIND IS NOT PRESENTED, AND SAYING SO IS THE POINT.
 * The beta terms of service exists as a text (`docs/ops/legal/
 * clara-beta-terms.md`) but `clara.dpa_documents` has NO `kind` column on
 * this tip — measured: `0158`'s `create table` declares `version, body,
 * body_sha256, source_path, effective_from, effective_to, created_at`, and
 * `get_current_dpa_document()` returns the one current row with no kind to
 * select on. So there is exactly one document to sign here and exactly one
 * signature to record. The follow-up line below says the terms are coming and
 * are NOT covered by this signature; a second checkbox recording nothing
 * would be the fake receipt this app forbids.
 */
export function SignupDpaForm({
  document,
  sign = defaultSignDpa,
}: {
  document: DpaDocumentState;
  sign?: SignDpa;
}) {
  const t = useTranslations("Signup");
  const [signing, setSigning] = useState(false);
  const [outcome, setOutcome] = useState<SignDpaOutcome | null>(null);
  // A, fix round 2026-09-01: minted ONCE and held for the component's
  // lifetime — `sign_dpa` takes a required `p_op_key` (checkout-gate-design-
  // part2.md:51) and this seam's caller owns that key, per the identical
  // idiom `signup-firm-form.tsx` already uses for `claim_identity` /
  // `request_firm_registration`. There is no editable field on this step to
  // re-mint on (unlike the firm form), so unlike that file's `onEdit`, this
  // key never changes for the life of the mount: every click — including a
  // retry after an "unavailable" answer — is the SAME attempt.
  const opKey = useRef(newOpKey());

  if (document.kind === "unavailable") {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("dpaStepTitle")}</h1>
          <CardDescription>{t("dpaStepDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <NotBuiltNote>{t("dpaStepDocumentUnavailable")}</NotBuiltNote>
          <Link href="/pending" className="text-sm text-primary underline">
            {t("dpaStepBackToStatus")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  async function handleSign() {
    setSigning(true);
    setOutcome(null);
    // M2 fix round: the hash sent here MUST be the hash of the body THIS
    // RENDER shows — never re-derived, never re-read. `document` is the exact
    // prop the CardContent below prints `document.body` from, so
    // `document.bodySha256` is provably the hash of what the person is
    // looking at right now, not of whatever the row happens to say if it is
    // re-read later. The `document.kind === "ready"` guard is closure-
    // narrowing paperwork only — this function is never reachable except from
    // the "ready" render below (see the "unavailable" early return above).
    const answer = document.kind === "ready"
      ? await sign({
          version: document.version,
          bodySha256: document.bodySha256,
          opKey: opKey.current,
        })
      : { kind: "unavailable" as const };
    setSigning(false);
    // Whatever the door said, verbatim — this component never invents a
    // success state, and the checkout control below appears only on the arm
    // that carries a real signature id.
    setOutcome(answer);
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t("dpaStepTitle")}</h1>
        <CardDescription>{t("dpaStepDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="max-w-prose rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
          {document.body}
        </div>

        {/* 裁-129 — the SECOND document kind is named, not signed. See this
            component's header for the measurement that decided it. */}
        <p className="text-xs text-muted-foreground">{t("dpaStepTermsFollowUp")}</p>

        {outcome?.kind === "unavailable" && (
          <NotBuiltNote>{t("dpaStepSignedUnavailable")}</NotBuiltNote>
        )}

        {outcome?.kind === "refused" && (
          <StateBanner tone="error" code={outcome.code}>
            {outcome.message}
          </StateBanner>
        )}

        {outcome?.kind === "signed" ? (
          <>
            <StateBanner tone="info">
              {outcome.replay ? t("dpaStepAlreadySigned") : t("dpaStepSigned")}
            </StateBanner>
            {/* ⑤ — a REAL form POST. `/checkout` is POST-only on purpose (a GET
                there would open a Stripe Session on a prefetch), so this is a
                form and not a link. */}
            <form method="post" action="/checkout">
              <Button type="submit" className="w-full">
                {t("dpaStepContinueToCheckout")}
              </Button>
            </form>
          </>
        ) : (
          <Button
            type="button"
            className="w-full"
            disabled={signing}
            onClick={() => void handleSign()}
          >
            {signing ? t("dpaStepSigning") : t("dpaStepSign")}
          </Button>
        )}

        <Link href="/pending" className="text-sm text-primary underline">
          {t("dpaStepBackToStatus")}
        </Link>
      </CardContent>
    </Card>
  );
}
