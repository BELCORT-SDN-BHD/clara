// lib/bank/reload-on-change.ts — the useHydratedPart loader-identity gap
// fix. Mounted for real via test/hookHarness.ts (the hooks.test.ts
// precedent) since the property under test is what happens ACROSS renders.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useReloadOnChange } from "./reload-on-change";

test("useReloadOnChange: does NOT call reload on the initial mount", async () => {
  let calls = 0;
  const h = await renderHook(() => useReloadOnChange(() => { calls += 1; }, "a"));
  await h.settle();
  assert.equal(calls, 0, "the hook's own mount effect already loaded with the initial dep — no duplicate fetch");
  await h.unmount();
});

test("useReloadOnChange: calls reload when dep changes on a later render", async () => {
  let calls = 0;
  let dep = "a";
  const h = await renderHook(() => useReloadOnChange(() => { calls += 1; }, dep));
  await h.settle();
  assert.equal(calls, 0);
  dep = "b";
  await h.rerender();
  assert.equal(calls, 1, "a genuine dep change must trigger exactly one reload");
  await h.unmount();
});

test("useReloadOnChange: a re-render with the SAME dep value does not re-fire", async () => {
  let calls = 0;
  const dep = "a";
  const h = await renderHook(() => useReloadOnChange(() => { calls += 1; }, dep));
  await h.settle();
  await h.rerender();
  await h.rerender();
  assert.equal(calls, 0);
  await h.unmount();
});

test("useReloadOnChange: always calls the LATEST reload closure, never a stale one", async () => {
  const seen: number[] = [];
  let dep = "a";
  let tag = 1;
  const h = await renderHook(() => useReloadOnChange(() => seen.push(tag), dep));
  await h.settle();
  tag = 2;
  await h.rerender(); // same dep, no fire, but tag is now 2 for next time
  dep = "b";
  await h.rerender();
  assert.deepEqual(seen, [2], "the reload invoked on the dep change must be the CURRENT render's closure");
  await h.unmount();
});
