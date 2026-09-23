// #1002 — THE SECOND-PASS MEMBERSHIP EDITOR, mounted directly (the composite band
// `client-financial-charts.test.tsx` never opens this dialog — see that file's own header).
//
// THE FIVE CLAIMS THE TICKET'S OWN AGENT BRIEF MAKES, each its own cell below:
//   1. Opening the editor for a client with a published set PRE-CHECKS every current member,
//      including one with NO bank-registry candidacy (a declared petty-cash account).
//   2. A member carrying a declared reason is RESUBMITTED with that reason UNCHANGED — never
//      rewritten to bank_registry, even though the checkbox that carries it is the SAME checkbox
//      a bank-registry candidate uses.
//   3. The editor shows ADDED, REMOVED and UNCHANGED members against the current version BEFORE
//      a single byte is submitted.
//   4. The human STATES the new effective date; a null date is the DOOR's own named refusal
//      (`effective_from_required`), shown VERBATIM with its code — never a generic failure.
//   5. The op key is an idempotency key derived from the INTENT, not the clock: the SAME key
//      survives a retry of the same decision, and a changed decision mints a NEW one.
//
// THE DIALOG IS PORTALLED to `document.body` (base-ui Dialog) — every search below walks the
// body, exactly as `work-cancel-dialog.test.tsx` and `knowledge-promote-dialog.test.tsx` do.
//
// FIRST-PUBLISH IS UNCHANGED (the ticket's own AC): one light regression cell at the end proves
// the `hasPublishedSet: false` face still renders the ORIGINAL first-publish copy and still mints
// its clock-derived op key exactly as `660` shipped it — this file touches none of that code path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent, setCheckboxChecked, setFieldValue, textOf } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import messages from "../../../messages/en.json";
import { DoorRefusal } from "@/lib/doors";
import { ClientCashSetDialog } from "./client-cash-set-dialog";
import type {
  CashProposal, CashSetMemberInput, CurrentCashSet, publishClientCashAccountSet,
} from "@/lib/dashboard/financial-pack";

enableDomInspection();

type Stub = Record<string, unknown>;

function findIn(root: Stub, predicate: (n: Stub) => boolean): Stub | null {
  if (predicate(root)) return root;
  for (const c of (root.childNodes as Stub[] | undefined) ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
const attr = (n: Stub, key: string): string =>
  String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.(key) ?? "");
const bodyOf = (): Stub & { appendChild: (n: unknown) => void } =>
  (globalThis as unknown as { document: { body: Stub & { appendChild: (n: unknown) => void } } }).document.body;
const bodyText = (): string => textOf(bodyOf() as never);
const buttonNamed = (label: string) => (n: Stub) => n.tagName === "BUTTON" && textOf(n as never).trim() === label;
const memberBox = (accountCode: string) => (n: Stub) => attr(n, "data-testid") === `cash-set-member-${accountCode}`;
const dateInput = () => findIn(bodyOf(), (n) => n.tagName === "INPUT" && attr(n, "id") === "client-cash-set-effective-date");
/** The FIRST-PUBLISH face's own checkbox carries no `data-testid` — it is untouched code (this
 *  ticket's own AC) — so the regression cell locates it the way a reader would: the checkbox
 *  inside the `<li>` naming this account code. */
function checkboxNear(code: string): Stub | null {
  const li = findIn(bodyOf(), (n) => n.tagName === "LI" && textOf(n as never).includes(code));
  return li ? findIn(li, (n) => n.tagName === "INPUT") : null;
}

const CLIENT = "c1c1c1c1-0000-4000-8000-0000000000c1";
// BANK: a bank-registry candidate AND a current member (reason bank_registry).
const BANK = "a1a1a1a1-0000-4000-8000-000000000001";
// PETTY: a current member with NO bank-registry candidacy at all — the AC's own named case.
const PETTY = "a2a2a2a2-0000-4000-8000-000000000002";
// NEWBANK: a bank-registry candidate that has never been a member.
const NEWBANK = "a3a3a3a3-0000-4000-8000-000000000003";

const PROPOSAL: CashProposal = {
  asOf: "2026-09-18",
  publishedVersionId: "v1",
  candidates: [
    { accountId: BANK, accountCode: "1010", name: "Maybank Current", isActive: true, memberReason: "bank_registry", balanceCents: 18_234_055, alreadyMember: true },
    { accountId: NEWBANK, accountCode: "1020", name: "CIMB Savings", isActive: true, memberReason: "bank_registry", balanceCents: 500_000, alreadyMember: false },
  ],
  neverProposed: ["declared_cash", "declared_petty_cash"],
};

const CURRENT: CurrentCashSet = {
  publishedVersionId: "v1",
  revision: 1,
  effectiveFrom: "2026-01-07",
  memberCount: 2,
  members: [
    { accountId: BANK, accountCode: "1010", name: "Maybank Current", isActive: true, memberReason: "bank_registry", ordinal: 0 },
    { accountId: PETTY, accountCode: "1090", name: "Petty Cash Tin", isActive: true, memberReason: "declared_petty_cash", ordinal: 1 },
  ],
};

type PublishArgs = { effectiveFrom?: string | null; opKey: string };
type PublishCall = { clientId: string; members: CashSetMemberInput[]; args: PublishArgs };

async function mount(opts: {
  hasPublishedSet?: boolean;
  proposal?: CashProposal | null;
  currentSet?: CurrentCashSet | null;
  publish?: typeof publishClientCashAccountSet;
} = {}) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(ClientCashSetDialog, {
        clientId: CLIENT,
        open: true,
        onOpenChange: () => {},
        hasPublishedSet: opts.hasPublishedSet ?? true,
        proposal: opts.proposal === undefined ? PROPOSAL : opts.proposal,
        loading: false,
        error: null,
        currentSet: opts.currentSet === undefined ? CURRENT : opts.currentSet,
        membersLoading: false,
        membersError: null,
        onPublished: () => {},
        publish: opts.publish,
      }),
    }),
  );
  bodyOf().appendChild(h.container);
  for (let i = 0; i < 6; i += 1) await h.settle();
  return h;
}

