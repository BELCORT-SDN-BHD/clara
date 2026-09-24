// #648 (journey A5) — the firm setup checklist's render-state and refusal cells.
//
// WHAT IS REAL HERE. The component tree, `lib/firm-setup/{api,types}.ts`, `lib/doors.ts`'s
// transport and refusal classes, `useAsyncRead`'s reload-after-write, and the draft store. What is
// faked is PostgREST — including the 403 the denied face needs and the CLR06 the stale face needs.
// So these cells prove what the SURFACE does with each outcome; the doors' own floors, CAS and
// idempotency are proven in `packages/db/tests/firm-setup.test.mjs` against a real Postgres under
// real least-privileged roles.
//
// THE MUTANTS THESE CELLS KILL, named so a reviewer can check the instrument rather than the
// result:
//   · a counter frozen to a constant, or computed as a percentage, or summed from the items array
//     instead of read from the envelope (cells 1 and 2 use a fixture where answered ≠ total and
//     where the item states deliberately do NOT add up to the envelope's own numbers);
//   · a CLR06 that renders a toast, navigates away, or clears the typed draft (cell 3);
//   · a denied face that still renders a write control (cell 4);
//   · an optional item that blocks completion (cell 5);
//   · a lost response that offers a NEW request instead of replaying the same one (cell 6).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent, setFieldValue, textOf, type RenderHarness } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { FirmSetupChecklist } from "./firm-setup-checklist";

enableDomInspection();

type Stub = { tagName?: string; childNodes?: Stub[]; getAttribute?: (n: string) => string | null; value?: string };

const MAX_SETTLE_PASSES = 200;
async function settleUntil(h: RenderHarness, condition: () => boolean, label: string): Promise<void> {
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass += 1) {
    if (condition()) return;
    await h.settle();
  }
  if (condition()) return;
  throw new Error(`${label} never arrived within ${MAX_SETTLE_PASSES} settle passes (a bound on WORK, not on the clock)`);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** PostgREST's own refusal shape for a raised CLR: the code in `code`, the DETAIL in `details`. */
function refusal(code: string, message: string, reason: string | null, status = 400): Response {
  return new Response(
    JSON.stringify({ code, message, details: reason === null ? null : JSON.stringify({ reason }), hint: null }),
    { status, headers: { "content-type": "application/json" } },
  );
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

const CALLER = [{
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "22222222-2222-4222-8222-222222222222",
  firm_name: "Rig & Co PLT",
  role: "admin",
  role_rank: 2,
  is_operator: false,
}];
const CALLER_BOOKKEEPER = [{ ...CALLER[0]!, role: "bookkeeper", role_rank: 1 }];

function item(over: Record<string, unknown>) {
  return {
    item_key: "legal_name", kind: "must_ask", group_key: "identity",
    question: "What is the firm's registered legal name?", note: "A catalogue note.",
    required: true, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 10, state: "pending", answer: null, answered_by: null, answered_by_name: null,
    answered_at: null, knowledge_key: null, knowledge_record_id: null,
    ...over,
  };
}

/**
 * THE FIXTURE'S COUNTER AND ITS ITEM STATES DELIBERATELY DISAGREE.
 *
 * Two of the three required items below are `pending`, so anything that DERIVED the counter from
 * the items array would print "1 of 3". The envelope says 2 of 3 — the database's own count over
 * `clara.firm_setup_keys` — and the cell asserts the envelope's number. A component that computes
 * its own progress cannot pass this, and neither can one that freezes it.
 */
const ENVELOPE = {
  plan_id: "33333333-3333-4333-8333-333333333333",
  revision_token: "44444444-4444-4444-8444-444444444444",
  revision_n: 3,
  state: "open",
  committed_at: null,
  seeded: true,
  catalogue_total: 5,
  counter: { required_answered: 2, required_total: 3 },
  items: [
    item({ item_key: "legal_name", state: "pending" }),
    item({ item_key: "address", sort_order: 20, question: "What is the firm's registered address?", answer_shape: "long_text", state: "pending" }),
    item({ item_key: "fye", sort_order: 30, group_key: "tax", question: "Which month is the firm's financial year-end?", answer_shape: "month", state: "pending" }),
    item({
      item_key: "mia", sort_order: 40, question: "What is the firm's MIA registration number?",
      required: false, kind: "capture", state: "pending",
    }),
    item({
      item_key: "currency", sort_order: 50, group_key: "accounting", kind: "capture",
      question: "What is the firm's default currency?", required: false, answer_shape: "choice",
      answer_options: ["MYR", "USD", "SGD"], knowledge_key: "default_currency", state: "pending",
    }),
  ],
  required_outstanding: ["legal_name", "address"],
  confirmed_facts: [],
};

type Call = { url: string; body: unknown };

function mock(handlers: {
  setup?: (call: number) => Response;
  caller?: () => Response;
  answer?: (call: number, body: unknown) => Response;
  commit?: () => Response;
  defer?: () => Response;
  dismiss?: (call: number, body: unknown) => Response;
}, calls: Call[] = []): typeof fetch {
  let setupCalls = 0;
  let answerCalls = 0;
  let dismissCalls = 0;
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: u, body });
    if (u.includes("/rest/v1/caller_context")) return (handlers.caller ?? (() => jsonResponse(CALLER)))();
    if (u.includes("/rest/v1/rpc/get_firm_setup")) {
      setupCalls += 1;
      return (handlers.setup ?? (() => jsonResponse(ENVELOPE)))(setupCalls);
    }
    if (u.includes("/rest/v1/rpc/answer_firm_setup_item")) {
      answerCalls += 1;
      return (handlers.answer ?? (() => jsonResponse({ revision_token: "next-token" })))(answerCalls, body);
    }
    if (u.includes("/rest/v1/rpc/commit_firm_setup")) return (handlers.commit ?? (() => jsonResponse({ state: "committed" })))();
    if (u.includes("/rest/v1/rpc/defer_firm_setup_item")) return (handlers.defer ?? (() => jsonResponse({ item_key: "mia" })))();
    if (u.includes("/rest/v1/rpc/dismiss_firm_setup_tip")) {
      dismissCalls += 1;
      const record = body as Record<string, unknown>;
      return (handlers.dismiss ?? (() => jsonResponse({
        plan_id: ENVELOPE.plan_id, item_key: record.p_item_key,
        state: record.p_action === "deferred" ? "deferred" : "answered", tip_action: record.p_action,
      })))(dismissCalls, body);
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, children: createElement(FirmSetupChecklist),
  });
}

/** Click, then settle once: `clickButton` calls the handler directly and is not act-wrapped, so
 *  the state it sets is not on screen until React has flushed (hookHarness.ts:391). */
async function press(h: RenderHarness, node: Stub | null, label: string): Promise<void> {
  assert.ok(node, `no control to press: ${label}`);
  await clickButton(node as never);
  await h.settle();
}

function byTestId(h: RenderHarness, id: string): Stub | null {
  return h.find((n) => (n as Stub).getAttribute?.("data-testid") === id) as Stub | null;
}

// =============================================================================================

