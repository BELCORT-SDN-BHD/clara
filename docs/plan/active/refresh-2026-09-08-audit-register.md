# Clara historical audit register — refresh classification

Checked: 2026-09-09 (Asia/Kuala_Lumpur); filename follows the refresh's 2026-09-08 evidence series. Current source baseline: 68ab432308e1bfe87871565c207f8f4ac1e89101, plus explicitly labelled local candidates. Owner: [重判旧 audit 与 backlog，切出可验证实现切片](https://github.com/BELCORT-SDN-BHD/clara/issues/605).

This register accounts for **216 unique historical IDs** (36 UI, 36 CB-AE2E, 56 H, 88 C), plus the disposition's additional known issues. Classification is a spec/ticket input. It does **not** mean 216 current behaviors were reproduced, fixed or deployed, and closes no issue. VERIFY rows and unresolved nested contents remain actionable.

## Sources and reconstruction

The owner supplied C:/Users/zhant/Desktop/Clara 三份报告处置清单 2026-09-06.md and four appendices under C:/Users/zhant/Desktop/Clara 报告处置 2026-09-06 附录. R1–R4 identify exact appendix line numbers. Their original labels are retained as historical data against fc39c361, not a fresh hosted observation.

| Source | Rows | SHA-256 |
|---|---:|---|
| R1 — 附录1 报告一 我的UIUX清单 逐条取证.md | 36 | 7E20E7B5655CBDF541C0B9A9CA94064A3C04CC0B89F0D0D4DE6F62B93F3996A4 |
| R2 — 附录2 报告二 Issue541审计 逐条取证.md | 36 | 216657EB396CB086F51A13B60852FF816F454F54963F152CD4B850B5D156A2F7 |
| R3 — 附录3 报告三 Handover H行 逐条取证.md | 56 | 14F04A5D3343A75C01F710D63C0F1D783D83978CB8C580AB64059003955FA560 |
| R4 — 附录4 报告三 Handover C行 逐条取证.md | 88 | 3401212D52ADC9FADE3E55C107AEB3B59F3FC275A457205BFAE60E4B31F0CFB8 |

Historical nested obligations are recoverable with git show at fc39c361 for docs/plan/active/beta-handover-2026-09-04.md, its -part2.md and -part3.md, and their linked historical design/ruling files. These are historical inputs, not current authority. A missing current path does not mean an obligation was resolved. Current code/config/CI has changed since that baseline; do not assume every cited source is unchanged.

## Meanings and counts

| Status | Count | Meaning |
|---|---:|---|
| REDESIGN | 97 | Named behavior has an accepted refresh contract; carry its regression/failure states into vertical implementation. Do not rebuild the old page/ceremony merely because it had a ticket. |
| REPLACED | 17 | Old remedy/premise is superseded by a current decision or source removal. The row retains the useful invariant; current code is not thereby fixed. |
| VALID GAP | 15 | Current/source-backed research identifies a gap. Implementation and local/hosted verification remain separate. |
| SOURCE | 4 | Bounded current source observation corrects or preserves an old claim. Deliberately not FIXED or HOSTED VERIFIED. |
| VERIFY | 65 | Exact behavior, nested scope or deployment evidence needs revalidation. Its named next action cannot be dropped or marked ready-to-build. |
| EXTERNAL | 18 | Legal/product/provider/hosted evidence is a separate input. This does not mean the agent cannot inspect an authorised service; this pass did not establish that fact or authorise a purchase/change. |

## Current-source corrections and evidence

- **E1 — identifier uniqueness:** packages/db/migrations/0155_client_identifiers_unique.sql:402-403 creates the same-client (client_id, kind, value_normalized) unique index; named constraint handlers appear at 450/642/656. C-17 missed this migration. Firm-wide matching stays non-unique so two clients sharing a value remain representable as attribution ambiguity. Hosted index state was not inspected.
- **E2 — stream reauthorization:** packages/runtime/src/streamRoute.ts:82-88 re-resolves principal/access on each task poll. The broad no-reauthorization premise is wrong. This does not prove every revoke/fetch/send interleaving atomic; retain new-runtime current-authority tests.
- **E3 — extraction ordering:** [OCR candidate validation](refresh-2026-09-08-ocr-fix-validation.md) and [Documents contract](refresh-2026-09-08-document-flow-contract.md) trace baseline admission and the separate local 0177/consumer candidate. PostgreSQL 17 full-chain and hosted outcomes remain outstanding.
- **E4 — Knowledge/onboarding/egress wiring:** [KB evidence](refresh-2026-09-08-kb-contract-evidence.md), [backend evidence](refresh-2026-09-08-backend-evidence.md) and [earlier triage](refresh-2026-09-08-audit-triage.md) distinguish answer capture, governed facts, Knowledge reads and agreement/egress state. A rendered answer is not a persisted fact.
- **E5 — Activity:** apps/web/app/(firm)/activity/page.tsx:27-35 now acknowledges the existing timeline read but still renders NotBuiltNote; Firm Home uses the read. The old false comment was corrected; the missing product connection remains. Do not queue the corrected comment as unchanged.
- **E6 — browser gate:** current rg scan of .github found no Playwright/browser-E2E invocation. This is a repository configuration finding, not hosted branch-protection evidence. Required checks must exercise the implemented journeys.
- **E7 — bigint receipt:** packages/db/migrations/0131_f_a6_freeform_read.sql:1266 emits read_id as a JSON number. The referenced later type correction does not replace that member. Preserve exact identifiers across SQL/JSON/JS.
- **E8 — secret scan:** .github/actions/lint-suite/action.yml:45-56 keeps full-history push scanning and a valid PR branch range. Narrowing it is not automatically an improvement.
- **E9 — pool/README:** packages/runtime/lib/pool-error-contract.mjs exists; packages/runtime/README.md:96-111 explains health, lane probes and TLS limits. The old README omission is stale; actual TLS enforcement/rollout is separate.
- **E10 — removed tools:** the fc39c361→68ab4323 Git diff records removal of old harness-link/instruction-check modules. Preserve useful checks at current AGENTS/SOT boundaries rather than patching deleted paths.
- Other VALID GAP rows use the existing [backend evidence](refresh-2026-09-08-backend-evidence.md) and the owning domain contract below. No new hosted observation is claimed.

Codebase Memory was used for orientation. Relevant paths had changed metadata; a guessed lib/chatRoutes.ts was absent, so direct reads used src/chatRoutes.ts and src/streamRoute.ts. Graph coverage was not treated as source completeness.

## Obligation families

These are coverage owners for synthesis, **not approved ticket cuts**. The audit/slicing issue retains every row through the formal spec and reviewed vertical split.

