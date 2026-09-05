# Report disposition — the owner-facing decision sheet (裁-202)

The owner-facing decision sheet, in Chinese, as put to the owner and RULED under **裁-202**
(owner, 2026-09-06 ≈02:20 MYT, 「全部按推荐，D-8 选甲，D-10 先延后」 — all twenty decisions per
recommendation, D-8 taking option 甲, D-10 deferred). The four EVIDENCE records behind it are the
r1…r4 siblings in this directory. Filed verbatim; a CLOSED record, not edited after filing.

<!-- begin verbatim: Clara 三份报告处置清单 2026-09-06.md · md5 aaf29868a2a95e495255cfed5f784074 -->
# Clara 三份报告处置清单 — 2026-09-06（定稿：裁-202，02:20 MYT）

**你的裁决（2026-09-06 ≈02:20 MYT，原话「全部按推荐，D-8 选甲，D-10 先延后」）：** D-1…D-20 全部按 §1 的推荐执行；**D-8 = 甲**（财年结束倒数条，无后端，随 Q-02b）；**D-10 = 延后**（聊天导出文件不排 lane，诚实文案维持）；D-19「card component」未点名，按推荐关闭，你点名时再开。
**裁定后的队列顺序：Q-00（分类/OCR 抢跑）→ Q-03（拆墙 + 门槛字段）→ Q-01+Q-02（合一条 lane、一个窗口）→ Q-02b（小面 lane，含财年倒数条）→ Q-04 → Q-05 → Q-06 → Q-07 → Q-08 → Q-09 → Q-10 → Q-11 → Q-12。** 今天你做：D-7 五件小事、DPA 稿递律师、本周 Terms sitting。记录：`docs/plan/active/mohe-grill-rulings-2026-09-04-pm.md` 裁-202；PROGRESS 已同步；本文件归档为 `docs/plan/completed/report-disposition-2026-09-06-decisions.md`。

对照基线：仓库 `main` = `fc39c361`；线上 = runtime **v75** + web Worker **90c1a5d0** + DB frontier **171 / 0176**（2026-09-05 仪式全部上线）。
每一条「已修」都是 lane 打开 `main` 上的代码读到的，不是看 PR 标题猜的；逐条的 file:line 证据在桌面文件夹
`Clara 报告处置 2026-09-06 附录` 的四份附录里。

## 0 · 总览

| 报告 | 条数 | 已修上线 | 修了一半 | 未动 | 前提错/不成立 | 被裁决改写或作废 | 只有你能做 | 要重述 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ① 你的 UIUX Flaws（txt） | 36 | 19 | 13 | 1 | 1 | 1 | 1 | 1（#2 指哪张卡） |
| ② Issue #541 e2e 审计 | 36 | 20 | 6 | 5 | 1 | 2 | 2 | 0 |
| ③ Handover 走查行 H-01…56 | 56 | 27 | 8 | 11 | 0 | 1 | 8 | 1（H-04 病根换了） |
| ③ Handover 旧积压 C-01…88 | 88 | 3 | 9 | 59 照旧背着 | 3 | 1 | 8 | 5（drift/stale） |

大白话：**你交的三份东西里，走查发现的缺陷（①②③H 共 128 条）已经修好上线 66 条、修了一半 27 条**；剩下的分四种：等排队（约 17 条）、等你做（约 11 条）、被你自己后来的裁决改了方向（裁-186 同意书、裁-187 拆墙，4 条）、报告本身写错了（5 条）。C 行是 beta 前就有的旧账，59 条原样继续背，不用逐条看。

标签（大白话）：**已修** = 代码在 main 且在线上跑 · **半修** = 后端好了面没好，或反之 · **未动** = 一行没改 · **STALE** = 被别的事顺手解决了 · **DRIFT** = 代码变了，那条要重写才有意义 · **WRONG** = 复现不了或前提就错 · **OBSOLETE** = 后来的裁决把它作废了 · **OWNER** = 律师/Stripe 后台/Supabase/产品口味，只能你做。

## 1 · 要你拍板的（按重要性；每条附我的推荐；不同意的写编号告诉我）

