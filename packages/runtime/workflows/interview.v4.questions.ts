// @frozen
//
// FROZEN — the v4 CLIENT question inventory. It exists for the reason `interview.v3.questions.ts`
// exists: that file is itself @frozen and `CLIENT_SEGMENTS_V3` is the list `clientOnboarding_v4`
// walks, so a behavioural change to a deployed workflow ships as a NEW _vN export, never as an
// edit (ARCHITECTURE §10 / Appendix A). The changed list lands here and `clientOnboarding_v5` walks
// it while v4 keeps walking V3, byte-identical.
//
// WHAT CHANGES FROM CLIENT_SEGMENTS_V3, AND NOTHING ELSE DOES. Built by FLAT-MAPPING over
// CLIENT_SEGMENTS_V3 and replacing only the changed segments BY REFERENCE — the discipline
// `interview.v3.questions.ts` states and its own battery asserts. Every other segment object is the
// SAME OBJECT REFERENCE v3 holds, so a later edit to any of them reaches v5 automatically instead
// of silently diverging, and the ORDER is v3's (the cross-field validators depend on it — turnover
// must precede tin, and `sst_regime` must precede `sst_no`).
//
//   H-52 — `sst_no` GAINS AN `appliesTo`. The interview asks every client for an SST registration
//   NUMBER, including the ones that have just told it they are `not_registered`. That is a question
//   with no lawful answer, and the run has already been told the answer to it: #649's own cell
//   `p649.interview.sst_park_today` pins the park as it stands TODAY and is meant to go red at this
//   cut. The predicate is exactly the shape `interview.v2.segments.ts`'s private-entity screen
//   already uses, and `segmentApplies` (interview.v2.core.ts) is the only mechanism — no driver
//   change, and an inapplicable segment leaves NO plan item: an absent question, never an
//   unanswered one.
//
//   D7 — THE FINANCIAL YEAR-END DAY. `clara.clients` has carried `fy_end_month` AND `fy_end_day`
//   since 0041 under a CHECK that admits 1–31 with February at 29 and the thirty-day months at 30;
//   the interview has only ever asked the MONTH. The web form #649 shipped asks the day and offers
//   month-end as a VISIBLE suggestion; this segment is the interview's half of the same ruling —
//   ASK, never derive. Deriving a year-end day would be inventing an accounting fact on a
//   professional's record, which is what D7 refuses.
//
//     `required_for_commit` STAYS FALSE, and that is a deliberate non-decision rather than an
//     oversight. `commit_client_onboarding`'s gate is a live ceremony read BY NAME out of the plan
//     items, so making the day a commit prerequisite is a product change nobody has ruled — and one
//     that would newly block every commit whose plan predates this cut. The day is still ASKED, and
//     the web form remains its transport into `clara.clients`. If the orchestrator wants it gating,
//     that is a one-word change and should be an explicit ruling.
//
//     IT IS NOT SKIPPABLE, WHICH IS NOT THE SAME THING. `skippable: false` means the interview does
//     not offer "skip" as an answer to this question; `requiredForCommit: false` means an
//     unanswered plan does not fail the ceremony. A person who genuinely does not know can cancel
//     or leave the run parked, and the web form is still there.
//
//   THE KNOWN-FACTS PRE-READ IS NOT IN THIS FILE. It is a sibling step module
//   (`interview.v4.known.ts`) because it reads the DATABASE, and a question inventory that made a
//   door call would be a list of questions that could fail.
//
// WHAT THIS FILE DOES NOT DO, STATED SO NOBODY "FIXES" IT: it writes nothing to `clara.clients`.
// The fy-end pair reaches the client row through `clara.settle_client_onboarding_facts` (0204),
// which is bookkeeper-floored and human-called. A workflow step carries no authenticated actor, so
// this segment records a PLAN ITEM and the human lane settles it — the same division
// `interview.v3.questions.ts` states at length for the chart-of-accounts apply.

import { CLIENT_SEGMENTS_V3 } from "./interview.v3.questions.js";
import { type PlanItemInput, type SegmentV2, type Validation } from "./interview.v2.core.js";

/** The last day each month can carry, as `ck_clients_fy_end` (0041:779) spells it: February at 29
 *  — a leap-day year end is rare but real and the database admits it — and April, June, September
 *  and November at 30. The interview refuses what the client row would refuse, so a person learns
 *  it while they are still looking at the question rather than at a settle failure days later. */