test("fs.web.01 the counter is the DATABASE's required-answered/required-total, never a percentage and never a sum of the item states", async () => {
  await withMockedEnv(mock({}), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");
      const counter = byTestId(h, "firm-setup-counter");
      assert.ok(counter, "no counter rendered");
      assert.equal(textOf(counter as never), "2 of 3 required facts recorded");
      // The items array says ONE required item is settled; the envelope says two. The envelope wins.
      assert.doesNotMatch(h.text(), /1 of 3 required/, "the counter was derived from the items array");
      assert.doesNotMatch(h.text(), /%/, "the counter rendered a percentage");
      // …and the outstanding facts are NAMED, not merely counted.
      const outstanding = byTestId(h, "firm-setup-outstanding");
      assert.ok(outstanding, "the outstanding required facts are not named");
      assert.match(textOf(outstanding as never), /registered legal name/);
      assert.match(textOf(outstanding as never), /registered address/);
    } finally { await h.unmount(); }
  });
});

test("fs.web.02 loading shows a named sentence and NO placeholder count", async () => {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withMockedEnv(mock({
    setup: () => jsonResponse(ENVELOPE),
    caller: () => jsonResponse(CALLER),
  }), async () => {
    // Hold the envelope read open by delaying the very first settle.
    const impl = globalThis.fetch;
    globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
      if (String(u).includes("get_firm_setup")) { await gate; }
      return impl(u, init);
    }) as typeof fetch;
    const h = await renderComponent(App());
    try {
      assert.ok(byTestId(h, "firm-setup-loading"), "no loading face while the envelope is unread");
      assert.match(h.text(), /Loading the firm setup checklist/);
      assert.doesNotMatch(h.text(), /0 of 0/, "a placeholder zero was rendered during loading");
      assert.doesNotMatch(h.text(), /required facts recorded/, "the counter rendered before it was read");
      release?.();
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");
      assert.equal(byTestId(h, "firm-setup-loading"), null);
    } finally { await h.unmount(); }
  });
});

test("fs.web.03 a CLR06 converges INLINE on the re-read plan and KEEPS the typed draft", async () => {
  const calls: Call[] = [];
  // The second read carries the OTHER editor's answer and a new token — the authoritative plan.
  const AFTER = {
    ...ENVELOPE,
    revision_token: "55555555-5555-4555-8555-555555555555",
    counter: { required_answered: 3, required_total: 3 },
    items: ENVELOPE.items.map((i) =>
      i.item_key === "address"
        ? { ...i, state: "answered", answer: "9 Jalan Somebody Else", answered_by_name: "Tan Wei Ming" }
        : i),
  };
  await withMockedEnv(mock({
    setup: (n) => jsonResponse(n === 1 ? ENVELOPE : AFTER),
    answer: () => refusal("CLR06", "stale onboarding plan revision", "stale_plan"),
  }, calls), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");
      await press(h, byTestId(h, "firm-setup-answer-legal_name-action"), "Answer legal_name");
      const input = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      assert.ok(input, "the single-Field form did not mount an input");
      await h.act(() => { setFieldValue(input as never, "Rig & Co PLT"); });
      await press(h, byTestId(h, "firm-setup-submit"), "Save");
      await settleUntil(h, () => byTestId(h, "firm-setup-stale") !== null, "the stale face");

      // INLINE, and never a toast: the banner is inside the mounted form.
      const stale = byTestId(h, "firm-setup-stale");
      assert.ok(stale, "the stale refusal did not converge inline");
      assert.match(textOf(stale as never), /Somebody else changed this checklist/);
      // THE AUTHORITATIVE PLAN WAS RE-READ, and the other editor's answer is on screen.
      assert.match(h.text(), /9 Jalan Somebody Else/, "the plan was not re-read after the convergence");
      // …and the DRAFT SURVIVED: the control still carries what was typed.
      const after = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      assert.ok(after, "the form unmounted on a stale refusal — the draft had nowhere to survive");
      assert.equal(after?.value, "Rig & Co PLT", "the typed draft was discarded by the convergence");
      // Exactly one write was attempted, and a re-read followed it.
      const writes = calls.filter((c) => c.url.includes("answer_firm_setup_item"));
      assert.equal(writes.length, 1, "the surface retried a governed refusal");
      assert.ok(calls.filter((c) => c.url.includes("get_firm_setup")).length >= 2, "no re-read after the refusal");
    } finally { await h.unmount(); }
  });
});

test("fs.web.04 a bookkeeper session renders the denied face with ZERO write controls", async () => {
  await withMockedEnv(mock({
    caller: () => jsonResponse(CALLER_BOOKKEEPER),
    setup: () => refusal("CLR04", "insufficient role", null, 403),
  }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-denied") !== null, "the denied face");
      assert.match(h.text(), /Firm setup is for administrators/);
      // …and it says the rest of the workspace is unaffected, which is AC4's second half in words.
      assert.match(h.text(), /clients, Work and activity are open as usual/);
      const buttons: Stub[] = [];
      const walk = (n: Stub) => {
        if (n.tagName === "BUTTON") buttons.push(n);
        for (const c of n.childNodes ?? []) walk(c);
      };
      walk(h.container as never);
      assert.deepEqual(buttons.map((b) => textOf(b as never)), [], "the denied face rendered a write control");
      assert.equal(byTestId(h, "firm-setup-checklist"), null, "the checklist rendered under a denied read");
    } finally { await h.unmount(); }
  });
});

test("fs.web.05 an optional item is skippable with a stated reason, and the checklist still reaches completion", async () => {
  const calls: Call[] = [];
  const SKIPPED = {
    ...ENVELOPE,
    counter: { required_answered: 3, required_total: 3 },
    required_outstanding: [],
    items: ENVELOPE.items.map((i) =>
      i.item_key === "mia"
        ? { ...i, state: "deferred", answer: { deferred_reason: "The firm is not MIA-registered." } }
        : { ...i, state: i.required ? "answered" : i.state }),
  };
  await withMockedEnv(mock({ setup: (n) => jsonResponse(n === 1 ? ENVELOPE : SKIPPED) }, calls), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");
      // A REQUIRED item offers no skip; an OPTIONAL one does.
      assert.equal(byTestId(h, "firm-setup-skip-legal_name"), null, "a required fact offered a skip control");
      await press(h, byTestId(h, "firm-setup-skip-mia"), "Not now (mia)");
      await settleUntil(h, () => document.body !== undefined && /Skip this fact/.test(bodyText()), "the skip dialog");

      // A REASON IS REQUIRED, and the dialog refuses an empty one before sending anything.
      const confirm = bodyNode((n) => n.getAttribute?.("data-testid") === "firm-setup-skip-confirm");
      assert.ok(confirm, "the skip dialog has no confirm control");
      await press(h, confirm, "the skip confirm");
      assert.equal(calls.filter((c) => c.url.includes("defer_firm_setup_item")).length, 0,
        "an empty reason was sent to the door");
      assert.match(bodyText(), /Say why this is being skipped/);

      const reason = bodyNode((n) => n.getAttribute?.("id") === "firm-setup-skip-reason");
      assert.ok(reason, "the skip dialog has no reason control");
      await h.act(() => { setFieldValue(reason as never, "The firm is not MIA-registered."); });
      await press(h, confirm, "the skip confirm");
      await settleUntil(h, () => /Skipped/.test(h.text()), "the skipped state");

      const sent = calls.find((c) => c.url.includes("defer_firm_setup_item"));
      assert.ok(sent, "the skip never reached the door");
      assert.equal((sent?.body as Record<string, unknown>).p_reason, "The firm is not MIA-registered.");
      // …and the checklist is now complete: the counter is full and Finish is enabled.
      assert.match(h.text(), /3 of 3 required facts recorded/);
      const commit = byTestId(h, "firm-setup-commit");
      assert.ok(commit, "the finish control is absent once everything is settled");
      assert.notEqual((commit as Stub).getAttribute?.("disabled"), "", "the finish control stayed disabled");
    } finally { await h.unmount(); }
  });
});

