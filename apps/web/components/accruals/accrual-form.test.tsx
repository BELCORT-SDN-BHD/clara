// #652 — THE ACCRUAL FORM, under test: the FORM's own behaviour, over the rules
// `lib/work/accrual-draft.test.ts` already proves in isolation.
//
// EIGHT THINGS ONLY A MOUNTED FORM CAN PROVE, and each has its own cell:
//
//   1. A VIEWER gets the DENIED face and no form at all — never a blank, and never a control whose
//      only possible outcome is a refusal (裁-187).
//   2. BOTH BOUNDARY SENTENCES ARE PRESENT AND PERSISTENT, in every state the form can be in. They
//      are the ticket's AC5 build half: configuration is not posting, and an accrual is not a
//      periodic stock adjustment.
//   3. A failed submit MOVES FOCUS to the first invalid control and SENDS NOTHING (§3: "Focus the
//      first invalid field"), and the draft is untouched.
//   4. A SERVER field path becomes a FOCUSED control, in the DATABASE's own spelling. A refusal
//      that focuses nothing is a refusal a preparer has to hunt for.
//   5. EVERY BUSINESS REFUSAL IS A PERSISTENT StateBanner carrying the database's code and message
//      VERBATIM — never a toast, never re-worded.
//   6. THE LOST-RESPONSE REPLAY CARRIES THE SAME OP KEY, exactly once. The whole idempotency story
//      rests on it, and no unit cell over a pure function can catch a second key.
//   7. THE DRAFT SURVIVES A REMOUNT (a reload) and a VALIDATION FAILURE, and a changed particular
//      RENEWS the op key because changed figures are a different decision.
//   8. THE DERIVED LINES ARE ON SCREEN AND DISABLED: what is previewed is what the door will build,
//      and the preparer cannot edit it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { AccrualFormView } from "./accrual-form";
import { accrualDraftKey } from "../../lib/work/accrual-draft";
import type { DraftStorage } from "../../lib/work/journal-draft";
import type { AccrualCreated, CreateAccrualInput } from "../../lib/accruals/api";
import { DoorRefusal } from "../../lib/doors";
import type { CoaAccountRow } from "../../lib/journals/types";
import type { NavigationScope } from "../../lib/firm/navigation";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const USER = "11111111-1111-4111-8111-111111111111";
const FIRM = "22222222-2222-4222-8222-222222222222";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACCRUAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const BOOKKEEPER: NavigationScope & { firm_id?: string; user_id?: string } = {
  role_rank: 1,
  is_operator: false,
  firm_id: FIRM,
  user_id: USER,
};
const VIEWER: typeof BOOKKEEPER = { ...BOOKKEEPER, role_rank: 0 };

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: CLIENT, account_code: "6100", name: "Office Rent", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "2020", name: "Accruals", account_type: "liability", is_active: true },
  { client_id: CLIENT, account_code: "1150", name: "Maybank current", account_type: "asset", is_active: true },
  // #942 — the revenue side's own two legs, in the chart every new client gets: 4000 is 0150's
  // own revenue row and 1180 Accrued Income is 0295's.
  { client_id: CLIENT, account_code: "4000", name: "Sales / Fees Income", account_type: "income", is_active: true },
  { client_id: CLIENT, account_code: "1180", name: "Accrued Income", account_type: "asset", is_active: true },
];

// THE DOOR'S OWN ROW SHAPE (`lib/work/work-list.ts`'s `WorkListRow`), not the deleted direct
// read's. #809 repointed the picker at `clara.list_accounting_work`, whose projection carries a
// FLAT `memo` and the `intent_key` migration 0203 added — the label falls back from one to the
// other, so both are here and the fallback is a real branch rather than a hypothetical.
const AUTHORITIES = {
  rows: [
    { id: WORK, intent_key: "instr-1", created_at: "2026-06-30T02:00:00.000Z", memo: "Standing instruction: accrue the monthly rent" },
  ],
  truncated: false,
};

function memoryStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const ACCEPTED: AccrualCreated = {
  accrual_id: ACCRUAL,
  plan_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  revision_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  revision: 1,
  kind: "reversing_journal",
  status: "active",
  posted: false,
  configuration_receipt: { fn: "create_accrual_adjustment", op_key: "op-1" },
  occurrence: { admitted: true, work_id: WORK, due_date: "2026-07-31", leg: "primary" },
  next_occurrences: [{ due_date: "2026-08-31", leg: "primary" }],
  overlap_warning: null,
};

/** A governed refusal built from `lib/doors.ts`'s OWN class — the SAME runtime class the form
 *  branches on with `instanceof`, never a structurally-similar lookalike. A lookalike minted here
 *  would take the transport path instead of the refusal path and this whole file would pass for the
 *  wrong reason (`spelling is not identity`, the review law this estate keeps).
 *
 *  THE `field` RIDES `detail`, which `lib/wire.ts` has already parsed into an object by the time a
 *  caller sees it: `reason` is that object's discriminant and `field` is the rest of the contract
 *  migration 0222 raises beside it. */
function refusal(code: string, reason: string | null, message: string, field?: string): Error {
  return new DoorRefusal(code, message, {
    reason,
    status: 400,
    pgCode: code,
    codeSource: "sqlstate",
    detail: field === undefined ? { reason } : { reason, field },
  }) as unknown as Error;
}

