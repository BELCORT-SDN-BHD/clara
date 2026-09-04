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
export function DocumentMetadata({
  document: doc, tasks, onShowExtraction,
}: {
  document: DocumentRow;
  tasks: ProcessingTaskRow[];
  /** C-07 / 裁-175 — the honest alternative offered when the viewer gate refuses
   *  this document's type. Opens the SAME structured extraction view that lives
   *  further down this panel (document-detail.tsx owns its open state), rather
   *  than leaving the human at a refusal with nowhere to go. Optional: a caller
   *  with no such view renders the reason alone, never a dead control. */
  onShowExtraction?: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  const [openState, setOpenState] = useState<"idle" | "loading" | "error">("idle");
  const [openError, setOpenError] = useState<string | null>(null);
  const [notViewableMime, setNotViewableMime] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const openDocument = () => {
    setOpenState("loading");
    setOpenError(null);
    setNotViewableMime(null);

    const controller = new AbortController();
    abortRef.current = controller;

    // openDocumentInNewTab opens the tab SYNCHRONOUSLY inside this click handler
    // (see its own header — R1: a features string of "noreferrer"/"noopener"
    // makes window.open return null UNCONDITIONALLY, which the previous cut here
    // got backwards).
    void openDocumentInNewTab(doc.id, { signal: controller.signal })
      .then((result) => {
        if (result.ok) { setOpenState("idle"); return; }
        // C-07 / 裁-175: `not_viewable` is NOT an error — nothing failed. The
        // gate refused a type a browser tab cannot show inertly, and the honest
        // answer names the type and points at the view that CAN show it. It
        // therefore gets its own state and its own tone, never the red
        // "could not open" banner, which would be a lie about the cause.
        if (result.reason === "not_viewable") {
          setOpenState("idle");
          setNotViewableMime(result.mime || t("openDocumentUnknownType"));
          return;
        }
        setOpenState("error");
        // FOUND BY THE BROWSER LEG: `openError` holds a FINISHED SENTENCE, and
        // the banner below used to wrap it in `openDocumentFailed` a SECOND
        // time — the page read "Could not open this document: Could not open
        // this document: document bytes failed". Only one of the two writers
        // may apply the template, and it is this one, because the catch arm
        // below carries a bare `Error.message` that needs framing too.
        setOpenError(result.reason === "popup_blocked" ? t("openDocumentPopupBlocked") : t("openDocumentFailed", { message: result.message }));
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return; // unmounted mid-fetch — no state left to update
        setOpenState("error");
        setOpenError(t("openDocumentFailed", { message: e instanceof Error ? e.message : String(e) }));
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
      {/* `openError` is already a finished sentence (see the two setters above) —
          rendered VERBATIM, never re-wrapped in its own template. */}
      {openError ? <StateBanner tone="error" className="text-xs">{openError}</StateBanner> : null}
      {notViewableMime ? (
        <StateBanner tone="neutral" className="text-xs">
          <span className="flex flex-wrap items-center gap-2">
            <span>{t("openDocumentNotViewable", { mime: notViewableMime })}</span>
            {onShowExtraction ? (
              <Button type="button" size="xs" variant="outline" onClick={onShowExtraction}>
                {t("openDocumentShowExtraction")}
              </Button>
            ) : null}
          </span>
        </StateBanner>
      ) : null}

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
