// #643 — the periodic-adjustment form, under test: the FORM's own behaviour, over the rules
// `lib/work/periodic-adjustment.test.ts` already proves in isolation.
//
// SIX THINGS ONLY A MOUNTED FORM CAN PROVE, and each has its own cell:
//   1. A failed submit MOVES FOCUS to the first invalid control and sends nothing (§3: "Focus the
//      first invalid field").
//   2. A SERVER field path becomes a FOCUSED control, in BOTH spellings — the camelCase the route
//      re-spells and the snake_case the database raises. A refusal that focuses nothing is a
//      refusal a preparer has to hunt for.
//   3. THE LOST-RESPONSE REPLAY carries the SAME intent key. The whole idempotency story rests on
//      it, and no unit cell over a pure function can catch a second key.
//   4. THE TYPE SWITCH KEEPS BOTH HALVES. A preparer who switches away and back finds their
//      figures, and the SUBMITTED body carries only the active half.
//   5. THE DERIVED ENTRY IS ON SCREEN AND IS NOT EDITABLE — the C-29 rung, made visible: what is
//      submitted is the entry the particulars produce, and the line grid is a preview.
//   6. Each server answer renders as an INLINE state with the right next action — never a toast.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { PeriodicAdjustmentFormView } from "./periodic-adjustment-form";
import { adjustmentDraftKey } from "../../lib/work/periodic-adjustment-draft";
import type { DraftStorage } from "../../lib/work/journal-draft";
import type { SubmitJournalWorkResult } from "../../lib/work/api";
import type { CoaAccountRow } from "../../lib/journals/types";
import type { NavigationScope } from "../../lib/firm/navigation";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const USER = "11111111-1111-4111-8111-111111111111";
const FIRM = "22222222-2222-4222-8222-222222222222";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const BOOKKEEPER: NavigationScope & { firm_id?: string; user_id?: string } = {
  role_rank: 1,
  is_operator: false,
  firm_id: FIRM,
  user_id: USER,
};
const VIEWER: typeof BOOKKEEPER = { ...BOOKKEEPER, role_rank: 0 };

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: CLIENT, account_code: "1200", name: "Inventory / Stock", account_type: "asset", is_active: true },
  { client_id: CLIENT, account_code: "5040", name: "Cost of Sales", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "6010", name: "EPF Contribution (Employer)", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "2100", name: "EPF (KWSP) Payable", account_type: "liability", is_active: true },
  { client_id: CLIENT, account_code: "1150", name: "Maybank current", account_type: "asset", is_active: true },
  { client_id: CLIENT, account_code: "2020", name: "Accruals", account_type: "liability", is_active: true },
  { client_id: CLIENT, account_code: "6000", name: "Salaries and Wages", account_type: "expense", is_active: true },
  // Every account the seven obligation kinds can DEFAULT to: a kind switch that offered a code this
  // fixture had not registered would red on `accountUnknown` and say nothing about the switch.
  { client_id: CLIENT, account_code: "2110", name: "SOCSO (PERKESO) Payable", account_type: "liability", is_active: true },
  { client_id: CLIENT, account_code: "2120", name: "EIS (SIP) Payable", account_type: "liability", is_active: true },
  { client_id: CLIENT, account_code: "2130", name: "PCB (MTD) Payable", account_type: "liability", is_active: true },
  { client_id: CLIENT, account_code: "2140", name: "HRDF Levy Payable", account_type: "liability", is_active: true },
  { client_id: CLIENT, account_code: "6020", name: "SOCSO Contribution (Employer)", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "6030", name: "EIS Contribution (Employer)", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "6040", name: "HRDF Levy Expense", account_type: "expense", is_active: true },
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

type Submitted = {
  clientId: string;
  intentKey: string;
  purpose: string;
  basis: { lines: ReadonlyArray<Record<string, unknown>>; [k: string]: unknown };
  adjustment: Record<string, unknown>;
};

function App(props: {
  scope?: typeof BOOKKEEPER;
  submit?: (auth: unknown, input: Submitted) => Promise<SubmitJournalWorkResult>;
  navigate?: (href: string) => void;
  storage?: DraftStorage | null;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(PeriodicAdjustmentFormView, {
      clientId: CLIENT,
      scope: props.scope ?? BOOKKEEPER,
      navigate: props.navigate ?? (() => {}),
      submit: (props.submit ?? (async () => ({ kind: "denied" }) as SubmitJournalWorkResult)) as never,
      storage: props.storage ?? null,
      loadAccounts: props.loadAccounts ?? (async () => ACCOUNTS),
      session: { getAccessToken: async () => "tok" },
    }),
  });
}

