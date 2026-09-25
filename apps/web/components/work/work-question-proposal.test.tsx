// #933 — ENTRANCE 3 OF 3: THE CONVERSATION QUESTION FORM PRE-FILLS FROM CLARA'S PROPOSAL.
//
// THIS IS THE ENTRANCE THE PROPOSAL IS NATIVE TO. The other two find the block by reading the
// asset's parked question; here the question record IS in hand, so the block is read straight off
// `record.source_ref` — the same object, the same values, no second read and no second opinion.
//
// WHAT EACH CELL PINS:
//   prefill        the declared controls come up carrying the proposal, in the ANSWER DOOR's own
//                  spelling: a `text`-declared driver as the string "60" and a `money` field as
//                  integer cents. `clara._assert_work_answer` refuses the other spelling, so a
//                  pre-fill in the wrong one is a form nobody can submit.
//   reason         the one line Clara derived them from is on screen, beside the question's own.
//   the_edit       the ANSWER the door receives is the person's values. Ticket 883's ruling, at
//                  the entrance a model opened.
//   draft_wins     a saved draft is NEVER replaced by a proposal. Unsent work a person typed is
//                  exactly what the draft machinery exists to protect, and a suggestion arriving
//                  on a later mount must not overwrite it.
//   no_proposal    a question carrying no block renders the ordinary empty form — every #639
//                  question opened before claraWork_v6 is that case, and there are real ones.
//
// The harness is `work-question-form.test.tsx`'s own, kept in its own file so that file's subject
// (the form's refusal, convergence and walk behaviour) stays readable.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, setFieldValue } from "../../test/hookHarness";
import { configureSessionTokenSource } from "../../lib/session-accessor";
import { enableDomInspection } from "../../test/domInspect";
import { WorkQuestionForm } from "./work-question-form";
import {
  workAnswerDraftKey, writeWorkAnswerDraft, type WorkQuestionRecord,
} from "../../lib/work/questions";
import messages from "../../messages/en.json";

enableDomInspection();

configureSessionTokenSource(async () => "test-token");
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

globalThis.fetch = (async (input: unknown) => {
  const url = String(input);
  if (url.includes("/rpc/work_knowledge_drift")) {
    return {
      ok: true, status: 200, headers: { get: () => "application/json" },
      json: async () => null, text: async () => "null",
    } as unknown as Response;
  }
  throw new Error(`work-question-proposal.test: un-stubbed fetch ${url}`);
}) as typeof globalThis.fetch;

type Stub = Record<string, unknown>;

const QUESTION = "11111111-1111-4111-8111-111111111111";
const WORK = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const TASK = "44444444-4444-4444-8444-444444444444";
const FIRM = "55555555-5555-4555-8555-555555555555";
const ASSET = "66666666-6666-4666-8666-666666666666";
const USER = "user-933";

const PROPOSAL_REASON =
  "Every other completed asset on 1510 is depreciated straight line over 60 months, so I propose "
  + "the same. I propose 1 March 2026 — the acquisition's own posting date — as the in-service "
  + "date, and a nil residual, which is this firm's default.";

/** #639's declared fields, exactly as the db battery drives them. */
const FA_FIELDS = [
  { key: "method", label: "Depreciation method", kind: "choice", required: true,
    options: [
      { value: "straight_line", label: "Straight line" },
      { value: "reducing_balance", label: "Reducing balance" },
      { value: "none", label: "Not depreciated" },
    ] },
  { key: "useful_life_months", label: "Useful life (months)", kind: "text", required: false, unit: "months" },
  { key: "rate_bps", label: "Annual rate (basis points)", kind: "text", required: false, unit: "bps" },
  { key: "residual_cents", label: "Residual value", kind: "money", required: false },
  { key: "start_date", label: "In-service (depreciation start) date", kind: "date", required: true },
  { key: "description", label: "Asset description", kind: "text", required: false },
];

const PROPOSAL = {
  v: 1,
  method: "straight_line",
  useful_life_months: 60,
  rate_bps: null,
  residual_cents: 0,
  start_date: "2026-03-01",
  description: "Air compressor, workshop bay 2",
  basis: ["account_siblings", "acquisition_date", "firm_default_residual"],
  reason: PROPOSAL_REASON,
};

