// The B3 Work detail, under test — every state the contract names, plus the
// three behaviours that only a MOUNTED page can prove: the poll stops on a
// terminal Work, a read failure keeps the last DATED value, and the heading
// takes focus on arrival.
//
// THE READS ARE MOCKED AT `fetch`, not at the reader, so each cell exercises the
// real PostgREST URLs `lib/work/reads.ts` builds. The malformed-id cell then
// asserts the ABSENCE of a request, which is the only way to prove the guard is
// in front of the read rather than after it.
//
// EVERY MONEY ASSERTION IS ON THE RENDERED STRING. A cell that asserted on the
// row's cents would pass on a page that never printed them.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { ReadError } from "../../lib/read";
import { UNKNOWN_ACCOUNT_LINE_SENTENCE, WORK_HEADING_ID, WorkDetailView } from "./work-detail";
import { WORK_STALE_AFTER_MS } from "../../lib/work/use-work-detail";
import { journalDraftKey, type DraftStorage } from "../../lib/work/journal-draft";
import type { CancelWorkResult, RetryWorkResult, TakeOverWorkResult } from "../../lib/work/api";
import type { WorkDetailData } from "../../lib/work/reads";
import type { AccountingWorkRow } from "../../lib/work/types";
import type { AgentInterruptionRow } from "../../lib/journals/types";
import type { EntryLinkRow } from "../../lib/work/evidence";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENTRY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TASK = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FIRM = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const USER = "user-1";

function memoryStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function workRow(over: Partial<AccountingWorkRow> = {}): AccountingWorkRow {
  return {
    id: WORK,
    firm_id: "firm-1",
    client_id: CLIENT,
    purpose: "journal_entry",
    status: "queued",
    initiator: "user-1",
    initiated_by: "user-1",
    initiator_role: "bookkeeper",
    intent_key: "intent-1",
    logical_op_id: `work:${WORK}:journal_entry:1`,
    basis: {
      posting_date: "2026-09-01",
      memo: "Office rent, September",
      currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 120_000, credit_cents: 0, description: "rent" },
        { account_code: "1100", debit_cents: 0, credit_cents: 120_000, description: null },
      ],
    },
    basis_digest: "digest",
    basis_origin: "user_direct",
    source_refs: [],
    current_task_id: null,
    bundle: null,
    result: null,
    error: null,
    created_at: "2026-09-01T01:00:00.000Z",
    updated_at: "2026-09-01T01:00:00.000Z",
    ...over,
  };
}

function data(over: Partial<WorkDetailData> = {}): WorkDetailData {
  return {
    work: workRow(),
    task: null,
    entry: null,
    lines: [],
    receipts: [],
    interruption: null,
    accounts: [
      { client_id: CLIENT, account_code: "6100", name: "Office rent", account_type: "expense", is_active: true },
      { client_id: CLIENT, account_code: "1100", name: "Maybank current", account_type: "asset", is_active: true },
    ],
    ...over,
  };
}

/** One `clara.list_entry_links` row for the posted entry, in the door's shape.
 *  Every field is nullable there, so the default is the honest "a Work posted
 *  this entry and it carries no source". */
function linkRow(over: Partial<EntryLinkRow> = {}): EntryLinkRow {
  return {
    entry_id: ENTRY,
    status: "approved",
    origin: "agent",
    work_id: WORK,
    receipt_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    logical_op_id: `work:${WORK}:journal_entry:1`,
    purpose: "journal_entry",
    basis_origin: "user_direct",
    initiated_by: USER,
    initiated_by_role: "bookkeeper",
    responsible: USER,
    document_id: null,
    document_source: null,
    attached_at: null,
    released_at: null,
    reversal_of: null,
    reversed_by: null,
    reversal_reason: null,
    ...over,
  };
}

/** `clara.role_rank('bookkeeper')` as `caller_context` projects it — the index into FIRM_ROLES,
 *  which is the DATABASE's ladder rather than a spelling this file re-derives. */
const BOOKKEEPER_RANK = 1;
const VIEWER_RANK = 0;

function App(props: {
  workId?: string;
  load?: (clientId: string, workId: string) => Promise<WorkDetailData | null>;
  now?: () => number;
  retry?: (auth: unknown, input: { workId: string; opKey: string }) => Promise<RetryWorkResult>;
  /** #630 — the two runtime writes, injected so a cell drives the DECISION with no socket. */
  cancel?: (auth: unknown, input: { workId: string; opKey: string }) => Promise<CancelWorkResult>;
  takeOver?: (auth: unknown, input: { workId: string; opKey: string; basisDigest?: string | null }) => Promise<TakeOverWorkResult>;
  /** #630 — `roleRank` is the reader's own rank from `clara.caller_context`. It DEFAULTS to
   *  bookkeeper here because the page's two new controls floor there and almost every cell is about
   *  something else; the floor itself has its own cell below, which passes a viewer's rank. */
  scope?: { firmId?: string; userId?: string; roleRank?: number | null };
  storage?: DraftStorage | null;
  /** #634 — the entry's links read. DEFAULTED so no cell reaches a real socket:
   *  an empty answer is "the read succeeded and this entry has no links row". */
  loadLinks?: (clientId: string, entryIds: readonly string[]) => Promise<EntryLinkRow[]>;
  /** #655 — `clara.get_trade_invoice`, injected so a cell can render the AC5 link block without a
   *  socket. Undefined leaves the component's own read in place, which is what the door-census
   *  cells above measure. */
  loadTradeInvoice?: (workId: string, opts?: unknown) => Promise<unknown>;
  /** #636 — the batch this Work belongs to. DEFAULTED to null so no cell reaches a socket; the
   *  two cells that care inject a row. */
  loadBatchOrigin?: (workId: string, deps: unknown) => Promise<unknown>;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(WorkDetailView, {
      clientId: CLIENT,
      workId: props.workId ?? WORK,
      load: props.load,
      now: props.now,
      retry: (props.retry ?? (async () => ({ kind: "accepted", workId: WORK, taskId: "t", logicalOpId: "op", status: "queued", replayed: false }))) as never,
      cancel: (props.cancel
        ?? (async () => ({ kind: "answered", workId: WORK, taskId: TASK, status: "stopping", cancelled: true, reason: null, receiptId: null, entryId: null, cancelledBy: USER, cancelledAt: "2026-09-11T00:00:00.000Z", replayed: false }))) as never,
      takeOver: (props.takeOver
        ?? (async () => ({ kind: "accepted", workId: WORK, taskId: "t2", logicalOpId: "op", status: "queued", replayed: false, responsible: "user-2", previousResponsible: USER, initiatedBy: USER, takenOver: true }))) as never,
      session: { getAccessToken: async () => "tok" },
      scope: { roleRank: BOOKKEEPER_RANK, ...props.scope },
      storage: props.storage ?? null,
      loadLinks: (props.loadLinks ?? (async () => [])) as never,
      ...(props.loadTradeInvoice === undefined ? {} : { loadTradeInvoice: props.loadTradeInvoice as never }),
      loadBatchOrigin: (props.loadBatchOrigin ?? (async () => null)) as never,
    }),
  });
}

/** A pending `clara.agent_interruptions` row, in the shape `openInterruptionStep`
 *  actually writes — `{ type, question, context, framing }`, never `{ text }`
 *  (H-32's finding, which this page inherits through the shared reader). */
function parkedQuestion(over: Partial<AgentInterruptionRow> = {}): AgentInterruptionRow {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    task_id: TASK,
    kind: "clarify",
    question: {
      type: "clarify",
      question: "Which bank account did the rent leave from?",
      context: "The basis names 1100, but this client has two Maybank accounts.",
      framing: "Answer in one line.",
    },
    answer: null,
    status: "pending",
    asked_of: null,
    answered_by: null,
    expires_at: "2026-09-02T01:00:00.000Z",
    created_at: "2026-09-01T01:30:00.000Z",
    answered_at: null,
    ...over,
  };
}

