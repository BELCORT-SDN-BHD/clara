// #939 — THE TERM'S PROVENANCE ON SCREEN, AND THE ONE ACT THAT CREATES IT.
//
// A prepayment posted with no document can now be amortised from a period a named person states.
// Everything about the resulting schedule behaves like a document-backed one, so the ONLY thing a
// surface must add is the provenance — and it must add it loudly enough that a reader never
// mistakes "a person said so" for "the invoice says so".
//
// THE CLAIMS THIS FILE EXISTS FOR:
//
//   1. THE LIST MARKS A HUMAN-STATED SCHEDULE AND FILTERS ON IT. A word, never a colour, and a
//      filter over what the read already carries — never a second read.
//   2. THE DETAIL SHOWS WHO STATED THE TERM, WHEN AND WHY, and does NOT offer "open the document"
//      for a schedule that has none. A link to `?document=null` is worse than no link.
//   3. ARM B NAMES THE RIGHT NEXT ACT. `state_service_period` is not
//      `record_document_service_period`: the first leads into the form, the second to a document.
//      The read answers which, and the band must not guess from the absence of a document id.
//   4. THE FORM OFFERS MEMO-ONLY RECOGNITIONS WITH MATCHING COPY, and carries the act that makes
//      one schedulable — the two dates and the reason, posted to
//      `clara.record_prepayment_stated_term`, with the source re-read afterwards rather than
//      painted (hydrate-never-trust).
//
// Every cell drives the real component against a mocked `fetch`, exactly as
// `prepayments-render-states.test.tsx` does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { PrepaymentsList } from "./prepayments-list";
import { PrepaymentDetail } from "./prepayment-detail";
import { PrepaymentForm } from "./prepayment-form";

enableDomInspection();

const CLIENT = "11111111-2222-4333-8444-555555555555";
const SCHEDULE = "44444444-5555-4666-8777-888888888888";
const STATED_SCHEDULE = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const PLAN = "22222222-3333-4444-8555-666666666666";
const ENTRY = "55555555-6666-4777-8888-999999999999";
const MEMO_ENTRY = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";
const DOC = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const STATED_TERM = "88888888-9999-4aaa-8bbb-cccccccccccc";
const WORK = "33333333-4444-4555-8666-777777777777";

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

/** The form calls `useRouter`, so every cell mounts inside a router context. A stub rather than a
 *  real router: nothing here asserts on navigation, and a component that threw on mount would fail
 *  for a reason that has nothing to do with the term's provenance. */
const ROUTER = {
  replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {},
  prefetch: () => {},
};

function app(node: React.ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      { value: ROUTER as never },
      createElement("div", null, createElement("h1", null, "Prepayments"), node),
    ),
  });
}

type Node = { tagName?: string; childNodes?: Node[]; getAttribute?: (k: string) => string | null };

function findAllIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

const byTestId = (root: Node, id: string) =>
  findAllIn(root, (n) => n.getAttribute?.("data-testid") === id);

function byId(root: Node, id: string): Node {
  const found = findAllIn(root, (n) => n.getAttribute?.("id") === id)[0];
  assert.ok(found, `no control with id ${id}`);
  return found;
}

/** Every call this cell's subject makes, in order, so a cell can assert that a write really
 *  happened AND that the read ran again afterwards rather than the screen being painted. */
type Call = { url: string; body: unknown };