function byId(h: { find: (p: (n: Stub) => boolean) => Stub | null }, id: string): Stub {
  const node = h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === id);
  assert.ok(node, `no element with id "${id}"`);
  return node;
}

function maybeId(h: { find: (p: (n: Stub) => boolean) => Stub | null }, id: string): Stub | null {
  return h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === id);
}

function byLabel(h: { find: (p: (n: Stub) => boolean) => Stub | null }, label: string): Stub {
  const node = h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("aria-label") === label);
  assert.ok(node, `no control labelled "${label}"`);
  return node;
}

function focusedId(): string | null {
  const node = activeElement() as { getAttribute?: (k: string) => string | null } | null;
  return node?.getAttribute?.("id") ?? null;
}

/** The form's own SUBMIT, fired at the form — the house idiom (a click on a `type="submit"` button
 *  has no default action in this harness's stub DOM). */
async function submitForm(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const form = h.find((n) => n.tagName === "FORM");
  assert.ok(form, "no form");
  await h.fireEvent(form, "submit");
  await h.settle();
}

const F = (field: string) => `periodic-adjustment-${field}`;

/** A clean stocktake: RM 4,000.00 opening, RM 6,500.00 closing — a RM 2,500.00 rise. */
async function fillStock(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  await h.fireEvent(byId(h, F("periodStart")), "change", (n) => setFieldValue(n, "2026-01-01"));
  await h.fireEvent(byId(h, F("periodEnd")), "change", (n) => setFieldValue(n, "2026-12-31"));
  await h.fireEvent(byId(h, F("openingCents")), "change", (n) => setFieldValue(n, "4000.00"));
  await h.fireEvent(byId(h, F("closingCents")), "change", (n) => setFieldValue(n, "6500.00"));
  await h.fireEvent(byId(h, F("inventoryAccountCode")), "change", (n) => setFieldValue(n, "1200"));
  await h.fireEvent(byId(h, F("costAccountCode")), "change", (n) => setFieldValue(n, "5040"));
  await h.fireEvent(byId(h, F("countedAt")), "change", (n) => setFieldValue(n, "2026-12-31"));
  await h.fireEvent(byId(h, F("instruction")), "change", (n) => setFieldValue(n, "The 2026 year-end stocktake."));
}

