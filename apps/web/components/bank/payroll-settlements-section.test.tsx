// components/bank/payroll-settlements-section.tsx — #947. Mounted for real via
// test/hookHarness.ts's `renderComponent`:
//   - an unsettled run's candidate renders with its date/description/amount, and clicking
//     Accept posts settle_payroll_net_pay with the right client/entry/line and reloads;
//   - a refusal from the settle door renders VISIBLY, never silently un-busies;
//   - the empty state (every run settled, or none posted) renders its own copy, never a bare
//     blank card.
//
// #1059 — REOPENING A WRONGLY ACCEPTED SETTLEMENT. Confirming composes the two EXISTING
// general-purpose doors this ticket names — `unmatch_bank_match` THEN `reverse_entry`, in that
// order (the estate's own reversal belt refuses a reverse while a live match still rides the
// entry) — never a new SQL door.
//
// FIX ROUND. The route is now DURABLE (spec finding L04-SPEC-01): the settlements a person can
// still undo are read from the ledger on every hydration through RLS-scoped table reads
// (`lib/bank/payroll-settlement-reversals.ts`), so a reload, a tab change or a fresh visit finds
// them — the first cut kept the accept receipt in React state and lost it. It is also RESUMABLE
// (adversarial ADV-03): a settlement whose bank line was already freed reads `unmatched` and needs
// only `reverse_entry`, and an `already_unmatched` refusal mid-composition is read as "that half
// landed" rather than as a dead end. And the high-stakes arm is visible (spec L04-SPEC-04): a
// settlement left a DRAFT for a distinct checker offers `withdraw_draft`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import { PayrollSettlementsSection } from "./payroll-settlements-section";
import messages from "../../messages/en.json";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

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
    children: createElement(PayrollSettlementsSection, { clientId: "c1" }),
  });
}

const RUN = {
  entry_id: "e1", document_id: "d1", filing_id: "f1", posting_date: "2026-08-31",
  period_month: "2026-08-01", net_pay_cents: 425570, unsettled_cents: 425570,
  candidates: [
    { line_id: "l1", statement_id: "s1", bank_account_id: "b1", bank_account_display: "Maybank 1234",
      entry_date: "2026-09-02", value_date: "2026-09-02", description: "SALARY GIRO",
      amount_cents: -425570, date_delta_days: 2, class_hint: "payroll" },
  ],
};

/** The SETTLEMENT entry 0298 books, as clara.journal_entries actually holds it: an ordinary
 *  approved entry whose `flags` carry the payroll_settlement marker (0298:463-465). */
const SETTLEMENT_ENTRY = {
  id: "e2",
  status: "approved",
  posting_date: "2026-09-02",
  revision_token: null,
  flags: { payroll_settlement: { payroll_entry_id: "e1", document_id: "d1", period_month: "2026-08-01" } },
};
const MATCH_MEMBER = { match_id: "m1", entry_id: "e2", matched_cents: -425570 };
const LIVE_MATCH = { id: "m1", status: "live" };

/** The three RLS-scoped table reads the durable list makes, as one router. `entries`/`members`/
 *  `matches` are what the server would return for THIS client on THIS hydration. */
type LedgerState = { entries?: unknown[]; members?: unknown[]; matches?: unknown[] };

function ledgerRoute(url: string, state: LedgerState): Response | null {
  if (url.includes("/rest/v1/journal_entries")) return jsonResponse(state.entries ?? []);
  if (url.includes("/rest/v1/bank_match_entry_members")) return jsonResponse(state.members ?? []);
  if (url.includes("/rest/v1/bank_matches")) return jsonResponse(state.matches ?? []);
  return null;
}

async function mountAndSettle() {
  const h = await renderComponent(App());
  for (let i = 0; i < 4; i++) await h.settle();
  return h;
}

function findButtonByText(h: Awaited<ReturnType<typeof renderComponent>>, needle: string): Node {
  const found: Node[] = [];
  function walk(n: Node) {
    if (n.tagName === "BUTTON" && textOf(n as never).includes(needle)) found.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  }
  walk(h.container as unknown as Node);
  assert.equal(found.length, 1, `expected exactly one button containing "${needle}", found ${found.length}`);
  return found[0]!;
}

