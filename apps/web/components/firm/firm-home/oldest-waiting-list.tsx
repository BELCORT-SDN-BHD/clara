"use client";

// "Oldest waiting" — the top-N triage rows on Firm Home, LINK-ONLY.
//
// THE TWO QUEUE RENDERINGS ARE DIFFERENT ON PURPOSE (the orchestrator's decision 3, 裁-190).
// Firm Home is a DISPATCHER across every client: its job is to say what has waited longest and
// send the human to the surface that owns the verb, so these rows carry a link and nothing
// else. The client workspace's Home tab is that ONE client's inbox, so it renders the full
// `NeedsYouRow` with its inline Resolve/Dismiss. Same rows, same envelope, two altitudes — an
// inline act here would be a second place to settle a question, which is precisely the
// duplicated-control shape `needs-you-row.tsx`'s own header rules out.
//
// `aged_since` AND `high_stakes` ARE THE EARNED SIGNAL. Both columns are read by
// `clara.list_review_queue` today and (on this checkout's `needs-you-row.tsx`) rendered
// NOWHERE — the map's item E-1 calls them out as free signal. "Waited longest" is the only
// ordering an inbox can offer that a human cannot get by scrolling, so it is what this list is.
//
// THE AGE LABEL SAYS "WAITING", NEVER "DUE". This queue ships no deadline column at all
// (`clara.statutory_deadlines` is live-empty with no grant and no verb — `NeedsYou.
// statutoryDeadlinesNotBuilt` says so in the product's own words), so a "due in N days" here
// would be a date this build invented.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/parts/PartBadge";
import { businessDateTime } from "@/lib/business-date";
import { ageInDays } from "@/lib/firm/home-facts";
import { isKnownReviewQueueRowKind, reviewQueueRowKey, type ReviewQueueRow } from "@/lib/firm/needs-you";
import { hasOwningTab, needsYouRowHref } from "@/lib/firm/needs-you-links";
import { shortId } from "@/lib/registers/money";

export function OldestWaitingList({
  rows,
  clientNames,
}: {
  rows: readonly ReviewQueueRow[];
  /** client_id -> the client's own name, merged by the caller from `loadClientRegister`. A
   *  missing entry means the register has not loaded (or carries no row this session can see);
   *  the row then shows the short id, never a name this build guessed. */
  clientNames: ReadonlyMap<string, string>;
}) {
  const t = useTranslations("NeedsYou");
  const th = useTranslations("FirmHome");

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        // The SAME checked lookup needs-you-row.tsx uses (lib/firm/needs-you.ts's closed world),
        // never a `t(\`rowKind.${x}\` as ...)` cast — a cast compiles clean and ships a raw
        // next-intl key path to a professional.
        const kindLabel = isKnownReviewQueueRowKind(row.row_kind)
          ? t(`rowKind.${row.row_kind}`)
          : t("rowKind.unknown", { kind: row.row_kind });
        const href = needsYouRowHref(row);
        const days = ageInDays(row.aged_since);
        const clientLabel =
          row.client_id === null
            ? null
            : (row.client_name ?? clientNames.get(row.client_id) ?? shortId(row.client_id));

        return (
          <li
            key={reviewQueueRowKey(row)}
            className="enter-content flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={row.section === "needs_you" ? "info" : "neutral"}>
                {row.section === "needs_you" ? t("sectionNeedsYou") : t("sectionNeedsReview")}
              </Badge>
              <span className="font-medium text-card-foreground">{kindLabel}</span>
              {row.high_stakes ? <Badge tone="error">{t("highStakes")}</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {clientLabel === null ? th("clientFirmWide") : clientLabel}
              {row.aged_since ? (
                <>
                  {" · "}
                  <span title={businessDateTime(row.aged_since)}>
                    {days === null ? businessDateTime(row.aged_since) : days === 0 ? th("ageToday") : th("ageDays", { days })}
                  </span>
                </>
              ) : null}
            </p>
            {/* The ONE affordance a dispatcher row carries: where this item is settled. The
                label follows the destination — a row that can only offer the workspace root
                says so rather than promising a tab it is not taking you to. */}
            {href ? (
              <Link href={href} className="text-xs text-primary underline-offset-4 hover:underline">
                {hasOwningTab(row) ? t(`openTab.${row.row_kind}`) : t("openClient")}
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
