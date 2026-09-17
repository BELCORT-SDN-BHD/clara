// #649 AC6 + AC2 (D7) — the onboarding card's write controls, re-composed onto `Field`, and the
// financial-year end the commit ceremony now asks for.
//
// TWO SUBJECTS, ONE SURFACE, and they belong in one file because they are one pass over the same
// card: every persistent input on it goes through FieldGroup/Field/FieldLabel/FieldDescription/
// FieldError with `aria-invalid` (appendix D #28, the `work-question-form.tsx:70` precedent), and
// the new fy-end pair is the input that pass exists for.
//
// WHAT THE FY-END FIELD IS FOR. `clara.clients` admits a year end only as a month AND a day
// together (`ck_clients_fy_end`, 0041:778); the interview asks the MONTH and nothing else. The
// owner ruled (D7) that the missing half is ASKED, not derived — so month-end is a button a person
// clicks and never a value this surface fills in.
//
// Both dialogs are Base UI dialogs, so every control inside them is driven with `clickButton` from
// the shared harness — `h.fireEvent` silently no-ops on a node inside an OPEN dialog (the house's
// first dialog law), and a cell that clicked nothing would pass.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

// IMPORT ORDER IS LOAD-BEARING: harness first, component last. See
// onboarding-amend-and-chart.test.tsx's own note for the symptom when it is not.
import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";
import { CLIENT_RECORD_CHANGED_EVENT } from "../../lib/command/bus";
import { OnboardingChecklistCard, planFyEndMonth } from "./OnboardingChecklistCard";
import { fyEndDraftBlocks, fyEndDraftIsBlank } from "./OnboardingFyEndField";

enableDomInspection();

// H-50 — `test/hookHarness.ts` stubs a minimal `window` whose three event methods are NO-OPS.
// This file now asserts a real dispatch/listen round trip on `CLIENT_RECORD_CHANGED` (the settle
// refusal cell below), so the stub's methods are swapped for a real `EventTarget`'s — the same
// swap `onboarding-checklist.test.tsx` and `tests/focusRailSubscription.test.mjs` already make,
// and for the same reason: without it an announcement assertion would be measuring an instrument
// that cannot announce anything.
const realEventTarget = new EventTarget();
globalThis.window.addEventListener = realEventTarget.addEventListener.bind(realEventTarget);
globalThis.window.removeEventListener = realEventTarget.removeEventListener.bind(realEventTarget);
globalThis.window.dispatchEvent = realEventTarget.dispatchEvent.bind(realEventTarget);

type Stub = Record<string, unknown>;
type Call = { url: string; body: unknown };

const CLIENT_ID = "c6490003-0000-4000-8000-000000000649";
const PLAN_ID = "a6490003-0000-4000-8000-000000000649";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PLAN = {
  id: PLAN_ID, firm_id: "f1", scope_kind: "client", client_id: CLIENT_ID, state: "open",
  revision_token: "rev-1", revision_n: 4, committed_at: null, committed_by: null,
  review_maker: null, reviewed_at: null, contributors: [], commit_attestation: null,
  cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};

