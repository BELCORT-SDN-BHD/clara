// The client workspace Home tab — NEW (the map's item F-1 records that no test file for this
// component existed at all). One cell per section, each proving loading / error / empty are told
// apart, and that a failed read in one section does not blank the others.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClientWorkspaceOverview } from "./client-workspace-overview";

enableDomInspection();

const CLIENT_ID = "c1";
const CLIENT = [{ id: CLIENT_ID, name: "Rome Properties Sdn Bhd", status: "active", created_at: "2026-03-12T00:00:00Z" }];
const FY_END = [{ id: CLIENT_ID, name: "Rome Properties Sdn Bhd", fy_end_month: 12, fy_end_day: 31 }];

const FACTS = [
  { id: "f1", client_id: CLIENT_ID, fact_key: "entity_type", fact_value: "Sdn Bhd", basis: "the incorporation certificate",
    basis_kind: "document", source_document_id: null, recorded_by: "u1", recorded_at: "2026-03-12T00:00:00Z",
    superseded_by: null, superseded_at: null },
  { id: "f0", client_id: CLIENT_ID, fact_key: "entity_type", fact_value: "Enterprise", basis: "an earlier note",
    basis_kind: "owner_instruction", source_document_id: null, recorded_by: "u1", recorded_at: "2026-01-01T00:00:00Z",
    superseded_by: "f1", superseded_at: "2026-03-12T00:00:00Z" },
];
const FACT_KEYS = [{ fact_key: "entity_type", validated_against: "list", allowed_values: null, description: "Entity type" }];

const QUESTION_ROW = {
  row_kind: "open_question", section: "needs_you", client_id: CLIENT_ID, counterparty_id: null,
  filing_id: null, entry_id: null, question_id: "q1", task_id: null, document_id: "d1",
  lane: null, auto: false, rule_backed: false, high_stakes: false, aged_since: "2026-08-20T00:00:00Z",
  amount_cents: null, period: null, question_text: "Which cost centre for INV-2291?",
  created_at: "2026-08-20T00:00:00Z", id: "q1", coding_kind: null, watch_id: null, tier: null,
  finding_id: null, asset_id: null, advance_id: null, client_name: null, batch_ids: null,
  open_proposal_count: null,
};

