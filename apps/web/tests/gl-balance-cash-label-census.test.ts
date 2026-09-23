// #958 — the repo-wide census: the bank tie-out's own ledger-derived balance
// (`list_bank_statements`'s `tie.gl_balance_cents`, and `get_bank_reconciliation`'s
// `gl_prime_cents` mapped from the same DB key — see lib/bank/types.ts and
// lib/bank/recon-types.ts) is never rendered under a "cash" label on a human-facing
// surface. Owner's ruling (2026-09-20, issue #958): only governed book cash, over the
// published cash account set, may ever be called cash; this second, ledger-derived-but-
// ungoverned figure stays a term of the bank tie-out under its own "GL balance" label.
//
// This is the naming rule's OWN repeatable check, not a re-proof of the tie-out's
// arithmetic (migration 0038/0040's own batteries own that, unchanged by this ticket).
//
// Method: walk every `.ts`/`.tsx` file under `app/` and `components/` (test files
// excluded, mirroring `tests/select-value-label-census.test.ts`'s own scan). At each
// AST occurrence of `.gl_balance_cents` / `.gl_prime_cents` (a property or string-keyed
// element access — the two field-name spellings the balance travels the wire under),
// find the nearest enclosing JSX element and, from ITS parent's children, the nearest
// PRECEDING element sibling — the shape every current row uses (`<dt>…label…</dt><dd>…
// value…</dd>` in reconciliation-section.tsx's `<dl>`). That sibling's rendered text is
// resolved from a JSX text literal, a string literal, or a `t("KEY")`/`tc("KEY")` call
// traced to its `useTranslations(NAMESPACE)` declaration and looked up in the real
// `messages/en.json` catalog — so a violation can come from the SOURCE (a hardcoded
// "Cash" JSX label) or from the MESSAGE COPY alone (an existing i18n key whose text
// says "cash", reused next to this figure).
//
// Fails closed: a label that cannot be statically resolved (a dynamic key, an unknown
// expression) is a violation too — this census would rather over-flag a legitimate but
// opaque future label than silently pass a real one. A render site with NO preceding
// element sibling at all is out of this census's scope (nothing to mislabel it with);
// documented, not hidden.
//
// KNOWN LIMITATION (documented, not a silent gap): this census only sees the balance
// rendered INLINE inside JSX. A future surface that reads the field into a local
// variable first and renders that variable elsewhere would not be traced across that
// boundary. Today's one call site (`reconciliation-section.tsx`) renders it inline, so
// this is a real, non-vacuous check of the tree as it stands, not a proof for all time.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ts from "typescript";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["app", "components"];
const SOURCE_EXT = /\.(ts|tsx)$/;
const TARGET_FIELDS = ["gl_balance_cents", "gl_prime_cents"];
const CASH_LABEL_RE = /\bcash\b/i;

const REAL_MESSAGES: unknown = JSON.parse(readFileSync(join(WEB_ROOT, "messages", "en.json"), "utf8"));

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

function fieldNameOf(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node) && TARGET_FIELDS.includes(node.name.text)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression) &&
    TARGET_FIELDS.includes(node.argumentExpression.text)
  ) return node.argumentExpression.text;
  return null;
}

function nearestJsxElement(node: ts.Node): ts.JsxElement | null {
  let p: ts.Node | undefined = node.parent;
  while (p !== undefined) {
    if (ts.isJsxElement(p)) return p;
    p = p.parent;
  }
  return null;
}

function childrenOfJsxParent(el: ts.JsxElement): ts.NodeArray<ts.JsxChild> | null {
  const parent = el.parent;
  if (ts.isJsxElement(parent)) return parent.children;
  if (ts.isJsxFragment(parent)) return parent.children;
  return null;
}

/** The nearest element sibling BEFORE `el` in `children`, skipping whitespace-only JSX
 *  text and comment-only expression containers (`{/* … *\/}`). `null` when the nearest
 *  meaningful content is not a plain JsxElement (raw text, a self-closing tag, a
 *  fragment) — this census only knows how to read a label off an element. */
function precedingLabelElement(children: ts.NodeArray<ts.JsxChild>, index: number): ts.JsxElement | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const child = children[i] as ts.JsxChild;
    if (ts.isJsxText(child)) {
      if (child.text.trim() === "") continue;
      return null;
    }
    if (ts.isJsxExpression(child) && child.expression === undefined) continue;
    if (ts.isJsxElement(child)) return child;
    return null;
  }
  return null;
}

function useTranslationsNamespace(expr: ts.Expression): string | null {
  if (!ts.isCallExpression(expr)) return null;
  if (!ts.isIdentifier(expr.expression) || expr.expression.text !== "useTranslations") return null;
  const arg = expr.arguments[0];
  return arg !== undefined && ts.isStringLiteralLike(arg) ? arg.text : null;
}

