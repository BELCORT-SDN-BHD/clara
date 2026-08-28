// F1 REGRESSION (independent review, required ride-along, 2026-08-28): the
// F1 fix (staff-advance-statement-panel.tsx's sync effect) was measured
// correct by hand but shipped with no pinning test — the reviewer's mutant
// F1m (reverting to the seed-once `useState(accountCodes[0])`) stayed green
// against the rest of the battery. This drives the EXACT probe-D shape: the
// panel mounts with ZERO enrolled accounts (`accountCodes = []`, the honest
// pre-first-enrolment state), then a real prop change lands `accountCodes =
// ["2100"]` while the panel stays mounted — the shape the F1 fix's own
// header names ("the FIRST enrolment lands while this panel is already
// mounted"). Asserts a REAL door call to staff_advance_statement fires
// exactly once as a result, and the read's own data renders — not merely
// that some text appears.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { StaffAdvanceStatementPanel } from "./staff-advance-statement-panel";

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

const STATEMENT = {
  client_id: "c1", account_code: "2100", from: null, to: "2026-08-28",
  opening_cents: 0, closing_cents: 100000,
  rows: [{ date: "2026-08-01", kind: "disbursement", entry_id: "e1", advance_id: "adv1", amount_cents: 100000, running_cents: 100000, application_kind: null, reason: null }],
  generations: [{ enrolment_id: "en1", person_label: "Ah Chong", enrolled_at: "2026-08-01T00:00:00Z", retired_at: null, active: true, attestation: "Not a related party." }],
};

/** Probe-D harness: holds `accountCodes` as REAL React state the test flips
 *  from the outside (a button click, driven for real through the SAME
 *  fireEvent mechanism proven reliable for plain buttons throughout this
 *  train's battery) — a genuine prop change over time, not a fabricated
 *  re-render. */
function Harness() {
  const [codes, setCodes] = useState<string[]>([]);
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", onClick: () => setCodes(["2100"]) }, "simulate first enrolment landing"),
    createElement(StaffAdvanceStatementPanel, { clientId: "c1", accountCodes: codes }),
  );
}

function App() {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: createElement(Harness) });
}

test("F1 regression: the first enrolment landing while mounted (accountCodes: [] -> [code]) triggers a real staff_advance_statement call and renders its data", async () => {
  const seenUrls: string[] = [];
  await withMockedEnv(
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      seenUrls.push(u);
      if (u.includes("/rpc/staff_advance_statement")) return jsonResponse(STATEMENT);
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 2; i++) await h.settle();

        // Before the flip: zero enrolled accounts is the honest starting
        // state, and it must make ZERO door calls — a read with nothing to
        // read is not a call to make.
        assert.equal(seenUrls.length, 0, "no staff_advance_statement call before any account exists");
        assert.match(h.text(), /No enrolled accounts yet/, "the honest pre-enrolment state must render, not a stale empty-read claim");

        const flip = h.find((n) => n.tagName === "BUTTON");
        assert.ok(flip, "the harness's own flip control must render");
        await h.fireEvent(flip!, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.equal(seenUrls.length, 1, "the first enrolment landing must trigger EXACTLY ONE staff_advance_statement call — this is what the seed-once bug made zero");
        assert.match(seenUrls[0]!, /\/rpc\/staff_advance_statement$/);

        // The READ's own data must render — not merely that some text
        // changed (review law 2: only what a read actually saw is evidence).
        assert.match(h.text(), /Disbursement/, "the statement's real movement row must render");
        assert.match(h.text(), /RM 1,000\.00/, "the statement's real closing balance must render, DB-derived");
        assert.doesNotMatch(h.text(), /No enrolled accounts yet/, "the pre-enrolment state must not still be showing");
      } finally {
        await h.unmount();
      }
    },
  );
});
