# Riders sweep wave, the plan

The last wave outside the #597 mainline. It works the follow-up tickets that riders waves 1 to 4 and
the wave-4 release left behind, and it ends with no ticket outside the mainline open.

Planned 2026-09-25 from `main` at `83c911581` (wave 4 merged as PR #1053; the as-run docs merged as
PR #1138). Every liveness claim below was taken by reading the code on that head, and the file path
or migration line that carries it is named.

## The set

`gh issue list --state open --limit 250` returns **86** open issues. Minus the mainline map (#597,
#612, #645, #661 to #683: 26 issues) and minus the five cut-phase tickets now running on
`riders/wC-lane01` and `riders/wC-lane02` (#985, #1000, #1030, #1037, #1135), **55** remain. That is
exactly the backlog the work order names: #1044 and #1046 to #1052 (the eight filed before the
follow-up pass), the 45 open wave-4 follow-ups of `reports/wave4-followups-filed.md`, and #1136 and
#1137 from the cut phase's own deferral ruling.

## Census

| bucket | count | tickets |
|---|---|---|
| **Live, ready to build** | **41** | see the lane table |
| **Live but materially narrowed** (a subset of these 41) | 4 | #1060, #1070, #1096, #1131 |
| **Live but re-briefed** (also inside the 41) | 1 | #1051 |
| **Verify then close** (already satisfied in full) | **0** | none |
| **Needs-info, an owner question** | **14** | #1050, #1054, #1055, #1057, #1058, #1062, #1064, #1065, #1072, #1076, #1078, #1081, #1082, #1127 |

No ticket in the backlog came back already satisfied in full, so nothing is a pure "verify then
close". Four came back narrower than filed because work that landed after they were written already
did part of the job, and one came back with a false premise. Each is recorded below with the
evidence, because a worker who builds the filed scope instead of the narrowed scope wastes the cycle.

Eleven of the fourteen questions were filed as `needs-info` by the triage pass. Three more are raised
by this scan: **#1050**, **#1058** and **#1065**. Each is raised because reading the code showed the
ticket as filed cannot be built as written, not because the work is unwanted.

### The four narrowed tickets, and the one re-briefed

- **#1060** asks for two things. Part one, a `tab` on the bank navigation entry, is live:
  `apps/web/lib/navigation/tree.ts:380` carries no `tab` while its two siblings at lines 381 and 382
  do. Part two, a shared FIFO settlement-candidate extraction, is gated by the ticket's own words on
  a fourth instance appearing, and exactly three exist today
  (`clara.list_unmatched_lines` in 0040, `clara._payroll_net_pay_unsettled` in 0298,
  `clara._rent_payable_unsettled` in 0300). Build part one only. Part two stays dormant on the
  ticket.
- **#1070** asks the accrual detail view to render two facts. The side is already rendered:
  `apps/web/components/accruals/accrual-detail.tsx:94` prints it. The per-period schedule is not:
  the component never reads `period_amounts`, though the read returns it
  (`apps/web/lib/accruals/api.ts:194`). Build the per-period half and the missing test file only.
- **#1096** asks for a disclosure and a pinning test. The disclosure already landed:
  `packages/db/migrations/0318_knowledge_fye_pair_applicability.sql:57-64` names the residual in its
  header, the function comment repeats it at line 243, and `packages/db/README.md:7240-7249` carries
  it. What is missing is the test: no cell anywhere drives month 2 day 29 and pins the accepted
  outcome. The ticket shrinks to one test cell.
- **#1131** asks for two things. Wiring the two-build cutover drill into a regular CI job already
  holds: `.github/actions/db-live-gates/action.yml:488` runs it, and `db-live-gates` runs on every
  pull request. What is still missing is automated coverage of the contract-refusal exit code
  without a hand-maintained World: the drill asserts a real exit code only for the body rule
  (`packages/runtime/tests/two-build-cutover-e2e.mjs:966-969`), never the contract rule.
- **#1051** is re-briefed. Its stated current behaviour is stale. On main `clara._obo_plan_core`
  admits all three authority-reference kinds, the same three as `clara.create_accounting_plan`:
  `packages/db/migrations/0308_deferred_revenue_recognition.sql:893` against the same list at line
  614. The wave-4 integrator already carried `contract_confirmation` into both. What is still live is
  the real defect the ticket names second: the two walls are two independently hand-written copies
  (0308 lines 871-919 against lines 597-640), and the "verbatim from clara.create_accounting_plan"
  claim at line 870 is not true of anything any more. **The re-brief: extract one shared predicate,
  keep the three kinds both doors already admit (this is a refactor, not a behaviour change), and
  correct the stale claim in the new migration's own README section.** The ticket's own
  recommendation, to keep the OBO lane narrower at two kinds, is now a behaviour change that would
  remove a kind the integrated wave deliberately added, and this plan does not take it.

## Lane table

Eight lanes. Seven run on the sweep wave's own base; the eighth runs after the cut phase merges.
Grouping rule, from wave 4's own lessons: **no database body is written in one lane and written or
pinned in another**, and tickets with an ordering dependency sit in one lane, in order.

Migration numbers are NOT assigned here. The orchestrator assigns them at launch from `0330` upward,
and holds the overflow block itself; a fix worker never picks one (wave 4, rule 1).

| lane | worktree | theme | tickets in order (migration NEEDED) | adversarial lens | model per ticket |
|---|---|---|---|---|---|
| **L1** | `clara-wt/651` | the plan machinery: authority wall, occurrence basis, accrual surface | #1051 (yes) → #1080 (yes) → #1074 (yes) → #1073 (yes) → #1075 (yes) → #1070 (no) → #1071 (no) | **yes** | opus, opus, opus, opus, sonnet, sonnet, sonnet |
| **L2** | `clara-wt/655` | prepayment and deferred-revenue refusals | #1114 (yes) → #1077 (yes) → #1079 (no) | **yes** | opus, opus, sonnet |
| **L3** | `clara-wt/656` | staff expense claims and the claimant wall | #1067 (yes) → #1052 (yes) → #1066 (no) → #1068 (no) → #1069 (yes) → #1049 (yes, shed first) | **yes** | opus, opus, sonnet, sonnet, sonnet, opus |
| **L4** | `clara-wt/657` | payroll posting, settlement and the capability registry | #1061 (yes) → #1059 (no) → #1060 (no) → #1048 (yes) | **yes** | sonnet, sonnet, sonnet, opus |
| **L5** | `clara-wt/642` | documents, agreements and the fixed-asset proposal | #1056 (yes) → #1090 (yes) → #1092 (yes) → #1093 (no) → #1063 (yes, shed first) | **yes** | opus, sonnet, opus, sonnet, opus |
| **L6** | `clara-wt/658` | runtime readiness, rollback safety and CI integrity | #1044 (no) → #1128 (no) → #1129 (no) → #1131 (no) → #1126 (no) → #1124 (no) | **yes** | opus, sonnet, sonnet, sonnet, sonnet, sonnet |
| **L7** | `clara-wt/659` | database hygiene, retention, backfill and disclosure | #1047 (no) → #1098 (yes) → #1046 (yes) → #1132 (yes) → #1096 (no) → #1099 (no) → #1094 (no) → #1095 (no) | **yes** | opus, opus, sonnet, sonnet, sonnet, sonnet, sonnet, sonnet |
| **L8** | `clara-wt/635` **after the cut phase merges** | the frozen family: the deferred chat tools | #1136 (yes) → #1137 (yes, read half only) | **yes** | opus, opus |

### Migrations owed per lane

| lane | migrations | note |
|---|---|---|
| L1 | **5** | #1051, #1080, #1074, #1073, #1075 |
| L2 | **2** | #1114, #1077 |
| L3 | **4** | #1067, #1052, #1069, #1049 (3 if #1049 sheds to the mainline) |
| L4 | **2** | #1061, #1048 |
| L5 | **4** | #1056, #1090, #1092, #1063 (3 if #1063 sheds to the mainline) |
| L6 | **0** | runtime, test and CI only |
| L7 | **3** (+1 contingency) | #1098, #1046, #1132; the contingency is a forward re-pin if any #1047 site cannot be proved flip-proof |
| L8 | **2 planned, up to 6** | one per agent-granted twin: three for #1136, two reads for #1137, plus two more only if the owner rules OBO twins for the tenancy confirmations |
| **total** | **22 planned** | plus an overflow block the orchestrator holds |

Note that in this estate a `create or replace function` recut is itself a migration: applied
migrations are immutable and a body change ships as a new numbered file. Every "no" above is a
ticket that touches no PostgreSQL object at all.

### Why each lane is grouped this way

**L1 is one lane because the plan machinery is one body family.** #1051 extracts the shared authority
predicate; #1080 then makes `clara._accrual_plan_core` call it instead of its own `exists` probes;
#1074 fixes the occurrence reversal basis; #1073 builds a third remedy on top of that fixed basis;
#1075, #1070 and #1071 are the accrual surface above them. Every one of these was a candidate for a
separate lane and every split creates the exact collision wave 4 paid for four times. The evidence:

- `clara._accrual_plan_core` still carries 0222's `exists` probes at
  `packages/db/migrations/0222_accrual_adjustments.sql:1014-1025`, while
  `clara.create_accounting_plan` (0308:631) and `clara._obo_plan_core` (0308:910) both call
  `clara._authority_ref_refusal`. `packages/db/migrations/0307_prepayment_schedule_obo_twin.sql:26`
  says so in its own prose. This is a live authority-wall gap: a wake task or an autodraft run can
  authorise an accrual plan today through a path #977 closed everywhere else. **Security. Opus.**
- If #1080 is built by pasting the authority block a third time, it recreates the drift #1051 exists
  to close. #1051 must land first, and #1080 must call its predicate.
- #1074 is a real accounting defect, confirmed by reading the code rather than by trusting the
  ticket. `clara._plan_admit_occurrence`
  (`packages/db/migrations/0308_deferred_revenue_recognition.sql:1754-1758`) selects the plan's
  current live revision, and at line 1882 passes `r.basis` into `clara._plan_occurrence_basis` with a
  null per-period line for the ordinary `stated_amount` case. A reversal therefore reverses whatever
  the plan states now, not what the occurrence posted. The stranded balance is real, and the body is
  shared by every plan kind (accrual, prepayment, deferred revenue), so the blast radius is wider
  than the ticket's accrual framing. **Accounting judgement. Opus.**
- #1073's third remedy must net to the same ledger state as the existing "reverse now" for one
  period, which is only true once #1074 lands. Ordering dependency.

**L2 is separate from L1 and must not overlap it.** The three tickets that recut
`clara._prepayment_schedule_core` and `clara._revenue_recognition_core` (current cut
`packages/db/migrations/0317_schedule_term_correction.sql`) are #1114 (its `prepayment_source_unfit`
raise at 1588-1596 and `deferred_revenue_source_unfit` at 2127-2134), #1077 (the nested
`p_op_key || ':plan'` reservation at 1767 and 2250) and #1050. #1050 is held (see the questions), so
L2 is #1114 then #1077, in that order, because whichever lands first is the prestate the other
re-derives against. #1114 additionally recuts `clara.create_prepayment_schedule_for` (0307:955-985)
and `clara.create_revenue_recognition_schedule_for` (0308:1506-1524). **The hard seam: L2 must not
pin `clara._obo_plan_core`, `clara.create_accounting_plan`, `clara._prepayment_plan_core` or
`clara._accrual_plan_core`, all of which L1 writes; and L1 must not pin the two schedule cores L2
writes.** L1 merges before L2.

