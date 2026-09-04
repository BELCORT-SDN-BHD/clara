// See ./single-fire-guard.ts's header for the regression this guards against
// (review finding M3: `disabled={busy}` alone left no net against a
// concurrent second click — a mutant that removed it stayed green).
//
// RE-CUT for CB-AE2E-004. `runOnce` used to answer ONE boolean, and every one of
// the fifteen door-dialog wrappers read that boolean as "the act succeeded" when
// it only ever meant "the handler was not dropped as re-entrant". It now reports
// both facts separately — `ran` (re-entrancy) and `value` (what `fn` itself
// resolved to) — and the cells below pin BOTH, so collapsing them back into one
// boolean cannot pass.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSingleFireGuard, runOnce } from "./single-fire-guard";

test("runOnce: a concurrent call while the first is in flight is dropped — the underlying fn runs exactly once", async () => {
  const guard = createSingleFireGuard();
  let calls = 0;
  let resolveFirst!: () => void;

  const first = runOnce(guard, () => {
    calls += 1;
    return new Promise<void>((resolve) => { resolveFirst = resolve; });
  });

  // The "second click while busy" scenario: fired before the first call's fn
  // has resolved (indeed, before it has even had a chance to run a microtask).
  const second = runOnce(guard, async () => { calls += 1; });

  assert.deepEqual(await second, { ran: false, value: undefined }, "a concurrent call must be dropped, never queued");
  assert.equal(calls, 1, "the door fn itself must not have run a second time");

  resolveFirst();
  assert.equal((await first).ran, true, "the original in-flight call still reports ran — it actually ran");
  assert.equal(calls, 1, "still exactly one real invocation after the first call settles");
});

test("runOnce: a call AFTER the guard is free (fully settled) runs normally — the guard never gets stuck open", async () => {
  const guard = createSingleFireGuard();
  let calls = 0;
  assert.equal((await runOnce(guard, async () => { calls += 1; })).ran, true);
  assert.equal((await runOnce(guard, async () => { calls += 1; })).ran, true);
  assert.equal(calls, 2, "two SEQUENTIAL (non-overlapping) calls must both run");
});

test("runOnce: the guard releases even when fn throws — a failed door call never permanently jams the button", async () => {
  const guard = createSingleFireGuard();
  await assert.rejects(runOnce(guard, async () => { throw new Error("refused"); }));
  assert.equal(guard.current, false, "the guard must release in a finally, regardless of outcome");
  assert.equal((await runOnce(guard, async () => {})).ran, true, "a later call must still be able to run");
});

// CB-AE2E-004 — THE CELL THE CLASS DEFECT NEEDED. `act()` (lib/parts/hooks.ts)
// catches every governed refusal and RESOLVES `false`; it never rejects. So a
// refused act and a successful one are byte-identical as far as `ran` is
// concerned, and a wrapper that closes on `ran` closes on a refusal — destroying
// the input the refusal was asking the human to correct.
test("runOnce: `ran` and `value` are DIFFERENT facts — a settled-but-false fn still reports ran:true", async () => {
  const guard = createSingleFireGuard();

  const refused = await runOnce(guard, async () => false);
  assert.equal(refused.ran, true, "the handler ran — it was not dropped as re-entrant");
  assert.equal(refused.value, false, "…and it reported that the act did NOT succeed");

  const accepted = await runOnce(guard, async () => true);
  assert.deepEqual(accepted, { ran: true, value: true });

  // The discriminator, stated as the wrappers state it: only an explicit `true`
  // in `value` may close a dialog. `ran` cannot tell these two apart.
  assert.equal(refused.ran, accepted.ran, "ran alone cannot distinguish a refusal from a success");
  assert.notEqual(refused.value, accepted.value, "value is the only channel that can");
});

test("runOnce: a dropped concurrent call reports value undefined — never a stale success from the call in flight", async () => {
  const guard = createSingleFireGuard();
  let resolveFirst!: (v: boolean) => void;
  const first = runOnce(guard, () => new Promise<boolean>((resolve) => { resolveFirst = resolve; }));
  const dropped = await runOnce(guard, async () => true);

  assert.equal(dropped.ran, false);
  assert.equal(dropped.value, undefined, "a dropped call must not borrow the in-flight call's outcome");

  resolveFirst(true);
  assert.deepEqual(await first, { ran: true, value: true });
});
