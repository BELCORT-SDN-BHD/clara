// #650 — the Work attention band's own data/state machine, and the two durations it lives by.
//
// THE THING THIS FILE EXISTS TO CATCH is the regression the ticket itself names: the client
// Documents workbench stays "running" until a reload, because nothing re-reads. A board whose
// whole subject is "what is running right now" has the same defect unless the visible-return
// re-read and the while-visible interval are actually wired — and a timer is exactly the kind of
// wiring that looks present in a diff and does nothing at runtime. So every cell here drives a
// STUBBED `setInterval`/`setTimeout` and counts reads.
//
// AND THE ONE DURATION THAT IS NOT THIS FILE'S. The 60-second "update delayed" rule belongs to
// `lib/work/use-work-detail.ts` (C77.12: "one contract, one owner, extended by REFERENCE rather
// than copied"). The last cell reads this module's source and refuses a second `60_000`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderHook } from "../../test/hookHarness";
import { UNKNOWN_FACET, type ClientWorkPack } from "./client-work-pack";
import { CLIENT_WORK_PACK_REFRESH_MS, useClientWorkPack } from "./use-client-work-pack";
import { WORK_STALE_AFTER_MS } from "./use-work-detail";
import { DoorRefusal } from "@/lib/doors";

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function packWith(count: number, computedAt = "2026-09-16T02:00:00.000Z"): ClientWorkPack {
  return {
    computedAt,
    previewLimit: 5,
    window: { from: null, to: null, fromDate: "2026-09-10", toDate: "2026-09-16", timezone: "Asia/Kuala_Lumpur", days: 7 },
    active: { status: "ok", count, coverage: "ok", coverageReason: null, uncountedCompletions: null, rows: [] },
    recentSuccess: { status: "ok", count: 0, coverage: "ok", coverageReason: null, uncountedCompletions: null, rows: [] },
    needsYouSource: "list_review_queue.counts.work_questions",
  };
}

type Harness = Awaited<ReturnType<typeof renderHook>>;
async function settle(h: Harness, times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) await h.settle();
}

/** Stub the two timer globals and `document.visibilityState`, hand the cell the interval's own
 *  callback, and restore everything afterwards. */
async function withTimers(
  run: (ctx: {
    tick: () => Promise<void>;
    setVisibility: (v: "visible" | "hidden") => void;
    fireVisibilityChange: () => void;
    fireFocus: () => void;
    intervals: number[];
    cleared: unknown[];
  }) => Promise<void>,
): Promise<void> {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const ticks: (() => void)[] = [];
  const intervals: number[] = [];
  const cleared: unknown[] = [];
  let visibility: "visible" | "hidden" = "visible";
  const listeners = new Map<string, Set<() => void>>();

  globalThis.setInterval = ((cb: TimerHandler, ms?: number) => {
    ticks.push(cb as () => void);
    intervals.push(ms ?? 0);
    return (90 + ticks.length) as never;
  }) as typeof setInterval;
  globalThis.clearInterval = ((id: unknown) => { cleared.push(id); }) as typeof clearInterval;

  const doc = globalThis.document as unknown as Record<string, unknown>;
  const win = globalThis.window as unknown as Record<string, unknown>;
  const savedDoc = { vis: doc.visibilityState, add: doc.addEventListener, remove: doc.removeEventListener };
  const savedWin = { add: win?.addEventListener, remove: win?.removeEventListener };
  const add = (type: string, cb: () => void) => {
    const set = listeners.get(type) ?? new Set<() => void>();
    set.add(cb);
    listeners.set(type, set);
  };
  const remove = (type: string, cb: () => void) => { listeners.get(type)?.delete(cb); };
  Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => visibility });
  doc.addEventListener = add;
  doc.removeEventListener = remove;
  if (win) { win.addEventListener = add; win.removeEventListener = remove; }

  const fire = (type: string) => { for (const cb of listeners.get(type) ?? []) cb(); };

  try {
    await run({
      tick: async () => { for (const cb of ticks) cb(); },
      setVisibility: (v) => { visibility = v; },
      fireVisibilityChange: () => fire("visibilitychange"),
      fireFocus: () => fire("focus"),
      intervals,
      cleared,
    });
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    Object.defineProperty(doc, "visibilityState", { configurable: true, value: savedDoc.vis, writable: true });
    doc.addEventListener = savedDoc.add;
    doc.removeEventListener = savedDoc.remove;
    if (win) { win.addEventListener = savedWin.add; win.removeEventListener = savedWin.remove; }
  }
}

// ===========================================================================================

