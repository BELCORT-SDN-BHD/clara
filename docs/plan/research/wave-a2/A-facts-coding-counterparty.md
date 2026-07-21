# Lane A — Facts / Coding / Counterparty machinery the AR side must mirror

Scope: as-built truth (migrations 0009–0014) for the AP daily loop's facts →
coding-lane → counterparty-birth pipeline, plus the AB-3 attribution pin. Every
signature, table column, and gate below is quoted from the live migrations.
FACTS ONLY; anything I could not confirm is marked UNVERIFIED.

All functions are `security definer set search_path = clara, pg_temp`.

---

## 0. Headline findings (read first)

1. **The AB-3 pin is ALREADY at the target state.** `record_rule_resolution`'s
   attribution read already filters `e.engine_kind in ('ocr','structured_parse')`
   (`0011_daily_loop.sql:47`). A MyInvois XML ingested as an
   **`engine_kind='structured_parse'`** extraction is therefore **automatically
   attribution-eligible** — no change to `record_rule_resolution` is required for
   MyInvois to resolve a client. What gates whether it *actually* attributes is
   the field-path pattern match (`%tin%` / `%ssm%` / `%account%`, lines 49–51)
   against `client_identifiers.kind`. This is the opposite of what the task
   framing assumed ("it must become …"); it already is. **The real Wave-A2 design
   question is field_path naming for MyInvois regions, not the engine_kind pin.**
2. **`counterparties.kind` is hard-pinned to `'vendor'`** by a CHECK constraint
   (`0009:816`). An AR customer mirror needs this check widened — the table is
   otherwise reusable as-is.
3. **`coa_accounts.account_class` is hard-pinned to `'payable'`** (`0009:764`) and
   `journal_entries.coding_kind` to `'supplier_bill'` (`0009:853`). AR needs
   `'receivable'` and `'sales_invoice'` (or equivalent) added to both CHECKs, plus
   a receivable-class mirror of `_assert_supplier_bill_shape`.
4. **Vendor birth is hardcoded `kind='vendor'` inside `approve_entry`**
   (`0011:3041`). A customer-birth path must either branch on coding_kind or be a
   sibling function.

---

## 1. invoice_facts lifecycle

### 1a. `persist_invoice_facts` (the facts writer — runtime-called)
Current live body = `0013_vendor_registration_facts.sql:47` (a same-arity CoR of
the `0011:137` original). Signature:

```
clara.persist_invoice_facts(p_task uuid, p_fields jsonb, p_raw_sha256 text,
    p_normalization_version text, p_pages_used int,
    p_envelope jsonb default null) returns jsonb
```
Grant: `clara_runtime` EXECUTE (asserted `0013:381`).

**Facts-vocabulary whitelist** (`0013:112-114`) — the guard raises `CLR10
'unsupported invoice field_path'` for anything not in this set:
```
'invoice.total','invoice.amount_due','invoice.currency','invoice.vendor_name',
'invoice.vendor_registration','invoice.invoice_id','invoice.invoice_date','invoice.deposit'
```
`'invoice.vendor_registration'` is 0013's addition (AB-16 registered-vendor reach).

**Monetary vs non-monetary handling** (`0013:128-129`, `135-136`): only
`invoice.total / invoice.amount_due / invoice.deposit` are normalized to cents via
`clara._normalize_invoice_cents(v_raw)` and stored in `document_regions.monetary_cents`
+ `monetary_raw`. Every other field_path (incl. `vendor_name`, `vendor_registration`,
`currency`, `invoice_id`, `invoice_date`) is stored as `text_content` only,
`monetary_cents = null`. **vendor_registration is deliberately NON-monetary so it
can never corroborate a Tier-A total** (`0013:109-111` comment).