function resolveMessage(path: string, messages: unknown): string | null {
  let cur: unknown = messages;
  for (const segment of path.split(".")) {
    if (typeof cur !== "object" || cur === null || !(segment in (cur as Record<string, unknown>))) return null;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return typeof cur === "string" ? cur : null;
}

type LabelText = { readonly text: string } | { readonly unresolved: true };

function extractLabelText(el: ts.JsxElement, scope: ReadonlyMap<string, string>, messages: unknown): LabelText {
  const parts: string[] = [];
  let unresolved = false;
  function walk(node: ts.JsxChild): void {
    if (ts.isJsxText(node)) {
      const trimmed = node.text.replace(/\s+/g, " ").trim();
      if (trimmed !== "") parts.push(trimmed);
      return;
    }
    if (ts.isJsxElement(node)) { node.children.forEach(walk); return; }
    if (ts.isJsxFragment(node)) { node.children.forEach(walk); return; }
    if (ts.isJsxExpression(node)) {
      const expr = node.expression;
      if (expr === undefined) return; // a JSX comment
      if (ts.isStringLiteralLike(expr)) { parts.push(expr.text); return; }
      if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
        const namespace = scope.get(expr.expression.text);
        const firstArg = expr.arguments[0];
        if (namespace !== undefined && firstArg !== undefined && ts.isStringLiteralLike(firstArg)) {
          const resolved = resolveMessage(`${namespace}.${firstArg.text}`, messages);
          if (resolved !== null) { parts.push(resolved); return; }
        }
      }
      unresolved = true;
      return;
    }
  }
  el.children.forEach(walk);
  if (unresolved) return { unresolved: true };
  return { text: parts.join(" ") };
}

type Violation = { readonly file: string; readonly line: number; readonly kind: "cash-label" | "unresolved-label"; readonly reason: string };

/** The scan logic over an already-read `code` string, split out of `censusFile` so the
 *  fix-round regression cells below can hand it a SYNTHETIC source under a fake
 *  (never-read-from-disk) path — the same posture `select-value-label-census.test.ts`
 *  takes for its own probes. */
function censusSource(path: string, code: string, messages: unknown): { readonly violations: Violation[]; readonly sites: number } {
  const source = parse({ path, code });
  const violations: Violation[] = [];
  let sites = 0;

  function loc(node: ts.Node): number {
    return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  }

  function handleTarget(node: ts.Node, field: string, scope: ReadonlyMap<string, string>): void {
    const valueEl = nearestJsxElement(node);
    if (valueEl === null) return; // not directly JSX-rendered — documented limitation, out of scope
    sites += 1;
    const children = childrenOfJsxParent(valueEl);
    if (children === null) return;
    const index = children.indexOf(valueEl as ts.JsxChild);
    if (index < 0) return;
    const labelEl = precedingLabelElement(children, index);
    if (labelEl === null) return; // no adjacent label element to check — nothing to mislabel it with
    const extracted = extractLabelText(labelEl, scope, messages);
    if ("unresolved" in extracted) {
      violations.push({
        file: path,
        line: loc(valueEl),
        kind: "unresolved-label",
        reason: `the label immediately before a rendered ${field} cannot be statically resolved to text — verify by hand that it is not a cash label (owner ruling #958)`,
      });
      return;
    }
    if (CASH_LABEL_RE.test(extracted.text)) {
      violations.push({
        file: path,
        line: loc(valueEl),
        kind: "cash-label",
        reason: `a "${extracted.text}" label precedes a rendered ${field} — the bank tie-out's own ledger-derived balance may never be labelled cash (owner ruling #958); it stays a term of the reconciliation under its own label`,
      });
    }
  }

  function extendScope(stmt: ts.Statement, scope: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
    if (!ts.isVariableStatement(stmt)) return scope;
    let next = scope;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.initializer === undefined) continue;
      const namespace = useTranslationsNamespace(decl.initializer);
      if (namespace !== null) {
        const merged = new Map(next);
        merged.set(decl.name.text, namespace);
        next = merged;
      }
    }
    return next;
  }

  function visit(node: ts.Node, scope: ReadonlyMap<string, string>): void {
    const field = fieldNameOf(node);
    if (field !== null) handleTarget(node, field, scope);
    if (ts.isBlock(node) || ts.isSourceFile(node)) {
      let running = scope;
      for (const stmt of node.statements) {
        visit(stmt, running);
        running = extendScope(stmt, running);
      }
      return;
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  }

  visit(source, new Map());
  return { violations, sites };
}