test("fs.web.06 a lost response RE-READS first, then REPLAYS the byte-identical request — same op key AND the revision it was sent with", async () => {
  const calls: Call[] = [];
  // THE WRITE LANDED; only the acknowledgement was lost. So by the time the surface re-reads, the
  // plan's CAS token HAS rotated — and a retry carrying the RE-READ token would be a different
  // request under the same op key, which `clara._reserve_op` refuses with a bare CLR10
  // "op_key reused with different args" (0004_governed_fns.sql:46-60) even though the answer was
  // accepted. A frozen envelope hides that: this fixture rotates, so the cell can see it.
  const ROTATED = {
    ...ENVELOPE,
    revision_token: "66666666-6666-4666-8666-666666666666",
    revision_n: 4,
  };
  await withMockedEnv(mock({
    setup: (n) => jsonResponse(n === 1 ? ENVELOPE : ROTATED),
    // A transport failure: not a governed refusal, so nothing is known about whether it landed.
    answer: () => { throw new TypeError("network down"); },
  }, calls), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");
      await press(h, byTestId(h, "firm-setup-answer-legal_name-action"), "Answer legal_name");
      const input = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      await h.act(() => { setFieldValue(input as never, "Rig & Co PLT"); });
      const readsBefore = calls.filter((c) => c.url.includes("get_firm_setup")).length;
      await press(h, byTestId(h, "firm-setup-submit"), "Save");
      await settleUntil(h, () => byTestId(h, "firm-setup-failed") !== null, "the failed face");

      assert.match(textOf(byTestId(h, "firm-setup-failed") as never), /re-read/,
        "the failed face does not say the checklist was re-read");
      assert.ok(calls.filter((c) => c.url.includes("get_firm_setup")).length > readsBefore,
        "the current state was not re-read before offering a resubmit");

      // The SAME control, and the SAME request: a second press REPLAYS.
      await press(h, byTestId(h, "firm-setup-submit"), "Save");
      await settleUntil(h, () => calls.filter((c) => c.url.includes("answer_firm_setup_item")).length === 2, "the retry");
      const writes = calls.filter((c) => c.url.includes("answer_firm_setup_item"));
      assert.equal(writes.length, 2);
      const first = writes[0]?.body as Record<string, unknown>;
      const second = writes[1]?.body as Record<string, unknown>;
      assert.equal(first.p_op_key, second.p_op_key,
        "the retry minted a NEW op key — the server would answer twice instead of replaying");
      // …AND the same expected revision. `_reserve_op` hashes the WHOLE argument list, revision
      // included, and short-circuits before the CAS check — so replaying the revision that was
      // actually sent is what makes the receipt replay instead of a CLR10 refusal.
      assert.equal(second.p_expected_revision, first.p_expected_revision,
        "the retry carried the RE-READ revision, so the same op key now names a different request: "
        + "the door answers CLR10 'op_key reused with different args' for a write that was accepted");
      assert.equal(first.p_expected_revision, ENVELOPE.revision_token);
    } finally { await h.unmount(); }
  });
});

test("fs.web.07 a group with more than one pending fact walks a bounded stepper, and one fact alone is a single Field", async () => {
  await withMockedEnv(mock({}), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");
      // The identity group has three pending items (legal_name, address, mia): a bounded walk.
      const walkTrigger = byTestId(h, "firm-setup-answer-group-identity");
      assert.ok(walkTrigger, "a group of three pending facts offered no bounded walk");
      await press(h, walkTrigger, "the bounded walk trigger");
      assert.match(h.text(), /Question 1 of 3/, "the walk did not start at its first question");
      assert.ok(byTestId(h, "firm-setup-next"), "the walk has no Next");
      assert.equal(byTestId(h, "firm-setup-back"), null, "the first step offered Back");

      // A step refuses to advance on an empty required value, with the error BESIDE the control.
      await press(h, byTestId(h, "firm-setup-next"), "Next");
      assert.ok(byTestId(h, "firm-setup-error-legal_name"), "an empty required step advanced");
      assert.match(h.text(), /Question 1 of 3/, "the walk advanced past an invalid step");

      const input = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      await h.act(() => { setFieldValue(input as never, "Rig & Co PLT"); });
      await press(h, byTestId(h, "firm-setup-next"), "Next");
      assert.match(h.text(), /Question 2 of 3/);
      assert.ok(byTestId(h, "firm-setup-back"), "the second step has no Back");

      // The accounting group has ONE pending fact, so it is a Field and never a walk.
      assert.equal(byTestId(h, "firm-setup-answer-group-accounting"), null,
        "a single pending fact was offered as a bounded walk");
    } finally { await h.unmount(); }
  });
});

