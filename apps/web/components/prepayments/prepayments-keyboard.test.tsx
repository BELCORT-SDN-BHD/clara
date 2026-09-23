// #653 — GATE (c): the keyboard walk over the configure form and the schedule detail's lifecycle
// doors. See `test/keyboardWalk.ts`'s header for exactly what this environment can and cannot
// prove about real key-event dispatch.
//
// THE P3 WORKBENCH LESSON, restated: a keyboard gate found six permanently-unopenable doors five
// code reviews missed. It is a DIFFERENT INSTRUMENT, not another reader.
//
// WHAT THESE CELLS PIN, beyond "the walk is clean":
//   1. A FAILED SUBMIT FOCUSES THE FIRST INVALID CONTROL AND KEEPS THE DRAFT. Appendix C §3's own
//      rule — and on this form it matters more than usual, because the fields a person filled are
//      a judgement they made, not figures they can re-read off a screen.
//   2. THE DERIVED PREVIEW IS NOT IN THE TAB ORDER. `fieldset[disabled]` is what makes a preview a
//      preview; one a keyboard user could tab into and appear to edit would be the editor this
//      lane refuses to be.
//   3. EVERY LIFECYCLE DOOR ON THE DETAIL IS REACHABLE AND OPENABLE BY KEYBOARD, with its Title
//      announced and focus restored to a landmark when the trigger unmounts with the status.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, clickButton, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { PrepaymentForm } from "./prepayment-form";
import { PrepaymentDetail } from "./prepayment-detail";

enableDomInspection();

const CLIENT = "11111111-2222-4333-8444-555555555555";
const SCHEDULE = "44444444-5555-4666-8777-888888888888";
const PLAN = "22222222-3333-4444-8555-666666666666";
const ENTRY = "55555555-6666-4777-8888-999999999999";
const DOC = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const WORK = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";

type Node = {
  tagName?: string; childNodes?: Node[];
  getAttribute?: (k: string) => string | null;
};

function findAllIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

/** The harness's `clickButton` / `setFieldValue` take the NODE itself, so every cell below finds
 *  its control first and then acts on it — never a container plus a selector string. */
function byId(root: Node, id: string): Node {
  const found = findAllIn(root, (n) => n.getAttribute?.("id") === id)[0];
  assert.ok(found, `no control with id ${id}`);
  return found;
}

function textIn(n: Node): string {
  const self = (n as unknown as { textContent?: string }).textContent;
  return typeof self === "string" ? self : "";
}

function buttonWith(root: Node, label: string): Node {
  const found = findAllIn(root, (n) => n.tagName === "BUTTON" && textIn(n).trim() === label)[0];
  assert.ok(found, `no button labelled ${label}`);
  return found;
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
  { client_id: CLIENT, account_code: "59000001", name: "Subscriptions", account_type: "expense", is_active: true },
  { client_id: CLIENT, account_code: "19000001", name: "Prepayments", account_type: "asset", is_active: true },
];

// THE PICKER'S CANDIDATES, IN THE DOOR'S OWN ENVELOPE. #809 deleted the direct
// `/rest/v1/accounting_work` read this fixture used to answer and repointed the picker at
// `clara.list_accounting_work` (migration 0203 gave that projection the `intent_key` the label
// falls back to), so the fixture is the door's page shape and the row is `WorkListRow`-shaped.
const AUTHORITIES = {
  rows: [
    { id: WORK, client_id: CLIENT, intent_key: "instruction:2026-01", created_at: "2026-01-10T00:00:00Z",
      memo: "the client instructed us to amortise the annual subscription" },
  ],
  next_cursor: null,
  truncated: false,
};

const ATTENTION = {
  client_id: CLIENT,
  refusing: [],
  unscheduled: [{
    arm: "unscheduled", entry_id: ENTRY, posting_date: "2026-02-14", memo: "prepaid insurance",
    document_id: DOC, prepaid_account_code: "19000001", amount_cents: 240000, has_live_term: true,
  }],
};

