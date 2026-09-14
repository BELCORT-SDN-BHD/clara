# Follow-up issues filed — refresh wave 2026-09-14

Filed from the LIVE STATE step-5 list, the original handoff's step-6 list, and the "Follow-ups" /
"SHOULD" / "NOTE" / "Residual" sections of every fix-round and review report in this directory.
Searched `gh issue list --state open --search "<keywords>"` per item before filing; no true
duplicates found (only broad hits on the umbrella spec issues #612/#597, which are parent tickets,
not the specific follow-up).

| # | Title | Label |
|---|---|---|
| [#770](https://github.com/BELCORT-SDN-BHD/clara/issues/770) | Add a p_work door filter for list_activity used by the Work Activity tab | needs-triage |
| [#771](https://github.com/BELCORT-SDN-BHD/clara/issues/771) | shadcn PaginationLink renders role="button" on an `<a>` element | needs-triage |
| [#772](https://github.com/BELCORT-SDN-BHD/clara/issues/772) | Guard the shadcn component installer from overwriting reviewed a11y fixes | needs-triage |
| [#773](https://github.com/BELCORT-SDN-BHD/clara/issues/773) | rig-isolation.test.mjs T19 can destroy a shared rig with CLARA_RIG_ALLOW_RESET=1 | needs-triage |
| [#774](https://github.com/BELCORT-SDN-BHD/clara/issues/774) | Pin the operator support queue's arm-1 intent tie-break with a dedicated test cell | needs-triage |
| [#775](https://github.com/BELCORT-SDN-BHD/clara/issues/775) | resolve_stripe_event_problem writes no operator audit row | needs-triage |
| [#776](https://github.com/BELCORT-SDN-BHD/clara/issues/776) | Operator support console shows the applicant only as a raw uuid, never a name | needs-triage |
| [#777](https://github.com/BELCORT-SDN-BHD/clara/issues/777) | Move out-of-grammar field_path test fixtures to pages.1.lines.N | needs-triage |
| [#778](https://github.com/BELCORT-SDN-BHD/clara/issues/778) | No unique index on document_regions(extraction_id, field_path) | needs-triage |
| [#779](https://github.com/BELCORT-SDN-BHD/clara/issues/779) | document_capabilities.registry_version monotonicity is convention, not a DB constraint | needs-triage |
| [#780](https://github.com/BELCORT-SDN-BHD/clara/issues/780) | 0191's own migration tail still pins document_fact_validations RLS by policy count, not by row | needs-triage |
| [#781](https://github.com/BELCORT-SDN-BHD/clara/issues/781) | OFX statement intake has no real parser; capability is unenforced-honest at best | needs-triage |
| [#782](https://github.com/BELCORT-SDN-BHD/clara/issues/782) | Invoice line items remain unimplemented (out of #624's scope) | needs-triage |
| — | Work four-state surface in Work detail's Sources tab | **skipped** — already landed at integration (`integration/wave-2` commit `31544e74`, "feat(web): #624 AC4 — Work detail's Sources tab shows the four document states"); confirmed moot, not filed |
| [#783](https://github.com/BELCORT-SDN-BHD/clara/issues/783) | Decide whether get_knowledge_pack should have a human EXECUTE grant | needs-triage |
| [#784](https://github.com/BELCORT-SDN-BHD/clara/issues/784) | Four legacy readers still read client_facts directly instead of the unified knowledge pack | needs-triage |
| [#785](https://github.com/BELCORT-SDN-BHD/clara/issues/785) | No runtime-callable door to withdraw a knowledge fact | needs-triage |
| [#786](https://github.com/BELCORT-SDN-BHD/clara/issues/786) | Build the reassessment consumer for knowledge.corrected/knowledge.withdrawn | needs-triage |
| [#787](https://github.com/BELCORT-SDN-BHD/clara/issues/787) | A human reversing an accrual's entry between reversal admission and posting creates a phantom reversal | needs-triage |
| [#788](https://github.com/BELCORT-SDN-BHD/clara/issues/788) | 0045 recurring-journal templates and 0193 accounting plans can both post the same period | needs-triage |
| [#789](https://github.com/BELCORT-SDN-BHD/clara/issues/789) | attempts/reverses_entry_id/period_key reach the web types but nothing renders them | needs-triage |
| [#790](https://github.com/BELCORT-SDN-BHD/clara/issues/790) | OWNER DECISION: accounting-plans bookkeeper floor vs the two-signature 0045 adjustment lane | needs-info |
| [#791](https://github.com/BELCORT-SDN-BHD/clara/issues/791) | claraWork.v2.bundle.ts manifest hash omits tool schemas and dependencies (AC1 partial) | needs-triage |
| [#792](https://github.com/BELCORT-SDN-BHD/clara/issues/792) | WDK still crash-loops (ReplayDivergenceError -> exit 1) on an unrunnable parked run | needs-triage |
| [#793](https://github.com/BELCORT-SDN-BHD/clara/issues/793) | OWNER DECISION: World guard's stranded-body refusal is database-wide, wider than #637 alone | needs-info |
| [#794](https://github.com/BELCORT-SDN-BHD/clara/issues/794) | A chatTurn v18->v19 two-build drill needs a real edit; it is not free like claraWork's | needs-triage |
| [#795](https://github.com/BELCORT-SDN-BHD/clara/issues/795) | Runtime tests still cite the non-existent "ARCHITECTURE Appendix A" | needs-triage |
| [#796](https://github.com/BELCORT-SDN-BHD/clara/issues/796) | chatTurn_v19's periodic-adjustment schema cannot name a staff-advance account | needs-triage |
| [#797](https://github.com/BELCORT-SDN-BHD/clara/issues/797) | Store the payroll settlement split (settled_cents) as a stored particular | needs-triage |
| [#798](https://github.com/BELCORT-SDN-BHD/clara/issues/798) | Sweep the marginal real-timer web unit cells flaking under whole-suite load | needs-triage |
| [#799](https://github.com/BELCORT-SDN-BHD/clara/issues/799) | A commit-time chart-of-accounts refusal on a periodic adjustment names lines[N].account_code, not the form's own field | needs-triage |
| [#800](https://github.com/BELCORT-SDN-BHD/clara/issues/800) | Consider per-purpose egress tokens instead of the one coarse accounting_work token | needs-triage |
| [#801](https://github.com/BELCORT-SDN-BHD/clara/issues/801) | clara.consume_firm_egress_dispatch does not exist (C-20 finding) | needs-triage |
| [#802](https://github.com/BELCORT-SDN-BHD/clara/issues/802) | Execution trace export route stays disabled; no human/operator export path exists | needs-triage |
| [#803](https://github.com/BELCORT-SDN-BHD/clara/issues/803) | work-question-e2e leg 5 (two-engine lease contention) flaked once under Windows host load | needs-triage |
| [#804](https://github.com/BELCORT-SDN-BHD/clara/issues/804) | signIn cold-server flake in the browser e2e suite | needs-triage |
| [#805](https://github.com/BELCORT-SDN-BHD/clara/issues/805) | personal-settings keyboard-complete walk flakes intermittently | needs-triage |
| [#806](https://github.com/BELCORT-SDN-BHD/clara/issues/806) | Runtime test suite needs pg_dump on the host; several files red on Windows without it | needs-triage |

**Totals**: 37 filed (35 `needs-triage`, 2 `needs-info` — #790 bookkeeper floor, #793 World guard
blast radius, both owner decisions per the source reports' own instruction), 1 skipped as moot
(Work four-state surface, already shipped at integration). No assignees set on any issue.
