// See ./single-fire-guard.ts's header for the regression this guards against
// (review finding M3: `disabled={busy}` alone left no net against a
// concurrent second click — a mutant that removed it stayed green).

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

  assert.equal(await second, false, "a concurrent call must be dropped (return false), never queued");
  assert.equal(calls, 1, "the door fn itself must not have run a second time");

  resolveFirst();
  assert.equal(await first, true, "the original in-flight call still resolves true — it actually ran");
  assert.equal(calls, 1, "still exactly one real invocation after the first call settles");
});

test("runOnce: a call AFTER the guard is free (fully settled) runs normally — the guard never gets stuck open", async () => {
  const guard = createSingleFireGuard();
  let calls = 0;
  assert.equal(await runOnce(guard, async () => { calls += 1; }), true);
  assert.equal(await runOnce(guard, async () => { calls += 1; }), true);
  assert.equal(calls, 2, "two SEQUENTIAL (non-overlapping) calls must both run");
});

test("runOnce: the guard releases even when fn throws — a failed door call never permanently jams the button", async () => {
  const guard = createSingleFireGuard();
  await assert.rejects(runOnce(guard, async () => { throw new Error("refused"); }));
  assert.equal(guard.current, false, "the guard must release in a finally, regardless of outcome");
  assert.equal(await runOnce(guard, async () => {}), true, "a later call must still be able to run");
});