**Extraction/region rows written**: one `document_extractions` row
`engine_kind='invoice_facts'`, `engine_id='azure-di:prebuilt-invoice:2024-11-30'`,
`status='done'`, `version_n = t.version_n`, `envelope` carries `raw_sha256`,
`normalization_version`, `field_count` (`0013:94-101`). One `document_regions` row
per field, always `locator_kind='page_polygon'`, `locator={page,polygon}`
(`0013:130-137`). On completion it settles the metering reservation
(`_settle_processing_call`), stamps `documents.document_kind='invoice'` +
`financial_date`, then **rotates the revision_token of every open draft on that
document's active filing** and re-computes/clears the `amount_exception`/
`amount_override` flags (`0013:150-201`) — this is the "newer facts voids the
override" mechanism. Emits `document.invoice_facts_completed`.

**engine_kind values as stored** (CHECK `0009:793-795`):
`document_extractions.engine_kind in ('ocr','structured_parse','invoice_facts')`.
`document_processing_tasks.lane in ('ocr','structured_parse','none','invoice_facts')`
(CHECK `0009:773-775`).

### 1b. `clara._invoice_fact_state(p_document uuid) returns jsonb` (`0009:139`)
The single corroboration equation. Picks the latest `done` invoice_facts
extraction, returns `{extraction_id, version_n, total_region_id, total_cents,
total_fact_hash, currency, invoice_id, invoice_date, corroboration_ineligible,
corroborated, explicit_non_myr}`. `corroborated` (Tier A) requires: exactly one
`invoice.total` region, `monetary_cents>0`, `engine_confidence>=0.95`,
`locator_kind='page_polygon'` with a non-empty polygon, `currency='MYR'`, amount_due
null-or-equal, deposit=0, not ineligible (`0009:187-192`). **An AR mirror needs an
analogous `_sales_invoice_fact_state` OR the same fn extended** — the vocabulary
(`invoice.customer_name`, `invoice.customer_registration`, …) and the Tier-A
predicate would be sales-side but structurally identical.

---

## 2. `record_rule_resolution` + the AB-3 pin (Wave-A2's key attribution site)

Live body = `0011_daily_loop.sql:26`. Signature:
```
clara.record_rule_resolution(p_document uuid, p_op_key text) returns jsonb
```
Exceptional ACL (`0011:128-133` assertion): granted DIRECT-LOGIN to
`clara_runtime_login`, and **must NOT** be executable by `clara_runtime` (the
SET-ROLE pool role). This login-direct grant is re-asserted after every CoR.

**The AB-3 pin — exact current lines** (`0011_daily_loop.sql:40-53`), verbatim:
```sql
  -- AB-3: attribution may consume only identity-bearing OCR/structured snapshots.
  -- invoice_facts deliberately carries colliding field_path names and is not an
  -- attribution source.
  with hits as (
    select distinct ci.client_id
    from clara.document_extractions e
    join clara.document_regions r on r.extraction_id=e.id and r.firm_id=v_firm
    join clara.client_identifiers ci on ci.firm_id=v_firm
      and ci.value_normalized=lower(regexp_replace(coalesce(r.text_content,''),'\s+','','g'))
    where e.document_id=p_document and e.firm_id=v_firm and e.status='done'
      and e.engine_kind in ('ocr','structured_parse')
      and ((ci.kind='tin' and lower(coalesce(r.field_path,'')) like '%tin%')
        or (ci.kind='ssm' and lower(coalesce(r.field_path,'')) like '%ssm%')
        or (ci.kind='bank_account' and lower(coalesce(r.field_path,'')) like '%account%'))
  ) select (array_agg(client_id order by client_id))[1],count(*)::int
      into v_client,v_n from hits;
```
`v_n<>1` → abstains (`no-unique-hard-identifier` or `conflicting-hard-identifier`),
writes an `attribution_attempts` row. `v_n=1` → inserts a `client_resolutions` row
(`method='rule'`, `confidence=1.0`), emits `client.resolved`.

