# Wave 2 · Lane 06 · Ticket #934 — DONE (firm setup 1/2: accountant notes, user_note/retired_at)

Branch: `riders/w2-lane06` (worktree `C:\Users\zhant\Desktop\clara-wt\656`). Base:
`23cfad947b5598214168ba9c43d391b4e16aa745`. `git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD`
at start showed four commits (#894, #895, #891, all already landed):

```
7f4f0cc69 feat(web): #891 firm setup checklist hides/marks inapplicable items
33b797e72 feat(db): #891 firm setup applicability predicates
dc9f16db4 fix(db): #895 0218 firm-setup migration polish -- three defects the #648 fix round left
4d23d3c5d fix(db): #894 harden uq_onboarding_plans_one_open_firm's predicate
```

and now shows seven:

```
544e9daa2 fix(web): document-kind-dialog references the renamed DOCUMENT_KINDS export
a43143735 docs(web): #934 firm setup checklist shows the accountant note, not the engineer note
9eb0fc61c feat(db): #934 firm setup user_note/retired_at columns and get_firm_setup recut
7f4f0cc69 feat(web): #891 firm setup checklist hides/marks inapplicable items
33b797e72 feat(db): #891 firm setup applicability predicates
dc9f16db4 fix(db): #895 0218 firm-setup migration polish -- three defects the #648 fix round left
4d23d3c5d fix(db): #894 harden uq_onboarding_plans_one_open_firm's predicate
```

`git status` in the worktree is clean after all three commits.

## Ticket

#934 "Firm setup (1/2): replace the twelve engineer notes with one accountant-readable sentence
each; user-note and retire columns on the catalogue" — the NEWEST (and only) Agent Brief is the
issue body itself, together with the owner's ruling comment dated **2026-09-20**
(`https://github.com/BELCORT-SDN-BHD/clara/issues/934#issuecomment-5744986219`): the twelve draft
notes were shown to the owner one by one with their Chinese glosses and are "approved as drafted…
seed them exactly as written," and the brief's remaining scope (user-note/retire columns, the
`get_firm_setup` recut, coordination with #895) is unchanged. Re-verified live on this branch before
building: read the live `clara.firm_setup_keys` catalogue (still the twelve shipped rows, `note`
still the engineer's provenance text) and the current `clara.get_firm_setup` body (already recut
twice, by #895/0256 and #891/0257) and confirmed neither `user_note` nor `retired_at` existed yet
and `get_firm_setup` still rendered `note` straight through — the ticket was fully live, nothing
partially satisfied.

Sibling ticket #935 (education tips) depends on the `retired_at` column this ticket adds; it is not
mine and I did not build any part of it.

## Seams tested at

- **`clara.get_firm_setup()`** through `humanQuery` as a real admin persona — the one door the
  ticket's AC1 names for the recut.
- **`clara.firm_setup_keys`** itself, read directly through `rootQuery` (never through a door — there
  is none) to plant and remove synthetic fixture rows for the two cells that need a shape none of the
  twelve shipped rows carries (`p934.notes.fallback`, `p934.notes.omits_retired`).
- **The committed `prosrc`** of `get_firm_setup` (`pg_proc`), for the migration's own tail census —
  the door is `_human_ctx`-gated, so, like every other migration in this chain, the tail proves the
  CODE SHAPE landed structurally; the BEHAVIOURAL proof is the test file's job.
- **The web checklist's rendered surface** (`components/firm-setup/firm-setup-item-form.tsx`) through
  the `firm-setup-walk` e2e spec — the ticket's AC4 named surface ("the firm-setup walk shows the new
  wording on at least two items").

## A judgment call this report states plainly

The ticket says `get_firm_setup` should "prefer `user_note` over `note`." I read "prefer" as a
PRECEDENCE rule (`coalesce(k.user_note, k.note)`), not a hard replacement — `user_note` stays
nullable, and a catalogue row with none falls back to its engineer `note` rather than rendering
nothing. Every one of the twelve rows this migration backfills carries a live `user_note`, so the
fallback never fires for them today; I built `p934.notes.fallback` against a synthetic row
specifically to prove the fallback path is real, not dead code, since none of the twelve exercises
it. The alternative reading — `user_note not null`, a hard cutover — would also have satisfied AC1's
literal words for the twelve, but it would additionally constrain #935 (a different ticket, a
different implementer, landing right after this one in the same lane) to reuse this exact column for
its own education-tip text, which the brief does not ask for and which I have no authority to decide
on #935's behalf. A reviewer who prefers the hard-cutover reading can add `not null` in a follow-up
migration without touching this file's own logic.

## Migration

`packages/db/migrations/0258_firm_setup_user_notes.sql` — applied cleanly to `clara_l06` via
`pnpm --filter @clara/db run migrate` on top of the lane's chain after #894/#895/#891 (233 files
total after apply, confirmed by the runner's own summary line below).

**Prestate pins, measured on `clara_l06` at the frontier left after #891 (0257 applied), PostgreSQL
17.11, moments before applying — hardcoded constants in the migration's own `DO` block, not
transcribed from memory:**

- `clara.get_firm_setup()` `sha256(prosrc)` (the recut gate):
  `8064ba42de736256f88e5ecd47c653ca87f58692ba38d246849392bf5f5f91a1`
- `clara.seed_firm_setup_plan(text)` `sha256(prosrc)` (a measured baseline, not a gate — this file
  never recuts it, and the tail re-measures the same sha and requires it unchanged):
  `57f8c602730119442042a5a3754efa2ca180f3f87ced0af17aea603af3060118`
- A comprehensive hash of every PRE-EXISTING column of the twelve catalogue rows (`item_key`,
  `knowledge_key`, `item_kind`, `required_for_commit`, `min_role`, `group_key`, `answer_shape`,
  `answer_options`, `answer_field`, `question`, `note`, `sort_order`, concatenated and ordered by
  `sort_order`): `156dc83bce062e83ca4fe0185f6a18f9c57891ed8fe16d4e5d4d1f7134e6a1dd` — re-measured
  byte-identical at the tail, the checked form of "append-only rows untouched."

Notices from the real apply:

```
[notice] #934 prestate: clean -- clara.get_firm_setup is live at its pinned (post-#891) pre-image
  and does not yet prefer user_note; clara.seed_firm_setup_plan's baseline is measured for the
  tail's untouched-check; clara.firm_setup_keys holds exactly the twelve pinned rows in their
  pinned order with NEITHER user_note NOR retired_at yet, its append-only trigger is present and
  enabled, its twelve rows' pre-existing columns hash to the pinned baseline, and every helper
  get_firm_setup's body calls is present.
[notice] #934 tail: OK -- clara.firm_setup_keys gained two nullable columns (user_note text,
  retired_at timestamptz, both checked/typed as expected) with its append-only trigger disabled for
  exactly the one backfill update and re-enabled immediately (measured via pg_trigger.tgenabled, not
  trusted); the twelve shipped rows each carry EXACTLY their owner-approved accountant sentence in
  user_note, none is retired, and every one of their pre-existing columns hashes to the prestate's
  pin (untouched); clara.get_firm_setup's recut prosrc carries exactly six retired_at-is-null
  filters (items[], required_outstanding, catalogue_total, v_unseeded, required_total,
  required_answered) and now prefers user_note over note, keeping every arm #891 (0257) added and
  its exact clara_fn_owner/SECURITY DEFINER/search_path/plan_cache_mode/ACL posture,
  EXECUTE-unreachable by every machine role -- the BEHAVIOURAL proof that a retired row is really
  omitted is firm-setup-user-notes.test.mjs's job; clara.seed_firm_setup_plan is byte-identical to
  its measured baseline (untouched, a named residual for a later ticket); and the other five
  firm-setup names, clara._firm_setup_applicability and #894's widened index are all present and
  unmoved.
applied 0258_firm_setup_user_notes · backend pid 373208
migrate: 1 new migration(s) applied · 233 total · target 127.0.0.1:55746/clara_l06
```

**Schema change.** `clara.firm_setup_keys` gains `user_note text` (nullable, `check (user_note is
null or btrim(user_note) <> '')`) and `retired_at timestamptz` (nullable), added by plain
`alter table … add column if not exists`, never a `create table`. **Backfill.** The twelve
owner-approved sentences are written by ONE `update`, with the table's append-only trigger
(`t_firm_setup_keys_append_only`) deliberately DISABLED for that one statement and re-enabled
immediately, inside the runner's own per-migration transaction — the
`0176_counterparty_alias_kind_scope.sql` §3 / `packages/db/tests/README.md` ("A fixture that turns a
trigger off does it in ONE transaction") house shape, applied to `firm_setup_keys` for the first
time in this lane. No pre-existing column of any of the twelve rows is in the `update`'s `SET` list;
the tail re-hashes all of them unchanged. **Recut.** `clara.get_firm_setup()` is `create or replace
function`, pre-image pinned; every line #891 (0257) added or relied on is pasted verbatim except the
targeted deltas the migration header names.

**Redo:** not used. The migration applied cleanly on its first real attempt (a PL/pgSQL mistake — a
raw `savepoint`/`rollback to savepoint` inside a `DO` block, which PL/pgSQL does not support as a
plain statement — was caught by re-reading my own draft before ever applying it, and the offending
structural-probe section was removed in favour of two lighter, byte-safe checks; see "A defect I
caught in my own draft" below).

## Acceptance criteria

- **[x] AC1 — a new migration adds `user_note` and a retire flag (append-only rows untouched), seeds
  the twelve user notes as the owner approved them, and recuts `get_firm_setup` to prefer `user_note`
  over `note` and to omit retired rows; prestate pin on the live body; tail census re-reads the
  twelve keys.**
  - Columns added, backfilled, pinned/re-measured untouched: see "Migration" above and the
    migration's own tail notice.
  - Tail census re-reads the twelve keys: `packages/db/migrations/0258_firm_setup_user_notes.sql`
    §T.4 loops all twelve `item_key`s and asserts `user_note` equals the owner-approved sentence
    (transcribed independently from the ticket text, never re-derived from the seed literals) —
    passed on the real apply (no exception raised).
  - `get_firm_setup` prefers `user_note`: `p934.notes.accountant_text` (see below) — **PASS**.
  - `get_firm_setup` falls back to `note` when `user_note` is absent: `p934.notes.fallback` — **PASS**.
  - `get_firm_setup` omits a retired row from every surface: `p934.notes.omits_retired` — **PASS**.

- **[x] AC2 — the checklist renders the user note under each question; the engineer note is no
  longer shown to users.**
  No component code change was needed or made: `firm-setup-item-form.tsx` already rendered
  `item.note` unconditionally, and `get_firm_setup` (this ticket) now puts the accountant sentence
  in that field — comments updated in `firm-setup-item-form.tsx` and `lib/firm-setup/types.ts` to
  say so accurately (`docs(web)` commit `a43143735`). Evidence the engineer note is really gone:
  `p934.notes.accountant_text` asserts the DOOR's `note` field equals the accountant sentence, never
  the old `"FIRM_SEGMENTS_V2 …"` provenance text, for all twelve keys. Evidence the SURFACE shows it:
  the `firm-setup-walk` e2e spec (AC4, below) renders the form and asserts the visible text.

- **[x] AC3 — the three cells that pin the count of twelve and the e2e firm-setup mock are updated;
  the firm-setup db and web batteries stay green.**
  The three cells (`firm-setup.test.mjs` `p648.seed.reconcile`/`p648.seed.empty`,
  `firm-setup-polish.test.mjs` `p895.seed.noop`) assert `catalogue_total`/`receipt.catalogue_total`
  equal `12` — unaffected by this ticket (no row is added, removed or retired; `catalogue_total`
  still counts a 12-row, all-live catalogue), re-verified GREEN, no edit needed (see "Gates" below).
  The e2e mock (`apps/web/e2e/firm-setup-mock.mjs`) is updated: its six modelled catalogue rows now
  carry the same owner-approved accountant sentences 0258 seeds, in place of the old
  `"FIRM_SEGMENTS_V2 …"` placeholder text, so the fixture matches the real door's new response shape.
  Both batteries green: `packages/db` firm-setup files (24/24, see Gates) and `apps/web`'s whole unit
  suite (4748/4748 non-skipped, see Gates).

- **[x] AC4 — the firm-setup walk shows the new wording on at least two items.**
  `firm-setup-walk.spec.ts`: `firmSetup.walk.answer` now asserts the visible form text for **fye**
  ("The month the firm's own financial year ends, 1 to 12. Clients keep their own year-end on their
  client record.") right after opening its form; `firmSetup.walk.responsive` asserts the visible form
  text for **tin** ("The firm's MyInvois TIN. Required when annual turnover is RM1 million or more;
  otherwise skip with a reason.") right after opening its form via keyboard. Both pass — run below.

## A defect I caught in my own draft (not shipped)

My first draft of the migration's tail included a structural probe that inserted a transient
synthetic retired row and used raw `savepoint`/`rollback to savepoint` statements inside the tail's
`DO $i934_tail$ … END $i934_tail$;` block to undo it. PL/pgSQL does not support `SAVEPOINT` or
`ROLLBACK TO SAVEPOINT` as plain statements (only a stored PROCEDURE called at the top level can run
transaction-control statements at all, and a `DO` block cannot). I caught this re-reading my own
draft before ever applying it, removed the probe entirely, and rely instead on (a) the migration
tail's static, `pg_catalog`-measured checks — six exact-count `retired_at is null` filters present in
the recut `prosrc`, checked by a substring-count rather than a fragile multi-line fragment match —
and (b) the test file's `p934.notes.omits_retired` cell for the actual behavioural proof, exactly the
code-shape/behaviour division of labour 0257's own tail already draws. Recorded here because it is a
real mistake I made and fixed, not because it ever reached the database.

## Gates

- **`packages/db/tests/firm-setup-user-notes.test.mjs`** (new, own stable stem
  `firm_setup_user_notes$`, 3 cells, one per AC1 sub-claim):
  - Focused run BEFORE the migration existed → **0/3 pass, 3/3 fail**, each failing with `assert.fail`
    at `gate()`: `"the #934 firm-setup-user-notes lane is required for a focused run: apply
    0258_firm_setup_user_notes.sql"` — red for the right reason (no STEM applied yet).
  - Focused run AFTER the migration applied → **3/3 pass**.
  - With the full 55-entry preintegration-gate chain
    (`node --test --test-concurrency=1 $GATES tests/firm-setup-user-notes.test.mjs`) → **3/3 pass**.
- **`packages/db/tests/firm-setup.test.mjs`** (touched by nothing — re-verified, no edit needed) →
  **17/17 pass**.
- **`packages/db/tests/firm-setup-polish.test.mjs`** (same) → **3/3 pass**.
- **`packages/db/tests/firm-setup-applicability.test.mjs`** (same) → **4/4 pass**.
- **`packages/db/tests/operation-census.test.mjs`** (this ticket added no new SQL function — run
  anyway per rule 8's spirit since it touched `packages/db/tests`) → **10/10 pass**.
- **`packages/db/tests/rig-isolation.test.mjs`** (same, never with reset flags) → **22/23 pass, 1
  skip** (`T19 poison-role`, the one destructive cell, correctly SKIPped because
  `CLARA_RIG_ALLOW_RESET` is unset), **0 fail**.
- **`pnpm typecheck`** (repo-wide) → **clean**, after the one pre-existing, unrelated fix below.
- **`pnpm lint`** (repo-wide) → exit 0, all pass (includes `apps/web`'s message-keys/test-manifest/
  ui-add-guard/token-contrast self-test batteries and `packages/reporting-render`'s eslint).
- **This ticket touches `apps/web`, so the WHOLE unit suite ran once**
  (`node scripts/run-tests.mjs` from `apps/web`) → **BEFORE** the pre-existing fix below:
  4728/4750 pass, 20 fail, 2 skip (all 20 failures in unrelated `documents/*` test files — see next
  section). **AFTER** the fix: **4748/4750 pass, 0 fail, 2 skip** (the 2 skips are the documented
  Windows-only reds, RIG.md).
- **The browser walk I touched, `firm-setup-walk`, on this lane's triple**
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3550 CLARA_E2E_NEXT_PORT=3551
  CLARA_E2E_RUNTIME_PORT=3552`) → **5/5 pass** (`pnpm --filter @clara/web e2e firm-setup-walk`),
  after the same pre-existing fix (it blocks `next build` for every e2e walk, not only firm-setup's;
  see next section).
- `packages/runtime` gates (`check-frozen-workflows.mjs`, `check-parts-parity.mjs`): not run — this
  ticket touches no file under `packages/runtime`.

## A pre-existing, unrelated defect I fixed to unblock these gates

`pnpm typecheck` and, downstream, `next build` (and therefore EVERY `apps/web` e2e walk, not only
mine) failed on `apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot
find name 'DOCUMENT_KINDS'` before I touched anything. **This is the SAME defect #891's, #895's and
#894's own reports in this lane already flagged** (see `wave2-lane06-ticket891.md`'s "Follow-ups
worth filing": "already flagged by both #894's and #895's reports … now also blocks EVERY next build
… worth escalating"). `git log -- apps/web/components/documents/document-kind-dialog.tsx` shows it
was last touched by the "riders wave 1 lane 08" merge, already part of this lane's base commit —
confirmed unrelated to any commit in lane 06, including mine.

Unlike the three prior tickets, I fixed it rather than reporting it unverified again, because #934
is the first ticket in this lane whose OWN required gates (a clean `pnpm typecheck`, a working
`next build` for the e2e walk AC4 needs) are directly blocked by it, and the fix is a one-token,
unambiguous correction: the file imports `CLASSIFIABLE_DOCUMENT_KINDS` (line 35) but line 95
referenced the old, pre-rename `DOCUMENT_KINDS`, which no longer exists anywhere in the file.
Changed line 95 to use the already-imported name. Verified this was the SOLE typecheck error
(`pnpm typecheck` reports `apps/web typecheck: Done` / `packages/runtime typecheck: Done` afterward)
and the SOLE cause of the 20 pre-existing `apps/web` unit failures (all in
`document-detail-live-refresh.test.tsx`, `documents-url-state.test.tsx`,
`documents-workbench-refresh.test.tsx`, `document-kind-labels.test.tsx` — none mention firm setup;
all showed `ENVIRONMENT_FALLBACK` next-intl crashes tracing through `CorrectionWizard` →
`document-kind-dialog.tsx`): the full suite went from 4728/4750 to 4748/4750 (0 fail) after this one
line, with no other change. Committed separately (`544e9daa2`), clearly labelled as pre-existing and
unrelated to #934, so it can be reviewed or reverted independently of the #934 commits.

## Docs

- `packages/db/README.md` — the "Firm setup (0218, journey A5)" section gains a new paragraph after
  the #891 one, naming #934/0258, the two new columns, the disable-trigger backfill shape, the
  `get_firm_setup` recut's precedence/omission behaviour, and the named residual (`seed_firm_setup_plan`
  untouched).
- `CONTEXT.md` — a new term, **Firm setup catalogue note**, added after the existing **Firm setup
  applicability** entry, house `term` / `_Avoid_` shape.
- `packages/db/package.json` — the new preintegration gate added to the `test` script's chain, at the
  sorted (migration-order) position, immediately after `firm-setup-applicability-preintegration-gate.mjs`
  (shared file, work-order rule 7 — minimal, one-entry hunk).
- `apps/web/lib/firm-setup/types.ts` and `apps/web/components/firm-setup/firm-setup-item-form.tsx` —
  code comments corrected to describe what `note` now carries (see AC2 above).

## Successor contract

None. `clara.get_firm_setup()` is not a frozen chat or Work tool body or closure module, its
signature did not change, and this ticket touches no runtime/workflow file. Nothing here is a
surface a frozen chat or Work tool would need.

## Follow-ups worth filing

- **The `seed_firm_setup_plan` residual** (named in the migration header and the README paragraph
  above): this ticket does not make the reconciliation door skip a retired catalogue row, because no
  row it writes is ever retired and the ticket's AC1 names only `get_firm_setup` for the recut.
  Whoever first actually retires a catalogue item (a follow-up ticket, not #935 — #935 only *adds*
  rows) must decide, and build, whether `seed_firm_setup_plan` should stop seeding it.
- The pre-existing `document-kind-dialog.tsx` defect is now FIXED (see above), closing out the
  "worth escalating" note in #891's own report — no further follow-up needed for that specific line,
  though the fact that three tickets in a row hit it before anyone fixed it may be worth a retro note
  on how wave-1-lane defects surface late in wave-2 lanes that happen to touch `apps/web`.

## Unverified

- Whether the owner's approved twelve sentences will need small wording corrections later — the
  ticket itself says so explicitly ("later wording changes are small follow-ups, not a reason to
  wait"); this migration seeds them exactly as ruled, byte for byte against the ticket text.
- Any hosted/production firm's current `firm_setup_keys.note` content beyond this lane's own rig — I
  have no access to hosted catalog state from this lane.
