// GATES (b) and (c) — the structural a11y scan and the keyboard walk over all
// FIVE cards this train ships: the four chatTurn_v16 kinds plus 裁-20's sweep
// upgrade (owner ruling Q7's three a11y CI gates; gate (a), token contrast, is
// scripts/check-token-contrast.mjs and has no per-component cell).
//
// ONE FILE, FIVE CARDS, EACH MOUNTED AND SCANNED SEPARATELY. The house pattern
// is one a11y file per SURFACE (bank-a11y, close-a11y, documents-a11y…), and
// these five are one surface: cards rendered by one renderer into one
// transcript. Scanning each on its own mount rather than all five at once is
// what keeps a finding ATTRIBUTABLE — a single combined scan reports a
// violation without saying which card owns it.
//
// EVERY CARD IS SCANNED IN BOTH ITS STATES: hydrated-at-rest, and again with its
// act form OPEN (the state that introduces the inputs, the select and the extra
// buttons — and therefore every label, name and focus-ring obligation that a
// scan of the resting card would never see). A card with no act is scanned once,
// because there is no second state to reach.
//
// THE SCAN RUNS OVER `document.body`, NOT THE CONTAINER, so anything portalled
// is included. These cards deliberately use no portalled dialog — see
// V16ActCards.tsx's header — but scanning the body costs nothing and means the
// gate does not silently stop covering them if one is ever introduced.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { clickButton, renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import { ThreadActionCoordinatorProvider } from "../../lib/parts/thread-action-coordinator";
import { PartRenderer } from "./PartRenderer";
import type { ClaraPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const CALLER_CONTEXT = [{
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "22222222-2222-4222-8222-222222222222",
  firm_name: "BELCORT",
  role: "owner",
  role_rank: 40,
  is_operator: true,
}];

function withMockedEnv(impl: (url: string) => Response, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (u: unknown) => {
    const url = String(u);
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
    return impl(url);
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function App(part: ClaraPart): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(ThreadActionCoordinatorProvider, {
      session: sessionTokenAccessor,
      children: createElement(PartRenderer, { part }),
    }),
  });
}

type Body = { appendChild: (c: unknown) => void };
const documentBody = () => (globalThis as unknown as { document: { body: Body } }).document.body;

/** Mount one card into `document.body`, settle its hydrate, optionally open its
 *  act form, then run BOTH gates and assert zero findings from each.
 *
 *  ZERO, WITH NO ALLOWLIST AND NO PINNED KNOWN-VIOLATION. These are brand-new
 *  components, so there is no inherited finding to attribute the way
 *  onboarding-checklist-a11y.test.tsx must pin its one pre-existing composer
 *  violation. A finding here is this train's, and the answer is a component fix
 *  — never an entry in a list. */
async function scanCard(part: ClaraPart, openAct?: string): Promise<void> {
  const h = await renderComponent(App(part));
  const body = documentBody();
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 5; i++) await h.settle();
    // Non-vacuity: a scan of a card that never hydrated would pass trivially,
    // because an empty card has nothing to violate.
    assert.ok(h.text().trim().length > 0, "the card must have rendered something to scan");

    if (openAct) {
      const trigger = h.find((n: Stub) => n.tagName === "BUTTON" && textOf(n).trim() === openAct);
      assert.ok(trigger, `the "${openAct}" trigger must render before this scan means anything`);
      await h.act(() => clickButton(trigger));
      for (let i = 0; i < 3; i++) await h.settle();
      // Discriminating proof the second state was actually REACHED — otherwise
      // this "open form" scan is just the resting scan run twice.
      assert.ok(
        h.find((n: Stub) => n.tagName === "INPUT"),
        `opening "${openAct}" must reveal the form's own field`,
      );
    }

    const violations = checkAccessibility(body as never);
    assert.deepEqual(violations, [], `gate (b) structural scan: ${JSON.stringify(violations)}`);

    const keyboard = checkKeyboardWalk(body as never);
    assert.deepEqual(keyboard, [], `gate (c) keyboard walk: ${JSON.stringify(keyboard)}`);
  } finally {
    await h.unmount();
    for (let i = 0; i < 3; i++) await h.settle();
  }
}

// --- fixtures (the same rows the behavioural suites use) ---------------------

const RECEIPT_ROW = {
  receipt_kind: "entry_post", receipt_id: "receipt-7f10", firm_id: "firm-1", client_id: "client-9b71",
  subject_id: "entry-4d21", acting_actor: "clara-agent", on_behalf_of: "user-tao",
  occurred_at: "2026-08-30T02:15:00Z", model: "claude-fable-5", model_version: "2026-08-01",
  rationale: "Vendor matched an existing coding rule.", verdict: { admitted: true },
  failing_rungs: ["counterparty_resolved"], via_wake_kind: "interactive", trigger_kind: "document",
  trigger_id: "doc-1", authorization_id: null, adopted_verbatim: true, scope: "client",
};

const FQ_OPEN = {
  id: "fq-4e21", firm_id: "firm-1", document_id: "doc-88a1", kind: "unattributed",
  question_text: "Which client does this BRIGHTPATH invoice belong to?",
  candidates: [], status: "open", opened_by: "clara-agent", opened_at: "2026-08-30T01:00:00Z",
  settled_by: null, settled_at: null, settlement_text: null, named_client: null, receipt_id: null,
};

