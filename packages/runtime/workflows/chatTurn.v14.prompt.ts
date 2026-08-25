// @frozen
//
// FROZEN — part of the chatTurn_v14 closure (F-A3 PR-3, OQ-6: BANK CHAT PARITY, owner ruling
// 2026-08-25). A NEW frozen closure beside byte-untouched chatTurn_v1..v13 (ARCHITECTURE
// Appendix A).
//
// A THIN EXTENSION of v13's prompt, the same way v13 extends v11's: re-exports every carried
// shape and adds exactly what OQ-6 needs — `BANK_GUIDANCE`/`SYSTEM_PROMPT_V14`, `ClaraPartV14`,
// and `toTypedParts_v14`/`hasCodingIntent_v14` (the part-promotion law + the C-19 terminal
// invariant's intent signal, both extended to the twelve bank ACT tools — get_bank_pack, the
// read, is deliberately excluded from both: a read cannot leave the client's books changed with
// nothing recorded, so it carries no "must end with a card" obligation).

import { type AiContentPart, type ClaraPart, type RefusalPart } from "./chatTurn.v10.prompt.js";
import { SYSTEM_PROMPT_V13, toTypedParts_v13, hasCodingIntent_v13 } from "./chatTurn.v13.prompt.js";
import type { EntryPostedPart, QuestionOpenedPart } from "./chatTurn.v13.post.js";
import { POST_TOOL, OPEN_QUESTION_TOOL } from "./chatTurn.v13.post.js";
import type { BankActPart, BankPackPart } from "./chatTurn.v14.bank.js";
import { BANK_ACT_TOOLS, BANK_GET_PACK_TOOL } from "./chatTurn.v14.tools.js";

export { CLARIFY_FRAMING, DRAFT_TOOL, clarifyTool, draftJournalEntryInputSchema, findClarifyCall } from "./chatTurn.v10.prompt.js";
export type { AiContentPart, ClaraPart, DraftToolResult, JeReviewPart, RefusalPart } from "./chatTurn.v10.prompt.js";
export { SYSTEM_PROMPT_V13 };

/** Widens ClaraPartV13's set with the two bank part kinds. Every carried consumer keeps working
 *  on the parts it already knows; only OQ-6-aware code needs to know about these two. */
export type ClaraPartV14 = ClaraPart | EntryPostedPart | QuestionOpenedPart | BankActPart | BankPackPart;

export const BANK_GUIDANCE = [
  "THE BANK LANE, CHAT-DRIVEN — AND THE ONE THING THAT MAKES IT DIFFERENT FROM CODING.",
  "",
  "You can now match, settle, reconcile, register accounts and resolve bank exceptions in this",
  "client's own ledger, under your own identity, with your rationale recorded on the receipt.",
  "ALWAYS call get_bank_pack first for the account in question — every bank act needs the digest",
  "that call returns, proving your act is grounded in a real, current read of this client's own",
  "bank state, not a guess.",
  "",
  "THE DATABASE DECIDES, NOT YOU. Every bank act re-evaluates the ledger's own checks and either",
  "goes through or returns a typed refusal naming what stopped it. A refusal is a NORMAL outcome —",
  "say plainly what it means and what would need to change, and do not retry the identical call",
  "hoping for a different answer.",
  "",
  "SOME OF THESE VERBS POST TO THE BOOKS. settle_from_bank_line and resolve_and_book_bank_line",
  "always do. match_bank_line ALSO does, whenever you supply an adjustment leg to close a",
  "difference — a plain match with no adjustment mints nothing, but an adjustment leg POSTS a",
  "new, already-approved entry just as surely as settling does. Treat every posting-capable",
  "call — including a match that carries an adjustment — with the same care as post_journal_entry:",
  "only when the human has asked for the underlying line, difference or exception to be booked,",
  "never as a default. The rest (matching with NO adjustment, unmatching, reconciling, registering",
  "an account, proposing an exception or an identifier promotion) are ordinary bank-lane actions a",
  "bookkeeper does routinely — you may take them when they plainly follow from what the human",
  "asked, the same judgement you already apply to reads. When you are not sure whether a match",
  "needs an adjustment leg — and therefore whether it will post — ask rather than guess.",
].join("\n");

export const SYSTEM_PROMPT_V14 = `${SYSTEM_PROMPT_V13}\n\n${BANK_GUIDANCE}`;

function isRefusal(v: unknown): v is RefusalPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "refusal";
}
function isBankAct(v: unknown): v is BankActPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "bank_act";
}
function isBankPack(v: unknown): v is BankPackPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "bank_pack";
}

/** toTypedParts_v13's own promotion, extended for the two bank result shapes. Bank acts dedupe
 *  WITHIN this segment by their own op_key (the same "a retry sequence yields the refusal AND
 *  the card and both render" law v13's own docstring states); bank pack reads are never deduped —
 *  each is a fresh, informational read the transcript should show in full. */
export function toTypedParts_v14(content: readonly AiContentPart[]): ClaraPartV14[] {
  const promoted = toTypedParts_v13(content);
  const out: ClaraPartV14[] = [...promoted];
  const seenBankActs = new Set<string>();
  for (const p of content) {
    if (p.type !== "tool-result") continue;
    const tr = p as { toolCallId: string; toolName: string; output: unknown };
    if (!BANK_ACT_TOOLS.includes(tr.toolName) && tr.toolName !== BANK_GET_PACK_TOOL) continue;
    const output = (tr.output ?? {}) as { admitted?: unknown; pack?: unknown; refusal?: unknown };
    if (isBankAct(output.admitted)) {
      if (seenBankActs.has(output.admitted.op_key)) continue;
      seenBankActs.add(output.admitted.op_key);
      out.push(output.admitted);
    } else if (isBankPack(output.pack)) {
      out.push(output.pack);
    } else if (isRefusal(output.refusal)) {
      const key = `${output.refusal.code}:${output.refusal.reason ?? ""}:${output.refusal.message}`;
      if (!out.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) out.push(output.refusal);
    }
  }
  return out;
}

/** The C-19 "coding/acting intent" signal, extended: any of the twelve bank ACT tools is intent
 *  too (get_bank_pack, the read, is not — see this file's header). */
export function hasCodingIntent_v14(content: readonly AiContentPart[]): boolean {
  if (hasCodingIntent_v13(content)) return true;
  return content.some((p) => p.type === "tool-call" && BANK_ACT_TOOLS.includes((p as { toolName?: string }).toolName ?? ""));
}

export { POST_TOOL, OPEN_QUESTION_TOOL };
