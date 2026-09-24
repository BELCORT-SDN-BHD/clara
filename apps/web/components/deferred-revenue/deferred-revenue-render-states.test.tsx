// #941 — THE DEFERRED-REVENUE SURFACES' STATE LADDER, AND THE TWO ARMS RENDERED DISTINCTLY.
//
// Appendix C §3 asks every surface to tell apart: meaningful loading, a successful EMPTY, a
// refusal, and a read failure — and never to render an empty state over a read that did not
// succeed. These cells drive `DeferredRevenueList` and `DeferredRevenueDetail` against a mocked
// `fetch` and assert each rung by the words on screen.
//
// THE CLAIMS THIS FILE EXISTS FOR, beyond the ladder:
//
//   1. THE THREE PERSISTENT STATEMENTS ARE ON FIRST PAINT. The no-invoice boundary, the
//      configuration-is-not-a-posting boundary AND this lane's own tax boundary — all before any
//      read resolves, none a toast. The tax one is the sentence an accountant needs WHILE they
//      decide, and it is the one this lane adds to the prepayment pair.
//   2. BOTH ATTENTION ARMS RENDER, AND DIFFERENTLY. Arm A ("the last period did not post") and
//      arm B ("received, not yet recognised") are two different residues with two different next
//      acts, and a band that rendered them alike would send a person to the wrong door.
//   3. THE NEXT ACT IS THE READ'S OWN TOKEN. A memo-only receipt offers "state the service period"
//      and a document-bound one offers the document — never inferred from the absence of a
//      document id, which a web build ahead of its database would get wrong for every row.
//   4. "POSTED" MEANS A COMMITTED RECEIPT. The list's progress column and the allocation table's
//      period states both distinguish a posted period from an admitted one.
//   5. THE CORRECTED-TERM BANNER IS KEYED ON `term_moved === true`. An ABSENT field must paint
//      nothing: a truthiness test would put the warning on every schedule in the firm.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { DeferredRevenueList } from "./deferred-revenue-list";
import { DeferredRevenueDetail } from "./deferred-revenue-detail";

enableDomInspection();

const CLIENT = "11111111-2222-4333-8444-555555555555";
const SCHEDULE = "44444444-5555-4666-8777-888888888888";
const PLAN = "22222222-3333-4444-8555-666666666666";
const ENTRY = "55555555-6666-4777-8888-999999999999";
const ENTRY2 = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";
const DOC = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const WORK = "33333333-4444-4555-8666-777777777777";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
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

function app(node: React.ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      "div", null, createElement("h1", null, "Deferred revenue"), node),
  });
}

/** A `fetch` that answers each RPC verb from a table, and 404s anything else LOUDLY — an
 *  unanswered call that silently resolved to `{}` would let a cell pass for the wrong reason. */
function rpcRouter(answers: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    for (const [verb, body] of Object.entries(answers)) {
      if (url.includes(`/rpc/${verb}`)) return jsonResponse(body);
    }
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([]);
    if (url.includes("/rest/v1/prepayment_account_enrolments")) return jsonResponse([]);
    if (url.includes("/rpc/list_accounting_work")) {
      return jsonResponse({ rows: [], next_cursor: null, truncated: false });
    }
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
}

type Node = {
  tagName?: string; childNodes?: Node[]; getAttribute?: (k: string) => string | null;
};

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

const SCHEDULE_ROW = {
  schedule_id: SCHEDULE,
  plan_id: PLAN,
  purpose: "Annual membership recognition",
  status: "active",
  source_entry_id: ENTRY,
  document_id: null,
  term_start: "2026-01-01",
  term_end: "2026-12-31",
  term_source: "human_stated",
  stated_term_id: "st-1",
  term_stated_by: "user-1",
  term_stated_at: "2026-01-15T00:00:00Z",
  term_reason: "the member paid twelve months up front",
  term_live: true,
  term_superseded_by: null,
  term_moved: false,
  term_current_start: "2026-01-01",
  term_current_end: "2026-12-31",
  deferred_account_code: "2030",
  revenue_account_code: "4500",
  recognition_pattern: "straight_line",
  total_cents: 1200007,
  period_count: 12,
  basis_kind: "human_stated",
  created_at: "2026-01-15T00:00:00Z",
  effective_from: "2026-01-31",
  effective_to: "2026-12-31",
  posted_periods: 3,
  occurrence_count: 4,
  next_due: "2026-05-31",
};

