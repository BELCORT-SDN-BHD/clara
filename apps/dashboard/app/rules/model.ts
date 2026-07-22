// Pure helpers for the autopost-rule management surface (contract §6 / §7). No DB, no
// React — unit-testable. The UI computes NO financial number here: bound amounts come
// from the DB (fmtCents at the render layer); these helpers only classify lifecycle
// urgency by DATE (a renew-or-retire nudge is a date comparison, WA2-R10) and shape
// human copy. The hard expiry itself is a DB bound — this is only the visible nudge.

import type { AutopostRule } from "../shared/reviewCardTypes";

export type RuleUrgency = "proposed" | "live" | "expiring" | "expired" | "terminal";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days from `now` until `expiresAt` (negative once past). `null` when unparseable. */
export function daysUntil(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY_MS);
}

/** True when a LIVE rule is within `withinDays` of its hard expiry (or already past) —
 *  the ¾-term renew-or-retire nudge surface (WA2-R10 default nudge at 9 months). */
export function isExpiringSoon(rule: AutopostRule, now: Date, withinDays = 30): boolean {
  if (rule.status !== "live") return false;
  const d = daysUntil(rule.expires_at, now);
  return d !== null && d <= withinDays;
}

/** Lifecycle band for a rule (shape + label, never hue-only — DIRECTION §3). */
export function ruleUrgency(rule: AutopostRule, now: Date): RuleUrgency {
  if (rule.status === "proposed") return "proposed";
  if (rule.status === "live") {
    const d = daysUntil(rule.expires_at, now);
    if (d !== null && d < 0) return "expired";
    if (d !== null && d <= 30) return "expiring";
    return "live";
  }
  return "terminal"; // retired | declined | expired-terminal
}

/** A human summary of the count bound, e.g. `≤3 posts / monthly`. Pure string. */
export function windowLabel(rule: AutopostRule): string {
  const n = rule.window_max_posts;
  const w = rule.frequency_window;
  if (n === null && !w) return "no window bound";
  return `≤${n ?? "?"} posts${w ? ` / ${w}` : ""}`;
}

/** How many posts remain in the current window — read STRAIGHT from the DB
 *  (`list_autopost_rules` emits `posts_remaining`). The UI does not recompute it: the DB
 *  owns every number, counts included, so the window arithmetic stays in one place and
 *  can't drift from the DB's own definition. `null` when the DB did not supply it. */
export function postsRemaining(rule: AutopostRule): number | null {
  return rule.posts_remaining;
}

/** Whether a rule can be signed live (proposed only — admin+ enforced in the DB). */
export function canSign(rule: AutopostRule): boolean {
  return rule.status === "proposed";
}

/** Whether a rule can be retired (proposed or live — terminal rows are inert). */
export function canRetire(rule: AutopostRule): boolean {
  return rule.status === "proposed" || rule.status === "live";
}
