# Riders wave 3, lane 05 — ticket #928

Retire the 0045 recurring-adjustment template lane (2/3): stop the daily sweep and retire the
runtime module.

Worktree: `C:\Users\zhant\Desktop\clara-wt\655`, branch `riders/w3-lane05`, database
`127.0.0.1:55745/clara_l05`.

**RESUME note.** No earlier implementer had landed or left in-progress work for #928 on this
worktree/branch: `git status` was clean and `git log ffe63a0dd08..HEAD` before this session showed
only #908 (0280), #909 (0281) and #927 (0282). This implementer started the ticket from scratch.

## Branch state at hand-off

```
f0b037263 docs(runtime): #928 record the 0045 adjustment sweep's retirement
ba076e6fb feat(runtime): #928 retire the 0045 daily adjustment sweep and its module
0446b73aa test(e2e): #927 a real-browser walk for the retired Adjustments tab      (prior ticket)
4a1755b62 test(web): #927 update the adjustments lane's unit tests ...            (prior ticket)
8ce2ff304 feat(web): #927 retire the Propose/Sign/Run-now controls ...            (prior ticket)
86a04f038 docs(db): #927 record 0282 in the migration README                     (prior ticket)
1a824cae7 test(db): #927 retarget the eight x42-adj batteries ...                 (prior ticket)
5a3238bde feat(db): #927 close propose/sign/run_adjustment_manual ...             (prior ticket)
```

Working tree clean after the last commit. Nothing pushed, no PR opened, no other worktree touched.
**No migration was written** — this ticket needed none, matching the brief's own prediction.

## The seams tested

- **The leader's own wiring** (`packages/runtime/lib/leader.mjs`): the daily-cadence knob
  (`CLARA_ADJ_RECONCILE_MS`/`ADJ_RECONCILE_MS`), the due-predicate export (`adjustmentRunDue`) and
  the per-cycle scheduling (`lastAdjRun`, `adjDue`, `adjRuns` passed into `runReconcilerSweep`).
- **The sweep's own assembly** (`packages/runtime/lib/reconciler.mjs`): the module import/export
  of `reconcileAdjustmentRuns`, the `belt("adjustment runs", ...)` registration inside
  `runReconcilerSweep`, and the `...adj` spread in the sweep's returned receipt.
- **The module itself** (`packages/runtime/lib/reconciler-adjustments.mjs`) — as a public interface
  of `packages/runtime/lib/reconciler.mjs` (its one re-export), the frozen-workflow closure (as a
  potential importer that must NOT exist), and the parts-parity construction-site census (as a
  runtime source file its own spreads/object literals had to clear before deletion).
- **A full `runReconcilerSweep` cycle** (the exact call `startLeaderLoop`'s per-iteration body
  makes for the reconcile phase) against a scripted client, per the estate's own established
  convention for proving a belt's call path is gone (the pre-existing "autopost belt — RETIRED"
  battery in `reconcile-belt-isolation-unit.test.mjs`, which this ticket's own new battery mirrors).

## Acceptance criteria

**1. "The leader cycle never schedules the 0045 sweep; a cell proves the daily trigger is absent
and that a full leader cycle on a rig with the world bootstrapped issues no call into the retired
module."** — DONE, with one interpretation recorded.

`leader.mjs` no longer defines `adjustmentRunDue`, `ADJ_RECONCILE_MS`/`ADJ_RECONCILE_MS_ENV`,
`lastAdjRun` or `adjDue`, and no longer passes `adjRuns` into `runReconcilerSweep` — the daily
trigger is not merely false, it does not exist. `reconciler.mjs` no longer imports or re-exports
`reconcileAdjustmentRuns`, and the belt is no longer registered inside `runReconcilerSweep`
(confirmed by `node --check` on both files plus every test below).

Three new cells in `reconcile-belt-isolation-unit.test.mjs` prove the call path is gone, not merely
guarded:
- `"adjustment belt: the export itself is GONE — reconcileAdjustmentRuns is no longer on the
  module"` asserts `typeof reconcilerModule.reconcileAdjustmentRuns === "undefined"`.
