// #655 — THE TRADE INVOICE A PREPARER TYPES, and everything that turns it into the one wire the
// runtime route takes.
//
// IT IS `lib/work/staff-expense-claim.ts`'s SHAPE, not a widening of it. That module asks for a
// CLAIM and the door derives the entry; this one asks for an INVOICE **and** its journal, because
// which expense account a supplier bill debits is a coding judgement no derivation can make. So the
// two share their mechanism — a draft type, a field-id vocabulary, a validator that returns issues
// in document order, and a server-path → control mapper — and differ in exactly that.
//
// THE BASIS HALF IS `lib/work/journal-basis.ts`'s, REUSED RATHER THAN RE-DERIVED. The lines are
// `JournalDraftLine`s, they are validated by `validateJournalDraft`, they are rendered by the
// shipped `JournalBasisFields`, and their refusals are mapped by that module's own
// `fieldForServerPath`. A second line vocabulary here would be a second set of rules about money.
//
// EVERY RULE THIS MODULE ADDS IS A MIRROR OF ONE MIGRATION 0225 ENFORCES, never a rule of its own.
// The database is the authority: `clara._assert_trade_invoice_basis` re-checks all of it at
// admission (the payload half before anything durable, the world half twice, the second time under
// the client rung) against the client's LIVE chart, the LIVE counterparty identity surface and the
// LIVE fiscal calendar. This is the earlier, more legible half, whose job is to put the message
// beside the control that caused it.
//
// AND NOTHING HERE INVENTS A FACT. The due date is the clearest case: the form carries what the
// document STATES and never computes a fallback, because the counterparty's agreed terms are a fact
// only the database holds (`clara.counterparties.payment_terms_days`). The door derives
// `stated → counterparty_terms → absent` and its answer is the one that is stored — which is why
// the 202 hands the derived basis back, and the surface renders what it was told rather than what
// it guessed.

import {
  isCalendarDate,
  totalsOf,
  validateJournalDraft,
  fieldForServerPath as fieldForBasisPath,
  type JournalDraftLine,
  type JournalFieldId,
  type JournalIssue,
} from "./journal-basis";

/** `clara.trade_invoices.kind`'s own CHECK. A credit note is NEITHER (#666/#662 own it, and the
 *  door refuses a credit-shaped payload BY NAME so the boundary is spoken rather than silent). */
export const TRADE_INVOICE_KINDS = ["sales_invoice", "supplier_bill"] as const;
export type TradeInvoiceKind = (typeof TRADE_INVOICE_KINDS)[number];

/** `clara.trade_invoices.due_date_source`'s own CHECK. `absent` is a first-class answer: a bill
 *  with no stated terms and a counterparty with none agreed HAS no due date, and inventing one
 *  would make every aging read lie. The browser may only ever assert two of the three. */
export const DUE_DATE_SOURCES = ["stated", "counterparty_terms", "absent"] as const;
export type DueDateSource = (typeof DUE_DATE_SOURCES)[number];

export const REFERENCE_MAX_CHARS = 64;
export const TAX_FACTS_MAX_CHARS = 2000;

/** Every control this form owns BEYOND the basis grid, in DOCUMENT ORDER — which is the order
 *  `firstInvalidTradeInvoiceField` walks, so focus lands on the first invalid control a reader
 *  would reach rather than the first one an object literal happens to list. */
export const TRADE_INVOICE_FIELDS = [
  "kind",
  "counterparty",
  "documentDate",
  "dueDate",
  "reference",
  "totalCents",
  "taxFacts",
] as const;
export type TradeInvoiceOwnFieldId = (typeof TRADE_INVOICE_FIELDS)[number];

/** Every control on the page: this form's own, plus the basis grid's. ONE vocabulary, so a rule
 *  cannot name a field the form does not render. */
export type TradeInvoiceFieldId = TradeInvoiceOwnFieldId | JournalFieldId;

export type TradeInvoiceIssue = { field: TradeInvoiceFieldId; code: string };

export type TradeInvoiceDraft = {
  kind: TradeInvoiceKind;
  /** The counterparty the preparer PICKED, or null while they are still searching. D12(a): the
   *  party is resolved at ADMISSION, so the form's job is to carry an id, never to create one. */
  counterpartyId: string | null;
  /** What they typed into the party search. Preserved across a no-results state and across a
   *  `party_ambiguous` refusal, so Clear is an action and not the only way back. */
  counterpartyQuery: string;
  documentDate: string;
  /** "" when the document states none — which the wire calls `absent`, and the door may still
   *  derive `counterparty_terms` from the party's agreed terms. */
  dueDate: string;
  reference: string;
  /** Exact sen. The house `MoneyInput` parses it; a float never exists here. */
  totalCents: number;
  /** Opaque, carried and echoed, validated against nothing — the #638 rule, restated in 0225. */
  taxFactsJson: string;
  postingDate: string;
  memo: string;
  lines: JournalDraftLine[];
};

