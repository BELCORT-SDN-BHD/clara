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
// 1b. #637 — BODIES and PINS. `workflows` has always named the registry's CLASSES, which is
// not a question a cutover or a rollback asks. `bodies` answers "which bodies can this image
// run" and `pins` answers "which one does each class dispatch to" — the two readings the
// rollback preflight compares a target image against.
// ---------------------------------------------------------------------------

test("#637: bodies and pins are carried verbatim onto the payload", async () => {
  const out = await buildInfo({
    env: {},
    names: ["chatTurn", "claraWork"],
    bodies: ["chatTurn_v18", "claraWork_v1", "claraWork_v2"],
    pins: { chatTurn: "chatTurn_v18", claraWork: "claraWork_v2" },
    withRuntime: runWith(async () => ({ rows: [{ frontier: null }] })),
  });
  assert.deepEqual(out.bodies, ["chatTurn_v18", "claraWork_v1", "claraWork_v2"]);
  assert.deepEqual(out.pins, { chatTurn: "chatTurn_v18", claraWork: "claraWork_v2" });
  // The distinction is the point: a class list cannot tell a reader that this image STILL
  // carries the superseded v1 body a parked Work resumes into.
  assert.deepEqual(out.workflows, ["chatTurn", "claraWork"], "the pre-existing class list is untouched");
});

test("#637: an image that passes neither reports empty, never a missing key", async () => {
  const out = await buildInfo({ env: {}, names: [], withRuntime: runWith(async () => ({ rows: [{ frontier: null }] })) });
  assert.deepEqual(out.bodies, [], "absent must read as 'none passed', not as an absent field");
  assert.deepEqual(out.pins, {});
  assert.ok("bodies" in out && "pins" in out, "both keys are always present on the payload");
});

// #1035 — THE THIRD ROSTER ON THE SAME PAYLOAD: which DOOR CONTRACTS this image understands.
//
// `bodies` answers "what can this image run". `contracts` answers "does it read what the doors now
// return" — the question 0254 and 0279 posed and nothing could answer about a target image. It
// rides the same import-here-pass-in shape as `bodies` and `pins`, and for a different reason:
// `lib/runtime-contracts.mjs` is plain-Node ESM, but the ROUTE is what decides that this payload
// speaks for this image, so the roster is passed in where the other rosters are.
//
// AN ABSENT KEY WOULD BE THE WHOLE DEFECT AGAIN. A rollback preflight reading a target's
// build-info must be able to tell "this image declares no contracts" (an honest pre-0254 answer,
// which REFUSES at 0254 and above) from "this payload does not have the field" — and it gets the
// former from an empty array beside a `bodies` list that is not.
test("#1035: contracts are carried verbatim onto the payload, and absent reads as an empty declaration", async () => {
  const out = await buildInfo({
    env: {},
    names: ["chatTurn"],
    bodies: ["chatTurn_v18"],
    contracts: ["intake_refusal_record_v1", "fa_parked_run_v1"],
    withRuntime: runWith(async () => ({ rows: [{ frontier: null }] })),
  });
  assert.deepEqual(out.contracts, ["intake_refusal_record_v1", "fa_parked_run_v1"]);

  const none = await buildInfo({ env: {}, names: [], bodies: ["chatTurn_v18"], withRuntime: runWith(async () => ({ rows: [{ frontier: null }] })) });
  assert.deepEqual(none.contracts, [], "absent must read as 'declares none', not as an absent field");
  assert.ok("contracts" in none, "the key is always present on the payload");
});

test("#1035: contracts is a COPY — a caller cannot mutate the roster through the response", async () => {
  const contracts = ["intake_refusal_record_v1"];
  const out = await buildInfo({ env: {}, names: [], contracts, withRuntime: runWith(async () => ({ rows: [{ frontier: null }] })) });
  out.contracts.push("injected_v99");
  assert.deepEqual(contracts, ["intake_refusal_record_v1"], "the roster's own array is untouched");
});

