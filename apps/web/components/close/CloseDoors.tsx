"use client";

// The close door set, exactly as the DB names them (mission scope): begin /
// finalize / abandon / reopen. Each is a law-71-adjacent human act — one
// CloseDoorDialog confirm click, one governed call, via the plan's OWN
// `act()` (so every door shares the same hydrate-never-trust reload + sticky-
// refusal banner as the rest of the panel — see ClosePlanPanel).
//
// Visibility follows the plan's own state, never a client-side guess at the
// capability wall: begin when there is no close run yet on an open/reopened
// year; finalize/abandon when a run is in_progress; reopen when the year is
// closed. A capability refusal (CLR04) can still surface from any of these —
// visibility is a convenience, not a security boundary; the DB is.
//
// M7 (independent review ruling, stands from the original build): the
// self-attestation / attestation fields on Finalize and Reopen render ONLY
// once a refusal has actually NAMED them (finalize's CLR41
// close_self_attestation_required; reopen's CLR05 attestation_required /
// self_attestation) — never unconditionally pre-offered. `refusal` is the
// panel's own standing `clr`, passed straight through.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CloseDoorDialog } from "./CloseDoorDialog";
import type { ClosePlan, ReopenCorrectionTarget } from "@/lib/close/types";
import type { PartClr } from "@/lib/parts/hooks";

// The three M7/F3 decision functions, EXPORTED and pure: Base UI's Dialog
// Popup does not mount into the tree while `open=false` (measured — a
// renderToStaticMarkup pass over a closed CloseDoorDialog never sees its
// children at all), so a dialog's INNER gating logic must be independently
// testable without rendering the dialog itself. Each is the exact predicate
// the component below evaluates — extracted, not duplicated.

/** 0128:263-264's own refusal reason, verbatim — the ONE case finalize_close
 *  asks a human for a self-attestation. */
export function finalizeNeedsAttestation(refusal: PartClr): boolean {
  return refusal?.code === "CLR41" && refusal.reason === "close_self_attestation_required";
}

/** The four CLR05 arms (0120:750-761) — attestation_required / self_attestation
 *  are the two that ask a human to SUPPLY one; no_eligible_human /
 *  distinct_checker name a DIFFERENT human, which no text field here fixes. */
export function reopenNeedsAttestation(refusal: PartClr): boolean {
  return refusal?.code === "CLR05" && (refusal.reason === "attestation_required" || refusal.reason === "self_attestation");
}

export type TargetKind = "check_key" | "entry_ids" | "document_id";

/** F3 (independent review, MED-HIGH): 0120:868 persists `p_correction_target`
 *  VERBATIM into the immutable reopen receipt — the DB parses THREE shapes
 *  (0120:664-702: entry_ids array / document_id / check_key), and forcing a
 *  gate key when the true correction was an entry records a FALSE fact in a
 *  receipt an inspection later reads. Returns null when the selected
 *  variant's own input is empty — the confirm button stays disabled, never a
 *  half-built target sent. */
export function deriveCorrectionTarget(
  targetKind: TargetKind,
  fields: { checkKey: string; entryIds: string; documentId: string },
): ReopenCorrectionTarget | null {
  if (targetKind === "check_key") {
    const v = fields.checkKey.trim();
    return v ? { check_key: v } : null;
  }
  if (targetKind === "document_id") {
    const v = fields.documentId.trim();
    return v ? { document_id: v } : null;
  }
  const ids = fields.entryIds.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return ids.length > 0 ? { entry_ids: ids } : null;
}

export function CloseDoors({
  plan,
  busy,
  refusal,
  onBegin,
  onFinalize,
  onAbandon,
  onReopen,
}: {
  plan: ClosePlan;
  busy: boolean;
  /** The panel's own standing refusal (or null) — read, never re-derived. */
  refusal: PartClr;
  onBegin: () => Promise<void>;
  onFinalize: (selfAttestation: string | null) => Promise<void>;
  onAbandon: (reason: string) => Promise<void>;
  onReopen: (args: { reason: string; correctionTarget: ReopenCorrectionTarget; attestation?: string }) => Promise<void>;
}) {
  const t = useTranslations("ClientClose.doors");
  const { fiscal_year, close_run } = plan;
  const canBegin = close_run.state === "absent" && (fiscal_year.status === "open" || fiscal_year.status === "reopened");
  const canFinalizeOrAbandon = close_run.state === "present" && close_run.run_state === "in_progress";
  const canReopen = fiscal_year.status === "closed";

  return (
    <div className="flex flex-wrap gap-2">
      {canBegin ? (
        <CloseDoorDialog
          triggerLabel={t("begin.trigger")}
          title={t("begin.title", { label: fiscal_year.label })}
          description={t("begin.description")}
          confirmLabel={t("begin.confirm")}
          busy={busy}
          onConfirm={onBegin}
        />
      ) : null}
      {canFinalizeOrAbandon ? (
        <>
          <FinalizeDialog busy={busy} refusal={refusal} onConfirm={onFinalize} />
          <AbandonDialog busy={busy} onConfirm={onAbandon} />
        </>
      ) : null}
      {canReopen ? <ReopenDialog busy={busy} refusal={refusal} onConfirm={onReopen} /> : null}
    </div>
  );
}

