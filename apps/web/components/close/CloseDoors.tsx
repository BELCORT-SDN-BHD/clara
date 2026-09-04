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
import { StateBanner } from "@/components/common/state";
import { CloseDoorDialog } from "./CloseDoorDialog";
import type { ClosePlan, ClosePlanCheck, ReopenCorrectionTarget } from "@/lib/close/types";
import type { PartClr } from "@/lib/parts/hooks";
import type { DialogRefusal } from "@/components/common/dialog-refusal";

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

/** H-11 — `_begin_close_core`'s OWN precondition, mirrored rather than invented:
 *  the core refuses only when `v_fy.status not in ('open','reopened')`
 *  (0120:1111-1115) and never looks at prior runs at all, so a year whose latest
 *  run was ABANDONED (0120:1186-1189 sets the run 'abandoned' AND the year back to
 *  'open') or FINALIZED-then-REOPENED (0120:843 sets 'reopened') may lawfully
 *  begin again. The previous predicate tested `close_run.state === "absent"`,
 *  which get_close_plan never reports for such a year — it selects the LATEST run
 *  in ANY state (0064:182-184) — so all three branches rendered null and the year
 *  was stranded with no door at all.
 *
 *  The fiscal-year conjunct is what keeps this honest: a 'closing' year (a run
 *  already in progress) still hides Begin, exactly as the DB would refuse it. */
export function canBeginClose(plan: ClosePlan): boolean {
  const { fiscal_year, close_run } = plan;
  const yearAcceptsABegin = fiscal_year.status === "open" || fiscal_year.status === "reopened";
  const noRunStandsInTheWay =
    close_run.state === "absent" || close_run.run_state === "abandoned" || close_run.run_state === "finalized";
  return yearAcceptsABegin && noRunStandsInTheWay;
}

/** CB-AE2E-016 — the same act, told truthfully: a year that already carried a
 *  close run and had it abandoned is not virgin, and "Begin close" tells the human
 *  it is. Only the ABANDONED case is a restart; a finalized-then-reopened year is
 *  beginning a NEW close of a corrected year, which "Begin close" names correctly. */
export function isRestartOfAbandonedClose(plan: ClosePlan): boolean {
  return plan.close_run.state === "present" && plan.close_run.run_state === "abandoned";
}

export type FinalizePreflight = {
  /** Drawer-1 checks whose measured state is unknown/error — finalize_close's own
   *  CLR41 `drawer1_state_unknown` arm (0128:194-198). */
  drawer1Unknown: string[];
  /** Drawer-2 checks in fail/unknown/error carrying at least one item with no LIVE
   *  attestation — finalize_close's CLR41 `drawer2_unattested` arm (0128:199-232). */
  drawer2Unattested: string[];
  /** Checks the plan has never measured at all. */
  notYetMeasured: string[];
};

/** CB-AE2E-016 / H-54 — a PRE-FLIGHT READING, not a second wall. Every value here
 *  is a count of rows the DB already returned in `get_close_plan.checks[]`; nothing
 *  is re-derived, no gate is re-evaluated, and Finalize is NEVER disabled by it
 *  (裁-187, 2026-09-04: the gates are a reading and finalize is a one-click admin+
 *  act; CloseDoors' own "gating shapes, never hides" law says the DB is the
 *  boundary). It exists because ClosePlanPanel renders these doors ABOVE the gate
 *  list, so today the human learns what finalize will refuse only BY being refused.
 *
 *  Titles, not check_keys: the DB returns both and the title is the readable one
 *  (the owner's call, recorded with the item). */
export function finalizePreflight(checks: ClosePlanCheck[]): FinalizePreflight {
  const drawer1Unknown: string[] = [];
  const drawer2Unattested: string[] = [];
  const notYetMeasured: string[] = [];
  for (const check of checks) {
    if (check.result.state === "not_yet_measured") {
      notYetMeasured.push(check.title);
      continue;
    }
    if (check.drawer === 1 && (check.result.state === "unknown" || check.result.state === "error")) {
      drawer1Unknown.push(check.title);
      continue;
    }
    if (
      check.drawer === 2 &&
      (check.result.state === "fail" || check.result.state === "unknown" || check.result.state === "error") &&
      check.items.some((item) => item.attestation.state !== "live")
    ) {
      drawer2Unattested.push(check.title);
    }
  }
  return { drawer1Unknown, drawer2Unattested, notYetMeasured };
}

export function preflightIsClear(pre: FinalizePreflight): boolean {
  return pre.drawer1Unknown.length === 0 && pre.drawer2Unattested.length === 0 && pre.notYetMeasured.length === 0;
}

