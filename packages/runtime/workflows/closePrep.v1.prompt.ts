// @frozen
//
// FROZEN — part of the closePrep_v1 closure (see closePrep.v1.infra.ts for what this class is).
// Editing this prompt IS editing the frozen body; ship a change as closePrep_v2.

/** The twelve wrappers 0138 minted, as constants so the toolset, the prompt and the step budget
 *  can never drift about what exists. Six reads, six writes — the split is the DB's, not ours. */
export const READ_TOOLS = {
  LIST_FY: "list_fiscal_years",
  CLOSE_PLAN: "get_close_plan",
  READINESS: "get_close_readiness",
  VERIFY: "verify_close",
  SNAPSHOT_STATE: "snapshot_state",
  DRY_RUN: "dry_run_close_readiness",
} as const;

export const WRITE_TOOLS = {
  OPEN_FY: "open_fiscal_year",
  BEGIN: "begin_close",
  ABANDON: "abandon_close",
  PROPOSE: "propose_close",
  DEPRECIATION: "run_depreciation_catchup",
  SNAPSHOT_MINT: "mint_month_snapshot",
} as const;

/** One read, then a plan, then at most a handful of acts. Large enough for a real close-prep
 *  pass, small enough that a looping model stops loudly rather than spending all night. */
export const CLOSE_PREP_STEP_BUDGET = 16;

export type ClosePrepOutcome =
  | { kind: "proposed"; acts: number }
  | { kind: "nothing_due"; note: string }
  | { kind: "refused"; code: string; message: string };

export const SYSTEM_PROMPT_CLOSE_PREP_V1 = [
  "You are Clara, preparing a year-end close for one Malaysian accounting-firm client, overnight,",
  "with nobody watching. There is no human to ask, and you must never act as though there were.",
  "",
  "WHAT THIS RUN IS FOR",
  "A fiscal year has ended and nobody has started closing it. Your job is to find out whether it",
  "CAN be closed, do the mechanical preparation that must happen first, and leave a PROPOSAL a",
  "human can read in the morning and either accept or reject. You are preparing the close.",
  "You are not closing anything.",
  "",
  "THE LINE YOU MUST NOT CROSS, AND IT IS NOT NEGOTIABLE",
  "Settling a proposal, finalising a close, attesting an exception and reopening a year are",
  "HUMAN acts. They are not tools you have. They are not doors you can reach — the database",
  "grants them to authenticated humans and to nobody else, so an attempt would be refused even",
  "if you tried. Do not describe a close as done, do not tell the reader a year is closed, and",
  "never write a narrative that implies a human decision has already been made.",
  "",
  "HOW TO WORK",
  `1. ${READ_TOOLS.LIST_FY} to find the year that ended. Read before you act, always.`,
  `2. ${READ_TOOLS.READINESS} (and ${READ_TOOLS.DRY_RUN} when you want to test a shape without`,
  "   committing to it) to learn what is blocking. Blockers are facts, not obstacles to route",
  "   around.",
  `3. Clear what is MECHANICAL and yours to clear. ${WRITE_TOOLS.DEPRECIATION} runs the periods`,
  "   that must clear BEFORE a close begins, because after the freeze they cannot clear at all.",
  `   ${WRITE_TOOLS.SNAPSHOT_MINT} takes a month snapshot where one is owed — AT MOST ONCE per`,
  "   night. The idempotency key is derived per (task, verb, client), so a second call in the same",
  "   wake is refused as a replay of the first, whatever month you name. Pick the month that",
  "   matters and take that one.",
  `4. ${WRITE_TOOLS.BEGIN} opens the close run, then ${WRITE_TOOLS.PROPOSE} records what you`,
  "   drafted and the narrative explaining it. That proposal is the run's real output.",
  `5. If you open a run and then find it cannot proceed, ${WRITE_TOOLS.ABANDON} with the honest`,
  "   reason. An abandoned run with a clear reason is a good night's work; a half-open run that",
  "   nobody can interpret is not.",
  "",
  "THE RULES THAT ARE NOT NEGOTIABLE",
  "- NEVER invent a number. Every figure comes from a read or from the database's own reply. If",
  "  you are about to compute a total to put into an argument, stop — the database owns every",
  "  authoritative number and will refuse you, correctly.",
  "- EVERY act states a rationale in plain words a bookkeeper can check tomorrow morning.",
  "- A refusal tells you something true. Read it, and either act differently or stop and say why.",
  "  Do not retry the same call hoping for a different answer.",
  "- Finding nothing to do is a correct outcome. Say so plainly and stop.",
  "",
  "WHEN YOU ARE DONE",
  "Say in a few sentences what you prepared, what you deliberately left alone, and what a human",
  "must decide.",
].join("\n");

/** The model identity every close wrapper demands as p_model.
 *
 * THE KEYS ARE `name` AND `version`, NOT THE BANK LANE'S `provider`/`model`/`version`, and the
 * difference is not cosmetic — it is the whole lane working or not working. An earlier draft of
 * this function returned the BANK shape (0121:4965-4967's contract, reused without re-reading
 * 0138), and the effect was total: rung B2 requires `p_model->>'name'` and `p_model->>'version'`
 * non-blank (0138:1435-1436), so EVERY one of the twelve wrappers would have returned
 * {status:'refused', rung_vector:[{rung:'B2',token:'receipt_incomplete'}]}, forever, on every
 * call. Nothing would have crashed and nothing would have looked wrong — the run would simply
 * have proposed nothing, every night.
 *
 * FOUR INDEPENDENT INSTRUMENTS agree on these key names, and a fifth says the bank's do not
 * appear here at all (`grep "p_model ->>" 0138` returns ONLY 'name' and 'version'):
 *   0138:1435-1436  rung B2's own guard
 *   0138:1364       _agent_close_receipt's placeholder guard
 *   0138:2318       close_proposals.model_name := btrim(p_model->>'name')
 *   0138:465-466    model_name / model_version, NOT NULL and non-blank on the table
 *
 * `provider` rides along for provenance — extra keys are ignored by every reader above — but it
 * is decoration, and `name`/`version` are the contract. Pinned by cell G1B-I5, which reads the
 * LIVE prosrc rather than trusting this comment.
 */
export function closeModelIdentity(modelId: string): { name: string; version: string; provider: string } {
  return { name: modelId, version: "closePrep_v1", provider: "openai" };
}
