// P6-5 — three failures the Clara thread could not recover from, each driven through the
// REAL component:
//
//   1. A FAILED FIRST TRANSCRIPT READ STRANDED THE RAIL FOREVER (found by the P6-6 lane on
//      main). `useClaraThread`'s load effect fires once per thread id; a rejection called
//      `hydrateFailed`, which sets `loadError` and leaves `messagesLoaded` false. The view's
//      loading arm was `!messagesLoaded` and its ERROR arm was `loadError && messagesLoaded`
//      — so the only branch that could report the failure required the flag that only a
//      SUCCESS sets. Result: "Loading the conversation…" with no error, no retry, and no
//      second attempt.
//   2. A RELOAD DURING A PARKED QUESTION LOST THE QUESTION. The clarify lives only in the SSE
//      buffer (lib/clara/liveClarify.ts), which a page load does not have.
//   3. NO HONEST PROGRESS SIGNAL while a turn ran (裁-132).

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { clickButton, renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const INTERRUPTION_ID = "33333333-3333-4333-8333-333333333333";
const QUESTION = "Which client owns this invoice?";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function App(): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      "div",
      null,
      createElement("h1", null, "Clara test context"),
      createElement(ClaraThreadView, { auth: session, threadId: THREAD_ID, variant: "full" }),
    ),
  });
}

function withFetch(impl: (url: string) => Response, run: (calls: string[]) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalRuntime = process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
  const calls: string[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  delete process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return impl(url);
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalRuntime === undefined) delete process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
    else process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL = originalRuntime;
  });
}

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await h.settle();
  }
}

const buttonNamed = (name: string) => (node: Stub) => node.tagName === "BUTTON" && textOf(node).trim() === name;

const NO_RUN = (url: string): Response | null => {
  if (url.includes("agent_tasks_visible")) return json([]);
  if (url.includes("caller_context")) return json([]);
  return null;
};

// ---------------------------------------------------------------------------
// 1. The stranded rail
// ---------------------------------------------------------------------------

