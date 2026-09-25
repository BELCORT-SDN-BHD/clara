// #982 + #1007 — THE TRADE-INVOICE CARRIER'S SUCCESSOR, for the 2026-09-25 cut.
//
// WHY A NEW FILE. `lib/trade-invoice-basis.ts` entered the frozen closure the moment
// `chatTurn.v21.tools.ts` imported it (`frozen-workflows.json`), and its own header states the
// consequence: "A change to a rule here after that point is a change to a deployed body: it ships
// as a NEW module beside this one, wired by a NEW chatTurn version." This is that module. The
// predecessor is BYTE-UNTOUCHED and every symbol that did not change is reached from it by
// reference rather than re-spelled, so the text a reader of either name is reading is one value.
//
// TWO CONTRACTS, APPLIED IN ORDER (CUT-PLAN §1.10):
//
//   A1 · #982 — the TIN RESOLVES A PARTY, at the registration number's own tier (migration 0274).
//        Only `tin`'s `.describe()` moves, because the v1 sentence ("it is not a lookup key") is
//        now false, and the map gains `party_identifier_conflict`.
//
//   A2 · #1007 — a look-alike is a QUESTION IN THE TURN, never a refusal (the owner's ruling). The
//        tool probes before it admits; a match comes back with the figures and the model asks; the
//        person's "record it anyway" is carried by ONE tool-local flag, and the acknowledgement is
//        written under the SAME intent key BEFORE the admission. The map gains
//        `nothing_acknowledged` and `unknown_acknowledged_invoice`.
//
// THE TOKEN COUNT IS THE TRAP THE CUT PLAN NAMES. #982 says "eighteen → nineteen" and #1007 says
// "eighteen → twenty", each counting from the SAME base. Applied together the map holds
// TWENTY-ONE, and the prompt stanza must say twenty-one.
//
// WHY THE FLAG RATHER THAN A LIST OF IDS. #1007's contract hands `p_shown` "the shown invoice ids".
// Those ids are the TOOL's own measurement — they come out of the probe the tool just ran — so
// asking the model to echo them back would let a model name a row nobody checked, and would put a
// uuid it invented into a durable acknowledgement. `record_anyway` is therefore the whole of the
// model's contribution, exactly as #931's `allocations_confirmed` is, and it never reaches the
// wire: `tradeInvoiceFromInput` below IS v1's function, and the particulars the probe sees are the
// particulars the door receives (`wave3-lane02-fix.md` amendment 1).

import { z } from "zod";
import {
  TRADE_INVOICE_REFUSALS,
  startTradeInvoiceWorkInputSchema,
  tradeInvoicePartySchema,
} from "./trade-invoice-basis.js";

// Every unchanged predecessor symbol is REACHED BY REFERENCE. The frozen module is the one place
// these rules are written; re-spelling one here would be a second copy that can drift.
export {
  BASIS_ORIGINS,
  DUE_DATE_SOURCES,
  LINE_DESCRIPTION_MAX_CHARS,
  MEMO_MAX_CHARS,
  REFERENCE_MAX_CHARS,
  START_TRADE_INVOICE_WORK_TOOL,
  TRADE_INVOICE_KINDS,
  TRADE_INVOICE_REFUSALS,
  basisFromTradeInvoice,
  isTradeInvoiceRefusal,
  journalBasisFromInput,
  localTradeInvoiceRefusal,
  tradeInvoiceFromInput,
  tradeInvoiceLineSchema,
  tradeInvoicePartySchema,
  startTradeInvoiceWorkInputSchema,
} from "./trade-invoice-basis.js";
export type {
  DueDateSource,
  StartTradeInvoiceWorkInput,
  TradeInvoiceKind,
  TradeInvoiceParty,
  TradeInvoiceRefusal,
  TradeInvoiceRefusalReason,
} from "./trade-invoice-basis.js";

/**
 * A1 · #982 — THE PARTY, with the TIN at the registration number's own tier.
 *
 * Only `tin` changes. The other three keys are the frozen schema's own, lifted from it rather than
 * re-typed, so a reader comparing the two files sees exactly one difference.
 */
export const tradeInvoicePartySchemaV2 = z
  .object({
    id: tradeInvoicePartySchema.shape.id,
    name: tradeInvoicePartySchema.shape.name,
    registration_no: tradeInvoicePartySchema.shape.registration_no,
    tin: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "The tax identification number the document states, if it states one. IT RESOLVES THE "
        + "PARTY, at the same tier as the registration number (migration 0274): the door matches "
        + "it against this client's live counterparties of the required kind, after normalising "
        + "both sides the way a registration number is normalised. A payload whose only "
        + "identifier is a TIN resolves when exactly one live party holds it; several holders "
        + "leave as party_ambiguous with the candidates, and a TIN and a registration number "
        + "naming different live parties leave as party_identifier_conflict with both.",
      ),
  })
  .strict();

