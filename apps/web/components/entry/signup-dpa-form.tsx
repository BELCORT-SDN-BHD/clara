"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";

import { signDpa as defaultSignDpa, type SignDpa } from "@/lib/registration/dpa-doors";
import type { DpaDocumentState } from "@/lib/registration/dpa-server-reads";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { NotBuiltNote } from "@/components/common/not-built-note";

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
 *  A click on "sign" — `signDpa` is a Lane-B seam
 *  (`lib/registration/dpa-doors.ts`) whose production default always
 *  answers `{kind:"unavailable"}`. The click is real, the request is real,
 *  and the answer is an honest "not wired yet" rather than a fabricated
 *  signature. See that module's header for the full split rationale.
 *
 * NAVIGATION: this step does not redirect anywhere on its own — there is no
 * built checkout to send anyone to yet. The one control besides "sign" is a
 * plain `<Link>` back to `/pending`, so a person who arrives here is never
 * stranded with no way forward at all; `/pending`'s own "registered" arm is
 * where the next real action (once Lane B lands) will live.
 */
/** Same one-liner every other door caller in this codebase mints its own
 *  copy of (`signup-firm-form.tsx:105`, `lib/bank/doors.ts`, …) — the estate
 *  keeps this local rather than shared. */
const newOpKey = (): string => crypto.randomUUID();

export function SignupDpaForm({
  document,
  sign = defaultSignDpa,
}: {
  document: DpaDocumentState;
  sign?: SignDpa;
}) {
  const t = useTranslations("Signup");
  const [signing, setSigning] = useState(false);
  const [signedOutcome, setSignedOutcome] = useState<"unavailable" | null>(null);
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
    setSignedOutcome(null);
    // M2 fix round: the hash sent here MUST be the hash of the body THIS
    // RENDER shows — never re-derived, never re-read. `document` is the exact
    // prop the CardContent below prints `document.body` from, so
    // `document.bodySha256` is provably the hash of what the person is
    // looking at right now, not of whatever the row happens to say if it is
    // re-read later. The `document.kind === "ready"` guard is closure-
    // narrowing paperwork only — this function is never reachable except from
    // the "ready" render below (see the "unavailable" early return above).
    const outcome = document.kind === "ready"
      ? await sign({
          version: document.version,
          bodySha256: document.bodySha256,
          opKey: opKey.current,
        })
      : { kind: "unavailable" as const };
    setSigning(false);
    // `outcome.kind` is exhaustively either "signed" or "unavailable" today;
    // the production seam only ever answers the latter. Either way this
    // component never invents a redirect or a success state the door did
    // not actually report — see the header.
    if (outcome.kind === "unavailable") setSignedOutcome("unavailable");
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

        {signedOutcome === "unavailable" && (
          <NotBuiltNote>{t("dpaStepSignedUnavailable")}</NotBuiltNote>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={signing}
          onClick={() => void handleSign()}
        >
          {signing ? t("dpaStepSigning") : t("dpaStepSign")}
        </Button>

        <Link href="/pending" className="text-sm text-primary underline">
          {t("dpaStepBackToStatus")}
        </Link>
      </CardContent>
    </Card>
  );
}
