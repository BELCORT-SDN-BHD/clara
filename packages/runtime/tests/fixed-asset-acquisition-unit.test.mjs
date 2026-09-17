// #639 — THE DEPENDENT PARTICULARS MODULE AND THE COMMIT-TIME CLR40 CLASSIFICATION, driven as
// pure functions.
//
// TWO SUBJECTS, ONE FILE, because they are the two halves of what the wave's shared `claraWork_v4`
// will need and neither is worth a file of its own:
//
//   fa.*      `lib/fixed-asset-acquisition.ts` — the CLOSED particulars key set, the declared
//             question fields, the `p_particulars` builder, and the CLR37 axis → CONTROL map.
//             Migration 0216/0041 re-validate every rule and are the authority; this is the
//             earlier, more legible half whose only job is to NAME THE FIELD.
//   clr40.*   THE SPECIFICATION #639 AC7 was missing. A commit-time CLR40 from the fixed-asset
//             belt is a DEFERRED constraint-trigger refusal: it arrives after the operation
//             receipt and the Work result were written and takes the whole transaction with it.
//             Nobody had ever said what the run settles for it. These cells ask the DEPLOYED
//             classifier — `claraWork.v3.errors.ts`, which delegates to v2 and then v1 — instead
//             of asserting from a reading of its table, so the answer is measured.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";

register();
const fa = await import("../lib/fixed-asset-acquisition.ts");
const errors = await import("../workflows/claraWork.v3.errors.ts");

const SL = {
  method: "straight_line",
  useful_life_months: 60,
  residual_cents: 0,
  start_date: "2026-09-15",
  description: "Air compressor, workshop bay 2",
};

// ===========================================================================================
// fa.* — the module claraWork_v4 will import.
// ===========================================================================================

test("fa.keys the admitted key set is exactly the nine clara._fa_validate_particulars accepts", () => {
  assert.deepEqual([...fa.FA_PARTICULARS_KEYS].sort(), [
    "ca_class", "description", "is_commercial_vehicle", "is_new", "method",
    "rate_bps", "residual_cents", "start_date", "useful_life_months",
  ]);
  // The schema is `.strict()`, so a key the database would refuse cannot even travel.
  const extra = fa.faParticularsAnswerSchema.safeParse({ ...SL, depreciation_policy: "aggressive" });
  assert.equal(extra.success, false, "a key outside the closed set is refused before the round trip");
});

test("fa.fields the declared question fields are answerable, and only method + start_date are required", () => {
  const keys = fa.FA_PARTICULARS_FIELDS.map((f) => f.key);
  assert.deepEqual(keys, [
    "method", "useful_life_months", "rate_bps", "residual_cents", "start_date", "description",
  ]);
  for (const f of fa.FA_PARTICULARS_FIELDS) {
    assert.ok(["text", "money", "date", "choice", "account"].includes(f.kind),
      `field ${f.key} declares a kind clara._assert_work_question_fields admits`);
    assert.ok(typeof f.label === "string" && f.label.trim().length > 0, `field ${f.key} has a label`);
    assert.ok(fa.FA_PARTICULARS_KEYS.includes(f.key),
      `field ${f.key} is a key the particulars door will accept`);
    if (f.kind === "choice") {
      assert.ok(Array.isArray(f.options) && f.options.length >= 2 && f.options.length <= 20,
        "a choice field declares between two and twenty options");
      assert.deepEqual(f.options.map((o) => o.value), [...fa.FA_METHODS],
        "…and its options are exactly the three methods 0041's CHECK admits");
    }
  }
  assert.deepEqual(fa.FA_PARTICULARS_FIELDS.filter((f) => f.required).map((f) => f.key),
    ["method", "start_date"],
    "an in-service date is required for EVERY method, and the drivers only for the method that uses them");
  assert.ok(!keys.includes("note"), "`note` is the answer door's own reserved remark key (0180)");
});

