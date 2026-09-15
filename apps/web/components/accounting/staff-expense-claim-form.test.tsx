// #638 — the staff-expense-claim form, under test: the FORM's own behaviour, over the rules
// `lib/work/staff-expense-claim.test.ts` already proves in isolation.
//
// SEVEN THINGS ONLY A MOUNTED FORM CAN PROVE, and each has its own cell:
//   1. A VIEWER gets the DENIED state and no form at all (裁-187: a control that can only refuse is
//      not offered; the route still renders, because an address a human typed deserves an answer).
//   2. A failed submit MOVES FOCUS to the first invalid control and sends nothing (§3: "Focus the
//      first invalid field").
//   3. A SERVER field path becomes a FOCUSED control, in BOTH spellings — the camelCase the route
//      re-spells and the snake_case the database raises — including the nested claimant paths and
//      the 1-based item paths. A refusal that focuses nothing is a refusal a preparer has to hunt
//      for.
//   4. THE LOST-RESPONSE REPLAY carries the SAME intent key. The whole idempotency story rests on
//      it, and no unit cell over a pure function can catch a second key.
//   5. THE SETTLEMENT SWITCH KEEPS EVERY ARM'S TYPED VALUE, and the SUBMITTED body carries only the
//      active one (appendix D #46).
//   6. THE DERIVED ENTRY IS ON SCREEN AND IS NOT EDITABLE, and the browser sends NO lines at all —
//      the door derives them, which is why a preview is the honest shape.
//   7. Each server answer renders as an INLINE `StateBanner` with the right next action — never a
//      toast. A stale claim (`intent_payload_conflict`) offers a NEW draft and a link, never a
//      resubmit of the same key.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setCheckboxChecked, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { StaffExpenseClaimFormView } from "./staff-expense-claim-form";
import { claimDraftKey } from "../../lib/work/staff-expense-claim-draft";
import type { DraftStorage } from "../../lib/work/journal-draft";
import type { SubmitClaimWorkResult } from "../../lib/work/api";
import type { CoaAccountRow } from "../../lib/journals/types";
import type { NavigationScope } from "../../lib/firm/navigation";
import type { StaffAdvanceEnrolmentRow } from "../../lib/work/staff-expense-claim-reads";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const USER = "11111111-1111-4111-8111-111111111111";
const FIRM = "22222222-2222-4222-8222-222222222222";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADVANCE = "33333333-3333-4333-8333-333333333333";

const BOOKKEEPER: NavigationScope & { firm_id?: string; user_id?: string } = {
  role_rank: 1,
  is_operator: false,
  firm_id: FIRM,
  user_id: USER,
};
const VIEWER: typeof BOOKKEEPER = { ...BOOKKEEPER, role_rank: 0 };

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: CLIENT, account_code: "6200", name: "Travel and Accommodation", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "6210", name: "Staff Meals", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "2010", name: "Other Payables", account_type: "liability", is_active: true },
  { client_id: CLIENT, account_code: "1150", name: "Maybank current", account_type: "asset", is_active: true },
  { client_id: CLIENT, account_code: "1190", name: "Staff advance — Farah", account_type: "asset", is_active: true },
  { client_id: CLIENT, account_code: "1191", name: "Staff advance — new", account_type: "asset", is_active: true },
];

/** One LIVE enrolment: `1190` is Farah's, `1191` is not enrolled at all. */
const ENROLMENTS: StaffAdvanceEnrolmentRow[] = [
  { id: "44444444-4444-4444-8444-444444444444", account_code: "1190", person_label: "Farah binti Idris" },
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
  claim: Record<string, unknown>;
  sourceRefs?: ReadonlyArray<{ kind: string; documentId: string }>;
};

