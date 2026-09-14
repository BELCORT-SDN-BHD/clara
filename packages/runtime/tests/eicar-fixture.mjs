// The EICAR fixture, and the ONE reason a cell that uses it may be skipped (#693).
//
// EICAR is the industry's deliberately-harmless "every scanner must flag this" string, which is
// exactly what makes it useful to the intake cells: the scanner's rejection can be asserted with
// no real malware anywhere near the rig. It is also what makes it fragile on Windows. With
// Microsoft Defender real-time protection on, Defender quarantines the file BETWEEN the test's
// write and the scanner's read, so `scanFile`/`finalizeDocumentIntake` fail on a missing-file I/O
// error and the cell reds as though the SCANNER had regressed. Linux CI runners and the Fly image
// are unaffected; this was the runtime suite's single Windows-only red (Architecture §11).
//
// The disposition (issue #693, option 1): on win32, PROBE for the quarantine — write the bytes,
// look for them — and skip with an explicit reason when they are gone. Never a silent skip, never
// a Defender exclusion the contributor has to configure, and no change at all on Linux or macOS,
// where the fixture always survives and the scanner's rejection is still asserted.
//
// `eicarSkipReason` takes the platform and the probe RESULT rather than reading either itself, so
// both outcomes are testable on a host that is not Windows and has no Defender — see
// intake-unit.test.mjs's "(#693)" cells.

import { mkdir, mkdtemp, rm, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** The EICAR standard anti-virus test string. Not malware; a signature every scanner agrees on. */
export const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/** The one reason these cells may skip. Asserted verbatim by the cells that pin this behaviour. */
export const DEFENDER_SKIP_REASON = "Defender quarantined the EICAR fixture";

/**
 * The skip verdict for an EICAR-bearing cell: `false` (run it) or the reason string.
 *
 * @param {{platform: string, probeSurvived: boolean}} arg
 * @returns {false|string}
 */
export function eicarSkipReason({ platform, probeSurvived }) {
  // Linux and macOS are unchanged, deliberately: a real-time scanner that eats the fixture is a
  // Windows/Defender behaviour, and a cell that skipped itself anywhere else would hide a genuine
  // scanner regression behind a platform excuse.
  if (platform !== "win32") return false;
  return probeSurvived ? false : DEFENDER_SKIP_REASON;
}

/**
 * Write the EICAR bytes to a throwaway file and report whether they were still there afterwards.
 * Any failure to write or read back counts as "did not survive" — Defender's quarantine surfaces
 * as several different errno values depending on when it fires, and every one of them means the
 * same thing for the cells downstream.
 *
 * @returns {Promise<boolean>}
 */
export async function probeEicarSurvives() {
  let dir = null;
  try {
    // Create the base first: CLARA_TEST_TMP_ROOT may name a directory that does not exist yet
    // (the suites that set it `mkdir` it in their own `before()`, which has not run at module
    // load), and a probe that reported "quarantined" for a missing temp root would skip the cell
    // for the wrong reason entirely.
    const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
    await mkdir(base, { recursive: true });
    dir = await mkdtemp(join(base, "clara-eicar-probe-"));
    const file = join(dir, "probe.bin");
    await writeFile(file, EICAR);
    await access(file);
    return true;
  } catch {
    return false;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The suite-start verdict for THIS host: `false` everywhere but a Windows box whose Defender ate
 * the probe. The probe is skipped entirely off win32 — there is nothing to detect, and writing an
 * EICAR file at module load on every developer's machine buys nothing.
 *
 * @returns {Promise<false|string>}
 */
export async function eicarSkipForThisHost() {
  if (process.platform !== "win32") return false;
  return eicarSkipReason({ platform: "win32", probeSurvived: await probeEicarSurvives() });
}