const REFUSING = {
  arm: "refusing",
  schedule_id: SCHEDULE,
  plan_id: PLAN,
  purpose: "Annual membership recognition",
  status: "active",
  occurrence_id: "occ-1",
  due_date: "2026-04-30",
  period_key: "2026-04-01",
  attempt: 1,
  work_id: WORK,
  stage: "posting",
  code: "CLR19",
  reason: "write_into_closed_period",
  message: "that period is closed",
  work_status: "refused",
  catch_up_from: "2026-04-30",
  catch_up_to: "2026-04-30",
};

/** A MEMO-ONLY receipt whose term nobody has stated: the read's own `next_step` says the act is a
 *  STATEMENT, and the band must offer that rather than a document that does not exist. */
const UNRECOGNISED_STATED = {
  arm: "unrecognised",
  entry_id: ENTRY,
  posting_date: "2026-02-14",
  memo: "annual membership received",
  document_id: null,
  deferred_account_code: "2030",
  amount_cents: 1200007,
  term_carrier: "human_stated",
  has_live_term: false,
  next_step: "state_service_period",
};

/** A DOCUMENT-BOUND receipt whose invoice states no service period: the act is on the document. */
const UNRECOGNISED_DOCUMENT = {
  arm: "unrecognised",
  entry_id: ENTRY2,
  posting_date: "2026-03-01",
  memo: "rent received in advance",
  document_id: DOC,
  deferred_account_code: "2030",
  amount_cents: 600000,
  term_carrier: "document_service_period",
  has_live_term: false,
  next_step: "record_document_service_period",
};

const period = (end: string, amount: number, occurrence: unknown) => ({
  period_start: `${end.slice(0, 7)}-01`,
  period_end: end,
  amount_cents: amount,
  debit_cents: amount,
  credit_cents: 0,
  account_code: "2030",
  deferred_account_code: "2030",
  revenue_account_code: "4500",
  occurrence,
});

const postedOcc = (due: string) => ({
  occurrence_id: `occ-${due}`, due_date: due, leg: "primary", period_key: `${due.slice(0, 7)}-01`,
  attempt: 1, revision: 1, intent_key: `plan:${PLAN}:r1:${due}`, work_id: WORK,
  admitted_at: "2026-01-31T00:00:00Z", outcome: { state: "admitted" },
  created_at: "2026-01-31T00:00:00Z",
  attempts: [], work_status: "completed", work_error: null, receipt_id: "rc-1", entry_id: "je-1",
});

const refusedOcc = (due: string) => ({
  occurrence_id: `occ-${due}`, due_date: due, leg: "primary", period_key: `${due.slice(0, 7)}-01`,
  attempt: 1, revision: 1, intent_key: `plan:${PLAN}:r1:${due}`, work_id: null,
  admitted_at: null,
  outcome: {
    state: "refused", code: "CLR04", reason: "actor_not_active",
    message: "the authorising human is no longer an active member",
  },
  created_at: "2026-04-30T00:00:00Z", attempts: [], work_status: null, work_error: null,
  receipt_id: null, entry_id: null,
});

