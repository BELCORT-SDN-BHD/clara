# 裁-19 · counterparty merge re-home + un-merge — annexes

> Companion of record to `counterparty-merge-design.md` (v1) and
> `counterparty-merge-survey.md`. **A** the migration mechanics · **B** the pins, the censuses
> and the numbered D1 inventory · **C** the battery · **D** the decision register and the
> owner-question grounds · **E** the frontend surfaces and the exact strings.
> Every pin in **B.1** was read from the **live catalog** of a throwaway `postgres:17` migrated
> `0001…0142` (137 rows, `max(version) = 0142_fa7b_pr_a_client_onboarding_open`), not from
> migration text.

---

## Annex A · Migration mechanics

### A.1 · The three read recuts (design §3.3)

All three are `create or replace` of an existing body at its pinned signature, each guarded by a
**prestate** that re-derives the live `prosrc` sha256 against **B.1** and aborts `CLR10` on
divergence, and a **postcheck** that re-reads the new body and counts the marker exactly once.

**(a) `clara._aging_core(uuid,uuid,text,date)`** — the `rows` CTE gains one column and the
grouping moves onto it:

```
  with rows as (
    select oi.id as item_id,
           oi.counterparty_id as recorded_counterparty_id,
           coalesce(clara._canonical_counterparty(p_client, oi.counterparty_id),
                    oi.counterparty_id)          as party_id,          -- D-02, fail-OPEN-to-raw
           (clara._canonical_counterparty(p_client, oi.counterparty_id) is null)
                                                  as party_unresolved,  -- carried, never hidden
           oi.item_kind, oi.item_date, oi.due_date,
           clara._subledger_outstanding_asof(oi.id, p_as_of) as outstanding_cents,
           (p_as_of - oi.item_date) as days
    from clara.open_items oi
    where oi.firm_id = p_firm and oi.client_id = p_client and oi.domain = p_domain
      and oi.item_date <= p_as_of
  ), …
  ), per_cp as ( … group by f.party_id )
  …  from per_cp pc join clara.counterparties cp on cp.id = pc.party_id
```

- `p_client` is already a parameter, so no signature change.
- The per-item payload gains `'recorded_counterparty_id', f.recorded_counterparty_id`; the
  per-counterparty object gains `'resolution', case when bool_or(f.party_unresolved) then
  'unresolved' else 'canonical' end`.
- `_canonical_counterparty` **raises** `CLR23` on a cyclic/over-deep chain (`0011:1327-1329`). The
  raise is **deliberately not caught** (D-02): a broken merge chain is a data emergency, and an
  aging report that silently omits the party is the failure mode this whole item exists to end.
- **`totals` is untouched by construction** — it sums `per_cp`, and regrouping a sum does not move
  it. Proven by cell **A-4**, never asserted.

**(b) `clara._statement_core(uuid,uuid,text,uuid,date,date)`** — the four raw predicates become
canonical. Textual anchors, count-guarded to exactly one occurrence each before replacement:

| site | from | to |
|---|---|---|
| `0040:4022` | `and oi.counterparty_id = cp.id` (opening_items) | `and clara._canonical_counterparty(p_client, oi.counterparty_id) = cp.id` |
| `0040:4029` | `and oi.counterparty_id = cp.id` (opening_allocs) | same shape |
| `0040:4036` | `and oi.counterparty_id = cp.id` (txns, item leg) | same shape |
| `0040:4045` | `and oi.counterparty_id = cp.id` (txns, allocation leg) | same shape |

The four are **textually identical**, so the splice cannot be an anchored `replace()` — the body is
re-authored in full and the postcheck asserts `_canonical_counterparty` appears exactly **five**
times (the `cp` CTE plus the four predicates). Each `txns` row gains
`'recorded_counterparty_id', oi.counterparty_id`.

**(c) `clara.list_open_items_by_counterparty(uuid,text,uuid)`** — two edits, two findings:

```
-  and oi.counterparty_id = clara._canonical_counterparty(c.firm, p_counterparty)
+  and clara._canonical_counterparty(p_client, oi.counterparty_id)
+        = clara._canonical_counterparty(p_client, p_counterparty)
```

The postcheck asserts the string `_canonical_counterparty(c.firm` appears **zero** times — the
drift guard for M9's reintroduction.

