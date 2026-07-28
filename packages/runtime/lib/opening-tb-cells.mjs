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
//   · When the document prints its own total, our sums must equal it EXACTLY. This is the guard
//     against the silent killer: a row Azure dropped, which balances perfectly by itself.
//   · When it prints TWO DIFFERENT totals, no total can be preferred without inventing a rule
//     the document does not state — so the document is refused rather than adjudicated.
//   · A total row whose money we cannot read EXACTLY is a refusal, never a shrug. The guard
//     must not evaporate at the moment the document is noisiest.
//   · ANY line-level refusal forfeits the whole document (F-H5, the house all-or-nothing law).
//     A partial opening seed is worse than none, because none is obvious.
//   · Every refusal is COUNTED and NAMED. No silent caps, no survivors-only set.
//   · A parenthesised or negative figure is REFUSED, never sign-flipped into the other column.
//   · NONBLANK content in an amount column is either an exact figure or a refusal. "Absent"
//     means the cell was EMPTY — never "I could not make sense of this", which is how an
//     OCR-mangled `9OO.00` turned a two-sided row into a clean, balanced, wrong one.
//   · A printed `0.00` or `-` is the document saying NIL, not a balance. Those rows are skipped
//     and reported as `nilRows` — but they still CLAIM their account code for duplicate
//     detection, because "this account is nil" is a statement about that account.
//
// THE COST OF ALL THAT, STATED PLAINLY: this reader refuses documents a more relaxed one would
// read. A trial balance with section subtotals, a footer that lands inside the table's column
// band, an amount column carrying a stray note — each is a refusal, and each sends a human to
// look at a document that may well be fine. That trade is deliberate and it is not close: a
// refusal costs an interruption, and a wrong opening balance costs every number after it.
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
import { namedUnparseableReason, parseOpeningTbLine } from "./opening-parse.mjs";
// The token grammar — what ONE CELL may say — lives in its own module (see its header). It is
// re-exported so callers and tests keep a single import surface for the producer.
import { ACCOUNT_RE, canonicalTbLineText, readAmountCell } from "./opening-tb-grammar.mjs";
export { ACCOUNT_RE, canonicalTbLineText, normalizedCellText, readAmountCell } from "./opening-tb-grammar.mjs";

/** `Code : 310-000 CASH AT BANK` — a per-account GENERAL LEDGER block header. Its presence is
 *  proof this is a ledger, not a trial balance, and is a hard disqualifier (see readHeader). */
const GL_BLOCK_HEADER_RE = /^Code\s*:?\s*(?:[0-9]{4,8}|[0-9]{3}-[0-9A-Z]{2,4})\b/i;

/** The document's own summation row. Matched on the LABEL only — a total row carries no code. */
const TOTAL_LABEL_RE = /^(?:grand\s+)?total\b|^jumlah\b/i;

