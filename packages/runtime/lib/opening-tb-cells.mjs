// The `opening_tb.line` PRODUCER (Gate K, document-tied · ADR-048 synthetic closure).
//
// A deterministic reader that turns the `tables.N.cells.M` regions Azure produces for a PRINTED
// TRIAL BALANCE — account CODE column, description, and a Debit and a Credit column — into the
// canonical `opening_tb.line` extraction regions the opening-seed lane already consumes. NO
// model, NO egress, NO new field_path, NO migration.
//
// ── WHY IT EXISTS ────────────────────────────────────────────────────────────────────────────
// `opening-parse.mjs` has consumed `document_regions` rows carrying `field_path =
// 'opening_tb.line'` since Wave B, and `clara.record_opening_targets_parsed` re-derives every
// triple from those rows independently (0017 `_derive_opening_region_fact`). NOTHING in the
// pipeline has ever PRODUCED one: measured on live, `opening_tb.line` stands at 0 regions, which
// is exactly why Gate K closed KEYED (a human typing the balances) rather than document-tied.
// This module is the missing half. It reads the geometry, never the story.
//
// ── THE INTEGRATION POINT IS NOT NEGOTIABLE, AND IT IS NOT THE PRINTED-LEDGER ONE ─────────────
// The sibling printed-ledger reader (`prior-gl-cells.mjs`) feeds `entriesToProposals` DIRECTLY
// from `tables.*` cells — it never materialises a region, because a seeding proposal cites a
// cell and nothing more. That route is CLOSED here, structurally, by the database:
//
//   `record_opening_targets_parsed` → `_assert_opening_target_fact` → `_opening_region_fact`
//   → `_derive_opening_region_fact(field_path, text_content, monetary_cents)`, which returns
//   NOTHING unless `field_path = 'opening_tb.line'`; and `_assert_opening_extraction_ref`,
//   which additionally requires the cited extraction to be `status='done'`,
//   `superseded_by is null` AND the document's `authoritative_extraction_id`.
//
// So a `tables.0.cells.7` region can never be cited by an opening target — CLR31
// `extraction_fact_missing` — no matter how correctly it was read. The ONLY shape the consumer
// accepts is a materialised `opening_tb.line` region whose TEXT re-derives to the same triple.
// This module therefore emits REGION PAYLOADS in exactly the element shape
// `clara.persist_document_extraction(p_regions)` accepts, and the existing route consumes them
// unchanged. The producer proposes evidence; the database still proves every number itself.
//
// ── REFUSE, NEVER COERCE ─────────────────────────────────────────────────────────────────────
// An opening trial balance is the single most consequential document a client hands over: it is
// the starting position every later number is measured from, and a wrong or PARTIAL one is not
// visibly wrong afterwards. So the discipline here is stricter than anywhere else in the intake:
//
//   · A trial balance that does not BALANCE is not a trial balance. ΣDr ≠ ΣCr refuses the WHOLE
//     document — never the "closest" reading, never a plug.
//   · When the document prints its own grand total, our sums must equal it EXACTLY. This is the
//     guard against the silent killer: a row Azure dropped, which balances perfectly by itself.
//   · ANY line-level refusal forfeits the whole document (F-H5, the house all-or-nothing law).
//     A partial opening seed is worse than none, because none is obvious.
//   · Every refusal is COUNTED and NAMED. No silent caps, no survivors-only set.
//   · A parenthesised or negative figure is REFUSED, never sign-flipped into the other column.
//   · A printed `0.00` or `-` is the document saying NIL, not a balance. Those rows are skipped
//     and reported as `nilRows` — they contribute no target and no tie.
//
// ── AND THE PRODUCER CHECKS ITSELF ───────────────────────────────────────────────────────────
// Every line it emits is re-parsed through `parseOpeningTbLine` — the byte-for-byte mirror of
// the DB's own evidence grammar — and must yield back the exact triple that was read from the
// cells. A text that does not round-trip is refused rather than shipped. Fabrication is not
// prevented by care here; it is prevented by construction.

