// The client-scoped chart-of-accounts lane — pure model (LANE ACCOUNTS; closes the
// live-gate-run-2026-07-24 finding-1 gap: no dashboard page called upsert_account, so a
// freshly onboarded client had an empty CoA and could not receive any posting). PURE —
// zero network, zero React. Every account row a surface renders is a DB-owned
// clara.coa_accounts row; this module never invents one. It holds the account-code
// validator (mirrors the DB CHECK verbatim — the DB re-validates and is the only
// authority), the block-selection maths over ../shared/coaTemplate, the deterministic
// op_key derivation the apply-loop uses (WB-R19: same intent keeps its op_key, so a
// retry after a partial failure REPLAYS rather than duplicates), and the per-account
// apply-result view-model.

import {
  COA_TEMPLATE,
  CORE_BLOCKS,
  templateAccounts,
  type CoaTemplateAccount,
  type CoaTemplateBlock,
} from "../shared/coaTemplate";

export type { CoaTemplateAccount, CoaTemplateBlock };
export { COA_TEMPLATE, CORE_BLOCKS };

// ---------------------------------------------------------------------------
// Account-code validation (clara.coa_accounts_account_code_check, 0009, verbatim).
// A UI-side convenience only — upsert_account re-validates in-txn and is the only
// authority; this just gives an operator the format BEFORE a round trip refuses it.
// ---------------------------------------------------------------------------

export const ACCOUNT_CODE_PATTERN = "^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$";
const ACCOUNT_CODE_RE = new RegExp(ACCOUNT_CODE_PATTERN);

export const ACCOUNT_CODE_HINT =
  "Either 4–8 digits (e.g. 400000), or three digits, a dash, then 2–4 letters/digits (e.g. 900-A01).";

export function validateAccountCode(raw: string): { ok: true } | { ok: false; error: string } {
  const code = raw.trim();
  if (!code) return { ok: false, error: "An account code is required." };
  if (!ACCOUNT_CODE_RE.test(code)) {
    return { ok: false, error: `"${code}" does not match the account-code format. ${ACCOUNT_CODE_HINT}` };
  }
  return { ok: true };
}

// The DB CHECKs this UI mirrors as select option lists (clara.coa_accounts, 0003/0009/0015).
export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_CLASSES = ["payable", "receivable"] as const;
export type AccountClassOpt = (typeof ACCOUNT_CLASSES)[number];

export const SPECIAL_ACC_TYPES = [
  "rounding",
  "sst_output",
  "sst_purchase_cost",
  "opening_balance_equity",
  "retained_earnings",
] as const;
export type SpecialAccType = (typeof SPECIAL_ACC_TYPES)[number];

// ---------------------------------------------------------------------------
// coa_accounts row shape (mirrors the DB table verbatim; read-only display).
// ---------------------------------------------------------------------------

export type AccountRow = {
  account_code: string;
  name: string;
  account_type: string;
  account_class: string | null;
  special_acc_type: string | null;
  is_active: boolean;
};

// ---------------------------------------------------------------------------
// Block selection maths (the "Apply the template" panel). Core blocks are
// pre-selected; optional blocks are not. The DB owns nothing here — this is pure
// UI-selection bookkeeping over the already-fixed template.
// ---------------------------------------------------------------------------

export function defaultSelectedBlockKeys(): string[] {
  return CORE_BLOCKS.map((b) => b.key);
}

export function toggleBlockKey(selected: readonly string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
}

/** The account count for a given block-key selection — read straight off the fixed
 *  template (never recomputed/estimated); used for the "N accounts selected" readout. */
export function selectionAccountCount(selectedKeys: readonly string[]): number {
  return templateAccounts([...selectedKeys]).length;
}

export { templateAccounts };

// ---------------------------------------------------------------------------
// The deterministic op_key (WB-R19: same intent keeps its op_key). Derived from the
// client + account code ONLY — never a timestamp/random component — so pressing
// "Apply" again after a partial failure sends the IDENTICAL op_key for every account,
// and upsert_account's own request-hash dedupe (over client/code/name/type/special/
// class) makes the replay a no-op for anything that already landed. A genuinely
// different payload under the same code would surface the DB's own
// "op_key reused with different args" (CLR10) rather than silently applying — which
// cannot happen here because the payload is always read straight off the same fixed
// template row.
export function coaSeedOpKey(clientId: string, code: string): string {
  return `coaseed:${clientId}:${code}`;
}

// ---------------------------------------------------------------------------
// The apply-loop's per-account result view-model (DISPLAY only). The apply loop is
// SEQUENTIAL (never parallel — upsert_account is a live audited governed verb), so
// this is built once per run and mutated account-by-account as each call settles.
// ---------------------------------------------------------------------------

export type ApplyStatus = "pending" | "applying" | "ok" | "error";

export type ApplyResult = {
  code: string;
  name: string;
  status: ApplyStatus;
  /** The DB's verbatim refusal message — NEVER suppressed behind a CLR badge. */
  message?: string;
  clr?: string | null;
  reason?: string | null;
};

export function initApplyResults(accounts: readonly CoaTemplateAccount[]): ApplyResult[] {
  return accounts.map((a) => ({ code: a.code, name: a.name, status: "pending" as const }));
}

export function withResult(
  results: readonly ApplyResult[],
  index: number,
  patch: Partial<ApplyResult>,
): ApplyResult[] {
  return results.map((r, i) => (i === index ? { ...r, ...patch } : r));
}

export function applySummary(results: readonly ApplyResult[]): { ok: number; error: number; pending: number } {
  let ok = 0;
  let error = 0;
  let pending = 0;
  for (const r of results) {
    if (r.status === "ok") ok += 1;
    else if (r.status === "error") error += 1;
    else pending += 1;
  }
  return { ok, error, pending };
}

// ---------------------------------------------------------------------------
// A code → MPERS roll-up lookup, built once off the fixed template (item 5: "show
// each account's MPERS roll-up where known"). An account NOT born from the template
// (a hand-added one, or one seeded by an earlier lane/script) simply has no entry —
// we never guess a roll-up for a code the template does not carry.
// ---------------------------------------------------------------------------

export function buildMpersLookup(): Map<string, string> {
  const m = new Map<string, string>();
  for (const block of COA_TEMPLATE) {
    for (const acct of block.accounts) m.set(acct.code, acct.mpers);
  }
  return m;
}
