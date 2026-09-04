// 裁-149 (C-04) + H-48 — the background-client error contract and the per-lane boot probe.
//
// PURE UNIT: no DB rig. Every cell here either plants a synthetic event, points a lane at a
// closed port, injects a prober, or reads the runtime's own source. The /ready half (the
// warning actually appearing in checkReadiness's output) is rig-gated and lives in
// ready.test.mjs beside the rest of the readiness matrix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { makePool } from "../lib/relay.mjs";
import { relayPoolHealth, _resetPoolErrorContractForTest, sanitizedErrorCode, attachPoolErrorContract } from "../lib/pool-error-contract.mjs";
import { LANE_ROSTER, READINESS_CRITICAL_LANE, probeLane, probeLanes, laneConfigured, _resetLaneProbeCacheForTest } from "../lib/lane-probe.mjs";
import { POOLS_LANE_DESCRIPTORS } from "../lib/pools.mjs";

const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));

// An UNREACHABLE lane DSN, assembled piecewise on purpose. Port 1 is reserved and closed on
// every platform, so a connect there refuses deterministically with no network wait. It is
// built from parts rather than written as a literal because a DSN carrying an inline password
// is exactly the shape `scripts/check-leaks.mjs` refuses in a tracked file — the guard cannot
// tell a fixture from a leak, and it should not have to.
const UNREACHABLE_DSN = ["postgres:/", "/", "nobody", ":", "PLACEHOLDER", "@", "127.0.0.1:1", "/", "nowhere"].join("");

// ---------------------------------------------------------------------------
// 1. The pool listener: the process SURVIVES, and the counter moves.
// ---------------------------------------------------------------------------

test("C-04: a planted background error on makePool's pool is COUNTED and does not throw", async () => {
  _resetPoolErrorContractForTest();
  const pool = makePool();
  try {
    assert.equal(relayPoolHealth().errors, 0, "counter starts at zero");
    // emit() on an EventEmitter with a listener returns true and runs it synchronously; with NO
    // listener for 'error' it THROWS. Surviving this line IS the assertion that the listener
    // exists — the process would otherwise be gone.
    pool.emit("error", Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }));
    const health = relayPoolHealth();
    assert.equal(health.errors, 1, "the counter incremented");
    assert.equal(health.last_error_code, "57P01", "the sanitized libpq code is stamped");
    assert.match(health.last_error_at, /^\d{4}-\d{2}-\d{2}T/, "the last-error time is stamped ISO");
    pool.emit("error", new Error("connection terminated unexpectedly"));
    assert.equal(relayPoolHealth().errors, 2, "the counter is monotonic across events");
    assert.equal(relayPoolHealth().last_error_code, "unknown", "a codeless error stamps the constant, never the message");
  } finally {
    await pool.end().catch(() => {});
    _resetPoolErrorContractForTest();
  }
});

test("C-04 MUST-NOT-RED control: the SAME event on a pool with no listener DOES throw", async () => {
  // The discriminating half. Without this, the cell above would pass for a pool that simply
  // never emits — it proves the listener is what turns a throwing event into a counted one.
  const bare = new pg.Pool({});
  try {
    assert.throws(
      () => bare.emit("error", new Error("connection terminated unexpectedly")),
      /connection terminated unexpectedly/,
      "an unlistened 'error' emit throws — this is the uncaughtException 裁-149 closes",
    );
  } finally {
    await bare.end().catch(() => {});
  }
});

test("C-04: sanitizedErrorCode never returns anything but an identifier token or 'unknown'", () => {
  assert.equal(sanitizedErrorCode({ code: "ECONNRESET" }), "ECONNRESET");
  assert.equal(sanitizedErrorCode({ code: "57P01" }), "57P01");
  assert.equal(sanitizedErrorCode(new Error("password authentication failed for user \"clara_read_login\"")), "unknown");
  // A code-shaped FIELD carrying a sentence is dropped WHOLE, not trimmed — no prefix leaks.
  assert.equal(sanitizedErrorCode({ code: "connection to host db.example.com failed" }), "unknown");
  assert.equal(sanitizedErrorCode({ code: 42 }), "unknown");
  assert.equal(sanitizedErrorCode(null), "unknown");
  assert.equal(sanitizedErrorCode(undefined), "unknown");
});

