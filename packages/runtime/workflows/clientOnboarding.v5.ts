// @frozen
//
// BINDING versioning policy (ARCHITECTURE Appendix A): a deployed workflow body is IMMUTABLE once
// any run can be in flight. clientOnboarding_v5 is the successor to clientOnboarding_v4; v1, v2, v3
// AND v4 stay byte-identical, exported and registered so every parked run — and the ≥48h parks are
// the whole point of this class — finishes on the semantics it started with. The registry points
// NEW admissions here. Ship the next behavioural change as _v6.
//
// clientOnboarding_v5 — the durable client identity interview. IDENTICAL to v4 in driver,
// persistence, park ordering and every durability property: the plan/run binding written as the
// FIRST plan item ('interview_run', closing the /start double-submit race), one
// update_onboarding_plan CAS write per confirmed answer with the F6 re-echo instead of a
// last-writer-wins overwrite, the stable per-attempt op_keys, P19 (validated, echo-confirmed, and
// only then persisted), and v3's ARM BEFORE ANNOUNCE fix (GH #152) — the two lines in `ask` that
// must not be reordered.
//
// FOUR DIFFERENCES, ALL OF THEM #649's SUCCESSOR CONTRACT, DELIVERED AT THE WAVE'S INTEGRATION CUT
// BECAUSE DECISIONS §1.1 FORBIDS AN IMPLEMENTATION BRANCH FROM CUTTING ONE.
//
//   1. THE QUESTION INVENTORY IS CLIENT_SEGMENTS_V4 (interview.v4.questions.ts), which is
//      CLIENT_SEGMENTS_V3 with `sst_no` gated behind `sst_regime !== 'not_registered'` (H-52) and a
//      new `fye_day` segment immediately after `fye` (D7). Every other segment is the SAME OBJECT
//      REFERENCE v3 holds.
//
//   2. THE KNOWN-FACTS PRE-READ. One call to `clara.get_knowledge_pack`, before the segment loop,
//      through the sibling step module `interview.v4.known.ts`. A segment whose registered fact the
//      segment's OWN validator accepts is not asked: its plan item is written from the recorded
//      value and the activity echo says where it came from, and a companion `capture` item under a
//      NEW key (`<segment>__known_from_register`) records WHICH knowledge record supplied it — the
//      durable half of that sentence, because `update_onboarding_plan` can only stamp `answered_by`
//      with a real active bookkeeper and the run's starter did not answer it. "An answered fact is
//      an absent question, not an unanswered one."
//
//   3. THE PLAN'S OWN ANSWERED ITEMS SEED `prior` TOO — the other half of the stanza's "seeding
//      `prior` from `clara.get_knowledge_pack` … plus the plan's own answered items". A firm that
//      filled part of the plan from the dashboard and then started the interview was asked every
//      one of those questions again by v4. Each item is put through the SEGMENT'S OWN validator,
//      in segment order, so what seeds `prior` is a value the question could lawfully have been
//      answered with; a value the validator refuses seeds nothing and the question is asked.
//      `clara.begin_client_onboarding` seeds NO items, so a plan born and interviewed in one go is
//      unaffected, and `answered` still counts what THIS run asked.
//
//   4. "KNOWN, CONFIRM", NOT ONLY "KNOWN, SKIP". A recorded fact the validator REFUSES does not
//      silently disappear: the question is asked with the recorded value and its provenance in
//      front of the person. What this cut does NOT do is write the correction back — that is
//      `capture_knowledge`'s act under a named human's authority, and a workflow step carries no
//      authenticated actor (the same wall `interview.v3.questions.ts` documents for the chart
//      apply). Named as a residual in the cut's report rather than half-built here.
//
// WHY THE PRE-READ CANNOT SUPPRESS A QUESTION BY FAILING, which is the property that makes this
// safe to ship: `readKnowledgePack` answers `{status:'unavailable'}` rather than throwing or
// returning null, `loadKnownFactsStep` folds an unavailable pack to NO known facts, and no known
// facts means every question is asked exactly as v4 asks them. The failure mode of the new read is
// the OLD behaviour.
//
// DEPLOY ORDER. This body writes plan items and makes ONE new read: `clara.get_knowledge_pack`
// (0192), already granted to `clara_runtime` and live since the chatTurn_v19 image. Against a
// database without it the read classifies the missing function as a failure, the fold yields
// nothing, and the interview asks every question — so the wrong order costs a feature and corrupts
// nothing. The fy-end DAY reaches `clara.clients` through
// `clara.settle_client_onboarding_facts` (0219) on the HUMAN lane, not from here.

