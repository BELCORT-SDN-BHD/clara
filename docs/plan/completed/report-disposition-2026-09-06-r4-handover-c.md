# Report disposition record — R4-handover-C

The per-item disposition of the beta handover's CARRIED registry (C-01 … C-88), as measured **2026-09-06 on `main` at `fc39c361`** by a
read-only opus-5 lane under 裁-190. The owner's decisions are recorded in `PROGRESS.md`; this is a
CLOSED record, filed verbatim so the measurement can be re-read against the tree it was taken on.
**TWO CLAIMS BELOW DID NOT REPRODUCE when the docs-sync lane re-read them on `main` at `95441fe6`:
C-74 lives in the handover's PART 2 at `:380`, not part 3; and C-44's "26 raw `aria-invalid`
occurrences" measures 15 across 11 files** under `apps/web` (mostly Tailwind `aria-invalid:` state
variants inside the shadcn primitives, not rendered attributes), 41 repo-wide tracked — so the row's
own advice applies to itself and the number must be re-measured, never re-quoted. The
`confirmDisabled=` count of 70 does reproduce. The verbatim block is byte-identical to the source
and is not edited; this sentence is the correction.

<!-- begin verbatim: R4-handover-C.md · md5 6cf51adea1777f6e86c1f355916a71b2 -->
# R4 · Disposition of the CARRIED REGISTRY C-01 … C-88

**HEAD** `fc39c361` (`docs(rulings): 裁-200 — the owner's /grillwithdocs line, recorded (#562)`)
**Written** Sun Sep 6 01:44:59 MPST 2026 · read-only lane, native opus-5 xhigh, 裁-190.
**Baseline for "serving"**: runtime v75 + Worker `90c1a5d0` from `0351f022`, deployed 2026-09-05;
migrations 0165–0176 applied. Sources: the three handover files, `PROGRESS.md`, PRs #543–#563,
`docs/plan/active/mohe-grill-rulings-2026-09-04-pm.md`, and reads of the named anchors.

*"anchor untouched" = `git log 877a4fd7..fc39c361 -- <path>` empty AND the named line still reads as
the row states. Absence is stated as "not found at <where I looked>", never as "does not exist".*

---

## The table

