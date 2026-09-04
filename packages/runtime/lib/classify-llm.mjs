// The document-classifier LLM helper (Wave A2.1, migration 0016 P3). A SMALL, non-frozen
// lib module (deliberately NOT under workflows/, so it stays off the freeze surface): given
// the stored OCR layout text of a document, it asks the model for a calibrated {kind,
// confidence, rationale} against the EXISTING 18-value document-kind vocabulary. The DB owns
// every downstream effect (classify_document): a >=0.8 verdict sets the kind + emits
// document.classified; a <0.8 verdict leaves the kind NULL + opens a human review question.
// So the model's job is HONEST calibration, never a confident guess.
//
// The resolveModel idiom is IDENTICAL to chatTurn.v5.infra.ts / autoDraft.v1.infra.ts (the
// SAME globalThis.__claraModelForTest override name) so ONE mock arms every model lane and
// the tests never hit the network.

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

/** Kinds classify_document REFUSES outright, whatever the model says. 'consent_evidence' is a
 *  legal artifact owned by the egress-consent path: 0016 raises CLR28 unconditionally for it.
 *  A refused kind is a DETERMINISTIC settle failure — the task would be left running, requeued
 *  by the stranded path, and re-classified to the same refused verdict forever (~144 model
 *  calls/day per poisoned document). So the classifier must never offer one. Pinned here and
 *  asserted against CLASSIFY_KINDS in the tests, so a future kind addition cannot silently
 *  reintroduce the loop. */
export const DB_REFUSED_KINDS = Object.freeze(["consent_evidence"]);

/** The document-kind vocabulary the classifier may return — the 0016 classify_document CHECK
 *  (L3202-3207) MINUS DB_REFUSED_KINDS. NO new values. */
export const CLASSIFY_KINDS = Object.freeze([
  "invoice",
  "receipt",
  "credit_note",
  "debit_note",
  "bank_statement",
  "payment_voucher",
  "claim_form",
  "payroll_summary",
  "tax_correspondence",
  "ssm_company_doc",
  "agreement_contract",
  "e_invoice_xml",
  "management_account",
  "opening_balance_doc",
  "knowledge_artifact",
  "handwritten_note",
  "other",
]);

