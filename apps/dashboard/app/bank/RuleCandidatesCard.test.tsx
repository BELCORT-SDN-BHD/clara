// [F14/D2 fix] CandidateProposalBuilder tests (the ReconciliationPanel.test.tsx
// pattern: createElement + renderToStaticMarkup, no jsdom, no network — its two
// useEffect network calls never run under a static server render, which is
// exactly what lets this pin the INITIAL, pre-interaction state safely). Proves
// (1) the readiness gate — pulled out pure so both kinds are exhaustively
// testable — never lets a required field stay empty, and (2) the wired
// component actually uses that gate: Propose starts disabled, never a silent
// auto-pick. Also covers the coding picker's active-accounts-only filter.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CandidateProposalBuilder, bankRuleProposalReady, activeAccountsOnly } from "./RuleCandidatesCard";
import type { AccountRow } from "../accounts/api";

// --- bankRuleProposalReady: exhaustive, no defaulted kind/proposal can ever
//     read "ready" ---------------------------------------------------------

test("bankRuleProposalReady: match_settle needs a chosen counterparty — an empty selection is never ready", () => {
  assert.equal(bankRuleProposalReady("match_settle", { counterpartyId: "", accountCode: "", narrationTemplate: "" }), false);
  assert.equal(bankRuleProposalReady("match_settle", { counterpartyId: "cp1", accountCode: "", narrationTemplate: "" }), true, "the OTHER kind's fields are irrelevant to match_settle's own readiness");
});

test("bankRuleProposalReady: coding needs BOTH an account code and a non-blank narration template — neither alone is enough", () => {
  assert.equal(bankRuleProposalReady("coding", { counterpartyId: "", accountCode: "", narrationTemplate: "" }), false);
  assert.equal(bankRuleProposalReady("coding", { counterpartyId: "", accountCode: "620-000", narrationTemplate: "" }), false, "account alone is not enough");
  assert.equal(bankRuleProposalReady("coding", { counterpartyId: "", accountCode: "", narrationTemplate: "bank charge" }), false, "narration alone is not enough");
  assert.equal(bankRuleProposalReady("coding", { counterpartyId: "", accountCode: "620-000", narrationTemplate: "   " }), false, "whitespace-only narration never counts as filled");
  assert.equal(bankRuleProposalReady("coding", { counterpartyId: "", accountCode: "620-000", narrationTemplate: "bank charge" }), true);
});

// --- CandidateProposalBuilder: the wired component actually gates on the
//     above, from its own untouched initial state -------------------------

function renderBuilder(): string {
  return renderToStaticMarkup(createElement(CandidateProposalBuilder, {
    token: "jwt", clientId: "client-1", busy: false,
    onPropose: () => { throw new Error("onPropose must never fire from a static, non-interactive render"); },
  }));
}

test("[F14 fix] CandidateProposalBuilder starts on match_settle with no counterparty chosen — Propose stays disabled by default, never a silent auto-pick", () => {
  const html = renderBuilder();
  const m = html.match(/<button[^>]*>Propose \(bookkeeper\)<\/button>/);
  assert.ok(m, "expected a Propose button");
  assert.ok(m![0].includes("disabled"), "the default, incomplete selection must never enable Propose");
});

test("[F14 fix] the counterparty picker starts on the unselected placeholder option — never a defaulted counterparty", () => {
  const html = renderBuilder();
  assert.ok(html.includes('>Select…<'), "the 'Select…' placeholder option renders");
});

// --- activeAccountsOnly: the coding picker's account list ------------------

function mkAccount(p: Partial<AccountRow>): AccountRow {
  return { account_code: "600-000", name: "Bank", account_type: "asset", account_class: null, special_acc_type: null, is_active: true, ...p };
}

test("[F14 fix] activeAccountsOnly keeps active accounts and drops inactive ones, order-preserving", () => {
  const rows = [
    mkAccount({ account_code: "600-000", name: "Bank", is_active: true }),
    mkAccount({ account_code: "601-000", name: "Old bank (closed)", is_active: false }),
    mkAccount({ account_code: "620-000", name: "Bank charges", is_active: true }),
  ];
  assert.deepEqual(activeAccountsOnly(rows).map((a) => a.account_code), ["600-000", "620-000"]);
});

test("[F14 fix] activeAccountsOnly is empty when every account is inactive, and is the identity when every account is active", () => {
  assert.deepEqual(activeAccountsOnly([mkAccount({ is_active: false })]), []);
  const allActive = [mkAccount({ account_code: "a" }), mkAccount({ account_code: "b" })];
  assert.deepEqual(activeAccountsOnly(allActive), allActive);
});
