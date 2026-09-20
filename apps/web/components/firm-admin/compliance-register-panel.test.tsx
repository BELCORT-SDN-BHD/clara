// components/firm-admin/compliance-register-panel.tsx — #996 "Mount the compliance watch
// disposition read on /settings/compliance too". The register aggregate itself
// (compliance.clients) is already proven by firm-admin-a11y.test.tsx and
// firm-admin-pages-a11y.test.tsx; this file proves the DISPOSITION half those two mounts never
// exercise (their fixtures carry `rows: []`, so no watch id ever resolves).
//
// THE FLOW UNDER TEST: `compliance.clients` deliberately carries no watch id
// (lib/firm-admin/compliance.ts's own header). This panel resolves it by reading
// list_review_queue A SECOND TIME, scoped per client (`p_scope:{client_id}`), and folds the
// result through the SAME `get_compliance_watch_disposition` door the needs-you receipt and the
// client Tax tab already call — no new door, no second query implementation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { ComplianceRegisterPanel } from "./compliance-register-panel";
import messages from "../../messages/en.json";

enableDomInspection();

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

const CLIENTS = [{ id: "c1", name: "Acme Sdn Bhd", status: "active", created_at: "2026-01-01T00:00:00Z" }];

/** #996 fix round (L10-STD-01 / S-996-1) — a register with MANY rows, which every cell above
 *  was blind to: their fixture carries exactly one client and one watch, so a per-row roster
 *  read and a per-panel one are indistinguishable in them. */
const MANY_IDS = ["c1", "c2", "c3", "c4", "c5"];
const MANY_CLIENTS = MANY_IDS.map((id, i) => ({
  id, name: `Client ${i + 1} Sdn Bhd`, status: "active", created_at: "2026-01-01T00:00:00Z",
}));

const ENVELOPE_BASE = {
  watermark: "w1",
  counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  next_cursor: null,
};

function aggregateEnvelope() {
  return {
    ...ENVELOPE_BASE,
    rows: [],
    compliance: {
      stale_evaluator: false,
      clients: [
        {
          client_id: "c1", service_group: "digital_services", state: "crossed",
          confirmed_included_cents: 50000000, unknown_or_mixed_cents: 0, screening_proxy_cents: 0,
          earliest_crossing_month: "2026-07-01", application_due: "2026-08-28", future_method_status: "not_assessed",
        },
      ],
    },
  };
}

function watchRow(watchId: string) {
  return {
    row_kind: "compliance_watch", section: "needs_review", client_id: "c1", counterparty_id: null, filing_id: null,
    entry_id: null, question_id: null, task_id: null, document_id: null, lane: null, auto: false,
    rule_backed: false, high_stakes: false, aged_since: "2026-07-01T00:00:00Z", amount_cents: null, period: "2026-07-31",
    question_text: "SST registration threshold watch (digital_services)", created_at: "2026-07-01T00:00:00Z", id: watchId,
    coding_kind: null, watch_id: watchId, tier: "crossed", finding_id: null, asset_id: null, advance_id: null,
    client_name: null, batch_ids: null, open_proposal_count: null,
  };
}

const ACKNOWLEDGED = {
  watch_id: "w1", client_id: "c1", service_group: "digital_services",
  watch_kind: "sst_registration", state: "crossed",
  acknowledged_by: "8a7b6c5d-0000-4000-8000-000000000001",
  acknowledged_at: "2026-09-18T02:30:00Z",
  snoozed_until: null, resolved_conclusion: null, resolved_by: null, resolved_at: null,
  resolved_evidence: null, updated_at: "2026-09-18T02:30:00Z",
  events: [
    { event_kind: "created", state_before: null, state_after: "monitored", figures: {}, actor: null, rationale: null, created_at: "2026-07-01T00:00:00Z" },
    { event_kind: "acknowledged", state_before: "crossed", state_after: "crossed", figures: {}, actor: "8a7b6c5d-0000-4000-8000-000000000001", rationale: "Client informed; registration in progress.", created_at: "2026-09-18T02:30:00Z" },
  ],
};

