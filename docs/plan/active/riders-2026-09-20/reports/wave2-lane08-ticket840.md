# Wave 2 · lane 08 · ticket #840 — Show the successor link on the `work.cancelled` Activity row

**Status: DONE.** Branch `riders/w2-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`,
database `127.0.0.1:55748/clara_l08`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
a60a3f40d fix(web): DocumentKindDialog's trigger items referenced undefined DOCUMENT_KINDS
dbe37fa07 feat(web): #840 render the successor Work link on a cancelled row
00caf708d fix(db): #840 project the successor Work id onto a work.cancelled row
```

Working tree clean. No commit preceded mine in this lane (`git log 23cfad94..HEAD` was empty at
start; `git status` showed nothing to commit; no migration had been applied to `clara_l08` yet).
The contract is the 2026-09-17 triage comment's Agent Brief on issue #840 — there is no separate
owner ruling comment dated 2026-09-20 on this ticket, and it is still the newest comment.

**The ticket was still live**, measured before any change: `clara.list_activity`'s live body (sha
`dec4bc22c7d01ca67e651168aa18718f05e47b9c9aba2ec84288981992e9f870`) and `clara.get_activity_event`'s
(sha `80bc1390416da02e3787cd64ea4a3df483402edafd5eb8067ae6289bc5b8531f`) both projected no
`successor_work_id` key at all — confirmed by `position('successor_work_id' in prosrc) = 0` on both,
which is also the migration's own §0.4 idempotence probe.

## The seams I tested at (written before the first test)

- **`clara.list_activity` / `clara.get_activity_event`** — the two doors the brief names. Tested
  through the doors themselves (`packages/db/tests/activity-feed.test.mjs`, af.31/af.32), never
  through an internal projection.
- **"The activity feed component"** — resolved to `apps/web/components/firm/activity/activity-row.tsx`
  (the row card) and `activity-event-sheet.tsx` (the detail Sheet), the two surfaces that already
  render the identical two-sided pattern for a journal correction (`original_entry_id`/
  `replacement_entry_id`, `linksToOriginal`/`linksToReplacement`). I did not touch
  `work-activity-view.tsx` (a Work's own Activity tab) or `firm-recent-activity.tsx` (Firm Home's
  band): the brief names the feed's row/detail rendering, not every list that happens to render an
  `ActivityRow`, and both of those surfaces read the same `ActivityRow` type additively — nothing
  there needed a change to keep working, and nothing there was asked to gain the link.

No test at a seam the brief does not give: I did not touch `clara.cancel_accounting_work` or
`clara.restate_accounting_work` (unchanged; #750/0199 and #721/0200 already cover the payload this
ticket reads), and I did not widen `get_activity_event`'s detail shape beyond the one field (out of
scope, stated explicitly in the brief).

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | `af.31 … carries the successor id in BOTH doors …` — `successor_work_id` read `undefined` against the actual restated Work's uuid, on both doors, when run against the pre-image bodies (measured by a deliberate revert, see "Vacuity control") | migration 0262's additive `successor_work_id` projection in both doors |
| 2 | `af.32 … the key is PRESENT …` — same reverted-body run, `hasOwnProperty` false | the same recut (the key is unconditionally present, jsonb/SQL null when no successor) |
| 3 | the web row/Sheet had no rendering for the field at all (read, not driven by a failing unit test — see "Anything unverified" for why) | `ActivityRow.successor_work_id` type, `activity-row.tsx`'s new link block, `activity-event-sheet.tsx`'s new `<dt>/<dd>` pair, `linksToSuccessor`/`eventSuccessor` in `en.json` |
| 4 | `#840: a work.cancelled row … links to its successor` (e2e) — no such row/link existed in the mock or the walk | `activity-mock.mjs`'s `CANCELLED_ROW` fixture, the two new Playwright cells |

