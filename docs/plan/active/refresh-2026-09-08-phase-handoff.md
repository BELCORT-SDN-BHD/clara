# Clara refresh phase handoff

**Date:** 2026-09-09 (MYT)

**Purpose:** make the Wayfinder → `/to-spec` → `/to-tickets` → `/implement` boundary recoverable in a fresh session.

**Status:** handoff audit, not the product specification and not implementation evidence.

**2026-09-09 coverage checkpoint:** [the complete-prompt coverage review](https://github.com/BELCORT-SDN-BHD/clara/issues/597#issuecomment-5588454922)
adds the [59-request/34-journey/component audit](refresh-2026-09-08-original-prompt-coverage.md)
and [216-item historical register](refresh-2026-09-08-audit-register.md).
The [direct-debit scope decision](https://github.com/BELCORT-SDN-BHD/clara/issues/611#issuecomment-5588831144)
is confirmed and closed: observed-debit bookkeeping/settlement and authorised recurring accounting
plans are in scope; actual payment initiation and bank mandates remain future scope. The [Copilot follow-up](refresh-2026-09-08-copilot-motion-research.md)
now supplies bounded actual motion and official chart-reference evidence.
The [runtime boundary rig](refresh-2026-09-08-runtime-boundary-proof.md), local harness
commit `2d34cd3e`, extends the earlier proof with commit-before-checkpoint replay and PG
transaction ordering. The [fair runtime comparison](refresh-2026-09-08-runtime-route-audit.md)
is the route decision input; WorkflowAgent 1.0.70 supports Workflow 4, unlike its 2.x line.

Latest checkpoint: the [runtime route is resolved](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5588548302), with synthetic PG boundary proof at local harness `2d34cd3e` and a separately retained native WorkflowAgent v1 comparator. The [visual decision](https://github.com/BELCORT-SDN-BHD/clara/issues/609#issuecomment-5587677017) remains resolved at `8f72de0dd39fca702eb0c9cacd8fab5de8982223`. Audit classification and nested recovery now supply synthesis input. The direct-debit scope decision is also resolved, leaving no unanswered product decision in the frontier; production verification belongs to the implementation gates.

## Answer at this checkpoint

Wayfinder **decision convergence is complete**. The overall [Clara refresh：统一 accounting work、agent／KB 与工作台体验](https://github.com/BELCORT-SDN-BHD/clara/issues/597) map remains open because its destination expressly includes implementation and verification. Its child state at this checkpoint is:

| Ticket | State at this audit | Meaning for the boundary |
|---|---|---|
| [明确定期扣款的记账与支付边界](https://github.com/BELCORT-SDN-BHD/clara/issues/611#issuecomment-5588831144) | Closed; owner confirmed | Observed-debit bookkeeping/settlement and authorised accounting plans are included; actual payment initiation and bank mandate management remain future scope. |
| [核实当前 accounting engine、任务与聊天的真实契约](https://github.com/BELCORT-SDN-BHD/clara/issues/598); [研究 agent loop、Workflow 与 KB 的可用技术路线](https://github.com/BELCORT-SDN-BHD/clara/issues/599); [研究工作台、澄清与财务信息的 UI 模式](https://github.com/BELCORT-SDN-BHD/clara/issues/600) | Closed | Their research is input to synthesis. Closure is not implementation proof. |
| [确定 Accounting Work 的自动执行、生命周期与交互契约](https://github.com/BELCORT-SDN-BHD/clara/issues/601); [确定分录、业务对象与确定性校验的边界](https://github.com/BELCORT-SDN-BHD/clara/issues/602); [确定客户知识、身份与 agent context 的维护契约](https://github.com/BELCORT-SDN-BHD/clara/issues/603) | Closed | Accepted product decisions; do not reopen them during seam or ticket review. |
| [确定整体导航、页面职责与 shadcn 组件契约](https://github.com/BELCORT-SDN-BHD/clara/issues/604); [确定首页财务指标、聚合口径与数据新鲜度](https://github.com/BELCORT-SDN-BHD/clara/issues/608); [补齐全量前端用户流、交互状态与 Mobbin 对照](https://github.com/BELCORT-SDN-BHD/clara/issues/610) | Closed | Accepted navigation/data decisions and completed research coverage; still not a frontend implementation. |
| [验证统一 Clara agent harness 与持久化执行的实施路线](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5588548302) | Closed | Node22 / Workflow4 / ToolLoopAgent first successor selected after fair native1 comparison. Real business doors, delivery, streams and cutover remain implementation gates. |
| [比较并确定 Clara 页面的视觉、响应式和动效方案](https://github.com/BELCORT-SDN-BHD/clara/issues/609) | Closed | A Home + B Work and bounded visual/interaction conclusions are resolved. Production acceptance is recorded in the [visual evidence](refresh-2026-09-08-visual-decision.md). Do not reopen the selected direction. |
| [重判旧 audit 与 backlog，切出可验证实现切片](https://github.com/BELCORT-SDN-BHD/clara/issues/605) | Open; no open native blockers | Classification and nested obligations are ready for synthesis. This ticket stays open through concrete /to-tickets publication; its closure is not a prerequisite for /to-spec. |
| [等待成功提取后再分类文件，修复 OCR／classify 竞态](https://github.com/BELCORT-SDN-BHD/clara/issues/606) | Open, `ready-for-agent` | Independently identified implementation item. Its local migration/evidence is not deployed proof and does not move the whole refresh to implementation. |

A same-computer fresh session can continue once it reads the sources below. **GitHub alone is not sufficient today.** The reviewed SOT/evidence package is preserved separately on local `codex/research-ui-contract`; the research/prototype branches have no upstream. A new clone on another machine cannot recover unpushed commits from the issue map or local absolute links. Read the map's latest snapshot comment for the exact documentation commit.

The correct route is:

1. Read the [recorded direct-debit scope decision](https://github.com/BELCORT-SDN-BHD/clara/issues/611#issuecomment-5588831144), together with the resolved runtime, visual, Work, accounting and KB directions. Do not re-ask settled choices.
2. Synthesize the completed audit classification/nested-obligation input, explicitly carrying discovery, retained defects, superseded remedies and future-scope items into the formal spec and ticket graph. Keep the audit/slicing ticket open until concrete issue publication is done.
3. Run `/to-spec` to collapse the linked decisions and local evidence into a buildable spec, including review of its proposed test seams before publication.
4. Publish the reviewed formal spec to GitHub. Existing accepted direction is already authorised; do not repeat settled product decisions.
5. Run `/to-tickets`, review the concrete tracer-bullet split/blocking edges, and publish them. This fulfils the ticket-creation portion of the cross-phase audit/slicing ticket.
6. Start each unblocked ticket in a fresh `/implement` session. Keep the overall refresh map open until its implementation/verification destination is met.

## Phase completion gates

### Wayfinder decision convergence is complete when

- Every decision/research/prototype child that can change the build contract is resolved, or explicitly deferred/out of scope with a recorded owner/acceptance reason.
- The map’s Fog/Not-yet-specified section contains no unresolved choice required by the **full scope being published in the spec**, not only its first implementation frontier.
- The audit portion of [重判旧 audit 与 backlog，切出可验证实现切片](https://github.com/BELCORT-SDN-BHD/clara/issues/605) has classified old findings as still valid, locally verified, hosted verified, superseded, wrong premise, external/owner dependency, or unverified, and has supplied implementation obligations to synthesis. Its concrete issue creation may remain for `/to-tickets`. An old closed issue is never accepted as repair evidence by itself.
- The selected runtime and visual conclusions are recorded with their limits. A prototype or import/build proof does not become a production adoption claim.
- Product decisions are present in PRD/domain vocabulary and implementation facts are present in Architecture, with target and current behavior clearly separated.
- A fresh reader can recover the evidence needed by `/to-spec` from the recorded local snapshot and issue references. Same-machine recovery is available; another-machine handoff still requires a reachable evidence package as detailed below. This portability obligation is separate from product decision convergence.

The map remains the live destination/status container after this boundary because its destination includes implementation. It must no longer be the only place where build acceptance can be reconstructed. The **overall refresh map** is complete only when the accepted implementation slices and required verification are complete or explicitly disposed, not when Wayfinder decision convergence ends.

### `/to-spec` is complete when

- The session has read the full map, all relevant child bodies **and comments**, the local product-contract/evidence documents, current source where facts may have drifted, `CONTEXT.md`, and applicable ADRs.
- One tracker-published spec states the user problem, solution, extensive user stories, implementation decisions, testing decisions, out-of-scope items and further notes. It does not copy every research detail or contain fragile implementation file paths.
- Current behavior, accepted target, migration requirement and unverified/hosted gaps remain distinguishable.
- The spec covers the complete accepted product scope. Four prototype pages, 64 component dispositions, a tool reachable in v17, or an issue closure are not substitutes for journey/accounting acceptance.
- Test seams are reviewed at the highest stable boundary: business-operation receipt and coupled state; durable Work/question admission and recovery; source/fact/version correction; read-model projections; route-level desktop/narrow/focus behavior. Prefer existing database operation and route seams before inventing lower-level mocks.
- **Seam check handling:** reconcile the proposed seams with the accepted Accounting Work, accounting-operation, Knowledge, navigation, dashboard and A Home + B Work decisions. Do not ask the owner to reconfirm them. Ask only if a proposed seam changes product acceptance, authority or scope, or if the existing record is genuinely contradictory.
- The spec is labelled `ready-for-agent` as required by the configured GitHub tracker. This label means ready for ticket decomposition/agent work; it does not mean deployed.

### `/to-tickets` is complete when

- The source spec’s complete issue body and comments have been fetched in the ticketing session.
- Tickets are narrow, demoable vertical slices through required schema/door/runtime/read model/UI/verification layers. A “build frontend,” “install components,” or database-only horizontal ticket is not a tracer bullet.
- Each ticket names concrete user trigger, before/after behavior, affected accounting objects, recovery/failure states, evidence level and acceptance checks. Each fits one fresh context window.
- Native blocking edges are minimal and correct. Independent UI research or verified defects are not blocked by an unrelated runtime choice; coupled accounting invariants remain together. Wide mechanical refactors use expand–migrate–contract rather than pretending to be a vertical slice.
- The proposed split and edges receive a concrete review. This review asks about granularity, true blockers and merge/split choices; it does not reopen settled product direction. If the owner already explicitly approved that exact split and edge set, publish without a redundant confirmation.
- One GitHub issue exists per approved slice, in dependency order, with `ready-for-agent`. The parent/map remains unchanged except where the owning workflow separately calls for a status pointer.

### `/implement` is complete per ticket when

- A fresh session reads the whole ticket and comments, its blocking tickets/results, the formal spec, PRD, Architecture, Work pointer, CONTEXT/ADRs, and current source. It does not rely on a previous agent’s chat memory.
- The agent revalidates the exact current definitions and versions before changing stack/database integrations.
- Work proceeds at the pre-agreed highest seams with meaningful red/green slices where suitable; type checks and targeted checks run regularly, followed by the required broader suite once.
- The diff receives both standards and spec review, and material findings are fixed or explicitly retained.
- The implementation, tests, applicable migration/rollout notes, Architecture update and ticket evidence land together in a reviewable commit. PRD changes only if product intent changed during implementation.
- Local test, deployed version, hosted journey and production-data evidence remain separate. A ticket is not complete merely because the code compiled, a prototype worked, or a migration file exists locally.

## Sources of truth and update timing

| Source | Owns | Update point | Must not be used as |
|---|---|---|---|
| [Clara refresh：统一 accounting work、agent／KB 与工作台体验](https://github.com/BELCORT-SDN-BHD/clara/issues/597) and child issues | Live map destination/status, dependencies, claims, decision resolutions and evidence pointers | As a decision resolves, a blocker/status changes, and later as implementation evidence advances the destination | Complete product spec; implementation proof merely because a child closed |
| `docs/PRD.md` | Current product intent and accepted behavior | As soon as a product decision is accepted, before `/to-spec`/ticket publication; again only if later owner decisions change intent | Description of behavior merely proposed by code or already deployed |
| `docs/ARCHITECTURE.md` | Current implementation boundaries, versions, data flows and verified technical residuals | When current-source research corrects an implementation fact, and in the same implementation change when code/migration/integration behavior changes | Prospective architecture written as if it already ships |
| Root `CONTEXT.md` and relevant ADRs | Shared domain vocabulary; hard-to-reverse architectural/domain choices | When terminology or a durable decision is settled, before it is used in a spec/ticket; ADR only when the decision warrants it | Backlog or duplicated product specification |
| `docs/WORK.md` | Navigation from repository to live GitHub work and evidence snapshots | When tracker status, canonical evidence pointer or handoff stage materially changes | Second backlog or proof that linked work is complete |
| Formal `/to-spec` issue | Build acceptance, user stories, implementation/testing decisions and exclusions | Once Wayfinder gates close; revise when an approved acceptance change occurs | Live ticket status or a dump of every research note |
| `/to-tickets` GitHub issues and native dependencies | Executable slice scope, per-slice acceptance, owner and frontier | After split/edge review; update when real blockers or acceptance change | Re-litigation of already accepted product direction |
| `docs/plan/active/refresh-2026-09-08-*` | Cited research, prototypes’ conclusions, current/target/gap matrices and bounded acceptance detail | At research/prototype conclusion; then treat as dated evidence and supersede visibly rather than silently rewriting history | Current deployment status or sole live backlog |
| Code, migrations, tests and receipts | Implemented behavior and verification evidence | In each implementation change and rollout record | Product intent when it conflicts with PRD, or hosted proof without deployment/observation |

At the audit start, PRD and Architecture had substantial local edits. Their headers and Work correctly assign product intent and current implementation, but the root review found the extraction paragraph needed an explicit local-candidate label; that correction is now made. Record a reviewed local documentation snapshot separately from the dirty runtime/config changes, and distinguish that local snapshot from a remotely fetchable commit. SOT updates should not wait until all implementation finishes.

## Fresh-session entry

### Same computer, current working directories

Read in this order:

1. Repository `AGENTS.md`, then `.agents/skills/ask-matt/SKILL.md` and `PHASE-BOUNDARIES.md`; for the chosen phase read `to-spec`, `to-tickets` or `implement` in full.
2. `CONTEXT.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/WORK.md`, applicable `docs/adr/`.
3. Read the full body/comments of [Clara refresh：统一 accounting work、agent／KB 与工作台体验](https://github.com/BELCORT-SDN-BHD/clara/issues/597), then every relevant child and live dependency state. In particular re-read [验证统一 Clara agent harness 与持久化执行的实施路线](https://github.com/BELCORT-SDN-BHD/clara/issues/607), [比较并确定 Clara 页面的视觉、响应式和动效方案](https://github.com/BELCORT-SDN-BHD/clara/issues/609), [重判旧 audit 与 backlog，切出可验证实现切片](https://github.com/BELCORT-SDN-BHD/clara/issues/605) and [等待成功提取后再分类文件，修复 OCR／classify 竞态](https://github.com/BELCORT-SDN-BHD/clara/issues/606) rather than relying on the map’s cached summary.
4. `docs/plan/active/refresh-2026-09-08-product-spec.md` as a **v0.1 accepted-behavior plus proposed-implementation draft**, then the evidence relevant to the slice. Start with:
   - `refresh-2026-09-08-backend-evidence.md`
   - `refresh-2026-09-08-accounting-boundaries-evidence.md`
   - `refresh-2026-09-08-kb-contract-evidence.md` and `refresh-2026-09-08-kb-format-recheck.md`
   - `refresh-2026-09-08-agent-harness-validation.md` and `refresh-2026-09-08-answer-admission-evidence.md`
   - `refresh-2026-09-08-frontend-flow-coverage.md`, `refresh-2026-09-08-frontend-interaction-contract.md`, Documents/Bank contracts, dashboard data evidence and component disposition
   - `refresh-2026-09-08-audit-triage.md` and prior-research reconciliation for the audit/slicing ticket
5. Inspect current source and dependency versions at the actual implementation seam. The dated documents intentionally preserve gaps and may lag later code.

Recommended fresh-session instruction:

> Continue the Clara refresh map at the current phase boundary. Read this handoff, full issue bodies/comments and live dependencies, then the local PRD/Architecture/Work/CONTEXT and cited evidence. Treat accepted decisions as authorised and do not reopen them. Wayfinder decision convergence is complete. Run `/to-spec` using the resolved direct-debit/runtime/visual decisions and completed audit input. Preserve the to-spec seam reconciliation and the to-tickets concrete split/blocker review. Distinguish accepted target, current source, local checks, deployed version and hosted evidence.

### Local branch and artifact manifest

These local branches have no upstream. The closing checkpoint updated the documentation, runtime and visual branches below. A receiving session must re-run `git status`, `git rev-parse HEAD` and the upstream check before relying on this dated manifest.

| Purpose | Branch / commit | Same-machine path | Important limits |
|---|---|---|---|
| Reviewed SOT, active research and v0.1 product-contract snapshot | `codex/research-ui-contract`; closing hash in the map's snapshot comment (supersedes `ca57d3148e68e37bc86f6dd4afa3ebdddb66d404`) | `C:\Users\zhant\Desktop\clara-rebuild-research-ui-contract` | Documentation/evidence only, byte-for-byte copies of the reviewed main files; not runtime/config candidate code or production implementation. Unpushed. |
| Selected A Home + B Work visual prototype | `codex/prototype-clara-visual` @ `8f72de0dd39fca702eb0c9cacd8fab5de8982223` | `C:\Users\zhant\Desktop\clara-rebuild-prototype-clara-visual` | Runnable synthetic local harness, screenshots and component/dependency diff live only here. No production data/API/persistence; unpushed. |
| Durable-agent harness evidence | `codex/research-agent-harness` @ `2d34cd3e` | `C:\Users\zhant\Desktop\clara-rebuild-agent-harness` | Local Node/PostgreSQL commit-before-checkpoint and transaction-ordering proof, supporting the selected route; production migration and hosted proof remain outstanding. Unpushed. |
| Accounting Work state prototype | `codex/prototype-accounting-work` @ `4121d9edcc783f254574b545d03c014b1bcaf58d` | `C:\Users\zhant\Desktop\clara-rebuild-prototype-accounting-work` | Throwaway synthetic HTML interaction model. Unpushed. |
| Earlier UX research | `research/ux-pattern-library` @ `1c7d9d87bf8a86ed1d0bdaeef2b45e2b3e5688cb` | `.claude/worktrees/agent-a90152015d514b990` | Historical/supporting research; unpushed. |
| Earlier shadcn mapping | `research/shadcn-mapping` @ `ad9ec9a1e3762f52c124d9bf13b7296b6f8e95a3` | `.claude/worktrees/agent-abe98780280733d4d` | Supporting component research; unpushed. |
| Earlier OKF mapping | `research/okf-mapping` @ `b271de44157b516cad1ccd2ebdf6967b6c43449e` | `.claude/worktrees/agent-adec78f62d32bacba` | Supporting format research; accepted KB contract lives elsewhere. Unpushed. |
| Earlier agent-platform research | `research/agent-platform-apis` @ `41c3f8dfd18e0f0300614f9774af08a5058f5454` | `.claude/worktrees/agent-af5034095577813f4` | Versioned research input; later executable agent-harness evidence supersedes parts. Unpushed. |

The main checkout remains at `68ab4323`, with SOT/document edits and unrelated runtime/config changes coexisting. The documentation snapshot captures AGENTS, CONTEXT, PRD, Architecture, Work, all 31 active refresh Markdown files, the synthetic Accounting Work HTML, the PG proof machine-result copy and ten reproducible native-v1 comparator files without committing those runtime/config changes. Earlier snapshots `ca57d314` and `3210728a` and prototype/runtime history remain available. The main-only 0177 migration and consumer candidate are deliberately not included in this documents-only snapshot; OCR validation points to that separate local candidate and its remaining checks.

## Portability gaps and required handoff action

1. **GitHub issue text is an index, not the evidence archive.** The map contains useful decision summaries and child links, but it does not reproduce the detailed 34-journey, accounting, KB, bank/document, audit and runtime evidence. A fresh session must read the linked local sources or their future committed equivalents.
2. **GitHub comments contain machine-local absolute paths.** Paths such as `C:\Users\zhant\Desktop\clara-rebuild\...` are useful on this computer and unusable in another clone. Replace or supplement them with repository-relative links after the documents are committed.
3. **Clean local commits are still non-portable.** A commit hash on an unpushed branch cannot be fetched from another machine. Preserve the branch refs locally; before a new-machine handoff, push an authorised evidence branch or integrate the reviewed artifacts into a reachable repository commit.
4. **The reviewed SOT/evidence snapshot is local.** PRD, Architecture, Work, CONTEXT, AGENTS and the active-plan documents are captured on `codex/research-ui-contract`, separately from the main checkout's unrelated dirty code/config. Its exact closing commit is recorded in the map's snapshot comment. This preserves the files locally; it does not make the branch remotely fetchable.
5. **The product-spec file is not the formal `/to-spec` output.** It labels itself v0.1 and contains accepted behavior plus proposed implementation. The formal phase must synthesize current map decisions and publish the build contract to the tracker; the Wayfinder decisions needed for synthesis are now resolved.
6. **Implementation readiness is uneven.** [等待成功提取后再分类文件，修复 OCR／classify 竞态](https://github.com/BELCORT-SDN-BHD/clara/issues/606) may proceed independently. The broad refresh cannot skip `/to-spec`: the resolved scope/runtime decisions and completed audit input must be read, while the audit/slicing ticket may stay open for `/to-tickets` to finish its issue-creation portion.

For another machine, the minimum portable package is: reviewed PRD/Architecture/WORK/CONTEXT; this handoff; the active evidence set; reachable prototype/research commits or exported artifacts; and GitHub issues whose links are repository-relative. Until that package is committed/pushed, “continue from GitHub map” is a same-machine instruction only.

## Audit limits

The initial worker audit was read-only: it read skills, tracker/domain instructions, local SOT documents, worktrees/refs, GitHub state and representative comments. The root then updated the phase/SOT pointers, resolved the bounded visual decision, recorded the runtime checkpoint and preserved the reviewed documentation package locally. The visual and runtime evidence files identify the actual checks and their limits. This handoff did not re-audit every research assertion, publish the formal spec/full implementation breakdown, deploy a change, or push a branch.
