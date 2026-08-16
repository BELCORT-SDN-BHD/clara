# Clara 产品愿景对齐审计
### 一份独立的、以证据为准的评估 —— 关于「我们是不是造偏了」

**审计日期：** 2026-08-16（Wave E 收官后）
**审计基准：** `origin/main` @ `c0eb843`（79 个已上线 migration，frontier `0084`，runtime chatTurn **v11**）
**方法：** 只读。每一条结论都带 `文件:行号` 或 migration 号。无法验证的地方，我会明说「无法验证」。

> **写在最前面的一句话：** 你说过被过度承诺（over-claim）伤过一次。这份文件的写法是反过来的 —— 我宁可把话说得比实情难听，也不写一句我没亲眼在代码里看到的。凡是我没看到的，我写「没看到」，不写「应该有」。

---

## 1. 判决先行

**判决：不是漂移（drift），是排序（sequencing）—— 但有一处是真的漂了。**

你担心的东西，八成不是「造错了」，而是**你看到的那一层还没造**。Clara 的 agentic 内核是真的存在、真的跑过、而且是在真客户的真账上跑过的：2026-07-29，ROME SECRETARY 的一张 EZSEC 供应商发票 **从 PDF 归档到过账完成，38 秒，全程没有人碰过 coding**（`docs/adr/0050-the-first-production-autopost.md`）。这不是 demo，是 RM350 真的进了账，每一步都有 receipt。同一份记录里还有这么一句，我认为它是整个项目最值钱的一行字：

> **「六次触发；沿途每一次拒绝（refusal）都是一个真实的控制或一个真实的缺陷 —— 没有一次是被绕过去的。」**

这句话的意思是：墙不是摆设，而且没有人为了让流程跑通去拆墙。

但你的感受同样是**对的**，而且这件事你自己在 Wave E 的 grilling 上已经说过一次了，白纸黑字记在合约里（`docs/plan/active/wave-e-contract.md:213-222`，E-R10）：

> 「① 完全没有 userflow —— 没有 signin/signup，没有 firm-setup 的旅程；dashboard 是一堆断开的模块，作为一个完整界面『基本上不存在』」

而当时的裁决是：**这些全部推到 Wave G，Wave E 一样都不做（"the painkiller lane declined"）**。所以今天你打开产品看到的东西，就是你自己那条裁决的、被如实执行的结果。dashboard 的首页至今还是这样（`apps/dashboard/app/page.tsx:1-2`）：

```
// Slice-1 placeholder. The real two-pane Agentic Accounting OS UI comes later
```

—— 一个 `system-ui` 字体、内联样式的纯超链接列表。**所有页面都标着 "plumbing grade"，登录靠手工粘贴 JWT。** 除了 `/chat` 之外，**没有任何一个页面挂着 Clara 的 rail**（我逐页 grep 过 `/close` `/queue` `/documents` `/reports` `/rules`，全部命中都只是注释里提到 `/chat` 这个路径，不是真的嵌入）。PRD §5a 承诺的「两栏 Agentic OS」，一行都还没造。

**那处真的漂了的地方**：客户/事务所的 onboarding 访谈。PRD §4.2 承诺的是「agent-led onboarding —— 智能的、迭代的、clarify-driven 的访谈（验证/规范化输入、推断参数、端到端持续）」。实际造出来的是一个**写死的问题清单 + 正则/枚举校验器，里面一次模型调用都没有**。我用整个 `packages/runtime/workflows/` 目录 grep `streamText|generateText|generateObject|resolveModel`：`interview.v1.*`、`interview.v2.*`、`clientOnboarding.v1/v2/v3`、`firmInterview.v1/v2/v3` **全部零命中**。问题清单长这样（`interview.v2.questions.ts:33-45`）：

```
{ key: "legal_name", question: "What is the firm's registered legal name?", ... }
{ key: "address",    question: "What is the firm's registered address?", ... }
```

这个东西工程上做得很好（durable、可 resume、CAS 写、echo-confirm、park 排序修过 race），但它**不是 agent，是一个表单向导**。而它偏偏是新用户碰到产品的**第一样东西**。你说的「formatted、hardcoded」，指的十有八九就是它。而且 `PROGRESS.md` 的 backlog 里**没有任何一条登记要把它改成模型驱动** —— 这是本次审计发现的、最重要的一个未登记缺口。

---

## 2. Agent 自由度地图

先说三个贯穿全表的硬事实，它们是理解这张表的钥匙：

**事实一 —— 模型手上只有 5 个写动词。** 模型（LLM）能主动调用的写入口，一共 5 个：coding lane 的 `draft_journal_entry`，加上 η 造的四个 `clara.wake_*` authoring wrapper。其余全是读。
（要说精确：DB 授权给 `interactive` wake 通道的 `wake_*` 函数共 **9 个** —— `wake_draft_entry` · `wake_record_client_resolution` · `wake_ingest_document` · `wake_record_notification` · `wake_open_question`（`0002:553-558` + `0011:3910`）+ 四个 authoring wrapper（`0078:191-196`）。差额的 4 个由 **runtime 在模型的工具循环之外**调用，不是模型自己决定要不要用的。）

**事实二 —— DB 里有 9 个 `propose_*` 动词，agent 一个都碰不到。**
`propose_coding_rule` / `propose_bank_rule` / `propose_autopost_rule` / `propose_adjustment_template` / `propose_depreciation_authority` / `propose_metric_definition` / `propose_vendor_identity_binding` / `propose_wrong_client_correction` / `propose_fiscal_year` —— 全部 grant 给 `clara_authenticated`（人的通道），例如 `0059_wave_e_delta_metrics_behavior.sql:83`。
**「提议→审批」这套机器造好了，但方向盘装在人那边。**

**事实三 —— `[proactive]` 唤醒只有一个函数可调，这一条我亲自查了。**
`0002_foundation.sql:553-558` 的 allowlist seed 写得清清楚楚：`('proactive', 'wake_record_notification')`，**仅此一行**。PRD invariant 2(c) 的「speak-never-act」是结构性的，不是 prompt 请求。

聊天 agent 的完整工具清单（这就是全部，没有别的）：

