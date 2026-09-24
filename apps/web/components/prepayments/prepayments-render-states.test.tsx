// #653 — THE C8/C9 SURFACES' STATE LADDER, AND THE TWO ARMS RENDERED DISTINCTLY.
//
// Appendix C §3 asks every surface to tell apart: meaningful loading, a successful EMPTY, a
// refusal, and a read failure — and never to render an empty state over a read that did not
// succeed. These cells drive `PrepaymentsList` and `PrepaymentDetail` against a mocked `fetch` and
// assert each rung by the words on screen.
//
// THE CLAIMS THIS FILE EXISTS FOR, beyond the ladder:
//
//   1. BOTH ATTENTION ARMS RENDER, AND DIFFERENTLY. Arm A ("the last period charged nothing") and
//      arm B ("recognised, not yet amortised") are two different residues with two different next
//      acts, and a band that rendered them alike would send a person to the wrong door. Each row
//      carries its own testid, its own label and its own destination.
//   2. THE TWO PERSISTENT STATEMENTS ARE ON FIRST PAINT. The bank-payment boundary AND the
//      configuration-is-not-a-posting boundary, both before any read resolves, neither a toast.
//   3. A REFUSED PERIOD REACHES THE EXPLAIN-AND-CHOOSE SURFACE with the DATABASE's own typed
//      reason verbatim — the whole record of a due event the estate could not admit.
//   4. "POSTED" MEANS A COMMITTED RECEIPT. The list's progress column and the allocation table's
//      period states both distinguish a posted period from an admitted one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { PrepaymentsList } from "./prepayments-list";
import { PrepaymentDetail } from "./prepayment-detail";

enableDomInspection();

const CLIENT = "11111111-2222-4333-8444-555555555555";
const SCHEDULE = "44444444-5555-4666-8777-888888888888";
const PLAN = "22222222-3333-4444-8555-666666666666";
const ENTRY = "55555555-6666-4777-8888-999999999999";
const DOC = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const WORK = "33333333-4444-4555-8666-777777777777";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function app(node: React.ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Prepayments"), node),
  });
}

/** A `fetch` that answers each RPC verb from a table, and 404s anything else LOUDLY — an
 *  unanswered call that silently resolved to `{}` would let a cell pass for the wrong reason. */
function rpcRouter(answers: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    for (const [verb, body] of Object.entries(answers)) {
      if (url.includes(`/rpc/${verb}`)) return jsonResponse(body);
    }
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([]);
    // #809 — the instruction picker reads the DOOR now, and its envelope is a page, not an array.
    if (url.includes("/rpc/list_accounting_work")) {
      return jsonResponse({ rows: [], next_cursor: null, truncated: false });
    }
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
}

type Node = { tagName?: string; childNodes?: Node[]; getAttribute?: (k: string) => string | null };

function findAllIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

const byTestId = (root: Node, id: string) =>
  findAllIn(root, (n) => n.getAttribute?.("data-testid") === id);

const SCHEDULE_ROW = {
  schedule_id: SCHEDULE,
  plan_id: PLAN,
  purpose: "Prepaid subscription amortisation",
  status: "active",
  source_entry_id: ENTRY,
  document_id: DOC,
  term_start: "2026-01-01",
  term_end: "2026-12-31",
  prepaid_account_code: "19000001",
  expense_account_code: "59000001",
  total_cents: 100000,
  period_count: 12,
  basis_kind: "human_stated",
  term_live: true,
  term_superseded_by: null,
  term_moved: false,
  term_current_start: "2026-01-01",
  term_current_end: "2026-12-31",
  created_at: "2026-01-15T00:00:00Z",
  effective_from: "2026-01-31",
  effective_to: "2026-12-31",
  posted_periods: 3,
  occurrence_count: 4,
  next_due: "2026-05-31",
};

