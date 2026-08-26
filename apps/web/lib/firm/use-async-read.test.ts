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

test("act(): success re-reloads and clears any prior error", async () => {
  let n = 0;
  const loader = async () => ({ n: ++n });
  const h = await renderHook(() => useAsyncRead(loader));
  try {
    await h.settle();
    assert.deepEqual(h.current.data, { n: 1 });
    await h.act(() => h.current.act(async () => {}));
    assert.deepEqual(h.current.data, { n: 2 }, "act() must re-read, never assume the write's own result");
    assert.equal(h.current.error, null);
  } finally {
    await h.unmount();
  }
});

test("act(): a failed write's error is STICKY across the follow-up reload it triggers", async () => {
  const loader = async () => ({ ok: true });
  const writeErr = new Error("CLR10: refused");
  const h = await renderHook(() => useAsyncRead(loader));
  try {
    await h.settle();
    await h.act(() => h.current.act(async () => { throw writeErr; }));
    assert.equal(h.current.error, writeErr, "the write's own failure must survive its own successful follow-up reload");
    assert.deepEqual(h.current.data, { ok: true }, "data still re-derives for real despite the sticky error");
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
    await h.act(() => h.current.act(async () => { throw writeErr; }));
    assert.equal(h.current.error, reloadErr);
  } finally {
    await h.unmount();
  }
});
