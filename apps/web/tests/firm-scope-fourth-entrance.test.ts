// `./next-runtime-globals` FIRST — see firm-scope-surfaces.test.ts's own header for
// why: this file also imports lib/require-firm-scope.ts for its registries.
import "./next-runtime-globals";

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  SCOPE_ENTRANCES,
  SCOPE_EXEMPT_SURFACES,
  SCOPE_UNSCOPED_SURFACES,
} from "../lib/require-firm-scope";
import {
  moduleLevelDeclarations,
  reachableCallsFrom,
  stripComments,
  type SourceUnit,
} from "../test/sourceOracle";

/**
 * THE FOURTH-ENTRANCE GAP (PROGRESS.md Known issues; precondition for #455).
 *
 * `firm-scope-surfaces.test.ts`'s census enumerates every `page`/`route` LEAF the
 * App Router serves — that is the whole of its `LEAF` regex. Two classes of
 * firm-scoped surface sit entirely outside that enumeration:
 *
 *  (a) A layout-ADJACENT special file — `template.tsx`, `default.tsx`,
 *      `loading.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, and
 *      `layout.tsx` itself — runs in the SAME request as a leaf but is not a leaf,
 *      so it is invisible to a walk that only matches `LEAF`. A root
 *      `template.tsx` calling `loadCallerContext()` directly proves the point: it
 *      renders on every navigation, in every route group, and nothing before this
 *      file's cells notices it exists.
 *  (b) A `"use server"` Server Action export is not a file the App Router ROUTES
 *      to at all — no leaf, no special file, just an exported async function a
 *      client component calls directly. Zero exist today (measured below), which
 *      is exactly why this is a GATE gap rather than a live hole: #455 (members)
 *      and FS-4 (checkout) are the trains that add the first ones.
 *
 * Kept in its OWN file, not appended to `firm-scope-surfaces.test.ts`, because it
 * is a genuinely separate enumeration (a different walk, a different directive
 * scan) and the census file was already at the repo's soft size guideline.
 */

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(WEB_ROOT, "app");
const LIB_DIR = join(WEB_ROOT, "lib");

const SOURCE_EXT = /\.(ts|tsx)$/;

function webRelative(abs: string): string {
  return relative(WEB_ROOT, abs).split(sep).join("/");
}

function readSource(webRelativePath: string): string {
  return readFileSync(join(WEB_ROOT, webRelativePath), "utf8");
}

function readSourceUnit(webRelativePath: string): SourceUnit {
  return { path: webRelativePath, code: readSource(webRelativePath) };
}

function walkSources(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkSources(abs, out);
    else if (entry.isFile() && SOURCE_EXT.test(entry.name)) out.push(abs);
  }
  return out;
}

/** The registered entrance layouts, as the directories they cover — identical in
 *  shape to `firm-scope-surfaces.test.ts`'s own, kept separate rather than shared
 *  so importing this file can never re-register that suite (W-R-1's own reason for
 *  moving `LEAF` out of a test module in the first place). */
const ENTRANCE_LAYOUT_DIRS = SCOPE_ENTRANCES.filter((e) => e.path.endsWith("/layout.tsx")).map((e) =>
  e.path.slice(0, -"/layout.tsx".length),
);

function ancestorCovered(file: string): boolean {
  const dir = file.slice(0, file.lastIndexOf("/"));
  return ENTRANCE_LAYOUT_DIRS.some((d) => dir === d || dir.startsWith(`${d}/`));
}

