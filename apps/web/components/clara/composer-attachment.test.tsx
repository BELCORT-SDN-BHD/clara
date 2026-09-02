// Composer attachment parity on the real ClaraThreadView shared by rail + full
// screen. The upload is mocked only at the existing intake/PostgREST seams; the
// component, queue, turn post, stream-open authority and pending transcript are real.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk } from "../../test/keyboardWalk";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;
type Call = { url: string; method: string; body: unknown };

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const INTAKE_ID = "33333333-3333-4333-8333-333333333333";
const DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function App(clientId: string | null = CLIENT_ID): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      "div",
      null,
      createElement("h1", null, "Clara test context"),
      createElement(ClaraThreadView, { auth: session, threadId: THREAD_ID, variant: "full", clientId: clientId ?? undefined }),
    ),
  });
}

function withFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response, run: (calls: Call[]) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalRuntime = process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
  const calls: Call[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  delete process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    } else if (init?.body) {
      body = init.body;
    }
    calls.push({ url, method: init?.method ?? "GET", body });
    return impl(url, init);
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalRuntime === undefined) delete process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
    else process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL = originalRuntime;
  });
}

function baseRouter(url: string): Response | null {
  if (url.includes(`/api/chat/sessions/${THREAD_ID}/messages`)) return json({ messages: [] });
  if (url.includes("/rest/v1/clients")) {
    return json([{ id: CLIENT_ID, name: "ROME PROPERTIES", status: "active", created_at: "2026-01-01T00:00:00Z" }]);
  }
  if (url.includes("/rest/v1/onboarding_plans")) return json([]);
  return null;
}

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await h.settle();
  }
}

const buttonNamed = (name: string) => (node: Stub) => node.tagName === "BUTTON" && textOf(node).trim() === name;

/** The tray's controls are icon-only, so they are named by `aria-label`, not by text. */
const byAriaLabel = (pattern: RegExp) => (node: Stub) => {
  if (node.tagName !== "BUTTON") return false;
  const get = node.getAttribute as ((name: string) => string | null) | undefined;
  return pattern.test(get?.call(node, "aria-label") ?? "");
};

/** `h.find` proves a FIRST match exists; a CAP is a count, which no `find` can
 *  establish (the repo's own N1 lesson, interview-run-a11y.test.tsx:138). */
