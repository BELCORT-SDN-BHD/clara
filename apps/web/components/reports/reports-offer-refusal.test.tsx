// FS-7 echelon 2, NOTE-7 — THE VIEWER CASE: the offer door's refusal must reach the human.
//
// WHY THIS FILE EXISTS, AND WHY THE STATE IS REACHABLE RATHER THAN THEORETICAL. The artifact LIST is
// not a door. `listReportArtifacts` is a direct PostgREST/RLS read, and the human policy on
// `clara.report_artifacts` is firm-scoped with NO role rank — while `clara.list_downloadable_artifacts`
// floors at `role_rank('bookkeeper')`. So a firm VIEWER reads the artifact rows, the panel draws
// them, every Download control is correctly withheld, and without a banner that person is looking at
// a Reports tab full of documents with no control anywhere and no reason given.
//
// That is precisely the state the door was shaped to avoid: the DB battery's D8.4 cell records that
// the offer door REFUSES rather than returning `[]`, because an empty list "would read to a UI as
// 'nothing to download'". The refusal is only worth raising if the surface shows it.
//
// A REAL REACT ROOT, NOT A STATIC RENDER. `renderToStaticMarkup` never runs effects, so the offer
// read never happens and no banner could ever appear — a static cell here would be vacuous by
// construction. This rides `renderComponent` + a mocked transport, the
// components/admin/registrations-a11y.test.tsx precedent.
//
// RED-BEFORE (verified by hand before this file shipped): delete the
// `{offers.err ? <StateBanner …>}` line from either panel and that panel's cell reds — the refusal
// text is then in no rendered node. The MUST-NOT-RED control is the third cell: with the door
// answering normally, no refusal banner is rendered at all, so the cells are not matching something
// the page always says.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { StatutoryReportsPanel } from "./StatutoryReportsPanel";
import { SandboxExportsPanel } from "./SandboxExportsPanel";
import messages from "../../messages/en.json";

enableDomInspection();

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The offer door's real refusal shape: PostgREST surfaces a raised CLR04 with its message. */
const OFFER_REFUSAL_MESSAGE = "insufficient role";

/**
 * A transport in which the ARTIFACT LIST succeeds and the OFFER DOOR refuses — the viewer's exact
 * position. Everything else answers empty so the panels reach their own render.
 */
function viewerTransport(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/rpc/list_downloadable_artifacts")) {
      return json({ code: "CLR04", message: OFFER_REFUSAL_MESSAGE, details: null, hint: null }, 400);
    }
    if (url.includes("/rpc/list_sandbox_exports")) return json([]);
    if (url.includes("report_artifacts")) {
      return json([{
        id: "11111111-1111-4111-8111-111111111111", client_id: "c1", report_run_id: "r1",
        kind: "pre_sign", storage_key: "k", key_extension: "pdf", sha256: "d".repeat(64),
        byte_size: 2048, claim_removed: false, uncertified: false, sealed_by: "u1",
        sealed_at: "2026-01-01", directed_by: null, prepared_by_agent: false,
      }]);
    }
    return json([]);
  }) as typeof fetch;
}

/** The same transport with the offer door ANSWERING — the must-not-red control. */
function bookkeeperTransport(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/rpc/list_downloadable_artifacts")) return json([]);
    if (url.includes("/rpc/list_sandbox_exports")) return json([]);
    return json([]);
  }) as typeof fetch;
}

function withTransport(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
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

// The panel's own heading is an h2, so the a11y rules correctly refuse an h2 with no h1 above it.
// A page shell is what a panel actually renders inside — the registrations-a11y precedent.
const app = (child: unknown) =>
  createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("main", null,
      createElement("h1", null, "Reports"), child as never) as never,
  });

const session = { getAccessToken: async () => "tok" };

test("VIEWER: the statutory panel shows the offer door's refusal VERBATIM beside the artifacts", async () => {
  await withTransport(viewerTransport(), async () => {
    const h = await renderComponent(app(createElement(StatutoryReportsPanel, { clientId: "c1", session })));
    await h.settle();
    await h.settle();
    const text = textOf(h.container);
    // The DATABASE's own words, not UI prose about someone else's decision.
    assert.ok(text.includes(OFFER_REFUSAL_MESSAGE),
      `the offer refusal must be rendered verbatim; got:\n${text.slice(0, 600)}`);
    // AND the discriminating half: the artifact itself is on the page, with no Download control.
    // A banner on an empty page would prove nothing about the state this cell is named for.
    assert.ok(text.includes("pre_sign"), "the artifact row must still render — that IS the viewer's confusion");
    // The harness's Stub is deliberately loosely typed; read the attribute through its own map
    // rather than a DOM call the type does not promise.
    assert.equal(
      h.find((n) => (n as { attrs?: Record<string, unknown> }).attrs?.["data-testid"] === "artifact-download"),
      null,
      "no Download control may render while the offer door refuses");
    await h.unmount();
  });
});

test("VIEWER: the sandbox panel shows the same refusal, separately from its own list error", async () => {
  await withTransport(viewerTransport(), async () => {
    const h = await renderComponent(app(createElement(SandboxExportsPanel, { clientId: "c1", session })));
    await h.settle();
    await h.settle();
    const text = textOf(h.container);
    assert.ok(text.includes(OFFER_REFUSAL_MESSAGE),
      `the offer refusal must be rendered verbatim; got:\n${text.slice(0, 600)}`);
    // The sandbox LIST answered fine. The two reads have two different authorities, and the reader
    // must be able to tell which one refused — so the list's own error copy must NOT appear.
    assert.equal(text.includes("Could not load sandbox exports"), false,
      "the offer's refusal must not be dressed up as the list's failure");
    await h.unmount();
  });
});

test("MUST-NOT-RED CONTROL: with the offer door answering, neither panel renders a refusal banner", async () => {
  await withTransport(bookkeeperTransport(), async () => {
    for (const panel of [StatutoryReportsPanel, SandboxExportsPanel]) {
      const h = await renderComponent(app(createElement(panel, { clientId: "c1", session })));
      await h.settle();
      await h.settle();
      assert.equal(textOf(h.container).includes(OFFER_REFUSAL_MESSAGE), false,
        "a banner that renders unconditionally would make both cells above vacuous");
      await h.unmount();
    }
  });
});

test("the refusal banner passes the a11y rules in both panels", async () => {
  await withTransport(viewerTransport(), async () => {
    for (const panel of [StatutoryReportsPanel, SandboxExportsPanel]) {
      const h = await renderComponent(app(createElement(panel, { clientId: "c1", session })));
      await h.settle();
      await h.settle();
      assert.deepEqual(checkAccessibility(h.container), [],
        "the panel carrying the refusal banner must be clean under the a11y rules");
      await h.unmount();
    }
  });
});
