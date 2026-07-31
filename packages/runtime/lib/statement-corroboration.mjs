// CORROBORATION + the persist payload contract for the bank-statement lane
// (Wave C-b design §3, §4.2, §4.3). This module owns two things and nothing else:
//
//   1. THE VERDICT. Given two independent reads (or one read plus the chain, on the
//      structured lane), decide whether the statement is CORROBORATED — and when it is not,
//      name the refusal with one of the design's own codes, in the design's own order.
//   2. THE PAYLOAD. Build the exact jsonb `clara.persist_statement_facts(p_task, p_payload)`
//      consumes, so `bank_statements` / `bank_statement_lines` are written from a shape
//      whose keys are the COLUMN NAMES of design §4.2 — one mapping, stated once.
//
// WHY THE VERDICT IS COMPUTED RUNTIME-SIDE AND SHIPPED, not re-derived in the DB. The DB
// cannot see the two reads: reader-1 lives in stored layout geometry, reader-2 in a vendor
// response that never becomes a row. What the DB CAN and DOES re-derive is everything that
// binds money — the chain, the printed totals, continuity, period sanity, provenance. So
// the runtime's job here is narrow and honest: prove the two readers said the same thing,
// hash what they agreed, and hand the DB numbers it re-checks for itself. The corroboration
// receipt is evidence, never authority (`corroborated` is an explicit two-reader agreement,
// ADR-047/048 — confidence is GONE).
//
// REFUSAL ORDER (design §4.3, and it matters — the first true one wins so the practitioner
// sees the ROOT cause rather than a downstream symptom):
//   header_unreadable   — an endpoint or another load-bearing header field is missing from
//                         EITHER read. Endpoints come from PRINTED LABELS; a reader that
//                         cannot produce them independently refuses (§3). Never derived.
//   totals_unreadable   — the printed TOTAL DEBIT / TOTAL CREDIT pair is missing on the OCR
//                         path. MANDATORY there: it is the one control that catches an
//                         adjacent omission the running balance cannot see (§3).
//   readers_disagree    — the two reads differ on the full header or on the per-line numeric
//                         skeleton (entry_date, amount, running balance, equal counts).
//   chain_broken        — the agreed read does not satisfy the statement identity.
// Descriptions are NEVER part of the set: they are uncorroborated prose (§4.2).
//
// THE ZERO-LINE CASE IS LEGAL [C]. One month of the real corpus has no activity at all. A
// zero-line statement still corroborates its FULL header, and `line_count = 0 ⇒ opening =
// closing` is checked by the chain like any other closure. The degenerate case is a cell,
// not an exception path.

import { chainReceipt } from "./statement-grammar.mjs";
import { HEADER_FIELDS } from "./statement-layout-reader.mjs";

/** Absence of a printed currency reads MYR (WC-R5 — the 0023 posture). Applied HERE, once,
 *  after both readers have reported what they actually saw. */
const DEFAULT_CURRENCY = "MYR";

export class StatementRefusal extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "StatementRefusal";
    this.code = code;
    this.detail = detail;
    // The DB's refusal taxonomy is deliberately bounded — `fail_statement_facts` records
    // the CODE and drops the field-level detail (which fields disagreed, by how much). The
    // C-b acceptance spent a live round-trip per diagnosis without this line: the detail
    // must reach the OPERATOR somewhere, and the process log is that somewhere. Bounded at
    // 2000 chars so a wholly-garbled read cannot flood the log stream.
    try {
      const line = `[statement-refusal] ${code}: ${JSON.stringify(detail).slice(0, 2000)}`;
      console.log(line);
      // The process log stream is lossy under sidecar noise (proved during the C-b
      // acceptance); a local NDJSON sink makes the last refusals queryable on the machine.
      import("node:fs").then((fs) =>
        fs.appendFileSync("/tmp/statement-refusals.ndjson",
          JSON.stringify({ at: new Date().toISOString(), code, detail }).slice(0, 4000) + "
"),
      ).catch(() => {});
    } catch { /* diagnostics must never mask the refusal itself */ }
  }
}

const currency = (header) => header?.currency ?? DEFAULT_CURRENCY;

/** The header fields that must be present in BOTH reads before anything else is judged. */
function missingHeaderFields(header) {
  return HEADER_FIELDS.filter((field) => field !== "total_debit_cents" && field !== "total_credit_cents")
    .filter((field) => {
      const value = field === "currency" ? currency(header) : header?.[field];
      return value === null || value === undefined || value === "";
    });
}