const ENVELOPE = {
  watermark: "w",
  counts: { ready: 1, needs_review: 4, needs_you: 2, open_drafts: 1, open_questions: 1, open_tasks: 0, compliance_watches: 0, lint_findings: 2 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [QUESTION_ROW], next_cursor: null,
};

// THE YEAR'S OWN END DATE DIFFERS FROM THE CLIENT'S STANDING PAIR ON PURPOSE (review-557,
// MAJOR 2). `FY_END` above carries 31/12 — the client's standing year end, written by
// `set_client_fy_end` — while this year ENDS on 30 June, a short period. The two are written by
// different doors and `fy_end_source` provenances only the second. With identical dates the
// cell below could not tell a correct render from the defect it was written to catch.
const FISCAL_YEARS = [{
  fiscal_year_id: "fy1", label: "FY 2026", ordinal: 2, starts_on: "2026-01-01", ends_on: "2026-06-30",
  status: "open", fy_end_source: "asserted", has_active_reopen_receipt: false,
}];
const READINESS = {
  fiscal_year_id: "fy1", close_run_id: null, run_state: null, fy_end_source: "asserted",
  gates: [
    { check_key: "a", drawer: 1, state: "pass", measured: null, measured_digest: "x", attested: false },
    { check_key: "b", drawer: 1, state: "fail", measured: null, measured_digest: "y", attested: false },
    { check_key: "c", drawer: 2, state: "pass", measured: null, measured_digest: "z", attested: false },
  ],
};
const ACCOUNTS = [{
  id: "b1", bank_code: "MBB", bank_name: "Maybank", bank_name_display: "Maybank", account_number: "****4021",
  account_number_normalized: "4021", coa_account_code: "1010", coa_account_name: "Bank", active: true,
  created_at: null, deactivated_at: null, deactivated_reason: null,
}];
const STATEMENTS = [{
  id: "s1", bank_account_id: "b1", document_id: null, period_start: "2026-08-01", period_end: "2026-08-31",
  statement_date: "2026-08-31", opening_cents: 0, closing_cents: 100, total_debit_cents: null,
  total_credit_cents: null, line_count: 3, status: "posted", ingest_mode: "human", superseded_by: null,
  voided_by: null, voided_at: null, voided_reason: null, created_at: null,
}];

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

function wire(overrides: Record<string, () => Response> = {}): typeof fetch {
  return async (u) => {
    const url = String(u);
    for (const [needle, make] of Object.entries(overrides)) {
      if (url.includes(needle)) return make();
    }
    // `clients` is read TWICE with different projections — the client record and the fiscal
    // year end. They are told apart by the select, exactly as the two callers spell it.
    if (url.includes("/rest/v1/clients") && url.includes("fy_end_month")) return jsonResponse(FY_END);
    if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENT);
    if (url.includes("/rest/v1/client_fact_keys")) return jsonResponse(FACT_KEYS);
    if (url.includes("/rest/v1/client_facts")) return jsonResponse(FACTS);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([]);
    if (url.includes("/rest/v1/coding_tasks_visible")) return jsonResponse([]);
    if (url.includes("/rest/v1/lint_findings")) return jsonResponse([{ id: "l1" }, { id: "l2" }]);
    if (url.includes("/rest/v1/attribution_candidates")) return jsonResponse([{ id: "a1" }, { id: "a2" }, { id: "a3" }]);
    if (url.includes("/rest/v1/close_prep_holds")) return jsonResponse([]);
    if (url.includes("/rpc/list_review_queue")) return jsonResponse(ENVELOPE);
    if (url.includes("/rpc/list_uncoded_filings")) return jsonResponse([{ filing_id: "u1" }]);
    if (url.includes("/rpc/list_bank_accounts")) return jsonResponse(ACCOUNTS);
    if (url.includes("/rpc/list_bank_account_proposals")) return jsonResponse([{ id: "p1" }]);
    if (url.includes("/rpc/list_bank_statements")) return jsonResponse(STATEMENTS);
    if (url.includes("/rpc/list_fiscal_years")) return jsonResponse(FISCAL_YEARS);
    if (url.includes("/rpc/get_close_readiness")) return jsonResponse(READINESS);
    if (url.includes("/rpc/list_agent_act_receipts")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${url}`);
  };
}

/** #546's `ContinueOnboardingCard` uses `usePathname` to build its `?from=` return link, so the
 *  onboarding arm needs the real navigation contexts rather than a stub of its own. Supplied for
 *  every cell so the two arms differ only in the FIXTURE, never in the harness around them. */
async function mount(clientId = CLIENT_ID) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en", messages,
      children: createElement(
        AppRouterContext.Provider as never,
        { value: { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} } as never },
        createElement(
          PathnameContext.Provider as never,
          { value: `/clients/${clientId}` as never },
          createElement(ClientWorkspaceOverview, { clientId }),
        ),
      ),
    }),
  );
  for (let i = 0; i < 8; i++) await h.settle();
  return h;
}

/** The ONBOARDING arm's fixture, shared by the progress cell and the a11y cell below so the two
 *  are measuring the same screen. A plan with two REQUIRED items (one answered) and one that is
 *  not required, no finalized opening seed, and the empty session list that sends #546's
 *  escalation card down its rail-focus arm. */
const ONBOARDING_WIRE = {
  "/rest/v1/clients": () => jsonResponse([{ ...CLIENT[0], status: "onboarding" }]),
  "/rest/v1/onboarding_plans": () => jsonResponse([{ id: "p1", firm_id: "f1", scope_kind: "client", client_id: CLIENT_ID, state: "open", revision_token: "t", revision_n: 3, committed_at: null, committed_by: null, review_maker: null, reviewed_at: null, contributors: [], commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T00:00:00Z", opened_by_agent: false, opener_model: null, opened_from_question: null }]),
  "/rest/v1/onboarding_plan_items": () => jsonResponse([
    { id: "i1", plan_id: "p1", firm_id: "f1", item_kind: "must_ask", item_key: "a", question: null, answer: null, state: "answered", required_for_commit: true, answered_by: null, answered_at: null, created_at: "", updated_at: "" },
    { id: "i2", plan_id: "p1", firm_id: "f1", item_kind: "must_ask", item_key: "b", question: null, answer: null, state: "pending", required_for_commit: true, answered_by: null, answered_at: null, created_at: "", updated_at: "" },
    { id: "i3", plan_id: "p1", firm_id: "f1", item_kind: "todo", item_key: "c", question: null, answer: null, state: "pending", required_for_commit: false, answered_by: null, answered_at: null, created_at: "", updated_at: "" },
  ]),
  "/rest/v1/opening_seed_registry": () => jsonResponse([]),
  "/api/runtime/chat/sessions": () => jsonResponse({ sessions: [] }),
};

test("A — identity: the h1 is the client's own name, the status badge carries its LABEL, and only LIVE facts render", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /Rome Properties Sdn Bhd/);
      assert.match(h.text(), /Active/, "the status badge must not be colour-only");
      assert.match(h.text(), /Entity type: Sdn Bhd · document/, "the live fact carries its basis_kind in the chip itself");
      assert.doesNotMatch(h.text(), /Enterprise/, "a SUPERSEDED fact must never render as current");
      assert.match(h.text(), /Client since 2026-03-12/);
    } finally { await h.unmount(); }
  });
});

test("C — needs you: the chips are the envelope's own counts, and each row is a NeedsYouRow with its deep link AND its inline act", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      // counts.needs_you is 2 over a rows[] of length 1 — the discriminating pair against a
      // build that derived the chip from the page.
      assert.match(h.text(), /Needs you: 2/);
      assert.doesNotMatch(h.text(), /Needs you: 1\b/);
      assert.match(h.text(), /Which cost centre for INV-2291\?/);
      assert.match(h.text(), /Open the documents tab/, "the deep link the bare <li> never had");
      assert.match(h.text(), /Resolve/, "and the inline act — this altitude is the client's own inbox");
      assert.match(h.text(), /Dismiss/);
    } finally { await h.unmount(); }
  });
});

test("D — documents & coding: four counts, each a full noun phrase rather than a bare number, and a zero count is omitted", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /3 filings awaiting attribution/);
      assert.match(h.text(), /1 filing not coded/, "the singular ICU arm");
      assert.match(h.text(), /2 lint findings open/);
      assert.doesNotMatch(h.text(), /0 coding tasks open/, "a zero backlog is not a line item");
    } finally { await h.unmount(); }
  });
});

test("E — bank: the label is the LATEST STATEMENT per account and never 'coverage'; an account with none says so", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /Maybank \*\*\*\*4021/);
      assert.match(h.text(), /Latest statement to 2026-08-31/);
      assert.doesNotMatch(h.text(), /coverage/i, "no read computes a period gap — the word would promise one");
      assert.match(h.text(), /1 account proposal pending/);
    } finally { await h.unmount(); }
  });
  await withMockedEnv(wire({ "/rpc/list_bank_statements": () => jsonResponse([]) }), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /No statement recorded/);
      assert.doesNotMatch(h.text(), /Latest statement to/);
    } finally { await h.unmount(); }
  });
});

// ADDED BY THE MUTANT PANEL (M16). Flipping `unreadable: true` to `false` in the per-account
// catch — turning "this account's statements could not be read" into "this account has no
// statement" — left the whole suite GREEN, so nothing was pinning the one branch on this board
// where absence is most easily mistaken for evidence. The account list still resolves, so the
// SECTION cannot report the failure; only the row can.
test("E — bank: an account whose OWN statement read failed says so, and never claims the account has no statement", async () => {
  await withMockedEnv(
    wire({ "/rpc/list_bank_statements": () => jsonResponse({ message: "boom" }, 500) }),
    async () => {
      const h = await mount();
      try {
        assert.match(h.text(), /Maybank \*\*\*\*4021/, "the account itself still renders — its own read succeeded");
        assert.match(h.text(), /Statements could not be read for this account/);
        assert.doesNotMatch(h.text(), /No statement recorded/, "a failed read must never be reported as an empty one");
        assert.doesNotMatch(h.text(), /No bank accounts recorded/, "and it must not blank the section either");
      } finally { await h.unmount(); }
    },
  );
});

test("F — close: the gate tally counts only PASSING gates out of gates the DB RETURNED, and the year end carries its basis", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /FY 2026/);
      // Two of three returned gates pass. A build counting `advisory` or unmeasured gates as
      // passing would print a different pair.
      assert.match(h.text(), /2 of 3 measured gates passing/);
      // THE DISCRIMINATING PAIR (review-557, MAJOR 2). The basis word provenances the FISCAL
      // YEAR's own `ends_on`, so that is the date it must sit beside. The client's standing
      // 31/12 is a different fact written by a different door, and pairing it with this word
      // would be a provenance claim the database never made.
      assert.match(h.text(), /2026-06-30 \(stated by your firm\)/, "the YEAR's own end date carries the YEAR's own source");
      assert.doesNotMatch(h.text(), /31\/12 \(stated by your firm\)/, "the client's standing pair must never wear this basis word");
      assert.doesNotMatch(h.text(), /Year end on file/, "and the standing pair belongs only to the no-fiscal-year arm");
      assert.doesNotMatch(h.text(), /Close prep on hold/, "no live hold in this fixture");
    } finally { await h.unmount(); }
  });
});

test("F — close: a LIVE hold renders its badge; and a client with no fiscal years renders the honest empty, not a zero tally", async () => {
  await withMockedEnv(
    wire({ "/rest/v1/close_prep_holds": () => jsonResponse([{ id: "h1", client_id: CLIENT_ID, purpose: "close_prep", held_by: "u1", reason: "r", held_at: "2026-09-01T00:00:00Z", released_by: null, released_at: null, release_reason: null }]) }),
    async () => {
      const h = await mount();
      try { assert.match(h.text(), /Close prep on hold/); } finally { await h.unmount(); }
    },
  );
  await withMockedEnv(wire({ "/rpc/list_fiscal_years": () => jsonResponse([]) }), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /No fiscal years opened yet for this client\./);
      assert.doesNotMatch(h.text(), /0 of 0 measured gates/, "an absent year is not a zero-gate year");
      // The ONE place the client's standing pair belongs — and it wears no basis word, because
      // nothing provenances it (review-557, MAJOR 2).
      assert.match(h.text(), /Year end on file: 31\/12/);
      assert.doesNotMatch(h.text(), /stated by your firm/, "no read provenances the client's standing pair");
    } finally { await h.unmount(); }
  });
});

test("B — onboarding: ABSENT for an active client with no plan, and PRESENT with a real count for an onboarding one", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.doesNotMatch(h.text(), /Onboarding/, "an established client has no onboarding story — not even an empty card");
    } finally { await h.unmount(); }
  });
  await withMockedEnv(wire(ONBOARDING_WIRE), async () => {
    const h = await mount();
    try {
      // 1 of 2 REQUIRED — the third item is not required and must not enter either side.
      assert.match(h.text(), /1 of 2 required answers recorded/);
      assert.match(h.text(), /The opening position is not finalised yet\./);
    } finally { await h.unmount(); }
  });
});

// review-557's BLOCKER. Every a11y scan on this board mounted an ACTIVE client, which is the one
// arm that does NOT render #546's escalation card — and that card carries its own `<h2>`. With
// the card above the `<h1>` this train moved into the identity band, the onboarding document
// opened H2, H1, H2: a `heading-order` violation, and a regression against main, which rendered
// the page header first. The defect was real and the suite could not see it, because no cell
// ever mounted the arm that had it. This is that cell.
test("the ONBOARDING arm is axe-clean too — the escalation card's h2 never precedes the client's h1", async () => {
  await withMockedEnv(wire(ONBOARDING_WIRE), async () => {
    const h = await mount();
    try {
      // POSITIVE CONTROL FIRST: the card and the section that surround the ordering claim must
      // both actually be on screen, or a clean scan would be clean for the wrong reason.
      assert.match(h.text(), /Continue onboarding with Clara/, "the escalation card must have rendered");
      assert.match(h.text(), /1 of 2 required answers recorded/, "and so must the progress section");

      // The ordering itself, read off the document rather than inferred: the FIRST heading in
      // DOM order is the client's own h1.
      const headings: string[] = [];
      const walk = (n: unknown): void => {
        const tag = (n as { tagName?: string }).tagName;
        if (typeof tag === "string" && /^H[1-6]$/.test(tag)) headings.push(tag);
        for (const c of ((n as { childNodes?: unknown[] }).childNodes ?? [])) walk(c);
      };
      walk(h.container);
      assert.equal(headings[0], "H1", `the document must open on the client's own name; got ${headings.join(",")}`);
      assert.equal(headings.filter((t) => t === "H1").length, 1, `exactly one h1; got ${headings.join(",")}`);

      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally { await h.unmount(); }
  });
});

