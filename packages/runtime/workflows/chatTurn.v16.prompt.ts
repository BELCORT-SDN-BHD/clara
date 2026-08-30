// @frozen
//
// FROZEN — part of the chatTurn_v16 closure (P6-1: THE FOUR-CARD WIRE BUMP — ruling Q8,
// mohe-grill-rulings-2026-08-27.md:62-72, run at 裁-9's tier (c) depth). A NEW frozen closure
// beside byte-untouched chatTurn_v1..v15 (ARCHITECTURE Appendix A: a behavioural change ships
// as a new _vN export, never an in-place edit — registry.ts repoints `chatTurn:` here).
//
// A THIN EXTENSION of v15's prompt, the same way v15 extends v14's: it re-exports every
// carried shape and adds exactly what Q8 needs — `ClaraPartV16` (v15's union widened by the
// four kinds `chatTurn.v16.parts.ts` declares), `toTypedParts_v16`, and `hasCodingIntent_v16`.
//
// WHY THIS VERSION EXISTS, IN ONE SENTENCE. v15 said in its own header that `ClaraPartV15` IS
// `ClaraPartV14` and that "the `freeform_result` card belongs to P6's own later batched wire
// bump" (chatTurn.v15.prompt.ts:10-17). This is that bump. THE VERSION NUMBER IS `_v16`, NOT
// the `chatTurn_v15` every prior document names: v15 was consumed on 2026-08-29 by F-A6 PR-2
// (#423, Fly v69) and is frozen (fe-train-plan-2026-08-30.md §0 ①, re-verified by this lane at
// registry.ts's own `chatTurn: chatTurn_v15` line and at chatTurn.v15.prompt.ts:33's
// `export type ClaraPartV15 = ClaraPartV14;`).
//
// `SYSTEM_PROMPT_V16` IS `SYSTEM_PROMPT_V15`, DELIBERATELY, AND IT IS RE-EXPORTED RATHER THAN
// REDEFINED. Nothing here asks the model to do anything new: the one part this closure emits
// is promoted MECHANICALLY from a tool result the model already produces, so telling the model
// about a card would be telling it about a rendering decision it does not make. Not one word
// of guidance changes, so not one word is copied — a retyped prompt is a prompt that can
// silently diverge (review law 3 applied to prose).
//
// ONE OF THE FOUR HAS AN EMITTER IN THIS CLOSURE. THREE DO NOT, AND THAT IS A MEASURED GRANT
// FACT RATHER THAN AN OVERSIGHT. Q8 is a WIRE ruling — it widens the union a transcript can
// carry so a card of each kind can render — and Q8's own design is workbench-first: all four
// read surfaces already ship in `apps/web` (`loadFirmActivity`, `loadFirmOpenQuestions`,
// `listCloseProposalsForRun`, `listFreeformReads`). The four kinds' PRODUCERS are not all in
// the chat lane, and the walls that keep them out are the ones under test:
//
//   `freeform_result` IS emitted here, by `toTypedParts_v16`, off an ADMITTED
//     `read_books_freeform` result. That tool is v15's and this closure calls it unchanged;
//     the DB verb's own answer carries `read_id` (0131:1266), which is the whole part. This is
//     precisely the emitter chatTurn.v15.freeform.ts:34-37 said P6 would add.
//
//   `firm_question` CANNOT BE emitted here. The only agent-side door that opens one is
//     `clara.wake_open_firm_question`, walled twice: its EXECUTE grant is to `clara_wake_filing`
//     ALONE (0126_f_a7_beta_filing_verb.sql:2103), and its wake-kind allowlist row is
//     `('filing', 'wake_open_firm_question')` alone (0126:2076). A chat turn presents an
//     `interactive` / `interactive_client` credential on `clara_wake_interactive`
//     (chatTurn.v15.infra.ts's mint census), so both walls refuse it. Its producer is the
//     filing lane.
//
//   `close_proposal` CANNOT BE emitted here — and the reason is the ALLOWLIST, not the grant,
//     which is worth stating because the grant looks permissive: `clara.wake_propose_close` IS
//     granted to `clara_wake_interactive` (0138_f_a4_pr_1c_close_agent_limb.sql:2548), the same
//     role a chat turn's write pool runs on. What refuses a chat turn is
//     `clara._close_wake_ctx`, which every close wrapper enters through: it calls
//     `assert_wake_allowed(w.wake_kind, p_verb)`, and this verb's allowlist carries exactly one
//     row, `('close_prep', 'wake_propose_close')` (0138:2531). The same helper then requires the
//     credential's own client pin to resolve to the subject. Its producer is `closePrep_v1`.
//
//   `agent_receipt` CANNOT BE emitted here. Its read surface is `clara.agent_receipts_visible`,
//     granted to `clara_authenticated` — the HUMAN session (0103_f_a7_pi_additive.sql:1030) —
//     and 0103's own tail asserts (:1146-1153) that `clara_agent_ro`,
//     `clara_wake_interactive`, `clara_wake_proactive` and `clara_runtime` hold NO select on
//     it, raising CLR10 at install time if any of them ever does. The card reads it on the
//     human's own session, which is the design; no agent lane may.
//
// Widening any of those three to give this body an emitter would weaken a mechanism that is
// itself the thing under test (hard constraint 14, whose operative clause is exactly this). So
// the three ride the wire as DECLARED shapes whose producers stay in their own lanes, and this
// file emits the one it can lawfully emit. All four are declared in one place —
// chatTurn.v16.parts.ts — because P6-2's reader transcribes from the declarer.
//
// `hasCodingIntent_v16` IS `hasCodingIntent_v15`, AND SO THE C-19 TERMINAL SET IS UNTOUCHED.
// C-19 asks whether a turn that ACTED on the books ended with something to show for it. A
// freeform read acts on nothing — `clara_freeform_ro` holds no DML anywhere — so a read-only
// turn still carries no "must end with a card" obligation, exactly as v15 reasoned. Promoting
// a card for that read does not change what the turn DID; a `freeform_result` part therefore
// does NOT join the terminal set either (chatTurn.v16.ts carries that check byte-unchanged).

