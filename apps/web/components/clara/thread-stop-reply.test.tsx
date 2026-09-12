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
import { THREAD_RUN_LIVE_STATUSES } from "../../lib/clara/turnRun";
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

// ---------------------------------------------------------------------------------------------
// 3 · WHAT THE DOOR ANSWERED, AS WORDS ON THE SCREEN (#630 fix round 4)
//
// `clara.cancel_agent_task` answers `{status:'cancelled'}` for BOTH the terminal settle it
// performs on a still-QUEUED turn and for a turn that had already ended when the press arrived.
// Reading the status alone, this surface printed "Nothing was stopped — this reply had already
// finished" over a reply the press had just killed. These three cells drive the rendered end of
// the discriminator: the stop that worked, the stop that found nothing to do, and the refusal that
// is neither.
// ---------------------------------------------------------------------------------------------

const THREAD_KILLED = "dddddddd-4444-4444-8444-444444444444";
const THREAD_OVER = "eeeeeeee-5555-4555-8555-555555555555";
const THREAD_REFUSED_VIEW = "ffffffff-6666-4666-8666-666666666666";
const TASK_OVER = "cccccccc-3333-4333-8333-333333333334";
const TASK_REFUSED = "cccccccc-3333-4333-8333-333333333335";
const TASK_LOST = "cccccccc-3333-4333-8333-333333333336";

/** Mount a live turn, press Stop, and hand back the rendered text once the machine has settled.
 *
 *  EACH CELL BRINGS ITS OWN TASK ID (#630 round 5). `claraThreadStore` remembers which turns a
 *  door has already ended in a module-level set — that is the point of it, and the mount hydrate
 *  now consults it so a reopened rail cannot re-start a stopped turn's clock. Task ids are unique
 *  in production; reusing ONE constant across these cells made the second cell inherit the first
 *  cell's stop and mount with no live turn at all. */
async function pressStop(threadId: string, answer: Response, taskId: string = TASK_ID): Promise<string> {
  let rendered = "";
  await withFetch(
    (url) => {
      if (url.includes("/messages")) return json({ messages: [] });
      if (url.includes("agent_tasks_visible")) {
        // A turn this tab did not post, found running — the reload case, and the one where the
        // turn clock is on screen with nothing but a door to retire it.
        return json([{ id: taskId, status: "running", created_at: new Date(Date.now() - 62_000).toISOString() }]);
      }
      if (url.includes("agent_interruptions")) return json([]);
      if (url.includes("caller_context")) return json([]);
      if (url.includes("/rpc/cancel_agent_task")) return answer.clone();
      return json([]);
    },
    async () => {
      const h = await renderComponent(App(threadId));
      try {
        await settleUntil(h, () => h.find(buttonNamed("Stop reply")) !== null, "the Stop control");
        assert.match(h.text(), /Clara has been working on this for/,
          "precondition: the turn clock is on screen, counting from the runtime's own start");
        const stop = h.find(buttonNamed("Stop reply"));
        assert.ok(stop, "the Stop control is offered for a live turn");
        await h.act(() => clickButton(stop));
        await settleUntil(h, () => h.find(buttonNamed("Stop reply")) === null || /stopped|Could not stop|Nothing was stopped/i.test(h.text()),
          "the machine to settle");
        rendered = h.text();
      } finally {
        await h.unmount();
      }
    },
  );
  return rendered;
}

test("630 a stop that TERMINALLY CANCELLED the turn reads Stopped, and its clock stops with it", async () => {
  const text = await pressStop(THREAD_KILLED, json({
    task_id: TASK_ID, status: "cancelled", changed: true, transition: "cancelled",
  }));
  assert.match(text, /Stopped/, "the press killed the turn; the marker says so");
  assert.doesNotMatch(text, /Nothing was stopped/,
    "…and never the opposite: `status:'cancelled'` is what a SUCCESSFUL stop of a queued turn "
    + "answers, and reading it as 'already finished' inverted the whole act");
  assert.doesNotMatch(text, /Clara has been working on this for/,
    "a stopped turn is not still being worked on — a clock counting under the marker is the "
    + "surface arguing with itself");
});

test("630 …and a turn that had ALREADY ENDED still reads honestly", async () => {
  const text = await pressStop(THREAD_OVER, json({
    task_id: TASK_OVER, status: "completed", changed: false, transition: "already_terminal",
  }), TASK_OVER);
  assert.match(text, /Nothing was stopped/, "the door changed nothing, and said so");
  assert.doesNotMatch(text, /Clara has been working on this for/,
    "…and the turn it found was over, so nothing is timing it either");
});

test("630 a governed refusal that is not the role floor reads as a refusal, never as 'already finished'", async () => {
  const text = await pressStop(THREAD_REFUSED_VIEW,
    refusal("CLR10", "op_key conflict", "op_key_conflict"), TASK_REFUSED);
  assert.match(text, /Could not stop this reply/, "the request was turned down, and the line says so");
  assert.doesNotMatch(text, /Nothing was stopped/,
    "a refusal is not evidence the reply ended — telling the reader it had finished would send "
    + "them away from a turn that is still spending");
  assert.doesNotMatch(text, /needs a bookkeeper role/,
    "…and it does not blame their role either: CLR10 says nothing whatever about who they are");
  assert.match(text, /Clara has been working on this for/,
    "the turn is still live, so an honest elapsed time is exactly what they need");
});

