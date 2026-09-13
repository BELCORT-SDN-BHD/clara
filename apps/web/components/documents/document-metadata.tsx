"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { documentBadges, type DocumentBadge } from "@/lib/documents/copy";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/state";
import { DocumentSourceActions } from "./document-source-actions";
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

/** Metadata badges + the source-custody affordances + the extraction/processing
 *  task list. Every badge names a REAL DB-owned field (lib/documents/copy.ts).
 *
 *  THE PREVIEW/DOWNLOAD PAIR AND ITS WHOLE STATE LADDER MOVED OUT, to
 *  `document-source-actions.tsx` — this component used to own three local
 *  useState slots, an AbortController and one flattened "could not open" error
 *  string for a door that answers seven distinct refusals. Those are one
 *  subject (reading the stored original) and they now live in one file; this one
 *  is back to being what its name says. */
export function DocumentMetadata({
  document: doc, tasks, clientId, headingId, onShowExtraction,
}: {
  document: DocumentRow;
  tasks: ProcessingTaskRow[];
  /** The page's client scope — forwarded to the byte door as `?client=` so a
   *  read addressed from the wrong client answers "not available in this client"
   *  rather than serving bytes. */
  clientId: string;
  /** The id the DETAIL panel exports so a surface one rung up can move focus here when a
   *  document is opened — `DOCUMENT_HEADING_ID`, document-detail.tsx. This heading is the
   *  document's own name, which is the right thing for a keyboard reader to land on; the
   *  workbench's "Detail" heading above it names the panel, not the object. */
  headingId?: string;
  /** C-07 / 裁-175 — the honest alternative offered for a type no browser tab can
   *  show. Opens the SAME structured extraction view that lives further down this
   *  panel (document-detail.tsx owns its open state). */
  onShowExtraction?: () => void;
}) {
  const t = useTranslations("ClientDocuments");

  return (
    <div className="flex flex-col gap-2">
      {/* WRAPS AT NARROW WIDTHS rather than pushing the controls off-screen: the
          filename is the long, unpredictable half, so it takes `min-w-0
          truncate` and the action pair keeps its intrinsic size. Measured at
          320px — without the wrap the two buttons sat outside the viewport and
          the page scrolled sideways, which §4 forbids. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader level={3} id={headingId} className="min-w-0 truncate">{doc.original_filename ?? doc.id}</SectionHeader>
      </div>

      <DocumentSourceActions document={doc} clientId={clientId} onShowExtraction={onShowExtraction} />

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