const CP_OPEN = {
  id: "prop-6f30", firm_id: "firm-1", client_id: "client-rome", fiscal_year_id: "fy-2025",
  close_run_id: "crun-6f30", state: "open", proposed_by: "clara-agent", bound_digests: {},
  drafted: [{ check_key: "bank_reconciled", item_key: "acct-1" }],
  narrative: "Every gate item for FY2025 is covered.", model_name: "claude-fable-5",
  model_version: "2026-08-01", rationale: "Both remaining gates carry live attestations.",
  settled_by: null, settled_at: null, settle_reason: null, created_at: "2026-08-30T02:00:00Z",
};

const FREEFORM_ROW = {
  id: 90071992547409911, firm_id: "firm-1", credential_id: "cred-1",
  query_text: "select account_code from clara.journal_entry_legs", purpose: "Checking which accounts moved.",
  at: "2026-08-30T03:00:00Z", verb: "wake_freeform_read", scope: "client", client_scope: ["client-9b71"],
  acting_actor: "clara-agent", on_behalf_of: "user-tao", via_wake_kind: "interactive_client",
  task_id: "task-1", op_key: "op-1", settled_at: "2026-08-30T03:00:02Z", outcome: "ok",
  refusal_reason: null, rung_vector: {}, relations_read: ["clara.journal_entry_legs"],
  row_count: 42, byte_count: 1180, duration_ms: 37, model_snapshot: {},
};

const SWEEP_RUN = {
  id: "run-3c88", firm_id: "firm-1", state: "finalized",
  window_started_at: "2026-08-30T00:00:00Z", window_ended_at: "2026-08-30T01:00:00Z",
  expected_count: 17, drafted_count: 11, posted_count: 5, skipped_count: 3, refused_count: 2,
  token_reserved: 900, token_spent: 850, checkpoint_seq: 7, acknowledged_by: null,
  acknowledged_at: null, created_at: "2026-08-30T00:00:00Z", finalized_at: "2026-08-30T01:00:00Z",
};

const SWEEP_ITEMS = [{
  run_id: "run-3c88", filing_id: "filing-a1", firm_id: "firm-1", client_id: "client-1",
  document_id: "doc-1", outcome: "drafted", entry_id: "entry-a1", refusal_token: null,
  tokens_reserved: 50, tokens_spent: 48, created_at: "2026-08-30T00:10:00Z",
}];

const CLIENTS = [{ id: "client-rome", name: "ROME PROPERTIES", status: "active", created_at: "2026-01-01T00:00:00Z" }];

// --- the five cards ----------------------------------------------------------

test("agent_receipt card: zero a11y violations and a clean keyboard walk", async () => {
  await withMockedEnv(
    () => jsonResponse([RECEIPT_ROW]),
    () => scanCard({ type: "agent_receipt", receipt_kind: "entry_post", receipt_id: "receipt-7f10", client_id: "client-9b71" }),
  );
});

test("freeform_result card: zero a11y violations and a clean keyboard walk", async () => {
  await withMockedEnv(
    () => jsonResponse([FREEFORM_ROW]),
    () => scanCard({ type: "freeform_result", read_id: "90071992547409911" }),
  );
});

test("firm_question card at rest: zero a11y violations and a clean keyboard walk", async () => {
  await withMockedEnv(
    (url) => (url.includes("/rest/v1/clients") ? jsonResponse(CLIENTS) : jsonResponse([FQ_OPEN])),
    () => scanCard({ type: "firm_question", question_id: "fq-4e21" }),
  );
});

test("firm_question card with the ANSWER form open (input + client select): still zero from both gates", async () => {
  await withMockedEnv(
    (url) => (url.includes("/rest/v1/clients") ? jsonResponse(CLIENTS) : jsonResponse([FQ_OPEN])),
    // The state that introduces a text field AND a <select> — both of which need
    // an accessible name of their own, and neither of which the resting scan sees.
    () => scanCard({ type: "firm_question", question_id: "fq-4e21" }, "Answer"),
  );
});

test("close_proposal card at rest: zero a11y violations and a clean keyboard walk", async () => {
  await withMockedEnv(
    () => jsonResponse([CP_OPEN]),
    () => scanCard({ type: "close_proposal", proposal_id: "prop-6f30", close_run_id: "crun-6f30", client_id: "client-rome" }),
  );
});

test("close_proposal card with the WITHDRAW consent open (reason field): still zero from both gates", async () => {
  await withMockedEnv(
    () => jsonResponse([CP_OPEN]),
    () => scanCard({ type: "close_proposal", proposal_id: "prop-6f30", close_run_id: "crun-6f30", client_id: "client-rome" }, "Withdraw"),
  );
});

test("sweep_receipt card (裁-20) with the acknowledge control live: zero a11y violations and a clean keyboard walk", async () => {
  await withMockedEnv(
    () => jsonResponse({ run: SWEEP_RUN, items: SWEEP_ITEMS }),
    () => scanCard({ type: "sweep_receipt", run_id: "run-3c88" }),
  );
});
