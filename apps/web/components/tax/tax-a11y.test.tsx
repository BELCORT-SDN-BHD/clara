// GATE (b)/(c) — the Tax tab (P6-T, 裁-34), plus CB-AE2E-032's COPY gate.
//
// TRUED 2026-09-04. This file used to assert the OLD notes' internal build-log prose — "F-T1
// PR-2 onward, paused", "F-T3 PR-2…9, paused", "Track B's Tax tab UI resumes" — which meant the
// suite was PINNING the very leak CB-AE2E-032 records: lane ids, migration numbers, an owner
// ruling id and raw SQL signatures, shown to a Malaysian accountant. Those three assertions are
// replaced by a mechanical census over EVERY `ClientTax.*` string, so the class cannot come back
// under different words.
//
// THE TAB NOW FETCHES, so unlike the previous cut there IS a wire to mock: one
// `list_review_queue` call for the SST watch (its `compliance` envelope plus the queue row that
// carries `watch_id`) and one `coa_accounts` read for the classification control's account list.
//
// NO synthetic <h1> wrapper: `TaxWorkbenchPage` renders its OWN `PageHeader` h1 (the route's
// page.tsx supplies none), so the fixture renders the component bare and lets the real
// h1/h2/h3 tree stand — the only tree in which heading-order, the axe rule that actually
// applies here, means anything.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { FirmScopeProvider } from "../firm-scope-provider";
import { TaxWorkbenchPage } from "./TaxWorkbenchPage";

enableDomInspection();

const CLIENT = "client-1111";

const WATCH_ROW = {
  row_kind: "compliance_watch", section: "needs_you", client_id: CLIENT, counterparty_id: null,
  filing_id: null, entry_id: null, question_id: null, task_id: null, document_id: null,
  lane: null, auto: false, rule_backed: true, high_stakes: false, aged_since: "2026-08-01T00:00:00Z",
  amount_cents: null, period: null, question_text: null, created_at: "2026-08-01T00:00:00Z",
  id: "watch-1", coding_kind: null, watch_id: "watch-1", tier: "crossed", finding_id: null,
  asset_id: null, advance_id: null, client_name: null, batch_ids: null, open_proposal_count: null,
};

const ENVELOPE = {
  watermark: "w", counts: {
    ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 0,
    open_tasks: 0, compliance_watches: 1, lint_findings: 0,
  },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  compliance: {
    stale_evaluator: false,
    clients: [{
      client_id: CLIENT, service_group: "Group F", state: "crossed",
      confirmed_included_cents: 55_000_000, unknown_or_mixed_cents: 1_200_000,
      screening_proxy_cents: 56_200_000, earliest_crossing_month: "2026-06",
      application_due: "2026-07-31", future_method_status: "not_attested",
    }],
  },
  rows: [WATCH_ROW], next_cursor: null,
};

const ACCOUNTS = [
  { account_code: "4000", name: "Consulting fees", account_type: "income", account_class: null, special_acc_type: null, is_active: true },
];

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

const HAPPY: typeof fetch = async (u) => {
  const url = String(u);
  if (url.includes("/rpc/list_review_queue")) return jsonResponse(ENVELOPE);
  if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(ACCOUNTS);
  throw new Error(`unexpected fetch: ${url}`);
};

/** The layout's positively-read scope. `TaxWorkbenchPage` gates its ONE governed control on it
 *  (review-557, N7), so the fixture supplies a real rank rather than a stub of the derivation. */
function renderTaxTab(roleRank = 3) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(FirmScopeProvider, {
        scope: { role_rank: roleRank, is_operator: false },
        children: createElement(TaxWorkbenchPage, { clientId: CLIENT }),
      }),
    }),
  );
}

test("the Tax tab (SST watch / income tax computation / turnover classification) has zero a11y violations", async () => {
  await withMockedEnv(HAPPY, async () => {
    const h = await renderTaxTab();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /SST/, "the SST panel heading must render");
      assert.match(h.text(), /Income tax computation/, "the tax computation panel heading must render");
      assert.match(h.text(), /Turnover classification/, "the turnover classification panel heading must render");
      // The LIVE section: DB-owned figures, not a note.
      assert.match(h.text(), /Group F/, "the client's own service group must render from the envelope");
      assert.match(h.text(), /Threshold crossed/, "the watch STATE must render from the envelope, in the product's own words");
      assert.match(h.text(), /550,000\.00/, "the confirmed taxable turnover must render as the DB's own figure");
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });
});

