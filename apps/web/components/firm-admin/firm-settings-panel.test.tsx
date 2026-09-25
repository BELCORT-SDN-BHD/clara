// #635 (AC4) — THE REVOCATION LAYER, where it actually lives.
//
// The cards are presentational; the three door calls and the focus/visibility refresh belong to
// `FirmSettingsPanel`, so the cells that prove "a live demotion clears the figures rather than
// leaving them stale" have to mount the PANEL. (The card-level cells prove the other half: that a
// `denied` view renders nothing of a previous payload. Together they are the whole property.)
//
// WHAT IS DELIBERATELY NOT TESTED HERE: a poll. There is none. Re-reading `clara.caller_context`
// in a child to notice a demotion is exactly what P4-6 rules out, and it would make the surface
// trust a mirrored rank instead of the wall — so the only trigger is a re-issued DOOR CALL, whose
// CLR04 is the database's own answer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { FirmScopeProvider } from "../firm-scope-provider";
import { FirmSettingsPanelView, type FirmSettingsLoaders } from "./firm-settings-panel";
import { recentUsageMonths, resolveUsagePeriod } from "../../lib/firm/usage-period";
import { RefusalError } from "../../lib/wire";
import type { FirmCommercialState, FirmLegalStanding, FirmUsageRow, FirmUsageTable } from "../../lib/firm/commercial-reads";
import messages from "../../messages/en.json";

enableDomInspection();

const NOW = new Date("2026-09-19T04:30:00.000Z");

const SCOPE = {
  role_rank: 3,
  is_operator: false,
  firm_name: "Tan & Partners",
  role: "owner",
  firm_id: "aaaaaaaa-1111-4111-8111-111111111111",
  user_id: "11111111-1111-4111-8111-111111111111",
};

const STANDING: FirmLegalStanding = {
  documents: [
    {
      kind: "terms", version: 2, status: "published", title: "Terms of Service (Clara beta)",
      effectiveFrom: "2026-09-12T16:00:00.000Z", publishedAt: "2026-09-18T13:46:54.777Z",
      firmAccepted: true, acceptedAt: "2026-09-19T01:00:00.000Z",
      acceptedBy: SCOPE.user_id, acceptedByName: "Alice Tan",
      myAcceptedVersion: 2, myAcceptedAt: "2026-09-19T01:00:00.000Z",
    },
  ],
  standingLive: true,
  // #1008: `enforce` keeps this fixture rendering the copy it was written against.
  enforcementMode: "enforce",
  canAcceptForFirm: true,
  masked: false,
};

const COMMERCIAL: FirmCommercialState = {
  firm: { id: SCOPE.firm_id, name: "Tan & Partners", createdAt: "2026-01-02T00:00:00.000Z", isOperator: false },
  plan: { localKey: "clara-beta-2026", name: "Clara Beta", currency: "MYR", amountCents: 19900, amountsRuled: true },
  payment: { recorded: true, recordedAt: "2026-02-03T08:00:00.000Z", subscriptionPresent: true, customerPresent: true },
  invoices: { available: false, reason: "not_collected" },
  capacity: { docsPerDay: 250, pagesPerDay: 2500, ocrConcurrency: 3, llmWitnessConcurrency: 4, source: "firm_document_limits" },
};

const USAGE: FirmUsageRow[] = [
  { scope: "firm", callKind: "chat", calls: 12, inputTokens: 3_000_000, outputTokens: 400_000, pricedCalls: 12, unpricedCalls: 0, spendCents: 340, priceCurrency: "USD" },
];

function clr04(): RefusalError {
  return new RefusalError("CLR04", "insufficient role", {
    reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate",
  });
}

type Listeners = { focus: (() => void)[]; visibility: (() => void)[] };

/** THE STUB DOM HAS NO EVENT BUS. `test/hookHarness.ts`'s `window`/`document` carry no-op
 *  `addEventListener`s and no `dispatchEvent` at all, so the listeners this panel registers are
 *  RECORDED here and called directly. What the cell proves is therefore exactly what it can
 *  honestly prove: the panel registers a `focus` and a `visibilitychange` handler, and invoking
 *  one re-issues the governed reads. The BROWSER walk is where a real background-and-refocus is
 *  driven end to end. */
