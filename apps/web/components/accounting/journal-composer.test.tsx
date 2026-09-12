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

import { renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
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
  loadSpokenFor?: () => Promise<Array<{
    document_id: string;
    entry_id: string;
    client_id: string;
    client_name: string | null;
    via: "evidence_link" | "coding";
  }>>;
  /** The fallback that names the CLAIMANT client of the entry a `source_already_posted` refusal
   *  points at, when the advisory read did not settle or did not carry that document. Takes the
   *  read options too, because what this fixture most needs to exercise is the AbortSignal the
   *  composer arms (delta review round 3, finding [3]). */
  resolveEntryClient?: (
    entryId: string,
    opts?: { signal?: AbortSignal },
  ) => Promise<{ clientId: string; clientName: string | null } | null>;
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
      resolveEntryClient: (props.resolveEntryClient
        ?? (async () => ({ clientId: CLIENT, clientName: "Acme Sdn Bhd" }))) as never,
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
    const href = String((link as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "");
    assert.ok(href.includes(CLIENT),
      "…in THIS client's journals, because the resolver named this client as the claimant");
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

test("t728: a SOURCE CONFLICT whose entry belongs to a SIBLING client links into THAT client's journals", async () => {
  // `admit_journal_work`'s CLR13 detail carries an entry_id and NO client, and
  // `clara._document_posting_entry` resolves it across the WHOLE FIRM — so the entry may be a
  // sibling client's, and `journalEntryHref(clientId, …)` (what this banner did until the delta
  // review, finding [3]) routed to a journal that can never contain it.
  const SIB_ENTRY = "e7777777-7777-4777-8777-777777777777";
  const SIB_CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const h = await renderComponent(
    App({
      // The advisory read ALREADY names the claimant, so this path costs no extra read at all.
      loadSpokenFor: async () => [
        { document_id: DOCUMENTS[0]!.documentId, entry_id: SIB_ENTRY, client_id: SIB_CLIENT, client_name: "Beta Sdn Bhd", via: "coding" },
      ],
      resolveEntryClient: async () => {
        throw new Error("the advisory rows already answer this — no second read is owed");
      },
      submit: async () => ({ kind: "source_conflict", entryId: SIB_ENTRY, documentId: DOCUMENTS[0]!.documentId }),
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    const link = h.find((n) => n.tagName === "A"
      && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(`entry=${SIB_ENTRY}`));
    assert.ok(link, "the refusal still offers the entry it is about");
    const href = String((link as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "");
    assert.ok(href.includes(SIB_CLIENT), `the link targets the CLAIMANT client's journals (got ${href})`);
    assert.equal(href.includes(CLIENT), false, "…and never this composer's own client");
  } finally {
    await h.unmount();
  }
});

test("t728: when the claimant cannot be resolved at all the refusal carries NO link, rather than a wrong one", async () => {
  // A link into a journal the entry is not in is worse than none: `journal-entries-table.tsx`
  // answers it with "clear the filters and narrow by posting date", advice that can never reach
  // the entry. So an unresolvable claimant renders the banner without its action.
  const LOST_ENTRY = "e8888888-8888-4888-8888-888888888888";
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [],
      resolveEntryClient: async () => null,
      submit: async () => ({ kind: "source_conflict", entryId: LOST_ENTRY, documentId: DOCUMENTS[0]!.documentId }),
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    assert.match(h.text(), /already backs a posted entry/, "the refusal itself still renders");
    assert.equal(
      h.find((n) => n.tagName === "A"
        && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(LOST_ENTRY)),
      null,
      "no link is invented when nothing names the claimant",
    );
  } finally {
    await h.unmount();
  }
});

test("t728: a restored draft on a spoken-for document renders BOTH links at once, and their names stay distinct", async () => {
  // THE STATE THE ROUND DELETED THE ONLY PIN FOR (delta review [11]). Submit is not gated on the
  // advisory read, so a draft restored with a document that became spoken-for while it sat in
  // sessionStorage carries BOTH: SpokenForNotes' "View that journal entry" for the selection, and
  // the door's own refusal with "Open that journal entry". Two links in one view: if either label
  // is ever re-worded to match the other, one accessible name would name two different routes.
  const storage = memoryStorage();
  const first = await renderComponent(App({ storage }));
  try {
    await first.settle();
    await fillGoodEntry(first);
    // Free when the draft was saved — which is the whole premise.
    await first.fireEvent(byId(first, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await first.settle();
  } finally {
    await first.unmount();
  }

  const SPOKEN_ENTRY = "e9999999-9999-4999-8999-999999999999";
  const second = await renderComponent(
    App({
      storage,
      // …spoken for by the time the draft is restored.
      loadSpokenFor: async () => [
        { document_id: DOCUMENTS[0]!.documentId, entry_id: SPOKEN_ENTRY, client_id: CLIENT, client_name: "Acme Sdn Bhd", via: "evidence_link" },
      ],
      submit: async () => ({ kind: "source_conflict", entryId: SPOKEN_ENTRY, documentId: DOCUMENTS[0]!.documentId }),
    }),
  );
  try {
    await second.settle();
    // THE RESTORE IS PROVEN BY THE NOTE, not by the select's value: SpokenForNotes renders the
    // per-document reason ONLY for the current selection, so its link existing at all is the
    // evidence that the restored `documentId` survived the remount.
    assert.match(second.text(), /already backs a posted journal entry/);
    const advisory = second.find((n) => n.tagName === "A" && textOf(n as never).trim() === "View that journal entry");
    assert.ok(advisory, "the restored draft still holds the (now spoken-for) document, so its note renders");
    await submitForm(second);
    // `h.find` walks in document order and stops on `true`; an ALWAYS-FALSE predicate therefore
    // visits every node, which is how this harness collects rather than finds.
    const names: string[] = [];
    second.find((n) => {
      if (n.tagName === "A") {
        const name = textOf(n as never).trim();
        if (/journal entry$/.test(name)) names.push(name);
      }
      return false;
    });
    assert.ok(names.includes("View that journal entry"), `the advisory link is present (saw ${JSON.stringify(names)})`);
    assert.ok(names.includes("Open that journal entry"), `the refusal's link is present (saw ${JSON.stringify(names)})`);
    assert.equal(new Set(names).size, names.length,
      `two links in one view must not share one accessible name (saw ${JSON.stringify(names)})`);
  } finally {
    await second.unmount();
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
      loadSpokenFor: async () => [{ document_id: DOCUMENTS[0]!.documentId, entry_id: OTHER_ENTRY, client_id: CLIENT, client_name: "Acme Sdn Bhd", via: "evidence_link" }],
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

    // Bounded (review round, N9): the reason rides the option's own label, ONE summary line sits
    // beside the select, and the paragraph-with-link belongs to the SELECTED document alone.
    assert.match(textOf(spokenForOption as never), /already backs a posted entry/);
    assert.match(h.text(), /already backs a posted journal entry and cannot be chosen/);
    assert.equal(
      h.find((n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY)),
      null,
      "no link while nothing is selected",
    );

    await setFieldValue(select as never, DOCUMENTS[0]!.documentId);
    await h.settle();
    const link = h.find((n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY));
    assert.ok(link, "the SELECTED document's reason links to the entry it already backs");
  } finally {
    await h.unmount();
  }
});

test("t728: TWO spoken-for documents render the summary's PLURAL arm — the ICU `other` branch, which no cell had ever evaluated", async () => {
  // `evidenceSpokenForSummary` is `{count, plural, =1 {...} other {# of these documents ...}}`.
  // `check-message-keys.mjs` only proves the key resolves to a string; a typo inside the `other`
  // arm throws in next-intl's formatter at RENDER time, for any client with two or more spoken-for
  // documents — which the picker's own header calls the common case (delta review [10]).
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [
        { document_id: DOCUMENTS[0]!.documentId, entry_id: "e1111111-1111-4111-8111-111111111111", client_id: CLIENT, client_name: "Acme Sdn Bhd", via: "evidence_link" },
        { document_id: DOCUMENTS[1]!.documentId, entry_id: "e2222222-2222-4222-8222-222222222222", client_id: CLIENT, client_name: "Acme Sdn Bhd", via: "coding" },
      ],
    }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /2 of these documents already back a posted journal entry/,
      "the plural arm formats the count — and formatting it at all is the point of this cell");
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
    // COUNT FIRST: the loop below is vacuous on an empty list, and an empty list is exactly what a
    // refactor folding the two reads into one effect would produce — the spoken-for failure
    // running the DOCUMENTS catch, so the picker offers nothing at all while the banner assertion
    // still matches (delta review [6]).
    assert.equal(options.length, DOCUMENTS.length + 1,
      `the chooser still offers every document plus the "no document" option (saw ${options.length})`);
    for (const opt of options) {
      assert.notEqual((opt as { disabled?: unknown }).disabled, true, "a failed check must never disable a real option");
    }
    assert.match(h.text(), /could not check which documents already back a posted entry/);
  } finally {
    await h.unmount();
  }
});

test("t728: a SIBLING client's entry holding the document is named, and the link goes to THAT client's journals", async () => {
  const OTHER_ENTRY = "e6666666-6666-4666-8666-666666666666";
  // A sibling client of the same firm: uq_document_filing_active is per (document, client)
  // (0007:93) while the evidence invariant is firm-wide, so the entry already standing on a
  // document this composer offers may belong to a DIFFERENT client.
  const OTHER_CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [
        { document_id: DOCUMENTS[0]!.documentId, entry_id: OTHER_ENTRY, client_id: OTHER_CLIENT, client_name: "Beta Sdn Bhd", via: "coding" },
      ],
    }),
  );
  try {
    await h.settle();
    // The sibling-client sentence belongs to the SELECTED document's own note — see SpokenForNotes.
    await setFieldValue(byId(h, "journal-basis-evidence") as never, DOCUMENTS[0]!.documentId);
    await h.settle();
    assert.match(h.text(), /already backs a posted journal entry for Beta Sdn Bhd/,
      "the sentence names WHOSE entry holds it");
    const link = h.find((n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY));
    assert.ok(link, "the reason still links to the entry");
    const href = String((link as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "");
    assert.ok(href.includes(OTHER_CLIENT), "the link targets the CLAIMANT client's Journals route");
    assert.equal(href.includes(CLIENT), false, "…and not the client this composer is drafting for");
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------
// #728 delta review round 3 — the refusal is never held behind a cosmetic read,
// and it names the client whose books its link leads to.
// ---------------------------------------------------------------------------

test("t728f: a claimant read that NEVER settles does not withhold the refusal, and is aborted on unmount", async () => {
  // Finding [3]. The round before this one awaited `resolveEntryClient` INSIDE the
  // `source_conflict` arm, before `setPhase` — so a refusal the runtime had already returned was
  // withheld behind a second, advisory-grade PostgREST read with no signal and no timeout. A read
  // that accepts the connection and then stalls left `busy` true for ever: every control
  // disabled, the banner rendering null, and the live region stuck on "Submitting…". `.catch()`
  // answers a rejection, not a hang, so only ordering (and a signal) can fix it.
  const STALLED_ENTRY = "e9999999-9999-4999-8999-999999999999";
  let armed: AbortSignal | null = null;
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [],
      // Never resolves. This is the whole point: the assertions below run WHILE it is outstanding.
      resolveEntryClient: (_entryId, opts) => {
        armed = opts?.signal ?? null;
        return new Promise(() => {});
      },
      submit: async () => ({ kind: "source_conflict", entryId: STALLED_ENTRY, documentId: DOCUMENTS[0]!.documentId }),
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);

    assert.match(h.text(), /already backs a posted entry/,
      "the refusal is on screen although the claimant read has not settled");
    assert.doesNotMatch(h.text(), /Submitting…/,
      "…and the pending live region is gone: the form is no longer submitting");
    assert.notEqual((byId(h, "journal-basis-evidence") as { disabled?: unknown }).disabled, true,
      "…and the evidence chooser is usable again, so the person can pick another document");
    // No link yet — nothing has named the claimant — but that costs a link, not the refusal.
    assert.equal(
      h.find((n) => n.tagName === "A"
        && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(STALLED_ENTRY)),
      null,
      "the link waits for the claimant; the refusal does not wait for the link");
    assert.ok(armed !== null, "the read is armed with an AbortSignal (vacuity control)");
    assert.equal((armed as AbortSignal).aborted, false, "…which is still live while the phase stands");
  } finally {
    await h.unmount();
  }
  assert.equal((armed as unknown as AbortSignal | null)?.aborted, true,
    "unmounting the composer aborts the outstanding claimant read rather than leaking it");
});

test("t728f: the claimant read is abandoned by its own TIMEOUT, not only by unmounting the composer", async () => {
  // #728 finding 2 (final review) — the branch the cell above never exercised. That cell proves
  // the AbortSignal fires on UNMOUNT; nothing proved `setTimeout(() => controller.abort(),
  // CLAIMANT_READ_TIMEOUT_MS)` at journal-composer.tsx:302 ever actually FIRES. Delete that line
  // (or change 5000 to Infinity) and the whole apps/web suite stayed green — a stalled PostgREST
  // claimant read would then hold a fetch for the tab's lifetime with no cell noticing, exactly
  // the vacuity attach-evidence-dialog.test.tsx's t728g cell was written to close for the
  // dialog's identical timer, which only the dialog got. This cell moves the clock instead of
  // waiting on it (the same instrument), and lets the read settle LATE — after the abort — to
  // prove the answer is DISCARDED rather than merely delayed: a real fetch can race its own
  // AbortController and still resolve, and only the composer's own re-check
  // (`controller.signal.aborted || claimant === null`) stands between that and a state write for
  // a phase the person has already moved past.
  const STALLED_ENTRY = "e8888888-8888-4888-8888-888888888888";
  let armed: AbortSignal | null = null;
  let settleLate: ((v: { clientId: string; clientName: string | null } | null) => void) | null = null;
  const realSetTimeout = globalThis.setTimeout;
  const timers: Array<() => void> = [];
  (globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms === 5000) {
      timers.push(fn);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return (realSetTimeout as (...a: unknown[]) => unknown)(fn, ms, ...rest) as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  const realConsoleError = console.error;
  const errors: string[] = [];
  console.error = ((...args: unknown[]) => {
    errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
  }) as typeof console.error;
  try {
    const h = await renderComponent(
      App({
        loadSpokenFor: async () => [],
        // Never resolves until `settleLate` is called by hand — the assertions below fire the
        // abort timer FIRST, then settle this late, so both halves of the guard are exercised.
        resolveEntryClient: (_entryId, opts) => {
          armed = opts?.signal ?? null;
          return new Promise((resolve) => { settleLate = resolve; });
        },
        submit: async () => ({ kind: "source_conflict", entryId: STALLED_ENTRY, documentId: DOCUMENTS[0]!.documentId }),
      }),
    );
    try {
      await h.settle();
      await fillGoodEntry(h);
      await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
      await submitForm(h);

      assert.match(h.text(), /already backs a posted entry/,
        "the refusal is on screen although the claimant read has not settled");
      assert.equal(timers.length, 1,
        `the claimant read arms exactly one 5000 ms abort timer — found ${timers.length}`);
      assert.ok(armed !== null, "…and the read is armed with the signal that timer fires");
      assert.equal((armed as AbortSignal).aborted, false, "…which is live while the read is outstanding");

      await h.act(() => { timers[0]!(); });
      await h.settle();

      assert.equal((armed as AbortSignal).aborted, true,
        "the timeout ABORTS the read — without it the fetch outlives the phase and the alert waits "
        + "for a link that will never come");
      assert.match(h.text(), /already backs a posted entry/, "the alert stands after the read is abandoned");
      assert.equal(
        h.find((n) => n.tagName === "A"
          && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(STALLED_ENTRY)),
        null,
        "no link was invented for a claimant nobody read",
      );

      // THE LATE ANSWER, arriving AFTER the abort — the exact race a plain `.catch()` with no
      // signal re-check could not close.
      await h.act(() => { settleLate?.({ clientId: CLIENT, clientName: "Acme Sdn Bhd" }); });
      await h.settle();

      assert.equal(
        h.find((n) => n.tagName === "A"
          && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(STALLED_ENTRY)),
        null,
        "…a late answer arriving after the abort writes no state either — still no link",
      );
      assert.match(h.text(), /already backs a posted entry/, "…and still the one alert, unchanged");
      assert.deepEqual(errors, [], `no console error from the abandoned read — saw: ${JSON.stringify(errors)}`);
    } finally {
      await h.unmount();
    }
  } finally {
    (globalThis as { setTimeout: unknown }).setTimeout = realSetTimeout;
    console.error = realConsoleError;
  }
});

test("t728f: the refusal NAMES the sibling client whose books its link leads to", async () => {
  // Finding [5]. The link leaves this client for another client's Journals route — a new
  // client-scope epoch, with the abandoned composer behind it — and the copy said only "That
  // document already backs a posted entry", while the ADVISORY surface for the identical fact
  // already named the claimant. Strictly less informative on the path that matters more.
  const SIB_ENTRY = "e7777777-7777-4777-8777-777777777777";
  const SIB_CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [
        { document_id: DOCUMENTS[0]!.documentId, entry_id: SIB_ENTRY, client_id: SIB_CLIENT, client_name: "Beta Sdn Bhd", via: "coding" },
      ],
      submit: async () => ({ kind: "source_conflict", entryId: SIB_ENTRY, documentId: DOCUMENTS[0]!.documentId }),
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    // MATCHED ON THE BANNER'S OWN SENTENCE, not on the name alone: the advisory note below the
    // chooser already prints "Beta Sdn Bhd" for the same fact, so a bare name match would go green
    // on a refusal that still says nothing (measured — it did, against the pre-fix copy).
    assert.match(h.text(), /belongs to Beta Sdn Bhd/,
      "the refusal banner says WHOSE entry holds the document before offering the door out of this client");
    assert.match(h.text(), /leaves this client/,
      "…and says plainly that following the link leaves these books");
  } finally {
    await h.unmount();
  }
});

test("t728f: …and does NOT invent a departure when the claimant is this client's own entry", async () => {
  // The common case. `journalEntryHref(thisClient, …)` stays inside these books, so a sentence
  // about leaving them would be false — the same comparison `spoken-for-note.tsx` makes.
  const OWN_ENTRY = "e6666666-6666-4666-8666-666666666666";
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [
        { document_id: DOCUMENTS[0]!.documentId, entry_id: OWN_ENTRY, client_id: CLIENT, client_name: "Acme Sdn Bhd", via: "evidence_link" },
      ],
      submit: async () => ({ kind: "source_conflict", entryId: OWN_ENTRY, documentId: DOCUMENTS[0]!.documentId }),
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    // MATCHED ON THE SENTENCE THAT DIFFERS (delta review round 4, NIT [9]). The two messages open
    // with the same words — "One document backs at most one posted journal entry. Nothing was
    // recorded." — so an assertion on that opening is satisfied by EITHER, and the cell rested
    // entirely on the `doesNotMatch` below. The discriminating clause is the tail.
    assert.match(h.text(), /Open the entry that already stands on it/,
      "the plain refusal copy — the one that does NOT name another client — stands when the entry is this client's own");
    assert.doesNotMatch(h.text(), /leaves this client/,
      "…and nothing claims the link goes somewhere else");
    assert.doesNotMatch(h.text(), /belongs to/,
      "…and no claimant is named, because the claimant is these very books");
  } finally {
    await h.unmount();
  }
});

test("t728f: a claimant the advisory read did not name is resolved AFTER the banner, and the link appears", async () => {
  // The other half of finding [3]: deferring the read must not silently drop the link. The
  // fallback still runs — just behind the refusal instead of in front of it.
  const LATE_ENTRY = "e5555555-5555-4555-8555-555555555555";
  const LATE_CLIENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [],
      resolveEntryClient: async () => ({ clientId: LATE_CLIENT, clientName: "Gamma Sdn Bhd" }),
      submit: async () => ({ kind: "source_conflict", entryId: LATE_ENTRY, documentId: DOCUMENTS[0]!.documentId }),
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);
    await h.settle();
    const link = h.find((n) => n.tagName === "A"
      && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(`entry=${LATE_ENTRY}`));
    assert.ok(link, "the late-resolved claimant still produces the link");
    const href = String((link as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "");
    assert.ok(href.includes(LATE_CLIENT), `…targeting the CLAIMANT's journals (got ${href})`);
    assert.match(h.text(), /Gamma Sdn Bhd/, "…and the sentence names them too");
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------
// #728 delta review round 4 — the refusal is announced ONCE, and the bound on
// the claimant read is a bound a cell can see.
// ---------------------------------------------------------------------------

/** Every node that ANNOUNCES on its own AND has something to say: a computed
 *  `role="alert"`/`"status"`, or an explicit `aria-live` that is not "off", carrying text.
 *
 *  EMPTY ONES ARE EXCLUDED DELIBERATELY. This form mounts eight standing, empty live regions — a
 *  `role="alert"` slot per Field plus the submit status — and an empty live region speaks nothing;
 *  counting them would make the assertion about the form's construction rather than about what a
 *  person HEARS. §5's one-announcement-owner rule is about what is spoken, and about a region
 *  whose content is rewritten after paint, which is spoken twice. */
function liveRegions(h: { container: Stub }): Stub[] {
  const out: Stub[] = [];
  const walk = (n: Stub) => {
    const get = (n as { getAttribute?: (k: string) => string | null }).getAttribute;
    const role = get ? get.call(n, "role") : null;
    const live = get ? get.call(n, "aria-live") : null;
    if ((role === "alert" || role === "status" || (live !== null && live !== "off"))
      && textOf(n).trim() !== "") out.push(n);
    for (const c of ((n as { childNodes?: Stub[] }).childNodes ?? [])) walk(c);
  };
  walk(h.container as Stub);
  return out;
}

/** True when `needle` IS `haystack` or sits anywhere beneath it. */
function containsNode(haystack: Stub, needle: Stub): boolean {
  if (haystack === needle) return true;
  for (const c of ((haystack as { childNodes?: Stub[] }).childNodes ?? [])) {
    if (containsNode(c, needle)) return true;
  }
  return false;
}

test("t728g: the source_conflict refusal is ONE alert, and its text does not change when the claimant lands", async () => {
  // Finding [7]. Round 3 moved the claimant read behind the paint, which fixed the delay and
  // opened a second defect: `StateBanner tone="error"` computes `role="alert"` (state.tsx), an
  // assertive live region, and the composer then REWROTE it — the body sentence swapped for the
  // claimant one and a <Link> inserted — so one refusal interrupted a screen reader twice, the
  // second time contradicting the first about where the link goes. §5 has an explicit rule and an
  // opt-out for exactly this (state.tsx's `silent`, born from #629's "one accepted answer was
  // announced twice"). Round 2 announced it once, complete; this cell is what keeps it that way
  // without going back to holding the refusal behind the read.
  const LATE_ENTRY = "e4444444-4444-4444-8444-444444444444";
  const LATE_CLIENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let release: ((v: { clientId: string; clientName: string | null }) => void) | null = null;
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [],
      // Held open on purpose: the assertions below compare the alert BEFORE and AFTER it lands.
      resolveEntryClient: () => new Promise((resolve) => { release = resolve; }),
      submit: async () => ({ kind: "source_conflict", entryId: LATE_ENTRY, documentId: DOCUMENTS[0]!.documentId }),
    }),
  );
  try {
    await h.settle();
    await fillGoodEntry(h);
    await h.fireEvent(byId(h, "journal-basis-evidence"), "change", (n) => setFieldValue(n, DOCUMENTS[0]!.documentId));
    await submitForm(h);

    const before = liveRegions(h);
    assert.equal(before.length, 1,
      `one refusal owns exactly one announcement — found ${before.length}: `
      + JSON.stringify(before.map((n) => textOf(n))));
    const spoken = textOf(before[0]!);
    assert.match(spoken, /One document backs at most one posted journal entry/,
      "…and it is the refusal that is announced (vacuity control)");

    // The claimant arrives a tick later, exactly as a PostgREST read does.
    await h.act(() => { release!({ clientId: LATE_CLIENT, clientName: "Beta Sdn Bhd" }); });
    await h.settle();

    const after = liveRegions(h);
    assert.equal(after.length, 1,
      `still exactly one announcement after the claimant resolves — found ${after.length}: `
      + JSON.stringify(after.map((n) => textOf(n))));
    assert.equal(textOf(after[0]!), spoken,
      "the ALERT's own text is unchanged by the claimant read — an assertive region rewritten after "
      + `paint is a second interruption for one refusal (was ${JSON.stringify(spoken)}, now `
      + `${JSON.stringify(textOf(after[0]!))})`);

    // …and the upgrade really did arrive — outside the live region, where it interrupts nobody
    // and an assistive-technology user still reads it in the same place a sighted one sees it.
    assert.match(h.text(), /belongs to Beta Sdn Bhd/,
      "the claimant sentence still renders (vacuity control for the assertion above)");
    const link = h.find((n) => n.tagName === "A"
      && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(LATE_ENTRY));
    assert.ok(link, "…and so does the link");
    assert.equal(containsNode(after[0]!, link), false,
      "the late link sits OUTSIDE the alert: inserting a node into an assertive region re-announces it");
  } finally {
    await h.unmount();
  }
});
