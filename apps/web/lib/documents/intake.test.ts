// intake.ts — upload/intake transport, ported mechanism from
// apps/dashboard/app/shared/intake.ts, now routed same-origin via
// app/api/runtime/[...path]/route.ts (independent review 2026-08-27, F1/F2/F3).
// Mocked at the fetch boundary throughout — this module's whole job is talking to
// that one same-origin proxy path, so the boundary IS the fetch call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { beginIntake, putIntakeBytes, finalizeIntake, readIntake } from "./intake";
import { isRuntimeError } from "./runtime-wire";
import type { SessionTokenAccessor } from "@/lib/session";

function session(token: string | null = "tok"): SessionTokenAccessor {
  return { getAccessToken: async () => token };
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

// --- beginIntake -------------------------------------------------------------

test("beginIntake: a null token throws WITHOUT ever calling fetch (no fabricated request)", async () => {
  let called = false;
  await withMockedFetch(
    async () => { called = true; throw new Error("must not be called"); },
    async () => {
      await assert.rejects(
        beginIntake({ filename: "a.pdf", mime: "application/pdf", declaredBytes: 10 }, { session: session(null) }),
        /not signed in/,
      );
    },
  );
  assert.equal(called, false);
});

test("beginIntake: same-origin POST to /api/runtime/intake/documents, origin fixed to 'documents_tab', NEVER follows a redirect", async () => {
  let seenUrl = ""; let seenBody: unknown; let seenAuth = ""; let seenRedirect: string | undefined;
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      seenAuth = new Headers(init?.headers).get("authorization") ?? "";
      seenRedirect = init?.redirect;
      return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
    },
    async () => {
      const out = await beginIntake({ filename: "a.pdf", mime: "application/pdf", declaredBytes: 10 }, { session: session() });
      assert.equal(out.intake_id, "in-1");
    },
  );
  assert.equal(seenUrl, "/api/runtime/intake/documents", "must ride the same-origin runtime proxy, never runtimeBase()-prefixed");
  assert.equal(seenRedirect, "manual", "an unauthenticated 307-to-/login must never be silently followed into a 200 text/html page");
  assert.equal((seenBody as Record<string, unknown>).origin, "documents_tab");
  assert.equal(seenAuth, "Bearer tok");
});

test("beginIntake: a non-ok response throws a typed RuntimeError classified by STATUS, never quoting the raw body", async () => {
  await withMockedFetch(
    async () => new Response("quota exceeded — this raw text must never reach the thrown message", { status: 429 }),
    async () => {
      await assert.rejects(
        beginIntake({ filename: "a.pdf", mime: "application/pdf", declaredBytes: 10 }, { session: session() }),
        (e: unknown) => {
          assert.ok(isRuntimeError(e));
          assert.equal(e.status, 429);
          assert.equal(e.kind, "unexpected", "429 has no dedicated kind — falls to the honest 'unexpected' bucket");
          assert.doesNotMatch(e.message, /quota exceeded/, "the runtime's raw body text must never be surfaced unclassified");
          return true;
        },
      );
    },
  );
});

test("beginIntake: a 401 classifies as kind 'unauthenticated'; a 403 as 'forbidden' — distinct, never conflated", async () => {
  await withMockedFetch(
    async () => new Response("", { status: 401 }),
    async () => {
      await assert.rejects(beginIntake({ filename: "a.pdf", mime: "application/pdf", declaredBytes: 10 }, { session: session() }), (e: unknown) => {
        assert.ok(isRuntimeError(e)); assert.equal(e.kind, "unauthenticated"); return true;
      });
    },
  );
  await withMockedFetch(
    async () => new Response("", { status: 403 }),
    async () => {
      await assert.rejects(beginIntake({ filename: "a.pdf", mime: "application/pdf", declaredBytes: 10 }, { session: session() }), (e: unknown) => {
        assert.ok(isRuntimeError(e)); assert.equal(e.kind, "forbidden"); return true;
      });
    },
  );
});

// --- putIntakeBytes / finalizeIntake ------------------------------------------

test("putIntakeBytes: PUTs to the same-origin runtime proxy, octet-stream, with the upload token", async () => {
  let seenUrl = ""; let seenMethod = ""; let seenContentType = "";
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenMethod = init?.method ?? "";
      seenContentType = new Headers(init?.headers).get("content-type") ?? "";
      return new Response(null, { status: 200 });
    },
    async () => { await putIntakeBytes("ut-1", "in-1", new Blob(["x"])); },
  );
  assert.equal(seenUrl, "/api/runtime/intake/documents/in-1/bytes");
  assert.equal(seenMethod, "PUT");
  assert.equal(seenContentType, "application/octet-stream");
});

test("putIntakeBytes: an abort re-throws UNCHANGED (never fabricated into a RuntimeError)", async () => {
  await withMockedFetch(
    async (_url, init) => new Promise((_resolve, reject) => {
      const abortErr = () => new DOMException("The operation was aborted.", "AbortError");
      if (init?.signal?.aborted) return reject(abortErr());
      init?.signal?.addEventListener("abort", () => reject(abortErr()));
    }),
    async () => {
      const controller = new AbortController();
      const promise = putIntakeBytes("ut-1", "in-1", new Blob(["x"]), controller.signal);
      controller.abort();
      await assert.rejects(promise, (e: unknown) => {
        assert.ok(!isRuntimeError(e));
        assert.equal((e as Error).name, "AbortError");
        return true;
      });
    },
  );
});

