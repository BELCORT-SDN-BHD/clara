// #627 — "present the real tax reads and the honest not-enabled capability boundary".
//
// This cell pins the state mapping tax-a11y.test.tsx's HAPPY path does not exercise: the SST
// watch read's five/six states (not enabled, successful no data, stale effective-dated
// source, denied read, technical failure — "ok" is the sixth, covered by tax-a11y.test.tsx's
// own happy-path assertions already), the ONE capability-boundary section every "not enabled"
// note deep-links to, and the standing "no fake Prepare/Compute/File control" invariant across
// every one of those states, not just the happy path.
//
// Every fixture below renders at roleRank=0 (viewer) so `TurnoverClassificationPanel` never
// mounts — its own chart-of-accounts read is orthogonal to the SST-watch states this file
// pins, and skipping it means no `coa_accounts` fixture is needed for any case here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { ReadError } from "../../lib/read";
import { DoorError, DoorRefusal } from "../../lib/doors";
import { classifyTaxReadOutcome } from "../../lib/tax/read-state";
import messages from "../../messages/en.json";
import { FirmScopeProvider } from "../firm-scope-provider";
import { CAPABILITY_BOUNDARY_ANCHOR, CAPABILITY_BOUNDARY_HEADING_ID } from "./CapabilityBoundarySection";
import { TaxWorkbenchPage } from "./TaxWorkbenchPage";

enableDomInspection();

const CLIENT = "client-2222";

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

function renderTaxTab() {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(FirmScopeProvider, {
        scope: { role_rank: 0, is_operator: false },
        children: createElement(TaxWorkbenchPage, { clientId: CLIENT }),
      }),
    }),
  );
}

/** Every focusable control's accessible name, scanned for the three names #612/#627 forbid
 *  anywhere on this page — a fake Prepare, Compute or File control. */
function forbiddenControlNames(container: unknown, accessibleName: (n: unknown) => string): string[] {
  return focusableElements(container as never)
    .map(accessibleName)
    .filter((name) => /^(Prepare|Compute|File)\b/i.test(name));
}

function textOfNode(x: unknown): string {
  const s = x as { nodeType?: number; nodeValue?: string; childNodes?: unknown[]; textContent?: string };
  if (s.nodeType === 3) return String(s.nodeValue ?? "");
  const kids = s.childNodes ?? [];
  if (kids.length > 0) return kids.map(textOfNode).join("");
  return typeof s.textContent === "string" ? s.textContent : "";
}

function accessibleName(node: unknown): string {
  const n = node as { getAttribute?: (a: string) => string | null; parentNode?: unknown };
  const aria = n.getAttribute?.("aria-label");
  if (aria) return aria;
  const own = textOfNode(node).trim();
  if (own) return own;
  let cur: unknown = n.parentNode;
  for (let i = 0; i < 6 && cur; i += 1) {
    if ((cur as { tagName?: string }).tagName === "LABEL") return textOfNode(cur).trim();
    cur = (cur as { parentNode?: unknown }).parentNode;
  }
  return "";
}

