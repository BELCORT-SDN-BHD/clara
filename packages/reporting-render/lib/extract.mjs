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

export const EXTRACTOR_NAME = "pdftotext (poppler-utils)";

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
 * `-layout` preserves the physical arrangement, which matters because a claim phrase split across
 * a table cell boundary should still read as one run of text; `-enc UTF-8` pins the encoding so
 * the extracted-text hash does not depend on the machine's locale; `-nopgbrk` keeps form feeds
 * out of the hashed text so pagination changes do not change the hash for the same content.
 */
export async function extractText(pdfPath, bin = process.env.CLARA_RENDER_PDFTOTEXT_BIN || "pdftotext") {
  const dir = await mkdtemp(join(tmpdir(), "clara-extract-"));
  try {
    const out = join(dir, "extracted.txt");
    await run(bin, ["-layout", "-enc", "UTF-8", "-nopgbrk", pdfPath, out],
      { env: { LC_ALL: "C" }, timeout: 120_000 });
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
