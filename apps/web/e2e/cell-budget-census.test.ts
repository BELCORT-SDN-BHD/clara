// #864 — THE BUDGET ROLLOUT, HELD BY A CELL INSTEAD OF A SENTENCE.
//
// #706 wrote the shared vocabulary — `CELL_BUDGET`, `cellBudgetMs`, `grantCellBudget` — in
// `helpers.ts` for exactly one reason: a walk that signs in, polls or scans states its own cost in
// ONE place instead of guessing a number. Two call sites predate that vocabulary and were never
// folded into it. `a11y-finish-walk.spec.ts` carries `test.setTimeout(30_000 * (FACES.length + 1))`
// twice — `helpers.ts`'s own `CELL_BUDGET` doc comment names this exact line as "the same idea,
// written before there was a shared place to put it." `counterparty-identity-walk.spec.ts` carries
// `test.describe.configure({ timeout: 150_000 })`, whose own comment cites the a11y walk's shape as
// its precedent — a guess built on a guess. A third shape is the ticket's other named gap:
// `checkout-gate-walk.spec.ts` never signs in through the shared helper (every cell there signs UP,
// which is a different form `sign-in-census.test.ts` deliberately does not match), so it gets no
// automatic `grantCellBudget` at all — and several of its cells call its own local `scan()` two to
// four times against the flat 30 s default, with nothing else standing between them and a
// host-contention timeout.
//
// This file measures both shapes so neither can drift back: a hand-rolled timeout that is not built
// from `cellBudgetMs`, and a heavy cell in a file with no other source of headroom.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const E2E_DIR = dirname(fileURLToPath(import.meta.url));

/** Every browser spec in this directory, read from disk rather than listed by hand — the same
 *  discipline `sign-in-census.test.ts` already argues for. */
function specFiles(): string[] {
  return readdirSync(E2E_DIR)
    .filter((name) => name.endsWith(".spec.ts"))
    .sort();
}

/**
 * Every `test(...)`/`test.only(...)` CELL's own body, located by the arrow's `=> {` rather than by
 * the first `{` after `test(` — a destructured `async ({ page }) => {` parameter has its OWN brace,
 * and taking that one for the body's opener would end the walk at the parameter list's own close,
 * reading zero of the cell's real content.
 */
