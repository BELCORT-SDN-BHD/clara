// GATE (c), round-2 addendum — the operator approval queue (P4-5). New file
// rather than growing registrations-keyboard.test.tsx past the 500-line
// advisory (apps/web/AGENTS.md's own precedent for keeping files reviewable).
// Pins every FIX-REQUIRED item from the Codex round-2 review of PR #453 that
// registrations-keyboard.test.tsx/registrations-a11y.test.tsx did not already
// cover. Same mocked-fetch/renderComponent style as those two files — helpers
// below are deliberately RE-DECLARED, not imported, matching the precedent
// registrations-a11y.test.tsx already set alongside registrations-keyboard.
// test.tsx (each file owns its own small fixture, no shared import surface).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { RegistrationsQueuePanel, rejectKeyFor } from "./registrations-queue";
import messages from "../../messages/en.json";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; disabled?: boolean };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

/** ALL matches, document order — the two-row cells below need to tell row 1's
 *  controls apart from row 2's, which `findIn`'s first-match-only cannot. */
function findAllIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

// Poll h.settle() until condition() is true, not a FIXED hop count — the
// #491/v16-act-cards.test.tsx class (db-estate reds this file's refusal
// cell under shared load; main is green). Wall-clock-bounded, named on timeout.
async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, description: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`settleUntil: timed out after ${timeoutMs}ms waiting for: ${description}`);
    await h.settle();
  }
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

function App(children: unknown, heading: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, heading), children as never),
  });
}

// FOLD (Codex round-3, MEDIUM caller-context shape fails open): every
// fixture below now uses REAL UUID-shaped ids — `isCallerContextRow`
// (require-firm-scope.test.ts:213-242's own established table) rejects
// "u1"/"f1" outright, so a fixture using them would never even reach the
// eligibility check this file means to exercise.
const FIRM_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function callerContext(userId: string) {
  return [{ user_id: userId, firm_id: FIRM_ID, firm_name: "BELCORT", role: "owner", role_rank: 3, is_operator: true }];
}
const CALLER_CONTEXT = callerContext(ACTOR_A);

const OPEN_REQUEST = {
  id: "r1", applicant: "a1234567-89ab-cdef-0123-456789abcdef", firm_name: "Rome Public Advisory",
  note: null, status: "open", decided_by: null, decided_at: null, reason: null, firm_id: null,
  created_at: "2026-08-30T09:00:00Z",
};
const OPEN_REQUEST_2 = {
  ...OPEN_REQUEST, id: "r2", firm_name: "Alara Test Firm",
  applicant: "b1234567-89ab-cdef-0123-456789abcdef",
};

async function mountEligibleQueue() {
  const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body };
}

async function teardown(h: Awaited<ReturnType<typeof mountEligibleQueue>>["h"], body: unknown): Promise<void> {
  await h.unmount();
  const bodyEl = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
  if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
  for (let i = 0; i < 3; i++) await h.settle();
}

// ---------------------------------------------------------------------------
// rejectKeyFor — a pure ASYNC-function unit test (no React harness at all).
// Replaces the round-2 Map-based `keyFor` test: Codex round-3 flagged the
// Map as unbounded historical state ("entries persist until the row
// unmounts"); `rejectKeyFor` is a deterministic digest instead, so A/A and
// A/B/A agree BY CONSTRUCTION rather than because a cache remembered them —
// no cache exists to grow at all ("no state growth", the round-3 pin).
// ---------------------------------------------------------------------------

