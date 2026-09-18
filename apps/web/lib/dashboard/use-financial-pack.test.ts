// #660 — the money band's data/state machine, and the two things it adds to the Work band's.
//
// THE CELL THAT MATTERS MOST is the PERIOD CHANGE. A period is in the dependency key, so a change
// must CLEAR before it re-reads: if it did not, August's cash would stand for one frame under
// September's label, which is the same class of defect as one client's numbers under another
// client's name — and on a money band it is the expensive one.
//
// AND THE ONE DURATION THAT IS NOT THIS FILE'S. The 60-second "update delayed" rule belongs to
// `lib/work/use-work-detail.ts` (C77.12: one contract, one owner, extended by REFERENCE rather
// than copied). The last cell reads this module's source and refuses a second `60_000`.
//
// Every cell drives a STUBBED `setInterval` and counts reads, for the reason
// `lib/work/use-client-work-pack.test.ts` gives: a timer is exactly the kind of wiring that looks
// present in a diff and does nothing at runtime.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderHook } from "../../test/hookHarness";
import { EMPTY_FINANCIAL_PACK, type ClientFinancialPack } from "./financial-pack";
import { FINANCIAL_PACK_REFRESH_MS, useFinancialPack } from "./use-financial-pack";
import { WORK_STALE_AFTER_MS } from "@/lib/work/use-work-detail";
import { DoorRefusal } from "@/lib/doors";

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function packWith(cashCents: number, month: string | null): ClientFinancialPack {
  const period = { start: "2026-09-01", end: "2026-09-30", asOf: "2026-09-18", timezone: "Asia/Kuala_Lumpur" };
  const group = {
    valueCents: cashCents, status: "ok" as const, unit: "minor_units", currency: "MYR",
    period, computedAt: "2026-09-18T02:00:00.000Z",
    definitionVersion: "clara.client-financial-pack/v1",
    sourceWatermark: "1:1:", coverage: "ok" as const, coverageReason: null,
    comparison: null, composition: [],
  };
  return {
    ...EMPTY_FINANCIAL_PACK,
    computedAt: "2026-09-18T02:00:00.000Z",
    period: { ...period, month: month ?? "2026-09-01", isMtd: month === null },
    cash: group, profit: group, income: group, expense: group,
  };
}

type Harness = Awaited<ReturnType<typeof renderHook>>;
async function settle(h: Harness, times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) await h.settle();
}

/** Stub the timer globals and `document.visibilityState`, hand the cell the interval's own
 *  callback, and restore everything afterwards. (`use-client-work-pack.test.ts`'s own harness.) */
