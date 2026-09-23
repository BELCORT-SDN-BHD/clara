// #1017 — EVERY ACCESSIBILITY SCAN SETTLES THROUGH ONE SHARED HELPER.
//
// #760 built `settleForScan` (./helpers) after three walks measured the same intermittent axe
// `color-contrast` violation: a scan that runs before the mount/selection fade reaches its resting
// opacity measures a COMPOSITED mid-transition colour, never a colour that ships. That fix covered a
// handful of named scans. By wave 3 (2026-09-20) two independent findings — the integration gate's
// own three-run B7 classification and lane 02's repo-wide count, both recorded on this ticket —
// showed the large majority of this suite's AxeBuilder scans still call the scanner directly, or
// through a LOCAL settle routine that waits only for `document.getAnimations()` (or, worse, only for
// `page.waitForLoadState("networkidle")`) to finish — never for `.enter-content`/`.enter-panel`'s own
// `opacity` to reach 1 — which is the exact defect class #760 fixed for the three walks it touched
// and left everywhere else. `#1017`'s own triage comment (2026-09-20) widened the ticket once more,
// after the SAME axe cell went red on the SAME row in TWO consecutive isolated re-runs measuring
// 4.49:1 against the 4.5:1 floor: the selected document row's resting contrast sat close enough to
// the threshold that anti-aliasing could decide which side a scan landed on. That half of the fix is
// `filed-document-list.tsx` (a real margin at rest) and `token-contrast.test.ts` (the pair pinned);
// this file is the settle half.
//
// WHAT THIS CENSUS HOLDS. Every spec file that calls the accessibility scanner
// (`new AxeBuilder(...).analyze()`) must settle first, through `settleForScan` — either DIRECTLY, or
// through a LOCAL WRAPPER this file has verified actually delegates to it (the same
// declare-and-verify shape `sign-in-census.test.ts` uses for its own WRAPPERS: a thin function that
// forwards to the shared helper is not a second copy; a function that reimplements the wait is). A
// scan not preceded by a settle — direct, or through a verified wrapper CALLED anywhere earlier in
// the SAME cell — since the last scan (or the cell's own opening) is an offender.
//
// WHY COMMENTS ARE STRIPPED FIRST. This suite's own prose regularly quotes the exact code shapes
// this census greps for — `staff-expense-claim-walk.spec.ts`'s own header said "one full-page
// `AxeBuilder.analyze()` is 14.4 s alone" a full five lines ahead of its one real, already-settled
// call, and a comment-blind first cut of this file read that prose as a second, uncovered scan.
// `stripComments` (`./spec-census`, shared with `cell-budget-census.test.ts` since #864's own fix
// round) removes `//` and block-comment content — never string/template contents — while preserving
// every newline, so line numbers stay true to the real file.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { E2E_DIR, functionBody, lineAt, specFiles, stripComments } from "./spec-census";

/**
 * LOCAL WRAPPERS — a function that forwards to `settleForScan` before this census's job is done, so
 * a CALL to it counts as settling. Each entry is verified below (a name here whose body does not
 * call `settleForScan(page)` fails its own cell), and each carries the reason the file keeps its own
 * name for it rather than calling the shared helper directly at every one of its sites.
 */
const LOCAL_WRAPPERS: Record<string, { names: string[]; why: string }> = {
  "a11y-finish-walk.spec.ts": {
    names: ["gotoSettled"],
    why: "this file's own navigate-then-settle idiom for its FACES loop — the goto/networkidle half is not settleForScan's job, so the wrapper keeps it and delegates the settle half",
  },
  "home-board-walk.spec.ts": {
    names: ["settled"],
    why: "called at nearly every one of this file's test bodies, most a read-only assertion or two away from their own scan — the same delegate shape, at a much larger call count",
  },
};

function wrapperNamesFor(specName: string): string[] {
  return LOCAL_WRAPPERS[specName]?.names ?? [];
}

const SCAN_CALL = /\.analyze\(\s*\)/g;
/** The opener of a CELL — every marker walk below resets at one, because two cells never share
 *  a page, let alone a settled one. */
