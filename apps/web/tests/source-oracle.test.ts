import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultExportName,
  exportClauseAliases,
  exportedHttpMethods,
  matchBlock,
  moduleLevelDeclarations,
  moduleStateHazards,
  reachableCallsFrom,
  reachableFrom,
  spineGuardProof,
  stripComments,
  tryBlockRanges,
  uninspectableExportReasons,
} from "../test/sourceOracle";

describe("the TypeScript source oracle parses the module's real export record", () => {
  it("PIN AST-1: comments separate tokens instead of deleting them into invisibility", () => {
    const direct = "async function raw() {}\nexport/**/const DELETE = raw;";
    const clause = "async function raw() {}\nexport { raw/*gap*/as DELETE };";
    assert.deepEqual(exportedHttpMethods(direct), ["DELETE"]);
    assert.deepEqual(exportedHttpMethods(clause), ["DELETE"]);
    assert.equal(exportClauseAliases(clause).get("DELETE"), "raw");
    const stripped = stripComments("export/**/const DELETE = raw;");
    assert.equal(stripped.length, "export/**/const DELETE = raw;".length);
    assert.match(stripped, /export\s+const/);
  });

  it("PIN AST-2: a string-literal HTTP export name is a real method", () => {
    const code = "async function raw() {}\nexport { raw as \"DELETE\" };";
    assert.deepEqual(exportedHttpMethods(code), ["DELETE"]);
    assert.equal(exportClauseAliases(code).get("DELETE"), "raw");
  });

  it("PIN AST-3: every declarator in one const statement is inventoried", () => {
    const code = "async function guarded() {}\nasync function raw() {}\nexport const GET = guarded, DELETE = raw;";
    assert.deepEqual(exportedHttpMethods(code), ["GET", "DELETE"]);
    assert.deepEqual(
      moduleLevelDeclarations(code).filter((decl) => decl.kind === "const").map((decl) => decl.name),
      ["GET", "DELETE"],
    );
  });

  it("re-exports fail closed with an honest locally-inspectable reason", () => {
    const named = 'export { handler as GET } from "./handler";';
    assert.deepEqual(exportedHttpMethods(named), ["GET"]);
    assert.equal(reachableFrom(named, "GET"), null);
    assert.match(spineGuardProof(named, "GET").reason, /has no locally inspectable\/provable spine call/);
    assert.match(uninspectableExportReasons('export * from "./handler";')[0] ?? "", /has no locally inspectable\/provable spine call/);
  });

  it("default declarations, assignments, and aliases resolve the render root", () => {
    assert.equal(defaultExportName("export default function Page() { return null; }"), "Page");
    assert.equal(defaultExportName("function Page() { return null; }\nexport default Page;"), "Page");
    assert.equal(defaultExportName("function Page() { return null; }\nexport { Page as default };"), "Page");
  });

  it("type-only exports remain erased", () => {
    assert.deepEqual(exportedHttpMethods("export type { DELETE };"), []);
  });
});