function record(over: Partial<WorkQuestionRecord> = {}): WorkQuestionRecord {
  return {
    question_id: QUESTION,
    work_id: WORK,
    client_id: CLIENT,
    task_id: TASK,
    firm_id: FIRM,
    question_version: 1,
    status: "pending",
    question: "How is the air compressor depreciated?",
    context: "Cost 1200000 cents.",
    reason: "The acquisition is posted and the register cannot compute depreciation without a method and an in-service date.",
    fields: FA_FIELDS,
    source_ref: { kind: "fixed_asset", asset_id: ASSET, proposal: PROPOSAL },
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

function App(props: { record: WorkQuestionRecord }): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(WorkQuestionForm, { record: props.record, userId: USER }),
  });
}

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

async function press(h: { act: (fn?: () => void | Promise<void>) => Promise<void>; settle: () => Promise<void> }, node: Stub): Promise<void> {
  await h.act(async () => { await clickButton(node); });
  await h.settle();
}

const byTestId = (h: { find: (p: (n: Stub) => boolean) => Stub | null }, id: string) =>
  h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid") === id);

const inputFor = (h: { find: (p: (n: Stub) => boolean) => Stub | null }, key: string) =>
  h.find((n) => ((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") ?? "").endsWith(`-wq-${key}`));

function valueOf(node: Stub | null): string {
  if (!node) return "";
  const key = Object.keys(node).find((k) => k.startsWith("__reactProps"));
  const props = key ? (node as Record<string, { value?: unknown }>)[key] : undefined;
  return props?.value === undefined || props.value === null ? "" : String(props.value);
}

/** Walk the stepper to the review step, pressing Next once per field. */
async function toReview(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  for (let i = 0; i < FA_FIELDS.length; i++) {
    const next = byTestId(h, "work-question-next");
    if (!next) break;
    await press(h, next);
  }
}

test("p933.conversation.prefill the declared controls come up carrying the proposal, each in its own wire spelling", async () => {
  const storage = stubStorage();
  const h = await renderComponent(App({ record: record() }));
  try {
    await h.settle();
    await press(h, byTestId(h, "work-question-next")!);
    assert.equal(valueOf(inputFor(h, "useful_life_months")), "60",
      "prefill: a `text`-declared driver is a STRING — clara._assert_work_answer refuses the number");
    await press(h, byTestId(h, "work-question-next")!);
    assert.equal(valueOf(inputFor(h, "rate_bps")), "",
      "prefill: an ungrounded driver stays blank rather than becoming a value nobody proposed");
    await press(h, byTestId(h, "work-question-next")!);
    await press(h, byTestId(h, "work-question-next")!);
    assert.equal(valueOf(inputFor(h, "start_date")), "2026-03-01");
    await press(h, byTestId(h, "work-question-next")!);
    assert.equal(valueOf(inputFor(h, "description")), "Air compressor, workshop bay 2");
  } finally {
    await h.unmount();
    storage.restore();
  }
});

// THE CHOICE FIELD IS ASSERTED THROUGH THE DOOR, not through a control. A `choice` renders as a
// `RadioGroup` whose value lives on a component rather than on a dom node this harness can read,
// and the question that actually matters is what the ANSWER carries — which is also the ticket's
// own sentence: "the person confirms with one action".
test("p933.conversation.confirm_as_proposed confirming without touching anything sends EXACTLY the proposal — one action, six fields", async () => {
  const storage = stubStorage();
  const doors = stubDoors((call) => {
    if (call.fn === "answer_work_question") {
      return { status: 200, body: {
        question_id: QUESTION, work_id: WORK, question_version: 1, status: "answered",
        answered_by: USER, answered_role: "bookkeeper", answered_at: "2026-09-11T00:00:00.000Z",
      } };
    }
    return { status: 200, body: null };
  });
  const h = await renderComponent(App({ record: record() }));
  try {
    await h.settle();
    await toReview(h);
    await press(h, byTestId(h, "work-question-submit")!);
    const answered = doors.calls.find((c) => c.fn === "answer_work_question");
    assert.ok(answered, "confirm_as_proposed: the answer door was driven with no field touched");
    assert.deepEqual(answered!.body.p_answer, {
      method: "straight_line",
      useful_life_months: "60",
      residual_cents: 0,
      start_date: "2026-03-01",
      description: "Air compressor, workshop bay 2",
    }, "confirm_as_proposed: the proposal's own values, in the answer door's own spelling, and the "
      + "ungrounded rate ABSENT rather than blank");
  } finally {
    await h.unmount();
    doors.restore();
    storage.restore();
  }
});

test("p933.conversation.reason Clara's one line renders beside the question's own reason", async () => {
  const storage = stubStorage();
  const h = await renderComponent(App({ record: record() }));
  try {
    await h.settle();
    const note = byTestId(h, "work-question-proposal");
    assert.ok(note, "reason: the pre-fill accounts for itself here too");
    const said = String((note as { textContent?: unknown }).textContent ?? "");
    assert.match(said, /Every other completed asset on 1510 is depreciated straight line over 60 months/);
    assert.ok(byTestId(h, "work-question-reason"),
      "reason: …and the QUESTION's own reason is still there — they answer different questions");
  } finally {
    await h.unmount();
    storage.restore();
  }
});

test("p933.conversation.the_edit the answer the door receives is the person's values, never the proposal's", async () => {
  const storage = stubStorage();
  const doors = stubDoors((call) => {
    if (call.fn === "answer_work_question") {
      return { status: 200, body: {
        question_id: QUESTION, work_id: WORK, question_version: 1, status: "answered",
        answered_by: USER, answered_role: "bookkeeper", answered_at: "2026-09-11T00:00:00.000Z",
      } };
    }
    if (call.fn === "get_work_question") return { status: 200, body: null };
    return { status: 200, body: null };
  });
  const h = await renderComponent(App({ record: record() }));
  try {
    await h.settle();
    await press(h, byTestId(h, "work-question-next")!);
    await h.act(async () => { setFieldValue(inputFor(h, "useful_life_months")!, "84"); });
    await h.settle();
    await toReview(h);
    await press(h, byTestId(h, "work-question-submit")!);

    const answered = doors.calls.find((c) => c.fn === "answer_work_question");
    assert.ok(answered, "the_edit: the answer door was driven");
    const answer = answered!.body.p_answer as Record<string, unknown>;
    assert.equal(answer.useful_life_months, "84",
      "the_edit: a form that submitted its seed would send 60 — ticket 883's ruling, measured");
    assert.equal(answer.method, "straight_line", "the_edit: and the untouched fields are still the proposal's");
    assert.equal(answer.start_date, "2026-03-01");
    assert.equal(answer.residual_cents, 0, "the_edit: the money field travels as integer cents");
  } finally {
    await h.unmount();
    doors.restore();
    storage.restore();
  }
});

test("p933.conversation.draft_wins a saved draft is NEVER replaced by the proposal — unsent work a person typed is what the draft machinery is for", async () => {
  const storage = stubStorage();
  try {
    writeWorkAnswerDraft(
      workAnswerDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT, questionId: QUESTION, version: 1 }),
      { method: "none", start_date: "2026-07-01" });
    const doors = stubDoors((call) => {
      if (call.fn === "answer_work_question") {
        return { status: 200, body: {
          question_id: QUESTION, work_id: WORK, question_version: 1, status: "answered",
          answered_by: USER, answered_role: "bookkeeper", answered_at: "2026-09-11T00:00:00.000Z",
        } };
      }
      return { status: 200, body: null };
    });
    const h = await renderComponent(App({ record: record() }));
    try {
      await h.settle();
      await press(h, byTestId(h, "work-question-next")!);
      assert.equal(valueOf(inputFor(h, "useful_life_months")), "",
        "draft_wins: the proposal does not leak in field by field either");
      await toReview(h);
      await press(h, byTestId(h, "work-question-submit")!);
      const answered = doors.calls.find((c) => c.fn === "answer_work_question");
      assert.ok(answered, "draft_wins: the answer door was driven");
      assert.deepEqual(answered!.body.p_answer, { method: "none", start_date: "2026-07-01" },
        "draft_wins: exactly what the person had typed and not sent — no proposal value joined it");
    } finally {
      await h.unmount();
      doors.restore();
    }
  } finally {
    storage.restore();
  }
});

test("p933.conversation.no_proposal a ticket-639 question that carries no block renders the ordinary empty form", async () => {
  const storage = stubStorage();
  const h = await renderComponent(App({ record: record({ source_ref: { kind: "fixed_asset", asset_id: ASSET } }) }));
  try {
    await h.settle();
    assert.ok(!byTestId(h, "work-question-proposal"), "no_proposal: nothing to account for, so no note");
    await press(h, byTestId(h, "work-question-next")!);
    assert.equal(valueOf(inputFor(h, "useful_life_months")), "",
      "no_proposal: today's behaviour, unchanged — every question opened before claraWork_v6 is this case");
  } finally {
    await h.unmount();
    storage.restore();
  }
});

// ------------------------------------------------------------------------------------------
// #1093 ITEM 3 — THE SETTLED SURFACE: "Clara proposed, who confirmed". `WorkQuestionForm` is the
// ONE form rendered on B3/B4/B6 alike (this file's own header), so wiring the departure note here
// covers every surface that renders a settled fixed-asset particulars question — there is no
// second copy to keep in step. `AcceptedAnswer` is what renders once `record.status === "answered"`.
// ------------------------------------------------------------------------------------------

function settledRecord(answer: Record<string, unknown>): WorkQuestionRecord {
  return record({
    status: "answered",
    answer,
    answered_by: USER,
    answered_role: "bookkeeper",
    answered_at: "2026-09-11T00:00:00.000Z",
  });
}

test("p933.conversation.settled_departure a settled question shows what Clara proposed beside a field the person confirmed DIFFERENTLY", async () => {
  const h = await renderComponent(App({ record: settledRecord({
    method: "straight_line", useful_life_months: "84", residual_cents: 150_000,
    start_date: "2026-03-01", description: "Air compressor, workshop bay 2",
  }) }));
  try {
    await h.settle();
    assert.ok(byTestId(h, "work-question-accepted"), "settled_departure: the settled record renders");
    const confirmedLife = byTestId(h, "work-question-accepted-useful_life_months");
    assert.match(String((confirmedLife as { textContent?: unknown } | null)?.textContent ?? ""), /84/,
      "settled_departure: the CONFIRMED value renders where every other settled field already does");
    const proposedLife = byTestId(h, "work-question-proposed-useful_life_months");
    assert.ok(proposedLife, "settled_departure: the field Clara proposed differently is annotated");
    assert.match(String((proposedLife as { textContent?: unknown }).textContent ?? ""), /60/,
      "settled_departure: the annotation names what CLARA proposed, 60 — never the 84 already shown beside it");
    assert.ok(!byTestId(h, "work-question-proposed-start_date"),
      "settled_departure: the in-service date was confirmed AS PROPOSED, so it carries no departure annotation");
    assert.ok(!byTestId(h, "work-question-proposed-method"),
      "settled_departure: method was confirmed as proposed too");
  } finally {
    await h.unmount();
  }
});

test("p933.conversation.settled_as_proposed a settled question confirmed EXACTLY as proposed carries no departure annotation anywhere", async () => {
  const h = await renderComponent(App({ record: settledRecord({
    method: "straight_line", useful_life_months: "60", residual_cents: 0,
    start_date: "2026-03-01", description: "Air compressor, workshop bay 2",
  }) }));
  try {
    await h.settle();
    assert.ok(byTestId(h, "work-question-accepted"));
    for (const field of FA_FIELDS) {
      assert.ok(!byTestId(h, `work-question-proposed-${field.key}`),
        `settled_as_proposed: ${field.key} was confirmed as proposed — nothing departed, nothing to annotate`);
    }
  } finally {
    await h.unmount();
  }
});

test("p933.conversation.settled_no_proposal a settled #639 question that carried no proposal renders the accepted answer with no departure annotation at all", async () => {
  const h = await renderComponent(App({
    record: {
      ...settledRecord({ method: "none", start_date: "2026-03-01" }),
      source_ref: { kind: "fixed_asset", asset_id: ASSET },
    },
  }));
  try {
    await h.settle();
    assert.ok(byTestId(h, "work-question-accepted"), "settled_no_proposal: the settled record still renders");
    for (const field of FA_FIELDS) {
      assert.ok(!byTestId(h, `work-question-proposed-${field.key}`),
        `settled_no_proposal: ${field.key} has nothing proposed to depart from — every #639 question opened before claraWork_v6 is this case`);
    }
  } finally {
    await h.unmount();
  }
});
