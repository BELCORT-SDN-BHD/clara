// #629 (B4) — THE ONE FORM, under test.
//
// THE DOOR IS MOCKED AT `fetch`, not at the reader, so every cell exercises the real PostgREST RPC
// shape `lib/work/questions.ts` builds and the real refusal classification `lib/wire.ts` performs.
// A cell that stubbed `answerWorkQuestion` would prove the component calls a function; these prove
// it survives what the DATABASE actually says.
//
// FOUR BEHAVIOURS THAT ONLY A MOUNTED FORM CAN PROVE, and they are the ones the ticket is about:
//   · a validation refusal FOCUSES the first invalid control (not merely renders a message);
//   · an answer accepted ELSEWHERE converges onto the authoritative record and KEEPS the draft;
//   · a retried submit after a lost response sends the SAME op key (a replay, not a second answer);
//   · a bounded set of fields walks locally — next/back/review — and submits once, at the end.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, setFieldValue } from "../../test/hookHarness";
import { configureSessionTokenSource } from "../../lib/session-accessor";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { WorkQuestionForm } from "./work-question-form";
import type { WorkQuestionRecord } from "../../lib/work/questions";
import messages from "../../messages/en.json";

enableDomInspection();

// The door layer refuses to call `fetch` at all without a live session (lib/doors.ts's own
// no_session branch), so a cell that only stubbed `fetch` would prove nothing about the RPCs.
configureSessionTokenSource(async () => "test-token");
// …and the RPC URL is built from this env var (lib/wire.ts), so a cell without it never reaches
// `fetch` either. doors.test.ts sets the same one for the same reason.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

type Stub = Record<string, unknown>;

const QUESTION = "11111111-1111-4111-8111-111111111111";
const WORK = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const TASK = "44444444-4444-4444-8444-444444444444";
const FIRM = "55555555-5555-4555-8555-555555555555";
const USER = "user-629";

function record(over: Partial<WorkQuestionRecord> = {}): WorkQuestionRecord {
  return {
    question_id: QUESTION,
    work_id: WORK,
    client_id: CLIENT,
    task_id: TASK,
    firm_id: FIRM,
    question_version: 1,
    status: "pending",
    question: "Which date should the September rent be posted on, and for how much?",
    context: null,
    reason: "The admitted basis names no amount.",
    fields: [
      { key: "posting_date", label: "Posting date", kind: "date", required: true },
      { key: "amount_cents", label: "Amount", kind: "money", required: true, unit: "MYR" },
    ],
    source_ref: null,
    basis_digest: "a".repeat(64),
    expires_at: "2026-09-24T00:00:00.000Z",
    created_at: "2026-09-10T00:00:00.000Z",
    answer: null,
    answered_by: null,
    answered_at: null,
    answered_role: null,
    delivery_state: "pending",
    delivery_attempts: 0,
    work_status: "awaiting_input",
    work_basis_digest: "a".repeat(64),
    ...over,
  };
}

function App(props: { record: WorkQuestionRecord; onSettled?: () => void; onLeavePending?: () => void }): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(WorkQuestionForm, { record: props.record, userId: USER, onSettled: props.onSettled, onLeavePending: props.onLeavePending }),
  });
}

/** Every RPC the form made, in order: the door name and the body it posted. */
type Call = { fn: string; body: Record<string, unknown> };

function stubDoors(handler: (call: Call) => { status: number; body: unknown }): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
    const url = String(input);
    const fn = url.slice(url.lastIndexOf("/") + 1).split("?")[0] ?? "";
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const call = { fn, body };
    calls.push(call);
    const { status, body: out } = handler(call);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => "application/json" },
      json: async () => out,
      text: async () => JSON.stringify(out),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/** localStorage that lives only for one cell — the real one is not available under node:test and a
 *  form that could not remember a draft must still render (which the no-storage cell proves). */
function stubStorage(): { map: Map<string, string>; restore: () => void } {
  const map = new Map<string, string>();
  const original = (globalThis as { localStorage?: unknown }).localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  });
  return {
    map,
    restore: () => { Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original }); },
  };
}

