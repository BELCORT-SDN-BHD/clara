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
    if (rel === "lib/business-date.ts" || rel === "lib/registers/business-date.ts") continue; // sanctioned
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
