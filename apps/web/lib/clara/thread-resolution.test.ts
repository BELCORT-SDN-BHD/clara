// 裁-117 — the thread RESOLUTION rules, as pure functions. The hook's own side of this
// (no create on mount, create on the act) is driven through the real rail in
// ../../components/clara/thread-menu.test.tsx; these are the decisions underneath it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, test } from "node:test";

import type { SessionRow } from "./api";
import { claraThreadStore } from "./threadStore";
import { canCreateThreadIn, ownSessionsForAltitude, resolveOwnThread, selectOwnSession, useActiveThreadId } from "./useActiveThread";
import { renderHook } from "../../test/hookHarness";

const ME = "11111111-1111-1111-1111-111111111111";

const ORPHAN_ID = "0f0f0f0f-1111-4111-8111-111111111111";

/** Settle the hook until `condition` holds, or fail by name rather than by timeout. */
async function settleHook(h: { settle: () => Promise<void> }, condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for the hook to settle");
    await h.settle();
  }
}

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

// --- FOLD ROUND (review-547): the silent-orphan arm, driven at the hook ---------------
//
// `createThread`'s fallback refuses to SELECT a row it could not LIST. The fold-round
// mutant panel found that arm uncovered, and the sentence that stood here was WRONG about
// why: it claimed no journey through the rail could reach it, when at the time New was
// gated on `resolving` alone and a FAILED read settles with `resolving: false` AND no
// caller projection — a state the menu's New was still enabled in. The review caught that
// (residual R2); `canCreate` now gates on both halves, and
// `../../components/clara/thread-menu.test.tsx`'s own R2 cell proves the control refuses
// there.
//
// So the arm is UNREACHABLE THROUGH THE UI BY CONSTRUCTION rather than by luck, which is
// exactly why it is driven here instead: at the hook the state can be produced on purpose,
// and the guard keeps its own cell rather than resting on a gate one layer above it.
//
// WHY THE ARM EXISTS AT ALL. `resolveOwnThread` honours a selection only for an id in
// this altitude's own list. Writing a selection for a row that is not in the list is not
// merely useless — the rail falls back to the previous thread and the session that was
// just minted becomes invisible AND un-archivable (`_tf_chat_session_update` raises
// CLR08 on a DELETE), which is precisely the defect 裁-117 abolished.

