// @frozen
//
// statementFacts_v4 — THE PROMPT CLOSURE for the `statement_facts` WITNESS PAIR. The successor to
// statementFacts.v3.prompts.mjs, and the first version of this family whose two channels answer
// two different vocabularies.
//
// WHAT v4 CHANGES, AND WHY (#1037, the producer half of #990). #990 / migration 0291 gave
// `clara.bank_statement_lines` a per-line SOURCE CITATION — `citation_extraction_id`,
// `citation_page`, `citation_region` — and taught `clara._persist_statement_core_v2` to bank one
// off reader1's own raw payload lines. Nothing could ever state one, because v3's `lineShape`
// declares exactly five keys and `toWriterLines` rebuilds every line from six named keys, both
// frozen. So every real machine-lane line rendered "No source citation was recorded for this
// line." v4 asks for the missing fact and nothing else:
//
//   (1) THE TEXT CHANNEL IS ASKED TO CITE. `statementWitnessTextSchema` adds ONE nullable key per
//       line — `region_idx` — and the text system prompt adds ONE instruction block telling the
//       reader to name the bracketed number of the region it read that row from. The seven
//       SHARED_RULES are carried unchanged: v4's text system prompt IS v3's, extended.
//
//   (2) THE VISION CHANNEL IS NOT. This is the one place where the written contract
//       (`CUT-PLAN.md` section 3.2 and `reports/wave3-lane08-ticket990.md`'s successor contract,
//       which both say "the vision-channel prompt") cannot be built as written, and the reason is
//       measured rather than argued: the numbered region list is shown ONLY to the text channel
//       (`buildStatementWitnessTextPrompt`), the vision channel is handed the original bytes with
//       no regions at all, and 0291's splice reads the citation off `v_r1->'lines'` — reader1,
//       which `persistStatementWitnessPair` fills from the TEXT read. A vision-side index would
//       have nothing to resolve against and would land in reader2, which the persist core never
//       reads. So the stanza goes to the channel that can honour it, and the vision system prompt
//       and schema are carried byte for byte.
//
//   (3) THE HASH NAMES v4, on BOTH channels — v3's own rule (3), restated: the hash exists to say
//       WHICH prompt version produced a stored read, so it must move with the version even for
//       the channel whose text did not change.
//
// WHAT IS RE-EXPORTED RATHER THAN COPIED, and why that is the rule here. The cut convention
// (`CUT-PLAN.md` section 2.1, deduced from the v20 -> v21 and v4 -> v5 diffs) is to re-export
// every UNCHANGED predecessor symbol rather than duplicate it, so the closure hash-locks the old
// text ONCE. Everything below that v4 does not change — the header field roster, the DB-read line
// field roster, the inert-data line, the vision system prompt, the vision schema, the
// numbered-region user-prompt builder with its fence neutralization and its 60k budget, and both
// writer relays — is imported from statementFacts.v3.prompts.mjs and re-exported by name. That
// file's header carries the reasoning for every one of them and is still the place to read it.
// This does NOT contradict v3's own "no cross-family coupling" law: witnessFacts is a different
// FAMILY, statementFacts.v3 is this family's own predecessor, and a same-family cross-version
// import is the chatTurn.v10 -> v11 precedent statementFacts.v3.impl.ts already cites.
//
// `region_idx` IS NOT A FIELD `clara._stmt_lines_norm` READS, and it never reaches the writer. It
// is an INDEX INTO THE PROMPT, resolved back to `{page, region}` by
// statementFacts.v4.citations.mjs before the payload is built — so what the DB stores is the
// region's own `clara.document_regions.locator` and its page, never a number the model invented.
// It is therefore kept OUT of `STATEMENT_LINE_FIELDS` (whose documented contract is "the exact set
// `_stmt_lines_norm` reads") and carried in its own roster, which the hash folds separately.
//
// THE KEY IS REQUIRED ON THE WIRE, AND NULLABLE IN VALUE — never `.optional()` (ADV-1037-04).
// The citation is OPTIONAL AS A FACT and that optionality is carried by the value `null`, which
// the prompt asks for in terms. It is not carried by omitting the key, and it must not be: this
// family calls `generateObject` through `statementFacts.v2.services.mjs`, which passes no
// provider options, and `@ai-sdk/openai` defaults `strictJsonSchema` to TRUE — so the schema goes
// out strict, OpenAI guarantees every required key comes back, and a schema whose `required` does
// not list every property is refused by the API outright. `.optional()`, `.catch(null)` and
// `.default(null)` all drop the key out of `required` (measured on zod 4.4.3 + ai 7.0.77), so
// "tolerating" an omitted key would trade a failure nobody has seen for one every statement read
// would hit. It is also the repo's own documented wire rule — witnessFacts.v1.prompts.mjs:24-27,
// "a provider's strict structured-output mode is happiest with a FLAT, all-required,
// nullable-valued object". THE COST IS STATED RATHER THAN HIDDEN: if a provider ever did answer
// in v3's shape, the schema miss is classified `internal`, which is not retryable, so the paid
// two-channel read settles failed instead of landing uncited. Cell 1037.t3 measures both halves.
//
// FROZEN BY THE SAME DECISION AS v3 (design M8): a prompt edit IS a workflow-body edit and ships
// as statementFacts.v5 plus a ceremony.

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  STATEMENT_HEADER_FIELDS,
  STATEMENT_LINE_FIELDS,
  STATEMENT_WITNESS_INERT_DATA_LINE,
  STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT as STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT_V3,
  STATEMENT_WITNESS_VISION_SYSTEM_PROMPT,
  buildStatementWitnessTextPrompt,
  buildStatementWitnessVisionPrompt,
  statementWitnessSchema,
  toWriterHeader,
  toWriterLines,
} from "./statementFacts.v3.prompts.mjs";