function testBodies(source: string): string[] {
  const bodies: string[] = [];
  const re = /\btest(?:\.only)?\(\s*["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const window = source.slice(m.index, m.index + 4000);
    const arrow = /=>\s*\{/.exec(window);
    if (!arrow) continue;
    const bodyStart = m.index + arrow.index + arrow[0].length - 1;
    let depth = 1;
    let end = -1;
    for (let i = bodyStart + 1; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;
    bodies.push(source.slice(bodyStart, end + 1));
    re.lastIndex = end;
  }
  return bodies;
}

/** A balanced-paren read of a call's own argument list, given the index of its opening `(`. Used
 *  for both `test.setTimeout(` and `test.describe.configure(`, which is why this takes the paren
 *  index rather than assuming one shape. */
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
 * describe-level shape the two predating files actually used.
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
 *  `counterparty-identity-walk.spec.ts` predate the shared vocabulary with. */
export function hardcodedTimeouts(source: string): string[] {
  return customTimeoutCalls(source).filter((args) => !args.includes("cellBudgetMs("));
}

/** The local name a file gave the shared `signIn`/`signInTo` import, alias included
 *  (`signIn as sharedSignIn`, `members-invite-walk.spec.ts`'s own shape). */
function importedSignInNames(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\/helpers["']/g)) {
    for (const part of m[1]!.split(",")) {
      const [imported, local] = part.trim().split(/\s+as\s+/).map((s) => s.trim());
      if (imported === "signIn" || imported === "signInTo") names.push((local ?? imported)!);
    }
  }
  return names;
}

/** Whether the file's own text calls the shared sign-in helper anywhere at all — directly in a
 *  cell, or once inside a local wrapper the cell calls instead (`members-invite-walk.spec.ts`'s
 *  `signInToMembers`). Either shape means EVERY cell that reaches it already receives the automatic
 *  `grantCellBudget(CELL_BUDGET.signIn)` `signInTo`/`signIn` carries internally — this function only
 *  answers "does this file have that automatic floor at all", not "does this one cell use it". */
export function callsSharedSignIn(source: string): boolean {
  const names = importedSignInNames(source);
  return names.some((name) => new RegExp(String.raw`\b${name}\(`).test(source));
}

/** This suite's own established name for one settle-then-axe-scan pass — every file that defines
 *  a local helper for it (`checkout-gate-walk.spec.ts`, `firm-setup-walk.spec.ts`,
 *  `documents-viewer-walk.spec.ts`, `periodic-adjustment-walk.spec.ts`) names it exactly this. */
const SCAN_CALL = /\bscan\(/g;
const DECLARES_BUDGET = /\bcellBudgetMs\(|\bgrantCellBudget\(|\btest\.setTimeout\(/;

/**
 * How many of a file's own cells call the local `scan()` helper twice or more WITHOUT declaring a
 * budget in that same cell, counted only for a file that has no automatic sign-in floor at all
 * (`callsSharedSignIn` false) — a file that signs in anywhere already has `CELL_BUDGET.signIn`'s
 * 20 s standing under every cell, which is the reason none of the many two-scan cells in
 * `home-board-walk.spec.ts` and its siblings need this check to fire on them too: #864's own Agent
 * Brief scopes this ticket to what still has NO headroom at all, not to re-litigating a threshold
 * every already-signed-in file has been shipped against for two waves.
 */
export function ungrantedHeavyCells(source: string): number {
  if (callsSharedSignIn(source)) return 0;
  let offenders = 0;
  for (const body of testBodies(source)) {
    const scans = (body.match(SCAN_CALL) ?? []).length;
    if (scans >= 2 && !DECLARES_BUDGET.test(body)) offenders++;
  }
  return offenders;
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

test("#864 · a spec file with no automatic sign-in grant declares its own budget before a heavy scan cell", () => {
  const files = specFiles();
  const offenders: string[] = [];
  for (const name of files) {
    if (ungrantedHeavyCells(readFileSync(join(E2E_DIR, name), "utf8")) > 0) offenders.push(name);
  }

  assert.deepEqual(
    offenders,
    [],
    `these spec files never sign in through the shared helper (no automatic CELL_BUDGET.signIn floor) ` +
      `and run 2+ scan() passes in one cell against the flat 30s default:\n${offenders.map((f) => `  - ${f}`).join("\n")}\n` +
      `Add test.setTimeout(cellBudgetMs({ scans: N })) sized to that cell's own scan() count.`,
  );
});

test("#864 · THE VACUITY CONTROL: the detector actually detects, and does not over-detect", () => {
  // The hand-rolled shape a11y-finish-walk.spec.ts actually carries.
  assert.deepEqual(hardcodedTimeouts('test.setTimeout(30_000 * (FACES.length + 1));'), ["30_000 * (FACES.length + 1)"]);
  // The describe-level shape counterparty-identity-walk.spec.ts and firm-setup-walk.spec.ts carry.
  assert.deepEqual(hardcodedTimeouts("test.describe.configure({ timeout: 150_000 });"), ["{ timeout: 150_000 }"]);
  // The compliant per-cell shape every already-rolled-out file uses.
  assert.deepEqual(hardcodedTimeouts("test.setTimeout(cellBudgetMs({ signIns: 1, scans: 2 }));"), []);
  // A describe.configure that sets something OTHER than timeout (e.g. `mode`) is not this gate's
  // business at all — it never even reaches the argument check.
  assert.deepEqual(hardcodedTimeouts("test.describe.configure({ mode: 'parallel' });"), []);
  // A file with no custom timeout call anywhere reports none — not a false floor.
  assert.deepEqual(hardcodedTimeouts('await signInTo(page, "/");'), []);

  // ungrantedHeavyCells: a file that never signs in, with one cell scanning four times and no
  // budget of its own — checkout-gate-walk.spec.ts's own real shape, minified.
  const noGrantHeavy = [
    'import { expect, test } from "@playwright/test";',
    'async function scan(page) {}',
    'test("a", async ({ page }) => {',
    "  await scan(page, 'one');",
    "  await scan(page, 'two');",
    "});",
  ].join("\n");
  assert.equal(ungrantedHeavyCells(noGrantHeavy), 1, "two ungranted scan() calls in one cell of a never-signs-in file must be caught");

  // The SAME two scans, but the cell already declares its own budget — not an offender.
  const noGrantHeavyButBudgeted = noGrantHeavy.replace(
    "  await scan(page, 'one');",
    "  test.setTimeout(cellBudgetMs({ scans: 2 }));\n  await scan(page, 'one');",
  );
  assert.equal(ungrantedHeavyCells(noGrantHeavyButBudgeted), 0, "a cell that already declares a budget is not an offender");

  // The SAME two scans, but the file signs in elsewhere — the automatic CELL_BUDGET.signIn floor
  // already stands, so this check does not apply at all (home-board-walk.spec.ts's own real shape:
  // many two-scan cells, always after a signIn call, never flagged).
  const signsInElsewhere = [
    'import { expect, test } from "@playwright/test";',
    'import { signIn } from "./helpers";',
    'async function scan(page) {}',
    'test("setup", async ({ page }) => { await signIn(page); });',
    'test("b", async ({ page }) => {',
    "  await scan(page, 'one');",
    "  await scan(page, 'two');",
    "});",
  ].join("\n");
  assert.equal(ungrantedHeavyCells(signsInElsewhere), 0, "a file with the automatic sign-in floor anywhere is out of this check's scope");

  // ONE scan is never heavy enough to trip the check, granted or not.
  const oneScanOnly = noGrantHeavy.replace("  await scan(page, 'two');\n", "");
  assert.equal(ungrantedHeavyCells(oneScanOnly), 0, "a single scan() call is not the shape this ticket found a gap in");

  // The alias import shape callsSharedSignIn must also resolve.
  assert.equal(
    callsSharedSignIn('import { signIn as sharedSignIn } from "./helpers";\nawait sharedSignIn(page);'),
    true,
  );
  assert.equal(callsSharedSignIn('import { ensureRealFocus } from "./helpers";'), false);
});