import { createHook } from "workflow";
import { CLIENT_SEGMENTS_V4 } from "./interview.v4.questions.js";
import {
  knownAnswer,
  knownEcho,
  knownProvenanceItem,
  knownQuestionFor,
  loadKnownFactsStep,
  priorFromPlanItems,
  segmentAsking,
  type KnownFacts,
} from "./interview.v4.known.js";
import { applyPersistOutcome, askAndConfirmSegmentV2, defaultItem, questionOf, segmentApplies, hookToken, interviewRunBinding, type AskFn, type Resolution, type PlanItemInput } from "./interview.v2.core.js";
import { mintOpKeyStep, runIdStep, streamPromptStep, streamActivityStep, streamOwnerStep, streamTerminalStep, readPlanStep, updatePlanStep } from "./interview.v1.steps.js";
import { itemFingerprint, fingerprintMap } from "./interview.v1.writer.js";

// The authenticated caller who started the run (the /client/start principal). The DB re-validates
// it as an active bookkeeper+ of the plan's firm on the binding write (update_onboarding_plan
// CLR04), so /client/start floors the caller at bookkeeper+ before minting the run.
export type ClientOnboardingV5Input = { clientId: string; planId: string; startedBy: string };
export type ClientOnboardingV5Outcome = { planId: string; clientId: string; outcome: "interview_complete" | "cancelled" | "expired" | "plan_gone" | "superseded_by_existing_run"; answered: number };

