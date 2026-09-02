// THE EXTRACTION MODE, PINNED (owner ruling 裁-136, 2026-09-02).
//
// WHY THIS FILE EXISTS AT ALL. `extracted_text_sha256` is sealed into every report artifact and is
// meant to be reproducible seven years out. It is a function of the PDF bytes AND of the flags the
// extractor ran with — so a flag change is a hash change for every future artifact, and it would
// otherwise happen with nothing going red. These cells make the flags a pinned contract of the
// package rather than an implementation detail of one function.
//
// PURE BY CONSTRUCTION — no PDF, no poppler binary, no container. That is deliberate: this is the
// EVERY-PR guard, and a guard that needs the render image would only run where the image is built.
// The behavioural half — that `-raw` actually keeps the burned watermark and the other modes do
// not — is MEASURED by scripts/watermark-burn-drill.mjs against a real Typst and a real poppler,
// and that drill calls the SHIPPED extractText rather than a copy of its argument list (裁-112).

import { test } from "node:test";
import assert from "node:assert/strict";

import { EXTRACT_FLAGS, EXTRACT_MODE_FLAG, EXTRACTOR_NAME } from "../lib/extract.mjs";

test("the extraction mode is -raw, and `-layout` is gone", () => {
  assert.equal(EXTRACT_MODE_FLAG, "-raw");
  assert.ok(EXTRACT_FLAGS.includes("-raw"), "the measured mode must be the one that ships");
  // THE RETIRED MODE, ASSERTED ABSENT rather than quietly dropped. `-layout` drops the rotated page
  // background entirely (measured 2026-09-02), which is what left the burned watermark outside both
  // the gate-3 claim scan and the sealed extracted-text hash.
  assert.equal(EXTRACT_FLAGS.includes("-layout"), false);
  assert.equal(EXTRACT_FLAGS.includes("-bbox-layout"), false);
  assert.equal(EXTRACT_FLAGS.includes("-fixed"), false);
});

test("the whole argument tuple is pinned, in order — a hash depends on every one of them", () => {
  assert.deepEqual([...EXTRACT_FLAGS], ["-raw", "-enc", "UTF-8", "-nopgbrk"]);
  // `-enc UTF-8` pins the encoding so the hash does not follow the machine's locale; `-nopgbrk`
  // keeps form feeds out so a pagination change does not move the hash for identical content.
  // Both are load-bearing for the hash, so both are pinned by value and not merely by presence.
  assert.equal(EXTRACT_FLAGS[EXTRACT_FLAGS.indexOf("-enc") + 1], "UTF-8");
});

test("the tuple is frozen, so a caller cannot mutate the pin at run time", () => {
  assert.ok(Object.isFrozen(EXTRACT_FLAGS));
  assert.throws(() => { EXTRACT_FLAGS.push("-layout"); });
});

test("the MODE is carried into the manifest's extractor pin, so a sealed hash names its own flags", () => {
  // manifest.mjs composes the pin as `${name} ${version}` and is frozen (deployed:true), so the
  // mode rides in the NAME. Without it a reader seven years out has the extractor's version and no
  // way to know which flags produced the hash beside it.
  assert.ok(EXTRACTOR_NAME.includes("pdftotext"));
  assert.ok(EXTRACTOR_NAME.includes(EXTRACT_MODE_FLAG),
    `the extractor pin must name its mode; got ${JSON.stringify(EXTRACTOR_NAME)}`);
  assert.equal(EXTRACTOR_NAME.trim(), EXTRACTOR_NAME);
});

test("POSITIVE CONTROL: these cells can say NO", () => {
  // A pin test that cannot fail is a pin nobody has. Each assertion above is re-run here against a
  // deliberately wrong value, and each must reject it.
  assert.throws(() => assert.deepEqual(["-layout", "-enc", "UTF-8", "-nopgbrk"], [...EXTRACT_FLAGS]));
  assert.throws(() => assert.ok("pdftotext (poppler-utils)".includes(EXTRACT_MODE_FLAG)));
});