describe("WALL 1 — every layout-adjacent special file classifies, or this suite reds", () => {
  /** Every App-Router special file EXCEPT `page`/`route` (the census's own `LEAF`).
   *  `layout` is included: it is exactly as invisible to the LEAF walk as
   *  `template` is, and the estate's own measured roster today is five layouts
   *  plus the root `not-found.tsx` (see the VACUITY CONTROL below). */
  const SPECIAL_FILE = /^(layout|template|default|loading|error|global-error|not-found)\.(ts|tsx|js|jsx)$/;

  function specialFiles(dir: string = APP_DIR, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_")) continue;
        specialFiles(abs, out);
      } else if (entry.isFile() && SPECIAL_FILE.test(entry.name)) {
        out.push(webRelative(abs));
      }
    }
    return out;
  }

  /**
   * Special files that classify for a reason none of the three scope registries
   * (`require-firm-scope.ts`) or ancestor-coverage can express — kept HERE, in the
   * census, rather than in the product module, because these are facts about the
   * ROUTER TREE (e.g. a root boundary that by Next.js's own contract sits ABOVE
   * every layout and so can never be ancestor-covered), not about whether the
   * spine was called.
   *
   * Empty today: every existing special file classifies through an existing
   * registry or ancestor coverage (measured below). This exists for the day one
   * does not.
   */
  const SPECIAL_FILE_ROSTER: ReadonlyArray<{ readonly path: string; readonly reason: string }> = [];

  const OK_CLASSES = ["direct entrance", "proven exemption", "registered unscoped", "ancestor-covered", "rostered"];

  function classifySpecial(file: string): string {
    if (SCOPE_ENTRANCES.some((e) => e.path === file)) return "direct entrance";
    const exempt = SCOPE_EXEMPT_SURFACES.find((e) => e.path === file);
    if (exempt) return exempt.pending ? "PENDING exemption on a file that EXISTS" : "proven exemption";
    if (SCOPE_UNSCOPED_SURFACES.some((s) => s.path === file)) return "registered unscoped";
    if (ancestorCovered(file)) return "ancestor-covered";
    if (SPECIAL_FILE_ROSTER.some((s) => s.path === file)) return "rostered";
    return "UNCLASSIFIED";
  }

  const files = specialFiles();

  it("VACUITY CONTROL: the walk found the real special files", () => {
    assert.ok(files.length >= 6, `only ${files.length} special files found under ${APP_DIR}`);
    for (const expected of [
      "app/layout.tsx",
      "app/not-found.tsx",
      "app/(firm)/layout.tsx",
      "app/(full)/layout.tsx",
      "app/(firm)/clients/[clientId]/layout.tsx",
      "app/(full)/clients/[clientId]/layout.tsx",
    ]) {
      assert.ok(files.includes(expected), `the walk missed ${expected}`);
    }
  });

  it("MUST-NOT-RED CONTROL: the special-file walk never picks up a LEAF file", () => {
    // Proves the two walks are disjoint — an ordinary new registered page.tsx or
    // route.ts (the OTHER census's job) can never appear here, and so can never
    // redden this wall.
    assert.ok(
      !files.some((f) => /\/(page|route)\.(ts|tsx|js|jsx)$/.test(f) || /^(page|route)\.(ts|tsx|js|jsx)$/.test(f)),
      "the special-file walk matched a page/route LEAF — SPECIAL_FILE has drifted onto LEAF's territory",
    );
  });

  it("EVERY special file classifies — an unclassified one is a fourth-entrance hole", () => {
    const unclassified = files.map((f) => ({ file: f, klass: classifySpecial(f) })).filter((f) => !OK_CLASSES.includes(f.klass));
    assert.deepEqual(
      unclassified.map((f) => `${f.file} → ${f.klass}`),
      [],
      "a layout-adjacent special file (layout/template/default/loading/error/global-error/not-found) is " +
      "registered nowhere. Register it in SCOPE_UNSCOPED_SURFACES or SCOPE_EXEMPT_SURFACES " +
      "(apps/web/lib/require-firm-scope.ts) if it legitimately does or does not call the spine, or in " +
      "SCOPE_ENTRANCES if it IS a fourth entrance calling requireFirmScope()/firmScopeGuard(); if none of " +
      "those registries can express why, add a reasoned entry to SPECIAL_FILE_ROSTER in THIS file. Do NOT: " +
      "bump a count, allowlist the bare path with no reason, or narrow the SPECIAL_FILE regex above — each of " +
      "those retires this wall while looking like housekeeping.",
    );
  });

  it("VACUITY CONTROL: an unregistered plant is caught", () => {
    // The demonstrated attack (a): a root `template.tsx` wrapping every route
    // group. Its directory is `app`, which is not under either entrance layout's
    // directory, so it cannot be ancestor-covered — exactly the gap this wall
    // closes. classifySpecial() needs no file on disk: it is a pure registry
    // lookup, so this cell is a permanent, always-on rerun of the RED this file's
    // PR body records having produced with the file actually planted.
    assert.equal(classifySpecial("app/template.tsx"), "UNCLASSIFIED");
    assert.equal(classifySpecial("app/(firm)/error.tsx"), "ancestor-covered");
  });

  it("every SPECIAL_FILE_ROSTER entry carries a substantial reason and exists on disk", () => {
    for (const entry of SPECIAL_FILE_ROSTER) {
      assert.ok(existsSync(join(WEB_ROOT, entry.path)), `${entry.path} is rostered but does not exist`);
      assert.ok(entry.reason.length >= 80, `${entry.path}'s reason is too thin`);
    }
  });
});

