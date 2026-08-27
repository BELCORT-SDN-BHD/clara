"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { candidateRuleBandCopy } from "@/lib/documents/copy";
import { confirmCandidate, dismissCandidate } from "@/lib/documents/doors";
import type { OpenCandidateEntry } from "@/lib/documents/loaders";
import { DoorFeedback } from "./door-feedback";
import type { PartClr } from "@/lib/parts/hooks";

/**
 * "Needs your confirmation" — open (unresolved) attribution candidates for this
 * client (attribution_candidates.disposition='open', a DB-named state). Confirming
 * FILES the document in the same governed call (confirm_attribution_candidate,
 * p_file_document: true); dismissing retires the candidate without filing. `act` is
 * the caller's `useHydratedPart().act` — every attempt re-reads afterward, success
 * or refusal (hydrate-never-trust); a refusal renders VERBATIM via `DoorFeedback`.
 */
export function OpenCandidateList({
  entries, busy, err, clr, act,
}: {
  entries: OpenCandidateEntry[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("ClientDocuments");

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("candidatesEmpty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {entries.map(({ candidate, document }) => (
          <li
            key={candidate.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-card-foreground">{document.original_filename ?? document.id}</span>
              <span className="text-xs text-muted-foreground">{candidateRuleBandCopy(candidate.rule_kind)}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void act(() => confirmCandidate(candidate.id))}>
                {t("confirmAndFile")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => dismissCandidate(candidate.id))}>
                {t("dismiss")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <DoorFeedback err={err} clr={clr} />
    </div>
  );
}
