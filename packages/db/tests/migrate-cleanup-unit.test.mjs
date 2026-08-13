import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { migrate } from "../scripts/migrate.mjs";
import {
  CLEANUP_TIMEOUT_MS,
  hardCloseClient,
  migrationFailureAfterCleanup,
  withCleanupDeadline,
} from "../scripts/migration-cleanup.mjs";

// The runner CLEANUP battery: bounded deadlines, the hard-close fallback, and the law
// that no cleanup outcome may ever replace the error that sent us into cleanup.
// Needs no database — every client here is a stub whose failure mode is the subject.

/** A client whose chosen operations never settle, with a destroyable stub socket. */
function wedgedClient({ hang = [], onQuery } = {}) {
  const record = { destroyed: 0, errorListeners: 0, ending: undefined };
  const client = {
    connection: {
      set _ending(value) { record.ending = value; },
      get _ending() { return record.ending; },
      stream: { destroy() { record.destroyed++; } },
    },
    on(event) { if (event === "error") record.errorListeners++; },
    async query(sql) {
      if (hang.some((fragment) => sql.includes(fragment))) return new Promise(() => {});
      return onQuery ? onQuery(sql) : { rows: [] };
    },
    async end() {
      if (hang.includes("end")) return new Promise(() => {});
      return undefined;
    },
  };
  return { client, record };
}

test("a cleanup step that never settles is bounded, hard-closed, and reported as data", async () => {
  const { client, record } = wedgedClient({ hang: ["rollback"] });
  const started = Date.now();
  const outcome = await withCleanupDeadline(client, "rollback", () => client.query("rollback"), 40);
  assert.equal(outcome.status, "timeout");
  assert.equal(outcome.label, "rollback");
  assert.equal(outcome.timeoutMs, 40);
  assert.equal(outcome.hardClosed, true);
  assert.equal(record.destroyed, 1);
  // node-postgres's own connect-timeout teardown sets this first so Connection swallows
  // the ECONNRESET the destroy provokes; the absorber stops the 'error' event throwing.
  assert.equal(record.ending, true);
  assert.ok(record.errorListeners >= 1);
  assert.ok(Date.now() - started < 4_000, "the deadline bounded the wait, not CLEANUP_TIMEOUT_MS");
});

test("an abandoned cleanup promise cannot later crash the process", async () => {
  // The loser of the race still settles. If its rejection were unhandled Node would
  // terminate the run — so this cell fails by the FILE dying, not by an assertion.
  let reject;
  const client = { connection: { stream: { destroy() {} } }, on() {} };
  const outcome = await withCleanupDeadline(client, "late rejection", () =>
    new Promise((_resolve, r) => { reject = r; }), 20);
  assert.equal(outcome.status, "timeout");
  reject(new Error("this rejection arrives after the deadline"));
  await delay(50);
});

test("cleanup outcomes never mask the original migration error", async () => {
  const original = Object.assign(new Error("body failed"), { code: "57014" });
  const { client, record } = wedgedClient({ hang: ["rollback"] });
  const failure = await migrationFailureAfterCleanup(
    client,
    "0099_wedged",
    original,
    () => new Promise(() => {}), // the repin hangs too
    40,
  );

  assert.equal(failure.cause, original, "the original error stays the cause");
  assert.equal(failure.code, "57014", "and keeps its SQLSTATE");
  assert.match(failure.message, /^migration 0099_wedged failed and rollback did not complete: body failed/u);
  assert.match(failure.message, /rollback exceeded the 40ms cleanup deadline — connection hard-closed/u);
  assert.match(failure.message, /session repin exceeded the 40ms cleanup deadline/u);
  assert.deepEqual(failure.cleanup.outcomes.map(({ label, status, hardClosed }) => ({ label, status, hardClosed })), [
    { label: "rollback", status: "timeout", hardClosed: true },
    { label: "session repin", status: "timeout", hardClosed: true },
  ]);
  assert.equal(failure.cleanup.rollbackError.cleanupTimeout, true);
  assert.equal(failure.cleanup.repinError.hardClosed, true);
  assert.equal(record.destroyed, 2);
});

test("cleanup failures preserve the original migration error", async () => {
  const original = Object.assign(new Error("body failed"), { code: "57014" });
  const repin = new Error("repin failed");
  const rollback = new Error("rollback failed");
  for (const [query, pattern, rollbackError] of [
    [async () => {}, /was rolled back/, undefined],
    [async () => { throw rollback; }, /rollback did not complete/, rollback],
  ]) {
    const failure = await migrationFailureAfterCleanup({ query }, "0099_cleanup", original,
      async () => { throw repin; });
    assert.equal(failure.cause, original);
    assert.equal(failure.code, "57014");
    assert.equal(failure.cleanup.rollbackError, rollbackError);
    assert.equal(failure.cleanup.repinError, repin);
    assert.deepEqual(failure.cleanup.outcomes.map(({ label, status }) => `${label}:${status}`),
      [`rollback:${rollbackError ? "failed" : "ok"}`, "session repin:failed"]);
    assert.match(failure.message, pattern);
  }
});

test("a wedged client end is bounded and reported without stranding the runner", async () => {
  // The runner's OTHER three cleanup paths — the execution client's end, the advisory
  // unlock and the two outer ends — all run in `finally` blocks, after the error (if
  // any) has been built. Each must be bounded, hard-closed on overrun, and REPORTED.
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-wedged-end-"));
  writeFileSync(join(dir, "0001_wedged.sql"), "select 1;", "utf8");
  const logs = [];
  const destroyed = [];
  const wedged = (name, { failConnect = false, hangEnd = false, hangUnlock = false } = {}) => ({
    connection: { stream: { destroy() { destroyed.push(name); } } },
    on() {},
    async connect() { if (failConnect) throw new Error(`${name} refused`); },
    async query(sql) {
      if (hangUnlock && sql.includes("pg_advisory_unlock")) return new Promise(() => {});
      return { rows: [] };
    },
    async end() { return hangEnd ? new Promise(() => {}) : undefined; },
  });
  const built = [];
  try {
    await assert.rejects(migrate({
      dir,
      cleanupTimeoutMs: 40,
      log: (line) => logs.push(line),
      clientFactory() {
        built.push(built.length);
        // 1st = lock client (its unlock AND its end wedge), 2nd = control client, which
        // fails to connect so the run ends in the outer finally with both wedges live.
        return built.length === 1
          ? wedged("lock", { hangUnlock: true, hangEnd: true })
          : wedged("control", { failConnect: true });
      },
    }), /control refused/, "the connect failure, not a cleanup timeout, is what propagates");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const cleanupLines = logs.filter((line) => line.startsWith("  cleanup:"));
  assert.ok(cleanupLines.some((line) => /advisory unlock exceeded the 40ms cleanup deadline — connection hard-closed/u.test(line)),
    `no advisory-unlock overrun was reported — saw ${JSON.stringify(cleanupLines)}`);
  assert.ok(cleanupLines.some((line) => /lock client end exceeded the 40ms cleanup deadline/u.test(line)),
    `no lock-client-end overrun was reported — saw ${JSON.stringify(cleanupLines)}`);
  assert.deepEqual(destroyed, ["lock", "lock"], "each overrun hard-closed the wedged socket");
});

test("hard close reports honestly when there is no socket to destroy", () => {
  assert.equal(hardCloseClient({}), false);
  assert.equal(hardCloseClient({ connection: {} }), false);
  assert.equal(CLEANUP_TIMEOUT_MS, 5_000);
});