const NOT_ACKNOWLEDGED = { ...ACKNOWLEDGED, acknowledged_by: null, acknowledged_at: null, events: [ACKNOWLEDGED.events[0]] };

const ROSTER = [{ user_id: "8a7b6c5d-0000-4000-8000-000000000001", display_name: "Siti Rahman", role: "bookkeeper", created_at: "2026-01-01T00:00:00Z" }];

type Router = {
  scopedRows?: Record<string, unknown[]>;
  disposition?: unknown | { code: string; message: string; status?: number };
  roster?: unknown[];
};

function mockFetchFactory(opts: Router & { clients?: unknown[]; aggregate?: unknown }) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  /** EVERY request, including the bodyless REST GETs `calls` deliberately skips — the roster
   *  read (`clara.firm_members_visible`) is one of those, and counting it is the whole point of
   *  the per-panel-vs-per-row cell below. */
  const urls: string[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    urls.push(u);
    if (init?.body) calls.push({ url: u, body });
    if (u.includes("/rpc/list_review_queue")) {
      const scope = body.p_scope as { client_id?: string } | undefined;
      if (scope?.client_id) {
        return jsonResponse({ ...ENVELOPE_BASE, rows: opts.scopedRows?.[scope.client_id] ?? [] });
      }
      return jsonResponse(opts.aggregate ?? aggregateEnvelope());
    }
    if (u.includes("/rpc/get_compliance_watch_disposition")) {
      const answer = typeof opts.disposition === "function"
        ? (opts.disposition as (b: Record<string, unknown>) => unknown)(body)
        : opts.disposition;
      if (answer && typeof answer === "object" && "code" in (answer as Record<string, unknown>) && "message" in (answer as Record<string, unknown>)) {
        const a = answer as { code: string; message: string; status?: number };
        return jsonResponse({ code: a.code, message: a.message }, a.status ?? 400);
      }
      return jsonResponse(answer ?? { code: "CLR11", message: "watch not found" }, answer ? 200 : 400);
    }
    if (u.includes("/rest/v1/clients")) return jsonResponse(opts.clients ?? CLIENTS);
    if (u.includes("/firm_members_visible")) {
      if (opts.roster === undefined) return jsonResponse({ message: "roster unavailable" }, 403);
      return jsonResponse(opts.roster);
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return { impl, calls, urls };
}

async function mount() {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement("div", null, createElement("h1", null, "Compliance register"), createElement(ComplianceRegisterPanel)),
    }),
  );
  for (let i = 0; i < 6; i++) await h.settle();
  return h;
}

// ===========================================================================================

