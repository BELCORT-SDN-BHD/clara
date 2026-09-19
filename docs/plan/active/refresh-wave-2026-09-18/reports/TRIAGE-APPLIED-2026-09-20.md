# Triage audit applied — 2026-09-20

The owner confirmed `TRIAGE-AUDIT-2026-09-19.md` on 2026-09-19 ("都听你的建办"; the `list_firm_timeline` retirement: "可以"). The audit's own §4 bodies were placeholders, so every text was written fresh by a worker, re-verified against `main` (`dc9acfe1`) by a second worker (77 of 82 texts corrected, one rejected), and posted by a deterministic script. This file is the record of what was posted.

**Held, not filed:** the trade-invoice duplicate-number guard (audit DRAFT-29). The owner is deciding it: the recommendation is a new follow-up that adds a warn-and-confirm probe at #655's admission door, not at #662.

## New issues filed (48)

| Audit draft | Issue | Labels | Title |
|---|---|---|---|
| DRAFT-1 | #956 | bug, ready-for-agent | use-clara-thread-stop.test.ts is a genuine, non-deterministic whole-suite flake in #630's lane |
| DRAFT-2 | #957 | enhancement, ready-for-agent | packages/db/scripts/migrate.mjs has no supported way to re-apply ("redo") one edited, unmerged migration |
| DRAFT-3 | #958 | enhancement, ready-for-human | Two cash expressions coexist unruled: list_bank_statements's tie.gl_balance_cents vs. get_client_financial_pack's governed "book cash" |
| DRAFT-4 | #959 | bug, ready-for-agent | scripts/wiki-lint-checks.mjs's maskComments desynchronises after an unbalanced quote/dollar token |
| DRAFT-5 | #960 | enhancement, ready-for-human | clara.firm_document_limits has no human writer |
| DRAFT-6 | #961 | enhancement, ready-for-human | Decide whether Clara ever shows a connection-pool / capacity headroom figure |
| DRAFT-7 | #962 | enhancement, ready-for-human | Rule on out-of-repo callers of clara.get_llm_usage_summary now that the admin floor is live on hosted |
| DRAFT-8 | #963 | enhancement, ready-for-agent | Record the cross-migration body-pin convention that 0233 relies on |
| DRAFT-9 | #964 | bug, ready-for-agent | Move the document daily-ingest ceiling window from UTC to Asia/Kuala_Lumpur |
| DRAFT-10 | #965 | enhancement, ready-for-human | Decide whether a file refused by the daily ingest ceiling gets a durable record |
| DRAFT-11 | #966 | bug, ready-for-agent | The intake recovery belt opening spool sidecars on every sweep causes Windows-only EPERM intake failures under load |
| DRAFT-13 | #967 | bug, ready-for-agent | The CI World leg for intake batches runs third on a database two earlier legs already loaded, and none of them drains its queue |
| DRAFT-14 | #968 | enhancement, ready-for-human | Allow a different bookkeeper to re-issue a stop after the original canceller loses authority mid-batch |
| DRAFT-15 | #969 | bug, ready-for-agent | The pinned shadcn CLI adds a bogus cn production dependency on every resolved item |
| DRAFT-16 | #970 | enhancement,ready-for-human | Finish AC2's shadcn native-chat component migration (attachment, message-scroller) |
| DRAFT-18 | #971 | enhancement,ready-for-human | A queued admission event on the chat stream |
| DRAFT-19 | #972 | bug,ready-for-agent | x41.s4 reds on the persistent depreciation rig from a dated, pre-existing defect, not #651's |
| DRAFT-20 | #973 | enhancement,ready-for-agent | Fold preview_depreciation_run's duplicated aggregation into _fa_run_period_core |
| DRAFT-21 | #974 | enhancement,ready-for-human | A blocked depreciation queue has no Needs-you row |
| DRAFT-22 | #975 | enhancement, ready-for-human | Ratify the accepted treatment for a locked period's depreciation charge (arrears vs. move-forward) |
| DRAFT-23 | #976 | enhancement, ready-for-agent | Fold the duplicated completion wall shared by complete_fixed_asset_particulars and _fa_complete_particulars_core |
| DRAFT-24 | #977 | enhancement, ready-for-human | Rule what counts as a person's instruction for authority_ref across the fixed-asset and plan lanes |
| DRAFT-25 | #978 | bug, ready-for-agent | completeFixedAssetParticulars and disposeFixedAsset mint their own operation key instead of taking a caller-supplied one |
| DRAFT-26 | #979 | enhancement, ready-for-human | Decide whether get_depreciation_authority should surface a retired authority's reason, author and window |
| DRAFT-27 | #980 | enhancement, ready-for-agent | Drive the trade-invoice lane's ask_question park arm and a commit-window cancel |
| DRAFT-28 | #981 | enhancement, ready-for-agent | Give governed refusals one generic structured-detail passthrough instead of per-route folds |
| DRAFT-30 | #982 | enhancement, ready-for-human | Resolve a trade-invoice counterparty by TIN, or stop accepting the field |
| DRAFT-32 | #983 | enhancement, ready-for-human | Give the prior-GL seeding capability a browser entrance |
| DRAFT-33 | #984 | enhancement, ready-for-human | Decide whether an opening basis needs a Work-shaped record, or rule that it does not |
| DRAFT-34 | #985 | enhancement, ready-for-agent | Cut `read_opening_source` into a future `chatTurn_vN` |
| DRAFT-35 | #986 | enhancement, ready-for-agent | Make a re-read opening document re-parsable |
| DRAFT-36 | #987 | bug, ready-for-agent | Give the closed-fiscal-year refusal on an opening draft the opening basis's own words |
| DRAFT-37 | #988 | enhancement, ready-for-human | Reconcile the capability registry's four levels with "read deterministically into human-ticked proposals" |
| DRAFT-38 | #989 | bug, ready-for-agent | Install Combobox/Popover without clobbering the owner-ruled Button |
| DRAFT-39 | #990 | enhancement, ready-for-human | Bank statement lines carry no per-line source page/region citation |
| DRAFT-40 | #991 | enhancement, ready-for-human | The pack-shaped-read ownership rule names one function, not the shape |
| DRAFT-42 | #992 | enhancement, ready-for-human | Knowledge records cannot represent two independent sources disagreeing, only two records |
| DRAFT-43 | #993 | enhancement, ready-for-agent | The read-set key grammar is stricter than the knowledge-key catalogs' own CHECK constraints |
| DRAFT-44 | #994 | bug, ready-for-agent | Raw-hex-colour lint rule flags a plain ticket reference like #658 with no explanation |
| DRAFT-45 | #995 | enhancement, ready-for-human | Firm Home renders the client register twice |
| DRAFT-46 | #996 | enhancement, ready-for-agent | Mount the compliance watch disposition read on /settings/compliance too |
| DRAFT-47 | #997 | enhancement, ready-for-human | The client tax page's compliance-watch receipt has no browser leg |
| DRAFT-48 | #998 | enhancement, ready-for-agent | Retire the firm timeline wrapper and clara.list_firm_timeline |
| DRAFT-50 | #999 | enhancement, ready-for-human | Discharge the pre-0120 closing_transfer unmarked-history backfill |
| DRAFT-51 | #1000 | enhancement, ready-for-agent | Cut the deferred chat tool read_client_financial_pack |
| DRAFT-52 | #1001 | enhancement, ready-for-human | Render cash.composition somewhere: nothing consumes it yet |
| DRAFT-53 | #1002 | enhancement, ready-for-human | A cash-account-set membership editor beyond the first publish |
| DRAFT-54 | #1003 | enhancement, ready-for-human | Decide whether clara.create_account_set_v1 (the 0058 writer) should retire |

