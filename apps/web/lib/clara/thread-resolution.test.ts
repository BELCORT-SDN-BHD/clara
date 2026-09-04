// 裁-117 — the thread RESOLUTION rules, as pure functions. The hook's own side of this
// (no create on mount, create on the act) is driven through the real rail in
// ../../components/clara/thread-menu.test.tsx; these are the decisions underneath it.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SessionRow } from "./api";
import { claraThreadStore } from "./threadStore";
import { ownSessionsForAltitude, resolveOwnThread, selectOwnSession } from "./useActiveThread";

const ME = "11111111-1111-1111-1111-111111111111";
const COLLEAGUE = "22222222-2222-2222-2222-222222222222";

function session(overrides: Partial<SessionRow>): SessionRow {
  return {
    id: "session-own",
    title: null,
    client_id: "client-a",
    visibility: "private",
    created_by: ME,
    created_at: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("ownSessionsForAltitude", () => {
  it("returns the caller's own threads at this altitude, in wire order (newest first)", () => {
    const newest = session({ id: "own-new", created_at: "2026-09-03T00:00:00.000Z" });
    const older = session({ id: "own-old", created_at: "2026-09-01T00:00:00.000Z" });
    // The switcher needs the LIST, not just the head — this is the whole reason the
    // resolver stopped throwing every row but the first away.
    assert.deepEqual(ownSessionsForAltitude([newest, older], ME, "client-a").map((s) => s.id), ["own-new", "own-old"]);
  });

  it("excludes a colleague's FIRM-SHARED thread, which the wire does deliver", () => {
    // chatRoutes.ts selects `visibility = 'firm' or created_by = $2`, so a colleague's
    // shared session IS on this list. It is readable, but making it the rail's active
    // thread would put the human's next turn into someone else's conversation.
    const shared = session({ id: "colleague", visibility: "firm", created_by: COLLEAGUE });
    assert.deepEqual(ownSessionsForAltitude([shared, session({})], ME, "client-a").map((s) => s.id), ["session-own"]);
  });

  it("separates the firm altitude from every client altitude, in both directions", () => {
    const firm = session({ id: "firm-thread", client_id: null });
    const clientA = session({ id: "a-thread", client_id: "client-a" });
    assert.deepEqual(ownSessionsForAltitude([firm, clientA], ME).map((s) => s.id), ["firm-thread"]);
    assert.deepEqual(ownSessionsForAltitude([firm, clientA], ME, "client-a").map((s) => s.id), ["a-thread"]);
    assert.deepEqual(ownSessionsForAltitude([firm, clientA], ME, "client-b"), []);
  });

  it("still backs selectOwnSession's original contract", () => {
    const newestColleague = session({ id: "session-colleague", visibility: "firm", created_by: COLLEAGUE });
    const own = session({ created_at: "2026-09-01T02:00:00.000Z" });
    assert.equal(selectOwnSession([newestColleague, own], ME, "client-a")?.id, "session-own");
    assert.equal(selectOwnSession([newestColleague], ME, "client-a"), undefined);
  });
});

describe("resolveOwnThread", () => {
  const own = [session({ id: "own-new" }), session({ id: "own-old" })];

  it("an EXPLICIT selection wins over the newest thread", () => {
    // Discriminating: "own-old" is never what the pre-menu rule returns, so this
    // assertion is false unless the selection is actually consulted.
    assert.equal(resolveOwnThread(own, "own-old"), "own-old");
    assert.equal(resolveOwnThread(own, null), "own-new");
  });

  it("a selection that is NOT in this altitude's own list falls back, never through", () => {
    // The selection outlives any single list read, so a stale id — a thread that has
    // since become invisible, or one belonging to another altitude — must not be handed
    // to the view merely because it was once chosen. Membership is the evidence.
    assert.equal(resolveOwnThread(own, "a-thread-from-somewhere-else"), "own-new");
  });

  it("resolves to null on an empty altitude instead of inventing a thread", () => {
    // This is the state that did not exist before: the hook used to CREATE here.
    assert.equal(resolveOwnThread([], null), null);
    assert.equal(resolveOwnThread([], "own-old"), null);
  });
});

describe("claraThreadStore selection", () => {
  it("records a choice PER ALTITUDE, and one altitude's choice is not another's", () => {
    claraThreadStore.selectThreadForAltitude("client-a", "thread-a");
    claraThreadStore.selectThreadForAltitude("firm", "thread-firm");
    assert.equal(claraThreadStore.getSelectedThreadForAltitude("client-a"), "thread-a");
    assert.equal(claraThreadStore.getSelectedThreadForAltitude("firm"), "thread-firm");
    assert.equal(claraThreadStore.getSelectedThreadForAltitude("client-b"), null);
  });

  it("selecting away from a thread does not touch that thread's own store entry", () => {
    // The one thing the removed `reset(...)` call used to break: a turn still streaming
    // into the outgoing thread. A selection is per-PLACE and must never be a delete.
    claraThreadStore.markAccepted("thread-a", "task-still-running");
    claraThreadStore.selectThreadForAltitude("client-a", "thread-other");
    assert.equal(claraThreadStore.getThread("thread-a").activeTaskId, "task-still-running");
  });

  it("notifies subscribers on a real change, and not on a repeat of the same choice", () => {
    let notifications = 0;
    const unsubscribe = claraThreadStore.subscribe(() => { notifications += 1; });
    try {
      claraThreadStore.selectThreadForAltitude("client-z", "thread-1");
      assert.equal(notifications, 1);
      claraThreadStore.selectThreadForAltitude("client-z", "thread-1");
      assert.equal(notifications, 1, "re-selecting the SAME thread must not re-render every subscriber");
      claraThreadStore.selectThreadForAltitude("client-z", "thread-2");
      assert.equal(notifications, 2);
    } finally {
      unsubscribe();
    }
  });
});
