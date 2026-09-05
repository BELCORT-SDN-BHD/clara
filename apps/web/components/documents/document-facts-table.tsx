"use client";

// D3, tier 1 — THE FACTS TABLE, and the fold of two near-identical renderers.
//
// `document-evidence.tsx`'s `RegionRowView` and `document-extract-panel.tsx`'s
// `RegionEntry` were two copies of the same code (the same `monetary_cents/100`
// arithmetic, the same `field_path` fallback), differing only in whether the
// confidence was shown. Both are gone; this is the one renderer, and it takes
// the structural subset (`EvidenceRegion`) both region shapes satisfy.
//
// It is a real <table>, not a <dl>: these rows are records with the same three
// columns, a professional reads DOWN a column to compare them, and a screen
// reader announces column headers. The old <dl> plus `truncate` gave neither.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/state";
import type { EvidenceRegion } from "@/lib/documents/extract-shape";
import { cn } from "@/lib/utils";

/** The human label for a fact's `field_path`.
 *
 *  A CHECKED lookup with an honest unknown arm — the shape
 *  `document-filings-history.tsx`'s `autodraftOutcomeLabel` and
 *  `firm-activity-feed.tsx`'s own event map already use, and NEVER a
 *  `t(\`factLabel.${path}\`)` dynamic-key cast (document-admin.tsx's own
 *  `reextractionAdmissionLabel` header explains why: a cast turns a missing
 *  translation into a rendered key). A path inside the invoice lane's closed
 *  set (0009:2069-2071) gets a real label; ANY OTHER path renders as its own
 *  raw dotted text. Never an invented name — a bank-statement lane writes
 *  paths this app has never seen, and labelling `statement.closing_balance` as
 *  anything but itself would be this UI asserting a meaning the DB never gave
 *  it.
 *
 *  `isKnownFactPath` and this switch are two spellings of one closed set, so
 *  `document-facts-table.test.tsx` pins them against each other: a path added
 *  to `KNOWN_FACT_PATHS` without an arm here goes RED rather than silently
 *  rendering a raw path a reader would think was a label. */
function factLabel(path: string | null, t: (key: string) => string): string {
  if (path === null) return t("evidenceUnlabeledField");
  switch (path) {
    case "invoice.total": return t("factLabel.invoiceTotal");
    case "invoice.amount_due": return t("factLabel.invoiceAmountDue");
    case "invoice.currency": return t("factLabel.invoiceCurrency");
    case "invoice.vendor_name": return t("factLabel.invoiceVendorName");
    case "invoice.invoice_id": return t("factLabel.invoiceInvoiceId");
    case "invoice.invoice_date": return t("factLabel.invoiceInvoiceDate");
    case "invoice.deposit": return t("factLabel.invoiceDeposit");
    default: return path; // the honest unknown arm: the path IS the label
  }
}

/** Exported for the drift cell: every member of `KNOWN_FACT_PATHS` must have an
 *  arm in `factLabel` above, and nothing else may. */
export function hasFactLabelArm(path: string): boolean {
  const raw = (key: string) => key;
  return factLabel(path, raw) !== path;
}

/** The displayed value. `monetary_cents` wins when present — it is the DB's own
 *  integer, and dividing by 100 here is a RENDER of that integer, never a
 *  recomputation of an amount. Otherwise the region's verbatim text. */
function factValue(region: EvidenceRegion, t: (key: string) => string): string {
  if (region.monetary_cents !== null) return (region.monetary_cents / 100).toFixed(2);
  return region.text_content ?? t("evidenceNoValue");
}

export function DocumentFactsTable<T extends EvidenceRegion>({
  facts,
  selectedId,
  onSelect,
}: {
  facts: readonly T[];
  /** D2 — the region currently highlighted on the page overlay. Absent when
   *  this table renders without a page beside it. */
  selectedId?: string | null;
  /** D2 — clicking a fact highlights its region and scrolls it into view. When
   *  absent the rows are plain text, never a control that does nothing. */
  onSelect?: (id: string) => void;
}) {
  const t = useTranslations("ClientDocuments");

  if (facts.length === 0) {
    return <EmptyState>{t("factsEmpty")}</EmptyState>;
  }

  return (
    <DataTableCard>
      <TableHeader>
        <TableRow>
          <TableHead>{t("colFactField")}</TableHead>
          <TableHead>{t("colFactValue")}</TableHead>
          <TableHead>{t("colFactConfidence")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {facts.map((region) => {
          const label = factLabel(region.field_path, t);
          const selected = selectedId === region.id;
          return (
            <TableRow key={region.id} aria-selected={selected} className={cn(selected && "bg-muted")}>
              <TableCell className="align-top font-medium text-foreground">
                {onSelect ? (
                  <button
                    type="button"
                    // The FACT LIST is the accessible control (the overlay's own
                    // <svg> is aria-hidden decoration over it), so this button
                    // carries the whole interaction: click, Enter, Space, and a
                    // focus ring, all from the primitive.
                    className="text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelect(region.id)}
                  >
                    {label}
                  </button>
                ) : (
                  label
                )}
                {/* The RAW path stays visible beside the label, always — a
                    professional auditing an extraction needs to know which
                    field the engine actually wrote, and for an unrecognised
                    path the label above IS this string, so it is suppressed
                    rather than printed twice. */}
                {region.field_path !== null && region.field_path !== label ? (
                  <span className="block text-xs font-normal text-muted-foreground">{region.field_path}</span>
                ) : null}
              </TableCell>
              <TableCell className="align-top wrap-anywhere text-foreground">{factValue(region, t)}</TableCell>
              <TableCell className="align-top text-muted-foreground">
                {region.engine_confidence !== null ? (
                  // The raw DB-computed decimal, verbatim — NEVER converted to a
                  // percentage (S6-R5/WA-L2's discipline) and never bucketed into
                  // an invented high/medium/low judgement this UI has no basis to
                  // draw. The badge is shape only; the LABEL inside it is what
                  // says which number this is.
                  <Badge variant="outline">
                    {t("evidenceConfidenceValue", { value: region.engine_confidence.toFixed(3) })}
                  </Badge>
                ) : (
                  <span className="text-xs">{t("evidenceNoConfidence")}</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </DataTableCard>
  );
}