/** Press a control and let React flush. `clickButton` calls the handler directly, so the state
 *  updates it provokes must be wrapped in `act` by the caller — otherwise the assertion runs
 *  against the render BEFORE the click and every cell in this file is a false green. */
async function press(h: { act: (fn?: () => void | Promise<void>) => Promise<void>; settle: () => Promise<void> }, node: Stub): Promise<void> {
  await h.act(async () => { await clickButton(node); });
  await h.settle();
}

const byTestId = (h: { find: (p: (n: Stub) => boolean) => Stub | null }, id: string) =>
  h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid") === id);

const inputFor = (h: { find: (p: (n: Stub) => boolean) => Stub | null }, key: string) =>
  h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === `wq-${key}`);

/** A CONTROLLED input's rendered value, read off React's own props rather than off the stub node:
 *  the harness's nodes carry whatever `setFieldValue` last wrote, which is exactly the value a
 *  restored-draft assertion must NOT be allowed to read back. */
function valueOf(node: Stub | null): string {
  if (!node) return "";
  const key = Object.keys(node).find((k) => k.startsWith("__reactProps"));
  const props = key ? (node as Record<string, { value?: unknown }>)[key] : undefined;
  return props?.value === undefined || props.value === null ? "" : String(props.value);
}

test("the question, its REASON and its version are rendered — the shared record, not a summary", async () => {
  const s = stubStorage();
  const h = await renderComponent(App({ record: record() }));
  try {
    assert.match(h.text(), /Which date should the September rent be posted on/);
    assert.match(h.text(), /The admitted basis names no amount\./, "the reason is shown, not only the question");
    assert.match(h.text(), /Question 1/, "the version is visible — it is what makes stale detectable");
  } finally {
    await h.unmount();
    s.restore();
  }
});

