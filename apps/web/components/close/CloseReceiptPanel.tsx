"use client";

// The close receipt / segregation panel (read) — get_close_plan's `receipt`
// branch, plus an on-demand `verify_close` recompute (0056:2529, viewer+). Every
// figure here is read verbatim from the DB; this component computes nothing.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyClose, isDoorRefusal } from "@/lib/close/api";
import type { ClosePlanReceipt } from "@/lib/close/types";
import type { SessionTokenAccessor } from "@/lib/session";

export function CloseReceiptPanel({ receipt, session }: { receipt: ClosePlanReceipt; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientClose.receipt");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  if (receipt.state === "absent") {
    return <p className="text-sm text-muted-foreground">{t("absent")}</p>;
  }

  const runVerify = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await verifyClose(receipt.receipt_id, { session });
      setVerified(result.verified);
    } catch (e) {
      setVerifyError(isDoorRefusal(e) ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={receipt.status === "active" ? "default" : "outline"}>{receipt.kind} · {receipt.status}</Badge>
        {receipt.segregation_mode ? (
          <Badge variant="secondary">{t(`segregation.${receipt.segregation_mode}`)}</Badge>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("closedBy")}</dt>
        <dd className="font-mono text-card-foreground">{receipt.closed_by}</dd>
        <dt className="text-muted-foreground">{t("closedAt")}</dt>
        <dd className="text-card-foreground">{receipt.closed_at}</dd>
        <dt className="text-muted-foreground">{t("plNet")}</dt>
        <dd className="font-mono text-card-foreground">{receipt.pl_net_cents}</dd>
        <dt className="text-muted-foreground">{t("retainedEarnings")}</dt>
        <dd className="font-mono text-card-foreground">{receipt.retained_earnings_account}</dd>
        <dt className="text-muted-foreground">{t("watermark")}</dt>
        <dd className="font-mono text-card-foreground">{receipt.books_watermark}</dd>
        <dt className="text-muted-foreground">{t("datasetSha")}</dt>
        <dd className="truncate font-mono text-card-foreground">{receipt.dataset_sha256}</dd>
        {receipt.self_attestation ? (
          <>
            <dt className="text-muted-foreground">{t("selfAttestation")}</dt>
            <dd className="text-card-foreground">{receipt.self_attestation}</dd>
          </>
        ) : null}
      </dl>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={verifying} onClick={runVerify}>
          {verifying ? t("verifying") : t("verify")}
        </Button>
        {verified !== null ? (
          <Badge variant={verified ? "default" : "destructive"}>{verified ? t("verified") : t("notVerified")}</Badge>
        ) : null}
      </div>
      {verifyError ? <p className="text-xs text-destructive">{verifyError}</p> : null}
    </div>
  );
}
