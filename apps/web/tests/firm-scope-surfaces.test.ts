// `./next-runtime-globals` FIRST — this file imports lib/require-firm-scope.ts for
// its registries, and that module loads `next/navigation`.
import "./next-runtime-globals";

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ts from "typescript";

import {
  SCOPE_ENTRANCES,
  SCOPE_EXEMPT_SURFACES,
  SCOPE_UNSCOPED_SURFACES,
} from "../lib/require-firm-scope";
import {
  defaultExportName,
  exportedHttpMethods,
  reachableFrom,
  stripComments,
  tryBlockRanges,
} from "../test/sourceOracle";

/**
 * THE SCOPE SPINE'S STRUCTURAL HALF (P4-2). Behaviour is
 * `tests/require-firm-scope.test.ts`; the DB pins are
 * `tests/firm-scope-db-pins.test.ts`.
 *
 * THE CENSUS IS LEAF-FIRST, NOT CALLER-FIRST (Codex review of #451, MEDIUM-3).
 * The previous version inventoried only files already detected as callers, so a
 * new authenticated leaf — `app/export/page.tsx`, say — was invisible to it: it
 * simply was not in the set being checked. This version enumerates EVERY
 * `page`/`route` leaf the App Router serves and requires each to fall into one of
 * four classes — public, ancestor-covered, direct entrance, proven exemption. A
 * leaf it cannot classify RES the suite by name. Absence of a caller is no longer
 * mistaken for absence of a surface.
 *
 * And the call must be REAL and EXECUTED: detection runs on comment-stripped,
 * string-blanked code, over only the declarations reachable from the module's
 * exports. A decoy in a string, and a call in a helper nobody invokes, both fail.
 */

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(WEB_ROOT, "app");

const LEAF = /^(page|route)\.(ts|tsx|js|jsx)$/;
const SOURCE_EXT = /\.(ts|tsx)$/;

type CourierRefusal = { readonly code: string; readonly start: number; readonly end: number };

/** Every courierError return the handler can take before its first governed door
 * call. This is the executable refusal surface, not a list of expected spellings. */
function preDoorCourierRefusals(source: string): CourierRefusal[] {
  const file = ts.createSourceFile("courier.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const handler = file.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === "handleInviteRequest",
  );
  assert.ok(handler?.body, "handleInviteRequest body was not found");
  let doorAt = Number.POSITIVE_INFINITY;
  const locateDoor = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "call"
    ) doorAt = Math.min(doorAt, node.getStart(file));
    ts.forEachChild(node, locateDoor);
  };
  ts.forEachChild(handler.body, locateDoor);
  assert.ok(Number.isFinite(doorAt), "the governed door call was not found");

  const refusals: CourierRefusal[] = [];
  const visit = (node: ts.Node): void => {
    if (node.getStart(file) >= doorAt) return;
    if (
      ts.isReturnStatement(node) &&
      node.expression !== undefined &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "courierError"
    ) {
      const code = node.expression.arguments[1];
      assert.ok(code !== undefined && ts.isStringLiteralLike(code), "pre-door courierError has no literal code");
      refusals.push({ code: code.text, start: node.getStart(file), end: node.end });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(handler.body, visit);
  return refusals.sort((a, b) => a.start - b.start);
}

function webRelative(abs: string): string {
  return relative(WEB_ROOT, abs).split(sep).join("/");
}

function readSource(webRelativePath: string): string {
  return readFileSync(join(WEB_ROOT, webRelativePath), "utf8");
}

/** Comments stripped, strings KEPT — for import specifiers and header reads. */
const codeWithStrings = (p: string): string => stripComments(readSource(p));

/**
 * THE EXECUTION ROOTS of a surface — the entry points a REQUEST actually runs
 * through, each with the code reachable from it.
 *
 * SURFACE-AWARE, not "every export" (#451 Codex round 2, item 1). Rooting every
 * export and taking the union answers "is there a guard somewhere in this file?",
 * which is not the question. Two real bypasses followed from it:
 *   - a page whose DEFAULT render is unguarded passed when some other export —
 *     `generateStaticParams()`, which Next runs at BUILD time, not per request —
 *     called the guard;
 *   - a Route Handler with a guarded `GET` and an unguarded `POST` passed, because
 *     each HTTP method export is a SEPARATE handler and the union hid that.
 * So: for a page or layout, the default export and nothing else. For a route
 * handler, EVERY exported method, checked independently.
 */
function executionRoots(p: string): { root: string; code: string }[] {
  const code = stripComments(readSource(p), { blankStrings: true });
  if (isRouteLeaf(p)) {
    return exportedHttpMethods(code).map((method) => ({
      root: method,
      code: reachableFrom(code, method) ?? "",
    }));
  }
  const name = defaultExportName(code);
  return name === null ? [] : [{ root: name, code: reachableFrom(code, name) ?? "" }];
}

/** The union, for the few cells that legitimately ask "anywhere in what runs". */
const executedCode = (p: string): string =>
  executionRoots(p).map((r) => r.code).join("\n");

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

/** Every route leaf the App Router serves, with the URL path it answers on.
 *  Route groups `(x)`, parallel slots `@x` and private folders `_x` contribute no
 *  URL segment — that is what makes a group a group, and it is exactly why a check
 *  in one group's layout does not cover a sibling's. */
function routeLeaves(dir: string = APP_DIR, segments: string[] = [], out: { file: string; url: string }[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) continue;
      const isGroup =
        (entry.name.startsWith("(") && entry.name.endsWith(")")) || entry.name.startsWith("@");
      routeLeaves(abs, isGroup ? segments : [...segments, entry.name], out);
    } else if (entry.isFile() && LEAF.test(entry.name)) {
      out.push({ file: webRelative(abs), url: `/${segments.join("/")}` });
    }
  }
  return out;
}