| lane | 工具 | 位置 |
|---|---|---|
| 读 | `list_unassigned_documents` `read_document` `get_context_pack` `trial_balance` `list_journal_entries` `get_journal_entry` | `chatTurn.v10.tools.ts:400-472` |
| 写 | `draft_journal_entry` | `chatTurn.v10.tools.ts:480` |
| 停 | `clarify`（无 execute —— 用来 park 整个 workflow） | `chatTurn.v10.prompt.ts:208-218` |
| 撰写 | `list_metric_catalog` `compose_metric_preview` `save_metric_definition_draft` `draft_report_spec` `request_report_preview` | `chatTurn.v11.tools.ts:160-288` |

循环长度上限 **8 步**（`chatTurn.v11.impl.ts:132`：`stopWhen: [stepCountIs(8), hasToolCall("clarify"), stoppedOnSuccessfulDraft]`）。

**顺带回答一个你可能想问的问题：这个产品里到底有多少地方真的在用 AI？** 我搜遍了全仓库（`generateObject|generateText|streamText|@ai-sdk`），**只有四条 lane 会调用模型**，一条不多：

| lane | 干什么 | 位置 |
|---|---|---|
| `chatTurn` | 交互式聊天 + 起草 + 撰写 metric/报表 | `workflows/chatTurn.v11.*` |
| `autoDraft` | **无人值守**的扫描记账 | `workflows/autoDraft.v7.*` |
| `classify-llm` | 单据类型分类（校准过的置信度） | `lib/classify-llm.mjs` |
| `wiki-projection` | 交易对手 wiki 页的合成（**受 egress consent 双阶段闸门约束**） | `lib/wiki-projection.mjs` |

其余全是确定性代码 —— 包括整个渲染器（`packages/reporting-render/` **零次模型调用**，我查过）和整个 onboarding 访谈。**这不是坏事，但值得你心里有数：AI 在这个产品里是四个精确放置的部件，不是弥漫在各处的一层。**

### 逐流程的自由度

| 流程 | **自由行动**（loop / retry / 起草 / 解释） | **提议，由墙验证** | **宪法级要求人的钥匙** | **完全还没有 agent** |
|---|---|---|---|---|
| **文件进来** (intake) | 分类器是真模型：读 OCR layout，输出校准过的 `{kind, confidence, rationale}`，18 个 kind 的封闭词表（`lib/classify-llm.mjs:1-8, 26-40`）。自愈也是真的：卡死任务重排队、held-egress 释放、dead-letter 重试（`lib/reconciler-documents.mjs:7-28, 121-145`） | `classify_document`：**≥0.8 才写 kind；<0.8 留 NULL 并开一个人类 question**（`classify-llm.mjs:4-7`）。人手工录入的 kind 永远压过模型 | 把文件归到某个客户（filing）—— 必须在 `/documents` 页做完才能 coding | **agent 没有归档工具**。它能 `list_unassigned_documents` 看到孤儿文件，但**没有任何动词能把它归给客户** |
| **Coding（记账）** | **真正的无人值守 loop**：`autoDraft` 8 步、4 个工具、没有人在场（`autoDraft.v7.impl.ts:206`；`autoDraft.v7.tools.ts:419-465`）。prompt 明写「no human is watching this run」，而且**没人在场时它不猜也不问，直接不出草稿**（`autoDraft.v7.prompt.ts:41-46`）—— 这是对的行为。**而且它会自己升级问题**：模型给出的若是「问句形状」的非草稿回应，workflow 就替它开一条 scoped open question 交给人（`autoDraft.v*.impl.ts:180` 调 `clara.wake_open_question`），且该 writer 只会**降级**通道、不会升级（fail-safe） | `draft_journal_entry` → 撞四道结构墙：client ≥0.95 归属、provenance 绑定、evidence 区域校验（CLR21）、借贷平衡触发器 | `approve_entry` —— **agent 名下根本没有这个动词**（ADR-015：「agent 永不签字」是入口的缺席，不是运行时检查）。`0084` 进一步规定：agent 起草时，maker/checker 认的是**下指令的那个人** | **generic lane 不会孕育规则**。`ARCHITECTURE.md:291-300` 自己写着：sighting 只在 supplier_bill 和 sales_invoice 上繁殖，长尾单据「得不到复利式的自主性」，并称这是「Waves C 和 D 之后**价值最高的、仍未建造的**自主性工作」 |
| | 已上线的**无人过账**通道：human-signed standing rule。人签一次规则，规则就是过账权限（ADR-0025 / ADR-0050） | | | |
| **Close（结账）** | — | `get_close_plan` 是纯读；三个抽屉的 gate 全部 DB 计算（`0064_wave_e_theta_close_plan.sql:188-231`） | **三把钥匙**（E-R11，`wave-e-contract.md:224-241`）：① prepare = bookkeeper+ ② close + 签 drawer-2 例外 = owner/partner ③ reopen = owner/partner。**agent 结构性地零钥匙 —— 这些动词在 agent 的 DB role 上不存在**，改授权名单也改不了 | **agent 完全没有 close 相关的工具**，一个都没有。`/close` 页是 plumbing grade（`apps/dashboard/app/close/page.tsx:1-8`）。**而且从没跑过**：`fiscal_years` 表零行（`PROGRESS.md:59-61`） |
| **Reporting（报表）** | **这是全系统最「agentic」的一块**：`compose_metric_preview` 让 agent **自由撰写一个 metric AST**，DB 负责算，agent 只能引用返回的 `displayed_text`（`chatTurn.v11.tools.ts:186-209`）。这是最接近 "code interpreter" 的东西 —— 只不过解释器是 Postgres | `save_metric_definition_draft` / `draft_report_spec` / `request_report_preview` → 撞 numeral wall（`0068:167-374`）、watermark、claim gate。**layout 里不准出现任何数字字面量** | metric definition 的审批必须是**与提议人不同的人**（E-R5/R18）；`canonical` 级别**没有任何被授权的 writer** —— 只能由 migration 产生（`wave-e-design-reporting.md:240-242`） | **法定措辞表是空的**：所有 statement title / FS line caption / note heading / claim 措辞，结构造好了但**零行数据**，等你 MASB 手册核对 + 人工签字（`wave-e-design-reporting.md:250-255`）。渲染器至今**没封过一份 artifact**（首次上线跑 `sealed=0 refused=0`，`PROGRESS.md:33`） |
| **Tax（税务）** | — | SST 注册合规 watch：DB 计算的**筛查估算**，agent 被要求**主动、不请自来地**提起它，并且必须同时说出它的 basis 标签和验证状态（`chatTurn.v10.prompt.ts:138-161`） | 注册状态是**人记录的 sticky state**；`future_method_status` 是**人证实的**，agent 严禁从账面趋势推断 | **整个税务引擎不存在。** 我搜过全库：`sst_02` / `capital_allowance` / `chargeable_income` / `form_c` / `cp204` —— **零个实现**。全部在 Wave F |

