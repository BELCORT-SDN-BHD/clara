// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A): a deployed workflow body is IMMUTABLE
// once any run can be in flight. firmInterview_v3 is the park-ordering successor to
// firmInterview_v2; v1 AND v2 stay byte-identical, exported and registered so every
// parked/replayable run finishes on the semantics it started with (policy (c) — an export with
// in-flight runs is never renamed or removed). The registry points NEW admissions here. Ship the
// next behavioural change as _v4.
//
// firmInterview_v3 — the durable firm-bootstrap interview for a pre-firm principal. IDENTICAL to
// v2 in question set, driver and every durability property (the O7 stable op_key minted in a
// memoized step and surfaced at the commit park, the dashboard-lane create_firm with the
// admission token that never reaches the runtime, the F2 receipt verification before any write,
// the bounded CAS retry on the freshly-minted plan, P19's no-secret-in-a-checkpoint law).
//
// THE ONLY DIFFERENCE IS THE ORDER OF TWO LINES IN `ask`, and it is a correctness fix (GH #152).
//
// v1/v2 ANNOUNCED A PARK BEFORE ARMING IT. `streamPromptStep` (which makes the park visible to
// GET /state) ran FIRST and `createHook` second. WDK registers a hook only when the workflow
// SUSPENDS (@workflow/core create-hook.d.ts: "Calling createHook() alone does not register the
// hook — registration only happens when the workflow suspends"), so the announce step and the
// hook registration landed in two DIFFERENT suspensions: the park became visible at the end of
// turn N, and its hook only existed once turn N+1 suspended. In that window an answer POSTed by
// a client that had just read the park raised HookNotFoundError, which interviewRoutes maps to
// 409 not_pending — a status whose documented contract is "already delivered". The answer was
// silently DROPPED. For the firm scope this also hit the COMMIT park, where a dropped delivery is
// a create_firm receipt the run never sees.
//
// v3 ARMS BEFORE IT ANNOUNCES — the shape chatTurn.v8 has always used (createHook, then
// openInterruptionStep), which is why chat parks never flaked. Both land in the SAME suspension,
// and the engine processes hook creations to completion before it dispatches any step
// (@workflow/core runtime/suspension-handler.js: "Process hooks first to prevent race conditions
// with webhook receivers"). The window is closed BY CONSTRUCTION, not by timing.
//
// Question-set note (unchanged from v2, kept for readers): v2/v3 drive FIRM_SEGMENTS_V2 through
// the v2 driver, which can ask an entity-aware framework question with conditional follow-ups and
// can surface a warning for acknowledgement before an answer is recorded. A segment may DECLINE
// TO APPLY: the CA 2016 s.244 private-entity screen is a Sdn Bhd's question; asking it of a sole
// proprietor would be noise, and a question that must be asked of everyone in order to be asked
// of anyone is how the v1 question set became wrong for four fifths of the entity shapes it served.

import { createHook } from "workflow";
import { FIRM_SEGMENTS_V2, buildFirmPlanItemsV2 } from "./interview.v2.questions.js";
import { askAndConfirmSegmentV2, segmentApplies, hookToken, type AskFn, type Resolution } from "./interview.v2.core.js";
import { writeFirmPlanWithRetries } from "./interview.v2.planwrite.js";
import { mintOpKeyStep, runIdStep, streamPromptStep, streamActivityStep, streamOwnerStep, streamTerminalStep, readPlanStep, updatePlanStep, verifyFirmReceiptStep } from "./interview.v1.steps.js";
import { fingerprintMap } from "./interview.v1.writer.js";

export type FirmInterviewV3Input = { principalUserId: string };
export type FirmInterviewV3Outcome = {
  /** `firm_created` means BOTH halves succeeded: the firm exists AND its profile was written.
   *  `firm_profile_write_failed` is the honest half-outcome — the firm exists (create_firm already
   *  returned a verified receipt, and pretending otherwise would be a worse lie) but the plan
   *  write never landed. Success is never reported for work that did not complete (L6). */
  outcome: "firm_created" | "firm_profile_write_failed" | "cancelled" | "expired";
  firmId: string | null;
  planId: string | null;
  answered: number;
};

/** The commit park's delivered value: the dashboard's create_firm receipt. */
type CommitDelivery = { firmId?: string; planId?: string };

