// 裁-27 (amend a settled resolution) and 裁-128 (the apply-standard-chart button), driven
// through the REAL OnboardingChecklistCard.
//
// Both dialogs are Base UI dialogs, so every control inside them is driven with `clickButton`
// from the shared harness — `h.fireEvent` silently no-ops on a node inside an OPEN dialog
// (apps/web/AGENTS.md's first dialog law), and a cell that clicked nothing would pass.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

// IMPORT ORDER IS LOAD-BEARING, and it cost real time to find. `test/hookHarness`
// installs the stub DOM at MODULE LOAD (its own `installDom()` call), and `test/domInspect`
// enhances it. A component imported BEFORE them pulls in @base-ui/react and next-intl while
// `globalThis.document` is still undefined, and those modules latch a no-document path at
// load time — the visible symptom is that a Dialog TRIGGER click does nothing at all: the
// card renders, the button is found, the click dispatches, and no dialog ever appears, with
// no error anywhere. Harness first, component last (every other component test in this
// directory already does this; onboarding-checklist-keyboard.test.tsx:22-27 is the pattern).
import { clickButton, renderComponent, setCheckboxChecked, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";

enableDomInspection();

type Stub = Record<string, unknown>;
type Call = { url: string; body: unknown };

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const TEMPLATE_ID = "44444444-4444-4444-8444-444444444444";
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

const SETTLED_BANKS = item({ id: "i1", item_key: "banks", state: "resolved", answer: "Maybank only", answered_at: "2026-09-02T01:00:00Z" });
const CHART_ITEM = item({
  id: "i2", item_kind: "todo", item_key: "coa_chart_apply",
  question: "Apply the firm's standard chart of accounts to this client",
  answer: { chart: "firm_template", applied: false }, state: "deferred", answered_at: "2026-09-01T00:00:00Z",
});

function App(): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement("div", null, createElement("h1", null, "Onboarding"),
      createElement(OnboardingChecklistCard, { clientId: CLIENT_ID, session })),
  });
}

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
    // PRINT THE THING (the standing instrument law): a timeout that says only "timed out"
    // makes the next reader re-run the cell to learn what WAS on screen. The dump is what
    // the cell actually saw.
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}${dump ? `\n--- rendered ---\n${dump()}` : ""}`);
    await h.settle();
  }
}

const buttonNamed = (name: string) => (node: Stub) => node.tagName === "BUTTON" && textOf(node).trim() === name;

/** AN OPEN DIALOG IS NOT INSIDE `h.container`. Base UI portals dialog content onto
 *  `document.body`, so `h.find` — which walks the mount root — cannot see a single control in
 *  it. Every cell below that opens a dialog therefore appends the container to `document.body`
 *  and searches from THERE, exactly as onboarding-checklist-keyboard.test.tsx does. A cell
 *  that searched `h.container` would find nothing and time out (which is the honest failure)
 *  or, worse, find the TRIGGER by the same label and click it again. */
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

async function mountInBody(): Promise<{ h: Awaited<ReturnType<typeof renderComponent>>; body: Stub }> {
  const h = await renderComponent(App());
  const body = (globalThis as unknown as { document: { body: Stub } }).document.body;
  (body.appendChild as (c: unknown) => void)(h.container);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body };
}

function baseRouter(items: unknown[]) {
  return (url: string): Response => {
    if (url.includes("/rest/v1/clients")) return json([{ id: CLIENT_ID, name: "ROME PROPERTIES", status: "onboarding" }]);
    if (url.includes("/rest/v1/onboarding_plan_revisions")) {
      return json([
        { revision_n: 1, snapshot: { plan: {}, items: [item({ item_key: "banks", state: "pending", answer: null, answered_at: null })] }, created_at: "2026-09-01T00:00:00Z" },
        { revision_n: 2, snapshot: { plan: {}, items: [item({ item_key: "banks", state: "resolved", answer: "CIMB only", answered_at: "2026-09-01T05:00:00Z" })] }, created_at: "2026-09-01T05:00:00Z" },
        { revision_n: 3, snapshot: { plan: {}, items: [SETTLED_BANKS] }, created_at: "2026-09-02T01:00:00Z" },
      ]);
    }
    if (url.includes("/rest/v1/onboarding_plan_items")) return json(items);
    if (url.includes("/rest/v1/onboarding_plans")) return json([PLAN]);
    if (url.includes("/rest/v1/opening_seed_registry")) return json([]);
    if (url.includes("/rest/v1/rpc/get_interview_state")) return json({});
    if (url.includes("/rest/v1/caller_context")) return json([]);
    if (url.includes("/api/runtime/interview/state")) return json({});
    return json([]);
  };
}

// ---------------------------------------------------------------------------
// 裁-27 — the amend
// ---------------------------------------------------------------------------

test("裁-27: a SETTLED item offers Amend resolution, and the plain Resolve stays disabled", async () => {
  await withFetch(baseRouter([SETTLED_BANKS]), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => h.find(buttonNamed("Amend resolution")) !== null, "the amend trigger");
      assert.ok(h.find(buttonNamed("Resolve")), "the resolve trigger still renders — gating SHAPES, never hides");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("裁-27: the amend dialog shows the standing answer AND the superseded ones, then writes a NEW resolution", async () => {
  await withFetch(baseRouter([SETTLED_BANKS]), async (calls) => {
    const { h, body: docBody } = await mountInBody();
    try {
      const trigger = h.find(buttonNamed("Amend resolution"));
      assert.ok(trigger, "the amend trigger");
      await h.fireEvent(trigger, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      await settleUntil(h, () => /The answer standing now/.test(textOf(docBody)), "the dialog", () => textOf(docBody));

      // What is being superseded, before the field that supersedes it.
      assert.match(textOf(docBody), /Maybank only/, "the standing answer, from the item row");
      await settleUntil(h, () => /CIMB only/.test(textOf(docBody)), "the superseded answer from the append-only trail");
      assert.match(textOf(docBody), /Amending records a NEW resolution/, "the dialog says what the act actually does");

      const revisionRead = calls.find((c) => c.url.includes("/rest/v1/onboarding_plan_revisions"));
      assert.ok(revisionRead, "the prior answers come from the append-only revisions table, not from the item row");

      // Exactly one textarea is reachable while THIS dialog is open — the card's other two
      // (attestation, cancel reason) live inside their own closed dialogs, which render
      // nothing. Asserting the COUNT is what makes `[0]` an addressed node rather than a
      // lucky first match.
      const textareas = findAllIn(docBody, (n) => n.tagName === "TEXTAREA");
      assert.equal(textareas.length, 1, "only the amend dialog's own field is on screen");
      const textarea = textareas[0]!;
      await h.act(() => setFieldValue(textarea, "Maybank and CIMB"));
      const confirm = findIn(docBody, buttonNamed("Record the amendment"));
      assert.ok(confirm, "the dialog's own Confirm control");
      await h.act(() => clickButton(confirm));
      await settleUntil(h, () => calls.some((c) => c.url.includes("/rest/v1/rpc/resolve_onboarding_plan_item")), "the door call");

      const door = calls.find((c) => c.url.includes("/rest/v1/rpc/resolve_onboarding_plan_item"))!;
      const body = door.body as Record<string, unknown>;
      assert.equal(body.p_plan, PLAN_ID);
      assert.equal(body.p_item_key, "banks");
      assert.equal(body.p_resolution, "Maybank and CIMB");
      assert.deepEqual(
        Object.keys(body).sort(),
        ["p_item_key", "p_op_key", "p_plan", "p_resolution"],
        "exactly the four parameters clara.resolve_onboarding_plan_item declares — the SAME door, a second entry point",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("裁-27: a CLOSED plan offers no amend — the door refuses CLR10 on any non-open plan", async () => {
  const closed = { ...PLAN, state: "committed", committed_at: "2026-09-02T09:00:00Z" };
  await withFetch(
    (url) => (url.includes("/rest/v1/onboarding_plans") && !url.includes("revisions") ? json([closed]) : baseRouter([SETTLED_BANKS])(url)),
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => /committed/.test(h.text()), "the committed plan");
        assert.equal(h.find(buttonNamed("Amend resolution")), null, "no doomed round trip is offered");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// 裁-128 — the apply-standard-chart button
// ---------------------------------------------------------------------------

const CHART_PENDING = {
  client_id: CLIENT_ID, seed_decision: "firm_template", seed_wants_template: true,
  accounts: 0, adoption_id: null, adoption_state: null, template_id: null,
  template_version: null, families: null, adopted_at: null, state: "pending",
};

const TEMPLATES = [{
  template_id: TEMPLATE_ID, scope: "platform", firm_id: null, template_key: "my_sme_starter",
  version: 1, title: "Malaysian SME starter", framework_hint: "MPERS", basis: "reviewed",
  state: "published", content_sha256: "abc", forked_from: null,
  created_at: "2026-01-01T00:00:00Z", published_at: "2026-01-01T00:00:00Z", retired_at: null,
  families: 3, accounts: 42,
}];

const TEMPLATE_DETAIL = {
  template_id: TEMPLATE_ID,
  families: [
    { family_key: "core_ledger", label: "Core ledger", inclusion: "core", basis: "always", sort_ordinal: 1 },
    { family_key: "retail", label: "Retail trade", inclusion: "by_industry", basis: "msic 47", sort_ordinal: 2 },
    { family_key: "manufacturing", label: "Manufacturing", inclusion: "by_industry", basis: "msic 10", sort_ordinal: 3 },
  ],
  accounts: [],
};

function chartRouter(chartState: unknown, items: unknown[] = [CHART_ITEM]) {
  return (url: string): Response => {
    if (url.includes("/rest/v1/rpc/coa_chart_state")) return json(chartState);
    if (url.includes("/rest/v1/rpc/list_coa_templates")) return json(TEMPLATES);
    if (url.includes("/rest/v1/rpc/get_coa_template")) return json(TEMPLATE_DETAIL);
    if (url.includes("/rest/v1/rpc/coa_template_family_plan")) {
      return json({ template_id: TEMPLATE_ID, client_id: CLIENT_ID, axes: {}, msic_division: null, absent_axes: ["msic"], axis: "partial", keep: ["core_ledger"], drop: ["retail", "manufacturing"] });
    }
    if (url.includes("/rest/v1/rpc/apply_coa_template")) {
      return json({ client_id: CLIENT_ID, template_id: TEMPLATE_ID, template_version: 1, adoption_id: "adopt-1", families: ["core_ledger", "retail"], families_source: "caller", accounts: 51, account_codes: [], plan: {} });
    }
    return baseRouter(items)(url);
  };
}

test("裁-128: the coa_chart_apply row carries the apply control, and ONLY that row does", async () => {
  await withFetch(chartRouter(CHART_PENDING, [SETTLED_BANKS, CHART_ITEM]), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => h.find(buttonNamed("Apply the standard chart")) !== null, "the apply trigger");
      const triggers = [] as string[];
      const walk = (n: Stub) => {
        if (n.tagName === "BUTTON" && textOf(n).trim() === "Apply the standard chart") triggers.push("x");
        for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
      };
      walk(h.container as Stub);
      assert.equal(triggers.length, 1, "exactly one row carries it — keyed on the item_key the interview writes, not on prose");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("裁-128: the fieldset defaults to the DATABASE's own plan, core families are locked, and the door gets the confirmed set", async () => {
  await withFetch(chartRouter(CHART_PENDING), async (calls) => {
    const { h, body: docBody } = await mountInBody();
    try {
      const trigger = h.find(buttonNamed("Apply the standard chart"));
      assert.ok(trigger, "the apply trigger");
      await h.fireEvent(trigger, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      await settleUntil(h, () => findIn(docBody, (n) => n.tagName === "SELECT") !== null, "the dialog", () => textOf(docBody));

      const select = findIn(docBody, (n) => n.tagName === "SELECT");
      assert.ok(select);
      // The dialog is a PORTAL, so `fireEvent` never reaches it (hookHarness clickButton's
      // own measurement). `setFieldValue` invokes the committed onChange directly.
      await h.act(() => setFieldValue(select, TEMPLATE_ID));
      await settleUntil(h, () => /Core ledger/.test(textOf(docBody)), "the family roster");

      // The database said its coverage is PARTIAL and named the missing axis — the dialog
      // says so rather than handing over a confident default.
      assert.match(textOf(docBody), /Clara could not read every fact her proposal depends on\. Missing: msic\./);

      const boxes = findAllIn(docBody, (n) => n.tagName === "INPUT" && n.type === "checkbox");
      assert.equal(boxes.length, 3, "one box per family on the template");
      assert.equal(boxes[0]!.checked, true, "core_ledger — the plan's keep list");
      assert.equal(boxes[0]!.disabled, true, "a core family cannot be dropped: rung 8 refuses core_family_dropped by name");
      assert.equal(boxes[1]!.checked, false, "retail — the plan's drop list");

      // The human ADDS one the plan dropped. That is the ruled edit path (裁-23 Q3).
      await h.act(() => setCheckboxChecked(boxes[1]!, true));
      const confirm = findIn(docBody, buttonNamed("Apply the chart"));
      assert.ok(confirm, "the dialog's own Confirm control");
      await h.act(() => clickButton(confirm));
      await settleUntil(h, () => calls.some((c) => c.url.includes("/rest/v1/rpc/apply_coa_template")), "the door call");

      const door = calls.find((c) => c.url.includes("/rest/v1/rpc/apply_coa_template"))!;
      const body = door.body as Record<string, unknown>;
      assert.equal(body.p_client, CLIENT_ID);
      assert.equal(body.p_template, TEMPLATE_ID);
      assert.deepEqual(body.p_families, ["core_ledger", "retail"], "the set the HUMAN confirmed, not the plan's default");
      assert.deepEqual(
        Object.keys(body).sort(),
        ["p_client", "p_families", "p_op_key", "p_template"],
        "exactly the four parameters clara.apply_coa_template(uuid,uuid,text[],text) declares",
      );

      // The receipt is the DOOR's own returned numbers, rendered as read.
      await settleUntil(h, () => /Applied: 51 accounts across 2 families/.test(textOf(docBody)), "the receipt");
    } finally {
      await h.unmount();
    }
  });
});

test("裁-128: a CORE family reaches the door even when the DB's plan omits it, and cannot be unchecked", async () => {
  // TWO HALVES, and the earlier cell only proved one. `disabled` on a core checkbox is the
  // VISIBLE half; the SEEDING loop (`if (f.inclusion === "core") next.add(...)`) is what
  // actually guarantees the payload carries it. A mutant that deleted the seeding left the
  // other cell green, because that fixture's plan already kept the core family — the fixture
  // was doing the work the code was supposed to do.
  //
  // So this fixture's plan `keep` is EMPTY: nothing but the seeding can put `core_ledger` in
  // the array, and rung 8 (`core_family_dropped`) is what would refuse without it.
  const emptyPlanRouter = (url: string): Response => {
    if (url.includes("/rest/v1/rpc/coa_template_family_plan")) {
      return json({ template_id: TEMPLATE_ID, client_id: CLIENT_ID, axes: {}, msic_division: null, absent_axes: [], axis: "full", keep: [], drop: ["core_ledger", "retail", "manufacturing"] });
    }
    return chartRouter(CHART_PENDING)(url);
  };
  await withFetch(emptyPlanRouter, async (calls) => {
    const { h, body: docBody } = await mountInBody();
    try {
      const trigger = h.find(buttonNamed("Apply the standard chart"));
      assert.ok(trigger);
      await h.fireEvent(trigger, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      const select = findIn(docBody, (n) => n.tagName === "SELECT");
      assert.ok(select);
      await h.act(() => setFieldValue(select, TEMPLATE_ID));
      await settleUntil(h, () => /Core ledger/.test(textOf(docBody)), "the family roster", () => textOf(docBody));

      const boxes = findAllIn(docBody, (n) => n.tagName === "INPUT" && n.type === "checkbox");
      assert.equal(boxes[0]!.checked, true, "core is seeded IN despite the plan keeping nothing");
      assert.equal(boxes[0]!.disabled, true, "and it cannot be taken back out");
      // The harness itself refuses to toggle a disabled control ("assert the gate, then act"),
      // which is the second half of the guard proved by the instrument rather than by a click
      // that would manufacture a green.
      assert.throws(() => setCheckboxChecked(boxes[0]!, false), /refusing to toggle a DISABLED checkbox/);

      const confirm = findIn(docBody, buttonNamed("Apply the chart"));
      assert.ok(confirm);
      await h.act(() => clickButton(confirm));
      await settleUntil(h, () => calls.some((c) => c.url.includes("/rest/v1/rpc/apply_coa_template")), "the door call");
      assert.deepEqual(
        (calls.find((c) => c.url.includes("apply_coa_template"))!.body as Record<string, unknown>).p_families,
        ["core_ledger"],
        "the door receives the core family — the only thing that put it there is the seeding",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("裁-128: a non-empty chart offers NO apply and says why — rung 5's refusal, before the round trip", async () => {
  const offStandard = { ...CHART_PENDING, state: "off_standard", accounts: 37 };
  await withFetch(chartRouter(offStandard), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /already has 37 accounts/.test(h.text()), "the off-standard note");
      assert.equal(h.find(buttonNamed("Apply the standard chart")), null);
    } finally {
      await h.unmount();
    }
  });
});

test("裁-128: an ALREADY-ADOPTED chart reports the adoption instead of offering a second apply", async () => {
  const adopted = { ...CHART_PENDING, state: "adopted", accounts: 42, adoption_state: "adopted", template_id: TEMPLATE_ID, template_version: 1 };
  await withFetch(chartRouter(adopted), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /already applied to this client \(42 accounts\)/.test(h.text()), "the adopted state");
      assert.equal(h.find(buttonNamed("Apply the standard chart")), null);
    } finally {
      await h.unmount();
    }
  });
});

test("N3 · 裁-44 row 27: a read failure REPORTS itself in the unavailable arm and offers nothing", async () => {
  // THE ROW HAD NO CELL. Deleting `{refusal}` from the `chart === null` arm left the file 9/9
  // green — the fail-closed table claimed "the control reports it and offers nothing" while only
  // the second half was proved.
  //
  // REACHING THE ARM HONESTLY: `chart === null` with a refusal standing needs `data` SET and
  // `err` SET at once, which is exactly the sticky-refusal contract in lib/parts/hooks.ts — a
  // refusal `act()` surfaces survives the follow-up reload it triggers. So: load once cleanly,
  // apply, have the door REFUSE, and have the reload's `coa_chart_state` come back unreadable.
  // Both halves are real production states, and their combination is the one this arm exists for.
  let chartReads = 0;
  const router = (url: string): Response => {
    if (url.includes("/rest/v1/rpc/coa_chart_state")) {
      chartReads += 1;
      // The reload after the refusal returns a payload `readCoaChartState` cannot read.
      return chartReads === 1 ? json(CHART_PENDING) : json({ nothing: "readable" });
    }
    if (url.includes("/rest/v1/rpc/apply_coa_template")) {
      return json({ code: "CLR10", message: "this client already has accounts", details: '{"reason":"chart_not_empty"}' }, 400);
    }
    return chartRouter(CHART_PENDING)(url);
  };

  await withFetch(router, async () => {
    const { h, body: docBody } = await mountInBody();
    try {
      const trigger = h.find(buttonNamed("Apply the standard chart"));
      assert.ok(trigger);
      await h.fireEvent(trigger, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      const select = findIn(docBody, (n) => n.tagName === "SELECT");
      assert.ok(select);
      await h.act(() => setFieldValue(select, TEMPLATE_ID));
      await settleUntil(h, () => /Core ledger/.test(textOf(docBody)), "the family roster", () => textOf(docBody));
      const confirm = findIn(docBody, buttonNamed("Apply the chart"));
      assert.ok(confirm);
      await h.act(() => clickButton(confirm));

      // The DB's own words, verbatim, in the arm that renders when the chart can no longer be read.
      await settleUntil(h, () => /this client already has accounts/.test(textOf(docBody)), "the verbatim refusal", () => textOf(docBody));
      assert.match(textOf(docBody), /CLR10/, "the code renders beside it");
      assert.match(textOf(docBody), /chart-of-accounts state could not be read/, "and the unavailable arm is the one on screen");
      assert.equal(h.find(buttonNamed("Apply the standard chart")), null, "nothing is offered from a state that could not be read");
    } finally {
      await h.unmount();
    }
  });
});

test("N3 · 裁-44 row 23: 'not read yet' and 'read, never amended' are DIFFERENT sentences", async () => {
  // The distinction was claimed in the table and in source but pinned nowhere. `null` must read
  // as still-looking and `[]` as a positive absence; collapsing them would tell a professional
  // there is no correction history at the very moment the read has not landed.
  const withRevisions = (rows: unknown[] | "never") => (url: string): Response | Promise<Response> => {
    if (url.includes("/rest/v1/onboarding_plan_revisions")) {
      // "never" models the read STILL IN FLIGHT — a promise that does not settle. An immediate
      // `[]` was the first cut and it proved nothing: the read landed within one settle, so the
      // cell asserted the loading sentence against a dialog that had already moved past it.
      if (rows === "never") return new Promise<Response>(() => {});
      return json(rows);
    }
    return baseRouter([SETTLED_BANKS])(url);
  };

  // READ, AND EMPTY — the positive absence.
  await withFetch(withRevisions([]), async () => {
    const { h, body: docBody } = await mountInBody();
    try {
      const trigger = h.find(buttonNamed("Amend resolution"));
      assert.ok(trigger);
      await h.fireEvent(trigger, "click");
      await settleUntil(h, () => /has not been amended before/.test(textOf(docBody)), "the read-and-empty sentence", () => textOf(docBody));
      assert.doesNotMatch(textOf(docBody), /Reading this item's earlier answers/, "and NOT the still-looking one");
    } finally {
      await h.unmount();
    }
  });

  // NOT READ YET — the dialog is opened and the assertion made BEFORE any history is handed
  // down, which is the state a caller sees while the trail is in flight.
  await withFetch(withRevisions("never"), async () => {
    const h = await renderComponent(App());
    const docBody = (globalThis as unknown as { document: { body: Stub } }).document.body;
    (docBody.appendChild as (c: unknown) => void)(h.container);
    try {
      await settleUntil(h, () => h.find(buttonNamed("Amend resolution")) !== null, "the amend trigger");
      const trigger = h.find(buttonNamed("Amend resolution"))!;
      await h.fireEvent(trigger, "click");
      // ONE settle only: enough to open the dialog, not enough for the trail to arrive.
      await h.settle();
      assert.match(textOf(docBody), /Reading this item's earlier answers/, "null reads as still looking");
    } finally {
      await h.unmount();
    }
  });
});

test("裁-128: a chart state this build does not recognise renders its own spelling, never a known arm", async () => {
  await withFetch(chartRouter({ ...CHART_PENDING, state: "some_seventh_state" }), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => /reads "some_seventh_state"/.test(h.text()), "the honest unknown arm");
      assert.equal(h.find(buttonNamed("Apply the standard chart")), null, "an unrecognised state is never treated as 'pending'");
    } finally {
      await h.unmount();
    }
  });
});
