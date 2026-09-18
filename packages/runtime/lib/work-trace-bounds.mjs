// #847 — THE WRITER-SIDE MIRROR OF 0210's TWO DOOR-SIDE SHAPE BOUNDS.
//
// WHY THIS FILE EXISTS RATHER THAN AN EDIT TO `lib/work-trace.mjs`. 0210's own header says it,
// and it is quoted here so a later reader does not have to go looking:
//
//   "AT THE WRITER, ONE HALF REMAINS OPEN, DELIBERATELY. `packages/runtime/lib/work-trace.mjs` is
//    inside `claraWork_v3`'s FROZEN closure and hash-locked in `frozen-workflows.json`; a comment
//    edit breaks that lock exactly as a code edit does. `traceRevisionOf` still returns ANY finite
//    JS number, and `traceRunOf` is still never applied to the value `recordTrace` sends. The
//    owner's standing ruling (docs/ARCHITECTURE.md §5.E, #815) is that hardening that module ships
//    with the NEXT frozen version."
//
// That bound was recorded as a `claraWork_v4` requirement in `packages/runtime/README.md`; v4
// shipped without it (ARCHITECTURE:373-386 is the blueprint sentence it left unmet), and #658 is
// the ticket whose successor cut carries it. `lib/work-trace.mjs` IS NOT OPENED by this delivery.
// This is a SIBLING module the v5 body imports, exactly as `lib/knowledge-conflicts.mjs` was a
// sibling of `lib/knowledge.mjs`.
//
// =============================================================================================
// THE ONE RULE: THE WRITER'S CLAUSE STAYS NO TIGHTER THAN THE DOOR'S.
//
// A writer that is STRICTER than the door drops rows the database would have accepted, and every
// caller in the frozen closure wraps `recordTrace` in a swallow (`traceSafely`) precisely so a
// diagnostic can never refuse a posting — so the loss would be silent. These two predicates
// therefore mirror 0210's two clauses EXACTLY, and `tests/work-trace-bounds.test.mjs` asserts the
// admitted side by value against the shapes 0210's own tail exercised.
//
// WHAT THIS MODULE DOES NOT DO. It does not re-implement the rest of 0210's grammars (`id`,
// `model`, `token`, `rev`, `free`, or the secret-shape probe). Those bounds are unchanged, and the
// door remains the wall for all of them. Two clauses were named as the writer's owed half; two
// clauses are what this file carries.
//
// NO MODULE-LEVEL `node:` IMPORT LIVES HERE, for `lib/knowledge.mjs:44-64`'s measured reason: the
// moment claraWork_v5 imports this module it joins a FROZEN workflow closure, the Workflow DevKit
// compiles that closure into a VM script where `require` is undefined, and the failure is a
// RUN-TIME one no build gate sees.
//
// IMPORT-ESCAPE WARNING. The moment `claraWork_v5` imports this file, `check-frozen-workflows.mjs`
// hash-locks it forever and a behaviour change here becomes a `claraWork_v6`. Durable rules belong
// in a migration; what belongs here is the mirror of a rule migration 0210 already owns.
// =============================================================================================

/** 0210:51's numeric ceiling, spelled once. `abs(v) < 1e12 and scale(v) <= 6`. */
export const TRACE_NUMBER_MAX_ABS = 1e12;
export const TRACE_NUMBER_MAX_SCALE = 6;

/** 0210:68's run-id clause, first arm: EXACTLY what @workflow/core 4.8.4 mints — `wrun_` plus 26
 *  Crockford base32 characters (I, L, O and U are not in that alphabet). A WDK id always takes
 *  this arm, so the digit clause provably cannot fire on one. */
const WDK_RUN_RE = /^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

/** 0210:68's run-id clause, second arm: thirteen consecutive digits is the first threshold the
 *  two other observed run shapes cannot reach — a v4 UUID group is at most 12 characters
 *  (`run_<uuid>`, 0195:1163) and the db battery's fixture tail is 8 hex characters. */
const LONG_DIGIT_RUN_RE = /[0-9]{13,}/;

/** The number of fractional digits a JS number renders with — Postgres `scale(numeric)` read onto
 *  this side. Exponential notation is normalised first, because `1.5e-20` renders as `1.5e-20`
 *  and a naive `split('.')` would call its scale 1 when the database calls it 21. */
function decimalScale(v) {
  if (!Number.isFinite(v)) return Number.POSITIVE_INFINITY;
  if (Number.isInteger(v)) return 0;
  const s = String(v);
  const exp = s.match(/^-?(\d+)(?:\.(\d+))?e([+-]\d+)$/i);
  if (exp) {
    const fractional = (exp[2] ?? "").length;
    const shift = Number(exp[3]);
    return Math.max(0, fractional - shift);
  }
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * ONE observed-revision NUMBER, bounded exactly as `clara._work_trace_revisions_ok` bounds it.
 * Returns the number when the door would admit it, `null` otherwise — the same "drop rather than
 * send" contract `observedRevisions` already has for out-of-vocabulary keys.
 *
 * A non-number answers null rather than being coerced: a string revision is the `rev` grammar's
 * business, not this clause's, and `traceRevisionOf` already routes it there.
 */
export function boundedRevisionNumber(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (Math.abs(v) >= TRACE_NUMBER_MAX_ABS) return null;
  if (decimalScale(v) > TRACE_NUMBER_MAX_SCALE) return null;
  return v;
}

/**
 * ONE run id, bounded exactly as the `run` kind's long-digit clause bounds it. Returns the id when
 * the door would admit it, `null` otherwise.
 *
 * NOTE WHAT IS DELIBERATELY ABSENT: the rest of the `run` grammar (the character class, the
 * must-contain-a-letter rule and the secret-shape probe). Adding them here would make the writer
 * TIGHTER than its own owed half without anybody deciding to, and the door still enforces all of
 * them. This clause is the one 0210 named as owed.
 */
export function boundedRunId(v) {
  if (typeof v !== "string" || v === "") return null;
  if (WDK_RUN_RE.test(v)) return v;
  return LONG_DIGIT_RUN_RE.test(v) ? null : v;
}
