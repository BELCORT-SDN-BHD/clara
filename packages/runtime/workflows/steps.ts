// @frozen
//
// Durable steps for the example workflow. A `"use step"` body is memoized by
// the engine: on replay it is NOT re-executed (proven in the Slice-0 spike).
// Real steps (Slice 4+) call audited DB functions and carry idempotency keys;
// this skeleton step has no side-effects.
//
// FROZEN because closeExample.v1.ts (a frozen workflow) imports it: editing a
// "use step" body changes the un-executed continuation of every in-flight run
// while the workflow hash stays green. The freeze-lint freezes the whole
// import-closure of each frozen workflow, so this file is hash-locked too — the
// @frozen marker is documentation; the closure is the enforcement. Ship a
// behavioural change as a new step used by a new _vN workflow (Appendix A).

export async function recordExample(opKey: string): Promise<{ opKey: string; recordedAt: string }> {
  "use step";
  return { opKey, recordedAt: new Date().toISOString() };
}