**L3 is one lane because two tickets recut one validator.** #1067 and #1052 both recut
`clara._assert_claim_basis` (0301). #1067 is worse than filed: an empty `advance_allocations` array
sets `v_listed := false` at `packages/db/migrations/0301_staff_expense_claim_allocations.sql:570-571`
and the whole allocation-validation block at 583-644 is skipped, so a claim that also carries a valid
`advance_account_code` is admitted with no advance existence, ownership or cap check at all. That is
an authorisation gap, not a missing named reason. **Security. Opus, first in the lane.** #1052 is
confirmed live at 0301:753 and 791, which compare `btrim(person_label)` with no `lower()`, and
`apps/web/components/accounting/staff-expense-claim-form.tsx:704-705`, which renders no source
enrolment. #1066 rides #1052's web half (the chooser filter at
`staff-expense-claim-form.tsx:263-267`). #1068 is a different file
(`apps/web/lib/work/staff-expense-claim.ts:283-284` returns the pre-#931 literal field id
`"advanceId"` when the list is empty). #1049 retires the whole label arm and so must come last.

**L4 owns two shared files by itself.** #1060 is the only ticket in the wave that edits
`apps/web/lib/navigation/tree.ts`, and #1048 is the only ticket that adds a row kind to
`apps/web/lib/firm/needs-you.ts` (a seventeenth, beside the sixteen at lines 198-305). #1061 is a
registry re-derivation: `packages/db/migrations/0296_payroll_summary_typed_facts.sql:2340-2347` still
pins `business_operation = 'stored_only'` for the six payroll pairs, and neither 0297 nor 0298
touches `clara.document_capabilities` at all, so the claim outlived the build. #1048 is the accounting
judgement of the lane: it decides what counts as a posting basis for an unattended payroll post, and
a new witness field read off the page needs `clara.evaluate_payroll_run_state_v2`, because 0296:710
freezes v1. **Opus.**

