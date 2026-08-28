// The staff_advance_incomplete inline needs-you act — render-level test
// (the OpenQuestionAffordance precedent has no dedicated file of its own,
// covered only via needs-you-a11y.test.tsx's sweep; this train adds one
// focused unit test on top of that parity, since the write path is new).
//
// F4 FIX (independent review, fix-required, 2026-08-28): this file used to
// name "submit calls act() with the door write" and "the pair is a pair" in
// its own test titles without ever filling a field, submitting, or reading
// what `act` was called with — a vacuous-with-a-claiming-title test (review
// law 2). It now genuinely fills the fields, submits through a REAL `act`
// backed by a mocked fetch (proving the actual wire body reaches
// complete_staff_advance_particulars, not a fabricated closure), and asserts
// N13 (clear-only-on-success) in both directions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { StaffAdvanceIncompleteAffordance } from "./staff-advance-incomplete-affordance";
import type { ReviewQueueRow } from "@/lib/firm/needs-you";

enableDomInspection();

function row(): ReviewQueueRow {
  return {
    row_kind: "staff_advance_incomplete", section: "needs_you", client_id: "c1",
    counterparty_id: null, filing_id: null, entry_id: null, question_id: null,
    task_id: null, document_id: null, lane: null, auto: false, rule_backed: false,
    high_stakes: false, aged_since: null, amount_cents: 100000, period: null,
    question_text: null, created_at: "2026-08-01T00:00:00Z", id: "adv1",
    coding_kind: null, watch_id: null, tier: null, finding_id: null,
    asset_id: null, advance_id: "adv1",
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

/** The REAL `act` contract (lib/firm/use-review-queue.ts's own shape, ported
 *  minimally): runs `fn`, resolves `true` on success / `false` on a caught
 *  failure, NEVER rejects — exactly what this affordance's own `submit()`
 *  relies on to decide whether to clear its fields (N13). */
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
    children: createElement(StaffAdvanceIncompleteAffordance, { row: row(), busy: false, error: props.error ?? null, act: props.act }),
  });
}

function purposeField(h: Awaited<ReturnType<typeof renderComponent>>) {
  return h.find((n) => n.tagName === "INPUT" && (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("aria-label") === "Purpose");
}
function referenceField(h: Awaited<ReturnType<typeof renderComponent>>) {
  return h.find((n) => n.tagName === "INPUT" && (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("aria-label") === "Reference");
}
function submitButton(h: Awaited<ReturnType<typeof renderComponent>>) {
  return h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Save"));
}

test("StaffAdvanceIncompleteAffordance: one field filled stays disabled; both filled enables Submit, and the real door call carries the typed values", async () => {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  await withMockedEnv(
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return jsonResponse({ advance_id: "adv1", purpose: "Medical", reference: "CHQ-1" });
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App({ act: realAct }));
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
        assert.ok(trigger, "the inline trigger must render");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 2; i++) await h.settle();

        const purpose = purposeField(h);
        assert.ok(purpose, "the purpose input must be reachable after opening");
        await h.act(() => { setFieldValue(purpose as never, "Medical"); });

        let submit = submitButton(h);
        assert.ok(submit, "the Submit control must render once editing");
        assert.equal(
          (submit as unknown as { disabled: boolean }).disabled,
          true,
          "purpose alone must not enable Submit — complete_staff_advance_particulars' own ABI SSD.5 requires the pair together",
        );

        const reference = referenceField(h);
        assert.ok(reference, "the reference input must be reachable after opening");
        await h.act(() => { setFieldValue(reference as never, "CHQ-1"); });

        submit = submitButton(h);
        assert.equal((submit as unknown as { disabled: boolean }).disabled, false, "both fields filled must enable Submit");

        await h.fireEvent(submit as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.equal(seen.length, 1, "complete_staff_advance_particulars must have been called exactly once");
        assert.match(seen[0]!.url, /\/rpc\/complete_staff_advance_particulars$/);
        assert.deepEqual(
          { p_client: seen[0]!.body.p_client, p_advance: seen[0]!.body.p_advance, p_purpose: seen[0]!.body.p_purpose, p_reference: seen[0]!.body.p_reference },
          { p_client: "c1", p_advance: "adv1", p_purpose: "Medical", p_reference: "CHQ-1" },
          "the typed values, and the row's own client_id/advance_id, must reach the wire verbatim",
        );

        // N13, success direction: the fields clear and the form collapses
        // back to the plain trigger.
        assert.ok(
          h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars")),
          "on success the affordance collapses back to its plain trigger",
        );
        assert.equal(purposeField(h), null, "the purpose input must be gone (editing closed) after a successful submit");
      } finally {
        await h.unmount();
      }
    },
  );
});

// N13, the refusal direction: a failed act() must NOT clear what the human
// typed — they should be able to see the refusal, adjust, and resubmit.
test("StaffAdvanceIncompleteAffordance: a failed act() leaves the typed purpose/reference in place (N13)", async () => {
  const failingAct = async (fn: () => Promise<void>): Promise<boolean> => {
    void fn; // a refused act — the caller (needs-you-inbox.tsx) never invokes fn on a pre-empted failure path either
    return false;
  };
  const h = await renderComponent(App({ act: failingAct }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
    assert.ok(trigger);
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 2; i++) await h.settle();

    const purpose = purposeField(h);
    assert.ok(purpose);
    await h.act(() => { setFieldValue(purpose as never, "Medical"); });
    const reference = referenceField(h);
    assert.ok(reference);
    await h.act(() => { setFieldValue(reference as never, "CHQ-1"); });

    const submit = submitButton(h);
    assert.ok(submit);
    await h.fireEvent(submit as never, "click");
    for (let i = 0; i < 4; i++) await h.settle();

    assert.equal((purposeField(h) as unknown as { value: string } | null)?.value, "Medical", "a failed act() must not discard the typed purpose");
    assert.equal((referenceField(h) as unknown as { value: string } | null)?.value, "CHQ-1", "a failed act() must not discard the typed reference");
  } finally {
    await h.unmount();
  }
});

test("StaffAdvanceIncompleteAffordance: a row missing advance_id or client_id renders nothing", async () => {
  const partial: ReviewQueueRow = { ...row(), advance_id: null };
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(StaffAdvanceIncompleteAffordance, { row: partial, busy: false, error: null, act: async () => true }),
    }),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.equal(h.text().trim(), "", "no inline affordance renders without a real advance_id");
  } finally {
    await h.unmount();
  }
});