function App(props: {
  scope?: typeof BOOKKEEPER;
  submit?: (auth: unknown, input: Submitted) => Promise<SubmitClaimWorkResult>;
  navigate?: (href: string) => void;
  storage?: DraftStorage | null;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  loadEnrolments?: () => Promise<StaffAdvanceEnrolmentRow[] | null>;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(StaffExpenseClaimFormView, {
      clientId: CLIENT,
      scope: props.scope ?? BOOKKEEPER,
      navigate: props.navigate ?? (() => {}),
      submit: (props.submit ?? (async () => ({ kind: "denied" }) as SubmitClaimWorkResult)) as never,
      storage: props.storage ?? null,
      loadAccounts: props.loadAccounts ?? (async () => ACCOUNTS),
      loadEnrolments: props.loadEnrolments ?? (async () => ENROLMENTS),
      // Rendered with a real, successful, EMPTY documents read — the state a client with no filed
      // documents is genuinely in, and the state C1's "genuinely optional" attachment must survive.
      loadDocuments: (async () => []) as never,
      loadSpokenFor: (async () => []) as never,
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

/** The form's own SUBMIT, fired at the form — the house idiom (a click on a `type="submit"` button
 *  has no default action in this harness's stub DOM). */
async function submitForm(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const form = h.find((n) => n.tagName === "FORM");
  assert.ok(form, "no form");
  await h.fireEvent(form, "submit");
  await h.settle();
}

const F = (field: string) => `staff-expense-claim-${field.replace(/\./g, "-")}`;

/** A clean reimbursement claim: one item, RM 480.00, on Farah's existing enrolment. */
async function fillClaim(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  await h.fireEvent(byId(h, F("claimantAccountCode")), "change", (n) => setFieldValue(n, "1190"));
  await h.fireEvent(byId(h, F("incurredDate")), "change", (n) => setFieldValue(n, "2026-03-04"));
  await h.fireEvent(byId(h, F("postingDate")), "change", (n) => setFieldValue(n, "2026-03-31"));
  await h.fireEvent(byId(h, F("items.0.description")), "change", (n) => setFieldValue(n, "KL–Penang flight"));
  await h.fireEvent(byId(h, F("items.0.expenseAccountCode")), "change", (n) => setFieldValue(n, "6200"));
  await h.fireEvent(byId(h, F("items.0.amountCents")), "change", (n) => setFieldValue(n, "480.00"));
  await h.fireEvent(byId(h, F("instruction")), "change", (n) => setFieldValue(n, "Farah's March travel claim."));
}

test("a VIEWER gets the denied state and NO form at all", async () => {
  const h = await renderComponent(App({ scope: VIEWER }));
  try {
    assert.match(h.text(), /You cannot record a journal entry for this client/);
    assert.equal(
      h.find((n) => n.tagName === "BUTTON"
        && (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("type") === "submit"),
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
    assert.equal(focusedId(), F("claimantAccountCode"), "who claimed is the first thing the form asks");
    assert.match(h.text(), /Choose an account\./);
  } finally {
    await h.unmount();
  }
});

test("a NEW claimant is asked for the three things the register needs, BEFORE admission", async () => {
  let sent: Submitted | null = null;
  const h = await renderComponent(App({
    submit: async (_a, input) => { sent = input; return { kind: "accepted", workId: "w", taskId: null, logicalOpId: null, status: "queued", replayed: false, claimId: "c" }; },
  }));
  try {
    await h.settle();
    // `1191` carries no live enrolment — recording this claim would ENROL it.
    await h.fireEvent(byId(h, F("claimantAccountCode")), "change", (n) => setFieldValue(n, "1191"));
    await h.settle();
    assert.match(h.text(), /This account has no enrolment yet/,
      "the form says WHY it is suddenly asking for more");
    await h.fireEvent(byId(h, F("incurredDate")), "change", (n) => setFieldValue(n, "2026-03-04"));
    await h.fireEvent(byId(h, F("postingDate")), "change", (n) => setFieldValue(n, "2026-03-31"));
    await h.fireEvent(byId(h, F("items.0.description")), "change", (n) => setFieldValue(n, "Flight"));
    await h.fireEvent(byId(h, F("items.0.expenseAccountCode")), "change", (n) => setFieldValue(n, "6200"));
    await h.fireEvent(byId(h, F("items.0.amountCents")), "change", (n) => setFieldValue(n, "480.00"));
    await h.fireEvent(byId(h, F("instruction")), "change", (n) => setFieldValue(n, "A new claimant."));
    await submitForm(h);
    assert.equal(sent, null, "nothing is sent until the register's own three answers are there");
    assert.equal(focusedId(), F("claimantPersonLabel"));

    await h.fireEvent(byId(h, F("claimantPersonLabel")), "change", (n) => setFieldValue(n, "Nur Amirah"));
    await h.fireEvent(byId(h, F("claimantAttestation")), "change",
      (n) => setFieldValue(n, "Dedicated to Nur Amirah; not a related-party balance."));
    // THE HARNESS'S OWN CHECKBOX HELPER, not a hand-rolled mutation: a controlled checkbox
    // re-renders from state, so setting `.checked` and hoping is exactly the shape that passes
    // while driving nothing.
    setCheckboxChecked(byId(h, F("claimantConfirmDedicated")), true);
    await h.settle();
    await submitForm(h);
    assert.ok(sent, "…and it IS sent once they are");
    const claimant = (sent as unknown as Submitted).claim.claimant as Record<string, unknown>;
    assert.equal(claimant.accountCode, "1191");
    assert.equal(claimant.personLabel, "Nur Amirah");
    assert.equal(claimant.confirmDedicated, true);
    assert.match(String(claimant.attestation), /related-party/);
  } finally {
    await h.unmount();
  }
});

test("a SERVER field path becomes a FOCUSED control, in both spellings and at every depth", async () => {
  for (const [path, control] of [
    ["claim.incurred_date", F("incurredDate")],
    ["claim.incurredDate", F("incurredDate")],
    ["claim.items[1].expense_account_code", F("items.0.expenseAccountCode")],
    ["claim.payable_account_code", F("payableAccountCode")],
  ] as const) {
    const h = await renderComponent(App({
      submit: async () => ({ kind: "invalid_basis", field: path, reason: "item_account_not_expense" }),
    }));
    try {
      await h.settle();
      await fillClaim(h);
      await submitForm(h);
      assert.equal(focusedId(), control, `${path} must focus ${control}`);
      assert.match(h.text(), /The server did not accept this claim/,
        "a business refusal is an inline state, never a toast");
      assert.match(h.text(), /item_account_not_expense/,
        "…carrying the database's own reason verbatim rather than a re-worded one");
    } finally {
      await h.unmount();
    }
  }
});

test("a LOST response is resolved by re-sending the SAME intent key, exactly once", async () => {
  const keys: string[] = [];
  let n = 0;
  const h = await renderComponent(App({
    submit: async (_a, input) => {
      keys.push(input.intentKey);
      n += 1;
      return n === 1
        ? { kind: "lost", message: "socket closed" }
        : { kind: "accepted", workId: "w1", taskId: null, logicalOpId: null, status: "queued", replayed: true, claimId: "c1" };
    },
  }));
  try {
    await h.settle();
    await fillClaim(h);
    await submitForm(h);
    assert.equal(keys.length, 2, "exactly twice — never a third attempt of its own accord");
    assert.equal(keys[0], keys[1], "the SAME identity: a replay must resolve, not admit a second Work");
  } finally {
    await h.unmount();
  }
});

test("the SETTLEMENT switch keeps every arm's typed value, and only the active leg is sent", async () => {
  // THE SWITCH IS STRUCTURAL, and this cell proves the two halves a mounted form owns. That the
  // DRAFT holds every arm is `lib/work/staff-expense-claim.test.ts`'s (one flat `ClaimDraft`); what
  // only a mount can show is that the RESTORED draft still carries the reimbursement account while
  // the advance arm is active, and that the submitted body carries ONLY the active leg.
  const store = memoryStorage();
  const key = claimDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT });
  store.map.set(key, JSON.stringify({
    intentKey: "k-switch",
    documentId: null,
    draft: {
      settlement: "advance_application",
      claimantEnrolmentId: "",
      claimantAccountCode: "1190",
      claimantPersonLabel: "",
      claimantAttestation: "",
      claimantConfirmDedicated: false,
      claimantIdentifier: "",
      sourceKind: "instruction",
      instruction: "Farah's March travel claim.",
      incurredDate: "2026-03-04",
      postingDate: "2026-03-31",
      items: [{
        description: "KL–Penang flight", expenseAccountCode: "6200", amountCents: 48000,
        suppliedTaxNote: "", incurredDate: "", pendingFact: "",
      }],
      // TYPED IN THE OTHER ARM, AND STILL HERE. A switch that discarded it would punish a
      // correction (appendix D #46).
      payableAccountCode: "2010",
      advanceAccountCode: "1190",
      advanceId: ADVANCE,
      paymentAccountCode: "",
    },
  }));

  let sent: Submitted | null = null;
  const h = await renderComponent(App({
    storage: store,
    submit: async (_a, input) => { sent = input; return { kind: "accepted", workId: "w", taskId: null, logicalOpId: null, status: "queued", replayed: false, claimId: "c" }; },
  }));
  try {
    await h.settle();
    // ALL THREE SETTLEMENTS ARE OFFERED, as a Radio Group of durable options with a FieldSet legend
    // (appendix D #46). Asserted by the words on screen rather than by a DOM attribute: Base UI's
    // radio renders its value as internal state, and a cell that queried an attribute the primitive
    // does not emit would be green about nothing.
    assert.match(h.text(), /How is this claim settled\?/, "the FieldSet legend names the choice");
    for (const label of ["The firm owes the claimant", "It discharges an advance they already hold",
      "They have already been paid"]) {
      assert.ok(h.text().includes(label), `the settlement group offers "${label}"`);
    }
    // The ACTIVE arm's two controls are rendered, and the one that is a plain input carries its
    // restored value. (The account control is a native <select>, whose selected value this stub DOM
    // does not mirror onto `.value` — so it is asserted where it actually matters, in the SUBMITTED
    // body below, rather than through a property the harness does not model.)
    byId(h, F("advanceAccountCode"));
    assert.equal((byId(h, F("advanceId")) as { value?: unknown }).value, ADVANCE);
    // …and the OTHER arm's control is simply not mounted, while its value survives in the draft.
    assert.equal(
      h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === F("payableAccountCode")),
      null,
      "only the active arm's leg is on screen",
    );

    await submitForm(h);
    assert.ok(sent);
    const claim = (sent as unknown as Submitted).claim;
    assert.equal(claim.settlement, "advance_application");
    assert.equal(claim.advanceAccountCode, "1190");
    assert.equal(claim.advanceId, ADVANCE);
    assert.equal(claim.payableAccountCode, undefined, "only the ACTIVE arm's leg crosses the wire");
    const stored = JSON.parse(store.map.get(key) ?? "null") as { draft: { payableAccountCode: string } } | null;
    // The draft is retired on acceptance, so the preservation is asserted from the LAST write
    // before it: the form persisted on every edit and never dropped the other arm's account.
    assert.equal(stored, null, "the draft is retired only once the runtime named the Work");
  } finally {
    await h.unmount();
  }
});

test("the derived entry is ON SCREEN and the browser sends NO lines at all", async () => {
  let sent: Submitted | null = null;
  const h = await renderComponent(App({
    submit: async (_a, input) => { sent = input; return { kind: "accepted", workId: "w", taskId: null, logicalOpId: null, status: "queued", replayed: false, claimId: "c" }; },
  }));
  try {
    await h.settle();
    await fillClaim(h);
    assert.match(h.text(), /The entry this claim produces/);
    assert.match(h.text(), /480\.00/, "the claim total is shown from exact minor units");
    await submitForm(h);
    assert.ok(sent);
    const body = sent as unknown as Submitted;
    assert.equal((body as unknown as { basis?: unknown }).basis, undefined,
      "the DOOR derives the journal: a browser-sent basis would be a second, drifting statement");
    assert.equal((body.claim as { amountCents?: unknown }).amountCents, undefined,
      "…and the total with it");
    assert.deepEqual((body.claim.items as Array<Record<string, unknown>>)[0], {
      description: "KL–Penang flight", expenseAccountCode: "6200", amountCents: 48000,
    });
  } finally {
    await h.unmount();
  }
});

test("a STALE claim under one intent key offers a NEW draft and a link, never a resubmit", async () => {
  const keys: string[] = [];
  const h = await renderComponent(App({
    submit: async (_a, input) => {
      keys.push(input.intentKey);
      return { kind: "conflict", workId: "99999999-9999-4999-8999-999999999999" };
    },
  }));
  try {
    await h.settle();
    await fillClaim(h);
    await submitForm(h);
    assert.match(h.text(), /already/i, "the conflict is an inline state that says what happened");
    const link = h.find((n) => n.tagName === "A"
      && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "")
        .includes("99999999-9999-4999-8999-999999999999"));
    assert.ok(link, "…and it NAMES the Work that key already holds");
    assert.equal(keys.length, 1, "a conflict never re-sends the same key of its own accord");
  } finally {
    await h.unmount();
  }
});

test("the DRAFT survives a remount under the same scope, and carries its intent key with it", async () => {
  const store = memoryStorage();
  const first = await renderComponent(App({ storage: store }));
  try {
    await first.settle();
    await fillClaim(first);
    await first.settle();
  } finally {
    await first.unmount();
  }
  const key = claimDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT });
  const stored = JSON.parse(store.map.get(key) ?? "null") as { intentKey: string; draft: { items: Array<{ description: string }> } };
  assert.ok(stored, "the draft is filed under the user+firm+client scope key");
  assert.equal(stored.draft.items[0].description, "KL–Penang flight");

  let sent: Submitted | null = null;
  const second = await renderComponent(App({
    storage: store,
    submit: async (_a, input) => { sent = input; return { kind: "accepted", workId: "w", taskId: null, logicalOpId: null, status: "queued", replayed: false, claimId: "c" }; },
  }));
  try {
    await second.settle();
    assert.equal((byId(second, F("items.0.description")) as { value?: unknown }).value, "KL–Penang flight",
      "a remount restores what was typed rather than flashing an empty form");
    await submitForm(second);
    assert.ok(sent);
    assert.equal((sent as unknown as Submitted).intentKey, stored.intentKey,
      "…under the SAME intent identity, so a reload cannot admit a second Work");
    assert.equal(store.map.get(key), undefined, "and the draft is retired only once the runtime named the Work");
  } finally {
    await second.unmount();
  }
});