| id | group | 标题 | Disposition | Evidence | What remains / restated | Queue | 推荐 |
|---|---|---|---|---|---|---|---|
| C-01 | product | 上市路线图 | OWNER-ACT | 裁-148 · 150; `PROGRESS.md` Next item 3 | Pricing sitting (裁-58) gates everything downstream | unqueued | 先开定价会 |
| C-02 | db/runtime | 计费层与用量账 | CARRIES | no `ai_usage`/token-ledger file among 0165–0176 (`ls packages/db/migrations`) | Ledger + lifecycle first; ≈6–10 units | unqueued | 等定价后再建 |
| C-03 | web | C-2 运营屏 | CARRIES | anchor untouched; two doors still zero-caller | Build beside the unclaimed-payment queue | unqueued | 实币前必建 |
| C-04 | runtime | 连接池错误约定 | **FIXED** | #558; `packages/runtime/lib/pool-error-contract.mjs` + `relay.mjs`; contract in `docs/ARCHITECTURE.md` §4.3; 裁-149 clause-2 erratum in #559 | Serving at v75. §C.5's ARCHITECTURE truing is executed | done | 关闭该行 |
| C-05 | db/runtime | G1 PR-2 自治二层 | CARRIES | anchor untouched; `/ready` still shows 裁-165's held counter | Two producers + eight DB items + retention | unqueued | 保持 OFF |
| C-06 | legal | Beta 服务条款 | OWNER-ACT | 裁-129 · 166; `PROGRESS.md` Q-09 (CB-001) | `kind` discriminator + lawyer's pass | Q-09 | 律师会前先定 kind |
| C-07 | web (sec) | XML 同源执行 | **FIXED** | #555; `apps/web/lib/documents/bytes.ts` `VIEWABLE_IN_NEW_TAB` + `open-in-new-tab.ts` gate; serving at Worker `90c1a5d0` | CSP is report-only (11 violations measured); **enforcing CSP is a NEW row, unqueued** | done | 新开 CSP 行 |
| C-08 | web | 裁-176 十项 | CARRIES | `apps/web/components/registers/staff-advances-register.tsx:45` still `businessToday()` | All ten stand, incl. the live advancesApi defect and the dbSeamCensus rebuild | unqueued | 先修 advancesApi |
| C-09 | db/ops | 结账/webhook 后续 | CARRIES | #544 added the key-class gate only; postverify role list and the refusal-trace relation not found in 0165–0176 | `clara.stripe_event_refusals` shape is filed; costs three pin re-cuts | unqueued | 实币前必做 |
| C-10 | db | livemode 与滞留付款 | PARTIAL | `packages/runtime/lib/stripe-livemode.mjs:1-27` (#511 `344f7ad8`, 2026-09-03) refuses a mode-mismatched event **before** `record_stripe_event`; #544 extends it to the web arm | Clause 1's premise is stale — the gate exists at the route; the stored column stays deliberately unread. **Clause 2 (stranded payment) carries** | unqueued | 只留滞留付款半边 |
| C-11 | runtime | SSE 轮询再鉴权 | **WRONG** | `packages/runtime/src/streamRoute.ts:64-88` re-runs `authenticate` + `assertTaskStreamAccess` in the poll's own checkout, closing with a `revoked` event; shipped #511 `344f7ad8` (2026-09-03), labelled "B-M3 (security pass, 2026-09-02)" | Row's premise false since before the handover was written | close | 直接删行 |
| C-12 | runtime | /ready 硬存储门 | CARRIES | #460 still archived; anchor untouched | 裁-61 re-opens with the PR | unqueued | 与 C-57 同批 |
| C-13 | db/runtime | 归档后端队列 | CARRIES | six PRs still closed; anchor untouched | One lane each, from the resume note | unqueued | 逐个复活 |
| C-14 | ops | R2 还原演练逾期 | OWNER-ACT | 裁-163; #552 added `clara.dr_canary_subjects` (H-49) which does **not** touch the restore drill | Overdue since 2026-07-22; the pre-reset DB survives only in an unproven bundle | unqueued | 尽快排期 |
| C-15 | db | bigint 线边界 | PARTIAL | Web half DONE: `apps/web/lib/parts/types.ts:286` and `apps/web/lib/reports/types.ts:65` are `string`. DB half open: `packages/db/migrations/0131_f_a6_freeform_read.sql:1266` still emits a jsonb number | Only the `read_id::text` recut remains; a live-writer D1 window | unqueued | 只剩 DB 半边 |
| C-16 | ops | 单机无 HA | OWNER-ACT | ADR-060 / `docs/ops/DR.md`; still one Fly machine | HA spend + external alerting (see C-58) | unqueued | 要花钱，owner 定 |
| C-17 | db | 客户识别码唯一键 | CARRIES | `packages/db/migrations/0007_document_pipeline.sql:235-237` — index still non-unique by design | Handover cites "0007:235"; the file is `0007_document_pipeline.sql` | unqueued | 上量前必做 |
| C-18 | db | Door-2 绕行 | CARRIES | anchor untouched | A small refusing migration | unqueued | 随下条 DB 车 |
| C-19 | db | 约束名盲处理 | PARTIAL | #556 + `packages/db/migrations/0176_counterparty_alias_kind_scope.sql` built the exact map for autoDraft (`autoDraft.v10.uniques.ts`); `packages/db/migrations/0154_binding_proposal_pr_1.sql:2574` **still** relabels every unique_violation `binding_conflict` | One instance closed; the DB-wide sweep carries. **Counts are stale** — re-measure with the row's own instrument, do not quote 99/~15 | unqueued | 按门逐个补 |
| C-20 | db | 表属主错位 | CARRIES | `firm_egress_dispatch_authorizations` not found in 0165–0176 | One owner-repoint migration | unqueued | 顺车带 |
| C-21 | db | 认领留存路径 | CARRIES | `bank_agent_due_claims` not found in 0165–0176 | Rides C-05 | unqueued | 随 G1 |
| C-22 | db | 唤醒白名单按名 | CARRIES | anchor untouched | Signature-bound allowlist | unqueued | 低优先 |
| C-23 | db | 五处凭证 uuid | CARRIES | anchor untouched | Mint a `wake_credential` trigger_kind | unqueued | 第九张收据前 |
| C-24 | db | 两扇例外门 | CARRIES | `get_journal_entry` not found in 0165–0176 | Retire the single-arg door as its OWN migration; keep `record_notification` | unqueued | 单独一车 |
| C-25 | db | 空转绿灯门 | PARTIAL/DRIFT | `packages/db/migrations/0166_close_gate_codeable_population.sql:109-125` re-cut `_close_gate_uncoded` for H-12 but **kept** `financial_date between`, so (a)'s NULL-blindness stands. `0167_close_gate_bank_enrolment.sql` re-cut the **drawer-2** bank gate | Restate (a)'s anchor: `0056:1397` → `0166:…:109`. (c) drawer-1 `tie` at `0056:962` — re-scope against 0167 before building | unqueued | (a) 先修 |
| C-26 | db | 限额伪 upsert | CARRIES | anchor untouched | Partial-column INSERT still resets siblings | unqueued | 随下条 DB 车 |
| C-27 | db | 写手名册无继任 | CARRIES | anchor untouched | A standing census cell | unqueued | 与 C-75 同族 |
| C-28 | db | 大额门槛无门 | **OBSOLETE** | 裁-187 abolishes every attestation ceremony and maker-checker wall (`mohe-grill-rulings-2026-09-04-pm.md:64`); #550 removed the threshold control from the web admin surface | The DB half lands in Q-03's wall-removal lane, not as a new self-serve verb | Q-03 | 归入 Q-03 |
| C-29 | db | 期末存货生产者 | CARRIES | `closing_stock` not found in 0165–0176 | Needed before any real goods-trader close; H-21 owns the other half | Q-01 邻居 | 与 H-21 同批 |
| C-30 | db | 期初试算表生产者 | CARRIES | anchor untouched | Phase-5, review-gated | unqueued | 暂不需要 |
| C-31 | db | 角色普查 CI 半 | CARRIES (already closed) | Closed by measurement in the handover itself; four 13/13 sweeps | The LIVE half is H-47 (Q-08) | Q-08 (live half) | 只留 H-47 |
| C-32 | ops | dr-verify 4.6 幻影 | DRIFT | anchor untouched, but `packages/db/scripts/dr-verify-checks.mjs` now sits at 499 lines against the 500-line write hook (#551 body) | The `aclexplode(coalesce(...))` fix must now split the file first | unqueued | 先拆文件 |
| C-33 | db | DB 残项十条 | CARRIES | anchor untouched | All ten stand | unqueued | 逐条随车 |
| C-34 | runtime | 对账器三条 | CARRIES | anchor untouched | Each its own PR | unqueued | 低优先 |
| C-35 | runtime | runId 被覆盖 | DRIFT | `packages/runtime/lib/reconciler-documents.mjs:451` still `writeTaskMeta(task.taskId, {...task, runId: …})`; #545 edited only the header comments | Restate the site `:450` → **`:451`** (and the sibling at `:480`) | unqueued | 小 PR 即可 |
| C-36 | runtime | 提示词五项 | CARRIES | anchor untouched; #558 sharpened only the classify `bank_statement` prompt | Note the family's diagnosis shifted: H-04's real cause is the classify/OCR race, not the prompt (ceremony as-run §5.1a) | unqueued | 与新 P0 一起看 |
| C-37 | runtime | OFX 与 XLSX | CARRIES | anchor untouched | Trigger = the first OFX-exporting bank | unqueued | 等真文件 |
| C-38 | runtime | 冻结注释旧引 | CARRIES | anchor untouched | Two editable test files still owe the truing | unqueued | 顺手改 |
| C-39 | web | 五项能力缺口 | PARTIAL | Chat session list/switcher **built** (#547, 裁-117, rail header menu). `remap_bank_account_coa` still unwired — `apps/web/components/bank/accounts-section.tsx:8` says so in its own words | Four drops remain: remap control, `p_replaces`/`p_schedule`, plan revision history read, document-tied opening-balance path | unqueued | 逐个补 |
| C-40 | web | 已有门缺 UI | CARRIES | `apps/web/components/bank/exceptions-section.tsx:190` and `.../reconciliation-section.tsx:220` still render `NotBuilt` | Three UI legs | unqueued | 与 C-39 同批 |
| C-41 | web | 无前端家的门 | CARRIES | `clara.create_firm` — no caller found in `apps/web` or `packages/runtime` (only migrations); `counterparty_aliases_visible` not found in `apps/web` | All five clusters stand | unqueued | 先定去留 |
| C-42 | web | 裁-132 系后续 | PARTIAL | Streaming provisional text is now **queued** as Q-12 (裁-197) | Parked-clarify reload, the two route error boundaries, the recovery-session claim all carry | Q-12 (one of four) | 其余三条待排 |
| C-43 | web | ⌘K 两处缺口 | **FIXED** | #553; firm Go rows built from `FIRM_NAVIGATION`/`ADMIN_NAVIGATION` and filtered by `hasNavigationAccess`; Clients group at both altitudes, capped 50 | Serving | done | 关闭该行 |
| C-44 | web | FS-9 两项 | DRIFT | `confirmDisabled=` still 70 occurrences; raw `aria-invalid` occurrences now **26** (was "2 rendered sites") | Re-measure DS-09 with the row's own instrument before quoting a number; DS-15's five unruled recuts carry | unqueued | 先重测 |
| C-45 | web | 前端零碎项 | PARTIAL | A message-key lint landed (#550, `apps/web/scripts/check-message-keys.mjs`) but it is the MISSING-MESSAGE gate (E-4/H-25), **not** Q5's hardcoded-string ban. `refused_concurrency` not found in `document-filings-history.tsx`; `refused_budget` prose still at `apps/web/lib/documents/doors.ts:134` | Q5 ban, the two duplicate-scanner lints, the copy fixes, the `Vary` follow-up | Q-05 邻居 | 并入文案清扫 |
| C-46 | report | 报表链路 | CARRIES | anchor untouched | H-15 is queued; PR-3 download is not | Q-06 (part) | 随 Q-06 |
| C-47 | ops | 重渲染 DR 演练 | CARRIES | anchor untouched; #552 shipped the canary registry only | Unrun until the first sealed artifact; N1/N2/N3 stand | unqueued | 等首件封存 |
| C-48 | report | F-A4/F-A7b 未建 | CARRIES | anchor untouched | Both named in their design sets | unqueued | 大件，排期 |
| C-49 | tax | 薪资与联网车道 | CARRIES | anchor untouched | F-A8 still owes law-28 pass + a named Tier-2 vendor | unqueued | owner 定范围 |
| C-50 | report | 运行跑道三门 | STALE | The row's own subjects were pre-reset-estate documents; the 2026-09-05 ceremony re-applied from scratch | **Re-census Gate P / Gate S / FINCARE against the post-reset estate before acting** — the named documents no longer exist | unqueued | 先重普查 |
| C-51 | report | F6–F9 台账 | CARRIES | anchor untouched | Six items | unqueued | 低优先 |
| C-52 | web | 访谈 v3 残项 | CARRIES | `readClearsError` in `apps/web/lib/interview/useInterviewRun.ts` — its test asserts exactly two positive facts, neither a `runId` check | Build with H-21 (Q-01) and 裁-181's normaliser | Q-01 邻居 | 与 Q-01 同批 |
| C-53 | coa | COA PR-d/PR-c | CARRIES | anchor untouched; three orphan `0156` verbs still trainless | Extend the wording past "0150's nine" to cover `firm_coa_drift` | unqueued | 排一列车 |
| C-54 | product | owner 批次五项 | OWNER-ACT | 裁-127 | Each gets its sitting | unqueued | 一次会开完 |
| C-55 | harness | OQ 长尾 | CARRIES | anchor untouched | ~30 unruled OQs across nine gate records | unqueued | 与 C-83 合并 |
| C-56 | product | owner 产品决定 | OWNER-ACT | 裁-58 gates C-01; R9's PITR HOLD trigger has fired | **R9 PITR HOLD is now DUE** | unqueued | PITR 先决 |
| C-57 | ops | 存储授权电池 | CARRIES | anchor untouched | (b) CI battery over the live grant surface; (c) storage-role re-exam. Cost is now real — beta is live | unqueued | 与 C-12 同批 |
| C-58 | ops | 无外部告警 | CARRIES | anchor untouched; #552's `dr_canary_subjects` is a DR-drill subject registry, not uptime alerting | Nothing pages anyone when the product is down | unqueued | 便宜且高价值 |
| C-59 | ops | gitleaks 未限域 | CARRIES | `.github/actions/lint-suite/action.yml:147-149` — the push arm deliberately carries `--all`; the file's own comment states the coverage trade | Row is accurate as written | unqueued | 保持现状 |
| C-60 | ops | 破坏性测试助手 | **WRONG** | Both named sites are guarded since #498 `d427059f` (2026-09-03): `packages/db/tests/migrate-harness.mjs:139-140` gates `cloneAmbientDatabase`, and `packages/runtime/tests/fs7-v17-chatturn-db.test.mjs:145-158` states "No local reimplementation remains in this file". The "ONE spelling" ask is also done | The general sweep ("every CREATE/DROP under `packages/*/tests` passes a guard") is **unverified here** — nine files still contain the raw phrases; that is the row's honest remainder | unqueued | 改写成普查行 |
| C-61 | harness | Node-20 三动作 | CARRIES | `.github` still pins `actions/checkout@…#v4`, `actions/setup-node@…#v4`, `pnpm/action-setup@…#v4` | Warning-only until GitHub ends the fallback | unqueued | 顺手升 |
| C-62 | harness | 两套 op_key | CARRIES / OWNER-ACT | anchor untouched | Owner sitting; audit `apps/web/lib/reports/api.ts` first | unqueued | 开个小会 |
| C-63 | web (sec) | 确认 CSRF 复测 | CARRIES | anchor untouched | The browser-identity half, `token_hash`-in-logs, single-use replay — a re-MEASUREMENT, not a build | unqueued | 一次复测 |
| C-64 | ops | 工作树与 VHDX | DRIFT / OWNER-ACT | The "TWELVE worktrees, three locked" count is stamped 2026-09-04 06:20 and this session ran ~20 lanes since | **Re-walk `git worktree list`** before acting; the removal primitive and the VHDX compaction stand | unqueued | 先重走一遍 |
| C-65 | ops | 消失的 SKILL 编辑 | OWNER-ACT | anchor untouched | Ask the owner; add a post-lane main-status tripwire | unqueued | 问 owner |
| C-66 | harness | 排空助手无断言 | CARRIES | `packages/db/tests/migrate-harness.mjs` untouched this session | ~25-line cell + the two older instrument carries | unqueued | 小 PR |
| C-67 | harness | 两个 CI 形状 | CARRIES | `.github/actions/db-estate-suite/action.yml` untouched this session | `--no-bail` is uncontroversial; the concurrency question needs a measured before/after | unqueued | 先加 --no-bail |
| C-68 | harness | harness-links 盲点 | CARRIES | `scripts/hooks/harness-links.mjs` untouched this session | The colon rule + the README scope (22 findings, 9 roots) | unqueued | 分两个 PR |
| C-69 | harness | parts 字段级奇偶 | CARRIES | `packages/runtime/scripts/check-parts-parity.mjs:366` still `declaredPartShapes(...).keys()` — kind coverage only | A dropped/renamed FIELD still passes | unqueued | 值得建 |
| C-70 | ops | 部署版本闭锁 | PARTIAL | #558 shipped `/api/build-info` on **both** arms (`apps/web/app/api/build-info/route.ts` + the runtime route) — the version-stamp half | The runtime deploy must READ and COMPARE the deployed web's stamp before rollout; unbuilt | unqueued | 只剩比较半边 |
| C-71 | harness | 全所读取封顶 | CARRIES | anchor untouched | Fix the cell, then census every sibling capped read | unqueued | 普查是重点 |
| C-72 | harness | 清理链未强制 | CARRIES | anchor untouched | The durable fix belongs in `rig-cluster-reset.mjs` | unqueued | 低优先 |
| C-73 | harness | 负载相关仪器 | CARRIES | `packages/runtime/tests/intake-e2e.mjs` untouched this session | Harden with a progress checkpoint next time the file is touched | unqueued | 顺手改 |
| C-74 | harness | 裁-110 无台账 | **WRONG** | `docs/plan/active/mohe-grill-rulings-2026-09-02.md:15` — "裁-110 · RESERVED (recorded 2026-09-02 to close a silent numbering gap)", landed in `33e94855` (#503), **two days before the handover was written** | The row's premise (`git grep 裁-110` returns zero files) is false. The SUBSTANCE carries: the cross-package test-guard proposal is still unruled | unqueued | 改写成"待裁"行 |
| C-75 | harness | 日期触线族 | CARRIES | anchor untouched | Pin the direction; `--lock-deployed` stays blanket | unqueued | 每次仪式扫 |
| C-76 | harness | Beta 边界仪器 | CARRIES | anchor untouched | Quality-score doc, doc-gardening agent, MCP interface pass | unqueued | 可延后 |
| C-77 | mixed | 09-01-pm 十项台账 | PARTIAL | **`DoorDialog.tsx`'s close-polarity bypass is closed** — #549 `90b59cc1` reworked `apps/web/components/reports/DoorDialog.tsx:89-96` (a fresh open resets `attempt`; refusals settle in-dialog), and the PR title says "dialogs stay open on refusal (15 wrappers)" | The other nine stand, incl. the 756-site `settleUntil` sweep and **C-5's three, which are P1 and belong beside C-09** | unqueued | 先做 C-5 三条 |
| C-78 | web | P4-7 magiclink | OWNER-ACT | anchor untouched; #455's 409 still fail-closed | A product decision before it is a build | unqueued | owner 先决 |
| C-79 | db | 八个无家动词 | CARRIES | anchor untouched | Each owes an FS-8 note or a ruling — none may be silent | unqueued | 一次性裁完 |
| C-80 | db | 锁序不对称 | CARRIES | anchor untouched | Rides a later db train | unqueued | 顺车带 |
| C-81 | db | δ 五条残项 | CARRIES | anchor untouched | All five stand | unqueued | 低优先 |
| C-82 | db | η 四条残项 | CARRIES | anchor untouched | All four stand | unqueued | 低优先 |
| C-83 | harness | 未记录义务 ~18 | CARRIES | anchor untouched | Work through §A's table; each closes by a ruling or a row | unqueued | 与 C-55 合并 |
| C-84 | harness | wiki 门读注释 | CARRIES | anchor untouched | Mask the block's own comments + a selftest | unqueued | 小 PR |
| C-85 | db | F-A7 γ 三条 | CARRIES | `onboarding_interview` not found in 0165–0176, so R3's CHECK still refuses that origin; #552's `client_egress_state` is a READ only, so R1/R2 stand | R3 is the one the walk brushed; **P1** | Q-01 邻居 | R3 与 H-21 同批 |
| C-86 | db | 晨审两个继任 | CARRIES | anchor untouched | (3c) un-merge door · (3d) the "budget" refusal prose · two γ NITs | unqueued | 随 0057 批 |
| C-87 | design | Mobbin 视频通看 | CARRIES (partly consumed) | #557 built the firm home "from the Mobbin-informed spec"; the row's own act (裁-4 7d, a viewing pass) is not recorded as run anywhere I looked | Confirm with the owner whether the pass is still owed | unqueued | 问 owner 是否还需要 |
| C-88 | mixed | 四个小集合 | CARRIES | anchor untouched | Sixteen items across four sets; the Tier-A no-trace item is an OBSERVABILITY candidate, not a wall gap | unqueued | 逐条随车 |

---

## (a) Counts

**By disposition:** FIXED **3** (C-04, C-07, C-43) · PARTIAL **9** (C-10, C-15, C-19, C-25, C-39,
C-42, C-45, C-70, C-77) · DRIFT **4** (C-32, C-35, C-44, C-64) · STALE **1** (C-50) ·
WRONG **3** (C-11, C-60, C-74) · OBSOLETE **1** (C-28) · OWNER-ACT **8** (C-01, C-06, C-14, C-16,
C-54, C-56, C-65, C-78) · CARRIES **59**. Total **88**.

**By group** (a row counted once, in its handover group):

| group | rows | FIXED | PARTIAL | DRIFT | STALE | WRONG | OBSOLETE | OWNER-ACT | CARRIES |
|---|---|---|---|---|---|---|---|---|---|
| §C.1 pre-launch (C-01…C-16) | 16 | 2 | 2 | 0 | 0 | 1 | 0 | 4 | 7 |
| db (C-17…C-33) | 17 | 0 | 2 | 1 | 0 | 0 | 1 | 0 | 13 |
| runtime (C-34…C-38) | 5 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 4 |
| web (C-39…C-45) | 7 | 1 | 3 | 1 | 0 | 0 | 0 | 0 | 2 |
| report/close/tax (C-46…C-56) | 11 | 0 | 0 | 0 | 1 | 0 | 0 | 2 | 8 |
| ops/DR/sec (C-57…C-65) | 9 | 0 | 0 | 1 | 0 | 1 | 0 | 1 | 6 |
| harness/CI (C-66…C-76) | 11 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 9 |
| part 3 (C-77…C-88) | 12 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 10 |

**Closed or reshaped by THIS session's PRs:** C-04 (#558) · C-07 (#555) · C-43 (#553) ·
C-28 (裁-187 + #550) · C-39 one of five (#547) · C-77's DoorDialog item (#549) · C-19 one instance
(#556) · C-42 one of four queued (裁-197). **Everything else that changed changed by pre-session
work the handover mis-stated, or by tree drift.**

## (b) Where `PROGRESS.md` or the handover is now WRONG or stale

1. **`PROGRESS.md:188-189`** lists "**C-07** the XML `blob:` open with no MIME gate and no CSP
   (裁-175)" in the still-open P0 block, while **`PROGRESS.md:96` in the same file** says C-07
   shipped in #555 and is serving. Correct statement: *C-07 is CLOSED by #555 and serving at the
   2026-09-05 Worker deploy; what remains is a NEW row — flipping the CSP from report-only to
   enforcing, which needs a hashes-or-`unsafe-inline` decision.*
2. **`PROGRESS.md:233-234`** lists "**C-04** the pool error contract (裁-149)" among the open P1
   rows. Correct statement: *C-04 is CLOSED by #558 — `packages/runtime/lib/pool-error-contract.mjs`
   plus the `docs/ARCHITECTURE.md` §4.3 contract — and 裁-149's clause 2 was corrected by erratum
   in #559. Serving at v75.*
3. **`PROGRESS.md:235`** lists "**C-11** SSE re-authorisation" as open. Correct statement: *the poll
   tick re-runs `authenticate` + `assertTaskStreamAccess` at `packages/runtime/src/streamRoute.ts:64-88`
   and closes with an explicit `revoked` event. Shipped in #511 (`344f7ad8`, 2026-09-03).*
   The handover's own C-11 row (part 1, §C.1 table) carries the same false premise.
4. **`beta-handover-2026-09-04-part2.md` C-60** states "two raw-superuser sites remain". Correct
   statement: *both were converted to the shared guarded spelling by #498 (`d427059f`, 2026-09-03) —
   `migrate-harness.mjs:139-140` and `fs7-v17-chatturn-db.test.mjs:145-158`. What is unproven is the
   general sweep over every `CREATE`/`DROP DATABASE`/`DROP ROLE` under `packages/*/tests`.*
5. **`beta-handover-2026-09-04-part3.md` C-74** states "`git grep 裁-110` over `main` returns zero
   files". Correct statement: *裁-110 is authored at `docs/plan/active/mohe-grill-rulings-2026-09-02.md:15`
   as RESERVED, merged in `33e94855` (#503) on 2026-09-02 — two days before the handover was
   written. The proposal itself is still unruled, which is what the row should now say.*
6. **`beta-handover-2026-09-04.md` C-10** states "`livemode` is stored and never read". Correct
   statement: *`packages/runtime/lib/stripe-livemode.mjs` refuses a mode-mismatched event before
   `record_stripe_event` (#511, 2026-09-03) and #544 extends the key-class gate to the web arm; the
   stored COLUMN stays deliberately unread, by that module's own stated design. Only the
   stranded-payment clause carries.*
7. **`beta-handover-2026-09-04-part2.md` C-25(a)** anchors the gate at `0056:1397`. Correct
   statement: *the live body is now `packages/db/migrations/0166_close_gate_codeable_population.sql:109`,
   which kept the `financial_date between` predicate — the NULL blindness is unchanged, but the
   anchor and the sha pin moved.* Same class for **C-35**: the site is `:451`, not `:450`.
8. **`beta-handover-2026-09-04-part2.md` C-44** quotes "2 rendered `aria-invalid` sites". The raw
   tree count is now 26 occurrences against an unchanged 70 `confirmDisabled=`. The row's own advice
   ("count the file, never this line") applies to itself — the number must be re-measured, not
   re-quoted.

## (c) Unsure rows — what I could not settle cheaply

- **C-25(c)** — `0167_close_gate_bank_enrolment.sql` re-cut the **drawer-2** bank gate and its header
  names the empty-registry case; C-25(c) is the **drawer-1** `tie` at `0056:962`. Whether 0167
  changed drawer 1's behaviour needs a read of `_close_gate_*` drawer 1, which I did not do.
- **C-60's sweep half** — nine files under `packages/db/tests` and `packages/runtime/tests` still
  contain `create database` / `drop role` phrases. Whether every one routes through
  `assertDestructiveAllowed` needs a per-site read.
- **C-87** — #557 shipped a "Mobbin-informed spec", so the research may already be consumed; I found
  no record that 裁-4 7d's viewing pass itself was run or waived.
- **C-19's counts** — "99 handlers / ~15 read `constraint_name`" cannot be reproduced with a raw
  grep (I get 123 / 62 including 0176's new map). The row's instrument is unknown to me.

## (d) Three owner decisions among the C rows (大白话)

1. **CSP 要不要「真开」？** C-07 的门已经关上了（XML 不能再在我们自己的域里跑脚本），但那道更宽的
   内容安全策略现在只是「报告模式」——它会记录违规，不会拦。实测这一趟走下来有 11 条违规，全是
   Next 自己的内联脚本和样式。要真开，就得允许 `unsafe-inline`（等于放掉一半价值），或者改成按
   响应算哈希（要动构建）。**建议：先按哈希做，排在实币开关之前。**
2. **R9 的 PITR（时点恢复）现在到期了，开不开？** C-56 里说触发条件是「beta 前的检查表」，那个条件
   已经满足。同时 C-14 的月度还原演练从 2026-07-22 起就逾期，重置前那份数据库现在只活在一个**没有
   验证过能不能解密**的 R2 备份里。**建议：先花半天把还原演练跑一次，再决定 PITR 要不要花这个钱。**
   这两件事一起做最划算。
3. **裁-187 把「双人复核墙」全废了以后，`high_stakes_amount_cents`（大额门槛）还要不要留？**
   前端的控件已经在 #550 里拿掉了，但数据库里这个字段和它的部署脚本还在。**建议：并进 Q-03 那条
   拆墙的数据库车，一次性决定是删掉、还是降级成一个只用来提示的数字。** 不要单独再造一扇门。
<!-- end verbatim: R4-handover-C.md -->