Slice 1/2 are the only ones that touched the database; their vacuity control was run by hand against
the live functions (below) rather than through the migration file, because the migration itself is
the code under test — the same shape lane 09's #839 report used for its own single-migration ticket.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| A cell proves a `work.cancelled` row for a restated Work carries the successor id in both doors and that every other row carries null | **done** | `packages/db/tests/activity-feed.test.mjs` af.31: restates a fresh Work (`restateAccountingWork`), asserts the retired Work's `work.cancelled` row's `successor_work_id` equals the new Work's id in `list_activity`, then asserts the SAME value from `get_activity_event` addressed at the same row id. The SAME page also carries an unrelated, separately posted Work's `operation_receipt` row (`postWorkEntry`); af.31 asserts ITS `successor_work_id` is null in both doors — the additive-only half. af.32 proves an ORDINARY cancellation (no successor) carries an explicit null, not an absent key (`Object.prototype.hasOwnProperty`), in both doors. |
| A cell proves every existing `list_activity` cell still passes (row shape is additive only) | **done** | The full existing battery — every one of af.1 through af.30 (the #632/#728/#630/#770 lineage this file already carries) — was re-run in the SAME invocation as af.31/af.32: 33/33 pass, 0 fail, 0 skipped. Migration 0262's own §T tail census additionally re-measures, against the COMMITTED text, that every arm 0202 shipped (kept-sweep array/exclusion, the work-kind arm, the bookkeeper floor, the limit clamp, both CLR10 refusals, the `p_work` predicate and its arm-skip, the aggregate order, the page envelope, the three-arm union) and every branch 0184 shipped in `get_activity_event` (all three source branches, the CLR11 refusal, the sweep-detail exclusion, the provenance triple) survived untouched. |
| The activity-feed walk shows the successor link on a cancelled row | **done** | `apps/web/e2e/activity-feed-walk.spec.ts`, `#840: a work.cancelled row for a restated Work links to its successor` — asserts the row's link carries the exact `href` (`/clients/<client>/work/<successor>`) and that clicking it navigates there. A second cell, `#840: an ordinary (non-restated) row offers no successor link, on the row or in its detail`, proves the negative on BOTH the row and the Sheet (scoped to `[data-slot="sheet-content"]` so the page's own restated-Work row does not leak a false pass). |
| The migration applies on a from-scratch chain | **done, at the scope RIG.md gives a lane** | `clara_l08` was built from-scratch through the full 0001→0234 chain at rig setup (RIG.md); `0262_activity_successor_link.sql` applied cleanly on top of that chain on the first real attempt (after one failed dry-run over a counting mistake in my own tail assertion — see "The migration"), bringing it to 230 files, ledger checksum verified byte-identical to the file on disk. A SECOND, independent from-scratch chain was deliberately NOT run: RIG.md is explicit that a lane never needs one ("Lanes never need it: the integrator runs the from-scratch proof on a disposable cluster") and forbids running a second one on a cluster that already ran one. |

## The migration

`packages/db/migrations/0262_activity_successor_link.sql` — the number reserved for this ticket.
Applied to `clara_l08`; ledger checksum `1c8227549a0f85acdbd5e5c6682000a876565247a9d909d39400c95e1294fccf`,
byte-identical to the file on disk (verified by `sha256` of the file against
`clara.schema_migrations`). Chain now 230 files.

