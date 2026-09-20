# wave 1 · lane 09 · fix round 1

Branch `riders/w1-lane09`, worktree `C:\Users\zhant\Desktop\clara-wt\659`, db `clara_l09` (55749).

```
3f686871 fix(runtime): #966 the recovery budget is ten ACTIONS, not ten reads   <- NEW HEAD
887ae5ac fix(runtime): #966 the intake recovery belt can no longer fail a live intake
52601ff4 feat(runtime): #852 fold the chat-clarify belt into the sweep receipt
```

Nothing was redone: the two landed commits were read off the branch first (`git status` clean,
`git log --oneline origin/main..HEAD`). No push, no PR, no GitHub write, no other worktree touched.
`node scripts/check-frozen-workflows.mjs --print-closure` was re-run and grepped: none of
`spool.mjs`, `intake.mjs`, `reconciler.mjs`, `control.mjs`, `leader.mjs`, `hook-resume.mjs` is in
any frozen closure (no match), freeze-lint OK, 312 frozen files, no manifest diff.

---

## L09-A · major · #966 — the ten-slot budget spent on sidecars the old code filtered out first

**FIXED.**

**Reproduced first, as a red cell.** `tests/intake-sidecar-race.test.mjs` →
`p966.budget: sidecars the belt cannot USE never spend the ten slots it acts with`: twelve settled
but unusable entries (five `{corrupt,file}` markers, four bodies with no `intakeId`, three `null`s
from a sidecar collected between the listing and the read) ahead of one crashed `verified` intake.
Against `887ae5ac` it failed on `crashed.reads` — **expected 1, actual 0**: the crashed intake was
never opened. That is the reviewer's finding, standing on the lane's own seam rather than on a
read-only experiment.

**The fix** (`packages/runtime/lib/intake.mjs`). The ten (`RECOVERY_BATCH`) is now taken off
ACTIONABLE metas — an entry that reads back with no intake costs a read and never a slot, which is
exactly what `origin/main` got right with its filter-before-slice. Opens keep a bound of their own,
`RECOVERY_OPEN_BUDGET = RECOVERY_BATCH * 3`, because an open is still the handle a live intake's
next `rename()` collides with; "read the whole directory until ten usable ones turn up" is the cost
#966 exists to remove. The skip is no longer silent: one bounded line per sweep,
`[reconcile] intake recovery skipped N unreadable sidecar(s) this sweep: <names>`, counting only
the shapes a human can go and look at (a sidecar that vanished between the listing and the read is
not an event, and thirty lines every two seconds is how a real signal gets grepped past).

**The residual is pinned, not claimed away.** Second cell,
`p966.budget: …and the READ bound survives`: sixty unusable entries → exactly thirty opened, the
crashed intake behind them **not** reached. So the belt still does bounded work per sweep, and the
thing that ends the blind window is the reaper: `sweepSpoolTtl` matched
`^intake-[0-9a-f-]{36}\.(?:bin|json)$`, i.e. it skipped precisely the files nothing else can ever
clean up (a non-uuid `intake-*.json` is the one shape no `removeIntakeSpool(id)` is ever called
for). It now matches `^intake-.+\.(?:bin|json)$`. Nothing legitimate loses: every path this package
writes comes from `intakePaths()`, which enforces the uuid itself, and `atomicJson`'s temp files
end in `.tmp` and are still unmatched. Third cell, `p966.reap` (red before the widening, green
after): a three-hour-old unparseable `intake-00junk-1.json` is reaped, one inside the TTL is left
exactly where it is.

**Evidence:** `node --test tests/intake-sidecar-race.test.mjs` → 14/14, run three times.
Commit `3f686871`.

---

## L09-B · minor · #966 — p966.expire passed only because under five seconds had elapsed

**FIXED.**

**Reproduced first.** `CLARA_INTAKE_SIDECAR_QUIET_MS=1 node --test tests/intake-sidecar-race.test.mjs`
against `887ae5ac`: `not ok 7 - p966.expire … Expected values to be strictly equal: 2 !== 1`, with
the stray side effect printed (`intake FAILED intake=a8742de2-… code=internal`) — `p966.race`'s
leftover sidecar, still actionable, driven by a cell that is not about it. That cell ages its own
fixture by a minute, so the quiet window was not its subject at all; it was doing cell isolation by
accident.

**The fix** (test-only). A new `ownSpool(t)` helper mkdtemps a spool directory per cell and restores
`CLARA_SPOOL_DIR` in `t.after`; every cell that touches the filesystem (`p966.race`, `p966.expire`,
`p966.resume`, both `p966.listing` cells, the new `p966.reap` and `p966.giveup`) takes one.
`node:test` runs these serially, so the env swap is safe.

**Evidence:** with the window shortened, the file now reds **only** the two cells whose subject IS
the guard (`p966.quiet` ×2) — that is the lane's declared vacuity control working, and `p966.expire`
is green. Default run: 14/14 three times, ~3.5 s.

---

## L09-C · minor · #966 — a persistent EPERM cost two seconds on the intake path, with no cell

**FIXED.**

**Reproduced first, as a red cell.** New `p966.giveup`: a deliberately held `open(meta,'r')`, then
`writeIntakeMeta`. Against `887ae5ac` it failed with `took 2050 ms` — the reviewer's 2003 ms,
independently re-measured on this rig.

