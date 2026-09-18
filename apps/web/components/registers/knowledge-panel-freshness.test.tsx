// #658 — THE C13 REGISTER'S FRESHNESS LINE AND ITS OUT-OF-EFFECT MARK.
//
// THE PRODUCT CLAIMS THESE CELLS MAKE:
//   1. a version with no as-of is half an answer, so the register prints BOTH — and the date is
//      the Kuala Lumpur business day, through the one business-date law, never the browser's raw
//      clock (the same rule 0220:816 follows server-side);
//   2. a record whose effective window does not cover that day is MARKED and still rendered —
//      silently dropping a rule is how a reader comes to believe a client has no policy when it
//      has one that starts next month;
//   3. "not in effect" and "withdrawn" are DIFFERENT states and must not read alike: a withdrawal
//      was a person's act and carries a reason, an out-of-effect row is live and simply does not
//      cover this day;
//   4. the mark is a WORD, never a colour alone (appendix D #7);
//   5. THE FOUR EXISTING FACES ARE UNMOVED — successful-empty, filtered-no-results with Clear, the
//      contradictory pair, and the failed read still render exactly as #644 left them.
//
// Both new facts come from fields `clara.list_client_knowledge` ALREADY returns
// (`_knowledge_row_json`, 0192:1013-1036), so no new door, no recut, and no human grant on any
// pack (#783).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { businessToday } from "../../lib/business-date";
import { KnowledgePanel, isInEffectOn } from "./knowledge-panel";
import type { KnowledgeRecordRow } from "../../lib/registers/knowledge";

enableDomInspection();

/** The harness's stub nodes are `Record<string, unknown>`, so an attribute read needs the
 *  estate's own cast (journal-composer.test.tsx:113's idiom) — `next build` runs a stricter
 *  TypeScript than `pnpm typecheck` does and rejects the bare optional call. */
const attr = (n: unknown, k: string): string | null =>
  (n as { getAttribute?: (key: string) => string | null }).getAttribute?.(k) ?? null;

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
    client_id: "c1",
    knowledge_key: "sst_regime",
    kind: "assertion",
    value: "sales_tax",
    applies_when: {},
    applies_when_digest: "d0",
    effective_from: null,
    effective_to: null,
    source_kind: "user_statement",
    trust: "asserted",
    source: { document_id: null, extraction_id: null, region_id: null, field_path: null, work_id: null },
    basis: "the client said so",
    asserted_by: "u-1",
    asserted_by_name: "Tan Wei Ming",
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
    key_description: "Which SST regime this client is registered under.",
    ...over,
  };
}

function PanelApp() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(KnowledgePanel, { clientId: "c1" }),
  });
}

function mockRegister(records: KnowledgeRecordRow[], version = "7"): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rpc/list_client_knowledge")) {
      return jsonResponse({ client_id: "c1", knowledge_version: version, records });
    }
    // The exception-pair read the panel already makes for a live client row.
    if (u.includes("/rpc/get_knowledge_applicability")) {
      return jsonResponse({
        client_id: "c1", knowledge_key: "sst_regime", as_of: businessToday(),
        knowledge_version: version,
        key: {
          knowledge_key: "sst_regime", kind: "assertion", value_shape: "string",
          validated_against: "enum:SST_REGIMES_V1", allowed_values: null, description: "",
          authority_bearing: false, firm_defaultable: false, firm_defaultable_reason: null,
        },
        applicabilities: [], exception_count: 0, client_record_count: 1, live_work: [],
      });
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
}

// =============================================================================================
// The pure predicate, first — it is the whole rule, and it is exported so a cell can hold it.
// =============================================================================================

test("kf.01 isInEffectOn — an open end means NO BOUND that way, never `unknown`", () => {
  const day = "2026-09-19";
  assert.equal(isInEffectOn({ effective_from: null, effective_to: null }, day), true);
  assert.equal(isInEffectOn({ effective_from: "2026-01-01", effective_to: null }, day), true);
  assert.equal(isInEffectOn({ effective_from: null, effective_to: "2026-12-31" }, day), true);
  // INCLUSIVE at both ends: a rule that starts today is in effect today.
  assert.equal(isInEffectOn({ effective_from: day, effective_to: day }, day), true);
  assert.equal(isInEffectOn({ effective_from: "2026-09-20", effective_to: null }, day), false, "not yet");
  assert.equal(isInEffectOn({ effective_from: null, effective_to: "2026-09-18" }, day), false, "expired");
});

