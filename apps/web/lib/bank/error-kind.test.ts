// lib/bank/error-kind.ts — the useReadErrKind observer. Mounted for real via
// test/hookHarness.ts (the hooks.test.ts precedent) since the property under
// test is a state update happening over time (a rejected promise settling).

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useReadErrKind } from "./error-kind";
import { ReadError } from "../read";
import { DoorError } from "../doors";

test("useReadErrKind: captures kind from a ReadError via instanceof, then re-throws it unchanged", async () => {
  const h = await renderHook(() => useReadErrKind());
  const err = new ReadError("permission denied", { status: 403, kind: "forbidden" });
  let thrown: unknown;
  await h.act(async () => {
    try {
      await h.current.wrap(() => Promise.reject(err));
    } catch (e) {
      thrown = e;
    }
  });
  assert.equal(h.current.kind, "forbidden");
  assert.equal(thrown, err, "the same error instance, never re-wrapped");
  await h.unmount();
});

test("useReadErrKind: captures kind from a DoorError too", async () => {
  const h = await renderHook(() => useReadErrKind());
  const err = new DoorError("no live session", { status: null, kind: "no_session" });
  await h.act(async () => {
    await h.current.wrap(() => Promise.reject(err)).catch(() => {});
  });
  assert.equal(h.current.kind, "no_session");
  await h.unmount();
});

test("useReadErrKind: a non-wire error (or a governed DoorRefusal) resolves kind to null", async () => {
  const h = await renderHook(() => useReadErrKind());
  await h.act(async () => {
    await h.current.wrap(() => Promise.reject(new Error("boom"))).catch(() => {});
  });
  assert.equal(h.current.kind, null);
  await h.unmount();
});

test("useReadErrKind: a successful load clears any prior kind", async () => {
  const h = await renderHook(() => useReadErrKind());
  await h.act(async () => {
    await h.current.wrap(() => Promise.reject(new ReadError("x", { status: 404, kind: "not_found" }))).catch(() => {});
  });
  assert.equal(h.current.kind, "not_found");
  await h.act(async () => {
    await h.current.wrap(() => Promise.resolve("ok"));
  });
  assert.equal(h.current.kind, null);
  await h.unmount();
});
