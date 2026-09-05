# Report disposition record — R3-handover-H

The per-item disposition of the beta handover's own walk rows (H-01 … H-56), as measured **2026-09-06 on `main` at `fc39c361`** by a
read-only opus-5 lane under 裁-190. The owner's decisions are recorded in `PROGRESS.md`; this is a
CLOSED record, filed verbatim so the measurement can be re-read against the tree it was taken on.
Every citation in it resolves on that commit. Nothing here is edited after filing.

<!-- begin verbatim: R3-handover-H.md · md5 d0fb7244d7eca2c8f3927e0d4f5fc1a0 -->
# REPORT 3 — the beta handover's own walk rows, H-01 … H-56: per-item disposition

**HEAD:** `fc39c361` (`docs(rulings): 裁-200 …`, #562) · **written:** `Sun Sep  6 01:44:36 MPST 2026`
**Serving baseline used for every FIXED verdict:** runtime **v75** (`registry.fly.io/clara-runtime:v75-gate-0351f022`)
· web Worker **`90c1a5d0-f808-4b88-bd28-d2395d9bc26a`** at 100 % · DB frontier **171 / `0176`**, all
deployed 2026-09-05 from merged `main` at `0351f022`. Every code PR #543…#559 and #561 is inside that
commit. **#560 landed 2026-09-04 and is e2e-only** (a Playwright selector fix; its title's `H-25`
reference is a mislabel — it changes no product code). #562/#563 are docs.
As-runs: [`runtime-deploy-2026-09-05-v75-and-db-0165-0176.md`](../../../../../../../Users/zhant/Desktop/clara-rebuild/docs/ops/runtime-deploy-2026-09-05-v75-and-db-0165-0176.md)
and its `-part2-worker-and-deviations.md`.

**Method.** Every FIXED / PARTIAL verdict cites a line I opened on `main` at `fc39c361`. Where I
looked and found nothing I say "not found at <where>", never "does not exist".

---

