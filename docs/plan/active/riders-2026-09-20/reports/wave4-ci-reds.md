# Riders wave 4 — the PR #1053 CI reds, reproduced and fixed (COMPLETE)

**Worktree** `C:\Users\zhant\Desktop\clara-wt\658` · **branch** `fix/w4-ci-reds`
**Cut from** `origin/integration/riders-w4` at `fdb9ba135` · **head** `fa64ecf5d`
**Eleven commits**, one per group plus gate A's owed adjudication. Nothing pushed, no PR, no GitHub write, no other worktree or the
main checkout touched (this file excepted), no subagent spawned, no port in 55700-55702 or 55721
used.

| # | commit | group |
|---|---|---|
| 1 | `7e6755b51` | A — #977 the OBO twin joins the authority-refusal reader census |
| 2 | `8fc3cd0d2` | B — #945/#948 the evaluator censuses count lane 01's two new closures |
| 3 | `1b40e6056` | E — #942 the review-queue row shape carries 0304's two accrual keys |
| 4 | `120470495` | G — the x42 S5 clock rosters take wave 4's new names |
| 5 | `fb06c7019` | F — #1031 fd.12 orders its readback under a collation the runner shares |
| 6 | `134e0c18d` | C — #945 the classifier-gate HELD arm moves to a kind with no reader |
| 7 | `85c082eb3` | C — #871 the invite-preview lane joins the TLS-checked DSN roster |
| 8 | `ce11ef94d` | D — #871 the DR role bootstrap carries the invite-preview memberships |
| 9 | `f01ac4543` | C — the runtime README names the eighth lane's TLS pin obligation |
| 10 | `35b32e5d6` | H — #945/#948/#1035 the rollback preflight sees wave 4's two new lanes |
| 11 | `fa64ecf5d` | G — gate A F7's OWED arm (D) clock adjudication, measured body by body |

Diff vs `origin/integration/riders-w4`: **17 files, +381 / −35**. Two production modules
(`packages/runtime/lib/tls-ca.mjs`, `packages/runtime/lib/rollback-preflight.mjs`), one DR
ceremony file (`packages/db/deploy/roles-bootstrap.sql`), one README, the rest test and fixture
modules. **No migration was edited, no migration was added, no frozen body was touched.**

---

## THE SCOPE WAS WIDER THAN THE BRIEF SAID, AND THIS IS THE FIRST THING TO READ

The work order named "four red groups". The job's own logs carry **44 `packages/db` failures and
2 `packages/runtime` failures**, and the four groups cover 36 of the 46. The brief's group B named
nine cells of a battery that has forty-one, and three families (the review-queue row shape, a
collation-ordered readback, the x42 clock rosters) are not in the brief at all. They are all
fixed; the table below maps every one of the 46 to a group.

Two further reds exist on this branch that **CI cannot see** and that no CI log therefore names.
They are in `rollback-preflight.test.mjs`, whose every cell is gated on the WDK world being
bootstrapped — and `db-estate` hands `@clara/runtime` a template copy of the estate with no world,
so all of them skip there. Both are wave-4 regressions, found by running the whole runtime suite
against a world-bearing database, and both are fixed (group H). Had they shipped, a live payroll
or contract task would have read to a rollback preflight as a lane this image has never heard of.

| CI job | reds | group |
|---|---|---|
| `db-estate` · packages/db | 1 (`not ok 271`) | A |
| `db-estate` · packages/db | 41 (`16`-`59`, `908`, `1027`, `1045`, `2991`) | B, D |
| `db-estate` · packages/db | 3 (`2643`, `2644`, `4536`) | E |
| `db-estate` · packages/db | 1 (`2395`) | F |
| `db-estate` · packages/db | 4 (`5355`, `5357`, `5366`, `5367`) | G |
| `db-estate` · packages/runtime | 2 (`867`, `1261`) | C |
| `db-live-gates` | 1 (`dr-verify: FAIL`, `[4.5]`) | D |
| (unreachable by CI) | 2 (`637.pf` x2) | H |

