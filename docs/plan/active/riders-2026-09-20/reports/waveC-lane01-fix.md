# Cut phase, lane C1 — the fix round for the two-axis review and the adversarial lens

**Branch** `riders/wC-lane01` · **base** `6da02a8de` · **worktree** `C:\Users\zhant\Desktop\clara-wt\635`
· **database** `clara_l01` (127.0.0.1:55741) · tickets #985, #1000, #1030, #1135.

ONE implementer fixed every finding (`/implement-spec`). **Ten new commits on top of the lane's
twenty-seven; the head is `195250eb7`.** Nothing was rebased and no earlier commit was amended.

**Did a status request arrive mid-task? No.**

## 1 · The commits this round added

| commit | what |
|---|---|
| `614890168` | one recording, one key; the look-alike question ends the turn (ADV-C1-01b, ADV-C1-02, ADV-C1-07, ADV-C1-08) |
| `bc5754b60` | migration **0323** — a recording is not its own look-alike (ADV-C1-01a, ADV-C1-03) |
| `4a443bc63` | migration **0321 edited and redone** — a no-op guard may not read a date the session's way (ADV-C1-04, ADV-C1-06) |
| `7d2d9f82d` | the belt derives from the live reading, and is driven end to end (ADV-C1-05, C1-SPEC-04) |
| `6c79f67de` | the term question shows the four facts; the deferred census names all seven (C1-SPEC-05, C1-SPEC-09) |
| `cba43d827` | the Work walk parks on A10's proposal — and it caught a red (C1-SPEC-02); the duplicated-helper note |
| `a8c6c1fb0` | the manifest for the fix round, and the census's own spread rule |
| `a4de48694` | the chat walk drives the question and the answer as TWO turns (ADV-C1-02); both READMEs |
| `bb252511b` | two literal censuses 0323 moves, grown rather than loosened |
| `195250eb7` | the walk's model reads the PERSON'S words, not the system message |

## 2 · Every finding, and what happened to it

### Blocker

**ADV-C1-01 — the duplicate probe self-matches the invoice the same call just admitted. FIXED, both halves.**

The finding says two changes are needed and neither alone is enough. Both landed.

*(a) The probe no longer sees the caller's own recording.* Migration **0323** (CUT-PLAN §5 R7: the
overflow block for the cut phase starts at 0323; lane C2's 0322 is reserved and unused) adds two
SIBLINGS and edits nothing. `clara._trade_invoice_probe_core(uuid,text,jsonb,text)` calls 0275's
three-argument core and removes the invoices recorded under the caller's own intent key, restating
`match_count` over what survives; `clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text)`
(`clara_runtime`) carries the key. Neither new argument has a DEFAULT, so a four-argument call still
resolves to 0275's own door — which `chatTurn_v21`'s parked runs reach, and which §TAIL pins
byte-for-byte along with four other bodies. `chatTurn.v22.tools.ts` passes `intentKey` as the fifth
argument.

*(b) `record_anyway` is out of the intent key.* `tradeInvoiceIntentKeyV22` strips it before hashing:
the call that asks and the call that goes ahead are ONE recording and carry ONE key, so the
admission door's own idempotency answers the second as a replay.

Driven green on `clara_l01` in `packages/db/tests/trade-invoice-probe-self-exclusion.test.mjs`
(4 cells): the self-match reproduced against the four-argument door and ABSENT from the
five-argument one; a genuine look-alike still reported while an unknown, blank or null key narrows
nothing; the whole retry (probe → ack → admit, twice) leaving ONE invoice and ONE acknowledgement
whose `shown[]` names the EARLIER bill; a stranger refused by the authority preamble before anything
is narrowed. The migration applied FIRST APPLY with its own driven tail arm naming the invoice it
excluded.

### Majors

**ADV-C1-02 — the look-alike question had no stop condition. FIXED.**
`stoppedOnDuplicateQuestionV22` joins the stop set beside `stoppedOnTerminalPost`, so one model
segment can no longer probe, set `record_anyway` itself and record while
`clara.record_trade_invoice_duplicate_ack` writes a durable row asserting a person was warned. The
only way past the question is a NEW turn, which by construction follows a human message.

Stopping the loop costs the model the step it would have narrated in, and a `duplicates_found`
result mints no part of its own — so the segment appends the door's own question as a `text` part
(`withDuplicateQuestionTextV22`). Without it the turn would end in silence with nothing to answer.
No new wire kind. The prompt stanza says so too: "THE TURN ENDS THERE — you cannot answer your own
question."

Driven on a real World (`tests/chat-turn-v22-e2e.mjs`, reshaped): leg **2a** asserts the turn
SETTLES with the question on `clara.chat_messages` as assistant text, still ONE invoice and NO
acknowledgement row; leg **2b** has the person come back in the SAME session and say go ahead, and
asserts the second invoice's Work names the turn that ANSWERED, not the turn that asked.