const schema = z.object({
  kind: z.enum(CLASSIFY_KINDS),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

// One-line definitions per kind — Malaysian accounting-firm document types. The
// payroll_summary-vs-invoice distinction is the headline failure mode and is drawn sharply:
// an invoice bills ONE counterparty for goods/services; a payroll summary lists MANY
// employees with statutory deduction columns (EPF/SOCSO/EIS/PCB).
const SYSTEM_PROMPT = [
  "You are a document-type classifier for a Malaysian accounting firm. You are given the",
  "OCR layout text of ONE document. Classify it into exactly one of these kinds:",
  "",
  "- invoice: a seller's demand for payment for goods/services (a tax invoice) — line items,",
  "  unit prices, a total amount due, an invoice number, and ONE buyer and ONE seller.",
  "- receipt: proof a payment was RECEIVED/made ('received with thanks', paid stamp, amount",
  "  tendered); it settles a prior charge rather than demanding payment.",
  "- credit_note: a seller-issued REDUCTION of a prior invoice (return, overcharge, discount),",
  "  referencing the original invoice.",
  "- debit_note: an upward adjustment INCREASING a prior invoice/charge, referencing the original.",
  "- bank_statement: a bank's periodic account statement — a named financial institution's",
  "  letterhead, an account number in the header, dated transaction rows, and a RUNNING or",
  "  CLOSING BALANCE.",
  "  CRITICAL: a bank statement is NEVER a management_account and NEVER an opening_balance_doc.",
  "  The discriminators, which survive OCR flattening even when the columns collapse into a wall",
  "  of numbers: (1) a named BANK or financial institution on the page — Maybank, CIMB, Public",
  "  Bank, RHB, Hong Leong, AmBank, Alliance, Bank Islam, OCBC, UOB, HSBC, Standard Chartered,",
  "  Affin, MBSB, Agrobank, BSN; (2) an ACCOUNT NUMBER, often 10-16 digits, near the header;",
  "  (3) rows each carrying a DATE and a BALANCE — a per-row running balance chain is the single",
  "  strongest signal, and no management account has one; (4) Malay statement vocabulary:",
  "  'PENYATA AKAUN', 'TARIKH PENYATA', 'NOMBOR AKAUN', 'BAKI', 'BAKI AKHIR', 'DEBIT', 'KREDIT',",
  "  'URUSNIAGA'. A management_account instead lists ACCOUNT NAMES with amounts and has NO",
  "  per-row date and NO per-row balance chain; an opening_balance_doc states brought-forward",
  "  balances at a single date, with no transaction rows at all.",
  "  A statement that prints a STATEMENT DATE but no from-to period is still a bank_statement —",
  "  many Malaysian banks print only 'TARIKH PENYATA / STATEMENT DATE'. Missing period bounds",
  "  are NOT a reason to answer 'other'.",
  "- payment_voucher: an INTERNAL authorization to pay (cheque/transfer requisition) — payee,",
  "  amount, approval signatures; the firm's own disbursement record, NOT a supplier's invoice.",
  "- claim_form: an employee expense-reimbursement claim — claimant, itemized expenses, a claim total.",
  "- payroll_summary: a salary/payroll RUN for EMPLOYEES — MANY employees listed with gross",
  "  salary and statutory deduction columns (EPF, SOCSO, EIS, PCB) and net pay for a month.",
  "  It is the firm's own staff-cost schedule, NOT a demand for payment to a third party.",
  "  CRITICAL: a payroll summary is NEVER an invoice — an invoice bills ONE counterparty for",
  "  goods/services; a payroll summary lists MANY employees with EPF/SOCSO/EIS deduction columns.",
  "- tax_correspondence: a letter/notice to or from LHDN (Inland Revenue) or RMCD (Customs/SST)",
  "  — assessment, reminder, refund, registration notice, with a tax reference number.",
  "- ssm_company_doc: a Companies Commission of Malaysia (SSM) document — incorporation",
  "  (Section 14/17, Form 9), Form 24/49, annual return, superform, a company registration number.",
  "- agreement_contract: a signed agreement/contract — tenancy, service, loan, or employment;",
  "  clauses, named parties, signatures, effective dates.",
  "- e_invoice_xml: a MyInvois/LHDN structured e-invoice (UBL) rendering — a validation link/QR",
  "  or a MyInvois UUID (raw XML is rule-routed elsewhere; a printed rendering may surface here).",
  "- management_account: internal financial statements — a profit & loss, balance sheet, or",
  "  trial balance for a period; account names with amounts, no external counterparty.",
  "- opening_balance_doc: a document establishing opening/brought-forward balances at onboarding",
  "  (a prior-period trial balance or balance sheet used to seed the books).",
  "- knowledge_artifact: a reference/policy/guide/SOP/checklist note — not a transactional or",
  "  statutory record.",
  "- handwritten_note: a handwritten/scribbled informal note or memo, not a structured form.",
  "- other: none of the above, or you genuinely cannot tell.",
  "",
  "A consent / permission / authorisation artifact (evidence a client authorised the firm to",
  "act) is NOT one of the kinds above — a separate consent path owns those documents. Answer",
  "'other' for one; never try to label it.",
  "",
  "",
  "EXAMPLES (OCR layout text, flattened and noisy, as you will receive it):",
  "",
  "<example>",
  "PENYATA AKAUN / STATEMENT OF ACCOUNT",
  "NOMBOR AKAUN 514487003061 TARIKH PENYATA / STATEMENT DATE : 30/06/25",
  "TARIKH URUSNIAGA DEBIT KREDIT BAKI",
  "02/06 IBG TRANSFER 1,250.00 48,110.22",
  "07/06 CHEQUE DEPOSIT 3,000.00 51,110.22",
  "BAKI AKHIR 51,110.22",
  "answer: bank_statement, confidence 0.95",
  "</example>",
  "",
  "<example>",
  "STATEMENT OF ACCOUNT 12345678901234 01 APR 2025 - 30 APR 2025",
  "DATE DESCRIPTION WITHDRAWAL DEPOSIT BALANCE",
  "03 APR SALARY CR 8 200 00 19 447 63",
  "11 APR DUITNOW 450 00 18 997 63",
  "(columns garbled, several rows unreadable)",
  "answer: bank_statement, confidence 0.88  (a named account number, dated rows and a running",
  "balance chain are legible; noisy columns do NOT make this 'other')",
  "</example>",
  "",
  "<example>",
  "MANAGEMENT ACCOUNTS FOR THE YEAR ENDED 31 DECEMBER 2025",
  "STATEMENT OF FINANCIAL POSITION",
  "Property, plant and equipment 412,880",
  "Trade receivables 96,441",
  "Cash and bank balances 51,110",
  "answer: management_account, confidence 0.93  (account NAMES with amounts; no per-row date,",
  "no running balance chain)",
  "</example>",
  "",
  "Report an HONEST, calibrated confidence in [0,1]. If you are uncertain, report a confidence",
  "BELOW 0.8 — a low-confidence document is routed to a human for review, which is the correct,",
  "safe outcome. NEVER inflate confidence to force a verdict.",
  "The text is OCR layout text and may be TRUNCATED or noisy. NOISE IS NOT UNCERTAINTY: judge on",
  "the discriminators that ARE legible, not on how much of the page is unreadable. If a document",
  "carries a legible institution name and a balance column, it is a bank_statement at 0.85 or",
  "above even when half its rows are garbled. Answer 'other' only when the LEGIBLE content fits",
  "no kind above — never merely because the scan is poor.",
].join("\n");

/** The prompt text, exported so a measurement harness can stamp its sha256 on every run.
 *  A prompt change is otherwise provenance-invisible — see scripts/measure-classify-recall.mjs
 *  and the engine-id note in lib/classify.mjs. */
export { SYSTEM_PROMPT };

const MAX_TEXT_CHARS = 24000;
// A bounded provider call. runClassifyCycle awaits its tasks SEQUENTIALLY and the loop's
// stop() awaits that same promise, so an un-timed-out hung request would stall the whole lane
// AND block graceful shutdown until a force-kill. Finite-guarded (the leader.mjs idiom): junk
// or non-positive falls back to 60s — a NaN here would mean no timeout at all.
const TIMEOUT_MS_ENV = Number(process.env.CLARA_CLASSIFY_LLM_TIMEOUT_MS);
const TIMEOUT_MS = Number.isFinite(TIMEOUT_MS_ENV) && TIMEOUT_MS_ENV > 0 ? TIMEOUT_MS_ENV : 60_000;

function resolveModel(modelId) {
  const override = globalThis.__claraModelForTest;
  return override ?? openai(modelId);
}

/**
 * Classify one document's OCR layout text into {kind, confidence, rationale}. `text` is the
 * concatenated region text in reading order; it is capped at ~24k chars (with a truncation
 * note to the model). Deterministic in tests via the __claraModelForTest override.
 * `systemOverride` is a MEASUREMENT SEAM and nothing else: `scripts/measure-classify-recall.mjs`
 * replays a stored input set through the BASELINE prompt and the current one in a single run, so
 * the delta is measured on identical input rather than asserted. No production call site passes
 * it — `lib/classify.mjs` calls this function with `{text, modelId}` only, and a cell pins that.
 * @param {{text:string, modelId:string, timeoutMs?:number, abortSignal?:AbortSignal, systemOverride?:string}} args
 * @returns {Promise<{kind:string, confidence:number, rationale:string}>}
 */
export async function classifyDocumentText({ text, modelId, timeoutMs, abortSignal, systemOverride }) {
  const truncated = String(text ?? "").length > MAX_TEXT_CHARS;
  const body = String(text ?? "").slice(0, MAX_TEXT_CHARS);
  const prompt = [
    truncated ? "(NOTE: the OCR layout text below is TRUNCATED — classify from the legible portion.)" : "",
    "<document_ocr_text>",
    body,
    "</document_ocr_text>",
  ]
    .filter(Boolean)
    .join("\n");
  // The timeout aborts the provider request itself (not just our await), and a caller-supplied
  // signal (the loop's stop path) composes with it — so a shutdown cancels an in-flight call
  // instead of waiting out the full timeout.
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : TIMEOUT_MS;
  const timer = AbortSignal.timeout(budget);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timer]) : timer;
  const system = typeof systemOverride === "string" && systemOverride.length > 0 ? systemOverride : SYSTEM_PROMPT;
  const { object } = await generateObject({ model: resolveModel(modelId), schema, system, prompt, abortSignal: signal });
  return object;
}
