// @frozen
//
// FROZEN — the v3 CLIENT question inventory. It exists for ONE reason: `interview.v2.questions.ts`
// is itself @frozen, and `CLIENT_SEGMENTS_V2` is the list `clientOnboarding_v3` walks. A
// behavioural change to a deployed workflow ships as a NEW _vN export, never as an edit
// (AGENTS.md constraint 9 / ARCHITECTURE Appendix A), so the changed list lands here and
// `clientOnboarding_v4` walks it while v3 keeps walking V2, byte-identical.
//
// WHAT CHANGES FROM CLIENT_SEGMENTS_V2, AND NOTHING ELSE DOES. Exactly one segment is replaced --
// `coa_seed`. Every other segment object is the SAME OBJECT REFERENCE taken from
// CLIENT_SEGMENTS_V2 (`.map(seg => seg.key === "coa_seed" ? COA_SEED_SEGMENT_V3 : seg)`), not a
// re-declaration: a copied literal would drift from v2 the first time someone edited one of them,
// and the identity test in wave-f-coa-interview-v4.test.mjs asserts the references are shared.
//
//   裁-23 Q9 — THE WORDING. "Apply the standard LHDN-aligned MPERS Chart of Accounts seed for this
//   client?" asserts an alignment no source supports: LHDN publishes NO chart of accounts (the
//   裁-21 research lane re-fetched this 2026-08-29; its e-Invoice classification codes tag invoice
//   LINES, not GL accounts). The owner ruled the wording changes to "Start this client from the
//   firm's standard chart of accounts?". This question is on screen in front of a professional
//   user, and a claim it cannot support is the kind of thing they will believe.
//
//   D-13 item 4 — THE ANSWER VOCABULARY. The stored answer becomes {"seed":"firm_template"} or
//   {"seed":"manual"}. The item_key `coa_seed_decision` and its `required_for_commit: true` are
//   UNCHANGED and MUST stay unchanged: they are read BY NAME inside commit_client_onboarding, so
//   they are a DB contract, not a label. `lhdn_mpers_standard` is retained as an ACCEPTED value ON
//   READ by clara.coa_chart_state (裁-21 PR-b), which is why no backfill of already-committed
//   plans is owed and none is performed.
//
//   THE CONSUMPTION — the whole point of this file. `coa_seed_decision` has been asked with
//   required_for_commit since the v2 interview shipped and consumed by NOTHING: zero hits across
//   every migration. The segment now emits a SECOND plan item, `coa_chart_apply`, which records
//   what the answer means for the client's chart and is the state PR-d's onboarding checklist card
//   renders. Both arms write it, so the plan shape does not depend on the answer:
//     firm_template -> a DEFERRED todo:   {"chart":"firm_template","applied":false}
//     manual        -> an ANSWERED capture:{"chart":"manual","applied":false}
//   `applied` stays false in BOTH arms and this workflow never sets it true, because:
//
// WHY THIS WORKFLOW DOES NOT CALL clara.apply_coa_template, STATED HERE SO NOBODY "FIXES" IT.
// Three independent reasons, any one of which is sufficient:
//   1. 裁-23 Q5 RULED "NOT automatic -- a separate human click after the client is created",
//      explicitly so that commit_client_onboarding is not touched and someone actually LOOKS at
//      the chart before it lands.
//   2. coa-template-annexes.md Annex E's FIRST non-goal is "any agent path to the BULK apply":
//      "one rationale covering forty accounts is not forty rationales. Clara proposes; a human
//      applies."
//   3. It is not reachable even if the first two were waived. apply_coa_template is
//      bookkeeper-floored through clara._human_ctx, which reads an authenticated actor out of the
//      request JWT. A workflow step runs as clara_runtime or a wake role and has no such actor, so
//      the call raises CLR04 -- and the only way around that is a wake wrapper, which is exactly
//      what (2) forbids. Reaching it by having the runtime assert a human's claims would be the
//      runtime impersonating a person.
// The apply happens when a bookkeeper clicks the checklist row this item puts on screen.
//
//   THE MATERIALS PLAYBOOK DOES NOT NARROW THE CHART, and this is the trap worth naming. F-A7b
//   rules that playbooks ③ bank-only and ④ shoebox take NO OPENING SEED (fa7b-gate-record.md
//   §"The five playbooks"). That is about opening BALANCES. Design D-8 records the opposite
//   intuition as the mistake: "their charts must still be complete -- the trim does NOT get more
//   aggressive because there are fewer materials." So nothing in this file reads the materials
//   answer, and a client with no materials at all still gets the same chart decision.

import { CLIENT_SEGMENTS_V2 } from "./interview.v2.questions.js";
import { validateEnum, type PlanItemInput, type SegmentV2 } from "./interview.v2.core.js";

/** The widened answer vocabulary. `yes`/`no` stay canonical so every existing client-facing
 *  prompt, test script and habit keeps working; the words the new question actually uses map onto
 *  them. A synonym table is how every other segment in this family widens (ENTITY_SYNONYMS_V2,
 *  OPENING_SYNONYMS), so this is the estate's own idiom rather than a new one. */
const COA_SEED_SYNONYMS: Record<string, string> = {
  firm_template: "yes", firm_standard: "yes", standard: "yes", template: "yes", apply: "yes",
  manual: "no", own: "no", their_own: "no", keep_theirs: "no", skip: "no", none: "no",
};

export const COA_SEED_QUESTION_V3 =
  "Start this client from the firm's standard chart of accounts? (yes / no)";

/** The two plan items one answer produces. Exported so the battery can drive it directly. */
export function coaSeedItemsV3(value: unknown, question: string): PlanItemInput[] {
  const wantsTemplate = value === "yes";
  const seed = wantsTemplate ? "firm_template" : "manual";
  return [
    // THE DB CONTRACT. item_key and required_for_commit are v2's, unchanged.
    {
      item_key: "coa_seed_decision", item_kind: "must_ask", question,
      answer: { seed }, state: "answered", required_for_commit: true,
    },
    // THE CONSUMPTION. One key in both arms, so a reader never has to prove an absence to learn
    // what was decided -- `answer.chart` says it positively either way (review law 2).
    {
      item_key: "coa_chart_apply",
      item_kind: wantsTemplate ? "todo" : "capture",
      question: wantsTemplate
        ? "Apply the firm's standard chart of accounts to this client"
        : "This client is being built on its own chart, not the firm's standard",
      answer: { chart: seed, applied: false },
      state: wantsTemplate ? "deferred" : "answered",
      required_for_commit: false,
    },
  ];
}

const COA_SEED_SEGMENT_V3: SegmentV2 = {
  key: "coa_seed",
  question: COA_SEED_QUESTION_V3,
  requiredForCommit: true,
  skippable: false,
  validate: validateEnum("CoA seed decision", ["yes", "no"], COA_SEED_SYNONYMS),
  toItems: (v, seg) => coaSeedItemsV3(v, seg.question),
};

/**
 * The v3 CLIENT inventory: CLIENT_SEGMENTS_V2 with `coa_seed` swapped, ORDER PRESERVED.
 *
 * Built by mapping over v2 rather than re-listing, so every other segment is the same object v2
 * holds. Two things follow, and both are asserted rather than assumed: the order is v2's (the
 * cross-field validators depend on it -- turnover must precede tin), and a later edit to any v2
 * segment reaches v4 automatically instead of silently diverging.
 */
export const CLIENT_SEGMENTS_V3: readonly SegmentV2[] = CLIENT_SEGMENTS_V2.map(
  (seg) => (seg.key === "coa_seed" ? COA_SEED_SEGMENT_V3 : seg),
);