| Family | Contract/input |
|---|---|
| ui | [Full frontend journey/state rebuild](refresh-2026-09-08-frontend-interaction-contract.md) |
| chat | [Durable Work, shared questions and conversation lifecycle](refresh-2026-09-08-product-spec.md) |
| knowledge | [Onboarding, client Knowledge and identity](refresh-2026-09-08-kb-contract-evidence.md) |
| documents | [Typed document intake and processing](refresh-2026-09-08-document-flow-contract.md) |
| bank | [Bank, allocations and reconciliation](refresh-2026-09-08-bank-flow-contract.md) |
| accounting | [Complete accounting operations, registers and close](refresh-2026-09-08-accounting-boundaries-evidence.md) |
| reports | [Reports and attributable artifacts](refresh-2026-09-08-frontend-flow-coverage.md) |
| runtime | [Unified runtime, recovery and version compatibility](refresh-2026-09-08-agent-harness-validation.md) |
| ops | [Deployment, security, recovery and external evidence](refresh-2026-09-08-audit-triage.md) |
| quality | [Test and harness acceptance](refresh-2026-09-08-phase-handoff.md) |
| commercial | [Firm registration, billing and owner/provider inputs](refresh-2026-09-08-frontend-flow-coverage.md) |

## Owner UIUX list

| ID / source | Original concern | Historical label | Refresh disposition | Owner family / next action |
|---|---|---|---|---|
| UI-01 · R1:11 | 收到六位数验证码那一步, 没有路走下去 | FIXED | REDESIGN | **commercial** — Retain OTP→firm-registration route and refusal/retry recovery; old FIXED/WRONG labels are not current browser proof. |
| UI-02 · R1:12 | 卡片组件和别的东西也有问题 | DRIFT | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-03 · R1:13 | 待办审阅那个界面只有一堆字 | FIXED | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-04 · R1:14 | 我们到底有没有真的在用 shadcn | PARTIAL | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-05 · R1:15 | 我们是不是照着这几套工具在设计 | PARTIAL | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-06 · R1:16 | 去 Mobbin 找同类 AI 产品的最佳范例来学 | PARTIAL | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-07 · R1:17 | 所有改过的界面都要有 e2e | PARTIAL | VERIFY | **quality** — Keep per-journey verification and similar-defect coverage; do not treat an inventory or historical issue closure as passed E2E. |
| UI-08 · R1:18 | 税务那一块的界面要补上 | PARTIAL | REDESIGN | **accounting** — Use current Tax/Close/dashboard contracts; do not silently inherit a statutory-calendar engine from an old GI-clock label. |
| UI-09 · R1:19 | 那个 GI 时钟也要补 | OPEN-VALID | REDESIGN | **accounting** — Use current Tax/Close/dashboard contracts; do not silently inherit a statutory-calendar engine from an old GI-clock label. |
| UI-10 · R1:20 | 聊天里 agent 的生成式界面全部补齐 | PARTIAL | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-11 · R1:21 | 把所有同类毛病都找出来 | FIXED | VERIFY | **quality** — Keep per-journey verification and similar-defect coverage; do not treat an inventory or historical issue closure as passed E2E. |
| UI-12 · R1:22 | 做组件和动效时要守住设计 token 和设计系统 | FIXED (honored) | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-13 · R1:23 | autodraft 不是应该 agent 自己做吗 | FIXED | REPLACED | **runtime** — Default agentic execution replaces a separate request-autodraft/opt-in autopost remedy; authorised schedules and current constraints still apply. |
| UI-14 · R1:24 | 没有地方让我输入那六位数 | FIXED | REDESIGN | **commercial** — Retain OTP→firm-registration route and refusal/retry recovery; old FIXED/WRONG labels are not current browser proof. |
| UI-15 · R1:25 | 也没让我继续去建事务所 | WRONG (premise) | REDESIGN | **commercial** — Retain OTP→firm-registration route and refusal/retry recovery; old FIXED/WRONG labels are not current browser proof. |
| UI-16 · R1:26 | 按了确认归档后, 那个"需要你确认"没有消失 | FIXED | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-17 · R1:27 | 页面叠加查看器还没建, 我现在就要 | FIXED | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-18 · R1:28 | 抽取出来的文字要排得好看, 不要一大坨 | FIXED | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-19 · R1:29 | 开户访谈要像真的 AI 一样一问一答出卡片, 背后把资料写对 | PARTIAL | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-20 · R1:30 | 提交或取消之后, 上面那张卡还留着 | FIXED | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-21 · R1:31 | 客户还在开户时, 直接把开户对话放大或全屏 | FIXED (as an opt-in) | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-22 · R1:32 | 开户完成后那些卡还留着 | FIXED | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-23 · R1:33 | 客户工作区的首页做得很烂 | FIXED | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-24 · R1:34 | 聊天面板不能新建/清空/删除对话 | PARTIAL | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-25 · R1:35 | 开户后聊天里的东西还留着 | FIXED | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-26 · R1:36 | 聊天里没法生成或给我下载文件 | PARTIAL | REDESIGN | **reports** — Supported report/artifact production and download belong in the result flow; do not claim arbitrary exports already exist. |
| UI-27 · R1:37 | 聊天里根本没有生成式界面 | PARTIAL | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-28 · R1:38 | 客户 AI 授权的最后一步在网页上没有按钮, 真的 beta 客户开不了 AI | PARTIAL | REPLACED | **knowledge** — Remove a manual AI-on switch as normal bookkeeping UX; preserve actual egress authority and agreement evidence separately from accounting permission. |
| UI-29 · R1:39 | 同意书集中在 DPA 那一步一次签完, 事务所签了全部客户就算同意 | OWNER-ACT (already ruled) | REPLACED | **knowledge** — Remove a manual AI-on switch as normal bookkeeping UX; preserve actual egress authority and agreement evidence separately from accounting permission. |
| UI-30 · R1:40 | 活动页那个 agent task 卡是空的, 只能取消, 用户不知道该干嘛 | PARTIAL | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-31 · R1:41 | 待办里的 agent task 没有细节也没法互动 | FIXED | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-32 · R1:42 | 什么叫 sweep run, 看不懂 | FIXED | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-33 · R1:43 | 日记账澄清那段 agent 文字是 JSON, 能不能好看点 | FIXED | REDESIGN | **chat** — Shared Work/questions, receipt-driven settled UI and native streaming; new/archive/restore/delete ordinary text with minimum basis retained. |
| UI-34 · R1:44 | 日记账分录没有一个表格界面 | FIXED | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-35 · R1:45 | 事务所首页要照 Mobbin 做成一个能通往各页的仪表板 | FIXED | REDESIGN | **ui** — Replace against the accepted 34-journey/component/A+B contracts; preserve keyboard, scope, typed data and responsive regressions. |
| UI-36 · R1:46 | agent 不能自动过账吗 | PARTIAL | REPLACED | **runtime** — Default agentic execution replaces a separate request-autodraft/opt-in autopost remedy; authorised schedules and current constraints still apply. |

## Authenticated E2E audit

