// E-7 / CB-AE2E-014 (裁-187) — "a nav label must not lie about what is behind
// it" — CARRIED FORWARD THROUGH #614, which changed the MECHANISM and kept the
// law.
//
// WHAT THE ORIGINAL DEFECT WAS. The firm sidebar's fifth entry read "Admin" at
// every rank, and its read floor was viewer — correctly, because a viewer really
// does reach the compliance register and the firm settings underneath it. So a
// bookkeeper read "Admin", found nothing administrative, and reasonably
// concluded the product was offering them something they could not use. The fix
// then was a RANK-SHAPED RENAME: `visibleFirmNavigation` rewrote that one entry's
// `messageKey` to "firm" for anyone who could not manage members.
//
// WHAT #614 DID INSTEAD. The destination is now "Settings", which is honest at
// every rank, and the one section that genuinely IS administration (Members) is
// the one section that appears only at admin+. The rename machinery is gone.
//
// SO THESE CELLS PIN THE OUTCOME, NOT THE OLD MECHANISM. The label may not lie;
// the way it stops lying is that there is nothing left to rewrite. The strongest
// available statement of that is a NEGATIVE one — no visible-* function alters
// any row on its way out — and that is what the first cell asserts, because a
// reintroduced per-rank rewrite is exactly the thing a future lane would add
// without noticing it now has two sources of a label.

import { test } from "node:test";
import assert from "node:assert/strict";

import { hasNavigationAccess, type NavigationScope } from "./navigation";
import {
  ACCOUNTING_ITEMS,
  CLIENT_NAV,
  FIRM_NAV,
  SETTINGS_SECTIONS,
  visibleAccountingItems,
  visibleClientNav,
  visibleFirmNav,
  visibleSettingsSections,
} from "../navigation/tree";

const scope = (role_rank: number | null, is_operator = false): NavigationScope => ({
  role_rank,
  is_operator,
});

test("no navigation entry is REWRITTEN on its way out — every visible row is its registry row, at every rank", () => {
  // The control that would have caught the original defect's fix drifting, and
  // the one that keeps a second label source from being reintroduced quietly:
  // filtering is allowed, mutation is not.
  for (const rank of [0, 1, 2, 3, null]) {
    for (const operator of [false, true]) {
      const s = scope(rank, operator);
      for (const row of visibleFirmNav(s)) {
        assert.deepEqual(row, FIRM_NAV.find((e) => e.id === row.id), `firm ${row.id} @ ${rank}`);
      }
      for (const row of visibleSettingsSections(s)) {
        assert.deepEqual(row, SETTINGS_SECTIONS.find((e) => e.id === row.id), `settings ${row.id} @ ${rank}`);
      }
      for (const row of visibleClientNav(s)) {
        assert.deepEqual(row, CLIENT_NAV.find((e) => e.id === row.id), `client ${row.id} @ ${rank}`);
      }
      for (const row of visibleAccountingItems(s)) {
        assert.deepEqual(row, ACCOUNTING_ITEMS.find((e) => e.id === row.id), `accounting ${row.id} @ ${rank}`);
      }
    }
  }
});

test("the entry that used to lie is called Settings, is offered at every rank, and points at /settings", () => {
  for (const rank of [0, 1, 2, 3]) {
    const entry = visibleFirmNav(scope(rank)).find((e) => e.id === "settings");
    assert.ok(entry, `rank ${rank} must still see the settings entry`);
    assert.equal(entry.href, "/settings");
    assert.equal(entry.labelKey, "firmNav.settings", "the label is rank-independent now");
  }
  // An UNREADABLE rank never reaches the label question at all: the floor
  // predicate fails closed out of EVERY entry on a NULL rank (`(rank ?? -1) < 0`),
  // mirroring the SQL's `coalesce(rank, -1)`. Asserted here so a future reader
  // does not mistake the absence for a regression.
  assert.equal(visibleFirmNav(scope(null)).length, 0);
});

test("the label is honest because the ADMINISTRATIVE section is the gated one — Members appears only at admin and above", () => {
  // This is what makes "Settings" true for a bookkeeper: the sections they are
  // offered under it really are theirs, and the one that is not is absent.
  const sectionIds = (rank: number) => visibleSettingsSections(scope(rank)).map((s) => s.id);
  assert.equal(sectionIds(0).includes("members"), false, "a viewer is not offered Members");
  assert.equal(sectionIds(1).includes("members"), false, "a bookkeeper is not offered Members");
  assert.equal(sectionIds(2).includes("members"), true, "an admin is");
  assert.equal(sectionIds(3).includes("members"), true, "an owner is");
  // …and a bookkeeper is offered something real under it, so hiding the whole
  // entry would have taken away destinations that genuinely are theirs — the
  // reason 裁-187 renamed rather than hid.
  assert.deepEqual(sectionIds(1), ["account", "firm", "compliance", "vendorBindings"]);
});

test("VACUITY CONTROL: the floor predicate really can say no, and says it per entry", () => {
  // Without this the cells above would pass just as happily if
  // `hasNavigationAccess` returned true unconditionally.
  assert.equal(hasNavigationAccess(scope(1), { minimumRole: "admin" }), false);
  assert.equal(hasNavigationAccess(scope(2), { minimumRole: "admin" }), true);
  assert.equal(hasNavigationAccess(scope(null), { minimumRole: "viewer" }), false);
  assert.equal(hasNavigationAccess(scope(3), { minimumRole: "owner", operatorOnly: true }), false);
  assert.equal(hasNavigationAccess(scope(3, true), { minimumRole: "owner", operatorOnly: true }), true);
});
