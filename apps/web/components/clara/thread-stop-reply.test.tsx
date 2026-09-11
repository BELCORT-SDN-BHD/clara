// #630 — STOP REPLY, at the seam where the state machine becomes words on a screen.
//
// `lib/clara/use-clara-thread-stop.test.ts` owns the machine's transitions. This file owns what
// the machine is allowed to SAY, because both defects it pins are invisible from the hook:
//
//   1. ONE ANNOUNCEMENT OWNER. Aborting the SSE read client-side never transitions
//      `state.stream.status` away from "streaming" — nothing in `threadStore` clears it on a manual
//      abort — so a REFUSED stop used to leave "Clara is responding…" and the refusal line mounted
//      as two sibling `role="status"` regions, each announcing independently, for one press.
//   2. THE CONTROL DIES WITH THE TURN. The database arm of "is a turn live?" was read once, on
//      mount. A person who reloaded the page while Clara was answering was offered Stop for the
//      life of the mount — long after the reply finished — beside a clock still counting, and the
//      press then hit an idempotent door that answered 200 about a turn which ended normally.
//
// Both are driven through the REAL component and the REAL hook; only `fetch` and the interval
// clock are stubbed.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { clickButton, renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { CLARA_RUN_POLL_MS } from "../../lib/clara/useClaraThread";
import { claraThreadStore } from "../../lib/clara/threadStore";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const THREAD_ANNOUNCE = "aaaaaaaa-1111-4111-8111-111111111111";
const THREAD_POLL = "bbbbbbbb-2222-4222-8222-222222222222";
const TASK_ID = "cccccccc-3333-4333-8333-333333333333";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function App(threadId: string): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      "div",
      null,
      createElement("h1", null, "Clara test context"),
      createElement(ClaraThreadView, { auth: session, threadId, variant: "full" }),
    ),
  });
}

function withFetch(impl: (url: string) => Response, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL) => impl(String(input))) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
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

function collect(root: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  (function walk(n: Stub) {
    if (n.nodeType === 1 && predicate(n)) out.push(n);
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  })(root);
  return out;
}

const attrOf = (n: Stub, name: string) => (typeof n.getAttribute === "function" ? n.getAttribute(name) : null);

/** A governed refusal on the wire, in the shape `lib/wire.ts` classifies into a `RefusalError`. */
function refusal(code: string, message: string, reason: string): Response {
  return json({ code, message, details: JSON.stringify({ reason }) }, 400);
}

// ---------------------------------------------------------------------------------------------
// 1 · ONE ANNOUNCEMENT OWNER
// ---------------------------------------------------------------------------------------------

test("630 a REFUSED stop replaces the responding line — one role=status for one press", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/messages")) return json({ messages: [] });
      if (url.includes("agent_tasks_visible")) {
        return json([{ id: TASK_ID, status: "running", created_at: new Date().toISOString() }]);
      }
      if (url.includes("agent_interruptions")) return json([]);
      if (url.includes("caller_context")) return json([]);
      // The floor `clara.cancel_agent_task` carries and `clara.begin_chat_turn` does not: a clerk
      // may start a turn and may not stop it.
      if (url.includes("/rpc/cancel_agent_task")) {
        return refusal("CLR04", "stopping a reply requires a bookkeeper", "insufficient_role");
      }
      return json([]);
    },
    async () => {
      const h = await renderComponent(App(THREAD_ANNOUNCE));
      try {
        await settleUntil(h, () => h.find(buttonNamed("Stop reply")) !== null, "the Stop control");
        // The stream is CARRYING the reply — the state a manual abort deliberately does not clear,
        // which is what made the two regions coexist.
        await h.act(() => {
          claraThreadStore.applyStreamEvent(THREAD_ANNOUNCE, { event: "chunk", data: "…" });
        });
        assert.match(h.text(), /Clara is responding/, "precondition: the responding line is up");

        const stop = h.find(buttonNamed("Stop reply"));
        assert.ok(stop, "the Stop control is offered for a live turn");
        await h.act(() => clickButton(stop));
        await settleUntil(h, () => /needs a bookkeeper role/.test(h.text()), "the refusal line");

        assert.doesNotMatch(h.text(), /Clara is responding/,
          "the refusal REPLACES the responding line: two live regions for one press is two announcements");
        assert.doesNotMatch(h.text(), /^Stopped$/m,
          "…and nothing says Stopped over a run the door refused to stop");
        const announcers = collect(h.container as Stub, (n) => attrOf(n, "role") === "status")
          .filter((n) => /responding|stop|Stopped/i.test(textOf(n)));
        assert.equal(announcers.length, 1,
          `exactly one status region speaks about the stop; saw ${announcers.map((n) => textOf(n)).join(" | ")}`);
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
// 2 · THE CONTROL DIES WITH THE TURN
// ---------------------------------------------------------------------------------------------

test("630 the Stop control is withdrawn when the DB says the rehydrated turn has ended", async () => {
  let runStatus = "running";
  // The poll's interval is captured rather than waited on: a cell that slept four real seconds per
  // assertion would be measuring the host's scheduler. The BODY is run — a spy that only records
  // the delay passes on an interval that does nothing, which is the defect itself.
  const ticks: Array<() => void> = [];
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  const scheduled: number[] = [];
  globalThis.setInterval = ((fn: () => void, ms?: number) => {
    scheduled.push(Number(ms));
    ticks.push(fn);
    return realSet(fn, 1_000_000);
  }) as typeof globalThis.setInterval;
  globalThis.clearInterval = ((id: unknown) => realClear(id as never)) as typeof globalThis.clearInterval;
  try {
    await withFetch(
      (url) => {
        if (url.includes("/messages")) return json({ messages: [] });
        if (url.includes("agent_tasks_visible")) {
          return json([{ id: TASK_ID, status: runStatus, created_at: new Date().toISOString() }]);
        }
        if (url.includes("agent_interruptions")) return json([]);
        if (url.includes("caller_context")) return json([]);
        return json([]);
      },
      async () => {
        const h = await renderComponent(App(THREAD_POLL));
        try {
          await settleUntil(h, () => h.find(buttonNamed("Stop reply")) !== null, "the Stop control");
          assert.ok(scheduled.includes(CLARA_RUN_POLL_MS),
            `the DB arm is re-asked on its own interval; saw ${JSON.stringify(scheduled)}`);

          // The turn ends server-side. Nothing tells this tab: there is no stream (this is a
          // reload onto a running reply), so only the poll can find out.
          runStatus = "completed";
          await h.act(async () => {
            // A SNAPSHOT, not the live array: every re-render re-registers the intervals this cell
            // is capturing, so iterating `ticks` itself would keep firing bodies that the loop is
            // still creating — a test-only runaway that says nothing about the component.
            for (const tick of [...ticks]) tick();
            await new Promise((r) => setTimeout(r, 0));
          });
          await settleUntil(h, () => h.find(buttonNamed("Stop reply")) === null,
            "the Stop control to be withdrawn");
          assert.equal(h.find(buttonNamed("Stop reply")), null,
            "a dead turn is offered no Stop control — pressing it would hit an idempotent door and "
            + "print a claim about a reply that finished normally");
        } finally {
          await h.unmount();
        }
      },
    );
  } finally {
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
  }
});
