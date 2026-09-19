// @frozen
//
// FROZEN — the chatTurn_v21 workflow entry: the SHARED successor #655 and #651 deferred their chat
// half into, carrying #658's chat-lane knowledge repoint with them. A NEW frozen closure beside
// byte-untouched chatTurn_v1..v20 (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback: a
// behavioural change ships as a new _vN export, never an in-place edit — registry.ts repoints
// `chatTurn:` here).
//
// ONE SUCCESSOR, THREE TICKETS, AND THAT WAS THE WAVE'S OWN RULING RATHER THAN A CONVENIENCE.
// DECISIONS §1.1 for wave 2026-09-18 forbids any implementation branch from cutting a `_vN`
// successor and names ONE integration cut for all of them, for the reason v19's and v20's headers
// state: a frozen version costs a manifest entry, a bundle, a rollback target and a parked-run
// obligation for every body it supersedes.
//
// v21 vs v20 IN THIS FILE, and it is exactly two things: `runModelSegmentStepV21` replaces
// `runModelSegmentStepV20` (which changes the TOOL MAP the model is handed and the prompt it is
// handed it with), and `loadClientBasisStepV21` replaces `loadKnowledgeContextStepV19` as the
// knowledge preload. No new wire kind, no new terminal card, no change to the clarify park, the
// segment bound, the C-19 invariant or the settle. `loadContextStepV10` is called exactly as v20
// calls it, for the history and the context pack.
//
// WHAT THE MODEL CAN NOW DO THAT IT COULD NOT:
//   1. `start_trade_invoice_work` (#655) — admit a sales invoice or a supplier bill as a
//      `journal_entry`-purpose Work with typed particulars in `clara.trade_invoices`. It ADMITS
//      and posts nothing; it mints the `work_accepted` card v18 declared and widens no purpose.
//   2. `run_depreciation_period_for_client` (#651) — clear this client's DUE depreciation periods
//      against an authority an admin already signed. It POSTS, through a door that settles its own
//      receipt, and it mints NO card (see chatTurn.v21.tools.ts for the measurement).
//
// WHAT THE TURN NOW READS THAT IT DID NOT:
//   3. The client's governed knowledge through `clara.retrieve_knowledge` (#658) — bounded,
//      CORE-FIRST, tier-marked and period-aware — instead of `clara.get_knowledge_pack`'s
//      recency view. A read that does not succeed is a TYPED STATUS on the step's answer and a
//      sentence in the block, never a null that reads as "this client has nothing recorded".
//      `clara.get_context_pack` is NOT recut and NOT repointed — not one byte.
//
// WHAT IS DELIBERATELY ABSENT, NAMED HERE SO A LATER READER DOES NOT THINK IT WAS FORGOTTEN:
// #656's `read_opening_source` (its own stanza rules it into "a future chatTurn_vN, NOT this
// wave's v21" — it appears in no row of DECISIONS §1.2), #636's `open_intake_batch` and #660's
// `read_client_financial_pack` (both contract-only this wave, D5), and — carried forward from
// v20's own header — #653's `start_prepayment_schedule_work` and #647's
// `record_counterparty_alias`, which still need database doors that do not exist for this lane.
//
// THE C-19 TERMINAL SET IS V20's (WHICH IS V19's, WHICH IS V18's), UNCHANGED. `hasCodingIntent_v21`
// returns true for `start_trade_invoice_work`, whose terminal card is the `work_accepted` already
// in that set, and FALSE for `run_depreciation_period_for_client` — a tool that mints no card must
// not be in a signal whose remedy is "the coding could not be completed into a review card this
// turn", because that sentence is false beside charges that were in fact posted.
//
// THE DEPLOY ORDER, STATED PLAINLY BECAUSE IT IS THE ONE WAY THIS IMAGE CAN HURT SOMETHING.
// MIGRATIONS 0225, 0227 AND 0230 MUST BE LIVE ON THE DATABASE BEFORE THIS IMAGE SERVES A TURN —
// on top of v20's own 0221/0222 and v19's 0192/0194. `start_trade_invoice_work` calls
// `clara.admit_trade_invoice_work` (0225); `run_depreciation_period_for_client` calls
// `clara.run_depreciation_period_for` (0227); the basis read calls `clara.retrieve_knowledge`
// (0230). Against a database without 0225 or 0227 each tool raises `undefined_function` (42883),
// which is NOT a CLR SQLSTATE, so this closure's mappers classify it as a fault and the tool
// answers `internal` with its own sentence — the turn continues: CONTAINED, corrupting nothing,
// and it makes Clara refuse a thing she just offered to do. (Fix round 1 made that true: the
// mappers guarded on `refused.ok === true`, which `authoringRefusal` never answers, so the model
// used to be handed `code:"42883"` and Postgres's own `function clara.… does not exist` text.
// The classification is the SQLSTATE now, and `v21.refusals` is the cell that holds it.) Against a database without 0230 the basis read classifies the missing
// function as `read_failed` and the block says the knowledge could not be read — also contained,
// and HONEST rather than silent, which is the whole reason that read was repointed. The REVERSE
// order is FREE: the three migrations against a v20 image add relations and verbs nothing calls.
//
// ROLLBACK TO v20 stops offering the two tools, returns the knowledge preload to
// `clara.get_knowledge_pack`, and changes no database state. Trade-invoice Works already admitted
// keep their own durable surfaces and their queued Work still runs under the claraWork pin;
// depreciation periods already charged are journal entries and stay charged. That is the honest
// runbook line, not "rollback is free".