function missingTotals(header) {
  return ["total_debit_cents", "total_credit_cents"].filter(
    (field) => !Number.isSafeInteger(header?.[field]),
  );
}

/** Header disagreements, by field name. `currency` is compared AFTER the MYR default, so a
 *  statement neither reader saw a currency on agrees on MYR — while an explicit foreign
 *  code on one side and silence on the other correctly disagrees. */
function headerDisagreements(a, b) {
  return HEADER_FIELDS.filter((field) => {
    const left = field === "currency" ? currency(a) : a?.[field];
    const right = field === "currency" ? currency(b) : b?.[field];
    return left !== right;
  });
}

/**
 * Per-line numeric-skeleton disagreements. entry_date and amount_cents are compared
 * ALWAYS. running_balance_cents is compared always TOO on the two-reader path: a printed
 * statement prints one on every row — but a reader's SOURCE may carry no per-row balance
 * slot at all (probed live 2026-07-31: Azure's per-account typed transactions have
 * Date/Description/amounts and NO Balance field), and a schema absence is not a failed
 * read of the printed page. So: a running-balance disagreement fires when BOTH readers
 * carry a number and the numbers differ; a ONE-SIDED null defers that row's balance
 * witness to the CHAIN IDENTITY, which re-derives every step from the agreed opening +
 * amounts and must close over whatever printed balances exist (WC-R7's own logic — the
 * chain is a reader), and the DB core walks the same chain again at persist. Dates and
 * amounts stay strictly bilateral: those have no independent re-derivation.
 */
function lineDisagreements(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return [`line_count:${left.length}vs${right.length}`];
  const out = [];
  for (const [index, l] of left.entries()) {
    const r = right[index];
    const n = index + 1;
    if (l?.entry_date !== r?.entry_date) out.push(`line_${n}_entry_date`);
    if (l?.amount_cents !== r?.amount_cents) out.push(`line_${n}_amount_cents`);
    if (
      Number.isSafeInteger(l?.running_balance_cents)
      && Number.isSafeInteger(r?.running_balance_cents)
      && l.running_balance_cents !== r.running_balance_cents
    ) out.push(`line_${n}_running_balance_cents`);
  }
  return out;
}

/**
 * PREFLIGHT ONE READ, before the second one is paid for.
 *
 * `header_unreadable` and `totals_unreadable` fire when EITHER read is short of the field —
 * so checking reader-1 ALONE is a strict subset of the two-reader verdict and can never
 * reach a different conclusion. Running it before reader-2 is therefore free of semantic
 * consequence and buys two things that matter: a statement reader-1 cannot read never costs
 * a vendor call, and — more importantly — it never CONSUMES A GOVERNED-EGRESS
 * AUTHORIZATION, which is a single-use record of a client's data leaving.
 *
 * Returns null when the read is fit to corroborate, or `{code, detail}` naming the refusal.
 * `requireTotals` is false on the structured lane: a format with no printed-totals field
 * (OFX) must not be refused for a field it cannot have (design §4.3).
 */
export function preflightRead(read, { requireTotals = true } = {}) {
  const header = read?.header ?? {};
  const missing = missingHeaderFields(header);
  if (missing.length) {
    return { code: "header_unreadable", detail: { missing_fields: missing, reader: read?.receipt?.reader ?? null } };
  }
  if (!requireTotals) return null;
  const totals = missingTotals(header);
  return totals.length
    ? { code: "totals_unreadable", detail: { missing_fields: totals, reader: read?.receipt?.reader ?? null } }
    : null;
}

/**
 * THE TWO-READER VERDICT (the OCR lane). Throws a `StatementRefusal` carrying one of the
 * design's named codes, or returns the AGREED read plus its receipt.
 *
 * The agreed read is taken from reader-1 for the numeric skeleton (it is arithmetic over
 * committed geometry, so it is the one a reviewer can re-derive from rows Clara already
 * stores) and from reader-2 for DESCRIPTIONS only (§4.3 — "descriptions come from reader-2
 * and are never load-bearing"). Every load-bearing number is identical by construction:
 * they were just proved equal.
 */
