// THE CLIENT-SCOPE BOUNDARY FOR COMPOSER ATTACHMENTS (fold round, review M1).
//
// The Clara rail outlives a client switch by construction: `<RailMount />` is a SIBLING
// of `{children}` in `app/(firm)/layout.tsx`, while `ClientScopeProvider` lives one layout
// down in `app/(firm)/clients/[clientId]/layout.tsx`. Nested layouts compose, so the rail
// is never inside the keyed subtree and never remounts — and the attachment tray is the
// first CLIENT-OWNED DATA that view holds. `components/client-scope-provider.tsx:10-13`
// names this exact hazard ("an open Clara-rail thread — none of it may survive a
// `clientId` change") but cannot reach the rail from where it is mounted.
//
// Nothing downstream catches it either: `clara._tf_validate_chat_attachments`
// (packages/db/migrations/0007_document_pipeline.sql:601-633) admits on firm +
// task-author + adopted intake + matching document_id, with NO client scoping anywhere in
// that wall. That is the same measurement this train made for the intake BODY, and it is
// exactly why the wall cannot stand in for this reset.
//
// Both cells flip `clientId` as a PROP CHANGE with no remount — the production event.
// A cell that unmounted and re-rendered would prove nothing, because unmounting is the one
// thing that already worked. The two arms cover the two halves of the fix, and each half
// has its own mutant: the parent's `[clientId, threadId]` reset (the firm arm, where the
// control unmounts and can no longer report anything) and the control's `key` (the
// client→client arm, where the queue's `ref.current` rows would otherwise survive the prop
// change and re-populate the parent on the next render).
//
// Split out of composer-attachment.test.tsx to keep both files under the 500-line
// convention.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { claraThreadStore } from "../../lib/clara/threadStore";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;
type Call = { url: string; body: unknown };

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_A = "22222222-2222-4222-8222-222222222222";
const CLIENT_B = "55555555-5555-4555-8555-555555555555";
const INTAKE_ID = "33333333-3333-4333-8333-333333333333";
const DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withFetch(impl: (url: string, init?: RequestInit) => Response, run: (calls: Call[]) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const calls: Call[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  // NO runtime-base variable is deleted here any more. It used to be: the chat lane read
  // a browser-exposed base URL, and every suite had to unset it to make the URLs below
  // app-relative — which is exactly why nothing caught that both of its states were dead
  // on a deployed origin. The lane is same-origin now (lib/clara/api.ts's header), so
  // there is no variable left to neutralise; `lib/clara/api.test.ts` pins the strings.
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    calls.push({ url, body });
    return impl(url, init);
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

/** Every leg the walk needs: the transcript read, the whole intake+filing sequence, the
 *  turn post and a stream that opens and terminates immediately. */
function router(url: string, init?: RequestInit): Response {
  if (url.includes(`/api/runtime/chat/sessions/${THREAD_ID}/messages`)) return json({ messages: [] });
  if (url.includes("/rest/v1/clients")) {
    return json([
      { id: CLIENT_A, name: "ROME PROPERTIES", status: "active", created_at: "2026-01-01T00:00:00Z" },
      { id: CLIENT_B, name: "ROME SECRETARY", status: "active", created_at: "2026-01-01T00:00:00Z" },
    ]);
  }
  if (url.includes("/rest/v1/onboarding_plans")) return json([]);
  if (url === "/api/runtime/intake/documents") return json({ intake_id: INTAKE_ID, upload_token: "upload-token", expires_at: null }, 201);
  if (url === `/api/runtime/intake/documents/${INTAKE_ID}/bytes`) return new Response(null, { status: 204 });
  if (url === `/api/runtime/intake/documents/${INTAKE_ID}/finalize`) return json({ status: "finalized", document_id: DOCUMENT_ID }, 202);
  if (url.includes("/rest/v1/document_intakes_visible")) {
    return json([{
      id: INTAKE_ID, uploaded_by: "user-1", origin: "chat", original_filename: "invoice.pdf",
      declared_mime: "application/pdf", declared_bytes: 3, status: "finalized", document_id: DOCUMENT_ID,
      failure_code: null, expires_at: null,
      created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T00:00:01Z",
    }]);
  }
  if (url.includes("/rest/v1/rpc/record_client_resolution")) return json({ resolution_id: "resolution-1" });
  if (url.includes("/rest/v1/rpc/file_document")) { void init; return json(null); }
  if (url === `/api/runtime/chat/${THREAD_ID}/turns`) return json({ task_id: "task-1" }, 202);
  if (url === "/api/runtime/tasks/task-1/stream") {
    return new Response(
      `event: message\ndata: ${JSON.stringify({ taskId: "task-1", status: "completed", parts: [] })}\n\nevent: done\ndata: ${JSON.stringify({ taskId: "task-1", status: "completed" })}\n\n`,
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  }
  throw new Error(`unexpected fetch: ${url}`);
}

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await h.settle();
  }
}

const buttonNamed = (name: string) => (node: Stub) => node.tagName === "BUTTON" && textOf(node).trim() === name;

/** Mounts the REAL ClaraThreadView under a `clientId` the test can flip in place. */
function mountSwitcher(): { element: ReactElement; setClient: () => (next: string | undefined) => void } {
  let setter: ((next: string | undefined) => void) | null = null;
  function Switcher(): ReactElement {
    const [clientId, setClientId] = useState<string | undefined>(CLIENT_A);
    setter = setClientId;
    return createElement(ClaraThreadView, { auth: session, threadId: THREAD_ID, variant: "full", clientId });
  }
  return {
    element: createElement(NextIntlClientProvider, {
      locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
      children: createElement("div", null, createElement("h1", null, "Clara test context"), createElement(Switcher)),
    }),
    setClient: () => setter!,
  };
}

async function attachUnderClientA(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  await settleUntil(h, () => h.find(buttonNamed("Attach document")) !== null, "attach affordance under client A");
  const fileInput = h.find((node) => node.tagName === "INPUT" && node.type === "file");
  assert.ok(fileInput);
  const file = new File([new Uint8Array([1, 2, 3])], "invoice.pdf", { type: "application/pdf", lastModified: 7 });
  await h.fireEvent(fileInput, "change", (node) => { node.files = [file]; });
  await settleUntil(h, () => /Filed/.test(h.text()), "client A's attachment reaching Filed");
}

async function sendAndReadTheWire(h: Awaited<ReturnType<typeof renderComponent>>, calls: Call[], text: string): Promise<unknown[]> {
  const textarea = h.find((node) => node.tagName === "TEXTAREA");
  assert.ok(textarea);
  await h.act(() => setFieldValue(textarea, text));
  const form = h.find((node) => node.tagName === "FORM");
  assert.ok(form);
  await h.fireEvent(form, "submit");
  await settleUntil(h, () => calls.some((call) => call.url === `/api/runtime/chat/${THREAD_ID}/turns`), "the turn");
  const turn = calls.find((call) => call.url === `/api/runtime/chat/${THREAD_ID}/turns`);
  assert.ok(turn);
  return (turn.body as { parts: unknown[] }).parts;
}

test("client A -> the FIRM altitude: the filed attachment does not ride the next turn", async () => {
  const { element, setClient } = mountSwitcher();
  await withFetch(router, async (calls) => {
    const h = await renderComponent(element);
    try {
      await attachUnderClientA(h);

      // The altitude really changed — asserted BEFORE the payload claim, so a cell that
      // silently failed to switch could not pass on the payload alone.
      await h.act(() => setClient()(undefined));
      await settleUntil(h, () => h.find(buttonNamed("Attach document")) === null, "the firm altitude");
      assert.match(h.text(), /Open a client's workspace to attach a document/);
      assert.equal(h.find((node) => node.tagName === "INPUT" && node.type === "file"), null, "the tray is gone with the control");

      assert.deepEqual(
        await sendAndReadTheWire(h, calls, "unrelated firm question"),
        [{ type: "text", text: "unrelated firm question" }],
        "a document filed to client A must never ride a turn sent at another altitude",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("client A -> client B: the tray empties and the filed attachment does not ride B's turn", async () => {
  const { element, setClient } = mountSwitcher();
  await withFetch(router, async (calls) => {
    const h = await renderComponent(element);
    try {
      await attachUnderClientA(h);

      // Client→client is the arm the `key` owns: the control stays MOUNTED across this
      // change, so without a fresh key `useUploadQueue`'s `ref.current` keeps A's ready
      // row and re-reports its part to the parent on the next render.
      await h.act(() => setClient()(CLIENT_B));
      await settleUntil(h, () => !/Filed/.test(h.text()), "B's empty tray");
      assert.ok(h.find(buttonNamed("Attach document")), "B still has its own attach affordance");
      assert.doesNotMatch(h.text(), /invoice\.pdf/, "A's row must not be sitting in B's tray");

      assert.deepEqual(
        await sendAndReadTheWire(h, calls, "a question about client B"),
        [{ type: "text", text: "a question about client B" }],
        "a document filed to client A must never ride client B's turn",
      );
    } finally {
      await h.unmount();
    }
  });
});

// #614 A7 ("Scope switch") — THE COMPOSER DRAFT'S OWN ISOLATION. Same defect
// class as the attachment tray above (a rail/full-screen mount that outlives a
// scope change), same production event (`setClient()` flips `clientId` as a
// bare PROP CHANGE, no remount), but the FIX is different: the tray above is
// reset by an effect keyed on `[clientId, threadId]`; a draft cannot be reset
// that way without racing the human's own next keystroke, so it is instead
// held OUTSIDE this component entirely — `claraThreadStore`'s `drafts`, keyed
// by `(altitude, threadId)` — and simply read fresh for whichever key is
// current. Spec #612 decision 5: "Layout remounts must not own the only copy
// of drafts, accepted questions or history state."

function draftBox(h: { find: (p: (n: Stub) => boolean) => Stub | null }): Stub {
  const node = h.find((n) => n.tagName === "TEXTAREA");
  assert.ok(node, "the composer textarea must be mounted");
  return node;
}

/** A STATIC counterpart to `mountSwitcher` — no in-place setter, for the two
 *  tests below that prove the draft survives an actual UNMOUNT + remount
 *  (a closed rail, or any other structural teardown) rather than a live prop
 *  change. Same fixed `THREAD_ID` as `mountSwitcher`, deliberately: the point
 *  of both rigs is to isolate ONE variable at a time. */
function mountUnderClient(clientId: string | undefined): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement("div", null,
      createElement("h1", null, "Clara test context"),
      createElement(ClaraThreadView, { auth: session, threadId: THREAD_ID, variant: "full", clientId })),
  });
}

test("client A -> client B -> client A: A's draft survives the round trip, B starts empty (issue 614, A7)", async () => {
  const { element, setClient } = mountSwitcher();
  await withFetch(router, async () => {
    const h = await renderComponent(element);
    try {
      await settleUntil(h, () => h.find((n) => n.tagName === "TEXTAREA") !== null, "the composer");
      await h.act(() => setFieldValue(draftBox(h), "A's half-written question"));
      assert.equal((draftBox(h) as { value: string }).value, "A's half-written question");

      // THE ALTITUDE CHANGED, THE THREAD ID DID NOT (mountSwitcher's own point) —
      // if the draft were keyed by threadId alone this would carry A's text
      // straight into B's box, which is exactly the leak A7 rules out.
      await h.act(() => setClient()(CLIENT_B));
      await settleUntil(
        h,
        () => (draftBox(h) as { value: string }).value === "",
        "B's empty composer — A's text must not ride the switch",
      );

      await h.act(() => setClient()(CLIENT_A));
      await settleUntil(
        h,
        () => (draftBox(h) as { value: string }).value === "A's half-written question",
        "A's draft restored on the way back",
      );
    } finally {
      await h.unmount();
      claraThreadStore.clearDraft(CLIENT_A, THREAD_ID);
      claraThreadStore.clearDraft(CLIENT_B, THREAD_ID);
    }
  });
});

test("a remount under the SAME scope keeps the draft — no layout remount may own the only copy of it (issue 614, A7, spec 612 decision 5)", async () => {
  await withFetch(router, async () => {
    const h1 = await renderComponent(mountUnderClient(CLIENT_A));
    try {
      await settleUntil(h1, () => h1.find((n) => n.tagName === "TEXTAREA") !== null, "the composer");
      await h1.act(() => setFieldValue(draftBox(h1), "half-written, then torn down"));
    } finally {
      await h1.unmount();
    }
    // A fresh mount of the SAME conversation — e.g. `<RailMount/>`'s own key
    // remounting the whole rail subtree on a client switch that lands back on
    // a scope it already visited, or the plain remount below proves directly.
    const h2 = await renderComponent(mountUnderClient(CLIENT_A));
    try {
      await settleUntil(h2, () => h2.find((n) => n.tagName === "TEXTAREA") !== null, "the composer, again");
      assert.equal((draftBox(h2) as { value: string }).value, "half-written, then torn down");
    } finally {
      await h2.unmount();
      claraThreadStore.clearDraft(CLIENT_A, THREAD_ID);
    }
  });
});

test("closing the rail and reopening it shows the same draft — closing the Sheet must not cancel Work (issue 614, A7)", async () => {
  await withFetch(router, async () => {
    const h1 = await renderComponent(mountUnderClient(CLIENT_A));
    try {
      await settleUntil(h1, () => h1.find((n) => n.tagName === "TEXTAREA") !== null, "the composer");
      await h1.act(() => setFieldValue(draftBox(h1), "still mid-sentence"));
      // `ClaraRail` returns the launcher once `presence === "closed"`
      // (ClaraRail.tsx) — this flag plus the unmount below is what a real
      // rail close actually does to this view. The draft has to survive it
      // with no help from this component's own lifecycle.
      claraThreadStore.setRailOpen(false);
    } finally {
      await h1.unmount();
    }
    claraThreadStore.setRailOpen(true);
    const h2 = await renderComponent(mountUnderClient(CLIENT_A));
    try {
      await settleUntil(h2, () => h2.find((n) => n.tagName === "TEXTAREA") !== null, "the reopened composer");
      assert.equal((draftBox(h2) as { value: string }).value, "still mid-sentence");
    } finally {
      await h2.unmount();
      claraThreadStore.clearDraft(CLIENT_A, THREAD_ID);
      claraThreadStore.setRailOpen(true);
    }
  });
});

test("a successful send clears the stored draft — a refused turn must not (issue 614, A7)", async () => {
  await withFetch(router, async (calls) => {
    const h = await renderComponent(mountUnderClient(CLIENT_A));
    try {
      await settleUntil(h, () => h.find((n) => n.tagName === "TEXTAREA") !== null, "the composer");
      await sendAndReadTheWire(h, calls, "a question that will actually send");
      await settleUntil(
        h,
        () => (draftBox(h) as { value: string }).value === "",
        "the draft clears once the turn's stream opens",
      );
      assert.equal(
        claraThreadStore.getDraft(CLIENT_A, THREAD_ID),
        "",
        "the store entry itself is gone, not only the rendered box",
      );
    } finally {
      await h.unmount();
    }
  });
});
