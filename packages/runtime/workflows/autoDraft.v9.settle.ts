// @frozen
//
// FROZEN — part of the autoDraft_v9 closure (F-A2: the agentic posting lane; see
// autoDraft.v9.tools.ts for the one statement of what v9 is). A NEW frozen closure beside the
// byte-untouched autoDraft_v1..v8 (ARCHITECTURE Appendix A).
//
// THIS FILE (settle) — `classifySettleReceipt`, moved out of `autoDraft.v9.impl.ts` at v9
// (that file is at the repo's 500-line ceiling) and WIDENED for the `posted` outcome. The
// classifier's whole shape-by-shape derivation is byte-carried from v8; the delta is stated in
// SHAPE 6 below and nowhere else.

/** The outcomes `clara.settle_autodraft_task` accepts after F-A2's posted-chain migration. The
 *  DB's own guard is `p_outcome not in ('drafted','skipped_lane','noop_existing','failed',
 *  'posted')` — this union is the runtime mirror of that closed set, and the two are compared by
 *  a cell rather than by trust. */
export type SettleOutcome = "drafted" | "skipped_lane" | "noop_existing" | "failed" | "posted";

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function isNonNegativeNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

/** True iff `r`'s OWN enumerable keys are EXACTLY `keys` (same set, same size) — not a
 *  subset check. Codex round 3 named this the missing piece: shape checks that only tested
 *  for PRESENCE of the fields they expected let an object carrying EXTRA, unaccounted-for
 *  fields (or a field with the wrong runtime type smuggled in alongside correct ones) slip
 *  through as if it were a real DB shape. */
function hasExactlyKeys(r: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(r);
  if (actual.length !== keys.length) return false;
  return keys.every((k) => Object.prototype.hasOwnProperty.call(r, k));
}

/** PR #204 fix (Codex round 2, B1 — an IMPLEMENTATION blocker, not a test-guard gap): the
 *  original receipt read failed OPEN. `r.rows[0]?.receipt ?? {}` + `receipt.settled ===
 *  false` means a missing row, NULL, `{}`, or ANY malformed/unrecognized shape all fall
 *  through past that one check silently — the workflow would report "drafted" while the
 *  task stays running and its reservation stays charged forever. Codex verified by
 *  EXECUTION against d404ff9 that the fix cannot be "require settled===true" either: the
 *  DB's own SUCCESS shape carries no `settled` key at all (see shape 6 below).
 *
 *  Codex round 3 (B1, deepened): the round-2 version checked FIELD PRESENCE and coarse type,
 *  which let SHAPE-LIKE malformed objects pass. This version re-derives every shape's EXACT
 *  field set and value-level constraints straight from the SQL a second time — every field the
 *  function genuinely returns, not a convenient subset — and rejects anything with an
 *  unaccounted-for extra field via hasExactlyKeys.
 *
 *  Shape 1 — REPLAY (0036:871-873, reached only via `t.status in ('completed','failed')`):
 *    `{task_id, status, replayed:true}`, EXACTLY these 3 keys.
 *  Shapes 2-5 — the FOUR named benign no-ops, ALL carrying `settled:false, outcome:
 *    'not_settled', reason:<name>` plus `task_id` and `status`, and NOTHING else except each
 *    reason's own extra field (task_superseded's `released_reservation`, registry_released's
 *    `registry_state`; registry_superseded and run_superseded carry none).
 *  Shape 6 — SUCCESS (0036:994-996): `{task_id, status, outcome, entry_id, tokens_spent,
 *    tokens_refunded}`, EXACTLY 6 keys, NO `settled` key at all. The status<->outcome pairing is
 *    NOT two independent checks — the SQL computes status FROM outcome (`case when
 *    p_outcome='failed' then 'failed' else 'completed' end`).
 *
 *  F-A2 — THE ONLY DELTA, AND IT IS IN SHAPE 6. `posted` joins the outcomes 'completed' can
 *  pair with, and it joins `drafted` in the ENTRY-ID rule: a posted settle MUST carry a
 *  non-empty `entry_id` and every other non-drafted outcome must still carry null. That mirrors
 *  the DB exactly — `ck_sweep_run_items_shape` was re-cut to `outcome in ('drafted','posted')
 *  and entry_id is not null`, and PR-1 proved the must-fail half on the rig rather than
 *  asserting it. Writing the runtime rule as "drafted or posted" rather than "not skipped"
 *  keeps the two definitions the same shape, so a future third entry-bearing outcome has to be
 *  added deliberately in both places instead of arriving by default. */
