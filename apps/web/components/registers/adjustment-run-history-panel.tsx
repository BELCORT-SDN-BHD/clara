"use client";

// Run history — run_adjustment_manual (bookkeeper+) plus every run's own
// correction affordance, sourced from list_adjustment_runs (the ONE RPC this
// train wires; see lib/registers/adjustments.ts's header for why). A run is
// offered "Reverse pair" only when the DB's own projection says
// `correctable: true` AND `correction_verb === "clara.reverse_adjustment_pair"`
// — a solo occurrence's own correction (`clara.reverse_entry`) is T6's door,
// not this train's, and is rendered as an honest note rather than a second,
// wrong button. When not correctable, the DB's own wall (+ advice sentence,
// when it has one) renders verbatim — never a client-side guess at why.
//
// F2 (independent review, fix-required, 2026-08-28): the reverse-pair call
// below sends `r.correction_entry` — the DB's OWN resolved occurrence id —
// not `r.entry_id` re-derived by inference. See adjustments.ts's own field
// comment for the full grounding.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fmtCents } from "@/lib/registers/money";
import { EmptyState } from "@/components/common/state";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/common/native-select";
import { AdjustmentDoorDialog } from "./AdjustmentDoorDialog";
import type { AdjustmentTemplateRow, AdjustmentRunWithCorrection } from "@/lib/registers/adjustments";

function RunNowDialog({
  templates,
  busy,
  onSubmit,
}: {
  templates: AdjustmentTemplateRow[];
  busy: boolean;
  onSubmit: (templateId: string, periodStart: string, periodEnd: string) => Promise<void>;
}) {
  const t = useTranslations("AdjustmentsAccounts.runNow");
  const liveTemplates = templates.filter((tpl) => tpl.status === "live");
  const [templateId, setTemplateId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const canSubmit = templateId !== "" && periodStart !== "" && periodEnd !== "";

  return (
    <AdjustmentDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("trigger")}
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() => onSubmit(templateId, periodStart, periodEnd)}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adj-run-template">{t("templateLabel")}</Label>
          <NativeSelect id="adj-run-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t("selectTemplate")}</option>
            {liveTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </NativeSelect>
          {liveTemplates.length === 0 ? <p className="text-xs text-muted-foreground">{t("noLiveTemplates")}</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-run-start">{t("periodStartLabel")}</Label>
            <Input id="adj-run-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-run-end">{t("periodEndLabel")}</Label>
            <Input id="adj-run-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
          </div>
        </div>
      </div>
    </AdjustmentDoorDialog>
  );
}

function ReversePairDialog({ busy, onSubmit }: { busy: boolean; onSubmit: (reason: string) => Promise<void> }) {
  const t = useTranslations("AdjustmentsAccounts.reversePair");
  const [reason, setReason] = useState("");
  return (
    <AdjustmentDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      triggerSize="xs"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("trigger")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => onSubmit(reason.trim())}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="adj-reverse-pair-reason">{t("reasonLabel")}</Label>
        <Input id="adj-reverse-pair-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </AdjustmentDoorDialog>
  );
}

export function AdjustmentRunHistoryPanel({
  templates,
  runs,
  busy,
  onRunNow,
  onReversePair,
}: {
  templates: AdjustmentTemplateRow[];
  runs: AdjustmentRunWithCorrection[];
  busy: boolean;
  onRunNow: (templateId: string, periodStart: string, periodEnd: string) => Promise<void>;
  onReversePair: (occurrenceEntryId: string, reason: string) => Promise<void>;
}) {
  const t = useTranslations("AdjustmentsAccounts.runHistory");
  const tc = useTranslations("Common");

  return (
    <div className="flex flex-col gap-2">
      {runs.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("period")}</TableHead>
              <TableHead>{t("mode")}</TableHead>
              <TableHead>{t("amount")}</TableHead>
              <TableHead>{t("correction")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {r.period_start} – {r.period_end}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.mode === "post" ? t("modePost") : t("modeDraft")}</TableCell>
                <TableCell>{fmtCents(r.amount_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.active_pair_id ? (
                    t("pairInFlight", { status: r.active_pair_status ?? "?" })
                  ) : r.correctable && r.correction_verb === "clara.reverse_adjustment_pair" ? null : r.correctable && r.correction_verb === "clara.reverse_entry" ? (
                    t("soloOccurrenceNote")
                  ) : r.correction_wall_advice ? (
                    r.correction_wall_advice
                  ) : r.correction_wall ? (
                    t("wallFallback", { wall: r.correction_wall })
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {r.correctable && r.correction_verb === "clara.reverse_adjustment_pair" ? (
                    <ReversePairDialog busy={busy} onSubmit={(reason) => onReversePair(r.correction_entry, reason)} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      )}
      <div>
        <RunNowDialog templates={templates} busy={busy} onSubmit={onRunNow} />
      </div>
    </div>
  );
}