function recordingRouter(answers: Record<string, unknown | ((body: unknown) => unknown)>, calls: Call[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const raw = typeof init?.body === "string" ? init.body : null;
    const body = raw === null ? null : JSON.parse(raw);
    calls.push({ url, body });
    for (const [verb, answer] of Object.entries(answers)) {
      if (url.includes(`/rpc/${verb}`)) {
        return jsonResponse(typeof answer === "function" ? (answer as (b: unknown) => unknown)(body) : answer);
      }
    }
    if (url.includes("/rest/v1/coa_accounts")) {
      return jsonResponse([
        { account_code: "59000001", name: "Subscriptions", account_type: "expense", is_active: true },
      ]);
    }
    if (url.includes("/rpc/list_accounting_work")) {
      return jsonResponse({ rows: [], next_cursor: null, truncated: false });
    }
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
}

const rpcRouter = (answers: Record<string, unknown>) => recordingRouter(answers, []);

const DOC_ROW = {
  schedule_id: SCHEDULE, plan_id: PLAN, purpose: "Documented subscription", status: "active",
  source_entry_id: ENTRY, document_id: DOC,
  term_start: "2026-01-01", term_end: "2026-12-31",
  term_source: "document_service_period", stated_term_id: null,
  term_stated_by: null, term_stated_at: null, term_reason: null,
  term_live: true, term_superseded_by: null, term_moved: false,
  term_current_start: "2026-01-01", term_current_end: "2026-12-31",
  prepaid_account_code: "19000001", expense_account_code: "59000001",
  total_cents: 100000, period_count: 12, basis_kind: "human_stated",
  created_at: "2026-01-15T00:00:00Z", effective_from: "2026-01-31", effective_to: "2026-12-31",
  posted_periods: 3, occurrence_count: 4, next_due: "2026-05-31",
};

const STATED_ROW = {
  ...DOC_ROW,
  schedule_id: STATED_SCHEDULE, purpose: "Memo-only insurance",
  source_entry_id: MEMO_ENTRY, document_id: null,
  term_source: "human_stated", stated_term_id: STATED_TERM,
  term_stated_by: "u1", term_stated_at: "2026-02-01T00:00:00Z",
  term_reason: "the client confirmed twelve months of cover on the telephone",
  created_at: "2026-02-01T00:00:00Z",
};

const UNSCHEDULED_MEMO = {
  arm: "unscheduled", entry_id: MEMO_ENTRY, posting_date: "2026-02-14",
  memo: "prepaid insurance, no invoice", document_id: null,
  prepaid_account_code: "19000001", amount_cents: 240000,
  term_carrier: "human_stated", has_live_term: false, next_step: "state_service_period",
};

const UNSCHEDULED_DOC = {
  arm: "unscheduled", entry_id: ENTRY, posting_date: "2026-02-14",
  memo: "prepaid subscription", document_id: DOC,
  prepaid_account_code: "19000001", amount_cents: 120000,
  term_carrier: "document_service_period", has_live_term: false,
  next_step: "record_document_service_period",
};

const STATED_DETAIL = {
  schedule_id: STATED_SCHEDULE, client_id: CLIENT, plan_id: PLAN, revision: 1,
  kind: "amortisation_schedule", status: "active", purpose: "Memo-only insurance",
  source_entry_id: MEMO_ENTRY, source_posting_date: "2026-02-14",
  source_memo: "prepaid insurance, no invoice", source_status: "approved",
  document_id: null, service_period_id: null,
  term_source: "human_stated", stated_term_id: STATED_TERM,
  term_stated_by: "u1", term_stated_at: "2026-02-01T00:00:00Z",
  term_reason: "the client confirmed twelve months of cover on the telephone",
  term_live: true, term_superseded_by: null, term_moved: false,
  term_current_start: "2026-03-01", term_current_end: "2026-05-31",
  term_start: "2026-03-01", term_end: "2026-05-31", basis_kind: "human_stated",
  prepaid_account_code: "19000001", expense_account_code: "59000001",
  expense_account_basis: "insurance premiums are charged to insurance",
  total_cents: 100000, period_count: 3, remainder_placement: "final_period",
  schedule_version: "v2", created_by: "u1", created_at: "2026-02-01T00:00:00Z",
  authority_kind: "explicit_instruction", authority_ref: { kind: "accounting_work", id: WORK },
  authorised_by: "u1", authorised_at: "2026-02-01T00:00:00Z", authority_from: "2026-03-31",
  covered_through: null,
  paused_at: null, paused_by: null, paused_reason: null,
  ended_at: null, ended_by: null, ended_reason: null,
  live_revision: {
    revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-03-31", effective_to: "2026-05-31",
    basis: {}, basis_digest: "a".repeat(64),
  },
  periods: [], occurrences: [], configuration_only: true,
};

async function drive(
  node: React.ReactElement,
  run: (h: { text: () => string; container: Node; settle: () => Promise<void> }) => void | Promise<void>,
) {
  const h = await renderComponent(app(node));
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    await run(h as unknown as { text: () => string; container: Node; settle: () => Promise<void> });
  } finally {
    await h.unmount();
    for (let i = 0; i < 3; i++) await h.settle();
  }
}

