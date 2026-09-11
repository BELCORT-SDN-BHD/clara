// The C3 composer, under test — the FORM's own behaviour, over the rules
// lib/work/journal-basis.test.ts already proves in isolation.
//
// FOUR THINGS ONLY A MOUNTED FORM CAN PROVE, and each has its own cell:
//   1. A failed submit MOVES FOCUS to the first invalid control, and sends
//      nothing. §3: "Focus the first invalid field."
//   2. THE LOST-RESPONSE REPLAY carries the SAME intent key. This is the one
//      behaviour the whole idempotency story rests on: a second POST with a new
//      key would admit a second Work for one intent, and no unit cell over a
//      pure function can catch that.
//   3. THE DRAFT IS FILED UNDER ITS OWN SCOPE and restored with its identity.
//   4. Each server answer renders as an INLINE state with the right next action
//      — never a toast, and never a form that has silently gone dead.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { JournalComposerView } from "./journal-composer";
import { journalDraftKey, type DraftStorage } from "../../lib/work/journal-draft";
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
  { client_id: CLIENT, account_code: "1100", name: "Maybank current", account_type: "asset", is_active: true },
  { client_id: CLIENT, account_code: "6100", name: "Office rent", account_type: "expense", is_active: true },
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

type Submitted = { clientId: string; intentKey: string; basis: unknown; sourceRefs?: unknown };

/** #634 - two of this client's filed documents, in the shape the pick list reads. */
const DOCUMENTS = [
  { documentId: "d1111111-1111-4111-8111-111111111111", filename: "sept-rent.pdf", kind: "invoice", filedAt: "2026-09-02T03:00:00Z", financialDate: "2026-09-01" },
  { documentId: "d2222222-2222-4222-8222-222222222222", filename: "bank-slip.pdf", kind: "receipt", filedAt: "2026-09-03T03:00:00Z", financialDate: null },
];

function App(props: {
  scope?: typeof BOOKKEEPER;
  submit?: (auth: unknown, input: Submitted) => Promise<SubmitJournalWorkResult>;
  navigate?: (href: string) => void;
  storage?: DraftStorage | null;
  loadAccounts?: () => Promise<CoaAccountRow[]>;
  loadDocuments?: () => Promise<typeof DOCUMENTS>;
  loadSpokenFor?: () => Promise<Array<{ document_id: string; entry_id: string; via: "evidence_link" | "coding" }>>;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(JournalComposerView, {
      clientId: CLIENT,
      scope: props.scope ?? BOOKKEEPER,
      navigate: props.navigate ?? (() => {}),
      submit: (props.submit ?? (async () => ({ kind: "denied" }) as SubmitJournalWorkResult)) as never,
      storage: props.storage ?? null,
      loadAccounts: props.loadAccounts ?? (async () => ACCOUNTS),
      loadDocuments: (props.loadDocuments ?? (async () => DOCUMENTS)) as never,
      loadSpokenFor: (props.loadSpokenFor ?? (async () => [])) as never,
      session: { getAccessToken: async () => "tok" },
    }),
  });
}

function byLabel(h: { find: (p: (n: Stub) => boolean) => Stub | null }, label: string): Stub {
  const node = h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("aria-label") === label);
  assert.ok(node, `no control labelled "${label}"`);
  return node;
}

function byId(h: { find: (p: (n: Stub) => boolean) => Stub | null }, id: string): Stub {
  const node = h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === id);
  assert.ok(node, `no element with id "${id}"`);
  return node;
}

/** The form's own SUBMIT, fired at the form — the house idiom (a click on a
 *  `type="submit"` button has no default action in this harness's stub DOM, so
 *  a click would silently do nothing and every assertion after it would be
 *  measuring an untouched form). */
async function submitForm(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const form = h.find((n) => n.tagName === "FORM");
  assert.ok(form, "no form");
  await h.fireEvent(form, "submit");
  await h.settle();
}

/** The cap a control actually carries.
 *
 *  MEASURED, not assumed: react-dom writes this one through
 *  `setAttribute("maxLength", …)` — the CAMEL-CASED name, not the HTML
 *  attribute's lowercase `maxlength` and not a DOM property. Both other spellings
 *  are read too, so this helper cannot go green on a control that lost the one
 *  react actually writes. */