import {
  cellAt,
  cellText,
  groupRows,
  norm,
  rowPolygon,
} from "./table-cell-geometry.mjs";
import { asciiTrim, centsOfRaw, isDash, isStrictAmount, looksLikeAmountAttempt } from "./invoice-amount-grammar.mjs";
import { namedUnparseableReason, parseOpeningTbLine } from "./opening-parse.mjs";

/** Account-code shapes the opening grammar accepts (0017 `_derive_opening_region_fact`). */
const ACCOUNT_RE = /^(?:[0-9]{4,8}|[0-9]{3}-[0-9A-Z]{2,4})$/;

/** `Code : 310-000 CASH AT BANK` — a per-account GENERAL LEDGER block header. Its presence is
 *  proof this is a ledger, not a trial balance, and is a hard disqualifier (see readHeader). */
const GL_BLOCK_HEADER_RE = /^Code\s*:?\s*(?:[0-9]{4,8}|[0-9]{3}-[0-9A-Z]{2,4})\b/i;

/** The document's own summation row. Matched on the LABEL only — a total row carries no code. */
const TOTAL_LABEL_RE = /^(?:grand\s+)?total\b|^jumlah\b/i;

// Header synonyms across the Malaysian packages that print a trial balance (UBS, AutoCount,
// SQL Accounting, MYOB exports). `debit`/`credit` deliberately accept the bare `dr`/`cr` a
// narrow column prints, and the `(MYR)`/`(RM)` suffix every one of them appends.
const HEADER_SYNONYMS = {
  code: ["code", "a/c code", "acc code", "account code", "account no", "account no.", "acc no", "gl code", "no"],
  description: ["description", "account description", "account name", "name", "particulars", "account", "acc name"],
  debit: ["debit", "dr", "debit (myr)", "debit (rm)", "debit rm", "dr (myr)", "debit amount"],
  credit: ["credit", "cr", "credit (myr)", "credit (rm)", "credit rm", "cr (myr)", "credit amount"],
};
// A DATE column means this table is a transaction listing (a ledger, a daybook), not a trial
// balance. Present in the header, it disqualifies the table outright — see readHeader.
const DATE_SYNONYMS = ["date", "posting date", "txn date", "transaction date", "doc date", "tarikh"];

/** Strip the currency word a package sometimes prints inside the amount cell. */
const stripCurrency = (s) => asciiTrim(String(s ?? "").replace(/\s+/g, " ")).replace(/^(?:RM|MYR)\s*/i, "");

/**
 * Learn the four column x-positions from a header row, or null when this row is not a trial
 * balance header. ALL FOUR are required: a table without both a Debit and a Credit column
 * cannot state a SIDE, and a side that has to be inferred is a side that can be inferred
 * wrong. A `date` column disqualifies the table (a dated listing is not a trial balance).
 */
export function readTrialBalanceHeader(row) {
  const cols = {};
  for (const cell of row.cells) {
    const text = norm(cell.text_content);
    if (!text) continue;
    if (DATE_SYNONYMS.includes(text)) return null; // a dated table is a ledger, not a TB
    for (const [key, syns] of Object.entries(HEADER_SYNONYMS)) {
      if (cols[key] === undefined && syns.includes(text)) cols[key] = cell.at.x;
    }
  }
  const complete = ["code", "description", "debit", "credit"].every((k) => cols[k] !== undefined);
  return complete ? cols : null;
}

/**
 * Read ONE amount cell. Returns a typed verdict rather than a number, because the three
 * outcomes are genuinely different things and collapsing them is how a nil becomes a zero
 * balance or a mangled token becomes an absence.
 *   { kind:'absent' }              — the column is empty here (the ordinary one-sided row)
 * · { kind:'nil' }                 — the document printed `-` or `0.00`: no balance, stated
 * · { kind:'amount', raw, cents }  — a strict, positive, comma-grouped figure (BigInt cents)
 * · { kind:'unparseable', raw }    — amount-SHAPED but outside the accept grammar (negative,
 *                                    parenthesised, three decimals, Unicode-space-infected)
 */