### 无人值守的定时带（belts）

`ARCHITECTURE.md:55-70` 记载 reconciler 上挂着**五条每日 belt**，全部由 leader 的 daily flag 驱动、**逐条失败隔离**：autopost-rule 到期提醒（`0015`）· `sst_watch`（`0016`）· wiki-lint（Wave B）· FA 折旧运行（`0041`）· recurring-adjustment（`0045`）。最后一条在**性质上是新的** —— 它是产品的**第一个由日历触发的过账者**；在 `0045` 之前，Clara 从不按时间表过账，只对事件或人做出反应。它的自主性由一条 authority doctrine 约束（WD-R5/R8）：**必须有 admin+ 签的 per-client 授权；某个模板下的第一次发生永远只出草稿（the ramp）；之后才自动过账，每次带 receipt；高风险的那一次永远转给一个不同的人**。

**这一条我回头补验了，结论成立：** `lib/reconciler.mjs:509-516` 就是那五条 belt 的组装处，一条一条挂在 leader 的 daily flag 上：

```js
if (deps.autopostRules) autopost = await reconcileAutopostRules(client, { log });
if (deps.sstWatches)    sst      = await reconcileSstWatches(client, { log });
if (deps.lintBelt)      lint     = await reconcileLintBelt(client, { log });
if (deps.faRuns)        fa       = await reconcileFaRuns(client, { log });
const adj = deps.adjRuns ? await reconcileAdjustmentRuns(client, { log }) : {};   // 0045
```

**失败隔离是真的，但它在每条 belt 的内部，不在这个组装处** —— 这里的 `await` 没有外层 try/catch，所以隔离必须由 belt 自己负责。我抽查了 SST 那条（`reconciler-sst.mjs:54-84`），它做得很干净：客户端发现失败时**返回 `sstOk:false` 而不是抛**（`:62-65`）；逐客户的循环里每个客户各自 try/catch、失败计数后**继续**（`:73-84`）；而且注释指出 DB 里的评估器本身也是异常隔离的（返回 `{status:'failed'}` 而非 RAISE）。同一段注释还解释了**为什么必须一个客户一条语句**：每条 evaluator 的状态转移会发出一个 domain event，其第一个动作会把该 firm 的 `firm_event_seq` 计数器行锁到提交为止 —— 一次性扫全部客户会把这把锁攥住整趟扫描，**把并发的审批、起草、聊天、进件全部堵在后面**。

> **仍未验证：** 另外四条 belt 的内部隔离我**没有**逐个抽查（只查了 SST 这条）。如果其中某条有一条未捕获的抛出路径，**排在它后面的 belt 会被饿死**，因为组装处不兜底。这是我建议 Wave F 开局补掉的具体一件事。

---

## 3. 「Hardcoded」的解剖

你指着说「这不就是写死的规则吗」的东西，我挑三个最典型的，逐个拆开：它挡的是什么、**为什么 LLM 不能拥有这个数字/这段文字（职业责任层面）**、以及**这堵墙恰恰是怎么给 agent 买来自由的**。有一个我会明说：它同时也只是**还没做完的 UX**。

### 3.1 system prompt 里那段 SST 分录形状规则

`chatTurn.v10.prompt.ts:80-98` 有一整段 if-then：

> 「腿的形状只取决于一件事 —— 单据抽取出来的 facts **有没有陈述一个非零税额**。每次都先查这个：
> · 没有陈述税额，或陈述的税额**正好是零** → **两腿**：费用科目借**含税总额**，应付账款贷同一个总额。
> · 陈述了**非零**税额 → **三腿**：费用借**净额** + 一条绑定的 sst_purchase_cost 借方腿，金额**精确等于** facts 里的税额 + 应付贷**总额**。」

**它挡什么：** 挡「模型自己推理出一个 input tax 资产」。

**为什么 LLM 不能拥有它：** 马来西亚 SST **没有进项税抵扣**（PRD §6.12）。一个受过通用会计训练的模型，看到「税」两个字，本能会去开一个可抵扣的进项税资产科目 —— 那是 GST/VAT 的直觉。在 SST 底下，这会在客户账上凭空造出一笔**不存在的资产**，而且它会**在每一张采购单据上静静地复制一次**。这类错误的可怕之处不在于单次金额，而在于它**事后无法被发现** —— 一个数字不会带着「我是怎么来的」这个信息。等 MIA 查账时，你面对的是几百笔一致的错误分录，而不是一笔。这就是为什么这段话必须是**规则**，不是**判断**。

**它怎么买来自由：** 正因为腿的形状被说死了，`autoDraft` 才敢在**没有人在场**的情况下起草。如果这一步留给模型判断，每一张采购单据都必须停下来问人 —— 那 99% 省人力的承诺就不成立了。**说死一件小事，换来一整条无人值守的流水线。**

**诚实的两面：**
- 这是 **prompt 层面**的，不是结构层面的。prompt 是一堵**软墙**。真正的硬墙在下游（余额触发器、evidence 校验、provenance 绑定），但「两腿还是三腿」这个判断本身，今天靠的是模型听话。
- 而且这条规则**被证据改过一次**，这恰恰是健康的：ADR-0050 记载，模型在 IV-00743 上给出 `coding_incomplete` 拒绝是**正确的** —— 它拒绝的那条规则被客户自己的账本推翻了。裁决是「**规则动，墙不动**」。这是这个体系应该有的样子。

