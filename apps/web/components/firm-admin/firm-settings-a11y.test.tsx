// #635 — `/settings/firm`'s page composition, scanned at four ranks.
//
// THIS IS WHERE AXE BELONGS FOR THIS SLICE, and the card-level files say so: a card mounted ALONE
// starts at h2 with no h1 above it, which the heading-order rule correctly reports as a defect OF
// THE MOUNT. Here the shadow mounts the SAME composition `app/(firm)/settings/firm/page.tsx`
// renders — the real `PageHeader`'s own h1 and the real `FirmSettingsPanelView` — so heading
// order, labels and names can be judged honestly.
//
// WHY A SHADOW AND NOT THE ROUTE: `firm-admin-pages-a11y.test.tsx`'s own header records the
// environment gap (every page.tsx is an async Server Component calling `getTranslations`, which
// this bare `node --test` harness resolves to next-intl's react-client build and which throws).
// The shadow uses the client hook over the SAME keys; the DOM the two produce is identical.
//
// THE FOUR RANKS ARE RENDERED AS THE DOORS ANSWER THEM, not as a mirrored rank: below admin the
// commercial and usage doors REFUSE, so those views are `denied` and their cards carry the
// database's own sentence. That is what a bookkeeper actually sees.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { useTranslations } from "next-intl";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements } from "../../test/keyboardWalk";
import { FirmScopeProvider } from "../firm-scope-provider";
import { PageHeader, PageShell } from "../common/page-shell";
import { FirmSettingsPanelView, type FirmSettingsLoaders } from "./firm-settings-panel";
import { recentUsageMonths, resolveUsagePeriod } from "../../lib/firm/usage-period";
import { RefusalError } from "../../lib/wire";
import type { FirmCommercialState, FirmLegalStanding, FirmUsageRow } from "../../lib/firm/commercial-reads";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const NOW = new Date("2026-09-19T04:30:00.000Z");

const RANKS = [
  { role: "viewer", rank: 0, admin: false, masked: true },
  { role: "bookkeeper", rank: 1, admin: false, masked: false },
  { role: "admin", rank: 2, admin: true, masked: false },
  { role: "owner", rank: 3, admin: true, masked: false },
] as const;

function standing(masked: boolean): FirmLegalStanding {
  return {
    documents: [
      {
        kind: "terms", version: 2, status: "published", title: "Terms of Service (Clara beta)",
        effectiveFrom: "2026-09-12T16:00:00.000Z", publishedAt: "2026-09-18T13:46:54.777Z",
        firmAccepted: true,
        acceptedAt: masked ? null : "2026-09-19T01:00:00.000Z",
        acceptedBy: masked ? null : "11111111-1111-4111-8111-111111111111",
        acceptedByName: masked ? null : "Alice Tan",
        myAcceptedVersion: null, myAcceptedAt: null,
      },
      {
        kind: "dpa", version: 1, status: "published", title: "Data processing agreement",
        effectiveFrom: "2026-08-30T16:00:00.000Z", publishedAt: "2026-09-18T13:46:54.777Z",
        firmAccepted: false, acceptedAt: null, acceptedBy: null, acceptedByName: null,
        myAcceptedVersion: null, myAcceptedAt: null,
      },
    ],
    standingLive: false,
    // #1008: `enforce` keeps this fixture rendering the copy it was written against.
    enforcementMode: "enforce",
    canAcceptForFirm: false,
    masked,
  };
}

