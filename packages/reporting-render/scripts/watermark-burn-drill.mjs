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
// THE EXTRACTION MODE IS `-raw`, AND THAT WAS THIS DRILL'S OWN FIRST FINDING (measured 2026-09-02).
// The watermark is drawn rotated -30°, and poppler's `-layout` mode DROPS rotated text from its
// output entirely while the default mode emits it one glyph per line and in reverse reading order.
// Only `-raw` returns it as words. When the drill found that, `lib/extract.mjs`'s gate-3
// `extractText` was still on `-layout` — so the burned watermark sat outside both the claim scan
// and the sealed `extracted_text_sha256`. **Owner ruling 裁-136 (2026-09-02) folded the fix in
// here**, because no artifact is sealed live yet and that made it the only hash-migration-free
// moment. Arm D below is now the REGRESSION guard on that ruling rather than a report of a gap.
//
// SIX ARMS, AND THE SECOND IS WHAT MAKES THE FIRST MEAN ANYTHING:
//   A  watermark: true   -> the marker MUST appear in a `-raw` extraction of the produced bytes
//   B  watermark: false  -> it MUST NOT (so arm A is not matching something always present)
//   C  the annotation census -> the page's /Annots array must be EMPTY, so "it is in the content
//      stream" is measured rather than inferred from A alone
//   D  the SHIPPED gate-3 extractor (lib/extract.mjs's own extractText, CALLED — never a copy of
//      its flags, 裁-112) must see the marker too, and must NOT see it in the unwatermarked render
//   E  the shipped extractor's output is byte-identical across THREE runs of the same artifact
//   F  the SANDBOX family's watermark — a long ratified SENTENCE, not a three-word stamp — also
//      survives, because sentence-length rotated text is a different measurement from a stamp
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
// Exit 0 only when every arm passes.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { buildDrillDocument } from "./drill-fixture.mjs";
// THE SHIPPED EXTRACTOR ITSELF. Arms D and E execute the gate rather than a copy of its argument
// list: a drill that retyped the flags would go green against a product that had changed them.
import { extractText, EXTRACT_FLAGS } from "../lib/extract.mjs";

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
      path: out,
      bytes: readFileSync(out),
      raw: flat(run(PDFTOTEXT, ["-raw", "-enc", "UTF-8", "-nopgbrk", guest(out), "-"])),
      // The mode `-layout` USED to ship on. Kept as the control arm for 裁-136: it must still be
      // blind to the watermark, which is what makes the change to `-raw` a change that mattered.
      layout: flat(run(PDFTOTEXT, ["-layout", "-enc", "UTF-8", "-nopgbrk", guest(out), "-"])),
    };
  }

  /**
   * The SHIPPED extraction, run on THIS host. Returns the whitespace-flattened text — the form
   * lexicon.mjs's own `normalizeForMatch` reduces to before it matches a claim phrase.
   *
   * ON LINUX AND IN CI it calls `extractText` ITSELF, which is what 裁-112 asks for: the gate is
   * executed, not imitated.
   *
   * ON A WINDOWS HOST it cannot. `extractText` spawns the binary directly and hands it a Windows
   * temp path for its output; the extractor lives inside WSL and cannot write there, and there is
   * no place to insert the `wsl -e` hop without adding a product knob that exists only for a test.
   * So the drill runs the binary itself — but with `EXTRACT_FLAGS` IMPORTED FROM THE MODULE, never
   * retyped. The argument list is still the gate's own data, so a flag change moves this drill too;
   * what the Windows path does not exercise is `extractText`'s file handling, which is not the
   * thing under test here and is covered wherever this drill runs on Linux.
   */
  async function shipped(pdfPath) {
    if (!WSL) return flat(await extractText(pdfPath, PDFTOTEXT));
    return flat(run(PDFTOTEXT, [...EXTRACT_FLAGS, guest(pdfPath), "-"]));
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

  // --- ARM D (裁-136). The SHIPPED extractor must now SEE the marker, and must not see it without
  // the flag. This is the arm the ruling turned from a report into an assertion.
  say(`   the shipped extractor's flags: ${JSON.stringify([...EXTRACT_FLAGS])}`);
  const shippedWm = await shipped(armA.path);
  const shippedPlain = await shipped(armB.path);
  const dOk = shippedWm.includes(MARKER) && !shippedPlain.includes(MARKER);
  say(`D  the SHIPPED gate-3 extractor sees the marker: ${shippedWm.includes(MARKER)}`
    + `; absent from the unwatermarked render: ${!shippedPlain.includes(MARKER)}`);
  if (!dOk) { say("D  FAIL — the sealed extracted_text_sha256 does not cover the burned watermark"); failures += 1; }

  // THE CONTROL that makes arm D mean something: the mode it replaced is still blind. If `-layout`
  // ever started seeing the marker, arm D would pass for a reason that has nothing to do with the
  // change 裁-136 ruled.
  say(`   control — the RETIRED -layout mode still cannot see it: ${!armA.layout.includes(MARKER)}`);
  if (armA.layout.includes(MARKER)) {
    say("   FAIL — the control mode now sees it too, so arm D no longer discriminates"); failures += 1;
  }

  // --- ARM E. The hash this feeds is sealed for seven years, so "deterministic" is measured, not
  // assumed: three runs of the shipped extractor over the SAME artifact must agree byte for byte.
  const e1 = await shipped(armA.path);
  const e2 = await shipped(armA.path);
  const eOk = e1 === shippedWm && e2 === shippedWm;
  say(`E  three runs of the shipped extractor over one artifact agree: ${eOk}`);
  if (!eOk) { say("E  FAIL — the extraction is not reproducible, so the sealed hash is not either"); failures += 1; }

  // --- ARM F. THE SANDBOX FAMILY'S WATERMARK IS A SENTENCE, NOT A STAMP, and that is a different
  // measurement: a long rotated line wraps and breaks where the glyphs sit, so "a three-word stamp
  // survived" does not answer for it. The text is the owner-ratified `sandbox_watermark` en row,
  // seeded by migration 0132 §4 and reproduced here as a FIXTURE — this drill has no database, and
  // what is under test is the EXTRACTION, not the row.
  //
  // THE SANDBOX RENDERER DOES NOT EXIST YET (there is no sandbox-export worker; lib/layout-sandbox.mjs
  // has no production caller), so this arm burns the sentence into the same page background the
  // report family uses and asks the same question of it. It is evidence about the extraction mode,
  // NOT a claim that a sandbox export renders today.
  const SANDBOX_WATERMARK =
    "WORKING ANALYSIS — FOR DISCUSSION ONLY. Not an audited financial statement, not a statutory report.";
  {
    const src = join(stage, "sandbox.typ");
    const out = join(stage, "sandbox.pdf");
    writeFileSync(src,
      `#set page(paper: "a4", margin: 20mm, background: rotate(-30deg, block(width: 240mm, align(center,`
      + ` text(28pt, fill: rgb("#0000001f"), ${JSON.stringify(SANDBOX_WATERMARK)})))))\n`
      + `#set text(font: "DejaVu Sans", size: 10pt)\n`
      + `#par[#text("a sandbox-shaped body: prose and one substituted figure, 1,234.50")]\n`, "utf8");
    run(TYPST, ["compile", "--font-path", fontGuestDir, "--ignore-system-fonts", guest(src), guest(out)],
      { env: { ...process.env, SOURCE_DATE_EPOCH: String(EPOCH), TZ: "UTC", LC_ALL: "C" } });
    const seen = await shipped(out);
    const ok = seen.includes(flat(SANDBOX_WATERMARK));
    say(`F  the SANDBOX sentence survives the shipped extractor: ${ok}`);
    if (!ok) {
      say("F  FAIL — a sentence-length rotated watermark is not in the extraction, so the sandbox");
      say("     family's own burn would be outside the sealed hash even though the stamp is inside");
      failures += 1;
    }
  }

  say(failures === 0
    ? "\nWATERMARK BURN DRILL: PASS — the watermark is in the produced bytes' content stream, it is"
      + " absent without the flag, every /Annots array is empty, the SHIPPED gate-3 extractor now"
      + " covers it (裁-136) while the retired mode still cannot, three runs agree byte for byte,"
      + " and a sentence-length sandbox watermark survives the same way."
    : `\nWATERMARK BURN DRILL: FAIL — ${failures} arm(s) failed`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
process.exit(failures === 0 ? 0 : 1);