const DETAIL = {
  schedule_id: SCHEDULE,
  client_id: CLIENT,
  plan_id: PLAN,
  revision: 1,
  kind: "revenue_recognition_schedule",
  status: "active",
  purpose: "Annual membership recognition",
  source_entry_id: ENTRY,
  source_posting_date: "2026-01-15",
  source_memo: "annual membership received",
  source_status: "approved",
  document_id: null,
  service_period_id: null,
  term_source: "human_stated",
  stated_term_id: "st-1",
  term_stated_by: "user-1",
  term_stated_at: "2026-01-15T00:00:00Z",
  term_reason: "the member paid twelve months up front",
  term_live: true,
  term_superseded_by: null,
  term_moved: false,
  term_current_start: "2026-01-01",
  term_current_end: "2026-12-31",
  term_start: "2026-01-01",
  term_end: "2026-12-31",
  basis_kind: "human_stated",
  deferred_account_code: "2030",
  revenue_account_code: "4500",
  revenue_account_basis: "the membership agreement runs twelve months from 1 January",
  total_cents: 300000,
  period_count: 3,
  remainder_placement: "final_period",
  recognition_pattern: "straight_line",
  schedule_version: "v2",
  created_by: "user-1",
  created_at: "2026-01-15T00:00:00Z",
  authority_kind: "explicit_instruction",
  authority_ref: { kind: "accounting_work", id: WORK },
  authorised_by: "user-1",
  authorised_at: "2026-01-15T00:00:00Z",
  authority_from: "2026-01-31",
  covered_through: "2026-02-28",
  paused_at: null, paused_by: null, paused_reason: null,
  ended_at: null, ended_by: null, ended_reason: null,
  live_revision: {
    revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-01-31", effective_to: "2026-03-31",
    basis: {}, basis_digest: "d",
  },
  periods: [
    period("2026-01-31", 100000, postedOcc("2026-01-31")),
    period("2026-02-28", 100000, postedOcc("2026-02-28")),
    period("2026-03-31", 100000, refusedOcc("2026-03-31")),
  ],
  occurrences: [postedOcc("2026-01-31"), postedOcc("2026-02-28"), refusedOcc("2026-03-31")],
  configuration_only: true,
};

const EMPTY_ATTENTION = {
  client_id: CLIENT, refusing: [], unrecognised: [],
  refusing_truncated: false, unrecognised_truncated: false, cap: 50, attention: [],
};

// ---------------------------------------------------------------------------

test("941.list: the three persistent statements paint before any read resolves, and none of them is a toast", async () => {
  // A fetch that NEVER resolves: the surface is caught mid-load, which is the only way to prove a
  // statement is on FIRST PAINT rather than after the data lands.
  await withMockedEnv((() => new Promise(() => {})) as typeof fetch, async () => {
    const h = await renderComponent(
      app(createElement(DeferredRevenueList, { clientId: CLIENT })));
    try {
      await h.settle();
      const text = h.text();
      assert.ok(text.includes(messages.DeferredRevenue.boundaryTitle),
        "the no-invoice boundary is on screen while the read is still in flight");
      assert.ok(text.includes(messages.DeferredRevenue.configurationTitle),
        "…and the configuration boundary");
      assert.ok(text.includes(messages.DeferredRevenue.taxTitle),
        "…and this lane's own tax boundary, which is the one it adds to the prepayment pair");
    } finally {
      await h.unmount();
    }
  });
});

test("941.list: a successful EMPTY says nothing is waiting and nothing is being recognised — it is not painted over a failed read", async () => {
  await withMockedEnv(rpcRouter({
    list_revenue_recognition_schedules: { client_id: CLIENT, schedules: [] },
    list_revenue_recognition_attention: EMPTY_ATTENTION,
  }), async () => {
    const h = await renderComponent(
      app(createElement(DeferredRevenueList, { clientId: CLIENT })));
    try {
      await h.settle();
      const text = h.text();
      assert.ok(text.includes(messages.DeferredRevenue.attentionEmpty));
      assert.ok(text.includes(messages.DeferredRevenue.empty));
    } finally {
      await h.unmount();
    }
  });
});

