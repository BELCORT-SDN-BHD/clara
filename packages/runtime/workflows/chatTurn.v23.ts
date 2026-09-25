// @frozen
//
// FROZEN — the chatTurn_v23 workflow entry: the CLOSING wave's chat successor (wave 2026-09-26).
// A NEW frozen closure beside byte-untouched chatTurn_v1..v22 (docs/ARCHITECTURE.md §10,
// #workflow-versioning-and-rollback: a behavioural change ships as a new _vN export, never an
// in-place edit — registry.ts repoints `chatTurn:` here).
//
// WHY THIS CUT EXISTS, IN ONE PARAGRAPH. `chatTurn.v22`'s own roster cell asserts seven tool names
// absent BY NAME and records that the absence "is a ruling, not an oversight": at that cut every
// door behind them was granted to `clara_authenticated` alone, and neither pooled chat credential
// carries JWT claims, so a tool over one could only ever answer a grant refusal. The riders sweep
// wave built the machine-lane halves — `0352_agent_read_twins_payroll_agreement.sql` and
// `0353_tenancy_agent_twins_obo_confirmations.sql`, both hosted 2026-09-25 — and #1144 collected
// their contracts. This body is where that ruling is unwound.
//
// v23 vs v22 IN THIS FILE, and it is exactly one thing: `runModelSegmentStepV23` replaces
// `runModelSegmentStepV22`, which changes the TOOL MAP the model is handed and the prompt it is
// handed it with. No new wire kind, no new terminal card, no change to the clarify park, the
// segment bound, the C-19 invariant or the settle. `loadContextStepV10` and
// `loadClientBasisStepV21` are called exactly as v22 calls them — the SAME step bodies, reached by
// import, so a run journalled under v22 resumes on identical step identities.
//
// WHAT THE MODEL CAN NOW DO THAT IT COULD NOT:
//   1. `read_payroll_posting_state` (#946) — say why a payroll summary did or did not post, in the
//      DATABASE'S OWN sentence, read off the same Needs-you row a person reads.
//   2. `read_payroll_settlement_state` (#947) — say whether a posted run's net pay has left the
//      bank, offering every candidate line and choosing none.
//   3. `read_agreement_terms` (#948) — read back a filed agreement's eleven banked terms, with the
//      queue's own sentence when the acquisition did not post.
//   4. `read_tenancy_terms` (#949 item 1) — read a tenancy's recorded terms, how each was
//      established, the treatment branch and the plan that would be drafted.
//   5. `read_rent_settlement_candidates` (#949 item 4) — which months of rent are still open, every
//      candidate for each, and the deposits coding beside them.
//   6. `confirm_tenancy_rent_plan` (#949 item 2) — confirm a tenancy's rent plan AS THE PERSON the
//      turn acts for, through the on-behalf-of twin, under the owner's ruling of 2026-09-25.
//   7. `confirm_tenancy_rent_plan_revision` (#949 item 3) — record a confirmed plan's escalation as
//      a revision, likewise as that person.
//
// WHAT IS DELIBERATELY ABSENT, NAMED HERE SO A LATER READER DOES NOT THINK IT WAS FORGOTTEN: a
// settle tool for either family (`clara.settle_payroll_net_pay` and `clara.settle_rent_payable`
// are `clara_authenticated`-only and both migrations' tails assert they stayed that way — two
// candidate lines of the same amount in one window are two lines a PERSON adjudicates); a
// record-terms tool (what a page says is a person's own reading); `enrol_prepayment_account` and
// `record_prepayment_stated_term` (#940/#939's prohibitions, unchanged); and the two payroll
// witnesses of #1144 item 3, `payroll.run.employee_count` and `payroll.run.page_count`, which
// belong to `payrollFacts`'s own next version and stay on #1144 for the mainline.
//
// THE C-19 TERMINAL SET IS V22's (WHICH IS V21's, WHICH IS V20's), UNCHANGED, and
// `hasCodingIntent_v23` is v22's signal unchanged: none of the seven mints a terminal card, so
// putting one in the signal would append "the coding could not be completed into a review card
// this turn" to every SUCCESSFUL read and every successful confirmation.
//
// THE DEPLOY ORDER, STATED PLAINLY BECAUSE IT IS THE ONE WAY THIS IMAGE CAN HURT SOMETHING. v23
// NEEDS NO NEW MIGRATION: every door the seven tools touch has been live since 0352 and 0353, both
// hosted on 2026-09-25 at frontier `0361_reservation_release_advice`. Against a database missing
// one of them the tool answers a typed refusal and the TURN SURVIVES — the chat lane's own
// asymmetry (`packages/runtime/README.md`: on the Work lane a missing function is TERMINAL). v22's
// obligations are inherited unchanged, because v23 carries v22's whole tool map.
//
// ROLLBACK TO v22 stops offering the seven tools. The five reads change no database state at all.
// The two confirmations do: a rent plan confirmed through this image is a plan on the books, and a
// v22 image simply cannot confirm another one from the conversation — the human door still can,
// and the plan already recorded stays exactly as it is, authored by the person named on it. That
// is the honest runbook line, not "rollback is free".

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  loadClientBasisStepV21,
  runModelSegmentStepV23,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v23.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { systemExtraV19, type ClaraPartV23 } from "./chatTurn.v23.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10..v22's settle error-code derivation — see v13.ts for the CHECK rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** v22's replay dedup (C-19), byte-carried. v23 adds no arm because it adds no kind: its seven new
 *  tools mint no card at all, and their results ride the generic `tool_result` promotion v10 has
 *  made for every tool since. */
function pushPart(all: ClaraPartV23[], p: ClaraPartV23): void {
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

export async function chatTurn_v23(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV23[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13..v22.ts use — settleStep/checkpointStep are v10's
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
    // THE PERIOD IS NULL BECAUSE A CHAT TURN HAS NONE IN HAND. The door then marks the rows
    // against the server's Asia/Kuala_Lumpur calendar date, which is the right default for a
    // conversation; a lane that KNOWS the period it is working passes that period's date instead.
    const basis = await loadClientBasisStepV21(task.clientId, task.firmId, task.createdBy, null);
    const systemExtra = systemExtraV19(packText, basis.text);

    for (; segment < MAX_SEGMENTS; segment++) {
      const seg = await runModelSegmentStepV23(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
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

    // C-19 terminal invariant — v22's set, which is v21's, which is v20's, unchanged (see header).
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
