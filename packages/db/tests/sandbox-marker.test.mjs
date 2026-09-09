// C33.6 — THE SANDBOX MARKER: what it is, who reads it, and where it must NOT appear.
//
// THE FINDING THIS CLOSES. The rig had a sandbox marker in behaviour and none in name: the
// prefix `rig_<clock>_<hex>` was a template literal inside `buildWorld()`. Nothing could ask
// "did the rig make this row?" without re-spelling the literal, and nothing stated the rule
// that the marker is a TEST-SIDE convention which production code must never depend on.
//
// THREE CELLS, and the third is the one with teeth:
//   sbm.1  buildWorld's output really carries the marker — asserted against the LIVE rows the
//          fixtures created, not against the string the helper returned.
//   sbm.2  the marker's consumers, inventoried by sweeping the three test trees, and NAMED in
//          the assertion message so the roster is visible in a passing run, not only a failing
//          one. A marker nothing reads is a marker nobody is maintaining.
//   sbm.3  NO PRODUCTION SOURCE READS IT — packages/db/migrations, apps/web/lib|app and EVERY
//          runtime tree the operation census treats as a production call site
//          (packages/runtime lib, src, scripts, plugins, workflows — RUNTIME_ROOTS in
//          scripts/operation-census/scope.mjs) are swept and must be clean. This is the
//          "reviewed no-gap" result: a migration, a workflow or a route that branched on a
//          fixture prefix would make the rig's own naming a production behaviour, and a firm
//          whose real name began `rig_` would then be treated differently from every other
//          firm. The sweep and the census must not disagree about what "production" means:
//          three runtime trees the census reads were outside this sweep until #618's review.
//
// TOKEN BOUNDARY, NOT SUBSTRING. `orig_nets` (0037) and `v_thr_trig_count` (0153) both contain
// `rig_`; neither is a marker. SANDBOX_MARKER_RE requires the marker to start a name, which is
// the only way `sandboxName()` ever emits it.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorld, endPool, ensureReady, rootQuery } from "./rig-fixtures.mjs";
import { SANDBOX_PREFIX, SANDBOX_MARKER_RE, isSandboxName, sandboxName } from "./fixtures/sandbox-marker.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/db/tests -> packages/db -> packages -> <repo root>. Never a hard-coded path. */
const REPO_ROOT = join(HERE, "..", "..", "..");

/** Where the marker MAY be read. */
const TEST_TREES = ["packages/db/tests", "packages/runtime/tests", "apps/web"];
/** Where it must NOT be. Every runtime tree here is one the operation census counts as a
 *  production call site (RUNTIME_ROOTS, scripts/operation-census/scope.mjs); a tree that can
 *  reach the database on a real firm's behalf but sits outside this list is a hole in the
 *  claim, not a smaller claim. */
const PRODUCTION_TREES = [
  "packages/db/migrations",
  "packages/runtime/lib",
  "packages/runtime/plugins",
  "packages/runtime/scripts",
  "packages/runtime/src",
  "packages/runtime/workflows",
  "apps/web/lib",
  "apps/web/app",
];
const SWEEP_EXTENSIONS = [".sql", ".ts", ".tsx", ".mts", ".mjs", ".js", ".cjs"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".output", ".nitro", "dist", "coverage", ".wrangler", ".open-next"]);

/** apps/web holds both trees; its production halves are swept as production, not as tests. */
const WEB_PRODUCTION = ["apps/web/lib/", "apps/web/app/"];

function sweep(root) {
  const abs = join(REPO_ROOT, root);
  const hits = [];
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return hits;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!SWEEP_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      const rel = relative(REPO_ROOT, full).split(sep).join("/");
      const lines = readFileSync(full, "utf8").split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (SANDBOX_MARKER_RE.test(lines[i])) hits.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 120) });
      }
    }
  };
  walk(abs);
  return hits;
}

let world = null;
let ready = false;

before(async () => {
  ready = await ensureReady();
  if (ready) world = await buildWorld();
});
after(endPool);

function unready(t) {
  if (!ready) {
    t.skip("Slice-2 governed schema not present — the fixture world cannot be built, so there is nothing to mark");
    return true;
  }
  return false;
}