/**
 * A2 · #1007 — THE INPUT, with the one tool-local flag the question needs.
 *
 * Everything else is the frozen schema's own shape, carried by reference. `record_anyway` is NOT
 * put on the wire (see this file's header) and it is not a fact about the invoice: it records that
 * a PERSON was shown what this client already holds and said to record it anyway.
 */
export const startTradeInvoiceWorkInputSchemaV2 = z
  .object({
    kind: startTradeInvoiceWorkInputSchema.shape.kind,
    counterparty: tradeInvoicePartySchemaV2,
    document_date: startTradeInvoiceWorkInputSchema.shape.document_date,
    due_date: startTradeInvoiceWorkInputSchema.shape.due_date,
    due_date_source: startTradeInvoiceWorkInputSchema.shape.due_date_source,
    reference: startTradeInvoiceWorkInputSchema.shape.reference,
    currency: startTradeInvoiceWorkInputSchema.shape.currency,
    total_cents: startTradeInvoiceWorkInputSchema.shape.total_cents,
    tax_facts: startTradeInvoiceWorkInputSchema.shape.tax_facts,
    posting_date: startTradeInvoiceWorkInputSchema.shape.posting_date,
    memo: startTradeInvoiceWorkInputSchema.shape.memo,
    lines: startTradeInvoiceWorkInputSchema.shape.lines,
    document_id: startTradeInvoiceWorkInputSchema.shape.document_id,
    basis_origin: startTradeInvoiceWorkInputSchema.shape.basis_origin,
    record_anyway: z
      .boolean()
      .optional()
      .describe(
        "true ONLY after Clara showed the human a document this client already holds that looks "
        + "like this one, and they said to record it anyway. Never set it on your own initiative, "
        + "and never set it on a first attempt: leaving it out is what makes Clara look.",
      ),
  })
  .strict();

export type StartTradeInvoiceWorkInputV2 = z.infer<typeof startTradeInvoiceWorkInputSchemaV2>;

/**
 * THE REFUSAL MAP, TWENTY-ONE TOKENS. The eighteen predecessors are the frozen map's own values,
 * spread in by reference rather than re-typed — `party_ambiguous` in particular is NOT reworded,
 * because the door now raises it for a TIN as well as for a name and one reason still names one
 * thing.
 *
 * The three new sentences are the ones `apps/web/messages/en.json` already ships under
 * `TradeInvoice.refusals`, byte for byte, because the estate's own rule is that these strings are
 * the SAME in the migration, in this module and in the stanza.
 */
// NO OBJECT SPREAD ANYWHERE IN THIS FILE — the predecessor's own rule, for the same reason:
// `packages/runtime/scripts/check-parts-parity.mjs` refuses a spread in any module it walks
// ("unclassifiable object spread"), and this module enters that walk the moment `chatTurn_v22`
// imports it. The eighteen are copied key by key, from the frozen map's own values.
function refusalsV2(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [reason, sentence] of Object.entries(TRADE_INVOICE_REFUSALS)) out[reason] = sentence;
  // A1 · #982 — 0274's own reason. NEVER collapsed into `party_ambiguous`: "more than one party
  // answers to that name" and "two identifiers on one document name two parties" are different
  // facts and send a person to different places.
  out.party_identifier_conflict =
    "The registration number and the tax identification number on this document name two "
    + "different parties. Say which one it is.";
  // A2 · #1007 — both are CALLER faults rather than things a person can fix by retyping, which is
  // why one sentence serves both.
  out.nothing_acknowledged =
    "Clara could not record which earlier document you were shown. Try recording it again.";
  out.unknown_acknowledged_invoice =
    "Clara could not record which earlier document you were shown. Try recording it again.";
  return out;
}

export const TRADE_INVOICE_REFUSALS_V2: Readonly<Record<string, string>> = Object.freeze(refusalsV2());

/** True when `reason` is one THIS cut's doors actually raise. */
export function isTradeInvoiceRefusalV2(reason: string): boolean {
  return Object.prototype.hasOwnProperty.call(TRADE_INVOICE_REFUSALS_V2, reason);
}