## Existing tickets

| Ticket | Action | Comment |
|---|---|---|
| #663 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/663#issuecomment-5743438682 |
| #665 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/665#issuecomment-5743438841 |
| #693 | comment + closed (`wontfix`) | https://github.com/BELCORT-SDN-BHD/clara/issues/693#issuecomment-5743439090 |
| #782 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/782#issuecomment-5743439892 |
| #839 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/839#issuecomment-5743440012 |
| #843 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/843#issuecomment-5743440133 |
| #847 | comment + closed (completed) | https://github.com/BELCORT-SDN-BHD/clara/issues/847#issuecomment-5743440298 |
| #862 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/862#issuecomment-5743440655 |
| #868 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/868#issuecomment-5743440829 |
| #882 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/882#issuecomment-5743441052 |
| #885 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/885#issuecomment-5743441231 |
| #899 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/899#issuecomment-5743441419 |
| #915 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/915#issuecomment-5743441567 |
| #919 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/919#issuecomment-5743441795 |
| #929 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/929#issuecomment-5743441919 |
| #931 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/931#issuecomment-5743442118 |
| #932 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/932#issuecomment-5743442247 |
| #933 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/933#issuecomment-5743442421 |
| #935 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/935#issuecomment-5743442575 |
| #938 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/938#issuecomment-5743442748 |
| #942 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/942#issuecomment-5743442900 |
| #944 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/944#issuecomment-5743443017 |
| #945 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/945#issuecomment-5743443163 |
| #946 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/946#issuecomment-5743443252 |
| #947 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/947#issuecomment-5743443431 |
| #948 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/948#issuecomment-5743443699 |
| #949 | comment | https://github.com/BELCORT-SDN-BHD/clara/issues/949#issuecomment-5743443916 |

