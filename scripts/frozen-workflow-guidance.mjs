// One canonical registration instruction, consumed by both freeze-lint and the documentation
// consistency gate. Wording changes therefore move the checker and its consistency cell together.

export const FROZEN_WORKFLOW_FAILURE_GUIDANCE = "Ship a behavioural change as a NEW _vN workflow; re-baseline with --update (local) when ADDING any new frozen file (a new class or a new _vN), then prove the manifest diff is additions-only — you can never mutate or remove an existing frozen entry.";
