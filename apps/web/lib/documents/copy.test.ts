import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractionStatusKey, isEInvoice, filingBasisKey, candidateRuleBandKey, documentBadges,
  readErrorKey, queueStateLabelKey, queueRecoveryLabelKey,
} from "./copy";
import type { DocumentRow, ExtractionStatus } from "./types";
import type { WireErrorKind } from "@/lib/wire-error-kind";

// Independent review 2026-08-27, N12: every copy.ts function returns a next-intl
// KEY, never English text — these tests assert on the KEY shape/distinctness, not
// on any rendered wording (that lives in messages/en.json, out of this module's
// remit entirely).

test("extractionStatusKey: every ExtractionStatus value maps to its OWN distinct key", () => {
  const statuses: ExtractionStatus[] = ["pending", "running", "done", "failed", "skipped_structured_done", "stored_unparsed", "held_egress"];
  const keys = statuses.map(extractionStatusKey);
  assert.equal(new Set(keys).size, statuses.length);
  assert.equal(extractionStatusKey("held_egress"), "extractionStatus.held_egress");
});

test("isEInvoice: true for e_invoice_xml kind, stored_unparsed status, or an xml mime — false otherwise", () => {
  const base: Pick<DocumentRow, "extraction_status" | "document_kind" | "mime_type"> = {
    extraction_status: "done", document_kind: null, mime_type: "application/pdf",
  };
  assert.equal(isEInvoice(base), false);
  assert.equal(isEInvoice({ ...base, document_kind: "e_invoice_xml" }), true);
  assert.equal(isEInvoice({ ...base, extraction_status: "stored_unparsed" }), true);
  assert.equal(isEInvoice({ ...base, mime_type: "application/XML" }), true);
});

test("filingBasisKey: every DB-named basis (including 'judgement') maps to a distinct key; legacy-0007/seed-0007 share one by design", () => {
  const bases = ["human", "rule", "judgement", "correction", "legacy-0007", "seed-0007"] as const;
  const keys = bases.map(filingBasisKey);
  assert.equal(new Set(keys).size, 5, "legacy-0007 and seed-0007 share one key by design");
  assert.equal(filingBasisKey("judgement"), "filingBasis.judgement");
});

test("candidateRuleBandKey: a named band key, never a percentage or English text", () => {
  assert.equal(candidateRuleBandKey("name_exact"), "candidateRuleBand.name_exact");
  assert.equal(candidateRuleBandKey("alias_exact"), "candidateRuleBand.alias_exact");
});

function baseDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: "d1", sha256: "x".repeat(64), original_filename: "a.pdf", mime_type: "application/pdf",
    byte_size: 100, storage_path: "p", uploaded_by: "u1", created_at: "2026-01-01T00:00:00Z",
    bytes_verified_at: null, page_count: null, extraction_status: "pending", document_kind: null,
    financial_date: null, retention_state: "unanchored", retain_until: null, retention_basis: null,
    legal_hold: false, legal_hold_reason: null, ...overrides,
  };
}

test("documentBadges: omits every absent/false field, includes every present one, as STRUCTURED entries", () => {
  const bare = documentBadges(baseDoc());
  assert.deepEqual(bare, [
    { kind: "extraction", statusKey: "extractionStatus.pending" },
    { kind: "retention", state: "unanchored", until: null },
  ]);

  const full = documentBadges(baseDoc({
    page_count: 3, document_kind: "invoice", financial_date: "2026-01-15",
    retention_state: "anchored", retain_until: "2033-01-15", legal_hold: true,
  }));
  assert.deepEqual(full, [
    { kind: "extraction", statusKey: "extractionStatus.pending" },
    { kind: "pageCount", count: 3 },
    { kind: "documentKind", value: "invoice" },
    { kind: "financialDate", date: "2026-01-15" },
    { kind: "retention", state: "anchored", until: "2033-01-15" },
    { kind: "legalHold" },
  ]);
});

test("documentBadges: an e-invoice document gets the eInvoice badge, no raw text baked in", () => {
  const badges = documentBadges(baseDoc({ document_kind: "e_invoice_xml" }));
  assert.ok(badges.some((b) => b.kind === "eInvoice"));
  assert.ok(badges.some((b) => b.kind === "documentKind" && b.value === "e_invoice_xml"));
});

test("queueStateLabelKey: every state maps to a distinct KEY, never English text — 'error' branches by errorPhase", () => {
  const nonError = ["queued", "starting", "uploading", "verifying", "filing", "ready", "failed"] as const;
  const keys = nonError.map((state) => queueStateLabelKey({ state, errorPhase: null }));
  assert.equal(new Set(keys).size, nonError.length);
  for (const key of keys) assert.doesNotMatch(key, /\s/, "a next-intl key must never contain a rendered sentence");

  assert.equal(queueStateLabelKey({ state: "error", errorPhase: "filing" }), "queueErrorFiling");
  assert.equal(queueStateLabelKey({ state: "error", errorPhase: "timeout" }), "queueErrorTimeout");
  assert.equal(queueStateLabelKey({ state: "error", errorPhase: "upload" }), "queueErrorUpload");
});

test("queueRecoveryLabelKey: null reason (the ordinary case) yields null; every named reason + an unknown default yield a distinct key", () => {
  assert.equal(queueRecoveryLabelKey(null), null);
  const keys = ["mime_mismatch", "attempt_cap", "lane_busy", "something_new_the_db_might_send"].map(queueRecoveryLabelKey);
  assert.equal(new Set(keys).size, 4);
});

test("readErrorKey: every WireErrorKind maps to its OWN distinct key — no_session/forbidden/not_found included", () => {
  const kinds: WireErrorKind[] = ["no_session", "unauthenticated", "forbidden", "not_found", "server_error", "transport", "malformed", "unexpected"];
  const keys = kinds.map(readErrorKey);
  assert.equal(new Set(keys).size, kinds.length, "every kind must map to a DISTINCT key — no shared bucket");
  assert.equal(readErrorKey("not_found"), "readError.not_found");
  assert.equal(readErrorKey("forbidden"), "readError.forbidden");
  assert.equal(readErrorKey("no_session"), "readError.no_session");
});
