"use client";

// N9 (independent review): route posting_date rendering through next-intl's
// `useFormatter().dateTime` instead of printing the raw ISO string. `journal_
// entries.posting_date` is a plain calendar date (`date` column, no time
// component) — parsed here as UTC MIDNIGHT and formatted with `timeZone:
// "UTC"` explicitly, so the CALENDAR DAY the DB recorded never shifts because
// a viewer's browser happens to sit in a different timezone (a naive `new
// Date("2026-01-01")` formatted in the viewer's LOCAL zone can render as
// 2025-12-31 for anyone west of UTC — exactly the class of bug lib/business-
// date.ts exists to prevent on the WRITE side; this is the READ-side twin).

import { useFormatter } from "next-intl";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

export function FormattedDate({ value }: { value: string | null }) {
  const format = useFormatter();
  if (!value) return <>—</>;
  const m = DATE_ONLY.exec(value);
  if (!m) return <>{value}</>;
  const [, y, mo, d] = m;
  const utcMidnight = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return <>{format.dateTime(utcMidnight, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</>;
}

/**
 * The TIMESTAMPTZ twin — a SEPARATE component, deliberately, rather than a
 * widening of `FormattedDate` (H-32).
 *
 * `FormattedDate` above exists to pin a CALENDAR DAY: it regex-matches the
 * leading YYYY-MM-DD, rebuilds UTC midnight and formats in UTC so a `date`
 * column never shifts a day under a viewer west of UTC. Applied to a
 * `timestamptz` that is exactly wrong twice over — it DISCARDS the time of
 * day, and it reports the instant in UTC rather than where the reader is. It
 * was doing both to `agent_interruptions.expires_at`
 * (packages/db/migrations/0006_runtime_core.sql:203, the 14-day clarify
 * deadline), so a deadline rendered as a bare "Sep 17, 2026".
 *
 * An instant is formatted in the VIEWER'S OWN zone with the time shown,
 * because that is the question a deadline answers ("have I still got today?").
 * `Date.parse` handles the ISO-8601 offset PostgREST returns; an
 * unparseable value renders verbatim rather than as a fabricated date, the
 * same fail-closed arm `FormattedDate` takes.
 */
export function FormattedDateTime({ value }: { value: string | null }) {
  const format = useFormatter();
  if (!value) return <>—</>;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return <>{value}</>;
  return (
    <>
      {format.dateTime(new Date(ms), {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </>
  );
}