test("fs.web.08 the not-started face is distinct from completion, and the seed action says accepted facts are kept", async () => {
  // #935 fix round (review L06-SPEC-06) — the catalogue holds a tip, so `catalogue_total` is SIX.
  // The banner counts FACTS, and a tip is not one: "There are {count} facts to state about this
  // firm" must read five. Measured on clara_l06 the real numbers are 15 and 12.
  const NOT_SEEDED = {
    ...ENVELOPE,
    seeded: false,
    catalogue_total: 6,
    counter: { required_answered: 0, required_total: 3 },
    items: [
      ...ENVELOPE.items.map((i) => ({ ...i, state: "unseeded" })),
      item({
        item_key: "tip_invite_colleagues", kind: "education", group_key: "tips", sort_order: 130,
        question: "Invite your colleagues", note: "Settings -> Members sends an invitation.",
        required: false, state: "unseeded", answer_shape: "text",
      }),
    ],
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(NOT_SEEDED) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-not-started") !== null, "the not-started face");
      assert.match(h.text(), /Firm setup has not started/);
      assert.match(h.text(), /There are 5 facts to state about this firm/,
        "the not-started banner counted the education tip as a fact to state");
      assert.equal(byTestId(h, "firm-setup-completed"), null,
        "the not-started face and the completion face are the same box");
      assert.ok(byTestId(h, "firm-setup-seed"), "the not-started face offers no way to start");
      assert.match(h.text(), /kept exactly as it was and is never asked again/);
      // Nothing is answerable before the list exists.
      assert.equal(byTestId(h, "firm-setup-answer-legal_name-action"), null,
        "an unseeded item offered an Answer control");
    } finally { await h.unmount(); }
  });

  const STILL_PENDING_TIP = "tip_invite_colleagues";
  const COMMITTED = { ...ENVELOPE, state: "committed", committed_at: "2026-09-16T02:00:00Z",
    counter: { required_answered: 3, required_total: 3 }, required_outstanding: [],
    items: [
      ...ENVELOPE.items.map((i) => ({ ...i, state: "answered", answer: "recorded" })),
      // #935 — a tip nobody ever dismissed before the checklist was committed. There is no reopen
      // door to answer it through, so it must not appear at all rather than showing dead buttons.
      item({
        item_key: STILL_PENDING_TIP, kind: "education", group_key: "tips", sort_order: 130,
        question: "Invite your colleagues", note: "Settings -> Members sends an invitation.",
        required: false, state: "pending", answer_shape: "text",
      }),
    ] };
  await withMockedEnv(mock({ setup: () => jsonResponse(COMMITTED) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-completed") !== null, "the completion face");
      assert.match(h.text(), /Firm setup is complete/);
      assert.equal(byTestId(h, "firm-setup-commit"), null, "a committed plan still offered Finish");
      assert.equal(byTestId(h, "firm-setup-answer-legal_name-action"), null,
        "a committed plan still offered an Answer control");
      // #935 — a still-pending tip on a COMMITTED plan renders nothing: no title, no Got it, no
      // Later. Every other write control on this surface disappears on commit; a tip is no
      // exception, and there is no reopen door to act on it through once it is stuck here.
      assert.equal(byTestId(h, `firm-setup-tip-${STILL_PENDING_TIP}`), null,
        "a pending tip on a committed plan rendered its title and buttons");
    } finally { await h.unmount(); }
  });
});

test("fs.web.09 a confirmed fact renders scope, source and actor, and says so when its author's rank no longer carries it", async () => {
  const WITH_FACT = {
    ...ENVELOPE,
    items: ENVELOPE.items.map((i) =>
      i.item_key === "currency"
        ? { ...i, state: "answered", answer: "MYR", knowledge_record_id: "rec-1" }
        : i),
    confirmed_facts: [{
      record_id: "rec-1", revision_id: "rev-1", revision_n: 1, scope_kind: "firm",
      knowledge_key: "default_currency", item_key: "currency",
      question: "What is the firm's default currency?", kind: "assertion", value: "MYR",
      applies_when: {}, effective_from: null, effective_to: null,
      source_kind: "user_statement", trust: "asserted",
      basis: "Stated by a firm administrator in firm setup (item currency)",
      asserted_by: "u1", asserted_by_name: "Aisyah Rahman", recorded_via: "human_ui",
      recorded_at: "2026-09-16T02:00:00Z", state: "live", correctable: true,
      key_description: null, authority_bearing: false,
      asserted_by_active: true, asserted_by_role: "bookkeeper", authority_current: false,
      legacy_client_fact_key: false,
    }],
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(WITH_FACT) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-fact-default_currency") !== null, "the confirmed fact");
      assert.match(h.text(), /Firm default/, "the fact does not render its SCOPE");
      assert.match(h.text(), /Stated by a user/, "the fact does not render its SOURCE");
      assert.match(textOf(byTestId(h, "firm-setup-fact-actor-default_currency") as never), /Aisyah Rahman/,
        "the fact does not render its ACTOR");
      const authority = byTestId(h, "firm-setup-fact-authority-default_currency");
      assert.ok(authority, "a downgraded author is invisible on the fact");
      assert.match(textOf(authority as never), /now a bookkeeper/);
      // The correction path exists — without it, `knowledge_already_live` would dead-end.
      assert.ok(byTestId(h, "firm-setup-correct-default_currency"), "no correction path for a live fact");
    } finally { await h.unmount(); }
  });
});

/** Drafts live in this process's `localStorage` and the cells above deliberately leave some
 *  behind. A cell whose subject is what a form PREFILLS has to start from nothing. */
function clearDrafts(): void {
  try { globalThis.localStorage?.clear(); } catch { /* storage unavailable — nothing to clear */ }
}

test("fs.web.10 a settled fact keeps a correction path: a skipped one can be answered, a plan-only one changed, a captured one corrected on the register", async () => {
  clearDrafts();
  const SETTLED = {
    ...ENVELOPE,
    counter: { required_answered: 3, required_total: 3 },
    required_outstanding: [],
    items: ENVELOPE.items.map((i) => {
      if (i.item_key === "mia") {
        return { ...i, state: "deferred", answer: { deferred_reason: "The firm is not MIA-registered." } };
      }
      if (i.item_key === "currency") {
        return { ...i, state: "answered", answer: "MYR", knowledge_record_id: "rec-1" };
      }
      return { ...i, state: "answered", answer: `recorded ${i.item_key}` };
    }),
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(SETTLED) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");

      // A settled fact is no longer ASKED — AC1's "an accepted fact is never re-asked"…
      assert.equal(byTestId(h, "firm-setup-answer-legal_name-action"), null, "a recorded fact was re-asked");
      // …but C48.5 closes on "persisted answers, applicability AND correction path", and a plan
      // item is not on the knowledge register, so the register's Correct control cannot reach it.
      const change = byTestId(h, "firm-setup-change-legal_name-action");
      assert.ok(change, "a recorded plan-only fact has NO correction path anywhere on this surface");

      // A SKIPPED fact can be answered later — which is exactly what the skip dialog promises
      // ("It does not hold up finishing setup, and you can answer it later").
      const unskip = byTestId(h, "firm-setup-change-mia-action");
      assert.ok(unskip, "a skipped fact can never be answered: the skip dialog's promise is false");
      assert.match(textOf(unskip as never), /Answer this now/);

      // A LIVE firm default is corrected on the register instead: a second capture of the same
      // key is refused `knowledge_already_live` by the real door, so offering one would dead-end.
      assert.equal(byTestId(h, "firm-setup-change-currency-action"), null,
        "a live firm default offered a second capture the door refuses");
      const onRegister = byTestId(h, "firm-setup-correct-on-register-currency");
      assert.ok(onRegister, "a captured fact names no path to the register that owns its correction");
      assert.match(textOf(onRegister as never), /Facts confirmed in setup/);

      // …and Change opens the SAME form, prefilled with what was recorded rather than blank.
      await press(h, change, "Change legal_name");
      assert.ok(byTestId(h, "firm-setup-item-form"), "the correction opened no form");
      const input = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      assert.ok(input, "the correction form mounted no control");
      assert.equal(input?.value, "recorded legal_name",
        "the correction form did not prefill the recorded answer");
    } finally { await h.unmount(); }
  });

  // …AND AFTER A WITHDRAWAL the register no longer owns it. `clara.get_firm_setup` joins the item's
  // record on `state = 'live'` (0218_firm_setup.sql:1016-1018), so a withdrawn fact leaves
  // `knowledge_record_id` null — and the facts panel refuses to correct a withdrawn revision. If
  // the checklist still pointed at the panel there would be no path at all; it offers the form.
  const WITHDRAWN = {
    ...SETTLED,
    items: SETTLED.items.map((i) =>
      i.item_key === "currency" ? { ...i, knowledge_record_id: null } : i),
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(WITHDRAWN) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");
      assert.ok(byTestId(h, "firm-setup-change-currency-action"),
        "a withdrawn firm default can be neither corrected on the register nor answered again");
      assert.equal(byTestId(h, "firm-setup-correct-on-register-currency"), null,
        "the row still points at a register row that no longer holds it");
    } finally { await h.unmount(); }
  });
});

