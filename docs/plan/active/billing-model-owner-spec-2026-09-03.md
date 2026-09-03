# Billing model — the owner's specification, filed verbatim (2026-09-03)

**Owner's specification, verbatim — a design INPUT, not a design of record.**

**Date:** 2026-09-03. **Status:** filed, to be grilled into a design doc before any build
(hard constraint 6 — grill until crystal-clear before a non-trivial build; ambiguity is resolved
before code, not during review).

**Status (裁-144, owner, 2026-09-03 ≈15:18 MYT):** BACKLOG — the tier tranche of
`docs/plan/active/billing-design.md` §5 (the rest of PR-1, all of PR-2, plus an AI usage ledger)
is completed BEFORE the official paid launch, not before beta live; beta live launches on the
built half (Checkout + webhooks + the admission gate + `billing_plans` at RM0). The ledger entry
for this ruling lands in a sibling PR, not here.

**Scope note:** beta stays "one base subscription via Stripe Checkout" — 裁-57 (beta is a paid
launch) / 裁-58 (the amounts are not yet ruled → RM0, free until the pricing sitting) / 裁-126
(the Stripe sandbox account covers the whole beta). This spec is a post-beta design input; it
does not change beta scope.

**Constraint 2 note:** every billing figure is DB-owned (`docs/product/PRD.md` §6) — Clara
computes each invoice line through a versioned deterministic evaluator over DB-owned inputs;
Stripe collects, it never originates a number. Related: PRD §8's "Billing/subscriptions"
scope-note cell (裁-71④) and question B3 on the owner page.

**Related:** the 08-30 brief `docs/plan/active/billing-model-brief-2026-08-30.md` renders
裁-42's billing model as **①–⑦ plus one LAW** (already carrying this same model in substance) —
today's text is the owner's RE-SEND of it, not a second version. The design of record
`docs/plan/active/billing-design.md` (v1, 2026-08-30, gate OPEN) re-cuts the same model as
**①–⑩ plus LAW** (its own line ~55 records "the tier tranche is unbuilt", and its PR ladder at
~390-404 is unbuilt behind that gate), with `docs/plan/active/billing-annexes.md` (decisions
D1-D12) and `docs/plan/active/billing-gate-record.md` (the eight owner cards).

**Measured delta against the 08-30 brief's §1, clause by clause** (candidates checked: the
payments-only free user, the Draft-client restrictions, the reactivation rules, the "click
Delete ≠ stop charging" rule, the invoice line list including tax, the mid-month proration
rules): two items differ; everything else is identical in substance.

