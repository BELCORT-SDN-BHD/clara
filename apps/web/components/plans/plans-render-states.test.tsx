// #640 — THE C9 SURFACES' STATE LADDER, and the two negatives the acceptance names.
//
// Appendix C §3 asks every surface to tell apart: meaningful loading, a successful EMPTY, a
// refusal, and a read failure — and never to render an empty state over a read that did not
// succeed. These cells drive `PlansList` and `PlanDetail` against a mocked `fetch` and assert each
// rung by the words on screen.
//
// THE TWO NEGATIVES:
//   1. NO GLOBAL AGENTIC SWITCH. #640: "there is no global enable-agentic switch." The plan
//      surfaces must not render a toggle of any kind — this cell walks the rendered tree for a
//      switch/checkbox and for the word itself, so a later hand adding one reds here rather than
//      shipping the control the acceptance forbids.
//   2. THE BANK-PAYMENT BOUNDARY IS PERSISTENT, NOT A TOAST. Wayfinder #611's scope line renders
//      on the list AND on the detail, on first paint, with no dismissal.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { PlansList } from "./plans-list";
import { PlanDetail } from "./plan-detail";

enableDomInspection();

const CLIENT = "11111111-2222-4333-8444-555555555555";
const PLAN = "22222222-3333-4444-8555-666666666666";
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

/** Every `<a href>` in the rendered tree, in document order — the same reader
 *  `components/work/work-detail.test.tsx` uses, so a link assertion reads alike on both surfaces. */
function hrefs(container: { tagName?: string; childNodes?: unknown[]; getAttribute?: (k: string) => string | null }): string[] {
  const out: string[] = [];
  const walk = (n: typeof container) => {
    if (n.tagName === "A") {
      const href = n.getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of (n.childNodes as (typeof container)[] | undefined) ?? []) walk(c);
  };
  walk(container);
  return out;
}

function app(node: React.ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Plans"), node),
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
    if (url.includes("/rest/v1/coa_accounts") || url.includes("/rest/v1/accounting_work")) {
      return jsonResponse([]);
    }
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
}

const PLAN_ROW = {
  plan_id: PLAN,
  kind: "recurring_journal",
  status: "active",
  purpose: "Monthly office rent",
  authority_kind: "explicit_instruction",
  authorised_by: "u1",
  authorised_at: "2026-09-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
  revision: 1,
  frequency: "monthly",
  day_rule: "day_of_month",
  day_of_month: 1,
  timezone: "Asia/Kuala_Lumpur",
  effective_from: "2026-07-01",
  effective_to: null,
  auto_reverse: false,
  next_occurrence: "2026-10-01",
  occurrence_count: 2,
};

const PLAN_DETAIL = {
  plan_id: PLAN,
  client_id: CLIENT,
  kind: "recurring_journal",
  status: "active",
  purpose: "Monthly office rent",
  authority_kind: "explicit_instruction",
  authority_ref: { kind: "accounting_work", id: WORK },
  authorised_by: "u1",
  authorised_at: "2026-09-01T00:00:00Z",
  authority_from: "2026-07-01",
  // How far the plan has already run. The revise form mirrors 0193's `period_already_covered`
  // against it (review finding SHOULD-1).
  covered_through: "2026-09-30",
  created_by: "u1",
  created_at: "2026-09-01T00:00:00Z",
  paused_at: null, paused_by: null, paused_reason: null,
  ended_at: null, ended_by: null, ended_reason: null,
  current_revision: 1,
  live_revision: {
    revision: 1, frequency: "monthly", day_rule: "day_of_month", day_of_month: 1,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-07-01", effective_to: null,
    basis: {
      posting_date: "2026-07-01", memo: "office rent", currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "rent" },
        { account_code: "1150", debit_cents: 0, credit_cents: 120000, description: "bank" },
      ],
    },
    basis_digest: "a".repeat(64), auto_reverse: false, reversal_day_rule: null,
  },
  revisions: [],
};

// ===========================================================================================
// The list.
// ===========================================================================================

