// #633 AC3(b) — the four capability tiers on the INTAKE surfaces, resolved in the browser
// from ONE read of the already-granted global registry (`clara.document_capabilities`,
// 0191:200-214, `grant select … to clara_authenticated` 0191:271 under a
// `for select … using (true)` policy at :267-268).
//
// The defect being closed: a payroll PDF reads `extraction_status: done` on a list row
// while the detail panel says typed facts are unsupported for that kind. `done` alone is
// never facts support, and this module is what makes the list say so.
//
// TWO PROPERTIES THIS FILE EXISTS TO PIN:
//   1. an unresolvable mime or an UNSEEDED pair yields the honest unknown default, NEVER a
//      guessed tier (brief risk 5: if a format reaches the intake allowlist before the
//      registry does, the surface must fall back rather than silently mislabel);
//   2. the registry is read ONCE per mount and is never on the poll clock — it is a static
//      vocabulary with no tenant column, and a per-row `clara.get_document_state` would be
//      an N+1 under the user's JWT on the same hot path.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY_REGISTRY_COLS, buildCapabilityIndex, capabilityRegistryPath,
  readCapabilityRegistry, resolveCapability, type CapabilityRegistryRow,
} from "./capability-registry";
import type { SessionTokenAccessor } from "@/lib/session";

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
}

const row = (
  o: Partial<CapabilityRegistryRow> & Pick<CapabilityRegistryRow, "format" | "document_kind" | "mime_type">,
): CapabilityRegistryRow => ({
  custody: "supported", byte_extraction: "supported", typed_facts: "stored_only",
  business_operation: "stored_only", engine_id: null, engine_byte: null,
  registry_version: 1, basis: "seeded", limits: {}, ...o,
});

// A miniature of the live seed: three formats x a few kinds, with OFX's real store-only
// byte extraction and the payroll-PDF pair the defect is named after.
const ROWS: CapabilityRegistryRow[] = [
  row({
    format: "pdf", document_kind: "invoice", mime_type: "application/pdf",
    typed_facts: "supported", business_operation: "supported",
    engine_id: "llm-openai:gpt-5.6-terra:v2", engine_byte: "azure-di:prebuilt-layout:2024-11-30",
    limits: { invoice_line_items: "accepted_limitation", invoice_line_items_reason: "no_consumer_reads_line_facts" },
  }),
  row({
    format: "pdf", document_kind: "payroll_summary", mime_type: "application/pdf",
    typed_facts: "stored_only", business_operation: "unsupported",
    engine_byte: "azure-di:prebuilt-layout:2024-11-30",
  }),
  row({
    format: "pdf", document_kind: "consent_evidence", mime_type: "application/pdf",
    typed_facts: "unsupported", business_operation: "unsupported",
    engine_byte: "azure-di:prebuilt-layout:2024-11-30",
  }),
  row({
    format: "ofx", document_kind: "bank_statement", mime_type: "application/x-ofx",
    byte_extraction: "stored_only", typed_facts: "unsupported", business_operation: "stored_only",
    engine_byte: "clara-store-only:v1", limits: { opening_balance: "absent_in_format" },
  }),
  row({
    format: "ofx", document_kind: "invoice", mime_type: "application/x-ofx",
    byte_extraction: "stored_only", typed_facts: "stored_only", business_operation: "stored_only",
    engine_byte: "clara-store-only:v1",
  }),
  row({
    format: "xlsx", document_kind: "management_account",
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    typed_facts: "stored_only", business_operation: "unsupported", engine_byte: "clara-structured:v1",
  }),
];

test("the read names the global registry and projects exactly the published columns", () => {
  assert.equal(capabilityRegistryPath(), `document_capabilities?select=${CAPABILITY_REGISTRY_COLS}`);
  assert.deepEqual(CAPABILITY_REGISTRY_COLS.split(","), [
    "format", "document_kind", "mime_type", "custody", "byte_extraction",
    "typed_facts", "business_operation", "engine_id", "engine_byte",
    "registry_version", "basis", "limits",
  ]);
});

test("readCapabilityRegistry issues ONE wire read and no per-row get_document_state (never an N+1 on the poll clock)", async () => {
  const seen: string[] = [];
  const original = globalThis.fetch;
  const originalSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (url: string | URL | Request) => {
    seen.push(String(url));
    return new Response(JSON.stringify(ROWS), { status: 200 });
  }) as typeof fetch;
  try {
    const rows = await readCapabilityRegistry({ session: session() });
    assert.equal(rows.length, ROWS.length);
    assert.equal(seen.length, 1, "the registry is a SINGLE read");
    assert.ok((seen[0] ?? "").includes("document_capabilities"), seen[0]);
    assert.equal(seen.some((u) => u.includes("get_document_state")), false, "no per-row detail read");
  } finally {
    globalThis.fetch = original;
    if (originalSupabase === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabase;
  }
});

