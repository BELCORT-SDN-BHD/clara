// GATE (b) — structural a11y scan of the operator approval queue (P4-5,
// design §4 B / §5 ask 8). Ported mocked-fetch/renderComponent style from
// components/firm-admin/firm-admin-a11y.test.tsx's own precedent. See
// test/domInspect.ts's header for why this rides a hand-written rule engine
// rather than real axe-core.
//
// THE TWO POSITIVE CONTROLS THIS ORDER'S ACCEPTANCE LIST NAMES (annex 2 §G):
// a non-operator OWNER is refused, and an operator-firm ADMIN is refused —
// testing only the happy operator path would leave both halves of the
// `is_operator AND role_rank>=owner` conjunction unproven. Both are
// RED-BEFORE'd: deleting `isOperatorConsoleEligible`'s `role_rank`/
// `is_operator` conjunct (returning `true` unconditionally) turns either
// refusal test red, because the mocked queue fetch then throws
// "unexpected fetch" instead of the panel ever reaching it — verified by
// hand before this file shipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { RegistrationsQueuePanel } from "./registrations-queue";
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

function App(children: unknown, heading: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, heading), children as never),
  });
}

// FOLD (Codex round-3, MEDIUM caller-context shape fails open): a REAL
// UUID-shaped id — `isCallerContextRow` rejects "u1"/"f1" outright, so this
// fixture would never reach eligibility at all once the panel validates
// the row.
function callerContext(is_operator: boolean, role: string, role_rank: number) {
  return [{
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    firm_id: "11111111-1111-4111-8111-111111111111",
    firm_name: "BELCORT", role, role_rank, is_operator,
  }];
}

const OPEN_REQUEST = {
  id: "r1", applicant: "a1234567-89ab-cdef-0123-456789abcdef", firm_name: "Rome Public Advisory",
  note: "Referred by an existing client.", status: "open", decided_by: null, decided_at: null,
  reason: null, firm_id: null, created_at: "2026-08-30T09:00:00Z",
};

