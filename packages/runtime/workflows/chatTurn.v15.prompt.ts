// @frozen
//
// FROZEN — part of the chatTurn_v15 closure (F-A6 PR-2: THE AUDITED FREEFORM READ). A NEW frozen
// closure beside byte-untouched chatTurn_v1..v14 (ARCHITECTURE Appendix A).
//
// A THIN EXTENSION of v14's prompt, the same way v14 extends v13's: re-exports every carried
// shape and adds exactly what F-A6 needs — `FREEFORM_GUIDANCE`/`SYSTEM_PROMPT_V15` and
// `toTypedParts_v15`.
//
// `ClaraPartV15` IS `ClaraPartV14`, DELIBERATELY — NO NEW PART KIND. A chart or table part type
// is a NAMED NON-GOAL of this design (Annex J: "`PART_CATALOG` untouched — the SQL is already
// visible in the `tool_call` chip; charts are F-A5"), and the `freeform_result` card belongs to
// P6's own later batched wire bump (apps/web/lib/parts/types.ts:8 names it beside
// `close_proposal`). Adding one here would ship a part the dashboard cannot render and would
// claim a wire slot P6 has already planned. A refusal rides the EXISTING `refusal` part; the
// query, its scope note and its rows ride the `tool_call`/`tool_result` pair every tool already
// produces.
//
// `hasCodingIntent_v15` IS `hasCodingIntent_v14`, ALSO DELIBERATELY. The C-19 terminal invariant
// asks "did this turn change the client's books and produce nothing to show for it". A freeform
// read changes nothing — the executing role holds no write grant anywhere — so it carries no
// "must end with a card" obligation, exactly as `get_bank_pack` (v14's own read verb) does not.

import { type AiContentPart, type RefusalPart } from "./chatTurn.v10.prompt.js";
import { SYSTEM_PROMPT_V14, toTypedParts_v14, hasCodingIntent_v14, type ClaraPartV14 } from "./chatTurn.v14.prompt.js";
import { FREEFORM_READ_TOOL, FREEFORM_ENUMERATED_RELATIONS, FREEFORM_ROW_CAP_MAX } from "./chatTurn.v15.freeform.js";

export { CLARIFY_FRAMING, DRAFT_TOOL, clarifyTool, draftJournalEntryInputSchema, findClarifyCall } from "./chatTurn.v10.prompt.js";
export type { AiContentPart, ClaraPart, DraftToolResult, JeReviewPart, RefusalPart } from "./chatTurn.v10.prompt.js";
export { POST_TOOL, OPEN_QUESTION_TOOL, SYSTEM_PROMPT_V14 } from "./chatTurn.v14.prompt.js";

/** Unchanged from v14 — see this file's header for why F-A6 adds no part kind. */
export type ClaraPartV15 = ClaraPartV14;

/**
 * THE LAW-34 AUDIT LINE, MODEL-FACING. The migration's own tail prints the authoritative version
 * (derived from the catalog at install time, Annex E.1); this is the same enumeration told to the
 * model so it composes SQL against the surface that actually exists instead of guessing and
 * spending a refusal. The GRANT remains the wall — nothing the model reads here can widen it.
 */
export const FREEFORM_GUIDANCE = [
  "READING THE BOOKS FREELY — AND THE THREE THINGS THAT MAKE IT SAFE TO OFFER YOU.",
  "",
  `You have ${FREEFORM_READ_TOOL}: one read-only SELECT over this firm's own books, run by the`,
  "database on a role that holds no write permission anywhere. Use it when the typed tools do not",
  "answer the question that was actually asked — a comparison across periods, an unusual grouping,",
  "a total nobody built a report for. Prefer a typed tool when one fits: it is faster and its",
  "answers are authoritative.",
  "",
  "1. THE SCOPE IS NOT YOURS TO SET. Your query is scoped by the database before it runs — to this",
  "firm always, and to this client too when the conversation is pinned to one. Do NOT add a",
  "firm_id or client_id filter of your own: it is redundant at best and misleading at worst. Every",
  "result tells you the scope it was compiled under; when it says the read was narrowed to one",
  "client, say so rather than presenting it as a firm-wide answer.",
  "",
  "2. WHAT COMES BACK IS NARRATIVE, NEVER AUTHORITY. Every result is stamped authority=narrative",
  "and claim_eligible=false. You may say the number, reason with it, and cite the read. You may",
  "NOT put it in a journal entry, a report, or a recorded fact — those come only from the",
  "authoritative doors. This is not a style rule; the role you read with cannot write anywhere.",
  "",
  "3. EVERY READ IS RECEIPTED, INCLUDING THE REFUSED ONES. Your SQL and your stated purpose are",
  "recorded against this turn and are readable by the firm. Write the purpose as if a colleague",
  "will read it, because one can.",
  "",
  "WHAT YOU MAY READ (schema `clara`, and nothing else — a table outside this list is refused by",
  "the database, not by a filter):",
  FREEFORM_ENUMERATED_RELATIONS.join(" · "),
  "",
  "SHAPE RULES THE DATABASE ENFORCES, so you do not have to guess: exactly ONE statement, a SELECT",
  "or VALUES only, no data-modifying CTE, no SET/RESET (they are syntax errors inside the wrapper),",
  `no table-returning function calls, and a ceiling of ${FREEFORM_ROW_CAP_MAX} rows / 1 MiB / five seconds.`,
  "A read that hits a ceiling returns NOTHING, not a truncated answer — so aggregate or narrow",
  "rather than fetching everything and summarising. A refusal is a NORMAL outcome: say plainly what",
  "you tried and offer a narrower read; do not re-run the identical query hoping for a different",
  "answer.",
].join("\n");

export const SYSTEM_PROMPT_V15 = `${SYSTEM_PROMPT_V14}\n\n${FREEFORM_GUIDANCE}`;

function isRefusal(v: unknown): v is RefusalPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "refusal";
}

/**
 * v14's own promotion, extended with the freeform tool's refusal. A successful read promotes NO
 * new part — `toTypedParts_v13` already pushes the `tool_call` and `tool_result` pair for every
 * tool, which is where the SQL, the scope note and the rows are visible (this file's header).
 * A refusal dedupes on code+reason+message, the same law v13/v14 state.
 */
export function toTypedParts_v15(content: readonly AiContentPart[]): ClaraPartV15[] {
  const out: ClaraPartV15[] = [...toTypedParts_v14(content)];
  for (const p of content) {
    if (p.type !== "tool-result") continue;
    const tr = p as { toolName: string; output: unknown };
    if (tr.toolName !== FREEFORM_READ_TOOL) continue;
    const output = (tr.output ?? {}) as { refusal?: unknown };
    if (!isRefusal(output.refusal)) continue;
    const r = output.refusal;
    const key = `${r.code}:${r.reason ?? ""}:${r.message}`;
    if (!out.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) out.push(r);
  }
  return out;
}

/** Unchanged from v14 — a read is not acting intent (this file's header). Re-exported under its
 *  own name so v15's impl reads consistently, not because the behaviour moved. */
export function hasCodingIntent_v15(content: readonly AiContentPart[]): boolean {
  return hasCodingIntent_v14(content);
}
