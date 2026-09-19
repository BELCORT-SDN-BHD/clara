// #659 — Firm Home's refresh contract, and the thing this file exists to catch: a timer and two
// listeners are exactly the kind of wiring that looks present in a diff and does nothing at
// runtime. Every cell here drives a STUBBED `setInterval` and a stubbed listener registry and
// COUNTS reads, so "the board re-reads when you come back to the tab" is a measurement.
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
import { DoorRefusal } from "@/lib/doors";
import { WORK_STALE_AFTER_MS } from "@/lib/work/use-work-detail";
import { CLIENT_RECORD_CHANGED_EVENT } from "@/lib/command/bus";
import { EMPTY_PORTFOLIO_PACK, type PortfolioPack } from "./portfolio-pack";
import { FIRM_PORTFOLIO_REFRESH_MS, useFirmPortfolio } from "./use-firm-portfolio";

function packWith(rows: number, computedAt = "2026-09-19T02:00:00.000Z"): PortfolioPack {
  return {
    ...EMPTY_PORTFOLIO_PACK,
    computedAt,
    previewLimit: 3,
    pageLimit: 50,
    rows: Array.from({ length: rows }, (_, i) => ({
      client_id: `c${i}`,
      name: `Client ${i}`,
      status: "active",
      active: i + 1,
      attentionFailed: 0,
      failed: 0,
      refused: 0,
      recentSuccess: 0,
      uncountedCompletions: 0,
      coverage: "ok" as const,
      coverageReason: null,
      preview: [],
    })),
  };
}

type Harness = Awaited<ReturnType<typeof renderHook>>;
async function settle(h: Harness, times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) await h.settle();
}

/** Stub the timer globals, `document.visibilityState` and BOTH listener registries, then hand the
 *  cell the interval's own callback and a way to fire each event. `fire` passes a real-shaped
 *  event object because `onClientRecordChanged` reads `event.detail`. */
