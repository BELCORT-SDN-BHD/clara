// #941 — THE CONFIGURE FORM: WHY IT CAN OFFER NOTHING, WHAT IT SENDS, AND WHAT IT NEVER SENDS.
//
// The per-client roster gates RECOGNITION ahead of the shared eligibility wall, and it gates it
// under a PURPOSE of its own. Arm B can therefore be empty for a reason that has nothing to do
// with this client's advances: no account is enrolled as holding customer advances, so nothing
// here could ever be configured. That is a different fact from "this client has taken no
// advances", with a different next act, and one sentence for both would send a person looking for
// a receipt that is sitting right there.
//
// WHAT EACH CELL PINS:
//   941.form.roster_purpose   the roster this form reads is the DEFERRED-REVENUE arm of the one
//                             relation — `purpose=eq.deferred_revenue`. Reading the prepayment arm
//                             would paint "an account is enrolled" off the expense side's roster.
//   941.form.roster_empty     an EMPTY roster paints the roster sentence and a real link to the
//                             panel, not the generic "nothing is waiting" empty state.
//   941.form.roster_unknown   a roster read that FAILED paints NEITHER sentence about the roster:
//                             an absent answer is not evidence of an empty roster.
//   941.form.not_enrolled     a create refusal whose AXIS is `deferred_account_not_enrolled` names
//                             the panel as the remedy, beside the database's own words, and says
//                             the advance is still posted.
//   941.form.derives_nothing  a successful submit sends the door's SEVEN arguments and nothing
//                             else: no amount, no term, no dates, no cadence, no pattern. The
//                             allocation is the frozen evaluator's and the term is its carrier's.
//   941.form.memo_only_term   a memo-only receipt with no live term is offered the STATEMENT act;
//                             a document-bound one is told its term is recorded on the document.
//
// Every cell drives the real `DeferredRevenueForm` against a mocked `fetch`; nothing here reaches
// a database and nothing here asserts an internal collaborator.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { DeferredRevenueForm } from "./deferred-revenue-form";

enableDomInspection();

const CLIENT = "11111111-2222-4333-8444-555555555555";
const ENTRY = "55555555-6666-4777-8888-999999999999";
const ENTRY_DOC = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const DOC = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const WORK = "33333333-4444-4555-8666-777777777777";
const SCHEDULE = "44444444-5555-4666-8777-888888888888";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}

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
      createElement("div", null, createElement("h1", null, "Deferred revenue"), node),
    ),
  });
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

/** A memo-only receipt: it binds NO document, so its term is a person's statement. */
const UNRECOGNISED_MEMO = {
  arm: "unrecognised", entry_id: ENTRY, posting_date: "2026-01-05",
  memo: "annual membership paid in advance", document_id: null,
  deferred_account_code: "2030", amount_cents: 1200000,
  term_carrier: "human_stated", has_live_term: false, next_step: "state_service_period",
};

/** A receipt that binds an issued invoice whose service period is not recorded yet. */
const UNRECOGNISED_DOC = {
  arm: "unrecognised", entry_id: ENTRY_DOC, posting_date: "2026-01-06",
  memo: "rent received in advance", document_id: DOC,
  deferred_account_code: "2030", amount_cents: 600000,
  term_carrier: "document_service_period", has_live_term: false,
  next_step: "record_document_service_period",
};

/** A receipt ready to be recognised: its carrier already holds a live term. */
const READY = {
  ...UNRECOGNISED_MEMO, has_live_term: true, next_step: "configure_schedule",
};

const ENROLMENT = {
  id: "e1", account_code: "2030", purpose: "deferred_revenue",
  reason: "customer memberships are taken a year ahead", active: true,
  enrolled_at: "2026-09-21T00:00:00Z", created_by: "u1", retired_at: null,
};

const CREATED = {
  term_source: "human_stated", stated_term_id: "st-1", schedule_id: SCHEDULE,
  plan_id: "22222222-3333-4444-8555-666666666666", revision_id: "r1", revision: 1,
  status: "active", kind: "revenue_recognition_schedule", client_id: CLIENT,
  source_entry_id: ENTRY, document_id: null, service_period_id: null,
  basis_kind: "human_stated", term_start: "2026-01-01", term_end: "2026-12-31",
  deferred_account_code: "2030", revenue_account_code: "4500",
  revenue_account_basis: "membership income", total_cents: 1200000, period_count: 12,
  remainder_placement: "final_period", recognition_pattern: "straight_line",
  schedule_version: "prepayment_schedule_v2", period_lines: [], frequency: "monthly",
  day_rule: "last_day_of_month", day_of_month: null, timezone: "Asia/Kuala_Lumpur",
  effective_from: "2026-01-31", effective_to: "2026-12-31", next_occurrences: [],
  overlap_warning: null, configuration_only: true,
};

/** `roster` is what `/rest/v1/prepayment_account_enrolments` answers: an ARRAY, or a status to
 *  fail with. `create` is what `create_revenue_recognition_schedule` answers. */