### A.2 · `clara.counterparty_merges` (design §3.4)

```
id uuid pk · firm_id uuid not null · client_id uuid not null
survivor_id uuid not null · merged_id uuid not null
reason text not null check (nullif(btrim(reason),'') is not null)
merged_by uuid not null references clara.users(id) · merged_at timestamptz not null default now()
op_key text not null
alias_id uuid                       -- the alias THIS merge created; NULL = on-conflict fired (M12)
retired_rule_id uuid · reissued_rule_id uuid
retired_autopost_rule_id uuid · reissued_autopost_rule_id uuid
unmerged_at timestamptz · unmerged_by uuid references clara.users(id) · unmerge_reason text
constraint ck_cm_not_self check (survivor_id <> merged_id)
constraint ck_cm_reversal_trio check ((unmerged_at is null) = (unmerged_by is null)
                                  and (unmerged_at is null) = (unmerge_reason is null))
constraint fk_cm_survivor foreign key (survivor_id, firm_id, client_id)
  references clara.counterparties(id, firm_id, client_id)          -- the triple-key house pattern
constraint fk_cm_merged  foreign key (merged_id, firm_id, client_id)
  references clara.counterparties(id, firm_id, client_id)
unique index uq_cm_live_merged on (merged_id) where unmerged_at is null
```

`uq_cm_live_merged` is the structural half of M14: a party can be *live-merged* at most once, so
"which merge do I reverse" is never ambiguous and `unmerge_counterparties(p_merge)` is total.