async function withTimers(
  run: (ctx: {
    tick: () => Promise<void>;
    setVisibility: (v: "visible" | "hidden") => void;
    fireVisibilityChange: () => void;
    fireFocus: () => void;
    fireClientRecordChanged: (clientId: string) => void;
    intervals: number[];
  }) => Promise<void>,
): Promise<void> {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const ticks: (() => void)[] = [];
  const intervals: number[] = [];
  let visibility: "visible" | "hidden" = "visible";
  const listeners = new Map<string, Set<(evt?: unknown) => void>>();

  globalThis.setInterval = ((cb: TimerHandler, ms?: number) => {
    ticks.push(cb as () => void);
    intervals.push(ms ?? 0);
    return (90 + ticks.length) as never;
  }) as typeof setInterval;
  globalThis.clearInterval = (() => {}) as typeof clearInterval;

  const doc = globalThis.document as unknown as Record<string, unknown>;
  const win = globalThis.window as unknown as Record<string, unknown>;
  const savedDoc = { vis: doc.visibilityState, add: doc.addEventListener, remove: doc.removeEventListener };
  const savedWin = { add: win?.addEventListener, remove: win?.removeEventListener };
  const add = (type: string, cb: (evt?: unknown) => void) => {
    const set = listeners.get(type) ?? new Set<(evt?: unknown) => void>();
    set.add(cb);
    listeners.set(type, set);
  };
  const remove = (type: string, cb: (evt?: unknown) => void) => { listeners.get(type)?.delete(cb); };
  Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => visibility });
  doc.addEventListener = add;
  doc.removeEventListener = remove;
  if (win) { win.addEventListener = add; win.removeEventListener = remove; }

  const fire = (type: string, evt?: unknown) => { for (const cb of listeners.get(type) ?? []) cb(evt); };

  try {
    await run({
      tick: async () => { for (const cb of ticks) cb(); },
      setVisibility: (v) => { visibility = v; },
      fireVisibilityChange: () => fire("visibilitychange"),
      fireFocus: () => fire("focus"),
      fireClientRecordChanged: (clientId) =>
        fire(CLIENT_RECORD_CHANGED_EVENT, { detail: { clientId } }),
      intervals,
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

test("the first read lands, and the board holds the pack with its own read instant", async () => {
  await withTimers(async ({ intervals }) => {
    let reads = 0;
    const h = await renderHook(() => useFirmPortfolio({
      load: async () => { reads += 1; return packWith(2); },
      now: () => 1_000,
    }));
    try {
      await settle(h);
      assert.equal(reads, 1);
      assert.equal(h.current.loading, false);
      assert.equal(h.current.pack.rows.length, 2);
      assert.equal(h.current.readAt, 1_000);
      assert.equal(h.current.delayed, false);
      assert.deepEqual(intervals, [FIRM_PORTFOLIO_REFRESH_MS],
        "exactly one interval, at the while-visible cadence");
    } finally { await h.unmount(); }
  });
});

test("focus, visibilitychange, the 30 s tick and CLIENT_RECORD_CHANGED each trigger EXACTLY ONE re-read", async () => {
  await withTimers(async ({ tick, fireFocus, fireVisibilityChange, fireClientRecordChanged }) => {
    let reads = 0;
    const h = await renderHook(() => useFirmPortfolio({
      load: async () => { reads += 1; return packWith(1); },
      now: () => 1_000,
    }));
    try {
      await settle(h);
      assert.equal(reads, 1, "the mount read");

      await h.act(() => { fireFocus(); });
      await settle(h);
      assert.equal(reads, 2, "a return to the tab is a reason to ask again — and is the live permission check");

      await h.act(() => { fireVisibilityChange(); });
      await settle(h);
      assert.equal(reads, 3);

      await h.act(async () => { await tick(); });
      await settle(h);
      assert.equal(reads, 4, "the while-visible compensation for an event this estate never emits");

      await h.act(() => { fireClientRecordChanged("c1"); });
      await settle(h);
      assert.equal(reads, 5, "a firm that just gained its first client must not keep saying it has none");
    } finally { await h.unmount(); }
  });
});

test("a HIDDEN tab costs nothing — the tick does not read, but the staleness clock still runs", async () => {
  await withTimers(async ({ tick, setVisibility, fireFocus }) => {
    let reads = 0;
    let clock = 1_000;
    const h = await renderHook(() => useFirmPortfolio({
      load: async () => { reads += 1; return packWith(1); },
      now: () => clock,
    }));
    try {
      await settle(h);
      assert.equal(reads, 1);

      setVisibility("hidden");
      clock = 1_000 + WORK_STALE_AFTER_MS;
      await h.act(async () => { await tick(); });
      await settle(h);
      assert.equal(reads, 1, "a board nobody is looking at must not cost a request every thirty seconds");
      assert.equal(h.current.delayed, true,
        "but 'this connection is delayed' is a true statement about a hidden tab too");

      // …and a focus event while still hidden is also ignored, for the same reason.
      await h.act(() => { fireFocus(); });
      await settle(h);
      assert.equal(reads, 1);
    } finally { await h.unmount(); }
  });
});

test("at WORK_STALE_AFTER_MS the delayed face appears AND the dated numbers stay", async () => {
  await withTimers(async ({ tick }) => {
    let clock = 1_000;
    let reads = 0;
    const h = await renderHook(() => useFirmPortfolio({
      load: async () => {
        reads += 1;
        if (reads === 1) return packWith(3);
        throw new Error("network down");
      },
      now: () => clock,
    }));
    try {
      await settle(h);
      assert.equal(h.current.pack.rows.length, 3);

      clock = 1_000 + WORK_STALE_AFTER_MS;
      await h.act(async () => { await tick(); });
      await settle(h);
      assert.equal(h.current.delayed, true, "past a minute the board says so instead of looking live");
      assert.equal(h.current.pack.rows.length, 3, "and the last good numbers are STILL on screen");
      assert.equal(h.current.readAt, 1_000, "dated by when they were actually read");
      assert.ok(h.current.staleError, "with the failure standing beside them");
    } finally { await h.unmount(); }
  });
});

test("A DENIAL CLEARS THE NUMBERS; A TRANSPORT FAILURE KEEPS THEM, DATED", async () => {
  await withTimers(async ({ fireFocus }) => {
    let mode: "ok" | "fail" | "denied" = "ok";
    const h = await renderHook(() => useFirmPortfolio({
      load: async () => {
        if (mode === "ok") return packWith(2);
        if (mode === "fail") throw new Error("transport");
        throw new DoorRefusal("CLR04", "insufficient role",
          { reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate" });
      },
      now: () => 5_000,
    }));
    try {
      await settle(h);
      assert.equal(h.current.pack.rows.length, 2);

      mode = "fail";
      await h.act(() => { fireFocus(); });
      await settle(h);
      assert.equal(h.current.pack.rows.length, 2, "a failure keeps what was last known");
      assert.equal(h.current.readAt, 5_000, "dated");
      assert.equal(h.current.denied, null);

      mode = "denied";
      await h.act(() => { fireFocus(); });
      await settle(h);
      assert.equal(h.current.pack.rows.length, 0,
        "a permission loss CLEARS them — denied targets never leave stale accounting data on screen");
      assert.equal(h.current.readAt, null);
      assert.ok(h.current.denied);
      assert.equal(h.current.staleError, null, "and a denial is not reported as a failure");
    } finally { await h.unmount(); }
  });
});

test("a FIRST read that fails is failedFirstRead — a state the board renders differently from a stale one", async () => {
  await withTimers(async () => {
    const h = await renderHook(() => useFirmPortfolio({
      load: async () => { throw new Error("down"); },
      now: () => 1,
    }));
    try {
      await settle(h);
      assert.equal(h.current.failedFirstRead, true);
      assert.equal(h.current.readAt, null, "nothing has ever been read, so there is no date to show");
      assert.equal(h.current.pack.rows.length, 0);
    } finally { await h.unmount(); }
  });
});

test("the neighbouring review-queue read is refreshed after EVERY one of this hook's reads, including a failed one", async () => {
  await withTimers(async ({ fireFocus }) => {
    let refreshes = 0;
    let ok = true;
    const h = await renderHook(() => useFirmPortfolio({
      load: async () => { if (!ok) throw new Error("down"); return packWith(1); },
      onRefresh: () => { refreshes += 1; },
      now: () => 1,
    }));
    try {
      await settle(h);
      assert.equal(refreshes, 1, "the chips above the table are never older than the table");
      ok = false;
      await h.act(() => { fireFocus(); });
      await settle(h);
      assert.equal(refreshes, 2,
        "a board that refreshed half of itself would be worse than one that refreshed neither");
    } finally { await h.unmount(); }
  });
});

test("a NEW PAGE is a new board — the previous page's rows never stand for one frame under another page's address", async () => {
  await withTimers(async () => {
    let cursor: string | null = null;
    let gate: ((p: PortfolioPack) => void) | null = null;
    const release = (p: PortfolioPack) => { (gate as ((x: PortfolioPack) => void) | null)?.(p); };
    const h = await renderHook(() => useFirmPortfolio({
      cursor,
      load: async () => {
        if (cursor === null) return packWith(2);
        return new Promise<PortfolioPack>((resolve) => { gate = resolve; });
      },
      now: () => 1,
    }));
    try {
      await settle(h);
      assert.equal(h.current.pack.rows.length, 2);

      cursor = "cGFnZTI=";
      await h.rerender();
      await h.settle();
      assert.equal(h.current.pack.rows.length, 0, "cleared BEFORE the next read is issued");
      assert.equal(h.current.loading, true);
      release(packWith(5));
      await settle(h);
      assert.equal(h.current.pack.rows.length, 5);
    } finally { await h.unmount(); }
  });
});

test("C77.12 — the 60-second rule is IMPORTED, not restated, and this file's own 30 s interval is declared with its argument", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "use-firm-portfolio.ts"), "utf8");
  assert.match(source, /WORK_STALE_AFTER_MS/, "the delay is the detail page's contract, by reference");
  assert.match(source, /from "@\/lib\/work\/use-work-detail"/);
  assert.doesNotMatch(source, /60_000|60000/,
    "a second spelling of the 60-second rule is exactly the duplicated duration C77.12 asks not to exist");
  assert.match(source, /FIRM_PORTFOLIO_REFRESH_MS\s*=\s*30_000/);
  assert.match(source, /use-review-queue\.ts/,
    "and the reason this hook COMPOSES the shared queue hook rather than editing it is in the file");
});

test("the composing hook does NOT edit use-review-queue.ts — four surfaces share it", () => {
  // A source cell, deliberately: the ruling is about a file this ticket must NOT touch, and the
  // only way to assert a non-edit is to read the file and find no listener in it.
  const shared = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "use-review-queue.ts"), "utf8");
  assert.doesNotMatch(shared, /visibilitychange/,
    "adding the listener there would change three other surfaces' request profile with a cell for none of them");
  assert.doesNotMatch(shared, /addEventListener/);
});