export function corroborateTwoReaders(reader1, reader2) {
  const h1 = reader1?.header ?? {};
  const h2 = reader2?.header ?? {};

  const missing = [...new Set([...missingHeaderFields(h1), ...missingHeaderFields(h2)])];
  if (missing.length) {
    throw new StatementRefusal("header_unreadable", "the printed statement header could not be read in full", {
      missing_fields: missing,
    });
  }
  const totals = [...new Set([...missingTotals(h1), ...missingTotals(h2)])];
  if (totals.length) {
    throw new StatementRefusal("totals_unreadable", "the printed TOTAL DEBIT / TOTAL CREDIT cross-check is missing", {
      missing_fields: totals,
    });
  }
  const headerDiff = headerDisagreements(h1, h2);
  const lineDiff = lineDisagreements(reader1?.lines, reader2?.lines);
  if (headerDiff.length || lineDiff.length) {
    throw new StatementRefusal("readers_disagree", "the two readers did not agree on the statement facts", {
      header_fields: headerDiff,
      // Bounded: a wholly-garbled read must not put thousands of tokens into a refusal.
      line_fields: lineDiff.slice(0, 25),
      line_field_count: lineDiff.length,
    });
  }

  const header = { ...h1, currency: currency(h1), line_count: (reader1.lines ?? []).length };
  const lines = (reader1.lines ?? []).map((line, index) => ({
    ...line,
    line_no: index + 1,
    description: reader2?.lines?.[index]?.description ?? line.description ?? null,
  }));
  const chain = chainReceipt(header, lines);
  if (!chain.closes || chain.totals_ok === false) {
    throw new StatementRefusal("chain_broken", "the statement's own balance chain does not close", { chain });
  }
  return {
    header,
    lines,
    corroboration: {
      corroborated: true,
      method: "two_reader",
      header_fields: [...HEADER_FIELDS],
      line_count: lines.length,
      chain,
      reader1_receipt: reader1?.receipt ?? null,
      reader2_receipt: reader2?.receipt ?? null,
    },
  };
}

/**
 * THE CHAIN-IS-SECOND-READER VERDICT (the structured lane, WC-R7). One deterministic parse
 * of bytes the BANK produced; what stands in for a second reader is the statement identity
 * itself. Printed totals are checked WHEN PRESENT — a CSV export that carries them is held
 * to them; OFX, which has no such field, is not refused for a field its format lacks.
 */
export function corroborateChain(reader) {
  const header = { ...(reader?.header ?? {}), currency: currency(reader?.header) };
  const lines = (reader?.lines ?? []).map((line, index) => ({ ...line, line_no: index + 1 }));
  header.line_count = lines.length;

  const missing = missingHeaderFields(header);
  if (missing.length) {
    throw new StatementRefusal("header_unreadable", "the statement file does not state its full header", {
      missing_fields: missing,
    });
  }
  const chain = chainReceipt(header, lines);
  if (!chain.closes || chain.totals_ok === false) {
    throw new StatementRefusal("chain_broken", "the statement's own balance chain does not close", { chain });
  }
  return {
    header,
    lines,
    corroboration: {
      corroborated: true,
      method: "chain_second_reader",
      header_fields: [...HEADER_FIELDS],
      line_count: lines.length,
      chain,
      reader1_receipt: reader?.receipt ?? null,
      reader2_receipt: null,
    },
  };
}

/**
 * THE PERSIST PAYLOAD CONTRACT — the exact jsonb `clara.persist_statement_facts(p_task,
 * p_payload)` consumes (design §4.3). Keys are the COLUMN NAMES of §4.2 so the DB verb maps
 * one-to-one and nothing is renamed in flight:
 *
 * {
 *   "ingest_mode":  "ocr" | "structured",           -- bank_statements.ingest_mode
 *   "reader1": { "extraction_id": uuid|null, "source": text, "engine_id": text|null },
 *   "reader2": { "extraction_id": uuid|null, "source": text, "engine_id": text|null,
 *                "raw_sha256": hex|null, "normalization_version": text|null,
 *                "pages_used": int|null },
 *   "corroboration": { "corroborated": true, "method": text, "header_fields": [...],
 *                      "line_count": int, "chain": {...}, ...receipts },
 *   "header": {
 *      "institution_code": text, "institution_name": text|null,
 *      "account_number": text, "account_number_normalized": text,
 *      "currency": "MYR",
 *      "period_start": date, "period_end": date, "statement_date": date,
 *      "opening_cents": int, "closing_cents": int,
 *      "total_debit_cents": int|null, "total_credit_cents": int|null,
 *      "line_count": int
 *   },
 *   "lines": [ { "line_no": int, "entry_date": date, "value_date": date|null,
 *                "description": text|null, "amount_cents": int (<>0, + = into the account),
 *                "running_balance_cents": int|null } ]
 * }
 *
 * The DB re-derives the chain, the printed-totals cross-check, both-edge continuity, period
 * sanity, the duplicate/overlap refusals, the line-date bounds and the account binding from
 * these numbers — the payload is EVIDENCE, never an instruction. `reader2.extraction_id` is
 * null on the structured lane by construction (there is no second reader), which is how the
 * DB tells `ingest_mode='structured'` apart from a half-built OCR read.
 */
