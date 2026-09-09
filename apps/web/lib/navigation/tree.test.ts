// THE ONE NAVIGATION REGISTRY, under test (#614).
//
// The registry replaced four hand-maintained copies of the product's
// destinations, so the cells here are about the two properties that made the
// copies dangerous rather than about the data being present:
//
//   1. RANK SHAPING IS ONE PREDICATE. Every visible-* function filters through
//      `hasNavigationAccess`, so the sidebar, ⌘K and the settings hub cannot
//      disagree about who may see a destination. The per-role expectations below
//      are written out in full — a set, not a count — because a count passes on
//      the day two rows swap floors.
//   2. THE URL IS THE TRUTH. `resolveActive` / `breadcrumbFor` /
//      `switchClientDestination` are pure functions of the path and its query,
//      so "where am I" and "where does this take me" have exactly one answer and
//      it is derivable without rendering anything.
//
// The i18n cell at the end is the `lib/command/routes.test.ts` precedent applied
// to this registry: next-intl renders a MISSING key as its raw dotted path
// rather than throwing, so a label key that does not resolve ships as
// "AppShell.firmNav.work" in the sidebar and nothing goes red.

import assert from "node:assert/strict";
import { test } from "node:test";

import messages from "../../messages/en.json";
import {
  ACCOUNTING_ITEMS,
  CLIENT_NAV,
  FIRM_NAV,
  REGISTERS_DEFAULT_TAB,
  SETTINGS_SECTIONS,
  WORK_NEEDS_YOU_HREF,
  accountingHref,
  breadcrumbFor,
  clientIdOf,
  clientNavHref,
  resolveActive,
  switchClientDestination,
  visibleAccountingItems,
  visibleClientNav,
  visibleFirmNav,
  visibleSettingsSections,
  type NavigationScope,
} from "./tree";

const scope = (role_rank: number | null, is_operator = false): NavigationScope => ({
  role_rank,
  is_operator,
});

const VIEWER = scope(0);
const BOOKKEEPER = scope(1);
const ADMIN = scope(2);
const OWNER = scope(3);
const OPERATOR_OWNER = scope(3, true);
const UNKNOWN = scope(null);

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const params = (query = ""): URLSearchParams => new URLSearchParams(query);

// ── rank shaping ─────────────────────────────────────────────────────────────

test("firm nav is rank-shaped: Activity floors at bookkeeper, everything else is viewer", () => {
  const ids = (s: NavigationScope) => visibleFirmNav(s).map((i) => i.id);
  assert.deepEqual(ids(VIEWER), ["home", "clients", "work", "settings"]);
  assert.deepEqual(ids(BOOKKEEPER), ["home", "clients", "work", "activity", "settings"]);
  assert.deepEqual(ids(ADMIN), ["home", "clients", "work", "activity", "settings"]);
  assert.deepEqual(ids(OWNER), ["home", "clients", "work", "activity", "settings"]);
  // A NULL / unreadable rank fails closed out of the WHOLE nav, mirroring the
  // DB's own `coalesce(rank, -1)`. Asserted rather than assumed: this is the arm
  // a caller with no membership takes, and it must render no destinations at all.
  assert.deepEqual(ids(UNKNOWN), []);
});

test("settings sections are rank-shaped: members at admin, vendor bindings at bookkeeper, registrations at owner+operator", () => {
  const ids = (s: NavigationScope) => visibleSettingsSections(s).map((i) => i.id);
  assert.deepEqual(ids(VIEWER), ["account", "firm", "compliance"]);
  assert.deepEqual(ids(BOOKKEEPER), ["account", "firm", "compliance", "vendorBindings"]);
  assert.deepEqual(ids(ADMIN), ["account", "firm", "members", "compliance", "vendorBindings"]);
  assert.deepEqual(ids(OWNER), ["account", "firm", "members", "compliance", "vendorBindings"]);
  assert.deepEqual(ids(OPERATOR_OWNER), SETTINGS_SECTIONS.map((s) => s.id));
  assert.deepEqual(ids(UNKNOWN), []);
});

