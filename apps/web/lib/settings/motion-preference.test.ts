// lib/settings/motion-preference.ts — the pure motion-attribute resolution
// components/app-shell/motion-preference-sync.tsx applies. No DOM: every case
// is a plain function call.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isMotionPreference,
  motionAttributeValue,
  resolveEffectiveReducedMotion,
} from "./motion-preference";

test("resolveEffectiveReducedMotion: no saved preference defers entirely to the OS query", () => {
  assert.equal(resolveEffectiveReducedMotion(undefined, true), true);
  assert.equal(resolveEffectiveReducedMotion(undefined, false), false);
});

test("resolveEffectiveReducedMotion: 'system' behaves exactly like no preference", () => {
  assert.equal(resolveEffectiveReducedMotion("system", true), true);
  assert.equal(resolveEffectiveReducedMotion("system", false), false);
});

test("resolveEffectiveReducedMotion: an explicit 'reduced' choice wins even when the OS asks for full motion", () => {
  assert.equal(resolveEffectiveReducedMotion("reduced", false), true);
});

test("resolveEffectiveReducedMotion: 'reduced' plus an OS reduced-motion request is still just reduced", () => {
  assert.equal(resolveEffectiveReducedMotion("reduced", true), true);
});

test("motionAttributeValue: the literal string the CSS selector matches, never a boolean", () => {
  assert.equal(motionAttributeValue(true), "reduced");
  assert.equal(motionAttributeValue(false), "system");
});

test("isMotionPreference: accepts only the two enumerated values", () => {
  assert.equal(isMotionPreference("system"), true);
  assert.equal(isMotionPreference("reduced"), true);
  assert.equal(isMotionPreference("reducedMotion"), false);
  assert.equal(isMotionPreference(undefined), false);
  assert.equal(isMotionPreference(null), false);
  assert.equal(isMotionPreference(true), false);
});
