"use client";

// The complete_coding_task/dismiss_coding_task inline actions — shared
// between the coding-lane workbench's own task list (coding-tasks-section.tsx)
// and the needs-you registry's `coding_task` affordance
// (components/firm/coding-task-affordance.tsx), so the SAME door-calling
// logic backs both surfaces (never a second, drifting copy — AGENTS.md's
// "spelling is not identity" reasoning applies to mechanism copies too).
// Takes primitive ids rather than a typed row so either caller's own row
// shape (CodingTaskRow here, ReviewQueueRow on the needs-you side) can supply
// them without an adapter type.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NativeSelect } from "@/components/common/native-select";
import { Textarea } from "@/components/ui/textarea";
import { completeCodingTask, dismissCodingTask } from "@/lib/coding/doors";
import { listApprovedEntriesForFiling } from "@/lib/coding/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { CodingDoorDialog } from "./CodingDoorDialog";
import { ErrorMessage } from "@/components/firm/data-state";

export function CodingTaskActions({
  taskId, filingId, busy, error, act,
}: {
  taskId: string;
  filingId: string;
  busy: boolean;
  error: unknown;
  /** The SAME act()-and-reload cycle every caller's own queue uses — never a
   *  bespoke door call outside it. Typed `Promise<unknown>` because the two
   *  real callers disagree on what they resolve to (needs-you-affordances.tsx's
   *  `Promise<boolean>` vs lib/parts/hooks.ts's `useHydratedPart().act()`'s
   *  `Promise<void>`) — this component never inspects the resolved value. */
  act: (fn: () => Promise<void>) => Promise<unknown>;
}) {
  const t = useTranslations("CodingQuestionsSignals.codingTask");
  const [entries, setEntries] = useState<{ id: string; posting_date: string | null; memo: string | null }[] | null>(null);
  const [entryId, setEntryId] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let live = true;
    listApprovedEntriesForFiling(filingId, { session: sessionTokenAccessor })
      .then((rows) => { if (live) setEntries(rows); })
      .catch(() => { if (live) setEntries([]); });
    return () => { live = false; };
  }, [filingId]);

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <CodingDoorDialog
          triggerLabel={t("completeTrigger")}
          title={t("completeTitle")}
          description={t("completeDescription")}
          confirmLabel={t("completeConfirm")}
          busy={busy}
          confirmDisabled={!entryId}
          onConfirm={() => act(async () => { await completeCodingTask(taskId, entryId); }).then(() => undefined)}
        >
          {entries === null ? (
            <p className="text-sm text-muted-foreground">{t("loadingEntries")}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noApprovedEntries")}</p>
          ) : (
            <NativeSelect
              aria-label={t("entryPickerLabel")}
              value={entryId}
              onChange={(e) => setEntryId(e.target.value)}
              className="w-full"
            >
              <option value="">{t("entryPickerPlaceholder")}</option>
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.posting_date ?? "—"} — {entry.memo ?? entry.id}
                </option>
              ))}
            </NativeSelect>
          )}
        </CodingDoorDialog>

        <CodingDoorDialog
          triggerLabel={t("dismissTrigger")}
          title={t("dismissTitle")}
          confirmLabel={t("dismissConfirm")}
          busy={busy}
          confirmDisabled={!reason.trim()}
          onConfirm={() => act(async () => { await dismissCodingTask(taskId, reason.trim()); }).then(() => { setReason(""); })}
        >
          <Textarea
            aria-label={t("dismissReasonLabel")}
            placeholder={t("dismissReasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </CodingDoorDialog>
      </div>
    </div>
  );
}
