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

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StateBanner } from "@/components/common/state";
import { isAgreementFactPath, isPayrollFactPath, type EvidenceRegion } from "@/lib/documents/extract-shape";
import type { SourceRevisionResult } from "@/lib/documents/types";
import { cn } from "@/lib/utils";
import { DocumentRevisionDialog, revisableFactLane } from "./document-revision-dialog";

/** #646 — what a per-row Revise control needs in order to exist at all. The caller passes it only
 *  when the source-revision read succeeded, which is the SAME bookkeeper floor the write door
 *  holds (`clara.list_source_revisions`): a viewer's read refuses, so the caller has no
 *  `factsVersion` to hand over and NO COLUMN IS RENDERED. That is deliberate — an affordance whose
 *  door would refuse is worse than no affordance, and the floor is enforced by the database in both
 *  directions rather than re-implemented here. */
export type FactRevisionAffordance = {
  documentId: string;
  /** The INVOICE chain's facts version, which every invoice revision opened from this table must
   *  quote. */
  factsVersion: number;
  /** #1056 — the PAYROLL chain's facts version, which every payroll revision must quote instead.
   *
   *  TWO NUMBERS BECAUSE THERE ARE TWO CHAINS, and a revision refuses CLR19 against the wrong one.
   *  `clara.list_source_revisions` counts the two extraction kinds separately, so a payroll summary
   *  reads `facts_version` 0 (it carries no invoice reading) beside a payroll version of 1 or more.
   *  A payroll control quoted against 0 would refuse every time it was pressed.
   *
   *  `null` means the read could not report it — a server below the 0344 frontier answers without
   *  the key at all — and a payroll row then gets NO control, for the same reason a viewer gets no
   *  column: an affordance whose door would refuse is worse than no affordance. */
  payrollFactsVersion: number | null;
  busy: boolean;
  onRevised: (result: SourceRevisionResult) => void;
};

/** The source version a revision of this row must quote, or `null` when this surface has no number
 *  for that row's own chain. Stated once so the control's EXISTENCE and the number it carries are
 *  one decision: a row that gets a control always gets the right version with it. */
function laneVersion(
  revise: FactRevisionAffordance, lane: "invoice" | "payroll" | null,
): number | null {
  if (lane === null) return null;
  const version = lane === "payroll" ? revise.payrollFactsVersion : revise.factsVersion;
  // A chain with no reading on file is not a chain a revision can be written against: the door
  // refuses `no_facts_to_revise` at 0, so offering the control there would be offering a refusal.
  return version === null || version <= 0 ? null : version;
}

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
    // #945 — the payroll lane's eleven run-level questions. Each one is a TOTAL for the run, and
    // the label says so, because "EPF" alone on a document page could be one employee's.
    case "payroll.run.period": return t("factLabel.payrollPeriod");
    case "payroll.run.gross_pay": return t("factLabel.payrollGrossPay");
    case "payroll.run.epf_employee": return t("factLabel.payrollEpfEmployee");
    case "payroll.run.epf_employer": return t("factLabel.payrollEpfEmployer");
    case "payroll.run.socso_employee": return t("factLabel.payrollSocsoEmployee");
    case "payroll.run.socso_employer": return t("factLabel.payrollSocsoEmployer");
    case "payroll.run.eis_employee": return t("factLabel.payrollEisEmployee");
    case "payroll.run.eis_employer": return t("factLabel.payrollEisEmployer");
    case "payroll.run.pcb": return t("factLabel.payrollPcb");
    case "payroll.run.hrdf_levy": return t("factLabel.payrollHrdfLevy");
    case "payroll.run.net_pay": return t("factLabel.payrollNetPay");
    // #948 — the agreement lane's eleven questions. `kind` is labelled "What the agreement calls
    // itself", not "Agreement type", because the value IS the page's own words: a deterministic
    // evaluator classifies them and this UI must not imply it already has.
    case "contract.agreement.kind": return t("factLabel.agreementKind");
    case "contract.agreement.financier": return t("factLabel.agreementFinancier");
    case "contract.agreement.agreement_date": return t("factLabel.agreementDate");
    case "contract.agreement.asset_description": return t("factLabel.agreementAsset");
    case "contract.agreement.cash_price": return t("factLabel.agreementCashPrice");
    case "contract.agreement.deposit": return t("factLabel.agreementDeposit");
    case "contract.agreement.amount_financed": return t("factLabel.agreementAmountFinanced");
    case "contract.agreement.total_charges": return t("factLabel.agreementTotalCharges");
    case "contract.agreement.total_payable": return t("factLabel.agreementTotalPayable");
    case "contract.agreement.term_months": return t("factLabel.agreementTermMonths");
    case "contract.agreement.instalment_amount": return t("factLabel.agreementInstalment");
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
 *  recomputation of an amount. Otherwise the region's verbatim text.
 *
 *  #945 — THE ONE ARM THAT IS NOT GENERIC. The payroll lane writes a region for
 *  an answer the page does NOT print, carrying no rendering and no cents at
 *  all; `clara.persist_payroll_facts` writes that row on purpose, so that "the
 *  page is silent about the HRDF levy" survives to the screen instead of being
 *  rounded off into a blank a reader would read as zero. Scoped to `payroll.*`
 *  rather than applied to every valueless region, because no other lane writes
 *  one for an unanswered field — saying "not printed" about an invoice region
 *  would be this UI asserting something the invoice lane never said. */
