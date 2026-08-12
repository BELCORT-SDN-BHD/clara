---
paths: ["packages/runtime/**"]
description: Workflow-versioning mechanics, and the build check that catches silent WDK failures.
---

# Changing a workflow

**A deployed workflow body is immutable.** Once any run can be in flight, the body that run
started with has to stay reachable — a parked run resumes into the exact code it left. So a
behavioural change is never an edit:

1. Add the next version as a new file and export (`chatTurn.v11.ts` — not an edit to `v10`).
2. Repoint `registry.ts`, which names the version new enqueue sites target. Older versions stay
   exported and frozen.
3. Run `pnpm freeze:update` **only** when adding a brand-new frozen workflow class. A new `_vN`
   of an existing class should pass freeze-lint on its own; if the lint demands an update for a
   change you made, you edited a frozen body — undo it rather than regenerate the manifest.

Never rename or delete an export that has in-flight runs. The workflow name derives from
path plus export, so a rename strands every parked run filed under the old name.

**After ANY edit to a workflow file, grep the BUILT bundle for your change.** The WDK compiler
can silently swallow a directive: the source reads correctly, the build succeeds, and the
behaviour is simply absent at runtime. Build with `pnpm --filter @clara/runtime build`, then
grep `.output/` for the string you expect to find. Typecheck does not cover this, and neither
does reading the source.

**The prompt and the tools live inside the frozen closure by design.** Editing a prompt or tool
file that a frozen body imports *is* editing that frozen body — it needs its own new version.

**Rollback is not free.** Before any `fly releases` revert, confirm the target image still
exports every workflow name and version that has non-terminal runs
(`packages/runtime/README.md`, "Rollback preflight"). A blind revert strands them.

Enforced by machine, not restated here: `scripts/check-frozen-workflows.mjs` golden-hashes
every frozen body and its full import closure on every PR.
