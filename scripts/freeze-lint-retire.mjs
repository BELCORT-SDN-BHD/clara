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