describe("the AST call graph and execution-dominance proof", () => {
  const withSpineImports = (src: string): string => src.includes('from "@/lib/require-firm-scope"')
    ? src
    : `import { requireFirmScope, firmScopeGuard } from "@/lib/require-firm-scope";\n${src}`;
  const guardCalls = (src: string, root?: string) => {
    const code = withSpineImports(src);
    return reachableCallsFrom(code, root ?? defaultExportName(code) ?? "S").filter((call) => call.importedFrom === "@/lib/require-firm-scope"
      && (call.importedName === "requireFirmScope" || call.importedName === "firmScopeGuard"));
  };

  it("PIN AST-8: syntactically broken input throws before an oracle answer", () => {
    const broken = "export default async function S() { await requireFirmScope();";
    assert.throws(() => spineGuardProof(broken, "S"), /unmodelled: syntactically invalid source at source-oracle\.tsx:1/);
  });

  it("PIN AST-9: canonical spelling does not prove guard identity", () => {
    const localOnly = `async function requireFirmScope() { return null; }
      export default async function S() { await requireFirmScope(); return null; }`;
    const shadowed = `import { requireFirmScope as importedGuard } from "@/lib/require-firm-scope";
      export default async function S() {
        async function requireFirmScope() { return null; }
        await requireFirmScope();
        return importedGuard;
      }`;
    const aliased = `import { requireFirmScope as guard } from "@/lib/require-firm-scope";
      export default async function S() { await guard(); return null; }`;
    assert.equal(spineGuardProof(localOnly, "S").dominates, false);
    assert.equal(spineGuardProof(shadowed, "S").dominates, false);
    assert.equal(spineGuardProof(aliased, "S").dominates, true, "an aliased canonical import stopped being the guard");
  });

  it("only INVOKED local functions enter the reachable graph", () => {
    const uninvokedArrow = `export default async function S() {
      const guard = async () => { await requireFirmScope(); };
      return null;
    }`;
    const uninvokedFunction = `export default async function S() {
      async function guard() { await requireFirmScope(); }
      return null;
    }`;
    const invoked = `export default async function S() {
      const guard = async () => { await requireFirmScope(); };
      await guard();
      return null;
    }`;
    assert.deepEqual(guardCalls(uninvokedArrow), [], "an uninvoked local arrow supplied the only guard");
    assert.deepEqual(guardCalls(uninvokedFunction), [], "an uninvoked local function supplied the only guard");
    assert.equal(guardCalls(invoked).length, 1, "an invoked local edge vanished from the call graph");
    assert.equal(spineGuardProof(invoked, "S").dominates, false, "a closure invocation stood in for a direct dominating guard");
  });

  it("PIN AST-10: dead nested bodies do not enter reachable text", () => {
    const dead = `export default async function S() {
      const guard = await firmScopeGuard();
      function unused() { return guard.response; }
      return proxy();
    }`;
    assert.doesNotMatch(reachableFrom(dead, "S") ?? "", /return\s+guard\.response/);

    const callback = `export default async function S() { items.map(() => guard.response); return proxy(); }`;
    const objectMethod = `export default async function S() { const x = { unused() { return guard.response; } }; return x; }`;
    const nestedDirect = `function guarded() { return guard.response; }
      export default async function S() { await Promise.all([guarded()]); return proxy(); }`;
    const conditional = `function guarded() { return guard.response; }
      export default async function S() { if (ready) guarded(); return proxy(); }`;
    assert.doesNotMatch(reachableFrom(callback, "S") ?? "", /guard\.response/);
    assert.doesNotMatch(reachableFrom(objectMethod, "S") ?? "", /guard\.response/);
    assert.match(reachableFrom(nestedDirect, "S") ?? "", /guard\.response/);
    assert.match(reachableFrom(conditional, "S") ?? "", /guard\.response/);
  });

  it("PIN AST-4: regex literals are tokens, never braces or guard calls", () => {
    const swallowed = `export default async function S() {
      try { const r = /}/; await requireFirmScope(); } catch {}
      return null;
    }`;
    const decoy = `export default function S() { const r = /requireFirmScope[(]/; return r; }`;
    assert.equal(spineGuardProof(withSpineImports(swallowed), "S").dominates, false, "a /}/ ended the try before the swallowed guard");
    assert.equal(tryBlockRanges(swallowed).length, 1);
    assert.deepEqual(guardCalls(decoy), [], "a regex guard decoy counted as a CallExpression");
    const open = swallowed.indexOf("{");
    assert.equal(matchBlock(swallowed, open), swallowed.length, "the /}/ closed the function block");
  });

  it("PIN AST-5: catch-only is unsafe; finally-only preserves the redirect throw", () => {
    const catchOnly = `export default async function S() {
      try { await load(); } catch { await requireFirmScope(); }
      return null;
    }`;
    const swallowed = `export default async function S() {
      try { await requireFirmScope(); } catch {}
      return null;
    }`;
    const finallyOnly = `export default async function S() {
      try { await requireFirmScope(); } finally { cleanup(); }
      return null;
    }`;
    assert.equal(spineGuardProof(withSpineImports(catchOnly), "S").dominates, false, "try success bypasses a catch-only guard");
    assert.equal(spineGuardProof(withSpineImports(swallowed), "S").dominates, false, "a catch swallowed redirect's throw");
    assert.equal(spineGuardProof(withSpineImports(finallyOnly), "S").dominates, true, "finally-only falsely rejected a safe guard");
    assert.deepEqual(tryBlockRanges(finallyOnly), [], "a finally-only try was labelled swallowing");
  });

  it("PIN AST-11: abrupt finally cannot swallow the guard throw", () => {
    const returning = `import { requireFirmScope } from "@/lib/require-firm-scope";
      export default async function S() {
        try { await requireFirmScope(); } finally { return null; }
      }`;
    const throwing = `import { requireFirmScope } from "@/lib/require-firm-scope";
      export default async function S() {
        try { await requireFirmScope(); } finally { throw new Error("override"); }
      }`;
    assert.equal(spineGuardProof(returning, "S").dominates, false);
    assert.equal(spineGuardProof(throwing, "S").dominates, false);
  });

  it("PIN AST-12: interpolated template payloads are blanked", () => {
    const src = `export default function S() {
      const decoy = \`return guard.response \${value}\`;
      return proxy(decoy);
    }`;
    const reachable = reachableFrom(src, "S") ?? "";
    assert.doesNotMatch(reachable, /return\s+guard\.response/);
    assert.match(reachable, /\bvalue\b/, "the interpolation expression itself should remain executable text");
  });

  it("the guard must be the first top-level executable statement", () => {
    const direct = "export default async function S() { await requireFirmScope(); return null; }";
    const afterBranch = "export default async function S() { if (ready) render(); await requireFirmScope(); return null; }";
    const afterProxy = "export async function GET() { await proxy(); await firmScopeGuard(); }";
    assert.equal(spineGuardProof(withSpineImports(direct), "S").dominates, true);
    assert.equal(spineGuardProof(withSpineImports(afterBranch), "S").dominates, false);
    assert.equal(spineGuardProof(withSpineImports(afterProxy), "GET").dominates, false);
  });

  it("a build-time export and a sibling HTTP method cannot cover the request root", () => {
    const page = `export async function generateStaticParams() { await requireFirmScope(); return []; }
      export default async function Page() { return null; }`;
    assert.deepEqual(guardCalls(page, "Page"), []);

    const route = `async function guarded() { await firmScopeGuard(); }
      export const GET = guarded;
      export async function POST() { return Response.json({ ok: true }); }`;
    assert.equal(guardCalls(route, "GET").length, 1);
    assert.deepEqual(guardCalls(route, "POST"), []);
  });
});