test("fs.web.11 every attempt mints its OWN op key, so an answer can be changed and then changed back", async () => {
  clearDrafts();
  const calls: Call[] = [];
  // A STATEFUL fixture, because the subject is a SEQUENCE: answer, correct, revert. A key derived
  // from (verb, plan, item, value) alone repeats on the revert, and `_reserve_op` then refuses it
  // CLR10 "op_key reused with different args" forever — the earlier value can never be restored.
  const recorded: Record<string, unknown> = {};
  let token = ENVELOPE.revision_token;
  let rotations = 0;
  const now = () => ({
    ...ENVELOPE,
    revision_token: token,
    items: ENVELOPE.items.map((i) =>
      Object.hasOwn(recorded, i.item_key)
        ? { ...i, state: "answered", answer: recorded[i.item_key] }
        : i),
  });
  await withMockedEnv(mock({
    setup: () => jsonResponse(now()),
    answer: (_n, body) => {
      const b = body as Record<string, unknown>;
      recorded[b.p_item_key as string] = b.p_answer;
      rotations += 1;
      token = `rotated-${rotations}`;
      return jsonResponse({ plan_id: ENVELOPE.plan_id, revision_token: token, item_key: b.p_item_key });
    },
  }, calls), async () => {
    const h = await renderComponent(App());
    const typeAndSave = async (value: string) => {
      const input = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      assert.ok(input, `no control to type "${value}" into`);
      await h.act(() => { setFieldValue(input as never, value); });
      await press(h, byTestId(h, "firm-setup-submit"), `Save ${value}`);
    };
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");
      await press(h, byTestId(h, "firm-setup-answer-legal_name-action"), "Answer legal_name");
      await typeAndSave("Rig & Co PLT");
      await settleUntil(h, () => byTestId(h, "firm-setup-change-legal_name-action") !== null, "the change control");

      await press(h, byTestId(h, "firm-setup-change-legal_name-action"), "Change legal_name");
      await typeAndSave("Rig & Partners PLT");
      await settleUntil(h, () => /Rig & Partners PLT/.test(h.text()), "the corrected answer");

      // BACK TO THE FIRST VALUE — the case a value-derived op key makes unreachable for good.
      await press(h, byTestId(h, "firm-setup-change-legal_name-action"), "Change legal_name back");
      await typeAndSave("Rig & Co PLT");
      await settleUntil(h,
        () => calls.filter((c) => c.url.includes("answer_firm_setup_item")).length === 3, "the revert");

      const writes = calls.filter((c) => c.url.includes("answer_firm_setup_item"))
        .map((c) => c.body as Record<string, unknown>);
      assert.equal(writes.length, 3);
      assert.equal(new Set(writes.map((w) => w.p_op_key)).size, 3,
        "two attempts shared an op key — the door refuses the second as 'op_key reused with different args'");
      // …and each attempt carries the revision the plan is actually on, not a frozen one.
      assert.deepEqual(writes.map((w) => w.p_expected_revision),
        [ENVELOPE.revision_token, "rotated-1", "rotated-2"]);
    } finally { await h.unmount(); }
  });
});

test("fs.web.12 `_reserve_op`'s bare CLR10 is reported as ALREADY RECORDED, not as a refusal of the typed value", async () => {
  clearDrafts();
  // The one refusal in this journey that carries NO detail (0004_governed_fns.sql:56-58), so the
  // message is the only discriminant. It means the answer WAS recorded under an earlier attempt —
  // rendering it as "the database refused this value" beside the control would be the opposite of
  // what happened.
  await withMockedEnv(mock({
    answer: () => refusal("CLR10", "op_key reused with different args", null),
  }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");
      await press(h, byTestId(h, "firm-setup-answer-legal_name-action"), "Answer legal_name");
      const input = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      await h.act(() => { setFieldValue(input as never, "Rig & Co PLT"); });
      await press(h, byTestId(h, "firm-setup-submit"), "Save");
      await settleUntil(h, () => byTestId(h, "firm-setup-already-recorded") !== null, "the already-recorded face");

      assert.match(textOf(byTestId(h, "firm-setup-already-recorded") as never), /already recorded/);
      assert.equal(byTestId(h, "firm-setup-error-legal_name"), null,
        "a receipt-level refusal was painted as a field error on the typed value");
      assert.doesNotMatch(h.text(), /The database refused this value/);
    } finally { await h.unmount(); }
  });
});

test("fs.web.13 an item never asked (inapplicable or undetermined) is hidden; one answered before it became inapplicable stays visible, marked, with no form", async () => {
  const WITH_APPLICABILITY = {
    ...ENVELOPE,
    items: [
      ...ENVELOPE.items,
      // #891 — never seeded, and never will be while the predicate reads this way: hidden. This IS
      // `mpers_eligibility`'s own real, live shape (entity_type answered, not sdn_bhd) — unchanged
      // by #1032.
      item({
        item_key: "mpers_eligibility", sort_order: 90, group_key: "accounting", kind: "capture",
        question: "Is the firm eligible to apply MPERS?", required: false, state: "unseeded",
        applicability: "inapplicable",
      }),
      // #891 — the dependency it reads is itself unanswered: also hidden, for a different reason.
      // This exercises the GENERIC predicate (`isHiddenByApplicability`), reusing a real catalogue
      // key the way this file's `framework` row below also does (a real key, a fixture-only
      // scenario) — since #1032 (owner's ruling 2026-09-23), `tin` itself is seeded for every firm
      // and its own live applicability never reads `undetermined` any more (only
      // `required`/`optional`; `mpers_eligibility` above is the row that still can).
      item({
        item_key: "tin", sort_order: 70, group_key: "tax", kind: "capture",
        question: "What is the firm's MyInvois TIN?", required: false, state: "unseeded",
        applicability: "undetermined",
      }),
      // #891 — answered while applicable, then its dependency changed: the answer survives, and
      // this surface marks it inapplicable rather than hiding it or offering a form to redo it.
      item({
        item_key: "framework", sort_order: 100, group_key: "accounting", kind: "must_ask",
        question: "On which reporting framework are the firm's financial statements prepared?",
        required: true, state: "answered", answer: { framework_label: "MFRS" }, answer_field: "framework_label",
        answered_by: "u1", answered_by_name: "Aisyah Rahman", answered_at: "2026-09-01T00:00:00Z",
        applicability: "inapplicable",
      }),
    ],
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(WITH_APPLICABILITY) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");

      assert.equal(byTestId(h, "firm-setup-item-mpers_eligibility"), null,
        "an inapplicable, never-answered item was rendered");
      assert.equal(byTestId(h, "firm-setup-item-tin"), null,
        "an undetermined item was rendered before its dependency is even answered");

      const row = byTestId(h, "firm-setup-item-framework");
      assert.ok(row, "an item answered before it became inapplicable was hidden -- its answer would be lost from view");
      assert.ok(byTestId(h, "firm-setup-inapplicable-framework"), "the inapplicable badge did not render");
      assert.equal(textOf(byTestId(h, "firm-setup-inapplicable-framework") as never), "Not applicable");
      assert.equal(textOf(byTestId(h, "firm-setup-answer-framework") as never), "MFRS",
        "the earlier answer must still be shown");
      assert.equal(byTestId(h, "firm-setup-change-framework-action"), null,
        "an inapplicable item still offered a form to change its answer");
      assert.equal(byTestId(h, "firm-setup-answer-framework-action"), null);
      assert.equal(byTestId(h, "firm-setup-skip-framework"), null);
    } finally { await h.unmount(); }
  });
});