test("FOLD (Codex round-3, LOW Reject key — stateless digest): A/A replays, A/B is distinct, A/B/A's first and third calls agree — with NO cache anywhere", async () => {
  const keyA1 = await rejectKeyFor("r1", ACTOR_A, "Duplicate applicant.");
  const keyA2 = await rejectKeyFor("r1", ACTOR_A, "Duplicate applicant.");
  assert.equal(keyA2, keyA1, "the SAME (request, actor, reason) triple must reproduce the SAME key — it is a pure function, not a lookup");

  const keyB = await rejectKeyFor("r1", ACTOR_A, "Incomplete supporting documents.");
  assert.notEqual(keyB, keyA1, "a DIFFERENT reason must produce a DIFFERENT key");

  const keyA3 = await rejectKeyFor("r1", ACTOR_A, "Duplicate applicant.");
  assert.equal(
    keyA3,
    keyA1,
    "returning to the FIRST reason after an intervening edit (A -> B -> A) reproduces the SAME key A originally got — by RECOMPUTING it, not by any cache remembering it; the round-2 Map this replaces needed a cache to pass this cell, this function needs none",
  );

  // The literal shape: `reg-reject-<requestId>-<callerId>-<16 hex chars>`.
  assert.match(keyA1, /^reg-reject-r1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-[0-9a-f]{16}$/);

  // A DIFFERENT actor rejecting the SAME row with the SAME reason must
  // mint a DIFFERENT key too — the same cross-operator collision class
  // `handleApprove`'s own key already closes (round-2, item 1 above).
  const keyOtherActor = await rejectKeyFor("r1", ACTOR_B, "Duplicate applicant.");
  assert.notEqual(keyOtherActor, keyA1, "a different actor rejecting the same row+reason must mint a distinct key");

  // "no state growth" (the round-3 pin): a hundred distinct reasons compute
  // a hundred distinct keys with nothing SHARED between calls to leak or
  // accumulate — `rejectKeyFor` takes no cache/Map argument at all, so
  // there is structurally nothing here that COULD grow.
  const manyKeys = await Promise.all(
    Array.from({ length: 100 }, (_, i) => rejectKeyFor("r1", ACTOR_A, `distinct reason #${i}`)),
  );
  assert.equal(new Set(manyKeys).size, 100, "100 distinct reasons must produce 100 distinct keys, computed independently");
});

// ---------------------------------------------------------------------------
// Item 1 — MEDIUM cross-operator Approve key collision.
// ---------------------------------------------------------------------------

