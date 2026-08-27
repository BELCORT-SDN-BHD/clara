import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractionStatusCopy, isEInvoice, filingBasisCopy, candidateRuleBandCopy, documentBadges,
  readErrorCopy, queueStateLabelKey, queueRecoveryLabelKey,
} from "./copy";
import type { DocumentRow } from "./types";
import type { WireErrorKind } from "@/lib/wire-error-kind";

test("extractionStatusCopy: held_egress reads 'awaiting egress approval'; every other status is verbatim", () => {
  assert.equal(extractionStatusCopy("held_egress"), "awaiting egress approval");
  assert.equal(extractionStatusCopy("done"), "done");
  assert.equal(extractionStatusCopy("failed"), "failed");
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

test("filingBasisCopy: every DB-named basis (including 'judgement') renders a distinct honest label", () => {
  const bases = ["human", "rule", "judgement", "correction", "legacy-0007", "seed-0007"] as const;
  const rendered = bases.map(filingBasisCopy);
  assert.equal(new Set(rendered).size, 5, "legacy-0007 and seed-0007 share one honest label by design");
  assert.match(filingBasisCopy("judgement"), /agent judgement/);
});

test("candidateRuleBandCopy: a named band, never a percentage", () => {
  assert.equal(candidateRuleBandCopy("name_exact"), "exact registered-name match");
  assert.equal(candidateRuleBandCopy("alias_exact"), "exact alias match");
});

test("documentBadges: omits every absent/false field, includes every present one", () => {
  const doc: DocumentRow = {
    id: "d1", sha256: "x".repeat(64), original_filename: "a.pdf", mime_type: "application/pdf",
    byte_size: 100, storage_path: "p", uploaded_by: "u1", created_at: "2026-01-01T00:00:00Z",
    bytes_verified_at: null, page_count: null, extraction_status: "pending", document_kind: null,
    financial_date: null, retention_state: "unanchored", retain_until: null, retention_basis: null,
    legal_hold: false, legal_hold_reason: null,
  };
  assert.deepEqual(documentBadges(doc), ["extraction: pending", "retention: unanchored"]);

  const full: DocumentRow = {
    ...doc, page_count: 3, document_kind: "invoice", financial_date: "2026-01-15",
    retention_state: "anchored", retain_until: "2033-01-15", legal_hold: true,
  };
  const badges = documentBadges(full);
  assert.deepEqual(badges, [
    "extraction: pending", "3 pages", "invoice", "date 2026-01-15",
    "retention: anchored → 2033-01-15", "legal hold",
  ]);
});

test("queueStateLabelKey: every state maps to a distinct KEY, never English text — 'error' branches by errorPhase", () => {
  const nonError = ["queued", "starting", "uploading", "verifying", "filing", "ready", "failed"] as const;
  for (const state of nonError) {
    const key = queueStateLabelKey({ state, errorPhase: null });
    assert.equal(typeof key, "string");
    assert.doesNotMatch(key, /\s/, "a next-intl key must never contain a rendered sentence");
  }
  assert.equal(queueStateLabelKey({ state: "error", errorPhase: "filing" }), "queueErrorFiling");
  assert.equal(queueStateLabelKey({ state: "error", errorPhase: "timeout" }), "queueErrorTimeout");
  assert.equal(queueStateLabelKey({ state: "error", errorPhase: "upload" }), "queueErrorUpload");
});

test("queueRecoveryLabelKey: null reason (the ordinary case) yields null; every named reason + an unknown default yield a distinct key", () => {
  assert.equal(queueRecoveryLabelKey(null), null);
  const keys = ["mime_mismatch", "attempt_cap", "lane_busy", "something_new_the_db_might_send"].map(queueRecoveryLabelKey);
  assert.equal(new Set(keys).size, 4);
});

test("readErrorCopy: no_session/forbidden/not_found each render their OWN distinct honest sentence", () => {
  const kinds: WireErrorKind[] = ["no_session", "unauthenticated", "forbidden", "not_found", "server_error", "transport", "malformed", "unexpected"];
  const rendered = kinds.map(readErrorCopy);
  assert.equal(new Set(rendered).size, kinds.length, "every kind must render a DISTINCT sentence — no shared 'something went wrong' bucket");
  assert.match(readErrorCopy("not_found"), /reachable today/);
  assert.match(readErrorCopy("forbidden"), /don't have access/);
  assert.match(readErrorCopy("no_session"), /not signed in/);
});