- `"adjustment belt: RETIRED — never queried even on a frontier where 0045's functions still exist
  (the real shape today)"` runs `runReconcilerSweep(client, {...chatDeps(), adjRuns: true})`
  against a NEW `preRetirementAdjustmentStubClient` that answers `to_regprocedure` (surface:true),
  `adjustment_run_due` (due:true, a real template/period) and `run_adjustment_occurrence`
  (status:posted) all validly — exactly what would have produced `adjOk:true`/`adjPosted:1` before
  this ticket. It is never asked: `!client.queries.some(q =>
  /adjustment_run_due|run_adjustment_occurrence/.test(q.sql))`, `beltErrors` stays `[]`, and every
  `adj*`-shaped key (`adjOk`, `adjExamined`, `adjPosted`, `adjDrafted`, `adjFailed`, `adjDormant`,
  `adjBlockedClients`, `adjTransientBlockedClients`) is absent from the receipt.
- `"adjustment belt: unconditional too — an ordinary sweep with no adjRuns flag at all never
  touches it either"` repeats the same proof with no flag passed at all.

**Vacuity control** (work-order rule 4): rather than write these cells before the production edit
(the retirement spans three interlocking files and cannot be split into a smaller red-green step),
I made the production edit first, then verified the vacuity the rule asks for by `git stash`-ing
`leader.mjs`/`reconciler.mjs` back to their pre-#928 state (and temporarily restoring
`reconciler-adjustments.mjs` from `HEAD` so the import graph was complete), re-running
`reconcile-belt-isolation-unit.test.mjs`, and observing the two retirement-proof cells fail for the
right reason:
```
not ok 16 - adjustment belt: the export itself is GONE ...
  + 'function'   - 'undefined'
not ok 17 - adjustment belt: RETIRED — never queried ...
  expected true, actual false   (the belt WAS asked, because the pre-#928 wiring is live)
```
I then restored the working tree byte-for-byte (`git stash pop`, delete the temporarily-restored
module) and re-ran the full file: 24/24 pass, matching the state before the stash. This is recorded
here rather than as a separate commit because splitting "delete X" into a red-then-green pair of
commits would leave an intermediate commit with a broken import graph.

**Interpretation of "a full leader cycle ... with the world bootstrapped."** I read "a full leader
cycle" as `runReconcilerSweep` — the exact function `startLeaderLoop`'s per-iteration body calls
for the reconcile phase (leader.mjs's own header: "3. reconcile ... runs all three leader-guarded
phases in order") — rather than literally driving `startLeaderLoop` against a bootstrapped
Workflow World. Two reasons: (a) this is the estate's own established convention for exactly this
claim shape — the pre-existing autopost-retirement battery in the same file proves an identical
"never queried, even readied" fact the same way, against a scripted client, no DB, no world; (b)
the ONE test file in this package that does drive a real `startLeaderLoop` against a real database
(`leader-state.test.mjs`) is unconditionally Windows-skipped on this rig for the documented
`pg_dump`-absent reason (RIG.md), so it could not have served as this ticket's own proof vehicle
here regardless. A reviewer who wants the literal World-bootstrapped form can re-run
`leader-state.test.mjs` on a Linux host with `pg_dump`/`psql` on PATH; nothing in the retired
wiring will resurrect a call, because the call site itself is gone from the source.

**2. "The retired module is removed from the runtime image (or left as a no-op stub only if a
frozen closure imports it; state which and why); the frozen-workflow check stays green with no
MISSING finding."** — DONE.

`packages/runtime/lib/reconciler-adjustments.mjs` is deleted whole (`git rm`), not stubbed.
Verified before deletion that nothing frozen imports it: a repo-wide grep for
`reconciler-adjustments|reconcileAdjustmentRuns` found exactly four first-party call sites
(`leader.mjs`, `reconciler.mjs`, and the two test files below), none inside `frozen-workflows.json`'s
closure — `node scripts/check-frozen-workflows.mjs --print-closure` was not needed because the
plain grep was already exhaustive and the module was never `"use workflow"`. `check-frozen-workflows.mjs`
reads identically before and after this ticket: `312 frozen file(s) verified ... 55 "use workflow"
module(s) all frozen+registered; 3 retired entr(ies) recorded` — no new MISSING finding, no new
retired-entry (that ledger is for `workflows/*.ts` bodies specifically; a plain `lib/` module like
this one was never in it).

**3. "/ready and boot census behave exactly as before on a from-scratch chain (the sweep was never
a readiness dependency)."** — DONE, argued rather than independently re-run from scratch.

