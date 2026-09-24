# Wave 4 · lane 06 · fix round (single fix worker)

Branch `riders/w4-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\656`, database
`127.0.0.1:55746/clara_l06`. Base `cd2925391`; every diff and log below is `cd2925391..HEAD`.

**New head: `e470d5fe6`.**

## Commits added by this fix round

| commit | subject |
|---|---|
| `1f34b2cbe` | `fix(db): #1032 firm-setup-polish's seeded counts follow 0311's always-seeded tin` |
| `143816ec8` | `fix(runtime): #1038 the relay fixtures mint clients through root+jwt, and the census walks both fixture trees` |
| `cea8a7c30` | `fix(db): #1031 the year-end pair rule reads its sibling at the incoming applicability, and an impossible pair no longer aborts a promotion` |
| `b29932ada` | `test(web): #1032 fs.web.18 proves the OPTIONAL tin's sentence, not only its marking` |
| `e470d5fe6` | `fix(db): #1038 wave-b's ACL matrix follows create_client's withdrawn grant` |

The six commits the review examined (`e79054395` … `3275d5dcf`) are untouched.

## Verdict per finding

| id | severity | outcome |
|---|---|---|
| L06-SPEC-01 | blocker | **fixed** |
| L06-SPEC-02 | major | **fixed** (new migration `0317`) |
| L06-SPEC-03 / std-1 | major | **fixed** |
| L06-SPEC-04 / std-2 | major | **fixed** |
| L06-SPEC-05 | minor | **fixed** |
| L06-SPEC-06 | minor | **disclosed** (the reviewer's second option), not backfilled — reasoning below |
| L06-SPEC-07 | minor | **disclosed** in 0317's header, the rule's own body and `packages/db/README.md` |
| L06-SPEC-08 | minor | **fixed** (the reviewer's first option: withhold, do not abort) |
| L06-SPEC-09 | minor | **fixed** (stated plainly in the census cell's own header) |
| L06-SPEC-10 | note | left as the reviewer left it; follow-up named below |
| **(new) wb-g-tail G2** | blocker-class | **found and fixed** — a THIRD shipped-red from #1038 that neither review reached |

---

## L06-SPEC-01 (blocker) — the runtime fixtures were never moved off `clara.create_client`

**Reproduced first.** A scratchpad probe importing `packages/runtime/tests/relay-fixtures.mjs`'s
own `buildFirm()` against `clara_l06` (which carries 0316) printed
`buildFirm FAILED: code=42501 message=permission denied for function create_client`.

**Fixed.** `relay-fixtures.mjs` gains `createClientRaw`, the exact twin of
`packages/db/tests/rig-fixtures.mjs`'s: the pooled connection stays at its base identity
(`withActor`'s `role: null` branch — `reset role`, the route every migration and seed already
takes, which bypasses EXECUTE grants) with `request.jwt.claims` hand-set so `clara._human_ctx`
resolves the same actor/firm/floor a granted `clara_authenticated` caller would have had.
`createClient` wraps it and drives the Gate-O activation bridge unchanged. The two cells in
`wave-b-wiki-projection-consumer.test.mjs` that inlined the SQL for a raw, un-bridged onboarding
client call the fixture instead. After the fix the same probe printed `buildFirm OK` with a real
firm and client id.

**And the census can no longer miss it.** `p899.census.no_test_file_calls_create_client_directly`
swept `packages/db/tests` alone — which is exactly why the runtime call sites could break while it
stayed green. It now walks `packages/db/tests` AND `packages/runtime/tests`
(`CREATE_CLIENT_CENSUS_TREES`), exempting one designated fixture per tree.

*Vacuity control:* with `packages/runtime/tests/relay-fixtures.mjs` dropped from
`CREATE_CLIENT_CENSUS_EXEMPT` the cell fails and names
`packages/runtime/tests/relay-fixtures.mjs:132`; the exemption was restored byte for byte and the
file re-runs 15/15.

**Runtime batteries driven on `clara_l06` after the fix** (every one mints clients through
`buildFirm`): `wave-b-wiki-projection-consumer.test.mjs` 16/16, `authz-db.test.mjs` 3/3,
`classify-consumer.test.mjs` 8/8, `control-lease.test.mjs` 5/5, `intake-db.test.mjs` 12/12,
`g1-wake-walls.test.mjs` 7/7, `drain.test.mjs` 19/19.

## L06-SPEC-02 (major) — the sibling was read without its applicability

**Reproduced as cells, RED against 0310 before the fix existed.** `knowledge-fye-day.test.mjs`
`fd.11` and `fd.12` were written and run against the branch as it stood (0310 applied, 0317 not
yet written):

```
not ok 11 - fd.11 the sibling is read AT THE INCOMING APPLICABILITY …   (AssertionError: the capture was ACCEPTED)
not ok 12 - fd.12 …and the mirror image …                              (error: 'a financial-year end must be a real calendar day, and month 2 day 31 is not one')
```

which is exactly the false accept and the false refusal the reviewer drove by hand.

**Fixed by `packages/db/migrations/0317_knowledge_fye_pair_applicability.sql`.** 0310 is applied
and therefore immutable, and `CLARA_MIGRATION_REDO` refuses anything below the frontier, so the
fix is a forward migration. Its number comes from wave 4's **overflow block** (`0315` and up —
`riders-2026-09-20/README.md`'s own rule for a fix round that needs another migration), not the
next free number; `0315` is lane 04's `#1036` and `0316` is this lane's `#1038`, so `0317` is the
first free overflow number. **If another lane's fix round also took `0317`, the integrator
renumbers — this file has no cross-file dependency on its own number.**

What it does:

* re-cuts `clara._knowledge_assert_fye_pair` at `(uuid, text, jsonb, jsonb)`, reading the sibling
  through `clara._knowledge_applies_when_digest` — the same digest `uq_knowledge_live` (0192) is
  partial over, so at most one row can match and `select … into` cannot be ambiguous;
* re-cuts `clara._knowledge_capture_core` (passes its own `p_applies_when`) and
  `clara.correct_knowledge` (passes `r.applies_when`, the live record's own applicability, which a
  correction reuses verbatim);
* drops 0310's three-argument form **after** both callers move, so the catalogue never carries two
  overloads. `rig-meta.mjs`'s cohort is BY NAME and is unmoved.

`fd.11` / `fd.12` are green after the apply; the whole file is 12/12.

## L06-SPEC-08 (minor) — an impossible pair aborted a whole promotion

Fixed by the reviewer's **first** option, in the same migration: the per-item `exception` arm in
`clara.promote_plan_answers_to_knowledge` catches CLR37 alongside CLR10/CLR11, so the offending
key alone is withheld with its own sqlstate and detail and every other key still promotes. The
body is otherwise byte-identical (proved by reverse substitution, below).

New cell `kp.14` in `knowledge-onboarding-promotion.test.mjs`: a committed plan holding
`entity_type = sdn_bhd`, `fye = 2`, `fye_day = 31` promotes `entity_type` and
`financial_year_end_month`, withholds `fye_day` with `sqlstate CLR37` and
`detail {"reason":"fa_particulars_invalid","axis":"fy_end","month":2,"day":31}`, and leaves no
live day in Knowledge.

*Vacuity control:* the pre-image body (sha `2c1c1022…`, confirmed equal to the prestate pin) was
put back on the rig; `kp.14` then failed with
`error: 'a financial-year end must be a real calendar day, and month 2 day 31 is not one'` — the
raise escaping the loop. 0317 was restored through
`CLARA_MIGRATION_REDO=0317_knowledge_fye_pair_applicability`, and the file re-runs 14/14.

## L06-SPEC-03 / std-1 (major) — `p658.census.no_recut` left red

Reproduced: `knowledge-retrieval.test.mjs` → `not ok - p658.census.no_recut`, measured
`98bcbe35…` vs pinned `2c8526b8…`.

Fixed by the convention the cell itself already demonstrates for #885's 0268: the
`clara._knowledge_capture_core` pin now branches on the ledger row of the migration that recut the
body, `fyePairWallLive` beside the existing `sourceCorrectionLive`, pinned at the **post-0317**
body `e54104fc7dc48056eb6a8dfe8067360c67121d02656aae2b6ced1c01f6c91171` measured on `clara_l06`.
The branch keys on **0317** (the last of #1031's two files to touch the body) on purpose: the two
ship as ONE cohort, so a database carrying 0310 alone is half-applied and this cell failing on it
is the right answer. `packages/db/tests/README.md`'s `p658.census.no_recut` bullet now records
that two of the eight are bimodal and restates the rule that a recutting ticket re-measures the
pin in its own commit. File re-runs 28/28.

## L06-SPEC-04 / std-2 (major) — `p895.seed.noop` left red

Reproduced: `firm-setup-polish.test.mjs` → `not ok - p895.seed.noop`, `AssertionError: 14 !== 13`
at line 163.

Fixed the same way #1032 already re-derived `firm-setup.test.mjs`'s `p648.seed.reconcile`
(10 → 11) and `p648.seed.empty` (13 → 14): the first reconciliation of an empty firm-scope plan
now seeds **14** (eleven determinable/unconditional catalogue rows — `tin` among them since 0311 —
plus #935's three education tips), the second still seeds 0, and the `firm_setup.seeded` event's
first payload follows. The comments carry the reason, not just the number: `mpers_eligibility`
alone is still held back while `entity_type` is unanswered. File re-runs 3/3.

## L06-SPEC-05 (minor) — AC4's "and its sentence" for the OPTIONAL branch

`fs.web.18` now opens the optional `tin`'s form (`firm-setup-answer-tin-action`), asserts the same
`TIN_NOTE` literal `fs.web.19` asserts for the required branch, asserts the skip control an
optional item must offer (the mirror of fs.web.19's "a required one hides it"), and cancels
(`firm-setup-cancel`) before driving the bounded group walk, which is a different open state. The
cell title no longer promises more than it proves.

*Vacuity control:* with the fixture's `note` changed to a different sentence the cell fails with
`the optional tin's form did not render the accountant sentence`; restored byte for byte.
`firm-setup-checklist.test.tsx` re-runs 19/19.

## L06-SPEC-09 (minor) — AC1 is met by the parenthetical, and now says so

`client-birth-wall.test.mjs` carries a header above the census cell stating plainly that AC1's
letter ("No test fixture calls the direct door") is met by the brief's own **parenthetical** ("or
a fixture-only door that no human role can execute") and not by the literal clause: the two shared
fixtures still name `clara.create_client`, but 0316 withdrew its `clara_authenticated` grant, so
it IS a door no human role can execute, and the fixtures reach it only as the base identity. It
also records that #899's own named alternative — migrating 48+ batteries onto
`clara.open_client_onboarding` — is **not** taken and stays open, and that fixture-minted clients
therefore still bypass the identity-collision wall. The cell's own title now says "met by the
brief's parenthetical, see the note above". The integrator and the owner can accept or reject that
reading knowingly.

## L06-SPEC-07 (minor) — 29 February outside a leap year: a disclosed residual

Not closed, deliberately, and now named in three places: inside
`clara._knowledge_assert_fye_pair`'s own body, in 0317's header, and in `packages/db/README.md`'s
0317 section. The reason: the calendar rule is `clara.set_client_fy_end`'s own, copied verbatim
(0041), that rule admits `month = 2 and day = 29`, the year-end pair carries no year to judge a
leap year against, and the client-row door is explicitly out of #1031's scope — so refusing 29
February in Knowledge ALONE would re-create the very disagreement between two records of one fact
that #1031 exists to remove. **Follow-up worth filing:** tie the year-end pair to a year, on the
CLIENT-ROW door, so both records can move together.

## L06-SPEC-06 (minor) — the firms 0311 does not reach

**Disclosed, not backfilled** — the reviewer's second option, chosen for a reason I want on the
record rather than assumed.

Measured, not argued: 0311 recuts `clara.seed_firm_setup_plan` but backfills no existing plan, and
that door refuses outright when the plan is not open (`CLR10 firm_setup_not_open`). The live
catalogue carries no reopen door (`_assert_firm_setup_answer`, `_firm_setup_applicability`,
`_firm_setup_bump`, `_firm_setup_plan`, `answer_firm_setup_item`, `commit_firm_setup`,
`defer_firm_setup_item`, `dismiss_firm_setup_tip`, `get_firm_setup`, `seed_firm_setup_plan`, and
nothing else), and the web checklist guards every write control behind `!committed`.

Why not backfill: this is **not specific to `tin`**. A committed firm-setup plan has always been
closed to every later catalogue row — #935's three education tips included — so backfilling `tin`
alone would reach one item and would have to invent either a reopen door or a write into a
committed plan. Both are product decisions well outside #1032's brief and outside a fix round's
mandate. Against the standing beta ruling ("nothing is dark") this is a real gap for firms that
committed below the RM1M threshold before 0311, so it is recorded in `packages/db/README.md`
beside 0311's own paragraph and named here. **Follow-up worth filing:** reopening (or amending) a
committed firm-setup plan, so a later catalogue row can reach a firm that has already finished
setup. *Note for the owner's triage:* under the beta ruling that hosted data is test data, the
affected population today is a test population.

## L06-SPEC-10 (note) — `create_client` out of `wb-g-opkeys`'s op-key law

Left as the reviewer left it (no AC covers it, and it is a necessary consequence of the revoke).
**Follow-up worth filing:** a writer that keeps `clara._reserve_op` but loses its grant should
still be covered by some op-key law; `wb-g-opkeys.test.mjs`'s inventory is grant-derived, so it
cannot be that law on its own.

---

## NEW, found by this round — wave-b's ACL matrix still pinned `create_client`'s withdrawn grant

Not in either review's findings, because neither full-suite run reached cell 3864.
`wave-b/wb-g-tail.test.mjs`'s `G2: the ACL tuple matrix holds ROW BY ROW` walks `WB_ACL`
(`wave-b/wb-helpers.mjs`) role by role, and that matrix still said `create_client:
["authenticated"]` after 0316 withdrew exactly that grant. Reproduced in isolation on `clara_l06`:

```
not ok 2 - G2: the ACL tuple matrix holds ROW BY ROW (and internals hold NO app grant)
ACL divergences:
create_client: clara_authenticated execute=false, matrix says true
```

This is a THIRD shipped-red of the same class as std-1 and std-2 — a pinned expectation the
migration's own commit owed and did not re-derive — and it is not rig state: a from-scratch
database with 0316 applied fails it just the same.

**Fixed** in `e470d5fe6`. The row stays in `WB_ACL`, pinned **empty** rather than deleted: an empty
grant list makes G2 assert `false` for every role, so the matrix fails loudly if the grant ever
returns, and the verb stays inside `WB_ALL_FNS` where the `R1-F13a` unpinned-fn sweep and the
agent-role sweep already reach it. That is the same posture `rig-meta.mjs`'s `WRITERS` census took
for the same revoke. `wb-g-tail`, `wb-g-opkeys` and `wb-r3` re-run **20/20** with the full gate
chain; the red-before-green is the reproduction above.

## The new migration, in the house shape

`packages/db/migrations/0317_knowledge_fye_pair_applicability.sql`.

**Prestate pins, every one MEASURED on `clara_l06` off `pg_proc.prosrc` after this lane's 0310,
0311 and 0316** (the integrator uses this list to find a pin another lane recuts):

| signature | sha256(prosrc) | kind |
|---|---|---|
| `clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)` | `98bcbe3589c1813da4bbdb7f5486db0d4996e831050a86cd810e25d28554ce06` | recut |
| `clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)` | `520d10e5fbecedbdec0b5d5625087a783ae3378a243a5f0669cb86d3723a189c` | recut |
| `clara.promote_plan_answers_to_knowledge(uuid,text,boolean,uuid)` | `2c1c1022dad9b9d6639fef55c8a90263684fe882c1f0aaddddacd2f6bc7e6b80` | recut |
| `clara._knowledge_assert_fye_pair(uuid,text,jsonb)` | `1435d7ce166f22f2f4a5a73e7b1f4ae314b6acd9e33e29c5397fbe70939af38d` | replaced, then dropped |
| `clara._knowledge_assert_value(text,jsonb)` | `84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5` | unmoved |
| `clara.set_client_fy_end(uuid,integer,integer,text)` | `d8aaadbb0fe715c1f90bee8e52273a231c49c25cbee1fd56e8d6d1b80fe5f72a` | unmoved |
| `clara._knowledge_applies_when_digest(jsonb)` | `5d72c9a5372431e0f771077454af891e527af670e62634a7a6f6c89e93664646` | unmoved |

Post-0317 body of `clara._knowledge_capture_core`:
`e54104fc7dc48056eb6a8dfe8067360c67121d02656aae2b6ced1c01f6c91171` (this is what
`knowledge-retrieval.test.mjs`'s `p658.census.no_recut` now pins on the `fyePairWallLive` branch).
Post-0317 `clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb)` =
`a4b3d400e1b2cd8136042b6bb6618ef9e53fd3319ab7beb9141c224dd33d4116`;
`clara.correct_knowledge` = `660b487f1e7197f58499acd816e8c99545fb2521c73329fb3df87ebdd8342f7d`;
`clara.promote_plan_answers_to_knowledge` =
`619c2a403c7e1112c3f84a18a5b1184cc8459d7f59dbcdb1e812adfff8ea33c2`. None of these three is pinned
by any test on the branch (checked by grep over `packages/db/tests` and `apps/web/tests`).

**How the three pasted bodies are proved.** The file is static DDL throughout — no
`pg_get_functiondef` splice, no `execute format`, so **no entry is owed in
`apps/web/tests/firm-scope-db-pins.corpus.ts`** (that corpus keys only on dynamic-SQL barriers;
0310, 0311 and 0316 have none either). Each pasted body was produced from the LIVE `prosrc` with
exactly one named chunk substituted, and the tail proves it by **reverse substitution**: it reads
the installed body, puts the pre-0317 chunk back, and requires the result to hash to the pinned
pre-image. A change smuggled anywhere else in a pasted body reds the migration instead of shipping.

**Tail** (T.1–T.8): exactly one `_knowledge_assert_fye_pair` `pg_proc` row and it is the
four-argument one (the three-argument form is gone); its stable/definer/`clara_fn_owner`/pinned
`search_path` shape and zero grants (PUBLIC and the three application roles all denied); the
installed rule reads its sibling through the applicability digest; both write doors call it
exactly once, after their own `_knowledge_assert_value` call and before the trust wall, the
correction door at `r.applies_when`; the promotion door's arm names CLR37; the three reverse
substitutions; owner / SECURITY DEFINER / `search_path` / ACL preserved on all three re-cut bodies,
with `clara_authenticated` still holding `correct_knowledge` and both lanes still holding the
promotion door, and the capture core still ungranted; and the three unmoved neighbours re-read.

**Cohort and gate.** 0317 mints **no new name**, so `rig-meta.mjs` gains no cohort — the one name
this cohort owns (`_knowledge_assert_fye_pair`) is already in `FYE_PAIR_WALL_0310_COHORT` and the
cohort is by `proname`, so a change of arity moves nothing there (the block's comment says so).
For the same reason **no new pre-integration gate module** was added: 0310's own
(`tests/fye-pair-wall-preintegration-gate.mjs`, `CLARA_ALLOW_MISSING_FYE_PAIR_WALL_0310`) gates the
whole two-file cohort — its header now names 0317 — and `packages/db/package.json`'s gate chain is
unchanged and still in migration order. `knowledge-fixtures.mjs`'s `fyePairWallCohortApplied` was
tightened onto the shape the cohort finally ships (the four-argument rule plus both callers), so a
database carrying 0310 without 0317 is reported **PARTIAL**, which is what it is.

**Redo (#957), both branches exercised on `clara_l06`:**

* FIRST APPLY — `node scripts/migrate.mjs`: prestate took the non-redo branch and checked all four
  recut pins; `applied 0317_knowledge_fye_pair_applicability`, `293 total`.
* REDO — `CLARA_MIGRATION_REDO=0317_knowledge_fye_pair_applicability node scripts/migrate.mjs`
  after the promotion door had been put back at its pre-image for `kp.14`'s vacuity control:
  prestate reported the redo signal by name, the tail re-proved the whole post-state,
  `redone 0317_knowledge_fye_pair_applicability · new checksum fa331f415d53de0142e122017250bfa54600d9e4a50d144bdc25c865a9d13c59`.

## Gates

| gate | result |
|---|---|
| `packages/db`, full gate chain (109 `--import` flags), the 12 files touched or implicated: `knowledge-fye-day`, `knowledge-onboarding-promotion`, `knowledge-retrieval`, `knowledge-firm-defaults`, `knowledge-records`, `firm-setup-polish`, `firm-setup`, `firm-setup-applicability`, `client-birth-wall`, `operation-census`, `rig-isolation`, `rig-runtime-catalog` | **181 tests, 180 pass, 0 fail, 1 skipped** (the known `rig-isolation` skip) |
| `packages/runtime` unit, the file touched: `wave-b-wiki-projection-consumer.test.mjs` | **16/16** |
| `packages/runtime` batteries driven through the changed fixture: `authz-db` 3/3, `classify-consumer` 8/8, `control-lease` 5/5, `intake-db` 12/12, `g1-wake-walls` 7/7, `drain` 19/19 | **54/54** |
| `node scripts/check-frozen-workflows.mjs` | **OK** — 312 frozen files verified, 55 `use workflow` modules frozen+registered, 3 retired entries |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `apps/web` unit, the file touched: `firm-setup-checklist.test.tsx` | **19/19** |
| `apps/web` WHOLE unit suite (`node scripts/run-tests.mjs`) | **4988 tests, 4986 pass, 0 fail, 2 skipped** |
| `packages/db`, WHOLE suite (`pnpm test`, the package's own 109-gate chain) | run TWICE — see "The whole database suite" below |
| `pnpm typecheck` | **clean, exit 0** (`apps/web` and `packages/runtime` both Done) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **clean, exit 0** (re-run for `packages/db` alone after the last commit: exit 0) |

**Not run, and why:** `apps/web` e2e. This fix round touched no `apps/web/e2e` file, no route and
no component — only a unit test file — so no browser walk changed. `firm-setup-walk.spec.ts`
remains as the review left it: the lane reported 5 pass on its own triple and the review checked
its text literal by grep but did not re-drive it.

### The whole database suite — and the third shipped-red it found

#1038's AC3 is "the whole database suite passes with the fixtures moved", and the review could only
report it partial (~1,131 cells). So the whole `packages/db` suite was run to completion on
`clara_l06`, twice.

**Run 1** (after the first four fix commits): **5529 tests, 5378 pass, 59 fail, 92 skipped.** Every
one of the 59 was chased to its cause.

* **1 was a real, third shipped-red regression from #1038, which neither review reached** —
  `wave-b/wb-g-tail.test.mjs`'s `G2: the ACL tuple matrix holds ROW BY ROW`. Reproduced in
  isolation: `ACL divergences: create_client: clara_authenticated execute=false, matrix says true`.
  `WB_ACL` (`wave-b/wb-helpers.mjs`) still pinned the grant 0316 withdrew. **Fixed** in
  `e470d5fe6`; `wb-g-tail`, `wb-g-opkeys` and `wb-r3` re-run **20/20**.
* **58 are RIG-DATABASE RE-RUN DRIFT, not branch defects** — rows left on `clara_l06` by earlier
  runs of the very batteries that assert over them. Each fails in isolation too, and each names its
  own cause:
  * `f-a5b-sandbox-export-pr1.test.mjs` (55, all `hookFailed`): `F-A5b PR-1 DRIFT: relations=true
    fns=14/14 sandbox_watermark rows=6/3`. The three surplus
    `clara.watermark_policy_versions` rows for `policy_key='sandbox_watermark'` were created at
    **2026-09-23 20:43:56, 21:03:44 and 21:48:24** — during this lane's own earlier ticket and
    review runs, before this fix round began — beside the three seeded at 17:15:31. The battery
    bumps that policy as part of its own cells.
  * `f-t1-sst-reference.test.mjs` (2): `sst_rate_schedule: seed is exactly TEN rows` → `12`, and the
    supersede cell then hits `duplicate key value violates unique constraint
    "uq_sst_rate_schedule_live"`. Same class: rows the battery's own earlier run left behind
    (`recorded_by` is NULL on all 12, `superseded_by` set on 1). This cell PASSED (`ok 1912`) in the
    lane's own earlier aborted full-suite log, `packages/db/_full_suite.log`, timestamped 04:47
    today — so the drift arrived between that run and this one.
  * `f-a5-reporting-agency-pr1.test.mjs` (1): the cell's own message says it outright —
    `evaluate_fs_pack_agent v1 is already deployed but CLARA_ESTATE_REUSED_DB is not set to "1" --
    either this database is not actually fresh … or the reuse is deliberate`.

  None of the three is reachable from anything this lane changed, and a from-scratch database — the
  integrator's own proof — carries none of them.

**Run 2** (after `e470d5fe6`): **5529 tests, 5378 pass, 59 fail, 92 skipped.** Diffed cell by cell
against run 1: `G2: the ACL tuple matrix holds ROW BY ROW` is GONE (the fix), and exactly one new
failure appeared — `intake-batch.test.mjs`'s `p636.batch.sweep_settles`, `the cancelling parent is
on the worklist`. That is the same drift class, and that file's OWN comment (lines 1382-1385)
predicts it in so many words: "`p636.batch.sweep_settles` reads the sweep's 20-row worklist,
ordered by `cancel_requested_at`, and this file's world is SHARED and long-lived: a cell that walks
away from a permanently-`cancelling` parent taxes that worklist on every future run." Measured on
`clara_l06` right now: `clara.intake_batches` holds **43 rows in state `cancelling`** (plus 104
`open`, 17 `cancelled`), so a freshly cancelled parent cannot reach a 20-row worklist. It passed in
run 1 and failed in run 2 — one run's worth of extra drift is the whole difference.

**What the integrator should take from this:** AC3 holds for the branch — every failure that a
from-scratch database can see is fixed. `clara_l06` itself is now dirty for FOUR batteries
(`f-a5b-sandbox-export-pr1`, `f-t1-sst-reference`, `f-a5-reporting-agency-pr1`, `intake-batch`) and
should not be used to judge those four again without a reset. **This is worth a wave-level note:**
the whole `packages/db` suite is not idempotent on one database, so "the whole suite passes" is
only a meaningful claim on a fresh one.

## Docs updated in the same commits

* `packages/db/README.md` — new `## 0317` section (both defects, the disclosed 29-February
  residual, the reverse-substitution proof, the redo evidence) and a new disclosure paragraph
  beside the existing `#1032 (0311)` paragraph naming the committed-plan population.
* `packages/db/tests/README.md` — the `p658.census.no_recut` bullet now records both bimodal pins
  and restates the "a recutting ticket re-measures the pin in its own commit" rule.
* `packages/db/tests/fye-pair-wall-preintegration-gate.mjs` — header names 0317 as the second half
  of the same cohort.
* `packages/db/tests/rig-meta.mjs` — the `FYE_PAIR_WALL_0310_COHORT` comment records that the
  cohort is by name and that 0317 adds none.
* `packages/db/tests/knowledge-firm-defaults.test.mjs` — the census exception's prose now describes
  the applicability-scoped read.
* `packages/db/tests/client-birth-wall.test.mjs` — the AC1 note (L06-SPEC-09).

`CONTEXT.md` gains nothing: this round coins no new vocabulary.

## Successor contracts

None. No frozen chat or Work tool needs a change: `clara._knowledge_assert_fye_pair` is an
ungranted internal that no tool has ever named, and the three re-cut doors keep their signatures,
their arguments and their receipts. `clara.promote_plan_answers_to_knowledge`'s receipt shape is
unchanged — an impossible year-end pair simply appears in the `withheld` list it already carries,
in the shape it already uses.

## Follow-ups worth filing

1. **Tie the year-end pair to a year** so 29 February outside a leap year is refused — on the
   CLIENT-ROW door (`clara.set_client_fy_end`) together with Knowledge, never in Knowledge alone.
2. **Reopen or amend a committed firm-setup plan**, so a catalogue row added after a firm finished
   setup (today `tin`; before it, #935's education tips) can still reach that firm.
3. **An op-key law that survives a revoke** — `wb-g-opkeys.test.mjs`'s writer inventory is
   grant-derived, so `clara.create_client` dropped out of `G4/[R2-F8]` when 0316 withdrew its
   grant although it still calls `clara._reserve_op` (the reviewer's L06-SPEC-10).
4. **Migrate the batteries onto `clara.open_client_onboarding`** — #899's own named route, still
   open: fixture-minted clients bypass the identity-collision wall the product entrance carries.
5. **The `packages/db` suite is not idempotent on one database** — four batteries
   (`f-a5b-sandbox-export-pr1`, `f-t1-sst-reference`, `f-a5-reporting-agency-pr1`, `intake-batch`)
   assert over state their own earlier runs leave behind, so "the whole suite passes" is only
   meaningful on a fresh database. Worth a wave-level ticket: either each battery cleans up after
   itself (`intake-batch` already tries, and says so in a comment) or the house says out loud that
   a full-suite claim requires a fresh database.

## Anything unverified

* `0317` is the first free number in wave 4's overflow block **as this lane can see it**. Another
  lane's concurrent fix round could have taken the same number; the integrator renumbers if so.
* A from-scratch `0001 → 0317` chain (the integrator's job, on a disposable cluster). Both
  branches of 0317's own prestate were exercised here, and 0317 is `create or replace` /
  `drop … if exists` throughout.
* The hosted population of firms whose firm-setup plan was committed before 0311 was not counted —
  the gap is structural (no reopen door exists), and under the beta ruling hosted data is test
  data.
* The 58 remaining whole-suite failures are argued to be rig re-run drift on `clara_l06`, with the
  evidence above (row timestamps, row counts, each battery's own message and each file's own
  comment). They were NOT re-proved green on a fresh database — that is the integrator's
  from-scratch run, and none of them is reachable from anything this lane changed.
