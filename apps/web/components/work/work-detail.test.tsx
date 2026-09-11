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

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { ReadError } from "../../lib/read";
import { WORK_HEADING_ID, WorkDetailView } from "./work-detail";
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
    initiator: USER,
    initiator_role: "bookkeeper",
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

function App(props: {
  workId?: string;
  load?: (clientId: string, workId: string) => Promise<WorkDetailData | null>;
  now?: () => number;
  retry?: (auth: unknown, input: { workId: string; opKey: string }) => Promise<RetryWorkResult>;
  /** #630 — the two runtime writes, injected so a cell drives the DECISION with no socket. */
  cancel?: (auth: unknown, input: { workId: string; opKey: string }) => Promise<CancelWorkResult>;
  takeOver?: (auth: unknown, input: { workId: string; opKey: string; basisDigest?: string | null }) => Promise<TakeOverWorkResult>;
  scope?: { firmId?: string; userId?: string };
  storage?: DraftStorage | null;
  /** #634 — the entry's links read. DEFAULTED so no cell reaches a real socket:
   *  an empty answer is "the read succeeded and this entry has no links row". */
  loadLinks?: (clientId: string, entryIds: readonly string[]) => Promise<EntryLinkRow[]>;
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
      scope: props.scope,
      storage: props.storage ?? null,
      loadLinks: (props.loadLinks ?? (async () => [])) as never,
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
    assert.match(text, /journal_entry/);
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
