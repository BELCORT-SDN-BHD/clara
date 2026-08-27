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
