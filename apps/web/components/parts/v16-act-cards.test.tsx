// The two ACT-BEARING chatTurn_v16 cards — `firm_question` and
// `close_proposal` (P6-2, ruling Q8). These carry this bump's only judgement
// logic, so this suite is where the gates and the refusal branches are proven.
//
// EVERY CLICK GOES THROUGH `clickButton`, WHICH THROWS ON A DISABLED NODE. That
// is the point rather than a convenience: a click helper able to fire a disabled
// button's handler is the one tool in this harness capable of manufacturing a
// false green on a permanently-unopenable door. So the shape is always ASSERT
// THE GATE, THEN ACT — `.disabled` read directly for the closed case, and
// `clickButton` for the open one.
//
// EVERY ACT ASSERTS A DISCRIMINATING POST-CONDITION — something true ONLY after
// that click. `useHydratedPart().act()` re-reads after every write, so the mock
// serves a DIFFERENT row on the reload, and the cell asserts the settled facts
// that could not have been on screen beforehand. A test that matched a word
// already present before the click would survive deleting the very component it
// exists to prove (apps/web/AGENTS.md's own law).
//
// AND THE DOOR'S ARGUMENTS ARE READ OFF THE REQUEST BODY, never inferred from
// what the screen did afterwards: a card can re-render plausibly having called
// the door with the wrong subject.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { clickButton, renderComponent, setFieldValue, setNativeValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import { ThreadActionCoordinatorProvider } from "../../lib/parts/thread-action-coordinator";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "./PartRenderer";
import type { ClaraPart, CloseProposalPart, FirmQuestionPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Call = { url: string; body: unknown };
type Seen = { calls: Call[] };
const CALLER_CONTEXT = [{
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "22222222-2222-4222-8222-222222222222",
  firm_name: "BELCORT",
  role: "owner",
  role_rank: 40,
  is_operator: true,
}];

function withMockedEnv(impl: (url: string) => Response, run: (seen: Seen) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const seen: Seen = { calls: [] };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (u: unknown, init?: { body?: unknown }) => {
    const url = String(u);
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    seen.calls.push({ url, body });
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
    return impl(url);
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run(seen).finally(() => {
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

const buttonNamed = (label: string) => (n: Stub) => n.tagName === "BUTTON" && textOf(n).trim() === label;
const rpcCall = (seen: Seen, fn: string) => seen.calls.find((c) => c.url.includes(`/rest/v1/rpc/${fn}`));

/** The single input a card reveals when a mode is selected. */
const anyInput = (n: Stub) => n.tagName === "INPUT";

// --- firm_question -----------------------------------------------------------

const FQ: FirmQuestionPart = { type: "firm_question", question_id: "fq-4e21" };

/** One `clara.firm_open_questions_visible` row. `candidates` is the open jsonb
 *  the card's header says it never walks — the numeral inside is the mutant. */
const FQ_OPEN = {
  id: "fq-4e21",
  firm_id: "firm-1",
  document_id: "doc-88a1",
  kind: "unattributed",
  question_text: "Which client does this BRIGHTPATH invoice belong to?",
  candidates: [{ guess: "ROME PROPERTIES", model_amount_cents: 616161 }],
  status: "open",
  opened_by: "clara-agent",
  opened_at: "2026-08-30T01:00:00Z",
  settled_by: null,
  settled_at: null,
  settlement_text: null,
  named_client: null,
  receipt_id: null,
};

const FQ_RESOLVED = {
  ...FQ_OPEN,
  status: "resolved",
  settled_by: "user-tao",
  settled_at: "2026-08-30T04:00:00Z",
  settlement_text: "It is ROME PROPERTIES — the site address matches.",
  named_client: "client-rome",
};

const CLIENTS = [{ id: "client-rome", name: "ROME PROPERTIES", status: "active", created_at: "2026-01-01T00:00:00Z" }];

function fqRouter(question: unknown) {
  return (url: string): Response => {
    if (url.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([question]);
    if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
    if (url.includes("/rest/v1/rpc/resolve_firm_question")) return jsonResponse({ ok: true });
    if (url.includes("/rest/v1/rpc/dismiss_firm_question")) return jsonResponse({ ok: true });
    throw new Error(`unexpected fetch: ${url}`);
  };
}

test("firm_question renders the DB's own question verbatim, and NEVER a numeral from the model-authored `candidates`", async () => {
  await withMockedEnv(fqRouter(FQ_OPEN), async () => {
    const h = await renderComponent(App(FQ));
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const text = h.text();
      assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "firm_question must never reach the unsupported-part chip");
      assert.match(text, /Firm question/);
      assert.ok(text.includes(FQ_OPEN.question_text), "the question text must render verbatim");
      assert.match(text, /doc-88a1/, "the document the question hangs off must render");
      assert.match(text, /Awaiting an answer/, "an open question must say so");
      // `candidates` is caller-shaped jsonb with a schema for exactly one kind
      // and none for the other six — a figure inside it is model-authored.
      assert.doesNotMatch(text, /616161/, "a numeral inside `candidates` must never reach the screen");
      assert.doesNotMatch(text, /\[object Object\]/);
    } finally {
      await h.unmount();
    }
  });
});

test("firm_question: the Submit gate is CLOSED on empty text, and resolving posts question_id + the named client, then re-reads to the settled row", async () => {
  // The reload after the act serves the RESOLVED row — the post-condition below
  // is only reachable through a real door call followed by a real re-read.
  let served: unknown = FQ_OPEN;
  await withMockedEnv(
    (url) => {
      if (url.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([served]);
      if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
      if (url.includes("/rest/v1/rpc/resolve_firm_question")) {
        served = FQ_RESOLVED;
        return jsonResponse({ ok: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (seen) => {
      const h = await renderComponent(App(FQ));
      try {
        for (let i = 0; i < 5; i++) await h.settle();

        await clickButton(h.find(buttonNamed("Answer"))!);
        for (let i = 0; i < 2; i++) await h.settle();

        // THE GATE, asserted directly — never by routing a click through it.
        const submitClosed = h.find(buttonNamed("Submit"));
        assert.ok(submitClosed, "the Submit control must RENDER while gated, not be hidden");
        assert.equal(submitClosed.disabled, true, "Submit must be disabled until the human has typed an answer");

        // `<Input>` is base-ui backed: its own onChange wrapper reads
        // `event.currentTarget`/`nativeEvent` before forwarding, so a DISPATCHED
        // event never reaches the consumer's handler and the field silently keeps
        // its initial value — exactly the false green the harness's own header
        // warns about. `setFieldValue` is the one instrument for that. The plain
        // `<select>` under NativeSelect has no wrapper and takes real dispatch.
        await h.act(() => {
          setFieldValue(h.find(anyInput)!, "It is ROME PROPERTIES — the site address matches.");
        });
        const select = h.find((n) => n.tagName === "SELECT")!;
        await h.fireEvent(select, "change", (n) => setNativeValue(n, "value", "client-rome"));
        await h.settle();

        await clickButton(h.find(buttonNamed("Submit"))!);
        for (let i = 0; i < 6; i++) await h.settle();

        // THE DOOR'S OWN ARGUMENTS, read off the request body.
        const call = rpcCall(seen, "resolve_firm_question");
        assert.ok(call, "resolve_firm_question must have been called");
        const body = call.body as Record<string, unknown>;
        assert.equal(body.p_question, "fq-4e21", "the subject is the part's own question_id");
        assert.equal(body.p_resolution, "It is ROME PROPERTIES — the site address matches.");
        assert.equal(body.p_client, "client-rome", "the human's named client rides p_client");
        assert.ok(typeof body.p_op_key === "string" && body.p_op_key.length > 0, "the actor-scoped deterministic op_key reaches the door");

        // THE DISCRIMINATING POST-CONDITION: settled facts that did NOT exist on
        // screen before the click, plus the act controls genuinely gone.
        const after = h.text();
        assert.match(after, /Resolved/, "the re-read must show the settled status");
        assert.match(after, /user-tao/, "settled_by is only on the post-act row");
        assert.match(after, /client-rome/, "named_client is only on the post-act row");
        assert.equal(h.find(buttonNamed("Answer")), null, "a settled question offers no act — the gate SHAPES the card");
        assert.equal(h.find(buttonNamed("Dismiss")), null);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("firm_question surfaces a governed refusal VERBATIM and keeps what the human typed", async () => {
  await withMockedEnv(
    (url) => {
      if (url.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([FQ_OPEN]);
      if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
      if (url.includes("/rest/v1/rpc/dismiss_firm_question")) {
        // A real CLR shape: someone else settled it first.
        return jsonResponse({ code: "CLR10", message: "question is not open", details: '{"reason":"not_open"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(FQ));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        await clickButton(h.find(buttonNamed("Dismiss"))!);
        await h.settle();

        await h.act(() => {
          setFieldValue(h.find(anyInput)!, "duplicate of an earlier question");
        });
        await h.settle();
        await clickButton(h.find(buttonNamed("Submit"))!);
        for (let i = 0; i < 6; i++) await h.settle();

        const after = h.text();
        // The refusal is the DB's own bytes — never re-worded, never retried.
        assert.match(after, /CLR10/, "the CLR code must render");
        assert.match(after, /question is not open/, "the door's own message must render verbatim");
        // The refusal is STICKY across the re-read the failure itself triggers:
        // the row still reads fine, and a read succeeding must not erase the
        // write's own refusal (hooks.ts finding 1).
        assert.ok(after.includes(FQ_OPEN.question_text), "the object is still real and stays on screen");
        assert.equal((h.find(anyInput) as { value?: string } | null)?.value, "duplicate of an earlier question", "a refusal must never discard what the human typed");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("firm_question with a BLANK question_id fails closed: a visible notice, and NO request is ever made", async () => {
  await withMockedEnv(
    () => {
      throw new Error("no request may be made for an unaddressable part");
    },
    async (seen) => {
      const h = await renderComponent(App({ ...FQ, question_id: "" }));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.deepEqual(seen.calls.filter((call) => !call.url.includes("/caller_context")), [], "an unaddressable part must never issue an object request");
        assert.match(h.text(), /could not be opened/);
        assert.match(h.text(), /question_id/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("firm_question still answers when the client register cannot be read — the enrichment fails, the card does not", async () => {
  await withMockedEnv(
    (url) => {
      if (url.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([FQ_OPEN]);
      if (url.includes("/rest/v1/clients")) return jsonResponse({ message: "permission denied for table clients" }, 403);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(FQ));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.ok(h.text().includes(FQ_OPEN.question_text), "the question read is what this card IS — it must survive the register read failing");
        await clickButton(h.find(buttonNamed("Answer"))!);
        await h.settle();
        assert.match(h.text(), /client list could not be read/, "the degraded arm is named honestly");
        assert.equal(h.find((n) => n.tagName === "SELECT"), null, "no client control when the register is unavailable — never an empty select implying no clients exist");
        assert.ok(h.find(anyInput), "the answer field is still offered: a question is answerable without naming anyone");
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- close_proposal ----------------------------------------------------------

const CP: CloseProposalPart = {
  type: "close_proposal",
  proposal_id: "prop-6f30",
  close_run_id: "crun-6f30",
  client_id: "client-rome",
};

/** One `clara.close_proposals` row. `bound_digests` is the open payload the
 *  card's header says it never walks — the numeral inside is the mutant. */
const CP_OPEN = {
  id: "prop-6f30",
  firm_id: "firm-1",
  client_id: "client-rome",
  fiscal_year_id: "fy-2025",
  close_run_id: "crun-6f30",
  state: "open",
  proposed_by: "clara-agent",
  bound_digests: { trial_balance: "sha256:aa", model_reported_total_cents: 313131 },
  drafted: [
    { check_key: "bank_reconciled", item_key: "acct-1" },
    { check_key: "depreciation_posted", item_key: null },
  ],
  narrative: "Every gate item for FY2025 is covered; the bank is reconciled to the statement.",
  model_name: "claude-fable-5",
  model_version: "2026-08-01",
  rationale: "Both remaining gates carry live attestations on this run.",
  settled_by: null,
  settled_at: null,
  settle_reason: null,
  created_at: "2026-08-30T02:00:00Z",
};

const CP_WITHDRAWN = {
  ...CP_OPEN,
  state: "withdrawn",
  settled_by: "user-tao",
  settled_at: "2026-08-30T05:00:00Z",
  settle_reason: "The August bank statement has not landed yet.",
};

test("close_proposal renders Clara's reasoning and the drafted gate items, and NEVER a numeral from `bound_digests`", async () => {
  await withMockedEnv(
    () => jsonResponse([CP_OPEN]),
    async () => {
      const h = await renderComponent(App(CP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const text = h.text();
        assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "close_proposal must never reach the unsupported-part chip");
        assert.match(text, /Close proposal/);
        assert.ok(text.includes(CP_OPEN.narrative), "the proposal's narrative is DB-stored prose — rendered verbatim");
        assert.ok(text.includes(CP_OPEN.rationale), "the rationale likewise");
        assert.match(text, /claude-fable-5 2026-08-01/, "the authoring model is named");
        // The drafted items are LISTED by their DB keys, never counted.
        assert.match(text, /bank_reconciled · acct-1/, "a drafted item with an item_key renders both");
        assert.match(text, /depreciation_posted/, "an item_key-less drafted item still renders its check_key");
        assert.doesNotMatch(text, /313131/, "a numeral inside `bound_digests` must never reach the screen");
        assert.doesNotMatch(text, /\[object Object\]/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("close_proposal: Withdraw's confirm is CLOSED without a reason, and withdrawing posts the door's own arguments then re-reads to the settled row", async () => {
  let served: unknown = CP_OPEN;
  await withMockedEnv(
    (url) => {
      if (url.includes("/rest/v1/close_proposals")) return jsonResponse([served]);
      if (url.includes("/rest/v1/rpc/settle_close_proposal")) {
        served = CP_WITHDRAWN;
        return jsonResponse({ ok: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (seen) => {
      const h = await renderComponent(App(CP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();

        await clickButton(h.find(buttonNamed("Withdraw"))!);
        await h.settle();

        // Law 71: the consent step states what it does before it can be taken.
        assert.match(h.text(), /Withdrawing leaves the close run open/, "the consent must say what withdrawing does");
        const confirmClosed = h.find(buttonNamed("Withdraw this proposal"));
        assert.ok(confirmClosed, "the confirm control must RENDER while gated");
        assert.equal(confirmClosed.disabled, true, "the door requires a reason for 'withdrawn' — so does the card");

        await h.act(() => {
          setFieldValue(h.find(anyInput)!, "The August bank statement has not landed yet.");
        });
        await h.settle();
        await clickButton(h.find(buttonNamed("Withdraw this proposal"))!);
        for (let i = 0; i < 6; i++) await h.settle();

        const call = rpcCall(seen, "settle_close_proposal");
        assert.ok(call, "settle_close_proposal must have been called");
        const body = call.body as Record<string, unknown>;
        assert.equal(body.p_proposal, "prop-6f30", "the subject is the part's own proposal_id");
        assert.equal(body.p_state, "withdrawn");
        assert.equal(body.p_reason, "The August bank statement has not landed yet.");

        const after = h.text();
        assert.match(after, /withdrawn/, "the re-read must show the settled state");
        assert.match(after, /user-tao/, "settled_by exists only on the post-act row");
        assert.equal(h.find(buttonNamed("Adopt")), null, "a settled proposal offers no act");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("close_proposal: adopting shows what it approves BEFORE the confirm, then posts state 'adopted' with no reason", async () => {
  let served: unknown = CP_OPEN;
  await withMockedEnv(
    (url) => {
      if (url.includes("/rest/v1/close_proposals")) return jsonResponse([served]);
      if (url.includes("/rest/v1/rpc/settle_close_proposal")) {
        served = { ...CP_OPEN, state: "adopted", settled_by: "user-tao", settled_at: "2026-08-30T05:30:00Z" };
        return jsonResponse({ ok: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (seen) => {
      const h = await renderComponent(App(CP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        await clickButton(h.find(buttonNamed("Adopt"))!);
        await h.settle();

        // Law 71, and the workbench panel's own FIX-4 finding: the human must be
        // able to SEE the narrative, the reasoning and the covered gate items at
        // the moment of consent — not behind a modal that hides them.
        const consent = h.text();
        assert.match(consent, /Adopting binds the firm to Clara's judgement/);
        assert.ok(consent.includes(CP_OPEN.narrative), "the narrative stays on screen at the consent step");
        assert.match(consent, /bank_reconciled · acct-1/, "the covered gate items stay on screen at the consent step");

        await clickButton(h.find(buttonNamed("Adopt this proposal"))!);
        for (let i = 0; i < 6; i++) await h.settle();

        const body = rpcCall(seen, "settle_close_proposal")!.body as Record<string, unknown>;
        assert.equal(body.p_state, "adopted");
        assert.equal(body.p_reason, null, "a reason is optional for 'adopted' — the covering attestations carry their own");
        assert.match(h.text(), /adopted/, "the re-read must show the settled state");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("close_proposal renders 'not visible' when the run's list carries no such proposal — never a fabricated plan", async () => {
  await withMockedEnv(
    // The run exists and has proposals, but none is THIS one.
    () => jsonResponse([{ ...CP_OPEN, id: "prop-someone-else" }]),
    async () => {
      const h = await renderComponent(App(CP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const text = h.text();
        assert.match(text, /not visible to your session/, "picking the wrong row from the list would be inventing a proposal");
        assert.doesNotMatch(text, /Every gate item for FY2025/, "another proposal's narrative must never render under this card's id");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("close_proposal with a BLANK close_run_id fails closed: a visible notice, and NO request is ever made", async () => {
  await withMockedEnv(
    () => {
      throw new Error("no request may be made for an unaddressable part");
    },
    async (seen) => {
      const h = await renderComponent(App({ ...CP, close_run_id: "" }));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.deepEqual(seen.calls.filter((call) => !call.url.includes("/caller_context")), [], "an unaddressable part must never issue an object request");
        assert.match(h.text(), /could not be opened/);
        assert.match(h.text(), /proposal_id, close_run_id, client_id/);
      } finally {
        await h.unmount();
      }
    },
  );
});
