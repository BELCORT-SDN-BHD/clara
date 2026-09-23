"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/common/state";
import { queueRecoveryLabelKey, queueStateLabelKey, readErrorKey } from "@/lib/documents/copy";
import { renderFileSize } from "@/lib/documents/file-size";
import { renderKindLabel } from "@/lib/documents/kind-label";
import { intakeFailureAdvice } from "@/lib/documents/failure-advice";
import { useCapabilityRegistry } from "@/lib/documents/use-capability-registry";
import { useUploadQueue, type QueueItem, type QueueRejection } from "@/lib/documents/useUploadQueue";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { CapabilityTiers } from "./capability-tiers";
import { DocumentKindControl } from "./document-kind-control";
import type { CapabilityIndex } from "@/lib/documents/capability-registry";

/**
 * Upload + queue for this client's Documents tab.
 *
 * #633 REBUILT THIS SURFACE. It used to be a hand-rolled `<ul>/<li>` carrying a phase
 * word and nothing else (:58-97), while the ACCEPTED Data Table composition sat in
 * the same folder (`filed-document-list.tsx:5,38`). The rebuild is the shipped
 * `DataTableCard` + `Table` primitives, and every column names something REAL:
 *
 *   File      the name the person chose
 *   Size      the file's own bytes
 *   Kind      the 20-phrase vocabulary (`kind-label.ts`), with "Needs classification"
 *             ACTIONABLE once custody exists — AC3(a)
 *   Status    the queue's own state, plus the DB's failure code as a NEXT STEP — AC6
 *   Progress  a real `role="progressbar"` fed by MEASURED bytes, plus the honest
 *             processing-task counts — AC8. No measurement ⇒ no number.
 *   Support   the four capability tiers, from the registry read — AC3(b)
 *
 * THREE CONTROLS, THREE DIFFERENT ACTS (AC1(a)/AC7). Cancel stops this transfer and
 * KEEPS the row; Retry runs it again; Remove takes it off the list. None of them
 * cancels an accepted Work — that is a governed act on another object, reached by a
 * link from the document's own detail panel, and this surface says so rather than
 * offering a control that looks like it.
 *
 * ONE ANNOUNCEMENT OWNER (`document-source-actions.tsx:271`'s rule, copied): a single
 * `role="status" aria-live="polite"` region speaks each file's SETTLEMENT once. The
 * rows themselves are not live regions — 40 live rows would speak a batch forty times
 * over every re-render.
 *
 * EVERY chrome string goes through next-intl; `item.error` (a real operational
 * failure) and `item.recoveryRemedy` (the DB's own authoritative wording) render
 * VERBATIM, exactly like DoorFeedback's `err` elsewhere on this tab.
 */
