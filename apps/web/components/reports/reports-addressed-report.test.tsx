// #719's Reports half — `?report=<artifact id>` OPENS THAT REPORT.
//
// The Reports tab read no search parameter at all, so a link could only ever name the tab and leave
// the reader to find the row among the whole sealed archive. These cells mount the real
// `StatutoryReportsPanel` over a mocked PostgREST (the same idiom
// reports-snapshots-seeding-a11y.test.tsx uses — every panel here self-fetches through
// `useHydratedPart`) and assert on the RENDERED rows, because the claim is about which artifact is
// on screen, not about a parsed value.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { StatutoryReportsPanel } from "./StatutoryReportsPanel";
import { parseReportParam, REPORT_PARAM } from "../../lib/reports/url-state";
import type { ReportArtifactRow } from "../../lib/reports/types";

enableDomInspection();

const CLIENT = "c1111111-1111-4111-8111-111111111111";
const SEALED = "a1111111-1111-4111-8111-111111111111";
const OTHER = "a2222222-2222-4222-8222-222222222222";
const ABSENT = "a3333333-3333-4333-8333-333333333333";

function artifact(id: string, key: string): ReportArtifactRow {
  return {
    id, client_id: CLIENT, report_run_id: `run-${key}`, kind: "signed_original",
    storage_key: `firms/f1/reports/${key}.pdf`, key_extension: "pdf", sha256: `${key}beef`,
    byte_size: 1024, claim_removed: false, uncertified: false, sealed_by: "u1",
    sealed_at: "2026-01-01", directed_by: null, prepared_by_agent: false,
  };
}

const ARTIFACTS = [artifact(SEALED, "sealed"), artifact(OTHER, "other")];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.includes("/rest/v1/report_artifacts")) return jsonResponse(ARTIFACTS);
    if (url.includes("list_downloadable_artifacts")) return jsonResponse([]);
    if (url.includes("firm_members_visible")) return jsonResponse([]);
    return jsonResponse([]);
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function panel(reportParam: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement("main", null,
      createElement("h1", null, "Reports"),
      createElement(StatutoryReportsPanel, {
        clientId: CLIENT,
        session: sessionTokenAccessor,
        addressed: parseReportParam(reportParam),
      }),
    ),
  });
}

async function mount(reportParam: string) {
  const h = await renderComponent(panel(reportParam) as never);
  for (let i = 0; i < 4; i++) await h.settle();
  return h;
}

test("719 — with NO ?report=, the whole archive renders and nothing announces an address", async () => {
  await withMockedEnv(async () => {
    const h = await mount("");
    try {
      assert.match(h.text(), /sealed\.pdf/);
      assert.match(h.text(), /other\.pdf/, "the unaddressed tab is the whole archive");
      assert.equal(h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid") === "reports-addressed"), null);
    } finally {
      await h.unmount();
    }
  });
});

test("719 — ?report=<id> opens THAT report — the one it names, and not the others", async () => {
  await withMockedEnv(async () => {
    const h = await mount(SEALED);
    try {
      assert.match(h.text(), /sealed\.pdf/);
      assert.doesNotMatch(h.text(), /other\.pdf/, "an address opens one report, it does not merely scroll to it");
      assert.match(h.text(), /Showing the one report this link names/);
    } finally {
      await h.unmount();
    }
  });
});

test("719 — the address is LEAVEABLE — 'Show all report artifacts' returns the whole archive", async () => {
  await withMockedEnv(async () => {
    const h = await mount(SEALED);
    try {
      const button = h.find((n) => {
        const el = n as { tagName?: string; textContent?: string };
        return el.tagName === "BUTTON" && String(el.textContent ?? "").includes("Show all report artifacts");
      });
      assert.ok(button, "the addressed state must offer a way back to the list");
      await clickButton(button as never);
      for (let i = 0; i < 2; i++) await h.settle();
      assert.match(h.text(), /other\.pdf/, "clearing the address restores the whole archive");
      assert.doesNotMatch(h.text(), /Showing the one report this link names/);
    } finally {
      await h.unmount();
    }
  });
});

test("719 — an id this client's archive does not hold is a NAMED state, never a silently complete list", async () => {
  await withMockedEnv(async () => {
    const h = await mount(ABSENT);
    try {
      assert.match(h.text(), /is not in this client's archive/);
      assert.doesNotMatch(h.text(), /sealed\.pdf/, "a link that named nothing must not quietly show everything");
      assert.doesNotMatch(h.text(), /other\.pdf/);
    } finally {
      await h.unmount();
    }
  });
});

test("719 — a MALFORMED ?report= is the not-found question, not a database one", async () => {
  // The reason `lib/client-id.ts` exists: a non-uuid reaching a PostgREST `id=eq.` filter on a uuid
  // column is a 400 that throws. Nothing here issues that read, but the three states stay apart.
  assert.deepEqual(parseReportParam("not-a-uuid"), { kind: "malformed", raw: "not-a-uuid" });
  assert.deepEqual(parseReportParam(""), { kind: "none" });
  assert.deepEqual(parseReportParam(null), { kind: "none" });
  assert.deepEqual(parseReportParam(SEALED), { kind: "report", id: SEALED });
  assert.equal(REPORT_PARAM, "report");

  await withMockedEnv(async () => {
    const h = await mount("not-a-uuid");
    try {
      assert.match(h.text(), /is not in this client's archive/);
      assert.doesNotMatch(h.text(), /sealed\.pdf/);
    } finally {
      await h.unmount();
    }
  });
});
