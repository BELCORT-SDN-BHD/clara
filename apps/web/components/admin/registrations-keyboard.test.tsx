// GATE (c) — keyboard-walk tests for the operator approval queue (P4-5).
// Ported mocked-fetch/renderComponent style from
// components/firm-admin/firm-admin-keyboard.test.tsx's own precedent. See
// test/keyboardWalk.ts's header for exactly what this environment can and
// cannot prove about real key-event dispatch.
//
// THE DISCRIMINATING POST-CONDITION (apps/web/AGENTS.md's own dialog law):
// "Approve" must be proven by something true only AFTER the click — here,
// that the approved row LEAVES the open queue on the mandatory re-read
// (act()'s own contract), not merely that the door returned 200. RED-BEFORE:
// commenting out `loadOperatorRegistrationQueue`'s re-mock swap below (i.e.
// always returning the SAME row) turns that cell red, because the row would
// still be present after the click — verified by hand before this file
// shipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { RegistrationsQueuePanel } from "./registrations-queue";
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

function App(children: unknown, heading: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, heading), children as never),
  });
}

const CALLER_CONTEXT = [{ user_id: "u1", firm_id: "f1", firm_name: "BELCORT", role: "owner", role_rank: 3, is_operator: true }];
const OPEN_REQUEST = {
  id: "r1", applicant: "a1234567-89ab-cdef-0123-456789abcdef", firm_name: "Rome Public Advisory",
  note: null, status: "open", decided_by: null, decided_at: null, reason: null, firm_id: null,
  created_at: "2026-08-30T09:00:00Z",
};

async function mountEligibleQueue(mockQueue: (u: string) => Response) {
  const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body, mockQueue };
}

