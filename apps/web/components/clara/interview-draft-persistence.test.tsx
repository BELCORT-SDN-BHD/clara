// SPEC-897-1 (code review, wave1-lane08) — REPRODUCTION, not a #897 deliverable.
//
// #897's own AC1 asks for a mock-lane cell that "drives the full-screen altitude change and
// asserts focus return and typed-data survival". Building that cell needs a NEW interview-runtime
// mock subsystem (an OPEN/unanswered park fixture plus `/api/runtime/interview/*` handlers wired
// through the rail) that this lane's own report scoped out as a genuine multi-piece build, not a
// same-shape addition — see docs/plan/active/riders-2026-09-20/reports/wave1-lane08-final.md and
// wave1-lane08-fixround-1.md's #897 sections. That investigation traced, by reading source, that
// `InterviewRunCard.tsx`'s typed answer is a plain, un-persisted `useState("")` — so a walk
// asserting survival would have nothing true to assert until an owner ruling authorises the
// production persistence work.
//
// This cell is the "cheap empirical probe" that report's own "Anything unverified" section named
// as cheaper than the full walk: it does not reach the rail or the route-group boundary, but it
// answers the one question that determines whether either survives an unmount at all — is the
// typed answer held anywhere other than the mounted component's own local state? Two fresh
// `ClaraFullScreenThread` instances (the harness `interview-run-keyboard.test.tsx` already mounts
// for this exact card) against the SAME server-side run prove it directly: type into instance A,
// unmount it without submitting, mount a fresh instance B onto the same run, and read what its
// answer field starts with. If NOTHING kept the text, this is the mechanism the rail<->full-screen
// escalation would hit too (an even harder teardown: a different route group, not just a fresh
// instance of the same one — see rail-mount.tsx's "WHAT SURVIVES A SWITCH" note for the general
// rule this cell is the concrete instance of).
//
// This test asserts CURRENT behaviour (the gap), not the ticket's desired behaviour. It is
// expected to keep passing until #897 lands real persistence — at which point this assertion is
// the one that should flip, and this comment is the pointer to why.
//
// VACUITY CONTROL, attempted and recorded honestly rather than claimed clean: a synthetic
// "restore on mount" mutation (a module-level variable plus a mount effect calling `setDraft`)
// was applied to `InterviewRunCard.tsx` and reverted byte for byte. Direct instrumentation
// confirmed the mutated subject's REAL React state did become "Rome Public Advisory" for the
// second instance — but this harness's DOM stub (`test/hookHarness.ts`'s `renderComponent`) did
// not reflect that program-driven value change into the textarea's queried `.value`; only
// `setFieldValue`'s explicit native-value write (used above for instance A) does. So this cell's
// sensitivity rests on independent static evidence instead: `InterviewRunCard.tsx` has exactly
// two `setDraft` call sites in the whole file (the `onChange` below and one clear-on-submit), no
// third path that could source a non-empty initial value, which is what this assertion actually
// depends on. Filed as a follow-up: the harness gap (program-driven controlled-value updates not
// reaching a queried node's `.value`) is worth its own fix, separately from this ticket.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { enableDomInspection } from "../../test/domInspect";
import { renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClaraFullScreenThread } from "./ClaraFullScreenThread";

enableDomInspection();

type Node = {
  tagName?: string;
  childNodes?: Node[];
  getAttribute?: (name: string) => string | null;
};