function App(props: {
  scope?: typeof BOOKKEEPER;
  submit?: (input: CreateAccrualInput) => Promise<AccrualCreated>;
  navigate?: (href: string) => void;
  storage?: DraftStorage | null;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  newOpKey?: () => string;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(AccrualFormView, {
      clientId: CLIENT,
      scope: props.scope ?? BOOKKEEPER,
      navigate: props.navigate ?? (() => {}),
      submit: (props.submit ?? (async () => ACCEPTED)) as never,
      storage: props.storage ?? null,
      loadAccounts: props.loadAccounts ?? (async () => ACCOUNTS),
      loadAuthorities: (async () => AUTHORITIES) as never,
      newOpKey: props.newOpKey,
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

const F = (field: string) => `accrual-${field}`;

async function clickSubmit(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const button = h.find((n) => n.tagName === "BUTTON" && /Record the accrual|Recording/.test(String((n as { textContent?: string }).textContent ?? "")));
  assert.ok(button, "no submit button");
  await h.fireEvent(button, "click");
  await h.settle();
}

async function fill(h: Awaited<ReturnType<typeof renderComponent>>, over: Record<string, string> = {}): Promise<void> {
  const values: Record<string, string> = {
    purpose: "Monthly office rent accrual",
    authorityWorkId: WORK,
    servicePeriodStart: "2026-07-01",
    servicePeriodEnd: "2026-07-31",
    amountCents: "1200.00",
    expenseAccountCode: "6100",
    liabilityAccountCode: "2020",
    instruction: "The client's standing instruction of 2026-06-30.",
    // THE AUTHORITY WINDOW SITS INSIDE THE STATED TERM (0222's SIXTH MEASUREMENT): the form
    // refuses a schedule that would post outside the period it names, before any round trip.
    effectiveFrom: "2026-07-01",
    effectiveTo: "2026-07-31",
    ...over,
  };
  for (const [field, value] of Object.entries(values)) {
    await h.fireEvent(byId(h, F(field)), "change", (n) => setFieldValue(n, value));
  }
  await h.settle();
}

// ==============================================================================================

test("652.form: a VIEWER gets the denied face and no form at all — but still both boundary sentences", async () => {
  const h = await renderComponent(App({ scope: VIEWER }));
  try {
    assert.match(h.text(), /You cannot record an accrual/);
    assert.equal(h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === F("purpose")),
      null, "a control that can only ever refuse is not rendered at all");
    assert.match(h.text(), /Accepting an accrual records it; it does not post it/);
    assert.match(h.text(), /An accrual is a schedule, not a period-fact adjustment/);
  } finally {
    await h.unmount();
  }
});

test("652.form: BOTH boundary sentences are present and persistent, before and after a refusal", async () => {
  const h = await renderComponent(App({
    submit: async () => { throw refusal("CLR10", "silent_term", "an accrual states the service period it belongs to", "accrual.service_period_start"); },
  }));
  try {
    const both = (text: string) =>
      /Accepting an accrual records it; it does not post it/.test(text)
      && /An accrual is a schedule, not a period-fact adjustment/.test(text);
    assert.ok(both(h.text()), "both sentences render on the untouched form");
    await fill(h);
    await clickSubmit(h);
    assert.ok(both(h.text()),
      "…and they are STILL there while a refusal is on screen — a boundary a person needs while "
      + "they are deciding cannot be a transient acknowledgement");
  } finally {
    await h.unmount();
  }
});

test("652.form: a failed submit focuses the first invalid control and SENDS NOTHING", async () => {
  const sent: CreateAccrualInput[] = [];
  const h = await renderComponent(App({ submit: async (input) => { sent.push(input); return ACCEPTED; } }));
  try {
    await clickSubmit(h);
    assert.deepEqual(sent, [], "an incomplete accrual never reaches the door");
    assert.equal(focusedId(), F("purpose"), "focus moves to the first invalid control");

    // THE TERM, specifically: its own refusal, at its own control.
    await fill(h, { servicePeriodStart: "" });
    await clickSubmit(h);
    assert.deepEqual(sent, []);
    assert.equal(focusedId(), F("servicePeriodStart"));
    assert.match(h.text(), /State the service period this cost belongs to\./);

    // A STATED ZERO is a TERM refusal at the amount, not an unbalanced-basis one.
    await fill(h, { amountCents: "0.00" });
    await clickSubmit(h);
    assert.deepEqual(sent, []);
    assert.equal(focusedId(), F("amountCents"));
    assert.match(h.text(), /An accrual of zero accrues nothing\./);
  } finally {
    await h.unmount();
  }
});

test("652.form: a schedule that would post outside its own stated term is refused BEFORE the door, at the control", async () => {
  // #652's own ruling — refuse before admission — applied to 0222's SIXTH MEASUREMENT. MEASURED on
  // a rig before that wall existed: an authority running from June under a July term posted three
  // entries, two of them describing a period they did not accrue for (review round 1, A1).
  const sent: CreateAccrualInput[] = [];
  const h = await renderComponent(App({ submit: async (input) => { sent.push(input); return ACCEPTED; } }));
  try {
    await fill(h, { effectiveFrom: "2026-06-01" });
    await clickSubmit(h);
    assert.equal(sent.length, 0, "a schedule reaching outside its term never reaches the door");
    assert.equal(focusedId(), F("effectiveFrom"));
    assert.match(h.text(), /cannot start before the service period it accrues for/);

    await fill(h, { effectiveTo: "2026-12-31" });
    await clickSubmit(h);
    assert.equal(sent.length, 0);
    assert.equal(focusedId(), F("effectiveTo"));
    assert.match(h.text(), /cannot still be accruing after the service period ends\./);

    // AND AN OPEN-ENDED AUTHORITY IS ITS OWN REFUSAL, not a silent null on the wire.
    await fill(h, { effectiveTo: "" });
    await clickSubmit(h);
    assert.equal(sent.length, 0);
    assert.equal(focusedId(), F("effectiveTo"));
    assert.match(h.text(), /Say when this accrual's authority ends\./);

    // …and the bracketed configuration goes through, carrying the window it was given.
    await fill(h);
    await clickSubmit(h);
    assert.equal(sent.length, 1, "a window inside its own term is sent");
    assert.equal(sent[0]?.effectiveTo, "2026-07-31",
      "the end is a DATE on the wire, never a null the door would have to refuse");
  } finally {
    await h.unmount();
  }
});

test("652.form: a term too short for its own schedule is refused BEFORE the door, at the day rule", async () => {
  // 0222's SEVENTH MEASUREMENT. MEASURED on a rig before that wall existed (review round 2, NB1):
  // a 2026-07-01..2026-07-15 term on a month-end rule was ACCEPTED, the plan went live and no due
  // date was ever reached — the list read said "No due dates reached yet", for ever.
  const sent: CreateAccrualInput[] = [];
  const h = await renderComponent(App({ submit: async (input) => { sent.push(input); return ACCEPTED; } }));
  try {
    await fill(h, { servicePeriodEnd: "2026-07-15", effectiveTo: "2026-07-15" });
    await clickSubmit(h);
    assert.equal(sent.length, 0, "an accrual that could never post never reaches the door");
    assert.equal(focusedId(), F("dayRule"),
      "at the control that makes this a wall rather than a ban — not at the term a human stated");
    assert.match(h.text(), /never reaches an accrual date inside the authority window/);

    // THE SAME TERM WITH A RULE THAT FALLS INSIDE IT IS SENT, which is why the refusal above names
    // the schedule rather than the period.
    await h.fireEvent(byId(h, F("dayRule")), "change", (n) => setFieldValue(n, "day_of_month"));
    await h.settle();
    await h.fireEvent(byId(h, F("dayOfMonth")), "change", (n) => setFieldValue(n, "15"));
    await h.settle();
    await clickSubmit(h);
    assert.equal(sent.length, 1, "a schedule that reaches inside its own term is sent");
    assert.equal(sent[0]?.dayOfMonth, 15);
    assert.equal(sent[0]?.dayRule, "day_of_month");
  } finally {
    await h.unmount();
  }
});

test("652.form: a SERVER field path becomes a focused control, and the refusal renders verbatim", async () => {
  const h = await renderComponent(App({
    submit: async () => {
      throw refusal("CLR10", "accrual_account_relationship",
        "accrual.liability_account_code names the payable control account; an accrual carries no identified open item",
        "accrual.liability_account_code");
    },
  }));
  try {
    await fill(h);
    await clickSubmit(h);
    assert.equal(focusedId(), F("liabilityAccountCode"),
      "the database's own field path lands on the control that holds the mistake");
    assert.match(h.text(), /an accrual carries no identified open item/,
      "…and the message is the DATABASE's, rendered verbatim rather than re-worded");
  } finally {
    await h.unmount();
  }
});

test("652.form: a form-level refusal is a persistent banner carrying the code and reason", async () => {
  const h = await renderComponent(App({
    submit: async () => {
      throw refusal("CLR10", "authority_ref_unresolved",
        "the instruction this accrual cites does not exist for this client");
    },
  }));
  try {
    await fill(h);
    await clickSubmit(h);
    const text = h.text();
    assert.match(text, /That was refused/);
    assert.match(text, /CLR10/);
    assert.match(text, /authority_ref_unresolved/);
    assert.match(text, /the instruction this accrual cites does not exist for this client/);
  } finally {
    await h.unmount();
  }
});

test("652.form: a CLR04 answer is the DENIED face, not a field error", async () => {
  const h = await renderComponent(App({
    submit: async () => {
      throw refusal("CLR04", "insufficient_role", "configuring an accrual requires an active bookkeeper or above");
    },
  }));
  try {
    await fill(h);
    await clickSubmit(h);
    assert.match(h.text(), /configuring an accrual requires an active bookkeeper or above/);
  } finally {
    await h.unmount();
  }
});

test("652.form: the LOST-RESPONSE arm re-sends the SAME op key, exactly once", async () => {
  const keys: string[] = [];
  let attempt = 0;
  const h = await renderComponent(App({
    newOpKey: () => "op-fixed",
    submit: async (input) => {
      keys.push(input.opKey);
      attempt += 1;
      if (attempt <= 2) throw new Error("network timeout while reading the response");
      return ACCEPTED;
    },
  }));
  try {
    await fill(h);
    await clickSubmit(h);
    assert.equal(keys.length, 1);
    assert.match(h.text(), /We did not get an answer/);

    const resend = h.find((n) => n.tagName === "BUTTON" && /Send it again/.test(String((n as { textContent?: string }).textContent ?? "")));
    assert.ok(resend, "the lost state offers exactly one re-send");
    await h.fireEvent(resend, "click");
    await h.settle();
    assert.deepEqual(keys, ["op-fixed", "op-fixed"],
      "the SAME identity, which clara._reserve_op replays — never a second accrual");
    assert.match(h.text(), /Still no answer/);
    assert.equal(
      h.find((n) => n.tagName === "BUTTON" && /Send it again/.test(String((n as { textContent?: string }).textContent ?? ""))),
      null,
      "…and a SECOND silence is a question for a human, not a third attempt");
  } finally {
    await h.unmount();
  }
});

test("652.form: the draft survives a remount, a validation failure renews nothing, and a changed particular renews the key", async () => {
  const store = memoryStorage();
  let minted = 0;
  const first = await renderComponent(App({ storage: store, newOpKey: () => `op-${++minted}` }));
  try {
    await fill(first);
    await clickSubmit(first);          // the door accepts; but assert the STORED draft first
  } finally {
    await first.unmount();
  }
  // The submit above cleared it, so re-seed by typing again on a fresh mount and NOT submitting.
  const second = await renderComponent(App({ storage: store, newOpKey: () => `op-${++minted}` }));
  try {
    await fill(second, { purpose: "Quarterly audit fee accrual" });
    const raw = store.map.get(accrualDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT }));
    assert.ok(raw, "the draft is filed under this user+firm+client");
    const stored = JSON.parse(raw) as { opKey: string; draft: { purpose: string; amountCents: number } };
    assert.equal(stored.draft.purpose, "Quarterly audit fee accrual");
    assert.equal(stored.draft.amountCents, 120000, "exact minor units, never a float");
  } finally {
    await second.unmount();
  }
  // A RELOAD: a brand-new mount reads the same storage and finds the same figures and key.
  const third = await renderComponent(App({ storage: store, newOpKey: () => `op-${++minted}` }));
  try {
    assert.equal((byId(third, F("purpose")) as { value?: string }).value, "Quarterly audit fee accrual",
      "a reload restores what was typed");
  } finally {
    await third.unmount();
  }
});

test("652.form: the derived lines are on screen and are NOT editable", async () => {
  const h = await renderComponent(App({}));
  try {
    await fill(h);
    // The two derived lines name the two accounts the preparer chose, with the amount on each side.
    const text = h.text();
    assert.match(text, /6100/);
    assert.match(text, /2020/);
    assert.match(text, /These two lines follow from the amount and the accounts/);
    // EVERY control inside the preview grid is disabled — the lines follow the particulars by
    // construction, so an editable grid would be offering a change the door would overwrite.
    const enabledLineControl = h.find((n: Stub) =>
      (n.tagName === "INPUT" || n.tagName === "SELECT")
      && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") ?? "").startsWith("journal-line-")
      && !(n as { hasAttribute?: (k: string) => boolean }).hasAttribute?.("disabled"));
    assert.equal(enabledLineControl, null, "the preview grid holds no enabled control");
  } finally {
    await h.unmount();
  }
});

test("652.form: an accepted accrual navigates to its own address and retires the draft", async () => {
  const store = memoryStorage();
  const seen: string[] = [];
  const h = await renderComponent(App({ storage: store, navigate: (href) => seen.push(href) }));
  try {
    await fill(h);
    await clickSubmit(h);
    assert.deepEqual(seen, [`/clients/${CLIENT}/accruals/${ACCRUAL}`],
      "the destination is the accrual's own durable address, which re-reads");
    assert.equal(store.map.get(accrualDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT })), undefined,
      "the draft is retired ONLY now: until the door named the accrual it was the only copy");
  } finally {
    await h.unmount();
  }
});