function recordListeners(): Listeners {
  const g = globalThis as unknown as {
    window: { addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void };
    document: { addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void };
  };
  const listeners: Listeners = { focus: [], visibility: [] };
  g.window.addEventListener = (type, fn) => { if (type === "focus") listeners.focus.push(fn); };
  g.window.removeEventListener = () => {};
  g.document.addEventListener = (type, fn) => { if (type === "visibilitychange") listeners.visibility.push(fn); };
  g.document.removeEventListener = () => {};
  return listeners;
}

async function mountPanel(loaders: FirmSettingsLoaders) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(FirmScopeProvider, {
        scope: SCOPE,
        children: createElement(FirmSettingsPanelView, {
          loaders,
          now: NOW,
          period: resolveUsagePeriod("2026-09", NOW),
          months: recentUsageMonths(NOW),
          onPeriodChange: () => {},
        }),
      }),
    }),
  );
  for (let i = 0; i < 4; i += 1) await h.settle();
  return h;
}

test("p635.web.panel_composition six cards plus the two pinned legacy ones, from four reads and no more (ticket 1050 added the sixth and the fourth)", async () => {
  let calls = 0;
  const h = await mountPanel({
    legalStanding: async () => { calls += 1; return STANDING; },
    commercialState: async () => { calls += 1; return COMMERCIAL; },
    aiUsage: async () => { calls += 1; return { rows: USAGE, dropped: 0 }; },
    // #1050 - the standing-instruction read. `null` is the legitimate state "this firm has
    // instructed nothing", which is what every cell here is about unless it says otherwise.
    standingInstruction: async () => { calls += 1; return null; },
  });
  try {
    const text = h.text();
    assert.match(text, /This firm/);
    assert.match(text, /Legal standing/);
    assert.match(text, /Plan and payment/);
    assert.match(text, /Model usage/);
    assert.match(text, /Processing capacity/);
    // THE TWO LEGACY CARDS, rendered from the untouched SettingsPanel and not re-typed.
    assert.match(text, /The Change-threshold control is retired/);
    assert.match(text, /grant_firm_capability and revoke_firm_capability are live/);
    assert.match(text, /Standing instructions to Clara/);
    assert.equal(calls, 4, "one read per door — capacity and the firm's created-at ride the commercial answer, and ticket 1050's standing instruction is its own relation");
    // ONE READ, THREE RENDERERS: the capacity numbers and the created-at both come from it.
    assert.match(text, /In Clara since/);
    assert.match(text, /2,500/, "the capacity card renders the same answer the plan card did");
  } finally { await h.unmount(); }
});

test("p635.web.revocation_clears a demotion mid-session clears the figures on the next focus, not on a poll", async () => {
  let demoted = false;
  const listeners = recordListeners();
  const h = await mountPanel({
    legalStanding: async () => STANDING,
    commercialState: async () => { if (demoted) throw clr04(); return COMMERCIAL; },
    aiUsage: async () => { if (demoted) throw clr04(); return { rows: USAGE, dropped: 0 }; },
    // #1050 - the standing-instruction read. `null` is the legitimate
    // state "this firm has instructed nothing", which is what every
    // cell below is about except the ones that say otherwise.
    standingInstruction: async () => null,
  });
  try {
    assert.match(h.text(), /MYR 199\.00/, "the figures are on screen");
    assert.match(h.text(), /USD 3\.40/);

    // NOTHING HAPPENS ON ITS OWN. The demotion lands in the database; no poll notices it, and
    // that is the design rather than a gap.
    demoted = true;
    for (let i = 0; i < 3; i += 1) await h.settle();
    assert.match(h.text(), /MYR 199\.00/,
      "a backgrounded, unfocused tab keeps its last payload — the NAMED residual, not a hidden one");

    // THE TAB COMES BACK. Both governed reads are re-issued and both answer CLR04.
    assert.equal(listeners.focus.length > 0, true, "the panel registers a window focus listener");
    assert.equal(listeners.visibility.length > 0, true, "…and a visibilitychange one");
    await h.act(() => { for (const fn of listeners.focus) fn(); });
    for (let i = 0; i < 4; i += 1) await h.settle();

    const text = h.text();
    assert.doesNotMatch(text, /MYR 199\.00/, "the plan figure is GONE, not greyed");
    assert.doesNotMatch(text, /Recorded on 03 Feb 2026/, "and so is the payment date");
    assert.doesNotMatch(text, /USD 3\.40/, "and so is the model spend");
    assert.doesNotMatch(text, /2,500/, "and so are the capacity numbers that rode the same answer");
    assert.match(text, /insufficient role/, "the database's own sentence is what replaces them");
  } finally { await h.unmount(); }
});

