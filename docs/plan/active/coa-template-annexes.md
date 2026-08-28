# 裁-21 — the firm-level standard chart of accounts: ANNEXES

> Companion of record to **`coa-template-design.md`** (the design) and
> **`coa-template-survey.md`** (the estate as-found). Split under the 500-line harness limit.
>
> **A** the source ladder · **B** the seed chart's families · **C** the battery ·
> **D** the frontend homes and cross-train obligations · **E** the non-goals ·
> **F** the full DDL · **G** the build sequence and the width ruling.

---

## Annex A · The source ladder — re-fetched 2026-08-29

**The bottom line, stated first: no official Malaysian document is a chart of accounts.** A firm
authors its own. What follows is what the official instruments *do* provide, ranked by how much
of a chart each can defensibly underwrite.

### A.1 The ranked spines

| Rank | Spine | What it gives | What the firm must still author |
|---|---|---|---|
| **1** | **MPERS §4 ¶4.2 + §5 ¶5.5** — minimum face line items | 18 statement-of-financial-position items and 9 statement-of-comprehensive-income items, **no sequence prescribed**, by-nature-or-function free. MPERS §4/§5 are **word-for-word adoptions of the IFRS-for-SMEs modules 04 / 05** | **every account code**, all sub-account granularity, the cash/bank/petty split, revenue by service line, and **every statutory-payable name** (EPF · SOCSO · EIS · PCB · SST) |
| **2** | **SSM MBRS 2.0 taxonomy (SSMxT)** — `FS-MPERS` / `FS-MFRS` filing templates | a real controlled element vocabulary, **finer than MPERS**, and **mandatory for all companies from 2025-06-01** — so every Sdn Bhd's numbers already land in it | the codes; **and the live 2025/26 element list was NOT obtained** — only a 2022 consultation draft (see A.3) |
| **3** | *(nothing else)* | — | — |

**MPERS editions.** MPERS (2016) is live. **MPERS (2025) is effective for reporting periods
beginning on or after 2027-01-01**, early adoption permitted. The interview already asks the
edition (`interview.v2.frameworks.ts:126-134`), so the template's `framework_hint` has a live
answer to align to.

### A.2 What the other authorities do and do not do

| Authority | Verdict |
|---|---|
| **LHDN (Hasil)** | **Prescribes no chart of accounts.** Its **e-Invoice classification codes tag invoice LINES, not GL accounts** — a real vocabulary for a different object. No prescribed expense classification, no prescribed trial-balance format for Form C / B / P. |
| **MIA** | Publishes **Illustrative MPERS Financial Statements** — a *presentation* model, not a chart. Useful as a cross-check on family labels; not a spine. |
| **DOSM — MSIC** | **MSIC 2008 is the LIVE key** used by SSM and by LHDN e-Invoice. **MSIC 2025 launched 2025-10-28**, routine use from 2027. Structure is Section (letter) → Division (2-digit) → Group (3) → Class (4) → Item (5). **A trim rule keys at Section or Division, never the 5-digit item** — the leaf is unstable across editions. |
| **CA 2016 s.244 / s.245 / s.246** | Constrain **RECORDS** — entries within 60 days, 7-year retention — and the obligation to keep accounts that *explain the transactions*. **Not accounts.** |
| **ITA 1967 s.82 / s.82A** | Record-keeping and retention. **Not accounts.** |
| **RMCD (SST)** | **Not researched.** Whether RMCD constrains account naming for SST output/purchase is an open question — survey §7 item 3, gate **Q11**. |
| **EPF / SOCSO / EIS** | Statutory-payable naming conventions **not researched**. Gate **Q11**. |

### A.3 The gaps this lane states rather than papers over

1. **MPERS's own PDF is click-through gated at masb.org.my.** The ¶4.2 / ¶5.5 item lists were
   read **verbatim via the IFRS-for-SMEs modules 04 and 05**, which MPERS adopts word for word —
   a defensible route, and named as a route rather than presented as a direct read.
