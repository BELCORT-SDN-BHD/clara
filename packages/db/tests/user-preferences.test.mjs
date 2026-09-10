// #626 (refresh spec #612, journey D1) — clara.user_preferences,
// clara.get_my_preferences(), clara.save_my_preferences() (0179_user_preferences.sql).
//
// FRONTIER-GATED, not unnumbered-skipped: 0179 is a plain numbered migration and the
// ordinary runner already applies it (proven locally — `pnpm --filter @clara/db migrate`
// applies 0176, 0177, then 0179 straight through a missing 0178, with no contiguity
// requirement). This file still checks the live catalog before running, the same
// `ensureReady()`-style belt every other cohort here wears (x57-mint-and-registry.test.mjs,
// rig-helpers.mjs's own `ensureReady`): a chain frozen before 0179 lands must SKIP these
// cells, never fail them.
//
// Five required cells, each named for the acceptance line it proves:
//   1. own-row only            — RLS on the TABLE itself, not merely the function's filter.
//   2. patch preserves unrelated keys — the shallow-merge contract.
//   3. stale version refused   — CLR06 on a mismatched p_expected_version.
//   4. invalid value refused   — CLR10, typed detail.reason, for every unsupported shape.
//   5. replay by op key        — the SAME (op_key, args) call returns the identical receipt
//      without incrementing version twice; a REUSED op_key with DIFFERENT args is CLR10
//      (`_reserve_op`'s own behaviour, 0004:46-60).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery,
  humanQuery,
  namedCall,
  opk,
  roleQuery,
  assertRaises,
  CLR,
  insertUser,
  createFirm,
  seedAdmission,
  endPool,
} from "./rig-fixtures.mjs";

