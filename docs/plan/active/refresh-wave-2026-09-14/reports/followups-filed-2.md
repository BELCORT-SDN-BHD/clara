# Follow-up issues filed — refresh wave 2026-09-14 (round 2)

Filed from the wave-3 deliveries: `v19-final.md` ("Follow-ups worth filing" + "The census waiver" +
"What #637's v18→v19 drill needs"), `631-fixround.md` ("Assumptions, deviations, follow-ups"),
`631-review-recheck.md` ("New findings"), `631-review-migration.md` (N5/N6), `631-final.md`
("Follow-ups"). Searched `gh issue list --state open --search "<keywords>"` per item; deduplicated
against #770–#809 (filed earlier this session) and all other open issues.

| # | Title | Label |
|---|---|---|
| [#810](https://github.com/BELCORT-SDN-BHD/clara/issues/810) | OWNER RULING: retire chatTurn_v1's registry export so the get_journal_entry census waiver can die | needs-info |
| — | #637's chatTurn v18→v19 two-build drill (className through `rewriteRegistryToPrevious`/`buildPreviousVersionImage`, a `clarify`-hook resume leg) | **skipped — commented (#794)**: v19's precise mechanical findings added to the existing issue rather than opening a duplicate |
| — | `p6-1.db.freeform.read-id-high-sequence` needs a per-run id above the poison floor | **skipped — commented (#754)**: exact duplicate (root cause and proposed fix already match); added v19's independent re-confirmation |
| [#812](https://github.com/BELCORT-SDN-BHD/clara/issues/812) | Bound observed_revisions numeric values and the run id grammar by shape, not just length, in the trace door | needs-triage |
| [#813](https://github.com/BELCORT-SDN-BHD/clara/issues/813) | Add a restore door for deactivate_client_egress_purpose and recut 0020's one-terminal CHECK for withdrawal-reaches-consumed-authorization | needs-triage |
| [#814](https://github.com/BELCORT-SDN-BHD/clara/issues/814) | Run the provider-eval lane against a real provider and file its labelled report before #631 AC5 is called done | needs-triage |
| [#815](https://github.com/BELCORT-SDN-BHD/clara/issues/815) | RELEASE-TIMING: ship migration 0195 and the claraWork_v3 image together; run #637's preflight against that pair | needs-info |
| [#811](https://github.com/BELCORT-SDN-BHD/clara/issues/811) *(created before #812)* | Have check-frozen-workflows.mjs print the closure it locks, now that it hash-locks lib/knowledge.mjs, periodic-adjustment-basis.ts, capability-registry.mjs, and work-trace.mjs | needs-triage |

**Totals**: 6 filed (4 `needs-triage`: #811, #812, #813, #814; 2 `needs-info`: #810 owner ruling on
`chatTurn_v1` retirement, #815 owner ruling on release sequencing), 2 skipped as duplicates with a
comment added to the existing issue (#794, #754). No assignees set on any issue.

Note on numbering: issue #811 ("check-frozen-workflows closure") was filed immediately after #810,
before #812–#815; the table above is ordered to match the roster item numbering (1–8) from the
triage prompt rather than creation order.
