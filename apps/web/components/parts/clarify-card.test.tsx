// Inline clarify parity: the transcript card owns the SAME governed answer door as
// Journals' InterruptionsPanel, and addresses the SAME row the DB says is answerable.
// These cells mount the real PartRenderer branch and mock only the network boundary;
// every post-click assertion is a state that cannot exist before the door call and the
// mandatory DB re-read.
//
// The wire-body cell is BIDIRECTIONAL on purpose (裁-107): it drives the real
// InterruptionsPanel to capture what the PANE hands the shared wrapper, drives the real
// card to capture what actually goes on the WIRE, and diffs them — rather than
// restating a `{ text }` predicate in an assertion, which would pass just as happily if
// both surfaces drifted together.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { PartRenderer } from "./PartRenderer";
import { CLARIFY_ROW_ATTEMPTS, CLARIFY_ROW_INTERVAL_MS } from "./ClarifyCard";
import { InterruptionsPanel } from "../journals/interruptions-panel";
import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk } from "../../test/keyboardWalk";
import type { ClaraPart } from "../../lib/parts/types";
import type { AgentInterruptionRow } from "../../lib/journals/types";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;
type Seen = { url: string; body: unknown }[];

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const INTERRUPTION_ID = "22222222-2222-4222-8222-222222222222";
const ANSWER_TEXT = "ROME PROPERTIES owns it";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

const part: Extract<ClaraPart, { type: "clarify" }> = {
  type: "clarify",
  tool_call_id: "call-1",
  question: "Which client owns this invoice?",
  context: "The supplier name is shared.",
  framing: "Your answer resumes this run.",
};

const pending: AgentInterruptionRow = {
  id: INTERRUPTION_ID,
  task_id: TASK_ID,
  kind: "clarify",
  question: { question: part.question, context: part.context },
  answer: null,
  status: "pending",
  asked_of: null,
  answered_by: null,
  expires_at: "2026-09-03T00:00:00Z",
  created_at: "2026-09-02T00:00:00Z",
  answered_at: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type RendererProps = {
  part: ClaraPart;
  taskId?: string | null;
  session?: SessionTokenAccessor;
  clarifyAnswerable?: boolean;
};

function App(clarifyAnswerable = true, taskId: string | null = TASK_ID): ReactElement {
  const Renderer = PartRenderer as unknown as (props: RendererProps) => ReactElement;
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(Renderer, { part, taskId, session, clarifyAnswerable }),
  });
}

function withFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response, run: (seen: Seen) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const seen: Seen = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    seen.push({ url, body });
    return impl(url, init);
  }) as typeof fetch;
  return run(seen).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await h.settle();
  }
}

/** For the cells that must let the card's REAL 1s re-read interval elapse — the window is
 *  `CLARIFY_ROW_ATTEMPTS × CLARIFY_ROW_INTERVAL_MS` of wall clock, driven by real timers
 *  because the timer IS what is under test. The sleep keeps it from spinning hot. */
