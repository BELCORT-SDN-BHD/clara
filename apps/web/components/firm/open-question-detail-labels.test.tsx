// The two raw-token sites in `open-question-detail.tsx` (2026-09-04) — the twin
// of the documents-side `event_kind` flaw. `question.origin` and the spawned
// rule's `status` both reached a professional's screen as their DB enum values.
//
// Each cell drives the REAL component through its real read and asserts BOTH
// halves of the checked-lookup contract: a known token renders its label AND
// the raw token is gone; an unknown token renders the honest fallback AND never
// a next-intl key path. Asserting only the label would leave a component that
// prints both — the label and the token — passing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { OpenQuestionDetail } from "./open-question-detail";
import messages from "../../messages/en.json";

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

const QUESTION = {
  id: "q1", firm_id: "f1", client_id: "c1", scope_kind: "document", scope_id: "d1",
  document_id: "d1", counterparty_id: null, origin: "clarify_promotion",
  question_text: "Which account should this fee post to?", status: "open",
  opener_kind: "wake", opened_by: null, opened_at: "2026-09-01T02:00:00Z",
  resolved_by: null, resolved_at: null, resolution_text: null, spawned_rule_id: null,
};

const RULE = {
  id: "r1", client_id: "c1", rule_type: "vendor_account", counterparty_id: "cp1",
  account_code: "6200-01", status: "live", pinned: false, origin: "proposed",
  created_at: "2026-09-01T02:00:00Z", signed_at: "2026-09-01T03:00:00Z",
  retired_at: null, declined_at: null, direction: null,
};

/** Mounts the detail and opens it — the read is on-demand, never on mount. */
async function reveal(detail: unknown) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(OpenQuestionDetail, { questionId: "q1" }),
    }),
  );
  const trigger = findIn(h.container as never, (n) => n.tagName === "BUTTON");
  assert.ok(trigger, "the View details trigger must render");
  await h.act(async () => { await clickButton(trigger as never); });
  for (let i = 0; i < 3; i++) await h.settle();
  void detail;
  return h;
}

test("a KNOWN origin renders its sentence, and the raw enum token is gone", async () => {
  await withMockedEnv(
    async (u) => {
      if (String(u).includes("/rpc/get_open_question")) {
        return jsonResponse({ question: QUESTION, rule: null });
      }
      throw new Error(`unexpected fetch: ${String(u)}`);
    },
    async () => {
      const h = await reveal(null);
      try {
        const text = textOf(h.container as never);
        assert.match(text, /Promoted from a clarification Clara asked in a thread/, "the origin must render in words");
        assert.doesNotMatch(text, /clarify_promotion/, "the raw enum token must not survive beside the label");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("an UNKNOWN origin renders the honest fallback WITH its raw value, never a key path", async () => {
  await withMockedEnv(
    async (u) => {
      if (String(u).includes("/rpc/get_open_question")) {
        // A tenth origin the DB ships before this build learns it — the exact
        // shape 0016, 0017 and 0121 each produced in turn.
        return jsonResponse({ question: { ...QUESTION, origin: "some_future_origin" }, rule: null });
      }
      throw new Error(`unexpected fetch: ${String(u)}`);
    },
    async () => {
      const h = await reveal(null);
      try {
        const text = textOf(h.container as never);
        assert.match(text, /this version has no description for/, "the absence of a label must be STATED");
        assert.match(text, /some_future_origin/, "…and the DB's own value must still reach the human");
        assert.doesNotMatch(text, /origins\./, "a next-intl key path must never render");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a KNOWN spawned-rule status renders in words beside the account code, without the token", async () => {
  await withMockedEnv(
    async (u) => {
      if (String(u).includes("/rpc/get_open_question")) {
        return jsonResponse({ question: QUESTION, rule: { ...RULE, status: "suspended_pending_resignature" } });
      }
      throw new Error(`unexpected fetch: ${String(u)}`);
    },
    async () => {
      const h = await reveal(null);
      try {
        const text = textOf(h.container as never);
        assert.match(text, /6200-01/, "the account code is the DB's own identifier and stays verbatim");
        assert.match(text, /suspended until someone signs it again/, "the status must render in words");
        assert.doesNotMatch(text, /suspended_pending_resignature/, "the raw status token must be gone");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("an UNKNOWN rule status renders the honest fallback, never a key path", async () => {
  await withMockedEnv(
    async (u) => {
      if (String(u).includes("/rpc/get_open_question")) {
        return jsonResponse({ question: QUESTION, rule: { ...RULE, status: "some_future_status" } });
      }
      throw new Error(`unexpected fetch: ${String(u)}`);
    },
    async () => {
      const h = await reveal(null);
      try {
        const text = textOf(h.container as never);
        assert.match(text, /this version has no description for/);
        assert.match(text, /some_future_status/, "the DB's own value must still reach the human");
        assert.doesNotMatch(text, /ruleStatuses\./, "a next-intl key path must never render");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the two vocabularies match their LIVE CHECK constraints, parsed out of the migrations", async () => {
  // Neither roster is retyped from memory: both are read from the migration
  // that owns the live constraint. `origin` was redefined THREE times
  // (0011 → 0016 → 0017 → 0121), which is exactly why this is parsed.
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "packages", "db", "migrations");

  const flat = (file: string) => readFileSync(join(migrations, file), "utf8").replace(/\s+/g, " ");
  // `add constraint … check (origin in (…))` — the ADD, never the DROP that
  // precedes it on the same statement, because only the ADD carries a value list.
  const origins = /add constraint open_questions_origin_check_0017 check \(origin in \(([^)]*)\)\)/
    .exec(flat("0121_f_a3_pr1b_agent_limb.sql"));
  assert.ok(origins, "the live origin CHECK was not found at its cited migration");
  const originSet = new Set((origins[1] ?? "").split(",").map((s) => s.trim().replace(/'/g, "")));

  const statuses = /add constraint coding_rules_status_check_0016 check \( status in \(([^)]*)\)\)/
    .exec(flat("0016_a21_compliance_watch.sql"));
  assert.ok(statuses, "the live coding_rules status CHECK was not found at its cited migration");
  const statusSet = new Set((statuses[1] ?? "").split(",").map((s) => s.trim().replace(/'/g, "")));

  const labels = messages.CodingQuestionsSignals.openQuestion as unknown as {
    origins: Record<string, string>;
    ruleStatuses: Record<string, string>;
  };
  assert.equal(originSet.size, 8, `expected 8 live origins, parsed ${[...originSet].join(", ")}`);
  assert.equal(statusSet.size, 5, `expected 5 live rule statuses, parsed ${[...statusSet].join(", ")}`);
  for (const origin of originSet) {
    assert.equal(typeof labels.origins[origin], "string", `no label for the live origin "${origin}"`);
  }
  for (const status of statusSet) {
    assert.equal(typeof labels.ruleStatuses[status], "string", `no label for the live rule status "${status}"`);
  }
});
