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
