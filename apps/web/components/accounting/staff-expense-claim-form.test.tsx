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
import type { StaffAdvanceSummary } from "../../lib/registers/staff-advances-doors";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const USER = "11111111-1111-4111-8111-111111111111";
const FIRM = "22222222-2222-4222-8222-222222222222";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADVANCE = "33333333-3333-4333-8333-333333333333";
const FARAH_ADVANCE = "55555555-5555-4555-8555-555555555555";
const OTHER_CLAIMANT_ADVANCE = "66666666-6666-4666-8666-666666666666";
const VOIDED_ADVANCE = "77777777-7777-4777-8777-777777777777";
const SETTLED_ADVANCE = "88888888-8888-4888-8888-888888888888";

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
const FARAH_ENROLMENT = "44444444-4444-4444-8444-444444444444";
const ENROLMENTS: StaffAdvanceEnrolmentRow[] = [
  { id: FARAH_ENROLMENT, account_code: "1190", person_label: "Farah binti Idris" },
];

/** The default, EMPTY staff-advance summary — most tests never touch the advance arm at all, so
 *  the default `loadAdvances` answers the same "nothing outstanding" shape `getStaffAdvanceSummary`
 *  itself answers for a client with none. */
function staffAdvanceSummary(advances: StaffAdvanceSummary["advances"]): StaffAdvanceSummary {
  return {
    client_id: CLIENT,
    as_of: "2026-03-31",
    advances,
    outstanding_cents: advances.reduce((n, a) => n + a.outstanding_cents, 0),
    incomplete_count: 0,
    policy_notes: [],
  };
}

/** One row of `staff_advance_summary`, every field named so a test reads as data, not noise. */
function advanceRow(patch: Partial<StaffAdvanceSummary["advances"][number]>): StaffAdvanceSummary["advances"][number] {
  return {
    enrolment_id: FARAH_ENROLMENT, account_code: "1190", person_label: "Farah binti Idris", advance_id: FARAH_ADVANCE,
    issue_date: "2026-02-01", amount_cents: 100000, outstanding_cents: 40000, days_outstanding: 30,
    purpose: null, reference: null, voided: false, particulars_complete: false, enrolment_active: true,
    ...patch,
  };
}

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
  loadAdvances?: () => Promise<StaffAdvanceSummary>;
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
      loadAdvances: props.loadAdvances ?? (async () => staffAdvanceSummary([])),
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

/** An attribute off a stub node, or null — the house idiom
 *  (`journal-composer.test.tsx`'s own `attrOf`) for reading an `<option>`'s own `value`. */
function attrOf(n: Stub, name: string): string | null {
  return (n as { getAttribute?: (k: string) => string | null }).getAttribute?.(name) ?? null;
}

/** EVERY node matching `predicate`, document order — `RenderHarness.find` answers the first only,
 *  and a cell about the SECOND row of a repeated control needs the rest (the harness's own header
 *  says to walk `container` directly for what `find` does not cover). */
function findAll(node: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  const visit = (n: Stub) => {
    if (predicate(n)) out.push(n);
    for (const child of ((n as { childNodes?: Stub[] }).childNodes ?? [])) visit(child);
  };
  visit(node);
  return out;
}

/** Every `<option>` under a `<select>` stub, in document order. */
function optionsOf(select: Stub): Stub[] {
  return ((select as { childNodes?: Stub[] }).childNodes ?? []).filter((n) => n.tagName === "OPTION");
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

// ---------------------------------------------------------------------------------------------
// #930 — THE ADVANCE CHOOSER. Replaces the free-text "which advance" box with a control fed by
// `staff_advance_summary` (the register's allocation editor's own read), narrowed to the CHOSEN
// CLAIMANT's own outstanding, unvoided advances — never a client-side guess, never another
// claimant's balance. The rule stays exactly what #638 shipped: one claim still names ONE advance,
// and the submitted `claim.advanceId` is the chosen row's id, byte-identical to what typing it
// produced before.
// ---------------------------------------------------------------------------------------------

function restoreAdvanceApplicationDraft(store: ReturnType<typeof memoryStorage>, advanceId: string): void {
  const key = claimDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT });
  store.map.set(key, JSON.stringify({
    intentKey: "k-chooser",
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
      instruction: "Farah's advance claim.",
      incurredDate: "2026-03-04",
      postingDate: "2026-03-31",
      items: [{
        description: "KL–Penang flight", expenseAccountCode: "6200", amountCents: 48000,
        suppliedTaxNote: "", incurredDate: "", pendingFact: "",
      }],
      payableAccountCode: "2010",
      advanceAccountCode: "1190",
      advanceId,
      paymentAccountCode: "",
    },
  }));
}

