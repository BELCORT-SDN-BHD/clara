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
  sharedDependents,
  check,
  apply,
} from "../scripts/role-census-reset.mjs";
import { makeClient } from "../lib/pg.mjs";

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

// #871 [0309] widened this census from four roles to SIX. `rolesMintedAfterPin()` needed no edit --
// it derives its roster from the migration files themselves -- but this cell pins the DERIVED
// answer, so a role minted without its roles-bootstrap/CHAIN_MINTED_ROLES twin still lands here
// rather than only in the #867 recipe's runtime behaviour.
test("rcr.mint against the REAL migrations directory finds exactly the six post-pin roles (#867's four, plus #871's pair)", () => {
  const roles = rolesMintedAfterPin();
  assert.deepEqual(
    roles.map((r) => r.name),
    [
      "clara_stripe_webhook", "clara_stripe_webhook_login", "clara_auth_wall", "clara_auth_wall_login",
      "clara_invite_preview", "clara_invite_preview_login",
    ],
  );
  // THE STEM, NEVER THE NUMBER. A number is claimed at merge: keying on `^0309_` would make this
  // cell a landmine the integrator has to remember the moment #871's file is renumbered, which is
  // the anti-pattern tests/invite-preview-public-preintegration-gate.mjs states in as many words
  // (adversarial ADV-L05-07, 2026-09-24). The two older files ARE merged and immutable, so their
  // numbers are part of their identity; #871's is not yet.
  assert.ok(
    roles.every((r) => /^01(60|63)_|_invite_preview_public_door\.sql$/.test(r.file)),
    `every role traces to 0160, 0163 or the invite-preview door: ${roles.map((r) => r.file)}`,
  );
});

test("rcr.pin against the REAL 0154 reads the literal 14", () => {
  const { pinned } = pinnedRoleCount();
  assert.equal(pinned, 14);
});

test("rcr.check on this rig: 20 live, dropping the 6 minted roles matches 0154's pin of 14", async () => {
  const lines = [];
  const result = await check({ log: (s) => lines.push(s) });
  assert.equal(result.pinned, 14);
  assert.equal(result.minted.length, 6);
  assert.ok(result.currentCount >= 20, `expected at least the 20 roles this rig's chain mints, got ${result.currentCount}`);
  assert.equal(result.wouldReadAfterDrop, result.currentCount - 6);
  // L04-S14: assert the value directly (14), not `wouldReadAfterDrop === 14` restated
  // as `matchesPin`'s own definition -- that comparison can never fail, because
  // matchesPin IS `wouldReadAfterDrop === pinned` and pinned was already asserted
  // to be 14 two lines above. The two direct assertions below are the real pin.
  assert.equal(result.wouldReadAfterDrop, 14);
  assert.equal(result.matchesPin, true);
  // This rig's checkout-gate-c2/c3 batteries grant clara_stripe_webhook / clara_auth_wall
  // real table privileges in THIS database, so both base roles are BLOCKED right now --
  // that is the live, honest state, not a fixture. Their *_login halves carry no direct
  // ACL grant (membership only), so they read as drop-safe.
  const byName = Object.fromEntries(result.minted.map((r) => [r.name, r]));
  assert.equal(byName.clara_stripe_webhook.exists, true);
  assert.ok(byName.clara_stripe_webhook.deps.length > 0, "clara_stripe_webhook is granted real table privileges on this rig");
  assert.equal(byName.clara_auth_wall.exists, true);
  assert.ok(byName.clara_auth_wall.deps.length > 0, "clara_auth_wall is granted real table privileges on this rig");
  // #871 [0309]: the invite-preview group holds ONE function EXECUTE grant and no table grant, so
  // its shared dependency is an ACL entry on a routine rather than on a relation -- still a real
  // dependent, still BLOCKED, which is the honest live state of this rig.
  assert.equal(byName.clara_invite_preview.exists, true);
  assert.ok(byName.clara_invite_preview.deps.length > 0, "clara_invite_preview holds the EXECUTE grant on its own door");
  assert.equal(result.safeToApply, false, "a live checkout-gate rig is never safe to apply against directly");
  assert.ok(lines.some((l) => l.includes("does NOT match") === false && l.includes("MATCHES")), "check logs the arithmetic verdict");
});

test("rcr.check never subtracts a non-clara-matching \"minted\" role from the clara% count (L04-S14)", async () => {
  const dir = fixtureDir({
    "0154_fake.sql": "do $$ begin\n  if (select count(*) from pg_roles where rolname like 'clara%') <> 0 then\n"
      + "    raise exception 'x';\n  end if;\nend $$;\n",
    // A migration that (hypothetically, never actually run -- this is static text
    // rolesMintedAfterPin parses) mints a role sharing a name with a real, pre-existing
    // cluster role that does NOT match `clara%`. rolesMintedAfterPin's regex has no
    // opinion on role names, so it reports this one same as any other; check()'s
    // subtraction must not, because clusterClaraRoleCount() never counted it in the
    // first place.
    "0200_decoy.sql": "create role postgres nologin;\n",
  });
  try {
    const result = await check({ log: () => {}, migrationsDir: dir });
    assert.deepEqual(result.minted.map((r) => r.name), ["postgres"], "the decoy is still reported (for visibility)");
    assert.equal(result.minted[0].exists, true, "postgres is a real, pre-existing cluster role");
    assert.equal(
      result.wouldReadAfterDrop,
      result.currentCount,
      "a non-clara-matching \"minted\" role must not be subtracted from the clara% count",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("rcr.sharedDependents sees a SHARED-object dependency (dbid = 0), not only a per-database one (L04B-SPEC-05)", async () => {
  // pg_shdepend's `dbid` column reads 0 when the DEPENDENT object is itself a shared,
  // cluster-wide catalog object (a database or a tablespace) rather than something that
  // lives inside one particular database. GRANT ... ON DATABASE is the plainest way to
  // produce exactly that shape on a live cluster: the database itself is the dependent
  // object, so the row it creates carries dbid = 0. sharedDependents()'s old INNER JOIN
  // to pg_database required d.oid = sd.dbid to match a REAL row in pg_database, which
  // dbid = 0 never does (no database has oid 0) -- so that join silently drops the row.
  const client = makeClient();
  await client.connect();
  const roleName = "x867b_shared_probe";
  try {
    await client.query(`drop role if exists ${roleName}`);
    await client.query(`create role ${roleName}`);
    await client.query(`grant connect on database ${process.env.PGDATABASE} to ${roleName}`);
    // Confirm the shape actually landed as dbid = 0 before trusting sharedDependents()'s
    // answer about it -- an independent source of truth, not a re-derivation of the
    // function under test.
    const raw = await client.query(
      "select sd.dbid from pg_shdepend sd join pg_authid a on a.oid = sd.refobjid where a.rolname = $1",
      [roleName],
    );
    assert.deepEqual(raw.rows, [{ dbid: 0 }],
      `precondition: GRANT ... ON DATABASE must produce exactly one dbid=0 pg_shdepend row, got ${JSON.stringify(raw.rows)}`);

    const deps = await sharedDependents(client, roleName);
    assert.ok(deps.length > 0,
      `sharedDependents() must see the dbid=0 dependency it would otherwise silently drop, got ${JSON.stringify(deps)}`);
    assert.equal(deps[0].deptype, "a", "the dependency is an ACL grant (deptype 'a')");
  } finally {
    await client.query(`revoke connect on database ${process.env.PGDATABASE} from ${roleName}`).catch(() => {});
    await client.query(`drop role if exists ${roleName}`).catch(() => {});
    await client.end();
  }
});
