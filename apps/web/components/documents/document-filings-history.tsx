"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filingBasisKey } from "@/lib/documents/copy";
import { businessDateTime } from "@/lib/business-date";
import { requestAutodraft, retireFiling } from "@/lib/documents/doors";
import { DocumentsDoorDialog } from "./DocumentsDoorDialog";
import { EmptyState, StateBanner } from "@/components/common/state";
import type { AutodraftOutcome, FilingRow } from "@/lib/documents/types";

/** A CHECKED lookup from the DB's `outcome` string to its own translation
 *  key — never a dynamic-key cast (document-admin.tsx's own
 *  `reextractionAdmissionLabel` header explains why). Every value in
 *  types.ts's `AutodraftOutcome` closed set is named; an outcome outside it
 *  renders honestly via the `unknown` template rather than a fabricated
 *  label. */
function autodraftOutcomeLabel(outcome: AutodraftOutcome, t: (key: string, values?: Record<string, string>) => string): string {
  switch (outcome) {
    case "admitted": return t("autodraft.outcome.admitted");
    case "re_admitted": return t("autodraft.outcome.re_admitted");
    case "re_admitted_after_withdrawal": return t("autodraft.outcome.re_admitted_after_withdrawal");
    case "noop_existing": return t("autodraft.outcome.noop_existing");
    case "already_done": return t("autodraft.outcome.already_done");
    case "skipped_direction": return t("autodraft.outcome.skipped_direction");
    case "refused_budget": return t("autodraft.outcome.refused_budget");
    case "refused_attempts": return t("autodraft.outcome.refused_attempts");
    case "lane_changed": return t("autodraft.outcome.lane_changed");
    default: return t("autodraft.outcome.unknown", { outcome });
  }
}

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
  const tg = useTranslations("DraftsDocumentGovernance");
  const [reason, setReason] = useState("");
  const [autodraftOutcomes, setAutodraftOutcomes] = useState<Record<string, AutodraftOutcome>>({});

  if (filings.length === 0) {
    return <EmptyState>{t("filingsEmpty")}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {filings.map((filing) => (
          <li key={filing.id} className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground">{t(filingBasisKey(filing.basis))}</span>
              {/* THE ONE-CLOCK LAW — and `businessDateTime`, not `businessDate`,
                  because this IS the audit trail: a filings history is a record
                  of when each act happened, and two reviewers in two timezones
                  must read the identical wall-clock moment
                  (lib/business-date.ts's own N11 note). */}
              <span className="text-xs text-muted-foreground">{businessDateTime(filing.filed_at)}</span>
              {filing.retired_at ? (
                <span className="text-xs text-muted-foreground">{t("filingRetired")}</span>
              ) : (
                <div className="flex items-center gap-2">
                  <DocumentsDoorDialog
                    triggerLabel={tg("autodraft.trigger")}
                    triggerSize="xs"
                    title={tg("autodraft.title")}
                    description={tg("autodraft.description")}
                    diagnostic={tg("autodraft.diagnostic")}
                    confirmLabel={tg("autodraft.confirm")}
                    busy={busy}
                    onConfirm={() => {
                      // F3 (independent review, minor): clear THIS filing's
                      // prior outcome banner at the START of a new attempt —
                      // a refusal (or a later hold outcome) must not leave an
                      // earlier "admitted" banner standing.
                      setAutodraftOutcomes((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== filing.id)));
                      return act(async () => {
                        const out = await requestAutodraft(filing.id);
                        setAutodraftOutcomes((m) => ({ ...m, [filing.id]: out.outcome }));
                      });
                    }}
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy || !reason.trim()}
                    onClick={() => void act(() => retireFiling(filing.id, reason.trim(), filing.revision_token))}
                  >
                    {t("retire")}
                  </Button>
                </div>
              )}
            </div>
            {autodraftOutcomes[filing.id] && (
              <StateBanner tone="info">{autodraftOutcomeLabel(autodraftOutcomes[filing.id]!, tg)}</StateBanner>
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