export function UploadPanel({ clientId, onFiled, capabilityIndex }: {
  clientId: string;
  onFiled: () => void;
  /** ONE REGISTRY READ PER MOUNT, and the surface decides who owns it. When the page
   *  already read the 240-row catalogue for another cell it passes the index down and
   *  this panel reads NOTHING; mounted on its own (the a11y battery, a future host)
   *  it reads for itself. Omitting the prop means "I own the read"; passing `null`
   *  means "the owner has nothing yet", which renders the honest not-published tier. */
  capabilityIndex?: CapabilityIndex | null;
}) {
  const t = useTranslations("ClientDocuments");
  const [note, setNote] = useState<QueueRejection | null>(null);
  const queue = useUploadQueue(clientId, sessionTokenAccessor, onFiled, setNote);
  // A null session accessor disables the read entirely (lib/parts/hooks.ts only fires
  // its mount effect when a session is present) — so the hoisted case costs zero reads.
  const ownRegistry = useCapabilityRegistry(capabilityIndex === undefined ? sessionTokenAccessor : null);
  const registryIndex = capabilityIndex === undefined ? ownRegistry.index : capabilityIndex;

  /** Every rendered row's own first control, keyed by localId, so focus can be
   *  RETURNED into the table after Cancel/Remove destroys whatever held it. The same
   *  Map-of-rows idiom `filed-document-list.tsx`'s `rowRef` uses; a Map rather than
   *  one ref because the row that was acted on may itself be gone by then. */
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const focusNeighbour = useCallback((localId: string) => {
    const order = queue.items.map((i) => i.localId);
    const at = order.indexOf(localId);
    const candidates = [order[at + 1], order[at - 1]].filter((id): id is string => typeof id === "string");
    for (const id of candidates) {
      const row = rowRefs.current.get(id);
      if (row && typeof row.focus === "function") { row.focus(); return; }
    }
  }, [queue.items]);

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
          {note.reason === "too_large"
            ? t("uploadTooLarge", { filename: note.filename, limitMb: Math.round(note.limitBytes / (1024 * 1024)) })
            : t("uploadDuplicate", { filename: note.filename })}
        </p>
      ) : null}

      <QueueAnnouncer items={queue.items} />

      {queue.items.length === 0 ? (
        <EmptyState>{t("queueEmpty")}</EmptyState>
      ) : (
        <>
          <DataTableCard label={t("queueTableLabel")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colFile")}</TableHead>
                <TableHead>{t("colSize")}</TableHead>
                <TableHead>{t("colKind")}</TableHead>
                <TableHead>{t("colPhase")}</TableHead>
                <TableHead>{t("colProgress")}</TableHead>
                <TableHead>{t("colCapability")}</TableHead>
                <TableHead>{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.items.map((item) => (
                <QueueRow
                  key={item.localId}
                  item={item}
                  capabilityIndex={registryIndex}
                  onClassified={onFiled}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(item.localId, el);
                    else rowRefs.current.delete(item.localId);
                  }}
                  onCancel={(id) => { focusNeighbour(id); queue.cancel(id); }}
                  onRetry={queue.retry}
                  onRemove={(id) => { focusNeighbour(id); queue.remove(id); }}
                />
              ))}
            </TableBody>
          </DataTableCard>
          <div>
            <Button size="xs" variant="ghost" onClick={queue.clearDone}>{t("clearFinished")}</Button>
          </div>
        </>
      )}
    </section>
  );
}

/** THE ONE ANNOUNCEMENT OWNER for this surface. Speaks a file's name and its settled
 *  state exactly once, when it settles — never on every progress tick (a 40-file batch
 *  would otherwise emit thousands of announcements) and never for a row still moving. */
function QueueAnnouncer({ items }: { items: QueueItem[] }) {
  const t = useTranslations("ClientDocuments");
  const spoken = useRef(new Set<string>());
  const [message, setMessage] = useState("");

  useEffect(() => {
    const TERMINAL = new Set(["ready", "failed", "error", "stopped"]);
    for (const item of items) {
      const stamp = `${item.localId}:${item.state}`;
      if (!TERMINAL.has(item.state) || spoken.current.has(stamp)) continue;
      spoken.current.add(stamp);
      setMessage(t("queueAnnounceSettled", { filename: item.name, state: t(queueStateLabelKey(item)) }));
    }
  }, [items, t]);

  return (
    <div role="status" aria-live="polite" aria-label={t("queueLiveLabel")} className="sr-only">
      {message}
    </div>
  );
}

/** The DB's own failure code as a NEXT STEP (AC6). The closed map and its honest default moved to
 *  `lib/documents/failure-advice.ts` when #965's 0254 made the DURABLE receipts list a second
 *  surface over the same nine codes (L05-SPEC-07): two views of one vocabulary, one map. */

