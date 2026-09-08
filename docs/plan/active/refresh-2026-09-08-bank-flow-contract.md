# 银行流水、清账与对账前端契约

日期：2026-09-08

状态：issue 610 的实现前研究证据；不是当前实现完成声明

范围：银行 statement → line → 现有入账匹配／新建收付款并分配 → reconciliation，以及前端需要衔接的 credit、非银行清账、unallocation、write-off 路径。

## 结论与边界

已接受的产品目标是：资料、身份和当前权限充分时，Clara 自动执行可验证的匹配、清账和对账。确定性校验返回可修正输入、需要重读的并发变化或可安全重试的技术失败时，Clara 先修正／重读／有限重试；只有缺少事实、存在歧义或需要人的会计决定时，才挂起受影响的 Work 并提一个可行动问题。不把不明收款猜入 suspense，也不为普通银行操作增加 maker/checker、逐笔 approve 或「开启自动化」步骤。取消停止尚未获准的新业务操作并保留已经完成的回执；冲销、更正和 unallocation 是独立、可审计的后续操作（`docs/plan/active/refresh-2026-09-08-product-spec.md:11-20,31-33,87-97`）。

当前代码已经有可复用的租户、权限、期间、锁、金额、幂等、分配和对账约束，也有 interactive Clara bank acts。它还没有一条经验证的前端旅程把 statement 来源、候选、业务对象、JE、allocation、Work 和 reconciliation 结果连在一起。冻结的无人值守 `bankAgent.v1` 只匹配及提议，明确不暴露 settle、unmatch、void、complete reconciliation 等门；不得把它描述成完整自动执行器（`packages/runtime/workflows/bankAgent.v1.tools.ts:1-17`）。`chatTurn.v14` 分别调用现有 `wake_match_bank_line`、`wake_settle_from_bank_line`、`wake_unmatch_bank_match`、`wake_complete_bank_reconciliation` 和 `wake_resolve_and_book_bank_line`（`packages/runtime/workflows/chatTurn.v14.bankActs.ts:59-137`; `packages/runtime/workflows/chatTurn.v14.bankActs2.ts:108-135`）。这些 tools 不是孤立旧 helper：当前 registry 指向 `chatTurn_v17`，v17 的 tool builder 导入 v15，v15 再完整 carry v14 tool set（`packages/runtime/workflows/registry.ts:78-88`; `packages/runtime/workflows/chatTurn.v17.impl.ts:93-130`; `packages/runtime/workflows/chatTurn.v17.tools.ts:1-38`; `packages/runtime/workflows/chatTurn.v15.tools.ts:1-39`）。这证明当前 chat 闭包可达这些受支持写门；本次仍没有证明 statement 到写门的自动路由、恢复或 hosted 行为。

这里把三类事实分开：

- **保留／复用**：最新直接源码中已经存在的读、写门、校验、锁和回执。
- **已接受目标**：product spec 已确认的产品行为，尚不能当成实现事实。
- **缺口**：本轮直接源码没有找到完整前端或端到端证据；实现时需要设计和验证。

## 当前可复用链路