test("the first read lands, and the band holds the pack with its own read instant", async () => {
  await withTimers(async () => {
    let reads = 0;
    const h = await renderHook(() => useClientWorkPack({
      clientId: CLIENT,
      load: async () => { reads += 1; return packWith(3); },
      now: () => 1_000,
    }));
    try {
      await settle(h);
      assert.equal(reads, 1);
      assert.equal(h.current.loading, false);
      assert.equal(h.current.pack.active.count, 3);
      assert.equal(h.current.readAt, 1_000);
      assert.equal(h.current.delayed, false);
      assert.equal(h.current.denied, null);
    } finally { await h.unmount(); }
  });
});

test("before the first read lands, both facets are UNKNOWN — never a zero board", async () => {
  await withTimers(async () => {
    const gate: { release: ((p: ClientWorkPack) => void) | null } = { release: null };
    const h = await renderHook(() => useClientWorkPack({
      clientId: CLIENT,
      load: () => new Promise<ClientWorkPack>((resolve) => { gate.release = resolve; }),
    }));
    try {
      await h.settle();
      assert.equal(h.current.loading, true);
      assert.deepEqual(h.current.pack.active, UNKNOWN_FACET);
      assert.deepEqual(h.current.pack.recentSuccess, UNKNOWN_FACET);
      assert.equal(h.current.pack.active.count, null, "an unread facet has no number, not 0");
      gate.release?.(packWith(0));
      await settle(h);
      assert.equal(h.current.pack.active.count, 0, "and a read ZERO is a real zero");
      assert.equal(h.current.pack.active.status, "ok");
    } finally { await h.unmount(); }
  });
});

test("the WHILE-VISIBLE interval re-reads at 30 s, and a HIDDEN tab does not", async () => {
  await withTimers(async (ctx) => {
    let reads = 0;
    const h = await renderHook(() => useClientWorkPack({
      clientId: CLIENT,
      load: async () => { reads += 1; return packWith(reads); },
    }));
    try {
      await settle(h);
      assert.equal(reads, 1, "the mount read");
      assert.ok(ctx.intervals.includes(CLIENT_WORK_PACK_REFRESH_MS),
        `an interval at ${CLIENT_WORK_PACK_REFRESH_MS}ms must be armed; saw ${ctx.intervals.join(", ")}`);
      assert.equal(CLIENT_WORK_PACK_REFRESH_MS, 30_000);

      await ctx.tick();
      await settle(h);
      assert.equal(reads, 2, "a visible tab re-reads on the tick");
      assert.equal(h.current.pack.active.count, 2);

      ctx.setVisibility("hidden");
      await ctx.tick();
      await ctx.tick();
      await settle(h);
      assert.equal(reads, 2, "a hidden tab issues nothing — the browser throttles it anyway, and a "
        + "board nobody is looking at must not cost a read a minute");

      ctx.setVisibility("visible");
      await ctx.tick();
      await settle(h);
      assert.equal(reads, 3);
    } finally { await h.unmount(); }
  });
});

test("a RETURN to the tab re-reads immediately, without waiting for the tick", async () => {
  await withTimers(async (ctx) => {
    let reads = 0;
    const h = await renderHook(() => useClientWorkPack({
      clientId: CLIENT,
      load: async () => { reads += 1; return packWith(reads); },
    }));
    try {
      await settle(h);
      assert.equal(reads, 1);

      ctx.setVisibility("hidden");
      ctx.fireVisibilityChange();
      await settle(h);
      assert.equal(reads, 1, "going away is not a reason to read");

      ctx.setVisibility("visible");
      ctx.fireVisibilityChange();
      await settle(h);
      assert.equal(reads, 2, "coming back is");

      ctx.fireFocus();
      await settle(h);
      assert.equal(reads, 3, "and so is regaining focus — the live permission check");
    } finally { await h.unmount(); }
  });
});

test("60 s with no successful read sets `delayed`, from the IMPORTED duration", async () => {
  await withTimers(async (ctx) => {
    let clock = 1_000;
    let ok = true;
    const h = await renderHook(() => useClientWorkPack({
      clientId: CLIENT,
      load: async () => {
        if (!ok) throw new Error("network");
        return packWith(4);
      },
      now: () => clock,
    }));
    try {
      await settle(h);
      assert.equal(h.current.readAt, 1_000);
      assert.equal(h.current.delayed, false);

      ok = false;
      clock = 1_000 + WORK_STALE_AFTER_MS - 1;
      await ctx.tick();
      await settle(h);
      assert.equal(h.current.delayed, false, "one millisecond short of the rule is not delayed");

      clock = 1_000 + WORK_STALE_AFTER_MS;
      await ctx.tick();
      await settle(h);
      assert.equal(h.current.delayed, true);
      assert.equal(h.current.readAt, 1_000, "the DATED value is still the last successful read");
      assert.equal(WORK_STALE_AFTER_MS, 60_000, "the estate's one delay contract");
    } finally { await h.unmount(); }
  });
});

