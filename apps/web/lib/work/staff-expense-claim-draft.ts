// #638 — THE UNSENT STAFF-EXPENSE-CLAIM DRAFT, and the intent identity that travels with it.
//
// IT IS `lib/work/journal-draft.ts`'s MECHANISM, REUSED — the scope key shape, the storage surface,
// the intent-key lifecycle and the "every read is untrusted" posture are that module's and are
// imported from it, not re-derived. What differs is exactly two things, and both are forced:
//
//   THE KEY PREFIX. A staff expense claim, a periodic adjustment and a journal entry are different
//   intents with different payloads; filed under one key, opening one form would seed it with
//   another's draft and a restore would fail its own parser. `clara:staff-expense-claim-draft`
//   keeps them apart under the same user+firm+client scoping — which is what stops a draft crossing
//   into another client's books, exactly as it does there.
//
//   THE PARSER. It reads a WHOLE `ClaimDraft` (every settlement's half, so the Radio Group switch
//   loses nothing) plus the itemised lines. Every field is validated field-by-field and anything
//   not fully recognised returns null: a half-understood draft is worse than none, because it would
//   seed a form with figures nobody typed.
//
// `sessionStorage`, NOT `localStorage`, for the trust reason that module states: a claimant's name,
// their itemised spending and an account code are client financial data about a named person, and
// `localStorage` would leave one member's half-typed claim on a shared machine after they closed
// the tab.

import {
  defaultDraftStorage,
  journalDraftKey,
  type DraftStorage,
  type JournalDraftScope,
} from "./journal-draft";
import {
  CLAIM_SETTLEMENTS,
  CLAIM_SOURCE_KINDS,
  emptyClaimDraft,
  emptyClaimItem,
  type ClaimDraft,
  type ClaimItemDraft,
} from "./staff-expense-claim";

export type StoredClaimDraft = {
  /** Minted when the draft STARTS. Stable across every edit and every resubmit of this same claim;
   *  a genuinely new intent gets a new one. */
  intentKey: string;
  draft: ClaimDraft;
  /** The OPTIONAL source document, or null. It rides the draft under the SAME key as the claim
   *  because it is part of the same intent: `clara._admit_accounting_work_core` compares the
   *  canonical source refs alongside the claim, so re-sending one intent key with a DIFFERENT
   *  document is a typed conflict rather than a replay. A draft written before this field existed
   *  reads as null — the attachment is genuinely optional (C1), so absence is a valid state and
   *  never a reason to discard the figures. */
  documentId?: string | null;
};

const KEY_PREFIX = "clara:staff-expense-claim-draft";

/** The storage key. Derived from `journalDraftKey` so the SCOPE RULE — user+firm+client, every part
 *  percent-encoded — has exactly one definition in the app; only the prefix is swapped. */
export function claimDraftKey(scope: JournalDraftScope): string {
  return journalDraftKey(scope).replace(/^clara:journal-draft/, KEY_PREFIX);
}

const isString = (v: unknown): v is string => typeof v === "string";
const isCents = (v: unknown): v is number => Number.isSafeInteger(v);

function parseItem(raw: unknown): ClaimItemDraft | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  for (const key of ["description", "expenseAccountCode", "suppliedTaxNote", "incurredDate", "pendingFact"] as const) {
    if (!isString(r[key])) return null;
  }
  // CENTS MUST BE A SAFE INTEGER EVEN COMING OUT OF STORAGE. A JSON payload can carry 12.5 or
  // "1200"; seeding a money field from either is the floating-point coercion this lane forbids.
  if (!isCents(r.amountCents)) return null;
  const item = emptyClaimItem();
  item.description = r.description as string;
  item.expenseAccountCode = r.expenseAccountCode as string;
  item.suppliedTaxNote = r.suppliedTaxNote as string;
  item.incurredDate = r.incurredDate as string;
  item.pendingFact = r.pendingFact as string;
  item.amountCents = r.amountCents as number;
  return item;
}

function parseDraft(raw: string): StoredClaimDraft | null {
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

  if (!CLAIM_SETTLEMENTS.includes(d.settlement as never)) return null;
  if (!CLAIM_SOURCE_KINDS.includes(d.sourceKind as never)) return null;
  const texts = [
    "claimantEnrolmentId", "claimantAccountCode", "claimantPersonLabel", "claimantAttestation",
    "claimantIdentifier", "instruction", "incurredDate", "postingDate",
    "payableAccountCode", "advanceAccountCode", "advanceId", "paymentAccountCode",
  ] as const;
  for (const key of texts) if (!isString(d[key])) return null;
  if (typeof d.claimantConfirmDedicated !== "boolean") return null;
  if (!Array.isArray(d.items) || d.items.length < 1) return null;
  const items: ClaimItemDraft[] = [];
  for (const one of d.items) {
    const item = parseItem(one);
    if (item === null) return null;
    items.push(item);
  }

  const draft: ClaimDraft = { ...emptyClaimDraft() };
  for (const key of texts) draft[key] = d[key] as string;
  draft.claimantConfirmDedicated = d.claimantConfirmDedicated;
  draft.settlement = d.settlement as ClaimDraft["settlement"];
  draft.sourceKind = d.sourceKind as ClaimDraft["sourceKind"];
  draft.items = items;

  return {
    intentKey: stored.intentKey,
    draft,
    // UNTRUSTED INPUT, like every other field here: a stored document id that is not a non-empty
    // string is DROPPED (the draft survives without it) rather than carried into a wire body the
    // admission door would refuse by name.
    documentId: isString(stored.documentId) && stored.documentId.trim() !== "" ? stored.documentId : null,
  };
}

/** The draft filed under this exact scope, or null. Never throws: a storage that refuses to be read
 *  is the same answer as an empty one. */
export function readClaimDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): StoredClaimDraft | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(claimDraftKey(scope));
  } catch {
    return null;
  }
  return raw === null ? null : parseDraft(raw);
}

/** Files the draft under this scope. Returns whether it was actually stored, so a caller can tell
 *  "saved" from "this browser does not keep it" rather than promising a reload recovery it cannot
 *  deliver (§3: "Do not promise reload recovery from memory-only state"). */
export function writeClaimDraft(
  scope: JournalDraftScope,
  draft: StoredClaimDraft,
  storage: DraftStorage | null = defaultDraftStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(claimDraftKey(scope), JSON.stringify(draft));
    return true;
  } catch {
    // A quota failure, or a browser refusing storage. The form keeps working.
    return false;
  }
}

/** Retires the draft — called ONLY after the runtime has answered 202, because until then the typed
 *  claim is the only copy that exists. */
export function clearClaimDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): void {
  if (storage === null) return;
  try {
    storage.removeItem(claimDraftKey(scope));
  } catch {
    // Nothing to recover from: the draft is being discarded either way.
  }
}