| ID / source | Original concern | Historical label | Refresh disposition | Owner family / next action |
|---|---|---|---|---|
| CB-AE2E-001 · R2:15 | Beta Terms 没有独立接受证据 | **OWNER-ACT** | EXTERNAL | **commercial** — Keep legal-text/version/acceptance engineering and real legal content separate; do not invent final Terms/DPA or infer a live signature. |
| CB-AE2E-002 · R2:16 | DPA 仍是 placeholder | **OWNER-ACT** | EXTERNAL | **commercial** — Keep legal-text/version/acceptance engineering and real legal content separate; do not invent final Terms/DPA or infer a live signature. |
| CB-AE2E-003 · R2:17 | Stripe sandbox 没有 runtime hard gate | **FIXED** | VERIFY | **ops** — Re-read actual deployed identity/preflight and positive/negative behavior; old serving IDs do not prove current deployment. |
| CB-AE2E-004 · R2:18 | Opening approval 生产不可能完成且静默失败 | **FIXED** | REDESIGN | **accounting** — Carry the named opening/close/recon condition into complete operation/readiness acceptance, including empty versus unknown and recovery. |
| CB-AE2E-005 · R2:19 | Runtime v74 仍调用已删除 autopost function | **FIXED** | VERIFY | **ops** — Re-read actual deployed identity/preflight and positive/negative behavior; old serving IDs do not prove current deployment. |
| CB-AE2E-006 · R2:20 | OTP 缺可发现路径，resend 是 dead end | **PARTIAL** | REDESIGN | **commercial** — OTP entry/resend/retry and registration continuation must work in the new onboarding flow. |
| CB-AE2E-007 · R2:21 | DPA signed state 重登后不 hydrate | **PARTIAL** | VALID GAP (E4) | **knowledge** — Interview answers must enter governed client facts; agreement read and Knowledge state need real wiring, not only rendered cards. |
| CB-AE2E-008 · R2:22 | 结构化答案渲染 `[object Object]` | **FIXED** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-009 · R2:23 | Interview facts 不 promotion 到 canonical truth | **OPEN-VALID** | VALID GAP (E4) | **knowledge** — Interview answers must enter governed client facts; agreement read and Knowledge state need real wiring, not only rendered cards. |
| CB-AE2E-010 · R2:24 | Typed consent Grant + Activate 没有产品 surface | **OBSOLETE (reshaped)** | REPLACED | **accounting** — Supersede old per-action approval/automation ceremonies with accepted role authority and automatic complete business receipts; preserve accounting invariants. |
| CB-AE2E-011 · R2:25 | Bank statement end-to-end 仍不可完成 | **PARTIAL** | VALID GAP (E3) | **documents** — Classification must wait for successful extraction; verify the isolated local candidate/full-chain/hosted path separately. |
| CB-AE2E-012 · R2:26 | Sales lane 是 DB-only 开关，CLR23 无恢复 | **PARTIAL** | REPLACED | **runtime** — Sales execution becomes part of default agentic intake; scoped authority/recovery remains, not a manual lane-enable panel. |
| CB-AE2E-013 · R2:27 | Bookkeeper 自建自批 routine journal | **OBSOLETE** | REPLACED | **accounting** — Supersede old per-action approval/automation ceremonies with accepted role authority and automatic complete business receipts; preserve accounting invariants. |
| CB-AE2E-014 · R2:28 | Bookkeeper 能看到 Owner-only Admin controls | **FIXED** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-015 · R2:29 | Close 的 Clara 权限 refusal 文案错误 | **OPEN-VALID** | VALID GAP | **runtime** — Successor shared loop must classify actual refusal reason and choose repair/reread/question/error; do not map every close refusal to permission. |
| CB-AE2E-016 · R2:30 | Close abandon 后缺 restart/recovery | **FIXED** | REDESIGN | **accounting** — Carry the named opening/close/recon condition into complete operation/readiness acceptance, including empty versus unknown and recovery. |
| CB-AE2E-017 · R2:31 | Reports 没有任何模板或 artifact | **OPEN-VALID** | REDESIGN | **reports** — Prove a supported report from request to sealed/rendered/downloadable result; names and parameters replace raw IDs. |
| CB-AE2E-018 · R2:32 | Activity 看不到真实审计事件 | **PARTIAL** | VALID GAP (E5) | **ui** — Activity route still renders a timeline NotBuiltNote although Firm Home has the read; connect through accepted Work/activity navigation. |
| CB-AE2E-019 · R2:33 | Authenticated shell 窄窗/200% zoom 不可用 | **FIXED** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-020 · R2:34 | Opening "Ties" 语义误导 | **FIXED** | REDESIGN | **accounting** — Carry the named opening/close/recon condition into complete operation/readiness acceptance, including empty versus unknown and recovery. |
| CB-AE2E-021 · R2:35 | Approved / Posted / routine 用词不一致 | **FIXED** | REPLACED | **accounting** — Supersede old per-action approval/automation ceremonies with accepted role authority and automatic complete business receipts; preserve accounting invariants. |
| CB-AE2E-022 · R2:36 | 内部函数/migration/roadmap 文案暴露 | **PARTIAL** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-023 · R2:37 | committed 后仍显示 Commit/Cancel | **FIXED** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-024 · R2:38 | Clients list 没有 Add Client | **FIXED** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-025 · R2:39 | Members 信息架构与日期不一致 | **FIXED** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-026 · R2:40 | Needs you 使用内部 marker | **FIXED** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-027 · R2:41 | Reports recipient 显示 raw UUID | **FIXED** | REDESIGN | **reports** — Prove a supported report from request to sealed/rendered/downloadable result; names and parameters replace raw IDs. |
| CB-AE2E-028 · R2:42 | Close hold 显示 raw user UUID | **FIXED** | REDESIGN | **accounting** — Carry the named opening/close/recon condition into complete operation/readiness acceptance, including empty versus unknown and recovery. |
| CB-AE2E-029 · R2:43 | Registers 空数据 vacuous tie | **FIXED** | REDESIGN | **accounting** — Carry the named opening/close/recon condition into complete operation/readiness acceptance, including empty versus unknown and recovery. |
| CB-AE2E-030 · R2:44 | Knowledge 在 onboarding 后仍为空 | **OPEN-VALID** | VALID GAP (E4) | **knowledge** — Interview answers must enter governed client facts; agreement read and Knowledge state need real wiring, not only rendered cards. |
| CB-AE2E-031 · R2:45 | 品牌大小写不一致 | **WRONG** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-032 · R2:46 | Tax 页面把路线图当产品 | **FIXED** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-033 · R2:47 | Admin section 对非 Admin 名称误导 | **FIXED** | REDESIGN | **ui** — Retain the named formatter/access/shell/copy/settled-state regression in new route acceptance; remeasure current behavior instead of copying old FIXED/WRONG. |
| CB-AE2E-034 · R2:48 | Bank reconciliation empty state 重复 | **FIXED** | REDESIGN | **accounting** — Carry the named opening/close/recon condition into complete operation/readiness acceptance, including empty versus unknown and recovery. |
| CB-AE2E-035 · R2:49 | Release provenance 不可唯一反查 | **FIXED** | VERIFY | **ops** — Re-read actual deployed identity/preflight and positive/negative behavior; old serving IDs do not prove current deployment. |
| CB-AE2E-036 · R2:50 | Browser E2E 不是 required CI gate | **OPEN-VALID (ruled in)** | VALID GAP (E6) | **quality** — Required browser journey coverage was not found in the inspected .github tree; attach a real passing gate to implemented journeys. |