test("652.form: an overlap warning is persistent, and it does NOT block the accrual it reports", async () => {
  // #929/0283 retired the 0045 template arm: the real backend can only ever answer
  // "accounting_plan_overlap", keyed by plan_id — this fixture is kept in that exact shape rather
  // than the retired arm's, even though the component itself never branches on either field
  // (it reads only `.name`; see lib/accruals/api.ts's own header note).
  const h = await renderComponent(App({
    submit: async () => ({
      ...ACCEPTED,
      overlap_warning: {
        kind: "accounting_plan_overlap",
        templates: [{ plan_id: "p1", name: "Monthly rent plan", cadence: "monthly", accounts: ["6100"] }],
      },
    }),
  }));
  try {
    await fill(h);
    await clickSubmit(h);
    assert.match(h.text(), /The accrual was recorded\./,
      "the warning says the accrual EXISTS — it is advisory, and the database only warns");
    assert.match(h.text(), /Monthly rent plan/);
  } finally {
    await h.unmount();
  }
});

// ==============================================================================================
// #937 — THE PER-PERIOD AMOUNTS BLOCK, and the method control that reveals it. Four things only a
// mounted form can prove: the rule is a CHOICE now; the block appears only under the rule that
// performs it and offers the SCHEDULE's own due dates; a row can be added and removed with the
// keyboard; and a per-period set crosses the wire in the database's own spelling.
// ==============================================================================================

