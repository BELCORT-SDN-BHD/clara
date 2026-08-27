"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filingBasisCopy } from "@/lib/documents/copy";
import { retireFiling } from "@/lib/documents/doors";
import type { FilingRow } from "@/lib/documents/types";

/**
 * Every filing (active + retired) for this document — the full history
 * (lib/documents/reads.ts's `listFilingsForDocument`). `act` is the caller's
 * `useHydratedPart().act`: retiring re-reads the whole detail bundle afterward,
 * never assumes the row is gone.
 */
export function DocumentFilingsHistory({
  filings, busy, act,
}: {
  filings: FilingRow[];
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("ClientDocuments");
  const [reason, setReason] = useState("");

  if (filings.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("filingsEmpty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {filings.map((filing) => (
          <li key={filing.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-foreground">{filingBasisCopy(filing.basis)}</span>
            <span className="text-xs text-muted-foreground">{new Date(filing.filed_at).toLocaleDateString()}</span>
            {filing.retired_at ? (
              <span className="text-xs text-muted-foreground">{t("filingRetired")}</span>
            ) : (
              <Button
                size="xs"
                variant="outline"
                disabled={busy || !reason.trim()}
                onClick={() => void act(() => retireFiling(filing.id, reason.trim(), filing.revision_token))}
              >
                {t("retire")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {filings.some((f) => !f.retired_at) ? (
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("retireReasonPlaceholder")}
          aria-label={t("retireReasonPlaceholder")}
        />
      ) : null}
    </div>
  );
}
