// C33.6 — THE SANDBOX MARKER, named.
//
// The rig has always marked its synthetic rows: `buildWorld()` derives a per-run prefix
// `rig_<base36 clock>_<6 hex>` and every firm, client and user it creates carries it. What it
// never had was a NAME for that convention — the prefix was a template literal inside one
// function, so nothing could ask "is this row mine?" without re-spelling the literal, and
// nothing could state where the marker is allowed to be read.
//
// This module is that name, and it is deliberately small:
//   * SANDBOX_PREFIX  — the marker itself, one home.
//   * sandboxName()   — mints a fresh marked name. BEHAVIOUR-IDENTICAL to the literal it
//                       replaced: same prefix, same clock encoding, same 6 hex characters, so
//                       every existing fixture row keeps the exact shape it had.
//   * isSandboxName() — the reader, for a cell that needs to prove a row is fixture-made.
//
// WHAT THE MARKER IS NOT. It is not an isolation mechanism: tenant isolation is RLS plus the
// firm predicates, and a marked name buys nothing there. It is a per-run UNIQUENESS device (so
// two concurrent rig runs, or a re-run against a reused local rig, never collide on a name)
// and a HUMAN one (so a row in a scratch database says where it came from). No production
// source reads it, and `sandbox-marker.test.mjs` asserts that rather than assuming it.

import { randomUUID } from "node:crypto";

/** The one spelling of the marker. Every marked name starts with exactly this. */
export const SANDBOX_PREFIX = "rig_";

/**
 * A fresh marked name.
 *
 * With no tag this is byte-for-byte the shape `rig-fixtures.mjs` minted inline before this
 * module existed — `rig_` + the current clock in base 36 + `_` + six hex characters — so the
 * change that adopted it moved no behaviour. A `tag` is inserted between the marker and the
 * stamp for a caller that wants its own rows legible (`rig_intake_ltx9k3_a1b2c3`).
 *
 * @param {string} [tag] optional short label; non-marker characters are stripped
 * @returns {string}
 */
export function sandboxName(tag = "") {
  const stamp = `${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const clean = String(tag).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return clean ? `${SANDBOX_PREFIX}${clean}_${stamp}` : `${SANDBOX_PREFIX}${stamp}`;
}

/**
 * Does `name` carry the marker? A non-string is not a marked name (it is not an error either
 * — a caller sweeping a column that may hold nulls asks this question about every value).
 * @param {unknown} name
 * @returns {boolean}
 */
export function isSandboxName(name) {
  return typeof name === "string" && name.startsWith(SANDBOX_PREFIX);
}

/**
 * The marker as a TOKEN-BOUNDARY regex, for a source sweep.
 *
 * A plain substring search for `rig_` also matches `orig_nets` and `v_thr_trig_count` — both
 * measured in packages/db/migrations — and would report a migration's local variable as a
 * marker consumer. `sandboxName()` always emits the marker at the start of a name, so the
 * sweep looks for it there: not preceded by an identifier character.
 */
export const SANDBOX_MARKER_RE = /(?<![A-Za-z0-9_])rig_/;