function router(opts: {
  unrecognised?: unknown[];
  roster: unknown[] | { fail: number };
  create?: { status: number; body: unknown };
}): { impl: typeof fetch; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const raw = typeof init?.body === "string" ? init.body : null;
    calls.push({ url, body: raw === null ? null : JSON.parse(raw) });
    if (url.includes("/rest/v1/prepayment_account_enrolments")) {
      return Array.isArray(opts.roster)
        ? jsonResponse(opts.roster)
        : jsonResponse({ message: "no" }, opts.roster.fail);
    }
    if (url.includes("/rpc/list_revenue_recognition_attention")) {
      return jsonResponse({
        client_id: CLIENT, refusing: [], unrecognised: opts.unrecognised ?? [],
        refusing_truncated: false, unrecognised_truncated: false,
      });
    }
    if (url.includes("/rpc/create_revenue_recognition_schedule")) {
      const c = opts.create ?? { status: 200, body: CREATED };
      return jsonResponse(c.body, c.status);
    }
    if (url.includes("/rest/v1/coa_accounts")) {
      return jsonResponse([
        { account_code: "4500", name: "Membership income", account_type: "income", is_active: true },
        { account_code: "2030", name: "Deferred revenue", account_type: "liability", is_active: true },
      ]);
    }
    if (url.includes("/rpc/list_accounting_work")) {
      return jsonResponse({
        rows: [{
          id: WORK, memo: "Recognise the membership advance", intent_key: "k",
          created_at: "2026-01-02T00:00:00Z",
        }],
        next_cursor: null, truncated: false,
      });
    }
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
  return { impl, calls };
}

async function mount(
  impl: typeof fetch,
  run: (h: Awaited<ReturnType<typeof renderComponent>>) => Promise<void>,
  entryId: string | null = null,
) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  const h = await renderComponent(
    app(createElement(DeferredRevenueForm, { clientId: CLIENT, entryId })));
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    await run(h);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

const pick = (h: { container: unknown }, id: string) => {
  const node = findAllIn(h.container as Node, (n) => n.getAttribute?.("id") === id)[0];
  assert.ok(node, `no control with id ${id}`);
  return node;
};

const submitButton = (h: { container: unknown }) => {
  const node = findAllIn(h.container as Node, (n) =>
    n.tagName === "BUTTON"
    && String((n as { textContent?: string }).textContent ?? "")
      .includes(messages.DeferredRevenue.submitCreate))[0];
  assert.ok(node, "the submit control renders");
  return node;
};

test("941.form.roster_purpose — the roster this form reads is the DEFERRED-REVENUE arm of the one relation, never the prepayment arm", async () => {
  const { impl, calls } = router({ roster: [ENROLMENT], unrecognised: [READY] });
  await mount(impl, async () => {
    const read = calls.find((c) => c.url.includes("/rest/v1/prepayment_account_enrolments"));
    assert.ok(read, "the form reads the roster at all");
    assert.match(read.url, /purpose=eq\.deferred_revenue/,
      "one relation, two purposes: this surface asks for the arm it gates on");
    assert.doesNotMatch(read.url, /purpose=eq\.prepayment(&|$)/,
      "an account enrolled to hold PREPAYMENTS says nothing about customer advances");
  });
});

test("941.form.roster_empty — with NO deferred-revenue account enrolled the form says so and links to the Registers panel, instead of the generic empty state", async () => {
  const { impl } = router({ roster: [], unrecognised: [] });
  await mount(impl, async (h) => {
    const text = h.text();
    assert.ok(text.includes(messages.DeferredRevenue.rosterEmptyTitle),
      "the form names the ROSTER, which is the actual reason it can offer nothing");
    assert.ok(text.includes(messages.DeferredRevenue.rosterEmptyBody),
      "…including the sentence that says already-posted advances are covered by it too");
    const link = findAllIn(h.container as Node, (n) =>
      n.tagName === "A" && String(n.getAttribute?.("href") ?? "").includes("registers"))[0];
    assert.ok(link, "the sentence carries a real link to the panel, not a description of one");
  });
});

test("941.form.roster_unknown — a roster read that FAILED claims NOTHING about the roster: an absent answer is not evidence of an empty one", async () => {
  const { impl } = router({ roster: { fail: 500 }, unrecognised: [] });
  await mount(impl, async (h) => {
    assert.ok(!h.text().includes(messages.DeferredRevenue.rosterEmptyTitle),
      "a failed read must never paint the empty-roster claim");
  });
});