## Handover walk

| ID / source | Original concern | Historical label | Refresh disposition | Owner family / next action |
|---|---|---|---|---|
| H-01 · R3:19 | 服务镜像与库结构不一致 | **FIXED** (ceremony) | VERIFY | **ops** — Check current source, actual image/role/TLS/restore state and negative probes independently; historical deployment/repair claims are not present proof. |
| H-02 · R3:20 | 月结单没有印期间起讫，Maybank 被拒 | **FIXED** | REDESIGN | **bank** — Preserve statement facts/header/institution/manual-input/terminal-settle and readiness cases in the Bank contract; real-document and hosted outcomes remain separate. |
| H-03 · R3:21 | 见证人印的是行名，门要的是代码 | **FIXED** | REDESIGN | **bank** — Preserve statement facts/header/institution/manual-input/terminal-settle and readiness cases in the Bank contract; real-document and hosted outcomes remain separate. |
| H-04 · R3:33 | 分类器认不出银行月结单 | **DRIFT** | VALID GAP (E3) | **documents** — Old prompt diagnosis is restated as extraction/classification ordering; local candidate is not a hosted fix. |
| H-05 · R3:22 | persist 失败把 task 卡在 running | **FIXED** | REDESIGN | **bank** — Preserve statement facts/header/institution/manual-input/terminal-settle and readiness cases in the Bank contract; real-document and hosted outcomes remain separate. |
| H-06 · R3:23 | 人工录月结单表单从未能成功 | **FIXED** | REDESIGN | **bank** — Preserve statement facts/header/institution/manual-input/terminal-settle and readiness cases in the Bank contract; real-document and hosted outcomes remain separate. |
| H-07 · R3:34 | 结账前聊天 lane 读不到 close run | **OPEN-VALID** | VALID GAP | **runtime** — Shared Work/agent tools must expose the actual close run and typed refusal/recovery path; successor version required. |
| H-08 · R3:35 | 拒绝语描述错了自己的原因 | **OPEN-VALID** | VALID GAP | **runtime** — Shared Work/agent tools must expose the actual close run and typed refusal/recovery path; successor version required. |
| H-09 · R3:36 | 付款人识别码这一关无处可填 | **PARTIAL** | VALID GAP (E4) | **knowledge** — Route identifiers/facts/applicable onboarding questions into the unified Knowledge service and execution context, without manual pre-registration. |
| H-10 · R3:53 | 结账中人工银行结算被 CLR19 拒（行为正确） | **OPEN-VALID** | REDESIGN | **accounting** — Apply current automatic close/readiness/period-handling decisions; explanatory UX and recovery must reflect actual accounting state. |
| H-11 · R3:37 | 放弃结账后没有「开始结账」按钮 | **FIXED** | REDESIGN | **accounting** — Apply current automatic close/readiness/period-handling decisions; explanatory UX and recovery must reflect actual accounting state. |
| H-12 · R3:38 | 归档月结单后 uncoded 门必假失败 | **FIXED** | REDESIGN | **bank** — Preserve statement facts/header/institution/manual-input/terminal-settle and readiness cases in the Bank contract; real-document and hosted outcomes remain separate. |
| H-13 · R3:54 | 期间缺口 11 个月是设计行为，文案没说 | **OPEN-VALID** | REDESIGN | **accounting** — Apply current automatic close/readiness/period-handling decisions; explanatory UX and recovery must reflect actual accounting state. |
| H-14 · R3:55 | 银行对帐 certify 被期初差额挡住（行为正确） | **OPEN-VALID** | REDESIGN | **bank** — Preserve statement facts/header/institution/manual-input/terminal-settle and readiness cases in the Bank contract; real-document and hosted outcomes remain separate. |
| H-15 · R3:39 | 一张法定报表都渲染不出来 | **OPEN-VALID** | REDESIGN | **reports** — Supported report request/output/download must be real; management and statutory output scope/wording are not inferred from an old queue. |
| H-16 · R3:40 | 报表页叫用户去要一个不存在的功能 | **FIXED**（改文案那半） | REDESIGN | **reports** — Supported report request/output/download must be real; management and statutory output scope/wording are not inferred from an old queue. |
| H-17 · R3:24 | 无人值守记账每张销货单自拒 | **FIXED**（有残留） | REPLACED | **runtime** — Default-agentic sales/intake supersedes manual activation and generic self-rejection remedies; retain precise identity/current-books/egress constraints. |
| H-18 · R3:25 | 产品里无法为客户开启 AI 处理 | **OBSOLETE**（裁-186 重塑） | REPLACED | **runtime** — Default-agentic sales/intake supersedes manual activation and generic self-rejection remedies; retain precise identity/current-books/egress constraints. |
| H-19 · R3:42 | 销货 lane 开关只能用 SQL 翻 | **PARTIAL** | REPLACED | **runtime** — Default-agentic sales/intake supersedes manual activation and generic self-rejection remedies; retain precise identity/current-books/egress constraints. |
| H-20 · R3:43 | `add_client_identifier` 没有面 | **OPEN-VALID** | VALID GAP (E4) | **knowledge** — Route identifiers/facts/applicable onboarding questions into the unified Knowledge service and execution context, without manual pre-registration. |
| H-21 · R3:41 | 面谈答案从不落库 | **OPEN-VALID** | VALID GAP (E4) | **knowledge** — Route identifiers/facts/applicable onboarding questions into the unified Knowledge service and execution context, without manual pre-registration. |
| H-22 · R3:56 | 设定文件种类后分类问题仍开着 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-23 · R3:57 | 「未编码归档 ×4」与门读到的 0 | **PARTIAL / DRIFT** | REPLACED | **documents** — Replace ambiguous unencoded counts with named populations and source freshness; do not force unlike queries to display an identical count. |
| H-24 · R3:58 | Ask Clara 输入框按 Enter 不送出 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-25 · R3:59 | `/activity` 缺 en 文案键 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-26 · R3:44 | 清单把结构化答案渲染成 `[object Object]` | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-27 · R3:45 | 面谈把原始 capture JSON 回吐给用户 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-28 · R3:60 | 面谈进行中清单计数卡在 1/1 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-29 · R3:61 | 科目表行说「尚未决定」但其实已答 | **PARTIAL**（且原因判断**错了**） | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-30 · R3:46 | 套用科目表对话框高过视窗且不滚动 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-31 · R3:62 | `/favicon.ico` 404 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-32 · R3:63 | 澄清卡把 payload 当原始 JSON 倒出来 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-33 · R3:64 | 澄清答题表单重复渲染两份 | **PARTIAL / DRIFT** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-34 · R3:65 | 对手方卫生说「没有对手方」但有客户 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-35 · R3:26 | 未确认申请人找不到输码入口 | **FIXED** | REDESIGN | **commercial** — Retain the OTP/registration/checkout identity flow and reverify the complete user path. |
| H-36 · R3:27 | 生效中的 DPA 是 v1 占位稿 | **OWNER-ACT** | EXTERNAL | **commercial** — Obtain current provider/legal/security evidence for this named issue; historical credentials, settings and accepted risks are not a fresh permission or current measurement. |
| H-37 · R3:28 | Stripe 结账页印着内部裁决编号 | **OWNER-ACT** | EXTERNAL | **commercial** — Obtain current provider/legal/security evidence for this named issue; historical credentials, settings and accepted risks are not a fresh permission or current measurement. |
| H-38 · R3:47 | 结账 session 不带申请人邮箱 | **FIXED** | REDESIGN | **commercial** — Retain the OTP/registration/checkout identity flow and reverify the complete user path. |
| H-39 · R3:48 | 两个 Stripe webhook 指同一个 URL | **OWNER-ACT** | EXTERNAL | **commercial** — Obtain current provider/legal/security evidence for this named issue; historical credentials, settings and accepted risks are not a fresh permission or current measurement. |
| H-40 · R3:49 | 两项 Supabase 认证设置与检查表不符 | **OWNER-ACT** | EXTERNAL | **commercial** — Obtain current provider/legal/security evidence for this named issue; historical credentials, settings and accepted risks are not a fresh permission or current measurement. |
| H-41 · R3:74 | 两个 `clarabook-frontend` 重切 PR | **OWNER-ACT** | VERIFY | **quality** — Historical frontend PR/worktree bookkeeping must be reconciled against current refs; no automatic cleanup. |
| H-42 · R3:29 | 两个角色密码曾回显在记录里 | **OWNER-ACT** | EXTERNAL | **commercial** — Obtain current provider/legal/security evidence for this named issue; historical credentials, settings and accepted risks are not a fresh permission or current measurement. |
| H-43 · R3:30 | 六条 lane DSN 的 TLS 不验证证书 | **PARTIAL** | VERIFY | **ops** — Check current source, actual image/role/TLS/restore state and negative probes independently; historical deployment/repair claims are not present proof. |
| H-44 · R3:70 | `held_outbox` 6 —— 已读懂，非缺陷 | **OPEN-VALID**（本就无事可做） | REPLACED | **runtime** — Held wake/outbox counts describe current producer state, not proof of a defect; authorised scheduling and activation move through the unified runtime design. |
| H-45 · R3:50 | Resend 方案的发信上限从未读过 | **OWNER-ACT** | EXTERNAL | **commercial** — Obtain current provider/legal/security evidence for this named issue; historical credentials, settings and accepted risks are not a fresh permission or current measurement. |
| H-46 · R3:51 | 邮件门（裁-146 pt 3）未正式认证 | **OWNER-ACT** | EXTERNAL | **commercial** — Obtain current provider/legal/security evidence for this named issue; historical credentials, settings and accepted risks are not a fresh permission or current measurement. |
| H-47 · R3:31 | 线上重跑迁移把角色全变 NOLOGIN | **OPEN-VALID** | VERIFY | **ops** — Check current source, actual image/role/TLS/restore state and negative probes independently; historical deployment/repair claims are not present proof. |
| H-48 · R3:32 | 凭证错的 lane 到首次使用才暴露 | **FIXED** (code #558 + ceremony) | VERIFY | **ops** — Check current source, actual image/role/TLS/restore state and negative probes independently; historical deployment/repair claims are not present proof. |
| H-49 · R3:52 | DR STRICT 探针 4.9 丢了主体 | **PARTIAL** | VERIFY | **ops** — Check current source, actual image/role/TLS/restore state and negative probes independently; historical deployment/repair claims are not present proof. |
| H-50 · R3:66 | commit 后工作区页首仍写 Onboarding | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-51 · R3:67 | `/clients` 没有「新增客户」入口 | **FIXED** | REDESIGN | **ui** — Carry the named question/keyboard/format/count/scroll/focus/naming/entry regression into the new interaction contract. |
| H-52 · R3:68 | 已答「未注册 SST」还继续问 SST 号 | **OPEN-VALID** | VALID GAP (E4) | **knowledge** — Route identifiers/facts/applicable onboarding questions into the unified Knowledge service and execution context, without manual pre-registration. |
| H-53 · R3:69 | 同意书证据落进编码 lane | **FIXED** | REDESIGN | **documents** — Keep non-accounting evidence out of coding while preserving source custody/authority; test this on the new intake route. |
| H-54 · R3:71 | 开始结账即冻结整个期间，产品从没说 | **PARTIAL** | REDESIGN | **accounting** — Apply current automatic close/readiness/period-handling decisions; explanatory UX and recovery must reflect actual accounting state. |
| H-55 · R3:72 | 零月结单时 bank 门空洞地 PASS | **FIXED** | REDESIGN | **bank** — Preserve statement facts/header/institution/manual-input/terminal-settle and readiness cases in the Bank contract; real-document and hosted outcomes remain separate. |
| H-56 · R3:73 | 两道门 UNKNOWN，Finalize 照样给按 | **FIXED**（走「点名」那条路） | REDESIGN | **accounting** — Apply current automatic close/readiness/period-handling decisions; explanatory UX and recovery must reflect actual accounting state. |

## Carried registry

| ID / source | Original concern | Historical label | Refresh disposition | Owner family / next action |
|---|---|---|---|---|
| C-01 · R4:18 | 上市路线图 | OWNER-ACT | EXTERNAL | **commercial** — Pricing/launch scope is a separate owner input; do not let old numbering silently set current plans. |
| C-02 · R4:19 | 计费层与用量账 | CARRIES | VERIFY | **commercial** — Recover the actual metering/billing requirements and inspect current usage tables/readers, not migration filenames alone. |
| C-03 · R4:20 | C-2 运营屏 | CARRIES | REDESIGN | **commercial** — Registration, unclaimed payments and firm operations need real read/action/recovery flows, with admin access enforced. |
| C-04 · R4:21 | 连接池错误约定 | **FIXED** | SOURCE (E9) | **runtime** — Pool error contract remains a reusable module; retain its observable readiness/refusal behavior; no new hosted pass. |
| C-05 · R4:22 | G1 PR-2 自治二层 | CARRIES | REPLACED | **runtime** — Replace global held/off autonomy framing with default agentic work plus explicitly authorised future schedules; retain producer/retention acceptance. |
| C-06 · R4:23 | Beta 服务条款 | OWNER-ACT | EXTERNAL | **commercial** — Legal text and explicit acceptance kind/version are distinct from placeholder-detection implementation. |
| C-07 · R4:24 | XML 同源执行 | **FIXED** | VERIFY | **documents** — Preserve source-preview isolation and verify current XML/new-tab behavior; CSP enforcement is a separate obligation. |
| C-08 · R4:25 | 裁-176 十项 | CARRIES | VERIFY | **accounting** — Recover all ten nested staff-advance/date/harness items; do not infer an API defect merely from businessToday() or an old umbrella label. |
| C-09 · R4:26 | 结账/webhook 后续 | CARRIES | VERIFY | **commercial** — Revalidate webhook role assertions, refusals and payment claims before any paid rollout; runtime permission is not owner purchase approval. |
| C-10 · R4:27 | livemode 与滞留付款 | PARTIAL | VERIFY | **commercial** — Mode guard and stranded-payment recovery are separate; retain the latter until its exact replay/claim path is tested. |
| C-11 · R4:28 | SSE 轮询再鉴权 | **WRONG** | SOURCE (E2) | **runtime** — The claim that stream polling never reauthorises is wrong for current source; preserve the existing recheck and test revoke/reconnect races. |
| C-12 · R4:29 | /ready 硬存储门 | CARRIES | VERIFY | **ops** — Specify actual required storage/readiness behavior, then test configured, unavailable and omitted dependencies distinctly. |
| C-13 · R4:30 | 归档后端队列 | CARRIES | VERIFY | **runtime** — Recover six archived queue obligations from history and map each to the selected replacement; do not reopen six old PRs blindly. |
| C-14 · R4:31 | R2 还原演练逾期 | OWNER-ACT | EXTERNAL | **ops** — Restore rehearsal remains an evidence task; old due date and canary registry are not a restore result. |
| C-15 · R4:32 | bigint 线边界 | PARTIAL | VALID GAP (E7) | **reports** — Freeform read receipt still emits numeric bigint at SQL boundary; retain an exact/string serialization acceptance case. |
| C-16 · R4:33 | 单机无 HA | OWNER-ACT | EXTERNAL | **ops** — HA/alerting topology and any spend require an explicit deployment choice; current local Fly config is not a live machine count. |
| C-17 · R4:34 | 客户识别码唯一键 | CARRIES | SOURCE (E1) | **knowledge** — Same-client identifier uniqueness already exists in0155; retain cross-client ambiguity and safe identity lifecycle, not a duplicate index fix. |
| C-18 · R4:35 | Door-2 绕行 | CARRIES | VERIFY | **accounting** — Recover the exact Door-2 authority bypass and latest definition before choosing a refusing migration. |
| C-19 · R4:36 | 约束名盲处理 | PARTIAL | VERIFY | **runtime** — Keep exact constraint-name error classification; remeasure affected live definitions, avoid a blanket binding_conflict catch. |
| C-20 · R4:37 | 表属主错位 | CARRIES | VERIFY | **ops** — Inspect actual owner/ACL and latest recuts for firm egress authorizations; a migration-name search is insufficient. |
| C-21 · R4:38 | 认领留存路径 | CARRIES | REDESIGN | **runtime** — Claim retention and cancellation belong to durable Work/scheduled execution, with measurable cleanup/recovery rules. |
| C-22 · R4:39 | 唤醒白名单按名 | CARRIES | VERIFY | **runtime** — Check wake allowlist identity/signature against actual callable definitions before recutting. |
| C-23 · R4:40 | 五处凭证 uuid | CARRIES | VERIFY | **runtime** — Trace all credential call sites and receipts; choose one scoped admission contract without inventing authority in model input. |
| C-24 · R4:41 | 两扇例外门 | CARRIES | VERIFY | **accounting** — Revalidate current journal read and notification exceptions, including callers, before retiring an API. |
| C-25 · R4:42 | 空转绿灯门 | PARTIAL/DRIFT | VERIFY | **accounting** — Retest null financial dates, empty populations and tie/readiness semantics against current close rules; UNKNOWN is not automatic readiness. |
| C-26 · R4:43 | 限额伪 upsert | CARRIES | VERIFY | **ops** — Prove partial limit updates preserve sibling fields, then fix at the public operation boundary if reproduced. |
| C-27 · R4:44 | 写手名册无继任 | CARRIES | VERIFY | **quality** — Retain writer inventory/ownership accountability but replace obsolete ceremony-state pins with current interfaces. |
| C-28 · R4:45 | 大额门槛无门 | **OBSOLETE** | REPLACED | **accounting** — Do not rebuild a self-service high-amount approval wall; implement the already accepted ordinary-execution authority model. |
| C-29 · R4:46 | 期末存货生产者 | CARRIES | VERIFY | **accounting** — Closing-stock evidence/producer must be represented for relevant clients; do not simulate missing stock with a balancing journal. |
| C-30 · R4:47 | 期初试算表生产者 | CARRIES | REDESIGN | **accounting** — Opening balances require provenance, mapping, business objects and tie-out; old review-gated rollout labels do not define the new ceremony. |
| C-31 · R4:48 | 角色普查 CI 半 | CARRIES (already closed) | VERIFY | **ops** — CI role census and live migration-role survival are separate; check current CI changes and retain the live regression. |
| C-32 · R4:49 | dr-verify 4.6 幻影 | DRIFT | VERIFY | **quality** — Reinspect DR ACL measurement and current helper shape; old line count is not a design constraint. |
| C-33 · R4:50 | DB 残项十条 | CARRIES | VERIFY | **accounting** — Expand the ten named DB residuals from historical handover part2 into the relevant operation/security acceptance; none silently disappears. |
| C-34 · R4:51 | 对账器三条 | CARRIES | VERIFY | **runtime** — Reinspect expired-count overwrite, leader halt handling and connection errors from the three-item historical residual. |
| C-35 · R4:52 | runId 被覆盖 | DRIFT | VERIFY | **runtime** — Check task metadata runId writes versus durable Work ownership and preserve correct old-run identity. |
| C-36 · R4:53 | 提示词五项 | CARRIES | REDESIGN | **runtime** — Version instructions/skills/tools and evaluate real error recovery; OCR ordering and numeric invariants are not fixed by prompt prose alone. |
| C-37 · R4:54 | OFX 与 XLSX | CARRIES | VERIFY | **documents** — Confirm supported OFX/XLSX intake against actual extractors and fixtures; no support promise from a filename alone. |
| C-38 · R4:55 | 冻结注释旧引 | CARRIES | VERIFY | **quality** — Correct obsolete references when changing owning tests; preserve frozen historical workflow bodies. |
| C-39 · R4:56 | 五项能力缺口 | PARTIAL | REDESIGN | **accounting** — Map remap, schedule replacement/history and document-supported opening flow to direct UI plus Clara; thread switching alone never closes the group. |
| C-40 · R4:57 | 已有门缺 UI | CARRIES | REDESIGN | **bank** — Fill the named exception/reconciliation actions using complete domain operations and supported receipts. |
| C-41 · R4:58 | 无前端家的门 | CARRIES | REDESIGN | **knowledge** — Place identity/alias/fact operations in Knowledge and onboarding as accepted; no requirement for one button per database function. |
| C-42 · R4:59 | 裁-132 系后续 | PARTIAL | REDESIGN | **chat** — Cover provisional stream, parked-question reload, route errors and conversation recovery using independent Work identity. |
| C-43 · R4:60 | ⌘K 两处缺口 | **FIXED** | REDESIGN | **ui** — Retain scoped command navigation and client switching; old deployed claim requires new route verification. |
| C-44 · R4:61 | FS-9 两项 | DRIFT | REDESIGN | **ui** — Use actual field validation/focus/disabled-state semantics and measure the rebuilt routes; old raw counts are not acceptance. |
| C-45 · R4:62 | 前端零碎项 | PARTIAL | REDESIGN | **ui** — Keep truthful copy, consistent localization and typed concurrency/budget feedback; missing-key lint is not a hardcoded-string ban. |
| C-46 · R4:63 | 报表链路 | CARRIES | REDESIGN | **reports** — Request→evaluate→seal→render→download is one attributable result path with recovery and permissions. |
| C-47 · R4:64 | 重渲染 DR 演练 | CARRIES | VERIFY | **ops** — Re-render restore drill needs a sealed artifact, matching template/version and deterministic evidence; canary setup is insufficient. |
| C-48 · R4:65 | F-A4/F-A7b 未建 | CARRIES | VERIFY | **accounting** — Expand historical F-A4/F-A7b work against present Close/Onboarding scope and source; don't resurrect old design sets wholesale. |
| C-49 · R4:66 | 薪资与联网车道 | CARRIES | EXTERNAL | **accounting** — Tax/payroll/connected-filing vendor and legal scope remain explicit inputs; local reference tables do not establish an issuing engine. |
| C-50 · R4:67 | 运行跑道三门 | STALE | VERIFY | **reports** — Re-census current artifact populations and readiness; pre-reset subjects are stale, not proof that present reporting gates pass. |
| C-51 · R4:68 | F6–F9 台账 | CARRIES | VERIFY | **reports** — Recover six F6–F9 items from historical source and bind them to current artifact/authority/verification obligations. |
| C-52 · R4:69 | 访谈 v3 残项 | CARRIES | REDESIGN | **knowledge** — Use common Work questions, applicable fields, normalization and run-aware error handling for onboarding. |
| C-53 · R4:70 | COA PR-d/PR-c | CARRIES | REDESIGN | **accounting** — COA template/apply/plan/drift operations need coherent direct UI and Clara behavior; preserve reference history and correctness. |
| C-54 · R4:71 | owner 批次五项 | OWNER-ACT | EXTERNAL | **commercial** — Recover the five exact owner choices before treating any as accepted; obsolete meeting labels are not current scope. |
| C-55 · R4:72 | OQ 长尾 | CARRIES | VERIFY | **accounting** — Recover historical OQ contents, compare with accepted current contracts and flag only remaining scope-changing choices. |
| C-56 · R4:73 | owner 产品决定 | OWNER-ACT | EXTERNAL | **commercial** — Separate product/pricing choices from PITR spending and restore evidence; no inherited approval from a dated HOLD. |
| C-57 · R4:74 | 存储授权电池 | CARRIES | VERIFY | **ops** — Revalidate storage grants, row isolation and API access at the current actual role surface. |
| C-58 · R4:75 | 无外部告警 | CARRIES | EXTERNAL | **ops** — Observe current uptime/alerting configuration before claiming absence; any new notification/service target needs the corresponding setup. |
| C-59 · R4:76 | gitleaks 未限域 | CARRIES | SOURCE (E8) | **quality** — Current lint keeps full-history secret scanning on push and scoped PR scanning; narrow it only with a justified policy change, not as a presumed bug. |
| C-60 · R4:77 | 破坏性测试助手 | **WRONG** | VERIFY | **quality** — Preserve existing destructive-test guards; the residual is an estate-wide coverage check, not re-adding two already guarded examples. |
| C-61 · R4:78 | Node-20 三动作 | CARRIES | VERIFY | **ops** — Read current GitHub action runtimes/official support before upgrading; Node runtime migration must not rely on a dated warning. |
| C-62 · R4:79 | 两套 op_key | CARRIES / OWNER-ACT | REDESIGN | **runtime** — Operation identity must survive retry and preserve actor attribution; compare supported wrappers, not fresh-vs-deterministic key slogans. |
| C-63 · R4:80 | 确认 CSRF 复测 | CARRIES | VERIFY | **commercial** — Run current auth callback identity, secret-redaction and single-use replay checks; this is behavior evidence, not an inferred code fix. |
| C-64 · R4:81 | 工作树与 VHDX | DRIFT / OWNER-ACT | VERIFY | **quality** — Re-inventory actual worktrees/disk before any cleanup; old counts and VHDX assumptions are stale. |
| C-65 · R4:82 | 消失的 SKILL 编辑 | OWNER-ACT | VERIFY | **quality** — Check current skill/config changes and preserve user edits; missing historical edits do not authorise replacing the current harness. |
| C-66 · R4:83 | 排空助手无断言 | CARRIES | VERIFY | **quality** — Test drain helpers on progress/deadline/failure and explicit cleanup outcomes instead of fixed iterations. |
| C-67 · R4:84 | 两个 CI 形状 | CARRIES | VERIFY | **quality** — Current CI changed since the old report; remeasure bail/concurrency behavior rather than restoring the old two-shape proposal. |
| C-68 · R4:85 | harness-links 盲点 | CARRIES | REPLACED (E10) | **quality** — The cited harness-links module was removed; preserve useful link-integrity behavior at current SOT boundaries instead of patching a nonexistent path. |
| C-69 · R4:86 | parts 字段级奇偶 | CARRIES | VERIFY | **chat** — Test native tool/result shape compatibility at field level as well as message-kind coverage. |
| C-70 · R4:87 | 部署版本闭锁 | PARTIAL | VERIFY | **ops** — Build-info exists; deployed web/runtime version compatibility, rollout order and rollback inventory still need actual checks. |
| C-71 · R4:88 | 全所读取封顶 | CARRIES | VERIFY | **quality** — Make test reads target their fixture and examine capped production reads for coverage/freshness, not only page size. |
| C-72 · R4:89 | 清理链未强制 | CARRIES | VERIFY | **quality** — Make rig cleanup observable and bounded to owned targets; no recursive deletion of inferred paths. |
| C-73 · R4:90 | 负载相关仪器 | CARRIES | VERIFY | **quality** — Use progress-aware intake tests under representative load; do not disguise timeouts as product success. |
| C-74 · R4:91 | 裁-110 无台账 | **WRONG** | REPLACED | **quality** — A missing old ruling number is not a current product requirement; retain the substantive cross-package guard review if still applicable. |
| C-75 · R4:92 | 日期触线族 | CARRIES | VERIFY | **quality** — Keep monotonic version/frozen-export assertions and refresh current migration/deploy evidence; old ceremony pins may be stale. |
| C-76 · R4:93 | Beta 边界仪器 | CARRIES | VERIFY | **quality** — Recover useful quality/interface/document-maintenance obligations; a recurring agent is not automatically installed by an old suggestion. |
| C-77 · R4:94 | 09-01-pm 十项台账 | PARTIAL | VERIFY | **quality** — Expand the ten-item follow-up ledger; preserve fixed dialog refusal behavior and remeasure remaining polling/security/CI items. |
| C-78 · R4:95 | P4-7 magiclink | OWNER-ACT | EXTERNAL | **commercial** — Magiclink remains a product/auth choice, not permission to weaken a fail-closed registration flow; compare current onboarding intent. |
| C-79 · R4:96 | 八个无家动词 | CARRIES | REDESIGN | **knowledge** — Map the eight homeless verbs to meaningful user goals; unify aliases/facts/capabilities under current scope and access controls. |
| C-80 · R4:97 | 锁序不对称 | CARRIES | VERIFY | **ops** — Check current invite/member lock order and revocation at commit; use a concurrent test before a narrow migration. |
| C-81 · R4:98 | δ 五条残项 | CARRIES | VERIFY | **reports** — Expand five δ residuals and separate timeout/label/policy/headroom facts from the adopted reporting scope. |
| C-82 · R4:99 | η 四条残项 | CARRIES | VERIFY | **reports** — Expand four η residuals, including blank keys and policy windows; don't silently inherit Windows-only tooling. |
| C-83 · R4:100 | 未记录义务 ~18 | CARRIES | VERIFY | **quality** — Recover unrecorded historical obligations and compare each with current decisions; a deleted PROGRESS file does not dispose them. |
| C-84 · R4:101 | wiki 门读注释 | CARRIES | VERIFY | **quality** — Inspect the current SQL-boundary analyzer and add a meaningful dollar-quote/comment fixture if the false positive remains. |
| C-85 · R4:102 | F-A7 γ 三条 | CARRIES | VERIFY | **documents** — Trace classify/firm-egress consumption and onboarding origin through current writers; a read-only state RPC cannot supply missing consumption. |
| C-86 · R4:103 | 晨审两个继任 | CARRIES | VERIFY | **knowledge** — Preserve identity unmerge/history and typed budget feedback where supported; old microbenchmarks do not prove current implementation. |
| C-87 · R4:104 | Mobbin 视频通看 | CARRIES (partly consumed) | VERIFY | **ui** — Current Mobbin evidence lists inspected frames, not full video viewing; retain the requested relevant remaining flow/motion research explicitly. |
| C-88 · R4:105 | 四个小集合 | CARRIES | VERIFY | **quality** — Expand the four sets (16 subitems) from historical part3; distinguish observability, metering, CAS, DR and tooling, with separate acceptance. |

## Additional known issues from disposition §8

These are additional inputs, not silently included in the 216 total. Duplicates retain one obligation.

| Source item | Disposition / next action |
|---|---|
| F-03 TLS refusal and configured-lane readiness | VERIFY: README correctly says non-verifying modes warn. Specify and test required startup/readiness behavior; live secrets not inspected. |
| F-04 classifier engine-id pin | Version admission and executable engine together with extraction/classifier migration. A model string change alone is insufficient. |
| F-05 checkout mock | VERIFY: fs4-checkout-mock.mjs:100-106 logs every POST RPC before dispatch. Check unmatched-route behavior/parallel fixtures; preserve parse-after-match instead of permanent workers=1. |
| Retired filing leaves an orphan question | Carry into shared source/question lifecycle; inspect latest retire door and terminate only obsolete questions while retaining useful basis. |
| COA seeded before cancelled onboarding | Require actual current affected rows before data repair; retain cancel/restart regression. |
| Runtime README outdated | Partly REPLACED by current README (E9). Verify commands/health/evaluation detail when changing it; don't restore old prose wholesale. |
| Web README size/split | Re-read current file and preserve pre-existing owner edits. An old 500-line rule is not assumed current. |
| Two stale code comments | Re-read current identifier/layout source; identifier-promotion-row.tsx changed after the report. Fix surviving misleading text only. |
| Q-07 table coverage, parse-after-match, scoped selectors | Carry as concrete browser acceptance with redesigned journeys and mock dispatch. |
| Classifier recall baseline | Keep held-out real fixtures/per-kind errors distinct from ordering tests; don't invent a threshold or call scripted fixtures model accuracy. |
| H-43 verify-full rollout | Same H-43 obligation, not a duplicate ticket; certificate packaging is not verified live DSN enforcement. |
| Referenced F-01 tax access, F-02 sales surface, F-06 CSS size | Keep tax read/schema coverage, default-agentic sales and token maintainability in their domains; no unused switch or cosmetic split merely from the old label. |

## Earlier recommendation reconciliation

D-1…D-20 are historical remedies, not 20 freshly authorised choices. Current map decisions govern.

- D-1 bulk closure and D-20 dated tests are not current completion evidence.
- D-2 ordering diagnosis is retained. D-3/D-17 small-UI lane proposals become coherent onboarding/Knowledge/Work slices; missing wires still matter.
- D-4/D-5 old approval/consent tests are reconciled with current automatic execution and actual authority; a withdrawn ruling is not fresh runtime or legal authority.
- D-6/D-7/D-13/D-14 keep separate legal/provider/security/restore inputs. This research purchases nothing and changes no provider settings.
- D-8/D-9/D-11/D-12/D-19 follow the accepted frontend/component/dashboard/A+B contracts. UI-02 is no longer dismissed because one card was unspecified: every relevant frontend detail is explicitly requested.
- D-10/D-15 distinguish supported report/artifact output, ordinary conversation export and statutory wording. Do not promise arbitrary export or silently resurrect a prior deferral.
- D-16 explanations become in-context state/recovery guidance and maintained operational docs. D-18 orphan repairs require current row identity/evidence first.

## Audit input handoff and remaining implementation validation

The [formal spec](https://github.com/BELCORT-SDN-BHD/clara/issues/612) is now published. Its linked audit/nested appendices preserve this input for /to-tickets; concrete ticket mapping and implementation remain outstanding.

1. All 216 historical IDs have an initial refresh disposition and named next action; **current implementation/hosted validation is not complete**. VERIFY and external items remain explicit discovery/validation obligations at the highest relevant seam. Classification does not make an old proposed fix automatically ready-for-agent.
2. The [nested obligation recovery](refresh-2026-09-08-audit-nested-obligations.md) expands all fifteen requested umbrella anchors into 157 primary leaves plus four adjacent leaves, **161 total including duplicates**. Related actions are not silently collapsed. PR #231's two vague nits were recovered; named current-source discovery remains for firm setup and legacy opening/subledger mechanisms. These are actionable inputs to the formal spec, not a reason to re-ask settled product decisions.
3. The [runtime route is resolved](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5588548302). Production integration, replay/delivery/cutover and hosted tests are named implementation gates. The owner [resolved direct-debit scope](https://github.com/BELCORT-SDN-BHD/clara/issues/611#issuecomment-5588831144): include observed-debit bookkeeping/settlement and authorised accounting plans; keep actual payment initiation and mandate management as future scope. The original-prompt coverage pass has no unanswered product choice remaining.
4. This classification/recovery input is now ready for synthesis. The formal spec must explicitly retain, supersede, defer under current PRD scope or require discovery for each obligation; no dropped row is inferred from silence. The reviewed /to-tickets split then assigns concrete work and verification. This register does not publish that split; the cross-phase audit issue stays open through issue creation.