const CREATED = {
  schedule_id: SCHEDULE, plan_id: PLAN, revision_id: "rev1", revision: 1, status: "active",
  kind: "amortisation_schedule", client_id: CLIENT, source_entry_id: ENTRY, document_id: DOC,
  service_period_id: "sp1", basis_kind: "human_stated",
  term_start: "2026-01-01", term_end: "2026-03-31",
  prepaid_account_code: "19000001", expense_account_code: "59000001",
  expense_account_basis: "b", total_cents: 100000, period_count: 3,
  remainder_placement: "final_period", schedule_version: "v1",
  period_lines: [
    { period_start: "2026-01-01", period_end: "2026-01-31", amount_cents: 33333, credit_cents: 33333, prepaid_account_code: "19000001", expense_account_code: "59000001" },
    { period_start: "2026-02-01", period_end: "2026-02-28", amount_cents: 33333, credit_cents: 33333, prepaid_account_code: "19000001", expense_account_code: "59000001" },
    { period_start: "2026-03-01", period_end: "2026-03-31", amount_cents: 33334, credit_cents: 33334, prepaid_account_code: "19000001", expense_account_code: "59000001" },
  ],
  frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
  timezone: "Asia/Kuala_Lumpur", effective_from: "2026-01-31", effective_to: "2026-03-31",
  // #929/0283 retired the 0045 template arm: the real backend can only ever answer
  // "accounting_plan_overlap", keyed by plan_id — kept in that exact shape even though the
  // component never branches on either field (it reads only `.name`).
  next_occurrences: [], overlap_warning: { kind: "accounting_plan_overlap", templates: [{ plan_id: "p1", name: "Monthly rent plan" }] },
  configuration_only: true,
};

const DETAIL = {
  schedule_id: SCHEDULE, client_id: CLIENT, plan_id: PLAN, revision: 1,
  kind: "amortisation_schedule", status: "active", purpose: "Prepaid subscription amortisation",
  source_entry_id: ENTRY, source_posting_date: "2026-01-15", source_memo: "m", source_status: "approved",
  document_id: DOC, service_period_id: "sp1", term_start: "2026-01-01", term_end: "2026-03-31",
  basis_kind: "human_stated", prepaid_account_code: "19000001", expense_account_code: "59000001",
  expense_account_basis: "b", total_cents: 100000, period_count: 3,
  remainder_placement: "final_period", schedule_version: "v1",
  created_by: "u1", created_at: "2026-01-15T00:00:00Z",
  authority_kind: "explicit_instruction", authority_ref: { kind: "accounting_work", id: "w0" },
  authorised_by: "u1", authorised_at: "2026-01-15T00:00:00Z", authority_from: "2026-01-31",
  covered_through: null,
  paused_at: null, paused_by: null, paused_reason: null,
  ended_at: null, ended_by: null, ended_reason: null,
  live_revision: {
    revision: 1, frequency: "monthly", day_rule: "last_day_of_month", day_of_month: null,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-01-31", effective_to: "2026-03-31",
    basis: {}, basis_digest: "a".repeat(64),
  },
  periods: [
    { period_start: "2026-01-01", period_end: "2026-01-31", amount_cents: 33333, credit_cents: 33333, prepaid_account_code: "19000001", expense_account_code: "59000001", occurrence: null },
    { period_start: "2026-02-01", period_end: "2026-02-28", amount_cents: 33333, credit_cents: 33333, prepaid_account_code: "19000001", expense_account_code: "59000001", occurrence: null },
    { period_start: "2026-03-01", period_end: "2026-03-31", amount_cents: 33334, credit_cents: 33334, prepaid_account_code: "19000001", expense_account_code: "59000001", occurrence: null },
  ],
  occurrences: [],
  configuration_only: true,
};

function router(answers: Record<string, unknown>, post?: (verb: string) => Response | null): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    for (const [verb, body] of Object.entries(answers)) {
      if (url.includes(`/rpc/${verb}`)) {
        const override = init?.method === "POST" ? post?.(verb) : null;
        return override ?? jsonResponse(body);
      }
    }
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(ACCOUNTS);
    // THE INSTRUCTION THIS SCHEDULE WILL CITE. The door RESOLVES `p_authority_ref` against this
    // client's own `clara.accounting_work`, so the picker has to have something to pick — and
    // since #809 it reads that list through `clara.list_accounting_work` rather than the table.
    if (url.includes("/rpc/list_accounting_work")) return jsonResponse(AUTHORITIES);
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;
}

const ROUTER = {
  replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {},
  prefetch: () => {},
};

function app(node: React.ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      { value: ROUTER as never },
      createElement("main", null, createElement("h1", null, "Prepayments"), node),
    ),
  });
}