function mockFetch(ctxRows: unknown[], queueThrows = false) {
  return (u: string): Response => {
    if (u.includes("/rest/v1/caller_context")) return jsonResponse(ctxRows);
    if (u.includes("/rest/v1/firm_registration_requests_visible")) {
      if (queueThrows) throw new Error(`unexpected fetch: ${u}`);
      return jsonResponse([OPEN_REQUEST]);
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
}

test("a non-operator OWNER is refused — the queue never renders, zero a11y violations on the refusal state", async () => {
  await withMockedEnv(
    async (u) => mockFetch(callerContext(false, "owner", 3), true)(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /does not carry that authority/, "the honest refusal must render");
        assert.doesNotMatch(h.text(), /Rome Public Advisory/, "the queue's own rows must never render for a non-operator");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("an OPERATOR-FIRM ADMIN (rank 2, below owner) is refused — zero a11y violations on the refusal state", async () => {
  await withMockedEnv(
    async (u) => mockFetch(callerContext(true, "admin", 2), true)(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /does not carry that authority/, "the honest refusal must render");
        assert.doesNotMatch(h.text(), /Rome Public Advisory/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("FOLD (round-3 native re-verify addendum, LOW-1): a caller_context row with NO user_id is refused — the queue is never reached", async () => {
  // JSON.stringify drops an `undefined`-valued key entirely — the body
  // this produces genuinely LACKS `user_id`, the same shape
  // `isCallerContextRow`'s own missing-field check denies.
  const malformedCtx = [{
    user_id: undefined,
    firm_id: "11111111-1111-4111-8111-111111111111",
    firm_name: "BELCORT", role: "owner", role_rank: 3, is_operator: true,
  }];
  await withMockedEnv(
    async (u) => mockFetch(malformedCtx, true)(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /does not carry that authority/, "the honest refusal must render");
        assert.doesNotMatch(h.text(), /Rome Public Advisory/, "the queue must never render for a malformed caller_context row");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("FOLD (round-3 native re-verify addendum, LOW-1): a two-row caller_context response is refused as AMBIGUOUS — the queue is never reached", async () => {
  const ctx = callerContext(true, "owner", 3);
  const twoRows = [...ctx, ...ctx];
  await withMockedEnv(
    async (u) => mockFetch(twoRows, true)(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /does not carry that authority/, "the honest refusal must render");
        assert.doesNotMatch(h.text(), /Rome Public Advisory/, "the queue must never render for an ambiguous (>1 row) caller_context response");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("POSITIVE CONTROL — an operator-firm OWNER sees the real queue, zero a11y violations once loaded", async () => {
  await withMockedEnv(
    async (u) => mockFetch(callerContext(true, "owner", 3))(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.match(h.text(), /Rome Public Advisory/, "the open request must have actually loaded");
        assert.doesNotMatch(h.text(), /does not carry that authority/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- FOLD (Codex LOW-4) regression pins: the queue's INITIAL states are
// mutually exclusive — pending / HTTP 500 / [] must each render EXACTLY
// one of loading/error/empty, never two at once. Before the fix, an
// initial 500 rendered BOTH the error banner AND "Loading pending
// registrations…" simultaneously (the error was set, but `rows` stayed
// null forever, so the unconditional loading branch also painted). ---

test("FOLD LOW-4: a queue read still PENDING renders ONLY the loading state", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(true, "owner", 3));
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        // Deliberately never resolves — simulates a read still in flight.
        return new Promise<Response>(() => {});
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /Loading pending registrations/, "the loading state must render");
        assert.doesNotMatch(h.text(), /does not carry that authority/, "no operator-gate refusal — the caller IS eligible");
        assert.doesNotMatch(h.text(), /No pending registrations/, "the empty state must not render while still loading");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("FOLD LOW-4: a queue read that returns HTTP 500 renders ONLY the error state, never loading alongside it", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(true, "owner", 3));
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        return jsonResponse({ message: "internal error" }, 500);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.doesNotMatch(h.text(), /Loading pending registrations/, "loading must NOT render once the read has failed");
        assert.doesNotMatch(h.text(), /No pending registrations/, "the empty state must not render on a genuine failure");
        // FOLD (Codex round-2, surface pinning gap): this cell used to prove
        // only ABSENCE (no loading, no empty state) — never that the error
        // state was actually THERE. A component that rendered nothing at
        // all for this branch would have passed both assertions above.
        assert.match(h.text(), /internal error/, "the error state must actually render the failure's own message — positive evidence, not just the absence of the other two states");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("FOLD LOW-4: an empty queue ([]) renders ONLY the empty state", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(true, "owner", 3));
      if (url.includes("/rest/v1/firm_registration_requests_visible")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.match(h.text(), /No pending registrations/, "the empty state must render");
        assert.doesNotMatch(h.text(), /Loading pending registrations/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the Reject dialog (open, with its required reason textarea) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockFetch(callerContext(true, "owner", 3))(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const trigger = h.find((n) => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.ok(trigger, "the Reject trigger must render for the open request");
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(textOf(body as never), /Reason for rejecting/, "the reason field must be open");
        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// FOLD (round-3 native re-verify addendum, LOW-2): registrations-queue.tsx
// used to hardcode `reg-reject-reason`/`-counter` as bare literal ids
// inside EVERY row's own RejectDialog instance. With two OPEN
// registrations on screen, opening BOTH dialogs (nothing in this test
// harness's own documented gaps — no real pointer-event/overlay blocking,
// see test/hookHarness.ts's clickButton header — prevents a second row's
// trigger from being reached while a first row's dialog is still open,
// unlike a real browser's modal trap) put TWO elements carrying the SAME
// id in the DOM at once: the engine reported `duplicate-id` twice (the
// textarea's own id, and the counter paragraph's), and `<label for>`
// resolved to whichever node owned the id FIRST — always row 1's field,
// never the row a screen reader user actually opened.
function findAllIn(root: unknown, predicate: (n: { tagName?: string; childNodes?: unknown[] }) => boolean) {
  const out: { tagName?: string; childNodes?: unknown[]; [k: string]: unknown }[] = [];
  (function walk(n: { tagName?: string; childNodes?: unknown[]; [k: string]: unknown }) {
    if (predicate(n)) out.push(n);
    for (const c of (n.childNodes as typeof out | undefined) ?? []) walk(c);
  })(root as never);
  return out;
}

test("FOLD (round-3 native re-verify addendum, LOW-2): two open registrations, BOTH Reject dialogs open at once — zero duplicate-id violations, each textarea's own id carries its own row", async () => {
  const OPEN_REQUEST_2 = { ...OPEN_REQUEST, id: "r2", firm_name: "Alara Test Firm", applicant: "b1234567-89ab-cdef-0123-456789abcdef" };
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(true, "owner", 3));
      if (url.includes("/rest/v1/firm_registration_requests_visible")) return jsonResponse([OPEN_REQUEST, OPEN_REQUEST_2]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const triggers = findAllIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.equal(triggers.length, 2, "both rows must render their own Reject trigger");

        // Open ROW 1's dialog, then — WITHOUT closing it — ROW 2's too.
        await h.fireEvent(triggers[0] as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        await h.fireEvent(triggers[1] as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const textareas = findAllIn(body, (n) => n.tagName === "TEXTAREA");
        assert.equal(textareas.length, 2, "both dialogs must actually be open — two live reason fields");
        const ids = textareas.map((n) => String((n as { id?: string }).id ?? ""));
        assert.ok(ids[0] && ids[0] !== ids[1], `the two textareas must carry DIFFERENT ids — got ${JSON.stringify(ids)}`);
        assert.ok(ids.some((id) => id.includes("r1")), `one textarea's id must carry row r1's own id — got ${JSON.stringify(ids)}`);
        assert.ok(ids.some((id) => id.includes("r2")), `one textarea's id must carry row r2's own id — got ${JSON.stringify(ids)}`);

        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// FOLD (Codex LOW-5): a null `note` used to render a hardcoded "—" that
// next-intl could never touch. This test supplies a DELIBERATELY DIFFERENT
// test translation for `Registrations.noteUnavailable` and asserts THAT
// string renders — the coincidence that the real en.json copy also
// happens to be "—" would make a same-string mutation invisible to any
// test that only checked for "—" (the exact "spelling is not identity"
// trap this repo's own review law names).
const NOTE_MARKER_MESSAGES = {
  ...messages,
  Registrations: { ...messages.Registrations, noteUnavailable: "NO-NOTE-TEST-MARKER" },
};

function AppWithNoteMarker(children: unknown, heading: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages: NOTE_MARKER_MESSAGES,
    children: createElement("div", null, createElement("h1", null, heading), children as never),
  });
}

test("FOLD (Codex LOW-5): a null note routes through next-intl — a distinct test translation for noteUnavailable actually renders", async () => {
  const rowWithNullNote = { ...OPEN_REQUEST, note: null };
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(callerContext(true, "owner", 3));
      if (url.includes("/rest/v1/firm_registration_requests_visible")) return jsonResponse([rowWithNullNote]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(AppWithNoteMarker(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.match(h.text(), /NO-NOTE-TEST-MARKER/, "the distinct test translation must actually render for a null note");
      } finally {
        await h.unmount();
      }
    },
  );
});
