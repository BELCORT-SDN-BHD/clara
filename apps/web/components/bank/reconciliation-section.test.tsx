// components/bank/reconciliation-section.tsx — INTERACTION tests (independent
// review on web/p3-bank, priority 1-2, shipped WITH BLOCKER-1). Mounted for
// real via test/hookHarness.ts's `renderComponent` (mocked fetch + the real
// DOM commit path) so these arms prove the RENDERED component, not just the
// underlying lib mapper/derivation:
//   (a) the dl renders "—" (never a fabricated "RM 0.00") when the DB omits
//       a completed receipt's difference_cents/derived_closing_cents
//       (BLOCKER-1, 0040:4180-4211).
//   (b) the tie badge cannot read "tied" without a DB-sourced difference —
//       it reads "unavailable" on that same receipt.
//   (c) ackedStale AND voidReason both clear when the selected statement
//       changes (N17). R1 fix (independent review, MEDIUM): the first
//       version of this arm was VACUOUS — s2 carried no stale_outstanding_
//       ids of its own, so "no checkbox renders on s2" was true whether or
//       not the reset effect existed (proven by the reviewer's control:
//       deleting the effect stayed green). s2 now carries its own stale id,
//       and the assertion checks the checkbox EXISTS and reads unchecked —
//       the only shape that actually distinguishes reset from leaked. The
//       voidReason field has no s2 equivalent to render at all (s2 is
//       mode=preview), so that arm round-trips back to s1 instead and
//       checks the SAME field comes back empty, not the text typed before
//       the detour.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setNativeValue, setFieldValue } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import { ReconciliationSection } from "./reconciliation-section";
import messages from "../../messages/en.json";

type Node = { tagName?: string; type?: string; checked?: boolean; value?: string; parentNode?: Node | null; childNodes?: Node[] };

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

function App(clientId: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(ReconciliationSection, { clientId }),
  });
}

const ACCOUNT = { id: "acc1", bank_code: "MBB", bank_name_display: "Maybank current", account_number: "1-2-3" };
const STATEMENT_1 = { id: "s1", bank_account_id: "acc1", period_start: "2026-04-01", period_end: "2026-04-30", opening_cents: 0, closing_cents: -50000, status: "live" };
const STATEMENT_2 = { id: "s2", bank_account_id: "acc1", period_start: "2026-05-01", period_end: "2026-05-31", opening_cents: -50000, closing_cents: -60000, status: "live" };

/** s1's receipt: COMPLETED, omitting difference_cents/derived_closing_cents
 *  (the DB's own real shape, 0040:4180-4211) — the exact BLOCKER-1 scenario.
 *  Also carries one stale_outstanding_ids entry AND a recon_id (so the void
 *  form renders) for arm (c). */
const RECON_S1 = {
  statement_id: "s1", status: "complete", preview: false, closing_cents: -50000,
  stale_outstanding_ids: ["oi-stale-1"], can_complete: null, recon_id: "r1",
};
// R1 fix (independent review): s2 now ALSO carries a stale_outstanding_ids
// entry ("oi-stale-2", distinct id from s1's) — WITHOUT this the N17 test
// was vacuous (reviewer's own control: deleting the reset effect stayed
// green, because s2 rendered no stale fieldset either way, so "no checkbox
// found" was true regardless of whether the ack ever leaked). The only
// assertion that actually separates "reset" from "leaked" is: a checkbox
// for s2's OWN stale id exists, and reads unchecked.
const RECON_S2 = { statement_id: "s2", status: "open", preview: true, can_complete: false, blockers: ["line_unsettled"], stale_outstanding_ids: ["oi-stale-2"] };

function routeFetch(url: string, body: Record<string, unknown>): Response {
  if (url.includes("/rpc/list_bank_accounts")) return jsonResponse([ACCOUNT]);
  if (url.includes("/rpc/list_bank_statements")) return jsonResponse([STATEMENT_1, STATEMENT_2]);
  if (url.includes("/rpc/get_bank_reconciliation")) {
    return jsonResponse(body.p_statement === "s2" ? RECON_S2 : RECON_S1);
  }
  throw new Error(`unexpected fetch: ${url}`);
}

