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

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/common/native-select";
import { Textarea } from "@/components/ui/textarea";
import { completeCodingTask, dismissCodingTask } from "@/lib/coding/doors";
import { listApprovedEntriesForFiling } from "@/lib/coding/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { CodingDoorDialog } from "./CodingDoorDialog";
import { CodingActionRefusal } from "./coding-action-refusal";

// F1, independent review — CORRECTED SHAPE: no outer error/clr prop; see
// uncoded-filing-actions.tsx's own header for why (its two real callers
// disagree on their error shape, and each already renders its own, in its
// own idiom, around this component). The ENTRIES-fetch error below is a
// separate, purely-internal concern (F3(a)) — it is genuinely always the
// same {message, null clr} shape this component derives itself, regardless
// of which caller is using it, so it keeps its own ActionRefusal.

type EntryRow = { id: string; posting_date: string | null; memo: string | null };
/** F3(a), independent review: a FAILED read must never render as "zero
 *  approved entries exist" — that is a fabricated fact about the books, and
 *  it silently permanently disables Complete on a transient failure the
 *  human has no way to retry. Three real states, never collapsed into one. */
type EntriesState = { kind: "loading" } | { kind: "error"; error: unknown } | { kind: "loaded"; rows: EntryRow[] };

export function CodingTaskActions({
  taskId, filingId, busy, act,
}: {
  taskId: string;
  filingId: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<unknown>;
}) {
  const t = useTranslations("CodingQuestionsSignals.codingTask");
  const [entries, setEntries] = useState<EntriesState>({ kind: "loading" });
  const [entryId, setEntryId] = useState("");
  const [reason, setReason] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let live = true;
    setEntries({ kind: "loading" });
    listApprovedEntriesForFiling(filingId, { session: sessionTokenAccessor })
      .then((rows) => { if (live) setEntries({ kind: "loaded", rows }); })
      .catch((e) => { if (live) setEntries({ kind: "error", error: e }); });
    return () => { live = false; };
  }, [filingId, retryToken]);

  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <CodingDoorDialog
          triggerLabel={t("completeTrigger")}
          title={t("completeTitle")}
          description={t("completeDescription")}
          confirmLabel={t("completeConfirm")}
          busy={busy}
          confirmDisabled={entries.kind !== "loaded" || !entryId}
          onConfirm={async () => {
            // F5, independent review: clear only on success (see
            // uncoded-filing-actions.tsx's own comment on the same fix).
            let succeeded = false;
            await act(async () => { await completeCodingTask(taskId, entryId); succeeded = true; });
            if (succeeded) setEntryId("");
          }}
        >
          {entries.kind === "loading" ? (
            <p className="text-sm text-muted-foreground">{t("loadingEntries")}</p>
          ) : entries.kind === "error" ? (
            <div className="flex flex-col gap-2">
              <CodingActionRefusal
                err={entries.error instanceof Error ? entries.error.message : String(entries.error)}
                clr={null}
              />
              <Button type="button" size="sm" variant="outline" onClick={retry}>
                {t("retryEntries")}
              </Button>
            </div>
          ) : entries.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noApprovedEntries")}</p>
          ) : (
            <NativeSelect
              aria-label={t("entryPickerLabel")}
              value={entryId}
              onChange={(e) => setEntryId(e.target.value)}
              className="w-full"
            >
              <option value="">{t("entryPickerPlaceholder")}</option>
              {entries.rows.map((entry) => (
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
          onConfirm={async () => {
            let succeeded = false;
            await act(async () => { await dismissCodingTask(taskId, reason.trim()); succeeded = true; });
            if (succeeded) setReason("");
          }}
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
