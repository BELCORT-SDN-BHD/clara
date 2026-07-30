// INTAKE LANE DISPATCH — which processing lane (and which engine snapshot) a freshly
// sealed document is finalized into. Split out of `intake.mjs` when Wave C-b added OFX,
// because this decision is a small, self-contained policy that reads far better next to its
// own rationale than buried between the upload state machine and the failure mapper.
//
// WHAT THIS DECIDES, AND WHAT IT DOES NOT. This is the INTAKE-time lane only — the pass
// that turns bytes into stored evidence. It is NOT the facts/statement routing: that is the
// DB router's (`clara._enqueue_invoice_facts_core`), which fires at filing time and again on
// `document.classified`, and which is the only thing that knows the document's KIND. So a
// bank statement PDF still takes the `ocr` lane here, exactly as it always has; the
// `statement_facts` task is minted later, by the router, once the kind is known.

import { AZURE_ENGINE_SNAPSHOT } from "./egress.mjs";
import { MYINVOIS_ENGINE_SNAPSHOT } from "./myinvois.mjs";

const STRUCTURED_ENGINE_SNAPSHOT = Object.freeze({
  engineId: "clara-structured:v1",
  engineConfig: { provider: "clara", parser: "values-only", version: 1 },
  versionN: 1,
});

/** The store-only snapshot: bytes are sealed canonically and NO intake-time reader runs.
 *  `lane='none'` settles through `complete_stored_document_task`; the lane<->engine CHECK
 *  requires a `clara-%` engine id for it. */
const STORE_ONLY_ENGINE_SNAPSHOT = Object.freeze({
  engineId: "clara-store-only:v1",
  engineConfig: { provider: "clara", parser: "none", version: 1 },
  versionN: 1,
});

/**
 * A detected format → its intake lane + engine snapshot.
 *
 * OFX (Wave C-b design §4.3) takes the STORE-ONLY lane, deliberately:
 *   * `structured_parse` would be WRONG — that lane drives `parseStructured`, the
 *     values-only spreadsheet/CSV worker, which has no OFX reader. The task would claim,
 *     run, and fail `corrupt` on a file that is perfectly readable by the code that
 *     actually owns it.
 *   * `ocr` would be WRONG and expensive — OFX is machine-readable text; sending it to a
 *     vendor OCR model would spend real egress and page budget to recover characters that
 *     were never lost.
 *   * store-only is HONEST: the bytes are sealed, hashed and canonical, and the reader that
 *     understands them is the `statement_parse` lane, whose task the DB router mints once
 *     the document's kind is `bank_statement`. Nothing is read twice and nothing is guessed.
 * The consequence, stated: an OFX file that is never classified as a bank statement yields
 * no extraction at all. That is correct — Clara has no other use for an OFX file, and
 * inventing one would mean reading a bank's records for an unstated purpose.
 *
 * CSV is UNCHANGED (`structured_parse`, the values-only parser) — Wave C-b is additive
 * here, and the statement CSV is read by the DB-routed `statement_parse` task, not by this
 * intake pass.
 */
export function laneSnapshot(format) {
  if (format === "ofx") return { lane: "none", ...STORE_ONLY_ENGINE_SNAPSHOT };
  if (["xlsx", "docx", "csv", "tsv"].includes(format)) {
    return { lane: "structured_parse", ...STRUCTURED_ENGINE_SNAPSHOT };
  }
  if (format === "xml") return { lane: "structured_parse", ...MYINVOIS_ENGINE_SNAPSHOT }; // facts pass = separate local_facts task
  return { lane: "ocr", ...AZURE_ENGINE_SNAPSHOT };
}