test("putIntakeBytes: a 5xx classifies as kind 'server_error', body never surfaced", async () => {
  await withMockedFetch(
    async () => new Response("storage down — internal detail", { status: 503 }),
    async () => {
      await assert.rejects(putIntakeBytes("ut-1", "in-1", new Blob(["x"])), (e: unknown) => {
        assert.ok(isRuntimeError(e));
        assert.equal(e.kind, "server_error");
        assert.doesNotMatch(e.message, /storage down/);
        return true;
      });
    },
  );
});

test("finalizeIntake: same-origin path, returns the receipt verbatim (including a recovery_refused body)", async () => {
  let seenUrl = "";
  const receipt = { status: "adopted", document_id: "doc-1", recovery_refused: { reason: "mime_mismatch", document_mime: "application/pdf", upload_mime: "image/png" } };
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return new Response(JSON.stringify(receipt), { status: 202 }); },
    async () => {
      const out = await finalizeIntake("ut-1", "in-1");
      assert.deepEqual(out, receipt);
    },
  );
  assert.equal(seenUrl, "/api/runtime/intake/documents/in-1/finalize");
});

// --- readIntake (masked-view poll read; DB-confirmed truth) --------------------

test("readIntake: reads document_intakes_visible filtered by id, returns null when absent", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return new Response(JSON.stringify([]), { status: 200 }); },
    async () => {
      const row = await readIntake("in-1", { session: session() });
      assert.equal(row, null);
    },
  );
  assert.match(seenUrl, /document_intakes_visible\?id=eq\.in-1/);
});

test("readIntake: forwards an AbortSignal through to the underlying read", async () => {
  let seenSignal: AbortSignal | undefined;
  await withMockedFetch(
    async (_url, init) => { seenSignal = init?.signal ?? undefined; return new Response(JSON.stringify([]), { status: 200 }); },
    async () => {
      const controller = new AbortController();
      await readIntake("in-1", { session: session(), signal: controller.signal });
      assert.equal(seenSignal, controller.signal);
    },
  );
});

// --- #633 AC1/AC8: THE BYTE-PROGRESS SEAM ------------------------------------
//
// `fetch` has no upload-progress event in any shipping browser, so real bytes
// require `XMLHttpRequest` + `upload.onprogress`. The seam keeps ONE transport
// contract with TWO bodies: the XHR one when a caller asked for progress AND the
// platform has XMLHttpRequest, the shipped `fetch` one otherwise (the Node path,
// and any browser call that wants no progress). Both must classify failures
// through the SAME `kindForStatus` taxonomy, or a 401 mid-upload would read as a
// transport blip on one path and a denial on the other.

type XhrStub = {
  method?: string; url?: string; headers: Record<string, string>; body?: unknown;
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void };
  status: number; responseURL: string; readyState: number;
  onload?: () => void; onerror?: () => void; onabort?: () => void; ontimeout?: () => void;
  open(m: string, u: string): void; setRequestHeader(k: string, v: string): void;
  send(b: unknown): void; abort(): void;
};

/** Installs a fake XMLHttpRequest and hands each constructed instance to `onSend`. */
function withFakeXhr(onSend: (xhr: XhrStub) => void, run: () => Promise<void>): Promise<void> {
  const g = globalThis as unknown as { XMLHttpRequest?: unknown };
  const original = g.XMLHttpRequest;
  const hadOwn = Object.prototype.hasOwnProperty.call(g, "XMLHttpRequest");
  class Fake {
    method?: string; url?: string; headers: Record<string, string> = {}; body?: unknown;
    upload: XhrStub["upload"] = {};
    status = 0; responseURL = ""; readyState = 0;
    onload?: () => void; onerror?: () => void; onabort?: () => void; ontimeout?: () => void;
    open(m: string, u: string) { this.method = m; this.url = u; this.responseURL = u; }
    setRequestHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }
    send(b: unknown) { this.body = b; onSend(this as unknown as XhrStub); }
    abort() { this.readyState = 4; this.onabort?.(); }
  }
  g.XMLHttpRequest = Fake as unknown;
  return run().finally(() => {
    if (hadOwn) g.XMLHttpRequest = original;
    else delete g.XMLHttpRequest;
  });
}

test("#633 putIntakeBytes: with onProgress the XHR path runs and reports REAL, MONOTONIC bytes", async () => {
  const seen: Array<{ sent: number; total: number }> = [];
  await withFakeXhr(
    (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 0, total: 900 });
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 300, total: 900 });
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 900, total: 900 });
      xhr.status = 200;
      xhr.onload?.();
    },
    async () => {
      await putIntakeBytes("ut-1", "in-1", new Blob(["x"]), {
        onProgress: (sent, total) => { seen.push({ sent, total }); },
      });
    },
  );
  assert.deepEqual(seen, [{ sent: 0, total: 900 }, { sent: 300, total: 900 }, { sent: 900, total: 900 }]);
});

