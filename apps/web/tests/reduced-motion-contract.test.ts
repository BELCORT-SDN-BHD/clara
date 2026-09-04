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

/** A utility that MOVES something. Opacity is deliberately absent: the contract's
 *  rule is "position, scale, stagger and parallax go; opacity REMAINS". */
const MOVEMENT = /\b(?:translate-[xy]?-|scale-[xy]?-|slide-in-from-|slide-out-to-|zoom-in|zoom-out|animate-in|animate-out)/;

/**
 * The named exceptions, each with the reason it is not movement-under-reduce.
 * A bare allowlist rots; every entry here states what makes it safe, and the
 * cell below asserts the list is non-empty AND that each entry still exists —
 * so a stale exemption is caught rather than silently widening the gate.
 */
const EXEMPT: { file: string; why: string }[] = [
  {
    file: "components/ui/dialog.tsx",
    why: "its zoom is already `motion-safe:` per-utility; the fade is unconditional by the contract's own rule",
  },
  {
    file: "components/ui/select.tsx",
    why: "same shape as dialog — `motion-safe:` zoom, unconditional fade",
  },
  {
    file: "components/ui/dropdown-menu.tsx",
    why: "same shape; DS-01's browser cell measures it under `reduce` and asserts transform:none",
  },
];

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
 * `=`, which tore `motion-safe:data-[side=left]:…:translate-x-[-2.5rem]` in half
 * at the `=` INSIDE the arbitrary variant and left a fragment
 * (`left]:data-ending-style:translate-x-[-2.5rem]`) with the `motion-safe:` on
 * the other side of the break — so the gate reported eight offenders in a file
 * that had just been fixed. A Tailwind class can contain `=`, `(`, `,` and `>`
 * inside its brackets; whitespace and the quote characters are the only
 * separators that are never part of one.
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
      if (EXEMPT.some((e) => e.file === file)) continue;
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
    const fixture = 'className="data-[side=left]:data-ending-style:translate-x-[-2.5rem] opacity-0"';
    const hits = utilitiesOf(fixture).filter(
      (t) =>
        MOVEMENT.test(t.util) &&
        !t.util.includes("motion-safe:") &&
        /data-(starting-style|ending-style|open|closed):/.test(t.util),
    );
    assert.equal(hits.length, 1, `the scan missed the known offender: ${JSON.stringify(hits)}`);
    // …and it does NOT flag the same utility once wrapped.
    const wrapped = 'className="motion-safe:data-[side=left]:data-ending-style:translate-x-[-2.5rem]"';
    const wrappedHits = utilitiesOf(wrapped).filter(
      (t) => MOVEMENT.test(t.util) && !t.util.includes("motion-safe:"),
    );
    assert.deepEqual(wrappedHits, []);
  });

  it("the scan actually walked the tree, and the sheet is in it", () => {
    // The vacuity arm: a walker pointed at the wrong directory returns zero files
    // and the first cell passes trivially.
    assert.ok(files.length > 100, `only ${files.length} component files scanned — is the walk right?`);
    assert.ok(files.includes("components/ui/sheet.tsx"), "the file this gate was minted for is not in the scan");
  });

  it("every named exemption still exists — a stale allowlist silently widens the gate", () => {
    assert.ok(EXEMPT.length > 0);
    for (const { file, why } of EXEMPT) {
      assert.ok(files.includes(file), `exempt file ${file} no longer exists — drop the entry (${why})`);
    }
  });
});
