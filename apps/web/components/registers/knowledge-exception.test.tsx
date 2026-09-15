// #654 — THE FIRM-RULE / CLIENT-EXCEPTION PAIR on the client register (C13).
//
// THE DEFECT THESE CELLS EXIST TO PREVENT is one pixel wide and opposite in
// meaning: `knowledge-panel.tsx`'s CONFLICT banner means "two live client rows of
// one key and NOTHING decides between them"; the pair means "the database HAS
// decided, per applicability, and here is the firm rule this client overrides".
// Rendering the second as the first would tell a preparer that a settled fact is
// unsettled — the failure #644's own fix round had to repair for the legacy row.
//
// What is REAL here: `KnowledgeExceptionPair`, `KnowledgePanel`, the shared
// presentation and `loadKnowledgeApplicability`. The wire is fake.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { KnowledgePanel } from "./knowledge-panel";
import { overriddenEntries } from "./knowledge-exception";
import type {
  KnowledgeApplicabilityEntry,
  KnowledgeRecordRow,
} from "../../lib/registers/knowledge";

enableDomInspection();

const CLIENT = "11111111-1111-4111-8111-111111111111";

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

function record(over: Partial<KnowledgeRecordRow> = {}): KnowledgeRecordRow {
  return {
    record_id: "rec-1",
    revision_id: "rev-1",
    revision_n: 1,
    scope_kind: "client",
    client_id: CLIENT,
    knowledge_key: "default_currency",
    kind: "assertion",
    value: "USD",
    applies_when: {},
    applies_when_digest: "d0",
    effective_from: null,
    effective_to: null,
    source_kind: "user_statement",
    trust: "asserted",
    source: { document_id: null, extraction_id: null, region_id: null, field_path: null, work_id: null },
    basis: "the client invoices in dollars",
    asserted_by: "u-1",
    asserted_by_name: "Aisyah Rahman",
    recorded_via: "human_ui",
    recorded_at: "2026-09-12T02:00:00Z",
    knowledge_version: "7",
    revision_kind: "capture",
    revision_reason: null,
    supersedes_id: null,
    superseded_by: null,
    superseded_at: null,
    state: "live",
    editable: true,
    correctable: true,
    key_description: "The default presentation currency.",
    ...over,
  };
}

const firmRule = record({
  record_id: "frec-1", revision_id: "frev-1", scope_kind: "firm", client_id: null,
  value: "MYR", basis: "the firm presents in ringgit unless a client says otherwise",
  asserted_by: "u-admin", asserted_by_name: "Nurul Hayati",
});

function applicability(entries: KnowledgeApplicabilityEntry[], exceptionCount = 1) {
  return {
    client_id: CLIENT,
    knowledge_key: "default_currency",
    as_of: "2026-09-16",
    knowledge_version: "7",
    key: {
      knowledge_key: "default_currency",
      kind: "assertion",
      value_shape: "string",
      validated_against: "enum:CURRENCIES_V1",
      allowed_values: ["MYR", "USD"],
      description: "The default presentation currency.",
      authority_bearing: false,
      firm_defaultable: true,
      firm_defaultable_reason: "The presentation currency the firm uses unless a client says otherwise.",
    },
    applicabilities: entries,
    exception_count: exceptionCount,
    live_work: [],
  };
}

const OVERRIDDEN: KnowledgeApplicabilityEntry = {
  applies_when: {},
  applies_when_digest: "d0",
  firm_rule: firmRule,
  client_exception: record(),
  in_force: "client_exception",
  reason: "client_exception_shadows_firm_default",
  in_effect_today: true,
};

function PanelApp() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(KnowledgePanel, { clientId: CLIENT }),
  });
}

async function mountPanel(
  rows: KnowledgeRecordRow[],
  applicabilityBody: unknown,
  assertions: (h: Awaited<ReturnType<typeof renderComponent>>) => Promise<void>,
  applicabilityStatus = 200,
) {
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_client_knowledge")) {
        return jsonResponse({ client_id: CLIENT, knowledge_version: "9", records: rows });
      }
      if (u.includes("/rpc/get_knowledge_applicability")) {
        return jsonResponse(applicabilityBody, applicabilityStatus);
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(PanelApp());
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        await assertions(h);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
}

// =============================================================================
// 0 — the pure seam
// =============================================================================

