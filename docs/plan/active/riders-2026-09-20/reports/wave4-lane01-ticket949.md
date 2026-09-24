# wave 4 · lane 01 · #949 — a tenancy's contract-terms record, and the recurring rent plan a person confirms

**Branch** `riders/w4-lane01` · **base** `cd2925391` · **head** `98fb80561`
**Status: DONE.** Every acceptance criterion is built and driven, and the owner's ruling of
2026-09-20 has a cell per branch. Two residuals are named under *Unverified*; neither is a gap in
this ticket's own scope.

**Ticket verified live on this branch** (`gh issue view 949 --comments`, 2026-09-24). The body is
the Agent Brief; THREE comments (all `belcorttao`) sit on it, and the third is **the owner's ruling
dated 2026-09-20**, which work-order rule 2 makes binding beside the body. Both its halves land
(the dedicated `2050 Rent Payable` credit account and the MPERS Section 20 / MFRS 16 lessee
branch), and the question it explicitly left to the implementer — "whether AC1's contract-terms
record is redundant with `clara.client_facts`" — was MEASURED rather than assumed (below).

**Verified live, not already satisfied.** Before building, on this branch and this database: no
`clara.contract_terms`, no `clara.contract_plan_confirmations`, no function whose name contains
`tenancy`, `rent_`, `contract_term` or `contract_plan`; `clara.list_review_queue` projected
fourteen row kinds and no rent kind; `clara._authority_ref_refusal` admitted two `authority_ref`
kinds. Blocked-by #948 was DONE on this branch (`7d0ebcc53`), so a real read tenancy — classified,
banked, and drafting nothing through the fixed-asset lane — was available to build against.

**Commits on this branch for #949** (all this session's):

| | |
|---|---|
| `8454196d1` | the contract-terms record, append-only and carrying its regions |
| `d1cbe7584` | what Clara can already read off a tenancy, region by region |
| `377c3dc85` | the lessee branch the owner ruled: MPERS 20, MFRS 16, and when Clara asks |
| `60f45a076` | the rent plan Clara drafts and never runs, and the act that would run it |
| `eca0bfcb7` | a person's confirmation is the plan's own instruction, and it names the agreement |
| `37eee97c4` | the open rent payable, and the bank line a person accepts against it |
| `47a0a6bf2` | the deposit is a term, and an offer when the money actually moves |
| `c90797346` | an escalation surfaces before its date, and the amount moves only when a person says so |
| `aa5f2f962` | an unpaid month and a pending rent review both reach Needs you |
| `35aef347b` | the prepayment lane's person-stated term is untouched, proven by driving it |
| `047ae3b55` | the tail, and the ten granted names the census can attribute |
| `0fba43fd6` | the contract page renders a tenancy's terms with the regions they came from |
| `a987efad0` | the walk reads a tenancy and confirms its rent plan, regions and all |
| `f0cd75740` | the tenancy lane in the data-plane README, CONTEXT and the review pin |
| `ee79ca3eb` | re-base the one pin this lane's authority splice moves |
| `98fb80561` | the tenancy walk earns a coverage-map row, not a residual line |

---

## The seams I tested at

Written down before the first cell, and no cell sits anywhere else (the battery's own header
carries the same list).

| | seam | what it is |
|---|---|---|
| S1 | `clara.record_contract_terms(uuid,uuid,jsonb,text)` + `clara.get_contract_terms(uuid)` over `clara.contract_terms` | AC1: the record — append-only, supersede-only, regions, RLS |
| S2 | `clara.propose_contract_terms(uuid)` | AC1: the terms #948's banked regions establish, each with its region |
| S3 | `clara._tenancy_lease_treatment(uuid,uuid)` | the owner's ruling — MPERS Section 20 / MFRS 16 |
| S4 | `clara.get_tenancy_rent_plan_draft(uuid)` | AC2/AC3: the draft, inert by construction |
| S5 | `clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)` | AC2/AC3: the act, the plan, the bank-credit refusal |
| S6 | `clara._rent_payable_unsettled(uuid)`, `clara.get_rent_settlement_candidates(uuid)`, `clara.settle_rent_payable(uuid,uuid,uuid,text)` | AC4 + AC3's second half |
| S7 | `clara.get_tenancy_deposit_coding(uuid)` | AC5 |
| S8 | `clara.get_tenancy_escalation_revision(uuid)`, `clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text)` | AC6 |
| S9 | `clara.list_review_queue(jsonb,jsonb,integer)` | AC4's and AC6's Needs-you arms |
| S10 | `clara.prepayment_schedule_v1(uuid,uuid)` + `clara.record_document_service_period(...)` | AC7, proven by driving the OTHER lane |
| W1 | `REVIEW_QUEUE_ROW_KINDS` / `isKnownReviewQueueRowKind`, `needsYouRowHref` / `hasOwningTab`, `getNeedsYouAffordance` | AC8's registry half |
| W2 | `getContractTerms`, `getTenancyRentPlanDraft`, `recordContractTerms`, `confirmTenancyRentPlan`, `confirmTenancyRentPlanRevision` | the wire shapes |
| W3 | `TenancyRentPlanSection` | AC8's rendered surface |
| E | the real built app, real client code, mocked PostgREST | AC8's walk |

Every DB slice was one test → red for the right reason → the minimal code → green → commit
(the reds are recorded below, including the two defects the cells actually found). The migration
was re-applied through `CLARA_MIGRATION_REDO` after every slice.

---

## Acceptance criteria, each with its evidence

### AC1 — a contract-terms record per client and agreement carrying monthly rent, deposit, escalation and term dates with their source regions, append-only and supersede-only, with RLS matching the documents estate; a correction opens a successor and never edits — **DONE**

**The owner's triage question, MEASURED.** `clara.client_facts` does not fit, for three facts read
off the live database rather than assumed:

1. `uq_client_fact_live` is UNIQUE on `(client_id, fact_key)` where live — ONE live row per client
   and key. A client with two shoplots could not hold two monthly rents.
2. `clara.client_fact_keys` is a CLOSED five-member registry behind a FOREIGN KEY
   (`banking_arrangement`, `customer_identity_policy`, `entity_type`, `msic`, `trade_nature`), and
   0192/#644 carried that estate's successor role to `clara.knowledge_records`.
3. It carries `source_document_id` but **no region pointer**, and AC1 asks for each term to carry
   "the region of the agreement it was read from". A document id cannot say WHERE on the page.

The knowledge lane was checked too and is the same shape problem (its subject is the client or the
firm, never one agreement; its keys are a closed catalog). So `clara.contract_terms` is its own
relation and nothing in the estate gains a second copy of a tenancy's terms.