const REFUSING = {
  arm: "refusing",
  schedule_id: SCHEDULE,
  plan_id: PLAN,
  purpose: "Prepaid subscription amortisation",
  status: "active",
  occurrence_id: "occ-1",
  due_date: "2026-04-30",
  period_key: "2026-04-01",
  attempt: 1,
  work_id: WORK,
  stage: "posting",
  code: "CLR19",
  reason: "write_into_closed_period",
  message: "that period is closed",
  work_status: "refused",
  catch_up_from: "2026-04-30",
  catch_up_to: "2026-04-30",
};

const UNSCHEDULED_NO_TERM = {
  arm: "unscheduled",
  entry_id: ENTRY,
  posting_date: "2026-02-14",
  memo: "prepaid insurance",
  document_id: DOC,
  prepaid_account_code: "19000001",
  amount_cents: 240000,
  has_live_term: false,
};

const period = (end: string, amount: number, occurrence: unknown) => ({
  period_start: `${end.slice(0, 7)}-01`,
  period_end: end,
  amount_cents: amount,
  credit_cents: amount,
  account_code: "19000001",
  prepaid_account_code: "19000001",
  expense_account_code: "59000001",
  occurrence,
});

const postedOcc = (due: string) => ({
  occurrence_id: `occ-${due}`, due_date: due, leg: "primary", period_key: `${due.slice(0, 7)}-01`,
  attempt: 1, revision: 1, intent_key: `plan:${PLAN}:r1:${due}`, work_id: WORK,
  admitted_at: "2026-01-31T00:00:00Z", outcome: { state: "admitted" }, created_at: "2026-01-31T00:00:00Z",
  attempts: [], work_status: "completed", work_error: null, receipt_id: "rc-1", entry_id: "je-1",
});

const refusedOcc = (due: string) => ({
  occurrence_id: `occ-${due}`, due_date: due, leg: "primary", period_key: `${due.slice(0, 7)}-01`,
  attempt: 1, revision: 1, intent_key: `plan:${PLAN}:r1:${due}`, work_id: null,
  admitted_at: null,
  outcome: {
    state: "refused", code: "CLR04", reason: "actor_not_active",
    message: "the authorising human is no longer an active member",
  },
  created_at: "2026-04-30T00:00:00Z", attempts: [], work_status: null, work_error: null,
  receipt_id: null, entry_id: null,
});

/** A refused occurrence carrying a NAMED typed reason — the explain surface keys on it, and the
 *  four reasons this build can say something specific about are not interchangeable. */
const refusedOcc2 = (due: string, reason: string, message: string) => ({
  ...refusedOcc(due),
  outcome: { state: "refused", code: "CLR10", reason, message },
});

const DETAIL = {
  schedule_id: SCHEDULE,
  client_id: CLIENT,
  plan_id: PLAN,
  revision: 1,
  kind: "amortisation_schedule",
  status: "active",
  purpose: "Prepaid subscription amortisation",
  source_entry_id: ENTRY,
  source_posting_date: "2026-01-15",
  source_memo: "prepaid subscription",
  source_status: "approved",
  document_id: DOC,
  service_period_id: "sp-1",
  term_live: true,
  term_superseded_by: null,
  term_moved: false,
  term_current_start: "2026-01-01",
  term_current_end: "2026-03-31",
  term_start: "2026-01-01",
  term_end: "2026-03-31",
  basis_kind: "human_stated",
  prepaid_account_code: "19000001",
  expense_account_code: "59000001",
  expense_account_basis: "the invoice narrates a subscription service",
  total_cents: 100000,
  period_count: 3,
  remainder_placement: "final_period",
  schedule_version: "v1",
  created_by: "u1",
  created_at: "2026-01-15T00:00:00Z",
  authority_kind: "explicit_instruction",
  authority_ref: { kind: "accounting_work", id: WORK },
  authorised_by: "u1",
  authorised_at: "2026-01-15T00:00:00Z",
  authority_from: "2026-01-31",
  covered_through: "2026-02-28",
  paused_at: null, paused_by: null, paused_reason: null,
  ended_at: null, ended_by: null, ended_reason: null,
  live_revision: {
    revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-01-31", effective_to: "2026-03-31",
    basis: {}, basis_digest: "a".repeat(64),
  },
  periods: [
    period("2026-01-31", 33333, postedOcc("2026-01-31")),
    period("2026-02-28", 33333, postedOcc("2026-02-28")),
    period("2026-03-31", 33334, refusedOcc("2026-03-31")),
  ],
  occurrences: [postedOcc("2026-01-31"), postedOcc("2026-02-28"), refusedOcc("2026-03-31")],
  configuration_only: true,
};

