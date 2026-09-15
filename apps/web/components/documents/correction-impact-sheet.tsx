"use client";

// #646 — THE WRONG-CLIENT IMPACT RADIUS, AS SUPPORTING CONTEXT (AC6).
//
// WHERE IT WAS. `correction-wizard.tsx` rendered the blast radius as a `<Table>` INSIDE the
// decision Dialog. Appendix C §4 draws the line the other way round — "Dialog is a focused decision
// or edit. Sheet is a contextual side task" — and the 64-component disposition's row 51 says a
// Sheet is for "supporting object context that complements the current page… it needs Title, safe
// dismissal and focus restoration". A per-entry list of everything a correction will reverse is
// evidence a professional reads BESIDE the decision, not the decision itself; cramming it into the
// Dialog made the Dialog a scrolling report and left the actual choice at the bottom of it.
//
// ONE OVERLAY AT A TIME, and this is the part worth stating. Appendix C §4 also says: "Do not open
// an uncontrolled stack of navigation Sheet, chat Sheet and edit Dialog." So the Sheet does not
// open ON TOP of the wizard — the caller SUSPENDS the wizard while this is open and restores it,
// at the same step and with the same draft, when it closes. The human sees one surface at a time
// and loses nothing by looking.
//
// IT TAKES THE PREVIEW IT IS GIVEN AND READS NOTHING. `clara.preview_wrong_client_correction` has
// already been called by the wizard against the destination the human picked; a second read here
// could answer differently from the one the decision is being made against, which is exactly the
// shape a reader cannot audit.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/state";
import type { CorrectionPreview } from "@/lib/documents/reads";

export function CorrectionImpactSheet({
  impact, onOpenChange,
}: {
  /** `null` closes the Sheet. The pair travels together because the destination's NAME is part of
   *  the sentence this Sheet opens with, and looking it up again here would be a second source of
   *  truth for something the wizard already resolved. */
  impact: { preview: CorrectionPreview; toClientName: string; fromClientName: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("ClientDocuments");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const open = impact !== null;

  // The WAI Dialog pattern's initial-focus recommendation when no form control should take it —
  // this is a READ, not an edit. Same treatment `activity-event-sheet.tsx` applies.
  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" aria-describedby={undefined} data-testid="correction-impact-sheet">
        <SheetHeader>
          <SheetTitle ref={titleRef} tabIndex={-1}>{t("impactSheetTitle")}</SheetTitle>
          <SheetDescription>
            {impact
              ? t("impactSheetSubtitle", { from: impact.fromClientName, to: impact.toClientName })
              : t("impactSheetTitle")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
          {impact ? (
            <>
              <p className="text-xs text-muted-foreground" data-testid="correction-impact-counts">
                {t("correctionBlastRadius", {
                  count: impact.preview.items.length,
                  closed: impact.preview.closed_period_blockers.length,
                })}
              </p>
              {impact.preview.items.length === 0 ? (
                <EmptyState>{t("correctionNoEntries")}</EmptyState>
              ) : (
                // `components/ui/table.tsx`'s own container is the focusable horizontal viewport
                // (review-549 item 6), so a two-dimensional grid gets its own scroll region here
                // rather than making the page scroll sideways at 320px (appendix C §4).
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("correctionColEntry")}</TableHead>
                        <TableHead>{t("correctionColAction")}</TableHead>
                        <TableHead>{t("correctionColStatus")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {impact.preview.items.map((item) => (
                        <TableRow key={item.entry_id}>
                          <TableCell className="font-mono text-xs wrap-anywhere">{item.entry_id}</TableCell>
                          <TableCell>{item.action}</TableCell>
                          <TableCell>{item.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              )}
              {/* The posted-effect boundary, stated HERE too: this Sheet lists what the REFILE
                  reverses. A source revision's own accounting impact is a different, still-pending
                  thing — see the correction band. */}
              <p className="text-xs text-muted-foreground">{t("impactSheetBoundary")}</p>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
