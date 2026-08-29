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
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLIENT_ROUTES, FIRM_ROUTES, type CommandRoute } from "./routes";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app");

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
