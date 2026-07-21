// Wave A — the document-bytes route (PIN-DELTA-4) authz-SHAPE logic (no DB, no world). The
// route module (.ts) is loaded through tsx's ESM loader; only the pure exported helpers are
// exercised (id shape + the error->status mapping), so the indistinguishable-404 discipline
// and the fail-closed status map are proven without a server. The end-to-end stream + the
// get_document_for_human_read definer read are exercised in wave-a-autodraft-db (skip-gated).

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const route = await import("../src/documentRoutes.ts");
const { AuthError } = await import("../lib/authz.mjs");
const { StorageError } = await import("../lib/storage.mjs");
const { isDocumentId, documentRouteStatus } = route;

test("isDocumentId accepts a well-formed uuid and rejects everything else", () => {
  assert.equal(isDocumentId("11111111-1111-1111-1111-111111111111"), true);
  assert.equal(isDocumentId("not-a-uuid"), false);
  assert.equal(isDocumentId(""), false);
  assert.equal(isDocumentId(undefined), false);
  assert.equal(isDocumentId(12345), false);
});

test("documentRouteStatus: an AuthError passes through its status + code (401 no_bearer, 404 not_found)", () => {
  assert.deepEqual(documentRouteStatus(new AuthError(401, "no_bearer", "x")), { status: 401, code: "no_bearer" });
  assert.deepEqual(documentRouteStatus(new AuthError(403, "no_membership", "x")), { status: 403, code: "no_membership" });
  assert.deepEqual(documentRouteStatus(new AuthError(404, "not_found", "not found")), { status: 404, code: "not_found" });
});

test("documentRouteStatus: CLR11/CLR03 collapse to an indistinguishable 404 (no existence oracle)", () => {
  assert.deepEqual(documentRouteStatus({ code: "CLR11" }), { status: 404, code: "not_found" });
  assert.deepEqual(documentRouteStatus({ code: "CLR03" }), { status: 404, code: "not_found" });
});

test("documentRouteStatus: a Storage fault is 502; anything else is a generic 500 (no leak)", () => {
  assert.deepEqual(documentRouteStatus(new StorageError("storage_error", "Storage read failed")), { status: 502, code: "storage_error" });
  assert.deepEqual(documentRouteStatus(new Error("select * from clara.documents")), { status: 500, code: "internal" });
});
