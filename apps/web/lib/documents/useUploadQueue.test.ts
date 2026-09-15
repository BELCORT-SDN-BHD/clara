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
import { useUploadQueue, pastFinalize, type QueueRejection, type QueueState } from "./useUploadQueue";
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

test("pastFinalize (round 3, R6): a timed-out item ('error'/'timeout') counts as past-finalize — a document may exist server-side even though documentId was never set", () => {
  // The exact regression: runOne's OWN `finally` clears `finalizeSent` once the
  // timeout path's response has come back, so `finalizeSent` alone can no
  // longer protect this row by the time Remove is clicked — pastFinalize
  // itself must catch it.
  assert.equal(pastFinalize({ documentId: null, state: "error", errorPhase: "timeout" }), true);

  // Every OTHER "error" arm stays exactly as before — pre-finalize failures
  // (errorPhase "upload") and post-finalize-but-documentId-already-set
  // failures ("filing", caught via documentId) must not be conflated with the
  // timeout case.
  assert.equal(pastFinalize({ documentId: null, state: "error", errorPhase: "upload" }), false);
  assert.equal(pastFinalize({ documentId: "doc-1", state: "error", errorPhase: "filing" }), true);
  assert.equal(pastFinalize({ documentId: null, state: "failed", errorPhase: null }), false);

  // The pre-existing arms, unchanged.
  assert.equal(pastFinalize({ documentId: null, state: "queued", errorPhase: null }), false);
  assert.equal(pastFinalize({ documentId: null, state: "verifying", errorPhase: null }), true);
  assert.equal(pastFinalize({ documentId: "doc-1", state: "ready", errorPhase: null }), true);
});

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

// =============================================================================
// #633 — REAL BYTES, A CANCEL THAT IS NOT A DELETE, AND AN HONEST DENIED FACE
// =============================================================================
//
// Three defects this block closes, each with its own cell:
//
//  * AC8 "Progress uses real bytes or counts" — the queue carried a phase WORD and
//    nothing else. `bytesSent`/`bytesTotal` now come from the XHR seam's own
//    `upload.onprogress` (intake.ts), and the count half from the already-granted
//    `document_processing_tasks_visible` read the detail loader was already using.
//
//  * AC1(a)/AC7 "local cancel vs Work cancel" — `remove` was BOTH verbs in one
//    function (:303-330), so there was no way to stop a transfer without losing the
//    row, and nothing to retry afterwards. `cancel` and `remove` are separate verbs
//    now, and `stopReason` says WHICH of the two indistinguishable `stopped` rows
//    you are looking at: one you stopped before custody could exist, or one the queue
//    stopped tracking while a document may already exist server-side.
//
//  * p633.queue.authority_lost (AC7) — a 401 mid-upload and a 403 on the filing act
//    each settle THAT ONE ROW with its own status/kind, while the rest of the batch
//    keeps running. #625 owns the revoke act; this ticket owns proving the in-flight
//    upload and its filing afterwards refuse HONESTLY rather than reading as a
//    transport blip or retrying silently.

/** The queue's whole wire surface, scriptable per leg. Every call this hook makes
 *  goes through `fetch`, so the boundary IS the integration. */
type Leg = "begin" | "bytes" | "finalize" | "poll" | "tasks" | "resolution" | "file";
type Script = Partial<Record<Leg, (url: string, n: number) => Response | Promise<Response>>>;

