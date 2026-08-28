"use client";

// The depreciation runs list + the run-depreciation door — split out of
// depreciation-authority-panel.tsx (file-size discipline).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listDepreciationRuns, runDepreciationManual } from "@/lib/registers/depreciation";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { FaDoorDialog } from "./FaDoorDialog";

export function DepreciationRunsPanel({ clientId, hasLiveAuthority }: { clientId: string; hasLiveAuthority: boolean }) {
  const t = useTranslations("FixedAssetsDepreciation.runs");
  const tc = useTranslations("Common");
  const { data: runs, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (s) => listDepreciationRuns(s, clientId));

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader level={3} action={hasLiveAuthority ? <RunDialog clientId={clientId} busy={busy} act={act} /> : undefined}>
        {t("heading")}
      </SectionHeader>
      {runs && err ? (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined} className="text-xs">
          {err}
        </StateBanner>
      ) : null}
      {!runs ? (
        err ? <StateBanner tone="error" className="text-xs">{String(err)}</StateBanner> : null
      ) : runs.length === 0 ? (
        <EmptyState className="text-xs">{t("empty")}</EmptyState>
      ) : (
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("periodCol")}</TableHead>
              <TableHead>{t("modeCol")}</TableHead>
              <TableHead>{t("chargedCol")}</TableHead>
              <TableHead>{t("entriesCol")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.period_start} – {r.period_end}</TableCell>
                <TableCell><Badge variant={r.mode === "post" ? "default" : "outline"}>{t(`mode.${r.mode}`)}</Badge></TableCell>
                <TableCell>{fmtCents(r.charged_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell className="text-muted-foreground">{r.entries}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      )}
    </div>
  );
}

function RunDialog({ clientId, busy, act }: { clientId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<void> }) {
  const t = useTranslations("FixedAssetsDepreciation.runs");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  return (
    <FaDoorDialog
      triggerLabel={t("runTrigger")}
      title={t("runTitle")}
      description={t("runDescription")}
      confirmLabel={t("runTrigger")}
      busy={busy}
      confirmDisabled={!periodStart || !periodEnd}
      onConfirm={() => act(async () => { await runDepreciationManual(sessionTokenAccessor, { clientId, periodStart, periodEnd }); })}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="fa-run-start">{t("periodStartLabel")}</Label>
          <Input id="fa-run-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fa-run-end">{t("periodEndLabel")}</Label>
          <Input id="fa-run-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
      </div>
    </FaDoorDialog>
  );
}
