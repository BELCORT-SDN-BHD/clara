# Riders wave 4, lane 01 — the review fix round

**Branch** `riders/w4-lane01` · **worktree** `C:\Users\zhant\Desktop\clara-wt\635` · **base** `cd2925391`
**Head before this round** `98fb80561` · **head after** `0f4811b1c` (eleven commits)
**Database** `127.0.0.1:55741 / clara_l01`, migrations 0001 → 0300 (294 files applied, no checksum drift)

One implementer, every finding from all three reviews (spec, standards, adversarial). Thirty-six
findings: thirteen blockers, nine majors, eight minors, six notes.

## 1 · The eleven commits

| commit | what |
|---|---|
| `b1bed1efc` | `fix(db): #947` a reversal mirror is not a payment, and a high-stakes settlement waits for its checker |
| `55b43294a` | `fix(db): #949` the rent read is keyed on the plan, the MPERS arm asks, and the agent lane reads nothing |
| `494ff2870` | `test(db): #945 #946 #948` the pins and censuses this lane moved, re-based against the live catalog |
| `d77a4a8da` | `test(db): #945 #948` 0020 section 6 gains AMENDMENT W4 for the two lane rosters this wave widened |
| `b8dca580b` | `feat(web): #949` the tenancy rent and deposit panel AC4 and AC5 were owed, and `#945` gives en.json its bytes back |
| `06c82be37` | `fix(web): #948 #949` needs-you's own row-kind census is re-derived from its array |
| `cc924e8ee` | `fix(lint,web): #945` the field-path lint throws where it fell back silently, and the db-pin corpus is re-measured |
| `839abd6f7` | `docs: #944` the glossary bans derivation, not reading, and the fix round in CONTEXT and the data-plane README |
| `8f73ba43f` | `test(lint): #945` the field-path lint's own selftest drives the ADV-08 raise instead of arguing it |
| `abe062bbe` | `test(db): #946 #947 #948 #949` the SECOND approve-writer census this lane widened, re-based |
| `0f4811b1c` | `test(e2e): #949` the two tenancy reads answer EMPTY on a spec with no tenancy, not a 404 |

## 2 · The migrations, and how they were re-applied

`0298_payroll_net_pay_settlement.sql` and `0300_tenancy_terms_rent_plan.sql` were EDITED. Both are
this lane's own, unmerged. `CLARA_MIGRATION_REDO` takes the **highest applied version only**, and
the first defect was in 0298, two files below the frontier — so the supported path was reached the
way `wave3-lane06` reached it, and the one hand step is recorded rather than implied:

1. `delete from clara.schema_migrations where version in ('0299_agreement_contract_acquisition', '0300_tenancy_terms_rent_plan')` — one statement, returning exactly those two rows. Its ONLY purpose is to make 0298 the highest applied version.
2. `CLARA_MIGRATION_REDO=0298_payroll_net_pay_settlement node scripts/migrate.mjs` — prestate clean, the §E queue splice reported its own marker (a redo no-op), tail OK, redone.
3. `node scripts/migrate.mjs` — 0299 and 0300 re-applied by the ordinary path; every prestate took its already-applied branch and every splice no-opped on its marker.
4. `CLARA_MIGRATION_REDO=0300_tenancy_terms_rent_plan` twice more, for the two fixes that landed after the first pass (the MPERS threshold, and the settlement core's lock ordering).
5. Drift check: `node scripts/migrate.mjs` → `0 new migration(s) applied · 294 total`, no checksum drift. The committed files and the applied catalog agree.

**New checksums** (re-measured, and re-pinned in `apps/web/tests/firm-scope-db-pins.corpus.ts`):

| migration | checksum |
|---|---|
| `0296_payroll_summary_typed_facts` | `e565d3713e90c37d3f3ac3d1e80d334292cac520ca7504bafa061cc7ef7cad25` (unchanged) |
| `0297_payroll_summary_posting` | `25ba80f517b201290fd0f3676bdffdc5c60a0def4a068511e9b2fc4f06bf28af` (unchanged) |
| `0298_payroll_net_pay_settlement` | `0adbc49aed0a521b747804305ea5b445213afd03517174c126ff5ca3dc065595` (**moved**) |
| `0299_agreement_contract_acquisition` | `c8caeb96849ef4d6ce56fb47d7f856e1fbf3eb9031f3846eb2834c72c8d3b43b` (unchanged) |
| `0300_tenancy_terms_rent_plan` | `3ecaf6f09ee6ac0ad646114100b1ab990daf0354b7515df42853943fa9da9eb4` (**moved**) |

**Bodies whose `sha256(prosrc)` moved** and where each is pinned now:

| body | new sha | pinned in |
|---|---|---|
| `clara._payroll_net_pay_unsettled(uuid)` | `e95d5beb42cd546b2fdb3d29ec285e334e258b83085c62f192bbb388a30f100e` | 0298 tail T.6 (structural, not a sha) |
| `clara._settle_payroll_net_pay_core(...)` | `bedabfdbd6b5f48e2c12ef5aeecb681971b6a7354e7cc8fd8c3bcb19285fed40` | 0298 tail T.6 |
| `clara._rent_payable_unsettled(uuid)` | `458964d8e6f28bf8df016f11d5f82305d2e5ba964dbe625cf39d2fa9fcd9b4c0` | 0300 tail T.8 |
| `clara._settle_rent_payable_core(...)` | (recut twice; structural) | 0300 tail T.8 |
| `clara._tenancy_lease_treatment(uuid,uuid)` | `1666cc76d4a17cb54acf672a3a792c15dbf48c823cc5ebff256845eac33182a6` | 0300 tail T.8 |
| `clara.confirm_tenancy_rent_plan(...)` | `4561bcf6de011930f5c9b74fa90bca1bd24af105398f2fe584bf21c696ceb4ce` | 0300 tail T.8 |
| `clara.get_tenancy_deposit_coding(uuid)` | `2ceefb9cac34c65edc965ce350443af1bd8fec18088558fe2f4cf73d5a509900` | 0300 tail T.8 |
| `clara._client_reporting_framework(uuid)` | (now calls `clara._book_today()`) | 0300 tail T.8, x42 arm (B) |
| `clara._tenancy_escalation_state(uuid)` | (now calls `clara._book_today()`) | 0300 tail T.8, x42 arm (B) |

`clara.list_review_queue(jsonb,jsonb,integer)` did **not** move (`886df580…`): every splice in
0297–0300 is marker-detecting and no-ops on a redo. `clara.claim_document_processing_task` is at
`16b4d47b…`, 0299's post-image.

**A note for the integrator.** No new migration file was written. The lane's five numbers
(0296–0300) are unchanged, and a from-scratch `0001 → 0300` chain on a disposable cluster is still
owed against five acceptance criteria (SPEC-20) — it was not run here, because a second
from-scratch chain on a lane cluster is forbidden and 0154 pins the cluster-wide role count.

## 3 · Every finding, and what happened to it

### Blockers

| id | verdict |
|---|---|
| **SPEC-01** | **Fixed.** `payroll-summary-facts.test.mjs:913` pinned the published registry at 5; #948's 0299 raised it to 6 in the SAME lane and only `document-capability-registry.test.mjs` was re-based. Now 6, with a comment naming the second site so the next republication finds both. |
| **SPEC-02** | **Fixed, and re-stated so it cannot recur.** Both cells asserted `clara.evaluator_versions.deployed = false`, which is GLOBAL one-way state the suite's own `migrate-evaluator-freeze` battery flips. The CLAIM is about the MIGRATION — 0296/0299 register an evaluator and never deploy it — so it is now asserted on the migration text (registration present, no `update clara.evaluator_versions`, registered with `false`), which no other battery can move. |
| **SPEC-03** | **Fixed.** The router's `witness_extraction` activation census is 4, not 3, with 0299's own recorded reason beside it in the shape #945 used. A FIFTH is still a finding. |
| **SPEC-04** | **Fixed.** `clara.claim_document_processing_task` was recut TWICE in this lane; the pin named 0296's post-image. Re-measured to `16b4d47b…`. One flat value rather than a generation ladder, because 0296 and 0299 are consecutive in one chain. |
| **SPEC-05** | **Fixed.** `firm-portfolio-pack.test.mjs`'s no-recut pin gains a fourth generation for the lane's four splices, gated on the LAST file's own STEM (`tenancy_terms_rent_plan$`), never a number — the renumber hazard wave 3 lane 04 already paid for. All four files named in the failure text. |
| **SPEC-06** | **Fixed, as a contract amendment.** AMENDMENT W4 in `wb-0020-legacy.test.mjs`, for BOTH members of §6's closed set. The claim body's four pairs are transcribed from 0299's own splice literals plus 0296's recut of the same sites; the router's four are MACHINE-DERIVED (a line diff of the live body against 0123's own source, the #606/0177 hunk excluded, the reconstruction asserted **byte-equal** to 0123 before transcription). Dormancy-safe, loud on drift. The pin is not retuned. |
| **SPEC-07** | **Fixed by declaration, plus one assertion the census did not make.** `clara._client_reporting_framework` is declared in #654's cohort census with its reason and measured there like every other consumer (STABLE, no DML). The cell now ALSO asserts it is UNGRANTED — reachable by no application role at all — because that is what makes "it authorises nothing" structural. The census's second half is untouched: `create_accounting_plan` still refuses a `knowledge_record` reference outright. |
| **SPEC-08** | **Fixed by revoking.** `clara_agent_ro` loses its SELECT and its policy on `clara.contract_terms` and `clara.contract_plan_confirmations` (the reviewer's "re-check contract_terms too" was right — it failed the same wall). The sweep admits an agent table grant only where the lane has NO DOOR; this lane has doors. 0300's tail now asserts both facts in-migration. Standing owner ruling honoured: access control is not loosened. |
| **SPEC-09** | **Fixed, and stated as the governance change it is.** The approve-writer census goes from five bodies to NINE, each gated on its own file's stem and each named with its reason. Two are unattended AGENT posts (`approval_arm='agent_unattended'`, the F-A2 D10 arm that does not participate in maker/checker); two are HUMAN accept acts that DO, and after ADV-04 they leave a high-stakes entry a draft. **Owner-visible:** this lane widens the set of bodies that may approve a journal entry from five to nine. |
| **SPEC-10** | **Fixed by calling the authority.** `clara._client_reporting_framework` and `clara._tenancy_escalation_state` call `clara._book_today()`. `clara._tenancy_rent_plan_draft` keeps the zone NAME and is rostered with its reason: it passes it as `create_accounting_plan`'s `p_timezone` ARGUMENT and derives no date from it, and there is no authority returning a zone to call instead — the roster's own "a roster amendment is right only if a body genuinely cannot" case. |
| **ADV-01** | **Fixed.** `and je.reversal_of is null` in the payroll FIFO's debit pool. Driven: `payroll-settlement.test.mjs` S7 reverses August and asserts May is still unpaid and still offered. |
| **ADV-02** | **Fixed, on BOTH sides.** The rent FIFO excludes a mirror from the debit pool AND from the credit pool — reversing a rent SETTLEMENT mirrors a credit to the payable, which the first cut read as a fresh month of rent recognised. Driven: `tenancy-rent-plan.test.mjs` S10. |
| **ADV-03** | **Fixed where it was wrong; the residual is stated below.** The confirm door gains a fifth named refusal, `payable_account_in_use`, so two live rent plans can no longer share one payable account; the read emits one row per LIVE PLAN (no `distinct on (payable_account_code)`) and attributes a credit to the plan whose own term window contains it. |

### Majors

| id | verdict |
|---|---|
| **SPEC-11** | **Fixed.** Both x42 rosters re-derived against the live catalog: arm (B) gains one name with its reason, arm (D) gains nine (each stamping an INSTANT on a row, none deriving a ledger date), all stem-gated. |
| **SPEC-12** | **Fixed.** `CONTEXT.md:761` now reads "it computes none of them". AC1 and AC3 stay the wayfinder/to-spec follow-up #944's own report drafts — `docs/PRD.md` and `docs/ARCHITECTURE.md` are the files a lane ticket may not edit, and `CONTEXT.md` is not one of them. |
| **SPEC-14** | **Fixed.** `RentSettlementsSection` mounts in `/bank?tab=matching` beside #947's payroll panel: the open months with their candidate lines and an Accept per line, and the deposit offers with the account the standard chart ships and the lines that could be them. New wire modules, two unit test files, manifest entries and copy. AC4 and AC5 now have a surface a person can reach. |
| **SPEC-15 / ADV-07** | **Fixed.** `apps/web/messages/en.json` is rebuilt from its BASE bytes plus the 71 new keys at their parent objects. Measured before: 652 insertions / 640 deletions across 24 hunks for 71 added keys, 0 removed, 0 values changed. Measured after, including this round's own new rent copy: **105 insertions / 4 deletions across 5 hunks**. |
| **ADV-04** | **Fixed on both doors, at parity with the ordinary one.** Each settlement core probes `clara.is_high_stakes` on the entry it has just built and, where it is high-stakes, returns `status='awaiting_checker'` with the entry left a DRAFT, no post receipt and no bank match — `clara.reverse_entry`'s own posture. Nothing is dark: the entry is balanced and already on the bank's own GL code, so a distinct checker approves it through `clara.approve_entry` and binds it through the ordinary matcher; until then the item stays open BY THE LEDGER and keeps its Needs-you row. A second accept while one waits is refused `settlement_awaiting_checker`. Both cells drive the CONTRAST first (the same entry, booked by hand, refused `CLR05 distinct_checker`) so the parity claim is measured, not argued. |
| **ADV-05** | **Fixed, at a different threshold than the finding proposed.** The MPERS arm now asks for the finance-vs-operating classification — `drafts=false`, reason `mpers_lease_classification`, and the confirm door demands the written judgement — but **above TEN YEARS, not twelve months**. Twelve months was tried first and was wrong in the other direction: it made every ordinary two-year shoplot tenancy demand a written classification, and it turned the lane's whole battery red on its own 24-month fixture. MPERS Section 20 states indicators, not a number, so any number here is this lane's judgement about *when to ask*; premises have an economic life measured in decades, so a two-year tenancy is not in doubt while a decade-long lease is. The number lives in one place, the file says it is the lane's own bound, and the owner may move it. |
| **ADV-06** | **Fixed.** The 1120 balance is allocated oldest-deposit-first across the client's own recorded deposits instead of compared whole against each one, and BOTH figures travel on the row (`coded_cents` = this deposit's share, `deposits_account_balance_cents` = what the account holds, `deposits_sharing_account` = how many deposits share it). Driven: two deposits, one coded, the other still offered. |
| **L01-STD-1** | **Fixed.** `clara.audit_log` is no longer counted database-wide: a high-water `id` is taken before the two reads and no row above it is admitted. The two neighbouring counts were already client-scoped; this one now is too. |

### Minors and notes

| id | verdict |
|---|---|
| **SPEC-13** | **Not fixed — an owner question, and it is put here.** #946's eleventh gate rung (`run_totals_printed`) refuses a payroll post whenever the page prints no totals row, while #945's own recorded owner decision says "a payroll summary with no printed totals row is still readable, because the evaluator sums the rows". The two briefs disagree and 0297's own header calls the narrowing "a product question this ticket does not answer". **The question for the owner: may the evaluator's own row sum be a posting basis?** If yes the rung softens to a Needs-you note; if no, #945's decision line should be amended so the two stop disagreeing. Changing it unilaterally would be a lane deciding a product question, which is the thing the header already declined to do. |
| **SPEC-16** | **Not fixed in the link; improved beside it, and the reason is recorded.** Pointing the row at `/bank?tab=matching` needs a symmetric `bank` entry in `lib/navigation/tree.ts`'s `ACCOUNTING_ITEMS` (the links module's own test proves every query-carrying suffix against `CLIENT_ROUTES`). That registry is one of the nine shared files four lanes edit this wave, and adding a sidebar row is a product change no ticket asked for — work-order rules 5 and 7 both point away from it mid-wave. What DID change: the destination page now HAS the rent panel (SPEC-14), so the bare `/bank` lands one tab from the act instead of on a page that says nothing about rent. The follow-up the lane already recorded stands. |
| **SPEC-17 / L01-STD-2** | **Acknowledged in the file, as asked.** `needs-you.ts`'s header now records that #949 landed TWO row kinds against the "one per ticket" rule, with the reason (AC4 and AC6 are two different questions that clear at different moments by different acts) and the mitigation (both additive, at the end, nothing renamed or reformatted). |
| **SPEC-18 / ADV-09** | **Fixed.** The header census says FIFTEEN and names all five new kinds; the five array comments are renumbered eleventh through fifteenth (they had been numbered from the pre-0288 base, when `seeding_proposal` still existed); and the file now says out loud that an ordinal means "its position in `REVIEW_QUEUE_ROW_KINDS`". |
| **ADV-08** | **Fixed, and the proof ships.** `grammarSourceFile()` chooses its candidate set by the FUNCTION NAME alone and REQUIRES the roster shape of the file that wins, raising by name when it is absent. The selftest drives it against a scratch migration directory whose highest definer carries no roster. |
| **ADV-10** | **Fixed on both doors.** The `FOR UPDATE` on a caller-supplied entry id runs after the row is proved to be this client's. On the rent door the refusal deliberately stays ONE refusal (`not_an_open_rent_month`) for a foreign id, an absent id and an id that is no entry at all — three different answers to three wrong ids is the oracle in another form. |
| **ADV-11** | **Fixed for rent, stated for payroll.** The rent candidate window is 35 days (rent recognised on the 5th and paid on the 25th is an ordinary Malaysian tenancy, and the door applies no window at all), and the window travels ON the row so an empty list never reads as "there is nothing". The payroll window stays 10 days: 0298's header reasons it specifically from Malaysian payroll practice (statutory remittances by the 15th of the following month, net-pay runs preceding them) and that reasoning is unchallenged. |
| **L01-STD-3** | **Recorded here, not edited.** `wave4-lane01-ticket945.md`'s AC2 prose says the evaluator is registered under `search_path = pg_catalog, pg_temp`. It is not: 0296 sets `search_path = clara, pg_temp`, its own tail asserts that, and the live catalog agrees. **The report's prose is wrong and the code is right.** A per-ticket report in the main checkout is not a file this worker may edit (the work order allows exactly one), so the correction is stated here for the integrator. |
| **L01-STD-4** | **Stays, with the reason.** The FIFO "still unsettled" read is written three times (#657, #947, #949). Extracting a shared `clara._account_fifo_unsettled(...)` mid-fix-round would be new migration-shape work inside two tickets that did not ask for it, and the three instances differ (0298 is single-account and flag-keyed; 0300 partitions per confirmed plan and joins the confirmations). Worth a follow-up ticket when a fourth appears. |
| **SPEC-19** | **Unchanged, still an owner reading.** `apps/web/messages/` carries `en.json` only and `i18n/request.ts` is the documented single-static-locale setup; "en and zh copy" is discharged by the migration headers' bilingual titles. Owner confirms the reading or the AC line is struck. |
| **SPEC-20** | **Owed to the integrator.** The from-scratch `0001 → 0300` chain on a disposable cluster, against #945 AC7, #946 AC7, #947 AC6, #948 AC6 and #949 AC9. |
| **SPEC-21** | **Recorded, nothing owed.** #948 AC5's "routed to the contract-terms record" is delivered by #949's 0300, in the same lane. |

## 4 · The residual this round did NOT close, stated plainly

**ADV-03's second half: a credit to the plan's own payable account is read as that tenancy's rent,
whoever booked it.** The two-tenancy collapse is fixed and cannot be created any more. What is not
fixed — and, on the evidence, should not be — is the case the reviewer's probe actually drove: a
hand-booked `Dr 6100 / Cr 2050` on a client whose ONE confirmed rent plan uses exactly those two
accounts. That entry is indistinguishable from a rent accrual for that tenancy, because it is one;
calling it anything else would require a marker no door in this lane can set, since **Clara never
runs the rent plan** — every rent month is booked by a person or by the plan lane, and the read's
whole design (AC4's "by any route, with no dismissal record") depends on counting them however they
were booked. The remaining exposure is a client who accrues an unrelated liability to the SAME
account the accountant pointed the rent plan at, and the answer the estate already gives them is the
one the confirm door now enforces: point it at its own account. Recorded rather than half-built.

## 5 · Gates

| gate | result |
|---|---|
| `packages/db` — `tenancy-rent-plan.test.mjs` (full gate chain) | **53 pass / 0 fail** (5 new S10 cells) |
| `packages/db` — `payroll-settlement.test.mjs` | **19 pass / 0 fail** (2 new S7 cells) |
| `packages/db` — `payroll-summary-facts` + `payroll-summary-posting` + `agreement-contract-acquisition` + `document-capability-registry` + the two above | **172 pass / 0 fail** |
| `packages/db` — `wave-b/wb-0020-legacy.test.mjs` | **9 pass / 0 fail** (was 8/1) |
| `packages/db` — `knowledge-firm-defaults` + `rig-runtime-visibility` + `x56-rest-c` + `x42b2-s5c-clock` + `f-a2-statement-activation` + `firm-document-limits-writer` + `firm-portfolio-pack` | **82 pass / 0 fail** (was 77 pass / 5 fail) |
| `packages/db` — full suite (`pnpm test`), run twice | 5601 tests, 5445 pass, 64 fail, 92 skipped — every lane-caused failure gone; the 64 are rig state, itemised in §6 |
| `apps/web` — `node scripts/run-tests.mjs` (whole unit suite) | **5035 tests, 5033 pass, 0 fail, 2 skipped** |
| `apps/web` — the two new files alone | **8 pass / 0 fail** |
| `apps/web` — `e2e/e2e-fixture-ownership.test.ts` (the shared-mock census) | **44 pass / 0 fail** |
| `pnpm typecheck` | **exit 0** (apps/web, packages/runtime) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | OK — 322 frozen files, 57 `use workflow` modules |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `node scripts/check-document-region-field-paths.mjs` | clean over 1060 files |
| `node scripts/check-document-region-field-paths.selftest.mjs` | OK (one new case) |
| `node scripts/check-wiki-dynamic-sql.mjs` | OK — 1496 definitions, 245 change-of-record patches |
| e2e `payroll-settlement-walk` | **2 passed** (re-run after the mock default) |
| e2e `bank-match-walk` | **6 passed** (re-run after the mock default) |
| e2e `tenancy-rent-plan-walk` | **2 passed** |

Playwright triple: `https://127.0.0.1:3500 / 3501 / 3502`.

## 6 · The full db suite

`pnpm --filter @clara/db test` — the whole suite, exactly what CI runs — was run **twice**, before
and after the last census fix:

| run | tests | pass | fail | skipped |
|---|---|---|---|---|
| the spec review's, on `98fb80561` (quoted from its own report) | 5595 | 5452 | 48 | 95 |
| this round, run 1 | 5601 | 5445 | 64 | 92 |
| this round, run 2 (final) | 5601 | 5445 | 64 | 92 |

**Every failure this lane caused is gone.** All fifteen the spec review named are green, and run 1
found a SIXTEENTH the focused runs had missed — `x42.r8.tails.4`, the SECOND independent
re-derivation of the approve-path census, which pins the same set `x56-rest-c` pins and which only
a whole-suite run reaches. Run 2 shows it fixed. Re-run focused, the files the reviews named are:

| file | before | after |
|---|---|---|
| `wave-b/wb-0020-legacy.test.mjs` | 8 pass / 1 fail | **9 / 0** |
| `knowledge-firm-defaults` + `rig-runtime-visibility` + `x56-rest-c` + `x42b2-s5c-clock` + `f-a2-statement-activation` + `firm-document-limits-writer` + `firm-portfolio-pack` | 77 pass / 5 fail | **82 / 0** |
| every `x42*` file + `operation-census` + `rig-isolation` | — | **358 / 0** (20 skipped) |
| the lane's own six batteries | 171 pass / 1 fail | **172 / 0** |

**The 64 that remain are rig state, not code, and not one of them is in a file this lane or this
round touched** — `git log cd2925391..HEAD -- <file>` is empty for every one. Each was traced to a
specific leftover row count on `clara_l01`, measured after the final run:

| file | fails | what the gate reads | measured on the rig |
|---|---|---|---|
| `f-a5b-sandbox-export-pr1.test.mjs` | 55 | its `before` hook demands `watermark_policy_versions` = **3** rows for `sandbox_watermark`, and raises `F-A5b PR-1 DRIFT` for the whole file | **5** — two `fs7 e2 rig fixture` rows, `created_at` 2026-09-24T03:37, which is after the lane finished (0300 applied 01:32) and before this round began |
| `delta-catalog-phase.mjs`, `delta-contract.test.mjs`, `f-a5-reporting-agency-pr1.test.mjs` | 4 | the evaluator one-way ceremony — a row must be **undeployed** for the cell to flip it | `clara.evaluator_versions` is **10 deployed / 0 undeployed**: an earlier whole-suite run performed the ceremony for every evaluator. This is the SAME hazard SPEC-02 named, and this round removed this lane's own two dependencies on it |
| `f-t1-sst-reference.test.mjs` | 2 | `sst_rate_schedule`'s seed is exactly **TEN** rows | **12** |
| `intake-batch.test.mjs` | 1 | its fresh batch must appear in a sweep bounded at **20** rows | **44** batches sit in `cancelling` |
| `epsilon-contract.test.mjs` | 1 | "requires a fresh disposable DB", by its own title | — |

The rise from the review's 48 to 64 is that accumulation across three whole-suite runs on one
seeded rig (the reviewer's, then two here), not new breakage: every one of these gates reads a
COUNT of rows or a one-way ceremony flag, and none of them reads anything this round changed —
which is why the code version is irrelevant to them and why re-running them on an older head would
fail identically. The integrator's from-scratch chain on a disposable cluster (SPEC-20) is the run
that settles them, and it is owed anyway.

## 7 · Vacuity controls

Both new cell families were shown FAILING against a deliberately broken subject and the subject was
then restored **byte for byte** (`sha256(prosrc)` re-measured either side of the mutation):

- **#947.** `clara._payroll_net_pay_unsettled` with the reversal exclusion removed and
  `clara._settle_payroll_net_pay_core` with the high-stakes arm removed → S7 is **0 pass / 2 fail**,
  failing on "MAY IS STILL UNPAID" and on `awaiting_checker`. Restored: `e95d5beb…` and `bedabfdb…`,
  the pre-mutation values.
- **#949.** All five edited bodies reverted (mirrors back in both FIFO halves, the
  `payable_account_in_use` refusal removed, the MPERS arm sent back to drafting, the deposit offer
  comparing the whole balance, the high-stakes arm removed) → S10 is **0 pass / 5 fail**. Restored:
  `458964d8…`, `0cc83831…`, `1666cc76…`, `4561bcf6…`, `2ceefb9c…`.
- **ADV-08.** The lint's new raise is driven by a shipped selftest case rather than a one-off.

## 8 · Successor contracts

None new. This round changed no frozen chat or Work tool and added no granted door. Two EXISTING
doors changed their **envelope**, and the `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4
must carry the change:

- `clara.settle_payroll_net_pay(uuid,uuid,uuid,text)` and `clara.settle_rent_payable(uuid,uuid,uuid,text)`
  now return `status` — `'settled'` or `'awaiting_checker'` — and on `awaiting_checker` return
  `match_id: null`, `reason: 'high_stakes_needs_checker'` and `eligible_checker_count`. A caller
  that reads success from the absence of an error, or from `entry_id` alone, will tell a person a
  settlement landed when it is a draft waiting for a second pair of eyes. #949's own successor
  contract section (WAVE-4 LANE RULE (d)) should carry this line when it is cut.
- `clara.get_rent_settlement_candidates(uuid)` gains `candidate_window_days` per row, and
  `clara.get_tenancy_deposit_coding(uuid)` gains `deposits_account_balance_cents`,
  `coded_basis` and `deposits_sharing_account`, with `coded_cents` narrowed from "the account's
  whole balance" to "this deposit's own share". Both are additive on the wire.

## 9 · Follow-ups worth filing

1. **The `run_totals_printed` rung** (SPEC-13) — an owner question, stated in §3. It is the only
   finding in this round that a lane may not answer by itself.
2. **A symmetric `bank` matching entry in `lib/navigation/tree.ts`** (SPEC-16) so a settlement row
   lands on the view that carries its act. Deliberately out of scope mid-wave.
3. **`clara._account_fifo_unsettled(...)`** (L01-STD-4) once a fourth instance of the FIFO
   "still unsettled" read appears.
4. **A per-deposit attribution for 1120** — the honest close of ADV-06's own residual, which the
   FIFO allocation bounds but does not remove, and which needs a marker a coding act can set.
5. **`wave4-lane01-ticket945.md`'s AC2 prose** (L01-STD-3) — one word, in a file this worker may
   not edit.

## 10 · Anything unverified

- The from-scratch chain (SPEC-20) was not run; it belongs to the integrator, on a disposable
  cluster.
- The **first-apply** branch of 0298's and 0300's prestates was not re-proved in this round. Both
  files' prestates are marker-tolerant, so `CLARA_MIGRATION_REDO` only ever takes the
  already-applied branch — the wave-3 addendum's warning. The two original ticket reports record
  that proof for the bodies as they stood; this round's edits change the BODIES those prestates
  install, not the prestate logic itself, and 0299/0300 were re-applied through the ORDINARY apply
  path (step 3 above), which is the nearest thing to a first apply this rig can give.
- The db suite's residual failures are named in §6 with what is known about each.

## 11 · Fix round 2 (recheck minors)

The independent recheck (`wave4-lane01-recheck.json`, verdict accept) left two minors open.
Both are closed now, head `62114b48f`.

- **L01-RECHECK-1 / #949.** `0300_tenancy_terms_rent_plan.sql`'s free-standing design-rationale
  comment above `create table clara.contract_terms` (~line 197) still said RLS gave
  `clara_agent_ro` a firm-scoped SELECT — the pre-fix design the SPEC-08 fix commit (`55b43294a`)
  revoked about 90 lines further down in the same file. Rewrote the block to state the actual
  posture (forced RLS, the owner's ALL policy, `clara_authenticated` SELECT, NO `clara_agent_ro`
  grant, reads routed through `clara.get_contract_terms` / `clara.get_tenancy_rent_plan_draft`)
  and point at the "NO AGENT-LANE GRANT" block below it. Verified the live posture on `clara_l01`
  first: `information_schema.role_table_grants` for `clara.contract_terms` shows only
  `clara_authenticated` (SELECT) and `clara_fn_owner` (full) — no `clara_agent_ro` row — matching
  the corrected comment. `clara.schema_migrations` confirmed `0300_tenancy_terms_rent_plan` was
  the highest applied version before touching it, so the comment-only edit (which changes the
  file's checksum) was re-applied with
  `CLARA_MIGRATION_REDO=0300_tenancy_terms_rent_plan pnpm --filter @clara/db migrate`. The redo's
  own tail assertions passed (forced RLS, owner-only, two policies, no agent-lane grant at all,
  the ten granted doors clara_authenticated-only, the five fix-round walls live), and the ledger
  checksum (`c6b9db6d…08f9c`) now matches the file.
- **L01-RECHECK-2 / #944.** This report's own intro (§ line 7-8) said "Twenty-seven findings: ten
  blockers, seven majors, six minors, four notes" while the three source reviews carry 36
  (13 blocker, 9 major, 8 minor, 6 note) and §3's tables already addressed all 36. Corrected the
  intro to "Thirty-six findings: thirteen blockers, nine majors, eight minors, six notes." No
  other count in this file needed correcting — the recheck confirmed the miscount was confined to
  the intro sentence.

**Gates re-run on head `62114b48f`:** `packages/db` `tenancy-rent-plan.test.mjs` under the full
`--import` gate chain from `packages/db/package.json`'s `test` script — 53 pass / 0 fail;
`operation-census.test.mjs` under the same chain — 10 pass / 0 fail; `CI=true GITHUB_ACTIONS=true
pnpm lint` at the worktree root — exit 0.
