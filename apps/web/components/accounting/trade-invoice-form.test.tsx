// #655 — the trade-invoice form's UX ladder, driven through its injectable seams.
//
// EVERY REFUSAL IS A BANNER, NEVER A TOAST, and it carries the door's OWN code — that is the
// assertion, not a styling note: a refusal a person has to act on must stay on the page beside the
// control that caused it. The cells below drive the DECISION (accepted / refused / conflicted /
// lost) rather than a socket, which is what the `submit` seam exists for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { TradeInvoiceFormView } from "./trade-invoice-form";
import { tradeInvoiceDraftKey } from "../../lib/work/trade-invoice-draft";
import type { DraftStorage } from "../../lib/work/journal-draft";
import type { SubmitTradeInvoiceWorkResult } from "../../lib/work/api";
import type { CoaAccountRow } from "../../lib/journals/types";
import type { CounterpartyRow } from "../../lib/registers/counterparty";
import type { NavigationScope } from "../../lib/firm/navigation";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const USER = "11111111-1111-4111-8111-111111111111";
const FIRM = "22222222-2222-4222-8222-222222222222";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALPHA = "33333333-3333-4333-8333-333333333333";
const BETA = "44444444-4444-4444-8444-444444444444";
const WORK = "55555555-5555-4555-8555-555555555555";

const BOOKKEEPER: NavigationScope & { firm_id?: string; user_id?: string } = {
  role_rank: 1, is_operator: false, firm_id: FIRM, user_id: USER,
};
const VIEWER: typeof BOOKKEEPER = { ...BOOKKEEPER, role_rank: 0 };

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: CLIENT, account_code: "6300", name: "Office Supplies", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "6310", name: "SST on Purchases", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "2000", name: "Trade Payables Control", account_type: "liability", is_active: true },
  { client_id: CLIENT, account_code: "1200", name: "Trade Receivables Control", account_type: "asset", is_active: true },
];

const party = (id: string, name: string, over: Partial<CounterpartyRow> = {}): CounterpartyRow => ({
  id, firm_id: FIRM, client_id: CLIENT, kind: "vendor", name,
  name_normalized: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
  registration_no: null, tin: null, payment_terms_days: null,
  merged_into: null, retired_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const PARTIES: CounterpartyRow[] = [
  party(ALPHA, "Alpha Supplies Sdn Bhd", { payment_terms_days: 30 }),
  party(BETA, "Beta Trading Sdn Bhd"),
];

function memoryStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

type Submitted = { clientId: string; intentKey: string; kind: string; invoice: Record<string, unknown>; basis: Record<string, unknown> };

function App(props: {
  scope?: typeof BOOKKEEPER;
  submit?: (auth: unknown, input: Submitted) => Promise<SubmitTradeInvoiceWorkResult>;
  navigate?: (href: string) => void;
  storage?: DraftStorage | null;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  loadParties?: (kind: "vendor" | "customer") => Promise<CounterpartyRow[]>;
} = {}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(TradeInvoiceFormView, {
      clientId: CLIENT,
      scope: props.scope ?? BOOKKEEPER,
      navigate: props.navigate ?? (() => {}),
      submit: (props.submit ?? (async () => ({ kind: "denied" }) as SubmitTradeInvoiceWorkResult)) as never,
      storage: props.storage ?? null,
      loadAccounts: props.loadAccounts ?? (async () => ACCOUNTS),
      loadParties: props.loadParties ?? (async () => PARTIES),
      session: { getAccessToken: async () => "tok" },
    }),
  });
}

function byId(h: { find: (p: (n: Stub) => boolean) => Stub | null }, id: string): Stub {
  const node = h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === id);
  assert.ok(node, `no element with id "${id}"`);
  return node;
}

function focusedId(): string | null {
  const node = activeElement() as { getAttribute?: (k: string) => string | null } | null;
  return node?.getAttribute?.("id") ?? null;
}

async function submitForm(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const form = h.find((n) => n.tagName === "FORM");
  assert.ok(form, "no form");
  await h.fireEvent(form, "submit");
  await h.settle();
}

const F = (field: string) => `trade-invoice-${field.replace(/\./g, "-")}`;

/** Pick Alpha Supplies out of the inline match list — the party is PICKED, never typed as an id. */
async function pickAlpha(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const button = h.find((n) => n.tagName === "BUTTON" && String(n.textContent ?? "").includes("Alpha Supplies"));
  assert.ok(button, "no Alpha Supplies match button");
  await h.fireEvent(button, "click");
  await h.settle();
}