async function drive(node: React.ReactElement, run: (h: { text: () => string; container: Node }) => void | Promise<void>) {
  const h = await renderComponent(app(node));
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    await run(h as unknown as { text: () => string; container: Node });
  } finally {
    await h.unmount();
    for (let i = 0; i < 3; i++) await h.settle();
  }
}

// ===========================================================================================
// The list.
// ===========================================================================================

test("prepayments.list — BOTH persistent statements render on FIRST PAINT, before any read resolves, and neither is a toast", async () => {
  const never = new Promise<Response>(() => {});
  await withMockedEnv((() => never) as unknown as typeof fetch, async () => {
    const h = await renderComponent(app(createElement(PrepaymentsList, { clientId: CLIENT })));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /never initiates a bank payment/,
        "the bank-payment boundary is on screen before anything has been read");
      assert.match(text, /An accepted schedule is not a posted period/,
        "…and so is the configuration boundary, which is this ticket's own");
      assert.doesNotMatch(text, /No prepayment is being amortised/,
        "the empty state must NEVER render over a read that has not returned");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("prepayments.list — a successful EMPTY read says so on BOTH sections, and it is a different sentence from a refused one", async () => {
  await withMockedEnv(rpcRouter({
    list_prepayment_schedules: { client_id: CLIENT, schedules: [] },
    list_prepayment_attention: { client_id: CLIENT, refusing: [], unscheduled: [] },
  }), async () => {
    await drive(createElement(PrepaymentsList, { clientId: CLIENT }), (h) => {
      assert.match(h.text(), /No prepayment is being amortised for this client yet\./);
      assert.match(h.text(), /Nothing is waiting/);
      assert.doesNotMatch(h.text(), /can't read this yet/);
    });
  });
});

test("prepayments.list — a 403 renders the classified forbidden wording, never the raw PostgREST message and never a false empty", async () => {
  await withMockedEnv(
    (async () => jsonResponse({ message: "permission denied for function list_prepayment_schedules" }, 403)) as typeof fetch,
    async () => {
      await drive(createElement(PrepaymentsList, { clientId: CLIENT }), (h) => {
        assert.match(h.text(), /Your account can't read this yet\./);
        assert.doesNotMatch(h.text(), /permission denied for function/,
          "an internal function name must never reach the screen");
        assert.doesNotMatch(h.text(), /No prepayment is being amortised/,
          "a refused read is not an empty list");
      });
    },
  );
});

test("prepayments.list — the two attention arms render DISTINCTLY: arm A names the typed reason and leads to the schedule, arm B names the next act and leads to the document", async () => {
  await withMockedEnv(rpcRouter({
    list_prepayment_schedules: { client_id: CLIENT, schedules: [SCHEDULE_ROW] },
    list_prepayment_attention: { client_id: CLIENT, refusing: [REFUSING], unscheduled: [UNSCHEDULED_NO_TERM] },
  }), async () => {
    await drive(createElement(PrepaymentsList, { clientId: CLIENT }), (h) => {
      assert.equal(byTestId(h.container, "prepayment-attention-refusing").length, 1);
      assert.equal(byTestId(h.container, "prepayment-attention-unscheduled").length, 1);
      const text = h.text();
      // ARM A: the DATABASE's own token, verbatim, beside a translated label.
      assert.match(text, /Last period refused: write_into_closed_period/);
      assert.match(text, /Work was created on 2026-04-30 and the books refused it\./,
        "…and it says WHERE it stopped: posting, not admission");
      assert.match(text, /Explain and choose/);
      // ARM B: the next act, which is the TERM rather than the form.
      assert.match(text, /Posted, not yet amortised/);
      assert.match(text, /states no service period yet/);
      assert.match(text, /Open the document/);
      assert.doesNotMatch(text, /Configure the schedule/,
        "a recognition with no term must NOT offer a form that can only refuse");
    });
  });
});

test("prepayments.list — a TRUNCATED attention read says so, because fifty of many read as 'nothing else is failing'", async () => {
  // Each arm is capped at fifty rows, newest first (migration 0223 §E). On a client with more
  // candidates than the cap, a band that showed fifty silently would be telling a person that
  // nothing else is waiting — the exact misreading this whole surface exists to prevent.
  await withMockedEnv(rpcRouter({
    list_prepayment_schedules: { client_id: CLIENT, schedules: [] },
    list_prepayment_attention: {
      client_id: CLIENT, refusing: [], unscheduled: [UNSCHEDULED_NO_TERM],
      refusing_truncated: false, unscheduled_truncated: true,
    },
  }), async () => {
    await drive(createElement(PrepaymentsList, { clientId: CLIENT }), (h) => {
      assert.equal(byTestId(h.container, "prepayment-attention-truncated").length, 1);
      assert.match(h.text(), /There are more than this/);
    });
  });
});

test("prepayments.list — an UNtruncated read says nothing about a cap, so the notice means what it says", async () => {
  await withMockedEnv(rpcRouter({
    list_prepayment_schedules: { client_id: CLIENT, schedules: [] },
    list_prepayment_attention: {
      client_id: CLIENT, refusing: [], unscheduled: [UNSCHEDULED_NO_TERM],
      refusing_truncated: false, unscheduled_truncated: false,
    },
  }), async () => {
    await drive(createElement(PrepaymentsList, { clientId: CLIENT }), (h) => {
      assert.equal(byTestId(h.container, "prepayment-attention-truncated").length, 0);
    });
  });
});

test("prepayments.list — arm B offers the FORM once the document states a term, and the link carries the recognition so the form is prefilled", async () => {
  await withMockedEnv(rpcRouter({
    list_prepayment_schedules: { client_id: CLIENT, schedules: [] },
    list_prepayment_attention: {
      client_id: CLIENT, refusing: [],
      unscheduled: [{ ...UNSCHEDULED_NO_TERM, has_live_term: true }],
    },
  }), async () => {
    await drive(createElement(PrepaymentsList, { clientId: CLIENT }), (h) => {
      assert.match(h.text(), /Its document states a service period/);
      const links = findAllIn(h.container, (n) => n.tagName === "A")
        .map((n) => n.getAttribute?.("href") ?? "");
      assert.ok(links.some((x) => x === `/clients/${CLIENT}/prepayments/new?entry=${ENTRY}`),
        `the configure link carries the recognition: ${JSON.stringify(links)}`);
    });
  });
});

test("prepayments.list — the progress column counts POSTED periods (a committed receipt), never admitted Work", async () => {
  await withMockedEnv(rpcRouter({
    list_prepayment_schedules: { client_id: CLIENT, schedules: [SCHEDULE_ROW] },
    list_prepayment_attention: { client_id: CLIENT, refusing: [], unscheduled: [] },
  }), async () => {
    await drive(createElement(PrepaymentsList, { clientId: CLIENT }), (h) => {
      // 3 posted of 12 periods, with 4 occurrences — the difference between the two is the point.
      assert.match(h.text(), /3 of 12 periods/);
    });
  });
});

// ===========================================================================================
// The detail.
// ===========================================================================================

test("prepayments.detail — the derived facts, the judged account WITH its stated grounds, and the allocation's four period states", async () => {
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: DETAIL }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      const text = h.text();
      assert.match(text, /2026-01-01 – 2026-03-31/, "the service period the DOCUMENT states");
      assert.match(text, /Stated by a person/, "…and how it was recorded");
      assert.match(text, /the invoice narrates a subscription service/,
        "the judged account's own grounds are rendered, never stored and forgotten");
      assert.match(text, /19000001/);
      assert.match(text, /59000001/);
      // The residual is NAMED on the final period rather than left for a reader to notice.
      assert.match(text, /Final period — carries the remainder/);
      assert.equal(byTestId(h.container, "prepayment-period-posted").length, 2);
      assert.equal(byTestId(h.container, "prepayment-period-refused").length, 1);
      // #919 — a LIVE term renders no superseded-term banner.
      assert.equal(byTestId(h.container, "prepayment-term-superseded").length, 0);
      assert.doesNotMatch(text, /taken over by a replacement schedule/);
    });
  });
});