function allByRole(root: unknown, role: string): unknown[] {
  const out: unknown[] = [];
  const walk = (n: unknown): void => {
    const el = n as { getAttribute?: (a: string) => string | null; childNodes?: unknown[] };
    if (el.getAttribute?.("role") === role) out.push(n);
    for (const c of el.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

// ---------------------------------------------------------------------------
// The pure classifier — unit-pinned independently of any render, so the state
// mapping itself is proven without a DOM.
// ---------------------------------------------------------------------------
test("classifyTaxReadOutcome: precedence is error > loading > empty > ok", () => {
  // A plain Error carries no typed `.kind` at all, so isReadError/isDoorError (both real
  // `instanceof` checks, never a message-text guess) correctly reject it — it still
  // classifies as "error", the generic-failure branch.
  assert.equal(classifyTaxReadOutcome({ loading: false, error: new Error("boom"), isEmpty: true }), "error");
  assert.equal(classifyTaxReadOutcome({ loading: true, error: null, isEmpty: true }), "loading");
  assert.equal(classifyTaxReadOutcome({ loading: false, error: null, isEmpty: true }), "empty");
  assert.equal(classifyTaxReadOutcome({ loading: false, error: null, isEmpty: false }), "ok");
  // A standing error outranks a concurrent reload's transient loading=true (the sticky-
  // refusal reload lib/firm/use-async-read.ts's act() triggers after a failed write).
  assert.equal(classifyTaxReadOutcome({ loading: true, error: new Error("boom"), isEmpty: true }), "error");
});

test("classifyTaxReadOutcome: a REAL ReadError/DoorError's forbidden/no_session kind folds to denied; every other kind is error", () => {
  assert.equal(
    classifyTaxReadOutcome({ loading: false, isEmpty: true, error: new ReadError("nope", { status: 403, kind: "forbidden" }) }),
    "denied",
  );
  assert.equal(
    classifyTaxReadOutcome({ loading: false, isEmpty: true, error: new ReadError("nope", { status: null, kind: "no_session" }) }),
    "denied",
  );
  assert.equal(
    classifyTaxReadOutcome({ loading: false, isEmpty: true, error: new DoorError("nope", { status: 403, kind: "forbidden" }) }),
    "denied",
  );
  assert.equal(
    classifyTaxReadOutcome({ loading: false, isEmpty: true, error: new ReadError("nope", { status: 500, kind: "server_error" }) }),
    "error",
  );
  assert.equal(
    classifyTaxReadOutcome({ loading: false, isEmpty: true, error: new ReadError("nope", { status: 404, kind: "not_found" }) }),
    "error",
  );
  // A governed refusal is a real business/system answer, never a quiet denial — it always
  // classifies as "error", regardless of its status, so it never gets the softer "denied"
  // treatment a plain 403 read gets.
  assert.equal(
    classifyTaxReadOutcome({
      loading: false,
      isEmpty: true,
      error: new DoorRefusal("CLR10", "refused", { reason: null, status: 400, pgCode: "CLR10", codeSource: "sqlstate" }),
    }),
    "error",
  );
});

// ---------------------------------------------------------------------------
// "not enabled" — no read is ever attempted for SST registration/return tracking or the
// income-tax computation. Both notes carry role="status" and deep-link to the ONE boundary.
// ---------------------------------------------------------------------------
test("not enabled: the SST-registration and income-tax-computation notes are their own status region and link to the capability boundary", async () => {
  const HAPPY_EMPTY: typeof fetch = async (u) => {
    const url = String(u);
    if (url.includes("/rpc/list_review_queue")) {
      return jsonResponse({
        watermark: "w", counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
        sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
        compliance: { stale_evaluator: false, clients: [] },
        rows: [], next_cursor: null,
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  await withMockedEnv(HAPPY_EMPTY, async () => {
    const h = await renderTaxTab();
    try {
      for (let i = 0; i < 4; i++) await h.settle();

      const sstNotBuilt = (messages as { ClientTax: { sst: { notBuilt: string } } }).ClientTax.sst.notBuilt;
      const computationNotBuilt = (messages as { ClientTax: { computation: { notBuilt: string } } }).ClientTax.computation.notBuilt;
      const statusRegions = allByRole(h.container, "status");
      const notEnabledRegions = statusRegions.filter((n) => {
        const text = textOfNode(n);
        return text.includes(sstNotBuilt) || text.includes(computationNotBuilt);
      });
      assert.equal(notEnabledRegions.length, 2, "both not-enabled notes must be their own role=status region");

      const links = focusableElements(h.container as never).filter(
        (n) => (n as { tagName?: string }).tagName === "A" && accessibleName(n) === "See the capability boundary",
      );
      assert.equal(links.length, 2, "each not-enabled note must offer its own deep link to the boundary");
      for (const link of links) {
        assert.equal(
          (link as { getAttribute: (a: string) => string | null }).getAttribute("href"),
          `#${CAPABILITY_BOUNDARY_ANCHOR}`,
          "the link must point at the one capability-boundary anchor",
        );
      }

      const forbidden = forbiddenControlNames(h.container, accessibleName);
      assert.deepEqual(forbidden, [], "no fake Prepare/Compute/File control may render");

      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// The capability-boundary section itself.
// ---------------------------------------------------------------------------
test("the capability-boundary section names what is enabled and what is not, at its own stable anchor", async () => {
  const EMPTY_ENVELOPE = {
    watermark: "w", counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
    sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
    compliance: { stale_evaluator: false, clients: [] },
    rows: [], next_cursor: null,
  };
  await withMockedEnv(
    async (u) => (String(u).includes("/rpc/list_review_queue") ? jsonResponse(EMPTY_ENVELOPE) : Promise.reject(new Error(`unexpected fetch: ${u}`))),
    async () => {
      const h = await renderTaxTab();
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /Capability boundary/, "the section's own heading must render");
        assert.match(h.text(), /Enabled today/);
        assert.match(h.text(), /Not enabled yet/);
        const heading = h.find((n) => (n as { getAttribute?: (a: string) => string | null }).getAttribute?.("id") === CAPABILITY_BOUNDARY_HEADING_ID);
        assert.ok(heading, "the heading must carry the stable id CapabilityBoundarySection exports");
        const section = h.find((n) => (n as { getAttribute?: (a: string) => string | null }).getAttribute?.("id") === CAPABILITY_BOUNDARY_ANCHOR);
        assert.ok(section, "the section must carry the stable #capability-boundary anchor");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// "successful, no data" — a real read that came back with zero watch rows for this client.
// ---------------------------------------------------------------------------
test("empty: a real read with zero SST watches is its own labelled status region, never a caught error", async () => {
  const EMPTY_ENVELOPE = {
    watermark: "w", counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
    sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
    compliance: { stale_evaluator: false, clients: [] },
    rows: [], next_cursor: null,
  };
  await withMockedEnv(
    async (u) => (String(u).includes("/rpc/list_review_queue") ? jsonResponse(EMPTY_ENVELOPE) : Promise.reject(new Error(`unexpected fetch: ${u}`))),
    async () => {
      const h = await renderTaxTab();
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /No SST turnover watch is open for this client\./);
        const statusRegions = allByRole(h.container, "status");
        const emptyRegion = statusRegions.find((n) => /No SST turnover watch is open/.test(textOfNode(n)));
        assert.ok(emptyRegion, "the empty state must be its own role=status region, not bare paragraph text");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// "stale effective-dated source" — the evaluator has not run in >48h.
// ---------------------------------------------------------------------------
test("stale: the evaluator-staleness warning renders as an alert, distinct from every other state", async () => {
  const STALE_ENVELOPE = {
    watermark: "w", counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
    sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
    compliance: {
      stale_evaluator: true,
      clients: [{
        client_id: CLIENT, service_group: "Group S", state: "monitored",
        confirmed_included_cents: 100, unknown_or_mixed_cents: 0,
        screening_proxy_cents: 100, earliest_crossing_month: null,
        application_due: null, future_method_status: null,
      }],
    },
    rows: [], next_cursor: null,
  };
  await withMockedEnv(
    async (u) => (String(u).includes("/rpc/list_review_queue") ? jsonResponse(STALE_ENVELOPE) : Promise.reject(new Error(`unexpected fetch: ${u}`))),
    async () => {
      const h = await renderTaxTab();
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /recalculated more than 48 hours ago/);
        const alerts = allByRole(h.container, "alert");
        const staleAlert = alerts.find((n) => /recalculated more than 48 hours ago/.test(textOfNode(n)));
        assert.ok(staleAlert, "the stale banner must be an alert region with its own distinct accessible name");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// "denied read" — a 403 on the queue read (RLS/grant refusal, not "no data").
// ---------------------------------------------------------------------------
test("denied: a 403 read renders as a distinct denied state, never a silently empty table", async () => {
  await withMockedEnv(
    async (u) =>
      String(u).includes("/rpc/list_review_queue")
        ? jsonResponse({ message: "permission denied for function list_review_queue" }, 403)
        : Promise.reject(new Error(`unexpected fetch: ${u}`)),
    async () => {
      const h = await renderTaxTab();
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.doesNotMatch(h.text(), /No SST turnover watch is open/, "a denial must never be painted as a successful empty read");
        assert.match(h.text(), /Your account can't read this yet\./);
        const alerts = allByRole(h.container, "alert");
        const denied = alerts.find((n) => /Your account can't read this yet\./.test(textOfNode(n)));
        assert.ok(denied, "the denied state must be its own alert region");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// "technical failure" — a genuine 5xx, distinct from a denial and never a blank table.
// ---------------------------------------------------------------------------
test("technical failure: a 500 read renders as an operational failure, never a silently empty table", async () => {
  await withMockedEnv(
    async (u) =>
      String(u).includes("/rpc/list_review_queue")
        ? jsonResponse({ message: "compliance_watches evaluator crashed" }, 500)
        : Promise.reject(new Error(`unexpected fetch: ${u}`)),
    async () => {
      const h = await renderTaxTab();
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.doesNotMatch(h.text(), /No SST turnover watch is open/, "a failure must never be painted as a successful empty read");
        assert.match(h.text(), /Something went wrong/);
        assert.match(h.text(), /compliance_watches evaluator crashed/, "the wire's own message must ride along, verbatim");
        const alerts = allByRole(h.container, "alert");
        const failed = alerts.find((n) => /Something went wrong/.test(textOfNode(n)));
        assert.ok(failed, "technical failure must be its own alert region");
        // And it must NOT be the same accessible name as the denied state above — same role,
        // genuinely distinct name (#627: "assert accessible names, not just DOM roles").
        assert.doesNotMatch(textOfNode(failed), /Your account can't read this yet\./);
      } finally {
        await h.unmount();
      }
    },
  );
});