function hrefs(container: Stub): string[] {
  const out: string[] = [];
  const walk = (n: Stub) => {
    if (n.tagName === "A") {
      const href = (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(container);
  return out;
}

/** Settle until a rendered condition holds, bounded by wall clock — never a fixed hop count. A
 *  re-render that has not yet re-read the row still shows the OLD arm, and a cell that asserted
 *  across it would be asserting about a transition that never happened. */
async function settleUntil(
  h: { settle: () => Promise<void> },
  condition: () => boolean,
  description: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`settleUntil: timed out waiting for ${description}`);
    await h.settle();
  }
}

function buttonLabelled(h: { find: (p: (n: Stub) => boolean) => Stub | null }, text: string): Stub | null {
  return h.find((n) => n.tagName === "BUTTON" && String((n as { textContent?: string }).textContent ?? "").includes(text));
}

test("A MALFORMED WORK ID IS THE NOT-FOUND STATE, and fires no read at all", async () => {
  let calls = 0;
  const h = await renderComponent(
    App({ workId: "not-a-work", load: async () => { calls += 1; return data(); } }),
  );
  try {
    await h.settle();
    assert.equal(calls, 0, "a malformed uuid must never reach PostgREST");
    assert.match(h.text(), /This work record was not found/);
    // NOT the error boundary, and not a database code in user copy.
    assert.ok(!/22P02|Something went wrong/.test(h.text()));
  } finally {
    await h.unmount();
  }
});

test("an UNKNOWN work is not-found — a state, never an error the database did not raise", async () => {
  const h = await renderComponent(App({ load: async () => null }));
  try {
    await h.settle();
    assert.match(h.text(), /This work record was not found/);
  } finally {
    await h.unmount();
  }
});

test("a QUEUED work shows its observed status and NO fabricated progress", async () => {
  const h = await renderComponent(App({ load: async () => data() }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /Queued/);
    assert.match(text, /You can leave this page/);
    // No percentage, no estimate, no elapsed-time claim (§3, §5).
    assert.ok(!/%/.test(text), "a durable Work has no percentage to show");
    assert.ok(!/minutes? remaining|estimated/i.test(text));
  } finally {
    await h.unmount();
  }
});

test("the identity block names the purpose, the source ABSENCE and the role AS A SNAPSHOT", async () => {
  const h = await renderComponent(
    App({ load: async () => data({ work: workRow({ bundle: { id: "clara-work/v1", digest: "abcdef0123456789" } }) }) }),
  );
  try {
    await h.settle();
    const text = h.text();
    // #643 — THE LABEL, not the raw column value. The identity block used to render
    // `accounting_work.purpose` verbatim while the result block a screen below showed "Journal
    // entry" for the same row, which is one page saying two things about one fact. Both now read
    // the ONE mapping (`lib/work/purpose-label.ts`); an unknown purpose still renders itself.
    assert.match(text, /PurposeJournal entry/);
    assert.doesNotMatch(text, /journal_entry/,
      "the raw token is gone from the rendered page — it is a database value, not a reader's word");
    // The whole point of this journey: an operation with no document behind it.
    assert.match(text, /No source document — user-supplied basis/);
    // The role is HISTORY, and must never read as a current permission.
    assert.match(text, /bookkeeper, at the time it was submitted/);
    // The frozen bundle that ran it, with a short digest.
    assert.match(text, /clara-work\/v1 · abcdef012345/);
  } finally {
    await h.unmount();
  }
});

test("a CHAT-ORIGIN work says so instead of claiming there is no source", async () => {
  const h = await renderComponent(
    App({
      load: async () =>
        data({ work: workRow({ basis_origin: "clara_interpreted", source_refs: [{ kind: "chat_task", task_id: "t1", session_id: "s1" }] }) }),
    }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /From a Clara conversation/);
    assert.ok(!/No source document/.test(h.text()));
  } finally {
    await h.unmount();
  }
});

test("the BASIS table renders exact cents with account names, and labels its own sum as typed figures", async () => {
  const h = await renderComponent(App({ load: async () => data() }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /6100 — Office rent/);
    assert.match(text, /1100 — Maybank current/);
    assert.match(text, /RM\s?1,200\.00/);
    assert.match(text, /Requested totals/, "the sum is labelled as the request, never as a posted figure");
  } finally {
    await h.unmount();
  }
});

test("a basis line whose cents are NOT EXACT renders as unreadable rather than as a plausible amount", async () => {
  const broken = workRow();
  broken.basis!.lines[0]!.debit_cents = 1200.5;
  const h = await renderComponent(App({ load: async () => data({ work: broken }) }));
  try {
    await h.settle();
    assert.match(h.text(), /unreadable/);
    assert.ok(!/RM\s?12\.0[05]/.test(h.text()), "a wrong number on a ledger screen is worse than a visible gap");
  } finally {
    await h.unmount();
  }
});

test("a COMPLETED work shows the posted lines, the receipt and a route into Journals", async () => {
  const h = await renderComponent(
    App({
      load: async () =>
        data({
          work: workRow({ status: "completed", result: { entry_id: ENTRY, receipt_id: "receipt-1", posted_at: "2026-09-01T02:00:00Z" } }),
          entry: {
            id: ENTRY, client_id: CLIENT, status: "approved", posting_date: "2026-09-01", memo: "Office rent",
            origin: "agent", document_id: null, coding_kind: null, revision_token: "rev", maker_actor: null,
            checker_actor: null, approved_at: "2026-09-01T02:00:00Z", reversal_of: null, reversed_by: null,
            reversal_reason: null, withdrawn_at: null, withdrawal_reason: null, created_at: "2026-09-01T02:00:00Z",
          },
          lines: [
            { id: "l1", entry_id: ENTRY, line_no: 1, account_code: "6100", debit_cents: 120_000, credit_cents: 0, description: "rent", counterparty_id: null },
            { id: "l2", entry_id: ENTRY, line_no: 2, account_code: "1100", debit_cents: 0, credit_cents: 120_000, description: null, counterparty_id: null },
          ],
          receipts: [
            {
              id: "receipt-1", client_id: CLIENT, work_id: WORK, purpose: "journal_entry", logical_op_id: "op",
              payload_digest: "d", acting_actor: "agent", on_behalf_of: "user-1", via_wake_kind: "interactive_client",
              bundle_digest: "bd", run_id: "run-1", task_id: "task-1", outcome: "committed",
              effects: { entry_id: ENTRY, revision_token: "rev" }, refusal: null, created_at: "2026-09-01T02:00:00Z",
            },
          ],
        }),
    }),
  );
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /Completed/);
    assert.match(text, /What was recorded/);
    assert.match(text, /receipt-1/);
    assert.match(text, /interactive_client/, "the receipt says HOW the authority was carried");
    assert.ok(hrefs(h.container).includes(`/clients/${CLIENT}/journals`));
  } finally {
    await h.unmount();
  }
});

test("a REFUSED work renders the DB's own typed reason, with a retry and an edit route — no toast", async () => {
  const retried: { workId: string; opKey: string }[] = [];
  const h = await renderComponent(
    App({
      retry: async (_auth, input) => {
        retried.push(input);
        return { kind: "accepted", workId: WORK, taskId: "t", logicalOpId: "op", status: "queued", replayed: false };
      },
      load: async () =>
        data({
          work: workRow({
            status: "refused",
            error: { code: "CLR10", reason: "write_into_closed_period", message: "September 2026 is closed for this client.", recoverable: true },
          }),
        }),
    }),
  );
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /Refused/);
    assert.match(text, /CLR10 · write_into_closed_period/, "the typed reason, verbatim");
    assert.match(text, /September 2026 is closed for this client\./, "the DB's own words, never re-worded");
    // The two next actions the contract names.
    assert.ok(hrefs(h.container).includes(`/clients/${CLIENT}/accounting/journal/new`), "Edit as a new draft goes to the composer");

    const retry = buttonLabelled(h, "Run this again");
    assert.ok(retry, "a recoverable state offers a NEW RUN of the SAME work");
    await h.fireEvent(retry, "click");
    await h.settle();
    assert.equal(retried.length, 1);
    assert.equal(retried[0]!.workId, WORK);
    assert.match(retried[0]!.opKey, /^[0-9a-f-]{36}$/i, "a fresh op key per press");
  } finally {
    await h.unmount();
  }
});

// #799 — a commit-time `unknown_account` refusal on a periodic-adjustment Work names only a bare
// line ordinal ("line 2 codes to an account…"); the page resolves that ordinal, together with the
// Work's own purpose and basis lines, back to the adjustment field that produced it, and renders
// that field's label BESIDE the database's own sentence — never instead of it.
//
// THE SENTENCE IS SPELLED ONCE, by the component's exported `UNKNOWN_ACCOUNT_LINE_SENTENCE`. The
// fixtures below are BUILT from it rather than re-typed, so a reworded regex cannot leave these
// cells green against prose the page can no longer parse. The other half of the pin is db-side:
// `w799.post.unknown-account-sentence` (packages/db/tests/work-journal-post.test.mjs) reads the
// installed `_record_journal_entry_core` body and asserts it still raises this exact prefix, so a
// migration that rewords it reds a db cell instead of silently turning this affordance off.
const dbUnknownAccountMessage = (line: number, code: string) =>
  `line ${line} codes to an account this client does not have active: ${code}`;

test("799: the fixture prose the cells below use is exactly what the page's own matcher accepts", () => {
  const m = UNKNOWN_ACCOUNT_LINE_SENTENCE.exec(dbUnknownAccountMessage(2, "9999"));
  assert.ok(m, "the component's exported sentence matcher must accept the database's own wording");
  assert.equal(m?.[1], "2", "…and must capture the line ordinal");
  assert.equal(
    UNKNOWN_ACCOUNT_LINE_SENTENCE.exec("some other refusal entirely"),
    null,
    "…and must not claim an unrelated refusal",
  );
});

test("799: a refused stock-adjustment Work names the resolved field beside the DB's unchanged message", async () => {
  const h = await renderComponent(
    App({
      load: async () =>
        data({
          work: workRow({
            purpose: "periodic_stock_adjustment",
            status: "refused",
            basis: {
              posting_date: "2026-09-01",
              memo: "Periodic stock adjustment",
              currency: "MYR",
              lines: [
                { account_code: "1200", debit_cents: 250_000, credit_cents: 0, description: "stock movement" },
                { account_code: "9999", debit_cents: 0, credit_cents: 250_000, description: "cost of sales" },
              ],
            },
            error: {
              code: "CLR10",
              reason: "unknown_account",
              message: dbUnknownAccountMessage(2, "9999"),
              recoverable: true,
            },
          }),
        }),
    }),
  );
  try {
    await h.settle();
    const text = h.text();
    assert.match(
      text,
      /line 2 codes to an account this client does not have active: 9999/,
      "the database's own sentence, unchanged",
    );
    assert.match(text, /Cost of sales account/, "the resolved field's own form label");
  } finally {
    await h.unmount();
  }
});

