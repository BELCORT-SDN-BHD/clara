# TRIAGE-AUDIT-2026-09-19

**What was audited**: every mainline ticket #597–#683 with its current state (delivered/closed vs. planned/open), every open non-mainline ticket, and every unfiled follow-up draft from wave 2026-09-18 (`wave-followup-drafts.md`) — 139 items in total (85 tickets + 54 drafts).

**Audited against**: the integration branch worktree `C:\Users\zhant\Desktop\clara-wt\int` (HEAD `0cd2a17c` = `origin/main` `abcc5030` + wave 2026-09-18's ten tickets + `chatTurn_v21`/`claraWork_v5`, shipped as PR #954); this wave's rulings (`docs/plan/active/refresh-wave-2026-09-18/DECISIONS.md` §0, §6.1–§6.4, and `reports/WAVE-DIGEST.md` §3/§5); the previous wave's rulings (`docs/plan/active/refresh-wave-2026-09-15/DECISIONS.md`); prior rejections (`.out-of-scope/*.md`); and the blueprints (`docs/PRD.md`, `docs/ARCHITECTURE.md`, including the retired O37/D6 lanes and the 刻意不做 list).

**On which commit**: `0cd2a17c` on the integration worktree. Per this session's own `git status`, `origin/main`'s current HEAD is `ede1df83` ("Merge pull request #954 from BELCORT-SDN-BHD/integration/wave-2026-09-18"), and `0cd2a17c` is a confirmed ancestor of it (`git merge-base --is-ancestor 0cd2a17c origin/main` succeeds) — **PR #954 has already merged**, which corrects several individual findings below that were written while it was still open.

**Nothing was changed on the tracker by this audit.** No GitHub issue was commented on, labeled, or closed; no file in the repository was edited; nothing was pushed. This report is the only file this audit wrote.

---

## §0 大白话（给老板看的）

这次审计一共查了 **139 张票**（85 张主线以外的活票 + 54 条本波未归档的后续草稿），对照的是集成分支 `C:\Users\zhant\Desktop\clara-wt\int`（HEAD `0cd2a17c`）、主线 #597 地图和它的孩子票（#612–#683，带状态）、这波和上波的 DECISIONS、以及 PRD/ARCHITECTURE 的刻意不做清单。**这份报告本身没有改动 tracker 上的任何东西**——不评论、不打标签、不关票、不推送。

**分布**：
- 已经做完了（`already_fixed`）：**2** 张
- 做了一半（`partly_fixed`）：**7** 张
- 主线自己会顺带做（`planned_by_mainline`）：**2** 张
- 和别的票重复（`duplicate`）：**1** 张
- 需要老板先拍板才知道归谁（`needs_owner`）：**2** 张
- 其余（`keep`，原样保留，继续是活票）：**125** 张
- 主线已交付覆盖 / 和某条 ruling 冲突：0 张（本轮没查到这两种）

**三件最要紧的事，关系到 #597 的 refresh/rebuild**：

1. **#597 没有被"暗中处理掉"的风险**——125 张 keep 票逐张在集成分支上核实过，没有一张已经被这波（或历史上任何已关闭的主线票）悄悄做掉、做重、或者和某条 ruling 冲突。这波的十张票（#635/#636/#642/#651/#655–#660）该碰的碰了，不该碰的（比如 #862、#899、#868、#882 这四张部分修复票的"剩下那一半"）都留下了清楚的书面记录，不是遗漏。
2. **PR #954 其实已经合并主线了**——computed task 说"PR #954, not merged yet"，但当前仓库状态是 origin/main 已经是合并提交 `ede1df83`（"Merge pull request #954"），`0cd2a17c` 是它的祖先。这意味着 §4 里"等 PR #954 合并后再执行"这个前提，其实已经满足了，只差老板确认。
3. **有 3 张票的"审核人"和"提出人"意见不一致，审核人赢了，这正是流程该起的作用**：#847（本来想直接关already_fixed，被打回partly_fixed，因为宿主 run_id 普查这条验收标准根本没跑）、DRAFT-29（本来想转给 #662 评论了事，被打回needs_owner，因为 #662 连开工都没开工，真正该改的地方其实是 #655 自己的准入函数）、DRAFT-52（本来想转给 #669/#670 评论了事，被打回keep，因为 #669 的验收标准压根不覆盖现金这条数据）。

## §1 按最终结论分类的清单

### Already fixed (2)

| # | Title | Evidence | Recommended action | Confidence | Skeptic |
|---|---|---|---|---|---|
| #693 | Windows-only: intake scanner cells fail because Defender quarantines the EICAR fixture | eicar-fixture.mjs (probe + named skip, exactly option 1 of the ticket) present on origin/main and wired into intake-unit/intake-db tests; live probe on this host: survives=true, skip=false; DECISIONS.md:304-306 names it accounted-for; RIG.md still lists it as a stale copy-paste predating the fix. | close wontfix (already implemented) with pointer to packages/runtime/tests/eicar-fixture.mjs + commit b56e0f2a (the skeptic pass corrected the original 6375cc68 citation, which is an unrelated commit) (PR #817, merged to main 2026-09-14); the only unmet AC is the human 'please confirm on your Defender-active Windows machine and close' step, which is procedural, not code. Separately (not blocking this ticket): RIG.md's 'must NOT fix' line is stale boilerplate now that #693 has a real named skip instead of a silent ignore — worth a one-line doc fix next docs pass, not an agent ticket. | high | Upheld — originating commit is actually b56e0f2a, not 6375cc68 (which is an unrelated commit); everything else verified |
| DRAFT-49 | `ui:add` cannot invoke the shadcn CLI on Windows at all | Commit fa6e71b9 adds .CMD resolution + shell:true to ui-add.mjs; confirmed merged to origin/main (ancestor check); integration-merge.md independently confirms the guard self-test still passes post-fix. | Do not file. Close/skip this draft as already resolved; if a tracking issue is wanted for the record, file it pre-closed with a pointer to commit fa6e71b9. | high | Upheld |

### Partly fixed (7)

| # | Title | Evidence | Recommended action | Confidence | Skeptic |
|---|---|---|---|---|---|
| #847 | claraWork_v4: mirror the trace door's two bounds on the writer side | See recommended action and skeptic column for the load-bearing evidence. | This is implemented ONLY on the integration worktree (HEAD 0cd2a17c, PR #954), NOT on origin/main. Do not close #847 yet — leave it open until PR #954 merges, then close it pointing at packages/runtime/lib/work-trace-bounds.mjs and the claraWork.v5.impl.ts import. The hosted run_id census is a genuinely outstanding AC. | high | Overridden — Code is real and wired, AND already merged to origin/main (PR #954 merged as ede1df83) — the 'wait for merge' framing is stale/moot. But AC4 (hosted run_id census, required BEFORE finalizing the run-id shape) was never run despite the shape already shipping — that's a real unmet AC, not a future-gated one. Should stay partly_fixed carrying the hosted census as sole residual. |
| #862 | Lane mocks read POST bodies without the shared cache, so a shared verb loses data | fixed-asset-mock.mjs now imports readCachedJson (fixed incidentally by #651's commit 907d6e4c), confirmed merged to origin/main; but e2e-fixture-ownership.test.ts still has no structural census cell guarding against the next mock reintroducing a private body reader. | narrow the ticket to just 'add the missing structural census cell to e2e-fixture-ownership.test.ts'; the one concrete instance (fixed-asset-mock.mjs) is already fixed (landed on main via PR #954/#651), so do not close #862 outright — the census cell that prevents regression still doesn't exist anywhere | high | Upheld |
| #865 | `npx playwright test` silently serves a stale build instead of building from HEAD | playwright.config.ts's webServer block still has no staleness comment; serve-built.mjs still has no BUILD_ID/age log at startup (confirmed on both branches). Only the ephemeral RIG.md documents the workaround. | keep open as ready-for-agent; documentation half satisfied only in ephemeral RIG.md, durable fix (comment in playwright.config.ts + BUILD_ID/age log in serve-built.mjs) still unbuilt in both files on both branches | medium | Upheld |
| #868 | `_subledger_on_approve` caller-census pin is stale everywhere it's copied | Mainline refs: #655, #638, #639. See recommended action. | comment on #868 with the 0225 pointer and narrow the body to its single remaining AC — the durable COMMENT ON FUNCTION on `clara._subledger_on_approve` naming the six callers; can share one migration with #906 (both comment-only changes on a shared function) | high | Upheld |
| #882 | Fixed-asset CLR40 refusal handling needs cleanup | Mainline refs: #639, #651, #658. See recommended action. | comment on #882 and narrow the body to half (b) ONLY once PR #954 merges (it already has): the pin cell (retire+approve in one transaction → CLR40) plus convention comment in both trigger bodies; half (a), the CLR40 refusal row + tests, is done and merged. Sequencing note: ride #932's migration rather than a standalone comment-only recut. | high | Upheld |
| #885 | A document correction leaves affected Work questions answerable at their stale version | Mainline refs: #646, #663. See recommended action. | Keep #885 open, narrow remaining scope: visibility half (drift banner) closed by #658, mark closed on this ticket; functional half (cancel+supersede per owner's 2026-09-17 ruling) NOT built, remains live AC. Flag question to owner: does the #658 banner (warns only, does not block submission) satisfy the ruling that no answer can ever be given against a stale basis, or is the structural cancel+supersede fix still required? | high | Upheld |
| #899 | Client-creation entrances bypass the name-collision candidate check | Mainline refs: #649, #659. See recommended action. | narrow the ticket body to the residual: the ⌘K command-palette bypass and the still-granted legacy create_client verb; the Firm-Home-zero-client half is closed by #659's AddClientControl extraction (already merged via PR #954, not merely pending) | high | Upheld |

### Planned by mainline (2)

| # | Title | Evidence | Recommended action | Confidence | Skeptic |
|---|---|---|---|---|---|
| DRAFT-31 | #665's cutover must retire the legacy coding lane's posting-date due-date anchor | packages/db/migrations/0225_trade_invoices.sql carries a comment directly naming #665 as owner of retiring the legacy lane's posting-date due-date anchor; DECISIONS.md §6.1 row R-A rules the same; test p655.due.anchor_document_date pins both numbers by name today. | Do not file as a standalone issue. Comment on #665 (once picked up) pointing at the pinned test `p655.due.anchor_document_date` as proof the legacy anchor must be retired as part of its cutover. | high | Upheld |
| DRAFT-41 | Surface `get_context_pack`'s `last_projected_seq` / `has_stale_sources` somewhere | get_context_pack's last_projected_seq/has_stale_sources fields (0209 migration) exist and feed only the LLM prompt text today -- zero web-side read or UI surfaces them; 658-final.md's own follow-up #2 says surfacing them 'belongs with #663's engine', and mainline #663's AC4 (projection lag/rebuild status readable) is a direct match. | Do not file as a standalone issue. Comment on #663 (once picked up) naming the existing fields as data #663's engine should surface. | high | Upheld |

### Superseded by mainline (0)

_None found in this audit._

### Duplicate (1)

| # | Title | Evidence | Recommended action | Confidence | Skeptic |
|---|---|---|---|---|---|
| DRAFT-17 | `use-clara-thread-stop.test.ts` leaks a reattach timer between cells | See recommended action and skeptic column for the load-bearing evidence. | Do not file as a second issue. Fold into DRAFT-1's filed issue (or close as duplicate of it once DRAFT-1 is filed). | high | Upheld |

### Conflicts with a ruling (0)

_None found in this audit._

### Needs owner (2)

| # | Title | Evidence | Recommended action | Confidence | Skeptic |
|---|---|---|---|---|---|
| DRAFT-29 | A same-document-number duplicate probe for trade invoices, with an owner | The old lane's CLR21 duplicate_bill probe (0015 et al.) has no equivalent in #655's new admit_trade_invoice_work path (0225 has zero references to CLR21/duplicate_bill); #662 (the ticket the original triage routed this to) has not started and its AC is settlement-stage, too late to prevent a double-recorded invoice. | Do not file as a standalone issue. Comment on #662 quoting the gap so it is picked up when #662 is implemented. | high | Overridden — Neither #655's nor #662's AC covers same-document-number duplicate detection; #662 hasn't even started (not in wave's migration list); the more defensible fix site is #655's own admission function (creation-time check, parity with the old lane's CLR21 duplicate_bill probe), not #662 (settlement-stage, too late). Route needs an explicit owner, not just a comment on #662. |
| DRAFT-48 | Delete `lib/firm/timeline.ts` and `clara.list_firm_timeline` deliberately, once a lane owns the decision | lib/firm/timeline.ts and clara.list_firm_timeline have zero non-test consumers on the integration branch today -- Firm Home's read was swapped to list_activity by this wave's #659. Open ticket #843 (filed 2026-09-17, before #659 landed) still plans to route new events through list_firm_timeline, which is now the stale assumption. | File the deletion decision as a new issue (ready-for-human), AND separately comment on #843 to flag that its plan to route new events through `list_firm_timeline` needs re-pointing at `list_activity` before #843 is implemented, since #659 already swapped Firm Home's read to `list_activity`. | high | — |

### Keep (still live, ready-for-agent/human, unchanged) (125)

| # | Title | Evidence | Recommended action | Confidence | Skeptic |
|---|---|---|---|---|---|
| #782 | Document reading: state invoice line items as an accepted limitation, not planned (registry limit, copy, PRD) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #656, #683, #624. | keep as ready-for-agent, unchanged. Add coordination note: since wave-18's #656 already raised registry_version to 2 by whole-table UPDATE, #782's own migration must mint version 3, never DELETE-then-INSERT | high | — |
| #839 | Offer "Restate as a new instruction" on the Clara rail | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | keep as ready-for-agent, unchanged. Sequencing note: #642's brief sequences #839 after #642 touches ClaraThreadView.tsx | high | — |
| #840 | Show the successor link on the work.cancelled Activity row | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #842 | Fix settled_cents rendering in the adjustment history disclosure | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #643. | Keep as is, unchanged. | high | — |
| #843 | Give operators a human-readable audit surface | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #844 | Pin the operator queue's arm-1 `i.id desc` tie-break | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #845 | Extend T19's disposable-name check to the other reset-gated drills | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #846 | Close the registry_version DELETE-then-INSERT hole | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #848 | Add an e2e walk for the egress re-activation action | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #849 | `--print-closure`: add a reverse index and a `--retire` command | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #850 | Cut the two-build drill's two scratch builds to one | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #851 | Add e2e/run.mjs --no-build and a sign-in-helper gate | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #852 | Surface the chat-clarify counters in the reconciler sweep receipt | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #853 | Make the e2e activity mock honour p_work | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #854 | Measure the opening lane's two-session race | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #656, #661. | Keep as is, unchanged. | high | — |
| #857 | Add a fixture lint for raw document_regions inserts | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #858 | e2e: documents-viewer-walk has two timing-flaky cells (polygon layer, the ladder) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #861 | Activity-kind ladder misfiles events under "documents" | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #625, #633, #639, #646, #647, #650. | keep as ready-for-agent, fully unblocked by owner's 2026-09-18 ladder-vocabulary ruling; coordinate with #840 (same two doors) — land in one migration if both picked up together | high | — |
| #863 | `e2e-fixture-ownership.test.ts`'s verb-ownership census is blind to non-standard dispatch spellings | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #864 | Playwright walks flake under twelve-lane host contention | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #866 | `rig-isolation.test.mjs`'s T10b cell reds after the Workflow/WDK world is bootstrapped | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #867 | `0154_binding_proposal_pr_1`'s role census is a cluster-global literal | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #871 | Signed-out invite preview has no route | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #625. | Keep as is, unchanged. | high | — |
| #872 | Give invite preview/roster a fifth effective status for a since-demoted/removed issuer | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #625. | Keep as is, unchanged. | high | — |
| #874 | A mail-transport base-URL seam for invite walks | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #625. | Keep as is, unchanged. | high | — |
| #875 | Poll-bound test-budget cells can assert a vacuous bound | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | medium | — |
| #876 | `document_filings` has no list-form read for a set of documents | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #636. | Keep as is, unchanged. | high | — |
| #877 | Need a Tier-A-complete autodraft fixture | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #878 | `document-admin.tsx`'s classify Select still offers a kind the door always refuses | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #879 | No Playwright coverage for the `?tab=staffAdvances` view | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #638, #681. | Keep as is, unchanged. | high | — |
| #880 | Label a staff-expense claim on the Work LIST, not only the detail | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #638. | Keep as is, unchanged. | high | — |
| #884 | No opening-seed fixture for the fixed-asset K-family opening-balance exclusion arm (CLR40 fa_k_gl_balance_on_enrolled) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #639, #651, #656. | Keep as is, unchanged. | high | — |
| #889 | `merge_counterparties` technical debt: repoint residue writers and document its lock order | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #647, #655. | Keep as is, unchanged. | high | — |
| #890 | A cell for the three counterparty-door dialogs' shared draft rule | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #647, #681. | Keep as is, unchanged. | high | — |
| #891 | Firm setup applicability predicates | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #648. | Keep as is, unchanged. | high | — |
| #894 | Harden `uq_onboarding_plans_one_open_firm`'s predicate | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #648. | Keep as is, unchanged. | high | — |
| #895 | 0218 firm-setup migration polish (three items deferred while byte-frozen) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #648. | Keep as is, unchanged. | high | — |
| #896 | `StateBanner` silently drops `data-testid` | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #648. | Keep as is, unchanged. | high | — |
| #897 | UI-21's full-screen onboarding altitude leg has no runnable home | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #649. | Keep as is, unchanged. | high | — |
| #898 | Financial-year-end DAY is not represented in Knowledge | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #649, #654. | Keep as is, unchanged. | high | — |
| #900 | `InterviewRunCard` is still pre-`Field` | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #649, #633. | Keep as is, unchanged. | high | — |
| #902 | Scope the client-work-pack e2e mock by `p_client` | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #903 | `needs-you-counts.tsx` and `use-review-queue.ts` small polish (two items) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #650, #659. | Keep as is, unchanged. | high | — |
| #904 | Client Documents workbench still stays "running" until reload | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #905 | Give clara.list_accounting_work a receipt-dated window | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #650. | Keep as is, unchanged. | high | — |
| #906 | `clara._assert_journal_basis`'s `nonzero_total` arm is structurally unreachable | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #652, #653. | keep as is; can share one comment-only migration with #868 | high | — |
| #908 | Plan lane's own door still accepts a plan whose schedule reaches no due date | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #653, #652, #640. | Keep as is, unchanged. | high | — |
| #909 | Scheduled-adjustment overlap detection is advisory-only and one-sided | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #640, #652, #653. | keep as is; add sequencing line naming #929 as the other recut of `_plan_overlap_warning` so two tickets do not race the same body | high | — |
| #912 | Record the promoter's role at the instant of a firm-knowledge governed act | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #654, #625. | Keep as is, unchanged. | high | — |
| #913 | `clara.knowledge_keys.scope_default` is now provably dead | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #654, #658. | Keep as is, unchanged. | high | — |
| #914 | `clara.approve_wrong_client_correction` takes a client row before the advisory rung | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #646, #676, #649. | Keep as is, unchanged. | high | — |
| #915 | #653's chat entrance stops at a grant wall — `create_prepayment_schedule` has no `clara_runtime` twin | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #653, #658. | narrow the body: replace 'the next chat successor (chatTurn_v21)'/'claraWork_v5 adds read_prepayment_source' with the next cut (chatTurn_v22/claraWork_v6, per DECISIONS D17); delete the 'one ceremony for all three (#847, #882(a))' sentence — that ceremony ran without #915; record #940's roster check as an added acceptance row | high | — |
| #917 | dsn-pipe.mjs pins the CA with a Windows path the WSL backup child cannot open | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | Keep as is, unchanged. | high | — |
| #919 | Prepayment schedule reads do not flag a superseded term row; runtime README's standalone-e2e list undercounts | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #653. | keep as is, sequence first in the prepayment lane — #939/#940/#941 all name it as their blocker | high | — |
| #921 | Make the legacy vendor-bindings panel read-only (D6) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #647. | Keep as is, unchanged. | high | — |
| #927 | Retire the 0045 recurring-adjustment template lane (1/3): close the propose, sign and manual-run doors with typed refusals; Registers → Adjustments becomes read-only history | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #652, #653, #612, #683. | Keep as is, unchanged. | high | — |
| #928 | Retire the 0045 recurring-adjustment template lane (2/3): stop the daily sweep and retire the runtime module | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #652, #612. | Keep as is, unchanged. | high | — |
| #929 | Retire the 0045 recurring-adjustment template lane (3/3): blueprint and vocabulary say one lane; plan-form advisory drops its template arm; close #788 | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #683, #652, #653. | narrow the body: drop the PRD §69/§72 clause from AC1 (PRD never actually mentions templates — zero occurrences); keep CONTEXT.md/ARCHITECTURE clauses; add C08.1 disposition note for #683; state whether blueprint edits are taken here or handed to #683 per DECISIONS §4 convention | high | — |
| #930 | Staff expense claim (1/2): choose the advance to discharge from the claimant's open advances instead of typing its id | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #638, #681. | Keep as is, unchanged. | high | — |
| #931 | Staff expense claim (2/2): discharge several advances through an explicit allocation list with a date-ordered suggestion (closes #881) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #638, #655, #651, #658. | keep, but narrow/correct the body: re-point AC5 and Blocked-by from chatTurn_v21 (already cut, frozen, without this) to the next chat cut (v22); delete stale '#847/#882(a)/#915 also ride' parenthetical | high | — |
| #932 | Fixed assets (1/2): a default depreciation policy per enrolled asset account, applied at acquisition with its version recorded on the register row | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #651, #639, #948. | keep as is; add sequencing line: base frontier is now 0233 (PR #954, merged), 0227 already added change_class/change_reason to the same fixed_assets row — #932's recut of 0216's birth trigger must re-pin the LIVE post-0227 bodies | high | — |
| #933 | Fixed assets (2/2): when the account has no policy, Clara proposes the depreciation particulars in the question and the person confirms (claraWork_v5; closes #883) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #658, #651, #639. | keep, but narrow the body: re-point title/AC1 from claraWork_v5 (cut without it) to the next claraWork successor (v6); delete stale '#847/#882(a)/#915/#931 also ride' clause; replace Blocked-by with '#932 and the next claraWork cut' | high | — |
| #934 | Firm setup (1/2): replace the twelve engineer notes with one accountant-readable sentence each; user-note and retire columns on the catalogue | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #648, #635. | Keep as is, unchanged. | high | — |
| #935 | Firm setup (2/2): optional education tips with a read-or-later rendering, outside the required counters and the audit trail (closes #892) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #648. | keep as is; note the existing defer_firm_setup_item door is NOT the acknowledgement path it wants (it audits and receipts); depends on #934 for the retire flag | high | — |
| #936 | Accruals: revising an accrual's amount leaves its accrual detail at the first revision | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #652, #676. | Keep as is, unchanged. | high | — |
| #937 | Accruals: person-stated amount per period (stated_period_amount) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #652, #653. | keep as is; its 'Parent #907' line is stale — #907 is already CLOSED — fix to 'parent #907 (closed 2026-09-18)' when next edited | high | — |
| #938 | Accruals: surface a bill that posts inside an accrued period, with skip-this-period and reverse-now remedies | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #652, #662, #669, #676. | keep as is; add comment pointing implementer at the now-written 'Settlement candidate row' mechanics contract (CONTEXT.md, landing with PR #954) so its read is built as a derived, self-clearing candidate row | high | — |
| #939 | Prepayments: amortise a prepayment with no source document from a person-stated service period (prepayment_schedule_v2) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #653, #683. | keep as is; its 'Parent #910' line is stale (#910 is CLOSED); dependency on open #919 stands | high | — |
| #940 | Prepayments: a per-client roster of prepayment accounts gates amortisation ahead of the shared eligibility wall | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #653, #668. | Keep as is, unchanged. | high | — |
| #941 | Deferred revenue: recognise a receipt paid ahead by a customer as revenue over its service period (mirror of prepayment amortisation) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #670. | Keep as is, unchanged. | high | — |
| #942 | Accrued revenue: the accrual lane gains a revenue side (Dr accrued income / Cr revenue, auto-reversed), mirroring expense accruals | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #652. | keep as is; add line asking whether the asset account comes from #941's new template row or existing 1320 Unbilled Receivables | high | — |
| #944 | Blueprint: state that Clara never derives a statutory rate but may read a printed figure (PRD 112, glossary, architecture) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #643, #612, #624. | Keep as is; comment on #944 naming the residue its ACs don't cover: mainline #612/#643's own out-of-scope entry re payroll-document ingestion and PRD.md:127's deferred line both need the #926 ruling recorded as superseding them before #945/#946 build | high | — |
| #945 | Payroll summaries: typed facts read from what the payslip prints, summed by a deterministic evaluator | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #643, #624, #612. | Keep as is; comment before pickup: (1) cite #926 ruling as superseding mainline #612/#643's payroll-ingestion exclusion, #944 must land first; (2) map onto seeded account codes (0150) rather than mint a parallel vocabulary | high | — |
| #946 | Payroll summaries: draft and post the run unattended under the invoice lane's own gate | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #643, #639, #657. | Keep as is; comment on overlap with existing payroll_obligation lane (0194/#643) and settled_cents split (0212) — duplicate guard must also see obligations posted through that lane; narrow AC1 (only Salaries Payable missing, not 6000-6040/2100-2140); merge migration with #941/#949 | high | — |
| #947 | Payroll: find the net-pay payment on the bank statement and propose its settlement | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #657, #667, #662, #643. | Keep as is; comment to retire its own open question (mechanism is now defined by #657's Settlement candidate row, per CONTEXT.md); add #946 to Blocked-by explicitly; note AC2 must reuse existing REVIEW_QUEUE_ROW_KINDS per carried rule | high | — |
| #948 | Hire-purchase and finance-lease agreements: read the printed terms and draft the acquisition into the fixed-asset lane | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #639, #624, #651. | Keep as is; comment with factual correction: AC4's 'existing birth door' doesn't exist — 0216:293's trigger is lane-agnostic and fires on any posted entry debiting an enrolled FA account; depreciation particulars already come from fa_account_profiles | high | — |
| #949 | Tenancy agreements: a contract-terms record, and a recurring rent plan a person confirms | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); mainline refs: #640, #657, #653, #624. | Keep as is; comment with three narrowings: (1) name the credit account (merge chart migration with #946/#941 or state 2010 Other Payables); (2) justify or drop the new contract-terms table given existing append-only estates; (3) replace 'whichever lands first' with pointer to CONTEXT.md's Settlement candidate row (#657 defined it) | high | — |
| DRAFT-1 | `use-clara-thread-stop.test.ts` is a genuine, non-deterministic whole-suite flake in #630's lane | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, exactly as drafted. Fold DRAFT-17's content into its body rather than filing that as a second issue. | high | — |
| DRAFT-2 | `packages/db/scripts/migrate.mjs` has no supported way to re-apply ("redo") one edited, unmerged migration | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-3 | Two cash expressions coexist unruled: `list_bank_statements`'s `tie.gl_balance_cents` vs. `get_client_financial_pack`'s governed "book cash" | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. Note #675/#668 as adjacent-but-non-owning for awareness, not routing target. | medium | — |
| DRAFT-4 | `scripts/wiki-lint-checks.mjs`'s `maskComments` desynchronises after an unbalanced quote/dollar token | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-5 | `clara.firm_document_limits` has no human writer | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-6 | Supavisor / pool headroom is not a settings figure (C81.5) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-7 | Audit out-of-repo callers of `clara.get_llm_usage_summary` before the recut reaches hosted | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted; this is the wave's own instructed follow-up. | high | — |
| DRAFT-8 | 0233 hard-pins three unrelated bodies — a cross-ticket coupling to record | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted (documents intentional fail-closed coupling). | high | — |
| DRAFT-9 | Move the document daily-ingest ceiling window from UTC to `Asia/Kuala_Lumpur` | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, exactly as drafted; fulfils D4's own instruction. | high | — |
| DRAFT-10 | A file refused by the daily ingest ceiling before its intake exists can never become a durable batch member | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-11 | The intake recovery belt opening spool sidecars on every sweep causes Windows-only `EPERM` intake failures under load | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | medium | — |
| DRAFT-12 | `sweep_intake_batch_cancellations` has no cadence of its own | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-13 | The CI World leg for intake batches runs third on a database two earlier legs already loaded, and none of them drains its queue | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-14 | Allow a different bookkeeper to re-issue a stop after the original canceller loses authority mid-batch | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, exactly as drafted. | high | — |
| DRAFT-15 | The pinned `shadcn` CLI adds a bogus `cn` production dependency on every resolved item | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-16 | Finish AC2's shadcn native-chat component migration (`attachment`, `message-scroller`) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-18 | A `queued` admission event on the chat stream | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-19 | `x41.s4` reds on the persistent depreciation rig from a dated, pre-existing defect, not #651's | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-20 | Fold `preview_depreciation_run`'s duplicated aggregation into `_fa_run_period_core` | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-21 | A blocked depreciation queue has no Needs-you row | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-22 | Decide whether a locked period's depreciation charge is ever moved into the next open period, or only ever charged as arrears (D9) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-23 | Fold `complete_fixed_asset_particulars` and `_fa_complete_particulars_core`'s duplicated wall | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-24 | Rule what counts as a "person's instruction" across the FA and plan lanes (`authority_ref` proves provenance, not authorship) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-25 | `completeFixedAssetParticulars` and `disposeFixedAsset` still mint their own operation key | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-26 | `clara.get_depreciation_authority` never surfaces a retired authority's reason, author or window | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-27 | Drive AC4's park (`ask_question`) arm and a commit-window cancel on the trade-invoice lane | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-28 | `lib/wire.ts` discards every refusal detail key but `reason` | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-30 | Resolve a trade-invoice counterparty by TIN, or stop advertising the field | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | medium | — |
| DRAFT-32 | Build a browser entrance to `POST /api/seeding/prepare` (prior-GL seeding) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-33 | Decide what a Work-shaped opening record is, or rule that there is none | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-34 | Cut `read_opening_source` into a future `chatTurn_vN` | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-35 | Make a re-read opening document re-parsable | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-36 | Give the closed-fiscal-year refusal on an opening draft the opening basis's own words | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-37 | Reconcile the capability registry's four levels with "read deterministically into human-ticked proposals" | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. Cross-link to #782 for awareness (same taxonomy, different question). | medium | — |
| DRAFT-38 | Install Combobox/Popover without clobbering the owner-ruled Button | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted, and flag as a BLOCKER for #667's own Combobox acceptance criterion. | high | — |
| DRAFT-39 | Per-line region citations on bank statement lines ("which page of the PDF") | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-40 | Widen `docs/ARCHITECTURE.md:297-299`'s pack-shaped-read ownership rule from the function to the shape | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted (belongs in a Wayfinder pass). | high | — |
| DRAFT-42 | Represent two independent knowledge *sources* disagreeing, not just two records | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted, flagged as a PREREQUISITE for #665's accuracy-measurement work. | high | — |
| DRAFT-43 | The read-set key grammar (`record_work_knowledge_read`) is stricter than the catalog's own CHECK | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-44 | A `#NNN` ticket reference inside a linted string literal is banned by the raw-hex-colour rule, and nobody knows it | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-45 | Firm Home renders the client register twice (the new portfolio table and the older `clientsLine`/`clientsEmpty` tally) | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-46 | Mount `get_compliance_watch_disposition`'s read on `/settings/compliance` too | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-47 | `/clients/:id/tax` receipt has no browser leg | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted — flag the #627-owned fixture-file coordination need in the issue body. | high | — |
| DRAFT-50 | Discharge the pre-0120 `closing_transfer` unmarked-history backfill | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted (needs hosted count read first). | high | — |
| DRAFT-51 | Cut the deferred chat tool `read_client_financial_pack` | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-agent, as drafted. | high | — |
| DRAFT-52 | Render `cash.composition` somewhere — nothing consumes it yet | financial-pack.ts hydrates cash.composition on every FigureGroup, but client-cash-summary.tsx never reads figure.composition (only profit's composition is consumed, via ClientIncomeExpenseChart). #669's AC is exclusively AR/AP aging (different accounts, no hook for cash data) so it is not a real consumer despite the wave digest naming it as one; #670's AC (reconcilable core financial statements) is a defensible partial match, and DECISIONS D6 names a narrower GL-drilldown residual for #670 specifically, not full cash.composition rendering. | File as new issue, ready-for-human (per the ORIGINAL source triage's own routing, restored by the skeptic pass): #669's AC is exclusively AR/AP aging and does not actually cover cash.composition despite the wave digest naming it as a consumer; #670 is only a defensible partial match (DECISIONS D6 names a narrower GL-drilldown residual, not full cash.composition rendering). Do not resolve this by commenting on #669/#670 alone -- file it and let the issue itself carry both partial-consumer notes. | high | Overridden — #669's AC is exclusively AR/AP aging (different accounts, no hook for cash.composition) — it is NOT a real consumer despite the wave digest's aside. #670 is a defensible partial match (DECISIONS D6 names a narrower GL-drilldown residual for #670, not full cash.composition rendering). File as ready-for-human as originally planned by the source triage rather than resolving via comment-only routing, since half the routing target (#669) does not actually cover it. |
| DRAFT-53 | A cash-account-set membership editor beyond the first publish | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |
| DRAFT-54 | Decide whether `clara.create_account_set_v1` (the 0058 writer) should retire | Confirmed unimplemented/unaddressed on the integration branch (HEAD 0cd2a17c); no mainline ticket covers it. | File as new issue, ready-for-human, as drafted. | high | — |

## §2 需要老板拍板的问题（needs_owner，2 个，大白话一行版）

- **DRAFT-29** — A same-document-number duplicate probe for trade invoices, with an owner
  同一张发票号被重复登记两次，谁来挡？现在 #655（开发票的那张票）和 #662（对未结项目做核销的那张票）的验收标准都没写这件事，#662 甚至还没开工——是让 #655 在"开发票"那一步就查重（更早、更省事），还是坚持等 #662 做完再说（更晚、票已经错着入账了）？我们建议前者，等你一句话。
- **DRAFT-48** — Delete `lib/firm/timeline.ts` and `clara.list_firm_timeline` deliberately, once a lane owns the decision
  `lib/firm/timeline.ts` 这条老的时间线读法，现在首页已经全面换成 `list_activity` 了（#659 这波做的），这条老路还留着没人用，是不是可以正式判它退休？如果判退休，#843（那张给操作员做审计视图的票）现在写的方案是接在老路上的，需要顺手改成接 `list_activity`，不然 #843 一开工就会往废弃的地方接。

## §3 本波未归档草稿（54 条）——哪些要开新 Issue，哪些不要

| Draft | Title | File as new issue? | Note |
|---|---|---|---|
| DRAFT-1 | `use-clara-thread-stop.test.ts` is a genuine, non-deterministic whole-suite flake in #630's lane | **YES** | File as new issue, ready-for-agent, exactly as drafted. Fold DRAFT-17's content into its body rather than filing that as a second issue. |
| DRAFT-2 | `packages/db/scripts/migrate.mjs` has no supported way to re-apply ("redo") one edited, unmerged migration | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-3 | Two cash expressions coexist unruled: `list_bank_statements`'s `tie.gl_balance_cents` vs. `get_client_financial_pack`'s governed "book cash" | **YES** | File as new issue, ready-for-human, as drafted. Note #675/#668 as adjacent-but-non-owning for awareness, not routing target. |
| DRAFT-4 | `scripts/wiki-lint-checks.mjs`'s `maskComments` desynchronises after an unbalanced quote/dollar token | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-5 | `clara.firm_document_limits` has no human writer | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-6 | Supavisor / pool headroom is not a settings figure (C81.5) | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-7 | Audit out-of-repo callers of `clara.get_llm_usage_summary` before the recut reaches hosted | **YES** | File as new issue, ready-for-human, as drafted; this is the wave's own instructed follow-up. |
| DRAFT-8 | 0233 hard-pins three unrelated bodies — a cross-ticket coupling to record | **YES** | File as new issue, ready-for-agent, as drafted (documents intentional fail-closed coupling). |
| DRAFT-9 | Move the document daily-ingest ceiling window from UTC to `Asia/Kuala_Lumpur` | **YES** | File as new issue, ready-for-agent, exactly as drafted; fulfils D4's own instruction. |
| DRAFT-10 | A file refused by the daily ingest ceiling before its intake exists can never become a durable batch member | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-11 | The intake recovery belt opening spool sidecars on every sweep causes Windows-only `EPERM` intake failures under load | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-12 | `sweep_intake_batch_cancellations` has no cadence of its own | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-13 | The CI World leg for intake batches runs third on a database two earlier legs already loaded, and none of them drains its queue | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-14 | Allow a different bookkeeper to re-issue a stop after the original canceller loses authority mid-batch | **YES** | File as new issue, ready-for-human, exactly as drafted. |
| DRAFT-15 | The pinned `shadcn` CLI adds a bogus `cn` production dependency on every resolved item | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-16 | Finish AC2's shadcn native-chat component migration (`attachment`, `message-scroller`) | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-17 | `use-clara-thread-stop.test.ts` leaks a reattach timer between cells | **NO** | Duplicate — fold into the ticket it duplicates instead of filing. Do not file as a second issue. Fold into DRAFT-1's filed issue (or close as duplicate of it once DRAFT-1 is filed). |
| DRAFT-18 | A `queued` admission event on the chat stream | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-19 | `x41.s4` reds on the persistent depreciation rig from a dated, pre-existing defect, not #651's | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-20 | Fold `preview_depreciation_run`'s duplicated aggregation into `_fa_run_period_core` | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-21 | A blocked depreciation queue has no Needs-you row | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-22 | Decide whether a locked period's depreciation charge is ever moved into the next open period, or only ever charged as arrears (D9) | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-23 | Fold `complete_fixed_asset_particulars` and `_fa_complete_particulars_core`'s duplicated wall | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-24 | Rule what counts as a "person's instruction" across the FA and plan lanes (`authority_ref` proves provenance, not authorship) | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-25 | `completeFixedAssetParticulars` and `disposeFixedAsset` still mint their own operation key | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-26 | `clara.get_depreciation_authority` never surfaces a retired authority's reason, author or window | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-27 | Drive AC4's park (`ask_question`) arm and a commit-window cancel on the trade-invoice lane | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-28 | `lib/wire.ts` discards every refusal detail key but `reason` | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-29 | A same-document-number duplicate probe for trade invoices, with an owner | **YES + comment** | Do not file as a standalone issue. Comment on #662 quoting the gap so it is picked up when #662 is implemented. |
| DRAFT-30 | Resolve a trade-invoice counterparty by TIN, or stop advertising the field | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-31 | #665's cutover must retire the legacy coding lane's posting-date due-date anchor | **NO (comment instead)** | Do not file as a standalone issue. Comment on #665 (once picked up) pointing at the pinned test `p655.due.anchor_document_date` as proof the legacy anchor must be retired as part of its cutover. |
| DRAFT-32 | Build a browser entrance to `POST /api/seeding/prepare` (prior-GL seeding) | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-33 | Decide what a Work-shaped opening record is, or rule that there is none | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-34 | Cut `read_opening_source` into a future `chatTurn_vN` | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-35 | Make a re-read opening document re-parsable | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-36 | Give the closed-fiscal-year refusal on an opening draft the opening basis's own words | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-37 | Reconcile the capability registry's four levels with "read deterministically into human-ticked proposals" | **YES** | File as new issue, ready-for-human, as drafted. Cross-link to #782 for awareness (same taxonomy, different question). |
| DRAFT-38 | Install Combobox/Popover without clobbering the owner-ruled Button | **YES** | File as new issue, ready-for-agent, as drafted, and flag as a BLOCKER for #667's own Combobox acceptance criterion. |
| DRAFT-39 | Per-line region citations on bank statement lines ("which page of the PDF") | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-40 | Widen `docs/ARCHITECTURE.md:297-299`'s pack-shaped-read ownership rule from the function to the shape | **YES** | File as new issue, ready-for-human, as drafted (belongs in a Wayfinder pass). |
| DRAFT-41 | Surface `get_context_pack`'s `last_projected_seq` / `has_stale_sources` somewhere | **NO (comment instead)** | Do not file as a standalone issue. Comment on #663 (once picked up) naming the existing fields as data #663's engine should surface. |
| DRAFT-42 | Represent two independent knowledge *sources* disagreeing, not just two records | **YES** | File as new issue, ready-for-human, as drafted, flagged as a PREREQUISITE for #665's accuracy-measurement work. |
| DRAFT-43 | The read-set key grammar (`record_work_knowledge_read`) is stricter than the catalog's own CHECK | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-44 | A `#NNN` ticket reference inside a linted string literal is banned by the raw-hex-colour rule, and nobody knows it | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-45 | Firm Home renders the client register twice (the new portfolio table and the older `clientsLine`/`clientsEmpty` tally) | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-46 | Mount `get_compliance_watch_disposition`'s read on `/settings/compliance` too | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-47 | `/clients/:id/tax` receipt has no browser leg | **YES** | File as new issue, ready-for-human, as drafted — flag the #627-owned fixture-file coordination need in the issue body. |
| DRAFT-48 | Delete `lib/firm/timeline.ts` and `clara.list_firm_timeline` deliberately, once a lane owns the decision | **YES + comment** | File the deletion decision as a new issue (ready-for-human), AND separately comment on #843 to flag that its plan to route new events through `list_firm_timeline` needs re-pointing at `list_activity` before #843 is implemented, since #659 already swapped Firm Home's read to `list_activity`. |
| DRAFT-49 | `ui:add` cannot invoke the shadcn CLI on Windows at all | **NO** | Already fixed in code — do not file. Do not file. Close/skip this draft as already resolved; if a tracking issue is wanted for the record, file it pre-closed with a pointer to commit fa6e71b9. |
| DRAFT-50 | Discharge the pre-0120 `closing_transfer` unmarked-history backfill | **YES** | File as new issue, ready-for-human, as drafted (needs hosted count read first). |
| DRAFT-51 | Cut the deferred chat tool `read_client_financial_pack` | **YES** | File as new issue, ready-for-agent, as drafted. |
| DRAFT-52 | Render `cash.composition` somewhere — nothing consumes it yet | **YES** | File as new issue, ready-for-human (per the ORIGINAL source triage's own routing, restored by the skeptic pass): #669's AC is exclusively AR/AP aging and does not actually cover cash.composition despite the wave digest naming it as a consumer; #670 is only a defensible partial match (DECISIONS D6 names a narrower GL-drilldown residual, not full cash.composition rendering). Do not resolve this by commenting on #669/#670 alone -- file it and let the issue itself carry both partial-consumer notes. |
| DRAFT-53 | A cash-account-set membership editor beyond the first publish | **YES** | File as new issue, ready-for-human, as drafted. |
| DRAFT-54 | Decide whether `clara.create_account_set_v1` (the 0058 writer) should retire | **YES** | File as new issue, ready-for-human, as drafted. |

**Summary**: 54 drafts total → file standalone: 48; file + comment: 2; do not file (comment on existing ticket instead): 2; do not file (already fixed or duplicate): 2.

## §4 老板确认 + PR #954 合并后，要在 tracker 上执行的确切动作

_Note: per this session's own git status, PR #954 has already merged to origin/main as `ede1df83` ("Merge pull request #954 from BELCORT-SDN-BHD/integration/wave-2026-09-18"), with `0cd2a17c` (the audited HEAD) as its ancestor. So the "PR #954 merges" gate below is already satisfied; the only remaining gate is the owner's confirmation. Every comment below starts with the required line._

### close-with-pointer (already_fixed → close, pointing at the fix)

```bash
gh issue close 693 --comment "$(cat <<'EOF'
> *This was generated by AI during triage.*

Windows-only: intake scanner cells fail because Defender quarantines the EICAR fixture

Verdict: already_fixed (skeptic-verified). close wontfix (already implemented) with pointer to packages/runtime/tests/eicar-fixture.mjs + commit b56e0f2a (the skeptic pass corrected the original 6375cc68 citation, which is an unrelated commit) (PR #817, merged to main 2026-09-14); the only unmet AC is the human 'please confirm on your Defender-active Windows machine and close' step, which is procedural, not code. Separately (not blocking this ticket): RIG.md's 'must NOT fix' line is stale boilerplate now that #693 has a real named skip instead of a silent ignore — worth a one-line doc fix next docs pass, not an agent ticket.
EOF
)"

```

### close-duplicate

No action needed yet: DRAFT-17 ("`use-clara-thread-stop.test.ts` leaks a reattach timer between cells") is a duplicate of DRAFT-1's content, but DRAFT-1 has not been filed as a GitHub issue yet — it is still an unfiled follow-up draft. There is nothing on the tracker today to close as a duplicate. Once DRAFT-1 is filed (see file-new below) and if DRAFT-17 is ever filed separately by mistake, close it with:

```bash
gh issue close <DRAFT-17-issue-number> --comment "$(cat <<'EOF'
> *This was generated by AI during triage.*

Duplicate of #<DRAFT-1-issue-number> (the whole-suite use-clara-thread-stop.test.ts flake). Folding into that issue instead of tracking separately.
EOF
)"
```

### comment-on-mainline (partly_fixed, planned_by_mainline, needs_owner, and keep tickets that need a pointer/narrowing comment)

```bash
gh issue comment 847 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

claraWork_v4: mirror the trace door's two bounds on the writer side

Verdict: partly_fixed. This is implemented ONLY on the integration worktree (HEAD 0cd2a17c, PR #954), NOT on origin/main. Do not close #847 yet — leave it open until PR #954 merges, then close it pointing at packages/runtime/lib/work-trace-bounds.mjs and the claraWork.v5.impl.ts import. The hosted run_id census is a genuinely outstanding AC.
EOF
)"

gh issue comment 862 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Lane mocks read POST bodies without the shared cache, so a shared verb loses data

Verdict: partly_fixed. narrow the ticket to just 'add the missing structural census cell to e2e-fixture-ownership.test.ts'; the one concrete instance (fixed-asset-mock.mjs) is already fixed (landed on main via PR #954/#651), so do not close #862 outright — the census cell that prevents regression still doesn't exist anywhere
EOF
)"

gh issue comment 865 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

`npx playwright test` silently serves a stale build instead of building from HEAD

Verdict: partly_fixed. keep open as ready-for-agent; documentation half satisfied only in ephemeral RIG.md, durable fix (comment in playwright.config.ts + BUILD_ID/age log in serve-built.mjs) still unbuilt in both files on both branches
EOF
)"

gh issue comment 868 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

`_subledger_on_approve` caller-census pin is stale everywhere it's copied

Verdict: partly_fixed. comment on #868 with the 0225 pointer and narrow the body to its single remaining AC — the durable COMMENT ON FUNCTION on `clara._subledger_on_approve` naming the six callers; can share one migration with #906 (both comment-only changes on a shared function)
EOF
)"

gh issue comment 882 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Fixed-asset CLR40 refusal handling needs cleanup

Verdict: partly_fixed. comment on #882 and narrow the body to half (b) ONLY once PR #954 merges (it already has): the pin cell (retire+approve in one transaction → CLR40) plus convention comment in both trigger bodies; half (a), the CLR40 refusal row + tests, is done and merged. Sequencing note: ride #932's migration rather than a standalone comment-only recut.
EOF
)"

gh issue comment 885 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

A document correction leaves affected Work questions answerable at their stale version

Verdict: partly_fixed. Keep #885 open, narrow remaining scope: visibility half (drift banner) closed by #658, mark closed on this ticket; functional half (cancel+supersede per owner's 2026-09-17 ruling) NOT built, remains live AC. Flag question to owner: does the #658 banner (warns only, does not block submission) satisfy the ruling that no answer can ever be given against a stale basis, or is the structural cancel+supersede fix still required?
EOF
)"

gh issue comment 899 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Client-creation entrances bypass the name-collision candidate check

Verdict: partly_fixed. narrow the ticket body to the residual: the ⌘K command-palette bypass and the still-granted legacy create_client verb; the Firm-Home-zero-client half is closed by #659's AddClientControl extraction (already merged via PR #954, not merely pending)
EOF
)"

gh issue comment 665 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Re: #665's cutover must retire the legacy coding lane's posting-date due-date anchor (source: DRAFT-31, an unfiled wave follow-up draft — do not file separately).

Do not file as a standalone issue. Comment on #665 (once picked up) pointing at the pinned test `p655.due.anchor_document_date` as proof the legacy anchor must be retired as part of its cutover.
EOF
)"

gh issue comment 663 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Re: Surface `get_context_pack`'s `last_projected_seq` / `has_stale_sources` somewhere (source: DRAFT-41, an unfiled wave follow-up draft — do not file separately).

Do not file as a standalone issue. Comment on #663 (once picked up) naming the existing fields as data #663's engine should surface.
EOF
)"

# DRAFT-29 (A same-document-number duplicate probe for trade invoices, with an owner): no single target ticket exists yet — this is the needs_owner question itself. File it as its own issue via the file-new block below, then have the owner answer directly on that issue rather than commenting elsewhere.

gh issue comment 843 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Re: Delete `lib/firm/timeline.ts` and `clara.list_firm_timeline` deliberately, once a lane owns the decision (source: DRAFT-48).

File the deletion decision as a new issue (ready-for-human), AND separately comment on #843 to flag that its plan to route new events through `list_firm_timeline` needs re-pointing at `list_activity` before #843 is implemented, since #659 already swapped Firm Home's read to `list_activity`.
EOF
)"

gh issue comment 782 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Document reading: state invoice line items as an accepted limitation, not planned (registry limit, copy, PRD)

Verdict: keep, unchanged. keep as ready-for-agent, unchanged. Add coordination note: since wave-18's #656 already raised registry_version to 2 by whole-table UPDATE, #782's own migration must mint version 3, never DELETE-then-INSERT
EOF
)"

gh issue comment 839 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Offer "Restate as a new instruction" on the Clara rail

Verdict: keep, unchanged. keep as ready-for-agent, unchanged. Sequencing note: #642's brief sequences #839 after #642 touches ClaraThreadView.tsx
EOF
)"

gh issue comment 861 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Activity-kind ladder misfiles events under "documents"

Verdict: keep, unchanged. keep as ready-for-agent, fully unblocked by owner's 2026-09-18 ladder-vocabulary ruling; coordinate with #840 (same two doors) — land in one migration if both picked up together
EOF
)"

gh issue comment 906 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

`clara._assert_journal_basis`'s `nonzero_total` arm is structurally unreachable

Verdict: keep, unchanged. keep as is; can share one comment-only migration with #868
EOF
)"

gh issue comment 909 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Scheduled-adjustment overlap detection is advisory-only and one-sided

Verdict: keep, unchanged. keep as is; add sequencing line naming #929 as the other recut of `_plan_overlap_warning` so two tickets do not race the same body
EOF
)"

gh issue comment 915 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

#653's chat entrance stops at a grant wall — `create_prepayment_schedule` has no `clara_runtime` twin

Verdict: keep, unchanged. narrow the body: replace 'the next chat successor (chatTurn_v21)'/'claraWork_v5 adds read_prepayment_source' with the next cut (chatTurn_v22/claraWork_v6, per DECISIONS D17); delete the 'one ceremony for all three (#847, #882(a))' sentence — that ceremony ran without #915; record #940's roster check as an added acceptance row
EOF
)"

gh issue comment 919 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Prepayment schedule reads do not flag a superseded term row; runtime README's standalone-e2e list undercounts

Verdict: keep, unchanged. keep as is, sequence first in the prepayment lane — #939/#940/#941 all name it as their blocker
EOF
)"

gh issue comment 929 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Retire the 0045 recurring-adjustment template lane (3/3): blueprint and vocabulary say one lane; plan-form advisory drops its template arm; close #788

Verdict: keep, unchanged. narrow the body: drop the PRD §69/§72 clause from AC1 (PRD never actually mentions templates — zero occurrences); keep CONTEXT.md/ARCHITECTURE clauses; add C08.1 disposition note for #683; state whether blueprint edits are taken here or handed to #683 per DECISIONS §4 convention
EOF
)"

gh issue comment 931 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Staff expense claim (2/2): discharge several advances through an explicit allocation list with a date-ordered suggestion (closes #881)

Verdict: keep, unchanged. keep, but narrow/correct the body: re-point AC5 and Blocked-by from chatTurn_v21 (already cut, frozen, without this) to the next chat cut (v22); delete stale '#847/#882(a)/#915 also ride' parenthetical
EOF
)"

gh issue comment 932 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Fixed assets (1/2): a default depreciation policy per enrolled asset account, applied at acquisition with its version recorded on the register row

Verdict: keep, unchanged. keep as is; add sequencing line: base frontier is now 0233 (PR #954, merged), 0227 already added change_class/change_reason to the same fixed_assets row — #932's recut of 0216's birth trigger must re-pin the LIVE post-0227 bodies
EOF
)"

gh issue comment 933 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Fixed assets (2/2): when the account has no policy, Clara proposes the depreciation particulars in the question and the person confirms (claraWork_v5; closes #883)

Verdict: keep, unchanged. keep, but narrow the body: re-point title/AC1 from claraWork_v5 (cut without it) to the next claraWork successor (v6); delete stale '#847/#882(a)/#915/#931 also ride' clause; replace Blocked-by with '#932 and the next claraWork cut'
EOF
)"

gh issue comment 935 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Firm setup (2/2): optional education tips with a read-or-later rendering, outside the required counters and the audit trail (closes #892)

Verdict: keep, unchanged. keep as is; note the existing defer_firm_setup_item door is NOT the acknowledgement path it wants (it audits and receipts); depends on #934 for the retire flag
EOF
)"

gh issue comment 938 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Accruals: surface a bill that posts inside an accrued period, with skip-this-period and reverse-now remedies

Verdict: keep, unchanged. keep as is; add comment pointing implementer at the now-written 'Settlement candidate row' mechanics contract (CONTEXT.md, landing with PR #954) so its read is built as a derived, self-clearing candidate row
EOF
)"

gh issue comment 942 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Accrued revenue: the accrual lane gains a revenue side (Dr accrued income / Cr revenue, auto-reversed), mirroring expense accruals

Verdict: keep, unchanged. keep as is; add line asking whether the asset account comes from #941's new template row or existing 1320 Unbilled Receivables
EOF
)"

gh issue comment 944 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Blueprint: state that Clara never derives a statutory rate but may read a printed figure (PRD 112, glossary, architecture)

Verdict: keep, unchanged. Keep as is; comment on #944 naming the residue its ACs don't cover: mainline #612/#643's own out-of-scope entry re payroll-document ingestion and PRD.md:127's deferred line both need the #926 ruling recorded as superseding them before #945/#946 build
EOF
)"

gh issue comment 945 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Payroll summaries: typed facts read from what the payslip prints, summed by a deterministic evaluator

Verdict: keep, unchanged. Keep as is; comment before pickup: (1) cite #926 ruling as superseding mainline #612/#643's payroll-ingestion exclusion, #944 must land first; (2) map onto seeded account codes (0150) rather than mint a parallel vocabulary
EOF
)"

gh issue comment 946 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Payroll summaries: draft and post the run unattended under the invoice lane's own gate

Verdict: keep, unchanged. Keep as is; comment on overlap with existing payroll_obligation lane (0194/#643) and settled_cents split (0212) — duplicate guard must also see obligations posted through that lane; narrow AC1 (only Salaries Payable missing, not 6000-6040/2100-2140); merge migration with #941/#949
EOF
)"

gh issue comment 947 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Payroll: find the net-pay payment on the bank statement and propose its settlement

Verdict: keep, unchanged. Keep as is; comment to retire its own open question (mechanism is now defined by #657's Settlement candidate row, per CONTEXT.md); add #946 to Blocked-by explicitly; note AC2 must reuse existing REVIEW_QUEUE_ROW_KINDS per carried rule
EOF
)"

gh issue comment 948 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Hire-purchase and finance-lease agreements: read the printed terms and draft the acquisition into the fixed-asset lane

Verdict: keep, unchanged. Keep as is; comment with factual correction: AC4's 'existing birth door' doesn't exist — 0216:293's trigger is lane-agnostic and fires on any posted entry debiting an enrolled FA account; depreciation particulars already come from fa_account_profiles
EOF
)"

gh issue comment 949 --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Tenancy agreements: a contract-terms record, and a recurring rent plan a person confirms

Verdict: keep, unchanged. Keep as is; comment with three narrowings: (1) name the credit account (merge chart migration with #946/#941 or state 2010 Other Payables); (2) justify or drop the new contract-terms table given existing append-only estates; (3) replace 'whichever lands first' with pointer to CONTEXT.md's Settlement candidate row (#657 defined it)
EOF
)"

```

### narrow-body (tickets whose recommended action is to rewrite/narrow the body text, not just comment — apply as an edit only after the owner reviews the exact wording; until then, post the same content as a comment via the commands above)

- #862: see the matching comment-on-mainline command above; convert to `gh issue edit 862 --body-file <narrowed-body>.md` once the owner signs off on the exact replacement wording (do not let an agent silently rewrite a human-authored ticket body).
- #868: see the matching comment-on-mainline command above; convert to `gh issue edit 868 --body-file <narrowed-body>.md` once the owner signs off on the exact replacement wording (do not let an agent silently rewrite a human-authored ticket body).
- #882: see the matching comment-on-mainline command above; convert to `gh issue edit 882 --body-file <narrowed-body>.md` once the owner signs off on the exact replacement wording (do not let an agent silently rewrite a human-authored ticket body).
- #899: see the matching comment-on-mainline command above; convert to `gh issue edit 899 --body-file <narrowed-body>.md` once the owner signs off on the exact replacement wording (do not let an agent silently rewrite a human-authored ticket body).
- #885: see the matching comment-on-mainline command above; convert to `gh issue edit 885 --body-file <narrowed-body>.md` once the owner signs off on the exact replacement wording (do not let an agent silently rewrite a human-authored ticket body).
- #915: see the matching comment-on-mainline command above; convert to `gh issue edit 915 --body-file <narrowed-body>.md` once the owner signs off on the exact replacement wording (do not let an agent silently rewrite a human-authored ticket body).
- #929: see the matching comment-on-mainline command above; convert to `gh issue edit 929 --body-file <narrowed-body>.md` once the owner signs off on the exact replacement wording (do not let an agent silently rewrite a human-authored ticket body).
- #931: see the matching comment-on-mainline command above; convert to `gh issue edit 931 --body-file <narrowed-body>.md` once the owner signs off on the exact replacement wording (do not let an agent silently rewrite a human-authored ticket body).
- #933: see the matching comment-on-mainline command above; convert to `gh issue edit 933 --body-file <narrowed-body>.md` once the owner signs off on the exact replacement wording (do not let an agent silently rewrite a human-authored ticket body).

### file-new (drafts to file as new GitHub issues, after owner confirms)

```bash
gh issue create --title "use-clara-thread-stop.test.ts is a genuine, non-deterministic whole-suite flake in #630's lane" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-1 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, exactly as drafted. Fold DRAFT-17's content into its body rather than filing that as a second issue.
EOF
)"

gh issue create --title "packages/db/scripts/migrate.mjs has no supported way to re-apply (\"redo\") one edited, unmerged migration" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-2 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Two cash expressions coexist unruled: list_bank_statements's tie.gl_balance_cents vs. get_client_financial_pack's governed \"book cash\"" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-3 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted. Note #675/#668 as adjacent-but-non-owning for awareness, not routing target.
EOF
)"

gh issue create --title "scripts/wiki-lint-checks.mjs's maskComments desynchronises after an unbalanced quote/dollar token" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-4 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "clara.firm_document_limits has no human writer" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-5 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Supavisor / pool headroom is not a settings figure (C81.5)" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-6 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Audit out-of-repo callers of clara.get_llm_usage_summary before the recut reaches hosted" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-7 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted; this is the wave's own instructed follow-up.
EOF
)"

gh issue create --title "0233 hard-pins three unrelated bodies — a cross-ticket coupling to record" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-8 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted (documents intentional fail-closed coupling).
EOF
)"

gh issue create --title "Move the document daily-ingest ceiling window from UTC to Asia/Kuala_Lumpur" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-9 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, exactly as drafted; fulfils D4's own instruction.
EOF
)"

gh issue create --title "A file refused by the daily ingest ceiling before its intake exists can never become a durable batch member" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-10 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "The intake recovery belt opening spool sidecars on every sweep causes Windows-only EPERM intake failures under load" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-11 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "sweep_intake_batch_cancellations has no cadence of its own" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-12 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "The CI World leg for intake batches runs third on a database two earlier legs already loaded, and none of them drains its queue" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-13 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Allow a different bookkeeper to re-issue a stop after the original canceller loses authority mid-batch" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-14 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, exactly as drafted.
EOF
)"

gh issue create --title "The pinned shadcn CLI adds a bogus cn production dependency on every resolved item" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-15 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Finish AC2's shadcn native-chat component migration (attachment, message-scroller)" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-16 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "A queued admission event on the chat stream" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-18 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "x41.s4 reds on the persistent depreciation rig from a dated, pre-existing defect, not #651's" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-19 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Fold preview_depreciation_run's duplicated aggregation into _fa_run_period_core" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-20 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "A blocked depreciation queue has no Needs-you row" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-21 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Decide whether a locked period's depreciation charge is ever moved into the next open period, or only ever charged as arrears (D9)" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-22 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Fold complete_fixed_asset_particulars and _fa_complete_particulars_core's duplicated wall" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-23 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Rule what counts as a \"person's instruction\" across the FA and plan lanes (authority_ref proves provenance, not authorship)" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-24 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "completeFixedAssetParticulars and disposeFixedAsset still mint their own operation key" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-25 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "clara.get_depreciation_authority never surfaces a retired authority's reason, author or window" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-26 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Drive AC4's park (ask_question) arm and a commit-window cancel on the trade-invoice lane" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-27 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "lib/wire.ts discards every refusal detail key but reason" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-28 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "A same-document-number duplicate probe for trade invoices, with an owner" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-29 (wave 2026-09-18 unfiled follow-up draft).

Do not file as a standalone issue. Comment on #662 quoting the gap so it is picked up when #662 is implemented.
EOF
)"

gh issue create --title "Resolve a trade-invoice counterparty by TIN, or stop advertising the field" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-30 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Build a browser entrance to POST /api/seeding/prepare (prior-GL seeding)" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-32 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Decide what a Work-shaped opening record is, or rule that there is none" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-33 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Cut read_opening_source into a future chatTurn_vN" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-34 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Make a re-read opening document re-parsable" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-35 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Give the closed-fiscal-year refusal on an opening draft the opening basis's own words" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-36 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Reconcile the capability registry's four levels with \"read deterministically into human-ticked proposals\"" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-37 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted. Cross-link to #782 for awareness (same taxonomy, different question).
EOF
)"

gh issue create --title "Install Combobox/Popover without clobbering the owner-ruled Button" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-38 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted, and flag as a BLOCKER for #667's own Combobox acceptance criterion.
EOF
)"

gh issue create --title "Per-line region citations on bank statement lines (\"which page of the PDF\")" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-39 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Widen docs/ARCHITECTURE.md:297-299's pack-shaped-read ownership rule from the function to the shape" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-40 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted (belongs in a Wayfinder pass).
EOF
)"

gh issue create --title "Represent two independent knowledge *sources* disagreeing, not just two records" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-42 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted, flagged as a PREREQUISITE for #665's accuracy-measurement work.
EOF
)"

gh issue create --title "The read-set key grammar (record_work_knowledge_read) is stricter than the catalog's own CHECK" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-43 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "A #NNN ticket reference inside a linted string literal is banned by the raw-hex-colour rule, and nobody knows it" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-44 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Firm Home renders the client register twice (the new portfolio table and the older clientsLine/clientsEmpty tally)" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-45 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Mount get_compliance_watch_disposition's read on /settings/compliance too" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-46 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "/clients/:id/tax receipt has no browser leg" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-47 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted — flag the #627-owned fixture-file coordination need in the issue body.
EOF
)"

gh issue create --title "Delete lib/firm/timeline.ts and clara.list_firm_timeline deliberately, once a lane owns the decision" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-48 (wave 2026-09-18 unfiled follow-up draft).

File the deletion decision as a new issue (ready-for-human), AND separately comment on #843 to flag that its plan to route new events through `list_firm_timeline` needs re-pointing at `list_activity` before #843 is implemented, since #659 already swapped Firm Home's read to `list_activity`.
EOF
)"

gh issue create --title "Discharge the pre-0120 closing_transfer unmarked-history backfill" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-50 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted (needs hosted count read first).
EOF
)"

gh issue create --title "Cut the deferred chat tool read_client_financial_pack" --label "ready-for-agent" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-51 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-agent, as drafted.
EOF
)"

gh issue create --title "Render cash.composition somewhere — nothing consumes it yet" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-52 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human (per the ORIGINAL source triage's own routing, restored by the skeptic pass): #669's AC is exclusively AR/AP aging and does not actually cover cash.composition despite the wave digest naming it as a consumer; #670 is only a defensible partial match (DECISIONS D6 names a narrower GL-drilldown residual, not full cash.composition rendering). Do not resolve this by commenting on #669/#670 alone -- file it and let the issue itself carry both partial-consumer notes.
EOF
)"

gh issue create --title "A cash-account-set membership editor beyond the first publish" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-53 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

gh issue create --title "Decide whether clara.create_account_set_v1 (the 0058 writer) should retire" --label "ready-for-human" --body "$(cat <<'EOF'
> *This was generated by AI during triage.*

Source: DRAFT-54 (wave 2026-09-18 unfiled follow-up draft).

File as new issue, ready-for-human, as drafted.
EOF
)"

```

---

## Appendix: verdict counts

| Verdict | Count |
|---|---|
| Already fixed | 2 |
| Partly fixed | 7 |
| Planned by mainline | 2 |
| Superseded by mainline | 0 |
| Duplicate | 1 |
| Conflicts with a ruling | 0 |
| Needs owner | 2 |
| Keep (still live, ready-for-agent/human, unchanged) | 125 |
| **Total** | **139** |