### Gate A's findings, and the one thing it left owed

Gate A reached the same head independently and reported F1 to F9. Every one maps onto a group
above and every one is fixed here; the group headings carry the finding ids. Three notes where the
two readings differ, each settled by measurement rather than by preference:

- **Gate A counted 43 db failures where CI counted 44, and the missing one is F-less for the same
  reason it is missing from gate A's list:** `not ok 2395` is the collation red, invisible on any
  `C.UTF-8` rig. Gate A's rig is C.UTF-8 like the lane clusters, so it saw 43. This round
  reproduced 43 + the CRLF artifact on C.UTF-8, then all 44 on an `en_US.utf8` database. **Two
  independent rigs missing the same red is the argument for follow-up 3 below.**
- **F7 left arm (D)'s adjudication OWED**, correctly: a bare clock token is only a defect where a
  DATE comes from it, and five of the seven doors write relations carrying date columns. It is
  done in `fa64ecf5d`, body by body on a live catalog, and recorded in the roster's own comment.
- **F7's attribution of the `create_prepayment_schedule` relocation to #1036/0315 is off by one
  file**, and the difference is a real frontier rather than a footnote — see group G.

---

## The rig, and the one thing about it that changed an answer

Three disposable WSL PostgreSQL 17 clusters, all dropped at the end:
`rigfix` 55704 (the estate), `rigdrs` 55705 (the DR source), `rigdrt` 55706 (the DR target).