describe("WALL 2 — every \"use server\" action calls the spine, or is registered", () => {
  // Duplicated locally rather than imported from firm-scope-surfaces.test.ts,
  // which is not designed to be imported — importing a test module re-registers
  // its `describe`/`it` blocks as a side effect (the exact reason W-R-1 moved
  // `LEAF` OUT of that file rather than exporting it in place).
  const SPINE_IMPORT = "@/lib/require-firm-scope";
  const SPINE_NAMES = new Set(["requireFirmScope", "firmScopeGuard", "resolveFirmScope"]);
  const isSpineCall = (call: ReturnType<typeof reachableCallsFrom>[number]): boolean =>
    call.importedFrom === SPINE_IMPORT && SPINE_NAMES.has(call.importedName ?? "");

  /**
   * A directive is a PARSE FACT, not a string (review law 3 — spelling is not
   * identity). `stripComments(src)` — the oracle's own, PLAIN, `{blankStrings:
   * true}` NOT passed — blanks real comments while leaving every string literal
   * (the directive included) intact. Measured on this machine against the
   * shipping `stripComments`: passing `{blankStrings: true}` blanks the directive
   * ITSELF, because a directive prologue IS a string literal, and every plant
   * below comes back not-red under it. The regex then requires the directive to be
   * the module's FIRST statement — anchored at the start of the (comment-blanked)
   * source, immediately followed by only whitespace and a statement terminator (a
   * `;`, a newline, or end of file) — so a same-spelled string sitting anywhere
   * else in the file, in directive POSITION or not, cannot match.
   */
  const USE_SERVER_DIRECTIVE = /^\s*(["'])use server\1(?=\s*[;\r\n]|\s*$)/;

  function hasUseServerDirective(rawCode: string, path = "plant.ts"): boolean {
    return USE_SERVER_DIRECTIVE.test(stripComments({ path, code: rawCode }).code);
  }

  function isUseServerModule(webRelativePath: string): boolean {
    return hasUseServerDirective(readSource(webRelativePath), webRelativePath);
  }

  function exportedNames(unit: SourceUnit): string[] {
    return moduleLevelDeclarations(unit).filter((d) => d.exported).map((d) => d.name);
  }

  /** Unlike a page/route root (always `default`, or the fixed HTTP-method names),
   *  a Server Action file's exports are arbitrary named functions — so every
   *  exported name is its own execution root, checked independently, exactly the
   *  surface-aware discipline `executionRoots()` already applies to route
   *  handlers in the sibling census. */
  function actionCallsSpine(webRelativePath: string): boolean {
    const unit = stripComments(readSourceUnit(webRelativePath));
    return exportedNames(unit).some((name) => reachableCallsFrom(unit, name).some(isSpineCall));
  }

  /**
   * Registered "use server" files that legitimately do NOT call the spine, each
   * with the reason — the census's own escape valve, exactly like
   * SPECIAL_FILE_ROSTER above. Empty today: zero "use server" files exist
   * (measured below).
   */
  const USE_SERVER_ACTION_ROSTER: ReadonlyArray<{ readonly path: string; readonly reason: string }> = [];

  const scannedFiles = (): string[] => [...walkSources(APP_DIR), ...walkSources(LIB_DIR)].map(webRelative);
  const actionFiles = scannedFiles().filter(isUseServerModule);

  it("VACUITY CONTROL: zero \"use server\" files exist today (measured, not assumed)", () => {
    // grep -rn '"use server"' app lib and grep -rn \"'use server'\" app lib both
    // returned nothing on this branch. This is a GATE gap, not a live hole — #455
    // (members) and FS-4 (checkout) are exactly the trains that add the first one.
    assert.deepEqual(actionFiles, [], "a \"use server\" action now exists — the next cell governs it from here");
  });

  it("MUST-NOT-RED CONTROL: an ordinary registered page/route carries no directive", () => {
    assert.equal(isUseServerModule("app/login/page.tsx"), false);
    assert.equal(isUseServerModule("app/api/runtime/[...path]/route.ts"), false);
  });

  it("every \"use server\" action calls the spine, or is registered with a written reason", () => {
    const unregistered = actionFiles
      .filter((f) => !actionCallsSpine(f))
      .filter((f) => !USE_SERVER_ACTION_ROSTER.some((r) => r.path === f));
    assert.deepEqual(
      unregistered,
      [],
      "a \"use server\" export reads or writes firm-scoped state with no reachable call to " +
      "requireFirmScope()/firmScopeGuard()/resolveFirmScope() and no registered reason — call the spine, or " +
      "add a reasoned USE_SERVER_ACTION_ROSTER entry in THIS file explaining why not.",
    );
  });

  it("every USE_SERVER_ACTION_ROSTER entry carries a substantial reason and exists on disk", () => {
    for (const entry of USE_SERVER_ACTION_ROSTER) {
      assert.ok(existsSync(join(WEB_ROOT, entry.path)), `${entry.path} is rostered but does not exist`);
      assert.ok(entry.reason.length >= 80, `${entry.path}'s reason is too thin`);
    }
  });

  describe("THE POSITIVE CONTROL — four plants, so this wall cannot be vacuously green forever", () => {
    it("a double-quoted directive IS caught", () => {
      assert.equal(hasUseServerDirective('"use server";\nexport async function act() { return null; }'), true);
    });

    it("a single-quoted directive IS caught", () => {
      assert.equal(hasUseServerDirective("'use server';\nexport async function act() { return null; }"), true);
    });

    it("the directive text inside a COMMENT is NOT caught", () => {
      assert.equal(hasUseServerDirective('// "use server"\nexport async function act() { return null; }'), false);
    });

    it("the directive text inside a STRING CONSTANT, not in directive position, is NOT caught", () => {
      assert.equal(hasUseServerDirective('export async function act() { return null; }\nconst x = "use server";'), false);
    });

    it("the full pipeline catches an unregistered planted action, and clears a genuinely guarded one", () => {
      const plantedNoSpine: SourceUnit = {
        path: "planted-action.ts",
        code: '"use server";\nexport async function readFirmData() { return {}; }',
      };
      assert.equal(hasUseServerDirective(plantedNoSpine.code, plantedNoSpine.path), true, "the plant's directive went undetected");
      const strippedPlant = stripComments(plantedNoSpine);
      assert.equal(
        exportedNames(strippedPlant).some((name) => reachableCallsFrom(strippedPlant, name).some(isSpineCall)),
        false,
        "the plant does not call the spine, and the scanner must say so",
      );

      const plantedGuarded: SourceUnit = {
        path: "planted-action-guarded.ts",
        code: [
          '"use server";',
          'import { requireFirmScope } from "@/lib/require-firm-scope";',
          "export async function readFirmData() {",
          "  await requireFirmScope();",
          "  return {};",
          "}",
        ].join("\n"),
      };
      const strippedGuarded = stripComments(plantedGuarded);
      assert.equal(
        exportedNames(strippedGuarded).some((name) => reachableCallsFrom(strippedGuarded, name).some(isSpineCall)),
        true,
        "a genuinely guarded action must pass",
      );
    });
  });
});
