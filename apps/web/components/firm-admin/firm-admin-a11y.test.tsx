// GATE (b) — structural a11y scan of T10's surfaces: the compliance_watch
// needs-you inline act (through the real NeedsYouInbox mount, proving the
// registry dispatch actually renders ComplianceWatchAffordance for a real
// row_kind, not merely that the component renders in isolation), the
// compliance register panel, and the vendor-bindings panel (client picker +
// propose/sign/revoke dialogs open). See test/domInspect.ts's header for why
// this rides a hand-written rule engine rather than real axe-core.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { FirmScopeProvider } from "@/components/firm-scope-provider";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { NeedsYouInbox } from "../firm/needs-you-inbox";
import { ComplianceRegisterPanel } from "./compliance-register-panel";
import { VendorBindingsPanel } from "./vendor-bindings-panel";
import messages from "../../messages/en.json";
import type { ReviewQueueEnvelope } from "../../lib/firm/needs-you";

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

// E-7 (裁-190): the vendor-bindings panel now shapes its own controls from the
// firm layout's positively-read caller context, so these mounts supply the
// provider the real tree always has. ADMIN rank is the fixture, because that is
// the rank every pre-existing cell here was implicitly exercising when the
// controls were rendered unconditionally — the BELOW-admin cases are new cells
// of their own, not a silent change of what these ones prove.
const ADMIN_SCOPE = { role_rank: 2, is_operator: false };

function App(children: unknown, heading: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      FirmScopeProvider,
      { scope: ADMIN_SCOPE },
      createElement("div", null, createElement("h1", null, heading), children as never),
    ),
  });
}

// --- 1. compliance_watch through the real needs-you inbox mount ------------