2. **The live SSMxT element list was NOT obtained** — only a 2022 consultation draft. No primary
   SSM MBRS circular was fetched either. **SSMxT is therefore a CROSS-CHECK, not a spine**
   (design D-13 item 2), and the diff against the live list is a named build obligation.
3. **LHDN Public Ruling 6/2000** (record keeping) text was not retrieved.
4. **RMCD/SST and EPF/SOCSO/EIS payable naming** — not researched.

**Every family row in Annex B carries its `basis`, and a family whose basis is not an MPERS
paragraph says `firm practice` in as many words.** Review law 2 applied to a seed chart: a
family that cannot say where it came from has established nothing.

---

## Annex B · The seed chart — families, not accounts

**What is seeded is the PLATFORM STARTER, in `draft`.** Nothing applies until a firm forks it
and an admin **publishes**. The account rows themselves (codes and names) are gate **Q1**'s
answer: if BELCORT hands over its existing chart, that chart is the starter and this annex's
families become its grouping. **The family cut below is the part that is designed rather than
supplied**, because it is what the trim operates on and what F-T3 later keys against.

### B.1 The `core` families — never trimmable, every client, every industry

| `family_key` | Covers | `basis` |
|---|---|---|
| `cash_and_bank` | cash on hand, petty cash, bank current/savings | MPERS ¶4.2(a) |
| `trade_receivables` | trade debtors control (`account_class='receivable'`), other receivables, deposits, prepayments | MPERS ¶4.2(b) |
| `trade_payables` | trade creditors control (`account_class='payable'`), other payables, accruals | MPERS ¶4.2(f) |
| `statutory_payables` | EPF · SOCSO · EIS · PCB/MTD · **SST output** (`special_acc_type='sst_output'`) | firm practice + MPERS ¶4.2(f) — **names are gate Q11** |
| `equity_common` | retained earnings (`special_acc_type='retained_earnings'`, equity-typed) | MPERS ¶4.2(q) |
| `revenue` | sales/fees by principal line, other income | MPERS ¶5.5(a) |
| `employment_costs` | salaries, EPF/SOCSO/EIS employer, bonus, staff welfare | MPERS ¶5.5 (by nature) |
| `premises_and_admin` | rent, utilities, telephone, insurance, printing, professional fees | MPERS ¶5.5 (by nature) |
| `finance_costs` | bank charges, interest, realised/unrealised FX | MPERS ¶5.5(b) |
| `system_roles` | rounding (`special_acc_type='rounding'`), opening balance equity (`opening_balance_equity`, equity-typed), **SST purchase cost** (`sst_purchase_cost`, expense-typed) | PRD §6 invariants 7 and 12; the estate's own five markers |

### B.2 The `by_industry` families — what the trim actually decides

| `family_key` | Trim keys | Covers |
|---|---|---|
| `inventory_and_cogs` | `trade_natures = {goods_trading, mixed}` | inventory, purchases, carriage inwards, opening/closing stock, cost of sales |
| `manufacturing` | MSIC Section **C**; `trade_natures={goods_trading,mixed}` | raw materials, WIP, finished goods, factory overheads, direct labour |
| `property_rental` | MSIC Section **L** | rental income, quit rent, assessment, property maintenance, agent commission |
| `construction_contracts` | MSIC Section **F** | contract WIP, retention receivable/payable, progress billings, subcontractor costs |
| `professional_services` | MSIC Sections **M**, **N**; `trade_natures={services,mixed}` | fee income by service, disbursements recoverable, subcontracted professional fees |
| `motor_vehicles` | `opt_in` | motor vehicles at cost, accumulated depreciation, road tax, insurance, **running costs (tax-split, B.3)** |
| `foreign_currency` | `opt_in` | FX-denominated bank, realised/unrealised gain/loss |

### B.3 The `by_industry` and `opt_in` families cut for TAX, per design D-14

Each of these is its own family **specifically so F-T3's add-backs land on a clean account**
rather than on an apportioned share of a mixed one:

