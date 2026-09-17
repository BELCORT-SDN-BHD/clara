// #647 — the counterparty identity DETAIL's faces.
//
// FIVE FACTS, FIVE DIFFERENT SENTENCES, and each one comes from a read that ran:
//   · every one of the FOUR `recorded_via` lanes renders a real `ArApCounterparty.recordedVia.*`
//     string. This is the assertion that keeps the reuse boundary honest: `knowledge-shared.tsx`'s
//     `KnowledgeProvenance` looks up `ClientKnowledge.recordedVia.<value>`, which has exactly two
//     keys ("human_ui", "clara_runtime"), so reusing it here would render the literal key path
//     "ClientKnowledge.recordedVia.agent" on screen with nothing going red (next-intl renders a
//     missing key as its own dotted path rather than throwing — the H-25 defect the repo's
//     message-key gate exists for).
//   · the CONFLICT face states cross-client ambiguity and the same-name-other-role pair rather
//     than resolving either (AC4).
//   · the INACCESSIBLE-SOURCE face comes through the VERBATIM `KnowledgeSourceBlock`: the alias
//     names a document the reader cannot open, and the surface says so with the id instead of
//     degrading to silence.
//   · a governed refusal renders VERBATIM — code and message — in a PERSISTENT banner that
//     survives the reload every act triggers, never a transient toast.
//   · "no alias was ever recorded" is a different sentence from a filtered list finding nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { CounterpartyIdentityPanel } from "./counterparty-identity-panel";

enableDomInspection();