`lib/health.mjs` and `lib/body-census.mjs` never named `adjustment`/`0045` before or after this
ticket (grep confirms zero hits in both, unchanged). `tests/ready.test.mjs`, run against the lane
database (`PGHOST=127.0.0.1 PGPORT=55745 PGDATABASE=clara_l05`): first run 23/24 pass with one
timing-flaky red (no stack trace captured, no assertion diff — consistent with this repo's
documented host-contention flakiness elsewhere, e.g. `thread-live-clarify.test.tsx`); immediate
re-run 24/24 pass. `ready.test.mjs` is not itself in this ticket's touched-file set, so it is not a
required gate, but it is the most direct check available for this specific AC and I ran it as
supplementary evidence. The from-scratch chain itself (0001→0282+ on a disposable cluster) was not
independently re-run — RIG.md: "Lanes never need it: the integrator runs the from-scratch proof on
a disposable cluster" — and this ticket adds no migration for it to apply anyway.

**4. "The runtime README's sweep paragraph is replaced by the retirement sentence; the reconciler
sweep receipt no longer carries the lane's counters."** — DONE, with one correction to the AC's own
premise, recorded rather than silently worked around.

No paragraph describing the Wave D-b adjustment sweep by name existed in
`packages/runtime/README.md` before this ticket — verified by an exhaustive grep for `"0045"`,
`"D-b"`, `"adjustment belt"`, `"adjustment-occurrence"`, `"recurring"` and
`"reconciler-adjustments"` across the whole file, all zero hits. (The sibling FA/depreciation belt
DOES have a dedicated narrative section, `### The depreciation lane (#651)`; the adjustment belt
never got the equivalent.) Rather than silently satisfy the letter of "replaced" by inventing a
prior paragraph, I added a new short subsection, `### The Wave D-b adjustment-occurrence sweep —
retired (#928)`, right after the depreciation-lane section, naming the `#788`/`#927`/`#928`/`#929`
ticket chain and the untouched 0193 accounting-plan scan as the separate system.

The receipt no longer carries the lane's counters: `reconciler.mjs`'s final merge dropped `...adj`,
and the new test battery's third assertion in AC1's second cell (`!("adjOk" in swept) && ...`)
proves this on a REAL sweep call, not by code inspection alone.

## Gates, with counts

- **Test files added or touched, runtime** (`node --test tests/<file>.test.mjs` from
  `packages/runtime`, per RIG.md — these are runtime unit files, not db files, so the db
  `$GATES` preintegration-gate chain does not apply):
  - `reconcile-belt-isolation-unit.test.mjs` (edited: removed the two cells that exercised the
    retired module directly, trimmed `adjRuns`/`adjOk` out of two shared cells, added the
    three-cell retirement battery) — **24/24 pass**.
  - `reconcile-adjustments-unit.test.mjs` — deleted (its whole subject is retired); no gate to run.
  - `leader-state.test.mjs` (edited: dropped the now-unread `CLARA_ADJ_RECONCILE_MS` knob from its
    cadence-env array) — **0/4 run, 4 SKIP** (`pg_dump`/`psql` not on PATH — the documented
    Windows-only skip from RIG.md, unrelated to this ticket, reported as such rather than "fixed").
  - Sibling files that import from the touched modules, run as regression insurance though not
    themselves edited: `chat-clarify-sweep-wiring.test.mjs` — **8/8 pass**;
    `reconcile-fa-unit.test.mjs` — **18/18 pass**.
  - All four files together: **50 pass, 0 fail, 4 skip** (54 total).
- **`operation-census.test.mjs` + `rig-isolation.test.mjs`**: not run — no SQL function was added
  or touched (this ticket is runtime-only, no migration), so these db gates are not owed by the
  work-order's own rule ("if you added SQL functions").
- **`pnpm typecheck`** from the repo root: **clean** (`apps/web`, `packages/runtime`).
- **`pnpm lint`**: repo-wide with `CI=true GITHUB_ACTIONS=true` (the wave-3 addendum's own
  pre-report command) — **clean, exit 0**, all packages including `apps/web`'s and
  `packages/reporting-render`'s custom lint batteries. `packages/runtime` alone, plain (no CI env)
  — **clean, exit 0** (no ESLint output).
- **`node scripts/check-frozen-workflows.mjs`** (touched `packages/runtime`): **OK** — 312 frozen
  files, 55 `"use workflow"` modules, 3 retired entries, byte-identical to the pre-ticket baseline.
- **`node packages/runtime/scripts/check-parts-parity.mjs`** (touched `packages/runtime`): **OK**
  after re-fingerprinting — see below. Confirmed it was NOT already green before the fix (the
  removal of `adjRuns`/`...adj` changed two statements' normalised text, which changed their
  `sha256` fingerprints, which the ledger keys on) — the tool refused twice, once per file, before
  the exemption update:
  ```
  parts-parity: REFUSED — unclassifiable object spread at packages/runtime/lib/leader.mjs:218
  parts-parity: REFUSED — unclassifiable object spread at packages/runtime/lib/reconciler.mjs:811
  ```
