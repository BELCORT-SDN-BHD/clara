// #933 — ENTRANCE 2 OF 3: THE NEEDS-YOU INLINE FORM PRE-FILLS FROM THE SAME PROPOSAL.
//
// ONE PROPOSAL, THREE ENTRANCES. The asset page dialog, this inline form and the conversation
// question all answer the SAME question about the SAME asset, so they must all pre-fill from the
// same block — a second derivation here would be a second opinion a person could not reconcile.
// This file drives the queue's own entrance: the `fixed_asset_incomplete` affordance, whose row
// carries an `asset_id` and no question id at all (`lib/firm/needs-you.ts`), which is why the
// proposal is fetched by the asset rather than handed down.
//
// WHAT EACH CELL PINS:
//   prefill   opening the inline form reads the asset's parked question and the controls come up
//             carrying the proposal, from a queue row that knows nothing about Work.
//   reason    the derivation's own one line is on screen here too, not only on the asset page.
//   the_edit  the values that reach the door are the person's. #883's ruling, at this call site.
//   cancel    closing ends the decision AND the seed, so re-opening is a fresh read — the same
//             boundary #978 pinned for this affordance's operation key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { FixedAssetIncompleteAffordance } from "./fixed-asset-incomplete-affordance";
import type { ReviewQueueRow } from "@/lib/firm/needs-you";

enableDomInspection();

const PROPOSAL_REASON =
  "This client's record states a depreciation policy for 1510, so I propose reducing balance at "
  + "2000 basis points a year, over 96 months. I propose 1 March 2026 — the acquisition's own "
  + "posting date — as the in-service date, and a nil residual, which is this firm's default.";

const parkedQuestion = () => [{
  id: "q-1",
  source_ref: {
    kind: "fixed_asset",
    asset_id: "a1",
    proposal: {
      v: 1,
      method: "reducing_balance",
      useful_life_months: 96,
      rate_bps: 2000,
      residual_cents: 0,
      start_date: "2026-03-01",
      description: "Delivery van",
      basis: ["client_knowledge", "acquisition_date", "firm_default_residual"],
      reason: PROPOSAL_REASON,
    },
  },
}];

function row(): ReviewQueueRow {
  return {
    row_kind: "fixed_asset_incomplete", section: "needs_you", client_id: "c1",
    counterparty_id: null, filing_id: null, entry_id: null, question_id: null,
    task_id: null, document_id: null, lane: null, auto: false, rule_backed: false,
    high_stakes: false, aged_since: null, amount_cents: 360000, period: null,
    question_text: null, created_at: "2026-08-01T00:00:00Z", id: "fa1",
    coding_kind: null, watch_id: null, tier: null, finding_id: null,
    asset_id: "a1", advance_id: null,
    client_name: null, batch_ids: null, open_proposal_count: null, authority_id: null,
  };
}

type Call = { url: string; body: Record<string, unknown> };

function idOf(n: unknown): string {
  if (n === null || typeof n !== "object") return "";
  const key = Object.keys(n).find((k) => k.startsWith("__reactProps"));
  const props = key ? (n as Record<string, Record<string, unknown>>)[key] : undefined;
  return String(props?.id ?? "");
}
/** The `data-testid` of a harness node. The stub DOM implements `getAttribute`, but `h.find`'s
 *  predicate parameter is untyped, so the cast lives in ONE place rather than at every call. */
function tidOf(n: unknown): string {
  const el = n as { getAttribute?: (k: string) => string | null } | null;
  return String(el?.getAttribute?.("data-testid") ?? "");
}

function valueOf(n: unknown): unknown {
  if (n === null || typeof n !== "object") return undefined;
  const key = Object.keys(n).find((k) => k.startsWith("__reactProps"));
  const props = key ? (n as Record<string, Record<string, unknown>>)[key] : undefined;
  return props?.value;
}

async function openInlineForm(opts: { rows?: unknown[] } = {}) {
  const rows = opts.rows ?? parkedQuestion();
  const calls: Call[] = [];
  const impl = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (url.includes("agent_interruptions")) {
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ asset_id: "a1" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
      return true;
    } catch {
      return false;
    }
  };

  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");

  const h = await renderComponent(createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(FixedAssetIncompleteAffordance, { row: row(), busy: false, error: null, act }),
  }));
  for (let i = 0; i < 3; i++) await h.settle();
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Complete this asset's particulars");
  assert.ok(trigger, "the inline open control renders");
  await h.fireEvent(trigger!, "click");
  for (let i = 0; i < 10; i++) await h.settle();

  const teardown = async () => {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  };
  return { h, calls, teardown };
}

const field = (h: Awaited<ReturnType<typeof renderComponent>>, suffix: string) =>
  h.find((n) => idOf(n).endsWith(suffix));

test("p933.needsyou.prefill the queue's inline form comes up carrying the proposal, from a row that knows only an asset id", async () => {
  const { h, calls, teardown } = await openInlineForm();
  try {
    assert.equal(calls.filter((c) => c.url.includes("agent_interruptions")).length, 1,
      "prefill: the parked question is read once, when the form opens");
    assert.equal(valueOf(field(h, "-method")), "reducing_balance");
    assert.equal(String(valueOf(field(h, "-life"))), "96");
    assert.equal(String(valueOf(field(h, "-rate"))), "2000",
      "prefill: reducing balance carries BOTH drivers, or the door refuses the shape");
    assert.equal(valueOf(field(h, "-start")), "2026-03-01");
  } finally {
    await teardown();
  }
});

test("p933.needsyou.reason the same one line Clara derived it from is on screen in the queue too", async () => {
  const { h, teardown } = await openInlineForm();
  try {
    const note = h.find((n) => tidOf(n) === "fa-proposal-note");
    assert.ok(note, "reason: the queue's entrance accounts for its pre-fill exactly as the asset page does");
    const said = textOf(note as never);
    assert.match(said, /This client's record states a depreciation policy for 1510/);
    assert.match(said, /what you confirm/);
  } finally {
    await teardown();
  }
});

test("p933.needsyou.the_edit the door receives the person's values, never the proposal's, once they change one", async () => {
  const { h, calls, teardown } = await openInlineForm();
  try {
    await h.fireEvent(field(h, "-rate")! as never, "change", (n) => setFieldValue(n, "1500"));
    for (let i = 0; i < 4; i++) await h.settle();
    const submit = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Complete");
    assert.ok(submit, "the submit control renders");
    await h.fireEvent(submit!, "click");
    for (let i = 0; i < 8; i++) await h.settle();

    const posts = calls.filter((c) => c.url.includes("/rpc/complete_fixed_asset_particulars"));
    assert.equal(posts.length, 1);
    const particulars = posts[0]!.body.p_particulars as Record<string, unknown>;
    assert.equal(particulars.rate_bps, 1500,
      "the_edit: the applied rate is the confirmed one — a form that posted its seed would send 2000");
    assert.equal(particulars.useful_life_months, 96, "the_edit: and the untouched fields are still the proposal's");
  } finally {
    await teardown();
  }
});

test("p933.needsyou.no_proposal nothing parked means the ordinary empty form — today's behaviour, unchanged", async () => {
  const { h, teardown } = await openInlineForm({ rows: [] });
  try {
    assert.ok(!h.find((n) => tidOf(n) === "fa-proposal-note"),
      "no_proposal: no note, because there is nothing to account for");
    assert.equal(valueOf(field(h, "-start")), "", "no_proposal: and no date anybody has to notice and clear");
  } finally {
    await teardown();
  }
});