function findIn(root: Node, predicate: (node: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const child of root.childNodes ?? []) {
    const found = findIn(child, predicate);
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

const OPEN_PLAN = {
  id: "plan-1", firm_id: "f1", scope_kind: "client", client_id: "c1", state: "open",
  revision_token: "rev-1", revision_n: 1, committed_at: null, committed_by: null,
  review_maker: "u1", reviewed_at: "2026-08-01T00:00:00Z", contributors: ["u1"],
  commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};

const ITEM = {
  id: "i1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "legal_name",
  question: "What is the client's legal name?", answer: null, state: "pending", required_for_commit: true,
  answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
};

// The SAME run every fetch below answers with — the server-side half of an OPEN, awaiting-input
// park is what a real escalation would resume; only the CLIENT-side typed text is in question.
const RUN_STATE = {
  run_id: "run-1", scope: "client", status: "awaiting_input",
  pending_park: { parkIndex: 1, seg: "legal_name", phase: "q", question: "What is the client's legal name?" },
  terminal: null, activity: [], plan: { id: "plan-1" }, items: [],
};

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(ClaraFullScreenThread, {
      threadId: "",
      clientId: "c1",
      returnHref: "/clients/c1",
    }),
  });
}

test("SPEC-897-1 reproduction — a typed-but-unsubmitted interview answer does not survive an unmount of the card that held it", async () => {
  await withMockedEnv(
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([OPEN_PLAN]);
      if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([ITEM]);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: "onboarding" }]);
      if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([]);
      if (url.includes("/rest/v1/chat_sessions")) return jsonResponse([]);
      if (url === "/api/runtime/interview/client/start") return jsonResponse({ run_id: "run-1" }, 202);
      if (url.startsWith("/api/runtime/interview/state?")) return jsonResponse(RUN_STATE);
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const body = (globalThis as unknown as { document: { body: Node & { appendChild: (child: unknown) => void } } }).document.body;

      // Instance A: start the run, type an answer, and walk away without sending it.
      const a = await renderComponent(App());
      body.appendChild(a.container);
      try {
        for (let i = 0; i < 6; i++) await a.settle();
        const start = a.find((node) => node.tagName === "BUTTON" && textOf(node) === "Start / continue interview");
        assert.ok(start, "the idempotent start/continue control must render");
        await a.fireEvent(start!, "click");
        for (let i = 0; i < 10; i++) await a.settle();

        const answerA = a.find((node) => node.tagName === "TEXTAREA" && (node as unknown as Node).getAttribute?.("aria-label") === "Your answer");
        assert.ok(answerA, "the answer field must render for an awaiting-input park");
        await a.act(() => setFieldValue(answerA as never, "Rome Public Advisory"));
        assert.equal((answerA as unknown as { value?: string }).value, "Rome Public Advisory", "precondition: the typed text is in instance A's field");
      } finally {
        // No submit. This is the escalation moment: the tree this text lived in goes away.
        await a.unmount();
        for (let i = 0; i < 5; i++) await a.settle();
      }

      // Instance B: a FRESH mount against the identical server-side run (same run_id, same
      // pending_park) — what landing on the full-screen route after an escalation, or coming
      // back to the rail after one, both do to this card's own React identity.
      const b = await renderComponent(App());
      body.appendChild(b.container);
      try {
        for (let i = 0; i < 6; i++) await b.settle();
        const start = b.find((node) => node.tagName === "BUTTON" && textOf(node) === "Start / continue interview");
        assert.ok(start, "the idempotent start/continue control must render again on the fresh instance");
        await b.fireEvent(start!, "click");
        for (let i = 0; i < 10; i++) await b.settle();

        const answerB = findIn(body, (node) => node.tagName === "TEXTAREA" && node.getAttribute?.("aria-label") === "Your answer");
        assert.ok(answerB, "the fresh instance still offers the answer field for the same awaiting-input park");
        assert.equal(
          (answerB as unknown as { value?: string }).value ?? "",
          "",
          "TODAY: the text typed into instance A is gone from instance B — InterviewRunCard's `draft` " +
          "is a plain useState with no persistence (see ticket 897; SPEC-897-1). This assertion " +
          "documents the current gap and is the one that should flip once ticket 897 threads the draft " +
          "through a persisted, altitude-keyed store the way claraThreadStore.drafts already does for " +
          "the composer.",
        );
      } finally {
        await b.unmount();
        for (let i = 0; i < 5; i++) await b.settle();
      }
    },
  );
});