**Prestate pins, MEASURED on this rig now** (`encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed
by `to_regprocedure`, never transcribed from a file's own text):

- `clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)` =
  `dec4bc22c7d01ca67e651168aa18718f05e47b9c9aba2ec84288981992e9f870` — 0202's own body, still live.
- `clara.get_activity_event(text,text)` =
  `80bc1390416da02e3787cd64ea4a3df483402edafd5eb8067ae6289bc5b8531f` — 0184's own body, still live.
- Posture pin for BOTH (measured identical): `clara_fn_owner | false |
  search_path=clara, pg_temp,plan_cache_mode=force_custom_plan |
  clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner`.

**What it changes.** Both doors gain ONE additive jsonb key, `successor_work_id`, via
`create or replace function` over their UNCHANGED signatures (never a drop+create — neither door
gains a parameter, and the return type is `jsonb`, so a new key inside the returned object is not a
signature change). `list_activity` adds a new column, at the SAME ordinal position (immediately
after `work_id`) in all three union arms' base CTEs (`ev_base`/`ar_base`/`orx_base`) so the
`union all` stays positionally aligned; only `ev_base`'s is a real computation (a second, narrower
correlated `clara.domain_events` lookup gated `event_type = 'work.cancelled'`, reading
`payload->>'superseded_by'` with the same uuid-shape-before-cast discipline the sibling `work_id`
read already uses), `ar_base`/`orx_base` project `null::uuid`. `get_activity_event` adds the same key
to each of its three `jsonb_build_object` branches. Nothing else moves: `create or replace`
preserves owner/`SECURITY INVOKER`/both pinned settings/the exact ACL automatically, and the tail
re-reads all four and refuses on drift rather than assuming the promise held.

**One real mistake, caught by the tail itself, before landing.** My first apply attempt failed
inside its own transaction: my own tail asserted `list_activity`'s pre-existing `as work_id`
occurrence count as exactly 3 (one per arm), but the pre-image body already carried a FOURTH
mention inside 0202's own comment (`` `null::uuid as work_id` UNCONDITIONALLY ``, inside the `ar`
CTE's `where`) — measured against the saved pre-image dump (`grep -c "as work_id"` = 4). I fixed the
expected count to 4 (with a comment explaining the split between real columns and the inherited
comment) and re-ran; it applied on the first real attempt after that. The runner rolled the failed
attempt back cleanly and recorded nothing in the ledger — no redo was needed for this fix.

**No new rig-meta cohort**, and this is a finding rather than an omission — the identical shape
0183's own note records for its FIRST body-only recut of these same two names, and 0200's note
records for its own body-only recut of a 0180 sibling. `clara.list_activity`/`get_activity_event`
are still 0181's SAME two doors at their SAME signatures and grant
(`ACTIVITY_FEED_0181_HUMAN_FNS` already covers them); I added a `#840 END`-bracketed comment beside
that constant in `packages/db/tests/rig-meta.mjs` recording why, rather than inventing a cohort with
nothing to be half-present in.

