# 裁-19 · `merge_counterparties` re-home + un-merge — the estate survey (as-found)

> **Survey of record for the pre-beta item 裁-19** (`docs/plan/active/mohe-grill-rulings-2026-08-28.md`
> §裁-19, owner-ruled 2026-08-28). Companions: `counterparty-merge-design.md` ·
> `counterparty-merge-annexes.md` · `counterparty-merge-gate-record.md`.
> **This file states what IS. It designs nothing.**
>
> **Method.** Every claim below is either (a) a `file:line` read of the working tree at
> `36c2fd50` (frontier `0142`), or (b) a **rig measurement** on a throwaway `postgres:17`
> migrated `0001…0142` (137 rows in `clara.schema_migrations`, `max(version) =
> 0142_fa7b_pr_a_client_onboarding_open`), read from the **live catalog** —
> `pg_get_functiondef` / `pg_proc.prosrc` / `pg_trigger` / `pg_policy` — never from migration
> text, because bodies are spliced across generations. Rig-measured claims are marked **[RIG]**
> and carry the live `prosrc` sha256 they were read from (Annex B.1 of
> `counterparty-merge-annexes.md` holds the full pin table).
> **Behavioural claims marked [RIG-B] were driven through the REAL granted doors**
> (`create_counterparty`, `merge_counterparties`, `apply_open_items`, `ar_aging`,
> `customer_statement`) in a bookkeeper session on that rig — not simulated by setting columns.
>
> **What this survey could not do:** it measured a synthetic two-and-three-party fixture, not
> the estate's real books. Population claims (how many live merges exist in ROME/BEE, how many
> carry post-merge cross-party activity) are **predictions**, §7, each with the instrument that
> settles it.

---

## 1 · The surface 裁-19 touches — the inventory

### 1.1 The verbs and cores (live tips confirmed by CoR lineage walk + rig catalog read)

| body | live tip | ctx / floor | grant |
|---|---|---|---|
| `merge_counterparties(uuid,uuid,uuid,text,text)` | **`0015:2242`** (CoR of `0011:1820`) | `_human_ctx(bookkeeper)` `0015:2249` | `clara_authenticated` **[RIG]** |
| `_canonical_counterparty(uuid,uuid)` | `0011:1316` (no CoR) | none — pure `stable` core | **ungranted** `0011:1333` |
| `_aging_core(uuid,uuid,text,date)` | `0040:3937` (no CoR) | none — `sql stable` definer | **ungranted** `0040:3987` |
| `ar_aging` / `ap_aging` | `0040:3989` / `0040:4001` | `_human_ctx(bookkeeper)` | `clara_authenticated` |
| `_statement_core(uuid,uuid,text,uuid,date,date)` | `0040:4013` (no CoR) | none — `sql stable` definer | **ungranted** `0040:4067` |
| `customer_statement` / `supplier_statement` | `0040:4069` / `0040:4079` | `_human_ctx(bookkeeper)` | `clara_authenticated` |
| `_subledger_outstanding(uuid)` | `0037:874` | — | ungranted |
| `_subledger_outstanding_asof(uuid,date)` | `0040:3203` | — | ungranted |
| `_control_tie_core(uuid,text,date)` | `0056:817` | — | ungranted; `ar_control_tie` `0056:859`, `ap_control_tie` `0056:864` |
| `list_open_items_by_counterparty(uuid,text,uuid)` | **`0038:7990`** | `_human_ctx(bookkeeper)` | `clara_authenticated` **[RIG]** |
| `apply_open_items(uuid,jsonb,text,text)` | `0037:3225`, **spliced `0055:281-303`** | `_human_ctx(bookkeeper)` | `clara_authenticated` |
| `unallocate_group(uuid,uuid,text,text)` | `0037:3141` | `_human_ctx(bookkeeper)` | `clara_authenticated` |
| `_allocate_receipt_core` / `_allocate_payment_core` | `0044:1078…` / `0044:1391…` | via `allocate_receipt` / `allocate_payment` | cores ungranted; wrappers `clara_authenticated` |
| `_tf_counterparty_update_0011()` | **`0040:6230`** (CoR of `0011:940`) | trigger `t_counterparties_update_0011` | — |
| `_tf_coding_rule_update()` | **`0016:1542`** (CoR of `0011:1011`, `0015:1096`) | trigger `t_coding_rules_update` | — |
| `_tf_counterparty_alias_update()` | `0011:962` (no CoR found) | trigger `t_counterparty_aliases_update` | — |
| `_tf_append_only()` | `0003:431` | on `open_items` + `open_item_allocations` | — |

