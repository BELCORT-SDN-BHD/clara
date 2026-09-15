// #649 AC2(b) — the answers a person gave during onboarding become visible on the page they land
// on afterwards.
//
// WHAT WAS MISSING. `clara.promote_plan_answers_to_knowledge` (0192:1563) has carried a committed
// interview's answers into `clara.knowledge_records` since #644 — `fye` among the ten keys it maps
// (0192:305) — and the client-Home identity band read `client_facts` and `client_fact_keys` ALONE
// (`client-identity-band.tsx:63-64`). So the promotion landed and nothing on Home showed it.
//
// WHAT THESE CELLS PIN. A promoted record renders BESIDE the legacy chips rather than instead of
// them; the legacy rows `list_client_knowledge` unions in are not rendered twice; a record the
// catalog cannot describe falls back to its own raw key (the same fallback the legacy chips
// already take, kept deliberately); a non-scalar value is COUNTED and pointed at the register
// rather than stringified into "[object Object]"; and a FAILED knowledge read degrades only
// itself — the name, status, start date and the legacy chips all stay.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { checkAccessibility } from "../../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../../lib/session-accessor";
import messages from "../../../messages/en.json";
import { ClientIdentityBand, promotedKnowledge } from "./client-identity-band";

enableDomInspection();

const CLIENT_ID = "c6490001-0000-4000-8000-000000000649";
const CLIENT = {
  id: CLIENT_ID, name: "Rome Public Advisory Sdn Bhd", status: "active",
  created_at: "2026-03-12T00:00:00Z",
};

const LEGACY_FACT = {
  id: "f1", client_id: CLIENT_ID, fact_key: "entity_type", fact_value: "Sdn Bhd",
  basis: "the incorporation certificate", basis_kind: "document", source_document_id: null,
  recorded_by: "u1", recorded_at: "2026-03-12T00:00:00Z", superseded_by: null, superseded_at: null,
};
const FACT_KEYS = [{ fact_key: "entity_type", validated_against: "list", allowed_values: null, description: "Entity type" }];

const knowledgeRow = (over: Record<string, unknown>) => ({
  record_id: "k1", revision_id: "r1", revision_n: 1, scope_kind: "client", client_id: CLIENT_ID,
  knowledge_key: "financial_year_end_month", kind: "assertion", value: 6, applies_when: {},
  applies_when_digest: null, effective_from: null, effective_to: null, source_kind: "onboarding_plan",
  trust: "asserted", source: {}, basis: "Committed onboarding plan", asserted_by: "u1",
  asserted_by_name: "Alice", recorded_via: "human_ui", recorded_at: "2026-09-02T00:00:00Z",
  knowledge_version: "12", revision_kind: "capture", revision_reason: null, supersedes_id: null,
  superseded_by: null, superseded_at: null, state: "live", editable: true, correctable: true,
  key_description: "Financial year-end month",
  ...over,
});

const FYE_RECORD = knowledgeRow({});
const LEGACY_UNIONED = knowledgeRow({
  record_id: "legacy-1", knowledge_key: "entity_type", value: "Sdn Bhd",
  source_kind: "legacy_client_fact", editable: false, correctable: false, authoritative: true,
  key_description: "Entity type",
});
const UNKNOWN_KEY = knowledgeRow({
  record_id: "k2", knowledge_key: "turnover_band", value: "RM1M-5M", key_description: null,
});
const STRUCTURED = knowledgeRow({
  record_id: "k3", knowledge_key: "reporting_framework",
  value: { framework_code: "MPERS" }, key_description: "Reporting framework",
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockEstate({ records, knowledgeFails = false }: { records: unknown[]; knowledgeFails?: boolean }) {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rpc/list_client_knowledge")) {
      if (knowledgeFails) return jsonResponse({ message: "boom" }, 500);
      return jsonResponse({ client_id: CLIENT_ID, knowledge_version: "12", records });
    }
    if (u.includes("/rest/v1/client_fact_keys")) return jsonResponse(FACT_KEYS);
    if (u.includes("/rest/v1/client_facts")) return jsonResponse([LEGACY_FACT]);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
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

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(ClientIdentityBand, { clientId: CLIENT_ID, client: CLIENT as never }),
  });
}

async function mount() {
  const h = await renderComponent(App());
  for (let i = 0; i < 8; i++) await h.settle();
  return h;
}

test("649 · promotedKnowledge keeps the governed rows and drops the legacy ones list_client_knowledge unions in", () => {
  const kept = promotedKnowledge([FYE_RECORD, LEGACY_UNIONED] as never);
  assert.deepEqual(kept.map((r) => r.record_id), ["k1"],
    "clara.client_facts is still the table the rest of the estate reads for its carried keys, and the band renders it once — through its own read");
  assert.deepEqual(
    promotedKnowledge([knowledgeRow({ record_id: "gone", state: "withdrawn" })] as never).map((r) => r.record_id),
    [],
    "a withdrawn record is not a fact this client holds",
  );
});

test("649 · AC2(b) — a promoted interview answer renders BESIDE the legacy client_facts chip", async () => {
  await withMockedEnv(mockEstate({ records: [FYE_RECORD, LEGACY_UNIONED] }), async () => {
    const h = await mount();
    try {
      const text = h.text();
      assert.match(text, /Confirmed knowledge/, "the promoted register has its own labelled group");
      assert.match(text, /Financial year-end month: 6/, "the fact the interview recorded is visible on client Home at last");
      assert.match(text, /asserted/, "…with the trust level the DOOR derived, never one this surface chose");
      assert.match(text, /Entity type: Sdn Bhd/, "the legacy chip is still there — two registers, both shown");
      const chips = text.match(/Entity type: Sdn Bhd/g) ?? [];
      assert.equal(chips.length, 1, "and it is shown ONCE: the unioned legacy row is not a second chip");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("649 · a record the catalog cannot describe falls back to its own raw key", async () => {
  await withMockedEnv(mockEstate({ records: [UNKNOWN_KEY] }), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /turnover_band: RM1M-5M/,
        "the raw key is honest; inventing a label for a key the catalog has not described is not");
    } finally {
      await h.unmount();
    }
  });
});

test("649 · a structured value is COUNTED and pointed at the register, never stringified", async () => {
  await withMockedEnv(mockEstate({ records: [STRUCTURED] }), async () => {
    const h = await mount();
    try {
      const text = h.text();
      assert.doesNotMatch(text, /\[object Object\]/, "the defect this whole rule exists to prevent");
      assert.match(text, /1 confirmed record\(s\) hold a structured value/);
    } finally {
      await h.unmount();
    }
  });
});

test("649 · a FAILED knowledge read degrades only itself — the name, status and legacy chips stay", async () => {
  await withMockedEnv(mockEstate({ records: [], knowledgeFails: true }), async () => {
    const h = await mount();
    try {
      const text = h.text();
      assert.match(text, /could not be read/, "a failed read SAYS so — it is never rendered as a client with nothing recorded");
      assert.match(text, /Rome Public Advisory Sdn Bhd/, "the heading comes from a different read and must survive");
      assert.match(text, /Entity type: Sdn Bhd/, "so must the legacy chips");
    } finally {
      await h.unmount();
    }
  });
});