// Header synonyms across the Malaysian packages that print a trial balance (UBS, AutoCount,
// SQL Accounting, MYOB exports). `debit`/`credit` deliberately accept the bare `dr`/`cr` a
// narrow column prints, and the `(MYR)`/`(RM)` suffix every one of them appends.
//
// EVERY `code` SYNONYM MUST NAME AN ACCOUNT — it contains "code", "acc"/"account", or "gl",
// and that rule is the fix for a real defect, not tidiness. A bare `No` was on this list, and
// `No` is what a JOURNAL prints over its SERIAL-NUMBER column. A balanced journal headed
// `No | Description | Debit | Credit` with four-digit line numbers therefore identified as a
// trial balance and emitted `0001 Cash introduced RM 1,000.00 DR` — a fabricated opening
// balance whose "account code" was a row counter, canonical enough for 0017 to accept and
// balanced enough to pass both tie gates. Row VALUES cannot save us here (`0001` is a valid
// account shape and always will be), so the header token is the only place this is decidable:
// a serial column must never be read as account evidence.
const HEADER_SYNONYMS = {
  code: ["code", "a/c code", "acc code", "acc. code", "account code", "account no", "account no.",
    "acc no", "gl code", "gl account", "kod", "kod akaun"],
  description: ["description", "account description", "account name", "name", "particulars", "account", "acc name"],
  debit: ["debit", "dr", "debit (myr)", "debit (rm)", "debit rm", "dr (myr)", "debit amount"],
  credit: ["credit", "cr", "credit (myr)", "credit (rm)", "credit rm", "cr (myr)", "credit amount"],
};
// A DATE column means this table is a transaction listing (a ledger, a daybook), not a trial
// balance. Present in the header, it disqualifies the table outright — see readHeader.
const DATE_SYNONYMS = ["date", "posting date", "txn date", "transaction date", "doc date", "tarikh"];

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
    // No account. If the amount columns are EMPTY (or state a bare nil) this is FURNITURE — a
    // page header, a section caption, a report title — and skipping it is right. But content
    // in an amount column with no account is an unexplained balance: an unlabelled section
    // subtotal, a lower-case or OCR-mangled code, a column we have mislearned. It must not be
    // silently dropped and left to surface later as a mysterious "does not balance".
    //
    // `unparseable` COUNTS AS CONTENT here, not just `amount`. Testing only for a clean figure
    // was the same hole as the absent-fallback above, one level up: OCR-mangled money on a
    // code-less row would have been furniture and vanished.
    const stated = [debit, credit].some((v) => v.kind === "amount" || v.kind === "unparseable");
    return stated
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
    // Both columns say NIL → the document states this account has no opening balance. The
    // account code travels with the verdict: a nil row still CLAIMS a code, so it must take
    // part in duplicate detection like any other statement about that account.
    if (debit.kind === "nil" || credit.kind === "nil") return { kind: "nil", accountCode };
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
 * The document's own printed total, when it prints one. Returns null (not a total row), a
 * typed refusal, or the stated pair.
 *
 * A total row is CODE-LESS: the check matters, because a real account can be described
 * "TOTAL CREDITORS CONTROL", and label-matching alone would swallow that line into a summation
 * row and lose a balance silently — the exact failure mode this guard exists to catch.
 *
 * A RECOGNISED TOTAL LABEL WHOSE MONEY WE CANNOT READ IS A REFUSAL, never a shrug. The first
 * version returned null there, which quietly deleted the guard at precisely the moment the
 * document was noisiest: a TB printing `1500.00` (ungrouped, outside the accept grammar) with
 * a whole balanced pair of rows missing came back `status:'ok'`, `printedTotals:null`, and an
 * incomplete seed. The only reading of "the document states a total I cannot parse" that is
 * safe is that I have not read this document.
 */
