// F4 (independent review, re-verify FIX-REQUIRED, 2026-08-28): pins the fix
// against M-F4 — reverting `{gov.loading ? <Loading/> : gov.data ? <Panel/>
// : <Empty/>}` back to a bare `{gov.data ? <Panel/> : null}` renders neither
// "Loading…" nor the unavailable copy: a silent, empty heading with no body
// text at all, indistinguishable from "nothing here" on both first paint
// (every visit) and after a failed read. Both discriminating states are
// pinned, per section, for BOTH sections F4 named — Run History and the
// Pair-Reversal Ledger.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { AdjustmentsRegister } from "./adjustments-register";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

/** The section whose own subtree contains `heading` — each of the
 *  register's sections is a sibling `<section>`, never nested, so the
 *  match is unambiguous. */
function findSectionByHeading(root: Node, heading: string): Node | null {
  return findIn(root, (n) => n.tagName === "SECTION" && textOf(n as never).includes(heading));
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

const TEMPLATES = [
  { id: "tpl1", client_id: "c1", status: "live", name: "Monthly rent accrual", cadence: "monthly", start_date: "2026-01-01", end_date: null, auto_reverse: true, memo_template: "Rent accrual" },
];

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(AdjustmentsRegister, { clientId: "c1" })),
  });
}

test("F4: while the governance bundle is still pending, Run History and Pair-Reversal Ledger both show 'Loading…' — never a silent empty heading", async () => {
  const never = new Promise<Response>(() => {});
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      // Hangs the governance bundle's Promise.all forever — the two RPC
      // legs never resolve; the plain table reads (templates/runs/accounts/
      // pair_reversals) resolve normally so ONLY the governance panels are
      // under test here.
      if (u.includes("/rpc/list_adjustment_runs") || u.includes("/rpc/adjustment_run_due")) return never;
      if (u.includes("/rest/v1/adjustment_templates?")) return jsonResponse(TEMPLATES);
      if (u.includes("/rest/v1/adjustment_runs?")) return jsonResponse([]);
      if (u.includes("/rest/v1/coa_accounts?")) return jsonResponse([]);
      if (u.includes("/rest/v1/adjustment_pair_reversals?")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /Monthly rent accrual/, "the passive templates read must have resolved (sanity check the fixture loaded)");

        const runHistorySection = findSectionByHeading(h.container as never, "Run history");
        assert.ok(runHistorySection, "the Run History section must render");
        assert.match(textOf(runHistorySection as never), /Loading…/, "Run History must show 'Loading…' while the governance bundle is pending (kills M-F4)");

        const pairLedgerSection = findSectionByHeading(h.container as never, "Pair-reversal ledger");
        assert.ok(pairLedgerSection, "the Pair-Reversal Ledger section must render");
        assert.match(textOf(pairLedgerSection as never), /Loading…/, "Pair-Reversal Ledger must show 'Loading…' while the governance bundle is pending (kills M-F4)");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("F4: after list_adjustment_runs fails, Run History and Pair-Reversal Ledger both show the honest 'unavailable' copy — never a silent empty heading", async () => {
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/list_adjustment_runs")) return jsonResponse({ message: "boom" }, 500);
      if (u.includes("/rpc/adjustment_run_due")) return jsonResponse({ due: false, reason: "nothing_due", blocked: [] });
      if (u.includes("/rest/v1/adjustment_templates?")) return jsonResponse(TEMPLATES);
      if (u.includes("/rest/v1/adjustment_runs?")) return jsonResponse([]);
      if (u.includes("/rest/v1/coa_accounts?")) return jsonResponse([]);
      if (u.includes("/rest/v1/adjustment_pair_reversals?")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 8; i++) await h.settle();

        const runHistorySection = findSectionByHeading(h.container as never, "Run history");
        assert.ok(runHistorySection, "the Run History section must render");
        assert.match(
          textOf(runHistorySection as never),
          /Could not load run history/,
          "Run History must show the honest unavailable copy after a failed governance read — never a silent empty heading (kills M-F4)",
        );

        const pairLedgerSection = findSectionByHeading(h.container as never, "Pair-reversal ledger");
        assert.ok(pairLedgerSection, "the Pair-Reversal Ledger section must render");
        assert.match(
          textOf(pairLedgerSection as never),
          /Could not load the pair-reversal ledger/,
          "Pair-Reversal Ledger must ALSO show the honest unavailable copy — the same Promise.all failure blanks both panels together (the recorded, documented trade-off in adjustments-workbench.ts's header), and each must say so rather than staying silent (kills M-F4)",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
