// lib/settings/preference-state.ts — the pure dirty/patch/reset state machine
// account-settings.tsx builds on. No door, no DOM: every case here is a plain
// function call over plain objects.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildInterfacePatch,
  dirtyInterfaceFields,
  effectiveInterfaceValue,
  firstDirtyField,
  hasAnyDirtyField,
  isFieldDirty,
  resetDraftField,
  setDraftField,
  type InterfaceDraft,
} from "./preference-state";
import type { InterfacePreferences } from "./preferences";

const AUTHORITATIVE: InterfacePreferences = { motion: "system", sidebarDefault: "expanded" };

test("effectiveInterfaceValue: an untouched field shows the authoritative value", () => {
  const draft: InterfaceDraft = {};
  assert.equal(effectiveInterfaceValue(draft, AUTHORITATIVE, "motion"), "system");
  assert.equal(effectiveInterfaceValue(draft, AUTHORITATIVE, "sidebarDefault"), "expanded");
});

test("effectiveInterfaceValue: a touched field shows the DRAFT value, not the stored one", () => {
  const draft = setDraftField<"motion">({}, "motion", "reduced");
  assert.equal(effectiveInterfaceValue(draft, AUTHORITATIVE, "motion"), "reduced");
  // the untouched sibling field is unaffected.
  assert.equal(effectiveInterfaceValue(draft, AUTHORITATIVE, "sidebarDefault"), "expanded");
});

test("isFieldDirty: touching a control back to its ORIGINAL value is not dirty", () => {
  const draft = setDraftField<"motion">({}, "motion", "system"); // same as authoritative
  assert.equal(isFieldDirty(draft, AUTHORITATIVE, "motion"), false);
});

test("isFieldDirty: a genuinely changed value is dirty", () => {
  const draft = setDraftField<"motion">({}, "motion", "reduced");
  assert.equal(isFieldDirty(draft, AUTHORITATIVE, "motion"), true);
});

test("dirtyInterfaceFields / hasAnyDirtyField: nothing dirty on a fresh draft", () => {
  assert.deepEqual(dirtyInterfaceFields({}, AUTHORITATIVE), []);
  assert.equal(hasAnyDirtyField({}, AUTHORITATIVE), false);
});

test("buildInterfacePatch: ONE SAVE CANNOT CLEAR AN UNRELATED SETTING — only the dirty field is sent", () => {
  const draft = setDraftField<"motion">({}, "motion", "reduced");
  const patch = buildInterfacePatch(draft, AUTHORITATIVE);
  assert.deepEqual(patch, { motion: "reduced" });
  assert.ok(!("sidebarDefault" in patch), "an untouched field must never appear in the patch");
});

test("buildInterfacePatch: both fields dirty sends both, in the fixed display order", () => {
  let draft: InterfaceDraft = {};
  draft = setDraftField(draft, "motion", "reduced");
  draft = setDraftField(draft, "sidebarDefault", "collapsed");
  assert.deepEqual(buildInterfacePatch(draft, AUTHORITATIVE), { motion: "reduced", sidebarDefault: "collapsed" });
  assert.deepEqual(dirtyInterfaceFields(draft, AUTHORITATIVE), ["motion", "sidebarDefault"]);
});

test("resetDraftField: restores exactly one field to genuinely untouched, others unaffected", () => {
  let draft: InterfaceDraft = {};
  draft = setDraftField(draft, "motion", "reduced");
  draft = setDraftField(draft, "sidebarDefault", "collapsed");
  const reset = resetDraftField(draft, "motion");
  assert.equal(isFieldDirty(reset, AUTHORITATIVE, "motion"), false);
  assert.equal(effectiveInterfaceValue(reset, AUTHORITATIVE, "motion"), "system");
  // The OTHER field's draft survives the reset untouched.
  assert.equal(isFieldDirty(reset, AUTHORITATIVE, "sidebarDefault"), true);
  assert.equal(effectiveInterfaceValue(reset, AUTHORITATIVE, "sidebarDefault"), "collapsed");
});

test("firstDirtyField: display order (motion before sidebarDefault), null when nothing is dirty", () => {
  assert.equal(firstDirtyField({}, AUTHORITATIVE), null);
  const sidebarOnly = setDraftField<"sidebarDefault">({}, "sidebarDefault", "collapsed");
  assert.equal(firstDirtyField(sidebarOnly, AUTHORITATIVE), "sidebarDefault");
  let both: InterfaceDraft = {};
  both = setDraftField(both, "sidebarDefault", "collapsed"); // set out of order…
  both = setDraftField(both, "motion", "reduced");
  assert.equal(firstDirtyField(both, AUTHORITATIVE), "motion"); // …display order still wins
});

test("everything works identically with an UNDEFINED authoritative base (no row saved yet)", () => {
  const draft = setDraftField<"motion">({}, "motion", "reduced");
  assert.equal(effectiveInterfaceValue(draft, undefined, "sidebarDefault"), undefined);
  assert.equal(isFieldDirty(draft, undefined, "motion"), true);
  assert.deepEqual(buildInterfacePatch(draft, undefined), { motion: "reduced" });
});