import { type AiContentPart } from "./chatTurn.v10.prompt.js";
import { SYSTEM_PROMPT_V15, toTypedParts_v15, hasCodingIntent_v15, type ClaraPartV15 } from "./chatTurn.v15.prompt.js";
import { FREEFORM_READ_TOOL, isAdmittedFreeformRead } from "./chatTurn.v15.freeform.js";
import type {
  AgentReceiptPart,
  CloseProposalPart,
  FirmQuestionPart,
  FreeformResultPart,
} from "./chatTurn.v16.parts.js";

export { CLARIFY_FRAMING, DRAFT_TOOL, clarifyTool, draftJournalEntryInputSchema, findClarifyCall } from "./chatTurn.v10.prompt.js";
export type { AiContentPart, ClaraPart, DraftToolResult, JeReviewPart, RefusalPart } from "./chatTurn.v10.prompt.js";
export { POST_TOOL, OPEN_QUESTION_TOOL, SYSTEM_PROMPT_V14 } from "./chatTurn.v14.prompt.js";
export { FREEFORM_GUIDANCE, SYSTEM_PROMPT_V15 } from "./chatTurn.v15.prompt.js";
export type { ClaraPartV15 } from "./chatTurn.v15.prompt.js";
export { CHATTURN_V16_PART_KINDS } from "./chatTurn.v16.parts.js";
export type {
  AgentReceiptPart,
  CloseProposalPart,
  ClaraPartV16Additions,
  FirmQuestionPart,
  FreeformResultPart,
} from "./chatTurn.v16.parts.js";

/** Q8's wire bump: v15's union WIDENED by the four kinds, never re-cut. Every carried consumer
 *  keeps working on the parts it already knows; only Q8-aware code needs to know about these
 *  four. The catalog arithmetic this lands is 22 + 4 = 26 (fe-train-plan-2026-08-30.md §0 ②;
 *  the reader's own header at apps/web/lib/parts/types.ts:15 already states the target). */
export type ClaraPartV16 =
  | ClaraPartV15
  | AgentReceiptPart
  | FirmQuestionPart
  | CloseProposalPart
  | FreeformResultPart;

/** v15's prompt, BY IDENTITY rather than by re-derivation — see this file's header for why
 *  nothing in the guidance moves. */