### 1.2 The tables and the walls they carry **[RIG]**

| object | shape that binds the design |
|---|---|
| `clara.counterparties` | 15 columns; **`merged_into uuid` NULL-able, `retired_at timestamptz` NULL-able** (`0011`). Three triggers: `t_counterparties_name_only_guard` (BEFORE INS/UPD), `t_counterparties_update_0011` (BEFORE DEL/UPD), `t_counterparties_no_truncate`. Policies: owner · `clara_authenticated` read `firm_id = jwt_firm()` · `clara_agent_ro` read `firm_id = wake_firm()` · `clara_freeform_ro`. |
| `clara.counterparty_aliases` | `0011:651-672`. **`uq_counterparty_aliases_live_name (client_id, alias_normalized) WHERE retired_at is null`** (`0011:669-670`). Policies: owner + `clara_freeform_ro` **ONLY — no `clara_authenticated` policy and no `clara_authenticated` grant** (裁-11's gap, still open at `0142`). |
| `clara.open_items` | `0037:726-778`. Grain `uq_open_items_grain (entry_id, domain, counterparty_id)` `0037:747`. FK `(counterparty_id, firm_id, client_id) → counterparties` `0037:752`. `item_date` NOT NULL (`0037:738`, re-asserted `0055:248-256`). Triggers: `t_open_items_append_only` (BEFORE UPD/DEL → `_tf_append_only`), `t_open_items_validate` (BEFORE INS), `t_open_items_belt` (DEFERRABLE INITIALLY DEFERRED, AFTER INS), `t_open_items_no_truncate`. |
| `clara.open_item_allocations` | `0037:783-813`. Triggers: append-only, `t_open_item_allocations_belt` (deferred), `t_close_serialize`, `t_snapshot_staleness`, no-truncate. |
| `clara.coding_rules` | `t_coding_rules_update` → `_tf_coding_rule_update`; `t_coding_rules_insert_0016` → `_tf_coding_rule_insert_0016`; no-truncate. |
| `clara.event_types` / `clara.trigger_taxonomy` | active taxonomy **version 2** (`clara.taxonomy_active`). `counterparty.created → context_update`; `counterparty.merged → ignore`; the five `open_item.*` rows → `ignore`. **No `counterparty.unmerged` row exists.** |
| **`clara.counterparty_merges`** | **DOES NOT EXIST.** There is no durable, queryable record of a merge — only `merged_into` (which names the survivor but not the act) and an `audit_log` row. |

---

## 2 · The findings that bind the design

### M1 — the live merge moves NOTHING; it only stamps the column *(file:line + [RIG])*

`merge_counterparties` (`0015:2242-2350`) does, in order: bookkeeper ctx · op-key + arg checks ·
`_reserve_op` · `FOR UPDATE` on both rows · not-found / cross-client / already-retired /
**cross-kind** / registration-conflict / **open-draft-cites-merged** refusals · insert a
`former_name` alias on the SURVIVOR **`on conflict do nothing`** (`0015:2295-2298`) · retire the
merged party's live `vendor_account` rule and propose a successor on the survivor **only if the
survivor has none** (`0015:2299-2315`) · the same for `autopost` (`0015:2316-2336`) ·
**`update clara.counterparties set merged_into=p_survivor, retired_at=now()`** (`0015:2337-2338`) ·
`_audit` · `_append_event('counterparty.merged')` · `_finish_op`.
**It touches `open_items` nowhere, `open_item_allocations` nowhere and `journal_lines` nowhere.**

### M2 — aging groups by the RAW id and names the RETIRED party *(the headline)*

`_aging_core` selects `from clara.open_items oi where oi.firm_id/client_id/domain …`
(`0040:3944-3946`) — **no canonicalisation** — groups `by f.counterparty_id` (`0040:3969`) and
resolves the display name with `join clara.counterparties cp on cp.id = pc.counterparty_id`
(`0040:3979`), i.e. the raw stored id. `_aging_core` is **absent** from the live census of bodies
calling `_canonical_counterparty` **[RIG]**.

**[RIG-B] Measured, through the real doors**, one client, three customers A/B/C, one AR item each
(A RM1,000.00 · B RM2,500.00 · C RM700.00) plus a −RM400.00 credit item on A; then
`merge_counterparties(B→A)` and `merge_counterparties(C→A)`:

```
ar_aging(as_of 2026-06-30) rows = [["ZQ A", 60000], ["ZQ B", 250000], ["ZQ C", 70000]]
ar_aging totals.total_cents      = 380000
```

**Three rows, two of them retired parties under their own names.** The register a professional
reads to chase debt shows three debtors where one exists.

### M3 — the statement canonicalises the ARGUMENT but not the ITEMS, so the merged party's money is in NO statement

`_statement_core` computes `cp = _canonical_counterparty(p_client, p_counterparty)`
(`0040:4016-4017`) and then filters **`oi.counterparty_id = cp.id`** at four sites —
`opening_items` `0040:4022`, `opening_allocs` `0040:4029`, the item leg of `txns` `0040:4036`,
the allocation leg `0040:4045`. Those predicates read the **raw stored** column, so an item still
sitting on the merged party is excluded from the survivor's statement, and the merged party's own
call redirects to the survivor and therefore excludes it too.

**[RIG-B] Measured on the same fixture, after both merges:**

```
customer_statement(A) -> counterparty_id = A, closing = 60000, rows = 2
customer_statement(B) -> counterparty_id = A, closing = 60000, rows = 2
customer_statement(C) -> counterparty_id = A, closing = 60000, rows = 2
```

**RM2,500.00 and RM700.00 are reachable from no statement at all.** Aging says RM3,800.00 is
outstanding; every statement anyone can open says RM600.00. This is hard constraint 1's collision
in its sharpest form — and it is worse than 裁-19's own framing ("the same money reads differently
in two reports"): in one of the two reports the money is **absent**, not different.

### M4 — the control tie-out is NOT broken by a merge, and must not be broken by the fix

`_control_tie_core` (`0056:817-856`) takes the subledger side as
`(_aging_core(...) -> 'totals') ->> 'total_cents'` (`0056:845-846`) — the **grand total**, never a
per-party figure. A change to *grouping* leaves the total invariant.
**[RIG-B]** after both merges and after a post-merge application:
`{"state":"tie","gl_cents":380000,"subledger_cents":380000,"diff_cents":0}`.
The drawer-1 gates `ar_control_tie` / `ap_control_tie` (`0056:392-393`) therefore keep passing
across a merge today, and any signed `close_attestations` row that binds their
`measured_digest` stays valid — **provided the fix does not move the total.**

### M5 — `open_items` is append-only, absolutely, and the wall holds against a superuser

`_tf_append_only()` (`0003:431-435`) raises `'% is append-only'` with `CLR08` unconditionally on
any UPDATE or DELETE. **[RIG-B]** `update clara.open_items set counterparty_id = <survivor> where
counterparty_id = <merged>` executed as the bootstrap **superuser** →
`CLR08 open_items is append-only`. A physical re-home therefore requires either dropping the
trigger, or recutting `_tf_append_only` with an exemption branch — and `_tf_append_only` is a
**shared** wall (it guards `open_items`, `open_item_allocations`, `coding_rules`,
`rule_sightings`, `rule_decisions`, `journal_entry_revisions`, `sweep_run_items`,
`counterparty_aliases`' sibling and more). Constraint 14's operative clause forbids weakening it.

### M6 — a compensating-pair "move" re-dates the money, which destroys aging

The only append-only-legal way to move a balance between parties is to write a NEW pair of items
(−X on the merged party, +X on the survivor), and `open_items` may only be minted congruently with
an **approved journal entry** (belt-1 `_tf_subledger_entry_belt`, `0037:1351`; belt-2
`_tf_subledger_item_belt`, `0037:1476`; the BEFORE-INSERT validator `0037:1458`). A new entry is
dated when it is posted, and `0037:713-715` states the estate's own rule in words: *"item_date
defaults to the entry's posting_date at write. An unwind item therefore lands in the CURRENT
bucket rather than the original's — deliberate."* So a re-home by compensating pair moves a
120-day-overdue invoice into `current`. **Aging is the reason the subledger exists**; a fix that
makes every re-homed debt look fresh fails constraint 1 harder than the defect it fixes.

### M7 — a re-home entry dated in a closed period is refused, and dated today it is a lie

`_tf_period_wall` (`0056:643`, trigger `0056:711`) refuses every approved-class touch dated inside
a `closing`/`closed` fiscal year with **CLR19** unless an unforgeable `close_write_permits` row
exists. So the compensating pair cannot be dated at the original item's date once that year is
frozen — the exact population most likely to carry duplicate parties (old, unreconciled debtors).

### M8 — the WRITE path already treats a merged pair as one party

`_allocate_receipt_core` canonicalises the argument (`0044:1078`) **and** each candidate item
(`0044:1238-1241`, refusal `allocation_counterparty_mismatch`); `_allocate_payment_core` mirrors it
(`0044:1391`, `0044:1520-1522`). The settlement's control **journal line** is stamped with the
CANONICAL id (`0044:1318`, `v_cp`), so a settlement for money received against a merged party's
invoice mints its own open item on the **survivor** while the invoice item stays on the **merged**
party. `apply_open_items` counts distinct **canonical** parties (`0037:3292-3295`) before refusing
`cross_counterparty_application` (`0037:3300-3303`). `_subledger_on_approve`, `_resolve_counterparty`,
`_coding_lane_core`, `get_context_pack`, `list_review_queue` and 25 further live bodies call
`_canonical_counterparty` **[RIG: 32 callers, full list in Annex B.2]**.
**The divergence is exactly two read bodies wide** (`_aging_core`, `_statement_core`) plus M9.

### M9 — `list_open_items_by_counterparty` is DEAD: it passes the FIRM id where the client id is expected

`0038:8006` reads
`and oi.counterparty_id = clara._canonical_counterparty(c.firm, p_counterparty)`.
`_canonical_counterparty(p_client, p_counterparty)` (`0011:1316-1332`) resolves
`from clara.counterparties where id = v_id and client_id = p_client`, and **returns NULL on
`not found`** (`0011:1324`). With a firm id in the client slot the lookup never finds the row, the
function returns NULL, and `oi.counterparty_id = NULL` is never true.

**[RIG-B] Measured, differential:**

```
_canonical_counterparty(FIRM,   B) = null
_canonical_counterparty(CLIENT, B) = 3c565e71-…       (the survivor)
list_open_items_by_counterparty(client,'ar',survivor) -> []   (with RM1,000.00 outstanding)
list_open_items_by_counterparty(client,'ar',merged)   -> []   (with RM2,500.00 outstanding)
```

It returns `[]` for **every** counterparty of **every** client, before and after any merge. It is a
granted `clara_authenticated` door consumed by `apps/web/lib/bank/match-reads.ts` and
`apps/dashboard/app/shared/bankApi.ts` (the bank-matching candidate read). **This is an
independent live defect found by rig replay, not by the ruling** — recorded here because it sits
on the same three-line surface the fix must recut, and because a "canonicalise the reads" PR that
left it dead would ship a body that *looks* correct and *is* inert.

### M10 — `merged_into` cannot be unset by anyone, superuser included

`_tf_counterparty_update_0011` (live tip `0040:6230`) opens
`if old.merged_into is not null or old.retired_at is not null then raise 'a merged counterparty is
immutable' using errcode='CLR08'` and then applies a **positive column whitelist** —
`['merged_into','retired_at','updated_at']` on the merge branch, `['name','name_normalized',
'payment_terms_days','updated_at']` otherwise.
**[RIG-B]** `update clara.counterparties set merged_into=null, retired_at=null where id = <merged>`
as superuser → `CLR08 a merged counterparty is immutable`.
**An un-merge door is impossible without recutting this trigger body.**

### M11 — `retired` is a TERMINAL coding-rule status: the merge's rule retirement is irreversible

`_tf_coding_rule_update` (live tip `0016:1542`) allows exactly
`proposed → live|declined|retired` · `live → retired|suspended_pending_resignature` ·
`suspended_pending_resignature → retired`, and refuses anything else `CLR27`. **Nothing leaves
`retired`.** So an un-merge can never restore the rule `merge_counterparties` retired; the most it
can do is **re-propose** the same content as a new `proposed` row for a fresh human signature.
`_tf_coding_rule_insert_0016` additionally refuses a `vendor_account` rule whose counterparty is
not a **live canonical vendor** — so the re-proposal must happen strictly *after* `merged_into` is
cleared, inside the same transaction.

### M12 — the alias the merge writes may not be the merge's to retire

`0015:2295-2298` inserts the `former_name` alias `on conflict do nothing` against
`uq_counterparty_aliases_live_name` (`0011:669-670`). If the survivor already carried a live alias
at that normalized name (origin `trade_name` or `human`), **the merge wrote nothing** and there is
no way, after the fact, to tell that from the case where it did. `_tf_counterparty_alias_update`
(`0011:962-975`) permits exactly one `retired_at` stamp and **refuses any update to an already
retired alias** — one-way, no restore. The merge therefore has to **record the alias id it
created (or record that it created none)** for an un-merge to be honest.

### M13 — a post-merge application binds the two parties permanently, and it is reachable today

**[RIG-B] Measured, both directions on one fixture:**

```
BEFORE merge:  apply_open_items(A-credit → B-invoice) → CLR10 {"reason":"cross_counterparty_application"}
AFTER  merge:  apply_open_items(A-credit → B-invoice) → ADMITTED  {"applied_cents":10000}
resulting rows: [["apply", -10000, on B's item], ["apply", +10000, on A's item]]
```

One `application_group` now straddles items belonging to two parties that an un-merge would make
distinct again — a state `apply_open_items` **refuses to create** (`0037:3300-3303`, *"a set-off
between parties is a GL event and must ride a clearing entry"*). The same class arrives through
`allocate_receipt` / `allocate_payment` (M8: the settlement item lands on the survivor while the
discharged invoice item sits on the merged party). **An un-merge must refuse in this state, by
name — it cannot split the group, because `unallocate_group` (`0037:3141`) reverses a group
wholesale and would undo a real settlement of real money.**

### M14 — a merge can only be un-done once, and re-merging a retired party is refused

**[RIG-B]** `merge_counterparties(survivor=B, merged=A)` after `B→A` → `CLR23
{"reason":"target_retired"}`; `merge_counterparties(A, B)` again → the same. The `s.merged_into is
not null or s.retired_at is not null or m.merged_into is not null or m.retired_at is not null`
guard (`0015:2270-2274`) refuses on **either** side. A chain therefore only ever grows by merging
**live** parties into a **live** survivor; `_canonical_counterparty` walks it to depth 8
(`0011:1327`) and raises `CLR23 'counterparty merge chain is invalid'` beyond.

---

## 3 · Censuses (live catalog, rig-measured)

- **C1 — bodies whose `prosrc` names `open_items`: 42.** Full list in Annex B.2. Of those, the
  ones that read `open_items.counterparty_id` as a *dimension* (not just a row filter) are
  `_aging_core`, `_statement_core`, `list_open_items_by_counterparty`,
  `_subledger_decompose_preview`, `_metric_input_dataset_v1`, `_subledger_classify_entry`,
  `_subledger_on_approve` and the three subledger belts.
- **C2 — bodies calling `_canonical_counterparty`: 32.** `_aging_core` is **NOT** among them;
  `_statement_core`, `apply_open_items`, `list_open_items_by_counterparty`, both allocate cores
  and both settle cores **ARE**.
- **C3 — grants on the four relations.** `open_items` / `open_item_allocations` /
  `counterparties`: `SELECT` to `clara_authenticated` + `clara_freeform_ro` (+ `clara_agent_ro` on
  `counterparties`). **`counterparty_aliases`: `clara_freeform_ro` only** — 裁-11's gap.
- **C4 — no wake-role EXECUTE on any of the fourteen counterparty/subledger doors**; every one is
  `clara_authenticated`-only (`clara.merge_counterparties` included).
- **C5 — the reporting-snapshot family is IMMUNE to a physical re-home, measured, not assumed.**
  `_metric_input_dataset_v1` **does** serialise `open_items.counterparty_id` into the dataset, but
  `verify_metric_input_snapshot` and `_tf_metric_input_snapshot_reconstruct` re-derive the hash
  **from the captured `clara.metric_input_snapshot_open_items` rows, not from live `open_items`**,
  and `assess_metric_cell_independent_v1` reads the captured tables too. So a re-home would not
  fail a sealed snapshot's verification. What it *would* do is make a later re-mint of the same
  period produce a different `dataset_sha256` than the sealed one — the "same period, two answers"
  class, named honestly rather than overclaimed as a verification break.
- **C6 — `finalize_close` reads `open_items` only to count the closing entry's own items**
  (`CLR41 drawer1_identity_failed`); it captures no per-party subledger position, so no signed
  close receipt freezes a per-counterparty figure.
- **C7 — the event taxonomy is at version 2** and carries no `counterparty.unmerged`.
- **C8 — `clara.counterparty_merges` does not exist**; a merge is recoverable only from
  `audit_log` + `domain_events`, neither of which is a queryable product contract.
- **C9 — T8's shipped UI** (`apps/web/components/registers/`): `MergeCounterpartiesDialog.tsx`,
  `CounterpartyMergePreviewCard.tsx`, `counterparty-hygiene-panel.tsx`,
  `counterparty-statement-panel.tsx`, `aging-register.tsx`. Strings live under the
  `ArApCounterparty` namespace in `apps/web/messages/en.json` — the exact keys the fix must re-true
  are listed in Annex E.

---

## 4 · What T8's reviewer proved (PR #397, MERGED)

Recorded verbatim in substance so this survey is not a second opinion of it:

- **F2** — the merge consent text claimed open items, statement history and coding rules "move to
  the survivor"; **the live body does none of the three.** Rewritten to the door's exact effects;
  the reviewer re-read the live merge body sentence by sentence.
- **F3** — post-merge, "View statement" showed the **survivor's** ledger under the **merged**
  party's name, because **aging groups by raw id while `_statement_core` canonicalises.** Fixed in
  the caller with an explicit redirect note naming both parties.
- The final re-check at `a7c64dd7` was **CLEAR — 27 mutants, 27 RED, 0 survivors.**

**What the reviewer did NOT measure, and this survey does:** that the merged party's items are in
*neither* statement (M3), that `list_open_items_by_counterparty` is inert (M9), that a post-merge
cross-party application is admitted (M13), and that `merged_into` is un-clearable (M10).

---

## 5 · The frontend as-found

`MergeCounterpartiesDialog` is a three-step dialog (pick → **Preview merge** → the destructive
Merge). Its consequence text is the honest description of a door that moves nothing, and every
sentence of it becomes **false or misleading** the moment 裁-19 lands. The affected keys, with
their current text, are enumerated in **Annex E.1**; the two that flatly reverse are
`ArApCounterparty.merge.consequence` (*"there is no un-merge door"*) and
`ArApCounterparty.mergePreview.whatChanges1` (*"this cannot be undone"*).
`ArApCounterparty.retireAlias` is built but **UNMOUNTED** pending 裁-11.

---

## 6 · The one thing this survey refuses to conclude

It does **not** conclude that the fix is a read-layer change. That is the design's call
(`counterparty-merge-design.md` §3.1, decision **D-01**), and the survey's job was to make both
options costable: M5/M6/M7 price the physical move, M2/M3/M9 price the read layer, M4/C5/C6 price
what neither may disturb.

---

## 7 · Predictions the build's rig replay must confirm or correct

| # | prediction | instrument |
|---|---|---|
| **P1** | No live merge exists in the estate's real books yet (ROME/BEE), so the fix has no back-population to reconcile | `select count(*) from clara.counterparties where merged_into is not null` per client, on the live DB during the D1 window |
| **P2** | No live `application_group` today straddles two parties of one merge | the M13 detector query (Annex C, cell **U-3**) run estate-wide before the ceremony |
| **P3** | `list_open_items_by_counterparty` has **never** returned a non-empty result in production, so fixing it changes a UI from "no candidates" to "candidates" — a behaviour change users will see | `domain_events` / app logs; if unavailable, state the absence as an absence (law 2) and ship the fix with a release note |
| **P4** | The `_aging_core` grouping recut leaves `ar_control_tie`/`ap_control_tie` `measured_digest` byte-identical on every existing `close_gate_results` row | recompute both probes before and after on a rig seeded from a DR restore |
| **P5** | No `close_attestations` row in the estate binds a digest that the recut moves | the P4 recompute, joined to `close_attestations` |