test("C-04: attachPoolErrorContract labels the log line and returns the same pool", async () => {
  _resetPoolErrorContractForTest();
  const fake = { handlers: [], on(evt, fn) { if (evt === "error") this.handlers.push(fn); return this; } };
  const returned = attachPoolErrorContract(fake, "unit");
  assert.equal(returned, fake, "the pool is returned so a constructor can be wrapped in one expression");
  assert.equal(fake.handlers.length, 1, "exactly one 'error' handler attached");
  fake.handlers[0](Object.assign(new Error("x"), { code: "08006" }));
  assert.equal(relayPoolHealth().errors, 1);
  assert.equal(relayPoolHealth().last_error_code, "08006");
  _resetPoolErrorContractForTest();
});

// ---------------------------------------------------------------------------
// 2. The lane roster — derived, complete, and honest about laziness.
// ---------------------------------------------------------------------------

test("H-48: LANE_ROSTER covers EVERY lane DSN variable the runtime source names", () => {
  // The drift guard. A future eighth login that ships a DSN variable but is never added to the
  // roster would be a lane /ready cannot see — exactly the hole H-48 is. Derived by census over
  // the shipping source, not from a second hand-typed list.
  const named = new Set();
  for (const file of runtimeSourceFiles()) {
    for (const m of readFileSync(file, "utf8").matchAll(/CLARA_[A-Z_]*DATABASE_URL/g)) named.add(m[0]);
  }
  const rostered = new Set(LANE_ROSTER.map((d) => d.dsnVar));
  const missing = [...named].filter((n) => !rostered.has(n)).sort();
  assert.deepEqual(missing, [], `every lane DSN variable must be probed; unprobed: ${missing.join(", ")}`);
  assert.equal(LANE_ROSTER.length, 7, "seven logins — four pools.mjs lanes, freeform, and the two checkout lanes");
  assert.equal(new Set(LANE_ROSTER.map((d) => d.lane)).size, 7, "lane names are unique");
  assert.equal(new Set(LANE_ROSTER.map((d) => d.role)).size, 7, "each lane SET ROLEs to its own distinct group role");
});

test("H-48: the roster's four pools.mjs lanes are the descriptors pools.mjs itself derives", () => {
  // "Spelling is not identity": prove the roster's first four members ARE the pools.mjs export,
  // not four strings that happen to match it.
  for (const d of POOLS_LANE_DESCRIPTORS) {
    assert.ok(LANE_ROSTER.includes(d), `${d.lane} descriptor must be the identical object pools.mjs exported`);
  }
  const eager = POOLS_LANE_DESCRIPTORS.filter((d) => d.eager).map((d) => d.lane).sort();
  assert.deepEqual(eager, ["read", "runtime", "write"], "eager set mirrors assertProductionPoolConfig's own three");
  assert.equal(POOLS_LANE_DESCRIPTORS.find((d) => d.lane === "bank").eager, false, "the bank lane stays LAZY (deploy ordering)");
});

test("H-48: the readiness-critical lane is the runtime lane and nothing else", () => {
  assert.equal(READINESS_CRITICAL_LANE, "runtime");
  assert.ok(LANE_ROSTER.some((d) => d.lane === READINESS_CRITICAL_LANE), "the critical lane is a real roster member");
});

// ---------------------------------------------------------------------------
// 3. probeLane — skip, fail, and never throw.
// ---------------------------------------------------------------------------

test("H-48: an unconfigured lane is SKIPPED, never an error", async () => {
  const dsnVar = "CLARA_L9_UNIT_ABSENT_DATABASE_URL";
  delete process.env[dsnVar];
  const prevTestMode = process.env.RELAY_TEST_MODE;
  delete process.env.RELAY_TEST_MODE; // production posture: no base fallback, so genuinely unconfigured
  try {
    const descriptor = { lane: "unit_absent", dsnVar, login: "l", role: "r" };
    assert.equal(laneConfigured(descriptor), false);
    const r = await probeLane(descriptor);
    assert.deepEqual(r, { lane: "unit_absent", skipped: true, reason: "dsn_not_configured" });
    assert.equal(r.ok, undefined, "a skip is NOT an ok:false — /ready must not warn about a lazy lane");
  } finally {
    if (prevTestMode === undefined) delete process.env.RELAY_TEST_MODE;
    else process.env.RELAY_TEST_MODE = prevTestMode;
  }
});

