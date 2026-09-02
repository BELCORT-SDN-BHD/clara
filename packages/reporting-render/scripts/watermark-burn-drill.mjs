#!/usr/bin/env node
// THE WATERMARK BYTE-BURN DRILL (FS-7 echelon 2; sandbox-export-design.md §3.6a's "burned into
// the bytes, never an overlay a PDF editor can strip", and the same obligation on F-A5's own
// `draft_watermarked` lane).
//
// WHAT AN "OVERLAY" WOULD BE, AND WHY THE TEST IS AN EXTRACTION. A watermark added as a PDF
// ANNOTATION is a separate object in the file: a reader can delete it, and a text extractor that
// walks the CONTENT STREAM never sees it at all. A watermark drawn as page content is part of the
// stream the renderer emitted — a stripper has to edit the page, and an extractor finds it. So
// "is the watermark burned in?" has a mechanical answer: run the pinned extractor over the
// PRODUCED BYTES and look for the text.
//
// THE EXTRACTION MODE IS `-raw`, AND THAT IS THE DRILL'S OWN FIRST FINDING (measured 2026-09-02,
// not assumed). The watermark is drawn rotated -30°, and poppler's `-layout` mode — which is what
// lib/extract.mjs's gate-3 `extractText` uses — DROPS rotated text from its output entirely, while
// the default mode emits it one glyph per line. Only `-raw` returns it as words. A drill that had
// reached for the product's own extractor would therefore have reported "not burned" about a
// watermark that is demonstrably in the content stream: the absence would have been the
// INSTRUMENT's, not the document's. Arm D below records that divergence as a measurement rather
// than leaving it to be rediscovered.
//
// FOUR ARMS, AND THE SECOND IS WHAT MAKES THE FIRST MEAN ANYTHING:
//   A  watermark: true   -> the marker MUST appear in a `-raw` extraction of the produced bytes
//   B  watermark: false  -> it MUST NOT (so arm A is not matching something always present)
//   C  the annotation census -> the page's /Annots array must be EMPTY, so "it is in the content
//      stream" is measured rather than inferred from A alone
//   D  the SHIPPED gate-3 extractor's own view, REPORTED (never asserted): what `-layout` sees
//
// Arm B is the mutant. Without it, a drill that found the string in a filename, in the document
// metadata, or in a fixed template would report a burn that is not there.
//
// Usage:
//   node scripts/watermark-burn-drill.mjs
// Env (all optional; defaults are the deployed image's own paths):
//   CLARA_RENDER_TYPST_BIN      the pinned typst binary
//   CLARA_RENDER_PDFTOTEXT_BIN  the pinned extractor
//   CLARA_DRILL_FONT            a real font file to content-address and hand the engine
//   CLARA_DRILL_WSL             "1" to run the two binaries through `wsl -e` (a Windows dev box)
// Exit 0 only when arms A, B and C pass.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { buildDrillDocument } from "./drill-fixture.mjs";

const WSL = process.env.CLARA_DRILL_WSL === "1";
const TYPST = process.env.CLARA_RENDER_TYPST_BIN || "typst";
const PDFTOTEXT = process.env.CLARA_RENDER_PDFTOTEXT_BIN || "pdftotext";
const EPOCH = 1767139200; // 2025-12-31T00:00:00Z — a reporting-period end, never a clock read

/** Run one binary, through WSL when asked. Paths are passed already translated by `guest()`. */
function run(bin, args, opts = {}) {
  const [cmd, argv] = WSL ? ["wsl", ["-e", bin, ...args]] : [bin, args];
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) {
    throw new Error(`${bin} exited ${r.status}: ${(r.stderr || r.stdout || "").slice(0, 800)}`);
  }
  return r.stdout ?? "";
}