### 3.2 deterministic evaluator + numeral wall

migration `0058-0061`（evaluator 冻结族）+ `0068`（layout 校验器）。

**它挡什么：** 任何模型敲出来的数字进入报表。`0068:374` 的拒绝理由直接写着 `{"reason":"numeric_literal_forbidden","fix":"reference metric versions or versioned constants"}`。

**为什么 LLM 不能拥有它：** 这是 PRD §6 第一条法律。一份签了名的财务报表上的错误数字，是**能弄垮事务所的那一类错误**。模型可以 99% 正确 —— 问题在于剩下的 1% 事后**找不出来**，因为渲染出来的数字上没有任何痕迹告诉你它是算出来的还是编出来的。所以这条法律的措辞是（PRD §6.1，2026-08-08 由 ADR-065/E-R4 修订）：模型**可以**提议、**可以**独立复核，但**任何模型生成的数字都不能进入持久化报表，除非一个版本化的 deterministic evaluator 能从 DB 拥有的输入把它重新算出来**。

**它怎么买来自由 —— 这是全篇最重要的一句：** **正因为数字不可能来自模型，模型才被允许自由撰写任何一个 metric。** `compose_metric_preview` 敢接受一个 agent 自由组合的 AST，就是因为算这件事不归它管。墙不是自由的对立面 —— 墙是自由的**前提**。这就是为什么这个产品里唯一一处「code-interpreter 式」的能力，恰恰长在防守最严的那一块地上。

**诚实的一面（这一条我认为你会欣赏）：** 这堵墙在代码里**自己承认了自己的边界**（`0068:207-224`）：

> 「**诚实的限度，写出来而不是藏起来。** 这是罩在一片叶子上的**防误网**，不是围栏。它抓不住写成文字的数目（'one hundred and twenty five thousand'）、抓不住裸的四位数（和年份长得一样）…… 也抓不住裸的小数 '12.50'，**这是一个刻意的限度而非疏忽**，因为 '12.50' 和 'Section 2.14' 是同一个形状，没有任何东西能从字符串本身分辨哪个是钱。规则若抓住前者就会误伤后者 —— 而**误伤作者一次合法的交叉引用，就等于教会他这堵墙是噪音，墙就是这样开始没人看的**。真正的围栏是结构性的，在别处：报表正面的每一个数字都通过 metric_ref 解析。」

我把这段完整抄给你，是因为它是这个仓库品质的最好证据：**这个体系不会为了好看而夸大自己的防护**。

### 3.3 44 个 CLR 拒绝码

我数过：`packages/db/migrations/` 里一共 **44 个不同的 CLR 码**（CLR01–CLR43 + CLR99）。

**它挡什么：** 每一条拒绝路径。

**为什么必须是「有类型的」：** 一个没有类型的错误字符串是**死路** —— 调用方只能记日志然后放弃。一个有类型的拒绝是**下一个动作**。

**它怎么买来自由：** 三层都在用，而且是我亲眼验证的：
1. **运行时按码分支** —— `lib/opening-parse.mjs:148-150` 有一个通用判定 `/^CLR\d{2}$/`；`lib/intake.mjs:496-498` 把码映射成 HTTP 状态（CLR16→404、CLR18→429、CLR11→403）；多个 sweeper 用 `err?.code !== "CLR16"` 决定是记录还是重试。
2. **模型直接读到拒绝的内容** —— η 的 authoring 工具把 DB 的拒绝原样打包给模型（`chatTurn.v11.tools.ts:33-48`）：`{ ok:false, code, reason, fix, message, details }`。注释里说得很清楚：

   > 「拒绝是一个**结果**，永远不是一个 throw：模型必须能读到那个被命名的理由、以及数据库给的**修复建议**，并据此行动。」

   而且 `details` 刻意做成开放 map 而不是固定字段列表 —— 因为写死字段列表**已经悄悄丢掉过四个** DB 传来的诊断字段。
3. **prompt 教它怎么用** —— `chatTurn.v11.prompt.ts:144-145`：「如果一个工具拒绝了，读它命名的理由，然后修正请求或者问人 —— **不要用同样的调用重试，指望换个答案**，也永远不要把一个拒绝当成结果呈现。」

**诚实的一面（一个真实的、未登记的小缺口）：** 那个最有用的 `fix` 字段，**只有 authoring lane 有**。coding lane 的拒绝（`RefusalPart`，`chatTurn.v10.prompt.ts:342`）只带 `code / reason / message`，**DB 给的 `fix` 在 v10 的映射器里被丢掉了**。也就是说，「有类型的拒绝 = agent 可读的下一步」这个性质，是 Wave E 才做出来的，**还没有回填到最主要的那条记账通道上**。这是个小改动，但没人登记它。

### 3.4 附带一条：法定措辞表 —— 这一个纯粹是「还没做完」

你可能也会指着 statutory wording 表说「这不是写死的吗」。这里我要给你一个不同的答案：**它今天连写死都还没写死，它是空的**。所有人类可读的文字（statement 标题、FS 行标题、note 标题、claim 措辞）在 ε 里只有**结构、零行数据**，等的是任务 #43（MASB 手册人工核对）和你的 ms/zh 签字（`wave-e-design-reporting.md:250-255`；`PROGRESS.md:99-100` 显示这条 lane 现在就 **HOLD 在你手上**）。

这是一个诚实的双面事实：一方面，法定措辞**本来就该是人签字的东西**，模型不能自己发明一份 MPERS 报表的标题 —— 那是职业责任，不是技术问题。另一方面，**今天产品被卡在你的签字上，这就是「永远需要人干预」的一个活标本**。缓解在于它是**数据表**不是代码：签一次，之后按 effective date 生效（digest 第 16 条法律：马来西亚税务事实活在 effective-dated policy table 里，永远不在产品法律的散文里）。

**而 claim gate 让这件事变成了硬性的：** 我读了 `clara.assess_report_claim`（`0070:279-423`）。它**完全是机械谓词，没有一丝判断**，四个状态：