test("plans.list — the boundary statement renders on FIRST PAINT, before any read resolves, and is not a toast", async () => {
  const never = new Promise<Response>(() => {});
  await withMockedEnv((() => never) as unknown as typeof fetch, async () => {
    const h = await renderComponent(app(createElement(PlansList, { clientId: CLIENT })));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /never initiates a bank payment/,
        "the Wayfinder 611 scope line is on screen before anything has been read");
      assert.match(text, /no global switch that turns scheduling on or off/);
      assert.doesNotMatch(text, /No accounting plans authorised/,
        "the empty state must NEVER render over a read that has not returned");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("plans.list — a successful EMPTY read says so, and it is a different sentence from a refused one", async () => {
  await withMockedEnv(rpcRouter({ list_accounting_plans: { client_id: CLIENT, plans: [] } }), async () => {
    const h = await renderComponent(app(createElement(PlansList, { clientId: CLIENT })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(h.text(), /No accounting plans authorised for this client yet\./);
      assert.doesNotMatch(h.text(), /can't read this yet/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("plans.list — a 403 renders the classified forbidden wording, never the raw PostgREST message and never a false empty", async () => {
  await withMockedEnv(
    (async () => jsonResponse({ message: "permission denied for function list_accounting_plans" }, 403)) as typeof fetch,
    async () => {
      const h = await renderComponent(app(createElement(PlansList, { clientId: CLIENT })));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Your account can't read this yet\./);
        assert.doesNotMatch(text, /permission denied for function/,
          "an internal function name must never reach the screen");
        assert.doesNotMatch(text, /No accounting plans authorised/,
          "a refused read is not an empty list");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("plans.list — a row prints its schedule, its timezone and its next occurrence, and a PAUSED row says it is not being admitted", async () => {
  await withMockedEnv(
    rpcRouter({
      list_accounting_plans: {
        client_id: CLIENT,
        plans: [PLAN_ROW, { ...PLAN_ROW, plan_id: "99999999-1111-4222-8333-444444444444", status: "paused", purpose: "Quarterly audit fee" }],
      },
    }),
    async () => {
      const h = await renderComponent(app(createElement(PlansList, { clientId: CLIENT })));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Monthly, day 1/, "the schedule is a sentence, not a raw enum");
        assert.match(text, /Asia\/Kuala_Lumpur/, "a due date is a calendar day in a named zone");
        assert.match(text, /2026-10-01/, "the next occurrence is the DATABASE's own answer");
        assert.match(text, /Not being admitted/,
          "a paused row must not print a next date as though it will run");
        assert.match(text, /Paused/);
        assert.match(text, /Active/, "the badge carries its own word — colour is never the only cue");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("plans.list — NO GLOBAL AGENTIC SWITCH: the surface renders no toggle and offers no such control", async () => {
  await withMockedEnv(rpcRouter({ list_accounting_plans: { client_id: CLIENT, plans: [PLAN_ROW] } }), async () => {
    const h = await renderComponent(app(createElement(PlansList, { clientId: CLIENT })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const toggle = h.find((n) => {
        const props = (n.props ?? {}) as Record<string, unknown>;
        return props.role === "switch" || (n.tagName === "INPUT" && props.type === "checkbox");
      });
      assert.equal(toggle, null, "ticket 640: there is no global enable-agentic switch, and no per-page one either");
      assert.doesNotMatch(h.text(), /enable agentic/i);
      assert.doesNotMatch(h.text(), /autonomy/i);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// ===========================================================================================
// The detail.
// ===========================================================================================

test("plans.detail — the identity block carries purpose, schedule, timezone, window, revision, authority and authoriser", async () => {
  await withMockedEnv(
    rpcRouter({
      get_accounting_plan: PLAN_DETAIL,
      preview_accounting_plan: {
        plan_id: PLAN, status: "active", revision: 1, timezone: "Asia/Kuala_Lumpur",
        today: "2026-09-14", from_date: "2026-10-01", admitting: true,
        occurrences: [{ due_date: "2026-10-01", leg: "primary", basis: PLAN_DETAIL.live_revision.basis }],
      },
      list_accounting_plan_occurrences: { plan_id: PLAN, occurrences: [] },
    }),
    async () => {
      const h = await renderComponent(app(createElement(PlanDetail, { clientId: CLIENT, planId: PLAN })));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Monthly office rent/);
        assert.match(text, /Monthly, day 1/);
        assert.match(text, /Asia\/Kuala_Lumpur/);
        assert.match(text, /2026-07-01 onwards/, "an open-ended window says so rather than printing a blank");
        assert.match(text, /Current revision/);
        assert.match(text, /Open the instruction/, "the authority links to the instruction that carries it");
        assert.match(text, /Recurring journal/);
        // The basis, with the honest note about its stored date.
        assert.match(text, /6100/);
        assert.match(text, /placeholder the schedule replaces/);
        assert.match(text, /No due date of this plan has been reached yet\./);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("plans.detail — a PAUSED plan's preview explains it is not being admitted and still SHOWS the dates", async () => {
  await withMockedEnv(
    rpcRouter({
      get_accounting_plan: { ...PLAN_DETAIL, status: "paused", paused_at: "2026-09-10T00:00:00Z", paused_by: "u1", paused_reason: "the landlord is renegotiating" },
      preview_accounting_plan: {
        plan_id: PLAN, status: "paused", revision: 1, timezone: "Asia/Kuala_Lumpur",
        today: "2026-09-14", from_date: "2026-10-01", admitting: false,
        occurrences: [
          { due_date: "2026-10-01", leg: "primary", basis: PLAN_DETAIL.live_revision.basis },
          { due_date: "2026-11-01", leg: "primary", basis: PLAN_DETAIL.live_revision.basis },
        ],
      },
      list_accounting_plan_occurrences: { plan_id: PLAN, occurrences: [] },
    }),
    async () => {
      const h = await renderComponent(app(createElement(PlanDetail, { clientId: CLIENT, planId: PLAN })));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        const text = h.text();
        assert.match(text, /these dates are not being admitted/,
          "the paused explanation replaces the promise, not the schedule");
        assert.match(text, /2026-10-01/, "…and the dates are still SHOWN: an empty list would read as 'nothing is scheduled'");
        assert.match(text, /the landlord is renegotiating/, "the recorded pause reason is on screen");
        // A paused plan offers Resume and End, and never Pause or Catch up.
        const labels = ["Resume", "End plan", "Revise"];
        for (const label of labels) {
          assert.ok(h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(label)) !== null
            || h.find((n) => n.tagName === "A" && textOf(n).includes(label)) !== null, `${label} is offered`);
        }
        assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Catch up"), null,
          "a paused plan catches nothing up — request_plan_catch_up refuses plan_paused (裁-187)");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("plans.detail — an ENDED plan offers no lifecycle control at all and says why", async () => {
  await withMockedEnv(
    rpcRouter({
      get_accounting_plan: { ...PLAN_DETAIL, status: "ended", ended_at: "2026-09-12T00:00:00Z", ended_by: "u1", ended_reason: "the client cancelled the standing instruction" },
      preview_accounting_plan: { plan_id: PLAN, status: "ended", admitting: false, occurrences: [] },
      list_accounting_plan_occurrences: { plan_id: PLAN, occurrences: [] },
    }),
    async () => {
      const h = await renderComponent(app(createElement(PlanDetail, { clientId: CLIENT, planId: PLAN })));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        for (const label of ["Pause", "Resume", "End plan", "Catch up", "Revise"]) {
          assert.equal(
            h.find((n) => (n.tagName === "BUTTON" || n.tagName === "A") && textOf(n).trim() === label),
            null,
            `${label} must not be offered on an ended plan — it could only ever refuse plan_ended`,
          );
        }
        assert.match(h.text(), /This plan has ended\./);
        assert.match(h.text(), /the client cancelled the standing instruction/);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("plans.detail — an occurrence row links its Work and its entry; a REFUSED occurrence prints the database's own reason and links no Work", async () => {
  await withMockedEnv(
    rpcRouter({
      get_accounting_plan: PLAN_DETAIL,
      preview_accounting_plan: { plan_id: PLAN, status: "active", admitting: true, occurrences: [] },
      list_accounting_plan_occurrences: {
        plan_id: PLAN,
        occurrences: [
          {
            occurrence_id: "o1", due_date: "2026-09-01", leg: "primary", period_key: "2026-09-01", attempt: 1, revision: 1,
            intent_key: `plan:${PLAN}:r1:2026-09-01`, work_id: WORK, admitted_at: "2026-09-01T00:10:00Z",
            outcome: { state: "admitted" }, created_at: "2026-09-01T00:10:00Z",
            work_status: "completed", work_error: null, receipt_id: "r1", entry_id: "e1",
          },
          {
            occurrence_id: "o2", due_date: "2026-08-01", leg: "primary", period_key: "2026-08-01", attempt: 1, revision: 1,
            intent_key: `plan:${PLAN}:r1:2026-08-01`, work_id: null, admitted_at: null,
            outcome: { state: "refused", code: "CLR04", reason: "actor_not_active", message: "the author is not an active member of this firm" },
            created_at: "2026-08-01T00:10:00Z",
            work_status: null, work_error: null, receipt_id: null, entry_id: null,
          },
        ],
      },
    }),
    async () => {
      const h = await renderComponent(app(createElement(PlanDetail, { clientId: CLIENT, planId: PLAN })));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        const text = h.text();
        assert.match(text, /2026-09-01/);
        assert.match(text, /Completed/);
        assert.match(text, /Open work/);
        assert.match(text, /Open entry/);
        // The refused due event is RECORDED history, with the typed reason verbatim.
        assert.match(text, /Refused/);
        assert.match(text, /actor_not_active/,
          "the database's own typed reason, never a re-worded one");
        assert.match(text, /No work created/);
        const links = hrefs(h.container);
        assert.ok(links.some((href) => href.includes(`/work/${WORK}`)), `the admitted occurrence links its Work (saw ${JSON.stringify(links)})`);
        assert.ok(links.some((href) => href.includes("entry=e1")), "…and the entry it produced");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// #789 — attempts/reverses_entry_id reach the web types but nothing rendered them (the #640
// fixround's own named gap). These two cells prove the plan's occurrence history now shows a
// period's prior (superseded) attempts, the current attempt number, and a reversal's own entry.

const WORK_2 = "44444444-5555-4666-8777-888888888888";
const ENTRY_ACCRUAL = "99999999-aaaa-4bbb-8ccc-dddddddddddd";

test("plans.detail — a multi-attempt occurrence shows every PRIOR attempt with its own Work link and the current attempt number, and does not repeat the current Work", async () => {
  await withMockedEnv(
    rpcRouter({
      get_accounting_plan: PLAN_DETAIL,
      preview_accounting_plan: { plan_id: PLAN, status: "active", admitting: true, occurrences: [] },
      list_accounting_plan_occurrences: {
        plan_id: PLAN,
        occurrences: [
          {
            occurrence_id: "o1", due_date: "2026-09-01", leg: "primary", period_key: "2026-09-01",
            attempt: 2, revision: 1,
            intent_key: `plan:${PLAN}:r1:2026-09-01`, work_id: WORK_2, admitted_at: "2026-09-02T00:10:00Z",
            outcome: { state: "admitted" }, created_at: "2026-09-01T00:10:00Z",
            work_status: "completed", work_error: null, receipt_id: "r1", entry_id: "e1",
            reverses_entry_id: null,
            attempts: [
              { attempt: 1, work_id: WORK, intent_key: `plan:${PLAN}:r1:2026-09-01`, revision: 1, admitted_at: "2026-09-01T00:10:00Z" },
              { attempt: 2, work_id: WORK_2, intent_key: `plan:${PLAN}:r1:2026-09-01`, revision: 1, admitted_at: "2026-09-02T00:10:00Z" },
            ],
          },
        ],
      },
    }),
    async () => {
      const h = await renderComponent(app(createElement(PlanDetail, { clientId: CLIENT, planId: PLAN })));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        const text = h.text();
        // The current attempt number renders.
        assert.match(text, /Attempt 2/);
        // The PRIOR attempt (attempt 1, whose work_id differs from the row's current work_id) is on
        // screen with its own attempt number — and only ONE such prior attempt, not the current one
        // repeated as its own predecessor.
        assert.match(text, /Attempt 1 \(superseded\)/);
        const priorMatches = text.match(/Attempt 1 \(superseded\)/g) ?? [];
        assert.equal(priorMatches.length, 1, "the current Work is not rendered as a second prior attempt");
        // The prior attempt's Work is linked through the same helper the current work_id uses.
        const links = hrefs(h.container);
        assert.ok(links.some((href) => href.includes(`/work/${WORK}`)), `the prior attempt's Work is linked (saw ${JSON.stringify(links)})`);
        assert.ok(links.some((href) => href.includes(`/work/${WORK_2}`)), "the current Work is still linked too");
        // ONE row per occurrence — a prior attempt is not a second row carrying the due date.
        const dueDateRows = (function collect(n: { tagName?: string; childNodes?: unknown[] }, out: typeof n[]): typeof n[] {
          if (n.tagName === "TR" && textOf(n as never).includes("2026-09-01")) out.push(n);
          for (const c of (n.childNodes as (typeof n)[] | undefined) ?? []) collect(c, out);
          return out;
        })(h.container as never, []);
        assert.equal(dueDateRows.length, 1, "the due date appears in exactly one <tr> — one row per occurrence");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("plans.detail — a reversal occurrence links the entry it undoes under a label distinct from the entry it produced", async () => {
  await withMockedEnv(
    rpcRouter({
      get_accounting_plan: PLAN_DETAIL,
      preview_accounting_plan: { plan_id: PLAN, status: "active", admitting: true, occurrences: [] },
      list_accounting_plan_occurrences: {
        plan_id: PLAN,
        occurrences: [
          {
            occurrence_id: "o-rev", due_date: "2026-10-01", leg: "reversal", period_key: "2026-09-01",
            attempt: 1, revision: 1,
            intent_key: `plan:${PLAN}:r1:2026-10-01`, work_id: WORK, admitted_at: "2026-10-01T00:10:00Z",
            outcome: { state: "admitted" }, created_at: "2026-10-01T00:10:00Z",
            work_status: "completed", work_error: null, receipt_id: "r2", entry_id: "e2",
            reverses_entry_id: ENTRY_ACCRUAL,
            attempts: [
              { attempt: 1, work_id: WORK, intent_key: `plan:${PLAN}:r1:2026-10-01`, revision: 1, admitted_at: "2026-10-01T00:10:00Z" },
            ],
          },
        ],
      },
    }),
    async () => {
      const h = await renderComponent(app(createElement(PlanDetail, { clientId: CLIENT, planId: PLAN })));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Reverses entry/, "a label distinct from \"Open entry\"");
        const links = hrefs(h.container);
        assert.ok(links.some((href) => href.includes(`entry=${ENTRY_ACCRUAL}`)), `the reversed entry is linked (saw ${JSON.stringify(links)})`);
        assert.ok(links.some((href) => href.includes("entry=e2")), "the entry this occurrence PRODUCED is still linked, under its own label");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("plans.detail — a plan that is not in this client's books renders the scoped not-found sentence, never a blank page", async () => {
  await withMockedEnv(
    rpcRouter({
      get_accounting_plan: null,
      preview_accounting_plan: null,
      list_accounting_plan_occurrences: { plan_id: PLAN, occurrences: [] },
    }),
    async () => {
      const h = await renderComponent(app(createElement(PlanDetail, { clientId: CLIENT, planId: PLAN })));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        assert.match(h.text(), /That plan is not in this client's books\./);
        assert.match(h.text(), /never initiates a bank payment/, "the boundary statement stays on screen regardless");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
