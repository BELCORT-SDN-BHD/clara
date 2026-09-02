// Reporter-only child fixture. The collected gate-pins file invokes this path explicitly;
// package discovery ignores it because it is not a *.test.mjs file.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  prefixWakeOpenFirmQuestionKindWallFailure,
  resolveWakeOpenFirmQuestionKindWallMigration,
  readWakeOpenFirmQuestionKindWallState,
} from "./wake-open-firm-question-kind-wall-gate-state.mjs";

const scenario = process.env.CLARA_KIND_WALL_REPORTER_SCENARIO;
assert.ok(scenario === "absent" || scenario === "spelling", "reporter probe scenario is pinned");
const migration = resolveWakeOpenFirmQuestionKindWallMigration();
const spellingSha = migration.preimageSha[0] === "f" ? "e".repeat(64) : "f".repeat(64);
let state;

before(async () => {
  const rows = scenario === "absent"
    ? []
    : [{
        body_sha: spellingSha,
        prosrc: "-- door_owned_kind onboarding_proposed marker-spelling mutant",
      }];
  state = await readWakeOpenFirmQuestionKindWallState(async () => ({ rows }), "1");
});

test(`kind-wall reporter ${scenario}: the gate executes and the behavioural cell owns the failure`, () => {
  assert.equal(state.action, "execute");
  assert.equal(state.classification, scenario === "absent" ? "absent" : "unknown");
  try {
    assert.fail("reporter probe reached the behavioural assertion");
  } catch (error) {
    throw prefixWakeOpenFirmQuestionKindWallFailure(error, state.diagnostic);
  }
});