**Finding for Wave A2:** the pin is `in ('ocr','structured_parse')`. MyInvois XML
uploaded as a `structured_parse` extraction is already admitted here. To make a
MyInvois XML *attribute a client*, its regions must (a) be an
`engine_kind='structured_parse'` extraction with `status='done'`, and (b) carry
`field_path` values matching `%tin%`/`%ssm%`/`%account%` whose normalized
`text_content` equals a `client_identifiers.value_normalized`. No `record_rule_resolution`
edit is needed for that. **CAUTION (AB-3 safety inversion):** for the AP side,
invoice_facts is deliberately *excluded* so its colliding `supplier.tin`-style
field_paths can't attribute. If Wave-A2 emits MyInvois vendor/customer TINs into a
`structured_parse` extraction, those regions WILL be visible to attribution — the
design must decide field_path names carefully so a *counterparty's* TIN is not
mistaken for the *client's* identifier.

---

## 3. `_coding_lane_core` / `coding_lane` / `list_coding_lanes` — the three lanes

Live `_coding_lane_core` = `0013:212` (CoR of `0011:1459`). Signatures:
```
clara._coding_lane_core(p_client uuid, p_filing uuid) returns table(lane text, reasons text[])   -- PRIVATE (owner-only)
clara.coding_lane(p_client uuid, p_filing uuid) returns table(lane text, reasons text[])          -- grant: clara_authenticated + clara_agent_ro
clara.list_coding_lanes(p_client uuid) returns table(filing_id uuid, lane text, reasons text[])   -- wrapper over _core per filing
```

**Lane decision (`0013:320-322`)** — the exact 3-way:
```sql
  if v_hard then lane:='needs_you';
  elsif coalesce(array_length(array_remove(v_reasons,'rule_backed'),1),0)=0 then lane:='ready';
  else lane:='needs_review'; end if;
```
So **READY = zero reasons except possibly `rule_backed`**. Any other reason →
NEEDS REVIEW. Any `v_hard:=true` reason → NEEDS YOU (overrides everything).

**Reasons and their lane weight** (all in `_coding_lane_core`):
- `no_active_filing` → immediate needs_you (`0013:225`)
- `open_draft`, `already_coded` (informational, force needs_review)
- `facts_pending` (state `{}`), `tier_a_fails` (not corroborated) → needs_review
- `multi_doc`, `non_myr` → **v_hard** (needs_you)
- `vendor_unresolved` (name null OR resolves to `birth`) → needs_review
- `vendor_ambiguous` → **v_hard** (raised when `_resolve_counterparty` throws CLR23)
- `open_question` → **v_hard** (`_open_question_blocks` non-empty)
- `no_consent` → needs_review (WA-D1 consent gate; see below)
- `parked` (an autodraft_attempt parked on the filing)
- `rule_backed` → the ONLY reason compatible with READY (a live `coding_rules` row)
- `high_stakes` (total ≥ firm `high_stakes_amount_cents`) → needs_review
- `near_duplicate` (same vendor + same invoice_date or total on an approved bill) → needs_review

**How registration flows to `_resolve_counterparty` (registration-dominant, name
fallback)** — `0013:250-284`: the lane reads `invoice.vendor_name` (into `v_vendor`)
and `invoice.vendor_registration` (into `v_vendor_reg`) from the same latest done
invoice_facts extraction, then calls:
```sql
  v_fp:=clara._resolve_counterparty(p_client,
    jsonb_build_object('new',case when v_vendor_reg is not null
      then jsonb_build_object('name',v_vendor,'registration_no',v_vendor_reg)
      else jsonb_build_object('name',v_vendor) end));
```
`decision='birth'` → `vendor_unresolved`; a real match → sets `v_counterparty`;
CLR23 → `vendor_ambiguous` (v_hard). This is the exact registration-dominant reach
0013 added: a name-only proposal against a *registered* vendor is ambiguous
(CLR23), but supplying the registration makes `_resolve_counterparty` return
`registration_match`.

