// SPEC-897-1 (code review, wave1-lane08) — ORIGINALLY A REPRODUCTION, now #897's own delivery.
//
// wave1-lane08 traced, by reading source, that `InterviewRunCard.tsx`'s typed answer was a
// plain, un-persisted `useState("")`, and left the cell below asserting the GAP (instance B
// starts empty) as a cheap empirical probe cheaper than the full mock-lane walk: it does not
// reach the rail or the route-group boundary, but it answers the one question that determines
// whether either would survive an unmount at all — is the typed answer held anywhere other than
// the mounted component's own local state? Two fresh `ClaraFullScreenThread` instances (the
// harness `interview-run-keyboard.test.tsx` already mounts for this exact card) against the SAME
// server-side run prove it directly: type into instance A, unmount it without submitting, mount
// a fresh instance B onto the same run, and read what its answer field starts with. That is
// exactly the mechanism the rail<->full-screen escalation hits too (an even harder teardown: a
// different route group, not just a fresh instance of the same one — see rail-mount.tsx's "WHAT
// SURVIVES A SWITCH" note for the general rule this cell is the concrete instance of).
//
// The 2026-09-20 triage comment on #897 widened the ticket to build the fix this gap named:
// `InterviewRunCard.tsx` now reads/writes its draft through `claraThreadStore.interviewDrafts`
// (see that file's own header), keyed by `clientId` alone — a stable prop across the remount —
// so instance B's FIRST render already reads back whatever instance A left behind. This cell's
// own assertion FLIPS here to match: instance B now starts with the typed text, not "".
//
// THE HARNESS GAP wave1-lane08 filed as a follow-up is real and still open, and this cell hits
// it directly: react-dom's `initTextarea` sets `element.value` on mount only when
// `element.textContent` already equals the initial string, and otherwise sets `element.defaultValue`
// and leaves `.value` to the BROWSER's native "reflects defaultValue until dirty" rule — a rule
// this harness's `HTMLTextAreaElementStub` (test/hookHarness.ts) does not implement. So instance
// B's queried `.value` reads "" even once the fix genuinely makes React write the right text.
// Rather than widen this ticket to fix shared test infrastructure, instance B's assertion below
// reads what IS faithfully observable at this harness's altitude — `claraThreadStore`'s own state
// (the ground truth `useSyncExternalStore` reads from) and `defaultValue` (the property react-dom
// DOES write on this exact mount path, undefined on the stub's own prototype so the plain
// assignment survives as a queryable property) — and leaves the true rendered, user-visible
// `.value` to a real browser: `agentic-finish-walk.spec.ts`'s own #897 arm.
//
// VACUITY CONTROL: this exact pair of assertions, run against the pre-fix `InterviewRunCard.tsx`
// (plain `useState("")`, restored via `git stash` for the run and popped back after), failed for
// the right reason (`store value: '' !== 'Rome Public Advisory'`); restored to the fixed subject,
// both pass. Recorded in the ticket report, not repeated here as a permanent code branch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { enableDomInspection } from "../../test/domInspect";
import { renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { claraThreadStore } from "../../lib/clara/threadStore";
import messages from "../../messages/en.json";
import { ClaraFullScreenThread } from "./ClaraFullScreenThread";

enableDomInspection();

type Node = {
  tagName?: string;
  childNodes?: Node[];
  getAttribute?: (name: string) => string | null;
};

function findIn(root: Node, predicate: (node: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const child of root.childNodes ?? []) {
    const found = findIn(child, predicate);
    if (found) return found;
  }
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

const OPEN_PLAN = {
  id: "plan-1", firm_id: "f1", scope_kind: "client", client_id: "c1", state: "open",
  revision_token: "rev-1", revision_n: 1, committed_at: null, committed_by: null,
  review_maker: "u1", reviewed_at: "2026-08-01T00:00:00Z", contributors: ["u1"],
  commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};

const ITEM = {
  id: "i1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "legal_name",
  question: "What is the client's legal name?", answer: null, state: "pending", required_for_commit: true,
  answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
};

// The SAME run every fetch below answers with — the server-side half of an OPEN, awaiting-input
// park is what a real escalation would resume; only the CLIENT-side typed text is in question.
const RUN_STATE = {
  run_id: "run-1", scope: "client", status: "awaiting_input",
  pending_park: { parkIndex: 1, seg: "legal_name", phase: "q", question: "What is the client's legal name?" },
  terminal: null, activity: [], plan: { id: "plan-1" }, items: [],
};

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(ClaraFullScreenThread, {
      threadId: "",
      clientId: "c1",
      returnHref: "/clients/c1",
    }),
  });
}