function maxLengthOf(node: Stub): number | null {
  const get = (node as { getAttribute?: (k: string) => string | null }).getAttribute;
  for (const name of ["maxLength", "maxlength"]) {
    const value = get?.call(node, name);
    if (value !== null && value !== undefined) return Number(value);
  }
  const asProperty = (node as { maxLength?: unknown }).maxLength;
  return typeof asProperty === "number" ? asProperty : null;
}

/** The `id` of whatever currently holds focus. A PROJECTION, never the node:
 *  `assert.equal(activeElement(), someNode)` serialises two live DOM stubs into
 *  its failure message and exhausts the heap before it can print one. */
function focusedId(): string | null {
  const node = activeElement() as { getAttribute?: (k: string) => string | null } | null;
  return node?.getAttribute?.("id") ?? null;
}

/** The submit control's own visible label — proof of the pending state. */
function submitButtonLabel(h: { find: (p: (n: Stub) => boolean) => Stub | null }): string {
  const node = h.find(
    (n) => n.tagName === "BUTTON" && (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("type") === "submit",
  );
  assert.ok(node, "no submit button");
  return String((node as { textContent?: string }).textContent ?? "");
}

/** Fills a clean, balanced RM 1,200.00 office-rent entry. */
async function fillGoodEntry(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  await h.fireEvent(byId(h, "journal-basis-postingDate"), "change", (n) => setFieldValue(n, "2026-09-01"));
  await h.fireEvent(byId(h, "journal-basis-memo"), "change", (n) => setFieldValue(n, "Office rent, September"));
  await h.fireEvent(byLabel(h, "Account, line 1"), "change", (n) => setFieldValue(n, "6100"));
  await h.fireEvent(byLabel(h, "Debit, line 1"), "change", (n) => setFieldValue(n, "1200.00"));
  await h.fireEvent(byLabel(h, "Account, line 2"), "change", (n) => setFieldValue(n, "1100"));
  await h.fireEvent(byLabel(h, "Credit, line 2"), "change", (n) => setFieldValue(n, "1200.00"));
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
    // Memo is blank and the lines are empty, so posting date (defaulted to
    // today) is valid and MEMO is the first invalid control.
    await submitForm(h);
    assert.equal(calls, 0, "the runtime is never asked to refuse what the form can see");
    assert.equal(focusedId(), "journal-basis-memo");
    assert.match(h.text(), /Enter a memo describing this entry\./);
    // And the per-line rules are shown beside their own controls at the same time.
    assert.match(h.text(), /Choose an account for this line\./);
  } finally {
    await h.unmount();
  }
});

test("an UNBALANCED entry names the whole-table rule and focuses it", async () => {
  const h = await renderComponent(App({ submit: async () => ({ kind: "denied" }) }));
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byLabel(h, "Credit, line 2"), "change", (n) => setFieldValue(n, "1199.99"));
    await submitForm(h);
    assert.match(h.text(), /Debits and credits must be equal\./);
    assert.equal(focusedId(), "journal-basis-lines", "the table-level rule can receive focus");
  } finally {
    await h.unmount();
  }
});

test("a clean submit sends exact cents and navigates to the WORK'S own page", async () => {
  const sent: Submitted[] = [];
  const navigated: string[] = [];
  const storage = memoryStorage();
  const h = await renderComponent(
    App({
      storage,
      navigate: (href) => navigated.push(href),
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "accepted", workId: "work-1", taskId: "task-1", logicalOpId: "op", status: "queued", replayed: false };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await submitForm(h);

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]!.basis, {
      postingDate: "2026-09-01",
      memo: "Office rent, September",
      currency: "MYR",
      lines: [
        { accountCode: "6100", debitCents: 120_000, creditCents: 0 },
        { accountCode: "1100", debitCents: 0, creditCents: 120_000 },
      ],
    });
    assert.deepEqual(navigated, [`/clients/${CLIENT}/work/work-1`]);
    // The draft is retired ONLY after the runtime named the Work.
    assert.equal(storage.map.size, 0);
  } finally {
    await h.unmount();
  }
});