**L5 groups three themes that share no body.** #1056 widens the revisable-field predicate
(`clara._revisable_invoice_field`, `packages/db/migrations/0217_document_source_revision.sql:473-481`,
mirrored by hand in `apps/web/components/documents/document-revision-dialog.tsx:48-56`) and must
define what a revision does to an already-posted payroll run, which is an accounting question.
**Opus.** #1090 and #1092 must be ordered: both land in the same not-yet-built proposal
input-loading step, #1090 catalogues the knowledge key (`clara.knowledge_keys` holds fourteen rows
today, seeded by 0192 and 0240) and #1092 opens the read. #1092 grants `clara_agent_ro` SELECT and a
row-level-security policy on `clara.fa_account_depreciation_policies`, whose only read policy today
is `p_fadp_human` for `clara_authenticated`
(`packages/db/migrations/0277_fa_default_depreciation_policy.sql:297-308`). That widens a runtime
credential onto client tax data. **Security. Opus.** #1093 is a different file entirely
(`apps/web/lib/registers/fa-particulars-proposal.ts`, the web-side twin) and carries no database
work.

**L6 writes no database object at all**, which makes it the one lane that can run on any base and
merge in any order. #1044 is live by the repository's own admission:
`packages/runtime/README.md` near line 1874 says two writers still race on the rename and names
#1044 as the defect, and `packages/runtime/lib/spool.mjs:207-209` says a hard guarantee needs real
locking or a compare-and-swap. No cell exercises the interleave. **A lost update under concurrency.
Opus.**

