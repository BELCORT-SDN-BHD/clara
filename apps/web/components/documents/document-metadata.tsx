"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { documentBadges, type DocumentBadge } from "@/lib/documents/copy";
import { openDocumentInNewTab } from "@/lib/documents/open-in-new-tab";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, StateBanner } from "@/components/common/state";
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

    const controller = new AbortController();
    abortRef.current = controller;

    // openDocumentInNewTab opens the tab SYNCHRONOUSLY inside this click handler
    // (see its own header — R1: a features string of "noreferrer"/"noopener"
    // makes window.open return null UNCONDITIONALLY, which the previous cut here
    // got backwards).
    void openDocumentInNewTab(doc.id, { signal: controller.signal })
      .then((result) => {
        if (result.ok) { setOpenState("idle"); return; }
        setOpenState("error");
        setOpenError(result.reason === "popup_blocked" ? t("openDocumentPopupBlocked") : t("openDocumentFailed", { message: result.message }));
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return; // unmounted mid-fetch — no state left to update
        setOpenState("error");
        setOpenError(e instanceof Error ? e.message : String(e));
      });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader level={3} className="truncate">{doc.original_filename ?? doc.id}</SectionHeader>
        <Button size="sm" variant="outline" disabled={openState === "loading"} onClick={openDocument}>
          {openState === "loading" ? t("openingDocument") : t("openDocument")}
        </Button>
      </div>
      {openError ? <StateBanner tone="error" className="text-xs">{t("openDocumentFailed", { message: openError })}</StateBanner> : null}

      <div className="flex flex-wrap gap-1.5">
        {documentBadges(doc).map((badge) => (
          <Badge key={badgeKey(badge)} variant="outline">{badgeLabel(badge, t)}</Badge>
        ))}
      </div>
      {doc.legal_hold && doc.legal_hold_reason ? (
        <p className="text-xs text-muted-foreground">{t("legalHoldReason", { reason: doc.legal_hold_reason })}</p>
      ) : null}

      <section className="flex flex-col gap-1">
        <SectionHeader level={4}>{t("extractionTasksHeading")}</SectionHeader>
        {tasks.length === 0 ? (
          <EmptyState>{t("extractionTasksEmpty")}</EmptyState>
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
