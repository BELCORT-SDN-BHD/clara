// Three cells pin the gate's complete public contract: the migration is the single pre-image
// home; all four catalog identities are explicit and transactionally restored; and observable
// Node reporter outcomes distinguish hook failure from behavioural failure/execution.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, endPool } from "./rig-fixtures.mjs";
import {
  WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA,
  WAKE_OPEN_FIRM_QUESTION_SIGNATURE,
  classifyWakeOpenFirmQuestionKindWall,
  readWakeOpenFirmQuestionKindWallState,
  resolveWakeOpenFirmQuestionKindWallMigration,
} from "./wake-open-firm-question-kind-wall-gate-state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, "..");
const migration = resolveWakeOpenFirmQuestionKindWallMigration();
const recutStart = migration.migrationText.indexOf(
  "create or replace function clara.wake_open_firm_question(\n",
);
const recutEndMarker = "end $fn$;";
const recutEnd = migration.migrationText.indexOf(recutEndMarker, recutStart);
assert.ok(recutStart >= 0 && recutEnd > recutStart, "pin fixture: find the shipped recut");
const newBodyDdl = migration.migrationText.slice(
  recutStart,
  recutEnd + recutEndMarker.length,
);

const spliceStartMarker = "  -- PROGRESS.md Known-issues 3a / this migration";
const spliceEndMarker = "  v_dedupe := clara._reserve_op";
const spliceStart = newBodyDdl.indexOf(spliceStartMarker);
const spliceEnd = newBodyDdl.indexOf(spliceEndMarker, spliceStart);
assert.ok(spliceStart >= 0 && spliceEnd > spliceStart, "pin fixture: find the kind-wall splice");
const oldBodyDdl = newBodyDdl.slice(0, spliceStart) + newBodyDdl.slice(spliceEnd);

const spellingMutantDdl = `create or replace function clara.wake_open_firm_question(
    p_document uuid, p_kind text, p_question text, p_candidates jsonb, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  -- Marker-spelling mutant: both reviewed tokens exist, but these bytes are neither image.
  return jsonb_build_object('reason', 'door_owned_kind', 'kind', 'onboarding_proposed');
end $fn$;`;

after(async () => { await endPool(); });

function anchoredComparison(sha) {
  return `if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> '${sha}' then`;
}

function resolveFixture(files, text, migrationsDir = "fixture-migrations") {
  let listedDir = null;
  let readPath = null;
  const state = resolveWakeOpenFirmQuestionKindWallMigration({
    migrationsDir,
    listFiles: (dir) => {
      listedDir = dir;
      return files;
    },
    readFile: (path) => {
      readPath = path;
      return text;
    },
  });
  return { ...state, listedDir, readPath };
}