**Redo, used once, for the vacuity control's OWN restoration** (recorded per the ticket's own
instruction to record it): after deliberately reverting both function bodies to their pre-image text
by hand (raw SQL, never a second migration file) to prove af.31/af.32 red, I restored the migration's
committed body via `CLARA_MIGRATION_REDO=0262_activity_successor_link` (the FULL version stem, not
the bare number — the runner's `byVersion` key). It re-applied the SAME file in the same transaction
discipline a normal apply uses; both functions' sha256 after the redo differ from BOTH the pre-image
pins AND matched — by full test re-run, not just checksum — the state my very first successful apply
had produced.

## Vacuity control

Both `clara.list_activity` and `clara.get_activity_event` were recut on the rig, by hand (a short
Node script using the saved pre-migration `prosrc` dumps, never a second migration file), back to
their EXACT pre-image text (`list_activity` re-measured at
`dec4bc22c7d01ca67e651168aa18718f05e47b9c9aba2ec84288981992e9f870`, matching the prestate pin
exactly). `packages/db/tests/activity-feed.test.mjs`'s af.31/af.32 were then run alone
(`--test-name-pattern="af\.3[12]"`): both failed — af.31 on `cancelledRow.successor_work_id` reading
`undefined` against the expected successor uuid, af.32 on the key not being present at all
(`hasOwnProperty` false) — red for exactly the reason the migration exists to fix. The bodies were
restored through the `CLARA_MIGRATION_REDO` path (above), and the same two cells, then the whole
file, were re-run green (33/33).

## Gates, with counts

Every db command ran with `PGHOST=127.0.0.1 PGPORT=55748 PGUSER=postgres PGDATABASE=clara_l08
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; every battery ran with the **full gate chain** from
`packages/db/package.json` (`node --test --test-concurrency=1 $GATES tests/<file>.test.mjs`).
`CLARA_RIG_ALLOW_RESET`/`CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

| gate | result |
|---|---|
| `tests/activity-feed.test.mjs` (touched, +2 cells) | **33 pass / 0 fail / 0 skipped** (includes every pre-existing #632/#728/#630/#770 cell, unchanged) |
| `tests/operation-census.test.mjs` (touched `packages/db/tests`) | **10 pass / 0 fail / 0 skipped** — `opcen.1` (no unwaived hard finding) and `opcen.2` (frontier = ledger's own count/max version, 230/`0262_activity_successor_link`) both pass, confirming the recut introduced no ACL/grant-boundary finding |
| `tests/rig-isolation.test.mjs` (touched `packages/db/tests`; no reset flags) | **22 pass / 0 fail / 1 skipped** — the skip is T19 `poison-role`, which demands `CLARA_RIG_ALLOW_RESET`; RIG.md forbids it. T17 (grant matrix), T17b, T18 (definer hygiene + governed RLS) all pass |
| `apps/web` — `components/firm/activity/activity-row.test.tsx`, `activity-event-sheet.test.tsx`, `activity-feed.test.tsx`, `use-activity-feed.test.ts` (touched) | **35 pass / 0 fail / 0 skipped** |
| `apps/web` — `components/documents/document-kind-dialog.test.tsx`, `document-kind-labels.test.tsx`, `documents-url-state.test.tsx`, `document-detail-live-refresh.test.tsx` (regression, after the incidental fix below) | **27 pass / 0 fail / 0 skipped** |
| `node scripts/run-tests.mjs` (the WHOLE `apps/web` unit suite, once, AFTER the incidental fix) | **4747 pass / 0 fail / 2 skipped / 4749 total** |
| `pnpm --filter @clara/web e2e activity-feed-walk` (touched `.spec.ts`, on this lane's triple: `https://127.0.0.1:3570` / `3571` / `3572`) | **19 pass / 0 fail** (17 pre-existing + 2 new #840 cells) |
| `pnpm typecheck` (worktree root) | **exit 0** — `apps/web` and `packages/runtime` both `Done` |
| `pnpm lint` (worktree root) | **exit 0** — across `apps/web`, `packages/db`, `packages/runtime` and `packages/reporting-render` |

No `packages/runtime` gate is owed: I touched nothing there.

### An unrelated, pre-existing build-blocking bug, found and fixed (its own commit, not named #840)

`apps/web/components/documents/document-kind-dialog.tsx` referenced `DOCUMENT_KINDS` at line 95
without importing it — a hard `next build` type-check failure (TS2552/TS7006) and a runtime
`ReferenceError` the moment the component renders. This is **already independently found and
recorded**, unfixed, by two other lanes this same wave: `wave2-lane03-ticket846.md` ("blocks the
typecheck gate for every wave-2 lane… belongs to whoever owns that dialog… not to a ticket that
never touched `apps/web`") and `wave2-lane09-ticket839.md` ("inherited, not mine"). Both of those
lanes could leave it red because neither owed a browser walk. **I could not**: this ticket's own
acceptance criterion required a real Playwright walk, and `next build` — which the walk runner
invokes before ever opening a page — fails on ANY type error anywhere in `apps/web`, not merely in
files the walk touches, so there was no way to run my required gate with this bug still in place.

The fix is the one-line swap both other reports already diagnose: the `SelectValue` trigger's own
`items` prop should read the SAME `#878`-filtered `CLASSIFIABLE_DOCUMENT_KINDS` the `SelectContent`
three lines below it already renders (that file's own comment already names the CLR28 refusal an
unfiltered roster there would produce), rather than the unimported, unfiltered `DOCUMENT_KINDS`.
Verified: `pnpm typecheck` clean before AND after this fix change nothing else; the 20 unit-suite
failures I measured before the fix (`document-kind-labels.test.tsx`, `documents-url-state.test.tsx`,
`document-detail-live-refresh.test.tsx`, all in the #904/#1005/#878/#629-#642 territory, none naming
Activity/work/restate) dropped to 0 after it, and I confirmed the SAME 17 failures reproduce on the
unmodified (stashed) tree before restoring my own changes — this is not something my ticket's own
changes caused.

**Landed as its own commit** (`a60a3f40d`), deliberately NOT naming `#840` in its message, so it is
trivially separable if the integrator wants #840's two feature commits without it (e.g. because
another lane's identical fix lands first and this becomes a no-op merge). Flagging for the
integrator: this is likely to be the SAME one-line change in more than one lane's branch; it should
land exactly once.

## Docs, in the same commits

- **`packages/db/README.md`**: no new section added. Neither 0181/0183/0184/0202 (the activity feed
  lineage this ticket extends) has its own README section — the file documents subsystems, not
  every migration — and a one-key additive splice to an already-documented pair of doors did not
  meet that bar. Recorded here rather than silently skipped, matching #839's own precedent for the
  identical situation.
- **`CONTEXT.md`**: no new term added. "Activity" and "Restated work / supersedes" already cover the
  concept this ticket exposes; no new vocabulary was coined.
- **`packages/db/tests/rig-meta.mjs`**: the `#840 END`-bracketed comment beside
  `ACTIVITY_FEED_0181_HUMAN_FNS`, recording why no new cohort exists (see "The migration" above).
- Inline documentation carries the rest, matching this door's own established convention (0181/
  0183/0184/0202 all document themselves in the migration file's own header/comments rather than in
  a README): the migration's own header explains the read-twice design and the drop-vs-replace
  choice at length; `lib/firm/activity.ts`'s `ActivityRow.successor_work_id` field carries a doc
  comment; both new JSX blocks in `activity-row.tsx`/`activity-event-sheet.tsx` are commented.
- Shared files touched, minimally and at the sorted position: `packages/db/package.json` (one
  `--import` token appended in migration order — my migration is the highest-numbered one landed in
  this wave so far), `apps/web/messages/en.json` (two keys, `linksToSuccessor` beside
  `linksToOriginal`/`linksToReplacement`, `eventSuccessor` beside `eventOriginal`/`eventReplacement`
  — both existing "Activity" namespace entries, at their natural adjacent position). No other shared
  file (`apps/web/test/manifest.txt` untouched — no new `.test.` file was added; `use-activity-feed.test.ts`
  was already listed and only gained one field in an existing fixture literal).

## Successor contract

**None is owed.** Neither `clara.list_activity` nor `clara.get_activity_event` changed signature,
and `clara.cancel_accounting_work`/`clara.restate_accounting_work` (the doors a frozen chat or Work
tool would call) are untouched — no frozen chat or Work tool needs a new door, a new zod input, or a
new refusal mapping. `node scripts/check-frozen-workflows.mjs` was not run because `packages/runtime`
was not touched at all (no manifest it governs could have moved).

## Follow-ups worth filing

1. **(Already tracked, now resolved by this lane)** `apps/web/components/documents/document-kind-dialog.tsx`'s
   `DOCUMENT_KINDS` typecheck break, recorded in `wave2-lane03-ticket846.md` and
   `wave2-lane09-ticket839.md` as inherited-and-unfixed. It is fixed on this branch (commit
   `a60a3f40d`, above) — the integrator should confirm no other lane's own fix for the same line
   collides awkwardly, and that the two prior reports' "follow-up" line is closed once this lands.
2. **`work-activity-view.tsx` (a Work's own Activity tab) and `firm-recent-activity.tsx` (Firm
   Home's band) do not YET render the successor link**, even though both read the same
   `ActivityRow`/`ActivityDetail` shape and would receive `successor_work_id` for free the moment
   either renders it. Out of scope here (the brief names the feed's own row/detail rendering), but a
   natural, low-risk follow-up once a ticket asks for it — the type, the field and the link builder
   (`activityWorkHref`) are all already in place.

## Anything unverified

- **The hosted estate.** Nothing here is hosted evidence; hosted evidence is pending and not mine to
  claim.
- **A true from-scratch 0001→0262 chain, independently re-run.** Not run: RIG.md rules one
  from-scratch chain per cluster and gives the integrator a disposable one for that proof. 0262's own
  prestate and tail both ran, and passed, on every one of the three times it was applied on this rig
  (the first successful apply, the redo after the vacuity control's deliberate revert).
- **Whether another wave-2 lane's own branch also independently fixes the `DOCUMENT_KINDS` line.**
  I have no visibility into sibling worktrees; flagged above for the integrator to check.
