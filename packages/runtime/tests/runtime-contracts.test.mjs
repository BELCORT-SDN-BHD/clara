// #1035 — THE IMAGE'S OWN CONTRACT ROSTER, and the one thing that makes it worth reading.
//
// THE DEFECT THIS FILE IS PART OF. The rollback preflight refuses a target image that lacks a
// workflow BODY the applied schema requires. It knew nothing about the other way a rollback goes
// wrong: a migration that changes what a DOOR RETURNS. Two have shipped —
// `0254_intake_refusal_record` (a ceiling-refused intake is COMMITTED and returned as
// `refused: true` instead of raising CLR18) and `0279_fa_closed_year_arrears` (a depreciation run
// that may not fold a closed year's months answers `status: 'parked'` instead of posting). An
// image built before either one reads the new answer with the old eyes: it mints an upload
// capability for a file the database turned away and answers 201 to the uploader, or it counts a
// parked run as a post and re-drives it on every sweep. Both were recorded as ALLOWED by the
// preflight at hosted release time (RELEASE-W2-RUNBOOK.md and RELEASE-W3-RUNBOOK.md, § RESULTS).
//
// WHAT A MARKER IS, AND WHY IT IS NOT A VERSION NUMBER. An image cannot be asked "were you built
// after 0254" — at rollback time you have an image reference, not a build date, and a hand-kept
// list of image tags is the thing this whole command exists to avoid. So the image DECLARES what
// it understands, in a literal the built bundle carries, exactly as it declares its workflow
// bodies through the WDK's own directives. The preflight reads the declaration off the target
// artifact; nobody types it.
//
// AND WHY THE EVIDENCE FIELD IS THE POINT. A declaration that nothing checks is a promise. Every
// roster entry names the module that implements the behaviour and one line of that module's source
// that only exists when the behaviour does, and the cell below reads both. Delete the refusal arm
// from lib/intake.mjs and this file goes red BEFORE the marker can lie to a preflight.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { CONTRACT_MARKER_PREFIX, RUNTIME_CONTRACTS, RUNTIME_CONTRACT_IDS } from "../lib/runtime-contracts.mjs";

const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));

test("#1035: the roster is FROZEN data, and every marker is its prefix followed by its id", () => {
  assert.equal(Object.isFrozen(RUNTIME_CONTRACTS), true, "the roster itself is frozen");
  assert.ok(RUNTIME_CONTRACTS.length > 0, "an empty roster would make every contract rule refuse this image");
  for (const entry of RUNTIME_CONTRACTS) {
    assert.equal(Object.isFrozen(entry), true, `${entry.id} must be frozen`);
    // The two spellings are BOTH literals, deliberately: the prefixed one is what a bundle scan
    // finds, the bare one is the vocabulary a rule names. Computing one from the other would put
    // no literal in the bundle at all, and a scan would find nothing to read.
    assert.equal(entry.marker, `${CONTRACT_MARKER_PREFIX}${entry.id}`,
      `${entry.id}'s marker and id must agree — a drift between them is a marker no scan can find`);
    assert.match(entry.id, /^[a-z][a-z0-9_]*_v\d+$/, `${entry.id} is not a contract id`);
    assert.match(entry.since, /^\d{4}_/, `${entry.id} must name the migration it became required at`);
    assert.ok(entry.why && entry.why.length > 0, `${entry.id} must say what an image WITHOUT it gets wrong`);
  }
  assert.deepEqual(RUNTIME_CONTRACT_IDS, RUNTIME_CONTRACTS.map((c) => c.id),
    "the id list build-info serves is the roster's own, in the roster's own order");
  assert.equal(new Set(RUNTIME_CONTRACT_IDS).size, RUNTIME_CONTRACT_IDS.length, "no id twice");
});

test("#1035: every marker names a module and a line of it that only exists when the behaviour does", () => {
  for (const entry of RUNTIME_CONTRACTS) {
    const src = readFileSync(join(RUNTIME_ROOT, entry.module), "utf8");
    assert.ok(
      src.includes(entry.evidence),
      `${entry.id} claims ${entry.module} handles it, but that file does not contain ${JSON.stringify(entry.evidence)} — `
        + "the marker would tell a rollback preflight this image understands a contract it does not",
    );
  }
});
