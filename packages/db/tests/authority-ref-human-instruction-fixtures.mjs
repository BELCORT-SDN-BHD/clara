// #977 [0250] — WHAT COUNTS AS A PERSON'S INSTRUCTION FOR AN `authority_ref`, in the two doors
// that resolve one. NOT a test file: the name does not end in `.test.mjs`, so `node --test`
// ignores it.
//
// NO THIRD WORLD. The two doors under test already have a world each — the fixed-asset lane's
// (`depreciation-history-fixtures.mjs` → `x41-fa-world.mjs`) and the plan lane's
// (`accounting-plans-fixtures.mjs` → `work-journal-fixtures.mjs`) — and both sit on the SAME
// pool (`rig-helpers.mjs`). This module adds only what the CROSS-LANE claim needs: the frontier
// gate, the two reason tokens, a strict (errcode, detail.reason) refusal assertion, and the
// catalog constants the structural cell reads. Everything else is imported from the lane that
// owns it.

import assert from "node:assert/strict";
import { rootQuery } from "./rig-helpers.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

// ===========================================================================================
// 1 · The frontier gate — on 0250's STABLE STEM, never its number (a number is claimed at
//     MERGE, a stem is not).
// ===========================================================================================

/** `0250_authority_ref_human_instruction.sql` → `authority_ref_human_instruction$`. */
export const AUTHORITY_REF_HUMAN_INSTRUCTION_STEM = "authority_ref_human_instruction$";