function mockPublish(behaviour: (call: PublishCall) => Promise<unknown>): {
  publish: typeof publishClientCashAccountSet;
  calls: PublishCall[];
} {
  const calls: PublishCall[] = [];
  const publish = (async (clientId: string, members: CashSetMemberInput[], args: PublishArgs) => {
    const call = { clientId, members, args };
    calls.push(call);
    return behaviour(call);
  }) as typeof publishClientCashAccountSet;
  return { publish, calls };
}

// ===========================================================================================
// 1 — PRE-CHECKED, INCLUDING A MEMBER WITH NO BANK-REGISTRY CANDIDACY.
// ===========================================================================================
test("ticket 1002.1 every current member is pre-checked, including one with no bank-registry candidacy", async () => {
  const h = await mount({});
  try {
    const bank = findIn(bodyOf(), memberBox("1010"));
    const petty = findIn(bodyOf(), memberBox("1090"));
    const notYet = findIn(bodyOf(), memberBox("1020"));
    assert.ok(bank, "the bank-registry member must render a checkbox");
    assert.ok(petty, "PETTY — a member with NO bank-registry candidacy — must still render a row");
    assert.ok(notYet, "a not-yet-member candidate must still be offered");
    assert.equal((bank as unknown as { checked: boolean }).checked, true, "a current member starts CHECKED");
    assert.equal((petty as unknown as { checked: boolean }).checked, true,
      "a non-bank-registry member starts CHECKED too — pre-checking is not limited to candidates");
    assert.equal((notYet as unknown as { checked: boolean }).checked, false,
      "an account that was never a member does not start checked");
    assert.match(bodyText(), /Declared petty cash/, "the recorded reason travels onto the row, in words");
    assert.match(bodyText(), /Change which accounts count as cash/, "the EDIT title, not the first-publish one");
  } finally {
    await h.unmount();
  }
});

