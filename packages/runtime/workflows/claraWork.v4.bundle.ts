// @frozen
//
// FROZEN — part of the claraWork_v4 closure. THE IMMUTABLE SUCCESSOR BUNDLE for v4: the same
// serializable invocation envelope shape v1, v2 and v3 carry, with v4's instruction/skill/tool ids
// and the SAME finite budgets, hashed the same way.
//
// THE HASH IMPLEMENTATION IS v1's, REACHED BY IMPORT, for the reason v2's and v3's headers give: it
// is already frozen and already proven byte-equal to `node:crypto` by tests/work-bundle.test.mjs,
// and a second open-coded SHA-256 would be a second thing that can be wrong about the same digest.
//
// THE BUDGETS ARE RE-DECLARED RATHER THAN IMPORTED, again for v2's and v3's stated reason: the
// budget block is part of the HASHED bundle, and importing a predecessor's frozen object would make
// v4's digest silently follow any future v1/v2/v3 budget change — exactly the coupling a version
// cutover exists to break.
//
// AND THE NUMBERS THEMSELVES DO NOT MOVE, WHICH IS WORTH DEFENDING RATHER THAN ASSUMING. v4 adds
// two QUESTION tools, and a question does not spend a segment differently from `ask_question`: the
// segment stops on the call, the workflow parks, and the resumed segment is the one v3 already
// budgets for. The #639 particulars question spends NO segment at all — it is opened and applied by
// the workflow, outside the model loop. So `segments: 4` still bounds the same thing it bounded in
// v3, and raising it here would loosen a wall for a change that does not press on it.
//
// WHY `tools.id` MOVES TO clara-work-tools/v4 AND THE ROSTER MOVES WITH IT. Unlike #631, this cut
// DOES widen the roster — from three names to five. Both additions are execute-less question tools
// that can write nothing, so the widening grants no new authority; but the bundle is the registry
// of CAPABILITY, and a run that could ask two more kinds of question was served a different
// contract than one that could not. The receipt has to say which.

import { canonicalJson } from "./chatTurn.v11.tools.js";
import { sha256Hex, type ClaraWorkBudgets, type ClaraWorkBundle } from "./claraWork.v1.bundle.js";
import {
  CLARA_WORK_INSTRUCTIONS_V4,
  CLARA_WORK_TOOL_NAMES_V4,
  JOURNAL_ENTRY_SKILL_V4,
} from "./claraWork.v4.prompt.js";

export type { ClaraWorkBudgets, ClaraWorkBundle };

export const CLARA_WORK_BUDGETS_V4: ClaraWorkBudgets = Object.freeze({
  segments: 4,
  modelCalls: 8,
  toolCalls: 12,
  replans: 2,
  transientRetries: 3,
});

/** The bundle itself — deep-frozen so a runtime mutation throws (ES modules are strict) rather
 *  than silently producing a run whose recorded envelope differs from the hashed one. */
export const CLARA_WORK_BUNDLE_V4: ClaraWorkBundle = Object.freeze({
  id: "clara-work/v4",
  instructions: Object.freeze({ id: "clara-work-instructions/v4", text: CLARA_WORK_INSTRUCTIONS_V4 }),
  skills: Object.freeze([Object.freeze({ id: "journal-entry/v4", text: JOURNAL_ENTRY_SKILL_V4 })]),
  tools: Object.freeze({ id: "clara-work-tools/v4", names: CLARA_WORK_TOOL_NAMES_V4 }),
  budgets: CLARA_WORK_BUDGETS_V4,
});

/** The exact text the digest is taken over. Exported so the pin cell hashes THIS string with
 *  Node's own sha256 rather than re-deriving a canonicalisation of its own. */
export const CLARA_WORK_BUNDLE_V4_CANONICAL: string = canonicalJson(CLARA_WORK_BUNDLE_V4);

/** sha256 hex of the bundle's canonical JSON, computed ONCE at module load. */
export const CLARA_WORK_BUNDLE_V4_DIGEST: string = sha256Hex(CLARA_WORK_BUNDLE_V4_CANONICAL);

/** The one line C88.8 asks the process to emit at world start, and the one string
 *  /api/build-info serves. Spelled in ONE place so the log and the route can never disagree. */
export const CLARA_WORK_BUNDLE_V4_BANNER = `[clara-runtime] bundle ${CLARA_WORK_BUNDLE_V4.id} digest=${CLARA_WORK_BUNDLE_V4_DIGEST}`;

/** The bundle identity every workflow-facing surface serves: the ids, the digest and the budgets,
 *  WITHOUT the prose (an instructions blob has no place in a build-info payload or a task row). */
export function claraWorkBundleIdentityV4(): {
  id: string;
  digest: string;
  instructions: string;
  skills: string[];
  tools: string;
  budgets: ClaraWorkBudgets;
} {
  return {
    id: CLARA_WORK_BUNDLE_V4.id,
    digest: CLARA_WORK_BUNDLE_V4_DIGEST,
    instructions: CLARA_WORK_BUNDLE_V4.instructions.id,
    skills: CLARA_WORK_BUNDLE_V4.skills.map((s) => s.id),
    tools: CLARA_WORK_BUNDLE_V4.tools.id,
    budgets: CLARA_WORK_BUDGETS_V4,
  };
}

/** The manifest `clara.claim_work_run` stores on the Work row: the identity above plus the MODEL
 *  this particular run was claimed with (a per-run fact, so it can never live inside the hashed
 *  bundle). */
export function claraWorkRunManifestV4(modelSnapshot: string): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV4();
  return {
    id: identity.id,
    digest: identity.digest,
    instructions: identity.instructions,
    skills: identity.skills,
    tools: identity.tools,
    budgets: identity.budgets,
    model: modelSnapshot,
  };
}
