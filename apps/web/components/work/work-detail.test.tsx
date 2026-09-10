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
import type { RetryWorkResult } from "../../lib/work/api";
import type { WorkDetailData } from "../../lib/work/reads";
import type { AccountingWorkRow } from "../../lib/work/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENTRY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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
    accounts: [
      { client_id: CLIENT, account_code: "6100", name: "Office rent", account_type: "expense", is_active: true },
      { client_id: CLIENT, account_code: "1100", name: "Maybank current", account_type: "asset", is_active: true },
    ],
    ...over,
  };
}

function App(props: {
  workId?: string;
  load?: (clientId: string, workId: string) => Promise<WorkDetailData | null>;
  now?: () => number;
  retry?: (auth: unknown, input: { workId: string; opKey: string }) => Promise<RetryWorkResult>;
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
      session: { getAccessToken: async () => "tok" },
    }),
  });
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

test("AWAITING INPUT points at what needs a person, and does not pretend to be running", async () => {
  const h = await renderComponent(App({ load: async () => data({ work: workRow({ status: "awaiting_input" }) }) }));
  try {
    await h.settle();
    assert.match(h.text(), /asked a question and is parked/);
    assert.ok(hrefs(h.container).includes("/work?view=needs-you"));
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
