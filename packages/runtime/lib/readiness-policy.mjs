// Pure /ready fail-vs-warn policy. Kept dependency-free so the threshold and the
// existing DB/world/control/taxonomy hard gates can be pinned without a live rig.

export const STORAGE_WRITE_FAILURE_THRESHOLD = 2;

export const READINESS_FAILURE_REASONS = Object.freeze([
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
]);

const READINESS_FAILURE_REASON_SET = new Set(READINESS_FAILURE_REASONS);

export function readinessFailure(check, reason, extra = {}) {
  if (!READINESS_FAILURE_REASON_SET.has(reason)) {
    throw new TypeError(`unknown readiness failure reason: ${String(reason)}`);
  }
  return { ...extra, check, reason };
}

export function storageWriteVerdictIsValid(storageVerdict) {
  return (
    storageVerdict !== null &&
    typeof storageVerdict === "object" &&
    !Array.isArray(storageVerdict) &&
    typeof storageVerdict.ok === "boolean" &&
    typeof storageVerdict.pending === "boolean" &&
    typeof storageVerdict.consecutive_failures === "number" &&
    Number.isFinite(storageVerdict.consecutive_failures) &&
    storageVerdict.consecutive_failures >= 0 &&
    Number.isInteger(storageVerdict.consecutive_failures) &&
    (storageVerdict.reason === null || READINESS_FAILURE_REASON_SET.has(storageVerdict.reason))
  );
}

export function storageWriteHasHardFailure(storageVerdict) {
  if (!storageWriteVerdictIsValid(storageVerdict)) return true;
  return (
    storageVerdict.pending ||
    (!storageVerdict.ok && storageVerdict.consecutive_failures >= STORAGE_WRITE_FAILURE_THRESHOLD)
  );
}

export function storageWriteHardFailureReason(storageVerdict) {
  if (!storageWriteVerdictIsValid(storageVerdict)) return "storage_verdict_malformed";
  if (storageVerdict.pending) return storageVerdict.reason ?? "storage_probe_pending";
  return storageVerdict.reason ?? "storage_probe_error";
}

export function readinessHasHardFailure(checks, isWorldEnabled) {
  const storageWriteFailed = storageWriteHasHardFailure(checks.storage_write);

  return (
    checks.db?.ok === false ||
    storageWriteFailed ||
    (isWorldEnabled && (checks.world?.ok === false || checks.control?.ok === false || checks.taxonomy?.ok === false))
  );
}
