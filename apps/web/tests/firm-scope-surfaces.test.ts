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

type CourierRefusal = { readonly code: string; readonly start: number; readonly end: number };

/** Every courierError return the handler can take before its first governed door
 * call. This is the executable refusal surface, not a list of expected spellings. */
function preDoorCourierRefusals(source: string): CourierRefusal[] {
  const fileName = "/courier.ts";
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const host: ts.CompilerHost = {
    fileExists: (candidate) => candidate === fileName,
    readFile: (candidate) => candidate === fileName ? source : undefined,
    getSourceFile: (candidate) => candidate === fileName ? parsed : undefined,
    getDefaultLibFileName: () => "/lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "/",
    getDirectories: () => [],
    getCanonicalFileName: (candidate) => candidate,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
  const program = ts.createProgram([fileName], { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest }, host);
  const file = program.getSourceFile(fileName);
  assert.ok(file, "courier source file was not bound");
  const checker = program.getTypeChecker();
  const handler = file.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === "handleInviteRequest",
  );
  assert.ok(handler?.body, "handleInviteRequest body was not found");
  const courierError = file.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === "courierError",
  );
  assert.ok(courierError?.name, "courierError declaration was not found");
  const courierErrorSymbol = checker.getSymbolAtLocation(courierError.name);
  assert.ok(courierErrorSymbol, "courierError declaration was not bound");
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
  const visited = new Set<ts.FunctionDeclaration>();
  const visitFunction = (fn: ts.FunctionDeclaration, cutoff: number): void => {
    if (visited.has(fn) || fn.body === undefined) return;
    visited.add(fn);
    const visit = (node: ts.Node): void => {
      if (node.getStart(file) >= cutoff) return;
      if (node !== fn.body && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression !== undefined && ts.isCallExpression(node.expression)) {
        const call = node.expression;
        const callee = call.expression;
        const symbol = ts.isIdentifier(callee) ? checker.getSymbolAtLocation(callee) : undefined;
        if (symbol === courierErrorSymbol) {
          const code = call.arguments[1];
          assert.ok(code !== undefined && ts.isStringLiteralLike(code), "pre-door courierError has no literal code");
          refusals.push({ code: code.text, start: node.getStart(file), end: node.end });
          return;
        }

        // Review law 3: a matching spelling is not a helper identity. Follow only
        // the declaration the checker bound this exact call to, in this file.
        const declaration = symbol?.valueDeclaration;
        if (
          declaration !== undefined &&
          ts.isFunctionDeclaration(declaration) &&
          declaration.getSourceFile() === file &&
          declaration.body !== undefined
        ) {
          visitFunction(declaration, Number.POSITIVE_INFINITY);
          return;
        }
        const rendered = callee.getText(file).replace(/\s+/g, " ");
        throw new Error(`courier_refusal_return_call_unresolved:${rendered}`);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(fn.body, visit);
  };
  visitFunction(handler, doorAt);
  return refusals.sort((a, b) => a.start - b.start);
}

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

  it("RED-BEFORE F4: no registry reason carries a hand-maintained leaf fraction", () => {
    // The finding was one stale sentence — "four of its five leaves", written
    // when (entry) had five and left behind when it grew to nine. The GENERAL
    // rule is what stops the next one: a reason may describe the group, but a
    // COUNT of it belongs in a cell that reds when the tree moves, not in prose
    // nothing checks. Pinning the one old spelling would have caught the one old
    // sentence; this catches the shape.
    const entryLeaves = leaves.filter((leaf) => leaf.file.startsWith("app/(entry)/"));
    assert.equal(entryLeaves.length, 12, "the current entry route-leaf census changed");
    const layout = SCOPE_UNSCOPED_SURFACES.find((surface) => surface.path === "app/(entry)/layout.tsx");
    assert.ok(layout, "the entry layout is absent from the unscoped registry");

    const count = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)";
    const noun = "(?:leaves|leafs|pages|faces|surfaces|routes|entrances)";
    const handMaintainedFraction = new RegExp(`\\b${count}\\s+of\\s+(?:its|the|these|those)\\s+${count}\\s+${noun}\\b`, "i");

    // POSITIVE CONTROL: the detector must actually see the sentence the finding
    // was about, or its silence below means nothing (absence is not evidence).
    assert.match("four of its five leaves can run", handMaintainedFraction);

    for (const surface of [...SCOPE_UNSCOPED_SURFACES, ...SCOPE_EXEMPT_SURFACES]) {
      assert.doesNotMatch(
        surface.reason,
        handMaintainedFraction,
        `${surface.path}'s reason states a leaf count prose cannot keep true`,
      );
    }
  });

  it("VACUITY CONTROL: the walk found the real tree", () => {
    assert.ok(leaves.length > 15, `only ${leaves.length} route leaves found under ${APP_DIR}`);
    const files = leaves.map((l) => l.file);
    for (const expected of [
      "app/(entry)/login/page.tsx",
      "app/(entry)/signup/page.tsx",
      "app/(entry)/auth/confirm/page.tsx",
      "app/(entry)/pending/page.tsx",
      "app/(entry)/invite/[token]/page.tsx",
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
    assert.equal(byFile.get("app/(entry)/login/page.tsx"), "/login");
  });

  it("P4-3's MOVE kept every entry URL BYTE-IDENTICAL — resolved from the tree", () => {
    // THE ACCEPTANCE THIS TRAIN IS JUDGED ON, asserted by ROUTE and not by
    // claim (P4-3's order: "every URL byte-identical after the moves (assert by
    // route, not by claim)"). /login and /invite/:token moved from `app/` into
    // `app/(entry)/`; a route group contributes no URL segment, so both must
    // still answer on exactly the paths they answered on before — every invite
    // link already sitting in an inbox, every `?next=` value proxy.ts writes,
    // and every internal link depends on it.
    //
    // The instrument is `routeLeaves()`, the same walk the classification cells
    // use: it derives the URL from the directory chain, skipping `(group)`,
    // `@slot` and `_private` folders. So this reads the real tree rather than a
    // list somebody kept in step by hand.
    const byFile = new Map(leaves.map((l) => [l.file, l.url]));
    assert.equal(byFile.get("app/(entry)/login/page.tsx"), "/login");
    assert.equal(byFile.get("app/(entry)/invite/[token]/page.tsx"), "/invite/[token]");
    assert.equal(byFile.get("app/(entry)/signup/page.tsx"), "/signup");
    assert.equal(byFile.get("app/(entry)/auth/confirm/page.tsx"), "/auth/confirm");
    assert.equal(byFile.get("app/(entry)/pending/page.tsx"), "/pending");

    // And the pre-move paths are GONE — a leftover copy at the old path would
    // serve the same URL from two files, which is a Next build error in
    // production but silently invisible to the assertions above.
    const files = leaves.map((l) => l.file);
    assert.equal(files.includes("app/login/page.tsx"), false, "the pre-move login page is still on disk");
    assert.equal(files.includes("app/invite/[token]/page.tsx"), false, "the pre-move invite page is still on disk");

    // VACUITY CONTROL for this cell: the walk genuinely resolves a group to no
    // segment, rather than these four passing because it returns "" for
    // everything. `(firm)/page.tsx` → "/" is the same mechanism, and the
    // deep dynamic route below proves segments DO accumulate when they are not
    // groups — so a walker that dropped every segment would red here.
    assert.equal(byFile.get("app/(firm)/page.tsx"), "/");
    assert.equal(
      byFile.get("app/(full)/clients/[clientId]/clara/[threadId]/page.tsx"),
      "/clients/[clientId]/clara/[threadId]",
    );
  });

  it("the eight (entry) pages classify, and /pending is NOT public", () => {
    // The census's "EVERY leaf classifies" cell would also pass if every page
    // were registered wrongly-but-consistently, so this derives the page set
    // from the route tree and pins the CLASS of each. These pages sit under a
    // group whose layout is not an entrance, so none can be ancestor-covered:
    // each needs its own registry row, and each has one.
    const entryPages = leaves
      .filter((leaf) => leaf.file.startsWith("app/(entry)/") && leaf.file.endsWith("/page.tsx"))
      .map((leaf) => leaf.file);
    assert.equal(entryPages.length, 8, "the current entry page census changed");
    for (const file of entryPages) {
      assert.equal(classify({ file, url: "" }), "registered unscoped", `${file} is not registered unscoped`);
      assert.equal(ancestorCovered(file), false, `${file} claims an entrance ancestor it does not have`);
    }

    // THE ONE ASYMMETRY THAT MATTERS. /pending is NOT public: it requires a
    // session and merely does not require a firm (design §4 E). The recovery
    // password page remains public at the proxy only so its own server-side
    // session fork can render the typed invalid-link face instead of redirecting
    // or leaking a provider error. If /pending ever gained `public: true`
    // the cross-check against PUBLIC_PATH_PREFIXES would force /pending into
    // proxy.ts's allowlist, and an unauthenticated stranger could load a page
    // whose entire content is a report on the caller's own registration.
    const entry = (p: string) => SCOPE_UNSCOPED_SURFACES.find((s) => s.path === p);
    assert.equal(entry("app/(entry)/login/page.tsx")?.public, true);
    assert.equal(entry("app/(entry)/signup/page.tsx")?.public, true);
    assert.equal(entry("app/(entry)/auth/confirm/page.tsx")?.public, true);
    assert.equal(entry("app/(entry)/invite/[token]/page.tsx")?.public, true);
    assert.equal(entry("app/(entry)/forgot-password/page.tsx")?.public, true);
    assert.equal(entry("app/(entry)/auth/recover/password/page.tsx")?.public, true);
    assert.equal(
      entry("app/(entry)/pending/page.tsx")?.public,
      undefined,
      "the holding route is marked public — it requires a session",
    );
  });

  it("no (entry) surface calls the spine — the self-redirect loop /pending would be", () => {
    // requireFirmScope() sends a no-firm caller to HOLDING_ROUTE, which IS
    // /pending. A check on that page redirects it to itself forever, and a check
    // in the group's layout would also refuse every pre-session face and the
    // recovery page's typed invalid-link arm. The registry says these are
    // unscoped or deliberately exempt; derive the complete leaf list so this
    // proof cannot silently keep an old hand-maintained count.
    for (const file of [
      "app/(entry)/layout.tsx",
      ...leaves.filter((leaf) => leaf.file.startsWith("app/(entry)/")).map((leaf) => leaf.file),
    ]) {
      assert.equal(callsSpine(file), false, `${file} calls the scope spine`);
    }
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
    assert.equal(classify({ file: "app/(entry)/login/page.tsx", url: "/login" }), "registered unscoped");
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
  it("the registry names every exemption, each with a substantial reason", () => {
    const paths = SCOPE_EXEMPT_SURFACES.map((e) => e.path).sort();
    assert.deepEqual(paths, [
      "app/(entry)/auth/confirm/verify/route.ts",
      "app/(entry)/auth/recover/route.ts",
      "app/(entry)/checkout/route.ts",
      "app/(entry)/checkout/success/claim/route.ts",
      "app/api/invite/route.ts",
      "app/logout/route.ts",
    ]);
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

  it("RED-BEFORE N6: a refusal returned by a reachable same-file helper enters the census", () => {
    const source = readSource("lib/members/courier.ts");
    const baseline = preDoorCourierRefusals(source);
    const insertion = source.indexOf("  const call = deps.callDoor ?? realCallDoor;");
    assert.ok(insertion >= 0, "the helper mutant insertion point before the door was not found");
    const mutant =
      source.slice(0, insertion) +
      '  if (request.headers.has("x-helper-refusal")) return addedHelperRefusal();\n' +
      source.slice(insertion) +
      '\nfunction addedHelperRefusal(): Response {\n  return courierError(418, "added_helper_refusal", "added");\n}\n';
    const refusals = preDoorCourierRefusals(mutant);
    assert.equal(refusals.length, baseline.length + 1, "a ninth refusal inside a reachable helper escaped");
    assert.ok(refusals.some((refusal) => refusal.code === "added_helper_refusal"));
  });

  it("N6: a helper throw converted by one catch is one response exit, not two", () => {
    const source = readSource("lib/members/courier.ts");
    const baseline = preDoorCourierRefusals(source);
    const insertion = source.indexOf("  const call = deps.callDoor ?? realCallDoor;");
    assert.ok(insertion >= 0, "the caught-throw mutant insertion point before the door was not found");
    const mutant =
      source.slice(0, insertion) +
      '  try { await addedThrow(); } catch { return courierError(418, "caught_helper_throw", "caught"); }\n' +
      source.slice(insertion) +
      '\nasync function addedThrow(): Promise<void> { throw new Error("added"); }\n';
    const refusals = preDoorCourierRefusals(mutant);
    assert.equal(refusals.length, baseline.length + 1);
    assert.equal(refusals.filter((refusal) => refusal.code === "caught_helper_throw").length, 1);
  });

  it("N6: an unresolved return-call helper fails closed by name", () => {
    const source = readSource("lib/members/courier.ts");
    const insertion = source.indexOf("  const call = deps.callDoor ?? realCallDoor;");
    assert.ok(insertion >= 0, "the unresolved-helper mutant insertion point before the door was not found");
    const mutant =
      'import { unresolvedHelper } from "./unresolved-helper";\n' +
      source.slice(0, insertion) +
      '  if (request.headers.has("x-unresolved-helper")) return unresolvedHelper();\n' +
      source.slice(insertion);
    assert.throws(
      () => preDoorCourierRefusals(mutant),
      /courier_refusal_return_call_unresolved:unresolvedHelper/,
    );
  });

  it("logout keeps the two walls that DO matter there", () => {
    const code = codeWithStrings("app/logout/route.ts");
    assert.match(code, /isSameOriginRequest\(/, "the same-origin wall is gone");
    assert.match(code, /export async function POST\(/, "logout stopped being POST-only");
    assert.doesNotMatch(code, /export async function GET\(/, "logout gained a GET entrance");
  });
});
