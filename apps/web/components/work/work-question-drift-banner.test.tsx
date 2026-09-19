// #658 — "YOUR BASIS CHANGED" ON THE ANSWER FORM.
//
// WHY IT IS A FACE RATHER THAN A DOOR REFUSAL. `clara.answer_work_question` compares the op-key
// hash, the `question_version` and the client's status, and NEVER a knowledge version (#885).
// Splicing a sixth comparison into a body five migrations have already spliced (0180, 0184, 0198,
// 0200, 0216) was refused by this ticket, and one refusal code that has to mean both "you were
// slow" and "your basis moved" is unreadable. So the person is TOLD, in the door's own terms, and
// left to decide.
//
// THE PRODUCT CLAIMS THESE CELLS MAKE:
//   1. `relevant: true` names the keys the Work actually READ — the intersection the door already
//      computed, never every key that moved;
//   2. `relevant: null` gets its OWN wording and never a confident "unrelated": no read-set was
//      recorded, so whether the change affects this Work is unknown;
//   3. `drifted: false`, an unreadable drift and a DENIED drift each show NOTHING — "I could not
//      ask" must not be dressed as "your basis moved", and neither may silence the form;
//   4. THE BANNER DOES NOT CLEAR A TYPED ANSWER — the draft survives the read landing;
//   5. a settled question spends no request at all.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { configureSessionTokenSource } from "../../lib/session-accessor";
import { enableDomInspection } from "../../test/domInspect";
import { WorkQuestionForm } from "./work-question-form";
import { driftBannerKeys, driftBannerKind } from "../../lib/work/knowledge";
import type { WorkQuestionRecord } from "../../lib/work/questions";
import messages from "../../messages/en.json";

enableDomInspection();

configureSessionTokenSource(async () => "test-token");
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

type Stub = Record<string, unknown>;

const QUESTION = "11111111-1111-4111-8111-111111111111";
const WORK = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const TASK = "44444444-4444-4444-8444-444444444444";
const FIRM = "55555555-5555-4555-8555-555555555555";
const USER = "user-658";

function record(over: Partial<WorkQuestionRecord> = {}): WorkQuestionRecord {
  return {
    question_id: QUESTION,
    work_id: WORK,
    client_id: CLIENT,
    task_id: TASK,
    firm_id: FIRM,
    question_version: 1,
    status: "pending",
    question: "Which date should the September rent be posted on?",
    context: null,
    reason: "The admitted basis names no date.",
    fields: [{ key: "posting_date", label: "Posting date", kind: "date", required: true }],
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

function App(rec: WorkQuestionRecord): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(WorkQuestionForm, { record: rec, userId: USER }),
  });
}

type Call = { fn: string };

/** Answer `work_knowledge_drift` with `body`; refuse anything else loudly. */
function stubDrift(body: unknown, status = 200): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    const fn = url.slice(url.lastIndexOf("/") + 1).split("?")[0] ?? "";
    calls.push({ fn });
    if (fn !== "work_knowledge_drift") throw new Error(`unexpected door ${fn}`);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => "application/json" },
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function drift(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    observed_version: "42", current_version: "50", observed_from: "read", drifted: true,
    moved_keys: ["sst_regime", "default_currency"], read_keys: ["sst_regime"], relevant: true,
    as_of: "2026-09-19",
    read: {
      status: "ok", reason: null, purpose: "accounting_work",
      tiers: { core: 3, requested: 0, remainder: 4 }, records_shown: 7, truncated: false,
      run_id: "wrun_01M20WGD9ETKK6RWCBA8CWG1GE", seq: 1, read_at: "2026-09-19T02:00:00Z",
      keys: ["sst_regime"],
    },
    work_id: WORK, client_id: CLIENT,
    ...over,
  };
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

// =============================================================================================
// The judgement itself, first. It is exported so the Work block and the form cannot disagree.
// =============================================================================================

test("wqd.01 driftBannerKind — three inputs, three answers, and `null` is NEVER folded into `false`", () => {
  assert.equal(driftBannerKind(null), "none");
  assert.equal(driftBannerKind({ kind: "denied" }), "none", "a denial is not a drift warning");
  assert.equal(driftBannerKind({ kind: "unreadable", message: "x" }), "none",
    "\"I could not ask\" must never be dressed as \"your basis moved\"");
  assert.equal(driftBannerKind({ kind: "ok", drift: drift({ drifted: false, relevant: false }) as never }), "none");
  assert.equal(driftBannerKind({ kind: "ok", drift: drift({ relevant: false }) as never }), "none",
    "the basis moved, but not in anything this Work read");
  assert.equal(driftBannerKind({ kind: "ok", drift: drift() as never }), "relevant");
  assert.equal(driftBannerKind({ kind: "ok", drift: drift({ relevant: null, observed_from: "trace", read_keys: null }) as never }),
    "unrecorded", "no read-set was recorded, so relevance is unknown -- and that is its own answer");
});