test("SPEC-897-1 / #897 — a typed-but-unsubmitted interview answer SURVIVES an unmount of the card that held it", async () => {
  await withMockedEnv(
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([OPEN_PLAN]);
      if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([ITEM]);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: "onboarding" }]);
      if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([]);
      if (url.includes("/rest/v1/chat_sessions")) return jsonResponse([]);
      if (url === "/api/runtime/interview/client/start") return jsonResponse({ run_id: "run-1" }, 202);
      if (url.startsWith("/api/runtime/interview/state?")) return jsonResponse(RUN_STATE);
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const body = (globalThis as unknown as { document: { body: Node & { appendChild: (child: unknown) => void } } }).document.body;

      // Instance A: start the run, type an answer, and walk away without sending it.
      const a = await renderComponent(App());
      body.appendChild(a.container);
      try {
        for (let i = 0; i < 6; i++) await a.settle();
        const start = a.find((node) => node.tagName === "BUTTON" && textOf(node) === "Start / continue interview");
        assert.ok(start, "the idempotent start/continue control must render");
        await a.fireEvent(start!, "click");
        for (let i = 0; i < 10; i++) await a.settle();

        const answerA = a.find((node) => node.tagName === "TEXTAREA" && (node as unknown as Node).getAttribute?.("aria-label") === "Your answer");
        assert.ok(answerA, "the answer field must render for an awaiting-input park");
        await a.act(() => setFieldValue(answerA as never, "Rome Public Advisory"));
        assert.equal((answerA as unknown as { value?: string }).value, "Rome Public Advisory", "precondition: the typed text is in instance A's field");
      } finally {
        // No submit. This is the escalation moment: the tree this text lived in goes away.
        await a.unmount();
        for (let i = 0; i < 5; i++) await a.settle();
      }

      // Instance B: a FRESH mount against the identical server-side run (same run_id, same
      // pending_park) — what landing on the full-screen route after an escalation, or coming
      // back to the rail after one, both do to this card's own React identity.
      const b = await renderComponent(App());
      body.appendChild(b.container);
      try {
        for (let i = 0; i < 6; i++) await b.settle();
        const start = b.find((node) => node.tagName === "BUTTON" && textOf(node) === "Start / continue interview");
        assert.ok(start, "the idempotent start/continue control must render again on the fresh instance");
        await b.fireEvent(start!, "click");
        for (let i = 0; i < 10; i++) await b.settle();

        const answerB = findIn(body, (node) => node.tagName === "TEXTAREA" && node.getAttribute?.("aria-label") === "Your answer");
        assert.ok(answerB, "the fresh instance still offers the answer field for the same awaiting-input park");

        // #897's OWN instance of the harness gap the ORIGINAL SPEC-897-1 comment filed as a
        // follow-up: react-dom's `initTextarea` (react-dom-client.development.js) sets
        // `element.value` on MOUNT only when `element.textContent` already equals the initial
        // string (the real-DOM SSR-hydration-match case) — otherwise it sets `element.defaultValue`
        // and leaves `.value` to the BROWSER's native "reflects defaultValue until the field goes
        // dirty" rule. This harness's `HTMLTextAreaElementStub` (test/hookHarness.ts) implements a
        // bare `value` accessor with no such fallback, so a value that arrived through the
        // CONTROLLED PROP (this mount) reads back as `.value === ""` even though React genuinely
        // wrote it — confirmed by instrumentation: `claraThreadStore.getInterviewDraft("c1")` and
        // `answerB`'s own `.defaultValue` (the property react-dom DOES write on this exact path,
        // and the stub has no accessor for, so the plain assignment survives as a queryable
        // property) both read "Rome Public Advisory" at this exact point, only `.value` does not.
        // `defaultValue` is therefore the faithful read here: it is react-dom's own record of what
        // it decided this mount's initial rendered text should be, not a second copy of the store
        // read `claraThreadStore.getInterviewDraft` already proves below.
        assert.equal(
          claraThreadStore.getInterviewDraft("c1"),
          "Rome Public Advisory",
          "#897: the STORE must still hold instance A's text — the ground truth `useSyncExternalStore` reads from",
        );
        assert.equal(
          (answerB as unknown as { defaultValue?: string }).defaultValue ?? "",
          "Rome Public Advisory",
          "#897: react-dom's own initial-mount write to this textarea must carry instance A's text — InterviewRunCard's " +
          "`draft` now reads/writes claraThreadStore.interviewDrafts, keyed by clientId alone, so a " +
          "fresh instance's FIRST render already sees the earlier keystrokes (the same remount the " +
          "rail <-> full-screen altitude change causes — rail-mount.tsx's own note). The rendered, " +
          "user-visible `.value` itself is proven in the browser, not this harness — " +
          "agentic-finish-walk.spec.ts's own #897 arm, where a real textarea's `.value` behaves as specified.",
        );
      } finally {
        await b.unmount();
        for (let i = 0; i < 5; i++) await b.settle();
        // Leaves no residue for a test run later in this same process (Node's test runner does
        // not isolate test() blocks WITHIN one file) — the module-level store this cell exercises
        // is exactly what the next test below (and any future one keyed on "c1") would otherwise
        // inherit stale text from.
        claraThreadStore.clearInterviewDraft("c1");
      }
    },
  );
});

