// @frozen
//
// FROZEN — part of the claraWork_v6 closure. THE IMMUTABLE SUCCESSOR BUNDLE for v6.
//
// v5's shape, v5's discipline, v5's coverage — and that is the whole of it. `tools` still carries
// `{id, names, schemas, dependencies}`, the schemas are still derived from the very zod objects
// the builder hands to `tool({inputSchema})`, and `z.toJSONSchema`'s `target: "draft-07"` and
// `io: "input"` are still PINNED rather than defaulted, for the reason v5's header gives at
// length: the defaults are draft-2020-12 and `"output"`, and either moving under a dependency bump
// would silently move a digest that is supposed to change only when a CONTRACT changes.
//
// WHAT MOVES THE DIGEST AT THIS CUT, and it is exactly one thing: the instructions text. v6 adds
// `SOURCE_CORRECTION_SUCCESSOR_STANZA`, so `instructions.text` differs and the canonical JSON
// differs. The roster does not move — same seven names, same schemas, same dependencies — which is
// the honest description of this cut: the model's CAPABILITIES are v5's and its INSTRUCTIONS are
// not.
//
// AND WHAT THIS DIGEST STILL CANNOT SEE, carried forward from v5's own measurement (review
// ADV-S-4): `z.toJSONSchema` erases `.refine` / `.superRefine`, so `ask_question`'s `fields[]`
// superRefine contributes nothing to the hashed text. v6 changes no refinement — stated here by
// hand because no gate will state it (CUT-PLAN §5, R5).
//
// THE BUDGETS ARE RE-DECLARED RATHER THAN IMPORTED, for v5's stated reason: the budget block is
// part of the HASHED bundle, and importing a predecessor's frozen object would make v6's digest
// silently follow any future v1…v5 budget change — exactly the coupling a version cutover exists
// to break. THE NUMBERS DO NOT MOVE. v6's addition is a park BEFORE the loop: the confirmation
// question spends no segment, no model call and no tool call, so nothing presses on a wall and
// raising one would be loosening it for free.

import { canonicalJson } from "./chatTurn.v11.tools.js";
import { sha256Hex, type ClaraWorkBudgets, type ClaraWorkBundle } from "./claraWork.v1.bundle.js";
import type { ClaraWorkToolsBlockV5 } from "./claraWork.v5.bundle.js";
import {
  CLARA_WORK_INSTRUCTIONS_V6,
  CLARA_WORK_TOOL_DEPENDENCIES_V6,
  CLARA_WORK_TOOL_NAMES_V6,
  CLARA_WORK_TOOL_SCHEMAS_V6,
  JOURNAL_ENTRY_SKILL_V6,
} from "./claraWork.v6.prompt.js";
import { z } from "zod";

export type { ClaraWorkBudgets };

/** v5's widened tool block, reached by import: the SHAPE is unchanged, so a second declaration of
 *  the same four members would be a second thing that can be wrong about one type. */
export type ClaraWorkToolsBlockV6 = ClaraWorkToolsBlockV5;

export type ClaraWorkBundleV6 = Omit<ClaraWorkBundle, "tools"> & { tools: ClaraWorkToolsBlockV6 };

export const CLARA_WORK_BUDGETS_V6: ClaraWorkBudgets = Object.freeze({
  segments: 4,
  modelCalls: 8,
  toolCalls: 12,
  replans: 2,
  transientRetries: 3,
});

/** The JSON Schema target and direction, PINNED. See this file's header. */
const JSON_SCHEMA_TARGET = "draft-07" as const;
const JSON_SCHEMA_IO = "input" as const;

/**
 * Convert the roster's zod schemas to JSON Schema, ONCE at module load, in ROSTER ORDER.
 *
 * A conversion failure is not swallowed, for v5's reason: this is not a diagnostic, it is the
 * CONTRACT the receipt attests to, and a bundle that quietly hashed `{}` for a tool it could not
 * describe would be a receipt claiming a coverage it does not have.
 */