**必须现在定的：**

- **D-1 关闭「已修上线」的 66 条**（三张表里标「已修」的全部）。推荐：**全部关闭**；其中 H-02/H-03/H-05/H-06（月结单四条）和 CB-004（期初审批）代码没错但**没在线上拿真单据走过**，关闭时标「待现场复验」。
- **D-2 新 P0「分类跑在 OCR 前面」排到 Q-01 前面（记作 Q-00）。** 仪式那晚实测四份文件分类都比 OCR 早 1.4–5.8 秒完成，分类器读到空白。#558 改提示词改错了地方。不修，银行月结单 AI 进料整条断。推荐：**Q-00，第一个做**（同一条 lane 顺手修 #558 那个在镜像里跑不起来的召回脚本）。
- **D-3 同意书面（Q-02，裁-186 的形状）和面谈资料入库（Q-01）合成一个 lane、一个 D1 窗口。** 两条改的是同一道 `commit_client_onboarding` 门。今天真实 beta 事务所**自己开不了 AI**（读门 `client_egress_state` 上线了，网页零调用）。推荐：**合并**。
- **D-4 裁-187 拆墙后的死角：UI 里「大额门槛」开关已删（#550），DB 里的双人复核墙还在（0037:1992），0165–0176 没有一支迁移动它。** 超过门槛的分录会被拒，而用户已无处改门槛。线上有没有事务所挂着门槛，没量到（sleeper 已销毁）。推荐：**Q-03 拆墙 lane 提前到 Q-00 之后；`high_stakes_amount_cents` 字段并进同一车，删掉或降级为提示数字，不再造门。**
- **D-5 #541 的验收清单有两条已被你的裁决作废：JOURNAL-01「换一个人批」撞 裁-187，CONSENT-01「每客户单独签」撞 裁-186。** 推荐：**按新规则重写这两条**（两次 ruling 都是逆建议选的，dissent 已存档；律师那关可能把 裁-186 翻回来，所以同意书的 evidence kind 要记清楚以便升级）。
- **D-6 两个 P0 只等你：Terms 服务条款（CB-001/Q-09）和 DPA 定稿（CB-002/H-36）。** 推荐：**本周开 Terms sitting**（要答两题：checkout 是否两份都必须签；27 个律师待填项能不能先种）；**DPA 稿现在递律师**；工程侧先建「检测到 placeholder 就 fail deploy」那格闸门（0.2 单位，不等律师）。
- **D-7 五分钟小事 ×5，今天一次清：** Stripe 结账页删内部裁决编号（H-37）、删多余 webhook（H-39）、Supabase `jwt_exp` 3600 还是 900 + HIBP 开不开（H-40）、去 Resend 后台读发信上限写进 checklist（H-45）、裁 S21 那封发到私人 Gmail 的验证码算不算认证（H-46）。

**可以慢一点定的：**

