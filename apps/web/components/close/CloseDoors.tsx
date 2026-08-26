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

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CloseDoorDialog } from "./CloseDoorDialog";
import type { ClosePlan, ReopenCorrectionTarget } from "@/lib/close/types";

export function CloseDoors({
  plan,
  busy,
  onBegin,
  onFinalize,
  onAbandon,
  onReopen,
}: {
  plan: ClosePlan;
  busy: boolean;
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
          <FinalizeDialog busy={busy} onConfirm={onFinalize} />
          <AbandonDialog busy={busy} onConfirm={onAbandon} />
        </>
      ) : null}
      {canReopen ? <ReopenDialog busy={busy} onConfirm={onReopen} /> : null}
    </div>
  );
}

function FinalizeDialog({ busy, onConfirm }: { busy: boolean; onConfirm: (selfAttestation: string | null) => Promise<void> }) {
  const t = useTranslations("ClientClose.doors.finalize");
  const [attestation, setAttestation] = useState("");
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      onConfirm={() => onConfirm(attestation.trim() || null)}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="finalize-attestation">{t("attestationLabel")}</Label>
        <Input id="finalize-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} />
      </div>
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
      disabled={reason.trim().length === 0}
      onConfirm={() => onConfirm(reason)}
    >
      <Textarea aria-label={t("trigger")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </CloseDoorDialog>
  );
}

function ReopenDialog({
  busy,
  onConfirm,
}: {
  busy: boolean;
  onConfirm: (args: { reason: string; correctionTarget: ReopenCorrectionTarget; attestation?: string }) => Promise<void>;
}) {
  const t = useTranslations("ClientClose.doors.reopen");
  const [reason, setReason] = useState("");
  const [checkKey, setCheckKey] = useState("");
  const [attestation, setAttestation] = useState("");
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      disabled={reason.trim().length < 10 || checkKey.trim().length === 0}
      onConfirm={() =>
        onConfirm({
          reason,
          correctionTarget: { check_key: checkKey.trim() },
          attestation: attestation.trim() || undefined,
        })
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reopen-reason">{t("reasonLabel")}</Label>
          <Textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reopen-check-key">{t("checkKeyLabel")}</Label>
          <Input id="reopen-check-key" placeholder={t("checkKeyPlaceholder")} value={checkKey} onChange={(e) => setCheckKey(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reopen-attestation">{t("attestationLabel")}</Label>
          <Input id="reopen-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} />
        </div>
      </div>
    </CloseDoorDialog>
  );
}