test("A LOST RESPONSE REPLAYS THE SAME INTENT KEY, and lands on the work the database already had", async () => {
  const sent: Submitted[] = [];
  const navigated: string[] = [];
  const h = await renderComponent(
    App({
      navigate: (href) => navigated.push(href),
      submit: async (_auth, input) => {
        sent.push(input);
        // The first attempt gets NO answer; the second is the database
        // resolving the intent key it already holds.
        return sent.length === 1
          ? { kind: "lost", message: "socket hang up" }
          : { kind: "accepted", workId: "work-1", taskId: "task-1", logicalOpId: "op", status: "queued", replayed: true };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await submitForm(h);

    assert.equal(sent.length, 2, "the form resolves the unknown by asking again — exactly once");
    assert.equal(sent[0]!.intentKey, sent[1]!.intentKey, "THE SAME identity, or a second Work is admitted for one intent");
    assert.deepEqual(sent[0]!.basis, sent[1]!.basis);
    assert.deepEqual(navigated, [`/clients/${CLIENT}/work/work-1`], "the replayed work is the same destination");
  } finally {
    await h.unmount();
  }
});

test("two lost answers leave the DRAFT INTACT, with an inline alert and a retry", async () => {
  const sent: Submitted[] = [];
  const storage = memoryStorage();
  const h = await renderComponent(
    App({
      storage,
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "lost", message: "socket hang up" };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await submitForm(h);

    assert.equal(sent.length, 2, "one replay, not a loop against a runtime that is already not answering");
    assert.match(h.text(), /We could not confirm whether this was accepted/);
    assert.match(h.text(), /Trying again is safe/);
    // The typed figures are still the only copy that exists, so they stay.
    const kept = JSON.parse(storage.map.get(journalDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT }))!);
    assert.equal(kept.memo, "Office rent, September");
    assert.equal(kept.intentKey, sent[0]!.intentKey);
  } finally {
    await h.unmount();
  }
});

test("503 is an inline alert with a retry — NOT a replay, because the server answered", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "unavailable", message: "shutting_down" };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await submitForm(h);
    assert.equal(sent.length, 1, "a server that SAID it is not accepting is not an unknown to resolve");
    assert.match(h.text(), /The service is not accepting work right now/);
    assert.match(h.text(), /Nothing was recorded/);
    assert.match(h.text(), /shutting_down/, "the runtime's own word, verbatim");
    assert.match(h.text(), /Try again/);
  } finally {
    await h.unmount();
  }
});

test("400 focuses the control the SERVER named — and the wire's line index is ONE-BASED", async () => {
  // `lines[1]` IS THE FIRST ROW. The wire speaks the database's vocabulary and
  // the database counts lines from one (`with ordinality`); a mapper that read
  // the index as zero-based reddened the second row for a refusal about the
  // first, which is exactly the kind of misdirection a money form cannot afford.
  const first = await renderComponent(
    App({ submit: async () => ({ kind: "invalid_basis", field: "lines[1].credit_cents", reason: "exactly_one_side" }) }),
  );
  try {
    await first.settle();
    await fillGoodEntry(first);
    await submitForm(first);
    assert.match(first.text(), /The server did not accept these figures/);
    assert.match(first.text(), /exactly_one_side/, "the server's own reason, verbatim");
    assert.equal(focusedId(), "journal-basis-line-0-credit");
  } finally {
    await first.unmount();
  }

  const second = await renderComponent(
    App({ submit: async () => ({ kind: "invalid_basis", field: "lines[2].account_code", reason: "nonempty" }) }),
  );
  try {
    await second.settle();
    await fillGoodEntry(second);
    await submitForm(second);
    assert.equal(focusedId(), "journal-basis-line-1-account");
  } finally {
    await second.unmount();
  }
});

test("400 on a path with NO control of its own is a form-level message, never a focus into the wrong field", async () => {
  const h = await renderComponent(
    App({ submit: async () => ({ kind: "invalid_basis", field: "currency", reason: "myr" }) }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    const before = focusedId();
    await submitForm(h);
    assert.match(h.text(), /The server did not accept these figures/);
    assert.match(h.text(), /myr/);
    assert.equal(focusedId(), before, "an unmapped path moves focus nowhere");
  } finally {
    await h.unmount();
  }
});

test("the MEMO cap is enforced at the control and at the submit, and the count appears only near it", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "accepted", workId: "w", taskId: "t", logicalOpId: "op", status: "queued", replayed: false };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);

    // THE CONTROL CARRIES THE CAP, so the browser simply stops rather than
    // letting a preparer write past what the frozen tool schema will accept.
    // Read as a PROPERTY: react-dom assigns `maxLength` on a known form element
    // rather than routing it through `setAttribute`.
    assert.equal(maxLengthOf(byId(h, "journal-basis-memo")), 4000);

    // A short memo shows NO count.
    assert.ok(!/characters left/.test(h.text()));

    // Near the cap it appears, counting down in exact characters.
    await h.fireEvent(byId(h, "journal-basis-memo"), "change", (n) => setFieldValue(n, "m".repeat(3_600)));
    await h.settle();
    assert.match(h.text(), /400 characters left/);

    // OVER the cap — reachable only from a restored draft, which is untrusted
    // input like any other persisted payload — is refused BY NAME, with focus.
    await h.fireEvent(byId(h, "journal-basis-memo"), "change", (n) => setFieldValue(n, "m".repeat(4_001)));
    await submitForm(h);
    assert.equal(sent.length, 0, "an over-long memo is never sent to be refused remotely");
    assert.match(h.text(), /This memo is longer than 4,000 characters/);
    assert.equal(focusedId(), "journal-basis-memo");
  } finally {
    await h.unmount();
  }
});