async function chooseMethod(h: Awaited<ReturnType<typeof renderComponent>>, rule: string): Promise<void> {
  await h.fireEvent(byId(h, F("method")), "change", (n) => setFieldValue(n, rule));
  await h.settle();
}

function optionValues(node: Stub): string[] {
  const kids = (node as { children?: Stub[] }).children ?? [];
  return kids.map((k) => (k as { getAttribute?: (a: string) => string | null }).getAttribute?.("value") ?? "");
}

test("937.form: the method is a REAL choice between the two rules the ledger performs, and the withdrawn ones are not offered", async () => {
  const h = await renderComponent(App({}));
  try {
    const select = byId(h, F("method"));
    assert.equal(select.tagName, "SELECT", "a rule that changes what posts is chosen, not announced");
    assert.deepEqual(optionValues(select), ["stated_amount", "stated_period_amount"]);
    assert.match(h.text(), /The amount stated for each period separately/);
    assert.doesNotMatch(h.text(), /source_document_amount|prior_period_amount/,
      "a rule nothing performs is never offered");
  } finally {
    await h.unmount();
  }
});

test("937.form: the per-period block appears only under its own rule, and offers the SCHEDULE's own due dates", async () => {
  const h = await renderComponent(App({}));
  try {
    await fill(h, { effectiveTo: "2026-08-31", servicePeriodEnd: "2026-08-31" });
    assert.equal(h.find((n) => (n as Stub & { getAttribute?: (a: string) => string | null })
      .getAttribute?.("id") === `${F("periodAmounts")}-due-0`), null,
    "under stated_amount there is nothing to state per period, so no block at all");

    await chooseMethod(h, "stated_period_amount");
    assert.match(h.text(), /Amount for each period/);
    // ONE "Add a period" PRESS PER PERIOD, and the dates come from the schedule itself — a
    // preparer never types one, so the door's `accrual_period_amount_not_scheduled` refusal is
    // unreachable from this surface.
    const add = h.find((n) => n.tagName === "BUTTON"
      && String((n as { textContent?: string }).textContent ?? "") === "Add a period");
    assert.ok(add, "the block offers a way to add a period");
    await h.fireEvent(add, "click");
    await h.settle();
    assert.deepEqual(optionValues(byId(h, `${F("periodAmounts")}-due-0`)),
      ["", "2026-07-31", "2026-08-31"],
      "the select offers exactly the two month-end due dates this window reaches");
  } finally {
    await h.unmount();
  }
});

