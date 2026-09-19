# Orchestrator decisions — wave 2026-09-18 (binding for every brief)

Written by the orchestrator after reading the ten reconciled gap maps (`gap-<n>.md`, each authored, refuted by a
citation lens and a design/safety lens, and reconciled) and spot-checking their load-bearing anchors in source at
`abcc5030`. `SYNTHESIS.md` (a worker's cross-ticket re-verification) is read beside this file; where the two disagree,
this file rules and says so in §6. Every brief's "Orchestrator decisions (binding)" section derives from here; a brief
may refine but never contradict it. Decisions marked **[owner-overridable]** are product calls made conservatively from
PRD / ARCHITECTURE / CONTEXT / the Wayfinder resolutions so the wave can proceed autonomously (the owner asked for the
ten tickets to be implemented and is not in the room); the owner can reverse any of them and the affected slice is
reversible (beta, test data). Everything here is local-evidence scope; hosted evidence is never claimed.

The previous wave's rulings (`../refresh-wave-2026-09-15/DECISIONS.md` §0 D1–D13, §1, §3) stay in force except where
§6 below names an override.

## 0 · 大白话给 owner（可推翻的裁定）

| # | 票 | 问题（产品语言） | 今天 | 我裁定 | 另一选项的代价 |
|---|---|---|---|---|---|
| D1 | #635 | 事务所设置页要不要显示价钱？ | 库里唯一一行套餐是「Clara Beta / 0 分 / MYR」，且带 `amounts_ruled=false`——数据库自己说「价还没裁」 | **一个价都不出现**：写「Beta，尚未定价」；`amounts_ruled` 做渲染条件，业主哪天裁了价不改代码就会显示 | 显示 RM 0.00 让人以为永久免费；显示别的数字等于实现层替业主定价（C-01 / C-56 禁止） |
| D2 | #635 | 法务发了新版 Terms/DPA 之后，老板在产品里能不能点「我接受」？ | 接受条款的界面只在注册流程里；新版一发、全所 Clara 当场停摆，Work 详情叫人去接受却**没有链接可去** | **能，且只有 owner 能**：新读门返回 `can_accept_for_firm`，界面按它显示控件；接受走现有 `accept_legal_document`（人类专属门不动） | 不做 = 架构 §5.E 写明的唯一恢复途径在产品里不存在 |
| D3 | #635 | 「这个月 Clara 烧了多少钱」用什么币、按什么日历？ | 价格表被 CHECK 钉成 USD；月窗口是 UTC 日 | token 数与调用次数永远显示；USD 金额显示但标注「供应商计价，非账簿金额」，**绝不换算**；月窗口按门返回的 UTC 起止日如实标注。顺手给这扇今天**没有职级墙**的用量门补上 admin 墙（重切，签名不变） | 换算成马币 = 发明汇率；只显示 token = 老板问「花了多少钱」答不出 |
| D4 | #636 | 一批 100 份正好撞到每日额度（默认 100 份/1000 页）怎么办？ | 第 101 份被 CLR18 顶回；额度按 **UTC 日**算，不是马来西亚日 | 「被额度挡住」成为孩子的一种**明确等待状态**（`awaiting_capacity`），照抄数据库的拒绝原因和 operator 补救；**不改默认额度、不动三个预留函数**；UTC/MYT 不一致记成具名残留并另开一张票 | 改额度 = 在一张聚合票里动 0007 原始主干 |
| D5 | #636 | 「一批」要不要出现在 Work 列表里？要不要有对话入口？ | Work 表上没有「属于哪一批」；对话入口不存在 | 批次住在 **Documents 一侧**（批次卡 + 每个孩子链到自己的 Work 详情）；Work 详情加**一行**「属于批次 X」；**不重切 Work 列表**；对话入口只写合同，这波不切（事务所层的对话指挥是 #664 的） | 给 `list_accounting_work` 加参数 = 在按签名普查的门上造重载 |
| D6 | #642 | 这波要不要装 shadcn 原生聊天组件（Message / Scroller / Bubble / Attachment / Marker / Avatar）？ | 六个一个都没装；装要多拉 `@shadcn/react`，并重写产品里最敏感的无障碍区（一个 `role=log` + 五个互斥 `role=status`） | **装，但分两步、同一票**：先用现有代码把行为做实测绿（滚动锚定、跳到最新、内容哈希的重复送出钥匙、断线替换、实时工具四态、`revoked`），再把外观迁到原生组件、同一套测试继续绿。到期迁不完 → 行为先交，组件迁移记具名残留。票是 **XL** | 只做行为 = AC2 明文点名的组件一个不装，票面残留一整条 |
| D7 | #651 | 折旧要不要搬进「会计计划」的共享调度器（AC5 的半句话）？ | `CONTEXT.md` 白纸黑字「折旧不是计划种类，按名拒绝」，数据库也按名拒绝；折旧已有自己的授权和皮带 | **不搬**。给折旧授权补齐计划法律真正要求的两件事：**指向哪条指令**（`authority_ref`）和**从哪个月起往前跑**（`authority_from`）。AC5 措辞与词汇表的冲突记为 spec 漂移 | 搬 = 重切 `accounting_plans.kind` CHECK、`create_accounting_plan`、`_plan_*` 四个体，并改词汇表 |
| D8 | #651 | admin 签一次折旧授权，会不会静默补提过去两年？ | 会——皮带只问「最早哪一期没提」 | **不会**：`authority_from` 默认签署当月一号、之后冻结；更早期间只能走显式补提门 | 什么都不改 = C9 明令禁止的静默回填 |
| D9 | #651 | 已经关账的期间跑到折旧怎么办？ | 先起草稿、批准时撞墙，死草稿卡住这个客户之后所有期间 | **在跑的那扇门上直接拒绝**（新 CLR38 轴 `period_closed`，点名财年和怎么重开），一张草稿都不起；「把这一期挪到下一个开着的期间」**这波不做**，留给 owner 另裁 | 做「挪期」= 两期折旧塞一张分录 + 回执加字段 + 报表口径，是独立一票 |
| D10 | #651 | 改年限 / 改政策 / 更正算错，三种改动都做吗？ | 一个字段都没有，全按「估计变更」处理 | **记三类、只实现「估计」**；政策与更正按名拒绝并指向 **#680**（锁期后的迟到资料与重开决定——追溯重述就是这条路），拒绝文案里同时点名 #679 的锁期法则。（原写 #676 是错的：#676 管的是已分配账项的更正，与固定资产无关；设计评审核实后改正） | 现在做追溯重述 = 碰关账期间和重开路径（#679/#680 地盘） |
| D11 | #655 | 发票/账单要不要重切过账核心（上一波明令禁止）？ | Work 车道的过账核心**明文拒绝**碰应收/应付控制科目（`generic_control_leg`）；发票/账单按定义必须打控制科目 | **切第六次，只开一条极窄的口**：仅当该 Work 在新表 `clara.trade_invoices` 有一行时放行控制科目分录，其余十七条拒绝原样并在尾部逐条重证。上传 autodraft 车道**这波不搬**，只交「两条车道账务结果等价」的测试 | 另起平行过账门 = 把重放/取消/外发/回执四套保证复制一遍 |
| D12 | #655 | 交易对方名字对不上、贷项、到期日谁定？ | 到期日只会「过账日 + 对方账期」拼，单据上印的日期进不了库 | 对方模糊 → **准入时拒绝并附候选**（人在表单/对话里选了再提交），运行中才发现的缺事实走共享问题；**贷项这波不做**，按名拒绝（`credit_shape_not_admitted`）；到期日**单据写的优先、账期兜底、没有就记「无」**，来源存成一列 | 先建 Work 再问对方 = 一件不知道对方是谁的 Work |
| D13 | #656 | 读试算表的程序接在哪？读不懂一行怎么办？Clara 要不要对话入口？ | 读表程序写好了没人调用；建期初对话框把「凭哪份文件」写死成空；能力目录说「前期总账只存不用」是错的 | 接在 **OCR 那一步**（非冻结文件，不用新车道）；读不懂**整张拒绝并点名每一行**（人只补那一行）；能力目录改成 v2（UPDATE 提版本，不删重插）；**这波不开对话入口**，合同写好 | 新车道 = 加 CHECK 值 + 切 `_enqueue_invoice_facts_core`，L 变 XL |
| D14 | #657 | 银行行匹配时候选模糊，用什么承载「这一行还没人认领」？ | 数据库那条匹配路径完整扎实；人看得见的那一半缺候选信息、缺重试幂等、缺例外恢复路径、没有问题对象 | **不新建 Work/问题对象**：一条**派生的、不存东西的、匹配一落地就消失**的 Needs-you 行。它和 #947/#949 的「已入账的预期找候选银行行」是**镜像的兄弟**，共用同一套机制（派生、不存、只给候选不替人选、自动消失）；#657 先落地，把这套机制写进 CONTEXT.md（*Settlement candidate row*），自己是第一个实例；#938 算不算这一家由 #938 自己决定。B3 写路径这波不建，记残留。`/bank` 六个子页全部改成可寻址 URL | 建存储对象 = 新 purpose 或撕开 0180 的「一件 Work 一个问题」不变量 |
| D15 | #657 | 「点两次只算一次」怎么修？ | 网页每点一次现场生成新钥匙，数据库的幂等从网页**走不到** | **一个决定一把钥匙**（意图哈希，`useDecisionKey` 现成写法）；同时把 agent 车道 `split_part(op_key,':',2)` 换成结构化绑定（重贴 13 个 core，全部量 sha、尾部逐个断言） | 只修网页 = C33.8 那行历史义务继续挂着 |
| D16 | #658 | Clara 读不到客户知识时，是停下还是照旧入账？ | 知识读失败**故意不拦**；对话车道读失败被 `catch` 吞成「没上下文」 | **分层**：核心层（政策类、authority_bearing、五个遗留 key）读不到就**停**，settle 成可恢复失败，一分钱不入账；其余层降级 `partial` 并在 Work 上写明只读到一部分。「你当时依据的记录变了」放在**脸上 + runtime 复查**，不动 `answer_work_question` | 全不拦 = 一条被撤回的客户例外可以静悄悄不出现；全拦 = 网络抖动挡掉一笔完全有依据的账 |
| D17 | 全波 | 这波切哪几个冻结正文？要不要顺手带上等着的 #847 / #882(a) / #915？ | 上波结束时说好 `chatTurn_v21` / `claraWork_v5` 由 #847、#882(a)、#915 等共用一次仪式 | **切两个，各一次，在集成阶段**：`claraWork_v5`（#658 的读取步 + 两个读工具 + 失败终态 + 漂移重规划 + 能力目录 v2）**顺带交付 #847**（trace 写入侧界限）、**#882(a)**（CLR40 → refusal）和架构钉在下一版的 bundle 摘要覆盖工具 schema；`chatTurn_v21` 承载 #655 的 `start_trade_invoice_work`、#651 的 `run_depreciation_period_for_client`、#658 的对话侧有界知识读。**#915 不在本波**（它自己的迁移是它自己的票；下次 v22 和 idea 轮的对话半边一起切） | 不切 chatTurn_v21 = 发票/账单和折旧「用一句话让 Clara 做」这条 AC 整波空着 |
| D18 | #659 | 事务所首页：入门中客户算不算？合规「已确认」能不能看见谁确认的？零客户怎么建？ | 首页数字全所合计；入门中客户在「需要你」里结构性隐形；确认记录对任何应用角色都读不到 | 不改数据库墙，用 `coverage_reason` 说明两个人口口径；**新建窄读门** `get_compliance_watch_disposition`（交付 C88.10）；`AddClientControl` **抽成共享模块**给首页复用（顺手关掉 #899 一半）；合规行 **link-only**；「最近成功」列保留并诚实标注「按开始日期」的口径分歧；最近活动换到 `list_activity` 并渲染执行人 | 首页加内联操作 = 推翻已裁设计、同一治理门两个调用点 |
| D19 | #660 | 「哪些科目算现金」谁来定？老年度利润算错怎么办？要不要装图表库？ | 数据库答不出「现金类」；零用现金永远打不上标；0120 之前的年结结转旗是 false | **新建受治理的「现金科目集合」**（版本化、admin 发布、含有余额的停用账户与零用现金、每个成员带理由）+ 一个提议读；老年度 → **披露为「覆盖不全」，不修数据**（另开票，先数托管行数）；**装 Recharts**（走 `ui:add chart`，表格兜底必有）；客户首页**期间选择器**（13 个月 + 本月至今，进 URL）；viewer 可读 | 借用 0058 的报表科目集合 = 它写死 `is_active`，正好排掉这张票要的停用账户 |

## 1 · Frozen-body plan

**1.1 The answer.** Two bodies are cut this wave, each ONCE, by the integration worker after the ten merges:
`chatTurn_v21` and `claraWork_v5`. No `documentIngest_v3` (#656 measured its closure needs nothing), no `bankAgent_v2`
(#657 rides `_agent_get_bank_pack_core`'s jsonb), no `autoDraft_v11` (#655 leaves the upload lane as is), no
`clientOnboarding_v6`.

**1.2 What each body carries** (the worker's "successor contract" stanza is the source; the integration worker copies it):

| Body | Contract owner | Tool / step | Door (argument order fixed by the stanza) |
|---|---|---|---|
| `chatTurn_v21` | #655 | `start_trade_invoice_work` (`.strict()` discriminated union sales_invoice / supplier_bill; NEW non-frozen carrier `packages/runtime/lib/trade-invoice-basis.ts`) | `clara.admit_trade_invoice_work(...)`, the door's refusal map as the brief fixes it (the gap map's thirteen tokens PLUS `invalid_total` — fourteen; the count is descriptive, the door's own raise ladder is the contract), existing `work_accepted` part, NO `WORK_ACCEPTED_PURPOSES` widening |
| `chatTurn_v21` | #651 | `run_depreciation_period_for_client` (`{client_id, through?}` — no caller-named period) | `clara.run_depreciation_period_for(uuid,date,text,uuid)` (NEW name, `clara_runtime` only; `run_depreciation_manual` never reaches a machine role) |
| `chatTurn_v21` | #658 | the chat-turn knowledge preload repointed from `get_context_pack`'s recency dump to the bounded `clara.retrieve_knowledge` read, with read failure surfaced as a typed status (never swallowed) | `clara.retrieve_knowledge(p_client,p_purpose,p_as_of,p_keys,p_limit,p_firm)` — **conditional**: the integration worker drops this stanza to "contract only" if it destabilises v21, and says so in `successors-final.md` |
| `claraWork_v5` | #658 | `loadWorkKnowledgeStepV5` (core / requested / remainder tiers), tools `read_knowledge_source` + `read_knowledge_history`, terminal `knowledge_read_failed` (core tier only, recoverable, nothing posted), drift replan at resume spending one existing `budget.replans`, NEW sibling `lib/capability-registry-v2.mjs` (`clara-capability-registry/v2`) | `clara.retrieve_knowledge`, `read_knowledge_record_for`, `read_knowledge_history_for`, `record_work_knowledge_read`, `work_knowledge_drift_for` |
| `claraWork_v5` | rider #847 (stanza written by #658's worker from the ticket + ARCHITECTURE:373-386 + `0210:32-41`) | writer-side mirror of 0210's two trace bounds (a NEW module the v5 body imports; `work-trace.mjs` stays untouched); the writer's clause stays **no tighter** than the door's | — |
| `claraWork_v5` | rider #882(a) (stanza written by #658's worker from the ticket) | one row in `claraWork.v5.errors.ts`: `(CLR40, fa_cost_adjustment_deferred) → refusal` with the human remedy; a cell proves the Work settles as a refusal | — |
| `claraWork_v5` | ARCHITECTURE:435-445 | the bundle digest covers **each tool's JSON schema and declared dependencies**, not `tools:{id,names}` alone | — |

**1.3 Rules.** No implementation worker cuts a body, edits a frozen file, or edits `registry.ts`. Every NEW runtime
module a body will import (`trade-invoice-basis.ts`, `knowledge-retrieval.mjs`, `capability-registry-v2.mjs`, the
work-trace bounds module) is written by its ticket's worker OUTSIDE every frozen closure, imported by nothing frozen,
and understood to **freeze at the cut** — durable rules therefore live in the migration, never in these modules.
v1–v20 / v1–v4 stay exported and in `workflowBodies` (stranded-body gate). Engine stamp `llm-openai:<modelId>:chatturn-v21`.
The successor cut is reviewed and re-checked like a ticket (`reports/successors-*.md`).

**1.4 What ships without the cut.** Everything else: the nine migrations, the human web doors, the new non-frozen
runtime modules and routes, the World e2e legs. #658's Work-lane behaviour (AC1–AC3) is "contract delivered, closes
at the cut" and its brief says so; #655 AC3's chat half and #651 AC5's Clara link likewise.

## 2 · Migration allocation (frontier 0224 → this wave 0225–0233; #642 ships no migration)

**2.1 The rule.** Each file recuts a DISJOINT function family, so the nine are parallel-mergeable and the number
order is a merge order, not a dependency order. Each worker measures every pin on its own rig (base 0224); the
integration worker re-runs the from-scratch chain 0001→0233 on a fresh cluster. Two maps may NOT recut the same
function: measured below, none do.

| # | Ticket | File | Creates | Recuts (pin off `pg_proc.prosrc` on the rig) |
|---|---|---|---|---|
| 0225 | #655 | `0225_trade_invoices.sql` | `clara.trade_invoices` + append-only status ledger + AFTER INSERT trigger on `operation_receipts`; `clara.admit_trade_invoice_work(...)` (`clara_runtime` only, #638's eight-step order, replay probe before any write, typed row AFTER the unchanged `_admit_accounting_work_core` returns, `on conflict (work_id) do nothing`); `_assert_trade_invoice_basis`; lane-agnostic deferred open-item birth trigger; due-date source column | **`clara._record_journal_entry_core` — the SIXTH full copy** (live = 0204:152; one new conditional at the control-leg arm 0204:550-570 + counterparty stamp on control lines; all seventeen refusal tokens re-asserted in the tail). NOT recut: `_admit_accounting_work_core`, `_subledger_on_approve` (caller set stays SIX; the tail re-derives both censuses, closing #868's copy in this file only), `_validate_entry_lines` |
| 0226 | #657 | `0226_bank_match_evidence.sql` | `clara.get_bank_line_matching_context(uuid)` (granted wrapper over ungranted `_wdb_line_booking_block`) | `list_bank_match_candidates(uuid,uuid)` AND its verbatim twin inside `_agent_get_bank_pack_core` (same migration; tail asserts field parity), `_match_bank_line_core` (live 0121:1863; richer `_finish_op` incl. `new_journal_entries:0 / settlement_objects:0`; public 6-arg signature untouched — three arity censuses), `_agent_verify_inputs_digest` DROP+CREATE replacing `split_part` with a structured task binding **+ 0129's caller loop over the thirteen cores, every post-image sha asserted in the tail; if any core has diverged from 0129's shape, STOP and report instead of patching**; and, inside the same disjoint bank family, `_agent_bank_receipt` so `bank_agent_receipts.wake_task_id` is actually WRITTEN (the append-only table admits no backfill; without it C33.8's round trip has nothing to read) |
| 0227 | #651 | `0227_depreciation_history.sql` | `change_class`/`change_reason` on revision rows of `clara.fixed_assets` (+CHECK; `policy`/`error` refused CLR37 `fa_change_class_unsupported` naming **#680**); `_fa_assert_period_open(uuid,date)` (ungranted helper, CLR38 `period_closed`, written for #678 to reuse); `authority_kind` / `authority_ref` / `authority_from` on `fa_depreciation_authorities` (backfill `date_trunc('month', signed_at)`; **the floor applies to the SEQUENCING oracle `_fa_oldest_unmet_period` for the belt, never to the poster `_fa_run_period_core`** — the design lens measured that flooring the poster livelocks the belt (0042:4441) and that `run_depreciation_manual` already IS the human catch-up door D8 names, so no new catch-up door); `preview_depreciation_run(uuid)` (viewer, wrapper over ungranted `_fa_compute_charges`); `run_depreciation_period_for(uuid,date,text,uuid)` (`clara_runtime` only). The file writes ITS OWN single-`pg_proc`-row census for every name it installs (0103's census covers only 0103's names) | `_fa_run_period_core`, `_fa_oldest_unmet_period`, `_fa_validate_particulars`, `revise_fixed_asset_particulars` (KEEP the 5-arg signature), `complete_fixed_asset_particulars` (+ its 0216 `_for` twin if the validator change reaches it), `sign_depreciation_authority` — **two of these are 0042 string splices (§S5.15c 0042:4097-4221, §S5.15d 0042:4225): measure the live bodies**; two live CI exact-set censuses bind the recuts (`_wdb_rerun_breach` consumers = four names, `origin='scheduled_run'` writers) and must stay green; `_fa_asset_json` / `get_fixed_asset` ONLY if the arrays they already return do not suffice (prefer no recut) |
| 0228 | #656 | `0228_opening_ledger_source.sql` | UPDATE of `clara.document_capabilities` rows `prior_gl` / `opening_balance_doc` to `registry_version 2` with corrected `business_operation` (UPDATE, never DELETE-then-INSERT — #846; 0207's monotone trigger permits); tail proves no app role gained privilege | none by default. **Conditional**: if the rig cell proves `approve_opening_seed` has no period/lock guard, add the refusal ONLY as a narrow recut with measured pins on that multiply-spliced body; otherwise a named residual + follow-up |
| 0229 | #636 | `0229_intake_batches.sql` | `clara.intake_batches` (firm-scoped, no client_id, no stored counts, origin CHECK admitting `'chat'` for #664), `intake_batch_members` (unique `intake_id`; nullable client/document/work ids; dependency CHECK `awaiting_fact / awaiting_attribution / awaiting_capacity`), append-only `intake_batch_member_events` — **all three FORCE RLS with the 0221 parent/child policy pair, no app-role DML, runtime SELECT-only on the children**; the member ids are STAMPED, never joined at read time: `document_id` by an AFTER UPDATE trigger on `document_intakes` at the NULL→non-NULL custody transition, `work_id`+`client_id` by ONE lane-agnostic AFTER INSERT trigger on `accounting_work` reading the Work's single `source_refs` document (additive; `_tf_accounting_work_immutable` untouched); read `get_intake_batch(p_batch,p_preview)` (`clara_authenticated`, SECURITY INVOKER, 0214 envelope: distinct work ids, completion = committed receipt, coverage + reason, no total, no percentage); doors `open_intake_batch`, `attach_intake_to_batch`, `set_intake_batch_member_dependency`, `cancel_intake_batch` — **actor-explicit, `clara_runtime`-only, inline live-authority recheck at bookkeeper rank, on the `create_document_intake` (0007:1825-1841) / `cancel_accounting_work` precedent; no `_human_ctx` twin** (the web reaches them through `intakeRoutes.ts`); `cancel_intake_batch` flips the parent to `cancelling` and returns live child ids; the runtime fans out `cancel_accounting_work` per child with a DERIVED op key `<parent op_key>:<work_id>` so a killed fan-out resumes idempotently (new `lib/reconciler-batches.mjs` arm registered beside the other nine) | none |
| 0230 | #658 | `0230_knowledge_retrieval.sql` | `retrieve_knowledge(...)` (`clara_runtime` ONLY — #783 stands; `p_limit` out of range refuses CLR10 `knowledge_limit_out_of_range`), `read_knowledge_record_for`, `read_knowledge_history_for`, `work_knowledge_reads` (FORCE RLS, append-only, status in ok/partial/unknown/denied, NO FK to `accounting_work`, sole writer `record_work_knowledge_read` deriving work/firm/client from the agent_tasks→accounting_work join), `work_knowledge_drift(p_work)` (human, viewer floor) + `work_knowledge_drift_for` (runtime) over one core with the `observed_revisions` fallback, **and a SEVENTH door `list_work_knowledge_reads_for_record(p_record)`** (`clara_authenticated`, SECURITY DEFINER, viewer floor, client-scoped) so C13's record detail can list the Work that read a record — AC5's "historical basis" half needs it and the relation has no app-role SELECT | none (`get_context_pack` and `get_knowledge_pack` untouched) |
| 0231 | #659 | `0231_firm_portfolio_pack.sql` | `get_firm_portfolio_pack(p_limit,p_cursor,p_preview)` (SECURITY INVOKER, bookkeeper floor by 0189/0214's inline predicates, firm from `jwt_firm()`, distinct Work counts per client, coverage + reason, `computed_at`; keyset `order by lower(c.name), c.id` with a `lower(name)|uuid` cursor and typed refusals for an invalid/non-finite cursor; **no money key — prosrc tail assertion**; no period parameter); `get_compliance_watch_disposition(p_watch)` (SECURITY DEFINER, bookkeeper floor, no new table grants; `state_before → state_after`, no invented version). **May add ONE partial index on `accounting_work`** if the first-red `explain (analyze, buffers)` on a seeded 300-client / 20k-Work rig shows a sequential scan the three existing indexes do not cover; name it in the report | none |
| 0232 | #660 | `0232_client_financial_pack.sql` | `cash_account_set_versions` + `cash_account_set_members` (0058 shape, `member_reason in ('bank_registry','declared_cash','declared_petty_cash')`, NO `is_active` filter, integrity trigger); `publish_client_cash_account_set(...)` (admin, op-key idempotent); `propose_client_cash_accounts(uuid)` (viewer, structural candidates only, never petty cash); `get_client_financial_pack(uuid,date,date)` (viewer floor, full envelope per figure group; profit excludes `is_year_end and closing_transfer`; coverage `partial` + `closing_transfer_unmarked_history` when an unmarked year-end entry sits in the period) | none |
| 0233 | #635 | `0233_firm_commercial_settings.sql` | `get_firm_legal_standing()` (viewer floor, identity masked below bookkeeper, `standing_live` + `can_accept_for_firm`), `get_firm_commercial_state()` (admin: plan with `amounts_ruled`, payment booleans, `invoices:{available:false,reason:'not_collected'}`, document-limit capacity), `get_firm_ai_usage(date)` (admin, `price_currency`) | `get_llm_usage_summary(uuid,date,uuid)` — body-only: `_human_ctx(role_rank('admin'))` as the first statement; signature, return type, ACL unchanged |

**2.2 Numbering discipline.** Stable stems (gates match `_trade_invoices$`, `_bank_match_evidence$`, …), never
numbers; one preintegration gate module per battery, appended to `packages/db/package.json`'s chain in MIGRATION
order after `preview-invite-preintegration-gate.mjs`; one `rig-meta.mjs` cohort per migration (0228 and 0233 may be
comment-only where no new relation exists); a focused run of the battery without its gate FAILS below its migration.
Every recut pins the live pre-image `sha256(prosrc)` measured on the rig and re-proves owner / SECURITY DEFINER /
`search_path` / ACL byte-for-byte in the tail. Signature overloads are refused by executable censuses
(`0103:1055-1070` for the eleven names 0103 installs, `0126:2129-2139`, the bank arity censuses): a new
parameterisation is a NEW verb, and **every new migration writes its own single-`pg_proc`-row census for the names it
installs** (0103's census does not reach them).

**2.3 Follow-ups the design lens surfaced, to be filed by the owning worker's report:** no open ticket owns a browser
entrance to `POST /api/seeding/prepare` (the prior-GL seeding proposal lane) — #656 names it in `prior_gl`'s registry
`limits` sentence and files it; the opening lane carries no `accounting_work` / `operation_receipts` shape at all, so
#656's AC5 "Work and receipt" closes as a named residual with an owner question (a Work-shaped opening record would
widen the closed purpose list — §0.4 of SYNTHESIS).

## 3 · Shared surfaces and ownership (one-line registrations for everyone else)

| Surface | Owner this wave | Others |
|---|---|---|
| `components/work/work-detail.tsx` | #658 (the Sources tab's new content) | #658 mounts a NEW knowledge component + drift banner in the Sources tab via one hook line; #636 adds one "part of batch X" row via one hook line; #655 adds ONE link block (its AC5 links: object / open item / receipt) inside an existing block; #642 does not edit it. Sequence at integration: #658 → #655 → #636 |
| `components/firm/client-workspace-overview.tsx`, `client-home/*` | #660 | #656 none; #636 at most one link (prefer none); #659 none |
| `components/clara/*`, `lib/clara/*`, `lib/parts/*` | #642 | NO new part kinds this wave (every map: none); #655/#651/#658 add stanzas, not kinds |
| `lib/documents/useUploadQueue.ts`, composer attach | #642 | #636 threads ONE optional `batchId` through the transport (one hunk, commented); #642 must not remove it |
| `components/documents/documents-workbench.tsx`, intake receipts | #636 (batch card) | #642 none |
| `components/bank/*`, `lib/bank/*` (all five `*-doors.ts`) | #657 | nobody else touches `/bank` this wave |
| `components/accounting/accounting-hub.tsx`, `lib/journals/api.ts` | #655 | #656 adds `is_opening_balance` to `ENTRY_SELECT` + one badge in ITS OWN hunk |
| firm Home (`app/(firm)/page.tsx`, `firm-home-board.tsx`, `use-review-queue.ts` via a NEW composing hook), `client-register-list.tsx` (AddClientControl extraction) | #659 | #642 does not edit `app/(firm)/layout.tsx`; a needed height contract is a question in its report |
| `e2e/home-board-walk.spec.ts` + `home-board-mock.mjs` | shared — both APPEND | #659 appends firm-board cells + handlers, #660 appends client-home money cells + handlers; neither restructures the dispatch; #902's `debt` declaration stays untouched; if a lane's walk grows past ~40 cells it may split its OWN cells into a new spec file that imports the shared mock |
| `/settings/*` shell, `lib/firm/capabilities.ts` (one FLOOR row) | #635 | #658 touches only the knowledge section's panel, if at all |
| `lib/firm/needs-you.ts` `REVIEW_QUEUE_ROW_KINDS` | — | **NO new row kind this wave** (rule carried from 2026-09-15 §1.6). #657's pending line renders on the bank surface and, if an existing kind fits, through it; otherwise a named residual |
| `lib/navigation/tree.ts`, `messages/en.json`, `test/manifest.txt`, `e2e/serve-built.mjs`, `e2e/e2e-fixture-ownership.test.ts`, `packages/db/tests/rig-meta.mjs`, `packages/db/package.json`, `.github/actions/db-live-gates/action.yml`, `CONTEXT.md` | shared | one-line registrations at the sorted position; every mock verb declared, shared verbs declared shared; POST bodies only via `readCachedJson` |

**3.1 CONTEXT.md terms ratified now** (house "term / _Avoid_" shape; the named ticket writes them; integration unions):
#656 — *Opening basis*, *Opening source*, *Opening target*, *Provenance: document-sourced vs keyed*;
#636 — *Intake batch*, *Batch member*, *Member dependency* (awaiting_fact / awaiting_attribution / awaiting_capacity);
#655 — *Trade invoice* (unqualified "invoice" = a client's accounting document; the firm's own billing document does
not exist), *Due-date basis* (stated / counterparty_terms / absent), and the boundary that its `lines` are journal
basis lines, never extracted invoice line items (#782); #657 — *Settlement candidate row* (derived, stores nothing,
offers candidates never chooses, self-clearing — the shape #938/#947/#949 inherit), *Match basis* (deterministic
evidence, never a score); #651 — *Depreciation change class*, *Depreciation authority window*; #658 — *Knowledge
read status* (ok / partial / unknown / denied — the four live values every face uses), *Knowledge read-set*;
#659 — *Firm portfolio pack* (counts, never money); #660 — *Cash account set*, *Book cash* (never a statement
balance); #635 — *Firm legal standing*, *Billing plan* (unpriced until `amounts_ruled`), *Model usage summary* (tokens
and calls; USD is the provider's price, never book money); #642 — *Turn key* (content-addressed intent identity),
*Conversation scope* (the firm/client band beside the composer), *Tool outcome* (the four live states + refused).
#658 may additionally extend the EXISTING *Knowledge pack* entry's _Avoid_ list with its two clauses (approved here,
so the ten-lane CONTEXT union does not read it as an unratified edit). Every other addition is a refinement the
integrator unions at its sorted position.

**3.2 Boundaries ruled** (the maps agree unless noted): #651 vs #932/#933 — policy SOURCE is #932/#933, run ENGINE +
schedule + charge history is #651; #651 does not stamp policy at birth and does not recut 0216's birth trigger.
#658 vs #663 — detector (reads, versions, drift, replan trigger) vs engine (correction-driven re-evaluation); #658
writes no knowledge. #636 vs #664 — #636 owns the parent object and the join (origin CHECK admits `chat`); #664 fills
chat grouping later. #636 vs #655 — #636 never mints a child Work; it joins whatever Work names the document.
#655 vs #660/#669 — AR/AP outstanding tiles are #669's; #660 ships cash + profit + two charts only. #655 vs #657 —
#655 births the open item, #657 allocates against it and ships no settlement door. #656 vs #661 — targets side vs
items side. #659 vs #660 — firm Home renders NO money (Wayfinder: 不汇总客户金额). #657 vs #675/#671 — #657 owns
the matching face and the shared chassis #667 drops into; certification and exception resolution stay theirs.
#635 vs #660 — model-usage USD never appears beside book money.

## 4 · Evidence law (every brief)

Every AC and historical row closes with a red-first cell (`p<n>.<area>.<name>`), a browser-walk leg, or a **named**
residual; REDESIGN rows are re-measured, never copied. New DB batteries assert through `humanQuery` least-privileged
personas (never `rootQuery` except labelled fixture DML). World legs run on the worker's own rig with
`WORKFLOW_POSTGRES_URL`; a skipped frontier-gated battery is not evidence; local ≠ hosted ("hosted evidence pending").
Blueprints are never edited; each report carries "blueprint drift" lines (the maps already list PRD:59, :65, :79,
:108, :109, :120, :121, :123, :126 and ARCHITECTURE:134-135, :182-183, :207, :232-235, :287, :293, :373-386,
:435-445, :524, :529-530, :535) for #683's sync.

## 5 · Riders and non-goals

Folded in **[owner-overridable]**: #847 and #882(a) at the `claraWork_v5` cut (§1.2); the ARCHITECTURE-binding bundle
digest; C88.10 via #659's disposition read; half of #899 via #659's shared `AddClientControl`; #868's stale pin in the
one file #655 rewrites. **Not** folded: #915 (own migration; rides v22), #905 (no `list_accounting_work` recut —
#659 and #636 state the started-vs-posted divergence on the surface), #876 (#636 does its own set-shaped filing join
internally), #861 (ladder untouched; residual named on #659's surface), #866 (T10b — report, don't fix), #782 (#656
touches only the two opening rows), #904, #913, #921 (own row in `tree.ts`).