1. **Draft-client restrictions.** The brief's "capped" names the three CAPABILITY caps — no bulk
   documents, no AI, no posting — stated as an absolute "cannot" (`billing-design.md` §3.9
   confirms: 裁-42⑩'s three draft caps already stand, measured). Today's text restates the
   AI/posting limit as a softer instruction instead ("不应该允许长期储存大量文件、运行 AI 或正式
   处理账务" — *should not* allow long-term bulk-document storage, running AI, or formal
   bookkeeping). The delta is only this modality shift (absolute → recommended) — the brief
   never stated a numeric cap on the number of draft clients, so there is none to drop.
2. **Deleted/Purged build sequencing.** Today's text adds an explicit sequencing instruction the
   brief does not carry: the actual permanent-deletion function may be built later, but the
   billing state and logic must be preserved now ("实际永久删除功能可以之后再完成；现阶段先保留这个
   计费状态和逻辑").

Everything else — the payments-only free seat, the shared per-paid-seat AI allowance, archived-
client retention with the never-both-fees rule, reactivation needing a free slot, "click Delete ≠
stop charging" until purge, mid-month proration of both the fee and the allowance, and the
nine-line invoice structure including tax — is identical in substance to the 08-30 brief §1.

**Additive detail, not a changed rule:** today's text also itemises the archived-client
retention list — accounting records, uploaded documents, OCR results, reports, audit history,
search data, and database/file storage (below, "Archived Client 保留的资料可能包括") — and states
"不可以恢复" (cannot be restored) for a purged client explicitly. Neither line appears in the
08-30 brief; the retention list is new input for OQ-7 (retention priced per client or per GB) at
the grilling.

This delta, not the whole model, is what the grilling in constraint 6 has to resolve before any
build.

---

The owner's text, exactly as captured, follows below without alteration.

---

# Clara billing model — the owner's specification (verbatim, 2026-09-03 ~15:25 MYT)

Context: posed while ruling B3 (PRD §8's seat / Active-Client / AI-allowance / issue_invoice lines have zero code).
The owner's words: 「为什么一行代码都没有? 所以是怎样我们的beta uiux? 这个是关于我们的收费模型right?」 followed by the
specification below, quoted byte-for-byte. Disposition: a design INPUT for the post-beta billing wave; the beta
scope stays "one base subscription via Stripe Checkout" (裁-57 paid launch; 裁-58 price not yet ruled → RM0;
裁-126 sandbox for the whole beta). To be filed under docs/plan/active/ as-is (owner's spec), then grilled
(constraint 6) into a design doc before any build. Constraint 2 applies: every billing figure is DB-owned —
Clara computes the invoice deterministically; Stripe collects.

---

我们要做的收费模式类似 Vercel，但计费对象是整个 **Firm / Organisation**，不是单独用户。

一个 Firm 的月费由以下部分组成：

```text
月费 =
基础订阅费
+ 额外付费用户费
+ 额外 Active Client 费
+ Archived Client 保留费
+ AI 超额使用费
```

价格暂时不要确定，先把所有价格和包含数量做成可配置。

### 1. 基础订阅

每个 Firm 需要一个基础订阅。

基础订阅包含：

- 一定数量的付费用户
- 一定数量的 Active Client Company slots
- 一定数量的 AI usage allowance

例如将来可以设定基础方案包含 1 个付费用户和 5 个 Active Clients，但现在不要写死数量。

### 2. 用户收费

以下可以操作 Firm 资料的用户属于付费用户：

- Owner
- Admin
- Bookkeeper

Viewer 或只能管理付款的用户可以免费。

如果 Firm 增加付费用户，就增加相应的 monthly seat fee。

购买的是用户容量，不是绑定某一个人。例如 Firm 购买了 3 个 seats，其中一个员工离职后，可以换成另一个员工，不需要重新购买。

### 3. 每个付费用户增加共享 AI allowance

每增加一个付费用户，Firm 就会获得一份额外的 AI usage allowance。

这份 allowance 属于整个 Firm，共享给 Organisation 内所有用户和 Clients，不是属于该名用户个人。

计算方式：

```text
Firm 每月 AI allowance =
付费用户数量 × 每个付费用户包含的 AI allowance
```

例如未来设定每个付费用户包含 RM50 AI usage：

```text
4 个付费用户 = Firm 每月共享 RM200 AI allowance
```

任何用户都可以使用这个共享额度。

### 4. Client Company 收费

Client Company 有以下主要状态：

```text
Draft
Active
Archived
Scheduled for deletion
Deleted/Purged
```

#### Draft Client

Draft Client 不收费，也不占 Active Client slot。

但 Draft 只能用于建立基本资料，不应该允许长期储存大量文件、运行 AI 或正式处理账务。

#### Active Client

Active Client 会占用一个 Active Client slot。

基础订阅包含一定数量的 Active Client slots。超过包含数量后，每增加一个 Active Client，就增加额外月费。

计算方式：

```text
额外 Active Client 数量 =
Active Client 总数 - 基础方案包含数量
```

购买的是 Client capacity，不绑定特定 Client。

例如 Firm 已购买 10 个 Active Client slots，只要同时 Active 的 Client 不超过 10 个，就可以替换 Client，不需要重复收费。

#### Archived Client

Archived Client 不占 Active Client slot，因此释放出来的 slot 可以给另一个 Active Client 使用。

但是 Archived Client 的资料仍然保存在系统中，所以需要收取较低的 archive retention fee。

Archived Client 保留的资料可能包括：

- Accounting records
- Uploaded documents
- OCR results
- Reports
- Audit history
- Search data
- Database及文件储存

因此 Archived Client 不是免费，只是收费低于 Active Client。

同一个 Client 在同一段时间内不能同时收 Active Client fee 和 Archive retention fee。

建议收费转换方式：

- Client 被 Archive 的当月，不退回已经产生的 Active Client 费用
- 从下一个账单周期开始，改收 Archive retention fee
- Archive 后立即释放 Active Client slot

#### Reactivate Archived Client

如果 Archived Client 被重新启用：

- 停止收取 Archive retention fee
- Client 重新占用 Active Client slot
- 如果 Firm 没有足够的 Active Client capacity，就需要增加 slot
- 不能同时收 Archive fee 和 Active fee

#### Scheduled for deletion

用户点击 Delete 后，Client 先进入 `Scheduled for deletion`，不要立刻停止收费。

因为在资料真正删除前，系统仍然需要保存这些资料，所以这段期间继续收 Archive retention fee。

#### Deleted/Purged

只有 Client 的资料真正从主要系统完成永久删除后，才停止收取 Archive retention fee。

也就是说：

```text
点击 Delete ≠ 停止收费
完成实际删除 = 停止收费
```

删除后的 Client：

- 不占 Active Client slot
- 不收 Archive retention fee
- 不可以恢复

实际永久删除功能可以之后再完成；现阶段先保留这个计费状态和逻辑。

### 5. AI 超额使用费

每个月先计算整个 Firm 的 AI usage。

```text
AI 超额使用费 =
实际 AI usage - Firm 当月共享 AI allowance
```

如果结果小于零，超额费用就是零。

未使用完的 AI allowance：

- 当月底失效
- 不累计到下个月
- 不可以转移给其他 Firm
- 不可以兑换现金或退款

超过 allowance 后，AI 功能继续运行，超出的部分加入当月账单，不需要自动停止服务。

### 6. 月中增加用户或 Client

如果 Firm 在月中增加付费用户或额外 Active Client capacity：

- 新增费用按本月剩余时间计算
- 新用户附带的 AI allowance也按相同比例增加
- 下一个完整月份开始收取完整月费

如果月中移除用户或减少 capacity：

- 当前周期一般不退款
- 减少后的收费从下一个账单周期生效
- 不可以为了降低 capacity 自动 Archive 或 Delete Client

### 7. 最终账单结构

每个月 Firm 的账单应该分别显示：

```text
基础订阅
付费用户数量及费用
额外 Active Client 数量及费用
Archived Client 数量及保留费用
Firm 获得的共享 AI allowance
实际 AI usage
AI 超额使用费
税费
最终总额
```

所有价格、基础包含数量、AI allowance 和收费比例先做成可配置，不要写死最终价格。
