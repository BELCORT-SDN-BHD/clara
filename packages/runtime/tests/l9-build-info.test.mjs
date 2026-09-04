// CB-AE2E-035 — /api/build-info. PURE UNIT: the frontier read is driven through an injected
// `withRuntime`, so every branch (the verb absent, a timeout, a plain error, a good read) is
// exercised without a rig and without depending on whether DB-B's migration has landed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildInfo, readMigrationFrontier } from "../lib/build-info.mjs";

const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** An injected withRuntime that hands the callback a client whose query() does `impl`. */
const runWith = (impl) => (fn) => fn({ query: impl });

// ---------------------------------------------------------------------------
// 1. The honesty rungs.
// ---------------------------------------------------------------------------

test("CB-035: git_sha is NULL when CLARA_BUILD_SHA is unset — never a placeholder", async () => {
  const out = await buildInfo({ env: {}, names: [], withRuntime: runWith(async () => ({ rows: [{ frontier: { count: 1, max_version: "0164" } }] })) });
  assert.equal(out.git_sha, null, "unset must be null");
  // The discriminating half: no fallback string of any kind reached the payload.
  const serialized = JSON.stringify(out);
  for (const forbidden of ["unknown", "none", "n/a", "dev", "HEAD"]) {
    assert.ok(!serialized.includes(`"git_sha":"${forbidden}"`), `git_sha must never be the placeholder ${forbidden}`);
  }
});

test("CB-035: an EMPTY CLARA_BUILD_SHA is treated as unset, not reported as an empty sha", async () => {
  // The Dockerfile's ARG defaults to "" and Docker promotes that to an ENV that IS present but
  // empty — so an `in process.env` test would report `git_sha: ""`, which reads as a value.
  const out = await buildInfo({ env: { CLARA_BUILD_SHA: "" }, names: [], withRuntime: runWith(async () => ({ rows: [{ frontier: null }] })) });
  assert.equal(out.git_sha, null);
});