/** The registered entrance layouts, as the directories they cover. */
const ENTRANCE_LAYOUT_DIRS = SCOPE_ENTRANCES.filter((e) => e.path.endsWith("/layout.tsx")).map((e) =>
  e.path.slice(0, -"/layout.tsx".length),
);

const isRouteLeaf = (file: string): boolean => /\/route\.(ts|tsx|js|jsx)$/.test(file);

/**
 * Does a registered entrance LAYOUT wrap this leaf?
 *
 * **Only ever true for a page.** A Route Handler is not rendered inside the React
 * tree, so no `layout.tsx` runs for it — `app/(firm)/scratch/route.ts` sits under
 * the firm group's directory and is nonetheless completely ungated by that group's
 * layout. The first version of this classifier treated directory containment as
 * coverage for every leaf kind, which is exactly the hole the independent review
 * of #451 named (FIND-2): a route handler dropped anywhere under `(firm)/` passed.
 */
function ancestorCovered(file: string): boolean {
  if (isRouteLeaf(file)) return false;
  const dir = file.slice(0, file.lastIndexOf("/"));
  return ENTRANCE_LAYOUT_DIRS.some((d) => dir === d || dir.startsWith(`${d}/`));
}

function classify(leaf: { file: string; url: string }): string {
  if (SCOPE_ENTRANCES.some((e) => e.path === leaf.file)) return "direct entrance";
  const exempt = SCOPE_EXEMPT_SURFACES.find((e) => e.path === leaf.file);
  if (exempt) return exempt.pending ? "PENDING exemption on a file that EXISTS" : "proven exemption";
  if (SCOPE_UNSCOPED_SURFACES.some((s) => s.path === leaf.file)) return "registered unscoped";
  if (ancestorCovered(leaf.file)) return "ancestor-covered";
  return "UNCLASSIFIED";
}

const OK_CLASSES = ["registered unscoped", "ancestor-covered", "direct entrance", "proven exemption"];