- `S1 · a term is recorded against the agreement it was read from, carrying the region that prints it` — PASS. The recorded row's `source_region_ids` is asserted EQUAL to #948's own banked region id for `contract.agreement.instalment_amount`, read back independently.
- `S1 · a correction opens a successor and never edits` — PASS. Both readings survive; the FIRST row is still the first row with its figure byte-unmoved, points at its successor, carries the supersede reason; the live read shows ONE monthly rent and the superseded one beside it in `history`.
- `S1 · the record is append-only at the TABLE, not merely at the door` — PASS. A raw `update … set amount_cents = 1` and a raw `delete` are each refused **CLR08** by `clara._tf_contract_terms_append_only`, and the row is re-read byte-unmoved after both.
- `S1 · a term may only cite a region of ITS OWN agreement, and only a key the vocabulary admits` — PASS. Four named refusals driven: `contract_term_region_foreign` (a region of a DIFFERENT agreement of the same client), `contract_term_key_unknown`, `contract_term_basis_missing`, `contract_term_region_missing` (a `document_region` basis with no region — the basis is a claim, not a label).
- `S1 · the record is scoped like the documents estate` — PASS. Another firm's owner gets **CLR11** from the door AND counts **0** rows reading `clara.contract_terms` directly, so the row is invisible under RLS rather than merely behind a door.

**RLS is `clara.document_regions`' own shape, policy for policy** (0007:788): forced RLS, the
owner's ALL policy, a firm-scoped SELECT for `clara_authenticated` and one for `clara_agent_ro`,
with `grant select` to both. The runtime gets nothing: no worker reads a contract term.

**The four terms and where each comes from** (AC1's "with their source regions", made honest by the
`basis_kind` column):

| term | source | basis_kind |
|---|---|---|
| monthly rent | `contract.agreement.instalment_amount`'s region | `document_region` |
| deposit | `contract.agreement.deposit`'s region | `document_region` |
| term's first day | `contract.agreement.agreement_date`'s region, through #948's own date parser | `derived_from_regions` |
| term's last day | the same region + `contract.agreement.term_months`' region, inclusive | `derived_from_regions` |
| escalation | nothing — the FROZEN questionnaire has no question for it | `person_stated` |

- `S2 · a read tenancy proposes the rent, the deposit and the term, each carrying the region it came from` — PASS. Every proposed region id is asserted equal to the region #948's lane banked; the last day is `2028-01-04` (24 months from 2026-01-05, inclusive — computed BY HAND in the battery's header) and names BOTH regions it needed.
- `S2 · a term the two readings disagree about is not proposed, and the proposal names the state it is in` — PASS. A contested rent is absent from `proposed` and reported in `not_read` with the EVALUATOR's own state (`channels_disagree`), not a word this file invents; the terms that did agree are still proposed.
- `S2 · a financing agreement is not a tenancy, and this lane proposes nothing for it` — PASS (`reason: 'not_a_tenancy'`).
- The escalation is reported as `no_question_in_the_questionnaire` — never silence, never a zero.

### AC2 — from an established tenancy fact state, a draft recurring plan over the agreement's term; inert until confirmed; the confirming person's act recorded as the plan's explicit instruction; the agreement recorded as the source document; a cell proves an unconfirmed draft posts nothing — **DONE**

- `S4 · the draft debits rent expense and credits the rent payable, monthly over the agreement's own term` — PASS. `recurring_journal`, monthly, `day_of_month = 5` (the term starts on the 5th), `effective_from = 2026-01-05`, `effective_to = 2028-01-04`, `occurrences = 24`, both legs at 360 000 cents with the names they resolved to.
- `S4 · the draft is INERT` — PASS. Reading it twice leaves `journal_entries`, `accounting_plans` and `accounting_plan_occurrences` counts **byte-identical** — and at zero.
- `S5 · confirming records the person's own act and starts the plan under it, with the agreement as its source document` — PASS. The plan is `active`, `authority_kind='explicit_instruction'`, `authority_ref = {kind:'contract_confirmation', id:<the confirmation>}`; the confirmation row carries `document_id` (the agreement), the figures, the accounts, the term AND the whole treatment frozen at that moment; **no entry is posted** by confirming, and the draft read now says `confirmed: true`, `inert: false`.
- `S5 · a replayed op_key returns the same receipt and starts no second plan` — PASS, byte-identical receipt and exactly one plan; a SECOND confirmation under a NEW key is refused `rent_plan_already_confirmed`, pointing at the plan that already runs.

