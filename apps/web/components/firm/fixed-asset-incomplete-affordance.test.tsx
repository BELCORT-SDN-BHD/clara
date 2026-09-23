// The fixed_asset_incomplete inline needs-you act — render-level test, on the
// `staff-advance-incomplete-affordance.test.tsx` precedent this file mirrors.
//
// #978 — this affordance has no `FaDoorDialog` wrapper of its own (it manages its own
// open/close by hand), so the ONE-DECISION-ONE-KEY shape that ticket wired onto
// `CompleteParticularsDialog`/`DisposeDialog` (components/registers/fa-row-actions.tsx) needs
// proving AT THIS THIRD CALL SITE separately: the decision starts on open and ends on close
// (Cancel, or a successful submit), the same as a dialog's onOpen/onClosed pair.

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

/** The REAL `act` contract: runs `fn`, resolves `true`/`false`, never rejects. */
async function realAct(fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

function App(props: { act: (fn: () => Promise<void>) => Promise<boolean>; error?: unknown }) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(FixedAssetIncompleteAffordance, { row: row(), busy: false, error: props.error ?? null, act: props.act }),
  });
}

/** The `id` React actually passed down, read off its internal props key — the SAME idiom
 *  `fa-row-actions.test.tsx`'s own `byIdSuffix` uses, because the harness's stub DOM only
 *  implements `getAttribute`/`setAttribute` and `id` is set as a plain prop, not via either. */
function idOf(n: unknown): string {
  if (n === null || typeof n !== "object") return "";
  const key = Object.keys(n).find((k) => k.startsWith("__reactProps"));
  const props = key ? (n as Record<string, Record<string, unknown>>)[key] : undefined;
  return String(props?.id ?? "");
}
function openTrigger(h: Awaited<ReturnType<typeof renderComponent>>) {
  return h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Complete this asset's particulars");
}
function methodSelect(h: Awaited<ReturnType<typeof renderComponent>>) {
  return h.find((n) => n.tagName === "SELECT" && idOf(n).endsWith("-method"));
}
function startField(h: Awaited<ReturnType<typeof renderComponent>>) {
  return h.find((n) => n.tagName === "INPUT" && idOf(n).endsWith("-start"));
}
function submitButton(h: Awaited<ReturnType<typeof renderComponent>>) {
  return h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Complete");
}

async function fillMinimalParticulars(h: Awaited<ReturnType<typeof renderComponent>>) {
  const method = methodSelect(h);
  assert.ok(method, "the method select must render once opened");
  // "none" needs only a start date — `particularsReadyToSubmit`'s cheapest ready shape.
  await h.act(() => { setFieldValue(method as never, "none"); });
  const start = startField(h);
  assert.ok(start, "the start-date input must render once opened");
  await h.act(() => { setFieldValue(start as never, "2026-09-01"); });
}

test("FixedAssetIncompleteAffordance: the real door call carries a non-empty op_key that SURVIVES a refused retry unchanged", async () => {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  await withMockedEnv(
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      // Every attempt refuses, so the affordance stays open (N13) and a SECOND submit is the
      // SAME decision the human is retrying, not a new one.
      return jsonResponse({ code: "CLR37", message: "refused" }, 400);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App({ act: realAct }));
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = openTrigger(h);
        assert.ok(trigger, "the inline trigger must render");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 2; i++) await h.settle();

        await fillMinimalParticulars(h);

        const submit = submitButton(h);
        assert.ok(submit, "the Submit control must render once editing");
        await h.fireEvent(submit as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        // The refusal above must not have collapsed the form (N13) — a second submit reaches
        // the SAME open decision.
        const retrySubmit = submitButton(h);
        assert.ok(retrySubmit, "the affordance stays open on a refusal so the human can retry");
        await h.fireEvent(retrySubmit as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.equal(seen.length, 2, "complete_fixed_asset_particulars must have been called twice");
        assert.match(seen[0]!.url, /\/rpc\/complete_fixed_asset_particulars$/);
        assert.equal(typeof seen[0]!.body.p_op_key, "string", "#978 — the caller supplies a key; the door mints nothing");
        assert.ok((seen[0]!.body.p_op_key as string).length > 0);
        assert.equal(seen[0]!.body.p_op_key, seen[1]!.body.p_op_key,
          "the retry carries the SAME key — a lost response replays the same completion, not a second one");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("FixedAssetIncompleteAffordance: a successful submit clears the fields and mints a FRESH key on the next decision", async () => {
  const opKeys: string[] = [];
  const impls: Array<(u: RequestInfo | URL, init?: RequestInit) => Promise<Response>> = [
    async (_u, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      opKeys.push(String(body.p_op_key));
      return jsonResponse({ asset_id: "a1", client_id: "c1", particulars_complete: true });
    },
  ];
  let callIndex = 0;
  await withMockedEnv(
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      const impl = impls[callIndex] ?? impls[0]!;
      callIndex += 1;
      return impl(url, init);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App({ act: realAct }));
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        await h.fireEvent(openTrigger(h)!, "click");
        for (let i = 0; i < 2; i++) await h.settle();
        await fillMinimalParticulars(h);
        await h.fireEvent(submitButton(h)! as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        // Success collapses the affordance back to its plain trigger (N13's success direction).
        assert.ok(openTrigger(h), "on success the affordance collapses back to its plain trigger");
        assert.equal(methodSelect(h), null, "the fields are gone (editing closed) after a successful submit");

        // A SECOND, independent decision (a later needs-you sweep re-lists the same row, or a
        // different row) must not reuse the first decision's key.
        await h.fireEvent(openTrigger(h)!, "click");
        for (let i = 0; i < 2; i++) await h.settle();
        await fillMinimalParticulars(h);
        await h.fireEvent(submitButton(h)! as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.equal(opKeys.length, 2);
        assert.notEqual(opKeys[0], opKeys[1], "a NEW open decision mints a NEW key, not the completed one's");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("FixedAssetIncompleteAffordance: a row missing asset_id or client_id renders nothing", async () => {
  const partial: ReviewQueueRow = { ...row(), asset_id: null };
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(FixedAssetIncompleteAffordance, { row: partial, busy: false, error: null, act: async () => true }),
    }),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.equal(h.text().trim(), "", "no inline affordance renders without a real asset_id");
  } finally {
    await h.unmount();
  }
});
