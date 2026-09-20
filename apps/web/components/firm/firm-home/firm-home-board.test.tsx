// Firm Home — one cell per section, each with a DISCRIMINATING post-condition.
//
// The map's own test obligation for item E-1: "a render test per widget asserting the tile
// renders ONLY DB-supplied values, and a NotBuiltNote — not a zero — where no read exists", plus
// "a test that the close-status tile renders the not-built note, pinned so a later lane cannot
// quietly fabricate a firm-wide close number".

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { checkAccessibility } from "../../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../../lib/session-accessor";
import messages from "../../../messages/en.json";
import { FirmHomeBoard } from "./firm-home-board";

enableDomInspection();

const CALLER = [{
  user_id: "u1", firm_id: "f1", firm_name: "BELCORT SDN BHD", role: "owner",
  role_rank: 3, is_operator: true,
}];

const CLIENTS = [
  { id: "c1", name: "Rome Properties", status: "active", created_at: "2026-01-01T00:00:00Z" },
  { id: "c2", name: "Bee Creative", status: "onboarding", created_at: "2026-02-01T00:00:00Z" },
];

const QUEUE_ROW = {
  row_kind: "draft", section: "needs_you", client_id: "c1", counterparty_id: null,
  filing_id: null, entry_id: "e1", question_id: null, task_id: null, document_id: null,
  lane: null, auto: false, rule_backed: false, high_stakes: true,
  aged_since: "2026-08-01T00:00:00Z", amount_cents: 1_240_000, period: "2026-08",
  question_text: null, created_at: "2026-08-01T00:00:00Z", id: "e1", coding_kind: null,
  watch_id: null, tier: null, finding_id: null, asset_id: null, advance_id: null,
  client_name: null, batch_ids: null, open_proposal_count: null,
};

const ENVELOPE = {
  watermark: "w",
  counts: {
    ready: 5, needs_review: 12, needs_you: 3, open_drafts: 2,
    open_questions: 1, open_tasks: 0, compliance_watches: 0, lint_findings: 4,
  },
  sweep: { open_run: false, last_finalized_at: "2026-09-03T00:31:00Z", last_ack_at: null },
  rows: [QUEUE_ROW], next_cursor: null,
};

// #659 (D18.f) — Recent activity reads clara.list_activity now, not clara.list_firm_timeline, so
// the board can render WHO did each thing through the one shared actor cell. The sentence is still
// the database's own; what is new beside it is the person.
const ACTIVITY = {
  rows: [{
    id: "ev-7", source: "event", event_type: "entry_posted", description: "An entry was posted.",
    client_id: "c1", actor: "11111111-1111-4111-8111-111111111111", on_behalf_of: null,
    via_wake_kind: null, occurred_at: "2026-09-04T01:12:00Z",
    object_kind: "entry", object_id: "e1", work_id: null, receipt_id: null, document_id: null,
    original_entry_id: null, replacement_entry_id: null, status: "approved", kind: "journal",
  }],
  next_cursor: null, truncated: false,
};

const MEMBERS = [{
  membership_id: "m1", user_id: "11111111-1111-4111-8111-111111111111",
  display_name: "Tao", email: "tao@example.com", role: "owner", status: "active",
  created_at: "2026-01-01T00:00:00Z", removed_at: null,
}];

// #659 — the portfolio pack. TWO clients, one of them archived, so the board's own disclosure and
// its count links are exercised by the happy path rather than only by the portfolio's own cells.
const PORTFOLIO = {
  computed_at: "2026-09-19T02:00:00.000Z",
  preview_limit: 3,
  page_limit: 50,
  window: {
    from: "2026-09-12T16:00:00Z", to: "2026-09-19T16:00:00Z",
    from_date: "2026-09-13", to_date: "2026-09-19", timezone: "Asia/Kuala_Lumpur", days: 7,
  },
  rows: [
    {
      client_id: "c1", name: "Rome Properties", status: "active",
      active: 4, attention_failed: 1, failed: 1, refused: 0, recent_success: 2,
      uncounted_completions: 0, coverage: "ok", coverage_reason: null, preview: [],
    },
    {
      client_id: "c2", name: "Bee Creative", status: "onboarding",
      active: 1, attention_failed: 0, failed: 0, refused: 0, recent_success: 0,
      uncounted_completions: 0, coverage: "partial",
      coverage_reason: "onboarding_client_excluded_from_queue", preview: [],
    },
  ],
  next_cursor: null, truncated: false, coverage: "ok", coverage_reason: null,
  sources: {
    work: { computed_at: "2026-09-19T02:00:00.000Z" },
    review_queue: { signal: "watermark", excludes: ["onboarding", "archived"] },
    compliance: { signal: "stale_evaluator", window_hours: 48 },
    lint: { signal: "stale_evaluator" },
    sweep: { signal: "last_finalized_at" },
  },
  needs_you_ref: { source: "list_review_queue.counts", floor: "viewer", excludes: ["onboarding", "archived"] },
};

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

