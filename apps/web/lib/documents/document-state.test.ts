// #624 — the four verdict derivations, celled directly.
//
// The panel's own battery mounts a component and reads text; this one pins the FUNCTIONS,
// because the distinctions they draw are the product decision and each has a direction of error
// that matters:
//
//   * `unsupported_kind` vs `unsupported_format` — "Clara keeps this type but derives nothing"
//     is a different sentence from "Clara cannot read facts out of this file format", and a
//     professional holding an OFX statement needs the second one.
//   * `partial` vs `validated` — facts with no arithmetic check are NOT checked facts. Folding
//     them together is exactly the placeholder success this ticket removes.
//   * `unmeasured` is not `pass`. A check whose terms were never persisted has no verdict.
//   * `not_applicable` on the operation axis is a legitimate resting state, never a failure.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capabilityLimits, custodyVerdict, extractionTone, extractionVerdict, factsTone, factsVerdict,
  failingChecks, isCapabilityLevel, landedFactsExtractions, operationVerdict, unmeasuredChecks,
  type DocumentStateResult,
} from "./document-state";

function state(over: {
  capability?: Partial<DocumentStateResult["capability"]>;
  custody?: Partial<DocumentStateResult["custody"]>;
  byte_extraction?: Partial<DocumentStateResult["byte_extraction"]>;
  facts?: Partial<DocumentStateResult["facts"]>;
  operation?: Partial<DocumentStateResult["operation"]>;
} = {}): DocumentStateResult {
  return {
    document_id: "d", document_kind: "invoice", mime_type: "application/pdf", format: "pdf",
    capability: {
      format: "pdf", document_kind: "invoice", mime_type: "application/pdf",
      custody: "supported", byte_extraction: "supported",
      typed_facts: "supported", business_operation: "supported",
      engine_id: "e", engine_byte: "eb", registry_version: 1, basis: "b",
      limits: {}, known_pair: true, kind_known: true,
      ...over.capability,
    },
    custody: {
      state: "verified", sha256: "s", byte_size: 1, bytes_verified_at: "2026-01-01T00:00:00Z",
      legal_hold: false, legal_hold_reason: null, retention_state: "anchored",
      retain_until: null, capability: "supported", ...over.custody,
    },
    byte_extraction: {
      status: "done", page_count: 1, capability: "supported", engine_id: "eb", tasks: [],
      ...over.byte_extraction,
    },
    facts: { capability: "supported", limits: {}, extractions: [], validations: [], ...over.facts },
    operation: { capability: "supported", codeable_kind: true, entries: [], statements: [], ...over.operation },
    lineage: { sha256: "s", intakes: [], filings: [], corrections: [], authoritative_extraction_id: null },
  };
}

const extraction = (over: Partial<DocumentStateResult["facts"]["extractions"][number]> = {}) => ({
  id: "x", engine_kind: "llm_text_facts", engine_id: "e", version_n: 1, status: "done",
  superseded_by: null as string | null, extracted_at: null as string | null, region_count: 3, ...over,
});

const validation = (over: Partial<DocumentStateResult["facts"]["validations"][number]> = {}) => ({
  check_name: "invoice.six_term_identity", outcome: "pass" as const, detail: {},
  extraction_id: "x", statement_id: null, engine_id: "e", evaluated_at: "2026-01-01T00:00:00Z",
  ...over,
});

test("the four capability levels are a closed set and nothing else passes the guard", () => {
  for (const level of ["supported", "stored_only", "unsupported", "planned"]) {
    assert.equal(isCapabilityLevel(level), true, level);
  }
  for (const junk of ["maybe", "", null, undefined, 1, "SUPPORTED"]) {
    assert.equal(isCapabilityLevel(junk), false, String(junk));
  }
});

test("custody: a legal hold is the loudest true thing and outranks verification", () => {
  assert.equal(custodyVerdict(state()), "verified");
  assert.equal(custodyVerdict(state({ custody: { bytes_verified_at: null } })), "stored");
  assert.equal(
    custodyVerdict(state({ custody: { legal_hold: true, bytes_verified_at: "2026-01-01T00:00:00Z" } })),
    "held",
    "a held document is held, whatever else is true of its bytes",
  );
});

test("extraction: a format the intake never reads is NOT ATTEMPTED, which is not a failure", () => {
  const ofx = state({
    byte_extraction: { capability: "stored_only", status: "pending", tasks: [] },
  });
  assert.equal(extractionVerdict(ofx), "not_attempted");
  assert.equal(extractionTone("not_attempted"), "neutral",
    "nothing ran, so nothing is wrong — an alarming tone here would be a different lie");
  assert.equal(extractionTone("failed"), "error");
  assert.equal(extractionTone("stored_unparsed"), "warning");
});

test("extraction: a stored_only FORMAT that nevertheless has tasks reports the tasks' own outcome", () => {
  // The direction of error matters: if a lane ever does mint a task for a store-only format, the
  // panel must show what happened to it rather than claiming nothing was attempted.
  const s = state({
    byte_extraction: {
      capability: "stored_only", status: "failed",
      tasks: [{ id: "t", lane: "statement_parse", status: "failed", engine_id: "e", version_n: 1, attempt_count: 1, error_code: "header_unreadable", finished_at: null }],
    },
  });
  assert.equal(extractionVerdict(s), "failed");
});

