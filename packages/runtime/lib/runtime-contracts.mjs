// #1035 — WHAT THIS IMAGE UNDERSTANDS ABOUT THE ESTATE'S DOORS, declared so a ROLLBACK can read it.
//
// THE QUESTION THIS MODULE ANSWERS. `lib/rollback-preflight.mjs` refuses a target image that lacks
// a workflow BODY the applied schema requires. There is a second way a rollback goes wrong and no
// census can see it: a migration changes what a DOOR RETURNS, and an older image reads the new
// answer with the old eyes. Two have shipped, and both were reported ALLOWED by the preflight at a
// hosted window (`docs/plan/active/riders-2026-09-20/RELEASE-W2-RUNBOOK.md` and
// `RELEASE-W3-RUNBOOK.md`, their § RESULTS sections).
//
// SO THE IMAGE SAYS SO ITSELF. Each entry below is a MARKER: a string literal the built bundle
// carries, in the same spirit as the WDK body directives the preflight already scans for. At
// rollback time an operator has an image REFERENCE, not a build date — so the decision has to be a
// measurement of the target artifact, never a hand-maintained list of image tags. The preflight
// scans the target bundle for these markers and refuses one that is missing a marker the applied
// frontier requires. `/api/build-info` serves the same ids for a target that is running.
//
// THREE RULES FOR ADDING ONE, and each of them is a lesson from the two below.
//   1. BOTH SPELLINGS ARE LITERALS. `marker` is what a bundle scan finds and `id` is the
//      vocabulary a rule names. Computing one from the other would leave NO literal in the bundle
//      for the scan to read, which is the whole mechanism.
//   2. A MARKER NAMES BEHAVIOUR THAT IS IN THIS TREE. `module` and `evidence` point at the code
//      that handles the new answer, and `tests/runtime-contracts.test.mjs` reads them: a marker
//      whose behaviour was deleted reds a cell instead of lying to a preflight.
//   3. THE RULE LIVES ELSEWHERE. This roster says what the image CARRIES; `FRONTIER_RULES` in
//      `lib/rollback-preflight.mjs` says from which migration a target must carry it. The two are
//      deliberately separate files: an image built before a rule existed carries neither, and that
//      is exactly the state the rule has to be able to detect.

/** The marker's directive prefix. Kept apart from the ids so this constant alone — which is what
 *  the bundle also carries — cannot be mistaken by a scan for a declared contract: the scan wants
 *  the prefix FOLLOWED by an id, and this literal is followed by nothing. */
export const CONTRACT_MARKER_PREFIX = "clara.contract//";

/**
 * THE CONTRACTS THIS IMAGE UNDERSTANDS, as data.
 *
 * `id` is the vocabulary (`FRONTIER_RULES` names ids; `/api/build-info` serves ids), `marker` is
 * the literal a built bundle carries, `since` is the migration that made the contract the estate's
 * answer, `module` + `evidence` are the proof that this tree implements it, and `why` is what an
 * image WITHOUT it gets wrong — written for the operator who meets the refusal, not for the author.
 */
export const RUNTIME_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "intake_refusal_record_v1",
    marker: "clara.contract//intake_refusal_record_v1",
    since: "0254_intake_refusal_record",
    module: "lib/intake.mjs",
    evidence: "out?.refused === true",
    why:
      "Since 0254 clara.create_document_intake COMMITS a ceiling-refused intake and RETURNS "
      + "refused:true; before it, the door raised CLR18 and the insert rolled back with it. An "
      + "image that does not read the flag takes the refusal receipt for an accepted intake: it "
      + "reads an intake_id off it, mints an upload capability, answers 201 to the uploader for a "
      + "file the firm's daily ceiling turned away, and leaves a sidecar the recovery sweep "
      + "re-drives until its TTL expires it.",
  }),
  Object.freeze({
    id: "fa_parked_run_v1",
    marker: "clara.contract//fa_parked_run_v1",
    since: "0279_fa_closed_year_arrears",
    module: "lib/reconciler-fa.mjs",
    evidence: 'r?.status === "parked"',
    why:
      "Since 0279 clara.run_depreciation_period answers status:'parked' instead of posting when a "
      + "run's charge would fold a closing or closed fiscal year's months forward and nobody has "
      + "judged their materiality (IAS 8). An image that does not know the status counts the park "
      + "as a POST — the belt reports work it never did, and because the due probe still answers "
      + "due:true it keeps chasing the same period to the per-client cap, banking one parked "
      + "receipt per call.",
  }),
]);

/** The ids alone, in the roster's own order — what `/api/build-info` serves as `contracts` and
 *  what `FRONTIER_RULES` compares against. A derived list rather than a second hand-kept one. */
export const RUNTIME_CONTRACT_IDS = Object.freeze(RUNTIME_CONTRACTS.map((c) => c.id));
