// #940 — THE FORM SAYS WHY IT CAN OFFER NOTHING, AND THE REFUSAL NAMES THE PANEL.
//
// A per-client roster now gates amortisation ahead of the shared eligibility wall, which means arm
// B can be empty for a NEW reason: not "this client has nothing unamortised" but "no account is
// enrolled as a prepayment account, so nothing here could ever be configured". Those are different
// facts with different next acts, and a form that showed one sentence for both would send a person
// looking for a prepayment that is sitting right there.
//
// WHAT EACH CELL PINS:
//   form.roster_empty       an EMPTY roster paints the roster sentence and a link to the panel —
//                           not the generic "nothing recognised" empty state.
//   form.roster_unknown     a roster read that FAILED paints NEITHER sentence about the roster. An
//                           absent answer is not evidence of an empty roster (review law 2).
//   form.not_enrolled       a create refusal whose axis is `prepaid_account_not_enrolled` names the
//                           panel as the remedy, beside the database's own words.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { PrepaymentForm } from "./prepayment-form";

enableDomInspection();

const CLIENT = "11111111-2222-4333-8444-555555555555";
const ENTRY = "55555555-6666-4777-8888-999999999999";
const DOC = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const WORK = "33333333-4444-4555-8666-777777777777";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
      createElement("div", null, createElement("h1", null, "Prepayments"), node),
    ),
  });
}

type Node = {
  tagName?: string;
  childNodes?: Node[];
  getAttribute?: (k: string) => string | null;
};

function findAllIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

const UNSCHEDULED = {
  arm: "unscheduled", entry_id: ENTRY, posting_date: "2026-02-14",
  memo: "prepaid subscription", document_id: DOC,
  prepaid_account_code: "19000001", amount_cents: 120000,
  term_carrier: "document_service_period", has_live_term: true, next_step: "configure_schedule",
};

/** `roster` is the answer `/rest/v1/prepayment_account_enrolments` gives: an ARRAY, or a status to
 *  fail with. `create` is what `create_prepayment_schedule` answers. */
function router(opts: {
  unscheduled?: unknown[];
  roster: unknown[] | { fail: number };
  create?: { status: number; body: unknown };
}): { impl: typeof fetch; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const raw = typeof init?.body === "string" ? init.body : null;
    calls.push({ url, body: raw === null ? null : JSON.parse(raw) });
    if (url.includes("/rest/v1/prepayment_account_enrolments")) {
      return Array.isArray(opts.roster)
        ? jsonResponse(opts.roster)
        : jsonResponse({ message: "no" }, opts.roster.fail);
    }
    if (url.includes("/rpc/list_prepayment_attention")) {
      return jsonResponse({
        client_id: CLIENT, refusing: [], unscheduled: opts.unscheduled ?? [],
        refusing_truncated: false, unscheduled_truncated: false,
      });
    }
    if (url.includes("/rpc/create_prepayment_schedule")) {
      const c = opts.create ?? { status: 200, body: {} };
      return jsonResponse(c.body, c.status);
    }
    if (url.includes("/rest/v1/coa_accounts")) {
      return jsonResponse([
        { account_code: "59000001", name: "Subscriptions", account_type: "expense", is_active: true },
      ]);
    }
    if (url.includes("/rpc/list_accounting_work")) {
      return jsonResponse({
        rows: [{ id: WORK, memo: "Amortise the subscription", intent_key: "k", created_at: "2026-02-01T00:00:00Z" }],
        next_cursor: null, truncated: false,
      });
    }
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
  return { impl, calls };
}

