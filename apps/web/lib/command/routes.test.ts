// The ⌘K route manifest, checked BOTH WAYS against the live `app/` tree
// (MBB-5, docs/plan/active/mohe-alignment-audit-2026-08-29.md §2).
//
// WHY A NEW GATE. ./routes.ts had no test at all — `grep` for FIRM_ROUTES /
// CLIENT_ROUTES across the suite returned zero, and test/manifest.txt had no
// entry. The designated backstop was prose: port-wave-plan-2026-08-28-part2.md
// §9.2 specifies "every `status` checked against whether a `page.tsx` exists at
// that path". That control is REAL but ONE-DIRECTIONAL, and the worst row in the
// file PASSED it: `needsYou` pointed at `/inbox` with `status: "planned"`, and
// since no page.tsx exists at `/inbox`, status and tree agreed perfectly. The
// flagship cross-client inbox 404'd from the app's universal entry point and the
// check said green.
//
// So this file asserts three things, and the third is the one §9.2 could not see:
//   1. status "built"  => a page.tsx serves that path.
//   2. a page.tsx serves that path => status "built"  (the other half of the
//      defect: nine live workbenches badged "Not built yet").
//   3. EVERY listed href resolves to a page at all, whatever its status.
//
// THE TREE IS THE ORACLE, not a hand-listed set of paths — the precedent is
// scripts/check-test-manifest.mjs, which globs real files and reds the build
// rather than trusting a checked-in list. A hardcoded expectation here would just
// be a second copy of routes.ts, drifting in the same direction.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { CLIENT_ROUTES, FIRM_ROUTES, type CommandRoute } from "./routes";
import messages from "../../messages/en.json";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app");
const WEB_DIR = join(APP_DIR, "..");

/** A placeholder client id for the CLIENT_ROUTES href builders. Any non-empty,
 *  slash-free string works — it lands on the `[clientId]` dynamic segment. */
const CLIENT_ID = "client-1111";

/**
 * Every URL path the real `app/` tree serves a `page.tsx` for, as segment
 * arrays. Route groups (`(firm)`, `(full)`) contribute NO url segment — that is
 * exactly what makes them groups — and `[param]` segments stay verbatim so the
 * matcher below can treat them as wildcards.
 */
function pagePatterns(dir: string, segments: string[] = [], out: string[][] = []): string[][] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      if (entry.name === "page.tsx" || entry.name === "page.ts" || entry.name === "page.jsx" || entry.name === "page.js") {
        out.push([...segments]);
      }
      continue;
    }
    if (!entry.isDirectory()) continue;
    // `_`-prefixed folders are private (Next's own convention) and serve
    // nothing. `app/api/` needs no special case: it holds route handlers
    // (`route.ts`), and this walk only ever collects `page.*`.
    if (entry.name.startsWith("_")) continue;
    const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
    pagePatterns(join(dir, entry.name), isGroup ? segments : [...segments, entry.name], out);
  }
  return out;
}

const PATTERNS = pagePatterns(APP_DIR);

function segmentsOf(href: string): string[] {
  return href.split("/").filter(Boolean);
}

function matchesPattern(hrefSegments: string[], pattern: string[]): boolean {
  const catchAllAt = pattern.findIndex((p) => p.startsWith("[...") || p.startsWith("[[..."));
  if (catchAllAt >= 0) {
    if (hrefSegments.length < catchAllAt) return false;
  } else if (hrefSegments.length !== pattern.length) {
    return false;
  }
  for (let i = 0; i < pattern.length; i += 1) {
    const p = pattern[i]!;
    if (p.startsWith("[...") || p.startsWith("[[...")) return true;
    const h = hrefSegments[i];
    if (h === undefined) return false;
    // A dynamic segment matches any single non-empty segment — but NEVER an
    // empty one, which is what a href built from a missing id would produce.
    if (p.startsWith("[") && p.endsWith("]")) continue;
    if (p !== h) return false;
  }
  return true;
}

/** True when the live `app/` tree serves a page at `href`. */
function resolvesToPage(href: string): boolean {
  const segs = segmentsOf(href);
  return PATTERNS.some((p) => matchesPattern(segs, p));
}

function hrefOf(route: CommandRoute): string {
  return route.scope === "firm" ? route.href : route.href(CLIENT_ID);
}

const ALL_ROUTES: CommandRoute[] = [...FIRM_ROUTES, ...CLIENT_ROUTES];