test("prepayments.keyboard — the configure form's whole control set is reachable, and the walk finds no trap", async () => {
  await withMockedEnv(router({ list_prepayment_attention: ATTENTION }), async () => {
    const h = await renderComponent(app(createElement(PrepaymentForm, { clientId: CLIENT })));
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const findings = checkKeyboardWalk(h.container as never);
      assert.deepEqual(findings, [], `keyboard findings: ${JSON.stringify(findings, null, 1)}`);
      const ids = focusableElements(h.container as never)
        .map((n) => (n as unknown as Node).getAttribute?.("id") ?? "")
        .filter((x) => x.startsWith("prepayment-"));
      assert.deepEqual(ids, [
        "prepayment-sourceEntry", "prepayment-authority", "prepayment-expenseAccount",
        "prepayment-expenseBasis", "prepayment-purpose",
      ], "every field this form asks for is reachable, in the order it reads");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("prepayments.keyboard — a failed submit FOCUSES the first invalid control and KEEPS every field the person filled", async () => {
  await withMockedEnv(router({ list_prepayment_attention: ATTENTION }), async () => {
    const h = await renderComponent(app(createElement(PrepaymentForm, { clientId: CLIENT })));
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      // Everything but the recognition — so the FIRST invalid control is the source select.
      await h.act(() => {
        setFieldValue(byId(h.container, "prepayment-expenseAccount") as never, "59000001");
        setFieldValue(byId(h.container, "prepayment-expenseBasis") as never, "the invoice narrates a subscription");
        setFieldValue(byId(h.container, "prepayment-purpose") as never, "Prepaid subscription amortisation");
      });
      for (let i = 0; i < 3; i++) await h.settle();

      await h.act(async () => {
        await clickButton(buttonWith(h.container, "Configure the schedule") as never);
      });
      for (let i = 0; i < 4; i++) await h.settle();

      const focused = activeElement() as unknown as Node | null;
      assert.equal(focused?.getAttribute?.("id"), "prepayment-sourceEntry",
        "the first invalid control takes focus, so a keyboard reader is put where the mistake is");
      const text = h.text();
      assert.match(text, /Choose the recognised prepayment/, "…and the issue is named beside it");
      // THE DRAFT SURVIVES. Read off the LIVE `.value` property rather than the attribute: a
      // controlled React input never writes `value` into the markup, so an attribute probe would
      // pass vacuously on every field whether the draft survived or not.
      const values = findAllIn(h.container, (n) => n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT")
        .map((n) => String((n as unknown as { value?: string }).value ?? ""));
      assert.ok(values.some((v) => v.includes("Prepaid subscription amortisation")),
        `the purpose a person typed is still there: ${JSON.stringify(values)}`);
      assert.ok(values.some((v) => v.includes("the invoice narrates a subscription")),
        `…and so are the stated grounds: ${JSON.stringify(values)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("prepayments.keyboard — the DERIVED PREVIEW is not in the tab order: a disabled fieldset is what makes a preview a preview", async () => {
  await withMockedEnv(
    router({ list_prepayment_attention: ATTENTION, create_prepayment_schedule: CREATED }),
    async () => {
      const h = await renderComponent(app(createElement(PrepaymentForm, { clientId: CLIENT })));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        await h.act(() => {
          setFieldValue(byId(h.container, "prepayment-sourceEntry") as never, ENTRY);
          setFieldValue(byId(h.container, "prepayment-authority") as never, WORK);
          setFieldValue(byId(h.container, "prepayment-expenseAccount") as never, "59000001");
          setFieldValue(byId(h.container, "prepayment-expenseBasis") as never, "the invoice narrates a subscription");
          setFieldValue(byId(h.container, "prepayment-purpose") as never, "Prepaid subscription amortisation");
        });
        for (let i = 0; i < 3; i++) await h.settle();

        await h.act(async () => {
          await clickButton(buttonWith(h.container, "Configure the schedule") as never);
        });
        for (let i = 0; i < 8; i++) await h.settle();

        // The overlap warning holds the page (it is advisory and must be read), so the derived
        // allocation is on screen with it.
        assert.match(h.text(), /Another plan already moves these accounts/);
        assert.match(h.text(), /Final period — carries the remainder/);
        const disabledSets = findAllIn(h.container, (n) =>
          n.tagName === "FIELDSET" && n.getAttribute?.("disabled") !== null && n.getAttribute?.("disabled") !== undefined);
        assert.ok(disabledSets.length >= 1,
          "the derived allocation renders inside a DISABLED fieldset — a preview, never an editor");
        const findings = checkKeyboardWalk(h.container as never);
        assert.deepEqual(findings, [], `keyboard findings: ${JSON.stringify(findings, null, 1)}`);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("prepayments.authority — the instruction the schedule cites is CHOSEN from this client's own Work, and is never the recognition entry's own id", async () => {
  // THE DEFECT THIS CELL EXISTS FOR. A form that sent `{kind:"accounting_work", id: <the journal
  // entry>}` can never succeed: `clara.create_accounting_plan` RESOLVES the reference against
  // `clara.accounting_work` and refuses CLR10 `authority_ref_unresolved`, and no entry id is ever
  // a Work id (measured at the door by `p653.schedule.authority_ref_unresolved`). So the payload
  // is what this cell reads — not the screen.
  const sent: unknown[] = [];
  const capture = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.includes("/rpc/create_prepayment_schedule") && init?.method === "POST") {
      sent.push(JSON.parse(String(init.body)));
      return jsonResponse(CREATED);
    }
    if (url.includes("/rpc/list_prepayment_attention")) return jsonResponse(ATTENTION);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(ACCOUNTS);
    if (url.includes("/rpc/list_accounting_work")) return jsonResponse(AUTHORITIES);
    return jsonResponse({ message: `unmocked ${url}` }, 404);
  }) as typeof fetch;

  await withMockedEnv(capture, async () => {
    const h = await renderComponent(app(createElement(PrepaymentForm, { clientId: CLIENT })));
    try {
      for (let i = 0; i < 8; i++) await h.settle();

      // FIRST: a submit with NO instruction chosen never reaches the door at all.
      await h.act(() => {
        setFieldValue(byId(h.container, "prepayment-sourceEntry") as never, ENTRY);
        setFieldValue(byId(h.container, "prepayment-expenseAccount") as never, "59000001");
        setFieldValue(byId(h.container, "prepayment-expenseBasis") as never, "the invoice narrates a subscription");
        setFieldValue(byId(h.container, "prepayment-purpose") as never, "Prepaid subscription amortisation");
      });
      for (let i = 0; i < 3; i++) await h.settle();
      await h.act(async () => {
        await clickButton(buttonWith(h.container, "Configure the schedule") as never);
      });
      for (let i = 0; i < 4; i++) await h.settle();
      assert.deepEqual(sent, [], "a missing instruction blocks the submit rather than fabricating one");
      assert.equal((activeElement() as unknown as Node | null)?.getAttribute?.("id"), "prepayment-authority",
        "…and focus lands on the control that is missing");

      // THEN: with one chosen, the payload carries THAT id.
      await h.act(() => {
        setFieldValue(byId(h.container, "prepayment-authority") as never, WORK);
      });
      for (let i = 0; i < 3; i++) await h.settle();
      await h.act(async () => {
        await clickButton(buttonWith(h.container, "Configure the schedule") as never);
      });
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(sent.length, 1, "the door was called exactly once");
      const body = sent[0] as unknown as
        { p_authority_ref?: { kind?: string; id?: string }; p_source_entry?: string };
      assert.equal(body.p_authority_ref?.kind, "accounting_work");
      assert.equal(body.p_authority_ref?.id, WORK, "the instruction a person chose is the one cited");
      assert.notEqual(body.p_authority_ref?.id, body.p_source_entry,
        "a recognition entry is never its own authority");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("prepayments.keyboard — the detail's lifecycle doors are reachable, focusable and openable, and the pause dialog announces its Title and says pause is not cancel", async () => {
  // Base UI PORTALS open dialog content to `document.body`, a delegation root the container never
  // sees — `adjustments-keyboard.test.tsx` measured that and this cell inherits the shape: the
  // TRIGGER is fired through `h.fireEvent` (it lives in the container), and everything the dialog
  // reveals is read off the BODY.
  const body = (globalThis as unknown as { document: { body: unknown } }).document.body;
  await withMockedEnv(router({ get_prepayment_schedule: DETAIL }), async () => {
    const h = await renderComponent(app(createElement(PrepaymentDetail, { clientId: CLIENT, scheduleId: SCHEDULE })));
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const findings = checkKeyboardWalk(h.container as never);
      assert.deepEqual(findings, [], `keyboard findings: ${JSON.stringify(findings, null, 1)}`);

      // ALL FOUR LIFECYCLE DOORS ARE PRESENT for an ACTIVE schedule, and they are the PLAN's own
      // doors reused rather than a second set — `planControls` decides which render.
      for (const label of ["Pause", "Catch up", "End plan"]) {
        assert.ok(buttonWith(h.container, label), `${label} is reachable on an active schedule`);
      }

      const trigger = buttonWith(h.container, "Pause");
      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Pause Prepaid subscription amortisation\?/,
        "the dialog NAMES the schedule it is about — a person operating a list of similar ones must see which");
      assert.match(bodyText, /Pausing stops future occurrences only/,
        "…and says that pause is not cancel, in words");
      assert.deepEqual(checkKeyboardWalk(body as never), [],
        "no tabindex-order/focus-visible violation while the dialog is open");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
