---
paths: ["docs/plan/active/**"]
description: What a session handoff must contain to survive the session that wrote it.
---

# Writing a handoff

**Write for a reader with no session, no transcript and no task board — only this repo.** A
`/clear`, a compaction, or a different machine takes every session-local thing with it. A resume
step that depends on one is not merely stale: it is gone, and the reader cannot tell that
anything is missing.

**Every closure list is written out in full, here.** "The rest is on the task board" or "see the
lane's transcript" is a pointer to something the next reader cannot open. If an item has to be
done before the wave closes, its words belong in this file.

**Session-local identifiers are historical labels, never the resume mechanism.** Task numbers,
agent and lane names, transcript paths, run ids — record them if they date the work, but no
sentence telling someone what to do next may depend on one. Task numbers are the sharpest edge:
the next session renumbers them, so `#57` quietly comes to mean different work.

**The resume path names files, docs and commands.** Which migration, which test, which
acceptance record, which ADR — things a reader can open, plus the command that re-proves the
state. "Resume the writer lane from its existing transcript" is the failure this rule was minted
for; "resume the `UNNUMBERED_*` migrations listed in §3, then run `pnpm --filter @clara/db test`"
is not.

Nothing here is machine-checked. `PROGRESS.md` stays the state authority; a handoff is a narrow
dated bridge into it, and it is worth only what it repeats in full.
