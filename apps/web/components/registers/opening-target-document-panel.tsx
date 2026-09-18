"use client";

// #656 — THE TIED-SEED SIBLING of `OpeningTargetKeyedPanel`, which until this ticket rendered
// NOTHING: `opening-seed-workbench.tsx` mounted the keyed panel only for an untied basis, so a
// basis bound to a document showed its dry-run gates over targets nobody could see.
//
// WHAT IT SHOWS, AND WHY EACH COLUMN IS THERE.
//   · line key      — the stable identity the parse minted per source region, so a refusal that
//                     names a row and this table name the same thing.
//   · source label  — EXACTLY AS PRINTED. Not the chart's name for the account: the whole point of
//                     a document-sourced basis is that a professional can hold the page beside the
//                     screen, and rewriting the label to something tidier breaks that.
//   · account       — the account the figure lands on.
//   · debit/credit  — the DB's own cents. No arithmetic happens in this file beyond the coverage
//                     footer, which counts rows and sums figures the database already returned.
//   · provenance    — document or keyed, with the document's name, its sha-12 and the REGION id
//                     the target cites. A figure a person cannot trace back to a page is exactly
//                     the thing this ticket exists to stop shipping.
//
// THE FOOTER IS COVERAGE, NOT A TIE, and the distinction is C-25's own lesson. `OpeningDryrunStrip`
// owns the tie and mints no numeral; a mapped/unmapped total is a statement about how much of the
// printed source has an account behind it, which is a different question from whether the basis
// ties. So the totals live HERE, are labelled coverage, and carry no percentage — "97% mapped"
// reads as "basically done", and an opening basis is complete or it is not.
//
// MEASURED, AND IT SHAPES THE UNMAPPED CELL: on a DOCUMENT-sourced basis a target can never be
// unmapped. `clara.record_opening_targets_parsed` re-derives the account from the stored region
// and refuses any disagreement, and `fk_opening_tb_targets_account` requires that account to exist
// in the client's chart — so a parsed target is always both source-exact and chart-present
// (`packages/db/tests/opening-ledger-source.test.mjs`, `p656.tie.unmapped_blocks`). The unmapped
// branch below therefore fires only for a KEYED row, and it renders as an ACTION rather than a
// dash: a dash says "nothing here", when what is true is "this line still needs an account".

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/state";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtCents } from "@/lib/registers/money";
import { openingCoverage, provenanceOf, shaShort } from "@/lib/registers/opening-source";
import type { OpeningSeedRow, OpeningTbTargetRow } from "@/lib/registers/opening-types";

export function OpeningTargetDocumentPanel({
  clientId,
  seed,
  targets,
  documentName,
}: {
  clientId: string;
  seed: OpeningSeedRow;
  targets: OpeningTbTargetRow[];
  /** The tie document's filename when the surface knows it; the sha is always on the seed. */
  documentName: string | null;
}) {
  const t = useTranslations("OpeningCarryDown.source");
  const tc = useTranslations("Common");
  const coverage = openingCoverage(targets);

  return (
    <div className="flex flex-col gap-2" data-testid="opening-target-document-panel">
      <p className="text-xs text-muted-foreground">{t("targetsHeading")}</p>

      {targets.length === 0 ? (
        <EmptyState className="text-xs">{t("targetsEmpty")}</EmptyState>
      ) : (
        <>
          <DataTableCard>
            <TableHeader>
              <TableRow>
                <TableHead>{t("lineKeyCol")}</TableHead>
                <TableHead>{t("sourceLabelCol")}</TableHead>
                <TableHead>{t("accountCol")}</TableHead>
                <TableHead className="text-right">{t("debitCol")}</TableHead>
                <TableHead className="text-right">{t("creditCol")}</TableHead>
                <TableHead>{t("provenanceCol")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((tg) => {
                const provenance = provenanceOf(tg);
                const mapped = typeof tg.account_code === "string" && tg.account_code.trim() !== "";
                return (
                  <TableRow key={tg.id}>
                    <TableCell className="font-mono text-xs">{tg.line_key}</TableCell>
                    <TableCell>{tg.source_label ?? tg.line_key}</TableCell>
                    <TableCell>
                      {mapped ? (
                        tg.account_code
                      ) : (
                        // AN ACTION, NEVER A DASH. The chart register is where an account is
                        // created or a code is chosen, so the row points there instead of
                        // pretending the cell is simply empty.
                        <Link
                          href={`/clients/${clientId}/registers?tab=accounts`}
                          className="underline underline-offset-4"
                        >
                          {t("mapThisLine")}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{fmtCents(tg.debit_cents, tc("centsUnsafe"))}</TableCell>
                    <TableCell className="text-right">{fmtCents(tg.credit_cents, tc("centsUnsafe"))}</TableCell>
                    <TableCell className="text-xs">
                      {provenance.kind === "document" ? (
                        <span>
                          <Badge variant="secondary">{t("provenanceDocument")}</Badge>{" "}
                          <span className="text-muted-foreground">
                            {t("provenanceDocumentDetail", {
                              document: documentName ?? shaShort(provenance.sha256),
                              sha: shaShort(provenance.sha256),
                              region: provenance.regionId ?? t("provenanceRegionUnknown"),
                            })}
                          </span>
                        </span>
                      ) : (
                        <span>
                          <Badge variant="outline">{t("provenanceKeyed")}</Badge>{" "}
                          <span className="text-muted-foreground">{t("provenanceKeyedDetail")}</span>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTableCard>

          {/* COVERAGE, and it says so. Counts AND cents, both sides, no percentage — and
              deliberately outside OpeningDryrunStrip, whose law is that it mints no numeral. */}
          <dl
            className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground"
            aria-label={t("coverageLabel")}
          >
            <div className="flex gap-1">
              <dt>{t("coverageMapped")}</dt>
              <dd>
                {t("coverageCounts", { n: coverage.mappedCount })}{" "}
                {t("coverageCents", {
                  debit: fmtCents(coverage.mappedDebitCents, tc("centsUnsafe")),
                  credit: fmtCents(coverage.mappedCreditCents, tc("centsUnsafe")),
                })}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>{t("coverageUnmapped")}</dt>
              <dd className={coverage.unmappedCount > 0 ? "text-warning" : undefined}>
                {t("coverageCounts", { n: coverage.unmappedCount })}{" "}
                {t("coverageCents", {
                  debit: fmtCents(coverage.unmappedDebitCents, tc("centsUnsafe")),
                  credit: fmtCents(coverage.unmappedCreditCents, tc("centsUnsafe")),
                })}
              </dd>
            </div>
          </dl>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        {seed.tie_document_sha256
          ? t("boundTo", { document: documentName ?? "", sha: shaShort(seed.tie_document_sha256) })
          : t("boundToNothing")}
      </p>
    </div>
  );
}