test("the operator conjunct is a CONJUNCT — an owner on a non-operator firm is refused the queue", () => {
  // The discriminating half. Without it, "an operator owner sees everything"
  // passes just as happily on the day `operatorOnly` stops being read at all.
  assert.equal(
    visibleSettingsSections(OWNER).some((s) => s.id === "registrations"),
    false,
  );
  assert.equal(
    visibleSettingsSections(scope(2, true)).some((s) => s.id === "registrations"),
    false,
    "an operator ADMIN is below the owner floor and must not see the queue either",
  );
});

test("client nav and accounting children are viewer-floored, and still fail closed on an unknown rank", () => {
  assert.deepEqual(visibleClientNav(VIEWER).map((i) => i.id), CLIENT_NAV.map((i) => i.id));
  assert.deepEqual(visibleAccountingItems(VIEWER).map((i) => i.id), ACCOUNTING_ITEMS.map((i) => i.id));
  assert.deepEqual(visibleClientNav(UNKNOWN), []);
  assert.deepEqual(visibleAccountingItems(UNKNOWN), []);
});

test("the vendor-bindings row is the ONLY one marked legacy, and the tax row the only beta", () => {
  assert.deepEqual(SETTINGS_SECTIONS.filter((s) => s.legacy).map((s) => s.id), ["vendorBindings"]);
  assert.deepEqual(ACCOUNTING_ITEMS.filter((i) => i.beta).map((i) => i.id), ["tax"]);
});

// ── hrefs ────────────────────────────────────────────────────────────────────

test("the four register rows are ?tab= views of ONE workbench, and the object URLs are unchanged", () => {
  const href = (id: string) => accountingHref(A, ACCOUNTING_ITEMS.find((i) => i.id === id)!);
  assert.equal(href("journals"), `/clients/${A}/journals`);
  assert.equal(href("bank"), `/clients/${A}/bank`);
  assert.equal(href("receivables"), `/clients/${A}/registers?tab=aging`);
  assert.equal(href("assets"), `/clients/${A}/registers?tab=fixedAssets`);
  assert.equal(href("plans"), `/clients/${A}/registers?tab=adjustments`);
  assert.equal(href("accounts"), `/clients/${A}/registers?tab=accounts`);
  assert.equal(href("close"), `/clients/${A}/close`);
  assert.equal(href("tax"), `/clients/${A}/tax`);

  const clientHref = (id: string) => clientNavHref(A, CLIENT_NAV.find((i) => i.id === id)!);
  assert.equal(clientHref("home"), `/clients/${A}`);
  assert.equal(clientHref("documents"), `/clients/${A}/documents`);
  assert.equal(clientHref("knowledge"), `/clients/${A}/knowledge`);
  assert.equal(clientHref("reports"), `/clients/${A}/reports`);
  assert.equal(clientHref("work"), `/clients/${A}/work`);
  assert.equal(clientHref("accounting"), `/clients/${A}/accounting`);
});

test("Needs you is a saved VIEW of Work, not a destination of its own", () => {
  assert.equal(WORK_NEEDS_YOU_HREF, "/work?view=needs-you");
  assert.equal(
    FIRM_NAV.some((i) => i.href === "/needs-you"),
    false,
    "/needs-you is a legacy redirect now — it must not be back in the tree",
  );
});

// ── resolveActive ────────────────────────────────────────────────────────────

test("resolveActive names the ONE current entry at firm altitude", () => {
  assert.equal(resolveActive("/").firmItem, "home");
  assert.equal(resolveActive("/clients").firmItem, "clients");
  assert.equal(resolveActive("/work").firmItem, "work");
  assert.equal(resolveActive("/work", params("view=needs-you")).firmItem, "work");
  assert.equal(resolveActive("/activity").firmItem, "activity");
  assert.equal(resolveActive("/settings").firmItem, "settings");
  assert.equal(resolveActive("/settings").settingsSection, null);
  assert.equal(resolveActive("/settings/members").firmItem, "settings");
  assert.equal(resolveActive("/settings/members").settingsSection, "members");
  assert.equal(resolveActive("/settings/vendor-bindings").settingsSection, "vendorBindings");
  // An unrecognised firm path marks nothing — the honest answer, and the one
  // that keeps `aria-current` from landing on a page nobody is looking at.
  assert.equal(resolveActive("/nowhere").firmItem, null);
  assert.equal(resolveActive("/nowhere").scope, "firm");
});

