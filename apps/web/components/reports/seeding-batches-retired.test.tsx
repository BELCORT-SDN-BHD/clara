// #1012 — THE SEEDING PANEL AFTER THE LANE WAS RETIRED (0288_seeding_lane_retired.sql; owner
// ruling 2026-09-20 on #983). `clara.create_seeding_batch`, `clara.tick_seeding_proposal` and
// `clara.decline_seeding_proposal` answer one typed refusal, so the browser must offer no
// control that calls them, while every past batch and proposal stays on screen and readable.
//
// THREE CLAIMS, at the two seams the ticket's brief names:
//   (1) the RENDERED panel — an OPEN proposal inside an OPEN batch, exactly the state that used
//       to carry Tick and Decline, now carries neither, and the panel says why;
//   (2) the two CLOSERS survive — Cancel batch and Complete batch are still offered on an open
//       batch, so a firm can close its own history out;
//   (3) the door module itself exports no tick/decline wrapper, which is what makes (1) a
//       property of the code rather than of this one component's markup.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import * as reportsApi from "../../lib/reports/api";
import { SeedingBatchesPanel } from "./SeedingBatchesPanel";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

/** Every rendered <button>'s label. The harness exposes `find` (first match only), so the
 *  "no such control anywhere" claim needs its own walk. */
function buttonLabels(root: Node): string[] {
  const out: string[] = [];
  (function walk(n: Node) {
    if (n.tagName === "BUTTON") out.push(textOf(n as never));
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
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

function App(child: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Reports"), child),
  });
}

/** An OPEN batch carrying one OPEN (state='proposed') proposal — the exact pre-retirement
 *  state the panel used to put Tick and Decline on. */
const OPEN_BATCH_WITH_OPEN_PROPOSAL = (async (u: RequestInfo | URL) => {
  const url = String(u);
  if (url.includes("/seeding_batches")) {
    return jsonResponse([{
      id: "b1", client_id: "c1", source_document_id: "doc1", source_sha256: "d".repeat(64),
      state: "open", stats: {}, created_by: "u1", created_at: "2026-07-01T00:00:00Z",
      completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
    }]);
  }
  if (url.includes("/seeding_proposals")) {
    return jsonResponse([{
      id: "p1", batch_id: "b1", client_id: "c1", proposal_kind: "counterparty_birth",
      proposal_key: "k1", payload: { name: "Acme Sdn Bhd" }, evidence: {}, state: "proposed",
      decided_by: null, decided_at: null, decision_reason: null, refuse_reason: null,
      resulting_rule_id: null, resulting_counterparty_id: null, created_at: "2026-07-01T00:00:00Z",
    }]);
  }
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

test("ticket 1012: an OPEN proposal in an OPEN batch carries NO Tick and NO Decline control, and the panel names the retirement", async () => {
  await withMockedEnv(OPEN_BATCH_WITH_OPEN_PROPOSAL, async () => {
    const h = await renderComponent(App(createElement(SeedingBatchesPanel, { clientId: "c1", session: sessionTokenAccessor })));
    try {
      for (let i = 0; i < 4; i++) await h.settle();

      // The proposal itself is still on screen — the retirement hides nothing.
      assert.match(h.text(), /Acme Sdn Bhd/, "the historical proposal is still rendered");
      assert.match(h.text(), /counterparty_birth/, "its kind is still rendered");

      const buttons = buttonLabels(h.container as unknown as Node);
      assert.ok(!buttons.includes("Tick"), `no Tick control may render (buttons: ${JSON.stringify(buttons)})`);
      assert.ok(!buttons.includes("Decline"), `no Decline control may render (buttons: ${JSON.stringify(buttons)})`);

      assert.match(
        h.text(), /retired/i,
        "the panel must SAY the lane is retired — nothing is switched off silently (owner ruling, beta: nothing dark)");
    } finally {
      await h.unmount();
    }
  });
});

test("ticket 1012: the two closers survive — an OPEN batch still offers Cancel batch and Complete batch", async () => {
  await withMockedEnv(OPEN_BATCH_WITH_OPEN_PROPOSAL, async () => {
    const h = await renderComponent(App(createElement(SeedingBatchesPanel, { clientId: "c1", session: sessionTokenAccessor })));
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const buttons = buttonLabels(h.container as unknown as Node);
      assert.ok(buttons.includes("Cancel batch"), `Cancel batch must still render (buttons: ${JSON.stringify(buttons)})`);
      assert.ok(buttons.includes("Complete batch"), `Complete batch must still render (buttons: ${JSON.stringify(buttons)})`);
    } finally {
      await h.unmount();
    }
  });
});

test("ticket 1012 census: the reports door module exports NO tick/decline wrapper, and still exports both closers and both reads", () => {
  const exported = Object.keys(reportsApi);
  for (const gone of ["tickSeedingProposal", "declineSeedingProposal", "createSeedingBatch"]) {
    assert.ok(!exported.includes(gone),
      `lib/reports/api.ts must export no ${gone} — a retired door needs no browser wrapper`);
  }
  for (const kept of ["cancelSeedingBatch", "completeSeedingBatch", "listSeedingBatches", "listSeedingProposals"]) {
    assert.ok(exported.includes(kept), `lib/reports/api.ts must still export ${kept} (history stays closeable and readable)`);
  }
});