function FinalizeDialog({
  busy,
  refusal,
  onConfirm,
}: {
  busy: boolean;
  refusal: PartClr;
  onConfirm: (selfAttestation: string | null) => Promise<void>;
}) {
  const t = useTranslations("ClientClose.doors.finalize");
  const [attestation, setAttestation] = useState("");
  const needsAttestation = finalizeNeedsAttestation(refusal);
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      onConfirm={() => onConfirm(attestation.trim() || null)}
    >
      {needsAttestation ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="finalize-attestation">{t("attestationLabel")}</Label>
          <Input id="finalize-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} />
        </div>
      ) : null}
    </CloseDoorDialog>
  );
}

function AbandonDialog({ busy, onConfirm }: { busy: boolean; onConfirm: (reason: string) => Promise<void> }) {
  const t = useTranslations("ClientClose.doors.abandon");
  const [reason, setReason] = useState("");
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => onConfirm(reason)}
    >
      <Textarea aria-label={t("trigger")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </CloseDoorDialog>
  );
}

/** F3 (independent review, MED-HIGH): the reopen dialog offers all three
 *  correction-target variants the DB parses (0120:664-702) — see
 *  `deriveCorrectionTarget`'s own header above for why forcing a single
 *  variant is the bug this fixes. */
function ReopenDialog({
  busy,
  refusal,
  onConfirm,
}: {
  busy: boolean;
  refusal: PartClr;
  onConfirm: (args: { reason: string; correctionTarget: ReopenCorrectionTarget; attestation?: string }) => Promise<void>;
}) {
  const t = useTranslations("ClientClose.doors.reopen");
  const [reason, setReason] = useState("");
  const [targetKind, setTargetKind] = useState<TargetKind>("check_key");
  const [checkKey, setCheckKey] = useState("");
  const [entryIds, setEntryIds] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [attestation, setAttestation] = useState("");
  const needsAttestation = reopenNeedsAttestation(refusal);
  const correctionTarget = deriveCorrectionTarget(targetKind, { checkKey, entryIds, documentId });

  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={reason.trim().length < 10 || correctionTarget === null}
      onConfirm={() =>
        correctionTarget
          ? onConfirm({ reason, correctionTarget, attestation: attestation.trim() || undefined })
          : Promise.resolve()
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reopen-reason">{t("reasonLabel")}</Label>
          <Textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("targetKindLabel")}</Label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("targetKindLabel")}>
            {(["check_key", "entry_ids", "document_id"] as const).map((kind) => (
              <Button
                key={kind}
                type="button"
                role="radio"
                aria-checked={targetKind === kind}
                variant={targetKind === kind ? "default" : "outline"}
                size="xs"
                onClick={() => setTargetKind(kind)}
              >
                {t(`targetKind.${kind}`)}
              </Button>
            ))}
          </div>
        </div>
        {targetKind === "check_key" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reopen-check-key">{t("checkKeyLabel")}</Label>
            <Input id="reopen-check-key" placeholder={t("checkKeyPlaceholder")} value={checkKey} onChange={(e) => setCheckKey(e.target.value)} />
          </div>
        ) : targetKind === "entry_ids" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reopen-entry-ids">{t("entryIdsLabel")}</Label>
            <Input id="reopen-entry-ids" placeholder={t("entryIdsPlaceholder")} value={entryIds} onChange={(e) => setEntryIds(e.target.value)} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reopen-document-id">{t("documentIdLabel")}</Label>
            <Input id="reopen-document-id" placeholder={t("documentIdPlaceholder")} value={documentId} onChange={(e) => setDocumentId(e.target.value)} />
          </div>
        )}
        {needsAttestation ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reopen-attestation">{t("attestationLabel")}</Label>
            <Input id="reopen-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} />
          </div>
        ) : null}
      </div>
    </CloseDoorDialog>
  );
}
