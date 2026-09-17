"use client";

// #646 — THE HUMAN FACT REVISION, AS A BOUNDED DECISION IN A DIALOG (AC1, AC2, AC6).
//
// WHAT DID NOT EXIST BEFORE. `DocumentFactsTable` was strictly read-only, and the only
// human-reachable fact verb in the estate re-ran the MACHINE (`clara.request_reextraction`) — so a
// professional who could see that the reader had taken RM1,050.00 for RM1,150.00 had nothing to
// press. `clara.revise_document_fact` (migration 0217) is the door; this is its face.
//
// FOUR THINGS ARE ON SCREEN BEFORE THE HUMAN COMMITS, and each is an acceptance criterion rather
// than decoration: the CURRENT value, the canonical FIELD PATH the revision will be written under,
// the SOURCE VERSION this decision is being made against, and a MANDATORY reason.
//
// THE STALE-VERSION FACE IS THE INTERESTING ONE. If someone else revised this document between the
// dialog opening and the confirm, the door refuses CLR19 `stale_source_version` and hands back both
// numbers plus the value that was attempted. This dialog then does what appendix C §3's
// lost-response row asks — "read the current receipt/state before allowing a distinct resubmit":
//
//   * the typed value STAYS IN THE FIELD (nothing is cleared on a refusal — the whole reason
//     `DocumentsDoorDialog` resolves `false` rather than closing);
//   * a comparison line states what was attempted, which version it was written against, and what
//     the document reads now;
//   * a separate, deliberate control moves the revision onto the current version. It is a SECOND
//     ACT by the human, never an automatic retry: silently re-submitting against whatever the
//     document now says is exactly how one person's correction overwrites another's.
//
// IT OWNS ITS OWN DOOR CALL rather than riding the panel's `act()`, for one concrete reason: the
// hook keeps a finished sentence and the CLR's discriminant, and this face needs the rest of the
// typed `detail` (`current_version`, `attempted_value`). `RefusalError.detail` carries it; `act()`
// does not expose it. The panel is still re-read on success through `onRevised`.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { reviseDocumentFact } from "@/lib/documents/doors";
import { readErrorKey } from "@/lib/documents/copy";
import { isDoorError, isDoorRefusal } from "@/lib/doors";
import { DocumentsDoorDialog } from "./DocumentsDoorDialog";
import { DoorFeedback } from "./door-feedback";
import type { PartClr } from "@/lib/parts/hooks";

/** The field paths a human may revise. It is `clara._revisable_invoice_field`'s closed set
 *  (migration 0217), re-stated here for ONE purpose only: deciding which rows get a control. The
 *  DB is still the arbiter — this list never suppresses a refusal and never admits a write. */
export const REVISABLE_FIELD_PATHS: readonly string[] = [
  "invoice.total", "invoice.amount_due", "invoice.currency",
  "invoice.vendor_name", "invoice.vendor_registration", "invoice.invoice_id",
  "invoice.invoice_date", "invoice.deposit",
  "invoice.customer_name", "invoice.customer_registration", "invoice.customer_taxid",
  "invoice.type_code", "invoice.total_excl_tax", "invoice.tax_total", "invoice.rounding",
  "invoice.service_charge", "invoice.discount", "invoice.delivery",
  "invoice.tax_breakdown", "invoice.myinvois_uuid", "invoice.myinvois_longid",
];

export function isRevisableFieldPath(path: string | null): path is string {
  return path !== null && REVISABLE_FIELD_PATHS.includes(path);
}

type StaleFace = { attempted: string; observed: number; current: number };

export function DocumentRevisionDialog({
  documentId, fieldPath, fieldLabel, currentValue, factsVersion, busy, onRevised,
}: {
  documentId: string;
  /** The canonical path the revision is written under — shown, never guessed at by the human. */
  fieldPath: string;
  /** The human label for that path, so the dialog's title reads as a sentence. */
  fieldLabel: string;
  /** What the document says today, rendered verbatim from the region. */
  currentValue: string;
  /** The facts version this dialog is being opened against (`list_source_revisions`'
   *  `facts_version`). `null` means the surface could not read it — the control is then disabled
   *  by the caller rather than guessing a number the door would refuse. */
  factsVersion: number;
  busy: boolean;
  onRevised: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  const [value, setValue] = useState(currentValue);
  const [reason, setReason] = useState("");
  const [observed, setObserved] = useState(factsVersion);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<PartClr>(null);
  const [stale, setStale] = useState<StaleFace | null>(null);
  const [working, setWorking] = useState(false);

  const confirm = async (): Promise<boolean> => {
    setWorking(true);
    setErr(null);
    setClr(null);
    try {
      await reviseDocumentFact(documentId, fieldPath, value.trim(), observed, reason.trim());
      setStale(null);
      setReason("");
      onRevised();
      return true;
    } catch (e) {
      if (isDoorRefusal(e)) {
        // VERBATIM — never re-worded, never retried automatically.
        setErr(e.message);
        setClr({ code: e.code, reason: e.reason });
        if (e.reason === "stale_source_version") {
          const detail = e.detail ?? {};
          const current = typeof detail.current_version === "number" ? detail.current_version : null;
          setStale({
            attempted: typeof detail.attempted_value === "string" ? detail.attempted_value : value.trim(),
            observed,
            current: current ?? observed,
          });
        }
      } else if (isDoorError(e)) {
        setErr(t(readErrorKey(e.kind)));
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
      return false;
    } finally {
      setWorking(false);
    }
  };

  return (
    <DocumentsDoorDialog
      triggerLabel={t("reviseFact")}
      triggerSize="xs"
      title={t("reviseDialogTitle", { field: fieldLabel })}
      description={t("reviseDialogDescription")}
      diagnostic={t("doorDiagnostic.reviseDocumentFact")}
      confirmLabel={t("reviseConfirm")}
      busy={busy || working}
      confirmDisabled={value.trim().length === 0 || reason.trim().length === 0}
      onConfirm={confirm}
    >
      <div className="flex flex-col gap-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("reviseFieldPathLabel")}</dt>
          <dd className="font-mono text-xs text-foreground" data-testid="revise-field-path">{fieldPath}</dd>
          <dt className="text-muted-foreground">{t("reviseCurrentValueLabel")}</dt>
          <dd className="text-foreground" data-testid="revise-current-value">{currentValue}</dd>
          <dt className="text-muted-foreground">{t("reviseObservedVersionLabel")}</dt>
          <dd className="text-foreground" data-testid="revise-observed-version">{observed}</dd>
        </dl>
        <Input
          aria-label={t("reviseValueLabel")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid="revise-value-input"
        />
        <Textarea
          aria-label={t("reviseReasonLabel")}
          placeholder={t("reasonRequiredPlaceholder")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          data-testid="revise-reason-input"
        />
        {/* THE REFUSAL, inside the dialog beside the input it is asking the human to change — a
            panel-level banner would be behind the modal backdrop. The Alert shell is this
            surface's own (door-feedback.tsx). */}
        <DoorFeedback err={err} clr={clr} />
        {stale ? (
          <DoorFeedback
            tone="warning"
            title={t("reviseStaleHeading")}
            err={t("reviseStaleBody", {
              attempted: stale.attempted, observed: stale.observed, current: stale.current,
            })}
            clr={null}
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="revise-use-current-version"
                onClick={() => { setObserved(stale.current); setStale(null); }}
              >
                {t("reviseUseCurrentVersion", { version: stale.current })}
              </Button>
            }
          />
        ) : null}
      </div>
    </DocumentsDoorDialog>
  );
}
