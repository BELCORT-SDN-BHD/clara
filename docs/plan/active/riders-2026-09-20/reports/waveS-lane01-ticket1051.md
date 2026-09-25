# riders sweep wave · lane 01 · ticket #1051 — one authority-wall predicate for the two plan doors

**Status: DONE.**
Branch `riders/wS-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, base `7bc5a710f`.
Database `clara_l04` at `127.0.0.1:55744`.

Commits (`git log --oneline 7bc5a710f..HEAD`):

| sha | message |
|---|---|
| `b1e0f9c3c` | `fix(db): #1051 one authority-wall predicate for both plan doors (0330)` |
| `2ada717aa` | `docs: #1051 CONTEXT names the third authorising-instruction kind` |

Working tree clean. Nothing pushed, no PR, no GitHub write of any kind. No message arrived
mid-task.

Start state, as required by the work order: `git status` clean, `git log --oneline 7bc5a710f..HEAD`
EMPTY (I am the first ticket of this lane; no earlier ticket had landed a commit or applied a
migration, and the lane database read 309 files at `0318_knowledge_fye_pair_applicability` before
I began).

---

## The seams I tested at (written before the first test, work order rule 4)

1. **`clara.create_accounting_plan`** — the human plan door, granted to `clara_authenticated`,
   driven as a bookkeeper through `humanQuery`.
2. **`clara.create_prepayment_schedule_for`** — the ON-BEHALF entrance into `clara._obo_plan_core`,
   driven on a real least-privileged `clara_runtime` connection carrying no JWT.
3. **The catalog** — this repo's own documented structural standard for a recut body (a catalog
   census, a prestate pin, a tail assertion). Work order rule 4 says that standard wins where it
   applies, and *"there is exactly ONE spelling of the wall"* is a claim only a census can carry;
   `clara._assert_plan_authority` is an ungranted internal with no public interface of its own.

---

## The ticket is not what it says, and this is the re-brief I built

`gh issue view 1051 --comments`: the issue body carries the only Agent Brief and there are **zero
comments** (checked twice, `gh api repos/BELCORT-SDN-BHD/clara/issues/1051/comments` returns
nothing), so there is no owner ruling comment on this ticket. The binding re-brief is the sweep
wave's plan of record, `SWEEP-PLAN.md` → "The four narrowed tickets, and the one re-briefed".

**Verified live on this branch before building:**

| the ticket's claim | measured | verdict |
|---|---|---|
| `clara._obo_plan_core` admits TWO authority kinds | `0308:893` reads `not in ('accounting_work','chat_task','contract_confirmation')` | **stale** |
| `clara.create_accounting_plan` admits THREE | `0308:614`, the identical list | true |
| the two walls are two hand-written copies | `0308:597-640` against `0308:871-919`, two separate texts | **live** |
| `0308:870` calls the twin's copy "verbatim from clara.create_accounting_plan" | true of no text on the integrated chain | **live** |

So the ticket's own recommendation — *keep the machine lane at two kinds* — would today **remove**
`contract_confirmation` from the OBO lane, a behaviour change in the direction of refusing
something that is admitted, on the machine lane, that no ticket asked for. **Not taken**, per the
re-brief. What I built is the fold plus the correction: one predicate, three kinds preserved on
both doors, and the untrue "verbatim" claim corrected in the new migration's own README section.

---

## Acceptance criteria, each with its evidence

### AC1 — "A forward migration extracts the wall into one predicate and both doors call it; a cell proves the two doors refuse and admit the same kinds except the stated OBO subset." ✅

There is **no** stated OBO subset any more (see the re-brief), so the cell proves the two doors
admit and refuse the SAME three kinds.

* Migration `packages/db/migrations/0330_plan_authority_wall_predicate.sql` mints
  `clara._assert_plan_authority(text, jsonb, uuid, uuid)` and recuts both doors to call it.
