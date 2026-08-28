// GATE (c) — keyboard-walk tests for T9's (port-wave) door dialogs: mint
// snapshot, requeue render job (incl. the drift-acknowledge checkbox), tick a
// seeding proposal, retire a wiki page. Same mechanism as
// components/close/close-keyboard.test.tsx (test/keyboardWalk.ts); see that
// file's header for what real key-event dispatch this environment can and
// cannot prove.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, setNativeValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { SnapshotRegistryPanel } from "./SnapshotRegistryPanel";
import { SeedingBatchesPanel } from "./SeedingBatchesPanel";
import { RenderJobQueuePanel } from "./RenderJobQueuePanel";
import { WikiCurationPanel } from "./WikiCurationPanel";

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

// T6/T9 meet-point consolidation: this file used to carry its own local
// `clickConfirm` (a direct-invoke helper for a DoorDialog Confirm/Cancel
// button's onClick, including the `nativeEvent` shape DialogClose's own
// handleClick needs — see hookHarness.ts's `clickButton` for the full
// discovery note). It is now `clickButton`, imported above — the ONE
// exported helper both T6 and T9 converged on, guarded to throw on a
// disabled node rather than risk manufacturing a false green on an
// unopenable door.

/** The SAME portal-boundary gap `clickButton` exists for, on a plain
 *  native `<input type="checkbox">`'s onChange: this checkbox lives inside
 *  the SAME DialogPortal content (appended to `body`, a SIBLING of
 *  `h.container`, not a descendant), so `fireEvent`'s delegated dispatch
 *  through `container.__listeners` never reaches it either — unlike
 *  matching-section.test.tsx's checkboxes, which sit directly in
 *  `h.container`'s own tree (no portal), where the identical `fireEvent`
 *  idiom is proven to work. Calls onChange directly with the node's own
 *  (already flipped via setNativeValue) `.checked`. */
async function changeCheckbox(node: Node, checked: boolean): Promise<void> {
  setNativeValue(node as never, "checked", checked);
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const onChange = propsKey ? (node as unknown as Record<string, { onChange?: (e: unknown) => unknown }>)[propsKey]?.onChange : undefined;
  if (!onChange) throw new Error("changeCheckbox: no onChange prop found on this node — is it really a checkbox input?");
  await onChange({
    type: "change", target: node, currentTarget: node, bubbles: true, cancelable: true,
    defaultPrevented: false, isTrusted: true, timeStamp: Date.now(),
    preventDefault() {}, stopPropagation() {}, persist() {},
  });
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

function App(child: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Reports"), child),
  });
}