// CB-AE2E-032's OWN GATE, and the reason this file changed. Every user-visible ClientTax string
// is scanned for internal vocabulary — a lane id, a migration number, an owner-ruling id or a
// raw `clara.*` verb signature. The map's own suggested pattern, extended with "Track B" (a lane
// name that carries no digits and so escapes the F-T\d arm).
test("CB-AE2E-032: no ClientTax string leaks a lane id, a migration number, a ruling id or a raw verb signature", () => {
  const LEAK = /F-T\d|PR-\d|Track B|migration \d{4}|裁-\d+|clara\.[a-z_]+/;
  const offenders: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === "string") {
      if (LEAK.test(node)) offenders.push(`${path}: ${node}`);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    }
  };
  walk((messages as Record<string, unknown>).ClientTax, "ClientTax");
  assert.deepEqual(offenders, [], offenders.join("\n"));

  // POSITIVE CONTROL: the scanner must actually be able to say YES. Without this, a walk that
  // silently visited nothing would report a clean tab for the wrong reason — which is exactly
  // how the previous cut of this file managed to pin the leak instead of catching it.
  const control: string[] = [];
  const walkControl = (node: unknown, path: string): void => {
    if (typeof node === "string") { if (LEAK.test(node)) control.push(path); return; }
    if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walkControl(v, `${path}.${k}`);
  };
  walkControl({ a: "paused, 裁-80", b: "clara.set_turnover_classification", c: "fine" }, "ctl");
  assert.deepEqual(control.sort(), ["ctl.a", "ctl.b"], "the leak detector must fire on known-bad strings");
});

function textOfNode(x: unknown): string {
  const s = x as { nodeType?: number; nodeValue?: string; childNodes?: unknown[]; textContent?: string };
  if (s.nodeType === 3) return String(s.nodeValue ?? "");
  const kids = s.childNodes ?? [];
  if (kids.length > 0) return kids.map(textOfNode).join("");
  return typeof s.textContent === "string" ? s.textContent : "";
}

/**
 * An element's accessible NAME, by the precedence the house a11y rules use for form controls
 * (`test/a11yRules.ts`): `aria-label`, else its own text, else **an associated `<label>`** —
 * which for these controls means a WRAPPING one.
 *
 * That third arm is not optional dressing (review-557, N8). The two textareas stopped carrying
 * `aria-label` when their placeholders stopped doubling as their names, and a helper that reads
 * only the first two arms then reports them as `""` — so a roster pinned on it would have been
 * pinning two blanks and could no longer say WHICH controls exist, which is the whole claim
 * 裁-44 asks this cell to make. Tag names cannot make it either: a computation grid and a
 * governed door's reason box are both `TEXTAREA`.
 */
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

/** Every descendant of `root` whose tag is in `tags`. */
function allByTag(root: unknown, tags: readonly string[]): unknown[] {
  const out: unknown[] = [];
  const walk = (n: unknown): void => {
    const tag = (n as { tagName?: string }).tagName;
    if (typeof tag === "string" && tags.includes(tag)) out.push(n);
    for (const c of ((n as { childNodes?: unknown[] }).childNodes ?? [])) walk(c);
  };
  walk(root);
  return out;
}

// 裁-44's "never an input grid" guard, REINSTATED as a discriminating one (review-557, MAJOR 3).
//
// The original cell asserted ZERO focusable controls. That was the right rule stated in the only
// way available while the tab was three static notes — but it cannot survive the tab acquiring
// its first real door, and replacing it with a count of tag KINDS (my first cut) was not a
// replacement at all: `["BUTTON","INPUT","SELECT","TEXTAREA"]` is exactly what a computation
// form would also produce, so the guard had been deleted while a comment said it had not.
//
// The rule 裁-44 actually states is about WHICH controls exist, and there are two halves:
//   1. the ROSTER is pinned by accessible NAME — every control on this tab belongs to a live
//      governed door (the three compliance-watch triggers, and the turnover-classification
//      door's own fields). A new control cannot appear without a human editing this list.
//   2. every TEXT-ENTRY element lives inside the turnover-classification panel. This is the
//      half that catches a computation grid specifically: R1-R10 rows would be inputs somewhere
//      else on the page, and the roster alone could be satisfied by naming them.
// N7 (review-557). The rank gate is on the CONTROL, never on the READ — and this cell asserts
// BOTH halves, because either alone would be satisfied by the wrong build. Hiding the whole tab
// from a viewer would pass a "no classification control" check while inventing a wall the
// database does not have: `list_review_queue` floors at VIEWER, so the SST turnover watch is
// genuinely theirs to see. 裁-187 / ADR-0078 asks for exactly this shape — a control a rank
// cannot use is not rendered at all, and nothing else moves.
test("N7: a VIEWER sees the SST turnover watch but is not offered the classification control", async () => {
  await withMockedEnv(HAPPY, async () => {
    const h = await renderTaxTab(0);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      // The read half — the DB-owned figures are still on screen.
      assert.match(h.text(), /Group F/, "the watch's own service group must still render for a viewer");
      assert.match(h.text(), /550,000\.00/, "and so must its figures — the read floors at viewer");
      // The control half.
      assert.doesNotMatch(h.text(), /Record classification/, "the write must not be offered below its door's floor");
      assert.equal(
        h.find((n) => accessibleName(n) === "Account" && (n as { tagName?: string }).tagName === "SELECT"),
        null,
        "nor any of its fields",
      );
      const violations = checkAccessibility(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });
});

// The counter-half, so the cell above cannot pass by the panel being broken for everyone.
test("N7 CONTROL: a BOOKKEEPER — the door's own floor — is offered the classification control", async () => {
  await withMockedEnv(HAPPY, async () => {
    const h = await renderTaxTab(1);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Record classification/, "set_turnover_classification floors at bookkeeper, and the control mirrors it");
    } finally {
      await h.unmount();
    }
  });
});

