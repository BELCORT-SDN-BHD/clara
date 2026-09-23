# wave 2 · lane 04 · ticket #976 — fold the duplicated completion wall shared by `complete_fixed_asset_particulars` and `_fa_complete_particulars_core`

**Status: DONE.** Branch `riders/w2-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\651`,
database `clara_l04` (127.0.0.1:55744). Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
git log --oneline 23cfad94..HEAD
bc3dd6372 docs(db): #976 the particulars completion-wall fold and its grants-table row
e0f02845d fix(db): #976 fold the fixed-asset particulars completion wall into one routine
4a27e15a0 docs(db): #973 module docs for the leg-pairing fold, wiki-lint fix, test cleanup
75b9f0df4 fix(db): #973 restore both splices 0227 and 0042 install into the poster's live body
e71f1541e fix(db): #973 fold the depreciation leg-pairing aggregation into one routine
497d02455 test(db): #972 leave x41.s4's allow-list alone — the b3 residue is an A6 window, not an explained red
44449bcdb fix(db): #972 the fixed-asset birth honours the enrolment watermark on every firing
```

The ticket was verified live on this branch before building: `gh issue view 976 --json
title,body,comments,labels,state` returns **zero comments**, so the body's own "Agent Brief" is
the newest and only spec. Read both target bodies' live `prosrc` off `clara_l04` before writing a
line of the migration (below): neither routed through the other, each independently carried the
"first completion is not a change" refusal (#651) and the older "already complete" refusal, and
neither #972 nor #973 (this lane's own two earlier tickets) touched either body — confirmed by
`grep` over `packages/db/migrations/0247_fa_birth_watermark.sql` and
`0248_fa_depreciation_leg_fold.sql`, which mentions the pair only in a comment naming it as
out-of-scope. Nothing on `main` had folded them either. The ticket was fully live.

## Seams I tested at (written down before the first test)

The brief's "Key interfaces", one to one:

1. **`clara.complete_fixed_asset_particulars`** — the human door (0041), `clara_authenticated`
   only. Signature, grants and every OTHER refusal unchanged; asserted unchanged (T.7, T.8 in
   the migration; the existing `p651.class.completion_refused` regression).
2. **`clara._fa_complete_particulars_core`** — the shared core behind the runtime door
   `complete_fixed_asset_particulars_for` (0216). Same shape.
3. **`clara._fa_validate_particulars`** — the brief asks to "confirm its key set is stable before
   folding". Pinned byte-for-byte in the prestate AND re-read byte-for-byte in the tail (T.6) —
   its `sha256(prosrc)` is identical before and after this file.
4. **The catalog** (`pg_proc.prosrc`, `pg_proc.proacl`) — the repo's documented structural
   standard for a recut body (prestate `sha256(prosrc)` pins, tail assertions, `p976.core.shape`).
   Work order rule 4 says this standard wins over "no structural cells".

No test touches an internal collaborator or a private function except the one the ticket's own
fold mints and which has no other way to be exercised at all (`p976.core.shape` reads it off the
catalog; nothing calls it except the two doors).

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| Only one place contains the "first completion is not a change" check | **done** | Migration tail T.4/T.4b: the normalized change-class fragment occurs in exactly one `clara` function, named `_fa_assert_particulars_completable`. `p976.callers.recut` re-proves the same fact independently, off the catalog, at test time. |
| Only one place contains the "already complete" check | **done** | Migration tail T.5/T.5b: the normalized already-complete-onward fragment occurs in exactly one `clara` function, same name. `p976.callers.recut` re-proves this independently too. |
| Both the human door and the runtime completion path still refuse the same two cases with the same error codes and detail shapes | **done** | The two wall fragments are lifted **byte-for-byte unchanged** (zero identifier substitution — `p_asset` kept as an explicit parameter alongside the locked row `fa`, even though `fa.id` would equal it, precisely so nothing about either raise's message/errcode/detail text moved). `p651.class.completion_refused` (existing regression, unmoved) still passes for the change-class refusal through both doors. `p976.behaviour.already_complete_both_doors` (new — see below) proves the SAME for the already-complete refusal, through both doors, which nothing in the repo tested before this ticket. |
| Existing fixed-asset acquisition tests covering the completion wall pass unchanged | **done** | `depreciation-history.test.mjs` **19/19**, `fixed-asset-acquisition.test.mjs` **23/23**, `x41-wave-d-a-fa.test.mjs` **13/13**, `x41-depreciation.test.mjs` **13/13**, `x41b0-surface.test.mjs` **9/9**, `x56-rest-j.test.mjs` **3/3** — all green, byte-identical test files (`git diff` on every one of them is empty). |
| Ships as its own migration, at the next free number; recuts function bodies only; never edits a migration already merged | **done** | `packages/db/migrations/0249_fa_particulars_completion_fold.sql`, the number reserved in the prompt. `git diff BASE..HEAD --stat -- packages/db/migrations/` shows only `0247` (#972's), `0248` (#973's) and `0249` (mine) added — nothing edited. |

## The judgement call: two fragments, not one, and why the wall could not be lifted whole

The brief frames the fold as "one function owns the completion wall". Measuring both bodies'
`prosrc` before writing anything showed the wall is not one contiguous block that differs only in
its surroundings: the **"first completion is not a change"** check sits immediately after the
op-key check, **before** `clara._reserve_op` runs; the **"already complete" → lifecycle →
validator → non-depreciable → residual** chunk sits **after** the row is selected-for-update. The
text *between* the two checks (`_reserve_op`, the firm-membership check, the advisory lock, the
select-for-update) is genuinely different between the two doors — the human door resolves
`c := clara._human_ctx(...)` and reserves under a literal verb name with **no DETAIL** on its
CLR10/CLR11 refusals; the core takes `p_firm`/`p_actor`/`p_door` as arguments and **carries a
DETAIL** on those same two refusals (`invalid_op_key`, `client_not_found`, `asset_not_found`) —
and that difference is each door's own province, out of this ticket's scope by the brief's own
"Out of scope" section (nothing there names those three refusals, and the brief's own examples of
what stays untouched are grants and signatures, not this).

So the fold lifts **two** fragments — `FRAG_CHANGE_CLASS` and `FRAG_ALREADY_COMPLETE` — into one
new function, `clara._fa_assert_particulars_completable(p_asset uuid, fa clara.fixed_assets,
p_particulars jsonb)`, called once, at the point where `fa` becomes available (after the row is
locked) in both doors. This moves the change-class check's runtime position from before
`_reserve_op` to after it. **Measured as safe, not merely convenient**: `0004_governed_fns.sql`'s
own header states "audit_log records committed SUCCESSES only (a RAISE aborts the txn incl. the
receipt)" — an uncaught exception rolls back every DML the same call already did, including
`_reserve_op`'s own insert into `clara.op_receipts`, whichever line the RAISE is on. A retry with
the same `op_key` therefore sees no stale reservation either way. The only observable consequence
is refusal PRECEDENCE for a caller sending **both** a bad client/asset **and** a change-class key
in the same call — measured absent from every existing test (`grep -rn
fa_change_class_on_completion packages/db/tests/*.test.mjs` finds exactly the two call sites 0227
itself added, neither combined with a bad client or asset) — and AC3 pins the CODE and DETAIL
SHAPE of the two NAMED refusals, not their precedence against an unrelated third one. Documented
in the migration's own header, `packages/db/README.md`, and here.

`p_asset` is kept as an explicit parameter on the new function even though `fa.id` is always equal
to it (both callers select `fa` `where id = p_asset`) — a deliberate, mildly redundant choice so
the extraction is a byte-for-byte lift with **zero identifier substitution**, the same discipline
0248's own header states for its aggregation fold ("Lifted verbatim… so the fold changes WHERE the
arithmetic lives, never WHAT it computes").

## A genuine coverage gap this ticket found and closed

`grep -rln fa_particulars_already_complete packages/db/tests` before this ticket returns only the
two fixture files that **define** the token string (`fixed-asset-acquisition-fixtures.mjs`,
`x41-fa-fixtures.mjs`) — **nothing in the repo ever drove the refusal through either completion
door**. `p651.class.completion_refused` (0227's own regression) exercises the *other* named
refusal (`fa_change_class_on_completion`) through both doors, but never completes an asset twice.
`p976.behaviour.already_complete_both_doors` closes that gap: completes one asset through the
human door, completes it **again** through the human door (refused, same code/detail), completes a
**second** asset through the runtime door, completes it **again** through the runtime door
(refused, same code/detail) — proving AC3's "same code, same detail shape" for the refusal AC4's
own regression suite never reached.

## Migration

`packages/db/migrations/0249_fa_particulars_completion_fold.sql` — mints
`clara._fa_assert_particulars_completable(uuid, clara.fixed_assets, jsonb)` (both wall fragments,
lifted unchanged, the human door's own richer comments kept since the core's copy lacked two of
them — a documentation improvement, not a behaviour change), recuts
`clara.complete_fixed_asset_particulars` to call it once its row is locked, and recuts
`clara._fa_complete_particulars_core` the same way.

**Prestate `sha256(prosrc)` pins, all MEASURED on `clara_l04` before any edit, off
`pg_proc.prosrc`:**

| body | sha256(prosrc) | kind |
|---|---|---|
| `clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)` | `ae9defd63822ffe6dfd7880a173cca7d92cc5b30d4baf83043f6af77b0b7bf06` | recut |
| `clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)` | `0ef75c4e8b223a1fc11f1fa3a860d02a6ce52f65ff5d551f8ffefcfebf7ead6a` | recut |
| `clara._fa_validate_particulars(jsonb)` | `971242090b8171fa7f5ca50acdba9f536b07b498018a12d9778cb24d2d40858b` | unmoved |
| `clara._fa_particulars_complete(clara.fixed_assets)` | `4f96d11ef385a1b5ca26eedb088a4de8e7c6b0d457576053039468fcad6b32a9` | unmoved |
| `clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)` | `33c4b0b5a36a7d023a7f43a816a4ec7d5ffb01cf0a6ae1fec9c6937128c1d842` | unmoved |
| `clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)` | `c814f6fd766565653e9649fa02b23b69f2b7c968f2988efff298a2a6ca48b437` | unmoved |

**Post-image pins, measured after apply:**

| body | sha256(prosrc) |
|---|---|
| `clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)` | `2cc88278d9fe2e14028521399b77b888adc31230bb9ada0e96ff0bcb6f74b9fc` |
| `clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)` | `6bee4417ce5df40543c008c023d6c698a41eda0d324b91d529750d8b36e4c82a` |
| `clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb)` | `6c9f276d5bb6abe1cea694239d405937676d08e64ae4bdc697ba16b225d3a6e6` |

Migration file checksum recorded in `clara.schema_migrations`: `b4142f5a8df54e75db9b7002cef09a97e57adb3a54dd8f37d81c19334310774a`.

Tail T.1–T.8: the new core exists, `stable`, `SECURITY DEFINER`, owned by `clara_fn_owner`,
`search_path` pinned, EXECUTE granted to nobody (T.1); both recut bodies call it (T.2) and neither
raw fragment survives in either (T.3/T.3b); each fragment now lives in exactly one function, named
(T.4/T.4b, T.5/T.5b); the four siblings are byte-for-byte unmoved (T.6); both recut doors keep
owner/definer/search_path/no-PUBLIC-grant (T.7); the two doors' own internal caller sets are
unchanged — nothing calls the human door, only `complete_fixed_asset_particulars_for` calls the
core (T.8/T.8b).

**Applied cleanly on the first `pnpm db:migrate` attempt** — `1 new migration(s) applied · 232
total`. **No redo was needed** (unlike #973's ticket in this same lane, which needed three). The
prestate's own `#957 redo` branch exists (the same house convention every fold migration in this
lane carries) but was never exercised for a real edit; it WAS exercised as part of the vacuity
control below, indirectly, by manually reverting and restoring bodies with plain `create or
replace` rather than the ledger-tracked redo mode, since the guard correctly refuses a redo whose
prestate does not match either a clean pre-image or its own prior effect (see below).

**`rig-meta.mjs` cohort.** `_fa_assert_particulars_completable` is a brand-new ungranted core, so
it needs its own bimodal cohort — folding it into an existing 0216/0227/0248 cohort would report
that cohort PARTIAL on every database between 0216 and 0249 (`cohortFailures()` fails a partial
cohort by design). Added `FA_PARTICULARS_COMPLETION_FOLD_0249_COHORT` and its `cohortFailures(...)`
call, gated the same way `FA_DEPRECIATION_LEG_FOLD_0248_COHORT`'s own check is (`.filter((n) =>
liveNames.has(n))`, only consulted when the name is live).

## The vacuity controls I ran (not just described)

1. **ACL vacuity anchor.** Manually re-granted `EXECUTE` to `PUBLIC` on
   `clara._fa_assert_particulars_completable` (a direct `grant`, outside the migration).
   `p976.core.shape` reddened immediately (`expected true, actual false` on the "no grant beyond
   the owner's own" assertion). Revoked back to owner-only; `p976.core.shape` green again;
   `select proacl` confirmed the ACL is exactly `{clara_fn_owner=X/clara_fn_owner}`, matching the
   post-migration state.
2. **Callers-recut vacuity anchor.** Manually reverted `clara.complete_fixed_asset_particulars` to
   its exact pre-fold body (`create or replace` with the measured pre-image text). `p976.callers.recut`
   reddened for the right reason: `"clara.complete_fixed_asset_particulars calls
   clara._fa_assert_particulars_completable( (its body does not)"`. Restored the door to its
   exact post-fold text (the same `create or replace` the migration itself issues); re-measured
   `sha256(prosrc)` afterward — `2cc88278d9fe2e14028521399b77b888adc31230bb9ada0e96ff0bcb6f74b9fc`,
   matching the post-image pin above exactly. Re-ran the full battery (`fa-particulars-completion-fold.test.mjs`
   + `depreciation-history.test.mjs` + `fixed-asset-acquisition.test.mjs`): **45/45 pass**.
3. **The absent-migration red, captured before the migration existed.** All three new tests were
   written and run FIRST, against `clara_l04` before `0249` existed: all three failed with
   `assert.fail`'s own message naming the migration as absent (not a silent skip — this is the
   FOCUSED shape, `CLARA_ALLOW_MISSING_FA_PARTICULARS_COMPLETION_FOLD` unset), confirming the
   frontier gate itself works before trusting any green it later reports.

## Gates, with counts

| gate | command | result |
|---|---|---|
| new test file, focused (gate module NOT preloaded — final acceptance shape) | `node --test --test-concurrency=1 tests/fa-particulars-completion-fold.test.mjs` | **3 pass · 0 fail · 0 skip** |
| new test file, full gate chain (53 `--import`) | `node --test --test-concurrency=1 $GATES tests/fa-particulars-completion-fold.test.mjs` | **3 pass · 0 fail · 0 skip** |
| the #651 regression this ticket touches | `node --test --test-concurrency=1 tests/depreciation-history.test.mjs` | **19 pass · 0 fail · 0 skip** |
| the #639 acquisition regression | `node --test --test-concurrency=1 tests/fixed-asset-acquisition.test.mjs` | **23 pass · 0 fail · 0 skip** |
| the x41 wave-D-a FA regression | `node --test --test-concurrency=1 tests/x41-wave-d-a-fa.test.mjs` | **13 pass · 0 fail · 0 skip** |
| x41 depreciation / b0-surface / x56-rest-j | `node --test --test-concurrency=1 tests/x41-depreciation.test.mjs` / `tests/x41b0-surface.test.mjs` / `tests/x56-rest-j.test.mjs` | **13/13, 9/9, 3/3 — all pass** |
| SQL-function gates (added a new function) | `node --test --test-concurrency=1 tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests · 32 pass · 0 fail · 1 skip** (T19 destructive; reset flags never set) |
| gate-chain census + redo battery | `node --test --test-concurrency=1 tests/preintegration-gate-chain.test.mjs tests/migrate-redo.test.mjs` | **13 pass · 0 fail · 0 skip** |
| `pnpm lint` (worktree root) | — | **exit 0**; `check-wiki-dynamic-sql`: 1412 function definitions (was 1411 — exactly the one new function), 212 change-of-record patches (unchanged — this migration used plain `create or replace`, never a `pg_get_functiondef`+`execute` splice, so it hit none of #973's dynamic-SQL false-positive surface) |
| `pnpm typecheck` (worktree root) | — | **FAILS, inherited from BASE, in `apps/web`** (see below); `packages/runtime` alone: **Done**, 0 errors |
| `apps/web` unit suite / browser walks | not run | this branch touches **no** `apps/web` file (`git diff BASE..HEAD --stat -- apps/web` is empty, including this ticket's own two commits) |
| `packages/runtime` checks | not run as separate commands | this branch touches no `packages/runtime` file; `pnpm lint` runs `check-frozen-workflows`/`check-frozen-evaluators` anyway — both green (part of the exit-0 lint run above) |

**The inherited typecheck red — the SAME one #972's and #973's own reports name.**
`apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name
'DOCUMENT_KINDS'` and `(95,42): error TS7006: Parameter 'k' implicitly has an 'any' type`. Confirmed
again: `git diff 23cfad94..HEAD --stat -- apps/web` is empty for this ticket's own two commits. This
is the wave's integrated head not typechecking, not #976.

## Docs

`packages/db/README.md`: the completion-wall duplication (named as a residual in #973's own report
and in the ticket's "Context") is rewritten as RESOLVED alongside the leg-pairing fold, with the
one deliberate reordering explained and justified from the estate's own documented invariant; a
grants-table row documents the new ungranted core. `packages/db/tests/README.md` gains "The
fixed-asset particulars completion-wall fold (#976)": the three `p976.*` cells, why the wall could
not be lifted as one contiguous fragment, and the gate module's migration-order position. No
`CONTEXT.md` change: the migration's own header states it coins no new domain vocabulary — matching
#973's own conclusion for the sibling fold — and that holds; nothing here is a term the business
speaks, only an internal validation routine's home.

## Successor contract

**None.** #976 adds no door, no grant, no refusal token and no read; both completion doors' and
`complete_fixed_asset_particulars_for`'s and `revise_fixed_asset_particulars`' signatures and
refusal codes are byte-for-byte what they were (four of the six pinned bodies are literally
unmoved; the two recut ones keep their exact signatures, grants and CODEs). No frozen chat or Work
body needs anything: the acquisition flow's runtime door
(`complete_fixed_asset_particulars_for`) is called through the same contract it already had, and
that contract is unchanged (pinned and re-read). Nothing is owed to the shared `chatTurn_v22` /
`claraWork_v6` cut at the end of wave 4.

## Follow-ups worth filing

1. **The op-key-required and firm/asset-not-found refusals still differ in DETAIL shape between
   the two doors** (the human door carries no DETAIL on CLR10/CLR11; the core carries
   `invalid_op_key`/`client_not_found`/`asset_not_found`). Out of THIS ticket's scope (the brief
   names only the two wall refusals), but a future ticket unifying the two doors' surrounding
   machinery — the way #976 unified the wall — would remove the last remaining behavioural
   asymmetry between them.
2. **#973's own follow-up #3 (this ticket) is now closed**; #973's follow-ups #1 (the two
   invisible runtime splices on `_fa_run_period_core`) and #2 (`check-wiki-dynamic-sql`'s
   comment-masking gap inside `do` blocks) remain open and are unrelated to this ticket's own
   surface (this migration used no `pg_get_functiondef`+`execute` splice at all, so it could not
   hit either).

## Anything unverified

- **Hosted: nothing.** Every figure here is local, on `clara_l04` at 127.0.0.1:55744.
- The **from-scratch** proof of 0249 (a chain 0001→0249 on a disposable cluster) is the
  integrator's; RIG.md forbids a second from-scratch chain on a lane cluster, so I did not run one.
  My prestate pins were measured on THIS rig's live catalog (0001..0234 + 0247 + 0248 + this
  branch's own commits), which is the closest a lane worker can get to that proof.
- The refusal-precedence side effect (change-class check now running after the op-key
  reservation/row-lock instead of before) is reasoned from this estate's own documented invariant
  (`0004_governed_fns.sql`'s header) and from a `grep` showing no existing test constructs the
  double-invalid input that would expose a precedence difference — it is not independently
  fuzz-tested against every possible combination of simultaneous refusals.
