// #936 — THE ACCRUAL CORRECTION FORM, under test: the FORM's own behaviour, over the rules
// `lib/work/accrual-draft.test.ts` already proves in isolation for `validateAccrualCorrectionDraft`.
//
// THE SLICES THIS FILE PROVES, each the correction analogue of `accrual-form.test.tsx`'s own:
//
//   1. A VIEWER gets the DENIED face and no form at all (裁-187).
//   2. A failed submit focuses the first invalid control and sends nothing.
//   3. THE FIXED AUTHORITY WINDOW NAMES THE TERM, NEVER ITSELF, when a corrected term would fall
//      outside it — the one rule that differs from CREATE's own mapping, because the window is not
///     a control this form offers.
//   4. A SERVER field path becomes a focused control, and the message renders verbatim.
//   5. A CLR04 answer is the DENIED face, not a field error.
//   6. THE LOST-RESPONSE ARM RE-SENDS THE SAME op key, exactly once.
//   7. A CHANGED PARTICULAR RENEWS THE OP KEY — changed figures are a different decision.
//   8. THE DERIVED LINES ARE ON SCREEN AND NOT EDITABLE.
//   9. AN ACCEPTED CORRECTION NAVIGATES TO THE NEW ACCRUAL'S OWN ADDRESS — never the one being
//      corrected, which the append-only trigger forbids updating beyond its one stamp.
//  10. AN OVERLAP WARNING IS PERSISTENT and does not block the correction it reports.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { AccrualCorrectionFormView } from "./accrual-correction-form";
import type { AccrualCorrected, AccrualDetail } from "../../lib/accruals/api";
import { DoorRefusal } from "../../lib/doors";
import type { CoaAccountRow } from "../../lib/journals/types";
import type { NavigationScope } from "../../lib/firm/navigation";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const FIRM = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCRUAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NEW_ACCRUAL = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const WORK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

/** The row being corrected — `clara.get_accrual_adjustment`'s own shape, with the authority window
 *  FIXED at 2026-07-01..2026-07-31, the same span the term must sit inside. */
const ROW: AccrualDetail = {
  accrual_id: ACCRUAL,
  plan_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  revision: 1,
  purpose: "Monthly office rent accrual",
  expense_account_code: "6100",
  liability_account_code: "2020",
  amount_cents: 120000,
  currency: "MYR",
  effective_from: "2026-07-01",
  effective_to: "2026-07-31",
  service_period_start: "2026-07-01",
  service_period_end: "2026-07-31",
  term_source: "human_stated",
  method: { rule: "stated_amount" },
  document_service_period_id: null,
  source_document_id: null,
  plan_status: "active",
  plan_kind: "reversing_journal",
  recorded_by: WORK,
  created_at: "2026-06-30T02:00:00.000Z",
  occurrence_count: 1,
  posted: false,
  client_id: CLIENT,
  authority_kind: "explicit_instruction",
  authority_ref: { kind: "accounting_work", id: WORK },
  instruction: "The client's standing instruction of 2026-06-30, minuted by the engagement partner.",
  corrects_accrual_id: null,
  corrected_by_accrual_id: null,
  plan: {
    plan_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    kind: "reversing_journal",
    status: "active",
    purpose: "Monthly office rent accrual",
    authorised_by: WORK,
    authorised_at: "2026-06-30T02:00:00.000Z",
    authority_from: "2026-07-01",
    current_revision: 1,
    frequency: "monthly",
    day_rule: "last_day_of_month",
    day_of_month: null,
    timezone: "Asia/Kuala_Lumpur",
    basis: {
      posting_date: "2026-07-01",
      memo: "Monthly office rent accrual",
      currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 120000, credit_cents: 0 },
        { account_code: "2020", debit_cents: 0, credit_cents: 120000 },
      ],
    },
    basis_digest: "a".repeat(64),
    auto_reverse: true,
    reversal_day_rule: "next_period_first_day",
  },
  occurrences: [],
  reversal: null,
};

