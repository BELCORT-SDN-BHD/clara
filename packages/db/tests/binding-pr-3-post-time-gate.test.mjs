// Decision-table and instrumentation pins for the PR-3 pre-integration gate.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { endPool, rootQuery } from "./rig-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import {
  BINDING_PR3_ALLOW_MISSING,
  BINDING_PR3_APPROVE_SIG,
  BINDING_PR3_GATE_QUERY,
  bindingPr3MigrationsDir,
  readBindingPr3Gate,
  readBindingPr3Migration,
  readBindingPr3PostPin,
  readBindingPr3PrePin,
} from "./binding-pr-3-post-time-gate.mjs";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const RUNNER = resolve(TESTS_DIR, "..", "test-instruments", "binding-pr-3-post-time-gate-runner.mjs");
const execFileAsync = promisify(execFile);

after(async () => { await endPool(); });

async function probe(sha, preload) {
  const childEnv = { ...process.env };
  // The parent test runner marks descendants with this internal context. A clean instrument
  // process must not inherit it or node:test correctly treats run() as recursive and runs zero.
  delete childEnv.NODE_TEST_CONTEXT;
  const { stdout } = await execFileAsync(
    process.execPath,
    [RUNNER, sha, preload ?? "<unset>"],
    { encoding: "utf8", maxBuffer: 1024 * 1024, env: childEnv },
  );
  return JSON.parse(stdout);
}

test("bpr3.gate.a exact PRE-image + preload produces 15 counted named skips", async () => {
  const events = await probe(readBindingPr3PrePin(), "1");
  assert.equal(events.length, 15);
  assert.equal(events.filter((event) => event.type === "test:pass" && event.skip).length, 15);
  for (const event of events) {
    assert.match(String(event.skip), /binding_pr_3_post_time_recheck\.sql$/);
  }
});

test("bpr3.gate.b exact PRE-image + focused env-unset produces 15 hookFailed cells", async () => {
  const events = await probe(readBindingPr3PrePin(), undefined);
  assert.equal(events.length, 15);
  assert.deepEqual(events.map((event) => event.failureType),
    Array(15).fill("hookFailed"));
});

test("bpr3.gate.c POST-image and an unknown body execute with testCodeFailure, never skip", async () => {
  for (const sha of [readBindingPr3PostPin(), "0".repeat(64)]) {
    const events = await probe(sha, "1");
    assert.equal(events.length, 15);
    assert.equal(events.filter((event) => event.skip).length, 0);
    assert.deepEqual(events.map((event) => event.failureType),
      Array(15).fill("testCodeFailure"));
  }
});

test("bpr3.gate.d catalog identity uses to_regprocedure; unknown CREATE OR REPLACE body executes and restores", async () => {
  assert.match(BINDING_PR3_GATE_QUERY, /to_regprocedure\(\$1\)/,
    "an absent exact signature returns no row; a throwing regprocedure cast is forbidden");
  const beforeSha = (await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') s from pg_proc p where p.oid=to_regprocedure($1)",
    [BINDING_PR3_APPROVE_SIG])).rows[0].s;
  await withTxn(async (c) => {
    await c.query(`
      create or replace function clara._approve_entry_core(
        p_ctx jsonb, p_entry uuid, p_expected_revision uuid, p_attestation text, p_op_key text
      ) returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $gate_stub$
      begin
        return jsonb_build_object('unknown_gate_stub', true);
      end
      $gate_stub$`);
    const decision = await readBindingPr3Gate((sql, params) => c.query(sql, params), "1");
    assert.equal(decision.action, "execute", "an unknown body never authorizes a skip");
  }, { commit: false });
  const restoredSha = (await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') s from pg_proc p where p.oid=to_regprocedure($1)",
    [BINDING_PR3_APPROVE_SIG])).rows[0].s;
  assert.equal(restoredSha, beforeSha, "rollback restored the exact body identity");
});

test("bpr3.gate.e CLARA_MIGRATIONS_DIR wins; a divergent unapplied copy cannot authorize a skip", async () => {
  const originalEnv = process.env.CLARA_MIGRATIONS_DIR;
  const migration = readBindingPr3Migration();
  const prePin = readBindingPr3PrePin();
  const dir = join(TESTS_DIR, `.binding-pr3-gate-${process.pid}`);
  mkdirSync(dir);
  writeFileSync(join(dir, migration.basename), migration.source.replace(prePin, "0".repeat(64)), "utf8");
  try {
    process.env.CLARA_MIGRATIONS_DIR = dir;
    assert.equal(bindingPr3MigrationsDir(), dir);
    const decision = await readBindingPr3Gate(async () => ({ rows: [{ prosrc_sha: prePin }] }), "1");
    assert.equal(decision.action, "execute",
      "a pin read from a divergent file that was never applied must not silently skip");
  } finally {
    if (originalEnv === undefined) delete process.env.CLARA_MIGRATIONS_DIR;
    else process.env.CLARA_MIGRATIONS_DIR = originalEnv;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bpr3.gate.f default migration resolution is the package migrations directory", () => {
  assert.equal(bindingPr3MigrationsDir({}), resolve(TESTS_DIR, "..", "migrations"));
  assert.equal(BINDING_PR3_ALLOW_MISSING, "CLARA_ALLOW_MISSING_BINDING_PR3_POST_TIME");
});
