// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A): a deployed workflow body is IMMUTABLE
// once any run can be in flight. firmInterview_v2 is the F1/F2 successor to firmInterview_v1;
// v1 stays byte-identical, exported and registered so every parked/replayable run finishes on
// the semantics it started with (policy (c) — an export with in-flight runs is never renamed or
// removed). The registry points NEW admissions here. Ship the next behavioural change as _v3.
//
// firmInterview_v2 — the durable firm-bootstrap interview for a pre-firm principal. Identical
// to v1 in every durability property (the O7 stable op_key minted in a memoized step and
// surfaced at the commit park, the dashboard-lane create_firm with the admission token that
// never reaches the runtime, the F2 receipt verification before any write, the bounded CAS
// retry on the freshly-minted plan, P19's no-secret-in-a-checkpoint law). The DIFFERENCE is the
// question set: v2 drives FIRM_SEGMENTS_V2 through the v2 driver, which can ask an entity-aware
// framework question with conditional follow-ups and can surface a warning for acknowledgement
// before an answer is recorded.
//
// ONE new mechanic in the loop, and it is the reason a v2 workflow body exists at all rather
// than just a v2 question table: a segment may DECLINE TO APPLY. The CA 2016 s.244 private-
// entity screen is a Sdn Bhd's question; asking it of a sole proprietor would be noise, and a
// question that must be asked of everyone in order to be asked of anyone is how the v1 question
// set became wrong for four fifths of the entity shapes it served.

import { createHook } from "workflow";
import { FIRM_SEGMENTS_V2, buildFirmPlanItemsV2 } from "./interview.v2.questions.js";
import { askAndConfirmSegmentV2, segmentApplies, hookToken, type AskFn, type Resolution } from "./interview.v2.core.js";
import { writeFirmPlanWithRetries } from "./interview.v2.planwrite.js";
import { mintOpKeyStep, runIdStep, streamPromptStep, streamActivityStep, streamOwnerStep, streamTerminalStep, readPlanStep, updatePlanStep, verifyFirmReceiptStep } from "./interview.v1.steps.js";
import { fingerprintMap } from "./interview.v1.writer.js";

export type FirmInterviewV2Input = { principalUserId: string };
export type FirmInterviewV2Outcome = {
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

export async function firmInterview_v2(input: FirmInterviewV2Input): Promise<FirmInterviewV2Outcome> {
  "use workflow";
  const runId = await runIdStep();

  // FIRST streamed chunk: the binding owner marker. The answer/cancel + /state routes require
  // this marker's principalUserId to equal the caller's sub BEFORE resuming a hook or exposing
  // the prompt stream (F1) — a firm run has no plan yet, so the marker IS the binding.
  await streamOwnerStep({ scope: "firm", principalUserId: input.principalUserId });

  const park = { n: 0 };
  const ask: AskFn = async (prompt) => {
    const idx = park.n++;
    await streamPromptStep({ parkIndex: idx, seg: prompt.seg, phase: prompt.phase, question: prompt.question, scope: "firm", expects: prompt.expects, op_key: prompt.op_key });
    const hook = createHook<Resolution>({ token: hookToken("firm", runId, idx) });
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