- **D-8 GI clock 到底指什么（你的 #9）。** 仓库里对不上任何东西。甲＝财年结束倒数条（一两天，无后端）；乙＝法定申报日历 SST/CP204/Form C（要种子、读门、到期引擎，`0139` 当初故意没做）；丙＝SST 门槛时钟（中等，且门槛表还没开放给前端读，F-01）。推荐：**先甲，乙排上市前**。
- **D-9 聊天生成式界面（Q-10 工具 + Q-11 九种只显示 id 的卡）现在补还是先建缺的产品面。** 推荐：**排在 Q-00…Q-03 之后**。
- **D-10 「聊天不能生成可下载文件」（你的 #26）指什么？** 若指 chat 产出的报表/导出文件：需要 v18 export 工具 + PDF render worker（两条 lane，L）；若指下载对话记录：没人做过。推荐：**先说清楚，默认延后**。
- **D-11 客户在 onboarding 时要不要强制全屏（你的 #21）。** 已建成「一键放大」opt-in，源码写明不自动跳转（跳转会让其他八个 tab 不可达）。推荐：**保持 opt-in**。
- **D-12 shadcn data-table / 动效库（你的 #4/#5/#34）。** 日记账表格用自家 `data-table-card` 没引 TanStack；动效只有 CSS token，无 framer-motion。推荐：**不加依赖，维持现状**。
- **D-13 CSP 要不要「真开」（C-07 后续）。** 现在只是报告模式，11 条违规全是 Next 内联脚本。推荐：**按哈希做，排实币开关前**。
- **D-14 PITR 到期 + 还原演练逾期（C-14/C-56）。** 推荐：**先花半天跑还原演练，再决定 PITR 花不花钱**。
- **D-15 Reports 先发一个 management 模板（Q-06/H-15/CB-017）。** Reports 是唯一完全没闭环的域，卡在 validator 和 renderer 互相打架。推荐：**是，statutory 等律师措辞**。
- **D-16 写一本 close/bank 手册。** H-10/H-13/H-14/H-54 都指向一本不存在的 runbook。推荐：**新开一条 docs 行，合四为一**。
- **D-17 新开一条「小面」web lane，把「后端好了、网页差一根线」的凑一车：** DPA 已签状态 hydrate（CB-007，0.3）、OTP resend（CB-006）、`/activity` 接上时间线（CB-018，Home 有 Activity 页写着没建）、客户 AI 状态只读面板、付款人识别码门的 UI（H-09）、销货 lane 面板（H-19/CB-012 + F-02）、两条现在说谎的文案、`ClaraThreadMenu` 的归档按钮（0174 后能建了）。推荐：**开，记作 Q-02b，排 Q-03 后**。
- **D-18 两条孤儿行（`clientOnboarding_v4` 卡住的 run；H-03 的 `statement_facts` 孤儿 task）。** 推荐：**手工结清，下次仪式顺手**。
- **D-19 「card component and 其他东西」（你的 #2）指哪张卡、哪一屏？** 五条 lane 重写了卡面，猜不了。推荐：**你点名，或关闭**。
- **D-20 一次线上复验走查（Q-00 修完后）：** 真实 Maybank/Alliance 月结单走到对账；干净客户从 UI 走到 opening finalize；销货单复跑看 `tokens:0` 还在不在（H-17 残留）。推荐：**排 Q-00 之后，一条 lane 一天**。

## 2 · 报告一：你的 UIUX Flaws（36 条；附录 1 有 file:line）

