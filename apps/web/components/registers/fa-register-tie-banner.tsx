"use client";

// The register<->GL tie-out — clara.fa_register_tie(p_client, p_as_of). A
// STATE BANNER, not a UI-computed figure (AGENTS.md hard constraint 2, and
// the port-wave plan §4/T3's own line: "fa_register_tie renders as a state
// banner, never a UI-computed number"): `tie`/every `*_diff_cents` column is
// the DB's own comparison, rendered verbatim.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { faRegisterTie } from "@/lib/registers/fixed-assets";
import { businessToday } from "@/lib/business-date";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StateBanner, EmptyState } from "@/components/common/state";
import { DataState } from "@/components/firm/data-state";

export function FaRegisterTieBanner({ clientId }: { clientId: string }) {
  const t = useTranslations("FixedAssetsDepreciation.tie");
  const tc = useTranslations("Common");
  const asOf = businessToday();
  const { data, loading, error } = useAsyncRead(() => faRegisterTie(sessionTokenAccessor, clientId, asOf));

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      <p className="text-xs text-muted-foreground">{t("subheading")}</p>
      <DataState loading={loading} error={error} isEmpty={false} emptyMessage="">
        {data ? (
          <div className="flex flex-col gap-2">
            <StateBanner tone={data.tie ? "neutral" : "error"} title={t("asOf", { date: data.as_of })}>
              {data.tie ? t("tied") : t("broken")}
            </StateBanner>
            {data.incomplete_count > 0 ? <p className="text-xs text-warning">{t("incompleteNote", { count: data.incomplete_count })}</p> : null}
            {data.pending_draft_count > 0 ? <p className="text-xs text-muted-foreground">{t("pendingDraftNote", { count: data.pending_draft_count })}</p> : null}
            {data.accounts.length === 0 ? (
              <EmptyState className="text-xs">{t("empty")}</EmptyState>
            ) : (
              <DataTableCard>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("assetAccountCol")}</TableHead>
                    <TableHead>{t("accumAccountCol")}</TableHead>
                    <TableHead>{t("registerCol")}</TableHead>
                    <TableHead>{t("glCol")}</TableHead>
                    <TableHead>{t("diffCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.accounts.map((row, i) => (
                    <TableRow key={`${row.asset_account}:${row.accum_account ?? ""}:${i}`}>
                      <TableCell>{row.cost_reported_here ? row.asset_account : ""}</TableCell>
                      <TableCell className="text-muted-foreground">{row.accum_account ?? "—"}</TableCell>
                      <TableCell>{row.cost_reported_here ? fmtCents(row.register_cost_cents, tc("centsUnsafe")) : fmtCents(row.register_accum_cents, tc("centsUnsafe"))}</TableCell>
                      <TableCell>{row.cost_reported_here ? fmtCents(row.gl_cost_cents, tc("centsUnsafe")) : fmtCents(row.gl_accum_cents, tc("centsUnsafe"))}</TableCell>
                      <TableCell className={(row.cost_reported_here ? row.cost_diff_cents : row.accum_diff_cents) !== 0 ? "text-error" : ""}>
                        {fmtCents(row.cost_reported_here ? row.cost_diff_cents : row.accum_diff_cents, tc("centsUnsafe"))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTableCard>
            )}
          </div>
        ) : null}
      </DataState>
    </div>
  );
}
