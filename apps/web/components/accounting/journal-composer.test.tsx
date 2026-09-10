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

type Submitted = { clientId: string; intentKey: string; basis: unknown };

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
    children: createElement(JournalComposerView, {
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