**The verification database is `en_US.utf8`, not `C.UTF-8`, and that is deliberate.** CI's
`postgres:17` service container initdb's with locale `en_US.utf8` — its own log says so
(`ci-estate.log:108310`) — while every lane cluster on this rig is `C.UTF-8`. One of the 44 db
reds is a pure collation difference and is INVISIBLE on a C.UTF-8 rig: the first from-scratch run
here reproduced 43 of the 44 and passed that one. The second from-scratch database was created
`--template=template0 --locale=en_US.utf8`, so the final run sees exactly what the runner sees.
The second chain needed the #867 role-census-reset recipe first (20 clara% roles down to 14, then
back to 20 inside the chain); `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never
set.

**A worktree artifact, named because it cost a cell.** `packages/db/migrations/0230_knowledge_retrieval.sql`
was on disk in this worktree with CRLF line endings although `.gitattributes` says `eol=lf` and
the committed blob has none. A chain applied from that copy installs bodies carrying 122 CR bytes,
and `knowledge-key-grammar`'s `kg.05` pins `sha256(prosrc)` of
`clara.record_work_knowledge_read`: it read `7065ece7…` against the pinned `8f745815…`, and
`sha256(replace(prosrc, chr(13), ''))` reproduced the pin EXACTLY. A local-only red, CI green, no
branch defect. The file was restored from the blob before anything else ran. **The lesson for the
next worker: never re-measure a body sha on this rig without checking the migration's line
endings first.**

---

## Group A — gate A **F1** · #977 · `not ok 271`, `authority-ref-human-instruction.test.mjs:185`

**Reproduced** on the from-scratch chain: `p977.definition.one`'s reader census returned
`_obo_plan_core`, `create_accounting_plan`, `sign_depreciation_authority` against a pinned two.

**Cause.** `packages/db/tests/authority-ref-human-instruction.test.mjs:214` censuses every clara
body whose `prosrc` contains `clara._authority_ref_refusal(` and deep-equals it against the two
doors #977's ruling names. Integration commit `0dadf0a69` restored `clara._obo_plan_core`'s own
claim — `packages/db/migrations/0308_deferred_revenue_recognition.sql:889`, "THE AUTHORITY SHAPE,
verbatim from clara.create_accounting_plan" — after `bb102839c` had left it at two authority kinds
and lane 04's own parity cells went red on it. The widened door reads the shared definition, so
the verbatim twin does too. A third reader, by construction.

**The brief's prescribed fix was not available, and this is the disclosure.** It said to fix the
BODY, on the hypothesis that the inline chat-lane existence test had been copied into a second
function. It had not: the cell's `carriers` assertion (`_accrual_plan_core` alone) passes unchanged
and only the READERS census failed. Removing the helper call from `_obo_plan_core` would re-break
`p915.obo.refusals_match` and `p941.obo.authority`, which the brief requires to stay green. No
migration was touched, no redo was run, and no pin moved.

**Fix.** The census is widened BY NAME, with the reason, and gated on the catalog carrying
`clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)`
so a pre-0308 database still measures two. It stays an exact closed world — a FOURTH reader still
reds it.

**Gates.** `authority-ref-human-instruction` + `prepayment-stated-term` under the full 125-token
gate chain: **22 pass / 0 fail.** `p915.obo.refusals_match` and `p941.obo.authority` green in the
whole-suite run.

---

## Group B — gate A **F2 · F3 · F6** · #945/#948/#939 · 41 cells, one root cause and two riders

**Reproduced** on the from-scratch chain: 43 members against 41, 11 registered against 9, and the
roster deepEqual refusing before the ceremony's `update` ran.

**Cause, and why it cascaded.** `delta-catalog-phase.mjs:466` and `delta-contract.test.mjs:124`
carry a CLOSED-WORLD evaluator census by design. #945's `evaluate_payroll_run_state` v1 (0296) and
#948's `evaluate_agreement_contract_state` v1 (0299) register two new closures and neither was
named. `delta-contract`'s roster assert then refused BEFORE the one-way ceremony's `update`, so no
metric evaluator was ever deployed and every later phase died on `CLR10 metric evaluator is not
deployed`: cells `21`, `24`-`27`, `29`-`30`, `33`-`51`, `57`-`59`, and the file-level `908`.
`1027` (epsilon's own floor, 7 against 5) is the same census in a second battery.

**Fix, and the decision inside it.** Both closures are COVERED by the ceremony rather than
excluded, and that is a decision rather than a default: neither ships dark. The live catalog
census of bodies reading `clara.evaluator_versions` names only the metric, report and prepayment
families, so nothing refuses on their `deployed` flag and no battery of theirs must witness a
pre-flip refusal — unlike `evaluate_fs_pack_agent`, `evaluate_metric` v2 and `prepayment_schedule`
v1/v2, each of which owns a separate one-way flip. Both are NAMED, never counted into a bumped
total, and each is added CONDITIONALLY on its own registration so a pre-0296 / pre-0299 chain
still measures exactly. 0296's own §D.1 header and its single-member closure are what make
"covered" the honest reading.

**A rider this found (`delta-contract.test.mjs:200`).** The post-transaction deployed total was
missing the `v4Deployed` term the other three totals gained with #939's fourth exclusion. Green on
a fresh witness either way, one short on any database whose #939 ceremony had already run — the
same latent class #1016 recorded against `delta-catalog-phase`'s own census. Added.

**The second rider — `not ok 2991`, `prepayment-stated-term.test.mjs:303`.** `p939.evaluator.frozen`
asserted `deployed === false` off the LIVE row. `deployed` is global one-way state and three
batteries run a ceremony over it before this file's name is reached in the package run order, so
the cell was asserting which files ran first, not what 0305 does — the dependency the wave-3
addendum forbids in so many words. Re-stated on the migration text (registration present,
registered with `false`, no `UPDATE`), the shape lane 01 adopted for its own two cells as SPEC-02.

**Gates.** `delta-contract` + `epsilon-contract` on the re-run arm: **129 pass / 0 fail**; both
arms green in the whole-suite run below, whose from-scratch database is the fresh witness.

---

## Group C — gate A **F8 · F9** · #945 and #871 · `packages/runtime`, `not ok 867` and `not ok 1261`

**`867` — `facts-gate-consumer.test.mjs:126`.** Reproduced: the gate left no skipped_kind receipt.
#926's owner ruling (2026-09-18, option G) reopened payroll reading and #945's 0296 gave
`payroll_summary` its OWN `payroll_facts` lane, so the kind no longer reaches the router's
fall-through and the `invoice_facts / failed / skipped_kind` receipt the cell named is gone. The
cell's premise moved with the ticket and the cell had not.

Retargeted exactly as `packages/db/tests/a21-classifier-gate.test.mjs`'s §5 already retargeted the
gate's own battery, and to the same kind it picked. The half that was ALWAYS the point is kept and
STRENGTHENED — a payroll summary never enters the INVOICE lane, now asserted as no invoice_facts
task of ANY status rather than only no runnable one — and the HELD half moves to
`tax_correspondence`, a kind the router's ladder genuinely has no arm for (verified against the
live `clara._enqueue_invoice_facts_core` body and `clara.documents`' own kind CHECK).

**`1261` — `l9-tls-ca.test.mjs:341`.** #871 added the EIGHTH lane,
`CLARA_INVITE_PREVIEW_DATABASE_URL`, to `lane-probe.mjs`'s `LANE_ROSTER` and not to
`tls-ca.mjs`'s `TLS_CHECKED_DSN_VARS` — precisely the silent hole that cell exists to catch, since
the two cannot be derived from each other without closing an import cycle
(lane-probe to pools to tls-ca). Widened BY INTENT: what the roster governs is the CA-pin
obligation on every DSN this image connects with, and a lazily configured lane carries it exactly
like an eager one — 0309 ships both roles NOLOGIN and the credential is an operator ceremony that
follows the migration, so when the DSN arrives it must arrive pinned. An unset variable is skipped
by the reader, so listing an unprovisioned lane costs nothing. The sibling SPELLING cell's
expected list takes it too; that cell is the spelling instrument and the superset cell is the
identity one. `packages/runtime/README.md`'s TLS section says so now (`f01ac4543`).

**The brief said "the lane roster grew by the two new lanes". It grew by ONE.** The diff against
`origin/main` for `lib/lane-probe.mjs` adds exactly `INVITE_PREVIEW_LANE`; there is no second new
lane.

**Gates.** `facts-gate-consumer` **12 pass / 0 fail**; `l9-tls-ca` **20 pass / 0 fail**; both plus
`rollback-preflight` once under WSL as user `runner`: **76 pass / 0 fail**.

---

## Group D — gate A **F4** (the role roster) · #871 · `db-live-gates`, `dr-verify: FAIL [4.5]`

**Cause.** 0309 mints the NOLOGIN group `clara_invite_preview` and its login shell on 0163's
pattern. Lane 05 added both names to `packages/db/deploy/roles-bootstrap.sql`'s `grp` and `logins`
arrays — and not the two GRANT statements 0163's pair has in sections 2a and 2b. `pg_dump` never
captures roles, so that file IS the role-recreation path for a DR restore: the target got the pair
and not its memberships. A restored project would have carried a preview lane whose login could
reach nothing.

**Fix.** Two lines, each mirroring 0309 section A statement for statement rather than restyled —
the plain INHERIT-style grant (`clara_invite_preview_login` is created `inherit`, and the door's
whole point is that the shell inherits the group's one EXECUTE) and the plain `to postgres` grant
0309 calls "test-only SET ROLE reachability".

**The same pair was also unregistered in the closed-world role census** that
`er9-gates-boundaries`'s `R9.H3` reads (`not ok 1045`): an unregistered live `clara_` role is a
finding there by construction, and both were. Each entry in
`packages/db/tests/fixtures/wake-allowlist-roster.mjs` carries its own presence probe (the door's
exact signature `clara.preview_invite_by_token(text,bytea)`, then the group's existence) so the
cell stays bimodal-green across the 0309 frontier, and its `why` records what the census cares
about — the group holds EXACTLY ONE EXECUTE, measured off the live catalog, and no table grant.

**Proven by the round trip, BOTH WAYS**, on two disposable PG17 clusters, one backup file, and a
FRESH target cluster dropped and recreated for each run so the target's `pg_authid` genuinely
started empty. Source: a from-scratch 309-file chain, seeded, roles-bootstrapped, with the WDK
world bootstrapped, dumped at the full profile (9,045,048 bytes).

| `deploy/roles-bootstrap.sql` | result |
|---|---|
| as merged on `integration/riders-w4` | `dr-verify: FAIL` — **PASS 668 · FAIL 1 · SKIP 6 · INFO 10** · `[FAIL] 4.5 clara_% memberships — source-only 2` |
| with these two lines | `dr-verify: PASS` — **PASS 669 · FAIL 0 · SKIP 6 · INFO 10** · `[PASS] 4.5 clara_% memberships — 23 row(s) identical` |

The FAIL run reproduces CI run 35969325205's message word for word, including both source-only
rows. Note for whoever repeats this: `restore-full.mjs` step (a) runs the WORKING TREE's
`roles-bootstrap.sql`, so the "before" run needs the pre-fix file on disk — bootstrapping the
target by hand from a pre-fix copy and then restoring with a fixed tree silently passes.
`pg_dump` is not on the Windows PATH, so the backup and restore were driven from WSL with
`/usr/lib/postgresql/17/bin` and `/opt/node/bin` on PATH.

**Gates.** `er9-gates-boundaries` + `f-a2-chat-limb` + `chain-minted-roles-drift-guard` +
`invite-preview-public` under the full gate chain: **41 pass / 0 fail.**

---

## Group E — gate A **F5** · #942 · `not ok 2643`, `not ok 2644`, `not ok 4536`

0304 splices `accrual_side` and `accrual_plan_status` into `clara.list_review_queue`'s json
builder on exactly the `authority_id` idiom #974/0260 established: both derive from the shared
`id` at build time, so they are PRESENT, and null, on EVERY row, and only an
`accrual_bill_conflict` row carries a value. The envelope went **31 to 33 keys** estate-wide.

Two files pin that shape and keep INDEPENDENT copies of the roster on purpose — two restatements
a wrong edit cannot move together in silence — so both were re-stated, with their count sentences.
`2644` is the seeding file's `after` hook reporting "expected 2 cells to run, 1 did" behind the
first failure: one cause, two reds.

**Gates.** Covered by the 39-cell run under group G, and by the whole-suite run.

---

## Group F — not in gate A (its rig is C.UTF-8 too) · #1031 · `not ok 2395`, `knowledge-fye-day.test.mjs:457`

**The asymmetry that named the cause.** The first local from-scratch run (C.UTF-8) reproduced 43
of CI's 44 reds and PASSED this one. `fd.12` reads three live knowledge records and compares them
with a literal, ordered by `knowledge_key, applies_when::text`. Two of the three share a key and
are separated only by that jsonb rendering: a from_fy object against an empty object. Under C that
is a byte comparison, so the double quote (0x22) beats the closing brace (0x7D) and the FY2025 row
sorts first; under glibc en_US.UTF-8 punctuation is ignored at the primary level, the empty object
reduces to the empty string and sorts first instead. Measured both ways with `sort` under each
locale before anything was changed.

The x42 rosters in the same suite are NOT affected, and that is not luck: `proname` is of type
`name`, which is collated `C` whatever the database is. That is also why CI's x42 diff looked
byte-sorted while its fd.12 diff did not.

**Fix at the ORDER, not the assertion:** both terms carry `collate "C"`, so the readback has a
total order the database cannot renegotiate and the literal means the same thing on either host.
This is the only `applies_when::text` ordering in `packages/db`.

---

## Group G — gate A **F7** · #938/#939/#940/#871/#941 · `not ok 5355 · 5357 · 5366 · 5367`

The x42 S5.25 arms are live catalog censuses with pinned, stem-gated rosters. Lane 01 registered
its five cohorts; lanes 03, 04 and 05 did not.

**Arm (D), the bare-token roster — SEVEN names**, each read off the LIVE body, each carrying
exactly one occurrence, all of them an INSTANT stamped on a row or compared with a stored instant,
never a date the books turn on: `skip_plan_occurrence` (0302, the `at` key beside `skipped_by`),
`record_prepayment_stated_term` (0305, `superseded_at`), `enrol_prepayment_account` and
`retire_prepayment_account` (0306, `retired_at` on a roster row — the enrolment door retires a
superseded profile on its way in, which is why both carry it), `preview_invite_by_token` (0309,
the rate window and the `expires_at` comparison), and `replace_prepayment_schedule` /
`replace_revenue_recognition_schedule` (0317, `superseded_at` on the predecessor schedule).

**Arm (B), the zone-string duplication roster — FOUR in, ONE out, and the one out is a
RELOCATION.** #915's 0307 extracted the whole schedule body into `clara._prepayment_schedule_core`
and left `clara.create_prepayment_schedule` a one-line delegation that spells the zone nowhere
(measured: 1,413 bytes of `prosrc` against the core's 38,889). That name is now REVERSE-gated on
0307's stem the way `begin_chat_turn`'s and `sign_adjustment_template`'s are, so a frontier pinned
before the extraction still expects it. `_revenue_recognition_core` (0308) and the two 0317
correction doors join it. All four inherit #653's CLASS 1 adjudication unchanged: each hands
`Asia/Kuala_Lumpur` to `clara.create_accounting_plan` as the `p_timezone` ARGUMENT and republishes
it as the envelope's `timezone` key, and derives no date from either.

Every gate is the STEM, never the number — doubly load-bearing for 0317, whose number was
contested at integration (lane 06's fix-round file moved to 0318 so this one could keep it).

**The gate is 0307's stem and not 0315's, against gate A's F7.** That report attributes the
relocation to #1036/0315 (`prepayment_wake_reroute`). The files say 0307: in 0307
`clara._prepayment_schedule_core` spans lines 340-893 and all three of that file's
`Asia/Kuala_Lumpur` literals (783, 790, 870) sit inside it, while
`clara.create_prepayment_schedule` begins at 894 and carries none; 0315 and 0317 recut the core
and keep the literals rather than moving them. Gating either side on 0315 would leave every
frontier pinned at 0307 through 0314 wrong in BOTH directions at once — the core missing from the
roster and the door still demanded on it. `clara._revenue_recognition_core` was checked the same
way and does join at 0308's stem (0308's literals at 1369/1377/1449 sit inside it, 1007-1459).

**Arm (D)'s adjudication, which gate A left OWED (`fa64ecf5d`).** Wave 3 cleared its three doors
with the cheap proof that every column they stamp is TIMESTAMPTZ. That is not available here:
five of these seven write relations carrying DATE columns too. So each body was read on a live
309-file catalog TWICE — every line carrying a clock token, and every DATE-typed local it
declares. **The two lists are disjoint in all seven**, which is exactly the assignment-cast shape
arm (D) exists to catch, absent; and every clock read lands on a timestamptz target. Where a date
IS written, its source is named: `skip_plan_occurrence`'s `due_date`/`period_key` come from
`clara._plan_due_nth` and `clara._plan_occurrence_period_key` over the plan's authority floor and
the revision's `effective_from`; `record_prepayment_stated_term`'s `period_start`/`period_end` ARE
its own arguments, the dates the person states; the two `replace_*` doors are the only ones that
declare date locals (`v_new_start`, `v_new_end`) and neither name appears on a clock line — both
come from the corrected term's own json and the predecessor's remaining periods.
`enrol_prepayment_account`, `retire_prepayment_account` and `preview_invite_by_token` write no
date at all, and `preview_invite_by_token`'s `v_now` is declared `timestamptz` and only ever
compared with `attempted_at` and `expires_at`. `clara._book_today()` is not owed by any of them:
none answers "what is today", and one that later did would belong on the arm (B) roster instead.

**Gates.** The three x42b2 files + `knowledge-fye-day` + `ninth-rowkind-seeding-proposal` +
`work-question-reads` under the full gate chain: **39 pass / 0 fail.**

---

## Group H — not in gate A · two reds CI cannot see, and they are wave-4 regressions

Every cell in `rollback-preflight.test.mjs` is gated on the WDK world being bootstrapped, and
`db-estate` hands `@clara/runtime` a template copy of the estate with no world, so all of them
skip there. `db-live-gates` bootstraps worlds but does not run the runtime unit suite. Found by
running the whole runtime suite against a world-bearing database.

**1. B3 — every document LANE in the catalog's own check constraint is covered.** #945's 0296 and
#948's 0299 added `payroll_facts` and `contract_facts` to `ck_processing_task_lane_f_a1` and to
`reconciler-documents.mjs`'s `enqueueForLane` allowlist — the allowlist this map's own cell claims
it mirrors EXACTLY — and neither reached `DOCUMENT_LANE_CLASSES`
(`packages/runtime/lib/rollback-preflight.mjs:346`). Not a safety hole: an unmapped lane falls
into the fail-closed `known:false` bucket. It is a WRONG ANSWER — a live payroll or contract task
reads to a rollback preflight as a lane this image has never heard of, refusing a rollback it
should have allowed and naming no class. The same omission class the integrator already fixed once
this wave, in `c9968b5fc`. Class names are the registry's own (`workflowPins.payrollFacts` and
`.agreementFacts`), never re-spelled.

**2. The frontier is READ from clara.schema_migrations when the caller does not supply one.**
#1035 gave the rule table its first CONTRACT rules (0254's committed ceiling refusal, 0279's
parked depreciation run) beside the body rules it already had, and `preflight` defaults
`contracts` to an empty array. This cell had always called it without a contracts roster —
harmless while no contract rule existed, and now a declaration that the image understands NOTHING,
collecting two contract violations that have nothing to do with the frontier read the cell is
about. It now passes this image's own `RUNTIME_CONTRACT_IDS`, which is what the production caller
does (`scripts/rollback-preflight.mjs:270` passes the TARGET's own) and the exact roster the #1035
cell below it already proves satisfies every rule.

**Gates.** `rollback-preflight.test.mjs` against a 309-file world-bearing database:
**44 pass / 0 fail** (was 42 pass / 2 fail).

---

## Gates, with counts

| gate | how | result |
|---|---|---|
| the WHOLE `packages/db` suite, CI's order, full 125-token gate chain, from-scratch 309-file **en_US.utf8** database | `pnpm --filter @clara/db test` | **5794 tests · 5699 pass · 0 fail · 95 skipped** — run TWICE, on two independently built databases, identical both times (the second confirms the gate A F7 adjudication commit, which is comment-only) |
| the same, BEFORE the fixes (C.UTF-8) | baseline reproduction | 5727 · 5588 · **44 fail** · 95 — the same 44 CI reports, less `2395` (collation) plus the CRLF `kg.05` |
| `operation-census` + `rig-isolation`, no reset flags | full gate chain | **33 tests · 32 pass · 0 fail · 1 skipped** |
| the WHOLE `packages/runtime` unit suite (Windows), fresh world-bearing database, fresh `.output` | `pnpm --filter @clara/runtime test` | **2970 tests · 2952 pass · 2 fail · 16 skipped** — and the two are exactly the documented Windows-only reds |
| the touched runtime files under WSL as `runner` | `/opt/node/bin/node --test`, three files | **76 pass / 0 fail** |
| the DR full-profile round trip, two clusters | `backup --profile full`, `restore-full`, `dr-verify` | **PASS 669 · FAIL 0 · SKIP 6 · INFO 10**, and **PASS 668 · FAIL 1** without the fix |
| `pnpm typecheck` | workspace | **exit 0, zero TS errors** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | workspace | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | — | **322 frozen / 57 modules / 3 retired — unchanged** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | — | **OK** |
| per-group targeted db runs, full gate chain | four invocations | **22/0, 129/0, 39/0, 41/0** |
| the four gate A F7 cells, re-run after the adjudication commit | the three `x42b2-*` files | **6 pass / 0 fail** |
| the built-artifact cells, after `pnpm --filter @clara/runtime build` | `built-bundle-gate` + `p6-1-chatturn-v16` | **36 pass / 0 fail** |

**The two remaining runtime fails, and the two that went away:**

| cell | why |
|---|---|
| `1091 scanner rejects EICAR…` | RIG.md's named Windows-only red — Defender removes the EICAR fixture before the scanner reads it |
| `1545 (#806) this host's OWN probe: pg_dump/psql are on PATH here` | RIG.md's named Windows-only red — no `pg_dump` on the Windows PATH |

An earlier run of this suite, against a database that had ALREADY carried one, also reported
`1051 [0051 §2] the crash window…`. That cell asserts `sweep.documentTransportless >= 1`, and it
is a re-run artifact rather than a branch defect: it passed on the first run against a given
database, passes **4 / 0** alone against one that has not carried a suite run, and passes in the
confirmation run above. CI runs the suite once, on a fresh template copy. It is still worth the
follow-up below.

The FIRST whole-suite runtime run also reported `54` and `1482` (`built-bundle-gate` and
`p6-1.bundle`) against this worktree's STALE `.output`, which predated lane 01's two new workflow
bodies. CI's `db-estate` has no build step and no `.output`, so both cells log and return there.
After `pnpm --filter @clara/runtime build` both pass, which independently confirms that
`c9968b5fc`'s `workflowBodies` / `workflowPins` repair reaches the served artifact.

**One rig repair was needed and is named rather than hidden:** this worktree's `node_modules`
predated the integration branch's `@shadcn/react` dependency, so `apps/web` typecheck failed on
`TS2307 Cannot find module @shadcn/react/message-scroller` until `pnpm install --frozen-lockfile`
ran. The lockfile did not move.

---

## Anything unverified

- **The apps/web suite was not re-run.** It was green on CI (5173 tests · 5171 pass · 0 fail ·
  2 skipped) and no file under `apps/web` is touched by this branch. The `ENVIRONMENT_FALLBACK`
  lines in its output are next-intl warnings and were left alone, as instructed.
- **No browser walk was run.** No `apps/web` file changed.
- **`delta-contract`'s FRESH arm and its RE-RUN arm are both proven, but on two different
  databases** — the re-run arm on the first (consumed) database, the fresh arm on the second
  (from-scratch). No single database can witness both.
- **The en_US.utf8 proof is a reproduction, not a guarantee.** It matches CI's initdb locale as
  the container's own log reports it; a future runner image that changed that locale would move
  `fd.12` again, which is exactly why the fix pins `collate "C"` rather than a literal order.
- Three clusters (`rigfix`, `rigdrs`, `rigdrt`) were created and dropped. No lane cluster, no port
  in 55700-55702 or 55721, and no other worktree was touched.

## Follow-ups worth filing

1. **A lane added to `ck_processing_task_lane_f_a1` must join four rosters, not two.** This wave
   added two lanes and missed `DOCUMENT_LANE_CLASSES` (group H) after already missing
   `workflowBodies`, `workflowPins` and the OWN-export list (`c9968b5fc`). One cell deriving all
   four from the catalog's own CHECK would have caught both at the lane's own PR.
2. **`rollback-preflight.test.mjs` is invisible to CI.** Every cell is world-gated and no CI job
   runs the runtime unit suite against a world. Two wave-4 regressions lived there undetected.
   Either `db-live-gates` should run that one file, or `db-estate`'s runtime database should get a
   world.
3. **The rig's C.UTF-8 clusters do not match CI's en_US.utf8 container.** This wave paid one red
   for it. A lane cluster created with `--locale=en_US.utf8` would surface collation-ordered
   readbacks where they are written, not at integration.
4. **`intake-recovery-db.test.mjs`'s crash-window cell is not re-run-safe** on a database that has
   already carried a suite run. Not reached by CI, which runs the suite once; worth a cell-level
   scope or a fresh-firm guard before someone loses an afternoon to it.
