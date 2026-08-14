import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connConfig, makeClient } from "../lib/pg.mjs";
import { attachMigrationNoticeListener, MIGRATION_CONNECT_TIMEOUT_MS, migrate } from "../scripts/migrate.mjs";
import {
  executeMigrationBody,
  MIGRATION_SESSION_BASELINE,
  migrationServerVersionNum,
  pinMigrationSession,
  TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM,
} from "../scripts/migration-atomicity.mjs";

// Matched EXACTLY, never as a substring: the wrapper body also mentions
// server_version_num, and a loose match would swallow the CREATE FUNCTION.
const SERVER_VERSION_SQL =
  "select pg_catalog.current_setting('server_version_num'::pg_catalog.text) as server_version_num";
const PG17 = "170000";
const PG16 = "160004";
// Stands in for the nonce pinMigrationSession stamps; mocks echo it back as session state.
const PIN_NONCE = "11111111-2222-3333-4444-555555555555";

test("migration NOTICE listener forwards the exact log line", () => {
  const listeners = new Map();
  const logs = [];
  attachMigrationNoticeListener({ on(event, listener) { listeners.set(event, listener); } }, (line) => logs.push(line));
  listeners.get("notice")({ severity: "NOTICE", message: "runner-notice-proof" });
  assert.deepEqual(logs, ["  [notice] runner-notice-proof"]);
});

test("migration connection timeout reaches node-postgres clients", () => {
  const config = connConfig({ connectionTimeoutMillis: MIGRATION_CONNECT_TIMEOUT_MS });
  assert.equal(config.connectionTimeoutMillis, 5_000);

  const client = makeClient({ connectionTimeoutMillis: MIGRATION_CONNECT_TIMEOUT_MS });
  assert.equal(client.connectionParameters.connect_timeout, 5);
});