function factValue(region: EvidenceRegion, t: (key: string) => string): string {
  if (region.monetary_cents !== null) return (region.monetary_cents / 100).toFixed(2);
  if (region.text_content !== null) return region.text_content;
  // #948 — the agreement lane writes the same kind of row for the same reason: a term the page
  // does not print (an interest-free plan's charges, an agreement with no deposit) lands carrying
  // no rendering and no cents, and "the page is silent" must survive to the screen instead of
  // being read as zero. Its own predicate rather than a widened payroll one, so each lane's claim
  // stays its own.
  if (isPayrollFactPath(region.field_path) || isAgreementFactPath(region.field_path)) return t("factNotPrinted");
  return t("evidenceNoValue");
}


/**
 * #885 — WHAT A CORRECTION DID TO THE WORK QUEUE, SAID WHERE IT WAS DONE.
 *
 * `clara.revise_document_fact` (migration 0268) retires every Work parked on a question about the
 * corrected document INSIDE the correcting transaction, and reports one `superseded_work` entry per
 * Work on its own receipt. Two outcomes, and the second is why this sentence exists: a Work whose
 * basis is the human's OWN instruction (`user_direct`) is re-admitted carrying it, while a Work
 * whose basis was DERIVED from the reading that just moved is retired with NO successor — because
 * re-admitting it would let the run post the PRE-correction figure against the corrected document
 * (review finding L09-ADV-01). That is work nobody is doing any more, and the person who corrected
 * the figure is the only one present at the moment it happens.
 *
 * SECOND FIX ROUND (recheck finding L09-RC-02): there is no longer a split to report. NO arm of
 * the correcting door admits a successor -- a basis nobody re-derived from the corrected document
 * is not the corrected facts, whoever first stated it -- so every retired Work needs the same one
 * thing said about it, and saying it once is more honest than a per-reason sentence that was
 * wrong for one of the three arms it covered.
 *
 * IT COUNTS, IT DOES NOT NAME. The Work ids are on the receipt and every one of them is a row on
 * the Work list under this client; repeating them here would be a second, drifting index of the
 * same rows. The number and what to do next are what change what a person does.
 *
 * NOTHING RETIRED, NOTHING SAID — including against a database below the 0268 frontier, whose
 * receipt carries no `superseded_work` key at all.
 */
export function SourceRevisionWorkEffect({ result }: { result: SourceRevisionResult | null }) {
  const t = useTranslations("ClientDocuments");
  const retired = result?.superseded_work ?? [];
  if (retired.length === 0) return null;
  return (
    <StateBanner tone="info" data-testid="facts-revision-work-effect">
      <p>{t("factsRevisionWorkStopped", { count: retired.length })}</p>
      <p>{t("factsRevisionWorkRestate")}</p>
    </StateBanner>
  );
}

export function DocumentFactsTable<T extends EvidenceRegion>({
  facts,
  selectedId,
  onSelect,
  revise,
}: {
  facts: readonly T[];
  /** D2 — the region currently highlighted on the page overlay. Absent when
   *  this table renders without a page beside it. */
  selectedId?: string | null;
  /** D2 — clicking a fact highlights its region and scrolls it into view. When
   *  absent the rows are plain text, never a control that does nothing. */
  onSelect?: (id: string) => void;
  /** #646 — the per-row human fact revision. Absent (or below the role floor, which is the same
   *  thing here) renders the table exactly as it rendered before this ticket: three columns, no
   *  fourth header, no controls. */
  revise?: FactRevisionAffordance | null;
}) {
  const t = useTranslations("ClientDocuments");
  // #885 — the door's answer outlives the dialog that asked. `DocumentRevisionDialog` is keyed on
  // `${region.id}:${revise.factsVersion}` and the facts version MOVES on every accepted revision,
  // so the dialog remounts the moment it succeeds; this table does not.
  const [workEffect, setWorkEffect] = useState<SourceRevisionResult | null>(null);

  if (facts.length === 0) {
    return <EmptyState>{t("factsEmpty")}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-2">
      <SourceRevisionWorkEffect result={workEffect} />
      <DataTableCard>
      <TableHeader>
        <TableRow>
          <TableHead>{t("colFactField")}</TableHead>
          <TableHead>{t("colFactValue")}</TableHead>
          <TableHead>{t("colFactConfidence")}</TableHead>
          {revise ? <TableHead>{t("colFactRevise")}</TableHead> : null}
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
              {revise ? (
                <TableCell className="align-top">
                  {/* ONLY WHERE THE DOOR WOULD ADMIT IT. `clara._revisable_fact_lane` is the
                      arbiter over two CLOSED sets, and a layout fragment, a statement-lane path or
                      a per-employee payroll cell is in neither — so a row that cannot be revised
                      says so plainly instead of offering a control that would refuse CLR10 on
                      confirm. #1056: the version the control carries is its own lane's, because a
                      revision quoted against the other chain's number refuses CLR19. */}
                  {(() => {
                    const lane = revisableFactLane(region.field_path);
                    const version = laneVersion(revise, lane);
                    return lane !== null && version !== null && region.field_path !== null ? (
                      <DocumentRevisionDialog
                        key={`${region.id}:${version}`}
                        documentId={revise.documentId}
                        fieldPath={region.field_path}
                        fieldLabel={label}
                        currentValue={factValue(region, t)}
                        factsVersion={version}
                        busy={revise.busy}
                        onRevised={(result) => { setWorkEffect(result); revise.onRevised(result); }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("factNotRevisable")}</span>
                    );
                  })()}
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
      </DataTableCard>
    </div>
  );
}