// ---------------------------------------------------------------------------------------------
// 4 · THE POLL GIVES UP OUT LOUD (#630 fix round 5, finding [6])
//
// The DB arm stops asking after CLARA_RUN_POLL_MISS_LIMIT reads that found no visible row — RLS, a
// transient, a stale id, a firm switch. Round 4 stopped asking SILENTLY, which left the last real
// read standing: an enabled "Stop reply" and a clock still climbing, about a turn this tab had
// provably stopped being able to observe. The hook cells own the state; this owns the words.
// ---------------------------------------------------------------------------------------------

const THREAD_LOST = "cccccccc-4444-4444-8444-444444444444";

test("630 a poll that has given up retires the clock and the control, and says why", async () => {
  let visible = true;
  const ticks: Array<() => void> = [];
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  globalThis.setInterval = ((fn: () => void, ms?: number) => {
    void ms;
    ticks.push(fn);
    return realSet(fn, 1_000_000);
  }) as typeof globalThis.setInterval;
  globalThis.clearInterval = ((id: unknown) => realClear(id as never)) as typeof globalThis.clearInterval;
  try {
    await withFetch(
      (url) => {
        if (url.includes("/messages")) return json({ messages: [] });
        if (url.includes("agent_tasks_visible")) {
          return visible
            ? json([{ id: TASK_LOST, status: "running", created_at: new Date().toISOString() }])
            : json([]);
        }
        if (url.includes("agent_interruptions")) return json([]);
        if (url.includes("caller_context")) return json([]);
        return json([]);
      },
      async () => {
        const h = await renderComponent(App(THREAD_LOST));
        try {
          await settleUntil(h, () => h.find(buttonNamed("Stop reply")) !== null, "the Stop control");
          assert.match(h.text(), /Clara has been working on this for/,
            "precondition: the clock is up, off the DB's own created_at");

          // The row goes out of view. Three misses is the bound the hook already carried.
          visible = false;
          for (let i = 0; i < 3; i += 1) {
            await h.act(async () => {
              for (const tick of [...ticks]) tick();
              await new Promise((r) => setTimeout(r, 0));
            });
          }
          await settleUntil(h, () => /Lost sight of this reply/.test(h.text()), "the give-up line");

          assert.equal(h.find(buttonNamed("Stop reply")), null,
            "a turn this tab cannot see is offered no Stop control — the press would reach the door "
            + "and print a claim about a reply nobody here can observe");
          assert.doesNotMatch(h.text(), /Clara has been working on this for/,
            "…and the clock retires with it: an elapsed time is an assertion about a live run");
          assert.doesNotMatch(h.text(), /^Stopped$/m,
            "…and nothing says the reply was stopped, because nothing stopped it");

          const announcers = collect(h.container as Stub, (n) => attrOf(n, "role") === "status")
            .filter((n) => /responding|Lost sight|Stopped/i.test(textOf(n)));
          assert.equal(announcers.length, 1,
            `exactly one status region speaks; saw ${announcers.map((n) => textOf(n)).join(" | ")}`);
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

// ---------------------------------------------------------------------------------------------
// 5 · EVERY LIVE STATUS THE DATABASE CAN HOLD (#630 fix round 6, review finding [3])
//
// `turnLive` was the third reader of "is this run live?" and the one that never adopted
// `THREAD_RUN_LIVE_STATUSES`: it hardcoded `running` and `awaiting_input`. The three it dropped
// are not hypothetical — `queued` is the status EVERY chat turn is admitted at, `held` is a leased
// or backed-up runtime, and `cancel_requested` is a stop already in flight. And the store cannot
// repair it: `hydrateRun` is the only writer of a non-null `turnStatus`, and the poll writes only
// terminals, so a turn hydrated as `queued` stays `queued` for the life of the mount. The reader
// then watched "Clara has been working on this for 0:12…" climb with no way to stop it.
//
// The cell reads the constant itself rather than a list copied here, so a sixth non-terminal
// status added to `turnRun.ts` arrives with a failing assertion instead of a silent hole.
// ---------------------------------------------------------------------------------------------

test("630 Stop reply is offered for EVERY non-terminal status the run row can hold", async () => {
  assert.ok(THREAD_RUN_LIVE_STATUSES.length >= 5,
    "precondition: the shared constant still lists the five non-terminal statuses");

  for (const [index, status] of THREAD_RUN_LIVE_STATUSES.entries()) {
    // Unique ids per cell: `claraThreadStore` remembers ended turns in a module-level set, and the
    // mount hydrate consults it, so a reused task id would mount the next status with no live turn.
    const threadId = `a5a5a5a5-7777-4777-8777-77777777777${index}`;
    const taskId = `b5b5b5b5-8888-4888-8888-88888888888${index}`;
    await withFetch(
      (url) => {
        if (url.includes("/messages")) return json({ messages: [] });
        if (url.includes("agent_tasks_visible")) {
          return json([{ id: taskId, status, created_at: new Date(Date.now() - 12_000).toISOString() }]);
        }
        if (url.includes("agent_interruptions")) return json([]);
        if (url.includes("caller_context")) return json([]);
        return json([]);
      },
      async () => {
        const h = await renderComponent(App(threadId));
        try {
          // Either wording of the clock: `awaiting_input` renders TurnProgress's `parked` arm
          // ("Clara has been waiting on your answer for …"), the other four its `running` arm.
          await settleUntil(h, () => /Clara has been (working on this|waiting on your answer) for/.test(h.text()),
            `the turn clock for status ${status}`);
          assert.ok(h.find(buttonNamed("Stop reply")),
            `a turn the database reports as '${status}' is live, so the reader is offered a way to `
            + "stop it — a clock climbing over a control that never mounts is the surface telling "
            + "them a turn is running and refusing to act on it");
        } finally {
          await h.unmount();
        }
      },
    );
  }
});
