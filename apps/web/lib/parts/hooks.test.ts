// useHydratedPart — the hydrate-never-trust controller hook (contract §3.2,
// cardHooks.ts's useCard precedent). Mounted for real via ../../test/hookHarness
// (the dashboard's useInterviewRun.test.ts idiom): the property under test is
// WHAT HAPPENS OVER TIME (an effect fires reload on mount; act() re-reloads), which
// a single renderToStaticMarkup pass cannot observe.
//
// The session accessor is ALWAYS hoisted to one const per test, outside the
// render callback, and passed the SAME reference on every render — the same
// "loader/session must be a stable identity across renders, or the effect
// re-fires" discipline hooks.ts's own header names for the loader. Passing a
// freshly-constructed accessor inside the render callback would re-trigger the
// mount effect on every render (an infinite loop), which is a test-authoring
// hazard this comment exists to head off, not a defect in the hook itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useHydratedPart } from "./hooks";
import { RefusalError, WireError } from "../wire";
import type { SessionTokenAccessor } from "../session-contract";

function session(token: string | null = "tok"): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

test("reload fires once on mount and populates data", async () => {
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { seen: calls };
  };
  const sess = session();
  const h = await renderHook(() => useHydratedPart(sess, loader));
  try {
    await h.settle();
    assert.equal(calls, 1, "the loader must fire exactly once on mount");
    assert.deepEqual(h.current.data, { seen: 1 });
    assert.equal(h.current.loading, false);
    assert.equal(h.current.err, null);
  } finally {
    await h.unmount();
  }
});

test("session === null: reload never fires (no session yet, not an error)", async () => {
  let calls = 0;
  const loader = async () => { calls += 1; return { seen: calls }; };
  const h = await renderHook(() => useHydratedPart(null, loader));
  try {
    await h.settle();
    assert.equal(calls, 0, "no session must short-circuit before the loader ever runs");
    assert.equal(h.current.data, null);
    assert.equal(h.current.err, null);
  } finally {
    await h.unmount();
  }
});

// THE NO-OPTIMISTIC-UI LAW: act() must never write its own idea of the result —
// only a FRESH reload's own return value may ever become `data`. Proven by making
// the loader's return value depend on how many times it has ACTUALLY been called,
// so `data` after act() can only be right if a second real reload happened.
test("act() re-reloads after a successful mutation — never applies an optimistic value", async () => {
  let calls = 0;
  const loader = async () => { calls += 1; return { generation: calls }; };
  const sess = session();
  const h = await renderHook(() => useHydratedPart(sess, loader));
  try {
    await h.settle();
    assert.deepEqual(h.current.data, { generation: 1 }, "first mount reload");
    await h.act(async () => {
      await h.current.act(async () => {
        /* the mutation itself — deliberately does not touch component state */
      });
    });
    assert.equal(calls, 2, "act() must trigger a SECOND real loader call, not reuse the first");
    assert.deepEqual(h.current.data, { generation: 2 }, "data comes from the fresh reload, never from the action's own local idea of the result");
  } finally {
    await h.unmount();
  }
});

// Ported behavior, verified against the source (cardHooks.ts:37/54 both
// unconditionally `setErr(null)` on a SUCCESSFUL reload): the freshest real read
// always wins, even over an error `act()` just surfaced — reload() runs again
// after a failed act() specifically so a read that still succeeds (the write
// failed, but the row is fine) does not leave a stale error banner up forever.
// A caller that needs the failure message to persist visibly through a
// SUCCEEDING follow-up read must capture it locally in its own `onOk`-adjacent
// handling — this hook's `err` field always reflects the LATEST reload/act
// outcome, never a cached one.
test("act() re-reloads after a FAILED mutation too — the DB may have partially applied — and a follow-up reload that SUCCEEDS clears the error (the freshest read always wins)", async () => {
  let calls = 0;
  const loader = async () => { calls += 1; return { generation: calls }; };
  const sess = session();
  const h = await renderHook(() => useHydratedPart(sess, loader));
  try {
    await h.settle();
    await h.act(async () => {
      await h.current.act(async () => {
        throw new Error("the governed write refused");
      });
    });
    assert.equal(calls, 2, "a failed act() must still trigger a REAL second reload — the DB may have partially applied");
    assert.deepEqual(h.current.data, { generation: 2 }, "data still comes from the fresh reload, never fabricated from the failure");
    assert.equal(h.current.err, null, "a follow-up reload that itself succeeds clears the transient action error — the latest real read is authoritative");
  } finally {
    await h.unmount();
  }
});

// The counterpart: when the follow-up reload ALSO fails, the error left standing
// is the reload's own (the last write to `err`), not a stale copy of the action's.
test("act() re-reloads after a FAILED mutation, and when the reload ALSO fails, the error reflects that final reload", async () => {
  let calls = 0;
  const loader = async () => {
    calls += 1;
    if (calls === 1) return { generation: 1 }; // mount succeeds
    throw new WireError("reload also unreachable", { status: null });
  };
  const sess = session();
  const h = await renderHook(() => useHydratedPart(sess, loader));
  try {
    await h.settle();
    await h.act(async () => {
      await h.current.act(async () => {
        throw new Error("the governed write refused");
      });
    });
    assert.equal(calls, 2, "the follow-up reload must still be attempted even though it too fails");
    assert.deepEqual(h.current.data, { generation: 1 }, "a failed reload never clears/replaces the last KNOWN-GOOD data — no optimistic or blank overwrite");
    assert.equal(h.current.err, "reload also unreachable", "the LAST thing that touched err is the reload's own failure, not the action's");
  } finally {
    await h.unmount();
  }
});

test("a RefusalError from the loader sets clr with code+reason; a plain WireError leaves clr null", async () => {
  const refusing = async () => {
    throw new RefusalError("CLR21", "CLR21: amounts do not match.", { reason: "amount_conflict", status: 400 });
  };
  const sess1 = session();
  const h1 = await renderHook(() => useHydratedPart(sess1, refusing));
  try {
    await h1.settle();
    assert.equal(h1.current.err, "CLR21: amounts do not match.");
    assert.deepEqual(h1.current.clr, { code: "CLR21", reason: "amount_conflict" });
  } finally {
    await h1.unmount();
  }

  const failing = async () => {
    throw new WireError("network unreachable", { status: null });
  };
  const sess2 = session();
  const h2 = await renderHook(() => useHydratedPart(sess2, failing));
  try {
    await h2.settle();
    assert.equal(h2.current.err, "network unreachable");
    assert.equal(h2.current.clr, null, "an ungoverned wire failure must never carry a CLR badge");
  } finally {
    await h2.unmount();
  }
});
