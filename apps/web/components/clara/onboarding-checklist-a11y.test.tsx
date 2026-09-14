// GATE (b) — structural a11y scan of the onboarding checklist card + its
// Commit door dialog (owner ruling Q7).
//
// F4 fix (rev-t11): mounted through the REAL route component
// (`ClaraFullScreenThread`, the escalated full-screen thread T11's card
// actually ships inside — `app/(full)/clients/[clientId]/clara/[threadId]/
// page.tsx`), never a hand-mounted `OnboardingChecklistCard` under a
// synthetic `<h1>Clara</h1>` — the synthetic heading manufactured the very
// `<h1>` the real route was missing, masking a genuine `heading-order`
// violation (the card's own `<h2>` jumping straight from h0). The real
// mount's own `<h1>` (this file's own header on `ClaraFullScreenThread.tsx`)
// is what the scan below actually measures now.
//
// N4 fix (rev-t11): the OLD "dialog opened" guard matched `/Cancel/` against
// the ALWAYS-PRESENT "Cancel onboarding" trigger (which contains the
// substring "Cancel") — vacuously true even with the dialog closed. The
// discriminating check: the attestation TEXTAREA, which only exists inside
// the OPEN Commit dialog's own children.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClaraFullScreenThread } from "./ClaraFullScreenThread";

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

const PLAN = {
  id: "plan-1", firm_id: "f1", scope_kind: "client", client_id: "c1", state: "open",
  revision_token: "rev-1", revision_n: 1, committed_at: null, committed_by: null,
  review_maker: "u1", reviewed_at: "2026-08-01T00:00:00Z", contributors: ["u1"],
  commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};
const ITEM = {
  id: "i1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "legal_name",
  question: "Legal name", answer: "Rome Public Advisory", state: "answered", required_for_commit: true,
  answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
};

/** The rail parity train gave ClaraThreadView's composer a translated
 *  accessible name. Both collapsed and open-dialog states therefore expect
 *  no structural violations, rather than preserving the former exception. */
function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    // threadId="" — the same no-fetch "resolving" state
    // ClaraThreadView.onboarding.test.tsx already proves needs no
    // session/message/SSE mocking (useClaraThread's own mount effect
    // early-returns on a falsy threadId).
    children: createElement(ClaraFullScreenThread, { threadId: "", clientId: "c1", returnHref: "/clients/c1" }),
  });
}

/**
 * Settle until `condition` holds — BOUNDED BY PASSES, NEVER BY THE CLOCK (#706).
 *
 * WHAT IT REPLACES. This file drove the card with fixed tick counts (`for (i < 6) await
 * h.settle()`) and asserted immediately afterwards. Each `settle()` is one `act()`-wrapped
 * macrotask flush, so a tick count is a GUESS about how many flushes the mount/door chain takes —
 * green while the guess holds, red the moment a chain grows a link or a loaded host reorders the
 * work. Polling the condition removes the guess in both directions: it stops the instant the state
 * is there, and keeps going when one more pass was needed.
 *
 * The bound is on WORK, not on wall-clock time, so a red here means the state never arrived — it
 * is never a statement about how busy the machine was. Post-unmount drains below keep their fixed
 * counts deliberately: there is no condition to wait for when the point is to let pending work
 * finish before the next mount.
 */
const MAX_SETTLE_PASSES = 200;

async function settleUntil(
  h: { settle: () => Promise<void> },
  condition: () => boolean,
  label: string,
): Promise<void> {
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass += 1) {
    if (condition()) return;
    await h.settle();
  }
  if (condition()) return;
  throw new Error(`${label} never arrived within ${MAX_SETTLE_PASSES} settle passes (a bound on WORK, not on wall-clock time — read a red here as a stall, never as a slow host)`);
}

test("the REAL full-screen thread route (card + Commit door dialog OPEN) has zero a11y violations, including heading-order", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([PLAN]);
      if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([ITEM]);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: "onboarding" }]);
      if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([{ id: "seed-1" }]);
      // ShareSessionButton's own read (mounted in ClaraFullScreenThread's
      // header) — an empty result resolves `null`, which renders nothing.
      if (url.includes("/rest/v1/chat_sessions")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        await settleUntil(h, () => /Commit onboarding/.test(h.text()), "the plan loading far enough to show the commit door");
        assert.match(h.text(), /Commit onboarding/, "the plan must have loaded far enough to show the commit door");

        const collapsedViolations = checkAccessibility(body as never);
        assert.deepEqual(
          collapsedViolations,
          [],
          `collapsed — expected ZERO violations (the composer finding this cell used to pin as present is fixed) and NOTHING from T11, in particular no heading-order: ${JSON.stringify(collapsedViolations)}`,
        );

        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Commit onboarding");
        assert.ok(trigger, "the Commit-onboarding dialog trigger must render");
        await h.fireEvent(trigger!, "click");
        await settleUntil(h, () => findIn(body as never, (n) => n.tagName === "TEXTAREA") !== null, "the open dialog's own attestation field");

        // N4 fix: the discriminating "did it actually open" proof — the
        // attestation field only exists inside the OPEN dialog's children.
        const attestationField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(attestationField, "opening the trigger must reveal the dialog's own attestation field");

        const openViolations = checkAccessibility(body as never);
        assert.deepEqual(
          openViolations,
          [],
          `open dialog — must still be ZERO, no NEW violation introduced by the open Commit dialog: ${JSON.stringify(openViolations)}`,
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});
