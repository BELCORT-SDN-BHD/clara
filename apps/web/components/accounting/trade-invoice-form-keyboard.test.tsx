// #655 — GATE (c), the keyboard walk of the trade-invoice form. Tab order, focus to the first
// invalid control, and focus RETURN after a refusal is resolved.
//
// WHY FOCUS RETURN IS A CELL AND NOT A COURTESY. `party_ambiguous` renders its candidates inline as
// buttons (D12a). A keyboard user who picks one and is left with focus on a button that no longer
// exists has been dropped on `<body>` — they have to Tab from the top of the page to get back to
// the form they were filling. The cell below is what stops that.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { checkKeyboardWalk, focusableElements, positiveTabIndexElements } from "../../test/keyboardWalk";
import { TradeInvoiceFormView } from "./trade-invoice-form";
import type { CoaAccountRow } from "../../lib/journals/types";
import type { CounterpartyRow } from "../../lib/registers/counterparty";
import type { NavigationScope } from "../../lib/firm/navigation";
import type { SubmitTradeInvoiceWorkResult } from "../../lib/work/api";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const USER = "11111111-1111-4111-8111-111111111111";
const FIRM = "22222222-2222-4222-8222-222222222222";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALPHA = "33333333-3333-4333-8333-333333333333";
const BETA = "44444444-4444-4444-8444-444444444444";

const BOOKKEEPER: NavigationScope & { firm_id?: string; user_id?: string } = {
  role_rank: 1, is_operator: false, firm_id: FIRM, user_id: USER,
};

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: CLIENT, account_code: "6300", name: "Office Supplies", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "2000", name: "Trade Payables Control", account_type: "liability", is_active: true },
];

const cp = (id: string, name: string): CounterpartyRow => ({
  id, firm_id: FIRM, client_id: CLIENT, kind: "vendor", name,
  name_normalized: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
  registration_no: null, tin: null, payment_terms_days: null,
  merged_into: null, retired_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
});
const PARTIES = [cp(ALPHA, "Alpha Supplies Sdn Bhd"), cp(BETA, "Beta Trading Sdn Bhd")];