test("fs.web.14 an education tip renders a title, a body, Got it and Later with NO answer form, never counts, and disappears once acted on — both actions", async () => {
  const calls: Call[] = [];
  const TIP_A = "tip_invite_colleagues";
  const TIP_B = "tip_knowledge_page";
  const tip = (key: string, question: string, note: string, sort: number) =>
    item({
      item_key: key, kind: "education", group_key: "tips", sort_order: sort,
      question, note, required: false, state: "pending", answer_shape: "text",
    });
  const BOTH_PENDING = {
    ...ENVELOPE,
    items: [
      ...ENVELOPE.items,
      tip(TIP_A, "Invite your colleagues", "Settings -> Members sends an invitation by email.", 130),
      tip(TIP_B, "Where Clara keeps what it knows", "Every client has a Knowledge page.", 140),
    ],
  };
  const AFTER_A = {
    ...BOTH_PENDING,
    items: BOTH_PENDING.items.map((i) =>
      i.item_key === TIP_A ? { ...i, state: "answered", answer: { tip_action: "acknowledged" } } : i),
  };
  const AFTER_BOTH = {
    ...AFTER_A,
    items: AFTER_A.items.map((i) =>
      i.item_key === TIP_B ? { ...i, state: "deferred", answer: { tip_action: "deferred" } } : i),
  };
  await withMockedEnv(mock({
    setup: (n) => jsonResponse(n === 1 ? BOTH_PENDING : n === 2 ? AFTER_A : AFTER_BOTH),
  }, calls), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");

      // A TIP DOES NOT MOVE THE COUNTER — still the fixture's own 2 of 3, unrelated to the tips.
      assert.equal(textOf(byTestId(h, "firm-setup-counter") as never), "2 of 3 required facts recorded");

      const tipRow = byTestId(h, `firm-setup-tip-${TIP_A}`);
      assert.ok(tipRow, "the tip did not render");
      assert.match(textOf(tipRow as never), /Invite your colleagues/);
      assert.match(textOf(tipRow as never), /Settings -> Members/);
      // NO answer form and NO accounting-item controls for a tip.
      assert.equal(byTestId(h, `firm-setup-answer-${TIP_A}-action`), null, "a tip offered an answer control");
      assert.equal(byTestId(h, `firm-setup-skip-${TIP_A}`), null, "a tip offered the accounting skip control");
      // TWO tips sharing one group must NOT trigger the bounded-walk mechanism built for facts.
      assert.equal(byTestId(h, "firm-setup-answer-group-tips"), null,
        "two tips triggered the accounting bounded-walk stepper");

      // "Got it" on the first tip.
      await press(h, byTestId(h, `firm-setup-tip-gotit-${TIP_A}`), "Got it");
      await settleUntil(h, () => byTestId(h, `firm-setup-tip-${TIP_A}`) === null, "tip A's disappearance");
      const sentA = calls.find((c) => c.url.includes("dismiss_firm_setup_tip"));
      assert.ok(sentA, "Got it never reached the door");
      assert.equal((sentA?.body as Record<string, unknown>).p_item_key, TIP_A);
      assert.equal((sentA?.body as Record<string, unknown>).p_action, "acknowledged");
      // The second tip is untouched and still offers both controls.
      assert.ok(byTestId(h, `firm-setup-tip-${TIP_B}`), "the untouched tip disappeared too");

      // "Later" on the second tip.
      await press(h, byTestId(h, `firm-setup-tip-later-${TIP_B}`), "Later");
      await settleUntil(h, () => byTestId(h, `firm-setup-tip-${TIP_B}`) === null, "tip B's disappearance");
      const sentB = calls.filter((c) => c.url.includes("dismiss_firm_setup_tip"))[1];
      assert.ok(sentB, "Later never reached the door");
      assert.equal((sentB?.body as Record<string, unknown>).p_item_key, TIP_B);
      assert.equal((sentB?.body as Record<string, unknown>).p_action, "deferred");

      // Neither dismissal moved the required counter.
      assert.equal(textOf(byTestId(h, "firm-setup-counter") as never), "2 of 3 required facts recorded");

      // #935 fix round (review L06-SPEC-05) — and the CARD goes with the last tip. "Reading or
      // skipping a tip is remembered so it stops appearing" is not satisfied by an empty
      // "A few things worth knowing" box that stays on the page for the life of the firm.
      // `assert.ok(x === null)` rather than `assert.equal(x, null)`: on failure the latter asks
      // node to diff a live DOM node and dies formatting it ("Array buffer allocation failed"),
      // which hides the real reason the cell is red.
      assert.ok(byTestId(h, "firm-setup-group-tips") === null,
        "the tips card stayed on the page with every tip dismissed");
      assert.doesNotMatch(h.text(), /A few things worth knowing/,
        "the empty tips card still prints its heading and purpose");
    } finally { await h.unmount(); }
  });
});

