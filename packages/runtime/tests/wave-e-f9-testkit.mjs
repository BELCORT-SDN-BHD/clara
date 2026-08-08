// WAVE E / FINDING F9 — the shared kit for the autoDraft_v7 and chatTurn_v10 suites.
// NOT a test file (node --test's default patterns do not match `-testkit.mjs`).
//
// WHAT THE FIDELITY INSTRUMENTS HERE CLAIM, AND WHAT THEY DO NOT — stated up front so no
// reader over-reads them.
//   * `cutLines` deletes a declared span from each side and the suites compare what is left
//     with plain string equality. Every byte OUTSIDE a span is compared literally; each span
//     is pinned by its first line, its last line, and its exact line count. What a span's
//     INTERIOR contains is NOT proven by it. Used only where the delta is small and the
//     interior is model-facing TEXT that is separately pinned exactly (prompt.ts), or where
//     the claim is "purely additive" (errors.ts).
//   * `slice` extracts a NAMED region by anchors so the suites can assert the CARRIED parts
//     of a heavily-changed file are byte-identical to their predecessor. After the F9 fix
//     round, tools.ts's evidence path is a rewrite, not a delta — masking it would be a
//     mask over most of the interesting file, so the suites assert the carried regions
//     positively instead and cover the new ones by EXECUTION.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");

/** Drop the top-of-file block comment (it legitimately narrates each version's delta). */
export function dropHeader(text) {
  const m = /^import /m.exec(text);
  assert.ok(m, "a real import statement must be present");
  return text.slice(m.index);
}

export function rename(text, pairs) {
  let out = text;
  for (const [from, to] of pairs) out = out.split(from).join(to);
  return out;
}

/** Extract the text from `from` (inclusive) to `to` (exclusive), by exact substring anchors. */
export function slice(text, from, to, label) {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `slice "${label}": start anchor not found`);
  const b = text.indexOf(to, a + from.length);
  assert.ok(b > a, `slice "${label}": end anchor not found after the start`);
  return text.slice(a, b);
}

/** Extract a named function, from its own doc-comment (when it has one) through the first
 *  line that is exactly `}` — i.e. the whole declaration, comment included, so a silently
 *  reworded comment on a "carried" function fails too. */
export function fnBody(text, name) {
  const lines = text.split("\n");
  const sig = lines.findIndex((l) => l.startsWith(`export function ${name}(`) || l.startsWith(`function ${name}(`));
  assert.ok(sig >= 0, `fnBody: ${name} not found`);
  let start = sig;
  while (start > 0 && (lines[start - 1].startsWith(" *") || lines[start - 1].startsWith("/**"))) start--;
  const end = lines.findIndex((l, i) => i > sig && l === "}");
  assert.ok(end > sig, `fnBody: ${name} never closes at column 0`);
  return lines.slice(start, end + 1).join("\n");
}

/** Delete declared spans, in order, asserting each one's shape (see the header). */
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
      assert.ok(j < lines.length, `cut "${cut.label}": start anchor at line ${i + 1} but the end anchor was never reached`);
      const blanks = cut.trailingBlanks ?? 0;
      for (let b = 0; b < blanks; b++) {
        assert.equal(lines[j + 1], "", `cut "${cut.label}": expected ${blanks} trailing blank line(s)`);
        j++;
      }
      assert.equal(j - i + 1, cut.lines, `cut "${cut.label}" spans ${j - i + 1} lines (expected ${cut.lines}) — content was added to or removed from a masked span`);
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

export const line = (label, text) => ({ label, from: text, to: text, lines: 1 });

// ===========================================================================
// The stub pool rig. Extended for the fix round: get_document_extract can return a
// DIFFERENT payload on each successive call, which is the only way to exercise the drift
// the snapshot gate exists to catch — the first cut's stub returned one fixed extract for
// every read, which is precisely why its battery could not see the defect (Codex #5).
// ===========================================================================

/**
 * @param {unknown|unknown[]} extracts one payload, or a queue consumed one call at a time
 *   (the last entry repeats once the queue is exhausted).
 */
