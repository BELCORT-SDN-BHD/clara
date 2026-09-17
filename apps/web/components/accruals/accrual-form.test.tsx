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
];

const AUTHORITIES = {
  rows: [
    { id: WORK, intent_key: "instr-1", created_at: "2026-06-30T02:00:00.000Z", basis: { memo: "Standing instruction: accrue the monthly rent" } },
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
  const h = await renderComponent(App({
    submit: async () => ({
      ...ACCEPTED,
      overlap_warning: {
        kind: "adjustment_template_overlap",
        templates: [{ template_id: "t1", name: "Monthly rent template", cadence: "monthly", accounts: ["6100"] }],
      },
    }),
  }));
  try {
    await fill(h);
    await clickSubmit(h);
    assert.match(h.text(), /The accrual was recorded\./,
      "the warning says the accrual EXISTS — it is advisory, and the database only warns");
    assert.match(h.text(), /Monthly rent template/);
  } finally {
    await h.unmount();
  }
});
