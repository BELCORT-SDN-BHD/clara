// lib/business-date.ts — the one-clock law, ported from apps/dashboard's
// businessDate.test.ts (its own header: "EVERY CELL HERE FAILS ON THE OLD
// CODE"). FIX-4 (independent review): compose-dialog.tsx's posting-date default
// used to be `new Date().toISOString().slice(0, 10)` — the browser's UTC date,
// wrong for 8 hours a day in Malaysia.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { businessDate, businessToday, CLARA_BUSINESS_TIMEZONE } from "./business-date";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".open-next" || entry === ".wrangler") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

test("no apps/web file originates a date from the browser's UTC clock", () => {
  const forbidden = /new\s+Date\s*\([^)]*\)\s*\.toISOString\s*\(\s*\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)/;
  const offenders: string[] = [];
  for (const file of walkTs(APP_DIR)) {
    const rel = relative(APP_DIR, file).split("\\").join("/");
    if (rel === "lib/business-date.ts") continue; // sanctioned — the ONE canonical copy (P3 fold)
    if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue; // fixtures, not production defaults
    const src = readFileSync(file, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
      if (forbidden.test(line)) offenders.push(`${rel}:${i + 1}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these files take the BROWSER's UTC date — between 00:00 and 08:00 MYT that is the wrong day.\n" +
      `Import businessToday() from lib/business-date.ts instead:\n  ${offenders.join("\n  ")}`,
  );
});

test("no apps/web file renders a DATE or TIME through the viewer's own locale", () => {
  // THE SECOND HALF OF THE SAME LAW, and the one the guard above could not see.
  //
  // `businessDate` defends the ORIGINATION of a date (the browser's UTC clock
  // as a query argument). This defends its RENDERING: `.toLocaleDateString()`
  // and `.toLocaleTimeString()` format in the VIEWER's timezone, so a reviewer
  // outside UTC+8 reads a filing date, an approval time or a receipt that can
  // disagree with the DB's own business day by one — the "two machines, two
  // days" hazard `businessDateTime`'s own header (N11) names. Two live
  // offenders were found by hand on the documents tab
  // (`filed-document-list.tsx:61`, `document-filings-history.tsx:63`) after the
  // guard above had been green for weeks, because it only ever matched the
  // origination idiom.
  //
  // `toLocaleString` on a NUMBER is untouched and must stay so: it is how every
  // money and byte-count formatter in this app groups thousands
  // (`lib/journals/balance.ts`, `lib/registers/money.ts`,
  // `components/reports/ArtifactRow.tsx`). Only the two DATE-only methods, plus
  // `toLocaleString` applied directly to a `new Date(...)`, are forbidden.
  const forbidden = [
    /\.toLocaleDateString\s*\(/,
    /\.toLocaleTimeString\s*\(/,
    /new\s+Date\s*\([^)]*\)\s*\.toLocaleString\s*\(/,
  ];
  const offenders: string[] = [];
  for (const file of walkTs(APP_DIR)) {
    const rel = relative(APP_DIR, file).split("\\").join("/");
    if (rel === "lib/business-date.ts") continue; // sanctioned — the ONE canonical copy
    if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue; // fixtures, not production output
    const src = readFileSync(file, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      if (forbidden.some((re) => re.test(line))) offenders.push(`${rel}:${i + 1}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these files render a date or time in the VIEWER's timezone — two reviewers in two timezones read different days.\n" +
      `Import businessDate()/businessDateTime() from lib/business-date.ts instead:\n  ${offenders.join("\n  ")}`,
  );
});

test("VACUITY CONTROL: the date-rendering guard's patterns match the idiom they forbid, and spare the money one", () => {
  // Without this the cell above passes identically against a regex that matches
  // nothing — the exact way the origination guard stayed green while two
  // rendering offenders sat in components/documents/.
  const forbidden = [
    /\.toLocaleDateString\s*\(/,
    /\.toLocaleTimeString\s*\(/,
    /new\s+Date\s*\([^)]*\)\s*\.toLocaleString\s*\(/,
  ];
  const matches = (line: string) => forbidden.some((re) => re.test(line));

  assert.equal(matches("{new Date(filing.filed_at).toLocaleDateString()}"), true, "the exact removed offender must match");
  assert.equal(matches("d.toLocaleTimeString()"), true);
  assert.equal(matches("new Date(x).toLocaleString()"), true);

  assert.equal(matches('(cents / 100).toLocaleString("en-MY")'), false, "money grouping must NOT be caught");
  assert.equal(matches("custody.byte_size.toLocaleString()"), false, "a byte count must NOT be caught");
  assert.equal(matches("businessDateTime(filing.filed_at)"), false, "the sanctioned replacement must NOT be caught");
});

test("the business timezone is the one clara._book_today() books in", () => {
  assert.equal(CLARA_BUSINESS_TIMEZONE, "Asia/Kuala_Lumpur");
});

test("[the defect] an instant inside the 00:00-08:00 MYT window is TOMORROW in UTC terms", () => {
  const instant = new Date("2026-08-02T17:30:00Z"); // 2026-08-03 01:30 MYT
  assert.equal(instant.toISOString().slice(0, 10), "2026-08-02", "the old, wrong default");
  assert.equal(businessDate(instant), "2026-08-03", "the actual MYT business date");
});

test("an afternoon-MYT instant agrees with UTC — the fix changes only the window that was wrong", () => {
  assert.equal(businessDate(new Date("2026-08-03T06:00:00Z")), "2026-08-03"); // 14:00 MYT
});

test("businessToday returns a well-formed ISO date", () => {
  assert.match(businessToday(), /^\d{4}-\d{2}-\d{2}$/);
});