test("T9 (mint-snapshot door): the trigger is keyboard-reachable, opening it reaches the month field and Confirm, Cancel is keyboard-reachable AND genuinely closes the dialog (proven via the dialog's own content vanishing, not the always-present trigger)", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    if (String(u).includes("/period_snapshots")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${String(u)}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(SnapshotRegistryPanel, { clientId: "c1", session: sessionTokenAccessor })));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Mint snapshot"));
      assert.ok(trigger, "the Mint-snapshot trigger must render as a real button");
      assert.ok(focusableElements(h.container as never).includes(trigger as never), "the trigger must be keyboard-reachable");

      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");

      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      const monthField = findIn(body as never, (n) => n.tagName === "INPUT");
      assert.ok(monthField, "the dialog must reach its month field");

      // F6 (independent review): the DISABLED PROPERTY itself, not merely
      // reachability — the P3 unopenable-door class is a control that
      // RENDERS but never actually admits a click. A month is pre-filled
      // (SnapshotRegistryPanel defaults to the current month), so Confirm
      // starts enabled here.
      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Mint" && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm (Mint) button must be reachable, distinct from the trigger");
      assert.equal(
        (confirmButton as unknown as { disabled: boolean }).disabled,
        false,
        "Confirm must NOT be disabled with a month already filled in — a mutation to confirmDisabled={true} here must go RED",
      );

      // Ride-along, upgraded (T6's reviewer, probe-proven; resent with the
      // "prove it if you can" note): the OLD "trigger reachable after close"
      // assertion measured nothing — the trigger lives in `h.container`
      // (never portaled) and is ALWAYS reachable there whether or not the
      // dialog actually closed, and a plain `h.fireEvent` click on a
      // portaled Cancel is a no-op with NO fake-Event globals defined. This
      // file's own hookHarness.ts fix (the requeue test's third open, this
      // same file) makes Cancel genuinely drivable via the direct-invoke
      // `clickButton` helper — proven THERE (checkbox/Confirm state
      // actually reset after a close+reopen) — so this uses the SAME
      // mechanism here for a REAL positive proof, never a downgrade: the
      // dialog's own content (its title) must be GONE from `body` after
      // Cancel, which is false while the dialog is open and can only be
      // true if the close genuinely happened.
      const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
      assert.ok(cancelButton, "the Cancel control must render as a real button");
      assert.ok(
        focusableElements(body as never).includes(cancelButton as never),
        "the Cancel control must be keyboard-reachable",
      );
      assert.match(textOf(body as never), /Mint a month snapshot/, "sanity: the dialog title is present BEFORE Cancel — proves the assertion below is not vacuously true");

      await h.act(() => clickButton(cancelButton as never));
      for (let i = 0; i < 6; i++) await h.settle();

      assert.doesNotMatch(
        textOf(body as never),
        /Mint a month snapshot/,
        "the dialog's own content must be GONE after Cancel — a real proof the close happened, not merely that the trigger (always present) is reachable",
      );
      const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Mint snapshot"));
      assert.ok(
        triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
        "the trigger must be reachable again after the dialog closes",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("T9 (tick-proposal door): the trigger is keyboard-reachable and Enter/Space-equivalent activation opens it, reaching Confirm", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/seeding_batches")) {
      return jsonResponse([{ id: "b1", client_id: "c1", source_document_id: "doc1", source_sha256: "d".repeat(64), state: "open", stats: {}, created_by: "u1", created_at: "2026-07-01T00:00:00Z", completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancel_reason: null }]);
    }
    if (url.includes("/seeding_proposals")) {
      return jsonResponse([{ id: "p1", batch_id: "b1", client_id: "c1", proposal_kind: "counterparty_birth", proposal_key: "k1", payload: { name: "Acme Sdn Bhd" }, evidence: {}, state: "proposed", decided_by: null, decided_at: null, decision_reason: null, refuse_reason: null, resulting_rule_id: null, resulting_counterparty_id: null, created_at: "2026-07-01T00:00:00Z" }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(SeedingBatchesPanel, { clientId: "c1", session: sessionTokenAccessor })));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Tick");
      assert.ok(trigger, "the Tick trigger must render as a real button");
      assert.ok(focusableElements(h.container as never).includes(trigger as never), "the trigger must be keyboard-reachable");

      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must reach the trigger");

      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Tick" && (n as unknown) !== (trigger as unknown));
      assert.ok(confirmButton, "the dialog's own Confirm (Tick) button must be reachable, distinct from the trigger");
      // F6 (independent review): TickDialog carries no confirmDisabled prop
      // at all (no reason field), so Confirm must be enabled from open —
      // this is the exact mutation class (`confirmDisabled={true}` shipping
      // green) F6 asks to catch; asserting the property, not just presence,
      // is what makes that mutation go red.
      assert.equal(
        (confirmButton as unknown as { disabled: boolean }).disabled,
        false,
        "Confirm must NOT be disabled — a mutation to confirmDisabled={true} here must go RED",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

// F7 (independent review): the header claimed four doors, tested two — this
// adds requeue (through the drift-checkbox path, both opens) and retire-wiki.
// Both this door's Trigger AND Confirm buttons carry the SAME label text
// ("Requeue" / "Retire"), so every lookup below disambiguates by OBJECT
// IDENTITY (`!== trigger`), never text alone.

test("T9 (requeue-render-job door, incl. the drift checkbox path): Confirm starts DISABLED on an empty reason, enables once typed, the drift checkbox is keyboard-reachable on the SECOND open, Confirm re-gates on it, and a THIRD open (after a plain cancel) resets the checkbox + reason + Confirm again — F4's pin", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/render_jobs")) {
      return jsonResponse([{ id: "rj1", client_id: "c1", report_run_id: "run1", kind: "pre_sign", state: "failed", manifest_sha256: "e".repeat(64), requested_by: "u1", attempts: 1, max_attempts: 5, last_error: { code: "render_timeout" }, supersedes_render_job_id: null, requeue_reason: null, enqueued_at: "2026-07-01T00:00:00Z", finished_at: "2026-07-01T00:05:00Z" }]);
    }
    if (url.includes("/rpc/requeue_render_job")) {
      return jsonResponse(
        { code: "CLR43", message: "the re-derived request differs from the one that failed", details: JSON.stringify({ reason: "requeue_manifest_drifted" }) },
        400,
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(RenderJobQueuePanel, { clientId: "c1", session: sessionTokenAccessor })));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      let trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Requeue"));
      assert.ok(trigger, "the Requeue trigger must render for a failed job");
      // base-ui's FloatingFocusManager tracks the previously-focused element
      // to restore focus to on close — establishing REAL focus here (as
      // every other T9 keyboard test already does) keeps that mechanism on
      // its normal path once this test starts closing/reopening the dialog
      // repeatedly below.
      (trigger as unknown as { focus: () => void }).focus();
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      let confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Requeue" && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger by IDENTITY (F7 disambiguation)");
      assert.equal(
        (confirmButton as unknown as { disabled: boolean }).disabled,
        true,
        "Confirm starts DISABLED — the reason field is empty (F6's mutation-proof shape)",
      );

      const reasonField = findIn(body as never, (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type !== "checkbox");
      assert.ok(reasonField, "the reason field must be reachable");
      await h.act(() => { setFieldValue(reasonField as never, "render timeout"); });
      for (let i = 0; i < 2; i++) await h.settle();

      confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Requeue" && (n as unknown) !== (trigger as unknown),
      );
      assert.equal(
        (confirmButton as unknown as { disabled: boolean }).disabled,
        false,
        "Confirm ENABLES once the reason is typed — a mutation pinning it disabled must go RED",
      );
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations, first open");

      await h.act(() => clickButton(confirmButton as never));
      for (let i = 0; i < 8; i++) await h.settle();

      // --- Second open: the drift checkbox must be keyboard-reachable, and
      // Confirm must re-gate on it (RequeueDialog's own note: the dialog
      // closes on every attempt, so this consent can only ever be shown —
      // and exercised — on the dialog's NEXT open). ---
      trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Requeue"));
      assert.ok(trigger, "the Requeue trigger must still render after the refusal");
      (trigger as unknown as { focus: () => void }).focus();
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const checkbox = findIn(body as never, (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type === "checkbox");
      assert.ok(checkbox, "the drift consent checkbox must render on the second open");
      assert.ok(
        focusableElements(body as never).includes(checkbox as never),
        "the drift checkbox must be keyboard-reachable, not merely present",
      );
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations with the checkbox visible");

      const reasonFieldSecond = findIn(body as never, (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type !== "checkbox");
      assert.ok(reasonFieldSecond, "the reason field must be reachable again");
      // F4 pin (independent review, re-verify round): PRESENCE alone does not
      // prove the reset — the field could just as easily have carried the
      // FIRST open's leftover value forward. Assert the VALUE is actually
      // empty.
      assert.equal(
        (reasonFieldSecond as unknown as { value: string }).value,
        "",
        "the reason field must be RESET (empty), not carrying the first open's leftover text — F4",
      );
      await h.act(() => { setFieldValue(reasonFieldSecond as never, "accepting the drift"); });
      for (let i = 0; i < 2; i++) await h.settle();

      let confirmSecond = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Requeue" && (n as unknown) !== (trigger as unknown),
      );
      assert.equal(
        (confirmSecond as unknown as { disabled: boolean }).disabled,
        true,
        "Confirm stays disabled while a KNOWN drift is unacknowledged, even with a reason typed",
      );

      await h.act(() => changeCheckbox(checkbox as never, true));
      for (let i = 0; i < 4; i++) await h.settle();

      confirmSecond = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Requeue" && (n as unknown) !== (trigger as unknown),
      );
      assert.equal(
        (confirmSecond as unknown as { disabled: boolean }).disabled,
        false,
        "checking the drift consent box ENABLES Confirm — the gate moved to the checkbox, it did not disappear",
      );

      // F4 pin (independent review, re-verify round): close WITHOUT
      // submitting (Cancel, not Confirm — `drift` itself must survive this
      // close, since it is not reset; only `acceptDrift`/`reason` are), then
      // reopen and prove the checkbox comes back UNCHECKED and Confirm
      // re-gates — a fresh deliberate act on EVERY open, not just the second
      // one.
      const cancelSecond = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
      assert.ok(cancelSecond, "the Cancel control must be reachable on the second open too");
      await h.act(() => clickButton(cancelSecond as never));
      for (let i = 0; i < 6; i++) await h.settle();

      trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Requeue"));
      assert.ok(trigger, "the Requeue trigger must still render after cancelling");
      (trigger as unknown as { focus: () => void }).focus();
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const checkboxThird = findIn(body as never, (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type === "checkbox");
      assert.ok(checkboxThird, "the drift checkbox must still render on the THIRD open — `drift` itself is not reset by a cancel");
      assert.equal(
        (checkboxThird as unknown as { checked: boolean }).checked,
        false,
        "the checkbox must come back UNCHECKED on this new open — acceptDrift is NOT carried forward from the prior open's tick",
      );

      const confirmThird = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Requeue" && (n as unknown) !== (trigger as unknown),
      );
      assert.equal(
        (confirmThird as unknown as { disabled: boolean }).disabled,
        true,
        "Confirm must be disabled again on this new open — the earlier tick must not leak forward",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("T9 (retire-wiki-page door): Confirm starts DISABLED on an empty reason and enables once typed, distinct from the trigger by IDENTITY", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    if (String(u).includes("/wiki_pages")) {
      return jsonResponse([{ id: "w1", client_id: "c1", slug: "treatment/gst-input-tax", page_kind: "treatment", title: "GST input tax treatment", counterparty_id: null, current_version_id: "v1", state: "active", retired_at: null, retired_by: null, retire_reason: null, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-15T00:00:00Z" }]);
    }
    throw new Error(`unexpected fetch: ${String(u)}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(WikiCurationPanel, { clientId: "c1", session: sessionTokenAccessor })));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Retire"));
      assert.ok(trigger, "the Retire trigger must render for an active page");
      assert.ok(focusableElements(h.container as never).includes(trigger as never), "the trigger must be keyboard-reachable");

      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      let confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Retire" && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger by IDENTITY (F7 disambiguation)");
      assert.equal(
        (confirmButton as unknown as { disabled: boolean }).disabled,
        true,
        "Confirm starts DISABLED — the reason field is empty",
      );

      const reasonField = findIn(body as never, (n) => n.tagName === "INPUT");
      assert.ok(reasonField, "the reason field must be reachable");
      await h.act(() => { setFieldValue(reasonField as never, "superseded by a newer treatment note"); });
      for (let i = 0; i < 2; i++) await h.settle();

      confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Retire" && (n as unknown) !== (trigger as unknown),
      );
      assert.equal(
        (confirmButton as unknown as { disabled: boolean }).disabled,
        false,
        "Confirm ENABLES once the reason is typed — a mutation pinning it disabled must go RED",
      );
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

// Item 4 (T6/T9 meet-point consolidation): prove the DISABLED guard binds —
// hookHarness.ts's own doc claims `clickButton` throws rather than silently
// no-ops on a disabled node; a claim in a comment is not evidence (review
// law 2). No dedicated hookHarness selftest file exists yet, so this lives
// here, against a REAL disabled control from this train's own fixtures
// (the retire-wiki Confirm button, disabled before any reason is typed) —
// not a hand-built stub, since only a react-dom-committed node carries the
// `__reactProps$…` key `clickButton` reads.
test("hookHarness clickButton GUARD: refuses to click a DISABLED node — throws, never silently no-ops (the F6/P3 unopenable-door defect class)", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    if (String(u).includes("/wiki_pages")) {
      return jsonResponse([{ id: "w1", client_id: "c1", slug: "treatment/gst-input-tax", page_kind: "treatment", title: "GST input tax treatment", counterparty_id: null, current_version_id: "v1", state: "active", retired_at: null, retired_by: null, retire_reason: null, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-15T00:00:00Z" }]);
    }
    throw new Error(`unexpected fetch: ${String(u)} — the guard must throw BEFORE any door call, so this must never be reached`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(WikiCurationPanel, { clientId: "c1", session: sessionTokenAccessor })));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Retire"));
      assert.ok(trigger, "the Retire trigger must render");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Retire" && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable");
      assert.equal(
        (confirmButton as unknown as { disabled: boolean }).disabled,
        true,
        "sanity: Confirm must genuinely be disabled here (no reason typed yet) — otherwise this test proves nothing about the guard",
      );

      await assert.rejects(
        h.act(() => clickButton(confirmButton as never)),
        (e: unknown) => e instanceof Error && /refusing to click a DISABLED node/.test(e.message),
        "clickButton must THROW on a disabled node, not silently no-op — a helper that can click through a disabled gate is the one tool capable of manufacturing a false green on a permanently-unopenable door",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