test("sbm.1 buildWorld's rows carry the sandbox marker, read back off the database", async (t) => {
  if (unready(t)) return;
  assert.ok(isSandboxName(world.prefix), `buildWorld prefix ${JSON.stringify(world.prefix)} is not marked`);
  assert.match(
    world.prefix,
    /^rig_[0-9a-z]+_[0-9a-f]{6}$/,
    "the marked prefix changed shape — every fixture name in the estate is built from it",
  );

  // The rows themselves, not the string the helper handed back.
  const firms = await rootQuery("select id, name from clara.firms where id = any($1::uuid[]) order by name",
    [[world.firms.A, world.firms.B, world.firms.S]]);
  assert.equal(firms.rowCount, 3, "the three fixture firms are not on the database");
  for (const row of firms.rows) {
    assert.ok(isSandboxName(row.name), `firm ${row.id} is named ${JSON.stringify(row.name)} — not marked`);
  }
  const clients = await rootQuery("select id, name from clara.clients where id = any($1::uuid[]) order by name",
    [[world.clients.A1, world.clients.A2, world.clients.B1, world.clients.S1]]);
  assert.equal(clients.rowCount, 4, "the four fixture clients are not on the database");
  for (const row of clients.rows) {
    assert.ok(isSandboxName(row.name), `client ${row.id} is named ${JSON.stringify(row.name)} — not marked`);
  }

  // The reader is not a tautology: an unmarked name must answer false, and two mints must
  // differ (the marker is a per-run UNIQUENESS device, so a constant would defeat it).
  assert.equal(isSandboxName("acme_sdn_bhd"), false);
  assert.equal(isSandboxName(null), false);
  assert.equal(isSandboxName(undefined), false);
  assert.notEqual(sandboxName(), sandboxName());
  assert.ok(sandboxName("intake").startsWith(`${SANDBOX_PREFIX}intake_`));
});

test("sbm.2 the marker's consumers are inventoried, and the fixture that mints it is among them", async (t) => {
  if (unready(t)) return;
  const consumers = TEST_TREES.flatMap((root) => sweep(root))
    .filter((h) => !WEB_PRODUCTION.some((p) => h.file.startsWith(p)));
  const files = [...new Set(consumers.map((h) => h.file))].sort();
  const inventory = files.map((f) => `    ${f} (${consumers.filter((h) => h.file === f).length})`).join("\n");
  assert.ok(
    files.length > 0,
    `the sandbox marker ${SANDBOX_PREFIX} has NO consumer in ${TEST_TREES.join(", ")} — either the sweep is broken `
    + "or the convention is dead",
  );
  assert.ok(
    files.includes("packages/db/tests/fixtures/sandbox-marker.mjs"),
    `the module that defines the marker is not in its own consumer inventory:\n${inventory}`,
  );
  assert.ok(
    files.includes("packages/db/tests/rig-fixtures.mjs"),
    "rig-fixtures.mjs must reach the marker (buildWorld mints every fixture name from it):\n"
    + inventory,
  );
  // The roster is printed on a PASS as well as a fail — a reviewer should not have to break the
  // cell to learn who depends on the convention.
  console.log(`[sbm.2] ${SANDBOX_PREFIX} marker consumers — ${consumers.length} occurrence(s) in ${files.length} file(s):\n${inventory}`);
});

test("sbm.3 no production source reads the sandbox marker", async (t) => {
  if (unready(t)) return;
  const hits = PRODUCTION_TREES.flatMap((root) => sweep(root));
  assert.deepEqual(
    hits.map((h) => `${h.file}:${h.line}  ${h.text}`),
    [],
    "a production source branches on the rig's fixture-naming convention. The marker is a TEST-SIDE "
    + "device: a migration, a runtime module or a web route that reads it would give a real firm whose "
    + "name happens to start with the marker different behaviour from every other firm.",
  );
  // The sweep is not vacuous: it finds the marker when the marker is there.
  assert.ok(SANDBOX_MARKER_RE.test(`${SANDBOX_PREFIX}abc`), "the sweep pattern does not match a marked name");
  assert.equal(SANDBOX_MARKER_RE.test("orig_nets"), false, "the sweep must not read `orig_nets` as a marker");
  assert.equal(SANDBOX_MARKER_RE.test("v_thr_trig_count"), false, "the sweep must not read `trig_` as a marker");
  assert.ok(PRODUCTION_TREES.every((root) => existsSync(join(REPO_ROOT, root))), "a swept production tree is missing");
});