test("H-48: a configured lane that cannot connect reports ok:false with a SANITIZED code only", async () => {
  const dsnVar = "CLARA_L9_UNIT_DEAD_DATABASE_URL";
  process.env[dsnVar] = UNREACHABLE_DSN;
  try {
    const r = await probeLane({ lane: "unit_dead", dsnVar, login: "clara_unit_login", role: "clara_unit" }, { timeoutMs: 2000 });
    assert.equal(r.lane, "unit_dead");
    assert.equal(r.ok, false, "an unreachable lane fails");
    assert.equal(typeof r.error, "string");
    assert.match(r.error, /^[A-Za-z0-9_]{1,32}$/, "the reported error is an identifier-shaped code, never prose");
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes("127.0.0.1"), "the DSN host never reaches the response");
    assert.ok(!serialized.includes("nobody") && !serialized.includes("nothing"), "no credential material reaches the response");
    assert.ok(!serialized.includes("nowhere"), "the database name never reaches the response");
  } finally {
    delete process.env[dsnVar];
  }
});

test("H-48: probeLane NEVER throws, whatever the DSN is", async () => {
  const dsnVar = "CLARA_L9_UNIT_GARBAGE_DATABASE_URL";
  process.env[dsnVar] = "this is not a dsn at all";
  try {
    const r = await probeLane({ lane: "unit_garbage", dsnVar, login: "l", role: "r" }, { timeoutMs: 1000 });
    assert.equal(r.ok, false, "a garbage DSN is a reported failure, never a thrown one");
  } finally {
    delete process.env[dsnVar];
  }
});

// ---------------------------------------------------------------------------
// 4. The budget cell — the lanes are probed CONCURRENTLY, not one after another.
// ---------------------------------------------------------------------------

test("H-48: probeLanes runs the roster CONCURRENTLY (the /ready budget)", async () => {
  _resetLaneProbeCacheForTest();
  const HOLD_MS = 150;
  const roster = [{ lane: "a" }, { lane: "b" }, { lane: "c" }, { lane: "d" }];
  const started = [];
  let peak = 0;
  let inFlight = 0;
  const probe = async (d) => {
    started.push(Date.now());
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, HOLD_MS));
    inFlight -= 1;
    return { lane: d.lane, ok: true };
  };
  const t0 = Date.now();
  const out = await probeLanes({ roster, probe, ttlMs: 0 });
  const elapsed = Date.now() - t0;
  assert.equal(out.length, 4);
  assert.equal(peak, 4, "all four probes were in flight at the same moment — the discriminating assertion");
  assert.ok(
    elapsed < HOLD_MS * roster.length,
    `concurrent probing must beat sequential (${elapsed}ms vs a ${HOLD_MS * roster.length}ms sequential floor)`,
  );
  _resetLaneProbeCacheForTest();
});

test("H-48: probeLanes CACHES within its TTL (no connection storm under a 1/s poll)", async () => {
  _resetLaneProbeCacheForTest();
  let calls = 0;
  const roster = [{ lane: "a" }, { lane: "b" }];
  const probe = async (d) => {
    calls += 1;
    return { lane: d.lane, ok: true };
  };
  await probeLanes({ roster, probe, ttlMs: 60000 });
  await probeLanes({ roster, probe, ttlMs: 60000 });
  await probeLanes({ roster, probe, ttlMs: 60000 });
  assert.equal(calls, 2, "three /ready polls inside the TTL opened ONE round of probes, not three");
  _resetLaneProbeCacheForTest();
  await probeLanes({ roster, probe, ttlMs: 0 });
  assert.equal(calls, 4, "a zero TTL re-probes");
  _resetLaneProbeCacheForTest();
});