export function readAmountCell(cell) {
  const raw = stripCurrency(cellText(cell));
  if (raw === "") return { kind: "absent" };
  if (isDash(raw)) return { kind: "nil" };
  if (isStrictAmount(raw)) {
    const cents = centsOfRaw(raw);
    if (cents === null) return { kind: "unparseable", raw };
    if (cents === 0n) return { kind: "nil" };
    // A NEGATIVE cannot reach here (AMOUNT_STRICT has no sign) — asserted, not assumed.
    return cents > 0n ? { kind: "amount", raw, cents } : { kind: "unparseable", raw };
  }
  // Amount-shaped but refused: a parenthesised credit sitting in the Debit column, a minus
  // sign, `1.234` — every one of them a sign or a scale error waiting to be coerced. Surfaced
  // as unparseable so a human sees it; NEVER repaired here.
  if (looksLikeAmountAttempt(raw)) return { kind: "unparseable", raw };
  return { kind: "absent" }; // ordinary text in an amount column (a stray note) — not a figure
}

/** The canonical `opening_tb.line` evidence text: `<code> <label> RM <amount> <DR|CR>`. */
export function canonicalTbLineText({ accountCode, label, raw, side }) {
  return `${accountCode} ${label} RM ${raw} ${side === "debit" ? "DR" : "CR"}`;
}

/**
 * One emitted line's `persist_document_extraction` region element. `monetary_cents` is supplied
 * DELIBERATELY: 0017 treats it as an independent second representation and refuses the whole
 * extraction when it contradicts the text (`opening_extraction_monetary_mismatch`), so sending
 * it buys a free corroboration of our own reading. It is a decimal STRING because these are
 * BigInt cents and JSON has no bigint — the DB casts `(elem->>'monetary_cents')::bigint`.
 */
function toRegion({ text, cents, raw, anchorAt }) {
  return {
    locator_kind: "page_polygon",
    locator: anchorAt
      ? { page_number: anchorAt.page, polygon: anchorAt.polygon }
      : { page_number: 1, polygon: [] },
    field_path: "opening_tb.line",
    text_content: text,
    engine_confidence: null,
    monetary_raw: raw,
    monetary_cents: cents.toString(),
  };
}

const refusal = (row, reason, detail) => ({
  reason,
  detail: detail ?? null,
  row_key: `p${row.page}:y${row.y.toFixed(3)}`,
  text: row.cells.map((c) => cellText(c)).filter(Boolean).join(" | ").slice(0, 200),
});