test("941.form.not_enrolled — a create refusal whose AXIS is deferred_account_not_enrolled names the panel as the remedy, beside the database's own words, and says the advance is still posted", async () => {
  const { impl } = router({
    roster: [{ ...ENROLMENT, account_code: "2031" }],
    unrecognised: [READY],
    create: {
      status: 400,
      body: {
        code: "CLR37",
        message: "account 2030 is not enrolled as a deferred-revenue account for this client",
        details: JSON.stringify({
          reason: "deferred_revenue_source_unfit", axis: "deferred_account_not_enrolled",
          deferred_account_code: "2030", remedy: "clara.enrol_prepayment_account",
          panel: "client_registers_prepayment_accounts",
        }),
      },
    },
  });
  await mount(impl, async (h) => {
    await h.act(() => { setFieldValue(pick(h, "deferred-revenue-sourceEntry") as never, ENTRY); });
    await h.act(() => { setFieldValue(pick(h, "deferred-revenue-authority") as never, WORK); });
    await h.act(() => {
      setFieldValue(pick(h, "deferred-revenue-revenueAccount") as never, "4500");
    });
    await h.act(() => {
      setFieldValue(pick(h, "deferred-revenue-revenueBasis") as never,
        "membership fees are membership income");
    });
    await h.act(() => {
      setFieldValue(pick(h, "deferred-revenue-purpose") as never, "Annual membership");
    });
    for (let i = 0; i < 4; i++) await h.settle();

    await clickButton(submitButton(h) as never);
    for (let i = 0; i < 8; i++) await h.settle();

    const text = h.text();
    assert.ok(text.includes("is not enrolled as a deferred-revenue account"),
      "the database's own words are on screen, as they are for every other refusal");
    assert.ok(text.includes(messages.DeferredRevenue.refusalNotEnrolled),
      "…and the panel is named as the remedy, which is what the refusal's own axis is for");
    assert.ok(text.includes(messages.DeferredRevenue.refusalPostedAnyway),
      "…and the sentence this lane owes a person: the liability is still on the books");
    const link = findAllIn(h.container as Node, (n) =>
      n.tagName === "A" && String(n.getAttribute?.("href") ?? "").includes("registers"))[0];
    assert.ok(link, "the remedy is a real link, not a description of one");
  });
});

test("941.form.derives_nothing — a successful submit sends the door's seven arguments and nothing else: no amount, no term, no dates, no cadence, no pattern", async () => {
  const { impl, calls } = router({ roster: [ENROLMENT], unrecognised: [READY] });
  await mount(impl, async (h) => {
    await h.act(() => { setFieldValue(pick(h, "deferred-revenue-authority") as never, WORK); });
    await h.act(() => {
      setFieldValue(pick(h, "deferred-revenue-revenueAccount") as never, "4500");
    });
    await h.act(() => {
      setFieldValue(pick(h, "deferred-revenue-revenueBasis") as never,
        "membership fees are membership income");
    });
    await h.act(() => {
      setFieldValue(pick(h, "deferred-revenue-purpose") as never, "Annual membership");
    });
    for (let i = 0; i < 4; i++) await h.settle();

    await clickButton(submitButton(h) as never);
    for (let i = 0; i < 8; i++) await h.settle();

    const post = calls.find((c) => c.url.includes("/rpc/create_revenue_recognition_schedule"));
    assert.ok(post, "the door was called");
    const body = post.body as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), [
      "p_authority_ref", "p_client", "p_op_key", "p_purpose", "p_revenue_account",
      "p_revenue_basis", "p_source_entry",
    ], "every argument is a human judgement or an idempotency key — the arithmetic is the "
      + "database's, so there is nothing else to send");
    // THE PREFILLED RECEIPT is the one the URL named, and the authority is the WORK the person
    // chose — never the receipt's own id dressed as an instruction.
    assert.equal(body.p_source_entry, ENTRY);
    assert.deepEqual(body.p_authority_ref, { kind: "accounting_work", id: WORK });
  }, ENTRY);
});

test("941.form.memo_only_term — a memo-only receipt with no live term is offered the statement act; a document-bound one is told its term is recorded on the document", async () => {
  const { impl } = router({
    roster: [ENROLMENT], unrecognised: [UNRECOGNISED_MEMO, UNRECOGNISED_DOC],
  });
  await mount(impl, async (h) => {
    await h.act(() => { setFieldValue(pick(h, "deferred-revenue-sourceEntry") as never, ENTRY); });
    for (let i = 0; i < 4; i++) await h.settle();
    let text = h.text();
    assert.ok(text.includes(messages.DeferredRevenue.sourceNeedsStatedTerm),
      "a receipt that binds no document has nowhere else to read a term from");
    assert.ok(text.includes(messages.DeferredRevenue.stateTermHeading),
      "…so the statement act is on this form, where the person already is");
    assert.ok(!text.includes(messages.DeferredRevenue.sourceNeedsTerm),
      "…and it is never told to go and look at a document it does not have");

    await h.act(() => {
      setFieldValue(pick(h, "deferred-revenue-sourceEntry") as never, ENTRY_DOC);
    });
    for (let i = 0; i < 4; i++) await h.settle();
    text = h.text();
    assert.ok(text.includes(messages.DeferredRevenue.sourceNeedsTerm),
      "a document-bound receipt's term is recorded on the document, somewhere else entirely");
    assert.ok(!text.includes(messages.DeferredRevenue.stateTermHeading),
      "…so this form never offers to state one over it — that would be a second term carrier");
  });
});