/** A Windows path as the WSL side sees it. Identity when not on WSL. */
function guest(p) {
  if (!WSL) return p;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}` : p.replace(/\\/g, "/");
}

/** Collapse every run of whitespace to one space. A rotated line breaks WHERE THE GLYPHS SIT, not
 *  where the words do, so a literal substring match against the raw extraction is a match against
 *  the layout rather than against the text. */
const flat = (s) => s.replace(/\s+/g, " ").trim();

const stage = mkdtempSync(join(tmpdir(), "clara-wm-burn-"));
let failures = 0;
const say = (line) => process.stdout.write(`${line}\n`);

try {
  // A REAL, CONTENT-ADDRESSED FONT. The engine runs with --ignore-system-fonts, so a font must be
  // handed to it explicitly; hashing the file here is the same discipline lib/fonts.mjs applies at
  // run time, done inline because this drill has no firm and no asset manifest.
  const fontSrc = process.env.CLARA_DRILL_FONT || "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  const fontDir = join(stage, "fonts");
  mkdirSync(fontDir, { recursive: true });
  let fontGuestDir = guest(fontDir);
  if (existsSync(fontSrc)) {
    copyFileSync(fontSrc, join(fontDir, basename(fontSrc)));
    say(`font: ${basename(fontSrc)} sha256=${createHash("sha256")
      .update(readFileSync(join(fontDir, basename(fontSrc)))).digest("hex").slice(0, 16)}…`);
  } else if (WSL) {
    // The font lives inside the guest and this process cannot read it to hash it. Point the engine
    // at the guest directory directly and SAY SO — an unhashed font is a weaker claim than a
    // hashed one and the drill must not let that pass silently.
    fontGuestDir = "/usr/share/fonts/truetype/dejavu";
    say("font: the guest's own DejaVu directory (NOT hashed by this process — stated, not hidden)");
  } else {
    throw new Error(`no font at ${fontSrc}; set CLARA_DRILL_FONT`);
  }

  /** Compile one arm and return its bytes plus two extractions. */
  function renderArm(name, watermark) {
    const built = buildDrillDocument({ watermark, fontFamily: "DejaVu Sans" });
    const src = join(stage, `${name}.typ`);
    const out = join(stage, `${name}.pdf`);
    writeFileSync(src, built.typst, "utf8");
    run(TYPST, ["compile", "--font-path", fontGuestDir, "--ignore-system-fonts", guest(src), guest(out)],
      { env: { ...process.env, SOURCE_DATE_EPOCH: String(EPOCH), TZ: "UTC", LC_ALL: "C" } });
    return {
      bytes: readFileSync(out),
      raw: flat(run(PDFTOTEXT, ["-raw", "-enc", "UTF-8", "-nopgbrk", guest(out), "-"])),
      // The SHIPPED gate-3 flags, verbatim from lib/extract.mjs's extractText.
      layout: flat(run(PDFTOTEXT, ["-layout", "-enc", "UTF-8", "-nopgbrk", guest(out), "-"])),
    };
  }

  // The report family's own watermark wording. Kept to the invariant half of the three strings
  // layout.mjs can emit ("DRAFT — NOT FOR ISSUE" / "DRAFT — CHECKS FAILED — NOT FOR ISSUE" /
  // "UNCERTIFIED — NOT FOR ISSUE"), so the drill measures the burn rather than which of the three
  // this fixture happened to select.
  const MARKER = "NOT FOR ISSUE";

  const armA = renderArm("watermarked", true);
  const armB = renderArm("plain", false);

  const burned = armA.raw.includes(MARKER);
  say(`A  watermark:true   → "${MARKER}" in the -raw extraction: ${burned}   (${armA.bytes.length} bytes)`);
  if (!burned) { say("A  FAIL — the watermark is not in the content stream of the produced PDF"); failures += 1; }

  const clean = !armB.raw.includes(MARKER);
  say(`B  watermark:false  → marker ABSENT: ${clean}   (${armB.bytes.length} bytes)`);
  if (!clean) { say("B  FAIL — the marker appears without the flag, so arm A proves nothing"); failures += 1; }

  // /Annots is the object family a PDF editor deletes. Typst emits the KEY on every page; what
  // matters is that the ARRAY is empty — the key's presence is not an annotation layer, and a
  // drill that read the key alone would have failed a file that carries no annotation at all.
  const raw = armA.bytes.toString("latin1");
  const annots = [...raw.matchAll(/\/Annots\s*(\[[^\]]*\])/g)].map((m) => m[1].trim());
  const allEmpty = annots.length > 0 && annots.every((a) => a === "[]");
  say(`C  /Annots arrays: ${annots.length} found, all empty: ${allEmpty}  ${JSON.stringify(annots.slice(0, 3))}`);
  if (!allEmpty) { say("C  FAIL — the file carries a non-empty annotation layer; a watermark there is strippable"); failures += 1; }

  const differ = createHash("sha256").update(armA.bytes).digest("hex")
    !== createHash("sha256").update(armB.bytes).digest("hex");
  say(`   the two arms differ in bytes: ${differ}`);
  if (!differ) { say("   FAIL — the watermark flag did not move the bytes at all"); failures += 1; }

  // --- ARM D. REPORTED, NEVER ASSERTED. This is what lib/extract.mjs's own flags see, and the
  // gap it names is a finding for the owner, not something this drill may quietly redefine: the
  // gate-3 claim scan and the sealed `extracted_text_sha256` are both computed over THIS view, so
  // any text drawn rotated — the watermark today, a house-style flourish tomorrow — is outside
  // what the scan can read. Changing extractText's flags changes the sealed hash of every future
  // artifact, which is a determinism decision and not this drill's to make.
  say(`D  REPORTED: the SHIPPED gate-3 extractor (-layout) sees the marker: ${armA.layout.includes(MARKER)}`);
  say("   → rotated page-background text is outside what -layout extracts, so the gate-3 claim");
  say("     scan and extracted_text_sha256 do not cover it. Named for the owner; not changed here.");

  say(failures === 0
    ? "\nWATERMARK BURN DRILL: PASS — the watermark is in the produced bytes' content stream, it is absent without the flag, and every /Annots array is empty."
    : `\nWATERMARK BURN DRILL: FAIL — ${failures} arm(s) failed`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
process.exit(failures === 0 ? 0 : 1);
