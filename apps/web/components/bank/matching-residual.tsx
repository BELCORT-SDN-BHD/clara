"use client";

// #657 · AC7 — THE RESIDUAL, BEFORE SUBMIT.
//
//     Σ selected lines − Σ selected entries − Σ adjustments = residual
//
// computed client-side FOR DISPLAY ONLY, so a human can see a one-cent difference before they
// press the button rather than after the database refuses.
//
// THE AUTHORITY IS NOT THIS COMPONENT AND THE COPY SAYS SO. The tie identity is enforced by the
// DEFERRED constraint trigger `clara._tf_bank_match_group_tie()` (0038:3249; live arm
// :3314-3326, refusal `amount_beyond_tolerance`, wired on all three tables :3330-3341), and the
// composite re-checks it inline before that. A face that implied its own arithmetic was the
// rule would be teaching the human to trust the wrong thing — and the first time the two
// disagreed (a concurrent match consuming capacity between the read and the submit) the human
// would believe the face. So the line renders a NOTE naming the database as the authority, and
// the submit button is never gated on this number.
//
// #657 SHIPS NO ADJUSTMENT CONTROL, so the adjustment term is always zero on this lane and is
// still shown: a residual that silently omits a term is a residual a reader cannot check. A
// difference is closed by #671 (refunds/write-offs) or #675 (certification), never by a plug
// invented here.

import { useTranslations } from "next-intl";
import { formatMyr } from "@/lib/bank/money";

export function MatchingResidual({
  lineCents,
  entryCents,
  adjustmentCents = 0,
}: {
  lineCents: number;
  entryCents: number;
  adjustmentCents?: number;
}) {
  const t = useTranslations("ClientBank.matching");
  const residual = lineCents - entryCents - adjustmentCents;
  return (
    <div data-testid="matching-residual" className="rounded-md border border-border bg-muted/40 p-2 text-xs">
      <p>
        {t("residualEquation", {
          lines: formatMyr(lineCents),
          entries: formatMyr(entryCents),
          adjustments: formatMyr(adjustmentCents),
        })}{" "}
        <strong data-testid="matching-residual-value" data-residual-cents={residual}>
          {formatMyr(residual)}
        </strong>
      </p>
      <p className="mt-1 text-muted-foreground">
        {residual === 0 ? t("residualTies") : t("residualDiffers")}
      </p>
      <p className="mt-1 text-muted-foreground">{t("residualAuthority")}</p>
    </div>
  );
}