test("a TRANSIENT failure keeps the dated values and says so; the next success clears it", async () => {
  await withTimers(async (ctx) => {
    let clock = 1_000;
    let ok = true;
    const h = await renderHook(() => useClientWorkPack({
      clientId: CLIENT,
      load: async () => {
        if (!ok) throw new Error("network");
        return packWith(7);
      },
      now: () => clock,
    }));
    try {
      await settle(h);
      ok = false;
      clock = 5_000;
      await ctx.tick();
      await settle(h);
      assert.ok(h.current.staleError, "the failure is surfaced");
      assert.equal(h.current.denied, null, "a transport failure is not a permission loss");
      assert.equal(h.current.pack.active.count, 7, "the last good numbers stay on screen, dated");
      assert.equal(h.current.readAt, 1_000);
      assert.equal(h.current.failedFirstRead, false);

      ok = true;
      clock = 9_000;
      await ctx.tick();
      await settle(h);
      assert.equal(h.current.staleError, null);
      assert.equal(h.current.readAt, 9_000);
      assert.equal(h.current.delayed, false);
    } finally { await h.unmount(); }
  });
});

test("a FIRST read that fails is `failedFirstRead`, not `stale` and not `empty`", async () => {
  await withTimers(async () => {
    const h = await renderHook(() => useClientWorkPack({
      clientId: CLIENT,
      load: async () => { throw new Error("boom"); },
    }));
    try {
      await settle(h);
      assert.equal(h.current.failedFirstRead, true);
      assert.equal(h.current.pack.active.count, null, "there is no prior page to call stale, and no zero to claim");
      assert.equal(h.current.readAt, null);
    } finally { await h.unmount(); }
  });
});

test("a DENIED read clears the values and is told apart from a failure", async () => {
  await withTimers(async (ctx) => {
    let clock = 1_000;
    let deny = false;
    const h = await renderHook(() => useClientWorkPack({
      clientId: CLIENT,
      load: async () => {
        if (deny) {
          throw new DoorRefusal("CLR04", "insufficient role",
            { reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate" });
        }
        return packWith(6);
      },
      now: () => clock,
    }));
    try {
      await settle(h);
      assert.equal(h.current.pack.active.count, 6);

      deny = true;
      clock = 4_000;
      await ctx.tick();
      await settle(h);
      assert.ok(h.current.denied, "the refusal is held as a denial");
      assert.equal(h.current.staleError, null, "and NOT as a transient failure");
      assert.equal(h.current.pack.active.status, "denied");
      assert.equal(h.current.pack.recentSuccess.status, "denied");
      assert.equal(h.current.pack.active.count, null, "denied targets never leak stale accounting data");
      assert.equal(h.current.readAt, null, "and the read instant goes with them");
      assert.equal(h.current.delayed, false, "a denial is not a slow connection");
    } finally { await h.unmount(); }
  });
});

test("a NEW CLIENT clears every value before the next read lands", async () => {
  await withTimers(async () => {
    const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    let current = CLIENT;
    const gate: { release: ((p: ClientWorkPack) => void) | null } = { release: null };
    const h = await renderHook(() => useClientWorkPack({
      clientId: current,
      load: async (id: string) => {
        if (id === CLIENT) return packWith(9);
        return new Promise<ClientWorkPack>((resolve) => { gate.release = resolve; });
      },
    }));
    try {
      await settle(h);
      assert.equal(h.current.pack.active.count, 9);
      current = other;
      await h.rerender();
      await h.settle();
      assert.equal(h.current.pack.active.count, null,
        "the previous client's numbers must not stand under another client's name for one frame");
      assert.equal(h.current.loading, true);
      gate.release?.(packWith(2));
      await settle(h);
      assert.equal(h.current.pack.active.count, 2);
    } finally { await h.unmount(); }
  });
});

test("C77.12 — the 60-second rule is IMPORTED, not restated", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "use-client-work-pack.ts"), "utf8");
  assert.match(source, /WORK_STALE_AFTER_MS/, "the delay is the detail page's contract, by reference");
  assert.match(source, /from "\.\/use-work-detail"/);
  assert.doesNotMatch(source, /60_000|60000/,
    "a second spelling of the 60-second rule is exactly the duplicated duration C77.12 asks not to exist");
  // The 30-second interval IS a second duration, and it is declared here WITH its argument —
  // the distinguishing fact C77.12's owner file leaves room for.
  assert.match(source, /CLIENT_WORK_PACK_REFRESH_MS\s*=\s*30_000/);
  assert.match(source, /C77\.12/, "and the argument is written in the file, not in a review comment");
});
