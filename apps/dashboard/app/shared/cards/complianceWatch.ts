// Pure ComplianceWatchCard model (0016 §2.3 / WA21-R3) — no React, no DB. The card
// hydrates WITHOUT a network read (no get_compliance_watch fn exists in 0016): it
// renders from the queue row + the envelope's compliance.clients[] entry, matched
// here by client_id (+ the service_group parsed from the row's question_text, or the
// tier). Every figure the card shows is a DB-owned cents value — these helpers only
// SELECT and LABEL, never compute one.

import type { ComplianceClient } from "../reviewTypes";

export type TierTone = "alarm" | "warn" | "neutral";

/** The watch state → its banner label + tone. crossed/overdue are the alarm tier
 *  (they rank into needs_you, top of queue); early_warning warns; monitored/resolved
 *  are neutral. Reuses the queue band vocabulary — no new visual system. */
export function tierBand(state: string | null): { label: string; tone: TierTone } {
  switch (state) {
    case "crossed": return { label: "crossed", tone: "alarm" };
    case "overdue": return { label: "overdue", tone: "alarm" };
    case "early_warning": return { label: "early warning", tone: "warn" };
    case "monitored": return { label: "monitored", tone: "neutral" };
    case "resolved": return { label: "resolved", tone: "neutral" };
    default: return { label: state ?? "watch", tone: "neutral" };
  }
}

/** A resolved watch is terminal — the card renders inert. Defensive: the queue already
 *  filters resolved watches out, so this branch is not reachable from a live envelope. */
export function isTerminalState(state: string | null): boolean {
  return state === "resolved";
}

/** The statutory countdown (s.13(1)/s.13(3)) shows only once the threshold is crossed. */
export function showStatutoryCountdown(state: string | null): boolean {
  return state === "crossed" || state === "overdue";
}

/** UI-side rationale gate (the DB re-enforces). A mandatory rationale must be non-blank. */
export function ackEnabled(rationale: string): boolean {
  return rationale.trim().length > 0;
}

/** Parse the service group from the DB row's question_text
 *  'SST registration threshold watch (<group>)' → '<group>' (null when absent). */
export function parseServiceGroup(questionText: string | null): string | null {
  if (!questionText) return null;
  const m = /\(([^)]*)\)\s*$/.exec(questionText);
  const g = m && m[1] !== undefined ? m[1].trim() : "";
  return g.length > 0 ? g : null;
}

/** Match the envelope compliance entry for a row: by client_id, then prefer the parsed
 *  service_group, else the tier (state), else the first for that client. */
export function matchComplianceClient(
  clients: ComplianceClient[],
  key: { clientId: string | null; serviceGroup: string | null; tier: string | null },
): ComplianceClient | null {
  const pool = key.clientId != null ? clients.filter((c) => c.client_id === key.clientId) : [];
  if (pool.length === 0) return null;
  if (key.serviceGroup != null) {
    const g = pool.find((c) => c.service_group === key.serviceGroup);
    if (g) return g;
  }
  if (key.tier != null) {
    const t = pool.find((c) => c.state === key.tier);
    if (t) return t;
  }
  return pool[0] ?? null;
}

/** The three DB-computed screening figures, each paired with its statutory basis label
 *  (0016 §2.3). Order is fixed; a null client degrades every figure to null (— render). */
export function complianceFigures(client: ComplianceClient | null): { label: string; cents: number | null }[] {
  return [
    { label: "confirmed included turnover", cents: client?.confirmed_included_cents ?? null },
    { label: "unknown/mixed-classification turnover", cents: client?.unknown_or_mixed_cents ?? null },
    { label: "all-income screening proxy", cents: client?.screening_proxy_cents ?? null },
  ];
}

/** A snooze is bounded to 60 days (the DB refuses CLR10 past the cap). */
export const SNOOZE_CAP_DAYS = 60;

/** The UI offers 59, not 60. The date input yields a bare `yyyy-mm-dd` picked in
 *  BROWSER-LOCAL time, which Postgres casts to timestamptz at 00:00 in the SERVER
 *  zone, while the DB compares it against `now() + interval '60 days'` — a real
 *  instant. For a user ahead of the server (UTC+8 between 00:00 and 08:00 local) the
 *  exact-60th date lands past that instant and is refused CLR10. One day of slack
 *  keeps every date the UI can offer acceptable to the DB in any zone. */
export const SNOOZE_UI_CAP_DAYS = SNOOZE_CAP_DAYS - 1;

function isoDate(y: number, mZeroBased: number, day: number): string {
  const d = new Date(y, mZeroBased, day);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** The `max` attribute for the snooze date input (yyyy-mm-dd) — see SNOOZE_UI_CAP_DAYS. */
export function snoozeMaxDate(now: Date): string {
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate() + SNOOZE_UI_CAP_DAYS);
}

/** True when a chosen snooze date (yyyy-mm-dd) is strictly after today AND within the
 *  offered cap — the UI half of the DB's bounded-snooze guard. Shares SNOOZE_UI_CAP_DAYS
 *  with snoozeMaxDate so the gate and the input's `max` can never disagree. */
export function isSnoozeWithinCap(untilIso: string | null, now: Date): boolean {
  if (!untilIso) return false;
  const parts = untilIso.split("-");
  if (parts.length !== 3) return false;
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const da = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(da)) return false;
  const until = new Date(y, mo - 1, da).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate() + SNOOZE_UI_CAP_DAYS).getTime();
  return until > today && until <= max;
}

/** The typed resolve conclusions (0016 resolve_compliance_watch p_conclusion). */
export const RESOLVE_CONCLUSIONS = ["registration_recorded", "not_liable_documented"] as const;
export type ResolveConclusion = (typeof RESOLVE_CONCLUSIONS)[number];

/** The governed refusal badge text — the CLR code + reason token, VERBATIM. */
export function refusalLabel(clr: { code: string; reason: string | null }): string {
  return `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}`;
}

/** Which action produced the refusal — the hint below is action-specific. */
export type WatchAction = "ack" | "snooze" | "resolve";

/** A short human suffix for a governed refusal, or "" to show the verbatim badge alone.
 *
 *  CLR04 carries NO general hint: it is the GENERIC authorization refusal from
 *  `clara._human_ctx` (0004) — raised alike for no authenticated actor, no active
 *  membership, and insufficient role — and all three watch writers take the SAME
 *  bookkeeper floor (0016 ack/snooze/resolve). Advising "admin" there would be wrong
 *  for the common case (a viewer needs bookkeeper, not admin); the verbatim DB message
 *  is the honest guidance. The ONE admin floor is the `not_liable_documented` resolve
 *  (0016 — exemption-equivalent), hinted only against that exact action + conclusion.
 *
 *  CLR03 is unreachable from this card: the writers raise it only for a wake credential
 *  or an `is_agent` user, which a human dashboard JWT cannot produce. Kept as harmless
 *  defence-in-depth so an identity mix-up would still read honestly. */
export function refusalHint(code: string, action: WatchAction | null, conclusion: ResolveConclusion): string {
  if (code === "CLR04" && action === "resolve" && conclusion === "not_liable_documented") {
    return "A not-liable resolution requires admin.";
  }
  if (code === "CLR03") return "Human bookkeeper+ only.";
  return "";
}
