"use client";

// #654 (fix round 1) — CORRECT AND WITHDRAW A FIRM RULE, from the firm register.
//
// WHY THIS EXISTS AND WHY IT IS HERE. DECISIONS §2/#654 binds the entrance to
// "firm register, Promote dialog, Correct/Withdraw, and the firm-rule-vs-client-
// exception pair". The first cut shipped three of the four, and the missing one
// was not a convenience: `knowledgeRecordHref` requires a `clientId` and the only
// governed-record detail route is `/clients/[clientId]/knowledge/[recordId]`, so a
// FIRM-scope record — which has no client — had no detail page and therefore no
// route to `correct_knowledge` / `withdraw_knowledge` anywhere in the product.
// Once promoted, a firm rule could never be changed or retracted. This is that
// route, at the altitude the rule actually lives at.
//
// IT IS NOT A NEW DOOR. `clara.correct_knowledge` and `clara.withdraw_knowledge`
// already accept a firm record at the same floor `clara._knowledge_floor(key,
// 'firm')` puts on the promotion (#603 Q22, admin+ whatever the key says). This
// component is their caller, in the shape `knowledge-detail.tsx` already uses for
// the client half — `ArApCounterpartyDoorDialog` + `toDialogRefusal`, so the CLR
// refusal renders verbatim INSIDE the dialog with the typed values intact
// (CB-AE2E-004), never as a toast.
//
// BELOW THE FLOOR IT IS A SENTENCE, NEVER A BLANK (裁-187): a control that can
// only refuse is not offered, and an address a human reached deserves a reason.
//
// A CORRECTION IS A REVISION. The value field starts at the current value in the
// spelling the catalog types the key as, the reason is required by the door (CLR10
// `knowledge_reason_required`) and the confirm stays disabled until it is written,
// and applicability and the effective window travel unchanged — re-aiming a rule
// is a withdrawal plus a fresh promotion, not a silent edit.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StateBanner } from "@/components/common/state";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  correctKnowledge,
  withdrawKnowledge,
  type FirmKnowledgeRow,
} from "@/lib/registers/knowledge";
import { toDialogRefusal } from "@/components/common/dialog-refusal";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import { knowledgeValueDraft, parseKnowledgeValue } from "./knowledge-detail";
import { canPromoteToFirm } from "./knowledge-promote-dialog";

/** The register's own read handle, narrowed to what these two acts need: the
 *  governed write plus the re-read that always follows it, so the outcome lands
 *  on the persistent register rather than on this component's optimism. */
export type FirmKnowledgeActsRead = {
  busy: boolean;
  error: unknown;
  act: (fn: () => Promise<void>) => Promise<boolean>;
};

