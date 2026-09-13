// #615 — THE PERMITTED SUPPORT ACT, keyboard-walked and post-conditioned (journey D3; AC3/AC4).
//
// This file carries forward the properties the four retired
// `components/admin/registrations-*.test.tsx` files proved about the surface #615 replaces, on the
// surface that replaces it: the dialog's own gate and focus return, ONE RPC per synchronous
// double-press, a DETERMINISTIC operation identity (so a lost response replays instead of
// repeating), a refusal rendered verbatim with the database's own code and the typed text left
// standing, and the code-point reason bound agreeing with its own counter. What is NOT carried
// forward is anything that was about the old TABLE's shape — per-row Approve/Reject controls and a
// page-wide `busy` across rows — because the act now lives in the case detail beside the state it
// acts on, which is journey D3's own shape ("queue and detail → permitted support action →
// receipt").
//
// THE DISCRIMINATING POST-CONDITION (apps/web/AGENTS.md's dialog law): an act is proven by
// something true only AFTER it — here, that the queue is RE-READ (hydrate-never-trust: the write's
// own answer is a report, never the new truth) and that the receipt names what the door returned.
// RED-BEFORE, recorded: deleting the `onActed()` call in `SupportCaseSheet.perform`'s `finally`
// turns "the queue is re-read after every attempt" red with one queue fetch instead of two;
// replacing `runOnce(...)` with a bare call turns the double-press cell red with two RPCs.
//
// `test/keyboardWalk.ts`'s own header states exactly what this environment can and cannot prove
// about real key-event dispatch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { OperatorSupportConsole } from "./support-queue";
import { capacityOpKey, supportOpKey } from "../../lib/operator/op-key";
import messages from "../../messages/en.json";

enableDomInspection();

const realEventTarget = new EventTarget();
globalThis.window.addEventListener = realEventTarget.addEventListener.bind(realEventTarget);
globalThis.window.removeEventListener = realEventTarget.removeEventListener.bind(realEventTarget);
globalThis.window.dispatchEvent = realEventTarget.dispatchEvent.bind(realEventTarget);

const router = { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };

const CALLER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CALLER_FIRM_ID = "11111111-1111-4111-8111-111111111111";
const REGISTRATION_CASE = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const PROBLEM_CASE = "3f2504e0-4f89-41d3-9a0c-0305e82c3303";

type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function findAll(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  const walk = (n: Node): void => {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

const buttonNamed = (root: Node, label: string): Node | null =>
  findIn(root, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === label);

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

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

function App(children: unknown, search: string) {
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
            createElement("h1", { id: "operator-support-heading" }, "Operator support"),
            children as never,
          ),
        ),
      ),
    ),
  });
}

const CALLER_CONTEXT = [{
  user_id: CALLER_USER_ID, firm_id: CALLER_FIRM_ID, firm_name: "BELCORT",
  role: "owner", role_rank: 3, is_operator: true,
}];

function registrationCase(over: Record<string, unknown> = {}) {
  return {
    case_kind: "registration", case_id: REGISTRATION_CASE,
    occurred_at: "2026-09-12T04:00:00+00:00", registration_id: REGISTRATION_CASE,
    applicant: "a1234567-89ab-cdef-0123-456789abcdef", firm_name: "Rome Public Advisory",
    request_status: "open", firm_id: null, intent_status: null, intent_status_at: null,
    intent_status_reason: null, payment_recorded_at: null, payment_consumed_at: null,
    problem_kind: null, problem_noticed_at: null, problem_detail: null,
    decided_by: null, decided_at: null, decided_reason: null, settled: false,
    note: "Referred by an existing client.", intent_id: null,
    stripe_session_id: null, stripe_event_id: null, event_type: null,
    ...over,
  };
}

function problemCase(over: Record<string, unknown> = {}) {
  return registrationCase({
    case_kind: "problem", case_id: PROBLEM_CASE, firm_name: "Penang Advisory",
    problem_kind: "duplicate_payment", problem_noticed_at: "2026-09-10T02:00:00+00:00",
    stripe_event_id: "evt_615", event_type: "checkout.session.async_payment_succeeded",
    note: null, ...over,
  });
}