test("Ticket 996 AC1: a watch with a recorded acknowledgement shows its disposition on the register row", async () => {
  const { impl } = mockFetchFactory({ scopedRows: { c1: [watchRow("w1")] }, disposition: ACKNOWLEDGED, roster: ROSTER });
  await withMockedEnv(impl, async () => {
    const h = await mount();
    try {
      const text = h.text();
      assert.match(text, /Acme Sdn Bhd/, "the base register row must still render");
      assert.match(text, /Disposition/, "the disposition receipt block must be present");
      assert.match(text, /Acknowledged by Siti Rahman/, "and name the colleague who acknowledged it");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});

test("Ticket 996 AC2a: a watch whose id the scoped queue read never returns leaves the row unchanged", async () => {
  const { impl } = mockFetchFactory({ scopedRows: {} });
  await withMockedEnv(impl, async () => {
    const h = await mount();
    try {
      const text = h.text();
      assert.match(text, /Acme Sdn Bhd/);
      assert.doesNotMatch(text, /Disposition/, "no id resolved means no disposition block is added");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});

test("Ticket 996 AC2b: a resolvable watch with nothing recorded yet leaves the row unchanged (no 'nothing recorded' filler either)", async () => {
  const { impl } = mockFetchFactory({ scopedRows: { c1: [watchRow("w1")] }, disposition: NOT_ACKNOWLEDGED });
  await withMockedEnv(impl, async () => {
    const h = await mount();
    try {
      const text = h.text();
      assert.match(text, /Acme Sdn Bhd/);
      assert.doesNotMatch(text, /Disposition/);
      assert.doesNotMatch(text, /Nothing has been recorded/, "the register row stays exactly as it was, not a new empty-state sentence");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});

test("Ticket 996 AC3: a caller below the bookkeeper floor sees the register plus a stated reason, never an error banner or a blank", async () => {
  const { impl } = mockFetchFactory({ scopedRows: { c1: [watchRow("w1")] }, disposition: { code: "CLR04", message: "insufficient role" } });
  await withMockedEnv(impl, async () => {
    const h = await mount();
    try {
      const text = h.text();
      assert.match(text, /Acme Sdn Bhd/, "the register itself must still render in full");
      assert.match(text, /digital_services/);
      assert.doesNotMatch(text, /Disposition/, "no per-row disposition block for a floor this session cannot clear");
      assert.match(text, /bookkeeper/i, "and a stated reason, naming the floor, appears somewhere on the page");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});

test("Ticket 996 fix round: a register with five dispositioned rows reads the firm roster ONCE, not once per row", async () => {
  // THE DEFECT THIS CELL EXISTS FOR (standards review L10-STD-01, spec review S-996-1,
  // 2026-09-20). Extracting `WatchDispositionLine` moved `useMemberNames` out of the
  // per-affordance `WatchDispositionReceipt` and INTO the per-act line — and this panel renders
  // that line once per register row. `lib/members/use-member-names.ts`'s own header states the
  // rule in as many words: "ONE READ PER MOUNT ... callers that show many actors on one page
  // should hold the hook ONCE at the panel level and pass `resolve` down, rather than mounting
  // it per row." A firm-wide register is exactly such a page, and the cells above could not see
  // it because their fixture has one client and one watch.
  const aggregate = {
    ...ENVELOPE_BASE,
    rows: [],
    compliance: {
      stale_evaluator: false,
      clients: MANY_IDS.map((id) => ({
        client_id: id, service_group: "digital_services", state: "crossed",
        confirmed_included_cents: 50000000, unknown_or_mixed_cents: 0, screening_proxy_cents: 0,
        earliest_crossing_month: "2026-07-01", application_due: "2026-08-28",
        future_method_status: "not_assessed",
      })),
    },
  };
  const scopedRows: Record<string, unknown[]> = {};
  for (const id of MANY_IDS) scopedRows[id] = [{ ...watchRow(`w-${id}`), client_id: id }];

  const { impl, urls } = mockFetchFactory({
    aggregate,
    clients: MANY_CLIENTS,
    scopedRows,
    // Each watch answers for ITS OWN client, so `byKey` carries five distinct entries rather
    // than five copies of one — the register's own keying is (client_id, service_group).
    disposition: (body: Record<string, unknown>) => {
      const watch = String(body.p_watch);
      return { ...ACKNOWLEDGED, watch_id: watch, client_id: watch.replace(/^w-/, "") };
    },
    roster: ROSTER,
  });
  await withMockedEnv(impl, async () => {
    const h = await mount();
    try {
      // The rows really are all there and all resolved, so the count below is not a count over
      // an empty register.
      const text = h.text();
      for (let i = 1; i <= MANY_IDS.length; i++) assert.match(text, new RegExp(`Client ${i} Sdn Bhd`));
      assert.equal((text.match(/Acknowledged by Siti Rahman/g) ?? []).length, MANY_IDS.length,
        "every row resolved its actor through the roster");

      const rosterReads = urls.filter((u) => u.includes("/firm_members_visible")).length;
      assert.equal(rosterReads, 1,
        `the firm roster is read ONCE for the whole panel, not once per row (saw ${rosterReads} for ${MANY_IDS.length} rows)`);
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});