// ===========================================================================================
// 2 — A DECLARED REASON IS NEVER REWRITTEN TO bank_registry ON RESUBMISSION.
// ===========================================================================================
test("ticket 1002.2 a declared reason is resubmitted UNCHANGED, never rewritten to bank_registry", async () => {
  const { publish, calls } = mockPublish(async () => ({ cash_account_set_version_id: "v2" }));
  const h = await mount({ publish });
  try {
    // NOTHING is touched — the seeded pre-check is submitted exactly as it stands.
    await h.act(() => setFieldValue(dateInput()!, "2026-04-01"));
    const save = findIn(bodyOf(), buttonNamed("Save changes"));
    assert.ok(save, "the edit face's own Save control must render");
    await h.act(async () => { await clickButton(save as never); });
    for (let i = 0; i < 4; i += 1) await h.settle();

    assert.equal(calls.length, 1, "exactly one submit reached the door");
    const members = calls[0]!.members;
    assert.equal(members.length, 2, "NEWBANK, never checked, must not be sent");
    const petty = members.find((m) => m.account_id === PETTY);
    const bank = members.find((m) => m.account_id === BANK);
    assert.ok(petty, "PETTY must be in the submitted membership");
    assert.equal(petty!.member_reason, "declared_petty_cash",
      "the recorded reason must survive resubmission — a rewrite to bank_registry is exactly the defect this ticket exists to close");
    assert.equal(bank!.member_reason, "bank_registry");
  } finally {
    await h.unmount();
  }
});

// ===========================================================================================
// 3 — ADDED / REMOVED / UNCHANGED, BEFORE SUBMISSION.
// ===========================================================================================
test("ticket 1002.3 the editor shows added, removed and unchanged members against the current version", async () => {
  const h = await mount({});
  try {
    const petty = findIn(bodyOf(), memberBox("1090"));
    const notYet = findIn(bodyOf(), memberBox("1020"));
    await h.act(() => setCheckboxChecked(petty as never, false)); // REMOVE petty
    await h.act(() => setCheckboxChecked(notYet as never, true)); // ADD the new bank account
    // BANK (1010) stays checked throughout — UNCHANGED.

    const body = bodyText();
    assert.match(body, /Added:\s*1020/, "the newly checked account is named under Added");
    assert.match(body, /Removed:\s*1090/, "the unchecked current member is named under Removed");
    assert.match(body, /1 unchanged/, "BANK, checked before and after, counts as unchanged");
  } finally {
    await h.unmount();
  }
});

test("ticket 1002.3b an untouched editor reports nothing added or removed, and every member unchanged", async () => {
  const h = await mount({});
  try {
    const body = bodyText();
    assert.match(body, /Nothing added or removed yet/);
    assert.match(body, /2 unchanged/, "both current members, untouched, are unchanged");
  } finally {
    await h.unmount();
  }
});

// ===========================================================================================
// 4 — THE HUMAN STATES THE DATE; A NULL DATE IS THE DOOR'S OWN NAMED REFUSAL, VERBATIM.
// ===========================================================================================
test("ticket 1002.4 a null effective date is refused by the door, and the refusal renders VERBATIM with its code", async () => {
  const { publish, calls } = mockPublish(async () => {
    throw new DoorRefusal("CLR10", "a later version states the date it takes effect", {
      reason: "effective_from_required", status: 400, pgCode: "CLR10", codeSource: "sqlstate",
    });
  });
  const h = await mount({ publish });
  try {
    // The date field is left BLANK — the human never stated one.
    const save = findIn(bodyOf(), buttonNamed("Save changes"));
    assert.ok(save, "an empty date must not be blocked client-side — that is the DOOR's own rule");
    await h.act(async () => { await clickButton(save as never); });
    for (let i = 0; i < 4; i += 1) await h.settle();

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.args.effectiveFrom, null, "a blank field is sent as null, never guessed");

    const body = bodyText();
    assert.match(body, /a later version states the date it takes effect/,
      "the door's own sentence must render VERBATIM, never a generic \"could not save\"");
    assert.match(body, /CLR10/, "the refusal's code rides the banner");
    assert.match(body, /effective_from_required/, "the refusal's own reason discriminant is shown");
  } finally {
    await h.unmount();
  }
});