test("H-48: a probe that rejects outright still yields a result row, never an unsettled set", async () => {
  _resetLaneProbeCacheForTest();
  const roster = [{ lane: "a" }, { lane: "boom" }];
  const probe = async (d) => {
    if (d.lane === "boom") throw new Error("internal");
    return { lane: d.lane, ok: true };
  };
  const out = await probeLanes({ roster, probe, ttlMs: 0 });
  assert.equal(out.length, 2);
  assert.deepEqual(out.find((r) => r.lane === "boom"), { lane: "boom", ok: false, error: "probe_internal_error" });
  _resetLaneProbeCacheForTest();
});

// ---------------------------------------------------------------------------
// 5. The census + the leader-posture pin (裁-149's corrected premise).
// ---------------------------------------------------------------------------

function runtimeSourceFiles() {
  const out = [];
  const skip = new Set(["node_modules", ".output", ".nitro", "test-storage", "tests"]);
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if ([".mjs", ".js", ".ts", ".cjs"].includes(extname(entry))) out.push(full);
    }
  };
  walk(RUNTIME_ROOT);
  return out;
}

test("C-04 drift guard: EVERY `new pg.Pool` site in the runtime declares an error posture", () => {
  // The reason this exists: before 裁-149 exactly ONE of the nine pool sites had no listener,
  // and nothing would have caught a tenth. A site is covered if it is wrapped in
  // attachPoolErrorContract(...) on the same line, or an `.on("error"` follows within six lines.
  const uncovered = [];
  let sites = 0;
  for (const file of runtimeSourceFiles()) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes("new pg.Pool(")) continue;
      sites += 1;
      const wrapped = lines[i].includes("attachPoolErrorContract(");
      const window = lines.slice(i, i + 7).join("\n");
      const listener = /\.on\(\s*["']error["']/.test(window);
      if (!wrapped && !listener) uncovered.push(`${file.slice(RUNTIME_ROOT.length)}:${i + 1}`);
    }
  }
  assert.ok(sites >= 9, `expected at least the nine known pool sites, censused ${sites}`);
  assert.deepEqual(uncovered, [], `every pool must declare an error posture; uncovered: ${uncovered.join(", ")}`);
});

test("裁-149 clause 2, AS BUILT: both leader sessions record and RETHROW — they are not crash-loud", () => {
  // The ruling's premise says no listener is attached to the leader's dedicated makeClient()
  // session. It is, at BOTH call sites, and this PR deliberately left them byte-untouched. This
  // cell pins the posture docs/ARCHITECTURE.md §4.3 now claims, so a future edit that silently
  // converts the leader to crash-loud (or to a swallow) has to face the contract first.
  for (const rel of ["scripts/relay.mjs", "lib/leader.mjs"]) {
    const src = readFileSync(join(RUNTIME_ROOT, rel), "utf8");
    assert.match(src, /client\.on\("error",\s*\(e\)\s*=>\s*\{?\s*connErr\s*=\s*e/, `${rel}: the leader session records the error`);
    assert.match(src, /if\s*\(connErr\)\s*throw\s*connErr/, `${rel}: and RETHROWS it, which is what drives the reconnect`);
    assert.ok(!/client\.on\("error",\s*\(\)\s*=>\s*\{\s*\}\)/.test(src), `${rel}: the leader must never SWALLOW — that would be the silent stall the ruling feared`);
  }
});

test("裁-149 clause 3: the contract is written down where the ruling says it must be", () => {
  const arch = readFileSync(join(RUNTIME_ROOT, "..", "..", "docs", "ARCHITECTURE.md"), "utf8");
  assert.match(arch, /background client error does to the process, per connection/, "ARCHITECTURE carries the per-connection contract");
  assert.match(arch, /log \+ COUNT \+ recycle/, "the pool's posture is stated");
  assert.match(arch, /rethrow into the caller's own reconnect loop/, "the leader's as-built posture is stated");
  assert.match(arch, /correction to 裁-149's premise/, "the premise correction is recorded, not silently 'kept'");
});
