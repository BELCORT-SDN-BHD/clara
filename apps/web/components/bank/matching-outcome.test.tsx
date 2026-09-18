// components/bank/matching-outcome.tsx — #657 AC3/AC5.
//
// THE ONE CELL THAT MATTERS HERE: the sentence "no new cash entry was created" must come from
// the DOOR'S OWN FIELD (`new_journal_entries`, which migration 0226 §6 put on the receipt,
// valued from what the act actually created) and NOT from this component reasoning about what a
// match is supposed to do. So the third cell hands it a receipt reporting a NON-ZERO count and
// asserts the reassurance disappears. A component that printed the sentence unconditionally
// would pass the first two cells and fail only in production, on the one act where it mattered.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { MatchingOutcome } from "./matching-outcome";
import type { MatchReceipt } from "@/lib/bank/matching-context-types";
import messages from "../../messages/en.json";

const RECEIPT: MatchReceipt = {
  match_id: "m-1",
  status: "live",
  line_cents: -1500,
  entry_cents: -1500,
  adjustment_cents: 0,
  entry_ids: ["je-1"],
  line_ids: ["l-1"],
  bank_account_id: "acc-1",
  account_code: "170-C38",
  new_journal_entries: 0,
  settlement_objects: 0,
  period_exceptions: 0,
};

function mount(receipt: MatchReceipt, filename: string | null = "maybank-2026-04.pdf", counterpartyName: string | null = "Sinaran Logistik Sdn Bhd") {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(MatchingOutcome, { receipt, filename, counterpartyName }),
    }),
  );
}

test("p657.web.outcome · the success block states 'no new cash entry was created' FROM the door's own field, and links line, JE, match, account and source", async () => {
  const h = await mount(RECEIPT);
  try {
    const text = h.text();
    assert.match(text, /No new cash entry was created\./,
      "the sentence AC3/AC5 exist for, sourced from new_journal_entries === 0");
    assert.match(text, /m-1/, "the match allocation is named");
    assert.match(text, /l-1/, "the statement line is named");
    assert.match(text, /je-1/, "the PRE-EXISTING journal entry is named — that is the whole point of the act");
    assert.match(text, /170-C38/, "the GL account is named");
    assert.match(text, /Sinaran Logistik Sdn Bhd/, "the counterparty is named");
    assert.match(text, /maybank-2026-04\.pdf/, "the source file is named (AC6's filename, carried from the context read)");
    assert.match(text, /RM 15\.00/, "the amount is rendered as money, not as cents");
  } finally {
    await h.unmount();
  }
});

test("p657.web.outcome · it is a persistent block with a polite live region, never a toast", async () => {
  const h = await mount(RECEIPT);
  try {
    const block = h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid") === "matching-outcome");
    assert.ok(block, "the outcome renders as a block in the page, not as a transient notification");
    const get = (block as { getAttribute?: (k: string) => string | null }).getAttribute;
    assert.equal(get?.call(block, "role"), "status", "announced once…");
    assert.equal(get?.call(block, "aria-live"), "polite", "…politely, and then readable for as long as the human wants it");
  } finally {
    await h.unmount();
  }
});

test("p657.web.outcome · a receipt reporting a NON-ZERO new_journal_entries does NOT print the reassurance", async () => {
  const h = await mount({ ...RECEIPT, new_journal_entries: 1, adjustment_cents: 100 });
  try {
    const text = h.text();
    assert.equal(/No new cash entry was created/.test(text), false,
      "a component that printed this unconditionally would be lying on exactly the act where it matters");
    assert.match(text, /This match created 1 journal entries for the named difference\./,
      "…it states what actually happened instead, in the same place and with the same prominence");
  } finally {
    await h.unmount();
  }
});

test("p657.web.outcome · absent facts render as absent, never as an invented value", async () => {
  const h = await mount({ match_id: "m-2", new_journal_entries: 0, settlement_objects: 0 }, null, null);
  try {
    const text = h.text();
    assert.match(text, /No new cash entry was created\./, "the sourced sentence still holds");
    assert.match(text, /—/, "a missing filename, counterparty or amount renders as an honest em dash");
    assert.equal(/undefined|null|NaN|\[object Object\]/.test(text), false, `a raw JS value leaked into the face: ${text}`);
  } finally {
    await h.unmount();
  }
});
