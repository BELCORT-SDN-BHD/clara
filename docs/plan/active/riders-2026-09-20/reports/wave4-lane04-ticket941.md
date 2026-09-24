# wave 4 · lane 04 · #941 — deferred revenue: recognise a receipt paid ahead by a customer as revenue over its service period

**Branch** `riders/w4-lane04` · **base** `cd2925391` · **status** DONE (the database half, the web
half and the browser walk; the FROZEN chat and Work half is a successor contract by the ticket's own
division of labour and the wave's `chatTurn_v22` / `claraWork_v6` cut).

**Migration** `packages/db/migrations/0308_deferred_revenue_recognition.sql` (2,763 lines), the
number reserved for this ticket. Applied on the lane database: `clara.schema_migrations` holds
`0308_deferred_revenue_recognition` as its highest version (293 rows).

**Commits** (`git log --oneline cd2925391..HEAD`, this ticket's twelve, oldest first):

| commit | subject |
|---|---|
| `928cce9a4` | `feat(db): #941 the deferred-revenue purpose stops being a column and becomes a rule` |
| `f2fc94da4` | `feat(db): #941 the recognition schedule -- a plan kind, a derived relation and the human door` |
| `60ba1cd27` | `test(db): #941 every reason a receipt cannot be recognised, answered by name` |
| `58079d405` | `feat(db): #941 the monthly admission arm, and the books it moves` |
| `ae9a989fe` | `feat(db): #941 the on-behalf twin, the machine-lane read and the three human reads` |
| `93a477fa8` | `test(db): #941 the document carrier, a correction that moves nothing, the reads, and 0295's own row` |
| `adde3a6d9` | `feat(web): #941 the Deferred revenue destination, its two attention arms and the state ladder they render` |
| `6bec1e822` | `test(web): #941 why the form can offer nothing, what it sends, and what it never sends` |
| `3e68d8ace` | `test(web): #941 the form's pure mirror, and the refusal tokens it can actually name` |
| `65e16d94f` | `feat(web): #941 the roster panel stops being purpose-blind, so the empty state points somewhere that works` |
| `3c01b6685` | `test(web): #941 the browser walk recognises a full year, and the docs that carry the lane` |
| `684dec647` | `chore(db): #941 the rig query scratch file does not ship` |

**A note on what I inherited.** This session picked the ticket up mid-flight: the six `feat/test(db)`
commits above and an UNCOMMITTED web tree (three pages, five components, two lib modules, one test
file, and hunks in `routes.ts`, `tree.ts` and `en.json`) were already on the branch when I started.
Everything from `adde3a6d9` on is mine, including the repairs to what I inherited. Where a cell of
mine was written against code that already existed, I say so and give the vacuity control that makes
it a real cell rather than a restatement.

**The ticket was verified live on this branch before I built anything.**
`gh issue view 941` returns `state: OPEN`, labels `enhancement` + `ready-for-agent`, two comments:
2026-09-19 (the chart-row coordination note: `1180 Accrued Income` is shared with #942, and the four
rows go into ONE chart migration) and **2026-09-23, the newest** (the ruling applied under the
owner's delegation: the pre-step mints `my_sme_starter` version 2 and RETIRES version 1, and v2
carries 0156's society entity overrides). Neither is a later Agent Brief, and there is no owner
ruling comment dated 2026-09-20 on this issue, so the ISSUE BODY is the contract, read together with
the lane rules in my prompt: the FIRST half (the chart rows) is already on this base as migration
0295, and this ticket here is its second half.

**Still live, not already satisfied:** measured on this branch before the web half was built —
`clara.revenue_recognition_schedules` did not exist and no `revenue_recognition_*` function resolved
before 0308; `apps/web` had no `deferred-revenue` route, component or lib module; and
`apps/web/lib/registers/prepayment-accounts.ts` still said in its own header that "this build's doors
admit `prepayment` only".

---

## The seams I tested at

Written down before the first cell. Every one is a public interface the brief names.

| # | seam | kind |
|---|---|---|
| S1 | `clara.create_revenue_recognition_schedule(p_client, p_source_entry, p_revenue_account, p_revenue_basis, p_purpose, p_authority_ref, p_op_key, p_pattern)` | the human door |
| S2 | `clara.create_revenue_recognition_schedule_for(p_client, p_author, …)` | the OBO twin (#915's shape) |
| S3 | `clara.read_revenue_recognition_source_for(p_firm, p_client, p_source_entry)` | the machine-lane read of the RECORDED term |
| S4 | `clara.list_revenue_recognition_schedules` / `get_revenue_recognition_schedule` / `list_revenue_recognition_attention` | the three human reads |
| S5 | `clara.enrol_prepayment_account(p_client, p_account, p_purpose, p_reason, p_op_key)` | #940's door, whose second purpose becomes a rule here |
| S6 | the monthly admission path (`clara._plan_admit_occurrence` → the recognition period line) and the books it moves | the belt |
| S7 | `DeferredRevenueList` / `DeferredRevenueDetail` rendered behaviour | the web surfaces |
| S8 | `DeferredRevenueForm` rendered behaviour and the payload it posts | the configure form |
| S9 | `lib/deferred-revenue/schedule.ts`'s exported functions | the form's pure mirror |
| S10 | `PrepaymentAccountsPanel` rendered behaviour and the two doors it calls | the roster panel |
| S11 | the browser: `/clients/:id/deferred-revenue`, `/new`, `/:scheduleId` | the walk |

`apps/web/lib/firm/needs-you.ts` (the four-lane shared file) is **untouched**: this ticket adds no
review-queue row kind. No frozen workflow body, frozen closure module or applied migration was
edited.

---

## Acceptance criteria, each with its evidence

### AC1 — the plan kind, the relation, the admission arm, and prestate pins on every recut body

**Done.** 0308 §B widens the accounting-plan kind set ADDITIVELY in both places that hold it (the
`clara.accounting_plans` CHECK and `clara.create_accounting_plan`'s own closed set, measured as the
only two) and gives the derived-cadence wall its own arm, so a recognition schedule emits whole
calendar months exactly as an amortisation one does. §C creates
`clara.revenue_recognition_schedules` as `clara.prepayment_schedules` column for column, with three
renamed for this side (`deferred_account_code`, `revenue_account_code`, `revenue_account_basis`) and
one added (`recognition_pattern`, recorded rather than implied): no application ACL at all, forced
RLS, an owner-only policy, the append-only trigger pair, one schedule per plan and one per source
entry, structural tenancy through composite FKs, and the evaluator version pinned on the row. §F is
the monthly admission arm, a mirror of the amortisation one.

*Evidence:* `packages/db/tests/revenue-recognition.test.mjs` — `p941.create.configures` (the row,
the plan kind and the derived cadence all agree), `p941.posts.full_year` (§F drives real postings),
and 0308's own §TAIL, which re-measures the kind set, the ACL by grantee, the RLS/policy/trigger
trio and the two uniqueness laws after the file has run. The prestate pins are listed below.

### AC2 — the evaluator, the single credited liability leg, the roster, and the revenue target

**Done.** The schedule rides #939's FROZEN `clara.prepayment_schedule_v2` with `release_side =
'debit'` — the argument #939 put there for exactly this caller. The door picks the entry's single
credited liability leg, excluding any leg stamped `special_acc_type = 'sst_output'`, and refuses
zero or many by typed reason. The account must be enrolled with purpose `deferred_revenue` (asked
BEFORE the shared wall, 0306's order) and must pass `clara._adj_line_eligibility_breach`. The
revenue account must be an active INCOME account on this client's chart and must arrive with the
accountant's written grounds.

*Evidence:* `p941.create.configures` — 1,200,007 cents over twelve months allocates to eleven
periods of 100,000 and a final 100,007, summing to the liability (a worked example from the spec,
not a re-computation of what the code computes). `p941.create.refusals` — a draft receipt, a receipt
with no liability leg, a receipt with two, an unenrolled account and an unsupported pattern are each
refused by name, the roster answers ahead of the shared wall, and enrolling the account then admits
the same receipt. `p941.target.refusals` — the revenue account must be named, must be on the chart,
must be an INCOME account, must pass the eligibility wall, and must carry its basis.

### AC3 — both term carriers, the 120-month cap, and what a correction is

**Done.** The door reads the document's own recorded service period when the receipt binds a
document and a person-stated term (0305's carrier) when it does not; `ck_rrs_term_source_carrier`
makes the pairing structural, so a row can never claim a provenance it cannot point at. The
120-month cap is the CARRIERS' own (`ck_dsp_max_periods`, 0305's `ck_pst_max_periods`, and
`clara.prepayment_schedule_v2`'s own `term_too_long`); 0308 adds no third cap, because a cap computed
a second way would be a second cap.

*Evidence:* `p941.term.document` — a receipt bound to an issued invoice rides that document's own
recorded service period, and the human door that records it does not restrict document direction.
`p941.supersede.running` — after the term is corrected, the stored allocation, the term the schedule
rode, its occurrences and its committed receipt are all byte-identical, the schedule still names the
SUPERSEDED statement, and a second schedule over the same receipt is still refused: a new schedule
from the next period is the only correction.

### AC4 — the pattern refusal, and the tax leg that never moves

**Done.** Any `p_pattern` but `straight_line` is refused `recognition_pattern_unsupported`.

*Evidence:* the pattern arm of `p941.create.refusals`; and `p941.posts.full_year`, which puts SST
output tax on the SAME receipt (72,000 cents beside a 1,200,007 advance) and drives all twelve
periods: the tax account's balance is unmoved at the end, the deferred account clears to zero and
the revenue account carries the advance. The exclusion is structural (the estate's own
`special_acc_type` stamp), not a name match, so it holds for a client whose chart numbers its tax
accounts differently.

### AC5 — the standard chart rows

**Already satisfied on this base, and deliberately not re-done.** By the owner's ruling of
2026-09-20 on #949 the four wave-4 chart rows went into ONE migration, built as the wave-4 pre-step:
`0295_wave4_chart_rows.sql` mints `my_sme_starter` version 2 (with `2030 Deferred Revenue` and
`1180 Accrued Income`) and retires version 1. 0308 CONSUMES that row by name, mints none, and its
prestate REFUSES to apply unless a published platform template carries `2030` as a liability.

*Evidence:* `p941.standard_chart` — a client born through the real doors and given the CURRENT
published platform template (ordered by version desc, as my lane rules require) carries 2030 as a
non-control liability this lane's roster admits by name, and `2150 SST Output Tax Payable` carries
the estate's own stamp that keeps it out of the candidate set.

### AC6 — the web

**Done.** A `deferred-revenue` destination beside `prepayments` (`lib/navigation/tree.ts`, one new
`AccountingItemId`, plus three href builders and a ⌘K row in `lib/command/routes.ts`), three pages,
five components and two lib modules.

*Evidence, by the sub-claim the brief makes:*

| sub-claim | cell |
|---|---|
| list with the term-source MARKER | `941.list` (`deferred-revenue-render-states.test.tsx`): exactly the human-stated row carries the marker, and the corrected-term badge paints only where `term_moved === true` — an ABSENT field paints nothing |
| …and its FILTER | `deferred-revenue.walk.list` (browser): narrowing to the document lane empties the table and narrowing back restores it, over the answer the page already holds |
| both attention arms | `941.list`: each arm renders with its own testid, and the next act is the READ's own token — a memo-only receipt is offered the statement, a document-bound one the document |
| schedule detail | `941.detail`: the facts, the stated-term evidence, a POSTED period told from a REFUSED one, and the residual marked; a failed read renders not-found rather than an empty schedule |
| a form mirroring the prepayment form | `941.form.derives_nothing`: the submit sends the door's seven arguments and nothing else — no amount, no term, no dates, no cadence, no pattern |
| an empty state that points to the roster panel | `941.form.roster_empty` (the sentence and a real link), `941.form.roster_unknown` (a FAILED read claims nothing), `941.form.roster_purpose` (the read asks for the deferred-revenue arm, not the expense side's) |
| …and a panel that can act on it | `p941.panel.rows_both`, `p941.panel.enrol_purpose`, `p941.panel.retire_purpose` (below) |
| en and zh copy | EN only, and the reason is measured, not assumed: `apps/web/i18n/request.ts` pins `const locale = "en"` and `apps/web/messages/` holds `en.json` alone, so there is no zh catalogue for these strings to land in. #940 recorded the same finding in `apps/web/README.md`. 168 keys under `DeferredRevenue` (its whole namespace, new here), six new under `PrepaymentAccounts` |
| the walk covers a full-year recognition | `deferred-revenue.walk.configure`: twelve whole calendar months with the remainder in the final one, reached through a refusal and a retry |

**One thing I widened beyond the inherited tree, and why.** The form's empty state links to the
Registers roster panel, and that panel could only enrol a PREPAYMENT: it read one arm of the roster,
offered ASSET accounts only, and called both doors with the default purpose. The pointer was live
and the destination was a dead end — a dark feature behind a link, which the owner's standing
"beta, nothing dark" ruling forbids. `65e16d94f` teaches the panel the second purpose: it reads the
whole live roster, prints each row's purpose as a word (never inferred from the account type, which
is the door's judgement), asks what the account holds BEFORE which account it is, offers what the
door's positive rule admits for that purpose, and carries the purpose into both doors — retire
included, because the roster is keyed on (client, account, purpose) and the default would close a
different enrolment from the row a person pressed. Three cells, each seen RED against the
purpose-blind panel first; #940's five cells stay green.

### AC7 — the conversation half

**Not built here, and it is not this ticket's to build.** The brief's own decision 6 puts the
conversation half on the shared cut, my prompt puts that cut at the END of wave 4
(`chatTurn_v22` / `claraWork_v6`), and work-order rule 5 forbids editing a frozen body. What the
database half owes that cut IS built and driven:

* `clara.create_revenue_recognition_schedule_for` — the OBO twin in #915's shape, `clara_runtime`
  only, the initiator in an ARGUMENT and re-checked LIVE against this firm's memberships. *Evidence:*
  `p941.obo.configures` and `p941.obo.authority`.
* `clara.read_revenue_recognition_source_for` — the machine-lane read of the RECORDED term, no
  document bytes. *Evidence:* `p941.read.recorded_term`.

The tool shapes, the question the brief asks for and the prompt stanza are the **successor contract**
below.

### AC8 — the cells the brief names

| the brief asks for | cell |
|---|---|
| a full-year receipt recognises twelve months and clears the liability to zero | `p941.posts.full_year` |
| the final-period remainder | `p941.create.configures` (eleven × 100,000 + 100,007) and `p941.posts.full_year` |
| the unenrolled refusal | `p941.create.refusals`, and `941.form.not_enrolled` on the web |
| the ambiguous-leg refusal | `p941.create.refusals` (no liability leg, and two) |
| the pattern refusal | `p941.create.refusals` |
| a term correction | `p941.supersede.running` |
| from-scratch apply | **not claimed by me** — see "Unverified" |
| the plan and prepayment batteries stay green | `prepayment-schedule.test.mjs` 18/18 and `prepayment-account-roster.test.mjs` 5/5, re-run after 0308 (counts below) |

---

## The migration, and its prestate pins

`0308_deferred_revenue_recognition.sql`. House shape: header, §0 prestate, the change in §A–§H, §G
grants, §TAIL assertions, a preintegration gate module, a rig-meta cohort and the gate-chain entry
in migration order.

**Six RECUT bodies.** Each admits exactly TWO pre-images — its measured live `sha256(prosrc)`, or a
body already carrying this file's `#941` attribution — so a redo is safe; anything else is real
drift and refuses by name.

| recut signature | pinned pre-image |
|---|---|
| `clara.enrol_prepayment_account(uuid,text,text,text,text)` | `d55dcbdebd05a7d07adc8f1e8988d8ba440fdfed99b2573c24ea7f8ff07b56a1` |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424` |
| `clara._assert_plan_schedule(text,text,text,integer,text,date,date,text)` | `1aca2dc26d5a9d0ac5ead59144561eb3292feb9df520f45982952604a9666b40` |
| `clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `0b34d44d70fa92f78f1d13dcf7866ce38aa99f7a6d2430cf329a48e4a7cd17dc` |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | `a34744199379ebf9fbdcbbd19cd68768ef228409533f19dfcf0daa0c3393ec46` |
| `clara.preview_accounting_plan(uuid,integer)` | `49416814c59f54bc43d07ee0d795b87edb40aa41c6b54e058ed12fc81a7b05c6` |

**Nine KEPT neighbours**, pinned unconditionally. **I re-measured all nine on the lane database at
the end of this session and every one still holds:**

| kept signature | pinned sha (re-measured: holds) |
|---|---|
| `clara._adj_line_eligibility_breach(uuid,jsonb)` | `727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021` |
| `clara._prepayment_account_enrolled(uuid,text,text)` | `0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db` |
| `clara.prepayment_schedule_v2(bigint,text,text,date,date)` | `9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194` |
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa` |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `c4148f6d95cd03876d6b8efe97d658e07e493e1743a075e1fe81901fd8fa61b7` |
| `clara._assert_journal_basis(jsonb)` | `2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684` |
| `clara.prepayment_schedule_v1(uuid,uuid)` | `ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2` |
| `clara._plan_amortisation_period_line(uuid,date)` | `88d712d7f9b8e4edc8ece28936a75bfd30611476842dd6f7113d36735192578c` |
| `clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)` | `cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e` |

The prestate also asserts three non-sha preconditions: `clara.prepayment_stated_terms` and
`clara.prepayment_account_enrolments` exist, the purpose CHECK already admits `deferred_revenue`
(0306 carried the column from birth), and a PUBLISHED platform chart template carries `2030` as a
LIABILITY (0295). It then counts this file's eleven functions over the live catalog and reports
FIRST APPLY or REDO by name.

**Post-0308 live shas**, measured at the end of this session, for whoever recuts these next (#1036
reroutes onto `clara.create_prepayment_schedule` / this lane's doors):

| signature | `sha256(prosrc)` |
|---|---|
| `clara.create_revenue_recognition_schedule(uuid,uuid,text,text,text,jsonb,text,text)` | `0e213c91e97f229f517adaf47649bb0e22a448f0ae6bb2e4b1f0a5fd4e1c3c33` |
| `clara.create_revenue_recognition_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text,text)` | `2344bc09dddbe5f38a324ad3ac2ef22ceb28b5940b4521b4421ae8ac73cfbe5e` |
| `clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)` | `5f71dbc2fe984a06c9c60f62bbaaefc8d34e3f0db607bfdfdcb9d409a2152b6d` |
| `clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `fc783b2d9a8ae494cdf825aa2f488a8e22ddf1a6a0a301072086fb8e729c6850` |
| `clara.read_revenue_recognition_source_for(uuid,uuid,uuid)` | `00501a388ada95f1a7db9fccf9ad1d94f04c0067083fd3c457ee9a06ecbe06ab` |
| `clara.enrol_prepayment_account(uuid,text,text,text,text)` | `dc122ca3a216b7eae3d1d4678b2921911a1045f1ea761db5f3467685c8a1f554` |
| `clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `266499b22d5e71c2095fccb570c301349810a0742129f33765e03f3060f72e7a` |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | `2cbefdbb858c98ba3690d7dde9dfe8880bfffb33bd958fc3fc5e7d13655a7c37` |
| `clara._assert_plan_schedule(text,text,text,integer,text,date,date,text)` | `ce0b24fd9d46531722ed80e83915444817731ad759a4a2c36f2147064bcd0c78` |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `c8e990986a06b132e3dad40e47225968562336b48ad6c01a4a09104784c09188` |
| `clara.preview_accounting_plan(uuid,integer)` | `70fe722cdb730ba11dfcf2feba4f4f10ad5640298f3ebfc46cc97682682c5aaa` |

**Gate module, cohort, chain.** `tests/deferred-revenue-preintegration-gate.mjs` (env
`CLARA_ALLOW_MISSING_DEFERRED_REVENUE`); `DEFERRED_REVENUE_0308_COHORT` in `tests/rig-meta.mjs`
(human reads and the write on `clara_authenticated`, the twin and the machine read on
`clara_runtime`, the cores and the trigger function ungranted), bimodal like 0307's; the `--import`
entry in `packages/db/package.json` in MIGRATION ORDER, immediately after
`prepayment-schedule-obo-preintegration-gate.mjs`. **No `CLARA_MIGRATION_REDO` was needed or used:
the file was applied once, from its first-apply branch, by the earlier session in this lane, and I
edited no line of it.**

---

## Gates, with counts

Run on lane 04's rig (`PGPORT=55744`, `clara_l04`; Playwright triple 3530 / 3531 / 3532).

| gate | command | result |
|---|---|---|
| the db lane, with the FULL gate chain | `node --test --test-concurrency=1 $GATES tests/revenue-recognition.test.mjs tests/prepayment-schedule.test.mjs tests/prepayment-account-roster.test.mjs tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **68 tests, 67 pass, 0 fail, 1 skipped** (T19, the reset-flag cell, correctly skipped — no reset flag was ever set) |
| …per file | as above, one file at a time | `revenue-recognition` **12/12**; `prepayment-schedule` **18/18**; `prepayment-account-roster` **5/5**; `operation-census` **10/10**; `rig-isolation` **23 (22 pass, 1 skip)** |
| the web files I added or touched | `node --import ./test/bootstrap.mjs --import tsx --test <file>` | `deferred-revenue-render-states.test.tsx` **6/6**; `deferred-revenue-roster-gate.test.tsx` **6/6**; `lib/deferred-revenue/schedule.test.ts` **12/12**; `registers/prepayment-accounts-panel.test.tsx` **8/8** (5 of #940's + 3 new); the six e2e census files **28/28** |
| the WHOLE web unit suite, once | `node scripts/run-tests.mjs` from `apps/web` | **5,030 tests, 5,028 pass, 0 fail, 2 skipped**, 77.8 s |
| the browser walk I added | `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3530 CLARA_E2E_NEXT_PORT=3531 CLARA_E2E_RUNTIME_PORT=3532 pnpm --filter @clara/web e2e deferred-revenue` | **3 passed** (10.1 s), on my triple |
| typecheck | `pnpm typecheck` (root) | **PASS** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` (root) | **PASS** |

No known Windows-only red was hit in any of these runs, and none was "fixed".

**The first run of the walk failed and the failure was mine, not the product's**: `getByText(/Recognise
an advance/)` matched both the `<h1>` and Next's own aria-live route announcer (strict-mode
violation). The cell now matches by ROLE, and the reason is in the file.

---

## Docs, in the same commits

* `packages/db/README.md` — a `## 0308` section: the accounting stated against MFRS 15 / MPERS §23,
  why the SST exclusion is an impossibility removed rather than a choice made, why a second relation
  rather than a `kind` column, the refusal-token table, §A's positive rule per purpose, the six recut
  and nine kept prestate pins, and the gate/cohort/chain trio.
* `apps/web/README.md` — a `## #941` section: the separate destination and why, the third persistent
  statement, the read's own next act, the five judgements and the absent controls, posted-is-not-
  admitted, the roster panel's second purpose, the walk, and the EN-only copy with its measurement.
* `apps/web/e2e/README.md` — the new spec in the residual list and all three counts moved (51 → 52
  specs, 24 → 25 residual), which `spec-discovery.test.ts` holds.
* `CONTEXT.md` — **Revenue recognition schedule** in the house term / _Avoid_ shape.
* `apps/web/lib/registers/prepayment-accounts.ts` — its header said "this build's doors admit
  `prepayment` only — the enrolment door refuses `deferred_revenue` by name until #941 states its
  account-type rule". That sentence is false as of 0308 and now states the rule instead.

---

## Successor contract — what the `chatTurn_v22` / `claraWork_v6` cut must wire

Nothing below was written into a frozen body. Every door it names EXISTS and is driven by a cell.

### 1. The chat tool `start_revenue_recognition_work`

Mirrors `start_prepayment_schedule_work` (the contract at the foot of
`packages/runtime/lib/prepayment-schedule-basis.ts`) on the revenue side.

```ts
export const START_REVENUE_RECOGNITION_WORK_TOOL = "start_revenue_recognition_work";

export const startRevenueRecognitionWorkInput = z.object({
  /** The POSTED advance. The model picks it from what the conversation already showed it; it never
   *  invents a uuid, and the door refuses one that is not this client's. */
  source_entry_id: z.string().uuid(),
  /** The INCOME account each period credits — a judgement, offered to the person and confirmed by
   *  them in the turn, never chosen by the model from a chart it read. */
  revenue_account_code: z.string().min(1).max(32),
  /** WHY that account, in the person's own words as recorded in the turn. Required: the door
   *  refuses a blank basis (`revenue_target_underivable`). */
  revenue_account_basis: z.string().min(1).max(4000),
  purpose: z.string().min(1).max(200),
}).strict();
```

* **No amount, no dates, no cadence, no pattern in the input, and that is the whole point.** The
  amount is the receipt's own credited liability leg, the term is its carrier's, the allocation and
  the cadence are the frozen evaluator's. A model-supplied date is what hard constraint 2 forbids.
* **Door call, named arguments in the database's own spelling and order:**

  ```sql
  select clara.create_revenue_recognition_schedule_for(
    p_client         => $1::uuid,
    p_author         => $2::uuid,   -- the PERSON in the conversation, never the run
    p_source_entry   => $3::uuid,
    p_revenue_account=> $4::text,
    p_revenue_basis  => $5::text,
    p_purpose        => $6::text,
    p_authority_ref  => $7::jsonb,  -- {kind:"chat_task", id: ctx.taskId}
    p_op_key         => $8::text) as r
  ```

  `p_pattern` is NOT sent: it defaults to `straight_line` and no other value is offered, so an
  argument here could only ever produce a refusal.
* **Op key:** `stableOpKey(ctx.taskId, START_REVENUE_RECOGNITION_WORK_TOOL, input)` — the same
  identity discipline `start_journal_work` uses, so a re-run turn REPLAYS the schedule it already
  created instead of answering `deferred_revenue_schedule_exists`. The two entrances share one op-key
  namespace (`clara._reserve_op` is asked before the duplicate check, as 0308 §E does).
* **Part kind on success:** `revenue_recognition_configured`, built from the door's answer
  (schedule id, plan id, term, deferred and revenue codes, total cents, period count, the twelve
  period lines, `configuration_only: true`, and `overlap_warning` when the estate raised one).
* **Refusal mapping** — the door's typed `(code, detail.reason)`, rendered by a
  `recognitionRefusalMessage(reason, detail)` over exactly these tokens (they are the fourteen
  `apps/web/lib/deferred-revenue/schedule.ts` already spells, so the two surfaces cannot drift):
  `deferred_revenue_source_unfit` (with `axis`, of which `deferred_account_not_enrolled` is the one
  whose remedy is the enrol question below), `deferred_revenue_term_underivable` (with `missing` and
  `remedy`), `revenue_target_ineligible`, `revenue_target_underivable`,
  `deferred_revenue_amount_below_period_granularity`, `deferred_revenue_schedule_exists`,
  `recognition_pattern_unsupported`, `invalid_purpose`, `authority_ref_unresolved`,
  `client_not_found`, `client_inactive`, `operation_in_flight`, and — on the read/park path —
  `revenue_recognition_schedule_not_found`, `revenue_recognition_period_line_missing`. None is a new
  CLASS of error, so `claraWork.v1.errors.ts` needs no change.
* **Prompt stanza** (the turn body, at the v22 cut):
  > When a customer has paid ahead and the receipt is already posted, you may configure the
  > recognition — never the term. State which advance, which revenue account the person chose and
  > the grounds they gave, and let the database derive the amount, the months and the dates. You
  > never supply a service period, and you never say a schedule has posted: configuring records what
  > will be recognised, and each month's own Work is what puts it on the books.

### 2. The Work-lane read `read_revenue_recognition_source`

Roster entry for the claraWork run, read-only:
`clara.read_revenue_recognition_source_for(p_firm, p_client, p_source_entry)` → the recorded term
(period, basis kind, the grounds a person wrote), the candidate liability leg and its cents, the
count of candidate legs when it is not one, and the schedule id once one stands. **No document bytes,
ever** — the byte door stays 0190's and is unreachable from here. `clara_runtime` only; driven by
`p941.read.recorded_term`.

### 3. The enrol question the brief asks for (AC7's "enrol this account?")

Opened through the run's own hook token when the door refuses with
`deferred_revenue_source_unfit` / `axis: deferred_account_not_enrolled`:

```
clara.open_work_question(
  p_work    => <this Work>,
  p_prompt  => 'This advance sits in {account}. Enrol that account as a deferred-revenue account for this client?',
  p_fields  => [{key:'account_code', kind:'text',   required:true, max:32},
                {key:'reason',       kind:'text',   required:true, max:4000}],
  p_context => {source_entry_id, deferred_account_code, total_cents, client_id},
  p_hook    => <the run's hook token>,
  p_asked_against => {basis_version: <the Work's basis digest>})
```

**The accepted answer runs the HUMAN door as the ANSWERING PERSON**, not as the run:
`clara.enrol_prepayment_account(p_client, p_account, 'deferred_revenue', p_reason, p_op_key)` is
`clara_authenticated`-only at the bookkeeper floor with no wake wrapper, and 0308 §TAIL asserts that
absence by `pg_proc` count. So the run hands the settled answer back to the human lane, which calls
the door under the answerer's own session, and the run then re-derives by calling the schedule door
again. The question renders through the existing question card and the Needs-you affordance (row
kind `work_question`, already in `apps/web/lib/firm/needs-you.ts` — this ticket adds no row kind).
An EXPIRED question settles the Work `refused` carrying `deferred_revenue_source_unfit`, which leaves
the advance visible in `clara.list_revenue_recognition_attention`'s arm B rather than in no surface
at all.

### 4. The term question is #939's, reused

The fixed two-date question (`period_start`, `period_end`, `basis`, all required) is the prepayment
lane's, because the stated-term carrier is anchored to the ENTRY and not to a side of the books. The
answer applies through `clara.record_prepayment_stated_term` (human-only, `basis_kind` structurally
`human_stated`), never through the run. The model may ask; it never answers.

---

## Follow-ups worth filing

1. **The roster panel's heading still reads "Prepayment accounts"** while the panel now administers
   both purposes. I did not rename it: the string is asserted by `p940.panel.empty` and by
   `prepayments-walk.spec.ts`, and a rename is a copy decision with a blast radius, not a bug fix.
   A one-line ticket ("name the roster panel for both purposes") would settle it.
2. **`1180 Accrued Income` is on the chart and nothing reads it yet.** 0295 minted it for this family;
   #942 is its consumer. Worth a line on #942 that the row is already there.
3. **The runtime module for this lane does not exist.** `packages/runtime/lib/` has
   `prepayment-schedule-basis.ts` and no revenue twin; the successor contract above is its
   specification. Whoever takes the v22/v6 cut should create
   `revenue-recognition-basis.ts` beside it rather than widening the prepayment module.
4. **An overlap warning has no browser cell.** `create_revenue_recognition_schedule` can answer with
   `overlap_warning` (a live sibling plan moving one of the same accounts) and the form renders a
   persistent StateBanner for it; the walk does not reach that branch, because the form navigates
   away when the warning is null and I chose the navigation path for the full-year cell.

---

## Unverified

* **The from-scratch chain.** AC8 asks for a "from-scratch apply". I did not run one: RIG.md forbids
  a second from-scratch chain on a lane cluster (migration 0154 pins the cluster-wide role count),
  and the wave's own division gives that proof to the integrator on a disposable cluster. What I DID
  measure: 0308 is applied on this database, its nine kept pins still hold, and all six recut bodies
  now carry the `#941` marker (the REDO branch of the prestate).
* **The prestate's FIRST-APPLY branch** was taken when the earlier session in this lane applied the
  file (none of its eleven functions existed then), but I did not re-prove that branch myself in a
  rolled-back transaction, and no notice from that apply survives to quote. A reviewer who wants it
  proven should take the wave-3 addendum's recipe or rely on the integrator's from-scratch run.
* **Nothing in `packages/runtime` was run**, because nothing in `packages/runtime` was touched.
* **The web half I inherited was not authored by me.** I read every line of it, fixed its twenty type
  errors (`container.textContent` on a harness stub), gave its cells the harness's own
  settle/unmount discipline, corrected the `en.json` indentation its hunk introduced, registered its
  test file in `test/manifest.txt` (the lint gate was failing) and then added the cells its form,
  its pure half and the roster panel had none of. I did not re-derive its components from scratch,
  so a reviewer reading `deferred-revenue-form.tsx` or `deferred-revenue-detail.tsx` is reading code
  whose cells I wrote after the fact — with the vacuity control in `6bec1e822` and `3e68d8ace` as
  the evidence that those cells bite.