/** Every read the board makes, answered. `overrides` replaces one of them per cell, so each
 *  case differs from the happy path by exactly the read it is about. */
function wire(overrides: Record<string, () => Response> = {}): typeof fetch {
  return async (u) => {
    const url = String(u);
    for (const [needle, make] of Object.entries(overrides)) {
      if (url.includes(needle)) return make();
    }
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER);
    if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
    if (url.includes("/rest/v1/agent_tasks_visible")) return jsonResponse([]);
    if (url.includes("/rpc/list_review_queue")) return jsonResponse(ENVELOPE);
    if (url.includes("/rpc/list_activity")) return jsonResponse(ACTIVITY);
    if (url.includes("/rpc/get_firm_portfolio_pack")) return jsonResponse(PORTFOLIO);
    if (url.includes("/rest/v1/firm_members_visible")) return jsonResponse(MEMBERS);
    throw new Error(`unexpected fetch: ${url}`);
  };
}

const router = { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };

async function mount(search = "") {
  // #659 — the board reads `?status=&attention=&q=&cursor=` through `useSearchParams` now, so the
  // three App-Router contexts the real route always supplies are supplied here too.
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
      children: createElement(
        SearchParamsContext.Provider as never,
        { value: new URLSearchParams(search) as never },
        createElement(
          AppRouterContext.Provider as never,
          { value: router as never },
          createElement(PathnameContext.Provider as never, { value: "/" as never },
            createElement(FirmHomeBoard) as never),
        ),
      ),
    }),
  );
  for (let i = 0; i < 8; i++) await h.settle();
  return h;
}

test("Firm Home: the h1 is the firm's OWN name from caller_context, and there is no greeting by name", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /BELCORT SDN BHD/);
      assert.doesNotMatch(h.text(), /Good morning|Good afternoon|Welcome back/i,
        "caller_context has no display-name column — a greeting would be a name this build invented");
      // The role/client-mix line comes from the SAME read plus the register count, never a guess.
      // The ROSTER'S OWN LABEL, not the DB token (review-557, MAJOR 4). `caller_context.role`
      // is `owner`; what a professional reads beside their firm's name is "Owner", the same
      // word the members roster uses. The negative half is the discriminator: a regression to
      // printing the raw token reds here rather than passing on a case-insensitive match.
      assert.match(h.text(), /Owner · 2 clients/);
      assert.doesNotMatch(h.text(), /owner · 2 clients/, "the raw DB token must not reach the eye");
    } finally { await h.unmount(); }
  });
});

test("Firm Home: the scoreboard chips are the envelope's OWN counts, never rows.length", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      // The envelope ships needs_you: 3 over a rows[] of length 1. A build that derived the
      // chip from the page would print 1 here — this is the discriminating pair.
      assert.match(h.text(), /Needs you: 3/);
      assert.doesNotMatch(h.text(), /Needs you: 1/);
      assert.match(h.text(), /Needs review: 12/);
      // A real DB zero renders as 0 and is never hidden.
      assert.match(h.text(), /Open coding tasks: 0/);
    } finally { await h.unmount(); }
  });
});

test("Firm Home: the orientation sentence is built from the same counts, and the caught-up arm is a DIFFERENT sentence", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /3 items need you\./);
      assert.match(h.text(), /12 are awaiting review\./);
      assert.doesNotMatch(h.text(), /You are caught up/);
    } finally { await h.unmount(); }
  });
  await withMockedEnv(
    wire({ "/rpc/list_review_queue": () => jsonResponse({ ...ENVELOPE, counts: { ...ENVELOPE.counts, needs_you: 0, needs_review: 0 }, rows: [] }) }),
    async () => {
      const h = await mount();
      try {
        assert.match(h.text(), /You are caught up\./);
        assert.doesNotMatch(h.text(), /items need you/);
      } finally { await h.unmount(); }
    },
  );
});

test("Firm Home: the triage row is LINK-ONLY — its owning-tab link, and no inline Resolve or Dismiss", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /Open the journals tab/, "the row must offer the tab that owns its verb");
      assert.match(h.text(), /Rome Properties/, "the client name is merged from the register, not guessed");
      assert.match(h.text(), /high stakes/, "high_stakes is read today and rendered nowhere — this board renders it");
      assert.match(h.text(), /waiting \d+ days/, "aged_since is the earned signal this list exists for");
      // The decision-3 discriminator: the inline acts belong to the CLIENT board, not this one.
      assert.doesNotMatch(h.text(), /Resolve|Dismiss/, "Firm Home dispatches; the verb lives on the owning surface");
    } finally { await h.unmount(); }
  });
});

test("Firm Home: the close roll-up is an honest NotBuiltNote — never a fabricated firm-wide close number", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /A firm-wide close status per client is still not built/);
      assert.match(h.text(), /Statutory deadlines are not recorded yet/);
      // Pinned so a later lane cannot quietly replace the note with a number.
      assert.doesNotMatch(h.text(), /gates met|close ready|0 of 7/i);
    } finally { await h.unmount(); }
  });
});