export function FirmKnowledgeActs({
  row,
  rank,
  scopeResolved,
  read,
}: {
  row: FirmKnowledgeRow;
  /** `caller_context.role_rank`, or null when the register could not read it. */
  rank: number | null;
  /** False while the caller-context read has answered nothing at all: a control
   *  offered against an unknown rank would be a guess, and one withheld against an
   *  unknown rank would be a denial the server never made. */
  scopeResolved: boolean;
  read: FirmKnowledgeActsRead;
}) {
  const t = useTranslations("FirmKnowledge.acts");
  const shape = row.value_shape ?? "string";
  const [draft, setDraft] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const value = draft ?? knowledgeValueDraft(shape, row.value);

  async function runCorrection(): Promise<boolean> {
    const parsed = parseKnowledgeValue(shape, value);
    if (!parsed.ok) {
      // The field error sits BY the control and the typed text survives — the door
      // is never called with something it would only refuse.
      setFieldError(t(`valueError.${parsed.reason}` as "valueError.json"));
      return false;
    }
    setFieldError(null);
    const ok = await read.act(async () => {
      await correctKnowledge(
        { recordId: row.record_id, value: parsed.value, reason },
        { session: sessionTokenAccessor },
      );
    });
    if (ok) { setDraft(null); setReason(""); }
    return ok;
  }

  async function runWithdrawal(): Promise<boolean> {
    const ok = await read.act(async () => {
      await withdrawKnowledge(
        { recordId: row.record_id, reason: withdrawReason },
        { session: sessionTokenAccessor },
      );
    });
    if (ok) setWithdrawReason("");
    return ok;
  }

  // THE CONTROLS FOLLOW THE DATABASE'S OWN ANSWER. `correctable` is derived
  // server-side (state = 'live'), so a withdrawn rule — which the register still
  // shows, because a withdrawal is visible as a withdrawal rather than as an
  // absence — offers neither act.
  if (row.correctable === false) return null;
  if (!scopeResolved) return null;
  if (rank !== null && !canPromoteToFirm(rank)) {
    return (
      <StateBanner tone="neutral" title={t("deniedTitle")} className="text-xs">
        {t("deniedBody")}
      </StateBanner>
    );
  }
  if (rank === null) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <ArApCounterpartyDoorDialog
        triggerLabel={t("correctTrigger")}
        title={t("correctTitle", { key: row.knowledge_key })}
        description={t("correctDescription")}
        confirmLabel={t("correctConfirm")}
        busy={read.busy}
        confirmDisabled={reason.trim() === ""}
        // The register's banner sits BEHIND the modal backdrop, so the refusal the
        // human must read has to travel into the dialog with them (CB-AE2E-004).
        refusal={toDialogRefusal(read.error)}
        onConfirm={runCorrection}
      >
        <div className="flex flex-col gap-2">
          <StateBanner tone="info" className="text-xs">
            {t("exceptionsNote")}
          </StateBanner>
          <label className="flex flex-col gap-1 text-xs" htmlFor={`firm-knowledge-correct-value-${row.record_id}`}>
            {t("correctValueLabel")}
            {shape === "object" ? (
              <Textarea
                id={`firm-knowledge-correct-value-${row.record_id}`}
                aria-label={t("correctValueLabel")}
                aria-invalid={fieldError !== null}
                value={value}
                onChange={(e) => { setDraft(e.target.value); setFieldError(null); }}
              />
            ) : (
              <Input
                id={`firm-knowledge-correct-value-${row.record_id}`}
                aria-label={t("correctValueLabel")}
                aria-invalid={fieldError !== null}
                value={value}
                onChange={(e) => { setDraft(e.target.value); setFieldError(null); }}
              />
            )}
          </label>
          {fieldError ? <p className="text-xs text-error">{fieldError}</p> : null}
          <label className="flex flex-col gap-1 text-xs" htmlFor={`firm-knowledge-correct-reason-${row.record_id}`}>
            {t("correctReasonLabel")}
            <Textarea
              id={`firm-knowledge-correct-reason-${row.record_id}`}
              aria-label={t("correctReasonLabel")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {reason.trim() === "" ? (
            <p className="text-xs text-muted-foreground">{t("reasonRequired")}</p>
          ) : null}
        </div>
      </ArApCounterpartyDoorDialog>

      <ArApCounterpartyDoorDialog
        triggerLabel={t("withdrawTrigger")}
        triggerVariant="destructive"
        title={t("withdrawTitle", { key: row.knowledge_key })}
        description={t("withdrawDescription")}
        confirmLabel={t("withdrawConfirm")}
        confirmVariant="destructive"
        busy={read.busy}
        confirmDisabled={withdrawReason.trim() === ""}
        refusal={toDialogRefusal(read.error)}
        onConfirm={runWithdrawal}
      >
        <div className="flex flex-col gap-2">
          {/* WHAT WITHDRAWAL DOES TO THE CLIENTS THIS RULE REACHED, measured from
              the register's own numbers rather than reassuring in the abstract. */}
          <StateBanner tone="info" className="text-xs">
            <span className="flex flex-col gap-1">
              <span>{t("withdrawEffect")}</span>
              {row.exception_count > 0 ? (
                <span>{t("withdrawExceptions", { count: row.exception_count })}</span>
              ) : null}
            </span>
          </StateBanner>
          <label className="flex flex-col gap-1 text-xs" htmlFor={`firm-knowledge-withdraw-reason-${row.record_id}`}>
            {t("withdrawReasonLabel")}
            <Textarea
              id={`firm-knowledge-withdraw-reason-${row.record_id}`}
              aria-label={t("withdrawReasonLabel")}
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
            />
          </label>
          {withdrawReason.trim() === "" ? (
            <p className="text-xs text-muted-foreground">{t("reasonRequired")}</p>
          ) : null}
        </div>
      </ArApCounterpartyDoorDialog>
    </div>
  );
}
