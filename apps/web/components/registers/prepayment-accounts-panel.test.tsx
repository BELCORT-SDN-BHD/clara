// #940 — THE PREPAYMENT-ACCOUNT ROSTER PANEL, as rendered behaviour.
//
// WHAT EACH CELL PINS:
//   p940.panel.empty        an empty roster paints the sentence that matters — until an account is
//                           enrolled, NO prepayment on this client can be amortised — and not a
//                           neutral "nothing here yet".
//   p940.panel.rows         an enrolled account shows its code, WHO-ish provenance (the date) and,
//                           above all, the REASON: it is the whole audit trail a later reader has.
//   p940.panel.enrol        the dialog posts the door's exact body with the reason TRIMMED, and the
//                           panel then RE-READS — the new row is on screen because the database
//                           says so, never because this component painted its own answer.
//   p940.panel.reason_gate  Confirm is disabled until a reason is typed, so a person is not sent to
//                           the database to be told to type a sentence (the door stays the backstop).
//   p940.panel.retire_copy  the retire dialog says the sentence a person could otherwise get wrong:
//                           it closes the FUTURE only, and a running schedule posts to term end.
//
// #941 — THE SAME ROSTER NOW CARRIES A SECOND PURPOSE, so the panel stops being purpose-blind:
//   p941.panel.rows_both     the read is NOT narrowed to one purpose, and each row says which
//                            purpose it carries. A roster that showed only the prepayment arm
//                            would tell a firm no account is enrolled while one is.
//   p941.panel.enrol_purpose choosing "advances received" offers this client's active, non-control
//                            LIABILITY accounts and none of the asset ones, and sends
//                            `p_purpose: deferred_revenue` — the door's own positive rule
//                            (0308 §A: a customer's advance is a contract liability).
//   p941.panel.retire_purpose retiring a deferred-revenue row sends THAT row's purpose: the roster
//                            is keyed on (client, account, purpose), so the default would retire a
//                            different enrolment — or none.
//
// THE DIALOG RENDERS INTO A PORTAL at `document.body`, so every search below roots at the BODY
// after the harness container is appended to it — `fa-row-actions.test.tsx`'s own idiom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { PrepaymentAccountsPanel } from "./prepayment-accounts-panel";
import { intlApp, findAll, jsonResponse, FA_CLIENT, type StubNode } from "./fa-depreciation-test-fixtures";

enableDomInspection();

type Call = { url: string; body: Record<string, unknown> };

const bodyNode = () =>
  (globalThis as unknown as { document: { body: StubNode & { appendChild: (c: unknown) => void } } }).document.body;

function reactProps(node: StubNode): Record<string, unknown> {
  const key = Object.keys(node).find((c) => c.startsWith("__reactProps"));
  return key ? ((node as unknown as Record<string, unknown>)[key] as Record<string, unknown>) : {};
}