test("fa.particulars the builder emits the database's own spelling and OMITS what the answer did not mention", () => {
  const p = fa.particularsFromAnswer(fa.faParticularsAnswerSchema.parse(SL));
  assert.deepEqual(p, {
    method: "straight_line",
    start_date: "2026-09-15",
    useful_life_months: 60,
    residual_cents: 0,
    description: "Air compressor, workshop bay 2",
  }, "a STATED zero residual travels (0 is a fact, not an absence), and the three tax keys the answer never mentioned do not");
  const bare = fa.particularsFromAnswer(fa.faParticularsAnswerSchema.parse({
    method: "straight_line", useful_life_months: 60, start_date: "2026-09-15",
  }));
  assert.ok(!("residual_cents" in bare),
    "an UNMENTIONED residual is omitted — the validator coalesces an absent one to 0 anyway, and "
    + "omitting keeps the op-key payload hash stable for an answer that did not state it");
  const none = fa.particularsFromAnswer(fa.faParticularsAnswerSchema.parse({
    method: "none", start_date: "2026-04-01",
  }));
  assert.deepEqual(none, { method: "none", start_date: "2026-04-01" },
    "a non-depreciated asset carries neither a life nor a rate — exactly what 0041 demands");
  const rb = fa.particularsFromAnswer(fa.faParticularsAnswerSchema.parse({
    method: "reducing_balance", useful_life_months: 120, rate_bps: 2000, residual_cents: 50_000,
    start_date: "2026-01-01",
  }));
  assert.equal(rb.rate_bps, 2000);
  assert.equal(rb.residual_cents, 50_000, "exact minor units, never a float and never a major unit");
});

// THE DOOR'S OWN ANSWER IS THE CONTRACT, and this cell is the one that would have caught the
// mismatch the successor review found as F1. `clara.answer_work_question` stores the answer
// VERBATIM after `clara._assert_work_answer` judged it against THESE fields: a `text` field can
// only ever be a JSON STRING (0180:477-482), a `money` field only ever an integer JSON NUMBER,
// and the reserved `note` key is explicitly allowed beside them. So the object that reaches
// `applyParticularsStepV4` on a real run is the one built below — and nothing else is what a
// human answering from Needs-you can produce.
test("fa.door the answer the DOOR can actually store is the answer this schema accepts", () => {
  // Straight line, exactly as `p639.question.dependent` answers it on a live rig: the driver as a
  // STRING because it is declared `kind:"text"`, the residual as a NUMBER because it is `money`,
  // a blank optional the door treats as absent, and a human's remark under the reserved key.
  const doorSl = {
    method: "straight_line",
    useful_life_months: "60",
    rate_bps: "",
    residual_cents: 0,
    start_date: "2026-09-15",
    description: "Air compressor",
    note: "bought at the September auction",
  };
  const sl = fa.faParticularsAnswerSchema.safeParse(doorSl);
  assert.equal(sl.success, true,
    `the door-shaped answer parses (${sl.success ? "" : JSON.stringify(sl.error?.issues)})`);
  assert.deepEqual(fa.particularsFromAnswer(sl.data), {
    method: "straight_line",
    start_date: "2026-09-15",
    useful_life_months: 60,
    residual_cents: 0,
    description: "Air compressor",
  }, "…and the builder hands the DATABASE its own spelling: numbers, no blank, no note");

  // Reducing balance: BOTH drivers arrive as strings.
  const rb = fa.faParticularsAnswerSchema.safeParse({
    method: "reducing_balance", useful_life_months: "120", rate_bps: "2000",
    residual_cents: 50000, start_date: "2026-01-01",
  });
  assert.equal(rb.success, true, "reducing balance is answerable too");
  assert.equal(fa.particularsFromAnswer(rb.data).rate_bps, 2000);
  assert.equal(fa.particularsFromAnswer(rb.data).useful_life_months, 120);

  // `none` was never the only survivable method, and this pins that it is not.
  assert.equal(fa.faParticularsAnswerSchema.safeParse({ method: "none", start_date: "2026-04-01" }).success, true);

  // A PROGRAMMATIC caller (this file's own SL, the e2e fixtures) still parses: the bridge widens
  // what is accepted, it does not move the contract onto strings.
  assert.equal(fa.faParticularsAnswerSchema.safeParse(SL).success, true,
    "a number is still a number — the door's string is an ADDITIONAL accepted spelling");

  // And a driver that is not a whole number is refused, at the field, rather than coerced. This is
  // why the bridge is a guarded conversion and not `z.coerce.number()`, which would turn every one
  // of these into a plausible wrong number.
  for (const bad of ["sixty", "6.5", "-", "1e3", "60 months"]) {
    const r = fa.faParticularsAnswerSchema.safeParse({
      method: "straight_line", useful_life_months: bad, start_date: "2026-09-15",
    });
    assert.equal(r.success, false, `useful_life_months=${JSON.stringify(bad)} is not a whole number of months`);
  }

  // A BLANK optional is the door's own "absent", not a refusal and not a zero: 0180 skips a
  // whitespace-only optional in its validation loop and then stores the answer verbatim, so the
  // blank genuinely arrives here.
  const blank = fa.faParticularsAnswerSchema.safeParse({
    method: "none", start_date: "2026-04-01", useful_life_months: " ", rate_bps: "", description: "  ",
  });
  assert.equal(blank.success, true, "a blank optional parses");
  assert.deepEqual(fa.particularsFromAnswer(blank.data), { method: "none", start_date: "2026-04-01" },
    "…as ABSENT — a blank life on a `none` asset is not a life, so 0041's drivers rule is not tripped");

  // The local mirror judges the PARSED answer, so the whole lane — door answer, schema, mirror —
  // agrees about one good answer.
  assert.equal(fa.localParticularsRefusal(sl.data, { nonDepreciable: false, costCents: 1_000_000 }), null,
    "the door-shaped answer the schema accepted is one the mirror also accepts");
});