test("ke.00 only an entry where a FIRM RULE EXISTS and the client's own row wins is a pair", () => {
  const firmWins: KnowledgeApplicabilityEntry = {
    ...OVERRIDDEN, applies_when_digest: "d1", client_exception: null,
    in_force: "firm_default", reason: "firm_default_applies",
  };
  const clientAlone: KnowledgeApplicabilityEntry = {
    ...OVERRIDDEN, applies_when_digest: "d2", firm_rule: null,
    in_force: "client_exception", reason: "client_record_only",
  };
  const nothing: KnowledgeApplicabilityEntry = {
    ...OVERRIDDEN, applies_when_digest: "d3", firm_rule: null, client_exception: null,
    in_force: "none", reason: "no_live_record", in_effect_today: null,
  };
  assert.deepEqual(
    overriddenEntries([OVERRIDDEN, firmWins, clientAlone, nothing]).map((e) => e.applies_when_digest),
    ["d0"],
    "a firm rule that is WINNING is already rendered by the register itself; a client row with nothing to override is not an exception");
});

// =============================================================================
// 1 — the pair, and what it must NOT be
// =============================================================================

test("ke.01 a client row overriding a firm rule renders the firm value, the override sentence and a route — and NO conflict face", async () => {
  await mountPanel([record()], applicability([OVERRIDDEN]), async (h) => {
    const text = h.text();
    assert.match(text, /USD/, "the client's own value is still the register's answer");
    assert.match(text, /Firm rule: MYR/, "the firm rule it overrides is named, with its value");
    assert.match(text, /Overridden by this client/,
      "the sentence that makes it a PAIR rather than a second row");
    assert.match(text, /Always applies/, "the conditions the pair is about are stated");
    // THE LINE THAT MUST NOT MOVE: a decided pair is not an undecided conflict.
    assert.doesNotMatch(text, /Conflicting/i,
      "an exception pair is DECIDED; the conflict face means nothing decides, and conflating them was the defect");
    const link = h.find(
      (n) => n.tagName === "A"
        && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "")
          === "/settings/knowledge",
    );
    assert.ok(link, "the pair routes to the firm register that holds the rule");
  });
});

test("ke.02 where the FIRM rule is what applies, no pair is drawn — the register already shows that row", async () => {
  await mountPanel(
    [record({ scope_kind: "firm", client_id: null, record_id: "frec-1", revision_id: "frev-1", value: "MYR" })],
    applicability([{
      ...OVERRIDDEN, client_exception: null, in_force: "firm_default", reason: "firm_default_applies",
    }], 0),
    async (h) => {
      const text = h.text();
      assert.match(text, /MYR/);
      assert.doesNotMatch(text, /Overridden by this client/,
        "nothing is being overridden, so the pair must not be drawn");
      assert.doesNotMatch(text, /Firm rule for this key/);
    },
  );
});

test("ke.03 a firm rule that cannot be read says so, and leaves the client's own record standing", async () => {
  await mountPanel(
    [record()],
    { message: "permission denied for function get_knowledge_applicability" },
    async (h) => {
      const text = h.text();
      assert.match(text, /USD/, "the client's own record is unaffected by the second read failing");
      assert.match(text, /could not be read just now/,
        "a named-but-unreadable firm rule is a fact worth telling, not silence");
      assert.doesNotMatch(text, /Overridden by this client/,
        "a failed read must never be rendered as an override that does not exist");
    },
    403,
  );
});

test("ke.04 the pair is a per-APPLICABILITY answer: a narrow client row overrides only the firm row carrying that condition", async () => {
  const narrow: KnowledgeApplicabilityEntry = {
    applies_when: { segment: "digital" },
    applies_when_digest: "d-digital",
    firm_rule: { ...firmRule, applies_when: { segment: "digital" }, applies_when_digest: "d-digital", value: "MYR" },
    client_exception: record({ applies_when: { segment: "digital" }, applies_when_digest: "d-digital", value: "USD" }),
    in_force: "client_exception",
    reason: "client_exception_shadows_firm_default",
    in_effect_today: true,
  };
  const unconditionalFirmWins: KnowledgeApplicabilityEntry = {
    applies_when: {},
    applies_when_digest: "d0",
    firm_rule: firmRule,
    client_exception: null,
    in_force: "firm_default",
    reason: "firm_default_applies",
    in_effect_today: true,
  };
  await mountPanel(
    [record({ applies_when: { segment: "digital" }, applies_when_digest: "d-digital" })],
    applicability([narrow, unconditionalFirmWins]),
    async (h) => {
      const text = h.text();
      assert.match(text, /Conditions: segment = digital/,
        "the pair names the condition it is about, not the key alone");
      const overrides = text.match(/Overridden by this client/g) ?? [];
      assert.equal(overrides.length, 1,
        "exactly ONE applicability is overridden; the unconditional firm rule still stands and is not called overridden");
    },
  );
});
