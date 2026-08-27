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
import { useUploadQueue, type QueueTooLargeNote } from "./useUploadQueue";
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

function fakeFile(name: string, bytes: number): File {
  return new File([new Uint8Array(Math.min(bytes, 16))], name, { type: "application/pdf" });
}

/** A File whose `.size` is GENUINELY over the cap — `fakeFile` above deliberately
 *  truncates its backing bytes to keep every OTHER test cheap, which would make
 *  this one's own `file.size > MAX_FILE_BYTES` check silently false. */
function oversizedFile(name: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

test("add(): a file over MAX_FILE_BYTES is rejected via onTooLarge (a STRUCTURED note, never rendered text) and never queued (no fetch attempted)", async () => {
  let called = false;
  await withMockedFetch(
    async () => { called = true; throw new Error("must not be called"); },
    async () => {
      const notes: QueueTooLargeNote[] = [];
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, (n) => notes.push(n)));
      try {
        await h.act(() => { h.current.add([oversizedFile("huge.pdf", 21 * 1024 * 1024)]); });
        await h.settle();
        assert.equal(h.current.items.length, 0);
        assert.equal(notes.length, 1);
        assert.equal(notes[0]?.filename, "huge.pdf");
        assert.equal(notes[0]?.limitBytes, 20 * 1024 * 1024);
      } finally {
        await h.unmount();
      }
    },
  );
  assert.equal(called, false);
});

test("add(): happy path — begin, bytes, finalize, poll (finalized on the first read), then auto-files to clientId", async () => {
  const seenFns: string[] = [];
  let filedArgs: Record<string, unknown> | null = null;
  await withMockedFetch(
    async (url, init) => {
      const u = String(url);
      if (u === "/api/intake/documents") {
        return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
      }
      if (u.includes("/api/intake/documents/in-1/bytes")) {
        return new Response(null, { status: 200 });
      }
      if (u.includes("/api/intake/documents/in-1/finalize")) {
        return new Response(JSON.stringify({ status: "finalized", document_id: "doc-1" }), { status: 200 });
      }
      if (u.includes("document_intakes_visible")) {
        return new Response(JSON.stringify([{
          id: "in-1", uploaded_by: "u1", origin: "documents_tab", original_filename: "a.pdf",
          declared_mime: "application/pdf", declared_bytes: 16, status: "finalized",
          document_id: "doc-1", failure_code: null, expires_at: null,
          created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        }]), { status: 200 });
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
        for (let i = 0; i < 10 && h.current.items[0]?.state !== "ready" && h.current.items[0]?.state !== "error"; i++) {
          await h.settle();
        }
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

test("add(): a begin-intake failure lands the item in 'error' with the honest message, and onFiled never fires", async () => {
  await withMockedFetch(
    async () => new Response("service unavailable", { status: 503 }),
    async () => {
      let filedCount = 0;
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => { filedCount += 1; }, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        for (let i = 0; i < 10 && h.current.items[0]?.state !== "error"; i++) {
          await h.settle();
        }
        const item = h.current.items[0]!;
        assert.equal(item.state, "error");
        assert.match(item.error ?? "", /begin intake failed \(503\)/);
        assert.equal(filedCount, 0);
      } finally {
        await h.unmount();
      }
    },
  );
});
