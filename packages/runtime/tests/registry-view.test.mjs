// Gate G1 (opus/Codex review, MUST D) — registry.ts's `workflowsByName` view must be PROVABLY
// the same object as `workflows`, not merely constructed that way once and trusted forever.
//
// M8(a) (opus R2 + Codex, correcting this build's own earlier record): an EARLIER draft of this
// file was DELETED on the claim that "this package's plain node --test never TS-compiles
// workflows/*.ts... zero of ~25 existing tests importing from workflows/ import a .ts file" —
// that claim was FACTUALLY FALSE, caught by an independent review, not by this build's own
// re-check. f-a1-pr3a-consumers.test.mjs:24-25, f-a2-pr2-post.test.mjs:30 and
// f-a2-statement-activation.test.mjs:30-32 ALL import workflows/*.ts directly, via the SAME
// established idiom: register tsx's own ESM loader (`tsx/esm/api`), then a plain dynamic
// `await import("../workflows/....ts")`. The earlier grep that produced the false claim only
// matched STATIC `import ... from ".../*.mjs"` statements — it never searched for the DYNAMIC
// `await import(...ts")` shape these three files actually use, so it missed real, working
// precedent already live in this same test suite. Restored here, using that exact idiom.
import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { workflows, workflowsByName } = await import("../workflows/registry.ts");

test("workflowsByName IS workflows — reference identity, never a copy or a second source of truth", () => {
  assert.equal(workflowsByName, workflows, "workflowsByName must be the SAME object reference as workflows (===), not deep-equal");
});

test("workflowsByName (and therefore workflows) is frozen — a mutation attempt throws, never silently succeeds", () => {
  assert.equal(Object.isFrozen(workflowsByName), true, "workflowsByName must be frozen");
  assert.equal(Object.isFrozen(workflows), true, "freezing the shared object freezes workflows too (same reference)");
  assert.throws(
    () => {
      // @ts-expect-error — deliberately violating the readonly type to prove the RUNTIME guard
      workflowsByName.g1MaliciousEntry = async () => "not a real workflow";
    },
    TypeError,
    "assigning a new key to workflowsByName must throw TypeError (frozen, strict mode)",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(workflowsByName, "g1MaliciousEntry"),
    false,
    "the throwing assignment must not have landed",
  );
});

test("every workflow class name resolvable through workflowsByName resolves to the SAME function workflows itself carries", () => {
  for (const key of Object.keys(workflows)) {
    assert.equal(workflowsByName[key], workflows[key], `workflowsByName.${key} must be identical to workflows.${key}`);
  }
});

// ---------------------------------------------------------------------------
// #637 (C88.8 / C-70) — THE PROVENANCE EXPORTS. `workflowBodies` and `workflowPins`
// are the registry's own answer to "which bodies does this image carry, and which one
// does each class dispatch to". They are INERT DATA — frozen arrays/objects of STRING
// identifiers, never function references — so they add no second dispatch view for the
// enqueue-provenance law to have to trust (freeze-lint's REGISTRY-VIEW-INTEGRITY check
// enforces exactly that shape; scripts/check-frozen-workflows.selftest.mjs pins it).
//
// The DRIFT GUARD is the point of the cells below. `workflowBodies` is hand-written
// (a module cannot enumerate its own exports without `import * as self`, which the
// closed-world census rejects on sight), so the only thing standing between it and a
// stale roster is a test that reads the REAL export surface and compares. A successor
// version that lands an `export { claraWork_v3 }` without adding it here fails HERE,
// not in production six weeks later when a rollback preflight reports a body the image
// carries as unsupported.
const registryModule = await import("../workflows/registry.ts");
const { workflowBodies, workflowPins, workflowNames } = registryModule;

/** Every identifier registry.ts re-exports as a workflow BODY — read off the real module
 *  namespace, never a second hand-maintained list. The four derived exports (`workflows`,
 *  `workflowsByName`, `workflowNames`, and the two under test) are the registry's views,
 *  not bodies. */
const REGISTRY_VIEW_EXPORTS = new Set(["workflows", "workflowsByName", "workflowNames", "workflowBodies", "workflowPins"]);
const exportedBodyNames = Object.keys(registryModule)
  .filter((name) => !REGISTRY_VIEW_EXPORTS.has(name))
  .filter((name) => typeof registryModule[name] === "function");

test("#637: workflowBodies is frozen, and every id in it is an OWN export of registry.ts resolving to a function", () => {
  assert.equal(Object.isFrozen(workflowBodies), true, "workflowBodies must be frozen");
  assert.ok(Array.isArray(workflowBodies) && workflowBodies.length > 0, "workflowBodies is a non-empty array");
  for (const id of workflowBodies) {
    assert.equal(typeof id, "string", `workflowBodies entry ${String(id)} must be a plain string identifier, never a function reference`);
    assert.equal(
      typeof registryModule[id],
      "function",
      `workflowBodies names "${id}", but registry.ts does not export a function under that name — a body this image claims to carry must be reachable`,
    );
  }
  assert.equal(new Set(workflowBodies).size, workflowBodies.length, "workflowBodies has no duplicate ids");
});

test("#637: workflowBodies names EVERY body registry.ts exports — the drift guard a hand-written roster needs", () => {
  const declared = new Set(workflowBodies);
  const missing = exportedBodyNames.filter((name) => !declared.has(name));
  assert.deepEqual(
    missing,
    [],
    "registry.ts exports these workflow bodies but workflowBodies does not name them — add them (a body missing here reads to a rollback preflight as one this image cannot run)",
  );
});

test("#637: workflowPins is frozen, maps every registry class to a string id, and every pin is in workflowBodies", () => {
  assert.equal(Object.isFrozen(workflowPins), true, "workflowPins must be frozen");
  assert.deepEqual(
    Object.keys(workflowPins).sort(),
    [...workflowNames].sort(),
    "workflowPins covers exactly the classes the registry dispatches — no more, no fewer",
  );
  for (const [className, id] of Object.entries(workflowPins)) {
    assert.equal(typeof id, "string", `workflowPins.${className} must be a string identifier`);
    assert.ok(workflowBodies.includes(id), `workflowPins.${className} = "${id}" must also appear in workflowBodies`);
    assert.equal(
      registryModule[id],
      workflows[className],
      `workflowPins.${className} names "${id}", but registry.workflows.${className} is a DIFFERENT function — the pin and the dispatch table must agree`,
    );
  }
});

test("#637: mutating either provenance export throws — they are data an operator reads, never a surface a caller edits", () => {
  assert.throws(() => {
    // @ts-expect-error — deliberately violating readonly to prove the RUNTIME guard
    workflowBodies.push("injected_v99");
  }, TypeError);
  assert.throws(() => {
    // @ts-expect-error — deliberately violating readonly to prove the RUNTIME guard
    workflowPins.injectedClass = "injected_v99";
  }, TypeError);
  assert.equal(workflowBodies.includes("injected_v99"), false, "the throwing push must not have landed");
  assert.equal(Object.prototype.hasOwnProperty.call(workflowPins, "injectedClass"), false, "the throwing assignment must not have landed");
});
