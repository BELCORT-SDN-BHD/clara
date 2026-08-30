// PR #459 fold round 2: the hydrated close identity wall and inline-form
// focus transitions. Concurrency/op-key cells live beside the coordinator so
// these tests stay attributable to the two card components themselves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { clickButton, renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import { ThreadActionCoordinatorProvider, threadActionOpKey } from "../../lib/parts/thread-action-coordinator";
import { PartRenderer } from "./PartRenderer";
import type { ClaraPart, CloseProposalPart, FirmQuestionPart, SweepReceiptPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Call = { url: string; body: unknown };
const CALLER_CONTEXT = [{
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "22222222-2222-4222-8222-222222222222",
  firm_name: "BELCORT",
  role: "owner",
  role_rank: 40,
  is_operator: true,
}];

function withMockedEnv(
  impl: (url: string, body: unknown) => Response | Promise<Response>,
  run: (calls: Call[]) => Promise<void>,
  callerContext: unknown = CALLER_CONTEXT,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const calls: Call[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext);
    return impl(url, body);
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run(calls).finally(() => {
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
    children: createElement(
      ThreadActionCoordinatorProvider,
      { session: sessionTokenAccessor, children: createElement(PartRenderer, { part }) },
    ),
  });
}

function AppMany(parts: ClaraPart[]): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(ThreadActionCoordinatorProvider, {
      session: sessionTokenAccessor,
      children: createElement(
        "div",
        null,
        ...parts.map((part, index) => createElement(PartRenderer, { key: index, part })),
      ),
    }),
  });
}

const buttonNamed = (label: string) => (node: Stub) =>
  node.tagName === "BUTTON" && textOf(node).trim() === label;

function findAll(node: Stub, predicate: (candidate: Stub) => boolean): Stub[] {
  const found = predicate(node) ? [node] : [];
  for (const child of (node.childNodes as Stub[] | undefined) ?? []) found.push(...findAll(child, predicate));
  return found;
}

function setActiveElement(node: Stub): void {
  (document as unknown as { activeElement: Stub }).activeElement = node;
}

const FQ: FirmQuestionPart = { type: "firm_question", question_id: "fq-focus" };
const FQ_OPEN = {
  id: "fq-focus",
  firm_id: "firm-1",
  document_id: "doc-focus",
  kind: "unattributed",
  question_text: "Which client owns this invoice?",
  candidates: [],
  status: "open",
  opened_by: "clara-agent",
  opened_at: "2026-08-30T01:00:00Z",
  settled_by: null,
  settled_at: null,
  settlement_text: null,
  named_client: null,
  receipt_id: null,
};
const CLIENTS = [{ id: "client-rome", name: "ROME PROPERTIES", status: "active", created_at: "2026-01-01T00:00:00Z" }];

const CP: CloseProposalPart = {
  type: "close_proposal",
  proposal_id: "proposal-focus",
  close_run_id: "run-focus",
  client_id: "client-rome",
};
const CP_OPEN = {
  id: "proposal-focus",
  firm_id: "firm-1",
  client_id: "client-rome",
  fiscal_year_id: "fy-2025",
  close_run_id: "run-focus",
  state: "open",
  proposed_by: "clara-agent",
  bound_digests: {},
  drafted: [{ check_key: "bank_reconciled", item_key: null }],
  narrative: "The verified proposal narrative must never cross an identity mismatch.",
  model_name: "claude-fable-5",
  model_version: "2026-08-01",
  rationale: "Every drafted item carries a live attestation.",
  settled_by: null,
  settled_at: null,
  settle_reason: null,
  created_at: "2026-08-30T02:00:00Z",
};

const SWEEP_A: SweepReceiptPart = { type: "sweep_receipt", run_id: "run-a" };
const SWEEP_B: SweepReceiptPart = { type: "sweep_receipt", run_id: "run-b" };
const sweepDetail = (id: string) => ({
  run: {
    id,
    firm_id: "firm-1",
    state: "finalized",
    window_started_at: "2026-08-30T00:00:00Z",
    window_ended_at: "2026-08-30T01:00:00Z",
    expected_count: 2,
    drafted_count: 1,
    posted_count: 0,
    skipped_count: 1,
    refused_count: 0,
    token_reserved: 10,
    token_spent: 8,
    checkpoint_seq: 1,
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: "2026-08-30T00:00:00Z",
    finalized_at: "2026-08-30T01:00:00Z",
  },
  items: [],
});

