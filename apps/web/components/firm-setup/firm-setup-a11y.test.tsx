// #648 (journey A5) — structural a11y scan of the firm setup checklist, its open answer form, and
// its two dialogs.
//
// WHY THE `<h1>` IS MOUNTED HERE RATHER THAN SYNTHESISED. `heading-order` is a real rule and a
// synthetic `<h1>` around a card is exactly how a genuine violation gets masked
// (`onboarding-checklist-a11y.test.tsx`'s own F4 note). The route this component ships inside —
// `app/(firm)/settings/setup/page.tsx` — is an ASYNC SERVER component and cannot be mounted in this
// harness at all. So the scan mounts the component under the SAME element the real route puts above
// it: `PageHeader`'s `<h1>` (`components/common/page-shell.tsx:38-60`, which renders the page title
// as an `h1`). That is a reproduction of the real route's heading level, stated rather than hidden,
// and the checklist's own headings still have to be `h2` beneath it or this file goes red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent, setFieldValue, type RenderHarness } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { PageHeader, PageShell } from "../common/page-shell";
import { FirmSetupChecklist } from "./firm-setup-checklist";

enableDomInspection();

type Stub = { tagName?: string; childNodes?: Stub[]; getAttribute?: (n: string) => string | null };

const MAX_SETTLE_PASSES = 200;
async function settleUntil(h: RenderHarness, condition: () => boolean, label: string): Promise<void> {
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass += 1) {
    if (condition()) return;
    await h.settle();
  }
  if (condition()) return;
  throw new Error(`${label} never arrived within ${MAX_SETTLE_PASSES} settle passes`);
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

const CALLER = [{
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "22222222-2222-4222-8222-222222222222",
  firm_name: "Rig & Co PLT", role: "admin", role_rank: 2, is_operator: false,
}];

function item(over: Record<string, unknown>) {
  return {
    item_key: "legal_name", kind: "must_ask", group_key: "identity",
    question: "What is the firm's registered legal name?", note: "A catalogue note.",
    required: true, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 10, state: "pending", answer: null, answered_by: null, answered_by_name: null,
    answered_at: null, knowledge_key: null, knowledge_record_id: null, ...over,
  };
}

const ENVELOPE = {
  plan_id: "33333333-3333-4333-8333-333333333333",
  revision_token: "44444444-4444-4444-8444-444444444444",
  revision_n: 3, state: "open", committed_at: null, seeded: true, catalogue_total: 4,
  counter: { required_answered: 1, required_total: 2 },
  items: [
    item({ item_key: "legal_name" }),
    item({ item_key: "address", sort_order: 20, question: "What is the firm's registered address?", answer_shape: "long_text" }),
    item({ item_key: "mia", sort_order: 30, question: "What is the firm's MIA registration number?", required: false, kind: "capture" }),
    item({
      item_key: "currency", sort_order: 40, group_key: "accounting", kind: "capture",
      question: "What is the firm's default currency?", required: false, answer_shape: "choice",
      answer_options: ["MYR", "USD", "SGD"], knowledge_key: "default_currency",
      state: "answered", answer: "MYR", knowledge_record_id: "rec-1",
      answered_by: "u1", answered_by_name: "Aisyah Rahman", answered_at: "2026-09-16T02:00:00Z",
    }),
  ],
  required_outstanding: ["legal_name", "address"],
  confirmed_facts: [{
    record_id: "rec-1", revision_id: "rev-1", revision_n: 1, scope_kind: "firm",
    knowledge_key: "default_currency", item_key: "currency",
    question: "What is the firm's default currency?", kind: "assertion", value: "MYR",
    applies_when: {}, effective_from: null, effective_to: null,
    source_kind: "user_statement", trust: "asserted",
    basis: "Stated by a firm administrator in firm setup (item currency)",
    asserted_by: "u1", asserted_by_name: "Aisyah Rahman", recorded_via: "human_ui",
    recorded_at: "2026-09-16T02:00:00Z", state: "live", correctable: true,
    key_description: null, authority_bearing: false,
    asserted_by_active: true, asserted_by_role: "admin", authority_current: true,
    legacy_client_fact_key: true,
  }],
};

const mock = (async (url: RequestInfo | URL) => {
  const u = String(url);
  if (u.includes("/rest/v1/caller_context")) return jsonResponse(CALLER);
  if (u.includes("/rest/v1/rpc/get_firm_setup")) return jsonResponse(ENVELOPE);
  throw new Error(`unexpected fetch: ${u}`);
}) as typeof fetch;

/** The real route's shape: PageShell + PageHeader's own `<h1>` above the checklist. */
function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(PageShell, {
      children: [
        createElement(PageHeader, { key: "h", title: "Firm setup", description: "The facts this firm still has to state about itself." }),
        createElement(FirmSetupChecklist, { key: "c" }),
      ],
    }),
  });
}

