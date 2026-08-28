"use client";

// The resolve_lint_finding inline action — shared between the coding-lane
// workbench's own lint-findings section and the needs-you registry's
// `lint_finding` affordance (components/firm/lint-finding-affordance.tsx).
// Same sharing rationale as ./coding-task-actions.tsx's own header.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { NativeSelect } from "@/components/common/native-select";
import { Textarea } from "@/components/ui/textarea";
import { resolveLintFinding } from "@/lib/coding/doors";
import { LINT_FINDING_CONCLUSIONS, type LintFindingConclusion } from "@/lib/coding/types";
import { CodingDoorDialog } from "./CodingDoorDialog";
import { LintFindingDetail } from "./lint-finding-detail";
import { ErrorMessage } from "@/components/firm/data-state";

export function LintFindingActions({
  findingId, busy, error, act,
}: {
  findingId: string;
  busy: boolean;
  error: unknown;
  act: (fn: () => Promise<void>) => Promise<unknown>;
}) {
  const t = useTranslations("CodingQuestionsSignals.lintFinding");
  const [conclusion, setConclusion] = useState<LintFindingConclusion | "">("");
  const [note, setNote] = useState("");

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      {/* T7 (port-wave plan §4) — clara.get_lint_finding, on demand. */}
      <LintFindingDetail findingId={findingId} />
      <CodingDoorDialog
        triggerLabel={t("resolveTrigger")}
        title={t("resolveTitle")}
        confirmLabel={t("resolveConfirm")}
        busy={busy}
        confirmDisabled={!conclusion || !note.trim()}
        onConfirm={() =>
          act(async () => { await resolveLintFinding(findingId, conclusion, note.trim()); }).then(() => {
            setConclusion(""); setNote("");
          })
        }
      >
        <NativeSelect
          aria-label={t("conclusionLabel")}
          value={conclusion}
          onChange={(e) => setConclusion(e.target.value as LintFindingConclusion)}
          className="w-full"
        >
          <option value="">{t("conclusionPlaceholder")}</option>
          {LINT_FINDING_CONCLUSIONS.map((c) => (
            <option key={c} value={c}>{t(`conclusions.${c}`)}</option>
          ))}
        </NativeSelect>
        <Textarea
          aria-label={t("noteLabel")}
          placeholder={t("notePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </CodingDoorDialog>
    </div>
  );
}
