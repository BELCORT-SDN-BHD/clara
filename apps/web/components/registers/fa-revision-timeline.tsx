"use client";

// #651 — THE POLICY-EFFECTIVE REVISION TIMELINE.
//
// AC4's word is SEPARATES: the detail page must keep the particulars, the policy-effective
// revisions, the calculated schedule and the immutable charge history apart. Before this file the
// History tab rendered LINEAGE RELATIONS — which asset supersedes which — and there was nowhere at
// all to read WHEN a generation took effect, WHAT it changed, or WHY. `clara.get_fixed_asset` has
// returned that array since 0041 (`lineage`, one `_fa_asset_json` per ancestor generation) and had
// exactly ONE consumer in this app: a type declaration.
//
// ITS OWN EMPTY STATE, AND THAT IS THE REASON IT IS ITS OWN TAB. "This asset's estimate has never
// been revised" is not "depreciation particulars are not filled in yet" — they are different facts
// about different things, and a merged section can only show one of them.
//
// THE CLASS IS THE DATABASE'S OR IT IS ABSENT. `change_class` is stamped by
// `clara.revise_fixed_asset_particulars` on the successor row only and is never back-filled, so
// every root row and every revision minted before migration 0227 answers `null`. That renders as
// NOT RECORDED — never as "estimate", which would be this surface inventing an accounting claim.

import { useTranslations } from "next-intl";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/state";
import { fmtCents } from "@/lib/registers/money";
import type { FixedAssetRow } from "@/lib/registers/fixed-assets";

/** Oldest generation first. `clara.get_fixed_asset` walks the lineage UPWARD from the asset being
 *  read (`lineage[0]` is its immediate predecessor), so the timeline reverses it and appends the
 *  asset itself as the CURRENT generation — which is what makes "current" a position rather than
 *  a flag this surface has to compute. */
export function faGenerations(asset: FixedAssetRow, lineage: readonly FixedAssetRow[]): FixedAssetRow[] {
  return [...lineage].reverse().concat(asset);
}

export function FaRevisionTimeline({
  asset,
  lineage,
}: {
  asset: FixedAssetRow;
  lineage: readonly FixedAssetRow[];
}) {
  const t = useTranslations("FixedAssetDetail.revisions");
  const tReg = useTranslations("ClientRegisters.fixedAssets");
  const tc = useTranslations("Common");
  const dash = "—";
  const generations = faGenerations(asset, lineage);

  const methodLabels: Record<string, string> = {
    straight_line: tReg("methods.straight_line"),
    reducing_balance: tReg("methods.reducing_balance"),
    none: tReg("methods.none"),
  };
  const classLabels: Record<string, string> = {
    estimate: t("class.estimate"),
    policy: t("class.policy"),
    error: t("class.error"),
  };

  // ONE GENERATION IS NOT A TIMELINE. A root row with no predecessor has never been revised, and
  // saying so is a different sentence from "no particulars yet" (which the Particulars tab owns).
  if (generations.length <= 1) {
    return <EmptyState>{t("empty")}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 裁-190's `label`: a table whose only heading is a page-level <h1> two landmarks up is
          announced as an unnamed table, and this route now shows several. */}
      <DataTableCard label={t("tableCaption")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("effectiveFrom")}</TableHead>
            <TableHead>{t("changeClass")}</TableHead>
            <TableHead>{tReg("method")}</TableHead>
            <TableHead>{t("life")}</TableHead>
            <TableHead>{t("rate")}</TableHead>
            <TableHead>{t("residual")}</TableHead>
            <TableHead>{t("reason")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {generations.map((g, i) => {
            const current = i === generations.length - 1;
            return (
              <TableRow key={g.id} data-testid={`fa-revision-row-${g.id}`} data-current={current ? "true" : undefined}>
                <TableCell className="text-muted-foreground">
                  <span className="flex flex-wrap items-center gap-2">
                    {/* A ROOT GENERATION HAS NO effective_from — it came into effect when the
                        asset was acquired, and the acquisition date is the honest thing to show. */}
                    {g.effective_from ?? g.acquired_date ?? dash}
                    {current ? <Badge variant="default">{t("current")}</Badge> : null}
                  </span>
                </TableCell>
                <TableCell>
                  {g.change_class
                    ? <Badge variant="secondary">{classLabels[g.change_class] ?? g.change_class}</Badge>
                    : <span className="text-muted-foreground">{t("class.notRecorded")}</span>}
                </TableCell>
                <TableCell>{g.method ? (methodLabels[g.method] ?? g.method) : dash}</TableCell>
                <TableCell className="text-muted-foreground">{g.useful_life_months ?? dash}</TableCell>
                <TableCell className="text-muted-foreground">{g.rate_bps ?? dash}</TableCell>
                <TableCell>{fmtCents(g.residual_cents, tc("centsUnsafe"))}</TableCell>
                {/* The reason is a human sentence and may be long; it wraps rather than
                    truncating, which is appendix D row 57's narrow-screen reading strategy —
                    preserve the reading, never clip a column silently. */}
                <TableCell className="max-w-[28ch] whitespace-normal break-words text-muted-foreground">
                  {g.change_reason ?? dash}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </DataTableCard>
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </div>
  );
}