test("resolveActive reads a client sub-path, and the registers workbench's own default tab", () => {
  const at = (path: string, query = "") => resolveActive(path, params(query));
  assert.deepEqual(
    { scope: at(`/clients/${A}`).scope, item: at(`/clients/${A}`).clientItem },
    { scope: "client", item: "home" },
  );
  assert.equal(at(`/clients/${A}/documents`).clientItem, "documents");
  assert.equal(at(`/clients/${A}/work`).clientItem, "work");
  assert.equal(at(`/clients/${A}/accounting`).clientItem, "accounting");
  assert.equal(at(`/clients/${A}/accounting`).accountingOpen, true);

  assert.equal(at(`/clients/${A}/journals`).accountingItem, "journals");
  assert.equal(at(`/clients/${A}/journals`).clientItem, null);
  assert.equal(at(`/clients/${A}/journals`).accountingOpen, true);
  assert.equal(at(`/clients/${A}/tax`).accountingItem, "tax");

  // A BARE /registers IS THE AGING VIEW. The workbench falls back to `aging`
  // when `?tab=` is absent, so the sidebar must mark that row current for the
  // bare path — marking nothing would be wrong about a page a human is on.
  assert.equal(REGISTERS_DEFAULT_TAB, "aging");
  assert.equal(at(`/clients/${A}/registers`).accountingItem, "receivables");
  assert.equal(at(`/clients/${A}/registers`, "tab=aging").accountingItem, "receivables");
  assert.equal(at(`/clients/${A}/registers`, "tab=fixedAssets").accountingItem, "assets");
  assert.equal(at(`/clients/${A}/registers`, "tab=adjustments").accountingItem, "plans");
  assert.equal(at(`/clients/${A}/registers`, "tab=accounts").accountingItem, "accounts");

  // The two tabs the sidebar deliberately does not name: nothing is current, and
  // the group stays OPEN. Marking a sibling would tell the human they are
  // somewhere they are not.
  assert.equal(at(`/clients/${A}/registers`, "tab=opening").accountingItem, null);
  assert.equal(at(`/clients/${A}/registers`, "tab=opening").accountingOpen, true);
  assert.equal(at(`/clients/${A}/registers`, "tab=staffAdvances").accountingItem, null);

  // The escalated Clara thread is client SCOPE with nothing active.
  const clara = at(`/clients/${A}/clara/thread-1`);
  assert.equal(clara.scope, "client");
  assert.equal(clara.clientId, A);
  assert.equal(clara.clientItem, null);
  assert.equal(clara.accountingItem, null);
  assert.equal(clara.accountingOpen, false);
});

test("AT MOST ONE entry is ever current — the aria-current contract, over every route this app serves", () => {
  const routes = [
    "/", "/clients", "/work", "/activity", "/settings",
    ...SETTINGS_SECTIONS.map((s) => s.href),
    `/clients/${A}`,
    ...CLIENT_NAV.map((i) => clientNavHref(A, i)),
    ...ACCOUNTING_ITEMS.map((i) => accountingHref(A, i)),
    `/clients/${A}/clara/t1`,
    `/clients/${A}/registers?tab=opening`,
  ];
  for (const route of routes) {
    const [path, query = ""] = route.split("?");
    const active = resolveActive(path!, params(query));
    const marked = [
      active.firmItem,
      active.clientItem,
      active.accountingItem,
      // The settings SECTION is a second mark by design — but it lives in the
      // in-page settings nav, never in the sidebar, so it cannot collide with
      // the sidebar's own single `aria-current`. Counted apart for that reason.
    ].filter((v) => v !== null);
    assert.ok(marked.length <= 1, `${route} marks ${marked.length} sidebar entries: ${marked.join(", ")}`);
  }
});

test("clientIdOf reads the URL verbatim and never invents one", () => {
  assert.equal(clientIdOf("/clients"), null);
  assert.equal(clientIdOf("/"), null);
  assert.equal(clientIdOf("/work"), null);
  assert.equal(clientIdOf(`/clients/${A}`), A);
  assert.equal(clientIdOf(`/clients/${A}/journals`), A);
  // Garbage percent-encoding throws out of decodeURIComponent; this runs in a
  // render body, so it must answer "no client", not crash the shell.
  assert.equal(clientIdOf("/clients/%E0%A4%A"), null);
});

