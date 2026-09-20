// #849 — the `--retire <path> --ruling <ref>` command's pure logic, factored out so the
// selftest can exercise every refusal without touching git, the real manifest file, or
// check-frozen-workflows.mjs (which calls process.exit at import time).
//
// Mirrors the CLI's other pure siblings (freeze-lint-checks.mjs, freeze-lint-closure.mjs,
// frozen-manifest-compare.mjs): no fs, no git — the caller supplies the manifest object already
// loaded and whether the target file currently exists in the tree. #810 (owner ruling
// 2026-09-15) defined the `retired` record's shape (path -> { sha256: last frozen hash, ruling:
// the citation}) and the invariants `check-frozen-workflows.mjs` verifies against it
// (RETIRED-DUPLICATE, RETIRED-NO-HASH, RETIRED-NO-RULING, RETIRED-PRESENT); until now the record
// was only ever produced by a hand edit of frozen-workflows.json. This is the write side.
//
// No dependencies — Node built-ins only (in fact none at all: pure data in, data out).

/**
 * Retire one currently-registered frozen entry: move it from `manifest.workflows` to
 * `manifest.retired`, carrying its LAST frozen sha256 forward unchanged and citing the given
 * ruling. Refuses — returning `ok: false` and leaving the passed-in `manifest` object completely
 * untouched — when the target has no current entry, or is still present in the tree (retiring a
 * file that is still there would silently un-freeze it, the RETIRED-PRESENT hazard), or when no
 * ruling is cited (the ruling is the entry's whole authority for leaving the ledger).
 *
 * @param {{ version?: number, workflows: Record<string, {sha256:string, note?:string, deployed?:boolean}>, retired?: Record<string, {sha256:string, ruling:string}> }} manifest
 * @param {string} path repo-relative path of the entry to retire
 * @param {string|undefined} ruling the ruling citation, e.g. "#810 owner ruling 2026-09-15"
 * @param {boolean} fileExistsInTree whether `path` is still present on disk
 * @returns {{ ok: true, manifest: object, message: string } | { ok: false, error: string }}
 */
export function retireFrozenEntry(manifest, path, ruling, fileExistsInTree) {
  if (!String(ruling ?? "").trim()) {
    return {
      ok: false,
      error: `--retire requires --ruling <ref> (e.g. "#810 owner ruling 2026-09-15"); no manifest write.`,
    };
  }
  const entry = manifest.workflows?.[path];
  if (!entry) {
    return {
      ok: false,
      error: `--retire refused — "${path}" has no current entry in the manifest (nothing to retire); no manifest write.`,
    };
  }
  if (fileExistsInTree) {
    return {
      ok: false,
      error: `--retire refused — "${path}" is still present in the tree (retiring it now would silently un-freeze it, the RETIRED-PRESENT hazard); delete the file first; no manifest write.`,
    };
  }
  const workflows = { ...manifest.workflows };
  delete workflows[path];
  const retired = { ...(manifest.retired ?? {}), [path]: { sha256: entry.sha256, ruling: String(ruling) } };
  return {
    ok: true,
    manifest: { version: manifest.version ?? 1, workflows, retired },
    message: `retired "${path}" (last hash ${entry.sha256}) under "${ruling}".`,
  };
}

/**
 * The four retired-record invariants #810 defined and check-frozen-workflows.mjs's own verify
 * path enforces on `manifest.retired` (RETIRED-DUPLICATE, RETIRED-NO-HASH, RETIRED-NO-RULING,
 * RETIRED-PRESENT) — pulled out here, beside `retireFrozenEntry` (the write side), so a selftest
 * can drive the EXACT verifier AC2 names ("a subsequent verify run reports no `RETIRED-*`
 * violation") without spawning the real CLI against the real manifest and repo tree every time
 * (L05B-S04). check-frozen-workflows.mjs's own "2c. RETIREMENT INTEGRITY" section calls this same
 * function, so there is exactly one place these four rules live — a selftest cell that imports it
 * is exercising production code, not a re-implementation of it.
 *
 * @param {{ workflows?: Record<string, unknown>, retired?: Record<string, {sha256?: string, ruling?: string}> }} manifest
 * @param {(path: string) => boolean} fileExistsInTree
 * @returns {string[]} violation lines, in the same wording check-frozen-workflows.mjs prints; empty when the retired record is clean
 */
export function checkRetiredRecords(manifest, fileExistsInTree) {
  const violations = [];
  for (const [rel, record] of Object.entries(manifest.retired ?? {})) {
    if (manifest.workflows?.[rel]) {
      violations.push(
        `RETIRED-DUPLICATE  ${rel}  (present in BOTH \`workflows\` and \`retired\` — an entry MOVES to the retired record, it is never copied).`,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(String(record?.sha256 ?? ""))) {
      violations.push(`RETIRED-NO-HASH   ${rel}  (a retired record must quote the entry's LAST frozen sha256).`);
    }
    if (!String(record?.ruling ?? "").trim()) {
      violations.push(
        `RETIRED-NO-RULING ${rel}  (a retired record must cite the ruling that authorised the removal, e.g. "#810 owner ruling 2026-09-15").`,
      );
    }
    if (fileExistsInTree(rel)) {
      violations.push(
        `RETIRED-PRESENT   ${rel}  (recorded as retired but STILL IN THE TREE — a retirement is a removal from the tree, never a silent un-freeze; delete the file or restore its \`workflows\` entry).`,
      );
    }
  }
  return violations;
}