async function mountAndSettle(clientId = "c1") {
  const h = await renderComponent(App(clientId));
  for (let i = 0; i < 4; i++) await h.settle(); // let the cascade (accounts -> statements -> recon) land
  return h;
}

test("BLOCKER-1 (a)+(b): a completed receipt missing difference_cents/derived_closing_cents renders '—', never a fabricated 'RM 0.00', and the tie badge reads 'unavailable'", async () => {
  await withMockedEnv(
    async (u, init) => routeFetch(String(u), JSON.parse(String(init?.body ?? "{}"))),
    async () => {
      const h = await mountAndSettle();
      try {
        const text = h.text();
        assert.doesNotMatch(text, /RM 0\.00/, "must never fabricate a zero difference/closing figure");
        assert.match(text, /—/, "the missing terms must render the honest placeholder");
        assert.match(text, /unavailable/, "the tie badge must read 'unavailable', never 'tied', without a DB-sourced difference");
        assert.doesNotMatch(text, />tied</, "the tie badge itself must not say 'tied'");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("N17 (c): ackedStale AND voidReason clear when the selected statement changes", async () => {
  await withMockedEnv(
    async (u, init) => routeFetch(String(u), JSON.parse(String(init?.body ?? "{}"))),
    async () => {
      const h = await mountAndSettle();
      try {
        // --- ackedStale arm ---------------------------------------------
        const staleCheckbox = h.find(
          (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type === "checkbox",
        );
        assert.ok(staleCheckbox, "s1's reconciliation must render the stale-item checkbox");
        await h.fireEvent(staleCheckbox!, "click", (n) => setNativeValue(n as never, "checked", true));
        assert.equal((staleCheckbox as unknown as { checked: boolean }).checked, true, "the ack must have registered");

        // --- voidReason arm (s1 is a receipt with a recon_id, so the void
        // form renders) ---------------------------------------------------
        const voidReasonInput = h.find(
          (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type !== "checkbox"
            && textOf((n.parentNode ?? {}) as Node).includes("Void reason"),
        );
        assert.ok(voidReasonInput, "s1's void-reason field must render (mode=receipt, recon_id set)");
        await h.act(() => { setFieldValue(voidReasonInput as never, "wrong statement voided by mistake"); });
        assert.equal((voidReasonInput as unknown as { value: string }).value, "wrong statement voided by mistake", "the typed void reason must have registered");

        const statementSelect = h.find(
          (n) => n.tagName === "SELECT" && !!(n.childNodes as Parameters<typeof textOf>[0][] | undefined)?.some((c) => textOf(c).includes("2026-05-01")),
        );
        assert.ok(statementSelect, "the statement picker must list both statements");
        await h.fireEvent(statementSelect!, "change", (n) => setNativeValue(n as never, "value", "s2"));
        for (let i = 0; i < 3; i++) await h.settle();

        // R1 fix: s2 carries its OWN stale id (oi-stale-2) — the honest proof
        // the ack was scoped to s1 and did not silently carry over is that
        // s2's checkbox EXISTS (a vacuous "no checkbox rendered at all" can
        // no longer masquerade as a pass) and reads UNCHECKED.
        const staleCheckboxAfter = h.find(
          (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type === "checkbox",
        );
        assert.ok(staleCheckboxAfter, "s2 has its own stale item — its checkbox must render");
        assert.equal((staleCheckboxAfter as unknown as { checked: boolean }).checked, false, "s2's checkbox must NOT read as already acknowledged from s1's ack");

        // s2 is mode=preview (no recon_id) so the void form is not rendered
        // at all here — round-trip back to s1 to observe the SAME field
        // again: if the reset effect fires on every activeStatementId
        // change (not just once), it must come back empty, not carrying the
        // text typed before the detour through s2.
        await h.fireEvent(statementSelect!, "change", (n) => setNativeValue(n as never, "value", "s1"));
        for (let i = 0; i < 3; i++) await h.settle();

        // Self-caught refinement on THIS test: checking s2's checkbox alone
        // (above) is STILL structurally vacuous for ackedStale specifically
        // — s1 and s2 each carry a DIFFERENT stale id (oi-stale-1 vs
        // oi-stale-2), so `ackedStale.has("oi-stale-2")` reads false whether
        // or not the Set was ever reset; the negative control (deleting the
        // reset effect) proved exactly this: that assertion alone stayed
        // green. The only assertion that actually distinguishes reset from
        // leaked, for a Set keyed by opaque per-item ids, is a round trip
        // back to the SAME id: if the reset effect fires on every
        // activeStatementId change, s1's own "oi-stale-1" checkbox — ticked
        // at the top of this test — must read unchecked again here; if the
        // effect were deleted, the Set would still hold "oi-stale-1" and
        // this checkbox would come back checked.
        const staleCheckboxAgain = h.find(
          (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type === "checkbox",
        );
        assert.ok(staleCheckboxAgain, "s1's stale-item checkbox must render again on return");
        assert.equal((staleCheckboxAgain as unknown as { checked: boolean }).checked, false, "s1's own ack must NOT survive the round trip through s2");

        const voidReasonInputAfter = h.find(
          (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type !== "checkbox"
            && textOf((n.parentNode ?? {}) as Node).includes("Void reason"),
        );
        assert.ok(voidReasonInputAfter, "s1's void-reason field must render again on return");
        assert.equal((voidReasonInputAfter as unknown as { value: string }).value, "", "the void reason must NOT survive the round trip through s2");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// CB-AE2E-034 — eight bank reads, one six-word empty sentence.
// ---------------------------------------------------------------------------
//
// `ReadState` had no seam for per-read copy: `if (isEmpty) return
// <EmptyState>{t("empty")}</EmptyState>` with `t` bound to ClientBank.common, whose
// `empty` is "Nothing here yet." The reconciliation tab stacked TWO of them inside
// one CardContent — the accounts picker and the statements picker — so a client with
// no bank account read the identical sentence twice, one above the other, and neither
// said which read was empty or what to do about it.
//
// The seam is `emptyCopy`, defaulted so nothing regresses; the second half is that a
// derived truth is not a second finding: no accounts means no statements, so the
// statements picker's own sentence is suppressed while the accounts read is empty.

test("CB-AE2E-034: no bank accounts renders ONE actionable sentence, naming the read \u2014 not the generic line twice", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_bank_accounts")) return jsonResponse([]);
      if (url.includes("/rpc/list_bank_statements")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        const text = h.text();
        assert.match(text, /No bank account is registered for this client yet/, "the sentence names the read that was empty");
        assert.match(text, /Register one on the Accounts tab/, "\u2026and what to do about it");
        assert.doesNotMatch(text, /Nothing here yet/, "the generic six-word sentence must be gone from this card");

        // THE DUPLICATE, pinned as a count: the statements picker's own empty
        // sentence is suppressed while the accounts read is empty.
        const occurrences = text.split("No bank account is registered for this client yet").length - 1;
        assert.equal(occurrences, 1, "exactly ONE empty sentence in this card, never the same claim stacked twice");
        assert.doesNotMatch(text, /This account has no statement yet/, "no accounts means no statements \u2014 a derived truth, not a second finding");
      } finally {
        await h.unmount();
      }
    },
  );
});

// MUST-NOT-RED CONTROL: with accounts present but no statements, the STATEMENTS
// sentence is exactly what must render \u2014 the suppression is scoped to the derived
// case, not a blanket hide.
test("CB-AE2E-034 control: accounts present, no statements \u2014 the statements picker DOES say so, in its own words", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_bank_accounts")) return jsonResponse([ACCOUNT]);
      if (url.includes("/rpc/list_bank_statements")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        const text = h.text();
        assert.match(text, /This account has no statement yet/);
        assert.match(text, /Enter one on the Statements tab/);
        assert.doesNotMatch(text, /No bank account is registered/);
        assert.doesNotMatch(text, /Nothing here yet/);
      } finally {
        await h.unmount();
      }
    },
  );
});
