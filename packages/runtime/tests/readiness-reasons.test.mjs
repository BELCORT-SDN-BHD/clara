import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { READINESS_FAILURE_REASONS, readinessFailure } from "../lib/readiness-policy.mjs";

const EXPECTED_REASONS = [
  "db_timeout",
  "db_unreachable",
  "world_heartbeat_stale",
  "control_heartbeat_stale",
  "taxonomy_halt",
  "storage_probe_pending",
  "storage_error",
  "storage_probe_error",
  "storage_probe_timeout",
  "storage_probe_readback_mismatch",
  "storage_verdict_malformed",
  "runtime_shutting_down",
];

test("readiness failures: the public reason taxonomy is a closed literal set", async () => {
  assert.deepEqual(READINESS_FAILURE_REASONS, EXPECTED_REASONS);
  assert.throws(
    () => readinessFailure("future_check", "future_reason"),
    /unknown readiness failure reason: future_reason/,
    "a new failures[] reason must deliberately extend the closed set",
  );

  const drPath = fileURLToPath(new URL("../../../docs/ops/DR.md", import.meta.url));
  const runtimeReadmePath = fileURLToPath(new URL("../README.md", import.meta.url));
  const flyConfigPath = fileURLToPath(new URL("../fly.toml", import.meta.url));
  const dr = await readFile(drPath, "utf8");
  const runtimeReadme = await readFile(runtimeReadmePath, "utf8");
  const flyConfig = await readFile(flyConfigPath, "utf8");
  const sample = dr.match(
    /<!-- readiness-failure-reasons:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- readiness-failure-reasons:end -->/,
  );
  assert.ok(sample, "DR.md must carry the machine-readable failures[] reason sample");
  assert.deepEqual(JSON.parse(sample[1]), EXPECTED_REASONS, "DR.md and the shipped taxonomy must stay identical");

  for (const [name, text] of [["runtime README", runtimeReadme], ["DR runbook", dr]]) {
    assert.equal(/fresh READY Machine/i.test(text), false, `${name} must not claim Fly grace creates readiness`);
    assert.equal(/Storage down at boot remains 503 by design/i.test(text), true, `${name} must keep cold storage fail-closed`);
    assert.equal(/unmeasured assumption/i.test(text), true, `${name} must label the cold-start runway claim unmeasured`);
    assert.equal(
      /Measure\s+boot-to-first-passing-`\/ready` at the first deploy/i.test(text),
      true,
      `${name} must point the operator at the first-deploy measurement`,
    );
  }
  assert.equal(/grace delays the first check; it never bypasses \/ready or routes before a pass/i.test(flyConfig), true);
});
