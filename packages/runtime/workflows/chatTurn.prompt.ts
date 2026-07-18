// @frozen
//
// FROZEN — the prompt text + tool registry of chatTurn_v1 (contract §4.9). These
// live INSIDE the frozen import-closure BY DESIGN: changing the system prompt or a
// tool's shape IS a behavioural change to the workflow, so it ships as a new _vN
// (never an in-place edit — the WDK has no run-pinning; an edit would silently
// change the un-executed remainder of every parked run, spike T6). The freeze-lint
// hash-locks this file as part of chatTurn.v1.ts's closure.
//
// Third-party imports (ai, zod) are outside the freeze surface — allowed. This file
// imports NO first-party infrastructure (pools/authz/etc.) so the closure stays
// tight; the DB-backed read tools are BUILT with an injected pool handle inside the
// step that runs them (chatTurn.impl.ts), never here.

import { tool } from "ai";
import { z } from "zod";

/** Chat is a READ-ONLY advisor in Slice 4 (ruling 1): no writes, no drafting. */
export const SYSTEM_PROMPT = [
  "You are Clara, an AI assistant for a Malaysian accounting firm.",
  "You are a READ-ONLY advisor: you can read the firm's books and the client context,",
  "but you cannot make any changes, post entries, or draft documents in this mode.",
  "The database owns every number — never compute or invent a figure; read it with your tools.",
  "When you genuinely need a human decision to proceed, call the `clarify` tool.",
  "IMPORTANT: a clarify question AND its answer are VISIBLE TO THE WHOLE FIRM, not private",
  "to this conversation — phrase every clarify in professional, firm-appropriate language.",
  "Be concise and precise. Cite the figures you read rather than paraphrasing them loosely.",
].join(" ");

/** Firm-visibility framing carried on every clarify part + the interruption row (§0.5). */
export const CLARIFY_FRAMING = "This question and its answer are visible to your firm.";

// ---------------------------------------------------------------------------
// The clarify tool — NO execute. A tool without an execute function is the AI SDK
// human-in-the-loop primitive: when the model calls it, the segment STOPS with a
// pending tool-call (stopWhen: hasToolCall('clarify')) and the workflow body parks
// on a hook until a firm member answers (§4.3). The typed answer is fed back as a
// tool-result on the next segment.
// ---------------------------------------------------------------------------
export const clarifyTool = tool({
  description:
    "Ask the firm a clarifying question when you cannot proceed confidently. " +
    "The question AND its answer are VISIBLE TO YOUR FIRM (not private to this chat) — " +
    "phrase it in professional, firm-appropriate language. Use only when a human decision is genuinely required.",
  inputSchema: z.object({
    question: z.string().describe("The clarifying question, phrased for firm-wide visibility."),
    context: z.string().optional().describe("Optional short context for why you are asking."),
  }),
  // deliberately NO execute — the runtime parks the workflow on this call.
});

// ---------------------------------------------------------------------------
// Clara typed parts — the durable transcript shape (design DIRECTION typed parts[]).
// The AI SDK content parts are mapped to these before persistence (settle) so the
// stored transcript is provider-neutral and render-stable.
// ---------------------------------------------------------------------------

/** @internal a minimal shape for an AI SDK content part we care about. */
export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text?: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool-error"; toolCallId: string; toolName: string; error: unknown }
  | { type: string; [k: string]: unknown };

export type ClaraPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; tool: string; tool_call_id: string; input: unknown }
  | { type: "tool_result"; tool: string; tool_call_id: string; output: unknown }
  | { type: "tool_error"; tool: string; tool_call_id: string; error: string }
  | { type: "clarify"; tool_call_id: string; question: string; context?: string; framing: string }
  | { type: "clarify_closed"; reason: "expired" | "cancelled"; framing: string };

/** Map AI SDK assistant content parts to Clara typed parts (clarify handled by the caller). */
export function toTypedParts(content: readonly AiContentPart[]): ClaraPart[] {
  const out: ClaraPart[] = [];
  for (const p of content) {
    if (p.type === "text" && typeof (p as { text?: unknown }).text === "string") {
      out.push({ type: "text", text: (p as { text: string }).text });
    } else if (p.type === "tool-call") {
      const tc = p as { toolCallId: string; toolName: string; input: unknown };
      if (tc.toolName === "clarify") {
        const input = (tc.input ?? {}) as { question?: string; context?: string };
        out.push({
          type: "clarify",
          tool_call_id: tc.toolCallId,
          question: String(input.question ?? ""),
          context: input.context,
          framing: CLARIFY_FRAMING,
        });
      } else {
        out.push({ type: "tool_call", tool: tc.toolName, tool_call_id: tc.toolCallId, input: tc.input });
      }
    } else if (p.type === "tool-result") {
      const tr = p as { toolCallId: string; toolName: string; output: unknown };
      out.push({ type: "tool_result", tool: tr.toolName, tool_call_id: tr.toolCallId, output: tr.output });
    } else if (p.type === "tool-error") {
      const te = p as { toolCallId: string; toolName: string; error: unknown };
      out.push({ type: "tool_error", tool: te.toolName, tool_call_id: te.toolCallId, error: String(te.error) });
    }
    // reasoning / other provider parts are intentionally dropped from the durable transcript.
  }
  return out;
}

/** Extract a pending clarify tool-call from the segment content, if any. */
export function findClarifyCall(content: readonly AiContentPart[]): { toolCallId: string; question: string; context?: string } | null {
  for (const p of content) {
    if (p.type === "tool-call" && (p as { toolName?: string }).toolName === "clarify") {
      const tc = p as { toolCallId: string; input: unknown };
      const input = (tc.input ?? {}) as { question?: string; context?: string };
      return { toolCallId: tc.toolCallId, question: String(input.question ?? ""), context: input.context };
    }
  }
  return null;
}