test("799: the generic line reference is the fallback for a journal_entry Work, another reason, and an ordinal past the basis", async () => {
  // A journal_entry Work: no adjustment fields to translate into, so no label at all.
  const journalWork = await renderComponent(
    App({
      load: async () =>
        data({
          work: workRow({
            purpose: "journal_entry",
            status: "refused",
            error: {
              code: "CLR10",
              reason: "unknown_account",
              message: dbUnknownAccountMessage(2, "9999"),
              recoverable: true,
            },
          }),
        }),
    }),
  );
  try {
    await journalWork.settle();
    const text = journalWork.text();
    assert.match(text, /line 2 codes to an account this client does not have active: 9999/);
    assert.doesNotMatch(text, /Cost of sales account|Inventory account/, "no adjustment-field label on a journal entry");
  } finally {
    await journalWork.unmount();
  }

  // The SAME purpose and basis, but a DIFFERENT refusal reason: no label.
  const otherReason = await renderComponent(
    App({
      load: async () =>
        data({
          work: workRow({
            purpose: "periodic_stock_adjustment",
            status: "refused",
            basis: {
              posting_date: "2026-09-01",
              memo: "Periodic stock adjustment",
              currency: "MYR",
              lines: [
                { account_code: "1200", debit_cents: 250_000, credit_cents: 0, description: "stock movement" },
                { account_code: "5040", debit_cents: 0, credit_cents: 250_000, description: "cost of sales" },
              ],
            },
            error: {
              code: "CLR10",
              reason: "write_into_closed_period",
              message: "September 2026 is closed for this client.",
              recoverable: true,
            },
          }),
        }),
    }),
  );
  try {
    await otherReason.settle();
    const text = otherReason.text();
    assert.match(text, /September 2026 is closed for this client\./);
    assert.doesNotMatch(text, /Cost of sales account|Inventory account/, "no label for a non-unknown_account reason");
  } finally {
    await otherReason.unmount();
  }

  // An ordinal PAST the basis (only two legs on a stock adjustment): no label.
  const pastBasis = await renderComponent(
    App({
      load: async () =>
        data({
          work: workRow({
            purpose: "periodic_stock_adjustment",
            status: "refused",
            basis: {
              posting_date: "2026-09-01",
              memo: "Periodic stock adjustment",
              currency: "MYR",
              lines: [
                { account_code: "1200", debit_cents: 250_000, credit_cents: 0, description: "stock movement" },
                { account_code: "5040", debit_cents: 0, credit_cents: 250_000, description: "cost of sales" },
              ],
            },
            error: {
              code: "CLR10",
              reason: "unknown_account",
              message: dbUnknownAccountMessage(3, "9999"),
              recoverable: true,
            },
          }),
        }),
    }),
  );
  try {
    await pastBasis.settle();
    const text = pastBasis.text();
    assert.match(text, /line 3 codes to an account this client does not have active: 9999/);
    assert.doesNotMatch(text, /Cost of sales account|Inventory account/, "ordinal 3 does not exist on a two-leg stock basis");
  } finally {
    await pastBasis.unmount();
  }
});

test("BUDGET EXHAUSTION is its own copy, and a REFUSED retry reports the current status", async () => {
  const h = await renderComponent(
    App({
      retry: async () => ({ kind: "not_retryable", status: "running" }),
      load: async () =>
        data({ work: workRow({ status: "failed", error: { code: "budget_exhausted", message: null, reason: null, recoverable: true } }) }),
    }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /ran out of its allowance/);
    const retry = buttonLabelled(h, "Run this again");
    assert.ok(retry);
    await h.fireEvent(retry, "click");
    await h.settle();
    assert.match(h.text(), /cannot be run again in its current state/);
    assert.match(h.text(), /running/, "the DB's CURRENT status accompanies the refusal");
  } finally {
    await h.unmount();
  }
});

test("a COMPLETED work offers NO retry — only a recoverable state may run again", async () => {
  const h = await renderComponent(App({ load: async () => data({ work: workRow({ status: "completed" }) }) }));
  try {
    await h.settle();
    assert.equal(buttonLabelled(h, "Run this again"), null);
  } finally {
    await h.unmount();
  }
});

test("AWAITING INPUT has ONE owner for the question text, and the row read is its fallback", async () => {
  // THE ORIGINAL DEFECT this cell fenced: the banner said only "this work asked a question", on a
  // page that had already read the row the question is in, so a human had to leave to find out
  // WHAT was asked.
  //
  // THE REVIEWED DEFECT IT NOW ALSO FENCES (#629): the fix above put the run's words in the
  // BANNER, and the question form below it then rendered the SAME sentence from the shared record
  // — one question, printed twice, read twice by a screen reader, and two places to disagree the
  // moment it is re-asked. §5's one-owner rule applies to text as much as to announcements, so the
  // banner now states the STATE and the thing that can be ANSWERED owns the question.
  //
  // The row read is not discarded: it rides into the panel as the fallback its door-unreachable
  // arm renders. In this harness `clara.get_work_question` is unreachable (no session, no fetch),
  // which is exactly that arm — so the run's own words are on screen, ONCE, from the fallback.
  const h = await renderComponent(
    App({
      load: async () =>
        data({
          work: workRow({ status: "awaiting_input", current_task_id: TASK }),
          interruption: parkedQuestion(),
        }),
    }),
  );
  try {
    await h.settle();
    const text = h.text();
    const asked = text.match(/Which bank account did the rent leave from\?/g) ?? [];
    assert.equal(asked.length, 1, "the question is on the page EXACTLY once");
    assert.match(text, /this client has two Maybank accounts/, "with the context the run supplied");
    assert.match(text, /asked a question and is parked/, "the banner states the STATE it is in");
    // The whole inbox is still one click away for somebody who wants it.
    assert.ok(hrefs(h.container).includes("/work?view=needs-you"));
  } finally {
    await h.unmount();
  }
});

test("AWAITING INPUT with NO readable question falls back to the honest sentence, never a placeholder", async () => {
  // Three causes, one rendering: the payload parses as neither `question` nor
  // `text`, the row is not visible to this caller, or two rows are pending. This
  // page distinguishes none of them and claims none of them.
  for (const interruption of [
    null,
    parkedQuestion({ question: { type: "clarify", framing: "no text at all" } }),
  ]) {
    const h = await renderComponent(
      App({
        load: async () =>
          data({ work: workRow({ status: "awaiting_input", current_task_id: TASK }), interruption }),
      }),
    );
    try {
      await h.settle();
      assert.match(h.text(), /asked a question and is parked/);
      assert.ok(hrefs(h.container).includes("/work?view=needs-you"));
    } finally {
      await h.unmount();
    }
  }
});

test("BASIS ORIGIN is a fact on the page: who typed the figures, or that Clara read them off a conversation", async () => {
  // The column existed and rendered NOWHERE. `source_refs` answers "was there a
  // document"; `basis_origin` answers "did a human type these cents" — a
  // different question, and the one a professional reading a posted entry needs.
  const direct = await renderComponent(App({ load: async () => data() }));
  try {
    await direct.settle();
    assert.match(direct.text(), /Figures from/);
    assert.match(direct.text(), /Entered by/);
    // The roster read is not stubbed here, so the resolver falls through to the
    // shortened raw id — the documented fallback, never a guessed name.
    assert.ok(!/Interpreted by Clara/.test(direct.text()));
  } finally {
    await direct.unmount();
  }

  const interpreted = await renderComponent(
    App({
      load: async () =>
        data({
          work: workRow({
            basis_origin: "clara_interpreted",
            source_refs: [{ kind: "chat_task", task_id: TASK, session_id: "s1" }],
          }),
        }),
    }),
  );
  try {
    await interpreted.settle();
    assert.match(interpreted.text(), /Interpreted by Clara from a conversation/);
    // A REAL in-app path: this product has no per-thread route, so the link goes
    // to the workspace whose rail opens this client's conversation.
    assert.ok(hrefs(interpreted.container).includes(`/clients/${CLIENT}`));
  } finally {
    await interpreted.unmount();
  }
});

test("an UNKNOWN basis_origin renders VERBATIM rather than crashing a message lookup", async () => {
  const h = await renderComponent(
    App({ load: async () => data({ work: workRow({ basis_origin: "some_future_origin" }) }) }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /some_future_origin/);
  } finally {
    await h.unmount();
  }
});

test("EDIT AS A NEW DRAFT seeds the composer from this basis, under a NEW intent identity", async () => {
  const store = memoryStorage();
  const h = await renderComponent(
    App({
      scope: { firmId: FIRM, userId: USER },
      storage: store,
      load: async () =>
        data({
          work: workRow({
            status: "refused",
            error: { code: "CLR10", reason: "write_into_closed_period", message: "Closed.", recoverable: true },
          }),
        }),
    }),
  );
  try {
    await h.settle();
    const link = h.find(
      (n) =>
        n.tagName === "A" &&
        String((n as { textContent?: string }).textContent ?? "").includes("Edit as a new draft"),
    );
    assert.ok(link, "the refused state offers the edit route");
    assert.equal(store.map.size, 0, "nothing is written until the human asks for it");

    await h.fireEvent(link, "click");
    await h.settle();

    const key = journalDraftKey({ userId: USER, firmId: FIRM, clientId: CLIENT });
    const raw = store.map.get(key);
    assert.ok(raw, `no draft filed under ${key}`);
    const draft = JSON.parse(raw) as { intentKey: string; postingDate: string; memo: string; lines: unknown[] };
    assert.equal(draft.postingDate, "2026-09-01");
    assert.equal(draft.memo, "Office rent, September");
    assert.equal(draft.lines.length, 2);
    // THE WHOLE POINT: a NEW identity. Re-running the SAME figures is `/retry`;
    // editing them is a different economic intent, and carrying the admitted key
    // would earn an `intent_payload_conflict` for doing what the link said.
    assert.match(draft.intentKey, /^[0-9a-f-]{36}$/i);
    assert.notEqual(draft.intentKey, "intent-1");
  } finally {
    await h.unmount();
  }
});

test("EDIT AS A NEW DRAFT with NO scope writes nothing — a draft under a guessed key is worse than none", async () => {
  const store = memoryStorage();
  const h = await renderComponent(
    App({
      // No firm/user: the provider could not supply them.
      storage: store,
      load: async () => data({ work: workRow({ status: "refused" }) }),
    }),
  );
  try {
    await h.settle();
    const link = h.find(
      (n) =>
        n.tagName === "A" &&
        String((n as { textContent?: string }).textContent ?? "").includes("Edit as a new draft"),
    );
    assert.ok(link);
    await h.fireEvent(link, "click");
    await h.settle();
    assert.equal(store.map.size, 0);
    // The link still goes to the composer — it simply opens an empty one.
    assert.ok(hrefs(h.container).includes(`/clients/${CLIENT}/accounting/journal/new`));
  } finally {
    await h.unmount();
  }
});

test("A PERMISSION LOSS CLEARS the protected data — it is not a transient failure to paper over", async () => {
  // §3's two halves, and they point OPPOSITE ways: a transport failure RETAINS
  // the labelled prior data, an authority failure REMOVES it. The asymmetry is
  // the whole reason the hook inspects the error's kind rather than its message.
  let attempt = 0;
  const h = await renderComponent(
    App({
      load: async () => {
        attempt += 1;
        if (attempt === 1) return data();
        throw new ReadError("permission denied", { status: 403, kind: "forbidden" });
      },
    }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /Office rent, September/);

    await h.act(async () => { await new Promise((r) => setTimeout(r, 3_100)); });
    await h.settle();
    assert.ok(attempt >= 2);
    const text = h.text();
    assert.match(text, /Your access to this client changed/);
    assert.ok(!/Office rent, September/.test(text), "protected figures must not survive the loss of access to them");
  } finally {
    await h.unmount();
  }
});

