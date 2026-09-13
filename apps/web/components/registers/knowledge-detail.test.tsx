// #644 — C13's Knowledge DETAIL, driven through the real components against a
// mocked PostgREST. What is REAL here: `KnowledgeDetail`, `KnowledgePanel`, the
// shared badge/applicability/source presentation, `lib/registers/knowledge.ts`'s
// door wrappers, `useAsyncRead`'s hydrate-never-trust reload and the door
// dialog's single-fire confirm. What is FAKE is the wire.
//
// THESE CELLS ARE THE PRODUCT CLAIMS #644 MAKES ABOUT THIS SURFACE:
//   1. a corrected record shows its CURRENT value and a history that names the
//      correcting actor and their reason — the revision is visible as a
//      revision, not as a value that silently changed;
//   2. an `inferred` record is badged UNVERIFIED, with the meaning spelled out,
//      so a model's own hypothesis can never read as a confirmed fact;
//   3. Withdraw actually reaches `POST /rest/v1/rpc/withdraw_knowledge` with the
//      typed reason — the control is the door, not a local state flip;
//   4. two LIVE records of one key render BOTH, under a conflict alert; the
//      surface never picks a winner;
//   5. a LEGACY `client_facts` row beside a knowledge record of the same key is
//      never hidden, says it is the one in force, and is NOT called a conflict —
//      because something DOES decide between those two, and it is the legacy row.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
// REQUIRED, not decorative: this surface renders `next/link` (whose prefetch
// hook reaches for `self`) and Base UI's Select/Dialog (whose focus trap walks
// real `Element`s). `enableDomInspection()` is the harness's own polyfill for
// exactly those, and without it every render here dies as "self is not defined"
// — a crash in the harness, not a finding about the component.
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { KnowledgeDetail, parseKnowledgeValue } from "./knowledge-detail";
import { KnowledgePanel } from "./knowledge-panel";
import type { KnowledgeRecordRow } from "../../lib/registers/knowledge";

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

function record(over: Partial<KnowledgeRecordRow> = {}): KnowledgeRecordRow {
  return {
    record_id: "rec-1",
    revision_id: "rev-2",
    revision_n: 2,
    scope_kind: "client",
    client_id: "c1",
    knowledge_key: "msic",
    kind: "assertion",
    value: "47211",
    applies_when: {},
    applies_when_digest: "d0",
    effective_from: null,
    effective_to: null,
    source_kind: "user_statement",
    trust: "asserted",
    source: { document_id: null, extraction_id: null, region_id: null, field_path: null, work_id: null },
    basis: "the client corrected the code by email",
    asserted_by: "u-2",
    asserted_by_name: "Aisyah Rahman",
    recorded_via: "human_ui",
    recorded_at: "2026-09-12T02:00:00Z",
    knowledge_version: "7",
    revision_kind: "correction",
    revision_reason: "the client corrected the code by email on 12 Sep",
    supersedes_id: "rev-1",
    superseded_by: null,
    superseded_at: null,
    state: "live",
    editable: true,
    correctable: true,
    key_description: "Five-digit MSIC industry code.",
    ...over,
  };
}

const KEY_DEF = {
  knowledge_key: "msic",
  kind: "assertion" as const,
  value_shape: "string",
  validated_against: "format_only",
  allowed_values: null,
  description: "Five-digit MSIC industry code.",
  authority_bearing: false,
};

function DetailApp() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(KnowledgeDetail, { clientId: "c1", recordId: "rec-1" }),
  });
}

function PanelApp() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(KnowledgePanel, { clientId: "c1" }),
  });
}

// =============================================================================
// 1 — the revision timeline
// =============================================================================

