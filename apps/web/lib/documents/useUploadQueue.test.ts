// useUploadQueue — the client-scoped upload queue (DEPARTURE from the dashboard's
// useUploadQueue.ts: an adopted document is auto-filed to `clientId`, never left in
// the unassigned lane). Mounted for real via ../../test/hookHarness (the controller-
// hook idiom lib/parts/hooks.test.ts establishes) with fetch mocked at the boundary —
// every call this hook makes (intake begin/bytes/finalize, the intake poll read, the
// record+file doors) ultimately goes through `fetch`, so mocking there exercises the
// REAL integration, not a stand-in.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useUploadQueue, type QueueRejection } from "./useUploadQueue";
import type { SessionTokenAccessor } from "@/lib/session";

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
}

function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalSupabase === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabase;
  });
}

function fakeFile(name: string, bytes: number, lastModified = 1): File {
  return new File([new Uint8Array(Math.min(bytes, 16))], name, { type: "application/pdf", lastModified });
}

/** A File whose `.size` is GENUINELY over the cap — `fakeFile` above deliberately
 *  truncates its backing bytes to keep every OTHER test cheap, which would make
 *  this one's own `file.size > MAX_FILE_BYTES` check silently false. */
function oversizedFile(name: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

const intakeRow = (overrides: Record<string, unknown>) => ({
  id: "in-1", uploaded_by: "u1", origin: "documents_tab", original_filename: "a.pdf",
  declared_mime: "application/pdf", declared_bytes: 16, status: "verifying",
  document_id: null, failure_code: null, expires_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
});

async function waitFor(check: () => boolean, settle: () => Promise<void>, tries = 20): Promise<void> {
  for (let i = 0; i < tries && !check(); i++) await settle();
}

test("add(): a file over MAX_FILE_BYTES is rejected via onRejected (a STRUCTURED note, never rendered text) and never queued (no fetch attempted)", async () => {
  let called = false;
  await withMockedFetch(
    async () => { called = true; throw new Error("must not be called"); },
    async () => {
      const notes: QueueRejection[] = [];
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, (n) => notes.push(n)));
      try {
        await h.act(() => { h.current.add([oversizedFile("huge.pdf", 21 * 1024 * 1024)]); });
        await h.settle();
        assert.equal(h.current.items.length, 0);
        assert.deepEqual(notes, [{ reason: "too_large", filename: "huge.pdf", limitBytes: 20 * 1024 * 1024 }]);
      } finally {
        await h.unmount();
      }
    },
  );
  assert.equal(called, false);
});

test("add(): a second add() of the SAME name+size+lastModified while a LIVE row exists is refused locally (N14)", async () => {
  await withMockedFetch(
    async () => new Promise(() => {}), // never resolves — the first item just sits "starting" forever
    async () => {
      const notes: QueueRejection[] = [];
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, (n) => notes.push(n)));
      try {
        const file = fakeFile("a.pdf", 16, 12345);
        await h.act(() => { h.current.add([file]); });
        await h.settle();
        assert.equal(h.current.items.length, 1);
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16, 12345)]); }); // same name/size/lastModified
        await h.settle();
        assert.equal(h.current.items.length, 1, "the duplicate must never be queued a second time");
        assert.deepEqual(notes, [{ reason: "duplicate", filename: "a.pdf" }]);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("N6: filing NEVER fires off finalizeIntake's own (optimistic) receipt — only a DB-CONFIRMED poll read triggers it", async () => {
  const seenFns: string[] = [];
  let pollCount = 0;
  await withMockedFetch(
    async (url) => {
      const u = String(url);
      if (u === "/api/runtime/intake/documents") return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
      if (u.includes("/bytes")) return new Response(null, { status: 200 });
      if (u.includes("/finalize")) {
        // The receipt LIES optimistically — claims adopted with a document_id
        // immediately. If this drove filing, record_client_resolution would fire
        // before any poll read ever happened.
        return new Response(JSON.stringify({ status: "adopted", document_id: "doc-1" }), { status: 200 });
      }
      if (u.includes("document_intakes_visible")) {
        pollCount += 1;
        seenFns.push(`poll:${pollCount}`);
        if (pollCount === 1) return new Response(JSON.stringify([intakeRow({ status: "verifying", document_id: null })]), { status: 200 });
        return new Response(JSON.stringify([intakeRow({ status: "finalized", document_id: "doc-1" })]), { status: 200 });
      }
      if (u.includes("/rpc/record_client_resolution")) { seenFns.push("record_client_resolution"); return new Response(JSON.stringify({ resolution_id: "res-1" }), { status: 200 }); }
      if (u.includes("/rpc/file_document")) { seenFns.push("file_document"); return new Response(JSON.stringify(null), { status: 200 }); }
      throw new Error(`unexpected fetch: ${u}`);
    },
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        // The first poll read is non-adopted, so the loop's own REAL 1000ms sleep
        // sits between it and the second (confirming) read — `waitFor`'s plain
        // `settle()` never advances real wall-clock time, so this test needs an
        // actual timer tick to cross that gap.
        await waitFor(() => h.current.items[0]?.state === "ready", async () => {
          await new Promise((r) => setTimeout(r, 150));
          await h.settle();
        }, 15);
        assert.equal(h.current.items[0]?.state, "ready");
      } finally {
        await h.unmount();
      }
    },
  );
  // The FIRST poll read (non-adopted) must precede the SECOND (adopted), which must
  // precede filing — never filing sandwiched before the confirming poll.
  assert.deepEqual(seenFns, ["poll:1", "poll:2", "record_client_resolution", "file_document"]);
});