**ADV-C1-03 — a retried recording wrote a SECOND acknowledgement naming the invoice it authorises.
FIXED as a consequence of ADV-C1-01; the acknowledgement door is deliberately untouched.**
With the self-match gone, a retried identical recording is shown the same earlier invoices, hashes
the same `ack_digest` and replays the first row — cell 3 of the new battery counts the rows and
reads the stored `shown[]`. Making the door idempotent on `(firm, client, intent_key)` ALONE would
have broken a ruling the estate already measured: 0275's own fix round (ADV-1007-1) rules that a
second acknowledgement under one key for DIFFERENT figures is a second record BY DESIGN, because a
browser form keeps one intent key per draft and `clara.get_trade_invoice_duplicate_ack` resolves
which one a Work rode by digest. `p1007.ack.rode_this_recording` is that cell, and it stays green.

**ADV-C1-04 — the widened no-op guard refused a real date correction, and its verdict moved with the
session. FIXED.** `clara._fact_calendar_day` now carries `set DateStyle to 'ISO, YMD'` — the
"only a spelling that means ONE day in any session" rule, implemented by Postgres's own parser
rather than by a second, weaker one. ISO and spelled-month forms still answer a day; `03/05/2026`,
`03-05-2026` and `05.03.2026` answer NULL and fall through to the trimmed-text comparison, which is
exactly what 0268 answered before the widening. The conservative direction is deliberate: this
guard may let a cosmetic edit through, and it may never refuse a real one.

**ADV-C1-05 — `source_moved_again` consumed the op key and left a dead end. FIXED, and the premise
is now measured rather than argued.** The derivation takes the figure off `live_facts`;
`from.moved_again` and `from.correction_cents` carry the fact rather than swallowing it;
`source_moved_again` leaves `REDERIVATION_DECLINED` because it is no longer a word a settlement can
put in front of a person; and `rederivation_is_unchanged` is narrowed to the case it was written
for, so a document corrected BACK to the retired reading is re-offered rather than declined into the
same cul-de-sac by another name.

**C1-SPEC-04 — the re-derivation lane had never run against Postgres. FIXED.** Two cells in
`packages/db/tests/work-source-correction-rederivation.test.mjs` (14 of 14 green) drive the REAL
module through the REAL doors in one process: backlog → derive → `clara.admit_journal_work` →
`clara.settle_source_corrected_rederivation`. They prove the successor carries 99900 and not 115000,
that `superseded_by` is claimed, that the settlement is durable under the correction's own key, that
the task is attributed to `clara-source-correction-rederive:v1`, and that the successor's brief names
both figures. The second cell drives ADV-C1-05's race with two real corrections and asserts the
PREMISE (the second correction retires nothing and never reaches the backlog) before the fix. Inside
one rolled-back transaction with a SAVEPOINT per correction, because the rig is shared with every
earlier cell in the file. A vacuity control with the decline restored under another name REDS the
race cell; the subject was restored byte for byte.

**C1-SPEC-02 — AC3's Work walk, and the three legs the roster buys. PARTLY BUILT; the rest is
re-priced with its evidence rather than left as a bare gap.**

* **The Work walk on A10's proposal: BUILT, and it caught a red.** `fixed-asset-acquisition-e2e.mjs`
  was still asserting `deepEqual(source_ref, {kind, asset_id})` — v4's shape — so the cut had
  shipped a red nobody had run. Two legs now drive `claraWork_v6`'s park on a real World:
  **2a** the first acquisition parks with the #933 proposal block (`v: 1`, `start_date` 2026-09-01,
  `residual_cents` 0, `method` and `useful_life_months` NULL with the reason naming account 1510).
  `start_date` is the load-bearing one: `wave4-lane05-fix.md`'s CORRECTED contract casts
  `fa.acquired_date::text`, and without it node-postgres returns a JS Date at local midnight whose
  UTC spelling under Asia/Kuala_Lumpur is 2026-08-31 — every depreciation charge a day early. **This
  is the only place that cast is proved end to end.**
  **3b** a SECOND acquisition on the same client and account, once the first is complete, GROUNDS:
  straight_line over 60 months, its sibling's own particulars, and a different reason sentence. That
  is the half of #933 a person notices. FIXED ASSET ACQUISITION E2E: PASS, all six legs.
* **#931's two-advance leg: already built** in `chat-turn-v22-e2e.mjs`, as the review agreed.
* **#937 and #942's two accrual legs: the accounting substance is proved at the doors, and the
  uncovered inch is named.** `packages/db/tests/accrual-period-amounts.test.mjs` §`p937.posts`
  ("two periods post two DIFFERENT stated amounts, each reversal undoes its own period's amount"),
  `accrual-revenue-side.test.mjs` §`p942.posts` ("Dr accrued income / Cr revenue on the due date")
  and §`p942.periods` (both contracts together) were **re-run green on clara_l01 for this round**.
  What they do not cover is the ENGINE dispatching a widened occurrence — version-independent
  machinery that `accrual-e2e.mjs` already drives for the flat accrual on the same occurrence lane.
  I did NOT add the legs to `accrual-e2e.mjs`, and the reason is a measurement: that file arms a
  PROCESS-WIDE `CLARA_WORK_TEST_FAULT=exit_after_commit` and quiesces every other queued Work so the
  crash lands on its own accrual, then PAUSES the plan so its reversal leg can be driven by hand. A
  second accrual in the same file races its own legs. The leg belongs in a file of its own —
  **follow-up 1**.
