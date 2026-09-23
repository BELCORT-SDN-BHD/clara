// #864 — THE BUDGET ROLLOUT, HELD BY A CELL INSTEAD OF A SENTENCE.
//
// #706 wrote the shared vocabulary — `CELL_BUDGET`, `cellBudgetMs`, `grantCellBudget` — in
// `helpers.ts` for exactly one reason: a walk that signs in, polls or scans states its own cost in
// ONE place instead of guessing a number. Playwright's config sets no per-test timeout, so without
// that vocabulary every cell in this suite gets the same flat 30 s no matter how much work it does,
// and a cell that does more than 30 s of work under host load fails as a TIMEOUT, which reads as a
// product defect and is not one.
//
// WHAT THIS FILE HOLDS, and what it learned from its own first cut (review findings SPEC-864-A,
// SPEC-864-B, STD-1, 2026-09-23). The first cut held two narrow rules: a custom timeout must be
// built from `cellBudgetMs`, and a file with NO shared sign-in must budget a cell that calls a
// helper literally named `scan(` twice or more. Both halves of that second rule were too small to
// hold the ticket's own words ("every spec file that signs in, polls or runs a full-page scan
// calls `test.setTimeout(cellBudgetMs(...))` or `grantCellBudget` sized to its own work"):
//
//   - The token. `signup-confirm-pending.spec.ts` names its scan helper `expectAccessible(`, runs
//     three of them in one cell, signs in nowhere and declares no budget anywhere — the exact shape
//     the rule existed for, invisible to a detector that only matched `scan(`. Fifteen more files
//     name theirs `expectAccessible(` too. This file now resolves every scan by following calls to
//     the real scanner (`.analyze(`), whatever the local wrapper is called.
//   - The exemption. "A file that signs in anywhere has `CELL_BUDGET.signIn`'s 20 s floor under
//     every cell" exempted 45 of the 50 files by construction, and a sign-in grant is not headroom
//     for a SCAN in any case: it is priced for the sign-in it pays for. The rule is now per cell and
//     per unit of work, over every file.
//   - The verb the census never looked at. Polls were in the ticket's own list and in no rule.
//
// The arithmetic below is therefore the whole budget, stated once: a cell's ceiling is the flat
// base, PLUS `CELL_BUDGET.signIn` for every shared sign-in it reaches (granted inside `signInTo`),
// PLUS `CELL_BUDGET.scan` for every settled scan it reaches (granted inside `settleForScan`), PLUS
// whatever the cell declares for itself. Its need is the same sum computed from the work it
// actually does. A cell whose need outruns its ceiling is an offender, and the offence names the
// missing term.
//
// A NOTE ON WHERE A DECLARATION GOES. `test.setTimeout()` REPLACES the cell's timeout, so a
// declaration belongs at the TOP of the cell, before any helper grant it would otherwise discard;
// `grantCellBudget()` is additive and may appear anywhere, including inside a helper.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  E2E_DIR,
  callCount,
  functionBodies,
  functionBody,
  specFiles,
  stripComments,
  testCells,
  transitiveAmount,
} from "./spec-census";

/**
 * `CELL_BUDGET`'s own prices, read out of `helpers.ts` rather than re-typed here. A census that
 * carried its own copy of 35_000 would keep reporting green after the price it prices against
 * moved — and the two numbers would then disagree with nothing noticing, which is the whole class
 * of defect this file exists to catch.
 */
export function cellBudgetPrices(helpersSource: string): { base: number; poll: number; scan: number; signIn: number } {
  const read = (key: string): number => {
    const m = new RegExp(String.raw`\b${key}\s*:\s*([0-9_]+)`).exec(helpersSource);
    assert.ok(m, `helpers.ts's CELL_BUDGET must declare a numeric ${key}`);
    return Number(m![1]!.replaceAll("_", ""));
  };
  return { base: read("base"), poll: read("poll"), scan: read("scan"), signIn: read("signIn") };
}

/** A balanced-paren read of a call's own argument list, given the index of its opening `(`. Used
 *  for `test.setTimeout(`, `test.describe.configure(`, `cellBudgetMs(` and `grantCellBudget(`,
 *  which is why this takes the paren index rather than assuming one shape. */
