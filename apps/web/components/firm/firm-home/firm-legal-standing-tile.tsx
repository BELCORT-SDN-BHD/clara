"use client";

// #1009 — FIRM HOME'S LEGAL-STANDING PROMPT.
//
// THE OWNER'S RULING THIS TICKET IMPLEMENTS (#1008, 2026-09-20): a compliance gate PROMPTS during
// beta, it never disables. `clara.get_firm_legal_standing` (arity 0, viewer floor) already carries
// the one fact this card needs (`standingLive`) and the one the caller needs
// (`canAcceptForFirm`), both re-derived server-side on every call from 0195:905's membership
// predicate — this component adds no rank check of its own and NEVER re-derives `standingLive`,
// the same discipline `legal-standing-card.tsx`'s own header states.
//
// WHY THIS IS NOT A NEEDS-YOU ROW. That vocabulary is closed at nine kinds with a tenth reserved
// (`lib/firm/needs-you.ts`), and wave 2026-09-18 ruled it gains no new kind without an owner
// decision. This is a firm-altitude fact the review queue does not carry at all, so a DEDICATED
// read is the honest shape — `firm-setup-tile.tsx`'s own precedent for the same reason, and this
// tile sits beside it and reuses its card shape.
//
// BUILT TEST-FIRST, one seam at a time: `firm-legal-standing-tile.test.tsx`'s cells are what add
// each face below, in the order the cells were written.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { formatDay } from "@/lib/firm/commercial-format";
import {
  loadFirmLegalStanding,
  type FirmLegalStanding,
  type LegalStandingDocument,
} from "@/lib/firm/commercial-reads";

export type FirmLegalStandingTileProps = {
  /** Injected by the unit cells; production reads the real door. */
  readonly loader?: () => Promise<FirmLegalStanding>;
};

const TESTID = "firm-home-legal-standing-tile";

export function FirmLegalStandingTile({ loader = () => loadFirmLegalStanding() }: FirmLegalStandingTileProps = {}) {
  const t = useTranslations("FirmHome");
  const tLegal = useTranslations("FirmSettings");
  const standing = useAsyncRead(loader);

  // LOADING renders nothing — the same choice `firm-setup-tile.tsx` makes, so this card never
  // competes with Firm Home's own orientation sentence while it is still unread.
  if (standing.loading) return null;

  // THE READ FAILED. Said as a failure, never swallowed into an absent prompt and never painted
  // as "current" by default (AC5) — an unread standing is not evidence that nothing is
  // outstanding, and the fail-closed reading is the one this estate always takes when a fact it
  // needs cannot be read (`decodeLegalEnforcementMode`'s own note makes the same call).
  if (standing.error) {
    return (
      <Card data-testid={TESTID}>
        <CardHeader>
          <CardTitle><SectionHeader level={2}>{t("legalPrompt.heading")}</SectionHeader></CardTitle>
        </CardHeader>
        <CardContent>
          <StateBanner tone="error">{t("legalPrompt.readFailed")}</StateBanner>
        </CardContent>
      </Card>
    );
  }

  const data = standing.data;
  // Never reached in practice — `loadFirmLegalStanding` throws rather than resolving a payload it
  // cannot read (`commercial-reads.ts`'s "THE THREE SCALARS ARE REQUIRED" note), so an unreadable
  // answer always lands in the `standing.error` branch above. Kept as the honest fail-closed
  // branch for a `loader` a future cell hands in directly.
  if (data === null) return null;
  // STANDING IS LIVE: the prompt has nothing to ask, and it is never dismissible while something
  // IS outstanding — so there is nothing here to dismiss in the first place.
  if (data.standingLive) return null;

  const outstanding = data.documents.filter((d) => d.status === "published" && !d.firmAccepted);

  return (
    <Card data-testid={TESTID}>
      <CardHeader>
        <CardTitle><SectionHeader level={2}>{t("legalPrompt.heading")}</SectionHeader></CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <StateBanner tone="warning">
          {data.enforcementMode === "prompt" ? t("legalPrompt.bodyPrompt") : t("legalPrompt.bodyEnforce")}
        </StateBanner>
        {outstanding.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {outstanding.map((d) => (
              <li key={d.kind}>{agreementLine(d, t, tLegal)}</li>
            ))}
          </ul>
        ) : null}
        {data.canAcceptForFirm ? (
          <p className="text-sm">
            <Link href="/settings/firm" className="text-primary underline-offset-4 hover:underline">
              {t("legalPrompt.action")}
            </Link>
          </p>
        ) : (
          // NO ACCEPT CONTROL AND NO DEAD LINK — `can_accept_for_firm` is the door's own,
          // re-derived every call from 0195:905's membership predicate, and nothing here mirrors
          // a rank of its own to second-guess it (裁-187's ruling, applied here as everywhere
          // else in `lib/firm/capabilities.ts`).
          <p className="text-xs text-muted-foreground">{t("legalPrompt.ownerHint")}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** THE KIND LABEL IS THE SETTINGS PAGE'S OWN CATALOG (`FirmSettings.legalKindTerms`/`legalKindDpa`)
 *  — one vocabulary for the two values, shared rather than copied into a second list here, the
 *  same reuse `firm-home-board.tsx` already applies to `Members.roles`. */
function agreementLine(
  doc: LegalStandingDocument,
  t: (key: string, values?: Record<string, string | number>) => string,
  tLegal: (key: string) => string,
): string {
  const kind = doc.kind === "terms" ? tLegal("legalKindTerms") : tLegal("legalKindDpa");
  return doc.effectiveFrom !== null
    ? t("legalPrompt.agreementLine", { kind, version: doc.version, date: formatDay(doc.effectiveFrom) ?? doc.effectiveFrom })
    : t("legalPrompt.agreementLineNoDate", { kind, version: doc.version });
}
