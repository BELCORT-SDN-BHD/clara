// `./next-runtime-globals` FIRST — this file imports lib/require-firm-scope.ts for
// its registries, and that module loads `next/navigation`.
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
  defaultExportName,
  exportedHttpMethods,
  reachableFrom,
  reachableCallsFrom,
  routeLeaves,
  spineGuardProof,
  spineGuardResponseIsReturned,
  stripComments,
  type SourceUnit,
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

/** Comments stripped, strings KEPT — for import specifiers and header reads. */
const codeWithStrings = (p: string): string => stripComments(readSourceUnit(p)).code;

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
function executionRoots(p: string): { root: string; code: string; calls: ReturnType<typeof reachableCallsFrom>; proof: ReturnType<typeof spineGuardProof> }[] {
  // Import module specifiers are binding identity. Keep strings for the AST;
  // `reachableFrom()` blanks literal payloads in the regex-facing text it returns.
  const unit = stripComments(readSourceUnit(p));
  if (isRouteLeaf(p)) {
    return exportedHttpMethods(unit).map((method) => ({
      root: method,
      code: reachableFrom(unit, method) ?? "",
      calls: reachableCallsFrom(unit, method),
      proof: spineGuardProof(unit, method),
    }));
  }
  const name = defaultExportName(unit);
  return name === null ? [] : [{
    root: name,
    code: reachableFrom(unit, name) ?? "",
    calls: reachableCallsFrom(unit, name),
    proof: spineGuardProof(unit, name),
  }];
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
const isSpineCall = (call: ReturnType<typeof reachableCallsFrom>[number]): boolean =>
  call.importedFrom === "@/lib/require-firm-scope"
  && ["requireFirmScope", "firmScopeGuard", "resolveFirmScope"].includes(call.importedName ?? "");

/** Imports the spine AND actually executes one of its entrances. */
function callsSpine(p: string): boolean {
  return SPINE_IMPORT.test(codeWithStrings(p)) && executionRoots(p).some((root) =>
    root.calls.some(isSpineCall));
}

function assertDenialContract(unit: SourceUnit, root: string, onDenial: "redirect" | "403"): void {
  const expected = onDenial === "redirect" ? "requireFirmScope" : "firmScopeGuard";
  const proof = spineGuardProof(unit, root);
  assert.equal(proof.call, expected, `${unit.path}: ${root} must use ${expected}`);
  if (onDenial === "403") {
    assert.equal(
      spineGuardResponseIsReturned(unit, root),
      true,
      `${unit.path}: ${root} never returns the exact guard result's response`,
    );
  }
}

function assertGuardBeforeCall(unit: SourceUnit, root: string, targetName: string): void {
  const calls = reachableCallsFrom(unit, root);
  const guard = calls.find((call) => call.importedFrom === "@/lib/require-firm-scope"
    && call.importedName === "firmScopeGuard");
  const target = calls.find((call) => call.name === targetName);
  assert.ok(target !== undefined, `${unit.path}: ${root}: the ${targetName} call is gone`);
  assert.ok(guard !== undefined && guard.start < target.start, `${unit.path}: ${root}: ${targetName} runs before the guard`);
}

describe("MEDIUM-3 — every route leaf is classified, or this suite reds", () => {
  const leaves = routeLeaves(WEB_ROOT, APP_DIR);

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
    const hiding = leaves.filter((l) => isRouteLeaf(l.file)).flatMap((l) => {
      try {
        exportedHttpMethods(readSourceUnit(l.file));
        return [];
      } catch (error) {
        return [`${l.file}: ${error instanceof Error ? error.message : String(error)}`];
      }
    });
    assert.deepEqual(
      hiding,
      [],
      "a route handler has no locally inspectable/provable spine call because it re-exports code the census cannot inspect",
    );
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
      for (const { root, calls, proof } of roots) {
        const guards = calls.filter((call) => isSpineCall(call)
          && (call.importedName === "requireFirmScope" || call.importedName === "firmScopeGuard"));
        assert.ok(
          guards.length > 0,
          `${entrance.path}: ${root} ${proof.reason}; it has no locally inspectable/provable spine call`,
        );
        assert.ok(
          guards.every((call) => call.argumentCount === 0),
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
      for (const { root, calls } of executionRoots(entrance.path)) {
        const guards = calls.filter((call) => isSpineCall(call)
          && (call.importedName === "requireFirmScope" || call.importedName === "firmScopeGuard"));
        assert.ok(
          guards.some((call) => call.awaited && call.argumentCount === 0),
          `${entrance.path}: ${root} calls the spine without awaiting it — the redirect throw floats and the surface renders anyway`,
        );
      }
    }
  });

  it("FIND-1b — the awaited spine guard execution-dominates every entrance", () => {
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
      for (const { root, proof } of executionRoots(entrance.path)) {
        assert.equal(
          proof.dominates,
          true,
          `${entrance.path}: ${root}: ${proof.reason}`,
        );
      }
    }
  });

  it("FIND-1 — the 403 entrance RETURNS the refusal, not merely computes it", () => {
    // Awaiting is not enough for the API entrance: a guard whose refusal is
    // computed and dropped is the same hole one line further on.
    const entrance = SCOPE_ENTRANCES.find((e) => e.onDenial === "403");
    assert.ok(entrance, "no 403 entrance is registered");
    const unit = stripComments(readSourceUnit(entrance.path));
    for (const { root } of executionRoots(entrance.path)) assertDenialContract(unit, root, "403");
  });

  it("the two layouts REDIRECT and the API route REFUSES — not the other way round", () => {
    for (const entrance of SCOPE_ENTRANCES) {
      const unit = stripComments(readSourceUnit(entrance.path));
      for (const { root } of executionRoots(entrance.path)) assertDenialContract(unit, root, entrance.onDenial);
    }
  });

  it("PIN F6: aliased spine imports preserve denial kind, return binding, and order", () => {
    const redirect: SourceUnit = {
      path: "aliased-layout.tsx",
      code: `import { requireFirmScope as gate } from "@/lib/require-firm-scope";
        export default async function Layout() { await gate(); return <main />; }`,
    };
    assertDenialContract(redirect, "Layout", "redirect");

    const refusal: SourceUnit = {
      path: "aliased-route.ts",
      code: `import { firmScopeGuard as gate } from "@/lib/require-firm-scope";
        async function proxy() { return new Response(); }
        export async function GET() {
          const result = await gate();
          if (!result.ok) return result.response;
          return proxy();
        }`,
    };
    assertDenialContract(refusal, "GET", "403");
    assertGuardBeforeCall(refusal, "GET", "proxy");

    const wrongResult: SourceUnit = {
      path: "wrong-result-route.ts",
      code: `import { firmScopeGuard as gate } from "@/lib/require-firm-scope";
        export async function GET() {
          const result = await gate();
          const decoy = { response: new Response() };
          if (!result.ok) return decoy.response;
          return new Response();
        }`,
    };
    assert.equal(spineGuardResponseIsReturned(wrongResult, "GET"), false);
  });
});

describe("HIGH-1 — the guard dominates the proxy, and owns the outbound identity", () => {
  const ROUTE = "app/api/runtime/[...path]/route.ts";

  it("the guard call PRECEDES the proxy call", () => {
    const unit = stripComments(readSourceUnit(ROUTE));
    for (const { root } of executionRoots(ROUTE)) assertGuardBeforeCall(unit, root, "proxy");
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

  it("logout keeps the two walls that DO matter there", () => {
    const code = codeWithStrings("app/logout/route.ts");
    assert.match(code, /isSameOriginRequest\(/, "the same-origin wall is gone");
    assert.match(code, /export async function POST\(/, "logout stopped being POST-only");
    assert.doesNotMatch(code, /export async function GET\(/, "logout gained a GET entrance");
  });
});