test("ticket 1002.4b a non-advancing date is refused by the door, and the refusal renders VERBATIM with its code", async () => {
  const { publish, calls } = mockPublish(async () => {
    throw new DoorRefusal("CLR10", "a new version takes effect strictly after the current one", {
      reason: "effective_from_not_after_current", status: 400, pgCode: "CLR10", codeSource: "sqlstate",
      detail: { current_effective_from: "2026-01-07" },
    });
  });
  const h = await mount({ publish });
  try {
    await h.act(() => setFieldValue(dateInput()!, "2026-01-01")); // BEFORE the current version's own date
    const save = findIn(bodyOf(), buttonNamed("Save changes"));
    await h.act(async () => { await clickButton(save as never); });
    for (let i = 0; i < 4; i += 1) await h.settle();

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.args.effectiveFrom, "2026-01-01", "the human's own typed date is sent, not silently corrected");
    assert.match(bodyText(), /a new version takes effect strictly after the current one/);
    assert.match(bodyText(), /effective_from_not_after_current/);
  } finally {
    await h.unmount();
  }
});

// ===========================================================================================
// 5 — THE OP KEY: ONE PER DECISION, NOT PER CLICK.
// ===========================================================================================
test("ticket 1002.5 a retry of the SAME decision reuses the op key; a changed decision mints a new one", async () => {
  const { publish, calls } = mockPublish(async () => { throw new Error("network blip"); });
  const h = await mount({ publish });
  try {
    await h.act(() => setFieldValue(dateInput()!, "2026-04-01"));
    const save = findIn(bodyOf(), buttonNamed("Save changes"));

    await h.act(async () => { await clickButton(save as never); });
    for (let i = 0; i < 4; i += 1) await h.settle();
    await h.act(async () => { await clickButton(save as never); }); // a RETRY of the same decision
    for (let i = 0; i < 4; i += 1) await h.settle();

    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.args.opKey, calls[1]!.args.opKey,
      "a retry of the same figures must replay through the SAME op key, or a lost response asks the question twice");

    const notYet = findIn(bodyOf(), memberBox("1020"));
    await h.act(() => setCheckboxChecked(notYet as never, true)); // a DIFFERENT decision
    await h.act(async () => { await clickButton(save as never); });
    for (let i = 0; i < 4; i += 1) await h.settle();

    assert.equal(calls.length, 3);
    assert.notEqual(calls[2]!.args.opKey, calls[1]!.args.opKey,
      "changing the membership is a DIFFERENT decision and must mint a fresh key");
  } finally {
    await h.unmount();
  }
});

// ===========================================================================================
// REGRESSION — FIRST PUBLISH IS UNCHANGED.
// ===========================================================================================
test("ticket 1002.6 a client with no published set still gets the ORIGINAL first-publish face, untouched", async () => {
  const { publish, calls } = mockPublish(async () => ({ cash_account_set_version_id: "v1" }));
  const h = await mount({ hasPublishedSet: false, currentSet: null, publish });
  try {
    const body = bodyText();
    assert.match(body, /Which accounts count as cash\?/, "the FIRST-publish title, not the editor's");
    assert.doesNotMatch(body, /What changes/, "no diff section belongs on the first-publish face");
    assert.equal(findIn(bodyOf(), (n) => attr(n, "id") === "client-cash-set-effective-date"), null,
      "the first-publish face states no date at all — the door stamps the books' own start");

    const bank = checkboxNear("1010");
    assert.ok(bank, "the candidate must still render a checkbox");
    assert.equal((bank as unknown as { checked: boolean }).checked, false,
      "first publish starts EVERY box unchecked — ticket 660's own rule, never pre-checked");
    await h.act(() => setCheckboxChecked(bank as never, true));

    const publishBtn = findIn(bodyOf(), buttonNamed("Publish"));
    assert.ok(publishBtn, "the first-publish face keeps its own button label");
    await h.act(async () => { await clickButton(publishBtn as never); });
    for (let i = 0; i < 4; i += 1) await h.settle();

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.args.effectiveFrom, null, "a first version still sends a null effective date");
    assert.match(calls[0]!.args.opKey, /^p660-cashset-/, "the FIRST-publish op key formula is untouched");
  } finally {
    await h.unmount();
  }
});
