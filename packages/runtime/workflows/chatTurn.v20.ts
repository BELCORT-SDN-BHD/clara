// @frozen
//
// FROZEN — the chatTurn_v20 workflow entry: the SHARED successor #638, #652 (and, in the shape it
// could not be given, #653) deferred their chat half into. A NEW frozen closure beside
// byte-untouched chatTurn_v1..v19 (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback: a
// behavioural change ships as a new _vN export, never an in-place edit — registry.ts repoints
// `chatTurn:` here).
//
// ONE SUCCESSOR, THREE TICKETS, AND THAT WAS THE WAVE'S OWN RULING RATHER THAN A CONVENIENCE.
// DECISIONS §1.1 for wave 2026-09-15 forbids any implementation branch from cutting a `_vN`
// successor and names ONE integration cut for all of them, for the reason v19's header states: a
// frozen version costs a manifest entry, a bundle, a rollback target and a parked-run obligation
// for every body it supersedes, and minting three of them a day apart would pay that three times
// for three additions that touch nothing of each other.
//
// v20 vs v19 IN THIS FILE, and it is exactly one thing: `runModelSegmentStepV20` replaces
// `runModelSegmentStepV19`, which changes the TOOL MAP the model is handed and nothing else. No
// new step, no new wire kind, no new terminal card, no change to the clarify park, the segment
// bound, the C-19 invariant or the settle. The knowledge-context step is v19's, reached by import.
//
// WHAT THE MODEL CAN NOW DO THAT IT COULD NOT:
//   1. `start_staff_expense_claim_work` (#638) — admit a staff expense claim as a
//      `journal_entry`-purpose Work with typed particulars in `clara.staff_expense_claims`.
//   2. `start_accrual_work` (#652) — configure an accrual on the `reversing_journal` plan lane,
//      admitting this period's occurrence when the authority window is already open.
// Both post NOTHING. Both mint the `work_accepted` card v18 declared; neither widens
// `WORK_ACCEPTED_PURPOSES`, because both Works ARE `journal_entry` Works.
//
// WHAT IS DELIBERATELY ABSENT, NAMED HERE SO A LATER READER DOES NOT THINK IT WAS FORGOTTEN:
// #653's `start_prepayment_schedule_work` and #647's `record_counterparty_alias`. Each needs a
// database door that does not exist for this lane — `clara.create_prepayment_schedule` is
// `clara_authenticated`-only and `_human_ctx`-fronted (0223 §D.1), and `add_counterparty_alias` has
// no OBO twin at all (DECISIONS D11) — and a migration is not a workflow cut's to write. Both
// contracts stay written in their non-frozen modules, which stay OUT of this closure.
//
// THE C-19 TERMINAL SET IS V19'S (WHICH IS V18'S), UNCHANGED. `hasCodingIntent_v20` returns true
// for both new tools and the terminal card for both is `work_accepted`, already in the set.
//
// THE DEPLOY ORDER, STATED PLAINLY BECAUSE IT IS THE ONE WAY THIS IMAGE CAN HURT SOMETHING.
// MIGRATIONS 0221 AND 0222 MUST BE LIVE ON THE DATABASE BEFORE THIS IMAGE SERVES A TURN — on top
// of v19's own 0192 and 0194. `start_staff_expense_claim_work` calls
// `clara.admit_staff_expense_claim_work` (0221); `start_accrual_work` calls
// `clara.create_accrual_adjustment_for` (0222). Against a database without them each raises
// `undefined_function` (42883), which `authoringRefusal` does not classify as a governed refusal,
// so the tool answers `internal` and the turn continues: CONTAINED, corrupting nothing, and it
// makes Clara refuse a thing it just offered to do. Deploy the migrations first. The REVERSE order
// is FREE: 0221 and 0222 against a v19 image add relations and verbs that nothing calls.
//
// ROLLBACK TO v19 stops offering the two tools and changes no database state. Claims and accruals
// already admitted keep their own durable surfaces (`/clients/:id/work`, `/clients/:id/accruals`)
// and their queued Work still runs under the unchanged claraWork pin. That is the honest runbook
// line, not "rollback is free".

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  loadKnowledgeContextStepV19,
  runModelSegmentStepV20,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v20.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { systemExtraV19, type ClaraPartV20 } from "./chatTurn.v20.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10..v19's settle error-code derivation — see v13.ts for the CHECK rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** v19's replay dedup (C-19), byte-carried. v20 adds no arm because it adds no kind: both new
 *  tools mint `work_accepted`, which already dedupes on `work_id` — and that is exactly the
 *  property a replayed segment needs, since both tools' op keys are deterministic and a re-run
 *  returns the SAME Work. */