`entertainment` · `donations_approved` · `donations_unapproved` · `fines_and_penalties` ·
`depreciation_and_amortisation` · `leave_passage` · `private_and_proprietor_expenses` ·
`motor_running_costs`

### B.4 The `entity_types` conditional — the equity section swaps

| `entity_types` | Family | Covers |
|---|---|---|
| `{sdn_bhd, bhd}` | `equity_company` | share capital, share premium, reserves |
| `{sole_prop}` | `equity_sole_prop` | **proprietor's capital, proprietor's drawings — EQUITY, never a staff advance** (hard constraint 13's BEE case, stated in the family's own `basis`) |
| `{partnership, llp}` | `equity_partnership` | partners' capital accounts, partners' current accounts, partners' drawings |

`equity_common` (retained earnings) is `core` and applies in every case.

### B.5 The numbering scheme — **NEEDS-DECISION, gate Q2**

*Recommendation:* the **4-digit block form** (`^[0-9]{4,8}$`), one block per `account_type` —
`1xxx` asset · `2xxx` liability · `3xxx` equity · `4xxx` income · `5xxx` cost of sales ·
`6xxx` expense · `9xxx` system roles. Grounds: it is the estate seed's own convention
(`0002_core_seed.sql:119-131`) and every Malaysian SME package uses it. The `NNN-XXXX` form is
live in the CHECK and is RPR's carried-down form (survey §2.4) — admitted, never the default.

---

## Annex C · The battery

**Discipline, restated because every cell below is written to it.** A wall's proof is a cell
that makes the wall REFUSE, never a substring match on source text (law 3). Absence is not
evidence (law 2) — a read that cannot say NO has a meaningless YES. Every forced cell asserts
its precondition or exits via a **named, counted** `skipHere`/`t.skip`, never `noteLane`+return,
never a swallowed `.catch`. Fixtures THROW on construction failure. Differential over
self-referential. **`clara.client_facts` is EMPTY across the seeded estate (survey F5c), so every
fact-reading cell PLANTS its fact** — a cell relying on the seed for a fact is vacuous.