/** Read one non-header, non-furniture data row into a line, or a typed refusal. */
function readDataRow(row, cols) {
  const accountCode = cellText(cellAt(row, cols.code));
  const label = cellText(cellAt(row, cols.description));
  const debit = readAmountCell(cellAt(row, cols.debit));
  const credit = readAmountCell(cellAt(row, cols.credit));

  if (!ACCOUNT_RE.test(accountCode)) {
    // No account. If the row carries no figure either it is FURNITURE — a page header, a
    // section caption, a `Balance B/F` line — and skipping it is right. But a FIGURE with no
    // account is an unexplained balance: an unlabelled section subtotal, a lower-case or
    // OCR-mangled code, a column we have mislearned. It must not be silently dropped and left
    // to surface later as a mysterious "does not balance", so it is refused by name.
    const hasFigure = debit.kind === "amount" || credit.kind === "amount";
    return hasFigure
      ? { kind: "refusal", refusal: refusal(row, "unrecognized_account_code", accountCode || null) }
      : { kind: "furniture" };
  }
  if (debit.kind === "unparseable" || credit.kind === "unparseable") {
    const bad = debit.kind === "unparseable" ? debit.raw : credit.raw;
    return { kind: "refusal", refusal: refusal(row, "unparseable_amount", bad) };
  }
  if (debit.kind === "amount" && credit.kind === "amount") {
    // A trial-balance line states ONE side. Two figures is either a running-balance column
    // mislearned as an amount column, or a genuinely ambiguous row — both must stop.
    return { kind: "refusal", refusal: refusal(row, "two_sided_row") };
  }
  if (debit.kind !== "amount" && credit.kind !== "amount") {
    // Both columns say NIL → the document states this account has no opening balance.
    if (debit.kind === "nil" || credit.kind === "nil") return { kind: "nil" };
    // Both columns are simply EMPTY on a row that carries a real account code: a figure that
    // should be here is not. Refused, never read as zero.
    return { kind: "refusal", refusal: refusal(row, "amount_missing") };
  }
  if (!label) {
    // The grammar needs a label token between the code and the RM anchor, and inventing one
    // (repeating the code) would put text on the record the document never printed.
    return { kind: "refusal", refusal: refusal(row, "label_missing") };
  }

  const side = debit.kind === "amount" ? "debit" : "credit";
  const { raw, cents } = side === "debit" ? debit : credit;
  const text = canonicalTbLineText({ accountCode, label, raw, side });

  // THE SELF-CHECK. Re-derive the emitted text through the mirror of the DB's own grammar and
  // require the identical triple. A label carrying an ` RM 1.00 DR` tail, a stray control
  // character, an account shape the grammar reads differently — all of it dies here instead of
  // reaching a writer as a plausible-looking fact.
  const proof = parseOpeningTbLine(text);
  if (!proof || proof.accountCode !== accountCode || proof.side !== side
      || BigInt(proof.amountCents) !== cents) {
    return { kind: "refusal", refusal: refusal(row, "text_does_not_round_trip", text.slice(0, 120)) };
  }

  return {
    kind: "line",
    line: {
      accountCode,
      label,
      side,
      amountCents: cents,
      raw,
      text,
      sourceCells: [cols.code, cols.description, side === "debit" ? cols.debit : cols.credit]
        .map((x) => cellAt(row, x)?.region_id ?? null),
      region: toRegion({ text, cents, raw, anchorAt: rowPolygon(row) }),
    },
  };
}

/**
 * The document's own printed grand total, when it prints one. A total row is CODE-LESS: the
 * check matters, because a real account can be described "TOTAL CREDITORS CONTROL", and
 * label-matching alone would swallow that line into a summation row and lose a balance
 * silently — the exact failure mode the printed-total guard exists to catch.
 */
function readTotalRow(row, cols) {
  if (ACCOUNT_RE.test(cellText(cellAt(row, cols.code)))) return null;
  const label = norm(cellText(cellAt(row, cols.description)) || cellText(row.cells[0]));
  if (!TOTAL_LABEL_RE.test(label)) return null;
  const debit = readAmountCell(cellAt(row, cols.debit));
  const credit = readAmountCell(cellAt(row, cols.credit));
  const cents = (v) => (v.kind === "amount" ? v.cents : v.kind === "nil" ? 0n : null);
  const d = cents(debit);
  const c = cents(credit);
  if (d === null || c === null) return null;
  // A total row that prints NO figure at all states nothing. Recording it as "the document says
  // zero" would turn a total row whose cells Azure dropped into a guaranteed refusal of an
  // otherwise sound trial balance — a false alarm manufactured out of our own missing read.
  return d === 0n && c === 0n ? null : { debitCents: d, creditCents: c };
}

const fmt = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;

/**
 * Trial-balance table cells → canonical `opening_tb.line` regions.
 *
 * @param {Array<{region_id:string, text_content:string, locator:object}>} cells
 * @returns {null | {
 *   status: 'ok'|'refused',
 *   reason: string|null,
 *   lines: Array<object>,
 *   regions: Array<object>,
 *   refusals: Array<object>,
 *   nilRows: number,
 *   totals: {debitCents: bigint, creditCents: bigint},
 *   printedTotals: {debitCents: bigint, creditCents: bigint}|null,
 * }}
 *
 * `null` means "this is not a trial balance" and is the CONSERVATIVE default: the reader must
 * POSITIVELY identify one (a header carrying code + description + Debit + Credit, no date
 * column, no `Code :` ledger block header) and read at least one balance from it. A caller
 * that gets null has learned nothing and must behave exactly as it did before this module
 * existed. `status:'refused'` is the opposite and much louder claim: this IS a trial balance,
 * and it cannot be used — with the reason.
 */
