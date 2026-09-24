# Wave 4 · lane 01 · ticket #946 — Payroll summaries: draft and post the run unattended

**Status: DONE.** Worktree `C:\Users\zhant\Desktop\clara-wt\635`, branch `riders/w4-lane01`,
database `127.0.0.1:55741/clara_l01`. Base `cd2925391`.

```
git status (at start)                          →  clean
git log --oneline cd2925391..HEAD (at start)   →  11 commits, all #945 (#944 stopped without one)
git status (at end)                            →  clean
```

Eight commits, all naming #946:

```
4c1f12261 feat(db): #946 the payroll drafting body turns an established fact state into the entry
fe5407e9b feat(db): #946 the drafting body says what the page was silent about, once per question
dca7d6e35 feat(db): #946 the payroll lane gets its own unattended gate, the invoice lane's shape
20ad509b8 feat(db): #946 the payroll lane posts what it reads, unattended, in the same transaction
154c235c2 feat(db): #946 the duplicate guard sees both payroll lanes, and points at the entry
ba981dde0 feat(web): #946 a blocked payroll run reaches Needs you, naming the condition that failed
b4461f4c9 docs: #946 the payroll posting lane in the data-plane README and CONTEXT
e91e35d11 fix(db): #946 the splice is reconstructible, and the tail asserts without patching
```

## The ticket is the contract

`gh issue view 946 --comments`, re-read live on this branch 2026-09-24. The BODY is the only
Agent Brief. Its single comment (belcorttao, 2026-09-19T16:22:02Z) is an AI triage coordination
note, not an owner ruling, and nothing on this ticket is dated 2026-09-20 — so the body stands
and the comment's three instructions were followed as guidance. All three are discharged and each
is named where it lands:

1. *"the duplicate guard must also see obligations already posted through that existing lane"* —
   the `payroll_obligation` scope of the guard (§D rung 10), driven by its own cell.
2. *"AC1 is already the whole chart-template scope… resolve those by code; do not append them
   again"* — the ten `0150` accounts are resolved by code and nothing appends them.
3. *"merge the chart migration… use one migration for both appends"* — already carried out, by
   `0295_wave4_chart_rows.sql`, which is not this file (see AC1 below).

