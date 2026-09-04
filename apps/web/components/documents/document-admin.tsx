"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  classifyConsentEvidenceDocument, placeLegalHold, releaseLegalHold,
  requestReextraction, setDocumentKind,
} from "@/lib/documents/doors";
import { DocumentsDoorDialog } from "./DocumentsDoorDialog";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { DOCUMENT_KINDS, type DocumentRow, type RequestReextractionResult } from "@/lib/documents/types";

/** A CHECKED lookup from the DB's `admission` string to its own translation
 *  key — never a `t(\`reextraction.admission.${x}\` as ...)` cast (the exact
 *  "hides it from tsc" shape FIX-1, components/firm/needs-you-row.tsx's own
 *  header, was independently caught and banned for). An admission value
 *  outside the four named doors (types.ts's own header enumerates them)
 *  renders the raw DB string honestly rather than a translated label it
 *  cannot prove is right — the same "closed world with an honest fallback"
 *  idiom lib/documents/copy.ts's filingBasisKey uses. */
function reextractionAdmissionLabel(admission: string, t: (key: string) => string): string {
  switch (admission) {
    case "reextraction": return t("reextraction.admission.reextraction");
    case "receipt_backfill": return t("reextraction.admission.receipt_backfill");
    case "filed_bootstrap": return t("reextraction.admission.filed_bootstrap");
    case "failed_retry": return t("reextraction.admission.failed_retry");
    default: return admission;
  }
}

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
  act: (fn: () => Promise<void>) => Promise<boolean>;
  onCorrect: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  const tg = useTranslations("DraftsDocumentGovernance");
  const [kind, setKind] = useState("");
  const [kindReason, setKindReason] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [reextractReason, setReextractReason] = useState("");
  const [reextractOutcome, setReextractOutcome] = useState<RequestReextractionResult | null>(null);
  const [consentReason, setConsentReason] = useState("");
  // A discriminated wrapper, not a bare `string | null` — `prior_kind` is
  // ITSELF legitimately `null` (an unclassified document has no prior
  // kind), so `consentOutcome !== null` (an attempt completed) must stay
  // distinguishable from `priorKind !== null` (the DB had a NAMED prior
  // kind) — the same F2 (independent review) reasoning applied here
  // preventatively before it became a live bug.
  const [consentOutcome, setConsentOutcome] = useState<{ priorKind: string | null } | null>(null);

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

      <div className="flex flex-col gap-1">
        <SectionHeader level={4}>{tg("reextraction.trigger")}</SectionHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DocumentsDoorDialog
            triggerLabel={tg("reextraction.trigger")}
            title={tg("reextraction.title")}
            description={tg("reextraction.description")}
            confirmLabel={tg("reextraction.confirm")}
            busy={busy}
            confirmDisabled={!reextractReason.trim()}
            onConfirm={() => {
              // F3 (independent review, minor): clear the PRIOR attempt's
              // banner at the START of a new one — otherwise a refusal on
              // attempt 2 leaves attempt 1's stale success banner standing,
              // which reads as "it worked" when it did not.
              setReextractOutcome(null);
              return act(async () => {
                const out = await requestReextraction(doc.id, reextractReason.trim());
                setReextractOutcome(out);
                setReextractReason("");
              });
            }}
          >
            <Textarea
              aria-label={tg("reextraction.reasonLabel")}
              placeholder={tg("reextraction.reasonPlaceholder")}
              value={reextractReason}
              onChange={(e) => setReextractReason(e.target.value)}
            />
          </DocumentsDoorDialog>
        </div>
        {reextractOutcome && (
          <StateBanner tone="info" title={tg("reextraction.outcomeHeading")}>
            {reextractionAdmissionLabel(reextractOutcome.admission, tg)}
            {reextractOutcome.status === "queued" && ` — ${tg("reextraction.outcomeStatusQueued", { version: reextractOutcome.version_n ?? 0 })}`}
            {reextractOutcome.status === "failed" && ` — ${tg("reextraction.outcomeStatusFailed")}`}
            {reextractOutcome.reused && ` — ${tg("reextraction.outcomeReused")}`}
          </StateBanner>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <SectionHeader level={4}>{tg("consentEvidence.trigger")}</SectionHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DocumentsDoorDialog
            triggerLabel={tg("consentEvidence.trigger")}
            title={tg("consentEvidence.title")}
            description={tg("consentEvidence.description")}
            confirmLabel={tg("consentEvidence.confirm")}
            busy={busy}
            confirmDisabled={!consentReason.trim()}
            onConfirm={() => {
              // F3 (independent review, minor): same reasoning as the
              // re-extraction door above — clear before, not after.
              setConsentOutcome(null);
              return act(async () => {
                const out = await classifyConsentEvidenceDocument(doc.id, consentReason.trim());
                setConsentOutcome({ priorKind: out.prior_kind });
                setConsentReason("");
              });
            }}
          >
            <Textarea
              aria-label={tg("consentEvidence.reasonLabel")}
              placeholder={tg("consentEvidence.reasonPlaceholder")}
              value={consentReason}
              onChange={(e) => setConsentReason(e.target.value)}
            />
          </DocumentsDoorDialog>
        </div>
        {consentOutcome && (
          <StateBanner tone="info">
            {tg("consentEvidence.priorKindNote", { priorKind: consentOutcome.priorKind ?? tg("consentEvidence.priorKindNone") })}
          </StateBanner>
        )}
      </div>
    </div>
  );
}