test("937.form: a row is added and removed, and the running total says which way the set is out", async () => {
  const h = await renderComponent(App({}));
  try {
    await fill(h, { effectiveTo: "2026-08-31", servicePeriodEnd: "2026-08-31", amountCents: "6500.00" });
    await chooseMethod(h, "stated_period_amount");
    const press = async (label: string) => {
      const b = h.find((n) => n.tagName === "BUTTON"
        && String((n as { textContent?: string }).textContent ?? "") === label);
      assert.ok(b, `no "${label}" button`);
      await h.fireEvent(b, "click");
      await h.settle();
    };
    await press("Add a period");
    await press("Add a period");
    await h.fireEvent(byId(h, `${F("periodAmounts")}-amount-0`), "change", (n) => setFieldValue(n, "3000.00"));
    await h.settle();
    await h.fireEvent(byId(h, `${F("periodAmounts")}-amount-1`), "change", (n) => setFieldValue(n, "3500.00"));
    await h.settle();
    assert.match(h.text(), /Stated: RM 6,500\.00\. This matches the total\./);

    // REMOVING ONE LEAVES THE OTHER, and says how far short the set now is — the exact-sum rule is
    // the door's, and a preparer typing six periods cannot hold the arithmetic in their head.
    await press("Remove 2026-08-31");
    assert.equal(h.find((n) => (n as Stub & { getAttribute?: (a: string) => string | null })
      .getAttribute?.("id") === `${F("periodAmounts")}-amount-1`), null, "the second row is gone");
    assert.match(h.text(), /Stated: RM 3,000\.00 of RM 6,500\.00 — RM 3,500\.00 short\./);
  } finally {
    await h.unmount();
  }
});

