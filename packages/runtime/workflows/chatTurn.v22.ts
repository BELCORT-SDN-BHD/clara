// @frozen
//
// FROZEN — the chatTurn_v22 workflow entry: the CUT PHASE's chat successor (wave 2026-09-25), and
// the body every later contract of that cut is applied to. A NEW frozen closure beside
// byte-untouched chatTurn_v1..v21 (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback: a
// behavioural change ships as a new _vN export, never an in-place edit — registry.ts repoints
// `chatTurn:` here).
//
// ONE SUCCESSOR FOR THE WHOLE CUT, AND THAT IS THE WAVE'S OWN RULING RATHER THAN A CONVENIENCE.
// A frozen version costs a manifest entry, a bundle, a rollback target and a parked-run obligation
// for every body it supersedes, so the riders programme names ONE cut phase for every contract its
// waves wrote (`docs/plan/active/riders-2026-09-20/CUT-PLAN.md` §1). #985 is the first ticket of
// that phase: it MINTS this file set and lands the first tool; the tickets after it edit THESE
// files rather than cutting a v23.
//
// v22 vs v21 IN THIS FILE, and it is exactly one thing: `runModelSegmentStepV22` replaces
// `runModelSegmentStepV21`, which changes the TOOL MAP the model is handed and the prompt it is
// handed it with. No new wire kind, no new terminal card, no change to the clarify park, the
// segment bound, the C-19 invariant or the settle. `loadContextStepV10` and
// `loadClientBasisStepV21` are called exactly as v21 calls them — the SAME step bodies, reached by
// import, so a run journalled under v21 resumes on identical step identities.
//
// WHAT THE MODEL CAN NOW DO THAT IT COULD NOT:
//   1. `read_opening_source` (#985, contract written by #656) — read the document a person has
//      already bound to one of this client's OPENING BASES into that basis's opening lines,
//      through the same route core `POST /api/opening/parse-targets` calls, on the same
//      `clara_runtime` credential, behind the same bookkeeper+ floor. It names no amount, no
//      account and no document: the tie is the basis's own, every figure is re-derived by the
//      database from the document's stored regions, and the only figure that comes back is HOW
//      MANY LINES WERE RECORDED.
//
// WHAT IS DELIBERATELY ABSENT, NAMED HERE SO A LATER READER DOES NOT THINK IT WAS FORGOTTEN:
// #986's `refresh_opening_source` (the second verb on the same lane — a SEPARATE act under a
// SEPARATE op key, roster entry A3 of this cut, not this ticket's), #1000's
// `read_client_financial_pack` and #1030's re-derivation caller (both later tickets of this same
// lane, each with its own migration), and the four `clara_authenticated`-only contracts of #946,
// #947, #948 and #949 — deferred by ruling because neither pooled chat credential carries JWT
// claims, so a tool over those doors could only ever answer a grant refusal.
//
// THE C-19 TERMINAL SET IS V21's (WHICH IS V20's, WHICH IS V19's, WHICH IS V18's), UNCHANGED, and
// `hasCodingIntent_v22` is v21's signal unchanged: `read_opening_source` mints no terminal card,
// so putting it in the signal would append "the coding could not be completed into a review card
// this turn" to every SUCCESSFUL read. See chatTurn.v22.prompt.ts's header for the measurement.
//
// THE DEPLOY ORDER, STATED PLAINLY BECAUSE IT IS THE ONE WAY THIS IMAGE CAN HURT SOMETHING.
// #985 NEEDS NO NEW MIGRATION AND ADDS NO DEPLOY-ORDER OBLIGATION OF ITS OWN: every door this
// tool touches has been live since 0017 (`clara.record_opening_targets_parsed`, EXECUTE to
// `clara_runtime` in 0017's grant block) and 0006 (`clara.resolve_chat_principal`). v21's own
// obligations (0225, 0227, 0230) are inherited unchanged, because v22 carries v21's whole tool
// map. Against a database missing a door, `parseOpeningTargets` classifies the fault and the tool
// answers `internal` with this lane's own sentence: CONTAINED, corrupting nothing.
//
// ROLLBACK TO v21 stops offering the tool and changes no database state. Opening targets already
// recorded are rows on a basis a person still has to approve, and they stay exactly as they are —
// the reading that authored them is the database's own, not this image's. That is the honest
// runbook line, not "rollback is free".

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  loadClientBasisStepV21,
  runModelSegmentStepV22,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v22.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { systemExtraV19, type ClaraPartV22 } from "./chatTurn.v22.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10..v21's settle error-code derivation — see v13.ts for the CHECK rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** v21's replay dedup (C-19), byte-carried. v22 adds no arm because it adds no kind: its one new
 *  tool mints no card at all, and its result rides the generic `tool_result` promotion v10 has
 *  made for every tool since. */
function pushPart(all: ClaraPartV22[], p: ClaraPartV22): void {
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

export async function chatTurn_v22(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV22[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13..v21.ts use — settleStep/checkpointStep are v10's
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
      const seg = await runModelSegmentStepV22(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
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

    // C-19 terminal invariant — v21's set, which is v20's, which is v19's, unchanged (see header).
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