**L7 is the hygiene lane.** #1047 is its largest item and the one to start on, because its scope must
be re-derived before anything is written (see the risks). #1098 is a production backfill over every
already-committed firm-setup plan: `packages/db/migrations/0311_firm_setup_tin_required.sql`
contains no plan-item backfill, and `clara.seed_firm_setup_plan` is never re-run against a committed
plan, so the dead end #1032 exists to remove still applies to every firm that finished setup first.
Touching every firm's committed onboarding plan is a data-integrity judgement. **Opus.** #1046 must
disable and re-enable the append-only trigger inside its own migration, which
`packages/db/migrations/0309_invite_preview_public_door.sql:170-177` states in its own header.

**L8 cannot start until the cut phase merges**, because both its tickets land tools in
`chatTurn_v22`, which does not exist yet. Confirmed: `packages/runtime/workflows/registry.ts:220`
still reads `chatTurn_v21` and line 346 reads `claraWork_v5`; `CUT-PLAN.md:515-516` names the
successors. Both branches `riders/wC-lane01` and `riders/wC-lane02` exist but carry **zero commits**
(`git log --oneline main..riders/wC-lane01` is empty), so the cut phase has not started work.
L8 owes one agent-granted twin per door, each tenant-walled:

- `clara.list_review_queue(jsonb,jsonb,integer)` is `clara_authenticated` only, and
  `packages/db/migrations/0011_daily_loop.sql:4210-4213` asserts `clara_agent_ro` must NOT hold it.
- `clara.get_payroll_settlement_candidates(uuid)` is `clara_authenticated` only
  (`0298:326`).
- `clara._agreement_posting_verdict(uuid)` is granted to nobody at all (`0299:2597` revokes from
  public); it is reached only through the security-definer body and through
  `clara.list_review_queue`'s spliced projection.
- The ten tenancy doors of 0300 are all `clara_authenticated` only. #1137 needs twins for two reads,
  `get_contract_terms` (0300:600) and `get_rent_settlement_candidates` (0300:1974).

The two tenancy confirmations are held on the owner's ruling and are not in L8's list until it lands.

## Shared files

