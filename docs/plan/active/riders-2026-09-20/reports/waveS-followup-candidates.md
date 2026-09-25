# Riders sweep wave S: every follow-up candidate the wave named, collected for the owner

**Nothing here is filed.** The wave's forty-four tickets are closed on hosted evidence, and exactly
two new tickets were filed with those closures: **#1144**, the successor contracts for the mainline's
next version cut, and **#1145**, the Workflow DevKit schema bootstrap command's durable home. This
file is the rest: every follow-up candidate, owed item, unverified claim and open question that the
lane reports, the fix reports, the merge report and the three gate reports name. It is deduplicated,
grouped by theme, and each group carries one recommendation. The orchestrator puts it to the owner.

Report paths are relative to this folder. A candidate already carried by #1144 is named in group A
and not repeated.

---

## A · Already re-parented, nothing to decide

Every live successor contract of this wave is on **#1144** and every one of them is already summarised
there with its report path: #1136's and #1137's seven chat tools over the now-hosted `0352` and `0353`
doors; the fixed-asset proposal input-loading step that #1090, #1092, #1093 and the #1056 fix round all
feed; #1048's two optional `payrollFacts_v2` fields; #1114's and #1077's corrections to the cut plan's
refusal mapping; #1073's and #1056's ruling-gated tool contracts; #1050's web contract; and the half of
`0353`'s own follow-up 1 that is still open.

**Recommendation: nothing to file. #1144 is the ticket; it belongs to #597's next version cut.**

---

## B · Owner rulings owed, where the answer decides whether there is work at all

| candidate | source |
|---|---|
| **May a committed firm-setup checklist be COMPLETED for a question it was never asked, while never being AMENDED for a fact it attested to?** A yes is one migration, one web control and one message key, costed in the report. A no means a pre-threshold firm's TIN is recorded some other way. Until it is ruled, a firm above the invoicing threshold that committed before the item existed sees it named as outstanding and cannot clear it. | #1098, `waveS-lane07-ticket1098.md`, `waveS-lane07-fix.md` |
| **Who may ask for an unattended post of a corrected payroll run, a second time?** A cleared block does not post and nothing says the run is waiting, because the unattended post lives inside the read. Pre-existing, made ordinary by #1056. Needs a new approval arm and a rationale. | #1056, `waveS-lane05-fix.md` follow-ups 1 and 2 |
| **Is `contract_confirmation` right on the accrual machine lane?** 0331 newly admits it, which is parity rather than a widening, and the safety argument is measured. The ruling changes no shipped behaviour. | #1080, `waveS-lane01-fix.md` SPEC-01, `waveS-lane01-recheck.json` RECHECK-01 |
| **Should the plan lane refuse a REVISION for a non-active client?** The create door refuses and the revise door does not, so an archived client's rent plan can still be revised through either entrance. The asymmetry predates this wave. An accounting judgement: is a revision to a dormant client's standing arrangement a new commitment or bookkeeping on an existing one? | #1137, `waveS-lane08-fix.md` follow-up 3 |
| **Ratify the widened tenancy scope.** Lane L8 built six read twins and a ninth split where the plan scoped two reads. Nothing to fix; the model lane's reach into the tenancy family should be a recorded decision. | #1137, `waveS-lane08-fix.md` SPEC-L08-1137-C |
| **The `depreciation_policy` knowledge floor sits above the door it advises on.** The advisory note floors at admin; the binding account-default door floors at bookkeeper. If bookkeepers record a client's depreciation note, the ground will rarely be fed. | #1090, `waveS-lane05-ticket1090.md` |
| **The single-page payroll witness posts unattended on a basis 0343's own header calls insufficient.** In scope, so not a defect, and the weakest thing in that lane. It becomes reachable the moment `payrollFacts_v2` ships. | #1048, `waveS-lane04-fix.md` follow-up 5 |
| **The on-screen equivalence sentence for the third accrual remedy.** Owner judgement; the condition is now documented. | #1073, `waveS-lane01-fix.md` SPEC-05 |

**Recommendation: grill these eight, in this order, before anything in groups C to G is filed.** Five
of them decide whether other candidates exist at all. None of them is a code change until it is ruled.

---

## C · A shipped database half with no way to reach it from the product