Non-goals stated in code comments and reports: #658 captures / corrects / promotes nothing; #660 repairs no
historical `closing_transfer`; #655 admits no credit shape and moves no upload lane; #651 implements no `policy`/`error`
restatement and no locked-period "accepted treatment"; #636 mints no Work and raises no quota; #635 shows no price,
no Stripe ids, floors `firm_document_limits` nowhere (follow-up); #659 adds no inline attention actions and no money.

## 6 · Overrides of the 2026-09-15 rulings, and SYNTHESIS reconciliation

- **§1.3 "no core recut" is overridden for #655 only**, on the measurement that the Work lane's posting core refuses
  every control-account leg by name (0204:550-570) and a trade invoice cannot exist without one. #655 is the sole
  recutter of `_record_journal_entry_core` this wave; the window it opens is conditional on a `trade_invoices` row.
- **§1.6 "no new needs-you row kind" stays.** **D11 (identity provenance only) stays** — #655 writes no alias.
- **D13 (activity ladder untouched) stays** — #659 swaps the READ to `list_activity` and names #861 on the surface.
- **SYNTHESIS reconciliation (2026-09-18, after `SYNTHESIS.md` landed):**
  - §2 order: SYNTHESIS proposes 0225 #655 · 0226 #657 · 0227 #651 · 0228 #635 · 0229 #656 · 0230 #658 · 0231 #660 ·
    0232 #659 · 0233 #636; this file keeps 0228 #656 · 0229 #636 · 0230 #658 · 0231 #659 · 0232 #660 · 0233 #635. Both
    are valid — SYNTHESIS §0.1/§2.1 measured that no two files recut the same function, so numbers are a merge order
    only. **This file's numbers stand**; its caveat that #655 might wait on an owner ruling is moot (D11 rules it).
  - §1 (A1): SYNTHESIS recommends cutting only `claraWork_v5`; **D17 overrules** and cuts `chatTurn_v21` too, because
    the two ACs it closes (#655 AC3's chat half, #651 AC5's Clara entrance) are the product's stated default posture
    (PRD §1: agentic by default; chat is a peer entry). Cost accepted: one more freeze ceremony at integration.
    SYNTHESIS §1.7's fact that #847 / #882(a) have no written stanza is answered by assigning **#658's worker** to write
    both stanzas (from the tickets and ARCHITECTURE:373-386, :435-445) in its successor-contract section, so the
    integrator reconciles written text only. **Part kinds**: implementers register none; #658 carries the
    knowledge-unavailable status on an EXISTING kind if any fits, and only if none does the integration worker
    registers `knowledge_unavailable` with its reader in the same cut. #636's `intake_batch_accepted` stays
    contract-only (D5).
  - §4 (#657 vs #949): **ruled — #657 is a sibling instance, not bound by #949's precedence sentence**, but the
    MECHANICS are one family: derived row, stores nothing, offers candidates and never chooses, self-clearing. #657
    writes that mechanics contract into CONTEXT.md as *Settlement candidate row* and names its bank-line row as the
    first instance; #947/#949's "candidate bank lines for a posted expectation" is the mirror; whether #938 belongs is
    #938's own question. D14 and §3.1 read accordingly.
  - §3.1 ownership: adopted for `home-board-walk.spec.ts` + `home-board-mock.mjs` — **both #659 and #660 append** (firm
    board cells vs client-home money cells), neither restructures the dispatch, #902's `debt` row stays; §3 below is
    amended. `work-detail.tsx`: #655 may add ONE link block (its AC5 links) in an existing block; #658 owns the Sources
    tab's new content; #636 one row. `apps/web/package.json` + lockfile: #660 (`ui:add chart` → recharts), #657
    (`ui:add combobox`/`popover` if needed) and #642 (`@shadcn/react` for the native chat family) each commit their own
    manifest+lockfile change on their branch; the integration worker resolves the lockfile ONCE with
    `pnpm install --lockfile-only` and re-runs the frozen install.
  - §7.4 measurements are the FIRST red cells of the owning worker, never assumptions: #655 — the deferred-trigger
    firing order on `journal_entries` and the receipt join at deferred-queue time (fallback
    `accounting_work.result->>'entry_id'`); #651 — whether widening `_fa_validate_particulars`' closed key set reds the
    frozen mirror in `lib/fixed-asset-acquisition.ts:54-57` (`p639.particulars.axes`) — if it does, `change_class`
    travels as a separate argument of a NEW verb, not through the validator; and whether a closed-period draft really
    blocks the client's queue (build a `fiscal_years` row in the battery); #656 — the authoritative-extraction race
    and `_period_wall` on an opening draft (B6); #660 — `trial_balance_as_of`'s plan for seven evaluations per pack
    call (prefer one pass over the lines if it is quadratic); #636 — the capacity arithmetic on a migrated rig and the
    frozen closure via `scripts/check-frozen-workflows.mjs --print-closure`, not a scratch resolver; #642 — capture a
    real `fullStream` chunk trace before writing the tool-state fold.
  - §7.4 #15 **measured by the orchestrator on the #660 rig**: `pnpm dlx shadcn@latest add chart --dry-run` resolves
    for this project's `base-nova` style — `components/ui/chart.tsx` (create), `components/ui/card.tsx` (overwrite —
    exactly what `scripts/ui-add.mjs`'s guard exists to stop), deps `cn` + `recharts@3.8.0`. The registry works; every
    add goes through `pnpm --filter @clara/web ui:add <name> --dry-run` first and never overwrites a protected file.
  - §7.4 #16 (#635 out-of-repo callers of `get_llm_usage_summary`): cannot be measured from here; zero callers in the
    repo; beta data. Proceed with the floor recut and put the question to the owner in the wave report.
  - §7.4 #11/#17 (hosted counts: unmarked `closing_transfer` years; `authority_from` backfill effect): release-time
    reads in the runbook, reported before the hosted migration, never assumed zero.
  - §7.5 #1 (missing design lens on #651/#659/#636): the journal shows the design/safety agents DID run for every
    ticket; my reconcile step matched the lens label case-sensitively, so **#651, #659, #636 and #656** (whose citation
    lens spelled itself `CITATION`) were reconciled against the citation payload twice. Remedy: a design-reconcile pass
    over those four maps with the saved payloads BEFORE their briefs are written (this wave's brief workflow, stage 0).
- Rulings the question list (SYNTHESIS §5) showed I had left implicit, now explicit: **C7** #658 records `purpose`
  in `work_knowledge_reads` and lets it join the drift judgement, filters nothing by purpose and mints no
  `knowledge_key_purposes` side table; **D2** #660's cash-set writer gets no agent `_for` twin this wave; **D6** #660's
  pack returns per-account `composition[]` rows rendered as the chart's readable table, each linking to the existing
  `/journals?tab=posted&entry=<id>`, full GL drilldown a named residual for #670; **F6** #636's child is the MEMBER
  ROW carrying up to three identities in order (intake always, document once in custody, Work once admitted) and the
  three populations are reported separately; **G4** #642's source links hang on the result card, never on the tool
  chip; **H5** #635 renders no firm identity facts and links to `/settings/setup` (2026-09-15 D10 stands); **I5**
  #651 does not enable `close_prep`.

## 6.1 · Rulings on the briefs' "orchestrator attention" items (2026-09-19 03:20, before implementation starts)

Each brief resolved these on its own authority where it could; the rulings below confirm or correct them and bind
the implementer over the brief text where the two differ.

| Ticket | Item | Ruling |
|---|---|---|
| #636 | 0229 needs a SIXTH granted name, `clara.sweep_intake_batch_cancellations(p_limit int)`, because the runtime may hold no SELECT on `operation_receipts` (0178:1619-1630) and cannot otherwise find the live children of a `cancelling` parent | **Approved.** `clara_runtime`-only, SECURITY DEFINER, returns the worklist (parent + live child work ids not yet cancel-requested); the rig-meta cohort and grant censuses count six names. The resumable fan-out (`p636.batch.cancel_resume`) is AC7's recovery half and is worth the door. |
| #651 | 0227's `authority_from` backfill: `date_trunc('month', signed_at)` is session-timezone-dependent on a `timestamptz` | **Approved as the brief writes it**: `clara._fa_month_start((signed_at at time zone 'Asia/Kuala_Lumpur')::date)` — the house calendar law (§2 / WORK-ORDER rule 8). The hosted row count is still read at release time. |
| #651 | If M1 reds (widening `_fa_validate_particulars`' closed key set breaks the frozen mirror in `lib/fixed-asset-acquisition.ts:54-57`), the brief's literal reading of the NEW-verb fallback turns `revise_fixed_asset_particulars` into a refusal-only door and moves five call sites + two exact-set censuses | **Corrected**: on the red arm, keep `revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)` WORKING as a thin delegate to the new classified verb `revise_fixed_asset_particulars_classified(...)` with `change_class => 'estimate'` and a fixed reason — today's semantics made explicit, so every revision row carries a class (AC1 holds), no call site moves, the exact-set censuses gain exactly one name (the new verb) and lose none. The classified verb refuses `policy`/`error` by name (D10). |
| #656 | The live census `document-capability-registry.test.mjs:204-212` requires ONE distinct `registry_version` registry-wide, so 0228 must move EVERY row to 2 (only the two named rows change content) and re-base that battery | **Approved** — §2 row 0228 is widened accordingly (UPDATE that raises, never DELETE-then-INSERT; the two rows are the only content change; the battery is re-based in the same commit on the af3b5955 precedent). Coordination note for the integrator: if #782 lands in the same integration it rides version 2 and mints no 3. |
| #657 | `apps/web/e2e/serve-built.mjs`'s dispatch chain is SEMANTIC, not sorted: `home-board-mock.mjs` answers `list_bank_statements` / `list_bank_accounts` unconditionally through `EMPTY_RPCS` at :720, so a bank lane dispatched below it silently receives `[]` | **Confirmed.** §3's "sorted position" does NOT apply to `serve-built.mjs`'s dispatch chain: a lane whose verbs another arm answers unconditionally dispatches ABOVE that arm and says so in a comment at both sites; `SHARED_RPC_VERBS` is not touched for array-dispatched paths the census cannot see. **#659 and #660 may not move `home-board-mock.mjs`'s `EMPTY_RPCS` arm or its dispatch position.** The integrator preserves dispatch order over sort order. |
| #658 | DECISIONS §2 called the seventh door "client-scoped", but `knowledge_records` carries `scope_kind` client/firm | **Approved as the brief resolves it**: `scope_kind='client'` → reads for that client; `scope_kind='firm'` → every client in the caller's firm except those whose own live record shadows the key (the 0192:1355-1363 / :1508-1519 `not exists` shadow), cell `p658.record_reads.firm_scope_shadow`. The door is record-scoped and firm-bounded; "client-scoped" in §2 meant "never crosses the firm". |
| #635 | `rig-meta.mjs` cohorts are FUNCTION-name lists (`:2914`), so 0233 (three new functions + one recut) needs a real cohort | **Corrected**: §2.2's "0233 may be comment-only" is wrong; #635 ships a four-name cohort (`get_firm_legal_standing`, `get_firm_commercial_state`, `get_firm_ai_usage`, `get_llm_usage_summary`). 0228 stays comment-only (no function installed). |

## 6.2 · Post-review ratifications (2026-09-19 15:10, orchestrator; owner-overridable)

Ruled after the three-lens review, the fix rounds and the rechecks (`reports/<n>-review-*.json`, `<n>-fixround-1.md`,
`<n>-recheck-1.json`). Each row is a deviation a worker or reviewer asked the orchestrator to rule on. Reversible in beta.

### 6.2.0 · 大白话（产品相关的几条）

| # | 票 | 问题 | 裁定 |
|---|---|---|---|
| R-A | #655 | 账单没印到期日、只知道对方账期 30 天时，到期日从**账单日期**算还是从**入账日期**算？ | **从账单日期算**（会计惯例：账期从单据日起算）；没有单据日期才退回入账日期。旧的上传车道今天从入账日期算——这是它的既有缺陷，由 #665 的车道切换处理；#655 的对照测试改用「单据日 = 入账日」的样本，并单独记一格钉住两条车道的这个分歧。 |
| R-B | #636 | 一批已经在「正在停止」，另一位簿记员能不能再发一次停止？ | 这波**不做**：同一批的第二次停止决定被拒绝（`batch_already_cancelling`）；「原发起人离职后允许换人重发」另开一票。 |
| R-C | #636 | 界面文案里的「正在停止」 | 英文界面写 **Stopping**（en 语言包只有英文；brief 里的中文是规划文档的速记）。 |
| R-D | #658 | 知识读取失败，「核心层失败才停、其余层降级」这条今天做到了吗？ | 数据库那扇门是**一次性**读完三层的，读失败就是整体失败；所以今天「任何读失败 → 停下、不入账」，`partial` 只来自截断与标记。分层的故障隔离（核心层单独 try）记为后续，等真有按层失败的情形再做。D16 的措辞据此收紧。 |
| R-E | #659 | 「需要你」列表里的问题行能不能直接点进它的 Work？ | 这波**不能**：那条清单是 `list_review_queue`，本波明令不重切；行上没有 work_id。记为具名残留并开票（给问题行加 `work_id`）。 |

### 6.2.1 · Ratified as shipped

| Ticket | Item | Ruling |
|---|---|---|
| #635 | `get_firm_ai_usage` stays `volatile` (its callee is) | ratified |
| #636 | terminal rule = "no live children AND no pending members"; envelope gains `cancel_blocked` + `pending_members` (neither a total nor a percentage); EN copy "Stopping"; the four deliberately-left items | ratified (R-B: the re-key by a different bookkeeper is a follow-up) |
| #642 | intent key gains the conversation position; three refusal fixtures re-encoded (two → 502, the unit cell → 500, correctly) | ratified; the fix-round report's "all three → 502" sentence is corrected in fix round 2 |
| #651 | 0227 also recuts `retire_depreciation_authority` and splices `_tf_fa_authority_transition` a second time (both repairs of damage the file would otherwise do, full apparatus, disjoint family); the instruction-ladder narrowing is NOT applied (cross-lane; follow-up "what counts as a person's instruction" for FA + plan lanes); `completeFixedAssetParticulars` / `disposeFixedAsset` keep #639's per-call op key (follow-up) | ratified — §2 row 0227's recut list is amended to name both |
| #655 | 0225 recuts THREE bodies: the sixth `_record_journal_entry_core` copy, `_subledger_classify_entry` (new LADDER 3T, fires only when `trade_invoices` names the entry) and `_tf_subledger_item_belt` (learns the second lawful source) — measured necessity (the belts refused a `bill` item otherwise; setting `coding_kind` would arm a document-stated-tax wall a stated bill cannot pass); no same-document-number duplicate probe (follow-up) | ratified — **D11 now reads "recut the posting core once, narrowly, plus the two subledger arms that make a trade-invoice item lawful"**; nobody else in the wave touches that family (SYNTHESIS §0.1) |
| #655 | counterparty-terms due date anchored on the POSTING date | **overruled → R-A**: anchor on the DOCUMENT date, posting date only when the document date is absent; `_trade_invoice_due` changes one line; the parity cell's fixture uses document date = posting date and a sibling cell pins the two lanes' divergence by name; fix round 2 |
| #656 | `prior_gl.business_operation` stays `stored_only` with the truth in `limits` (the registry census refuses `supported` over unsupported typed facts; nothing produces `prior_gl.line`); 0228 is not edited after application (checksum ledger); whole-registry version 2 | ratified — **D13 is amended**: "capability registry → version 2, both rows' basis/limits corrected; `business_operation` levels as the census admits; a follow-up (F6) asks whether the four-level vocabulary needs a 'read into human-ticked proposals' level" |
| #657 | op-key renewal rule gains the selected entries' match-history generation (data, not lifecycle); `get_bank_line_matching_context` builds the tie through `list_bank_statements` | ratified — **D15 is amended** to "one decision one key: a hash of {client, sorted line ids, sorted entry ids, cents, ack flag, each selected entry's match-history generation}" |
| #658 | atomic `retrieve_knowledge` (any failure → `knowledge_read_failed`); withdrawn records still count as drift; no decade bound on `as_of` | ratified → R-D; **D16 is amended** accordingly |
| #659 | no `work_id` on `list_review_queue`'s question rows (recut forbidden); `list_firm_timeline` left in place though unconsumed; 0231 prose not edited after application | ratified → R-E (follow-up filed); the dead-reader deletion is a follow-up |
| #660 | new coverage token `cash_set_published_after_books_start`; `comparison.{available,reason}`; top-level `unmarked_closing_entries_series` + `series_coverage_reason`; lockfile moved by one package (`cn` dropped); `card.tsx` untouched (measured: not in the diff) | ratified; the integrator still regenerates the lockfile once |

### 6.2.2 · Fix round 2 (before integration)

| Ticket | Work |
|---|---|
| #655 | R-A (document-date anchor + cells); the report's "ONE body" line rewritten to the ratified three; any recheck-1 finding |
| #660 | recheck NF-1: after `select … for update` the loser must RE-READ the current version (EvalPlanQual nulls the pre-lock row) so it refuses CLR11 `cash_set_version_raced` (the token fix round 1 shipped and §6.2.1 ratified — this row's earlier spelling `…_race` was mine, not a second token), never `first_version_after_books_start`; a cell with two sessions proves it; NF-2 — soften the "fully green" claim to name the known `use-clara-thread-stop` flake |
| #642 | fix-round report sentence: two cells → 502, the unit cell → 500 |
| #656 | fix-round report A3 count (four app/fixture defects + one spec defect) |
| #657 | fix-round report: the isolation-stability claim softened (flaky, 1 in 4 isolated runs) |
| #636, #651 | whatever recheck-1 returns, on the same rules |

## 6.3 · Integration rulings (2026-09-19 17:00, on `reports/integration-merge.md` §5)

| Red | Ruling |
|---|---|
| §5.1 #655 — `t_je_open_item_birth` has no tier in `f-a2-tier-d.test.mjs` §D.1 | **Tier = ABORT.** A trade invoice whose open item cannot be born never posts — ARCHITECTURE §5.A's transaction boundary ("确认一张发票需要相应总账与 open item"). Register the trigger in §D.1's table as an aborting deferred constraint trigger and add a cell proving a forced birth failure leaves no entry, no receipt and no `trade_invoices` status row (`p655.birth.abort_is_atomic`). |
| §5.2 #636 — the "intake batch cancellations" belt leaks its probe error to `beltErrors` | **Contain it** like the FA and ADJ belts: the belt reports `batchOk:false` with the probe reason and the sweep behind it completes; the cell's law stands (22/22 again). |
| §5.3 #651 — the new "Policy & effective revisions" tab breaks #639's ArrowRight cell | **#651's five-tab order stands** (particulars → policy revisions → schedule → history is the reading order). Re-point `fixed-asset-acquisition-walk.spec.ts`'s keyboard cell to the new order (ArrowRight → Policy & effective revisions → ArrowRight → Schedule → End → History) — the cell asserts that keyboard navigation works, not a business order; say so in its comment. |
| §5.4 — four S5.25 clock/duplication rosters need 7 (B) and 13 (D) names | **Measurement pass, additions only, by rule**: run each arm's own detector over the live catalog; for every new name, if the object derives a MONEY date (as-of, posting, due, period) from the session clock by its own expression, re-point it to the house derivation the roster names and register it as a consumer; if the clock read is `computed_at` / watermark / sampling only, register it with that class. Escalate to the orchestrator ONLY a name whose money-vs-display reading is genuinely ambiguous; never remove a name. Record the per-name table in `reports/integration-fix-1.md`. |

Named-and-ignored at integration (not defects of this wave): #693 EICAR, no `pg_dump` on PATH (four runtime files),
and the five whole-suite flakes each green alone (ready MAJOR-1, relay-runner, wake-engine, wave-b-lint-belt,
documents-viewer polygon) — all pre-existing Windows-host reds RIG.md and WORK-ORDER rule 9 name.

## 6.4 · Rulings after the successor cut (2026-09-19 20:50)

| Item | Ruling |
|---|---|
| `integration-fix-1.md` §4.3 — `get_client_financial_pack` and `propose_client_cash_accounts` derive a MONEY as-of (`v_today`) from the session clock by their own expression (0232) | **Re-point both to the house book-day derivation** (`clara._book_today()` or the exact function the S5.25 roster names as the consumer target) — `computed_at = now()` stays a sampling read. This IS a 0232 edit: apply it on a FRESH cluster (recreate `rigint` with `mkrig.sh` — a new cluster, so 0154's role census is honest), re-run the from-scratch chain 0001→0233, the #660 battery, the four census cells (both names move from CLASS 2 / escalated to CONSUMER), `operation-census` and `rig-isolation`. Add cell `p660.pack.as_of_is_book_day`: under `set local timezone = 'UTC'` at a fixture instant where UTC and Asia/Kuala_Lumpur dates differ, the pack's default as-of and the proposal's `as_of` equal the MYT book day, never the UTC date. Counter-argument noted (`_book_today()` samples per statement); a money date must be the book day regardless. |
| Cut fix ratification — a durable row per inspection read (`read_knowledge_source` / `read_knowledge_history`), carrying the model's `reason` | **Not this wave** — it needs a `read_kind` on `work_knowledge_reads` (or a sibling relation) so `_work_knowledge_drift_core`'s `limit 1` does not narrow the drift signal to one record; file as a follow-up (ready-for-agent) with the fix round's analysis. The capability id `accounting_work.inspect_knowledge_source` stays registered and is recorded on zero rows until then — the report says so. |
| Cut fix deliberately-left ADV-S-7 (no in-flight arm on `start_trade_invoice_work`) and SP-2 (`pack_firm_required` row kept) | ratified as measured |
| Cut recheck NOT-verified — the two-build cutover leg refused to start on a contaminated shared rig | re-run it on the fresh cluster above; it passed on `rigint3` before the cut and must pass after |

## 7 · Effort, lanes and sequence

| Ticket | Effort | Implementer lane | Notes |
|---|---|---|---|
| #635 | L | claude-opus-5 xhigh | one recut, three doors, settings faces, an accept action for owners |
| #636 | XL | claude-opus-5 xhigh | new relation family, four doors, fan-out cancel, batch card + per-child recovery, World leg with 100 intakes |
| #642 | XL | claude-opus-5 xhigh | behaviour first (tests), then the native component migration on the same tests; no migration |
| #651 | XL | claude-opus-5 xhigh | seven FA recuts with measured pins, period law, preview, OBO door, history tab |
| #655 | XL | claude-opus-5 xhigh | the spine: sixth core copy, trade_invoices, admission door, C3 surface, parity cell |
| #656 | L (+XL arm refused) | claude-opus-5 xhigh | in-line reader wiring, tied-seed dialog + target panel, registry v2 |
| #657 | L | claude-opus-5 xhigh | candidate/context reads, op-key repair (13-core re-patch with guard), Matching tab rebuild, six URLs |
| #658 | XL | claude-opus-5 xhigh | five doors + relation, three surfaces, the v5 contract and its new modules |
| #659 | L | claude-opus-5 xhigh | portfolio pack, disposition read, page rewrite, shared AddClientControl, firm-home walk |
| #660 | XL | claude-opus-5 xhigh | cash set + pack door, period selector, Recharts install, charts + tables, extended walk |

Reviews: spec lens and standards lens on `claude-sonnet-5` xhigh; adversarial lens on Codex `gpt-5.6-sol` xhigh
(cross-model, `codex exec --sandbox read-only -C <worktree>`) — **measured 2026-09-18 22:58 MYT: the Codex account
is authenticated but its usage limit is exhausted until 2026-09-19 17:41; if it has not reset when a ticket reaches
review, the adversarial lens runs on `claude-opus-5` xhigh with a refute-first prompt and the report says so**; fix
rounds on the implementer's lane; the successor cut and the integration merge on `claude-opus-5` xhigh. Ten implementers run concurrently on their own rigs; the host has 24 cores / 32 GB — RIG.md carries the
retry rule for `next build` under contention.