export async function firmInterview_v3(input: FirmInterviewV3Input): Promise<FirmInterviewV3Outcome> {
  "use workflow";
  const runId = await runIdStep();

  // FIRST streamed chunk: the binding owner marker. The answer/cancel + /state routes require
  // this marker's principalUserId to equal the caller's sub BEFORE resuming a hook or exposing
  // the prompt stream (F1) — a firm run has no plan yet, so the marker IS the binding.
  await streamOwnerStep({ scope: "firm", principalUserId: input.principalUserId });

  const park = { n: 0 };
  const ask: AskFn = async (prompt) => {
    const idx = park.n++;
    // ARM BEFORE ANNOUNCE (GH #152). createHook() only ENQUEUES the hook; the engine persists
    // hook_created at the next suspension — and at that suspension it creates hooks BEFORE it
    // dispatches any step. Awaiting streamPromptStep IS that suspension, so the token is durable
    // before the announce step runs and the park can never be visible while unanswerable.
    // Swapping these two lines is the whole of v3. Do not reorder them.
    const hook = createHook<Resolution>({ token: hookToken("firm", runId, idx) });
    await streamPromptStep({ parkIndex: idx, seg: prompt.seg, phase: prompt.phase, question: prompt.question, scope: "firm", expects: prompt.expects, op_key: prompt.op_key });
    return hook; // PARK
  };

  // The interview — answers accumulate in the durable run ONLY (P19; no plan yet). Each
  // CONFIRMED answer streams an interview_activity chunk (the SANITIZED validator echo only) so
  // GET /state can render the running "here is what you told me" trail — the firm has no plan yet.
  const answers: Record<string, unknown> = {};
  let answered = 0;
  for (const seg of FIRM_SEGMENTS_V2) {
    // Conditional segments read the answers collected SO FAR — which is exactly why the screen
    // sits after entity_type in the inventory. An inapplicable segment is skipped in silence
    // because it was never a question here, not because an answer went missing.
    if (!segmentApplies(seg, answers)) continue;
    const res = await askAndConfirmSegmentV2(seg, ask, answers);
    if (res.outcome === "cancelled" || res.outcome === "expired") {
      await streamTerminalStep({ outcome: res.outcome, answered });
      return { outcome: res.outcome, firmId: null, planId: null, answered };
    }
    if (res.outcome === "skipped") continue;
    answers[seg.key] = res.value;
    await streamActivityStep({ seg: seg.key, phase: "c", echo: res.echo });
    answered += 1;
  }

  // Commit: mint the stable op_key (O7) and surface it; the dashboard calls create_firm with it
  // + the admission token and delivers a receipt as this park's answer. The answer route rebuilds
  // that receipt into a bare {firmId, planId} (F7/F8 — no admission token ever reaches the hook).
  const opKey = await mintOpKeyStep("create_firm");
  let firmId: string | null = null;
  let planId: string | null = null;
  let answeredBy = "";
  let prefix = "";
  let commitAttempt = 0;
  for (;;) {
    const commit = await ask({
      seg: "commit",
      phase: "q",
      expects: "create_firm_receipt",
      op_key: opKey, // TYPED (F5) — the dashboard reads it off the chunk, not the prose
      question:
        prefix +
        `Firm profile ready (${answered} answers). To create the firm, the dashboard calls ` +
        `create_firm with this op_key and your admission token, then confirms here. (confirm / cancel)`,
    });
    if (commit.kind !== "answer") {
      await streamTerminalStep({ outcome: commit.kind, answered });
      return { outcome: commit.kind, firmId: null, planId: null, answered };
    }
    const delivery = (commit.value ?? {}) as CommitDelivery;
    firmId = delivery.firmId ?? null;
    planId = delivery.planId ?? null;
    answeredBy = commit.answeredBy;
    if (!firmId || !planId) {
      prefix = "No create_firm receipt received yet — after create_firm succeeds, deliver its {firmId, planId}.\n\n";
      commitAttempt += 1;
      continue;
    }
    // F2: never write on an UNVERIFIED receipt — the plan must be an OPEN firm plan of firmId
    // that this principal actively OWNS. A forged receipt pointing at a foreign/open plan re-parks.
    const verified = await verifyFirmReceiptStep({ planId, firmId, principalUserId: input.principalUserId, attempt: commitAttempt });
    if (verified) break;
    prefix = "That firm receipt did not verify (it must name an open firm plan you own). Re-run create_firm and deliver a valid receipt.\n\n";
    firmId = null;
    planId = null;
    commitAttempt += 1;
  }

  // Write the accumulated intended-record to the (verified) firm plan minted by create_firm. The
  // plan is freshly minted, so a CAS conflict is an extreme edge with no interactive re-echo
  // possible post-commit — adopt the live baseline and retry a bounded number of times.
  let revision = "";
  let knownMap: Record<string, string | null> = {};
  const plan0 = await readPlanStep(planId);
  if (plan0) {
    revision = plan0.revisionToken;
    knownMap = fingerprintMap(plan0.items);
  }
  // The write, its bounded retries and its exhaustion park live in interview.v2.planwrite.ts —
  // pure orchestration over injected effects, so the "success only on a landed write" property is
  // driven by tests rather than asserted by reading. Exhaustion returns `abandoned`, and there is
  // no path from there to a success terminal (L6).
  const items = buildFirmPlanItemsV2(answers);
  const write = await writeFirmPlanWithRetries(
    { ask, mintOpKey: mintOpKeyStep, updatePlan: updatePlanStep },
    { planId, items, answeredBy, revision, knownItems: knownMap },
  );
  if (write.status !== "written") {
    await streamTerminalStep({
      outcome: "firm_profile_write_failed",
      firmId,
      planId,
      answered,
      reason: "stale_conflict",
      conflictingKeys: write.conflictingKeys,
      resolution: write.resolution,
    });
    return { outcome: "firm_profile_write_failed", firmId, planId, answered };
  }

  await streamTerminalStep({ outcome: "firm_created", firmId, planId, answered });
  return { outcome: "firm_created", firmId, planId, answered };
}