**Verified live, not already satisfied.** Before building, on this branch and this database:
`clara._payroll_entry_plan`, `clara._payroll_posting_verdict`, `clara._post_payroll_run` and
`clara._payroll_period_month` did not exist; `clara.persist_payroll_facts` settled the read and
returned without posting anything; `clara.list_review_queue` projected TEN row kinds and no
payroll one; `apps/web/lib/firm/needs-you.ts`'s `REVIEW_QUEUE_ROW_KINDS` carried eleven entries
ending at `depreciation_authority_pending`; and `clara.entry_post_receipts.via_wake_kind` admitted
`{autodraft, interactive, bank_agent}` only. The FIRST cell written (S2's ready verdict) failed
with `function clara._payroll_posting_verdict(unknown) does not exist`, which is the clearest
possible evidence the lane was absent.

**AC1 was already satisfied, by a file that is not mine.** WAVE-4 LANE RULE (a) says so and the
database agrees: `0295_wave4_chart_rows.sql` minted `2040 Salaries Payable` as `my_sme_starter`
version 2 (liability, `account_class` NULL, no statutory tag, `sort_ordinal` 50 inside
`trade_payables`), quoting #946's own AC1 and body as its reason. **0297 appends no chart row at
all**, its prestate refuses to apply if the row is absent, and its tail re-derives that the
published chart still carries exactly ONE row at code `2040`.

## The seams I tested at (written before the first test, WORK-ORDER rule 4)

| | Seam | Where |
|---|---|---|
| S0 | `clara.coa_template_accounts` at the current published platform `my_sme_starter` — AC1's row | `packages/db/tests/payroll-summary-posting.test.mjs` |
| S1 | `clara._payroll_entry_plan(uuid, jsonb)` — THE DRAFTING BODY (AC2) | same |
| S2 | `clara._payroll_posting_verdict(uuid)` — THE UNATTENDED GATE (AC3, AC4, AC5) | same |
| S3 | `clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)` — the lane end to end, the door the payroll worker already settles through (AC3, AC5) | same |
| S4 | `clara.list_review_queue(jsonb,jsonb,integer)` — Needs you (AC3) | same |
| S5 | the same read's existing `uncoded_filing` row (AC6) | same |
| W | `REVIEW_QUEUE_ROW_KINDS` / `isKnownReviewQueueRowKind`, `needsYouRowHref` / `hasOwningTab`, `getNeedsYouAffordance` — the web side's own closed registries | `apps/web/lib/firm/needs-you-payroll-posting.test.ts` |

No cell sits anywhere else. Every slice was one test → red for the right reason → the minimal code
→ green → commit; the migration was re-applied per slice through `CLARA_MIGRATION_REDO` (#957),
recorded below. Two slices were genuinely driven by a failing cell that the code did not
anticipate: the `unprinted` roster (a per-leg list repeated the levy and lost the employer half of
a pair) and the whole duplicate rung.

## Acceptance criteria, each with its evidence

### AC1 — a salaries-payable account on the standard chart, as an ordinary liability with no class; existing clients untouched; the chart door unchanged

**ALREADY SATISFIED on this base** (`0295_wave4_chart_rows.sql`, the wave-4 pre-step). Evidence
rather than a build:

- Cell `S0 · the standard chart carries a salaries-payable account as an ordinary liability with
  no class` reads the CURRENT published platform template by state and version (never a pinned
  id) and asserts exactly one row at `2040`, `name='Salaries Payable'`,
  `account_type='liability'`, `account_class IS NULL`, `special_acc_type IS NULL`,
  `statutory IS NULL`. **Green.**
- 0297's prestate (§A clause 5) refuses to apply if that row is absent or differently shaped; its
  tail (§Z clause 5) re-derives the count after every statement in the file has run.
- *Existing clients are not touched*: 0297 writes nothing to `clara.coa_accounts` at all (it only
  SELECTs from it, in `_payroll_entry_plan`), and *the door that maintains a client's chart is
  unchanged*: `clara.upsert_account` is neither recut nor referenced by this file. The battery's
  own fixture uses that door unchanged to build a payroll-capable chart.
- **Template count cells**: 0295 owns them. This file adds no template row, so there is no count
  for it to move — asserted structurally in both the prestate and the tail rather than by a
  number.

### AC2 — a drafting body turns an established fact state into the entry, each leg carrying its account and its basis; employee portions never debited; an unprinted line contributes no leg

**DONE.** `clara._payroll_entry_plan(p_client uuid, p_state jsonb) returns jsonb` — STABLE,
ungranted, owned by `clara_fn_owner`, `search_path` pinned. It takes the STATE rather than a
document deliberately: the state is 0296's own output, so the arithmetic can be driven and proved
without a document, a filing or a task in the way.

The entry, worked by hand in the test file from #945's own two-employee example (never
re-computed from what the code computes):

```
Dr 6000 Salaries and Wages           500000   basis payroll.run.gross_pay
Dr 6010 EPF Contribution (Employer)   65000   basis payroll.run.epf_employer
Dr 6020 SOCSO Contribution (Employer)  5165   basis payroll.run.socso_employer
Dr 6030 EIS Contribution (Employer)     980   basis payroll.run.eis_employer
Dr 6040 HRDF Levy Expense              5000   basis payroll.run.hrdf_levy      = 576145
Cr 2100 EPF Payable                  120000   basis payroll.run.epf_employee+payroll.run.epf_employer
Cr 2110 SOCSO Payable                  7615   basis …socso_employee+…socso_employer
Cr 2120 EIS Payable                    1960   basis …eis_employee+…eis_employer
Cr 2130 PCB Payable                   16000   basis payroll.run.pcb
Cr 2140 HRDF Levy Payable              5000   basis payroll.run.hrdf_levy
Cr 2040 Salaries Payable             425570   basis payroll.run.net_pay        = 576145
```

| Cell | Result |
|---|---|
| a clean state becomes the eleven-leg entry | all eleven legs in the brief's own order with their bases; `debit_cents = credit_cents = 576145`; `posting_date = 2026-08-31`; every leg carries the NAME it resolved to in this client's chart |
| an unprinted line produces no leg | no `6040`, no `2140`, nine legs, `unprinted = ['payroll.run.hrdf_levy']`, 571145 both sides; and a printed `0.00` books no leg either |
| the employee portions | no debit leg carries 55000 / 2450 / 16000, and no debit leg's `basis` names an employee-side question at all; `2100 = 120000` (ee+er), `2130 = 16000` (employee only), `2040 = 425570`, and `gross − (55000+2450+980+16000) = 425570` read off the plan |
| a missing account | `ready=false`, `missing_accounts=['2040']`, a NAMED `account_missing` refusal carrying the code, NO net leg re-pointed at another liability, and **not** reported as an imbalance |
| the month | nine admitted renderings (`2026-08`, `2026/08`, `08/2026`, `8-2026`, `2026-08-15`, `August 2026`, `Aug 2026`, `AUGUST, 2026`, `2026 August`) all land on 2026-08-31; six refused (`08/09/2026`, `2026`, `August`, `Q3 2026`, `Aug-Sep 2026`, `Augustus 2026`) with `period_not_established` quoting the rendering back |
| a page with no totals row | `run_totals_not_printed` naming both gross and net, and `legs = []` |

**The employee-portion treatment is asserted arithmetically, not by inspection**: the plan
balances ONLY because gross − (epf_ee + socso_ee + eis_ee + pcb) = net. An implementation that
expensed them twice could not balance, and the mutant run below proves the cell sees it.

**One deliberate narrowing, recorded as such.** The plan drafts from `established` facts ALONE and
does NOT reach for `computed_cents` — the row sum 0296's evaluator offers when a page prints
employee rows but no totals row. The evaluator's own verdict for such a run is `not_printed`, and
a posting body that re-judged that verdict from outside its frozen closure would be doing exactly
what the freeze exists to prevent. Such a run does not post and appears under Needs you naming
`run_totals_not_printed`. **Whether the owner wants a row sum admitted as a posting basis is a
product question this ticket does not answer for them — see Follow-ups.**

### AC3 — the unattended gate, each failure a named typed refusal that carries to Needs you

**DONE.** `clara._payroll_posting_verdict(uuid)` — STABLE, ungranted. A CLOSED roster of ten
rungs, walked in order, EVERY rung carrying an explicit verdict (`pass`, its own token, or
`not_evaluated`), the FIRST failure being the reason:

`filed` · `facts_read` · `channels_agree` · `arithmetic_holds` · `period_established` ·
`period_open` · `run_totals_printed` · `accounts_resolve` · `entry_balances` ·
`no_duplicate_entry`

Three properties are copied from the invoice lane's `clara._agent_post_entry_core` and named as
such in the migration header: the closed roster with no missing keys (its own D26 lesson — a
missing key is how a gate fails open), the first-failure refusal that COMMITS so the reason is
durable and writes no receipt, and exactly one `clara.entry_post_receipts` row on a successful
post. What is NOT reused is that core's rungs: B2/B3 bind on `clara._invoice_fact_state`
corroboration anchored to `invoice.total` (a payroll pair banks its state under
`payroll_text_facts` and has no such region), and B1/B14/B15 reason about coding kinds, AR/AP
control legs and counterparty identity, none of which a payroll run has. Routing a payroll pair
through it would be a gate that always answers "no" for reasons unrelated to payroll.

Driven through REAL filed documents, routed by the real router, claimed as real tasks and settled
through the real persist door:

| Cell | Result |
|---|---|
| the verdict is DERIVED | a client whose chart lacks `2040` reads a payslip → blocked at `accounts_resolve`, nothing posted; a person adds the account through the ordinary chart door; the SAME document now reads `ready`, with all ten rungs `pass`, no re-extraction and nothing to clean up |
| channels disagree | `rung=channels_agree`, `reason=channels_disagree`, `detail.fields=['payroll.run.pcb']` |
| a row that does not balance | `rung=arithmetic_holds`, `detail.unbalanced_rows=[2]`, and NO entry exists for the document |
| a printed total the rows contradict | `rung=arithmetic_holds`, `detail.fields=['payroll.run.gross_pay']` |
| a month that cannot be established | `rung=period_established`, `posting_date=null`, no entry |
| a chart that resolves nothing | `rung=accounts_resolve`, `detail.missing_accounts` includes `6000` and `2040` |
| an unread document | `rung=facts_read`, `reason=payroll_not_read`, with `filed='pass'` — unfiled and unread are different answers |
| a closed fiscal year | `rung=period_open`, `reason=period_closed`, `detail.closed_fiscal_year.status='closed'`, no entry |

*…and it carries to Needs you*: `clara.list_review_queue` gains `row_kind='payroll_posting_blocked'`
(section `needs_you`, lane `needs_you`), DERIVED from the same verdict body and rendering that
body's own sentence, so the words on screen and the decision the lane took cannot drift. Cells:
a blocked run appears exactly once naming the condition down to the account code; a different
condition on a fully-charted client names that one instead; the row clears itself when the filing
is retired, with no dismissal act; and a run that POSTED leaves no blocked row behind.

### AC4 — the duplicate guard points at the existing entry; a second upload of the same month never posts

**DONE.** Four scopes, first match reported, each read off the ledger itself:

| Scope | What it catches |
|---|---|
| `same_document` | this document already backs a posted entry — the estate's own `clara._document_posting_entry`, asked in the gate so the answer is a NAMED refusal rather than the source-binding wall's CLR13 raise at the write |
| `same_filing` | a live draft or approved entry is already on this filing |
| `same_month_payroll_run` | another document's payroll run already covers the month, read off this lane's own `flags->'payroll_run'->>'period_month'` marker |
| `payroll_obligation` | the month was already booked through `0194_periodic_adjustments.sql`'s lane, whose `flags->'payroll_obligation'` marker carries the period it covers (0225:1830) |

Cells: a second upload of the same month does not post, leaves no entry, and the verdict's
`existing_entry_id` IS the posted entry's id with `detail.duplicate.scope='same_month_payroll_run'`,
its `posting_date` and its `memo` — while every earlier rung still reads `pass`, so the reason is
the duplicate and nothing else. A DIFFERENT month on the same client posts normally. And a
September obligation booked through 0194's lane blocks a September payslip with
`scope='payroll_obligation'`, pointing at that lane's own entry.

A reversed entry is not a duplicate: `reversed_by is null` throughout, so a reversal re-opens the
month.

### AC5 — the entry's date is the last day of the payslip's own month; an August payslip uploaded in September posts in August; an unestablishable month asks

**DONE.** The posting date is `date_trunc('month', <the page's month>) + 1 month - 1 day`, taken
from the rendering the page printed and never from the upload or from today. The clean-post cell
posts on **2026-08-31** — and the rig's clock is 2026-09-24, so "an August payslip uploaded in
September posts in August" is exactly the cell that ran, not an analogue of it. A month that
cannot be established produces `period_not_established`, `posting_date=null`, no entry, and the
Needs-you row's own sentence asks for the month.

*"Asks" is the derived Needs-you row, not a minted `open_question`* — a reading recorded here so a
reviewer can disagree with it explicitly. The brief says failures "appear under Needs you naming
the condition that failed" and AC6 forbids a new dismissal mechanism; an `open_questions` row
would have a lifecycle and a dismissal door, and would survive the fact that produced it. The
derived row clears itself. See Follow-ups if the owner wants a first-class question instead.

### AC6 — the filed payroll summary stops appearing as uncoded once its entry exists, through the existing derived queue and with no new dismissal mechanism

**DONE, and it cost no mechanism at all.** The posted entry is a DOCUMENT entry bound to the
filing (`origin='document'`, `document_id`, `source_doc_sha256`, `filing_id`), and
`clara.list_review_queue`'s `filing_rows` CTE ALREADY excludes a filing carrying a live draft or
approved entry. The cell drives it end to end through the real queue read: BEFORE, a filed unread
payroll summary is one `uncoded_filing` row; the read posts; AFTER, that row is gone — and it is
not replaced by a blocked row either. Nothing was dismissed, nothing stored, and `filing_rows` is
byte-untouched by this file.

The prestate additionally refuses to apply if `payroll_summary` ever stops being a codeable kind,
because AC6 would then be vacuous rather than satisfied.

### AC7 — the cells

All seven named cells exist and are green: a clean payslip posts all legs and balances (S3); one
with an employer HRDF levy (the clean case prints 50.00, and its absence is its own cell); one
missing an account (S1 and S2 both); one whose arithmetic failed never posts (S2, two shapes —
a row that does not balance and a printed total the rows contradict); the employee-portion
treatment (S1, on both the figures and the bases); the posting and queue batteries stay green
(gates below). **From-scratch apply** is the one I could not run as such and do not claim: this
lane's database is migrated, not disposable, and the work order forbids a second from-scratch
chain on a lane cluster. What I ran in its place is the FIRST-APPLY PRESTATE PROOF the wave-3
addendum asks for by name, below.

## The migration

`packages/db/migrations/0297_payroll_summary_posting.sql`, applied checksum
`25ba80f517b201290fd0f3676bdffdc5c60a0def4a068511e9b2fc4f06bf28af`. Ledger after:
**291 files, frontier `0297_payroll_summary_posting`.**

Structure: header (the spec of record, AC1 already satisfied, the accounting checked against the
standard, the two owner decisions, why the database posts this and not an agent, the deploy order,
the write-quiesce window) · §A prestate · §B the month parser · §C the drafting body · §D the gate
· §E the receipt-lane widening · §F the poster · §G the persist recut · §H the queue splice ·
§Z tail.

### Prestate pins — MEASURED on this lane database, every one listed (wave-3 addendum)

**Recut / spliced, BIMODAL** (its pre-image sha, OR a body already carrying this file's own
marker — a redo can only ever take the second branch; the first is proven separately below):

| Signature | PRE-image sha (the pin) | POST-image sha (what a later lane will meet) |
|---|---|---|
| `clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)` | `85a708a386743ccdf0e3f6763de4a9fe14f793ffdca0e275c637c0cb23d6d83e` | `63633a3f06edcb6effebb7b2ca9a8a82c805bb2ca33537e49a1660b66c22f7aa` |
| `clara.list_review_queue(jsonb,jsonb,integer)` | `f4a34c72e567bf825d4376d043ea23cc3d8bcd2d4f0caaee3a5d052bf8a25d69` | `a315367fbd897e9422a6d809ae00c5d446a2c387cedcba4b73268c68ad44565e` |

**Pinned but NOT recut** (the neighbours this file leans on and must not move — a later lane that
recuts one collides here rather than silently changing what this lane posts):

| Signature | sha |
|---|---|
| `clara.evaluate_payroll_run_state_v1(jsonb,jsonb)` | `0b11727c230ff03ec94b758a95e7a2035c5af09d323a6f6da284cdd9d91fc8cd` |
| `clara._document_posting_entry(uuid,uuid)` | `8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0` |
| `clara._validate_entry_lines(uuid,jsonb)` | `37b03159a535770d6d7053aa826270703fcafa86f3864e9e344fe5bb886d3c71` |
| `clara._is_codeable_kind(text)` | `0c0780e3dc7d52affc84f2ded39b28fe8a1af7f5024a6ac813fa932210d40b28` |

**Non-sha prestate claims:** `clara.entry_post_receipts_via_wake_kind_check` is at its pre-image
definition text `CHECK ((via_wake_kind = ANY (ARRAY['autodraft'::text, 'interactive'::text,
'bank_agent'::text])))` or already widened by this file; `t_je_agent_post_receipt` is live;
`2040 Salaries Payable` is on the published `my_sme_starter` chart as an ordinary liability with
no class; `payroll_summary` is a codeable kind.

**New bodies this file mints** (a later lane that recuts one will collide with these):
`clara._payroll_period_month(text)` = `401f76cba102a8eea0be6e9852401bb2f1e469de7298387f857c1a4a1f39b7c1` ·
`clara._payroll_entry_plan(uuid,jsonb)` = `9889780c7abcf79d6c939b79706c521113e7aa6b77b138cee6af1457e4889d83` ·
`clara._payroll_posting_verdict(uuid)` = `23c644b7b4ad11cee43c1e02acb2599733cb1000a808d108a5519d4b3a0a4df0` ·
`clara._post_payroll_run(uuid)` = `482d3cebb2c80629b9785ee6fef76dd2b8dd3121a7268d6c31dbfa95e4afb05b`.

### The FIRST-APPLY prestate proof (wave-3 addendum) — RUN, and it PASSES

`CLARA_MIGRATION_REDO` only ever takes the "my own marker is already live" branch of a bimodal
pin, so the other branch was proven separately. A probe (written to
`packages/db/node_modules/.firstapply946.mjs`, outside the tracked tree, because it is a one-off
proof and not a gate) opens ONE transaction and, inside it:

1. reads the live `clara.persist_payroll_facts` and reverse-applies THIS FILE'S OWN two
   substitutions (extracted from the migration by its own `$p946a$`…`$p946d$` tags, never
   re-typed), re-installs the result and asserts its sha equals the pinned pre-image;
2. does the same for `clara.list_review_queue`, reversing the `payroll_rows` CTE + union arm back
   to the pinned anchor;
3. moves this lane's own `payroll_facts` receipts aside under `session_replication_role = replica`
   and re-adds the pre-image `via_wake_kind` CHECK **VALID**, so its definition text is exactly
   what a genuine first apply meets (the prestate compares that text);
4. runs §A, §G and §H **verbatim**, extracted from the migration file by their own dollar tags;
5. asserts both bodies moved (the splices really applied to the restored pre-images) and rolls
   back.

Transcript:

```
restored clara.persist_payroll_facts to its pinned 0296 pre-image
restored clara.list_review_queue to its pinned pre-image
restored the receipt lane CHECK to its pre-image
  notice: #946 prestate: OK -- 0296's evaluator is at its pinned sha, persist_payroll_facts and
          list_review_queue are each at a pinned pre-image …
  notice: #946 §G: clara.persist_payroll_facts spliced -- the payroll lane now posts what it
          reads. owner (clara_fn_owner) and ACL byte-unchanged. prosrc sha256: 85a708a3… -> …
  notice: #946 §H: clara.list_review_queue spliced -- one payroll_rows CTE … and one union arm;
          owner (clara_fn_owner) and ACL byte-unchanged …
FIRST-APPLY PRESTATE PROOF: PASS (rolled back)
```

### Redo (#957) — used, and recorded

`CLARA_MIGRATION_REDO=0297_payroll_summary_posting` was used **eight times** during the
slice-by-slice build (after the `unprinted` fix, §D, §E+§F+§G, the duplicate rung, §Z, the tail's
ACL check, the tail's `prosrc` switch, the reconstructible-splice fix, and once more to restore
the subject after the vacuity mutant), each time with `CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`
against `127.0.0.1:55741/clara_l01`. The file is written to be safe over its own old effects:
every body is `create or replace`, the constraint swap is `drop constraint if exists` then `add`,
and **both splices detect their own marker in the INSTALLED body and no-op with a notice**, with
their postchecks re-reading the COMMITTED catalog in BOTH branches so a redo proves them too.

### No new granted object, so no rig-meta cohort

0260's posture and its recorded reason, restated in §Z's own comment. All four new bodies are
INTERNALS reached from bodies that are already granted: `clara.persist_payroll_facts`
(`clara_runtime`, 0296) calls the poster, and `clara.list_review_queue` (`clara_authenticated`,
viewer-floored) calls the verdict. rig-meta's cohorts audit GRANT correctness on newly introduced
CALLABLE objects and there is none here; the sweep's `expected = false` over these four names IS
the assertion, and §Z's own per-role check is the second belt. **#946 adds no human door at all**
— the decision is machine-made and the only surface is the Needs-you row a person reads.

## Gates, with counts

| Gate | Command | Result |
|---|---|---|
| the new db battery, full gate chain | `node --test --test-concurrency=1 $GATES tests/payroll-summary-posting.test.mjs` (108 gate modules) | **23 pass, 0 fail, 0 skip** |
| the payroll pair + the census pair (SQL functions added; never with reset flags) | same runner, `payroll-summary-posting` + `payroll-summary-facts` + `operation-census` + `rig-isolation` | **74 tests, 73 pass, 0 fail, 1 skip** (the skip is `rig-isolation`'s own pre-existing one) |
| every db battery that reads the queue or the persist door | `payroll-summary-posting`, `payroll-summary-facts`, `ninth-rowkind-seeding-proposal`, `work-question-reads`, `depreciation-authority-pending-rowkind`, `a21-read-surfaces`, `client-work-pack`, `dba-close-gate-codeability`, `operation-census`, `rig-isolation` | **134 tests, 133 pass, 0 fail, 1 skip** |
| every db battery that touches `entry_post_receipts` | `f-a2-excision`, `f-a2-ladder`, `f-a2-ladder-3`, `f-a2-ladder-4`, `f-a2-posted-chain`, `f-a2-receipt`, `f-a2-receipt-2`, `f-a2-tier-d`, `f-a3-pr1b-agent-limb`, `f-a3-pr1b-wake-verbs`, `f-a3-pr3-doors`, `work-journal-post` | **205 tests, 203 pass, 0 fail, 2 skip** (both pre-existing) |
| the witness/router neighbours | `f-a2-regression`, `f-a2-witness-readers`, `f-a1-walls`, `a21-classifier-gate`, `x-receipt-routing` | **73 tests, 72 pass, 0 fail, 1 skip** |
| typecheck | `pnpm typecheck` | **Done** (both projects) |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| the WHOLE web unit suite | `node scripts/run-tests.mjs` from `apps/web` | **4993 tests, 4991 pass, 0 fail, 2 skip** |
| browser walk (the Needs-you inbox) | `… e2e home-board-walk` on 3500/3501/3502 | **28 passed** |
| browser walk (firm navigation) | `… e2e firm-navigation-walk` on 3500/3501/3502 | **11 passed** |
| frozen workflows | `FREEZE_BASE_REF=cd2925391 node scripts/check-frozen-workflows.mjs` | **OK — 317 files, append-only, no manifest diff** |
| frozen evaluators | `FREEZE_BASE_REF=cd2925391 node scripts/check-frozen-evaluators.mjs` | **OK — 10 evaluators, append-only** |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| wiki dynamic SQL | `node scripts/check-wiki-dynamic-sql.mjs` | **OK — 1459 definitions, 233 CoR patches, no new waiver** |
| first-apply prestate proof | `node packages/db/node_modules/.firstapply946.mjs` | **PASS (rolled back)** |

### The vacuity control — run, and it bites

Several S1 cells were written after the drafting body existed (the plan is ONE seam and splitting
it into five micro-slices would have been artificial), so they were green on arrival. They were
driven against a deliberately broken subject to prove they are not vacuous: a mutant
`clara._payroll_entry_plan` that (a) books a ZERO leg for an unprinted or zero line instead of
none and (b) ALSO debits the employee EPF to expense.

```
MUTANT INSTALLED → 23 tests, 13 pass, 10 FAIL
  not ok  S1 · a clean payroll fact state becomes the eleven-leg entry, and it balances
  not ok  S1 · a line the document does not print produces no leg — never a zero one
  not ok  S1 · the employee portions reduce the net-pay credit and are never debited to expense
  not ok  S1 · a run whose totals the page does not print has nothing to post, and says so
  not ok  S2 · the verdict is DERIVED …          not ok  S3 · a payroll summary … posts itself
  not ok  S2 · a second upload of the same month …  not ok  S2 · an obligation already booked …
  not ok  S4 · a payroll run that POSTED leaves no blocked row behind
  not ok  S5 · the filed payroll summary stops appearing as uncoded once its entry exists
RESTORED (CLARA_MIGRATION_REDO, checksum back to 25ba80f5…) → 23 tests, 23 pass, 0 fail
```

### Two census gates found real defects in the first cut, and both were fixed in the subject

Recorded rather than hidden, because each is a trap the next lane will meet:

1. **`apps/web/test/sqlFunctionCensus.ts` cannot evaluate `chr()`.** It proves what a migration
   dynamically installs by RECONSTRUCTING the statement from its parts. The persist splice built
   its replacements as `||` chains with `chr(10)`, so the whole `execute` was unresolved and the
   census failed closed — reddening `do-action-floors.test.ts` and three neighbours. Every anchor
   and replacement is now ONE dollar-quoted literal.
2. **The wiki dynamic-SQL lint reads any `do` block that combines a definition-wrapper read with
   the word `EXECUTE` as a change-of-record patch.** The TAIL carries `EXECUTE` as a PRIVILEGE
   NAME (`has_function_privilege(…, 'EXECUTE')`), so an assertion-only block was classified as a
   patch with two unwaivable targets. The tail now reads `prosrc`, which is what its assertions
   actually need.
3. `apps/web/tests/firm-scope-db-pins.corpus.ts` gains its reviewed dynamic-SQL barrier entry for
   0297, keyed by the file's own sha256 (the 0146/0260/0288/0289/0291 family), naming the two
   functions the splices recut and why neither P4 scope view can be a target.

## Neighbouring files that moved, and why

| File | What moved |
|---|---|
| `apps/web/lib/firm/needs-you.ts` | `REVIEW_QUEUE_ROW_KINDS` gains `payroll_posting_blocked` at the END of the list, with its own grounding note appended to the header's numbered history (additive; no reformatting, no renaming — WAVE-4 LANE RULE (b)). The "LIVE row_kind set" sentence and the `counts` note are extended in place. |
| `apps/web/lib/firm/needs-you-links.ts` | `OWNING_TAB` gains `payroll_posting_blocked: "/documents"` — the row is about a page that was read and did not post, and there is no entry yet, which IS the row. No `?tab=`: the documents tab has no view that selects one document from the URL. |
| `apps/web/components/firm/needs-you-affordances.tsx` | `payroll_posting_blocked: null` — the closed `Record<ReviewQueueRowKind, …>` would otherwise fail `pnpm typecheck`. No inline act by design: every condition is cleared somewhere else and the lane has no "post it anyway" door. |
| `apps/web/messages/en.json` | `NeedsYou.rowKind.payroll_posting_blocked` and `NeedsYou.openTab.payroll_posting_blocked`, at their sorted positions. |
| `apps/web/test/manifest.txt` | one line for the new web test file, at its sorted position. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | the reviewed dynamic-SQL barrier entry (above). |
| `packages/db/package.json` | the gate-chain entry `--import ./tests/payroll-summary-posting-preintegration-gate.mjs`, in migration order immediately after #945's. |

**Both `FULL_ROW_KEYS` rosters are byte-unchanged and were run green** — the new kind mints no
`counts.*` key and no new json key, so `ninth-rowkind-seeding-proposal.test.mjs` and
`work-question-reads.test.mjs` needed no edit. Their 21 cells pass.

## Docs, in the same commits

- `packages/db/README.md` — a `## #946` section in the house shape: why AC1 was already satisfied,
  the entry, why the database posts this and not an agent, the four bodies in a table, the
  duplicate guard's four scopes, why the marker has exactly one writable moment, the Needs-you
  row, why AC6 costs no mechanism, the one widened constraint, the no-cohort posture and the redo
  posture, and the cell census.
- `CONTEXT.md` — **Payroll posting gate**, in the house `term` / `_Avoid_` shape, beside #945's
  **Payroll run fact state**.
- `apps/web/lib/firm/needs-you.ts` — the row-kind history note (above), which is that file's own
  documentation of the queue.

## Successor contract

**#946 needs nothing from a frozen chat or Work tool to work, and edits none.** The lane is
machine-driven end to end: the router mints the task, the reconciler dispatches it, the frozen
`payrollFacts_v1` workflow reads, and `clara.persist_payroll_facts` — the door that worker already
settles through — posts inside the same transaction. No new task lane, no new workflow family, no
new runtime call. `FREEZE_BASE_REF=cd2925391 node scripts/check-frozen-workflows.mjs` shows no
manifest diff from this ticket.

What a frozen tool WILL need is a way to tell a person, in conversation, why a payroll run did not
post and what would clear it. Delivered here as a contract for the `chatTurn_v22` / `claraWork_v6`
cut, **not built**. It composes with #945's `read_payroll_fact_state` contract rather than
replacing it: that one reports what the page SAID, this one reports what the estate DID about it.

**Tool name:** `read_payroll_posting_state`

**Zod input** (`.strict()` throughout, the `trade-invoice-basis.ts` discipline):

```ts
export const readPayrollPostingStateInputSchema = z.object({
  client_id: z.string().uuid().describe("the client whose payroll summary this is"),
  document_id: z.string().uuid().describe("the payroll summary to report the posting state of"),
}).strict();
```

**Door call, with argument order.** No new door is needed for the READ side; the posted entry and
the blocked state are both reachable through reads this estate already publishes.

```ts
// clara.list_review_queue(p_scope jsonb, p_cursor jsonb, p_limit int) — argument order as written.
const queue = await callDoor("clara.list_review_queue", [{ client_id: input.client_id }, null, 200]);
const blocked = queue.rows.find(
  (r) => r.row_kind === "payroll_posting_blocked" && r.document_id === input.document_id,
);
// blocked?.question_text is the DATABASE'S OWN sentence. Report it; never reword it.
// blocked?.entry_id is non-null only for a DUPLICATE refusal — the entry to point the person at.

// When there is no blocked row, the run either posted or was never read:
// clara.get_document_state(p_document uuid) — argument order as written.
const state = await callDoor("clara.get_document_state", [input.document_id]);
```

If a future reviewer prefers a first-class read over a queue scan, the door to mint is
`clara.get_payroll_posting_state(p_document uuid) returns jsonb`, `clara_authenticated`-only,
floored at viewer, returning `clara._payroll_posting_verdict`'s own object minus the `plan.legs`
(which carry account codes a viewer may not be entitled to see). That is a NEW migration's
business, not a successor contract's, and the queue scan works today.

**Refusal mapping** (the estate's typed codes → what the tool says):

| SQLSTATE / shape | Tool refusal | What the person is told |
|---|---|---|
| `CLR03` | `not_permitted` | "You are not a member of the firm that holds this document." |
| `CLR10` (`queue scope is malformed`) | `client_not_found` | "I cannot find that client under your firm." |
| no `payroll_posting_blocked` row AND an approved entry on the filing | NOT a refusal | Report the entry: its date, its memo and its total. The run posted. |
| no `payroll_posting_blocked` row AND no entry | `payroll_not_read` | "That payroll summary has not been read yet." Name the task's own status from `clara.get_document_state` rather than guessing. |
| a `payroll_posting_blocked` row | NOT a refusal | Report `question_text` VERBATIM, and for a duplicate also name `entry_id`. Never invent a remedy the sentence does not name. |

**Part kind:** `freeform_result` — already declared and already emittable
(`chatTurn.v16.prompt.ts:187`), so this contract adds NO part kind and
`check-parts-parity.mjs` needs no new entry. Reporting a posting state is a READING, not an
admitted Work: it mints no `work_accepted` and asks no `work_question`.

**Prompt stanza** (for the successor chat body, verbatim):

```
WHY A PAYROLL RUN DID NOT POST. A payroll summary that has been read posts itself when every
condition holds: both readings of the page agree, every arithmetic check passes, the payslip's own
month is established, that month's fiscal year is open, every account resolves in this client's own
chart, and no payroll entry for that client and month is already posted. When one fails, nothing is
posted and a row appears under Needs you. Call read_payroll_posting_state and report the sentence it
returns VERBATIM — it is the database's own words for the condition that failed, and rewording it
would put a reason on screen that nobody decided. You never offer to post it anyway: there is no
such door, by design, because nothing in this lane is posted on a guess. If the block is a
DUPLICATE, name the entry it points at and say plainly that the person decides whether this payslip
is a correction or a re-upload — you do not decide that. If the block is a missing account, name the
account code and say that adding it to the client's chart and re-filing the payslip is what clears
it. If the month could not be established, say what the page printed and ask which month the run
covers; never assume one from the upload date.
```

## Follow-ups worth filing

1. **Should a row sum be admitted as a posting basis?** A payslip that prints per-employee rows but
   no totals row leaves 0296's evaluator with `computed_cents` (a real, checked column sum) and a
   verdict of `not_printed`. This lane does not post from it, for the recorded reason (the
   evaluator's verdict is its own contract and re-judging it from outside the freeze is what the
   freeze prevents). That is a PRODUCT question — the owner may well want the row sum to post,
   since the page does state every row it was summed from. If the answer is yes, the lawful shape
   is an `evaluate_payroll_run_state_v2` that classifies such a run `established` with
   `basis='row_sum_no_printed_total'`, not a widening of this file's plan.
2. **"Asks" is a derived Needs-you row, not a minted question.** AC5's "a month Clara cannot
   establish is asked, never assumed" is satisfied by the `payroll_posting_blocked` row and its
   sentence. If the owner wants a first-class `clara.open_questions` row instead (so a person can
   ANSWER the month rather than re-file the payslip), that is a different ticket: it needs an
   answer door, and the answered month would have to become a durable fact the gate reads.
3. **A cleared block has no way to re-fire the post.** Once a person adds the missing account, the
   verdict reads `ready` — and the row says so — but nothing re-drives the post: the person
   re-files the payslip, which is the ticket's own model (AC4's "a second upload… never posts" is
   the retry mechanism, and a re-upload of a month that DID post is refused as a duplicate). A
   "post it now" door would need its own authority floor and its own receipt arm; worth filing as
   a question rather than assuming.
4. **The payroll row and the `uncoded_filing` row coexist** for a blocked run, which is the
   brief's own model (AC6 says the summary stops appearing as uncoded once its ENTRY exists) but
   does mean two Needs-you rows for one document. Narrowing `filing_rows` would change what an
   existing kind means for every firm already reading that queue, which this wave's shared-file
   rule forbids and the brief does not ask for. Worth an explicit owner look at the inbox once
   more than one of this wave's four new kinds is live.
5. **`entry_post_receipts.via_wake_kind` is now four values and is no longer only "wake" kinds.**
   The column name has outlived its meaning: `payroll_facts` is a LANE, not a wake credential
   kind. Renaming it is a table-wide change with its own reader contract and does not belong in a
   ticket that needed one value; noted so the next lane that adds a non-wake poster does not read
   the name as a constraint.

## Anything unverified

- **No real model has driven this lane end to end.** Every cell drives the real doors on a real
  database, but the payroll READ is fed by hand-built envelopes rather than by a provider call,
  and no real payroll PDF exists on this rig. What IS driven end to end is everything from the
  persist door onwards: the gate, the plan, the post, the receipt, the event, the queue row and
  the uncoded-filing clearance.
- **The from-scratch chain** (0001 → 0297 on a fresh cluster) was not run here — the work order
  assigns it to the integrator on a disposable cluster, and a second chain on a lane cluster is
  forbidden. The FIRST-APPLY branch of every bimodal pin was proven separately, above.
- **The `period_open` rung's CLOSED-year arm is driven; its CLOSING arm is not.** The cell builds a
  `closed` fiscal year through the established house fixture
  (`depreciation-history-fixtures.mjs`'s `fiscalYear`, which walks the estate's own
  `open → closing → closed` lifecycle edges). The `closing` state takes the same branch of the
  same predicate, but no cell drives it.
- **The Tier-C conversion set in `_post_payroll_run` is not driven by a cell.** Its three members
  (`23505` on the one-open-draft-per-filing unique, `CLR19` from the closed-period wall, and
  `CLR13 source_already_posted` / `CLR21 double_coded`) are races the gate's own rungs already ask
  about first, so reaching them needs a concurrent writer between the verdict and the write. The
  arm is written to the invoice lane's Tier-C shape and re-raises anything unlisted; that it
  re-raises is asserted by construction, not by a cell.
- **Hosted's `via_wake_kind` CHECK is assumed to be this rig's.** The prestate accepts the
  pre-image text or a body already widened by this file and would refuse anything else BY NAME at
  apply, so a hosted constraint at a different shape fails loudly rather than silently — but I did
  not read hosted.
- **The claim that `payroll_summary` will stay a codeable kind** is a prestate assertion, not a
  ruling. If it is ever ruled un-codeable, AC6 becomes vacuous and the prestate is what says so.