// ===========================================================================================
// 1 · The list: a marker and a filter.
// ===========================================================================================

test("prepayments.list.term_source — a schedule whose term a person stated carries its own WORD on the row, and the filter narrows to one lane or the other over the read the list already has", async () => {
  await withMockedEnv(rpcRouter({
    list_prepayment_schedules: { client_id: CLIENT, schedules: [STATED_ROW, DOC_ROW] },
    list_prepayment_attention: { client_id: CLIENT, refusing: [], unscheduled: [] },
  }), async () => {
    await drive(createElement(PrepaymentsList, { clientId: CLIENT }), async (h) => {
      assert.equal(byTestId(h.container, "prepayment-row-term-stated").length, 1,
        "exactly the human-stated row is marked — COLOUR IS NEVER THE ONLY CUE, so it is a word");
      assert.match(h.text(), /Memo-only insurance/);
      assert.match(h.text(), /Documented subscription/);

      // THE FILTER IS OVER WHAT THE READ ALREADY CARRIES. A second read would be a second answer
      // to one question, and this list already holds both rows.
      const filter = byId(h.container, "prepayment-term-source-filter");
      setFieldValue(filter as never, "human_stated");
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Memo-only insurance/);
      assert.doesNotMatch(h.text(), /Documented subscription/,
        "the document lane is filtered out");

      setFieldValue(filter as never, "document_service_period");
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Documented subscription/);
      assert.doesNotMatch(h.text(), /Memo-only insurance/);

      setFieldValue(filter as never, "");
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Memo-only insurance/);
      assert.match(h.text(), /Documented subscription/);
    });
  });
});

// ===========================================================================================
// 2 · The detail: who, when, why — and no link to a document that does not exist.
// ===========================================================================================

test("prepayments.detail.term_source — a human-stated schedule names the person who stated the term, when and WHY, and offers no 'open the document' link at all", async () => {
  await withMockedEnv(rpcRouter({
    get_prepayment_schedule: STATED_DETAIL,
  }), async () => {
    await drive(
      createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: STATED_SCHEDULE }),
      (h) => {
        assert.equal(byTestId(h.container, "prepayment-term-stated").length, 1,
          "the stated-term provenance block renders");
        const text = h.text();
        assert.match(text, /A person's statement/, "the term source is named in words");
        assert.match(text, /the client confirmed twelve months of cover on the telephone/,
          "…with the stated REASON verbatim — it is the one thing on this screen a person wrote");
        assert.match(text, /2026-02-01/, "…and when they stated it");
        assert.doesNotMatch(text, /Open the document/,
          "a schedule with no document must not offer a link to one");
      },
    );
  });
});

test("prepayments.detail.term_source — a document-backed schedule is unchanged: it names the document's own service period as the source and still links to the document", async () => {
  await withMockedEnv(rpcRouter({
    get_prepayment_schedule: {
      ...STATED_DETAIL,
      schedule_id: SCHEDULE, purpose: "Documented subscription",
      source_entry_id: ENTRY, document_id: DOC, service_period_id: "sp-1",
      term_source: "document_service_period", stated_term_id: null,
      term_stated_by: null, term_stated_at: null, term_reason: null,
      schedule_version: "v1",
    },
  }), async () => {
    await drive(
      createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }),
      (h) => {
        assert.equal(byTestId(h.container, "prepayment-term-stated").length, 0,
          "there is no person's statement to show");
        assert.match(h.text(), /The document's own service period/);
        assert.match(h.text(), /Open the document/);
      },
    );
  });
});

// ===========================================================================================
// 3 · Arm B: the right next act, from the read's own token.
// ===========================================================================================