| # | Cell | Shape |
|---|---|---|
| 1 | apply onto an empty chart plants exactly the KEPT families' accounts | a **MAP of `account_code → (type, class, special)`** compared to the expected map, **not a count** (the roster-maps-not-counts lesson) |
| 2 | apply onto a NON-empty chart refuses `chart_not_empty` | **plus the inverted twin**: the same call after `pnpm db:reset` + re-seed SUCCEEDS. A refusal cell without its twin proves the door is broken, not that the wall works |
| 3 | idempotence is the OP-KEY path, not a silent no-op | replay with the SAME batch key returns the stored result and plants nothing new; **a DIFFERENT batch key on the same client refuses at rung 5** |
| 4 | the template cannot carry two rows with the same `special_acc_type` | the partial unique on `coa_template_accounts` REFUSES at insert — so `uq_coa_special` never fires at apply. Twin: drop the template's index and prove the apply then fails, locating the wall |
| 5 | **platform visibility is POSITIVE** | a bookkeeper of firm B **IS returned** the `scope='platform'` template row; and firm B **is NOT** returned firm A's `scope='firm'` row. Both directions, because a leak-only cell cannot distinguish "isolated" from "broken" |
| 6 | the agent cannot apply | `apply_coa_template` under a wake credential **RAISES** (`CLR04`/`CLR03` from `_human_ctx`), and the raise is asserted by class — not "the grant is absent" |
| 7 | the proposal writes ZERO accounts | **differential `count(*)` on `clara.coa_accounts` measured around the call**, never the return value |
| 8 | an unresolvable fact citation REFUSES the proposal | `basis_unresolvable`; twin: a real live `client_facts` id for THIS client is admitted, proving the cell discriminates |
| 9 | a basis citing ANOTHER client's fact REFUSES | `CLR11` — tenant congruence at the door, not only at the FK |
| 10 | **MSIC and `trade_nature` both ABSENT** → the proposal is admitted, carries `"axis":"core_only"`, and its `keep_families` is exactly the `inclusion='core'` set | twin: with `trade_nature='services'` planted, `inventory_and_cogs` is DROPPED. Proves the fail-closed branch is a branch, not a coincidence |
| 11 | a `core` family in `p_drop`/absent from `p_keep` refuses `core_family_dropped`, naming it | + an unknown family refuses `unknown_family`, naming it |
| 12 | **a template edit after adoption leaves the client's chart byte-unchanged** | full snapshot of the client's `coa_accounts` rows before and after fork→edit→publish; assert equality. This is the cell that proves D-2's copy-not-reference claim |
| 13 | a published template is IMMUTABLE | update/delete on a published header, family or account row RAISES |
| 14 | the drift read classifies | plant an added account → `off_template`; retype one → `retyped`; rename one → `renamed`; delete a family member → `missing`; a client with no adoption → `never_adopted`. **Each with an adversarial twin that mutates the fixture so a wrong predicate MISSES it** |
| 15 | **the account-code CHECK drift-guard** | read `ck_coa_account_code_0009` and the template's own code CHECK via `pg_get_constraintdef`; assert the predicate texts are equal. **Adversarial twin: mutate one and prove the cell FAILS** — a pin that cannot fail is not a pin |
| 16 | forced-RLS + ACL census on all four new tables | `relrowsecurity` AND `relforcerowsecurity` both true; the owner policy and the scoped human read present; zero unexpected non-owner grantees. Twin: grant one and prove the census fails |
| 17 | `is_bank_account` is FALSE on every applied row | and `add_bank_account` still flips it afterwards — the boundary holds in both directions |
| 18 | applying to a client of ANOTHER firm refuses `CLR11` | inherited from the core; **proven, not assumed** |
| 19 | the receipt lands on the `f_a7b` surface and is READABLE through `agent_receipts_visible` | with `verdict->>'act' = 'coa_template_trim'`; and `agent_receipt_surfaces` still holds exactly 8 rows (no ninth member was minted) |
| 20 | every applied account carries an `_audit` row and an `account.upserted` event | differential counts around the apply — the core's own side-effects survive the loop |

---

## Annex D · Frontend homes and cross-train obligations

**Per `.claude/rules/db-migrations.md`: every `clara_authenticated` door names its home.**

| Door | Floor | Frontend home |
|---|---|---|
| `list_coa_templates` · `get_coa_template` | bookkeeper (read) | `/admin` template editor panel; also the checklist card's family list |
| `fork_coa_template` · `upsert_coa_template_family` · `upsert_coa_template_account` · `publish_coa_template` · `retire_coa_template` | **admin** | `/admin` template editor panel |
| `apply_coa_template` · `add_coa_template_family` | bookkeeper | **T11's onboarding checklist card** (R7's in-thread shape, `port-wave-plan-2026-08-28.md:385-389`) |
| `get_coa_template_adoption` | bookkeeper (read) | the checklist card; the client chart register |
| `coa_template_drift` | bookkeeper (read) | `apps/web/components/registers/chart-of-accounts-register.tsx` — a `StateBanner`, never a UI-computed count |
| `firm_coa_drift` | admin (read) | `/admin` template editor panel, the drift list |
| `wake_propose_coa_template_trim` | **no human floor — wake only** | non-UI by nature; its OUTPUT surfaces on the checklist card |

**The `/admin` shell.** T10 already places the vendor-binding governance panel under `/admin`
(`port-wave-plan-2026-08-28.md:371-373`), and P4 owns `set_firm_high_stakes_threshold` as *"P4's
settings switch"* (`:378`). OQ-7's *"a settings surface does not exist"* (`-part2.md:409-412`) is
about a **client** surface. **If the build lane finds no `/admin` shell in `apps/web`, this panel
is its first tenant — recorded as a scope note, never absorbed silently.**