test("prepayments.detail — ticket 919: a schedule whose term row has since been superseded renders the corrected-term banner, saying that THIS schedule's allocation is never edited and that the balance it has not charged is taken over by a replacement", async () => {
  // [#939 AC4, migration 0317] The banner went through two wrong readings before this one. It first
  // told a firm the schedule "needs a new schedule from the next period" when no door opened one;
  // the fix round then made it say a replacement was impossible. Both are now wrong the other way:
  // `clara.replace_prepayment_schedule` opens exactly that replacement once the term on record has
  // been corrected, and `uq_prepayment_schedules_source_live` admits one LIVE schedule per
  // recognition rather than one ever. What stays true, and is what this banner is for, is that THIS
  // schedule's own allocation is a derived record and is never edited.
  const SUPERSEDED = {
    ...DETAIL, term_live: false, term_superseded_by: "sp-2", term_moved: true,
    term_current_start: "2026-01-01", term_current_end: "2027-01-31",
  };
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: SUPERSEDED }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      assert.equal(byTestId(h.container, "prepayment-term-superseded").length, 1);
      assert.match(h.text(), /its own allocation is never edited/,
        "the fact this banner exists for: a derived record is never edited in place");
      assert.match(h.text(), /taken over by a replacement schedule derived from the corrected term/,
        "…and the act that DOES exist is named, now that a door performs it");
      assert.doesNotMatch(h.text(), /one recognition carries one schedule/,
        "the fix round's flat prohibition is no longer true: one LIVE schedule, not one ever");
    });
  });
});

