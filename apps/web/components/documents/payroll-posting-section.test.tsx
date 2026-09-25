// #1148 — THE DOCUMENT PAGE SAYS WHY A PAYSLIP DID NOT POST.
//
// Before 0363 the accounting view of a payroll summary could show the entries it DID produce and
// had nothing at all to say about one that produced none: it printed "Nothing is standing on this
// document" and stopped. The whole answer existed — `clara._payroll_posting_verdict` builds the
// sentence in one body so the words a person reads and the decision the lane took cannot drift —
// and was reachable only through a Needs-you queue row or the entry's own receipt.
//
// THE READ IS MOCKED AT `fetch`, never at the component's own module boundary: the section calls
// `getPayrollPostingState` -> `callDoor` -> a real PostgREST POST, and mocking any layer above the
// wire would prove only that this test can call its own stub. `document-state-panel.test.tsx`'s
// `withMockedEnv` idiom, reused verbatim.
//
// THE SENTENCES BELOW ARE THE DATABASE'S OWN, transcribed from the db cell
// `p1148.read.projection` and from 0297 §D / 0343's format strings — not invented for this file,
// and not reworded by the component under test, which is the point of two of these cells.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { PayrollPostingSection } from "./payroll-posting-section";
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

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

/** Mount the section against ONE `get_payroll_posting_state` answer (or refusal), counting the
 *  calls the door actually received. */
async function mount(
  { kind = "payroll_summary", answer = null as unknown, status = 200 },
  run: (text: () => string, calls: () => number) => Promise<void>,
) {
  let calls = 0;
  await withMockedEnv(
    (async (u: string | URL | Request) => {
      const url = String(u);
      if (url.includes("/rpc/get_payroll_posting_state")) {
        calls += 1;
        return jsonResponse(answer, status);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App(createElement(PayrollPostingSection, {
        documentId: "11111111-1111-4111-8111-111111111111", documentKind: kind,
      })));
      try {
        await h.settle();
        await run(() => h.text(), () => calls);
      } finally {
        await h.unmount();
      }
    },
  );
}

/** The parked completeness question — the state #1048 exists for, and the one a page most needs a
 *  sentence about, because nothing is wrong with the payslip and nothing will post until a named
 *  person answers. */
const PARKED = {
  document_id: "11111111-1111-4111-8111-111111111111",
  sentence:
    "This payroll summary for March 2026 prints no total; is this every employee for the month? "
    + "Clara read 2 employee line(s), totalling RM 5,000.00 gross and RM 4,255.70 net. "
    + "Answer yes and the run posts from those lines; answer no and it stays unposted.",
  verdict: "blocked",
  rung: "completeness_witness",
  reason: "completeness_unwitnessed",
  completeness: { parked: true, rows_read: 2, gross_sum_cents: 500000, net_sum_cents: 425570 },
};

/** A payslip stopped by this client's chart — 0297 §D's `accounts_resolve` rung. Nothing is parked
 *  and nobody is being asked anything; the remedy is in the sentence itself. */
const ACCOUNT_MISSING = {
  document_id: "11111111-1111-4111-8111-111111111111",
  sentence:
    "Payroll run August 2026 was not posted: this client's chart of accounts has no 2130. "
    + "Add the account(s) and re-file the payslip.",
  verdict: "blocked",
  rung: "accounts_resolve",
  reason: "account_missing",
  completeness: { parked: false, rows_read: 0, gross_sum_cents: null, net_sum_cents: null },
};

test("PayrollPostingSection: a blocked payslip is told WHY, in the database's own words", async () => {
  await mount({ answer: ACCOUNT_MISSING }, async (text, calls) => {
    assert.equal(calls(), 1, "the section reads the door once");
    assert.ok(
      text().includes(
        "Payroll run August 2026 was not posted: this client's chart of accounts has no 2130. "
        + "Add the account(s) and re-file the payslip."),
      `the sentence is rendered verbatim, never reworded or summarised (got ${JSON.stringify(text())})`);
    assert.ok(text().includes(messages.ClientDocuments.payrollPosting.heading),
      "and it is under its own heading, not loose in the entries list");
    assert.equal(text().includes(messages.ClientDocuments.payrollPosting.parkedNote), false,
      "nothing is parked here, so nobody is told a person owes an answer");
  });
});

test("PayrollPostingSection: a parked completeness question says so, and says where it is answered", async () => {
  await mount({ answer: PARKED }, async (text) => {
    assert.ok(text().includes("is this every employee for the month?"),
      "the question the gate parked, verbatim");
    assert.ok(text().includes("RM 5,000.00 gross and RM 4,255.70 net"),
      "with the figures a person needs in order to answer it -- built by the database, not here");
    assert.ok(text().includes(messages.ClientDocuments.payrollPosting.parkedNote),
      "a question with no way to answer it is a dead end: the page names where the answer is given");
  });
});

test("PayrollPostingSection: a document that is not a payroll summary is not asked about at all", async () => {
  await mount({ kind: "invoice", answer: ACCOUNT_MISSING }, async (text, calls) => {
    assert.equal(calls(), 0, "no door call at all -- an invoice page pays nothing for this section");
    assert.equal(text().trim(), "", "and renders nothing: a heading about payroll on a supplier bill is a lie the layout tells");
  });
});

test("PayrollPostingSection: a kind that moved under the page is silence, not a banner", async () => {
  // The panel decided from the bundle's own `document_kind` that this WAS a payslip; between that
  // read and this one a correction changed it. The door refuses by name, and the honest answer on
  // screen is nothing at all.
  await mount(
    {
      answer: {
        code: "CLR10",
        message: "this document is not a payroll summary, so it has no payroll posting state",
        details: '{"reason":"not_a_payroll_summary"}',
      },
      status: 400,
    },
    async (text, calls) => {
      assert.equal(calls(), 1, "it did ask");
      assert.equal(text().trim(), "", `and said nothing about the refusal (got ${JSON.stringify(text())})`);
    },
  );
});

test("PayrollPostingSection: any OTHER refusal is a banner, because a person is owed the reason", async () => {
  await mount(
    { answer: { code: "CLR11", message: "payroll summary not found", details: null }, status: 404 },
    async (text) => {
      assert.ok(text().length > 0, "silence about a real failure is the placeholder-success defect #624 exists to stop");
      assert.ok(text().includes("CLR11") || text().toLowerCase().includes("not found"),
        `the failure is named on screen (got ${JSON.stringify(text())})`);
    },
  );
});