**WA-D1 consent gate** (`0013:288-291`): READY requires a live
`client_egress_consents` row (`revoked_at is null`); absence appends `no_consent`
(needs_review, NOT hard). Consent is *client-scoped, one-live* (unique index
`uq_client_egress_consents_one_live`, `0011:931`).

`coding_lane` / `list_coding_lanes` wrap `_core` with wake/JWT context resolution
(`0011:1560`, `0011:1583`): agent (`wake_context`) callers assert
`assert_wake_allowed(wake_kind,'coding_lane')` and are pinned to their client;
human callers use `jwt_firm()`.

### `_resolve_counterparty` (registration-dominant resolver) — `0011:1335` (live)
```
clara._resolve_counterparty(p_client uuid, p_proposal jsonb) returns jsonb   -- PRIVATE, revoked from public
```
(0009:320 was the first version; 0011:1335 is the live CoR that added
merge/alias awareness.) Proposal is `{existing_id}` or `{new:{name,registration_no?}}`.
Resolution order (`0011:1375-1428`):
- **registration present** → exact `registration_normalized` match anywhere (prefers
  non-merged) → `registration_match` (canonicalized through `merged_into`). Else a
  name/alias match with a *different* registration → **CLR23 `registration_conflict`**.
- **registration absent** → a name/alias match on a *registered* vendor → **CLR23
  `registration_conflict`** ("ambiguous without registration"). Else a name/alias
  match on an *unregistered* vendor → `name_match_unregistered` or `alias_match`.
- No match → `birth` (returns `{decision:'birth', name_normalized, registration_normalized}`).
Normalization: `name_normalized = lower(regexp_replace(name,'[^a-zA-Z0-9]','','g'))`,
same for registration. `_canonical_counterparty(p_client,id)` (`0011:1316`) walks
`merged_into` (max depth 8, CLR23 on cycle).

---

## 4. Vendor birth — `approve_entry` v3 + `approve_routine_entry`

Live `approve_entry` = `0011_daily_loop.sql:2965` (CoR of 0009/0007/0005/0004).
```
clara.approve_entry(p_entry uuid, p_expected_revision uuid,
    p_attestation text default null, p_op_key text default null) returns jsonb
```
Auth: `c:=clara._human_ctx(clara.role_rank('bookkeeper'))` — human checker only.

**Counterparty resolution + atomic birth** (`0011:3025-3068`): re-resolves the
draft's `proposed_counterparty`; if `v_fingerprint is distinct from
e.match_fingerprint` → CLR23 "match landscape changed; revise". If
`decision='birth'`:
```sql
  insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,
      registration_no,registration_normalized,tin,created_by)
    values(c.firm,e.client_id,'vendor',v_name,v_name_n,v_reg,v_reg_n,v_tin,c.actor)
    returning id into v_counterparty;      -- 0011:3039-3042, kind HARDCODED 'vendor'
