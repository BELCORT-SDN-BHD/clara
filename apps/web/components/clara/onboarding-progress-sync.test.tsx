// H-28 — THE CHECKLIST FOLLOWS THE LIVE INTERVIEW.
//
// TWO CLOCKS, one of them stopped. `InterviewRunCard` polls `/state` every POLL_MS; the
// checklist reads through `useHydratedPart`, whose mount effect is stable by construction. So
// the item list — and the N/N header over it — was whatever the database held when the card
// mounted, while `clientOnboarding_v4` wrote one plan CAS per confirmed segment across ~18 of
// them. `onPlanChanged` existed but fired only at the run's TERMINAL and on the two-step
// cancel; nothing fired per answered segment.
//
// WHAT THESE CELLS PIN, and why each one is needed:
//   1. an ADVANCING `pendingPark.parkIndex` provokes exactly one more plan-items read, and the
//      header actually changes — a re-read that threw its answer away would satisfy a counter;
//   2. an UNCHANGED park across repeated polls provokes NONE — without this the fix is a
//      busy-poll on the plan, which is the class `lib/parts/hooks.ts`'s own header exists to
//      prevent;
//   3. the FIRST observation provokes none — on mount both halves read the same database at
//      the same moment, so the first index is not news. (This is the cell the fold round's
//      mutant panel found missing: mutating `if (seen === null) return;` to a no-op left every
//      other cell green.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";

enableDomInspection();

const PLAN = {
  id: "plan-1", firm_id: "f1", scope_kind: "client", client_id: "c1", state: "open",
  revision_token: "rev-1", revision_n: 1, committed_at: null, committed_by: null,
  review_maker: "u1", reviewed_at: "2026-08-01T00:00:00Z", contributors: ["u1"],
  commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};

const item = (key: string, state: string) => ({
  id: `i-${key}`, plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: key,
  question: `Q ${key}?`, answer: state === "pending" ? null : `A ${key}`, state,
  required_for_commit: false, answered_by: null,
  answered_at: state === "pending" ? null : "2026-08-01T00:00:00Z",
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
});

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

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(OnboardingChecklistCard, { clientId: "c1", session: sessionTokenAccessor }),
  });
}

/** The estate, with a park index and an item list the test moves by hand. `itemReads` counts
 *  the plan-item GETs — the read the checklist's own header is built from. */
function mockEstate() {
  const runtime = { parkIndex: 1, items: [item("legal_name", "pending"), item("fye", "pending")] };
  const itemReads: string[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/onboarding_plan_items")) {
      itemReads.push(u);
      return jsonResponse(runtime.items);
    }
    if (u.includes("/rest/v1/onboarding_plans")) return jsonResponse([PLAN]);
    if (u.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: "onboarding" }]);
    if (u.includes("/rest/v1/opening_seed_registry")) return jsonResponse([]);
    if (u === "/api/runtime/interview/client/start") return jsonResponse({ run_id: "run-1" }, 202);
    // THE REAL WAY A PARK ADVANCES. The poll's own 3s interval cannot be reached inside a
    // node:test tick, and faking the clock would test the fake; answering IS the journey —
    // `submitAnswer` calls the hook's own `refresh()`, so the next `/state` read is the real
    // one the product makes. The runtime confirms the segment and moves on.
    if (u === "/api/runtime/interview/answer") {
      runtime.items = [item("legal_name", "answered"), item("fye", "pending")];
      runtime.parkIndex += 1;
      return jsonResponse({ accepted: true });
    }
    if (u.startsWith("/api/runtime/interview/state?")) {
      return jsonResponse({
        run_id: "run-1", scope: "client", status: "awaiting_input",
        pending_park: { parkIndex: runtime.parkIndex, seg: "legal_name", phase: "q", question: "What is the client's legal name?" },
        terminal: null, activity: [], plan: { id: "plan-1" }, items: [],
      });
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return { impl, runtime, itemReads };
}

/**
 * Types into the interview composer and sends — the ONE product path that makes the hook
 * re-read `/state` inside a test tick (`submitAnswer` calls `refresh()` itself). The 3s poll
 * cannot be reached from a node:test tick, and faking the clock would test the fake.
 *
 * THE SEND CONTROL IS A `type="submit"` BUTTON INSIDE A `<form onSubmit>`. Base UI's own
 * `useButton` puts an `onClick` on it, so `clickButton` runs and reports success — but the
 * stub DOM has no native form submission, so nothing reaches `submit()` and the send SILENTLY
 * does nothing. (Measured: the first cut of this file clicked Send, threw no error, and made
 * zero requests.) The form's own handler is therefore invoked directly, exactly the way
 * `clickButton` invokes a real `onClick` on a real node — the button's live `disabled` is
 * asserted FIRST, so this can never be the thing that manufactures a green on a gate that
 * would have blocked a person.
 */