function callArgs(source: string, openParenIndex: number): string {
  let depth = 1;
  let i = openParenIndex + 1;
  for (; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(openParenIndex + 1, i);
}

/**
 * Every custom per-cell or per-group timeout call in the file, as its own raw argument text — the
 * two shapes `README.md`'s `CELL_BUDGET` section names ("Use `test.setTimeout(cellBudgetMs(...))`
 * at the top of a cell... and `grantCellBudget(CELL_BUDGET.x)` inside a shared helper"), plus the
 * describe-level shape two files predating the vocabulary actually used.
 */
function customTimeoutCalls(source: string): string[] {
  const calls: string[] = [];
  for (const m of source.matchAll(/\btest\.setTimeout\(/g)) {
    calls.push(callArgs(source, m.index + m[0].length - 1));
  }
  for (const m of source.matchAll(/\btest\.describe\.configure\(\s*\{[^}]*\btimeout\b/g)) {
    const openParen = source.indexOf("(", m.index + "test.describe.configure".length);
    calls.push(callArgs(source, openParen));
  }
  return calls;
}

/** Every custom timeout call that does NOT route through `cellBudgetMs(...)` — a bare literal or a
 *  hand-rolled formula, exactly the shape `a11y-finish-walk.spec.ts` and
 *  `counterparty-identity-walk.spec.ts` predated the shared vocabulary with. */
export function hardcodedTimeouts(source: string): string[] {
  return customTimeoutCalls(source).filter((args) => !args.includes("cellBudgetMs("));
}

/** The local name a file gave a shared import, alias included (`signIn as sharedSignIn`,
 *  `members-invite-walk.spec.ts`'s own shape). */
export function importedAs(source: string, exported: string[]): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\/helpers["']/g)) {
    for (const part of m[1]!.split(",")) {
      const [imported, local] = part.trim().split(/\s+as\s+/).map((s) => s.trim());
      if (imported && exported.includes(imported)) names.push((local ?? imported)!);
    }
  }
  return names;
}

/** Every explicit wait this text declares that is long enough to be a fixture POLL rather than an
 *  ordinary assertion retry — `{ timeout: 15_000 }` and friends. The floor is deliberate: a bare
 *  `expect()`'s own 5 s default is what the flat base is for, and pricing it as a poll would make
 *  every cell in the suite an offender without measuring anything. */
const POLL_FLOOR_MS = 10_000;
function ownPollMs(text: string): number {
  let total = 0;
  for (const m of text.matchAll(/\btimeout\s*:\s*([0-9_]+)/g)) {
    const ms = Number(m[1]!.replaceAll("_", ""));
    if (ms >= POLL_FLOOR_MS) total += ms;
  }
  return total;
}

/** What a `cellBudgetMs({...})`/`grantCellBudget(...)` call site inside this text declares, in
 *  units. A `polls:`/`scans:` argument that is not a plain number is reported as `unreadable` —
 *  never silently trusted, and never silently counted as zero either. */
type Declared = { polls: number; scans: number; unreadable: string[] };
function ownDeclared(text: string, prices: { poll: number; scan: number }): Declared {
  const declared: Declared = { polls: 0, scans: 0, unreadable: [] };
  for (const m of text.matchAll(/\bcellBudgetMs\(/g)) {
    const args = callArgs(text, m.index + m[0].length - 1);
    for (const key of ["polls", "scans"] as const) {
      const hit = new RegExp(String.raw`\b${key}\s*:\s*([^,}]+)`).exec(args);
      if (!hit) continue;
      const raw = hit[1]!.trim();
      if (/^[0-9_]+$/.test(raw)) declared[key] += Number(raw.replaceAll("_", ""));
      else declared.unreadable.push(`${key}: ${raw}`);
    }
  }
  for (const m of text.matchAll(/\bgrantCellBudget\(/g)) {
    const args = callArgs(text, m.index + m[0].length - 1);
    for (const g of args.matchAll(/CELL_BUDGET\.(poll|scan)\b(?:\s*\*\s*([0-9_]+))?/g)) {
      const times = g[2] ? Number(g[2].replaceAll("_", "")) : 1;
      if (g[1] === "poll") declared.polls += times;
      else declared.scans += times;
    }
    void prices;
  }
  return declared;
}

export type CellGap = {
  file: string;
  line: number;
  title: string;
  /** What the cell is short of, in the vocabulary a fix is written in. */
  missing: string;
};

/**
 * Every cell in one spec file whose own work outruns the ceiling it can name.
 *
 * Work and headroom are both counted TRANSITIVELY: a cell that calls a local helper three times
 * pays that helper's cost three times, and is granted whatever that helper grants three times. A
 * census that read only the cell's own text would price a file like `interview-walk.spec.ts` — whose
 * waits live almost entirely inside its own local helpers — at nearly zero.
 */
export function cellBudgetGaps(file: string, source: string, helpersSource: string): CellGap[] {
  const prices = cellBudgetPrices(helpersSource);
  const stripped = stripComments(source);
  const bodies = functionBodies(stripped);
  const settleNames = importedAs(stripped, ["settleForScan"]);

  const scansOf = (text: string): number =>
    transitiveAmount(text, bodies, (body) => (body.match(/\.analyze\(/g) ?? []).length);
  const settlesOf = (text: string): number =>
    transitiveAmount(text, bodies, (body) => settleNames.reduce((n, name) => n + callCount(body, name), 0));
  const pollMsOf = (text: string): number => transitiveAmount(text, bodies, ownPollMs);
  const declaredOf = (text: string): Declared => {
    const totals: Declared = { polls: 0, scans: 0, unreadable: [] };
    // `grantCellBudget` is additive and may sit inside a helper, so it is counted transitively;
    // `cellBudgetMs` is read at the cell's own level, where the `test.setTimeout` that consumes it
    // is written.
    const own = ownDeclared(text, prices);
    const granted = transitiveAmount(text, bodies, (body) => ownDeclared(body, prices).polls) - own.polls;
    const grantedScans = transitiveAmount(text, bodies, (body) => ownDeclared(body, prices).scans) - own.scans;
    totals.polls = own.polls + granted;
    totals.scans = own.scans + grantedScans;
    totals.unreadable = own.unreadable;
    return totals;
  };

  const gaps: CellGap[] = [];
  for (const cell of testCells(stripped)) {
    const scans = scansOf(cell.body);
    const settles = settlesOf(cell.body);
    const pollMs = pollMsOf(cell.body);
    const declared = declaredOf(cell.body);
    const where = { file, line: cell.line, title: cell.title };

    if (declared.unreadable.length > 0) {
      gaps.push({ ...where, missing: `a readable budget — ${declared.unreadable.join(", ")} is not a plain number this census can size` });
      continue;
    }
    const scanShortfall = scans - settles - declared.scans;
    if (scanShortfall > 0) {
      gaps.push({
        ...where,
        missing: `${scanShortfall} scan grant(s): it runs ${scans} accessibility scan(s) but only ${settles} settle(s) through the shared helper and declares ${declared.scans}. Settle each scan through settleForScan(page), or add test.setTimeout(cellBudgetMs({ scans: ${scans} })) at the top of the cell`,
      });
      continue;
    }
    const grantedPollMs = declared.polls * prices.poll;
    if (pollMs >= prices.base && grantedPollMs < pollMs) {
      const needed = Math.ceil(pollMs / prices.poll);
      gaps.push({
        ...where,
        missing: `a poll budget: its own explicit waits total ${pollMs} ms — more than the whole ${prices.base} ms base — and it declares ${grantedPollMs} ms. Add test.setTimeout(cellBudgetMs({ polls: ${needed} })) at the top of the cell`,
      });
    }
  }
  return gaps;
}

function helpersSource(): string {
  return stripComments(readFileSync(join(E2E_DIR, "helpers.ts"), "utf8"));
}

function describeGaps(gaps: CellGap[]): string {
  return gaps.map((g) => `  - ${g.file}:${g.line} "${g.title}" needs ${g.missing}`).join("\n");
}

test("#864 · no spec file's custom timeout is a hand-rolled number — every one is built from cellBudgetMs", () => {
  const files = specFiles();
  // The floor `sign-in-census.test.ts` already measured and named (48 at `dd3f8f1d`); a census that
  // silently saw zero files would pass every assertion below.
  assert.ok(files.length >= 46, `the census must actually see the suite (found ${files.length} spec files)`);

  const offenders: Record<string, string[]> = {};
  for (const name of files) {
    const hardcoded = hardcodedTimeouts(readFileSync(join(E2E_DIR, name), "utf8"));
    if (hardcoded.length > 0) offenders[name] = hardcoded;
  }

  assert.deepEqual(
    offenders,
    {},
    `these spec files set a custom timeout that is not built from cellBudgetMs:\n${JSON.stringify(offenders, null, 2)}\n` +
      `Route the number through cellBudgetMs({ polls, scans, signIns }) (helpers.ts), sized to what the cell — or, for a describe-level call, its heaviest cell — actually does.`,
  );
});

test("#864 · the shared helpers GRANT what they cost — a name in this census is not a budget", () => {
  // THE LOAD-BEARING LINK. Every rule below prices a cell's automatic headroom from the shared
  // helpers it reaches: `signInTo` is worth `CELL_BUDGET.signIn`, `settleForScan` is worth
  // `CELL_BUDGET.scan` (a settle is this suite's one spelling of "a scan is about to run here" —
  // `settle-before-scan-census.test.ts` holds that every scan has one). If either helper stopped
  // granting, this census would go on reporting green about headroom that no longer exists, which
  // is the exact failure mode review finding SPEC-864-A named in this file's first cut.
  const helpers = helpersSource();
  for (const [fn, unit] of [
    ["signInTo", "CELL_BUDGET.signIn"],
    ["settleForScan", "CELL_BUDGET.scan"],
  ] as const) {
    const body = functionBody(helpers, fn);
    assert.ok(body, `helpers.ts must declare ${fn}(...) — this census prices every cell from it`);
    assert.ok(
      body!.includes(`grantCellBudget(${unit})`),
      `helpers.ts's ${fn} must call grantCellBudget(${unit}) itself, spelled exactly that way — every rule in this file prices the cells that reach it as already granted`,
    );
  }
});

test("#864 · every cell's accessibility scans are covered by a grant it can name", () => {
  const helpers = helpersSource();
  const files = specFiles();
  assert.ok(files.length >= 46, `the census must actually see the suite (found ${files.length} spec files)`);

  const gaps: CellGap[] = [];
  let scanningCells = 0;
  for (const name of files) {
    const source = readFileSync(join(E2E_DIR, name), "utf8");
    for (const gap of cellBudgetGaps(name, source, helpers)) if (gap.missing.includes("scan")) gaps.push(gap);
    const stripped = stripComments(source);
    const bodies = functionBodies(stripped);
    for (const cell of testCells(stripped)) {
      if (transitiveAmount(cell.body, bodies, (b) => (b.match(/\.analyze\(/g) ?? []).length) > 0) scanningCells += 1;
    }
  }

  // A count-control, not decoration: this rule can only be trusted while it is actually looking at
  // scans. 162 cells across 41 files scan today (MEASURED 2026-09-23); a refactor that hid the
  // scanner behind a shape `cellBudgetGaps` cannot follow would drop this number, not raise a
  // failure, so the floor is asserted.
  assert.ok(scanningCells >= 150, `the census must still see the suite's scans (found ${scanningCells} scanning cells)`);

  assert.deepEqual(gaps, [], `these cells scan without the headroom to pay for it:\n${describeGaps(gaps)}`);
});

test("#864 · a cell whose own waits can eat the whole base budget declares a budget sized to them", () => {
  // THE THIRD VERB. #864's own Agent Brief names three — "every spec file that signs in, polls or
  // runs a full-page scan" — and the first cut of this census held rules for two. A poll here is an
  // EXPLICIT `{ timeout: N }` at or above 10 s: a wait the author already sized, because the thing
  // waited for is a fixture-driven state change rather than a render (`CELL_BUDGET.poll` prices one
  // at 15 s). An ordinary `expect()`'s own 5 s default is not a poll and is exactly what the flat
  // base is for. The line is drawn where the arithmetic draws it: when a cell's own declared waits
  // can consume the WHOLE base on their own, the base is no longer sized to that cell's work, and
  // the cell has to say what it is waiting for. Sign-in and scan grants are not spendable here —
  // each is priced for the work it pays for.
  const helpers = helpersSource();
  const files = specFiles();
  assert.ok(files.length >= 46, `the census must actually see the suite (found ${files.length} spec files)`);

  const gaps: CellGap[] = [];
  for (const name of files) {
    const source = readFileSync(join(E2E_DIR, name), "utf8");
    for (const gap of cellBudgetGaps(name, source, helpers)) if (gap.missing.includes("poll budget")) gaps.push(gap);
  }

  assert.deepEqual(gaps, [], `these cells wait longer than their base budget without declaring it:
${describeGaps(gaps)}`);
});

test("#864 · THE VACUITY CONTROL: the detector actually detects, and does not over-detect", () => {
  const helpers = helpersSource();
  const gaps = (source: string): string[] => cellBudgetGaps("fixture.spec.ts", source, helpers).map((g) => g.missing);

  // The hand-rolled shape a11y-finish-walk.spec.ts actually carried.
  assert.deepEqual(hardcodedTimeouts('test.setTimeout(30_000 * (FACES.length + 1));'), ["30_000 * (FACES.length + 1)"]);
  // The describe-level shape counterparty-identity-walk.spec.ts and firm-setup-walk.spec.ts carried.
  assert.deepEqual(hardcodedTimeouts("test.describe.configure({ timeout: 150_000 });"), ["{ timeout: 150_000 }"]);
  // The compliant per-cell shape every already-rolled-out file uses.
  assert.deepEqual(hardcodedTimeouts("test.setTimeout(cellBudgetMs({ signIns: 1, scans: 2 }));"), []);
  // A describe.configure that sets something OTHER than timeout (e.g. `mode`) is not this gate's
  // business at all — it never even reaches the argument check.
  assert.deepEqual(hardcodedTimeouts("test.describe.configure({ mode: 'parallel' });"), []);
  // A file with no custom timeout call anywhere reports none — not a false floor.
  assert.deepEqual(hardcodedTimeouts('await signInTo(page, "/");'), []);

  // THE SHAPE THE FIRST CUT MISSED (review finding SPEC-864-A), reproduced verbatim from
  // signup-confirm-pending.spec.ts: a local wrapper named `expectAccessible`, NOT `scan`, which
  // does not settle, in a file that never signs in, called three times from one cell.
  const unsettledLocalWrapper = [
    'import { expect, test } from "@playwright/test";',
    "async function expectAccessible(page, face) {",
    "  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();",
    "  expect(r.violations).toEqual([]);",
    "}",
    'test("a", async ({ page }) => {',
    "  await expectAccessible(page, 'one');",
    "  await expectAccessible(page, 'two');",
    "  await expectAccessible(page, 'three');",
    "});",
  ].join("\n");
  assert.equal(gaps(unsettledLocalWrapper).length, 1, "three ungranted scans through a differently-named wrapper must be caught");
  assert.match(gaps(unsettledLocalWrapper)[0]!, /3 scan grant\(s\).*runs 3 accessibility scan/s);

  // The SAME file, with the wrapper settling through the shared helper: covered, because
  // settleForScan grants CELL_BUDGET.scan per call.
  const settledLocalWrapper = unsettledLocalWrapper
    .replace('import { expect, test } from "@playwright/test";', 'import { expect, test } from "@playwright/test";\nimport { settleForScan } from "./helpers";')
    .replace("  const r = await new AxeBuilder", "  await settleForScan(page);\n  const r = await new AxeBuilder");
  assert.deepEqual(gaps(settledLocalWrapper), [], "a wrapper that settles through the shared helper pays for its own scan");

  // ONE scan, no settle, no budget — still an offender. The first cut's `>= 2` floor is gone:
  // CELL_BUDGET's own measurement is that a SINGLE scan takes 33 s against a flat 30 s default.
  const oneUnsettledScan = [
    'test("a", async ({ page }) => {',
    "  const r = await new AxeBuilder({ page }).analyze();",
    "});",
  ].join("\n");
  assert.equal(gaps(oneUnsettledScan).length, 1, "a single ungranted scan is already over the flat default");

  // The same single scan, paid for by the cell's own declaration rather than by a settle.
  const oneScanDeclared = oneUnsettledScan.replace(
    'test("a", async ({ page }) => {',
    'test("a", async ({ page }) => {\n  test.setTimeout(cellBudgetMs({ scans: 1 }));',
  );
  assert.deepEqual(gaps(oneScanDeclared), [], "a cell may also declare the scan budget itself");

  // A COMMENT NAMING THE SHAPE IS NOT THE SHAPE — the false positive #1017's census header records,
  // reproduced here because this file greps the same text.
  const commentOnly = [
    "// one full-page `AxeBuilder.analyze()` is 14.4 s alone",
    'test("a", async ({ page }) => {',
    "  await expect(page.getByRole('heading')).toBeVisible();",
    "});",
  ].join("\n");
  assert.deepEqual(gaps(commentOnly), [], "prose quoting the scanner must not be read as a scan");

  // A cell that scans nothing and waits for nothing long is not this rule's business.
  assert.deepEqual(gaps('test("a", async ({ page }) => { await page.goto("/"); });'), []);

  // importedAs resolves the alias shape members-invite-walk.spec.ts uses.
  assert.deepEqual(importedAs('import { signIn as sharedSignIn } from "./helpers";', ["signIn", "signInTo"]), ["sharedSignIn"]);
  assert.deepEqual(importedAs('import { ensureRealFocus } from "./helpers";', ["signIn", "signInTo"]), []);

  // The prices are READ, not re-typed: a census built on a stale number is the defect this guards.
  const prices = cellBudgetPrices(helpers);
  assert.ok(prices.scan >= 30_000 && prices.poll >= 10_000 && prices.signIn >= 10_000 && prices.base >= 20_000, JSON.stringify(prices));
});
