// THE LEGACY ROUTE MATRIX, under test (#614).
//
// A redirect table is the one piece of navigation nothing else exercises: no
// component renders it, no ⌘K row points at it, and a typo in a `source` is
// invisible until a human follows an old bookmark and lands on a 404. So the
// rows are asserted literally here, and — because `next.config.ts` cannot be
// imported in a node cell without pulling the whole Next build pipeline and its
// side effects in with it — the wiring is proven the way `tests/source-oracle.
// test.ts` proves wiring generally: by reading the config's own source.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { LEGACY_ROUTES, legacyRedirects } from "./legacy-routes";
import { ACCOUNTING_ITEMS, CLIENT_NAV, FIRM_NAV, SETTINGS_SECTIONS, accountingHref, clientNavHref } from "./tree";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string): string => readFileSync(join(WEB_ROOT, path), "utf8");

test("every moved path redirects to its new home, and the matrix is exactly these seven rows", () => {
  assert.deepEqual(
    LEGACY_ROUTES.map((r) => [r.source, r.destination]),
    [
      ["/needs-you", "/work?view=needs-you"],
      ["/admin", "/settings"],
      ["/admin/members", "/settings/members"],
      ["/admin/settings", "/settings/firm"],
      ["/admin/compliance", "/settings/compliance"],
      ["/admin/vendor-bindings", "/settings/vendor-bindings"],
      ["/admin/registrations", "/settings/registrations"],
    ],
  );
});

test("every redirect is TEMPORARY — a 308 would be cached in every browser essentially forever", () => {
  const rows = legacyRedirects();
  assert.equal(rows.length, LEGACY_ROUTES.length);
  for (const row of rows) {
    assert.equal(row.permanent, false, `${row.source} is permanent`);
  }
});

test("no row redirects a path to itself — a redirect loop the framework would serve as a 5xx", () => {
  const selfLoops = LEGACY_ROUTES.filter((r) => r.source === r.destination.split("?")[0]);
  assert.deepEqual(selfLoops.map((r) => r.source), []);
});

test("every DESTINATION is a real destination in the registry, not a hand-typed path", () => {
  // The failure this catches is the one a redirect table is most prone to: a
  // destination typed correctly on the day it was written and left behind when
  // the registry moved. Every row's target must be somewhere the tree names.
  const known = new Set<string>([
    ...FIRM_NAV.map((i) => i.href),
    ...SETTINGS_SECTIONS.map((s) => s.href),
    "/work?view=needs-you",
  ]);
  const unknown = LEGACY_ROUTES.filter((r) => !known.has(r.destination));
  assert.deepEqual(unknown.map((r) => `${r.source} -> ${r.destination}`), []);
});

test("no SOURCE is a path the app still serves — a redirect must never shadow a live page", () => {
  // `/admin` and `/needs-you` are deleted in the same commit as this table. If
  // one came back, the redirect would silently win and the page would be
  // unreachable with nothing saying so.
  const live = new Set<string>([
    ...FIRM_NAV.map((i) => i.href),
    ...SETTINGS_SECTIONS.map((s) => s.href),
    ...CLIENT_NAV.map((i) => clientNavHref("x", i)),
    ...ACCOUNTING_ITEMS.map((i) => accountingHref("x", i)),
  ]);
  const shadowed = LEGACY_ROUTES.filter((r) => live.has(r.source));
  assert.deepEqual(shadowed.map((r) => r.source), []);
});

test("next.config.ts actually WIRES this table — the source oracle, because the config cannot be imported here", () => {
  // `next.config.ts` calls `initOpenNextCloudflareForDev()` at module scope and
  // is compiled by the next-intl plugin, so importing it in a node cell is not
  // a read — it is a side effect. Reading the source is the honest instrument,
  // and it is the same one tests/source-oracle.test.ts uses for the same reason.
  const config = read("next.config.ts");
  assert.match(config, /from "@\/lib\/navigation\/legacy-routes"|from "\.\/lib\/navigation\/legacy-routes"/);
  assert.match(config, /redirects:\s*async\s*\(\)\s*=>\s*legacyRedirects\(\)/);
});
