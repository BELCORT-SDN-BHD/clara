// The two readers the bank chat cards use for the payloads that WERE already on the
// wire and WERE being thrown away (C6). Pure functions, in their own module, because
// they are the whole judgement in that change and belong somewhere every branch can be
// driven with its own RED-before mutant (review law 1).
//
// THE LINE THEY DRAW, and why it is where it is. Hard constraint 2 says the DB owns
// every authoritative number and this UI invents none; V16Cards.tsx's rule 2 enforces
// it by never walking an open `Record<string, unknown>`, on the ground that "a numeral
// hiding inside one of those payloads is model-authored by construction". Both bank
// payloads fail that premise — they are the return value of a `clara.wake_*` function,
// carried through verbatim (chatTurn.v14.bank.ts's `classifyBankResult` and
// `runGetBankPack`), and the model authors only the tool-call INPUT, never the
// tool-result output. So the question stops being "who wrote it" and becomes "does the
// DB commit to a shape". The answer differs between the two, and so does the reader:
//
//   PACK    yes. `clara._agent_get_bank_pack_core` (0121_f_a3_pr1b_agent_limb.sql)
//           stamps `'schema','clara.bank-pack/v1'` and a `budget` object whose `lines`
//           and `candidates` are `jsonb_array_length(...)` over the rows it just
//           selected. Numbers are admitted, behind the schema token.
//   RESULT  no. It is the delegate core's own return and differs per verb. Strings and
//           booleans only, and NO FIGURE IN ANY JSON TYPE — a JSON number is dropped, and
//           so is a string that is really a numeral. The second half is not a hypothetical:
//           the live settle path returns `'residue_cents', v_res->>'residue_cents'`
//           (0121:1628, `->>` = TEXT) in the same object as a real-number
//           `'settlement_cents'`, so a type-based filter alone printed a raw cents figure
//           on the card. See `NUMERIC_TEXT` below.
//
// Both fail CLOSED: an unreadable payload yields nothing to render, and the card falls
// back to the identifiers it always showed.

/** The pack's own version token, from 0121's `jsonb_build_object('schema', …)`. A pack
 *  that does not declare exactly this is not the shape read below — spelling is not
 *  identity, so the reader checks the DECLARATION rather than duck-typing `budget`. */
export const BANK_PACK_SCHEMA = "clara.bank-pack/v1";

export type BankPackBudget = { lines: number; candidates: number; truncated: boolean | null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The pack's DB-computed budget, or `null` when this payload is not a
 * `clara.bank-pack/v1` carrying one.
 *
 * BOTH COUNTS MUST BE PRESENT AND FINITE, or the whole block is refused. A card
 * showing "12 lines" beside a blank candidate count would read as "no candidates",
 * which is a claim about the ledger that a missing field does not support.
 * `truncated` is separately three-valued — `true`, `false`, or unknown — because
 * absence of the flag is not evidence the pack was complete.
 */
export function bankPackBudget(pack: unknown): BankPackBudget | null {
  if (!isRecord(pack)) return null;
  if (pack.schema !== BANK_PACK_SCHEMA) return null;
  const budget = pack.budget;
  if (!isRecord(budget)) return null;
  const { lines, candidates, truncated } = budget;
  if (typeof lines !== "number" || !Number.isFinite(lines)) return null;
  if (typeof candidates !== "number" || !Number.isFinite(candidates)) return null;
  return { lines, candidates, truncated: typeof truncated === "boolean" ? truncated : null };
}

/**
 * A JSON STRING that is really a figure. This is not defensive typing — it is the live
 * settle path, measured: `clara._settle_from_bank_line_core`'s `_finish_op` payload
 * builds `'residue_cents', v_res->>'residue_cents'`
 * (0121_f_a3_pr1b_agent_limb.sql:1628), and `->>` returns TEXT. That object is returned
 * verbatim by `wake_settle_from_bank_line`, passed through `classifyBankResult` into
 * `bank_act.result`, and landed on a card as a raw cents figure until this test existed.
 *
 * The neighbouring `'settlement_cents', v_settle_cents` in the SAME object is a real JSON
 * number and was already dropped — which is exactly why a type-based filter was not
 * enough: one payload carried the same class of value in two different JSON types.
 *
 * Deliberately permissive about SHAPE (leading sign, thousands separators, a decimal
 * part) and deliberately anchored, so it never matches an id that merely contains digits.
 * A uuid, an op key and a status token all survive it; `"1250"`, `"-1250"`, `"12,500.00"`
 * do not.
 */
const NUMERIC_TEXT = /^[+-]?\d[\d,_]*(\.\d+)?$/;

/** How many result fields a card will show. A per-verb payload is small by
 *  construction, and a cap keeps a future verb's larger return from turning a chat
 *  card into a data dump. */
export const LEDGER_FIELD_CAP = 8;

/**
 * The ledger result's renderable leaves: `[field name, value]` pairs for every STRING
 * and BOOLEAN entry, sorted by key so the same payload always renders in the same
 * order (a jsonb object's key order is not a contract).
 *
 * EVERYTHING ELSE IS DROPPED, each for its own reason:
 *   - NUMBERS, deliberately and by construction — see this module's header. This
 *     payload carries no version token, so nothing here can vouch for a numeral in it.
 *   - STRINGS THAT ARE REALLY NUMERALS, for exactly the same reason and measured on the
 *     live settle path (`NUMERIC_TEXT`'s own note). The JSON type a figure arrives in is
 *     the producer's choice, not a statement about whether it is a figure.
 *   - objects and arrays, because `[object Object]` is not a rendering (this is
 *     V14ReceiptCards.tsx's own long-standing rule, unchanged).
 *   - `null`/`undefined`, because an empty value row asserts nothing.
 *   - empty and whitespace-only strings, same reason.
 */
export function ledgerTextFields(result: unknown): [string, string][] {
  if (!isRecord(result)) return [];
  const out: [string, string][] = [];
  for (const key of Object.keys(result).sort()) {
    const value = result[key];
    if (typeof value === "boolean") {
      out.push([key, String(value)]);
    } else if (typeof value === "string") {
      const text = value.trim();
      if (!text) continue;
      if (NUMERIC_TEXT.test(text)) continue;
      out.push([key, text]);
    }
  }
  return out.slice(0, LEDGER_FIELD_CAP);
}

/**
 * The version token a pack DECLARED when this module could not read it, or `null`.
 *
 * TWO DIFFERENT SILENCES, told apart. `bankPackBudget` returning null covers both "this
 * payload declares a schema I do not know" and "this payload declares nothing at all",
 * and only the first is a fact a human can act on — it means the runtime's pack shape
 * moved ahead of this page. The second is an older or malformed payload with nothing to
 * report, and inventing a sentence for it would be noise on a card that is otherwise
 * correct.
 *
 * Returns null for the schema this module DOES read, so a caller can use a non-null
 * result as "declared, and unread" without re-checking. The token is the DB's own and is
 * rendered verbatim; it is length-capped because it is untrusted text on the wire and a
 * card is not a place for an unbounded string.
 */
export function unreadPackSchema(pack: unknown): string | null {
  if (!isRecord(pack)) return null;
  const schema = pack.schema;
  if (typeof schema !== "string") return null;
  const text = schema.trim();
  if (!text || text === BANK_PACK_SCHEMA) return null;
  return text.slice(0, 120);
}