export async function clientOnboarding_v5(input: ClientOnboardingV5Input): Promise<ClientOnboardingV5Outcome> {
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

  // THE KNOWN-FACTS PRE-READ (#649 item 3). The firm comes from the PLAN ROW, never from the
  // caller's input: it is the tenant binding this run already trusts for every write it makes, the
  // pack door REQUIRES a firm on the machine lane (0192 CLR10 `pack_firm_required`) and refuses
  // CLR11 when the named firm does not own the client, and an input-supplied firm would be a
  // provenance claim nobody checked. `interviewRoutes.ts` therefore needs no edit: the input shape
  // is v4's, unchanged.
  const known: KnownFacts = await loadKnownFactsStep(clientId, plan0.firmId);

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

  // #649 ITEM 3, THE PLAN HALF. The stanza seeds `prior` from the knowledge pack AND from "the
  // plan's own answered items"; the pack half is `known` above, this is the other. It closes the
  // ordinary case of a firm that filled part of the plan from the dashboard and THEN started the
  // interview — v4 re-asked every one of those questions. `clara.begin_client_onboarding` seeds no
  // items, so a plan born and interviewed in one go folds to `{}` here and this run is v4's.
  //
  // `planAnswered` is kept SEPARATELY rather than read back off `prior`, because `prior` fills as
  // the loop runs: the set is "what the plan told us before anybody was asked anything", and the
  // skip below must mean exactly that.
  const prior: Record<string, unknown> = priorFromPlanItems(CLIENT_SEGMENTS_V4, plan0.items);
  const planAnswered = new Set<string>(Object.keys(prior));
  let answered = 0;

  // Persist a confirmed segment under the revision CAS, re-echoing (re-ask + re-confirm against
  // the fresh plan) instead of overwriting when a concurrent editor touched OUR key (F6).
  async function persistSegment(seg: (typeof CLIENT_SEGMENTS_V4)[number], res0: Extract<Awaited<ReturnType<typeof askAndConfirmSegmentV2>>, { outcome: "answered" }>) {
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
      // Foreign edit to our key — rebuild the baseline from live and re-echo the segment. THE
      // RE-ECHO ASKS A PERSON, always: a known fact settled the FIRST write, and a concurrent
      // editor who changed that key has said something the register had not. Re-applying the
      // recorded value over them would be the interview overruling a human with a stored fact.
      revision = write.revisionToken;
      if (write.liveItems) Object.assign(knownMap, fingerprintMap(write.liveItems));
      const reEcho = await askAndConfirmSegmentV2(segmentAsking(seg, knownQuestionFor(seg, prior, known)), ask, prior);
      if (reEcho.outcome === "cancelled" || reEcho.outcome === "expired") return { kind: reEcho.outcome };
      if (reEcho.outcome === "skipped") return { kind: "skipped" as const };
      res = reEcho;
      attempt += 1;
    }
  }

  for (const seg of CLIENT_SEGMENTS_V4) {
    // An inapplicable segment (the Sdn Bhd-only private-entity screen; an SST number for a client
    // that is not registered) is not asked and leaves no plan item — an absent question, not an
    // unanswered one.
    if (!segmentApplies(seg, prior)) continue;

    // AN ITEM THE PLAN ALREADY CARRIES IS AN ABSENT QUESTION TOO, and it is not this run's to
    // re-record: the value is already durable, already attributed to whoever wrote it, and already
    // in `prior` for the cross-field validators below. Nothing is written and `answered` does not
    // move — that count is what THIS run asked and had answered.
    if (planAnswered.has(seg.key)) continue;

    // #649 ITEM 3 — AN ALREADY-ANSWERED FACT IS AN ABSENT QUESTION. The register's value is put
    // through the SEGMENT'S OWN VALIDATOR, so what lands in the plan is a value this question could
    // lawfully have been answered with, normalised by the same code path a person's typing takes.
    // `answeredBy` is the member who STARTED the run: nobody answered this question, and the plan
    // records who was at the keyboard when the recorded fact was taken as read.
    const auto = knownAnswer(seg, prior, known);
    if (auto) {
      const asked = segmentAsking(seg, questionOf(seg, prior));
      const segItems = seg.toItems ? seg.toItems(auto.value, asked) : [defaultItem(asked, auto.value)];
      // AND THE DURABLE RECORD SAYS WHO ANSWERED IT, HONESTLY. `update_onboarding_plan` stamps
      // `answered_by` with the actor it is given and requires an active bookkeeper+, so the answer
      // item is attributed to the member who STARTED the run — somebody who did not answer this
      // question. The value stays exactly where the commit ceremony reads it; a companion `capture`
      // item under a NEW key records which knowledge record supplied it, at which watermark.
      // `concat`, not `push`: a segment's own `toItems` owns the array it returns.
      const items = segItems.concat([knownProvenanceItem(auto.fact)]);
      prior[seg.key] = auto.value;
      const done = await persistSegment(seg, {
        outcome: "answered",
        value: auto.value,
        answeredBy: input.startedBy,
        items,
        echo: auto.echo,
      });
      if (done.kind === "cancelled" || done.kind === "expired") {
        await streamTerminalStep({ outcome: done.kind, planId, clientId, answered });
        return { planId, clientId, outcome: done.kind, answered };
      }
      applyPersistOutcome(prior, seg.key, done);
      if (done.kind === "skipped") continue;
      if (done.kind === "written") {
        await streamActivityStep({ seg: seg.key, phase: "c", echo: knownEcho(auto.fact, done.echo) });
        answered += 1;
      }
      continue;
    }

    // A recorded fact the validator REFUSED is shown in the question rather than dropped
    // (`knownQuestionFor` returns the ordinary question when there is nothing to show).
    const res = await askAndConfirmSegmentV2(segmentAsking(seg, knownQuestionFor(seg, prior, known)), ask, prior);
    if (res.outcome === "cancelled" || res.outcome === "expired") {
      await streamTerminalStep({ outcome: res.outcome, planId, clientId, answered });
      return { planId, clientId, outcome: res.outcome, answered };
    }
    if (res.outcome === "skipped") continue;

    // Confirmed: record the value for cross-field validators (turnover → tin, entity_type →
    // framework, fye → fye_day) and persist exactly one CAS write (P19 — the value passed
    // validate+confirm).
    prior[seg.key] = res.value;
    const done = await persistSegment(seg, res);
    if (done.kind === "cancelled" || done.kind === "expired") {
      await streamTerminalStep({ outcome: done.kind, planId, clientId, answered });
      return { planId, clientId, outcome: done.kind, answered };
    }
    // THE VALUE THAT WAS PERSISTED IS THE VALUE LATER SEGMENTS MUST SEE (L4). A re-echo after a
    // CAS conflict can change the answer or skip it, so `prior` is reconciled from the OUTCOME —
    // never left holding the optimistic pre-write value.
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
