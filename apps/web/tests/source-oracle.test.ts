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
  const guardCalls = (src: string, root = defaultExportName(src) ?? "S") =>
    reachableCallsFrom(src, root).filter((call) => call.name === "requireFirmScope" || call.name === "firmScopeGuard");

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

  it("PIN AST-4: regex literals are tokens, never braces or guard calls", () => {
    const swallowed = `export default async function S() {
      try { const r = /}/; await requireFirmScope(); } catch {}
      return null;
    }`;
    const decoy = `export default function S() { const r = /requireFirmScope[(]/; return r; }`;
    assert.equal(spineGuardProof(swallowed, "S").dominates, false, "a /}/ ended the try before the swallowed guard");
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
    assert.equal(spineGuardProof(catchOnly, "S").dominates, false, "try success bypasses a catch-only guard");
    assert.equal(spineGuardProof(swallowed, "S").dominates, false, "a catch swallowed redirect's throw");
    assert.equal(spineGuardProof(finallyOnly, "S").dominates, true, "finally-only falsely rejected a safe guard");
    assert.deepEqual(tryBlockRanges(finallyOnly), [], "a finally-only try was labelled swallowing");
  });

  it("the guard must be the first top-level executable statement", () => {
    const direct = "export default async function S() { await requireFirmScope(); return null; }";
    const afterBranch = "export default async function S() { if (ready) render(); await requireFirmScope(); return null; }";
    const afterProxy = "export async function GET() { await proxy(); await firmScopeGuard(); }";
    assert.equal(spineGuardProof(direct, "S").dominates, true);
    assert.equal(spineGuardProof(afterBranch, "S").dominates, false);
    assert.equal(spineGuardProof(afterProxy, "GET").dominates, false);
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
    assert.match(moduleStateHazards("const cache = {}; function put(v: unknown) { cache.firm = v; }")[0] ?? "", /mutated/);
    assert.deepEqual(moduleStateHazards("const table = { code: 403 } as const;"), []);
    assert.deepEqual(moduleStateHazards("const table = Object.freeze({ code: 403 });"), []);
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
});
