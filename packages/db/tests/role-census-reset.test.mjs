// #867 — role-census-reset.mjs. Static parsing (no database) plus a live read-only
// check against THIS rig's real cluster state, and a refusal proof for `apply`.
// Never runs the destructive `apply` path to completion here: this suite proves it
// REFUSES while blocked (the state every rig with a live checkout-gate lane is in),
// never that a real drop succeeds -- that half is proven by hand in the ticket's
// final report (a real `drop role` / restore cycle against this rig, with the
// checkout-gate-c2/c3 batteries re-run green afterward), not repeated here where a
// mistake would corrupt the shared lane database for the tickets that follow it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PIN_MIGRATION,
  pinnedRoleCount,
  rolesMintedAfterPin,
  check,
  apply,
} from "../scripts/role-census-reset.mjs";

function fixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "role-census-fixture-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text, "utf8");
  return dir;
}

test("rcr.pin reads 0154's own literal, not a hand-kept copy", () => {
  const dir = fixtureDir({
    "0154_fake.sql": "do $$ begin\n  if (select count(*) from pg_roles where rolname like 'clara%') <> 3 then\n"
      + "    raise exception 'x';\n  end if;\nend $$;\n",
  });
  try {
    const { file, pinned } = pinnedRoleCount(dir);
    assert.equal(file, "0154_fake.sql");
    assert.equal(pinned, 3, "reads the fixture's literal (3), proving it is not hard-coded to 14");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rcr.pin throws if the pin migration is missing (never silently assumes)", () => {
  const dir = fixtureDir({ "0001_unrelated.sql": "select 1;" });
  try {
    assert.throws(() => pinnedRoleCount(dir), /migration 154 not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rcr.mint finds a role-creating migration after the pin, ignores one at or before it", () => {
  const dir = fixtureDir({
    [`${String(PIN_MIGRATION).padStart(4, "0")}_pin.sql`]: "-- no role here\n",
    "0100_before_pin.sql": "create role should_not_appear nologin;\n",
    "0200_after_pin.sql": "if not exists (select 1 from pg_roles where rolname='fake_test_role') then\n"
      + "  create role fake_test_role nologin;\nend if;\n",
  });
  try {
    const roles = rolesMintedAfterPin(dir);
    assert.deepEqual(roles, [{ name: "fake_test_role", file: "0200_after_pin.sql" }],
      "only the post-pin file's role is reported, by name and originating file");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rcr.mint against the REAL migrations directory finds exactly the four #867 roles", () => {
  const roles = rolesMintedAfterPin();
  assert.deepEqual(
    roles.map((r) => r.name),
    ["clara_stripe_webhook", "clara_stripe_webhook_login", "clara_auth_wall", "clara_auth_wall_login"],
  );
  assert.ok(roles.every((r) => /^01(60|63)_/.test(r.file)), `every role traces to 0160 or 0163: ${roles.map((r) => r.file)}`);
});

test("rcr.pin against the REAL 0154 reads the literal 14", () => {
  const { pinned } = pinnedRoleCount();
  assert.equal(pinned, 14);
});

test("rcr.check on this rig: 18 live, dropping the 4 minted roles matches 0154's pin of 14", async () => {
  const lines = [];
  const result = await check({ log: (s) => lines.push(s) });
  assert.equal(result.pinned, 14);
  assert.equal(result.minted.length, 4);
  assert.ok(result.currentCount >= 18, `expected at least the 18 roles this rig's chain mints, got ${result.currentCount}`);
  assert.equal(result.wouldReadAfterDrop, result.currentCount - 4);
  assert.equal(result.matchesPin, result.wouldReadAfterDrop === 14);
  // This rig's checkout-gate-c2/c3 batteries grant clara_stripe_webhook / clara_auth_wall
  // real table privileges in THIS database, so both base roles are BLOCKED right now --
  // that is the live, honest state, not a fixture. Their *_login halves carry no direct
  // ACL grant (membership only), so they read as drop-safe.
  const byName = Object.fromEntries(result.minted.map((r) => [r.name, r]));
  assert.equal(byName.clara_stripe_webhook.exists, true);
  assert.ok(byName.clara_stripe_webhook.deps.length > 0, "clara_stripe_webhook is granted real table privileges on this rig");
  assert.equal(byName.clara_auth_wall.exists, true);
  assert.ok(byName.clara_auth_wall.deps.length > 0, "clara_auth_wall is granted real table privileges on this rig");
  assert.equal(result.safeToApply, false, "a live checkout-gate rig is never safe to apply against directly");
  assert.ok(lines.some((l) => l.includes("does NOT match") === false && l.includes("MATCHES")), "check logs the arithmetic verdict");
});

test("rcr.apply REFUSES outright while blocked -- proven, not assumed, and mutates nothing", async () => {
  const before = await check({ log: () => {} });
  assert.equal(before.safeToApply, false, "precondition: this rig is blocked (see rcr.check)");
  await assert.rejects(
    () => apply({ log: () => {} }),
    /REFUSED: clara_(stripe_webhook|auth_wall) is still depended on by/,
  );
  const after = await check({ log: () => {} });
  assert.equal(after.currentCount, before.currentCount, "a refused apply changes nothing");
  assert.deepEqual(after.minted.map((r) => r.exists), before.minted.map((r) => r.exists));
});
