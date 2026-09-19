"use client";

// #646 — THE DOCUMENT-KIND CHANGE, AS A BOUNDED DECISION IN A DIALOG.
//
// WHAT IT REPLACES. `document-admin.tsx` carried the kind change as an inline Select + reason
// Input + Button bar sitting in a column of other controls. Three things were wrong with that and
// only the first is cosmetic:
//
//   * a governed act with a MANDATORY reason and an irreversible-feeling effect had no moment of
//     commitment and no title — appendix C's Dialog row: "a focused, bounded form or decision that
//     can complete without losing page context";
//   * a refusal (CLR28 consent evidence, CLR10 live bank statement, CLR02 an orphaned
//     classification question) landed in a panel-level banner far from the control, and the typed
//     reason was gone by the time the human read it;
//   * the reason input was a single-line `Input` beside a Select, which is not where a professional
//     writes the sentence that becomes the resolution text of an open question.
//
// IT IS ITS OWN FILE ON PURPOSE. #633 mounts this same control in the firm intake list and receipt
// rows (a declared boundary crossing, wave DECISIONS §2 #633). Exporting the component is what lets
// that ticket IMPORT it rather than copy a second kind-change form with its own idea of what the
// reason field is for.
//
// DRAFTS SURVIVE A TAB SWITCH because this component's state lives in the component, and
// `document-detail.tsx` renders it OUTSIDE the switched panels — the Facts and Accounting views
// mount and unmount, this control does not. Appendix C §3's draft row: "Tabs and an explanatory
// Popover do not submit or discard it."

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setDocumentKind } from "@/lib/documents/doors";
import { DocumentsDoorDialog } from "./DocumentsDoorDialog";
import type { DialogRefusal } from "@/components/common/dialog-refusal";
import { DOCUMENT_KINDS } from "@/lib/documents/types";
import { renderKindLabel } from "@/lib/documents/kind-label";

export function DocumentKindDialog({
  documentId, currentKind, busy, act, refusal, onChanged,
}: {
  documentId: string;
  /** The kind as the document carries it TODAY — shown inside the dialog so the decision is made
   *  against a stated current value rather than against memory. `null` is a real state (the
   *  classifier was not confident and asked a human instead), not a missing one. */
  currentKind: string | null;
  busy: boolean;
  /** `useHydratedPart().act` — resolves `true` only when the door accepted, which is exactly the
   *  contract `DocumentsDoorDialog` needs to decide whether to close. */
  act: (fn: () => Promise<void>) => Promise<boolean>;
  /** The caller's standing refusal, so a CLR lands INSIDE the dialog beside the input it is asking
   *  the human to change, rather than behind the modal backdrop. */
  refusal?: DialogRefusal;
  onChanged?: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");

  return (
    <DocumentsDoorDialog
      triggerLabel={t("setKind")}
      title={t("kindDialogTitle")}
      description={t("kindDialogDescription")}
      diagnostic={t("doorDiagnostic.setDocumentKind")}
      confirmLabel={t("setKind")}
      busy={busy}
      confirmDisabled={!kind || !reason.trim()}
      refusal={refusal}
      onConfirm={() => act(async () => {
        await setDocumentKind(documentId, kind, reason.trim());
        setKind("");
        setReason("");
        onChanged?.();
      })}
    >
      <div className="flex flex-col gap-2">
        {/* #633 AC2, grafted here at integration because #646 MOVED this control out of
            `document-admin.tsx`: the current kind is a PHRASE. The line used to interpolate
            `document_kind` raw ("Current: ssm_company_doc") and a null kind read "Current:
            unclassified" — an absence rather than the actionable "Needs classification" state
            AC3(a) names. `renderKindLabel` answers both from the one key set
            (`lib/documents/kind-label.ts`). */}
        <p className="text-sm text-muted-foreground" data-testid="kind-dialog-current">
          {t("kindCurrent", { kind: renderKindLabel(currentKind, t) })}
        </p>
        <Select value={kind} onValueChange={(v) => setKind(v ?? "")}>
          <SelectTrigger aria-label={t("kindHeading")} size="sm">
            <SelectValue
              placeholder={t("kindPlaceholder")}
              items={DOCUMENT_KINDS.map((k) => ({ value: k, label: renderKindLabel(k, t) }))}
            />
          </SelectTrigger>
          <SelectContent>
            {/* #633 AC2 — the option LABEL is a phrase; the option VALUE stays the DB enum,
                because that value is exactly what `set_document_kind` is called with. The
                ROSTER is deliberately the full one here: `document-kind-control.tsx` (#633's
                list/receipt entrance) excludes `consent_evidence` because that door always
                refuses it, and #633 recorded this detail surface's full roster as an
                observation it would not change. */}
            {DOCUMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{renderKindLabel(k, t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Textarea
          aria-label={t("kindReasonLabel")}
          placeholder={t("reasonRequiredPlaceholder")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />
      </div>
    </DocumentsDoorDialog>
  );
}