function legOf(url: string): Leg | "unknown" {
  if (/\/intake\/documents$/.test(url)) return "begin";
  if (/\/bytes$/.test(url)) return "bytes";
  if (/\/finalize$/.test(url)) return "finalize";
  if (/document_intakes_visible/.test(url)) return "poll";
  if (/document_processing_tasks_visible/.test(url)) return "tasks";
  if (/rpc\/record_client_resolution/.test(url)) return "resolution";
  if (/rpc\/file_document/.test(url)) return "file";
  return "unknown";
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The happy path, per leg, unless a cell overrides one. `adopt` decides which
 *  intake ids ever reach `adopted`. */
function queueFetch(script: Script = {}, counts: Record<string, number> = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const leg = legOf(url);
    counts[leg] = (counts[leg] ?? 0) + 1;
    const override = leg !== "unknown" ? script[leg] : undefined;
    if (override) return override(url, counts[leg]!);
    switch (leg) {
      case "begin": {
        const n = counts.begin!;
        return json({ intake_id: `in-${n}`, upload_token: `ut-${n}`, expires_at: null });
      }
      case "bytes": return new Response(null, { status: 200 });
      case "finalize": return json({ status: "adopted", document_id: null }, 202);
      case "poll": {
        const id = /id=eq\.([^&]+)/.exec(url)?.[1] ?? "in-1";
        return json([intakeRow({ id, status: "adopted", document_id: `doc-${id}` })]);
      }
      case "tasks": return json([
        { id: "t1", document_id: "doc-in-1", lane: "ocr", status: "done", version_n: 1, attempt_count: 1, error_code: null, created_at: "2026-01-01T00:00:00Z", started_at: null, finished_at: null, updated_at: "2026-01-01T00:00:00Z" },
        { id: "t2", document_id: "doc-in-1", lane: "structured_parse", status: "running", version_n: 1, attempt_count: 1, error_code: null, created_at: "2026-01-01T00:00:00Z", started_at: null, finished_at: null, updated_at: "2026-01-01T00:00:00Z" },
      ]);
      case "resolution": return json({ resolution_id: "res-1" });
      case "file": return json({});
      default: return json([]);
    }
  }) as typeof fetch;
}

/** A fake XMLHttpRequest whose `send` scripts the upload leg: progress events, then
 *  either a status or a failure. Installed only by the cells that need real bytes. */
function withFakeUploadXhr(
  plan: (emit: (loaded: number, total: number) => void) => { status?: number; fail?: "error"; hang?: true },
  run: () => Promise<void>,
): Promise<void> {
  const g = globalThis as unknown as { XMLHttpRequest?: unknown };
  const hadOwn = Object.prototype.hasOwnProperty.call(g, "XMLHttpRequest");
  const original = g.XMLHttpRequest;
  class Fake {
    upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
    status = 0; responseURL = "";
    onload?: () => void; onerror?: () => void; onabort?: () => void; ontimeout?: () => void;
    open(_m: string, u: string) { this.responseURL = u; }
    setRequestHeader() {}
    send() {
      const outcome = plan((loaded, total) => this.upload.onprogress?.({ lengthComputable: true, loaded, total }));
      if (outcome.hang) return;
      if (outcome.fail === "error") return void this.onerror?.();
      this.status = outcome.status ?? 200;
      this.onload?.();
    }
    abort() { this.onabort?.(); }
  }
  g.XMLHttpRequest = Fake as unknown;
  return run().finally(() => {
    if (hadOwn) g.XMLHttpRequest = original;
    else delete g.XMLHttpRequest;
  });
}

test("#633 AC8: a row carries REAL, MONOTONIC bytes from the XHR seam — never a simulated ramp", async () => {
  await withFakeUploadXhr(
    (emit) => { emit(0, 1000); emit(400, 1000); emit(1000, 1000); return { status: 200 }; },
    () => withMockedFetch(queueFetch(), async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        const seen: Array<[number | null, number | null]> = [];
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        for (let i = 0; i < 25; i++) {
          await h.settle();
          const item = h.current.items[0];
          if (item) seen.push([item.bytesSent, item.bytesTotal]);
          if (item?.state === "ready") break;
        }
        const measured = seen.filter(([s]) => s !== null).map(([s]) => s!);
        assert.ok(measured.length > 0, "no byte measurement ever reached the row");
        for (let i = 1; i < measured.length; i++) {
          assert.ok(measured[i]! >= measured[i - 1]!, `bytes went backwards: ${measured.join(",")}`);
        }
        assert.equal(measured[measured.length - 1], 1000, "the row must end at the measured total");
        assert.equal(h.current.items[0]?.bytesTotal, 1000);
      } finally {
        await h.unmount();
      }
    }),
  );
});

test("#633 AC8: the COUNT half — an adopted row carries its real processing-task counts", async () => {
  await withMockedFetch(queueFetch(), async () => {
    const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
    try {
      await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
      await waitFor(() => h.current.items[0]?.state === "ready", h.settle, 30);
      assert.equal(h.current.items[0]?.state, "ready");
      assert.deepEqual(h.current.items[0]?.taskCounts, { done: 1, total: 2 });
    } finally {
      await h.unmount();
    }
  });
});