| 阶段 | 当前直接证据 | 分类与前端含义 |
| --- | --- | --- |
| 银行入口 | `BankWorkbench` 把 Accounts、Statements、Matching、Exceptions、Reconciliation、Agency 分成六个 tab（`apps/web/components/bank/bank-workbench.tsx:3-20,45-50`）。Statements 当前是人工录入、查看 lines、void 和完成 pending match（`apps/web/components/bank/statements-section.tsx:3-10,113-194,323-395`）；读写分别经 `apps/web/lib/bank/reads.ts:32-64` 和 `apps/web/lib/bank/doors.ts:111-138`。statement/list detail 含 document、period、opening/closing、line count、void/superseded/tie 字段（`apps/web/lib/bank/types.ts:138-224`）。 | **复用底层记录，替换主旅程。** 六个孤立 tab 和手工 statement 表单不能承担目标的 line-first 处理；文档来源要和 statement/line 保持同一引用。 |
| 待匹配流水与候选 | 当前 Matching 读取 `list_unmatched_lines` 和 `list_bank_match_candidates`，允许选择多条 statement line 和多条 ledger entry，并逐项输入 cents（`apps/web/components/bank/matching-section.tsx:34-115,138-218`; `apps/web/lib/bank/match-reads.ts:28-58`）。候选读模型已经有 posting date、memo、coding、counterparty、剩余 debit/credit capacity；line 有 statement、date、description、amount 和 class hint（`apps/web/lib/bank/match-types.ts:43-98`）。最新 unmatched 读排除 pending/live match 和仍治理该 line 的 open/corrective exception（`packages/db/migrations/0040_wave_c_c_tieout.sql:4099-4124`）。 | **复用读模型，重做比较面板。** 当前画面没有把完整来源与候选证据、可分配余额、差额放在同一决策面，也没有候选置信度或歧义契约。 |
| 匹配已经入账的付款／收款 | `matchBankLine` 调用当前单一 arity `match_bank_line`，携带 line 集、entry allocation、可选 adjustments、period exception acknowledgement 和 op key（`apps/web/lib/bank/match-doors.ts:28-45`）。最新 `_match_bank_line_core` 校验非空、无重复、整 cents、client/live statement、同一银行账户、entry approved/unreversed、剩余容量、期间及精确等式；锁住 line 和 entry 后才重检并写 match（`packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql:1863-2276`）。正常 match 只把既有 entry 纳入 match；只有明确 adjustment leg 才新建 JE（同文件 `2250-2276`）。 | **保留。** 这是「匹配已有付款不重复 cash」的确定性基础。前端结果必须把 bank line、已有 JE、match allocation 和 adjustment（若有）分开显示。 |
| 从银行流水创建收款／付款并分配 | `settleFromBankLine` 支持一条 line、counterparty、多项 allocation，以及 posting date、bank charge、adjustments、control account（`apps/web/lib/bank/match-doors.ts:53-75`）。当前 `SettleLineForm` 只开放 customer/vendor、counterparty 和多项 open-item allocation，没有 charge/adjustment/control-account UI（`apps/web/components/bank/settle-line-form.tsx:3-9,31-102,105-166`）。最新 `_settle_from_bank_line_core` 锁并重检 live/unmatched line 和期间，按 AR receipt／AP payment 调用 allocation core；refund 明确不由这个 composite 处理（`packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql:1134-1637`, 特别是 `1260-1383`）。 | **复用 composite，补齐输入与结果。** 一次操作应原子返回收付款 accounting object、JE、open-item allocations、bank match、费用／调整及 op receipt；不能先伪装 line 已处理再补明细账。refund 需要沿源码注明的受支持组合另行实现和验证，不能塞进此表单。 |
| 银行 exception 与 write-off | Exceptions 可 open/resolve，也有 write-off form；`matched_booking` settlement leg 明确标为未接线（`apps/web/components/bank/exceptions-section.tsx:3-10,153-190`）。现有 write-off 表单只开放 hand-draft JE，未开放 settlement/open-item leg（`apps/web/components/bank/write-off-form.tsx:3-8,49-149`; `apps/web/lib/bank/exception-doors.ts:86-116`）。最新 `_resolve_and_book_bank_line_core` 只接受 `matched_booking` 或 `written_off_adjustment`，但两种 disposition 都必须**新建**一种 booking leg：hand draft 或 open-item settlement，二者不能同时存在；它不接受一个既有 entry id。core 锁并重检 exception/statement、防止同一 exception 重复 booking，再把新结果匹配回 line（`packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql:3242-3925`, 特别是 `3301-3330,3548-3582,3614-3917`）。没有 governing open exception 的既有 entry 走 `match_bank_line`；既有 entry 与已打开 exception 同时存在时，本轮没有验证一个可执行的 resolve→match 顺序，前端不能擅自调用这个 booking composite 再造 cash。 | **复用 composite，补齐 exception 新建 booking 和 write-off 明细。** 既有 booking + open exception 是需实现验证的编排缺口；write-off 必须展示具体 adjustment JE、受影响 open item 和差额。 |
| 非银行 receipt/payment、credit 与清账 | DB 的人类 `allocate_receipt`／`allocate_payment` wrappers 要求当前 bookkeeper context，并调用最新 receipt/payment cores；输入含 bank account、金额、多项 allocations、discount 和 control account（`packages/db/migrations/0044_wave_d_b3_af2_composite.sql:1642-1673`; 最新 cores 为 `packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql:491-822,829-1118`）。本轮在 web 未找到这两个独立非 statement 写门的 adapter。已有 `applyOpenItems` 将现有负数 credit/open item 应用于正数 invoice/bill，不新建 GL；`unallocateGroup` 撤销整组 allocation（`apps/web/lib/registers/counterparty-doors.ts:158-206`）。当前 Apply dialog 只做一个 source-target pair，Unallocate dialog 只做整组并要求 reason（`apps/web/components/registers/ApplyOpenItemsDialog.tsx:23-112`; `apps/web/components/registers/UnallocateGroupDialog.tsx:17-60`）。DB 在锁后校验同 domain、canonical counterparty、lineage、符号和 outstanding，并写成对 allocation rows；unallocation 写精确负镜像并给 receipt（`packages/db/migrations/0037_wave_c_a_subledger.sql:3141-3402`）。counterparty statement 已显示 open items/allocation history，并在成功后重读 statement 和 aging（`apps/web/components/registers/counterparty-statement-panel.tsx:84-114,159-240`）。 | **复用 server 和现有 credit 门，补前端。** receipt/payment 会产生实际 JE 与 allocation；credit application 只更新现有 open items 的 allocation，不应显示新 cash JE。当前缺少独立非银行 receipt/payment frontend adapter，不得用视觉上的「已付款」替代。 |
| 解除匹配／冲销边界 | 当前 UI 要用户手填 match UUID 才能 unmatch（`apps/web/components/bank/matching-section.tsx:118-127,220-241`）。DB 不允许直接解除已计入 completed reconciliation 的 live group，须先按最新到最旧 void reconciliation；pending reservation 可取消，但若 settlement 已获准，不会静默冲销，后续需明确 unallocate/reverse（`packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql:2296-2644`, 特别是 `2398-2473`）。unmatch 会恢复相关 exception，并留下审计／回执（同文件 `2492-2643`）。 | **保留顺序和历史，重做对象动作。** 从 match detail 发起，不让用户抄 UUID。停止处理不等于撤销已完成账务。 |
| 对账读取与完成 | 当前 Reconciliation 显示 opening、GL、uncleared、computed closing、statement closing、difference 和 blockers；stale outstanding 只有 UUID checkbox，完整 snapshot/detail 明确未做（`apps/web/components/bank/reconciliation-section.tsx:152-220`）。客户端只在 server `can_complete`、tie 完整且所有 stale ids 已确认时启用按钮（`apps/web/lib/bank/recon-types.ts:60-131`; `apps/web/lib/bank/recon-doors.ts:4-42`）。最新 core 在 advisory/row/share locks 下校验 live statement、唯一完成、非 shared COA、期间链、prior reconciliation、无 pending/unsettled line、同一 cutoff、agent duplicate-payment wall、opening chain、超过 60 日 stale acknowledgement 和 difference 精确为零，再写 completion、audit、event、receipt（`packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql:2657-3225`）。 | **保留完成门和回执，补完整快照并自动触发。** 当前按钮是人工动作；目标在事实和授权充分时由 Clara 通过受支持的 completion door 完成，不另设批准。stale acknowledgement 是具体风险决定，不能变成默认勾选或裸 UUID。 |

