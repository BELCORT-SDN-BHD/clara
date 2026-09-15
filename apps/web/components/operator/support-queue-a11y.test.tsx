// #615 — STRUCTURAL A11Y AND STATE SCAN of the operator support destination (journey D3).
//
// THE TWO HALVES OF THE CONJUNCTION, both driven (the precedent this file replaces,
// `components/admin/registrations-a11y.test.tsx`, established it and it still holds): a
// NON-OPERATOR owner is refused, and an OPERATOR-firm ADMIN is refused. Testing only the happy
// operator path would leave `is_operator AND role_rank >= owner` half unproven, and the gate would
// keep passing on the day either conjunct stopped being read.
//
// …AND THE HALF THIS TICKET ADDS: the refusal renders ZERO ACTION CONTROLS and ZERO support data
// (#615 AC1), and the six read states plus the five act-failure states are DISTINCT, LABELLED
// regions rather than one red box (#615 AC3). Each is asserted through its own
// `data-operator-region` marker, which the components render for exactly this purpose — a
// class-name or copy match would pass on the day two states share a sentence.
//
// RED-BEFORE, recorded: replacing `firmCapabilitiesFromRows(...).canDecideFirmRegistrations` with
// `true` turns both refusal cells red (the queue read then fires and the mocked fetch throws
// "unexpected fetch"); collapsing the denied/empty branches of `operatorQueueOutcome` into one
// turns "a CLR04 refusal is its own region" red with `empty` present and `denied` absent.
//
// WHAT IT DOES NOT PROVE. The doors themselves are mocked PostgREST answers, so nothing here says
// Postgres would return this shape or refuse that caller — `packages/db/tests/operator-support.
// test.mjs` owns that half, under real least-privileged roles.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { OperatorSupportConsole } from "./support-queue";
import messages from "../../messages/en.json";

enableDomInspection();

// The harness's `window` stub has NO-OP event methods (test/hookHarness.ts), and
// `useOperatorQueue` registers a real `focus`/`visibilitychange` listener on mount. Swapped at
// MODULE scope so it is in place BEFORE any mount effect registers against the old no-op — the
// technique `components/firm/activity/activity-feed.test.tsx` established for the same hook shape.
const realEventTarget = new EventTarget();
globalThis.window.addEventListener = realEventTarget.addEventListener.bind(realEventTarget);
globalThis.window.removeEventListener = realEventTarget.removeEventListener.bind(realEventTarget);
globalThis.window.dispatchEvent = realEventTarget.dispatchEvent.bind(realEventTarget);

const router = { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };

const CALLER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CALLER_FIRM_ID = "11111111-1111-4111-8111-111111111111";
const REGISTRATION_CASE = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const PAYMENT_CASE = "3f2504e0-4f89-41d3-9a0c-0305e82c3302";
const PROBLEM_CASE = "3f2504e0-4f89-41d3-9a0c-0305e82c3303";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A governed refusal EXACTLY as PostgREST frames one — `code` + `message` + a JSON `details`
 *  string — so `lib/wire.ts` classifies it into a real `RefusalError` rather than a WireError. */
function clrResponse(code: string, message: string, reason?: string): Response {
  return jsonResponse({ code, message, details: reason ? JSON.stringify({ reason }) : undefined }, 400);
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

function App(children: unknown, heading: string, search = "") {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams(search) as never },
      createElement(
        AppRouterContext.Provider as never,
        { value: router as never },
        createElement(
          PathnameContext.Provider as never,
          { value: "/operator" as never },
          createElement(
            "div",
            null,
            createElement("h1", { id: "operator-support-heading" }, heading),
            children as never,
          ),
        ),
      ),
    ),
  });
}

function callerContext(is_operator: boolean, role: string, role_rank: number) {
  return [{
    user_id: CALLER_USER_ID, firm_id: CALLER_FIRM_ID, firm_name: "BELCORT", role, role_rank, is_operator,
  }];
}

function queueRow(over: Record<string, unknown> = {}) {
  return {
    case_kind: "registration",
    case_id: REGISTRATION_CASE,
    occurred_at: "2026-09-12T04:00:00+00:00",
    registration_id: REGISTRATION_CASE,
    applicant: "a1234567-89ab-cdef-0123-456789abcdef",
    firm_name: "Rome Public Advisory",
    request_status: "open",
    firm_id: null,
    intent_status: null,
    intent_status_at: null,
    intent_status_reason: null,
    payment_recorded_at: null,
    payment_consumed_at: null,
    problem_kind: null,
    problem_noticed_at: null,
    problem_detail: null,
    decided_by: null,
    decided_at: null,
    decided_reason: null,
    settled: false,
    ...over,
  };
}

/** #776 — the applicant ids the three arms carry, and the ONE the name door can resolve. B is a
 *  real id on a real case that resolves to nothing (a provider-supplied applicant naming no user),
 *  so this fixture carries BOTH halves of the field rather than only the happy one. */