test("N7/N8: unmounting the queue aborts an in-flight upload — no further fetch after unmount", async () => {
  let beginCalled = false;
  let bytesCalledAfterUnmount = false;
  let unmounted = false;
  await withMockedFetch(
    async (url, init) => {
      const u = String(url);
      if (u === "/api/runtime/intake/documents") {
        beginCalled = true;
        return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
      }
      if (u.includes("/bytes")) {
        // A slow byte PUT that respects abort — if unmount didn't abort it, this
        // would eventually resolve and the flow would continue past unmount.
        return new Promise((_resolve, reject) => {
          if (unmounted) bytesCalledAfterUnmount = true;
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      throw new Error(`unexpected fetch after unmount guard: ${u}`);
    },
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
      await waitFor(() => h.current.items[0]?.state === "uploading", () => h.settle());
      assert.equal(beginCalled, true);
      unmounted = true;
      await h.unmount();
      await new Promise((r) => setTimeout(r, 20));
    },
  );
  assert.equal(bytesCalledAfterUnmount, false);
});

test("N7/N8: Remove BEFORE finalize aborts and fully deletes the row (nothing durable exists server-side yet)", async () => {
  await withMockedFetch(
    async (url, init) => {
      const u = String(url);
      if (u === "/api/runtime/intake/documents") return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
      if (u.includes("/bytes")) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      throw new Error(`unexpected fetch: ${u}`);
    },
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => h.current.items[0]?.state === "uploading", () => h.settle());
        const id = h.current.items[0]!.localId;
        await h.act(() => { h.current.remove(id); });
        assert.equal(h.current.items.length, 0, "a pre-finalize Remove must fully delete the row");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("N7/N8 (round 2, R3): Remove AFTER finalize (verifying/filing) does NOT delete the row — it moves to the DISTINCT terminal state 'stopped', never the still-in-progress-looking 'filing'", async () => {
  await withMockedFetch(
    async (url, init) => {
      const u = String(url);
      if (u === "/api/runtime/intake/documents") return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
      if (u.includes("/bytes")) return new Response(null, { status: 200 });
      if (u.includes("/finalize")) return new Response(JSON.stringify({ status: "finalized" }), { status: 200 });
      if (u.includes("document_intakes_visible")) {
        // Never adopts — stays "verifying" forever (respects abort so the test
        // doesn't hang for the full 60-iteration timeout).
        return new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          setTimeout(() => reject(new DOMException("aborted", "AbortError")), 5000);
        });
      }
      throw new Error(`unexpected fetch: ${u}`);
    },
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => h.current.items[0]?.state === "verifying", () => h.settle());
        const id = h.current.items[0]!.localId;
        await h.act(() => { h.current.remove(id); });
        await h.settle();
        assert.equal(h.current.items.length, 1, "a post-finalize Remove must NOT delete the row — a document may already exist server-side");
        assert.equal(h.current.items[0]!.state, "stopped");

        // round 2, R3: a SECOND Remove on an already-"stopped" row really does
        // delete it — nothing left to protect by then, and it must be clearable.
        await h.act(() => { h.current.remove(id); });
        assert.equal(h.current.items.length, 0, "a second Remove on a 'stopped' row must delete it for real");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("N7/N8 (round 2, R3): clearDone() also sweeps 'stopped' rows, not only 'ready' ones", async () => {
  await withMockedFetch(
    async (url, init) => {
      const u = String(url);
      if (u === "/api/runtime/intake/documents") return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
      if (u.includes("/bytes")) return new Response(null, { status: 200 });
      if (u.includes("/finalize")) return new Response(JSON.stringify({ status: "finalized" }), { status: 200 });
      if (u.includes("document_intakes_visible")) {
        return new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      throw new Error(`unexpected fetch: ${u}`);
    },
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => h.current.items[0]?.state === "verifying", () => h.settle());
        await h.act(() => { h.current.remove(h.current.items[0]!.localId); });
        await h.settle();
        assert.equal(h.current.items[0]!.state, "stopped");
        await h.act(() => { h.current.clearDone(); });
        assert.equal(h.current.items.length, 0);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("round 2, R2: an abort landing INSIDE the finalize round-trip (request sent, response not yet back) still protects the row as 'stopped', never deletes it", async () => {
  let finalizeRequestSeen = false;
  await withMockedFetch(
    async (url, init) => {
      const u = String(url);
      if (u === "/api/runtime/intake/documents") return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
      if (u.includes("/bytes")) return new Response(null, { status: 200 });
      if (u.includes("/finalize")) {
        // The request IS sent (the runtime may process it) but its RESPONSE
        // never arrives before the abort — the exact seam R2 is about.
        finalizeRequestSeen = true;
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      throw new Error(`unexpected fetch: ${u}`);
    },
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        // Wait until the finalize request has genuinely been sent — the item's
        // OWN state is still "uploading" at this instant (it only flips to
        // "verifying" once finalize's RESPONSE comes back), which is exactly
        // the case `pastFinalize(item)` alone cannot catch — only `finalizeSent`
        // can.
        await waitFor(() => finalizeRequestSeen, () => h.settle());
        assert.equal(h.current.items[0]!.state, "uploading", "the response has not arrived yet — state has NOT advanced to verifying");
        const id = h.current.items[0]!.localId;
        await h.act(() => { h.current.remove(id); });
        await h.settle();
        assert.equal(h.current.items.length, 1, "a request-sent-response-pending Remove must NOT delete the row (R2)");
        assert.equal(h.current.items[0]!.state, "stopped");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("add(): happy path — begin, bytes, finalize, poll (finalized on the first read), then auto-files to clientId", async () => {
  const seenFns: string[] = [];
  let filedArgs: Record<string, unknown> | null = null;
  await withMockedFetch(
    async (url, init) => {
      const u = String(url);
      if (u === "/api/runtime/intake/documents") {
        return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
      }
      if (u.includes("/api/runtime/intake/documents/in-1/bytes")) {
        return new Response(null, { status: 200 });
      }
      if (u.includes("/api/runtime/intake/documents/in-1/finalize")) {
        return new Response(JSON.stringify({ status: "finalized", document_id: "doc-1" }), { status: 200 });
      }
      if (u.includes("document_intakes_visible")) {
        return new Response(JSON.stringify([intakeRow({ status: "finalized", document_id: "doc-1" })]), { status: 200 });
      }
      if (u.includes("/rpc/record_client_resolution")) {
        seenFns.push("record_client_resolution");
        return new Response(JSON.stringify({ resolution_id: "res-1" }), { status: 200 });
      }
      if (u.includes("/rpc/file_document")) {
        seenFns.push("file_document");
        filedArgs = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(null), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    },
    async () => {
      let filedCount = 0;
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => { filedCount += 1; }, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        // Drain the microtask/async chain: begin -> bytes -> finalize -> one poll
        // read (already 'finalized') -> record -> file. No timer wait is needed —
        // the loop only sleeps AFTER a non-adopted read, and this mock adopts on
        // the very first one.
        await waitFor(() => h.current.items[0]?.state === "ready" || h.current.items[0]?.state === "error", () => h.settle(), 10);
        assert.equal(h.current.items.length, 1);
        const item = h.current.items[0]!;
        assert.equal(item.state, "ready", item.error ?? "");
        assert.equal(item.documentId, "doc-1");
        assert.equal(filedCount, 1);
      } finally {
        await h.unmount();
      }
    },
  );
  assert.deepEqual(seenFns, ["record_client_resolution", "file_document"]);
  assert.equal((filedArgs as unknown as { p_client: string } | null)?.p_client, "client-1");
});

test("add(): a begin-intake failure lands the item in 'error'/'upload' phase, and onFiled never fires — raw runtime body never surfaced", async () => {
  await withMockedFetch(
    async () => new Response("service unavailable — internal detail", { status: 503 }),
    async () => {
      let filedCount = 0;
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => { filedCount += 1; }, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => h.current.items[0]?.state === "error", () => h.settle(), 10);
        const item = h.current.items[0]!;
        assert.equal(item.state, "error");
        assert.equal(item.errorPhase, "upload");
        assert.doesNotMatch(item.error ?? "", /internal detail/);
        assert.equal(filedCount, 0);
      } finally {
        await h.unmount();
      }
    },
  );
});
