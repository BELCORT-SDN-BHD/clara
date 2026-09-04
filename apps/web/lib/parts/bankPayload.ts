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
//           booleans only; every numeral is dropped, so no unversioned payload can put
//           a figure on screen no matter what a future verb starts returning.
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
    if (typeof value === "boolean") out.push([key, String(value)]);
    else if (typeof value === "string" && value.trim()) out.push([key, value]);
  }
  return out.slice(0, LEDGER_FIELD_CAP);
}