const COMMERCIAL: FirmCommercialState = {
  firm: { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Tan & Partners", createdAt: "2026-01-02T00:00:00.000Z", isOperator: false },
  plan: { localKey: "clara-beta-2026", name: "Clara Beta", currency: "MYR", amountCents: 0, amountsRuled: false },
  payment: { recorded: false, recordedAt: null, subscriptionPresent: false, customerPresent: false },
  invoices: { available: false, reason: "not_collected" },
  capacity: { docsPerDay: 100, pagesPerDay: 1000, ocrConcurrency: 2, llmWitnessConcurrency: 2, source: "firm_document_limits" },
};

const USAGE: FirmUsageRow[] = [
  { scope: "firm", callKind: "chat", calls: 12, inputTokens: 3_000_000, outputTokens: 400_000, pricedCalls: 10, unpricedCalls: 2, spendCents: 340, priceCurrency: "USD" },
  { scope: "platform", callKind: "reporting", calls: 4, inputTokens: 100_000, outputTokens: 20_000, pricedCalls: 4, unpricedCalls: 0, spendCents: 90, priceCurrency: "USD" },
];

function clr04(): RefusalError {
  return new RefusalError("CLR04", "insufficient role", {
    reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate",
  });
}

function loadersFor(admin: boolean, masked: boolean): FirmSettingsLoaders {
  return {
    legalStanding: async () => standing(masked),
    commercialState: async () => { if (!admin) throw clr04(); return COMMERCIAL; },
    aiUsage: async () => { if (!admin) throw clr04(); return { rows: USAGE, dropped: 0 }; },
    // #1050 - the standing-instruction read. `null` is the legitimate
    // state "this firm has instructed nothing", which is what every
    // cell below is about except the ones that say otherwise.
    standingInstruction: async () => null,
  };
}

function Shadow({ loaders }: { loaders: FirmSettingsLoaders }) {
  const t = useTranslations("FirmAdminCompliance.settings");
  return createElement(
    PageShell,
    null,
    createElement(PageHeader, { title: t("pageHeading"), description: t("pageDescription") }),
    createElement(FirmSettingsPanelView, {
      loaders,
      now: NOW,
      period: resolveUsagePeriod("2026-09", NOW),
      months: recentUsageMonths(NOW),
      onPeriodChange: () => {},
    }),
  );
}

async function mountAt(rank: number, role: string, loaders: FirmSettingsLoaders) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(FirmScopeProvider, {
        scope: {
          role_rank: rank, is_operator: false, firm_name: "Tan & Partners",
          role, firm_id: "aaaaaaaa-1111-4111-8111-111111111111",
          user_id: "11111111-1111-4111-8111-111111111111",
        },
        children: createElement(Shadow, { loaders }),
      }),
    }),
  );
  for (let i = 0; i < 4; i += 1) await h.settle();
  return h;
}

for (const { role, rank, admin, masked } of RANKS) {
  test(`p635.web.a11y_${role} /settings/firm scans clean at ${role}, with both pinned legacy cards present`, async () => {
    const h = await mountAt(rank, role, loadersFor(admin, masked));
    try {
      const text = textOf(h.container as never);
      // THE PAGE'S OWN h1 IS UNCHANGED — `e2e/shell-migration-walk.spec.ts:133` pins it.
      assert.match(text, /Firm settings/);
      // THE TWO LEGACY CARDS, at EVERY rank, byte-identical to what `SettingsPanel` has always
      // rendered (`firm-admin-pages-a11y.test.tsx:253-263` and
      // `e2e/firm-navigation-walk.spec.ts:189-190` pin both sentences).
      assert.match(text, /The Change-threshold control is retired/, `${role}: the approvals note survives`);
      assert.match(text, /grant_firm_capability and revoke_firm_capability are live/, `${role}: and the capabilities note`);
      // And no threshold control came back with the new cards.
      assert.doesNotMatch(text, /Change threshold/);
      assert.doesNotMatch(text, /RM ?[\d,]+\.\d\d/, `${role}: no money figure may render — the beta plan is UNRULED`);

      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations, [], `${role}: ${JSON.stringify(violations)}`);
    } finally { await h.unmount(); }
  });
}

test("p635.web.rank_shaping the commercial and usage cards are ABSENT of content below admin, and present above it", async () => {
  const below = await mountAt(1, "bookkeeper", loadersFor(false, false));
  try {
    const text = textOf(below.container as never);
    assert.match(text, /Legal standing/, "the standing door floors at VIEWER, so every member sees it");
    assert.doesNotMatch(text, /Clara Beta/, "the plan is not rendered to a bookkeeper");
    assert.doesNotMatch(text, /Download CSV/, "nor is a CSV action over figures they cannot read");
    assert.doesNotMatch(text, /Documents per day/, "nor the capacity numbers, which ride the same admin-floored answer");
    assert.match(text, /insufficient role/, "what they get instead is the database's own sentence");
  } finally { await below.unmount(); }

  const above = await mountAt(2, "admin", loadersFor(true, false));
  try {
    const text = textOf(above.container as never);
    assert.match(text, /Clara Beta/);
    assert.match(text, /Download CSV/);
    assert.match(text, /Documents per day/);
  } finally { await above.unmount(); }
});

test("p635.web.keyboard every control on the page is reachable, in DOM order, with no positive tabindex", async () => {
  const h = await mountAt(3, "owner", loadersFor(true, false));
  try {
    const focusables = focusableElements(h.container as never);
    assert.ok(focusables.length >= 5, `expected the links, the month select and the CSV action; got ${focusables.length}`);
    for (const node of focusables) {
      const attrs = ((node as Stub).attributes ?? {}) as Record<string, unknown>;
      const tabindex = Number(attrs.tabindex ?? (node as Stub).tabIndex ?? 0);
      assert.equal(tabindex > 0, false, "a positive tabindex would re-order the page against its own DOM");
    }
    // The month chooser is a real <select>, so it is keyboard-operable without a listbox dance.
    assert.ok(focusables.some((n) => (n as Stub).tagName === "SELECT"), "the period control takes a tab stop");
  } finally { await h.unmount(); }
});
