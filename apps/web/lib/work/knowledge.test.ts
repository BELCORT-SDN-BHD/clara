// #658 — THE DRIFT READER'S OWN RULES, in isolation. The mounted surfaces
// (`components/work/work-knowledge-block.test.tsx`, `components/work/work-question-drift-banner.test.tsx`)
// prove the FACES; this file proves the thing underneath them that no screenshot can show.
//
// ONE FACT, ONE READ, ONE STORY. B3's Work detail mounts two independent consumers of the same
// fact — the Sources tab's knowledge block (`keepMounted`, so it fires on every visit) and the
// question form's effect, once per PENDING question card. Two reads of one fact on one page is
// not only a doubled request: it is a window in which the block and the banner can disagree,
// because a capture landing between them gives one `drifted:false` and the other `drifted:true`.
// The brief ruled exactly this for the sibling trace read (§3 Web 3). The fix is a request
// COALESCER at the reader, not a cache and not a prop drilled from `work-detail.tsx` — the same
// form is mounted by the Clara chat lane (`components/parts/WorkCards.tsx`) and by Needs-you
// (`components/firm/work-question-affordance.tsx`), where there is no owner to drill from.
//
// AND IT MUST NOT BECOME A CACHE. Every cell below that proves sharing is paired with one that
// proves the sharing ENDS when the request does, so the block's own "re-read" button still makes
// a real call and nothing is ever served from a previous answer.

import { test } from "node:test";
import assert from "node:assert/strict";

import { readWorkKnowledgeDrift, driftBannerKind, driftBannerKeys } from "./knowledge";
import type { SessionTokenAccessor } from "@/lib/session";

const WORK = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

/** THE PAGE'S OWN ACCESSOR. In the browser the two consumers resolve to the SAME object without
 *  anybody passing one — `lib/doors.ts:120` falls back to the blessed `sessionTokenAccessor`
 *  singleton, and `work-detail.tsx:169` defaults its `session` prop to that same singleton. A node
 *  test has no Supabase session, so the singleton would answer `null` and `callDoor` would refuse
 *  before `fetch`; these cells therefore hand BOTH consumers the one accessor the page would have
 *  resolved to, which is the same identity test the reader performs. */
const PAGE = fakeSession("tok-page");

const DRIFT = {
  observed_version: "7", current_version: "9", observed_from: "read", drifted: true,
  moved_keys: ["sst_regime", "default_currency"], read_keys: ["sst_regime"], relevant: true,
  as_of: "2026-09-19", read: null, work_id: WORK, client_id: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** The house idiom (`lib/bank/match-reads.test.ts`): stub `fetch`, not the door. */
function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

test("wk.01 two consumers mounted in one tick make ONE door call and read the SAME answer", async () => {
  let calls = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withMockedFetch(
    async (u) => {
      assert.ok(String(u).includes("/rpc/work_knowledge_drift"));
      calls += 1;
      await gate;
      return jsonResponse(DRIFT);
    },
    async () => {
      // The Sources block, and two pending question cards: three mounts, one fact, one page.
      const block = readWorkKnowledgeDrift(WORK, { session: PAGE });
      const banner = readWorkKnowledgeDrift(WORK, { session: PAGE });
      const third = readWorkKnowledgeDrift(WORK, { session: PAGE });
      release?.();
      const [a, b, c] = await Promise.all([block, banner, third]);
      assert.equal(calls, 1, "three consumers of one fact on one page must not spend three requests");
      assert.equal(a.kind, "ok");
      assert.equal(a, b, "...and they must not be able to disagree: it is literally one answer");
      assert.equal(b, c);
    },
  );
});

test("wk.02 it is a COALESCER, not a cache: once the request settles the next read is a real read", async () => {
  let calls = 0;
  await withMockedFetch(
    async () => { calls += 1; return jsonResponse(DRIFT); },
    async () => {
      await readWorkKnowledgeDrift(WORK, { session: PAGE });
      await readWorkKnowledgeDrift(WORK, { session: PAGE });
      assert.equal(calls, 2, "a re-read after the first settled must reach the door, or the block's Re-read button is a lie");
    },
  );
});

test("wk.03 two different Works are two different facts", async () => {
  let calls = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withMockedFetch(
    async () => { calls += 1; await gate; return jsonResponse(DRIFT); },
    async () => {
      const a = readWorkKnowledgeDrift(WORK, { session: PAGE });
      const b = readWorkKnowledgeDrift(OTHER, { session: PAGE });
      release?.();
      await Promise.all([a, b]);
      assert.equal(calls, 2);
    },
  );
});

test("wk.04 a caller that brought its own AbortSignal is never coalesced", async () => {
  let calls = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withMockedFetch(
    async () => { calls += 1; await gate; return jsonResponse(DRIFT); },
    async () => {
      // One component's unmount must not abort another component's read, so a request with a
      // caller-owned lifetime keeps its own.
      const shared = readWorkKnowledgeDrift(WORK, { session: PAGE });
      const owned = readWorkKnowledgeDrift(WORK, { session: PAGE, signal: new AbortController().signal });
      release?.();
      await Promise.all([shared, owned]);
      assert.equal(calls, 2);
    },
  );
});

test("wk.05 two different accessors are two auth contexts and never share one answer", async () => {
  let calls = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withMockedFetch(
    async () => { calls += 1; await gate; return jsonResponse(DRIFT); },
    async () => {
      const one = readWorkKnowledgeDrift(WORK, { session: fakeSession("tok-a") });
      const two = readWorkKnowledgeDrift(WORK, { session: fakeSession("tok-b") });
      release?.();
      await Promise.all([one, two]);
      assert.equal(calls, 2, "an answer fetched with one bearer token must never be handed to another");
    },
  );
});

test("wk.06 a coalesced failure is still a typed face for every sharer, never a throw for one of them", async () => {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withMockedFetch(
    async () => { await gate; return jsonResponse({ code: "CLR04", message: "viewer floor" }, 403); },
    async () => {
      const a = readWorkKnowledgeDrift(WORK, { session: PAGE });
      const b = readWorkKnowledgeDrift(WORK, { session: PAGE });
      release?.();
      const [x, y] = await Promise.all([a, b]);
      assert.equal(x.kind, "denied");
      assert.equal(x, y);
    },
  );
});

test("wk.07 a malformed work id never reaches the door and never enters the coalescer", async () => {
  await withMockedFetch(
    async () => { throw new Error("must not be called"); },
    async () => {
      const out = await readWorkKnowledgeDrift("not-a-uuid", { session: PAGE });
      assert.equal(out.kind, "unreadable");
      // ...and the entry it did not make cannot poison the next real read.
      assert.deepEqual(driftBannerKind(out), "none");
      assert.deepEqual(driftBannerKeys(out), []);
    },
  );
});