test("a TRANSIENT read failure keeps the last DATED value with a read-again control", async () => {
  let attempt = 0;
  const clock = { now: 1_000_000 };
  const h = await renderComponent(
    App({
      now: () => clock.now,
      load: async () => {
        attempt += 1;
        if (attempt === 1) return data();
        throw new Error("network down");
      },
    }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /Office rent, September/);

    // The poll's own tick drives the second, failing read.
    await h.act(async () => { await new Promise((r) => setTimeout(r, 3_100)); });
    await h.settle();
    assert.ok(attempt >= 2, "the poll asked again while the work was non-terminal");
    const text = h.text();
    assert.match(text, /Office rent, September/, "the last successful read is still on screen");
    assert.match(text, /Showing the state as at/, "and it is DATED, so nobody reads it as current");
    assert.ok(buttonLabelled(h, "Read again"), "with a way to try the read again");
  } finally {
    await h.unmount();
  }
});

test("after a minute with no successful read the page says UPDATE DELAYED, naming the last read's time", async () => {
  let attempt = 0;
  const clock = { now: 1_000_000 };
  const h = await renderComponent(
    App({
      now: () => clock.now,
      load: async () => {
        attempt += 1;
        if (attempt === 1) return data();
        throw new Error("network down");
      },
    }),
  );
  try {
    await h.settle();
    // The clock moves past the staleness threshold; the page's own timer then
    // observes it. `delayed` is about the READ, not about the Work.
    clock.now += WORK_STALE_AFTER_MS + 1;
    await h.act(async () => { await new Promise((r) => setTimeout(r, 3_100)); });
    await h.settle();
    assert.match(h.text(), /Update delayed\. The last successful read was/);
  } finally {
    await h.unmount();
  }
});

test("THE POLL STOPS on a terminal work — a settled record never changes again", async () => {
  let calls = 0;
  const h = await renderComponent(
    App({
      load: async () => {
        calls += 1;
        return data({ work: workRow({ status: "completed" }) });
      },
    }),
  );
  try {
    await h.settle();
    assert.equal(calls, 1);
    await h.act(async () => { await new Promise((r) => setTimeout(r, 6_500)); });
    await h.settle();
    assert.equal(calls, 1, "two poll windows passed and the page asked nothing more");
  } finally {
    await h.unmount();
  }
});

test("THE HEADING TAKES FOCUS ON ARRIVAL, and only on arrival", async () => {
  // The `<h1>` is rendered by the server page above this component, so the
  // effect looks it up by the id both sides share. The stub document has no
  // `getElementById` of its own — installing one is how this cell observes the
  // call the browser would make.
  const doc = globalThis.document as unknown as { getElementById?: (id: string) => unknown };
  const original = doc.getElementById;
  const focused: string[] = [];
  doc.getElementById = (id: string) => ({ focus: () => focused.push(id) });
  try {
    const h = await renderComponent(App({ load: async () => data() }));
    try {
      await h.settle();
      assert.deepEqual(focused, [WORK_HEADING_ID]);
      // A background poll must not steal focus back.
      await h.act(async () => { await new Promise((r) => setTimeout(r, 3_100)); });
      await h.settle();
      assert.deepEqual(focused, [WORK_HEADING_ID], "a status update is not an arrival");
    } finally {
      await h.unmount();
    }
  } finally {
    if (original === undefined) delete doc.getElementById;
    else doc.getElementById = original;
  }
});

// ---------------------------------------------------------------------------
// #634 review — the LINKS read is an accounting fact, and a failed read is not
// the fact "no document".
// ---------------------------------------------------------------------------

/** The completed Work whose entry is posted, with the links read injectable. */
function postedApp(over: {
  loadLinks?: (clientId: string, entryIds: readonly string[]) => Promise<EntryLinkRow[]>;
} = {}): ReactElement {
  return App({
    loadLinks: over.loadLinks,
    load: async () =>
      data({
        work: workRow({ status: "completed", result: { entry_id: ENTRY, receipt_id: "receipt-1", posted_at: "2026-09-01T02:00:00Z" } }),
        entry: {
          id: ENTRY, client_id: CLIENT, status: "approved", posting_date: "2026-09-01", memo: "Office rent",
          origin: "agent", document_id: null, coding_kind: null, revision_token: "rev", maker_actor: null,
          checker_actor: null, approved_at: "2026-09-01T02:00:00Z", reversal_of: null, reversed_by: null,
          reversal_reason: null, withdrawn_at: null, withdrawal_reason: null, created_at: "2026-09-01T02:00:00Z",
        },
        lines: [
          { id: "l1", entry_id: ENTRY, line_no: 1, account_code: "6100", debit_cents: 120_000, credit_cents: 0, description: "rent", counterparty_id: null },
          { id: "l2", entry_id: ENTRY, line_no: 2, account_code: "1100", debit_cents: 0, credit_cents: 120_000, description: null, counterparty_id: null },
        ],
      }),
  });
}

test("a SUCCESSFUL links read that finds no source says No document, and offers the late door", async () => {
  const h = await renderComponent(postedApp({ loadLinks: async () => [linkRow()] }));
  try {
    await h.settle();
    assert.match(h.text(), /No document/, "an entry recorded without evidence is a legitimate state, said in words");
    assert.ok(buttonLabelled(h, "Attach evidence") !== null, "…and the late door is offered");
  } finally {
    await h.unmount();
  }
});

test("a FAILED links read never renders as the accounting fact 'No document'", async () => {
  // THE DEFECT THIS CELL FENCES. `loadLinks(...).catch(() => [])` made an
  // unreadable answer indistinguishable from a read that succeeded and found
  // nothing — the page asserted, about a posted entry, that it has no source,
  // on the strength of its own failed request. And it then offered "Attach
  // evidence" on that guess, sending a preparer into a door that may answer
  // `evidence_already_attached`.
  const h = await renderComponent(postedApp({ loadLinks: async () => { throw new Error("gateway"); } }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /could not read the Work, receipt and source links/,
      "the page says what it could not read");
    assert.ok(!/No document/.test(text), "…and never asserts an absence it did not establish");
    assert.equal(buttonLabelled(h, "Attach evidence"), null,
      "the late door is gated on a SUCCESSFUL read, not on the absence of an answer");
    // The entry, its lines and its receipt are the DATABASE's own and stay.
    assert.match(text, /What was recorded/);
    assert.match(text, /1,200\.00/, "a failed links read never blanks the money");
  } finally {
    await h.unmount();
  }
});

test("the PURPOSE of the Work is rendered, not merely fetched", async () => {
  // `accounting_work.purpose` is read by list_entry_links and by every surface
  // on this journey, and was rendered by none of them.
  const h = await renderComponent(postedApp({ loadLinks: async () => [linkRow()] }));
  try {
    await h.settle();
    assert.match(h.text(), /Purpose/);
    assert.match(h.text(), /Journal entry/);
  } finally {
    await h.unmount();
  }
});