/** A clean supplier bill: Dr 1,060 office supplies / Cr 1,060 payable, total RM 1,060.00. */
async function fillBill(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  await pickAlpha(h);
  await h.fireEvent(byId(h, F("documentDate")), "change", (n) => setFieldValue(n, "2026-03-04"));
  await h.fireEvent(byId(h, F("dueDate")), "change", (n) => setFieldValue(n, "2026-04-15"));
  await h.fireEvent(byId(h, F("reference")), "change", (n) => setFieldValue(n, "ALPHA-2026-0042"));
  await h.fireEvent(byId(h, F("totalCents")), "change", (n) => setFieldValue(n, "1060.00"));
  await h.fireEvent(byId(h, F("postingDate")), "change", (n) => setFieldValue(n, "2026-03-31"));
  await h.fireEvent(byId(h, F("memo")), "change", (n) => setFieldValue(n, "Alpha Supplies bill"));
  await h.fireEvent(byId(h, "journal-basis-line-0-account"), "change", (n) => setFieldValue(n, "6300"));
  await h.fireEvent(byId(h, "journal-basis-line-0-debit"), "change", (n) => setFieldValue(n, "1060.00"));
  await h.fireEvent(byId(h, "journal-basis-line-1-account"), "change", (n) => setFieldValue(n, "2000"));
  await h.fireEvent(byId(h, "journal-basis-line-1-credit"), "change", (n) => setFieldValue(n, "1060.00"));
}

test("a VIEWER gets the denied state and NO form at all", async () => {
  const h = await renderComponent(App({ scope: VIEWER }));
  assert.equal(h.find((n) => n.tagName === "FORM"), null,
    "the write door behind this can only ever refuse a viewer — offering the control would be 裁-187's mistake");
  assert.ok(String(h.text()).includes("bookkeeper"), "…and it says WHY, not just no");
});

test("the LOADING state is a skeleton fitted to the form, never a placeholder zero", async () => {
  let release: (rows: CoaAccountRow[]) => void = () => {};
  const pending = new Promise<CoaAccountRow[]>((r) => { release = r; });
  const h = await renderComponent(App({ loadAccounts: () => pending }));
  assert.ok(h.find((n) => (n as { getAttribute?: (k: string) => string | null })
    .getAttribute?.("data-testid") === "trade-invoice-loading"), "the skeleton is rendered");
  assert.equal(h.find((n) => n.tagName === "FORM"), null, "and no half-populated form beside it");
  release(ACCOUNTS);
  await h.settle();
  assert.ok(h.find((n) => n.tagName === "FORM"), "…which becomes the form once the chart lands");
});

test("a FAILED party read degrades INDEPENDENTLY of the chart read, and says which half is missing", async () => {
  const h = await renderComponent(App({ loadParties: async () => { throw new Error("nope"); } }));
  assert.ok(h.find((n) => n.tagName === "FORM"), "the form still renders");
  assert.ok(String(h.text()).includes("Parties could not be loaded"),
    "…and names the half that failed rather than blanking the page");
  assert.ok(String(h.text()).includes("chart loaded"), "…saying the other half is fine");
});

test("the NO-RESULTS state preserves the query and offers Clear — it never offers to CREATE a party", async () => {
  const h = await renderComponent(App());
  await h.fireEvent(byId(h, F("counterparty")), "change", (n) => setFieldValue(n, "Nobody Sdn Bhd"));
  await h.settle();
  assert.ok(String(h.text()).includes("No party of this client answers"), "the no-results sentence");
  assert.ok(h.find((n) => n.tagName === "BUTTON" && String(n.textContent ?? "").trim() === "Clear"),
    "…with Clear as an action");
  assert.equal(
    h.find((n) => n.tagName === "BUTTON"
      && /create|add .*part/i.test(String(n.textContent ?? ""))),
    null,
    "2026-09-15 D11: this lane CONSUMES identity provenance and writes no counterparty, so no control offers to create one");
  assert.equal((byId(h, F("counterparty")) as { value?: unknown }).value, "Nobody Sdn Bhd", "…and what they typed is still there");
});