export {
  STATEMENT_HEADER_FIELDS,
  STATEMENT_LINE_FIELDS,
  STATEMENT_WITNESS_INERT_DATA_LINE,
  STATEMENT_WITNESS_VISION_SYSTEM_PROMPT,
  buildStatementWitnessTextPrompt,
  buildStatementWitnessVisionPrompt,
  statementWitnessSchema,
  toWriterHeader,
  toWriterLines,
};

/** The one key v4 adds to the TEXT channel's answer vocabulary. Deliberately NOT folded into
 *  `STATEMENT_LINE_FIELDS`, whose documented contract is the set `clara._stmt_lines_norm` reads —
 *  this one is an index into the prompt's own numbered rendering, never a column. */
export const STATEMENT_LINE_CITATION_FIELDS = Object.freeze(["region_idx"]);

/** The TEXT channel's per-line shape: v3's five fields plus the citation index. Declared here
 *  rather than composed from v3's `lineShape`, which is module-private to v3 — the five field
 *  describes below are v3's own, carried verbatim. */
const textLineShape = z.object({
  entry_date: z.string().nullable().describe("ISO YYYY-MM-DD — the row's printed transaction/entry date"),
  value_date: z.string().nullable().describe("ISO YYYY-MM-DD, or null if the statement prints no separate value date for this row"),
  description: z.string().nullable().describe("the row's printed description, verbatim — never load-bearing, never guessed into agreement"),
  amount_cents: z.number().int().nullable().describe("the row's SIGNED whole-cents amount: negative = money OUT of the account, positive = money IN — never zero"),
  running_balance_cents: z.number().int().nullable().describe("the row's PRINTED running balance, in whole cents, or null if the statement prints none for this row"),
  region_idx: z.number().int().nullable().describe("the number in square brackets of the numbered region you actually read this row from, or null if you cannot name a single one — never a guess"),
});

/** THE TEXT CHANNEL'S SCHEMA. The vision channel keeps v3's (`statementWitnessSchema`, re-exported
 *  above): the two channels now genuinely answer different vocabularies, so a vision answer that
 *  volunteered a `region_idx` is STRIPPED by its own schema rather than relayed into reader2. The
 *  header shape is v3's own object, reached through the schema it already lives in — one
 *  declaration, never a second copy that could drift from the roster the DB reads. */
export const statementWitnessTextSchema = z.object({
  header: statementWitnessSchema.shape.header,
  lines: z.array(textLineShape).describe("every transaction row, in the PRINTED order — do not sort, dedupe, or renumber; line_no is assigned by the server from this array's own order"),
});

/** v3's text system prompt, EXTENDED. The seven shared rules, the inert-data line and the
 *  two-reader framing are carried by construction: this version appends one block and changes
 *  nothing above it. */
export const STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT = [
  STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT_V3,
  "",
  "ONE MORE THING, AND IT IS YOURS ALONE — the other reader has no regions to name.",
  "",
  "8. SAY WHERE YOU READ EACH ROW. For every transaction line you report, also answer",
  "   `region_idx`: the number in square brackets of the numbered region you actually read that",
  "   row from. Report the number as it is printed in the brackets — never renumber, never add or",
  "   subtract, and never infer a number from a region's position in the list. If a row was not",
  "   read from any one region — it was split across several, or you cannot tell which — answer",
  "   region_idx null. An honest null is worth more than a confident guess here for the same",
  "   reason as everywhere else (rule 3): a person reading the result is shown the page and the",
  "   patch of it you name, and a wrong number points them at the wrong part of their own bank",
  "   statement, which is worse than being told plainly that no source was recorded.",
].join("\n");

/** THE PROMPT HASH — v3's mechanism, renamed to v4 and widened by the citation roster, so a
 *  stored read is identifiable as v4-prompted on BOTH channels (v3's rule (3)).
 *  @param {"text"|"vision"} channel */
export function statementWitnessPromptHash(channel) {
  const system = channel === "text" ? STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT : STATEMENT_WITNESS_VISION_SYSTEM_PROMPT;
  const vocabulary = channel === "text"
    ? [...STATEMENT_HEADER_FIELDS, ...STATEMENT_LINE_FIELDS, ...STATEMENT_LINE_CITATION_FIELDS]
    : [...STATEMENT_HEADER_FIELDS, ...STATEMENT_LINE_FIELDS];
  return createHash("sha256")
    .update(JSON.stringify(["statementFacts.v4", channel, system, vocabulary]), "utf8")
    .digest("hex");
}