test("a LINE NARRATION has the same two doors, and its error sits beside the narration itself", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "accepted", workId: "w", taskId: "t", logicalOpId: "op", status: "queued", replayed: false };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);

    assert.equal(maxLengthOf(byLabel(h, "Description, line 2")), 2000);

    await h.fireEvent(byLabel(h, "Description, line 2"), "change", (n) => setFieldValue(n, "d".repeat(1_800)));
    await h.settle();
    assert.match(h.text(), /200 characters left/);

    await h.fireEvent(byLabel(h, "Description, line 2"), "change", (n) => setFieldValue(n, "d".repeat(2_001)));
    await submitForm(h);
    assert.equal(sent.length, 0);
    assert.match(h.text(), /This description is longer than 2,000 characters/);
    assert.equal(focusedId(), "journal-basis-line-1-description");
  } finally {
    await h.unmount();
  }
});

test("409 explains the conflict, links the existing work, and offers a NEW identity for these figures", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return sent.length === 1
          ? { kind: "conflict", workId: "work-9" }
          : { kind: "accepted", workId: "work-10", taskId: "t", logicalOpId: "op", status: "queued", replayed: false };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await submitForm(h);
    assert.match(h.text(), /already submitted with different figures/);
    const link = h.find(
      (n) => n.tagName === "A" && (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") === `/clients/${CLIENT}/work/work-9`,
    );
    assert.ok(link, "the existing work is linked when the response named it");

    // A NEW INTENT GETS A NEW IDENTITY (§3). Rotating the key is what stops
    // every future submit answering the same 409.
    const newDraft = h.find((n) => n.tagName === "BUTTON" && String((n as { textContent?: string }).textContent ?? "").includes("Start a new draft"));
    assert.ok(newDraft, "a form that can only ever 409 is a dead end");
    await h.fireEvent(newDraft, "click");
    await h.settle();
    await submitForm(h);
    assert.equal(sent.length, 2);
    assert.notEqual(sent[1]!.intentKey, sent[0]!.intentKey, "the figures are the same; the INTENT is not");
  } finally {
    await h.unmount();
  }
});

test("while a submit is in flight the button says so, and a SECOND submit is refused", async () => {
  // §3's short-mutation rule: "the initiating Button shows a Spinner and pending
  // label; prevent duplicate local submits". The local guard is not protection —
  // the server's idempotency is — but a form that fires twice on a double-click
  // is a form that asks the runtime to resolve a race it never needed to see.
  let resolve: ((r: SubmitJournalWorkResult) => void) | null = null;
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return new Promise<SubmitJournalWorkResult>((r) => { resolve = r; });
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await submitForm(h);
    assert.equal(sent.length, 1);
    assert.match(submitButtonLabel(h), /Submitting/);
    assert.match(h.text(), /Submitting/, "the pending state is named, not only a disabled control");

    await submitForm(h);
    assert.equal(sent.length, 1, "the second submit while busy is dropped");

    resolve!({ kind: "unavailable", message: "shutting_down" });
    await h.settle();
    assert.match(submitButtonLabel(h), /Submit/);
  } finally {
    await h.unmount();
  }
});

test("403 renders the denied state rather than a red toast", async () => {
  const h = await renderComponent(App({ submit: async () => ({ kind: "denied" }) }));
  try {
    await h.settle();
    await fillGoodEntry(h);
    await submitForm(h);
    assert.match(h.text(), /Recording a journal entry needs bookkeeper access/);
  } finally {
    await h.unmount();
  }
});

