// WAVE E / FINDING F9 — the shared kit for the autoDraft_v7 and chatTurn_v10 suites.
// NOT a test file (node --test's default patterns do not match `-testkit.mjs`).
//
// WHAT THE FIDELITY INSTRUMENT HERE CLAIMS, AND WHAT IT DOES NOT — stated up front so no
// reader over-reads it. `cutLines` DELETES a declared span from each side and then the
// suites compare what is left with plain string equality. So:
//   * EVERY byte OUTSIDE a declared span is compared literally, both directions. A
//     smuggled change anywhere else fails.
//   * Each declared span is pinned by its FIRST line, its LAST line, and its EXACT line
//     count (blank-line tails included) — so content cannot be added to a span without
//     changing its length, and a span cannot silently move or vanish.
//   * What a span's INTERIOR contains is NOT proven by this instrument. That is
//     deliberate and is covered a different way: every span in these closures is either
//     model-facing TEXT (pinned separately, exactly, by the golden-string cells) or
//     EXECUTABLE code (`resolveEvidenceRegions` and its call site), exercised directly by
//     the behavioural cells. The mask is the fidelity claim; behaviour is the correctness
//     claim; neither is asked to do the other's job.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Read a workflow source file. */
export const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");

/** Drop the top-of-file block comment: it legitimately narrates each version's delta so it
 *  is EXPECTED to diverge; only the code from the first REAL import statement onward is
 *  compared (the family's own dropHeader idiom). */
export function dropHeader(text) {
  const m = /^import /m.exec(text);
  assert.ok(m, "a real import statement must be present");
  return text.slice(m.index);
}

/** Rename version tokens across a body. `pairs` is applied in order, so multi-digit
 *  versions (v10) must be listed before any prefix of themselves. */
export function rename(text, pairs) {
  let out = text;
  for (const [from, to] of pairs) out = out.split(from).join(to);
  return out;
}

/**
 * Delete declared spans from `text`, in order, asserting each one's shape.
 *
 * Each cut is `{ label, from, to, lines, trailingBlanks? }` where `from`/`to` are EXACT
 * full lines (indentation included), `lines` is the exact number of lines the span
 * occupies INCLUDING any `trailingBlanks` consumed after the `to` line.
 *
 * Cuts are matched in the order given, each scanning forward from the previous one — so a
 * repeated anchor line is unambiguous and a cut that has moved before its predecessor
 * fails rather than silently matching a later occurrence.
 */
export function cutLines(text, cuts) {
  const lines = text.split("\n");
  const out = [];
  const pending = [...cuts];
  let i = 0;
  while (i < lines.length) {
    const cut = pending[0];
    if (cut && lines[i] === cut.from) {
      let j = i;
      while (j < lines.length && lines[j] !== cut.to) j++;
      assert.ok(j < lines.length, `cut "${cut.label}": start anchor found at line ${i + 1} but the end anchor was never reached`);
      const blanks = cut.trailingBlanks ?? 0;
      for (let b = 0; b < blanks; b++) {
        assert.equal(lines[j + 1], "", `cut "${cut.label}": expected ${blanks} trailing blank line(s) after its end anchor`);
        j++;
      }
      assert.equal(j - i + 1, cut.lines, `cut "${cut.label}" spans ${j - i + 1} lines (expected exactly ${cut.lines}) — content was added to or removed from a masked span`);
      pending.shift();
      i = j + 1;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  assert.deepEqual(pending.map((c) => c.label), [], "every declared cut must have been found, in order");
  return out.join("\n");
}

/** A single-line cut (the common shape on the OLD side of a delta). */
export const line = (label, text) => ({ label, from: text, to: text, lines: 1 });

// ===========================================================================
// The stub pool rig. Mirrors wave-7a-autodraft-v6.test.mjs's own stubPools, with ONE
// addition: the get_document_extract read returns a caller-supplied extract instead of
// always null, because F9's whole subject is what the wrapper does with those regions.
// ===========================================================================

/**
 * @param {unknown} extract  what the server-side get_document_extract read returns.
 * @returns {{ params: unknown[] | null, reads: string[] }} a live capture of the writer's
 *   params (null until the writer is actually reached — the "no DB roundtrip" assertions
 *   depend on that staying null).
 */
export function stubPools(extract = null) {
  const write = { params: null, reads: [] };
  const readClient = {
    query: async (sql) => {
      write.reads.push(sql);
      if (/from clara\.document_filings/.test(sql)) return { rows: [{ sha256: "sha-abc", filing_id: "fil-1", resolution_id: "res-1" }], rowCount: 1 };
      if (/get_context_pack/.test(sql)) return { rows: [{ pack: { books_version: 7 } }], rowCount: 1 };
      if (/get_document_extract/.test(sql)) return { rows: [{ x: extract }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  const writeClient = {
    query: async (_sql, params) => {
      write.params = params;
      return { rows: [{ receipt: { entry_id: "entry-9", revision_token: "rev-9" } }], rowCount: 1 };
    },
  };
  const mintClient = { query: async () => ({ rows: [{ credential_id: "cred", secret: "s3cr3t" }], rowCount: 1 }) };
  globalThis.__claraPools = {
    withRuntime: async (fn) => fn(mintClient),
    withReadWakeScoped: async (_secret, fn) => fn(readClient),
    withWriteWakeScoped: async (_secret, fn) => fn(writeClient),
    // chatTurn's infra mints OBO the initiator through these two names instead.
    mintWakeCredential: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    mintWakeCredentialObo: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
  };
  return write;
}

/** The uuids the fixtures cite. Deliberately NOT sequential-looking: a resolution that
 *  accidentally worked by array position must not also look right by id. */
export const REGION_TOTAL = "7770763e-56c0-4fce-a641-0cf54d2edf31"; // the real F9 region id
export const REGION_VENDOR = "1c1c1c1c-2d2d-4e4e-8f8f-909090909090";
export const REGION_DATE = "abababab-cdcd-4efe-8a8a-b1b1b1b1b1b1";

/**
 * A get_document_extract shape whose ARRAY ORDER IS NOT idx ORDER. This is the fixture the
 * "by field, not by position" claim rests on: element[0] carries idx 3, so any resolver
 * that indexes the array would map region_idx 1 to the wrong region — and, because the
 * quote would then not be found in that region's text, would have re-created F9 in a new
 * disguise instead of fixing it.
 */
export const SCRAMBLED_EXTRACT = {
  regions: [
    { idx: 3, id: REGION_DATE, field_path: "invoice.invoice_date", text_content: "2026-01-31", engine_kind: "invoice_facts", version_n: 1 },
    { idx: 1, id: REGION_VENDOR, field_path: "invoice.vendor_name", text_content: "ACME SDN BHD", engine_kind: "invoice_facts", version_n: 1 },
    { idx: 2, id: REGION_TOTAL, field_path: "invoice.total", text_content: "RM 1,000.00", engine_kind: "invoice_facts", version_n: 1 },
  ],
};

/** Two balanced lines — the shape both draft schemas accept. */
export const LINES = [
  { account_code: "600-000", debit_cents: 100000, credit_cents: 0 },
  { account_code: "400-000", debit_cents: 0, credit_cents: 100000 },
];
