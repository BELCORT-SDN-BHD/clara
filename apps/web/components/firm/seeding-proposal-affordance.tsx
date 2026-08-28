"use client";

// The `seeding_proposal` needs-you affordance (裁-17, mohe-grill-rulings-2026-08-28.md:
// "the inbox row IS wanted... frontend: a T0-registry affordance entry + the T9 panel as
// the acting surface"). Registered into ./needs-you-affordances.tsx's
// NEEDS_YOU_AFFORDANCES table — LINK-ONLY, deliberately: the tick/decline doors stay on
// T9's SeedingBatchesPanel (components/reports/SeedingBatchesPanel.tsx), the object that
// actually owns them; this row is the inbox BRIDGE into that surface (PRD §5 journey 6:
// "the inbox bridges into the exact client row"), never a duplicated act here — the same
// same-page-LINK posture needs-you-row.tsx's own header describes for every row_kind
// without a registered affordance, made explicit here because seeding_proposal DOES carry
// one (so a reader does not have to infer "no act" from a missing registry entry).
//
// The deep link goes to the OWNING TAB (`/clients/:id/reports`, where SeedingBatchesPanel
// is mounted), never the client workspace root — the P6 flow-polish note 裁-17's own ruling
// recorded ("inbox rows deep-link to the owning tab/object, not the client-workspace root").

import { useTranslations } from "next-intl";
import Link from "next/link";
import type { NeedsYouAffordanceProps } from "./needs-you-affordances";

export function SeedingProposalAffordance({ row }: NeedsYouAffordanceProps) {
  const t = useTranslations("NeedsYou");
  if (!row.client_id) return null;
  return (
    <Link
      href={`/clients/${row.client_id}/reports`}
      className="text-xs text-primary underline-offset-4 hover:underline"
    >
      {t("reviewSeedingProposals")}
    </Link>
  );
}
