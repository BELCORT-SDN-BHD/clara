// Exact interaction-to-wire pins for the bank forms that consume MoneyInput.
// These tests mount the real forms, type decimal strings, and assert the RPC
// bodies after parsing; component rendering alone cannot prove the cents that
// cross a governed door.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import { renderComponent, setFieldValue, setNativeValue, textOf } from "../../test/hookHarness";
import messages from "../../messages/en.json";
import { SettleLineForm } from "./settle-line-form";
import { StatementsSection } from "./statements-section";
import { WriteOffForm } from "./write-off-form";

type Node = {
  tagName?: string;
  id?: string;
  value?: string;
  placeholder?: string;
  parentNode?: Node | null;
  childNodes?: Node[];
};

function findAll(root: Node, predicate: (node: Node) => boolean): Node[] {
  const found = predicate(root) ? [root] : [];
  for (const child of root.childNodes ?? []) found.push(...findAll(child, predicate));
  return found;
}

function reactProps(node: Node): Record<string, unknown> {
  const key = Object.keys(node).find((candidate) => candidate.startsWith("__reactProps"));
  return key ? ((node as Record<string, unknown>)[key] as Record<string, unknown>) : {};
}

function byId(root: Node, id: string): Node {
  const node = findAll(root, (candidate) => candidate.id === id || reactProps(candidate).id === id)[0];
  assert.ok(node, `expected #${id} to render`);
  return node;
}

function button(root: Node, copy: string): Node {
  const node = findAll(root, (candidate) => candidate.tagName === "BUTTON" && textOf(candidate as never) === copy)[0];
  assert.ok(node, `expected the ${copy} button to render`);
  return node;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function App(child: ReactElement) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: child });
}

async function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

function withoutOpKey(body: Record<string, unknown>): Record<string, unknown> {
  assert.equal(typeof body.p_op_key, "string");
  assert.ok((body.p_op_key as string).length > 0);
  const rest = { ...body };
  delete rest.p_op_key;
  return rest;
}

test("StatementsSection sends exact signed header and line cents", async () => {
  const enterBodies: Record<string, unknown>[] = [];
  await withMockedEnv(
    (async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.includes("/rpc/list_bank_accounts")) {
        return jsonResponse([{ id: "acc1", bank_code: "MBB", bank_name_display: "Maybank", account_number: "123" }]);
      }
      if (url.includes("/rpc/list_bank_statements")) return jsonResponse([]);
      if (url.includes("/rpc/enter_bank_statement")) {
        enterBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return jsonResponse({ statement_id: "statement-1" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App(createElement(StatementsSection, { clientId: "c1" })));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const root = h.container as unknown as Node;
        const lineAmount = byId(root, "statement-line-amount-1");
        assert.equal(reactProps(lineAmount).placeholder, "-0.00", "signed statement lines advertise their polarity");

        await h.act(() => {
          setFieldValue(byId(root, "document-id") as never, "doc1");
          setFieldValue(byId(root, "period-start") as never, "2026-01-01");
          setFieldValue(byId(root, "period-end") as never, "2026-01-31");
          setFieldValue(byId(root, "opening") as never, "1,234.56");
          setFieldValue(byId(root, "closing") as never, "-99.05");
          setFieldValue(byId(root, "statement-line-date-1") as never, "2026-01-05");
          setFieldValue(byId(root, "statement-line-description-1") as never, "Bank fee");
          setFieldValue(lineAmount as never, "-250.00");
        });
        const form = findAll(root, (candidate) => candidate.tagName === "FORM")[0];
        assert.ok(form);
        await h.fireEvent(form as never, "submit");
        for (let i = 0; i < 6; i++) await h.settle();
      } finally {
        await h.unmount();
      }
    },
  );

  assert.equal(enterBodies.length, 1);
  assert.deepEqual(withoutOpKey(enterBodies[0]!), {
    p_client: "c1",
    p_bank_account: "acc1",
    p_document: "doc1",
    p_header: {
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      statement_date: null,
      opening_cents: 123456,
      closing_cents: -9905,
      total_debit_cents: null,
      total_credit_cents: null,
      currency: null,
    },
    p_lines: [{
      line_no: 1,
      entry_date: "2026-01-05",
      value_date: null,
      description: "Bank fee",
      amount_cents: -25000,
      running_balance_cents: null,
    }],
  });
});

