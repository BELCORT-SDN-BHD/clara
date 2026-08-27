// useAsyncRead — mounted for real via ../../test/hookHarness (the useHydratedPart
// precedent, hooks.test.ts's own header): the property under test is WHAT HAPPENS
// OVER TIME (mount fires the loader once; act() reloads; a failed act() is sticky
// across its own follow-up reload), which a single render pass cannot observe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useAsyncRead } from "./use-async-read";

test("mount fires the loader exactly once and populates data", async () => {
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { seen: calls };
  };
  const h = await renderHook(() => useAsyncRead(loader));
  try {
    await h.settle();
    assert.equal(calls, 1);
    assert.deepEqual(h.current.data, { seen: 1 });
    assert.equal(h.current.loading, false);
    assert.equal(h.current.error, null);
  } finally {
    await h.unmount();
  }
});

// PC1-style storm-property test (the coordinator's naming, 2026-08-27 — the
// class lib/parts/hooks.ts's own header names as its own hard-won fix): a
// PARENT re-render handing the hook a BRAND NEW inline loader closure every
// time must never re-trigger the mount effect. `loaderRef` (updated on every
// render, read only inside the stable `reloadImpl`) is what makes this true —
// the mount effect itself depends on nothing that changes across a re-render.
test("N fresh inline loader closures across re-renders never re-trigger the loader (no storm)", async () => {
  let calls = 0;
  let renderCount = 0;
  const h = await renderHook(() => {
    renderCount += 1;
    // A FRESH closure every render — exactly the anti-pattern the hook's own
    // header defends against, not a stable useCallback like a well-behaved
    // caller would pass.
    const loader = async () => {
      calls += 1;
      return { seen: calls };
    };
    return useAsyncRead(loader);
  });
  try {
    await h.settle();
    assert.equal(calls, 1, "mount must fire the loader exactly once");
    for (let i = 0; i < 25; i++) {
      await h.rerender();
    }
    assert.ok(renderCount >= 26, "the probe genuinely re-rendered 25+ times");
    assert.equal(calls, 1, "a fresh loader identity on every render must never re-fire the mount effect");
  } finally {
    await h.unmount();
  }
});

test("a mount failure surfaces the raw error object, not just a message", async () => {
  const boom = new Error("permission denied");
  const loader = async () => { throw boom; };
  const h = await renderHook(() => useAsyncRead(loader));
  try {
    await h.settle();
    assert.equal(h.current.data, null);
    assert.equal(h.current.error, boom);
  } finally {
    await h.unmount();
  }
});

test("act(): success re-reloads, clears any prior error, and resolves true", async () => {
  let n = 0;
  const loader = async () => ({ n: ++n });
  const h = await renderHook(() => useAsyncRead(loader));
  let ok: boolean | undefined;
  try {
    await h.settle();
    assert.deepEqual(h.current.data, { n: 1 });
    await h.act(async () => { ok = await h.current.act(async () => {}); });
    assert.deepEqual(h.current.data, { n: 2 }, "act() must re-read, never assume the write's own result");
    assert.equal(h.current.error, null);
    assert.equal(ok, true);
  } finally {
    await h.unmount();
  }
});

test("act(): a failed write's error is STICKY across the follow-up reload it triggers, and resolves false", async () => {
  const loader = async () => ({ ok: true });
  const writeErr = new Error("CLR10: refused");
  const h = await renderHook(() => useAsyncRead(loader));
  let ok: boolean | undefined;
  try {
    await h.settle();
    await h.act(async () => { ok = await h.current.act(async () => { throw writeErr; }); });
    assert.equal(h.current.error, writeErr, "the write's own failure must survive its own successful follow-up reload");
    assert.deepEqual(h.current.data, { ok: true }, "data still re-derives for real despite the sticky error");
    assert.equal(ok, false, "act() must resolve false on a caught failure, never reject");
  } finally {
    await h.unmount();
  }
});

test("act(): when the follow-up reload ALSO fails, that failure wins over the write's own", async () => {
  let attempt = 0;
  const reloadErr = new Error("reload also failed");
  const loader = async () => {
    attempt += 1;
    if (attempt > 1) throw reloadErr;
    return { ok: true };
  };
  const writeErr = new Error("write failed");
  const h = await renderHook(() => useAsyncRead(loader));
  try {
    await h.settle();
    await h.act(async () => { await h.current.act(async () => { throw writeErr; }); });
    assert.equal(h.current.error, reloadErr);
  } finally {
    await h.unmount();
  }
});

// Independent review finding PC2 (fix-required, 2026-08-27): a monotonic reload
// epoch must make the LAST-STARTED reload win, regardless of resolution order —
// never rely on a consumer to key itself to avoid the race.
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("reload(): the LAST-STARTED call wins even when an OLDER call resolves LATER", async () => {
  const d1 = deferred<{ n: number }>();
  const d2 = deferred<{ n: number }>();
  const d3 = deferred<{ n: number }>();
  const queue = [d1, d2, d3];
  let callIndex = 0;
  const loader = () => {
    const d = queue[callIndex];
    callIndex += 1;
    if (!d) throw new Error("unexpected extra call");
    return d.promise;
  };
  const h = await renderHook(() => useAsyncRead(loader));
  try {
    await h.settle(); // mount -> call #1 (d1), left unresolved
    await h.act(() => {
      void h.current.reload(); // call #2 (d2), left unresolved
    });
    await h.act(() => {
      void h.current.reload(); // call #3 (d3), left unresolved
    });
    // Resolve the NEWER call (#3) first, then the OLDER call (#2) — #3 must still win.
    await h.act(async () => {
      d3.resolve({ n: 3 });
    });
    await h.settle();
    await h.act(async () => {
      d2.resolve({ n: 2 });
    });
    await h.settle();
    assert.deepEqual(h.current.data, { n: 3 }, "the last-started reload must win regardless of resolution order");
    d1.resolve({ n: 1 }); // tidy up the still-pending mount call
  } finally {
    await h.unmount();
  }
});