| # | 一句话 | 结论 | 证据 / 剩什么 |
|---|---|---|---|
| 1,14 | 六位码没有地方输、没路走下去 | 已修 | #544 check-email 页有 `/auth/confirm` 链接 |
| 2 | card component 和其他东西 | DRIFT | 指哪张卡？（D-19） |
| 3 | needs review 界面只有字 | 已修 | #550 what/why/next/when |
| 4 | 有没有真的用 shadcn | 半修 | 用了（base-nova，15 个原语）；日记账表格是自家的（D-12） |
| 5 | 有没有跟 shadcn/Vercel SDK/emil 动效 | 半修 | AI SDK 7、152 个 token、动效 token 有；无动效库（D-12） |
| 6 | 去 Mobbin 找范例 | 半修 | 两个 home 按 Mobbin spec 建；chat/documents/onboarding 没重跑 |
| 7 | 所有改过的界面要有 e2e | 半修 | 15 个 Playwright 走查；但没有必过的 CI 闸门（Q-07） |
| 8 | 补税务界面 | 半修 | #557 tax tab 一条真读 + 两个面板；计算面板仍 not-built；门槛表未开放（F-01） |
| 9 | GI clock | 未动 | 仓库无此物（D-8） |
| 10,27 | 聊天生成式 UI | 半修 | 26 种卡 24 种会画，9 种只显示 id；5 件事无工具（Q-10/Q-11） |
| 11 | 找出所有同类毛病 | 已修 | 登记册约 100 条含锚点 |
| 12 | 守住设计 token | 已修 | lint 里有对比度检查；`globals.css` 超 500 行要拆（F-06） |
| 13 | autodraft 不是自动的吗 | 已修 | #556 v10 + 0176；v9 自拒的根因是别名唯一键 |
| 15 | 没让我继续建事务所 | WRONG | 建事务所那步一直在，缺的只是到输码页的路（#1） |
| 16 | 确认归档后「需要你确认」没消失 | 已修 | #555 双格刷新 + 0169 归档即结问题 |
| 17 | page overlay viewer | 已修 | #555 `document-page-overlay.tsx` |
| 18 | 抽取文字要好看 | 已修 | #555 三层：事实表/分页文本/原始信封 |
| 19 | 开户访谈像真 AI、背后写对资料 | 半修 | 卡和类型化答案有了；**资料入库没建**（H-21/Q-01）；脚本固定不自适应（H-52） |
| 20,22,25 | commit/cancel 后卡还在 | 已修 | #546 settled 收据卡 |
| 21 | onboarding 时全屏/放大 | 已修（opt-in） | 一键放大；不自动跳（D-11） |
| 23 | 客户工作区首页糟糕 | 已修 | #557 七段情况板 |
| 24 | 聊天不能 new/clear/delete | 半修 | new/switch 有；clear 永不建（审计记录）；**归档能建没建**，注释还在说不能 |
| 26 | 聊天不能给下载文件 | 半修 | 只改了说谎的文案；能力不存在（D-10） |
| 28 | 「发放同意」网页没按钮 | 半修 | 你读对了，至今零调用；读门 0174 已上线（Q-02） |
| 29 | 同意书集中在 DPA 一次签 | 已成裁决 | 裁-186 / ADR-0078；建在 Q-02 |
| 30 | Activity 的 agent task 卡是空的 | 半修 | #550 详情抽屉；5 个收据 shim 有 4 个还是空桩 |
| 31 | needs you 没细节没交互 | 已修 | #550 |
| 32 | sweep run 是什么 | 已修 | 面板首句定义；确认已结束 run 的入口仍无 |
| 33 | 澄清文字是 JSON | 已修 | #548 读 `question.question` |
| 34 | 日记账没有表格 | 已修 | #548（自家表格，无 TanStack） |
| 35 | Firm home 仪表板 | 已修 | #557 |
| 36 | agent 不能 autopost 吗 | 半修 | 能且在 post；关的是**时钟**（裁-165 beta 关掉 cadence）——要不要开二层自治（C-05） |

## 3 · 报告二：Issue #541 审计（36 条；附录 2 有验收条款逐条核对）