test("SettleLineForm sends the exact positive allocation cents and defaults", async () => {
  const settleBodies: Record<string, unknown>[] = [];
  await withMockedEnv(
    (async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.includes("/rest/v1/counterparties")) {
        return jsonResponse([{ id: "cp1", kind: "customer", name: "Acme", registration_no: null, tin: null, merged_into: null, retired_at: null }]);
      }
      if (url.includes("/rpc/list_open_items_by_counterparty")) {
        return jsonResponse([{ id: "item1", domain: "ar", counterparty_id: "cp1", item_kind: "invoice", item_date: "2026-01-02", due_date: null, amount_cents: 40000, outstanding_cents: 40000, entry_id: "entry1" }]);
      }
      if (url.includes("/rpc/settle_from_bank_line")) {
        settleBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return jsonResponse({ entry_id: "entry1", match_id: "match1", status: "live" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App(createElement(SettleLineForm, { clientId: "c1", lineId: "line1", onDone: () => undefined })));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const root = h.container as unknown as Node;
        const counterparty = byId(root, "counterparty-line1");
        await h.fireEvent(counterparty as never, "change", (node) => setNativeValue(node as never, "value", "cp1"));
        for (let i = 0; i < 5; i++) await h.settle();
        await h.act(() => {
          setFieldValue(byId(root, "allocation-item1") as never, "400.00");
          setFieldValue(byId(root, "memo-line1") as never, "settle invoice");
        });
        await h.fireEvent(button(root, "Settle") as never, "click");
        for (let i = 0; i < 5; i++) await h.settle();
      } finally {
        await h.unmount();
      }
    },
  );

  assert.equal(settleBodies.length, 1);
  assert.deepEqual(withoutOpKey(settleBodies[0]!), {
    p_client: "c1",
    p_line: "line1",
    p_counterparty: "cp1",
    p_allocations: [{ item_id: "item1", amount_cents: 40000 }],
    p_memo: "settle invoice",
    p_posting_date: null,
    p_charge_cents: 0,
    p_charge_account: null,
    p_adjustments: null,
    p_attestation: null,
    p_control_account: null,
  });
});

test("WriteOffForm sends exact debit and credit cents through the composite door", async () => {
  const writeOffBodies: Record<string, unknown>[] = [];
  await withMockedEnv(
    (async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.includes("/rpc/resolve_and_book_bank_line")) {
        writeOffBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return jsonResponse({ status: "resolved" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App(createElement(WriteOffForm, { clientId: "c1", exceptionId: "ex1", onDone: () => undefined })));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const root = h.container as unknown as Node;
        await h.act(() => {
          setFieldValue(byId(root, "wo-date-ex1") as never, "2026-01-31");
          setFieldValue(byId(root, "wo-memo-ex1") as never, "write off fee");
          setFieldValue(byId(root, "wo-account-ex1-1") as never, "6100");
          setFieldValue(byId(root, "wo-debit-ex1-1") as never, "123.45");
          setFieldValue(byId(root, "wo-account-ex1-2") as never, "1100");
          setFieldValue(byId(root, "wo-credit-ex1-2") as never, "123.45");
          setFieldValue(byId(root, "wo-note-ex1") as never, "approved adjustment");
        });
        await h.fireEvent(button(root, "Write off") as never, "click");
        for (let i = 0; i < 5; i++) await h.settle();
      } finally {
        await h.unmount();
      }
    },
  );

  assert.equal(writeOffBodies.length, 1);
  assert.deepEqual(withoutOpKey(writeOffBodies[0]!), {
    p_client: "c1",
    p_exception: "ex1",
    p_disposition: "written_off_adjustment",
    p_note: "approved adjustment",
    p_draft: {
      posting_date: "2026-01-31",
      memo: "write off fee",
      lines: [
        { account_code: "6100", debit_cents: 12345, credit_cents: 0 },
        { account_code: "1100", debit_cents: 0, credit_cents: 12345 },
      ],
    },
    p_allocations: null,
    p_adjustments: null,
    p_advance_applications: null,
    p_ack_period_exceptions: false,
    p_charge_cents: 0,
    p_charge_account: null,
    p_attestation: null,
  });
});