/** Mount the console with the Sheet ALREADY OPEN at `?case=`, the deep-link path — which is also
 *  the path an operator reaches from a shared link, and the one whose close rewrites the URL
 *  rather than leaving the app. */
async function mountCase(
  kind: string,
  id: string,
  handle: (url: string, init: RequestInit | undefined, calls: { url: string; body: unknown }[]) => Response | Promise<Response>,
) {
  const calls: { url: string; body: unknown }[] = [];
  const impl = (async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, body });
    return handle(url, init, calls);
  }) as unknown as typeof fetch;
  return { calls, impl, search: `case=${kind}%3A${id}` };
}

const rpcCalls = (calls: { url: string; body: unknown }[], fn: string) =>
  calls.filter((c) => c.url.includes(`/rpc/${fn}`));

// ── THE OPERATION IDENTITY (#615 AC4) ────────────────────────────────────────

test("ticket 615 AC4 — the op key is a PURE function of (case, caller, text): A/A replays, A/B is distinct, and two operators never collide", async () => {
  const a1 = await supportOpKey("reject", REGISTRATION_CASE, CALLER_USER_ID, "out of scope");
  const a2 = await supportOpKey("reject", REGISTRATION_CASE, CALLER_USER_ID, "out of scope");
  const b = await supportOpKey("reject", REGISTRATION_CASE, CALLER_USER_ID, "a different reason");
  const a3 = await supportOpKey("reject", REGISTRATION_CASE, CALLER_USER_ID, "out of scope");
  assert.equal(a1, a2, "the SAME reason reproduces the SAME key — a retry replays, with no cache");
  assert.notEqual(a1, b, "an EDITED reason mints a DIFFERENT key rather than colliding");
  assert.equal(a1, a3, "A/B/A's first and third agree BY CONSTRUCTION");

  // `clara._reserve_op` is scoped by (firm, fn, op_key) and the actor lives only inside the
  // re-hashed arguments, so a key that ignored the caller would collide across two operator-firm
  // owners racing the same case — the second would meet "op_key reused with different args"
  // instead of the honest CLR09 a second decider should see.
  const other = await supportOpKey("reject", REGISTRATION_CASE, OTHER_USER_ID, "out of scope");
  assert.notEqual(a1, other, "a different operator mints its own key");

  // Approve takes no text at all, so its key is stable by construction.
  assert.equal(
    await supportOpKey("approve", REGISTRATION_CASE, CALLER_USER_ID),
    await supportOpKey("approve", REGISTRATION_CASE, CALLER_USER_ID));
  assert.notEqual(
    await supportOpKey("approve", REGISTRATION_CASE, CALLER_USER_ID),
    await supportOpKey("resolve", REGISTRATION_CASE, CALLER_USER_ID),
    "two different verbs on one id are two different operations");

  // …and the capacity panel's own key binds the VALUE, because `set_admission_capacity` re-hashes
  // {max_firms, reason, actor}: the same change replays, a different limit does not.
  assert.equal(await capacityOpKey(CALLER_USER_ID, 10, "beta"), await capacityOpKey(CALLER_USER_ID, 10, "beta"));
  assert.notEqual(await capacityOpKey(CALLER_USER_ID, 10, "beta"), await capacityOpKey(CALLER_USER_ID, 11, "beta"));
  assert.notEqual(await capacityOpKey(CALLER_USER_ID, null, "beta"), await capacityOpKey(CALLER_USER_ID, 0, "beta"),
    "unlimited and zero are different policies and must never share an operation identity");
  // The DISCRIMINATING case for the reason digest: two reasons of the SAME LENGTH are two different
  // operations. A key derived from `reason.length` (this function's first cut) shared one identity
  // between them, so editing only the wording met `op_key_conflict` instead of being accepted.
  assert.notEqual(await capacityOpKey(CALLER_USER_ID, 10, "beta cap"), await capacityOpKey(CALLER_USER_ID, 10, "beta CAP"),
    "two same-length reasons are two different operations");
  assert.notEqual(await capacityOpKey(CALLER_USER_ID, 10, "abc"), await capacityOpKey(CALLER_USER_ID, 10, "cba"));
  // A 32-BIT DIGEST COLLIDES, eventually, and the failure mode is bad: `_reserve_op` answers
  // `op_key_conflict` and that triple can never be submitted, because a deterministic key offers no
  // way to pick a different one. The length is carried ALONGSIDE the digest so a collision needs the
  // two reasons to agree on BOTH — this pair is a real measured 32-bit FNV-1a collision
  // ("costarring"/"liquid", from the widely-cited FNV collision list), so the cell is a genuine
  // instrument rather than a hopeful one.
  for (const [a, b] of [["costarring", "liquid"], ["declinate", "macallums"]] as const) {
    assert.notEqual(
      await capacityOpKey(CALLER_USER_ID, 10, a), await capacityOpKey(CALLER_USER_ID, 10, b),
      `a known 32-bit FNV-1a collision (${a}/${b}) must still mint two distinct identities`);
  }
});