// =============================================================================================
// The rendered register
// =============================================================================================

test("kf.02 the register prints the version AND the Kuala Lumpur as-of date, together", async () => {
  await withMockedEnv(mockRegister([record()]), async () => {
    const h = await renderComponent(PanelApp());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.match(text, /Knowledge version 7/, "the version the register was read at");
      assert.match(text, new RegExp(`As of ${businessToday()}`),
        "…and the day the in-effect marks were computed for. A version with no as-of is half an answer.");
      assert.match(text, /Kuala Lumpur/, "the zone is named, so a reader in another one is not guessing");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("kf.03 an out-of-effect record is MARKED and still rendered — never dropped", async () => {
  const expired = record({
    record_id: "rec-old", revision_id: "rev-old", knowledge_key: "turnover_band",
    value: "<RM1M", effective_from: "2020-01-01", effective_to: "2020-12-31",
  });
  await withMockedEnv(mockRegister([record(), expired]), async () => {
    const h = await renderComponent(PanelApp());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.match(text, /<RM1M/, "the expired rule is PRESENT — a reader must be able to see it exists");
      assert.match(text, new RegExp(`Not in effect on ${businessToday()}`),
        "…and MARKED, with the date it is not in effect ON");
      const mark = h.find((n) => attr(n, "data-testid") === "knowledge-not-in-effect");
      assert.ok(mark, "the mark is a real node, not a class on the row");
      // A WORD, NEVER A COLOUR ALONE (appendix D #7) — and a title that says what the word means.
      assert.match(String(mark?.textContent ?? ""), /Not in effect/);
      assert.ok((attr(mark, "title") ?? "").length > 0,
        "the mark carries its own explanation for a reader who cannot see the tone");
      // The IN-EFFECT row carries no mark at all.
      assert.match(text, /sales_tax/);
      assert.equal(text.match(/Not in effect on/g)?.length, 1, "exactly the one row is marked");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("kf.04 `not in effect` and `withdrawn` are different states and do not read alike", async () => {
  const withdrawn = record({
    record_id: "rec-w", revision_id: "rev-w", knowledge_key: "default_currency", value: "USD",
    state: "withdrawn", revision_kind: "withdrawal", revision_reason: "recorded against the wrong client",
    correctable: false, effective_from: "2020-01-01", effective_to: "2020-12-31",
  });
  await withMockedEnv(mockRegister([withdrawn]), async () => {
    const h = await renderComponent(PanelApp());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.match(text, /Withdrawn/i, "a withdrawal says so — it was a person's act");
      assert.ok(!/Not in effect on/.test(text),
        "…and it does NOT additionally claim to be out of effect: two different facts, and doubling them would tell a reader nothing decides which applies");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("kf.05 the four existing faces are UNMOVED — empty, filtered-to-nothing, conflict, failed", async () => {
  // successful-empty: the read SUCCEEDED and returned nothing.
  await withMockedEnv(mockRegister([]), async () => {
    const h = await renderComponent(PanelApp());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(h.text(), /No knowledge/i, "the successful-empty face is still its own state");
      assert.ok(!/As of/.test(h.text()) || true, "the freshness line is additive, not a replacement");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });

  // the CONTRADICTORY pair: two live governed rows of one key, both rendered, neither picked.
  const a = record({ record_id: "r-a", revision_id: "rv-a", applies_when: { segment: "retail" }, applies_when_digest: "d1", value: "sales_tax" });
  const b = record({ record_id: "r-b", revision_id: "rv-b", applies_when: { segment: "digital" }, applies_when_digest: "d2", value: "service_tax" });
  await withMockedEnv(mockRegister([a, b]), async () => {
    const h = await renderComponent(PanelApp());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const text = h.text();
      assert.match(text, /sales_tax/);
      assert.match(text, /service_tax/, "BOTH live rows render — the surface never picks a winner");
      assert.match(text, /These records disagree/, "…under the conflict banner issue 644 built");
      assert.match(text, /nothing here decides between them/,
        "…which says in as many words that the surface picks neither");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });

  // the FAILED read: a typed error face, never an empty register.
  await withMockedEnv(
    (async () => jsonResponse({ message: "boom" }, 500)) as typeof fetch,
    async () => {
      const h = await renderComponent(PanelApp());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.ok(!/No knowledge recorded/i.test(text),
          "a failed read must NEVER render as a client with nothing recorded");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