- `not_applicable` —— 模板本身就没有 claim 能力
- **`failed`** —— 任何一个**必填**的法定 slot，其措辞在这个 locale、这个期间起点上**不是 `verification_state = 'verified'`**（`:357-366, 375-376`）
- `stripped` —— layout 漏掉了必填章节（`:367-371, 377-378`）
- `eligible` —— 全部通过

加上一条独立的 `uncertified` 轴（有非法定 cell 时为真）。

而 claim 的**文字标签**来自按 locale 的版本化 policy 行，**没有任何 fallback** —— 找不到就直接 CLR10 中止（`:338-346`），拒绝理由是 `{reason:'claim_policy_absent', locale, fix:'先为这个 locale 落一行版本化的 claim-policy 再来评估'}`。注释解释得很直白：*「借用另一个 locale 的标签，等于产品在用一种没人验证过的语言发明措辞。」*

**所以这三件事其实是同一件事：** 措辞表空 → claim gate 必然 `failed` 或直接 CLR10 → **没有任何一份报表能被封存**。`PROGRESS.md:33-35` 说的「渲染器首次上线是空跑、DR 演练还没跑因为还没有任何封存 artifact」，**根源就在你那支还没签的笔上**。这不是缺陷，是 fail-closed 设计在正确工作 —— 但它确实意味着**整条报表链路今天是被你的签字挡住的**，而不是被技术挡住的。

顺带一提，这个函数里有一处细节值得你看看（`:348-351`）：`no_claim` 分支下，「缺失措辞」和「缺失章节」两个数组保持 **NULL 而不是 `[]`**，注释写着 *「null 说的是**没测量**，`[]` 说的是**测量了、没发现** —— 一个七年后读这张 receipt 的人，必须能分得出这两者。」* 这就是 audit-grade 的意思。

### 3.5 附加发现：这些墙会「自己证明自己」—— 我实地核对过一堵

审计开始时我把「四个 wake wrapper 的权限边界」列为**未验证**，因为 `chatTurn.v11.tools.ts:11-19` 只是**声称**每个 wrapper 只授予 `clara_wake_interactive`。按本仓库自己的第 31 条法律 —— **「一堵从没拒绝过任何东西的墙，不是守住了的墙，是没被问过的墙」** —— 声称不算数。所以我打开 `0078` 核对了。

**结果比它声称的更强。** 这个 migration 在自己的尾部（`0078:198-269`）向 PostgreSQL 的 catalog 直接发问，任何一条不成立就以 CLR10 中止整次 apply：

- 每个 wrapper 必须是 SECURITY DEFINER 且 `search_path` 已钉死（`:216-219`）
- `clara_wake_interactive` 必须**有** EXECUTE（`:220-222`）
- **授权者的完整集合必须精确等于 `{clara_wake_interactive}`** —— 用 `aclexplode` 读 catalog **实际持有**的 ACL，**穷举而非抽样**，连 PUBLIC 都算进去（`:228-235`）。注释写明了为什么不用手列角色名：*「手列的角色名单只能拒绝它恰好写到的角色：一个在这个文件写完之后才发明的角色、或者被某个不相干的 migration 后来授权的角色，能通过抽样却过不了这一关。」*
- 另外七个具名角色（含 `clara_authenticated`、`clara_wake_proactive`、`clara_agent_ro`）必须**没有** EXECUTE —— 而且用的是 `has_function_privilege`，**会穿透角色继承**（`:239-243`）。注释解释了为什么两把尺子都要留：一把读直接授权，一把读有效权限。
- 被包在 wrapper 里面的那三个 **core 函数，必须没有任何应用角色能执行 —— 包括 `clara_wake_interactive` 自己**（`:246-252`）
- allowlist 必须恰好 4 行且全部是 `interactive`（`:253-260`）
- 「谁能写 metric definition」的普查数必须和这个文件执行前一模一样（`:263-269`）

**这为什么值得写进给你的报告：** 这就是「hardcoded 规则」和「结构性保证」的分界线。一句注释是可以骗人的；一个在 apply 时向 catalog 穷举提问、答错就整体回滚的 DO block，**骗不了人**。你担心的「写死的规则会慢慢腐烂」，在这类墙上是不成立的 —— 它每次部署都会重新问一遍。

---

## 4. 与「ChatGPT-in-accounting」的差距清单

这一节是整份审计**最值钱的部分**。我不注水，也不藏。

### ✅ EXISTS（已经存在，可引用）

| 你想象的能力 | 实际状态 | 证据 |
|---|---|---|
| **自由的 agent loop** | 有，但**封顶 8 步**。chat 和 autoDraft 各自 8 步 | `chatTurn.v11.impl.ts:132` · `autoDraft.v7.impl.ts:206` |
| **Code-interpreter 式的计算** | 有，一处：agent 自由撰写 metric AST，Postgres 当解释器 | `chatTurn.v11.tools.ts:186-209` |
| **主动自动化（proactive）** | 有：五条每日 belt + 事件 spine（domain_events + outbox）+ **跨全部客户的 review queue**（`list_review_queue` 的 `client_id` 是可选的，UI 默认就是 "All clients"） | `ARCHITECTURE.md:55-70` · `0016_a21_compliance_watch.sql:4558-4575` · `apps/dashboard/app/queue/page.tsx:82,179` |
| **自愈（self-healing）** | 有，而且相当扎实：卡死任务重排队、held-egress 由 DB 裁决释放、dead-letter + 重试、WDK 启动时自动恢复在途 run（约 5 秒） | `lib/reconciler-documents.mjs:7-28` · `ARCHITECTURE.md:232` |
| **无人值守过账** | 有，已在真客户真账上做过：38 秒，PDF→过账 | `docs/adr/0050-*.md` |
| **URL 即真相 / 跨客户收件箱** | **部分已有**，只是没样式：queue 把 scope/selection/cursor 镜像进 URL，默认跨全部客户 | `apps/dashboard/app/queue/page.tsx:44-90,178-179` |

### 📅 SCHEDULED（已登记，有归属的 wave）