test("post-lock bounded control failure releases the lock for a subsequent runner", async () => {
  assert.equal(MIGRATION_CONNECT_TIMEOUT_MS, 5_000);
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-client-order-"));
  const events = [];
  const configs = [];
  const lockSql = [];
  let lockHeld = false;
  const lockClient = (run) => ({
    on() {},
    async connect() { events.push(`${run}:lock-connect`); },
    async query(sql) {
      lockSql.push(sql);
      if (sql.includes("pg_advisory_lock")) {
        assert.equal(lockHeld, false, `runner ${run} acquired a lock the failed runner stranded`);
        lockHeld = true;
        events.push(`${run}:lock-acquired`);
      } else if (sql.includes("pg_advisory_unlock")) {
        assert.equal(lockHeld, true);
        lockHeld = false;
        events.push(`${run}:lock-released`);
      }
      return { rows: [] };
    },
    async end() { events.push(`${run}:lock-end`); },
  });
  const failingControl = {
    on() {},
    async connect() { events.push("first:control-connect"); throw new Error("connection timeout"); },
    async end() { events.push("first:control-end"); },
  };
  const secondControl = {
    on() {},
    async connect() { events.push("second:control-connect"); throw new Error("second stop"); },
    async end() { events.push("second:control-end"); },
  };
  try {
    await assert.rejects(migrate({ dir, log() {}, clientFactory(config = {}) {
      configs.push(config);
      return configs.length === 1 ? lockClient("first") : failingControl;
    } }), /connection timeout/);
    await assert.rejects(migrate({ dir, log() {}, clientFactory(config = {}) {
      configs.push(config);
      return configs.length === 3 ? lockClient("second") : secondControl;
    } }), /second stop/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // BOTH clients now bound the CONNECT. The lock client used to be built bare, which
  // left an unreachable server able to hang the runner before it ever took the lock.
  assert.deepEqual(configs, [
    { connectionTimeoutMillis: MIGRATION_CONNECT_TIMEOUT_MS }, { connectionTimeoutMillis: MIGRATION_CONNECT_TIMEOUT_MS },
    { connectionTimeoutMillis: MIGRATION_CONNECT_TIMEOUT_MS }, { connectionTimeoutMillis: MIGRATION_CONNECT_TIMEOUT_MS },
  ]);
  // ...and the advisory-lock WAIT stays unbounded: measured on what the runner actually
  // sent this client, not on the source text. Only the lock and unlock, no timeout arming.
  assert.deepEqual(
    [...new Set(lockSql.map((sql) => sql.replace(/\s+/gu, " ").trim()))],
    [
      "select pg_catalog.pg_advisory_lock($1, $2)",
      "select pg_catalog.pg_advisory_unlock($1, $2)",
    ],
  );
  assert.equal(lockHeld, false);
  assert.ok(events.indexOf("first:lock-acquired") < events.indexOf("first:control-connect"));
  assert.ok(events.indexOf("first:control-connect") < events.indexOf("first:lock-released"));
  assert.ok(events.indexOf("first:lock-released") < events.indexOf("first:lock-end"));
  assert.ok(events.indexOf("first:lock-end") < events.indexOf("second:lock-acquired"));
  assert.ok(events.indexOf("second:lock-acquired") < events.indexOf("second:lock-released"));
});

/** A client that answers the session-pin conversation, at a chosen server version. */
function baselineClient({ serverVersion = PG17, calls = [], settings } = {}) {
  const state = settings ?? { ...MIGRATION_SESSION_BASELINE };
  return {
    state,
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql === SERVER_VERSION_SQL) return { rows: [{ server_version_num: serverVersion }] };
      if (sql === "discard all") return { rows: [] };
      if (sql.includes("pg_current_xact_id")) {
        return { rows: [{ xid: "1", session_user: "runner", current_user: "runner" }] };
      }
      if (sql.includes("current_setting(s.name)")) {
        return { rows: parameters[0].map((name) => ({ name, value: state[name] })) };
      }
      if (sql.includes("set_config($1")) {
        state[parameters[0]] = parameters[1];
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

test("client_min_messages is part of every migration baseline pin", async () => {
  assert.equal(MIGRATION_SESSION_BASELINE.client_min_messages, "notice");
  const calls = [];
  await pinMigrationSession(baselineClient({ calls }));
  assert.deepEqual(calls.find(({ parameters }) => parameters[0] === "client_min_messages")?.parameters,
    ["client_min_messages", "notice"]);
});

test("transaction_timeout is pinned off on PostgreSQL 17 and skipped below it", async () => {
  assert.equal(MIGRATION_SESSION_BASELINE.transaction_timeout, "0");
  assert.equal(TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM, 170000);

  const modern = [];
  const modernClient = baselineClient({ calls: modern, serverVersion: PG17 });
  modernClient.state.transaction_timeout = "9s"; // a poisoned database default
  await pinMigrationSession(modernClient);
  assert.deepEqual(
    modern.find(({ parameters }) => parameters[0] === "transaction_timeout")?.parameters,
    ["transaction_timeout", "0"],
  );
  assert.equal(modernClient.state.transaction_timeout, "0");

  // Below 17 the parameter does not exist: pinning it would fail the run outright, so
  // it is skipped — and the READ of the session state must skip it too, or the
  // verification query itself raises `unrecognized configuration parameter`.
  const legacy = [];
  const legacyClient = baselineClient({ calls: legacy, serverVersion: PG16 });
  delete legacyClient.state.transaction_timeout;
  await pinMigrationSession(legacyClient);
  assert.equal(legacy.some(({ parameters }) => parameters[0] === "transaction_timeout"), false);
  assert.equal(
    legacy.some(({ sql, parameters }) =>
      sql.includes("current_setting(s.name)") && parameters[0].includes("transaction_timeout")),
    false,
    "an older server must never be asked to read a parameter it does not have",
  );
  // Every setting that DOES exist on 16 is still pinned.
  // Counted by NAME, not by statement shape: the session-pin nonce is set the same way
  // and is not a baseline parameter.
  assert.equal(legacy.filter(({ sql, parameters }) =>
    sql.includes("set_config($1") && parameters[0] in MIGRATION_SESSION_BASELINE).length,
    Object.keys(MIGRATION_SESSION_BASELINE).length - 1);
});

/**
 * A managed-cluster login: every baseline SET works EXCEPT the superuser-only one, which
 * is denied with 42501 exactly as a non-superuser owner is denied on Supabase.
 */
function managedLoginClient({ observedRole = "origin", denyCode = "42501", denyName = "session_replication_role" } = {}) {
  const state = { ...MIGRATION_SESSION_BASELINE, session_replication_role: observedRole };
  const attempts = [];
  const client = {
    attempts,
    async query(sql, parameters = []) {
      if (sql === SERVER_VERSION_SQL) return { rows: [{ server_version_num: PG17 }] };
      if (sql === "discard all") return { rows: [] };
      if (sql.includes("pg_current_xact_id")) {
        return { rows: [{ xid: "1", session_user: "managed", current_user: "managed" }] };
      }
      if (sql.includes("current_setting(s.name)")) {
        return { rows: parameters[0].map((name) => ({ name, value: state[name] })) };
      }
      if (sql.includes("current_setting($1")) return { rows: [{ value: state[parameters[0]] }] };
      if (sql.includes("set_config($1")) {
        attempts.push(parameters[0]);
        if (parameters[0] === denyName) {
          throw Object.assign(new Error(`permission denied to set parameter "${parameters[0]}"`), { code: denyCode });
        }
        state[parameters[0]] = parameters[1];
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  return client;
}

test("a superuser-only pin that is denied is VERIFIED instead, and reported", async () => {
  // The live-ceremony shape: Supabase's owner login is not a superuser, so the SET of
  // session_replication_role is refused. The pin's intent — never RUN under a non-origin
  // replication role — survives by reading, which needs no privilege.
  const client = managedLoginClient({ observedRole: "origin" });
  const state = await pinMigrationSession(client);
  assert.deepEqual(state.verifiedNotSet, ["session_replication_role"]);
  assert.equal(state.settings.session_replication_role, "origin");
});

test("a denied superuser-only pin REFUSES when the session is not already correct", async () => {
  const client = managedLoginClient({ observedRole: "replica" });
  await assert.rejects(
    () => pinMigrationSession(client),
    /cannot set session_replication_role .* reports "replica" rather than "origin" — refusing to migrate/u,
  );
});

test("a denied superuser-only pin is never re-attempted on the same connection", async () => {
  // Load-bearing, not an optimisation: measured on 17.10 a 42501 inside an OPEN
  // TRANSACTION aborts it (25P02), and the post-body re-apply runs inside the runner's
  // transaction. Re-attempting there would destroy the migration it was protecting.
  const client = managedLoginClient({ observedRole: "origin" });
  await pinMigrationSession(client);
  const afterFirst = client.attempts.filter((name) => name === "session_replication_role").length;
  await pinMigrationSession(client);
  const afterSecond = client.attempts.filter((name) => name === "session_replication_role").length;
  assert.equal(afterFirst, 1, "the first pin attempts it once");
  assert.equal(afterSecond, 1, "and the second pin does not attempt it at all");
});

test("the guarded pin is narrow: another parameter, or another SQLSTATE, still refuses", async () => {
  await assert.rejects(
    () => pinMigrationSession(managedLoginClient({ denyName: "lock_timeout" })),
    /permission denied to set parameter "lock_timeout"/u,
    "a USERSET parameter being denied is a genuine fault, not a managed-cluster shape",
  );
  await assert.rejects(
    () => pinMigrationSession(managedLoginClient({ denyCode: "53300" })),
    /permission denied to set parameter "session_replication_role"/u,
    "only 42501 takes the verify path",
  );
});

test("an unreadable server version fails closed rather than assuming an old server", async () => {
  await assert.rejects(
    () => migrationServerVersionNum({ async query() { return { rows: [{}] }; } }),
    /could not read server_version_num/,
  );
});

test("post-body reset and timeout rearm restore client_min_messages deterministically", async () => {
  const state = { ...MIGRATION_SESSION_BASELINE, client_min_messages: "warning" };
  let wrapperCreated = false;
  const calls = [];
  const client = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql === SERVER_VERSION_SQL) return { rows: [{ server_version_num: PG17 }] };
      if (sql.includes("create function pg_temp.__clara_execute_migration")) {
        wrapperCreated = true;
        return { rows: [] };
      }
      if (sql.includes("pg_current_xact_id")) {
        return { rows: [{ xid: "7", session_user: "runner", current_user: "runner", session_nonce: PIN_NONCE }] };
      }
      if (sql.includes("current_setting(s.name)")) {
        return { rows: parameters[0].map((name) => ({ name, value: state[name] })) };
      }
      if (sql.includes("from pg_catalog.pg_proc") && sql.includes("definition")) {
        return { rowCount: 1, rows: [{ oid: "11", owner: "10", acl: "", definition: "wrapper" }] };
      }
      if (sql.includes("set_config('statement_timeout'")) {
        // set_config ANSWERS with the value as PostgreSQL displays it.
        state.statement_timeout = parameters[0];
        return { rows: [{ applied: parameters[0] }] };
      }
      if (sql.trimStart().startsWith("select pg_temp.__clara_execute_migration(")) {
        state.client_min_messages = "warning";
        state.statement_timeout = "0";
        return { rows: [{ xid: "7" }] };
      }
      if (sql.includes("set_config($1")) {
        state[parameters[0]] = parameters[1];
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  state.client_min_messages = "notice";
  const { rearm } = await executeMigrationBody(client, "set client_min_messages=warning", "2s", PIN_NONCE);
  assert.equal(wrapperCreated, true);
  assert.equal(state.client_min_messages, "notice");
  assert.equal(state.statement_timeout, "2s");
  await rearm();
  assert.equal(state.statement_timeout, "2s");
  assert.ok(calls.some(({ parameters }) => parameters[0] === "client_min_messages" && parameters[1] === "notice"));
});

test("the server-side wrapper re-pins transaction_timeout under a version guard", async () => {
  // The wrapper's RESET ALL hands the rest of the runner-owned transaction back to the
  // database default, and on 17 a non-zero default arms a fresh window from that
  // instant. Measured on the SQL the runner actually sends, in order.
  const state = { ...MIGRATION_SESSION_BASELINE };
  let wrapperBody = "";
  const client = {
    async query(sql, parameters = []) {
      if (sql === SERVER_VERSION_SQL) return { rows: [{ server_version_num: PG17 }] };
      if (sql.includes("create function pg_temp.__clara_execute_migration")) {
        wrapperBody = sql;
        return { rows: [] };
      }
      if (sql.includes("pg_current_xact_id")) {
        return { rows: [{ xid: "3", session_user: "runner", current_user: "runner", session_nonce: PIN_NONCE }] };
      }
      if (sql.includes("current_setting(s.name)")) {
        return { rows: parameters[0].map((name) => ({ name, value: state[name] })) };
      }
      if (sql.includes("from pg_catalog.pg_proc") && sql.includes("definition")) {
        return { rowCount: 1, rows: [{ oid: "12", owner: "10", acl: "", definition: "wrapper" }] };
      }
      if (sql.includes("set_config('statement_timeout'")) return { rows: [{ applied: parameters[0] }] };
      if (sql.trimStart().startsWith("select pg_temp.__clara_execute_migration(")) return { rows: [{ xid: "3" }] };
      if (sql.includes("set_config($1")) { state[parameters[0]] = parameters[1]; return { rows: [] }; }
      return { rows: [] };
    },
  };
  await executeMigrationBody(client, "select 1", null, PIN_NONCE);

  const resetIndex = wrapperBody.indexOf("reset all;");
  const guardIndex = wrapperBody.indexOf("current_setting('server_version_num'::pg_catalog.text)::pg_catalog.int4");
  const pinIndex = wrapperBody.indexOf("set_config('transaction_timeout'::pg_catalog.text,'0'::pg_catalog.text,false)");
  const dateStyleIndex = wrapperBody.indexOf("set_config('DateStyle'");
  assert.ok(resetIndex > 0 && guardIndex > resetIndex, "the guard follows RESET ALL");
  assert.ok(pinIndex > guardIndex, "the pin sits inside the version guard");
  assert.ok(pinIndex < dateStyleIndex, "the transaction-scoped GUC is restored before the cosmetic ones");
  assert.match(wrapperBody, /OPERATOR\(pg_catalog\.>=\) 170000 then/u);
});

/** Drives executeMigrationBody with set_config's answer and current_setting's answer
 *  controlled INDEPENDENTLY — the only way to tell a real comparison from a vacuous one. */
function timeoutClient({ armedAnswer, observed }) {
  const state = { ...MIGRATION_SESSION_BASELINE };
  return {
    async query(sql, parameters = []) {
      if (sql === SERVER_VERSION_SQL) return { rows: [{ server_version_num: PG17 }] };
      if (sql.includes("create function pg_temp.__clara_execute_migration")) return { rows: [] };
      if (sql.includes("pg_current_xact_id")) {
        return { rows: [{ xid: "5", session_user: "runner", current_user: "runner", session_nonce: PIN_NONCE }] };
      }
      if (sql.includes("set_config('statement_timeout'")) {
        state.statement_timeout = observed;      // what the server will REPORT
        return { rows: [{ applied: armedAnswer }] }; // what set_config ANSWERS
      }
      if (sql.includes("current_setting(s.name)")) {
        return { rows: parameters[0].map((name) => ({ name, value: state[name] })) };
      }
      if (sql.includes("from pg_catalog.pg_proc") && sql.includes("definition")) {
        return { rowCount: 1, rows: [{ oid: "9", owner: "10", acl: "", definition: "wrapper" }] };
      }
      if (sql.trimStart().startsWith("select pg_temp.__clara_execute_migration(")) return { rows: [{ xid: "5" }] };
      if (sql.includes("set_config($1")) { state[parameters[0]] = parameters[1]; return { rows: [] }; }
      return { rows: [] };
    },
  };
}

test("the session-pin nonce is stamped last, after DISCARD ALL and the whole baseline", async () => {
  // Stamped LAST on purpose: holding it means the entire pin ran. A half-finished pin
  // cannot produce one.
  const calls = [];
  const client = baselineClient({ calls });
  const { nonce } = await pinMigrationSession(client);
  assert.match(nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
  const order = calls.map(({ sql, parameters }) =>
    sql === "discard all" ? "discard" : parameters[0] === "clara.migration_session_nonce" ? "nonce" : null).filter(Boolean);
  assert.deepEqual(order, ["discard", "nonce"]);
  const nonceIndex = calls.findIndex(({ parameters }) => parameters[0] === "clara.migration_session_nonce");
  const lastBaseline = calls.map(({ parameters }) => parameters[0])
    .lastIndexOf("lock_timeout");
  assert.ok(nonceIndex > lastBaseline, "the nonce follows every baseline parameter");

  // Two pins on the same client produce DIFFERENT nonces — otherwise a stale session
  // could impersonate a freshly pinned one.
  const second = await pinMigrationSession(client);
  assert.notEqual(second.nonce, nonce);
});

test("a body refuses to run on a session whose nonce does not match, or has none", async () => {
  const nonceClient = (sessionNonce) => ({
    async query(sql, parameters = []) {
      if (sql === SERVER_VERSION_SQL) return { rows: [{ server_version_num: PG17 }] };
      if (sql.includes("pg_current_xact_id")) {
        return { rows: [{ xid: "2", session_user: "r", current_user: "r", session_nonce: sessionNonce }] };
      }
      if (sql.includes("current_setting(s.name)")) {
        return { rows: parameters[0].map((name) => ({ name, value: MIGRATION_SESSION_BASELINE[name] })) };
      }
      if (sql.includes("set_config('statement_timeout'")) return { rows: [{ applied: parameters[0] }] };
      return { rows: [] };
    },
  });

  await assert.rejects(
    () => executeMigrationBody(nonceClient("a-different-nonce"), "select 1", null, "the-expected-nonce"),
    /session-pin nonce mismatch: the session reports "a-different-nonce"/u,
  );
  // A session that was never pinned carries no nonce at all.
  await assert.rejects(
    () => executeMigrationBody(nonceClient(null), "select 1", null, "the-expected-nonce"),
    /session-pin nonce mismatch: the session reports null/u,
  );
  // And a runner holding no expectation must not proceed either — absence is not evidence.
  await assert.rejects(
    () => executeMigrationBody(nonceClient("whatever"), "select 1", null, undefined),
    /holds no session-pin nonce for this migration/u,
  );
});

test("a non-canonical timeout spelling is compared as the server displays it", async () => {
  // The file says '1200s'; PostgreSQL answers and reports '20min'. Comparing the raw
  // literal aborted AFTER the body had run, on a spelling PG itself accepts.
  await executeMigrationBody(timeoutClient({ armedAnswer: "20min", observed: "20min" }), "select 1", "1200s", PIN_NONCE);
});

test("a genuinely different timeout still fails the baseline assertion", async () => {
  // Same path, one value changed: the normalization must not have become "accept anything".
  await assert.rejects(
    () => executeMigrationBody(timeoutClient({ armedAnswer: "20min", observed: "5min" }), "select 1", "1200s", PIN_NONCE),
    /baseline mismatch for statement_timeout: expected 20min, saw 5min/,
  );
});

test("a connect failure is named and cleaned up like any other migration failure", async () => {
  // connect() used to sit outside the try: its failure skipped both the version-wrapped
  // error and the bounded end(). Note the session cleanup must NOT run here — measured on
  // pg 8.20.0, query() on a never-connected client never settles.
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-connect-fail-"));
  writeFileSync(join(dir, "0001_never_runs.sql"), "select 1;", "utf8");
  const seen = [];
  const lockClient = {
    on() {}, async connect() {}, async query() { return { rows: [] }; }, async end() { seen.push("lock-end"); },
  };
  const controlClient = {
    on() {}, async connect() {},
    async query(sql) {
      if (sql.includes("current_setting(s.name)")) {
        return { rows: Object.entries(MIGRATION_SESSION_BASELINE).map(([name, value]) => ({ name, value })) };
      }
      if (sql === "select pg_catalog.current_setting('server_version_num'::pg_catalog.text) as server_version_num") {
        return { rows: [{ server_version_num: PG17 }] };
      }
      if (sql.includes("pg_current_xact_id")) return { rows: [{ xid: "1", session_user: "r", current_user: "r" }] };
      if (sql.includes("select version,checksum")) return { rows: [] };
      return { rows: [] };
    },
    async end() { seen.push("control-end"); },
  };
  const refusing = {
    on() {},
    async connect() { throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }); },
    async query() { return new Promise(() => {}); }, // would HANG if the cleanup ran it
    async end() { seen.push("execution-end"); },
  };
  let built = 0;
  try {
    await assert.rejects(
      migrate({ dir, log() {}, cleanupTimeoutMs: 200, clientFactory() {
        built += 1;
        return built === 1 ? lockClient : built === 2 ? controlClient : refusing;
      } }),
      (error) => {
        assert.match(error.message, /^migration 0001_never_runs failed before its session was established: connection refused$/u);
        assert.equal(error.code, "ECONNREFUSED");
        assert.equal(error.cleanup.rollbackError, undefined, "no rollback is attempted without a session");
        assert.equal(error.cleanup.repinError, undefined, "and no repin either");
        // The bounded end() still ran and was recorded — that is the whole point of
        // moving connect() inside the try.
        assert.deepEqual(error.cleanup.outcomes.map(({ label, status }) => `${label}:${status}`),
          ["execution client end (0001_never_runs):ok"]);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(seen.includes("execution-end"), "the bounded end() must still run for the client that never connected");
});
