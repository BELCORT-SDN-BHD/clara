// #654 — the FIRM knowledge register (`/settings/knowledge`), driven through the
// real component against a mocked PostgREST. What is REAL: `KnowledgeFirmPanel`,
// the shared badge/applicability presentation it borrows from the client register,
// `lib/registers/knowledge.ts`'s `loadFirmKnowledge` wrapper and `useAsyncRead`.
// What is FAKE is the wire.
//
// THESE CELLS ARE THE PRODUCT CLAIMS #654 MAKES ABOUT THIS SURFACE:
//   1. the four faces come from four DIFFERENT facts — a successful empty read, a
//      filter that hid everything, a failed/denied read and a populated register —
//      and the filtered face keeps the filter and offers to clear it;
//   2. a rule NAMES ITS AUTHORITY: the promoter, the authority the act required,
//      the promoter's role NOW, and the reason they authored;
//   3. a promoter who has since been removed is said out loud, because the rule
//      they recorded still stands and that is exactly what a reviewer must know;
//   4. the register names the clients that hold an exception and links to each
//      one's own record — `PRD:123`'s human-review interim, made usable;
//   5. it names the LIVE Work citing the key, and states plainly that a change here
//      does not re-run anything by itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { renderComponent } from "../../test/hookHarness";
// REQUIRED, not decorative — this surface renders `next/link` (whose prefetch hook
// reaches for `self`) and Base UI's Select. See knowledge-detail.test.tsx's own note.
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { KnowledgeFirmPanel } from "./knowledge-firm-panel";
import type { FirmKnowledgeRow } from "../../lib/registers/knowledge";

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

function firmRow(over: Partial<FirmKnowledgeRow> = {}): FirmKnowledgeRow {
  return {
    record_id: "frec-1",
    revision_id: "frev-1",
    revision_n: 1,
    scope_kind: "firm",
    client_id: null,
    knowledge_key: "default_currency",
    kind: "assertion",
    value: "MYR",
    applies_when: {},
    applies_when_digest: "fd-empty",
    effective_from: null,
    effective_to: null,
    source_kind: "user_statement",
    trust: "asserted",
    source: { document_id: null, extraction_id: null, region_id: null, field_path: null, work_id: null },
    basis: "Partner meeting 2026-09-16: ringgit presentation is the firm's default",
    asserted_by: "u-admin",
    asserted_by_name: "Nurul Hayati",
    recorded_via: "human_ui",
    recorded_at: "2026-09-16T02:00:00Z",
    knowledge_version: "12",
    revision_kind: "capture",
    revision_reason: null,
    supersedes_id: null,
    superseded_by: null,
    superseded_at: null,
    state: "live",
    editable: true,
    correctable: true,
    key_description: "The default presentation currency.",
    authority: {
      promoter: "u-admin",
      promoter_name: "Nurul Hayati",
      recorded_via: "human_ui",
      recorded_at: "2026-09-16T02:00:00Z",
      reason: "Partner meeting 2026-09-16: ringgit presentation is the firm's default",
      required_role: "admin",
      promoter_role_now: "admin",
      promoter_active: true,
    },
    exception_count: 0,
    exceptions: [],
    live_work: [],
    firm_defaultable_reason: "The presentation currency the firm uses unless a client says otherwise.",
    in_effect_today: true,
    ...over,
  };
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(KnowledgeFirmPanel, {}),
  });
}

function envelope(records: FirmKnowledgeRow[]) {
  return { firm_id: "f1", as_of: "2026-09-16", knowledge_version: "12", records };
}

async function mount(impl: typeof fetch, assertions: (h: Awaited<ReturnType<typeof renderComponent>>) => Promise<void>) {
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      await assertions(h);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
}

const okFetch = (records: FirmKnowledgeRow[]) =>
  (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rpc/list_firm_knowledge")) return jsonResponse(envelope(records));
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

// =============================================================================
// 1 — the four faces
// =============================================================================

test("kf.01 a SUCCESSFUL EMPTY read is an empty state that says what to do, not an error", async () => {
  await mount(okFetch([]), async (h) => {
    const text = h.text();
    assert.match(text, /has not promoted any knowledge to a firm-wide default yet/,
      "a successful empty read must say the firm has recorded nothing, not that something failed");
    assert.doesNotMatch(text, /could not|couldn't|failed/i,
      "an empty read must never borrow a failure's words");
  });
});

test("kf.02 a DENIED read renders the forbidden face, never an empty one", async () => {
  await mount(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_firm_knowledge")) {
        return jsonResponse({ message: "permission denied for function list_firm_knowledge" }, 403);
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async (h) => {
      const text = h.text();
      assert.doesNotMatch(text, /has not promoted any knowledge/,
        "a refusal must not be rendered as 'nothing recorded' — they are different facts");
      const alert = h.find(
        (n) => String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("role") ?? "") === "alert",
      );
      assert.ok(alert, "a denied read renders an alert, not an empty state");
    },
  );
});