test("941.list: both attention arms render with their own testid, and the next act is the READ's own token — a memo-only receipt is offered the statement and a document-bound one the document", async () => {
  await withMockedEnv(rpcRouter({
    list_revenue_recognition_schedules: { client_id: CLIENT, schedules: [] },
    list_revenue_recognition_attention: {
      ...EMPTY_ATTENTION,
      refusing: [REFUSING],
      unrecognised: [UNRECOGNISED_STATED, UNRECOGNISED_DOCUMENT],
    },
  }), async () => {
    const h = await renderComponent(
      app(createElement(DeferredRevenueList, { clientId: CLIENT })));
    try {
      await h.settle();
      const root = h.container as unknown as Node;
      assert.equal(byTestId(root, "deferred-revenue-attention-refusing").length, 1,
        "arm A renders once, with its own testid");
      assert.equal(byTestId(root, "deferred-revenue-attention-unrecognised").length, 2,
        "arm B renders both rows, distinctly from arm A");

      const text = h.text();
      // ARM A carries the DATABASE's own typed reason verbatim.
      assert.ok(text.includes("write_into_closed_period"),
        "the refusal this build has not enumerated is still legible, in the database's own word");
      assert.ok(text.includes(messages.DeferredRevenue.attentionOpenSchedule));
      // ARM B's two acts are DIFFERENT, and each row says which.
      assert.ok(text.includes(messages.DeferredRevenue.attentionNeedsStatedTerm),
        "the memo-only receipt is told a person states the period");
      assert.ok(text.includes(messages.DeferredRevenue.attentionStateTerm));
      assert.ok(text.includes(messages.DeferredRevenue.attentionNeedsTerm),
        "…and the document-bound one is told the invoice states it");
      assert.ok(text.includes(messages.DeferredRevenue.attentionOpenDocument));
    } finally {
      await h.unmount();
    }
  });
});

test("941.list: the row carries the term-source marker and the POSTED count, and the corrected-term badge paints only when the term actually moved", async () => {
  await withMockedEnv(rpcRouter({
    list_revenue_recognition_schedules: {
      client_id: CLIENT,
      schedules: [
        SCHEDULE_ROW,
        // A DOCUMENT-lane row whose term has since moved, and one whose `term_moved` is ABSENT
        // entirely — the shape a web build ahead of its database sees.
        { ...SCHEDULE_ROW, schedule_id: "s-2", term_source: "document_service_period",
          document_id: DOC, stated_term_id: null, term_stated_by: null, term_reason: null,
          term_moved: true },
        { ...SCHEDULE_ROW, schedule_id: "s-3", term_source: "document_service_period",
          document_id: DOC, stated_term_id: null, term_stated_by: null, term_reason: null,
          term_moved: undefined },
      ],
    },
    list_revenue_recognition_attention: EMPTY_ATTENTION,
  }), async () => {
    const h = await renderComponent(
      app(createElement(DeferredRevenueList, { clientId: CLIENT })));
    try {
      await h.settle();
      const root = h.container as unknown as Node;
      assert.equal(byTestId(root, "deferred-revenue-row-term-stated").length, 1,
        "exactly the human-stated row carries the provenance marker");
      assert.equal(byTestId(root, "deferred-revenue-row-term-corrected").length, 1,
        "the corrected badge paints on the row whose term MOVED, and on neither of the others — an "
        + "absent field paints nothing");
      const text = h.text();
      assert.ok(text.includes("3 of 12 periods"),
        "the progress column counts COMMITTED receipts, not admitted Work");
      assert.ok(text.includes("2030"), "the row names the deferred account it releases");
      assert.ok(text.includes("4500"), "…and the revenue account it credits");
    } finally {
      await h.unmount();
    }
  });
});

