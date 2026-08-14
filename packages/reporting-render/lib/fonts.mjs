// FONT DELIVERY BY CONTENT HASH (Wave E lane ζ; design part2 §10's "content-addressed
// fonts/logos/images, no system fonts", ratified 2026-08-14).
//
// The image ships /app/fonts EMPTY, deliberately. Baking fonts into the image would make the
// typeface a property of the BUILD rather than of the firm's published house style, so a firm
// changing its typeface would need a new image, and an artifact sealed seven years ago could not
// name which font it actually used. Instead the worker fetches, at boot, exactly the fonts the
// run's house style NAMES BY HASH — and refuses to render if any one of them is missing or
// arrives with the wrong bytes.
//
// FAIL-CLOSED, THE SAME WALL AS EVERYTHING ELSE. Three refusals, and each is a case where the
// tempting behaviour is to carry on:
//   · a manifest that names NO fonts        -> refuse (an empty font set is not "use the default";
//                                              there is no default, and a render that found one
//                                              would be unreproducible and would look fine)
//   · a named font absent from storage      -> refuse (never fall back to another font in the set)
//   · bytes whose hash != the named hash    -> refuse (this is the whole point of content
//                                              addressing; a "close enough" font changes glyph
//                                              metrics, which changes line breaks, which changes
//                                              the bytes the seal is about to attest)
//
// WHY THE DOCS KEY FAMILY. House-style assets are firm documents published through
// publish_house_style_version, so they live at `firms/{uuid}/docs/{sha256}.{ext}` — the EXISTING
// safeKey family, whose downloadCanonical already re-hashes on the way in. No new key family, no
// new bucket, no new storage role, and no second implementation of a content-addressed grammar.
// (The `reports/` prefix is the OUTPUT side and is a separate, named ceremony step.)

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { downloadCanonical } from "../../runtime/lib/storage.mjs";
import { RenderRefusal } from "./decisions.mjs";

/** Font file extensions this renderer will accept. Anything else is refused rather than guessed. */
const FONT_EXTENSIONS = Object.freeze(["ttf", "otf", "ttc"]);

/**
 * Validate the house style's font declarations. PURE — no I/O — so the refusals are exercisable
 * without storage. Returns the normalised list the fetcher will act on.
 *
 * Shape expected on the house style's asset_manifest:
 *   { "fonts": [ { "family": "DejaVu Sans", "sha256": "<64 hex>", "extension": "ttf" }, ... ] }
 */
export function planFontFetch(assetManifest) {
  const fonts = assetManifest?.fonts;
  if (!Array.isArray(fonts) || fonts.length === 0) {
    throw new RenderRefusal("render_fonts_unpinned",
      "the house style names no fonts; there is no default typeface and a render that found one would be unreproducible",
      { fonts: fonts === undefined ? "(absent)" : fonts });
  }
  const seen = new Set();
  return fonts.map((f, i) => {
    const family = typeof f?.family === "string" ? f.family.trim() : "";
    const sha256 = typeof f?.sha256 === "string" ? f.sha256.toLowerCase() : "";
    const extension = typeof f?.extension === "string" ? f.extension.toLowerCase() : "ttf";
    if (family === "") {
      throw new RenderRefusal("render_font_declaration_invalid",
        `font ${i} names no family; the assembler selects a typeface BY FAMILY, so an unnamed font can never be used`,
        { index: i });
    }
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new RenderRefusal("render_fonts_unpinned",
        `font "${family}" is not content-addressed by a sha256`, { family, sha256: f?.sha256 ?? "(absent)" });
    }
    if (!FONT_EXTENSIONS.includes(extension)) {
      throw new RenderRefusal("render_font_declaration_invalid",
        `font "${family}" declares an unsupported extension`,
        { family, extension, supported: FONT_EXTENSIONS });
    }
    // A repeated hash is not an error (two families may legitimately share a file); a repeated
    // FAMILY is, because the assembler resolves by family and a duplicate makes that ambiguous.
    if (seen.has(family)) {
      throw new RenderRefusal("render_font_declaration_invalid",
        `font family "${family}" is declared twice; the assembler resolves by family and cannot choose`,
        { family });
    }
    seen.add(family);
    return { family, sha256, extension, filename: `${sha256}.${extension}` };
  });
}

/** The docs-family storage key a content-addressed asset lives at. */
export function assetKey({ firmId, sha256, extension }) {
  return `firms/${firmId}/docs/${sha256}.${extension}`;
}

/**
 * Fetch every declared font into `fontDir`, verifying each against its declared hash.
 *
 * downloadCanonical re-hashes the stream as it writes and DELETES the file on a mismatch, so a
 * font that fails verification cannot be left on disk for the engine to pick up — the failure
 * cannot degrade into "rendered with whatever was there".
 */
export async function fetchFonts({ firmId, assetManifest, fontDir, download = downloadCanonical }) {
  const planned = planFontFetch(assetManifest);
  await mkdir(fontDir, { recursive: true });
  const fetched = [];
  for (const font of planned) {
    const key = assetKey({ firmId, sha256: font.sha256, extension: font.extension });
    const destination = join(fontDir, font.filename);
    try {
      const result = await download(key, destination, font.sha256);
      fetched.push({ family: font.family, sha256: result.sha256, path: result.path, key });
    } catch (err) {
      // The distinction matters to whoever reads the refusal: "the firm never published this
      // font" and "the stored bytes are not what the manifest says" are different incidents with
      // different remedies, and collapsing them into "font error" costs the reader that.
      const mismatch = err?.code === "checksum_mismatch";
      throw new RenderRefusal(
        mismatch ? "render_font_hash_mismatch" : "render_font_unavailable",
        mismatch
          ? `font "${font.family}" was fetched but its bytes do not hash to the pinned value`
          : `font "${font.family}" is named by the house style but could not be fetched`,
        { family: font.family, sha256: font.sha256, key, cause: String(err?.message ?? err) },
      );
    }
  }
  return fetched;
}
