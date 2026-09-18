// components/bank/matching-section.tsx — #657 `p657.web.refusal-verbatim` (AC2/AC10/AC14).
//
// TWO PROPERTIES, both measured against the real component, both previously unasserted anywhere:
//
//   1. A BANK REFUSAL REACHES THE FACE VERBATIM, WITH ITS DISCRIMINANT. `lib/doors.ts:41-44`
//      parses `details` into `DoorRefusal.reason` and `components/bank/action-refusal.tsx:43`
//      renders `${clr.code} · ${clr.reason}` in the chip — source-resolved end to end, and NO
//      CELL ASSERTED IT. The gap map called that out as unverified; this is the assertion.
//
//   2. THE TYPED CENTS SURVIVE THE REFUSAL. The old surface cleared the whole draft on the
//      unconditional post-act reload, so a human who had typed an amount, been refused, and
//      wanted to change ONE thing had to retype everything — which is how a human ends up
//      typing a DIFFERENT number than the one they meant. It also matters for the op key: the
//      key is derived from the intent tuple (D15), so an unchanged draft resubmits as the SAME
//      operation and the stored receipt comes back instead of `already_matched`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setNativeValue, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import { MatchingSection } from "./matching-section";
import messages from "../../messages/en.json";

// REQUIRED: the account/period selectors are base-ui <Select> primitives and the detail pane
// renders next/link — both need this harness's DOM polyfills to render at all.
enableDomInspection();

type Node = { tagName?: string; type?: string; value?: string; parentNode?: Node | null; childNodes?: Node[]; getAttribute?: (k: string) => string | null };

const CLIENT = "c1";
const ACCOUNT = { id: "acc1", bank_code: "MBB", bank_name_display: "Maybank", account_number: "1044", coa_account_code: "170-C38", active: true };
const LINE = { line_id: "l1", statement_id: "s1", bank_account_id: "acc1", entry_date: "2026-04-05", description: "fee", amount_cents: -1500, class_hint: "bank_charges" };
const STATEMENT = {
  id: "s1", bank_account_id: "acc1", document_id: "d1", period_start: "2026-04-01", period_end: "2026-04-30",
  opening_cents: 0, closing_cents: -1500, total_debit_cents: 1500, total_credit_cents: 0, line_count: 1,
  status: "live", ingest_mode: "document", superseded_by: null, voided_by: null, voided_at: null, voided_reason: null,
  tie: { gl_balance_cents: -1500, unmatched_cents: -1500 },
};
const CONTEXT = {
  schema: "clara.bank-line-matching-context/v1",
  line: { ...LINE, client_id: CLIENT, bank_account_display: "Maybank 1044", coa_account_code: "170-C38", line_no: 1, value_date: null, running_balance_cents: -1500, group_status: null, match_id: null },
  statement: { ...STATEMENT, statement_date: "2026-04-30", source_doc_sha256: "abc123", original_filename: "maybank-2026-04.pdf" },
  coverage: { line_count: 1, total_debit_cents: 1500, total_credit_cents: 0, tie: STATEMENT.tie },
  exception: null,
  booking_block: null,
  candidate_basis: [{ entry_id: "e1", amount_exact: true, date_delta_days: 0, counterparty_match: "name", class_hint: "bank_charges" }],
};
const CANDIDATE = {
  entry_id: "e1", posting_date: "2026-04-05", memo: "misc payable", coding_kind: null,
  counterparty_id: "cp1", counterparty_name: "Acme", high_stakes: false,
  debit_remaining_cents: 0, credit_remaining_cents: 1500, match_history: [],
};

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

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(MatchingSection, { clientId: CLIENT, selectedLineId: "l1", onSelectLine: () => {} }),
  });
}

async function mountAndSettle() {
  const h = await renderComponent(App());
  for (let i = 0; i < 5; i++) await h.settle();
  return h;
}