test("resolveCapability: a PAYROLL PDF publishes custody + byte extraction from the FORMAT and never reads `done` as facts support", () => {
  const index = buildCapabilityIndex(ROWS);
  const r = resolveCapability(index, "application/pdf", "payroll_summary");
  assert.equal(r.format, "pdf");
  assert.deepEqual(r.custody, { state: "level", level: "supported", limits: {} });
  assert.deepEqual(r.byteExtraction, { state: "level", level: "supported", limits: {} });
  assert.deepEqual(r.typedFacts, { state: "level", level: "stored_only", limits: {} });
  assert.deepEqual(r.businessOperation, { state: "level", level: "unsupported", limits: {} });
  assert.equal(r.knownPair, true);
  assert.equal(r.kindKnown, true);
});

test("resolveCapability: a NOT-YET-CLASSIFIED file publishes the two FORMAT-INTRINSIC tiers and names the other two 'needs classification'", () => {
  const index = buildCapabilityIndex(ROWS);
  const r = resolveCapability(index, "application/pdf", null);
  assert.equal(r.format, "pdf");
  assert.equal(r.kindKnown, false);
  // 0191's own column comments (:207-208): the intake lane does not know the kind yet, so
  // custody and byte extraction are format-intrinsic and publishable immediately.
  assert.deepEqual(r.custody, { state: "level", level: "supported", limits: {} });
  assert.deepEqual(r.byteExtraction, { state: "level", level: "supported", limits: {} });
  assert.deepEqual(r.typedFacts, { state: "needs_classification" });
  assert.deepEqual(r.businessOperation, { state: "needs_classification" });
});

test("resolveCapability: OFX publishes its HONEST store-only byte extraction the moment the mime is known (intake-lanes.mjs:45-51)", () => {
  const index = buildCapabilityIndex(ROWS);
  const unclassified = resolveCapability(index, "application/x-ofx", null);
  assert.equal(unclassified.format, "ofx");
  assert.deepEqual(unclassified.byteExtraction, { state: "level", level: "stored_only", limits: {} });
  assert.equal(unclassified.engineByte, "clara-store-only:v1");

  const statement = resolveCapability(index, "application/x-ofx", "bank_statement");
  assert.deepEqual(statement.typedFacts, {
    state: "level", level: "unsupported", limits: { opening_balance: "absent_in_format" },
  });
  assert.deepEqual(statement.businessOperation, { state: "level", level: "stored_only", limits: {} });
});

test("resolveCapability: an UNKNOWN mime claims nothing at all — four honest unknowns, never a guessed tier", () => {
  const index = buildCapabilityIndex(ROWS);
  for (const mime of [null, "", "application/zip", "APPLICATION/PDF; charset=utf-8"]) {
    const r = resolveCapability(index, mime, "invoice");
    assert.equal(r.format, null, `${String(mime)} must not resolve a format`);
    assert.deepEqual(r.custody, { state: "unknown" });
    assert.deepEqual(r.byteExtraction, { state: "unknown" });
    assert.deepEqual(r.typedFacts, { state: "unknown" });
    assert.deepEqual(r.businessOperation, { state: "unknown" });
  }
});

test("resolveCapability: a known format with an UNSEEDED kind falls to the unknown PAIR default for the kind-dependent tiers only", () => {
  const index = buildCapabilityIndex(ROWS);
  const r = resolveCapability(
    index,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "handwritten_note",
  );
  assert.equal(r.format, "xlsx");
  assert.equal(r.knownPair, false);
  assert.equal(r.kindKnown, true);
  // The format half is still true and is still published.
  assert.deepEqual(r.byteExtraction, { state: "level", level: "supported", limits: {} });
  // The pair half is not in the registry, so nothing is claimed for it.
  assert.deepEqual(r.typedFacts, { state: "unknown" });
  assert.deepEqual(r.businessOperation, { state: "unknown" });
});

test("buildCapabilityIndex: one canonical mime per format (0191:206) — a registry that ever broke that is reported, not silently collapsed", () => {
  const index = buildCapabilityIndex(ROWS);
  assert.deepEqual([...index.formatByMime.entries()].sort(), [
    ["application/pdf", "pdf"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
    ["application/x-ofx", "ofx"],
  ]);
  assert.deepEqual(index.mimeConflicts, []);

  const broken = buildCapabilityIndex([
    ...ROWS,
    row({ format: "pdf2", document_kind: "invoice", mime_type: "application/pdf" }),
  ]);
  assert.deepEqual(broken.mimeConflicts, ["application/pdf"]);
});

test("an empty registry read is an honest EMPTY, never a fabricated all-supported default", () => {
  const index = buildCapabilityIndex([]);
  const r = resolveCapability(index, "application/pdf", "invoice");
  assert.deepEqual(r.custody, { state: "unknown" });
  assert.deepEqual(r.typedFacts, { state: "unknown" });
  assert.equal(r.basis, null);
});