| id | 级 | 一句话 | 结论 | 证据 / 剩什么 |
|---|---|---|---|---|
| 001 | P0 | Terms 无独立接受证据 | OWNER | 无 `kind` 列；Q-09 sitting（D-6） |
| 002 | P0 | DPA 是占位稿 | OWNER | 律师；先建 placeholder 部署闸门（D-6） |
| 003 | P0 | Stripe 无 live-key 硬闸 | 已修 | #544 gate 在 :381、网络在 :392；deploy preflight 未建 |
| 004 | P0 | 期初审批静默失败 | 已修 | 0171 pin serializable（已应用）+ 对话框拒绝不关；UI 全程走通未复验（D-20） |
| 005 | P1 | v74 每 2 秒调已删函数 | 已修 | v75 按镜像 id 发布；**48 分钟日志 0 报错**（今晨实测） |
| 006 | P1 | OTP 无入口、resend 死路 | 半修 | 入口有了；resend 没建（D-17） |
| 007 | P1 | DPA 已签重登不 hydrate | 半修 | 0174 `get_own_dpa_signature` 已上线；网页零调用（D-17，0.3） |
| 008 | P1 | `[object Object]` | 已修 | #546 formatter + 三个测试禁用该串 |
| 009 | P1 | 面谈资料不入库 | 未动 | = H-21，Q-01 |
| 010 | P1 | 同意书 grant/activate 无面 | OBSOLETE | 裁-186 改形；建 Q-02 |
| 011 | P1 | 月结单端到端不通 | 半修 | 手录路径通（H-06）；AI 路径卡新 P0 race（D-2） |
| 012 | P1 | 销货 lane 只能 DB 开、CLR23 无恢复 | 半修 | 后端 v10+0176 干净；无面板（D-17 + F-02） |
| 013 | P1 | Bookkeeper 自建自批 | OBSOLETE | 裁-187 允许；**DB 墙仍在**（D-4） |
| 014 | P1 | Bookkeeper 看到 owner 控件 | 已修 | #550 capabilities 从迁移解析 |
| 015 | P1 | Close 的 Clara 拒绝语错 | 未动 | v17 freeform 把所有拒绝都渲成 42501；Q-04 v18 |
| 016 | P1 | 放弃后无 restart | 已修 | #549 |
| 017 | P1 | Reports 零模板 | 未动 | Q-06（D-15） |
| 018 | P1 | Activity 看不到事件 | 半修 | 0174 时间线读 + Home 渲染；`/activity` 页仍写没建（D-17） |
| 019 | P1 | 窄窗/200% 不可用 | 已修 | #553，浏览器 640px 走查证明 |
| 020 | P2 | Ties 语义误导 | 已修 | #549 四道门分别点名 |
| 021 | P2 | Approved/Posted/routine 混 | 已修 | #548 单一 Approve |
| 022 | P2 | 内部函数名/migration 露出 | 半修 | 四处点名的没了；35 条仍含 `clara.*`，**两条已说谎**（Q-05，D-17 先修两条） |
| 023 | P2 | committed 后仍显示 Commit/Cancel | 已修 | #546 |
| 024 | P2 | Clients 无 Add Client | 已修 | #546 |
| 025 | P2 | Members 标题重复/日期 | 已修 | #550 |
| 026 | P2 | Needs you 内部 marker | 已修 | #550 |
| 027 | P2 | Reports 收件人 raw UUID | 已修 | #549 名字解析 + picker |
| 028 | P2 | Close hold raw UUID | 已修 | #549 |
| 029 | P2 | 空数据 vacuous tie | 已修 | #549 三态「未评估」 |
| 030 | P2 | Knowledge 仍空 | 未动 | 根因同 009，Q-01 一修就活 |
| 031 | P3 | 品牌大小写 | WRONG | 裁-137 字标小写、正文 ClaraBook；邮件模板未量 |
| 032 | P3 | Tax 页露路线图 | 已修 | #557；F-01 门槛 grant |
| 033 | P3 | Admin 名称误导 | 已修 | #550 非 admin 显示 Firm |
| 034 | P3 | Recon 空状态重复 | 已修 | #549 |
| 035 | P3 | 发布版本不可反查 | 已修 | #558 `/api/build-info` 两臂，线上读到 sha/镜像/frontier |
| 036 | P3 | 浏览器 e2e 非必过闸 | 未动（已裁入法） | 裁-192；先修两个 flake 再开闸（Q-07） |

§8/§9 出场包：16 个场景 6 个现在能过、8 个不能、2 个被裁决作废要重写（D-5）；§9 「0 P0 0 P1」仍是 NO。

## 4 · 报告三：Handover 走查行 H-01…56（附录 3；含 PROGRESS 哪里写错）

