"use client";

// merge_counterparties's own dialog — the heaviest treatment in the wave
// (port-wave plan §5's note; Mobbin grounding T8). A NAMED, SEPARATE preview
// step (ManyChat's pattern, explicitly copied) sits between the picker and
// the destructive confirm — folk's one-click "Merge" with no stated
// consequence and no preview is the named anti-pattern this dialog exists
// to NOT be. THREE steps, never collapsed: (1) pick the other party + which
// side survives + why, (2) a FRESH DB read renders exactly what both sides
// carry, (3) only then does a destructive Merge control exist at all — and
// it performs exactly ONE governed call (lib/registers/counterparty-doors.ts's
// `mergeCounterparties`), never composed with any other door.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { businessToday } from "@/lib/business-date";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadCounterpartyMergePreview, type CounterpartyMergePreview, type CounterpartyKind, type CounterpartyRow } from "@/lib/registers/counterparty";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { LoadingState, StateBanner } from "@/components/common/state";
import { CounterpartyMergePreviewCard } from "./CounterpartyMergePreviewCard";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";

type Step = "pick" | "preview";
type PreviewState = { loading: boolean; data: CounterpartyMergePreview | null; error: unknown };

const IDLE_PREVIEW: PreviewState = { loading: false, data: null, error: null };

export function MergeCounterpartiesDialog({
  clientId,
  kind,
  counterparty,
  candidates,
  busy,
  onConfirm,
}: {
  clientId: string;
  kind: CounterpartyKind;
  /** The row this trigger renders on. */
  counterparty: CounterpartyRow;
  /** Other LIVE same-kind counterparties, excluding `counterparty` itself —
   *  the caller's own already-loaded roster, filtered for presentation
   *  (never a re-implemented legality check: the DB itself refuses a merge
   *  against a retired/cross-kind/cross-client target, verbatim). */
  candidates: CounterpartyRow[];
  busy: boolean;
  /** Performs exactly one governed merge and RESOLVES ITS OUTCOME: `true` only
   *  when the door accepted (CB-AE2E-004 — `useHydratedPart`'s `act()` returns
   *  exactly this). Anything else keeps this dialog open with the chosen pair and
   *  the typed reason intact. */
  onConfirm: (survivorId: string, mergedId: string, reason: string) => Promise<boolean>;
}) {
  const t = useTranslations("ArApCounterparty.merge");
  const tMergePreview = useTranslations("ArApCounterparty.mergePreview");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [otherId, setOtherId] = useState("");
  const [thisIsSurvivor, setThisIsSurvivor] = useState(true);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<PreviewState>(IDLE_PREVIEW);
  const guardRef = useState(() => createSingleFireGuard())[0];

  const survivorId = thisIsSurvivor ? counterparty.id : otherId;
  const mergedId = thisIsSurvivor ? otherId : counterparty.id;
  const otherName = candidates.find((c) => c.id === otherId)?.name ?? otherId;
  const survivorName = thisIsSurvivor ? counterparty.name : otherName;
  const mergedName = thisIsSurvivor ? otherName : counterparty.name;

  function resetAndClose() {
    setOpen(false);
    setStep("pick");
    setOtherId("");
    setThisIsSurvivor(true);
    setReason("");
    setPreview(IDLE_PREVIEW);
  }

  async function goToPreview() {
    if (!otherId) return;
    setStep("preview");
    setPreview({ loading: true, data: null, error: null });
    try {
      const data = await loadCounterpartyMergePreview(sessionTokenAccessor, clientId, kind, survivorId, mergedId, businessToday());
      setPreview({ loading: false, data, error: null });
    } catch (error) {
      setPreview({ loading: false, data: null, error });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAndClose();
        else setOpen(true);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="xs" />}>{t("trigger")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: counterparty.name })}</DialogTitle>
        </DialogHeader>

        {step === "pick" ? (
          <div className="flex flex-col gap-3">
            <StateBanner tone="warning">{t("consequence")}</StateBanner>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCandidates")}</p>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-merge-other">{t("otherLabel")}</Label>
                  <NativeSelect id="cp-merge-other" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                    <option value="">{t("otherPlaceholder")}</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-sm font-medium">{t("roleLabel")}</legend>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="cp-merge-role" checked={thisIsSurvivor} onChange={() => setThisIsSurvivor(true)} />
                    {t("roleThisSurvives", { name: counterparty.name })}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="cp-merge-role" checked={!thisIsSurvivor} onChange={() => setThisIsSurvivor(false)} />
                    {t("roleThisMerges", { name: counterparty.name })}
                  </label>
                </fieldset>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-merge-reason">{t("reasonLabel")}</Label>
                  <Textarea id="cp-merge-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required />
                </div>
              </>
            )}
            <DialogFooter>
              {/* House shape restored (F5 correction, independent review):
                  DialogClose, not a plain onClick — the Dialog's own
                  onOpenChange(false) above already runs resetAndClose(),
                  and #390's harness stubs make DialogClose genuinely
                  clickButton-testable now (see ArApCounterpartyDoorDialog.tsx). */}
              <DialogClose render={<Button variant="ghost" />}>{t("cancel")}</DialogClose>
              <Button disabled={!otherId || reason.trim().length === 0} onClick={() => void goToPreview()}>
                {t("previewButton")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {preview.loading ? <LoadingState>{t("previewLoading")}</LoadingState> : null}
            {!preview.loading && preview.error ? (
              <StateBanner tone="error">{preview.error instanceof Error ? preview.error.message : String(preview.error)}</StateBanner>
            ) : null}
            {!preview.loading && preview.data ? (
              <>
                <CounterpartyMergePreviewCard preview={preview.data} />
                {/* F2 (independent review, fix-required): the exact live effect
                    of merge_counterparties, on the PREVIEW step, right where the
                    destructive control lives — not the earlier pick step, which
                    a human has already moved past by the time the button matters. */}
                <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{tMergePreview("whatChangesHeading")}</p>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    <li>{tMergePreview("whatChanges1", { merged: mergedName, survivor: survivorName })}</li>
                    <li>{tMergePreview("whatChanges2", { merged: mergedName, survivor: survivorName })}</li>
                    <li>{tMergePreview("whatChanges3", { merged: mergedName, survivor: survivorName })}</li>
                    <li>{tMergePreview("whatChanges4", { merged: mergedName })}</li>
                    <li>{tMergePreview("whatChanges5")}</li>
                  </ul>
                </div>
              </>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("pick")}>
                {t("back")}
              </Button>
              <DialogClose render={<Button variant="ghost" />}>{t("cancel")}</DialogClose>
              <Button
                variant="destructive"
                disabled={busy || preview.loading || !preview.data}
                onClick={async () => {
                  // CB-AE2E-004 — close ONLY on an explicit success (see
                  // lib/parts/single-fire-guard.ts). `ran` meant "not dropped as
                  // re-entrant", never "the merge was accepted".
                  const outcome = await runOnce(guardRef, () => onConfirm(survivorId, mergedId, reason));
                  if (outcome.value === true) resetAndClose();
                }}
              >
                {busy ? t("working") : t("confirm")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