**Accessibility and copy (Q5, Q7).** The keep/drop list is a real `<fieldset>` of real checkboxes
in DOM order, each with its visible per-family reason and resolved basis; refusals land in an
`aria-live` region; the card is fully keyboard-operable and the keyboard-walk CI gate binds it by
name. Nothing here is a statutory instrument, so BM is not day-one on these screens. WCAG 2.2
SC 2.5.8 (裁-13) applies at P6 like every other surface.

### Cross-train obligations

1. **T2 (opening & carry-down)** renders `chart_not_adopted` as a **first-class blocked state**
   on the seed lifecycle, rather than letting an account-not-found error surface mid-draft.
   Grounds: `opening_tb_targets` FKs onto `coa_accounts` (survey F4b) and T2 has no
   chart-creation door (survey F8). **One banner; no door.**
2. **T4 (accounts)** owns `chart-of-accounts-register.tsx`; the drift banner is a ride-along on
   that file, not a competing edit. Coordinate at merge (the four shared `apps/web` files are the
   port wave's whole merge risk, `port-wave-plan-2026-08-28.md` §3).
3. **T11 (onboarding five)** owns the checklist card; the chart row is a ride-along.
4. **F-A7b PR-c** mints `clientOnboarding_v4`; design D-7's two interview changes ride it. If
   this train lands first it mints v4 and PR-c rides. **Whoever is second must not mint a v5.**
5. **裁-22's PR** should extend its basis contract to the **fact-citation** form (design D-9)
   rather than discover it. Its ruling says both doors move *"in ONE migration pair (one
   contract, never one door)"* — a third door with a fact basis is a contract question, not a
   surprise.
6. **F-T3 PR-4** adds `coa_template_accounts.default_tax_treatment_code` with its FK from birth
   (design D-14).

---

## Annex E · The non-goals, each with its reason

| Not built | Reason |
|---|---|
| Any agent path to the BULK apply | One rationale covering forty accounts is not forty rationales. Clara proposes; a human applies. |
| A wall on client-specific accounts | Design D-11's three grounds. A read, not a refusal. |
| A parent/child hierarchy or report-line rollup | F-T3 measured its absence (`tax-computation-survey.md:82-96`) and F-A5's report specs own grouping. A rollup here is a second architecture for one semantic (TA-P11). |
| An `is_bank_account` column on the template | `0038:248-252`: the asset-typed/active/non-control law is enforced *"by the `add_bank_account` VERB in-txn, not by a DDL constraint"*. Applied rows land `false`; a bank account is registered through its own door. |
| An MSIC→industry mapping table | The estate holds no MSIC registry and says so (`0055:377-381`). A mapping table implies a validation the product cannot perform. Industry rules live on `coa_template_families.msic_sections/msic_divisions` as **firm policy authored by a human**. |
| A migration-seeded template per firm | Only the **platform starter** is seeded. A firm gets its own by `fork_coa_template` — an audited act with an actor — so no firm silently acquires a chart nobody chose. |
| Retiring or de-activating accounts at apply | The core sets `is_active=true` on every write and never deactivates. Tidying an over-applied chart is `upsert_account`'s existing job. |
| A new receipt surface member | `f_a7b`/`onboarding_agent_receipts` fits by construction (design D-6). Zero registry rows, zero CHECK swaps. |
| A new wake kind | `interactive_client` is client-pinned and already allowlisted for `wake_upsert_account` (survey F3, F9b). |

---

## Annex F · The full DDL sketch

Every table: `enable row level security` **and** `force row level security`, the owner policy
(`for all to clara_fn_owner using (true) with check (true)`), the scoped human read, the matching
grant, and append-only/no-truncate triggers on the published tiers.