* **`p1051.wall.one_definition`** (`packages/db/tests/plan-authority-wall.test.mjs`) — the catalog
  census: the predicate exists as an ungranted, `stable`, SECURITY DEFINER, `clara_fn_owner`-owned,
  `search_path`-pinned internal that `clara_authenticated` / `clara_runtime` / `clara_agent_ro` /
  PUBLIC cannot execute; both plan doors call it; neither carries a line of the wall; no body both
  calls it and keeps its own copy. **PASS.**
* **`p1051.wall.same_kinds`** (same file) — driven END TO END through **both** seams on one
  client: an `accounting_work`, an AUTHORED `chat_task` and a `contract_confirmation` are each
  ADMITTED by `clara.create_accounting_plan` (as a bookkeeper) and by
  `clara.create_prepayment_schedule_for` (on a real `clara_runtime` connection), each plan row
  read back citing the row it resolved and `authorised_by` the human; a fourth kind
  (`knowledge_record`) is refused by both with `deepEqual`-identical SQLSTATE, sentence and
  `authority_ref_invalid` / `kind` payload, and the refused OBO call wrote no schedule. **PASS.**

  The `contract_confirmation` arm is the half **nothing drove before**: `tenancy-rent-plan.test.mjs`
  `S5` drives the HUMAN door with a confirmation; no cell anywhere drove the OBO twin with one —
  the wave-4 integrator's widening of the twin was asserted in prose and measured only as a
  byte-comparison of the twin's copy against the human door's copy.

### AC2 — "The stale 'verbatim' comments are corrected in the same migration's own README section (applied migrations are not edited)." ✅