| 能力 | 归属 | 出处 |
|---|---|---|
| ⌘K Ask/Do/Go、object ActionPanels、proactive inbox 界面、plan-as-document、exports UI、generative-UI 完备性 + parity CI gates | **Wave G** | `docs/plan/active/roadmap.md:18-24` |
| signin/signup、firm-setup 旅程、原始单据点入、真正的 session auth（取代手工 mint 的 JWT） | **Wave G**（E-R10，你自己的清单） | `wave-e-contract.md:213-222` |
| 整个税务引擎：SST 周期、payment basis、dual-registrant 导出、SST-02、坏账减免、薪资截止日历、税务计算草稿 | **Wave F** | `roadmap.md:8-16` |
| claims accounting（员工代垫）、FX-lite、LLM 第三读者（#25）、settlement-corroboration door | **Wave F** | `roadmap.md:13-16` · `PROGRESS.md:207-209` |
| 「工厂重置 + 从原始单据完整 E2E 重建」 | **Wave G 收官** | `roadmap.md:25-27` |

### ❌ GENUINELY MISSING — UNREGISTERED（真的缺，而且没人登记）

**这六条是本次审计的核心产出。它们不在任何 wave 的 scope 里，也不在 `PROGRESS.md` 的 backlog 里。**

**① onboarding 访谈里一个模型都没有。**
PRD §4.2 承诺「智能的、迭代的、clarify-driven 的访谈」。实际是固定 segment 数组 + 枚举/正则校验器（`interview.v2.questions.ts:33-45`），整个 interview/onboarding 家族**零次模型调用**（我 grep 过全目录）。这是**新用户碰到的第一样东西**，也是你「hardcoded」感受最直接的来源。**没有任何 backlog 条目要改它。**

**② 「审计过的自由读」工具不存在。**
`ARCHITECTURE.md:87-89` 明确承诺：「凡是真正需要自由读的地方，它跑在只读 role 上、参数化、并且被审计记录」。**表和授权都造好了** —— `clara.freeform_read_log` 在 `0002_foundation.sql:308`，`grant insert ... to clara_runtime` 在 `0002_foundation.sql:542`。但**整个 `packages/runtime/` 里没有一个文件写它**。结果：Clara 只能回答 6 个固定读工具能返回的东西。「随便问 Clara 关于这套账的任何问题」**今天是做不到的**。未登记。

**③ agent 碰不到「提议→审批」这套机器。**
DB 里 9 个 `propose_*` 动词，agent 的工具清单里**一个都没有**。Clara 不能提议一条 coding rule、一条 bank rule、一个 adjustment template、一个 vendor binding。**「越用越自动」的复利循环，今天只能由人发起。** 未登记（`ARCHITECTURE.md:291-300` 登记的是 sighting 繁殖的范围问题，不是 agent 没有手这件事）。

**④ 有类型拒绝的 `fix` 字段没有回填到 coding lane。**
见 §3.3。小改动，未登记。

**⑤ agent 在 close 和 reconciliation 上连「读」都没有。**
五个写动词的限制是**故意的**（三把钥匙），我不认为那是缺口。但 Clara **连一个读 reconciliation 例外的工具都没有** —— 她字面上无法回答「哪些还没对上账？」。未登记。

**⑥ AI 质量的 eval harness 不存在，所以「会不会一直出错」今天没有数据能回答。**
`roadmap.md:68-70` 把它列为 Phase-5 的**真实门禁**（归属精度 + 弃权率、按单据类别的 coding 准确率、must-ask 召回率、autopost 精度），门槛值写的是「Gate 3 时设定」—— **我在仓库里找不到任何已设定的门槛值**。

**这里要说清楚一个区别，免得我把话说过头：** 每个 wave **确实**都跑 live eval，而且那是标准验收门（ADR-0027，「一个 wave 不是在合并+审查后完成，而是在它的 gate 在真实账本上关闭时才完成」）。那套东西证明的是**机制正确**：这个动词有没有拒绝该拒绝的、这条 receipt 有没有写、这个数对不对得上。

**缺的是另一种东西 —— 统计性的质量测量。** 「Clara 一百次里对多少次」「她该问人的时候有多少次真的问了」「她拒绝的时候有多少次是拒绝对了」。这类数字**一个都没有**。所以你那个问题（会不会一直要人干预）今天**任何人都只能凭感觉回答**，包括我。我认为这是最该先补的一条。

---

## 5. 脆性风险的诚实评估

**你的问题是：这套规则机器会不会一直出错、一直需要人去救？**

**我的答案分两半，而且两半的方向不一样。**

### 5.1 已有的证据说：墙是有效的，而且修复是往上游走的

这一点有四个具体的、可查的例子，全部是这个体系**自己抓到自己的**：

1. **UUID 抄错事件（最有说服力的一个）。** `chatTurn.v10.prompt.ts:8-19` 记载：起草模型把一个 36 位 region UUID 的**其中一组十六进制抄错了**（`…-4c6d-…` 抄成 `…-4fce-…`），而且在多次独立尝试中**反复发生**，chat lane 和 autoDraft lane 都中招。DB 的 evidence 墙（`clara._write_entry_evidence`）**每一次都正确地以 CLR21 拒绝**；人手工引用真 id 起草则一次通过。裁决不是「让模型再小心点」，而是**把这个字段从工具面上彻底删掉**：现在模型只能给一个小整数 `region_idx`，服务端自己解析成 region_id。
   **这是整个安全论证的活体演示：模型稳定地犯了一个错，零个错误数字进了账，修复动的是上游的人机接口，墙一动不动。**
2. **分类器的死循环。** `classify-llm.mjs:17-24`：某些 kind 会被 `classify_document` 无条件拒绝；一个被这种 kind 污染的文件会被永远重排队重分类，**约每天 144 次模型调用**。这个在**上线前**就被发现并用一个 `DB_REFUSED_KINDS` 常量堵住，还配了测试防止将来加 kind 时悄悄复活。
3. **autoDraft 的 reducer 缺陷。** 一个把整个模型循环塌缩成单一结果的函数，会让「先拒绝、后成功」的序列被判定为整体失败。已找到并修复，而且在 chat lane 的对应函数上留了注释说明为什么那里结构上不会有同样的问题。
4. **wiki 投影的 catch-all。** 一个包罗万象的分支把无法识别的 CLR32 一律映射成 `skipped_bad_state` 并推进 checkpoint —— **等于永久丢失一个根本没收敛的事件**。已改成封闭的终态表。