test("Firm Home (ticket 659, D18.f): a 404 on list_activity is a REAL read failure — the not-deployed arm has no honest referent any more", async () => {
  // THE REPLACED CELL, and the reason is the swap. `clara.list_firm_timeline` had a not-deployed
  // arm because a database could predate migration 0174; `clara.list_activity` exists in every
  // database at this frontier (0181:218 -> 0202:204), so a 404 from it is deployment skew, a
  // misnamed argument or an outage — and painting any of those as "not built yet" is the same lie
  // in the opposite direction. Without this cell the swap would have quietly retired the coverage
  // the old one carried while leaving it green.
  await withMockedEnv(
    wire({ "/rpc/list_activity": () => jsonResponse({ code: "PGRST202", message: "could not find function" }, 404) }),
    async () => {
      const h = await mount();
      try {
        // The SHARED typed banner, the one `DataState` renders for every `kind: "not_found"` read
        // in this app — not a bespoke sentence this surface writes about itself.
        assert.match(h.text(), /This isn't available yet\./,
          "a 404 renders as the typed read failure it is, through the shared classifier");
        assert.doesNotMatch(h.text(), /The firm activity timeline is not available yet/,
          "the dedicated not-deployed note is GONE — it described a pre-0174 database and this read is not that one");
        assert.doesNotMatch(h.text(), /No firm activity recorded yet/,
          "and a failed read is never an honest-empty claim");
      } finally { await h.unmount(); }
    },
  );
});

test("Firm Home (ticket 659, D18.f): recent activity renders the DB's own sentence day-grouped AND the person who did it — and a 403 is still a failure", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /An entry was posted\./, "the sentence is the DB's own, printed verbatim");
      assert.match(h.text(), /2026-09-04/, "the day header is the business-timezone calendar day");
      assert.match(h.text(), /Tao/,
        "and the ACTOR is rendered now — list_firm_timeline carried the uuid and this board dropped it");
      // #861 — THE RESIDUAL DISCLOSURE IS GONE, and this is the cell that used to require it.
      // Until migration 0264 the door filed membership, invitation, fixed-asset,
      // counterparty-identity and client-facet events under `documents`, and this band said so
      // in words under its list rather than patching a second, disagreeing ladder into the
      // browser. The door files them under their own kinds now, so the sentence would be a
      // false statement on the surface — the honest-note discipline cuts both ways.
      assert.doesNotMatch(h.text(), /wrong kind by the activity door/,
        "the kind-ladder residual was fixed in the door (#861); its disclosure must not outlive it");
    } finally { await h.unmount(); }
  });
  await withMockedEnv(
    wire({ "/rpc/list_activity": () => jsonResponse({ message: "forbidden" }, 403) }),
    async () => {
      const h = await mount();
      try {
        assert.match(h.text(), /can't read this yet/, "a grant failure is a real answer about the caller");
        assert.doesNotMatch(h.text(), /The firm activity timeline is not available yet/);
      } finally { await h.unmount(); }
    },
  );
});

test("Firm Home: ONE failed read does not blank the others — a dead client register leaves the queue and recent activity standing", async () => {
  await withMockedEnv(
    wire({ "/rest/v1/clients": () => jsonResponse({ message: "boom" }, 500) }),
    async () => {
      const h = await mount();
      try {
        assert.match(h.text(), /Needs you: 3/, "the queue section still renders its real numbers");
        assert.match(h.text(), /An entry was posted\./, "and so does recent activity");
        assert.match(h.text(), /Something went wrong/, "while the failed section shows its own failure");
        // The register failing must not fabricate a client mix.
        assert.doesNotMatch(h.text(), /active · .* onboarding/);
      } finally { await h.unmount(); }
    },
  );
});

test("Firm Home: the two-column grid reflows on a CONTAINER query, not a viewport one", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      // A DOM cell, deliberately: the shell's rails make a viewport breakpoint wrong whenever
      // the Clara rail toggles at a fixed width, so the class names are the contract. A regress
      // to `lg:grid-cols-*` reds here.
      const container = h.find((n) => String((n as { className?: string }).className ?? "").includes("@container"));
      assert.ok(container, "the grid must sit inside a container-query container");
      const grid = h.find((n) => String((n as { className?: string }).className ?? "").includes("@3xl:grid-cols-"));
      assert.ok(grid, "the two-column template must be a container-query variant at 48rem");
      const cls = String((grid as { className?: string }).className ?? "");
      assert.match(cls, /grid-cols-1/, "one column is the base, widened by the container query");
      assert.doesNotMatch(cls, /\blg:grid-cols-|\bmd:grid-cols-|\bxl:grid-cols-/, "no viewport breakpoint may drive this grid");
    } finally { await h.unmount(); }
  });
});

test("Firm Home: zero a11y violations, with one h1 and no skipped heading level", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally { await h.unmount(); }
  });
});