* **#915's prepayment World leg: still owed — follow-up 2.** It needs a posted source entry with
  exactly one debited asset leg plus an enrolled prepaid account, which no current World fixture
  builds.
* **A8/A9's term and enrolment questions in the Work walk:** the term question's four-key context is
  now pinned at the unit seam (C1-SPEC-05); the enrolment question is not built at all (C1-SPEC-03).

**Still owed to AC3, in one line:** two accrual World legs, the prepayment World leg, and an
enrolment-question leg. Every tool half is cut and cell-covered; what is missing is the engine
driving it. **This needs the orchestrator's acceptance before the release ceremony, or four tickets.**

**C1-SPEC-03 — A8 and A9 are applied WITHOUT their enrolment question. Recorded as PARTIAL; no code.**
The measurement in `chatTurn.v22.tools.ts:1441-1449` stands: `clara.open_work_question` needs a
running task and a run-minted hook token, and the chat lane has neither, so the chat half names the
account and points at the client's Registers panel (which is D2's own ruling) and opens nothing.
**A8 and A9 are PARTIAL against AC1, not applied** — that is the roster line the orchestrator should
accept, and **follow-up 3** is the ticket that builds the question on the Work lane, where a run and
a hook token do exist.

### Minors

**ADV-C1-06 — the `invoice.currency` arm case-folded any text. FIXED.** The arm is gated on
`^[A-Za-z]{3}$` on BOTH sides, so prose ("Ringgit Malaysia") and a two-letter symbol ("RM") get the
trimmed-text rule the file's own header states for a value with no canonical form. Driven in
`r1030.cosmetic.currency_prose` and in 0321's §TAIL.

**ADV-C1-07 — `allocations_confirmed` was hashed into the intent key. FIXED.** `claimIntentKeyV22`
strips it; a cell pins that the key is identical with and without the flag while a different SPLIT
still moves it. The same finding's measurement (no `_reserve_op`, no unique index on the claim's own
shape) is why the key is the only wall, and the cell's comment says so.

**ADV-C1-08 — a cell title overstated its subject. FIXED.** The cell is retitled to what it proves
("record_anyway is absent from the particulars the door receives"), and the assertion the finding
asked for — the intent key is IDENTICAL with and without the flag — is its own cell beside it. That
cell is the one that would have caught ADV-C1-01.

**C1-SPEC-05 — A8's term question carried model prose as its context. FIXED.**
`answerPrepaymentTermInputSchemaV6` has no `context` key any more — a rejected key rather than an
ignored one, the same shape as the absent date field beside it — and `prepaymentTermContextV6` builds
`{source_entry_id, document_id, prepaid_account_code, total_cents}` from the run's own
`read_prepayment_source` answer, where all four already are. An absent fact is reported as absent
("no document carrier"), because that absence is itself something the person needs to know. It stays
a STRING because `clara.open_work_question`'s `p_question` envelope carries `context` as one, in
claraWork.v2's frozen step and in every surface that renders a question.

**C1-SPEC-06 — A5's proposer ships with no caller and is now hash-locked. PARTIAL, recorded; no code.**
The measurement stands: the candidate read (`clara.staff_advance_summary`) is `clara_authenticated`
only, so nothing in the machine lane can feed `proposeAllocationsByDate`. The tool can refuse an
unconfirmed split and cannot propose one. **A5 is PARTIAL against AC1**, and **follow-up 4** is the
report's own successor contract 2: an OBO twin `clara.staff_advance_summary_for`.

**C1-SPEC-07 — A8/A9's part-kind clauses are answered by declaring the payloads non-parts. Recorded
as a roster-level deviation; no code.** Both builders discriminate on `kind`, not `type`, so the
payload rides inside the generic `tool_result` and the emittable set is unchanged at six kinds
(`check-parts-parity.mjs` re-verified this round). CUT-PLAN §2.5's "if it is a genuinely NEW
discriminant" branch was resolved by deciding it is not one, which is a legitimate reading — but
"must see it emittable at this cut" is UNMET and no web card renders a configured schedule.
**A8 and A9 are PARTIAL on their part-kind clause**, and **follow-up 5** asks the next cut to decide
whether a configured schedule deserves a wire kind of its own.

