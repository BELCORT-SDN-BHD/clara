"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { documentBadges, type DocumentBadge } from "@/lib/documents/copy";
import { fetchDocumentBytes } from "@/lib/documents/bytes";
import type { DocumentRow, ProcessingTaskRow } from "@/lib/documents/types";

/** The next-intl KEY for a processing task's status — never English text here
 *  (STYLE law); "ClientDocuments.taskStatus.*" (see document-metadata.tsx's own
 *  render below). Mirrors apps/dashboard/app/shared/intake.ts's
 *  `processingStatusCopy` mapping, keyed instead of rendered. */
const TASK_STATUS_KEY: Record<ProcessingTaskRow["status"], string> = {
  queued: "taskStatus.queued",
  held_egress: "taskStatus.held_egress",
  running: "taskStatus.running",
  done: "taskStatus.done",
  failed: "taskStatus.failed",
};

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Resolves one structured `DocumentBadge` (copy.ts) into its rendered label — the
 *  ONE place this two-step translation happens (`extraction` interpolates its own
 *  already-translated status word into the wrapping "extraction: {status}" key). */
function badgeLabel(badge: DocumentBadge, t: Translate): string {
  switch (badge.kind) {
    case "extraction": return t("badgeExtraction", { status: t(badge.statusKey) });
    case "pageCount": return t("badgePageCount", { count: badge.count });
    case "documentKind": return badge.value; // a DB-owned enum string (e.g. "invoice"), not chrome prose
    case "financialDate": return t("badgeFinancialDate", { date: badge.date });
    case "retention": return badge.until
      ? t("badgeRetentionUntil", { state: badge.state, until: badge.until })
      : t("badgeRetention", { state: badge.state });
    case "legalHold": return t("badgeLegalHold");
    case "eInvoice": return t("badgeEInvoice");
  }
}

function badgeKey(badge: DocumentBadge): string {
  return badge.kind === "documentKind" ? `documentKind:${badge.value}` : badge.kind;
}

/** Metadata badges + the evidence viewer's entry point (fetchDocumentBytes,
 *  PIN-DELTA-4) + the extraction/processing task list. Every badge names a REAL
 *  DB-owned field (lib/documents/copy.ts); the byte fetch is honest about failure —
 *  it never leaves a dead link on click. */
export function DocumentMetadata({ document: doc, tasks }: { document: DocumentRow; tasks: ProcessingTaskRow[] }) {
  const t = useTranslations("ClientDocuments");
  const [openState, setOpenState] = useState<"idle" | "loading" | "error">("idle");
  const [openError, setOpenError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const openDocument = () => {
    setOpenState("loading");
    setOpenError(null);

    // Open the tab SYNCHRONOUSLY, inside the click handler — every major browser
    // popup-blocks a `window.open` called AFTER an `await` (independent review
    // 2026-08-27, F5), and it does so by returning `null` WITHOUT throwing, so the
    // old code reported "opened" regardless. `noreferrer` only (not `noopener` —
    // that nulls the returned reference outright, and this tab's own `.location`
    // is exactly what gets set once the fetch resolves).
    const tab = window.open("about:blank", "_blank", "noreferrer");

    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const bytes = await fetchDocumentBytes(doc.id, { signal: controller.signal });
        if (!tab || tab.closed) {
          bytes.revoke();
          setOpenState("error");
          setOpenError(t("openDocumentPopupBlocked"));
          return;
        }
        tab.location.href = bytes.blobUrl;
        // The tab keeps its own reference to the blob; revoking immediately would
        // race its own load of it, so this leaks one object URL per open —
        // acceptable for a human-paced click action, unlike a hot loop.
        setOpenState("idle");
      } catch (e) {
        tab?.close();
        if (e instanceof Error && e.name === "AbortError") return; // unmounted mid-fetch — no state left to update
        setOpenState("error");
        setOpenError(e instanceof Error ? e.message : String(e));
      }
    })();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-base font-semibold text-foreground">{doc.original_filename ?? doc.id}</h2>
        <Button size="sm" variant="outline" disabled={openState === "loading"} onClick={openDocument}>
          {openState === "loading" ? t("openingDocument") : t("openDocument")}
        </Button>
      </div>
      {openError ? <p className="text-xs text-error">{t("openDocumentFailed", { message: openError })}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        {documentBadges(doc).map((badge) => (
          <Badge key={badgeKey(badge)} variant="outline">{badgeLabel(badge, t)}</Badge>
        ))}
      </div>
      {doc.legal_hold && doc.legal_hold_reason ? (
        <p className="text-xs text-muted-foreground">{t("legalHoldReason", { reason: doc.legal_hold_reason })}</p>
      ) : null}

      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">{t("extractionTasksHeading")}</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("extractionTasksEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{task.lane} v{task.version_n}</span>
                <span className="text-muted-foreground">
                  {t(TASK_STATUS_KEY[task.status])}
                  {task.error_code ? ` · ${task.error_code}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
