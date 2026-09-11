// #630 — STOP REPLY, at the hook seam.
//
// THE ACCEPTANCE LINE THIS FILE OWNS: "stopping generation does not cancel already accepted Work,
// and closing the rail does neither." Two of those three claims are checkable here without a
// browser, and they are the two that would be easiest to get wrong by accident:
//
//   1. `stopReply` cancels the CHAT-TURN task and nothing else. The Work a turn started is a
//      separate `clara.agent_tasks` row; `packages/runtime/tests/control-work-cancel.test.mjs`
//      proves the DATABASE has no cascade between them, and this proves the browser does not add
//      one by calling a second door.
//   2. CLOSING THE RAIL DOES NEITHER. Unmounting this hook must call no door and abort nothing —
//      a rail that stopped the reply when it was closed would throw away a turn a person meant to
//      come back to, and one that cancelled Work would be worse.
//
// The third claim (a stopped stream keeps its partial prose with a "Stopped" marker) is a rendered
// property and belongs to the browser walk.

import assert from "node:assert/strict";
import { test } from "node:test";

import { enableDomInspection } from "../../test/domInspect";
import { renderHook } from "../../test/hookHarness";
import { claraThreadStore } from "./threadStore";
import type { SessionTokenAccessor } from "@/lib/session";

enableDomInspection();

const THREAD = "11111111-1111-4111-8111-111111111111";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

/** Every PostgREST RPC the hook's lifetime issues, by verb. The door wrapper builds a real URL, so
 *  swapping `fetch` records the WIRE rather than a mock of our own reader. */
async function withRecordedRpc(run: (seen: string[]) => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  // `pgrestRpc` refuses to build a URL without this, and the refusal is caught by `stopReply` —
  // so without it every cell below would pass by never calling anything. The doors suite's own
  // `withMockedFetch` sets the same variable for the same reason.
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const seen: string[] = [];
  globalThis.fetch = (async (u: unknown) => {
    const url = String(u);
    const rpc = /\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) seen.push(rpc[1]!);
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await run(seen);
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

test("630 stopReply with no live turn is IDLE — it invents no task to cancel", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withRecordedRpc(async (seen) => {
    const h = await renderHook(() => useClaraThread(session, THREAD));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      let answer: string | null = null;
      await h.act(async () => { answer = await h.current.stopReply(); });
      assert.equal(answer, "idle", "there is no turn in flight, so there is nothing to stop");
      assert.equal(seen.includes("cancel_agent_task"), false, "and no door was called");
    } finally {
      await h.unmount();
    }
  });
});

test("630 stopReply cancels the CHAT-TURN task, and calls no second door", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withRecordedRpc(async (seen) => {
    const h = await renderHook(() => useClaraThread(session, THREAD));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      // A live turn, as the store records one.
      claraThreadStore.markAccepted(THREAD, "task-1");
      await h.act(async () => { await h.current.stopReply(); });
      const doors = seen.filter((fn) => fn !== "get_my_preferences");
      assert.deepEqual(
        doors.filter((fn) => fn.includes("cancel") || fn.includes("work")),
        ["cancel_agent_task"],
        "ONE door: the chat turn's. Cancelling Work is a separately named act on a separate row.",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("630 CLOSING THE RAIL does neither — unmounting calls no door at all", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withRecordedRpc(async (seen) => {
    const h = await renderHook(() => useClaraThread(session, THREAD));
    await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    claraThreadStore.markAccepted(THREAD, "task-2");
    const before = seen.length;
    await h.unmount();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(
      seen.slice(before).filter((fn) => fn.includes("cancel")),
      [],
      "closing the rail must not stop the reply and must not cancel Work — a person may come back",
    );
  });
});