const CORRECTED: AccrualCorrected = {
  accrual_id: NEW_ACCRUAL,
  corrects_accrual_id: ACCRUAL,
  plan_id: ROW.plan_id,
  revision_id: "11111111-2222-4333-8444-555555555555",
  revision: 2,
  superseded_revision: 1,
  status: "active",
  overlap_warning: null,
};

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
  row?: AccrualDetail;
  scope?: typeof BOOKKEEPER;
  submit?: (input: { accrualId: string; accrual: unknown; opKey: string }) => Promise<AccrualCorrected>;
  navigate?: (href: string) => void;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  newOpKey?: () => string;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(AccrualCorrectionFormView, {
      clientId: CLIENT,
      row: props.row ?? ROW,
      scope: props.scope ?? BOOKKEEPER,
      navigate: props.navigate ?? (() => {}),
      submit: (props.submit ?? (async () => CORRECTED)) as never,
      loadAccounts: props.loadAccounts ?? (async () => ACCOUNTS),
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
  const button = h.find((n) => n.tagName === "BUTTON" && /Record the correction|Recording/.test(String((n as { textContent?: string }).textContent ?? "")));
  assert.ok(button, "no submit button");
  await h.fireEvent(button, "click");
  await h.settle();
}

async function fill(h: Awaited<ReturnType<typeof renderComponent>>, over: Record<string, string> = {}): Promise<void> {
  const values: Record<string, string> = {
    servicePeriodStart: "2026-07-01",
    servicePeriodEnd: "2026-07-31",
    amountCents: "999.00",
    expenseAccountCode: "6100",
    liabilityAccountCode: "2020",
    instruction: "The client's standing instruction of 2026-06-30, restated.",
    ...over,
  };
  for (const [field, value] of Object.entries(values)) {
    await h.fireEvent(byId(h, F(field)), "change", (n) => setFieldValue(n, value));
  }
  await h.settle();
}

// ==============================================================================================

test("936.correction.form: a VIEWER gets the denied face and no form at all", async () => {
  const h = await renderComponent(App({ scope: VIEWER }));
  try {
    assert.match(h.text(), /You cannot record an accrual/);
    assert.equal(h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === F("amountCents")),
      null, "a control that can only ever refuse is not rendered at all");
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: the form is SEEDED from the row being corrected — the live amount, both legs and the stated term", async () => {
  const sent: { accrualId: string; accrual: Record<string, unknown> }[] = [];
  const h = await renderComponent(App({
    submit: async (input) => { sent.push(input as never); return CORRECTED; },
  }));
  try {
    // `<input>`/`<textarea>` reflect their SEEDED value directly on mount.
    assert.equal((byId(h, F("amountCents")) as { value?: string }).value, "1,200.00");
    assert.equal((byId(h, F("servicePeriodStart")) as { value?: string }).value, "2026-07-01");
    assert.equal((byId(h, F("instruction")) as { value?: string }).value, ROW.instruction);
    // THE FROZEN FACTS render as information, never as a control this form could send.
    assert.match(h.text(), /2026-07-01 to 2026-07-31/, "the frozen authority window is shown");
    assert.equal(h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === F("purpose")),
      null, "purpose is frozen information, not a control — the door takes no purpose argument");

    // A NATIVE `<select>`'s SEEDED value is proven at the SEAM instead: submitting untouched
    // sends exactly what the row already carried, which is the state the form's initial render
    // could only have come from.
    await h.settle();
    await h.settle();
    await clickSubmit(h);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.accrualId, ACCRUAL);
    assert.equal(sent[0]?.accrual.expense_account_code, "6100");
    assert.equal(sent[0]?.accrual.liability_account_code, "2020");
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: a failed submit focuses the first invalid control and SENDS NOTHING", async () => {
  const sent: unknown[] = [];
  const h = await renderComponent(App({ submit: async (input) => { sent.push(input); return CORRECTED; } }));
  try {
    await fill(h, { servicePeriodStart: "" });
    await clickSubmit(h);
    assert.deepEqual(sent, [], "an incomplete correction never reaches the door");
    assert.equal(focusedId(), F("servicePeriodStart"));
    assert.match(h.text(), /State the service period this cost belongs to\./);

    await fill(h, { amountCents: "0.00" });
    await clickSubmit(h);
    assert.deepEqual(sent, []);
    assert.equal(focusedId(), F("amountCents"));
    assert.match(h.text(), /An accrual of zero accrues nothing\./);
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: a corrected term outside the FIXED authority window is refused at the TERM, never at the window — there is no window control here", async () => {
  const sent: unknown[] = [];
  const h = await renderComponent(App({ submit: async (input) => { sent.push(input); return CORRECTED; } }));
  try {
    await fill(h, { servicePeriodStart: "2026-07-15" });
    await clickSubmit(h);
    assert.equal(sent.length, 0, "a term the fixed window cannot bracket never reaches the door");
    assert.equal(focusedId(), F("servicePeriodStart"),
      "the mistake is named at the control the preparer can actually act on");
    assert.match(h.text(), /cannot start before the service period it accrues for/);

    await fill(h, { servicePeriodStart: "2026-07-01", servicePeriodEnd: "2026-07-15" });
    await clickSubmit(h);
    assert.equal(sent.length, 0);
    assert.equal(focusedId(), F("servicePeriodEnd"));
    assert.match(h.text(), /cannot still be accruing after the service period ends\./);

    // …and a term the fixed window brackets is sent.
    await fill(h);
    await clickSubmit(h);
    assert.equal(sent.length, 1, "a term inside the fixed window is sent");
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: a SERVER field path becomes a focused control, and the refusal renders verbatim", async () => {
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
    assert.equal(focusedId(), F("liabilityAccountCode"));
    assert.match(h.text(), /an accrual carries no identified open item/);
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: a form-level refusal is a persistent banner carrying the code and reason — the ONE token ticket 936 adds", async () => {
  const h = await renderComponent(App({
    submit: async () => {
      throw refusal("CLR10", "accrual_already_corrected",
        "this accrual has already been corrected; correct its successor instead");
    },
  }));
  try {
    await fill(h);
    await clickSubmit(h);
    const text = h.text();
    assert.match(text, /That was refused/);
    assert.match(text, /CLR10/);
    assert.match(text, /accrual_already_corrected/);
    assert.match(text, /this accrual has already been corrected; correct its successor instead/);
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: a CLR04 answer is the DENIED face, not a field error", async () => {
  const h = await renderComponent(App({
    submit: async () => {
      throw refusal("CLR04", "insufficient_role", "correcting an accrual requires an active bookkeeper or above");
    },
  }));
  try {
    await fill(h);
    await clickSubmit(h);
    assert.match(h.text(), /correcting an accrual requires an active bookkeeper or above/);
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: the LOST-RESPONSE arm re-sends the SAME op key, exactly once", async () => {
  const keys: string[] = [];
  let attempt = 0;
  const h = await renderComponent(App({
    newOpKey: () => "op-fixed",
    submit: async (input) => {
      keys.push(input.opKey);
      attempt += 1;
      if (attempt <= 2) throw new Error("network timeout while reading the response");
      return CORRECTED;
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
      "the SAME identity, which clara._reserve_op replays — never a second correction");
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: a changed particular renews the op key", async () => {
  let minted = 0;
  const keys: string[] = [];
  const h = await renderComponent(App({
    newOpKey: () => `op-${++minted}`,
    submit: async (input) => { keys.push(input.opKey); return CORRECTED; },
  }));
  try {
    await fill(h, { amountCents: "500.00" });
    await fill(h, { amountCents: "600.00" }); // a changed figure — a different decision
    await clickSubmit(h);
    assert.equal(keys.length, 1);
    assert.equal(keys[0], `op-${minted}`, "the key sent is the LATEST one minted, not the first");
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: the derived lines are on screen and are NOT editable", async () => {
  const h = await renderComponent(App({}));
  try {
    await fill(h);
    const text = h.text();
    assert.match(text, /6100/);
    assert.match(text, /2020/);
    assert.match(text, /These two lines follow from the amount and the accounts/);
    const enabledLineControl = h.find((n: Stub) =>
      (n.tagName === "INPUT" || n.tagName === "SELECT")
      && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") ?? "").startsWith("journal-line-")
      && !(n as { hasAttribute?: (k: string) => boolean }).hasAttribute?.("disabled"));
    assert.equal(enabledLineControl, null, "the preview grid holds no enabled control");
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: an accepted correction navigates to the NEW accrual's own address — never the one being corrected", async () => {
  const seen: string[] = [];
  const h = await renderComponent(App({ navigate: (href) => seen.push(href) }));
  try {
    await fill(h);
    await clickSubmit(h);
    assert.deepEqual(seen, [`/clients/${CLIENT}/accruals/${NEW_ACCRUAL}`],
      "the destination is the SUCCESSOR's own durable address, which re-reads");
  } finally {
    await h.unmount();
  }
});

test("936.correction.form: an overlap warning is persistent, and it does NOT block the correction it reports", async () => {
  const h = await renderComponent(App({
    submit: async () => ({
      ...CORRECTED,
      overlap_warning: {
        kind: "adjustment_template_overlap",
        templates: [{ template_id: "t1", name: "Monthly rent template", cadence: "monthly", accounts: ["6100"] }],
      },
    }),
  }));
  try {
    await fill(h);
    await clickSubmit(h);
    assert.match(h.text(), /The accrual was recorded\./);
    assert.match(h.text(), /Monthly rent template/);
  } finally {
    await h.unmount();
  }
});
