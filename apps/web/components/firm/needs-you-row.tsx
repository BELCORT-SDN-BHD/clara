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

// E-3 / CB-AE2E-026 (the owner: "Needs you — agent task 没有更多交互 and 细节").
// Every row now answers FOUR questions, in this order, and every answer is a
// column clara.list_review_queue ALREADY shipped and this row ALREADY read:
//   WHAT  the client's own name (merged client-side from loadClientRegister —
//         the same client-side join lib/firm/reads.ts:135-152 already sanctions,
//         never a join the DB does not offer) beside the row-kind label.
//   WHY   one derived sentence plus the flag chips, from `lane`/`auto`/
//         `rule_backed`/`tier` — four columns that were read and rendered
//         nowhere. The derivation and its full grounding live in
//         lib/firm/needs-you-row-facts.ts; this file only renders it.
//   NEXT  the owning-tab link the row already built, now labelled as the ACTION
//         it is rather than sitting unnamed among the badges.
//   WHEN  `aged_since` — also read and never rendered — as the instant AND a
//         plain "waiting N days". There is no deadline column on this queue, so
//         the label says "waiting since" and never "due".
// `period` no longer renders under the bare word "period": it meant three
// different things (posting date / invoice date / watch window end) under one
// label, and now carries the per-kind label its own row_kind earns.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/parts/PartBadge";
import { fmtCents, shortId } from "@/lib/registers/money";
import { Button } from "@/components/ui/button";
import { businessDateTime } from "@/lib/business-date";
import { focusRail } from "@/lib/command/bus";
import { isKnownReviewQueueRowKind, type ReviewQueueRow } from "@/lib/firm/needs-you";
import {
  reviewQueuePeriodKind,
  reviewQueueTier,
  reviewQueueWhyChips,
  reviewQueueWhyKey,
  waitingDays,
} from "@/lib/firm/needs-you-row-facts";
import { hasOwningTab, needsYouRowHref } from "@/lib/firm/needs-you-links";
import { getNeedsYouAffordance } from "./needs-you-affordances";

export function NeedsYouRow({
  row,
  clientName,
  busy,
  error,
  onAct,
}: {
  row: ReviewQueueRow;
  /** The client's own NAME, merged by the caller from the firm-wide client
   *  register. `null` means the register has not loaded or carries no row for
   *  this id — the row then falls back to the short id, never a guessed name.
   *  A row with no `client_id` at all is firm-wide and says so. */
  clientName: string | null;
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

  // WHAT — the client. `row.client_name` is projected by the RPC on
  // seeding_proposal rows only (needs-you.ts:198-200); everywhere else the name
  // comes from the caller's register merge. Neither present means the id, short
  // and honest — never a name this build inferred.
  const clientLabel = row.client_id === null
    ? t("clientFirmWide")
    : (row.client_name ?? clientName ?? t("clientUnnamed", { id: shortId(row.client_id) }));

  // WHY — one sentence chosen by the DB's own classification, plus the chips.
  const whyKey = reviewQueueWhyKey(row);
  const whyChips = reviewQueueWhyChips(row);
  const tier = reviewQueueTier(row);

  // WHEN — the instant, plus a plain age. Both from `aged_since` alone.
  const days = waitingDays(row.aged_since);

  // PERIOD — labelled by the kind that owns the value, or generically when the
  // kind is outside the three that have a per-kind meaning.
  const periodKind = reviewQueuePeriodKind(row.row_kind);
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
        {/* WHAT, second half: the client this row is about. On a CROSS-CLIENT
            queue this is the single most load-bearing field, and until this
            train `client_id` was used only to build an href. */}
        <span className="text-xs text-muted-foreground">
          {t("clientLabel")}: <span className="text-card-foreground">{clientLabel}</span>
        </span>
        {row.high_stakes ? <Badge tone="error">{t("highStakes")}</Badge> : null}
        {/* `tier` is the watch STATE or the finding SEVERITY depending on the
            row kind — two vocabularies on one column, so the label is looked up
            by the PAIR and an unknown value renders as its own raw text. */}
        {tier ? (
          <Badge tone="neutral">
            {"key" in tier ? t(`tier.${tier.key}`) : t("tierRaw", { value: tier.raw })}
          </Badge>
        ) : null}
      </div>
      {row.question_text ? <p className="text-card-foreground">{row.question_text}</p> : null}
      {/* WHY — the derived sentence, then the flags that produced it. The
          sentence is chosen from the DB's own `lane`/`section`; the chips are
          columns that are TRUE. Neither invents a reason the row did not carry. */}
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-card-foreground">{t("whyLabel")}:</span> {t(`why.${whyKey}`)}
        </p>
        {whyChips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {whyChips.map((chip) => (
              <Badge key={chip} tone="neutral">
                {t(`whyChip.${chip}`)}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {row.amount_cents != null ? (
          <>
            <dt>{t("amountLabel")}</dt>
            <dd>{fmtCents(row.amount_cents, tc("centsUnsafe"))}</dd>
          </>
        ) : null}
        {row.period ? (
          <>
            <dt>{periodKind ? t(`periodLabelFor.${periodKind}`) : t("periodLabel")}</dt>
            <dd>{row.period}</dd>
          </>
        ) : null}
        {/* WHEN — `aged_since`, read since the first cut and rendered nowhere.
            The instant is the DB's; the day count is arithmetic over it, and it
            says WAITING, never DUE: this queue ships no deadline column. */}
        {row.aged_since ? (
          <>
            <dt>{t("whenLabel")}</dt>
            <dd>
              {businessDateTime(row.aged_since)}
              {days === null ? null : <> · {t("waitingDays", { days })}</>}
            </dd>
          </>
        ) : null}
      </dl>
      {/* NEXT — 裁-17 ④'s link, unchanged in destination and now NAMED as the
          action it is. The label still follows the destination: a row that opens
          a specific tab says so; one that can only offer the workspace root says
          "open the client" rather than promising a tab it is not taking you to. */}
      <div className="flex flex-wrap items-center gap-2">
        {href ? (
          <>
            <span className="text-xs font-medium text-card-foreground">{t("nextLabel")}:</span>
            <Link href={href} className="text-xs text-primary underline-offset-4 hover:underline">
              {hasOwningTab(row) ? t(`openTab.${row.row_kind}`) : t("openClient")}
            </Link>
          </>
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
      {Affordance ? <Affordance row={row} busy={busy} error={error} act={onAct} /> : null}
    </li>
  );
}