**共同点：四次都是「有类型的拒绝暴露了问题 → 修上游」，没有一次是「放松墙让它过去」。** ADR-0050 那句「沿途每一次拒绝都是一个真实的控制或一个真实的缺陷 —— 没有一次是被绕过去的」，是有具体案底支撑的。

### 5.2 但真正的脆性风险在别处，有四条，我逐条列出

**风险一（最大）：Wave E 的绝大部分，还没见过真实的工作。**
- `fiscal_years` 表 **零行** —— close model 是 LIVE-INERT，**从来没有真正跑过一次结账**（`PROGRESS.md:59-61`）
- `reporting_periods` / `period_snapshots` **零行**
- 渲染 worker 首次上线运行是一次干净的空跑：`sealed=0 refused=0 abandoned=0` —— **它无事可做**（`PROGRESS.md:33`）；DR 的 re-render 演练**刻意还没跑**，因为**还没有任何一份封存的 artifact 存在**（`PROGRESS.md:34-35`）
- 两个真实的固定资产登记册都持有**零项资产**（`PROGRESS.md` backlog）

**结论：这些地方的脆性不是「不存在」，而是「未测量」。** 已登记的缓解是 E-R9 的 owner-key 验收语料（`PROGRESS.md:101-107`）：sandbox battery → **BEE FY2025 第一次真实结账** → RPR 历史 MPERS pack → RS snapshot 见证。**这是你坐下来才能推进的事，也是把这条风险从「未知」变成「已知」的唯一办法。**

> #### 这条风险的一个活体样本 —— 我在这次审计中当场撞到一个
>
> 我在核对 close model 时，从三个互相独立的点拼出了一个**尚未触发的真实缺陷**（并行的另一条 lane 也在同一晚独立登记了它，编号 #17 —— 两边是各自查出来的）：
>
> 1. `0016_a21_compliance_watch.sql:51` 给 `journal_entries` 加了 `closing_transfer` 标记，**默认 `false`**。
> 2. SST 营业额评估器只在 `is_year_end AND closing_transfer` **两者同时为真**时才排除一行（`0016:602`）—— 注释还特意解释了为什么必须是「两者」：一笔年终的**收入更正**（`is_year_end` 但非 `closing_transfer`）理应照算（`0016:48-49`）。
> 3. 但 `0056_wave_e_close_model.sql:2243` 的结账写入器，其 INSERT 字段清单里有 `is_year_end`，**没有 `closing_transfer`**。
>
> **后果：** 第一次真实结账所产生的 P&L→保留盈余结转分录，会被 SST 注册合规 watch **当成营业额算进去**。对一个接近 RM500,000 门槛的客户，这意味着结账之后 watch 会报出一个**虚高的筛查估算**，甚至可能把客户推进一个假的 `crossed` 状态。
>
> **同样重要的是它的爆炸半径 —— 我不想往吓人的方向夸大：** SST watch 在设计上是**纯咨询性的**，它**永远不移动钱、不阻断任何流程、不把数字乘进应缴税额**（PRD §4.11，WA21-R3/R5/R6）。所以这是一个**错误的警告**，不是一笔**错误的账**。四道结构墙一道都没被突破。
>
> **但这正是风险一想说的事：** 这个缺陷不是被使用发现的 —— 它没法被使用发现，因为 `fiscal_years` 表里一行都没有，**这套机器从来没跑过**。它是被**阅读**发现的。已经跑了几百次的路径（intake、coding、autopost）经过了真实工作的打磨；`0056`/`0064` 这些从未跑过的路径**没有**。这就是为什么 §5 的结论是「未测量」而不是「没问题」，也是为什么建议三（eval harness）和 E-R9 的第一次真实结账应该排在 Wave F 的前面。

**风险二：数据维护负担是真的，而且现在就在卡着。**
digest 第 16 条法律要求马来西亚税务事实活在 effective-dated policy table 里 —— 这是对的设计（改数据不改代码），但代价是**每次 SST 税率/门槛/MASB 措辞变动都是一次人类动作**。此刻的活标本：MASB wording seed 这条 lane **就 HOLD 在你的 ms/zh 签字上**（`PROGRESS.md:99-100`）。
缓解：`firm_approved` 这一级是事务所自己能批的逃生门（statutory eligibility 认 `canonical` **或** `firm_approved`，`wave-e-design-reporting.md:246-248`）—— 所以事务所不会被 Clara 的发版节奏卡死。只有 `canonical`（Clara 出厂的那一套）必须走 migration。

**风险三：migration / ceremony 的重量在增长。**
已上线 79 个 migration（frontier `0084`）；本次收官跑了**三场 ceremony**，其中一场需要 D1 write-quiesce 窗口（`PROGRESS.md:12-17`）。CI 目前 45-60 分钟，**每关一个 wave 就多一次全链条 apply**（`PROGRESS.md:186-189`）。
已登记的缓解：CI economics overhaul（Wave F，按杠杆排序的五步方案，`PROGRESS.md:183-205`）。**这条我认为登记得很扎实，不用担心。**

**风险四：质量无法测量。**
见 §4-⑥。今天没有 eval harness，所以「弃权率对不对」「must-ask 该问的有没有问」「coding 准确率多少」**全部是零数据**。这是「会不会一直要人干预」这个问题目前无法回答的真正原因 —— 不是因为答案不好，而是因为**还没有仪表**。

### 5.3 一个必须说清楚的区分

`PROGRESS.md:282-345` 里那一长串「人不得不介入」的事故 —— S0.9 的集群 xid race、WSL 虚拟机空闲拆除、MAX_PATH 让 git 的恢复命令都失效、磁盘写满、η 的 180-red staging 脱同步 —— **全部是构建工具链（build harness）的脆性，不是产品的脆性**。这里面**没有一件**是记账员会看到的东西。

我特意点出来，是因为如果你从 session log 读下来，很容易把「今晚我救了五次火」误读成「这个产品需要一直救火」。**它们不是同一件事。**

---

## 6. 给 Wave-F 坐席的三个建议

按「让产品**感觉上**和它**实际上**一样 agentic」这个目标排序。