// A door dialog renders into a PORTAL on document.body, outside the mount container, so a cell
// that drives one has to mount the container into the body and walk from there — the idiom
// counterparty-hygiene-keyboard.test.tsx already established.
type Node = { tagName?: string; childNodes?: Node[]; id?: string; value?: string };
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
function docBody(): Node {
  return (globalThis as unknown as { document: { body: Node & { appendChild: (c: unknown) => void } } }).document.body;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const SOURCE_NONE = { document_id: null, extraction_id: null, region_id: null, field_path: null };

function alias(over: Record<string, unknown> = {}) {
  return {
    id: "al-1", alias_display: "ACME TRADING", alias_normalized: "acmetrading",
    kind: "vendor", origin: "trade_name", recorded_via: "human_ui",
    recorded_basis: null, created_by: "u1", created_by_name: "Aisyah",
    created_at: "2026-02-01T02:00:00Z", retired_at: null, source: SOURCE_NONE,
    ...over,
  };
}

function identity(over: Record<string, unknown> = {}) {
  return {
    client_id: "c1",
    as_of: "2026-09-16T10:00:00",
    current: {
      id: "cp1", kind: "vendor", name: "Acme Sdn Bhd", name_normalized: "acmesdnbhd",
      registration_no: "201801012345", registration_normalized: "201801012345", tin: "C123",
      payment_terms_days: 30, merged_into: null, retired_at: null, canonical_id: "cp1",
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z",
    },
    aliases: [alias()],
    identifier_revisions: [],
    merges: [],
    conflicts: [],
    ...over,
  };
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

type MockOpts = {
  identity?: unknown;
  documents?: unknown[];
  documentStatus?: number;
  onRpc?: (fn: string, body: Record<string, unknown>) => Response | null;
};

function mock(opts: MockOpts): typeof fetch {
  return (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) {
      const fn = rpc[1] ?? "";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      const custom = opts.onRpc?.(fn, body);
      if (custom) return custom;
      if (fn === "get_counterparty_identity") return jsonResponse(opts.identity ?? identity());
      return jsonResponse({});
    }
    if (url.includes("/rest/v1/documents")) {
      return jsonResponse(opts.documents ?? [], opts.documentStatus ?? 200);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(CounterpartyIdentityPanel, { clientId: "c1", counterpartyId: "cp1" }),
  });
}

async function renderWith(opts: MockOpts, assertions: (text: string, h: Awaited<ReturnType<typeof renderComponent>>) => void | Promise<void>) {
  await withMockedEnv(mock(opts), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      await assertions(h.text(), h);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
}

test("all FOUR recorded_via lanes render a real ArApCounterparty string — no missing key, no cast, and no reuse of ClientKnowledge's two-value union", async () => {
  await renderWith({
    identity: identity({
      aliases: [
        alias({ id: "a-human", alias_display: "HUMAN LANE", recorded_via: "human_ui" }),
        alias({ id: "a-agent", alias_display: "AGENT LANE", recorded_via: "agent", origin: "agent_proposed" }),
        alias({ id: "a-seed", alias_display: "SEEDING LANE", recorded_via: "seeding" }),
        alias({ id: "a-legacy", alias_display: "LEGACY LANE", recorded_via: "legacy_unknown" }),
      ],
    }),
  }, (text) => {
    assert.match(text, /entered in the app/);
    assert.match(text, /written by Clara/);
    assert.match(text, /carried in by client setup/);
    assert.match(text, /lane not recorded/);
    // The defect this cell exists for: a raw key path on screen instead of a sentence.
    assert.doesNotMatch(text, /ClientKnowledge\.recordedVia/, "the C13 two-value union must not be reused for a four-lane column");
    assert.doesNotMatch(text, /ArApCounterparty\.recordedVia/, "every lane resolves to a real string");
    // The origin vocabulary widened by 0215 renders too — a row that exists must be readable
    // even though no door in this build writes it.
    assert.match(text, /Proposed by Clara/);
  });
});

test("the CONFLICT face states cross-client ambiguity and the same-name-other-role pair — it never resolves either", async () => {
  await renderWith({
    identity: identity({
      conflicts: [
        {
          kind: "cross_client_identifier", identifier_kind: "tin", value: "C900",
          other_client_id: "c2", other_client_name: "Borneo Holdings",
          other_counterparty_id: "cp9", other_counterparty_name: "Acme Sdn Bhd", other_kind: "vendor",
        },
        {
          kind: "cross_kind_same_name", value: "Acme Sdn Bhd",
          other_client_id: "c1", other_client_name: "Rome Properties",
          other_counterparty_id: "cp2", other_counterparty_name: "Acme Sdn Bhd", other_kind: "customer",
        },
      ],
    }),
  }, (text) => {
    assert.match(text, /Borneo Holdings also records TIN C900/);
    assert.match(text, /deliberately NOT linked/);
    assert.match(text, /is a customer of this client with the same name/);
    assert.match(text, /Receivable and payable roles stay separate identities/);
    // AC4 stated on the surface, not merely true underneath.
    assert.match(text, /never settles an invoice, nets an open item or grants accounting permission/);
  });
});

test("the INACCESSIBLE-SOURCE face: an alias names a document the reader cannot open, and says so with the id", async () => {
  await renderWith({
    identity: identity({
      aliases: [alias({
        origin: "extracted",
        source: { document_id: "doc-77", extraction_id: "ex-1", region_id: "rg-1", field_path: "invoice.vendor_name" },
      })],
    }),
    // The document read succeeds and returns NO rows — RLS, a legal hold or a narrowed role. The
    // record still NAMES a source, so this is not "no source".
    documents: [],
  }, (text) => {
    assert.match(text, /doc-77/, "the id travels so a reader can ask somebody who can open it");
    assert.match(text, /Extracted from a document/, "the source KIND is the existing ClientKnowledge key, called verbatim");
    assert.match(text, /invoice\.vendor_name/);
  });
});

test("a governed refusal renders VERBATIM in a PERSISTENT banner that survives the reload every act triggers", async () => {
  let calls = 0;
  await withMockedEnv(
    mock({
      onRpc: (fn) => {
        if (fn === "retire_counterparty_alias") {
          return jsonResponse({
            code: "CLR11", message: "counterparty alias not found",
            details: JSON.stringify({ reason: "not_found" }), hint: null,
          }, 400);
        }
        if (fn === "get_counterparty_identity") { calls += 1; return jsonResponse(identity()); }
        return null;
      },
    }),
    async () => {
      const h = await renderComponent(App());
      const body = docBody() as Node & { appendChild: (c: unknown) => void };
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Retire");
        assert.ok(trigger, "the retire control is offered — the alias id is readable now");
        await h.act(() => { void clickButton(trigger as never); });
        for (let i = 0; i < 6; i++) await h.settle();
        const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Retire alias"));
        assert.ok(confirm, "the dialog opened");
        await h.act(async () => { await clickButton(confirm as never); });
        for (let i = 0; i < 8; i++) await h.settle();

        const text = textOf(body as never);
        assert.match(text, /counterparty alias not found/, "the refusal message renders verbatim, never re-worded");
        assert.match(text, /CLR11/, "…with its own code");
        assert.ok(calls >= 2, `the read was re-issued after the refusal (hydrate-never-trust); saw ${calls}`);
        // …and the identity it was refused ON is still on screen: a failed act must never hide
        // the data a successful read already produced.
        assert.match(text, /Acme Sdn Bhd/);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("an identity with NO alias says nothing was ever recorded — and a merged party says where its identity went", async () => {
  await renderWith({
    identity: identity({
      aliases: [],
      current: { ...identity().current, merged_into: "cp-surv" },
      merges: [{
        id: "m1", survivor_id: "cp-surv", survivor_name: "Acme Holdings Sdn Bhd",
        merged_id: "cp1", merged_name: "Acme Sdn Bhd", reason: "same SSM, two spellings",
        merged_by: "u1", merged_by_name: "Aisyah", merged_at: "2026-03-01T02:00:00Z",
        alias_id: "al-9", unmerged_at: null, side: "merged",
      }],
    }),
  }, (text) => {
    assert.match(text, /No alias has ever been recorded for this counterparty/);
    assert.match(text, /Merged into Acme Holdings Sdn Bhd/);
    assert.match(text, /same SSM, two spellings/, "the human's own words for the merge reach the surface");
    assert.match(text, /No corrections/, "the revision count comes from the read, not from a guess");
  });
});