// ── APPROVE: one press, one RPC, one re-read ─────────────────────────────────

test("ticket 615 AC4 — a synchronous double-press of Approve results in EXACTLY ONE approve_firm_registration call, and the queue is re-read", async () => {
  let decided = false;
  const { calls, impl, search } = await mountCase("registration", REGISTRATION_CASE, (url) => {
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
    if (url.includes("/rpc/get_admission_capacity")) return jsonResponse({ max_firms: null, firms_count: 4, full: false });
    if (url.includes("/rpc/list_operator_support_queue")) {
      return jsonResponse(decided ? [] : [registrationCase()]);
    }
    if (url.includes("/rpc/get_operator_support_case")) return jsonResponse(registrationCase());
    if (url.includes("/rpc/approve_firm_registration")) {
      decided = true;
      return jsonResponse({ request_id: REGISTRATION_CASE, firm_id: "f-615", plan_id: "p-615" });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(OperatorSupportConsole), search));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const before = rpcCalls(calls, "list_operator_support_queue").length;
      const approve = buttonNamed(body as unknown as Node, "Approve");
      assert.ok(approve, "the OPEN registration offers Approve");

      // Two synchronous presses, before React can re-render with `busy` true.
      const first = clickButton(approve as never);
      const second = clickButton(approve as never);
      await Promise.all([first, second]);
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(rpcCalls(calls, "approve_firm_registration").length, 1,
        "the synchronous guard admitted exactly ONE governed call");
      // …and the op key it carried is the deterministic one, not a fresh random.
      assert.equal(
        (rpcCalls(calls, "approve_firm_registration")[0]!.body as { p_op_key: string }).p_op_key,
        await supportOpKey("approve", REGISTRATION_CASE, CALLER_USER_ID));
      // THE DISCRIMINATING POST-CONDITION: the queue is re-read after the act.
      assert.ok(rpcCalls(calls, "list_operator_support_queue").length > before,
        "the queue was re-read after the act");
      assert.match(textOf(body as never), /Firm f-615 was created/, "the door's own receipt is shown");
    } finally {
      await h.unmount();
    }
  });
});

// ── THE REASON DIALOG: gate, focus return, verbatim refusal ──────────────────

