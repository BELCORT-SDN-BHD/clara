// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A): a deployed workflow body is
// IMMUTABLE once any run can be in flight. firmInterview_v1 is a NEW frozen closure
// (FORK-8: a permanent registry class). Ship any behavioural change as firmInterview_v2.
//
// firmInterview_v1 — the durable firm-bootstrap interview (Wave B, Gate F) for a pre-firm
// principal (an authenticated user with no firm). Drives the salvaged 11-Q; pre-commit
// answers live ONLY in the durable run (P19 — no plan exists yet, no books/identifier row).
//
// Commit protocol (O7, exactly-once across kills): the workflow mints a STABLE op_key in a
// memoized step and surfaces it in the commit park. create_firm is the HUMAN lane
// (clara_authenticated-only — NOT the runtime): the DASHBOARD calls create_firm(name,
// admission_token, op_key) and POSTs the resulting {firm_id, plan_id} back as the commit
// answer; the answer route delivers it into this hook. The admission token NEVER reaches
// the runtime (the dashboard holds it) — no secret ever enters a checkpoint or plan (P19).
// create_firm's O7 receipt-wrap makes a same-op_key retry replay byte-identically. On
// delivery the workflow writes the accumulated intended-record to the firm plan (minted by
// create_firm) via update_onboarding_plan (the sole runtime-lane write).

import { createHook } from "workflow";
import { FIRM_SEGMENTS, buildFirmPlanItems } from "./interview.v1.questions.js";
import { askAndConfirmSegment, hookToken, type AskFn, type Resolution } from "./interview.v1.core.js";
import { mintOpKeyStep, runIdStep, streamPromptStep, streamActivityStep, streamOwnerStep, streamTerminalStep, readPlanStep, updatePlanStep, verifyFirmReceiptStep } from "./interview.v1.steps.js";
import { fingerprintMap } from "./interview.v1.writer.js";

export type FirmInterviewInput = { principalUserId: string };
export type FirmInterviewOutcome = {
  outcome: "firm_created" | "cancelled" | "expired";
  firmId: string | null;
  planId: string | null;
  answered: number;
};

/** The commit park's delivered value: the dashboard's create_firm receipt. */
type CommitDelivery = { firmId?: string; planId?: string };

export async function firmInterview_v1(input: FirmInterviewInput): Promise<FirmInterviewOutcome> {
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

  // The 11-Q interview — answers accumulate in the durable run ONLY (P19; no plan yet). Each
  // CONFIRMED answer streams an interview_activity chunk (the SANITIZED validator echo only) so
  // GET /state can render the running "here is what you told me" trail — the firm has no plan yet.
  const answers: Record<string, unknown> = {};
  let answered = 0;
  for (const seg of FIRM_SEGMENTS) {
    const res = await askAndConfirmSegment(seg, ask, answers);
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
  const items = buildFirmPlanItems(answers);
  for (let attempt = 0; attempt < 3; attempt++) {
    const planOpKey = await mintOpKeyStep(`firm_plan_write#${attempt}`);
    const write = await updatePlanStep({
      planId,
      expectedRevision: revision,
      items,
      answeredBy,
      opKey: planOpKey,
      retryOpKey: `${planOpKey}:retry`,
      knownItems: knownMap,
    });
    if (write.status !== "stale_conflict") break;
    revision = write.revisionToken;
    if (write.liveItems) knownMap = fingerprintMap(write.liveItems);
  }

  await streamTerminalStep({ outcome: "firm_created", firmId, planId, answered });
  return { outcome: "firm_created", firmId, planId, answered };
}