function QueueRow({
  item, capabilityIndex, rowRef, onCancel, onRetry, onRemove, onClassified,
}: {
  item: QueueItem;
  capabilityIndex: CapabilityIndex | null;
  rowRef: (el: HTMLTableRowElement | null) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  /** Re-hydrates the tab after a classification lands — this row paints no result of
   *  its own (hydrate-never-trust). */
  onClassified: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  const recoveryKey = queueRecoveryLabelKey(item.recoveryReason ?? null);
  const live = !["ready", "failed", "error", "stopped"].includes(item.state);
  const measured = item.bytesSent !== null && item.bytesTotal !== null && item.bytesTotal > 0;

  return (
    <TableRow ref={rowRef} tabIndex={-1} className="enter-content align-top">
      <TableCell className="max-w-48 truncate font-medium text-foreground" title={item.name}>{item.name}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{renderFileSize(item.size, t)}</TableCell>
      <TableCell className="text-muted-foreground">
        <div className="flex flex-col gap-1">
          {/* A queue row is pre-classification by construction, so this is the NAMED
              "Needs classification" phrase rather than a blank cell — and once custody
              exists it is ACTIONABLE (AC3(a)). */}
          <span>{renderKindLabel(null, t)}</span>
          {item.documentId ? (
            <DocumentKindControl
              documentId={item.documentId}
              filename={item.name}
              busy={false}
              act={async (fn) => { await fn(); onClassified(); return true; }}
            />
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <div className="flex flex-col gap-1">
          <span>{t(queueStateLabelKey(item))}</span>
          {item.state === "failed" && item.failureCode ? (
            <Alert variant="destructive" data-testid="queue-failure-advice">
              <AlertDescription>{intakeFailureAdvice(item.failureCode, t)}</AlertDescription>
            </Alert>
          ) : null}
          {item.state === "error" && item.errorKind ? (
            <Alert variant="destructive" data-testid="queue-denied-face">
              <AlertDescription>
                {t("queueDeniedLead", { reason: t(readErrorKey(item.errorKind)) })}
                {item.errorPhase === "filing" && item.documentId ? ` ${t("queueAdoptedNotFiled")}` : ""}
              </AlertDescription>
            </Alert>
          ) : null}
          {item.state === "error" && item.error ? (
            <span className="text-xs text-error wrap-anywhere">{item.error}</span>
          ) : null}
          {item.state === "stopped" ? (
            <span className="text-xs text-muted-foreground">
              {item.stopReason === "cancelled" ? t("queueStoppedCancelled") : t("queueStoppedUntracked")}
            </span>
          ) : null}
          {item.state === "ready" && recoveryKey ? (
            <span className="text-xs text-muted-foreground">{t(recoveryKey)}</span>
          ) : null}
          {item.state === "ready" && item.recoveryReason ? (
            <span className="text-xs text-muted-foreground wrap-anywhere">
              {item.recoveryRemedy
                ?? (item.recoveryReason === "mime_mismatch"
                  ? t("queueRecoveryMimeMismatchDetail", {
                      stored: item.recoveryDocumentMime ?? t("queueRecoveryUnknownType"),
                      sent: item.recoveryUploadMime ?? t("queueRecoveryUnknownType"),
                    })
                  : null)}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="min-w-32">
        <div className="flex flex-col gap-1">
          {/* MEASURED OR NOTHING. `value={null}` is Base UI's indeterminate state: it
              drops `aria-valuenow` and renders no fill, so a browser that cannot
              measure an upload never produces a bar wearing a percentage. */}
          <Progress
            value={measured ? item.bytesSent : null}
            max={measured ? item.bytesTotal! : 100}
            label={t("queueProgressLabel", { filename: item.name })}
          />
          <span className="text-xs text-muted-foreground">
            {measured
              ? t("queueProgressBytes", { sent: renderFileSize(item.bytesSent!, t), total: renderFileSize(item.bytesTotal!, t) })
              : t("queueProgressUnmeasured")}
          </span>
          {item.taskCounts ? (
            <span className="text-xs text-muted-foreground">
              {t("queueTaskCounts", { done: item.taskCounts.done, total: item.taskCounts.total })}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="min-w-40">
        <CapabilityTiers index={capabilityIndex} mime={item.declaredMime} kind={null} filename={item.name} compact />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {live ? (
            <Button size="xs" variant="outline" onClick={() => onCancel(item.localId)}>{t("cancel")}</Button>
          ) : null}
          {["error", "failed", "stopped"].includes(item.state) ? (
            <Button size="xs" variant="outline" onClick={() => onRetry(item.localId)}>{t("retry")}</Button>
          ) : null}
          <Button size="xs" variant="ghost" onClick={() => onRemove(item.localId)}>{t("remove")}</Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