async function settleUntilSlow(h: { settle: () => Promise<void> }, condition: () => boolean, label: string): Promise<void> {
  const budget = CLARIFY_ROW_ATTEMPTS * CLARIFY_ROW_INTERVAL_MS + 10_000;
  const deadline = Date.now() + budget;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await h.settle();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const buttonNamed = (name: string) => (node: Stub) => node.tagName === "BUTTON" && textOf(node).trim() === name;

test("the answer control is addressed, never merely present: only an ANSWERABLE card reads, and it reads the pending row of ITS task", async () => {
  await withFetch(
    () => json([pending]),
    async (seen) => {
      const h = await renderComponent(App(true));
      try {
        await settleUntil(h, () => h.find(buttonNamed("Answer")) !== null, "pending clarify control");
        assert.ok(h.find((node) => node.tagName === "INPUT"), "the free-text answer control must render");
        const read = seen.find((entry) => entry.url.includes("/rest/v1/agent_interruptions"));
        assert.ok(read, "the card must ask the DB whether anything is pending — never infer it from the part");
        assert.match(read.url, new RegExp(`task_id=eq\\.${TASK_ID}`), "the read is scoped to the task that emitted this card");
        assert.match(read.url, /status=eq\.pending/, "only a PENDING row is answerable (settle_chat_turn cancels the rest)");
      } finally {
        await h.unmount();
      }

      // The SAME pending row is on offer; the only thing that changed is that this card
      // is not the answerable one. It must not render a control, and must not even read.
      const readsBefore = seen.length;
      const unanswerable = await renderComponent(App(false));
      try {
        for (let i = 0; i < 6; i++) await unanswerable.settle();
        assert.match(unanswerable.text(), /Which client owns this invoice\?/, "the card still renders read-only");
        assert.equal(unanswerable.find((node) => node.tagName === "INPUT"), null);
        assert.equal(unanswerable.find(buttonNamed("Answer")), null);
        assert.equal(seen.length, readsBefore, "an un-answerable clarify must not fire a PostgREST read at all");
      } finally {
        await unanswerable.unmount();
      }

      // No task id ⇒ nothing to address ⇒ no control, whatever `answerable` says.
      const unaddressed = await renderComponent(App(true, null));
      try {
        for (let i = 0; i < 6; i++) await unaddressed.settle();
        assert.equal(unaddressed.find(buttonNamed("Answer")), null);
      } finally {
        await unaddressed.unmount();
      }
    },
  );
});

test("an AMBIGUOUS task (two rows came back where the DB allows one) refuses to offer a control rather than pick one", async () => {
  await withFetch(
    () => json([pending, { ...pending, id: "33333333-3333-4333-8333-333333333333" }]),
    async () => {
      const h = await renderComponent(App(true));
      try {
        // The ambiguity is refused at every read, so the card walks the whole re-read
        // window and lands on the honest absence rather than picking one of the two.
        await settleUntilSlow(h, () => /No open question has been recorded/.test(h.text()), "exact-one refusal");
        assert.equal(h.find(buttonNamed("Answer")), null, "two candidate rows must never resolve into one answerable row");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("clarify hydrate spells waiting, error, and gone as three distinguishable states — and an EMPTY read is never spelled as a settled one", async () => {
  let resolveRead: ((response: Response) => void) | null = null;
  await withFetch(
    () => new Promise<Response>((resolve) => { resolveRead = resolve; }),
    async () => {
      const h = await renderComponent(App(true));
      try {
        await settleUntil(h, () => /Checking whether this question is still open/.test(h.text()), "waiting state");
        resolveRead?.(json([]));
        for (let i = 0; i < 8; i++) await h.settle();
        // THE DISCRIMINATING PART. An empty read is an ABSENCE, not evidence the question
        // settled — the runtime writes that row three durable step boundaries after the
        // chunk the card mounted on. Before the fold's re-read, the card asserted
        // "no longer awaiting an answer" here, on a question Clara was parked on.
        assert.match(h.text(), /Checking whether this question is still open/, "an empty read keeps WAITING inside the re-read window");
        assert.doesNotMatch(h.text(), /No open question has been recorded/, "…and never claims a settled state the read did not establish");
      } finally {
        await h.unmount();
      }
    },
  );

  await withFetch(
    () => json({ message: "internal detail must not replace the typed state" }, 500),
    async () => {
      const h = await renderComponent(App(true));
      try {
        await settleUntil(h, () => /Could not check whether this question is still open/.test(h.text()), "error state");
        // An error ENDS the window rather than spinning on it.
        assert.doesNotMatch(h.text(), /Checking whether this question is still open/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a TRANSIENT read failure is not a dead end — the error state carries the same way back", async () => {
  // Review R2-N1. Ending the re-read window on an error is right (spinning on a failing
  // read is worse), but it left the error state as the one branch with no recovery, with
  // the affordance the fold had just built sitting one branch away. A read that fails once
  // and then succeeds must be recoverable without a page reload.
  let failNext = true;
  await withFetch(
    (url) => {
      if (!url.includes("/rest/v1/agent_interruptions")) throw new Error(`unexpected fetch: ${url}`);
      if (failNext) return json({ message: "transient" }, 500);
      return json([pending]);
    },
    async () => {
      const h = await renderComponent(App(true));
      try {
        await settleUntil(h, () => /Could not check whether this question is still open/.test(h.text()), "error state");
        assert.equal(h.find(buttonNamed("Answer")), null, "no control while the read is failing");

        failNext = false;
        const recheck = h.find(buttonNamed("Check again"));
        assert.ok(recheck, "the error state must offer the same way back the closed window does");
        await h.act(() => clickButton(recheck));

        // Discriminating: the control can only exist after a SUCCESSFUL re-read, and the
        // error banner must be gone rather than left standing beside a working form.
        await settleUntil(h, () => h.find(buttonNamed("Answer")) !== null, "the control after recovering from the error");
        assert.doesNotMatch(h.text(), /Could not check whether this question is still open/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the row lands AFTER the chunk — the control still arrives, because the read is retried", async () => {
  // The production ordering, exactly: `runModelSegmentStepV16` writes the clarify chunk,
  // then `checkpointStep` -> `mintHookTokenStep` -> `openInterruptionStep` INSERT the row
  // three durable WDK step boundaries later (chatTurn.v16.ts:104,105,127,129). The first
  // read finds nothing; a later one finds the row.
  let reads = 0;
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/agent_interruptions")) {
        reads += 1;
        return json(reads === 1 ? [] : [pending]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(true));
      try {
        await settleUntilSlow(h, () => h.find(buttonNamed("Answer")) !== null, "the control after a late row");
        assert.ok(h.find((node) => node.tagName === "INPUT"), "the free-text answer control must render once the row exists");
        assert.ok(reads >= 2, "one read cannot see a row written after it — the card must re-read");
        assert.doesNotMatch(h.text(), /No open question has been recorded/, "the human is never told the question is gone while it is being opened");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the re-read is BOUNDED, closes on an honest absence, and the manual re-check re-arms it", async () => {
  let rowExists = false;
  let reads = 0;
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/agent_interruptions")) {
        reads += 1;
        return json(rowExists ? [pending] : []);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(true));
      try {
        await settleUntilSlow(h, () => /No open question has been recorded/.test(h.text()), "the window closing on an honest absence");
        assert.equal(
          reads,
          CLARIFY_ROW_ATTEMPTS + 1,
          "the window is one mount read plus exactly CLARIFY_ROW_ATTEMPTS retries — an unbounded loop would keep climbing",
        );
        assert.equal(h.find(buttonNamed("Answer")), null, "no control without a row");

        // The cap is not a dead end: a runtime slower than the precedent's five seconds
        // costs one click, not a false sentence.
        rowExists = true;
        const recheck = h.find(buttonNamed("Check again"));
        assert.ok(recheck, "the closed window must offer a way back");
        await h.act(() => clickButton(recheck));
        await settleUntil(h, () => h.find(buttonNamed("Answer")) !== null, "the control after a manual re-check");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the card's wire body IS the Journals pane's, and the mandatory re-read addresses the answered row BY ID", async () => {
  // (a) the PANE half — the real InterruptionsPanel, driven for real.
  const paneCalls: { id: string; answer: Record<string, unknown> }[] = [];
  const pane = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(InterruptionsPanel, {
        interruptions: [pending],
        busy: false,
        err: null,
        clr: null,
        actingId: null,
        onAnswer: (id: string, answer: Record<string, unknown>) => { paneCalls.push({ id, answer }); },
        clientIdByTaskId: {},
      }),
    }),
  );
  try {
    for (let i = 0; i < 4; i++) await pane.settle();
    const paneField = pane.find((node) => node.tagName === "TEXTAREA");
    assert.ok(paneField, "the pane's own answer field must render");
    await pane.act(() => setFieldValue(paneField, ANSWER_TEXT));
    await pane.act(() => clickButton(pane.find(buttonNamed("Answer"))!));
    for (let i = 0; i < 4; i++) await pane.settle();
  } finally {
    await pane.unmount();
  }
  assert.equal(paneCalls.length, 1, "the pane must hand exactly one answer up to the shared door wrapper");

  // (b) the CARD half — the same answer, through the same wrapper, onto the wire.
  let row = pending;
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/rpc/answer_interruption")) {
        row = {
          ...pending,
          status: "answered",
          answer: { text: ANSWER_TEXT },
          answered_by: "44444444-4444-4444-8444-444444444444",
          answered_at: "2026-09-02T00:03:00Z",
        };
        return json({ status: "answered" });
      }
      if (url.includes("/rest/v1/agent_interruptions")) return json([row]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (seen) => {
      const h = await renderComponent(App(true));
      try {
        await settleUntil(h, () => h.find(buttonNamed("Answer")) !== null, "answer form");
        const input = h.find((node) => node.tagName === "INPUT");
        assert.ok(input);
        await h.act(() => setFieldValue(input, ANSWER_TEXT));
        await h.act(() => clickButton(h.find(buttonNamed("Answer"))!));
        await settleUntil(h, () => /Answered by your firm/.test(h.text()), "answered re-read");
        assert.match(h.text(), new RegExp(ANSWER_TEXT));
        assert.equal(h.find(buttonNamed("Answer")), null, "an answered clarify is never re-answerable");

        const call = seen.find((entry) => entry.url.includes("/rest/v1/rpc/answer_interruption"));
        assert.ok(call);
        const body = call.body as Record<string, unknown>;
        assert.equal(Object.keys(body).sort().join(","), "p_answer,p_id,p_op_key");
        assert.equal(body.p_id, paneCalls[0]!.id, "both surfaces address the row by the SAME id the DB read gave them");
        assert.deepEqual(body.p_answer, paneCalls[0]!.answer, "the answer object must be the pane's own, byte for byte");
        assert.ok(typeof body.p_op_key === "string" && body.p_op_key.length > 0, "every call mints its own op key");

        const reads = seen.filter((entry) => entry.url.includes("/rest/v1/agent_interruptions")).map((entry) => entry.url);
        assert.ok(reads.length >= 2, "an act must always be followed by a re-read — never trust the write's own view");
        const after = reads[reads.length - 1]!;
        assert.match(after, new RegExp(`id=eq\\.${INTERRUPTION_ID}`), "the settled re-read addresses the answered row exactly");
        assert.doesNotMatch(after, /status=eq\.pending/, "re-asking 'what is pending on this task' after answering would read another question's row");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a second-answer CLR13 refusal stays visible on the card verbatim, after the re-read the act still performs", async () => {
  const message = "CLR13: interruption is no longer pending.";
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/rpc/answer_interruption")) return json({ code: "CLR13", message }, 400);
      if (url.includes("/rest/v1/agent_interruptions")) return json([pending]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (seen) => {
      const h = await renderComponent(App(true));
      try {
        await settleUntil(h, () => h.find(buttonNamed("Answer")) !== null, "answer form");
        const input = h.find((node) => node.tagName === "INPUT");
        assert.ok(input);
        await h.act(() => setFieldValue(input, ANSWER_TEXT));
        await h.act(() => clickButton(h.find(buttonNamed("Answer"))!));
        await settleUntil(h, () => h.text().includes(message), "typed refusal");
        assert.match(h.text(), /CLR13/, "the governed code renders as its own chip, never folded into prose");
        const reads = seen.filter((entry) => entry.url.includes("/rest/v1/agent_interruptions"));
        assert.ok(reads.length >= 2, "a REFUSED act still re-reads — the DB may have moved underneath us");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("clarify answer controls carry enter-panel motion, 24px targets, structural a11y, and a clean keyboard walk", async () => {
  await withFetch(
    () => json([pending]),
    async () => {
      const h = await renderComponent(App(true));
      try {
        await settleUntil(h, () => h.find(buttonNamed("Answer")) !== null, "answer form");
        const card = h.find((node) => typeof node.className === "string" && node.className.includes("enter-panel"));
        assert.ok(card, "the stateful answer panel must use the ClaraBook enter-panel motion utility");
        const submit = h.find(buttonNamed("Answer"));
        assert.ok(submit);
        assert.match(String(submit.className), /\bh-7\b/, "the Answer control must clear the 24px minimum target");
        assert.deepEqual(checkAccessibility(h.container as never), []);
        assert.deepEqual(checkKeyboardWalk(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});