async function withTimers(
  run: (ctx: {
    tick: () => Promise<void>;
    setVisibility: (v: "visible" | "hidden") => void;
    fireFocus: () => void;
    intervals: number[];
  }) => Promise<void>,
): Promise<void> {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const ticks: (() => void)[] = [];
  const intervals: number[] = [];
  let visibility: "visible" | "hidden" = "visible";
  const listeners = new Map<string, Set<() => void>>();

  globalThis.setInterval = ((cb: TimerHandler, ms?: number) => {
    ticks.push(cb as () => void);
    intervals.push(ms ?? 0);
    return (90 + ticks.length) as never;
  }) as typeof setInterval;
  globalThis.clearInterval = (() => undefined) as typeof clearInterval;

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

  try {
    await run({
      tick: async () => { for (const cb of ticks) cb(); },
      setVisibility: (v) => { visibility = v; },
      fireFocus: () => { for (const cb of listeners.get("focus") ?? []) cb(); },
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

test("the first read lands and the band holds the pack with its own read instant", async () => {
  await withTimers(async () => {
    let reads = 0;
    const h = await renderHook(() => useFinancialPack({
      clientId: CLIENT, month: null,
      load: async () => { reads += 1; return packWith(18_234_055, null); },
      now: () => 1_000,
    }));
    try {
      await settle(h);
      assert.equal(reads, 1);
      assert.equal(h.current.loading, false);
      assert.equal(h.current.pack.cash.valueCents, 18_234_055);
      assert.equal(h.current.readAt, 1_000);
      assert.equal(h.current.delayed, false);
      assert.equal(h.current.denied, null);
    } finally { await h.unmount(); }
  });
});

test("before the first read lands every figure is UNKNOWN — never a zero board", async () => {
  await withTimers(async () => {
    const h = await renderHook(() => useFinancialPack({
      clientId: CLIENT, month: null,
      load: () => new Promise(() => {}), // never resolves
      now: () => 1_000,
    }));
    try {
      await h.settle();
      assert.equal(h.current.loading, true);
      for (const key of ["cash", "profit", "income", "expense"] as const) {
        assert.equal(h.current.pack[key].status, "unknown");
        assert.equal(h.current.pack[key].valueCents, null, `${key} must not start at 0`);
      }
    } finally { await h.unmount(); }
  });
});

test("the poll runs every 30 seconds WHILE VISIBLE; a hidden tab skips the READ but still advances the delay clock", async () => {
  await withTimers(async ({ tick, setVisibility, intervals }) => {
    let reads = 0;
    let now = 1_000;
    const h = await renderHook(() => useFinancialPack({
      clientId: CLIENT, month: null,
      load: async () => { reads += 1; return packWith(1, null); },
      now: () => now,
    }));
    try {
      await settle(h);
      assert.equal(reads, 1);
      assert.equal(intervals[0], FINANCIAL_PACK_REFRESH_MS);
      assert.equal(FINANCIAL_PACK_REFRESH_MS, 30_000);

      await tick();
      await settle(h);
      assert.equal(reads, 2, "a visible tab re-reads on the tick");

      // HIDDEN: the read is skipped, and that is the whole point — the heaviest read on this page
      // must not cost a request every thirty seconds for a board nobody is looking at.
      setVisibility("hidden");
      now = 1_000 + WORK_STALE_AFTER_MS + 1;
      await tick();
      await settle(h);
      assert.equal(reads, 2, "a hidden tab does NOT re-read");
      // …but the CLOCK ran: "this connection is delayed" is a true statement about a hidden tab.
      assert.equal(h.current.delayed, true, "the staleness clock must tick regardless of visibility");
    } finally { await h.unmount(); }
  });
});

test("60 seconds with no successful read is DELAYED, and the last success instant is kept", async () => {
  await withTimers(async ({ tick }) => {
    let now = 1_000;
    let fail = false;
    const h = await renderHook(() => useFinancialPack({
      clientId: CLIENT, month: null,
      load: async () => { if (fail) throw new Error("network"); return packWith(500, null); },
      now: () => now,
    }));
    try {
      await settle(h);
      assert.equal(h.current.readAt, 1_000);
      fail = true;
      now = 1_000 + WORK_STALE_AFTER_MS;
      await tick();
      await settle(h);
      assert.equal(h.current.delayed, true);
      assert.equal(h.current.readAt, 1_000, "the last SUCCESSFUL instant is still shown");
      // AND A TRANSPORT FAILURE KEEPS THE DATED VALUES — they were true when they were read.
      assert.equal(h.current.pack.cash.valueCents, 500);
      assert.notEqual(h.current.staleError, null);
      assert.equal(h.current.failedFirstRead, false);
    } finally { await h.unmount(); }
  });
});

test("a DENIAL clears the values AND the read instant — a denied target never keeps dated accounting numbers", async () => {
  await withTimers(async ({ tick }) => {
    let deny = false;
    const h = await renderHook(() => useFinancialPack({
      clientId: CLIENT, month: null,
      load: async () => {
        if (deny) throw new DoorRefusal("CLR04", "insufficient role",
            { reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate" });
        return packWith(9_900, null);
      },
      now: () => 1_000,
    }));
    try {
      await settle(h);
      assert.equal(h.current.pack.cash.valueCents, 9_900);
      deny = true;
      await tick();
      await settle(h);
      for (const key of ["cash", "profit", "income", "expense"] as const) {
        assert.equal(h.current.pack[key].status, "denied");
        assert.equal(h.current.pack[key].valueCents, null, `${key} kept a value after a denial`);
      }
      assert.equal(h.current.readAt, null, "the read instant must clear with the values");
      assert.equal(h.current.staleError, null, "a permission is not a failure");
      assert.notEqual(h.current.denied, null);
    } finally { await h.unmount(); }
  });
});

test("A PERIOD CHANGE CLEARS BEFORE RE-READING — last month's cash never stands under this month's label", async () => {
  await withTimers(async () => {
    const seen: (string | null)[] = [];
    const deferred: { resolve?: (p: ClientFinancialPack) => void } = {};
    // `renderHook`'s probe takes no props, so the period lives in a closure the cell moves and
    // then re-renders — the same shape the P3 loader-stability cells use.
    let month: string | null = null;
    const h = await renderHook(() => useFinancialPack({
      clientId: CLIENT,
      month,
      load: async (_client, m) => {
        seen.push(m);
        if (m === null) return packWith(18_234_055, null);
        return new Promise<ClientFinancialPack>((resolve) => { deferred.resolve = resolve; });
      },
      now: () => 1_000,
    }));
    try {
      await settle(h);
      assert.equal(h.current.pack.cash.valueCents, 18_234_055);

      // Switch to a historic month. Its read has NOT resolved yet.
      month = "2026-03-01";
      await h.rerender();
      await h.settle();
      assert.equal(h.current.loading, true, "a new period is a LOADING arm, not a refresh over stale numbers");
      assert.equal(h.current.pack.cash.valueCents, null,
        "September's cash was still on screen under March's label");
      assert.equal(h.current.pack.cash.status, "unknown");
      assert.equal(h.current.readAt, null);

      deferred.resolve?.(packWith(4_000_000, "2026-03-01"));
      await settle(h);
      assert.equal(h.current.pack.cash.valueCents, 4_000_000);
      assert.deepEqual(seen, [null, "2026-03-01"], "the period reached the loader, not just the key");
    } finally { await h.unmount(); }
  });
});

test("a first-read failure shows NO number at all — there is nothing dated to keep", async () => {
  await withTimers(async () => {
    const h = await renderHook(() => useFinancialPack({
      clientId: CLIENT, month: null,
      load: async () => { throw new Error("network"); },
      now: () => 1_000,
    }));
    try {
      await settle(h);
      assert.equal(h.current.failedFirstRead, true);
      assert.equal(h.current.pack.cash.valueCents, null);
      assert.equal(h.current.readAt, null);
    } finally { await h.unmount(); }
  });
});

test("a return to the tab re-reads — the live permission check, unconditional on what the last read said", async () => {
  await withTimers(async ({ fireFocus, setVisibility }) => {
    let reads = 0;
    const h = await renderHook(() => useFinancialPack({
      clientId: CLIENT, month: null,
      load: async () => { reads += 1; return packWith(1, null); },
      now: () => 1_000,
    }));
    try {
      await settle(h);
      assert.equal(reads, 1);
      fireFocus();
      await settle(h);
      assert.equal(reads, 2);
      setVisibility("hidden");
      fireFocus();
      await settle(h);
      assert.equal(reads, 2, "a focus event on a hidden tab is not a return to it");
    } finally { await h.unmount(); }
  });
});

test("the 60-second rule is IMPORTED, never restated — one contract, one owner (C77.12)", () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "use-financial-pack.ts"), "utf8");
  const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(body, /import \{ WORK_STALE_AFTER_MS \} from "@\/lib\/work\/use-work-detail"/,
    "the staleness duration must come from its one owner");
  assert.equal(/60_000|60000/.test(body), false,
    "a second 60-second literal is exactly the duplication C77.12 forbids");
  // The module DOES own its own refresh cadence, and that one is declared here by name.
  assert.match(body, /FINANCIAL_PACK_REFRESH_MS = 30_000/);
});