test("facts: an unclassified document promises NOTHING either way", () => {
  const s = state({ capability: { kind_known: false }, facts: { capability: "unsupported" } });
  assert.equal(factsVerdict(s), "pending");
  assert.equal(factsTone("pending"), "info");
});

test("facts: stored_only is 'none for this type'; unsupported is 'cannot be read from this file'", () => {
  assert.equal(factsVerdict(state({ facts: { capability: "stored_only" } })), "unsupported_kind");
  assert.equal(factsVerdict(state({ facts: { capability: "unsupported" } })), "unsupported_format");
  assert.equal(factsVerdict(state({ facts: { capability: "planned" } })), "unsupported_kind",
    "an accepted-but-unbuilt target reads as 'none' today, never as a promise");
});

test("facts: a supported pair with nothing landed is NONE — a lane that exists is not a fact", () => {
  assert.equal(factsVerdict(state()), "none");
  assert.equal(
    factsVerdict(state({ facts: { extractions: [extraction({ status: "failed" })] } })),
    "none",
    "a failed facts extraction is not facts",
  );
  assert.equal(
    factsVerdict(state({ facts: { extractions: [extraction({ superseded_by: "later" })] } })),
    "none",
    "a superseded extraction is history, not the current reading",
  );
});

test("facts: landed-but-unchecked is PARTIAL, never validated — the placeholder-success line", () => {
  const s = state({ facts: { extractions: [extraction()], validations: [] } });
  assert.equal(factsVerdict(s), "partial");
  assert.equal(factsTone("partial"), "warning");
});

test("facts: an UNMEASURED check does not make facts validated", () => {
  const s = state({
    facts: { extractions: [extraction()], validations: [validation({ outcome: "unmeasured" })] },
  });
  assert.equal(factsVerdict(s), "partial",
    "unmeasured means no verdict exists; treating it as a pass would assert an arithmetic tie nobody computed");
  assert.equal(unmeasuredChecks(s).length, 1);
  assert.equal(failingChecks(s).length, 0);
});

test("facts: a FAIL outranks any number of passes, and the failing check is retrievable by name", () => {
  const s = state({
    facts: {
      extractions: [extraction()],
      validations: [
        validation({ check_name: "statement.printed_totals", outcome: "pass" }),
        validation({ check_name: "invoice.six_term_identity", outcome: "fail" }),
      ],
    },
  });
  assert.equal(factsVerdict(s), "invalid");
  assert.equal(factsTone("invalid"), "error");
  assert.deepEqual(failingChecks(s).map((v) => v.check_name), ["invoice.six_term_identity"]);
  assert.equal(landedFactsExtractions(s).length, 1,
    "the facts themselves stay listed — invalid facts remain visible (#624 acceptance 2)");
});

test("facts: a NOT_APPLICABLE check neither validates nor invalidates", () => {
  const s = state({
    facts: {
      extractions: [extraction()],
      validations: [validation({ check_name: "statement.printed_totals", outcome: "not_applicable" })],
    },
  });
  assert.equal(factsVerdict(s), "partial",
    "a check that does not apply to this source is not a pass");
});

test("facts: passes with no failures is VALIDATED, and only then", () => {
  const s = state({ facts: { extractions: [extraction()], validations: [validation()] } });
  assert.equal(factsVerdict(s), "validated");
  assert.equal(factsTone("validated"), "neutral",
    "even a clean result is stated, not celebrated — the word carries it, not a colour");
});

test("operation: an unsupported kind is NOT APPLICABLE, a legitimate resting state", () => {
  assert.equal(operationVerdict(state({ operation: { capability: "unsupported" } })), "not_applicable");
});

test("operation: a draft is CODED, an approved entry is POSTED, and a withdrawn one is neither", () => {
  assert.equal(operationVerdict(state()), "uncoded");
  assert.equal(
    operationVerdict(state({ operation: { entries: [{ entry_id: "e", status: "draft" }] } })),
    "coded",
  );
  assert.equal(
    operationVerdict(state({ operation: { entries: [{ entry_id: "e", status: "approved" }] } })),
    "posted",
  );
  assert.equal(
    operationVerdict(state({ operation: { entries: [{ entry_id: "e", status: "withdrawn" }] } })),
    "uncoded",
    "a withdrawn draft leaves the document uncoded — showing it as coded would hide real work",
  );
});

test("operation: a landed bank statement reads as the BANK lane, not as a journal entry", () => {
  const s = state({
    operation: {
      capability: "supported",
      statements: [{ statement_id: "s", status: "active", period_start: null, period_end: null, line_count: 12 }],
    },
  });
  assert.equal(operationVerdict(s), "reconciled",
    "a statement's lines post through the bank lane; the statement document itself never carries an entry");
});

test("capability limits are stable, sorted pairs — never raw JSON interpolated at a reader", () => {
  const cap = state({
    capability: { limits: { reader: "myinvois_ubl_only", invoice_line_items: "accepted_limitation" } },
  }).capability;
  assert.deepEqual(capabilityLimits(cap), [
    ["invoice_line_items", "accepted_limitation"],
    ["reader", "myinvois_ubl_only"],
  ]);
  assert.deepEqual(capabilityLimits({ ...cap, limits: {} }), []);
});
