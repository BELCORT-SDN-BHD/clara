// #639 — the axis→control map, pinned to the door's own vocabulary (round-1 review, SPEC F1).

import { test } from "node:test";
import assert from "node:assert/strict";

import { DoorError, DoorRefusal } from "@/lib/doors";
import {
  FA_FIELD_CONTROL_SUFFIX, FA_REFUSAL_AXIS_FIELD, faRefusalControlId, faRefusalField,
} from "./fa-refusal-field";

const refusal = (detail: Record<string, unknown> | null) =>
  new DoorRefusal("CLR37", "fa particulars invalid", {
    reason: "fa_particulars_invalid", status: 400, pgCode: "CLR37", codeSource: "sqlstate", detail,
  });

test("every axis clara._fa_validate_particulars raises maps to a control or to NOTHING, deliberately", () => {
  // The closed axis set the door raises, transcribed from 0041:2970-3033 + 0201 §D.
  for (const axis of ["method", "drivers", "start_date", "residual", "non_depreciable", "lifecycle", "unknown_key", "malformed", "shape"]) {
    assert.ok(axis in FA_REFUSAL_AXIS_FIELD, `the map must answer for axis '${axis}'`);
  }
  assert.equal(faRefusalField(refusal({ axis: "drivers" })), "useful_life_months");
  assert.equal(faRefusalField(refusal({ axis: "start_date" })), "start_date");
  assert.equal(faRefusalField(refusal({ axis: "residual" })), "residual_cents");
  assert.equal(faRefusalField(refusal({ axis: "non_depreciable" })), "method");
  // `lifecycle` is not about a control the reader can correct; naming one would send focus
  // somewhere useless, so the surface renders the refusal at form level instead.
  assert.equal(faRefusalField(refusal({ axis: "lifecycle" })), null);
});

test("a database-supplied `field` WINS over the axis map — a later door may name the control itself", () => {
  assert.equal(faRefusalField(refusal({ axis: "drivers", field: "rate_bps" })), "rate_bps");
});

test("only a governed refusal names a control: a transport failure and an unknown axis name none", () => {
  assert.equal(faRefusalField(new DoorError("boom", { kind: "transport", status: null })), null);
  assert.equal(faRefusalField(new Error("boom")), null);
  assert.equal(faRefusalField(null), null);
  assert.equal(faRefusalField(refusal(null)), null);
  assert.equal(faRefusalField(refusal({ axis: "not_an_axis" })), null);
});

test("the control id is the one FaParticularsFields actually renders", () => {
  // `FaParticularsFields` renders `${idPrefix}-${suffix}`; these two tables are the seam, so they
  // are pinned together rather than left to agree by habit.
  assert.equal(faRefusalControlId("fa-complete-a1", refusal({ axis: "residual" })), "fa-complete-a1-residual");
  assert.equal(faRefusalControlId("fa-revise-a1", refusal({ axis: "start_date" })), "fa-revise-a1-start");
  assert.equal(faRefusalControlId("fa-complete-a1", refusal({ axis: "lifecycle" })), null);
  for (const suffix of Object.values(FA_FIELD_CONTROL_SUFFIX)) {
    assert.ok(suffix && !suffix.includes(" "), "a control suffix is an id fragment, never a label");
  }
});