**Why the confirmation itself had to become a third `authority_ref` kind.** The plan lane admits an
`accounting_work` (accepted because `accounting_work.initiator` is NOT NULL — the owner's #977
ruling says exactly that) and a `chat_task` narrowed to a human-authored `chat_turn`. A person
clicking Confirm on a contract page is neither. Three routes were considered and rejected in the
migration header: admitting a Work would start a run nobody asked for; minting a `chat_turn` would
fabricate the very thing #977 exists to stop; and naming the DOCUMENT would make a thing a model
read into a thing a person said, which REGRESSES #977 rather than extending it. So
`clara.contract_plan_confirmations` is the row — INSERT-only, `confirmed_by` NOT NULL, which is the
SAME property that makes an `accounting_work` acceptable — and the agreement rides on it. 0250's
own closing line invited this ("a raise rather than a quiet refusal, so a future lane that widens
the admitted kinds finds this line"); §G.1 splices the arm immediately above that raise.

- `S5 · the plan lane resolves a contract_confirmation, and refuses one that names no row of this client` — PASS. `clara.create_accounting_plan` is called DIRECTLY with a `contract_confirmation` authority and accepts it; a confirmation belonging to ANOTHER client answers `authority_ref_unresolved`; `clara._authority_ref_refusal`'s `accounting_work` arm still ANSWERS rather than raising, and an unknown kind still RAISES so the next lane that widens finds that line.

### AC3 — the drafted plan credits a rent payable and never a bank account; the door refuses a bank credit with a typed reason; a cell proves a month's rent plus its later bank payment leave exactly one rent expense and one bank movement — **DONE**

- `S4 · the draft never credits a bank account, and says which account is the money's own` — PASS. Every registered bank code for the client is read back independently and no leg of the drafted basis credits one; the bank code is absent from the basis entirely.
- `S5 · the confirmed plan's own basis credits the rent payable, and a bank account is refused BY NAME` — PASS. The STORED revision's credit leg is the payable; naming the bank as the payable is refused **CLR10 / `plan_credits_bank_account`**, carrying the account it refused, with the brief's own reason in the message ("double-counts the statement line that pays it"), and NOTHING is started. The DRAFT reports the same wall, so a person sees it before they click.
- **The bank test is TWO independent facts** (`clara._tenancy_account_is_bank`): the chart row's own `is_bank_account` flag and a live registered `clara.bank_accounts.coa_account_code`. Either one refuses, so the plan cannot credit the bank by taking the one route that was not checked.
- `S6 · a month's rent plus its later bank payment leave exactly ONE rent expense and ONE bank movement (AC3)` — PASS, and this is AC3's whole claim measured off the ledger: `rent_expense_cents = 360 000` on exactly **1** leg, `bank_out_cents = 360 000` on exactly **1** leg, and the payable's balance **0**.

### AC4 — each month's open rent payable matched against candidate bank lines, offering a settlement a person accepts; an unmatched month surfaces under Needs you; the row is derived and clears itself by any route with no dismissal record — **DONE**

**The Settlement candidate row, third instance** (CONTEXT.md; #657's pending bank line first,
#947's unsettled payroll net pay second, WAVE-4 LANE RULE (c)). 0298's four bodies are the
template, line for line.

| cell | result |
|---|---|
| `S6 · a posted month of rent is fully unsettled until something pays it` | PASS — one open month at 360 000 cents, `period_month = 2026-02-01`, pointing back at the tenancy |
| `S6 · a hand-booked debit reduces the OLDEST open month first, to the cent` | PASS — half a month's rent paid against no particular month leaves February at 180 000 and March untouched |
| `S6 · the candidate read offers an exact bank line inside the window, and never a wrong amount or a far date` | PASS — one candidate at the exact negative amount; **one cent out is not a match**, and nothing is offered instead |
| `S6 · accepting the candidate books Dr rent payable / Cr bank and binds the line through the EXISTING bank-side door` | PASS — the two legs by code, `maker_actor = checker_actor`, the `rent_settlement` flag, the receipt (`via_wake_kind='interactive'`, `approval_arm='rent_settlement_interactive'`, `gate_verdicts.rent_entry_id`), a REAL `bank_matches` row at `status='live'` with one line member and one entry member naming the **settlement** entry |
| `S6 · the row clears itself by a hand-booked route too, and no dismissal record is written by any route` | PASS — a cheque booked by hand with NO door of this lane involved; the row is already gone, with exactly one new entry, **no new match**, no marker, no dismissal row |
| `S6 · two bank lines matching one month are BOTH offered, and neither is chosen` | PASS — both candidates present, the month's balance unchanged, neither line riding a match |
| `S6 · the accept door refuses a wrong amount and a month that is already settled, each by name` | PASS — `amount_mismatch`, `already_settled`, `not_an_open_rent_month` |
| `S9 · an unpaid month of rent reaches Needs you, naming the month and the amount, and clears itself` | PASS — `section`/`lane` = `needs_you`, `entry_id` the rent entry, `document_id` the tenancy, amount 360 000, `period = 2026-02-01`, the sentence matching /rent is posted/ and /February 2026/; GONE after settlement |
| `S9 · declining leaves both rows exactly as they were` | PASS — two reads with no act in between are byte-identical; there is no dismissal call to make |

**A cheque is the same case by construction.** Nothing in the read treats a cheque specially: the
payable stays open until the cheque appears on the statement, which is the only moment Clara can
see. The owner's option to flip that default to a written-date treatment belongs to whatever
records the written date, not to this read — recorded in the migration header rather than built.

**Which account is the payable is read off the CONFIRMATION**, not hardcoded, because the owner's
ruling lets the accountant choose another liability account. Where two rent plans of one client
share one payable account the FIFO is per ACCOUNT (a ledger balance has no idea which plan credited
it) and each open month is attributed to the most recently confirmed plan on it — stated in the
migration header as a bookkeeping choice a firm may make, not hidden.

### AC5 — the deposit is never drafted; when a bank line matches the recorded deposit, the deposits-paid account is offered as the coding; a cell proves no entry is born from the agreement alone — **DONE**

- `S7 · no entry is born from the agreement alone` — PASS. The deposit is RECORDED (720 000 cents), and the client's ledger is at **0 entries** — and still 0 after the rent plan is confirmed. No leg of the rent plan is the deposit and the deposits-paid account is nowhere in it.
- `S7 · a bank line matching the recorded deposit offers Deposits Paid as the coding, and posts nothing` — PASS. `1120 Deposits Paid` by code AND name, one candidate (the line that is exactly the deposit; a line 500 cents out is not offered), and **0 entries** after the offer.
- `S7 · the offer clears itself once the deposit is coded, and says so` — PASS. `already_coded` is a LEDGER read, so coding it the ordinary way (Dr 1120 / Cr bank, through the plain journal doors) clears the offer with nothing dismissed.
- `S7 · a client whose chart has no deposits-paid account is told so` — PASS (`proposed_account_in_chart: false`), never offered a code their chart cannot take.
- **There is deliberately NO write door for a deposit at all.** Coding a bank line is the coding lane's own act; what this lane owes is the offer. The window is SIXTY days around the term's first day rather than the rent settlement's ten, and the migration header says why.

### AC6 — a stated escalation surfaces under Needs you before its effective date and offers a plan revision a person confirms; no amount changes without that confirmation — **DONE**

- `S8 · a stated escalation surfaces before its date, offering the revision and changing nothing` — PASS. Pending, the plan named, 360 000 → 396 000, `days_until > 0`, and the proposed revision still crediting the payable — while the LIVE revision is still **revision 1** charging the ORIGINAL rent.
- `S8 · confirming the revision moves the plan, and only then` — PASS. Revision 2, effective on the escalation's own date, charging the escalated amount; the offer then reads `already_revised`; the act is recorded as a second confirmation row (`kind='rent_plan_revision'`) carrying the judgement verbatim and the branch that asked.
- `S8 · an escalation whose date is far away does not nag, and a tenancy with none is silent` — PASS (`not_due_yet` at > 60 days; `no_escalation_recorded`).
- `S8 · a tenancy with no confirmed plan has nothing to revise, and says so` — PASS, and the revision door refuses rather than inventing a plan to revise.
- `S9 · a pending escalation reaches Needs you before its date, and clears when the revision is confirmed` — PASS, with the amount it would move to and the date on the row.
- **Sixty days' notice, stated out loud**, and the row does NOT disappear once the date passes — an escalation that took effect and was never confirmed is exactly the case a person most needs to see.

### AC7 — a tenancy prepaid for a term routes to the amortisation lane; the person-stated service-period rule is untouched, and a cell proves the contract's printed term never becomes an amortisation term by itself — **DONE**

A negative, proven by driving the OTHER lane rather than by asserting an absence.

- `S10 · a tenancy prepaid a year up front does NOT amortise from the contract's printed term` — PASS. The 24-month term IS on file in `clara.contract_terms`; a year of rent is prepaid against the agreement itself; `clara.prepayment_schedule_v1` still refuses **`prepayment_term_underivable`**, naming `document_service_periods` — not the contract term this lane holds — and `clara.document_service_periods` holds **0** rows for the document.
- `S10 · once a PERSON states the service period, the schedule derives` — PASS. Twelve months stated through the estate's own unchanged door → `period_count = 12`, `term_start = 2026-01-01`, `term_end = 2026-12-31`; never the twenty-four the contract prints.
- `S10 · no body this migration mints ever writes clara.document_service_periods` — PASS, a catalog read: the rule cannot be weakened from here, because no body of the lane names that table.

### AC8 — the contract page renders the terms with their regions; en and zh copy; the walk covers reading a tenancy and confirming its rent plan — **DONE**, with one recorded reading

**The panel** mounts on the document detail's FACTS view, under the typed-facts table, and renders
nothing at all for any other agreement class (a panel headed "Tenancy" on a hire purchase is a lie
the layout tells).

- `p949.web.terms · every term renders with the region it was read from, and a derivation says it is one` — PASS. The rent's element carries `data-region-ids="r-rent"` and reads "Read from the page · 1 region on the page"; the term's last day carries BOTH ids and reads "Derived from what the page prints · 2 regions on the page".
- `p949.web.draft`, `p949.web.confirm`, `p949.web.asks`, `p949.web.refusal`, `p949.web.notATenancy` — all PASS. The ASKS cell proves the gate PROMPTS rather than disables: the question renders, no plan is offered, a judgement field appears, and Confirm is **held** (`.disabled === true`) rather than hidden.
- `apps/web/lib/documents/tenancy-wire.test.ts` — 7/7 PASS. Argument names pinned; a `bigint` arriving as a STRING is repaired at the boundary; `p_judgement` is sent EXPLICITLY, null included ("null is an answer on this wire, never an omitted key"); a fresh op_key per click.
- `apps/web/lib/firm/needs-you-tenancy-rent.test.ts` — 4/4 PASS (the four registration places, both kinds).
- **The walk** `apps/web/e2e/tenancy-rent-plan-walk.spec.ts` — **2/2 PASS** on the lane's own triple. Leg 1 signs in, opens the tenancy's facts view, reads every term with its rendering and its regions, reads MPERS Section 20 and the MFRS 16 sentence, reads the plan's schedule and both legs, runs an axe scan (WCAG 2.1 A/AA, zero violations) and confirms — asserting the REQUEST BODY carries this client, this document, a null judgement and a non-empty op_key. Leg 2 presses Confirm on a tenancy whose payable is a bank account and finds the database's own sentence and `CLR10` in the **panel's own** feedback box.

**"en and zh copy" reading, carried over from #947 verbatim.** This checkout ships ONE static locale
for UI chrome (`apps/web/i18n/request.ts`: "UI chrome is English-first for beta… adding
en-GB/ms/zh later is a routing.ts + middleware change"), so there is no `zh` locale to author copy
INTO. The house convention followed instead is the migration header's own bilingual title line
(0226's precedent, 0298's own header): 0300 carries one. If the owner meant a real `zh` locale for
this surface, that is a scoped product decision outside a lane ticket's reach — flagged under
*Unverified*.

### AC9 — from-scratch apply; the plans, prepayment and documents batteries stay green — **partially claimed, honestly**

*From-scratch apply* is the one I could not run as such: the rig rules forbid a second from-scratch
chain on a lane cluster (0154 pins the cluster-wide role count) and the work order gives that proof
to the integrator on a disposable cluster. What I ran in its place is the FIRST-APPLY proof the
wave-3 addendum asks for, for all three marker-tolerant splices (below). The batteries are green
and counted under *Gates*.

---

## The owner's ruling of 2026-09-20, branch by branch

`clara._tenancy_lease_treatment(uuid,uuid)` walks the ruling's own order. Every answer carries the
WRITTEN accounting basis naming BOTH standards, the term and the rent it read, and — where it asks
— the question the accountant answers.

| case | verdict | standard | cell |
|---|---|---|---|
| MPERS, level rent | **drafts** | MPERS Section 20 | `S3 · MPERS with level rent DRAFTS, and the basis names MPERS Section 20` — PASS |
| MFRS, term over 12 months | asks | MFRS 16 | `S3 · MFRS over 12 months ASKS` — PASS, `mfrs_lease_over_twelve_months`, the question naming the right-of-use asset AND the lease liability, beside the term and rent it read |
| MFRS, term of 12 months or less | **drafts** | MFRS 16 (short-term exemption) | `S3 · MFRS with a term of 12 months or less DRAFTS` — PASS |
| a stated escalation, under BOTH frameworks | asks | the one in force | `S3 · a stated escalation ASKS under BOTH frameworks` — PASS, driven for MPERS and MFRS in one loop, the escalation travelling with the question |
| framework not recorded | asks | — | `S3 · a client whose framework nobody recorded ASKS rather than assuming one` — PASS |
| framework neither MPERS nor MFRS | asks | — | `S3 · a client exception shadows the firm default, and a framework outside MPERS/MFRS asks` — PASS, and the same cell proves a client exception beats a firm default |
| terms not recorded | asks | — | `S3 · a tenancy whose terms were never recorded drafts nothing, and says which term is missing` — PASS |

**"Asks" is a prompt, never a wall** (the standing owner ruling "beta, nothing dark"). The confirm
door still admits the plan when the branch asks — but only against a written PROFESSIONAL
JUDGEMENT, which is recorded on the confirmation row, printed into the plan's own purpose, and
enforced by `ck_contract_plan_confirmations_judgement` on the table so no code path can drop it.

- `S5 · a treatment that ASKS is admitted only against a written professional judgement` — PASS. A bare confirm is refused `professional_judgement_required` with `treatment_reason` in the detail and the BRANCH'S OWN question as the message; nothing is started. With a judgement the plan starts, the judgement is recorded verbatim beside the branch that asked, and the plan's purpose says on its face that a judgement carries it.

**The MFRS 16 low-value exemption is deliberately NOT a branch**, and the written basis says so: the
asset a tenancy of premises conveys is never low value, and this lane only ever sees a tenancy
(§D admits no other class). Offering it would be offering an exemption for a case it cannot arise
in. **Full MFRS 16 measurement is out of scope** by the ruling's own last line — this file computes
no discount rate, no present value and no lease-liability schedule.

**The reporting-framework key gets its first reader.** `clara.knowledge_keys` has carried
`reporting_framework` since 0192/#644 with a label saying it is "DESCRIPTIVE in this slice — no
posting or presentation code reads this row". `clara._client_reporting_framework` is that first
reader, and it reads the key only to decide whether Clara may DRAFT, never to post: a live CLIENT
record shadows a live FIRM record inside its effective window, and two live records of one scope
carrying different codes answer `ambiguous` rather than picking.

---

## The migration

**`packages/db/migrations/0300_tenancy_terms_rent_plan.sql`** — the one file, the number reserved
for me. Applied checksum `97bcaa098261fd734f83f0a54d4e67e821ea08bb3ea933873526fc4546530c89`, which
equals the committed file's sha256 (re-measured after the last redo). Ledger after: **294 files,
frontier `0300_tenancy_terms_rent_plan`.**

Structure: §A prestate · §B the record · §C its two doors · §D the proposal · §E the framework read
and the lessee branch · §F the draft and the confirmation relation · §G the two authority splices
and the confirm door · §H the settlement · §I the deposit · §J the escalation · §K the queue splice
· §Z the tail.

### Prestate pins, EVERY ONE, MEASURED on `127.0.0.1:55741 / clara_l01` after #948

**§A, `sha256(prosrc)`:**

| pinned signature | sha256 | why |
|---|---|---|
| `clara.persist_agreement_facts(uuid,jsonb,jsonb,integer)` | `d3b22a8ae6cd6ef47e3e1765fd52b95f3b0f8a27cc0d2a255dcdd1c0be47d1de` | the writer of the regions every term in this lane cites |
| `clara._agreement_entry_plan(uuid,jsonb)` | `1db0f2be1a1e9ce75e407f867da9498d593dfb92d76d68f2960fa6cb6680b9ca` | its early return is why a tenancy never reaches the fixed-asset lane |
| `clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)` | `0c99e23bfd5d69aa733f0c180a42e4eb4b9bd3b7f856a0332dbbb8bfe5057c1c` | the REGISTERED frozen evaluator whose `tenancy` verdict and `facts` map this file reads |

**In the splice blocks, `sha256(pg_get_functiondef(...))`** (the 0298 §E idiom), each **BIMODAL** —
the block detects its own marker first and no-ops on a redo:

| pinned signature | PRE-image sha | POST-image sha |
|---|---|---|
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `d70256f4208f6caf20e30259958f66d08ff1b445522399fc0c7f844f2cdea435` | `d7973331ddc1c234a19d58caf516bfb78b15935e9e05893b0e29c36de6017746` |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `13f0d80556e60828875203bc9a290f7d325d4d067c4079e5ef6d25632a25a055` | `e63e5d6644401cf361a300365aa97f85408e7f27c32faa85f9d5637ceeb89241` |
| `clara.list_review_queue(jsonb,jsonb,integer)` | `bc7f9250bf58562e893dee83623d4e2abc6bc42480bfd69f65944a76f893ed6e` | `3d0c1d6fdc61076da6e4ebe2fd79edd1003772cabb51175c49ff8b434d8ca674` |

**Non-sha prestate claims:** the three chart rows this lane consumes are live on the CURRENT
published platform template under the names this file spells them by (`2050 Rent Payable`,
`6100 Rental of Premises`, `1120 Deposits Paid`); `clara._tf_no_truncate()` exists; the
`reporting_framework` knowledge key is registered.

**INTEGRATOR NOTE — the pins another lane could also recut.**
`clara.list_review_queue(jsonb,jsonb,integer)` is the shared surface of this whole wave: its
PRE-image pin here is the post-#948 body, and its live sha on this branch after #949 is
`3d0c1d6fdc61076da6e4ebe2fd79edd1003772cabb51175c49ff8b434d8ca674`.
`clara.create_accounting_plan` and `clara._authority_ref_refusal` are shared with the plan and
fixed-asset lanes; their live shas after #949 are the POST-image values above. `prosrc` sha for
`create_accounting_plan` after #949 is
`f9b19cf61ba2c1728b4c4ccc5d02e997b9a882779db4925cd1d267e92a669e63` (the value the test pin below
was re-based to).

### The FIRST-APPLY branch, proven for ALL THREE splices

`CLARA_MIGRATION_REDO` can only ever take the marker branch (wave-3 addendum), so the fresh-apply
branch was exercised by hand. Inside ONE transaction that was rolled back: each spliced body was
REVERSED through the block's own (anchor, replacement) pairs; the reconstructed pre-image's
`sha256(pg_get_functiondef)` was asserted **equal to the pin** (so the reconstruction is byte-exact,
or the assertion fails); the migration's OWN `do` block was extracted from the file and run
**verbatim**; and the post-state was read back out of the catalog.

```
OK  G.1 clara._authority_ref_refusal   pre = d70256f4… (== the pin)  first-apply = d7973331…  == the redo's own body
OK  G.2 clara.create_accounting_plan   pre = 13f0d805… (== the pin)  first-apply = e63e5d66…  == the redo's own body
OK  K   clara.list_review_queue        pre = bc7f9250… (== the pin)  first-apply = 3d0c1d6f…  == the redo's own body
```

All three first-apply bodies are **byte-identical** to what the redo branch leaves, and the
transaction was rolled back (the live shas were re-read afterwards and are unmoved).

### Redo posture

Every function is `create or replace`; both relations are `create table if not exists` with
`if not exists` indexes and `drop policy if exists` before each policy; every trigger is
dropped-if-exists; all three splices detect their own marker and no-op with a notice.
`CLARA_MIGRATION_REDO=0300_tenancy_terms_rent_plan` was used for **every** build round of this file
(twelve times) and is recorded here as the work order asks.

### Two defects the cells found, fixed and recorded rather than hidden

1. **The supersede ORDER.** `uq_contract_terms_live` is a partial UNIQUE over `(document_id,
   term_key)` where live and is NOT deferrable, so inserting the successor before stamping the
   predecessor fails **23505**. Measured, then fixed: the successor's id is minted first, the
   back-pointer written against it, and the insert follows — `superseded_by`'s foreign key is
   DEFERRABLE INITIALLY DEFERRED precisely so that pointer may name a row this transaction has not
   inserted yet. The reason is written into the body.
2. **Both new trigger functions left PUBLIC with EXECUTE.** `operation-census.test.mjs` refused the
   file (`public_execute is not zero after waivers`). Revoked; the census is green at 10/10. This
   was a real gap the gate caught, not a cosmetic one.

---

## Gates, with counts

| gate | result |
|---|---|
| `tests/tenancy-rent-plan.test.mjs`, full gate chain (222 `--import` flags) | **48/48 pass, 0 fail, 0 skipped** |
| the db gate set (tenancy + `operation-census` + `rig-isolation`), full gate chain, **no reset flags** | **81 tests, 80 pass, 0 fail, 1 skipped** |
| the PLANS + PREPAYMENT + ACCRUAL + AUTHORITY batteries (12 files: `accounting-plans`, `accounting-plan-occurrences`, `plan-overlap-sibling-arm`, `plan-schedule-yield-wall`, `plan-overlap-template-arm-retired`, `adjustment-template-doors-retired`, `authority-ref-human-instruction`, `prepayment-schedule`, `prepayment-occurrences`, `prepayment-term-liveness`, `accrual-adjustments`, `accrual-correction`) | **123/123 pass, 0 fail** |
| the DOCUMENTS + QUEUE batteries (12 files: `document-capability-registry`, `document-regions-field-path-check`, `document-regions-unique-field-path`, `document-intake-capabilities`, `document-fact-validation-belt`, `document-filing-conflict`, `ninth-rowkind-seeding-proposal`, `work-question-reads`, `a21-read-surfaces`, `client-work-pack`, `payroll-summary-posting`, `wave4-chart-rows`) | **130/130 pass, 0 fail** |
| `apps/web`: the WHOLE unit suite (`node scripts/run-tests.mjs`) | **5027 tests, 5025 pass, 0 fail, 2 skipped** |
| the web files this ticket added or touched, re-run together | **87/87 pass, 0 fail** |
| `pnpm typecheck` | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** (run as the Linux runner sees it, per the wave-3 addendum) |
| `node scripts/check-frozen-workflows.mjs` | **OK** — 322 frozen files, **manifest byte-unchanged** (this ticket touches no runtime workflow at all) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `pnpm --filter @clara/web e2e tenancy-rent-plan-walk` (triple 3500/3501/3502) | **2/2 pass** |
| `pnpm --filter @clara/web e2e documents-viewer-walk` (same triple) | **22/22 pass** — the walk over the surface this ticket mounts a component on |
| `pnpm --filter @clara/web e2e document-correction-walk` (same triple) | **15/15 pass** |

**`packages/runtime`: nothing touched**, so no runtime unit files were owed; the two runtime gates
were run anyway and both are OK, which is the evidence for "no frozen body was edited".

**Known Windows-only reds: none encountered.** Every failure this session was real and was fixed;
none was reported as "fixed" without being one.

**Vacuity control** (work-order rule 4, for the cells whose whole deliverable is a registry entry):
`lib/firm/needs-you-tenancy-rent.test.ts` was written and run BEFORE the four registration sites
were edited and failed 4/4 for exactly the right reason ("a kind the database emits but this array
does not carry renders with no label and no affordance: rent_payable_unsettled"); the registrations
then turned it green with no other change. Every DB slice has the same recorded red (the seam did
not exist).

---

## Docs, in the same commits

- **`packages/db/README.md`** — a full `#949 [0300]` section: the owner's ruling as a branch table,
  the measurement that ruled `clara.client_facts` out, why the confirmation itself had to become a
  third `authority_ref` kind (with the three rejected routes), the Settlement-candidate-row reuse,
  the deposit's sixty-day window and why it differs from the settlement's ten, the escalation's
  notice window, the prepayment negative, every prestate pin with its sha, the redo posture, and
  the wiki-lint contract §Z was written against.
- **`CONTEXT.md`** — three terms in the house "term / _Avoid_" shape (**Contract terms record**,
  **Lessee treatment branch**, **Plan confirmation**), plus the **Settlement candidate row** entry
  updated to name its third instance. 36 lines, at the natural position beside *Match basis*.
- **`apps/web/e2e/README.md`** — the walk's own coverage-map row (in the TABLE, not the residual
  list), with both counts bumped. `spec-discovery.test.ts` holds those counts against the directory.
- **`apps/web/tests/firm-scope-db-pins.corpus.ts`** — 0300's review entry: the three spliced
  functions each read at their own literal `regprocedure`, all three returning text or jsonb so
  none can emit a view definition, no `create view` of any spelling in the file, every anchor
  asserted to occur exactly once, every replacement a single dollar-quoted literal.
- **`packages/db/tests/rig-meta.mjs`** — `TENANCY_RENT_0300_HUMAN_FNS` / `TENANCY_RENT_0300_COHORT`
  (ten names), the `ALLOWED[clara_authenticated]` entry and the `cohortFailures` line.
- **`packages/db/package.json`** — the gate-chain entry, at migration order.
- **`apps/web/test/manifest.txt`** — three new test files at their sorted positions.

**One pin re-based, in its own commit with the reason.**
`packages/db/tests/plan-overlap-template-arm-retired.test.mjs` pins the `prosrc` sha of
`create_accounting_plan` at 0283's own post-image, and §G.2 adds one line to that body's
authority-kind wall. The pin's own failure message anticipated exactly this ("or another ticket
recut it"), and what the pin is FOR is untouched — the cell re-checks the client rung above the plan
row lock and the self-exclusion by plan id against the LIVE body, structurally. The pre-#949 value
is kept in the comment for a reader tracing 0283's own fresh apply. **No other pin of the three
recut bodies exists anywhere in the repo** (grepped for all three pre-image shas).

---

## Successor contract (WAVE-4 LANE RULE (d) — written in full)

#949 edits **no** frozen chat or Work tool and no module in a frozen closure
(`check-frozen-workflows.mjs` shows a byte-unchanged manifest). Everything a frozen tool would need
for this lane is below, for the ONE shared `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4.

### 1. A read tool: "what does this tenancy say, and is its rent plan running?"

- **Tool name** `read_tenancy_terms`
- **Zod input**

```ts
z.object({
  document_id: z.string().uuid().describe("the filed tenancy agreement to read"),
})
```

- **Door call, argument order:**
  `clara.get_contract_terms(p_document => $1)` for the recorded terms (each with its
  `source_region_ids`, its `basis_kind` and its `basis` sentence, plus the superseded readings in
  `history`), then `clara.get_tenancy_rent_plan_draft(p_document => $1)` for the treatment branch,
  the drafted plan and whether a person has already confirmed one (`confirmed`, `plan_id`,
  `plan_status`, `inert`). Both are **viewer+** and `clara_authenticated`-only, and both write
  nothing. Where the terms have not been recorded yet, `clara.propose_contract_terms(p_document =>
  $1)` says what Clara CAN read off the banked reading and what she cannot.
- **Refusal mapping:** `CLR11` → the document is not a live filing in this firm → `not_found`
  (absent and foreign answer alike — the estate's no-existence-oracle rule); a
  `get_tenancy_rent_plan_draft` answer whose `agreement_class` is not `tenancy` → `not_a_tenancy`,
  with the class it IS carried in the refusal detail; `treatment: null` with
  `refusals: [{reason:'not_a_tenancy'}]` → the same. An empty `terms` array is NOT a refusal: it
  means nobody has recorded the terms yet, and the proposal read is the next step.
- **Part kind:** `freeform_result` — this is a reading, not an act, and it mints no receipt.
- **Prompt stanza:**
  > When someone asks what a tenancy says, read the terms that were recorded against it and quote
  > them as they are recorded. Five terms exist — the monthly rent, the deposit, the term's first
  > and last day, and any escalation — and each one says how it came to be what it is: READ from a
  > region of the page, DERIVED from regions by the rule its basis sentence states, or STATED by a
  > person. Say which. Never present a derivation as something the page printed, and never add two
  > terms together. A term that is not recorded is not zero and not absent from the tenancy — it is
  > a term nobody has recorded, and the proposal read says whether Clara can read it at all (an
  > escalation never can: the agreement questionnaire has no question for one). If the rent plan
  > has not been confirmed, say what the standard asks before you say what Clara would draft: the
  > treatment carries a written basis naming MPERS Section 20 and MFRS 16, and where it asks, its
  > `question` is the sentence to give — do not compose your own.

### 2. An act tool: "confirm the rent plan"

- **Tool name** `confirm_tenancy_rent_plan`
- **Zod input**

```ts
z.object({
  client_id: z.string().uuid(),
  document_id: z.string().uuid().describe("the filed tenancy agreement whose plan is being confirmed"),
  rent_account: z.string().trim().min(1).max(32).nullable()
    .describe("the expense account to debit; null takes the draft's own 6100 Rental of Premises"),
  payable_account: z.string().trim().min(1).max(32).nullable()
    .describe("the liability account to credit; null takes the draft's own 2050 Rent Payable"),
  judgement: z.string().trim().min(1).max(4000).nullable()
    .describe("REQUIRED when the lessee branch asks; the accountant's own written treatment"),
})
```

- **Door call, argument order:**
  `clara.confirm_tenancy_rent_plan(p_client => $1, p_document => $2, p_rent_account => $3,
  p_payable_account => $4, p_judgement => $5, p_op_key => $6)` — bookkeeper+,
  `clara_authenticated` only, a FRESH `p_op_key` per act (this door's identity is "confirm THIS,
  now"). `p_judgement` is sent EXPLICITLY even when null: null is an answer on this wire, not an
  omitted key.
- **Refusal mapping** (all `CLR10` unless noted; the `detail.reason` is the token):
  - `professional_judgement_required` → the lessee branch asked and no judgement was written.
    **The refusal's MESSAGE is the branch's own question** — give it verbatim, then ask the person
    for their treatment. Never confirm on the model's own reading of the standard.
  - `plan_credits_bank_account` → the payable named is one of this client's own bank accounts,
    with `account_code` in the detail. Offer the liability account instead; never retry with a
    different bank account.
  - `account_not_in_chart` → the code is not in this client's chart or is inactive, with
    `account_code` and `role`. The chart door adds it; this lane does not.
  - `rent_plan_already_confirmed` → a plan already runs, with `plan_id` and `plan_status`. Ending
    or revising that plan is the plan lane's own act, not this door's.
  - `confirm_wrong_kind` → the document is not an agreement contract.
  - `terms_incomplete` (as the reason of "there is no rent plan to confirm") → with
    `missing_terms`; the terms have to be recorded first.
  - `CLR11` → the client or the document is not in this firm → `not_found`.
  - `CLR13` → an in-flight sibling holds this key.
- **Part kind:** `work_result` — this is a governed act that returns a receipt
  (`confirmation_id`, `plan_id`, `revision_id`, `status`, `occurrences`, `next_occurrences`,
  `overlap_warning`, the frozen `treatment`, the `professional_judgement`). A replayed op_key
  returns the byte-identical receipt.
- **Prompt stanza:**
  > A recurring rent plan never starts because you read a contract. It starts because a person
  > said so, looking at what you read. Before you offer to confirm one, state the rent, the term
  > and the accounts the plan would use, and say which standard admits the treatment. If the
  > branch ASKS — the accounts are on MFRS and the lease runs over twelve months, the tenancy
  > states an escalation, or nobody has recorded the framework — you may not confirm on your own
  > reading of the standard. Give the question the branch carries, ask the accountant for their
  > written treatment, and pass it through unchanged. It is recorded with the act and printed on
  > the plan. Never choose the payable account yourself when the door has refused one: a rent plan
  > that credits the bank counts the statement line that pays the rent twice.

### 3. An act tool: "confirm the escalation's plan revision"

- **Tool name** `confirm_tenancy_rent_plan_revision`
- **Zod input**

```ts
z.object({
  client_id: z.string().uuid(),
  document_id: z.string().uuid(),
  judgement: z.string().trim().min(1).max(4000).nullable()
    .describe("a stepped rent ALWAYS makes the branch ask, so in practice this is required"),
})
```

- **Door call, argument order:**
  `clara.confirm_tenancy_rent_plan_revision(p_client => $1, p_document => $2, p_judgement => $3,
  p_op_key => $4)`, bookkeeper+, fresh op_key. The offer it acts on is read first through
  `clara.get_tenancy_escalation_revision(p_document => $1)` (viewer+), which carries `pending`,
  `current_cents`, `new_cents`, `effective_from`, `days_until` and the whole `proposed_revision`.
- **Refusal mapping:** `professional_judgement_required` (the usual case — a stepped rent always
  asks, and the message is the branch's own question); `no_escalation_recorded`,
  `no_confirmed_plan`, `already_revised`, `not_due_yet` (each as the reason of "there is no
  escalation to confirm on this tenancy", carried with `plan_id`); `CLR11` → `not_found`.
- **Part kind:** `work_result` (`confirmation_id`, `plan_id`, `revision`, `from_cents`,
  `to_cents`, `effective_from`).
- **Prompt stanza:**
  > A rent review changes nothing by itself. When a tenancy states an escalation, say what the
  > plan charges today, what it would charge, and from when — and then say why the standard asks:
  > straight-line means the total rent averaged over the term, so a stepped rent's monthly expense
  > differs from the month's cash rent unless the increases only follow expected general
  > inflation. That is a judgement about the term, not a figure you can read. Ask for it, pass it
  > through unchanged, and never average anything yourself.

### 4. A read tool: "which rents and deposits are waiting for the bank?"

- **Tool name** `read_rent_settlement_candidates`
- **Zod input** `z.object({ client_id: z.string().uuid() })`
- **Door call, argument order:**
  `clara.get_rent_settlement_candidates(p_client => $1)` (bookkeeper+) for the open months and
  their candidate bank lines; `clara.get_tenancy_deposit_coding(p_client => $1)` (bookkeeper+) for
  the recorded deposits and the `1120 Deposits Paid` coding offer.
- **The accept act is `clara.settle_rent_payable(p_client => $1, p_entry => $2, p_line => $3,
  p_op_key => $4)`** — bookkeeper+, fresh op_key, and it names WHICH candidate was accepted.
  Refusals: `amount_mismatch` (with `line_cents` and `unsettled_cents`), `already_settled`,
  `not_an_open_rent_month`, `already_matched`, `wrong_period`, `bank_account_unmapped`; `CLR11` →
  `not_found`.
- **Part kind:** `freeform_result` for the two reads; `work_result` for the accept (`entry_id`,
  `match_id`, `unsettled_cents`, `period_month`, `posting_date`).
- **Prompt stanza:**
  > A month of rent stays open until the payment appears on the statement, and a cheque is the
  > same case — the day it appears is the only day you can see. Offer every candidate line a month
  > has and choose none of them: two lines of the same amount in the same window are two lines a
  > person adjudicates, not a tie you break. Never say a rent has been paid because a plan posted
  > it; the plan recognises the expense, the bank line moves the money. A deposit is never drafted
  > at all: signing states a term, it does not say the money moved, so offer the deposits-paid
  > coding only when a line of exactly that amount is actually there.

### 5. What a Work would call, if one ever drives this lane

Nothing new. Every door above is `clara_authenticated`-only and none is granted to `clara_runtime`
— this lane is a person's lane end to end, by design, and the rig-meta cohort says so
(`TENANCY_RENT_0300_HUMAN_FNS`, ten names, zero machine-lane grants). A Work that wanted to
PROPOSE a rent plan would read `clara.propose_contract_terms` and
`clara.get_tenancy_rent_plan_draft` through a human's session and stop there; the confirmation is
the human's act and there is deliberately no machine path to it.

---

## Follow-ups worth filing

1. **`operating_lease` is not admitted by this lane, deliberately.** A lessee's operating lease of
   premises takes the same treatment as a tenancy, but this lane has never seen a real page of that
   class, and admitting one on the strength of a word in a title would be the lane guessing. A
   later ticket widens `clara.propose_contract_terms`' class roster with a page in front of it.
2. **The plan's own posting path is not driven by any cell of this ticket.** A confirmed plan posts
   its months through 0193's Work machinery (a due event admits an `accounting_work`, which a
   runtime run posts), and no database cell can turn that handle. The cells drive the LEDGER claim
   instead — a month booked Dr rent expense / Cr rent payable, exactly as a plan occurrence leaves
   it. An end-to-end cell that runs the sweep and posts a rent month is worth a ticket of its own.
3. **A written-date treatment for cheques.** The brief names it as "the default the owner may flip".
   Nothing here treats a cheque specially; flipping the default belongs to whatever records the
   written date, which does not exist yet.
4. **Two rent plans of one client on ONE payable account share a FIFO.** A ledger balance has no
   idea which plan credited it, so the read is per account and each open month is attributed to the
   most recently confirmed plan on it. That is the honest reading of the ledger, but it is a
   judgement worth re-reading once a real firm runs two tenancies through one account.
5. **`?tab=matching` is still not a view `CLIENT_ROUTES` emits** (#947's own follow-up, inherited
   here): `rent_payable_unsettled` links to a bare `/bank` for the same reason
   `payroll_net_pay_unsettled` does. The fix is a symmetric `bank` entry in
   `lib/navigation/tree.ts`, which four lanes touch this wave.
6. **No `/bank` panel for the rent settlement.** #947 built `PayrollSettlementsSection`; #949
   delivers AC4 at the DB seam and the Needs-you row, and its own walk is the CONTRACT page (AC8's
   own words). A `RentSettlementsSection` beside the payroll one is the obvious next surface and is
   recorded rather than half-built.

---

## Anything unverified

- **The from-scratch chain** (AC9's "from-scratch apply") was NOT run by me: the rig rules forbid a
  second from-scratch chain on a lane cluster (0154 pins the cluster-wide role count), and the work
  order gives that proof to the integrator on a disposable cluster. What I DID prove is the
  FIRST-APPLY branch of all three marker-tolerant splices, each inside a rolled-back transaction,
  with the reconstructed pre-image asserted byte-equal to the pin and the resulting body
  byte-identical to the redo's own.
- **"en and zh copy"** is discharged as #947 discharged it: this checkout ships ONE static locale
  for UI chrome and there is no `zh` locale to author copy into; the migration header carries the
  house's bilingual title line instead. If the owner meant a real `zh` locale for this surface,
  that is a scoped product decision (adding a locale) outside a lane ticket's reach.
- **The integrator's WSL re-run** of the new files as user `runner` has not happened. The db
  battery reaches only Postgres and the rig fixtures (no spool, no Windows path, no directory left
  by an earlier run, and every client it uses is minted fresh inside the test); the three new web
  unit files are pure. I expect them to pass — expect, not verified.
- **`clara._client_reporting_framework`'s `ambiguous` branch is not driven by a cell.** Two live
  `reporting_framework` records of ONE scope carrying DIFFERENT codes under different applicability
  conditions answers `ambiguous` (and therefore ASKS, through `framework_not_established`), but the
  fixture seeds one record per scope, so only the `client_exception` / `firm_default` / `none`
  branches were exercised for real. The `ambiguous` arm is structurally reachable and honest; it is
  untested.
- **The rent settlement's ten-day window and the deposit's sixty-day window are product numbers**
  carried from #947 and chosen here respectively. Both are stated out loud in the migration header
  rather than hidden, and both are worth re-reading against a real firm's statements.
