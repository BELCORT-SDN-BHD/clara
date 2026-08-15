// Lane ζ unit battery — font delivery by content hash. NO storage, NO container.
//
// The fetch is exercised with an injected downloader, so every refusal is reachable without a
// bucket. These are the cases where "carry on anyway" is the tempting behaviour and the wrong one:
// a render that quietly substituted a font would change glyph metrics, which changes line breaks,
// which changes the bytes the seal is about to attest — and it would look perfectly fine.

import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { RenderRefusal } from "../lib/decisions.mjs";
import { assetKey, fetchFonts, planFontFetch } from "../lib/fonts.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const FIRM = "11111111-1111-1111-1111-111111111111";
const manifest = (fonts) => ({ fonts });

function reasonOf(fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") return r.then(() => { throw new Error("expected a refusal"); },
      (err) => { ok(err instanceof RenderRefusal, `got ${err?.name}: ${err?.message}`); return err.reason; });
  } catch (err) {
    ok(err instanceof RenderRefusal, `expected a RenderRefusal, got ${err?.name}: ${err?.message}`);
    return err.reason;
  }
  throw new Error("expected a refusal, got success");
}

// === the plan ==================================================================================

test("a valid declaration normalises to a content-addressed filename", () => {
  const plan = planFontFetch(manifest([{ family: "DejaVu Sans", sha256: SHA_A.toUpperCase(), extension: "TTF" }]));
  deepStrictEqual(plan, [{ family: "DejaVu Sans", sha256: SHA_A, extension: "ttf", filename: `${SHA_A}.ttf` }]);
});

test("NO fonts is a REFUSAL — there is no default typeface to fall back to", () => {
  strictEqual(reasonOf(() => planFontFetch(manifest([]))), "render_fonts_unpinned");
  strictEqual(reasonOf(() => planFontFetch({})), "render_fonts_unpinned");
  strictEqual(reasonOf(() => planFontFetch(null)), "render_fonts_unpinned");
  strictEqual(reasonOf(() => planFontFetch(manifest("DejaVu"))), "render_fonts_unpinned");
});

test("a font that is not content-addressed is refused", () => {
  for (const sha of [undefined, null, "", "not-hex", "abc", SHA_A.slice(0, 63)]) {
    strictEqual(
      reasonOf(() => planFontFetch(manifest([{ family: "X", sha256: sha, extension: "ttf" }]))),
      "render_fonts_unpinned",
      `sha ${JSON.stringify(sha)} must be refused`,
    );
  }
});

test("a font with no family is refused — the assembler selects BY family", () => {
  strictEqual(
    reasonOf(() => planFontFetch(manifest([{ family: "  ", sha256: SHA_A }]))),
    "render_font_declaration_invalid",
  );
});

test("an unsupported extension is refused rather than guessed", () => {
  strictEqual(
    reasonOf(() => planFontFetch(manifest([{ family: "X", sha256: SHA_A, extension: "woff2" }]))),
    "render_font_declaration_invalid",
  );
});

test("a duplicate FAMILY is refused; a shared hash across families is fine", () => {
  strictEqual(
    reasonOf(() => planFontFetch(manifest([
      { family: "X", sha256: SHA_A }, { family: "X", sha256: SHA_B },
    ]))),
    "render_font_declaration_invalid",
  );
  const plan = planFontFetch(manifest([{ family: "X", sha256: SHA_A }, { family: "Y", sha256: SHA_A }]));
  strictEqual(plan.length, 2, "two families may legitimately share one file");
});

test("assets resolve on the DOCS key family — no new grammar, no new bucket", () => {
  strictEqual(assetKey({ firmId: FIRM, sha256: SHA_A, extension: "ttf" }),
    `firms/${FIRM}/docs/${SHA_A}.ttf`);
});

// === the fetch =================================================================================

async function stageDir() {
  return join(await mkdtemp(join(tmpdir(), "clara-fonts-test-")), "fonts");
}

test("every declared font is fetched and verified against its pinned hash", async () => {
  const asked = [];
  const fetched = await fetchFonts({
    firmId: FIRM,
    assetManifest: manifest([{ family: "A", sha256: SHA_A }, { family: "B", sha256: SHA_B, extension: "otf" }]),
    fontDir: await stageDir(),
    download: async (key, destination, expected) => {
      asked.push({ key, expected });
      return { path: destination, sha256: expected };
    },
  });
  strictEqual(fetched.length, 2);
  strictEqual(asked[0].key, `firms/${FIRM}/docs/${SHA_A}.ttf`);
  strictEqual(asked[1].key, `firms/${FIRM}/docs/${SHA_B}.otf`);
  // The EXPECTED hash is handed to the downloader, which is what makes the verify real rather
  // than a re-read of whatever arrived.
  strictEqual(asked[0].expected, SHA_A);
});

test("a font missing from storage REFUSES — never a fallback to another font in the set", async () => {
  const reason = await reasonOf(() => fetchFonts({
    firmId: FIRM,
    assetManifest: manifest([{ family: "A", sha256: SHA_A }, { family: "B", sha256: SHA_B }]),
    fontDir: stageDirSync(),
    download: async (key) => { throw new Error(`Storage read failed (404) ${key}`); },
  }));
  strictEqual(reason, "render_font_unavailable");
});

test("a HASH MISMATCH is reported as its own incident, not folded into 'font error'", async () => {
  const reason = await reasonOf(() => fetchFonts({
    firmId: FIRM,
    assetManifest: manifest([{ family: "A", sha256: SHA_A }]),
    fontDir: stageDirSync(),
    download: async () => {
      const err = new Error("downloaded canonical object no longer matches its document SHA");
      err.code = "checksum_mismatch";
      throw err;
    },
  }));
  strictEqual(reason, "render_font_hash_mismatch",
    "'the firm never published this font' and 'the stored bytes are wrong' need different remedies");
});

// A directory path that need not exist yet — fetchFonts mkdirs it, and the failing cases throw
// before any write, so no fixture file is ever created.
function stageDirSync() {
  return join(tmpdir(), `clara-fonts-refusal-${Math.random().toString(16).slice(2)}`, "fonts");
}