function toolSchemasJson(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of CLARA_WORK_TOOL_NAMES_V6) {
    const schema = (CLARA_WORK_TOOL_SCHEMAS_V6 as Record<string, unknown>)[name];
    if (schema === undefined) {
      throw new Error(`claraWork_v6 bundle: no input schema declared for tool "${name}"`);
    }
    out[name] = z.toJSONSchema(schema as Parameters<typeof z.toJSONSchema>[0], {
      target: JSON_SCHEMA_TARGET,
      io: JSON_SCHEMA_IO,
    });
  }
  return out;
}

export const CLARA_WORK_TOOLS_BLOCK_V6: ClaraWorkToolsBlockV6 = Object.freeze({
  id: "clara-work-tools/v6",
  names: CLARA_WORK_TOOL_NAMES_V6,
  schemas: Object.freeze(toolSchemasJson()),
  dependencies: CLARA_WORK_TOOL_DEPENDENCIES_V6,
});

export const CLARA_WORK_BUNDLE_V6: ClaraWorkBundleV6 = Object.freeze({
  id: "clara-work/v6",
  instructions: Object.freeze({ id: "clara-work-instructions/v6", text: CLARA_WORK_INSTRUCTIONS_V6 }),
  skills: Object.freeze([Object.freeze({ id: "journal-entry/v6", text: JOURNAL_ENTRY_SKILL_V6 })]),
  tools: CLARA_WORK_TOOLS_BLOCK_V6,
  budgets: CLARA_WORK_BUDGETS_V6,
});

/** The exact text the digest is taken over. */
export const CLARA_WORK_BUNDLE_V6_CANONICAL: string = canonicalJson(CLARA_WORK_BUNDLE_V6);

/** sha256 hex of the bundle's canonical JSON, computed ONCE at module load. */
export const CLARA_WORK_BUNDLE_V6_DIGEST: string = sha256Hex(CLARA_WORK_BUNDLE_V6_CANONICAL);

/** The one line C88.8 asks the process to emit at world start, and the one string
 *  /api/build-info serves. Spelled in ONE place so the log and the route can never disagree.
 *
 *  IT IS LOAD-BEARING FAR BEYOND A LOG LINE, and the v21/v5 cut paid to learn it:
 *  `tests/pinned-work-bundle.mjs`'s `waitBooted` blocks on exactly this banner, and its throw is
 *  swallowed by the caller's retry loop — so a missing banner boots an engine that looks healthy
 *  on every visible signal (`/health` 200, `/ready` 200, `stranded bodies n=0`) while SEVEN
 *  work-lane e2e legs fail with the false message "serve child did not become ready". The sixth
 *  `console.log` in `plugins/startWorld.ts` lands in the SAME commit as the registry repoint. */
export const CLARA_WORK_BUNDLE_V6_BANNER = `[clara-runtime] bundle ${CLARA_WORK_BUNDLE_V6.id} digest=${CLARA_WORK_BUNDLE_V6_DIGEST}`;

/**
 * The bundle identity every workflow-facing surface serves. `tools` stays the ID alone, exactly as
 * v1…v5 served it: this answers "which contract served this run", and the digest answers it
 * completely; the schemas are IN THE HASH, which is where the coverage requirement asked for them.
 */
export function claraWorkBundleIdentityV6(): {
  id: string;
  digest: string;
  instructions: string;
  skills: string[];
  tools: string;
  budgets: ClaraWorkBudgets;
} {
  return {
    id: CLARA_WORK_BUNDLE_V6.id,
    digest: CLARA_WORK_BUNDLE_V6_DIGEST,
    instructions: CLARA_WORK_BUNDLE_V6.instructions.id,
    skills: CLARA_WORK_BUNDLE_V6.skills.map((s) => s.id),
    tools: CLARA_WORK_BUNDLE_V6.tools.id,
    budgets: CLARA_WORK_BUDGETS_V6,
  };
}

/** The manifest `clara.claim_work_run` stores on the Work row: the identity above plus the MODEL
 *  this particular run was claimed with (a per-run fact, so it can never live inside the hashed
 *  bundle). */
export function claraWorkRunManifestV6(modelSnapshot: string): Record<string, unknown> {
  const identity = claraWorkBundleIdentityV6();
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