export function CloseDoors({
  plan,
  busy,
  refusal,
  refusalMessage,
  onBegin,
  onFinalize,
  onAbandon,
  onReopen,
}: {
  plan: ClosePlan;
  busy: boolean;
  /** The panel's own standing refusal (or null) — read, never re-derived. */
  refusal: PartClr;
  /** The panel's own standing failure MESSAGE (its `err`). CB-AE2E-004: a refused
   *  door now keeps its dialog open, and the panel's page-level banner is behind
   *  the modal backdrop — so the same verbatim text travels into the dialog. */
  refusalMessage: string | null;
  /** Each door RESOLVES ITS OUTCOME — `true` only when the DB accepted. The
   *  panel's own `act()` already returns exactly this, and CloseDoorDialog closes
   *  on `true` alone, so a refusal keeps the dialog and the human's typed reason
   *  or attestation standing (CB-AE2E-004). */
  onBegin: () => Promise<boolean>;
  onFinalize: (selfAttestation: string | null) => Promise<boolean>;
  onAbandon: (reason: string) => Promise<boolean>;
  onReopen: (args: { reason: string; correctionTarget: ReopenCorrectionTarget; attestation?: string }) => Promise<boolean>;
}) {
  const t = useTranslations("ClientClose.doors");
  const { fiscal_year, close_run } = plan;
  const canBegin = canBeginClose(plan);
  const restarting = isRestartOfAbandonedClose(plan);
  const canFinalizeOrAbandon = close_run.state === "present" && close_run.run_state === "in_progress";
  const canReopen = fiscal_year.status === "closed";
  const dialogRefusal: DialogRefusal = { err: refusalMessage, clr: refusal };

  return (
    <div className="flex flex-col gap-2">
      {canFinalizeOrAbandon ? <FinalizePreflightBanner checks={plan.checks} /> : null}
      <div className="flex flex-wrap gap-2">
        {canBegin ? (
          <CloseDoorDialog
            triggerLabel={restarting ? t("begin.restartTrigger") : t("begin.trigger")}
            title={
              restarting
                ? t("begin.restartTitle", { label: fiscal_year.label })
                : t("begin.title", { label: fiscal_year.label })
            }
            description={restarting ? t("begin.restartDescription") : t("begin.description")}
            confirmLabel={restarting ? t("begin.restartConfirm") : t("begin.confirm")}
            busy={busy}
            refusal={dialogRefusal}
            onConfirm={onBegin}
          />
        ) : null}
        {canFinalizeOrAbandon ? (
          <>
            <FinalizeDialog busy={busy} refusal={refusal} dialogRefusal={dialogRefusal} onConfirm={onFinalize} />
            <AbandonDialog busy={busy} dialogRefusal={dialogRefusal} onConfirm={onAbandon} />
          </>
        ) : null}
        {canReopen ? (
          <ReopenDialog busy={busy} refusal={refusal} dialogRefusal={dialogRefusal} onConfirm={onReopen} />
        ) : null}
      </div>
    </div>
  );
}

/** CB-AE2E-016 / H-54 — what finalize_close is about to find, ABOVE the trigger
 *  that will find it. It never disables Finalize (裁-187) and it names the DB's own
 *  two refusal reasons so the sentence the human reads here and the sentence the
 *  DB raises are the same sentence. */
function FinalizePreflightBanner({ checks }: { checks: ClosePlanCheck[] }) {
  const t = useTranslations("ClientClose.doors.finalize.preflight");
  const pre = finalizePreflight(checks);
  if (preflightIsClear(pre)) {
    return (
      <StateBanner tone="neutral" title={t("clearTitle")}>
        {t("clearBody")}
      </StateBanner>
    );
  }
  return (
    <StateBanner tone="warning" title={t("blockedTitle")}>
      <ul className="flex list-disc flex-col gap-1 pl-4">
        {pre.notYetMeasured.length > 0 ? (
          <li>{t("notYetMeasured", { count: pre.notYetMeasured.length, titles: pre.notYetMeasured.join(", ") })}</li>
        ) : null}
        {pre.drawer1Unknown.length > 0 ? (
          <li>{t("drawer1Unknown", { count: pre.drawer1Unknown.length, titles: pre.drawer1Unknown.join(", ") })}</li>
        ) : null}
        {pre.drawer2Unattested.length > 0 ? (
          <li>{t("drawer2Unattested", { count: pre.drawer2Unattested.length, titles: pre.drawer2Unattested.join(", ") })}</li>
        ) : null}
      </ul>
    </StateBanner>
  );
}

function FinalizeDialog({
  busy,
  refusal,
  dialogRefusal,
  onConfirm,
}: {
  busy: boolean;
  refusal: PartClr;
  dialogRefusal: DialogRefusal;
  onConfirm: (selfAttestation: string | null) => Promise<boolean>;
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
      refusal={dialogRefusal}
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

function AbandonDialog({ busy, dialogRefusal, onConfirm }: { busy: boolean; dialogRefusal: DialogRefusal; onConfirm: (reason: string) => Promise<boolean> }) {
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
      refusal={dialogRefusal}
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
  dialogRefusal,
  onConfirm,
}: {
  busy: boolean;
  refusal: PartClr;
  dialogRefusal: DialogRefusal;
  onConfirm: (args: { reason: string; correctionTarget: ReopenCorrectionTarget; attestation?: string }) => Promise<boolean>;
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
      refusal={dialogRefusal}
      onConfirm={() =>
        correctionTarget
          ? onConfirm({ reason, correctionTarget, attestation: attestation.trim() || undefined })
          : Promise.resolve(false)
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