open-item picker 使用的 `list_open_items_by_counterparty` 最新函数体应以 `packages/db/migrations/0149_counterparty_merge_pr_1.sql:670-711` 为准：它修正 client/firm 作用域并按 canonical merged counterparty 读取 open items。这不是 `list_bank_match_candidates` 的 recut；bank match candidate reader 仍是 approved、unreversed bank-GL entries 的独立读门（`packages/db/migrations/0038_wave_c_b_bank.sql:8010-8054`）。较早 `0038` 的 open-item 同名函数不能单独代表当前行为。`0129` 已删除 rule-aware match/settle overload 和 bank rule machine（`packages/db/migrations/0129_f_a3_pr3_retirement_parity_doors.sql:388-397,1195-1199`）；新前端不得重新发明规则引擎或隐藏 executor。

## 目标前端旅程

1. **进入 Bank 即看到工作上下文。** 顶部选择 bank account 和 statement period；显示 statement 来源、页／文件引用、opening/closing、状态（live、void、superseded）及处理计数。无 statement 时给上传／进入 Documents 的真实入口；人工录入保留为受支持的专家入口，不成为默认路径。
2. **以 statement line 为主对象。** 左侧或上方保持原始来源区域与 line 事实（日期、原文、流入／流出、金额）；右侧显示候选及其 posting date、memo、counterparty、JE、可分配容量、历史 match 和差额。切换候选不丢失来源。
3. **Clara 先做可验证的动作。** 唯一且事实充分的 existing-booking match 自动调用受支持 door；结果显示「已关联既有 JE，未新增 cash 分录」。若 line 是尚未入账的真实 receipt/payment，则调用 settlement composite，一次提交 accounting object、JE、open-item allocations 和 bank match。只有证据支持的 fee/interest/write-off 才产生额外 adjustment JE。
4. **缺失或歧义只挂起该 line。** 例如两个相同金额候选、counterparty 身份不唯一、找不到分配对象或无法解释差额时，状态为「待处理／需要你」，保留 Work 与候选快照并提出最少问题。Clara 不得为了消掉未知差额而自动塞入 suspense 或无依据 write-off；若来源、政策和金额已充分证明某项 fee/write-off，则仍按自主执行契约处理。`pending` 也不应成为普通复核队列。其他独立 lines 继续处理。
5. **允许部分和多项分配。** 同一 bank line 可分到多个 open items；一个已入账 entry 也可按剩余 capacity 接受部分匹配。始终显示 statement total、selected allocations、fee/adjustment 和 remaining difference，提交前后的整数 cents 等式一致。
6. **结果围绕业务对象，而非内部 verb。** 成功面板链接 statement line、payment/receipt 或既有 entry、JE、allocation group、counterparty open items、Work 和 op receipt。重复提交显示原结果；不能渲染第二笔 cash。技术 verb 只放在审计详情。
7. **异常、更正和取消是显式后续。** 从 match/result detail 发起 unmatch、unallocation、void reconciliation 或 reversal，并先展示影响链及允许顺序。取消运行中的 Work 停止尚未获准的新操作；已进入原子写入的动作先结算成成功或失败，已完成 receipts 保留，随后用独立更正／冲销恢复账务。
8. **对账是同一旅程的收口。** 每个 statement 持续显示 opening + book movement ± uncleared = computed closing、statement closing 和 difference；blocker 可直接返回具体 line/open item/period。当前权限、statement revision、期间链、所有 lines 和精确 tie 都通过时，Clara 自动调用 completion door并显示 immutable receipt。真正需要人的 stale outstanding／例外决定通过 Work 提问，回答后重读当前数据再尝试。
9. **完成后仍可追踪。** Bank history 保留 reconciled/unreconciled、void/superseded、completion/void receipt 及 correction chain；从 Accounting 的 AR/AP、Journals、Documents 和 Work 均能回到同一对象，不能复制一套状态。