test("prepayments.detail — ticket 919 / ADV-02: a term row SUPERSEDED BY A RE-RECORD THAT MOVED NOTHING renders no banner, and neither does an ABSENT flag", async () => {
  // `clara._record_document_service_period_core` supersedes the live row UNCONDITIONALLY — it
  // compares no dates — so `term_live` goes false when a bookkeeper re-records the SAME term (a
  // second verification against the same invoice, a retyped basis sentence). A surface keyed on
  // `term_live` told that firm its term "has since been corrected" and that its running
  // amortisation needed rebuilding. Both are false.
  const RESTATED = {
    ...DETAIL, term_live: false, term_superseded_by: "sp-2", term_moved: false,
    term_current_start: DETAIL.term_start, term_current_end: DETAIL.term_end,
  };
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: RESTATED }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      assert.equal(byTestId(h.container, "prepayment-term-superseded").length, 0,
        "the term row moved, the TERM did not — there is nothing for this firm to act on");
      assert.doesNotMatch(h.text(), /taken over by a replacement schedule/);
    });
  });

  // AND AN ABSENT FLAG PAINTS NOTHING (ADV-04). `term_moved` arrives as unvalidated jsonb; a web
  // build ahead of its database, or a rolled-back migration under a live runtime, hands back a
  // row without it. A truthiness test would then warn on EVERY prepayment in the firm.
  const legacy: Record<string, unknown> = { ...DETAIL };
  delete legacy.term_live;
  delete legacy.term_superseded_by;
  delete legacy.term_moved;
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: legacy }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      assert.equal(byTestId(h.container, "prepayment-term-superseded").length, 0,
        "a read that says nothing about the term must not be rendered as a correction");
    });
  });
});