test("kd.01 a corrected record renders its CURRENT value and a history naming the correcting actor and reason", async () => {
  const live = record();
  const first = record({
    revision_id: "rev-1", revision_n: 1, value: "46900", revision_kind: "capture",
    revision_reason: null, supersedes_id: null, superseded_by: "rev-2",
    superseded_at: "2026-09-12T02:00:00Z", state: "superseded",
    asserted_by: "u-1", asserted_by_name: "Tan Wei Ming",
    basis: "the SSM profile the client sent",
  });
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/get_knowledge_record")) {
        return jsonResponse({ record: live, key: KEY_DEF, revision_count: 2 });
      }
      if (u.includes("/rpc/get_knowledge_history")) {
        return jsonResponse({ record_id: "rec-1", revisions: [first, live] });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(DetailApp());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /47211/, "the current value must be on screen");
        assert.match(text, /Revision 1/, "the history must show the superseded revision");
        assert.match(text, /Revision 2/);
        assert.match(text, /Tan Wei Ming/, "the ORIGINAL actor must survive the correction");
        assert.match(text, /Aisyah Rahman/, "the CORRECTING actor must be named");
        assert.match(text, /the client corrected the code by email on 12 Sep/,
          "the correction's own reason must be readable, not merely stored");
        assert.match(text, /46900/, "the superseded value stays readable — a revision, not an edit");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// =============================================================================
// 2 — trust
// =============================================================================

test("kd.02 an INFERRED record is badged unverified and says what that means", async () => {
  const inferred = record({
    knowledge_key: "turnover_band", value: "RM1M-5M", kind: "assertion",
    source_kind: "model_inference", trust: "inferred", revision_kind: "capture",
    revision_n: 1, revision_reason: null, supersedes_id: null, revision_id: "rev-i",
  });
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/get_knowledge_record")) {
        return jsonResponse({ record: inferred, key: { ...KEY_DEF, knowledge_key: "turnover_band" }, revision_count: 1 });
      }
      if (u.includes("/rpc/get_knowledge_history")) {
        return jsonResponse({ record_id: "rec-1", revisions: [inferred] });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(DetailApp());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Unverified inference/, "an inference must be badged as one");
        assert.doesNotMatch(text, /Stated by a user/, "…and must not borrow an asserted source's words");
        // The meaning rides the badge's title attribute — colour is never the only cue.
        const badge = h.find((n) => {
          const get = (n as { getAttribute?: (k: string) => string | null }).getAttribute;
          const title = typeof get === "function" ? get.call(n, "title") : (n as { title?: unknown }).title;
          return typeof title === "string" && title.includes("advisory");
        });
        assert.ok(badge, "the trust badge must carry its meaning in a title, not colour alone");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// =============================================================================
// 3 — Withdraw is the door
// =============================================================================

test("kd.03 Withdraw issues POST /rest/v1/rpc/withdraw_knowledge carrying the typed reason and a fresh op_key", async () => {
  const live = record();
  const posts: { url: string; body: unknown }[] = [];
  await withMockedEnv(
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/rpc/withdraw_knowledge")) {
        posts.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
        return jsonResponse({ status: "withdrawn", record_id: "rec-1", revision_n: 3 });
      }
      if (u.includes("/rpc/get_knowledge_record")) {
        return jsonResponse({ record: live, key: KEY_DEF, revision_count: 2 });
      }
      if (u.includes("/rpc/get_knowledge_history")) {
        return jsonResponse({ record_id: "rec-1", revisions: [live] });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(DetailApp());
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Withdraw");
        assert.ok(trigger, "the Withdraw trigger must render for an editable live record");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        // The dialog PORTALS out of the harness container, so its controls are
        // unreachable by delegated dispatch — `setFieldValue`/`clickButton`
        // (hookHarness.ts, and see clickButton's own header for the measurement)
        // are the harness's answer, and they are what the adjustments lane uses.
        const reasonBox = findIn(body as never, (n) => (n as { tagName?: string }).tagName === "TEXTAREA");
        assert.ok(reasonBox, "the withdrawal reason field must be revealed by the dialog");
        await h.act(() => { setFieldValue(reasonBox as never, "the client ceased that trade on 30 Jun"); });
        for (let i = 0; i < 3; i++) await h.settle();

        const confirm = findIn(body as never, (n) =>
          (n as { tagName?: string }).tagName === "BUTTON"
          && textOf(n as never).trim() === "Withdraw record");
        assert.ok(confirm, "the dialog's confirm control must render");
        assert.equal((confirm as unknown as { disabled: boolean }).disabled, false,
          "the reason is filled — Confirm must be enabled");
        await h.act(() => { void clickButton(confirm as never); });
        for (let i = 0; i < 8; i++) await h.settle();

        assert.equal(posts.length, 1, `expected exactly one withdraw_knowledge POST, saw ${posts.length}`);
        const sent = posts[0]!.body as Record<string, unknown>;
        assert.equal(sent.p_record, "rec-1");
        assert.equal(sent.p_reason, "the client ceased that trade on 30 Jun");
        assert.equal(typeof sent.p_op_key, "string");
        assert.ok(String(sent.p_op_key).length >= 8, "a real op_key must be minted per attempt");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// =============================================================================
// 4 — the conflict face (the LIST)
// =============================================================================

test("kd.04 two LIVE records of one key render BOTH under a conflict alert; nothing picks a winner", async () => {
  const a = record({
    record_id: "rec-a", revision_id: "rev-a", knowledge_key: "turnover_band", value: "RM1M-5M",
    revision_kind: "capture", revision_n: 1, revision_reason: null, supersedes_id: null,
    applies_when: {}, applies_when_digest: "d-empty",
  });
  const b = record({
    record_id: "rec-b", revision_id: "rev-b", knowledge_key: "turnover_band", value: "RM5M-25M",
    revision_kind: "capture", revision_n: 1, revision_reason: null, supersedes_id: null,
    applies_when: { segment: "digital" }, applies_when_digest: "d-digital",
  });
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_client_knowledge")) {
        return jsonResponse({ client_id: "c1", knowledge_version: "9", records: [a, b] });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(PanelApp());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /These records disagree/, "the conflict face must be named, not implied");
        assert.match(text, /RM1M-5M/, "the first competing record must stay on screen");
        assert.match(text, /RM5M-25M/, "…and so must the second");
        assert.match(text, /segment = digital/,
          "the applicability that distinguishes them must be readable — that is what the reader decides with");
        // …and the conflict is announced, because a contradiction is news.
        const alert = h.find((n) => String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("role") ?? "") === "alert");
        assert.ok(alert, "the conflict must render in a live region, not as quiet prose");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// =============================================================================
// 5 — the LEGACY row beside a governed record of the same key (review round, B2)
// =============================================================================

test("kd.07 a LEGACY fact is never hidden by a knowledge record of the same key, and says which one is in force", async () => {
  // 0192 adds a register BESIDE clara.client_facts and does not dual-write, so the value the rest
  // of Clara acts on for a carried key is still the LEGACY one (get_context_pack 0055:765, the
  // closing-stock gate 0056:1283, the name-only guard 0062:226, the bank-registry ledger
  // 0121:4797). Shadowing it would have this register report the new value while the books went
  // on being prepared from the old one.
  const legacy = record({
    record_id: "legacy-1", revision_id: "legacy-1", revision_n: 1, knowledge_key: "entity_type",
    value: "sdn_bhd", source_kind: "legacy_client_fact", basis: "the SSM certificate",
    revision_kind: "capture", revision_reason: null, supersedes_id: null,
    editable: false, correctable: false, authoritative: true,
    key_description: "The client's legal form.",
  });
  const governed = record({
    record_id: "rec-e", revision_id: "rev-e", revision_n: 1, knowledge_key: "entity_type",
    value: "llp", revision_kind: "capture", revision_reason: null, supersedes_id: null,
    basis: "the client converted to an LLP on 1 Jul",
    key_description: "The client's legal form.",
  });
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_client_knowledge")) {
        return jsonResponse({ client_id: "c1", knowledge_version: "12", records: [governed, legacy] });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(PanelApp());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /sdn_bhd/, "the legacy value the estate still reads must stay on screen");
        assert.match(text, /llp/, "…beside the newer governed record");
        assert.match(text, /This client fact is the one in force/,
          "the register must say which of the two Clara actually acts on");
        // …and it is NOT the undecided conflict face: something DOES decide between these two.
        assert.doesNotMatch(text, /These records disagree/,
          "a legacy row beside its knowledge record is not a contradiction with no winner");
        // The legacy row still offers no control the database has no door for.
        assert.match(text, /Recorded before the Knowledge register existed/,
          "a legacy row gets the no-door note, never an Open record link");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("kd.05 a successful EMPTY read is an empty state, and a FAILED read is an alert — never the same face", async () => {
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_client_knowledge")) {
        return jsonResponse({ client_id: "c1", knowledge_version: 0, records: [] });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(PanelApp());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /No knowledge has been recorded for this client yet/);
        assert.doesNotMatch(h.text(), /can't read this yet|Something went wrong/);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );

  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_client_knowledge")) {
        return jsonResponse({ message: "permission denied for function list_client_knowledge" }, 403);
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(PanelApp());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /can't read this yet/, "a 403 is a permission face, not an empty one");
        assert.doesNotMatch(h.text(), /No knowledge has been recorded/);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// =============================================================================
// 5 — the value field never coerces
// =============================================================================

test("kd.06 the correction field parses to the CATALOG's shape and refuses rather than coercing", () => {
  assert.deepEqual(parseKnowledgeValue("string", " 47211 "), { ok: true, value: "47211" });
  assert.deepEqual(parseKnowledgeValue("number", "6"), { ok: true, value: 6 });
  assert.deepEqual(parseKnowledgeValue("number", "six"), { ok: false, reason: "number" });
  // The defect this guards: Number("") === 0, so an empty field would have
  // become a perfectly valid month zero.
  assert.deepEqual(parseKnowledgeValue("number", "  "), { ok: false, reason: "empty" });
  assert.deepEqual(parseKnowledgeValue("boolean", "true"), { ok: true, value: true });
  assert.deepEqual(parseKnowledgeValue("boolean", "yes"), { ok: false, reason: "boolean" });
  assert.deepEqual(parseKnowledgeValue("object", '{"seed":"manual"}'), { ok: true, value: { seed: "manual" } });
  assert.deepEqual(parseKnowledgeValue("object", '"manual"'), { ok: false, reason: "json" });
  assert.deepEqual(parseKnowledgeValue("object", "{seed}"), { ok: false, reason: "json" });
});

// ---------------------------------------------------------------------------
// Local DOM helpers — the dialog content portals OUT of the harness container,
// so these walk `document.body` and dispatch at the container's own delegated
// listener (hookHarness.ts's mkNode header explains why that is the boundary).
// ---------------------------------------------------------------------------
type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