## 状态、并发和权限契约

| 情况 | 必须展示／执行的行为 |
| --- | --- |
| loading／empty／read failure | 保留 account/statement scope；Skeleton 只覆盖未知区域。读取失败显示可重试错误，不把未知当作零或已对账。 |
| candidate 唯一且仍有效 | 在写入时重读当前对象并由 DB 锁、capacity、period 和 permission 再校验；成功直接显示 receipt。 |
| candidate 歧义／事实缺失 | line 和对应 Work 为待处理，显示来源、选项、差额和一个可回答问题；不产生 suspense、write-off 或临时 cash JE。 |
| stale candidate／并发变化 | 将 refusal 归为可行动的 stale/concurrency；废弃旧选择，重读 line、entry capacity、open items 和 reconciliation，不循环改参数绕过。 |
| permission revoked／period locked | 写入时的当前 DB 判定为准；显示权限已变或期间已锁及允许的下一步。旧页面加载成功不构成写权限。 |
| duplicate submit／network retry | 同一业务意图复用稳定 op identity 并返回原 receipt；UI 在未知结果时先查回执，不能盲目创建新 payment。当前前端生成 op key，但完整跨刷新 intent identity 仍需实现证明。 |
| partial／multi-match | 展示每个 line、entry/open item 的分配 cents、提交前后剩余 capacity 和总差额；不能以「matched」单一 badge 掩盖余款。 |
| cancel while writing | 停止承认新的业务操作，显示「正在停止」直到已获准的原子操作落为成功／失败；终态 cancelled 后仍显示已完成 receipts。不可承诺即时抢占或回滚。 |
| reversal／unmatch／unallocation | 显示依赖顺序、原因、原 receipt 和新 receipt；completed reconciliation 先 void，allocation group 按受支持的整组负镜像撤销，已完成 JE 用 reversal/correction。 |
| reconciliation ready／blocked | ready 只来自最新 server verdict 与精确等式；满足时自动完成。blocked 显示具体 prior-period、unsettled line、stale item、shared COA、opening mismatch 或 difference，并可导航到对象。 |