- **`apps/web` whole unit suite / browser walks**: not applicable — this ticket touches only
  `packages/runtime`, nothing under `apps/web`.

Known Windows-only reds from RIG.md encountered: `leader-state.test.mjs`'s `pg_dump`-absent skip
(named above, not touched further).

## Migration

None. The brief itself predicted this ("This ticket is expected to need NO migration") and the
prediction held — no schema or function change was needed to stop the runtime's own scheduling of a
belt whose DB surface (`clara.adjustment_run_due`, `clara.run_adjustment_occurrence`) #929 retires
separately.

## Docs

- `packages/runtime/README.md` — new `### The Wave D-b adjustment-occurrence sweep — retired
  (#928)` subsection, placed after the depreciation-lane (#651) section (see AC4 above for why this
  is a new section rather than a literal replacement).
- In-file header comments updated at every retirement site in `leader.mjs` and `reconciler.mjs`
  (the top-of-file banner, the module-size-budget comment, the cadence-knob block, the `#640`
  comment's belt list, the wake-engine comment, the `runReconcilerSweep` JSDoc, the "N DAILY belts"
  comment) — this package's own convention for recording a retirement in place, matching the
  pre-existing autopost-retirement comments verbatim in style.
- `packages/runtime/scripts/parts-parity-exemptions.mjs` — two re-fingerprint comments added
  (`#928 re-fingerprinted: ...`), matching the `#629`/`#640`/`#636` precedents already in that
  file byte-for-byte in tone.
- `CONTEXT.md` — deliberately NOT touched. It already carries two accurate `_Avoid_: A recurring
  adjustment template as a synonym` lines (under **Accounting plan** and **Prepayment schedule**),
  unchanged since before this ticket (confirmed by grep) and needing no correction — #928 retires
  runtime scheduling code, not vocabulary, and introduces no new term. #927's own report already
  recorded that overwriting this file's `Accounting plan`/`Prepayment schedule` sections (and
  `ARCHITECTURE.md §6`, `PRD.md §69/§72`) once the whole 0045 lane is gone is `#929`'s acceptance
  criterion, not #927's or #928's.

## Successor contract

None. This ticket touches no frozen chat/Work tool surface — `reconciler-adjustments.mjs` was never
`"use workflow"` and nothing frozen imported it (verified under AC2). Nothing here needs a name, a
zod input, a door call, a refusal mapping, a part kind or a prompt stanza handed to a frozen
surface.

## Follow-ups worth filing

- #929 (drop the plan-overlap advisory's now-dead template arm; retire the DB surface
  `clara.adjustment_run_due`/`clara.run_adjustment_occurrence` this ticket stopped scheduling;
  rewrite `CONTEXT.md §Accounting plan/Prepayment schedule`, `ARCHITECTURE.md §6`, `PRD.md
  §69/§72`; close #788) is next and last in this lane's own three-ticket plan — already known from
  #927's report, restated here for continuity.
- `packages/db/tests/x42-0045-b2-upgrade.test.mjs`, flagged in #927's own report as a reset-gated
  drill that will need retargeting once 0282-and-later migrations sit on the chain it applies from
  scratch — untouched by this ticket (it is a `packages/db` concern and this ticket added no
  migration), restated here so #929's implementer sees it twice.

## Anything unverified

- The literal "world bootstrapped" reading of AC1 (see the interpretation note above) was not
  independently driven on this rig; `leader-state.test.mjs` — the one file that would carry it — is
  Windows-skipped here for the documented `pg_dump`-absent reason. The call-path proof itself does
  not depend on this: the retired functions are deleted from `leader.mjs`/`reconciler.mjs`, so no
  world state can resurrect a call that no longer exists in source.
- The from-scratch migration chain (0001→current) was not independently re-run — this ticket adds
  no migration, and RIG.md assigns that proof to the integrator on a disposable cluster.
- Hosted/production behaviour: not touched, not checked — this session worked entirely against the
  lane's own rig (`clara_l05`, 127.0.0.1:55745).
- The two `ready.test.mjs` runs (23/24 then 24/24) are read as one flaky, unrelated timing red
  rather than a regression this ticket caused; a reviewer who wants a third confirming run can
  re-run `node --test tests/ready.test.mjs` against `clara_l05` directly.