| id | 级 | 一句话 | 结论 | 证据 / 剩什么 |
|---|---|---|---|---|
| H-01 | P0 | 镜像与库结构不一致 | 已修（仪式） | v75 |
| H-02 | P0 | Maybank 无期间起讫 | 已修 | #545 v3 header 四种 basis；未现场复验（D-20） |
| H-03 | P0 | 见证人印行名不印代码 | 已修 | #545 + 0175；同上 |
| H-05 | P0 | persist 失败卡 running | 已修 | #545 terminal settle；一条孤儿待清（D-18） |
| H-06 | P0 | 手录月结单从未成功 | 已修 | #549 送 institution_code+account_number |
| H-17 | P0 | 无人值守每张销货单自拒 | 已修 | #556 v10 + 0176；`tokens:0` 残留未解释（D-20） |
| H-18 | P0 | 产品里开不了客户 AI | OBSOLETE | 裁-186 改形；缺陷仍在，处方换了（Q-02） |
| H-35 | P0 | 找不到输码入口 | 已修 | #544 |
| H-36 | P0 | DPA v1 占位稿 | OWNER | 律师（D-6） |
| H-37 | P0 | Stripe 页印裁决编号 | OWNER | 只在 Stripe 后台（D-7） |
| H-42 | P0 | 两个角色密码曾回显 | OWNER | 裁-178 已受风险 |
| H-43 | P0 | 六条 DSN TLS 不验证 | 半修 | CA 已进镜像（#558）；verify-full 翻转是下次仪式 |
| H-47 | P0 | 线上重跑迁移把角色变 NOLOGIN | 未动 | Q-08 |
| H-48 | P0 | 凭证错的 lane 到首用才暴露 | 已修 | `/ready` `checks.pools` 七 lane |
| H-04 | P1 | 分类器认不出月结单 | DRIFT | 病根是 classify/OCR race（D-2） |
| H-07/08 | P1 | close-prep 聊天读不到 run、拒绝语错 | 未动 | Q-04 |
| H-09 | P1 | 付款人识别码无处填 | 半修 | 0174 门已建；web 零调用（D-17） |
| H-11 | P1 | 放弃后无「开始结账」 | 已修 | #549 |
| H-12 | P1 | 归档月结单后 uncoded 必假失败 | 已修 | 0165/0166 |
| H-15 | P1 | 零法定报表 | 未动 | Q-06 |
| H-16 | P1 | 报表页叫用户要不存在的功能 | 已修（文案） | export 能力未排（D-10） |
| H-21 | P1 | 面谈答案不落库 | 未动 | Q-01 |
| H-19 | P1 | 销货 lane 开关只能 SQL | 半修 | 0176 owner 包装；无面（D-17） |
| H-20 | P1 | `add_client_identifier` 无面 | 未动 | H-21 之后 |
| H-26/27 | P1 | `[object Object]`/原始 JSON | 已修 | #546 |
| H-30 | P1 | 套用科目表对话框不滚动 | 已修 | #546 dialog max-h |
| H-38 | P1 | 结账 session 无邮箱 | 已修 | #544 `customer_email` |
| H-39/40/45/46 | P1 | webhook 重复 / Supabase 两设置 / Resend 上限 / 邮件门认证 | OWNER | D-7 |
| H-49 | P1 | DR 探针 4.9 丢主体 | 半修 | 0174 登记表；脚本仍硬编码 id |
| H-10/13/14/54 | P2 | close/bank 行为对但没说、无 runbook | 未动/半修 | 冻结文案已改；手册不存在（D-16） |
| H-22 | P2 | 设定种类后问题仍开 | 已修 | 0169 |
| H-23 | P2 | 「未编码 ×4」与门读 0 | 半修/DRIFT | 三个分歧是设计使然不可统一；只改用词（Q-05） |
| H-24 | P2 | Enter 不送出 | 已修 | #547 |
| H-25 | P2 | `/activity` 缺文案键 | 已修 | #550 |
| H-28 | P2 | 清单计数卡 1/1 | 已修 | #546 |
| H-29 | P2 | 科目表行说「尚未决定」 | 半修 | 0170 修 DB（handover 病因判错）；卡片欠一句话（Q-05） |
| H-31 | P2 | favicon 404 | 已修 | #553 |
| H-32 | P2 | 澄清卡倒 JSON | 已修 | #548 |
| H-33 | P2 | 澄清表单渲染两份 | 半修/DRIFT | 两处是两个高度，刻意保留；两个按钮都叫 Answer |
| H-34 | P2 | 对手方卫生说没有对手方 | 已修 | #549 |
| H-41 | P2 | 两个 `clarabook-frontend` 重切 PR | OWNER | 裁-168 |
| H-44 | P2 | `held_outbox` 6 | 无事 | 随 C-05 |
| H-50/51 | P2 | 页首仍写 Onboarding / 无新增客户 | 已修 | #546 |
| H-52 | P2 | 答了未注册 SST 还问 SST 号 | 未动 | `appliesTo` 缺；随 Q-01 |
| H-53 | P2 | 同意书证据落进编码 lane | 已修 | 0168 + 0165 |
| H-55 | P2 | 零月结单 bank 门空洞 PASS | 已修 | 0167/0172；文案欠一句（Q-05） |
| H-56 | P2 | 两门 UNKNOWN 仍可 Finalize | 已修 | #549 点名；裁-187 finalize 不禁用 |