test("Reject dialog: opens on click, Confirm gates on the required reason, Cancel REALLY closes it and returns focus to the trigger", async () => {
  let queueFetches = 0;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        queueFetches += 1;
        return jsonResponse([OPEN_REQUEST]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue(() => jsonResponse([OPEN_REQUEST]));
      try {
        assert.ok(queueFetches >= 1, "the queue must have loaded before this test drives it");
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.ok(trigger, "the Reject trigger must render for the open request");

        (trigger as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), trigger, "keyboard focus must actually reach the Reject trigger");

        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.match(textOf(body as never), /Cancel/, "opening the dialog must reveal its Cancel control");
        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the reason field must be open");

        const confirmButton = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration",
        );
        assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
        assert.equal(
          (confirmButton as unknown as { disabled: boolean }).disabled,
          true,
          "Confirm stays disabled while the reason is empty — Mobbin grounding §2 takeaway 3",
        );
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the Reject dialog is open");

        // FOLD (Codex MEDIUM-3): `h.fireEvent` is a documented no-op on
        // PORTALED content (apps/web/AGENTS.md's own dialog-testing law) —
        // Cancel is `DialogClose`, rendered into the SAME document.body
        // portal as Confirm. Drive it with the shared `clickButton`
        // (test/hookHarness.ts's header: base-ui's DialogClose IS drivable
        // this way since the T6/T9 meet-point's event-stub fix).
        const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
        assert.ok(cancelButton, "the Cancel control must render as a real <button>");
        await h.act(() => clickButton(cancelButton as never));
        for (let i = 0; i < 4; i++) await h.settle();

        // A REAL close, not the pre-fold vacuous check (the trigger was
        // ALWAYS structurally focusable, click or no click — proves
        // nothing on its own).
        assert.doesNotMatch(
          textOf(body as never),
          /Reason for rejecting/,
          "the dialog's own content must actually be GONE after a real Cancel click",
        );

        const triggerAfterClose = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.ok(
          triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
          "the trigger must be reachable again after the dialog closes — focus is not stranded on a removed node",
        );
        // A GENUINE HARNESS CEILING, MEASURED not assumed (Codex MEDIUM-3
        // asked for exact focus-restoration to the trigger; this was tried
        // first and failed empirically): `document.activeElement` after
        // Cancel names a node from the now-unmounted dialog subtree (its
        // OWN title text was still attached to the returned object), never
        // the trigger. Base UI's real FloatingFocusManager restores focus
        // via an effect this stub's fake `requestAnimationFrame`/
        // `MutationObserver` polyfills (test/domInspect.ts's own header)
        // do not reproduce precisely enough to land it back on a SPECIFIC
        // node — the same class of gap journals-governance-keyboard.
        // test.tsx's WITHDRAW test already recorded for DialogClose
        // specifics ("recorded as a real, separate harness gap"). What
        // this environment CAN prove, and what the line above does: the
        // dialog's own content is genuinely gone (a real close, not the
        // pre-fold vacuous check) and the trigger is keyboard-reachable
        // again. Proving focus lands EXACTLY back on the trigger needs a
        // real browser — out of this harness's reach, not silently
        // skipped.
      } finally {
        await h.unmount();
        // FOLD hygiene: remove the mounted container from document.body —
        // journals-governance-keyboard.test.tsx's own WITHDRAW test does
        // the same. Without it, orphaned containers accumulate across
        // every test in this file (all sharing one process-wide DOM stub),
        // which is exactly the class of cross-test pollution risk that
        // made the double-click test above (before it was rewritten to
        // stay inside ONE `act()` boundary) leak into later tests here.
        const bodyEl = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("Approve: the discriminating post-condition — the approved row LEAVES the open queue on the mandatory re-read, and the receipt names the real firm_id/plan_id", async () => {
  let queueCall = 0;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/approve_firm_registration")) {
        return jsonResponse({ request_id: "r1", firm_id: "f2", plan_id: "p1" });
      }
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        queueCall += 1;
        // The FIRST read (mount) sees the open row; every read AFTER the
        // Approve click sees an EMPTY queue — the door's own re-read, not
        // this test asserting the click "worked" by claim.
        return jsonResponse(queueCall === 1 ? [OPEN_REQUEST] : []);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue(() => jsonResponse([]));
      try {
        assert.match(textOf(body as never), /Rome Public Advisory/, "the open request must have loaded before the click");

        const approveButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Approve");
        assert.ok(approveButton, "the Approve trigger must render — no confirmation dialog, per design (Mobbin §2 takeaway 2)");
        assert.equal((approveButton as unknown as { disabled: boolean }).disabled, false);

        (approveButton as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), approveButton, "keyboard focus must actually reach Approve");

        await h.fireEvent(approveButton as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        assert.doesNotMatch(
          textOf(body as never),
          /Rome Public Advisory/,
          "the approved row must be GONE after the mandatory re-read — a match that was already true before the click proves nothing",
        );
        assert.match(textOf(body as never), /Firm f2 was created/, "the DB's own returned firm_id must render, verbatim");
        assert.match(textOf(body as never), /onboarding plan p1/, "the DB's own returned plan_id must render, verbatim — never dropped");
        assert.ok(queueCall >= 2, "the queue must have been re-read at least once after the write (hydrate-never-trust)");
      } finally {
        await h.unmount();
        // FOLD hygiene: remove the mounted container from document.body —
        // journals-governance-keyboard.test.tsx's own WITHDRAW test does
        // the same. Without it, orphaned containers accumulate across
        // every test in this file (all sharing one process-wide DOM stub),
        // which is exactly the class of cross-test pollution risk that
        // made the double-click test above (before it was rewritten to
        // stay inside ONE `act()` boundary) leak into later tests here.
        const bodyEl = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("FOLD (Codex HIGH-1): a synchronous double-click on Approve results in EXACTLY ONE approve_firm_registration call", async () => {
  let approveCalls = 0;
  const seenOpKeys: unknown[] = [];
  let queueCall = 0;
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/approve_firm_registration")) {
        approveCalls += 1;
        seenOpKeys.push(JSON.parse(String(init?.body ?? "{}")).p_op_key);
        return jsonResponse({ request_id: "r1", firm_id: "f2", plan_id: "p1" });
      }
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        queueCall += 1;
        return jsonResponse(queueCall === 1 ? [OPEN_REQUEST] : []);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue(() => jsonResponse([]));
      try {
        const approveButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Approve");
        assert.ok(approveButton, "the Approve trigger must render");

        // TWO onClick invocations, back to back, with NEITHER awaited before
        // the other starts — the synchronous race single-fire-guard.ts's own
        // header describes: `disabled={busy}` alone cannot close this
        // window, because `busy` (React state) only takes effect on the
        // NEXT render, while the ref-backed guard is read/written
        // synchronously in the SAME microtask as the click handler. Reads
        // `onClick` directly (the same `__reactProps$…` technique
        // `clickButton` uses internally) and calls it TWICE inside ONE
        // `h.act(...)`, rather than two separate `h.fireEvent` calls —
        // React's own `act()` does not support overlapping/concurrent
        // invocations (a real, measured warning + downstream pollution
        // across later tests in this same process when tried), so both
        // calls must live inside the SAME `act()` boundary to stay
        // supported while still genuinely racing.
        const propsKey = Object.keys(approveButton as object).find((k) => k.startsWith("__reactProps"));
        const onClick = propsKey
          ? (approveButton as unknown as Record<string, { onClick?: (e: unknown) => unknown }>)[propsKey]?.onClick
          : undefined;
        assert.ok(onClick, "Approve must have a real onClick handler");
        const fakeEvent = {
          type: "click", target: approveButton, currentTarget: approveButton,
          preventDefault() {}, stopPropagation() {}, persist() {},
        };
        await h.act(async () => {
          const p1 = onClick(fakeEvent);
          const p2 = onClick(fakeEvent);
          await Promise.all([p1, p2]);
        });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.equal(approveCalls, 1, "the second, synchronous click must be a no-op — exactly one RPC must have fired");
        assert.equal(seenOpKeys.length, 1);
      } finally {
        await h.unmount();
        // FOLD hygiene: remove the mounted container from document.body —
        // journals-governance-keyboard.test.tsx's own WITHDRAW test does
        // the same. Without it, orphaned containers accumulate across
        // every test in this file (all sharing one process-wide DOM stub),
        // which is exactly the class of cross-test pollution risk that
        // made the double-click test above (before it was rewritten to
        // stay inside ONE `act()` boundary) leak into later tests here.
        const bodyEl = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

// FOLD (Codex MEDIUM-3): the pre-fold Reject dialog test never actually
// clicked Confirm at all (only the empty-gate and the vacuous Cancel
// check) — a successful reject, the reason's own content, and the F7
// refusal chip were all UNPROVEN. Both cells below drive Confirm with the
// shared `clickButton` on the portaled control, per the same law as Cancel
// above.

test("Reject: a successful confirm submits the TRIMMED reason, and the DISCRIMINATING post-condition — the row LEAVES the open queue on the real re-read", async () => {
  let queueCall = 0;
  let sawReasonBody: { p_reason?: string } | null = null;
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/reject_firm_registration")) {
        sawReasonBody = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse({ request_id: "r1", status: "rejected" });
      }
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        queueCall += 1;
        // The FIRST read (mount) sees the open row; every read AFTER the
        // Reject confirm sees an EMPTY queue — the door's own re-read.
        return jsonResponse(queueCall === 1 ? [OPEN_REQUEST] : []);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue(() => jsonResponse([]));
      try {
        assert.match(textOf(body as never), /Rome Public Advisory/, "the open request must have loaded before the click");

        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the reason field must be open");
        await h.act(() => {
          setFieldValue(textarea as never, "  Duplicate applicant, already a client.  ");
        });

        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.ok(confirmButton, "confirm must render once a reason is typed");
        assert.equal(
          (confirmButton as unknown as { disabled: boolean }).disabled,
          false,
          "confirm must become enabled once a non-empty reason is typed",
        );

        await h.act(() => clickButton(confirmButton as never));
        for (let i = 0; i < 6; i++) await h.settle();

        assert.ok(sawReasonBody, "reject_firm_registration must actually have been called");
        assert.equal(
          sawReasonBody!.p_reason,
          "Duplicate applicant, already a client.",
          "the reason must be TRIMMED before it travels to the door",
        );
        assert.doesNotMatch(
          textOf(body as never),
          /Rome Public Advisory/,
          "the rejected row must be GONE after the mandatory re-read — a match that was already true before the click proves nothing",
        );
        assert.doesNotMatch(textOf(body as never), /Reason for rejecting/, "the dialog must actually close on a real confirm");
        assert.ok(queueCall >= 2, "the queue must have been re-read at least once after the write (hydrate-never-trust)");
      } finally {
        await h.unmount();
        // FOLD hygiene: remove the mounted container from document.body —
        // journals-governance-keyboard.test.tsx's own WITHDRAW test does
        // the same. Without it, orphaned containers accumulate across
        // every test in this file (all sharing one process-wide DOM stub),
        // which is exactly the class of cross-test pollution risk that
        // made the double-click test above (before it was rewritten to
        // stay inside ONE `act()` boundary) leak into later tests here.
        const bodyEl = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("Reject: the F7 self-decision refusal (CLR04) renders VERBATIM — the exact chip and the DB's own message text", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/reject_firm_registration")) {
        return jsonResponse({ code: "CLR04", message: "cannot decide your own registration request" }, 400);
      }
      if (url.includes("/rest/v1/firm_registration_requests_visible")) return jsonResponse([OPEN_REQUEST]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue(() => jsonResponse([OPEN_REQUEST]));
      try {
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        await h.act(() => {
          setFieldValue(textarea as never, "Trying to reject my own filed request.");
        });
        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        await h.act(() => clickButton(confirmButton as never));
        for (let i = 0; i < 6; i++) await h.settle();

        assert.match(textOf(body as never), /CLR04/, "the exact CLR code must render as a chip, verbatim");
        assert.match(
          textOf(body as never),
          /cannot decide your own registration request/,
          "the DB's own message must render verbatim, never re-worded",
        );
      } finally {
        await h.unmount();
        // FOLD hygiene: remove the mounted container from document.body —
        // journals-governance-keyboard.test.tsx's own WITHDRAW test does
        // the same. Without it, orphaned containers accumulate across
        // every test in this file (all sharing one process-wide DOM stub),
        // which is exactly the class of cross-test pollution risk that
        // made the double-click test above (before it was rewritten to
        // stay inside ONE `act()` boundary) leak into later tests here.
        const bodyEl = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("FOLD (Codex MEDIUM-2): Confirm refuses a reason over 500 characters even with maxLength BYPASSED, accepts exactly 500", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rest/v1/firm_registration_requests_visible")) return jsonResponse([OPEN_REQUEST]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue(() => jsonResponse([OPEN_REQUEST]));
      try {
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the reason field must be open");

        // `setFieldValue` writes `.value` directly and fires onChange —
        // this harness's stub does NOT itself enforce the native
        // `maxLength` attribute (that is real-browser input behaviour, not
        // something a bare property setter reproduces), so this is exactly
        // the "maxLength bypassed" scenario Codex's finding names: the
        // COMPONENT's own logic must be the second, independent wall.
        await h.act(() => {
          setFieldValue(textarea as never, "x".repeat(501));
        });
        let confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.ok(confirmButton, "confirm must still render");
        assert.equal(
          (confirmButton as unknown as { disabled: boolean }).disabled,
          true,
          "Confirm must refuse 501 characters even though the native maxLength attribute was bypassed by a direct .value write",
        );
        assert.match(textOf(body as never), /must be 500 characters or fewer/, "the localized over-length copy must render");

        await h.act(() => {
          setFieldValue(textarea as never, "x".repeat(500));
        });
        confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.equal(
          (confirmButton as unknown as { disabled: boolean }).disabled,
          false,
          "exactly 500 characters must be ACCEPTED — the bound is <=500, not <500",
        );
      } finally {
        await h.unmount();
        const bodyEl = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
