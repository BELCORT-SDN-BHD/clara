"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { queueRecoveryLabelKey, queueStateLabelKey } from "@/lib/documents/copy";
import { useUploadQueue, type QueueItem, type QueueTooLargeNote } from "@/lib/documents/useUploadQueue";
import { sessionTokenAccessor } from "@/lib/session-accessor";

/**
 * Upload + queue for this client's Documents tab (ported MECHANISM from
 * apps/dashboard/app/documents/page.tsx's dropzone + useUploadQueue.ts, DEPARTURE:
 * every adopted document auto-files to `clientId` — see useUploadQueue.ts's header).
 * `onFiled` re-hydrates the filed-documents list; this panel never asserts a row is
 * filed itself. EVERY chrome string here goes through next-intl (`t()`); `item.error`
 * (a real operational failure) and `item.recoveryRemedy` (the DB's own authoritative
 * wording) render VERBATIM, exactly like DoorFeedback's `err` elsewhere on this tab.
 */
export function UploadPanel({ clientId, onFiled }: { clientId: string; onFiled: () => void }) {
  const t = useTranslations("ClientDocuments");
  const [note, setNote] = useState<QueueTooLargeNote | null>(null);
  const queue = useUploadQueue(clientId, sessionTokenAccessor, onFiled, setNote);

  return (
    <section className="flex flex-col gap-2">
      <div
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          if (files.length) queue.add(files);
        }}
      >
        <input
          type="file"
          multiple
          aria-label={t("uploadInputLabel")}
          className="text-sm"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) queue.add(files);
            e.target.value = "";
          }}
        />
        <p className="text-xs text-muted-foreground">{t("uploadHint")}</p>
      </div>

      {note ? (
        <p className="text-xs text-warning">
          {t("uploadTooLarge", { filename: note.filename, limitMb: Math.round(note.limitBytes / (1024 * 1024)) })}
        </p>
      ) : null}

      {queue.items.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {queue.items.map((item) => <QueueRow key={item.localId} item={item} onRetry={queue.retry} onRemove={queue.remove} />)}
          <li>
            <Button size="xs" variant="ghost" onClick={queue.clearDone}>{t("clearFinished")}</Button>
          </li>
        </ul>
      ) : null}
    </section>
  );
}

function QueueRow({ item, onRetry, onRemove }: { item: QueueItem; onRetry: (id: string) => void; onRemove: (id: string) => void }) {
  const t = useTranslations("ClientDocuments");
  const recoveryKey = queueRecoveryLabelKey(item.recoveryReason ?? null);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm">
      <span className="max-w-40 truncate font-medium text-card-foreground" title={item.name}>{item.name}</span>
      <span className="flex-1 text-xs text-muted-foreground">
        {t(queueStateLabelKey(item))}
        {item.state === "failed" && item.failureCode ? ` · ${item.failureCode}` : ""}
        {item.state === "ready" && recoveryKey ? ` · ${t(recoveryKey)}` : ""}
      </span>
      {item.state === "error" || item.state === "failed" ? (
        <Button size="xs" variant="outline" onClick={() => onRetry(item.localId)}>{t("retry")}</Button>
      ) : null}
      <Button size="xs" variant="ghost" onClick={() => onRemove(item.localId)}>{t("remove")}</Button>
      {item.state === "error" && item.error ? <span className="w-full text-xs text-error">{item.error}</span> : null}
      {item.state === "ready" && item.recoveryReason ? (
        <span className="w-full text-xs text-muted-foreground">
          {item.recoveryRemedy
            ?? (item.recoveryReason === "mime_mismatch"
              ? t("queueRecoveryMimeMismatchDetail", {
                  stored: item.recoveryDocumentMime ?? t("queueRecoveryUnknownType"),
                  sent: item.recoveryUploadMime ?? t("queueRecoveryUnknownType"),
                })
              : null)}
        </span>
      ) : null}
    </li>
  );
}