// ── breadcrumbs ──────────────────────────────────────────────────────────────

const NAMES = { firmName: "E2E Accounting", clientName: "Rome Properties" };

/** A crumb rendered as a comparable tuple — label source, resolved text, href. */
function shape(pathname: string, query = "") {
  return breadcrumbFor(pathname, params(query), NAMES).map((crumb) =>
    crumb.kind === "text"
      ? { text: crumb.text, href: crumb.href ?? null }
      : { text: `${crumb.ns}:${crumb.key}`, href: crumb.href ?? null },
  );
}

test("the breadcrumb is the page's ancestry, firm first, and the CURRENT page is never a link", () => {
  assert.deepEqual(shape("/"), [{ text: "E2E Accounting", href: null }]);

  assert.deepEqual(shape("/work"), [
    { text: "E2E Accounting", href: "/" },
    { text: "AppShell:firmNav.work", href: null },
  ]);

  // The saved view is NOT a crumb — same ancestry as bare /work.
  assert.deepEqual(shape("/work", "view=needs-you"), shape("/work"));

  assert.deepEqual(shape("/settings/members"), [
    { text: "E2E Accounting", href: "/" },
    { text: "AppShell:firmNav.settings", href: "/settings" },
    { text: "Settings:sections.members.title", href: null },
  ]);

  assert.deepEqual(shape(`/clients/${A}/journals`), [
    { text: "E2E Accounting", href: "/" },
    { text: "AppShell:firmNav.clients", href: "/clients" },
    { text: "Rome Properties", href: `/clients/${A}` },
    { text: "AppShell:clientNav.accounting", href: `/clients/${A}/accounting` },
    { text: "AppShell:accounting.journals", href: null },
  ]);

  assert.deepEqual(shape(`/clients/${A}/registers`, "tab=fixedAssets"), [
    { text: "E2E Accounting", href: "/" },
    { text: "AppShell:firmNav.clients", href: "/clients" },
    { text: "Rome Properties", href: `/clients/${A}` },
    { text: "AppShell:clientNav.accounting", href: `/clients/${A}/accounting` },
    { text: "AppShell:accounting.assets", href: null },
  ]);

  assert.deepEqual(shape(`/clients/${A}`), [
    { text: "E2E Accounting", href: "/" },
    { text: "AppShell:firmNav.clients", href: "/clients" },
    { text: "Rome Properties", href: null },
  ]);

  // The escalated thread ends at the client's identity — the crumb that matters
  // most at that altitude, and honest about the menu not containing this surface.
  assert.deepEqual(shape(`/clients/${A}/clara/t1`), [
    { text: "E2E Accounting", href: "/" },
    { text: "AppShell:firmNav.clients", href: "/clients" },
    { text: "Rome Properties", href: null },
  ]);
});

test("no breadcrumb trail ever ends in a link, on any route", () => {
  const routes = [
    "/", "/clients", "/work", "/activity", "/settings",
    ...SETTINGS_SECTIONS.map((s) => s.href),
    ...CLIENT_NAV.map((i) => clientNavHref(A, i)),
    ...ACCOUNTING_ITEMS.map((i) => accountingHref(A, i)),
    `/clients/${A}/registers?tab=opening`,
    `/clients/${A}/clara/t1`,
  ];
  for (const route of routes) {
    const [path, query = ""] = route.split("?");
    const crumbs = breadcrumbFor(path!, params(query), NAMES);
    assert.ok(crumbs.length >= 1, `${route} produced no crumbs`);
    assert.equal(crumbs[crumbs.length - 1]!.href, undefined, `${route}'s last crumb is a link`);
    for (const crumb of crumbs.slice(0, -1)) {
      assert.ok(crumb.href, `${route} has an ancestor crumb with no href`);
    }
  }
});