| candidate | source |
|---|---|
| **No web surface for either standing-instruction door: SUPERSEDED before release.** The implementer's report said so, but lane L2's fix round added the surface (commit `cf8bc6752`, a sixth card on `/settings/firm` that records and withdraws the firm's standing instruction, ADV-L02-06 / ADV-L02-08 / L02-SPEC-04 in `waveS-lane02-fix.md`), and it shipped in PR #1143. Nothing to file; the owner's signed-in walk of `/settings/firm` is the check. | #1050, `waveS-lane02-ticket1050.md` follow-up 1 |
| **Withdrawal does not pause the plans it produced.** They keep posting under the member who authorised them, which is #940's own ruling restated. Whether withdrawal should also pause them is a decision #1050 was not given. | #1050, same report, follow-up 2 |
| **No chat read of the standing instruction.** It needs a definer read door. | #1050, same report, follow-up 3 |
| **The deferred-revenue twin has no wake lane at all.** | #1050, same report, follow-up 4 |
| **A browser walk for the standing-instruction card**, once the gateway reflects the new relation. | `waveS-lane02-fix.md` follow-up 5 |
| **The settlement entry's document id is NULL**, so the document page's entry list never shows it, which makes half of #1059's first criterion untrue today for both settled and unsettled runs. Predates #1059; needs a backfill migration plus a one-line recut. | #1059, `waveS-lane04-ticket1059.md` follow-up 1 |
| **A granted, document-scoped read of the payroll posting verdict does not exist**, which is why #1048's tool contract has to route through the Needs-you queue. One definer wrapper, viewer floor. | #1048, `waveS-lane04-ticket1048.md` follow-up 1 |

**Recommendation: the first is superseded (the card shipped). File the next three as one small ticket of open questions on the standing instruction if the owner wants them tracked. File the
document-id backfill and the posting-state read as one small database ticket each; both are bounded
and both unblock a surface that already wants them.**

## D · Estate consolidation, where two or three bodies do one body's work

| candidate | source |
|---|---|
| **The `:plan` operation-key namespace is still shared by three bodies outside #1077's two lanes.** The accrual creation door, the tenancy confirm door and the accrual correction door all derive the same nested key, so one key spent on a tenancy rent plan and a prepayment schedule still collides and still answers an untyped refusal. Bounded: one migration, per-lane suffixes. The lane says file it rather than sweep it. | #1077, `waveS-lane02-ticket1077.md` follow-up 1 |
| **Collapse the third on-behalf plan-creation body**, now that #1051 and #1080 have landed: widen the shared core's closed kind set by two lines and reduce the tenancy step to a caller of it. Then a guard cell becomes unnecessary. If the unvalidated lane parameter is to be closed, take it in the same ticket, because the core is being rewritten anyway. | #1137, `waveS-lane08-fix.md` follow-up 1, `waveS-merge.md` section 11 |
| **The estate keeps two errcode catalogs**, one shadowing the other for the whole prepayment and deferred-revenue fixture chain, so a code resolves or not depending on which file a test imported from, silently. One catalog, re-exported, closes it. Test-only, no migration. | #1114, `waveS-lane02-ticket1114.md` follow-up 1 |
| **Codes CLR13 to CLR43 have no written meanings anywhere.** | #1114, same report, follow-up 2 |
| **The opening-item core's release list does not name the prepayment retire door**, so its refusal message and reason still hardcode the staff-advance wording. Same shape as 0337's own dispatch, plus a cell. | #1078, `waveS-lane02-ticket1078.md` follow-up 1 |
| **A prepayment or deferred-revenue schedule can outlive its enrolment**, and the code is then unreserved. | #1078, same report, follow-up 2 |
| **The autodraft admission door carries ten separate sweep-item insert sites.** Folding them into one helper would shrink the surface a reader must audit. Not urgent; each site is tested. | #1132, `waveS-lane07-ticket1132.md` follow-up 1 |
| **The claim allocation derivation's silent fall-through** is now unreachable from the door but would still mis-derive for any future caller that bypasses the assertion. | #1067, `waveS-lane03-ticket1067.md` follow-up 2 |
| **A dead refusal arm and one unfolded domain dispatch** in the prepayment family, both correct and both left. | `waveS-lane02-fix.md` follow-ups 2 and 3 |
| **A remedy for a posted period whose original account is gone**, owned by whichever ticket opens chart-account deactivation. | `waveS-lane01-fix.md` follow-up 4 |

**Recommendation: file the first two as real tickets; both are the same defect shape this wave already
proved twice and both are bounded. Fold the rest into whichever ticket next touches each family, and
drop the dead-arm and unfolded-dispatch items with the reason that they are correct as they stand.**

## E · Test and rig infrastructure

| candidate | source |
|---|---|
| **The intake batch drill's receipt census has no allowance for a child settling between the decision and the belt sweep**, though the lines above it make exactly that allowance for the earlier window. Under load the belt finds an empty worklist and the count comes up short, measured 3 of 7. Scope the census to children still live at belt time, or assert by identity as the lines above do. Pre-existing cell gap, not a #1044 code path, and it did not fire on the fresh-database rounds. | `waveS-lane06-fix.md` follow-up 1, `waveS-lane06-fix-2.md` follow-up 1 |
| **The intake admission drill's terminal drain cannot pass on any database carrying real client data**, because compliance notifications mint held wake tasks while both engine sources are disabled. Green in CI only because that database is empty. The drain needs to scope to the leg's own firms. | `waveS-lane06-fix.md` follow-up 2 |
| **Pagination for the accrual register**, which owns #1075's second criterion: the server-side filter gets a caller and the client-side narrowing goes. | #1075, `waveS-lane01-fix.md` follow-up 1, `waveS-lane01-recheck.json` RECHECK-03 |
| **No end-to-end list mock emits a claim row**, so no browser walk renders the claim label or #1069's new count on the Work list. Predates the wave. | #1069, `waveS-lane03-fix.md` item 4 |
| **The skip bounds stay hand-declared** where the cell floors are now derived; deriving them needs a run at each frontier. | #1126, `waveS-lane06-ticket1126.md`, `waveS-lane06-fix.md` follow-up 4 |
| **A third contract rule added without a drill update stays silently green**, matching the sibling block's own at-least-these convention; nothing enforces that a new rule gets its own exit-code proof. | #1131, `waveS-lane06-ticket1131.md` |
| **Audit other browser cells asserting focus after the same shared paint-then-restore timing.** A grep found the nearest neighbours auto-retry and are not vulnerable to this exact shape. | #1141, `waveS-lane06-ticket1141.md` |
| **The convention for an ungranted-but-still-idempotent writer has one entry today**; if more grant withdrawals of this shape are expected, it belongs in the onboarding notes. The runtime-side twin fixture was not investigated for parity. | #1099, `waveS-lane07-ticket1099.md` |
| **Three test files independently re-literal the published registry version** and have gone stale twice, each time caught by a red test rather than by review. Either they import the constant or a lint rule greps for the literal. | #1061, `waveS-lane04-ticket1061.md` follow-up 1 |
| **The web end-to-end mock's three unread recorders**: a readable introspection route, or delete the family. | `waveS-lane01-fix.md` follow-up 3 |
| **Two Needs-you row kinds still have no by-name case** in the affordances test, which is the drift the five-sync-point note exists to catch. Backfill both or retire the note's claim. | `waveS-lane04-fix.md` follow-up 3 |
| **A viewer is offered inline acts they cannot perform.** House-wide rather than one row; the payroll completeness question is where to start, because it is the first inline act that books a journal entry. | `waveS-lane04-fix.md` follow-up 2 |

**Recommendation: file the first two as one CI-reliability ticket; both are drills that are green for
the wrong reason and both have a named fix. File the pagination ticket, because it is the only thing
holding #1075's second criterion. Fold the rest into the batteries they belong to.**

## F · Documentation and copy

| candidate | source |
|---|---|
| **Blueprint pin drift, now four cuts old.** `docs/ARCHITECTURE.md` lines 171, 183, 207 and 445 still name workflow versions that are several cuts behind. Per the house rule a blueprint edit belongs to a wayfinder session; every wave has recorded it and so does this one. | `waveS-release-prep.md` section 5 item 5 |
| **The next wave's rig guidance should point at the repository README's stale-install paragraph** rather than re-deriving it, which is #1124's second criterion across a wave boundary. | `waveS-lane06-fix.md` follow-up 5 |
| **Migration 0338's own header still describes an abandoned apply-time design**, in three spots, all comment or message text and none load-bearing. Left alone on purpose, because any byte changed moves the file's checksum and forces a ledger repair for three sentences. Suggested replacements are written out. The cheap moment is the next time that file is edited for any other reason. | `waveS-lane02-fix-2.md` |
| **The local development environment template still describes the shared pre-session token in the singular.** | #1094, `waveS-lane07-ticket1094.md` follow-up 1 |
| **The remaining prepayment panel copy still reads as prose written for one purpose.** Correct, not contradictory, and left alone. | `waveS-lane02-fix.md` follow-up 4 |
| **The review queue read now has a twelfth generation**, and a future lane splicing an arm into the thin delegate rather than the core fails loudly at the wrong object. A one-line note in the database README's migration guidance retires it. | #1136, `waveS-lane08-ticket1136.md` follow-up 1 |
| **A standing marker naming #1060 as the ticket to reopen** the day a fourth settlement-candidate instance is proposed, so the next author does not re-derive the count. | #1060, `waveS-lane04-ticket1060.md` follow-up 1 |
| **One Needs-you affordance comment still names the old tab.** | #1060, same report, follow-up 2 |
| **The retention margin knob has no operational precedent to point at yet**, unlike the trace retention default. Worth a line in the ops notes once hosted has run a few cycles. | #1046, `waveS-lane07-ticket1046.md` follow-up 2 |

**Recommendation: the blueprint drift is a wayfinder item, not a ticket, and should be taken at the
next wayfinder session rather than filed. Fold every other line here into the next edit of the file it
names. None of them is worth a ticket of its own.**

## G · Unverified at release, which is a watch list rather than a work list

| candidate | source |
|---|---|
| **The collation question the wave opened twice.** #1052's label fold is now a property of the database's locale and no test pins it: the lane rig is `C.UTF-8`, hosted is `en_US.UTF-8`, and the two agree for ASCII and ordinary Latin-1 names but not in general. #1047's own guard measured that this estate's bank-account index names and one event-type name already move between the two collations. Either pin the comparison to an explicit collation or record the dependency in `CONTEXT.md`. | #1052 and #1047, `waveS-lane03-ticket1052.md` follow-up 1, `waveS-lane07-ticket1047.md` follow-ups 2 and 3 |
| **0340's tail count on hosted should be READ.** It reports how many live enrolment pairs the normalisation unifies. On the rig it is zero. Two genuinely different people labelled with the same name in different cases would become one claimant. | #1052, `waveS-lane03-ticket1052.md` |
| **#1127's first scheduled run should be watched**, and its comment recorded in the release evidence. It is the one thing about that channel a worktree cannot prove: whether the comment succeeds against the live default token with only the job's own issues-write grant. Nothing dedupes the thread on the next green run either. | #1127, `waveS-lane06-ticket1127.md`, `waveS-lane06-fix.md` follow-up 3 |
| **0347's backfill arm and 0348's prune were not exercised against a real population.** Both read zero on every rig, because no rig carries a committed firm-scope plan and no rig has served an auth wall. Hosted's own numbers are the only ones that mean anything. | `waveS-gates-B.md` notes N1 and N2, `waveS-release-prep.md` section 7 |
| **The 22 runtime cells were proved on a Windows rig, not on the runner.** The house rule asks that new runtime test files be re-run once under WSL as the runner user, and the merge does not record it for lane L6's four files. | `waveS-gates-C.md` unverified item 3 |
| **The live machine's own bundle was not read.** The rollback readings are taken against the built artifact at this head, whose roster is byte-identical at source. Streaming the image's server bundle off the machine and re-reading it is owed to a release window, which is the only place it can be done. | `waveS-gates-C.md` unverified item 1 |
| **The whole runtime suite ran once**, so an intermittent red would not be separated from a stable one. Both reds seen are named files with named, standing causes, and both were red in the cut phase's independent run too. | `waveS-gates-C.md` unverified item 5 |
| **The merge's own eleven recut bodies were not re-reviewed by a lane worker.** Each is argued and measured in the merge report and green on the integrated chain; the heaviest are 0353's authority fold and 0352's re-derived queue core. | `waveS-merge.md` section 18 item 7 |
| **One web unit cell is a whole-suite load flake**, green alone and absent from the last three whole-suite runs, in no lane branch and no integration commit. Pre-existing rests on the diff argument rather than a run on `main`. | `waveS-merge.md` section 18 item 5 |
| **The one skipped database cell is the brief's own prohibition**, not a gate declining: closing it needs a database built for that purpose alone. | `waveS-gates-A.md` note N2 |
| **The fixture privilege fallback fires on nine battery files**, documented in the helper's own source and far older than this wave. No assertion was relaxed. Recorded so the volume of those lines is not mistaken for a privilege regression. | `waveS-gates-A.md` note N1 |
| **Confirm lane L8's standards review ran.** Its standards report is absent from this folder. | `waveS-lane08-fix.md` follow-up 4 |
| **Migration number 0351 is unused** and returns to the orchestrator; no overflow number above 0360 was taken. | #1047, `waveS-lane07-fix.md` |
| **A disposable cluster is left running** so the runtime evidence can be re-run cheaply. It holds no lane's work and can be dropped. | `waveS-lane06-fix-2.md` follow-up 3 |

**Recommendation: file nothing from this group. Read 0340's hosted count and watch #1127's first
scheduled run as release chores rather than tickets; carry the collation question into the grill in
group B, because it is the same kind of question; and drop the rest with the reason that each is a
measurement already recorded where the next reader will meet it.**

---

## Count

Fifty-two candidates, deduplicated, across seven groups. **Two tickets were filed with the wave's
closures, #1144 and #1145, and nothing else.** Eight items are put to the owner as rulings, and the
recommendations above would file about eight more tickets if the owner agrees, fold roughly half the
list into the next edit of the file or battery it names, and drop the rest with a reason.