test("a VIEWER gets the denied state and NO form at all", async () => {
  const h = await renderComponent(App({ scope: VIEWER }));
  try {
    assert.match(h.text(), /You cannot record a journal entry for this client/);
    assert.equal(
      h.find((n) => n.tagName === "BUTTON" && (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("type") === "submit"),
      null,
      "a control that can only ever refuse is not rendered at all",
    );
  } finally {
    await h.unmount();
  }
});

test("an INVALID submit sends nothing and moves focus to the FIRST invalid control", async () => {
  let calls = 0;
  const h = await renderComponent(App({ submit: async () => { calls += 1; return { kind: "denied" }; } }));
  try {
    await h.settle();
    await submitForm(h);
    assert.equal(calls, 0, "the runtime is never asked to refuse what the form can see");
    assert.equal(focusedId(), F("periodStart"), "the period is the first thing a human reads, and it is blank");
    assert.match(h.text(), /Fill this in\./);
  } finally {
    await h.unmount();
  }
});

test("a clean stocktake submits the DERIVED entry and the typed particulars, and navigates to the Work", async () => {
  const sent: Submitted[] = [];
  const routes: string[] = [];
  const h = await renderComponent(App({
    navigate: (href) => routes.push(href),
    submit: async (_a, input) => {
      sent.push(input);
      return { kind: "accepted", workId: "w-1", taskId: "t-1", logicalOpId: "l-1", status: "queued", replayed: false };
    },
  }));
  try {
    await h.settle();
    await fillStock(h);
    await submitForm(h);
    assert.equal(sent.length, 1);
    const body = sent[0]!;
    assert.equal(body.purpose, "periodic_stock_adjustment");
    assert.equal(body.clientId, CLIENT);
    // THE PARTICULARS, in the wire's camelCase, with the movement DERIVED from the two figures.
    assert.equal(body.adjustment.adjustmentCents, 250_000);
    assert.equal(body.adjustment.openingCents, 400_000);
    assert.equal(body.adjustment.countedAt, "2026-12-31");
    assert.equal(body.adjustment.method, "opening_closing_count");
    assert.equal("obligationKind" in body.adjustment, false, "only the ACTIVE half is sent");
    // THE ENTRY THE PARTICULARS PRODUCE — a rise DEBITS inventory, in exact cents.
    assert.deepEqual(
      body.basis.lines.map((l) => [l.accountCode, l.debitCents, l.creditCents]),
      [["1200", 250_000, 0], ["5040", 0, 250_000]]);
    assert.equal(body.basis.postingDate, "2026-12-31", "the posting date follows the period end until it is changed");
    assert.equal(routes[0], `/clients/${CLIENT}/work/w-1`, "the persistent outcome is the Work's own page");
  } finally {
    await h.unmount();
  }
});

test("the derived entry is ON SCREEN and its line grid is NOT editable", async () => {
  const h = await renderComponent(App({}));
  try {
    await h.settle();
    await fillStock(h);
    assert.match(h.text(), /The entry these particulars produce/);
    // THE MOVEMENT IS SHOWN, so a transposed figure is caught before the database refuses it.
    assert.match(h.text(), /Movement \(closing less opening\): RM\s?2,500\.00/);
    // The line grid's own money controls are disabled: what is submitted is the DERIVED entry, and
    // the database refuses one whose lines do not say what the particulars say.
    const debit = byLabel(h, "Debit, line 1") as { getAttribute?: (k: string) => string | null };
    assert.ok(debit.getAttribute?.("disabled") !== null || (debit as { disabled?: boolean }).disabled === true,
      "the preview is a preview");
  } finally {
    await h.unmount();
  }
});

test("a SERVER field path becomes a focused control, in BOTH spellings of one path", async () => {
  for (const [field, expected] of [
    ["adjustment.periodEnd", F("periodEnd")],
    ["adjustment.counted_at", F("countedAt")],
    ["adjustment.inventory_account_code", F("inventoryAccountCode")],
  ] as const) {
    const h = await renderComponent(App({
      submit: async () => ({ kind: "invalid_basis", field, reason: "stale_basis" }),
    }));
    try {
      await h.settle();
      await fillStock(h);
      await submitForm(h);
      assert.equal(focusedId(), expected, `${field} must focus ${expected}`);
      assert.match(h.text(), /The server did not accept these particulars/);
      assert.match(h.text(), /stale_basis/, "the server's own reason rides the banner, never re-worded");
    } finally {
      await h.unmount();
    }
  }
});

test("a BASIS field path still lands on the basis control — one mapper each, both wired", async () => {
  const h = await renderComponent(App({
    submit: async () => ({ kind: "invalid_basis", field: "memo", reason: "nonempty" }),
  }));
  try {
    await h.settle();
    await fillStock(h);
    await submitForm(h);
    assert.equal(focusedId(), "journal-basis-memo");
  } finally {
    await h.unmount();
  }
});

test("a LOST answer is re-sent ONCE with the SAME intent key", async () => {
  const keys: string[] = [];
  const h = await renderComponent(App({
    submit: async (_a, input) => {
      keys.push(input.intentKey);
      return { kind: "lost", message: "socket hang up" };
    },
  }));
  try {
    await h.settle();
    await fillStock(h);
    await submitForm(h);
    assert.equal(keys.length, 2, "exactly twice — a loop here would hammer a runtime that is not answering");
    assert.equal(keys[0], keys[1],
      "THE SAME identity: a second key would admit a SECOND Work for one intent, which is the whole "
      + "defect the intent key exists to prevent");
    assert.match(h.text(), /no answer|did not answer|could not/i);
  } finally {
    await h.unmount();
  }
});

/** A recording submit stub. ONE submit per mount, deliberately: an ACCEPTED answer leaves the
 *  form pending on purpose — production navigates away from it — so a cell that needed two answers
 *  would be measuring a form the product never shows. Each cell below mounts its own. */
function recorder(sent: Submitted[]) {
  return async (_a: unknown, input: Submitted): Promise<SubmitJournalWorkResult> => {
    sent.push(input);
    return { kind: "accepted", workId: "w-x", taskId: null, logicalOpId: null, status: "queued", replayed: false };
  };
}

/** Switch to the payroll half and fill the fields it requires.
 *
 *  THE PERIOD IS NOT ONE OF THEM BY DEFAULT, and that is the database's shape rather than a fixture
 *  convenience: ONE adjustment has ONE period (`clara.periodic_adjustments.period_start/_end`), so
 *  the two halves of the draft SHARE it. A caller that wants the August window asks for it. */
async function fillPayroll(
  h: Awaited<ReturnType<typeof renderComponent>>,
  { period = true }: { period?: boolean } = {},
): Promise<void> {
  await h.fireEvent(byId(h, F("purpose")), "change", (n) => setFieldValue(n, "payroll_obligation"));
  await h.settle();
  if (period) {
    await h.fireEvent(byId(h, F("periodStart")), "change", (n) => setFieldValue(n, "2026-08-01"));
    await h.fireEvent(byId(h, F("periodEnd")), "change", (n) => setFieldValue(n, "2026-08-31"));
  }
  await h.fireEvent(byId(h, F("amountCents")), "change", (n) => setFieldValue(n, "1300.00"));
  await h.fireEvent(byId(h, F("particularsSource")), "change", (n) => setFieldValue(n, "August payroll summary"));
  await h.fireEvent(byId(h, F("instruction")), "change", (n) => setFieldValue(n, "Book the employer EPF for August."));
}

test("the TYPE SWITCH sends ONLY the active half, with the chart's own statutory default", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(App({ submit: recorder(sent) }));
  try {
    await h.settle();
    await fillStock(h);
    await fillPayroll(h);
    assert.equal(maybeId(h, F("openingCents")), null, "the other half's controls are not rendered");
    await submitForm(h);
    assert.equal(sent.length, 1, `expected one submit, got ${JSON.stringify(sent)}`);
    assert.equal(sent[0]!.purpose, "payroll_obligation");
    assert.equal(sent[0]!.adjustment.amountCents, 130_000);
    assert.equal("method" in sent[0]!.adjustment, false, "the stock half is not sent under a payroll purpose");
    // THE STATUTORY DEFAULTS REACHED THE WIRE. Asserted through the submitted body rather than off
    // the control, because that is the claim that matters: the form filled the field from this
    // client's chart, showed it, and submitted THAT.
    assert.equal(sent[0]!.adjustment.liabilityAccountCode, "2100", "EPF accrues to 2100 by default");
    assert.equal(sent[0]!.adjustment.expenseAccountCode, "6010");
    assert.deepEqual(
      sent[0]!.basis.lines.map((l) => [l.accountCode, l.debitCents, l.creditCents]),
      [["6010", 130_000, 0], ["2100", 0, 130_000]]);
  } finally {
    await h.unmount();
  }
});

