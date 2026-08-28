"use client";

// One clara.client_identifier_promotions_visible row (lib/firm/needs-you-gaps.ts).
// Confirm is a genuine ONE-CLICK act (the door takes no other argument —
// 0103_f_a7_pi_additive.sql:866-904); decline needs a reason, same
// mode-toggle shape as FirmQuestionRow/NeedsYouRow. `citations` has no
// documented per-element shape, so only its count is shown — the same
// "render generically, invent no semantics a live body has not committed to"
// discipline as the firm-question candidates block.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/parts/PartBadge";
import { businessDateTime } from "@/lib/business-date";
import { isKnownIdentifierPromotionKind, type IdentifierPromotionRow as PromotionRow } from "@/lib/firm/needs-you-gaps";
import { ErrorMessage } from "./data-state";

export function IdentifierPromotionRow({
  row,
  busy,
  error,
  onConfirm,
  onDecline,
}: {
  row: PromotionRow;
  busy: boolean;
  error: unknown;
  onConfirm: (proposalId: string) => Promise<boolean>;
  onDecline: (proposalId: string, reason: string) => Promise<boolean>;
}) {
  const t = useTranslations("NeedsYou");
  const tc = useTranslations("Common");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const submitDecline = async () => {
    if (!reason.trim()) return;
    const ok = await onDecline(row.id, reason.trim());
    if (ok) {
      setDeclining(false);
      setReason("");
    }
  };

  const kindLabel = isKnownIdentifierPromotionKind(row.kind)
    ? t(`identifierPromotionKind.${row.kind}`)
    : t("identifierPromotionKind.unknown", { kind: row.kind });
  const modelLabel = row.model ? [row.model.provider, row.model.model, row.model.version].filter(Boolean).join(" · ") : null;
  const citationCount = Array.isArray(row.citations) ? row.citations.length : 0;

  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{kindLabel}</Badge>
        <span className="font-medium text-card-foreground">{row.value_normalized}</span>
        <span className="text-xs text-muted-foreground">{businessDateTime(row.proposed_at)}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <dt>{t("sightingsLabel")}</dt>
        <dd>{row.sightings}</dd>
        <dt>{t("citationsLabel")}</dt>
        <dd>{citationCount}</dd>
        {modelLabel ? (
          <>
            <dt>{t("modelLabel")}</dt>
            <dd>{modelLabel}</dd>
          </>
        ) : null}
      </dl>
      <p className="text-card-foreground">{row.rationale}</p>
      <div className="flex flex-col gap-2">
        {error ? <ErrorMessage error={error} /> : null}
        {declining ? (
          <div className="flex flex-col gap-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              aria-label={t("reasonPlaceholder")}
              disabled={busy}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void submitDecline()} disabled={busy || !reason.trim()}>
                {busy ? t("submitting") : t("submit")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDeclining(false);
                  setReason("");
                }}
                disabled={busy}
              >
                {tc("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void onConfirm(row.id)} disabled={busy}>
              {t("confirm")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setDeclining(true)} disabled={busy}>
              {t("decline")}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