test("#897 — a CONFIRMED delivery clears the draft; a REFUSED one leaves it for the human to fix and resend", async () => {
  // Two independent runs (run-2 succeeds, run-3 is refused), so the two arms below share no
  // server-side state and neither's polling can answer the other's questions.
  const SUCCEEDING_RUN = {
    run_id: "run-2", scope: "client", status: "awaiting_input",
    pending_park: { parkIndex: 1, seg: "legal_name", phase: "q", question: "What is the client's legal name?" },
    terminal: null, activity: [], plan: { id: "plan-1" }, items: [],
  };
  // Advances past the answered park once the answer is accepted, matching what a real `refresh()`
  // after a confirmed `answerInterview` would read — a state that still parks at index 1 would
  // leave `errorHeldAtPark` guessing whether this was refresh-before-write or a real stall.
  const SUCCEEDED_RUN = {
    run_id: "run-2", scope: "client", status: "awaiting_input",
    pending_park: { parkIndex: 2, seg: "fye", phase: "q", question: "What is the financial year end?" },
    terminal: null, activity: [], plan: { id: "plan-1" }, items: [],
  };
  const REFUSING_RUN = {
    run_id: "run-3", scope: "client", status: "awaiting_input",
    pending_park: { parkIndex: 1, seg: "legal_name", phase: "q", question: "What is the client's legal name?" },
    terminal: null, activity: [], plan: { id: "plan-1" }, items: [],
  };

  async function runOneArm(opts: {
    clientId: string;
    startRunId: string;
    initialState: typeof SUCCEEDING_RUN;
    postAnswer: () => Response;
    afterAnswerState: typeof SUCCEEDING_RUN;
  }): Promise<void> {
    let answered = false;
    await withMockedEnv(
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([{ ...OPEN_PLAN, client_id: opts.clientId }]);
        if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([ITEM]);
        if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: opts.clientId, name: "Rome Public Advisory", status: "onboarding" }]);
        if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([]);
        if (url.includes("/rest/v1/chat_sessions")) return jsonResponse([]);
        if (url === "/api/runtime/interview/client/start") return jsonResponse({ run_id: opts.startRunId }, 202);
        if (url === "/api/runtime/interview/answer" && init?.method === "POST") {
          answered = true;
          return opts.postAnswer();
        }
        if (url.startsWith("/api/runtime/interview/state?")) {
          return jsonResponse(answered ? opts.afterAnswerState : opts.initialState);
        }
        throw new Error(`unexpected fetch: ${url}`);
      }) as typeof fetch,
      async () => {
        const body = (globalThis as unknown as { document: { body: Node & { appendChild: (child: unknown) => void } } }).document.body;
        const instance = await renderComponent(
          createElement(NextIntlClientProvider, {
            locale: "en",
            messages,
            children: createElement(ClaraFullScreenThread, { threadId: "", clientId: opts.clientId, returnHref: `/clients/${opts.clientId}` }),
          }),
        );
        body.appendChild(instance.container);
        try {
          for (let i = 0; i < 6; i++) await instance.settle();
          const start = instance.find((node) => node.tagName === "BUTTON" && textOf(node) === "Start / continue interview");
          assert.ok(start, "the idempotent start/continue control must render");
          await instance.fireEvent(start!, "click");
          for (let i = 0; i < 10; i++) await instance.settle();

          const answer = instance.find((node) => node.tagName === "TEXTAREA" && (node as unknown as Node).getAttribute?.("aria-label") === "Your answer");
          assert.ok(answer, "the answer field must render for an awaiting-input park");
          await instance.act(() => setFieldValue(answer as never, "Rome Public Advisory"));

          const submit = instance.find((node) => node.tagName === "BUTTON" && textOf(node) === "Send");
          assert.ok(submit, "the submit control must render once an answer is typed");
          assert.equal((submit as unknown as { disabled?: boolean }).disabled, false, "assert the gate, then act: a typed answer must enable Send");

          // THE SEND CONTROL IS A `type="submit"` BUTTON INSIDE A `<form onSubmit>`, and this
          // harness's stub DOM has no native form submission (`onboarding-progress-sync.test.tsx`'s
          // own `answerCurrentPark` note: a plain click "silently does nothing" — measured there).
          // The form's own handler is invoked directly, the same way `clickButton` invokes a real
          // `onClick` on a real node — `disabled` was asserted first, so this can never be the
          // thing that manufactures a green on a gate that would have blocked a person.
          const form = instance.find((node) => node.tagName === "FORM");
          assert.ok(form, "the composer's form");
          const propsKey = Object.keys(form as object).find((k) => k.startsWith("__reactProps"));
          const onSubmit = propsKey
            ? (form as unknown as Record<string, { onSubmit?: (e: unknown) => unknown }>)[propsKey]?.onSubmit
            : undefined;
          assert.ok(onSubmit, "the composer's form must carry the real submit handler");
          await instance.act(async () => {
            await onSubmit!({ preventDefault() {}, stopPropagation() {}, target: form, currentTarget: form });
          });
          for (let i = 0; i < 12; i++) await instance.settle();
        } finally {
          await instance.unmount();
          for (let i = 0; i < 5; i++) await instance.settle();
        }
      },
    );
  }

  await runOneArm({
    clientId: "c-succeed",
    startRunId: "run-2",
    initialState: SUCCEEDING_RUN,
    postAnswer: () => jsonResponse({ ok: true }),
    afterAnswerState: SUCCEEDED_RUN,
  });
  assert.equal(
    claraThreadStore.getInterviewDraft("c-succeed"),
    "",
    "a CONFIRMED delivery must forget the draft — the same 'gone entirely on delivery' rule clearDraft follows for the composer",
  );

  await runOneArm({
    clientId: "c-refuse",
    startRunId: "run-3",
    initialState: REFUSING_RUN,
    postAnswer: () => jsonResponse({ error: "refused" }, 409),
    afterAnswerState: REFUSING_RUN,
  });
  assert.equal(
    claraThreadStore.getInterviewDraft("c-refuse"),
    "Rome Public Advisory",
    "a REFUSED delivery must leave the human's text exactly where they can still fix and resend it",
  );
  claraThreadStore.clearInterviewDraft("c-refuse");
});