test("wqd.02 driftBannerKeys names only the keys the Work READ — the door's intersection, not every move", () => {
  assert.deepEqual(driftBannerKeys({ kind: "ok", drift: drift() as never }), ["sst_regime"]);
  assert.deepEqual(driftBannerKeys({ kind: "ok", drift: drift({ relevant: null, read_keys: null }) as never }), [],
    "the unrecorded wording names no key BECAUSE it cannot");
  assert.deepEqual(driftBannerKeys(null), []);
});

// =============================================================================================
// The mounted form
// =============================================================================================

test("wqd.03 `relevant: true` names the changed key the Work read, and no other", async () => {
  const s = stubDrift(drift());
  const h = await renderComponent(App(record()));
  try {
    for (let i = 0; i < 6; i++) await h.settle();
    const text = h.text();
    assert.match(text, /A record this Work read has changed/);
    assert.match(text, /sst_regime/);
    assert.ok(!/default_currency/.test(text),
      "a key that moved but was NOT read must not be named — that would send somebody to re-check a fact they never used");
    assert.ok(byTestId(h, "work-knowledge-drift-relevant"));
  } finally {
    await h.unmount();
    s.restore();
  }
});

test("wqd.04 `relevant: null` gets its own wording and NEVER a confident `unrelated`", async () => {
  const s = stubDrift(drift({ observed_from: "trace", read: null, read_keys: null, relevant: null }));
  const h = await renderComponent(App(record()));
  try {
    for (let i = 0; i < 6; i++) await h.settle();
    const text = h.text();
    assert.match(text, /changed after this Work last read it/);
    assert.match(text, /was not recorded/);
    assert.ok(!/unrelated|does not affect|no effect/i.test(text),
      "the absence of a read-set is not evidence that nothing relevant moved");
    assert.ok(byTestId(h, "work-knowledge-drift-unrecorded"));
    assert.equal(byTestId(h, "work-knowledge-drift-relevant"), null);
  } finally {
    await h.unmount();
    s.restore();
  }
});

test("wqd.05 no drift, an unreadable drift and a DENIED drift each show NOTHING", async () => {
  for (const [body, status, label] of [
    [drift({ drifted: false, relevant: false, current_version: "42" }), 200, "no drift"],
    [{ message: "boom" }, 500, "unreadable"],
    [{ code: "CLR04", message: "insufficient role", details: null, hint: null }, 400, "denied"],
  ] as const) {
    const s = stubDrift(body, status);
    const h = await renderComponent(App(record()));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.equal(byTestId(h, "work-knowledge-drift-relevant"), null, label);
      assert.equal(byTestId(h, "work-knowledge-drift-unrecorded"), null, label);
      // …and the form is still a form: the read never silences the thing a person came to use.
      assert.ok(inputFor(h, "posting_date"), `${label}: the control is still there`);
    } finally {
      await h.unmount();
      s.restore();
    }
  }
});

test("wqd.06 the banner does NOT clear a typed answer", async () => {
  // A drift that resolves only AFTER the person has typed — the order that matters.
  let resolveDrift: ((v: unknown) => void) | null = null;
  const pending = new Promise((r) => { resolveDrift = r; });
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (!url.includes("/rpc/work_knowledge_drift")) throw new Error(`unexpected ${url}`);
    await pending;
    return {
      ok: true, status: 200, headers: { get: () => "application/json" },
      json: async () => drift(), text: async () => JSON.stringify(drift()),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  const h = await renderComponent(App(record()));
  try {
    await h.settle();
    const field = inputFor(h, "posting_date");
    assert.ok(field, "the control is mounted before the drift lands");
    await h.fireEvent(field!, "change", (n) => setFieldValue(n as Stub, "2026-09-05"));
    await h.settle();
    assert.equal(valueOf(inputFor(h, "posting_date")), "2026-09-05", "the typed value is in the control");

    await h.act(async () => { resolveDrift?.(null); });
    for (let i = 0; i < 6; i++) await h.settle();

    assert.ok(byTestId(h, "work-knowledge-drift-relevant"), "the banner arrived");
    assert.equal(valueOf(inputFor(h, "posting_date")), "2026-09-05",
      "…and the typed answer survived it. A surface that threw away what somebody had typed because a background read came back would be doing the one thing the draft machinery exists to prevent.");
  } finally {
    await h.unmount();
    globalThis.fetch = original;
  }
});

test("wqd.07 a SETTLED question spends no request at all", async () => {
  const s = stubDrift(drift());
  const h = await renderComponent(App(record({ status: "answered" })));
  try {
    for (let i = 0; i < 6; i++) await h.settle();
    assert.equal(s.calls.length, 0, "there is nothing to re-ask, so there is nothing to check");
    assert.equal(byTestId(h, "work-knowledge-drift-relevant"), null);
  } finally {
    await h.unmount();
    s.restore();
  }
});
