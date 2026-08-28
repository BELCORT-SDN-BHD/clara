"use client";

// The pair-reversal ledger — clara.adjustment_pair_reversals (a plain table
// read, Q3's own pattern) with the approve/cancel maker-checker ceremony on
// every `pending` row. Approve is a DISTINCT checker act (the DB enforces
// this at the door, not client-side); this panel does not attempt to hide the
// button from the reversal's own maker — a real refusal, if the door ever
// enforces maker != checker by identity, renders verbatim like any other.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/common/state";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { shortId } from "@/lib/registers/money";
import { AdjustmentDoorDialog } from "./AdjustmentDoorDialog";
import type { AdjustmentPairReversalRow } from "@/lib/registers/adjustments";

const STATUS_VARIANT = {
  pending: "outline",
  approving: "secondary",
  completed: "default",
  cancelled: "secondary",
} as const;

function ApprovePairDialog({ busy, onSubmit }: { busy: boolean; onSubmit: (attestation: string) => Promise<void> }) {
  const t = useTranslations("AdjustmentsAccounts.approvePair");
  const [attestation, setAttestation] = useState("");
  return (
    <AdjustmentDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="xs"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("trigger")}
      busy={busy}
      onConfirm={() => onSubmit(attestation.trim())}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="adj-pair-attestation">{t("attestationLabel")}</Label>
        <Textarea id="adj-pair-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} />
      </div>
    </AdjustmentDoorDialog>
  );
}

function CancelPairDialog({ busy, onSubmit }: { busy: boolean; onSubmit: (reason: string) => Promise<void> }) {
  const t = useTranslations("AdjustmentsAccounts.cancelPair");
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
        <Label htmlFor="adj-pair-cancel-reason">{t("reasonLabel")}</Label>
        <Textarea id="adj-pair-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </AdjustmentDoorDialog>
  );
}

export function AdjustmentPairReversalPanel({
  pairReversals,
  busy,
  onApprove,
  onCancel,
}: {
  pairReversals: AdjustmentPairReversalRow[];
  busy: boolean;
  onApprove: (pairId: string, attestation: string) => Promise<void>;
  onCancel: (pairId: string, reason: string) => Promise<void>;
}) {
  const t = useTranslations("AdjustmentsAccounts.pairLedger");
  // N10's own convention (adjustments-register.tsx's header): a checked
  // lookup with an HONEST raw-value fallback for anything outside the known
  // set — never a key path handed straight to `t()`.
  const statusLabels: Record<string, string> = {
    pending: t("statuses.pending"),
    approving: t("statuses.approving"),
    completed: t("statuses.completed"),
    cancelled: t("statuses.cancelled"),
  };

  return (
    <div className="flex flex-col gap-2">
      {pairReversals.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("raised")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pairReversals.map((pr) => (
              <TableRow key={pr.id}>
                <TableCell>{pr.created_at}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[pr.status as keyof typeof STATUS_VARIANT] ?? "outline"}>
                    {statusLabels[pr.status] ?? pr.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {pr.status === "pending" ? (
                    <div className="flex gap-2">
                      <ApprovePairDialog busy={busy} onSubmit={(attestation) => onApprove(pr.id, attestation)} />
                      <CancelPairDialog busy={busy} onSubmit={(reason) => onCancel(pr.id, reason)} />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{shortId(pr.id)}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      )}
    </div>
  );
}
