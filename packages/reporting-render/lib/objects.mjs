// Object custody for sealed report artifacts (Wave E lane ζ; design part2 §9 "Custody").
//
// THE KEY FAMILY IS NOT REIMPLEMENTED HERE. safeReportKey / putReportCanonical /
// verifyReportCanonical live in packages/runtime/lib/storage.mjs beside their docs and wiki
// siblings, and this module imports them by RELATIVE path — the same reuse-not-copy call
// packages/backup makes when it COPYs packages/db into its own image rather than duplicating the
// dump tooling. A second implementation of a content-addressed key grammar is a second thing to
// get wrong, and the one that drifts is always the copy.
//
// THIS MODULE DELIBERATELY CARRIES NO FREEZE MARKER. The frozen set is the determinism-critical
// PURE modules; freezing this one would pull packages/runtime/lib/storage.mjs into the frozen
// import closure, and that file belongs to the runtime lane, which legitimately edits it.
//
// The marker is not even spelled out in this comment, and that is not fussiness: check-frozen-
// workflows.mjs selects frozen files by a bare substring match over the whole file (computeFrozenSet
// -> readFileSync(...).includes(FROZEN_MARKER)), with no comment stripping — unlike its "use
// workflow" directive scan, which strips comments precisely so a prose mention cannot be mistaken
// for the real thing. So a sentence merely MENTIONING the marker freezes the module it appears in.
// Verified here the hard way: an earlier draft of this comment said the module was not marked, and
// the lint froze it and its whole import closure. Reported as a finding on the existing lint.
//
// UPLOAD-THEN-VERIFY, ALWAYS. The PUT is x-upsert:false so overwrite is structurally impossible
// and a duplicate is idempotent success; the read-back re-hashes the stored object and compares.
// A write nobody read back is not evidence that the bytes are there.

import { writeFile } from "node:fs/promises";
import {
  putReportCanonical,
  safeReportKey,
  verifyReportCanonical,
} from "../../runtime/lib/storage.mjs";

export { safeReportKey };

/** The content-addressed key for a sealed artifact. DB-derived shape; no filename exists here. */
export function reportKey({ firmId, sha256, extension = "pdf" }) {
  return safeReportKey(`firms/${firmId}/reports/${sha256}.${extension}`);
}

/**
 * Put the produced bytes at their content address and PROVE they are there.
 *
 * The return distinguishes `created` from `existed`: an at-least-once render that lands on an
 * object already present is the ORDINARY case, not an error — the key is the content address, so
 * "it was already there" means "the identical bytes were already there". The read-back verify
 * runs either way, because that inference is only sound if the stored object really does hash to
 * the key it sits at.
 */
export async function putAndVerify({ filePath, firmId, sha256, extension = "pdf", mime = "application/pdf" }) {
  const key = reportKey({ firmId, sha256, extension });
  const put = await putReportCanonical(filePath, key, mime);
  const verified = await verifyReportCanonical(key, sha256);
  return { key, created: put.created === true, existed: put.existed === true, sha256: verified.sha256 };
}

/** Write a buffer to a temp path so the streaming PUT has a file to read. */
export async function stageBytes(path, bytes) {
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}