test("#633 putIntakeBytes: a NON-computable progress event is dropped, never rendered as zero of zero", async () => {
  const seen: Array<{ sent: number; total: number }> = [];
  await withFakeXhr(
    (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
      xhr.status = 200;
      xhr.onload?.();
    },
    async () => {
      await putIntakeBytes("ut-1", "in-1", new Blob(["x"]), { onProgress: (sent, total) => { seen.push({ sent, total }); } });
    },
  );
  assert.deepEqual(seen, [{ sent: 5, total: 10 }], "an indeterminate event must not be dressed as a measurement");
});

test("#633 putIntakeBytes: the XHR path carries the upload token + octet-stream to the SAME same-origin path", async () => {
  let captured: XhrStub | null = null;
  await withFakeXhr(
    (xhr) => { captured = xhr; xhr.status = 200; xhr.onload?.(); },
    async () => { await putIntakeBytes("ut-9", "in-9", new Blob(["x"]), { onProgress: () => {} }); },
  );
  const xhr = captured as unknown as XhrStub;
  assert.equal(xhr.method, "PUT");
  assert.equal(xhr.url, "/api/runtime/intake/documents/in-9/bytes");
  assert.equal(xhr.headers.authorization, "Bearer ut-9");
  assert.equal(xhr.headers["content-type"], "application/octet-stream");
});

test("#633 putIntakeBytes: a 401 on the XHR path classifies 'unauthenticated' — the SAME taxonomy as the fetch path", async () => {
  await withFakeXhr(
    (xhr) => { xhr.status = 401; xhr.onload?.(); },
    async () => {
      await assert.rejects(
        putIntakeBytes("ut-1", "in-1", new Blob(["x"]), { onProgress: () => {} }),
        (e: unknown) => {
          assert.ok(isRuntimeError(e));
          assert.equal(e.kind, "unauthenticated");
          assert.equal(e.status, 401);
          return true;
        },
      );
    },
  );
});

test("#633 putIntakeBytes: XHR cannot refuse a redirect, so a FOLLOWED redirect is detected and named", async () => {
  // The fetch path passes `redirect: "manual"` and sees the proxy's 307-to-/login
  // as an opaqueredirect. XHR follows transparently and would otherwise report a 200
  // text/html login page as a successful upload. `responseURL` is the final URL after
  // redirects, so a path that moved is the honest signal — classified as the same
  // `unauthenticated` the fetch path raises, never a silent success.
  await withFakeXhr(
    (xhr) => { xhr.status = 200; xhr.responseURL = "https://app.example/login?next=%2F"; xhr.onload?.(); },
    async () => {
      await assert.rejects(
        putIntakeBytes("ut-1", "in-1", new Blob(["x"]), { onProgress: () => {} }),
        (e: unknown) => {
          assert.ok(isRuntimeError(e));
          assert.equal(e.kind, "unauthenticated");
          return true;
        },
      );
    },
  );
});

test("#633 putIntakeBytes: an abort on the XHR path re-throws an AbortError UNCHANGED", async () => {
  await withFakeXhr(
    () => { /* never completes on its own */ },
    async () => {
      const controller = new AbortController();
      const promise = putIntakeBytes("ut-1", "in-1", new Blob(["x"]), { onProgress: () => {}, signal: controller.signal });
      controller.abort();
      await assert.rejects(promise, (e: unknown) => {
        assert.ok(!isRuntimeError(e));
        assert.equal((e as Error).name, "AbortError");
        return true;
      });
    },
  );
});

test("#633 putIntakeBytes: a genuine XHR network failure is a typed 'transport' RuntimeError, never a raw rejection", async () => {
  await withFakeXhr(
    (xhr) => { xhr.onerror?.(); },
    async () => {
      await assert.rejects(
        putIntakeBytes("ut-1", "in-1", new Blob(["x"]), { onProgress: () => {} }),
        (e: unknown) => {
          assert.ok(isRuntimeError(e));
          assert.equal(e.kind, "transport");
          assert.equal(e.status, null);
          return true;
        },
      );
    },
  );
});

test("#633 putIntakeBytes: NO XMLHttpRequest (the Node path) falls back to fetch even when progress was asked for", async () => {
  const g = globalThis as unknown as { XMLHttpRequest?: unknown };
  const hadOwn = Object.prototype.hasOwnProperty.call(g, "XMLHttpRequest");
  const original = g.XMLHttpRequest;
  delete g.XMLHttpRequest;
  let fetched = false;
  try {
    await withMockedFetch(
      async () => { fetched = true; return new Response(null, { status: 200 }); },
      async () => { await putIntakeBytes("ut-1", "in-1", new Blob(["x"]), { onProgress: () => {} }); },
    );
  } finally {
    if (hadOwn) g.XMLHttpRequest = original;
  }
  assert.equal(fetched, true, "the fetch transport must still carry the bytes when no XHR exists");
});