async function answerCurrentPark(h: Awaited<ReturnType<typeof renderComponent>>, text: string): Promise<void> {
  const field = h.find((n) => (n as { getAttribute?: (a: string) => string | null }).getAttribute?.("aria-label") === "Your answer");
  assert.ok(field, "the interview composer must be open on a live park");
  await h.act(() => setFieldValue(field, text));

  const send = h.find((n) => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n) === "Send");
  assert.ok(send, "and its Send control");
  assert.equal((send as unknown as { disabled?: boolean }).disabled, false, "assert the gate, then act: a typed answer must enable Send");

  const form = h.find((n) => (n as { tagName?: string }).tagName === "FORM");
  assert.ok(form, "the composer's form");
  const propsKey = Object.keys(form as object).find((k) => k.startsWith("__reactProps"));
  const onSubmit = propsKey
    ? (form as unknown as Record<string, { onSubmit?: (e: unknown) => unknown }>)[propsKey]?.onSubmit
    : undefined;
  assert.ok(onSubmit, "the composer's form must carry the real submit handler");
  await h.act(async () => {
    await onSubmit({ preventDefault() {}, stopPropagation() {}, target: form, currentTarget: form });
  });
}

/** Mounts the card and starts a run, so the poll is live and a first park has been observed. */
async function mountWithLiveRun(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  for (let i = 0; i < 6; i++) await h.settle();
  const start = h.find((n) => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n) === "Start / continue interview");
  assert.ok(start, "the live plan offers the interview start");
  await clickButton(start);
  for (let i = 0; i < 8; i++) await h.settle();
}

test("H-28 — an ADVANCING park index provokes exactly one more plan read, and the N/N header follows", async () => {
  // The park advances inside the runtime's own answer handler, not from this scope — see
  // `answerCurrentPark`'s note for why the product path is the only honest way to move it.
  const { impl, itemReads } = mockEstate();
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    try {
      await mountWithLiveRun(h);
      assert.match(h.text(), /0\s*\/\s*2/, `the mount snapshot; got: ${h.text()}`);
      const readsBefore = itemReads.length;
      assert.ok(readsBefore > 0, "positive control: the mount read happened");

      // The human answers the open park. The runtime records the segment and moves on, so the
      // next `/state` reports a STRICTLY HIGHER index — the shape `classifyDeliveryBody`
      // already treats as the estate's proof that an answer landed.
      await answerCurrentPark(h, "ROME PUBLIC ADVISORY");
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(itemReads.length, readsBefore + 1, `exactly ONE extra read, not a burst; saw ${itemReads.length - readsBefore}`);
      // DISCRIMINATING: this header could not read 1 / 2 from the mount snapshot.
      assert.match(h.text(), /1\s*\/\s*2/, `the header followed the interview; got: ${h.text()}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("H-28 — an UNCHANGED park across repeated polls provokes NO extra plan read (this must not become a busy poll)", async () => {
  const { impl, runtime, itemReads } = mockEstate();
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    try {
      await mountWithLiveRun(h);
      const readsBefore = itemReads.length;
      // Several more renders and resolved microtasks at the SAME park.
      for (let i = 0; i < 12; i++) await h.settle();
      assert.equal(itemReads.length, readsBefore, `an unchanged park is not news; saw ${itemReads.length - readsBefore} extra read(s)`);

      // And a park that goes BACKWARDS (a resumed run re-reporting an earlier index) is not
      // progress either — it must not fire, and it must not lower the watermark.
      runtime.parkIndex = 0;
      for (let i = 0; i < 8; i++) await h.settle();
      assert.equal(itemReads.length, readsBefore, "a lower index is not an advance");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("H-28 — the FIRST park observation provokes no read: on mount both halves already read the same database", async () => {
  const { impl, itemReads } = mockEstate();
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      // The checklist's own mount read, before any run exists.
      const readsAtMount = itemReads.length;
      assert.ok(readsAtMount > 0, "positive control: the checklist read on mount");

      const start = h.find((n) => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n) === "Start / continue interview");
      assert.ok(start);
      await clickButton(start);
      for (let i = 0; i < 10; i++) await h.settle();

      assert.equal(
        itemReads.length,
        readsAtMount,
        `the first /state read reports a park the checklist's own mount read already covers — re-reading for it is one wasted round trip per run; saw ${itemReads.length - readsAtMount}`,
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
