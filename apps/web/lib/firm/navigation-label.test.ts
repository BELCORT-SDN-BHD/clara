// E-7 / CB-AE2E-014 — "Admin" is the wrong word below admin rank.
//
// The section's READ floor is deliberately untouched: a viewer legitimately
// reaches the compliance register and the firm settings under it, and a
// bookkeeper the vendor bindings too, so HIDING the entry would take away
// destinations that genuinely are theirs. Only the label was lying.
//
// These cells pin both halves — the rename happens, and NOTHING ELSE about the
// navigation shape moves with it. The second half matters more than it looks: a
// label change routed through the same filter as the rank shaping is one typo
// away from dropping an entry.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ADMIN_NAVIGATION, FIRM_NAVIGATION, visibleAdminNavigation, visibleFirmNavigation } from "./navigation";
import type { NavigationScope } from "./navigation";

const scope = (role_rank: number | null, is_operator = false): NavigationScope => ({ role_rank, is_operator });

function adminEntry(s: NavigationScope) {
  return visibleFirmNavigation(s).find((e) => e.id === "admin");
}

test("the Admin entry reads 'Firm' below admin rank and 'Admin' at admin and above", () => {
  assert.equal(adminEntry(scope(0))?.messageKey, "firm", "a viewer sees Firm");
  assert.equal(adminEntry(scope(1))?.messageKey, "firm", "a bookkeeper sees Firm");
  assert.equal(adminEntry(scope(2))?.messageKey, "admin", "an admin sees Admin");
  assert.equal(adminEntry(scope(3))?.messageKey, "admin", "an owner sees Admin");
  // An UNREADABLE rank never reaches the label question at all: the sidebar's
  // own `hasNavigationAccess` fails closed out of EVERY entry on a NULL rank
  // (`(rank ?? -1) < 0`), mirroring the SQL's `coalesce(rank, -1)`. Asserted
  // here so a future reader does not mistake the absence for a rename bug.
  assert.equal(adminEntry(scope(null)), undefined, "a NULL rank sees no sidebar entry at all, so no label is chosen");
});

test("the entry itself is never HIDDEN by the rename — the destinations under it stay reachable", () => {
  for (const rank of [0, 1, 2, 3]) {
    const entry = adminEntry(scope(rank));
    assert.ok(entry, `rank ${rank} must still see the section entry`);
    assert.equal(entry?.href, "/admin", "the destination is unchanged at every rank");
    assert.equal(entry?.id, "admin", "the entry's identity is unchanged — only its label moves");
  }
});

test("every OTHER navigation entry is byte-identical to its registry row at every rank", () => {
  // The map() that performs the rename walks every entry. This is the control
  // that proves it changed exactly one field of exactly one of them.
  for (const rank of [0, 1, 2, 3, null]) {
    const visible = visibleFirmNavigation(scope(rank, true));
    for (const entry of visible) {
      if (entry.id === "admin") continue;
      const registry = FIRM_NAVIGATION.find((e) => e.id === entry.id);
      assert.deepEqual(entry, registry, `${entry.id} was altered at rank ${rank}`);
    }
  }
});

test("the rank shaping itself is unchanged — the same entries are visible as before the rename", () => {
  const idsAt = (rank: number | null, isOperator = false) =>
    visibleFirmNavigation(scope(rank, isOperator)).map((e) => e.id);
  // activity floors at bookkeeper (`agent_receipts_visible`, 0103:410); every
  // other primary entry is viewer-floored.
  assert.deepEqual(idsAt(0), ["home", "needsYou", "clients", "admin"]);
  assert.deepEqual(idsAt(1), ["home", "needsYou", "clients", "activity", "admin"]);
  assert.deepEqual(idsAt(null), [], "a NULL rank fails closed out of the whole sidebar, as it always did");
  // And the admin CHILDREN are untouched by this train.
  assert.deepEqual(visibleAdminNavigation(scope(1)).map((e) => e.id), ["compliance", "vendorBindings", "settings"]);
  assert.deepEqual(
    visibleAdminNavigation(scope(3, true)).map((e) => e.id),
    ADMIN_NAVIGATION.map((e) => e.id),
    "an operator owner still sees every admin section",
  );
});
