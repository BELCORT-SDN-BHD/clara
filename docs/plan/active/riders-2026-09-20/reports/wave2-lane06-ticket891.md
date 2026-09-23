# Wave 2 · Lane 06 · Ticket #891 — DONE (firm setup applicability predicates)

Branch: `riders/w2-lane06` (worktree `C:\Users\zhant\Desktop\clara-wt\656`). Base:
`23cfad947b5598214168ba9c43d391b4e16aa745`. `git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD`
at start showed two commits (#894, #895, both already landed):

```
dc9f16db4 fix(db): #895 0218 firm-setup migration polish -- three defects the #648 fix round left
4d23d3c5d fix(db): #894 harden uq_onboarding_plans_one_open_firm's predicate
```

and now shows four:

```
7f4f0cc69 feat(web): #891 firm setup checklist hides/marks inapplicable items
33b797e72 feat(db): #891 firm setup applicability predicates
dc9f16db4 fix(db): #895 0218 firm-setup migration polish -- three defects the #648 fix round left
4d23d3c5d fix(db): #894 harden uq_onboarding_plans_one_open_firm's predicate
```

`git status` in the worktree is clean after both commits.

## Ticket

#891 "Firm setup applicability predicates" — the NEWEST (and only) Agent Brief, comment
`2026-09-17T17:00:39Z` (`65fde7f3`), re-verified live on this branch before building: I read the
live `clara.firm_setup_keys` catalogue and the current `clara.get_firm_setup`/`seed_firm_setup_plan`
bodies (already once recut by #895/0256) and confirmed both `mpers_eligibility` and `tin` still
carry no predicate and are still seeded/asked unconditionally, exactly as the brief describes. Out
of scope, per the brief: editing or retiring any shipped catalogue row, touching the pre-admission
interview workflow files (frozen — read for their predicate logic, never edited), and a general
expression language.

## Seams tested at

- **`clara.seed_firm_setup_plan(text)`** and **`clara.get_firm_setup()`** through `humanQuery` as a
  real admin persona — the two public doors the brief's "Key interfaces" names.
- **`clara._firm_setup_applicability(plan, item_key)`** — the new derivation door itself, also named
  explicitly by "Key interfaces" ("a second relation keyed by item_key, or a derivation door"); not
  called directly by any test (it is ungranted), but its behaviour is proven indirectly through the
  two doors above at every one of the four cells.
- **The committed `prosrc`** of both recut functions and the new one (`pg_proc`), for the
  migration's own tail census — all three are reached only from `_human_ctx`-gated doors or are
  themselves ungranted, so, like every other migration in this chain, the tail proves the CODE SHAPE
  landed structurally; the BEHAVIOURAL proof is the test file's job.
- **The web checklist's rendered surface** (`components/firm-setup/firm-setup-checklist.tsx`)
  through the component test harness — the Key Interfaces' fourth named surface ("the firm-setup
  checklist surface").

## A judgment call this report states plainly

The brief's Key Interfaces line for `get_firm_setup` reads: "items carry applicability; the
required-answered over required-total counter excludes inapplicable items from both sides." Read
most literally against the UNCHANGED catalogue (`required_for_commit` stays `false`, untouched, on
both `mpers_eligibility` and `tin`), that exclusion is a no-op for every one of the twelve shipped
rows today — neither conditional item was ever counted before this ticket, applicable or not, so
"excludes" would have nothing to exclude and AC3 ("a cell proves the counter excludes an
inapplicable item from numerator and denominator") could not be a genuine red-then-green test
against that reading; a test asserting it would already have passed before any code changed.

I resolved this by making `get_firm_setup`'s counter additionally count `mpers_eligibility`/`tin`
specifically, but ONLY while each is BOTH actually seeded on the plan and reads `'applicable'` right
now — so a real inclusion-then-exclusion cycle exists to test, and the ticket's own "current
behavior" sentence ("both carried as not required for commit … TO KEEP THE GAP FROM BLOCKING
ANYONE") reads as a stated reason this was a workaround for the missing predicate, not a permanent
product decision. This stays a `get_firm_setup`-only concept: `clara.commit_firm_setup` is
untouched and still reads the catalogue's own (still `false`) flag directly, so neither conditional
item can ever block a commit — only the progress counter's honesty changes. This is documented at
length in the migration's own header (packages/db/migrations/0257_firm_setup_applicability.sql) and
restated here because it is the one place I made a call the brief did not fully pin down; a reviewer
who disagrees can revert just this one clause (the `i.id is not null and … = 'applicable'` OR-arm on
`required_total`/`required_answered`/the per-item `required` flag) without touching anything else in
this ticket.

## Migration

`packages/db/migrations/0257_firm_setup_applicability.sql` — applied cleanly to `clara_l06` via
`pnpm migrate` on top of the lane's chain after #894/#895 (232 files total after apply). Prestate/tail
notices from the real, final apply (after the redo churn described under "Vacuity control" below,
with the ledger's checksum row corrected to match the file's own final bytes exactly — confirmed by
a subsequent plain `pnpm migrate` reporting `0 new migration(s) applied`, i.e. no drift):

```
[notice] #891 prestate: clean -- clara.seed_firm_setup_plan and clara.get_firm_setup are live at
  their pinned (post-#895) pre-images, neither already references an applicability door,
  clara._firm_setup_applicability(uuid,text) is not yet taken, entity_type/turnover_band still
  admit the two literals this file hardcodes, mpers_eligibility/tin still read
  capture/not-required/no-knowledge-key over a 12-row catalogue, onboarding_plan_items.state still
  admits exactly pending/answered/resolved/deferred, and every helper either recut body calls is
  present.
[notice] #891 tail: OK -- clara._firm_setup_applicability(uuid,text) is a new, ungranted,
  clara_fn_owner-owned SECURITY DEFINER helper (EXECUTE for nobody, not even clara_authenticated)
  mirroring exactly the two interview predicates ... clara.seed_firm_setup_plan's reconciliation now
  inserts only a row that reads applicable right now ... clara.get_firm_setup carries a live
  applicability field on every item, its per-item required flag and its
  required_total/required_answered counter now also count mpers_eligibility/tin exactly while each
  is seeded (i.id is not null) AND applicable ... both recut doors kept their exact
  clara_fn_owner/SECURITY DEFINER/search_path/plan_cache_mode/ACL posture and stay
  EXECUTE-unreachable by every machine role; the twelve catalogue rows, the other three doors, the
  three other private helpers, #894's widened index and clara.commit_firm_setup's own
  catalogue-driven gate are all untouched.
applied 0257_firm_setup_applicability · backend pid 367332
migrate: 1 new migration(s) applied · 232 total · target 127.0.0.1:55746/clara_l06
```

**Prestate pins, measured on `clara_l06` at the frontier left after #895 (0256 applied), PostgreSQL
17.11, moments before applying — both hardcoded constants in the migration's own `DO` block, not
transcribed from memory:**

- `clara.seed_firm_setup_plan(text)` `sha256(prosrc)`:
  `8854fde0be3842fa8dcd656d628a271dc8b0905321c2851362938d6483a2cac2`
- `clara.get_firm_setup()` `sha256(prosrc)`:
  `fec8e6867e0707f319297557ca406c08297a57b8eb5bcf660b3ccfc3dba2a321`

**Recut shape.** Both functions are full-body recuts (`create or replace function`), pasted verbatim
from their post-#895 (0256) text except the deltas the migration header names. Neither signature,
floor, grant nor ACL moved. The new `clara._firm_setup_applicability(uuid,text)` is a plain
`create function`, ungranted, in the shape of the three existing 0218 private helpers
(`_firm_setup_plan`/`_assert_firm_setup_answer`/`_firm_setup_bump`) — no `rig-meta.mjs` cohort entry
was added for it, matching that these three, and `_legal_enforcement_mode` (0234), carry none
either; a cohort polices a GRANTED name's presence across a frontier, and this name is granted to
nobody.

**Redo used once, deliberately, for the vacuity control** (see below), not for a fix-round edit —
the migration applied cleanly on its first real attempt after one syntax fix made *before* that
attempt (a tail-check substring assumed `commit_firm_setup`'s WHERE clause was on one line; it is
not, caught locally before ever hitting the database).

## Acceptance criteria

- **[x] AC1 — a cell proves a Sdn Bhd is asked the eligibility item and another entity type is not,
  through the doors.**
  Test: `p891.mpers.entity_type a Sdn Bhd is seeded the eligibility item through the doors; another
  entity type stays unseeded` in `packages/db/tests/firm-setup-applicability.test.mjs` — **PASS**.
  Seeds a plan before `entity_type` is answered (`mpers_eligibility` reads `applicability:
  'undetermined'`, `state: 'unseeded'`); answers `entity_type: 'sdn_bhd'`, reconciles again, and
  the item is now seeded (`applicability: 'applicable'`, `state: 'pending'`). A second firm answers
  `entity_type: 'sole_prop'`, reconciles again, and the item reads `applicability: 'inapplicable'`
  and stays `'unseeded'` permanently — never asked.

- **[x] AC2 — a cell proves the TIN item follows the turnover answer both ways, including turnover
  unanswered.**
  Test: `p891.tin.turnover the TIN item follows the turnover answer both ways, including turnover
  unanswered` — **PASS**. Before `turnover` is answered, `tin` reads `'undetermined'`/`'unseeded'`.
  Answering `turnover: '<RM1M'` and reconciling leaves it `'inapplicable'`/`'unseeded'` (never
  seeded — the exemption). A second firm answers `turnover: 'RM1M-5M'`, reconciles, and `tin`
  becomes `'applicable'`/`'pending'` — now askable.

- **[x] AC3 — a cell proves the counter excludes an inapplicable item from numerator and
  denominator.**
  Test: `p891.counter.excludes the required counter includes a seeded, applicable conditional item
  on both sides, and excludes it from both once its dependency makes it inapplicable` — **PASS**.
  Baseline `counter.required_total = 8` (the eight unconditional required rows). Answering
  `turnover: 'RM1M-5M'` alone does not move the counter (TIN is applicable but not yet seeded,
  `required_answered` moves to 1 for turnover itself). Reconciling seeds TIN: `required_total = 9`,
  `required_answered = 1` (TIN pending). Answering TIN: `required_answered = 9`. RE-answering
  `turnover: '<RM1M'` makes TIN inapplicable LIVE: on the very next read `required_total` drops
  back to 8 and `required_answered` drops back to 1 — excluded from BOTH sides in the same read —
  while `tin.answer` still reads the value it was given (`'C1234567890'`), untouched.

- **[x] AC4 — a cell proves an item answered before it became inapplicable keeps its answer.**
  Test: `p891.answer.survives an item answered before it became inapplicable keeps its answer and
  is marked inapplicable, not deleted` — **PASS**. Answers `entity_type: 'sdn_bhd'`, reconciles,
  answers `mpers_eligibility: {determination: 'eligible'}`. Then re-answers
  `entity_type: 'sole_prop'`. The re-read shows `mpers_eligibility.applicability: 'inapplicable'`
  (re-derived live) while `state` stays `'answered'` and `answer` still deep-equals
  `{determination: 'eligible'}` — nothing deleted or rewritten; only the reported applicability (and
  `required`) flipped.

- **[x] AC5 — the migration applies on a from-scratch chain with a tail census over the catalogue.**
  Not independently re-run as a fresh from-scratch chain from this lane rig (RIG.md: "the integrator
  runs the from-scratch proof on a disposable cluster," lanes never re-run the whole chain on a
  reused cluster). What I did verify directly: the migration's own §0/§T `do` blocks ran for real —
  prestate measured the live pre-image and refused to proceed on drift, and the tail re-read
  `pg_catalog`/`pg_proc`/`pg_index` after the real `create or replace function`/`create function`
  statements committed and asserted the twelve-row catalogue, the ACL/posture of all three touched
  names, and every untouched cohort member — see the notices above. `firm-setup.test.mjs`'s own
  `firmSetupCohortApplied()` probe (17/17 green, below) additionally re-confirms the whole 0218
  cohort is still wholly present alongside the new name.

**Vacuity control** (work-order rule 4). Two, at two different levels:

1. **The migration.** After the real apply went green, I wrote a throwaway variant of the same file
   with the seed's applicability filter removed and `get_firm_setup`'s applicability/`required`/
   counter/`v_unseeded` guards reverted to their pre-#891 shape (prestate and tail neutered so the
   throwaway itself would apply under `CLARA_MIGRATION_REDO`), applied it, and watched all 4 cells
   in `firm-setup-applicability.test.mjs` fail for the reasons their own assertions name (e.g.
   `expected: 'undetermined', actual: 'applicable'`; `expected: 9, actual: 8`). I then restored the
   real file byte-for-byte (diffed identical against my own pre-break copy), redid it again
   (temporarily bypassing only the prestate's two now-stale sha pins and the "already exists" guard
   for that one restore pass — the real tail, unmodified, verified the restored shape), re-ran the
   battery (4/4 green), and repaired the ledger's recorded checksum to the true file's own sha256 so
   a later plain `pnpm migrate` reports zero drift (verified: it does). The file on disk is
   byte-identical to what was written and to what a fresh chain will run; only this lane's own local
   ledger churned during the exercise, and it now matches the shipped file exactly.
2. **The web component.** `git stash push -- apps/web/components/firm-setup/firm-setup-checklist.tsx
   apps/web/lib/firm-setup/types.ts`, ran `fs.web.13` — it failed against the pre-#891 code, though
   by an unusual mechanism: the render loop crashed with `RangeError: Array buffer allocation
   failed` after ~127s rather than a clean assertion (the old component has no notion of
   `isHiddenByApplicability`/`isNowInapplicable` at all, and rendering my fixture's three synthetic
   items through its unconditional form-rendering path apparently drives some part of the harness
   into a long-running loop before it finally OOMs — not investigated further, since the code being
   exercised is not the code being kept). `git stash pop` restored the fix; the same cell then
   passed in 6.5ms. I record the unusual failure mode honestly rather than calling it a clean
   red — it is still red for the right subject, not a hang unrelated to my change.

## Gates

- **`packages/db/tests/firm-setup-applicability.test.mjs`** (new, own stable stem
  `firm_setup_applicability$`, 4 cells, one per AC): focused run → **4/4 pass**.
- **`packages/db/tests/firm-setup.test.mjs`** (touched: 3 literal seeded-count fixes + one loop
  fixed to re-seed and to avoid the turnover exemption value, see "Regressions found and fixed"
  below) → **17/17 pass**.
- **`packages/db/tests/firm-setup-polish.test.mjs`** (touched: 2 literal seeded-count fixes + one
  message-text fix) → **3/3 pass**.
- All three together, with the full 55-entry preintegration-gate chain
  (`node --test --test-concurrency=1 $GATES tests/firm-setup-applicability.test.mjs
  tests/firm-setup.test.mjs tests/firm-setup-polish.test.mjs`) → **24/24 pass, 0 fail** (17 `p648.*`
  + 3 `p895.*` + 4 `p891.*`).
- **`packages/db/tests/operation-census.test.mjs`** (this ticket added one new SQL function, so this
  gate is required by rule 8's "if you added SQL functions" clause): full gate chain →
  **10/10 pass**.
- **`packages/db/tests/rig-isolation.test.mjs`** (same rule): full gate chain, never with reset
  flags → **32/33 pass, 1 skip** (`T19 poison-role`, the one destructive cell, correctly SKIPped
  because `CLARA_RIG_ALLOW_RESET` is unset), **0 fail**.
- **`pnpm --filter @clara/db lint`** (`eslint .`) → clean.
- **`pnpm lint`** (apps/web, includes eslint plus the repo's own message-keys/test-manifest/
  ui-add-guard self-test batteries) → exit 0, all pass.
- **`pnpm typecheck`** (repo-wide) → **fails, but for a reason unrelated to #891, pre-existing on
  the base commit, and already flagged by both #894's and #895's own reports in this same lane**:
  `apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name
  'DOCUMENT_KINDS'` (+ one downstream implicit-`any`). Confirmed byte-identical to the base commit
  (`git diff 23cfad947b..HEAD -- apps/web/components/documents/document-kind-dialog.tsx` is empty)
  and reproduced identically with every one of my `apps/web` changes stashed out
  (`git stash push -u -- apps/web/components/firm-setup apps/web/lib/firm-setup
  apps/web/messages/en.json` then `pnpm typecheck` inside `apps/web` — same two lines, same file).
  Root cause (read, not fixed — out of scope, and outside my ticket's files): the file uses
  `DOCUMENT_KINDS` at line 95 but imports only `CLASSIFIABLE_DOCUMENT_KINDS`. `packages/runtime
  typecheck` reports `Done`.
- **This ticket touches `apps/web`, so the WHOLE unit suite ran once**
  (`node scripts/run-tests.mjs` from `apps/web`) → **4728/4750 pass, 20 fail, 2 skip**. All 20
  failures are in unrelated document-classification/task-polling/routing test files (none mention
  firm setup); I confirmed they are the SAME 20 failures, byte-for-byte by test name, with every one
  of my `apps/web` changes stashed out (baseline run: 4727/4749 pass, 20 fail — one test fewer
  because `fs.web.13` did not exist yet; otherwise identical). They plausibly trace to the same
  pre-existing `DOCUMENT_KINDS` defect above (document-classification UI failing to render), but I
  did not chase that further — it is unrelated to this ticket either way.
- **The browser walk I touched, `firm-setup-walk`, could NOT be run**: `pnpm --filter @clara/web e2e
  firm-setup-walk` on this lane's triple (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3550
  CLARA_E2E_NEXT_PORT=3551 CLARA_E2E_RUNTIME_PORT=3552`) builds the app first, and `next build` runs
  a full `tsc` pass that fails on the SAME pre-existing `document-kind-dialog.tsx` defect above,
  which is unrelated to any file this walk exercises but still aborts the whole build before a
  browser ever opens. This is a real gap in what I could verify — recorded under "Unverified" below,
  not silently skipped. I did not fix the unrelated file: it sits outside this ticket's files, and a
  one-line rename in a document-classification dialog is not evidence #891's own doors or component
  work correctly.
- `packages/runtime` gates (`check-frozen-workflows.mjs`, `check-parts-parity.mjs`): not run — this
  ticket touches no file under `packages/runtime` (the pre-admission interview files it mirrors were
  only read).

## Docs

- `packages/db/README.md` — the "Firm setup (0218, journey A5)" section gains a new paragraph after
  the #895 one, naming #891/0257, the new derivation door, the seed-time exclusion, the counter
  change and its exact scope, and the residual (commit gate untouched).
- `packages/db/tests/README.md` — a new "Firm setup applicability (#891,
  `0257_firm_setup_applicability.sql`)" section describing the new battery's four cells, the
  vacuity control, and the narrow follow-on fixes `firm-setup.test.mjs`/`firm-setup-polish.test.mjs`
  needed; the stale "seeded=12" mentions in the existing #895 section prose were corrected to match
  the new, correct seeded count (10) for a plan whose `entity_type`/`turnover` are unanswered.
- `CONTEXT.md` — a new term, **Firm setup applicability**, added after the existing **Firm setup**
  entry, house `term` / `_Avoid_` shape.
- `packages/db/package.json` — the new preintegration gate added to the `test` script's chain, at
  the sorted (migration-order) position, immediately after `firm-setup-polish-preintegration-gate.mjs`
  (shared file, work-order rule 7 — minimal, one-entry hunk).

## Regressions found and fixed (pre-existing tests, not this ticket's own new file)

Seeding only an `'applicable'` item is the ticket's own, unambiguous core requirement ("an
inapplicable item is not asked") — it is not the "effective required" judgment call above, and it
legitimately changes how many rows a first reconciliation inserts whenever `entity_type`/`turnover`
are still unanswered at that moment. Three pre-existing cells depended on the old, unconditional
count:

- `firm-setup.test.mjs` `p648.seed.reconcile`: `receipt.seeded` 9 → 7 (of the nine catalogue rows
  still missing, `mpers_eligibility`/`tin` are undetermined — neither `entity_type` nor `turnover`
  is among the planted v3 items).
- `firm-setup.test.mjs` `p648.seed.empty`: `first.seeded` 12 → 10, and the direct row-count check
  12 → 10 (a brand-new plan; both conditional items are undetermined).
- `firm-setup-polish.test.mjs` `p895.seed.noop`: `first.seeded` 12 → 10 and
  `seededEvents[0].seeded` 12 → 10 (same reason); the "already fully seeded" message on the no-op
  second seed was reworded, since the true reason is now "still undetermined," not "already
  present" — the assertion value (`0`) is unchanged and still correct either way.
- `firm-setup.test.mjs` `p648.capture.ineligible`: this cell's own loop answers `entity_type` and
  `turnover` as an INCIDENTAL side effect of proving the OTHER nine items capture no knowledge
  record, then tries to answer `tin`/`mpers_eligibility` later in the SAME loop — which now refuses
  (`firm_setup_item_not_seeded`) unless the checklist is reconciled again after each dependency is
  answered, so I added exactly that reconciliation call immediately before the loop reaches either
  key. Separately, the loop's own `sampleAnswer` helper answers `turnover` with its first option
  (`'<RM1M'`), which would make TIN permanently exempt and refuse this very loop's own later attempt
  to answer it — I overrode `turnover`'s answer to `'RM1M-5M'` in this one cell only, preserving its
  original intent (TIN captures no knowledge record either way).

I verified `p648.commit.outstanding` — the cell whose own loop answers `entity_type: 'sdn_bhd'`
(its `sampleAnswer` helper's first option) without ever reconciling again — still reads
`required_total: 8` throughout, unaffected by the "effective required" change above: this is exactly
because a conditional item's counter contribution requires it to be ACTUALLY SEEDED
(`i.id is not null`), not merely live-applicable, and that cell's plan never gains a seeded
`mpers_eligibility` row. This was the one regression I found through *reasoning* before writing any
code, then confirmed by running the cell (green, no edit needed) — recorded in the migration's own
header as the reason that guard exists.

## Successor contract

None. `clara._firm_setup_applicability` is a private, ungranted helper reached only from the two
existing human doors; neither `clara.seed_firm_setup_plan` nor `clara.get_firm_setup` is a frozen
chat or Work tool body or closure module, and their signatures did not change. Nothing here is a
surface a frozen chat or Work tool would need.

## Follow-ups worth filing

- The counter/commit-gate asymmetry stated above under "A judgment call" — if the owner decides the
  progress counter's new honesty about `mpers_eligibility`/`tin` should become a real commit gate
  too, that is a follow-up ticket touching `commit_firm_setup`, deliberately left untouched here.
- `required_outstanding` (`v_out`) still reads only the catalogue's static `required_for_commit`
  flag, unlike the counter — #895's own stated residual, still true, now joined by a second reason
  (it also never reflects a seeded-and-applicable conditional item the way the counter now does).
  Named here rather than silently left inconsistent.
- The pre-existing `apps/web` typecheck failure (`document-kind-dialog.tsx`, `DOCUMENT_KINDS` not
  imported) — already flagged by both #894's and #895's reports in this lane; still present, and it
  now also blocks EVERY `next build` (so every `apps/web` e2e walk) on this branch, which neither
  earlier report had occasion to notice since neither touched `apps/web`. Worth escalating beyond a
  routine follow-up given it is wave-wide (every lane shares this base commit) and blocks e2e, not
  merely `typecheck`.

## Unverified

- The `firm-setup-walk` e2e spec was not run (see "Gates" above) — blocked end-to-end by the
  pre-existing, unrelated `document-kind-dialog.tsx` build failure, confirmed independent of my own
  changes. The web-layer behaviour (hide/mark inapplicable items) is verified only at the unit-test
  level (`fs.web.13`) and by direct reasoning about the existing spec's fixture (the mock backend
  `firm-setup-mock.mjs` never sets `applicability`, so the existing walk's behaviour is unaffected —
  confirmed by reading the mock and the spec, not by running it).
- Whether any hosted/production firm currently has `entity_type` answered as something other than
  `sdn_bhd` with `mpers_eligibility` already answered (or turnover under `<RM1M` with `tin` already
  answered) — I have no access to hosted catalog state from this lane; if such a firm exists, this
  ticket's read-time re-derivation will report it `inapplicable` (with its answer intact) on its
  very next read, which is the desired, tested behaviour, but I cannot confirm any real row
  exercises it today.
- The full `packages/db` whole-suite run's outcome beyond the specific files/gates listed above — not
  attempted, per the same rationale #895's own report gives (out of scope for this ticket's required
  gates, which are the touched/adjacent files plus operation-census/rig-isolation).
