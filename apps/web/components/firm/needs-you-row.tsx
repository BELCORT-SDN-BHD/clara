"use client";

// One clara.list_review_queue row (lib/firm/needs-you.ts), rendered honestly from
// exactly the fields the RPC projects — row_kind/section verbatim (this build's
// coordinator ruling), no relabeling. A row_kind registered in
// ./needs-you-affordances.tsx carries an inline act (today: only
// `open_question`, via resolve_open_question/dismiss_open_question) — every
// other row_kind is a same-page LINK into the object that actually owns its
// verbs (a draft's journals tab, a filing's documents tab, a coding task's
// documents tab), never a duplicated action here.
//
// FIX-1 (independent review, fix-required, 2026-08-27): the row_kind label used a
// `t(\`rowKind.${row.row_kind}\` as "rowKind.draft")` CAST, which compiles clean
// against tsc regardless of whether the key actually exists — exactly the "hides
// it from tsc" failure the review caught (four of the eight LIVE row kinds had no
// label and rendered as a raw next-intl key path, e.g. "NeedsYou.rowKind.
// staff_advance_incomplete", to a professional). Replaced with a CHECKED lookup
// against lib/firm/needs-you.ts's REVIEW_QUEUE_ROW_KINDS (the closed world, kept
// in the one module that also grounds it against the live DB body) with an honest
// "unrecognized" fallback for anything outside it — never a key path, never a
// silent cast.
//
// T0 seam (port-wave plan §3.2): the inline act itself no longer branches on
// row_kind here — it dispatches through getNeedsYouAffordance
// (./needs-you-affordances.tsx), the registry every later train's own inline
// affordance adds itself to from its own file. The closed-world check above
// (isKnownReviewQueueRowKind) is unchanged and still gates the LABEL; the
// registry lookup is a second, independent gate behind it for the ACT — a
// row_kind can be known (has a label) without carrying an inline affordance
// (the seven link-only kinds today).

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/parts/PartBadge";
import { fmtCents } from "@/lib/registers/money";
import { Button } from "@/components/ui/button";
import { focusRail } from "@/lib/command/bus";
import { isKnownReviewQueueRowKind, type ReviewQueueRow } from "@/lib/firm/needs-you";
import { hasOwningTab, needsYouRowHref } from "@/lib/firm/needs-you-links";
import { getNeedsYouAffordance } from "./needs-you-affordances";

export function NeedsYouRow({
  row,
  busy,
  error,
  onAct,
}: {
  row: ReviewQueueRow;
  busy: boolean;
  /** Attached to THIS row only when it was the one last acted on (N13) — a page-
   *  level banner would misattribute a refusal to whichever row a human looks at
   *  next. */
  error: unknown;
  /** Runs an act through the queue's act()-and-reload cycle, already scoped to
   *  THIS row's acting key by the caller (needs-you-inbox.tsx) — passed
   *  straight through to whichever affordance the registry resolves. */
  onAct: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("NeedsYou");
  const tc = useTranslations("Common");
  const Affordance = getNeedsYouAffordance(row.row_kind);

  const kindLabel = isKnownReviewQueueRowKind(row.row_kind)
    ? t(`rowKind.${row.row_kind}`)
    : t("rowKind.unknown", { kind: row.row_kind });
  const href = needsYouRowHref(row);
  // The handoff text is built from what this row DISPLAYS — its kind label and its own
  // question text when it has one — never from an id the human cannot see on screen.
  const askPrefill = row.question_text
    ? t("askPrefillWithQuestion", { kind: kindLabel, question: row.question_text })
    : t("askPrefill", { kind: kindLabel });

  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={row.section === "needs_you" ? "info" : "neutral"}>
          {row.section === "needs_you" ? t("sectionNeedsYou") : t("sectionNeedsReview")}
        </Badge>
        <span className="font-medium text-card-foreground">{kindLabel}</span>
        {row.high_stakes ? <Badge tone="error">{t("highStakes")}</Badge> : null}
        {/* 裁-17 ④ — the link lands on the tab that OWNS this row, not the workspace root
            (lib/firm/needs-you-links.ts holds the map and the both-ways rule behind it). The
            LABEL follows the destination: a row that opens a specific tab says so, and one
            that can only offer the workspace root still says "open the client" rather than
            promising a tab it is not taking you to. */}
        {href ? (
          <Link href={href} className="text-xs text-primary underline-offset-4 hover:underline">
            {hasOwningTab(row) ? t(`openTab.${row.row_kind}`) : t("openClient")}
          </Link>
        ) : null}
        {/* 裁-17 ④ — "ask Clara about this": the row's own context handed to the rail, which
            seeds the composer and focuses it. It never sends — sending stays the human's act
            (lib/command/bus.ts's contract) — and it carries only fields THIS row already
            renders, so nothing is disclosed to the composer that was not on screen. */}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => focusRail({ query: askPrefill, source: "inbox" })}
        >
          {t("askClara")}
        </Button>
      </div>
      {row.question_text ? <p className="text-card-foreground">{row.question_text}</p> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {row.amount_cents != null ? (
          <>
            <dt>{t("amountLabel")}</dt>
            <dd>{fmtCents(row.amount_cents, tc("centsUnsafe"))}</dd>
          </>
        ) : null}
        {row.period ? (
          <>
            <dt>{t("periodLabel")}</dt>
            <dd>{row.period}</dd>
          </>
        ) : null}
      </dl>
      {Affordance ? <Affordance row={row} busy={busy} error={error} act={onAct} /> : null}
    </li>
  );
}