test("A DRAFT IS RESTORED WITH ITS IDENTITY, and is filed under this client alone", async () => {
  const storage = memoryStorage();
  const first = await renderComponent(App({ storage }));
  let intentKey: string;
  try {
    await first.settle();
    await fillGoodEntry(first);
    await first.settle();
    const key = journalDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT });
    const stored = JSON.parse(storage.map.get(key)!);
    intentKey = stored.intentKey;
    assert.equal(stored.memo, "Office rent, September");
    assert.equal(stored.lines[0].debit_cents, 120_000, "cents, as integers, never a formatted string");
    // Filed under THIS client only — nothing under any other key.
    assert.deepEqual([...storage.map.keys()], [key]);
  } finally {
    await first.unmount();
  }

  // A fresh mount (a reload) restores the figures AND the identity.
  const sent: Submitted[] = [];
  const second = await renderComponent(
    App({
      storage,
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "accepted", workId: "work-1", taskId: "t", logicalOpId: "op", status: "queued", replayed: false };
      },
    }),
  );
  try {
    await second.settle();
    assert.match(second.text(), /kept in this tab/);
    await submitForm(second);
    assert.equal(sent[0]!.intentKey, intentKey!, "the restored draft carries the identity the database may already know");
  } finally {
    await second.unmount();
  }
});

test("a browser that will not keep the draft SAYS SO rather than promising a recovery it cannot deliver", async () => {
  const h = await renderComponent(App({ storage: null }));
  try {
    await h.settle();
    assert.match(h.text(), /not keeping this draft/);
  } finally {
    await h.unmount();
  }
});

test("a FAILED chart read degrades the form rather than blocking it", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      loadAccounts: async () => { throw new Error("boom"); },
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "accepted", workId: "w", taskId: "t", logicalOpId: "op", status: "queued", replayed: false };
      },
    }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /chart of accounts could not be read/);
    // The select has no options, so the code is typed into it directly — the
    // unknown-account rule is SKIPPED and the commit rechecks the live chart.
    await h.fireEvent(byId(h, "journal-basis-postingDate"), "change", (n) => setFieldValue(n, "2026-09-01"));
    await h.fireEvent(byId(h, "journal-basis-memo"), "change", (n) => setFieldValue(n, "m"));
    await h.fireEvent(byLabel(h, "Account, line 1"), "change", (n) => setFieldValue(n, "6100"));
    await h.fireEvent(byLabel(h, "Debit, line 1"), "change", (n) => setFieldValue(n, "10.00"));
    await h.fireEvent(byLabel(h, "Account, line 2"), "change", (n) => setFieldValue(n, "1100"));
    await h.fireEvent(byLabel(h, "Credit, line 2"), "change", (n) => setFieldValue(n, "10.00"));
    await submitForm(h);
    assert.equal(sent.length, 1, "a preparer who knows the code can still submit");
  } finally {
    await h.unmount();
  }
});


// ===========================================================================================
// #634 - OPTIONAL EVIDENCE.
// ===========================================================================================

// THE `t634` PREFIX IS NOT A TYPO. A string literal containing `#634` is a valid
// three-digit CSS hex colour, and this app's `no-restricted-syntax` raw-colour
// rule (owner ruling Q4) reds every one of them. Ticket ids stay in COMMENTS,
// where the rule does not look; test NAMES carry the bare number.


test("t634: EVIDENCE IS OPTIONAL - the default is an explicit No document, and nothing is sent", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "accepted", workId: "w", taskId: "t", logicalOpId: "op", status: "queued", replayed: false };
      },
    }),
  );
  try {
    await h.settle();
    // The chooser exists, says evidence is optional IN WORDS, and OPENS on
    // "No document" - a selectable option rather than a blank, so a preparer who
    // picked a file can get back to "none" with the keyboard.
    const select = byId(h, "journal-basis-evidence");
    assert.equal(select.tagName, "SELECT");
    assert.equal((select as { value?: unknown }).value, "");
    assert.match(h.text(), /may be recorded with no document at all/);
    assert.match(h.text(), /No document/);
    await fillGoodEntry(h);
    await submitForm(h);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.sourceRefs, undefined, "a documentless Work sends NO sourceRefs at all");
  } finally {
    await h.unmount();
  }
});

