// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A): a deployed workflow body is
// IMMUTABLE once any run can be in flight. clientOnboarding_v1 is a NEW frozen closure
// (FORK-8: a permanent registry class — REGISTRY-CLASS-REMOVED). Ship any behavioural
// change as clientOnboarding_v2; never edit this file or its import closure once deployed.
//
// clientOnboarding_v1 — the durable client identity interview (Wave B, B-3 / Gate O).
// The client + plan are born by the HUMAN dashboard verb begin_client_onboarding BEFORE
// this run; the input carries {clientId, planId}. This workflow drives the salvaged 13-Q
// (adapted): each segment parks on a WDK hook (the ≥48h park Gate O kills/resumes across),
// validates + echo-confirms BEFORE persisting (P19), and writes ONE update_onboarding_plan
// CAS per confirmed answer (CLR06 → re-read + retry once). Must-asks are plan items
// (FORK-3); the opening position rides AMB-11 item keys; a non-straight-line asset records
// a FORK-7 todo. The run completes 'interview_complete'; commit_client_onboarding is the
// HUMAN dashboard ceremony (never this workflow — it is clara_authenticated-only).
//
// PARK/DELIVER (the "typed sibling lane"): agent_tasks.kind is CHECK-locked to
// ('chat_turn','wake') and 0017 does not widen it, so open_interruption (which needs an
// agent_tasks row an interview cannot own — chat_turn collides with the reconciler, wake
// cannot park) is unavailable. Instead each park is a pure WDK createHook with a
// DETERMINISTIC token (interview.v1.core hookToken over runId+parkIndex); the answer route
// resumes it via resumeHook. The asbuilt reference sanctions "open_interruption OR a typed
// sibling lane" for this family.

import { createHook } from "workflow";
import { CLIENT_SEGMENTS } from "./interview.v1.questions.js";
import { askAndConfirmSegment, hookToken, type AskFn, type Resolution } from "./interview.v1.core.js";
import { mintOpKeyStep, runIdStep, streamPromptStep, streamTerminalStep, readPlanStep, updatePlanStep } from "./interview.v1.steps.js";

export type ClientOnboardingInput = { clientId: string; planId: string };
export type ClientOnboardingOutcome = { planId: string; clientId: string; outcome: "interview_complete" | "cancelled" | "expired" | "plan_gone"; answered: number };

export async function clientOnboarding_v1(input: ClientOnboardingInput): Promise<ClientOnboardingOutcome> {
  "use workflow";
  const runId = await runIdStep();
  const planId = input.planId;
  const clientId = input.clientId;

  // The plan (born by begin_client_onboarding) supplies the initial revision to CAS on.
  const plan0 = await readPlanStep(planId);
  if (!plan0 || plan0.state !== "open") {
    await streamTerminalStep({ outcome: "plan_gone", planId, clientId });
    return { planId, clientId, outcome: "plan_gone", answered: 0 };
  }
  let revision = plan0.revisionToken;

  // A monotonic park index makes every hook token unique AND reconstructible by the
  // answer route (which learns the current index from GET /state).
  const park = { n: 0 };
  const ask: AskFn = async (prompt) => {
    const idx = park.n++;
    await streamPromptStep({ parkIndex: idx, seg: prompt.seg, phase: prompt.phase, question: prompt.question, scope: "client" });
    const hook = createHook<Resolution>({ token: hookToken("client", runId, idx) });
    return hook; // PARK — zero compute until the answer/cancel route resumes this token
  };

  const prior: Record<string, unknown> = {};
  let answered = 0;

  for (const seg of CLIENT_SEGMENTS) {
    const res = await askAndConfirmSegment(seg, ask, prior);
    if (res.outcome === "cancelled" || res.outcome === "expired") {
      await streamTerminalStep({ outcome: res.outcome, planId, clientId, answered });
      return { planId, clientId, outcome: res.outcome, answered };
    }
    if (res.outcome === "skipped") continue;

    // Confirmed: record the value for cross-field validators (turnover → tin) and persist
    // exactly one CAS write (P19 — nothing flawed persisted; the value passed validate+confirm).
    prior[seg.key] = res.value;
    const opKey = await mintOpKeyStep(`plan:${seg.key}`);
    const write = await updatePlanStep({
      planId,
      expectedRevision: revision,
      items: res.items,
      answeredBy: res.answeredBy,
      opKey,
      retryOpKey: `${opKey}:retry`,
    });
    revision = write.revisionToken;
    answered += 1;
  }

  await streamTerminalStep({ outcome: "interview_complete", planId, clientId, answered });
  return { planId, clientId, outcome: "interview_complete", answered };
}