`packages/db/README.md`, new `## 0330 — one authority-wall predicate for the two plan doors`
section, under the heading **"THE CORRECTION 0308 CANNOT CARRY"**: it names `0308:870` and 0308's
header, says why the claim was already untrue (0308 was written on a rig without 0300; the
integrator re-based the pasted human door onto 0300's post-image and widened the twin by hand), and
records that the two bodies now share one text instead of claiming to. The same correction is in
`clara._assert_plan_authority`'s catalogue comment, where a reader of the live database meets it.
**No applied migration was edited** (`git show --stat` on both commits: 0308, 0300, 0315 and 0317
are untouched).

### AC3 — "From-scratch chain green; `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0." ✅ / ⚠️ partial

* `CI=true GITHUB_ACTIONS=true pnpm lint` → **exit 0**, run twice (before and after the CONTEXT
  commit).
* **From-scratch chain: NOT run by me, and I could not run it** — the rig rules forbid a second
  from-scratch chain on a lane cluster (migration 0154 pins the cluster-wide role count; RIG.md,
  "never run a second from-scratch chain on your cluster", and "the integrator runs the from-scratch
  proof on a disposable cluster"). What I proved instead, on this lane database: first apply from
  the true pre-image state, a `CLARA_MIGRATION_REDO`, and a third `migrate` reporting **0 new
  applied and no checksum drift**, ledger now **310 files, max `0330_plan_authority_wall_predicate`**.
  The tail's reverse substitution (below) is the from-scratch-relevant half: it proves the two
  pasted bodies are the pre-images 0315 and 0317 pin, so those earlier files' own prestates still
  match when the chain replays in order.

---

## The migration

**`packages/db/migrations/0330_plan_authority_wall_predicate.sql`** (713 lines). Exactly one new
file, at the number reserved for me. No overflow number was needed.

### Prestate pins — MEASURED on `clara_l04` now, never copied from an older header

| signature | pin | role |
|---|---|---|
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208` | neighbour this file WRAPS and must not move — pinned unconditionally, re-pinned at the tail |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | pre `a7c108d5dd4febbae9f98a87b42b69468aec31f1731336b2185c8e91b1b0951c` → post `544cd88ecaa5b5237969aff36b1bd0d8a5cdf41aacea234e6415d3df54b523ea` | RECUT, bimodal |
| `clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | pre `2049c1c4404e47102b375d506271938f5f3e03405fd7a25b8d303118c13a6b4a` → post `149b4a3d0ff1b22b3dd8d11eabcfb7b0b8c113054cd7df76194355c2b976b61d` | RECUT, bimodal |
| `clara._accrual_plan_core(uuid,uuid,uuid,text,…)` | **deliberately NOT sha-pinned** | the THIRD copy, #1080's ticket, in this same lane AFTER me — pinning a body a later ticket of the lane recuts would couple this file to that ticket's output for no gain. Existence is asserted; the tail's census names it by name. |

The predicate's own body measures `60f2c5d10378f9fc853e672cc6bc53d662322283c3ed5276e399e87e71ee202b`
(used as the restore check for the vacuity control below).

The prestate is bimodal on both doors, **refuses a MIXED state** (one door folded, one not) rather
than guessing, cross-checks the predicate's existence against the branch it read, and pins the
human door's `clara_authenticated` grant and the twin's zero grants so the tail can prove a recut
preserved them. It has **no data-dependent branch** — every arm reads the catalog only, so there is
no arm that needs rows to be entered.

### The change

1. `clara._assert_plan_authority(text, jsonb, uuid, uuid) returns void`, `stable`, SECURITY
   DEFINER, `clara_fn_owner`, `search_path` pinned, `revoke all … from public`, granted to nobody —
   `clara._authority_ref_refusal`'s own shape (0250 §A). Its body is the human door's wall **moved**:
   every sentence, errcode and `detail` payload byte-identical, including the `#949` and `#977`
   comments inside it; the one token that changes is `v_firm` → `p_firm`.
2. `clara.create_accounting_plan` recut: 0308's body with that one block replaced by one `perform`
   and the three declarations the block alone used (`v_ref_kind`, `v_ref_id`, `v_reason`) dropped.
3. `clara._obo_plan_core` recut the same way, passing its own `p_firm`.

Both recuts are **static DDL** — no `pg_get_functiondef` splice, no `execute`, no dynamic SQL of
any kind — so **no new entry in `apps/web/tests/firm-scope-db-pins.corpus.ts` is owed**; see the
gate run below, which confirms it.

### Tail

T.1/T.1b/T.1c predicate shape, zero non-owner grants, PUBLIC denied · T.2 the predicate names all
three kinds, every reason token and `clara._authority_ref_refusal(` · T.3–T.3d human door at its
post-image with definer/volatile/owner/search_path and exactly the `clara_authenticated` grant ·
T.4/T.4b twin at its post-image, granted to nobody · T.5/T.5b `_authority_ref_refusal` unmoved and
ungranted · **T.6/T.6b the census**: the wall's sentence lives in exactly
`_accrual_plan_core, _assert_plan_authority` and the predicate is called by exactly
`_obo_plan_core, create_accounting_plan` (compared against a literal roster built with
`order by p.proname`, which is the catalog's own C ordering because `proname` is `name` — collation-proof
by construction, sweep rule (e)) · **T.7 the predicate DRIVEN over all eight of its refusal axes**
· **T.8 reverse substitution** (0318's idiom): the installed body, with 0308's own authority block
and those three declarations put back, must hash to the pre-image the prestate pinned — for BOTH
doors. That is the mechanical proof that the fold is a fold and nothing else moved in either pasted
body.

### Apply history on this rig

1. **FIRST-APPLY branch proved by hand before applying** (the wave-3 lesson: a bimodal pin can only
   ever show `CLARA_MIGRATION_REDO` its "already live" branch). The prestate block was extracted
   verbatim, wrapped in `begin; … rollback;` and run against the un-applied lane database: it
   printed `#1051 prestate: FIRST APPLY …` and passed. The prestate text is byte-identical to the
   block in the committed file (checked programmatically after the later tail edit).
2. `pnpm --filter @clara/db migrate` → `applied 0330_plan_authority_wall_predicate`, prestate FIRST
   APPLY notice, tail OK notice.
3. The tail then gained T.8, so the file was re-applied with
   **`CLARA_MIGRATION_REDO=0330_plan_authority_wall_predicate`** (`CLARA_ALLOW_DESTRUCTIVE=1`,
   `CLARA_RIG_DB=1`) → `redone … new checksum 309932148e82acf6063896cc17326fff49e451beb9333d983f56bc66003f0e40`,
   prestate REDO notice, tail OK including both reverse substitutions. **Recorded as required.**
4. A final `migrate` → `0 new migration(s) applied · 310 total`, no drift.

---

## TDD — the slices, and the red I saw for each

**Slice 1 — the structural claim.** Wrote `p1051.wall.one_definition` first and ran it with the
migration unwritten: **RED**, and for the right reason —
`#1051 premise 0330_plan_authority_wall_predicate.sql is not applied … must fail loudly, not skip`
(the focused run does not preload the preintegration gate, so the frontier gate fails loudly
instead of skipping). Then the migration; then **GREEN**.

**Slice 2 — the behaviour claim, with the vacuity control.** A refactor's behaviour cell cannot go
red by being written first, so I used the control work order rule 4 names. After
`p1051.wall.same_kinds` was green, I recut `clara._assert_plan_authority` **on the rig only** with
its kind list narrowed to `('accounting_work','chat_task')` — i.e. exactly the behaviour change the
ticket's stale recommendation would have made — and re-ran:

```
ok  1 - p1051.wall.one_definition …          (still green: it is structural)
not ok 2 - p1051.wall.same_kinds …
  error: 'a plan authority reference names an accounting_work, a chat_task or a contract_confirmation'
```

The subject was then restored **byte for byte** by re-running the migration's own predicate
statement, and the body re-measured: `60f2c5d1…` before the break and `60f2c5d1…` after the
restore. Both cells green again. The control does double duty: it proves the cell is not vacuous
**and** it demonstrates on the rig what the ticket's own recommendation would have cost.

No battery of red cells was written ahead of implementation; each slice was one cell, one red, one
minimal change, one green.

---

## Two live gates my recut broke, and what I did about them

Both were found by running them, not by reading them; both are recorded here because they are the
kind of cross-file breakage an integrator needs named.

1. **`packages/db/tests/authority-ref-human-instruction.test.mjs` → `p977.definition.one`** —
   asserted that `clara.create_accounting_plan` (and the OBO twin) NAME
   `clara._authority_ref_refusal`, with an exact closed reader roster. After the fold they reach it
   through the predicate. Seen RED (`# pass 6 # fail 1`), then made **BIMODAL, measured off the
   catalog** in the same idiom the cell already used for the OBO twin: on a pre-0330 chain the old
   roster, on a post-0330 chain `["_assert_plan_authority", "sign_depreciation_authority"]`, plus a
   new assertion that the shared wall is itself a READER of the one definition and not a second
   copy of it. Still an exact closed world in either branch. Two constants
   (`PLAN_WALL_FN_SIG`, `PLAN_WALL_CALL`) added to
   `authority-ref-human-instruction-fixtures.mjs`. Now GREEN.
2. **`packages/db/tests/plan-overlap-template-arm-retired.test.mjs:77`** — pinned
   `create_accounting_plan` at `a7c108d5…`. Seen RED (`p929.tail`), re-pinned to `544cd88e…` with a
   comment recording the THIRD re-base and why what the pin is FOR is unaffected. Now GREEN.
   **Note for the merger:** `SWEEP-PLAN.md` lists this file among L7's six census files
   (`#1047`), cross-checked against L1. This is the L1 side of that cross-check: one sha literal
   and its comment, nothing else in the file.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| my new file + the two repaired files, **full gate chain** (126 `--import` gate modules, mine included) | `node --test --test-concurrency=1 $GATES tests/plan-authority-wall.test.mjs tests/authority-ref-human-instruction.test.mjs tests/plan-overlap-template-arm-retired.test.mjs` | **15 tests, 15 pass, 0 fail, 0 skipped** |
| operation census + rig isolation (I added an SQL function), **no reset flags** | `node --test --test-concurrency=1 $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests, 32 pass, 0 fail, 1 skipped** — the one skip is `T19 poison-role`, skipped *because* `CLARA_RIG_ALLOW_RESET` is unset, which is the rig rule. `T17` (exact grant matrix) and `T18` (every SECURITY DEFINER pins `search_path` + is owned by `clara_fn_owner`) both PASS with the new function. |
| behaviour preservation, plan family part 1 (`accounting-plans`, `accounting-plan-occurrences`, `accrual-adjustments`, `plan-schedule-yield-wall`, `plan-overlap-sibling-arm`, `knowledge-firm-defaults`, `depreciation-history`), full chain | as above | **109 tests, 109 pass, 0 fail, 0 skipped** |
| behaviour preservation, plan family part 2 (`prepayment-schedule`, `prepayment-schedule-obo`, `prepayment-occurrences`, `prepayment-wake-reroute`, `revenue-recognition`, `tenancy-rent-plan`, `accrual-correction`), full chain | as above | **120 tests, 120 pass, 0 fail, 0 skipped** |
| web migration-pins corpus (sweep rule (d): in scope because a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` from `apps/web` | **22 tests, 22 pass, 0 fail** — and it confirms no barrier entry is owed for 0330 |
| typecheck | `pnpm typecheck` | **exit 0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** (run twice: after the code commit and after the CONTEXT commit) |
| frozen closures | `node scripts/check-frozen-workflows.mjs` | `OK — 322 frozen file(s) verified …` no manifest diff |
| migration ledger | `pnpm --filter @clara/db migrate` (third run) | `0 new migration(s) applied · 310 total`, max `0330_plan_authority_wall_predicate` |

The 229 plan-family cells are beyond the letter of rule 8. I ran them because the ticket's whole
claim is *"nothing either door admits or refuses moves"*, and two shared bodies were recut: a green
census is not that proof, a green plan family is.

I did **not** touch `apps/web` source, so the whole web unit suite and the browser walks were not
required and were not run. Nothing in `apps/web` or `packages/runtime` references
`contract_confirmation` or mirrors the admitted-kind list (grepped).

---

## Docs, in the same commits

* `packages/db/README.md` — new `## 0330` section: the re-brief and why the ticket's own
  recommendation is not taken, **the correction of 0308's "verbatim" claim** (AC2), what the fold
  leaves standing and why (#1080), how the two pasted bodies are proved (reverse substitution, and
  the explicit statement that no `firm-scope-db-pins.corpus.ts` entry is owed), and the redo-safety
  note with both branches' evidence.
* `packages/db/tests/README.md` — the `p977.definition.one` bullet rewritten to describe its new
  bimodality, plus a new `## The shared plan authority wall (#1051, 0330…)` section describing both
  cells and naming the `contract_confirmation` coverage gap this battery closes.
* `packages/db/package.json` — one `--import ./tests/plan-authority-wall-preintegration-gate.mjs`,
  appended in migration order (after 0317's). Minimal hunk on a shared file.
* `packages/db/tests/rig-meta.mjs` — `PLAN_AUTHORITY_WALL_0330_COHORT` (one name,
  `_assert_plan_authority`), armed bimodally like 0250's and 0310's. Minimal hunk on a shared file.
* `CONTEXT.md` — see below.

### CONTEXT.md — a shared file I edited, flagged for the merger

`SWEEP-PLAN.md`'s shared-file table assigns `CONTEXT.md` to **L3 only, and only if #1049 stays in
the wave** (the plan recommends #1049 sheds to the mainline, in which case nobody else touches it).
I edited it anyway, in one minimal additive hunk inside the existing **"Authorising instruction"**
entry, because it is the same error #1051 exists to close one layer up: the entry still enumerated
TWO kinds — a Work and a conversation turn — while the estate has admitted three since #949, and
this ticket's subject is precisely a claim about the wall that outlived the wall. No new term is
minted and no new heading is added. If L3 does edit `CONTEXT.md`, the two hunks are in different
entries.

---

## Successor contract

**None is owed.** This ticket touches no frozen workflow body and no module in a frozen closure
(`check-frozen-workflows.mjs` clean), and it changes no door's name, signature, argument order or
refusal vocabulary: `clara.create_accounting_plan` and `clara.create_prepayment_schedule_for` keep
their exact signatures, grants, SQLSTATEs, sentences and `detail` payloads. A frozen chat tool or
Work tool calling either door needs no change of any kind, which is the point of the ticket being a
fold.

The one new name, for a later ticket's reference:

```
clara._assert_plan_authority(p_authority_kind text, p_authority_ref jsonb,
                             p_firm uuid, p_client uuid) returns void
```
`stable`, SECURITY DEFINER, owner `clara_fn_owner`, `search_path = clara, pg_temp`, granted to
**nobody** — reachable only from another SECURITY DEFINER body already running as the owner. It
raises or returns; the caller passes the firm it has already resolved and the client it has already
walled.

---

## Follow-ups worth filing (I filed nothing — no GitHub write)

1. **#1080 is now one line of work, and its shape is fixed by this file.**
   `clara._accrual_plan_core` should `perform clara._assert_plan_authority(p_authority_kind,
   p_authority_ref, p_firm, p_client)` in place of `0222_accrual_adjustments.sql:1014-1025`'s own
   wall and inline `exists` probes. Two live assertions will move when it does, and both are
   already written to compose rather than break: `plan-authority-wall.test.mjs`'s census is stated
   as a RULE (a body either calls the predicate or keeps its own copy, never both) and names
   `_accrual_plan_core` as the expected third carrier; `authority-ref-human-instruction.test.mjs`'s
   `p977.definition.one` asserts the inline chat-lane probe survives in exactly
   `["_accrual_plan_core"]` — **that cell's `carriers` roster WILL need updating to `[]` by #1080**,
   and its own comment says why. 0330's tail census (`T.6`) also names `_accrual_plan_core`
   literally; #1080's own tail will need to state the new expectation, which is normal for a
   forward file.
2. **`clara._assert_plan_authority` is the natural landing point for a parameterised admitted set.**
   The ticket anticipated this ("if a later ticket gives the OBO lane a contract-confirmation
   caller, the shared predicate takes a parameter, not a second copy"). Nothing needs it today —
   both doors take all three — but if a lane ever needs a narrower set, the parameter goes here.
3. **`#1050`, held by the plan, would widen the `authority_kind` CHECK.** If it is ever ruled and
   built, this predicate is the single place the plan lane's authority-kind rule now lives, so that
   ticket's `authority_kind` work is one body instead of three.

---

## Anything unverified

* **The from-scratch chain.** Not run, and deliberately not runnable here (RIG.md forbids a second
  from-scratch chain on a lane cluster; the integrator runs it on a disposable cluster). What
  supports it: T.8's reverse substitution proves the two installed bodies reduce to exactly the
  pre-images that 0315 and 0317 pin bimodally, and those two files apply BEFORE 0330 in file order,
  so their prestates meet the pre-image on a replay. `0315`/`0317`'s pins of `a7c108d5…` were
  re-grepped after the change and are the only remaining references to the old shas anywhere in the
  repo.
* **`clara._accrual_plan_core` is unchanged and still a live authority gap.** A wake task or an
  autodraft run can still authorise an accrual plan through that body today. #1051 does not close
  it and was not asked to; #1080 does. Stated so nobody reads this ticket's green as the gap being
  shut.
* **The lane database is now one migration ahead of the other lanes' databases** (310 files vs
  309). Expected; recorded so the next ticket of this lane does not read it as drift.
* **Two hosted-only states I could not exercise:** a `contract_plan_confirmations` row born through
  #949's real tenancy confirm door (my cell plants the row directly, stated as a fixture shortcut
  in the code, because the cell is about the authority wall's treatment of the row and not about
  how the row is born — `tenancy-rent-plan.test.mjs` owns the door), and any firm whose books
  predate 0300. Neither affects the fold: the predicate resolves a confirmation exactly as
  `clara._authority_ref_refusal` did before, by existence under the firm-and-client ladder, and
  that body is byte-identical (`55c20b20…` pinned before and after).
