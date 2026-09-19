// #1005 — the repo-wide census: no `<SelectValue>` call site may render a raw value.
//
// `components/ui/select.tsx`'s own `SelectValue` wrapper already makes this a TypeScript
// error at each call site (its props are a discriminated union: `items` XOR a function
// `children`, never neither). This census is the independent, AST-level backstop that
// does not trust the type checker alone — the same posture `tests/parity-holes.test.ts`
// and `tests/firm-scope-surfaces.test.ts` take for their own defects. It catches two
// escapes typechecking cannot: an `as any`/`@ts-expect-error` bypass at a `<SelectValue>`
// call site, and a file that skips our wrapper entirely and imports Base UI's OWN
// `Select.Value` (or `Value`) straight from `@base-ui/react/select`, which has no such
// guard rail.
//
// Walks every `.ts`/`.tsx` file under `app/` and `components/` (test files excluded —
// `select.test.tsx` legitimately exercises both shapes, including the ABSENT one, on
// the wrapper's own primitive types).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ts from "typescript";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["app", "components"];
const SOURCE_EXT = /\.(ts|tsx)$/;
const OWN_WRAPPER_PATH = join(WEB_ROOT, "components", "ui", "select.tsx");

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!SOURCE_EXT.test(entry.name)) continue;
      if (entry.name.includes(".test.")) continue;
      out.push(full);
    }
  }
  walk(root);
  return out;
}

type SourceUnit = { readonly path: string; readonly code: string };

function parse(unit: SourceUnit): ts.SourceFile {
  const kind = unit.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(unit.path, unit.code, ts.ScriptTarget.Latest, true, kind);
}

function tagNameOf(node: ts.JsxSelfClosingElement | ts.JsxOpeningElement): string | null {
  const name = node.tagName;
  return ts.isIdentifier(name) ? name.text : null;
}

function hasItemsAttribute(attrs: ts.JsxAttributes): boolean {
  return attrs.properties.some((p) => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "items");
}

/** A JSX expression child that is (or immediately returns/wraps) a function —
 *  the two shapes `select.tsx`'s own discriminated union accepts as `children`. */
function childIsFunction(children: ts.NodeArray<ts.JsxChild>): boolean {
  for (const child of children) {
    if (!ts.isJsxExpression(child) || !child.expression) continue;
    const expr = child.expression;
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return true;
    // An identifier/property-access reference to a function defined elsewhere
    // (e.g. `{resolveLabel}`) — still a legitimate function-child path; a plain
    // string/template/conditional literal is not.
    if (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)) return true;
  }
  return false;
}

type Violation = { file: string; line: number; reason: string };

function censusFile(path: string): Violation[] {
  const violations: Violation[] = [];
  const code = readFileSync(path, "utf8");
  const source = parse({ path, code });

  function loc(node: ts.Node): number {
    return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  }

  function visit(node: ts.Node) {
    // Bypass detection: importing Base UI's OWN Select parts outside our wrapper.
    if (path !== OWN_WRAPPER_PATH && ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text === "@base-ui/react/select") {
        violations.push({
          file: path,
          line: loc(node),
          reason: "imports @base-ui/react/select directly — go through components/ui/select.tsx's SelectValue instead",
        });
      }
    }

    if (ts.isJsxSelfClosingElement(node) && tagNameOf(node) === "SelectValue") {
      if (!hasItemsAttribute(node.attributes)) {
        violations.push({ file: path, line: loc(node), reason: "<SelectValue> has neither items= nor a function child (self-closing, no children possible)" });
      }
    }

    if (ts.isJsxElement(node) && tagNameOf(node.openingElement) === "SelectValue") {
      const hasItems = hasItemsAttribute(node.openingElement.attributes);
      const hasFnChild = childIsFunction(node.children);
      if (!hasItems && !hasFnChild) {
        violations.push({ file: path, line: loc(node), reason: "<SelectValue>…</SelectValue> has neither items= nor a function child" });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return violations;
}

describe("#1005 census: every <SelectValue> call site names a label source", () => {
  it("has no call site rendering a value with no items/children label source, and no direct @base-ui/react/select import outside the wrapper", () => {
    const files = SCAN_DIRS.flatMap((d) => listSourceFiles(join(WEB_ROOT, d)));
    assert.ok(files.length > 50, `sanity: expected many source files under ${SCAN_DIRS.join(", ")}, found ${files.length}`);

    const violations = files.flatMap((f) => censusFile(f));
    if (violations.length > 0) {
      const report = violations.map((v) => `  ${relative(WEB_ROOT, v.file)}:${v.line} — ${v.reason}`).join("\n");
      assert.fail(`${violations.length} SelectValue call site(s) can render a raw value:\n${report}`);
    }
  });

  it("still finds SelectValue call sites at all (a non-vacuous scan — this would pass if the scan matched nothing)", () => {
    const files = SCAN_DIRS.flatMap((d) => listSourceFiles(join(WEB_ROOT, d)));
    let selectValueSites = 0;
    for (const f of files) {
      const code = readFileSync(f, "utf8");
      const source = parse({ path: f, code });
      ts.forEachChild(source, function visit(node: ts.Node) {
        if (
          (ts.isJsxSelfClosingElement(node) && tagNameOf(node) === "SelectValue") ||
          (ts.isJsxElement(node) && tagNameOf(node.openingElement) === "SelectValue")
        ) {
          selectValueSites += 1;
        }
        ts.forEachChild(node, visit);
      });
    }
    assert.ok(selectValueSites >= 11, `expected at least the 11 known SelectValue call sites, found ${selectValueSites}`);
  });
});