test("an unresolved client name falls back to the neutral placeholder crumb — never the raw id, never a guessed name", () => {
  const crumbs = breadcrumbFor(`/clients/${A}/documents`, params(), {
    firmName: "E2E Accounting",
    clientName: null,
  });
  assert.deepEqual(
    crumbs.map((c) => (c.kind === "text" ? c.text : c.key)),
    ["E2E Accounting", "firmNav.clients", "scope.clientPlaceholder", "clientNav.documents"],
  );
  assert.equal(crumbs[2]!.href, `/clients/${A}`, "the placeholder crumb still links to the client's home");
  assert.ok(crumbs.every((c) => c.kind !== "text" || c.text !== A), "the raw id must not appear as crumb text");
  const home = breadcrumbFor(`/clients/${A}`, params(), { firmName: "E2E Accounting", clientName: null });
  assert.deepEqual(home.map((c) => (c.kind === "text" ? c.text : c.key)), ["E2E Accounting", "firmNav.clients", "scope.clientPlaceholder"]);
  assert.equal(home[2]!.href, undefined, "the current page crumb is not a link");
});

// ── switching client ─────────────────────────────────────────────────────────

test("switching client keeps the DESTINATION KIND under the new client", () => {
  const to = (path: string, query = "") => switchClientDestination(path, params(query), B);
  assert.equal(to(`/clients/${A}`), `/clients/${B}`);
  assert.equal(to(`/clients/${A}/journals`), `/clients/${B}/journals`);
  assert.equal(to(`/clients/${A}/documents`), `/clients/${B}/documents`);
  assert.equal(to(`/clients/${A}/accounting`), `/clients/${B}/accounting`);
  assert.equal(to(`/clients/${A}/registers`, "tab=fixedAssets"), `/clients/${B}/registers?tab=fixedAssets`);
  assert.equal(to(`/clients/${A}/registers`, "tab=opening"), `/clients/${B}/registers?tab=opening`);
  assert.equal(to(`/clients/${A}/registers`), `/clients/${B}/registers`);
  assert.equal(to(`/clients/${A}/work`, "view=needs-you"), `/clients/${B}/work?view=needs-you`);
});

test("a THREAD is not portable, and a firm path is not a client destination", () => {
  const to = (path: string, query = "") => switchClientDestination(path, params(query), B);
  // One conversation about one client. There is no corresponding thread under B,
  // and resolving to one would be exactly the cross-client leak the scope
  // provider exists to prevent.
  assert.equal(to(`/clients/${A}/clara/thread-1`), `/clients/${B}`);
  assert.equal(to("/activity"), `/clients/${B}`);
  assert.equal(to("/settings/members"), `/clients/${B}`);
  assert.equal(to("/"), `/clients/${B}`);
});

test("only ?tab= and ?view= travel — no other query parameter follows a client switch", () => {
  // A filter, a cursor, a selected row id are all about the client being left.
  const moved = switchClientDestination(
    `/clients/${A}/documents`,
    params("filing=abc&page=3"),
    B,
  );
  assert.equal(moved, `/clients/${B}/documents`);
});

// ── i18n ─────────────────────────────────────────────────────────────────────

function resolve(ns: string, key: string): unknown {
  let node: unknown = (messages as Record<string, unknown>)[ns];
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

test("every label key in the registry resolves to a non-empty STRING in messages/en.json", () => {
  // next-intl renders a missing key as its raw dotted path rather than throwing,
  // so an unresolved key ships as "AppShell.firmNav.work" in the sidebar with
  // nothing going red. A key that resolves to an OBJECT fails the same way.
  const pairs: [string, string][] = [
    ...FIRM_NAV.map((i): [string, string] => ["AppShell", i.labelKey]),
    ...CLIENT_NAV.map((i): [string, string] => ["AppShell", i.labelKey]),
    ...ACCOUNTING_ITEMS.map((i): [string, string] => ["AppShell", i.labelKey]),
    ["AppShell", "clientNav.registersView"],
    ...SETTINGS_SECTIONS.flatMap((s): [string, string][] => [
      ["Settings", s.labelKey],
      ["Settings", s.purposeKey],
    ]),
  ];
  const bad = pairs
    .map(([ns, key]) => ({ path: `${ns}.${key}`, value: resolve(ns, key) }))
    .filter(({ value }) => typeof value !== "string" || value.trim() === "");
  assert.deepEqual(bad.map((b) => b.path), []);
});
