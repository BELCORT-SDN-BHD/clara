# Billing — the gate record

> **The gate card set for the billing design 裁-42 ordered.** §1 records what the design set
> SETTLED, so it is not re-argued. **§2 is the owner's card set** — eight questions, each with
> the context in 大白话, a **recommendation**, its **cost**, and a **fail-closed default** that
> holds until he rules. §3 is what the independent review pass must attack.
>
> Set: [`billing-survey.md`](billing-survey.md) · [`billing-design.md`](billing-design.md) ·
> [`billing-annexes.md`](billing-annexes.md). Input:
> [`billing-model-brief-2026-08-30.md`](billing-model-brief-2026-08-30.md).
>
> **A standing rule this card set obeys** (裁-42's own sitting preamble): *a fail-closed default
> narrows only the UNDECIDED CELL, never the architecture; every one of them is an INFORM the
> owner can flip by saying so; and at **P6's entry gate** every agentic-facing default goes to
> him in ONE list.* None of the defaults below is a ruling he has already given.
>
> **裁-35's definition, applied throughout:** *"fail-closed" is not "pick the worst option" — it
> is the safe-side default while undecided: refuse rather than pass, so an unmade decision can
> never quietly become a wrong number.* For billing that cuts one specific way: **when
> undecided, do not charge, and do not cut anyone off.**

## 1 · What the design set SETTLED (do not re-argue)

- **The transitions 裁-42⑤/⑥ are written on do not exist.** Measured: the live graph is exactly
  two edges out of `onboarding`, and `active`/`archived` are dead ends. The item's real width is
  **four new audited doors**, not a status-column widening.
- **裁-42⑩'s three draft caps already stand**, measured at the bytes, on a positive
  `status='active'` predicate. The design builds **no new draft wall**.
- **`llm_price_table` is the vendor's USD cost, not Clara's MYR price** — USD-only by CHECK, and
  no MYR or FX relation exists anywhere in the estate. The billing rate is its own relation.
- **The configuration relations are PLATFORM data**, on `llm_price_table`'s measured posture
  (FORCE RLS, one `clara_fn_owner` policy, no app-role grant, DEFINER read). A `security_invoker`
  read over them is a **dead path** — F-A9's gate 1 paid for that once.
- **The paid/free boundary is DATA (`paid_roles`), never `role_rank`.** A permission ladder is
  not a price list.
- **No cap, brake or auto-stop.** Laws 76/78/81 and 裁-42⑦, proved by a **positive set-equality
  census** of every function that reads a billing relation — not by an absence.
- **Nothing to adapt, nothing to retire** — the catalog scan is closed-world and empty.

## 2 · The owner's cards

### OQ-1 · What is "AI usage" DENOMINATED in? *(the brief's own open question 2)*

**大白话.** 裁-42 说「用量减免额」，但没说单位是什么。用**令牌数**（token）机器最准，可是会计师看不懂，而且模型换价那天数字就不能比了；用**令牌换算成马币**，老板和客户都看得懂，发票也能自己对账，代价是我们要自己维护一张「每个引擎每百万令牌多少马币」的价目表。

**Recommendation — RM (MYR cents), from Clara's OWN rate table.** 裁-42⑨ requires an invoice a
firm owner can reconstruct unaided, and **nobody reconstructs a bill out of tokens**. But the
survey found the obvious source is the wrong one: `llm_price_table` is the **vendor's USD cost**
(USD-only by CHECK, `0110:497`), so denominating against it would bill **at cost** — every margin
decision then living outside the database, which is the configurability law's exact failure mode
— and would need a USD→MYR FX rate **law 18 forecloses**. The recommendation is therefore RM
**via a new `clara.billing_usage_rates`** (MYR, per engine, effective-dated), with
`llm_price_table` kept as the **cost floor** input to OQ-8's sitting and read by nothing.

**Cost.** One more effective-dated table to seed and keep current as the model roster moves. A
rate row keyed on the wrong `engine_id` namespace silently matches nothing — mitigated by
publishing `unpriced_calls` on the invoice rather than treating a gap as free.

**Fail-closed default (holds until ruled).** **Store BOTH.** The usage line carries the token
counts *and* the derived RM. Whichever way this goes, **no historical month has to be recomputed
from data that was not kept** — the brief's own instruction, adopted verbatim.

### OQ-2 · Is a `payments_only` ROLE minted, or is the free seat just `viewer`?

**大白话.** 裁-42②说 viewer 和「只管付款的人」不收费。可是数据库里根本没有「只管付款」这个角色——只有 viewer / bookkeeper / admin / owner 四个。要加一个，就要改 RBAC，而且有个坑：新角色如果排在 viewer 同一级，他就能看到整套账；如果不排进去，他连登录后什么都做不了，连付款都不行。

**Recommendation — do NOT mint it in this set. The free seat is `viewer`.** 裁-42②'s rule
("viewer and payments-only are free") is satisfied today by *every non-paid role is free*, and
`paid_roles` is already a config column, so the day the role exists it costs **one array
element**, not a redesign. Minting it now is an **RBAC change wearing a billing hat**, with a
measured hazard: `role_rank` returns `0` (= `viewer`) or `NULL` for a new label, and the two
failure modes are *"the billing contact can read the whole firm's books"* and *"the billing
contact cannot do anything, including pay"*. That is an access decision, and it deserves its own
pass rather than riding a pricing PR.

**Cost.** A firm that wants a bookkeeper-free finance contact has to give them `viewer` (full
read) until the role exists. For a beta cohort of accounting firms this is a small real cost and
a known one.

**Fail-closed default.** No new role. `paid_roles = {owner, admin, bookkeeper}`; `viewer` is
free.

### OQ-3 · The owner said "draft". The database says `onboarding`. Which word wins?

**大白话.** 老板讲的「草稿客户」，数据库里其实已经有了，只是叫 `onboarding`。功能一模一样：不能收单据、不能用 AI、不能过账——这三道墙**已经建好了**。改名要动两个正在跑的函数、一个约束、九个测试文件，纯粹为了一个词。

**Recommendation — keep `onboarding` in the database; display "Draft" in the UI.** Two spellings
for one state is the defect the estate keeps catching, and a rename is a live-body recut plus
nine test files for a word. **This card exists because the owner used his own word and is owed
the sentence** — the design will not silently rename what he said.

**Cost.** A reader of the schema sees `onboarding` where the ruling says `draft`. Paid once, in
a comment on the constraint and a line in the design.

**Fail-closed default.** Keep `onboarding`; the design and the UI both state the equivalence
explicitly.

### OQ-4 · Are tier-1 / tier-2 firms billed at all — and is BELCORT?

**大白话.** BELCORT 是我们自己的运营公司（constraint 13），其他 firm 现在全是测试数据。要不要给它们出账单？如果不小心把自己也收费了，钱是从左口袋到右口袋，但账做错了。

**Recommendation — EXEMPT, via a plan flag, and BELCORT sits on an exempt plan.** An exempt
firm's cycle produces **no invoice at all**, which is a different fact from an invoice reading
zero (裁-42⑨ wants a reconstructable bill; an operator has none to reconstruct). **Not keyed on
`firms.is_operator`**: measured, **no firm carries it** and its marking is an owner-timed Wave-G
ceremony (裁-43), so a wall keyed on it would be **inert until that ceremony runs** — the wrong
kind of silence. A plan flag works from PR-1 and is auditable as configuration.

*Tier-1/tier-2 are a separate half of the same question and 裁-43 already points at the answer:
**registration approval is a tier-2 thing; tier-3 is pay-and-start**. So tier-3 firms are the
billed population by construction. Whether an operator-approved tier-2 firm is billed is a
commercial call, not a mechanical one.*

**Cost.** A firm can be made free by configuration, which is also how it could be made free by
mistake. Mitigated: the flag is on the **plan**, so it is one auditable row, not a per-firm
switch a support action can flip.

**Fail-closed default.** **Do not charge.** A firm with no `firm_subscriptions` row is not
billed and is never silently defaulted onto a priced plan.

### OQ-5 · SST on the invoice — Stripe Tax, or a DB computation?

**大白话.** 马来西亚要收 SST。两条路：让 Stripe 自动算（省事，但那个数字是 Stripe 算的，不是我们算的），或者我们自己按税率表算（符合「数据库拥有每一个权威数字」的法律，但要自己维护登记状态和税率）。

**Recommendation — Stripe Tax (`automatic_tax: {enabled: true}`) for THIS invoice, and say
plainly why that is not a law-1 violation.** The distinction is the whole answer: law 1 governs
**the firm's books** — the numbers Clara computes *for* a client. **Clara's own sales invoice to
its customer is not a client's book**; it is a vendor document, and its tax is the vendor's
registration question. Using Stripe Tax here does not put a model-generated numeral in a client's
ledger and does not touch the SST engine F-T1 owns.

**Cost.** Stripe originates one number on our own sales invoice (rung 10), mirrored back onto
`invoice_lines` rather than computed. If the owner prefers full self-computation, the estate
already has an effective-dated threshold schedule to build from — it is more work, not a
different architecture.

**Fail-closed default.** **No tax line, and no invoice issued** — `amounts_ruled` is already
false, so nothing charges anyway. A tax line is never guessed.

### OQ-6 · What happens on an UNPAID invoice? *(the brief's own open question 3)*

**大白话.** 裁-42⑦ 说「超量不断服务」——那讲的是**用超了**。但**没付钱**是另一回事：卡失效、或者客户不付了。这题老板一定要拍板，因为它碰到的是一个会计师对他**依法要负责**的账本的访问权。

**Recommendation — READ-ONLY after N days, NEVER delete, and N is a configured column.**
The escalation: invoice unpaid → notify → after N days the firm's **write** doors refuse with a
named, honest reason (`billing_past_due`) while **every read, export and download keeps working
indefinitely**. The brief points the same way: 裁-42⑤'s archived-retention rule already
establishes the owner's instinct that **holding data is what costs**, which argues for read
access outliving write access. A professional must always be able to get his books **out**.

**Cost.** A firm that stops paying keeps its data at our storage cost forever unless a separate
retention policy is ruled. That is a real, ongoing cost and it is the price of the recommendation.

**Fail-closed default.** **Nothing happens.** `invoice.payment_failed` is **recorded and
nothing else** — no suspension, no read-only, no deletion. Suspension logic is **not built**
until this is ruled, because a wrongly-triggered lockout on a statutory deadline is the most
expensive failure in this whole design.

### OQ-7 · Archived-client retention — priced per CLIENT, or per GB?

**大白话.** 归档客户收一个「保管费」。按**每个客户一口价**最简单，客户看得懂，我们也好算；按**每 GB** 更贴近真实成本，但要建一套存储计量，而且账单会每个月跳动，客户会来问。

**Recommendation — per client, flat.** 裁-42⑤ says "a lower retention fee" per client and its
whole vocabulary is per client. Per-GB needs a storage metering subsystem that **does not exist**
(nothing in the estate measures per-client bytes), and it would make a line item that moves every
month for reasons a firm owner cannot see — which 裁-42⑨ forbids. If storage cost later diverges
badly from a flat fee, the flat price is a column and can be re-ruled without a migration.

**Cost.** A client holding 200 GB pays the same as one holding 20 MB. Accepted deliberately, and
revisitable as data.

**Fail-closed default.** Per client, flat, and the amount is `0` with `amounts_ruled=false` — so
retention is **computed and shown, and charged to nobody** until OQ-8 lands.

### OQ-8 · THE AMOUNTS — 裁-28, still open

**大白话.** 每一个价钱、每一个包含量、每一个减免额还是空的。这不挡开发，也不挡 beta；挡的是 Stripe 的产品和价格对象、收银台上显示的数字，还有**第一天真正收钱**。

**Recommendation — none. This is the owner's, and 裁-28 already ruled that it is.** What the
design set does instead is make waiting **safe**: placeholder plan rows ship with every amount at
`0` **and `amounts_ruled = false`**, the evaluator computes a full line set (so the machinery is
provable long before a price exists), and `issue_invoice` **refuses** while the flag is false.
裁-42's *"until the amounts land, nothing charges"* is a wall, not a promise.

**Cost.** None to the build. The conductor still owes the **cost-floor half** of 裁-28's brief
(measured from live BELCORT LLM spend against
[`research/pricing-market-survey-2026-08-29.md`](../research/pricing-market-survey-2026-08-29.md)
§5's list prices); the **market half landed 2026-08-29** and gives the sitting two evidence bands
— base tier ≈**RM300-900/firm/month**, per-client-company ≈**RM50-250/month**.

**Fail-closed default.** `0` everywhere, `amounts_ruled = false`, **nothing charges**, and the UI
renders P4's placeholder — *never* RM0, which reads as "free".

---

## 3 · What the independent review pass must attack

Named up front so the gate is not a re-read of the design's own claims.

1. **The rung table against 裁-42's ten sections, clause by clause** — especially §B.3's
   `retention_days`, which reconciles **four** clauses of ⑤ and ⑥ in one definition. If any
   clause is unreachable by the formula, the formula is wrong, not the clause.
2. **The proration cells' arithmetic, recomputed independently.** Annex B.3's worked cell is the
   author's own; a reviewer who re-derives it from the rung table and gets the same three numbers
   has proved something, and one who reads it has not.
3. **The D1 body list, by lineage walk, not by name.** Four bodies are named from migration
   source and are therefore **predictions**. Walk each lineage for a later `CREATE OR REPLACE` or
   dynamic splice; the estate has been bitten by a superseded-body assumption repeatedly.
4. **The anti-cap census's closure.** Is `{evaluator, read surface, issuance door, mirror}`
   really the complete set of billing-relation readers, and is the cell an equality in **both**
   directions? An absence is not evidence.
5. **The seat wall's site census.** Four membership sites are named. Is that closed-world — is
   there a fifth path to an active paid membership (a seed, a bootstrap verb, an admin repair)?
   This is the same class as F-A9's "five gates were actually eight".
6. **§3.9's status claim, positively.** Five statuses × three walls, read rather than derived.
   The design asserts new statuses fall outside a `status='active'` test *by construction* — that
   is a derivation, and law 2 says a derivation is not evidence.
7. **The `amounts_ruled` gate's reach.** Does *every* path that could charge pass through
   `issue_invoice`, or can the Stripe mirror reach a customer's card without it?
8. **Whether `billing_usage_rates` is genuinely necessary**, or whether OQ-1 could be served by
   `llm_price_table` plus a margin ratio. The design says no on two grounds (billing at cost;
   law 18's FX foreclosure) — that argument is the one most worth attacking, because it is the
   decision that adds a whole relation.

## 4 · The owner's cards — RULED 2026-08-30 noon (ledger `mohe-grill-rulings-2026-08-30.md`)

| Card | Ruling | Consequence for the build |
|---|---|---|
| OQ-1 | **裁-50** RM via Clara's OWN rate table ("用 RM，不过先不定价") | `billing_usage_rates` stands; `llm_price_table` stays vendor cost |
| OQ-2 | **裁-51** no `payments_only` role | role CHECK unchanged; billing surface = admin/owner; Stripe hosted links for the payer |
| OQ-3 | **裁-52** `onboarding` stays; "Draft / 草稿" is an i18n label | no rename migration |
| OQ-4 | **裁-53** BELCORT exempt by a plan flag | an operator-exempt plan row; metered, never invoiced |
| OQ-5 | **裁-54** Stripe Tax | no DB tax computation on Clara's invoices; switch on at registration |
| OQ-6 | **裁-55** read-only after the grace period (default 14 d), never delete | the write-wall flag + the reminder flow; the design's shape stands |
| OQ-7 | **裁-56 ARCHIVE = EXPORT PACKAGE, THEN DELETE** — no retention fee, no read-only tail | **supersedes §3's "archived = read-only retention"**: a sealed hash-receipted package, owner confirms the hash, 30-day cooling window, an audited delete door that walks the append-only triggers (never disables one), refusals for operator clients and open obligations; **beta-era build**, the dissent on file |
| OQ-8 | **deferred by 裁-50** — amounts unset | `amounts_ruled=false`; nothing charges |

> **裁-58 (2026-08-30 evening):** RM0 / free until the pricing sitting; UI renders a trial state, never RM0; Wave G proves the charge path in Stripe TEST mode.