```
On `unique_violation` it re-resolves to detect a birth race (CLR23). Non-birth →
`v_counterparty := _canonical_counterparty(...)`. Then stamps
`journal_lines.counterparty_id` on every payable-class line (`0011:3057-3060`).
**This is the "draft carries the vendor proposal, approval births the counterparty
+ entry atomically" mechanism** — birth and entry-approval are one transaction.

**High-stakes gate + WA-D5 attestation** (`0011:3127-3145`): if
`is_high_stakes(p_entry)`:
- agent-made (`last_human_editor is null`) → requires `p_attestation` else CLR05
  `attestation_required`.
- human self-approval (`last_human_editor=c.actor`) → if
  `eligible_checker_count(firm)>=2` → CLR05 `distinct_checker`; else requires
  `p_attestation` (CLR05 `self_attestation`).
Attestation stored in `journal_entries.self_approval_attestation` (`0011:3148`).
`is_high_stakes` (`0009:1513`): true if opening_balance / year_end / tax_affecting /
`flags?'amount_override'` / `sum(debit_cents) >= firm.high_stakes_amount_cents`
(default 1,000,000 cents = RM 10,000; `firms.high_stakes_amount_cents`, `0002:204`).

Other approve gates: CLR26 open-question block (`0011:3078-3084`), CLR25 stale-facts
/ currency, CLR21 `amount_conflict` / `duplicate_bill` (`0011:3086-3124`),
`_assert_supplier_bill_shape` (`0011:3125`). On approve it also runs the
**rule-sighting → auto-proposal** machinery (`0011:3157-3193`): 3 approved sightings
of the same (vendor, account) with no live/proposed rule → inserts a `coding_rules`
row (`status='proposed'`) + a `rule_proposal` open_question.

`approve_routine_entry` = `0011:3211`:
```
clara.approve_routine_entry(p_entry uuid, p_expected_revision uuid, p_op_key text) returns jsonb
```
Refuses high-stakes (CLR05 `routine_refuses_high_stakes`), else delegates to
`approve_entry(p_entry,p_expected_revision,null,p_op_key)`. This is the
**bounded auto-POST surface** — the closest existing analog to Wave-A2's standing-rule
auto-POST.

### Draft path (AR sales-invoice draft will mirror this)
Public: `draft_entry` (`0009:1414`, grant `clara_authenticated`) and
`wake_draft_entry` (`0009:1432`, grant `clara_wake_interactive`); both delegate to
`_draft_entry_core` (`0011:301`, 19 params). Supplier-bill drafts require
`p_document`, `p_proposed_counterparty`, and a non-empty `p_evidence` array, and
`p_coding_kind='supplier_bill'` (`0011:351-364`). The core calls
`_resolve_counterparty`, `_validate_entry_lines`, `_write_entry_evidence`, and
builds the `match_fingerprint`. **`journal_entries` allowed transition fields are
whitelisted by `_tf_entry_immutable` (`0009:539`)** — an AR mirror adding columns
must extend that trigger's `v_allowed` arrays.

### Counterparty aliases + identity-equivalence merge
- `counterparty_aliases` table (`0011:651`): `alias_normalized` (unique-live per
  client via `uq_counterparty_aliases_live_name`), `origin in
  ('former_name','trade_name','human')`, `retired_at`.
- `add_counterparty_alias(p_client,p_counterparty,p_alias,p_origin,p_op_key)` `0011:1706`
- `retire_counterparty_alias(p_client,p_alias,p_op_key)` `0011:1750`
- `rename_counterparty(p_client,p_counterparty,p_new_name,p_op_key)` `0011:1774` —
  auto-inserts the old name as a `former_name` alias.
- `merge_counterparties(p_client,p_survivor,p_merged,p_reason,p_op_key)` `0011:1820`
  — sets `counterparties.merged_into=survivor`, `retired_at=now()` on the merged row
  (`0011:1885`); refuses differing registrations (CLR23 `registration_conflict`),
  cross-client, retired targets, or an open draft citing the merged party
  (`open_draft_blocks`); re-issues a `proposed` coding_rule to the survivor.
  All resolution reads canonicalize via `_canonical_counterparty` (`merged_into` chain).
  `merged_into` column added `0011:606-614`.

---

## 5. `counterparties` table shape + what an AR (customer) mirror structurally needs

Table def `0009:812-845` (evolved `0011:606`). Columns:
```
id, firm_id, client_id,
kind        text not null default 'vendor' check (kind in ('vendor')),   -- 0009:816
name, name_normalized (generated-equivalent CHECK),
registration_no, registration_normalized (CHECK),
tin, created_by, created_at, updated_at,
merged_into uuid (FK self), retired_at,                                   -- 0011:606
unique(id,firm_id,client_id),
FK (client_id,firm_id) -> clients(id,firm_id)
```
Indexes: `uq_counterparties_client_registration` (partial, registration not null),
`uq_counterparties_client_unregistered_name` (partial, registration null).

**There IS a `kind` column** — but its CHECK admits only `'vendor'`. So the schema
already anticipated a role distinction; it was just never widened.

**AR mirror — structural options (facts, not a recommendation):**
- **Minimal-change / reuse path:** widen `kind` CHECK to `('vendor','customer')`;
  the uniqueness indexes are currently client-scoped **without** a `kind` predicate
  (`uq_counterparties_client_registration on (client_id, registration_normalized)`),
  so a vendor and a customer with the *same* SSM registration under one client
  would COLLIDE. A customer mirror almost certainly needs the unique indexes made
  `kind`-aware (or a partial `where kind='customer'`), OR a separate table. This is
  a real design fork — flag it.
- New CHECK-widening also needed: `coa_accounts.account_class` (`0009:764`, add
  `'receivable'`), `journal_entries.coding_kind` (`0009:853`, add e.g.
  `'sales_invoice'`).
- New/branched fns: customer birth (either branch `approve_entry`'s hardcoded
  `kind='vendor'` on coding_kind, or a sibling), a receivable-class analog of
  `_assert_supplier_bill_shape` (`0009:477` — currently asserts payable-class credit
  = supported gross), a sales-invoice fact-state (or extend `_invoice_fact_state`),
  and a sales-side coding lane (or extend `_coding_lane_core` — but note it reads
  `invoice.vendor_name`/`vendor_registration` field_paths hardcoded).
- `counterparty_aliases`, `_canonical_counterparty`, `merge_counterparties`,
  `rename_counterparty` are **kind-agnostic** and reuse directly IF customers live
  in the same table (they key on `counterparty_id`, no kind filter). If AR uses a
  separate `customers` table, all four must be re-created customer-side.

---

## 6. House Chain-of-Recreation (CoR) convention for same-arity recreations

The pattern Wave-A2's migration MUST follow (as 0013 and 0014 did):

1. **`set role clara_fn_owner;`** before the function CREATEs (`0013:44`, `0014:71`).
   Table ALTERs that need table ownership run as the migration/superuser role
   *outside* that (0014 drops+re-adds the `document_kind` CHECK as superuser at
   `0014:49-69`, then `set role clara_fn_owner`).
2. **`create or replace function` with the identical signature/arity** — a same-arity
   `create or replace` **preserves the existing ACL grants** (this is *why* it's
   called Chain-of-Recreation; ACLs survive). Header comments state "SAME-ARITY
   CREATE OR REPLACE (ACLs preserved by CoR)" (`0013:10`, `0014:42`).
3. **`reset role;`** after (`0013:328`, `0014:241`).
4. **Tail assertion `do $$` block** that proves (a) the new body contains the
   expected change (`position('…' in prosrc)`), (b) **PUBLIC still holds zero
   EXECUTE** on definer fns, and (c) **every app-role grant that existed before is
   still present** (queries `pg_proc.proacl` via `aclexplode`). See `0013:331-388`
   and `0014:244-273` for the exact template — it re-asserts `clara_runtime`,
   `clara_authenticated`, `clara_agent_ro`, and the private/owner-only posture.
5. **Never change arity of a fn with existing callers.** To add behavior you either
   body-swap (same arity) or ship a NEW export. (Contrast the DB-fn CoR with the
   *workflow*-body immutability rule in CLAUDE.md — different mechanism, same spirit.)
6. **AB-3 re-assertion:** any migration touching attribution re-runs the AB-3 probe
   (`0011:88-135`, `0011:552-598`) and the login-direct-grant assertion, and 0013's
   header carries an explicit "AB-3 SAFETY" paragraph (`0013:34-40`) proving the new
   field_path cannot collide with the identifier CTE. A Wave-A2 migration that adds a
   `structured_parse` MyInvois source or new facts field_paths should carry the same.
7. Validate on a **throwaway PG only** — every migration header says so; the runner
   supplies the transaction (one migration = one txn).

---

## 7. Interface-pins — exact signatures + caller lists (what an AR mirror recreates/extends)

| Function | Signature (live) | File:line | Grant | Callers (as-built) |
|---|---|---|---|---|
| `persist_invoice_facts` | `(p_task uuid,p_fields jsonb,p_raw_sha256 text,p_normalization_version text,p_pages_used int,p_envelope jsonb=null)→jsonb` | 0013:47 | clara_runtime | runtime `invoiceFacts.v1.behavior.mjs` / `invoiceFacts.v1.azure.mjs`; tests `s6-invoice-facts`, `wave-a1-vendor-registration` |
| `record_rule_resolution` | `(p_document uuid,p_op_key text)→jsonb` | 0011:26 | **login-direct** clara_runtime_login (NOT clara_runtime) | runtime matcher lane (`lib/matcher.mjs`), `relay.mjs`; tests `matcher-ab3-adjacency`, `matcher-attribution` |
| `_invoice_fact_state` | `(p_document uuid)→jsonb` | 0009:139 | private/owner | `persist_invoice_facts`, `_coding_lane_core`, `_draft_entry_core`, `approve_entry`, `_write_entry_evidence` |
| `_resolve_counterparty` | `(p_client uuid,p_proposal jsonb)→jsonb` | 0011:1335 | private (revoked public) | `_draft_entry_core`, `_coding_lane_core`, `approve_entry`, `revise_entry` |
| `_canonical_counterparty` | `(p_client uuid,p_counterparty uuid)→uuid` | 0011:1316 | private | `_resolve_counterparty`, `_open_question_blocks`, `_coding_lane_core`, `approve_entry`, `merge_counterparties` |
| `_coding_lane_core` | `(p_client uuid,p_filing uuid)→table(lane text,reasons text[])` | 0013:212 | private (owner-only) | `coding_lane`, `list_coding_lanes` |
| `coding_lane` | `(p_client uuid,p_filing uuid)→table(...)` | 0011:1560 | clara_authenticated + clara_agent_ro | runtime `autoDraft.v1.tools.ts:211` (`select lane,reasons from clara.coding_lane($1,$2)`) |
| `list_coding_lanes` | `(p_client uuid)→table(filing_id,lane,reasons)` | 0011:1583 | clara_authenticated + clara_agent_ro | dashboard review surface (UNVERIFIED exact caller); tests `wave-a-lane-fn` |
| `draft_entry` | `(uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,jsonb,jsonb)→jsonb` | 0009:1414 | clara_authenticated | human draft path |
| `wake_draft_entry` | `(uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)→jsonb` | 0009:1432 | clara_wake_interactive | runtime `autoDraft.v1.tools.ts:133` (`select clara.wake_draft_entry(...)`) |
| `_draft_entry_core` | 19 params (see 0011:301) | 0011:301 | private | `draft_entry`, `wake_draft_entry` |
| `approve_entry` | `(p_entry uuid,p_expected_revision uuid,p_attestation text=null,p_op_key text=null)→jsonb` | 0011:2965 | clara_authenticated (UNVERIFIED grant line — inferred human-only) | dashboard approve; `approve_routine_entry` |
| `approve_routine_entry` | `(p_entry uuid,p_expected_revision uuid,p_op_key text)→jsonb` | 0011:3211 | (UNVERIFIED grant) | bounded auto-POST surface |
| `merge_counterparties` | `(p_client,p_survivor,p_merged,p_reason,p_op_key)→jsonb` | 0011:1820 | clara_authenticated (UNVERIFIED) | tests `wave-a-merge` |
| `add_counterparty_alias` | `(p_client,p_counterparty,p_alias,p_origin,p_op_key)→jsonb` | 0011:1706 | clara_authenticated (UNVERIFIED) | — |
| `rename_counterparty` | `(p_client,p_counterparty,p_new_name,p_op_key)→jsonb` | 0011:1774 | clara_authenticated (UNVERIFIED) | — |
| `grant_client_egress` | `(p_client uuid,p_evidence_document uuid,p_scope_note text,p_op_key text)→jsonb` | 0014:74 | clara_authenticated (asserted 0014:264-268) | owner consent flow |
| `revoke_client_egress` | `(p_client uuid,p_reason text,p_op_key text)→jsonb` | 0014:143 | clara_authenticated | owner consent flow |
| `is_high_stakes` | `(p_entry uuid)→boolean` | 0009:1513 | private/owner | `approve_entry`, `approve_routine_entry`, `revise_entry` |
| `eligible_checker_count` | `(p_firm uuid)→int` | 0004:81 | private/owner | `approve_entry` |

(Grant lines marked UNVERIFIED were not read to the exact `grant execute` statement
in this pass; the `draft_entry`/`wake_draft_entry`/`coding_lane` grants ARE quoted
from the migrations. Confirm the others by grepping `grant execute on function
clara.<name>` before relying on them.)

---

## Open questions for design

1. **AB-3 field_path naming for MyInvois.** Since `record_rule_resolution` already
   admits `structured_parse`, a MyInvois XML's client-TIN region will attribute IF
   its field_path matches `%tin%`. But a MyInvois document also carries the
   *counterparty's* TIN. How do we field-path-name them so the CTE attributes the
   *client* and never a counterparty? (Likely: distinct field_path prefixes, e.g.
   `myinvois.buyer_tin` vs `myinvois.supplier_tin`, plus deciding which maps to
   `client_identifiers.kind='tin'`.) This is the single highest-risk design point.
2. **Shared `counterparties` table vs a separate `customers` table.** The `kind`
   column exists but is CHECK-pinned to `'vendor'`, AND the uniqueness indexes are
   NOT kind-scoped — so a vendor+customer sharing an SSM under one client collide.
   Widen `kind` + make indexes kind-aware, or fork a `customers` table? This decides
   whether `merge_counterparties`/aliases/`_canonical_counterparty` reuse or duplicate.
3. **`_coding_lane_core` extension vs a sales sibling.** The lane hardcodes
   `invoice.vendor_name`/`invoice.vendor_registration` reads and vendor-side rules,
   consent, near-dup. Extend with a coding_kind branch, or ship `_sales_coding_lane_core`?
4. **MyInvois-as-`structured_parse` engine.** Is the MyInvois XML upload a new
   `document_processing_tasks.lane='structured_parse'` engine that writes a
   `document_extractions` row, or does it bypass the extraction pipeline? The
   coding lane + fact-state both key off `engine_kind` extractions, so a
   structured_parse extraction row seems required. Confirm the engine_id string
   convention (AP uses `azure-di:prebuilt-invoice:2024-11-30`).
5. **Sales-side Tier-A corroboration.** `_invoice_fact_state` corroboration is
   Azure-DI-polygon-based (page_polygon + confidence≥0.95). A MyInvois XML has no
   polygon geometry — the W3 rule (`0009:184-186`) makes an empty polygon never
   corroborate. Does a *structured* source get a different Tier-A predicate (e.g.
   schema-valid XML = corroborated), or does AR skip corroboration entirely?
6. **Bounded auto-POST via standing rules.** `approve_routine_entry` already refuses
   high-stakes and delegates to `approve_entry`. Is Wave-A2's standing-rule auto-POST
   the agent calling `approve_routine_entry` under a wake credential? Note
   `approve_entry` currently requires `_human_ctx('bookkeeper')` — an agent auto-POST
   path would need a NEW wake-authorized approve fn (the read-only agent role
   structurally cannot approve; that's invariant #4). This is a structural gap.
7. **AR account_class + supplier-bill-shape mirror.** Adding `'receivable'` to
   `coa_accounts.account_class` and a receivable analog of
   `_assert_supplier_bill_shape` — one generalized fn or two? And does
   `_tf_entry_immutable`'s allowed-column whitelist need new AR columns?