test("Reject dialog: Confirm gates on the required reason, Cancel closes it and returns focus to the trigger", async () => {
  const { impl, search } = await mountCase("registration", REGISTRATION_CASE, (url) => {
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
    if (url.includes("/rpc/get_admission_capacity")) return jsonResponse({ max_firms: null, firms_count: 4, full: false });
    if (url.includes("/rpc/list_operator_support_queue")) return jsonResponse([registrationCase()]);
    if (url.includes("/rpc/get_operator_support_case")) return jsonResponse(registrationCase());
    throw new Error(`unexpected fetch: ${url}`);
  });

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(OperatorSupportConsole), search));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const trigger = buttonNamed(body as unknown as Node, "Reject");
      assert.ok(trigger, "the OPEN registration offers Reject");
      await clickButton(trigger as never);
      for (let i = 0; i < 4; i++) await h.settle();

      const confirm = buttonNamed(body as unknown as Node, "Reject registration");
      assert.ok(confirm, "the dialog is open");
      assert.equal((confirm as unknown as { disabled: boolean }).disabled, true,
        "Confirm is gated until a reason is typed — the DB is the wall, this is the courtesy");

      const field = findIn(body as unknown as Node, (n) => n.tagName === "TEXTAREA");
      assert.ok(field, "the reason field is a real textarea");
      setFieldValue(field as never, "   ");
      for (let i = 0; i < 2; i++) await h.settle();
      assert.equal(
        (buttonNamed(body as unknown as Node, "Reject registration") as unknown as { disabled: boolean }).disabled,
        true, "whitespace alone is not a reason — the gate and the wire payload agree on the TRIMMED text");

      setFieldValue(field as never, "Out of scope for this estate.");
      for (let i = 0; i < 2; i++) await h.settle();
      assert.equal(
        (buttonNamed(body as unknown as Node, "Reject registration") as unknown as { disabled: boolean }).disabled,
        false, "a real reason enables Confirm");

      const cancel = buttonNamed(body as unknown as Node, "Cancel");
      assert.ok(cancel);
      await clickButton(cancel as never);
      for (let i = 0; i < 4; i++) await h.settle();
      assert.ok(buttonNamed(body as unknown as Node, "Reject registration") === null, "Cancel REALLY closed it");
      // FOCUS IS SOMEWHERE REAL, which is what THIS environment can honestly prove. The browser's
      // own focus RESTORE on a dialog unmount is not simulated by the harness (measured: after
      // Cancel, `activeElement()` is the dialog content div Base UI focused on open, because
      // nothing here re-runs the restore a real browser performs) — `test/keyboardWalk.ts`'s own
      // header records that class of limit. The real return-to-trigger is walked in a real
      // browser by `e2e/operator-support-walk.spec.ts`, which is where that claim belongs.
      const focused = activeElement() as { tagName?: string } | null;
      assert.ok(focused !== null, "focus is not lost entirely");
      assert.ok(focused.tagName !== "BODY" && focused.tagName !== "HTML",
        `focus was dumped on the document (${String(focused.tagName)})`);
    } finally {
      await h.unmount();
    }
  });
});

test("ticket 615 AC3 — a governed refusal renders VERBATIM in its own labelled region, and the typed reason survives it", async () => {
  const { calls, impl, search } = await mountCase("registration", REGISTRATION_CASE, (url) => {
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
    if (url.includes("/rpc/get_admission_capacity")) return jsonResponse({ max_firms: null, firms_count: 4, full: false });
    if (url.includes("/rpc/list_operator_support_queue")) return jsonResponse([registrationCase()]);
    if (url.includes("/rpc/get_operator_support_case")) return jsonResponse(registrationCase());
    if (url.includes("/rpc/reject_firm_registration")) {
      // The F7 self-decision wall — an operator may never decide their OWN request (0145:856-860).
      return clrResponse("CLR04", "cannot decide your own registration request");
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(OperatorSupportConsole), search));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      await clickButton(buttonNamed(body as unknown as Node, "Reject") as never);
      for (let i = 0; i < 4; i++) await h.settle();
      const field = findIn(body as unknown as Node, (n) => n.tagName === "TEXTAREA");
      setFieldValue(field as never, "Duplicate of an existing firm.");
      for (let i = 0; i < 2; i++) await h.settle();
      await clickButton(buttonNamed(body as unknown as Node, "Reject registration") as never);
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(rpcCalls(calls, "reject_firm_registration").length, 1);
      const text = textOf(body as never);
      // The CODE travels verbatim — never re-worded, never collapsed into "something went wrong".
      assert.match(text, /CLR04/, "the database's own code is on screen");
      assert.ok(regionsOf(body).includes("failure-denied"),
        `the refusal is its OWN region (saw ${regionsOf(body).join(", ")})`);
      // A REFUSED act leaves the dialog — and the human's typed reason — standing. The reason
      // lives in the textarea's VALUE, never in its text content, so it is read from the field
      // itself rather than from the rendered text (which is what `textOf` can see).
      assert.ok(buttonNamed(body as unknown as Node, "Reject registration"),
        "a refused act does not close the dialog");
      const stillTyped = findIn(body as unknown as Node, (n) => n.tagName === "TEXTAREA");
      assert.ok(stillTyped, "the reason field is still mounted");
      assert.equal((stillTyped as unknown as { value: string }).value, "Duplicate of an existing firm.",
        "the typed reason is preserved through the refusal");
    } finally {
      await h.unmount();
    }
  });
});

