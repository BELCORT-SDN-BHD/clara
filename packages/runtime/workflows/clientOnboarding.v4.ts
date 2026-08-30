// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A): a deployed workflow body is IMMUTABLE once
// any run can be in flight. clientOnboarding_v4 is the question-inventory successor to
// clientOnboarding_v3; v1, v2 AND v3 stay byte-identical, exported and registered so every parked
// run — and the ≥48h parks are the whole point of this class — finishes on the semantics it
// started with. The registry points NEW admissions here. Ship the next behavioural change as _v5.
//
// clientOnboarding_v4 — the durable client identity interview. IDENTICAL to v3 in driver,
// persistence, park ordering and every durability property: the plan/run binding written as the
// FIRST plan item ('interview_run', closing the /start double-submit race), one
// update_onboarding_plan CAS write per confirmed answer with the F6 re-echo instead of a
// last-writer-wins overwrite, the stable per-attempt op_keys, P19 (validated, echo-confirmed, and
// only then persisted), and v3's own correctness fix — ARM BEFORE ANNOUNCE (GH #152), the two
// lines in `ask` that must not be reordered.
//
// THE ONLY DIFFERENCE IS THE QUESTION INVENTORY: CLIENT_SEGMENTS_V3 instead of CLIENT_SEGMENTS_V2.
// That list is CLIENT_SEGMENTS_V2 with exactly one segment swapped — `coa_seed` — and every other
// segment is the same object v2 holds (interview.v3.questions.ts states why, and its own battery
// asserts the shared references and the preserved order).
//
// WHAT THAT ONE SEGMENT CHANGES, in three lines (裁-21 PR-c; the full argument is
// interview.v3.questions.ts's header):
//   * 裁-23 Q9 — the question stops claiming an "LHDN-aligned MPERS" chart, which no source
//     supports, and asks "Start this client from the firm's standard chart of accounts?".
//   * D-13 item 4 — the stored answer becomes {"seed":"firm_template"} | {"seed":"manual"};
//     `coa_seed_decision` and its required_for_commit are UNCHANGED (a DB contract read by name
//     inside commit_client_onboarding), and the legacy `lhdn_mpers_standard` stays accepted ON
//     READ by clara.coa_chart_state, so no committed plan needs backfilling.
//   * THE CONSUMPTION — a second plan item, `coa_chart_apply`, records what the answer means for
//     the client's chart. It is the state PR-d's onboarding checklist row renders, and it is the
//     first consumer `coa_seed_decision` has ever had.
//
// THIS WORKFLOW DOES NOT APPLY THE CHART, and that is 裁-23 Q5's ruling ("NOT automatic — a
// separate human click"), Annex E's first non-goal ("any agent path to the BULK apply"), and a
// structural fact (clara.apply_coa_template is bookkeeper-floored through clara._human_ctx, and a
// workflow step carries no authenticated actor) all agreeing. interview.v3.questions.ts states the
// three reasons in full so a later reader does not "fix" it.
//
// DEPLOY ORDER. This body only WRITES PLAN ITEMS; it calls no new database verb, so an image
// carrying v4 against a database that predates 裁-21 PR-b works exactly as v3 did plus one extra
// plan item, and a post-PR-b database under a v3 image simply keeps writing the legacy answer
// value — which PR-b's read already accepts. Neither order breaks; there is no ceremony here.

import { createHook } from "workflow";
import { CLIENT_SEGMENTS_V3 } from "./interview.v3.questions.js";
import { applyPersistOutcome, askAndConfirmSegmentV2, segmentApplies, hookToken, interviewRunBinding, type AskFn, type Resolution, type PlanItemInput } from "./interview.v2.core.js";
import { mintOpKeyStep, runIdStep, streamPromptStep, streamActivityStep, streamOwnerStep, streamTerminalStep, readPlanStep, updatePlanStep } from "./interview.v1.steps.js";
import { itemFingerprint, fingerprintMap } from "./interview.v1.writer.js";