const ACCOUNTS = [
  { account_code: "19000001", name: "Prepayments", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "374-C56", name: "Trade receivables", account_type: "asset", account_class: "receivable", special_acc_type: null, is_active: true },
  { account_code: "59000001", name: "Subscriptions", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
  // #941's side of the roster: a plain liability the door admits, and a CONTROL liability the
  // shared wall refuses — the panel must not offer the second one.
  { account_code: "2030", name: "Deferred revenue", account_type: "liability", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "2100", name: "Trade payables", account_type: "liability", account_class: "payable", special_acc_type: null, is_active: true },
];

const DEFERRED_ENROLMENT = {
  id: "e2", account_code: "2030", purpose: "deferred_revenue",
  reason: "memberships are billed a year ahead and earned monthly",
  active: true, enrolled_at: "2026-09-22T02:00:00Z", created_by: "u1", retired_at: null,
};

const ENROLMENT = {
  id: "e1", account_code: "19000001", purpose: "prepayment",
  reason: "holds the client's prepaid insurance and nothing else",
  active: true, enrolled_at: "2026-09-21T02:00:00Z", created_by: "u1", retired_at: null,
};

/** Mount the panel with a scripted transport. `rosterPages` is consumed one GET at a time, so a
 *  cell can prove the panel RE-READS after a write rather than painting its own answer. */
async function mountPanel(rosterPages: unknown[][]) {
  const calls: Call[] = [];
  let page = 0;
  const impl = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (url.includes("/rest/v1/prepayment_account_enrolments")) {
      const rows = rosterPages[Math.min(page, rosterPages.length - 1)] ?? [];
      page += 1;
      return jsonResponse(rows);
    }
    if (url.includes("/rpc/enrol_prepayment_account")) return jsonResponse({ enrolment_id: "e1", active: true });
    if (url.includes("/rpc/retire_prepayment_account")) return jsonResponse({ enrolment_id: "e1", active: false });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");

  const h = await renderComponent(intlApp(createElement(PrepaymentAccountsPanel, {
    clientId: FA_CLIENT, accounts: ACCOUNTS as never,
  })));
  bodyNode().appendChild(h.container);
  for (let i = 0; i < 6; i++) await h.settle();

  const teardown = async () => {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  };
  return { h, calls, teardown };
}

/** The confirm control inside the OPEN dialog — found by its sibling Cancel, the one place only an
 *  open dialog has (the portal keeps earlier cells' triggers reachable in the document). */
function dialogConfirm(label: string): StubNode {
  const cancel = findAll(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel").pop();
  if (!cancel) throw new Error("the dialog is not open: no Cancel control");
  const footer = findAll(bodyNode(), (n) => (n.childNodes ?? []).includes(cancel))[0];
  if (!footer) throw new Error("the Cancel control has no parent");
  const confirm = findAll(footer, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === label)[0];
  if (!confirm) throw new Error(`no ${label} control beside Cancel`);
  return confirm;
}

test("p940.panel.empty — an empty roster says no prepayment on this client can be amortised, not merely that the list is empty", async () => {
  const { h, teardown } = await mountPanel([[]]);
  try {
    const text = h.text();
    assert.match(text, /Prepayment and deferred-revenue accounts/,
      "ticket 1079: the heading must name both purposes this panel administers, not only the first");
    assert.match(text, /no prepayment here can be amortised/i,
      "the empty state names the CONSEQUENCE, which is what a firm needs to read");
    assert.equal(findAll(h.container as never, (n) => String(reactProps(n)["data-testid"] ?? "") === "prepayment-account-row").length, 0);
  } finally {
    await teardown();
  }
});

test("p940.panel.rows — an enrolled account renders its code, the date it was enrolled and the REASON a person gave", async () => {
  const { h, teardown } = await mountPanel([[ENROLMENT]]);
  try {
    const text = h.text();
    assert.match(text, /19000001/);
    assert.match(text, /2026-09-21/, "when it was enrolled");
    assert.match(text, /holds the client's prepaid insurance/,
      "the stated reason is on screen — stored and hidden would be a label, not a basis");
    assert.doesNotMatch(text, /no prepayment here can be amortised/i);
  } finally {
    await teardown();
  }
});

test("p940.panel.enrol — the dialog posts the door's exact body with the reason TRIMMED, and the panel re-reads rather than painting its own answer", async () => {
  const { h, calls, teardown } = await mountPanel([[], [ENROLMENT]]);
  try {
    assert.match(h.text(), /no prepayment here can be amortised/i);

    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Enrol an account");
    assert.ok(trigger, "the enrol trigger renders");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    // THE DIALOG BODY IS A PORTAL, so its controls are unreachable by the harness container's
    // delegated dispatch: `setFieldValue` invokes the node's OWN committed onChange, which is the
    // shared harness's answer to exactly this (see its header).
    const select = findAll(bodyNode(), (n) => String(reactProps(n).id ?? "") === "prepayment-account-code")[0];
    assert.ok(select, "the account picker is inside the dialog");
    await h.act(() => { setFieldValue(select as never, "19000001"); });
    const reason = findAll(bodyNode(), (n) => String(reactProps(n).id ?? "") === "prepayment-account-reason")[0];
    assert.ok(reason, "the reason field is inside the dialog");
    await h.act(() => {
      setFieldValue(reason as never, "  holds the client's prepaid insurance and nothing else  ");
    });
    for (let i = 0; i < 4; i++) await h.settle();

    //  rather than : the dialog body renders into a PORTAL outside the
    // harness container, so the container's delegated listener never sees a click dispatched there.
    await clickButton(dialogConfirm("Enrol an account") as never);
    for (let i = 0; i < 8; i++) await h.settle();

    const post = calls.find((c) => c.url.includes("/rpc/enrol_prepayment_account"));
    assert.ok(post, "the governed door was called");
    assert.equal(post!.body.p_client, FA_CLIENT);
    assert.equal(post!.body.p_account, "19000001");
    assert.equal(post!.body.p_purpose, "prepayment");
    assert.equal(post!.body.p_reason, "holds the client's prepaid insurance and nothing else",
      "the reason crosses TRIMMED — a space-padded one must never look present in the roster");
    assert.equal(typeof post!.body.p_op_key, "string");

    // …AND THE PANEL RE-READ. Two GETs, and the row on screen came from the second one.
    const reads = calls.filter((c) => c.url.includes("/rest/v1/prepayment_account_enrolments"));
    assert.ok(reads.length >= 2, `the panel re-read the roster after the write (${reads.length} reads)`);
    assert.match(h.text(), /19000001/);
    assert.doesNotMatch(h.text(), /no prepayment here can be amortised/i);
  } finally {
    await teardown();
  }
});

test("p940.panel.reason_gate — Confirm stays disabled until a reason is typed, so the required basis is asked here rather than earned from the door", async () => {
  const { h, calls, teardown } = await mountPanel([[]]);
  try {
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Enrol an account");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const select = findAll(bodyNode(), (n) => String(reactProps(n).id ?? "") === "prepayment-account-code")[0];
    await h.act(() => { setFieldValue(select as never, "19000001"); });
    for (let i = 0; i < 4; i++) await h.settle();

    // An account chosen and NO reason: the door would refuse `reason_missing`; the form does not
    // make a person find that out.
    assert.equal(Boolean(reactProps(dialogConfirm("Enrol an account")).disabled), true,
      "Confirm is disabled while the reason is blank");
    assert.match(textOf(bodyNode() as never), /Say why before enrolling this account/);
    assert.equal(calls.filter((c) => c.url.includes("/rpc/")).length, 0, "and nothing was posted");
  } finally {
    await teardown();
  }
});

test("p940.panel.retire_copy — the retire dialog says retirement closes the FUTURE only, which is the sentence a person could otherwise get wrong", async () => {
  const { h, teardown } = await mountPanel([[ENROLMENT]]);
  try {
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Retire");
    assert.ok(trigger, "an enrolled row offers Retire");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();
    const text = textOf(bodyNode() as never);
    assert.match(text, /closes the account to NEW schedules/);
    assert.match(text, /keeps posting to the end of its term/,
      "owner decision 5, said in words where the decision is taken");
  } finally {
    await teardown();
  }
});

test("p941.panel.rows_both — the roster read is not narrowed to one purpose, and each row says which purpose it carries", async () => {
  const { h, calls, teardown } = await mountPanel([[ENROLMENT, DEFERRED_ENROLMENT]]);
  try {
    const read = calls.find((c) => c.url.includes("/rest/v1/prepayment_account_enrolments"));
    assert.ok(read, "the panel reads the roster");
    assert.doesNotMatch(read!.url, /purpose=eq\./,
      "one relation, two purposes: a panel that asked for one arm would tell a firm no account is "
      + "enrolled while one is");
    const text = h.text();
    assert.match(text, /19000001/, "the prepayment enrolment is on screen");
    assert.match(text, /2030/, "…and so is the deferred-revenue one");
    assert.match(text, /memberships are billed a year ahead/, "with its own stated reason");
    assert.match(text, /Deferred revenue/,
      "each row says WHICH purpose it carries — two accounts under one heading with no word "
      + "between them is a roster a reader has to guess at");
    assert.equal(
      findAll(h.container as never, (n) => String(reactProps(n)["data-testid"] ?? "") === "prepayment-account-row").length,
      2);
  } finally {
    await teardown();
  }
});

test("p941.panel.enrol_purpose — choosing advances-received offers the client's non-control LIABILITY accounts and none of the asset ones, and sends the deferred_revenue purpose", async () => {
  const { h, calls, teardown } = await mountPanel([[], [DEFERRED_ENROLMENT]]);
  try {
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Enrol an account");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const purpose = findAll(bodyNode(), (n) => String(reactProps(n).id ?? "") === "prepayment-account-purpose")[0];
    assert.ok(purpose, "the dialog asks what the account holds");
    await h.act(() => { setFieldValue(purpose as never, "deferred_revenue"); });
    for (let i = 0; i < 4; i++) await h.settle();

    const select = findAll(bodyNode(), (n) => String(reactProps(n).id ?? "") === "prepayment-account-code")[0];
    const offered = findAll(select as never, (n) => n.tagName === "OPTION")
      .map((n) => String(reactProps(n).value ?? ""))
      .filter((v) => v !== "");
    assert.deepEqual(offered, ["2030"],
      "a contract liability is the only thing a customer's advance can be enrolled as: the asset "
      + "accounts belong to the other purpose and the control liability is the shared wall's");

    await h.act(() => { setFieldValue(select as never, "2030"); });
    const reason = findAll(bodyNode(), (n) => String(reactProps(n).id ?? "") === "prepayment-account-reason")[0];
    await h.act(() => {
      setFieldValue(reason as never, "memberships are billed a year ahead and earned monthly");
    });
    for (let i = 0; i < 4; i++) await h.settle();

    await clickButton(dialogConfirm("Enrol an account") as never);
    for (let i = 0; i < 8; i++) await h.settle();

    const post = calls.find((c) => c.url.includes("/rpc/enrol_prepayment_account"));
    assert.ok(post, "the governed door was called");
    assert.equal(post!.body.p_account, "2030");
    assert.equal(post!.body.p_purpose, "deferred_revenue",
      "the purpose is the person's choice, not this panel's default");
    assert.match(h.text(), /2030/, "and the row on screen came from the re-read");
  } finally {
    await teardown();
  }
});

test("p941.panel.retire_purpose — retiring a deferred-revenue row sends THAT row's purpose, because the roster is keyed on (client, account, purpose)", async () => {
  const { h, calls, teardown } = await mountPanel([[DEFERRED_ENROLMENT], []]);
  try {
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Retire");
    assert.ok(trigger, "the deferred-revenue row offers Retire");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();
    await clickButton(dialogConfirm("Retire") as never);
    for (let i = 0; i < 8; i++) await h.settle();

    const post = calls.find((c) => c.url.includes("/rpc/retire_prepayment_account"));
    assert.ok(post, "the governed door was called");
    assert.equal(post!.body.p_account, "2030");
    assert.equal(post!.body.p_purpose, "deferred_revenue",
      "the default would retire a prepayment enrolment of the same account — or nothing at all, "
      + "while the row a person clicked stays live");
  } finally {
    await teardown();
  }
});
