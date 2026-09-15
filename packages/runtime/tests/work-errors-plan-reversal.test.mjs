// #787 — THE TYPING OF THE POST-TIME REVERSAL-LIVENESS REFUSAL, DRIVEN THROUGH THE DEPLOYED
// ROUTER RATHER THAN DESCRIBED.
//
// Migration 0204's fifth recut of `clara._record_journal_entry_core` refuses a plan-driven
// reversal whose accrual entry stopped being live between admission and posting. The refusal has
// to be TERMINAL for the run under the router AS ALREADY DEPLOYED — no frozen closure may be
// edited to make it so (#787's own "out of scope"), so the CODE is not free:
//
//   · an unrecognised CLR13 reason falls to v1's inherited default `state_changed`, which hands
//     the model another turn and spends the run's replan budget against a wall it can never pass,
//     ending `budget_exhausted → failed` rather than a refusal;
//   · an unrecognised CLR10 reason falls to v1's default `refusal` — terminal for the loop,
//     settling the Work `refused` with the database's own typed reason, recoverable by a human.
//
// So the arm ships as CLR10 `reversal_before_primary`. This file is the evidence for that
// sentence: it drives the three deployed routers (v1, and v2/v3 through their delegation) with
// the exact error object the database raises, and asserts BOTH directions of the choice.
//
// NOTHING FROZEN IS TOUCHED. The classifiers are imported and executed; the pair is absent from
// every override table, which is precisely what makes the default the answer.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const v1 = await import("../workflows/claraWork.v1.errors.ts");
const v2 = await import("../workflows/claraWork.v2.errors.ts");
const v3 = await import("../workflows/claraWork.v3.errors.ts");

/** The error object node-postgres hands the run for a raise carrying a typed `detail` jsonb. */
const raise = (code, detail) =>
  Object.assign(new Error("the entry this plan reversal names is no longer live"), {
    code, detail: JSON.stringify(detail),
  });

/** 0204's refusal, verbatim: the code, the admission side's reason, and the two detail keys the
 *  arm carries beside it. */
const REVERSAL_DETAIL = {
  reason: "reversal_before_primary",
  primary_state: "entry_not_live",
  entry_id: "11111111-2222-4333-8444-555555555555",
};

test("#787.router — (CLR10, reversal_before_primary) classifies REFUSAL, terminal, recoverable, in all three deployed routers", () => {
  for (const [name, mod] of [["v1", v1], ["v2", v2], ["v3", v3]]) {
    const c = mod.classifyWorkError(raise("CLR10", REVERSAL_DETAIL));
    assert.equal(c.kind, "refusal", `${name}: the wall must land TERMINAL, not back in the model's lap`);
    assert.equal(c.terminal, true, `${name}: the loop gets no further turn at this tool`);
    assert.equal(c.recoverable, true,
      `${name}: a human's Retry after re-admitting a reversal behind a live accrual can legitimately succeed`);
    assert.equal(c.code, "CLR10", `${name}: the database's own code, never reworded`);
    assert.equal(c.reason, "reversal_before_primary", `${name}: and the admission side's own reason token`);
  }
});

test("#787.router — the Work settles `refused` with error_code `tool_error`, never `internal` or `limit`", () => {
  const c = v3.classifyWorkError(raise("CLR10", REVERSAL_DETAIL));
  assert.equal(v3.workOutcomeFor(c.kind), "refused");
  assert.equal(v3.taskErrorCodeFor(c.kind), "tool_error");
  const payload = v3.workErrorPayload(c);
  assert.equal(payload.reason, "reversal_before_primary",
    "the Work's error jsonb carries the database's own typed reason, which is what a human reads");
});

test("#787.router — the NEGATIVE control: the same reason under CLR13 would be `state_changed`, which is why the arm is not a CLR13", () => {
  for (const [name, mod] of [["v1", v1], ["v2", v2], ["v3", v3]]) {
    const c = mod.classifyWorkError(raise("CLR13", REVERSAL_DETAIL));
    assert.equal(c.kind, "state_changed",
      `${name}: an unrecognised CLR13 falls to the inherited default and the run re-plans against a wall it can never pass`);
    assert.equal(c.terminal, false, `${name}: …which is exactly the non-terminal outcome #787 forbids`);
  }
});
