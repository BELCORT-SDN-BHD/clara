// Pure /ready fail-vs-warn policy. Kept dependency-free so the threshold and the
// existing DB/world/control/taxonomy hard gates can be pinned without a live rig.

export const STORAGE_WRITE_FAILURE_THRESHOLD = 2;

export function storageWriteHasHardFailure(storageVerdict) {
  const storage = storageVerdict ?? {};
  const storageFailureCount = Number(storage.consecutive_failures);
  return (
    storage.pending === true ||
    (storage.ok !== true && (!Number.isFinite(storageFailureCount) || storageFailureCount >= STORAGE_WRITE_FAILURE_THRESHOLD))
  );
}

export function readinessHasHardFailure(checks, isWorldEnabled) {
  const storageWriteFailed = storageWriteHasHardFailure(checks.storage_write);

  return (
    checks.db?.ok === false ||
    storageWriteFailed ||
    (isWorldEnabled && (checks.world?.ok === false || checks.control?.ok === false || checks.taxonomy?.ok === false))
  );
}