async function functionIdentity(client) {
  const r = await client.query(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as body_sha,
            pg_get_userbyid(p.proowner) as owner,
            p.proacl::text as acl
       from pg_proc p
      where p.oid = to_regprocedure($1)`,
    [WAKE_OPEN_FIRM_QUESTION_SIGNATURE],
  );
  return r.rows[0] ?? null;
}

async function stateWithMutation(mutate, reader = classifyWakeOpenFirmQuestionKindWall) {
  const client = await getPool().connect();
  let baseline;
  let planted;
  let state;
  try {
    baseline = await functionIdentity(client);
    assert.ok(baseline, "plant fixture: exact baseline signature exists");
    await client.query("begin");
    await mutate(client);
    planted = await functionIdentity(client);
    state = await reader((sql, params) => client.query(sql, params));
  } finally {
    await client.query("rollback").catch(() => {});
    await client.query("reset role").catch(() => {});
    await client.query("reset all").catch(() => {});
    const restored = await functionIdentity(client);
    assert.deepEqual(
      restored,
      baseline,
      "rollback restores the exact baseline prosrc sha, owner and ACL",
    );
    client.release();
  }
  return { baseline, planted, state };
}

async function runTestFile(file, { namePattern, env: additions = {} } = {}) {
  const env = { ...process.env, ...additions };
  delete env.NODE_TEST_CONTEXT;
  delete env.CLARA_ALLOW_MISSING_WAKE_OPEN_FIRM_QUESTION_KIND_WALL;
  const args = ["--test", "--test-concurrency=1"];
  if (namePattern) args.push(`--test-name-pattern=${namePattern}`);
  args.push(file);
  const child = spawn(process.execPath, args, {
    cwd: packageDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const [code] = await once(child, "close");
  return { code, output };
}

function tapCount(output, key) {
  const match = output.match(new RegExp(`^# ${key} (\\d+)\\r?$`, "mu"));
  assert.ok(match, `reporter emitted a ${key} summary`);
  return Number(match[1]);
}

function failureTypeCount(output, type) {
  return (output.match(new RegExp(`failureType: '${type}'`, "gu")) ?? []).length;
}

test("kind-wall gate sha-source: UNNUMBERED and numbered names resolve; zero/multiple files and zero/multiple DISTINCT anchored values refuse", () => {
  const preimage = "1".repeat(64);
  const decoy = "2".repeat(64);
  const other = "3".repeat(64);
  const fixtureText = [
    `-- decoy whole-file sha ${decoy}`,
    anchoredComparison(preimage),
    `raise exception 'expected ${decoy}, post ${WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA}';`,
  ].join("\n");

  for (const file of [
    "UNNUMBERED_wake_open_firm_question_kind_wall.sql",
    "0156_wake_open_firm_question_kind_wall.sql",
  ]) {
    const state = resolveFixture([file], fixtureText);
    assert.equal(state.migrationFile, file, `${file}: rename-safe exact filename resolves`);
    assert.equal(state.preimageSha, preimage, `${file}: only the anchored comparison is authoritative`);
    assert.equal(basename(state.readPath), file, `${file}: the resolved file, not a fixed path, is read`);
  }

  const priorDir = process.env.CLARA_MIGRATIONS_DIR;
  process.env.CLARA_MIGRATIONS_DIR = "env-selected-migrations";
  try {
    let listedDir = null;
    const envState = resolveWakeOpenFirmQuestionKindWallMigration({
      listFiles: (dir) => {
        listedDir = dir;
        return ["0156_wake_open_firm_question_kind_wall.sql"];
      },
      readFile: () => fixtureText,
    });
    assert.equal(listedDir, "env-selected-migrations", "CLARA_MIGRATIONS_DIR selects the source directory");
    assert.equal(envState.preimageSha, preimage);
  } finally {
    if (priorDir === undefined) delete process.env.CLARA_MIGRATIONS_DIR;
    else process.env.CLARA_MIGRATIONS_DIR = priorDir;
  }

  assert.throws(() => resolveFixture([], fixtureText), /exactly one .* file.*found 0/su);
  assert.throws(
    () => resolveFixture([
      "UNNUMBERED_wake_open_firm_question_kind_wall.sql",
      "0156_wake_open_firm_question_kind_wall.sql",
    ], fixtureText),
    /exactly one .* file.*found 2/su,
  );
  assert.throws(
    () => resolveFixture(["UNNUMBERED_wake_open_firm_question_kind_wall.sql"], `-- ${decoy}`),
    /exactly one DISTINCT pre-image sha.*found 0/su,
  );
  assert.throws(
    () => resolveFixture(
      ["UNNUMBERED_wake_open_firm_question_kind_wall.sql"],
      `${anchoredComparison(preimage)}\n${anchoredComparison(other)}`,
    ),
    /exactly one DISTINCT pre-image sha.*found 2/su,
  );
  assert.equal(
    resolveFixture(
      ["UNNUMBERED_wake_open_firm_question_kind_wall.sql"],
      `${anchoredComparison(preimage)}\n${anchoredComparison(preimage)}`,
    ).preimageSha,
    preimage,
    "duplicate occurrences of the same anchored value still have exactly one DISTINCT authority",
  );
  assert.throws(
    () => resolveFixture(
      ["UNNUMBERED_wake_open_firm_question_kind_wall.sql"],
      anchoredComparison(WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA),
    ),
    /pre-image and post-image are both/,
  );
});

test("kind-wall gate catalog arms: preimage | postimage | unknown | absent are explicit and every plant rollback restores sha + owner + ACL", async () => {
  const post = await stateWithMutation(
    (client) => client.query(newBodyDdl),
    (query) => readWakeOpenFirmQuestionKindWallState(query, "1"),
  );
  assert.equal(post.planted.body_sha, WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA, "post-image plant verified");
  assert.equal(post.planted.owner, post.baseline.owner, "post-image plant preserves owner");
  assert.equal(post.planted.acl, post.baseline.acl, "post-image plant preserves ACL");
  assert.equal(post.state.classification, "postimage");
  assert.equal(post.state.action, "execute");

  const pre = await stateWithMutation(
    (client) => client.query(oldBodyDdl),
    (query) => readWakeOpenFirmQuestionKindWallState(query, "1"),
  );
  assert.equal(pre.planted.body_sha, migration.preimageSha, "pre-image plant verified from migration-derived sha");
  assert.equal(pre.planted.owner, pre.baseline.owner, "pre-image plant preserves owner");
  assert.equal(pre.planted.acl, pre.baseline.acl, "pre-image plant preserves ACL");
  assert.equal(pre.state.classification, "preimage");
  assert.equal(pre.state.action, "skip");
  assert.match(pre.state.skipReason, new RegExp(migration.migrationFile.replace(".", "\\.")));

  const unknown = await stateWithMutation(
    (client) => client.query(spellingMutantDdl),
    (query) => readWakeOpenFirmQuestionKindWallState(query, "1"),
  );
  assert.notEqual(unknown.planted.body_sha, migration.preimageSha);
  assert.notEqual(unknown.planted.body_sha, WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA);
  assert.equal(unknown.planted.owner, unknown.baseline.owner, "spelling mutant preserves owner");
  assert.equal(unknown.planted.acl, unknown.baseline.acl, "spelling mutant preserves ACL");
  assert.equal(unknown.state.classification, "unknown");
  assert.equal(unknown.state.action, "execute", "marker spelling cannot authorize a skip");
  assert.equal(
    unknown.state.diagnostic,
    `the wake_open_firm_question body is at an unrecognised sha (${unknown.planted.body_sha}); re-derive this battery's pins`,
  );

  const absent = await stateWithMutation(
    (client) => client.query(`drop function ${WAKE_OPEN_FIRM_QUESTION_SIGNATURE}`),
    (query) => readWakeOpenFirmQuestionKindWallState(query, "1"),
  );
  assert.equal(absent.planted, null, "exact-signature absence was planted and positively read");
  assert.equal(absent.state.bodySha, null);
  assert.equal(absent.state.classification, "absent");
  assert.equal(absent.state.action, "execute", "absence is behavioural execution, never a gate hook failure");
});

test("kind-wall runner outcomes: old focused wall hook-fails; absence/spelling execute as test failures; focused MBB runs both trued cells", async () => {
  const client = await getPool().connect();
  let current;
  try {
    current = await classifyWakeOpenFirmQuestionKindWall((sql, params) => client.query(sql, params));
  } finally {
    client.release();
  }
  assert.ok(
    current.classification === "preimage" || current.classification === "postimage",
    `runner pin requires a known control body, got ${current.classification}`,
  );

  const wall = await runTestFile("tests/wake-open-firm-question-kind-wall.test.mjs");
  if (current.classification === "preimage") {
    assert.equal(wall.code, 1, "focused exact-preimage wall run fails");
    assert.equal(tapCount(wall.output, "fail"), 17);
    assert.equal(failureTypeCount(wall.output, "hookFailed"), 17, "all 17 wall cells report hookFailed");
    assert.equal(failureTypeCount(wall.output, "testCodeFailure"), 0);
  } else {
    assert.equal(wall.code, 0, wall.output);
    assert.equal(tapCount(wall.output, "pass"), 17);
    assert.equal(tapCount(wall.output, "fail"), 0);
    assert.equal(failureTypeCount(wall.output, "hookFailed"), 0);
  }

  for (const scenario of ["absent", "spelling"]) {
    const outcome = await runTestFile(
      "tests/wake-open-firm-question-kind-wall-reporter-probe.mjs",
      { env: { CLARA_KIND_WALL_REPORTER_SCENARIO: scenario } },
    );
    assert.equal(outcome.code, 1, `${scenario}: behavioural probe fails after gate execution`);
    assert.equal(tapCount(outcome.output, "fail"), 1, `${scenario}: one behavioural failure is reported`);
    assert.equal(failureTypeCount(outcome.output, "hookFailed"), 0, `${scenario}: no gate-level hook failure`);
    assert.equal(failureTypeCount(outcome.output, "testCodeFailure"), 1, `${scenario}: reporter names testCodeFailure`);
    if (scenario === "spelling") {
      assert.match(
        outcome.output,
        /the wake_open_firm_question body is at an unrecognised sha \([0-9a-f]{64}\); re-derive this battery's pins/,
      );
    }
  }

  const mbb = await runTestFile(
    "tests/promotion-dup-open-wall.test.mjs",
    { namePattern: "TRUED" },
  );
  assert.equal(mbb.code, 0, mbb.output);
  assert.equal(tapCount(mbb.output, "pass"), 2, "both rewritten MBB cells execute and pass");
  assert.equal(tapCount(mbb.output, "fail"), 0);
  assert.equal(failureTypeCount(mbb.output, "hookFailed"), 0, "MBB never inherits the wall battery policy");
});