// The authenticated caller who started the run (the /client/start principal). The DB re-validates
// it as an active bookkeeper+ of the plan's firm on the binding write (update_onboarding_plan
// CLR04), so /client/start floors the caller at bookkeeper+ before minting the run.
export type ClientOnboardingV4Input = { clientId: string; planId: string; startedBy: string };
export type ClientOnboardingV4Outcome = { planId: string; clientId: string; outcome: "interview_complete" | "cancelled" | "expired" | "plan_gone" | "superseded_by_existing_run"; answered: number };

export async function clientOnboarding_v4(input: ClientOnboardingV4Input): Promise<ClientOnboardingV4Outcome> {
  "use workflow";
  const runId = await runIdStep();
  const planId = input.planId;
  const clientId = input.clientId;

  // FIRST streamed chunk: the binding owner marker (before any prompt) — the route checks the
  // plan's 'interview_run' item (written below), but the marker also announces the client scope.
  await streamOwnerStep({ scope: "client", planId });

  // The plan (born by begin_client_onboarding) supplies the initial revision to CAS on.
  const plan0 = await readPlanStep(planId);
  if (!plan0 || plan0.state !== "open") {
    await streamTerminalStep({ outcome: "plan_gone", planId, clientId });
    return { planId, clientId, outcome: "plan_gone", answered: 0 };
  }
  let revision = plan0.revisionToken;
  // "What this writer last knew" for the CAS conflict check (F6) — threaded across writes.
  const knownMap: Record<string, string | null> = fingerprintMap(plan0.items);

  // A monotonic park index makes every hook token unique AND reconstructible by the
  // answer route (which learns the current index from GET /state).
  const park = { n: 0 };
  const ask: AskFn = async (prompt) => {
    const idx = park.n++;
    // ARM BEFORE ANNOUNCE (GH #152). createHook() only ENQUEUES the hook; the engine persists
    // hook_created at the next suspension — and at that suspension it creates hooks BEFORE it
    // dispatches any step. Awaiting streamPromptStep IS that suspension, so the token is durable
    // before the announce step runs and the park can never be visible while unanswerable.
    // This ordering is v3's whole correctness fix. Do not reorder them.
    const hook = createHook<Resolution>({ token: hookToken("client", runId, idx) });
    await streamPromptStep({ parkIndex: idx, seg: prompt.seg, phase: prompt.phase, question: prompt.question, scope: "client", expects: prompt.expects, op_key: prompt.op_key });
    return hook; // PARK — zero compute until the answer/cancel route resumes this token
  };

  // BINDING (F1/F5): the FIRST plan write binds this plan to THIS run via an 'interview_run'
  // capture item. A pre-existing binding to a DIFFERENT run means a concurrent start already
  // owns the plan — self-terminate having asked nothing (closes the /start double-submit race).
  const bound = interviewRunBinding(plan0.items);
  if (bound && bound !== runId) {
    await streamTerminalStep({ outcome: "superseded_by_existing_run", planId, clientId, existingRunId: bound });
    return { planId, clientId, outcome: "superseded_by_existing_run", answered: 0 };
  }
  if (bound !== runId) {
    const bindItems: PlanItemInput[] = [
      { item_key: "interview_run", item_kind: "capture", question: null, answer: { run_id: runId }, state: "answered", required_for_commit: false },
    ];
    const bindOp = await mintOpKeyStep("plan:interview_run");
    const bindWrite = await updatePlanStep({
      planId, expectedRevision: revision, items: bindItems, answeredBy: input.startedBy,
      opKey: bindOp, retryOpKey: `${bindOp}:retry`, knownItems: knownMap,
    });
    if (bindWrite.status === "stale_conflict") {
      // A concurrent run bound the plan during our write — it owns it now.
      const now = bindWrite.liveItems ? interviewRunBinding(bindWrite.liveItems) : null;
      await streamTerminalStep({ outcome: "superseded_by_existing_run", planId, clientId, existingRunId: now });
      return { planId, clientId, outcome: "superseded_by_existing_run", answered: 0 };
    }
    revision = bindWrite.revisionToken;
    knownMap["interview_run"] = itemFingerprint({ state: "answered", answer: { run_id: runId } });
  }

  const prior: Record<string, unknown> = {};
  let answered = 0;

  // Persist a confirmed segment under the revision CAS, re-echoing (re-ask + re-confirm against
  // the fresh plan) instead of overwriting when a concurrent editor touched OUR key (F6).
  async function persistSegment(seg: (typeof CLIENT_SEGMENTS_V3)[number], res0: Extract<Awaited<ReturnType<typeof askAndConfirmSegmentV2>>, { outcome: "answered" }>) {
    let res = res0;
    let attempt = 0;
    for (;;) {
      const opKey = await mintOpKeyStep(`plan:${seg.key}#${attempt}`);
      const write = await updatePlanStep({
        planId, expectedRevision: revision, items: res.items, answeredBy: res.answeredBy,
        opKey, retryOpKey: `${opKey}:retry`, knownItems: knownMap,
      });
      if (write.status !== "stale_conflict") {
        revision = write.revisionToken;
        for (const it of res.items) knownMap[it.item_key] = itemFingerprint({ state: it.state, answer: it.answer });
        // `res` is the FINAL confirmed segment (a re-echo overwrites it above), so its echo is the
        // sanitized value actually persisted — the activity chunk carries THAT, never a raw submit.
        return { kind: "written" as const, value: res.value, echo: res.echo };
      }
      // Foreign edit to our key — rebuild the baseline from live and re-echo the segment.
      revision = write.revisionToken;
      if (write.liveItems) Object.assign(knownMap, fingerprintMap(write.liveItems));
      const reEcho = await askAndConfirmSegmentV2(seg, ask, prior);
      if (reEcho.outcome === "cancelled" || reEcho.outcome === "expired") return { kind: reEcho.outcome };
      if (reEcho.outcome === "skipped") return { kind: "skipped" as const };
      res = reEcho;
      attempt += 1;
    }
  }

  for (const seg of CLIENT_SEGMENTS_V3) {
    // An inapplicable segment (the Sdn Bhd-only private-entity screen) is not asked and leaves
    // no plan item — an absent question, not an unanswered one.
    if (!segmentApplies(seg, prior)) continue;
    const res = await askAndConfirmSegmentV2(seg, ask, prior);
    if (res.outcome === "cancelled" || res.outcome === "expired") {
      await streamTerminalStep({ outcome: res.outcome, planId, clientId, answered });
      return { planId, clientId, outcome: res.outcome, answered };
    }
    if (res.outcome === "skipped") continue;

    // Confirmed: record the value for cross-field validators (turnover → tin, entity_type →
    // framework) and persist exactly one CAS write (P19 — the value passed validate+confirm).
    prior[seg.key] = res.value;
    const done = await persistSegment(seg, res);
    if (done.kind === "cancelled" || done.kind === "expired") {
      await streamTerminalStep({ outcome: done.kind, planId, clientId, answered });
      return { planId, clientId, outcome: done.kind, answered };
    }
    // THE VALUE THAT WAS PERSISTED IS THE VALUE LATER SEGMENTS MUST SEE (L4). A re-echo after a
    // CAS conflict can change the answer or skip it, so `prior` is reconciled from the OUTCOME —
    // never left holding the optimistic pre-write value. The fold is a pure function in the core
    // so it can be driven without an engine.
    applyPersistOutcome(prior, seg.key, done);
    if (done.kind === "skipped") continue; // a re-echo chose to skip a skippable field
    if (done.kind === "written") {
      // Confirmed AND persisted — stream the sanitized echo as an activity chunk (parity with the
      // firm run; for the client the plan items are the primary answer surface, so /state MAY fold []).
      await streamActivityStep({ seg: seg.key, phase: "c", echo: done.echo });
      answered += 1;
    }
  }

  await streamTerminalStep({ outcome: "interview_complete", planId, clientId, answered });
  return { planId, clientId, outcome: "interview_complete", answered };
}