test("CB-035: a baked sha, image ref and machine identity are reported verbatim", async () => {
  const env = {
    CLARA_BUILD_SHA: "a2d098f29776c7fc40151e8eb0b25b57ad9af9ed",
    FLY_IMAGE_REF: "registry.fly.io/clara-runtime:deployment-01ABC",
    FLY_MACHINE_VERSION: "01DEF",
    FLY_MACHINE_ID: "9080e123",
  };
  const out = await buildInfo({ env, names: ["chatTurn_v17"], withRuntime: runWith(async () => ({ rows: [{ frontier: { count: 164, max_version: "0164" } }] })) });
  assert.equal(out.service, "clara-runtime");
  assert.equal(out.git_sha, env.CLARA_BUILD_SHA);
  assert.equal(out.image_ref, env.FLY_IMAGE_REF);
  assert.equal(out.machine_version, env.FLY_MACHINE_VERSION);
  assert.equal(out.machine_id, env.FLY_MACHINE_ID);
  assert.deepEqual(out.workflows, ["chatTurn_v17"]);
  assert.deepEqual(out.frontier, { count: 164, max_version: "0164" });
  assert.equal(out.frontier_reason, null);
  assert.match(out.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("CB-035: the workflow list is a COPY — a caller cannot mutate the registry through it", async () => {
  const names = ["chatTurn_v17"];
  const out = await buildInfo({ env: {}, names, withRuntime: runWith(async () => ({ rows: [{ frontier: null }] })) });
  out.workflows.push("injected");
  assert.deepEqual(names, ["chatTurn_v17"], "the registry's own array is untouched");
});

// ---------------------------------------------------------------------------
// 2. The frontier read can never fail the route, and says WHICH failure it was.
// ---------------------------------------------------------------------------

test("CB-035: an ABSENT clara.build_frontier() reports null with the deployment reason", async () => {
  // The state before DB-B's migration lands. This must NOT read like "there are no migrations".
  const throwUndefinedFunction = async () => {
    throw Object.assign(new Error('function clara.build_frontier() does not exist'), { code: "42883" });
  };
  const r = await readMigrationFrontier({ withRuntime: runWith(throwUndefinedFunction) });
  assert.equal(r.frontier, null);
  assert.equal(r.frontier_reason, "clara.build_frontier() is not deployed to this database yet");

  const out = await buildInfo({ env: { CLARA_BUILD_SHA: "abc" }, names: [], withRuntime: runWith(throwUndefinedFunction) });
  assert.equal(out.git_sha, "abc", "the rest of the payload is INTACT — build-info answers when the DB does not");
  assert.equal(out.frontier, null);
  assert.equal(out.frontier_reason, "clara.build_frontier() is not deployed to this database yet");
});

test("CB-035: a DB-unreachable frontier read reports null with a DIFFERENT reason", async () => {
  const r = await readMigrationFrontier({
    withRuntime: runWith(async () => {
      throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    }),
  });
  assert.equal(r.frontier, null);
  assert.equal(r.frontier_reason, "the frontier read failed");
  // Collapsing "not deployed" and "read failed" into one reason would hide a migration gap.
  assert.notEqual(r.frontier_reason, "clara.build_frontier() is not deployed to this database yet");
  assert.ok(!JSON.stringify(r).includes("ECONNREFUSED"), "raw DB text never reaches the payload");
});

test("CB-035: a HANGING frontier read is bounded and reports the timeout reason", async () => {
  const r = await readMigrationFrontier({
    timeoutMs: 60,
    withRuntime: runWith(() => new Promise(() => {})), // never settles
  });
  assert.equal(r.frontier, null);
  assert.equal(r.frontier_reason, "the frontier read exceeded its deadline");
});

test("CB-035: a row with no frontier value is reported honestly, not as a zero frontier", async () => {
  const r = await readMigrationFrontier({ withRuntime: runWith(async () => ({ rows: [{ frontier: null }] })) });
  assert.equal(r.frontier, null);
  assert.equal(r.frontier_reason, "build_frontier returned no row");
  const empty = await readMigrationFrontier({ withRuntime: runWith(async () => ({ rows: [] })) });
  assert.equal(empty.frontier, null);
  assert.equal(empty.frontier_reason, "build_frontier returned no row");
});

test("CB-035: the door is called at its exact signature, with no arguments", async () => {
  // "Spelling is not identity" applies to the SQL too — DB-B grants EXECUTE on
  // clara.build_frontier() at that exact signature and to clara_runtime alone.
  const seen = [];
  await readMigrationFrontier({
    withRuntime: runWith(async (sql, params) => {
      seen.push([sql, params]);
      return { rows: [{ frontier: { count: 1, max_version: "0001" } }] };
    }),
  });
  assert.equal(seen.length, 1, "exactly one query");
  assert.equal(seen[0][0], "select clara.build_frontier() as frontier");
  assert.equal(seen[0][1], undefined, "no parameters — the door takes none");
});

test("CB-035: max_version null (an empty ledger) is reported as null, not as a string 'null'", async () => {
  const r = await readMigrationFrontier({ withRuntime: runWith(async () => ({ rows: [{ frontier: { count: 0, max_version: null } }] })) });
  assert.deepEqual(r.frontier, { count: 0, max_version: null });
  assert.equal(r.frontier_reason, null);
});

// ---------------------------------------------------------------------------
// 3. The route's shape: session-gated, under /api, and gated BEFORE any payload.
// ---------------------------------------------------------------------------

test("CB-035: the route is mounted under /api and takes the same authenticate gate", () => {
  const src = readFileSync(join(RUNTIME_ROOT, "src", "buildInfoRoutes.ts"), "utf8");
  assert.match(src, /router\.get\("\/api\/build-info"/, "mounted under /api, so the web proxy can reach it and no anonymous caller can");
  assert.match(src, /authenticate\(c, req\.header\("authorization"\)\)/, "the same JWT -> live membership gate every other /api route takes");
  // The gate must be AWAITED before the payload is assembled — an assembled-then-discarded
  // payload would compute build facts for an unauthenticated caller.
  const gateAt = src.indexOf("authenticate(c,");
  const payloadAt = src.indexOf("await buildInfo(");
  assert.ok(gateAt > 0 && payloadAt > gateAt, "the gate precedes the payload in the executed order");
  // lib/build-info.mjs cannot import the TS registry, so the ROUTE must pass the names in.
  // Without this the payload would report `workflows: []`, which reads as "none registered".
  assert.match(src, /import \{ workflowNames \} from "\.\.\/workflows\/registry\.js"/, "the route imports the registry");
  assert.match(src, /buildInfo\(\{ names: workflowNames \}\)/, "and passes its names into the payload");
});

test("CB-035: index.ts mounts the router, and the three ROOT endpoints stay ungated and build-free", () => {
  const src = readFileSync(join(RUNTIME_ROOT, "src", "index.ts"), "utf8");
  assert.match(src, /app\.use\(buildInfoRoutes\(\)\);/, "the router is mounted");
  // A build-info at the ROOT would be readable by anyone who can reach the fly app. The three
  // root endpoints must stay what they are: liveness, readiness, and workflow export names.
  assert.ok(!/app\.get\("\/build-info"/.test(src), "there is no ROOT /build-info");
  for (const root of ["/health", "/ready", "/workflows"]) {
    assert.ok(src.includes(`"${root}"`), `${root} is still mounted at the root`);
  }
});