test("ONE failed read does not blank the others — a dead bank read leaves identity, the queue and close standing", async () => {
  await withMockedEnv(wire({ "/rpc/list_bank_accounts": () => jsonResponse({ message: "boom" }, 500) }), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /Rome Properties Sdn Bhd/);
      assert.match(h.text(), /Which cost centre for INV-2291\?/);
      assert.match(h.text(), /2 of 3 measured gates passing/);
      assert.match(h.text(), /Something went wrong/, "the failed section shows its own failure");
      assert.doesNotMatch(h.text(), /No bank accounts recorded/, "a FAILED read must never render the honest-empty claim");
    } finally { await h.unmount(); }
  });
});

test("a client this session cannot see renders the not-found message and NO section at all", async () => {
  await withMockedEnv(wire({ "/rest/v1/clients": () => jsonResponse([]) }), async () => {
    const h = await mount("missing");
    try {
      assert.match(h.text(), /No client with this id is visible to your firm\./);
      assert.doesNotMatch(h.text(), /Needs your attention/, "no section may render for a client that does not resolve");
    } finally { await h.unmount(); }
  });
});

test("the board is axe-clean and its grid reflows on a CONTAINER query, not a viewport one", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      const grid = h.find((n) => String((n as { className?: string }).className ?? "").includes("@3xl:grid-cols-"));
      assert.ok(grid, "the two-column template must be a container-query variant at 48rem");
      assert.doesNotMatch(String((grid as { className?: string }).className ?? ""), /\blg:grid-cols-|\bmd:grid-cols-/);
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally { await h.unmount(); }
  });
});