test("fs.web.15 a PENDING item that has become inapplicable is kept out of the bounded group walk, not offered a form inside it", async () => {
  // #891 fix round (review L06-SPEC-01). `isNowInapplicable` guarded only the PER-ITEM control;
  // the group's own pending set counted the row, so a group holding two answerable facts and one
  // now-inapplicable pending row offered "Answer these 3 together" and built a three-step form
  // whose first step asked the question the same screen marks "Not applicable". This fixture
  // exercises the GENERIC predicate with `tin`, a real catalogue key reused for a scenario it can
  // no longer itself reach (see fs.web.13's own note): since #1032 (owner's ruling 2026-09-23),
  // `tin` is seeded for every firm and its applicability never reads `inapplicable` any more.
  // `mpers_eligibility` is the row that CAN still reach this shape on the real doors today: answer
  // entity_type=sdn_bhd, reconcile (mpers_eligibility is seeded pending), then correct entity_type
  // away from sdn_bhd -- measured on clara_l06, `p891.answer.survives`
  // (firm-setup-applicability.test.mjs) proves the applicability flip on a real door; this fixture
  // still uses `tin`'s own group/shape purely so the group holds three items rather than
  // restructuring the shared `ENVELOPE` fixture other cells also read.
  const WITH_PENDING_INAPPLICABLE = {
    ...ENVELOPE,
    items: [
      ...ENVELOPE.items,
      item({
        item_key: "turnover", sort_order: 60, group_key: "tax", kind: "must_ask",
        question: "What is the firm's annual turnover band?", required: true, state: "pending",
        answer_shape: "choice", answer_options: ["<RM1M", "RM1M-5M"], applicability: "applicable",
      }),
      item({
        item_key: "tin", sort_order: 70, group_key: "tax", kind: "capture",
        question: "What is the firm's MyInvois TIN?", required: false, state: "pending",
        applicability: "inapplicable",
      }),
    ],
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(WITH_PENDING_INAPPLICABLE) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");

      // The row itself still renders, marked, with no control of its own (fs.web.13's rule, on a
      // PENDING row rather than an answered one).
      assert.ok(byTestId(h, "firm-setup-item-tin"), "a seeded, pending, inapplicable row was hidden");
      assert.ok(byTestId(h, "firm-setup-inapplicable-tin"), "the inapplicable badge did not render");
      assert.equal(byTestId(h, "firm-setup-answer-tin-action"), null,
        "a pending inapplicable item offered its own answer control");

      // …and the GROUP counts only the two answerable facts.
      const walkTrigger = byTestId(h, "firm-setup-answer-group-tax");
      assert.ok(walkTrigger, "the tax group offered no bounded walk for its two answerable facts");
      assert.equal(textOf(walkTrigger as never), "Answer these 2 together",
        "the bounded walk counted the inapplicable row");

      await press(h, walkTrigger, "the bounded walk trigger");
      assert.match(h.text(), /Question 1 of 2/, "the walk built a step for the inapplicable row");
      // …and the form itself never carries the inapplicable question (the ROW still shows it,
      // marked; the FORM must not ask it).
      const form = byTestId(h, "firm-setup-item-form");
      assert.ok(form, "the bounded walk rendered no form");
      assert.doesNotMatch(textOf(form as never), /MyInvois TIN/,
        "the walk asked the question the same screen marks Not applicable");
    } finally { await h.unmount(); }
  });
});

test("fs.web.16 the Finish sentence and the Finish button always say the same thing: a pending TIP (or a pending optional fact) never claims completion is unavailable", async () => {
  // #935 fix round (review L06-SPEC-04). The sentence was driven by "no item anywhere is still
  // pending" while the button was driven by the envelope's `required_outstanding` — the door's own
  // gate. One pending tip, or one pending optional fact, split the two: the screen read
  // "Finishing becomes available once every required fact is recorded or deliberately skipped."
  // beside a working Finish button. The owner's ruling on #935 is explicit — "a tip never counts
  // toward the required total or blocks completion".
  const SETTLED_BUT_FOR_A_TIP = {
    ...ENVELOPE,
    counter: { required_answered: 3, required_total: 3 },
    required_outstanding: [],
    items: [
      ...ENVELOPE.items.map((i) =>
        i.item_key === "mia" || i.item_key === "currency"
          ? i                                    // still pending, and OPTIONAL: never a gate
          : { ...i, state: "answered", answer: "recorded" }),
      item({
        item_key: "tip_invite_colleagues", kind: "education", group_key: "tips", sort_order: 130,
        question: "Invite your colleagues", note: "Settings -> Members sends an invitation.",
        required: false, state: "pending", answer_shape: "text",
      }),
    ],
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(SETTLED_BUT_FOR_A_TIP) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-commit") !== null, "the Finish section");
      assert.ok(byTestId(h, `firm-setup-tip-tip_invite_colleagues`), "the fixture's tip is not on screen");
      assert.match(h.text(), /Every required fact has been recorded or skipped/,
        "a pending tip suppressed the ready sentence");
      assert.doesNotMatch(h.text(), /Finishing becomes available once/,
        "the screen said finishing was unavailable beside a working Finish button");
      assert.notEqual(byTestId(h, "firm-setup-commit")?.getAttribute?.("disabled"), "",
        "the Finish control was disabled although nothing required is outstanding");
    } finally { await h.unmount(); }
  });

  // …and the sentence still refuses when the DOOR would: one required fact outstanding.
  const ONE_REQUIRED_LEFT = { ...SETTLED_BUT_FOR_A_TIP, required_outstanding: ["legal_name"] };
  await withMockedEnv(mock({ setup: () => jsonResponse(ONE_REQUIRED_LEFT) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-commit") !== null, "the Finish section");
      assert.match(h.text(), /Finishing becomes available once/,
        "an outstanding required fact did not say finishing is unavailable");
      assert.doesNotMatch(h.text(), /Every required fact has been recorded or skipped/);
      assert.equal(byTestId(h, "firm-setup-commit")?.getAttribute?.("disabled"), "",
        "the Finish control was enabled with a required fact outstanding");
    } finally { await h.unmount(); }
  });
});

test("fs.web.17 a half-seeded checklist keeps its Finish section and calls the reconcile control an UPDATE, never 'Start firm setup' again", async () => {
  // #891 fix round (review L06-SPEC-09). `seeded` means "every catalogue row this firm can still
  // be asked has a plan item", and 0257 made a conditional row count as unseeded until its
  // dependency is answered — so `seeded` is FALSE for a brand-new firm from the very first
  // reconcile until both entity_type and turnover are settled. Measured on clara_l06: right after
  // the first `seed_firm_setup_plan`, `seeded` reads false with thirteen rows already on the plan.
  // The surface read that as "not started": it printed the big "Start firm setup" button over a
  // half-answered checklist and hid the whole Finish section.
  const HALF_SEEDED = {
    ...ENVELOPE,
    seeded: false,
    items: [
      ...ENVELOPE.items,
      // `mpers_eligibility`'s own real, reachable shape: entity_type was just answered sdn_bhd, so
      // it reads `applicable` LIVE, but the plan has not been reconciled again yet -- still
      // `unseeded`. (Before #1032 this fixture used `tin` for the same shape; `tin` itself can no
      // longer be `unseeded`+`applicable` -- see fs.web.13's own note -- so this cell now uses the
      // catalogue key that still can.)
      item({
        item_key: "mpers_eligibility", sort_order: 90, group_key: "accounting", kind: "capture",
        question: "Is the firm eligible to apply MPERS?", required: false, state: "unseeded",
        applicability: "applicable",
      }),
    ],
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(HALF_SEEDED) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");

      assert.ok(byTestId(h, "firm-setup-not-started") === null,
        "a checklist with answers on it rendered the not-started face");
      const seedControl = byTestId(h, "firm-setup-seed");
      assert.ok(seedControl, "there is no way to pick up the newly applicable question");
      assert.equal(textOf(seedControl as never), "Update the checklist",
        "a half-answered checklist still offered to 'Start firm setup'");

      // …and finishing does not disappear mid-walk.
      assert.ok(byTestId(h, "firm-setup-commit"), "the Finish section vanished from a started checklist");
      assert.match(h.text(), /Finish setup/);
    } finally { await h.unmount(); }
  });

  // A genuinely untouched plan still says "Start firm setup" — the two labels are not one label.
  const UNTOUCHED = {
    ...ENVELOPE, seeded: false,
    counter: { required_answered: 0, required_total: 3 },
    items: ENVELOPE.items.map((i) => ({ ...i, state: "unseeded" })),
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(UNTOUCHED) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-not-started") !== null, "the not-started face");
      assert.equal(textOf(byTestId(h, "firm-setup-seed") as never), "Start firm setup");
      assert.ok(byTestId(h, "firm-setup-commit") === null,
        "a plan with no items on it offered Finish");
    } finally { await h.unmount(); }
  });
});