/** One row of `clara.probe_trade_invoice_duplicates_for`'s answer, as the door writes it. */
export type TradeInvoiceDuplicateMatch = {
  invoice_id: string;
  work_id: string | null;
  signals: string[];
  reference: string | null;
  document_date: string | null;
  total_cents: number | null;
  state: string | null;
  entry_id: string | null;
  recorded_by: string | null;
  created_at: string | null;
};

export type TradeInvoiceDuplicateProbe = {
  match_count: number;
  counterparty_id: string | null;
  counterparty_name: string | null;
  matches: TradeInvoiceDuplicateMatch[];
};

/** The probe's answer, read out of the door's jsonb without inventing a field it did not send. */
export function duplicateProbeFromAnswer(answer: unknown): TradeInvoiceDuplicateProbe {
  const bag = (answer ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(bag.matches) ? (bag.matches as Record<string, unknown>[]) : [];
  return {
    match_count: Number(bag.match_count ?? rows.length),
    counterparty_id: bag.counterparty_id == null ? null : String(bag.counterparty_id),
    counterparty_name: bag.counterparty_name == null ? null : String(bag.counterparty_name),
    matches: rows.map((row) => ({
      invoice_id: row.invoice_id == null ? "" : String(row.invoice_id),
      work_id: row.work_id == null ? null : String(row.work_id),
      signals: Array.isArray(row.signals) ? row.signals.map((s) => String(s)) : [],
      reference: row.reference == null ? null : String(row.reference),
      document_date: row.document_date == null ? null : String(row.document_date),
      total_cents: row.total_cents == null ? null : Number(row.total_cents),
      state: row.state == null ? null : String(row.state),
      entry_id: row.entry_id == null ? null : String(row.entry_id),
      recorded_by: row.recorded_by == null ? null : String(row.recorded_by),
      created_at: row.created_at == null ? null : String(row.created_at),
    })),
  };
}

/**
 * THE IDS THE ACKNOWLEDGEMENT CARRIES — the probe's own, in the probe's own order, and never a
 * uuid a model supplied. A match the door returned without an invoice id is dropped rather than
 * sent: `clara.record_trade_invoice_duplicate_ack` answers `unknown_acknowledged_invoice` for a
 * row it cannot see, and an empty list answers `nothing_acknowledged`.
 */
export function shownInvoiceIds(probe: { matches?: unknown } | null | undefined): string[] {
  const rows = probe && Array.isArray(probe.matches) ? (probe.matches as Record<string, unknown>[]) : [];
  const out: string[] = [];
  for (const row of rows) {
    if (row.invoice_id == null) continue;
    const id = String(row.invoice_id);
    if (id !== "") out.push(id);
  }
  return out;
}

/** RM 1,060.00 from 106000. A display helper for the question below; never a figure on the wire. */
function ringgit(cents: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return "an amount it did not state";
  const negative = cents < 0;
  const whole = Math.trunc(Math.abs(cents) / 100);
  const sen = String(Math.abs(cents) % 100).padStart(2, "0");
  return `${negative ? "-" : ""}RM ${whole.toLocaleString("en-MY")}.${sen}`;
}

export type DuplicateQuestion = {
  ok: true;
  status: "duplicates_found";
  match_count: number;
  counterparty_name: string | null;
  matches: TradeInvoiceDuplicateMatch[];
  question: string;
};

/**
 * THE QUESTION THE TURN ASKS — and it is a question, not a refusal. The owner's ruling, recorded
 * in #1007: refusing a look-alike would also lose the figures, and the person is the one who knows
 * whether two documents are two events.
 *
 * It carries the matches themselves as well as a sentence, so the model can render the list rather
 * than paraphrase one figure out of it.
 */
export function duplicateQuestion(answer: unknown): DuplicateQuestion {
  const probe = duplicateProbeFromAnswer(answer);
  const first = probe.matches[0];
  const who = probe.counterparty_name ?? "this party";
  const sentence = first === undefined
    ? `This client already has ${probe.match_count} document that looks like this one. `
      + "Record this one anyway, or stop?"
    : `This client already has a document from ${who}`
      + (first.reference == null ? "" : ` numbered ${first.reference}`)
      + (first.document_date == null ? "" : `, dated ${first.document_date}`)
      + `, for ${ringgit(first.total_cents)}`
      + (probe.match_count > 1 ? `, and ${probe.match_count - 1} more` : "")
      + ". Record this one anyway, or stop?";
  return {
    ok: true,
    status: "duplicates_found",
    match_count: probe.match_count,
    counterparty_name: probe.counterparty_name,
    matches: probe.matches,
    question: sentence,
  };
}