test("t634: a chosen document rides the submit as ONE document source ref", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "accepted", workId: "w", taskId: "t", logicalOpId: "op", status: "queued", replayed: false };
      },
    }),
  );
  try {
    await h.settle();
    // The option carries what a preparer needs to recognise the file.
    assert.match(h.text(), /sept-rent\.pdf/);
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    assert.deepEqual(sent[0]!.sourceRefs, [{ kind: "document", documentId: DOCUMENTS[0]!.documentId }]);
  } finally {
    await h.unmount();
  }
});

test("t634: the SAME intent key carries the evidence through a lost-response replay", async () => {
  // The one behaviour the whole idempotency story rests on, extended to the
  // EVIDENCE half of the payload: the admission door compares canonical source
  // refs alongside the basis digest, so a replay that dropped the document would
  // be answered as a typed CONFLICT rather than as the replay it is.
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return sent.length === 1
          ? { kind: "lost", message: "socket" }
          : { kind: "accepted", workId: "w", taskId: "t", logicalOpId: "op", status: "queued", replayed: true };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[1]!.documentId));
    await submitForm(h);
    assert.equal(sent.length, 2, "the lost response is resolved by re-sending, exactly once");
    assert.equal(sent[0]!.intentKey, sent[1]!.intentKey, "...under the SAME intent key");
    assert.deepEqual(sent[0]!.sourceRefs, sent[1]!.sourceRefs, "...and the SAME evidence");
  } finally {
    await h.unmount();
  }
});

test("t634: a SOURCE CONFLICT is a persistent Alert with a link and NO resubmit of this intent", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "source_conflict", entryId: "e5555555-5555-4555-8555-555555555555", documentId: DOCUMENTS[0]!.documentId };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    assert.equal(sent.length, 1);
    assert.match(h.text(), /already backs a posted entry/);
    // THE LINK GOES SOMEWHERE REAL - the journals table, opened on that entry.
    const link = h.find(
      (n) =>
        n.tagName === "A" &&
        String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(
          "entry=e5555555-5555-4555-8555-555555555555",
        ),
    );
    assert.ok(link, "the conflict Alert links to the entry that already stands on the document");
    // THE INPUT IS PRESERVED and the offending control is focused, so the human
    // can choose another document without retyping a table of money.
    assert.equal(focusedId(), "journal-basis-evidence");
    assert.equal((byId(h, "journal-basis-memo") as { value?: unknown }).value, "Office rent, September");
    assert.equal((byId(h, "journal-basis-evidence") as { value?: unknown }).value, DOCUMENTS[0]!.documentId);
    // NO "start a new draft" affordance: rotating the intent key cannot free a
    // document that is already spoken for, and offering it would invite the very
    // second effect the rule prevents.
    assert.doesNotMatch(h.text(), /Start a new draft/i);
  } finally {
    await h.unmount();
  }
});

test("t634: choosing a different document retires the conflict Alert", async () => {
  const h = await renderComponent(
    App({ submit: async () => ({ kind: "source_conflict", entryId: null, documentId: null }) }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    assert.match(h.text(), /already backs a posted entry/);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[1]!.documentId));
    await h.settle();
    assert.doesNotMatch(h.text(), /already backs a posted entry/);
  } finally {
    await h.unmount();
  }
});

test("t634: a refusal NAMING the evidence array focuses the evidence control", async () => {
  const h = await renderComponent(
    App({ submit: async () => ({ kind: "invalid_basis", field: "sourceRefs[1]", reason: "invalid_source_ref" }) }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    assert.equal(focusedId(), "journal-basis-evidence");
    assert.match(h.text(), /not an active filed document of this client/);
  } finally {
    await h.unmount();
  }
});

test("t634: a FAILED documents read degrades the form rather than blocking it", async () => {
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      loadDocuments: async () => {
        throw new Error("boom");
      },
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "accepted", workId: "w", taskId: "t", logicalOpId: "op", status: "queued", replayed: false };
      },
    }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /could not read this client's documents/);
    await fillGoodEntry(h);
    await submitForm(h);
    assert.equal(sent.length, 1, "no document is a valid answer, so an unreadable list never blocks a submit");
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------
// Review round — the Submit control must agree with the banner beside it.
// ---------------------------------------------------------------------------