test("prepayments.attention.state_term — a memo-only candidate says a PERSON states the period and leads into the form; a document-bound one with no term still leads to the document", async () => {
  await withMockedEnv(rpcRouter({
    list_prepayment_schedules: { client_id: CLIENT, schedules: [] },
    list_prepayment_attention: {
      client_id: CLIENT, refusing: [], unscheduled: [UNSCHEDULED_MEMO, UNSCHEDULED_DOC],
    },
  }), async () => {
    await drive(createElement(PrepaymentsList, { clientId: CLIENT }), (h) => {
      const rows = byTestId(h.container, "prepayment-attention-unscheduled");
      assert.equal(rows.length, 2, "both candidates are listed");
      const text = h.text();
      assert.match(text, /binds no document/,
        "the memo-only row says why there is no term yet, in this lane's own words");
      assert.match(text, /State the service period/,
        "…and names the act that makes it schedulable");
      assert.match(text, /Open the document/,
        "the document-bound candidate's next act is still its document");
    });
  });
});

// ===========================================================================================
// 4 · The form: the memo-only option, its copy, and the act that creates the term.
// ===========================================================================================

test("prepayments.form.state_term — the source dropdown offers a memo-only recognition and says it carries no document; choosing it opens the two-date statement, which posts to clara.record_prepayment_stated_term and RE-READS rather than painting", async () => {
  const calls: Call[] = [];
  let termStated = false;
  const attention = () => ({
    client_id: CLIENT, refusing: [],
    unscheduled: [{ ...UNSCHEDULED_MEMO, has_live_term: termStated,
      next_step: termStated ? "configure_schedule" : "state_service_period" }],
  });
  await withMockedEnv(recordingRouter({
    list_prepayment_attention: () => attention(),
    record_prepayment_stated_term: () => {
      termStated = true;
      return {
        stated_term_id: STATED_TERM, client_id: CLIENT, source_entry_id: MEMO_ENTRY,
        period_start: "2026-03-01", period_end: "2026-05-31",
        reason: "the client confirmed three months of cover", stated_by: "u1",
        superseded_id: null,
      };
    },
  }, calls), async () => {
    await drive(createElement(PrepaymentForm, { clientId: CLIENT, entryId: MEMO_ENTRY }), async (h) => {
      const text = h.text();
      assert.match(text, /no document/,
        "the option says the recognition carries no document, so a reader knows why the term is asked for");
      assert.match(text, /A person states the service period/,
        "…and the copy names the act rather than pointing at a document that does not exist");

      // THE STATEMENT ITSELF. Two dates and a reason — the same trio the database refuses without.
      setFieldValue(byId(h.container, "prepayment-stated-term-start") as never, "2026-03-01");
      setFieldValue(byId(h.container, "prepayment-stated-term-end") as never, "2026-05-31");
      setFieldValue(byId(h.container, "prepayment-stated-term-reason") as never,
        "the client confirmed three months of cover");
      for (let i = 0; i < 3; i++) await h.settle();
      await clickButton(byId(h.container, "prepayment-stated-term-submit") as never);
      for (let i = 0; i < 8; i++) await h.settle();

      const write = calls.filter((c) => c.url.includes("/rpc/record_prepayment_stated_term"));
      assert.equal(write.length, 1, "exactly one write, under one op key");
      const stated = write[0];
      assert.ok(stated);
      const sent = stated.body as Record<string, unknown>;
      assert.equal(sent.p_client, CLIENT);
      assert.equal(sent.p_source_entry, MEMO_ENTRY);
      assert.equal(sent.p_period_start, "2026-03-01");
      assert.equal(sent.p_period_end, "2026-05-31");
      assert.equal(sent.p_reason, "the client confirmed three months of cover");
      assert.ok(typeof sent.p_op_key === "string" && (sent.p_op_key as string).length > 0,
        "…and it carries its own idempotency key");

      // HYDRATE-NEVER-TRUST: the attention read runs AGAIN after the write, and the screen is what
      // the database answered rather than what the form hoped.
      const attentionCalls = calls.filter((c) => c.url.includes("/rpc/list_prepayment_attention"));
      const writeAt = calls.indexOf(stated);
      assert.ok(attentionCalls.some((c) => calls.indexOf(c) > writeAt),
        "the source read is re-run after the statement lands");
      assert.doesNotMatch(h.text(), /A person states the service period/,
        "…and the prompt is gone because the term now stands, not because the form said so");
    });
  });
});