**The fix** (`packages/runtime/lib/spool.mjs`). `RENAME_RETRY_MS` defaults to **250 ms**, not 2000.
The retry exists for a handle that lives microseconds (the belt's own read), and 250 ms is already
a thousand times that; what the rest of the old deadline bought was a stall, once per status
transition per intake, on the latency-sensitive intake path, across the hundred-child batch #636 and
#966 were measured on. The answer is identical either way — the ORIGINAL `EPERM`, unchanged — only
the stall differs. `CLARA_SPOOL_RENAME_RETRY_MS` remains the knob for a host known to hold files
longer. The cell pins all three things the finding asked for: the original error code, inside the
deadline, and no `.tmp` residue.

**Evidence:** `p966.giveup` green (elapsed well under the 1000 ms assertion on win32). The writer
half is still load-bearing: `CLARA_SPOOL_RENAME_RETRY_MS=0 node --test tests/intake-sidecar-race.test.mjs`
still reds `p966.race` (13/14) — the retry is not vacuous at the new default.

---

## Not assigned to this round, done anyway (docs only, no behaviour)

Two sentences the review asked for in `packages/runtime/README.md`, both in a file this round was
editing regardless, both factual corrections rather than opinion:

- **L09-F**: "positive evidence that the belt ran" overstated the receipt — the belt returns the
  same zeroed counter bag, and issues no statement at all, when `resumeHook` is absent or the
  delivery columns are not there yet. Now reads "REACHED and did not throw — not that it did any
  work", with both dormant cases named. The reviewer's other option (a sweep cell with
  `deliveryColumns=3` and a resting row) was **not** taken: it is coverage, not a defect, and it is
  outside the three findings this round owns.
- **L09-D**: the Order paragraph now says out loud that a sweep which cannot record its own beat
  skips this belt too, where the leader's old standalone call ran regardless.

**L09-E** (the operator log string `chat clarify belt error` → `chat clarify reconcile error`) is
the orchestrator's pre-release check on hosted alerts and saved searches; no code change, untouched.
**L09-G** (task sidecars did not get the lazy reader; the quiet window is a flat five seconds while
a 20 MB upload takes longer) is recorded by the reviewer as out of #966's scope and stays a
follow-up — see below.

---

## Gates re-run

| gate | result |
|---|---|
| `node --test tests/intake-sidecar-race.test.mjs` | **14 tests, 14 pass, 0 fail** (×3) |
| …with `CLARA_INTAKE_SIDECAR_QUIET_MS=1` (guard off) | 12 pass, 2 fail — only the two `p966.quiet` cells, whose subject is the guard |
| …with `CLARA_SPOOL_RENAME_RETRY_MS=0` (retry off) | 13 pass, 1 fail — only `p966.race`, whose subject is the retry |
| `node --test intake-db + intake-recovery-db + intake-recovery-unit + intake-reconcile + intake-unit` (clara_l09) | **48 tests, 47 pass, 1 fail** — `scanner rejects EICAR…`, the documented #693 Defender red, not this lane's |
| `node --test document-ingest-v2 + document-ingest-v2-db + document-route-e2e + f4-egress-release-hold + ingest-workflow-db + s6-matcher-reconcile + chat-clarify-sweep-wiring` (clara_l09) | **75 tests, 75 pass, 0 fail** |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |
| `node scripts/check-frozen-workflows.mjs --print-closure` | none of this lane's six subject modules appears |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |

The selection above is "every `packages/runtime/tests/*.test.mjs` that imports `spool.mjs` or
`lib/intake.mjs`" (twelve files, listed by `grep -rln`), plus the #852 wiring file. No `apps/web`
and no `packages/db` file is touched by this round, so those suites do not apply.

## Files changed in `3f686871`

- `packages/runtime/lib/intake.mjs` — `RECOVERY_OPEN_BUDGET`, the action-counted loop, the
  once-per-sweep unreadable line, the belt header corrected.
- `packages/runtime/lib/spool.mjs` — `SPOOL_REAPABLE`, `RENAME_RETRY_MS` 2000 → 250, both headers.
- `packages/runtime/tests/intake-sidecar-race.test.mjs` — `ownSpool(t)`, four new cells
  (`p966.budget` ×2, `p966.reap`, `p966.giveup`), 10 → 14.
- `packages/runtime/README.md` — the #966 budget/deadline/reaper paragraphs, the two #852 sentences.

## Follow-ups worth filing

1. **The recovery belt's open bound still has a residual.** More than thirty settled-but-unusable
   sidecars ahead of a crashed intake delay it until `sweepSpoolTtl` reaps them (TTL floor 15 min,
   default 60) — and a 15-minute capability expires inside that window, so the outcome degrades from
   "recovered" to "expired". Pinned by cell, not hidden. A real answer is a per-sweep memory of
   `name + mtimeMs` for entries already found unusable, so junk is skipped unopened on later sweeps.
2. **L09-G, the reviewer's own follow-up**: `listTaskMetas()` still bulk-opens every `task-*.json`
   (`health.mjs:59` on every health probe, `reconciler-documents.mjs:282`) — the writer-half retry
   protects it, the metadata-first reader does not. And the quiet window is a flat five seconds
   while a 20 MB upload takes longer, so a slow live upload is still opened and skipped.

## Unverified

- Hosted behaviour: nothing in this round has hosted evidence. Local rig only, Windows host.
- The 250 ms deadline is argued from the measured shape of the contention (a reader handle is
  microseconds; a stuck AV handle is unbounded), not from a measurement of how long a real Defender
  handle lives on this host — I did not measure that.
- Every commit on this branch carries `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`,
  per riders work-order rule 2, which is what the two earlier lane commits also carry.