function readTotalRow(row, cols) {
  if (ACCOUNT_RE.test(cellText(cellAt(row, cols.code)))) return null;
  const label = norm(cellText(cellAt(row, cols.description)) || cellText(row.cells[0]));
  if (!TOTAL_LABEL_RE.test(label)) return null;
  const debit = readAmountCell(cellAt(row, cols.debit));
  const credit = readAmountCell(cellAt(row, cols.credit));

  // A bare `TOTAL` caption with BOTH columns empty states nothing at all, and treating it as
  // "the document says zero" would refuse an otherwise sound trial balance over a caption.
  if (debit.kind === "absent" && credit.kind === "absent") return null;

  const bad = [debit, credit].find((v) => v.kind === "unparseable");
  if (bad) return { kind: "refusal", reason: "total_unparseable", detail: bad.raw };
  // One side stated, the other empty: the document states a total we can only half-read. Not
  // zero — a printed total is a PAIR, and half of one proves nothing.
  if (debit.kind === "absent" || credit.kind === "absent") {
    return { kind: "refusal", reason: "total_incomplete", detail: null };
  }
  const cents = (v) => (v.kind === "amount" ? v.cents : 0n);
  return { kind: "total", debitCents: cents(debit), creditCents: cents(credit) };
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
 *   statedTotals: Array<{debitCents: bigint, creditCents: bigint}>,
 * }}
 *
 * `printedTotals` is the document's total ONLY when it stated exactly one; `statedTotals`
 * always reports every distinct pair it stated, so a multi-total refusal can be read back.
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
  const statedTotals = []; // every DISTINCT total pair the document printed
  // account code -> index of the emitted line that claimed it, or NIL_CLAIM for a nil row
  const seenCodes = new Map();
  const NIL_CLAIM = -1;

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
      if (total.kind === "refusal") {
        refusals.push(refusal(row, total.reason, total.detail));
      } else if (!statedTotals.some((t) => t.debitCents === total.debitCents
          && t.creditCents === total.creditCents)) {
        // COLLECT, NEVER OVERWRITE. An identical pair repeated (a total carried across pages)
        // is one claim and collapses; a DIFFERENT pair is a second claim, adjudicated below.
        statedTotals.push(total);
      }
      continue;
    }

    const read = readDataRow(row, cols);
    if (read.kind === "furniture") continue;
    if (read.kind === "refusal") { refusals.push(read.refusal); continue; }

    // A nil row and an emitted line both CLAIM an account code, so BOTH take part in duplicate
    // detection. Skipping nils past this check (as the first version did) left the stated rule
    // — "a code stated twice is ambiguous" — quietly untrue for exactly the pairing a careless
    // export produces: the same account listed once as `-` and once with a balance.
    const claimed = read.kind === "nil" ? read.accountCode : read.line.accountCode;
    const prior = seenCodes.get(claimed);
    if (prior !== undefined) {
      // Neither reading can be preferred without inventing a rule the document does not state.
      // BOTH are refused — the first is pulled back out of the emitted set — so a duplicate can
      // never quietly win by being first.
      refusals.push(refusal(row, "duplicate_account_code", claimed));
      if (prior !== NIL_CLAIM && lines[prior]) {
        refusals.push({
          reason: "duplicate_account_code",
          detail: claimed,
          row_key: `line:${prior}`,
          text: lines[prior].text,
        });
        lines[prior] = null;
      }
      continue;
    }
    if (read.kind === "nil") {
      seenCodes.set(claimed, NIL_CLAIM);
      nilRows += 1;
      continue;
    }
    seenCodes.set(claimed, lines.length);
    lines.push(read.line);
  }

  if (cols === null) return null;         // never found a trial-balance header
  const kept = lines.filter(Boolean);
  if (kept.length === 0 && refusals.length === 0) return null; // a header and nothing under it

  const printedTotals = statedTotals.length === 1 ? statedTotals[0] : null;
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
    statedTotals,
  };

  const refuse = (reason) => ({ ...result, status: "refused", reason, lines: [], regions: [] });

  // (1) ALL-OR-NOTHING (F-H5). One unreadable row forfeits the document; the survivors are
  //     never shipped as if they were the whole trial balance.
  if (refusals.length > 0) {
    return refuse(namedUnparseableReason("trial-balance row(s)", refusals.map((r) => `${r.row_key}(${r.reason})`)));
  }
  // (2) TWO DIFFERENT TOTALS = NO TOTAL WE CAN TRUST. The first version took the LAST one, on
  //     the reasoning that a grand total prints below its subtotals. It is a plausible rule and
  //     it is not stated by the document, which is exactly what makes it dangerous: a
  //     `GRAND TOTAL 2,000` followed by a `TOTAL SECTION B 1,000` let the later, smaller claim
  //     overwrite the real one, and a seed missing half its rows then agreed with it perfectly.
  //     Choosing between competing totals means inventing a rule; refusing does not. (A plain
  //     trial balance prints ONE total — a document with sections is likely not one at all.)
  if (statedTotals.length > 1) {
    return refuse(
      `the document states ${statedTotals.length} different totals and none can be preferred: `
      + statedTotals.map((t) => `DR ${fmt(t.debitCents)} / CR ${fmt(t.creditCents)}`).join(" vs "),
    );
  }
  // (3) A TRIAL BALANCE THAT DOES NOT BALANCE IS NOT A TRIAL BALANCE.
  if (result.totals.debitCents !== result.totals.creditCents) {
    return refuse(`trial balance does not balance: DR ${fmt(result.totals.debitCents)} vs CR ${fmt(result.totals.creditCents)}`);
  }
  // (4) THE DROPPED-ROW GUARD. A row Azure lost still leaves a self-consistent set, so (3)
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
