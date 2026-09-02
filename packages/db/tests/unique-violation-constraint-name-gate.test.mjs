// Pins the pre-integration decision table independently of the two behavioural cells. Every
// catalog mutation is transaction-local and rolled back to its savepoint; no weakened writer
// body can escape a cell.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { endPool } from "./rig-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import * as gate from "./unique-violation-constraint-name-gate.mjs";

const {
  KNOWN_NEW_PROSRC_SHA,
  KNOWN_OLD_PROSRC_SHA,
  PROPOSE_VENDOR_IDENTITY_BINDING_SIG,
  UNIQUE_VIOLATION_CONSTRAINT_NAME_MIGRATION,
  readUniqueViolationConstraintNameGate,
} = gate;

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const BEHAVIOURAL_FILE = join(TEST_DIR, "unique-violation-constraint-name.test.mjs");
const REPORTER_FILE = join(TEST_DIR, "unique-violation-constraint-name-reporter.mjs");
const DEFAULT_MIGRATION_FILE = join(
  TEST_DIR,
  "..",
  "migrations",
  "UNNUMBERED_unique_violation_constraint_name.sql",
);
const UNKNOWN_OLD_SHA = "0".repeat(64);
const PRESTATE_COMPARISON =
  /^(\s*if encode\(sha256\(convert_to\(v_src,'UTF8'\)\),'hex'\) <> ')[0-9a-f]{64}(' then\s*)$/gm;

const OLD_DECLARATION = "  v_blocker text; v_suppressed text;";
const NEW_DECLARATION = "  v_blocker text; v_suppressed text; v_con text;";
const OLD_HANDLER = [
  "  exception when unique_violation then",
  "    raise exception 'binding_conflict' using errcode='CLR36';",
  "  end;",
].join("\n");
const NEW_HANDLER = [
  "  exception when unique_violation then",
  "    -- PROGRESS 3b: read WHICH constraint fired and map only the ROSTERED ones to the",
  "    -- estate's typed refusal -- the 0028 idiom every OTHER handler was meant to follow.",
  "    -- Both rostered indexes protect the SAME invariant this door has always meant to",
  "    -- enforce (no second proposed/live binding for the same client+counterparty), so both",
  "    -- map to the SAME existing 'binding_conflict' rather than a new vocabulary member.",
  "    -- ANY OTHER unique_violation on this table (an id/PK collision, or a future index this",
  "    -- roster does not yet know about) is re-raised UNCHANGED -- the safe default for an",
  "    -- unrostered collision is to surface it honestly, not swallow it under a name that",
  "    -- does not describe it.",
  "    get stacked diagnostics v_con = constraint_name;",
  "    if v_con = 'uq_vib_one_active_binding' or v_con = 'uq_vib_one_live' then",
  "      raise exception 'binding_conflict' using errcode='CLR36';",
  "    else",
  "      raise;",
  "    end if;",
  "  end;",
].join("\n");

after(async () => { await endPool(); });

function replaceExactlyOnce(text, needle, replacement, label) {
  assert.equal(text.split(needle).length - 1, 1, `${label}: expected exactly one source match`);
  return text.replace(needle, replacement);
}

function migrationFixture(source, { comparisonSha = KNOWN_OLD_PROSRC_SHA } = {}) {
  const matches = [...source.matchAll(PRESTATE_COMPARISON)];
  assert.equal(matches.length, 1, "fixture source has exactly one anchored prestate SHA comparison");
  const rewritten = source.replace(PRESTATE_COMPARISON, `$1${comparisonSha}$2`);
  const withDecoy = `${rewritten}\n-- fixture-only decoy post-image sha ${KNOWN_NEW_PROSRC_SHA}\n`;
  const directory = mkdtempSync(join(tmpdir(), "clara-uvc-migrations-"));
  const file = join(directory, "0199_unique_violation_constraint_name.sql");
  writeFileSync(file, withDecoy, "utf8");
  return { directory, file, source: withDecoy, cleanup: () => rmSync(directory, { recursive: true }) };
}

