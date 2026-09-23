# Wave 2 · lane 09 · ticket #839 — Offer "Restate as a new instruction" on the Clara rail

**Status: DONE.** Branch `riders/w2-lane09`, worktree `C:\Users\zhant\Desktop\clara-wt\659`,
database `127.0.0.1:55749/clara_l09`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
2b207c268 feat(web): #839 offer restate from the Clara rail's work-question cards
cbf86d907 feat(db): #839 clara.get_work_question gains the admitted basis
```

Working tree clean. No commit in this lane preceded mine (`git log 23cfad94..HEAD` was empty at
start; `git status` showed nothing to commit). The contract is the 2026-09-17 Agent Brief comment
plus the 2026-09-19 sequencing note on issue #839 — there is no owner ruling comment dated
2026-09-20 on this ticket. **The ticket was still live**: measured on the lane rig before any
change, `clara.get_work_question`'s live body (`_work_question_record`, migration 0180) carried no
`basis` key, and `apps/web/components/parts/WorkCards.tsx`'s two B6 cards had no restate mount at
all (`git diff 23cfad94..HEAD` before my commits was empty).

## The seams I tested at (written before the first test)

The brief names two key interfaces, and both are public seams:

- **`clara.get_work_question` / `clara.get_work_pending_question`** — the doors; behaviourally
  unchanged, but the record they return gains one field. Tested through the doors themselves
  (`packages/db/tests/work-question-admitted-basis.test.mjs`), never through the internal
  `_work_question_record` projection directly.
- **"The rail's work-question affordance and form"** — resolved, against the codebase's own
  vocabulary (`ClaraRail.tsx`/`rail-chrome.tsx` name the chat sidebar "the rail"; the file that
  renders the sidebar's Work cards is `apps/web/components/parts/WorkCards.tsx`, headed "B6 — THE
  THREE DURABLE-WORK CARDS"), to mean the rail's two B6 cards — `WorkAcceptedCard` (mounts
  `WorkQuestionPanel`) and `WorkQuestionCard` (mounts `WorkQuestionForm` directly). I did **not**
  extend `apps/web/components/firm/work-question-affordance.tsx`: that file's own header labels
  itself "#629 (B4) — Needs-you's tenth row kind", a different journey the brief never names, and
  widening it was not asked for (scope discipline, work order rule 5). This choice, and the
  duplicate-UI risk it avoids, is recorded under "Successor contract" below.

No test at a seam the brief does not give: I did not touch `work-question-affordance.tsx`
(Needs-you/B4), `work-detail.tsx` (B3, which already has its own separate `RestateWorkPanel` mount
and is exactly what AC3 protects), or the `clara.restate_accounting_work` door itself (unchanged;
#721/0200's own tests still cover it).

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | `w839.basis.pending …` — `assert.deepEqual(rec.basis, admitted)` failed with `actual: undefined` against the pre-image body (measured by a deliberate revert, see "Vacuity control") | migration 0265's recut of `clara._work_question_record`, adding `'basis', w.basis` |
| 2 | `839 the panel works from the NARROWED {id, basis} shape …` — would fail to type-check / would throw reading `work.id`/`work.basis` off a full-row-only prop | `RestateWorkPanel`'s `work` prop loosened to `Pick<AccountingWorkRow, "id" \| "basis">` |
| 3 | `839 offers restate when the caller asked …` and its four siblings — the gate did not exist | `offersRestateFor`, exported from `work-question-panel.tsx` |
| 4 | wiring: `WorkAcceptedCard`/`WorkQuestionCard` had no restate mount at all (proven by reading the pre-change file, not by a red test — see "Anything unverified" for why this slice's own render path is not unit-provable) | `WorkQuestionPanel`'s new `offerRestate` prop + render; `WorkCards.tsx`'s two call sites |

Slice 1 is the only one that touched the database; I ran its vacuity control by hand (below) rather
than through the migration file, because the migration itself is the code under test.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| A cell proves `clara.get_work_question` returns the admitted basis beside the digest fields, and that every existing field is unchanged | **done** | `packages/db/tests/work-question-admitted-basis.test.mjs`, `w839.basis.pending …` — asserts `rec.basis` deep-equals the exact object `admit_journal_work` stored, asserts every one of 0180's twenty existing fields individually, and asserts the record's key set is EXACTLY those twenty plus `basis` (twenty-one, never more). `w839.basis.settled …` proves answering the question does not change what basis it reports. `w839.basis.pending get_work_pending_question …` proves B3's own address form (`get_work_pending_question`) returns the identical record. Migration 0265's own tail re-measures the same claim over the committed function text. |
| A cell proves the rail's affordance offers the restate action and that submitting it reaches `clara.restate_accounting_work` | **done, at the seam this harness can reach — see "Anything unverified" for the boundary** | `offersRestateFor`'s five cells (`work-question-panel.test.tsx`) prove the exact decision `WorkQuestionPanel` and `WorkQuestionCard` apply before mounting `RestateWorkPanel`: on only when asked, gated on the WORK's `awaiting_input` status (not the question's own), gated on `basis` presence, never crashes on a null/undefined record. `work-restate.test.tsx`'s new "839 the panel works from the NARROWED {id, basis} shape …" cell mounts `RestateWorkPanel` with exactly the shape the rail now builds (`{id, basis}`, never a full `AccountingWorkRow`), clicks "Restate as a new instruction", and asserts the injected door receives `workId` and renders the accepted outcome — the SAME door, the SAME component, the SAME rendering #721's own pre-existing cells already prove reach `clara.restate_accounting_work` from `work-detail.tsx`. The full hydrate-then-render path inside `WorkQuestionPanel`/`WorkQuestionCard` (real `getWorkQuestion` + real `getSessionIdentity()`) is not driveable in this harness — see "Anything unverified". |
| No second restate door or duplicate restate UI exists | **done** | `offersRestateFor`'s own default is `false`; `WorkQuestionPanel`'s only caller passing `offerRestate={true}` is `WorkCards.tsx` (`WorkAcceptedCard`). `work-detail.tsx` (B3) was not edited at all — `git diff 23cfad94..HEAD -- apps/web/components/work/work-detail.tsx` is empty — so its existing separate `RestateWorkPanel` mount is the only one there, unchanged. `work-question-affordance.tsx` (B4/Needs-you) was not edited either, so it still has none. `clara.restate_accounting_work` itself is untouched (no new door). |

## The migration

`packages/db/migrations/0265_work_question_admitted_basis.sql` — the number reserved for this
ticket. Applied to `clara_l09`; ledger checksum
`3e35a42ce422a9eeac183e1809f55835d5befcb09a9c53bf052a6abdfeda8ddf`, byte-identical to the file on
disk (verified by `sha256` of the file against `clara.schema_migrations`). Chain now 230 files.

**Prestate pins, MEASURED on this rig now** (`encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed
by `to_regprocedure`, never transcribed from 0180's file text):