export function emptyTradeInvoiceLine(): JournalDraftLine {
  return { account_code: "", debit_cents: 0, credit_cents: 0, description: "" };
}

export function emptyTradeInvoiceDraft(): TradeInvoiceDraft {
  return {
    kind: "supplier_bill",
    counterpartyId: null,
    counterpartyQuery: "",
    documentDate: "",
    dueDate: "",
    reference: "",
    totalCents: 0,
    taxFactsJson: "",
    postingDate: "",
    memo: "",
    lines: [emptyTradeInvoiceLine(), emptyTradeInvoiceLine()],
  };
}

/** The control account class a kind names. `sales_invoice` ⇒ receivable, `supplier_bill` ⇒
 *  payable — the same mapping 0225 section B step 4 makes, and `clara._tf_je_open_item_birth`
 *  turns into a domain. */
export function controlAccountClassFor(kind: TradeInvoiceKind): "receivable" | "payable" {
  return kind === "sales_invoice" ? "receivable" : "payable";
}

/** The subledger domain a kind names. */
export function domainFor(kind: TradeInvoiceKind): "ar" | "ap" {
  return kind === "sales_invoice" ? "ar" : "ap";
}

/** The counterparty kind a trade-invoice kind is recorded against. */
export function counterpartyKindFor(kind: TradeInvoiceKind): "vendor" | "customer" {
  return kind === "sales_invoice" ? "customer" : "vendor";
}

/** The tax facts, parsed. An empty box is null (there are none to carry); anything that is not a
 *  JSON object is an issue, because the column's own CHECK admits an object or NULL. */
