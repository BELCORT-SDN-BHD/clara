// THE PINNED TEXT EXTRACTOR (Wave E lane ζ; design part2 §7 gate 3(b), §9's two added manifest
// keys).
//
// The gate-3 scan does the one thing that closes the gap between "what the renderer says it drew"
// and "what the artifact says": it extracts text FROM THE PRODUCED PDF BYTES and reads that. A
// raw byte scan proves nothing — page text lives in FlateDecode-compressed content streams and
// font subsetting routinely splits a phrase across separate Tj operators.
//
// TOOL: poppler-utils' `pdftotext`, installed at a pinned version in the renderer image.
//
// THE VERSION IS READ FROM THE TOOL, NOT DECLARED. §9 makes the extractor's name + EXACT version
// a REQUIRED manifest key beside the extracted-text sha256, because pinning is what makes the
// extraction reproducible seven years later — an unpinned extractor makes the scan's own result
// unrepeatable. A version copied into a constant is an assertion about the image; a version read
// from the binary is a measurement of it, and only one of those survives a base-image rebuild
// that nobody remembered to record.
//
// `pdftotext` writes its banner to STDERR, which is why this module reads stderr rather than
// stdout for the version and treats an empty read as a hard failure rather than as "no version".

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * THE EXTRACTION MODE, CHOSEN BY MEASUREMENT (owner ruling 裁-136, 2026-09-02).
 *
 * The flags are exported so the every-PR suite can pin them without a PDF, a binary or a container
 * — the mode is now part of what `extracted_text_sha256` MEANS, and a silent flag change would move
 * that hash for every future artifact with nothing going red.
 *
 * WHAT THE MAN PAGE SAYS (poppler's own words):
 *   `-layout` "Maintain (as best as possible) the original physical layout of the text."
 *   default   undoes physical layout and emits reading order.
 *   `-raw`    "Keep the text in content stream order."
 * It says NOTHING about rotated text — which is exactly why the choice was measured rather than
 * read off the documentation.
 *
 * WHAT WAS MEASURED (real Typst 0.12.0 output, real poppler, the product's own emission; the
 * question asked of the NORMALISED form, because lexicon.mjs's `normalizeForMatch` strips all
 * whitespace before it matches):
 *
 *   mode            watermark survives   absent w/o the flag   3 runs identical
 *   -layout         NO                   yes                   yes
 *   default         NO                   yes                   yes
 *   -bbox-layout    NO                   yes                   yes
 *   -raw            YES                  yes                   yes
 *
 * `-layout` drops the rotated page background entirely; the default mode emits its glyphs one per
 * line and in REVERSE reading order, so the phrase is not there either. Only `-raw` returns it as
 * words. Every mode is deterministic across runs and across a re-render, so determinism did not
 * decide it — survival did.
 *
 * AND `-raw` IS THE BETTER PIN ON ITS OWN TERMS. Content-stream order is a function of what the
 * renderer EMITTED; `-layout`'s output is a function of poppler's layout-reconstruction heuristics,
 * which are free to change between poppler versions under a hash we seal for seven years.
 *
 * THE REASON `-layout` WAS ORIGINALLY CHOSEN NO LONGER HOLDS, and that is worth stating rather than
 * leaving as an unexplained reversal. It was picked so "a claim phrase split across a table cell
 * boundary should still read as one run of text" — but the scan never sees layout: `normalizeForMatch`
 * removes every whitespace character before matching, so a phrase broken across cells, lines or
 * glyphs matches identically in all four modes. The old rationale was answering a question the
 * scanner does not ask.
 */
export const EXTRACT_MODE_FLAG = "-raw";
export const EXTRACT_FLAGS = Object.freeze([EXTRACT_MODE_FLAG, "-enc", "UTF-8", "-nopgbrk"]);

/**
 * THE MODE RIDES IN THE MANIFEST'S EXTRACTOR PIN, and it rides HERE rather than in manifest.mjs
 * because that module is `deployed: true` in frozen-workflows.json — constraint 9 makes its body
 * immutable, and `buildFinalManifest` composes the pin as `${name} ${version}`. Putting the mode in
 * the NAME is what lets a reader seven years out reproduce the hash without guessing which flags
 * produced it. `clara._report_manifest_key_shape` types `extraction_tool` as plain `text`, so the
 * longer string passes the seal's own validation unchanged (read from 0068:673, not assumed).
 */
export const EXTRACTOR_NAME = `pdftotext (poppler-utils) ${EXTRACT_MODE_FLAG}`;

/** The extractor's exact version, READ FROM THE BINARY. Absence is a hard failure. */
export async function extractorVersion(bin = process.env.CLARA_RENDER_PDFTOTEXT_BIN || "pdftotext") {
  let text = "";
  try {
    const { stdout, stderr } = await run(bin, ["-v"], { env: {}, timeout: 30_000 });
    text = `${stderr || ""}${stdout || ""}`;
  } catch (err) {
    // pdftotext -v exits non-zero on some builds while still printing its banner.
    text = `${err?.stderr || ""}${err?.stdout || ""}`;
  }
  const m = /pdftotext\s+version\s+(\S+)/i.exec(text);
  if (!m) {
    throw new Error(
      "the pinned text extractor reported no version; an unpinned extractor makes the gate-3 scan unrepeatable and must not be used",
    );
  }
  return m[1];
}

/**
 * Extract the page text of a PDF.
 *
 * `-raw` is the mode, and `EXTRACT_FLAGS` above carries the whole argument list plus the
 * measurement that chose it (裁-136). The other two flags are unchanged and still earn their place:
 * `-enc UTF-8` pins the encoding so the extracted-text hash does not depend on the machine's
 * locale, and `-nopgbrk` keeps form feeds out of the hashed text so a pagination change does not
 * move the hash for the same content.
 *
 * THE FLAGS COME FROM THE EXPORTED TUPLE, never retyped here. The every-PR suite pins that tuple,
 * and a second copy of the argument list is a second thing to keep in sync with the hash it
 * determines.
 */
export async function extractText(pdfPath, bin = process.env.CLARA_RENDER_PDFTOTEXT_BIN || "pdftotext") {
  const dir = await mkdtemp(join(tmpdir(), "clara-extract-"));
  try {
    const out = join(dir, "extracted.txt");
    await run(bin, [...EXTRACT_FLAGS, pdfPath, out], { env: { LC_ALL: "C" }, timeout: 120_000 });
    return await readFile(out, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The uncompressed metadata (§7(d)): the Info dictionary and the XMP packet. `pdfinfo` reports
 * the Info dictionary and, with -meta, the XMP. Both are scanned as text by the claim gate,
 * because a claim in Title/Subject/Keywords is a claim.
 *
 * An UNREADABLE metadata block is a REFUSAL, not an empty string: "we could not read the metadata"
 * and "the metadata contains no claim" are different facts, and only one of them is evidence.
 */
export async function extractMetadata(pdfPath, bin = process.env.CLARA_RENDER_PDFINFO_BIN || "pdfinfo") {
  const { stdout } = await run(bin, ["-meta", pdfPath], { env: { LC_ALL: "C" }, timeout: 60_000 });
  const text = String(stdout ?? "");
  if (text.trim() === "") {
    throw new Error("the produced PDF's metadata block read as empty; an unreadable metadata block is a refusal, not a clean scan");
  }
  return text;
}
