// Firm Home — one cell per section, each with a DISCRIMINATING post-condition.
//
// The map's own test obligation for item E-1: "a render test per widget asserting the tile
// renders ONLY DB-supplied values, and a NotBuiltNote — not a zero — where no read exists", plus
// "a test that the close-status tile renders the not-built note, pinned so a later lane cannot
// quietly fabricate a firm-wide close number".

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
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

const TIMELINE = [{
  seq: 7, event_type: "entry_posted", event_description: "An entry was posted.",
  client_id: "c1", actor: "u1", on_behalf_of: null, via_wake_kind: null,
  created_at: "2026-09-04T01:12:00Z",
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
    if (url.includes("/rpc/list_firm_timeline")) return jsonResponse(TIMELINE);
    throw new Error(`unexpected fetch: ${url}`);
  };
}

async function mount() {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, { locale: "en", messages, children: createElement(FirmHomeBoard) }),
  );
  for (let i = 0; i < 6; i++) await h.settle();
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
      assert.match(h.text(), /A firm-wide close status per client is not built/);
      assert.match(h.text(), /Statutory deadlines are not recorded yet/);
      // Pinned so a later lane cannot quietly replace the note with a number.
      assert.doesNotMatch(h.text(), /gates met|close ready|0 of 7/i);
    } finally { await h.unmount(); }
  });
});

test("Firm Home: an ABSENT firm timeline renders the honest not-deployed note, never an error and never a fake feed", async () => {
  await withMockedEnv(
    wire({ "/rpc/list_firm_timeline": () => jsonResponse({ code: "PGRST202", message: "could not find function" }, 404) }),
    async () => {
      const h = await mount();
      try {
        assert.match(h.text(), /The firm activity timeline is not available yet/);
        assert.doesNotMatch(h.text(), /Something went wrong/, "an absent read is not a failure");
        assert.doesNotMatch(h.text(), /No firm activity recorded yet/, "and it is not an honest-empty claim either");
      } finally { await h.unmount(); }
    },
  );
});

test("Firm Home: a DEPLOYED timeline renders the DB's own sentence, day-grouped — and a 403 renders as a failure, not as 'not built'", async () => {
  await withMockedEnv(wire(), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /An entry was posted\./, "event_description is the DB's own sentence, printed verbatim");
      assert.match(h.text(), /2026-09-04/, "the day header is the business-timezone calendar day");
    } finally { await h.unmount(); }
  });
  await withMockedEnv(
    wire({ "/rpc/list_firm_timeline": () => jsonResponse({ message: "forbidden" }, 403) }),
    async () => {
      const h = await mount();
      try {
        assert.match(h.text(), /can't read this yet/, "a grant failure is a real answer about the caller");
        assert.doesNotMatch(h.text(), /timeline is not available yet/);
      } finally { await h.unmount(); }
    },
  );
});

test("Firm Home: ONE failed read does not blank the others — a dead client register leaves the queue and the timeline standing", async () => {
  await withMockedEnv(
    wire({ "/rest/v1/clients": () => jsonResponse({ message: "boom" }, 500) }),
    async () => {
      const h = await mount();
      try {
        assert.match(h.text(), /Needs you: 3/, "the queue section still renders its real numbers");
        assert.match(h.text(), /An entry was posted\./, "and so does the timeline");
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