export const FYE_MONTH_LAST_DAY: readonly number[] = Object.freeze([31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

export const FYE_DAY_QUESTION =
  "Which day of that month is the client's financial year-end? (1–31 — Clara does not assume month end)";

/**
 * The day, validated against the MONTH the previous segment recorded.
 *
 * IT READS `prior["fye"]`, WHICH IS WHY THE SEGMENT SITS IMMEDIATELY AFTER `fye`. The driver seeds
 * `prior` from each persisted answer in order, so by the time this question is asked the month is
 * there — and if it somehow is not, the validator falls back to the calendar maximum of 31 rather
 * than refusing a correct answer for a reason the person cannot act on.
 */
export function validateFyeDay(raw: unknown, prior: Readonly<Record<string, unknown>>): Validation {
  const s = typeof raw === "string" ? raw.trim() : raw === null || raw === undefined ? "" : String(raw).trim();
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    return { ok: false, reason: "The financial year-end day must be a whole number 1–31." };
  }
  const month = Number(prior["fye"]);
  const max = Number.isInteger(month) && month >= 1 && month <= 12 ? FYE_MONTH_LAST_DAY[month - 1]! : 31;
  if (n > max) {
    return {
      ok: false,
      reason: `Month ${month} has ${max} days, so ${n} is not a date. Give a day from 1 to ${max}.`,
    };
  }
  return { ok: true, value: n, echo: `financial year-end day ${n}` };
}

/** ONE plan item, `capture` kind, not required for commit. The item_key is NEW — nothing in
 *  `commit_client_onboarding` reads it — so it adds a fact to the plan without moving the gate. */
export function fyeDayItems(value: unknown, question: string): PlanItemInput[] {
  return [
    {
      item_key: "fye_day",
      item_kind: "capture",
      question,
      answer: value,
      state: "answered",
      required_for_commit: false,
    },
  ];
}

const FYE_DAY_SEGMENT_V4: SegmentV2 = {
  key: "fye_day",
  question: FYE_DAY_QUESTION,
  requiredForCommit: false,
  skippable: false,
  validate: validateFyeDay,
  toItems: (v, seg) => fyeDayItems(v, seg.question),
};

/** H-52's predicate, spelled once and exported so a cell can drive it without reconstructing it.
 *  `not_registered` is one of `SST_REGIMES`' four members (0192 carries the same four on
 *  `clara.knowledge_keys.allowed_values` for `sst_regime`), so this is a closed comparison against a
 *  value the previous segment's own `validateEnum` already normalised. An ABSENT `sst_regime` —
 *  the segment was somehow not answered — still asks, because "we do not know" is not "not
 *  registered". */
export function sstNumberApplies(prior: Readonly<Record<string, unknown>>): boolean {
  return prior["sst_regime"] !== "not_registered";
}

/**
 * The v4 CLIENT inventory: CLIENT_SEGMENTS_V3 with `sst_no` gated, `fye_day` inserted immediately
 * after `fye`, ORDER OTHERWISE PRESERVED.
 *
 * `flatMap` rather than two passes, so the insertion point is expressed as "after this key" rather
 * than as an index that a later edit to v2 or v3 would silently move.
 */
export const CLIENT_SEGMENTS_V4: readonly SegmentV2[] = CLIENT_SEGMENTS_V3.flatMap((seg) => {
  if (seg.key === "sst_no") {
    // BY REFERENCE EVERYWHERE ELSE: this is the ONE segment that gains a field, and it gains it as
    // a new object over v3's own properties rather than a re-declaration of the question, the
    // validator or the flags — all three stay v3's, read off v3's object.
    const gated: SegmentV2 = {
      key: seg.key,
      question: seg.question,
      requiredForCommit: seg.requiredForCommit,
      skippable: seg.skippable,
      validate: seg.validate,
      appliesTo: sstNumberApplies,
    };
    if (seg.questionFor) gated.questionFor = seg.questionFor;
    if (seg.followUps) gated.followUps = seg.followUps;
    if (seg.onInsist) gated.onInsist = seg.onInsist;
    if (seg.warn) gated.warn = seg.warn;
    if (seg.toItems) gated.toItems = seg.toItems;
    return [gated];
  }
  if (seg.key === "fye") return [seg, FYE_DAY_SEGMENT_V4];
  return [seg];
});
