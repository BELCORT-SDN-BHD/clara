// GATE (b) — structural a11y scan of the staff-advances workbench + the Enrol
// Account door dialog open (owner ruling Q7). See test/domInspect.ts's header
// for why this rides a hand-written rule engine rather than real axe-core —
// the close-a11y.test.tsx precedent, ported to this train's own panel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { StaffAdvancesRegister } from "./staff-advances-register";

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

/** The SAME direct-prop-invocation mechanism as hookHarness.ts's own
 *  `setFieldValue` (its header: needed for any base-ui-wrapped control whose
 *  own wrapper reads `event.currentTarget`/`event.nativeEvent` before ever
 *  forwarding to the consumer's handler — a plain dispatched event via
 *  `fireEvent` never gets it that far), generalised to any handler prop
 *  (`onChange` with a `value`/`checked` patch, or `onClick` with no patch)
 *  rather than only `onChange`/`value`. Measured need for the F3 test below:
 *  `fireEvent(node, "change", ...)` through several base-ui-wrapped fields
 *  in sequence left React's own state out of sync with the DOM despite every
 *  field's raw DOM value reading back correctly (a false positive), and
 *  separately `fireEvent(confirmButton, "click")` on THIS specific dialog's
 *  own Confirm button never reached its `onClick` at all (proven: the React
 *  props on that exact node carry a live `onClick` and `disabled: false`,
 *  yet the click listener registered on the root never routed to it) —
 *  invoking the prop directly sidesteps both failure modes. */
