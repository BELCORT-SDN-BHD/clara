// #643 — THE UNSENT PERIODIC-ADJUSTMENT DRAFT, and the intent identity that travels with it.
//
// IT IS `lib/work/journal-draft.ts`'s MECHANISM, REUSED — the scope key shape, the storage
// surface, the intent-key lifecycle and the "every read is untrusted" posture are that module's
// and are imported from it, not re-derived. What differs is exactly two things, and both are
// forced:
//
//   THE KEY PREFIX. A periodic adjustment and a journal entry are different intents with different
//   payloads; filed under one key, opening one form would seed it with the other's draft and a
//   restore would fail its own parser. `clara:periodic-adjustment-draft` keeps them apart under
//   the same user+firm+client scoping — which is what stops a draft crossing into another client's
//   books, exactly as it does there.
//
//   THE PARSER. It reads a WHOLE `AdjustmentDraft` (both halves, so a type switch loses nothing)
//   plus the two basis fields the form lets a preparer override. Every field is validated
//   field-by-field and anything not fully recognised returns null: a half-understood draft is
//   worse than none, because it would seed a form with figures nobody typed.
//
// `sessionStorage`, NOT `localStorage`, for the trust reason that module states: a stocktake and a
// payroll figure are client financial data, and `localStorage` would leave one member's half-typed
// adjustment on a shared machine after they closed the tab.

import {
  defaultDraftStorage,
  journalDraftKey,
  type DraftStorage,
  type JournalDraftScope,
} from "./journal-draft";
import {
  ADJUSTMENT_PURPOSES,
  OBLIGATION_KINDS,
  STOCK_METHODS,
  emptyAdjustmentDraft,
  type AdjustmentDraft,
} from "./periodic-adjustment";

export type StoredAdjustmentDraft = {
  /** Minted when the draft STARTS. Stable across every edit and every resubmit of these same
   *  particulars; a genuinely new intent gets a new one. */
  intentKey: string;
  draft: AdjustmentDraft;
  /** The two basis fields the form derives but lets a preparer override. Stored so a reload
   *  restores an overridden memo rather than silently re-deriving one. */
  postingDate: string;
  memo: string;
};

const KEY_PREFIX = "clara:periodic-adjustment-draft";

/** The storage key. Derived from `journalDraftKey` so the SCOPE RULE — user+firm+client, every
 *  part percent-encoded — has exactly one definition in the app; only the prefix is swapped. */
export function adjustmentDraftKey(scope: JournalDraftScope): string {
  return journalDraftKey(scope).replace(/^clara:journal-draft/, KEY_PREFIX);
}

const isString = (v: unknown): v is string => typeof v === "string";
const isCents = (v: unknown): v is number => Number.isSafeInteger(v);

function parseDraft(raw: string): StoredAdjustmentDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const stored = parsed as Record<string, unknown>;
  if (!isString(stored.intentKey) || stored.intentKey.trim() === "") return null;
  if (typeof stored.draft !== "object" || stored.draft === null) return null;
  const d = stored.draft as Record<string, unknown>;

  if (!ADJUSTMENT_PURPOSES.includes(d.purpose as never)) return null;
  if (!STOCK_METHODS.includes(d.method as never)) return null;
  if (!OBLIGATION_KINDS.includes(d.obligationKind as never)) return null;
  const texts = [
    "periodStart", "periodEnd", "instruction", "countedAt", "countReference",
    "inventoryAccountCode", "costAccountCode", "expenseAccountCode", "liabilityAccountCode",
    "advanceAccountCode", "paymentAccountCode", "particularsSource",
  ] as const;
  for (const key of texts) if (!isString(d[key])) return null;
  // CENTS MUST BE SAFE INTEGERS EVEN COMING OUT OF STORAGE. A JSON payload can carry 12.5 or
  // "1200"; seeding a money field from either is the floating-point coercion this lane forbids
  // outright.
  const money = ["openingCents", "closingCents", "adjustmentCents", "amountCents", "settledCents"] as const;
  for (const key of money) if (!isCents(d[key])) return null;

  const draft: AdjustmentDraft = { ...emptyAdjustmentDraft() };
  for (const key of texts) draft[key] = d[key] as string;
  for (const key of money) draft[key] = d[key] as number;
  draft.purpose = d.purpose as AdjustmentDraft["purpose"];
  draft.method = d.method as AdjustmentDraft["method"];
  draft.obligationKind = d.obligationKind as AdjustmentDraft["obligationKind"];

  return {
    intentKey: stored.intentKey,
    draft,
    postingDate: isString(stored.postingDate) ? stored.postingDate : "",
    memo: isString(stored.memo) ? stored.memo : "",
  };
}

/** The draft filed under this exact scope, or null. Never throws: a storage that refuses to be
 *  read is the same answer as an empty one. */
export function readAdjustmentDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): StoredAdjustmentDraft | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(adjustmentDraftKey(scope));
  } catch {
    return null;
  }
  return raw === null ? null : parseDraft(raw);
}

/** Files the draft under this scope. Returns whether it was actually stored, so a caller can tell
 *  "saved" from "this browser does not keep it" rather than promising a reload recovery it cannot
 *  deliver (§3: "Do not promise reload recovery from memory-only state"). */
export function writeAdjustmentDraft(
  scope: JournalDraftScope,
  draft: StoredAdjustmentDraft,
  storage: DraftStorage | null = defaultDraftStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(adjustmentDraftKey(scope), JSON.stringify(draft));
    return true;
  } catch {
    // A quota failure, or a browser refusing storage. The form keeps working.
    return false;
  }
}

/** Retires the draft — called ONLY after the runtime has answered 202, because until then the
 *  typed particulars are the only copy that exists. */
export function clearAdjustmentDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): void {
  if (storage === null) return;
  try {
    storage.removeItem(adjustmentDraftKey(scope));
  } catch {
    // Nothing to recover from: the draft is being discarded either way.
  }
}