## 原生 shadcn 组件选择

- `Table` 承载 statement lines、open items 和 reconciliation history；桌面保留关键身份／金额列，窄屏使用行摘要进入同一对象的完整详情地址，Back 恢复列表位置。确需二维比较的表格有自己的可访问滚动区域。
- source／line 与 candidate/result 在桌面并列；若验证确需可调宽度，再使用项目 Base UI 对应的原生 Resizable API。窄屏用同一详情的来源／匹配视图切换，Sheet 只承载短小支持动作，不能成为整条银行旅程唯一入口。遵循[共享交互契约](refresh-2026-09-08-frontend-interaction-contract.md)。
- `Popover` + `Command` 组成 account、counterparty、entry/open-item `Combobox`；候选行用 `Checkbox` 支持多选，金额用 `Field` + `InputGroup`，不靠自由文本 UUID。
- `Card`、`Separator` 与等宽数字展示 reconciliation arithmetic；`Badge` 只表示真实状态（待处理、已匹配、部分分配、已对账、已冲销），不把推测显示为确定。
- `Alert` 显示差额、stale、locked period、permission 和 read failure。用户发起 void、unmatch、unallocate、reversal 时，在对象动作／聚焦 Dialog 中展示影响、原因和明确提交；不再叠加默认第二次审批。Clara 在已接受授权内的自动更正按既定契约执行并通知。Alert Dialog 只用于具体确需确认的破坏性动作，组件选择本身不扩大人工门槛。
- `Tabs` 只用于历史／待处理等同一对象视图或窄范围筛选，不再把 statement→matching→reconciliation 的顺序拆成六个互不保留上下文的工作区。
- `Skeleton`、`Empty`、`Tooltip`、`ScrollArea` 分别处理真实加载、无记录、术语解释和长候选；`Progress` 只在总 line 数与已处理数都可测量时出现。
- 成功先更新持久 receipt／对象状态，必要时采用项目 Base UI 的 Toast 作短暂提示；当前 main 尚未安装该 Toast，不能描述成现有实现。Toast 不能替代可回访的 accounting object、JE、allocation 和 Work 链接。

## 接受案例

