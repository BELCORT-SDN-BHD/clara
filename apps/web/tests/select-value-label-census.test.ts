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

/** fix-round ADV-3 — a QUALIFIED tag name (`<Select.Value>`, reached via a bare
 *  `import { Select } from "@base-ui/react"` rather than our own wrapper) used to make this
 *  return `null`, so `<Select.Value />` was never counted as a `SelectValue`-shaped call site at
 *  all. Returns a dotted name for a property access (`"Select.Value"`) so the two checks below can
 *  recognise it, alongside the plain-identifier case our own `<SelectValue>` uses. */
function tagNameOf(node: ts.JsxSelfClosingElement | ts.JsxOpeningElement): string | null {
  const name = node.tagName;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPropertyAccessExpression(name) && ts.isIdentifier(name.expression) && ts.isIdentifier(name.name)) {
    return `${name.expression.text}.${name.name.text}`;
  }
  return null;
}

/** True for our own wrapper's tag (`SelectValue`) OR a bypass reaching Base UI's part directly
 *  (`Value`, or `<Anything.Value>` — the ONLY compound part named `Value` anywhere this app's own
 *  `components/ui/*` wrappers use is Select's; ADV-3 verified none of Base UI's other primitives
 *  this app imports — Dialog, Menu, Tabs, Tooltip, … — are reached through a `.Value` part). */
function isSelectValueTag(tagName: string | null): boolean {
  if (tagName === null) return false;
  return tagName === "SelectValue" || tagName === "Value" || tagName.endsWith(".Value");
}

function hasItemsAttribute(attrs: ts.JsxAttributes): boolean {
  return attrs.properties.some((p) => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "items");
}

/** A JSX expression child that IS a function — the one shape `select.tsx`'s own discriminated
 *  union accepts as `children`.
 *
 *  fix-round SPEC-1005-3 — this used to ALSO accept a bare identifier or property-access
 *  reference (`{value}`, `{row.value}`) on the theory that it might name a function defined
 *  elsewhere, which is exactly the shape of the real defect (`<SelectValue>{value}</SelectValue>`,
 *  a plain non-function value): CONFIRMED, that bypass ran through this census clean before this
 *  fix. No real call site in this codebase needs that allowance — the one function-child call site
 *  (`client-period-selector.tsx`) always passes an INLINE arrow function — so the fix is to accept
 *  only the two node kinds that make a value a function BY CONSTRUCTION: an arrow function or a
 *  function expression, never a reference this census cannot verify resolves to one. */
function childIsFunction(children: ts.NodeArray<ts.JsxChild>): boolean {
  for (const child of children) {
    if (!ts.isJsxExpression(child) || !child.expression) continue;
    const expr = child.expression;
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return true;
  }
  return false;
}

type Violation = { file: string; line: number; reason: string };

/** The scan logic, over an already-read `code` string — split out of `censusFile` so the two
 *  regression cells below can hand it a SYNTHETIC source under a fake (never-read-from-disk) path,
 *  the same probe shape ADV-2/ADV-3 used against a temporary file, without touching the worktree. */
function censusSource(path: string, code: string): Violation[] {
  const violations: Violation[] = [];
  const source = parse({ path, code });

  function loc(node: ts.Node): number {
    return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  }

  function visit(node: ts.Node) {
    // Bypass detection: importing Base UI's OWN Select parts outside our wrapper.
    if (path !== OWN_WRAPPER_PATH && ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier === "@base-ui/react/select") {
        violations.push({
          file: path,
          line: loc(node),
          reason: "imports @base-ui/react/select directly — go through components/ui/select.tsx's SelectValue instead",
        });
      }
      // fix-round ADV-3 — the exact-specifier check above is invisible to the ROOT barrel
      // (`@base-ui/react`, a real export per its own package.json, CONFIRMED against the
      // installed package's exports map): `import { Select } from "@base-ui/react"` reaches the
      // identical Select primitive by a different path. Named-binding-scoped rather than "any
      // @base-ui/react import" — this app's OTHER wrapper files legitimately import the root
      // package's other primitives without going through a select-specific wrapper at all.
      const namedBindings = node.importClause?.namedBindings;
      if (specifier === "@base-ui/react" && namedBindings && ts.isNamedImports(namedBindings)) {
        for (const el of namedBindings.elements) {
          if ((el.propertyName ?? el.name).text === "Select") {
            violations.push({
              file: path,
              line: loc(node),
              reason: "imports Select from the @base-ui/react root barrel directly — go through components/ui/select.tsx's SelectValue instead",
            });
          }
        }
      }
    }

    // The wrapper's OWN internals (`<SelectPrimitive.Value>`, a `.Value` property-access tag,
    // fed `{resolveChildren}` — an identifier, not an inline function literal) are exempt from
    // both checks below: this file IS the label-resolving mechanism the checks exist to enforce
    // everywhere else, not a call site of it.
    if (path !== OWN_WRAPPER_PATH && ts.isJsxSelfClosingElement(node) && isSelectValueTag(tagNameOf(node))) {
      if (!hasItemsAttribute(node.attributes)) {
        violations.push({ file: path, line: loc(node), reason: "<SelectValue> has neither items= nor a function child (self-closing, no children possible)" });
      }
    }

    if (path !== OWN_WRAPPER_PATH && ts.isJsxElement(node) && isSelectValueTag(tagNameOf(node.openingElement))) {
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

function censusFile(path: string): Violation[] {
  return censusSource(path, readFileSync(path, "utf8"));
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

describe("fix-round ADV-3/SPEC-1005-3: the two confirmed blind spots are closed", () => {
  const FIXTURE_PATH = join(WEB_ROOT, "components", "zz-fixture-never-read-from-disk.tsx");

  it("catches <SelectValue>{value}</SelectValue> — an identifier child that is NOT a function (SPEC-1005-3, PROVED against the pre-fix logic to render 0 violations)", () => {
    const code = `
      import { SelectValue } from "@/components/ui/select";
      function Broken({ value }: { value: string }) {
        return <SelectValue>{value}</SelectValue>;
      }
    `;
    const violations = censusSource(FIXTURE_PATH, code);
    assert.equal(violations.length, 1, "an identifier child must be treated as a non-function, unlabelled render");
    assert.match(violations[0]!.reason, /neither items= nor a function child/);
  });

  it("catches <Select.Value /> reached via the @base-ui/react ROOT barrel, bypassing our wrapper entirely (ADV-3, PROVED against the pre-fix logic to render 0 violations)", () => {
    const code = `
      import { Select } from "@base-ui/react";
      function Bypass() {
        return (
          <Select.Root>
            <Select.Value />
          </Select.Root>
        );
      }
    `;
    const violations = censusSource(FIXTURE_PATH, code);
    assert.ok(violations.length >= 2, `expected both the import bypass and the qualified-tag bypass to be flagged, got ${violations.length}`);
    assert.ok(violations.some((v) => v.reason.includes("root barrel")), "the root-barrel import must be flagged");
    assert.ok(violations.some((v) => v.reason.includes("self-closing")), "the qualified <Select.Value /> tag must be flagged even though tagNameOf is not a plain identifier");
  });

  it("still passes a legitimate function-child call site through untouched (no false positive from the SPEC-1005-3 tightening)", () => {
    const code = `
      import { SelectValue } from "@/components/ui/select";
      function Fine({ value }: { value: unknown }) {
        return <SelectValue>{(v: unknown) => String(v)}</SelectValue>;
      }
    `;
    assert.deepEqual(censusSource(FIXTURE_PATH, code), []);
  });
});