test("941.detail: a schedule renders its facts, its stated-term evidence and each period's own state, with a posted period told apart from a refused one", async () => {
  await withMockedEnv(rpcRouter({
    get_revenue_recognition_schedule: DETAIL,
  }), async () => {
    const h = await renderComponent(
      app(createElement(DeferredRevenueDetail, { clientId: CLIENT, scheduleId: SCHEDULE })));
    try {
      await h.settle();
      const root = h.container as unknown as Node;
      const text = h.text();

      assert.ok(text.includes("Annual membership recognition"));
      assert.ok(text.includes(messages.DeferredRevenue.patternStraightLine),
        "the pattern is stated as a fact — it is the only one this estate offers");
      assert.ok(text.includes("the membership agreement runs twelve months from 1 January"),
        "the accountant's own written grounds are rendered, not stored and forgotten");
      assert.equal(byTestId(root, "deferred-revenue-term-stated").length, 1,
        "the memo-only lane's who/when/why block IS the evidence, and it renders");
      assert.equal(byTestId(root, "deferred-revenue-term-superseded").length, 0,
        "…and the corrected-term banner does not, because this term has not moved");

      assert.equal(byTestId(root, "deferred-revenue-period-posted").length, 2,
        "two periods carry a COMMITTED receipt");
      assert.equal(byTestId(root, "deferred-revenue-period-refused").length, 1,
        "…and one refused, told apart from them");
      assert.ok(text.includes("actor_not_active"),
        "the refused period's own typed reason is printed verbatim");
      assert.ok(text.includes(messages.DeferredRevenue.residualNote),
        "the final period is marked as the one carrying the remainder");
    } finally {
      await h.unmount();
    }
  });
});

test("941.detail: L04-SPEC-04 — an ENDED schedule does not offer a plain reconfiguration, which the door still refuses, and names the one path that does take over the periods still to run: a replacement derived from a corrected term", async () => {
  // MEASURED on the lane database (`p941.supersede.running` and `p941.replace.posted`): the plan
  // is ended through `clara.end_accounting_plan` and `clara.create_revenue_recognition_schedule`
  // STILL answers CLR13 `deferred_revenue_schedule_exists` for the same receipt, so "Configure a
  // new one" is an act nobody can perform. `clara.replace_revenue_recognition_schedule` (0317) is
  // the act #941 AC3 names, and it is reachable only once the term on record has been corrected.
  await withMockedEnv(rpcRouter({
    get_revenue_recognition_schedule: {
      ...DETAIL, status: "ended", ended_at: "2026-06-30T00:00:00Z", ended_by: "u1",
      ended_reason: "the member cancelled the agreement",
    },
  }), async () => {
    const h = await renderComponent(
      app(createElement(DeferredRevenueDetail, { clientId: CLIENT, scheduleId: SCHEDULE })));
    try {
      await h.settle();
      const text = h.text();
      assert.ok(text.includes("This schedule has ended"), "the state itself is still said plainly");
      assert.ok(!/Configure a new one/.test(text),
        "the receipt still carries a LIVE schedule, so a plain reconfiguration is refused");
      assert.ok(text.includes("a second schedule cannot simply be configured"),
        "…and the reason is said rather than left to be discovered");
      assert.ok(text.includes("replacement derived from a corrected term"),
        "…beside the one path that does take over the periods still to run");
    } finally {
      await h.unmount();
    }
  });
});

test("941.detail: a read that fails renders the not-found state rather than an empty schedule, and a schedule whose term MOVED carries the banner", async () => {
  await withMockedEnv(rpcRouter({ get_revenue_recognition_schedule: null }), async () => {
    const h = await renderComponent(
      app(createElement(DeferredRevenueDetail, { clientId: CLIENT, scheduleId: SCHEDULE })));
    try {
      await h.settle();
      assert.ok(h.text().includes(messages.DeferredRevenue.notFound));
    } finally {
      await h.unmount();
    }
  });

  await withMockedEnv(rpcRouter({
    get_revenue_recognition_schedule: {
      ...DETAIL, term_moved: true, term_live: false, term_superseded_by: "st-2",
      term_current_end: "2027-06-30",
    },
  }), async () => {
    const h = await renderComponent(
      app(createElement(DeferredRevenueDetail, { clientId: CLIENT, scheduleId: SCHEDULE })));
    try {
      await h.settle();
      const root = h.container as unknown as Node;
      assert.equal(byTestId(root, "deferred-revenue-term-superseded").length, 1,
        "the banner says the term has since been corrected and that nothing above has moved");
      assert.ok(h.text()
        .includes(messages.DeferredRevenue.termSupersededBody));
    } finally {
      await h.unmount();
    }
  });
});