export function stubPools(extracts = null) {
  const queue = Array.isArray(extracts) ? [...extracts] : [extracts];
  const state = { params: null, extractCalls: 0, writes: 0 };
  const nextExtract = () => {
    const x = queue.length > 1 ? queue.shift() : queue[0];
    state.extractCalls += 1;
    return x;
  };
  const readClient = {
    query: async (sql) => {
      if (/from clara\.document_filings/.test(sql)) return { rows: [{ sha256: "sha-abc", filing_id: "fil-1", resolution_id: "res-1" }], rowCount: 1 };
      if (/get_context_pack/.test(sql)) return { rows: [{ pack: { books_version: 7 } }], rowCount: 1 };
      if (/get_document_extract/.test(sql)) return { rows: [{ x: nextExtract() }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  const writeClient = {
    query: async (_sql, params) => {
      state.params = params;
      state.writes += 1;
      return { rows: [{ receipt: { entry_id: "entry-9", revision_token: "rev-9" } }], rowCount: 1 };
    },
  };
  const mintClient = { query: async () => ({ rows: [{ credential_id: "cred", secret: "s3cr3t" }], rowCount: 1 }) };
  globalThis.__claraPools = {
    withRuntime: async (fn) => fn(mintClient),
    withReadWakeScoped: async (_secret, fn) => fn(readClient),
    withWriteWakeScoped: async (_secret, fn) => fn(writeClient),
    mintWakeCredential: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    mintWakeCredentialObo: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
  };
  return state;
}

export const REGION_TOTAL = "7770763e-56c0-4fce-a641-0cf54d2edf31"; // the real F9 region id
export const REGION_VENDOR = "1c1c1c1c-2d2d-4e4e-8f8f-909090909090";
export const REGION_DATE = "abababab-cdcd-4efe-8a8a-b1b1b1b1b1b1";
export const REGION_DRIFT = "deadbeef-1111-4222-8333-444455556666";
export const EXT_OCR = "e0000000-0000-4000-8000-00000000000a";
export const EXT_FACTS = "e0000000-0000-4000-8000-00000000000b";

const region = (idx, id, field_path, text_content, extraction_id = EXT_OCR) => ({
  idx,
  id,
  extraction_id,
  version_n: 1,
  engine_kind: extraction_id === EXT_FACTS ? "invoice_facts" : "ocr",
  field_path,
  text_content,
});

/**
 * The snapshot the model reads. Its ARRAY ORDER IS NOT ITS idx ORDER — a resolver that
 * indexed the array would map idx 1 to the wrong region, so the "by field, not by position"
 * claim is under test on every use of this fixture.
 */
export const READ_EXTRACT = {
  regions: [
    region(3, REGION_DATE, "invoice.invoice_date", "2026-01-31"),
    region(1, REGION_VENDOR, "invoice.vendor_name", "ACME SDN BHD"),
    region(2, REGION_TOTAL, "invoice.total", "RM 1,000.00"),
  ],
};

/**
 * THE DRIFT FIXTURE (native reviewer Finding 1, reproduced on a rig before the fix). An
 * `invoice_facts` extraction has landed between the model's read and the draft call. Because
 * the DB ordinal sorts by (engine_kind, version_n, id) and 'invoice_facts' < 'ocr', EVERY
 * index is renumbered — and idx 2, which the model read as the OCR `invoice.total` region,
 * now names a DIFFERENT extraction's region carrying THE SAME TEXT. The wall cannot see the
 * difference: the quote really is a substring of the region it is handed.
 */
export const DRIFTED_EXTRACT = {
  regions: [
    region(1, REGION_DRIFT, "invoice.currency", "MYR", EXT_FACTS),
    region(2, "cafe0000-0000-4000-8000-00000000000c", "invoice.total", "RM 1,000.00", EXT_FACTS),
    region(3, REGION_DATE, "invoice.invoice_date", "2026-01-31"),
    region(4, REGION_VENDOR, "invoice.vendor_name", "ACME SDN BHD"),
    region(5, REGION_TOTAL, "invoice.total", "RM 1,000.00"),
  ],
};

/** A snapshot in which the SAME short quote appears in two regions of ONE set — the residual
 *  the uuid era also had. Resolution binds by idx to the region the model read; the quote
 *  collision changes nothing, which is the point of the cell that uses it. */
export const COLLIDING_EXTRACT = {
  regions: [
    region(1, REGION_TOTAL, "invoice.total", "RM 1,000.00"),
    region(2, REGION_DRIFT, "invoice.amount_due", "RM 1,000.00"),
  ],
};

/** The pre-0054 shape: regions with ids, no ordinal at all. */
export const PRE_0054_EXTRACT = {
  regions: [
    { id: REGION_VENDOR, extraction_id: EXT_OCR, field_path: "invoice.vendor_name", text_content: "ACME SDN BHD" },
    { id: REGION_TOTAL, extraction_id: EXT_OCR, field_path: "invoice.total", text_content: "RM 1,000.00" },
  ],
};

export const LINES = [
  { account_code: "600-000", debit_cents: 100000, credit_cents: 0 },
  { account_code: "400-000", debit_cents: 0, credit_cents: 100000 },
];

/** A cited fact in the post-fix shape (field_path is REQUIRED and echoes the region's own). */
export const cite = (region_idx, quote, field_path) => ({ region_idx, quote, field_path });