- `clara._work_question_record(uuid)` = `cb57a13128929850fde98172e05c1182c8c2b5c4ea27047c98a065d11d7bdb90` — the ONE body this file recuts.
- `clara.get_work_question(uuid)` = `19e4e418631d465ae0e01d43108bb7cd56f5444cb695e176d86bf1a72e33c62a` — asserted UNMOVED in the tail (it only forwards jsonb; it names no column of the record).
- `clara.get_work_pending_question(uuid)` = `8a196db9bd93b471af4518c703ef117443da10379047c51bc3e65ea9d663ee06` — asserted UNMOVED in the tail, same reason.

**What it changes.** `clara._work_question_record` gains one key, `basis` (`w.basis`, riding the
join it already made to `clara.accounting_work`), inserted beside `work_status`/`work_basis_digest`
— the record's other two `w.`-sourced keys. Nothing else moves: the tail re-asserts every one of
0180's twenty existing keys and the WHERE/JOIN clauses individually, and re-measures the two
delegating doors byte-identical to their pre-images. No new function, no grant change, no security
posture change (still owner `clara_fn_owner`, `SECURITY DEFINER`, `search_path=clara, pg_temp`,
granted to nobody — the tail reads the exact ACL text and refuses if it moved).

**No new rig-meta cohort**, and this is a finding rather than an omission. `_work_question_record`
was already on `WORK_QUESTIONS_0180_UNGRANTED_FNS` and stays there unchanged (same name, same
arity); `get_work_question`/`get_work_pending_question` keep their existing
`WORK_QUESTIONS_0180_HUMAN_FNS` membership unmoved. This is the identical shape #720/0198 recorded
for its own body-only recut of a 0180 sibling (`clara.expire_due_interruptions`) — I added a
matching comment beside `WORK_QUESTIONS_0180_COHORT` in `packages/db/tests/rig-meta.mjs` rather
than inventing a cohort with nothing to be half-present in.