test("p635.web.panel_denied_at_low_rank the commercial and usage cards render the refusal, and the legal card still reads", async () => {
  const h = await mountPanel({
    legalStanding: async () => ({ ...STANDING, masked: true, canAcceptForFirm: false }),
    commercialState: async () => { throw clr04(); },
    aiUsage: async () => { throw clr04(); },
    // #1050 - the standing-instruction read. `null` is the legitimate
    // state "this firm has instructed nothing", which is what every
    // cell below is about except the ones that say otherwise.
    standingInstruction: async () => null,
  });
  try {
    const text = h.text();
    assert.match(text, /Legal standing/, "the standing door floors at VIEWER — everyone may know whether their firm's standing is live");
    assert.match(text, /An owner of this firm has accepted the current versions/);
    assert.doesNotMatch(text, /Clara Beta/, "the plan is admin+ and simply is not there");
    assert.doesNotMatch(text, /Download CSV/, "nor is anything to download");
    assert.match(text, /insufficient role/);
  } finally { await h.unmount(); }
});

test("p635.web.panel_failed_is_not_denied a transport failure offers a retry and never renders the CLR04 face", async () => {
  const h = await mountPanel({
    legalStanding: async () => STANDING,
    commercialState: async () => { throw new Error("fetch failed"); },
    aiUsage: async () => ({ rows: USAGE, dropped: 0 }),
    // #1050 - the standing-instruction read. `null` is the legitimate
    // state "this firm has instructed nothing", which is what every
    // cell below is about except the ones that say otherwise.
    standingInstruction: async () => null,
  });
  try {
    const text = h.text();
    assert.match(text, /This could not be read\./);
    assert.match(text, /Try again/);
    assert.doesNotMatch(text, /No payment is recorded for this firm/,
      "a failed read is not an absence: 'nobody paid' and 'we could not ask' are different answers");
  } finally { await h.unmount(); }
});

// ───────────────────────────────────────────────────────────────────────────
// FIX ROUND 1 — the PERIOD CHANGE (adversarial A2). The window label, the CSV
// provenance header and the filename all follow `period` immediately; the rows
// follow the door. Between the two there was a stretch where the table showed
// last month's rows under this month's window and offered to download them
// with this month's stamp on them.
// ───────────────────────────────────────────────────────────────────────────

function panelElement(loaders: FirmSettingsLoaders, month: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(FirmScopeProvider, {
      scope: SCOPE,
      children: createElement(FirmSettingsPanelView, {
        loaders,
        now: NOW,
        period: resolveUsagePeriod(month, NOW),
        months: recentUsageMonths(NOW),
        onPeriodChange: () => {},
      }),
    }),
  });
}