### 建议一：把 onboarding 访谈接上模型 —— 保留骨架，换掉入口

**做什么：** 保留 `interview.v2.questions.ts` 的 segment 清单当作 **schema**（它保证了数据干净，这是它存在的理由，不要动它），但在它**前面**放一个模型层做 normalizer / extractor：人可以扔进来任何东西 —— 一张 SSM 证书、一段 WhatsApp 讯息、一句「sole prop，12 月年结，没注册 SST」—— 模型尽量把 segment 填满，**然后每一格仍然走原有的 validate → echo-confirm → persist 三步**（`clientOnboarding.v3.ts:11-12` 的 P19 契约一个字都不改）。填不出来的、校验不过的，就退回原来的逐题问法。

**成本：低。** 一条模型 lane，加上一个已经存在的 park 形状。不碰 DB，不碰 migration，不碰任何 invariant。按 ADR-061 是一次普通的完整 ladder。

**影响：极高。** 这是新用户碰到产品的第一样东西。今天它是表单，改完之后它是对话 —— **而且底下的数据保证一点没变**。你「hardcoded」的感受，有很大一部分会在这一步消失。

**为什么是它而不是 ⌘K palette：** palette 是 Wave G 的，工程量大得多；这一条能用零头的成本换到**同一种感觉**。

### 建议二：把「审计过的自由读」造出来

**做什么：** `ARCHITECTURE.md:87-89` 已经写好了规格，`clara.freeform_read_log` 表和 `clara_runtime` 的 insert 授权在 `0002_foundation.sql:308,542` 已经躺了 79 个 migration。缺的只是**一个工具 + 一次 receipt 写入**：参数化的 SELECT，跑在结构性只读的 agent role 上（`default_transaction_read_only = on`，所以 `select approve_entry(...)` 在 role 层就失败，不靠字符串检查），每次读都记录 query text + actor + purpose。

**成本：中低。** 但**必须走判断逻辑的完整 review ladder**（house law 1），而且要认真对待注入面 —— PRD §6.5：OCR 输出、DB 自由文本、抓取内容都是**惰性数据，永远不是指令**。这一条我建议配一次 cross-model 对抗审查。

**影响：高。** 今天 Clara 显得「窄」，最大的单一原因就是她只有 6 个固定读工具。这一步之后，「随便问 Clara 关于这套账的事」才第一次成立 —— 而且安全属性（只读 role + 审计）**是现成的**，不需要新发明。

**顺带把 §4-③ 一起解决一半：** 如果同一次也给 agent 开 `propose_coding_rule` 的 wake wrapper（模式和 η 的四个 wrapper 完全一样），「越用越自动」的复利循环才真正闭合 —— 今天它只能由人发起。

### 建议三：先建一个最小的 eval harness，只量三个数

**做什么：** `roadmap.md:68-70` 已经把它列为 Phase-5 门禁，只是门槛值一直「等 Gate 3 设定」。**现在就设，而且往小里设。** 用 live sandbox（ROME PUBLIC ADVISORY）里已经存在的单据做一个固定的重放 battery，只量三个数：
1. **弃权精度** —— Clara 拒绝的时候，她拒绝得对吗？
2. **按单据类别的 coding 准确率**
3. **must-ask 召回率** —— 该问人的，她问了吗？

**成本：中。** 主要是语料标注的人力，不是工程。

**影响：这一条的影响和另外两条性质不同 —— 它不改变产品，它改变你的处境。** 它把「会不会一直出错」从一个**恐惧**变成一个**数字**。而且没有它，你永远无法安全地决定「要不要把自主性再放开一格」—— 因为你不知道现在这一格的表现如何。它还顺带解锁了 backlog 里已登记的「每月 harness 简化消融实验」，那条明写着**需要一个可重放的基准才能开始**（`PROGRESS.md:136`）。

---

## 附一：审计过程中已当场补验的两条

这三条我原本列为「未验证」，写报告时觉得不该留着，就回去查了：

- ✅ **四个 `wake_*` wrapper 的权限边界** —— 已实地核对 `0078:185-269`，**结论比文件头声称的更强**。详见 §3.5。
- ✅ **`[proactive]` 唤醒是否仍只有 `record_notification`** —— 已核对 `0002_foundation.sql:553-558`，allowlist seed 里 `proactive` **只有一行**。结构性成立。
- ✅ **五条 daily belt 是否真的挂在调度上** —— 已核对 `reconciler.mjs:509-516`，五条都在；SST 那条的失败隔离也抽查过（`reconciler-sst.mjs:54-84`）。详见 §2 末。
- ✅ **claim gate 的断言逻辑** —— 已通读 `clara.assess_report_claim`（`0070:279-423`）。纯机械谓词，四态，无 fallback。详见 §3.4。

## 附二：本次审计我确实没能验证的东西

诚实起见，逐条列出。**不要把这几条当成「大概没问题」来读** —— 它们就只是「我没看」。

1. **另外四条 belt 的内部失败隔离**（autopost-rule / wiki-lint / FA / adjustment）。组装处不兜底，所以隔离全靠 belt 自己；我只抽查了 SST 那一条。**若其中一条有未捕获的抛出路径，排在它后面的 belt 会被静默饿死** —— 而这个产品今天的「主动性」全部来自这五条。**这是我建议 Wave F 开局补掉的第一件事，半小时的事。**
2. **`leader.mjs` 的选主循环** —— 我确认了 belt 挂在 `deps.*` flag 上，但没读是谁、按什么节奏把这些 flag 置真。
3. **live 数据库的当前实际状态。** 关于「零行 `fiscal_years`」「渲染器空跑」「两个资产登记册为零」这些，我读的是 `PROGRESS.md` 的记载，**没有连线查库**。§5 风险一整节都建在这些记载上。
4. **`0084` 的「DIRECTING human」maker/checker 规则的具体实现。** 我依据的是 `PROGRESS.md:79` 和 ADR-0070 的记载，没打开 `0084`。
5. **evaluator 冻结族（`0058-0061`）的冻结机制细节** —— `verify_evaluator_freeze` 的具体断言我没读；`PROGRESS.md:20-21` 记载它在上线时报 ok (2/2)。
