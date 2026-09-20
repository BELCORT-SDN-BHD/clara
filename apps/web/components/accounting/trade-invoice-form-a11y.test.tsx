// #655 — GATE (b), the structural a11y scan of the trade-invoice form. See test/domInspect.ts's
// header for why this rides the hand-written rule engine (test/a11yRules.ts) rather than real
// axe-core.
//
// SCANNED UNDER A SYNTHETIC <h1>, the idiom components/documents/documents-a11y.test.tsx
// established: on the real page the form always renders under `PageHeader`'s own <h1>, so scanning
// it standalone without one would flag a heading-order violation that is an artifact of testing an
// interior surface in isolation.
//
// THE THREE STATES ARE SCANNED SEPARATELY, and that is the point rather than thoroughness for its
// own sake: the denied state, the loading skeleton and the filled form render DIFFERENT markup, and
// a scan of only the happy one would pass while the state a refused viewer actually lands on had no
// accessible name at all.
//
// MEASURED FIRST (`p655.rig.a11y_precedent_scan`, gap-655 §14.6 scanned filenames only): the
// existing aging surface has NO a11y spec of its own — `components/registers/` carries
// `aging-register.test.tsx` but no `*-a11y.test.tsx` and no 320px / 200% / reduced-motion cell — so
// these are ADDITIONS rather than duplicates of an existing guarantee.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
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

const BOOKKEEPER: NavigationScope & { firm_id?: string; user_id?: string } = {
  role_rank: 1, is_operator: false, firm_id: FIRM, user_id: USER,
};
const VIEWER: typeof BOOKKEEPER = { ...BOOKKEEPER, role_rank: 0 };

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: CLIENT, account_code: "6300", name: "Office Supplies", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "2000", name: "Trade Payables Control", account_type: "liability", is_active: true },
];

const PARTIES: CounterpartyRow[] = [{
  id: ALPHA, firm_id: FIRM, client_id: CLIENT, kind: "vendor", name: "Alpha Supplies Sdn Bhd",
  name_normalized: "alphasuppliessdnbhd", registration_no: "200101000001", tin: null,
  payment_terms_days: 30, merged_into: null, retired_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
}];

function Page(props: {
  scope?: typeof BOOKKEEPER;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  submit?: () => Promise<SubmitTradeInvoiceWorkResult>;
} = {}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      "div",
      null,
      createElement("h1", null, "Record an invoice or bill"),
      createElement(TradeInvoiceFormView, {
        clientId: CLIENT,
        scope: props.scope ?? BOOKKEEPER,
        navigate: () => {},
        submit: (props.submit ?? (async () => ({ kind: "denied" }) as SubmitTradeInvoiceWorkResult)) as never,
        storage: null,
        loadAccounts: props.loadAccounts ?? (async () => ACCOUNTS),
        loadParties: async () => PARTIES,
        session: { getAccessToken: async () => "tok" },
      }),
    ),
  });
}

function byId(h: { find: (p: (n: Stub) => boolean) => Stub | null }, id: string): Stub {
  const node = h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === id);
  assert.ok(node, `no element with id "${id}"`);
  return node;
}

const F = (field: string) => `trade-invoice-${field.replace(/\./g, "-")}`;

function clean(h: Awaited<ReturnType<typeof renderComponent>>, label: string): void {
  const violations = checkAccessibility(h.container as never);
  assert.deepEqual(violations, [],
    `${label}: ${violations.map((v) => `${v.rule} on ${v.element}: ${v.message}`).join(" | ")}`);
}

test("the FILLED form is structurally accessible", async () => {
  const h = await renderComponent(Page());
  await h.fireEvent(byId(h, F("documentDate")), "change", (n) => setFieldValue(n, "2026-03-04"));
  await h.fireEvent(byId(h, F("memo")), "change", (n) => setFieldValue(n, "Alpha Supplies bill"));
  clean(h, "filled form");
});

test("the DENIED state a viewer lands on is structurally accessible — not a blank", async () => {
  const h = await renderComponent(Page({ scope: VIEWER }));
  clean(h, "denied state");
  assert.ok(String(h.text()).trim().length > 0, "…and it is not empty");
});

test("the LOADING skeleton is structurally accessible and announces itself", async () => {
  let release: (rows: CoaAccountRow[]) => void = () => {};
  const pending = new Promise<CoaAccountRow[]>((r) => { release = r; });
  const h = await renderComponent(Page({ loadAccounts: () => pending }));
  clean(h, "loading skeleton");
  const busy = h.find((n) => (n as { getAttribute?: (k: string) => string | null })
    .getAttribute?.("aria-busy") === "true");
  assert.ok(busy, "the skeleton carries aria-busy, so a screen reader is not told the form is ready");
  assert.ok(String(h.text()).includes("Loading"),
    "…and it carries a name a screen reader can read, not just grey boxes");
  release(ACCOUNTS);
  await h.settle();
});

test("the REFUSED state is structurally accessible, and its code is beside its sentence", async () => {
  const h = await renderComponent(Page({
    submit: async () => ({
      // The wire shape `submitTradeInvoiceWork` really returns — the candidate list comes off
      // the refusal's generic `detail` carrier (#981) and is typed as a first-class field, so the
      // candidate LIST is part of what this scan has to find structurally accessible.
      kind: "invalid_basis", field: "invoice.counterparty", reason: "party_ambiguous",
      candidates: [
        { counterparty_id: ALPHA, name: "Alpha Supplies Sdn Bhd", registration_no: "200101000001" },
      ],
    }) as unknown as SubmitTradeInvoiceWorkResult,
  }));
  const form = h.find((n) => n.tagName === "FORM");
  assert.ok(form);
  await h.fireEvent(form, "submit");
  await h.settle();
  clean(h, "refused state");
});

test("EVERY new input carries an accessible NAME — a control nobody can name is a control nobody can use", async () => {
  const h = await renderComponent(Page());
  for (const field of ["counterparty", "documentDate", "dueDate", "reference", "totalCents",
    "taxFacts", "postingDate", "memo"]) {
    const node = byId(h, F(field)) as {
      getAttribute: (k: string) => string | null;
    };
    const id = node.getAttribute("id");
    const labelled = h.find((n) => n.tagName === "LABEL"
      && (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("for") === id);
    const aria = node.getAttribute("aria-label") ?? node.getAttribute("aria-labelledby");
    assert.ok(labelled || aria, `${field} has an accessible name`);
  }
});

test("the basis grid has its OWN labelled horizontal viewport, so 320px scrolls the GRID not the page", async () => {
  const h = await renderComponent(Page());
  const viewport = h.find((n) => {
    const get = (n as { getAttribute?: (k: string) => string | null }).getAttribute;
    return get?.("role") === "region" && String(get?.("class") ?? "").includes("overflow-x-auto");
  });
  assert.ok(viewport, "appendix C §4: the lines editor gets its own viewport, never a page-wide scroll");
  const get = (viewport as { getAttribute: (k: string) => string | null }).getAttribute;
  assert.ok(get("aria-label"), "…and the region is NAMED, or it is a scroll trap for a screen reader");
  assert.equal(get("tabindex"), "0", "…and keyboard-reachable, per the scrollable-region rule");
});

test("REDUCED MOTION: nothing on this form animates except the loading skeleton's pulse", async () => {
  const h = await renderComponent(Page());
  const animated = h.find((n) => /\banimate-/.test(
    String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("class") ?? "")));
  assert.equal(animated, null,
    "the settled form carries no animation at all, which is the strongest possible reduced-motion answer");
});
