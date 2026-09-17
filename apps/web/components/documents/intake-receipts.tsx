"use client";

// #633 AC1(c) — THE RECEIPTS THAT SURVIVE A RELOAD, and the settle-without-reload
// half of #606's own follow-up obligation.
//
// Every row here is a DURABLE record read back from `clara.document_intakes_visible`
// (masked since 0007, granted since 0007:2747) — not the browser's memory of what it
// did. That is the whole point: before this, the queue lived in a React ref, so a
// reload lost every receipt and there was no way to learn what had become of a batch.
//
// THE WATERMARK IS THE READ, NOT THE CLOCK. The footer states when this derivation
// was read and whether anything is still moving, so a stale table is labelled rather
// than mistaken for a settled one. When the bounded poll exhausts, the surface says so
// and offers a manual Refresh instead of spinning — an honest end, not a hidden one.

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, LoadingState } from "@/components/common/state";
import { Badge } from "@/components/ui/badge";
import { businessDate } from "@/lib/business-date";
import { renderFileSize } from "@/lib/documents/file-size";
import { renderKindLabel, needsClassification } from "@/lib/documents/kind-label";
import type { CapabilityIndex } from "@/lib/documents/capability-registry";
import type { IntakeReceipt, IntakeReceiptsLoad } from "@/lib/documents/receipts";
import { CapabilityTiers } from "./capability-tiers";
import { DocumentKindControl } from "./document-kind-control";
import { DoorFeedback } from "./door-feedback";
import type { PartClr } from "@/lib/parts/hooks";

const INTAKE_STATUS_KEYS: Record<string, string> = {
  uploading: "intakeStatus.uploading",
  received: "intakeStatus.received",
  verifying: "intakeStatus.verifying",
  verified: "intakeStatus.verified",
  duplicate: "intakeStatus.duplicate",
  finalized: "intakeStatus.finalized",
  adopted: "intakeStatus.adopted",
  failed: "intakeStatus.failed",
};

export function IntakeReceipts({
  load, loading, err, clr, capabilityIndex, exhausted, onRefresh, act,
}: {
  load: IntakeReceiptsLoad | null;
  loading: boolean;
  err: string | null;
  clr: PartClr;
  capabilityIndex: CapabilityIndex | null;
  /** True once the bounded settle-poll gave up with rows still unsettled. */
  exhausted: boolean;
  onRefresh: () => void;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("ClientDocuments");

  if (loading && !load) return <LoadingState>{t("receiptsLoading")}</LoadingState>;
  if (!load && (err || clr)) {
    return (
      <div className="flex flex-col gap-2">
        <EmptyState>{t("receiptsUnavailable")}</EmptyState>
        <DoorFeedback err={err} clr={clr} />
      </div>
    );
  }
  if (!load || load.receipts.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <EmptyState>{t("receiptsEmpty")}</EmptyState>
        <DoorFeedback err={err} clr={clr} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <DataTableCard label={t("receiptsTableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colFile")}</TableHead>
            <TableHead>{t("colSize")}</TableHead>
            <TableHead>{t("colKind")}</TableHead>
            <TableHead>{t("colPhase")}</TableHead>
            <TableHead>{t("colOrigin")}</TableHead>
            <TableHead>{t("colReceived")}</TableHead>
            <TableHead>{t("colCapability")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {load.receipts.map((receipt) => (
            <ReceiptRow key={receipt.intake.id} receipt={receipt} capabilityIndex={capabilityIndex} act={act} />
          ))}
        </TableBody>
      </DataTableCard>
      <p className="text-xs text-muted-foreground" data-testid="receipts-watermark">
        {load.unsettled > 0
          ? t("receiptsWatching", { count: load.unsettled })
          : t("receiptsSettled")}
        {" "}
        {t("receiptsStale")}
      </p>
      {exhausted || load.unsettled > 0 ? (
        <div>
          <Button type="button" size="xs" variant="outline" data-testid="receipts-refresh" onClick={onRefresh}>
            {t("receiptsRefresh")}
          </Button>
        </div>
      ) : null}
      <DoorFeedback err={err} clr={clr} />
    </div>
  );
}

function ReceiptRow({
  receipt, capabilityIndex, act,
}: {
  receipt: IntakeReceipt;
  capabilityIndex: CapabilityIndex | null;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("ClientDocuments");
  const { intake } = receipt;
  const statusKey = INTAKE_STATUS_KEYS[intake.status];

  return (
    <TableRow className="enter-content align-top">
      <TableCell className="max-w-48 truncate font-medium text-foreground" title={intake.original_filename}>
        {intake.original_filename}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{renderFileSize(intake.declared_bytes, t)}</TableCell>
      <TableCell className="text-muted-foreground">
        <div className="flex flex-col gap-1">
          <span>{renderKindLabel(receipt.documentKind, t)}</span>
          {/* AC3(a): the NAMED unclassified state is ACTIONABLE on a receipt row. */}
          {needsClassification(receipt.documentKind) && intake.document_id ? (
            <DocumentKindControl
              documentId={intake.document_id}
              filename={intake.original_filename}
              busy={false}
              act={act}
            />
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <div className="flex flex-col gap-1">
          {/* The DB's own status word, never the queue's local one — this row was read
              back, not remembered. An unrecognised status renders itself rather than
              borrowing another status's phrase. */}
          <span>{statusKey ? t(statusKey) : intake.status}</span>
          {intake.status === "failed" && intake.failure_code ? (
            <span className="text-xs text-error">{intake.failure_code}</span>
          ) : null}
          {!receipt.filedHere ? (
            <Badge variant="outline">{t("receiptUnassigned")}</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {intake.origin === "chat" ? t("originChat") : t("originDocumentsTab")}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {businessDate(new Date(intake.created_at))}
      </TableCell>
      <TableCell className="min-w-40">
        <CapabilityTiers
          index={capabilityIndex}
          mime={receipt.mimeType}
          kind={receipt.documentKind}
          filename={intake.original_filename}
          compact
        />
      </TableCell>
    </TableRow>
  );
}
