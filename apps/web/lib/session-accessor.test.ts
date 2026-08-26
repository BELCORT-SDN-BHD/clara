// Round-2 finding R2: a card mounting BEFORE `configureSessionTokenSource` runs
// must NOT strand — the pre-fix behavior left `err: "no live session"` PERMANENT,
// because `useHydratedPart`'s mount effect keys on `hasSession` (the singleton is
// always present, so that never re-fires) and the accessor used to resolve `null`
// immediately when unconfigured. `getAccessToken()` now AWAITS configuration (a
// deferred, bounded by a configurable timeout) instead, so the SAME initial
// reload just stays parked and completes once configuration lands — no re-fire
// needed. Mounted via ../test/hookHarness (real react-dom/client, no jsdom) — the
// property under test is what happens OVER TIME, which renderToStaticMarkup can't
// observe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../test/hookHarness";
import { useHydratedPart } from "./parts/hooks";
import {
  sessionTokenAccessor,
  configureSessionTokenSource,
  resetSessionTokenSource,
  getConfigTimeoutMs,
  setConfigTimeoutForTests,
} from "./session-accessor";
import { WireError } from "./wire";
import type { SessionTokenAccessor } from "./session-contract";

test("a card mounting BEFORE configuration still hydrates once configureSessionTokenSource lands — no re-mount, no hasSession re-fire needed", async () => {
  resetSessionTokenSource();
  let calls = 0;
  const loader = async (sess: SessionTokenAccessor) => {
    const token = await sess.getAccessToken();
    calls += 1;
    return { token, seen: calls };
  };
  const h = await renderHook(() => useHydratedPart(sessionTokenAccessor, loader));
  try {
    // The mount reload has started and is genuinely parked inside
    // getAccessToken()'s deferred wait — `loading` truthfully reflects that, this
    // is not a hang.
    await h.settle();
    assert.equal(h.current.loading, true, "still waiting on configuration");
    assert.equal(h.current.data, null);
    assert.equal(h.current.err, null, "waiting is not itself an error");

    configureSessionTokenSource(async () => "tok-123");
    await h.settle();
    await h.settle();

    assert.equal(h.current.loading, false);
    assert.deepEqual(h.current.data, { token: "tok-123", seen: 1 }, "the SAME initial reload call completed once configuration landed");
    assert.equal(h.current.err, null);
  } finally {
    await h.unmount();
    resetSessionTokenSource();
  }
});

test(
  "NEVER configured — getAccessToken times out to null, surfacing a visible 'no live session' error, never a hang",
  { timeout: 5000 },
  async () => {
    resetSessionTokenSource();
    const original = getConfigTimeoutMs();
    setConfigTimeoutForTests(50); // shrink for the test — production default (5000ms) is untouched
    try {
      const loader = async (sess: SessionTokenAccessor) => {
        const token = await sess.getAccessToken();
        if (!token) throw new WireError("no live session", { status: null });
        return { token };
      };
      const h = await renderHook(() => useHydratedPart(sessionTokenAccessor, loader));
      try {
        await h.act(async () => {
          await new Promise((r) => setTimeout(r, 150)); // comfortably past the shrunk 50ms timeout
        });
        assert.equal(h.current.loading, false, "must resolve — never hang");
        assert.equal(h.current.data, null);
        assert.equal(h.current.err, "no live session", "a truly-unconfigured app fails VISIBLY, not silently or by hanging");
      } finally {
        await h.unmount();
      }
    } finally {
      setConfigTimeoutForTests(original);
      resetSessionTokenSource();
    }
  },
);

test("getAccessToken resolves IMMEDIATELY (no wait) once already configured — the deferred is a one-time cost, not a per-call tax", async () => {
  resetSessionTokenSource();
  try {
    configureSessionTokenSource(async () => "tok-456");
    const start = Date.now();
    const token = await sessionTokenAccessor.getAccessToken();
    const elapsed = Date.now() - start;
    assert.equal(token, "tok-456");
    assert.ok(elapsed < 200, `an already-configured accessor must resolve fast, took ${elapsed}ms`);
  } finally {
    resetSessionTokenSource();
  }
});