1. **已有 receipt 精确匹配。** 给定一条 RM1,000 bank inflow 和一笔尚有 RM1,000 capacity 的已批准 receipt entry，Clara 自动 match；结果链接原 JE 和 match allocation，银行现金余额没有第二笔 RM1,000 JE。
2. **多 line／多 entry 与部分余款。** 两条同一 bank account 的 lines 分配到两笔 entries，所有 cents 精确相等；每个对象显示使用额和剩余额。若总额差 1 cent，DB 拒绝且 UI 保留输入和明确差额，不显示完成。
3. **不明收款。** 来源只有无法唯一识别的简称，两个候选同样合理；该 line 保持待处理并在同一 Work 提问，其他独立 lines 继续。数据库没有 suspense、write-off、payment 或 allocation 副作用。
4. **新客户收款并部分分配。** 一条 RM1,000 inflow 分配 RM600 与 RM300 到两张 invoice，余 RM100 依实际支持的 advance/unapplied 契约处理；一次成功结果同时显示 receipt object、JE、两项 allocation、line match 和剩余状态。若当前 composite 不支持余款方案，保持待处理而不伪造完成。
5. **供应商付款含银行费。** RM1,010 outflow 清偿 RM1,000 bill，证据支持 RM10 bank charge；结果只有正确 payment/charge 分录、bill allocation 和 bank match，算式与 line 精确相等。没有费用证据时不得自动补差。
6. **credit note／非银行抵消。** 现有负数 credit 应用于同 domain、同 canonical counterparty 的正数 invoice/bill；只新增 allocation rows 和 receipt，不新增 cash JE。跨 counterparty、超 outstanding 或 lineage 不合法时拒绝并保持两边余额。
7. **stale candidate 与重复点击。** 用户查看后另一操作消耗 entry capacity；原提交被锁后重检拒绝，页面重读候选。相同已成功意图在网络重试或双击时返回同一 receipt，只产生一个 match/payment。
8. **权限或期间在提交前变化。** 页面打开时可编辑，写入前角色被撤回或 period 被锁；door 拒绝，UI 说明当前原因并链接允许的处理方式，不沿用旧权限、不静默改 posting date。
9. **existing booking、exception booking 与 write-off 分流。** 没有 governing open exception 的已入账 entry 通过 `match_bank_line` 连接，不新建 cash。exception 确实需要新记账时，`resolve_and_book_bank_line` 才以 hand-draft 或 open-item settlement 其中一条 leg 完成；真实小额差异通过 `written_off_adjustment` 显示具体 adjustment JE。若既有 booking 与 open exception 同时存在，UI 保持待处理并遵从经 DB 验证的 resolve/match 编排；在该顺序尚未证明前，不调用 booking composite 伪装成「连接既有记录」。
10. **自动完成 reconciliation。** prior chain、opening、statement status、所有 lines、stale checks、当前权限和 difference=0 均通过时，Clara 经现有 completion door 完成并显示 snapshot/receipt，不要求用户按「批准」或启用自动对账。重复触发返回同一完成结果。
11. **对账 blocker 与 stale acknowledgement。** 存在未处理 line、opening mismatch、非零差额或超过 60 日 outstanding 时不完成；UI 显示对象、金额、日期和原因。需要人接受的 stale item 以可识别记录提问，回答后重读当前状态，不能只勾裸 UUID。
12. **取消、更正与依赖顺序。** 批量处理部分完成后取消，未获准 lines 停止，已完成 match/settlement receipts 保留。要撤销已计入 completed reconciliation 的 match 时，先按允许顺序 void reconciliation，再 unmatch；settlement 已完成则另做 unallocation/reversal，历史始终可见。

## 未证明项与下一步

本轮通过 codebase-memory 查结构与覆盖，再直接读取 coverage 变化或 SQL 部分解析的最新源码。前端 bank 文件在索引中标记 metadata changed；`0037`、`0038`、`0040`、`0044`、`0121`、`0129`、`0149` migrations 有部分解析范围，因此上述代码声明来自直接行级读取，而不是把 graph 当作完整证明。未做 all-source audit、真实数据库写入、部署或 hosted 验证。

仍需实现验证：

1. statement/document ingestion 到 canonical statement/line/Work 的版本契约，以及 void/superseded 后对下游对象的影响；
2. 候选排序、证据、confidence 和 ambiguity 的可解释规则；现有 candidate read 不是自动决策证明；
3. interactive chat bank acts 如何被新的 Bank/Work 前端调用、持久化恢复并在写前重获当前 authority；冻结 `bankAgent.v1` 不可被扩写成已具备的完整执行路线；
4. 创建非银行 receipt/payment、refund、advance/unapplied、matched-booking settlement、charge/control account 的真实 UI 与最新 door acceptance，以及既有 booking 与 open exception 同时存在时可执行的 resolve/match 顺序；
5. 稳定的跨刷新 operation identity、未知提交结果回查、cancel/write admission、并发和 retry 证明；
6. reconciliation snapshot/detail、stale item 可识别展示、auto-completion trigger、void chain 与 locked/closing-period 集成；
7. 每个成功结果对 accounting object、JE、allocation、bank match、reconciliation、Work 和 source 的可导航一致性，以及 cash/subledger tie-out 测试。

产品流覆盖基线仍是 `docs/plan/active/refresh-2026-09-08-frontend-flow-coverage.md:50-52,80,84-90`：C4/C5/C6 当前为碎片化实现和有限参考证据，不能把目标画面或外部参考当作 Clara 已完成能力。