```
clara.coa_templates
  id uuid pk default gen_random_uuid()
  scope        text not null check (scope in ('firm','platform'))
  firm_id      uuid references clara.firms(id)
  template_key text not null check (btrim(template_key) <> '')
  version      int  not null check (version > 0)
  title        text not null check (btrim(title) <> '')
  framework_hint text not null check (framework_hint in ('MPERS','MFRS','any'))
  basis        text not null check (btrim(basis) <> '')
  state        text not null default 'draft' check (state in ('draft','published','retired'))
  content_sha256 bytea check (content_sha256 is null or length(content_sha256) = 32)
  forked_from  uuid references clara.coa_templates(id)
  created_by   uuid not null references clara.users(id)
  created_at   timestamptz not null default now()
  published_by uuid references clara.users(id)
  published_at timestamptz
  unique (scope, firm_id, template_key, version)
  -- R-L26: an EXPLICIT scope column, never a NULL inference (survey F10's warning)
  constraint ck_coa_templates_scope check ((scope = 'firm') = (firm_id is not null))
  constraint ck_coa_templates_published check (
    (state = 'published') = (published_by is not null and published_at is not null
                             and content_sha256 is not null))
  -- read policy: scope = 'platform' OR firm_id = clara.jwt_firm()

clara.coa_template_families
  template_id  uuid not null references clara.coa_templates(id)
  firm_id      uuid                                   -- null iff the template is platform-scoped
  family_key   text not null check (family_key ~ '^[a-z][a-z0-9_]*$')
  label        text not null check (btrim(label) <> '')
  inclusion    text not null check (inclusion in ('core','by_industry','opt_in'))
  basis        text not null check (btrim(basis) <> '')     -- MPERS para, or 'firm practice'
  sort_ordinal int  not null
  msic_sections   text[] not null default '{}'
  msic_divisions  text[] not null default '{}'
  trade_natures   text[] not null default '{}'
  entity_types    text[] not null default '{}'
  primary key (template_id, family_key)
  -- a 'core' family carries no trim keys: it applies unconditionally
  constraint ck_coa_family_core_unkeyed check (
    inclusion <> 'core' or (msic_sections = '{}' and msic_divisions = '{}'
                            and trade_natures = '{}' and entity_types = '{}'))

clara.coa_template_accounts
  template_id  uuid not null
  firm_id      uuid
  family_key   text not null
  account_code text not null
  name         text not null check (btrim(name) <> '')
  account_type text not null
  account_class    text
  special_acc_type text
  sort_ordinal int not null
  primary key (template_id, account_code)
  foreign key (template_id, family_key) references clara.coa_template_families
  -- MIRRORS of coa_accounts' live constraints. The code CHECK is drift-guarded by
  -- Annex C cell 15, which reads BOTH predicates live and asserts textual equality.
  constraint ck_coa_tmpl_code  check (account_code ~ '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$')
  constraint ck_coa_tmpl_type  check (account_type in ('asset','liability','equity','income','expense'))
  constraint ck_coa_tmpl_class check (account_class is null or account_class in ('payable','receivable'))
  constraint ck_coa_tmpl_special check (special_acc_type is null or special_acc_type in
    ('rounding','sst_output','sst_purchase_cost','opening_balance_equity','retained_earnings'))
  constraint ck_coa_tmpl_obe check (special_acc_type is distinct from 'opening_balance_equity'
                                    or account_type = 'equity')
  constraint ck_coa_tmpl_re  check (special_acc_type is distinct from 'retained_earnings'
                                    or account_type = 'equity')
  constraint ck_coa_tmpl_sst check (special_acc_type is distinct from 'sst_purchase_cost'
                                    or account_type = 'expense')
  -- mirrors uq_coa_special so a bad template fails at AUTHORING, not at apply
  unique (template_id, special_acc_type) where special_acc_type is not null

clara.coa_template_adoptions
  id uuid pk default gen_random_uuid()
  firm_id      uuid not null references clara.firms(id)
  client_id    uuid not null
  template_id  uuid not null references clara.coa_templates(id)
  template_version int not null
  state        text not null check (state in ('proposed','adopted','declined','superseded'))
  families     text[] not null
  family_rationales jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(family_rationales) = 'object')
  basis        jsonb check (basis is null or jsonb_typeof(basis) = 'object')
  proposed_by  uuid references clara.users(id)      -- null on a human-direct adoption
  proposed_at  timestamptz
  receipt_id   uuid references clara.onboarding_agent_receipts(id)
  adopted_by   uuid references clara.users(id)
  adopted_at   timestamptz
  superseded_by uuid references clara.coa_template_adoptions(id)
  constraint fk_coa_adoption_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id)
  constraint ck_coa_adoption_proposed check (
    (proposed_by is null) = (proposed_at is null))
  constraint ck_coa_adoption_adopted check (
    (state = 'adopted') = (adopted_by is not null and adopted_at is not null))
  -- an agent proposal ALWAYS carries a receipt and a basis; a human-direct adoption carries
  -- neither. Two-way, so a proposal cannot arrive receipt-less.
  constraint ck_coa_adoption_agent_receipted check (
    (proposed_by is null) = (receipt_id is null and basis is null))
create unique index uq_coa_adoption_live on clara.coa_template_adoptions (client_id)
  where state = 'adopted';
create unique index uq_coa_adoption_open on clara.coa_template_adoptions (client_id)
  where state = 'proposed';
```