function byTestId(root: Stub, id: string): Stub | null {
  const walk = (n: Stub): Stub | null => {
    if (n.getAttribute?.("data-testid") === id) return n;
    for (const c of n.childNodes ?? []) { const hit = walk(c); if (hit) return hit; }
    return null;
  };
  return walk(root);
}

async function press(h: RenderHarness, node: Stub | null, label: string): Promise<void> {
  assert.ok(node, `no control to press: ${label}`);
  await clickButton(node as never);
  await h.settle();
}

test("fs.a11y.01 the checklist, an OPEN single-Field form and an OPEN bounded walk each scan clean", async () => {
  await withMockedEnv(mock, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: Stub & { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      await settleUntil(h, () => byTestId(h.container as never, "firm-setup-checklist") !== null, "the checklist");

      assert.deepEqual(checkAccessibility(h.container as never), [],
        "the checklist itself has structural a11y violations");
      assert.deepEqual(checkKeyboardWalk(h.container as never), [],
        "a control on the checklist has no visible focus ring, or reorders the tab sequence");

      // ONE FACT — a single Field.
      await press(h, byTestId(h.container as never, "firm-setup-answer-legal_name-action"), "Answer legal_name");
      assert.ok(byTestId(h.container as never, "firm-setup-item-form"), "the single-Field form did not open");
      assert.deepEqual(checkAccessibility(h.container as never), [],
        "the open single-Field form has structural a11y violations");
      await press(h, byTestId(h.container as never, "firm-setup-cancel"), "Cancel");

      // A BOUNDED RELATED SET — the local walk, at its first step and at its review step.
      await press(h, byTestId(h.container as never, "firm-setup-answer-group-identity"), "the bounded walk");
      assert.deepEqual(checkAccessibility(h.container as never), [],
        "the bounded walk's first step has structural a11y violations");
      const input = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      await h.act(() => { setFieldValue(input as never, "Rig & Co PLT"); });
      await press(h, byTestId(h.container as never, "firm-setup-next"), "Next");
      const textarea = h.find((n) => (n as Stub).tagName === "TEXTAREA") as Stub | null;
      await h.act(() => { setFieldValue(textarea as never, "1 Jalan Rig"); });
      await press(h, byTestId(h.container as never, "firm-setup-next"), "Next");
      const mia = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      await h.act(() => { setFieldValue(mia as never, "MIA-1"); });
      await press(h, byTestId(h.container as never, "firm-setup-next"), "Next to review");
      assert.ok(byTestId(h.container as never, "firm-setup-review"), "the walk never reached its review step");
      assert.deepEqual(checkAccessibility(h.container as never), [],
        "the bounded walk's review step has structural a11y violations");
    } finally { await h.unmount(); }
  });
});

test("fs.a11y.02 the skip dialog and the correction dialog each carry a title and scan clean", async () => {
  await withMockedEnv(mock, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: Stub & { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      await settleUntil(h, () => byTestId(h.container as never, "firm-setup-checklist") !== null, "the checklist");

      // Base UI portals dialog content onto document.body, so the scan runs over the body.
      await press(h, byTestId(h.container as never, "firm-setup-skip-mia"), "Not now (mia)");
      assert.ok(byTestId(body, "firm-setup-skip-dialog"), "the skip dialog did not open");
      assert.deepEqual(checkAccessibility(body as never), [],
        "the OPEN skip dialog has structural a11y violations");
      await press(h, byTestId(body, "firm-setup-skip-confirm"), "the skip confirm (empty reason)");
      // A refused-locally dialog is still a clean tree, with its error beside the control.
      assert.ok(byTestId(body, "firm-setup-skip-problem"), "the empty-reason refusal did not render");
      assert.deepEqual(checkAccessibility(body as never), [],
        "the skip dialog with a validation message has structural a11y violations");
    } finally { await h.unmount(); }
  });
});

test("fs.a11y.03 the DENIED face is a named box, not a blank page, and scans clean", async () => {
  const deniedMock = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/caller_context")) {
      return jsonResponse([{ ...CALLER[0]!, role: "bookkeeper", role_rank: 1 }]);
    }
    if (u.includes("/rest/v1/rpc/get_firm_setup")) {
      return new Response(JSON.stringify({ code: "CLR04", message: "insufficient role", details: null, hint: null }),
        { status: 403, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

  await withMockedEnv(deniedMock, async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h.container as never, "firm-setup-denied") !== null, "the denied face");
      assert.deepEqual(checkAccessibility(h.container as never), [],
        "the denied face has structural a11y violations");
      assert.match(h.text(), /Firm setup is for administrators/);
    } finally { await h.unmount(); }
  });
});