**Redo.** Not needed. My first apply attempt failed inside its own transaction — a text-format
mistake in my OWN tail's expected-posture string (`{clara_fn_owner=X/clara_fn_owner}` where the
live `array_to_string` renders no braces) — and the runner rolled it back cleanly, recording nothing
in the ledger. I fixed the string and re-ran `pnpm --filter @clara/db migrate` plainly; it applied
on the first real attempt.

## Vacuity control

`clara._work_question_record` was recut on the rig, by hand (raw SQL through a short Node script,
never a second migration file), back to its EXACT pre-image text (re-measured: sha
`cb57a13128929850fde98172e05c1182c8c2b5c4ea27047c98a065d11d7bdb90`, matching the prestate pin).
`packages/db/tests/work-question-admitted-basis.test.mjs` was then run: all three cells failed,
each on `rec.basis` reading `undefined` against the admitted object it expected — red for exactly
the reason the migration exists to fix. The body was restored to the migration's own committed text
(re-measured: sha `e3866088ee13a6ff92fe365d87a82bab7f713ab2e67a267a11b187c9b7c7d1b2`, matching the
live post-image), and the same three cells were re-run green.

## Gates, with counts

Every db command ran with `PGHOST=127.0.0.1 PGPORT=55749 PGUSER=postgres PGDATABASE=clara_l09
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; every battery ran with the **full gate chain** from
`packages/db/package.json` (`node --test --test-concurrency=1 $GATES tests/<file>.test.mjs`).
`CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

| gate | result |
|---|---|
| `tests/work-question-admitted-basis.test.mjs` (added) | **3 pass / 0 fail / 0 skipped** |
| `tests/work-question-reads.test.mjs` + `tests/work-question.test.mjs` (the 0180/0721 batteries whose function I recut; regression) | **51 pass / 0 fail / 0 skipped** |
| `tests/operation-census.test.mjs` (touched `packages/db/tests`) | **10 pass / 0 fail / 0 skipped** |
| `tests/rig-isolation.test.mjs` (touched `packages/db/tests`; no reset flags) | **22 pass / 0 fail / 1 skipped** — the skip is T19 `poison-role`, which demands `CLARA_RIG_ALLOW_RESET`; RIG.md forbids it. T17 (grant matrix), T17b, T18 (definer hygiene + governed RLS) all pass, confirming the recut needed no cohort/grant change. |
| `apps/web` — `components/work/work-question-panel.test.tsx` (added) | **5 pass / 0 fail / 0 skipped** |
| `apps/web` — `components/work/work-restate.test.tsx` (touched, +1 cell) | **5 pass / 0 fail / 0 skipped** |
| `apps/web` — `components/parts/work-cards.test.tsx` (touched call sites; regression) | **12 pass / 0 fail / 0 skipped** |
| `node scripts/run-tests.mjs` (the WHOLE `apps/web` unit suite, once) | **4733 pass / 20 fail / 2 skipped / 4755 total** — all 20 failures are pre-existing and unrelated (see below) |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files verified, 55 `"use workflow"` modules registered, no manifest diff (`packages/runtime` untouched) |
| `pnpm typecheck` (worktree root) | **FAILS — inherited, not mine.** See below. |
| `pnpm lint` (worktree root) | **exit 0**, across `apps/web`, `packages/db`, `packages/runtime` and `packages/reporting-render` |

No browser walk was owed: I touched no `.spec.ts` file under `apps/web/e2e`, and work order rule 8
requires running only the walks a lane *touched*. Why none was added is under "Anything unverified".

### The typecheck red, and 20 of the unit-suite fails, are inherited from the base

```
apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name 'DOCUMENT_KINDS'.
apps/web/components/documents/document-kind-dialog.tsx(95,42): error TS7006: Parameter 'k' implicitly has an 'any' type.
```

`git diff 23cfad94..HEAD -- apps/web/components/documents/document-kind-dialog.tsx` is empty — I
never touched this file, and it is byte-identical to the wave-2 base. This exact defect is already
recorded as a follow-up in `docs/plan/active/riders-2026-09-20/reports/wave2-lane03-ticket846.md`
("blocks the typecheck gate for every wave-2 lane"), so I am not re-filing it. The 20 unit-suite
failures are a runtime cascade of the SAME bug (`DOCUMENT_KINDS` is referenced but never imported,
so any test that renders the classify Select throws `ReferenceError` at runtime) — every one of the
20 failing test names is about document classification/detail-surface/push-state navigation
(`904 — a RUNNING task is polled …`, `the detail surface's classify Select …`, `[1005]: a preset
kind shows its LABEL …`, `stepping to ANOTHER document REPLACES …`, and siblings); none names
`work-question`, `WorkCards`, `restate`, or anything this ticket touched.