let _ready = null;
export async function authorityRefHumanInstructionReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [AUTHORITY_REF_HUMAN_INSTRUCTION_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

const MISSING =
  `#977 migration (${AUTHORITY_REF_HUMAN_INSTRUCTION_STEM}) is NOT applied to this database`;

/** The per-CELL frontier gate, COUNTED. A FOCUSED invocation (no `--import` of
 *  authority-ref-human-instruction-preintegration-gate.mjs) FAILS LOUDLY below 0250 — a skip is
 *  not evidence, and final acceptance is exactly that focused shape counting ZERO skips. */
export async function gate977(t) {
  if (await authorityRefHumanInstructionReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_AUTHORITY_REF_HUMAN_INSTRUCTION !== "1") {
    assert.fail(
      `${MISSING}, and this is a FOCUSED run. A skip is not evidence: apply the migration, or `
      + "preload tests/authority-ref-human-instruction-preintegration-gate.mjs for a "
      + "package-wide sweep.");
  }
  markSkip();
  t.skip(`#977 authority-ref-human-instruction absent (no ${AUTHORITY_REF_HUMAN_INSTRUCTION_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The two reason tokens the doors must be able to tell apart.
// ===========================================================================================

/** 0193/0227's EXISTING token: the reference names no row of this firm AND client at all. */
export const UNRESOLVED = "authority_ref_unresolved";

/** #977's NEW token: the reference names a real row of this client's own chat lane, and that row
 *  is NOT a person's instruction — an agent run, or a turn nobody signed. A caller and a test can
 *  tell "there is no such row" from "that row is not a person's instruction". */
export const NOT_HUMAN = "authority_ref_not_human_instruction";

// ===========================================================================================
// 3 · A strict refusal assertion — BOTH axes, never one.
// ===========================================================================================

/** `fn()` MUST refuse with exactly `code` AND exactly `detail.reason = reason`. Stricter than
 *  `x41-fa-fixtures.mjs`'s `refuses`, which falls back to matching the token anywhere in the
 *  message text: #977's whole claim is that two refusals are TOLD APART by their token, so a
 *  cell that would accept the token in prose could not see the defect it exists to catch.
 *  Returns the parsed detail so a cell can go on to assert `kind` and `id`. */
export async function refusedWith(fn, { code, reason }, label) {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, `${label}: expected the refusal ${code}/${reason} but the call SUCCEEDED`);
  assert.equal(err.code, code,
    `${label}: error class (got ${err.code} — ${err.message})`);
  let detail = null;
  try {
    detail = JSON.parse(String(err.detail ?? "null"));
  } catch {
    assert.fail(`${label}: the refusal carries no JSON detail (detail=${String(err.detail)} — ${err.message})`);
  }
  assert.equal(detail?.reason, reason,
    `${label}: detail.reason (got ${String(err.detail)} — ${err.message})`);
  return detail;
}

// ===========================================================================================
// 4 · The catalog constants the structural cell reads.
// ===========================================================================================

/** The fully-qualified call #977 wires into BOTH doors, in place of each one's own copy. */
export const REFUSAL_CALL = "clara._authority_ref_refusal(";

/** The inline chat-lane EXISTENCE test each door carried before #977, normalized the way the
 *  migration's own tail normalizes `prosrc` (comments stripped, lowercased, whitespace runs
 *  collapsed). After 0250 it must survive in NO `clara` function: the whole point is that the
 *  two doors stopped maintaining their own copies. */
export const INLINE_CHAT_LANE_EXISTENCE = "from clara.agent_tasks t where t.id = v_ref_id";

/** The one function that owns the answer after #977. */
export const REFUSAL_FN_SIG = "clara._authority_ref_refusal(text,uuid,uuid,uuid)";

/** #1051 (0330) — THE SHARED PLAN AUTHORITY WALL, and why this module has to know about it. #977
 *  wired BOTH doors directly at `REFUSAL_CALL`. 0330 folds the plan lane's whole authority wall
 *  (the two authority-kind refusals, the three `authority_ref` shape refusals and this very
 *  resolution) out of `clara.create_accounting_plan` and `clara._obo_plan_core` into ONE
 *  predicate, so on a post-0330 chain the two plan bodies reach #977's definition THROUGH it
 *  rather than by naming it. The claim #977 makes — one definition, no door keeping its own copy
 *  — is unchanged; the SHAPE of the census that proves it is not, so the census cell measures
 *  which chain it is on rather than assuming one. */
export const PLAN_WALL_FN_SIG = "clara._assert_plan_authority(text,jsonb,uuid,uuid)";
export const PLAN_WALL_CALL = "clara._assert_plan_authority(";

/** #1080 (0331) — THE LAST CARRIER OF THE INLINE PROBE. 0250 could not reach
 *  `clara._accrual_plan_core` (its own header says so at line 63) and pinned the surviving inline
 *  chat-lane existence test to exactly that one function in its tail (0250:604). 0331 points that
 *  body at #1051's shared predicate, and with it the probe leaves the catalog entirely, which is
 *  the state 0250's own prose always wanted and could not have. So the census cell's expected
 *  roster is `["_accrual_plan_core"]` below 0331 and `[]` from 0331 on.
 *
 *  MEASURED OFF THE APPLIED CHAIN, never off the body under test. `PLAN_WALL_FN_SIG` can be
 *  feature-detected with `to_regprocedure` because 0330 MINTS a name; 0331 mints none — it recuts
 *  one body — so the only honest instrument is the chain itself, on 0331's STABLE STEM. Asking
 *  the body whether it still carries the probe would be asking the subject under test what it
 *  should be. */
export const ACCRUAL_PLAN_AUTHORITY_WALL_STEM = "accrual_plan_authority_wall$";

let _accrualWall = null;
export async function accrualPlanAuthorityWallReady() {
  if (_accrualWall === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [ACCRUAL_PLAN_AUTHORITY_WALL_STEM]);
      _accrualWall = r.rows[0].n > 0;
    } catch {
      _accrualWall = false;
    }
  }
  return _accrualWall;
}

/** Normalize a `prosrc` the way 0250's tail assertions do. */
export const normalizeSrc = (src) =>
  String(src).replace(/--[^\n]*/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** The live, normalized body of a `clara` routine, off the catalog. */
export async function normalizedBody(sig) {
  const r = await rootQuery("select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure", [sig]);
  assert.equal(r.rows.length, 1, `${sig} exists`);
  return normalizeSrc(r.rows[0].src);
}

export { assert };