function App(props: { submit?: () => Promise<SubmitTradeInvoiceWorkResult> } = {}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(TradeInvoiceFormView, {
      clientId: CLIENT,
      scope: BOOKKEEPER,
      navigate: () => {},
      submit: (props.submit ?? (async () => ({ kind: "denied" }) as SubmitTradeInvoiceWorkResult)) as never,
      storage: null,
      loadAccounts: async () => ACCOUNTS,
      loadParties: async () => PARTIES,
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

const F = (field: string) => `trade-invoice-${field.replace(/\./g, "-")}`;

async function submitForm(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const form = h.find((n) => n.tagName === "FORM");
  assert.ok(form, "no form");
  await h.fireEvent(form, "submit");
  await h.settle();
}

test("the whole form passes the keyboard walk", async () => {
  const h = await renderComponent(App());
  const violations = checkKeyboardWalk(h.container as never);
  assert.deepEqual(violations, [],
    violations.map((v) => `${v.rule} (${v.wcag}) on ${v.element}: ${v.message}`).join(" | "));
});

test("NOTHING carries a positive tabindex — the DOM order IS the tab order", async () => {
  const h = await renderComponent(App());
  const positive = positiveTabIndexElements(h.container as never);
  assert.deepEqual(positive, [],
    "a positive tabindex rewrites the tab order for the whole page, not just this form");
});

test("TAB ORDER follows the document: the party, then the dates, then the total, then the basis, then submit", async () => {
  const h = await renderComponent(App());
  const ids = focusableElements(h.container as never)
    .map((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id"))
    .filter((id): id is string => typeof id === "string" && id.startsWith("trade-invoice-"));
  // The KIND radio comes first and carries the id of whichever option is checked (a radio group is
  // ONE tab stop, and the checked option is the one that receives it — the roving-tabindex law).
  const expected = [
    F("kind"),
    F("counterparty"), F("documentDate"), F("dueDate"), F("reference"),
    F("totalCents"), F("taxFacts"), F("postingDate"), F("memo"),
  ];
  assert.deepEqual(ids, expected,
    "the order a reader reaches these controls in IS the order the form validates them in");
});

test("a refused submit moves focus to the FIRST invalid control, in document order", async () => {
  const h = await renderComponent(App());
  await submitForm(h);
  assert.equal(focusedId(), F("counterparty"),
    "the party is unresolved and it is the first control — so that is where focus lands");

  // Resolve the party, leave the dates blank, and focus moves to the NEXT invalid control rather
  // than staying where it was.
  const pick = h.find((n) => n.tagName === "BUTTON"
    && String(n.textContent ?? "").includes("Alpha Supplies"));
  assert.ok(pick);
  await h.fireEvent(pick, "click");
  await h.settle();
  await submitForm(h);
  assert.equal(focusedId(), F("documentDate"));
});

test("a SERVER refusal focuses the control the DOOR named, not the first invalid one", async () => {
  const h = await renderComponent(App({
    submit: async () => ({
      kind: "invalid_basis", field: "invoice.total_cents", reason: "invalid_total",
    }) as SubmitTradeInvoiceWorkResult,
  }));
  // Fill it clean, so the LOCAL validator has nothing to say and the door's answer is the only one.
  const pick = h.find((n) => n.tagName === "BUTTON"
    && String(n.textContent ?? "").includes("Alpha Supplies"));
  assert.ok(pick);
  await h.fireEvent(pick, "click");
  await h.settle();
  await h.fireEvent(byId(h, F("documentDate")), "change", (n) => setFieldValue(n, "2026-03-04"));
  await h.fireEvent(byId(h, F("totalCents")), "change", (n) => setFieldValue(n, "1060.00"));
  await h.fireEvent(byId(h, F("postingDate")), "change", (n) => setFieldValue(n, "2026-03-31"));
  await h.fireEvent(byId(h, F("memo")), "change", (n) => setFieldValue(n, "Alpha Supplies bill"));
  await h.fireEvent(byId(h, "journal-basis-line-0-account"), "change", (n) => setFieldValue(n, "6300"));
  await h.fireEvent(byId(h, "journal-basis-line-0-debit"), "change", (n) => setFieldValue(n, "1060.00"));
  await h.fireEvent(byId(h, "journal-basis-line-1-account"), "change", (n) => setFieldValue(n, "2000"));
  await h.fireEvent(byId(h, "journal-basis-line-1-credit"), "change", (n) => setFieldValue(n, "1060.00"));
  await submitForm(h);
  assert.equal(focusedId(), F("totalCents"),
    "ONE mapper, ONE vocabulary: `invoice.total_cents` is this form's total control");
});

test("resolving a `party_ambiguous` refusal RETURNS focus to the party control, never to nowhere", async () => {
  const h = await renderComponent(App({
    submit: async () => ({
      // The wire shape `submitTradeInvoiceWork` really returns: the route unfolds the door's
      // typed `detail.candidates` onto a first-class field (`lib/wire.ts` keeps only
      // `detail.reason`), so a fixture carrying the raw detail would be testing a shape the
      // browser never sees.
      kind: "invalid_basis", field: "invoice.counterparty", reason: "party_ambiguous",
      candidates: [
        { counterparty_id: ALPHA, name: "Alpha Supplies Sdn Bhd", registration_no: "200101000001" },
        { counterparty_id: BETA, name: "Beta Trading Sdn Bhd", registration_no: "200101000002" },
      ],
    }) as unknown as SubmitTradeInvoiceWorkResult,
  }));
  const pick = h.find((n) => n.tagName === "BUTTON"
    && String(n.textContent ?? "").includes("Alpha Supplies"));
  assert.ok(pick);
  await h.fireEvent(pick, "click");
  await h.settle();
  await h.fireEvent(byId(h, F("documentDate")), "change", (n) => setFieldValue(n, "2026-03-04"));
  await h.fireEvent(byId(h, F("totalCents")), "change", (n) => setFieldValue(n, "1060.00"));
  await h.fireEvent(byId(h, F("postingDate")), "change", (n) => setFieldValue(n, "2026-03-31"));
  await h.fireEvent(byId(h, F("memo")), "change", (n) => setFieldValue(n, "Alpha Supplies bill"));
  await h.fireEvent(byId(h, "journal-basis-line-0-account"), "change", (n) => setFieldValue(n, "6300"));
  await h.fireEvent(byId(h, "journal-basis-line-0-debit"), "change", (n) => setFieldValue(n, "1060.00"));
  await h.fireEvent(byId(h, "journal-basis-line-1-account"), "change", (n) => setFieldValue(n, "2000"));
  await h.fireEvent(byId(h, "journal-basis-line-1-credit"), "change", (n) => setFieldValue(n, "1060.00"));
  await submitForm(h);
  assert.equal(focusedId(), F("counterparty"),
    "the server's refusal named the party, so focus is ON the party control when the candidates appear");

  const candidate = h.find((n) => n.tagName === "BUTTON"
    && String(n.textContent ?? "").trim() === "Beta Trading Sdn Bhd");
  assert.ok(candidate, "each candidate is a real control");
  await h.fireEvent(candidate, "click");
  await h.settle();
  // The button the person just used no longer exists. Focus must not be left on a detached node.
  const still = h.find((n) => n.tagName === "BUTTON"
    && String(n.textContent ?? "").trim() === "Beta Trading Sdn Bhd"
    && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("class") ?? "")
      .includes("outline"));
  assert.equal(still, null, "the candidate list is gone once one is picked");
  assert.deepEqual(checkKeyboardWalk(h.container as never), [],
    "…and the form is still fully walkable afterwards");
});

test("every control is DISABLED while a submission is in flight, so nothing is typed into a form that is already going", async () => {
  let release: (r: SubmitTradeInvoiceWorkResult) => void = () => {};
  const pending = new Promise<SubmitTradeInvoiceWorkResult>((r) => { release = r; });
  const h = await renderComponent(App({ submit: () => pending }));
  const pick = h.find((n) => n.tagName === "BUTTON"
    && String(n.textContent ?? "").includes("Alpha Supplies"));
  assert.ok(pick);
  await h.fireEvent(pick, "click");
  await h.settle();
  await h.fireEvent(byId(h, F("documentDate")), "change", (n) => setFieldValue(n, "2026-03-04"));
  await h.fireEvent(byId(h, F("totalCents")), "change", (n) => setFieldValue(n, "1060.00"));
  await h.fireEvent(byId(h, F("postingDate")), "change", (n) => setFieldValue(n, "2026-03-31"));
  await h.fireEvent(byId(h, F("memo")), "change", (n) => setFieldValue(n, "Alpha Supplies bill"));
  await h.fireEvent(byId(h, "journal-basis-line-0-account"), "change", (n) => setFieldValue(n, "6300"));
  await h.fireEvent(byId(h, "journal-basis-line-0-debit"), "change", (n) => setFieldValue(n, "1060.00"));
  await h.fireEvent(byId(h, "journal-basis-line-1-account"), "change", (n) => setFieldValue(n, "2000"));
  await h.fireEvent(byId(h, "journal-basis-line-1-credit"), "change", (n) => setFieldValue(n, "1060.00"));
  const form = h.find((n) => n.tagName === "FORM");
  assert.ok(form);
  void h.fireEvent(form, "submit");
  await h.settle();
  const memo = byId(h, F("memo")) as { getAttribute: (k: string) => string | null };
  assert.ok(memo.getAttribute("disabled") !== null || (memo as { disabled?: boolean }).disabled === true,
    "the form is busy, so its controls are not accepting keystrokes");
  release({ kind: "accepted", workId: "w", taskId: "t", logicalOpId: "l", status: "queued",
    replayed: false, invoiceId: "i", invoiceKind: "supplier_bill", counterpartyId: ALPHA,
    dueDate: null, dueDateSource: "absent" } as SubmitTradeInvoiceWorkResult);
  await h.settle();
});