test("a bounded set walks LOCALLY — one field per step, then a review, then ONE submit", async () => {
  const s = stubStorage();
  const doors = stubDoors(() => ({ status: 200, body: null }));
  const h = await renderComponent(App({ record: record() }));
  try {
    assert.match(h.text(), /Question 1 of 2/, "the walk announces where it is");
    assert.ok(inputFor(h, "posting_date"), "step one is the first field");
    assert.equal(inputFor(h, "amount_cents"), null, "…and only the first field");

    await h.fireEvent(inputFor(h, "posting_date")!, "change", (n) => setFieldValue(n, "2026-09-05"));
    await press(h, byTestId(h, "work-question-next")!);
    assert.ok(inputFor(h, "amount_cents"), "step two is the second field");

    await h.fireEvent(inputFor(h, "amount_cents")!, "change", (n) => setFieldValue(n, "1200.00"));
    await press(h, byTestId(h, "work-question-next")!);
    assert.ok(byTestId(h, "work-question-review"), "the last step is a REVIEW, not a submit surprise");
    assert.equal(doors.calls.length, 0, "nothing was sent while walking — local navigation is local");
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("a single fact is ONE Field — no stepper, no review, submit from where you are", async () => {
  const s = stubStorage();
  const h = await renderComponent(
    App({ record: record({ fields: [{ key: "memo", label: "Memo", kind: "text", required: true }] }) }),
  );
  try {
    assert.equal(byTestId(h, "work-question-progress"), null, "a single field does not announce a walk");
    assert.ok(byTestId(h, "work-question-submit"), "…and offers Submit immediately");
  } finally {
    await h.unmount();
    s.restore();
  }
});

test("an invalid value is refused LOCALLY, names its constraint, and FOCUSES the control", async () => {
  const s = stubStorage();
  const doors = stubDoors(() => ({ status: 200, body: null }));
  const h = await renderComponent(
    App({ record: record({ fields: [{ key: "amount_cents", label: "Amount", kind: "money", required: true }] }) }),
  );
  try {
    await h.fireEvent(inputFor(h, "amount_cents")!, "change", (n) => setFieldValue(n, "1200.555"));
    await press(h, byTestId(h, "work-question-submit")!);
    assert.ok(byTestId(h, "work-question-error-amount_cents"), "the error sits by its control");
    assert.match(h.text(), /at most two decimal places/);
    assert.equal(activeElement(), inputFor(h, "amount_cents"), "the first invalid control took focus");
    assert.equal(doors.calls.length, 0, "and nothing was sent");
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("an accepted answer REPLACES the form with the accepted record — who, when, which version", async () => {
  const s = stubStorage();
  const accepted = record({
    status: "answered",
    answer: { posting_date: "2026-09-05", amount_cents: 120000 },
    answered_by: USER,
    answered_role: "bookkeeper",
    answered_at: "2026-09-11T02:00:00.000Z",
  });
  const doors = stubDoors((call) =>
    call.fn === "answer_work_question"
      ? { status: 200, body: { question_id: QUESTION, work_id: WORK, question_version: 1, status: "answered" } }
      : { status: 200, body: accepted },
  );
  const h = await renderComponent(
    App({ record: record({ fields: [{ key: "amount_cents", label: "Amount", kind: "money", required: true }] }) }),
  );
  try {
    await h.fireEvent(inputFor(h, "amount_cents")!, "change", (n) => setFieldValue(n, "1200.00"));
    await press(h, byTestId(h, "work-question-submit")!);
    assert.ok(byTestId(h, "work-question-accepted"), "the persistent outcome replaces the form");
    assert.match(h.text(), /Answered by a bookkeeper/, "…and attributes it");
    assert.equal(byTestId(h, "work-question-submit"), null, "there is nothing left to submit twice");
    assert.deepEqual(
      doors.calls.filter((c) => c.fn === "answer_work_question").length,
      1,
      "exactly one write",
    );
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("the money a person typed reaches the door as EXACT integer cents, never a float", async () => {
  const s = stubStorage();
  const doors = stubDoors((call) =>
    call.fn === "answer_work_question"
      ? { status: 200, body: { question_id: QUESTION, work_id: WORK, question_version: 1, status: "answered" } }
      : { status: 200, body: record({ status: "answered", answer: { amount_cents: 123435 } }) },
  );
  const h = await renderComponent(
    App({ record: record({ fields: [{ key: "amount_cents", label: "Amount", kind: "money", required: true }] }) }),
  );
  try {
    await h.fireEvent(inputFor(h, "amount_cents")!, "change", (n) => setFieldValue(n, "1,234.35"));
    await press(h, byTestId(h, "work-question-submit")!);
    const write = doors.calls.find((c) => c.fn === "answer_work_question")!;
    assert.deepEqual((write.body.p_answer as Record<string, unknown>).amount_cents, 123435);
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("ANSWERED ELSEWHERE converges on the authoritative record and KEEPS the draft", async () => {
  const s = stubStorage();
  const winner = record({
    status: "answered",
    answer: { amount_cents: 500 },
    answered_by: "someone-else",
    answered_role: "owner",
    answered_at: "2026-09-11T01:00:00.000Z",
  });
  const doors = stubDoors((call) =>
    call.fn === "answer_work_question"
      ? {
          status: 400,
          body: {
            code: "CLR13",
            message: "this question is no longer open (answered)",
            details: JSON.stringify({
              reason: "already_answered",
              current: { status: "answered", question_version: 1, answered_by: "someone-else" },
            }),
          },
        }
      : { status: 200, body: winner },
  );
  const h = await renderComponent(
    App({ record: record({ fields: [{ key: "amount_cents", label: "Amount", kind: "money", required: true }] }) }),
  );
  try {
    await h.fireEvent(inputFor(h, "amount_cents")!, "change", (n) => setFieldValue(n, "1200.00"));
    await press(h, byTestId(h, "work-question-submit")!);
    assert.ok(byTestId(h, "work-question-converged"), "the stale action is replaced");
    assert.match(h.text(), /Somebody else answered this question first/);
    assert.ok(byTestId(h, "work-question-accepted"), "the AUTHORITATIVE answer is shown");
    assert.match(h.text(), /Answered by a owner/);
    const kept = byTestId(h, "work-question-kept-draft");
    assert.ok(kept, "the still-useful draft survives");
    // THE PRODUCT'S OWN MONEY FORMAT. The draft now holds what the cents control ACCEPTED, rendered
    // through `formatCents` — the same grouped text the composer and every balance in this product
    // show — rather than the raw keystrokes. "1,200.00" is the amount; "1200.00" was a transcript
    // of typing.
    assert.match(h.text(), /1,200\.00/, "…and is still readable");
    assert.equal(
      doors.calls.filter((c) => c.fn === "answer_work_question").length,
      1,
      "a converged card emits NO second effect",
    );
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("a LOST RESPONSE offers the same submit again, and the retry carries the SAME op key", async () => {
  const s = stubStorage();
  let attempt = 0;
  const doors = stubDoors((call) => {
    if (call.fn !== "answer_work_question") return { status: 200, body: record({ status: "answered", answer: {} }) };
    attempt += 1;
    if (attempt === 1) return { status: 503, body: { message: "gateway lost" } };
    return { status: 200, body: { question_id: QUESTION, work_id: WORK, question_version: 1, status: "answered" } };
  });
  const h = await renderComponent(
    App({ record: record({ fields: [{ key: "amount_cents", label: "Amount", kind: "money", required: true }] }) }),
  );
  try {
    await h.fireEvent(inputFor(h, "amount_cents")!, "change", (n) => setFieldValue(n, "1200.00"));
    await press(h, byTestId(h, "work-question-submit")!);
    assert.match(h.text(), /We could not tell whether your answer was recorded/);
    const submit = byTestId(h, "work-question-submit");
    assert.ok(submit, "the action is still there — the person is not stranded");

    await press(h, submit!);
    const writes = doors.calls.filter((c) => c.fn === "answer_work_question");
    assert.equal(writes.length, 2);
    assert.equal(
      writes[0]!.body.p_op_key,
      writes[1]!.body.p_op_key,
      "the SAME key — the database REPLAYS it rather than recording a second answer",
    );
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("a DENIED caller gets a read-only surface and keeps what they typed", async () => {
  const s = stubStorage();
  const doors = stubDoors((call) =>
    call.fn === "answer_work_question"
      ? {
          status: 400,
          body: { code: "CLR04", message: "this client is not active", details: JSON.stringify({ reason: "client_inactive" }) },
        }
      : { status: 200, body: record() },
  );
  const h = await renderComponent(
    App({ record: record({ fields: [{ key: "amount_cents", label: "Amount", kind: "money", required: true }] }) }),
  );
  try {
    await h.fireEvent(inputFor(h, "amount_cents")!, "change", (n) => setFieldValue(n, "1200.00"));
    await press(h, byTestId(h, "work-question-submit")!);
    assert.ok(byTestId(h, "work-question-denied"));
    assert.equal(byTestId(h, "work-question-submit"), null, "no control offers an act the caller cannot take");
    assert.ok(byTestId(h, "work-question-kept-draft"), "and the draft is still theirs");
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("a draft is PRESERVED under (user, firm, client, question, version) and restored on remount", async () => {
  const s = stubStorage();
  const one = await renderComponent(
    App({ record: record({ fields: [{ key: "memo", label: "Memo", kind: "text", required: true }] }) }),
  );
  await one.fireEvent(inputFor(one, "memo")!, "change", (n) => setFieldValue(n, "September rent"));
  await one.unmount();
  try {
    const keys = [...s.map.keys()];
    assert.equal(keys.length, 1);
    assert.match(keys[0]!, new RegExp(`clara\\.wq\\.draft\\.${USER}\\.${FIRM}\\.${CLIENT}\\.${QUESTION}\\.1$`));

    const two = await renderComponent(
      App({ record: record({ fields: [{ key: "memo", label: "Memo", kind: "text", required: true }] }) }),
    );
    try {
      assert.equal(valueOf(inputFor(two, "memo")), "September rent");
    } finally {
      await two.unmount();
    }
  } finally {
    s.restore();
  }
});

test("a form mounted on an ALREADY-SETTLED question offers no control and shows what happened", async () => {
  const s = stubStorage();
  const h = await renderComponent(
    App({ record: record({ status: "expired", fields: [{ key: "memo", label: "Memo", kind: "text" }] }) }),
  );
  try {
    assert.equal(byTestId(h, "work-question-submit"), null);
    assert.match(h.text(), /This question expired before it was answered/);
  } finally {
    await h.unmount();
    s.restore();
  }
});

test("LEAVE PENDING is offered beside Submit — a person is never forced to guess", async () => {
  const s = stubStorage();
  let left = 0;
  const h = await renderComponent(
    App({
      record: record({ fields: [{ key: "memo", label: "Memo", kind: "text", required: true }] }),
      onLeavePending: () => { left += 1; },
    }),
  );
  try {
    const leave = byTestId(h, "work-question-leave");
    assert.ok(leave, "the affordance exists");
    await press(h, leave!);
    assert.equal(left, 1, "…and closing it writes nothing");
  } finally {
    await h.unmount();
    s.restore();
  }
});

// ===========================================================================================
// THE REVIEWED FINDINGS. Each cell below is the one that would have caught its finding.
// ===========================================================================================

/** Every live region in the rendered tree: a node carrying a computed `role="alert"`/`"status"`,
 *  or an explicit `aria-live`. The count is the point — §5 asks for ONE announcement owner. */
function liveRegions(h: { container: Stub }): Stub[] {
  const out: Stub[] = [];
  const walk = (n: Stub) => {
    const get = (n as { getAttribute?: (k: string) => string | null }).getAttribute;
    const role = get ? get.call(n, "role") : null;
    const live = get ? get.call(n, "aria-live") : null;
    if (role === "alert" || role === "status" || (live !== null && live !== "off")) out.push(n);
    for (const c of ((n as { childNodes?: Stub[] }).childNodes ?? [])) walk(c);
  };
  walk(h.container);
  return out;
}

test("A DECIMAL COMMA is refused by the control, and never sent as a hundred times the amount", async () => {
  const s = stubStorage();
  const doors = stubDoors(() => ({ status: 200, body: null }));
  const h = await renderComponent(
    App({ record: record({ fields: [{ key: "amount_cents", label: "Amount", kind: "money", required: true }] }) }),
  );
  try {
    // "1234,56" is RM1,234.56 to the person who typed it. Under the parser this lane used to own —
    // a blanket comma strip before validation — it became 123456 cents: RM123,456.00, a hundredfold.
    await h.fireEvent(inputFor(h, "amount_cents")!, "change", (n) => setFieldValue(n, "1234,56"));
    await press(h, byTestId(h, "work-question-submit")!);
    assert.equal(
      doors.calls.filter((c) => c.fn === "answer_work_question").length,
      0,
      "the hundred-fold reading is never sent — the submit is refused locally",
    );
    assert.ok(byTestId(h, "work-question-error-amount_cents"), "…and the field says why");
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("the money control sends EXACT cents through the product's one parser", async () => {
  const s = stubStorage();
  const doors = stubDoors((call) =>
    call.fn === "answer_work_question"
      ? { status: 200, body: { question_id: QUESTION, work_id: WORK, question_version: 1, status: "answered" } }
      : { status: 200, body: record({ status: "answered", answer: { amount_cents: 100000 } }) },
  );
  const h = await renderComponent(
    App({ record: record({ fields: [{ key: "amount_cents", label: "Amount", kind: "money", required: true }] }) }),
  );
  try {
    await h.fireEvent(inputFor(h, "amount_cents")!, "change", (n) => setFieldValue(n, "1,000.00"));
    await press(h, byTestId(h, "work-question-submit")!);
    const write = doors.calls.find((c) => c.fn === "answer_work_question")!;
    assert.deepEqual((write.body.p_answer as Record<string, unknown>).amount_cents, 100000);
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("ANNOUNCE=NONE renders the same states with NO live region; the default still speaks", async () => {
  const s = stubStorage();
  const settled = record({ status: "expired", fields: [{ key: "memo", label: "Memo", kind: "text" }] });

  const speaking = await renderComponent(App({ record: settled }));
  const spoke = liveRegions(speaking).length;
  const spokenText = speaking.text();
  await speaking.unmount();
  assert.ok(spoke >= 1, "the default owns its own announcement — it IS the thing that changed");

  const quiet = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(WorkQuestionForm, { record: settled, userId: USER, announce: "none" }),
    }),
  );
  try {
    assert.equal(liveRegions(quiet).length, 0,
      "inside a surface that already announces, this form opens NO live region of its own");
    assert.equal(quiet.text(), spokenText,
      "…and says exactly the same words, in the same order — silent is unannounced, never hidden");
  } finally {
    await quiet.unmount();
    s.restore();
  }
});

test("OPERATION_IN_FLIGHT is transient: the form stays a form, and the retry replays the same key", async () => {
  const s = stubStorage();
  let settledCalls = 0;
  let attempt = 0;
  const doors = stubDoors((call) => {
    if (call.fn !== "answer_work_question") return { status: 200, body: record() };
    attempt += 1;
    if (attempt === 1) {
      return {
        status: 400,
        body: {
          code: "CLR13",
          message: "another operation with this key is in flight",
          details: JSON.stringify({ reason: "operation_in_flight" }),
        },
      };
    }
    return { status: 200, body: { question_id: QUESTION, work_id: WORK, question_version: 1, status: "answered" } };
  });
  const h = await renderComponent(
    App({
      record: record({ fields: [{ key: "memo", label: "Memo", kind: "text", required: true }] }),
      onSettled: () => { settledCalls += 1; },
    }),
  );
  try {
    await h.fireEvent(inputFor(h, "memo")!, "change", (n) => setFieldValue(n, "September rent"));
    await press(h, byTestId(h, "work-question-submit")!);

    assert.equal(byTestId(h, "work-question-converged"), null,
      "in-flight is NOT a convergence — nothing about the question moved");
    assert.equal(settledCalls, 0,
      "…so the surface is not told to drop the row; on Needs-you that would remove it mid-submit");
    assert.ok(byTestId(h, "work-question-in-flight"), "the person is told their own send is still going");
    const submit = byTestId(h, "work-question-submit");
    assert.ok(submit, "…and the action is still in front of them");

    await press(h, submit!);
    const writes = doors.calls.filter((c) => c.fn === "answer_work_question");
    assert.equal(writes.length, 2);
    assert.equal(writes[0]!.body.p_op_key, writes[1]!.body.p_op_key,
      "the retry REPLAYS the same key rather than answering twice");
    assert.ok(byTestId(h, "work-question-accepted"), "and the second press lands");
  } finally {
    await h.unmount();
    doors.restore();
    s.restore();
  }
});

test("an ACCOUNT field offers the client's chart when it has one, and a typed code when it does not", async () => {
  const s = stubStorage();
  const withChart = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(WorkQuestionForm, {
        record: record({ fields: [{ key: "account", label: "Which account?", kind: "account", required: true }] }),
        userId: USER,
        accounts: [
          { account_code: "6100", name: "Rent", is_active: true },
          { account_code: "9999", name: "Retired", is_active: false },
        ],
      }),
    }),
  );
  try {
    assert.ok(byTestId(withChart, "work-question-account-account"),
      "the header names a Select over the client chart, and this is one");
  } finally {
    await withChart.unmount();
  }

  const withoutChart = await renderComponent(
    App({ record: record({ fields: [{ key: "account", label: "Which account?", kind: "account", required: true }] }) }),
  );
  try {
    assert.equal(byTestId(withoutChart, "work-question-account-account"), null);
    assert.ok(inputFor(withoutChart, "account"),
      "an unreadable chart degrades to a typed code, never to an empty picker");
  } finally {
    await withoutChart.unmount();
    s.restore();
  }
});