## Written, reviewed and deliberately NOT posted

| Item | Why |
|---|---|
| DRAFT-12 | The draft's stated harm does not hold on main. The leader loop's wait is waitForNudge(client, POLL_INTERVAL_MS, stopRef) (leader.mjs), and waitForNudge resolves on a NOTIFY or on a setTimeout of that interval, whichever comes first (listen.mjs) — so the loop is not nudge-gated, it polls. CLARA_LEADER_POLL_MS defaults to 2000 ms and no production override exists in the repository (the only overrides are in tests: inta |
| #861 | The audit's coordination note (coordinate with #840, same two doors, land in one migration if both are picked up together) is already on the ticket, twice. The 2026-09-17 Agent Brief comment's Key interfaces bullet reads 'recut together in one migration (coordinate with #840 if in flight)', and the 2026-09-18 owner-ruling comment repeats it: '#840 recuts the same two doors: land the two in one migration if both are i |
| #865 | Re-verified both acceptance criteria on main (dc9acfe1) myself; neither is met. apps/web/playwright.config.ts's webServer block (lines 44-53) still carries no comment naming the correct invocation or stating that a bare run does not build. apps/web/e2e/serve-built.mjs has zero references to BUILD_ID anywhere in the file. The existing 2026-09-17 comment on the ticket already states this exact gap (both ACs open) with  |
| #906 | The audit's recommended action is "keep as is; can share one comment-only migration with #868." That exact coordination note is already on the ticket, verbatim, in the existing 2026-09-17 comment ("...The documenting fix is the honest one. Can share one migration with #868."), and #868's own 2026-09-17 comment already states the reverse pointer ("Can share one migration with #906 (also a comment on a shared function) |
| #909 | The audit's recommended action is "keep as is; add sequencing line naming #929 as the other recut of `_plan_overlap_warning` so two tickets do not race the same body." That line is already on the ticket, verbatim, in the existing 2026-09-18 comment ("#929 retires the template arm of `_plan_overlap_warning`, so coordinate with it (same function, one recut)."), which itself was written after the owner's 2026-09-18 ruli |

Not filed by the audit's own verdicts: DRAFT-17 (duplicate, folded into #956), DRAFT-31 (comment on #665), DRAFT-41 (comment on #663), DRAFT-49 (already fixed on `main`).

#693 had already been closed automatically by PR #954's merge on 2026-09-19; the comment records where the fix lives, corrects the stale commit citation on the ticket, and the labels now read `bug, wontfix` per house precedent. #847 closed as completed: all four acceptance criteria verified on `main`, the hosted run-id census read 0 rows at the release.