test("FOLD (Codex round-2, MEDIUM cross-operator Approve key collision): the deterministic key binds the caller's own user_id — same actor replays the same key, a different actor mints a distinct one", async () => {
  const seenKeysByActor: Record<string, string> = {};

  async function approveAs(actorId: string): Promise<void> {
    let queueCall = 0;
    await withMockedEnv(
      async (u, init) => {
        const url = String(u);
        if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(actorId));
        if (url.includes("/rpc/approve_firm_registration")) {
          seenKeysByActor[actorId] = JSON.parse(String(init?.body ?? "{}")).p_op_key;
          return jsonResponse({ request_id: "r1", firm_id: "f2", plan_id: "p1" });
        }
        if (url.includes("/rest/v1/firm_registration_requests_visible")) {
          queueCall += 1;
          return jsonResponse(queueCall === 1 ? [OPEN_REQUEST] : []);
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
      async () => {
        const { h, body } = await mountEligibleQueue();
        try {
          const approveButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Approve");
          assert.ok(approveButton, "the Approve trigger must render");
          await h.act(() => clickButton(approveButton as never));
          for (let i = 0; i < 6; i++) await h.settle();
        } finally {
          await teardown(h, body);
        }
      },
    );
  }

  // Actor A approves, TWICE across two SEPARATE mounts — simulating a
  // browser retry after a lost HTTP response (a page reload, same signed-in
  // operator, same row). Both attempts must compute the IDENTICAL key —
  // that identity is what lets `_reserve_op` REPLAY A's original receipt
  // instead of re-entering the door body and hitting a spurious CLR09.
  await approveAs(ACTOR_A);
  const firstKeyForA = seenKeysByActor[ACTOR_A];
  await approveAs(ACTOR_A);
  assert.equal(seenKeysByActor[ACTOR_A], firstKeyForA, "the SAME actor retrying the SAME row must reuse the SAME op_key");

  // A DIFFERENT operator-firm owner deciding the SAME row (id "r1", reused
  // on purpose across every `approveAs` call above) must mint a DISTINCT
  // key. Before this fold, `reg-approve-${row.id}` alone meant BOTH actors
  // computed the IDENTICAL "reg-approve-r1" key: `_reserve_op` — scoped
  // only by (firm, fn, op_key), never by actor (0004_governed_fns.sql:46-55)
  // — would see B's own honest first attempt as a REPLAY of A's already-
  // committed receipt, whose stored request hash binds A's own actor
  // (0145:788-790) and so does not match B's, raising CLR10 "op_key reused
  // with different args" instead of letting B reach the row's own status
  // check and receive the honest CLR09 the row's real state warrants.
  await approveAs(ACTOR_B);
  assert.notEqual(seenKeysByActor[ACTOR_B], firstKeyForA, "a DIFFERENT actor deciding the SAME row must mint a DISTINCT op_key");
  assert.equal(seenKeysByActor[ACTOR_A], `reg-approve-r1-${ACTOR_A}`);
  assert.equal(seenKeysByActor[ACTOR_B], `reg-approve-r1-${ACTOR_B}`);
});

// ---------------------------------------------------------------------------
// Item 1 (round-3 addendum) — MEDIUM caller-context shape fails open.
// `ctxState.data[0]` used to trust an eligible-SHAPED row without ever
// running `isCallerContextRow`, and took the FIRST of >1 rows rather than
// denying the ambiguity. Every case below must deny BEFORE the queue ever
// mounts — proven by a fetch mock that THROWS if the queue relation or any
// RPC is ever reached, not merely by asserting the refusal text.
// ---------------------------------------------------------------------------

test("FOLD (Codex round-3, MEDIUM caller-context shape fails open): a failed read, zero rows, two rows, and a malformed single row all deny BEFORE any queue or RPC call", async () => {
  const VALID_ROW = { user_id: ACTOR_A, firm_id: FIRM_ID, firm_name: "BELCORT", role: "owner", role_rank: 3, is_operator: true };

  const CASES: ReadonlyArray<{ what: string; ctxBody: unknown; ctxStatus?: number; expected: RegExp }> = [
    { what: "caller_context read fails (HTTP 500)", ctxBody: { message: "internal error" }, ctxStatus: 500, expected: /internal error/ },
    { what: "zero rows", ctxBody: [], expected: /does not carry that authority/ },
    { what: "two rows (ambiguous)", ctxBody: [VALID_ROW, { ...VALID_ROW }], expected: /does not carry that authority/ },
    { what: "user_id missing", ctxBody: [{ ...VALID_ROW, user_id: undefined }], expected: /does not carry that authority/ },
    { what: "user_id null", ctxBody: [{ ...VALID_ROW, user_id: null }], expected: /does not carry that authority/ },
    { what: "user_id not a UUID", ctxBody: [{ ...VALID_ROW, user_id: "u1" }], expected: /does not carry that authority/ },
  ];

  for (const { what, ctxBody, ctxStatus, expected } of CASES) {
    let queueOrRpcCalls = 0;
    await withMockedEnv(
      async (u) => {
        const url = String(u);
        if (url.includes("/rest/v1/caller_context")) return jsonResponse(ctxBody, ctxStatus ?? 200);
        if (url.includes("/rest/v1/firm_registration_requests_visible") || url.includes("/rpc/")) {
          queueOrRpcCalls += 1;
          throw new Error(`unexpected: the queue/RPC must never be reached for a denied caller_context (${what})`);
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
      async () => {
        const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
        try {
          for (let i = 0; i < 5; i++) await h.settle();
          assert.match(h.text(), expected, `case: ${what}`);
          assert.doesNotMatch(h.text(), /Rome Public Advisory|No pending registrations/, `the queue must never render for: ${what}`);
        } finally {
          await h.unmount();
        }
      },
    );
    assert.equal(queueOrRpcCalls, 0, `zero queue/RPC calls expected for: ${what}`);
  }
});

// ---------------------------------------------------------------------------
// Item 2 — MEDIUM governed refusal disappears when the re-read empties the
// queue, plus item 5's coexistence pin (the NON-empty branch already had
// errorBanner before this round — pinned here since it was UNPROVEN).
// ---------------------------------------------------------------------------

test("FOLD (Codex round-2, MEDIUM): CLR09 + a re-read that EMPTIES the queue renders the error AND the empty state together, not the empty state alone", async () => {
  let queueCall = 0;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/reject_firm_registration")) {
        return jsonResponse({ code: "CLR09", message: "this request is no longer open (status: rejected)" }, 400);
      }
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        queueCall += 1;
        // The FIRST read (mount) sees the open row; the re-read AFTER the
        // failed Reject finds the queue genuinely EMPTY — a second operator
        // decided it first, exactly the race CLR09 exists to report.
        return jsonResponse(queueCall === 1 ? [OPEN_REQUEST] : []);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue();
      try {
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the reason field must be open");
        await h.act(() => { setFieldValue(textarea as never, "Edited reason for this second decision."); });
        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.ok(confirmButton, "confirm must render once a reason is typed");
        await h.act(() => clickButton(confirmButton as never));
        for (let i = 0; i < 6; i++) await h.settle();

        assert.match(textOf(body as never), /CLR09/, "the refusal chip must render");
        assert.match(textOf(body as never), /no longer open/, "the DB's own message must render verbatim");
        assert.match(
          textOf(body as never),
          /No pending registrations/,
          "round-2 fix: the empty state the re-read actually found must ALSO render — the pre-fold empty branch dropped errorBanner entirely, silently suppressing a genuine refusal",
        );
        assert.ok(queueCall >= 2, "the queue must have been re-read after the failed act");
      } finally {
        await teardown(h, body);
      }
    },
  );
});

