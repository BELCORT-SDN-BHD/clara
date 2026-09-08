# Clara — Work

The active refresh is tracked in the [Clara refresh decision map](https://github.com/BELCORT-SDN-BHD/clara/issues/597). GitHub is the canonical place for decision status, dependencies, claims and implementation tickets; this page is a navigation pointer, not a second backlog.

The [original prompt and research coverage index](https://github.com/BELCORT-SDN-BHD/clara/issues/597#issuecomment-5581385429) connects the full refresh request, owner answers, prior Claude research and named Mobbin references to their owning tickets. It records remaining visual-research gaps and distinguishes charting, decision convergence, the draft spec and later implementation.

The previous Clara v2 map was withdrawn on 2026-09-08. Its closed issues provide historical evidence, not current requirements or proof of implemented fixes. The desktop three-report disposition dated 2026-09-06 is also a historical input that must be checked against current source and the accepted refresh direction.

## Current work

The [phase handoff](plan/active/refresh-2026-09-08-phase-handoff.md) explains how a fresh session
reads the full GitHub decisions and local evidence before `/to-spec`, reviews the concrete
`/to-tickets` breakdown, and implements unblocked GitHub issues. It also assigns PRD,
Architecture, domain vocabulary and verification updates to their owning phase. The current
map includes implementation, so the map's overall closure is not a prerequisite for writing
the formal spec. The audit/slicing ticket's audit findings and implementation obligations
inform the spec; its ticket-publication work continues through `/to-tickets` rather than
creating a circular requirement to close that ticket first. Important evidence is still local;
a new clone cannot recover unpushed branches from GitHub issue links alone.

- [Current engine, task and chat baseline](https://github.com/BELCORT-SDN-BHD/clara/issues/598)
- [Agent, Workflow and KB technology research](https://github.com/BELCORT-SDN-BHD/clara/issues/599)
- [UI patterns and component research](https://github.com/BELCORT-SDN-BHD/clara/issues/600)
- [Accounting-work lifecycle and autonomy](https://github.com/BELCORT-SDN-BHD/clara/issues/601)
- [Journal entries, business objects and accounting checks](https://github.com/BELCORT-SDN-BHD/clara/issues/602)
- [Client knowledge, identity and context](https://github.com/BELCORT-SDN-BHD/clara/issues/603)
- [验证统一 Clara agent harness 与持久化执行的实施路线](https://github.com/BELCORT-SDN-BHD/clara/issues/607)
- [Navigation and component contracts](https://github.com/BELCORT-SDN-BHD/clara/issues/604)
- [Audit disposition and implementation slicing](https://github.com/BELCORT-SDN-BHD/clara/issues/605)
- [Wait for successful extraction before classification](https://github.com/BELCORT-SDN-BHD/clara/issues/606)
- [确定首页财务指标、聚合口径与数据新鲜度](https://github.com/BELCORT-SDN-BHD/clara/issues/608)
- [比较并确定 Clara 页面的视觉、响应式和动效方案](https://github.com/BELCORT-SDN-BHD/clara/issues/609)
- [补齐全量前端用户流、交互状态与 Mobbin 对照](https://github.com/BELCORT-SDN-BHD/clara/issues/610)

Product decisions are incorporated into [PRD](PRD.md) as intended behaviour. [Architecture](ARCHITECTURE.md) describes current implementation. A newly accepted product direction is not deployment evidence.

The [visual decision resolution](https://github.com/BELCORT-SDN-BHD/clara/issues/609#issuecomment-5587677017)
now closes the A Home + B Work prototype decision; [bounded visual evidence](plan/active/refresh-2026-09-08-visual-decision.md)
records keyboard, focus, reflow and reduced-motion checks plus remaining production acceptance.
Prototype commit `8f72de0dd39fca702eb0c9cacd8fab5de8982223` remains isolated.
The [combined runtime checkpoint](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5587678356)
adds [ToolLoopAgent inside the compiled Workflow restart rig](plan/active/refresh-2026-09-08-tool-loop-workflow-merge-proof.md)
and [current runtime Node 22 build/typecheck](plan/active/refresh-2026-09-08-runtime-node22-build-proof.md).
Its current-authority, cancellation, delivery and version-cutover decision remains open; it is
now the audit/slicing ticket's remaining open native blocker. The audit input is not yet complete,
and no formal spec or full implementation breakdown has been published.

The frontend scope is a detailed rebuild of every in-scope journey, object action and UI state.
Home/Work/Documents/Journals prototypes establish reusable direction, not full coverage. The
frontend-flow ticket maps each journey to backend state, relevant inspected Mobbin evidence,
component choice and desktop/narrow/state acceptance; omitted and retired entry points remain
accounted for. The [full frontend flow coverage](plan/active/refresh-2026-09-08-frontend-flow-coverage.md)
now inventories 34 grouped journeys, each expanded in the [interaction contract](plan/active/refresh-2026-09-08-frontend-interaction-contract.md).
The [Documents contract](plan/active/refresh-2026-09-08-document-flow-contract.md) and
[Bank contract](plan/active/refresh-2026-09-08-bank-flow-contract.md) each add current source paths,
target steps, explicit implementation gaps and 12 acceptance cases. The
[additional Mobbin references](plan/active/refresh-2026-09-08-frontend-reference-supplement.md)
record exactly which frames were inspected. This completes the research coverage deliverable;
the audit/slicing ticket owns concrete implementation cuts. The visual decision is now resolved;
the runtime decision remains open. Uninspected vendor states are not claimed as observed,
and integrated state verification remains implementation work. A complete component catalog
review or journey contract is not a completed frontend rebuild. The
[补齐全量前端用户流、交互状态与 Mobbin 对照 resolution](https://github.com/BELCORT-SDN-BHD/clara/issues/610#issuecomment-5587196374)
records the completed research, local snapshot `ca57d3148e68e37bc86f6dd4afa3ebdddb66d404`
on `codex/research-ui-contract`, and its limits. The concrete obligations are passed to
[重判旧 audit 与 backlog，切出可验证实现切片](https://github.com/BELCORT-SDN-BHD/clara/issues/605#issuecomment-5587207504);
its remaining open native blocker is the runtime decision.

The [确定分录、业务对象与确定性校验的边界 resolution](https://github.com/BELCORT-SDN-BHD/clara/issues/602#issuecomment-5582778719) records the accepted accounting-operation and downstream-impact contract, with implementation and verification still assigned to the later slices.

The [确定客户知识、身份与 agent context 的维护契约 resolution](https://github.com/BELCORT-SDN-BHD/clara/issues/603#issuecomment-5583365852) records the unified Knowledge and learning contract. [KB evidence](plan/active/refresh-2026-09-08-kb-contract-evidence.md) and the [current OKF recheck](plan/active/refresh-2026-09-08-kb-format-recheck.md) distinguish reusable source behaviour from migration gaps.

## Evidence discipline

Each implementation ticket must identify the concrete trigger, resulting behaviour, affected accounting state, recovery path and acceptance checks. Distinguish source inspection, executed local tests, deployed versions and observed hosted journeys. Retain unverified findings explicitly; do not close defects merely because an old umbrella issue was closed.

Initial refresh evidence is retained in [audit triage](plan/active/refresh-2026-09-08-audit-triage.md) and [UI research](plan/active/refresh-2026-09-08-ux-research.md). Detailed reports are evidence snapshots; live status belongs to the linked tickets.

The [product and execution contract draft](plan/active/refresh-2026-09-08-product-spec.md) brings the owner-confirmed scenarios together with proposed implementation and page contracts. It labels the proposals separately and does not claim the full refresh is implemented.

The first bounded implementation has [local OCR/classification verification evidence](plan/active/refresh-2026-09-08-ocr-fix-validation.md), including the remaining full-chain and hosted checks.

The [研究工作台、澄清与财务信息的 UI 模式 resolution](https://github.com/BELCORT-SDN-BHD/clara/issues/600#issuecomment-5583876289) records completed static-flow/component research. [确定整体导航、页面职责与 shadcn 组件契约](https://github.com/BELCORT-SDN-BHD/clara/issues/604#issuecomment-5583995499) records the accepted navigation and interaction responsibilities. The [interactive Work prototype](plan/active/prototypes/accounting-work-interaction.html) is a resettable synthetic state model; [Efferd reference notes](plan/active/refresh-2026-09-08-efferd-reference.md) carry the owner's glass-style preference into the visual comparison.

[Executable agent-harness validation](plan/active/refresh-2026-09-08-agent-harness-validation.md) now includes a passing Node 22/PostgreSQL 17 process-kill/restart proof with persisted hooks/SSE and a trusted synthetic-state reread. [Current answer admission](plan/active/refresh-2026-09-08-answer-admission-evidence.md) confirms a reusable database first-answer gate and durable delivery path; the raw SDK observation is not a demonstrated Clara duplicate-answer defect. Actual crash-window redelivery, atomic authority-through-commit, version cutover and full cancellation/deletion boundaries remain open. This is not an adopted production migration or completion of the full Wayfinder map.

[Dashboard data evidence](plan/active/refresh-2026-09-08-dashboard-data-evidence.md) distinguishes current queries from the required Work/financial read models. The [确定首页财务指标、聚合口径与数据新鲜度 resolution](https://github.com/BELCORT-SDN-BHD/clara/issues/608#issuecomment-5585923205) settles counts, four financial summaries, three charts, continuous-ledger cash, period/comparison, permissions, coverage and refresh acceptance; implementation remains outstanding. The owner [selected A's dashboard with B's Work component](https://github.com/BELCORT-SDN-BHD/clara/issues/609#issuecomment-5585630778). Local prototype commit `8f72de0dd39fca702eb0c9cacd8fab5de8982223` on `codex/prototype-clara-visual` includes the native shell, four metrics, three charts, Work Tabs and a synthetic streaming Clara/Questionnaire flow, plus the closing keyboard, focus and reduced-motion fixes. Its [visual decision evidence](plan/active/refresh-2026-09-08-visual-decision.md) records the checks and limits, including narrow-sheet transcript remounting. The [64-component disposition](plan/active/refresh-2026-09-08-component-contract-research.md) distinguishes main installation, isolated prototype use and future acceptance. The prototype is not a production implementation; full frontend implementation and agent integration remain open.