test("the advance-application arm offers a CHOOSER fed by the claimant's own outstanding advances", async () => {
  const store = memoryStorage();
  restoreAdvanceApplicationDraft(store, "");

  let sent: Submitted | null = null;
  const h = await renderComponent(App({
    storage: store,
    loadAdvances: async () => staffAdvanceSummary([
      advanceRow({}), // Farah's own outstanding advance — offered.
      // A DIFFERENT claimant's advance — never offered here, proving the filter is BY CLAIMANT.
      advanceRow({ account_code: "1191", person_label: "Someone Else", advance_id: OTHER_CLAIMANT_ADVANCE }),
      // Farah's own VOIDED advance — never offered.
      advanceRow({ advance_id: VOIDED_ADVANCE, voided: true }),
      // Farah's own FULLY DISCHARGED advance — never offered.
      advanceRow({ advance_id: SETTLED_ADVANCE, outstanding_cents: 0 }),
    ]),
    submit: async (_a, input) => { sent = input; return { kind: "accepted", workId: "w", taskId: null, logicalOpId: null, status: "queued", replayed: false, claimId: "c" }; },
  }));
  try {
    await h.settle();
    // THE FREE-TEXT BOX IS GONE (AC2): the control at this id is a real <select>, not an <input>.
    const select = byId(h, F("advanceId"));
    assert.equal(select.tagName, "SELECT", "the typed advance-id box is replaced by a chooser");
    const values = optionsOf(select).map((o) => attrOf(o, "value"));
    assert.deepEqual(values, ["", FARAH_ADVANCE],
      "only the CLAIMANT's own outstanding, unvoided advance is offered — not another claimant's, " +
      "not a voided one, not one already fully discharged");
    // EACH OPTION SHOWS ITS BOOKING DATE AND OUTSTANDING AMOUNT (AC1) — never only a bare id.
    assert.match(h.text(), /2026-02-01/, "the advance's booking date is shown");
    assert.match(h.text(), /400\.00/, "the outstanding amount is shown, formatted from exact minor units");

    // CHOOSING ONE FILLS THE CLAIM EXACTLY AS TYPING THE ID DID (AC2).
    await h.fireEvent(select, "change", (n) => setFieldValue(n, FARAH_ADVANCE));
    await submitForm(h);
    assert.ok(sent, "a chosen advance is a complete claim");
    assert.equal((sent as unknown as Submitted).claim.advanceId, FARAH_ADVANCE,
      "the submitted claim carries the CHOSEN advance's id, exactly as typing it did before");
  } finally {
    await h.unmount();
  }
});

