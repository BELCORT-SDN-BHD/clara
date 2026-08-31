# 裁-21 — the firm-level standard chart of accounts: DESIGN **v1 DRAFT**

> **RULINGS APPLIED 2026-08-29 (裁-23) — the gate CLOSED; all twelve ruled, per-question in
> `coa-template-gate-record.md` (ledger `mohe-grill-rulings-2026-08-28.md` §裁-23). Every
> **NEEDS-DECISION** line below is answered there; the text below is **not rewritten** — it is
> the argument the rulings were made against.** What now binds, where it moves this design:
> **Q1** the template is RESEARCH-DERIVED (official sources + Malaysian best practice + what
> mainstream Malaysian software ships, newest editions) and **the owner waived his review of the
> draft** — a **research lane precedes PR-0** and its output is what Annex B's family list must
> become; **D-13's four rules stand** (basis named or "firm practice", SSMxT a cross-check, the
> rows still reviewed DATA in a migration, never a one-click import) · **Q2 OVERRULED — neither
> legacy numbering convention**, so Annex B.5's 4-digit recommendation is set aside and the
> research decides · **Q6 WIDENED — Clara ASKS FIRST** when the industry is unknown (core family
> meanwhile), so **D-8's fail-closed branch is the interim state, not the end state**, and the
> in-thread ask is behaviour this design now owes · **Q8 WIDENED — the add-back LIST comes from
> the research**, D-14's eight families becoming a floor to check it against (the tax COLUMN's
> deferral to F-T3 PR-4 is untouched) · **Q11 WIDENED — mainstream Malaysian naming per the
> research**, Annex B.1's English names only a fallback · **Q3** Clara proposes → a bookkeeper
> **edits** (D-3's `p_families`) and applies → an admin publishes · **Q4 · Q5 · Q7 · Q9 · Q10 ·
> Q12 as designed** (so **§7's D1 inventory stays EMPTY**) · **the maintenance model is RULED**
> (gate record §1a) and is exactly D-2 + D-11 + the already-allowlisted `wake_upsert_account`.
> **One reconciliation named rather than assumed:** Q1 ships the template **published** while Q3
> keeps **admin publishes** as the in-product act — the seeded platform template arrives
> published through the migration ladder, the admin floor governs a firm's own fork afterwards
> (D-2). If the build finds a shape where those two meet, that is an owner question, never a
> silent choice.
>
> **Design doc of record for 裁-21** (`mohe-grill-rulings-2026-08-28.md` `:276-286`). Estate
> as-found: **`coa-template-survey.md`** (findings F1-F10, replay ledger P-1…P-12 — **two
> REFUTED**). Mechanics, the seed chart, the battery and the build sequence:
> **`coa-template-annexes.md`**. Owner questions: **`coa-template-gate-record.md`**.
>
> **Binds under:** hard constraints **1**, **2**, **10**, **13**, **14** ·
> `docs/product/PRD.md` **§5 journey 2** and **§6 invariants 1, 2(b), 2(c), 2(d), 10** (LAW) ·
> `docs/ARCHITECTURE.md` §5 · `fa7b-gate-record.md` (the five playbooks, CLOSED) · **裁-22**
> (proposal bases become DB-resolved citations) · TA-P1 C's rider · TA-P8 · TA-P11 · review
> laws **1, 2, 3**.
>
> **Judgement logic, flagged for review law 1:** D-3's refusal ladder, D-8's fail-closed trim,
> D-9's basis resolution, D-11's drift classifier. Each takes an independent review pass before
> merge, and §4 is an **injection surface** (the trim reads model-proposed family names) —
> law 28's cross-model adversarial pass is **mandatory** on the train carrying it.

---

## 1 · The ruled shape (fixed, not designable)

- **A firm-level template exists; Clara trims by industry; a human confirms; F-T3 consumes the
  same codes.** 裁-21, verbatim. Sequenced **before beta**.
- **A chart carries no numbers**, so constraint 2 is not engaged by the template itself — **but
  the chart is the frame every number later lands in**, and invariant 10's *"refuse to code to a
  non-existent COA account"* makes a MISSING account a posting failure. That asymmetry governs
  D-8's trim posture: an unused account is tidy-able, a missing one blocks work.
- **Book writes go only through named, audited Postgres functions** (invariant 10). The APPLY
  plant is the new, ungranted `clara._coa_plant_family`: one plain INSERT per account, carrying
  the established child op receipt, audit row, `account.upserted` event and `t_coa_stamp` firm
  stamping. It deliberately does **not** call the conflict-overwriting shared upsert core: a
  concurrent human code collision refuses `chart_adoption_race` and rolls back the whole apply.
  *(Round-3 accounting-correctness amendment, 2026-08-31; hard constraint 1.)*
- **New authority arrives as sibling verbs** (TA-P1 C's rider). **No live body is rewritten**:
  §7's D1 inventory is EMPTY, and that is a design property, not luck.
- **The agent proposes; a human applies.** Clara may already write one account unattended
  (survey F3); that lane is untouched, and no agent path to the BULK act is added.
- **The UI never invents a number, verb, receipt or link** — every affordance in §8 names a live
  or proposed verb, or is labelled NEEDS-VERB.

---

## 2 · The seed's provenance — there is no official Malaysian chart, and the design says so

**No official Malaysian instrument is a chart of accounts.** Re-fetched 2026-08-29; URLs and
fetch dates are `coa-template-annexes.md` **Annex A**. In one paragraph: **MPERS §4/§5** (word-
for-word adoptions of IFRS-for-SMEs modules 04/05) prescribe **minimum face line items only** —
para **4.2** (18 SoFP items) and **5.5** (9 SoCI items) — with **no sequence, no account codes**,
by-nature-or-function free (MPERS 2016 live; MPERS 2025 effective for periods beginning on or
after **2027-01-01**). **SSM's MBRS 2.0 taxonomy (SSMxT)** — `FS-MPERS`/`FS-MFRS` templates,
**mandatory for all companies from 2025-06-01** — IS a real controlled vocabulary, finer than
MPERS, but the research lane reached only a **2022 consultation draft**, not the live element
list (survey §7 item 2). **LHDN prescribes no chart** (its e-Invoice classification codes tag
invoice *lines*, not GL accounts); **MIA**'s Illustrative MPERS FS is a presentation model;
**CA 2016 s.244/245/246** and **ITA 1967 s.82** constrain **records**, not accounts.

### D-13 · The seed's provenance rule

**The spine is MPERS 4.2 + 5.5's minimum line items; the codes, the sub-account granularity and
every Malaysian statutory-payable name are the FIRM's, authored as DATA through the ladder.**

1. **Every seeded family names its MPERS paragraph** in a `basis` column, or names *"firm
   practice"* explicitly; a family with neither is refused at insert. Review law 2 applied to a
   seed — a family that cannot say where it came from has established nothing.
2. **SSMxT is a CROSS-CHECK, not a spine.** When the live element list is obtained, Annex B's
   family list is diffed against it and divergences recorded. Shipping against an unfetched
   taxonomy is exactly the stale-source failure `AGENTS.md` forbids.
3. **The seed rows ride the full ADR-061 ladder as DATA in a migration**, reviewed line by line
   — **never a one-click "import a chart" door.** 裁-21's own words.
4. **The shipped interview question is re-worded.** *"Apply the standard LHDN-aligned MPERS Chart
   of Accounts seed"* (survey F1) asserts an alignment no source supports; it becomes *"Start
   this client from the firm's standard chart of accounts?"* — **NEEDS-DECISION, gate Q9.**

---

## 3 · The template — four relations, one lifecycle

### D-1 · The relations — **NEEDS-VERB**

**Naming is load-bearing: `chart_templates` and `chart_template_versions` ALREADY EXIST and are
dataviz chart specs** (survey F10). Everything here carries the `coa_` prefix.

| Relation | What it is | The columns that carry the design |
|---|---|---|
| `clara.coa_templates` | the versioned header | `scope ('firm'\|'platform')` · `firm_id` · `template_key` · `version` · `framework_hint` · `basis` · `state ('draft'\|'published'\|'retired')` · `content_sha256` · `forked_from`. **`CHECK (scope='firm') = (firm_id is not null)`** |
| `clara.coa_template_families` | **the TRIM UNIT** — what Clara keeps or drops | `family_key` · `inclusion ('core'\|'by_industry'\|'opt_in')` — **`core` is NEVER trimmable** · `basis NOT NULL` (the MPERS para, or `firm practice`) · `msic_sections[]` · `msic_divisions[]` · `trade_natures[]` · `entity_types[]` |
| `clara.coa_template_accounts` | the rows | `family_key` · `account_code` · `name` · `account_type` · `account_class` · `special_acc_type` · `sort_ordinal`. **Mirrors `uq_coa_special`** as `unique (template_id, special_acc_type) where … not null`, and mirrors the code / class / OBE / RE / SST CHECKs |
| `clara.coa_template_adoptions` | one row per client, two states | `client_id` · `template_id` · `template_version` · `state ('proposed'\|'adopted'\|'declined'\|'superseded')` · `families[]` · `family_rationales` · `basis` · `proposed_by`/`at` · `receipt_id` · `adopted_by`/`at`. `unique (client_id) where state='adopted'`, same for `'proposed'` |

Full column lists, CHECKs and policies: **Annex F**. Every table takes `enable` **and** `force
row level security`, the owner policy and the scoped human read
(`.claude/rules/db-migrations.md`).

**The `scope` column, and why not the estate's own NULL idiom.** `p_charttemplates_human` uses
`firm_id IS NULL OR firm_id = clara.jwt_firm()` (survey F10) — the lane brief forbids exactly
that: *"Never infer 'platform' from a NULL — that fails OPEN."* The read policy here is
`scope = 'platform' OR firm_id = clara.jwt_firm()`, with the paired CHECK making the two
columns provably consistent, and a **POSITIVE** cell proving a platform row IS returned to a
bookkeeper of another firm (Annex C cell 5). Absence of a leak is not evidence of visibility.

**Why `coa_template_adoptions` is ONE relation with two states, not a proposal table plus an
adoption table.** TA-P11: never two architectures for one semantic. The semantic is *"this
client's chart came from template X, families Y."* Clara's proposal inserts at `'proposed'`
(`proposed_by` set, `adopted_by` null); a human applying directly inserts at `'adopted'`
(`proposed_by` null). A declined proposal is `'declined'`, not a deleted row — law 6.

### D-2 · Versioning — a copy, not a reference

**A template edit CANNOT rewrite an applied chart, and the reason is structural, not
disciplinary: the apply COPIES rows into `coa_accounts`.** Once applied, the client's chart is
`coa_accounts` rows with their own `account_id`s, their own `journal_lines`, their own history.
Nothing in `coa_accounts` points back at a template. The `coa_template_adoptions` row records
*which* template version was applied so drift is measurable (§6), and it is a **record**, never a
live binding.

Versions still exist, because a firm needs to know what it applied:

- A **published** template is IMMUTABLE — an update or delete on `coa_templates`,
  `coa_template_families` or `coa_template_accounts` for a published template RAISES. The idiom
  is `chart_template_versions`' own publication-freeze trigger (survey F10), cloned.
- Changing a published template = `fork_coa_template` → a new `version` in `'draft'` → edit →
  `publish_coa_template`. `content_sha256` is computed at publish over the canonicalised family
  + account rows, so two publishes of identical content are visibly identical.
- Retiring is a state, never a delete.

### D-3 · `apply_coa_template` — the human apply door — **NEEDS-VERB**

```
clara.apply_coa_template(p_client uuid, p_template uuid, p_families text[],
                         p_op_key text) returns jsonb
```

**Floor: bookkeeper.** **NEEDS-DECISION, gate Q3.** *Recommendation and grounds:* the underlying
`upsert_account` is already bookkeeper-floored, and applying the firm's standard to an empty
chart is daily work, not policy. **Publishing or editing the standard is admin** — that
asymmetry is the design's actual claim: the standard is a firm-level policy act, using the
standard is not. An admin floor here would put a partner in the loop for every new client and
buys nothing the empty-chart refusal does not already buy.

**The ladder, in order.** Each rung is a named refusal, all evaluated, never a silent no-op:

| # | Rung | Refusal |
|---|---|---|
| 1 | `p_op_key` non-empty | `CLR10` `op_key_required` |
| 2 | `_reserve_op(firm,'apply_coa_template',p_op_key,_hash(client,template,sorted(families)))` — a replay returns the stored result | (dedupe, not a refusal) |
| 3 | the client is in the caller's firm | `CLR11` `client_not_in_firm` |
| 4 | the template is `state='published'` and (`scope='platform'` OR its firm is the caller's) | `CLR10` `template_not_published` / `template_not_yours` |
| 5 | **the client's chart is EMPTY** — `not exists (select 1 from clara.coa_accounts where client_id = p_client)` | `CLR10` **`chart_not_empty`** |
| 6 | no live `coa_template_adoptions` row for the client | `CLR10` `already_adopted` |
| 7 | every member of `p_families` exists on the template | `CLR10` `unknown_family` *(names the offender)* |
| 8 | every `inclusion='core'` family is present in `p_families` | `CLR10` `core_family_dropped` *(names it)* |
| 9 | apply | — |

**Rung 5 is the design's sharpest choice — a refusal, not an additive merge.** An additive apply
onto a chart already holding a carried-down predecessor's accounts sprinkles the firm's standard
codes alongside the client's real ones: **two accounts for one meaning, and an error nowhere.**
Refusing forces a human to decide which chart the client is on. Constraint 1.

**The apply loop, and the op-key mechanic.** The ungranted `clara._coa_plant_family` writes one
account of the kept families at a time, ordered by `(sort_ordinal, account_code)`, with
`p_ctx = jsonb_build_object('actor', c.actor, 'firm', c.firm)`. It `_reserve_op`s under the
established `upsert_account` receipt namespace and derives a deterministic child key per account:
`p_op_key || ':' || account_code` — the
`0002_core_seed.sql:129` idiom, generalised. A replay with the same batch key short-circuits at
rung 2; a replay that reached the loop finds every child key already reserved and returns each
stored result. **A DIFFERENT batch key on the same client refuses at rung 5** — the cell that
proves idempotence is the op-key path and not a silent no-op (Annex C cell 3). Then: the
`coa_template_adoptions` row at `'adopted'` (or the client's `'proposed'` row moved there), one
`_audit` row, one `account.chart_applied` event, `_finish_op`.

The INSERT-only plant is load-bearing concurrency control. An unlocked empty-chart read can race
an ordinary human `upsert_account` at the same code; delegating to `ON CONFLICT DO UPDATE` silently
discarded the human's committed name. Plain INSERT linearizes the two possible orders: APPLY wins
and the later human rename stands, or the human wins and APPLY refuses without durable side effects.

### D-4 · `add_coa_template_family(p_client, p_template, p_family, p_op_key)` — **NEEDS-VERB**

Bookkeeper. Adds ONE family's accounts to a client that already adopted the same template
version, **refusing any account_code that already exists with a different `account_type` or
`account_class`** (`CLR10` `code_conflict`, naming the code) rather than letting the core's own
has-lines guard surface as a confusing mid-loop failure. Appends the family to the adoption
row's `families[]`.

**Why it exists:** "I trimmed too hard" is the most likely real-world failure of §4,
and without a named verb the recovery path is *"call `upsert_account` eleven times by hand"* —
which loses the family attribution and makes §6's drift read show a phantom off-template block.
The strict bulk door plus a narrow additive door beats one permissive door.

**BLOCKER-1 (round-3, the lost-update wall on the SAME family).** The door takes the adoption
row's lock FIRST — `select ... for update`
(`0156_coa_apply_template.sql:945`) — and drives both the `family_already_applied`
check and the additive `families[]` update from that locked read, never from a pre-lock record.
Two arms, closed for two different reasons, exactly as the round-3 archaeology measured it: a
caller-supplied `families[]` composed from the live `coa_template_adoptions.families` column
(the round-2 self-reference) already serializes the DIFFERENT-families arm on its own —
Postgres's own per-statement row lock on `UPDATE` re-evaluates that subquery against the
post-commit row, so two callers adding two different families both land with no explicit prior
lock needed. The explicit `for update` is what closes the SAME-family, different-op_key arm:
without it, two callers naming the same family both read it absent, both pass the check, and the
loser's plant re-inserts the winner's accounts. For the different-families arm the lock is
defense-in-depth, not the sole cause of the fix.

---

## 4 · The agentic half — Clara trims, a human confirms

### D-5 · The proposal verb — **NEEDS-VERB**

`clara.wake_propose_coa_template_trim(p_client uuid, p_template uuid, p_keep_families text[],
p_family_rationales jsonb, p_basis jsonb, p_rationale text, p_model jsonb, p_op_key text)
returns jsonb`

**It writes ZERO rows into `coa_accounts`.** It writes exactly two things: one
`coa_template_adoptions` row at `state='proposed'`, and one `onboarding_agent_receipts` row.
Annex C cell 7 proves the first claim by a **differential row count measured on the table**
across the call — never by trusting the return value (review law 2).

### D-6 · Which wake kind, and which receipt surface

**Wake kind: `interactive_client`. No new kind is minted.** Grounds, all measured (survey F9b):

- `ck_wake_credentials_kind_0011` admits seven kinds; `ck_wake_credentials_client_0011` requires
  `client_id IS NOT NULL` for `interactive_client`. **The trim is client-pinned by nature** — it
  happens after the client is born, inside the interview — so the pin is a wall, not a formality.
- **`wake_upsert_account` is ALREADY allowlisted for `interactive_client`**, so the chart
  surface and this wake kind already meet.
- Q-D8 already ruled the interview normalizer ships on `interactive_client` — *"one allowlist
  row, no new wake kind"* (`fa7b-gate-record.md:50-52`). The trim is the same moment.

*Rejected alternative, recorded:* the `filing` kind, which carries `wake_propose_client_onboarding`.
It is refused because `filing` must carry `client_id IS NULL` — the trim has a client, and
riding a client-less credential would throw away the pin.

**Receipt surface: reuse `f_a7b` / `onboarding_agent` / `clara.onboarding_agent_receipts`. No
ninth member.** `0142:256-283` made `document_id` **and** `client_id` both nullable and said why
in its own comment: *"later PRs' plan-tied acts (birth, answer proposals) will use
client_id/plan_id rather than document_id."* A client-tied, document-less onboarding act is
exactly that shape. Zero registry rows, zero CHECK swaps, zero shim re-cuts.

The act is discriminated inside `verdict`: `{"act":"coa_template_trim", "template_id":…,
"template_version":…, "kept":[…], "dropped":[…], "axis":"trade_nature|msic|core_only"}`.
**Named honestly as a weakness:** the surface has **no act column**, so a reader separating
F-A7b's acts must read `verdict->>'act'`. That is the same class as 裁-22's record-only receipt
looseness (`mohe-grill-rulings-2026-08-28.md:319-322`) and is registered as a backlog item
against the receipt contract, not fixed here.

### D-7 · The interview seam — and a segment the estate has been missing

Two changes, **both riding `clientOnboarding_v4`, which F-A7b PR-c already mints**
(`fa7b-onboarding-design.md:179-184`) — so this design costs **no additional workflow freeze
bump** (constraint 9). If PR-c's v4 lands first, these ride it; if this train lands first, it
mints v4 and PR-c rides.

1. **`coa_seed` is re-worded and its answer vocabulary widened** (D-13; gate Q9). The item key
   `coa_seed_decision` and its `required_for_commit` are UNCHANGED — they are a DB contract read
   by name inside `commit_client_onboarding` (`interview.v2.questions.ts:59-60`). The answer
   becomes `{"seed":"firm_template"}` or `{"seed":"manual"}`, `lhdn_mpers_standard` retained as
   an accepted legacy value on read.
2. **A NEW segment asks `trade_nature`**, immediately before `coa_seed`. Grounds (survey F5a,
   F5b): `trade_nature` is a **DB-validated enum** (`goods_trading · services · mixed`) that the
   close model already consumes fail-closed (`0056:1284-1291`, `:1482`), and **nothing captures
   it at onboarding today**. One question, three values, two consumers. `msic` stays where it is
   — optional, format-only, and the weaker axis.

### D-8 · What Clara actually reads, and the fail-closed branch

**The trim axes, in priority order:**

| Axis | Source | Why |
|---|---|---|
| `entity_type` | `client_facts` (enum, 8 values) | drives the **equity section** — share capital + retained earnings for `sdn_bhd`/`bhd`; capital + drawings for `sole_prop`; partners' capital + current accounts for `partnership`/`llp`. Constraint 13's BEE case is exactly this (a sole proprietor is not an employee; his account is EQUITY). Gate **Q10**. |
| `trade_nature` | `client_facts` (enum, 3 values) | drives **inventory and cost-of-sales**: a `services` client needs no Inventory, no Purchases, no Closing Stock. The single highest-yield trim. |
| `msic` | `client_facts` (format-only text) | narrows within a trade nature. **Keyed on SECTION (letter) or DIVISION (first two digits), NEVER the 5-digit item** — the research lane's finding; the leaf is unstable across editions (MSIC 2008 live, MSIC 2025 launched 2025-10-28). |
| the materials playbook | the interview | ③ `bank_only` / ④ `shoebox` take **no opening seed** (`fa7b-gate-record.md:14-16`), so their charts must still be complete — the trim does **not** get more aggressive because there are fewer materials. Recorded because the opposite is the intuitive mistake. |

**The fail-closed branch, which is behaviour and not a comment.** `msic` is
`requiredForCommit: false, skippable: true` (survey F6) and `client_facts` is empty across the
whole seeded estate (F5c) — **a client can be born, committed and active with no industry
signal at all.**

> **When an axis is absent, Clara proposes the `inclusion='core'` families ONLY, names the
> absent axis by name in her rationale, and proposes nothing on the strength of a guess.**

This clones the estate's own idiom exactly: `0056:1284-1291` returns
`{'state':'unknown','reason':'trade_nature_fact_absent'}` rather than assuming, and `0056:1482`
applies goods-trading checks *"unless the trade_nature fact POSITIVELY"* says otherwise. Review
law 2: absence is not evidence. Gate **Q6** asks the owner whether core-only or full-chart is
the better default, with core-only recommended and its cost stated.

**She may never infer an industry from the client's NAME.** Review law 3 — spelling is not
identity — and PRD §6 invariant 2(b) forbids constructing identifiers. "Highland Coffee Sdn Bhd"
is not evidence of food and beverage.

### D-9 · The basis — 裁-22's law, applied to a FACT citation

裁-22 rules that *"every citation in a proposal basis must resolve to a `document_regions` row of
the triggering document"* and that an unresolvable citation REFUSES the proposal
(`mohe-grill-rulings-2026-08-28.md:298-316`). **The trim's basis is not document-derived**, so a
literal reading of 裁-22 would either exempt it (wrong) or make it unbuildable (also wrong).

**The design applies 裁-22's LAW with the right instrument:**

```
p_basis = {"facts":  [{"fact_key":"trade_nature","fact_id":"<uuid>"},
                      {"fact_key":"msic",        "fact_id":"<uuid>"}],
           "plan_items": [{"item_key":"materials_basis","item_id":"<uuid>"}]}
```

and the door **RESOLVES every element against the live catalog before persisting anything**:

1. each `fact_id` must be a live (`superseded_at is null`) `clara.client_facts` row **for this
   client**, whose `fact_key` matches the claimed key → else `CLR10` `basis_unresolvable`;
2. each `plan_item_id` must belong to this client's latest committed onboarding plan;
3. **a citation naming another client's fact REFUSES** (`CLR11`) — tenant congruence, proven by
   its own cell (Annex C cell 9);
4. the persisted `basis` is the **DB-resolved** form (`fact_key`, `fact_value`, `recorded_at`,
   `basis_kind`), **never the model's own text**;
5. an EMPTY `facts[]` is lawful **only** when the proposal is `core_only`, and then the verdict
   must carry `"axis":"core_only"` — the two are checked together, never independently.

**This is a design decision the gate should see explicitly** (NEEDS-DECISION, folded into the
gate's §3): 裁-22's implementing PR touches two doors *"in ONE migration pair (one contract,
never one door)"*. If this train lands first, it ships the fact-resolution form and 裁-22's PR
should extend its contract rather than discover it.

---

## 5 · T2 and the carry-down — the ordering rule

### D-10 · **Template first, balances after.** Recommended; **NEEDS-DECISION, gate Q4.**

> **The chart is the firm's; the balances are the client's.** Every client is put on the firm's
> standard chart at onboarding, whatever materials they arrive with. A client with prior books
> then has the predecessor's trial balance **MAPPED ONTO** the firm's codes as part of the
> opening seed; a prior line that maps to nothing is an **explicit human decision** — map it, or
> add an account through `add_coa_template_family` / `upsert_account`, which §6 then reports as a
> client-specific addition. **The template is never a reason to lose an account the client
> actually used, and the predecessor's codes are never a reason to abandon the firm's chart.**

**Four independent grounds, none of them a preference.** (1) **PRD §5 journey 2 already orders
it** — *"identity interview → **seed COA + child tables** → for an ongoing client, carry down
opening balances…"* (`docs/product/PRD.md:123`). (2) **T2's own doors presuppose it**:
`record_opening_target` / `draft_opening_item` (`port-wave-plan-2026-08-28.md:232-235`) target
accounts, and `opening_tb_targets` carries an **FK onto `coa_accounts`** (survey F4b, measured)
— **T2's seed cannot draft an item against an account the chart does not hold**, which is
invariant 10 reaching the seed lane; T2 has no chart-creation door in its eleven (survey F8),
and this design supplies it. (3) **Rung 5 never bites this path**: at onboarding the newborn
client's chart is empty, so template-first is always available — order it the other way and
rung 5 fires on every ongoing client, the design fighting itself. (4) **It is what the owner
asked for**: *"firm practice starts every new client from a standard chart"* — a carry-down that
defines the chart is the practice being replaced.

**The honest exception, named rather than hidden.** Playbook ① (`predecessor_pack`) sometimes
arrives with a chart the firm would rather adopt wholesale. That stays available — as the
**explicit `manual` answer at `coa_seed`**, never as a silent fallback — and D-11 then reports
the client as `never_adopted`, which is precisely the visibility 裁-21 wants. A silent exception
defeats the feature; a named one is a firm decision on the record.

**T2 sequencing:** no code dependency (T2's doors are live at `0138`); the dependency is a
**runtime data ordering**, and T2's workbench should render `chart_not_adopted` as a first-class
blocked state on the seed lifecycle rather than letting an account-not-found error surface
mid-draft. A one-banner cross-train obligation, recorded in Annex D.

---

## 6 · Cross-client consistency — a READ, never a wall

### D-11 · The drift read — **NEEDS-VERB**

The owner's stated motive is that *codes drift across clients* (裁-21's context). The template
fixes the START; drift is what happens after. **The answer is visibility, not a wall.**

`clara.coa_template_drift(p_client uuid)` and `clara.firm_coa_drift()`, both `stable`,
**invoker-rights**, no definer wrapper — the estate's own `trial_balance` idiom (`0004:730-739`),
so RLS decides who sees what and no new read surface is invented. Five classes:

| Class | Meaning |
|---|---|
| `never_adopted` | no `'adopted'` adoption row — the client is off-standard entirely |
| `off_template` | a code in `coa_accounts` the adopted template version does not carry |
| `missing` | a template code in an ADOPTED family absent from the client |
| `renamed` | same code, different `name` |
| **`retyped`** | same code, different `account_type`/`account_class` — **the serious one**: one code meaning two different things in two clients' books |

**Why a read and not a wall on `upsert_account`.** (1) **Constraint 1** — a client genuinely
needs accounts the standard lacks; blocking that forces staff to work around the product, and a
worked-around control is worse than a visible report. The dangerous direction is a MISSING
account, and invariant 10 already refuses that posting. (2) **No live body moves** — a wall means
a CoR of `_upsert_account_core`: a D1 window and four shas to re-pin (survey F2a), bought for a
report a read gives free. §7's EMPTY D1 inventory is the direct payoff. (3) **TA-P8's shape** —
a learned deviation becomes policy by human promotion, not by refusal; a client-specific account
that many clients acquire is a signal the *template* should change, and the drift read is how a
firm sees that.

**Where "flagged in the P6 census" lands, stated precisely so it is not over-claimed.** The
drift read is a **product surface** (§8) — a firm panel row and a per-client register banner. It
is **not** a CI gate over estate data: constraint 13 makes every non-BELCORT client a resettable
fixture, so a green/red over fixture drift would measure nothing. What the **P6 exit gate** owns
is the ordinary obligation every door carries — that these two reads have named, wired frontend
homes and appear in the verb-coverage census's direction-2 sweep. Anything stronger would be a
gate over test data pretending to be a gate over the product.

---

## 7 · D-12 · The D1 write-quiesce inventory: **EMPTY**

**No live PL/pgSQL body is replaced by this feature.** The claim, item by item:

| Live body | Disposition |
|---|---|
| `clara._upsert_account_core(jsonb,…)` sha `5e0819f3…` | **UNCHANGED and no longer called by APPLY.** Round-3 proved its `ON CONFLICT DO UPDATE` can overwrite a concurrently committed human name; APPLY changes its new plant, never this shared core |
| `clara.upsert_account(…)` sha `45dc1f86…` | UNCHANGED — signature, floor, ACL, body |
| `clara._agent_upsert_account_core(…)` sha `10a7e6ed…` | UNCHANGED |
| `clara.wake_upsert_account(…)` sha `6a2809f9…` | UNCHANGED |
| `clara.commit_client_onboarding` | **UNCHANGED.** The apply is a separate human act *after* commit (§8) — TA-P1 C's rider honoured, not argued around |
| `clara._firm_question_core` / `wake_propose_client_onboarding` | UNCHANGED |
| `clara._agent_receipt_src_f_a7b` / `_agent_receipts_all` | **NOT re-cut.** The trim receipt is another ROW in `onboarding_agent_receipts`; the shim already projects it |
| `clara.coa_accounts` | **No ALTER, no CHECK swap, no new index, no trigger.** The template mirrors its constraints on its own table |

**What the file DOES:** four new tables + their RLS/ACL blocks, six new functions, one
allowlist row, one interview-workflow `_vN` (§D-7, riding PR-c's v4), and the seed rows as DATA.

**The four shas above are the PR-0 prestate pins**, re-derived by `pg_get_functiondef` on a
fresh rig at the then-frontier — **never trusted from this document**, because the frontier moves
and because survey F2b is this design's own proof that a body can carry a rung no file shows.

**The one alternative that WOULD cost a D1 window, priced so the gate can choose it.** If the
owner rules that `commit_client_onboarding` must apply the chart *in the same transaction*, that
is a CoR of a live admin-floored human body: a D1 write-quiesce window, a prosrc-SHA prestate
pin, a tail self-proof, and the full ceremony from merged `main`. **Recommended against** — it
also makes the chart un-reviewable (the human confirms answers, not a chart) and couples two
failure modes that are better kept apart. Gate **Q5**.

**One CHECK-drift hazard, named with its guard.** The template mirrors `coa_accounts`'
`account_code` CHECK by duplicating the predicate. A later recut of one and not the other is a
silent divergence. **The guard is a census cell that reads BOTH via `pg_get_constraintdef` and
asserts the predicate texts are equal, with an adversarial twin that mutates one and proves the
cell FAILS** (Annex C cell 15) — the P4-pin-night lesson: drift-guard the pin, and mutate the
instrument to prove it can say no.

---

## 8 · The frontend — two homes, two different acts

**The full surface spec is `coa-template-annexes.md` Annex D**, which names every door's
frontend home per `.claude/rules/db-migrations.md`. The shape in three lines:

1. **The firm template editor** — a **new panel on the EXISTING `/admin` surface** (T10 already
   puts the vendor-binding panel there, `port-wave-plan-2026-08-28.md:371-373`; OQ-7's *"a
   settings surface does not exist"* is about a **client** surface, and this is firm altitude).
   Admin floor. Authoring, publishing, retiring, and the firm drift list.
2. **The onboarding checklist card** — T11's in-thread card (R7's ruling, `:385-389`) is the
   **apply** surface: one row, opening a keep/drop family list with Clara's rationale and the
   resolved basis beside each. Bookkeeper floor.
3. **The client chart register** —
   `apps/web/components/registers/chart-of-accounts-register.tsx` (T4's file, `:283`) gains a
   drift `StateBanner`, never a count the UI computes.

**The remove-the-rail test** (PRD §5a, `docs/product/PRD.md:135`): remove Clara entirely and the
editor still authors a standard, the checklist row still offers *apply the standard chart* with
every family's `basis`, and the register still shows drift. **Only the proposed trim disappears
— and it is a proposal, which is exactly what should.**

---

## 9 · F-T3, and what this design deliberately does NOT build

### D-14 · The tax column is DEFERRED; the FAMILY CUT is tax-aware NOW

**Does the template carry a default tax treatment per family so F-T3 inherits it?**
**Recommendation: YES to a default treatment CODE per template account — but NOT in this train,
and NEVER as an auto-approved `tax_account_treatments` row.** Gate **Q8**.

**Why not now.** `clara.tax_treatment_codes` and `clara.tax_account_treatments` **do not exist**
at frontier `0142` — measured, not assumed (survey P-8 CONFIRMED). A
`default_tax_treatment_code text` with no FK, on a promise that F-T3 adds one later, is how a
code referencing nothing gets in. **The column rides F-T3's own PR-4** — the PR that creates both
relations (`tax-computation-design-part2.md:193`) — as a one-column ALTER with its FK from birth.

**Why never an auto-approved treatment row.** Three walls, each of which would have to be
defeated: (a) `_tf_tax_treatment_human_only` refuses a machine principal in `approved_by` or
`apportionment_entered_by` *"whatever door it came through"* (`tax-computation-design.md:94-97`);
(b) `approve_tax_treatment` counts eligible non-agent humans and requires a distinct checker
(`:98-103`); (c) treatments key on `(client_id, firm_id, account_id, ya)` — **per year of
assessment** — and `account_id` is minted per client at apply time (`0058:50-56`), so a template
row carries neither. A template applied in 2026 cannot pre-approve YA2028, and the law moves
between YAs. What the default legitimately does is feed `wake_propose_tax_treatment`'s
`proposal_basis` — *"the firm's standard chart names this code for this family"* — with a human
still approving. F-T3's own posture, not a shortcut past it.

**Why the family cut must be tax-aware NOW, with no tax column.** F-T3's add-backs key on exactly
the expense categories a lazy chart merges into "Operating Expenses" (the seed's own `6000`,
survey §2.3). **The template therefore splits, as first-class families:** entertainment ·
donations (approved vs unapproved) · fines and penalties · depreciation and amortisation · leave
passage · private/proprietor expenses · motor-vehicle running costs. Merge any of these and F-T3
must either ask a human per transaction or apportion a mixed account — the exact "apportionment
percentage" `tax-computation-design.md:84-85` calls *"the one judgement number that is genuinely
a number"* and confines to human keying. **A tax-aware chart is how the firm avoids that work
later**, and it costs nothing to cut the families that way today. Gate **Q8**.

**F-T3's keying is not fought.** Treatments key on `coa_accounts(account_id, firm_id, client_id)`
via `uq_coa_account_id_tenant` (`0058:56`; `tax-computation-gate-record.md:257-258`); every
account this design plants is a real `coa_accounts` row and gets a real `account_id` under that
unique. **No second account identity, no parallel key.**

### What this design deliberately does NOT build

**Seven non-goals, each with its reason, are `coa-template-annexes.md` Annex E.** The two a
reviewer is most likely to challenge, stated here: **no `is_bank_account` column on the
template** (`0038:248-252` records that the asset-typed/active/non-control law is enforced *"by
the `add_bank_account` VERB in-txn, not by a DDL constraint"* — every applied row lands `false`
and a bank account is registered through its own door), and **no MSIC→industry mapping table**
(the estate holds no MSIC registry and says so, `0055:377-381`; a mapping table would imply a
validation the product cannot perform, so the industry rules live on
`coa_template_families.msic_sections/msic_divisions` as **firm policy authored by a human**,
never as a claimed official mapping).