test("the TYPE SWITCH keeps the other half — switching away and back re-types nothing", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(App({ submit: recorder(sent) }));
  try {
    await h.settle();
    await fillStock(h);
    // The period is SHARED, so this leaves the stocktake's own window in place: what is being
    // tested is that switching away and back re-types nothing, not that each half keeps a period
    // of its own (it does not, and the database's one period is why).
    await fillPayroll(h, { period: false });
    await h.fireEvent(byId(h, F("purpose")), "change", (n) => setFieldValue(n, "periodic_stock_adjustment"));
    await h.settle();
    // NOTHING IS RE-TYPED between the switch and the submit: the stocktake is submitted whole.
    await submitForm(h);
    assert.equal(sent.length, 1, `expected one submit, got ${JSON.stringify(sent)}`);
    assert.equal(sent[0]!.purpose, "periodic_stock_adjustment");
    assert.equal(sent[0]!.adjustment.openingCents, 400_000);
    assert.equal(sent[0]!.adjustment.closingCents, 650_000);
    assert.equal(sent[0]!.adjustment.inventoryAccountCode, "1200");
    assert.equal(sent[0]!.adjustment.countedAt, "2026-12-31");
    assert.equal(sent[0]!.adjustment.countReference, undefined, "an optional nobody filled stays out");
    assert.equal("amountCents" in sent[0]!.adjustment, false, "and the payroll half is not sent");
  } finally {
    await h.unmount();
  }
});

test("switching the obligation kind re-offers ITS defaults", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(App({ submit: recorder(sent) }));
  try {
    await h.settle();
    await fillPayroll(h);
    await h.fireEvent(byId(h, F("obligationKind")), "change", (n) => setFieldValue(n, "salary"));
    await h.settle();
    await submitForm(h);
    assert.equal(sent.length, 1, `expected one submit, got ${JSON.stringify(sent)}`);
    assert.equal(sent[0]!.adjustment.obligationKind, "salary");
    assert.equal(sent[0]!.adjustment.liabilityAccountCode, "2020", "salary accrues to 2020 Accruals");
    assert.equal(sent[0]!.adjustment.expenseAccountCode, "6000");
  } finally {
    await h.unmount();
  }
});

