// agreementFacts_v1 — THE INJECTED SERVICES BUNDLE. NOT FROZEN, deliberately.
//
// Infrastructure is process-injected via globalThis so pool / storage / model-adapter tuning
// stays OUTSIDE the immutable workflow closure (the AB-16 precedent every sibling class uses).
// The PROMPTS are the one exception and live inside the closure, because a prompt tweak is a
// behavioural change and must be a new workflow version.
//
// WHAT THIS BUNDLE SHARES WITH THE INVOICE LANE, AND WHY THAT IS NOT THE COUPLING #948 FORBIDS.
// The provider adapter (`callWitnessModel`), the media-type contract and the document services
// (temp-file lifecycle, hash-verified canonical download) come from
// witnessFacts.v2.services.mjs. None of those is a frozen file and none of them is a
// QUESTIONNAIRE: they are how bytes reach a model and how a temp file is cleaned up. #948's rule
// is that a versioned workflow may not couple its SHAPE to another family's FROZEN files — the
// prompts, the wire schema, the behaviour, the entry — and this family owns every one of those.
// Sharing one HTTP adapter between lanes is the same decision the estate already made when
// statementFacts and witnessFacts shared `makeDocumentServices`, and #945 restated for payroll.
//
// WHAT IT DOES NOT SHARE: the ENGINE IDENTITY. It is its own, and it must be — the router stamps
// an agreement task with this literal and the behaviour refuses to egress under a provenance
// receipt naming a model it did not call.

import { makeDocumentServices } from "../lib/intake.mjs";
import { callWitnessModel, witnessMediaType } from "./witnessFacts.v2.services.mjs";

/**
 * The agreement model. DEFAULT `gpt-5.6-terra` for the witness lane's own three reasons: it is
 * the model this deployment already egresses to, its provider binding is the RESPONSES API (the
 * only OpenAI surface that accepts PDF file parts at all), and the sibling `gpt-5.6-sol` is this
 * repo's CODEX lane model. Overridable per deployment so a corpus-tuning round can move the model
 * without a workflow version — but NOT without moving the engine id, which is derived from it
 * below so provenance can never name a model nobody called.
 */
export const AGREEMENT_MODEL_ID = process.env.CLARA_AGREEMENT_MODEL_ID || process.env.CLARA_WITNESS_MODEL_ID || "gpt-5.6-terra";

/** The agreement contract version inside the engine id. It moves with the WORKFLOW class, not
 *  with the model (the model is the middle segment). */
export const AGREEMENT_ENGINE_VERSION = "agreement-witness-v1";

/** engine_id `llm-{provider}:{model}:{version}`. The `llm-` prefix is not cosmetic: migration
 *  0299's lane<->engine prefix CHECK refuses a `contract_facts` task whose engine_id does not
 *  match `llm-%`, so a mis-stamped task cannot even be inserted. BOTH channels share this ONE
 *  engine id and are distinguished by engine_kind (`agreement_text_facts` /
 *  `agreement_vision_facts`). Under the default model this reads
 *  `llm-openai:gpt-5.6-terra:agreement-witness-v1`, which MUST string-equal the literal 0299
 *  splices into `clara._enqueue_invoice_facts_core`'s agreement arm — the battery reads both
 *  sides independently and asserts equality, so a drift STALLS the lane rather than mis-stamping
 *  it. */
export const AGREEMENT_ENGINE_SNAPSHOT = Object.freeze({
  engineId: `llm-openai:${AGREEMENT_MODEL_ID}:${AGREEMENT_ENGINE_VERSION}`,
  engineConfig: Object.freeze({ provider: "openai", model: AGREEMENT_MODEL_ID, contract: AGREEMENT_ENGINE_VERSION }),
  versionN: 1,
});

export function makeAgreementFactsServicesV1() {
  const base = makeDocumentServices();
  return Object.freeze({
    taskTempPath: base.taskTempPath,
    removeTempFile: base.removeTempFile,
    // Hash-verified canonical bytes — the vision channel's input pin is `documents.sha256`, so
    // the bytes the model reads must provably be the bytes that pin names.
    downloadCanonical: base.downloadCanonical,
    // The ONLY line in this lane that sends anything anywhere.
    callAgreementModel: callWitnessModel,
    agreementMediaType: witnessMediaType,
    engineSnapshot: AGREEMENT_ENGINE_SNAPSHOT,
    log: (message) => console.error(message),
  });
}