export function buildStatementPersistPayload({ ingestMode, agreed, reader1, reader2, pagesUsed = 0 }) {
  // THE DB ENVELOPE (as-built ladder fix, 2026-07-31, runtime-lens BLOCKER): `_persist_
  // statement_core` parses `p_payload #> '{readers,reader1}'` with PER-READER header/lines/
  // engine_id and re-derives two-reader agreement ITSELF -- so each reader ships its OWN
  // read, not the agreed view. reader2 is ABSENT (not null) on the structured lane -- that
  // absence is how the DB tells ingest_mode='structured' from a half-built OCR read.
  // pages_used rides top-level: the DB settles the page reservation from it, so a vendor
  // read that reported pages must not settle at zero (the budget-blindness fix).
  const shipReader = (meta, read) => ({
    engine_id: meta?.engine_id ?? null,
    extraction_id: meta?.extraction_id ?? null,
    source: meta?.source ?? null,
    ...(meta?.raw_sha256 !== undefined ? { raw_sha256: meta.raw_sha256 } : {}),
    ...(meta?.normalization_version !== undefined
      ? { normalization_version: meta.normalization_version } : {}),
    header: {
      institution_code: read?.header?.institution_code ?? null,
      account_number: read?.header?.account_number ?? null,
      ...(read?.header?.currency != null ? { currency: read.header.currency } : {}),
      period_start: read?.header?.period_start ?? null,
      period_end: read?.header?.period_end ?? null,
      statement_date: read?.header?.statement_date ?? null,
      opening_cents: read?.header?.opening_cents ?? null,
      closing_cents: read?.header?.closing_cents ?? null,
      total_debit_cents: read?.header?.total_debit_cents ?? null,
      total_credit_cents: read?.header?.total_credit_cents ?? null,
      ...(read?.header?.opening_label != null ? { opening_label: read.header.opening_label } : {}),
      ...(read?.header?.closing_label != null ? { closing_label: read.header.closing_label } : {}),
    },
    lines: (read?.lines ?? []).map((line) => ({
      line_no: line.line_no,
      entry_date: line.entry_date,
      value_date: line.value_date ?? null,
      description: line.description ?? null,
      amount_cents: line.amount_cents,
      running_balance_cents: line.running_balance_cents ?? null,
    })),
  });
  const readers = { reader1: shipReader(reader1?.meta ?? reader1, reader1?.read ?? reader1) };
  if (reader2) readers.reader2 = shipReader(reader2?.meta ?? reader2, reader2?.read ?? reader2);
  // Delta-review minor (2026-07-31): NO facts_hash in the payload. `_persist_statement_core`
  // derives its own hash from the agreed read it re-computes (0038 §4.2) and never read the
  // shipped key — and a runtime-side hash computed over the renumbered `agreed` view while
  // the wire carries raw per-reader reads is a disagreement trap the day anyone wires it up.
  return {
    pages_used: Number.isFinite(pagesUsed) && pagesUsed > 0 ? Math.trunc(pagesUsed) : 0,
    ingest_mode: ingestMode,
    corroboration: agreed.corroboration,
    readers,
  };
}

/** The design §4.3 refusal taxonomy. A code OUTSIDE this set is never handed to
 *  `fail_statement_facts` — `ck_processing_task_error_code_0016` (widened by the migration)
 *  would refuse the row, and a task that cannot record its own failure is a stuck task. */
export const STATEMENT_FAILURE_CODES = Object.freeze([
  "header_unreadable",
  "totals_unreadable",
  "readers_disagree",
  "chain_broken",
  "continuity_mismatch",
  "duplicate_period",
  "overlapping_period",
  "non_myr_statement",
  "account_unregistered",
  "account_inactive",
  "statement_multi_client",
  "period_invalid",
  "line_date_out_of_period",
]);

export function isStatementFailureCode(code) {
  return STATEMENT_FAILURE_CODES.includes(String(code ?? ""));
}