test("fix round 1 (A10): a SUPERSEDED read cannot clear `loading` while the current one is still in flight", async () => {
  // THE FRAME THIS CELL FORBIDS: `pack` empty and `loading` false, with a read outstanding — which
  // `firm-portfolio-section.tsx` renders as the zero-client Empty, "No clients yet", to a firm that
  // has clients. The epoch guard protected the DATA (`if (epoch !== epochRef.current) return`) but
  // the `finally` cleared the busy flags UNCONDITIONALLY, so the slower of two page reads turned
  // the board off on its way out.
  //
  // The shape: turn to a new page (which clears `pack` and re-arms `hasLoadedOnceRef`, so BOTH
  // reads are first-loads), fire a second trigger while it is in flight, then settle them OUT OF
  // ORDER — the older one last.
  await withTimers(async ({ fireFocus }) => {
    let cursor: string | null = null;
    const gates: ((p: PortfolioPack) => void)[] = [];
    const h = await renderHook(() => useFirmPortfolio({
      cursor,
      load: async () => {
        if (cursor === null) return packWith(2);
        return new Promise<PortfolioPack>((resolve) => { gates.push(resolve); });
      },
      now: () => 1,
    }));
    try {
      await settle(h);
      assert.equal(h.current.pack.rows.length, 2);

      cursor = "cGFnZTI=";
      await h.rerender();
      await h.settle();
      assert.equal(h.current.loading, true, "the page turn cleared the rows and put the board on the skeleton");
      assert.equal(h.current.pack.rows.length, 0);

      // A second trigger lands mid-flight: a return to the tab, the 30 s tick, or a client record
      // change. Now TWO reads are outstanding and the first one is already superseded.
      await h.act(() => { fireFocus(); });
      await h.settle();
      assert.equal(gates.length, 2, "two reads are in flight");

      // The OLDER read settles first. It must contribute nothing at all — not its rows, and not
      // the end of the board's busy state.
      await h.act(async () => { gates[0](packWith(9)); });
      await settle(h);
      assert.equal(h.current.pack.rows.length, 0, "the superseded read's DATA is dropped (this already held)");
      assert.equal(h.current.loading, true,
        "and the board stays on the skeleton: an empty pack with loading=false is the 'No clients yet' Empty");

      // The current read settles and the board is whole.
      await h.act(async () => { gates[1](packWith(5)); });
      await settle(h);
      assert.equal(h.current.loading, false);
      assert.equal(h.current.pack.rows.length, 5);
    } finally { await h.unmount(); }
  });
});