export const SYSTEM_PROMPT_V16 = SYSTEM_PROMPT_V15;

/**
 * The `read_id` of an ADMITTED freeform read, or `null` for anything else. Never a cast.
 *
 * TWO POSITIVE ADMISSIONS, NOT ONE, because there are two envelopes. The tool's own result is
 * `{ ok: true, read }` | `{ ok: false, refusal }` (chatTurn.v15.freeform.ts:104), and `read` is
 * the DB verb's jsonb, which carries its OWN `ok`/`outcome` pair. This function tests the outer
 * flag POSITIVELY and then hands the inner envelope to the FROZEN `isAdmittedFreeformRead` —
 * taken by import, never retyped (review law 3), so the one place a runtime bug could turn a
 * refusal into an admission stays the one place F-A6 already proved. Nothing here tests for
 * `'fail'`: an unknown future value, a missing key, a null and a malformed envelope are all
 * non-admitting (the F-A2 consumer contract, D26).
 *
 * THE ID IS VALIDATED, AND A VALUE THAT CANNOT BE TRUSTED YIELDS NO CARD. `read_id` is a
 * bigint arriving as a jsonb number; a value past `Number.MAX_SAFE_INTEGER` has already lost
 * digits by the time this code sees it, so it fails closed rather than minting a part that
 * addresses the wrong receipt row — a missing card is a gap, a card pointing at another firm's
 * read would be a lie. (A string form is accepted too: the id travels as jsonb through
 * `withFreeformRead`, and reading it defensively costs nothing.) A refused read is NOT handled
 * here at all — `toTypedParts_v15` already promoted its `refusal` part, and this closure adds
 * no second voice to that.
 */
export function admittedFreeformReadId(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const envelope = output as { ok?: unknown; read?: unknown };
  if (envelope.ok !== true) return null;
  if (!isAdmittedFreeformRead(envelope.read)) return null;
  const raw = (envelope.read as { read_id?: unknown }).read_id;
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? String(raw) : null;
  if (typeof raw === "string") return /^[1-9][0-9]*$/.test(raw) ? raw : null;
  return null;
}

/**
 * v15's own promotion, extended with the freeform read's SUCCESS card.
 *
 * v15 promoted only the read's REFUSAL (its header: "a successful read promotes NO new part —
 * `toTypedParts_v13` already pushes the `tool_call` and `tool_result` pair"). That was correct
 * while no card existed to promote into; Q8 mints one, so an admitted read now yields a
 * `freeform_result` addressing its receipt. The refusal arm is untouched and still lives in
 * v15's body, reached by the `toTypedParts_v15` call below — this file adds an arm, it does not
 * re-implement one.
 *
 * DEDUPED WITHIN THE SEGMENT BY `read_id`, which is the `bank_act` op_key discipline rather
 * than the `bank_pack` one, and the difference is a property of the data rather than a
 * preference. `bank_pack` is deliberately never deduped because two genuine reads of one
 * account can be byte-identical — it carries no per-call identity, so any key would have
 * collapsed real reads. A freeform read carries the receipt row's own primary key, freshly
 * minted per call, so two distinct reads can never share one: a dedupe on `read_id` collapses a
 * WDK replay of the same read and nothing else. The cross-SEGMENT half of the same law is
 * `pushPart`'s own arm in chatTurn.v16.ts.
 */
export function toTypedParts_v16(content: readonly AiContentPart[]): ClaraPartV16[] {
  const out: ClaraPartV16[] = [...toTypedParts_v15(content)];
  const seenReads = new Set<string>();
  for (const p of content) {
    if (p.type !== "tool-result") continue;
    const tr = p as { toolName: string; output: unknown };
    if (tr.toolName !== FREEFORM_READ_TOOL) continue;
    const readId = admittedFreeformReadId(tr.output);
    if (readId === null) continue;
    if (seenReads.has(readId)) continue;
    seenReads.add(readId);
    out.push({ type: "freeform_result", read_id: readId });
  }
  return out;
}

/** Unchanged from v15 — a read is not acting intent (this file's header). Re-exported under its
 *  own name so v16's impl reads consistently, not because the behaviour moved. */
export function hasCodingIntent_v16(content: readonly AiContentPart[]): boolean {
  return hasCodingIntent_v15(content);
}
