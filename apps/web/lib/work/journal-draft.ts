// THE UNSENT JOURNAL DRAFT, and the intent identity that travels with it.
//
// The refresh spec's shared control contract (§3, "Draft across local view
// changes") asks for three things at once, and this module exists because they
// are one mechanism rather than three:
//
//   1. PRESERVE unsent input under the SAME user / firm / client. A reload
//      restores what was typed; a tab switch never loses it.
//   2. A SCOPE CHANGE NEVER TRANSFERS A DRAFT INTO A DIFFERENT CLIENT. Not
//      "clears it on switch" — that would lose work the human may come back to.
//      The draft is FILED under its own scope, so client B simply has no draft
//      of client A's to find, and returning to A still finds it.
//   3. The LOST-RESPONSE resolution (§3, "Lost response": "Same operation
//      identity for retries; new intent gets a new identity"). The `intentKey`
//      is minted ONCE, when a draft starts, and is stored WITH the draft — so a
//      resubmit after a lost acknowledgement carries the identity the database
//      already knows and resolves to the original Work instead of admitting a
//      second one. That is why the key lives here and not in component state: a
//      value that dies with a re-render cannot be an identity.
//
// `sessionStorage`, NOT `localStorage`, and the choice is about the trust
// boundary rather than about lifetime. A journal basis is client financial data;
// `localStorage` outlives the browsing session and would leave one member's
// half-typed entry on a shared machine after they closed the tab. `sessionStorage`
// is per-tab and dies with it, which is the same lifetime the session cookie has.
//
// EVERY READ IS UNTRUSTED. What comes back is a string a previous version of this
// app wrote, that a human could have edited, and that may be from a build with a
// different shape. So `readJournalDraft` parses defensively and returns `null` on
// anything it does not fully recognise — a half-understood draft is worse than
// none, because it would seed a form with figures nobody typed.

import type { JournalDraftInput, JournalDraftLine } from "./journal-basis";

/** WHO the draft belongs to. All three parts are required: a key missing any of
 *  them could collide across members on one machine or across clients in one
 *  session, which are the two failures this shape exists to prevent. */
export type JournalDraftScope = {
  userId: string;
  firmId: string;
  clientId: string;
};

export type StoredJournalDraft = JournalDraftInput & {
  /** Minted when the draft STARTS. Stable across every edit and every resubmit
   *  of these same figures; a genuinely new intent gets a new one. */
  intentKey: string;
};

/** The `Storage` surface this module needs — declared rather than imported so a
 *  node cell can hand in a plain Map-backed stub, and so nothing here has to
 *  pretend `window` exists. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY_PREFIX = "clara:journal-draft";

/**
 * The storage key. Reading it is the whole scope rule — there is no runtime
 * comparison of "is this draft mine", because a draft filed under another
 * user, firm or client is at another key and is simply never found.
 *
 * Every part is percent-encoded: they are uuids today, but a key builder that
 * trusts its input is how a value containing the separator merges two scopes.
 */
export function journalDraftKey(scope: JournalDraftScope): string {
  return [
    KEY_PREFIX,
    encodeURIComponent(scope.userId),
    encodeURIComponent(scope.firmId),
    encodeURIComponent(scope.clientId),
  ].join(":");
}

/** `sessionStorage`, when there is one. Returns null under SSR, and null when
 *  the browser refuses storage outright (Safari private mode throws on ACCESS,
 *  not only on write) — a composer without persistence still works; a composer
 *  that throws on mount does not. */
export function defaultDraftStorage(): DraftStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** A fresh intent identity. `crypto.randomUUID` is the same primitive the
 *  journals lane already mints op keys with. */
export function newIntentKey(): string {
  return crypto.randomUUID();
}

