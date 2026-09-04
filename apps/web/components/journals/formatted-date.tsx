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
 *
 * IT PINS NO `timeZone` ON PURPOSE, and the asymmetry with its sibling above is
 * the point rather than an oversight. `FormattedDate` pins UTC because a `date`
 * column has no instant to place — the zone is the very thing that would
 * corrupt it. An instant DOES have one, and the correct zone for a deadline is
 * the reader's, which is what `useFormatter` resolves from the ambient
 * environment when no override is given.
 *
 * There is no hydration hazard in leaving it ambient here. Every caller is a
 * client component whose data arrives from a browser-side read — the journals
 * workbench's own hydration cycle — so the server render that Next ships has no
 * row to format and this component is first reached AFTER hydration, in the
 * viewer's own environment. A `timeZone` pinned in `i18n/request.ts` would fix
 * one zone for the WHOLE product, including every `FormattedDate` and every
 * other surface's dates, which is a product-wide decision and a much larger
 * blast radius than this component's own question.
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
