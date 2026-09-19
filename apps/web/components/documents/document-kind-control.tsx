"use client";

// #633 AC3(a) — "Needs classification" WITH SOMEWHERE TO GO.
//
// `document-state.ts:204` folds a null kind into the facts verdict's honest
// `pending`. That is a true non-promise, but it is not the NAMED, ACTIONABLE state
// AC3 asks for, and from a list row there was no path to classification at all — the
// only `set_document_kind` control in the app lives inside the detail panel's admin
// section, four clicks away.
//
// A DECLARED BOUNDARY CROSSING (brief: "by mounting #646's existing
// `set_document_kind` control"). This component mints NO new door and NO new
// vocabulary: it calls `lib/documents/doors.ts:84`'s `setDocumentKind`, renders the
// same 20 phrases `kind-label.ts` owns, and requires the same reason the DB requires
// (CLR10 without one). #646 owns the CORRECTION act on the detail surface; this is
// the first classification of a document that has none, reached from the row where
// the person noticed it.
//
// The dialog stays open on a refusal (DocumentsDoorDialog's own contract) so a CLR
// the person must read is not destroyed along with what they typed.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentsDoorDialog } from "./DocumentsDoorDialog";
import { setDocumentKind } from "@/lib/documents/doors";
import { renderKindLabel } from "@/lib/documents/kind-label";
import { DOCUMENT_KINDS } from "@/lib/documents/types";
import type { SessionTokenAccessor } from "@/lib/session";

/** The kinds this control may OFFER. `clara.set_document_kind` raises CLR28 for
 *  `consent_evidence` on either side of the change — "consent-evidence classification is
 *  owned by the egress consent path" — so offering it here could only ever produce an
 *  honest refusal the person can do nothing about. That classification is minted by
 *  `classifyConsentEvidenceDocument` (`lib/documents/doors.ts:189`, owner-floored) on the
 *  consent path itself. Exported so the exclusion is pinned against THIS source
 *  (`document-kind-labels.test.tsx`), never against a second copy of the roster. */
export const CLASSIFIABLE_DOCUMENT_KINDS = DOCUMENT_KINDS.filter((k) => k !== "consent_evidence");

export function DocumentKindControl({
  documentId, filename, busy, refusal, act, session,
}: {
  documentId: string;
  filename: string;
  busy: boolean;
  refusal?: Parameters<typeof DocumentsDoorDialog>[0]["refusal"];
  /** The caller's own `useHydratedPart().act` — it re-reads the caller's cell after
   *  the door settles, so this component never paints a result of its own. */
  act: (fn: () => Promise<void>) => Promise<boolean>;
  session?: SessionTokenAccessor;
}) {
  const t = useTranslations("ClientDocuments");
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");

  return (
    <DocumentsDoorDialog
      triggerLabel={t("classify")}
      triggerSize="xs"
      title={t("classifyTitle")}
      description={t("classifyDescription", { filename })}
      diagnostic={t("classifyDiagnostic")}
      confirmLabel={t("classifyConfirm")}
      busy={busy}
      confirmDisabled={!kind || reason.trim().length === 0}
      refusal={refusal}
      onConfirm={() => act(async () => {
        await setDocumentKind(documentId, kind, reason.trim(), session ? { session } : {});
      })}
    >
      <div className="flex flex-col gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v ?? "")}>
          <SelectTrigger aria-label={t("kindHeading")} size="sm">
            <SelectValue
              placeholder={t("kindPlaceholder")}
              items={CLASSIFIABLE_DOCUMENT_KINDS.map((k) => ({ value: k, label: renderKindLabel(k, t) }))}
            />
          </SelectTrigger>
          <SelectContent>
            {CLASSIFIABLE_DOCUMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{renderKindLabel(k, t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("reasonRequiredPlaceholder")}
          aria-label={t("kindReasonLabel")}
        />
      </div>
    </DocumentsDoorDialog>
  );
}