test("close_proposal fails closed when the hydrated proposal belongs to another client", async () => {
  await withMockedEnv(
    () => jsonResponse([{ ...CP_OPEN, client_id: "client-other" }]),
    async (calls) => {
      const h = await renderComponent(App(CP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const text = h.text();
        assert.match(text, /could not be opened/, "the mismatched proposal must use the malformed fallback");
        assert.doesNotMatch(text, /verified proposal narrative/, "no proposal prose may cross the identity wall");
        assert.equal(h.find((node) => node.tagName === "A"), null, "no client link may be built from mismatched identities");
        assert.equal(h.find(buttonNamed("Adopt")), null, "a mismatched proposal exposes no governed act");
        assert.equal(h.find(buttonNamed("Withdraw")), null, "a mismatched proposal exposes no governed act");
        assert.equal(calls.filter((call) => call.url.includes("/rest/v1/rpc/")).length, 0, "hydrating a mismatch makes zero door calls");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("close_proposal fails closed when the hydrated proposal names another close run", async () => {
  await withMockedEnv(
    () => jsonResponse([{ ...CP_OPEN, close_run_id: "run-other" }]),
    async () => {
      const h = await renderComponent(App(CP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.match(h.text(), /could not be opened/);
        assert.doesNotMatch(h.text(), /verified proposal narrative/);
        assert.equal(h.find((node) => node.tagName === "A"), null);
        assert.equal(h.find(buttonNamed("Adopt")), null);
        assert.equal(h.find(buttonNamed("Withdraw")), null);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("one thread-wide guard drops a synchronous duplicate and a cross-card act, with every action disabled while the first is pending", async () => {
  const expectedKey = await threadActionOpKey({
    callerId: CALLER_CONTEXT[0]!.user_id,
    objectType: "sweep-run",
    objectId: "run-a",
    action: "acknowledge-sweep-run",
  });
  let acknowledgeA = 0;
  let acknowledgeB = 0;
  let releaseFirst = () => {};
  const firstPending = new Promise<Response>((resolve) => {
    releaseFirst = () => resolve(jsonResponse({ ok: true }));
  });

  await withMockedEnv(
    (url, body) => {
      if (url.includes("/rest/v1/rpc/get_sweep_run")) {
        const runId = (body as { p_run?: string } | null)?.p_run ?? "";
        return jsonResponse(sweepDetail(runId));
      }
      if (url.includes("/rest/v1/rpc/acknowledge_sweep_run")) {
        const runId = (body as { p_run?: string } | null)?.p_run;
        if (runId === "run-a") {
          acknowledgeA += 1;
          return firstPending;
        }
        acknowledgeB += 1;
        return jsonResponse({ ok: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      const h = await renderComponent(AppMany([SWEEP_A, SWEEP_B]));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const before = findAll(h.container, buttonNamed("Acknowledge this run"));
        assert.equal(before.length, 2, "two independent PartSlots must expose their own control");
        assert.equal(before[0]?.disabled, false);
        assert.equal(before[1]?.disabled, false);

        await h.act(() => {
          void clickButton(before[0]!);
          void clickButton(before[0]!);
          void clickButton(before[1]!);
        });
        for (let i = 0; i < 4 && acknowledgeA === 0; i++) await h.settle();

        assert.equal(acknowledgeA, 1, "a synchronous same-button double click must emit one RPC");
        assert.equal(acknowledgeB, 0, "a second PartSlot must be dropped while the first card owns the thread guard");
        assert.equal(
          calls.filter((call) => call.url.includes("/rest/v1/caller_context")).length,
          1,
          "one mounted thread performs one shared caller-context read, not one read per card",
        );
        const firstCall = calls.find((call) => call.url.includes("/rest/v1/rpc/acknowledge_sweep_run"));
        assert.equal((firstCall?.body as { p_op_key?: unknown } | undefined)?.p_op_key, expectedKey, "the UI key must bind the positively read actor and hydrated run");
        const pending = findAll(h.container, (node) => node.tagName === "BUTTON");
        assert.equal(pending.length, 2);
        for (const control of pending) {
          assert.equal(control.disabled, true, "every action control in the thread must share the pending busy gate");
        }
      } finally {
        releaseFirst();
        for (let i = 0; i < 5; i++) await h.settle();
        await h.unmount();
      }
    },
  );
});

test("governed card controls fail closed when caller_context does not positively identify exactly one actor", async () => {
  const invalidContexts = [
    { name: "absent", value: [] },
    { name: "ambiguous", value: [CALLER_CONTEXT[0], { ...CALLER_CONTEXT[0], user_id: "33333333-3333-4333-8333-333333333333" }] },
    { name: "malformed", value: [{ ...CALLER_CONTEXT[0], user_id: "not-a-uuid" }] },
  ];
  for (const invalid of invalidContexts) {
    await withMockedEnv(
      (url, body) => {
        if (url.includes("/rest/v1/rpc/get_sweep_run")) {
          return jsonResponse(sweepDetail((body as { p_run?: string } | null)?.p_run ?? ""));
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
      async (calls) => {
        const h = await renderComponent(App(SWEEP_A));
        try {
          for (let i = 0; i < 6; i++) await h.settle();
          const control = h.find(buttonNamed("Acknowledge this run"));
          assert.ok(control);
          assert.equal(control.disabled, true, `${invalid.name} caller context is not actor evidence`);
          assert.equal(
            calls.some((call) => call.url.includes("/rpc/acknowledge_sweep_run")),
            false,
            `${invalid.name} caller context must mint no key and reach no door`,
          );
        } finally {
          await h.unmount();
        }
      },
      invalid.value,
    );
  }
});

test("unknown firm status, question kind, and sweep outcome render through honest fail-soft arms", async () => {
  const unknownOutcome = "refused_something_new";
  await withMockedEnv(
    (url, body) => {
      if (url.includes("/rest/v1/firm_open_questions_visible")) {
        return jsonResponse([{ ...FQ_OPEN, kind: "onboarding_proposed", status: "escalated" }]);
      }
      if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
      if (url.includes("/rest/v1/rpc/get_sweep_run")) {
        const runId = (body as { p_run?: string } | null)?.p_run ?? "";
        return jsonResponse({
          ...sweepDetail(runId),
          items: [{
            run_id: runId,
            filing_id: "filing-unknown",
            firm_id: "firm-1",
            client_id: "client-rome",
            document_id: "document-unknown",
            outcome: unknownOutcome,
            entry_id: null,
            refusal_token: null,
            tokens_reserved: 0,
            tokens_spent: 0,
            created_at: "2026-08-30T00:10:00Z",
          }],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(AppMany([FQ, SWEEP_A]));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Unrecognized kind \(onboarding_proposed\)/, "an unregistered question kind must use the translated unknown arm");
        assert.match(text, /Status not recognised/, "an unregistered status must use the translated unknown arm");
        assert.match(text, /refused_something_new/, "an unregistered outcome must preserve the DB's own spelling");
        const badge = h.find((node) => node.tagName === "SPAN" && textOf(node).trim() === unknownOutcome);
        assert.ok(badge, "the unknown sweep outcome must render as a badge");
        const classList = badge.classList as { contains: (name: string) => boolean } | undefined;
        assert.ok(classList, "the rendered badge exposes its applied tone classes");
        assert.equal(classList.contains("bg-muted"), true, "unknown outcomes use the neutral arm");
        assert.equal(classList.contains("bg-info-muted"), false, "unknown outcomes are never bucketed as success/info");
        assert.equal(classList.contains("bg-warning-muted"), false, "a familiar prefix is not proof of a known refusal kind");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("firm_question moves focus into Resolve and Dismiss forms, then restores each originating trigger on Cancel", async () => {
  await withMockedEnv(
    (url) => {
      if (url.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([FQ_OPEN]);
      if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(FQ));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        for (const label of ["Answer", "Dismiss"]) {
          const trigger = h.find(buttonNamed(label));
          assert.ok(trigger, `${label} trigger must render`);
          setActiveElement(trigger);
          await h.act(() => clickButton(trigger));
          await h.settle();

          const input = h.find((node) => node.tagName === "INPUT");
          assert.ok(input, `${label} must reveal its text input`);
          assert.equal(document.activeElement, input, `${label} must focus the first revealed control`);

          await h.act(() => clickButton(h.find(buttonNamed("Cancel"))!));
          await h.settle();
          assert.equal(document.activeElement, trigger, `${label} Cancel must restore its own originating trigger`);
        }
      } finally {
        await h.unmount();
      }
    },
  );
});

test("close_proposal focuses Adopt confirm and Withdraw reason, then restores each originating trigger on Cancel", async () => {
  await withMockedEnv(
    () => jsonResponse([CP_OPEN]),
    async () => {
      const h = await renderComponent(App(CP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();

        const adopt = h.find(buttonNamed("Adopt"));
        assert.ok(adopt);
        setActiveElement(adopt);
        await h.act(() => clickButton(adopt));
        await h.settle();
        const adoptConfirm = h.find(buttonNamed("Adopt this proposal"));
        assert.ok(adoptConfirm);
        assert.equal(document.activeElement, adoptConfirm, "Adopt must focus the revealed confirm button");
        await h.act(() => clickButton(h.find(buttonNamed("Cancel"))!));
        await h.settle();
        assert.equal(document.activeElement, adopt, "Adopt Cancel must restore the Adopt trigger");

        const withdraw = h.find(buttonNamed("Withdraw"));
        assert.ok(withdraw);
        setActiveElement(withdraw);
        await h.act(() => clickButton(withdraw));
        await h.settle();
        const reason = h.find((node) => node.tagName === "INPUT");
        assert.ok(reason);
        assert.equal(document.activeElement, reason, "Withdraw must focus the revealed reason input");
        await h.act(() => clickButton(h.find(buttonNamed("Cancel"))!));
        await h.settle();
        assert.equal(document.activeElement, withdraw, "Withdraw Cancel must restore the Withdraw trigger");
      } finally {
        await h.unmount();
      }
    },
  );
});