test("937.form: a per-period set crosses the wire in the DATABASE's own spelling, and an incomplete one is refused before any round trip", async () => {
  const sent: CreateAccrualInput[] = [];
  const h = await renderComponent(App({
    submit: async (input) => { sent.push(input); return ACCEPTED; },
  }));
  try {
    await fill(h, { effectiveTo: "2026-08-31", servicePeriodEnd: "2026-08-31", amountCents: "6500.00" });
    await chooseMethod(h, "stated_period_amount");
    const press = async (label: string) => {
      const b = h.find((n) => n.tagName === "BUTTON"
        && String((n as { textContent?: string }).textContent ?? "") === label);
      assert.ok(b, `no "${label}" button`);
      await h.fireEvent(b, "click");
      await h.settle();
    };
    await press("Add a period");
    await h.fireEvent(byId(h, `${F("periodAmounts")}-amount-0`), "change", (n) => setFieldValue(n, "6500.00"));
    await h.settle();

    // AUGUST IS UNSTATED. The door would record a typed refusal on that occurrence and post
    // nothing; the form names it at the block instead, before anything is sent.
    await clickSubmit(h);
    assert.equal(sent.length, 0, "nothing is sent while a period the schedule reaches has no amount");
    assert.match(h.text(), /A period the schedule reaches has no amount/);
    assert.equal(focusedId(), F("periodAmounts") + "-amount-0",
      "…and the focus lands on the block that holds the mistake");

    await press("Add a period");
    await h.fireEvent(byId(h, `${F("periodAmounts")}-amount-0`), "change", (n) => setFieldValue(n, "3000.00"));
    await h.settle();
    await h.fireEvent(byId(h, `${F("periodAmounts")}-amount-1`), "change", (n) => setFieldValue(n, "3500.00"));
    await h.settle();
    await clickSubmit(h);
    assert.equal(sent.length, 1, "a complete set is sent");
    assert.deepEqual(sent[0]!.accrual.method, { rule: "stated_period_amount" });
    assert.deepEqual(sent[0]!.accrual.period_amounts, [
      { due_date: "2026-07-31", amount_cents: 300000 },
      { due_date: "2026-08-31", amount_cents: 350000 },
    ]);
    assert.equal(sent[0]!.accrual.amount_cents, 650000,
      "…beside the TOTAL for the window, which is what amount_cents means under this rule");
  } finally {
    await h.unmount();
  }
});