test("a FAILED first transcript read reports the failure and offers a retry — it never sits on Loading", async () => {
  let attempts = 0;
  await withFetch(
    (url) => {
      const shared = NO_RUN(url);
      if (shared) return shared;
      if (url.includes(`/api/chat/sessions/${THREAD_ID}/messages`)) {
        attempts += 1;
        // The first read fails the way a real one does — a 500 from the runtime.
        if (attempts === 1) return json({ error: "internal" }, 500);
        return json({ messages: [{ id: "m1", role: "assistant", parts: [{ type: "text", text: "Recovered transcript." }], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-02T00:00:00Z" }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => /Could not load the conversation/.test(h.text()), "the honest error arm");

        // THE THREE STATES ARE DISTINGUISHABLE: the error is up and the loading line is GONE.
        // Asserting only the error would pass on a build that rendered both at once, which is
        // the state the human was actually stuck in.
        assert.doesNotMatch(h.text(), /Loading the conversation…/, "the loading state must not persist under the error");

        const retry = h.find(buttonNamed("Try again"));
        assert.ok(retry, "the failure carries a way out — the once-per-thread guard makes a manual retry the only recovery short of a reload");

        await h.act(() => clickButton(retry));
        await settleUntil(h, () => /Recovered transcript\./.test(h.text()), "the retried read's transcript");
        assert.equal(attempts, 2, "the retry re-armed the once-per-thread guard and genuinely re-read");
        assert.doesNotMatch(h.text(), /Could not load the conversation/, "a successful retry clears the error");

        assert.deepEqual(checkAccessibility(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a load failure AFTER a successful read keeps the transcript on screen under the error", async () => {
  // The other half of the three-state rule: an error must not blank a transcript the human is
  // reading. `messagesLoaded` stays true, so the messages render and the banner sits beside them.
  let attempts = 0;
  await withFetch(
    (url) => {
      const shared = NO_RUN(url);
      if (shared) return shared;
      if (url.includes(`/api/chat/sessions/${THREAD_ID}/messages`)) {
        attempts += 1;
        if (attempts === 1) {
          return json({ messages: [{ id: "m1", role: "assistant", parts: [{ type: "text", text: "The first transcript." }], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-02T00:00:00Z" }] });
        }
        return json({ error: "internal" }, 500);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => /The first transcript\./.test(h.text()), "the first transcript");
        const retry = h.find(buttonNamed("Try again"));
        assert.equal(retry, null, "a healthy thread shows no retry");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// 2. The parked question after a reload
// ---------------------------------------------------------------------------

test("a MOUNT during a parked turn re-attaches the question from the DB — no stream involved", async () => {
  // This is a page reload: the component mounts fresh, there is no SSE attachment and no
  // provisional buffer at all. Everything on screen has to come from a read.
  await withFetch(
    (url) => {
      if (url.includes(`/api/chat/sessions/${THREAD_ID}/messages`)) return json({ messages: [] });
      if (url.includes("agent_tasks_visible")) return json([{ id: TASK_ID, status: "awaiting_input", created_at: new Date(Date.now() - 42_000).toISOString() }]);
      if (url.includes("agent_interruptions")) {
        return json([{
          id: INTERRUPTION_ID, task_id: TASK_ID, kind: "clarify",
          question: { type: "clarify", question: QUESTION, context: null, framing: "" },
          answer: null, status: "pending", asked_of: null, answered_by: null,
          expires_at: "2026-09-03T00:00:00Z", created_at: "2026-09-02T00:00:00Z", answered_at: null,
        }]);
      }
      if (url.includes("caller_context")) return json([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.text().includes(QUESTION), "the rehydrated question");
        // ANSWERABLE, not merely visible — the whole point is that the human can act on it.
        await settleUntil(h, () => h.find(buttonNamed("Answer")) !== null, "the inline answer control");

        assert.equal(
          calls.filter((u) => u.includes("/api/tasks/")).length,
          0,
          "no stream was opened — this question came from the database, which is the only place it exists after a reload",
        );

        // 裁-132's indicator, on the PARKED wording, off the DB-read start.
        assert.match(h.text(), /Clara has been waiting on your answer for 0:4[0-9]\./, "the parked elapsed line reads from the runtime's own created_at");
        assert.doesNotMatch(h.text(), /Clara has been working on this/, "a parked turn is not a working turn");

        assert.deepEqual(checkAccessibility(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a RUNNING turn found at mount shows the working line; a settled thread shows no clock at all", async () => {
  await withFetch(
    (url) => {
      if (url.includes(`/api/chat/sessions/${THREAD_ID}/messages`)) return json({ messages: [] });
      if (url.includes("agent_tasks_visible")) return json([{ id: TASK_ID, status: "running", created_at: new Date(Date.now() - 125_000).toISOString() }]);
      if (url.includes("caller_context")) return json([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => /Clara has been working on this for/.test(h.text()), "the running elapsed line");
        assert.match(h.text(), /Clara has been working on this for 2:0[0-9]\./);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("NO RUN means NO clock — an elapsed line with nothing behind it is a fabricated measurement", async () => {
  await withFetch(
    (url) => {
      if (url.includes(`/api/chat/sessions/${THREAD_ID}/messages`)) return json({ messages: [] });
      if (url.includes("agent_tasks_visible")) return json([]);
      if (url.includes("caller_context")) return json([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => !/Loading the conversation…/.test(h.text()), "the loaded thread");
        assert.doesNotMatch(h.text(), /Clara has been working on this/);
        assert.doesNotMatch(h.text(), /Clara has been waiting on your answer/);
        assert.doesNotMatch(h.text(), /0:00/, "not even a zero — there is nothing to measure");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a run read that FAILS leaves no clock and no question, and does not disturb the transcript", async () => {
  await withFetch(
    (url) => {
      if (url.includes(`/api/chat/sessions/${THREAD_ID}/messages`)) {
        return json({ messages: [{ id: "m1", role: "assistant", parts: [{ type: "text", text: "A settled answer." }], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-02T00:00:00Z" }] });
      }
      if (url.includes("agent_tasks_visible")) return json({ error: "internal" }, 500);
      if (url.includes("caller_context")) return json([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => /A settled answer\./.test(h.text()), "the transcript");
        assert.doesNotMatch(h.text(), /Clara has been/, "a failed run read asserts nothing about a run");
        assert.doesNotMatch(h.text(), /Could not load the conversation/, "and it never paints an error over a transcript that loaded fine");
      } finally {
        await h.unmount();
      }
    },
  );
});
