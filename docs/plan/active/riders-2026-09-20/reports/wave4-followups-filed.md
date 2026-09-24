# Riders wave 4, sweep follow-ups filed

Source: `INDEX.md`, section "Follow-ups the reports name that have no ticket number yet" (the closures
folder), cross-checked against each named report file under this `reports/` directory, and reconciled
against the live GitHub state of every issue numbered 1054 and above on 2026-09-25. Every issue body
opens with the AI-triage disclaimer, cites its source report and originating ticket, carries no em
dashes, and ends with "Sweep wave after riders wave 4." Labels follow the triage skill's roles
(`bug`/`enhancement` plus `ready-for-agent`, or `needs-info` for an owner question).

Already-filed before this pass, not duplicated: #1044, #1046, #1047, #1048, #1049, #1050, #1051,
#1052.

## The collision and the dedupe

Two triage workers filed the same wave-4 follow-up list concurrently on 2026-09-25, each independently
drafting one ticket per INDEX item across lanes 01-07. This produced 81 issues (#1054-#1134) for what
is really 45 distinct follow-ups. The orchestrator ran a dedupe pass and closed 36 of the 81 as
duplicates, each with a comment reading "Duplicate of #N: two triage workers filed the same wave-4
follow-up list concurrently on 2026-09-25; #N is the surviving ticket and carries the brief. Closing
this copy as not planned," reason `not planned`. In every one of the 36 closures verified here, the
surviving ticket is the lower-numbered of the pair: one worker's numbers (roughly #1054-#1099, using a
backtick-quoted `Source:` line citing a specific follow-up number, for example "follow-up 2") survived,
and the other worker's numbers (roughly #1082-#1134, using a plain `Source:` line without backticks)
were closed into them. The one exception to that clean split is lane 07 (#1041, #1035, #1033, #877):
only one worker filed lane-07 follow-ups, so none of #1124, #1126, #1127, #1128, #1129, #1131, #1132
has a duplicate to close against. The zh-locale bundle (#1082) and the lane-04 CLR10 pair (#1077 and
#1114, see "Possible missed duplicate" below) are also exceptions worth a second look.

## Every OPEN follow-up (45)

### Lane 01 (#944-#949) — 13 open

| # | Labels | Title | Originating ticket | INDEX item |
|---|---|---|---|---|
| [#1054](https://github.com/BELCORT-SDN-BHD/clara/issues/1054) | needs-info | Owner question: does a dedicated payroll e-invoice receipt channel still belong in the PRD's deferred list after #926's ruling? | #944 | Routing #612/#643's exclusion wording and `docs/PRD.md:127` against #926's ruling |
| [#1055](https://github.com/BELCORT-SDN-BHD/clara/issues/1055) | needs-info | Owner question: does a payroll summary need its own egress consent purpose, separate from the shared document-reading consent? | #945 | A payroll-specific egress consent purpose vs. reusing `witness_extraction` |
| [#1056](https://github.com/BELCORT-SDN-BHD/clara/issues/1056) | enhancement, ready-for-agent | Let a person correct a misread payroll fact through the document Revise control | #945 | A payroll-aware Revise control for a mis-read payroll total |
| [#1057](https://github.com/BELCORT-SDN-BHD/clara/issues/1057) | needs-info | Owner question: should a blocked payroll post become a first-class answerable question, and can a cleared block re-fire the post? | #946 | A first-class `open_questions` row vs. the derived Needs-you "asks" row, and a "post it now" re-fire door once a block clears |
| [#1058](https://github.com/BELCORT-SDN-BHD/clara/issues/1058) | enhancement, ready-for-agent | Rename entry_post_receipts' authorisation-kind column now that it also carries non-wake posting lanes | #946 | Renaming `entry_post_receipts.via_wake_kind` |
| [#1059](https://github.com/BELCORT-SDN-BHD/clara/issues/1059) | enhancement, ready-for-agent | Give a wrongly accepted payroll net-pay settlement an explicit reopen path | #947 | An explicit re-open/undo path for a wrongly accepted settlement |
| [#1060](https://github.com/BELCORT-SDN-BHD/clara/issues/1060) | enhancement, ready-for-agent | Add a bank Matching-tab deep link, and share the FIFO settlement-candidate read once a fourth instance appears | #947, #949 | A symmetric bank matching-tab entry in `lib/navigation/tree.ts`, and a `clara._account_fifo_unsettled(...)` extraction once a fourth FIFO-settlement instance appears |
| [#1061](https://github.com/BELCORT-SDN-BHD/clara/issues/1061) | bug, ready-for-agent | Capability registry still publishes business_operation=stored_only for payroll summaries after they started posting | #948 (about #946's registry row) | #946's own payroll capability row still reading `business_operation = stored_only` |
| [#1062](https://github.com/BELCORT-SDN-BHD/clara/issues/1062) | needs-info | Owner question: does a financed agreement's deposit deserve its own deposit-clearing chart account? | #948 | A dedicated deposit-clearing chart account |
| [#1063](https://github.com/BELCORT-SDN-BHD/clara/issues/1063) | enhancement, ready-for-agent | Allocate a financed agreement's printed finance-charge schedule over its term, past day-one acquisition | #948 | Allocating the printed finance-charge schedule past day-one acquisition |
| [#1064](https://github.com/BELCORT-SDN-BHD/clara/issues/1064) | needs-info | Owner question: is the agreement duplicate guard's (financier, signing date, cash price) match too broad? | #948 | The duplicate guard's third-scope judgement |
| [#1065](https://github.com/BELCORT-SDN-BHD/clara/issues/1065) | enhancement, ready-for-agent | Admit operating_lease as a tenancy-lane agreement class once a real example page exists | #949 | `operating_lease` not admitted pending a real example page |
| [#1082](https://github.com/BELCORT-SDN-BHD/clara/issues/1082) | needs-info | Decide whether Clara opens a zh locale for UI copy (#940, #941, #942, #947, #949 all deferred their zh copy) | #940, #941, #942, #947, #949 | Owner confirmation of the "en and zh copy" reading, shared across #947, #949, #940, #941, #942 (the cross-lane zh-locale bundle) |

### Lane 02 (#930, #931) — 4 open

| # | Labels | Title | Originating ticket | INDEX item |
|---|---|---|---|---|
| [#1066](https://github.com/BELCORT-SDN-BHD/clara/issues/1066) | bug, ready-for-agent | Staff expense claim: the advance chooser is scoped to one account, and the second-account match is a brittle exact-label comparison | #930, #931 | The claim form's advance chooser scoped to the claimant's own account, bundled with an advance on a second enrolled account refused with a misleading `not_this_client` reason |
| [#1067](https://github.com/BELCORT-SDN-BHD/clara/issues/1067) | bug, ready-for-agent | Database claim door should explicitly refuse an empty advance_allocations array | #930, #931 | The door accepting an empty `advance_allocations` array while the runtime route refuses it |
| [#1068](https://github.com/BELCORT-SDN-BHD/clara/issues/1068) | bug, ready-for-agent | Emptying a staff expense claim's allocation list points the advance-required validation at a missing DOM control | #930, #931 | Removing every allocation row leaves the `advanceRequired` validation addressed to a DOM control that no longer exists |
| [#1069](https://github.com/BELCORT-SDN-BHD/clara/issues/1069) | enhancement, ready-for-agent | Show an allocation count on the Work list card for a multi-advance staff expense claim | #931 | `clara.get_work_claim_origin` not carrying an allocation count on the Work list card |

### Lane 03 (#937, #938, #942) — 6 open

| # | Labels | Title | Originating ticket | INDEX item |
|---|---|---|---|---|
| [#1070](https://github.com/BELCORT-SDN-BHD/clara/issues/1070) | enhancement, ready-for-agent | Accrual detail view does not render per-period amounts or which side the accrual runs | #937, #942 | The accrual detail surface does not render the per-period schedule or the side |
| [#1071](https://github.com/BELCORT-SDN-BHD/clara/issues/1071) | enhancement, ready-for-agent | Accrual register's Amount column does not say whether it is a per-period figure or a window total | #937 | `clara.list_accrual_adjustments` does not distinguish a per-period figure from a window total |
| [#1072](https://github.com/BELCORT-SDN-BHD/clara/issues/1072) | needs-info | Owner question: is the per-period accrual's final-period remainder rule scoped correctly? | #937 | Whether the final-period remainder rule's narrow reading is correct, an owner-grill question |
| [#1073](https://github.com/BELCORT-SDN-BHD/clara/issues/1073) | enhancement, ready-for-agent | Add a third accrual/bill-conflict remedy: a correcting journal entry scoped to one period | #938 | A third #938 remedy: "reverse this period with a journal entry of its own" |
| [#1074](https://github.com/BELCORT-SDN-BHD/clara/issues/1074) | bug, ready-for-agent | A correction landing between a posted accrual occurrence and its reversal strands a balance | #942 | A pre-existing defect where a correction landing between a posted accrual and its reversal strands a balance |
| [#1075](https://github.com/BELCORT-SDN-BHD/clara/issues/1075) | enhancement, ready-for-agent | Make the accrual register's side filter server-side ahead of pagination | #942 | Making the accrual register's side filter server-side if it ever paginates |

### Lane 04 (#939, #940, #915, #941, #1036) — 7 open

| # | Labels | Title | Originating ticket | INDEX item |
|---|---|---|---|---|
| [#1076](https://github.com/BELCORT-SDN-BHD/clara/issues/1076) | needs-info | Owner question: what should a replacement prepayment/deferred-revenue schedule derive from after a term correction? | #939, #941 | The term-correction door's own residuals: a web UI control for `replace_prepayment_schedule`/`replace_revenue_recognition_schedule`, an OBO twin for the correction door, a failed Work month not re-spread |
| [#1077](https://github.com/BELCORT-SDN-BHD/clara/issues/1077) | enhancement, ready-for-agent | A reused op key across the prepayment and deferred-revenue lanes collides and answers an untyped CLR10 | #941 (ADV-07 finding) | ADV-07: an untyped CLR10 when the nested `:plan` op-key namespace collides across the prepayment and revenue lanes |
| [#1078](https://github.com/BELCORT-SDN-BHD/clara/issues/1078) | needs-info | Owner question: should chart-account deactivation exist, and should the prepayment roster reserve its enrolled accounts? | #940 | `account_inactive` unreachable through any governed chart-account door, and the roster not part of `clara._acct_role_reserved` |
| [#1079](https://github.com/BELCORT-SDN-BHD/clara/issues/1079) | bug, ready-for-agent | Rename the Prepayment accounts panel heading now that it administers both prepayment and deferred-revenue purposes | #941 | The Prepayment accounts panel's heading now covering both purposes but still saying "Prepayment accounts" |
| [#1080](https://github.com/BELCORT-SDN-BHD/clara/issues/1080) | bug, ready-for-agent | Accrual OBO plan authority still uses the pre-#977 exists-probe check instead of the shared authority-refusal wall | #915, #1036 | `clara._accrual_plan_core` stale against #977/0250, belongs to #652's own lane, named by both #915 and #1036 |
| [#1081](https://github.com/BELCORT-SDN-BHD/clara/issues/1081) | needs-info | Owner question: should the prepayment schedule's OBO entrance take the same nested plan receipt the human door does? | #915 | The human door's nested `:plan` reservation has no OBO counterpart |
| [#1114](https://github.com/BELCORT-SDN-BHD/clara/issues/1114) | bug, ready-for-agent | CLR10 is reused for an internal wiring error and a real prepayment/deferred-revenue refusal | #915, #940 | Not named as a separate bullet in the INDEX's condensed lane-04 paragraph; drawn directly by the filing worker from `wave4-lane04-ticket915.md` and `wave4-lane04-ticket940.md`. See "Possible missed duplicate" below. |

### Lane 05 (#933, #871) — 5 open

| # | Labels | Title | Originating ticket | INDEX item |
|---|---|---|---|---|
| [#1090](https://github.com/BELCORT-SDN-BHD/clara/issues/1090) | enhancement, ready-for-agent | Catalogue a depreciation-policy knowledge key so the fixed-asset proposal's client-knowledge ground can fire | #933 | The `client_knowledge` ground has no catalogued knowledge key |
| [#1092](https://github.com/BELCORT-SDN-BHD/clara/issues/1092) | enhancement, ready-for-agent | Grant the runtime read role access to retired depreciation policies so the proposal's retired-policy ground can fire | #933 | The `retired_account_policy` ground is unreachable from the runtime's read credential |
| [#1093](https://github.com/BELCORT-SDN-BHD/clara/issues/1093) | enhancement, ready-for-agent | Depreciation-particulars proposal read: server-side filter, review-trail read, and completeness predicate cleanups | #933 | A narrower server-side `source_ref->>asset_id` filter, a "Clara proposed, who confirmed" review-trail read, and the `particulars_complete` predicate divergence plus missing `ref.kind` check (ADV-L05-09/SPEC-933-E) |
| [#1094](https://github.com/BELCORT-SDN-BHD/clara/issues/1094) | enhancement, ready-for-agent | Document that the auth-wall service token now gates three pre-session routes | #871 | A note for the ops runbook that the shared auth-wall service token now gates three pre-session routes |
| [#1095](https://github.com/BELCORT-SDN-BHD/clara/issues/1095) | enhancement, ready-for-agent | Render a Retry-After wait time when the signed-out invite preview is rate-limited | #871 | A per-route `Retry-After` that is computed but not rendered anywhere yet |

### Lane 06 (#1031, #1032, #1038) — 3 open

| # | Labels | Title | Originating ticket | INDEX item |
|---|---|---|---|---|
| [#1096](https://github.com/BELCORT-SDN-BHD/clara/issues/1096) | bug, ready-for-agent | Disclose (or fix) that 29 February outside a leap year still bypasses the financial-year-end pair check | #1031 | Tying the year-end pair to a specific year so 29 February can be judged against a real calendar |
| [#1098](https://github.com/BELCORT-SDN-BHD/clara/issues/1098) | bug, ready-for-agent | Backfill the TIN firm-setup item onto already-committed firm-setup plans | #1032 | A reopen or backfill path for a firm-setup plan already committed before #1032's migration |
| [#1099](https://github.com/BELCORT-SDN-BHD/clara/issues/1099) | enhancement, ready-for-agent | Restore op-key idempotence test coverage for a writer whose human grant is withdrawn | #1038 | A writer that keeps `clara._reserve_op` but loses its human grant should still be covered by the op-key idempotence law |

### Lane 07 (#1041, #1035, #1033, #877) — 7 open

| # | Labels | Title | Originating ticket | INDEX item |
|---|---|---|---|---|
| [#1124](https://github.com/BELCORT-SDN-BHD/clara/issues/1124) | enhancement, ready-for-agent | Catch stale @shadcn/react worktree installs before they look like a code failure | #1041 (also #930, #1031, #945, #933) | Worktrees may be missing `@shadcn/react` until `pnpm install --frozen-lockfile` runs; cross-lane bundle |
| [#1126](https://github.com/BELCORT-SDN-BHD/clara/issues/1126) | enhancement, ready-for-agent | Measure db-split-partition-total's declared cell-count floors instead of hand-declaring them, and record each leg's counts | #1041 | Measuring `db-split-partition-total`'s declared floors instead of guessing them, recording each leg's pass/fail/skip |
| [#1127](https://github.com/BELCORT-SDN-BHD/clara/issues/1127) | needs-info | Owner question: is anyone reading the weekly scheduled CI dispatch's result? | #1041 | Nobody appears to read the weekly dispatch schedule's result |
| [#1128](https://github.com/BELCORT-SDN-BHD/clara/issues/1128) | enhancement, ready-for-agent | Two lane-probe test-infrastructure traps: a stale in-flight-promise gap and a non-overridable heartbeat constant | #1033 | `_waitForLaneProbeSettleForTest()`'s stale in-flight-promise gap, and `HEARTBEAT_STALE_MS`'s module-load-time constant binding |
| [#1129](https://github.com/BELCORT-SDN-BHD/clara/issues/1129) | enhancement, ready-for-agent | Guard against a runtime-contract roster entry that never gets its frontier rule | #1035 | A rule row and its marker can be added independently with only one direction checked; a cheap guard cell suggested |
| [#1131](https://github.com/BELCORT-SDN-BHD/clara/issues/1131) | enhancement, ready-for-agent | Cover the rollback preflight's contract-refusal exit code in a regular gate, not only a hand-run drill | #1035 | The contract-refusal exit code has no cell reachable without a WDK World; the two-build cutover drill is the only executable proof and is not in the gate chain |
| [#1132](https://github.com/BELCORT-SDN-BHD/clara/issues/1132) | bug, ready-for-agent | clara.sweep_run_items.outcome has no admitted member, a trap for a future reader of admit_autodraft_task | #877 | `clara.sweep_run_items.outcome` has no `admitted` member and is written only at settle time |

## Every CLOSED duplicate (36)

Each closed with comment "Duplicate of #N ...", reason `not planned`. Survivor is always the
lower-numbered ticket.

| # | Survivor |
|---|---|
| [#1083](https://github.com/BELCORT-SDN-BHD/clara/issues/1083) | #1054 |
| [#1084](https://github.com/BELCORT-SDN-BHD/clara/issues/1084) | #1055 |
| [#1085](https://github.com/BELCORT-SDN-BHD/clara/issues/1085) | #1056 |
| [#1086](https://github.com/BELCORT-SDN-BHD/clara/issues/1086) | #1057 |
| [#1087](https://github.com/BELCORT-SDN-BHD/clara/issues/1087) | #1058 |
| [#1088](https://github.com/BELCORT-SDN-BHD/clara/issues/1088) | #1059 |
| [#1089](https://github.com/BELCORT-SDN-BHD/clara/issues/1089) | #1061 |
| [#1091](https://github.com/BELCORT-SDN-BHD/clara/issues/1091) | #1062 |
| [#1097](https://github.com/BELCORT-SDN-BHD/clara/issues/1097) | #1063 |
| [#1100](https://github.com/BELCORT-SDN-BHD/clara/issues/1100) | #1064 |
| [#1101](https://github.com/BELCORT-SDN-BHD/clara/issues/1101) | #1065 |
| [#1102](https://github.com/BELCORT-SDN-BHD/clara/issues/1102) | #1060 |
| [#1103](https://github.com/BELCORT-SDN-BHD/clara/issues/1103) | #1066 |
| [#1104](https://github.com/BELCORT-SDN-BHD/clara/issues/1104) | #1067 |
| [#1105](https://github.com/BELCORT-SDN-BHD/clara/issues/1105) | #1068 |
| [#1106](https://github.com/BELCORT-SDN-BHD/clara/issues/1106) | #1069 |
| [#1107](https://github.com/BELCORT-SDN-BHD/clara/issues/1107) | #1070 |
| [#1108](https://github.com/BELCORT-SDN-BHD/clara/issues/1108) | #1071 |
| [#1109](https://github.com/BELCORT-SDN-BHD/clara/issues/1109) | #1072 |
| [#1110](https://github.com/BELCORT-SDN-BHD/clara/issues/1110) | #1073 |
| [#1111](https://github.com/BELCORT-SDN-BHD/clara/issues/1111) | #1074 |
| [#1112](https://github.com/BELCORT-SDN-BHD/clara/issues/1112) | #1075 |
| [#1113](https://github.com/BELCORT-SDN-BHD/clara/issues/1113) | #1076 |
| [#1115](https://github.com/BELCORT-SDN-BHD/clara/issues/1115) | #1079 |
| [#1116](https://github.com/BELCORT-SDN-BHD/clara/issues/1116) | #1080 |
| [#1117](https://github.com/BELCORT-SDN-BHD/clara/issues/1117) | #1078 |
| [#1118](https://github.com/BELCORT-SDN-BHD/clara/issues/1118) | #1081 |
| [#1119](https://github.com/BELCORT-SDN-BHD/clara/issues/1119) | #1090 |
| [#1120](https://github.com/BELCORT-SDN-BHD/clara/issues/1120) | #1092 |
| [#1121](https://github.com/BELCORT-SDN-BHD/clara/issues/1121) | #1093 |
| [#1122](https://github.com/BELCORT-SDN-BHD/clara/issues/1122) | #1093 |
| [#1123](https://github.com/BELCORT-SDN-BHD/clara/issues/1123) | #1094 |
| [#1125](https://github.com/BELCORT-SDN-BHD/clara/issues/1125) | #1095 |
| [#1130](https://github.com/BELCORT-SDN-BHD/clara/issues/1130) | #1096 |
| [#1133](https://github.com/BELCORT-SDN-BHD/clara/issues/1133) | #1098 |
| [#1134](https://github.com/BELCORT-SDN-BHD/clara/issues/1134) | #1099 |

Note: #1093 absorbed two closed duplicates (#1121 and #1122). One worker split the depreciation-
particulars proposal cleanups into two tickets (an enhancement for the read/review-trail work, a bug
for the predicate divergence); the other worker filed it as one combined ticket, #1093, which is the
survivor for both.

## Items not filed (6)

| Item | Reason |
|---|---|
| `expense_account_code`/`liability_account_code` renaming (#942) | Carried by the `chatTurn_v22` cut |
| `ADV-01` wave-wide migration-collision shape (#938) | Explicitly a cross-lane integration check, "not a single ticket" |
| `skip_plan_occurrence`'s idempotency hash omitting reason text (#938) | Low-exposure note with no elaboration in the report to ground a fix |
| Migration `0317` shipping no rig-meta cohort (#939) | Explicitly the integrator's call at merge/renumbering time |
| Overlap-warning browser cell + `revenue-recognition-basis.ts` module (#941) | Explicitly riding the shared `chatTurn_v22`/`claraWork_v6` cut |
| #933's AC4 World e2e leg and AC1's question-wire join | Explicitly carried by the `claraWork_v6` cut's own work order |

## Possible missed duplicate

**#1077 and #1114 both touch the CLR10 errcode in the prepayment/deferred-revenue lanes and were both
left open, but a full read of both bodies finds they describe different defects, not the same item:**

- **#1077** ("A reused op key across the prepayment and deferred-revenue lanes collides and answers an
  untyped CLR10") is about the nested `:plan` idempotency-key namespace being shared between the two
  lanes: a caller that reuses an operation key across both lanes collides on that reservation and gets
  a plain CLR10 with no `detail.reason` to say it was a cross-lane key collision. Fix proposed:
  namespace the keys separately, or add a `detail.reason` to the reuse-detection raise.
- **#1114** ("CLR10 is reused for an internal wiring error and a real prepayment/deferred-revenue
  refusal") is about the same errcode being overloaded for two semantically different refusals: an
  internal-only `invalid_author` wiring error (never meant to reach a user) and the account-not-
  enrolled business refusal the web already renders with its own copy and remedy. Fix proposed: give
  the two raises distinct errcodes.

Both are real, both cite #915 and #940/#941, and both would touch the same catalog of CLR10 raises, so
they are worth reading together when someone picks up the sweep wave, but they are not literal
duplicates of each other. Flagging both numbers for a human decision rather than treating this as a
dedupe miss.

No other pair among the 45 open follow-ups was found to share a source citation or describe the same
defect; each open issue's `Source:` line names a distinct follow-up number (or finding ID) from a
distinct originating-ticket report, cross-checked against the INDEX's own lane paragraphs above.

## Final counts

| | Count |
|---|---|
| Open follow-ups filed this wave | 45 |
| Closed duplicates (from the concurrent filing collision) | 36 |
| Total issues created by both filers (45 + 36) | 81 |
| Not filed (disposition recorded, no ticket) | 6 |
| Sweep tickets already filed before this pass (#1044, #1046-#1052) | 8 |
| **Sweep-wave backlog (45 open follow-ups + 8 already-filed sweep tickets)** | **53** |