async function mount(impl: typeof fetch, run: (h: Awaited<ReturnType<typeof renderComponent>>) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  const h = await renderComponent(app(createElement(PrepaymentForm, { clientId: CLIENT })));
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

test("prepayments.form.roster_empty — with NO account enrolled the form says so and links to the Registers panel, instead of the generic 'nothing recognised' empty state", async () => {
  const { impl } = router({ roster: [], unscheduled: [] });
  await mount(impl, async (h) => {
    const text = h.text();
    assert.match(text, /No prepayment account is enrolled/,
      "the form names the ROSTER, which is the actual reason it can offer nothing");
    assert.match(text, /Registers/, "…and points at where to fix it");
    const link = findAllIn(h.container as never, (n) =>
      n.tagName === "A" && String(n.getAttribute?.("href") ?? "").includes("registers"))[0];
    assert.ok(link, "the sentence carries a real link to the Registers page, not a description of one");
    assert.match(String(link.getAttribute?.("href")), /tab=fixedAssets/);
  });
});

test("prepayments.form.roster_unknown — a roster read that FAILED claims NOTHING about the roster: an absent answer is not evidence of an empty one", async () => {
  const { impl } = router({ roster: { fail: 500 }, unscheduled: [] });
  await mount(impl, async (h) => {
    const text = h.text();
    assert.doesNotMatch(text, /No prepayment account is enrolled/,
      "a failed read must never paint the empty-roster claim");
  });
});

test("prepayments.form.roster_present — with an account enrolled the roster sentence is absent and the form behaves exactly as it did", async () => {
  const { impl } = router({
    roster: [{ id: "e1", account_code: "19000001", purpose: "prepayment", reason: "r", active: true, enrolled_at: "2026-09-21T00:00:00Z", created_by: "u1", retired_at: null }],
    unscheduled: [UNSCHEDULED],
  });
  await mount(impl, async (h) => {
    assert.doesNotMatch(h.text(), /No prepayment account is enrolled/);
  });
});

test("prepayments.form.not_enrolled — a create refusal whose AXIS is prepaid_account_not_enrolled names the panel as the remedy, beside the database's own words", async () => {
  const { impl } = router({
    roster: [{ id: "e1", account_code: "19000002", purpose: "prepayment", reason: "r", active: true, enrolled_at: "2026-09-21T00:00:00Z", created_by: "u1", retired_at: null }],
    unscheduled: [UNSCHEDULED],
    create: {
      status: 400,
      body: {
        code: "CLR10",
        message: "account 19000001 is not enrolled as a prepayment account for this client",
        details: JSON.stringify({
          reason: "prepayment_source_unfit", axis: "prepaid_account_not_enrolled",
          prepaid_account_code: "19000001", remedy: "clara.enrol_prepayment_account",
          panel: "client_registers_prepayment_accounts",
        }),
      },
    },
  });
  await mount(impl, async (h) => {
    const pick = (id: string) => {
      const node = findAllIn(h.container as never, (n) => n.getAttribute?.("id") === id)[0];
      assert.ok(node, `no control with id ${id}`);
      return node;
    };
    await h.act(() => { setFieldValue(pick("prepayment-sourceEntry") as never, ENTRY); });
    await h.act(() => { setFieldValue(pick("prepayment-authority") as never, WORK); });
    await h.act(() => { setFieldValue(pick("prepayment-expenseAccount") as never, "59000001"); });
    await h.act(() => { setFieldValue(pick("prepayment-expenseBasis") as never, "subscriptions are charged to subscriptions"); });
    await h.act(() => { setFieldValue(pick("prepayment-purpose") as never, "Annual subscription"); });
    for (let i = 0; i < 4; i++) await h.settle();

    const submit = findAllIn(h.container as never, (n) =>
      n.tagName === "BUTTON" && /Configure the schedule/.test(String((n as { textContent?: string }).textContent ?? "")))[0];
    assert.ok(submit, "the submit control renders");
    await clickButton(submit as never);
    for (let i = 0; i < 8; i++) await h.settle();

    const text = h.text();
    assert.match(text, /not enrolled as a prepayment account/,
      "the database's own words are on screen, as they are for every other refusal");
    // The apostrophe in the shipped copy is a TYPOGRAPHIC one (U+2019); `.` rather than a literal
    // quote, so this cell pins the sentence and not the punctuation a copy pass may retune.
    assert.match(text, /Enrol it on the client.s Registers page, then configure the schedule again/,
      "…and the panel is named as the remedy, which is what the refusal's own `panel` key is for");
    const link = findAllIn(h.container as never, (n) =>
      n.tagName === "A" && String(n.getAttribute?.("href") ?? "").includes("registers"))[0];
    assert.ok(link, "the remedy is a real link, not a description of one");
  });
});