describe("module-level state is scoped by the AST, not a whole-file regex", () => {
  it("PIN AST-6: class static object, array, scalar, and static-block stores all red", () => {
    const source = `class Holder {
      static object = {};
      static array = [];
      static scalar = null;
      static { this.late = {}; }
      method() { const methodLocal = {}; return methodLocal; }
    }`;
    const declarations = moduleLevelDeclarations(source).map((decl) => `${decl.kind} ${decl.name}`);
    assert.ok(declarations.includes("static-field Holder.object"));
    assert.ok(declarations.includes("static-field Holder.array"));
    assert.ok(declarations.includes("static-field Holder.scalar"));
    assert.ok(declarations.some((decl) => decl.startsWith("static-block Holder.<static-")));
    assert.equal(declarations.some((decl) => decl.includes("methodLocal")), false, "a class-method local became module state");
    assert.equal(moduleStateHazards(source).length, 4);
  });

  it("PIN AST-7: populated or mutated containers red unless explicitly immutable", () => {
    assert.match(moduleStateHazards("const cache = { firm: null };")[0] ?? "", /populated mutable object/);
    assert.match(moduleStateHazards("const cache = [null];")[0] ?? "", /populated mutable array/);
    assert.match(moduleStateHazards("const cache = {}; function put(v: unknown) { cache.firm = v; }")[0] ?? "", /empty mutable object|mutated/);
    assert.deepEqual(moduleStateHazards("const table = { code: 403 } as const;"), []);
    assert.deepEqual(moduleStateHazards("const table = Object.freeze({ code: 403 });"), []);
  });

  it("PIN AST-14: every durable-store shape reds", () => {
    const hazards = [
      "const cache: Record<string, unknown> = {};",
      "export const cache: unknown[] = [];",
      "globalThis.cache = {};",
      "globalThis[Symbol.for('cache')] ??= new Map();",
      "const cache = new Proxy({}, {});",
      "const Holder = class { static cache = {}; };",
      "class Holder { static { warmCache(); } }",
      "const cache = Object.freeze({ cache: new Map() });",
    ];
    for (const source of hazards) {
      assert.ok(moduleStateHazards(source).length > 0, `${source} passed as request-local or immutable`);
    }
    assert.deepEqual(moduleStateHazards("const table = { code: 403, headers: ['content-type'] } as const;"), []);
    assert.deepEqual(moduleStateHazards("const table = Object.freeze({ code: 403, ok: true });"), []);
  });

  it("function, arrow, and class-method locals remain request-local", () => {
    const source = `function f() { let local = {}; local.value = 1; }
      const arrow = () => { const local = []; local.push(1); };
      class C { method() { const local = new Map(); local.set("x", 1); } }`;
    assert.deepEqual(moduleStateHazards(source), []);
    assert.deepEqual(
      moduleLevelDeclarations(source).map((decl) => `${decl.kind} ${decl.name}`),
      ["function f", "const arrow", "class C"],
    );
  });

  it("mutable bindings, collections, Object.create, and stateful regexes red", () => {
    for (const source of [
      "export let sessions = null;",
      "var sessions = null;",
      "const cache = new Map<string, unknown>();",
      "const cache = Object.create(null);",
      "const matcher = /ab/gy;",
    ]) assert.ok(moduleStateHazards(source).length > 0, `${source} passed`);
  });

  it("an allowlist spelling without a substantial reason is not evidence", () => {
    const hazards = moduleStateHazards("const TABLE = [{ code: 1 }];", new Map([["TABLE", "safe"]]));
    assert.match(hazards[0] ?? "", /reason is too thin/);
  });

  it("VACUITY CONTROL: the mutable-store check catches each shape it claims to", () => {
    assert.match(moduleStateHazards("export let sessions = null;")[0] ?? "", /mutable module binding/);
    assert.match(moduleStateHazards("const c: Record<string, unknown> = {};")[0] ?? "", /mutable object literal/);
    assert.match(moduleStateHazards("const a: unknown[] = [];")[0] ?? "", /mutable array literal/);
    assert.match(moduleStateHazards("export const c = {};")[0] ?? "", /mutable object literal/);
    assert.match(moduleStateHazards("const c = Object.create(null);")[0] ?? "", /Object\.create/);
    assert.deepEqual(moduleStateHazards('const T = { error: "no_firm_scope" } as const;'), []);
    assert.deepEqual(moduleStateHazards('const L = ["content-type"] as const;'), []);
  });
});