test("a REVERSED entry is not offered the late door — its source belongs on the correction", async () => {
  const h = await renderComponent(
    postedApp({ loadLinks: async () => [linkRow({ reversed_by: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9" })] }),
  );
  try {
    await h.settle();
    assert.equal(buttonLabelled(h, "Attach evidence"), null,
      "migration 0182 refuses entry_reversed; the affordance must not invite the refusal");
  } finally {
    await h.unmount();
  }
});

test("an entry that ALREADY carries a source shows it and offers no second attachment", async () => {
  const DOC = "11111111-2222-4333-8444-555555555555";
  const h = await renderComponent(
    postedApp({ loadLinks: async () => [linkRow({ document_id: DOC, document_source: "work_commit" })] }),
  );
  try {
    await h.settle();
    assert.match(h.text(), new RegExp(DOC));
    assert.equal(buttonLabelled(h, "Attach evidence"), null);
  } finally {
    await h.unmount();
  }
});

// ===========================================================================
// #630 — CANCEL WORK, and TAKE RESPONSIBILITY.
// ===========================================================================

test("630 a STOPPING work says WHY it is not a terminal yet, and offers NO second cancel", async () => {
  const h = await renderComponent(App({ load: async () => data({ work: workRow({ status: "stopping" }) }) }));
  try {
    await h.settle();
    assert.match(h.text(), /Stopping/);
    assert.match(h.text(), /already accepted is finishing/, "the reason the terminal is not shown yet");
    assert.equal(buttonLabelled(h, "Cancel Work"), null,
      "a Work that is already stopping has nothing left to cancel");
    // …and emphatically NOT the terminal, early.
    assert.ok(!/Nothing was posted\./.test(h.text()), "never a cancellation this page cannot prove");
  } finally {
    await h.unmount();
  }
});

test("630 a CANCELLED work shows the run's superseded outcome when the settle translated one", async () => {
  const h = await renderComponent(
    App({
      load: async () =>
        data({
          work: workRow({
            status: "cancelled",
            error: {
              code: "cancelled", reason: "cancelled", recoverable: true,
              message: "This Work was cancelled before an entry was recorded. Nothing was posted.",
              superseded: { outcome: "failed", error_code: "internal", error: { reason: "work_cancelled" } },
            } as never,
          }),
        }),
    }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /Cancelled/);
    assert.match(h.text(), /The run reported failed as it stopped\./,
      "what the run asked for is kept, never discarded");
  } finally {
    await h.unmount();
  }
});

// #750 -----------------------------------------------------------------------------------------
test("750 a CANCELLED work NAMES who pressed Cancel and when; a run that carries neither says nothing extra", async () => {
  const cancelled = (task: Record<string, unknown> | null) =>
    data({
      work: workRow({ status: "cancelled", current_task_id: TASK }),
      task: task as never,
    });

  // THE RUN CARRIES THE PRESS. `clara.cancel_accounting_work` records the author on
  // `clara.agent_tasks.cancelled_by/cancelled_at` (0184 §G) and the masked view republishes both.
  const named = await renderComponent(
    App({
      load: async () =>
        cancelled({
          id: TASK, status: "cancelled", error_code: null,
          created_at: "2026-09-01T01:00:00.000Z", updated_at: "2026-09-12T06:14:00.000Z",
          cancelled_by: USER, cancelled_at: "2026-09-12T06:14:00.000Z",
        }),
    }),
  );
  try {
    await named.settle();
    assert.match(named.text(), /Cancelled by/, "750 the banner says a person did this");
    // The roster read is not mocked here, so `MemberName` falls through to its honest raw-id
    // rendering — which is the CONTRACT (lib/members/use-member-names.ts), not a shortcoming: a
    // name it cannot resolve is never guessed. The cell asserts the id it actually printed.
    assert.match(named.text(), new RegExp(USER.slice(0, 8)), "750 …and names them");
    assert.match(named.text(), /12 Sept 2026/, "750 …and when, in the firm's business timezone");
  } finally {
    await named.unmount();
  }

  // NEITHER HALF, NO LINE. A "Cancelled by" with nothing after it is worse than the plain banner.
  const bare = await renderComponent(App({ load: async () => cancelled(null) }));
  try {
    await bare.settle();
    assert.match(bare.text(), /Cancelled/, "750 the banner itself is unchanged");
    assert.equal(/Cancelled by/.test(bare.text()), false,
      "750 …and claims no author when the run carries none");
  } finally {
    await bare.unmount();
  }
});
// #750 -----------------------------------------------------------------------------------------

// #721 -----------------------------------------------------------------------------------------
test("721 B3 links a restated Work BOTH WAYS, and offers the restatement beside a pending question", async () => {
  const OTHER = "99999999-9999-4999-8999-999999999999";

  // THE SUCCESSOR, pointing back.
  const forward = await renderComponent(
    App({ load: async () => data({ work: workRow({ supersedes: OTHER }) }) }),
  );
  try {
    await forward.settle();
    assert.match(forward.text(), /Supersedes/, "721 the successor says what it replaced");
    assert.ok(hrefs(forward.container).some((h) => h.includes(OTHER)),
      "721 …and links to it, so a refusal can be read against the basis that was admitted");
  } finally {
    await forward.unmount();
  }

  // THE PREDECESSOR, pointing forward.
  const back = await renderComponent(
    App({ load: async () => data({ work: workRow({ status: "cancelled", superseded_by: OTHER }) }) }),
  );
  try {
    await back.settle();
    assert.match(back.text(), /Superseded by/, "721 the retired Work says what replaced it");
    assert.ok(hrefs(back.container).some((h) => h.includes(OTHER)), "721 …and links to it");
  } finally {
    await back.unmount();
  }

  // NEITHER HALF, NEITHER ROW. Almost every Work was never restated.
  const plain = await renderComponent(App({ load: async () => data() }));
  try {
    await plain.settle();
    assert.equal(/Supersedes|Superseded by/.test(plain.text()), false,
      "721 a Work that was never restated shows no supersession row at all");
  } finally {
    await plain.unmount();
  }

  // THE AFFORDANCE, beside the question a person may disagree with rather than merely answer.
  const parked = await renderComponent(
    App({
      load: async () => data({
        work: workRow({ status: "awaiting_input", current_task_id: TASK }),
        interruption: parkedQuestion(),
      }),
    }),
  );
  try {
    await parked.settle();
    assert.match(parked.text(), /Restate as a new instruction/,
      "721 a parked Work offers the other answer: a new instruction");
  } finally {
    await parked.unmount();
  }
});
// #721 -----------------------------------------------------------------------------------------

test("630 an authority_lost refusal offers Take responsibility; a plain failure does not", async () => {
  const taken: Array<{ workId: string; basisDigest?: string | null }> = [];
  const orphaned = () =>
    data({
      work: workRow({
        status: "refused",
        error: { code: "CLR04", reason: "authority_lost", message: "The person who asked for this Work is no longer an active member of the firm.", recoverable: true },
      }),
    });
  const h = await renderComponent(
    App({ load: async () => orphaned(), takeOver: async (_a, input) => { taken.push(input); return { kind: "accepted", workId: WORK, taskId: "t2", logicalOpId: "op", status: "queued", replayed: false, responsible: "user-2", previousResponsible: USER, initiatedBy: USER, takenOver: true }; } }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /waiting for someone who can finish it/);
    const take = buttonLabelled(h, "Take responsibility");
    assert.ok(take, "a colleague is offered the Work");
    // A `user_direct` basis needs NO confirm step — the figures were typed by a human.
    await h.fireEvent(take, "click");
    await h.settle();
    assert.equal(taken.length, 1);
    assert.equal(taken[0]!.basisDigest ?? null, null, "no digest is sent for a user_direct basis");
    assert.match(h.text(), /You are responsible for this Work/);
  } finally {
    await h.unmount();
  }

  const plain = await renderComponent(
    App({
      load: async () =>
        data({ work: workRow({ status: "failed", error: { code: "internal", reason: "no_effect", message: "nothing", recoverable: true } }) }),
    }),
  );
  try {
    await plain.settle();
    assert.equal(buttonLabelled(plain, "Take responsibility"), null,
      "a Work whose person is still authorised is the Retry's job, not a takeover's");
  } finally {
    await plain.unmount();
  }
});

test("630 Cancel Work is OFFERED from a cancellable status and withheld from every other one", async () => {
  // The dialog's own behaviour lives in work-cancel-dialog.test.tsx (its content is PORTALLED to
  // document.body, which this file's delegation root never reaches). What belongs HERE is the
  // page's decision about whether to offer the control at all.
  for (const status of ["queued", "running", "awaiting_input"]) {
    const h = await renderComponent(App({ load: async () => data({ work: workRow({ status }) }) }));
    try {
      await h.settle();
      assert.ok(buttonLabelled(h, "Cancel Work"), `a ${status} Work can be cancelled`);
    } finally {
      await h.unmount();
    }
  }
  for (const status of ["stopping", "completed", "cancelled", "refused", "failed", "expired"]) {
    const h = await renderComponent(App({ load: async () => data({ work: workRow({ status }) }) }));
    try {
      await h.settle();
      assert.equal(buttonLabelled(h, "Cancel Work"), null, `a ${status} Work has nothing left to cancel`);
    } finally {
      await h.unmount();
    }
  }
});

test("630 after a HANDOVER the page attributes the figures to who ENTERED them, and names who is answerable now", async () => {
  // The two columns diverge only after `clara.take_over_accounting_work`. Before that they are the
  // same value and this page says exactly what it always said — which is why the handover row is
  // conditional rather than always present.
  const h = await renderComponent(
    App({
      load: async () =>
        data({ work: workRow({ status: "queued", initiator: "user-2", initiated_by: "user-1" }) }),
    }),
  );
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /Responsible now/, "the handover is visible on the page that shows the Work");
    // `MemberName` falls back to a shortened raw id when it cannot resolve a name, which is what
    // this harness produces — so both ids are on the page and neither is invented.
    assert.match(text, /user-1/, "who ENTERED the figures is still named");
    assert.match(text, /user-2/, "…and so is who is answerable now");
  } finally {
    await h.unmount();
  }

  const untouched = await renderComponent(
    App({ load: async () => data({ work: workRow({ status: "queued" }) }) }),
  );
  try {
    await untouched.settle();
    assert.ok(!/Responsible now/.test(untouched.text()),
      "a Work nobody took over carries no handover row — it would be noise on every Work");
  } finally {
    await untouched.unmount();
  }
});

test("630 a VIEWER is offered neither destructive control — both doors floor at bookkeeper", async () => {
  // `clara.cancel_accounting_work` and `clara.take_over_accounting_work` both raise CLR04
  // `insufficient_role` below bookkeeper, so offering either to a viewer is a destructive button in
  // front of somebody who can only ever be handed a 403. The rank is the DATABASE's own
  // `role_rank`, never re-derived from the role's spelling.
  const running = await renderComponent(
    App({ scope: { roleRank: VIEWER_RANK }, load: async () => data({ work: workRow({ status: "running" }) }) }),
  );
  try {
    await running.settle();
    assert.equal(buttonLabelled(running, "Cancel Work"), null, "a viewer is not offered Cancel Work");
  } finally {
    await running.unmount();
  }

  const orphaned = await renderComponent(
    App({
      scope: { roleRank: VIEWER_RANK },
      load: async () =>
        data({
          work: workRow({
            status: "refused",
            error: { code: "CLR10", reason: "authority_lost", message: "no longer a member", recoverable: true },
          }),
        }),
    }),
  );
  try {
    await orphaned.settle();
    assert.equal(buttonLabelled(orphaned, "Take responsibility"), null,
      "…nor Take responsibility, which moves who a posting is committed under");
  } finally {
    await orphaned.unmount();
  }

  // …and an ABSENT rank fails closed rather than open.
  const unknown = await renderComponent(
    App({ scope: { roleRank: null }, load: async () => data({ work: workRow({ status: "running" }) }) }),
  );
  try {
    await unknown.settle();
    assert.equal(buttonLabelled(unknown, "Cancel Work"), null, "an unreadable rank meets no floor");
  } finally {
    await unknown.unmount();
  }
});

test("630 the cancel control is the SAME NODE across the poll flipping awaiting_input to running", async () => {
  // MEASURED SHAPE (review round 2): matching the two arms' wrapper tag and class was NOT the fix.
  // The parked arm passed TWO children to that slot (the Needs-you link, then the dialog) and the
  // running arm passed ONE; React reconciles a single-child slot against the FIRST existing child,
  // whose type differs, so it deleted the subtree and mounted a fresh, CLOSED dialog. The open
  // modal a bookkeeper was reading vanished with no dismissal, focus fell to `<body>`, and a submit
  // in flight lost its op key — after which `clara._reserve_op` could no longer connect the two
  // attempts. A signature cell could not see any of it: `DIV:flex flex-wrap items-center gap-3`
  // read the same on both sides of exactly the code the finding was about.
  //
  // SO THIS ASSERTS IDENTITY. The control now lives in the detail view's own action bar, at one
  // position no status arm can move, and the node itself must survive the transition.
  let status = "awaiting_input";
  const h = await renderComponent(
    App({ load: async () => data({ work: workRow({ status }) }) }),
  );
  try {
    await settleUntil(h, () => /parked until someone answers it/.test(h.text()), "the parked arm");
    const before = buttonLabelled(h, "Cancel Work");
    assert.ok(before, "a parked Work is cancellable");

    status = "running";
    await h.act(async () => { await h.rerender(App({ load: async () => data({ work: workRow({ status }) }) })); });
    // THE FLIP MUST ACTUALLY BE OBSERVED, or the cell asserts identity across a re-render that
    // never changed arms — which is a green over exactly the defect it exists for.
    await settleUntil(h, () => /This work is running/.test(h.text()), "the running arm");
    assert.doesNotMatch(h.text(), /parked until someone answers it/, "the parked arm is gone");
    const after = buttonLabelled(h, "Cancel Work");
    assert.ok(after, "…and so is a running one");
    // `assert.ok(a === b)` rather than `assert.equal`: the harness's stub nodes are cyclic and the
    // deep-equality path walks them forever.
    assert.ok(before === after,
      "the SAME node, not an equivalent one: a remount here destroys an open modal mid-decision");

    // …and back again, because the flip happens in both directions between two polls.
    status = "awaiting_input";
    await h.act(async () => { await h.rerender(App({ load: async () => data({ work: workRow({ status }) }) })); });
    await settleUntil(h, () => /parked until someone answers it/.test(h.text()), "the parked arm again");
    assert.ok(buttonLabelled(h, "Cancel Work") === before, "…in the other direction too");
  } finally {
    await h.unmount();
  }
});

test("630 the cancel control is OUTSIDE every status banner, so no status arm owns it", async () => {
  // The structural half of the same claim, and the one that would catch a later edit putting the
  // control back inside an arm: the trigger must not be a descendant of the status banner.
  const h = await renderComponent(App({ load: async () => data({ work: workRow({ status: "running" }) }) }));
  try {
    await h.settle();
    const trigger = buttonLabelled(h, "Cancel Work");
    assert.ok(trigger, "the control renders");
    // `StateBanner`'s root carries `max-w-prose … rounded-lg border p-3` (components/common/state.tsx).
    // A banner that CONTAINS the trigger is a banner that owns it, and owning it means the next
    // status change takes it down mid-decision.
    const banner = h.find((n) => {
      const cls = typeof n.getAttribute === "function"
        ? (n.getAttribute as (k: string) => string | null)("class")
        : null;
      return n.tagName === "DIV" && cls !== null && cls.includes("max-w-prose") && cls.includes("rounded-lg")
        && String((n as { textContent?: string }).textContent ?? "").includes("Cancel Work");
    });
    // `assert.ok(x === null)`, never `assert.equal`: formatting a stub node for the failure message
    // walks a cyclic tree and exhausts the heap before the assertion is ever reported.
    assert.ok(banner === null,
      "no status banner contains the destructive control — the banner says what the status MEANS, "
      + "and a control inside it is a control the next poll can destroy");
  } finally {
    await h.unmount();
  }
});

// ===========================================================================================
// #641 — the three related views of one Work, and the ORDER the acceptance criterion names.
// ===========================================================================================

/** Every node in document order, so a cell can assert that one element PRECEDES another rather
 *  than merely that both exist. `h.text()` already concatenates text in document order, which is
 *  what the DOM-order cell below measures against; this walks the element tree for the cells that
 *  need the nodes themselves. */
function inDocumentOrder(root: Stub): Stub[] {
  const out: Stub[] = [];
  const visit = (n: Stub) => {
    out.push(n);
    for (const c of ((n as { childNodes?: Stub[] }).childNodes ?? [])) visit(c);
  };
  visit(root);
  return out;
}

test("641 the CURRENT QUESTION precedes the Results/Sources/Activity tabs in DOM order", async () => {
  // AC3's own words: "Work detail keeps the current question above Results/Sources/Activity
  // views". This is the structural half of that claim and the one that survives a later edit
  // moving the tab strip: a question rendered BELOW a tab strip is a question a person may never
  // open, on a page whose whole job is to surface what is waiting on them.
  const h = await renderComponent(
    App({
      load: async () =>
        data({
          work: workRow({ status: "awaiting_input", current_task_id: TASK }),
          interruption: parkedQuestion(),
        }),
    }),
  );
  try {
    await h.settle();
    const nodes = inDocumentOrder(h.container);
    const questionIndex = nodes.findIndex((n) =>
      String((n as { textContent?: string }).textContent ?? "").includes("Which bank account did the rent leave from?"));
    const tablistIndex = nodes.findIndex((n) => {
      const get = typeof n.getAttribute === "function" ? (n.getAttribute as (k: string) => string | null) : null;
      return get?.("data-slot") === "tabs-list";
    });
    assert.ok(questionIndex >= 0, "the parked question is on the page");
    assert.ok(tablistIndex >= 0, "the tab strip is on the page");
    assert.ok(
      questionIndex < tablistIndex,
      `the question must precede the tab strip in DOM order (question @${questionIndex}, tabs @${tablistIndex})`,
    );
  } finally {
    await h.unmount();
  }
});

test("641 switching a tab fires NO write and no further read of the Work", async () => {
  // Appendix C §4: "Tab switching never invokes a write." Measured as the ABSENCE of both a
  // mutating call and an extra load — a cell that only checked the writes would pass on a build
  // that re-read the whole Work on every tab press.
  let loads = 0;
  let writes = 0;
  const countWrite = async () => {
    writes += 1;
    return { kind: "accepted" } as never;
  };
  const h = await renderComponent(
    App({
      load: async () => {
        loads += 1;
        return data({ work: workRow({ status: "completed" }) });
      },
      retry: countWrite,
      cancel: countWrite,
      takeOver: countWrite,
    }),
  );
  try {
    await h.settle();
    const loadsBefore = loads;
    const sources = h.find((n) =>
      n.tagName === "BUTTON" && String((n as { textContent?: string }).textContent ?? "").trim() === "Sources");
    assert.ok(sources, "the Sources tab is a real control");
    await clickButton(sources);
    await h.settle();
    assert.equal(writes, 0, "a tab press is not an act on the Work");
    assert.equal(loads, loadsBefore, "and it does not re-read the Work either");
    // The tab it revealed is genuinely the current one — asserted on the tab's own ARIA state
    // rather than on text, because both non-Activity panels are `keepMounted` (so their text is in
    // the DOM either way, hidden while they are not current).
    assert.equal(
      typeof sources.getAttribute === "function"
        ? (sources.getAttribute as (k: string) => string | null)("aria-selected")
        : null,
      "true",
      "the Sources tab is the selected one after the press",
    );
  } finally {
    await h.unmount();
  }
});

test("641 the Results tab says so when nothing has been posted yet, rather than rendering an empty region", async () => {
  const h = await renderComponent(App({ load: async () => data({ work: workRow({ status: "running" }) }) }));
  try {
    await h.settle();
    assert.match(h.text(), /Nothing has been posted for this work yet/);
  } finally {
    await h.unmount();
  }
});

// ── #624 AC4, the WORK half ────────────────────────────────────────────────────────────────────
//
// "Documents AND Work show the four states" is ONE acceptance criterion across TWO surfaces.
// #624 shipped the Documents half on its own branch (`components/documents/document-state-panel.tsx`
// inside `document-detail.tsx`); the Work half could not be built there because #641's Sources tab
// did not exist yet on that branch, so it is a wave-2 integration and these cells are what turn it
// into a claim. The SAME panel over the SAME read (`clara.get_document_state`) — a Work that cites
// a document Clara derived nothing from must not read differently here than it does on Documents.

const SOURCE_DOC = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";

/** `clara.get_document_state`'s own jsonb, in the shape `lib/documents/document-state.ts`
 *  narrows — every key below exists in 0191's `jsonb_build_object`, so a fixture drift shows up
 *  as a type error rather than as a green cell about a shape the door cannot return. */
function documentState(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    document_id: SOURCE_DOC,
    document_kind: "invoice",
    mime_type: "application/pdf",
    format: "pdf",
    capability: {
      format: "pdf", document_kind: "invoice", mime_type: "application/pdf",
      custody: "supported", byte_extraction: "supported",
      typed_facts: "supported", business_operation: "supported",
      engine_id: "llm-openai:gpt-5.6-terra:v2", engine_byte: "azure-di:prebuilt-layout:2024-11-30",
      registry_version: 1,
      basis: "Bytes are sealed at intake and read by azure-di:prebuilt-layout:2024-11-30.",
      limits: {}, known_pair: true, kind_known: true,
    },
    custody: {
      state: "verified", sha256: "a".repeat(64), byte_size: 20480,
      bytes_verified_at: "2026-09-01T00:00:01.000Z", legal_hold: false, legal_hold_reason: null,
      retention_state: "unanchored", retain_until: null, capability: "supported",
    },
    byte_extraction: {
      status: "done", page_count: 1, capability: "supported",
      engine_id: "azure-di:prebuilt-layout:2024-11-30",
      tasks: [{
        id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0cff01", lane: "ocr", status: "done",
        engine_id: "azure-di:prebuilt-layout:2024-11-30", version_n: 1, attempt_count: 1,
        error_code: null, finished_at: "2026-09-01T00:00:02.000Z",
      }],
    },
    facts: {
      capability: "supported", limits: {},
      extractions: [{
        id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0cee01", engine_kind: "llm_text_facts",
        engine_id: "llm-openai:gpt-5.6-terra:v2", version_n: 1, status: "done",
        superseded_by: null, extracted_at: "2026-09-01T00:00:03.000Z", region_count: 4,
      }],
      validations: [{
        check_name: "invoice.six_term_identity", outcome: "pass", detail: {},
        extraction_id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0cee01", statement_id: null,
        engine_id: "llm-openai:gpt-5.6-terra:v2", evaluated_at: "2026-09-01T00:00:04.000Z",
      }],
    },
    operation: { capability: "supported", codeable_kind: true, entries: [], statements: [] },
    lineage: {
      sha256: "a".repeat(64), intakes: [], corrections: [],
      authoritative_extraction_id: null, filings: [],
    },
    ...over,
  };
}

type DoorCall = { url: string; method: string };

/** Stubs `fetch` for the ONE door this half adds, and hands the cell every call it saw.
 *
 *  IT ROUTES BY URL rather than answering everything with the same payload, and that is not
 *  tidiness: the page also mounts `useMemberNames`, whose read expects an ARRAY, so a blanket stub
 *  made every one of these cells fail inside the member resolver — i.e. red for a reason that has
 *  nothing to do with the states this file is measuring. Every other request gets the honest empty
 *  answer its reader can handle. */
async function withStateDoor(answer: unknown, run: (calls: DoorCall[]) => Promise<void>): Promise<void> {
  const calls: DoorCall[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    calls.push({ url, method: String(init?.method ?? "GET").toUpperCase() });
    const body = url.includes("/rest/v1/rpc/get_document_state") ? answer : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

function stateDoorCalls(calls: DoorCall[]): DoorCall[] {
  return calls.filter((c) => c.url.includes("/rest/v1/rpc/get_document_state"));
}

/** #638 — `clara.get_work_claim_origin` is the IDENTITY BLOCK's read, fired ONCE on mount for every
 *  Work (`work-detail.tsx`'s `loadClaimOrigin` effect), because a staff expense claim is admitted
 *  with purpose `journal_entry` and the purpose alone therefore cannot say what a Work IS. It is
 *  neither a Sources door nor an act on the Work, so the two cells below exclude it BY NAME and
 *  then PIN what it actually did — one read on mount, and not one more per tab press. Widening
 *  their filters to "anything that is not get_document_state" would have made the same red go away
 *  while quietly admitting any number of new doors. */
function claimOriginCalls(calls: DoorCall[]): DoorCall[] {
  return calls.filter((c) => c.url.includes("/rest/v1/rpc/get_work_claim_origin"));
}

/** #655 — `clara.get_trade_invoice` is the SAME SHAPE of read as `get_work_claim_origin` above and
 *  is here for the same reason: a trade invoice is admitted with purpose `journal_entry`, so the
 *  purpose alone cannot say the Work IS one, and the read answers NULL for every Work that is not.
 *  It is the IDENTITY/LINK block's mount effect, not a Sources door and not an act on the Work, so
 *  the cells below exclude it BY NAME and then PIN what it actually did — one read on mount, and
 *  not one more per tab press. */
function tradeInvoiceCalls(calls: DoorCall[]): DoorCall[] {
  return calls.filter((c) => c.url.includes("/rest/v1/rpc/get_trade_invoice"));
}

/** #658 — the Sources tab's knowledge block reads `clara.work_knowledge_drift` once on mount. It
 *  is a READ that happens to be a POST (every door on this app is), so the two cells below exclude
 *  it BY NAME and PIN its count rather than widening their mutating-request test into uselessness. */
function driftCalls(calls: DoorCall[]): DoorCall[] {
  return calls.filter((c) => c.url.includes("/rest/v1/rpc/work_knowledge_drift"));
}

/** The four states are announced BY NAME — `role="group"` with an `aria-label` of
 *  "<axis>: <state>" — which is what a listener hears instead of eight adjacent fragments. A cell
 *  that matched the rendered TEXT would pass on a build that printed the four words with no
 *  pairing at all, so every assertion below is on the label. */
function groupLabelled(h: { find: (p: (n: Stub) => boolean) => Stub | null }, label: string): Stub | null {
  return h.find((n) => {
    const get = (n as { getAttribute?: (k: string) => string | null }).getAttribute;
    return typeof get === "function" && get.call(n, "aria-label") === label;
  });
}

test("655 AC5/AC12: the trade-invoice link block renders MONEY as money — the stated total and the outstanding, both in ringgit", async () => {
  // S1 and S2 (fix round 1). The block interpolated `outstanding_cents` as a bare integer of sen,
  // so a bookkeeper read "Outstanding: 106000" for RM 1,060.00 — a hundredfold misreading of the
  // one number on the page that is about money, and not what AC12 means by exact values. Every
  // other money value in this app renders through `<Money cents=… />` (components/journals/
  // money.tsx, next-intl's formatter with currencyDisplay "narrowSymbol"), and so does this one
  // now. The block's own comment also promised "the exact total", which it never rendered at all
  // — leaving `TradeInvoice.link.total` authored and dead, and an ADMITTED invoice with no amount
  // visible anywhere on the page, because the journal-lines table only exists once the entry
  // posts.
  const invoice = {
    invoice_id: "11111111-1111-4111-8111-111111111111", work_id: WORK,
    kind: "supplier_bill", domain: "ap",
    counterparty_id: "22222222-2222-4222-8222-222222222222", counterparty_name: "Alpha Supplies",
    counterparty_kind: "vendor", counterparty_registration_no: null,
    document_date: "2026-03-04", due_date: "2026-04-03", due_date_source: "stated",
    reference: "ALPHA-2026-0042", currency: "MYR", total_cents: 106_000, tax_facts: null,
    source_document_id: null, recorded_by: USER, created_at: "2026-03-04T02:00:00Z",
    state: "posted", entry_id: ENTRY, receipt_id: "receipt-1",
    open_item_id: "33333333-3333-4333-8333-333333333333",
    open_item_amount_cents: 106_000, open_item_due_date: "2026-04-03",
    outstanding_cents: 106_000,
  };
  const h = await renderComponent(App({
    loadTradeInvoice: async () => invoice,
    load: async () => data({
      work: workRow({ status: "completed", result: { entry_id: ENTRY, receipt_id: "receipt-1", posted_at: "2026-09-01T02:00:00Z" } }),
      entry: {
        id: ENTRY, client_id: CLIENT, status: "approved", posting_date: "2026-03-31", memo: "Alpha Supplies bill",
        origin: "agent", document_id: null, coding_kind: null, revision_token: "rev", maker_actor: null,
        checker_actor: null, approved_at: "2026-03-31T02:00:00Z", reversal_of: null, reversed_by: null,
        reversal_reason: null, withdrawn_at: null, withdrawal_reason: null, created_at: "2026-03-31T02:00:00Z",
      },
      lines: [],
      receipts: [],
    }),
  }));
  try {
    await settleUntil(h, () => String(h.text()).includes("Alpha Supplies"),
      "the trade-invoice link block to render");
    const text = String(h.text());
    // `\s`, NOT a literal space: next-intl's narrowSymbol output separates "RM" from the number
    // with U+202F, so a literal "RM 1,060.00" never matches a rendered amount — the vacuity
    // journal-entries-table.test.tsx:105-111 already had to learn once.
    const MONEY = /RM\s1,060\.00/g;
    assert.match(text, MONEY,
      "the outstanding renders in ringgit through the house Money component, never as raw sen");
    assert.equal(text.includes("106000"), false,
      "and the raw integer of sen appears nowhere on the page");
    assert.ok(/Total/.test(text),
      "the stated total is named — the block's own comment promises it and TradeInvoice.link.total was authored for it");
    // TWO money facts, both formatted: the stated total and what is still outstanding.
    assert.equal((text.match(MONEY) ?? []).length, 2,
      "both the stated total and the outstanding render as money");
    // AND NO RAW MESSAGE KEY ANYWHERE. Caught here for real: `tti` is scoped to
    // `TradeInvoice.link`, and the block asks it for `domain.ap` — a key that lived under
    // `TradeInvoice.domain` and NOT under `TradeInvoice.link`, so next-intl raised
    // MISSING_MESSAGE and the direction noun rendered as its own key path. The walk never
    // asserted the noun, so nothing caught it. It is asserted by NAME now.
    assert.ok(text.includes("Payable"),
      "the direction-aware noun renders as a word (C08.5), not as a missing-message key path");
    assert.equal(/TradeInvoice\.link\./.test(text), false,
      "no raw message key leaks into the page");
  } finally {
    await h.unmount();
  }
});

test("624 AC4: a Work's SOURCE DOCUMENT shows the same four named states the Documents tab shows", async () => {
  await withStateDoor(documentState(), async (calls) => {
    const h = await renderComponent(App({
      load: async () => data({
        work: workRow({ status: "completed", source_refs: [{ kind: "document", document_id: SOURCE_DOC }] }),
      }),
    }));
    try {
      await settleUntil(h, () => groupLabelled(h, "Custody: Bytes verified") !== null,
        "the source document's custody state to render in the Sources tab");

      // FOUR SEPARATE TRUE THINGS, each by its own name. "Facts: Recorded and checked" is the one
      // that carries the ticket: this document has a landed extraction AND a passing arithmetic
      // check, which is a different claim from "extraction: done" and is the distinction #624
      // exists to make.
      for (const label of [
        "Custody: Bytes verified",
        "Extraction: Done",
        "Facts: Recorded and checked",
        "Operation: Not coded yet",
      ]) {
        assert.ok(groupLabelled(h, label), `the Sources tab must announce ${label}`);
      }

      // THE CAPABILITY SENTENCE, VERBATIM FROM THE REGISTRY — the one line a professional can
      // argue with, and never a sentence this surface assembled.
      assert.match(h.text(), /Bytes are sealed at intake and read by azure-di/);

      // NO NEW DOOR. It is the Documents workbench's own read, called with this Work's client.
      const doors = stateDoorCalls(calls);
      assert.equal(doors.length, 1, "exactly one get_document_state read for one source document");
      assert.equal(doors[0]!.method, "POST", "the RPC is a POST, as every door on this app is");
      // #638 — the identity block's one claim-origin read is excluded by name and pinned, so the
      // exclusion cannot hide a second one.
      assert.equal(claimOriginCalls(calls).length, 1, "exactly one get_work_claim_origin read, on mount");
      // #655 — and the trade-invoice read, on the same footing and pinned the same way.
      assert.equal(tradeInvoiceCalls(calls).length, 1, "exactly one get_trade_invoice read, on mount");
      // #658 — the Sources tab's knowledge block reads clara.work_knowledge_drift ONCE on mount,
      // and it is excluded by name and PINNED for the same reason the claim-origin read above is:
      // an unpinned exclusion is a hole a second read could hide in.
      assert.equal(driftCalls(calls).length, 1, "exactly one work_knowledge_drift read, on mount");
      assert.equal(
        calls.filter((c) =>
          c.url.includes("/rest/v1/rpc/")
          && !c.url.includes("get_document_state")
          && !c.url.includes("get_work_claim_origin")
          && !c.url.includes("get_trade_invoice")
          && !c.url.includes("work_knowledge_drift")).length,
        0,
        "the Sources tab opens no other door",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("624 AC4: a source document Clara cannot read says so, and one that names no document is never asked about", async () => {
  // ARM 1 — THE DOOR'S OWN LEGITIMATE NULL. `clara.get_document_state` answers SQL NULL for a
  // document filed to another client rather than a partial answer, and the honest face for that is
  // "not available", never a fabricated set of four states.
  await withStateDoor(null, async (calls) => {
    const h = await renderComponent(App({
      load: async () => data({
        work: workRow({ status: "completed", source_refs: [{ kind: "document", document_id: SOURCE_DOC }] }),
      }),
    }));
    try {
      await settleUntil(h, () => /These states are not available for this document/.test(h.text()),
        "the honest not-available face for a document this client cannot read");
      assert.equal(groupLabelled(h, "Custody: Bytes verified"), null, "and no state is invented for it");
      assert.equal(stateDoorCalls(calls).length, 1, "the read was actually attempted");
    } finally {
      await h.unmount();
    }
  });

  // ARM 2 — A `document` REF THAT NAMES NOTHING USABLE. `p_document` is a uuid parameter, so a
  // malformed or absent id must never reach it (a 22P02 would throw out of the loader and render
  // an error where a state belongs). The page says what it has instead, and fires NO read.
  await withStateDoor(documentState(), async (calls) => {
    const h = await renderComponent(App({
      load: async () => data({
        work: workRow({ status: "completed", source_refs: [{ kind: "document", document_id: "not-a-uuid" }] }),
      }),
    }));
    try {
      await settleUntil(h, () => /names no document Clara can read/.test(h.text()),
        "the honest unidentified-source sentence");
      assert.equal(stateDoorCalls(calls).length, 0, "a malformed document id must never reach the uuid door");
    } finally {
      await h.unmount();
    }
  });
});

test("624 AC4: switching to Sources fires no write and no SECOND state read", async () => {
  // #641's own tab cell already proves a tab press is not an act on the Work. This one extends it
  // to the door this integration added: the four states are a READ, and a panel that re-read on
  // every tab press would spend a request per press on a surface people switch between freely.
  let writes = 0;
  const countWrite = async () => {
    writes += 1;
    return { kind: "accepted" } as never;
  };
  await withStateDoor(documentState(), async (calls) => {
    const h = await renderComponent(App({
      load: async () => data({
        work: workRow({ status: "completed", source_refs: [{ kind: "document", document_id: SOURCE_DOC }] }),
      }),
      retry: countWrite,
      cancel: countWrite,
      takeOver: countWrite,
    }));
    try {
      await settleUntil(h, () => groupLabelled(h, "Custody: Bytes verified") !== null,
        "the source document's states to render");
      const doorsBefore = stateDoorCalls(calls).length;
      const originsBefore = claimOriginCalls(calls).length;
      const invoicesBefore = tradeInvoiceCalls(calls).length;
      const driftBefore = driftCalls(calls).length;

      const sources = h.find((n) =>
        n.tagName === "BUTTON" && String((n as { textContent?: string }).textContent ?? "").trim() === "Sources");
      assert.ok(sources, "the Sources tab is a real control");
      await clickButton(sources);
      await h.settle();
      await h.settle();

      assert.equal(writes, 0, "a tab press is not an act on the Work");
      assert.equal(stateDoorCalls(calls).length, doorsBefore, "and it does not re-read the document's states");
      // #638 — nor does it re-ask what this Work IS. The claim-origin read is a mount effect, and a
      // tab press is not a mount.
      assert.equal(claimOriginCalls(calls).length, originsBefore,
        "and a tab press does not re-ask the Work's claim origin");
      // #655 — nor whether it carries a trade invoice. Same mount effect, same rule.
      assert.equal(tradeInvoiceCalls(calls).length, invoicesBefore,
        "and a tab press does not re-ask the Work's trade invoice");
      // #658 — nor does it re-ask whether the knowledge basis has moved: that read is a MOUNT
      // effect too, and a tab press is not a mount. Excluded by name AND pinned to its
      // before-count, so the exclusion cannot hide a second one.
      assert.equal(driftCalls(calls).length, driftBefore,
        "and a tab press does not re-read the Work's knowledge drift");
      assert.equal(
        calls.filter((c) =>
          c.method !== "GET"
          && !c.url.includes("get_document_state")
          && !c.url.includes("get_work_claim_origin")
          && !c.url.includes("get_trade_invoice")
          && !c.url.includes("work_knowledge_drift")).length,
        0,
        "no mutating request of any kind left this page",
      );
    } finally {
      await h.unmount();
    }
  });
});

// #631 (wave-3 integration) — THE DIAGNOSTICS SECTION LIVES INSIDE THE ACTIVITY TAB.
//
// WHY THIS CELL EXISTS AT ALL. #631 mounted `WorkDiagnostics` with one line beneath the identity
// block and said so in the mount comment, because #641 was turning this file into Tabs on another
// branch at the same time and a section written into the tab strip would have conflicted on every
// line. Integration is where that mount moves, and a move has two ways to go wrong that no unit
// cell on `WorkDiagnostics` itself can see: the section can end up in the WRONG panel (or in none),
// and opening a tab can turn into an act on the Work.
//
// THE TAB IS NOT `keepMounted`, which is the point rather than an accident: the trace read fires
// when a reader opens Activity, not on every visit to a Work detail page. The first arm asserts
// exactly that — the section is ABSENT on arrival — and the second asserts it arrives on the tab.
//
// AND A TAB PRESS IS A READ. The third arm counts every non-GET request the page made across the
// whole interaction and asserts zero, the same instrument #624's Sources cell uses one screen up.
test("631 + 641: Diagnostics renders INSIDE the Activity tab, and opening that tab is a read, never a write", async () => {
  await withStateDoor(documentState(), async (calls) => {
    let writes = 0;
    const h = await renderComponent(App({
      load: async () => data({ work: workRow({ status: "completed" }) }),
      retry: (async () => { writes += 1; return { kind: "accepted" } as never; }) as never,
      cancel: (async () => { writes += 1; return { kind: "answered" } as never; }) as never,
      takeOver: (async () => { writes += 1; return { kind: "accepted" } as never; }) as never,
    }));
    try {
      await settleUntil(h, () => /Journal entry/.test(h.text()), "the page rendered");

      // ARM 1 — ABSENT ON ARRIVAL. Results is the default tab; the trace section is not on screen
      // and its door has not been asked.
      assert.doesNotMatch(h.text(), /Diagnostics/, "the trace section is not mounted on the default tab");
      assert.equal(
        calls.filter((c) => c.url.includes("get_work_execution_trace")).length,
        0,
        "and no trace read fires for a reader who never opens Activity",
      );

      // ARM 2 — IT ARRIVES WITH THE TAB, and renders its own EMPTY face rather than nothing: the
      // stub answers `[]`, which is a Work that has recorded no steps, not a Work you may not see.
      const activity = h.find((n) =>
        n.tagName === "BUTTON" && String((n as { textContent?: string }).textContent ?? "").trim() === "Activity");
      assert.ok(activity, "the Activity tab is a real control");
      await clickButton(activity);
      await settleUntil(h, () => /Diagnostics/.test(h.text()), "the trace section mounted inside the Activity panel");
      await settleUntil(
        h,
        () => /No steps have been recorded for this Work yet\./.test(h.text()),
        "the trace read resolved to the empty face",
      );
      assert.equal(
        calls.filter((c) => c.url.includes("get_work_execution_trace")).length,
        1,
        "opening the tab asked the trace door exactly once",
      );

      // ARM 3 — A TAB PRESS IS NOT AN ACT ON THE WORK. No retry, no cancel, no take-over, and no
      // mutating request of any kind left this page across the whole interaction.
      assert.equal(writes, 0, "a tab press is not an act on the Work");
      assert.equal(
        calls.filter((c) => c.method !== "GET" && !c.url.includes("/rest/v1/rpc/")).length,
        0,
        "no mutating request of any kind left this page",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("p636.work_detail.batch_row — the 'part of batch' row renders for a Work that has NOT posted (V636R-2)", async () => {
  // It used to live inside PostedEntrySection, which renders only when `entry !== null`
  // (`work.result?.entry_id`), so the reverse address was missing for every queued, running,
  // waiting, refused or cancelled child — precisely the children AC5's recovery language is about.
  const h = await renderComponent(App({
    load: async () => data({ work: workRow({ status: "refused" }), entry: null }),
    loadBatchOrigin: async () => ({ batchId: "b1111111-1111-4111-8111-111111111111", label: "April sources" }),
  }));
  for (let i = 0; i < 4; i += 1) await h.settle();
  const text = (h.container as { textContent: string | null }).textContent ?? "";
  assert.match(text, /Part of the batch/, "a refused Work still shows which batch it came from");
  assert.match(text, /April sources/, "…and names it");
  await h.unmount();
});

test("p636.work_detail.batch_row — a Work in no batch shows no row, and a FAILED read is the same absence", async () => {
  const h = await renderComponent(App({
    load: async () => data({ work: workRow({ status: "refused" }), entry: null }),
    loadBatchOrigin: async () => { throw new Error("read failed"); },
  }));
  for (let i = 0; i < 4; i += 1) await h.settle();
  assert.ok(!((h.container as { textContent: string | null }).textContent ?? "").includes("Part of the batch"),
    "the page never says a Work is NOT in a batch — it only says it IS in one");
  await h.unmount();
});