const SPINE_IMPORT = /from\s+["']@\/lib\/require-firm-scope["']/;
const SPINE_CALL = /\b(requireFirmScope|firmScopeGuard|resolveFirmScope)\s*\(/;

/** Imports the spine AND actually executes one of its entrances. */
function callsSpine(p: string): boolean {
  return SPINE_IMPORT.test(codeWithStrings(p)) && SPINE_CALL.test(executedCode(p));
}

describe("MEDIUM-3 — every route leaf is classified, or this suite reds", () => {
  const leaves = routeLeaves();

  it("VACUITY CONTROL: the walk found the real tree", () => {
    assert.ok(leaves.length > 15, `only ${leaves.length} route leaves found under ${APP_DIR}`);
    const files = leaves.map((l) => l.file);
    for (const expected of [
      "app/login/page.tsx",
      "app/logout/route.ts",
      "app/api/runtime/[...path]/route.ts",
      "app/(firm)/page.tsx",
    ]) {
      assert.ok(files.includes(expected), `the walk missed ${expected}`);
    }
  });

  it("route groups contribute NO url segment — the reason siblings are not covered", () => {
    const byFile = new Map(leaves.map((l) => [l.file, l.url]));
    assert.equal(byFile.get("app/(firm)/page.tsx"), "/");
    assert.equal(byFile.get("app/(full)/clara/[threadId]/page.tsx"), "/clara/[threadId]");
    assert.equal(byFile.get("app/login/page.tsx"), "/login");
  });

  it("EVERY leaf classifies — an unclassified authenticated surface is a hole", () => {
    const unclassified = leaves
      .map((l) => ({ ...l, klass: classify(l) }))
      .filter((l) => !OK_CLASSES.includes(l.klass));
    assert.deepEqual(
      unclassified.map((l) => `${l.file} (${l.url}) → ${l.klass}`),
      [],
      "a route leaf is neither registered-unscoped, nor under a registered entrance layout, nor an entrance, nor a proven exemption",
    );
  });

  it("CELL 1 — every route.ts is an ENTRANCE or an EXEMPTION, never merely nested", () => {
    // A Route Handler runs no layout. Directory containment is not coverage for
    // one, so it has to be named — FIND-2's `app/(firm)/scratch/route.ts`.
    const routes = leaves.filter((l) => isRouteLeaf(l.file)).map((l) => l.file).sort();
    const named = [
      ...SCOPE_ENTRANCES.map((e) => e.path),
      ...SCOPE_EXEMPT_SURFACES.map((e) => e.path),
    ];
    const unnamed = routes.filter((f) => !named.includes(f));
    assert.deepEqual(unnamed, [], "a route handler is gated by nothing and registered nowhere");
    assert.ok(routes.length >= 2, `only ${routes.length} route handlers found — the walk is not seeing them`);
  });

  it("CELL 1b — no route leaf hides its methods behind `export *`", () => {
    // `exportedHttpMethods()` enumerates THIS module's declarations and export
    // clauses (#451 round-3, MED-1). A star re-export routes methods it cannot
    // see, so the census would be silently INCOMPLETE rather than wrong — the
    // worse of the two failures, because nothing reds. Nothing in the tree does
    // this today; this cell is what keeps that true.
    const hiding = leaves
      .filter((l) => isRouteLeaf(l.file))
      .filter((l) => /\bexport\s*\*/.test(stripComments(readSource(l.file), { blankStrings: true })))
      .map((l) => l.file);
    assert.deepEqual(hiding, [], "a route handler star-re-exports — the method census cannot see through it");
  });

  it("CELL 2 — every page.tsx has an entrance ANCESTOR or is registered unscoped", () => {
    const pages = leaves.filter((l) => !isRouteLeaf(l.file));
    const unproven = pages
      .filter((l) => !ancestorCovered(l.file) && !SCOPE_UNSCOPED_SURFACES.some((s) => s.path === l.file))
      .map((l) => l.file);
    assert.deepEqual(unproven, [], "a page renders with no entrance above it and no registered reason");
    assert.ok(pages.length >= 15, `only ${pages.length} pages found — the walk is not seeing them`);
  });

  it("VACUITY CONTROL: the two attacks FIND-2 named are both caught", () => {
    assert.equal(
      classify({ file: "app/export/page.tsx", url: "/export" }),
      "UNCLASSIFIED",
      "a new authenticated page passes",
    );
    assert.equal(
      classify({ file: "app/(firm)/scratch/route.ts", url: "/scratch" }),
      "UNCLASSIFIED",
      "a route handler under an entrance group passes — layouts do not wrap route handlers",
    );
    assert.equal(ancestorCovered("app/(firm)/scratch/route.ts"), false);
    assert.equal(ancestorCovered("app/(firm)/clients/page.tsx"), true);
    assert.equal(classify({ file: "app/login/page.tsx", url: "/login" }), "registered unscoped");
  });

  it("VACUITY CONTROL: the three registries are non-empty and their files exist", () => {
    assert.equal(SCOPE_ENTRANCES.length, 3);
    assert.ok(SCOPE_EXEMPT_SURFACES.length >= 2);
    assert.ok(SCOPE_UNSCOPED_SURFACES.length >= 3);
    for (const s of SCOPE_UNSCOPED_SURFACES) {
      assert.ok(existsSync(join(WEB_ROOT, s.path)), `${s.path} is registered unscoped but does not exist`);
      assert.ok(s.reason.length >= 80, `${s.path}'s reason is too thin`);
    }
  });

  it("the public entries match lib/supabase/proxy.ts, BOTH ways", () => {
    const proxy = codeWithStrings("lib/supabase/proxy.ts");
    const m = /const\s+PUBLIC_PATH_PREFIXES\s*=\s*\[([^\]]*)\]/.exec(proxy);
    assert.ok(m, "proxy.ts no longer declares PUBLIC_PATH_PREFIXES where this gate can read it");
    const declared = [...(m[1] as string).matchAll(/["']([^"']+)["']/g)].map((x) => x[1]).sort();
    const registered = SCOPE_UNSCOPED_SURFACES.filter((s) => s.public).map((s) => s.url).sort();
    assert.deepEqual(
      declared,
      registered,
      "the app's auth gate and the spine's idea of 'public' have drifted apart",
    );
  });
});

describe("the spine has ONE implementation and exactly three entrances", () => {
  const appFiles = walkSources(APP_DIR).map(webRelative);
  const libFiles = walkSources(join(WEB_ROOT, "lib")).map(webRelative);
  const componentFiles = walkSources(join(WEB_ROOT, "components")).map(webRelative);

  it("VACUITY CONTROL: the detector sees a real call and not a fake one", () => {
    assert.equal(callsSpine("app/(firm)/layout.tsx"), true, "blind to a call it is pointed straight at");
    assert.equal(callsSpine("app/layout.tsx"), false, "reports a call the root layout does not make");

    // The three shapes that fooled earlier versions of this gate.
    const importLine = 'import { requireFirmScope } from "@/lib/require-firm-scope";';
    const commentOnly = `${importLine}\n// requireFirmScope() would be the wrong wall here\nexport default function S() { return null; }`;
    const stringDecoy = `${importLine}\nconst decoy = "requireFirmScope()";\nexport default function S() { return decoy; }`;
    const deadHelper = `${importLine}\nfunction unused() { requireFirmScope(); }\nexport default function S() { return null; }`;
    const realCall = `${importLine}\nexport default async function S() { await requireFirmScope(); return null; }`;
    const viaHelper = `${importLine}\nasync function guard() { await requireFirmScope(); }\nexport default async function S() { await guard(); return null; }`;

    const detect = (src: string) => {
      const code = stripComments(src, { blankStrings: true });
      const name = defaultExportName(code);
      return (
        SPINE_IMPORT.test(stripComments(src)) &&
        name !== null &&
        SPINE_CALL.test(reachableFrom(code, name) ?? "")
      );
    };

    assert.equal(detect(commentOnly), false, "a comment-only mention counts as a call");
    assert.equal(detect(stringDecoy), false, "a string decoy counts as a call — MEDIUM-3 attack B");
    assert.equal(detect(deadHelper), false, "a never-invoked helper counts as a guard");
    assert.equal(detect(realCall), true, "a real call is invisible");
    assert.equal(detect(viaHelper), true, "a call one hop from the export is invisible");
  });

  it("VACUITY CONTROL: the stripper keeps string literals, drops both comment forms", () => {
    const s = stripComments('const u = "https://a.example/x"; // LINE_GONE\n/* BLOCK_GONE */ const v = `t//t`;');
    assert.ok(s.includes("https://a.example/x") && s.includes("t//t"));
    assert.ok(!s.includes("LINE_GONE") && !s.includes("BLOCK_GONE"));
  });

  it("exactly one module DEFINES each spine export", () => {
    for (const symbol of ["resolveFirmScope", "requireFirmScope", "firmScopeGuard"]) {
      const definers = [...libFiles, ...appFiles, ...componentFiles].filter((p) =>
        new RegExp(`export\\s+(async\\s+)?function\\s+${symbol}\\b`).test(codeWithStrings(p)),
      );
      assert.deepEqual(definers, ["lib/require-firm-scope.ts"], `${symbol} is defined in ${definers.length} place(s)`);
    }
  });

  it("the app tree's spine callers ARE the registry, both ways", () => {
    const found = appFiles.filter(callsSpine).sort();
    assert.deepEqual(found, SCOPE_ENTRANCES.map((e) => e.path).sort());
    assert.equal(SCOPE_ENTRANCES.length, 3);
  });

  it("EVERY execution root of every entrance calls the spine, bare", () => {
    for (const entrance of SCOPE_ENTRANCES) {
      assert.ok(existsSync(join(WEB_ROOT, entrance.path)), `${entrance.path} is missing`);
      const roots = executionRoots(entrance.path);
      assert.ok(roots.length > 0, `${entrance.path} exposes no execution root at all`);
      for (const { root, code } of roots) {
        assert.match(
          code,
          /\b(requireFirmScope|firmScopeGuard)\(\s*\)/,
          `${entrance.path}: the ${root} entry point does not call the spine`,
        );
        assert.doesNotMatch(
          code,
          /\b(requireFirmScope|firmScopeGuard)\(\s*[^)\s]/,
          `${entrance.path}: ${root} passes an argument — an entrance is never handed its own reader`,
        );
      }
    }
  });

  it("the API entrance's roots ARE its exported HTTP methods", () => {
    // Each method export is its own handler, so "the roots" is not a detail: it is
    // the set this suite must prove one at a time.
    const api = SCOPE_ENTRANCES.find((e) => e.onDenial === "403");
    assert.ok(api);
    const roots = executionRoots(api.path).map((r) => r.root).sort();
    assert.deepEqual(roots, ["GET", "POST", "PUT"], "the proxy's exported methods changed");
  });

  it("FIND-1 — every entrance AWAITS the spine", () => {
    // A dropped `await` disarms the guard SILENTLY: `redirect()` throws
    // NEXT_REDIRECT inside the floating promise, so the layout returns its markup
    // and paints firm chrome for a caller with no firm, while the rejection
    // surfaces later as an unhandled rejection nobody reads. tsc is happy; the
    // behavioural suite is happy, because it calls the spine directly and never
    // through the layout. Only this pin and the type-checked
    // `@typescript-eslint/no-floating-promises` rule (eslint.config.mjs, the
    // apps/web/app block) see it.
    for (const entrance of SCOPE_ENTRANCES) {
      for (const { root, code } of executionRoots(entrance.path)) {
        assert.match(
          code,
          /await\s+(requireFirmScope|firmScopeGuard)\(\s*\)/,
          `${entrance.path}: ${root} calls the spine without awaiting it — the redirect throw floats and the surface renders anyway`,
        );
      }
    }
  });

  it("VACUITY CONTROL: a build-time export cannot stand in for the render", () => {
    // Next runs generateStaticParams at BUILD time; a guard there protects no
    // request. Rooting every export made this pass (#451 Codex round 2, item 1).
    const src = [
      'import { requireFirmScope } from "@/lib/require-firm-scope";',
      "export async function generateStaticParams() { await requireFirmScope(); return []; }",
      "export default async function Page() { return null; }",
    ].join("\n");
    const code = stripComments(src, { blankStrings: true });
    const name = defaultExportName(code);
    assert.equal(name, "Page");
    assert.doesNotMatch(
      reachableFrom(code, name as string) ?? "",
      /requireFirmScope\(/,
      "a guard in generateStaticParams is being counted as guarding the render",
    );
  });

  it("FIND-1b — no entrance calls the spine INSIDE a try block", () => {
    // AWAITING IS NOT ENOUGH, AND NEITHER IS CALLING (#451 round-3, MED-2).
    // `requireFirmScope()` denies by calling `redirect()`, which SIGNALS BY
    // THROWING `NEXT_REDIRECT`. So `try { await requireFirmScope(); } catch {}`
    // disarms the entrance completely — the redirect is swallowed and the layout
    // paints firm chrome for a caller with no firm — while satisfying the FIND-1
    // await pin, `@typescript-eslint/no-floating-promises` and `tsc` all at once.
    // Measured: with that mutation in place the suite was 125 pass / 0 fail,
    // eslint 0 and tsc 0. Nothing here could see it; this cell can.
    //
    // Applied to the 403 entrance too, where the mechanism differs but the
    // conclusion does not: `firmScopeGuard()` returns its refusal rather than
    // throwing, but a `catch` around it still turns a resolution failure into a
    // silently continuing request. An entrance has no business swallowing either.
    for (const entrance of SCOPE_ENTRANCES) {
      for (const { root, code } of executionRoots(entrance.path)) {
        const ranges = tryBlockRanges(code);
        for (const call of code.matchAll(/\b(requireFirmScope|firmScopeGuard)\s*\(/g)) {
          const at = call.index;
          assert.equal(
            ranges.some(([s, e]) => at >= s && at < e),
            false,
            `${entrance.path}: ${root} calls the spine inside a try block — a denial that THROWS is swallowed and the surface continues`,
          );
        }
      }
    }
  });

  it("VACUITY CONTROL: the try-block instrument sees the swallow, and only it", () => {
    const swallowed = [
      'import { requireFirmScope } from "@/lib/require-firm-scope";',
      "export default async function S() { try { await requireFirmScope(); } catch {} return null; }",
    ].join("\n");
    const armed = [
      'import { requireFirmScope } from "@/lib/require-firm-scope";',
      "export default async function S() { await requireFirmScope(); try { await load(); } catch {} return null; }",
    ].join("\n");
    const swallowsSpine = (src: string) => {
      const code = stripComments(src, { blankStrings: true });
      const body = reachableFrom(code, defaultExportName(code) as string) ?? "";
      const ranges = tryBlockRanges(body);
      return [...body.matchAll(/\brequireFirmScope\s*\(/g)].some((m) =>
        ranges.some(([s, e]) => m.index >= s && m.index < e),
      );
    };
    assert.equal(swallowsSpine(swallowed), true, "a try/catch around the spine call is invisible");
    assert.equal(
      swallowsSpine(armed),
      false,
      "a try block ELSEWHERE in the body is read as swallowing the guard — the cell would red on honest code",
    );
    // The instrument reads the same string-blanked code every other cell here
    // does, so a `try {` written inside a string literal is not a try block.
    assert.equal(
      tryBlockRanges(stripComments('const s = "try {"; try { a(); } catch {}', { blankStrings: true })).length,
      1,
      "a `try {` inside a string counted as a real try block",
    );
  });

  it("VACUITY CONTROL: a guarded GET does not cover an unguarded POST", () => {
    const src = [
      'import { firmScopeGuard } from "@/lib/require-firm-scope";',
      "async function guarded() { const g = await firmScopeGuard(); return g; }",
      "export const GET = guarded;",
      "export async function POST() { return Response.json({ ok: true }); }",
    ].join("\n");
    const code = stripComments(src, { blankStrings: true });
    assert.deepEqual(exportedHttpMethods(code).sort(), ["GET", "POST"]);
    assert.match(reachableFrom(code, "GET") ?? "", /firmScopeGuard\(/, "GET should be guarded here");
    assert.doesNotMatch(
      reachableFrom(code, "POST") ?? "",
      /firmScopeGuard\(/,
      "POST is unguarded but the walker reports it covered — the per-method claim is vacuous",
    );
  });

  it("VACUITY CONTROL: an ALIASED or `let`-bound method export is still a root", () => {
    // MED-1. Next 16 dispatches off the module's export RECORD (`handlers[method]`
    // / `method in userland`), so `export { raw as DELETE }` and `export let
    // DELETE = raw` route exactly as `export function DELETE()` does. The census
    // read only the two easy spellings, so an unguarded DELETE added in either
    // shape passed BOTH per-root cells — "the API entrance's roots ARE its
    // exported HTTP methods" and "EVERY execution root calls the spine" — because
    // it was never named as a root at all. Review law 3: the instrument was
    // reading a SPELLING and calling it the export.
    const aliased = [
      'import { firmScopeGuard } from "@/lib/require-firm-scope";',
      "async function handler() { const g = await firmScopeGuard(); return g; }",
      "async function raw() { return Response.json({ ok: true }); }",
      "export { handler as GET };",
      "export { raw as DELETE };",
    ].join("\n");
    const aliasedCode = stripComments(aliased, { blankStrings: true });
    assert.deepEqual(exportedHttpMethods(aliasedCode).sort(), ["DELETE", "GET"]);
    // And the alias resolves to the RIGHT body, both ways — otherwise every
    // aliased export would red for want of a body rather than for want of a guard.
    assert.match(reachableFrom(aliasedCode, "GET") ?? "", /firmScopeGuard\(/);
    assert.doesNotMatch(reachableFrom(aliasedCode, "DELETE") ?? "", /firmScopeGuard\(/);

    const letBound = [
      'import { firmScopeGuard } from "@/lib/require-firm-scope";',
      "async function raw() { return Response.json({ ok: true }); }",
      "export let DELETE = raw;",
    ].join("\n");
    const letCode = stripComments(letBound, { blankStrings: true });
    assert.deepEqual(exportedHttpMethods(letCode), ["DELETE"]);
    assert.doesNotMatch(reachableFrom(letCode, "DELETE") ?? "", /firmScopeGuard\(/);

    // A type-only clause exports nothing at runtime and must not invent a root.
    assert.deepEqual(exportedHttpMethods(stripComments("export type { DELETE };")), []);
    // …and the whitespace between `export` and `{` is formatting, not meaning.
    assert.deepEqual(exportedHttpMethods(stripComments("function raw() {}\nexport{raw as DELETE};")), ["DELETE"]);
  });

  it("FIND-1 — the 403 entrance RETURNS the refusal, not merely computes it", () => {
    // Awaiting is not enough for the API entrance: a guard whose refusal is
    // computed and dropped is the same hole one line further on.
    const entrance = SCOPE_ENTRANCES.find((e) => e.onDenial === "403");
    assert.ok(entrance, "no 403 entrance is registered");
    const code = executedCode(entrance.path);
    const m = /const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+firmScopeGuard\(\s*\)/.exec(code);
    assert.ok(m, "the 403 entrance does not bind the guard result to a name");
    const bound = m[1] as string;
    assert.match(
      code,
      new RegExp(`return\\s+${bound}\\.response`),
      `${entrance.path} never returns ${bound}.response — the refusal is computed and discarded`,
    );
  });

  it("the two layouts REDIRECT and the API route REFUSES — not the other way round", () => {
    for (const entrance of SCOPE_ENTRANCES) {
      const code = executedCode(entrance.path);
      if (entrance.onDenial === "redirect") {
        assert.match(code, /requireFirmScope\(\s*\)/, `${entrance.path} must redirect`);
        assert.doesNotMatch(code, /firmScopeGuard/, `${entrance.path} must not answer a status`);
      } else {
        assert.match(code, /firmScopeGuard\(\s*\)/, `${entrance.path} must answer a status`);
        assert.doesNotMatch(code, /requireFirmScope\(/, `${entrance.path} must not redirect a data request`);
      }
    }
  });
});

describe("HIGH-1 — the guard dominates the proxy, and owns the outbound identity", () => {
  const ROUTE = "app/api/runtime/[...path]/route.ts";

  it("the guard call PRECEDES the proxy call", () => {
    const code = executedCode(ROUTE);
    const guardAt = code.search(/firmScopeGuard\(\s*\)/);
    const proxyAt = code.search(/\breturn\s+proxy\(/);
    assert.ok(guardAt >= 0, "the guard call is gone");
    assert.ok(proxyAt >= 0, "the proxy call is gone");
    assert.ok(guardAt < proxyAt, "the proxy runs before the guard — the request leaves unguarded");
  });

  it("the route NEVER reads an inbound Authorization header", () => {
    assert.doesNotMatch(
      codeWithStrings(ROUTE),
      /headers\.get\(\s*["'`]authorization/i,
      "the caller's own bearer is being read — HIGH-1's split principal",
    );
  });

  it("the outbound token comes from the guard's own session", () => {
    assert.match(executedCode(ROUTE), /guard\.session\.accessToken/);
  });
});

describe("the deliberate exemptions stay exempt", () => {
  it("the registry names both, each with a substantial reason", () => {
    const paths = SCOPE_EXEMPT_SURFACES.map((e) => e.path).sort();
    assert.deepEqual(paths, ["app/api/invite/route.ts", "app/logout/route.ts"]);
    for (const entry of SCOPE_EXEMPT_SURFACES) {
      assert.ok(entry.reason.length >= 120, `${entry.path}'s reason is too thin to survive a later lane`);
      assert.match(entry.reason, /EXEMPT (BY NECESSITY|ON PRINCIPLE)/);
    }
  });

  it("a PENDING exemption must not exist on disk — it excuses nothing", () => {
    // MEDIUM-3's third point: the future courier was pre-exempted, so the day it
    // lands it would inherit an exemption written before anyone could read its
    // body. It now has to be re-classified deliberately: the moment the file
    // exists, this cell reds until P4-4 clears `pending` — which is the step where
    // someone actually reads what it does.
    for (const entry of SCOPE_EXEMPT_SURFACES.filter((e) => e.pending)) {
      assert.equal(
        existsSync(join(WEB_ROOT, entry.path)),
        false,
        `${entry.path} now exists but is still marked pending — capability-check its body and clear the flag`,
      );
    }
  });

  it("no exempt file that EXISTS calls the spine", () => {
    const present = SCOPE_EXEMPT_SURFACES.filter((e) => existsSync(join(WEB_ROOT, e.path)));
    assert.ok(present.length >= 1, "this check ran against nothing");
    for (const entry of present) {
      assert.equal(callsSpine(entry.path), false, `${entry.path} is registered EXEMPT but calls the spine`);
    }
  });

  it("logout carries its exemption in its OWN source, where a 'fixing' lane looks", () => {
    const src = readSource("app/logout/route.ts");
    assert.match(src, /DELIBERATELY EXEMPT FROM THE SCOPE SPINE/);
    assert.match(src, /do not "fix"/);
    assert.match(src, /SCOPE_EXEMPT_SURFACES/);
  });

  it("the invite courier carries its exemption in its OWN source too (P4-4)", () => {
    const src = readSource("app/api/invite/route.ts");
    assert.match(src, /DELIBERATELY EXEMPT FROM THE SCOPE SPINE/);
    assert.match(src, /do not "fix"/);
    assert.match(src, /SCOPE_EXEMPT_SURFACES/);
    // The reason, not just the label: the registry's own words are "THE DB IS
    // THE WALL", and a courier whose source stopped saying why is one round of
    // "tidying" from acquiring a scope check.
    assert.match(src, /THE DB IS THE WALL/);
  });

  it("the invite exemption's pre-door refusal count comes from handleInviteRequest's control flow", () => {
    const source = readSource("lib/members/courier.ts");
    const refusals = preDoorCourierRefusals(source);
    assert.equal(refusals.length, 8, "seven conceptual gates currently expose eight refusal sites");
    assert.deepEqual(refusals.map((r) => r.code), [
      "cross_origin",
      "invalid_request",
      "unsupported_address",
      "no_session",
      "not_permitted",
      "mail_not_configured",
      "mail_unavailable",
      "recipient_has_account",
    ]);

    for (const refusal of refusals) {
      const mutant = source.slice(0, refusal.start) + source.slice(refusal.end);
      assert.equal(
        preDoorCourierRefusals(mutant).length,
        refusals.length - 1,
        `removing ${refusal.code} did not change the AST-derived census`,
      );
    }
    const insertion = source.indexOf("  const call = deps.callDoor ?? realCallDoor;");
    assert.ok(insertion >= 0, "the mutant insertion point before the door was not found");
    const added = source.slice(0, insertion) +
      '  if (request.headers.has("x-added-refusal")) return courierError(418, "added_refusal", "added");\n' +
      source.slice(insertion);
    const addedRefusals = preDoorCourierRefusals(added);
    assert.equal(addedRefusals.length, refusals.length + 1, "a ninth pre-door refusal escaped the control-flow census");
    assert.equal(addedRefusals.at(-1)?.code, "added_refusal");

    const exemption = SCOPE_EXEMPT_SURFACES.find((entry) => entry.path === "app/api/invite/route.ts");
    assert.ok(exemption);
    const countWord = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][refusals.length];
    assert.ok(countWord);
    assert.match(exemption.reason, new RegExp(`${countWord} pre-door refusal sites`));
    assert.match(exemption.reason, /seven conceptual gates/);
  });

  it("logout keeps the two walls that DO matter there", () => {
    const code = codeWithStrings("app/logout/route.ts");
    assert.match(code, /isSameOriginRequest\(/, "the same-origin wall is gone");
    assert.match(code, /export async function POST\(/, "logout stopped being POST-only");
    assert.doesNotMatch(code, /export async function GET\(/, "logout gained a GET entrance");
  });
});