test("fa.axis every CLR37 axis the doors raise maps to a control, or honestly to none", () => {
  assert.equal(fa.refusalFieldForAxis({ axis: "start_date" }), "start_date");
  assert.equal(fa.refusalFieldForAxis({ axis: "drivers" }), "useful_life_months");
  assert.equal(fa.refusalFieldForAxis({ axis: "non_depreciable" }), "method",
    "a depreciable method on a land enrolment is corrected at the METHOD control, not at the life");
  assert.equal(fa.refusalFieldForAxis({ axis: "residual" }), "residual_cents");
  assert.equal(fa.refusalFieldForAxis({ axis: "method" }), "method");
  // These are NOT about a control the reader can correct, and a map that invented one would send
  // focus somewhere useless. A surface renders them at form level.
  for (const axis of ["lifecycle", "shape", "malformed", "unknown_key"]) {
    assert.equal(fa.refusalFieldForAxis({ axis }), null, `${axis} names no single control`);
  }
  assert.equal(fa.refusalFieldForAxis({ axis: "something_new" }), null,
    "an axis this map has not been taught is form level, never a guessed control");
  assert.equal(fa.refusalFieldForAxis(null), null);
  // A `field` the DATABASE supplied wins: a later door may name one directly, and a map that
  // overrode it would be a second opinion about one refusal.
  assert.equal(fa.refusalFieldForAxis({ axis: "drivers", field: "rate_bps" }), "rate_bps");
  assert.equal(fa.refusalFieldForAxis({ axis: "drivers", field: "not_a_key" }), "useful_life_months",
    "…but only when it is a key the door actually accepts");
});

test("fa.local the local refusals mirror clara._fa_validate_particulars and name the control", () => {
  assert.equal(fa.localParticularsRefusal(fa.faParticularsAnswerSchema.parse(SL)), null);

  const noDrivers = fa.localParticularsRefusal({ method: "straight_line", start_date: "2026-09-15" });
  assert.equal(noDrivers.axis, "drivers");
  assert.equal(noDrivers.field, "useful_life_months");
  assert.equal(noDrivers.reason, "fa_particulars_invalid",
    "the local half carries the DATABASE's own reason token — one vocabulary, not two");

  const rateOnSl = fa.localParticularsRefusal({
    method: "straight_line", useful_life_months: 60, rate_bps: 2000, start_date: "2026-09-15",
  });
  assert.equal(rateOnSl.axis, "drivers");

  const noStart = fa.localParticularsRefusal({ method: "none" });
  assert.equal(noStart.axis, "start_date",
    "an in-service date is required even for an asset that is not depreciated");

  const landSl = fa.localParticularsRefusal(fa.faParticularsAnswerSchema.parse(SL), { nonDepreciable: true });
  assert.equal(landSl.axis, "non_depreciable");
  assert.equal(landSl.field, "method");

  const bigResidual = fa.localParticularsRefusal(
    { method: "straight_line", useful_life_months: 60, residual_cents: 900_000, start_date: "2026-09-15" },
    { costCents: 850_000 },
  );
  assert.equal(bigResidual.axis, "residual");
  assert.equal(bigResidual.field, "residual_cents");

  assert.equal(fa.localParticularsRefusal(
    { method: "reducing_balance", useful_life_months: 120, rate_bps: 0, start_date: "2026-01-01" },
  ).axis, "drivers", "a rate outside 1..10000 is a driver refusal, by the database's own bounds");
});

