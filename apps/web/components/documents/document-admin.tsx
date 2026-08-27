"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { placeLegalHold, releaseLegalHold, setDocumentKind } from "@/lib/documents/doors";
import { SectionHeader } from "@/components/common/section-header";
import { DOCUMENT_KINDS, type DocumentRow } from "@/lib/documents/types";

/**
 * Classify (set_document_kind, bookkeeper+, reason REQUIRED — the DB refuses CLR10
 * without one) and legal hold place/release (admin-floor; a non-admin token refuses
 * honestly, rendered by the caller's DoorFeedback, never masked). `act` is the
 * caller's `useHydratedPart().act`.
 */
export function DocumentAdmin({
  document: doc, busy, act, onCorrect,
}: {
  document: DocumentRow;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  onCorrect: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  const [kind, setKind] = useState("");
  const [kindReason, setKindReason] = useState("");
  const [holdReason, setHoldReason] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <SectionHeader level={4}>{t("kindHeading")}</SectionHeader>
        <p className="text-sm text-muted-foreground">{t("kindCurrent", { kind: doc.document_kind ?? t("kindUnclassified") })}</p>
        <div className="flex flex-wrap gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v ?? "")}>
            <SelectTrigger aria-label={t("kindHeading")} size="sm">
              <SelectValue placeholder={t("kindPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            className="max-w-56"
            value={kindReason}
            onChange={(e) => setKindReason(e.target.value)}
            placeholder={t("reasonRequiredPlaceholder")}
            aria-label={t("kindReasonLabel")}
          />
          <Button
            size="sm"
            disabled={busy || !kind || !kindReason.trim()}
            onClick={() => void act(async () => {
              await setDocumentKind(doc.id, kind, kindReason.trim());
              setKind(""); setKindReason("");
            })}
          >
            {t("setKind")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <SectionHeader level={4}>{t("adminHeading")}</SectionHeader>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-56"
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            placeholder={t("reasonRequiredPlaceholder")}
            aria-label={t("holdReasonLabel")}
          />
          {doc.legal_hold ? (
            <Button size="sm" variant="outline" disabled={busy || !holdReason.trim()} onClick={() => void act(() => releaseLegalHold(doc.id, holdReason.trim()))}>
              {t("releaseLegalHold")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy || !holdReason.trim()} onClick={() => void act(() => placeLegalHold(doc.id, holdReason.trim()))}>
              {t("placeLegalHold")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onCorrect}>{t("correctWrongClient")}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("adminPrivilegedNote")}</p>
      </div>
    </div>
  );
}