function isLine(value: unknown): value is JournalDraftLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  if (typeof line.account_code !== "string") return false;
  // CENTS MUST BE SAFE INTEGERS EVEN COMING OUT OF STORAGE. A JSON payload can
  // carry 12.5 or "1200"; seeding a money field from either is the
  // floating-point coercion hard constraint 2 forbids outright.
  if (!Number.isSafeInteger(line.debit_cents) || !Number.isSafeInteger(line.credit_cents)) return false;
  if (line.description !== undefined && line.description !== null && typeof line.description !== "string") return false;
  return true;
}

function parseDraft(raw: string): StoredJournalDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const draft = parsed as Record<string, unknown>;
  if (typeof draft.intentKey !== "string" || draft.intentKey.trim() === "") return null;
  if (typeof draft.postingDate !== "string" || typeof draft.memo !== "string") return null;
  if (!Array.isArray(draft.lines) || !draft.lines.every(isLine)) return null;
  return {
    intentKey: draft.intentKey,
    postingDate: draft.postingDate,
    memo: draft.memo,
    lines: draft.lines.map((line) => ({
      account_code: line.account_code,
      debit_cents: line.debit_cents,
      credit_cents: line.credit_cents,
      description: typeof line.description === "string" ? line.description : "",
    })),
  };
}

/** The draft filed under this exact scope, or null. Never throws: a storage that
 *  refuses to be read is the same answer as an empty one. */
export function readJournalDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): StoredJournalDraft | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(journalDraftKey(scope));
  } catch {
    return null;
  }
  return raw === null ? null : parseDraft(raw);
}

/** Files the draft under this scope. Returns whether it was actually stored, so
 *  a caller can tell "saved" from "this browser does not keep it" rather than
 *  promising a reload recovery it cannot deliver (§3: "Do not promise reload
 *  recovery from memory-only state"). */
export function writeJournalDraft(
  scope: JournalDraftScope,
  draft: StoredJournalDraft,
  storage: DraftStorage | null = defaultDraftStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(journalDraftKey(scope), JSON.stringify(draft));
    return true;
  } catch {
    // A quota failure, or a browser refusing storage. The form keeps working.
    return false;
  }
}

/** Retires the draft — called ONLY after the runtime has answered 202, because
 *  until then the typed figures are the only copy that exists. */
export function clearJournalDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): void {
  if (storage === null) return;
  try {
    storage.removeItem(journalDraftKey(scope));
  } catch {
    // Nothing to recover from: the draft is being discarded either way.
  }
}

/** Two blank lines — the smallest shape a balanced entry can take, so the form
 *  opens with the debit and the credit a human is about to type rather than with
 *  an "add a line" button they have to press twice. */
export function emptyDraftLines(): JournalDraftLine[] {
  return [
    { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
    { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
  ];
}

/**
 * A draft seeded from a refused Work's own basis — the "Edit as new draft"
 * route out of the Work detail.
 *
 * IT MINTS A NEW `intentKey`, AND THAT IS THE POINT rather than an
 * implementation detail. §3 draws the line exactly here: "Same operation
 * identity for retries; NEW INTENT GETS A NEW IDENTITY". Retrying the SAME
 * figures is `/retry` on the same Work (same logical operation, same receipt).
 * Editing them into different figures is a DIFFERENT economic intent, and
 * carrying the old key would make the database answer `intent_payload_conflict`
 * to a human who did exactly what the button told them to.
 */
export function draftFromBasis(basis: {
  posting_date: string;
  memo: string;
  lines: ReadonlyArray<{ account_code: string; debit_cents: number; credit_cents: number; description?: string | null }>;
}): StoredJournalDraft {
  return {
    intentKey: newIntentKey(),
    postingDate: basis.posting_date,
    memo: basis.memo,
    lines: basis.lines.map((line) => ({
      account_code: line.account_code,
      debit_cents: Number.isSafeInteger(line.debit_cents) ? line.debit_cents : 0,
      credit_cents: Number.isSafeInteger(line.credit_cents) ? line.credit_cents : 0,
      description: line.description ?? "",
    })),
  };
}