// #1032 (owner's ruling 2026-09-23, Option A) — the firm-setup TIN item is always offered; its
// turnover-dependent applicability is now a REQUIRED-or-OPTIONAL marking, never a seeded-or-not
// decision. `item.required` already drives the Required/Optional badge and the skip control
// generically (fs.web.05 proves this for `mia`); these two cells prove it specifically for the
// door's own new shape: an OPTIONAL tin renders with its marking and its accountant sentence, is
// never mistaken for "Not applicable", is offered by the bounded group walk beside a required
// fact (AC4's "the walk's count and step list agree"), and a REQUIRED tin hides its own skip
// control the same way any other required item already does.

const TIN_NOTE = "The firm's MyInvois TIN. Required once the firm's turnover makes MyInvois mandatory (RM1 million or more); optional below that, and you may still record it if the firm has registered for MyInvois voluntarily.";

test("fs.web.18 an optional tin renders its Optional marking AND its accountant sentence, and the bounded group walk still offers it beside a required fact", async () => {
  const OPTIONAL_TIN_ENV = {
    ...ENVELOPE,
    counter: { required_answered: 0, required_total: 1 },
    items: [
      item({
        item_key: "turnover", sort_order: 60, group_key: "tax", kind: "must_ask",
        question: "What is the firm's annual turnover band?", required: true, state: "pending",
        answer_shape: "choice", answer_options: ["<RM1M", "RM1M-5M"], applicability: "applicable",
      }),
      item({
        item_key: "tin", sort_order: 70, group_key: "tax", kind: "capture",
        question: "What is the firm's MyInvois TIN?", note: TIN_NOTE,
        required: false, state: "pending", applicability: "optional",
      }),
    ],
    required_outstanding: ["turnover"],
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(OPTIONAL_TIN_ENV) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");

      // THE ROW: an optional item's own marking reads Optional, never Required or Not applicable.
      const row = byTestId(h, "firm-setup-item-tin");
      assert.ok(row, "the optional tin row did not render");
      assert.match(textOf(row as never), /Optional/, "the optional marking did not render on the row");
      assert.doesNotMatch(textOf(row as never), /Not applicable/,
        "an optional item was marked the way an inapplicable one is");
      assert.equal(byTestId(h, "firm-setup-inapplicable-tin"), null);

      // …AND ITS SENTENCE (AC4's "the optional marking AND its sentence"). The row itself never
      // renders `item.note` -- only the education-tip branch does -- so the accountant sentence
      // reaches the screen through the item form, exactly as it does for the REQUIRED tin in
      // fs.web.19. An OPTIONAL item offers both controls, so the form is opened, read and
      // cancelled before the bounded walk below, which is a different open state.
      assert.ok(byTestId(h, "firm-setup-skip-tin"),
        "an optional, pending tin must still offer the skip control a required one hides");
      await press(h, byTestId(h, "firm-setup-answer-tin-action"), "the answer control");
      const form = byTestId(h, "firm-setup-item-form");
      assert.ok(form, "opening an optional, pending item rendered no form");
      assert.match(textOf(form as never), new RegExp(TIN_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        "the optional tin's form did not render the accountant sentence");
      await press(h, byTestId(h, "firm-setup-cancel"), "the form's cancel control");
      assert.equal(byTestId(h, "firm-setup-item-form"), null, "cancelling left the form open");

      // THE BOUNDED GROUP WALK: two pending facts in one group -- one required (turnover), one
      // optional (tin) -- and BOTH are offered: `isWalkStep` never excludes an item for being
      // optional, only for being settled, a tip, or currently inapplicable. The walk's own count
      // and its step list agree (AC4).
      const walkTrigger = byTestId(h, "firm-setup-answer-group-tax");
      assert.ok(walkTrigger, "the tax group offered no bounded walk for its two pending facts");
      assert.equal(textOf(walkTrigger as never), "Answer these 2 together",
        "the walk's own count excluded the optional pending fact");
      await press(h, walkTrigger, "the bounded walk trigger");
      assert.match(h.text(), /Question 1 of 2/,
        "the walk's step list does not agree with its own count of two pending facts");
    } finally { await h.unmount(); }
  });
});

test("fs.web.19 a REQUIRED tin (turnover makes MyInvois mandatory) hides its own skip control, the same way any other required item already does", async () => {
  const REQUIRED_TIN_ENV = {
    ...ENVELOPE,
    counter: { required_answered: 3, required_total: 4 },
    required_outstanding: ["tin"],
    items: [
      ...ENVELOPE.items.map((i) => ({ ...i, state: i.required ? "answered" : i.state })),
      item({
        item_key: "tin", sort_order: 70, group_key: "tax", kind: "capture",
        question: "What is the firm's MyInvois TIN?", note: TIN_NOTE,
        required: true, state: "pending", applicability: "required",
      }),
    ],
  };
  await withMockedEnv(mock({ setup: () => jsonResponse(REQUIRED_TIN_ENV) }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /required facts recorded/.test(h.text()), "the envelope");

      const row = byTestId(h, "firm-setup-item-tin");
      assert.ok(row, "the required tin row did not render");
      assert.match(textOf(row as never), /Required/);
      assert.equal(byTestId(h, "firm-setup-skip-tin"), null,
        "a required tin offered the skip control a required item must never offer");
      assert.ok(byTestId(h, "firm-setup-answer-tin-action"), "a required, pending tin offered no way to answer it");

      // Opening the form shows the accountant sentence and no Optional label.
      await press(h, byTestId(h, "firm-setup-answer-tin-action"), "the answer control");
      const form = byTestId(h, "firm-setup-item-form");
      assert.ok(form, "opening a required, pending item rendered no form");
      assert.match(textOf(form as never), new RegExp(TIN_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        "the form did not render the accountant sentence");
      assert.doesNotMatch(textOf(form as never), /Optional/, "a required item's form said Optional");
    } finally { await h.unmount(); }
  });
});

// ---------------------------------------------------------------------------------------------
// Base UI portals dialog content onto `document.body`, not into the mount container — the house's
// first dialog law (`onboarding-checklist.test.tsx`'s own `dialogNode`).
// ---------------------------------------------------------------------------------------------
function bodyText(): string {
  return textOf(document.body as never);
}
function bodyNode(predicate: (n: Stub) => boolean): Stub | null {
  const walk = (n: Stub): Stub | null => {
    if (predicate(n)) return n;
    for (const c of n.childNodes ?? []) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(document.body as never);
}
