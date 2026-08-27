// intake.ts — upload/intake transport, ported mechanism from
// apps/dashboard/app/shared/intake.ts. Mocked at the fetch boundary throughout
// (this module's whole job is talking to two different origins — the same-origin
// `/api/intake` proxy and the runtime — so the boundary IS the fetch call).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beginIntake, putIntakeBytes, finalizeIntake, recoveryCopy, readIntake, intakeStatusCopy,
} from "./intake";
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

test("beginIntake: same-origin relative POST to /api/intake/documents, origin fixed to 'documents_tab'", async () => {
  let seenUrl = ""; let seenBody: unknown; let seenAuth = "";
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      seenAuth = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ intake_id: "in-1", upload_token: "ut-1", expires_at: null }), { status: 200 });
    },
    async () => {
      const out = await beginIntake({ filename: "a.pdf", mime: "application/pdf", declaredBytes: 10 }, { session: session() });
      assert.equal(out.intake_id, "in-1");
    },
  );
  assert.equal(seenUrl, "/api/intake/documents", "must be same-origin relative, never runtimeBase-prefixed");
  assert.equal((seenBody as Record<string, unknown>).origin, "documents_tab");
  assert.equal(seenAuth, "Bearer tok");
});

test("beginIntake: a non-ok response throws with the status + body text", async () => {
  await withMockedFetch(
    async () => new Response("quota exceeded", { status: 429 }),
    async () => {
      await assert.rejects(
        beginIntake({ filename: "a.pdf", mime: "application/pdf", declaredBytes: 10 }, { session: session() }),
        /begin intake failed \(429\): quota exceeded/,
      );
    },
  );
});

// --- putIntakeBytes / finalizeIntake ------------------------------------------

test("putIntakeBytes: PUTs octet-stream with the upload token, throws honestly on failure", async () => {
  let seenMethod = ""; let seenContentType = "";
  await withMockedFetch(
    async (_url, init) => {
      seenMethod = init?.method ?? "";
      seenContentType = new Headers(init?.headers).get("content-type") ?? "";
      return new Response(null, { status: 200 });
    },
    async () => { await putIntakeBytes("ut-1", "in-1", new Blob(["x"])); },
  );
  assert.equal(seenMethod, "PUT");
  assert.equal(seenContentType, "application/octet-stream");

  await withMockedFetch(
    async () => new Response("storage down", { status: 503 }),
    async () => {
      await assert.rejects(putIntakeBytes("ut-1", "in-1", new Blob(["x"])), /upload bytes failed \(503\)/);
    },
  );
});

test("finalizeIntake: returns the receipt verbatim (including a recovery_refused body)", async () => {
  const receipt = { status: "adopted", document_id: "doc-1", recovery_refused: { reason: "mime_mismatch", document_mime: "application/pdf", upload_mime: "image/png" } };
  await withMockedFetch(
    async () => new Response(JSON.stringify(receipt), { status: 202 }),
    async () => {
      const out = await finalizeIntake("ut-1", "in-1");
      assert.deepEqual(out, receipt);
    },
  );
});

test("recoveryCopy: a mime_mismatch refusal names both mime types honestly", () => {
  const copy = recoveryCopy({ recovery_refused: { reason: "mime_mismatch", document_mime: "application/pdf", upload_mime: "image/png" } });
  assert.equal(copy?.label, "Stored — not re-read (different file type)");
  assert.match(copy!.detail!, /stored as application\/pdf/);
  assert.match(copy!.detail!, /re-sent as image\/png/);
});

test("recoveryCopy: no recovery key at all (the ordinary case) returns null", () => {
  assert.equal(recoveryCopy({ status: "adopted", document_id: "doc-1" }), null);
  assert.equal(recoveryCopy(null), null);
});

// --- readIntake (masked-view poll read) ---------------------------------------

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

// --- intakeStatusCopy: every status named, never a fabricated percentage --------

test("intakeStatusCopy: every IntakeStatus renders a distinct, honest string", () => {
  const statuses = ["uploading", "received", "verifying", "verified", "duplicate", "finalized", "adopted", "failed"] as const;
  const rendered = new Set(statuses.map((s) => intakeStatusCopy(s, null)));
  assert.equal(rendered.size, statuses.length, "every status must render distinctly");
  assert.equal(intakeStatusCopy("finalized", null), "Stored — not yet filed");
  assert.equal(intakeStatusCopy("failed", "checksum_mismatch"), "Failed: checksum_mismatch");
});