function routePatternLabel(pattern: string[]): string {
  return pattern.length === 0 ? "/" : `/${pattern.join("/")}`;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.isFile() && /\.[jt]sx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * Literal in-app links, proven by import identity: the JSX tag must be the
 * default binding (alias allowed) of `next/link`, not merely spell "Link".
 */
function staticNextLinkHrefs(roots: readonly string[]): string[] {
  const hrefs = new Set<string>();
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const linkBindings = new Set<string>();
      for (const statement of source.statements) {
        if (
          ts.isImportDeclaration(statement)
          && ts.isStringLiteral(statement.moduleSpecifier)
          && statement.moduleSpecifier.text === "next/link"
          && statement.importClause?.name
        ) {
          linkBindings.add(statement.importClause.name.text);
        }
      }
      const visit = (node: ts.Node): void => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          if (ts.isIdentifier(node.tagName) && linkBindings.has(node.tagName.text)) {
            const href = node.attributes.properties.find(
              (property): property is ts.JsxAttribute =>
                ts.isJsxAttribute(property) && property.name.getText(source) === "href",
            );
            const value = href?.initializer;
            if (value && ts.isStringLiteral(value)) hrefs.add(value.text);
            if (
              value
              && ts.isJsxExpression(value)
              && value.expression
              && (ts.isStringLiteral(value.expression) || ts.isNoSubstitutionTemplateLiteral(value.expression))
            ) {
              hrefs.add(value.expression.text);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(source, visit);
    }
  }
  return [...hrefs].filter((href) => href.startsWith("/"));
}

function orphanedFirmPages(
  firmAppDir: string,
  manifestHrefs: readonly string[],
  linkHrefs: readonly string[],
): string[] {
  const discoverable = [...manifestHrefs, ...linkHrefs].map((href) => href.split(/[?#]/, 1)[0]!);
  return pagePatterns(firmAppDir)
    .filter((pattern) => !discoverable.some((href) => matchesPattern(segmentsOf(href), pattern)))
    .map(routePatternLabel)
    .sort();
}

function goRouteLabel(id: string): unknown {
  const routes = (messages as { CommandPalette?: { go?: { routes?: Record<string, unknown> } } })
    .CommandPalette?.go?.routes;
  return routes?.[id];
}

// --- The instrument's own positive control ----------------------------------
// If the glob silently found nothing (a moved app/ dir, a bad join), every
// assertion below would still "pass" by vacuity in one direction and fail
// confusingly in the other. Prove the oracle SAW the tree first.

test("the oracle actually read the app/ tree", () => {
  assert.ok(PATTERNS.length >= 15, `expected the real app/ tree, found ${PATTERNS.length} page patterns`);
  assert.ok(
    PATTERNS.some((p) => p.join("/") === "clients/[clientId]/journals"),
    "the journals workbench page must be among the derived patterns — otherwise this file is measuring nothing",
  );
  assert.ok(PATTERNS.some((p) => p.length === 0), "the firm home page ('/') must be among the derived patterns");
  // The matcher must be capable of saying NO — a matcher that returns true for
  // everything would make all three assertions below vacuous.
  assert.equal(resolvesToPage("/definitely-not-a-route"), false);
  assert.equal(resolvesToPage("/clients"), true);
});

// --- The i18n label class (M1, independent review, PR #489) -----------------
//
// The Go manifest and messages/en.json are TWO checked-in files that must
// agree by NAME, and nothing enforced it: `adminSettings` was added to
// `FIRM_ROUTES` (FS-8 PR-2) without its matching `CommandPalette.go.routes.
// adminSettings` key. next-intl never throws on a missing message — it falls
// back to rendering the RAW DOTTED KEY PATH — so ⌘K silently showed
// "CommandPalette.go.routes.adminSettings" as a row label on every firm page.
// The estate already names this exact class (components/registers/
// opening-i18n-keys.test.tsx's own header: "next-intl's default … renders the
// RAW DOTTED KEY PATH … rather than throwing").
//
// A pure object-property read against `messages` (not a booted translator —
// this file's own design law, stated in the header above, is "prove static
// facts against real artifacts": next-intl's runtime is a second, unneeded
// artifact for a question the checked-in JSON already answers by itself).
// `!== undefined` is not enough: a value that is an OBJECT (someone nests a
// sub-key under a route id) resolves to the SAME raw-key-path fallback as an
// absent one and would pass a bare undefined check silently; an empty string
// resolves to invisible-but-technically-defined label and raises nothing
// either. Both are checked here explicitly, named, so a wrong shape reds with
// a message pointing at the exact id and the exact dotted path to fix.
//
// Scope is ALL_ROUTES, not just FIRM_ROUTES: components/command/
// command-palette.tsx calls the identical `tGoRoutes(route.id)` lookup for
// CLIENT_ROUTES rows (the "This client" section) that it calls for
// FIRM_ROUTES rows — same namespace, same lookup, same bug class either side.

test("every ⌘K route id resolves a real, non-empty CommandPalette.go.routes label — never the raw key path", () => {
  const bad = ALL_ROUTES
    .map((r) => ({ id: r.id, value: goRouteLabel(r.id) }))
    .filter(({ value }) => typeof value !== "string" || value.trim() === "");
  assert.deepEqual(
    bad.map(({ id, value }) => `${id} -> CommandPalette.go.routes.${id} (${typeof value === "string" ? "empty string" : `${typeof value}, not a string`})`),
    [],
    "every route id must resolve a non-empty string label in messages/en.json's CommandPalette.go.routes — a missing/empty/nested key renders the raw dotted key path (or nothing at all) as the ⌘K row's own label",
  );
});

test("REVERSE GATE positive control: a planted firm page with no manifest row or next/link is reported as an orphan", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "clara-nav-census-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const firm = join(fixture, "(firm)");
  mkdirSync(join(firm, "linked"), { recursive: true });
  mkdirSync(join(firm, "orphan"), { recursive: true });
  writeFileSync(join(firm, "linked", "page.tsx"), "export default function Page() { return null; }\n");
  writeFileSync(join(firm, "orphan", "page.tsx"), "export default function Page() { return null; }\n");
  writeFileSync(
    join(fixture, "navigation.tsx"),
    'import NextLink from "next/link"; export const Nav = () => <NextLink href="/linked">Linked</NextLink>;\n',
  );

  const orphans = orphanedFirmPages(firm, [], staticNextLinkHrefs([fixture]));
  assert.deepEqual(orphans, ["/orphan"], "the linked control must pass and the planted orphan must be observed");
  assert.throws(
    () => assert.deepEqual(orphans, [], `orphan firm pages: ${orphans.join(", ")}`),
    /orphan firm pages: \/orphan/,
    "the same zero-orphan assertion used on the app must go RED on the planted page",
  );
});

test("REVERSE GATE: every real (firm) page is discoverable from ⌘K or an in-app next/link", () => {
  const manifestHrefs = ALL_ROUTES.map(hrefOf);
  const linkHrefs = staticNextLinkHrefs([APP_DIR, join(WEB_DIR, "components")]);
  const orphans = orphanedFirmPages(join(APP_DIR, "(firm)"), manifestHrefs, linkHrefs);
  assert.deepEqual(
    orphans,
    [],
    "a page exists in the real firm app tree but has neither a routes.ts row nor a literal in-app next/link",
  );
});

test("/admin/members is present in ⌘K by its own stable row", () => {
  const members = FIRM_ROUTES.find((route) => route.id === "adminMembers");
  assert.ok(members, "removing adminMembers strands the flagship RBAC page from ⌘K");
  assert.equal(members.href, "/admin/members");
  assert.equal(resolvesToPage(members.href), true);

  const admin = FIRM_ROUTES.find((route) => route.id === "admin");
  assert.ok(admin);
  assert.equal(
    admin.keywords?.some((keyword) => keyword === "members" || keyword === "rbac"),
    false,
    "the generic Admin row must not win a Members search before the specific destination",
  );
  assert.equal(members.keywords?.includes("members"), true);
});
// --- 1. built => a page exists ----------------------------------------------

test('every route marked status "built" has a page.tsx at its href', () => {
  const wrong = ALL_ROUTES.filter((r) => r.status === "built" && !resolvesToPage(hrefOf(r)));
  assert.deepEqual(
    wrong.map((r) => `${r.id} -> ${hrefOf(r)}`),
    [],
    'a "built" badge on a path the tree does not serve is a fake affordance',
  );
});

// --- 2. a page exists => built (no false "Not built yet") --------------------

test('every route whose page.tsx exists is marked "built" — no live surface wears the "Not built yet" badge', () => {
  const wrong = ALL_ROUTES.filter((r) => resolvesToPage(hrefOf(r)) && r.status !== "built");
  assert.deepEqual(
    wrong.map((r) => `${r.id} -> ${hrefOf(r)} (status: ${r.status})`),
    [],
    'messages/en.json resolves the planned badge to the literal "Not built yet" — a shipped workbench must never carry it',
  );
});

// --- 3. every listed href resolves at all (the /inbox class) -----------------

test("every href in the manifest resolves to a real page — a ⌘K row may not point at a 404", () => {
  const unresolved = ALL_ROUTES.filter((r) => !resolvesToPage(hrefOf(r)));
  assert.deepEqual(
    unresolved.map((r) => `${r.id} -> ${hrefOf(r)}`),
    [],
    "this is the assertion §9.2's status-to-tree check structurally could not make: /inbox agreed with the tree (no page, status planned) while being the flagship inbox's only ⌘K entry",
  );
});

// --- The named regression pin ------------------------------------------------

test("the needsYou row points at /needs-you, and /inbox is not a path this app serves", () => {
  const needsYou = FIRM_ROUTES.find((r) => r.id === "needsYou");
  assert.ok(needsYou, "the cross-client inbox must stay in the Go manifest");
  assert.equal(needsYou.href, "/needs-you");
  assert.equal(resolvesToPage("/needs-you"), true);
  // The pin is on the TREE, not on the string: if someone ever builds an
  // /inbox page, this line tells them to re-decide the row rather than
  // silently leaving two inboxes.
  assert.equal(resolvesToPage("/inbox"), false, "if /inbox now exists, decide which one the manifest names — do not keep both");
});