async function preferencesSurfacePresent() {
  const r = await rootQuery(
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = 'get_my_preferences' limit 1`,
  );
  return r.rowCount > 0;
}

let ready = false;

/** Mint a fresh human with an ACTIVE firm membership (save_my_preferences requires one via
 *  `_human_ctx`; get_my_preferences does not, but every cell here exercises both doors). */
async function freshMember(tag) {
  const sub = await insertUser("uprefs", tag);
  const token = await seedAdmission(`uprefs ${tag} admission`);
  await createFirm(sub, { name: `uprefs-${tag}-firm`, token, opKey: opk("firm") });
  return sub;
}

async function getMine(sub) {
  const r = await humanQuery(sub, "select clara.get_my_preferences() as prefs", []);
  return r.rows[0].prefs;
}

async function saveMine(sub, { expectedVersion, patch, key }) {
  const r = await humanQuery(
    sub,
    namedCall("save_my_preferences", [
      { name: "p_expected_version", cast: "int" },
      { name: "p_patch", cast: "jsonb" },
      { name: "p_op_key" },
    ]),
    [expectedVersion, JSON.stringify(patch), key ?? opk("save")],
  );
  return r.rows[0].result;
}

before(async () => {
  ready = await preferencesSurfacePresent();
});

after(async () => {
  await endPool();
});

test("get_my_preferences: a caller with no saved row sees honest synthetic defaults (version 0, empty objects)", async (t) => {
  if (!ready) { t.skip("clara.get_my_preferences is absent — 0179 not applied on this frontier"); return; }
  const alice = await freshMember("alice-defaults");
  const prefs = await getMine(alice);
  assert.equal(prefs.version, 0);
  assert.deepEqual(prefs.interface, {});
  assert.deepEqual(prefs.notifications, {});
  assert.equal(prefs.updated_at, null);
});

test("own-row only: a second caller's save is invisible to the first, both through the door and through a direct table read", async (t) => {
  if (!ready) { t.skip("clara.get_my_preferences is absent — 0179 not applied on this frontier"); return; }
  const alice = await freshMember("alice-ownrow");
  const bob = await freshMember("bob-ownrow");

  await saveMine(alice, { expectedVersion: 0, patch: { interface: { motion: "reduced" } } });
  await saveMine(bob, { expectedVersion: 0, patch: { interface: { motion: "system", sidebarDefault: "collapsed" } } });

  const aliceView = await getMine(alice);
  const bobView = await getMine(bob);
  assert.deepEqual(aliceView.interface, { motion: "reduced" });
  assert.deepEqual(bobView.interface, { motion: "system", sidebarDefault: "collapsed" });

  // THE TABLE'S OWN RLS, not merely the function's filter (p_user_preferences_self,
  // 0179:88-90) — each caller's direct SELECT sees exactly its own row, never the other's.
  const aliceRows = await humanQuery(alice, "select user_id from clara.user_preferences", []);
  assert.equal(aliceRows.rowCount, 1);
  assert.equal(aliceRows.rows[0].user_id, alice);

  const bobRows = await humanQuery(bob, "select user_id from clara.user_preferences", []);
  assert.equal(bobRows.rowCount, 1);
  assert.equal(bobRows.rows[0].user_id, bob);
});

test("patch preserves unrelated keys: saving motion alone does not clear a previously-saved sidebarDefault", async (t) => {
  if (!ready) { t.skip("clara.get_my_preferences is absent — 0179 not applied on this frontier"); return; }
  const carol = await freshMember("carol-patch");

  const first = await saveMine(carol, {
    expectedVersion: 0,
    patch: { interface: { motion: "reduced", sidebarDefault: "collapsed" } },
  });
  assert.equal(first.version, 1);
  assert.deepEqual(first.interface, { motion: "reduced", sidebarDefault: "collapsed" });

  const second = await saveMine(carol, {
    expectedVersion: 1,
    patch: { interface: { motion: "system" } },
  });
  assert.equal(second.version, 2);
  // sidebarDefault SURVIVES a patch that only names motion.
  assert.deepEqual(second.interface, { motion: "system", sidebarDefault: "collapsed" });

  const read = await getMine(carol);
  assert.deepEqual(read.interface, { motion: "system", sidebarDefault: "collapsed" });
});

test("stale version refused: a save against a version that has already moved raises CLR06 with the current version", async (t) => {
  if (!ready) { t.skip("clara.get_my_preferences is absent — 0179 not applied on this frontier"); return; }
  const dave = await freshMember("dave-stale");

  await saveMine(dave, { expectedVersion: 0, patch: { interface: { motion: "reduced" } } });
  // dave's version is now 1 — saving again against the STALE expected 0 must refuse.
  const err = await assertRaises(
    CLR.revision, // CLR06 — "revision token" in rig-helpers.mjs's CLR map
    () => saveMine(dave, { expectedVersion: 0, patch: { interface: { motion: "system" } } }),
    "stale-version save",
  );
  const detail = JSON.parse(err.detail ?? "{}");
  assert.equal(detail.reason, "stale_version");
  assert.equal(detail.current_version, 1);

  // The refused save must not have applied — a fresh read still shows the FIRST save's value.
  const read = await getMine(dave);
  assert.equal(read.version, 1);
  assert.deepEqual(read.interface, { motion: "reduced" });
});

test("invalid value refused: an out-of-enum value, an unsupported interface key and any notifications key are each CLR10 with a field-path reason", async (t) => {
  if (!ready) { t.skip("clara.get_my_preferences is absent — 0179 not applied on this frontier"); return; }
  const erin = await freshMember("erin-invalid");

  // `detail.reason` IS the field path (not a generic token + a separate `key`)
  // — lib/wire.ts's shared refusal parser on the web side surfaces ONLY
  // `reason`, so the path has to live there for account-settings.tsx to focus
  // the exact control a refusal named.
  const badMotion = await assertRaises(
    CLR.badRequest, // CLR10
    () => saveMine(erin, { expectedVersion: 0, patch: { interface: { motion: "nonsense" } } }),
    "invalid motion value",
  );
  assert.equal(JSON.parse(badMotion.detail ?? "{}").reason, "interface.motion");

  const badKey = await assertRaises(
    CLR.badRequest,
    () => saveMine(erin, { expectedVersion: 0, patch: { interface: { postingApprovalRequired: true } } }),
    "unsupported interface key",
  );
  assert.equal(JSON.parse(badKey.detail ?? "{}").reason, "interface.postingApprovalRequired");

  const badNotifications = await assertRaises(
    CLR.badRequest,
    () => saveMine(erin, { expectedVersion: 0, patch: { notifications: { emailDigest: true } } }),
    "any notifications key (none is supported yet)",
  );
  assert.equal(JSON.parse(badNotifications.detail ?? "{}").reason, "notifications.emailDigest");

  // None of the three refused attempts moved the row at all.
  const read = await getMine(erin);
  assert.equal(read.version, 0);
  assert.deepEqual(read.interface, {});
});

test("replay by op key: the identical call is idempotent, and reusing the key with different args refuses CLR10", async (t) => {
  if (!ready) { t.skip("clara.get_my_preferences is absent — 0179 not applied on this frontier"); return; }
  const frank = await freshMember("frank-replay");
  const key = opk("frank-save");

  const first = await saveMine(frank, {
    expectedVersion: 0,
    patch: { interface: { motion: "reduced" } },
    key,
  });
  assert.equal(first.version, 1);

  // SAME op_key, SAME args — replays the stored receipt; version does NOT move to 2.
  const replay = await saveMine(frank, {
    expectedVersion: 0,
    patch: { interface: { motion: "reduced" } },
    key,
  });
  assert.deepEqual(replay, first);

  const read = await getMine(frank);
  assert.equal(read.version, 1);

  // SAME op_key, DIFFERENT args — `_reserve_op`'s own mismatch wall (0004:56-58).
  await assertRaises(
    CLR.badRequest,
    () => saveMine(frank, { expectedVersion: 1, patch: { interface: { motion: "system" } }, key }),
    "op_key reused with different args",
  );
});

test("no authenticated actor is CLR04 on both doors", async (t) => {
  if (!ready) { t.skip("clara.get_my_preferences is absent — 0179 not applied on this frontier"); return; }
  await assertRaises(
    CLR.authz, // CLR04
    () => roleQuery("clara_authenticated", "select clara.get_my_preferences()", []),
    "get_my_preferences with no jwt sub",
  );
  await assertRaises(
    CLR.authz,
    () =>
      roleQuery(
        "clara_authenticated",
        namedCall("save_my_preferences", [
          { name: "p_expected_version", cast: "int" },
          { name: "p_patch", cast: "jsonb" },
          { name: "p_op_key" },
        ]),
        [0, JSON.stringify({}), opk("noauth")],
      ),
    "save_my_preferences with no jwt sub",
  );
});