test("a DEFAULT is an offer: a code NO default names is never overwritten by a kind switch", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(App({ submit: recorder(sent) }));
  try {
    await h.settle();
    await fillPayroll(h);
    // `1150` is a bank account: nothing in the default maps names it, so it is unmistakably the
    // preparer's own choice, and a kind switch must leave it alone. (A value that is still SOME
    // kind's default DOES follow the switch — that is what makes the offer useful.)
    await h.fireEvent(byId(h, F("liabilityAccountCode")), "change", (n) => setFieldValue(n, "1150"));
    await h.settle();
    await h.fireEvent(byId(h, F("obligationKind")), "change", (n) => setFieldValue(n, "hrdf"));
    await h.settle();
    await submitForm(h);
    assert.equal(sent.length, 1, `expected one submit, got ${JSON.stringify(sent)}`);
    assert.equal(sent[0]!.adjustment.obligationKind, "hrdf");
    assert.equal(sent[0]!.adjustment.liabilityAccountCode, "1150",
      "once a human has chosen, a kind switch does not overwrite them");
    assert.equal(sent[0]!.adjustment.expenseAccountCode, "6040",
      "…while a field still holding a default does follow the kind");
  } finally {
    await h.unmount();
  }
});

test("the draft is filed under its own scope, with its identity, and retired only on acceptance", async () => {
  const storage = memoryStorage();
  const h = await renderComponent(App({
    storage,
    submit: async () => ({ kind: "accepted", workId: "w-3", taskId: null, logicalOpId: null, status: "queued", replayed: false }),
  }));
  try {
    await h.settle();
    await fillStock(h);
    const key = adjustmentDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT });
    const raw = storage.map.get(key);
    assert.ok(raw, "the draft is kept under the periodic-adjustment key, not the journal lane's");
    const parsed = JSON.parse(raw) as { intentKey: string; draft: { closingCents: number } };
    assert.equal(parsed.draft.closingCents, 650_000, "exact cents, straight out of the money control");
    assert.ok(parsed.intentKey.length > 0);
    assert.match(h.text(), /This draft is kept in this tab/);
    await submitForm(h);
    assert.equal(storage.map.get(key), undefined,
      "retired ONLY after the runtime named the Work — until then the typed particulars were the only copy");
  } finally {
    await h.unmount();
  }
});

test("a 409 offers a NEW identity and a link to the Work that key already names", async () => {
  const keys: string[] = [];
  const h = await renderComponent(App({
    submit: async (_a, input) => {
      keys.push(input.intentKey);
      return { kind: "conflict", workId: "w-existing" };
    },
  }));
  try {
    await h.settle();
    await fillStock(h);
    await submitForm(h);
    assert.match(h.text(), /already submitted with different figures/);
    const link = h.find((n) => n.tagName === "A"
      && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes("w-existing"));
    assert.ok(link, "the 409 named the Work, so the banner offers a route to it rather than an apology");
    // Rotating the identity keeps the particulars and mints a NEW key.
    const button = h.find((n) => n.tagName === "BUTTON"
      && String((n as { textContent?: string }).textContent ?? "").includes("Start a new draft"));
    assert.ok(button);
    await h.fireEvent(button, "click");
    await h.settle();
    await submitForm(h);
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1],
      "a genuinely NEW intent gets a NEW identity — keeping the old key would answer the same 409 for ever");
  } finally {
    await h.unmount();
  }
});

test("a failed chart read degrades to a free-text code, and does NOT block a submit", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(App({
    loadAccounts: async () => { throw new Error("postgrest down"); },
    submit: async (_a, input) => {
      sent.push(input);
      return { kind: "accepted", workId: "w-4", taskId: null, logicalOpId: null, status: "queued", replayed: false };
    },
  }));
  try {
    await h.settle();
    assert.match(h.text(), /chart of accounts could not be read/);
    await fillStock(h);
    await submitForm(h);
    assert.equal(sent.length, 1,
      "a preparer who knows the code can still submit; the commit rechecks every account against "
      + "the live chart anyway");
    assert.equal(sent[0]!.adjustment.inventoryAccountCode, "1200");
  } finally {
    await h.unmount();
  }
});