export function cellsToOpeningTb(cells) {
  const rows = groupRows(cells ?? []);
  if (rows.length === 0) return null;

  let cols = null;
  const lines = [];
  const refusals = [];
  let nilRows = 0;
  let printedTotals = null;
  const seenCodes = new Map(); // account code -> index of the first line that claimed it

  for (const row of rows) {
    // A `Code : <account>` block header is the signature of a GENERAL LEDGER. Seeing one means
    // the geometry belongs to the other reader, and a trial-balance reading of it would be a
    // fabrication built out of a real document — the worst possible false positive.
    if (row.cells.some((c) => GL_BLOCK_HEADER_RE.test(cellText(c)))) return null;

    // Headers repeat on every printed page; re-learning keeps a shifted layout honest.
    const header = readTrialBalanceHeader(row);
    if (header) {
      cols = header;
      continue;
    }
    if (!cols) continue; // nothing is addressable until a header has been seen

    const total = readTotalRow(row, cols);
    if (total) {
      printedTotals = total; // the LAST total row wins: a grand total prints below its subtotals
      continue;
    }

    const read = readDataRow(row, cols);
    if (read.kind === "furniture") continue;
    if (read.kind === "nil") { nilRows += 1; continue; }
    if (read.kind === "refusal") { refusals.push(read.refusal); continue; }

    const prior = seenCodes.get(read.line.accountCode);
    if (prior !== undefined) {
      // A code stated twice is genuinely ambiguous: neither reading can be preferred without
      // inventing a rule the document does not state. BOTH are refused — the first is pulled
      // back out of the emitted set — so a duplicate can never quietly win by being first.
      refusals.push(refusal(row, "duplicate_account_code", read.line.accountCode));
      if (lines[prior]) {
        refusals.push({
          reason: "duplicate_account_code",
          detail: read.line.accountCode,
          row_key: `line:${prior}`,
          text: lines[prior].text,
        });
        lines[prior] = null;
      }
      continue;
    }
    seenCodes.set(read.line.accountCode, lines.length);
    lines.push(read.line);
  }

  if (cols === null) return null;         // never found a trial-balance header
  const kept = lines.filter(Boolean);
  if (kept.length === 0 && refusals.length === 0) return null; // a header and nothing under it

  const result = {
    status: "ok",
    reason: null,
    lines: kept,
    regions: kept.map((l) => l.region),
    refusals,
    nilRows,
    totals: {
      debitCents: kept.reduce((a, l) => a + (l.side === "debit" ? l.amountCents : 0n), 0n),
      creditCents: kept.reduce((a, l) => a + (l.side === "credit" ? l.amountCents : 0n), 0n),
    },
    printedTotals,
  };

  const refuse = (reason) => ({ ...result, status: "refused", reason, lines: [], regions: [] });

  // (1) ALL-OR-NOTHING (F-H5). One unreadable row forfeits the document; the survivors are
  //     never shipped as if they were the whole trial balance.
  if (refusals.length > 0) {
    return refuse(namedUnparseableReason("trial-balance row(s)", refusals.map((r) => `${r.row_key}(${r.reason})`)));
  }
  // (2) A TRIAL BALANCE THAT DOES NOT BALANCE IS NOT A TRIAL BALANCE.
  if (result.totals.debitCents !== result.totals.creditCents) {
    return refuse(`trial balance does not balance: DR ${fmt(result.totals.debitCents)} vs CR ${fmt(result.totals.creditCents)}`);
  }
  // (3) THE DROPPED-ROW GUARD. A row Azure lost still leaves a self-consistent set, so (2)
  //     alone cannot see it. The document's own printed total can — and when it disagrees the
  //     honest answer is that we did not read this document, not that we read most of it.
  if (printedTotals
      && (printedTotals.debitCents !== result.totals.debitCents
        || printedTotals.creditCents !== result.totals.creditCents)) {
    return refuse(
      `read total DR ${fmt(result.totals.debitCents)} / CR ${fmt(result.totals.creditCents)} does not match the printed total `
      + `DR ${fmt(printedTotals.debitCents)} / CR ${fmt(printedTotals.creditCents)}`,
    );
  }
  return result;
}