const APPLICANT_A = "a1234567-89ab-cdef-0123-456789abcdef";
const APPLICANT_B = "b1234567-89ab-cdef-0123-456789abcdef";
const APPLICANT_A_NAME = "Farid bin Ismail";

/** The name door's answer: ONLY what it resolved. An unresolvable id is ABSENT, never a row with a
 *  null name (0206 §1) — which is what makes `applicant_name: null` a real state here. */
function applicantNames(): Response {
  return jsonResponse([{ applicant: APPLICANT_A, display_name: APPLICANT_A_NAME }]);
}

const THREE_ARMS = [
  queueRow(),
  queueRow({
    case_kind: "payment", case_id: PAYMENT_CASE, firm_name: "Kuala Lumpur Bookkeepers",
    intent_status: "paid", payment_recorded_at: "2026-09-11T02:00:00+00:00",
    occurred_at: "2026-09-11T02:00:00+00:00",
  }),
  queueRow({
    case_kind: "problem", case_id: PROBLEM_CASE, firm_name: "Penang Advisory",
    applicant: APPLICANT_B,
    problem_kind: "duplicate_payment", problem_noticed_at: "2026-09-10T02:00:00+00:00",
    occurred_at: "2026-09-10T02:00:00+00:00",
  }),
];

/** Every region marker the console rendered, so a cell asserts on STATE IDENTITY rather than on a
 *  sentence two states could share. Walks the harness DOM without assuming a querySelector. */
function regionsOf(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    const el = n as { getAttribute?: (k: string) => string | null; childNodes?: unknown[] };
    const marker = typeof el.getAttribute === "function" ? el.getAttribute("data-operator-region") : null;
    if (marker) out.push(marker);
    for (const child of el.childNodes ?? []) walk(child);
  };
  walk(node);
  return out;
}

function buttonLabels(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    const el = n as { tagName?: string; childNodes?: unknown[] };
    if (el.tagName === "BUTTON") out.push(textOf(el as never).trim());
    for (const child of el.childNodes ?? []) walk(child);
  };
  walk(node);
  return out;
}

// ── THE GATE: both halves of the conjunction ─────────────────────────────────

for (const [label, ctx] of [
  ["a NON-OPERATOR owner", callerContext(false, "owner", 3)],
  ["an OPERATOR-FIRM admin (rank 2, below owner)", callerContext(true, "admin", 2)],
  ["a caller_context row with NO user_id", [{ ...callerContext(true, "owner", 3)[0], user_id: undefined }]],
  ["an AMBIGUOUS two-row caller_context", [...callerContext(true, "owner", 3), ...callerContext(true, "owner", 3)]],
] as const) {
  test(`ticket 615 AC1 — ${label} is refused: one honest line, ZERO support data, ZERO action controls`, async () => {
    await withMockedEnv(
      async (u) => {
        const url = String(u);
        if (url.includes("/rest/v1/caller_context")) return jsonResponse(ctx);
        // The DISCRIMINATING post-condition: the queue read must never be attempted at all.
        throw new Error(`unexpected fetch: ${url}`);
      },
      async () => {
        const h = await renderComponent(App(createElement(OperatorSupportConsole), "Operator support"));
        try {
          for (let i = 0; i < 4; i++) await h.settle();
          assert.match(h.text(), /does not carry that authority/, "the honest refusal renders");
          assert.doesNotMatch(h.text(), /Rome Public Advisory/, "no support data leaks into the refusal");
          assert.deepEqual(regionsOf(h.container), ["refusal"], "exactly one region: the refusal");
          assert.deepEqual(buttonLabels(h.container), [], "the refusal offers ZERO action controls");
          assert.deepEqual(checkAccessibility(h.container as never), []);
        } finally {
          await h.unmount();
        }
      },
    );
  });
}

// ── THE POSITIVE CONTROL, and the visible isolation statement ────────────────

