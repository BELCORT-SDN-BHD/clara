// #635 — the model-usage CSV. Pure: rows in, text out, no DOM, no fetch, no route.
//
// CLIENT-SIDE ONLY, AND THAT IS A DECISION. The bytes are a serialisation of the rows already on
// screen — there is no server route, no door, no byte path and no `Content-Disposition` to
// parse. A download route would be a second read of the same figures, free to disagree with the
// table the person is looking at; this cannot, because it is the same array.
//
// THE FIRST TWO LINES ARE A PROVENANCE HEADER, and they are not decoration. A spreadsheet loses
// every label the page carried: which firm, which window, and in which currency the money
// column is denominated. Without them a reader three weeks later has a column of numbers that
// could be ringgit, could be a different month, and could be another firm's. So the file states:
//   · the firm's name;
//   · the EXACT UTC window the door used (0110:711-712, :750) — not "September", which in
//     Malaysia is a different set of days;
//   · the currency the door named, with the same "provider price, not your books" sentence the
//     screen carries;
//   · and, when the period has unpriced calls, the count — so the file cannot be read as a
//     complete bill when the screen said it was not.
//
// THE ROWS ARE NOT REORDERED AND NOT SUMMED. The firm bucket and the platform bucket arrive as
// separate rows from the door and leave as separate rows here (0110:718-727's rule). A total row
// would be this module deciding an addition the door deliberately refused to make.

import type { FirmUsageRow } from "./commercial-reads";

export type UsageCsvContext = {
  readonly firmName: string;
  /** `YYYY-MM-DD`, inclusive, exactly as the door's own window bounds them. */
  readonly fromDate: string;
  readonly toDate: string;
  /** The currency the ROWS carry. Passed in rather than read off the first row so an empty
   *  period still says which currency the column would have been in. */
  readonly currency: string;
  /** Rows the door returned that this build could not read. Carried for the same reason
   *  `unpriced_calls` is: a file that reads as complete when the screen said it was not is the
   *  defect the provenance header exists to prevent. */
  readonly dropped: number;
};

export const USAGE_CSV_COLUMNS = [
  "scope",
  "call_kind",
  "calls",
  "input_tokens",
  "output_tokens",
  "priced_calls",
  "unpriced_calls",
  "spend_cents",
  "price_currency",
] as const;

/** RFC 4180 quoting: a field is quoted when it holds a comma, a quote, a CR or an LF, and an
 *  embedded quote is doubled. Applied to EVERY field rather than only the ones that look like
 *  they need it, because `call_kind` is a database value and a future one carrying a comma must
 *  not shift every column to its right. */
export function csvField(value: string | number): string {
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvLine(fields: readonly (string | number)[]): string {
  return fields.map(csvField).join(",");
}

/** The whole file, CRLF-terminated (RFC 4180, and what Excel expects). */
export function buildUsageCsv(rows: readonly FirmUsageRow[], context: UsageCsvContext): string {
  const unpriced = rows.reduce((sum, r) => sum + r.unpricedCalls, 0);
  const lines: string[] = [
    csvLine([
      `Clara model usage — ${context.firmName}`,
      `${context.fromDate} to ${context.toDate} (UTC)`,
    ]),
    csvLine(
      context.dropped > 0
        ? [provenanceCurrency(context), provenanceFreshness(unpriced),
           `${context.dropped} rows returned for this period could not be read and are NOT in this file.`]
        : [provenanceCurrency(context), provenanceFreshness(unpriced)],
    ),
    csvLine(USAGE_CSV_COLUMNS),
    ...rows.map((r) =>
      csvLine([
        r.scope,
        r.callKind,
        r.calls,
        r.inputTokens,
        r.outputTokens,
        r.pricedCalls,
        r.unpricedCalls,
        r.spendCents,
        r.priceCurrency,
      ]),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function provenanceCurrency(context: UsageCsvContext): string {
  return `Provider price in ${context.currency}, not your books; nothing here is converted and nothing here posts to a ledger.`;
}

function provenanceFreshness(unpriced: number): string {
  return unpriced > 0
    ? `${unpriced} calls in this period have no price on record and are counted but not priced.`
    : "Every call in this period has a price on record.";
}

/** A filename a person can find again: the firm is already in the header, so the name carries
 *  the thing the header cannot — which month, in the door's own frame. */
export function usageCsvFilename(month: string): string {
  return `clara-model-usage-${month}-utc.csv`;
}
