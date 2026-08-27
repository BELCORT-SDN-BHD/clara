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