test("t634: a SOURCE CONFLICT disables the primary Submit until the choice changes", async () => {
  // THE DEFECT THIS CELL FENCES. The banner said "no resubmit" and the primary
  // Submit stayed live, so a press re-sent the SAME intent key with the SAME
  // document and received the SAME 409 — for ever. A control that accepts a
  // press the product has just said is pointless is the product contradicting
  // itself, and on this journey the press is the one move that must not look
  // available.
  const sent: Submitted[] = [];
  const h = await renderComponent(
    App({
      submit: async (_auth, input) => {
        sent.push(input);
        return { kind: "source_conflict", entryId: "e5555555-5555-4555-8555-555555555555", documentId: DOCUMENTS[0]!.documentId };
      },
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    assert.equal(sent.length, 1);

    const submit = h.find((n) => n.tagName === "BUTTON" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("type") ?? "") === "submit");
    assert.ok(submit, "the primary Submit must render");
    assert.equal((submit as { disabled?: unknown }).disabled, true,
      "a spoken-for document cannot be freed by pressing again");

    // …and the press really is inert, not merely greyed.
    await submitForm(h);
    assert.equal(sent.length, 1, "no second admission attempt under the same intent");

    // CHOOSING ANOTHER DOCUMENT IS THE FORWARD MOVE, and it re-enables the
    // control in the same tick it retires the Alert.
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[1]!.documentId));
    await h.settle();
    const again = h.find((n) => n.tagName === "BUTTON" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("type") ?? "") === "submit");
    assert.equal((again as { disabled?: unknown }).disabled, false,
      "a NEW choice is a new question, and the form must accept it");
  } finally {
    await h.unmount();
  }
});

test("t634: 'No document' is also a forward move out of a source conflict", async () => {
  // The other escape: record the entry with no evidence at all. This journey's
  // whole premise is that evidence is optional, so the conflict must not trap a
  // preparer into needing SOME document.
  const h = await renderComponent(
    App({ submit: async () => ({ kind: "source_conflict", entryId: null, documentId: null }) }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, ""));
    await h.settle();
    const submit = h.find((n) => n.tagName === "BUTTON" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("type") ?? "") === "submit");
    assert.equal((submit as { disabled?: unknown }).disabled, false);
    assert.doesNotMatch(h.text(), /already backs a posted entry/);
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------
// #728 finding 5 — the composer's own evidence picker disables spoken-for documents too.
// ---------------------------------------------------------------------------

test("t728: a document already spoken for renders DISABLED with a reason and a link; the other document stays free", async () => {
  const OTHER_ENTRY = "e5555555-5555-4555-8555-555555555555";
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [{ document_id: DOCUMENTS[0]!.documentId, entry_id: OTHER_ENTRY, via: "evidence_link" }],
    }),
  );
  try {
    await h.settle();
    const select = byId(h, "journal-basis-evidence");
    const options = ((select as { childNodes?: Stub[] }).childNodes ?? []).filter((n) => n.tagName === "OPTION");
    const attrOf = (n: Stub, name: string) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.(name) ?? null;
    const spokenForOption = options.find((o) => attrOf(o, "value") === DOCUMENTS[0]!.documentId);
    const freeOption = options.find((o) => attrOf(o, "value") === DOCUMENTS[1]!.documentId);
    assert.ok(spokenForOption, "the spoken-for document is still OFFERED, never hidden");
    assert.equal((spokenForOption as { disabled?: unknown }).disabled, true, "…but disabled");
    assert.ok(freeOption, "the other document is still offered");
    assert.notEqual((freeOption as { disabled?: unknown }).disabled, true, "…and stays selectable");

    assert.match(h.text(), /already backs a posted journal entry/);
    const link = h.find((n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY));
    assert.ok(link, "the reason links to the entry the document already backs");
  } finally {
    await h.unmount();
  }
});

test("t728: a FAILED spoken-for read disables nothing and says the check was unavailable", async () => {
  const h = await renderComponent(App({ loadSpokenFor: async () => { throw new Error("gateway"); } }));
  try {
    await h.settle();
    const select = byId(h, "journal-basis-evidence");
    const options = ((select as { childNodes?: Stub[] }).childNodes ?? []).filter((n) => n.tagName === "OPTION");
    for (const opt of options) {
      assert.notEqual((opt as { disabled?: unknown }).disabled, true, "a failed check must never disable a real option");
    }
    assert.match(h.text(), /could not check which documents already back a posted entry/);
  } finally {
    await h.unmount();
  }
});
