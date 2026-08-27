"use client";

// The `counts` envelope from clara.list_review_queue, rendered verbatim as summary
// chips (this build's coordinator ruling: "the counts envelope drives the summary
// chips"). Every number here is the DB's own count — nothing summed client-side.
//
// FIX-4 (independent review, fix-required, 2026-08-27): the live envelope carries
// EIGHT counts, not six — compliance_watches (0016_a21_compliance_watch.sql:4680)
// and lint_findings (0017_wave_b.sql:618-624) were added by the same splices that
// FIX-1 grounds the row_kind taxonomy against. Both are now chipped here.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/parts/PartBadge";
import type { ReviewQueueCounts } from "@/lib/firm/needs-you";

export function NeedsYouCounts({ counts }: { counts: ReviewQueueCounts }) {
  const t = useTranslations("NeedsYou");
  const chips: [string, number][] = [
    [t("countsNeedsYou"), counts.needs_you],
    [t("countsNeedsReview"), counts.needs_review],
    [t("countsReady"), counts.ready],
    [t("countsOpenDrafts"), counts.open_drafts],
    [t("countsOpenQuestions"), counts.open_questions],
    [t("countsOpenTasks"), counts.open_tasks],
    [t("countsComplianceWatches"), counts.compliance_watches],
    [t("countsLintFindings"), counts.lint_findings],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(([label, value]) => (
        <Badge key={label} tone="neutral">
          {label}: {value}
        </Badge>
      ))}
    </div>
  );
}
