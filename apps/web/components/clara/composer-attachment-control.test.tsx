// #633 FIX ROUND 1 — THE COMPOSER'S SEND GATE, DRIVEN THROUGH THE REAL COMPONENT.
//
// Review finding STANDARDS-F1: nothing in `apps/web` mounted this component or exercised
// its `blocked` gate, and the one cell that claimed to pin `COMPOSER_IN_FLIGHT_STATES`
// compared three hand-written literals with each other. The strings are now pinned against
// the live export (`lib/documents/useUploadQueue.test.ts`); this file closes the other half —
// the GATE itself, driven by mounting the real control over the real `useUploadQueue` with
// fetch mocked at the boundary.
//
// TWO ARMS, and they must disagree:
//   * an upload still IN FLIGHT (the intake sits `verifying`) reports `blocked: true` and
//     contributes NO part — sending now would drop a file about to become attachable;
//   * the same upload, once the intake is `adopted` and FILED, reports `blocked: false`
//     and contributes exactly one `attachment` part carrying both ids.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { ComposerAttachmentControl, COMPOSER_IN_FLIGHT_STATES, type ComposerAttachmentState } from "./ComposerAttachmentControl";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";

const CLIENT = "c1111111-1111-4111-8111-111111111111";
const THREAD = "t1111111-1111-4111-8111-111111111111";

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
}

function fakeFile(name: string): File {
  return new File([new Uint8Array(16)], name, { type: "application/pdf", lastModified: 1 });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const intakeRow = (over: Record<string, unknown>) => ({
  id: "in-1", uploaded_by: "u1", origin: "chat", original_filename: "a.pdf",
  declared_mime: "application/pdf", declared_bytes: 16, status: "verifying",
  document_id: null, failure_code: null, expires_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
});

/** `settles: false` parks the intake on `verifying` for ever — the in-flight arm. */
function composerFetch(settles: boolean): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/intake\/documents$/.test(url)) return json({ intake_id: "in-1", upload_token: "ut-1", expires_at: null });
    if (/\/bytes$/.test(url)) return new Response(null, { status: 200 });
    if (/\/finalize$/.test(url)) return json({ status: "adopted", document_id: null }, 202);
    if (/document_intakes_visible/.test(url)) {
      return json([settles
        ? intakeRow({ status: "adopted", document_id: "doc-in-1" })
        : intakeRow({ status: "verifying" })]);
    }
    if (/record_client_resolution/.test(url)) return json({ resolution_id: "res-1" });
    if (/file_document/.test(url)) return json({});
    return json([]);
  }) as typeof fetch;
}

function wrap(node: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children: node,
  });
}

async function withComposer(
  settles: boolean,
  run: (h: Awaited<ReturnType<typeof renderComponent>>, read: () => ComposerAttachmentState) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = composerFetch(settles);
  let latest: ComposerAttachmentState = { parts: [], blocked: false };
  const h = await renderComponent(wrap(createElement(ComposerAttachmentControl, {
    clientId: CLIENT,
    threadId: THREAD,
    session: session(),
    clearToken: 0,
    disabled: false,
    onStateChange: (state: ComposerAttachmentState) => { latest = state; },
  })));
  try {
    await run(h, () => latest);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalSupabase === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabase;
  }
}

async function attach(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const input = h.find((n) => n.tagName === "INPUT")!;
  assert.ok(input, "the control renders a file input");
  await h.fireEvent(input, "change", (n) => { (n as unknown as { files: unknown[] }).files = [fakeFile("a.pdf")]; });
  for (let i = 0; i < 20; i++) await h.settle();
}

test("[633] the composer BLOCKS Send while an upload is still in flight — and contributes no part", async () => {
  await withComposer(false, async (h, read) => {
    await attach(h);
    const state = read();
    assert.equal(state.blocked, true, "an intake still verifying must block Send — the file is about to become attachable");
    assert.deepEqual(state.parts, [], "an unsettled upload contributes NOTHING to the turn");
    // The gate is the LIVE set, not a copy: the state the row actually sits in is one of
    // its members, so deleting a member from the export would flip this cell red.
    assert.ok(COMPOSER_IN_FLIGHT_STATES.has("verifying"), "the state this arm parks on is one the LIVE exported gate blocks on");
  });
});

test("[633] the composer RELEASES Send once the file is adopted and filed — with exactly one part", async () => {
  await withComposer(true, async (h, read) => {
    await attach(h);
    const state = read();
    assert.equal(state.blocked, false, "a settled, filed upload must not hold the composer shut");
    assert.deepEqual(state.parts, [{ type: "attachment", intake_id: "in-1", document_id: "doc-in-1" }]);
  });
});