test("an invalid submit focuses the FIRST invalid control and PRESERVES every keystroke", async () => {
  const h = await renderComponent(App());
  await h.fireEvent(byId(h, F("reference")), "change", (n) => setFieldValue(n, "ALPHA-2026-0042"));
  await h.fireEvent(byId(h, F("memo")), "change", (n) => setFieldValue(n, "Alpha Supplies bill"));
  await submitForm(h);
  assert.equal(focusedId(), F("counterparty"),
    "the party is the first control a reader reaches, so it is the one focus lands on");
  assert.equal((byId(h, F("reference")) as { value?: unknown }).value, "ALPHA-2026-0042", "user input is PRESERVED across a refused submit");
  assert.equal((byId(h, F("memo")) as { value?: unknown }).value, "Alpha Supplies bill");
});

test("a clean bill sends EXACT cents, `absent` when no due date is stated, and never a computed one", async () => {
  const seen: Submitted[] = [];
  const h = await renderComponent(App({
    submit: async (_a, input) => {
      seen.push(input);
      return { kind: "accepted", workId: WORK, taskId: "t", logicalOpId: "l", status: "queued",
        replayed: false, invoiceId: "inv", invoiceKind: "supplier_bill", counterpartyId: ALPHA,
        dueDate: "2026-04-30", dueDateSource: "counterparty_terms" } as SubmitTradeInvoiceWorkResult;
    },
  }));
  await fillBill(h);
  await h.fireEvent(byId(h, F("dueDate")), "change", (n) => setFieldValue(n, ""));
  await submitForm(h);
  assert.equal(seen.length, 1);
  const sent = seen[0];
  assert.ok(sent);
  assert.equal(sent.kind, "supplier_bill");
  assert.equal((sent.invoice as { totalCents: number }).totalCents, 106000, "EXACT sen, never a float");
  assert.equal((sent.invoice as { dueDate: string | null }).dueDate, null);
  assert.equal((sent.invoice as { dueDateSource: string }).dueDateSource, "absent",
    "the browser states `absent`; only the database may say `counterparty_terms`");
  // …and the DERIVED basis the door answered with is what the banner renders.
  assert.ok(String(h.text()).includes("agreed payment terms"),
    "the success banner renders the basis the DOOR derived, not the one the form sent");
  assert.ok(String(h.text()).includes("2026-04-30"));
});

test("`party_ambiguous` renders its candidates INLINE as a choice, and picking one clears the banner", async () => {
  const h = await renderComponent(App({
    submit: async () => ({
      kind: "invalid_basis", field: "invoice.counterparty", reason: "party_ambiguous",
      detail: {
        candidates: [
          { counterparty_id: ALPHA, name: "Alpha Supplies Sdn Bhd", registration_no: "200101000001" },
          { counterparty_id: BETA, name: "Beta Trading Sdn Bhd", registration_no: "200101000002" },
        ],
      },
    }) as unknown as SubmitTradeInvoiceWorkResult,
  }));
  await fillBill(h);
  await submitForm(h);
  assert.ok(String(h.text()).includes("More than one party answers"), "the door's own sentence");
  assert.ok(String(h.text()).includes("party_ambiguous"), "…with its CODE rendered verbatim");
  assert.ok(String(h.text()).includes("200101000001"),
    "…and the candidate list carried VERBATIM, with the identifier that tells them apart");
  const pick = h.find((n) => n.tagName === "BUTTON"
    && String(n.textContent ?? "").trim() === "Beta Trading Sdn Bhd");
  assert.ok(pick, "each candidate is a control, not prose");
  await h.fireEvent(pick, "click");
  await h.settle();
  assert.equal(String(h.text()).includes("More than one party answers"), false,
    "picking one resolves the refusal in place");
});

test("every refusal is a BANNER carrying the door's code — and there is no toast anywhere", async () => {
  for (const [reason, phrase] of [
    ["credit_shape_not_admitted", "credit note is not recorded here"],
    ["invalid_total", "does not match the control leg"],
    ["wrong_control_domain", "which way the money runs"],
    ["period_locked", "fiscal year"],
    ["insufficient_role", "bookkeeper"],
  ] as const) {
    const h = await renderComponent(App({
      submit: async () => ({ kind: "invalid_basis", field: "kind", reason }) as SubmitTradeInvoiceWorkResult,
    }));
    await fillBill(h);
    await submitForm(h);
    const text = String(h.text());
    assert.ok(text.includes(phrase), `${reason}: the door's own words`);
    assert.ok(text.includes(reason), `${reason}: and its code, verbatim`);
    assert.equal(h.find((n) => (n as { getAttribute?: (k: string) => string | null })
      .getAttribute?.("data-sonner-toast") !== undefined
      && (n as { getAttribute: (k: string) => string | null }).getAttribute("data-sonner-toast") !== null),
    null, `${reason}: never a toast`);
  }
});