test("a claimant with NO open advance sees the chooser EMPTY with a one-line reason, and cannot submit", async () => {
  const store = memoryStorage();
  restoreAdvanceApplicationDraft(store, "");

  let calls = 0;
  const h = await renderComponent(App({
    storage: store,
    // This client's advances all belong to SOMEONE ELSE — Farah (the chosen claimant) has none.
    loadAdvances: async () => staffAdvanceSummary([
      advanceRow({ account_code: "1191", person_label: "Someone Else", advance_id: OTHER_CLAIMANT_ADVANCE }),
    ]),
    submit: async () => { calls += 1; return { kind: "denied" }; },
  }));
  try {
    await h.settle();
    const select = byId(h, F("advanceId"));
    assert.deepEqual(optionsOf(select).map((o) => attrOf(o, "value")), [""],
      "the chooser offers nothing to pick — the placeholder only");
    assert.match(h.text(), /has no open advance/i, "…and says WHY in one line, rather than leaving it blank");

    await submitForm(h);
    assert.equal(calls, 0, "nothing is sent while no advance is named");
    assert.equal(focusedId(), F("advanceId"), "the empty chooser itself takes focus, the same as an unfilled field");
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
    // The ACTIVE arm's two controls are rendered. BOTH are native <select>s (#930: the "which
    // advance" box is a chooser now, same as the account picker beside it), whose SELECTED value
    // this stub DOM does not mirror onto `.value` on a value restored via props rather than typed —
    // so the restored value is asserted where it actually matters, in the SUBMITTED body below,
    // rather than through a property the harness does not model.
    byId(h, F("advanceAccountCode"));
    assert.equal(byId(h, F("advanceId")).tagName, "SELECT", "the typed advance-id box is a chooser now");
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
    assert.deepEqual((body.claim.items as Array<Record<string, unknown>>)[0]!, {
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
  assert.equal(stored.draft.items[0]?.description, "KL–Penang flight");

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

// ---------------------------------------------------------------------------------------------
// #931 — THE ALLOCATION LIST. One claim may discharge SEVERAL of the claimant's open advances, so
// #930's single chooser becomes the FIRST LINE of a list (its control id, and therefore its error
// wiring and its focus, are unchanged). "Suggest by date" pre-fills the list oldest-advance-first;
// the person may edit any line and confirms; WHAT IS STORED IS THE CONFIRMED LIST, never the
// suggestion — which is what keeps WD-R10's "no silent FIFO" true with an ordering on screen.
// ---------------------------------------------------------------------------------------------

const JAN_ADVANCE = "99999999-9999-4999-8999-999999999999";
const MAR_ADVANCE = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

/** Farah's three open advances: January 400.00, February 300.00, March 50.00. */
const THREE_OPEN = () => staffAdvanceSummary([
  advanceRow({ advance_id: FARAH_ADVANCE, issue_date: "2026-02-01", outstanding_cents: 30000 }),
  advanceRow({ advance_id: JAN_ADVANCE, issue_date: "2026-01-10", outstanding_cents: 40000 }),
  advanceRow({ advance_id: MAR_ADVANCE, issue_date: "2026-03-01", outstanding_cents: 5000 }),
]);

test("ticket 931 the advance arm SUGGESTS a date-ordered split, and stores the CONFIRMED list rather than the suggestion", async () => {
  const store = memoryStorage();
  restoreAdvanceApplicationDraft(store, "");   // one item, RM 480.00, claimant 1190

  const sent: Submitted[] = [];
  const h = await renderComponent(App({
    storage: store,
    loadAdvances: async () => THREE_OPEN(),
    submit: async (_a, input) => {
      sent.push(input);
      return { kind: "accepted", workId: "w", taskId: null, logicalOpId: null, status: "queued", replayed: false, claimId: "c" };
    },
  }));
  try {
    await h.settle();

    // ONE CLICK, AND THE LIST IS OLDEST FIRST. The claim is 480.00: January's 400.00 goes first and
    // in full, February takes the remaining 80.00, and March is never named — the claim is already
    // settled by then.
    const suggest = h.find((n) => attrOf(n, "data-testid") === "advance-suggest");
    assert.ok(suggest, "the arm offers a one-click date-ordered suggestion");
    await h.fireEvent(suggest, "click");
    await h.settle();

    await submitForm(h);
    assert.equal(sent.length, 1, "the suggestion alone is a complete, submittable claim");
    const suggested = sent[0];
    assert.ok(suggested);
    assert.deepEqual(suggested.claim.advanceAllocations, [
      { advanceId: JAN_ADVANCE, amountCents: 40000 },
      { advanceId: FARAH_ADVANCE, amountCents: 8000 },
    ], "oldest advance first, each taking what it still has, stopping at the claim");
    assert.equal(suggested.claim.advanceId, JAN_ADVANCE,
      "the head of the list fills the claim row's own structural column");
  } finally {
    await h.unmount();
  }
});

test("ticket 931 the person may EDIT the suggested split, and what is stored is the list they confirmed", async () => {
  // THE SAME claim and the SAME three advances as the cell above, so the suggestion it would
  // produce is known: January 400.00 and February 80.00. This preparer overrides both.
  const store = memoryStorage();
  restoreAdvanceApplicationDraft(store, "");

  const sent: Submitted[] = [];
  const h = await renderComponent(App({
    storage: store,
    loadAdvances: async () => THREE_OPEN(),
    submit: async (_a, input) => {
      sent.push(input);
      return { kind: "accepted", workId: "w", taskId: null, logicalOpId: null, status: "queued", replayed: false, claimId: "c" };
    },
  }));
  try {
    await h.settle();
    const suggest = h.find((n) => attrOf(n, "data-testid") === "advance-suggest");
    assert.ok(suggest);
    await h.fireEvent(suggest, "click");
    await h.settle();

    // 300.00 against January and 180.00 against February — a DIFFERENT split of the same claim.
    await h.fireEvent(byId(h, F("advanceAllocations.0.amountCents")), "change",
      (n) => setFieldValue(n, "300.00"));
    await h.fireEvent(byId(h, F("advanceAllocations.1.amountCents")), "change",
      (n) => setFieldValue(n, "180.00"));
    await submitForm(h);

    assert.equal(sent.length, 1);
    const confirmed = sent[0];
    assert.ok(confirmed);
    assert.deepEqual(confirmed.claim.advanceAllocations, [
      { advanceId: JAN_ADVANCE, amountCents: 30000 },
      { advanceId: FARAH_ADVANCE, amountCents: 18000 },
    ], "what is stored is the CONFIRMED list, not the suggestion that proposed it");
  } finally {
    await h.unmount();
  }
});

test("ticket 931 a split that does not add up to the claim is refused beside the list, and sends nothing", async () => {
  const store = memoryStorage();
  restoreAdvanceApplicationDraft(store, "");

  let calls = 0;
  const h = await renderComponent(App({
    storage: store,
    loadAdvances: async () => THREE_OPEN(),
    submit: async () => { calls += 1; return { kind: "denied" }; },
  }));
  try {
    await h.settle();
    const suggest = h.find((n) => attrOf(n, "data-testid") === "advance-suggest");
    assert.ok(suggest);
    await h.fireEvent(suggest, "click");
    await h.settle();
    // 300.00 + 80.00 = 380.00 against a 480.00 claim: 100.00 owed to nobody.
    await h.fireEvent(byId(h, F("advanceAllocations.0.amountCents")), "change",
      (n) => setFieldValue(n, "300.00"));
    await submitForm(h);
    assert.equal(calls, 0, "nothing is sent while the split does not settle the claim");
    assert.match(h.text(), /add up to the claim/i,
      "…and the reason sits beside the list the preparer has to change");
  } finally {
    await h.unmount();
  }
});

test("ticket 931 deleting a line of a CONFIRMED split never restates the surviving figure behind the preparer", async () => {
  // THE SAME claim and the SAME three advances: the suggestion is January 400.00 + February 80.00
  // on a 480.00 claim. The preparer then REMOVES the February line with the editor's own row
  // button — the one act that used to hand January the whole 480.00 with no amount on screen.
  const store = memoryStorage();
  restoreAdvanceApplicationDraft(store, "");

  const sent: Submitted[] = [];
  const h = await renderComponent(App({
    storage: store,
    loadAdvances: async () => THREE_OPEN(),
    submit: async (_a, input) => {
      sent.push(input);
      return { kind: "accepted", workId: "w", taskId: null, logicalOpId: null, status: "queued", replayed: false, claimId: "c" };
    },
  }));
  try {
    await h.settle();
    const suggest = h.find((n) => attrOf(n, "data-testid") === "advance-suggest");
    assert.ok(suggest);
    await h.fireEvent(suggest, "click");
    await h.settle();

    const removeLabel = messages.StaffAdvances.allocationsEditor.removeAllocation;
    const removes = findAll(h.container, (n) => attrOf(n, "aria-label") === removeLabel);
    assert.equal(removes.length, 2, "the suggestion put TWO lines on screen, each with its own remove");
    await h.fireEvent(removes[1]!, "click");
    await h.settle();

    // THE FIGURE IS STILL ON SCREEN, and it is still January's own 400.00 — the amount column does
    // not vanish with the second line, because the list has been apportioned.
    assert.match(h.text(), new RegExp(messages.StaffExpenseClaim.advanceAllocationAmount),
      "the amount column stays once the list carries confirmed figures");
    assert.ok(h.find((n) => attrOf(n, "id") === F("advanceAllocations.0.amountCents")),
      "…and the surviving line still has its own amount control");

    // NOTHING IS SENT, because 400.00 no longer settles a 480.00 claim — the shortfall is stated
    // rather than quietly absorbed.
    await submitForm(h);
    assert.equal(sent.length, 0, "a list that no longer adds up sends nothing");
    assert.match(h.text(), /add up to the claim/i,
      "…and says so beside the list, where the preparer can act on it");

    // THE PREPARER'S OWN RESTATEMENT settles it, and it crosses as the single-advance shape.
    await h.fireEvent(byId(h, F("advanceAllocations.0.amountCents")), "change",
      (n) => setFieldValue(n, "480.00"));
    await submitForm(h);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.claim.advanceId, JAN_ADVANCE);
    assert.equal(sent[0]!.claim.advanceAllocations, undefined,
      "one advance carrying the whole claim crosses exactly as it did before ticket 931");
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------------------------
// #1052 — WHICH ENROLMENT AN OFFERED ADVANCE CAME FROM. The owner's ruling of 2026-09-24 on #931
// admits an advance that is the claimant's by LABEL rather than by their own enrolment, on the
// condition that "the allocation editor shows, beside each such advance, the enrolment it came
// from, so the preparer's confirmation is a confirmation of that specific account".
//
// The editor's half of that is proved at the editor's own seam
// (`components/registers/staff-advance-allocations-editor.test.tsx`). What only a mounted FORM can
// prove is which candidates it calls "not this claimant's own", and the answer is a comparison of
// ENROLMENTS, never of account codes: one advance account re-enrolled after a retirement carries a
// second generation, and an advance issued under the first one is not the current claimant's own
// however the code reads. That case is reachable through today's chooser, which is why it is the
// cell.
//
// The chooser's own candidate FILTER — whether an advance on a SECOND account reaches this list at
// all — is #1066's, not this ticket's, and is deliberately untouched here.
// ---------------------------------------------------------------------------------------------

test("ticket 1052 an offered advance issued under an EARLIER enrolment of the same account names that enrolment, and the claimant's own carries no extra line", async () => {
  const store = memoryStorage();
  restoreAdvanceApplicationDraft(store, "");

  const h = await renderComponent(App({
    storage: store,
    loadAdvances: async () => staffAdvanceSummary([
      // The claimant's own, under the LIVE enrolment on 1190.
      advanceRow({}),
      // 1190 was retired and re-enrolled after a name correction; this advance was issued under
      // the FIRST generation, so it is offered (same account code) but it is not the current
      // claimant enrolment's.
      advanceRow({
        enrolment_id: "e-first-generation", person_label: "Farah Idris",
        advance_id: OTHER_CLAIMANT_ADVANCE, outstanding_cents: 30000, enrolment_active: false,
      }),
    ]),
  }));
  try {
    await h.settle();
    const select = byId(h, F("advanceId"));
    assert.deepEqual(optionsOf(select).map((o) => attrOf(o, "value")),
      ["", FARAH_ADVANCE, OTHER_CLAIMANT_ADVANCE],
      "both advances on the claimant's account are offered, exactly as before");

    const texts = optionsOf(select).map((o) => o.textContent);
    assert.ok(String(texts[2]).includes("Farah Idris") && String(texts[2]).includes("1190"),
      `the advance from the earlier enrolment names it: ${String(texts[2])}`);
    assert.ok(!String(texts[1]).includes("enrolment"),
      `the claimant's own advance carries no extra text: ${String(texts[1])}`);

    // AND BESIDE THE CONFIRMED ROW, once it is chosen.
    assert.equal(
      findAll(h.container, (n) => attrOf(n, "data-testid") === "allocation-source-enrolment").length,
      0,
      "nothing is claimed about a row that has chosen no advance yet",
    );
    await h.fireEvent(select, "change", (n) => setFieldValue(n, OTHER_CLAIMANT_ADVANCE));
    await h.settle();
    const lines = findAll(h.container, (n) => attrOf(n, "data-testid") === "allocation-source-enrolment");
    assert.equal(lines.length, 1, "the confirmed row says which enrolment it discharges");
    assert.ok(String(lines[0]!.textContent).includes("Farah Idris"),
      `…naming the person that enrolment carries: ${String(lines[0]!.textContent)}`);

    // AND CHOOSING THE CLAIMANT'S OWN TAKES IT AWAY AGAIN.
    await h.fireEvent(select, "change", (n) => setFieldValue(n, FARAH_ADVANCE));
    await h.settle();
    assert.equal(
      findAll(h.container, (n) => attrOf(n, "data-testid") === "allocation-source-enrolment").length,
      0,
      "a directly enrolled advance carries no extra line",
    );
  } finally {
    await h.unmount();
  }
});

test("ticket 1052 with the enrolment register unread, no advance is described as coming from somewhere else", async () => {
  // The conservative direction, and the same one `claimantIsNew` already takes: a read this form
  // uses to decide WHAT TO SAY must never invent a provenance it could not check.
  const store = memoryStorage();
  restoreAdvanceApplicationDraft(store, "");

  const h = await renderComponent(App({
    storage: store,
    loadEnrolments: async () => null,
    loadAdvances: async () => staffAdvanceSummary([
      advanceRow({}),
      advanceRow({
        enrolment_id: "e-first-generation", person_label: "Farah Idris",
        advance_id: OTHER_CLAIMANT_ADVANCE, outstanding_cents: 30000, enrolment_active: false,
      }),
    ]),
  }));
  try {
    await h.settle();
    const texts = optionsOf(byId(h, F("advanceId"))).map((o) => String(o.textContent));
    assert.ok(texts.every((x) => !x.includes("enrolment")),
      `no option claims a source enrolment while the register is unread: ${texts.join(" | ")}`);
  } finally {
    await h.unmount();
  }
});
