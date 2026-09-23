"use client";

// Run history — every run's own correction affordance, sourced from
// list_adjustment_runs (the ONE RPC this train wires; see lib/registers/adjustments.ts's
// header for why). A run is offered "Reverse pair" only when the DB's own projection says
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
//
// [#927, riders wave 3] `RunNowDialog` (run_adjustment_manual) is RETIRED WITH ITS DOOR
// (migration 0282) and removed from this file, along with the `onRunNow` prop —
// `adjustments-register.tsx` no longer passes one. Reverse-pair is D6-untouched and stays.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fmtCents } from "@/lib/registers/money";
import { EmptyState } from "@/components/common/state";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AdjustmentDoorDialog } from "./AdjustmentDoorDialog";
import type { AdjustmentRunWithCorrection } from "@/lib/registers/adjustments";

function ReversePairDialog({ busy, onSubmit }: { busy: boolean; onSubmit: (reason: string) => Promise<boolean> }) {
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
  runs,
  busy,
  onReversePair,
}: {
  runs: AdjustmentRunWithCorrection[];
  busy: boolean;
  onReversePair: (occurrenceEntryId: string, reason: string) => Promise<boolean>;
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
    </div>
  );
}