**C1-SPEC-09 — the deferred-by-name census listed six of seven. FIXED**, and here are the seven with
their follow-ups: `read_payroll_posting_state` (C1, #946), `read_payroll_settlement_state` (C2, #947),
`read_agreement_terms` (C3, #948), `read_tenancy_terms`, `confirm_tenancy_rent_plan`,
`confirm_tenancy_rent_plan_revision` and `read_rent_settlement_candidates` (C4-C7, #949) — all
DEFERRED by ruling to **#1136** and **#1137**, every one asserted absent by name in
`tests/chat-turn-v22-tools.test.mjs`.

**Standards, duplicated code — FIXED.** `sentenceFor`/`fixFor` and `refreshSentenceFor`/`refreshFixFor`
were byte-identical apart from the table they closed over. One generic
`wordingFor(table, reason, fallback)` replaces all four and the four call sites pass the table they
mean. The fix is small and removes a near-verbatim copy, which is why it was taken rather than
argued about.

### The two findings whose required fix is a RULING, argued rather than silently merged

**C1-SPEC-01 + std-1 — 0320 recuts the human read's body and flips it SECURITY INVOKER →
SECURITY DEFINER, against #1000's own out-of-scope line. NO CODE CHANGE; here is the argument, and
the sign-off it needs.**

The flip is not an accident and it is not, I think, avoidable given the shape the plan of record
requires. The chain, each link measured:

1. CUT-PLAN §1.3 B1 requires the wake-wrapper shape: "a door closed to the agent role is reached
   the house way, with a wake wrapper, its grant and its allowlist row", citing
   `clara.wake_create_account_set` (0115) as the precedent.
2. That precedent's shape is a SECURITY DEFINER wrapper over an UNGRANTED core taking the firm
   EXPLICITLY: `clara.wake_create_account_set` reads `clara.wake_context()` and calls
   `clara._agent_create_account_set_core(w.firm_id, …)`. 0232 had no such core, so the cut had to
   mint one.
3. A wake wrapper is DEFINER, so inside it the executing role is the function owner and RLS on the
   nine relations does not bind. The explicit `and cl.firm_id = p_firm` predicate is therefore
   NECESSARY, not belt-and-braces: without it the wake lane would have no tenancy wall at all.
4. A core that takes the firm as an argument MUST stay ungranted, or any `clara_authenticated`
   caller could pass another firm's id. That is the one-ungranted-core law.
5. An ungranted core cannot be called from a SECURITY INVOKER door. So the human door had to become
   DEFINER, or the wake wrapper had to carry a SECOND COPY of a ~200-line pack body — which is the
   drift the law exists to prevent.

What #1000's out-of-scope line protects is preserved in substance: the signature, the defaults, the
envelope, the coverage words and the refusal codes are all unchanged, and 0320's §TAIL proves the
body is 0232's plus exactly three anchored edits by REVERSING them and hashing back to the pinned
pre-image. The vacuity control the standards review names (removing `and cl.firm_id = p_firm`) is
caught by `p1000.wake.no_oracle` and by the human lane's own `p660.pack.cross_firm`; both batteries
were re-run green this round (140 tests over the lane's db scope, 0 fail).

**What I cannot do is issue the ruling.** The orchestrator must either ACCEPT the split as the
estate's own `_*_core` containment idiom and record that #1000's out-of-scope line is superseded by
CUT-PLAN §1.3 B1, or DEFER #1000 as class C was deferred. It must not merge as an undeclared scope
expansion — so it is declared here, in the migration's own header, and in #1000's ticket report.

**C1-SPEC-08 — AC2's `--lock-deployed` clause was deliberately not executed. NO CODE CHANGE; the
CUT-PLAN wins, and the ruling is requested.** `packages/runtime/README.md:1037-1039` and CUT-PLAN
§2.4 both say `--lock-deployed` belongs to the hosted release ceremony (runbook step 11a) and that
locking before deploy would freeze a body no parked run can yet exist for. Locking now would also
globally lock wave 4's ten unlocked `payrollFacts.v1.*` / `agreementFacts.v1.*` entries. Re-measured
this round: `--compare-base 6da02a8de` reports 322 unchanged, 20 additions, 0 mutations, and the
twenty new entries carry `deployed: false`. **Carry `--lock-deployed` into the release runbook's step
11a for this cut's twenty entries plus wave 4's ten.**

### The three notes, recorded

* **C1-SPEC-10** — #1000's AC2 authority half is refused one layer earlier than the AC's wording and
  translated (`clara.mint_wake_credential` raises CLR10 `authority_lost`, `clientFinancialPackRefusal`
  translates it to CLR04). CUT-PLAN §1.3 B1's mapping supersedes the AC's wording. No change.
* **C1-SPEC-11** — "nothing can post until answered" is proved structurally, never by a live run.
  C1-SPEC-04's new integration cells admit and settle a successor through the real doors, but no
  ENGINE has claimed one, parked it, had it answered and posted. Still on the unverified list.
* **ADV-C1-09** — `clara.source_correction_rederivations(int)` hands any `clara_runtime` session
  every firm's corrections (61 backlog entries across 14 firms, measured). Not a break: it matches
  the house belt pattern (`clara.sweep_intake_batch_cancellations(integer)` is the same posture) and
  the belt is a leader singleton that needs cross-firm reach. Recorded as the widest new read this
  lane adds; narrowing it is the orchestrator's call, and the shape would be a `p_firm` argument
  supplied by the leader's own cycle.

## 3 · Gates, with counts

Every command from the lane worktree with the RIG.md environment
(`PGHOST=127.0.0.1 PGPORT=55741 PGUSER=postgres PGDATABASE=clara_l01 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`).

| gate | result |
|---|---|
| `pnpm typecheck` (web + runtime) | **clean** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **clean** (one unused import in the new db battery was fixed to get there) |
| `pnpm --filter @clara/runtime build` | OK — `.output/server/index.mjs` 11.7 MB |
| `node scripts/check-worker-paths.mjs` | OK — 2 spawn sites |
| `node scripts/check-workflow-bundle.mjs` | OK — 14 pinned classes, 59 superseded bodies still ship, chatTurn pinned at v22 with its step directive, engine stamp and freeform_result emitter (46 checks) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — emittable set UNCHANGED at six kinds. It REFUSED an object spread first (see below) |
| `node scripts/check-frozen-workflows.mjs` | OK — 342 frozen files, 59 `use workflow` modules, 3 retired |
| `… --compare-base 6da02a8de` | OK — **322 unchanged, 20 additions, 0 mutations, 3 recorded retirements** |
| `… .selftest.mjs` / `… .registration.selftest.mjs` | both OK |
| the six version gates (`registry-view`, `p6-1-parts-parity`, `p6-1-chatturn-v16`, `local-db-gate-drivers-census`, `built-bundle-gate`, `runtime-contracts`) | **75 / 75** |
| **the WHOLE runtime suite** (`node --test "tests/**/*.test.mjs"`, 363 s) | **3136 tests, 3096 pass, 2 fail, 38 skipped** |
| db gate chain (256 preintegration gates) over the lane's scope | **140 tests, 139 pass, 0 fail, 1 skipped** |
| `apps/web` migrations-corpus pin test (`tests/firm-scope-db-pins.test.ts`) | **22 / 22** — 0323 adds no dynamic SQL, so no reviewed-barrier row was needed |
| the accrual cells the roster's two owed legs name (`p937.posts`, `p942.posts`, `p942.periods`) | **3 / 3** |
| `tests/fixed-asset-acquisition-e2e.mjs` (Work walk, real World) | **PASS**, all six legs |
| `tests/chat-turn-v22-e2e.mjs` (chat walk, real World, reshaped) | **ALL PASS** (132 121 ms), five legs |
| `tests/version-cutover-e2e.mjs` (CUT-PLAN §4.3) | **ALL PASS** — the parked `chatTurn_v7` run resumes on its ORIGINAL body while the new admission goes to `chatTurn_v22` |

**The two suite failures are the documented Windows-only reds, reported as such and never "fixed":**
`scanner rejects EICAR, encrypted PDF, and XML entity expansion` (#693, Defender eats the fixture)
and `(#806) this host's OWN probe: pg_dump/psql are on PATH here` (they are not on this PATH). The
previous round measured the same two.

**When each gate was run, stated rather than implied.** The whole runtime suite, the typecheck, the
lint chain, the build and the four post-build/freeze gates ran at `a8c6c1fb0`. The three commits
after it touch only `tests/chat-turn-v22-e2e.mjs` and `tests/chat-turn-v22-serve.mjs` (neither is
a `*.test.mjs`, so neither is in `pnpm test`), the two READMEs, `rig-meta.mjs`,
`packages/db/package.json` and two `packages/db` test files — so the suite result stands at the
head, and the db gate chain and both World walks were run AFTER those commits. `pnpm lint` and
`eslint` were re-run on every file each of those commits touched.

**`check-parts-parity.mjs` earned its keep.** It REFUSED `{ ...input }` in `claimIntentKeyV22` —
"unclassifiable object spread" — which is the estate's own rule rather than a style note: a spread is
how an unreviewed type discriminant reaches a transcript part unseen. Both key helpers use
`Object.assign` and a delete, and say why.

**Two literal censuses moved with 0323** (CUT-PLAN §5 R3's class, found by RUNNING the db chain, not
by grepping): `p1007.probe.is_a_read` asserted three probe bodies and now asserts the four
SIGNATURES; `p655.grants`'s public-door roster is `select distinct` because two overloads of one name
are still one name.

## 4 · The rig work the walks needed, recorded

`tests/chat-turn-v22-e2e.mjs` and `tests/fixed-asset-acquisition-e2e.mjs` both admit only
`clara_rt_test` / `clara_wave_b_ci`, and RIG.md forbids bootstrapping a World on a lane database
(#866 reds `rig-isolation` T10b). So, exactly as the #1135 round did: `create database clara_rt_test
template clara_l01` on the lane's own cluster (a template copy, never a second from-scratch chain —
0154 pins a cluster-global role count), `packages/runtime/node_modules/.bin/bootstrap` for the WDK
schemas, then quiesce the clone's inherited queue (`session_replication_role = replica`; every
non-terminal `clara.agent_tasks` and `clara.accounting_work` row cancelled) so a fresh engine's
reconciler does not starve the leg it is waiting on — v21's own trap 2, and the first attempt of this
round hit it: 150 s of reconciler churn over ~1 500 inherited tasks and the walk's second turn never
got dispatched. **That quiesce is a disposable-database action and belongs nowhere near
`clara_l01`.** The clone was dropped afterwards. `clara_l01` is the only database on the cluster and
`rig-isolation` T10b is untouched.

**The migration frontier on `clara_l01` is now 312 files / `0323_trade_invoice_probe_self_exclusion`.**
0321 was REDONE through the #957 path (`CLARA_MIGRATION_REDO`), new checksum
`8c2a25951513be625931a7db5a47353a6a8060e3bec43f6cdc96f84f5e0a959f`. Because redo takes the highest
applied version only, 0323 was unwound first (its two siblings dropped, its ledger row deleted) and
re-applied afterwards; it is back at FIRST APPLY with its own prestate and §TAIL clean. A second
`migrate` reports 0 new applied and no drift.

**0321's prestate pins are unchanged by the edit** — the edit is confined to §A's two new bodies,
both `create or replace`, and to §TAIL's assertions. Every neighbour sha in §0.4 still measures
identical (the redo's own prestate loop proves it on every apply).

**0323's prestate pins, MEASURED on `clara_l01` at frontier 0321** — the list the integrator reads to
find a pin another lane recuts. This file recuts NONE of them; they are pinned because it delegates
to them and because §TAIL proves afterwards that it left every one alone.

| signature | sha256(prosrc) |
|---|---|
| `clara._trade_invoice_probe_core(uuid,text,jsonb)` | `74215b42802317f0aa8c2dc1dea48488a562bc8ee17f1df53a41c8b2b6a7cf56` |
| `clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)` | `d94bbbfde7905d5e76c98a1a680a5cb45f56ec5ece9893b3002cadd2847d75f0` |
| `clara.probe_trade_invoice_duplicates(uuid,text,jsonb)` | `fd7a0f37e793496db0d3a76fcd393be61e6559b81a5a98fc38795d1afccfcb64` |
| `clara._trade_invoice_duplicate_matches(uuid,text,uuid,text,date,bigint)` | `99bf25f4b9cf50389b2e7a51b798db6ea25ef157dec65ca4e5897ae2e5543541` |
| `clara._trade_invoice_actor_firm(uuid,uuid)` | `2c863ef26b2ebf7e1ad2ab41759467b7440dbc427035b03409b8078590ad47bd` |
| `clara._trade_invoice_resolve_party(uuid,text,jsonb)` | `cf9460134236788238181f5b8921aff0434bf279d41755d0d914451ee7353ed8` |
| `clara._trade_invoice_reference_key(text)` | `b3a277f4e40303476c9315175ad879353b90737250eeb25c8b00da0d28faad2b` |
| `clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)` | `2144be53c2de62f2096982ed698469b69d78e08f3f661308161e0d755de752b7` |
| `clara.get_trade_invoice_duplicate_ack(uuid)` | `1068254d3353ed4266beb555e55d98d7954fe4b06382ef7e787596dbd10be4ba` |
| `clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)` | `c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c` |

**0323's FIRST-APPLY branch was exercised for real** (mode `FIRST APPLY`, twice), so the wave-3
addendum's "prove the first-apply branch yourself" is satisfied by the apply itself rather than by a
rolled-back reconstruction. Its redo branch is the `v_i = 2` arm and was not exercised.

**0323 adds no rig-meta cohort, and the absence is recorded in `packages/db/tests/rig-meta.mjs`
beside #1007's own cohort**: the roster is name-keyed, T17's grant matrix is name-keyed, and both new
siblings carry exactly the posture the name they share already declares. A second cohort would
enumerate two names twice and assert nothing new; what 0323 does assert, it asserts in its own §TAIL.

## 5 · Docs updated in the same commits

* **`packages/runtime/README.md`** — a new `#### What the cut's FIX ROUND changed, and the one
  migration it added` under the cut-phase pin section: the self-exclusion and its deploy order, the
  intent-key rule, the look-alike stop and the text part it needs, the term question's four facts,
  and the belt's live-reading derivation.
* **`packages/db/README.md`** — the cosmetic-edit table now carries the DateStyle pin and the
  three-letter currency gate WITH their measurements; §T9's redo branch is explained; and a new
  section records 0323 (the defect as measured, the sibling shape, the no-default rule, and why the
  acknowledgement door is untouched).
* **`packages/db/tests/rig-meta.mjs`** — the note beside #1007's cohort saying why 0323 adds none.
* **`packages/db/package.json`** — the new preintegration gate in the chain, in migration order.
* **`CONTEXT.md`** — NOT touched. This round adds no new domain term: "a recording is not its own
  look-alike" is a rule about an existing one, and #1135's own commit already carried the cut's
  vocabulary.
* **`docs/PRD.md` / `docs/ARCHITECTURE.md`** — NOT touched (AGENTS.md rule 4). The blueprint pin
  drift CUT-PLAN §2.8 and §5 R8 record is still there and still the orchestrator's to carry:
  `docs/ARCHITECTURE.md:171`, `:183`, `:207`, `:445` say `chatTurn_v19` / `claraWork_v3`.

## 6 · Follow-ups worth filing

1. **The two accrual World legs in a file of their own** (#937's two-period `stated_period_amount`
   and #942's revenue side, end to end through the engine). `accrual-e2e.mjs` cannot host them: it
   arms a process-wide commit fault and quiesces every other queued Work so the crash lands on its
   own accrual. The doors are already proved by `p937.posts`, `p942.posts` and `p942.periods`.
2. **#915's prepayment World leg.** It needs a posted source entry with exactly one debited asset leg
   and an enrolled prepaid account; no current World fixture builds one.
3. **The A8/A9 enrolment question on the WORK lane**, where a run and a hook token exist. The chat
   lane measured itself unable to open one, and D2 forbids the model proposing the account anyway —
   so the question belongs to a Work, with the answer applied AS THE ANSWERING PERSON.
4. **`clara.staff_advance_summary_for`**, the OBO twin that would let A5's `proposeAllocationsByDate`
   have a caller. Until it exists the tool can refuse an unconfirmed split and never propose one, and
   the helper is hash-locked inside the v22 closure.
5. **A wire kind for a configured prepayment / recognition schedule**, or a ruling that the generic
   `tool_result` is the answer. Today neither payload is emittable and no web card renders one.
6. **Two turns in one chat session** (C1-SPEC-12, carried forward). The #1135 round measured three
   turns in ONE session failing on the second with `Invalid prompt: messages must not be empty`.
   This round's walk drives TWO turns in one session (the question, then the answer) and they pass —
   so whatever the earlier failure was, it is not "a second turn in a session cannot run". It is
   still undiagnosed and still worth a ticket, and the diff gives one clue worth writing down:
   `messageFromParts_v10` maps only `text`, `clarify`, `je_review`, `refusal` and `attachment` parts
   into history, so an assistant turn whose parts are ONLY a tool-result card contributes nothing to
   the next turn's messages.
7. **`clara.source_correction_rederivations(int)`'s unscoped reach** (ADV-C1-09), if the orchestrator
   wants the posture narrowed.

## 7 · The roster as shipped AFTER this round, with each entry's honest status

Three findings (C1-SPEC-03, C1-SPEC-06, C1-SPEC-07) ask for PARTIAL marks "in the lane report's
roster table". The work order lets me write exactly ONE file outside the worktree — this one — so the
roster is restated here rather than by editing `waveC-lane01-ticket1135.md`. This table supersedes
that report's roster wherever the two differ.

| entry | ticket | status after this round | what is missing |
|---|---|---|---|
| A1 | #982 | **APPLIED** | — |
| A2 | #1007 | **APPLIED**, and hardened by 0323 + the stop | — |
| A3 | #986 | **APPLIED** | — |
| A4 | #985 | **APPLIED** (0319 unused, door already granted) | — |
| A5 | #931 | **PARTIAL** | `proposeAllocationsByDate` has no caller: the candidate read is `clara_authenticated` only (follow-up 4). The refusal half is applied and cell-covered |
| A6 | #937 | **APPLIED**; door-level posting proved by `p937.posts` | the World leg (follow-up 1) |
| A7 | #942 | **APPLIED**; door-level posting proved by `p942.posts` / `p942.periods` | the World leg (follow-up 1) |
| A8 | #915 | **PARTIAL** | the enrolment question (follow-up 3); the part-kind clause (follow-up 5); the World leg (follow-up 2). The chat tool, the twin door, the term question and its four-key context are applied |
| A9 | #941 | **PARTIAL** | the enrolment question (follow-up 3); the part-kind clause (follow-up 5) |
| A10 | #933 | **APPLIED**, and now DRIVEN on a real World (the proposal block, both grounded and ungrounded) | — |
| A11 | #945 | **APPLIED** | — |
| B1 | #1000 | **APPLIED**, with the SECURITY posture change awaiting the orchestrator's ruling (C1-SPEC-01) | — |
| B2 | #1030 | **APPLIED**, and now DRIVEN end to end against Postgres | no ENGINE has claimed, parked and posted a successor (C1-SPEC-11) |
| C1-C7 | #946 #947 #948 #949 | **DEFERRED** to #1136 / #1137, all seven absent by name | — |
| D1 | #939 | **CARRIED** (no tool, no grant) | — |
| D2 | #940 | **CARRIED** (no tool, no grant) | — |
| E1 | #960 | **EXCLUDED** by ruling | — |
| G1, G2 | — | no action, as the plan says | — |

## 8 · Anything unverified

* **The SECURITY INVOKER → DEFINER change on `clara.get_client_financial_pack` has no ruling.** The
  argument is §2's; the sign-off is not mine to give.
* **No engine has run a re-derived successor to a posting.** The new cells admit and settle one
  through the real doors and the successor's brief answers, but the claim-park-answer-post chain is
  still structural (C1-SPEC-11).
* **The two accrual World legs, #915's prepayment World leg and the A8/A9 enrolment question** are
  not built; the doors behind the first two are proved and the third is measured impossible on the
  chat lane.
* **`--lock-deployed` has not been run**, by decision (C1-SPEC-08), and belongs to the release
  ceremony's step 11a.
* **The two-build cutover drill (CUT-PLAN §4.4) is the integrator's**, on a fresh cluster, and was
  not run here.
* **The scripted model is a mock.** The chat walk proves the DOORS, the ORDER, the STOP and the
  DURABLE ROWS; it does not prove that a real model reads the appended question and answers it. What
  it does prove is that the question is on the transcript for one to read.

## 9 · What running the gates found that the reviews did not

Two of this round's findings were not on anyone's list; both came from RUNNING something rather than
reading it, and both are worth the orchestrator's attention because they are the class of miss the
cut phase keeps paying for.

1. **`fixed-asset-acquisition-e2e.mjs` was RED against the cut and nobody had run it.** The cut
   repointed `claraWork` to v6, whose ONE change to that lane is the question's `source_ref`, and the
   e2e still asserted v4's shape with a `deepEqual`. CI would have found it; the lane would have
   handed CI a red it had never seen. CUT-PLAN §4.1's "the suite is what caught three of this cut's
   four own misses… a targeted run is not the suite" applies to the WORLD batteries too, and they are
   not in `pnpm test`.
2. **The chat walk's shape was only *believed* to prove the question.** Once the segment stops, the
   scripted model is never called again in the turn that asked — so the marker line the leg waited on
   could no longer be printed by anyone, and the first run of the reshaped leg timed out waiting for
   it. The leg now reads the question off `clara.chat_messages`, which is what a person reads, and
   the serve child exits 97 if it is ever asked again after a `duplicates_found` result. A leg that
   waits on a log line the subject can no longer emit is a leg that passes for the wrong reason the
   day someone removes the wait.

## 10 · Verdict

Every blocker and every major ends FIXED or, for the two whose required fix is a RULING, ARGUED with
its evidence and handed up. Two things must happen before this lane merges, and neither is code:

1. **The orchestrator rules on 0320's SECURITY posture** (C1-SPEC-01 / std-1): accept the
   `_*_core` split as the estate's own idiom and record that #1000's out-of-scope line is superseded
   by CUT-PLAN §1.3 B1, or defer #1000.
2. **The orchestrator accepts AC3's Work-walk clause as PARTIAL** with follow-ups 1-3 filed, and
   AC1's A5, A8 and A9 as PARTIAL per §7's roster (C1-SPEC-02, C1-SPEC-03, C1-SPEC-06, C1-SPEC-07),
   and confirms that CUT-PLAN §2.4 beats AC2's `--lock-deployed` wording with the command carried into
   the release runbook's step 11a (C1-SPEC-08).

Nothing was pushed, no PR was opened, no GitHub object was written, and no worktree but this lane's
was touched — except this one report file in the main checkout, which is not committed.

---

### Appendix A · the chat walk's own log, this round

```
[v22-e2e] PASS 1: turn one admitted one trade-invoice Work and acknowledged nothing
[v22-serve] chat call: invoice_answers=0 last=null
[v22-e2e] PASS 2a: the look-alike ended the turn — question on the transcript, no invoice, no acknowledgement
[v22-serve] chat call: the person said go ahead; recording with record_anyway
[v22-serve] chat call: invoice_answers=1 last={"ok":true,"status":"queued",...}
[v22-e2e] PASS 2b: the person answered in a turn of their own, and one acknowledgement rode with the recording
```

The middle three lines are the measurement in miniature: the turn that ASKED produced one model call
and nothing else, and the flag was set only after a human message.

### Appendix B · a third thing the stop surfaced in the walk's own harness

Reshaping leg 2 exposed a latent defect in `chat-turn-v22-serve.mjs` that the OLD behaviour hid.
The scripted model selects one act per turn from a cue, and it read the cue with `promptText`, which
concatenates EVERY message in the prompt — the SYSTEM one included. That message carries the client
context pack, which names this client's counterparties, so "Alpha Supplies" matched on the CLAIM turn
too and the script emitted an invoice call on a turn that asked for a claim.

Under the old behaviour that was invisible: the misfired invoice call came back `duplicates_found`,
the model was asked again, it set `record_anyway`, the invoice branch resolved, and the claim branch
was reached on the next call of the same turn. With the stop, the misfired call ENDS the turn and the
claim never happens — so the harness defect became a failure. Fixed by a `userText(prompt)` helper
that reads only `role === "user"` messages, which is what the file's own comment ("one act per turn,
and the turn's own words are what select it") had always claimed.
