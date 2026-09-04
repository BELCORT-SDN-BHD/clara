// CB-AE2E-019 — the mechanical half of `app/globals.css`'s reduced-motion rule.
//
// WHY THIS FILE EXISTS, in one measured sentence: globals.css enumerated the
// motion families in a comment ("four families, all conform"), a vendored shadcn
// `sheet` added a fifth without anyone editing that comment, and its four side
// slides compiled with NO enclosing at-rule — so the firm-rail drawer travelled
// for a user who had asked the system for less motion, and the only thing that
// would ever have caught it was a reviewer reading a minified stylesheet.
//
// A COUNT IN A COMMENT IS NOT A GATE. This is.
//
// WHAT IT CHECKS, AND WHAT IT DELIBERATELY DOES NOT. It scans SOURCE class
// strings for movement utilities that are not behind `motion-safe:`. It is a
// spelling-level check by nature, so it cannot prove the compiled CSS is right —
// `e2e/responsive-shell-walk.spec.ts` does that half, under a real
// `prefers-reduced-motion: reduce`, by reading computed style. What this one buys
// is that the next lane to vendor a primitive finds out at `pnpm test` instead of
// at review, which is the whole difference between the two halves.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["components", "app"];

/**
 * A utility that MOVES something. Opacity is deliberately absent: the contract's
 * rule is "position, scale, stagger and parallax go; opacity REMAINS".
 *
 * `animate-in` / `animate-out` ARE ALSO ABSENT, and that correction is the whole
 * reason this list has no exceptions. They are tw-animate-css's ENABLERS — they
 * set `animation-name`/`animation-duration` and carry no transform of their own;
 * the movement lives in the companion utility (`zoom-in-95`, `slide-in-from-*`),
 * which is matched below and which the three vendored popups already wrap in
 * `motion-safe:`. Including the enablers flagged dialog, select and dropdown for
 * carrying `animate-in` beside an already-safe `zoom-in-95`, and the only way to
 * keep the gate green was to exempt all three — which would have exempted them
 * from the REAL check too. A gate whose exception list contains its three most
 * animated files is not a gate.
 *
 * So: no `EXEMPT` list at all. Every file is scanned, and the measured result is
 * zero offenders — which is the only shape in which "no offenders" means
 * anything.
 */
const MOVEMENT = /\b(?:translate-[xy]?-|scale-[xy]?-|slide-in-from-|slide-out-to-|zoom-in|zoom-out)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Split source into whitespace-separated tokens, one of which is a Tailwind
 * utility.
 *
 * SPLIT ON WHITESPACE AND QUOTES ONLY. The first version of this also split on
 * `=`, which tore a `motion-safe:data-[side=…]:…` class in half at the `=` INSIDE
 * the arbitrary variant, leaving a tail fragment that still carried the translate
 * while the `motion-safe:` stayed on the other side of the break — so the gate
 * reported eight offenders in a file that had just been fixed. A Tailwind class
 * can contain `=`, `(`, `,` and `>` inside its brackets; whitespace and the quote
 * characters are the only separators that are never part of one.
 */
