// #642 AC5 — a `revoked` stream, ON THE REAL TRANSCRIPT.
//
// `lib/clara/stream-revoked.test.ts` proves the reducer and the reattach loop. This file
// proves the FACE: what a person actually sees when their access is taken away
// mid-reply, which is the first time this surface has ever had to tell someone they have
// lost access.
//
// THE DEFECT: `applyClaraStreamEvent` had no `revoked` case, so the event fell through
// `default` and the stream state stayed `"streaming"`. A member removed from the firm
// mid-reply saw "Clara is responding…" and then "Reconnecting…", forever, over a stream
// that would be refused on every attach. `packages/runtime/tests/c5-stream-reauth-db
// .test.mjs` had been proving the SERVER sends the event the whole time.
//
// THE COPY IS THE OTHER HALF OF THIS CELL. It must never become an EXISTENCE ORACLE: it
// says what this reader can no longer do, and nothing about whether the task, the
// conversation or the firm exists — a revoked stream is exactly the situation in which
// this surface has no standing to say.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { claraThreadStore } from "../../lib/clara/threadStore";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const THREAD = "aaaaaaaa-6423-4423-8423-642364236423";
const CLIENT = "bbbbbbbb-6423-4423-8423-642364236423";
const TASK = "cccccccc-6423-4423-8423-642364236423";
const CALLER = "99999999-9999-4999-8999-999999999999";
const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: CALLER })).toString("base64url")}.y`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function withFetch(run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/messages")) return json({ messages: [] });
    if (url.includes("/rest/v1/")) return json([]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

const view = (): ReactElement =>
  createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(ClaraThreadView, {
      auth: { getAccessToken: async () => TOKEN },
      threadId: THREAD,
      variant: "rail" as const,
      clientId: CLIENT,
      firmName: "Rome Public Advisory",
      clientName: "Milan Trading",
    }),
  }) as ReactElement;

const statusLines = (h: { container: Stub }): string[] => {
  const out: string[] = [];
  (function walk(node: Stub) {
    const get = typeof node.getAttribute === "function" ? (node.getAttribute as (a: string) => string | null) : null;
    if (get && get("role") === "status") {
      const text = (function textOf(n: Stub): string {
        if (n.nodeType === 3) return String(n.nodeValue ?? "");
        const kids = (n.childNodes as Stub[] | undefined) ?? [];
        if (kids.length > 0) return kids.map(textOf).join("");
        return typeof n.textContent === "string" ? n.textContent : "";
      })(node);
      out.push(text.trim());
    }
    for (const c of (node.childNodes as Stub[] | undefined) ?? []) walk(c);
  })(h.container);
  return out;
};

async function settle(h: { settle: () => Promise<void> }, times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await h.settle();
}

test("p642.web.revoked_is_not_reconnecting — a revoked stream renders ONE status line, and it is not 'Reconnecting…'", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      // A live turn first, so the cell measures a REPLACEMENT rather than an empty tree.
      await h.act(() => {
        claraThreadStore.markAccepted(THREAD, TASK, false);
        claraThreadStore.applyStreamEvent(THREAD, { event: "chunk", data: { type: "text-delta", id: "t", text: "Working on " } });
      });
      await settle(h);
      assert.match(h.text(), /Clara is responding/, "the fixture must start on a live stream");

      await h.act(() => {
        claraThreadStore.applyStreamEvent(THREAD, { event: "revoked", data: { taskId: TASK, reason: "not_found" } });
      });
      await settle(h);

      const lines = statusLines(h);
      assert.equal(lines.length, 1, `exactly one status line must speak; saw ${JSON.stringify(lines)}`);
      assert.match(lines.at(0) ?? "", /You no longer have access to this reply/);
      assert.doesNotMatch(h.text(), /Reconnecting/, "the defect was that this said Reconnecting… forever");
      assert.doesNotMatch(h.text(), /Clara is responding/, "…and it must not still claim the reply is coming");
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.revoked_is_not_reconnecting — the copy is not an EXISTENCE ORACLE and offers no Retry", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await h.act(() => {
        claraThreadStore.markAccepted(THREAD, TASK, false);
        claraThreadStore.applyStreamEvent(THREAD, { event: "revoked", data: { taskId: TASK, reason: "not_found" } });
      });
      await settle(h);
      const text = h.text();
      // `reason` is `"not_found"` here — the route's own word for "the task is not
      // visible to you". Rendering it would tell a removed member whether a task exists,
      // which is precisely the oracle `streamRoute.ts`'s masked-view law exists to close.
      assert.doesNotMatch(text, /not_found/, "the wire reason must never reach the reader");
      assert.doesNotMatch(text, /does not exist|no such|deleted/i, "…and neither must any claim about existence");
      // A Retry would be refused for exactly the same reason, every time.
      assert.equal(claraThreadStore.getThread(THREAD).stream.retryAvailable, false);
      assert.doesNotMatch(text, /The connection to Clara ended unexpectedly/);
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.revoked_is_not_reconnecting — the turn clock retires, because this tab is no longer watching anything", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await h.act(() => {
        claraThreadStore.markAccepted(THREAD, TASK, false);
        claraThreadStore.hydrateRun(THREAD, { taskId: TASK, status: "running", startedAt: new Date(Date.now() - 90_000).toISOString() }, null);
      });
      await settle(h);
      assert.match(h.text(), /Clara has been working on this/, "the fixture must start with a running clock");

      await h.act(() => {
        claraThreadStore.applyStreamEvent(THREAD, { event: "revoked", data: { taskId: TASK, reason: "CLR11" } });
      });
      await settle(h);
      assert.doesNotMatch(h.text(), /Clara has been working on this/,
        "an elapsed-time line climbing under 'you no longer have access' is this tab asserting it is still watching");
      // The task id is still a FACT and is kept, exactly as `markTurnStopped` keeps it.
      assert.equal(claraThreadStore.getThread(THREAD).activeTaskId, TASK);
    } finally {
      await h.unmount();
    }
  });
});