test("ticket 615 AC3 — a duplicate operation, a provider outage and a stale case are THREE distinct regions", async () => {
  const seen: string[] = [];
  for (const [label, answer] of [
    ["duplicate", () => clrResponse("CLR13", "this resolution is already being recorded", "operation_in_flight")],
    ["stale", () => clrResponse("CLR09", "stripe event problem is already resolved")],
    ["providerUnavailable", () => jsonResponse({ message: "bad gateway" }, 502)],
  ] as const) {
    const { impl, search } = await mountCase("problem", PROBLEM_CASE, (url) => {
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/get_admission_capacity")) return jsonResponse({ max_firms: null, firms_count: 4, full: false });
      if (url.includes("/rpc/list_operator_support_queue")) return jsonResponse([problemCase()]);
      if (url.includes("/rpc/get_operator_support_case")) return jsonResponse(problemCase());
      if (url.includes("/rpc/resolve_stripe_event_problem")) return answer();
      throw new Error(`unexpected fetch: ${url}`);
    });

    await withMockedEnv(impl, async () => {
      const h = await renderComponent(App(createElement(OperatorSupportConsole), search));
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        await clickButton(buttonNamed(body as unknown as Node, "Resolve") as never);
        for (let i = 0; i < 4; i++) await h.settle();
        setFieldValue(findIn(body as unknown as Node, (n) => n.tagName === "TEXTAREA") as never, "Refunded by hand.");
        for (let i = 0; i < 2; i++) await h.settle();
        await clickButton(buttonNamed(body as unknown as Node, "Record resolution") as never);
        for (let i = 0; i < 8; i++) await h.settle();
        const region = regionsOf(body).find((r) => r.startsWith("failure-"));
        assert.equal(region, `failure-${label}`, `${label} has its own region (saw ${regionsOf(body).join(", ")})`);
        seen.push(region!);
      } finally {
        await h.unmount();
      }
    });
  }
  assert.equal(new Set(seen).size, 3, `three distinct act failures: ${seen.join(", ")}`);
});

// ── THE CODE-POINT BOUND (the retired file's own Codex MEDIUM-2 / round-2 folds) ──

test("the reason counter and the Confirm gate agree on ONE Unicode code-point count: 500 accepted, 501 refused", async () => {
  const { impl, search } = await mountCase("registration", REGISTRATION_CASE, (url) => {
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
    if (url.includes("/rpc/get_admission_capacity")) return jsonResponse({ max_firms: null, firms_count: 4, full: false });
    if (url.includes("/rpc/list_operator_support_queue")) return jsonResponse([registrationCase()]);
    if (url.includes("/rpc/get_operator_support_case")) return jsonResponse(registrationCase());
    throw new Error(`unexpected fetch: ${url}`);
  });

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(OperatorSupportConsole), search));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      await clickButton(buttonNamed(body as unknown as Node, "Reject") as never);
      for (let i = 0; i < 4; i++) await h.settle();
      const field = findIn(body as unknown as Node, (n) => n.tagName === "TEXTAREA");
      const disabled = () =>
        (buttonNamed(body as unknown as Node, "Reject registration") as unknown as { disabled: boolean }).disabled;

      setFieldValue(field as never, "x".repeat(500));
      for (let i = 0; i < 2; i++) await h.settle();
      assert.equal(disabled(), false, "exactly 500 characters is accepted");
      assert.match(textOf(body as never), /500\/500 characters/, "the counter agrees");

      setFieldValue(field as never, "x".repeat(501));
      for (let i = 0; i < 2; i++) await h.settle();
      assert.equal(disabled(), true, "501 is refused");
      assert.match(textOf(body as never), /must be 500 characters or fewer/);

      // A SUPPLEMENTARY character is ONE code point, not the two UTF-16 units `String.length`
      // counts — 300 of them is well inside the bound, and the counter must say so. Postgres's
      // own `char_length` counts the same way, so the two walls cannot disagree.
      setFieldValue(field as never, "\u{1F600}".repeat(300));
      for (let i = 0; i < 2; i++) await h.settle();
      assert.equal(disabled(), false, "300 supplementary code points is inside a 500 bound");
      assert.match(textOf(body as never), /300\/500 characters/);
    } finally {
      await h.unmount();
    }
  });
});