test("a LOST response re-sends the SAME intent key EXACTLY ONCE, and the second answer is authoritative", async () => {
  const keys: string[] = [];
  let calls = 0;
  const h = await renderComponent(App({
    submit: async (_a, input) => {
      keys.push(input.intentKey);
      calls += 1;
      if (calls === 1) return { kind: "lost", message: "socket" } as SubmitTradeInvoiceWorkResult;
      return { kind: "accepted", workId: WORK, taskId: "t", logicalOpId: "l", status: "queued",
        replayed: true, invoiceId: "inv", invoiceKind: "supplier_bill", counterpartyId: ALPHA,
        dueDate: null, dueDateSource: "absent" } as SubmitTradeInvoiceWorkResult;
    },
  }));
  await fillBill(h);
  await submitForm(h);
  assert.equal(calls, 2, "exactly one re-send — a lost answer is an UNKNOWN, not an error");
  assert.equal(keys[0], keys[1], "…under the SAME intent key, so it resolves rather than duplicating");
  assert.ok(String(h.text()).includes("Queued"), "and the replayed 202 means the first attempt DID land");
});

test("a 409 conflict offers the Work that already exists, rather than a dead end", async () => {
  const h = await renderComponent(App({
    submit: async () => ({ kind: "conflict", workId: WORK }) as SubmitTradeInvoiceWorkResult,
  }));
  await fillBill(h);
  await submitForm(h);
  assert.ok(String(h.text()).includes("already submitted"));
  assert.ok(String(h.text()).includes("intent_payload_conflict"));
  const link = h.find((n) => n.tagName === "A"
    && String((n as { getAttribute: (k: string) => string | null }).getAttribute("href") ?? "").includes(WORK));
  assert.ok(link, "the database supplied the exit; the form must not throw it away");
});

test("the DRAFT survives a remount, and a scope switch cannot carry it into another client's books", async () => {
  const store = memoryStorage();
  const first = await renderComponent(App({ storage: store }));
  await fillBill(first);
  const key = tradeInvoiceDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT });
  assert.ok(store.map.has(key), "the draft is persisted under the user+firm+client scope");
  const stored = JSON.parse(store.map.get(key) as string);
  assert.equal(stored.draft.reference, "ALPHA-2026-0042");
  assert.equal(stored.draft.totalCents, 106000);

  const second = await renderComponent(App({ storage: store }));
  assert.equal((byId(second, F("reference")) as { value?: unknown }).value, "ALPHA-2026-0042", "…and it is restored on a remount");
  // Another client's key holds nothing.
  assert.equal(store.map.has(tradeInvoiceDraftKey({
    userId: USER, firmId: FIRM, clientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  })), false);
});

test("an ACCEPTED submission clears the draft, so Back does not re-offer a submitted invoice", async () => {
  const store = memoryStorage();
  const h = await renderComponent(App({
    storage: store,
    submit: async () => ({ kind: "accepted", workId: WORK, taskId: "t", logicalOpId: "l",
      status: "queued", replayed: false, invoiceId: "inv", invoiceKind: "supplier_bill",
      counterpartyId: ALPHA, dueDate: "2026-04-15", dueDateSource: "stated" }) as SubmitTradeInvoiceWorkResult,
  }));
  await fillBill(h);
  await submitForm(h);
  assert.equal(store.map.has(tradeInvoiceDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT })), false);
  assert.ok(String(h.text()).includes("as the document states"), "the STATED basis is rendered as stated");
});

test("switching the kind swaps the party read and drops only the party — nothing else is discarded", async () => {
  const asked: string[] = [];
  const h = await renderComponent(App({
    loadParties: async (kind) => { asked.push(kind); return kind === "vendor" ? PARTIES : []; },
  }));
  await h.settle();
  await h.fireEvent(byId(h, F("reference")), "change", (n) => setFieldValue(n, "KEEP-ME"));
  const sales = h.find((n) => n.tagName === "BUTTON" && String(n.textContent ?? "").trim() === "Sales invoice");
  assert.ok(sales);
  await h.fireEvent(sales, "click");
  await h.settle();
  assert.deepEqual(asked, ["vendor", "customer"],
    "a sales invoice is recorded against a CUSTOMER, so the read changes with the kind");
  assert.equal((byId(h, F("reference")) as { value?: unknown }).value, "KEEP-ME", "…and everything that is not the party survives the switch");
});
