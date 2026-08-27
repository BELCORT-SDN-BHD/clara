"use client";

import { useTranslations } from "next-intl";
import type { RegionRow } from "@/lib/documents/types";
import { NotBuiltBadge } from "./not-built-badge";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/state";

/**
 * Extracted regions from the document's current extraction (loaders.ts's
 * `loadDocumentDetail` already narrows to `status='done'`, not superseded) — a
 * plain field/value list, the real read (0007_document_pipeline.sql:203-221,
 * granted at 0007:788-791). NOT BUILT: a page-image overlay of these regions'
 * locators — that viewer exists only for the chat-wire `doc_review` card today
 * (apps/dashboard/app/shared/cards/regionGeometry.ts), never on this tab.
 */
export function DocumentEvidence({ regions }: { regions: RegionRow[] }) {
  const t = useTranslations("ClientDocuments");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader level={4}>{t("evidenceHeading")}</SectionHeader>
        <NotBuiltBadge label={t("evidenceOverlayLabel")} reason={t("evidenceOverlayReason")} />
      </div>
      {regions.length === 0 ? (
        <EmptyState>{t("evidenceEmpty")}</EmptyState>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {regions.map((region) => (
            <RegionRowView key={region.id} region={region} />
          ))}
        </dl>
      )}
    </section>
  );
}

function RegionRowView({ region }: { region: RegionRow }) {
  const t = useTranslations("ClientDocuments");
  const value = region.monetary_cents !== null
    ? (region.monetary_cents / 100).toFixed(2)
    : region.text_content;
  return (
    <>
      <dt className="truncate text-muted-foreground">{region.field_path ?? t("evidenceUnlabeledField")}</dt>
      <dd className="truncate text-foreground">
        {value ?? t("evidenceNoValue")}
        {region.engine_confidence !== null ? (
          // The raw DB-computed decimal, verbatim — NEVER converted to a percentage
          // (S6-R5/WA-L2's discipline) and never bucketed into an invented
          // high/medium/low judgement this UI has no basis to draw.
          <span className="ml-2 text-xs text-muted-foreground">
            {t("evidenceConfidenceValue", { value: region.engine_confidence.toFixed(3) })}
          </span>
        ) : null}
      </dd>
    </>
  );
}