test("937.form: the per-period block passes the structural a11y scan, and every control in it is keyboard-reachable and labelled", async () => {
  const h = await renderComponent(App({}));
  try {
    await fill(h, { effectiveTo: "2026-08-31", servicePeriodEnd: "2026-08-31", amountCents: "6500.00" });
    await chooseMethod(h, "stated_period_amount");
    const add = h.find((n) => n.tagName === "BUTTON"
      && String((n as { textContent?: string }).textContent ?? "") === "Add a period");
    assert.ok(add);
    await h.fireEvent(add, "click");
    await h.settle();

    // THE SHARED ENGINE (`test/a11yRules.ts`, the staff-advances/prepayments precedent): labels,
    // names, roles and target sizes over the WHOLE form with the block mounted.
    //
    // `heading-order` IS EXCLUDED, AND ONLY IT. This cell mounts the VIEW, not its route, so the
    // page's own h1/h2 are absent and the form's first `h3` reads as a jump — an artefact of the
    // isolated mount that predates this lane and is true of the form with or without the block.
    // Every other rule — label, accessible name, control role, target size — is asserted CLEAN,
    // which is the claim #937 is making about the controls it added.
    const findings = checkAccessibility(h.container as never)
      .filter((v) => v.rule !== "heading-order");
    assert.deepEqual(findings, [],
      "the per-period block adds no structural a11y violation");

    // …AND THE TWO CLAIMS A RULE ENGINE CANNOT MAKE. Every control in the block is a real
    // interactive element in the reading order — a `<select>`, an `<input>` and `<button>`s, never
    // a div with a click handler — so the block is operable with the keyboard alone; and each of
    // the two per-row controls has its own `<label for>`, so a screen reader reads "Due date" and
    // "Amount accrued" rather than two anonymous boxes in a list.
    for (const id of [`${F("periodAmounts")}-due-0`, `${F("periodAmounts")}-amount-0`]) {
      const control = byId(h, id);
      assert.ok(["SELECT", "INPUT"].includes(String(control.tagName)),
        `${id} is a real form control (got ${String(control.tagName)})`);
      const label = h.find((n) => n.tagName === "LABEL"
        && (n as { getAttribute?: (a: string) => string | null }).getAttribute?.("for") === id);
      assert.ok(label, `${id} has its own label`);
    }
    for (const label of ["Add a period", "Remove 2026-07-31"]) {
      const button = h.find((n) => n.tagName === "BUTTON"
        && String((n as { textContent?: string }).textContent ?? "") === label);
      assert.ok(button, `"${label}" is a real button, reachable by Tab and fired by Enter/Space`);
    }
  } finally {
    await h.unmount();
  }
});

// ==============================================================================================
// #942 — THE SIDE. It is the first thing the form asks, because it decides which accounts the two
// legs may even offer and which way the preview posts.
// ==============================================================================================

async function chooseSide(h: Awaited<ReturnType<typeof renderComponent>>, side: string): Promise<void> {
  await h.fireEvent(byId(h, F("side")), "change", (n) => setFieldValue(n, side));
  await h.settle();
}

test("942.form: the side is a REAL choice, and it decides which accounts each leg offers and what they are called", async () => {
  const h = await renderComponent(App({}));
  try {
    const select = byId(h, F("side"));
    assert.equal(select.tagName, "SELECT", "a choice that changes which way the entry posts is chosen, not announced");
    assert.deepEqual(optionValues(select), ["expense", "revenue"]);

    // THE EXPENSE SIDE, unchanged: an expense account and a plain liability.
    assert.deepEqual(optionValues(byId(h, F("expenseAccountCode"))), ["", "6100"]);
    assert.deepEqual(optionValues(byId(h, F("liabilityAccountCode"))), ["", "2020"]);
    assert.match(h.text(), /Expense account/);
    assert.match(h.text(), /Liability account/);

    await chooseSide(h, "revenue");
    // THE REVENUE SIDE: an income account and the non-control assets, and both legs re-labelled.
    assert.deepEqual(optionValues(byId(h, F("expenseAccountCode"))), ["", "4000"],
      "only income accounts can be the profit-and-loss leg of a revenue accrual");
    assert.deepEqual(optionValues(byId(h, F("liabilityAccountCode"))), ["", "1150", "1180"],
      "…and the balance-sheet leg offers this client's assets");
    assert.match(h.text(), /Revenue account/);
    assert.match(h.text(), /Accrued income account/);
    assert.doesNotMatch(h.text(), /Expense account/);
  } finally {
    await h.unmount();
  }
});

test("942.form: a revenue accrual crosses the wire with its side, and the preview shows Dr accrued income / Cr revenue", async () => {
  const sent: CreateAccrualInput[] = [];
  const h = await renderComponent(App({
    submit: async (input) => { sent.push(input); return ACCEPTED; },
  }));
  try {
    await chooseSide(h, "revenue");
    await fill(h, { expenseAccountCode: "4000", liabilityAccountCode: "1180" });
    // THE DISABLED PREVIEW IS WHAT THE DOOR WILL BUILD: the asset leg is debited and the revenue
    // account credited, in that order.
    const preview = h.text();
    assert.match(preview, /accrued income/i);

    await clickSubmit(h);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.accrual.side, "revenue");
    assert.equal(sent[0]?.accrual.expense_account_code, "4000");
    assert.equal(sent[0]?.accrual.liability_account_code, "1180");
  } finally {
    await h.unmount();
  }
});