| file | lanes that edit it | the rule for this wave |
|---|---|---|
| `apps/web/messages/en.json` | L1, L2, L3, L4, L5, L7 | Append your keys at the sorted position inside your own section. Never re-serialize the file: wave 4's #945 produced about 630 lines of churn doing that, and its own fix round had to rebuild the file from its base bytes. Scan for a duplicate key with an independent scanner, not `JSON.parse`, which drops a second copy in silence. |
| `apps/web/lib/firm/needs-you.ts` | **L4 only** | Sixteen row kinds today (lines 198-305). Only #1048 adds a seventeenth. L1's #1073 adds a third remedy button and edits `needs-you-affordances.tsx`, never the roster. A new row kind has five sync points, named in the file's own extension note at lines 129-148. |
| `apps/web/lib/navigation/tree.ts` | **L4 only** (#1060) | One key added to the bank entry at line 380. |
| `apps/web/test/manifest.txt` | L1, L2, L3, L4, L5, L7 | One line per new test file, at the sorted position. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | L1 primarily; any lane whose migration moves a pinned file | 34 pins today, each a sha256 over a migration file's content. L1's #1051 must reconcile with the `clara.create_accounting_plan` barrier entry at line 352. Wave 4, rule 7: **a lane's recheck includes this corpus whenever a migration file changed, even a comment.** |
| `packages/db/README.md` | L1, L2, L3, L4, L5, L7, L8 | Your own new `## NNNN` section only. Never edit an existing section; applied migrations and their sections are immutable, and a correction goes in the new file's own section. |
| `packages/db/tests/rig-meta.mjs` | L1, L3, L4, L5, L7, L8 | One cohort entry per migration that mints a new name. |
| `packages/db/package.json` (the `$GATES` list) | any lane adding a preintegration gate | Minimal hunk, sorted position. |
| `packages/db/tests/` six census files | **L7** (#1047), cross-checked against L1 | `coa-template-pr-b`, `firm-document-limits-writer`, `firm-portfolio-pack`, `plan-overlap-template-arm-retired`, `preview-invite`, `subledger-hook-caller-roster`. `plan-overlap-template-arm-retired` is plan family, which L1 also works; the merger reads the two sides against each other. |
| `packages/runtime/lib/runtime-contracts.mjs` | L6 (#1129), L8 (if a twin adds a roster entry) | L8 runs later and recuts from L6's post-image. |
| `packages/runtime/lib/rollback-preflight.mjs` | **L6 only** (#1129, #1131, in that order) | Two tickets, one file, one lane. |
| `.github/workflows/ci.yml`, `.github/actions/*` | **L6 only** (#1126, #1131, and #1127 if ruled) | |
| `docs/plan/active/riders-2026-09-20/RIG.md` | **L6 only** (#1124) | |
| `frozen-workflows.json` | **L8 only** | 325 entries today. The cut phase mints the `chatTurn_v22` and `claraWork_v6` entries; L8 adds its tools into them, after the cut merges. |
| `CONTEXT.md` | L3, only if #1049 stays in the wave | A staff person record is a new domain entity and owes a CONTEXT entry. |

## Owner questions, with a recommended ruling

Fourteen. Eleven were filed as `needs-info`; three (**#1050**, **#1058**, **#1065**) are raised by
this scan because the code disagrees with the ticket. Eleven can be closed by a ruling with no build
at all. Three turn into build work if ruled the way this plan recommends, and each says which lane it
would join.

| # | the question, in one sentence | the recommended ruling, in one sentence | cost if ruled this way |
|---|---|---|---|
| **#1050** | The ticket says the member who enabled `close_prep` for the firm is the wake plan's directing human, but `close_prep` is an estate-wide, operator-only switch with no per-firm enabling member. | Do not build as filed; re-brief it so a named member of the firm takes a firm-level standing instruction ("let Clara establish prepayment schedules at close"), which keeps the rule that nothing is admitted on the agent's own authority and keeps the feature usable rather than dark. | Held out of the wave. If re-briefed and ruled, it joins **L2** last, and its `authority_kind` CHECK widening is coordinated with L1. |
| **#1058** | Should `clara.entry_post_receipts.via_wake_kind` be renamed now that it also carries non-wake posting lanes? | No; correct the column's own comment and the README instead, because the name appears in 118 source files and in nine frozen workflow files, three of which carry prose about this very column that can never be corrected, while two build SQL naming a `p_via_wake_kind` parameter of a different door that must keep its spelling. | A one-line `comment on` migration plus a README section, in **L7**, instead of a 118-file rename. |
| **#1065** | Should `operating_lease` be admitted into the tenancy treatment? | Not yet; the ticket's own first acceptance criterion needs a real operating-lease document that does not exist, so keep it open and out of this wave until one is supplied. | No build. Ask the owner for a sample page. |
| #1049 | Staff master: sweep wave or mainline? (the ticket itself asks) | Mainline; a new client-scoped person entity with a data backfill is domain work, not a follow-up fix, and #1052 is the correct stopgap in the meantime. | Sheds **L3**'s tail and one migration. |
| #1063 | Allocating a financed agreement's printed finance charge over its term: sweep wave or mainline? | Mainline; it is a new periodic-posting lane under MPERS 20 and MFRS 16, not a follow-up, and it would build on the very plan bodies L1 is recutting. | Sheds **L5**'s tail and one migration. |
| #1054 | Does the PRD's deferred dedicated-payroll-receipt line survive #926's ruling? | Keep it; a MyInvois-submitted payroll receipt is a different channel from reading an uploaded payslip, and revisit at the next whole review of the PRD's e-invoicing section. | No build. |
| #1055 | Does a payroll summary need its own egress consent purpose? | Keep reusing the document-reading consent; minting a new purpose needs a CHECK, a capture surface and an activation act, and until all three exist the payroll lane is dark for every firm, against the standing beta ruling. | No build. |
| #1057 | Should a blocked payroll post become a first-class answerable question, should a cleared block re-fire the post, and are two Needs-you rows for one document acceptable? | Keep the derived-row, re-file-to-retry model for beta and revisit all three together once real bookkeepers have used the inbox with several of this wave's row kinds live, because the three answers trade off against each other. | No build. |
| #1062 | Does a financed agreement's deposit deserve its own chart account? | Leave it on the general other-payables account; it is not incorrect, and the account code is resolved from the chart rather than hardcoded, so a dedicated account can be added later without touching #948's posting logic. | No build. |
| #1064 | Is the agreement duplicate guard's (financier, signing date, cash price) match too broad? | Keep it for beta; a false positive costs one adjudication click and a false negative silently double-posts an acquisition. | No build. |
| #1072 | Is the per-period accrual's final-period remainder rule scoped correctly? | Confirm the narrow reading, which is tested in both directions, and record the confirmation on the ticket. | No build beyond one documentation line. |
| #1076 | What should a replacement prepayment or deferred-revenue schedule derive from after a term correction? | The remaining un-amortised balance, with a human-only door first and an OBO twin only after the human door has seen real use. | Ruled here, built later; it is a new door, not a sweep item. |
| #1078 | Should chart-account deactivation exist, and should the prepayment roster reserve its enrolled accounts? | Treat `account_inactive` as a known harmless dead axis for chart accounts, and yes to the roster reservation, so the prepayment roster reserves its codes the way its fixed-asset and staff-advance siblings already do. | The reservation half joins **L2** as a conditional rider, one migration. |
| #1081 | Should the prepayment OBO entrance take the human door's nested plan receipt? | Leave the asymmetry; it is deliberate and documented, and the fix is small and well understood whenever a feature actually reports on plan-level receipts. | No build. |
| #1082 | Does Clara open a zh locale for UI chrome? | Defer until a real Malaysian firm asks; five wave-4 tickets hit the same wall, but the cost so far falls on the build process rather than on any user. | No build. This ticket stays open as the single place future tickets point at. |
| #1127 | Is anyone reading the weekly scheduled CI dispatch's result? | Wire its failure to a visible notification, because this wave's evidence is that two number-moving changes went unnoticed for a stretch, which only happens if nobody reads it. | Joins **L6** as a conditional rider, no migration. |
| #1137 (half) | May Clara confirm a tenancy rent plan on a bookkeeper's behalf from the conversation? | Yes, as an OBO twin in #915's shape, because the person still confirms and the act is recorded as theirs. | Adds two migrations to **L8**. |

## Risks

**1. The plan machinery is one body family and three lanes want it.** L1 recuts the authority wall
(`clara.create_accounting_plan`, `clara._obo_plan_core`, `clara._accrual_plan_core`) and the
occurrence-admission body (`clara._plan_admit_occurrence`). L2's two schedule cores call into those
bodies. L5's #1063, if it stays, would build a fourth periodic posting lane on top of them. This is
wave 4's lesson 3 exactly: a lane can be green and still be wrong about a body another lane owns, and
no cell on either branch alone catches it. Mitigation, all of which must be in the lane prompts:
L1 merges first; L2 and L5 recut from L1's post-image; no lane pins a body another lane writes (the
two exclusion lists are written out under L1 and L2 above); #1063 stops and defers to the mainline if
it finds it needs a shared plan body; and the merger reads L1's and L2's migration files against each
other rather than trusting either branch's own green.

**2. #1050's design premise is false, and building it as filed would bind the wrong human.**
`clara.wake_engine_sources` is a single global row keyed by `source_key`
(`packages/db/migrations/0133_g1_wake_engine.sql:204-239`), flipped operator-only by
`clara.set_wake_source_enabled`, whose own comment at lines 337-341 calls it an estate-wide switch
that changes every firm's automation posture the instant it commits. Worse, the broadcast audit row
sent to every other firm deliberately carries `actor = NULL` (lines 353-358), because a receiving
firm has no need to know which operator flipped an estate-wide switch. So for every firm except the
operator firm there is no enabling member and no audit row naming one. A worker who takes the ticket
literally either fails to find the member or points `authorised_by` at a BELCORT operator, which
would make one operator the named directing human for automated postings in every firm's books. The
ticket must be re-briefed before anyone touches it, and this plan holds it out of the lane table.

**3. #1047's scope is not the number the ticket states, and the lane must re-derive it first.** The
ticket says 68 collation-dependent pinned-digest sites across about 20 migrations and six test files,
citing the pre-step fix report's audit table. A strict reproduction on main, counting a text
`order by` in a block that also holds a 64-hex literal, finds roughly 37 sites across 16 migration
files and one test file, because several of the audited files pin md5 (32 hex) or pin a count rather
than a sha256 adjacent to the ordering. The audit's own count is broader than the ticket's
restatement of it. The consequence is that a worker sizing the job from the ticket will either
under-build or spend the cycle rediscovering the list. **The lane's first act is to re-derive the
site list from the audit table in `reports/wave4-prestep-chart-fix.md` and record the count it will
actually work.** The ticket's own acceptance criterion also forbids editing applied migrations, so
for each site in an applied migration the lane either proves the ordering cannot flip and records
that, or adds one forward re-pin; the report's own empirical finding at lines 458-462 is that no
migration pin in the estate flips today, which supports the prove-and-record branch and keeps the
contingency migration at one.

## Preconditions before launch

- **The rig is stale.** Main now carries 309 migration files to `0318`, while the lane databases sit
  at their wave-4 lane states and lanes 01 and 02 are held by the cut phase. Every sweep lane needs
  its cluster dropped, recreated and migrated from scratch to the wave's base, and the base itself
  depends on whether the cut phase has merged. L1 to L7 cut from `main`; **L8 cuts from the merged
  cut-phase head**, not from main.
- **Worktrees.** `clara-wt/635` and `clara-wt/636` are held by `riders/wC-lane01` and
  `riders/wC-lane02`. The seven code lanes use `642`, `651`, `655`, `656`, `657`, `658`, `659`.
  `clara-wt/660` and `clara-wt/int` stay free, and `clara-wt/int2` stays with the integrator. L8
  reuses `clara-wt/635` once the cut phase releases it.
- **Numbering.** The cut phase reserves `0319` to `0322` (`CUT-PLAN.md:729, 772`), of which `0319`
  and `0322` are expected unused. The sweep wave starts at `0330`, which leaves the gap wave 4's own
  numbering convention asks for. The orchestrator assigns every number, including every overflow
  number, on request.
- **Rulings owed before a lane starts.** L2 cannot admit #1078's rider until it is ruled; L3's and
  L5's tails (#1049, #1063) and L6's rider (#1127) each need a one-line ruling; L8 cannot build the
  tenancy confirmations until #1137's half is ruled. None of these blocks a lane from starting.

## Overflow ledger (assigned by the orchestrator during the run)

| number | lane | purpose | assigned |
|---|---|---|---|
| 0360 | L5 fix round | #1056: the truthful ready sentence after a fact correction (ADV-L05-01) and the already-posted refusal message (SPEC-1056-A) | 2026-09-25 |
| 0361 (`0361_reservation_release_advice`) | L2 fix round | L02-SPEC-01 (clara._draft_opening_item_core reports a prepayment claim with a remedy that can release it), STD-1 (one shared clara._reservation_release_advice map), ADV-L02-10 (deterministic order by on the claim census read) | 2026-09-25 |