test("裁-44: the Tax tab's only controls are its live governed doors, and no text entry exists outside the one control", async () => {
  await withMockedEnv(HAPPY, async () => {
    const h = await renderTaxTab();
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Turnover classification/, "the fixture must have rendered real content before any census below means anything");

      const focusable = focusableElements(h.container as never);
      const names = focusable.map(accessibleName).sort();
      assert.deepEqual(names, [
        "Account",                                                  // set_turnover_classification
        "Acknowledge",                                              // ack_compliance_watch
        "Effective from",                                           // set_turnover_classification
        "Evidence",                                                 // set_turnover_classification
        "Reason (required)",                                         // set_turnover_classification
        "Resolve",                                                  // resolve_compliance_watch
        "Service group",                                            // set_turnover_classification
        "Snooze",                                                   // snooze_compliance_watch
        "Treatment",                                                // set_turnover_classification
      ], JSON.stringify(names, null, 2));

      // THE SUBMIT IS ABSENT FROM THAT ROSTER BECAUSE IT IS DISABLED, and that is asserted
      // rather than left to be inferred from a shorter list. `set_turnover_classification`
      // refuses CLR10 without an account, a reason and an effective date; the control does not
      // offer a call the door would refuse on inputs the browser can see are missing. Silently
      // omitting it from the roster would have made "the submit was deleted" and "the submit is
      // correctly gated" the same green.
      const submit = h.find((n) => (n as { tagName?: string }).tagName === "BUTTON" && accessibleName(n) === "Record classification");
      assert.ok(submit, "the classification door's submit must exist");
      assert.equal((submit as { disabled?: boolean }).disabled, true, "and be disabled until the door's own required inputs are present");

      // THE INPUT-GRID HALF. Every text-entry element must sit inside the turnover panel — the
      // one control on this tab that takes typed input, and a governed door with a live verb
      // behind it. A computation the professional types would put inputs elsewhere.
      const panel = h.find((n) => {
        const el = n as { getAttribute?: (a: string) => string | null };
        return el.getAttribute?.("aria-label") === "Account";
      });
      assert.ok(panel, "the classification control must be on screen for this claim to mean anything");
      const card = (function ancestorCard(node: unknown): unknown {
        // The vendored Card wrapping the panel — walk up from the account select to the nearest
        // element carrying the card slot.
        let cur: unknown = node;
        for (let i = 0; i < 12 && cur; i += 1) {
          if ((cur as { getAttribute?: (a: string) => string | null }).getAttribute?.("data-slot") === "card") return cur;
          cur = (cur as { parentNode?: unknown }).parentNode;
        }
        return null;
      })(panel);
      assert.ok(card, "the classification control must sit inside its own Card");

      const TEXT_ENTRY = ["INPUT", "TEXTAREA"] as const;
      const everywhere = allByTag(h.container, TEXT_ENTRY);
      const insidePanel = allByTag(card, TEXT_ENTRY);
      assert.ok(everywhere.length > 0, "positive control: the scan finds text-entry elements at all");
      assert.deepEqual(
        everywhere.filter((n) => !insidePanel.includes(n)).map(accessibleName),
        [],
        "裁-44: this tab is a proposal/receipt surface — no text entry may exist outside the one governed control",
      );

      const violations = checkKeyboardWalk(h.container as never);
      assert.deepEqual(violations, [], JSON.stringify(violations));
    } finally {
      await h.unmount();
    }
  });
});
