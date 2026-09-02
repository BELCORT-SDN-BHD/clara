// GATE (b) — page-level a11y scan for T10's routes (N7, independent review,
// 2026-08-28): the panels had a11y coverage; the PAGES (PageHeader's own h1 +
// description) and the /admin hub (its five route-card links) did not.
//
// WHY THIS DOES NOT IMPORT app/(firm)/admin/page.tsx DIRECTLY (a genuine
// environment gap, not unique to T10 — probed and confirmed, 2026-08-28):
// every page.tsx in this app is an async Server Component calling
// `getTranslations` from `next-intl/server`. Outside a real Next.js RSC
// runtime, this bare `node --test` harness resolves that import to
// next-intl's REACT-CLIENT build (no "react-server" condition here), whose
// `getTranslations` throws unconditionally: "`getTranslations` is not
// supported in Client Components." No page.tsx anywhere in apps/web has ever
// been rendered end-to-end in this test suite for that reason — grep finds
// zero precedent. The three tests below instead mount a `"use client"` shadow
// of each page's own composition, built from the SAME real components
// (`PageShell`, `PageHeader`, `Link`, `buttonVariants`, the real panels) and
// the SAME i18n keys the real page.tsx files read — via `useTranslations`
// (the client hook) rather than `getTranslations` (the server call the
// harness cannot run). The DOM these two mechanisms produce is identical;
// only the translation-fetch MECHANISM differs, which a11y scanning and
// heading-order checks do not observe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { useTranslations, NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { activeElement, enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk, focusableElements } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { AdminHubView } from "../admin/admin-hub";
import { PageHeader, PageShell } from "../common/page-shell";
import { ComplianceRegisterPanel } from "./compliance-register-panel";
import { VendorBindingsPanel } from "./vendor-bindings-panel";
import { SettingsPanel } from "./settings-panel";
import messages from "../../messages/en.json";

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

function withMessages(children: unknown) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: children as never });
}

// --- shadow of app/(firm)/admin/page.tsx ------------------------------------

function AdminPageShadow() {
  const t = useTranslations("Admin");
  return createElement(
    PageShell,
    null,
    createElement(PageHeader, { title: t("heading"), description: t("body") }),
    createElement(AdminHubView, { scope: { role_rank: 3, is_operator: true } }),
  );
}