function utilitiesOf(source: string): { util: string; line: number }[] {
  const found: { util: string; line: number }[] = [];
  source.split("\n").forEach((line, i) => {
    // Comments are prose, not classes — a file that DESCRIBES a translate in its
    // header (this repo's files describe a great deal) must not red the gate.
    const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
    for (const token of code.split(/[\s"'`]+/)) {
      if (token) found.push({ util: token, line: i + 1 });
    }
  });
  return found;
}

describe("the reduced-motion contract — movement is behind motion-safe:, everywhere", () => {
  const files = ROOTS.flatMap((r) => walk(join(WEB_ROOT, r))).map((f) => relative(WEB_ROOT, f).replace(/\\/g, "/"));

  it("no component declares a MOVEMENT utility outside `motion-safe:`", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(WEB_ROOT, file), "utf8");
      for (const { util, line } of utilitiesOf(source)) {
        if (!MOVEMENT.test(util)) continue;
        // `motion-safe:` may sit anywhere in the variant chain
        // (`motion-safe:data-[side=left]:…` and `data-[side=left]:motion-safe:…`
        // are both correct), so the test is containment, not a prefix match.
        if (util.includes("motion-safe:")) continue;
        // A STATIC transform is not motion: `-translate-y-1/2` on a centred
        // launcher never animates, and demanding `motion-safe:` there would be
        // asking the page to lay itself out differently for a reduced-motion
        // user. Only a translate that is part of a TRANSITIONED state counts,
        // which in this codebase means the `data-starting-style` /
        // `data-ending-style` / `data-open` / `data-closed` families.
        if (!/data-(starting-style|ending-style|open|closed):/.test(util)) continue;
        offenders.push(`${file}:${line}  ${util}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these transition-state movement utilities run under prefers-reduced-motion:\n${offenders.join("\n")}`,
    );
  });

  it("RED-ON-MUTANT CONTROL: the scan really does recognise an offender", () => {
    // Without this the cell above passes just as happily the day the regex stops
    // matching or `utilitiesOf` returns nothing. The fixture is the EXACT string
    // the vendored sheet shipped, before it was wrapped.
    //
    // ASSEMBLED, NEVER WRITTEN WHOLE — and this is not fussiness. Tailwind v4's
    // default source detection scans this file like any other, so an unwrapped
    // side-translate class written out in full here is a CANDIDATE: it compiles
    // that class, BARE, into the production stylesheet. The first version of this
    // cell did exactly that, and the resulting rule is the very thing the gate
    // exists to forbid — so a built-sheet grep for unconditional side translates
    // would have found this test's own fixture and been unable to tell it from a
    // real regression. A test must not mint the CSS it is testing for.
    //
    // AND THE SCANNER DOES NOT SKIP COMMENTS. Tailwind's extractor is a byte-level
    // regex, not a parser, so spelling the offending class in THIS comment to
    // explain the rule would re-introduce it. That is why the paragraph above
    // describes the shape instead of quoting it, and why the guard cell below
    // reads this file WITHOUT stripping comments.
    const sideVariant = ["data-[side=left]", "data-ending-style"].join(":");
    const offender = `${sideVariant}:translate-x-[-2.5rem]`;
    const fixture = `className="${offender} opacity-0"`;
    const hits = utilitiesOf(fixture).filter(
      (t) =>
        MOVEMENT.test(t.util) &&
        !t.util.includes("motion-safe:") &&
        /data-(starting-style|ending-style|open|closed):/.test(t.util),
    );
    assert.equal(hits.length, 1, `the scan missed the known offender: ${JSON.stringify(hits)}`);
    // …and it does NOT flag the same utility once wrapped.
    const wrappedHits = utilitiesOf(`className="motion-safe:${offender}"`).filter(
      (t) => MOVEMENT.test(t.util) && !t.util.includes("motion-safe:"),
    );
    assert.deepEqual(wrappedHits, []);
  });

  it("this file mints NO Tailwind candidate of its own — comments included", () => {
    // The guard on the guard. A later edit that "tidies" the concatenation above
    // back into one string literal — or that spells the offending class in a
    // comment to explain the rule — silently re-adds a bare unconditional side
    // translate to the production stylesheet, and nothing else would notice.
    //
    // READ WITHOUT STRIPPING COMMENTS, unlike the component scan. That asymmetry
    // is deliberate and is the point: Tailwind's extractor is a byte-level regex
    // over the raw file, so it does not know what a comment is. A component's
    // prose describing an existing utility is harmless (the class is already in
    // the sheet); a fixture in THIS file naming a class that exists nowhere else
    // conjures a brand-new rule out of a test.
    // A CANDIDATE, not merely a token that contains the word "translate". This
    // file necessarily mentions movement utilities — its own MOVEMENT regex is
    // built out of them, and the fixture is assembled from fragments. Neither is
    // something Tailwind can compile: a regex source carries `\`, `|` and `(?:`,
    // and an assembled fragment carries `${`. So the shape is checked as well as
    // the substring: a real candidate is variant-prefixed, made only of the
    // characters a utility may contain, and opens a bracket before it closes one.
    // Conservative by construction — it can only UNDER-report, and the built
    // sheet remains the final word.
    // `=` and `,` ARE legal inside an arbitrary variant — `data-[side=left]` is
    // the exact shape this guard exists for, and leaving `=` out of the allowlist
    // made the whole cell vacuous: the mutant panel planted a literal
    // side-translate class and this filter dropped it before the movement check
    // ever ran. Caught by R1b, which is the only reason it is not still vacuous.
    const CANDIDATE = /^[a-z][a-z0-9:_.,=\-[\]()%/#]*$/;
    const balanced = (t: string) => t.indexOf("]") === -1 || t.indexOf("[") < t.indexOf("]");
    const self = readFileSync(join(WEB_ROOT, "tests/reduced-motion-contract.test.ts"), "utf8");
    const minted = self
      .split(/[\s"'`]+/)
      .filter(
        (t) =>
          MOVEMENT.test(t) &&
          !t.includes("motion-safe:") &&
          t.includes(":") &&
          CANDIDATE.test(t) &&
          balanced(t),
      );
    assert.deepEqual(
      minted,
      [],
      `this file writes ${minted.join(", ")} literally — Tailwind will compile it into the production sheet; assemble it instead`,
    );
  });

  it("the scan actually walked the tree, and the sheet is in it", () => {
    // The vacuity arm: a walker pointed at the wrong directory returns zero files
    // and the first cell passes trivially.
    assert.ok(files.length > 100, `only ${files.length} component files scanned — is the walk right?`);
    assert.ok(files.includes("components/ui/sheet.tsx"), "the file this gate was minted for is not in the scan");
  });

});