| id | tier | 标题 (zh) | Disposition | Evidence (PR + file:line / migration / as-run / ruling) | What remains / restated form | Queue | PROGRESS says (agree / disagree) | 推荐 |
|---|---|---|---|---|---|---|---|---|
| **H-01** | P0 | 服务镜像与库结构不一致 | **FIXED** (ceremony) | as-run §5.2 + PROGRESS posture: v75 released by image `img_wd57v5d3lej9p38o`; `/api/build-info` returns `git_sha 0351f022` / frontier `{171,0176}`. `packages/runtime/lib/reconciler.mjs` on `main` no longer calls the dropped function | — | closed | **agree** (struck through in Backlog) | 无 |
| **H-02** | P0 | 月结单没有印期间起讫，Maybank 被拒 | **FIXED** | #545 · `packages/runtime/workflows/statementFacts.v3.header.mjs:62-96` (basis `printed` / `printed_incomplete` / derived-from-statement-date / `unreadable`) · registry repoint `packages/runtime/workflows/registry.ts:106` | Field re-run on a real Maybank PDF not yet done post-v75 | closed | **disagree** — Backlog P0 bullet still lists it unstruck | 走一次真单据验收 |
| **H-03** | P0 | 见证人印的是行名，门要的是代码 | **FIXED** | #545 · `statementFacts.v3.header.mjs:195-235` (name→roster code, `roster_name`/`roster_code`/`ambiguous_name`/`unknown_name`, fail-closed) · DB half `packages/db/migrations/0175_stmt_witness_totals_and_institution_code.sql` | 同上：现场未复跑 | closed | **disagree** — 同 H-02 | 与 H-02 一起验 |
| **H-05** | P0 | persist 失败把 task 卡在 running | **FIXED** | #545 · `statementFacts.v3.behavior.mjs:305-315` `withStatementTerminalSettle` → `clara.fail_statement_facts`; `:131` reads the admitted code set off `0038:2063-2071` | 一条 09-04 的孤儿 task 仍 `running`（PROGRESS「ORPHANED ROWS (ii)」），需手工结清 | closed；孤儿未清 | **disagree** — 仍列为未修；PROGRESS 另处正确记了孤儿 | 手工结清那条孤儿 |
| **H-06** | P0 | 人工录月结单表单从未能成功 | **FIXED** | #549 · `apps/web/components/bank/statements-section.tsx:176-177` 送 `institution_code: selectedAccount.bank_code` + `account_number` · 类型 `apps/web/lib/bank/doors.ts:87,94` | — | closed | **disagree** — 仍列为未修 | 无 |
| **H-17** | P0 | 无人值守记账每张销货单自拒 | **FIXED**（有残留） | #556 · `registry.ts:139` `autoDraft: autoDraft_v10` + `autoDraft.v10.uniques.ts` 精确约束名映射 · `packages/db/migrations/0176_counterparty_alias_kind_scope.sql` Part A 把 alias unique 改为 kind-scoped | #556 自陈第 7 点：走查看到的 `error_code internal` / `tokens: 0` **不由本修复解释**，未查明 | closed；残留未排队 | **disagree** — 仍列为未修 | 复跑一张销货单，若仍 `tokens:0` 另开一条 |
| **H-18** | P0 | 产品里无法为客户开启 AI 处理 | **OBSOLETE**（裁-186 重塑） | 裁-186 + ADR-0078（`mohe-grill-rulings-2026-09-04-pm.md:33,61`）：同意书改为 DPA 阶段**公司层面**一次声明，commit 时自动为每个客户开通。`0174` 只加了**读**（`:40` `client_egress_*` 读面），写面未建；`grep grant_client_egress apps/web` → 无命中 | 缺陷仍在（公司仍开不了），**处方作废**：不再建 per-client grant+activate 面，改建 DPA 声明面 | **Q-02** | **disagree（措辞）** — Known issues 仍按旧处方描述「两道暗门」 | 与 Q-01 合并（同一道 commit 门） |
| **H-35** | P0 | 未确认申请人找不到输码入口 | **FIXED** | #544 · `apps/web/components/entry/signup-account-form.tsx:324` `href="/auth/confirm"`（`:305` 注明是 `<Link>` 非 Button） | — | closed | **disagree** — 仍列为未修 | 无 |
| **H-36** | P0 | 生效中的 DPA 是 v1 占位稿 | **OWNER-ACT** | `docs/ops/legal/clara-beta-dpa.md:39-40` 仍写「v1 body that is seeded today (a conspicuous placeholder)」+「the **proposed** v2 body」；无新 `dpa_documents` 版本 | 律师过稿 → 发 v2 为新版本，戳 v1 的 `effective_to`；裁-90 字节同一律绑新 sha | 未排队（owner） | **agree** | **开放外部申请前唯一硬卡口，优先** |
| **H-37** | P0 | Stripe 结账页印着内部裁决编号 | **OWNER-ACT** | 该文案**只存在于 Stripe 后台**：全仓仅两处副本，`docs/plan/active/beta-handover-2026-09-04.md:180` 与 `docs/plan/completed/fs11-wave-g-asrun-2026-09-03-part4.md:351`。**#544 没有改它**（#544 只动 `apps/web` 入口页与 `stripe-session.ts`） | 后台改产品说明 | 未排队（owner） | **agree** | 五分钟，顺手做 |
| **H-42** | P0 | 两个角色密码曾回显在记录里 | **OWNER-ACT** | 裁-178「不用rotate le, I DONT CARE」= 已受风险；`docs/plan/active/beta-handover-2026-09-04.md:181` | 若改主意：轮换两个 login 角色 + 两条 Fly DSN env-to-env 重导 | 未排队（owner） | **agree** | 维持裁-178 |
| **H-43** | P0 | 六条 lane DSN 的 TLS 不验证证书 | **PARTIAL** | 已落：#558 · `packages/runtime/Dockerfile:86` `COPY ops/tls/pooler-ca.crt /app/ops/tls/pooler-ca.crt`（镜像里已有 CA，v75 已带） · 仪式稿 `docs/ops/runtime-tls-verify-full-ceremony.md` | **未落**：`verify-full` 翻转本身。as-run `:380` 明写「§5.4 (H-43) was NOT part of this ceremony」。PROGRESS 说本次仪式翻**五**条 secret，另三条随各自仪式 | 未排队（仪式，非 build） | **agree** | 下一次 runtime 仪式顺带翻 |
| **H-47** | P0 | 线上重跑迁移把角色全变 NOLOGIN | **OPEN-VALID** | `packages/db/migrations/0154_binding_proposal_pr_1.sql:14` 仍是绝对「roles 14」普查；`docs/ops/wave-g-setup-checklist.md` 与 `docs/ops/DR.md` 中**未找到** MIGRATE 之后重开 LOGIN 的步骤（只在 `:100` 有单个 `clara_auth_wall_login` 的带外说明） | 三件：checklist/DR 各加一步、改名配方、`0154` 普查改成从 `roles-bootstrap.sql` 推导的 roster MAP | **Q-08** | **agree** | 与下次 DR 演练同批 |
| **H-48** | P0 | 凭证错的 lane 到首次使用才暴露 | **FIXED** (code #558 + ceremony) | `packages/runtime/lib/lane-probe.mjs:127-132`「the full seven-lane roster」 · `packages/runtime/lib/health.mjs:361,372` `checks.pools` · as-run `:364`「`checks.pools` PRESENT — the NEW shape. SEVEN lanes」 | 只有 `bank` 是 `dsn_not_configured`（设计如此） | closed | **agree**（已划掉），但同页「opens for real at the v75 deploy」的将来时已过期 | 无 |
| **H-04** | P1 | 分类器认不出银行月结单 | **DRIFT** | #558 改了提示词（`packages/runtime/lib/classify-llm.mjs:72` 的 bank-statement CRITICAL 行、`:116` few-shots），**但那不是病根**。as-run §5.1a：四份文件的 classify 分别早于 OCR 落库 1.36 / 3.14 / 5.72 / 5.81 秒，每份只有一条 `ocr` extraction（`version_n` 1），`readExtractionText` 要 `status='done'` → 分类器拿到**空字符串**。裁-199 的召回门 PASS 只证明「不更差」 | **重述**：`clara.enqueue_document_processing` 把 classify 与 extraction 并行派发，classify 不等 extraction `done`。修法＝派发器把 classify 门在 extraction 完成上（或 extraction 完成后重跑 classify），并加一条「先种 classify 任务再种 extraction，断言它 WAIT」的 cell | PROGRESS 新开 P0，**无 Q 号** | **agree**（PROGRESS 已正确重述并保留 H-04 为 OPEN） | 给它一个 Q 号，排在 Q-01 前 |
| **H-07** | P1 | 结账前聊天 lane 读不到 close run | **OPEN-VALID** | `packages/runtime/workflows/registry.ts:88` 仍 `chatTurn: chatTurn_v17`；未找到 `chatTurn.v18.*` | 把 close 关系加进 freeform 门的枚举表，收据点名；需新 `chatTurn` 版本 | **Q-04** | **agree** | 与 H-08 同一 PR |
| **H-08** | P1 | 拒绝语描述错了自己的原因 | **OPEN-VALID** | 同上，v15 freeform 主体未动 | 给 42501 collapse 自己的 oracle-safe 措辞，不要借 CLR03 | **Q-04** | **agree** | 同上 |
| **H-09** | P1 | 付款人识别码这一关无处可填 | **PARTIAL** | 已落：`0174_web_reads_and_small_doors.sql:688-700, :857` 新增「record or clear the registration number and TIN on an EXISTING counterparty」的门（五参、admin 起） | **未落**：`grep` `apps/web` 找 counterparty-identifier 门的调用点 → 无命中；`grep payer_identifier apps/web` → 无命中，收据卡上也没有解释拒绝原因的文案。#549 自陈「H-09 — a new DB door and migration. A database lane's work, not a web one」 | **未排队**（web；文案半边可并入 Q-05） | **disagree（不完整）** — 只写「no UI to satisfy it」，未提门已建 | 一条小 web lane，两半一起做 |
| **H-11** | P1 | 放弃结账后没有「开始结账」按钮 | **FIXED** | #549 · `apps/web/components/close/CloseDoors.tsx:91` `canBeginClose`（镜像 `_begin_close_core` 自己的前置条件）· `:103` `isRestartOfAbandonedClose` · `:185-195` 渲染 | — | closed | **disagree** — 仍列为未修 | 无 |
| **H-12** | P1 | 归档月结单后 uncoded 门必假失败 | **FIXED** | `0165_document_kind_codeability.sql:233` `('bank_statement', false, …)` + `:329-330` tail guard；`0166_close_gate_codeable_population.sql` 让两道文件门读 `clara._is_codeable_kind` | 门的**标题**（`0056:403`「No FY-dated filings without an entry」）append-only 改不了，#551 说欠一条 web 注解 | closed；web 注解未排队 | **disagree** — 仍列为未修 | 注解并入 Q-05 |
| **H-15** | P1 | 一张法定报表都渲染不出来 | **OPEN-VALID** | `packages/db/seeds/` 只有 `0001_smoke_seed.sql`、`0002_core_seed.sql`，**未找到**任何 report template 播种；#549 自陈「needs a seed or a publisher, not a frontend change」 | 播一个管理帐目模板版本（数据仪式，非迁移），再走一次里程碑 10 | **Q-06** | **agree** | 无 |
| **H-16** | P1 | 报表页叫用户去要一个不存在的功能 | **FIXED**（改文案那半） | #549 · `apps/web/components/reports/SandboxExportsPanel.tsx:56-73`：文案两次重切，明写 v17 只有三个报表工具、无 export 动词 | 给聊天真加 export 工具**未排队** —— 裁-197 的三张票（`-pm.md:260-270`）里**没有** export | closed（按「诚实文案」那条路） | **disagree** — 仍与 H-15 并列为未修 | 无（除非老板要 export） |
| **H-21** | P1 | 面谈答案从不落库 | **OPEN-VALID** | `grep client_identifiers\|fy_end_month packages/db/migrations/017*.sql` → 无命中；`commit_client_onboarding` 未被 0165–0176 任何一支改写 | SSM/TIN→`client_identifiers`、FYE→`clients.fy_end_month/day`、MSIC/主体类型→`client_facts`、银行答案→提案。**`trade_nature` 不在本条内：面谈根本不问** | **Q-01** | **agree**（明列为下一件） | 与 Q-02 合并一个 D1 窗口 |
| **H-19** | P1 | 销货 lane 开关只能用 SQL 翻 | **PARTIAL** | 已落：`0176:65-89` —— owner-floored 新包装，firm 从 `_human_ctx` 来，不再裸给 `clara_fn_owner` | **未落**：面。#556 自陈「No frontend. The H-19 wrapper names its home (firm Settings, owner-only) and stays a door until a web lane builds the control」；也未建「显示 firm 的 sales-lane watermark」那块 | **未排队**（web） | **agree**（「无面」仍准），但未提门已改造 | 并入某条 firm-settings web lane |
| **H-20** | P1 | `add_client_identifier` 没有面 | **OPEN-VALID** | `apps/web` 内唯一提及仍是 `apps/web/lib/firm/needs-you-gaps.ts:216,272` 的缺口提示，无调用点 | 客户身份面板上一个 bookkeeper-floor 控件 | 未排队 | **agree** | H-21 落地后再做（那时它退化成修复门） |
| **H-26** | P1 | 清单把结构化答案渲染成 `[object Object]` | **FIXED** | #546 · `apps/web/components/clara/OnboardingItemRow.tsx:136`（注明「was `String(item.answer)`」）+ `apps/web/lib/onboarding/answer-format.ts` | — | closed | **disagree** — 仍列为未修 | 无 |
| **H-27** | P1 | 面谈把原始 capture JSON 回吐给用户 | **FIXED** | #546 · `apps/web/lib/interview/thread.ts:25`（注明「used to `JSON.stringify`」）· `apps/web/components/clara/InterviewRunCard.tsx:71` · cell `apps/web/lib/interview/thread.test.ts:25` | — | closed | **disagree** — 同上 | 无 |
| **H-30** | P1 | 套用科目表对话框高过视窗且不滚动 | **FIXED** | #546 · `apps/web/components/ui/dialog.tsx:93` `max-h-[calc(100dvh-2rem)] … overflow-y-auto overscroll-contain`；`:78-91` 记录了「两边都够不着」的成因 | — | closed | **disagree** — 仍列为未修 | 无 |
| **H-38** | P1 | 结账 session 不带申请人邮箱 | **FIXED** | #544 · `apps/web/lib/checkout/stripe-session.ts:352` `form.set("customer_email", …)`，`:348` 说明只在有值时设（空值 Stripe 会 400）· cells `stripe-session.test.ts:512-538` | — | closed | **disagree** — 仍列为未修 | 无 |
| **H-39** | P1 | 两个 Stripe webhook 指同一个 URL | **OWNER-ACT** | 仅存在于 Stripe 后台；仓内无副本 | 删掉 #2（thin payload、无 API 版本、24 events） | 未排队（owner） | **agree** | 五分钟 |
| **H-40** | P1 | 两项 Supabase 认证设置与检查表不符 | **OWNER-ACT** | `docs/ops/wave-g-setup-checklist.md:178` 仍写 `jwt_exp=900` 与 HIBP 期望，**未找到**任何记录说这两项已裁 | 两个老板决定 → 后台改 → 回读 | 未排队（owner） | **agree** | 五分钟 |
| **H-45** | P1 | Resend 方案的发信上限从未读过 | **OWNER-ACT** | `docs/ops/wave-g-setup-checklist.md:75` 仍只写「the **Resend plan's**, never Supabase's 2/hour」——**没有数字** | 去 Resend 后台读方案名与 cap，两个数字都写进 checklist | 未排队（owner） | **agree** | 五分钟 |
| **H-46** | P1 | 邮件门（裁-146 pt 3）未正式认证 | **OWNER-ACT** | 无代码面；实质已证（两封六位码送达，其中一封到非团队 Gmail），欠的是到达时间与 From 头的记录 | 老板裁：S21 那封算不算数；不算就再发一次并记录 | 未排队（owner） | **agree** | 五分钟 |
| **H-49** | P1 | DR STRICT 探针 4.9 丢了主体 | **PARTIAL** | 已落：`0174_web_reads_and_small_doors.sql:892-935` 新建 `clara.dr_canary_subjects` 登记表（无 UI，按裁定） | **未落**：`packages/db/scripts/dr-verify-checks.mjs:398-399` 与 `:414-415` **仍硬编码那两个 id 前缀**；#552 自陈「No `dr-verify-checks.mjs` change. Ops/L9's, per the order. The registry only.」登记表也还没被任何仪式种过行 | **未排队**（ops/L9） | **disagree（不完整）** — 只说「探针未在现场证明」，未提登记表已建、脚本仍硬编码 | 一条小 ops lane：脚本改读登记表 |
| **H-10** | P2 | 结账中人工银行结算被 CLR19 拒（行为正确） | **OPEN-VALID** | 该条要「写进 close/bank runbook」；`docs/ops/` 下**未找到**任何 close 或 bank runbook（`ls docs/ops/` 27 个文件里无一） | 先要有一本 close/bank runbook，或并进 H-54 的同一份 | 未排队 | **agree**（列在 P2 里） | 与 H-13/H-14/H-54 合成一份 close 手册 |
| **H-13** | P2 | 期间缺口 11 个月是设计行为，文案没说 | **OPEN-VALID** | `grep statement_gaps\|no_statements apps/web/messages/en.json` → 无命中；`apps/web/lib/close/` 与 `components/close/` 也无 | 门的文案要说清「要求全年覆盖」，别让年中入场的行以为坏了 | 未排队（Q-05 是天然归宿） | **agree** | 并入 Q-05 |
| **H-14** | P2 | 银行对帐 certify 被期初差额挡住（行为正确） | **OPEN-VALID** | 该条要「把 opening-seed 仪式写成文」；`docs/ops/` 下**未找到** opening-seed 仪式文档 | 写 `create_opening_seed` → `record_opening_target(s)` → `draft_opening_item` → `approve_opening_seed` 这条诚实补救路径 | 未排队 | **agree** | 同 H-10 那份手册 |
| **H-22** | P2 | 设定文件种类后分类问题仍开着 | **FIXED** | `0169_set_document_kind_resolves_classification.sql:254-255` `update clara.open_questions set status='resolved', resolved_by=c.actor, resolved_at=now()` | #551 自陈**不回填**历史遗留的开放问题（回填等于替人作答） | closed | **disagree** — P2 整块仍按未修列 | 无 |
| **H-23** | P2 | 「未编码归档 ×4」与门读到的 0 | **PARTIAL / DRIFT** | 已落：`0165`+`0166`+`0168` 让两边共用 codeability 排除，**四个分歧去掉一个**。#551 的 H-23 注（PR body :275-289）**量测**另外三个分歧（FY 日期范围、join key、冲销谓词）**是设计使然，绝不可统一**——统一会作废已签署的 attestation | **重述**：这不是一个可以「对齐」的缺陷。剩下的唯一修法是**屏幕上用不同的词**。今天 `apps/web/messages/en.json:103` 是「Filing awaiting an entry」、`:2683` 仍是「Uncoded filings」，#551 要的那条「两个人口」注解**未找到** | 未排队（Q-05） | **disagree（前提）** — 仍写「reconcile the two」，而那已被证明不可做 | 只改词，不要统一 |
| **H-24** | P2 | Ask Clara 输入框按 Enter 不送出 | **FIXED** | #547 · `apps/web/components/clara/ClaraThreadView.tsx:432-435` `onKeyDown`，Shift+Enter 留作换行，`isComposing` 保护中文/马来输入法 | — | closed | **disagree** — P2 整块仍按未修列 | 无 |
| **H-25** | P2 | `/activity` 缺 en 文案键 | **FIXED** | #550 · `apps/web/messages/en.json:2816` `"loading": "Loading running agent tasks…"`（在 `:2813` `agentTasks` 块内） | — | closed | **disagree** — 同上 | 无 |
| **H-28** | P2 | 面谈进行中清单计数卡在 1/1 | **FIXED** | #546 · `apps/web/components/clara/InterviewRunCard.tsx:113`「THE CHECKLIST FOLLOWS THE INTERVIEW, off the poll that already exists」+ `:66` park-index 记忆 · cells `onboarding-progress-sync.test.tsx:156,184,234`（含「不得变成 busy poll」的反向 cell） | — | closed | **disagree** — 同上 | 无 |
| **H-29** | P2 | 科目表行说「尚未决定」但其实已答 | **PARTIAL**（且原因判断**错了**） | 已落 DB：`0170_coa_chart_state_reports_open_plan_state.sql`，并在自己的头部量测出**手写档是忠实的**——`apps/web/lib/onboarding/coa.ts:89` 读的字段没错，病根是 `clara.coa_chart_state` 的 `dec` CTE 在 `0156:1080-1088` 过滤 `p2.state='committed'` | **未落**：裁-193 说本条「closes as 卡片说 decided-applies-after-commit」。那句话**不在卡片上**——`apps/web/components/clara/ApplyStandardChartControl.tsx:185-192` 明写这句话不归本 lane、留给 DB-A 的形状；`OnboardingSettledCard.tsx:150` 写「**should then** say」。web 半边欠一句话 | 未排队（Q-05） | **disagree** — P2 整块按未修列；且交接稿的病因判断已被 `0170` 推翻 | 一句文案，Q-05 顺手 |
| **H-31** | P2 | `/favicon.ico` 404 | **FIXED** | #553 · `apps/web/app/icon.png` 与 `apps/web/app/apple-icon.png` 已在（Next 档名约定） | — | closed | **disagree** — 同上 | 无 |
| **H-32** | P2 | 澄清卡把 payload 当原始 JSON 倒出来 | **FIXED** | #548 · `apps/web/components/journals/interruptions-panel.tsx:47` `str(question.question) ?? str(question.text)`——先读实际写入者用的键 | — | closed | **disagree** — 同上 | 无 |
| **H-33** | P2 | 澄清答题表单重复渲染两份 | **PARTIAL / DRIFT** | #548 · `interruptions-panel.tsx:146-156`：**刻意不合并**——两处是同一道门的两个高度（工作台页 + rail），改的是可及名（这份说清自己在哪，rail 保留短名） | **重述**：「Render it once」这条处方已被否决。剩下的是**同一类缺陷再来一次**：两边的送出按钮都仍叫「Answer」（`:157-164` 自陈，改它会 red 另一 lane 档案范围内的 `components/parts/clarify-card.test.tsx`） | 未排队（一行跟进） | **disagree（前提）** — P2 按未修列，且「渲染一次」不是要采的路 | 谁同时拥有两个档案就顺手改按钮名 |
| **H-34** | P2 | 对手方卫生说「没有对手方」但有客户 | **FIXED** | #549 · `apps/web/components/registers/counterparty-hygiene-panel.tsx:43`「H-34 — BOTH kinds, always」 | — | closed | **disagree** — 同上 | 无 |
| **H-50** | P2 | commit 后工作区页首仍写 Onboarding | **FIXED** | #546 · `apps/web/components/clara/OnboardingChecklistCard.tsx:415` 发 `CLIENT_RECORD_CHANGED` · cell `onboarding-checklist.test.tsx:453`（成功才发、被拒不发） | — | closed | **disagree** — 同上 | 无 |
| **H-51** | P2 | `/clients` 没有「新增客户」入口 | **FIXED** | #546 · `apps/web/components/firm/client-register-list.tsx:91` `AddClientControl`、`:207` 挂载 · cells `add-client-control.test.tsx:113,125,138`（admin 有、bookkeeper 无、门槛取自门本身） | — | closed | **disagree** — 同上 | 无 |
| **H-52** | P2 | 已答「未注册 SST」还继续问 SST 号 | **OPEN-VALID** | `packages/runtime/workflows/interview.v2.questions.ts:84` 的 `sst_no` 段**仍无 `appliesTo`**，所以永远问；`skippable: true` 且无确认回声 | 给它 `appliesTo`，并让 skip 也有别处都有的确认回声 | 未排队（原文说「rides 裁-181 的正规化工作」） | **agree** | 与 Q-01 的面谈改动同批 |
| **H-53** | P2 | 同意书证据落进编码 lane | **FIXED** | `0168_coding_lane_kind_exclusion.sql`（两个人口读取器都加 `clara._is_codeable_kind` 排除）+ `0165:233` `consent_evidence` 标 `codeable=false`；#551 刻意不动 `_coding_lane_core` 分类器本身 | — | closed | **disagree** — 同上 | 无 |
| **H-44** | P2 | `held_outbox` 6 —— 已读懂，非缺陷 | **OPEN-VALID**（本就无事可做） | 原文即写「Nothing now」；是 C-05 内的一项检查，不是 lane。裁-165 让 G1 cadence sources 在 beta 关闭 | C-05 打开 sources 时，核实这六行确属 disabled-source 类且会排空 | 随 **C-05** | **agree** | 无 |
| **H-54** | P2 | 开始结账即冻结整个期间，产品从没说 | **PARTIAL** | 已落 web：#549 · `apps/web/messages/en.json:1381`「It also FREEZES the year: … no approved entry may be posted, changed or reversed … refuses each attempt with `write_into_closed_period`」+ `:1385` restart 版本 | **未落**：runbook 那半——`docs/ops/` 下**未找到** close runbook | 未排队 | **disagree** — P2 按未修列 | 与 H-10/H-13/H-14 合成一份 close 手册 |
| **H-55** | P2 | 零月结单时 bank 门空洞地 PASS | **FIXED** | `0167_close_gate_bank_enrolment.sql:271-279`：`no_statements` 非空 → `state='unknown'`、`not_measurable=true`；`0172_bank_gate_outstanding_items.sql` 让 drawer-2 的 outstanding items 也认这个键 | #551 点名一条 web 义务：`<bank_account_id>:no_statements` 的文案要写成「量不到」而非「缺了一个月」——**未落** | closed；文案未排队 | **disagree** — P2 按未修列 | 文案并入 Q-05 |
| **H-56** | P2 | 两道门 UNKNOWN，Finalize 照样给按 | **FIXED**（走「点名」那条路） | #549 · `apps/web/components/close/CloseDoors.tsx:128-149` `finalizePreflight` 按**标题**逐条点名 `drawer1Unknown` / `drawer2Unattested` / `notYetMeasured`；`:118-124` 注明 Finalize **绝不**被它禁用（裁-187：门是读数，finalize 是一次点击的 admin+ 行为）· `GateCheckRow.tsx:60` 原始 token 不再直接印出 | 原条要求「先在 rig 上测 finalize 遇 UNKNOWN 会怎样」——**未找到** rig 测试；换成了对 `finalize_close` 两条拒绝臂（`0128:199-232`）的代码阅读 | closed | **disagree** — P2 按未修列 | 若要补，rig 上跑一次即可 |
| **H-41** | P2 | 两个 `clarabook-frontend` 重切 PR | **OWNER-ACT** | 裁-168；在设计权威仓，出了所有 lane 的写入边界 | 老板自己合；未合前设计法与出货 app 持续漂移 | 未排队（owner） | **agree**（已列在「老板自己的事」） | 无 |

---

## (a) Counts

| disposition | P0 | P1 | P2 | 合计 |
|---|---|---|---|---|
| FIXED | 8 | 7 | 12 | **27** |
| PARTIAL | 1 | 3 | 4 | **8** |
| OPEN-VALID | 1 | 5 | 5 | **11** |
| OWNER-ACT | 3 | 4 | 1 | **8** |
| DRIFT | 0 | 1 | 0 | **1** |
| OBSOLETE | 1 | 0 | 0 | **1** |
| STALE | 0 | 0 | 0 | **0** |
| WRONG | 0 | 0 | 0 | **0** |
| **tier total** | **14** | **20** | **22** | **56** |

FIXED 中 **26** 条由代码 PR 关闭并随 v75 / Worker `90c1a5d0` / DB 171 出货；**H-01** 由部署仪式本身关闭。
没有一条落在 STALE 或 WRONG：交接稿的每一条当时都成立。两条**前提**判断错了（H-04、H-29），
两条**处方**被后续裁定或量测推翻（H-18、H-33、H-23），它们分别记为 DRIFT / OBSOLETE / PARTIAL。

## (b) Where PROGRESS.md or the handover is now WRONG or stale — the docs-sync list

1. **`PROGRESS.md:231`（Known issues 开头）** —「**NOTHING THE SESSION BUILT IS SERVING.** Fifteen PRs
   are on `main` and the deploy ceremonies have not run.」**已被同一档案顶部的 posture block 推翻。**
   正确说法：#543…#559 与 #561 全部在 `0351f022` 内，2026-09-05 已随 runtime v75、Worker
   `90c1a5d0`、DB frontier 171/`0176` 出货；只有 #560 在其后，且仅动 e2e。整段「measured on `main` at
   `5007bbcc`」的时点标注也随之过期。
2. **`PROGRESS.md` Backlog 的 P0 行** —— 只划掉了 H-01 与 H-48，却仍把 **H-02 · H-03 · H-05 · H-06 ·
   H-17 · H-35** 列为未修，而同档 "Next" 第 1 点已说它们「CODED AND NOW SERVING」。**同一份档案自相矛盾。**
   这六条应一并划掉（C-07 同理，由 #555 关闭 —— 属兄弟 lane 的范围，此处只作提示）。
3. **`PROGRESS.md` Backlog 的 P1 行** —— **H-11 · H-12 · H-16 · H-26 · H-27 · H-30 · H-38** 已修并出货，
   不应再列；**H-09 · H-19 · H-49** 应从「未修」改写为「门已建，面/脚本未建」。
4. **`PROGRESS.md` Backlog 的 P2 行** —— 「**22** web/product nits」里已有 **12 条修好并出货**
   （H-22 · H-24 · H-25 · H-28 · H-31 · H-32 · H-34 · H-50 · H-51 · H-53 · H-55 · H-56）。
   数字应改为 10 未闭（其中 4 条是 PARTIAL）。
5. **`PROGRESS.md` Known issues 的四条旧摘要**，各自需重写：
   「Bank statements cannot be ingested by either AI path (H-02 · H-03 · H-04 · H-05) … 人工表单从未可达
   (H-06)」→ 只有 **H-04** 仍成立，且病因已换；「The unattended coder refuses every sales invoice (H-17)」→
   已修，只剩 `tokens:0` 未解释；「The serving image and the schema disagree (H-01)」→ 该条目仍整段留在
   Known issues 里，与 Backlog 的删除线及顶部 posture 冲突；「A firm cannot enable AI processing … the grant
   and the per-purpose activation are dark doors (H-18)」→ 事实仍真，但处方已被裁-186 换掉。
6. **`PROGRESS.md` Backlog 首条**「**H-48 is closed by code and opens for real at the v75 deploy.**」——
   将来时已过期，v75 已部署，应改为过去式。
7. **交接稿 `beta-handover-2026-09-04.md:33`** —— Worker「carrying six secrets and **three** vars」：
   仪式实读为 **四** 个（`CLARA_PUBLIC_ORIGINS`、`CLARA_RUNTIME_URL`、`CLARA_STRIPE_LIVEMODE`、
   `CLARA_TRUSTED_CLIENT_IP_HEADER`；六个 secret 无误）。同段的 version **I** `c5b1e051…` 亦已被
   `90c1a5d0…` 取代。
8. **交接稿 H-04（`:193`）的病因陈述是错的** —— 不是提示词，是 classify/OCR 时序竞态（as-run §5.1a）。
   该行应重述，否则下一个 lane 会再修一次提示词。
9. **交接稿 H-29（part 2 `:39`）的病因陈述是错的** ——「the helper reads the wrong field」；`0170` 的
   头部量测出手写档忠实，病根在 `coa_chart_state` 的 `dec` CTE（`0156:1080-1088`）。
10. **交接稿 H-38（`:207`）的 owner 栏写「a runtime lane」** —— Checkout Session 的 create 在
    `apps/web/lib/checkout/stripe-session.ts`，是 **web** lane。（此点与 lead 的 condensed register `:106`
    一致，此处独立复核确认。）
11. **交接稿 H-23（part 2 `:35`）的处方「Reconcile the two」不可执行** —— #551 量测出剩余三个分歧是
    设计使然，统一会作废已签署的 attestation。应改为「屏幕上用不同的词」。
12. **交接稿 H-33（part 2 `:43`）的处方「Render it once」已被否决** —— 两处是同一道门的两个合法高度。
    应改为「两处送出按钮的可及名仍撞车」。
13. **交接稿 H-10 / H-14 / H-54 都指向一本不存在的 runbook** —— `docs/ops/` 27 个档案里**未找到**任何
    close 或 bank runbook。三条应合并为「写一份 close/bank 手册」。

## (c) Unsure — and why

- **H-17 的残留。** #556 自陈走查看到的 `error_code internal` / `tokens: 0`（模型根本没被调用）**不由本修复
  解释**。v10 修好了错误映射，但那个形状是否也随之消失，**没有现场复跑**可证。我按 FIXED 记并点名残留；
  若复跑仍见 `tokens:0`，那是另一条新缺陷。
- **H-02 / H-03 / H-05 / H-06 未在现场复跑。** 代码正确且已出货，但没有一份真实马来西亚月结单在 v75 上
  走通过。这四条我按 FIXED 记的是**代码与出货**，不是**现场证明**。
- **H-23 的 `en.json:103`「Filing awaiting an entry」** —— 我没有 diff 它是否本次会话所改。若是旧文案，
  那么 H-23 的 web 半边完全未动。
- **H-56 的「先在 rig 上测」。** 原条明确要求先测再改；实际走的是读 `finalize_close` 两条拒绝臂。
  裁-187（门是读数、finalize 不被禁用）是否已把那个前置要求吃掉，是判断题，不是量测题。
- **H-44 的标签。** 一条自己就写着「Nothing now」的行记成 OPEN-VALID 有点勉强；它更像「随 C-05 携带的
  一项检查」。我按 OPEN-VALID 记以免它从名册上消失。
- **H-04 的排队位置。** PROGRESS 把它开成新 P0，但**没给 Q 号**，所以它不在 Q-01…Q-12 的顺序里。

## (d) 三个最重要的老板决定（大白话）

**1. 银行月结单还是读不出来，而且病根跟我们以为的不一样 —— 这条要插到哪里？**
之前以为是 AI 提示词写得不好，#558 改了提示词。仪式那晚量测出真正原因：**分类那一步跑在 OCR 之前**，
四份文件都是分类先做完 1.4 到 5.8 秒，OCR 才落库，所以分类器拿到的是**一片空白**，答「其他」是对的。
这是新的 P0，但排队表里**没给它编号**。银行月结单是马来西亚中小企最常见的文件，这条不修，AI 那条进料路
就是断的。**要不要把它排到 Q-01（面谈答案入库）前面？**

**2. DPA 还是那份 99 字节的占位稿 —— 律师什么时候过？**
这是「放外部第一个申请人进来」之前**唯一一件 lane 做不了、只有你能推动**的事。BELCORT 自己签占位稿没
问题，外面的行签一份占位稿就不行。裁-90 的字节同一律已经准备好绑新版本的 sha，技术上零改动，卡的是律师。
**要不要现在就把稿子递出去？**

**3. 五分钟能清掉的四件小事，堆了两天了。**
Stripe 结账页上还印着我们内部的裁决编号（H-37，客户看得到）；Stripe 后台有两个 webhook 指同一个地址，
其中一个多余（H-39）；Supabase 两项设置 `jwt_exp` 该 3600 还是 900、HIBP 开不开（H-40，要你拍板）；
Resend 方案的发信上限从来没人去后台读过（H-45）。再加一件要你裁的：邮件门那封发到私人 Gmail 的验证码，
**算不算完成裁-146 第 3 点的认证**（H-46）。**这五件要不要今天一次清完？**
<!-- end verbatim: R3-handover-H.md -->
