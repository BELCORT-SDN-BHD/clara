// #655 — THE UNSENT TRADE-INVOICE DRAFT, and the intent identity that travels with it.
//
// IT IS `lib/work/journal-draft.ts`'s MECHANISM, REUSED — the scope key shape, the storage surface,
// the intent-key lifecycle and the "every read is untrusted" posture are that module's and are
// imported from it, not re-derived. What differs is exactly two things, and both are forced:
//
//   THE KEY PREFIX. A trade invoice, a staff expense claim, a periodic adjustment and a journal
//   entry are different intents with different payloads; filed under one key, opening one form
//   would seed it with another's draft and a restore would fail its own parser.
//   `clara:trade-invoice-draft` keeps them apart under the same user+firm+client scoping — which is
//   what stops a draft crossing into another client's books, exactly as it does there.
//
//   THE PARSER. It reads a WHOLE `TradeInvoiceDraft`, including the party the preparer picked, the
//   query they typed to find them, and the basis lines. Every field is validated field-by-field and
//   anything not fully recognised returns null: a half-understood draft is worse than none, because
//   it would seed a form with figures nobody typed.
//
// `sessionStorage`, NOT `localStorage`, for the trust reason that module states: a supplier's name,
// a document number and an exact amount are client financial data, and `localStorage` would leave
// one member's half-typed bill on a shared machine after they closed the tab.

import {
  defaultDraftStorage,
  journalDraftKey,
  type DraftStorage,
  type JournalDraftScope,
} from "./journal-draft";
import {
  TRADE_INVOICE_KINDS,
  emptyTradeInvoiceDraft,
  emptyTradeInvoiceLine,
  type TradeInvoiceDraft,
  type TradeInvoiceKind,
} from "./trade-invoice";

export type StoredTradeInvoiceDraft = {
  /** Minted when the draft STARTS. Stable across every edit and every resubmit of this same
   *  invoice; a genuinely new intent gets a new one. */
  intentKey: string;
  draft: TradeInvoiceDraft;
  /** The OPTIONAL cited document, or null. It rides the draft under the SAME key as the invoice
   *  because it is part of the same intent: `clara._admit_accounting_work_core` compares the
   *  canonical source refs alongside the particulars, so re-sending one intent key with a DIFFERENT
   *  document is a typed conflict rather than a replay. A draft written before this field existed
   *  reads as null — a chat- or UI-stated invoice with no attachment is lawful (AC3), so absence is
   *  a valid state and never a reason to discard the figures. */
  documentId?: string | null;
};

const KEY_PREFIX = "clara:trade-invoice-draft";

/** The storage key. Derived from `journalDraftKey` so the SCOPE RULE — user+firm+client, every part
 *  percent-encoded — has exactly one definition in the app; only the prefix is swapped. */
export function tradeInvoiceDraftKey(scope: JournalDraftScope): string {
  return journalDraftKey(scope).replace(/^clara:journal-draft/, KEY_PREFIX);
}

const isString = (v: unknown): v is string => typeof v === "string";
// EXACT INTEGERS ONLY. A draft restored from session storage is untrusted input like any other
// persisted payload, and a non-integer cent is a wrong ledger — so it is REJECTED, never rounded.
const isInteger = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

function parseLines(raw: unknown): TradeInvoiceDraft["lines"] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: TradeInvoiceDraft["lines"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const l = item as Record<string, unknown>;
    if (!isString(l.account_code)) return null;
    if (!isInteger(l.debit_cents) || !isInteger(l.credit_cents)) return null;
    if (l.description !== null && l.description !== undefined && !isString(l.description)) return null;
    out.push({
      account_code: l.account_code,
      debit_cents: l.debit_cents,
      credit_cents: l.credit_cents,
      description: (l.description ?? "") as string,
    });
  }
  return out;
}

function parseDraft(raw: unknown): TradeInvoiceDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (!isString(d.kind) || !(TRADE_INVOICE_KINDS as readonly string[]).includes(d.kind)) return null;
  if (d.counterpartyId !== null && !isString(d.counterpartyId)) return null;
  for (const key of ["counterpartyQuery", "documentDate", "dueDate", "reference",
    "postingDate", "memo", "taxFactsJson"]) {
    if (!isString(d[key])) return null;
  }
  if (!isInteger(d.totalCents)) return null;
  const lines = parseLines(d.lines);
  if (lines === null) return null;
  return {
    kind: d.kind as TradeInvoiceKind,
    counterpartyId: d.counterpartyId as string | null,
    counterpartyQuery: d.counterpartyQuery as string,
    documentDate: d.documentDate as string,
    dueDate: d.dueDate as string,
    reference: d.reference as string,
    totalCents: d.totalCents as number,
    postingDate: d.postingDate as string,
    memo: d.memo as string,
    lines: lines.length >= 2 ? lines : [...lines, emptyTradeInvoiceLine()],
    taxFactsJson: d.taxFactsJson as string,
  };
}

/** Read the draft for this scope, or null. EVERY read is untrusted: a browser's session storage is
 *  writable by anything that ran in this origin, so a value that is not fully understood is
 *  discarded rather than partially trusted. */
export function readTradeInvoiceDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): StoredTradeInvoiceDraft | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(tradeInvoiceDraftKey(scope));
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const box = parsed as Record<string, unknown>;
  if (!isString(box.intentKey) || box.intentKey.trim() === "") return null;
  const draft = parseDraft(box.draft);
  if (draft === null) return null;
  const documentId = box.documentId === undefined || box.documentId === null
    ? null
    : (isString(box.documentId) ? box.documentId : undefined);
  if (documentId === undefined) return null;
  return { intentKey: box.intentKey, draft, documentId };
}

export function writeTradeInvoiceDraft(
  scope: JournalDraftScope,
  value: StoredTradeInvoiceDraft,
  storage: DraftStorage | null = defaultDraftStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(tradeInvoiceDraftKey(scope), JSON.stringify({
      intentKey: value.intentKey,
      draft: value.draft,
      documentId: value.documentId ?? null,
    }));
  } catch {
    /* a full or blocked store is not a reason to lose the form the person is looking at */
  }
}

export function clearTradeInvoiceDraft(
  scope: JournalDraftScope,
  storage: DraftStorage | null = defaultDraftStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(tradeInvoiceDraftKey(scope));
  } catch {
    /* nothing to do */
  }
}

/** A fresh draft box for a scope that has none. Exported so the form and its tests mint one the
 *  same way. */
export function newTradeInvoiceDraftBox(intentKey: string): StoredTradeInvoiceDraft {
  return { intentKey, draft: emptyTradeInvoiceDraft(), documentId: null };
}
