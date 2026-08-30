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
  const dr = await readFile(drPath, "utf8");
  const sample = dr.match(
    /<!-- readiness-failure-reasons:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- readiness-failure-reasons:end -->/,
  );
  assert.ok(sample, "DR.md must carry the machine-readable failures[] reason sample");
  assert.deepEqual(JSON.parse(sample[1]), EXPECTED_REASONS, "DR.md and the shipped taxonomy must stay identical");
});