test("kf.03 the kind filter is a named control, and the filtered face is ABSENT while rules are on screen", async () => {
  await mount(okFetch([firmRow()]), async (h) => {
    // The filter's ACCESSIBLE NAME, not its rendered value: Base UI's Select
    // portals its listbox and renders its value through a slot the harness's stub
    // DOM does not fill, so naming the control is what is assertable here. The
    // filtered-to-nothing FACE itself is driven in a real browser by
    // e2e/knowledge-firm-walk.spec.ts, which is where a portalled listbox can
    // actually be opened — the same split knowledge-detail.test.tsx already makes.
    const trigger = h.find(
      (n) => n.tagName === "BUTTON"
        && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("aria-label") ?? "") === "Kind",
    );
    assert.ok(trigger, "the kind filter must render with its accessible name");
    assert.match(h.text(), /Kind/, "the filter is labelled in the visible text too");
    assert.doesNotMatch(h.text(), /No firm rule matches this filter/,
      "with a rule on screen and no filter applied, the filtered face must be absent");
    assert.doesNotMatch(h.text(), /has not promoted any knowledge/,
      "…and so must the successful-empty face");
  });
});

// =============================================================================
// 2 — authority
// =============================================================================

test("kf.04 a rule names its promoter, the authority the act required, and the reason they AUTHORED", async () => {
  await mount(okFetch([firmRow()]), async (h) => {
    const text = h.text();
    assert.match(text, /Nurul Hayati/, "the promoter must be named");
    assert.match(text, /Authority the act required/);
    assert.match(text, /admin/, "the floor the door verified must be legible");
    assert.match(text, /Partner meeting 2026-09-16/,
      "the AUTHORED reason is what the rule stands on, and it must be readable");
    assert.match(text, /MYR/, "the value itself must be on screen");
    assert.match(text, /Firm default/, "a firm-scope row carries the firm badge");
  });
});

test("kf.05 a promoter who is no longer an active member is SAID, because the rule still stands", async () => {
  await mount(
    okFetch([firmRow({
      authority: {
        ...firmRow().authority,
        promoter_role_now: null,
        promoter_active: false,
      },
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /no longer an active member/,
        "a revoked promoter is a fact about the rule a reviewer needs");
      assert.match(text, /No current membership/);
      assert.match(text, /MYR/, "…and the rule itself is still rendered, not hidden");
    },
  );
});

// =============================================================================
// 3 — the human-review affordance PRD:123 asks for in place of the engine
// =============================================================================

test("kf.06 the register names the clients holding an exception and links to each one's own record", async () => {
  await mount(
    okFetch([firmRow({
      exception_count: 2,
      exceptions: [
        { client_id: "11111111-1111-4111-8111-111111111111", client_name: "Alpha Trading", record_id: "rec-a", value: "USD", recorded_at: "2026-09-10T01:00:00Z" },
        { client_id: "22222222-2222-4222-8222-222222222222", client_name: "Beta Services", record_id: "rec-b", value: "SGD", recorded_at: "2026-09-11T01:00:00Z" },
      ],
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /2 clients hold an exception/);
      assert.match(text, /Alpha Trading/);
      assert.match(text, /Beta Services/);
      assert.match(text, /USD/);
      const link = h.find(
        (n) => n.tagName === "A"
          && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "")
            .includes("/clients/11111111-1111-4111-8111-111111111111/knowledge/rec-a"),
      );
      assert.ok(link, "each exception links to that client's OWN record, not to a firm-level copy");
    },
  );
});

test("kf.07 the register names the live Work citing the key and says a change here re-runs nothing by itself", async () => {
  await mount(
    okFetch([firmRow({
      live_work: [{
        work_id: "33333333-3333-4333-8333-333333333333",
        client_id: "11111111-1111-4111-8111-111111111111",
        purpose: "journal_entry",
        status: "awaiting_input",
      }],
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /does not re-run work by itself/,
        "the deferred re-evaluation engine is stated, never implied by absence");
      assert.match(text, /journal_entry/);
      assert.match(text, /awaiting_input/);
      const link = h.find(
        (n) => n.tagName === "A"
          && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "")
            .includes("/work/33333333-3333-4333-8333-333333333333"),
      );
      assert.ok(link, "the live Work must be reachable, not merely counted");
    },
  );
});

test("kf.08 the register reads its effective dates against the SERVER's Kuala Lumpur date, not the browser's", async () => {
  await mount(
    okFetch([firmRow({
      effective_from: "2026-10-01",
      effective_to: "2027-09-30",
      in_effect_today: false,
    })]),
    async (h) => {
      const text = h.text();
      assert.match(text, /read against 2026-09-16 in Asia\/Kuala_Lumpur/,
        "the as_of the DB computed must be the date the surface names");
      assert.match(text, /Not in effect on 2026-09-16/,
        "a rule whose window has not opened says so rather than reading as current");
      assert.match(text, /2026-10-01/, "the exact effective dates stay exact");
    },
  );
});
