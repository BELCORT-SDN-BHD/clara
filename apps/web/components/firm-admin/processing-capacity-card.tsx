"use client";

// #635 — THE FIRM'S PROCESSING CAPS, READ AND NOT SET.
//
// THIS CARD SITTING BEHIND ADMIN+ IS AN AFFORDANCE, NOT A WALL — and saying so out loud is the
// point of this comment (`lib/firm/capabilities.ts:19-23`'s own idiom). The numbers come from
// `clara.firm_document_limits`, which every member of the firm may already SELECT directly
// (0007:810-811, :2742-2744 — a written, reviewed grant). They arrive here on
// `clara.get_firm_commercial_state`'s `capacity` object, which IS admin-floored, purely because
// they belong beside the plan on a commercial card and because a second read of the same numbers
// would be a second answer free to disagree with the first. A viewer who reads that relation
// another way is not doing anything the estate forbids, and nothing in #635 narrows that grant:
// migration 0233 asserts it unmoved in both directions, in its prestate and again in its tail.
//
// THERE IS NO CONTROL, AND THERE CANNOT BE ONE YET. `clara.firm_document_limits` has NO HUMAN
// WRITER anywhere in the estate (0196:36-40, whose header names #635 by number). Offering an
// editor would mean inventing a governed write door, a receipt and an audit row — a
// relation-touching migration, which is a different ticket. Filed as a follow-up.
//
// A MISSING ROW IS A NAMED ZERO, NOT A DEFAULT. On a firm with no `firm_document_limits` row the
// door answers NULLs, and this card says so. It does NOT print the table's column defaults
// (100 / 1000 / 2 / 2): those are what a row would start at if somebody inserted one, not what
// this firm's caps are, and the enforcing doors coalesce to their own fallbacks anyway
// (0090:422-436). A number nobody stored is the same defect as a price nobody ruled.

import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInteger } from "@/lib/firm/commercial-format";
import type { FirmCommercialState } from "@/lib/firm/commercial-reads";
import type { FirmSettingsView } from "./firm-settings-view";

export function ProcessingCapacityCard({
  view,
}: {
  readonly view: FirmSettingsView<FirmCommercialState>;
}) {
  const t = useTranslations("FirmSettings");
  const capacity = view.status === "ready" ? view.data.capacity : null;
  const rows: readonly [string, number | null][] =
    capacity === null
      ? []
      : [
          [t("capacityDocsPerDay"), capacity.docsPerDay],
          [t("capacityPagesPerDay"), capacity.pagesPerDay],
          [t("capacityOcrConcurrency"), capacity.ocrConcurrency],
          [t("capacityWitnessConcurrency"), capacity.llmWitnessConcurrency],
        ];
  const anyStored = rows.some(([, value]) => value !== null);

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("capacityHeading")}</SectionHeader>
        <CardDescription className="text-xs">{t("capacitySubheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view.status === "loading" ? <Skeleton className="h-20 w-full" /> : null}
        {capacity !== null && anyStored ? (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value === null ? "—" : formatInteger(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {capacity !== null && !anyStored ? (
          <p className="max-w-prose text-sm text-muted-foreground">{t("capacityNone")}</p>
        ) : null}
        {capacity !== null ? (
          <>
            <p className="max-w-prose text-xs text-muted-foreground">{t("capacitySourceNote")}</p>
            <p className="max-w-prose text-xs text-muted-foreground">{t("capacitySeatsNote")}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
