// The layout/PDF engine adapter (Wave E lane ζ; design part2 §10's determinism obligations).
//
// ENGINE CHOICE: TYPST, a declarative typesetting engine shipped as ONE static binary, pinned by
// version + sha256 in the Dockerfile exactly the way packages/backup pins rclone.
//
// WHY, against §10's own criterion ("a declarative PDF layout engine is preferred over printing a
// live webpage; if a browser is ever used, the entire browser/OS/font stack must be pinned and
// archived"):
//   · It is declarative. The document is a source file, not a rendered web page — there is no
//     JavaScript, no network fetch, no layout that depends on a viewport.
//   · The determinism surface is SMALL and nameable: one binary, the fonts we hand it, and
//     SOURCE_DATE_EPOCH. A headless browser drags in a browser build, a system font stack, a
//     rasteriser and a JS engine — four more things to pin and archive for seven years.
//   · Fonts are explicit. `--font-path` plus `--ignore-system-fonts` means the render sees the
//     content-addressed fonts we mounted and NOTHING the base image happens to have installed.
//   · Timestamps are injectable. SOURCE_DATE_EPOCH (derived in manifest.mjs from the reporting
//     period, never from a clock) is what the engine bakes in.
//
// THE CLAIM THIS MODULE DOES NOT MAKE. "Typst is byte-deterministic" is not asserted here on
// anybody's authority — it is MEASURED, by the double-render equality drill (§9/§10, the CI
// obligation) and re-measured in the DR cadence. The engine sits behind this one narrow
// interface precisely so the spike's outcome can swap it without touching the assembler, the
// gates or the queue: if the measurement fails, the fix is a different `renderPdf`, not a
// different design. Nothing downstream imports this module's internals.
//
// NETWORK IS DISABLED DURING LAYOUT/PDF. The engine is spawned with no network namespace access
// available to it in the deployed image, and it is given `--ignore-system-fonts` plus an explicit
// font path so it cannot reach for anything ambient. The env is CLEARED rather than inherited:
// an inherited env is how a locale, a timezone or a home directory leaks into the output.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const ENGINE_NAME = "typst";

/** The engine's exact version, READ FROM THE BINARY — never asserted from a constant. */
export async function engineVersion(bin = process.env.CLARA_RENDER_TYPST_BIN || "typst") {
  const { stdout } = await run(bin, ["--version"], { env: {}, timeout: 30_000 });
  const version = String(stdout).trim();
  if (!version) throw new Error("the layout engine reported no version; an unpinned engine cannot be sealed against");
  return version;
}

/**
 * Typeset a source document to PDF bytes.
 *
 * @param {{source:string, fontDir:string, sourceDateEpoch:number, bin?:string, timeoutMs?:number}} args
 * @returns {Promise<Buffer>}
 */
export async function renderPdf({ source, fontDir, sourceDateEpoch, bin, timeoutMs = 240_000 }) {
  if (typeof source !== "string" || source.trim() === "") {
    throw new Error("the assembler produced no source to typeset");
  }
  if (!Number.isInteger(sourceDateEpoch)) {
    throw new Error("SOURCE_DATE_EPOCH must be a manifest-derived integer; the renderer has no clock");
  }
  const exe = bin || process.env.CLARA_RENDER_TYPST_BIN || "typst";
  const dir = await mkdtemp(join(tmpdir(), "clara-render-"));
  try {
    const src = join(dir, "report.typ");
    const out = join(dir, "report.pdf");
    await writeFile(src, source, "utf8");
    await run(exe, [
      "compile",
      "--font-path", fontDir,
      "--ignore-system-fonts",
      src,
      out,
    ], {
      // A CLEARED environment plus exactly the three variables the render may depend on. TZ and
      // LC_ALL are pinned so a machine's locale can never reach the page; SOURCE_DATE_EPOCH is
      // the manifest-derived timestamp.
      env: { SOURCE_DATE_EPOCH: String(sourceDateEpoch), TZ: "UTC", LC_ALL: "C" },
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * THE DOUBLE-RENDER EQUALITY DRILL, as a function so CI and the DR cadence run the SAME code.
 * Renders twice in one image and returns both hashes; the caller decides what a mismatch means.
 * It is not on the hot path — a per-run double render doubles the cost of every pack — and it is
 * what §9 calls "a CI obligation ... and a DR obligation".
 */
export async function doubleRender(args, hashBytes) {
  const first = await renderPdf(args);
  const second = await renderPdf(args);
  return {
    first_sha256: hashBytes(first),
    second_sha256: hashBytes(second),
    equal: hashBytes(first) === hashBytes(second),
    bytes: first,
  };
}