test("FOLD (Codex round-2, surface pinning gap): a refusal whose re-read RETAINS the row renders the error banner AND the table together", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/reject_firm_registration")) {
        return jsonResponse({ code: "CLR04", message: "cannot decide your own registration request" }, 400);
      }
      // The row is STILL open after the refusal — the re-read finds it
      // exactly where it left it, never removed.
      if (url.includes("/rest/v1/firm_registration_requests_visible")) return jsonResponse([OPEN_REQUEST]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue();
      try {
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        await h.fireEvent(trigger as never, "click");
        await settleUntil(h, () => findIn(body as never, (n) => n.tagName === "TEXTAREA") !== null, "the reject dialog's reason textarea to open");
        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        await h.act(() => { setFieldValue(textarea as never, "Trying to reject my own filed request."); });
        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        await h.act(() => clickButton(confirmButton as never));
        await settleUntil(h, () => /CLR04/.test(textOf(body as never)), "the CLR04 refusal chip to render after the reject confirm");

        assert.match(textOf(body as never), /CLR04/, "the refusal chip must render");
        assert.match(
          textOf(body as never),
          /Rome Public Advisory/,
          "the row the re-read still found must STAY visible — the refusal renders ALONGSIDE the table, never replacing it",
        );
        assert.match(textOf(body as never), /Requested firm/, "the table's own header must still be present, not swapped for an error-only view");
      } finally {
        await teardown(h, body);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Item 3 — LOW reason-length metric drift, plus round-3's native-maxlength
// removal (Codex round-3, LOW): the textarea no longer carries `maxLength`
// at all (it contradicted the code-point contract — see the constant's own
// header in registrations-queue.tsx), so `setFieldValue` below drives the
// SAME live `onChange` handler a real keystroke would — nothing is being
// "bypassed" any more, unlike registrations-keyboard.test.tsx's pre-round-3
// MEDIUM-2 test (which predates the removal and still documents it as a
// bypass scenario for its own, narrower 500/501-plain-character cell).
// ---------------------------------------------------------------------------

test("FOLD (Codex round-2/3, LOW reason-length metric drift): the counter and the Confirm gate agree on ONE Unicode-code-point count", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rest/v1/firm_registration_requests_visible")) return jsonResponse([OPEN_REQUEST]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue();
      try {
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the reason field must be open");

        // CELL 1 — padded 500: 500 core characters plus a leading and a
        // trailing space. The TRIMMED core is exactly 500, so this must be
        // ENABLED, and the counter must show the TRIMMED count (500) — the
        // pre-fold counter compared raw `reason.length` (502, untrimmed)
        // against the bound and showed "too long" for a genuinely valid
        // reason.
        await h.act(() => { setFieldValue(textarea as never, " " + "x".repeat(500) + " "); });
        let confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.equal(
          (confirmButton as unknown as { disabled: boolean }).disabled,
          false,
          "500 core characters padded with whitespace must be ENABLED — the gate counts the TRIMMED text",
        );
        assert.match(textOf(body as never), /500\/500 characters/, "the live counter must show the TRIMMED count (500), not the untrimmed 502");

        // CELL 2 — 500 SUPPLEMENTARY code points (each a surrogate PAIR:
        // `.length` would report 1000 UTF-16 units). Must be ENABLED, and
        // the counter must show 500, not 1000.
        await h.act(() => { setFieldValue(textarea as never, "\u{1F600}".repeat(500)); });
        confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.equal(
          (confirmButton as unknown as { disabled: boolean }).disabled,
          false,
          "500 supplementary CODE POINTS must be ENABLED — counting UTF-16 units instead would see 1000 and wrongly disable",
        );
        assert.match(textOf(body as never), /500\/500 characters/, "the counter must report the CODE POINT count (500), not the UTF-16 unit count (1000)");

        // CELL 3 — 501 supplementary code points. Must be DISABLED.
        await h.act(() => { setFieldValue(textarea as never, "\u{1F600}".repeat(501)); });
        confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "501 supplementary code points must be DISABLED");
        assert.match(textOf(body as never), /must be 500 characters or fewer/, "the over-length copy must render once the code-point count exceeds the bound");

        // CELL 4 (round-3) — a COMBINING-MARK sequence: 250 pairs of
        // "e" + COMBINING ACUTE ACCENT (U+0301) = 500 code points, but 250
        // GRAPHEME CLUSTERS ("é" visually). This DOCUMENTS the honest gap
        // Codex round-3 named ("neither counts grapheme clusters... while
        // copy says 'characters'") rather than hiding it: the gate counts
        // CODE POINTS, matching PostgreSQL char_length's own direction
        // (registrations-queue.tsx's REASON_MAX_LENGTH header), so 500
        // code points is ENABLED and the counter reads 500 — a human
        // reading 250 visual characters would not expect that, and that
        // mismatch is exactly what "characters = code points, not
        // graphemes" (recorded in the PR body) exists to explain.
        await h.act(() => { setFieldValue(textarea as never, "é".repeat(250)); });
        confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.equal(
          (confirmButton as unknown as { disabled: boolean }).disabled,
          false,
          "500 code points via 250 combining-mark pairs must be ENABLED — the gate counts code points, not grapheme clusters",
        );
        assert.match(textOf(body as never), /500\/500 characters/, "the counter must report the CODE POINT count (500), not the grapheme-cluster count (250)");

        // CELL 5 (round-3) — a ZWJ sequence: "man" + ZWJ + "woman" (3 code
        // points) repeated so the total EXCEEDS 500 code points while
        // still reading as far fewer visual "people" glyphs. Must be
        // DISABLED once the code-point count crosses the bound, the same
        // documented direction as cell 4.
        // MAN + ZERO WIDTH JOINER + WOMAN, built with String.fromCodePoint
        // rather than an inline literal — a literal ZWJ byte pasted into
        // source is invisible and easy to corrupt in transit.
        const manZwjWoman = String.fromCodePoint(0x1f468, 0x200d, 0x1f469);
        await h.act(() => { setFieldValue(textarea as never, manZwjWoman.repeat(167)); }); // 3 * 167 = 501 code points
        confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.equal(
          (confirmButton as unknown as { disabled: boolean }).disabled,
          true,
          "501 code points via a ZWJ (man+ZWJ+woman) sequence repeated 167 times must be DISABLED",
        );
      } finally {
        await teardown(h, body);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Item 5 — surface pinning gap: two-row busy/global-guard cell.
// ---------------------------------------------------------------------------

test("FOLD (Codex round-2, surface pinning gap): busy is GLOBAL, not per-row — an act in flight on row 1 disables row 2's Approve AND Reject triggers", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/approve_firm_registration")) {
        // Deliberately never resolves — holds the queue in its `busy` state
        // for the whole test, the same technique the LOW FIND-4 test in
        // registrations-keyboard.test.tsx already uses.
        return new Promise<Response>(() => {});
      }
      if (url.includes("/rest/v1/firm_registration_requests_visible")) return jsonResponse([OPEN_REQUEST, OPEN_REQUEST_2]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue();
      try {
        assert.match(textOf(body as never), /Rome Public Advisory/);
        assert.match(textOf(body as never), /Alara Test Firm/);

        const approveButtonsBefore = findAllIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Approve");
        assert.equal(approveButtonsBefore.length, 2, "both rows must render their own Approve trigger");
        const rejectTriggersBefore = findAllIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.equal(rejectTriggersBefore.length, 2, "both rows must render their own Reject trigger");
        assert.equal((approveButtonsBefore[1] as unknown as { disabled: boolean }).disabled, false, "row 2 is not busy yet");
        assert.equal((rejectTriggersBefore[1] as unknown as { disabled: boolean }).disabled, false, "row 2 is not busy yet");

        await h.act(() => clickButton(approveButtonsBefore[0] as never));
        for (let i = 0; i < 4; i++) await h.settle();

        const approveButtonsAfter = findAllIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Approve");
        const rejectTriggersAfter = findAllIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.equal(approveButtonsAfter.length, 2, "row 1's act being in flight must not remove either row");
        assert.equal(
          (approveButtonsAfter[1] as unknown as { disabled: boolean }).disabled,
          true,
          "row 2's Approve must disable too — busy is a page-wide guard (this file's own header), not per-row",
        );
        assert.equal(
          (rejectTriggersAfter[1] as unknown as { disabled: boolean }).disabled,
          true,
          "row 2's Reject trigger must disable too",
        );
        // `clickButton` itself refuses to invoke a DISABLED node's handler
        // (test/hookHarness.ts's own header: "assert the gate, then act; a
        // click helper must never be the thing that manufactures a green on
        // an unopenable door") — the two assertions above ARE the proof
        // that a click on row 2 sends nothing: there is no live handler
        // left for it to reach.
      } finally {
        await teardown(h, body);
      }
    },
  );
});