## 5 · 报告三：旧积压 C-01…88（附录 4）

**本 session 关掉：** C-04 连接池错误约定（#558）· C-07 XML 同源（#555；CSP 真开是新行，D-13）· C-43 ⌘K（#553）。
**半修：** C-10（livemode 闸有了，滞留付款半边留）· C-15（web 半边 string 化，DB 半边留）· C-19（autoDraft 一处精确映射，全库扫描留）· C-25（0166 换了锚点，NULL 盲区仍在）· C-39（聊天切换器有了，四个缺口留）· C-42（流式文字排 Q-12，其余三条留）· C-45（缺键 lint 有了，硬编码字符串 ban 没有）· C-70（build-info 有了，部署前比较没有）· C-77（DoorDialog 关了，其余九条留）。
**报告写错（前提在 09-03 就已不成立）：** C-11 SSE 再鉴权（#511 已做）· C-60 破坏性测试守卫（#498 已做）· C-74 裁-110 台账（#503 已记）。
**作废：** C-28 大额门槛门（裁-187；并 Q-03，D-4）。**STALE：** C-50 运行跑道三门（主体文件随重置消失，要重普查）。
**DRIFT（要重量）：** C-32（脚本 499 行先拆）· C-35（行号 :451）· C-44（aria-invalid 26 处非 2）· C-64（worktree 数要重走）。
**只能你做：** C-01 上市路线图 · C-06 Terms · C-14 还原演练 · C-16 HA 花钱 · C-54 · C-56 PITR · C-65 · C-78 magiclink。
**原样继续背（59 条）：** C-02 03 05 08 09 12 13 17 18 20 21 22 23 24 26 27 29 30 31 33 34 36 37 38 40 41 46 47 48 49 51 52 53 55 57 58 59 61 62 63 66 67 68 69 71 72 73 75 76 79 80 81 82 83 84 85 86 87 88。

## 6 · 你拍板后我会做的文档同步（一个 docs PR）

- PROGRESS Known issues 开头「NOTHING THE SESSION BUILT IS SERVING」（第 259 行）与顶部 posture 自相矛盾 → 改为已上线。
- PROGRESS Backlog P0 行：划掉 H-02/03/05/06/17/35、C-07；P1 行：划掉 H-11/12/16/26/27/30/38，H-09/19/49 改「门已建面未建」；P2「22 条」改为 10 未闭；C-04、C-11 从未关列表移除；「H-48 opens for real at v75」改过去式。
- PROGRESS Known issues：「apps/web 已带 archived_at 读者」→ 读者在 runtime `chatRoutes.ts:178`；H-01/H-17/H-18 四条旧摘要重写。
- Handover：H-04 病因、H-29 病因、H-23/H-33 处方、H-38 owner 栏（web 不是 runtime）、第 33 行「三个 vars」实为四个、C-10/C-11/C-60/C-74 前提、C-25/C-35 锚点。
- 新增 Q-00（race）、Q-02b（小面 lane）、close/bank 手册行、CSP 真开行、placeholder 部署闸门行；#541 验收清单两条重写说明。
- Issue #541 留一条评论：逐条处置 + 出场包状态（umbrella 不关，两个 P0 等你）。

## 7 · 没量到的（诚实列出）

- 线上是否有事务所挂着大额门槛（CB-013 死角）：bridge sleeper 已销毁，未读；下次仪式顺手。
- H-02/03/05/06、CB-004、H-17 `tokens:0`：代码对、已上线，**没拿真单据/干净客户复走**（D-20）。
- CB-031 品牌：邮件模板那面没量。CB-018：三类动作是否真的写进时间线未证。
- C-25(c)、C-60 的九个测试文件、C-87 Mobbin 视频通看是否算完成、C-19 的计数口径。
<!-- end verbatim: Clara 三份报告处置清单 2026-09-06.md -->
