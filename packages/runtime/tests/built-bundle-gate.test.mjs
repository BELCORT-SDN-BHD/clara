// #637 review S4 — the built-artifact gate, proven against real files in a temp tree.
//
// WHAT THIS PROVES, and why each case is here rather than assumed: the two-build drill and the
// version-cutover drill both execute `.output/server/index.mjs`. If that artifact is absent, empty
// of workflow directives, older than the sources it claims to be, or registers a different body
// roster from `registry.ts`, every assertion in those drills still passes — about code nobody is
// shipping. "Passes vacuously" is the failure mode this file exists to make impossible, so each
// arm is exercised in BOTH directions: the bad tree refuses with a NAMED reason, and the good tree
// (including this repository's own, when it has been built) allows.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { RUNTIME_SOURCE_ROOTS, assertBuiltBundleFresh, declaredBodyRoster, inspectBuiltBundle } from "./built-bundle-gate.mjs";

const runtimeDir = fileURLToPath(new URL("..", import.meta.url));
const BUNDLE = join(runtimeDir, ".output", "server", "index.mjs");
const REGISTRY = join(runtimeDir, "workflows", "registry.ts");

/** A miniature packages/runtime: one source root, one "bundle" carrying WDK body directives. */
function makeTree({ bodies = ["claraWork_v1", "claraWork_v2"], bundleAgeS = 0, sourceAgeS = 60 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "clara-bundle-gate-"));
  mkdirSync(join(root, "workflows"), { recursive: true });
  mkdirSync(join(root, ".output", "server"), { recursive: true });
  const src = join(root, "workflows", "claraWork.v2.ts");
  writeFileSync(src, "export const claraWork_v2 = () => {};\n");
  const registry = join(root, "workflows", "registry.ts");
  writeFileSync(
    registry,
    `export const workflowBodies: readonly string[] = Object.freeze([\n${bodies.map((b) => `  "${b}",`).join("\n")}\n]);\n`,
  );
  const bundle = join(root, ".output", "server", "index.mjs");
  writeFileSync(
    bundle,
    bodies.map((b) => `register("workflows/${b.replace(/_?[vV](\d+)$/, ".v$1")}//${b}");`).join("\n") + "\n",
  );
  const now = Date.now() / 1000;
  utimesSync(src, now - sourceAgeS, now - sourceAgeS);
  utimesSync(registry, now - sourceAgeS, now - sourceAgeS);
  utimesSync(bundle, now - bundleAgeS, now - bundleAgeS);
  return { root, bundle, registry, src, roots: [join(root, "workflows")] };
}

test("637.s4: a BUILT, fresh, agreeing artifact is allowed — and its roster is read off the artifact", () => {
  const t = makeTree();
  try {
    const out = inspectBuiltBundle({ bundlePath: t.bundle, sourceRoots: t.roots, registryPath: t.registry });
    assert.equal(out.ok, true, `a good tree allows; got ${out.reason}: ${out.detail}`);
    assert.deepEqual(out.bodies, ["claraWork_v1", "claraWork_v2"]);
    assert.equal(out.reason, null);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("637.s4: a MISSING bundle refuses with `not_built` — never a vacuous pass", () => {
  const t = makeTree();
  try {
    rmSync(t.bundle);
    const out = inspectBuiltBundle({ bundlePath: t.bundle, sourceRoots: t.roots, registryPath: t.registry });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "not_built");
    assert.throws(
      () => assertBuiltBundleFresh({ bundlePath: t.bundle, sourceRoots: t.roots, registryPath: t.registry }),
      /REFUSING TO RUN AGAINST AN UNTRUSTWORTHY BUILD \(not_built\)[\s\S]*pnpm --filter @clara\/runtime build/,
      "the refusal names the reason AND the command that fixes it",
    );
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("637.s4: a bundle registering ZERO bodies refuses — that is an unreadable artifact, not a clean one", () => {
  const t = makeTree();
  try {
    writeFileSync(t.bundle, "// a bundle with no WDK directives at all\n");
    const out = inspectBuiltBundle({ bundlePath: t.bundle, sourceRoots: t.roots, registryPath: t.registry });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "registers_no_bodies");
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("637.s4: a STALE bundle refuses and NAMES the source that outran it", () => {
  // The realistic case: a source edited after the last build. The drill would run the OLD bytes
  // and go green about them.
  const t = makeTree({ bundleAgeS: 600, sourceAgeS: 0 });
  try {
    const out = inspectBuiltBundle({ bundlePath: t.bundle, sourceRoots: t.roots, registryPath: t.registry });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "stale");
    assert.match(String(out.detail), /claraWork\.v2\.ts/, "the refusal names WHICH file outran the build");
    assert.ok(out.newestSourceMs > out.builtAtMs);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("637.s4: an artifact whose ROSTER disagrees with registry.ts refuses, naming the missing body", () => {
  // Freshness by timestamp cannot see this: a checkout or a rebase can leave a body's source file
  // OLDER than the last build while the artifact does not carry it at all.
  const t = makeTree();
  try {
    writeFileSync(
      t.registry,
      'export const workflowBodies: readonly string[] = Object.freeze([\n  "claraWork_v1",\n  "claraWork_v2",\n  "claraWork_v3",\n]);\n',
    );
    const now = Date.now() / 1000;
    utimesSync(t.registry, now - 600, now - 600); // older than the bundle: freshness alone is happy
    const out = inspectBuiltBundle({ bundlePath: t.bundle, sourceRoots: t.roots, registryPath: t.registry });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "roster_disagrees");
    assert.match(String(out.detail), /absent from the artifact: claraWork_v3/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("637.s4: a registry whose roster cannot be read is refused, never guessed at", () => {
  const t = makeTree();
  try {
    writeFileSync(t.registry, "export const workflowBodies = someComputedThing();\n");
    const now = Date.now() / 1000;
    utimesSync(t.registry, now - 600, now - 600); // keep the freshness arm satisfied: this cell is about the roster
    assert.equal(declaredBodyRoster(t.registry), null, "a non-literal roster reads as UNKNOWN");
    const out = inspectBuiltBundle({ bundlePath: t.bundle, sourceRoots: t.roots, registryPath: t.registry });
    assert.equal(out.reason, "roster_unreadable");
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test("637.s4: THIS repository's registry roster is readable, and matches its build when one exists", () => {
  const declared = declaredBodyRoster(REGISTRY);
  assert.ok(Array.isArray(declared) && declared.length > 0, "the real registry.ts's workflowBodies parses");
  assert.ok(declared.includes("claraWork_v1") && declared.includes("claraWork_v2"));
  if (!existsSync(BUNDLE)) {
    // Not a skip-shaped lie: the roster half above ran. The artifact half needs an artifact.
    console.log("[637.s4] no .output bundle in this worktree — the artifact half of this cell needs `pnpm --filter @clara/runtime build`");
    return;
  }
  const out = inspectBuiltBundle({
    bundlePath: BUNDLE,
    sourceRoots: RUNTIME_SOURCE_ROOTS.map((p) => join(runtimeDir, p)),
    registryPath: REGISTRY,
  });
  assert.notEqual(out.reason, "roster_disagrees", `the built artifact and registry.ts must declare the same bodies: ${out.detail}`);
  assert.deepEqual([...out.bodies].sort(), declared, "the two independent derivations agree exactly");
});