test("prepayments.list — ticket 919: the list surface carries the corrected-term word too, and only for a term that MOVED", async () => {
  // The Agent Brief asks BOTH surfaces for the flag, and the list is where a person meets eleven
  // schedules at once: a stale one with no mark beside ten healthy ones is the misreading this
  // whole lane exists to prevent.
  const MOVED = {
    ...SCHEDULE_ROW, schedule_id: "aaaaaaaa-1111-4222-8333-444444444444",
    purpose: "Prepaid insurance amortisation",
    term_live: false, term_superseded_by: "sp-2", term_moved: true,
    term_current_start: "2026-01-01", term_current_end: "2027-01-31",
  };
  const RESTATED = {
    ...SCHEDULE_ROW, schedule_id: "bbbbbbbb-1111-4222-8333-444444444444",
    purpose: "Prepaid subscription amortisation",
    term_live: false, term_superseded_by: "sp-3", term_moved: false,
  };
  await withMockedEnv(rpcRouter({
    list_prepayment_schedules: { client_id: CLIENT, schedules: [MOVED, RESTATED, SCHEDULE_ROW] },
    list_prepayment_attention: { client_id: CLIENT, refusing: [], unscheduled: [] },
  }), async () => {
    await drive(createElement(PrepaymentsList, { clientId: CLIENT }), (h) => {
      assert.equal(byTestId(h.container, "prepayment-row-term-corrected").length, 1,
        "exactly ONE of the three rows had its term moved; the other two must carry nothing");
      assert.match(h.text(), /Term corrected/, "and it is a WORD, never a colour alone");
    });
  });
});

test("prepayments.detail — a REFUSED period reaches the explain-and-choose surface with the database's own typed reason and the two honest choices", async () => {
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: DETAIL }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      assert.equal(byTestId(h.container, "prepayment-explain").length, 1);
      const text = h.text();
      assert.match(text, /This period charged nothing/);
      assert.match(text, /The database's own reason: actor_not_active/,
        "the typed reason verbatim — never a phrase this build invented");
      assert.match(text, /no longer an active member with a bookkeeper role/,
        "…and what that reason MEANS in this lane's terms");
      assert.match(text, /Ask for this period again/);
      assert.match(text, /never reaches back past 2026-01-31/,
        "the bounded recovery names the plan's own authority floor");
      assert.match(text, /Leave it/);
      // NO THIRD CHOICE. `/force/` alone would match the "In force" window label above, so the
      // probe names the shapes an override would actually take.
      assert.doesNotMatch(text, /post it anyway|override|force the posting|ignore the refusal/i,
        "there is NO third choice: a control that walked around a wall would be a lie");
    });
  });
});

