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
import { mintOpKeyStep, runIdStep, streamPromptStep, streamTerminalStep, readPlanStep, updatePlanStep } from "./interview.v1.steps.js";

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
  void input.principalUserId; // advisory: the answering principal is re-validated by the DB writer

  const park = { n: 0 };
  const ask: AskFn = async (prompt) => {
    const idx = park.n++;
    await streamPromptStep({ parkIndex: idx, seg: prompt.seg, phase: prompt.phase, question: prompt.question, scope: "firm" });
    const hook = createHook<Resolution>({ token: hookToken("firm", runId, idx) });
    return hook; // PARK
  };

  // The 11-Q interview — answers accumulate in the durable run ONLY (P19; no plan yet).
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
    answered += 1;
  }

  // Commit: mint the stable op_key (O7) and surface it; the dashboard calls create_firm
  // with it + the admission token and delivers {firm_id, plan_id} as this park's answer.
  const opKey = await mintOpKeyStep("create_firm");
  const commit = await ask({
    seg: "commit",
    phase: "q",
    question:
      `Firm profile ready (${answered} answers). To create the firm, the dashboard calls ` +
      `create_firm with op_key=${opKey} and your admission token, then confirms here. (confirm / cancel)`,
  });
  if (commit.kind !== "answer") {
    await streamTerminalStep({ outcome: commit.kind, answered });
    return { outcome: commit.kind, firmId: null, planId: null, answered };
  }
  const delivery = (commit.value ?? {}) as CommitDelivery;
  const firmId = delivery.firmId ?? null;
  const planId = delivery.planId ?? null;
  if (!firmId || !planId) {
    // The dashboard must deliver a create_firm receipt; without it there is nothing to
    // attribute the plan to — treat as a cancel (nothing flawed persisted).
    await streamTerminalStep({ outcome: "cancelled", answered, reason: "no_create_firm_receipt" });
    return { outcome: "cancelled", firmId: null, planId: null, answered };
  }

  // Write the accumulated intended-record to the firm plan (minted by create_firm).
  const plan0 = await readPlanStep(planId);
  const revision = plan0?.revisionToken ?? "";
  const planOpKey = await mintOpKeyStep("firm_plan_write");
  await updatePlanStep({
    planId,
    expectedRevision: revision,
    items: buildFirmPlanItems(answers),
    answeredBy: commit.answeredBy,
    opKey: planOpKey,
    retryOpKey: `${planOpKey}:retry`,
  });

  await streamTerminalStep({ outcome: "firm_created", firmId, planId, answered });
  return { outcome: "firm_created", firmId, planId, answered };
}