async function withEnv(overrides, fn) {
  const prior = new Map();
  for (const [name, value] of Object.entries(overrides)) {
    prior.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function behaviouralOutcomes({ preload, migrationsDir }) {
  return withEnv({
    CLARA_ALLOW_MISSING_UNIQUE_VIOLATION_CONSTRAINT_NAME: preload,
    CLARA_MIGRATIONS_DIR: migrationsDir,
  }, async () => {
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    const result = await new Promise((resolveRun, rejectRun) => {
      const child = spawn(
        process.execPath,
        [REPORTER_FILE, BEHAVIOURAL_FILE],
        { cwd: process.cwd(), env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", rejectRun);
      child.on("close", (code) => resolveRun({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, `reporter child exits cleanly: ${result.stderr}`);
    return result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  });
}

async function readFunctionIdentity(c) {
  const r = await c.query(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha,
            p.proowner::regrole::text as owner,
            coalesce(array_to_string(array(
              select a.grantee::regrole::text || '=' || a.privilege_type
                from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
               order by 1), ','), '(none)') as acl
       from pg_proc p
      where p.oid = to_regprocedure($1)`,
    [PROPOSE_VENDOR_IDENTITY_BINDING_SIG],
  );
  return r.rows[0] ?? null;
}

async function assertRestored(c, baseline, label) {
  assert.deepEqual(
    await readFunctionIdentity(c),
    baseline,
    `${label}: rollback restores the baseline prosrc SHA, owner, and ACL`,
  );
}

async function readGate(c, preload = "1") {
  return readUniqueViolationConstraintNameGate((sql, params) => c.query(sql, params), preload);
}

async function plantKnownBody(c, targetSha, baseline) {
  const current = await readGate(c);
  if (current.prosrcSha === targetSha) return;
  assert.ok(
    current.prosrcSha === KNOWN_OLD_PROSRC_SHA || current.prosrcSha === KNOWN_NEW_PROSRC_SHA,
    `fixture precondition: expected a known old/new body, got ${current.prosrcSha}`,
  );
  let definition = (await c.query(
    "select pg_get_functiondef($1::regprocedure) as def",
    [PROPOSE_VENDOR_IDENTITY_BINDING_SIG],
  )).rows[0].def;
  if (targetSha === KNOWN_OLD_PROSRC_SHA) {
    definition = replaceExactlyOnce(definition, NEW_DECLARATION, OLD_DECLARATION, "new-to-old declaration");
    definition = replaceExactlyOnce(definition, NEW_HANDLER, OLD_HANDLER, "new-to-old handler");
  } else {
    assert.equal(targetSha, KNOWN_NEW_PROSRC_SHA, "fixture target is one of the two pinned bodies");
    definition = replaceExactlyOnce(definition, OLD_DECLARATION, NEW_DECLARATION, "old-to-new declaration");
    definition = replaceExactlyOnce(definition, OLD_HANDLER, NEW_HANDLER, "old-to-new handler");
  }
  await c.query(definition);
  const planted = await readFunctionIdentity(c);
  assert.equal(planted.prosrc_sha, targetSha, "planted body has the migration-pinned identity");
  assert.equal(planted.owner, baseline.owner, "planting preserves the function owner");
  assert.equal(planted.acl, baseline.acl, "planting preserves the function ACL");
}

async function plantUnknownNonMarkerBody(c) {
  await c.query(`
    create or replace function clara.propose_vendor_identity_binding(
      p_proposal jsonb,
      p_op_key text
    ) returns jsonb
    language plpgsql security definer
    set search_path to clara,pg_temp
    as $unknown_gate_body$
    begin
      return jsonb_build_object('unknown_gate_stub', true);
    end
    $unknown_gate_body$`);
}

async function legacySubstringLedgerWouldSkip(c, preload = "1") {
  const r = await c.query(
    `select exists (select 1 from clara.schema_migrations where version ~ '^0028_') as has_0028,
            position('constraint_name' in p.prosrc) <> 0 as has_marker
       from pg_proc p
      where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure`,
  );
  return preload === "1" && (!r.rows[0].has_0028 || !r.rows[0].has_marker);
}

test("uvc.gate.sha-source renamed migration extracts only the anchored prestate comparison", async () => {
  assert.equal(
    typeof gate.readKnownOldProsrcSha,
    "function",
    "the gate exposes its migration-backed pre-image extractor",
  );
  const source = readFileSync(DEFAULT_MIGRATION_FILE, "utf8");
  const fixture = migrationFixture(source);
  try {
    assert.equal(
      fixture.file.endsWith("0199_unique_violation_constraint_name.sql"),
      true,
      "the fixture proves numbering does not matter",
    );
    assert.equal(
      fixture.source.split(KNOWN_OLD_PROSRC_SHA).length - 1,
      2,
      "the comparison SHA is duplicated in the error message",
    );
    assert.ok(
      fixture.source.includes(KNOWN_NEW_PROSRC_SHA),
      "the whole file contains a distinct decoy post-image SHA",
    );
    assert.equal(
      new Set(fixture.source.match(/[0-9a-f]{64}/g)).size,
      2,
      "RED-before control: a whole-file hex scan sees two distinct values",
    );
    await withEnv({ CLARA_MIGRATIONS_DIR: fixture.directory }, async () => {
      assert.equal(
        gate.readKnownOldProsrcSha(),
        KNOWN_OLD_PROSRC_SHA,
        "only the anchored comparison inside the prestate block is authoritative",
      );
    });
  } finally {
    fixture.cleanup();
  }
});

test("uvc.gate.a preload + NEW body + no 0028 ledger row executes both behavioural cells", async () => {
  await withTxn(async (c) => {
    const baseline = await readFunctionIdentity(c);
    assert.ok(baseline, "fixture baseline function exists");
    await c.query("savepoint uvc_gate_a");
    await plantKnownBody(c, KNOWN_NEW_PROSRC_SHA, baseline);
    const removed = await c.query("delete from clara.schema_migrations where version ~ '^0028_' returning version");
    assert.equal(removed.rowCount, 1, "fixture removes exactly the 0028 ledger row inside the savepoint");
    const decision = await readGate(c);
    assert.equal(decision.has28, false, "informational ledger read sees the deliberate absence");
    assert.equal(decision.action, "execute", "ledger absence cannot authorize a skip");
    assert.equal(await legacySubstringLedgerWouldSkip(c), true, "RED-before control: the retired ledger predicate skips this state");
    await c.query("rollback to savepoint uvc_gate_a");
    await assertRestored(c, baseline, "uvc.gate.a");
  }, { commit: false });
});

test("uvc.gate.reporter-old-preload yields two named skips", async () => {
  const outcomes = await behaviouralOutcomes({ preload: "1", migrationsDir: undefined });
  assert.equal(outcomes.length, 2, `the behavioural file reports exactly its two cells: ${JSON.stringify(outcomes)}`);
  for (const outcome of outcomes) {
    assert.equal(outcome.eventType, "test:pass", `${outcome.name}: a skip is a passing reporter event`);
    assert.equal(typeof outcome.skip, "string", `${outcome.name}: reporter carries a named skip`);
    assert.ok(
      outcome.skip.includes("_unique_violation_constraint_name.sql"),
      `${outcome.name}: skip names the migration that owns the pre-image`,
    );
  }
});

test("uvc.gate.reporter-old-unset yields two hookFailed outcomes", async () => {
  const outcomes = await behaviouralOutcomes({ preload: undefined, migrationsDir: undefined });
  assert.equal(outcomes.length, 2, "the behavioural file reports exactly its two cells");
  for (const outcome of outcomes) {
    assert.equal(outcome.eventType, "test:fail", `${outcome.name}: focused old-body run fails`);
    assert.equal(
      outcome.failureType,
      "hookFailed",
      `${outcome.name}: the reporter identifies the before-hook refusal`,
    );
  }
});

test("uvc.gate.b exact OLD body is the only preload skip decision", async () => {
  await withTxn(async (c) => {
    const baseline = await readFunctionIdentity(c);
    assert.ok(baseline, "fixture baseline function exists");
    await c.query("savepoint uvc_gate_b");
    await plantKnownBody(c, KNOWN_OLD_PROSRC_SHA, baseline);
    const decision = await readGate(c);
    assert.equal(decision.action, "skip", "only the positive old-body identity authorizes skipping");
    assert.ok(
      decision.reason.includes(UNIQUE_VIOLATION_CONSTRAINT_NAME_MIGRATION),
      "the skip reason names the migration that owns the pre-image",
    );
    await c.query("rollback to savepoint uvc_gate_b");
    await assertRestored(c, baseline, "uvc.gate.b");
  }, { commit: false });
});

test("uvc.gate.reporter-unknown executes then yields two named testCodeFailure outcomes", async () => {
  const source = readFileSync(DEFAULT_MIGRATION_FILE, "utf8");
  const fixture = migrationFixture(source, { comparisonSha: UNKNOWN_OLD_SHA });
  try {
    const outcomes = await behaviouralOutcomes({ preload: "1", migrationsDir: fixture.directory });
    assert.equal(outcomes.length, 2, "the behavioural file reports exactly its two cells");
    for (const outcome of outcomes) {
      assert.equal(outcome.eventType, "test:fail", `${outcome.name}: unknown body executes, never skips`);
      assert.equal(
        outcome.failureType,
        "testCodeFailure",
        `${outcome.name}: the reporter identifies an in-test diagnostic`,
      );
      assert.match(
        outcome.errorMessage,
        /^the vendor-binding body is at an unrecognised sha \([0-9a-f]{64}\); re-derive this battery's pins$/,
        `${outcome.name}: failure carries the named unknown-body diagnostic`,
      );
    }
  } finally {
    fixture.cleanup();
  }
});

test("uvc.gate.c preload + unknown non-marker body executes with zero skips", async () => {
  await withTxn(async (c) => {
    const baseline = await readFunctionIdentity(c);
    assert.ok(baseline, "fixture baseline function exists");
    await c.query("savepoint uvc_gate_c");
    await plantUnknownNonMarkerBody(c);
    const decision = await readGate(c);
    assert.notEqual(decision.prosrcSha, KNOWN_OLD_PROSRC_SHA, "stub identity is not the known old body");
    assert.notEqual(decision.prosrcSha, KNOWN_NEW_PROSRC_SHA, "stub identity is not the known new body");
    assert.equal(decision.action, "execute", "an unknown body never becomes vacuous through substring absence");
    assert.equal(await legacySubstringLedgerWouldSkip(c), true, "RED-before control: the retired substring predicate skips this state");
    await c.query("rollback to savepoint uvc_gate_c");
    await assertRestored(c, baseline, "uvc.gate.c");
  }, { commit: false });
});

test("uvc.gate.absent-signature-executes", async () => {
  await withTxn(async (c) => {
    const baseline = await readFunctionIdentity(c);
    assert.ok(baseline, "fixture baseline function exists");
    await c.query("savepoint uvc_gate_absent");
    await c.query(`drop function ${PROPOSE_VENDOR_IDENTITY_BINDING_SIG}`);
    assert.equal(await readFunctionIdentity(c), null, "the exact signature is absent inside the savepoint");
    const decision = await readGate(c);
    assert.equal(decision.prosrcSha, null, "absence is reported as a null SHA, never a catalog throw");
    assert.equal(decision.action, "execute", "an absent signature falls through to behavioural execution");
    await c.query("rollback to savepoint uvc_gate_absent");
    await assertRestored(c, baseline, "uvc.gate.absent-signature-executes");
  }, { commit: false });
});
