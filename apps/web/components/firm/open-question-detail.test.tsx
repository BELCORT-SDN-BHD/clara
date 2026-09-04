// F8, independent review (the mutant panel): OpenQuestionDetail, pinned by
// actually clicking "View details" and asserting the REAL fetched data
// renders — a lazy-fetch-on-demand component can be stubbed to a no-op
// button with nothing else in the tree noticing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { OpenQuestionDetail } from "./open-question-detail";
import messages from "../../messages/en.json";

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
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

test("OpenQuestionDetail: no fetch until 'View details' is clicked, then the REAL fetched fields render", async () => {
  let calls = 0;
  await withMockedEnv(
    async (u) => {
      calls += 1;
      assert.match(String(u), /\/rpc\/get_open_question$/);
      return jsonResponse({
        question: {
          id: "q1", firm_id: "f1", client_id: "c1", scope_kind: "document", scope_id: "d1",
          document_id: "d1", counterparty_id: null, origin: "classification", question_text: "Which account?",
          status: "open", opener_kind: "wake", opened_by: null, opened_at: "2026-04-01T10:00:00Z",
          resolved_by: null, resolved_at: null, resolution_text: null, spawned_rule_id: "r1",
        },
        rule: { id: "r1", client_id: "c1", rule_type: "vendor_account", counterparty_id: "cp1", account_code: "5100", status: "proposed", pinned: false, origin: "sweep", created_at: "2026-04-01T09:00:00Z", signed_at: null, retired_at: null, declined_at: null, direction: null },
      });
    },
    async () => {
      const h = await renderComponent(App(createElement(OpenQuestionDetail, { questionId: "q1" })));
      try {
        await h.settle();
        assert.equal(calls, 0, "get_open_question must not fire until the human asks for it");
        const trigger = h.find((n) => n.tagName === "BUTTON" && h.text().includes("View details"));
        assert.ok(trigger, "the reveal trigger must render");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.equal(calls, 1, "clicking must fire exactly one get_open_question call");
        // INVERTED 2026-09-04. This line used to require the RAW token
        // `classification` on screen, which is precisely the defect: the
        // fixture's `origin` is the DB's enum value and a professional was
        // reading it. It now requires the LABEL for that same fixture value —
        // the proof that the fetched question reached the screen is unchanged,
        // only the spelling it must arrive in. The absence of the raw token is
        // pinned in ./open-question-detail-labels.test.tsx, together with the
        // unknown-value arm and the vocabulary parse.
        assert.match(
          h.text(),
          /Clara could not classify the document/,
          "the question's real origin must render — in words, not as its DB enum value",
        );
        assert.match(h.text(), /5100/, "the spawned rule's real account_code must render — proving rule data, not just question data, was fetched and shown");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("OpenQuestionDetail: a read failure renders the refusal, never a silent blank", async () => {
  await withMockedEnv(
    async () => jsonResponse({ code: "CLR11", message: "question not found" }, 400),
    async () => {
      const h = await renderComponent(App(createElement(OpenQuestionDetail, { questionId: "q1" })));
      try {
        await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && h.text().includes("View details"));
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /question not found/);
      } finally {
        await h.unmount();
      }
    },
  );
});
