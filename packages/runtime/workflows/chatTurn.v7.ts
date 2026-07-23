// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A, spike T6): a deployed workflow
// body is IMMUTABLE once any run can be in flight. chatTurn_v7 is a NEW frozen closure
// beside the byte-untouched chatTurn_v6/v5/v4/v3/v1 (the registry repoints `chatTurn:`
// here; prior exports stay until zero non-terminal runs of those versions remain). Do
// NOT edit this file or its import closure (chatTurn.v7.impl / .tools / .infra /
// .prompt / .errors) once deployed.
//
// chatTurn_v7 (Wave B, ADR-032 WB-R6/WB-R7, FORK-6, AMB-1/AMB-2, WB-R6(4)) — the
// durable chat turn WITH everything v6 carried (the Slice-6 coding floor, the sales
// direction, the generic journal_entry lane, the SST registration-watch + purchase-
// visibility framing), PLUS wiki awareness: every get_context_pack fetch that feeds
// MODEL context runs purpose "wiki_coding" (AMB-1) instead of v6's "chat"/"coding",
// with the txn-local `clara.pack_consumer = 'v25'` GUC (FORK-6) set immediately
// before each such fetch, in the SAME transaction — the DB gate (0017) reads that
// GUC to decide whether the pack's `wiki` object is populated, so a frozen pre-v7
// consumer replaying identical SQL text can never surface it (WB-R6(2)'s structural
// claim). The get_context_pack TOOL's `purpose` input is pinned to the literal enum
// "wiki_coding" (z.literal), making a model-supplied free-string purpose structurally
// impossible. The prompt adds the WB-R6(4) wiki framing: the pack's `wiki` block is
// Clara-maintained advisory notes that may INFORM a proposal but NEVER decide one —
// every DB gate/bound/floor/autopost rule stays authoritative regardless — and a
// wiki-informed draft cites the page (slug + title) in the VISIBLE reasoning. The
// server-side draft-wrapper re-fetch (inside runDraftJournalEntry) is DELIBERATELY
// wiki-dark: it keeps purpose "coding" and never sets the GUC, because it only ever
// needs books_version (AMB-1). The schema + steps are otherwise byte-identical to v6:
// like v1 (load snapshot -> load history + pack -> loop model segments, checkpoint +
// stream each, park on clarify, settle idempotently) PLUS: in-turn attachment
// perception, the firm-scoped read tools, the draft_journal_entry write tool (v6:
// coding_kind supplier_bill | sales_invoice | sales_credit_note | journal_entry->NULL),
// and — the C-19 terminal invariant — a coding-intent turn NEVER settles silently: it
// ends with a je_review card, a typed clarify, or a typed refusal. je_review/refusal
// parts are deduped as they accumulate so a WDK replay never double-appends a card.

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV7,
  loadContextStepV7,
  runModelSegmentStepV7,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v7.impl.js";
import { CLARIFY_FRAMING, type ClaraPart } from "./chatTurn.v7.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v7.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** Accumulate a part with je_review/refusal replay-dedup (C-19). A je_review is keyed
 *  by entry_id; a refusal by code+reason+message; all other parts append as-is. */
function pushPart(all: ClaraPart[], p: ClaraPart): void {
  if (p.type === "je_review") {
    if (all.some((x) => x.type === "je_review" && x.entry_id === p.entry_id)) return;
  } else if (p.type === "refusal") {
    const key = `${p.code}:${p.reason ?? ""}:${p.message}`;
    if (all.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) return;
  }
  all.push(p);
}

export async function chatTurn_v7(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPart[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    await settleStep(taskId, allParts, 0, o, errorCode);
  };

  try {
    const claim = await claimRunStep(taskId);
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };

    const task = await loadTaskStepV7(taskId);
    const ctx = await loadContextStepV7(task.sessionId, task.clientId, task.firmId, task.createdBy);
    for (const m of ctx.history) messages.push(m);
    const systemExtra = ctx.contextPack
      ? `Client context pack (books_version is the freshness token):\n${JSON.stringify(ctx.contextPack)}`
      : "";

    for (; segment < MAX_SEGMENTS; segment++) {
      const seg = await runModelSegmentStepV7(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra);
      await checkpointStep(taskId, segment, seg.usageTokens, seg.parts); // durable per-segment (AB6)
      for (const p of seg.parts) pushPart(allParts, p);
      if (seg.coded) codingIntended = true;

      // A recovered attempt (C-12) or a segment with no clarify ends the turn.
      if (seg.recovered || !seg.clarify) {
        outcome = "completed";
        break;
      }

      // The model asked for a human decision — park on a hook (random token, memoized).
      //
      // v3 fix (GATE-3 live find): the COLLECTED segment content is stream OUTPUT —
      // it carries executed read-tool tool-result parts (invalid inside an assistant
      // INPUT message), unpaired extra tool-calls, and provider-metadata-laden
      // reasoning parts. Re-sending it verbatim only ever happens on the
      // resume-after-park path, and after a WDK REPLAY it fails the model input
      // validation (live model_error on both parked coding clarifies). Sanitize to
      // a VALID minimal assistant turn: the text parts + ONLY the clarify tool-call
      // (whose tool-result we pair on resume), all rebuilt as plain objects.
      const parkText = (seg.assistantContent as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === "text" && typeof p.text === "string" && p.text.trim())
        .map((p) => ({ type: "text" as const, text: String(p.text) }));
      const parkCall = (seg.assistantContent as Array<{ type: string; toolCallId?: string; toolName?: string; input?: unknown }>)
        .find((p) => p.type === "tool-call" && p.toolCallId === seg.clarify?.toolCallId);
      messages.push({
        role: "assistant",
        content: [
          ...parkText,
          ...(parkCall
            ? [{ type: "tool-call" as const, toolCallId: String(parkCall.toolCallId), toolName: String(parkCall.toolName), input: JSON.parse(JSON.stringify(parkCall.input ?? {})) }]
            : []),
        ],
      } as unknown as ModelMessage);
      const hookToken = await mintHookTokenStep();
      const hook = createHook<{ kind: "answer" | "expired" | "cancelled"; answer?: unknown }>({ token: hookToken });
      await openInterruptionStep(taskId, hookToken, { question: seg.clarify.question, context: seg.clarify.context });

      const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

      if (resolution.kind === "answer") {
        await markRunningStep(taskId); // un-park: awaiting_input -> running
        messages.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: seg.clarify.toolCallId,
              toolName: "clarify",
              output: { type: "json", value: resolution.answer ?? null },
            },
          ],
        } as unknown as ModelMessage);
        continue;
      }

      pushPart(allParts, { type: "clarify_closed", reason: resolution.kind, framing: CLARIFY_FRAMING });
      outcome = resolution.kind;
      break;
    }
    if (segment >= MAX_SEGMENTS) outcome = "completed"; // safety bound reached

    // C-19 terminal invariant: a coding-intent turn must end with a card, a typed
    // clarify, or a typed refusal — never a silent settle. If it reached here with a
    // coding intent but produced none of those, synthesize the coding_incomplete refusal.
    if (codingIntended && outcome === "completed") {
      const hasTerminal = allParts.some((p) => p.type === "je_review" || p.type === "refusal" || p.type === "clarify");
      if (!hasTerminal) pushPart(allParts, codingIncompleteRefusal());
    }

    await settle(outcome, null);
  } catch (err) {
    await settle("failed", "model_error").catch(() => {});
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await closeStreamStep().catch(() => {});
  }

  return { taskId, outcome, segments: segment + 1 };
}