test("p635.web.usage_period_change a new window is never stamped on the previous month's rows", async () => {
  const SEPTEMBER: FirmUsageRow[] = [{ ...USAGE[0]!, callKind: "september_only_kind" }];
  const loaders: FirmSettingsLoaders = {
    legalStanding: async () => STANDING,
    commercialState: async () => COMMERCIAL,
    // AUGUST NEVER ANSWERS. That is the whole window this cell is about: the moment between the
    // period changing and the door coming back.
    aiUsage: async (period) =>
      period === "2026-09-01"
        ? { rows: SEPTEMBER, dropped: 0 }
        : new Promise<FirmUsageTable>(() => {}),
    // #1050 - the standing-instruction read. `null` is the legitimate
    // state "this firm has instructed nothing", which is what every
    // cell below is about except the ones that say otherwise.
    standingInstruction: async () => null,
  };

  const h = await renderComponent(panelElement(loaders, "2026-09"));
  try {
    for (let i = 0; i < 4; i += 1) await h.settle();
    assert.match(h.text(), /september_only_kind/, "September answered and is on screen");

    await h.rerender(panelElement(loaders, "2026-08"));
    for (let i = 0; i < 3; i += 1) await h.settle();

    const text = h.text();
    assert.match(text, /01 Aug 2026 to 31 Aug 2026/, "the window label followed the period, as it must");
    assert.doesNotMatch(text, /september_only_kind/,
      "…and the rows did NOT stay behind under it — a table read under the wrong window is a wrong table");
    assert.equal(
      h.find((n) => (n as Record<string, unknown>).tagName === "BUTTON" && /Download CSV/.test(String((n as { textContent?: string }).textContent ?? ""))) !== null,
      false,
      "there is nothing to download until the new month answers: the CSV's provenance header would otherwise carry a window its rows did not come from",
    );
  } finally { await h.unmount(); }
});

// #960 — THE CAP WRITE IS THE PANEL'S, AND SO IS THE RE-READ THAT FOLLOWS IT.
//
// The card is presentational (`processing-capacity-card.test.tsx` owns its own contract); what
// belongs here is the wiring: the panel hands the card a `save`, and whatever that save answers
// — accepted, refused, or unavailable — the commercial state is RE-READ. Hydrate-never-trust
// (`lib/doors.ts`'s own rule): the receipt is a report, and the figures on screen must come from
// the door that owns them, never from the write's own answer.
test("p960.web.save_rereads a cap save re-reads the commercial state, whatever the door answered", async () => {
  for (const outcome of [
    { kind: "set" as const, caps: { docsPerDay: 250, pagesPerDay: 3000, ocrConcurrency: 3, llmWitnessConcurrency: 4 },
      previous: { docsPerDay: 250, pagesPerDay: 2500, ocrConcurrency: 3, llmWitnessConcurrency: 4 },
      changed: ["pagesPerDay" as const], created: false },
    { kind: "refused" as const, code: "CLR10", reason: "cap_above_ceiling",
      message: "pages_per_day may not exceed the estate ceiling of 100000" },
  ]) {
    let commercialReads = 0;
    const sent: unknown[] = [];
    const h = await renderComponent(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        timeZone: "Asia/Kuala_Lumpur",
        children: createElement(FirmScopeProvider, {
          scope: SCOPE,
          children: createElement(FirmSettingsPanelView, {
            loaders: {
              legalStanding: async () => STANDING,
              commercialState: async () => { commercialReads += 1; return COMMERCIAL; },
              aiUsage: async () => ({ rows: USAGE, dropped: 0 }),
              // #1050 - the standing-instruction read. `null` is the legitimate
              // state "this firm has instructed nothing", which is what every
              // cell below is about except the ones that say otherwise.
              standingInstruction: async () => null,
            },
            setCaps: async (edits: unknown) => { sent.push(edits); return outcome; },
            now: NOW,
            period: resolveUsagePeriod("2026-09", NOW),
            months: recentUsageMonths(NOW),
            onPeriodChange: () => {},
          }),
        }),
      }),
    );
    for (let i = 0; i < 4; i += 1) await h.settle();
    try {
      assert.equal(commercialReads, 1, "one read on mount");
      const field = h.find((n) => n.tagName === "INPUT" && n.id === "firm-capacity-pages-per-day");
      assert.ok(field, "the owner sees the control");
      await h.act(() => { setFieldValue(field as Record<string, unknown>, "3000"); });
      const button = h.find((n) => n.tagName === "BUTTON" && /save processing caps/i.test(textOf(n)));
      await clickButton(button as Record<string, unknown>);
      for (let i = 0; i < 4; i += 1) await h.settle();

      assert.deepEqual(sent, [{ pagesPerDay: 3000 }], "only the cap the person moved");
      assert.equal(commercialReads, 2, `${outcome.kind}: the panel re-read the door that owns the figures`);
    } finally { await h.unmount(); }
  }
});