function findAllIn(root: Stub, predicate: (node: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  const walk = (node: Stub) => {
    if (predicate(node)) out.push(node);
    for (const child of (node.childNodes as Stub[] | undefined) ?? []) walk(child);
  };
  walk(root);
  return out;
}

test("firm altitude gets an HONEST NOTE, not a silently missing button — the wall it names is the filing act, not the intake", async () => {
  await withFetch(
    (url) => baseRouter(url) ?? (() => { throw new Error(`unexpected fetch: ${url}`); })(),
    async () => {
      const h = await renderComponent(App(null));
      try {
        await settleUntil(h, () => h.find((node) => node.tagName === "TEXTAREA") !== null, "firm composer");
        assert.equal(h.find(buttonNamed("Attach document")), null, "the affordance is absent where the product cannot file the result");
        assert.equal(h.find((node) => node.tagName === "INPUT" && node.type === "file"), null, "no hidden file input either");
        assert.match(
          h.text(),
          /Open a client's workspace to attach a document/,
          "an absent control must SAY it is absent and why (apps/web/AGENTS.md: never a fake control, never a silent one)",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});

test("client composer uses the existing intake seam and renders the intake's own 413 as a typed refusal", async () => {
  await withFetch(
    (url) => {
      const base = baseRouter(url);
      if (base) return base;
      if (url === "/api/runtime/intake/documents") return json({ error: "payload_too_large", message: "payload too large" }, 413);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.find(buttonNamed("Attach document")) !== null, "attach affordance");
        const fileInput = h.find((node) => node.tagName === "INPUT" && node.type === "file");
        assert.ok(fileInput);
        const file = new File([new Uint8Array([1, 2, 3])], "invoice.pdf", { type: "application/pdf", lastModified: 1 });
        await h.fireEvent(fileInput, "change", (node) => { node.files = [file]; });
        await settleUntil(h, () => /Upload refused/.test(h.text()), "413 refusal");
        assert.match(h.text(), /413/);
        assert.match(h.text(), /too large/i);
        // The seam, positively: this exact same-origin path, and no second one.
        const begin = calls.find((call) => call.url === "/api/runtime/intake/documents");
        assert.ok(begin, "the existing same-origin intake seam must receive the request");
        assert.equal(calls.some((call) => call.url.includes("multipart")), false);
        assert.equal(
          calls.some((call) => /upload|attach/i.test(call.url) && call.url !== "/api/runtime/intake/documents"),
          false,
          "a mutant that posts anywhere else must red here",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a 415 from the intake's MIME allowlist renders as its own typed refusal, not the generic one", async () => {
  await withFetch(
    (url) => {
      const base = baseRouter(url);
      if (base) return base;
      if (url === "/api/runtime/intake/documents") return json({ error: "bad_type", message: "declared MIME is not in the intake allowlist" }, 415);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.find(buttonNamed("Attach document")) !== null, "attach affordance");
        const fileInput = h.find((node) => node.tagName === "INPUT" && node.type === "file");
        assert.ok(fileInput);
        const file = new File([new Uint8Array([1])], "macro.xlsm", { type: "application/vnd.ms-excel.sheet.macroEnabled.12", lastModified: 3 });
        await h.fireEvent(fileInput, "change", (node) => { node.files = [file]; });
        await settleUntil(h, () => /does not accept this file type/.test(h.text()), "415 refusal");
        assert.match(h.text(), /415/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the sixth attachment is refused HERE, because the DB's own five-per-turn wall reaches the caller as a bare 500", async () => {
  await withFetch(
    (url) => {
      const base = baseRouter(url);
      if (base) return base;
      // Every file fails fast at begin: this cell is about HOW MANY rows the composer
      // admits, not about the upload itself.
      if (url === "/api/runtime/intake/documents") return json({ error: "bad_request", message: "bad request" }, 400);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.find(buttonNamed("Attach document")) !== null, "attach affordance");
        const fileInput = h.find((node) => node.tagName === "INPUT" && node.type === "file");
        assert.ok(fileInput);
        const files = Array.from({ length: 6 }, (_, i) => (
          new File([new Uint8Array([i])], `invoice-${i}.pdf`, { type: "application/pdf", lastModified: 100 + i })
        ));
        await h.fireEvent(fileInput, "change", (node) => { node.files = files; });
        await settleUntil(h, () => /at most 5 attachments/.test(h.text()), "the local five-per-turn refusal");
        assert.equal(
          findAllIn(h.container, (node) => node.tagName === "LI").length,
          5,
          "clara._tf_validate_chat_attachments raises CLR10 above five, and chatRoutes maps CLR10 to nothing but a 500",
        );
        const attach = h.find(buttonNamed("Attach document"));
        assert.ok(attach);
        assert.equal(attach.disabled, true, "at capacity the affordance is disabled rather than offering a refusal");
      } finally {
        await h.unmount();
      }
    },
  );
});

/** The intake + filing legs, shared by the two cells that need an attachment to reach
 *  "Filed". Kept out of `baseRouter` so the cells that must NOT see them still throw. */
function intakeRouter(url: string, init?: RequestInit, onFiled?: (body: Record<string, unknown>) => void): Response | null {
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
  if (url.includes("/rest/v1/rpc/file_document")) {
    onFiled?.(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return json(null);
  }
  return null;
}

test("a FAILED upload does not brick the composer: a plain-text turn still sends, without it", async () => {
  // Review N4. `blocked` used to be "any item not ready", so one errored upload left the
  // human unable to send ANY message — plain text included — until they found the row's
  // remove button, behind a disabled Send that said nothing about why. Only states an
  // item can still LEAVE on its own block now. The failed row stays on screen with its
  // typed refusal, and `clearDone` does not sweep it, so the turn goes without it VISIBLY.
  await withFetch(
    (url) => {
      if (url.includes(`/api/chat/sessions/${THREAD_ID}/messages`)) return json({ messages: [] });
      const base = baseRouter(url);
      if (base) return base;
      if (url === "/api/runtime/intake/documents") return json({ error: "bad_request", message: "bad request" }, 400);
      if (url === `/api/chat/${THREAD_ID}/turns`) return json({ task_id: "task-1" }, 202);
      if (url === "/api/tasks/task-1/stream") {
        return new Response(
          `event: message\ndata: ${JSON.stringify({ taskId: "task-1", status: "completed", parts: [] })}\n\nevent: done\ndata: ${JSON.stringify({ taskId: "task-1", status: "completed" })}\n\n`,
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.find(buttonNamed("Attach document")) !== null, "attach affordance");
        const fileInput = h.find((node) => node.tagName === "INPUT" && node.type === "file");
        assert.ok(fileInput);
        const file = new File([new Uint8Array([9])], "broken.pdf", { type: "application/pdf", lastModified: 11 });
        await h.fireEvent(fileInput, "change", (node) => { node.files = [file]; });
        await settleUntil(h, () => /Upload refused/.test(h.text()), "the failed row");

        const textarea = h.find((node) => node.tagName === "TEXTAREA");
        assert.ok(textarea);
        await h.act(() => setFieldValue(textarea, "never mind the file, here is my question"));
        const send = h.find(buttonNamed("Send"));
        assert.ok(send);
        assert.equal(send.disabled, false, "a terminal failure must not hold the composer hostage");

        // Review N3, the other half: Retry only renders on a failed row, so this is where
        // its 24px target gets pinned.
        const retry = h.find(byAriaLabel(/^Retry /));
        assert.ok(retry, "a failed row must offer a retry");
        assert.match(String(retry.className), /\bsize-6\b/, "the tray's controls sit exactly ON the 24px minimum");

        const form = h.find((node) => node.tagName === "FORM");
        assert.ok(form);
        await h.fireEvent(form, "submit");
        await settleUntil(h, () => calls.some((call) => call.url === `/api/chat/${THREAD_ID}/turns`), "the text-only turn");
        const turn = calls.find((call) => call.url === `/api/chat/${THREAD_ID}/turns`);
        assert.ok(turn);
        assert.deepEqual(
          (turn.body as { parts: unknown[] }).parts,
          [{ type: "text", text: "never mind the file, here is my question" }],
          "a failed upload contributes no part — it was never adopted",
        );
        assert.match(h.text(), /Upload refused/, "…and it stays on screen, so the turn going without it is visible, not silent");
      } finally {
        await h.unmount();
      }
    },
  );
});

// The client-scope boundary for these attachments lives in
// ./composer-attachment-scope.test.tsx — split out to keep both files under the
// 500-line convention.

test("ready attachment is filed to the activated client and rides the sent turn as its document reference", async () => {
  let messageReads = 0;
  let filedBody: Record<string, unknown> | null = null;
  const attachment = { type: "attachment", intake_id: INTAKE_ID, document_id: DOCUMENT_ID } as const;
  await withFetch(
    (url, init) => {
      if (url.includes(`/api/chat/sessions/${THREAD_ID}/messages`)) {
        messageReads += 1;
        return json({
          messages: messageReads === 1 ? [] : [{
            id: "message-1",
            role: "user",
            parts: [{ type: "text", text: "Read this invoice" }, attachment],
            turn_key: "turn-1",
            task_id: "task-1",
            seq: 1,
            created_at: "2026-09-02T00:00:00Z",
          }],
        });
      }
      const base = baseRouter(url);
      if (base) return base;
      const intake = intakeRouter(url, init, (body) => { filedBody = body; });
      if (intake) return intake;
      if (url === `/api/chat/${THREAD_ID}/turns`) return json({ task_id: "task-1" }, 202);
      if (url === "/api/tasks/task-1/stream") {
        const sse = [
          `event: message\ndata: ${JSON.stringify({ taskId: "task-1", status: "completed", parts: [] })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ taskId: "task-1", status: "completed" })}\n\n`,
        ].join("");
        return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.find(buttonNamed("Attach document")) !== null, "attach affordance");
        const fileInput = h.find((node) => node.tagName === "INPUT" && node.type === "file");
        assert.ok(fileInput);
        const file = new File([new Uint8Array([1, 2, 3])], "invoice.pdf", { type: "application/pdf", lastModified: 2 });
        await h.fireEvent(fileInput, "change", (node) => { node.files = [file]; });
        await settleUntil(h, () => /Filed/.test(h.text()), "adopted + filed attachment");

        // Review N3: the tray's own controls sit on the THINNEST margin in this diff —
        // `size="icon-xs"` is `size-6`, exactly 24px — and carried no assertion at all, so
        // a future size tweak could drop them below the bar silently. Pinned by the same
        // class-token idiom the attach button uses below (`checkAccessibility` has no
        // target-size rule to measure with). Asserted HERE, before the send: `clearDone`
        // sweeps the ready row afterwards. Retry is pinned on the FAILED cell, the only
        // state it renders in.
        const remove = h.find(byAriaLabel(/^Remove /));
        assert.ok(remove, "a filed row must still be removable");
        assert.match(String(remove.className), /\bsize-6\b/, "the tray's controls sit exactly ON the 24px minimum");

        const textarea = h.find((node) => node.tagName === "TEXTAREA");
        assert.ok(textarea);
        await h.act(() => setFieldValue(textarea, "Read this invoice"));
        const form = h.find((node) => node.tagName === "FORM");
        assert.ok(form);
        await h.fireEvent(form, "submit");
        await settleUntil(h, () => h.text().includes(DOCUMENT_ID), "document reference in sent turn");

        const begin = calls.find((call) => call.url === "/api/runtime/intake/documents");
        assert.ok(begin);
        assert.deepEqual(begin.body, {
          filename: "invoice.pdf",
          mime: "application/pdf",
          declared_bytes: 3,
          origin: "chat",
          session_id: THREAD_ID,
        });
        assert.equal("client_id" in (begin.body as Record<string, unknown>), false, "client identity never rides the caller-shaped intake body");
        assert.equal((filedBody as { p_client?: string } | null)?.p_client, CLIENT_ID, "filing is scoped by the activated client prop");

        const turn = calls.find((call) => call.url === `/api/chat/${THREAD_ID}/turns`);
        assert.ok(turn);
        const turnBody = turn.body as { parts: unknown[] };
        assert.deepEqual(turnBody.parts, [{ type: "text", text: "Read this invoice" }, attachment]);
        assert.equal(calls.some((call) => call.url.includes("/api/chat-attachments")), false, "no second upload path may be minted");

        const attachButton = h.find(buttonNamed("Attach document"));
        assert.ok(attachButton);
        assert.match(String(attachButton.className), /\bsize-8\b/, "attach target must be at least 24px");
        assert.deepEqual(checkAccessibility(h.container as never), []);
        assert.deepEqual(checkKeyboardWalk(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});