describe("unsupported export mechanisms fail closed", () => {
  it("PIN AST-13: default GET is not a named method; unsupported export mechanisms are uninspectable", () => {
    assert.deepEqual(exportedHttpMethods("export default async function GET() {}"), []);
    for (const source of [
      "async function GET() {} export = GET;",
      "async function GET() {} module.exports = { GET };",
      'async function GET() {} Object.defineProperty(exports, "GET", { value: GET });',
    ]) {
      assert.match(uninspectableExportReasons(source)[0] ?? "", /unmodelled: uninspectable export mechanism at source-oracle\.tsx:1/);
    }
  });

  it("VACUITY CONTROL: the stripper keeps string literals, drops both comment forms", () => {
    const source = 'const u = "https://a.example/x"; // LINE_GONE\n/* BLOCK_GONE */ const v = `t//t`;';
    const stripped = stripComments(source);
    assert.ok(stripped.includes("https://a.example/x") && stripped.includes("t//t"));
    assert.ok(!stripped.includes("LINE_GONE") && !stripped.includes("BLOCK_GONE"));
  });

  it("VACUITY CONTROL: an ALIASED or `let`-bound method export is still a root", () => {
    const aliased = "async function raw() {}\nexport { raw as DELETE };";
    const letBound = "async function raw() {}\nexport let DELETE = raw;";
    assert.deepEqual(exportedHttpMethods(aliased), ["DELETE"]);
    assert.deepEqual(exportedHttpMethods(letBound), ["DELETE"]);
    assert.equal(exportClauseAliases(aliased).get("DELETE"), "raw");
    assert.equal(reachableFrom(letBound, "DELETE")?.includes("{}"), true);
  });
});