**RLS + policies + grant**, per `.claude/rules/db-migrations.md`: `enable`/`force row level
security`; `p_counterparty_merges_owner for all to clara_fn_owner using (true) with check (true)`;
`p_counterparty_merges_human for select to clara_authenticated using (firm_id =
clara.jwt_firm())`; `grant select on clara.counterparty_merges to clara_authenticated`.
**No agent policy, no wake grant** (C4's posture).

**`_tf_counterparty_merge_update()`** (BEFORE UPDATE OR DELETE): DELETE refuses `CLR08`; an UPDATE
is legal **only** when `old.unmerged_at is null` and the diff is exactly
`{unmerged_at, unmerged_by, unmerge_reason}` — one reversal, never edited, never undone. Plus the
house `_tf_no_truncate` statement trigger.

### A.3 · `_tf_counterparty_update_0011` — the one added branch (design §3.7)

Live tip `0040:6230`, live sha in **B.1**. The recut inserts a single guarded branch **above** the
existing immutability raise and changes nothing else:

```
  if old.merged_into is not null or old.retired_at is not null then
+   -- 裁-19: THE UN-MERGE, and nothing else. Both stamps must clear together, and no other
+   -- column may move; the door's own Tier A/B rungs are the authority, this is the substrate.
+   if new.merged_into is null and new.retired_at is null
+      and (to_jsonb(new) - array['merged_into','retired_at','updated_at'])
+          is not distinct from (to_jsonb(old) - array['merged_into','retired_at','updated_at'])
+   then
+     new.updated_at := now();
+     return new;
+   end if;
    raise exception 'a merged counterparty is immutable' using errcode='CLR08';
  end if;
```

**Preservation proof, in the migration itself.** Prestate stashes `md5(prosrc)` and asserts the
three surviving literals are each present exactly once (`'counterparties are retired or merged,
not deleted'`, `'illegal counterparty mutation'`, `'payment_terms_days'` — the `0040` S4.10
widening). Postcheck re-asserts all three plus the new branch exactly once. Cells **T-1..T-4**
prove behaviour, not spelling (review law 3): an illegal column change on a merged row still
refuses; a partial clear (`merged_into` null, `retired_at` kept) still refuses; the non-merge
whitelist still admits `rename_counterparty` and `set_counterparty_terms`; DELETE still refuses.

### A.4 · U4's predicate, in full (design §3.5)

U4 asks: *has any posting already relied on these two identities being one?* The measurable form,
using only DB-owned facts:

```
exists (
  select 1
  from clara.journal_lines jl
  join clara.journal_entries je on je.id = jl.entry_id
  where je.client_id = p_client and je.status = 'approved'
    and je.approved_at > cm.merged_at
    and jl.counterparty_id = cm.survivor_id
    and (
         nullif(je.match_fingerprint->>'counterparty_id','')::uuid   = cm.merged_id
      or nullif(je.proposed_counterparty->>'existing_id','')::uuid   = cm.merged_id
    )
)
```

i.e. a line **posted to the survivor** whose own resolution evidence **names the merged party** —
the canonicalisation having done its job. Reversing the merge would leave that line attributed to
a party its evidence does not name, and PRD invariant 8 forbids rewriting it. The mirror of the
merge's own `open_draft_blocks` guard (`0015:2288-2294`) is U6, on drafts.

### A.5 · The un-merge's transaction order (design §3.5, Tier C)

The order is load-bearing and is stated because two steps have hard dependencies:

1. `update clara.counterparties set merged_into=null, retired_at=null` — **first**, because
   `_tf_coding_rule_insert_0016` refuses a `vendor_account` rule whose counterparty is not a
   **live canonical vendor** (M11), so step 4 cannot precede it.
2. `update clara.counterparty_aliases set retired_at=now() where id = cm.alias_id` — **only when
   `alias_id` is not null**; the alias trigger permits exactly one retirement and refuses any
   touch of an already-retired row (`0011:962-975`), so this step is guarded by
   `and retired_at is null` and its result recorded on the receipt.
3. `update clara.coding_rules set status='retired', retire_reason='unmerged'` for each of
   `reissued_rule_id` / `reissued_autopost_rule_id` that is still `'proposed'` — legal
   (`proposed → retired`, `0016:1542`); U3 has already refused if either is `'live'`.
4. `insert into clara.coding_rules(… status='proposed', origin='proposed', supersedes_rule_id =
   cm.retired_rule_id …)` re-proposing the merged party's retired content — a NEW row needing a
   fresh human signature, because `retired` is terminal.
5. the merge-row reversal stamp · `_audit` · `_append_event('counterparty.unmerged')` ·
   `_finish_op`.

### A.6 · The event type (design §4/OQ-7)

`insert into clara.event_types(name, client_scoped, description) values
('counterparty.unmerged', true, …)` and one `clara.trigger_taxonomy` row at the **active version 2**
(`clara.taxonomy_active` — measured). Additive insert into the live taxonomy, **no version flip**
(the `0009` coupled-pair idiom). Recommended `decision = 'context_update'` (OQ-7).

---

## Annex B · Pins, censuses, and the D1 inventory

### B.1 · Live-body pins (prosrc sha256, frontier `0142`) — every prestate re-derives these

| signature | prosrc sha256 | len |
|---|---|---|
| `clara.merge_counterparties(uuid,uuid,uuid,text,text)` | `fc3ab723cec42c64a239fcb3b97d6683853356dd33dd4aab4a6dcde7d925e205` | 6356 |
| `clara._aging_core(uuid,uuid,text,date)` | `6269d5322876a41306c0cad65748c2fbab198c667f787c6f14805e24fc22c9ad` | 2513 |
| `clara._statement_core(uuid,uuid,text,uuid,date,date)` | `f9a9b8567ddf6a713f16a4557f329bfa7f3b6f975d2f1a5269608c5531d3fb39` | 2765 |
| `clara.list_open_items_by_counterparty(uuid,text,uuid)` | `9c615636a8233abf2535c1402928c32c72defff38b064fe543889060254c9add` | — |
| `clara._tf_counterparty_update_0011()` | `cfb2313be4cb760c119269e739fda1076956f84ea356da566948f964859612cd` | — |
| `clara._canonical_counterparty(uuid,uuid)` | `bbbe4a5e9ba57da93f162c74777b5c780a98b64445054291426593b47b3852b4` | 538 |
| `clara._control_tie_core(uuid,text,date)` | `46d9e3aad420957b45ca52f340a9258684835fb1716ac7c3a028847b491df8b1` | 1976 |
| `clara.ar_aging(uuid,date,uuid)` | `3b5247855385211eb4260eb78153e5e4d181bc5da178d7387f3552a30fb24232` | 404 |
| `clara.ap_aging(uuid,date,uuid)` | `d886a4cfab933ae68283358179bb95180e9bc2556f0e1524040a6d89ec594e64` | 146 |
| `clara.customer_statement(uuid,uuid,date,date)` | `4c4b5f69190f258f3bb81b2be2d812518b830f279b9de07d01ba8f79816ed92e` | 171 |
| `clara.supplier_statement(uuid,uuid,date,date)` | `acbe6975f3ca365a39b90177640dc1516015cb24cf2b7e1a312f2aa1755d39fc` | 171 |
| `clara.apply_open_items(uuid,jsonb,text,text)` | `dd31ca1526e3c892248628edabdaee3668fab10f620a7288b6d775099350679e` | 14983 |
| `clara.unallocate_group(uuid,uuid,text,text)` | `0c2008ede2d75148ba3cb9a00eb2359b5e4de29c03cbc4b3659b79c894100822` | 4952 |
| `clara._allocate_receipt_core(…13 args)` | `553e1d805511a75ed02e95952186fe286d039ce11be91042a2cf357f4b0da751` | 20507 |
| `clara._allocate_payment_core(…13 args)` | `11383cf91d3133add137bf4d130ebc78c5002f5fe2d66710bfddf013898ee176` | 16851 |
| `clara._subledger_outstanding(uuid)` | `78869b2439f629f8b0eec9662216bb3339e97be0aedfa31a58e0317dee0903a0` | 200 |
| `clara._subledger_outstanding_asof(uuid,date)` | `40a246ddcfa86793620f114a6f5e1291fc6d1692c54d13d5d27819a7282ff838` | 232 |
| `clara._subledger_on_approve(uuid)` | `6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd` | 17741 |
| `clara._tf_append_only()` | `160e47b6659868d98163ee8cde1f851e6b8e6d344439a321a42c32fdd161fbf6` | 88 |
| `clara._tf_coding_rule_update()` | `c9c6d644b4147ef6689cf4d0fdbbcabcfad885bbe3f9876db20f8798a78da165` | — |
| `clara._metric_input_dataset_v1(uuid,uuid,uuid[])` | `444f5b16bdeccf3aa94797121cd82668cfda928451ae6d67172a47091d3181ff` | — |
| `clara._resolve_counterparty(uuid,jsonb)` | `0823bd31d6355c4926ab3eb13662d8098409b0161c0d3bd5648a5789347f60c1` | 5779 |
| `clara.create_counterparty(uuid,text,text,text,text,text)` | `797f4675e1a4cab726be138ce3932940e4ec17e6c46cfabce5f6feadaff2dc5d` | 5603 |
| `clara.rename_counterparty(uuid,uuid,text,text)` | `be3c49cc8efbb6ea48921fd66684cf6ac52b1922f321b504cb47d099c23f34e3` | 2518 |
| `clara.add_counterparty_alias(uuid,uuid,text,text,text)` | `89956fc3faf4132ab8db233866670ea8e1300e4d2a73f9e1300e3fedf1b30dbf` | 2323 |
| `clara.retire_counterparty_alias(uuid,uuid,text)` | `13908825d53aa5cc5664aa8c45f4407454ae11f8f137a56a31bc053f4a939373` | 1197 |

All are `security definer`, owner `clara_fn_owner`. `_aging_core`, `_statement_core`,
`_canonical_counterparty`, `_control_tie_core`, `_subledger_outstanding*` are `stable`; the rest
volatile.

### B.2 · The two closed-world censuses (live catalog)

**C2 — the 32 bodies that call `_canonical_counterparty`.** `_agent_settle_from_bank_line_core` ·
`_allocate_payment_core` · `_allocate_receipt_core` · `apply_open_items` · `_approve_entry_core` ·
`_coding_lane_core` · `_complete_bank_reconciliation_core` · `_derive_vendor_binding_proposal` ·
`dismiss_open_question` · `_draft_entry_core` · `_draft_opening_item_core` · `get_context_pack` ·
`get_doc_entry_diff` · `get_draft_review` · **`list_open_items_by_counterparty`** ·
`list_review_queue` · `_open_question_blocks` · `_open_question_core` ·
`_post_counterparty_projection` · `_resolve_and_book_bank_line_core` · `_resolve_counterparty` ·
`resolve_open_question` · `revise_entry` · `_settle_from_bank_line_core` · **`_statement_core`** ·
`_subledger_classify_entry` · `_subledger_decompose_preview` · `_subledger_on_approve` ·
`_tf_subledger_alloc_belt` · `_tf_subledger_entry_belt` · `_tf_subledger_item_belt` ·
`tick_seeding_proposal`.
**`_aging_core` is NOT a member — that absence IS finding M2.** A tail census in PR-1 re-runs this
query and asserts the membership set is the above **plus `_aging_core`**, so a future body that
drops the resolver fails loudly.

**C1 — 42 bodies name `open_items`.** The ten that read `counterparty_id` as a dimension are
listed in the survey §3/C1. The remaining 32 read items by id, by entry or by count and are
party-blind; the D1 inventory below is derived from the ten, not from the 42.

### B.3 · The numbered D1 write-quiesce inventory

**Window A (PR-1).** The rule (`packages/db/README.md`, "Deploy contract"): a call that spans the
migration runs the body it *started* with.

| # | body | why it is on the list |
|---|---|---|
| A1 | `clara.merge_counterparties(uuid,uuid,uuid,text,text)` | **audited writer**, replaced. A merge in flight across the migration would write no `counterparty_merges` row and be permanently un-un-mergeable |
| A2 | `clara._aging_core(uuid,uuid,text,date)` | a `stable` read, but it is called **inside** `_control_tie_core` → `_evaluate_one_gate` → `begin_close`/`finalize_close`. A close transaction spanning the migration would mix generations across gate evaluations within one run |
| A3 | `clara._statement_core(uuid,uuid,text,uuid,date,date)` | read-only and reachable only from the two statement wrappers; listed for completeness, and because a statement rendered mid-migration would disagree with the one rendered a second later |
| A4 | `clara.list_open_items_by_counterparty(uuid,text,uuid)` | read-only; a bank-matching candidate list held open across the flip would change from `[]` to populated mid-session |

**Window B (PR-2).**

| # | body | why |
|---|---|---|
| B1 | `clara._tf_counterparty_update_0011()` | a **trigger body on a written table**, fired by `create_counterparty`, `rename_counterparty`, `set_counterparty_terms` and `merge_counterparties`. Replacing it under traffic is the classic in-flight case |
| B2 | *(new)* `clara.unmerge_counterparties(uuid,uuid,text,text)` | a creation, not a replacement — no in-flight hazard, but it ships in the same window because it is meaningless without B1 |

**NOT on either list, and why.** `_tf_append_only` (unchanged — and cell **A-9** proves it) ·
`_control_tie_core`, `_subledger_outstanding*`, the allocate/settle cores, the three subledger
belts (unchanged, M8) · `_metric_input_dataset_v1` (unchanged, D-04) · `counterparty_merges` and
its trigger (new objects) · every frontend file (PR-3, no window).

---

## Annex C · The battery (contract-blind cells ▣)

### C.1 · The findings, each with an inverted twin

| cell | what it drives |
|---|---|
| **A-1** ▣ | **M2 reproduced**: pre-fix, `ar_aging` over a merged pair returns TWO counterparty rows, one of them `retired_at is not null`. Post-fix: ONE row, `total_cents` equal to the exact sum of the two, to the cent |
| **A-2** ▣ | **M3 reproduced**: pre-fix, `customer_statement(merged)` and `customer_statement(survivor)` return the identical payload and **neither** contains the merged party's item. Post-fix: both return the union, `closing_balance_cents` exact |
| **A-3** | the inverted twin of A-1/A-2: with **no** merge in play, aging rows and statement payloads are **byte-identical** before and after the migration (the recut must be a no-op on unmerged data) |
| **A-4** ▣ | `ar_aging(...)->'totals'` and `ap_aging(...)->'totals'` **byte-identical** across the recut on a fixture *carrying* a merge (design §3.3(a)'s invariant, proven not asserted) |
| **A-5** ▣ | `ar_control_tie` / `ap_control_tie` return `state='tie'` and an identical `measured_digest` before and after (P4); joined to `close_gate_results`, no existing digest moves (P5) |
| **A-6** | the fail-closed rung: an item whose party cannot be resolved still appears in aging, tagged `"resolution":"unresolved"`, at its full amount — **money is never dropped from a report**. Adversarial twin: a cyclic chain raises `CLR23` out of `ar_aging` rather than returning a short answer |
| **A-7** ▣ | **M9's positive control**: `list_open_items_by_counterparty(client,'ar',party)` returns a **non-empty** array for a party with outstanding items **and no merge anywhere**. This cell is the one whose absence let the defect live since `0038` |
| **A-8** | post-fix, `list_open_items_by_counterparty(merged)` and `(survivor)` return the same union, and the string `_canonical_counterparty(c.firm` appears **zero** times in the live body |
| **A-9** ▣ | `update clara.open_items set counterparty_id = …` still refuses `CLR08` **after** the migration — the append-only wall is untouched (constraint 14) |
| **A-10** | `_canonical_counterparty` caller census (B.2) equals the pinned 32 **+ `_aging_core`**; an adversarial twin drops the resolver from `_aging_core` and proves the census fails |

### C.2 · The un-merge rungs — both directions per wall

For each of **U1…U6**: one cell that builds the blocking state and asserts the exact refusal token,
and one that removes the blocker and asserts the un-merge **succeeds**. A rung with only a refusing
half has not been proven to do anything.

| cell | shape |
|---|---|
| **U-1a/b** | build a post-merge `apply_open_items` group spanning both parties (**measured reachable, survey M13**) → `unmerge_cross_party_allocation`; then `unallocate_group` it → the un-merge is admitted |
| **U-2a/b** | `allocate_receipt` on the survivor discharging the merged party's invoice (the settlement item lands on the survivor, M8) → `unmerge_cross_party_settlement`; reverse the settlement → admitted |
| **U-3a/b** | sign the successor `vendor_account` rule (`proposed → live`) → `unmerge_successor_rule_signed`; retire it instead → admitted |
| **U-4a/b** | post an entry after the merge whose fingerprint names the merged party and whose control line carries the survivor (A.4's predicate) → `unmerge_post_merge_attribution`; the same entry posted **before** the merge → admitted |
| **U-5a/b** | build the chain `X→B` then `B→A`, attempt to reverse `B→A` while `X→B` is live → `unmerge_chain_ordered`; reverse `X→B` first → admitted |
| **U-6a/b** | an open draft citing either party → `unmerge_open_draft_blocks`; discard it → admitted |
| **U-7** | **idempotency**: the same `p_op_key` replays the stored outcome; a fresh op key against an already-reversed merge refuses `already_unmerged` |
| **U-8** | **the restore set, measured**: after a clean un-merge, aging shows TWO rows at the original cents, both statements split back, the merged party's `merged_into`/`retired_at` are NULL, the merge's alias is `retired_at is not null`, the successor rule is `retired`, and a NEW `proposed` rule exists on the un-merged party |
| **U-9** | **the un-restore set, measured**: the receipt carries `alias_restored:false` when the merge's alias insert hit `on conflict do nothing`, and `rule_requires_signature:true` always. The consent's text is asserted against these two fields, not against a hardcoded string |
| **U-10** | **the floor**: a bookkeeper is refused `CLR04`/role-floor; an admin succeeds; no wake role holds EXECUTE (a closed-world `pg_proc.proacl` census) |

### C.3 · Concurrency, structure, acceptance

| cell | shape |
|---|---|
| **R-1** | **two-session race, blocking PROVEN**: session 1 holds `pg_advisory_xact_lock(203005004, hashtext(client))` inside `merge_counterparties`; session 2 calls `apply_open_items` on the same client and **blocks** (measured by a forced schedule, never by a sleep), then completes with the merged canonical party |
| **R-2** | the mirror: session 1 inside `unmerge_counterparties`, session 2 calling `allocate_receipt` — blocks, then refuses `allocation_counterparty_mismatch` because the parties are two again |
| **T-1..T-4** | `_tf_counterparty_update_0011`'s preserved branches (Annex A.3): illegal column on a merged row refuses · a partial clear refuses · `rename_counterparty` + `set_counterparty_terms` still pass · DELETE still refuses |
| **S-1** | `counterparty_merges` structure: forced RLS, the owner/human policy pair, `SELECT` to `clara_authenticated` only, `uq_cm_live_merged`, the reversal-trio CHECK, and a cross-firm read returning **zero rows** for a bookkeeper of another firm |
| **S-2** | `_tf_counterparty_merge_update` refuses a DELETE, refuses a second reversal, refuses an edit to any non-reversal column |
| **G-1** | **Gate-A tie-out, exact cents**: the control tie `diff_cents = 0` at every step of the acceptance round — before merge, after merge, after a settlement, after un-merge |
| **G-2** | the acceptance round in ROME PUBLIC ADVISORY, labelled synthetic per ADR-048 (design §6) |

**Fixture discipline** (the T8 lesson, PR #397 F6/F7): every money fixture uses **distinct
non-round values per party and per column**, and each cell corrupts ONE value at a time and
requires its own RED — a fixture where four cells share one string proves nothing.

---

## Annex D · Decision register and owner-question grounds

### D.1 · Decisions taken under the standing delegation

| # | decision |
|---|---|
| **D-01** | the re-home is a **canonicalising read layer**, not a physical move (design §3.1; dissent from the ruling's mechanism recorded, escalated as OQ-1) |
| **D-02** | `_aging_core` coalesces an unresolvable party to the **raw id** and tags it, and lets a cyclic chain **raise** — money never silently leaves a report |
| **D-03** | every read carries `recorded_counterparty_id` alongside the canonical one (OQ-2) |
| **D-04** | sealed metric snapshots keep the **recorded** party; `_metric_input_dataset_v1` is not recut (OQ-3) |
| **D-05** | `merge_counterparties` is recut **only** to write the `counterparty_merges` carrier — no guard, no side effect, no signature changes |
| **D-06** | `_tf_counterparty_update_0011` gains exactly **one** branch, byte-preservation proven by prestate/postcheck plus four behavioural cells |
| **D-07** | the un-merge is **admin-floor, human-only**, no wake wrapper (OQ-4) |
| **D-08** | one `_reserve_op` key per un-merge; a second attempt on a reversed merge is a **refusal**, never a second reversal |
| **D-09** | the un-merge wall is **entanglement, not age**: U1-U6 measure the thing itself (OQ-5) |
| **D-10** | **two D1 windows**, severed: the read layer + carrier (A), the identity trigger + door (B) |
| **D-11** | M9 is fixed **inside** PR-1 and named as its own finding in the PR body (OQ-6) |
| **D-12** | the un-merge is keyed on the **merge row**, not the party — `uq_cm_live_merged` makes that total |

### D.2 · Grounds for the owner questions

- **OQ-1** — the only question that can change the shape. The recommendation rests on four
  measured facts, not on preference: `open_items` is append-only against a superuser (M5); a new
  item is dated when it is written and lands in `current` (`0037:713-715`); the period wall refuses
  the original date once the year is frozen (M7); and the write path has canonicalised since
  `0011` (M8), so the read layer makes the estate *consistent* rather than adding a convention.
  **If the owner reads 裁-19 as mandating the physical move, the correct response is a new PR-0
  for a materially larger item, not a patch of this one** (R-1).
- **OQ-2** — the accountant's question "which name was this invoice raised under?" has an answer
  today (the raw column) and would lose it if the reads only ever returned the canonical id.
  Keeping it costs one key per row.
- **OQ-3** — a seal is a statement about what the books said at seal time. Canonicalising a sealed
  snapshot retroactively would mean a re-read of an old seal returns a different party than the
  seal recorded, which is the reporting-agency's law, not hygiene's.
- **OQ-4** — the merge is a bookkeeper act; the un-merge undoes a bookkeeper's judgement and
  resurrects a retired identity. Widening later is a one-line grant; narrowing later withdraws a
  verb a firm has started using.
- **OQ-5** — an age bound is a proxy for entanglement. It refuses safe old un-merges and admits
  dangerous new ones. Offered as U7 only because "strictly narrower" is a legitimate owner
  preference on a pre-beta correction verb.
- **OQ-6** — the strongest argument for severing M9 is review hygiene (one PR, one subject). The
  stronger argument against is that the three bodies are one surface and one census; shipping two
  of the three canonicalised while the third stays inert is the artifact a later reader curses.
- **OQ-7** — `context_update` costs one context rebuild per un-merge (a rare act); `ignore` risks
  Clara resolving against a party the human has just re-split, until the next pack build.

### D.3 · Change log

- **v1 (2026-08-29)** — first authoring. Written from a rig replay at frontier `0142` rather than
  from migration text; four findings (M3's absence-not-divergence, M9's inert door, M10's
  un-clearable column, M13's reachable cross-party application) are **new to this survey** and were
  not in 裁-19's framing or in T8's review record.

---

## Annex E · The frontend home and the exact strings

### E.1 · `apps/web/messages/en.json` → `ArApCounterparty` — every key this item re-trues

| key | current text (verbatim) | obligation |
|---|---|---|
| `merge.consequence` | *"Merging retires the party that does not survive, for good — **there is no un-merge door**. The exact effect is listed on the next step, once you name the other party."* | **INVERTS.** Rewrite: retirement is reversible through the un-merge door, with the named limits |
| `mergePreview.whatChanges1` | *"{merged} is marked merged into {survivor} and retired — **this cannot be undone**."* | **INVERTS.** Rewrite naming the door and the fact that entanglement (a settlement, a signed rule, a post-merge posting) makes it permanent |
| `mergePreview.whatChanges2` | *"From now on, new activity naming {merged} attributes to and reads as {survivor}'s."* | **widens**: not only new activity — **existing** items now read as the survivor's in aging, the statement and the candidate list |
| `mergePreview.whatChanges3` | *"{merged}'s own live coding rule (if any) retires; a replacement is proposed on {survivor} only if {survivor} does not already have one of that kind."* | **stays true**; gains the un-merge's consequence (a signed replacement blocks the un-merge — U3) |
| `mergePreview.whatChanges4` | *"{merged}'s existing open items and its own outstanding balance **stay recorded under {merged} until settled — this merge does not move them**."* | **REPLACE.** The read-layer truth: the items stay **recorded** under {merged} (visible per row) and now **read** as {survivor}'s everywhere |
| `mergePreview.whatChanges5` | *"Aliases are not shown here — this build has no read for them."* | **retires with 裁-11** (P4 tranche-2); until then it stands |
| `aliasListNotBuilt` | *"A counterparty's existing aliases and the retire-alias action are not available yet…"* | **retires with 裁-11**; the un-merge preview degrades honestly while it stands (design R-7) |
| `statusMerged` | *"Merged into {name}"* | the **anchor for the un-merge action** — the one place the product admits a merge happened |
| `statement.redirectedNote` | *"{merged} was merged into {survivor}; this is {survivor}'s own statement."* | **REPLACE.** After the fix it is no longer *"{survivor}'s own"* — it is the **combined** statement of both parties, and each row names which one it was raised under |
| `statement.redirectedNoteUnknownName` | the id-only variant of the above | same rewrite; the fail-open fix T8 landed (F3's final round) stays |

**New keys owed** (namespace `ArApCounterparty.unmerge`): `trigger` · `title` · `previewButton` ·
`restoresHeading` + one line per restored thing · `cannotRestoreHeading` + the three named items
of design §3.5 · one message per blocking rung `U1…U6` · `reasonLabel` · `confirm` · `working`.
Plus `ClientRegisters.aging` gains the merged-in sub-line (design §3.8).

### E.2 · The components

| file | change |
|---|---|
| `apps/web/components/registers/CounterpartyMergePreviewCard.tsx` | the consequence list re-authored (E.1); the "Outstanding"/"Open items" figures now read the canonicalised aging, so the preview's two sides must be re-derived — **the card must not compute a combined figure client-side** (T8's own no-computed-cents rule) |
| `apps/web/components/registers/MergeCounterpartiesDialog.tsx` | consequence text only; the three-step shape stands |
| *(new)* `UnmergeCounterpartiesDialog.tsx` | two steps: preview (restores / cannot restore / the blocking rung) → the act. Mounted from the hygiene panel row whose chip reads `statusMerged` |
| `apps/web/components/registers/counterparty-hygiene-panel.tsx` | the un-merge trigger on merged rows; `onActed` → the parent re-reads aging (T8's F7 pin) |
| `apps/web/components/registers/counterparty-statement-panel.tsx` | the redirect note rewrite; a per-row "raised under" column from `recorded_counterparty_id` |
| `apps/web/components/registers/aging-register.tsx` | the merged-in sub-line; the retired party no longer appears as its own row |
| `apps/web/lib/bank/match-reads.ts` | **no code change** — but its behaviour changes from "always empty" to "populated" when M9 is fixed (design R-5); its tests gain a non-empty fixture |