function checkboxNear(h: Awaited<ReturnType<typeof renderComponent>>, needle: string): Node {
  const found: Node[] = [];
  (function walk(n: Node) {
    if (n.tagName === "INPUT" && n.type === "checkbox") found.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(h.container as unknown as Node);
  const box = found.find((b) => textOf((b.parentNode ?? {}) as never).includes(needle))
    ?? found.find((b) => textOf(((b.parentNode?.parentNode) ?? {}) as never).includes(needle));
  assert.ok(box, `no checkbox found near "${needle}"`);
  return box!;
}

function centsInputFor(h: Awaited<ReturnType<typeof renderComponent>>, needle: string): Node {
  const node = h.find((n) => {
    const el = n as unknown as Node;
    if (el.tagName !== "INPUT" || el.type === "checkbox") return false;
    let row: Node | null | undefined = el.parentNode;
    for (let i = 0; i < 6 && row; i += 1, row = row.parentNode) {
      if (row.tagName === "TR") return textOf(row as never).includes(needle);
    }
    return false;
  });
  assert.ok(node, `no cents field found in the row for "${needle}"`);
  return node as unknown as Node;
}

test("p657.web.refusal-verbatim · the DB's message renders verbatim with its `code · reason` chip, and the typed cents SURVIVE the refusal", async () => {
  const seen: Record<string, unknown>[] = [];
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rpc/list_bank_accounts")) return jsonResponse([ACCOUNT]);
      if (url.includes("/rpc/list_bank_statements")) return jsonResponse([STATEMENT]);
      if (url.includes("/rpc/list_unmatched_lines")) return jsonResponse([LINE]);
      if (url.includes("/rpc/get_bank_line_matching_context")) return jsonResponse(CONTEXT);
      if (url.includes("/rpc/list_bank_match_candidates")) return jsonResponse([CANDIDATE]);
      if (url.includes("/rpc/match_bank_line")) {
        seen.push(JSON.parse(String(init?.body ?? "{}")));
        // The OVER-CAPACITY refusal, in the exact shape `_match_bank_line_core` raises it:
        // CLR10, the DB's own sentence, and `detail.reason` = already_matched with its SIDE.
        return jsonResponse({
          code: "CLR10",
          message: "journal entry e1 has no unmatched credit cents left on 170-C38",
          details: '{"reason":"already_matched","side":"credit","entry_id":"e1","account_code":"170-C38"}',
        }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        await h.fireEvent(checkboxNear(h, "fee") as never, "click", (n) => setNativeValue(n as never, "checked", true));
        for (let i = 0; i < 3; i++) await h.settle();
        await h.fireEvent(checkboxNear(h, "misc payable") as never, "click", (n) => setNativeValue(n as never, "checked", true));
        for (let i = 0; i < 2; i++) await h.settle();

        const cents = centsInputFor(h, "misc payable");
        await h.act(() => { setFieldValue(cents as never, "-15.00"); });

        const matchButton = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Match");
        assert.ok(matchButton, "the Match submit button must render");
        await h.fireEvent(matchButton!, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.equal(seen.length, 1, "match_bank_line was called once");
        const text = h.text();
        assert.match(text, /journal entry e1 has no unmatched credit cents left on 170-C38/,
          "the DATABASE's own sentence renders verbatim — never re-worded, never summarised");
        assert.match(text, /CLR10 · already_matched/,
          "the chip carries `code · reason`, so a human and a support thread name the same refusal");

        // THE DRAFT SURVIVES. The ticked line, the ticked candidate and the typed cents are all
        // still there, so the human changes ONE thing and resubmits — and because the key is
        // derived from that tuple, an unchanged resubmit is the SAME operation.
        const after = centsInputFor(h, "misc payable");
        assert.equal((after as { value?: string }).value, "-15.00",
          "the typed cents survive the refusal — retyping an amount you already typed is how a human types a different one");
        assert.equal((checkboxNear(h, "fee") as { checked?: boolean }).checked, true, "the ticked line survives the refusal");
        assert.equal((checkboxNear(h, "misc payable") as { checked?: boolean }).checked, true, "the ticked candidate survives the refusal");

        // …and the resubmit carries the SAME op key (D15), so the database sees one operation.
        await h.fireEvent(matchButton!, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        assert.equal(seen.length, 2, "the resubmit reached the door");
        assert.equal(seen[0]!.p_op_key, seen[1]!.p_op_key,
          "an unchanged draft resubmits under the SAME p_op_key — that is the whole of D15");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p657.web.refusal-verbatim · a successful match renders the persistent no-new-cash outcome sourced from the door's own field", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_bank_accounts")) return jsonResponse([ACCOUNT]);
      if (url.includes("/rpc/list_bank_statements")) return jsonResponse([STATEMENT]);
      if (url.includes("/rpc/list_unmatched_lines")) return jsonResponse([LINE]);
      if (url.includes("/rpc/get_bank_line_matching_context")) return jsonResponse(CONTEXT);
      if (url.includes("/rpc/list_bank_match_candidates")) return jsonResponse([CANDIDATE]);
      if (url.includes("/rpc/match_bank_line")) {
        return jsonResponse({
          match_id: "m-1", status: "live", line_cents: -1500, entry_cents: -1500, adjustment_cents: 0,
          entry_ids: ["e1"], line_ids: ["l1"], bank_account_id: "acc1", account_code: "170-C38",
          new_journal_entries: 0, settlement_objects: 0, period_exceptions: 0,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        await h.fireEvent(checkboxNear(h, "fee") as never, "click", (n) => setNativeValue(n as never, "checked", true));
        for (let i = 0; i < 3; i++) await h.settle();
        await h.fireEvent(checkboxNear(h, "misc payable") as never, "click", (n) => setNativeValue(n as never, "checked", true));
        for (let i = 0; i < 2; i++) await h.settle();
        await h.act(() => { setFieldValue(centsInputFor(h, "misc payable") as never, "-15.00"); });

        const matchButton = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Match");
        await h.fireEvent(matchButton!, "click");
        for (let i = 0; i < 5; i++) await h.settle();

        const text = h.text();
        assert.match(text, /No new cash entry was created\./, "AC5's persistent outcome, sourced from new_journal_entries");
        assert.match(text, /maybank-2026-04\.pdf/, "…naming the source file the context read carried");
        assert.match(text, /Acme/, "…and the counterparty of the entry it allocated against");
      } finally {
        await h.unmount();
      }
    },
  );
});
