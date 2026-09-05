"use client";

// The Needs-you scoreboard on Firm Home — the SAME eight numbers `NeedsYouCounts` renders on
// /needs-you, each one a LINK into the inbox that owns it.
//
// WHY THIS IS NOT `components/firm/needs-you-counts.tsx` RENDERED HERE. That component is the
// /needs-you inbox's own summary strip and it emits bare `PartBadge` chips — there is no link in
// it and no slot to put one in. On a HOME page the chips are the page's navigation (the Plain
// exemplar's "a filter chip row where each chip carries its own count", promoted from decoration
// to navigation), so they have to be anchors. Rather than widen a component another lane owns,
// this file renders the same fields, from the same envelope, through the SAME message keys
// (`NeedsYou.counts*` — one vocabulary, not a second copy of the words).
//
// WHAT IS COPIED AND WHAT IS NOT. The VALUES are `counts` off `clara.list_review_queue`'s
// envelope, verbatim — never `rows.length`. The two are genuinely different numbers: the live
// body computes `counts` over the whole population while `rows[]` is one page of it
// (lib/firm/use-review-queue.ts's header), so a page-length here would silently under-report a
// firm with more than fifty open items. A zero chip is a REAL DB zero and renders as `0`; it is
// never hidden, because "Open questions: 0" is the answer an accountant came to the page for.
//
// TARGET SIZE (WCAG 2.2 AA, SC 2.5.8) — `min-h-6 py-1` sits on the LINK, never on `PartBadge`.
// The badge is `px-2 py-0.5 text-xs` (≈20px tall) and has non-link callers whose density is
// correct; growing the primitive to satisfy a rule about POINTER TARGETS would change every
// chip in the product to fix one page's anchors.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/parts/PartBadge";
import type { ReviewQueueCounts } from "@/lib/firm/needs-you";

/** The destination every chip shares — the inbox is one surface, filtered by the human's eye
 *  rather than by a query parameter no tab reads yet (lib/firm/needs-you-links.ts's own
 *  "no deep fragment" note: a link that LOOKS like it filters and does not is worse than one
 *  that plainly opens the list). */
const INBOX_HREF = "/needs-you";

export function NeedsYouScoreboard({ counts }: { counts: ReviewQueueCounts }) {
  const t = useTranslations("NeedsYou");

  // The eight envelope fields, in the order needs-you-counts.tsx already established, so the
  // scoreboard and the inbox strip cannot disagree about which number comes first.
  const chips: { key: string; label: string; value: number }[] = [
    { key: "needs_you", label: t("countsNeedsYou"), value: counts.needs_you },
    { key: "needs_review", label: t("countsNeedsReview"), value: counts.needs_review },
    { key: "ready", label: t("countsReady"), value: counts.ready },
    { key: "open_drafts", label: t("countsOpenDrafts"), value: counts.open_drafts },
    { key: "open_questions", label: t("countsOpenQuestions"), value: counts.open_questions },
    { key: "open_tasks", label: t("countsOpenTasks"), value: counts.open_tasks },
    { key: "compliance_watches", label: t("countsComplianceWatches"), value: counts.compliance_watches },
    { key: "lint_findings", label: t("countsLintFindings"), value: counts.lint_findings },
  ];

  return (
    <ul className="enter-content flex list-none flex-wrap gap-2 p-0">
      {chips.map((chip) => (
        <li key={chip.key}>
          {/* The accessible name is "Needs you: 3", never the bare number — a screen-reader
              user tabbing this row hears what each figure counts, which a chip that reads
              "3" cannot tell them. */}
          {/* NO RING IDIOM HERE, DELIBERATELY. `app/globals.css`'s FOCUS TREATMENT note is
              explicit that the flat `:focus-visible` outline at the SOLID `--focus` token is
              what every plain link relies on, and that a component adopting the ring must
              suppress it with `outline-none`. A chip link is a plain link; suppressing the
              global outline to re-draw a weaker one would be a net loss of indicator, and it
              would enrol this file in the twelve-carrier census for nothing. */}
          <Link href={INBOX_HREF} className="inline-flex min-h-6 items-center rounded-full py-1 no-underline">
            <Badge tone={chip.key === "needs_you" ? "info" : "neutral"}>
              {chip.label}: {chip.value}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