## Docs, in the same commits

- **`packages/db/README.md`**: no new section added. Neither 0180 (#629, the shared question
  record this ticket extends) nor 0200 (#721, restate) has its own README section — the file
  documents subsystems, not every migration — and a one-key additive splice to an already-documented
  internal projection did not meet that bar. Recorded here rather than silently skipped.
- **`CONTEXT.md`**: no new term added. "Accounting work" and "Restated work / supersedes" already
  cover the concept this ticket exposes; no new vocabulary was coined.
- **`packages/db/tests/rig-meta.mjs`**: the "#839 END"-bracketed comment beside
  `WORK_QUESTIONS_0180_COHORT`, recording why no new cohort exists (see "The migration" above).
- Shared files touched, minimally and at the sorted position: `packages/db/package.json` (one
  `--import` token appended in migration order), `apps/web/test/manifest.txt` (one line, alphabetical
  position, verified by `check-test-manifest` in the lint gate above). No other shared file
  (`apps/web/messages/en.json` untouched — no new `t()` key was added; every string this ticket
  renders reuses `RestateWorkPanel`'s existing `WorkRestate` namespace).

## Successor contract

**None is owed.** Neither `clara.get_work_question` nor `clara.get_work_pending_question` changed
signature, and `clara.restate_accounting_work` (#721/0200) is untouched — no frozen chat or Work
tool needs a new door, a new zod input, or a new refusal mapping. The one thing worth naming for
whoever eventually widens this to Needs-you (B4) or elsewhere:

- **The gate to reuse is `offersRestateFor(record, offerRestate)`**, exported from
  `apps/web/components/work/work-question-panel.tsx`. It takes a `WorkQuestionRecord | null |
  undefined` and the caller's own opt-in boolean, and returns true only when the WORK (not the
  question round) is `awaiting_input` and `basis` is present. Reusing it — rather than
  re-deriving the condition — is what keeps a future B4 addition from silently drifting from B6's
  rule.
- **`RestateWorkPanel`'s `work` prop is now `Pick<AccountingWorkRow, "id" | "basis">`**, so any
  future caller holding only a partial Work projection (never the whole row) can mount it directly,
  exactly as this ticket's two rail cards do.

## Follow-ups worth filing

1. **Needs-you (B4) still cannot offer restate.** `work-question-affordance.tsx` mounts the same
   `WorkQuestionPanel` this ticket extended, but I left its call site at the default `offerRestate`
   (false) because the Agent Brief names only "the rail". Turning it on there is a one-line change
   (`offerRestate` on that one `<WorkQuestionPanel questionId={...} .../>` call) once a ticket
   actually asks for it — the gate, the migration and the loosened prop are all already in place.
2. (Not mine to re-file — already tracked) `apps/web/components/documents/document-kind-dialog.tsx`'s
   `DOCUMENT_KINDS` typecheck break, recorded in `wave2-lane03-ticket846.md`.

## Anything unverified

- **The live hydrate-then-render path inside `WorkQuestionPanel`/`WorkQuestionCard` on the rail** —
  i.e. that a REAL signed-in browser actually sees the restate control appear and that pressing it
  reaches the door end-to-end through the panel's own data flow (not through `RestateWorkPanel`
  mounted directly, which IS proven). `WorkQuestionPanel`'s `load()` calls
  `getSessionIdentity()`, which constructs a real `@supabase/ssr` browser client and reads a
  `__Host-`-prefixed, chunked, base64-encoded session cookie — `apps/web/components/parts/
  work-cards.test.tsx`'s own header records this as the exact reason its "ACCEPTED" state was never
  provable in this harness either, for the SAME two cards, before this ticket existed. I did not
  build a browser walk to close this gap: no `.spec.ts` file exercises restate for ANY surface today
  (B3's own #721 restate feature, live on `main` since 0200, has never had one — confirmed by `grep
  -rl "restate_accounting_work\|RestateWorkPanel" apps/web/e2e` returning nothing), so adding one
  here would be new test infrastructure (a mock `clara.restate_accounting_work` fixture door) well
  beyond this ticket's own scope. Stated as a real limit rather than implied to be covered.
- **The hosted estate.** Nothing here is hosted evidence; hosted evidence is pending and not mine to
  claim.
- **A true from-scratch 0001→0265 chain.** Not run: RIG.md rules one from-scratch chain per cluster
  and gives the integrator a disposable one. 0265's prestate and tail both ran on every apply here.