export function classifySettleReceipt(receipt: unknown): "settled" | "benign-no-op" {
  if (receipt == null || typeof receipt !== "object") {
    throw new Error(`settle_autodraft_task returned an unrecognized receipt (missing row or non-object): ${JSON.stringify(receipt)}`);
  }
  const r = receipt as Record<string, unknown>;

  // Shape 1 — REPLAY (0036:871-873).
  if (
    r.replayed === true &&
    isNonEmptyString(r.task_id) &&
    (r.status === "completed" || r.status === "failed") &&
    hasExactlyKeys(r, ["task_id", "status", "replayed"])
  ) {
    return "settled";
  }

  // Shapes 2-5 — the four named benign no-ops (0036:899-946; 0046 §8's run_superseded).
  const noopStatusesForReason = (reason: unknown): readonly string[] | undefined => {
    if (reason === "task_superseded") return ["cancelled", "expired"];
    if (reason === "registry_superseded" || reason === "registry_released" || reason === "run_superseded") return ["running", "cancel_requested"];
    return undefined;
  };
  const noopStatuses = noopStatusesForReason(r.reason);
  if (
    r.settled === false &&
    r.outcome === "not_settled" &&
    isNonEmptyString(r.task_id) &&
    typeof r.status === "string" &&
    noopStatuses !== undefined &&
    noopStatuses.includes(r.status)
  ) {
    if (r.reason === "task_superseded") {
      if (typeof r.released_reservation === "boolean" && hasExactlyKeys(r, ["task_id", "status", "settled", "outcome", "reason", "released_reservation"])) {
        return "benign-no-op";
      }
    } else if (r.reason === "registry_released") {
      if ((r.registry_state === "parked" || r.registry_state === "idle") && hasExactlyKeys(r, ["task_id", "status", "settled", "outcome", "reason", "registry_state"])) {
        return "benign-no-op";
      }
    } else {
      // registry_superseded | run_superseded — structurally identical, 5 keys, no extra field.
      if (hasExactlyKeys(r, ["task_id", "status", "settled", "outcome", "reason"])) {
        return "benign-no-op";
      }
    }
  }

  // Shape 6 — SUCCESS (0036:994-996). No `settled` key — deliberately not checked here.
  const successOutcomesForStatus = (status: unknown): readonly string[] | undefined => {
    if (status === "completed") return ["drafted", "skipped_lane", "noop_existing", "posted"];
    if (status === "failed") return ["failed"];
    return undefined;
  };
  /** The outcomes that MUST carry an entry id, and the mirror of the DB's own re-cut shape
   *  CHECK. Every other outcome must carry null. */
  const carriesEntryId = (outcome: unknown): boolean => outcome === "drafted" || outcome === "posted";
  const successOutcomes = successOutcomesForStatus(r.status);
  if (
    isNonEmptyString(r.task_id) &&
    successOutcomes !== undefined &&
    typeof r.outcome === "string" &&
    successOutcomes.includes(r.outcome) &&
    ((carriesEntryId(r.outcome) && isNonEmptyString(r.entry_id)) || (!carriesEntryId(r.outcome) && r.entry_id === null)) &&
    isNonNegativeNumber(r.tokens_spent) &&
    isNonNegativeNumber(r.tokens_refunded) &&
    hasExactlyKeys(r, ["task_id", "status", "outcome", "entry_id", "tokens_spent", "tokens_refunded"])
  ) {
    return "settled";
  }

  throw new Error(`settle_autodraft_task returned an unrecognized receipt shape: ${JSON.stringify(receipt)}`);
}
