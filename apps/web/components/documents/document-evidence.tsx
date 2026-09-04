"use client";

// The "Extracted evidence" section of the document-detail panel.
//
// WHAT CHANGED (D2 + D3). This used to be a `NotBuiltBadge` reading "A
// page-image overlay of these regions' locators exists only for the chat review
// card today — not on this tab", above a flat <dl> of every region with
// `truncate` on both columns. Two problems, both now closed:
//
//   * the <dl> mixed the FACTS a professional came to check (a total, an
//     amount due) into the same undifferentiated list as the hundreds of OCR
//     line regions the producer emits, each truncated to nothing useful;
//   * the overlay genuinely was not built, and the badge was honest about it —
//     but the geometry has been reachable from this app the whole time.
//
// Now: the facts table is always visible (the same renderer the extraction
// panel uses — one component, not the two near-identical copies that used to
// live here and in document-extract-panel.tsx), and the page overlay is a
// LAZY opt-in behind a toggle. Lazy because opening it fetches the document's
// full bytes and, for a PDF, a separate pdf.js chunk: that is not something to
// spend on every mount of a detail panel a human may only be skimming.

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RegionRow } from "@/lib/documents/types";
import { partitionRegions } from "@/lib/documents/extract-shape";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/state";
import { DocumentFactsTable } from "./document-facts-table";
import { DocumentPageOverlay } from "./document-page-overlay";

export function DocumentEvidence({
  regions,
  documentId,
  clientId,
  mimeType,
}: {
  /** The detail read's own regions (loaders.ts's `loadDocumentDetail`, already
   *  narrowed to `status='done'` and not superseded). These carry NO locator —
   *  `listRegionsForExtractionIds` does not select it — which is exactly why
   *  the overlay below does its own `get_document_extract` read instead of
   *  being handed these rows. */
  regions: RegionRow[];
  documentId: string;
  clientId: string;
  mimeType: string | null;
}) {
  const t = useTranslations("ClientDocuments");
  const [showOverlay, setShowOverlay] = useState(false);
  const { facts, layout } = partitionRegions(regions);
  const layoutCount = layout.reduce((n, group) => n + group.regions.length, 0);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader level={4}>{t("evidenceHeading")}</SectionHeader>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowOverlay((v) => !v)}>
          {showOverlay ? t("evidenceOverlayHide") : t("evidenceOverlayShow")}
        </Button>
      </div>

      {/* ONE facts table on screen at a time, and that is a correctness point
          rather than a tidiness one. The overlay carries its OWN facts table —
          it has to, because clicking a fact there moves the page highlight, and
          the two tables are built from two DIFFERENT reads (this section's
          regions carry no locator; the overlay's do). Rendering both would put
          the same figures on screen twice from two sources, which is exactly
          the shape a reader cannot audit. */}
      {showOverlay ? (
        <DocumentPageOverlay documentId={documentId} clientId={clientId} mimeType={mimeType} />
      ) : regions.length === 0 ? (
        <EmptyState>{t("evidenceEmpty")}</EmptyState>
      ) : (
        <>
          <DocumentFactsTable facts={facts} />
          {/* The partition is total, so the regions NOT in the facts table are
              accounted for by name and count rather than silently missing. A
              reader who sees "6 fields" on a document with 340 regions needs to
              know where the other 334 went. */}
          {layoutCount > 0 ? (
            <p className="text-xs text-muted-foreground">{t("evidenceLayoutElsewhere", { count: layoutCount })}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
