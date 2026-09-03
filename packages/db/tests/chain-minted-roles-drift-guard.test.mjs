// DRIFT GUARD for CHAIN_MINTED_ROLES (tests/rig-cluster-reset.mjs) — the D6 class (sweep run
// 33707608346, 2026-09-03). Migration 0163_checkout_gate_c3_folded_door.sql minted
// clara_auth_wall/_login and added them to deploy/roles-bootstrap.sql's own inventory (that
// file's "same-commit twin" convention), but CHAIN_MINTED_ROLES went unedited — the sweep
// only WARNED about the two orphans, so they survived every between-step cleanup and
// poisoned the NEXT from-scratch migrate's 0154 role census (14 -> 16) one step removed from
// the actual cause.
//
// rig-cluster-reset.mjs now derives its own roster from deploy/roles-bootstrap.sql at module
// load and throws immediately on any mismatch (see that file's header + drift-guard block) —
// this file is the SECOND, INDEPENDENT instrument: it re-derives "every role a migration
// mints" directly from packages/db/migrations/*.sql's own text, WITHOUT importing or reusing
// rig-cluster-reset.mjs's roles-bootstrap.sql parser, and proves that census matches
// CHAIN_MINTED_ROLES exactly. Two derivations of the same fact (migration text vs.
// roles-bootstrap.sql's own text, both cross-checked against the shipped roster) is what
// makes this a genuine drift guard rather than the same measurement read twice.
//
// FAST — no rig needed: every cell here is a file read plus a text scan, no database
// connection, no CLARA_RIG_ALLOW_* gate. Runs in the ordinary all-packages sweep.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHAIN_MINTED_ROLES, BOOTSTRAP_ROSTER, STORAGE_ROLE } from "./rig-cluster-reset.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(HERE, "..", "migrations");
const RIG_CLUSTER_RESET_FILE = join(HERE, "rig-cluster-reset.mjs");

/**
 * Independent, second derivation of "every role a migration mints" — scans the migration
 * corpus's own SQL text directly. Two idioms, both requiring a role NAME at the match site
 * (never a bare "create role", which 0126 mentions three times in PROSE with no name
 * attached — those must not false-positive):
 *   (a) a literal `create role clara_x nologin;` DDL line (0009, 0121 x2, 0126, 0160 x2,
 *       0163 x2 — measured, see the positive control below).
 *   (b) a `foreach r in array array['a','b',...] loop ... execute format('create role %I
 *       ...', r) ... end loop;` block, whose array literal carries the names (0002, 0006,
 *       0131) — gated on the loop body actually containing a `create role` execute-format
 *       call, so an unrelated `foreach r in array [...] loop` elsewhere could never
 *       contribute names.
 * @param {string} dir
 * @returns {Set<string>}
 */
export function scanMigrationsForRoleNames(dir) {
  const found = new Set();
  const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f));
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const m of sql.matchAll(/create role (clara_[a-z0-9_]+)\b/g)) found.add(m[1]);
    for (const m of sql.matchAll(/foreach\s+r\s+in\s+array\s+array\s*\[([\s\S]*?)\]\s+loop([\s\S]*?)end loop;/g)) {
      const [, arrayBody, loopBody] = m;
      if (!/execute format\(\s*'create role %I/.test(loopBody)) continue; // not a role-minting loop
      for (const nm of arrayBody.matchAll(/'(clara_[a-z0-9_]+)'/g)) found.add(nm[1]);
    }
  }
  return found;
}

test("positive control: the migration scanner is not vacuous and finds both idioms", () => {
  const found = scanMigrationsForRoleNames(MIG_DIR);
  assert.ok(found.size >= 18, `expected at least 18 migration-minted roles, found ${found.size}: ${[...found].sort().join(", ")}`);
  assert.ok(found.has("clara_auth_wall"), "scanner must find 0163's literal-DDL role (clara_auth_wall)");
  assert.ok(found.has("clara_fn_owner"), "scanner must find 0002's loop-array role (clara_fn_owner)");
  assert.ok(!found.has("clara_storage_docs"), "no migration mints the storage role — its presence here would mean a false match");
});

