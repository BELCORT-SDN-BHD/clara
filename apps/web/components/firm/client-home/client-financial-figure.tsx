"use client";

// #660 — the two presentational pieces the money faces share: the comparison line, and the
// accessible name a figure carries.
//
// THEY LIVE IN ONE FILE BECAUSE THEY ARE ONE RULE. A number on this board is never allowed to
// appear without its period, and a change is never allowed to appear as a bare percentage. Two
// copies of that would be two chances to forget it.
//
// THE COMPARISON IS READ, NEVER COMPUTED. Every amount, percentage and sign change on this line
// came from `clara.get_client_financial_pack` (0232), which computes them once so the browser, a
// later report and #669's tiles cannot disagree about what "down 12%" means. A `-` anywhere in
// this file would be the bug.

import { useTranslations } from "next-intl";

import { CENTS_UNAVAILABLE, fmtCents } from "@/lib/registers/money";
import type { FigureGroup } from "@/lib/dashboard/financial-pack";

/** `2026-09-18` → `18 Sep 2026`. Built at UTC noon so no timezone can shift the DATE onto its
 *  neighbour — the value is a calendar day in Asia/Kuala_Lumpur, never an instant. */
export function formatDay(day: string | null): string {
  if (day === null) return CENTS_UNAVAILABLE;
  const parts = day.split("-");
  const y = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const d = Number(parts[2] ?? 0);
  if (!y || !m || !d) return day;
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * "Book cash RM 182,340.55 as at 18 Sep 2026" — the whole sentence, for the accessible name.
 *
 * A screen-reader user who hears only "182,340.55" cannot tell which period it is about, and this
 * board shows two periods at once (a balance at an as-of, a flow over an interval). The visible
 * number stays a number; the NAME carries the rest.
 */
export function figureAriaLabel(label: string, figure: FigureGroup, unsafeLabel: string): string {
  const amount = figure.valueCents === null
    ? CENTS_UNAVAILABLE
    : fmtCents(figure.valueCents, unsafeLabel);
  const asOf = figure.period?.asOf ?? null;
  return asOf === null ? `${label} ${amount}` : `${label} ${amount} as at ${formatDay(asOf)}`;
}

/**
 * The change line. THREE separate facts, each rendered only when the door supplied it:
 *
 *   · the amount of the change — always, when it exists;
 *   · the percentage — ONLY when the comparison amount was non-zero. A percentage against zero is
 *     not a number, so the door sends null and this renders "—" rather than 0 %, which would read
 *     as "no change" for a figure that went from nothing to something;
 *   · a PROFIT/LOSS TRANSITION — named in words, with both amounts, because a sign change is the
 *     one movement a percentage actively misdescribes (−1,000 → +500 is not "up 150%", it is a
 *     loss becoming a profit).
 */
export function FigureComparisonLine({ figure }: { figure: FigureGroup }) {
  const t = useTranslations("ClientFinancial");
  const tc = useTranslations("Common");
  const c = figure.comparison;
  if (c === null || figure.status === "unknown" || figure.status === "denied") return null;
  if (c.deltaCents === null && c.valueCents === null) return null;

  const delta = c.deltaCents === null ? CENTS_UNAVAILABLE : fmtCents(c.deltaCents, tc("centsUnsafe"));
  const prior = c.valueCents === null ? CENTS_UNAVAILABLE : fmtCents(c.valueCents, tc("centsUnsafe"));
  const pct = c.deltaPct === null ? CENTS_UNAVAILABLE : `${c.deltaPct}%`;

  return (
    <p className="text-xs text-muted-foreground" data-testid="client-money-comparison">
      {c.signChange
        ? t("comparison.signChange", { delta, prior })
        : t("comparison.line", { delta, pct, prior })}
      {c.period ? ` ${t("comparison.against", {
        start: formatDay(c.period.start), end: formatDay(c.period.end),
      })}` : null}
    </p>
  );
}