test("ticket 615 AC1 — an operator-firm OWNER gets the queue AND the visible isolation statement", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(true, "owner", 3));
      if (url.includes("/rpc/get_admission_capacity")) {
        return jsonResponse({ max_firms: null, firms_count: 4, full: false });
      }
      if (url.includes("/rpc/list_operator_support_queue")) return jsonResponse(THREE_ARMS);
      if (url.includes("/rpc/resolve_operator_support_applicants")) return applicantNames();
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(OperatorSupportConsole), "Operator support"));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /Rome Public Advisory/, "the registration arm renders");
        assert.match(text, /Kuala Lumpur Bookkeepers/, "the payment arm renders");
        assert.match(text, /Penang Advisory/, "the provider-problem arm renders");
        // THE ISOLATION STATEMENT IS ON SCREEN, not merely true in a migration.
        assert.ok(regionsOf(h.container).includes("isolation"), "the isolation statement is its own region");
        assert.match(text, /does not open any firm's documents, ledger, Work or Knowledge/);
        assert.doesNotMatch(text, /does not carry that authority/);
        assert.deepEqual(checkAccessibility(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});

// ── #776 · THE APPLICANT'S NAME, ON SCREEN ───────────────────────────────────

test("ticket 776 — the queue renders the resolved applicant NAME beside the id, and keeps the "
  + "honest absence where nothing resolved", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(true, "owner", 3));
      if (url.includes("/rpc/get_admission_capacity")) {
        return jsonResponse({ max_firms: null, firms_count: 4, full: false });
      }
      if (url.includes("/rpc/list_operator_support_queue")) return jsonResponse(THREE_ARMS);
      if (url.includes("/rpc/resolve_operator_support_applicants")) return applicantNames();
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(OperatorSupportConsole), "Operator support"));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, new RegExp(messages.Operator.columnApplicantName),
          "the Name column has its own header");
        assert.match(text, new RegExp(APPLICANT_A_NAME), "the resolved applicant's name renders");
        // THE ID IS STILL THERE. The name is BESIDE the truncated uuid, never instead of it —
        // every other surface and every support conversation addresses the case by that id.
        assert.match(text, new RegExp(APPLICANT_A.slice(0, 8)), "the truncated id still renders");
        // …AND NOTHING IS INVENTED for the row the door could not resolve: it falls back to the
        // console's own "unavailable" copy, and no uuid is ever painted as if it were a name.
        assert.match(text, new RegExp(messages.Operator.unavailable));
        assert.doesNotMatch(text, new RegExp(APPLICANT_B), "no full uuid is rendered as a name");
        assert.deepEqual(checkAccessibility(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});

// ── THE SIX READ STATES, AS DISTINCT REGIONS (#615 AC3) ──────────────────────

test("ticket 615 AC3 — an EMPTY queue and a DENIED read are different regions, and a refusal is never an empty queue", async () => {
  const seen: string[][] = [];
  for (const [label, answer] of [
    ["empty", () => jsonResponse([])],
    ["denied", () => clrResponse("CLR04", "insufficient role", "not_operator_firm")],
    ["failed", () => jsonResponse({ message: "boom" }, 500)],
  ] as const) {
    await withMockedEnv(
      async (u) => {
        const url = String(u);
        if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(true, "owner", 3));
        if (url.includes("/rpc/get_admission_capacity")) {
          return jsonResponse({ max_firms: null, firms_count: 4, full: false });
        }
        if (url.includes("/rpc/list_operator_support_queue")) return answer();
        if (url.includes("/rpc/resolve_operator_support_applicants")) return applicantNames();
        throw new Error(`unexpected fetch: ${url}`);
      },
      async () => {
        const h = await renderComponent(App(createElement(OperatorSupportConsole), "Operator support"));
        try {
          for (let i = 0; i < 6; i++) await h.settle();
          const regions = regionsOf(h.container).filter((r) => r !== "isolation" && r !== "capacity");
          seen.push(regions);
          assert.ok(regions.includes(label), `${label} renders its own region (saw ${regions.join(", ")})`);
          assert.deepEqual(checkAccessibility(h.container as never), [], label);
        } finally {
          await h.unmount();
        }
      },
    );
  }
  // …and the three answers are genuinely three different renderings, not one box with three texts.
  assert.equal(new Set(seen.map((r) => r.join("|"))).size, 3, `three distinct states: ${JSON.stringify(seen)}`);
  assert.ok(!seen[1]!.includes("empty"), "a CLR04 refusal is NEVER rendered as an empty queue");
});

test("ticket 615 AC3 — a case with no supported action says so, in its own labelled region", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(true, "owner", 3));
      if (url.includes("/rpc/get_admission_capacity")) {
        return jsonResponse({ max_firms: null, firms_count: 4, full: false });
      }
      if (url.includes("/rpc/list_operator_support_queue")) return jsonResponse(THREE_ARMS);
      if (url.includes("/rpc/resolve_operator_support_applicants")) return applicantNames();
      if (url.includes("/rpc/get_operator_support_case")) {
        // The unconsumed PAYMENT — the honest "no supported action" case: `clara.claim_paid_firm`
        // is the applicant's own door and the estate has no operator-side writer for it.
        return jsonResponse({
          ...THREE_ARMS[1], note: null, intent_id: null,
          stripe_session_id: "cs_test_615", stripe_event_id: "evt_615", event_type: null,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(
        createElement(OperatorSupportConsole), "Operator support"));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /Kuala Lumpur Bookkeepers/);
        // The Sheet is URL-driven, so this cell asserts the QUEUE's own honesty about the arm: a
        // payment row's control opens the detail rather than offering an act, and the copy for the
        // absent act exists as its own message rather than as a disabled button with no reason.
        assert.match(
          messages.Operator.noAction.payment,
          /claimed by the applicant themselves/,
          "the absence is NAMED, with its reason",
        );
        assert.deepEqual(checkAccessibility(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});
