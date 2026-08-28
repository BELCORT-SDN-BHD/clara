# 裁-21 — the firm-level standard chart of accounts: ESTATE SURVEY (as-found) · v1

> **Survey of record for 裁-21**, the owner's 2026-08-28 ruling
> (`mohe-grill-rulings-2026-08-28.md` 裁-21, `:276-286`): *"build it — a **firm-level template**
> (the firm's standard chart) + an apply door at onboarding where **Clara trims and proposes by
> the client's industry (MSIC)** and the human confirms; the tax-computation layer (F-T3)
> consumes the same codes. Design gate + backend train + frontend train, sequenced before beta.
> Owner's domain call: firm practice starts every new client from a standard chart."*
>
> **This document states what IS, at the bytes. It designs nothing.** The design is
> `coa-template-design.md`; the mechanics, the seed chart and the battery are
> `coa-template-annexes.md`; the owner's open questions are `coa-template-gate-record.md`.
>
> **A RIG REPLAY WAS RUN, and it falsified two of this survey's first-draft predictions.** A
> throwaway `postgres:17` (WSL2 docker, bootstrap superuser `postgres`, proved virgin) took
> **137/137 migrations to frontier `0142_fa7b_pr_a_client_onboarding_open`** plus both seed
> files; every claim below tagged **[MEASURED]** is a live-catalog read (`pg_get_constraintdef`,
> `pg_get_functiondef`, `pg_policies`, `aclexplode`), never migration text. Claims still tagged
> **[PREDICTION]** are the ones the replay did not cover; §6 lists both, with the two
> falsifications recorded as **REFUTED** rather than quietly corrected. Bodies in this estate
> are spliced across generations and the text in any one file is not the live body
> (`wave-f-lane-brief.md`, "Rig replay before authoring") — **and §3's `CLR37` rung is this
> survey's own proof of that**: it is in the live core and in no migration file this lane read.
>
> **Read against:** hard constraints 1, 2, 10, 13, 14 (`AGENTS.md`) · `docs/product/PRD.md` §5
> journey 2 and **§6 invariants 1, 2(b), 2(c), 2(d), 10** (LAW) · `docs/ARCHITECTURE.md` §5 (the
> knowledge layer; *"the wiki informs; the typed layer decides"*) · `fa7b-gate-record.md` (the
> five materials playbooks, CLOSED 2026-08-27) · `tax-computation-design.md` + `-part2.md` +
> `tax-computation-gate-record.md` (F-T3's account keying) · `port-wave-plan-2026-08-28.md` §T2,
> §T4, §T10, §T11 · `.claude/rules/db-migrations.md` (forced RLS + policy pair; the
> frontend-home rule; the D1 obligation).

---

## 1 · The headline finding — the product ALREADY PROMISES this, and nothing honours it

**F1 · `coa_seed` is a shipped, human-answered, commit-required interview question with ZERO
consumers.** The client interview asks, at `packages/runtime/workflows/interview.v2.questions.ts:92`:

> *"Apply the standard LHDN-aligned MPERS Chart of Accounts seed for this client? (yes / no)"*

`requiredForCommit: true`, `skippable: false`. A "yes" is persisted as an
`onboarding_plan_items` row with `item_key = 'coa_seed_decision'` and
`answer = {"seed":"lhdn_mpers_standard"}` (`:93`); a "no" persists
`{"seed":"manual"}`. **A full-repo grep for `coa_seed_decision` returns four hits and not one of
them is a consumer** — two are the workflow definitions themselves
(`interview.v1.questions.ts:119`, `interview.v2.questions.ts:93`) and two are runtime tests
asserting the item key survives (`packages/runtime/tests/wave-b-interview-client.test.mjs:60`,
`wave-b-interview-v2-inventory.test.mjs:159`). **Zero occurrences in `packages/db/`.** The
accountant answers "yes", the DB records the promise, and nothing anywhere applies a chart.

This is not a gap the owner asked us to invent a feature for. It is a **shipped promise the
product cannot keep**, and 裁-21 is its discharge. It also settles a design question before it
is asked: the interview segment that carries the decision **already exists and is already
commit-required**, so the template feature does not need to invent an onboarding touchpoint —
it needs to give an existing one a mechanism.

**F1a · The question's wording makes a claim no source supports — CONFIRMED AGAINST LIVE
SOURCES.** "LHDN-aligned" asserts an alignment to an LHDN instrument. No such instrument is
cited anywhere in the repo, and the tax survey's own exhaustive grep found **zero** hits for
`lhdn` across every `.sql`, `.ts` and `.mjs` (`tax-computation-survey.md` F1, `:32-36`). A
parallel research lane re-fetched MASB, SSM, DOSM, LHDN and MIA on **2026-08-29** and returned
the bottom line without hedging: **LHDN prescribes no chart of accounts** — its e-Invoice
classification codes tag invoice *lines*, not GL accounts. The full source ladder, with URLs and
fetch dates, is `coa-template-annexes.md` **Annex A**. The wording is gate question **Q9**.

**F1b · "MPERS" in the same sentence is defensible; "a chart" is not.** MPERS §4/§5 are
word-for-word adoptions of the IFRS-for-SMEs modules 04/05 and prescribe **minimum face line
items only** — para **4.2** (18 statement-of-financial-position items) and para **5.5** (9
statement-of-comprehensive-income items) — **with no prescribed sequence and no account codes**,
and by-nature-or-function left free. MPERS (2016) is live; MPERS (2025) is effective for periods
beginning on or after **2027-01-01**. So a chart can be *aligned to* MPERS's line items; MPERS
is not itself a chart. Annex A ranks the candidate spines.

---

## 2 · `clara.coa_accounts` — the target relation, at the bytes

### 2.1 The columns, as accumulated across seven migrations

| Column | Origin | Shape |
|---|---|---|
| `client_id` | `0003:48` | `uuid not null references clara.clients(id)` |
| `firm_id` | `0003:49` | `uuid not null` |
| `account_code` | `0003:50` | `text not null`, CHECK **recut at `0009:759-761`** |
| `name` | `0003:51` | `text not null` — **the column is `name`, not `account_name`** |
| `account_type` | `0003:52` | `text not null check (… in ('asset','liability','equity','income','expense'))` |
| `special_acc_type` | `0003:53` | CHECK recut **three times** — `0015:213`, `0016:122`, final at `0017:674-681` |
| `is_active` | `0003:54` | `boolean not null default true` |
| `created_at` | `0003:55` | `timestamptz not null default now()` |
| `account_class` | `0009:762` | added; CHECK recut at `0015:198-200` |
| `is_bank_account` | `0038:252` | `boolean not null default false` |
| `account_id` | `0058:50-56` | `uuid`, backfilled, then `not null default gen_random_uuid()` |

**Primary key: `(client_id, account_code)`** (`0003:56`). There is no `account_name` column, no
parent/child rollup, no report-line grouping and **no tax dimension** — measured independently
by F-T3 (`tax-computation-survey.md` §2.2, `:82-96`).

### 2.2 The constraints a template must not fight

| Constraint | Cite | What it means for a template |
|---|---|---|
| `ck_coa_account_code_0009` — `account_code ~ '^[0-9]{4,8}$\|^[0-9]{3}-[0-9A-Z]{2,4}$'` | `0009:759-761` | **Two numbering worlds are admitted**: a plain 4-to-8-digit code, or RPR's `NNN-XXXX` display form. A template's codes must satisfy the identical predicate. |
| `coa_accounts_special_acc_type_check` — `null` or one of `rounding · sst_output · sst_purchase_cost · opening_balance_equity · retained_earnings` | `0017:674-681` (final tip) | The five special roles. A template may carry at most one row per value. |
| `uq_coa_special` — `unique (client_id, special_acc_type) where special_acc_type is not null` | `0003:58-59` | **One rounding account, one SST-output account, one OBE, one RE per client.** A template carrying two rows with the same marker would fail at apply, not at authoring — so the template needs its own mirror of this index. |
| `ck_coa_obe_equity` / `ck_coa_retained_earnings_equity` | `0017:682-686`, `0017:687-690` | OBE and RE must be `account_type='equity'`. |
| `ck_coa_sst_purchase_cost_expense` | `0016:124` | `sst_purchase_cost` must be `account_type='expense'` (WA21-R1: input SST is expensed, PRD §6 invariant 12). |
| `ck_coa_account_class` — `null · 'payable' · 'receivable'` | `0015:198-200` | The intrinsic-subledger control markers. |
| `uq_coa_account_id` / `uq_coa_account_id_tenant (account_id, firm_id, client_id)` | `0058:55-56` | **The tenant-congruent unique F-T3 keys onto.** `tax-computation-gate-record.md:258` records it as *"used by nothing"* today. |
| `fk_coa_client_firm_delta (client_id, firm_id) → clara.clients(id, firm_id)` | `0058:57` | Tenant congruence is structural. |
| `t_coa_account_id_immutable` | `0058:58-59` | `account_id` is immutable after insert (`CLR08`). |

**`account_id` is minted per client at insert time** (`default gen_random_uuid()`), so a template
row cannot carry the uuid F-T3 will key on — the identity is born at apply, not at authoring.
That is a design constraint, recorded here and consumed in the design's §5.

### 2.3 What the estate seeds today (the fixture chart, not a product chart)

`packages/db/seeds/0002_core_seed.sql:119-131` plants **thirteen accounts per fixture client**
through `clara.upsert_account`, never by hand-written row:

```
1000 Cash at Bank (asset)          1100 Accounts Receivable (asset)
1200 Inventory (asset)             1500 Fixed Assets (asset)
2000 Accounts Payable (liability)  2100 Accruals (liability)
3000 Share Capital (equity)        3900 Retained Earnings (equity)
4000 Sales (income)                4100 Other Income (income)
5000 Cost of Sales (expense)       6000 Operating Expenses (expense)
9990 Rounding (expense, special_acc_type='rounding')
```

Idempotency is a stable per-`(client, code)` op key (`'seed-acct-'||cid||'-'||acct.code`,
`:129`) — the pattern a bulk apply door must reproduce (design §3.3).

**This is a test fixture, not the firm's chart** (constraint 13: every non-BELCORT firm and
client in the estate is a resettable fixture). It is, however, evidence about the house's
numbering convention: **4-digit codes, 1000/2000/3000/4000/5000/6000 blocks by type**, with a
9000 sentinel block for system roles.

### 2.4 The only real chart in the repo

`packages/db/deploy/rpr-coa.csv` — **77 lines, ROME PROPERTIES SDN BHD only**, loaded once
through `upsert_account` (its own header, `:6`). Its codes are the `NNN-XXXX` form (`300-000`
TRADE DEBTORS, `400-000` TRADE CREDITORS, `999-R00` ROUNDING) and it carries an explicit
`origin` column distinguishing `tb` (on the client's own trial balance), `gl` (a real GL account
with a near-zero balance) and `system_role` (an **owner-approved augmentation not on the
client's chart**). It is a client's chart carried down from a predecessor — **the exact artifact
裁-21 says a firm should stop starting from.**

Its `system_role` governance ("reused if already present, else created here; locked against
deletion/retag after first use; postings only through governed writers") is the closest thing
the estate has to a template concept, and it is a **CSV plus a comment block**, not a mechanism.

---

## 3 · The write path — three doors over one extracted core

**F2 · `clara._upsert_account_core` EXISTS and is the seam this feature needs.** F-A3 PR-1a
(`0119_f_a3_pr1a_core_extractions.sql`) extracted nine live human writers into ungranted cores,
`upsert_account` among them (`0119:51` item 9, `:181-182`, and the cut block at `:687-731`). The
extraction is **programmatic**: the file reads the live `pg_get_functiondef`, splices the
`c := clara._human_ctx(clara.role_rank('bookkeeper'))` anchor into a ctx read
(`0119:707-711`), and re-creates the public face as a thin delegator (`0119:721-729`). Its tail
proves the core body **inverts back to the pinned prestate sha** (`0119:736-742`).

The resulting shape:

```
clara._upsert_account_core(p_ctx jsonb, p_client, p_code, p_name, p_type,
                           p_special_acc_type, p_op_key, p_account_class)   -- UNGRANTED
   ctx keys read: 'actor', 'firm' (0119:707); missing either raises CLR10 'core_ctx_missing'
   ↑                               ↑
clara.upsert_account(...)          clara._agent_upsert_account_core(...)
   thin delegate, bookkeeper           adds Tier-A, inputs-digest verify, a bank receipt
   floor, ACL unchanged                keyed on md5(client||':'||code)::uuid (0121:5405-5436)
   (0009:1460-1502 = the pre-           ↑
    extraction body text)          clara.wake_upsert_account(...)  → clara_wake_bank (0121:5460)
                                                                   + clara_wake_interactive (0130:88)
```

**The core's own ladder** (read from the pre-extraction text at `0009:1460-1502`, carried
verbatim into the core by the splice): a mandatory `p_op_key` (`CLR10`), a `_reserve_op` +
`_hash` dedupe over `(client, code, name, type, special, class)`, a **firm-congruence check**
(`CLR11` *"client not in your firm"*), the **has-lines guard** — *"cannot change type/class of an
account that has lines"* (`CLR10`) — the upsert with `on conflict … do update set … is_active=true`
(**every write reactivates**), a `_audit` row and an `account.upserted` event.

**F2a · The chain has FOUR members, not three — [MEASURED], and the survey's own first draft got
it wrong.** `wake_upsert_account` does **not** call `_upsert_account_core` directly; it calls
`clara._agent_upsert_account_core`, which calls the shared core. Any lane that pins this surface
pins **four** shas, and the live pins at frontier `0142` are:

| signature (one overload each) | prosrc sha256 | EXECUTE grantees |
|---|---|---|
| `clara.upsert_account(uuid,text,text,text,text,text,text)` | `45dc1f860cd404acfe8e90cc2a45ee3b8dec083a09230f6cc70d64d4e3e191db` | `clara_fn_owner`, `clara_authenticated` |
| `clara._upsert_account_core(jsonb,uuid,text,text,text,text,text,text)` | `5e0819f3b1e726b2cd5a6e05c3189992e9ac699910254324b6ba87022f1514e0` | `clara_fn_owner` **only** |
| `clara._agent_upsert_account_core(uuid,text,text,text,text,text,text,jsonb,text,text)` | `10a7e6ed63d5137514f608fe6716e50f65468ec92186f85b3b902b45ce4ea798` | `clara_fn_owner` **only** |
| `clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)` | `6a2809f94e6351221595b0f5df1b645611a9772e2efadc0b24a5a03cfa59ae85` | `clara_fn_owner`, `clara_wake_interactive`, `clara_wake_bank` |

All four are `volatile`, `security definer`, `search_path = clara, pg_temp`. **[MEASURED]**

**F2b · The live core carries a rung that is in NO migration file this lane read.** Beyond the
`0009` ladder, the live `_upsert_account_core` body carries a **fixed-asset-enrolment retirement
guard raising `CLR37`**. It is not in `0009:1460-1502` and not in `0119`'s splice. Some later
migration re-cut it; this survey did not find which. **This is the survey's own working proof of
the standing caveat** — a design authored from migration text would have designed against a
three-rung ladder that has four rungs. Locating its origin is a named obligation of the build
lane's PR-0 replay (§6, P-2 REFUTED).

**F3 · Clara can ALREADY write `coa_accounts` unattended, per account. [MEASURED]**
`wake_upsert_account` is granted to `clara_wake_bank` and `clara_wake_interactive`, and
`clara.wake_fn_allowlist` holds exactly two rows for it — `('bank_agent','wake_upsert_account')`
and `('interactive_client','wake_upsert_account')`. It walks `assert_wake_allowed`, enforces the
credential's client pin, requires an op key and a non-empty rationale, and receipts through
`_agent_bank_receipt`. This is lawful under PRD §6 invariant 2(d) (a wake-scoped, allowlisted,
GRANT-split, receipt-stamped write lane). **It matters for the design**: the wall 裁-21 needs is
not *"Clara may never touch the chart"* — she already may, one account at a time, with a
receipt. The wall is about **the bulk act**: a template apply plants N accounts on one
authority, and one rationale covering forty accounts is not forty rationales.

**F4 · Direct DML into `coa_accounts` exists inside migration self-proof blocks**
(`0016:5391`, `:5625-5630`, `:5799-5803`), not in any granted function. `0058:41-47` runs a
census counting `pg_proc` bodies that insert or update the table — the estate already treats
"who writes this table" as a measurable, so the design's own writer census has a precedent to
copy.

**F4a · The table's own walls, [MEASURED].** Forced RLS is ON (`relrowsecurity` and
`relforcerowsecurity` both true) with **four** policies — `p_coa_accounts_owner` (`clara_fn_owner`,
`using (true)`), `p_coa_accounts_human` (`clara_authenticated`, `firm_id = clara.jwt_firm()`),
`p_coa_accounts_agent` (`clara_agent_ro` SELECT, `firm_id = clara.wake_firm()`), and
`p_coa_accounts_freeform` (`clara_freeform_ro` SELECT, firm + optional client-scope + admitted).
Table grants are SELECT-only to the three read roles; only `clara_fn_owner` holds DML. Two
triggers: `t_coa_account_id_immutable` (BEFORE UPDATE) and **`t_coa_stamp` (BEFORE INSERT) →
`clara._tf_stamp_from_client()`** — so `firm_id` is stamped from the client row, never supplied
by a caller. A template apply inherits all of this for free by going through the core.

**F4b · Seventeen relations FK onto `coa_accounts`. [MEASURED]** `account_set_version_members` ·
`bank_accounts` · `bank_reconciliations` · `client_turnover_accounts` · `coding_rules` ·
`fixed_assets` (×3) · `fa_account_profiles` (×3) · `journal_lines` · **`opening_tb_targets`** ·
`rule_sightings` · `staff_advance_accounts` · `staff_advances` · `wiki_page_refs` ·
`metric_input_snapshot_contributions` · `metric_input_snapshot_samples`. **The chart is the
spine, not a lookup list** — and `opening_tb_targets` is T2's carry-down target, which is the
mechanical reason §5.2's ordering question has only one safe answer.

---

## 4 · The industry axis — MSIC is the WEAKEST of three, and the estate already holds a better one

**F5 · The fact catalog holds FIVE keys, not two — [MEASURED], and this survey's first-draft
prediction P-5 is REFUTED.** `clara.client_fact_keys` (`0055:347-353`) is a **code-populated
global catalog** — *"a fact key is product vocabulary, and vocabulary changes ride migrations
with review, never live edits"* (`0055:345-346`). `0055:370-381` seeds two; **three more were
added by later migrations**, and the live set is:

| `fact_key` | `validated_against` | `allowed_values` | Origin |
|---|---|---|---|
| `entity_type` | `enum:ENTITY_TYPES_V2` | `sdn_bhd · bhd · sole_prop · partnership · llp · society · cooperative · other` | `0055:371-376` |
| `msic` | **`format_only`** | **null** | `0055:377-381` |
| **`trade_nature`** | `enum:TRADE_NATURE_V1` | **`goods_trading · services · mixed`** | `0056:1234` |
| `banking_arrangement` | `enum:BANKING_ARRANGEMENT_V1` | `has_accounts · no_accounts` | `0121:4820` |
| `customer_identity_policy` | `enum:CUSTOMER_IDENTITY_POLICY_V1` | `name_only · unrestricted` | (PRD §6 invariant 2(b)'s wall) |

**F5a · `trade_nature` is a stronger trim axis than `msic`, and the estate already reads it
fail-closed.** It is a DB-validated three-value enum, where `msic` is format-only text. The
close model already keys on it: `0056:1284-1291` reads the live fact and, on absence, returns
`{'state':'unknown','reason':'trade_nature_fact_absent'}` — never a guess — and `0056:1482`
scopes the goods-trading checks to *"apply unless the trade_nature fact POSITIVELY"* says
otherwise. `0121:4746` and `:4820` mint `banking_arrangement` naming *"the
trade_nature/0056:1233-1239 precedent, cloned exactly"*. **The house pattern for a new decision
axis is therefore already settled: a `client_fact_keys` enum row, read three-valued, absence =
`unknown`.** A chart trim is a new decision axis, and it should clone the same precedent rather
than invent one. Design §4.3.

**F5b · Nothing captures `trade_nature` at onboarding.** A grep across
`packages/runtime/workflows/*.ts` returns zero hits for `trade_nature` or
`banking_arrangement` — the interview asks neither. They reach `client_facts` only through
`record_client_fact`. So the interview asks the WEAK axis (`msic`, optional, format-only) and
never asks the STRONG one (`trade_nature`, enum, already consumed by the close gate). Design
§4.3 and gate Q7.

**F5c · `clara.client_facts` is EMPTY across the whole seeded estate. [MEASURED]** Zero rows;
all three seeded clients carry no facts at all. **Any battery cell that reads a fact must PLANT
it** — a cell relying on the seed for a fact is vacuous by construction.

**F5d · MSIC's live edition matters and is not recorded anywhere.** The research lane
(Annex A) measured that **DOSM MSIC 2008 is the live key** used by SSM and by LHDN e-Invoice;
**MSIC 2025 launched 2025-10-28** with routine use from 2027. The estate stores a bare
five-digit string with no edition stamp, so a code recorded today cannot be told from a code
recorded under the next edition. Gate question **Q12**.

**F5e · A trim rule must key on MSIC's SECTION or DIVISION, never the 5-digit item.** The
research lane's explicit finding: the 5-digit item is the leaf and is unstable across editions;
the Section (letter) and Division (first two digits) are the stable levels. A rule keyed on the
leaf is brittle by construction.

- The `msic` row's `validated_against` is **`'format_only'`**, and its description says so
  without hedging (below).
- The `msic` row's `validated_against` is **`'format_only'`**, and its description says so
  without hedging: *"FORMAT-ONLY, and the label says so honestly: no official MSIC registry
  table exists anywhere in migrations 0001-0054 (measured, matrix F3e), so the product never
  claims the code was checked against an official list. The compensating control is basis
  capture — who supplied the code, on what evidence."* (`0055:377-381`).
- `clara.client_facts` (`0055:386-420`) carries `fact_value jsonb`, a **mandatory non-empty
  `basis`**, `basis_kind in ('owner_instruction','document','registry_lookup','interview_carryover')`,
  a document-basis two-way CHECK (`:412-413`), the composite client FK (`:418-419`), and
  **supersession-not-update** (`uq_client_fact_live` at `:422-423`; the
  `_tf_client_facts_supersede_only` trigger at `:428-455`).
- The capture door is `clara.record_client_fact(uuid, text, jsonb, text, text, uuid, text)`
  (`0055:499`, granted `:668`).
- Independently, the interview asks `msic` at `interview.v2.questions.ts:82` and
  `0036_wave_c0_deferred_belts.sql` §E splices `pack.client.msic` into `get_context_pack`,
  reading *"the LATEST COMMITTED client-scoped plan's answered/resolved `msic` item"*
  (`0036:1501-1505`, with a two-literal tail census at `:1835-1839`).

**F6 · MSIC is OPTIONAL at onboarding.** `{ key: "msic", … requiredForCommit: false,
skippable: true }` (`interview.v2.questions.ts:82`). **A client can be born, committed and
active with no industry code at all.** Any trim rule keyed on MSIC must therefore have a
fail-closed branch that is *behaviour*, not a comment — this is the single sharpest constraint
the design carries (design §4.4, gate Q6).

**F7 · The estate holds no MSIC registry, so a code cannot be validated, only format-checked.**
`0055:378-380` states it as a measured absence. **A trim proposal may not claim the code was
checked**, and the design must not build a mapping table that implies it was
(design §4.3 handles this by keying the trim on the code's coarse prefix with a *stated* source,
never on a fabricated official mapping).

---

## 5 · What onboarding does today, and where the template would sit

### 5.1 The journey as PRD law

PRD §5 journey 2 (`docs/product/PRD.md:123`): *"Client onboarding (new or ongoing) — identity
interview → **seed COA + child tables** → for an ongoing client, carry down opening
balances/subledgers/FA register through the idempotent carry-forward function with a TB tie-out
→ KB wiki seeded from prior data → dry-run review → commit."*

**"seed COA" precedes "carry down" in the product's own law.** That ordering is not an
accident of prose — the carry-down needs accounts to carry *into*. §3 of the design turns it
into a named rule.

### 5.2 The F-A7b playbooks, and which of them seed a chart from prior books

`fa7b-gate-record.md:10-20` (CLOSED, ruled as proposed) — the five materials playbooks plus the
green-field case (`fa7b-onboarding-design.md:198-205`):

| Playbook | Materials | Opening seed | Chart source today |
|---|---|---|---|
| ⓪ `green_field` | nothing before commencement | none (opening = 0) | **nothing** |
| ① `predecessor_pack` | audited FS + GL handed over | document-tied deterministic parse, human-confirmed mapping | prior GL, by hand |
| ② `management_values` | management accounts, values only | `management_account` tie or keyed fallback, always with the recorded unaudited acknowledgement | prior MA, by hand |
| ③ `bank_only` | bank statements only | **NO seed** — deferred activation, visible banner, chase list, FY1 cost on screen day one | **nothing** |
| ④ `shoebox` | loose documents | as ③; reconstruction is a NAMED SEPARATE ENGAGEMENT | **nothing** |
| ⑤ `midyear_gap` | mid-year switch, records gap | seed at the predecessor's TB date, typed open question per gap period, difference carried by name, **never a plug** | prior TB, by hand |

**F8 · Three of six playbooks (⓪, ③, ④) give the client NO chart at all today, and the other
three give it only as a by-product of a human keying a predecessor's numbers.** T2 owns the
prior-books path (`port-wave-plan-2026-08-28.md:230-246`, eleven doors including
`create_opening_seed` · `draft_opening_item` · `record_opening_target` · `get_opening_dryrun`);
**T2 has no chart-creation door in its roster** — its doors all presuppose accounts that already
exist. That presupposition is currently unmet for ⓪/③/④ and met only by hand for ①/②/⑤.

### 5.3 The three human touchpoints onboarding already has

`fa7b-gate-record.md:55-56` names them by ruling: **accept the proposal** (Q-D1 ALL-PROPOSE) ·
**sign the consent doors** (owner-floored, `0123:331`/`:396`) · **approve the opening** (law 71's
reserved act). A fourth touchpoint is what a chart apply would be, and the design argues its
placement in §3.5 rather than assuming it.

### 5.4 The receipt surface F-A7b just landed

`0142_fa7b_pr_a_client_onboarding_open.sql` (merged, PR #401) minted the **eighth** receipt
surface member: `('f_a7b','onboarding_agent','_agent_receipt_src_f_a7b','onboarding_agent_receipts')`
(`0142:314-315`), widening the registry's two closed-world CHECKs by one optional trailing
letter (`:307-312`). The table (`0142:256-278`) carries `document_id` **and** `client_id` **both
nullable**, and its own comment says why: *"later PRs' plan-tied acts (birth, answer proposals)
will use client_id/plan_id rather than document_id"* (`:281-283`).

**F9 · A client-tied, document-less F-A7b agent act fits `onboarding_agent_receipts` exactly as
its author anticipated — no new receipt table, no registry widening, no shim re-cut.** The one
honest gap: the table has **no act discriminator column**; `verdict jsonb not null` (`:264`) is
where an act name would live. That is the same class as the receipt-contract looseness 裁-22
recorded without ruling (`mohe-grill-rulings-2026-08-28.md:319-322`).

**F9a · The live registry, [MEASURED]: eight rows, and membership is a REGEX, not an array
CHECK.** `clara.agent_receipt_surfaces` holds `f_a2 entry_post · f_a3 bank_agent · f_a4
agent_act · f_a5 report_agent · f_a6 freeform_read · f_a7 agent_filing · f_a7b onboarding_agent
· f_a8 web_fetch`, constrained only by `item ~ '^f_a[0-9]+[a-z]?$'`,
`receipt_kind ~ '^[a-z][a-z0-9_]*$'` and `shim_relname ~ '^_agent_receipt_src_f_a[0-9]+[a-z]?$'`.
So a **ninth** member is one INSERT, not a CHECK swap — but reusing `f_a7b` costs zero rows and
zero DDL, which is the design's §3.6 recommendation.

**F9b · The wake vocabulary, [MEASURED].** `ck_wake_credentials_kind_0011` admits exactly
**seven** kinds — `interactive · proactive · autodraft · interactive_client · close_prep ·
bank_agent · filing` — and its sibling `ck_wake_credentials_client_0011` requires
`client_id IS NOT NULL` for `interactive_client` (and for `autodraft`, `close_prep`,
`bank_agent`), while `interactive`, `proactive` and `filing` must carry `client_id IS NULL`.
**`interactive_client` is the only kind that is both client-pinned and already allowlisted for
`wake_upsert_account`** — which is the mechanical reason design §4.2 recommends it and mints no
eighth kind. `ck_agent_tasks_kind_0011` admits `chat_turn · wake · autodraft · close_prep`.

---

## 5a · The name collision — `chart_templates` ALREADY EXISTS and is NOT this

**F10 · [MEASURED] — prediction P-6 is REFUTED.** A `pg_class` scan for `relname ilike
'%template%'` in schema `clara` returns **29 relations**, two of which are named almost exactly
what this feature would naively be called:

- **`clara.chart_templates`** — `id, firm_id, chart_key, title, created_by, created_at`, forced
  RLS, append-only triggers, human policy
  `p_charttemplates_human FOR SELECT USING (firm_id IS NULL OR firm_id = clara.jwt_firm())`.
- **`clara.chart_template_versions`** — `chart_spec_ast jsonb`, `axis_policy` CHECKed to
  `include_zero · data_extent · symmetric · disclosed_manual`, `state` CHECKed to
  `published · superseded`, `content_sha256 bytea(32)`, a publication-freeze trigger.

**These are DATAVIZ chart specs — bar/line charts and their axis-scaling policy — not charts of
accounts.** Neither has any FK to `coa_accounts`, `account_type` or `special_acc_type`. Sibling
functions: `_publish_chart_template_core`, `publish_chart_template_version`,
`wake_publish_chart_template_version`. Of the **17** `clara` functions matching `%template%`
(the `adjustment_templates`, `chart_template` and `report_template` families), **none touches
`coa_accounts`**.

**Two consequences, both binding on the design.**

1. **Naming.** Nothing in this feature may be called `chart_template*`. The design uses the
   `coa_` prefix throughout (`coa_templates`, `coa_template_families`, `coa_template_accounts`,
   `coa_template_adoptions`), and a build lane that "helpfully" shortens a name to
   `chart_templates` collides with a live relation. Recorded here so the collision is a known
   fact rather than a merge-time surprise.
2. **A REAL precedent, and a WARNING attached to it.** `chart_template_versions`'
   draft→`published`→`superseded` lifecycle with a publication-freeze trigger and a
   `content_sha256` is precisely the versioning shape 裁-21 needs, and the design clones it
   (§3.2). But `p_charttemplates_human`'s `firm_id IS NULL OR firm_id = clara.jwt_firm()` is
   **exactly the "infer platform from a NULL" shape the lane brief forbids** —
   *"Never infer 'platform' from a NULL — that fails OPEN; use an explicit `scope in
   ('firm','platform')` column with the CHECK `(scope='firm') = (firm_id is not null)`"*
   (`wave-f-lane-brief.md`, R-L26). The design takes the lifecycle and **rejects the NULL-scope
   idiom**, with the explicit `scope` column and a POSITIVE cross-firm visibility cell (§3.2,
   Annex C cell 5).

---

## 6 · The replay ledger — what was measured, what was refuted, what is still open

**Rig:** throwaway `postgres:17` in WSL2 docker, bootstrap superuser `postgres`, proved virgin
(no `clara` schema) before use; **137/137 migrations to frontier
`0142_fa7b_pr_a_client_onboarding_open`**; both seed files applied; container destroyed at
close. Reads were `pg_get_constraintdef` / `pg_get_functiondef` / `pg_policies` /
`aclexplode` / `information_schema`, never migration text.

| # | Claim | Verdict | What the catalog said |
|---|---|---|---|
| **P-1** | `_upsert_account_core(jsonb,uuid,…)` exists, UNGRANTED, definer, `search_path=clara,pg_temp` | **CONFIRMED** | one overload; EXECUTE to `clara_fn_owner` only; sha `5e0819f3…` |
| **P-2** | Its live body is the `0009:1460-1502` ladder + the `0119:707-711` ctx splice and nothing else | **REFUTED** | the live body additionally carries a **fixed-asset-enrolment retirement guard raising `CLR37`**. Origin unlocated — a named PR-0 obligation (F2b) |
| **P-3** | `upsert_account` is a thin delegator acquiring only `_human_ctx` | **CONFIRMED** | body is 5 lines: `_human_ctx(role_rank('bookkeeper'))` → `_upsert_account_core(jsonb_build_object('actor',…,'firm',…), …)`; sha `45dc1f86…` |
| **P-4** | `wake_upsert_account`'s grantees are `clara_wake_bank` + `clara_wake_interactive` | **CONFIRMED** | plus `clara_fn_owner`; and `wake_fn_allowlist` carries exactly `bank_agent` and `interactive_client` for it |
| **P-5** | `client_fact_keys` holds exactly two rows | **REFUTED** | **five** — `entity_type`, `msic`, `trade_nature`, `banking_arrangement`, `customer_identity_policy` (F5). The refutation is load-bearing: `trade_nature` is a better trim axis than `msic` |
| **P-6** | No `clara` relation or function has `template` in its name | **REFUTED** | **29 relations, 17 functions** — incl. `chart_templates` / `chart_template_versions`, which are **dataviz** chart specs (F10). A genuine COA template is still confirmed ABSENT: none of the 46 objects touches `coa_accounts` |
| **P-7** | `uq_coa_account_id_tenant` exists | **CONFIRMED** | `UNIQUE (account_id, firm_id, client_id)`. *Whether any FK references it was not separately censused* — **still open** |
| **P-8** | `tax_treatment_codes` / `tax_account_treatments` do NOT exist at `0142` | **CONFIRMED** | `pg_class` lookup EMPTY; F-T3 is design-stage, no migration number claimed |
| **P-9** | `ck_coa_account_code_0009`'s predicate | **CONFIRMED** | `CHECK (account_code ~ '^[0-9]{4,8}$\|^[0-9]{3}-[0-9A-Z]{2,4}$'::text)` |
| **P-10** | Seeded clients carry the 13-account chart and nothing else | **CONFIRMED, and narrowed** | **three** seeded clients (Highland Coffee · Sunrise Retail · Meridian Logistics), 13 each. Additionally measured: across all 39 rows `account_class` is **never** set, `special_acc_type` is `rounding` on exactly 3 and never any other value (account 3900 is *named* "Retained Earnings" but carries **no** marker), and `is_bank_account` is false even on "Cash at Bank" |
| **P-11** | `agent_receipt_surfaces` holds eight rows incl. `f_a7b` | **CONFIRMED** | and membership is regex-shaped, not an array CHECK (F9a) |
| **P-12** | `open_questions.origin` admits `'onboarding'` with no live emitter | **PARTLY OPEN** | the CHECK was not re-read on this rig and no `prosrc` emitter scan was run. **Still open** — carried to PR-0 |

### Still open after this replay (carried to the build lane's PR-0)

1. **Where `CLR37` entered `_upsert_account_core`** (P-2). Until located, no lane may claim to
   know the core's full ladder, and the design's §3.3 apply loop must be read as designing
   against a ladder with one rung it has not read.
2. **Whether any FK references `uq_coa_account_id_tenant`** (P-7). F-T3's gate record says
   *"used by nothing"* (`tax-computation-gate-record.md:258`); unverified on this rig.
3. **P-12's emitter scan.**
4. **The live `list_review_queue` row-kind set** (§7 item 5) and the live
   `documents.document_kind` set — neither is needed by the design as recommended (it involves
   no document), recorded so the absence is deliberate rather than overlooked.

---

## 7 · What this survey did NOT establish (named, not left to be discovered)

1. **BELCORT's own existing standard chart.** The owner is a practising Malaysian
   accounting-firm principal and the firm may already have a chart its staff use. **Nothing in
   this repo holds it.** Gate question **Q1**, and the single highest-value input this feature
   can receive — a firm's standard chart is, by definition, what the firm already standardises on.
2. **The live SSM MBRS element list (SSMxT).** The research lane reached only a **2022
   consultation draft**, not the live 2025/26 taxonomy, and did not obtain a primary SSM MBRS
   circular. Annex A states the gap; the design does not treat SSMxT as a measured spine.
3. **Statutory-payable naming.** RMCD/SST and EPF/SOCSO/EIS/PCB payable naming conventions were
   **not researched**. Gate question **Q11**.
4. **Whether the `NNN-XXXX` code form is in use anywhere but RPR.** Only one CSV exists.
5. **The live `list_review_queue` row-kind set.** 裁-17 mints a ninth (`seeding_proposal`); a
   trim proposal's inbox presence, if any, must be designed against the **live** set.
6. **Whether `apps/web` has a firm-settings surface today.** `port-wave-plan-2026-08-28-part2.md:409-412`
   (OQ-7) records that a **client**-settings surface does not exist; `:378` routes
   `set_firm_high_stakes_threshold` to *"P4's settings switch"*, implying a firm admin surface
   does or will. The design names both possibilities and assumes neither.
7. **`tax_treatment_codes`' eventual content.** F-T3 is unbuilt (P-8).