test("AdminPage's own composition has ordered headings and named links for every visible admin surface", async () => {
  const h = await renderComponent(withMessages(createElement(AdminPageShadow)));
  try {
    const bodyText = textOf(h.container as never);
    assert.match(bodyText, /Members/, "the hub link to /admin/members must render with its real label");
    assert.match(bodyText, /Compliance register/, "the hub link to /admin/compliance must render with its real label");
    assert.match(bodyText, /Vendor identity bindings/, "the hub link to /admin/vendor-bindings must render with its real label");
    assert.match(bodyText, /Firm registrations/, "the hub link to /admin/registrations must render with its real label");
    assert.match(bodyText, /Firm settings/, "the hub link to /admin/settings must render with its real label");
    assert.match(bodyText, /post-beta Billing PR-1\/PR-2 lane/, "the hub must name the lane for its unbuilt billing surfaces");
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

test("Admin hub keyboard walk reaches every visible card link in DOM order", async () => {
  const h = await renderComponent(withMessages(createElement(AdminPageShadow)));
  try {
    const links = focusableElements(h.container as never).filter(
      (node) => (node as { tagName?: string }).tagName === "A",
    );
    assert.equal(links.length, 5, "the operator owner hub exposes all five built admin destinations");
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
    for (const link of links) {
      (link as { focus: () => void }).focus();
      assert.equal(activeElement(), link, "keyboard focus must reach each admin card link");
    }
  } finally {
    await h.unmount();
  }
});

// --- shadow of app/(firm)/admin/compliance/page.tsx -------------------------

function AdminCompliancePageShadow() {
  const t = useTranslations("FirmAdminCompliance.compliance");
  return createElement(
    PageShell,
    null,
    createElement(PageHeader, { title: t("heading"), description: t("pageDescription") }),
    createElement(ComplianceRegisterPanel),
  );
}

const CLIENTS = [{ id: "c1", name: "Acme Sdn Bhd", status: "active", created_at: "2026-01-01T00:00:00Z" }];
const REGISTER_ENVELOPE = {
  watermark: "w1",
  counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [],
  next_cursor: null,
  compliance: {
    stale_evaluator: false,
    clients: [
      {
        client_id: "c1", service_group: "digital_services", state: "crossed",
        confirmed_included_cents: 50000000, unknown_or_mixed_cents: 0, screening_proxy_cents: 500000,
        earliest_crossing_month: "2026-07-01", application_due: "2026-08-28", future_method_status: "attested_below",
      },
    ],
  },
};

test("/admin/compliance page composition (PageHeader + the real ComplianceRegisterPanel) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_review_queue")) return jsonResponse(REGISTER_ENVELOPE);
      if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withMessages(createElement(AdminCompliancePageShadow)));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(textOf(h.container as never), /Compliance register/, "the page's own h1 must render");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- shadow of app/(firm)/admin/vendor-bindings/page.tsx --------------------

function AdminVendorBindingsPageShadow() {
  const t = useTranslations("FirmAdminCompliance.vendorBindings");
  return createElement(
    PageShell,
    null,
    createElement(PageHeader, { title: t("pageHeading"), description: t("pageDescription") }),
    createElement(VendorBindingsPanel),
  );
}

test("/admin/vendor-bindings page composition (PageHeader + the real VendorBindingsPanel) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withMessages(createElement(AdminVendorBindingsPageShadow)));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const pageText = textOf(h.container as never);
        assert.match(pageText, /Vendor identity bindings/, "the page's own h1 must render");
        // 裁-18a (mohe-grill-rulings, 2026-08-28): re-true pin. The pre-hardening copy claimed
        // "not required to be different people" -- the DB now REFUSES a self-sign (a person
        // separation on top of the rank floor, unconditional even for a single-admin firm),
        // so that claim would be actively wrong if it survived. Pinning both halves: the
        // corrected phrase renders, and the retired phrase does not.
        assert.match(pageText, /did not propose it/, "pageDescription must state the signer<>proposer rule, corrected");
        assert.doesNotMatch(pageText, /not required to be different people/, "the retired, now-false claim must not render");
        // rev-hb F1 (independent review, 2026-08-29): the copy must name BOTH exits in the
        // OWNER'S OWN RULED WORDS (裁-18c), not merely state that the rule exists -- a solo
        // firm reading only "requires an admin who did not propose it" has no idea what to DO.
        assert.match(pageText, /let Clara propose it, or add a second admin/, "pageDescription must name both lawful exits, verbatim");
        assert.doesNotMatch(pageText, /a different admin signs it/, "the retired phrasing (tells a genuinely solo firm to use a person who does not exist) must not render");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- shadow of app/(firm)/admin/settings/page.tsx (FS-8 PR-2, 裁-97) --------
//
// NO synthetic h1 here, matching the two page-shadow tests above and the
// lesson PR-1's own fix round paid for (independent review, PR #487, M2): the
// shadow mounts the SAME real PageHeader the route's page.tsx renders, so a
// real heading-order defect stays visible instead of being buried under an
// extra fake h1.

function AdminSettingsPageShadow() {
  const t = useTranslations("FirmAdminCompliance.settings");
  return createElement(
    PageShell,
    null,
    createElement(PageHeader, { title: t("pageHeading"), description: t("pageDescription") }),
    createElement(SettingsPanel),
  );
}

const FIRM_SETTINGS_ROW = [{ id: "f1", high_stakes_amount_cents: 10000000 }];

test("/admin/settings page composition (PageHeader + the real SettingsPanel) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/firms")) return jsonResponse(FIRM_SETTINGS_ROW);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withMessages(createElement(AdminSettingsPageShadow)));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const pageText = textOf(h.container as never);
        assert.match(pageText, /Firm settings/, "the page's own h1 must render");
        assert.match(pageText, /RM 100,000\.00/, "the current threshold must render, read from the DB verbatim");
        assert.match(pageText, /Signing capabilities/, "the capabilities section must render");
        assert.match(pageText, /grant_firm_capability and revoke_firm_capability are live/, "the honest capabilities note must name both verbs");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});