function pushPart(all: ClaraPartV20[], p: ClaraPartV20): void {
  if (p.type === "je_review") {
    if (all.some((x) => x.type === "je_review" && x.entry_id === p.entry_id)) return;
  } else if (p.type === "entry_posted") {
    if (all.some((x) => x.type === "entry_posted" && x.post_receipt_id === p.post_receipt_id)) return;
  } else if (p.type === "bank_act") {
    if (all.some((x) => x.type === "bank_act" && x.op_key === p.op_key)) return;
  } else if (p.type === "freeform_result") {
    if (all.some((x) => x.type === "freeform_result" && x.read_id === p.read_id)) return;
  } else if (p.type === "work_accepted") {
    if (all.some((x) => x.type === "work_accepted" && x.work_id === p.work_id)) return;
  } else if (p.type === "knowledge_receipt") {
    if (all.some((x) => x.type === "knowledge_receipt" && x.record_id === p.record_id)) return;
  } else if (p.type === "refusal") {
    const key = `${p.code}:${p.reason ?? ""}:${p.message}`;
    if (all.some((x) => x.type === "refusal" && `${x.code}:${x.reason ?? ""}:${x.message}` === key)) return;
  }
  all.push(p);
}

export async function chatTurn_v20(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV20[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13..v19.ts use — settleStep/checkpointStep are v10's
    // FROZEN step bodies typed `ClaraPart[]`; they serialise the array to jsonb without ever
    // branching on a discriminant, so the added part kinds pass through as data.
    await settleStep(taskId, allParts as unknown as Parameters<typeof settleStep>[1], 0, o, errorCode);
  };

  try {
    const claim = await claimRunStep(taskId);
    if (!claim.claimed) return { taskId, outcome: "deduped", segments: 0 };

    const task = await loadTaskStepV10(taskId);
    const ctx = await loadContextStepV10(task.sessionId, task.clientId, task.firmId, task.createdBy);
    for (const m of ctx.history) messages.push(m);
    const packText = ctx.contextPack ? `Client context pack (books_version is the freshness token):\n${JSON.stringify(ctx.contextPack)}` : "";
    const knowledge = await loadKnowledgeContextStepV19(task.clientId, task.firmId);
    const systemExtra = systemExtraV19(packText, knowledge.text);

    for (; segment < MAX_SEGMENTS; segment++) {
      const seg = await runModelSegmentStepV20(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
      await checkpointStep(taskId, segment, seg.usageTokens, seg.parts as unknown as Parameters<typeof checkpointStep>[3]); // durable per-segment (AB6)
      for (const p of seg.parts) pushPart(allParts, p);
      if (seg.coded) codingIntended = true;

      if (seg.recovered || !seg.clarify) {
        outcome = "completed";
        break;
      }

      const parkText = (seg.assistantContent as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === "text" && typeof p.text === "string" && p.text.trim())
        .map((p) => ({ type: "text" as const, text: String(p.text) }));
      const parkCall = (seg.assistantContent as Array<{ type: string; toolCallId?: string; toolName?: string; input?: unknown }>).find(
        (p) => p.type === "tool-call" && p.toolCallId === seg.clarify?.toolCallId,
      );
      messages.push({
        role: "assistant",
        content: [
          ...parkText,
          ...(parkCall ? [{ type: "tool-call" as const, toolCallId: String(parkCall.toolCallId), toolName: String(parkCall.toolName), input: JSON.parse(JSON.stringify(parkCall.input ?? {})) }] : []),
        ],
      } as unknown as ModelMessage);
      const hookToken = await mintHookTokenStep();
      const hook = createHook<{ kind: "answer" | "expired" | "cancelled"; answer?: unknown }>({ token: hookToken });
      await openInterruptionStep(taskId, hookToken, { question: seg.clarify.question, context: seg.clarify.context });

      const resolution = await hook; // PARK — zero compute until answered/expired/cancelled

      if (resolution.kind === "answer") {
        await markRunningStep(taskId);
        messages.push({
          role: "tool",
          content: [{ type: "tool-result", toolCallId: seg.clarify.toolCallId, toolName: "clarify", output: { type: "json", value: resolution.answer ?? null } }],
        } as unknown as ModelMessage);
        continue;
      }

      pushPart(allParts, { type: "clarify_closed", reason: resolution.kind, framing: CLARIFY_FRAMING });
      outcome = resolution.kind;
      break;
    }
    if (segment >= MAX_SEGMENTS) outcome = "completed"; // safety bound reached

    // C-19 terminal invariant — v19's set, which is v18's, unchanged (see this file's header).
    if (codingIntended && outcome === "completed") {
      const hasTerminal = allParts.some(
        (p) =>
          p.type === "je_review" ||
          p.type === "entry_posted" ||
          p.type === "bank_act" ||
          p.type === "work_accepted" ||
          p.type === "refusal" ||
          p.type === "clarify",
      );
      if (!hasTerminal) pushPart(allParts, codingIncompleteRefusal());
    }

    await settle(outcome, null);
  } catch (err) {
    await settle("failed", errorCodeFromCaughtError()).catch(() => {});
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    await closeStreamStep().catch(() => {});
  }

  return { taskId, outcome, segments: segment + 1 };
}