const item = (over: Partial<Record<string, unknown>>) => ({
  id: "i1", plan_id: PLAN_ID, firm_id: "f1", item_kind: "must_ask", item_key: "banks",
  question: "Which banks?", answer: null, state: "pending", required_for_commit: false,
  answered_by: null, answered_at: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const PENDING_BANKS = item({});
// The interview writes `fye` as a JSON NUMBER (validateFye returns 1-12; 0192's map row says so).
const FYE_ITEM = item({ id: "i2", item_key: "fye", question: "Which month?", answer: 6, state: "answered" });
const OPENING_ITEM = item({
  id: "i3", item_key: "first_year_zero_opening", question: "Opening position",
  answer: { opening: "zero" }, state: "answered", required_for_commit: true,
});

function withFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>, run: (calls: Call[]) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const calls: Call[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === "string") { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url, body });
    return impl(url, init);
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string, dump?: () => string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}${dump ? `\n--- rendered ---\n${dump()}` : ""}`);
    await h.settle();
  }
}

const buttonNamed = (name: string) => (node: Stub) => node.tagName === "BUTTON" && textOf(node).trim() === name;

function findIn(root: Stub, predicate: (n: Stub) => boolean): Stub | null {
  if (predicate(root)) return root;
  for (const c of (root.childNodes as Stub[] | undefined) ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function findAllIn(root: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  const walk = (n: Stub) => {
    if (predicate(n)) out.push(n);
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(root);
  return out;
}

const labelled = (root: Stub, label: string) =>
  findIn(root, (n) => typeof n.getAttribute === "function"
    && (n.getAttribute as (a: string) => string | null)("aria-label") === label);

function App(): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement("div", null, createElement("h1", null, "Onboarding"),
      createElement(OnboardingChecklistCard, { clientId: CLIENT_ID, session })),
  });
}

function baseRouter(items: unknown[], over: (url: string) => Response | null = () => null) {
  return (url: string): Response => {
    const custom = over(url);
    if (custom) return custom;
    if (url.includes("/rest/v1/clients")) return json([{ id: CLIENT_ID, name: "ROME PROPERTIES", status: "onboarding" }]);
    if (url.includes("/rest/v1/onboarding_plan_revisions")) return json([]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return json(items);
    if (url.includes("/rest/v1/onboarding_plans")) return json([PLAN]);
    if (url.includes("/rest/v1/opening_seed_registry")) return json([]);
    if (url.includes("/rest/v1/rpc/get_interview_state")) return json({});
    if (url.includes("/rest/v1/caller_context")) return json([]);
    if (url.includes("/api/runtime/interview/state")) return json({});
    if (url.includes("/rpc/commit_client_onboarding")) return json({ client_id: CLIENT_ID, plan_id: PLAN_ID, status: "active", review_maker: null, attestation_kind: "distinct_checker" });
    if (url.includes("/rpc/promote_plan_answers_to_knowledge")) return json({ plan_id: PLAN_ID, promoted: [], skipped: [], withheld: [] });
    if (url.includes("/rpc/settle_client_onboarding_facts")) {
      return json({ plan_id: PLAN_ID, client_id: CLIENT_ID, fy_end_month: 6, fy_end_day: 30, fy_end_month_source: "plan" });
    }
    return json([]);
  };
}

async function mountInBody(): Promise<{ h: Awaited<ReturnType<typeof renderComponent>>; body: Stub }> {
  const h = await renderComponent(App());
  const body = (globalThis as unknown as { document: { body: Stub } }).document.body;
  (body.appendChild as (c: unknown) => void)(h.container);
  for (let i = 0; i < 6; i++) await h.settle();
  return { h, body };
}

async function openCommitDialog(h: Awaited<ReturnType<typeof renderComponent>>, body: Stub) {
  const trigger = h.find(buttonNamed("Commit onboarding"));
  assert.ok(trigger, "the Commit trigger must render");
  await h.fireEvent(trigger!, "click");
  await settleUntil(h, () => labelled(body, "Financial year-end day") !== null, "the commit dialog's fy-end field", () => textOf(body));
  return trigger!;
}

// ---------------------------------------------------------------------------
// The pure projections first — both of the card's new decisions are testable without a render.
// ---------------------------------------------------------------------------

test("649 · planFyEndMonth reads the same two answer shapes clara._plan_fye_month reads, and nothing else", () => {
  assert.equal(planFyEndMonth([FYE_ITEM] as never), 6, "the interview's JSON number");
  assert.equal(planFyEndMonth([item({ item_key: "fye", answer: "6", state: "resolved" })] as never), 6,
    "a human resolution writes to_jsonb(text) — a STRING — and must read the same");
  assert.equal(planFyEndMonth([item({ item_key: "fye", answer: { month: 6 }, state: "answered" })] as never), null,
    "an object is not a month; pretending it is would let the settle door write a year nobody stated");
  assert.equal(planFyEndMonth([item({ item_key: "fye", answer: 13, state: "answered" })] as never), null);
  assert.equal(planFyEndMonth([item({ item_key: "fye", answer: 6, state: "pending" })] as never), null,
    "an unanswered item is not an answer");
});

test("649 · a BLANK fy-end pair never blocks Confirm; a half-typed one does", () => {
  assert.equal(fyEndDraftIsBlank({ month: "", day: "" }), true);
  assert.equal(fyEndDraftBlocks({ month: "", day: "" }, 6), false,
    "recording the year end later is a real choice, and the dialog says so");
  assert.equal(fyEndDraftBlocks({ month: "", day: "30" }, 6), false,
    "the plan already states the month, so a day alone is complete");
  assert.equal(fyEndDraftBlocks({ month: "", day: "30" }, null), true,
    "with no month on the plan and none typed, the door would refuse fy_end_month_unanswered");
  assert.equal(fyEndDraftBlocks({ month: "2", day: "31" }, 6), true, "31 February is CLR37 at the door");
  assert.equal(fyEndDraftBlocks({ month: "6", day: "" }, 6), true, "the DAY is never optional (D7)");
});

// ---------------------------------------------------------------------------
// The fy-end Field, rendered.
// ---------------------------------------------------------------------------

test("649 · AC6 — the fy-end pair is a labelled Field with a description, and the month-end suggestion is a CLICK, not a default", async () => {
  await withFetch(baseRouter([PENDING_BANKS, FYE_ITEM, OPENING_ITEM]), async () => {
    const { h, body } = await mountInBody();
    try {
      await openCommitDialog(h, body);
      const day = labelled(body, "Financial year-end day");
      assert.ok(day, "the day field must render");
      assert.equal((day as { value?: string }).value ?? "", "",
        "NOTHING pre-fills the day — deriving month end is the invented accounting fact D7 ruled against");

      const text = textOf(body);
      assert.match(text, /The interview recorded month 6/, "the description says what the plan already holds");
      assert.match(text, /Clara asks here rather than assuming month end/);
      assert.match(text, /no financial year end is recorded for this client now/,
        "a blank pair is a real choice and the dialog says what it means");

      // THE SUGGESTION IS A BUTTON. June has 30 days, and the label names the day it will fill.
      const suggest = findIn(body, buttonNamed("Use month end — day 30"));
      assert.ok(suggest, `the month-end suggestion must be an explicit control; got:\n${text}`);
      await h.act(() => clickButton(suggest!));
      await settleUntil(h, () => ((labelled(body, "Financial year-end day") as { value?: string })?.value ?? "") === "30",
        "the clicked suggestion filling the day");
      assert.deepEqual(checkAccessibility(body as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC6 — an impossible day marks the control aria-invalid, blocks Confirm and PRESERVES the draft", async () => {
  await withFetch(baseRouter([PENDING_BANKS, FYE_ITEM, OPENING_ITEM]), async (calls) => {
    const { h, body } = await mountInBody();
    try {
      const trigger = await openCommitDialog(h, body);
      const month = labelled(body, "Financial year-end month")!;
      const day = labelled(body, "Financial year-end day")!;
      await h.act(() => setFieldValue(month, "2"));
      await h.act(() => setFieldValue(day, "31"));
      await settleUntil(h, () => /That day does not exist in the month you gave/.test(textOf(body)),
        "the field error", () => textOf(body));

      assert.equal((day.getAttribute as (a: string) => string | null)("aria-invalid"), "true",
        "the error is attached to the control it is about");
      assert.equal((month as { value?: string }).value, "2", "the draft survives the refusal…");
      assert.equal((day as { value?: string }).value, "31", "…both halves of it");

      const confirm = findIn(body, (n) => buttonNamed("Commit onboarding")(n) && (n as unknown) !== (trigger as unknown));
      assert.ok(confirm, "the dialog's own Confirm");
      assert.equal((confirm as { disabled?: boolean }).disabled, true,
        "a person who started typing a year end meant to record one — Confirm waits until it is a real day");
      assert.equal(calls.filter((c) => c.url.includes("/rpc/commit_client_onboarding")).length, 0,
        "and nothing was dispatched while it waited");
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC2 — Confirm sends the Field's month and day to clara.settle_client_onboarding_facts, beside the promotion", async () => {
  await withFetch(baseRouter([FYE_ITEM, OPENING_ITEM]), async (calls) => {
    const { h, body } = await mountInBody();
    try {
      const trigger = await openCommitDialog(h, body);
      await h.act(() => setFieldValue(labelled(body, "Financial year-end day")!, "30"));
      const confirm = findIn(body, (n) => buttonNamed("Commit onboarding")(n) && (n as unknown) !== (trigger as unknown))!;
      await h.act(() => clickButton(confirm));
      await settleUntil(h, () => calls.some((c) => c.url.includes("/rpc/settle_client_onboarding_facts")),
        "the settle door call", () => textOf(body));

      const settle = calls.find((c) => c.url.includes("/rpc/settle_client_onboarding_facts"))!;
      const b = settle.body as Record<string, unknown>;
      assert.deepEqual(
        Object.keys(b).sort(),
        ["p_fy_end_day", "p_fy_end_month", "p_op_key", "p_plan"],
        "exactly the four parameters clara.settle_client_onboarding_facts declares",
      );
      assert.equal(b.p_plan, PLAN_ID);
      assert.equal(b.p_fy_end_day, 30);
      assert.equal(b.p_fy_end_month, null,
        "a blank month means 'use the plan's own recorded answer' — this form never echoes the plan back at the door");

      const order = calls.map((c) => c.url);
      assert.ok(
        order.findIndex((u) => u.includes("commit_client_onboarding")) < order.findIndex((u) => u.includes("settle_client_onboarding_facts")),
        "the settle FOLLOWS the commit — the door refuses an open plan",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC2 — a BLANK fy-end pair commits and calls the settle door NOT AT ALL", async () => {
  await withFetch(baseRouter([FYE_ITEM, OPENING_ITEM]), async (calls) => {
    const { h, body } = await mountInBody();
    try {
      const trigger = await openCommitDialog(h, body);
      const confirm = findIn(body, (n) => buttonNamed("Commit onboarding")(n) && (n as unknown) !== (trigger as unknown))!;
      assert.equal((confirm as { disabled?: boolean }).disabled, false, "a blank pair does not block the ceremony");
      await h.act(() => clickButton(confirm));
      await settleUntil(h, () => calls.some((c) => c.url.includes("/rpc/commit_client_onboarding")), "the commit");
      for (let i = 0; i < 8; i++) await h.settle();
      assert.equal(calls.filter((c) => c.url.includes("/rpc/settle_client_onboarding_facts")).length, 0,
        "sending no day would meet CLR10 fy_end_day_required — a refusal this surface manufactured for a value nobody gave");
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC2 — the settle door's CLR38 renders VERBATIM with its code: a refused year-end write is never a settled onboarding", async () => {
  const router = baseRouter([FYE_ITEM, OPENING_ITEM], (url) =>
    url.includes("/rpc/settle_client_onboarding_facts")
      ? json({
        code: "CLR38",
        message: "this client has a live ANNUAL-cadence adjustment template (Year-end stock); retire it before moving the financial-year end, then propose and sign it again against the new one",
        details: '{"reason":"fy_end_locked_by_annual_cadence","axis":"adjustment_template"}',
      }, 400)
      : null);
  await withFetch(router, async (calls) => {
    const { h, body } = await mountInBody();
    try {
      const trigger = await openCommitDialog(h, body);
      await h.act(() => setFieldValue(labelled(body, "Financial year-end day")!, "30"));
      const confirm = findIn(body, (n) => buttonNamed("Commit onboarding")(n) && (n as unknown) !== (trigger as unknown))!;
      await h.act(() => clickButton(confirm));
      await settleUntil(h, () => /CLR38/.test(textOf(body)), "the CLR38 banner", () => textOf(body));

      const text = textOf(body);
      assert.match(text, /CLR38/, "the code renders");
      assert.match(text, /fy_end_locked_by_annual_cadence/, "…with its reason token");
      assert.match(text, /retire it before moving the financial-year end/,
        "and the database's own message, verbatim — never re-worded");
      assert.equal(calls.filter((c) => c.url.includes("/rpc/settle_client_onboarding_facts")).length, 1,
        "a refusal is never retried");
    } finally {
      await h.unmount();
    }
  });
});

test("649 · H-50 — a settle refusal AFTER a successful commit still announces CLIENT_RECORD_CHANGED exactly once: the commit already changed the record", async () => {
  // THE INVARIANT THIS CELL OWNS. `clientRecordChanged` is the ONLY re-read trigger the surfaces
  // in the other React subtree have — `client-workspace-overview.tsx` (the identity band, mounted
  // beside this card on the very same page) and `client-register-list.tsx` both say so in their
  // own comments: nothing there could know to re-read. The existing H-50 cell
  // (`onboarding-checklist.test.tsx`) pins "a SUCCESSFUL commit announces once, a REFUSED one
  // announces nothing" — and a settle refusal is NOT a refused commit. The client is already
  // `status='active'` and the plan already committed by the time the settle door is called, so an
  // announcement withheld here leaves the band showing "Onboarding" for a client the database
  // calls active, with no trigger left that could correct it.
  const router = baseRouter([FYE_ITEM, OPENING_ITEM], (url) =>
    url.includes("/rpc/settle_client_onboarding_facts")
      ? json({
        code: "CLR38",
        message: "this client has a live ANNUAL-cadence adjustment template (Year-end stock); retire it before moving the financial-year end, then propose and sign it again against the new one",
        details: '{"reason":"fy_end_locked_by_annual_cadence","axis":"adjustment_template"}',
      }, 400)
      : null);
  await withFetch(router, async (calls) => {
    const seen: string[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent<{ clientId: string }>).detail.clientId);
    window.addEventListener(CLIENT_RECORD_CHANGED_EVENT, listener);
    const { h, body } = await mountInBody();
    try {
      const trigger = await openCommitDialog(h, body);
      await h.act(() => setFieldValue(labelled(body, "Financial year-end day")!, "30"));
      const confirm = findIn(body, (n) => buttonNamed("Commit onboarding")(n) && (n as unknown) !== (trigger as unknown))!;
      await h.act(() => clickButton(confirm));
      await settleUntil(h, () => /CLR38/.test(textOf(body)), "the CLR38 banner", () => textOf(body));

      assert.equal(calls.filter((c) => c.url.includes("/rpc/commit_client_onboarding")).length, 1,
        "the commit itself SUCCEEDED — this cell is about what follows it");
      assert.deepEqual(seen, [CLIENT_ID],
        `the record changed, so it is announced exactly once even though the settle refused; saw ${JSON.stringify(seen)}`);
      // …and the refusal is still on screen: announcing is not the same as pretending it worked.
      assert.match(textOf(body), /fy_end_locked_by_annual_cadence/);
    } finally {
      window.removeEventListener(CLIENT_RECORD_CHANGED_EVENT, listener);
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// ---------------------------------------------------------------------------
// OnboardingItemRow's two write controls, re-composed.
// ---------------------------------------------------------------------------

test("649 · AC6 — the resolve control is a labelled Field with a description, and its four-parameter door call is unchanged", async () => {
  await withFetch(baseRouter([PENDING_BANKS, FYE_ITEM, OPENING_ITEM]), async (calls) => {
    const { h, body } = await mountInBody();
    try {
      const trigger = h.find(buttonNamed("Resolve"));
      assert.ok(trigger, "the resolve trigger");
      await h.fireEvent(trigger!, "click");
      await settleUntil(h, () => /Your resolution/.test(textOf(body)), "the resolve dialog", () => textOf(body));
      assert.match(textOf(body), /Recorded on the plan as this item's answer/, "the Field carries a description now");

      const textareas = findAllIn(body, (n) => n.tagName === "TEXTAREA");
      assert.equal(textareas.length, 1, "only the resolve dialog's own field is on screen");
      const field = textareas[0]!;
      // TOUCHED AND EMPTY IS INVALID; untouched is not.
      await h.act(() => setFieldValue(field, "x"));
      await h.act(() => setFieldValue(field, ""));
      await settleUntil(h, () => /Say how this item was settled/.test(textOf(body)), "the required error");
      assert.equal((field.getAttribute as (a: string) => string | null)("aria-invalid"), "true");

      await h.act(() => setFieldValue(field, "Maybank only"));
      // EVERY ROW CARRIES A "Resolve" TRIGGER and the open dialog's Confirm carries the SAME
      // label, so excluding ONE trigger by identity is not enough — `findIn` would simply return
      // the NEXT row's trigger and the cell would click a control that opens a second dialog
      // instead of performing the act (measured: it did, on this file's first cut). The dialog is
      // PORTALLED onto document.body, so the discriminating rule is structural: a Confirm is a
      // "Resolve" button that is NOT inside the mount root.
      const triggers = new Set(findAllIn(h.container as Stub, buttonNamed("Resolve")).map((n) => n as unknown));
      const confirm = findAllIn(body, buttonNamed("Resolve")).find((n) => !triggers.has(n as unknown));
      assert.ok(confirm, "the dialog's own Confirm, distinct from every row's trigger");
      await h.act(() => clickButton(confirm!));
      await settleUntil(h, () => calls.some((c) => c.url.includes("/rpc/resolve_onboarding_plan_item")), "the door call",
        () => `disabled=${String((confirm as { disabled?: boolean }).disabled)} value=${String((field as { value?: string }).value)}\n${textOf(body)}`);

      const door = calls.find((c) => c.url.includes("/rpc/resolve_onboarding_plan_item"))!;
      assert.deepEqual(
        Object.keys(door.body as Record<string, unknown>).sort(),
        ["p_item_key", "p_op_key", "p_plan", "p_resolution"],
        "the re-composition changed the LABELLING, never the governed call",
      );
      assert.equal((door.body as Record<string, unknown>).p_resolution, "Maybank only");
    } finally {
      await h.unmount();
    }
  });
});