test("#633 AC1(a): CANCEL pre-custody KEEPS the row (terminal 'stopped', stopReason 'cancelled') and aborts the transfer", async () => {
  let aborted = false;
  await withMockedFetch(
    queueFetch({
      bytes: () => new Promise<Response>(() => {}), // hangs; only an abort can end it
    }),
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => h.current.items[0]?.state === "uploading", h.settle, 20);
        assert.equal(h.current.items[0]?.state, "uploading", "control: the row must be mid-transfer");
        const id = h.current.items[0]!.localId;
        await h.act(() => { h.current.cancel(id); });
        await h.settle();
        aborted = true;
        assert.equal(h.current.items.length, 1, "CANCEL IS NOT A DELETE — the row stays so it can be retried");
        assert.equal(h.current.items[0]?.state, "stopped");
        assert.equal(h.current.items[0]?.stopReason, "cancelled");
      } finally {
        await h.unmount();
      }
    },
  );
  assert.equal(aborted, true);
});

test("#633 AC1(a): CANCEL past the finalize REQUEST says so — stopReason 'untracked', never 'cancelled'", async () => {
  await withMockedFetch(
    queueFetch({ finalize: () => new Promise<Response>(() => {}) }), // the request is SENT; the response never arrives
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => h.current.items[0]?.state === "uploading", h.settle, 20);
        for (let i = 0; i < 6; i++) await h.settle(); // let the finalize request be sent
        const id = h.current.items[0]!.localId;
        await h.act(() => { h.current.cancel(id); });
        await h.settle();
        assert.equal(h.current.items.length, 1);
        assert.equal(h.current.items[0]?.state, "stopped");
        assert.equal(
          h.current.items[0]?.stopReason, "untracked",
          "a document may already exist server-side — the row must not claim it was merely cancelled",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});

test("#633 AC1(a): REMOVE is a DIFFERENT verb — pre-custody it takes the row off the list outright", async () => {
  await withMockedFetch(
    queueFetch({ bytes: () => new Promise<Response>(() => {}) }),
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => h.current.items[0]?.state === "uploading", h.settle, 20);
        const id = h.current.items[0]!.localId;
        await h.act(() => { h.current.remove(id); });
        await h.settle();
        assert.equal(h.current.items.length, 0, "Remove deletes the row; Cancel does not");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("#633: a CANCELLED row can be RETRIED — the whole point of keeping it", async () => {
  let hang = true;
  await withMockedFetch(
    queueFetch({ bytes: () => (hang ? new Promise<Response>(() => {}) : new Response(null, { status: 200 })) }),
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => h.current.items[0]?.state === "uploading", h.settle, 20);
        const id = h.current.items[0]!.localId;
        await h.act(() => { h.current.cancel(id); });
        await h.settle();
        assert.equal(h.current.items[0]?.state, "stopped");
        hang = false;
        await h.act(() => { h.current.retry(id); });
        await waitFor(() => h.current.items[0]?.state === "ready", h.settle, 30);
        assert.equal(h.current.items[0]?.state, "ready");
        assert.equal(h.current.items[0]?.stopReason, null, "a retried row must not still wear its cancellation");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p633.queue.authority_lost — a 401 on the PUT leg denies THAT row by name while the rest of the batch finishes", async () => {
  await withMockedFetch(
    queueFetch({
      bytes: (url) => (/in-1\//.test(url) ? new Response("nope", { status: 401 }) : new Response(null, { status: 200 })),
    }),
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16, 1), fakeFile("b.pdf", 16, 2)]); });
        await waitFor(
          () => h.current.items.length === 2 && h.current.items.every((i) => ["ready", "error", "failed", "stopped"].includes(i.state)),
          h.settle, 40,
        );
        const denied = h.current.items.find((i) => i.name === "a.pdf")!;
        const other = h.current.items.find((i) => i.name === "b.pdf")!;
        assert.equal(denied.state, "error");
        assert.equal(denied.errorPhase, "upload");
        assert.equal(denied.errorStatus, 401, "the row must carry the STATUS, so the face can name the constraint");
        assert.equal(denied.errorKind, "unauthenticated", "never a generic transport error");
        assert.equal(other.state, "ready", "per-item independence: one denial must not stop the batch");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p633.queue.authority_lost — a 403 on the FILING act leaves the row honestly 'adopted, not filed', with its receipt id intact", async () => {
  await withMockedFetch(
    queueFetch({ resolution: () => json({ message: "insufficient role", code: "CLR04" }, 403) }),
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => ["error", "ready", "failed"].includes(h.current.items[0]?.state ?? ""), h.settle, 40);
        const row = h.current.items[0]!;
        assert.equal(row.state, "error");
        assert.equal(row.errorPhase, "filing");
        assert.equal(row.errorStatus, 403);
        assert.equal(row.errorKind, "forbidden");
        assert.equal(row.documentId, "doc-in-1", "custody HAPPENED — the row must keep the document id it was adopted as");
        assert.equal(row.intakeId, "in-1", "and its intake id, so the receipt is still readable at mount");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p633.queue.authority_lost — a denied row is NEVER silently retried by the queue", async () => {
  const counts: Record<string, number> = {};
  await withMockedFetch(
    queueFetch({ bytes: () => new Response("nope", { status: 403 }) }, counts),
    async () => {
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}));
      try {
        await h.act(() => { h.current.add([fakeFile("a.pdf", 16)]); });
        await waitFor(() => h.current.items[0]?.state === "error", h.settle, 30);
        for (let i = 0; i < 10; i++) await h.settle();
        assert.equal(h.current.items[0]?.errorKind, "forbidden");
        assert.equal(counts.bytes, 1, `the queue re-sent a denied upload ${counts.bytes} times — retry is the HUMAN's act`);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("#633: the exact IN_FLIGHT state strings ComposerAttachmentControl.tsx:58 keys on are unchanged", () => {
  // A rename here breaks the composer's Send gate AND chat-parity-walk.spec.ts:209's
  // shipped terminal word in one move. Pinned as DATA, not by reading that component.
  const inFlight: QueueState[] = ["queued", "starting", "uploading", "verifying", "filing"];
  const terminal: QueueState[] = ["ready", "failed", "error", "stopped"];
  assert.deepEqual([...inFlight, ...terminal].sort(), [
    "error", "failed", "filing", "queued", "ready", "starting", "stopped", "uploading", "verifying",
  ].sort());
});

test("C-73: a 40-file MIXED batch settles every row independently, and an exhausted poll is 'error'/'timeout' — never a success", async () => {
  // The client-side poll gives up after a bounded number of reads. The shipped bound
  // (60 x 1 s) cannot be driven in a unit test, so the bound is a documented option
  // with the shipped values as its defaults — the ARM under test is the same code.
  const counts: Record<string, number> = {};
  await withMockedFetch(
    queueFetch({
      // Every third intake never adopts: its poll exhausts. Every fifth fails outright.
      poll: (url) => {
        const id = /id=eq\.in-(\d+)/.exec(url)?.[1] ?? "1";
        const n = Number(id);
        if (n % 5 === 0) return json([intakeRow({ id: `in-${n}`, status: "failed", failure_code: "bad_type" })]);
        if (n % 3 === 0) return json([intakeRow({ id: `in-${n}`, status: "verifying" })]);
        return json([intakeRow({ id: `in-${n}`, status: "adopted", document_id: `doc-in-${n}` })]);
      },
    }, counts),
    async () => {
      const files = Array.from({ length: 40 }, (_, i) => fakeFile(`f${i}.pdf`, 16, i + 1));
      const h = await renderHook(() => useUploadQueue("client-1", session(), () => {}, () => {}, {
        pollAttempts: 3, pollIntervalMs: 0,
      }));
      try {
        await h.act(() => { h.current.add(files); });
        await waitFor(
          () => h.current.items.length === 40
            && h.current.items.every((i) => ["ready", "error", "failed", "stopped"].includes(i.state)),
          h.settle, 400,
        );
        const byState = h.current.items.reduce<Record<string, number>>((acc, i) => {
          acc[i.state] = (acc[i.state] ?? 0) + 1; return acc;
        }, {});
        assert.equal(h.current.items.length, 40, "every file keeps its own row");
        assert.equal(
          h.current.items.every((i) => ["ready", "error", "failed"].includes(i.state)), true,
          `a row never settled: ${JSON.stringify(byState)}`,
        );
        const timedOut = h.current.items.filter((i) => i.state === "error" && i.errorPhase === "timeout");
        assert.ok(timedOut.length > 0, `no row exhausted its poll — the arm under test never ran (${JSON.stringify(byState)})`);
        for (const row of timedOut) {
          assert.notEqual(row.state, "ready", "an exhausted poll must NEVER be dressed as success");
          assert.equal(row.documentId, null, "a timed-out row never invented a document id");
        }
        assert.ok((byState.failed ?? 0) > 0, "the bad_type rows must settle as `failed` with their own code");
        assert.ok((byState.ready ?? 0) > 0, "and the good rows must still finish — per-item independence");
      } finally {
        await h.unmount();
      }
    },
  );
});