// ===========================================================================================
// clr40.* — AC7's missing expectation, measured against the DEPLOYED classifier.
// ===========================================================================================

/** The shape `pg` hands a plpgsql `raise … using errcode, detail`. */
const pgError = (code, detail) => Object.assign(new Error("belt refusal"), { code, detail });

test("clr40.belt a commit-time fixed-asset belt refusal settles the Work FAILED with a nameable cause", () => {
  const c = errors.classifyWorkError(pgError("CLR40", JSON.stringify({
    reason: "fa_belt_unregistered_movement", entry_id: "e", account_code: "200-D41", role: "cost",
  })));
  assert.equal(c.code, "CLR40");
  assert.equal(c.reason, "fa_belt_unregistered_movement",
    "the typed reason survives classification — a human is told WHICH rule refused");
  assert.equal(c.kind, "invariant",
    "CLR40 is in neither claraWork.v1.errors.ts's (code, reason) table nor its CLR default list "
    + "(CLR03/04/10/11/12/19), so it falls through to the visible-fault arm");
  assert.equal(errors.workOutcomeFor(c.kind), "failed",
    "#639 AC7's SPECIFIED settlement: a commit-time CLR40 settles the Work FAILED, not refused");
  assert.equal(errors.taskErrorCodeFor(c.kind), "internal");
  assert.equal(c.recoverable, false,
    "…and it is NOT offered as a retry: after 0216 the acquisition arm can no longer raise it at "
    + "all, so a surviving CLR40 is a genuine estate disagreement, never a human's mistake");
});

test("clr40.cost_adjustment the named deferral classifies identically today — recorded as a follow-up, not silently accepted", () => {
  const c = errors.classifyWorkError(pgError("CLR40", JSON.stringify({
    reason: "fa_cost_adjustment_deferred", entry_id: "e", account_code: "200-D41", role: "cost",
  })));
  assert.equal(c.kind, "invariant");
  assert.equal(errors.workOutcomeFor(c.kind), "failed");
  assert.equal(c.reason, "fa_cost_adjustment_deferred");
  // THIS ONE HAS A HUMAN REMEDY the belt itself names (reverse the acquisition and re-book it at
  // the corrected cost), so `refusal` would serve the reader better than `invariant`. The table
  // that decides it is inside the DEPLOY-LOCKED claraWork v1 closure and may not be edited; the
  // fix is one row in the wave's shared claraWork_v4 errors file. Pinned here so the next cut
  // changes it deliberately and this cell goes red when it does.
  assert.equal(c.recoverable, false);
});

test("clr40.neighbours the CLR codes that DO have a mapping keep it — this file adds no second opinion", () => {
  const period = errors.classifyWorkError(pgError("CLR19", '{"reason":"write_into_closed_period"}'));
  assert.equal(period.kind, "refusal");
  assert.equal(errors.workOutcomeFor(period.kind), "refused",
    "a locked period is the human's to resolve, and it settles refused");
  const authority = errors.classifyWorkError(pgError("CLR04", '{"reason":"obo_not_active"}'));
  assert.equal(authority.kind, "refusal");
  const control = errors.classifyWorkError(pgError("CLR10", '{"reason":"generic_control_leg"}'));
  assert.equal(control.kind, "refusal",
    "a credit-financed acquisition is refused, and the human is told to use the coding lane");
});