test("a create whose caller projection is unreadable does NOT select the row it could not list", async () => {
  const CLIENT = "c0c0c0c0-1111-4111-8111-111111111111";
  // A bearer whose `sub` is not a uuid: `callerSubjectFromAccessToken` returns null and
  // `listSessionsForCaller` throws "session identity is unavailable" — every time. The
  // create itself only needs a token, so it succeeds and the confirming read does not.
  const token = `x.${Buffer.from(JSON.stringify({ sub: "not-a-uuid" })).toString("base64url")}.y`;
  const auth = { getAccessToken: async () => token };

  let created = 0;
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.endsWith("/api/runtime/chat/sessions")) {
      if (method === "POST") {
        created += 1;
        return new Response(JSON.stringify({ session_id: ORPHAN_ID }), { status: 201, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const h = await renderHook(() => useActiveThreadId(auth, CLIENT));
    try {
      // The initial resolve fails on the identity read, so there is no caller projection.
      await settleHook(h, () => h.current.resolving === false);
      assert.equal(h.current.threadId, null);
      assert.ok(h.current.error, "the failed identity read reports itself");

      let returned: string | null = "unset";
      await h.act(async () => { returned = await h.current.createThread(); });
      await settleHook(h, () => h.current.creating === false);

      assert.equal(created, 1, "the session WAS created — that is what makes the next assertion matter");
      assert.equal(returned, null, "a create that cannot be listed reports failure rather than a thread id");
      // THE DISCRIMINATING POST-CONDITION: no selection was written for the orphan.
      assert.notEqual(
        claraThreadStore.getSelectedThreadForAltitude(CLIENT),
        ORPHAN_ID,
        "selecting a row that is not in this altitude's list strands the session it names",
      );
      assert.equal(h.current.threadId, null, "and the rail does not claim to be showing it");
    } finally {
      await h.unmount();
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});

// --- FOLD ROUND 2 (residual R2): the create gate, and the coupling that makes its ----
// --- redundancy safe -----------------------------------------------------------------

describe("canCreateThreadIn", () => {
  // Typed explicitly: `typeof settled` inferred from a literal narrows `callerSubject` to
  // `string`, and the table below needs the null arm — which is the whole point of it.
  type GateState = Parameters<typeof canCreateThreadIn>[0];
  const settled: GateState = { forThisAltitude: true, resolving: false, callerSubject: "u-1" };

  it("admits a create only when the read has SETTLED and produced an identity", () => {
    assert.equal(canCreateThreadIn(settled), true);
  });

  it("refuses every other combination — the table, exhaustively", () => {
    // THREE inputs, so eight combinations; the rows below are the four refusals that
    // matter plus the admitted one above — five of the eight, chosen because the other
    // three differ from a listed row only in an input that is already false. Enumerated
    // rather than spot-checked because a permissive gate here mints a row nothing can
    // list and nothing can delete.
    const rows: { state: GateState; why: string }[] = [
      { state: { ...settled, resolving: true }, why: "a read in flight has no list for the row to land in" },
      { state: { ...settled, callerSubject: null }, why: "a FAILED read settles with no identity to file it under — the state review found open" },
      { state: { ...settled, resolving: true, callerSubject: null }, why: "both halves absent" },
      { state: { ...settled, forThisAltitude: false }, why: "a resolution for another altitude is not this rail's to create into" },
    ];
    for (const { state, why } of rows) {
      assert.equal(canCreateThreadIn(state), false, why);
    }
  });
});

test("R2 coupling — EVERY producer of `resolving: true` clears the caller projection with it", () => {
  // WHY THIS IS A SOURCE PIN AND NOT A BEHAVIOURAL ONE. `canCreateThreadIn` states two
  // conditions, and the round-3 mutant panel found that dropping the first changes no
  // cell: every state with `resolving: true` also has `callerSubject: null` today, so no
  // behaviour can distinguish them. That is a property of the states this hook CONSTRUCTS,
  // not of the gate — and it is the property that makes the redundancy safe. If a later
  // change kept a previous read's projection across a re-resolve (a reasonable thing to
  // want, to stop the menu flickering on an altitude switch), the projection half would go
  // true mid-read and New would open in exactly the state FOLD 3 exists to close.
  //
  // TWO SITES ESTABLISH IT, not one — the `useState` seed and the effect's own reset — and
  // the pin counts rather than spot-checking, so a THIRD producer added later without the
  // projection reset goes red instead of hiding behind the two that comply.
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "useActiveThread.ts"), "utf8");

  const producers = source.match(/resolving:\s*true/g) ?? [];
  const compliant = source.match(/callerSubject:\s*null,\s*resolving:\s*true/g) ?? [];
  console.log(`  producers of resolving:true = ${producers.length}; of those, clearing callerSubject = ${compliant.length}`);

  assert.ok(producers.length >= 2, `expected at least the seed and the effect reset; found ${producers.length}`);
  assert.equal(
    compliant.length,
    producers.length,
    "every construction of an in-flight state must clear `callerSubject` with it — canCreateThreadIn's first half is redundant only while they all do. "
      + "NOTE: this pin reads the two fields as ADJACENT, so it also reds on a harmless field REORDER inside the same object literal. That is deliberate — "
      + "a looser pattern could not tell a reorder from a removal, and the cheap fix is to keep `callerSubject: null` immediately before `resolving: true`.",
  );

  // POSITIVE CONTROL on the pin: it must be able to SEE a non-compliant producer, or the
  // equality above says nothing about what the file contains. One producer is stripped of
  // its projection reset — the exact drift this cell exists to catch.
  const doctored = source.replace(/callerSubject:\s*null,\s*resolving:\s*true/, "resolving: true");
  assert.notEqual(doctored, source, "the control must actually have doctored a producer");
  const doctoredCompliant = (doctored.match(/callerSubject:\s*null,\s*resolving:\s*true/g) ?? []).length;
  const doctoredProducers = (doctored.match(/resolving:\s*true/g) ?? []).length;
  assert.equal(doctoredProducers, producers.length, "the control must not change how many producers there are");
  assert.equal(
    doctoredCompliant,
    compliant.length - 1,
    "the pin must count one fewer compliant producer once one stops clearing the projection",
  );
});