---

## Annex G · The build sequence and the width ruling

**Four PRs. The width ruling: the trim proposal is severed from the template, because the
template is a data structure and the trim is judgement logic on an injection surface.**

| PR | Scope | Ceremony | Review |
|---|---|---|---|
| **PR-0** | the gate — this design set, the rig replay, the owner's answers folded | none | the gate itself |
| **PR-a** | **the template**: the four relations, RLS/ACL, `fork_coa_template`, the four editor doors, `publish_coa_template`, `retire_coa_template`, the reads, **and the platform starter seed rows** | **none — D1 inventory EMPTY** | full ladder |
| **PR-b** | **the apply**: `apply_coa_template`, `add_coa_template_family`, `coa_template_drift`, `firm_coa_drift` | **none — D1 EMPTY** | full ladder + **independent pass** (D-3's ladder is judgement logic) |
| **PR-c** | **the trim**: `wake_propose_coa_template_trim`, its allowlist row, the receipt write, and D-7's interview changes riding `clientOnboarding_v4` | **none** (a workflow deploy, not a D1 window) | full ladder + independent pass + **law 28's cross-model adversarial pass — MANDATORY** (injection surface) |
| **PR-d** | the frontend: the `/admin` editor panel, the checklist row, the register banner | none | full ladder + the a11y and keyboard-walk files |

**PR-0's replay obligations** (each a settle-event before authoring, `wave-f-lane-brief.md`):

1. Re-derive and re-pin the **four** shas of the `upsert_account` chain at the then-frontier
   (survey F2a) — they will have moved.
2. **Locate where `CLR37` entered `_upsert_account_core`** (survey F2b, P-2 REFUTED). Until it
   is located, no lane may claim to know the core's full ladder.
3. Re-read `ck_coa_account_code_0009`'s predicate text live, for cell 15's pin.
4. Confirm `clara.client_fact_keys`' live row set — it grew from 2 to 5 without anyone
   updating a design doc (survey F5); assume nothing about its size.
5. Confirm `agent_receipt_surfaces` still holds `f_a7b`, and its live row count.
6. Confirm whether any FK references `uq_coa_account_id_tenant` (survey P-7, still open).
7. Run the `open_questions.origin` emitter scan (survey P-12, still open).

**Sequencing.** PR-a and PR-b may run back to back on one lane. **PR-c depends on F-A7b PR-c**
(the `clientOnboarding_v4` mint) only for coordination, not for code. **PR-d depends on T11**,
which depends on the F-A7b build train — so the backend lands first and the checklist row is a
T11 ride-along, exactly as 裁-21 sequences it (design gate → backend train → frontend train).

**Effort, calibrated against P3 lanes:** PR-a ≈ 0.8 · PR-b ≈ 0.7 · PR-c ≈ 0.9 (the cross-model
pass dominates) · PR-d ≈ 0.6. **≈ 3.0 P3-lane equivalents**, plus the gate.