test("#637: bodies/pins are COPIES — a caller cannot mutate the registry's frozen roster through the response", async () => {
  const bodies = ["claraWork_v1", "claraWork_v2"];
  const pins = { claraWork: "claraWork_v2" };
  const out = await buildInfo({ env: {}, names: [], bodies, pins, withRuntime: runWith(async () => ({ rows: [{ frontier: null }] })) });
  out.bodies.push("injected_v99");
  out.pins.claraWork = "injected_v99";
  assert.deepEqual(bodies, ["claraWork_v1", "claraWork_v2"], "the registry's own array is untouched");
  assert.deepEqual(pins, { claraWork: "claraWork_v2" }, "the registry's own pin object is untouched");
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
  assert.match(src, /import \{[^}]*\bworkflowNames\b[^}]*\} from "\.\.\/workflows\/registry\.js"/, "the route imports the registry");
  assert.match(src, /names: workflowNames/, "and passes its names into the payload");
  // #623 / C88.8 — the serving bundle identity rides the SAME import-here-pass-in shape, and for
  // the same reason: lib/build-info.mjs is plain-Node .mjs and cannot import a TS module.
  assert.match(src, /import \{ claraWorkBundleIdentity \} from "\.\.\/workflows\/claraWork\.v1\.bundle\.js"/, "the route imports the bundle identity");
  // #629 — BOTH bundles are served, PINNED FIRST. v1 is still exported and still the body any Work
  // parked on a v1 hook resumes into at cutover; v2 is what `workflows.claraWork` dispatches. A
  // payload naming only one of them would leave a rollback preflight unable to answer, from one
  // read, which bodies this image actually carries — the question this route exists for.
  assert.match(src, /import \{ claraWorkBundleIdentityV2 \} from "\.\.\/workflows\/claraWork\.v2\.bundle\.js"/, "the route imports the v2 bundle identity too");
  // #1035 — the CONTRACT roster, same shape. Without this the payload would report
  // `contracts: []`, which a rollback preflight reads as "this image declares none" — the exact
  // false refusal that would make an operator distrust the gate and run the deploy anyway.
  assert.match(src, /import \{ RUNTIME_CONTRACT_IDS \} from "\.\.\/lib\/runtime-contracts\.mjs"/, "the route imports the contract roster");
  assert.match(src, /contracts: RUNTIME_CONTRACT_IDS/, "and passes it into the payload");
  // #631: THREE identities now, PINNED FIRST. v3 is what `workflows.claraWork` dispatches;
  // v2 and v1 are still carried for runs parked on their hooks, and an operator reading
  // /api/build-info has to be able to see all three rather than infer the rollback targets.
  assert.match(src, /import \{ claraWorkBundleIdentityV3 \} from "\.\.\/workflows\/claraWork\.v3\.bundle\.js"/, "the route imports the v3 bundle identity");
  // WAVE 2026-09-15 — FOUR identities now, PINNED FIRST. v4 is what `workflows.claraWork`
  // dispatches; v3, v2 and v1 are still carried for runs parked on their hooks, and the count is
  // the point rather than the names: an operator reading /api/build-info must see every rollback
  // target this image actually carries, not infer them from the pin.
  assert.match(src, /import \{ claraWorkBundleIdentityV4 \} from "\.\.\/workflows\/claraWork\.v4\.bundle\.js"/, "the route imports the v4 bundle identity");
  // WAVE 2026-09-18 — FIVE identities now, PINNED FIRST. Same reason, one version on: v5 is what
  // `workflows.claraWork` dispatches and v4…v1 are still carried for runs parked on their hooks.
  assert.match(src, /import \{ claraWorkBundleIdentityV5 \} from "\.\.\/workflows\/claraWork\.v5\.bundle\.js"/, "the route imports the v5 bundle identity");
  // THE ARRAY, READ AS AN ORDERED LIST RATHER THAN AS A LITERAL STRING. The previous form pinned
  // the exact one-line spelling, so it reds on a REFORMAT as loudly as on a missing bundle — and
  // this cut's addition pushed the line past the width limit, which is how that was found. What
  // the cell is actually for is the ORDER (newest first, so one read answers which body is pinned)
  // and the COMPLETENESS (every retained body, so a rollback preflight need not infer its targets);
  // both survive a line break, and neither is weakened by letting one through.
  const bundlesAt = src.indexOf("bundles: [");
  assert.ok(bundlesAt > 0, "the payload carries a bundles array");
  const bundlesArg = src.slice(bundlesAt, src.indexOf("]", bundlesAt));
  const identities = [...bundlesArg.matchAll(/claraWorkBundleIdentity(V\d+)?\(\)/g)].map((m) => m[1] ?? "V1");
  assert.deepEqual(
    identities,
    ["V5", "V4", "V3", "V2", "V1"],
    "...and passes all FIVE into the payload, NEWEST FIRST, so one read answers which bundles this image serves",
  );
  // #637 — the SAME import-here-pass-in shape for the registry's provenance exports. Without
  // these two the payload could name the bundles but not the BODIES, and a rollback preflight
  // reading a target image's /api/build-info would have nothing to compare a parked run against.
  assert.match(src, /workflowBodies/, "the route imports the body roster");
  assert.match(src, /workflowPins/, "…and the class pins");
  assert.match(src, /bodies: workflowBodies/, "…and passes the roster into the payload");
  assert.match(src, /pins: workflowPins/, "…and the pins too");
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