const CELL_OPENER = /\btest(?:\.only)?\(\s*["'`]/g;
const DIRECT_SETTLE = /settleForScan\(\s*page\b/g;

function wrapperCallPattern(names: string[]): RegExp | null {
  if (names.length === 0) return null;
  const alternation = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(String.raw`\b(?:${alternation})\(\s*page\b`, "g");
}

/**
 * Every `.analyze()` call NOT preceded — since the last one, or the start of the source — by a
 * direct `settleForScan(page` call or a call to one of `wrapperNames`. Takes COMMENT-STRIPPED
 * source; the line numbers it returns are computed against that same text, which is why
 * `stripComments` preserves every original newline rather than collapsing comment blocks.
 */
export function unsettledScanLines(strippedSource: string, wrapperNames: string[] = []): number[] {
  type Marker = { kind: "scan" | "settle" | "cell"; idx: number };
  const markers: Marker[] = [...strippedSource.matchAll(SCAN_CALL)].map((m) => ({ kind: "scan", idx: m.index }));
  for (const m of strippedSource.matchAll(DIRECT_SETTLE)) markers.push({ kind: "settle", idx: m.index });
  const wrapperPattern = wrapperCallPattern(wrapperNames);
  if (wrapperPattern) {
    for (const m of strippedSource.matchAll(wrapperPattern)) markers.push({ kind: "settle", idx: m.index });
  }
  // A CELL BOUNDARY SPENDS WHATEVER WAS LEFT (review finding SPEC-1017-C). The markers are file
  // ordered, so without this a settle at the END of one cell cleared an unsettled scan at the
  // START of the next — two cells never share a page, let alone a settled one. Latent when found
  // (a boundary-aware re-run over all 50 real files reported the same zero offenders), which is
  // exactly when a hole is cheapest to close.
  for (const m of strippedSource.matchAll(CELL_OPENER)) markers.push({ kind: "cell", idx: m.index });
  markers.sort((a, b) => a.idx - b.idx);

  let settled = false;
  const offenders: number[] = [];
  for (const marker of markers) {
    if (marker.kind === "cell") {
      settled = false;
    } else if (marker.kind === "settle") {
      settled = true;
    } else {
      if (!settled) offenders.push(lineAt(strippedSource, marker.idx));
      settled = false;
    }
  }
  return offenders;
}

/**
 * FILES THIS CENSUS DOES NOT HOLD TO THE RULE, each with the reason recorded rather than merely
 * absent. Empty as of #1017's own fold — every spec file that scans now settles first, directly or
 * through a verified `LOCAL_WRAPPERS` entry — kept here (rather than deleted) because the acceptance
 * criterion asks for a reviewed exception list to exist, and the cell below keeps a stale entry from
 * outliving the offence that justified it, the same guarantee `sign-in-census.test.ts` gives its own
 * two lists.
 */
const EXCEPTIONS: Record<string, string> = {};

test("#1017 · every browser-walk accessibility scan settles first — directly, or through a verified wrapper", () => {
  const files = specFiles();
  // The floor sign-in-census.test.ts measures (46, at dd3f8f1d) still holds here — this file reads
  // the same directory the same way, and a census that silently saw zero files would pass every
  // assertion below for the wrong reason.
  assert.ok(files.length >= 46, `the census must actually see the suite (found ${files.length} spec files)`);

  const offenders: Record<string, number[]> = {};
  for (const name of files) {
    if (name in EXCEPTIONS) continue;
    const stripped = stripComments(readFileSync(join(E2E_DIR, name), "utf8"));
    const lines = unsettledScanLines(stripped, wrapperNamesFor(name));
    if (lines.length > 0) offenders[name] = lines;
  }

  assert.deepEqual(
    offenders,
    {},
    "these spec files invoke AxeBuilder's .analyze() without settling first (directly, or through a " +
      "verified LOCAL_WRAPPERS entry):\n" +
      Object.entries(offenders)
        .map(([file, lines]) => `  - ${file}: line(s) ${lines.join(", ")}`)
        .join("\n") +
      "\nCall settleForScan(page) (./helpers) immediately before the scan, or register and verify a " +
      "wrapper that delegates to it.",
  );
});

test("#1017 · every LOCAL_WRAPPERS entry actually delegates to settleForScan — a name here is not enough", () => {
  for (const [specName, { names }] of Object.entries(LOCAL_WRAPPERS)) {
    const stripped = stripComments(readFileSync(join(E2E_DIR, specName), "utf8"));
    for (const name of names) {
      const body = functionBody(stripped, name);
      assert.ok(body, `${specName} names wrapper "${name}" but no top-level async function ${name}(...) is declared there`);
      assert.match(
        body!,
        /settleForScan\(\s*page\b/,
        `${specName}'s "${name}" is registered as a settle wrapper but its own body never calls settleForScan(page) — it is a second local implementation, not a delegate`,
      );
    }
  }
});

test("#1017 · the exception list is LIVE — an entry that no longer offends must be removed", () => {
  for (const [name, why] of Object.entries(EXCEPTIONS)) {
    const stripped = stripComments(readFileSync(join(E2E_DIR, name), "utf8"));
    const lines = unsettledScanLines(stripped, wrapperNamesFor(name));
    assert.ok(lines.length > 0, `${name} no longer has an unsettled scan (${why}) — delete its EXCEPTIONS entry`);
  }
});

test("#1017 · THE VACUITY CONTROL: the detector actually detects, and does not over-detect", () => {
  // A raw scan, settled nowhere in the source: must be caught, at the scan's own line.
  const offender = [
    'test("x", async ({ page }) => {',
    '  await page.goto("/x");',
    "  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();",
    "});",
  ].join("\n");
  assert.deepEqual(unsettledScanLines(stripComments(offender)), [3], "an unsettled scan must be caught");

  // The compliant shape: must not be caught.
  const compliant = [
    'test("x", async ({ page }) => {',
    "  await settleForScan(page);",
    "  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();",
    "});",
  ].join("\n");
  assert.deepEqual(unsettledScanLines(stripComments(compliant)), [], "settleForScan immediately before the scan must clear it");

  // TWO SCANS, ONE SETTLE: a settle does not carry forward past the scan it was for — only the
  // SECOND, un-resettled scan is an offender.
  const twoScansOneSettle = [
    "await settleForScan(page);",
    "await new AxeBuilder({ page }).analyze();",
    "await page.click('button');",
    "await new AxeBuilder({ page }).analyze();",
  ].join("\n");
  assert.deepEqual(unsettledScanLines(stripComments(twoScansOneSettle)), [4], "a settle spent on one scan must not cover the next");

  // ACROSS A CELL BOUNDARY (review finding SPEC-1017-C): cell A's trailing settle must NOT clear
  // cell B's bare scan. They never share a page — B gets a fresh context, and the settle A spent
  // measured a document that no longer exists. Latent when found (no real file depended on it),
  // which is the cheapest moment to close it.
  const settleInThePreviousCell = [
    'test("A", async ({ page }) => {',
    "  await settleForScan(page);",
    "});",
    'test("B", async ({ page }) => {',
    "  await new AxeBuilder({ page }).analyze();",
    "});",
  ].join("\n");
  assert.deepEqual(
    unsettledScanLines(stripComments(settleInThePreviousCell)),
    [5],
    "a settle at the end of one cell must not clear an unsettled scan in the next",
  );

  // The same two cells with B settling for itself: clean. (Without this arm the rule above could
  // be satisfied by a census that simply never clears anything after a boundary.)
  assert.deepEqual(
    unsettledScanLines(stripComments(settleInThePreviousCell.replace("  await new AxeBuilder", "  await settleForScan(page);\n  await new AxeBuilder"))),
    [],
    "a cell that settles for itself is clean either side of a boundary",
  );

  // A COMMENT NAMING THE SHAPE IS NOT THE SHAPE — the real false positive this file's own header
  // records, reproduced as a fixture: prose ahead of the one real, already-settled call.
  const commentOnly = [
    "// one full-page `AxeBuilder.analyze()` is 14.4s alone",
    "await settleForScan(page);",
    "const r = await new AxeBuilder({ page }).analyze();",
  ].join("\n");
  assert.deepEqual(unsettledScanLines(stripComments(commentOnly)), [], "a comment mentioning the shape must not itself count as either half");

  // A WRAPPER CALL SITE counts as settling ONLY when its name is passed in — the same text with no
  // wrapper name registered must still flag the scan, which is what stops a made-up wrapper name
  // from silently clearing a real offender.
  const viaWrapperCallSite = ["await gotoSettled(page, '/x');", "await new AxeBuilder({ page }).analyze();"].join("\n");
  assert.deepEqual(unsettledScanLines(stripComments(viaWrapperCallSite), ["gotoSettled"]), [], "a registered wrapper's call site must clear the scan");
  assert.deepEqual(unsettledScanLines(stripComments(viaWrapperCallSite), []), [2], "the same call site with no wrapper registered must still flag it");

  // functionBody: extracts exactly the balanced body, walking past a NESTED brace rather than
  // stopping at the first one, and does not reach past its own function into the next.
  const src = [
    "async function gotoSettled(page) {",
    "  if (true) { await x(); }",
    "  await settleForScan(page);",
    "}",
    "async function other() { /* not this one */ }",
  ].join("\n");
  const body = functionBody(src, "gotoSettled");
  assert.ok(body && /settleForScan\(\s*page\b/.test(body), "the extracted body must contain the delegate call past a nested brace");
  assert.ok(body && !body.includes("async function other"), "the extraction must stop at ITS OWN closing brace, not swallow the next declaration");
  assert.equal(functionBody(src, "neverDeclared"), null, "a name with no declaration must return null, not throw or guess");
});