async function typeReasonAndConfirm(
  h: Awaited<ReturnType<typeof renderComponent>>, reason: string, confirmLabel = "Confirm reverse",
) {
  const reasonInput = h.find((n) => n.tagName === "INPUT" && textOf((n.parentNode ?? {}) as Node).includes("Reason"));
  assert.ok(reasonInput, "the reverse ceremony's reason input must render");
  await h.act(() => { setFieldValue(reasonInput as never, reason); });
  await h.act(() => clickButton(findButtonByText(h, confirmLabel) as never));
  for (let i = 0; i < 4; i++) await h.settle();
}

test("p947.web.accept · an unsettled run's candidate renders, and accepting it posts settle_payroll_net_pay with the right ids", async () => {
  const seenBodies: Record<string, unknown>[] = [];
  let settleCalls = 0;
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      const ledger = ledgerRoute(url, {});
      if (ledger) return ledger;
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([RUN]);
      if (url.includes("/rpc/settle_payroll_net_pay")) {
        settleCalls += 1;
        seenBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ entry_id: "e2", match_id: "m1", unsettled_cents: 425570, posting_date: "2026-09-02" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        assert.match(h.text(), /SALARY GIRO/);
        assert.match(h.text(), /RM 4,255\.70/);
        const accept = findButtonByText(h, "Accept");
        await h.act(() => clickButton(accept as never));
        await h.settle();
        assert.equal(settleCalls, 1);
        assert.equal(seenBodies[0]?.p_client, "c1");
        assert.equal(seenBodies[0]?.p_entry, "e1");
        assert.equal(seenBodies[0]?.p_line, "l1");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p947.web.refusal · a settle_payroll_net_pay refusal renders visibly, never a silent un-busy", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      const ledger = ledgerRoute(url, {});
      if (ledger) return ledger;
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([RUN]);
      if (url.includes("/rpc/settle_payroll_net_pay")) {
        return jsonResponse({ code: "CLR10", message: "statement line l1 (100 cents) does not match this run's unsettled net pay (425570 cents)", details: '{"reason":"amount_mismatch"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        const accept = findButtonByText(h, "Accept");
        await h.act(() => clickButton(accept as never));
        await h.settle();
        assert.match(h.text(), /does not match this run's unsettled net pay/, "the DB's own refusal message renders, verbatim");
        assert.match(h.text(), /CLR10/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p947.web.empty · no unsettled run and nothing to undo renders the empty state, never a bare blank card", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      const ledger = ledgerRoute(url, {});
      if (ledger) return ledger;
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        assert.match(h.text(), /No payroll run is waiting/i);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p1059.web.durable · a settlement accepted in ANOTHER session is discoverable on a fresh mount, with a route to reverse it", async () => {
  // AC1, and the whole of L04-SPEC-01: no Accept happens in this mount at all. The panel reads the
  // settlement off the ledger — an approved entry carrying 0298's payroll_settlement marker, with
  // its live bank match — exactly as it would after a reload, a tab change or a fresh visit.
  const seenEntryUrls: string[] = [];
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/journal_entries")) seenEntryUrls.push(url);
      const ledger = ledgerRoute(url, {
        entries: [SETTLEMENT_ENTRY], members: [MATCH_MEMBER], matches: [LIVE_MATCH],
      });
      if (ledger) return ledger;
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        assert.match(h.text(), /August 2026/, "the settled period is named from the entry's own marker");
        assert.match(h.text(), /RM 4,255\.70/, "…and the amount comes from the match member, never from memory");
        findButtonByText(h, "Reverse settlement");
        // The read is RLS-scoped and client-scoped by this caller, and asks only for finished
        // business it could still undo.
        assert.ok(seenEntryUrls[0]?.includes("client_id=eq.c1"));
        assert.ok(seenEntryUrls[0]?.includes("reversed_by=is.null"));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p1059.web.reverse · reversing composes unmatch_bank_match then reverse_entry with the right ids/reason, and the run is offered again", async () => {
  const seenUnmatchBodies: Record<string, unknown>[] = [];
  const seenReverseBodies: Record<string, unknown>[] = [];
  let reversed = false;
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      // Once BOTH doors have landed the ledger says so: the settlement entry is reversed (so it
      // drops out of the durable read) and the run is unsettled again.
      const ledger = ledgerRoute(url, reversed
        ? {}
        : { entries: [SETTLEMENT_ENTRY], members: [MATCH_MEMBER], matches: [LIVE_MATCH] });
      if (ledger) return ledger;
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse(reversed ? [RUN] : []);
      if (url.includes("/rpc/unmatch_bank_match")) {
        seenUnmatchBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ match_id: "m1", status: "unmatched" });
      }
      if (url.includes("/rpc/reverse_entry")) {
        seenReverseBodies.push(JSON.parse(String(init?.body ?? "{}")));
        reversed = true;
        return jsonResponse({ reversal_id: "e3", status: "approved" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        await h.act(() => clickButton(findButtonByText(h, "Reverse settlement") as never));
        await h.settle();
        await typeReasonAndConfirm(h, "accepted the wrong candidate");

        // THE ORDER (the estate's own reversal belt): unmatch first, then reverse — both with
        // the SAME typed reason, both naming the ids the LEDGER reported.
        assert.equal(seenUnmatchBodies.length, 1, "unmatch_bank_match must have been called exactly once");
        assert.equal(seenUnmatchBodies[0]?.p_match, "m1");
        assert.equal(seenUnmatchBodies[0]?.p_reason, "accepted the wrong candidate");
        assert.equal(seenReverseBodies.length, 1, "reverse_entry must have been called exactly once");
        assert.equal(seenReverseBodies[0]?.p_entry, "e2");
        assert.equal(seenReverseBodies[0]?.p_reason, "accepted the wrong candidate");

        // AC2/AC3 — the run is unsettled again: the SAME candidate reappears in this panel.
        assert.match(h.text(), /SALARY GIRO/);
        assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n as never).includes("Reverse settlement")), null,
          "the reversed settlement's own ceremony is gone once the ledger no longer carries it");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p1059.web.resume · a settlement whose bank line was already freed needs only reverse_entry (ADV-03)", async () => {
  // THE HALF-REVERSED LEDGER, read from the server rather than guessed: the entry is still posted
  // and there is no live match. Before the fix the panel's only route re-called unmatch FIRST,
  // which clara._unmatch_bank_match_core refuses by name forever, so this state was a dead end
  // whose only exit was the Journals workbench.
  let unmatchCalls = 0;
  const seenReverseBodies: Record<string, unknown>[] = [];
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      const ledger = ledgerRoute(url, {
        entries: [SETTLEMENT_ENTRY],
        members: [MATCH_MEMBER],
        // The match exists but is UNMATCHED, so the status filter returns nothing for it.
        matches: [],
      });
      if (ledger) return ledger;
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([]);
      if (url.includes("/rpc/unmatch_bank_match")) {
        unmatchCalls += 1;
        return jsonResponse({ code: "CLR10", message: "bank match m1 is already unmatched; re-matching writes a NEW group", details: '{"reason":"already_unmatched"}' }, 400);
      }
      if (url.includes("/rpc/reverse_entry")) {
        seenReverseBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ reversal_id: "e3", status: "approved" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        assert.match(h.text(), /the bank line was released but the settlement entry is still posted/i,
          "the panel says what state this is in, rather than offering a step that cannot succeed");
        await h.act(() => clickButton(findButtonByText(h, "Reverse settlement") as never));
        await h.settle();
        await typeReasonAndConfirm(h, "finishing an interrupted reversal");

        assert.equal(unmatchCalls, 0, "the half that already landed is not attempted again");
        assert.equal(seenReverseBodies.length, 1);
        assert.equal(seenReverseBodies[0]?.p_entry, "e2");
        assert.doesNotMatch(h.text(), /already unmatched/i, "and no refusal was surfaced, because none happened");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p1059.web.retry · an already_unmatched refusal mid-ceremony is read as 'that half landed', and the reversal completes (ADV-03)", async () => {
  // The same recovery from the OTHER direction: the read still shows a live match (a stale
  // hydration, or a concurrent unmatch), so the panel does call unmatch — and the door's own CLR10
  // `already_unmatched` is a REPORT that the first half is done, not a failure to stop on.
  let unmatchCalls = 0;
  const seenReverseBodies: Record<string, unknown>[] = [];
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      const ledger = ledgerRoute(url, {
        entries: [SETTLEMENT_ENTRY], members: [MATCH_MEMBER], matches: [LIVE_MATCH],
      });
      if (ledger) return ledger;
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([]);
      if (url.includes("/rpc/unmatch_bank_match")) {
        unmatchCalls += 1;
        return jsonResponse({ code: "CLR10", message: "bank match m1 is already unmatched; re-matching writes a NEW group", details: '{"reason":"already_unmatched"}' }, 400);
      }
      if (url.includes("/rpc/reverse_entry")) {
        seenReverseBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ reversal_id: "e3", status: "approved" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        await h.act(() => clickButton(findButtonByText(h, "Reverse settlement") as never));
        await h.settle();
        await typeReasonAndConfirm(h, "finishing an interrupted reversal");

        assert.equal(unmatchCalls, 1, "it was attempted, because the read said the match was live");
        assert.equal(seenReverseBodies.length, 1, "…and the ceremony carried on to the half that was still owed");
        assert.doesNotMatch(h.text(), /already unmatched/i,
          "an already-done step is not news; only a real refusal is");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p1059.web.refusal · a reverse_entry refusal during the ceremony renders visibly, never a silent un-busy", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      const ledger = ledgerRoute(url, {
        entries: [SETTLEMENT_ENTRY], members: [MATCH_MEMBER], matches: [LIVE_MATCH],
      });
      if (ledger) return ledger;
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([]);
      if (url.includes("/rpc/unmatch_bank_match")) return jsonResponse({ match_id: "m1", status: "unmatched" });
      if (url.includes("/rpc/reverse_entry")) {
        return jsonResponse({ code: "CLR10", message: "entry e2 rides 1 pending or live bank match(es), as a member or as a reservation's draft anchor; unmatch first, then reverse", details: '{"reason":"live_bank_match_present"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        await h.act(() => clickButton(findButtonByText(h, "Reverse settlement") as never));
        await h.settle();
        await typeReasonAndConfirm(h, "wrong candidate");
        assert.match(h.text(), /unmatch first, then reverse/, "the DB's own refusal message renders, verbatim");
        assert.match(h.text(), /CLR10/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p1059.web.awaitingchecker · a high-stakes settlement left a DRAFT offers withdraw_draft, not a reverse (L04-SPEC-04)", async () => {
  // 0298:494 leaves a HIGH-STAKES settlement a draft for a distinct checker: `match_id` is null,
  // nothing is posted and nothing is matched. The first cut surfaced nothing at all for that arm.
  // The remedy before a post is to abandon the draft, through the estate's own door.
  const seenWithdrawBodies: Record<string, unknown>[] = [];
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      const ledger = ledgerRoute(url, {
        entries: [{ ...SETTLEMENT_ENTRY, status: "draft", revision_token: "rev-1" }],
      });
      if (ledger) return ledger;
      if (url.includes("/rpc/get_payroll_settlement_candidates")) return jsonResponse([]);
      if (url.includes("/rpc/withdraw_draft")) {
        seenWithdrawBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse(null);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await mountAndSettle();
      try {
        assert.match(h.text(), /waiting for a checker to approve it/i);
        assert.equal(h.find((n) => n.tagName === "BUTTON" && textOf(n as never).includes("Reverse settlement")), null,
          "there is nothing posted to reverse and nothing matched to unmatch");
        await h.act(() => clickButton(findButtonByText(h, "Withdraw draft") as never));
        await h.settle();
        await typeReasonAndConfirm(h, "settled the wrong line", "Confirm withdraw");

        assert.equal(seenWithdrawBodies.length, 1);
        assert.equal(seenWithdrawBodies[0]?.p_entry, "e2");
        assert.equal(seenWithdrawBodies[0]?.p_reason, "settled the wrong line");
        assert.equal(seenWithdrawBodies[0]?.p_expected_revision, "rev-1",
          "the estate's own optimistic-concurrency token, read off the draft rather than guessed");
      } finally {
        await h.unmount();
      }
    },
  );
});