export function parseTaxFacts(
  raw: string,
): { ok: true; value: Record<string, unknown> | null } | { ok: false } {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  try {
    const parsed: unknown = JSON.parse(s);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

/**
 * EVERY LOCAL RULE, in document order: this form's own first, then the basis grid's through the
 * composer's own validator. The codes are message keys; the ones that mirror a door refusal carry
 * the DOOR'S OWN TOKEN as their name, so a message rendered from a local issue and a message
 * rendered from the database's refusal are the same sentence.
 */
export function validateTradeInvoiceDraft(
  draft: TradeInvoiceDraft,
  knownAccountCodes: ReadonlySet<string> | null,
): TradeInvoiceIssue[] {
  const issues: TradeInvoiceIssue[] = [];

  if (draft.counterpartyId === null) issues.push({ field: "counterparty", code: "party_unresolved" });
  if (draft.documentDate.trim() === "") issues.push({ field: "documentDate", code: "documentDateRequired" });
  else if (!isCalendarDate(draft.documentDate)) issues.push({ field: "documentDate", code: "documentDateInvalid" });

  if (draft.dueDate.trim() !== "") {
    if (!isCalendarDate(draft.dueDate)) issues.push({ field: "dueDate", code: "invalid_due_date" });
    else if (isCalendarDate(draft.documentDate) && draft.dueDate < draft.documentDate) {
      issues.push({ field: "dueDate", code: "invalid_due_date" });
    }
  }
  if (draft.reference.trim().length > REFERENCE_MAX_CHARS) {
    issues.push({ field: "reference", code: "referenceTooLong" });
  }
  if (!Number.isSafeInteger(draft.totalCents) || draft.totalCents <= 0) {
    issues.push({ field: "totalCents", code: "invalid_total" });
  }
  if (draft.taxFactsJson.length > TAX_FACTS_MAX_CHARS) {
    issues.push({ field: "taxFacts", code: "taxFactsTooLong" });
  } else if (parseTaxFacts(draft.taxFactsJson).ok === false) {
    issues.push({ field: "taxFacts", code: "taxFactsNotAnObject" });
  }

  // THE BASIS, through the composer's OWN validator — one set of rules about money in this app.
  const basisIssues: JournalIssue[] = validateJournalDraft(
    { postingDate: draft.postingDate, memo: draft.memo, lines: draft.lines },
    knownAccountCodes,
  );
  for (const issue of basisIssues) issues.push({ field: issue.field, code: issue.code });

  // The stated total must at least be REACHABLE from the lines. The EXACT control-leg tie needs the
  // client's chart to know which account is the control account, and that is the door's answer
  // (`invalid_total`, with the measured control net beside it).
  const totals = totalsOf(draft.lines);
  if (totals.balanced && draft.totalCents > 0 && draft.totalCents > totals.debitCents) {
    issues.push({ field: "totalCents", code: "invalid_total" });
  }

  return issues;
}

/** The FIRST invalid control, in document order — what the form focuses on a refused submit. */
export function firstInvalidTradeInvoiceField(
  issues: readonly TradeInvoiceIssue[],
): TradeInvoiceFieldId | null {
  for (const field of TRADE_INVOICE_FIELDS) {
    if (issues.some((i) => i.field === field)) return field;
  }
  // …then whichever basis control the composer's own order names first.
  return issues.find((i) => !(TRADE_INVOICE_FIELDS as readonly string[]).includes(i.field))?.field ?? null;
}

/**
 * The DATABASE's own field path → THIS form's control. ONE mapper against ONE vocabulary (#634's
 * lesson, restated by #638): a second spelling is a mapper that is right half the time.
 *
 * The route emits every trade-invoice path under the single `invoice.` prefix; everything else is
 * the basis vocabulary, handed straight to the composer's own mapper so the 1-based line
 * arithmetic has exactly one definition in this app.
 */
export function fieldForServerPath(path: string | null | undefined): TradeInvoiceFieldId | null {
  if (!path) return null;
  const p = path.trim();
  if (p === "kind") return "kind";
  if (p === "invoice" || p.startsWith("invoice.counterparty")) return "counterparty";
  if (p === "invoice.document_date") return "documentDate";
  if (p === "invoice.due_date" || p === "invoice.due_date_source") return "dueDate";
  if (p === "invoice.reference") return "reference";
  if (p === "invoice.total_cents") return "totalCents";
  if (p === "invoice.tax_facts" || p === "invoice.currency") return "taxFacts";
  return fieldForBasisPath(p);
}

/** The WIRE the runtime route takes — camelCase, translated to the database's own spelling by
 *  `toDbTradeInvoice`. It sends BOTH halves because a trade invoice's journal is not derivable
 *  from its particulars. */
export type TradeInvoiceWire = {
  kind: TradeInvoiceKind;
  invoice: {
    counterparty: { id: string };
    documentDate: string;
    dueDate: string | null;
    dueDateSource: "stated" | "absent";
    reference: string | null;
    currency: "MYR";
    totalCents: number;
    taxFacts: Record<string, unknown> | null;
  };
  basis: {
    postingDate: string;
    memo: string;
    currency: "MYR";
    lines: Array<{ accountCode: string; debitCents: number; creditCents: number; description?: string }>;
  };
};

/**
 * THE DRAFT AS THE WIRE, built ONLY from a draft that has already validated clean — which is why
 * this returns null rather than a partially-shaped body when it has not. A wire body assembled from
 * an invalid draft is exactly how a UI ends up asking the database to refuse something it could
 * have caught.
 *
 * IT DECLARES ONLY `stated` OR `absent`, never `counterparty_terms`: only the database holds the
 * party's agreed terms, so a browser asserting that basis would be inventing a fact — and 0225, the
 * runtime route and `packages/runtime/lib/trade-invoice-basis.ts` all refuse exactly that claim.
 */
export function toTradeInvoiceWire(
  draft: TradeInvoiceDraft,
  knownAccountCodes: ReadonlySet<string> | null,
): TradeInvoiceWire | null {
  if (validateTradeInvoiceDraft(draft, knownAccountCodes).length > 0) return null;
  const facts = parseTaxFacts(draft.taxFactsJson);
  const due = draft.dueDate.trim() === "" ? null : draft.dueDate;
  return {
    kind: draft.kind,
    invoice: {
      counterparty: { id: draft.counterpartyId as string },
      documentDate: draft.documentDate,
      dueDate: due,
      dueDateSource: due === null ? "absent" : "stated",
      reference: draft.reference.trim() === "" ? null : draft.reference.trim(),
      currency: "MYR",
      totalCents: draft.totalCents,
      taxFacts: facts.ok ? facts.value : null,
    },
    basis: {
      postingDate: draft.postingDate,
      memo: draft.memo.trim(),
      currency: "MYR",
      lines: draft.lines.map((line) => {
        const description = (line.description ?? "").trim();
        return {
          accountCode: line.account_code.trim(),
          debitCents: line.debit_cents,
          creditCents: line.credit_cents,
          ...(description === "" ? {} : { description }),
        };
      }),
    },
  };
}
