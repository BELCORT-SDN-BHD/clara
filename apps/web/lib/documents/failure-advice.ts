// THE DATABASE'S OWN FAILURE CODE AS A NEXT STEP — in ONE place, for the TWO surfaces that
// render it.
//
// `clara.document_intakes.failure_code` is a nine-value enum (`document_intakes_failure_code_check`,
// mirrored by `IntakeFailureCode`). Two surfaces show it: the live upload QUEUE
// (`components/documents/upload-panel.tsx`, which remembers what this tab just did) and the
// DURABLE receipts list (`components/documents/intake-receipts.tsx`, which reads
// `clara.document_intakes_visible` back). They are two views of ONE vocabulary, so the map and
// its default live here rather than beside one of them.
//
// WHY IT MOVED (#965 fix round, L05-SPEC-07). Until migration 0254, a file the daily ceiling
// refused at intake CREATION took its own intake row down with the rolled-back transaction, so no
// refused row ever reached the receipts list and only the queue had to phrase `limit`. 0254
// commits the record, so every ceiling refusal now appears on that list too — and it arrived
// rendering the literal token. The phrasing already existed; only the reach was missing.
//
// THE DEFAULT IS HONEST, NOT DECORATIVE. `queueRecoveryLabelKey`'s idiom: a closed map, and a code
// this build has not met names ITSELF inside a sentence rather than borrowing another code's
// advice. Widening the set without widening the catalogue would make a new code silently read as
// an old one's problem.

import type { IntakeFailureCode } from "./types";

export const INTAKE_FAILURE_CODES: ReadonlySet<string> = new Set<IntakeFailureCode>([
  "too_large", "bad_type", "limit", "checksum_mismatch", "storage_error",
  "expired", "malware_detected", "quarantined", "internal",
]);

/** @param t a `ClientDocuments`-scoped translator — both callers already hold one. */
export function intakeFailureAdvice(
  code: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return INTAKE_FAILURE_CODES.has(code) ? t(`queueFailure.${code}`) : t("queueFailureUnknown", { code });
}