import { createHook } from "workflow";
import type { ModelMessage } from "ai";
import {
  claimRunStep,
  loadTaskStepV10,
  loadContextStepV10,
  loadClientBasisStepV21,
  runModelSegmentStepV21,
  mintHookTokenStep,
  openInterruptionStep,
  checkpointStep,
  markRunningStep,
  settleStep,
  closeStreamStep,
} from "./chatTurn.v21.impl.js";
import { CLARIFY_FRAMING } from "./chatTurn.v11.prompt.js";
import { systemExtraV19, type ClaraPartV21 } from "./chatTurn.v21.prompt.js";
import { codingIncompleteRefusal } from "./chatTurn.v10.errors.js";

const MAX_SEGMENTS = 12; // hard bound on clarify round-trips per turn (safety) — v1 value, unchanged.

/** LOCAL COPY of v10..v20's settle error-code derivation — see v13.ts for the CHECK rationale. */
export function errorCodeFromCaughtError(): string {
  return "model_error";
}

/** v20's replay dedup (C-19), byte-carried. v21 adds no arm because it adds no kind: the one tool
 *  that mints a card mints `work_accepted`, which already dedupes on `work_id` — and that is
 *  exactly the property a replayed segment needs, since the tool's op key is deterministic and a
 *  re-run returns the SAME Work. */
function pushPart(all: ClaraPartV21[], p: ClaraPartV21): void {
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

export async function chatTurn_v21(input: { taskId: string }): Promise<{ taskId: string; outcome: string; segments: number }> {
  "use workflow";
  const taskId = input.taskId;
  const messages: ModelMessage[] = [];
  const allParts: ClaraPartV21[] = [];
  let outcome: "completed" | "failed" | "expired" | "cancelled" = "completed";
  let segment = 0;
  let codingIntended = false;

  let settled = false;
  const settle = async (o: typeof outcome, errorCode: string | null) => {
    if (settled) return;
    settled = true;
    // Same sound, asserted-by-cell cast v13..v20.ts use — settleStep/checkpointStep are v10's
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
      const seg = await runModelSegmentStepV21(taskId, task.model, task.clientId, task.firmId, task.createdBy, messages, systemExtra, segment);
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

    // C-19 terminal invariant — v20's set, which is v19's, which is v18's, unchanged (see header).
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