const COMPLIANCE_ENVELOPE: ReviewQueueEnvelope = {
  watermark: "w1",
  counts: { ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [
    {
      row_kind: "compliance_watch", section: "needs_you", client_id: "c1", counterparty_id: null, filing_id: null,
      entry_id: null, question_id: null, task_id: null, document_id: null, lane: null, auto: false,
      rule_backed: false, high_stakes: false, aged_since: "2026-07-01T00:00:00Z", amount_cents: null, period: "2026-07-31",
      question_text: "SST registration threshold watch (digital_services)", created_at: "2026-07-01T00:00:00Z", id: "w1",
      coding_kind: null, watch_id: "w1", tier: "crossed", finding_id: null, asset_id: null, advance_id: null,
      client_name: null, batch_ids: null, open_proposal_count: null,
    },
  ],
  next_cursor: null,
};

const CLIENTS = [{ id: "c1", name: "Acme Sdn Bhd", status: "active", created_at: "2026-01-01T00:00:00Z" }];

function mockGapsAndQueueFetch(u: string): Response {
  if (u.includes("/rpc/list_review_queue")) return jsonResponse(COMPLIANCE_ENVELOPE);
  if (u.includes("/rest/v1/firm_open_questions_visible")) return jsonResponse([]);
  if (u.includes("/rest/v1/client_identifier_promotions_visible")) return jsonResponse([]);
  if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
  throw new Error(`unexpected fetch: ${u}`);
}

test("needs-you inbox: a compliance_watch row renders the registered ComplianceWatchAffordance (real registry dispatch), zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockGapsAndQueueFetch(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(NeedsYouInbox), "Needs you"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /SST registration threshold watch/, "the compliance_watch row must have actually loaded");
        assert.match(h.text(), /Acknowledge/, "the registered affordance's Acknowledge trigger must render — proves the registry, not a hand-mounted component");
        assert.match(h.text(), /Snooze/);
        assert.match(h.text(), /Resolve/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("needs-you inbox: the compliance_watch Resolve inline form (open, with its conclusion select) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockGapsAndQueueFetch(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(NeedsYouInbox), "Needs you"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const resolveBtn = findIn(h.container as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Resolve");
        assert.ok(resolveBtn, "the Resolve trigger must render");
        await h.fireEvent(resolveBtn as never, "click");
        await h.settle();
        assert.ok(findIn(h.container as never, (n) => n.tagName === "SELECT"), "the resolve form's conclusion select must be open");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- 2. the compliance register panel --------------------------------------

const REGISTER_ENVELOPE = {
  watermark: "w1",
  counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [],
  next_cursor: null,
  compliance: {
    stale_evaluator: false,
    clients: [
      {
        client_id: "c1", service_group: "digital_services", state: "crossed",
        confirmed_included_cents: 50000000, unknown_or_mixed_cents: 0, screening_proxy_cents: 0,
        earliest_crossing_month: "2026-07-01", application_due: "2026-08-28", future_method_status: "not_assessed",
      },
    ],
  },
};

function mockRegisterFetch(u: string): Response {
  if (u.includes("/rpc/list_review_queue")) return jsonResponse(REGISTER_ENVELOPE);
  if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
  throw new Error(`unexpected fetch: ${u}`);
}

test("compliance register panel: zero a11y violations once loaded", async () => {
  await withMockedEnv(
    async (u) => mockRegisterFetch(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(ComplianceRegisterPanel), "Compliance register"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /Acme Sdn Bhd/, "the client name must have joined against the real read, not the raw client_id");
        assert.match(h.text(), /digital_services/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- 3. the vendor-bindings panel -------------------------------------------

const BINDINGS = [
  {
    binding_id: "b1", counterparty_id: "cp1", counterparty_name: "Supplier One Sdn Bhd", status: "proposed",
    f1_vendor_name_norm: "supplier one sdn bhd", f2_invoice_prefix: "INV-S", registration_at_signing: "202401012345",
    signed_by: null, signed_at: null, expires_at: "2026-12-31T00:00:00Z",
    evidence_count: 3, resolution_count: 0, divergence_documents: 0,
  },
  {
    binding_id: "b2", counterparty_id: "cp2", counterparty_name: "Supplier Two Sdn Bhd", status: "live",
    f1_vendor_name_norm: "supplier two sdn bhd", f2_invoice_prefix: "INV-T", registration_at_signing: "202401019999",
    signed_by: "u1", signed_at: "2026-02-01T00:00:00Z", expires_at: "2026-12-31T00:00:00Z",
    evidence_count: 5, resolution_count: 4, divergence_documents: 0,
  },
];
const COUNTERPARTIES = [{ id: "cp3", name: "Supplier Three Sdn Bhd", registration_normalized: "202401017777" }];

// F2's own read (independent review, 2026-08-28): the Sign/Revoke dialogs now
// mount VendorBindingDetailView on open, which fetches get_vendor_binding —
// a real response here, not just an "unexpected fetch" swallowed into an
// error banner, is what makes the a11y scan below prove something (the P3
// vacuous-test lesson: a passing scan over a hidden error banner proves
// nothing about the content a reviewer actually needs to see).
const BINDING_DETAIL = {
  binding: {
    id: "b1", firm_id: "f1", client_id: "c1", counterparty_id: "cp1", status: "proposed",
    f1_vendor_name_norm: "supplier one sdn bhd", f2_invoice_prefix: "INV-S", registration_at_signing: "202401012345",
    content_hash: "a".repeat(64), created_by: "u1234567-89ab-cdef-0123-456789abcdef", created_at: "2026-01-01T00:00:00Z",
    signed_by: null, signed_at: null, revoked_by: null, revoked_at: null, revoke_reason: null, expires_at: "2026-12-31T00:00:00Z",
  },
  counterparty: { counterparty_id: "cp1", counterparty_name: "Supplier One Sdn Bhd" },
  evidence: [{ entry_id: "e1", document_id: "d1", facts_extraction_id: "f1", ocr_extraction_id: "o1", posting_date: "2026-01-01" }],
  resolutions: [],
};

function mockVendorBindingsFetch(u: string): Response {
  if (u.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
  if (u.includes("/rpc/list_vendor_bindings")) return jsonResponse(BINDINGS);
  if (u.includes("/rest/v1/counterparties")) return jsonResponse(COUNTERPARTIES);
  if (u.includes("/rpc/get_vendor_binding")) return jsonResponse(BINDING_DETAIL);
  throw new Error(`unexpected fetch: ${u}`);
}

async function mountVendorBindingsWithClientSelected() {
  const h = await renderComponent(App(createElement(VendorBindingsPanel), "Vendor identity bindings"));
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 3; i++) await h.settle();
  const select = h.find((n) => n.tagName === "SELECT");
  assert.ok(select, "the client picker select must render");
  await h.act(() => {
    (select as unknown as { value: string }).value = "c1";
    const propsKey = Object.keys(select as object).find((k) => k.startsWith("__reactProps"));
    const props = propsKey ? (select as unknown as Record<string, { onChange?: (e: unknown) => void }>)[propsKey] : undefined;
    props?.onChange?.({ target: select, currentTarget: select });
  });
  for (let i = 0; i < 4; i++) await h.settle();
  return { h, body };
}

test("vendor-bindings panel: a selected client's bindings list has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockVendorBindingsFetch(String(u)),
    async () => {
      const { h, body } = await mountVendorBindingsWithClientSelected();
      try {
        assert.match(textOf(body as never), /Supplier One Sdn Bhd/, "the proposed binding row must have loaded");
        assert.match(textOf(body as never), /Supplier Two Sdn Bhd/, "the live binding row must have loaded");
        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("vendor-bindings panel: the Propose binding dialog (open, with its counterparty select) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockVendorBindingsFetch(String(u)),
    async () => {
      const { h, body } = await mountVendorBindingsWithClientSelected();
      try {
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Propose binding"));
        assert.ok(trigger, "the Propose binding trigger must render");
        await h.fireEvent(trigger! as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(textOf(body as never), /Supplier Three Sdn Bhd/, "the counterparty select's own real option must be reachable");
        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("vendor-bindings panel: the Sign dialog (proposed row) and the Revoke dialog (live row) each have zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockVendorBindingsFetch(String(u)),
    async () => {
      const { h, body } = await mountVendorBindingsWithClientSelected();
      try {
        const signTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Sign");
        assert.ok(signTrigger, "the Sign trigger must render for the proposed binding — never pre-hidden on a client-side role guess");
        await h.fireEvent(signTrigger! as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();
        // F2 (independent review): the consent must show what it approves —
        // a real get_vendor_binding response must have actually rendered,
        // not merely "no crash happened".
        assert.match(textOf(body as never), /u1234567/, "the detail view's own real created_by chip must render");
        let violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], `Sign dialog: ${JSON.stringify(violations)}`);

        const cancel = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
        assert.ok(cancel, "the Sign dialog's Cancel must render");
        await h.fireEvent(cancel! as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const revokeTrigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Revoke");
        assert.ok(revokeTrigger, "the Revoke trigger must render for the live binding");
        await h.fireEvent(revokeTrigger! as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(textOf(body as never), /u1234567/, "the Revoke dialog's own detail view must have rendered too");
        violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], `Revoke dialog: ${JSON.stringify(violations)}`);
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- F3(a)/(b) regression pins (independent re-verify, 2026-08-28) ---------
//
// The fix round's own tests never actually exercised the CLIENTS or
// COUNTERPARTIES read FAILING — every assertion ran against a happy-path
// mock, so reverting either fix left the shipped suite green. These two
// cells drive the real failure path and pin the fix's own observable
// behaviour: L8(a), a fix round pins what it fixed.

// --- F3(a) regression -------------------------------------------------------

const REGISTER_ENVELOPE_FOR_FAILED_CLIENTS = {
  watermark: "w1",
  counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [],
  next_cursor: null,
  compliance: {
    stale_evaluator: false,
    clients: [
      {
        client_id: "11111111-2222-3333-4444-555555555555", service_group: "digital_services", state: "crossed",
        confirmed_included_cents: 50000000, unknown_or_mixed_cents: 0, screening_proxy_cents: 500000,
        earliest_crossing_month: "2026-07-01", application_due: "2026-08-28", future_method_status: "attested_below",
      },
    ],
  },
};

test("F3(a) REGRESSION: a failed client-names read DISCLOSES itself — the register must never show raw ids silently", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_review_queue")) return jsonResponse(REGISTER_ENVELOPE_FOR_FAILED_CLIENTS);
      if (url.includes("/rest/v1/clients")) return jsonResponse({ message: "clients read failed" }, 500);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(ComplianceRegisterPanel), "Compliance register"));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const txt = h.text();
        // The fallback itself is fine — silence about it is not.
        assert.match(txt, /11111111-2222-3333-4444-555555555555/, "the raw client_id fallback still renders");
        assert.match(
          txt,
          /Client names could not be loaded/,
          "review law 2: a degraded read must SAY it degraded — absence is not evidence of 'no name'",
        );
        assert.match(txt, /clients read failed/, "and the read's own verbatim message must ride along");
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- F3(b) regression -------------------------------------------------------

test("F3(b) REGRESSION: a failed counterparties read KEEPS the Propose door and explains itself inside the dialog", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/clients")) return jsonResponse(CLIENTS);
      if (url.includes("/rpc/list_vendor_bindings")) return jsonResponse(BINDINGS);
      if (url.includes("/rest/v1/counterparties")) return jsonResponse({ message: "counterparties read failed" }, 500);
      if (url.includes("/rpc/get_vendor_binding")) return jsonResponse(BINDING_DETAIL);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountVendorBindingsWithClientSelected();
      try {
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Propose binding"));
        assert.ok(
          trigger,
          "the Propose trigger must render even when the counterparties read failed — a failed READ must never look like 'you may not do this'",
        );
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();
        const txt = textOf(body as never);
        assert.match(txt, /counterparties read failed/, "the read's verbatim message must render INSIDE the dialog body");
        assert.ok(
          findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Retry"),
          "a Retry control must be offered",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