test("prepayments.detail — L04-SPEC-04: every sentence on this register that touches a second schedule names the ONE path that opens one — a corrected term — and none of them offers a plain reconfiguration the door still refuses", async () => {
  // MEASURED, not reasoned about (`p939.replace.clean` / `p939.replace.refuses`, on the lane
  // database): `clara.create_prepayment_schedule` still answers CLR13
  // `prepayment_schedule_exists` for a second schedule over a recognition that already carries a
  // LIVE one, running or ended — so "configure a new one" remains an act nobody can perform. What
  // #939 AC4 names, and migration 0317 built, is a different act:
  // `clara.replace_prepayment_schedule` takes over the periods the first schedule has not charged,
  // and it is reachable only once the term on record has actually been corrected. So each of these
  // sentences must name THAT path and must not offer the one the door refuses.
  const ENDED = { ...DETAIL, status: "ended", ended_at: "2026-03-31T00:00:00Z", ended_by: "u1",
    ended_reason: "the client cancelled the cover" };
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: ENDED }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      const text = h.text();
      assert.match(text, /This schedule has ended/, "the state itself is still said plainly");
      assert.doesNotMatch(text, /Configure a new one/,
        "an ended schedule's recognition still carries a LIVE schedule, so a new one is refused");
      assert.match(text, /a second schedule cannot simply be configured/,
        "…and the reason a person cannot simply reconfigure is said instead of left to be discovered");
      assert.match(text, /replacement derived from a corrected term/,
        "…beside the one path that does take over the periods still to run");
    });
  });

  // THE LAPSED-AUTHORITY EXPLANATION. `clara.revise_accounting_plan` moves the SCHEDULE and never
  // `authorised_by` (0193), and there is no other door, so "end this schedule and configure a new
  // one under someone who is" was two impossible acts in one sentence.
  const LAPSED = { ...DETAIL,
    periods: [period("2026-03-31", 100000, refusedOcc("2026-03-31"))],
    occurrences: [refusedOcc("2026-03-31")] };
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: LAPSED }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      const text = h.text();
      assert.match(text, /no longer an active member with a bookkeeper role/,
        "what the typed reason MEANS is still explained");
      assert.doesNotMatch(text, /configure a new one/i,
        "…without offering a reconfiguration the door refuses");
      assert.match(text, /Restoring their membership/,
        "the remedy for THIS refusal is named first, because it is the one that gets the plan posting again");
      assert.match(text, /only ever opened by correcting the term/,
        "…and the one path to a second schedule is named without being dressed up as a fix for a lapsed authority");
    });
  });

  // THE PERIOD-LINE EXPLANATION — the corrected-term case itself (#939 AC4 / #941 AC3).
  const OUT_OF_TERM = { ...DETAIL,
    periods: [period("2026-03-31", 100000, refusedOcc2("2026-03-31", "amortisation_period_line_missing",
      "this schedule has no period ending on that due date"))],
    occurrences: [refusedOcc2("2026-03-31", "amortisation_period_line_missing",
      "this schedule has no period ending on that due date")] };
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: OUT_OF_TERM }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      const text = h.text();
      assert.match(text, /falls outside the allocation this schedule was derived from/);
      assert.doesNotMatch(text, /needs a new schedule/,
        "the sentence never returns to advising a plain reconfiguration");
      assert.match(text, /correcting it on record is what opens a replacement/,
        "the corrected-term path #939 AC4 names is offered, because a door now performs it");
      assert.match(text, /raise the difference with the reviewer/i,
        "…and the other branch — a term that was right — still sends the person to the reviewer");
    });
  });
});

test("prepayments.detail — the occurrence history prints a refused period's typed reason verbatim and offers no entry link for it", async () => {
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: DETAIL }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      assert.equal(byTestId(h.container, "prepayment-occurrence-refused").length, 1);
      assert.match(h.text(), /the authorising human is no longer an active member/);
      assert.match(h.text(), /No work created/, "a refused occurrence names no Work");
    });
  });
});

test("prepayments.detail — an allocation that does not sum to the recognised amount is NAMED and nothing is reconciled", async () => {
  const broken = {
    ...DETAIL,
    periods: [period("2026-01-31", 33333, null), period("2026-02-28", 33333, null)],
  };
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: broken }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      assert.match(h.text(), /do not sum to the recognised amount/);
      assert.match(h.text(), /Nothing here has been adjusted/,
        "a surface never edits an amount it did not derive");
    });
  });
});

test("prepayments.detail — a schedule id this firm does not hold renders the not-found sentence, never an empty schedule", async () => {
  await withMockedEnv(rpcRouter({ get_prepayment_schedule: null }), async () => {
    await drive(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE }), (h) => {
      assert.match(h.text(), /not in this client's books/);
    });
  });
});
