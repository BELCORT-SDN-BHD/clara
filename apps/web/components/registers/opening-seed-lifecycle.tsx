"use client";

// The seed lifecycle header — mobbin grounding takeaway 4: the seed's own
// state is a `Badge` beside the page title, never a full-page banner (the
// dry-run's own quiet/`tone="warning"` StateBanner owns that visual weight —
// see opening-dryrun-strip.tsx's own N3 note on the "success" wording —
// two banners stacked on one page would blur which one the user must act
// on). Also the seed's entry-point dialog (takeaway 5: a small `Dialog`
// starts the lifecycle, not a wizard page) plus the cancel/reopen door
// dialogs.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { NativeSelect } from "@/components/common/native-select";
import { OpeningDoorDialog } from "./OpeningDoorDialog";
import type { DialogRefusal } from "@/components/common/dialog-refusal";
import { createOpeningSeed, cancelOpeningSeed, reopenOpeningSeed } from "@/lib/registers/opening-doors";
import { loadTieCandidates, shaShort, type TieCandidate } from "@/lib/registers/opening-source";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { businessToday } from "@/lib/business-date";
import type { OpeningSeedRow } from "@/lib/registers/opening-types";

const STATE_VARIANT: Record<string, "outline" | "default" | "secondary"> = {
  open: "secondary",
  finalized: "default",
  cancelled: "outline",
};

export function OpeningSeedBadge({ state }: { state: string }) {
  const t = useTranslations("OpeningCarryDown.seed");
  const labels: Record<string, string> = { open: t("states.open"), finalized: t("states.finalized"), cancelled: t("states.cancelled") };
  return <Badge variant={STATE_VARIANT[state] ?? "outline"}>{labels[state] ?? state}</Badge>;
}

export function CreateOpeningSeedDialog({
  clientId,
  planId,
  busy,
  refusal,
  act,
}: {
  clientId: string;
  planId: string | null;
  busy: boolean;
  refusal?: DialogRefusal;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown.seed");
  const [asOf, setAsOf] = useState(businessToday());
  // "" is the EXPLICIT SECOND CHOICE — "no document, I will key the balances" — never a silent
  // fallback. #656 AC2: a basis without a source is a decision a person makes on purpose, so it is
  // an option they select, and the option says what it means.
  const [tieDocumentId, setTieDocumentId] = useState("");
  const [candidates, setCandidates] = useState<TieCandidate[] | null>(null);
  const [candidatesFailed, setCandidatesFailed] = useState(false);

  // The picker's data is this client's ACTIVE VERIFIED filings of the two kinds the door admits.
  // A failure here must not disable the dialog: keying the balances is still a lawful way to start
  // a basis, so the list degrades to "we could not read your filed documents" and the keyed choice
  // stays reachable.
  useEffect(() => {
    let live = true;
    loadTieCandidates(clientId)
      .then((rows) => { if (live) setCandidates(rows); })
      .catch(() => { if (live) { setCandidates([]); setCandidatesFailed(true); } });
    return () => { live = false; };
  }, [clientId]);

  const picked = (candidates ?? []).find((c) => c.documentId === tieDocumentId) ?? null;

  return (
    <OpeningDoorDialog
      triggerLabel={t("createTrigger")}
      title={t("createTitle")}
      description={t("createDescription")}
      confirmLabel={t("createTrigger")}
      busy={busy}
      confirmDisabled={!planId || !asOf}
      refusal={refusal}
      onConfirm={() =>
        act(async () => {
          if (!planId) return;
          // The door's XOR guard is CLR10 unless BOTH travel or NEITHER does, so the pairing is
          // made here rather than left to two independent inputs that can disagree.
          await createOpeningSeed(sessionTokenAccessor, {
            client: clientId,
            plan: planId,
            asOf,
            tieDocumentId: picked ? picked.documentId : null,
            tieSha256: picked ? picked.sha256 : null,
          });
        })
      }
    >
      {/* ONE composition for the whole dialog (design lens F4): the as-of input moves into the
          same FieldGroup as the new picker, so this dialog does not carry a pre-Field Label/Input
          pair beside a Field one. The OTHER opening dialogs keep their existing composition — a
          whole-lane retrofit is #900's shape, not this ticket's. */}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="opening-seed-as-of">{t("asOfLabel")}</FieldLabel>
          <Input
            id="opening-seed-as-of"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            aria-invalid={asOf ? undefined : true}
          />
          <FieldDescription>{t("asOfHint")}</FieldDescription>
          {asOf ? null : <FieldError>{t("asOfRequired")}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="opening-seed-tie-document">{t("source.pickerLabel")}</FieldLabel>
          <NativeSelect
            id="opening-seed-tie-document"
            className="w-full"
            value={tieDocumentId}
            onChange={(e) => setTieDocumentId(e.target.value)}
          >
            <option value="">{t("source.keyedChoice")}</option>
            {(candidates ?? []).map((c) => (
              <option key={c.documentId} value={c.documentId}>
                {t("source.candidateOption", {
                  filename: c.filename,
                  filedAt: c.filedAt.slice(0, 10),
                  sha: shaShort(c.sha256),
                })}
              </option>
            ))}
          </NativeSelect>
          <FieldDescription>
            {picked
              ? t("source.pickedHint", { filename: picked.filename, sha: shaShort(picked.sha256) })
              : t("source.keyedHint")}
          </FieldDescription>
          {candidatesFailed ? <FieldError>{t("source.candidatesFailed")}</FieldError> : null}
          {candidates !== null && candidates.length === 0 && !candidatesFailed ? (
            <FieldDescription>{t("source.noCandidates")}</FieldDescription>
          ) : null}
        </Field>
      </FieldGroup>
    </OpeningDoorDialog>
  );
}

export function CancelOpeningSeedDialog({ seed, busy, refusal, act }: { seed: OpeningSeedRow; busy: boolean; refusal?: DialogRefusal; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("OpeningCarryDown.seed");
  const [reason, setReason] = useState("");

  return (
    <OpeningDoorDialog
      triggerLabel={t("cancelTrigger")}
      triggerVariant="destructive"
      title={t("cancelTitle")}
      description={t("cancelDescription")}
      confirmLabel={t("cancelTrigger")}
      busy={busy}
      confirmDisabled={!reason.trim()}
      refusal={refusal}
      onConfirm={() => act(async () => { await cancelOpeningSeed(sessionTokenAccessor, { seed: seed.id, reason: reason.trim() }); })}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="opening-seed-cancel-reason">{t("reasonLabel")}</Label>
        <Textarea id="opening-seed-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </OpeningDoorDialog>
  );
}

export function ReopenOpeningSeedDialog({ seed, busy, refusal, act }: { seed: OpeningSeedRow; busy: boolean; refusal?: DialogRefusal; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("OpeningCarryDown.seed");
  const [reason, setReason] = useState("");

  return (
    <OpeningDoorDialog
      triggerLabel={t("reopenTrigger")}
      title={t("reopenTitle")}
      description={t("reopenDescription")}
      confirmLabel={t("reopenTrigger")}
      busy={busy}
      confirmDisabled={!reason.trim()}
      refusal={refusal}
      onConfirm={() => act(async () => { await reopenOpeningSeed(sessionTokenAccessor, { seed: seed.id, reason: reason.trim() }); })}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="opening-seed-reopen-reason">{t("reasonLabel")}</Label>
        <Textarea id="opening-seed-reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </OpeningDoorDialog>
  );
}