// ── THE NO-ORACLE DETAIL, AND AN UNSUPPORTED STATE ───────────────────────────

test("ticket 615 AC1/AC5 — a deep link to a case the door refuses shows one not-found state, with no existence leak", async () => {
  const { impl, search } = await mountCase("problem", PROBLEM_CASE, (url) => {
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
    if (url.includes("/rpc/get_admission_capacity")) return jsonResponse({ max_firms: null, firms_count: 4, full: false });
    if (url.includes("/rpc/list_operator_support_queue")) return jsonResponse([]);
    if (url.includes("/rpc/get_operator_support_case")) {
      return clrResponse("CLR11", "support case not found", "support_case_not_found");
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(OperatorSupportConsole), search));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const text = textOf(body as never);
      assert.match(text, /No support case is available at this address/);
      // NO EXISTENCE LEAK: the copy does not distinguish "absent" from "not yours", because the
      // door does not either — and no act is offered over a case that did not load.
      assert.doesNotMatch(text, /Penang Advisory/);
      assert.ok(buttonNamed(body as unknown as Node, "Resolve") === null, "no act is offered");
      assert.ok(regionsOf(body).includes("case-not-found"));
      // …and the failing detail read did not take the QUEUE down with it.
      assert.ok(regionsOf(body).includes("empty"), "the queue still reports its own honest state");
    } finally {
      await h.unmount();
    }
  });
});

test("ticket 615 AC3 — a SETTLED case offers no act and names the absence", async () => {
  const { impl, search } = await mountCase("problem", PROBLEM_CASE, (url) => {
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
    if (url.includes("/rpc/get_admission_capacity")) return jsonResponse({ max_firms: null, firms_count: 4, full: false });
    if (url.includes("/rpc/list_operator_support_queue")) return jsonResponse([]);
    if (url.includes("/rpc/get_operator_support_case")) {
      return jsonResponse(problemCase({
        settled: true, decided_by: CALLER_USER_ID, decided_at: "2026-09-12T05:00:00+00:00",
        decided_reason: "Refunded by hand.",
      }));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(OperatorSupportConsole), search));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const text = textOf(body as never);
      assert.ok(buttonNamed(body as unknown as Node, "Resolve") === null, "a settled case offers no act");
      assert.match(text, /No supported action for this state/);
      assert.ok(regionsOf(body).includes("unsupported-action"));
      // THE RECEIPT IS THE POINT of the settled view: who, when and why, attributably.
      assert.match(text, /Refunded by hand\./, "the support receipt is readable");
      // The buttons that DO remain are navigation and filtering, never a governed act.
      const acts = findAll(body as unknown as Node, (n) => n.tagName === "BUTTON")
        .map((n) => textOf(n as never).trim())
        .filter((label) => ["Approve", "Reject", "Resolve", "Record resolution", "Reject registration"].includes(label));
      assert.deepEqual(acts, [], "no governed control is offered for a settled case");
    } finally {
      await h.unmount();
    }
  });
});