function driveHandler(node: Node, handlerName: "onChange" | "onClick", patch?: Record<string, unknown>): void {
  if (patch) Object.assign(node as object, patch);
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const props = propsKey ? (node as unknown as Record<string, Record<string, (e: unknown) => void>>)[propsKey] : undefined;
  const nativeEvent = { type: "input", target: node, defaultPrevented: false };
  props?.[handlerName]?.({
    target: node, currentTarget: node, nativeEvent,
    persist() {}, preventDefault() {}, stopPropagation() {},
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

const ACCOUNTS = [
  { client_id: "c1", account_code: "2100", name: "Staff advances — Ah Chong", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { client_id: "c1", account_code: "5100", name: "Wages and salaries", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
];

const ENROLMENTS = [
  { id: "en1", client_id: "c1", account_code: "2100", person_label: "Ah Chong", enrolment_attestation: "Not a related party.", active: true, enrolled_at: "2026-01-01T00:00:00Z", retired_by: null, retired_at: null, retired_reason: null },
];

const SUMMARY = { client_id: "c1", as_of: "2026-08-28", advances: [], outstanding_cents: 0, incomplete_count: 0, policy_notes: [] };
// S2: an outstanding advance so the Book Application dialog's allocations
// picker has a real candidate to add a row against.
const SUMMARY_WITH_OUTSTANDING = {
  client_id: "c1", as_of: "2026-08-28",
  advances: [{ enrolment_id: "en1", account_code: "2100", person_label: "Ah Chong", advance_id: "adv1", issue_date: "2026-08-01", amount_cents: 100000, outstanding_cents: 100000, days_outstanding: 27, purpose: null, reference: null, voided: false, particulars_complete: false, enrolment_active: true }],
  outstanding_cents: 100000, incomplete_count: 1, policy_notes: [],
};
const TIE = { client_id: "c1", as_of: "2026-08-28", tie: true, accounts: [] };

async function mockFetch(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rest/v1/staff_advances?")) return jsonResponse([]);
  if (u.includes("/rest/v1/staff_advance_accounts?")) return jsonResponse(ENROLMENTS);
  if (u.includes("/rest/v1/coa_accounts?")) return jsonResponse(ACCOUNTS);
  if (u.includes("/rpc/staff_advance_summary")) return jsonResponse(SUMMARY);
  if (u.includes("/rpc/staff_advance_tie")) return jsonResponse(TIE);
  throw new Error(`unexpected fetch: ${u}`);
}

async function mockFetchWithOutstanding(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const u = String(url);
  if (u.includes("/rpc/enrol_staff_advance_account")) {
    return jsonResponse(
      { code: "CLR10", message: "account 5100 already carries an approved GL balance of 250000 cents; a staff-advance enrolment can only start from a clean account", details: '{"reason":"enrolment_balance_nonzero"}' },
      400,
    );
  }
  if (u.includes("/rest/v1/staff_advances?")) return jsonResponse([]);
  if (u.includes("/rest/v1/staff_advance_accounts?")) return jsonResponse(ENROLMENTS);
  if (u.includes("/rest/v1/coa_accounts?")) return jsonResponse(ACCOUNTS);
  if (u.includes("/rpc/staff_advance_summary")) return jsonResponse(SUMMARY_WITH_OUTSTANDING);
  if (u.includes("/rpc/staff_advance_tie")) return jsonResponse(TIE);
  void init;
  throw new Error(`unexpected fetch: ${u}`);
}

function App() {
  // Wrapped in an <h1> the same way the real client-workspace page renders
  // above the registers tab (the documented pattern in every P3 a11y test).
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(StaffAdvancesRegister, { clientId: "c1" })),
  });
}

test("staff-advances workbench + Enrol Account door dialog OPEN have zero violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.match(h.text(), /Ah Chong/, "the panel must have loaded far enough to show the enrolled account");

      const collapsedViolations = checkAccessibility(body as never);
      assert.deepEqual(collapsedViolations, [], `collapsed: ${JSON.stringify(collapsedViolations)}`);

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Enrol account"));
      assert.ok(trigger, "the Enrol Account dialog trigger must render");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the trigger must reveal the dialog's cancel control");
      assert.match(bodyText, /related-party/, "the dialog must render the real G15 attestation copy, not a placeholder");

      const openViolations = checkAccessibility(body as never);
      assert.deepEqual(openViolations, [], `open dialog: ${JSON.stringify(openViolations)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("staff-advances workbench renders the tie-out state banner honestly (register ties to the GL)", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.match(h.text(), /ties to the general ledger/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

// F3 (independent review, fix-required, 2026-08-28): before this test, the
// refusal-banner block ({err && <StateBanner/>}) in staff-advances-register.tsx
// had NO test at all pinning that a real refusal lands there — a mutant that
// deletes the whole block left the rest of the battery green. This drives a
// REAL CLR10 refusal through the Enrol Account door dialog's own confirm
// button (never fabricated as a rendered string) and asserts the code +
// message land VERBATIM in the register's own persistent banner, OUTSIDE the
// dialog — which auto-closes after every confirm attempt regardless of
// outcome (StaffAdvanceDoorDialog's own contract, the CloseDoorDialog
// pattern).
test("F3: a governed refusal (enrol_staff_advance_account) renders verbatim in the register's own persistent banner, never merely as a rendered string", async () => {
  await withMockedEnv(mockFetchWithOutstanding, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Enrol account"));
      assert.ok(trigger, "the Enrol Account trigger must render");
      await h.fireEvent(trigger! as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      // Content-scoped, not order-scoped: the statement panel (below, in the
      // same tree) ALSO renders a <select> of account codes with no
      // placeholder option — a bare "first SELECT in document order" probe
      // silently grabbed that one instead of the dialog's own (measured: the
      // dialog's own accountCode state never left "", Confirm stayed
      // disabled, and the assertion below is what caught it).
      const select = findIn(
        body as never,
        (n) => n.tagName === "SELECT" && (n.childNodes ?? []).some((c) => c.tagName === "OPTION" && textOf(c as never).includes("Select an account")),
      );
      assert.ok(select, "the Enrol dialog's OWN account-code select (with its placeholder option) must be reachable");
      await h.act(() => { driveHandler(select as never, "onChange", { value: "5100" }); });

      const personInput = findIn(body as never, (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type !== "checkbox");
      assert.ok(personInput, "the person-label input must be reachable inside the dialog");
      await h.act(() => { setFieldValue(personInput as never, "Ah Chong"); });

      const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(textarea, "the attestation textarea must be reachable inside the dialog");
      await h.act(() => { driveHandler(textarea as never, "onChange", { value: "Not a related party." }); });

      const checkbox = findIn(body as never, (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type === "checkbox");
      assert.ok(checkbox, "the confirm-dedicated checkbox must be reachable inside the dialog");
      await h.act(() => { driveHandler(checkbox as never, "onChange", { checked: true }); });
      for (let i = 0; i < 2; i++) await h.settle();

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Enrol account") && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "every required field is now filled — Confirm must be enabled");

      await h.act(() => { driveHandler(confirmButton as never, "onClick"); });
      for (let i = 0; i < 8; i++) await h.settle();

      // The dialog auto-closes on every confirm attempt (success or refusal)
      // — the refusal must render in the CALLER's own banner, not inside a
      // dialog that no longer exists. The dialog's own Cancel control only
      // exists while it is open, so its absence is the closed signal.
      const cancelStillOpen = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
      assert.equal(cancelStillOpen, null, "the dialog must have closed after the confirm attempt settled");

      assert.match(h.text(), /CLR10/, "the CLR code must render, verbatim");
      assert.match(h.text(), /already carries an approved GL balance/, "the DB's own message must render, verbatim — never re-worded");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

// S2 (independent review): the Book Application dialog's a11y coverage
// previously only proved the COLLAPSED shell — the lines editor and the
// allocations editor (each with its own NativeSelect/CentsInput/remove
// button) never had a live row scanned open. This adds one of each.
test("Book Application dialog OPEN with a real allocation row has zero a11y violations", async () => {
  await withMockedEnv(mockFetchWithOutstanding, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Book application"));
      assert.ok(trigger, "the Book Application trigger must render");
      await h.fireEvent(trigger! as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const addAllocation = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Add allocation"));
      assert.ok(addAllocation, "the Add allocation control must render inside the dialog");
      await h.fireEvent(addAllocation as never, "click");
      for (let i = 0; i < 2; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /outstanding/, "the added allocation row must show the real, DB-derived outstanding candidate");

      const violations = checkAccessibility(body as never);
      assert.deepEqual(violations, [], `open Book Application dialog with a live allocation row: ${JSON.stringify(violations)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
