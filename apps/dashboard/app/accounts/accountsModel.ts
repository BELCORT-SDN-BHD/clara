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
  MPERS_ROLLUPS,
  STANDARD_BLOCKS,
  OPTIONAL_BLOCKS,
  templateAccounts,
  conflictingBlockKeys,
  type CoaTemplateAccount,
  type CoaTemplateBlock,
} from "../shared/coaTemplate";

export type { CoaTemplateAccount, CoaTemplateBlock };
export { COA_TEMPLATE, MPERS_ROLLUPS, STANDARD_BLOCKS, OPTIONAL_BLOCKS, conflictingBlockKeys };

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
// Block selection maths (the "Apply the template" panel). Standard blocks are
// pre-selected; optional blocks are not. The DB owns nothing here — this is pure
// UI-selection bookkeeping over the already-fixed template.
// ---------------------------------------------------------------------------

export function defaultSelectedBlockKeys(): string[] {
  return STANDARD_BLOCKS.map((b) => b.key);
}

/**
 * Toggle one block in the selection. Selecting a block also DROPS any block declared
 * mutually exclusive with it (coaTemplate `conflictsWith`) — the entity-shape case: the
 * company equity block and the sole-proprietorship equity block each carry a
 * retained-earnings marker, and clara.uq_coa_special is UNIQUE per
 * (client_id, special_acc_type), so seeding both would refuse with a unique violation
 * PARTWAY THROUGH the apply loop. The loop does NOT abort on a refusal — it records the
 * error and carries on — so the operator would not get a truncated run; they would get one
 * red row among ~200 and a chart that reads as complete while the wrong account holds
 * accumulated equity. Dropping the conflicting block here is the difference between a
 * visible checkbox change and that. Deselecting never adds anything back — the operator's
 * own choice stands.
 *
 * SCOPE, stated because it is easy to over-read: this guards the IN-SESSION selection only.
 * It knows nothing about rows already in clara.coa_accounts. An already-seeded client that
 * switches entity shape is caught by specialMarkerConflicts() at apply time instead.
 */
export function toggleBlockKey(selected: readonly string[], key: string): string[] {
  if (selected.includes(key)) return selected.filter((k) => k !== key);
  const drop = new Set(conflictingBlockKeys(key));
  return [...selected.filter((k) => !drop.has(k)), key];
}

/** The account count for a given block-key selection — read straight off the fixed
 *  template (never recomputed/estimated); used for the "N accounts selected" readout. */
export function selectionAccountCount(selectedKeys: readonly string[]): number {
  return templateAccounts([...selectedKeys]).length;
}

export { templateAccounts };

// ---------------------------------------------------------------------------
// PRE-APPLY MARKER GUARD. toggleBlockKey() only keeps the in-session selection
// self-consistent; it cannot see rows already in clara.coa_accounts. The real-world
// path is mundane: `sole-proprietor` is optional and unchecked, so an operator applies
// the company default to a sole proprietorship first, realises the mistake, ticks the
// block and re-applies. 150-000 now holds the retained_earnings marker, so 150-CAP hits
// uq_coa_special and is refused — while the other ~190 accounts land, because the apply
// loop deliberately continues past a per-account error. The chart then LOOKS complete
// with no 150-CAP in it, and Gate K's carry-down resolves retained_earnings by marker:
// the proprietor's accumulated capital posts to an account called "Retained earnings",
// with no error at all. That silent path is worse than the refusal, so this refuses the
// whole apply BEFORE the first write.
// ---------------------------------------------------------------------------

export type MarkerConflict = {
  /** the special_acc_type both accounts want */
  marker: string;
  /** the template account the current selection would seed with it */
  wantedCode: string;
  wantedName: string;
  /** the account already holding it on this client (a DIFFERENT code) */
  existingCode: string;
  existingName: string;
  /** uq_coa_special has NO is_active predicate — an inactive row still holds the slot */
  existingActive: boolean;
};

/**
 * Every special-marker collision between a template selection and the client's existing
 * accounts. A match on the SAME code is not a conflict — that is an ordinary upsert of the
 * same row. Inactive rows are reported too, because clara.uq_coa_special is
 * `unique (client_id, special_acc_type) where special_acc_type is not null` with no
 * is_active predicate: deactivating the old account does not free the slot.
 */
export function specialMarkerConflicts(
  selection: readonly CoaTemplateAccount[],
  existing: readonly AccountRow[],
): MarkerConflict[] {
  const out: MarkerConflict[] = [];
  for (const acct of selection) {
    if (!acct.special) continue;
    for (const row of existing) {
      if (row.special_acc_type !== acct.special) continue;
      if (row.account_code === acct.code) continue;
      out.push({
        marker: acct.special,
        wantedCode: acct.code,
        wantedName: acct.name,
        existingCode: row.account_code,
        existingName: row.name,
        existingActive: row.is_active,
      });
    }
  }
  return out;
}

/**
 * The operator-facing refusal. It has to do three things the DB's own message cannot:
 * name the account ACTUALLY holding the marker (upsert_account maps every unique_violation
 * to "a rounding account already exists for this client" — 0009, deployed, not editable
 * here); give the remedy; and say that deactivating is not the remedy, because that is
 * counter-intuitive and undocumented anywhere else.
 */
export function markerConflictRefusal(conflicts: readonly MarkerConflict[]): string {
  const lines = conflicts.map(
    (c) =>
      `• "${c.marker}" is already on ${c.existingCode} ${c.existingName}` +
      `${c.existingActive ? "" : " (inactive — see below)"}, and this selection puts it on ` +
      `${c.wantedCode} ${c.wantedName}.`,
  );
  return [
    "Apply refused — nothing was written.",
    "",
    `This client's chart already carries ${conflicts.length === 1 ? "a special marker" : "special markers"} the selected template wants to put somewhere else. clara.coa_accounts permits exactly one account per client per marker (uq_coa_special):`,
    ...lines,
    "",
    "If this were applied, the DB would refuse only the conflicting account while every other account landed — so the chart would read as complete, and the opening-balance carry-down (which resolves the marker, not the code) would post to the account named above. Retrying would not help either: the refusal aborts that account's whole transaction, including its op-key reservation, so it re-raises identically every time.",
    "",
    `Remedy: in "Add a single account" below, re-enter ${[...new Set(conflicts.map((c) => c.existingCode))].join(", ")} with the same name and type but the special field left blank. That clears the marker (upsert_account's on-conflict update writes the blank through). Then apply the template again.`,
    "",
    "Deactivating the old account does NOT work: uq_coa_special has no is_active condition, so an inactive row keeps holding the slot — while the carry-down, which only looks at active accounts, then refuses with CLR31.",
  ].join("\n");
}

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