function censusFile(path: string): { readonly violations: Violation[]; readonly sites: number } {
  return censusSource(path, readFileSync(path, "utf8"), REAL_MESSAGES);
}

describe("#958 census: the bank tie-out's ledger balance is never rendered under a cash label", () => {
  it("has no render site whose adjacent label reads as cash, and none with an unresolvable label", () => {
    const files = SCAN_DIRS.flatMap((d) => listSourceFiles(join(WEB_ROOT, d)));
    assert.ok(files.length > 50, `sanity: expected many source files under ${SCAN_DIRS.join(", ")}, found ${files.length}`);

    let totalSites = 0;
    const violations: Violation[] = [];
    for (const file of files) {
      const result = censusFile(file);
      totalSites += result.sites;
      violations.push(...result.violations);
    }

    if (violations.length > 0) {
      const report = violations.map((v) => `  ${relative(WEB_ROOT, v.file)}:${v.line} [${v.kind}] — ${v.reason}`).join("\n");
      assert.fail(`${violations.length} bank tie-out balance render site(s) fail the cash-label rule:\n${report}`);
    }

    assert.ok(totalSites >= 1, `expected at least the known reconciliation-section.tsx render site, found ${totalSites}`);
  });
});

describe("#958 fix-round regression: the risks this census exists to catch", () => {
  const FIXTURE_PATH = join(WEB_ROOT, "components", "zz-fixture-gl-balance-census-never-read-from-disk.tsx");

  it("catches a literal 'Cash' label preceding a rendered gl_prime_cents", () => {
    const code = `
      function Broken({ terms }: { terms: { gl_prime_cents: number | null } }) {
        return (
          <dl>
            <dt>Cash</dt><dd>{terms.gl_prime_cents}</dd>
          </dl>
        );
      }
    `;
    const { violations } = censusSource(FIXTURE_PATH, code, REAL_MESSAGES);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.kind, "cash-label");
  });

  it("catches a t()-resolved MESSAGE-COPY label that reads as cash, off the real en.json catalog (ClientFinancial.cashSet.chooseAccounts = \"Choose cash accounts\")", () => {
    const code = `
      import { useTranslations } from "next-intl";
      function Broken({ tie }: { tie: { gl_balance_cents: number | null } }) {
        const t = useTranslations("ClientFinancial.cashSet");
        return (
          <dl>
            <dt>{t("chooseAccounts")}</dt><dd>{tie.gl_balance_cents}</dd>
          </dl>
        );
      }
    `;
    const { violations } = censusSource(FIXTURE_PATH, code, REAL_MESSAGES);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.kind, "cash-label");
    assert.match(violations[0]!.reason, /Choose cash accounts/);
  });

  it("does not flag the real reconciliation surface's own 'GL balance' label (proves no false positive on the tree as it stands)", () => {
    const code = `
      import { useTranslations } from "next-intl";
      function Fine({ terms }: { terms: { gl_prime_cents: number | null } }) {
        const t = useTranslations("ClientBank.reconciliation");
        return (
          <dl>
            <dt>{t("glBalance")}</dt><dd>{terms.gl_prime_cents}</dd>
          </dl>
        );
      }
    `;
    assert.deepEqual(censusSource(FIXTURE_PATH, code, REAL_MESSAGES).violations, []);
  });

  it("fails closed on an unresolvable (dynamic) label rather than assuming it is safe", () => {
    const code = `
      function Ambiguous({ terms, kind }: { terms: { gl_prime_cents: number | null }; kind: string }) {
        return (
          <dl>
            <dt>{someHelper(kind)}</dt><dd>{terms.gl_prime_cents}</dd>
          </dl>
        );
      }
    `;
    const { violations } = censusSource(FIXTURE_PATH, code, REAL_MESSAGES);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.kind, "unresolved-label");
  });

  it("does not flag a render site with no adjacent label element at all (out of this census's scope, documented)", () => {
    const code = `
      function Bare({ terms }: { terms: { gl_prime_cents: number | null } }) {
        return <dd>{terms.gl_prime_cents}</dd>;
      }
    `;
    assert.deepEqual(censusSource(FIXTURE_PATH, code, REAL_MESSAGES).violations, []);
  });

  it("still counts the fixture's own render site (a non-vacuous scan — this would pass if the field-name match matched nothing)", () => {
    const code = `
      function Fine({ terms }: { terms: { gl_prime_cents: number | null } }) {
        return (
          <dl>
            <dt>Whatever</dt><dd>{terms.gl_prime_cents}</dd>
          </dl>
        );
      }
    `;
    assert.equal(censusSource(FIXTURE_PATH, code, REAL_MESSAGES).sites, 1);
  });
});