test("negative control: an empty migrations directory scans to zero roles (the scanner is not vacuously true)", () => {
  const empty = mkdtempSync(join(tmpdir(), "clara-drift-guard-empty-"));
  try {
    const found = scanMigrationsForRoleNames(empty);
    assert.equal(found.size, 0, "an empty directory must scan to zero role names");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("drift guard: every migration-minted role is in CHAIN_MINTED_ROLES, and vice versa (RED-before on pre-fix main: clara_auth_wall/_login)", () => {
  const fromMigrations = scanMigrationsForRoleNames(MIG_DIR);
  const roster = new Set(CHAIN_MINTED_ROLES);
  const missingFromRoster = [...fromMigrations].filter((n) => !roster.has(n)).sort();
  const missingFromRosterSet = [...roster].filter((n) => !fromMigrations.has(n)).sort();
  assert.deepEqual(
    missingFromRoster,
    [],
    `migrations mint role(s) not in CHAIN_MINTED_ROLES: ${missingFromRoster.join(", ")} — add them to deploy/roles-bootstrap.sql and to CHAIN_MINTED_ROLES in the same commit`,
  );
  assert.deepEqual(
    missingFromRosterSet,
    [],
    `CHAIN_MINTED_ROLES lists role(s) no migration on disk mints: ${missingFromRosterSet.join(", ")} — a stale or typo'd entry`,
  );
});

test("BOOTSTRAP_ROSTER (derived from deploy/roles-bootstrap.sql) matches CHAIN_MINTED_ROLES exactly", () => {
  assert.deepEqual([...BOOTSTRAP_ROSTER].sort(), [...CHAIN_MINTED_ROLES].sort());
});

test("STORAGE_ROLE is recognised but excluded from both rosters", () => {
  assert.equal(STORAGE_ROLE, "clara_storage_docs");
  assert.ok(!CHAIN_MINTED_ROLES.includes(STORAGE_ROLE), "the storage role must never join the droppable roster");
  assert.ok(!BOOTSTRAP_ROSTER.includes(STORAGE_ROLE), "extractRoleArray must not have captured the storage role from grp/logins");
});

// MUTANT PANEL — a text mutation of a real copy of the shipped file (written into the SAME
// directory so its relative imports, `../lib/pg.mjs` and its own computed
// `../deploy/roles-bootstrap.sql` path, keep resolving to the real files). The mutant deletes
// one CHAIN_MINTED_ROLES entry; the module-load drift guard must throw IMMEDIATELY, naming the
// missing role — this is the "delete a role from the roster -> RED" arm the WO asks for.
test("mutant: deleting a role from CHAIN_MINTED_ROLES reds the module load, naming the role", async (t) => {
  const original = readFileSync(RIG_CLUSTER_RESET_FILE, "utf8");
  const needle = '  "clara_auth_wall_login",\n';
  assert.ok(original.includes(needle), "mutant setup: expected literal line not found in rig-cluster-reset.mjs — update this test's needle to match the shipped file");
  const mutated = original.split(needle).join("");
  assert.notEqual(mutated, original, "mutant setup: the replacement did not change the file text");
  assert.equal(original.length - mutated.length, needle.length, "mutant setup: expected to remove EXACTLY one occurrence of the needle");

  const mutantPath = join(HERE, `.mutant-rig-cluster-reset-${process.pid}-${Date.now()}.mjs`);
  writeFileSync(mutantPath, mutated);
  t.after(() => {
    try {
      unlinkSync(mutantPath);
    } catch {
      /* already gone */
    }
  });

  await assert.rejects(
    () => import(pathToFileURL(mutantPath).href),
    (err) => {
      assert.match(err.message, /clara_auth_wall_login/, `expected the drift-guard error to name the missing role; got: ${err.message}`);
      return true;
    },
    "deleting a roster entry must throw at module load — a silent load is the exact defect this guard exists to close",
  );
});

// MUST-NOT-RED CONTROL: a byte-identical unmutated copy, same directory, same mechanism —
// must load cleanly. Proves the mutant above reds because of the DELETED LINE, not because
// dynamic-importing a copy of this file is inherently unstable.
test("control: an unmutated byte-identical copy of rig-cluster-reset.mjs loads cleanly", async (t) => {
  const original = readFileSync(RIG_CLUSTER_RESET_FILE, "utf8");
  const controlPath = join(HERE, `.control-rig-cluster-reset-${process.pid}-${Date.now()}.mjs`);
  writeFileSync(controlPath, original);
  t.after(() => {
    try {
      unlinkSync(controlPath);
    } catch {
      /* already gone */
    }
  });
  const mod = await import(pathToFileURL(controlPath).href);
  assert.equal(mod.CHAIN_MINTED_ROLES.length, CHAIN_MINTED_ROLES.length);
});
