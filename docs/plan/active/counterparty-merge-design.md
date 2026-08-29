# 裁-19 · counterparty merge re-home + the un-merge door — design v1

> **Design doc of record for the pre-beta item 裁-19**, owner-ruled 2026-08-28
> (`docs/plan/active/mohe-grill-rulings-2026-08-28.md` §裁-19). Estate as-found:
> **`counterparty-merge-survey.md`** — findings **M1-M14**, censuses **C1-C9**, predictions
> **P1-P5**, every claim either `file:line` at `36c2fd50` or **rig-measured at frontier `0142`**.
> Mechanics, D1 inventory, battery and surfaces: **`counterparty-merge-annexes.md`**.
> Gate: **`counterparty-merge-gate-record.md`** — **OPEN**; this design is written to be
> attacked, and **§4's seven owner questions are not yet ruled.**
>
> **Binds under** hard constraints **1** (accounting-correctness > contracts > look), **2**
> (the DB owns every number), **3** (the full ADR-061 ladder), **9**, **10**, **14** (the
> product's security mechanisms are the thing under test and are never weakened for
> convenience), and PRD §6 invariants **4/F3** ("complete the whole accounting job"), **7**
> (balance), **8** (reverse, never delete). **Every rung of §3.4 and every branch of §3.5 is
> judgement logic** — review law 1 applies to each of them individually.
>
> **What the owner ruled, verbatim:** *"merge moves the merged party's open items (and their
> allocations) to the survivor in the same audited transaction and aging groups by the canonical
> party; PLUS an un-merge door that reverses a merge (splitting re-homed items and history back —
> its own design gate, sized honestly as the larger half)."*
> **This design carries the ruling's OUTCOME and dissents on its MECHANISM**, on constraint-1
> grounds, at **D-01**. The dissent is recorded, priced, and put to the owner as **OQ-1**; if
> OQ-1 returns "physically move them", §3.2's alternative is what ships and §7's R-1/R-2 are the
> registered cost.
>
> ---
>
> ## Rulings applied 2026-08-29 (裁-24) — D-01 becomes a HYBRID
>
> **All seven owner questions are ruled** (`counterparty-merge-gate-record.md` §2.1; ledger
> `mohe-grill-rulings-2026-08-28.md` §裁-24). **The text below is NOT rewritten** — it is the
> argument the ruling was made against, and the estate's idiom keeps it. What now binds:
>
> - **OQ-1 — PHYSICAL, in the append-only shape.** The owner first chose to rewrite the invoice
>   rows; **the orchestrator's dissent was put and recorded**; he then chose the variant that
>   keeps the wall. **For every OPEN item of the merged party in an UNFROZEN period, the merge
>   APPENDS a "re-home pair"** — the old row marked **superseded**, a new row under the
>   **survivor** carrying the **ORIGINAL date** (aging preserved) with a **back-pointer** to the
>   old one; **the un-merge appends the reverse pair**. **Frozen fiscal years are untouched** and
>   fold through the READ layer only; sealed snapshots are unchanged. **So §3.3's canonicalising
>   read layer STAYS** (it is what frozen years and history use) **and the write door of §3.2 is
>   ADDED over it.** D-01 is hybrid; **the set is AMENDED, not superseded.**
> - **The one thing §3.2 must change to be buildable as ruled:** it dated the minted pair at
>   `_book_today()`; the ruling requires the ORIGINAL date. The provenance question §3.2 already
>   named — an `item_date` provenance column, or the aging reporting the re-home date — is now
>   **load-bearing**, must carry its own D-number and cell, and is answered against
>   `0037:713-715`'s current-bucket rule. **`_tf_append_only` is not weakened**: the pair is an
>   INSERT, and the wall's own refusal cell stays in the battery.
> - **OQ-2 YES · OQ-3 LEAVE · OQ-5 no closed-FY rung · OQ-6 M9 inside PR-1 · OQ-7
>   `context_update`** — all as recommended.
> - **OQ-4 WIDENED:** admin, human-signed, **and Clara MAY PROPOSE an un-merge** as a needs-you
>   item (the admin clicks). §3.5's "no agent verb, no wake wrapper" non-goal is **overtaken** for
>   the propose half only — the un-merge itself stays human.
> - **§7/R-1 narrows** rather than firing whole: the build does not restart, but the **write
>   half** (the pair's shape, its period gate, the reverse pair, belt/congruence cells for every
>   minted pair) and the **OQ-4 propose door** are new design owed before PR-1.

---

## 1 · The ruled shape (fixed, not designable)

- **One party's money reads as one party's money, everywhere.** After a merge, aging, the
  statement, the open-item candidate list and the control tie all speak about the **survivor**.
  That is the ruling's outcome and it is not negotiable.
- **An un-merge door exists**, reverses a merge, and is *"sized honestly as the larger half"*.
- **Writer bodies move → a D1 write-quiesce window; the full ladder.** (裁-19's own words.)
- **T8's UI says exactly what the door does at each frontier** — the merge preview's consequence
  list is re-trued in the same wave, not left to drift (§3.8, Annex E).
- **Before beta.** It rides the pre-beta backend queue with 裁-17, 裁-18a and the hardening batch.

---

## 2 · The estate as-found — the eight findings that decide §3

| # | the finding, at the bytes / at the rig | what it forces |
|---|---|---|
| **M2** | `_aging_core` selects raw (`0040:3944-3946`), groups raw (`0040:3969`), joins `counterparties` on the raw id (`0040:3979`); it is **absent** from the 32-body `_canonical_counterparty` caller census | the aging recut, §3.3 |
| **M3** | `_statement_core` canonicalises the **argument** (`0040:4016-4017`) but filters items on the **raw** column at four sites (`:4022`, `:4029`, `:4036`, `:4045`) — so **[RIG-B]** the merged party's balance is in *neither* statement | the statement recut, §3.3 — and the honest statement of the defect: absence, not divergence |
| **M9** | `list_open_items_by_counterparty` passes `c.firm` where `p_client` is expected (`0038:8006`); `_canonical_counterparty` returns NULL on not-found (`0011:1324`) → **[RIG-B]** the door returns `[]` for every party, always | the third recut, §3.3 — and a named, separate finding in the PR body |
| **M5** | `_tf_append_only` (`0003:431-435`) refuses every UPDATE on `open_items`, **[RIG-B]** superuser included | a physical re-home needs the wall weakened — **refused by constraint 14** |
| **M6/M7** | an append-only-legal "move" is a NEW item pair on a NEW approved entry, and `0037:713-715` states that a new item lands in the **CURRENT** aging bucket; `_tf_period_wall` (`0056:643`) refuses the original date once the year is frozen | a physical move **re-dates the debt** — the fix would corrupt the very report it exists to fix |
| **M4/C5/C6** | `_control_tie_core` consumes only `_aging_core`'s **grand total** (`0056:845-846`); the metric-snapshot family verifies from **captured** rows, not live `open_items`; `finalize_close` freezes no per-party position | the recut is **digest-neutral** — but that is a claim to be **proven** by a cell, never assumed (P4/P5) |
| **M10** | `_tf_counterparty_update_0011` (live tip `0040:6230`) refuses **any** update to a merged row, **[RIG-B]** superuser included | the un-merge is impossible without recutting that trigger — §3.5, D-06 |
| **M11/M12/M13** | `retired` is terminal for a coding rule (`0016:1542`); an alias may be retired once and never restored (`0011:962-975`), and the merge's `on conflict do nothing` (`0015:2295-2298`) hides whether it wrote one; **[RIG-B]** a post-merge cross-party `apply_open_items` is **ADMITTED** where the pre-merge one is refused | the un-merge's **restore set, its refusal set, and the merge-side recut that makes both knowable** — §3.5, §3.6 |

---

## 3 · The design

### 3.1 D-01 — the re-home is a CANONICALISING READ LAYER, not a physical move

> **RULED 2026-08-29 (裁-24): HYBRID.** The read layer below **stays and is built as written** —
> it is what frozen years, history and every non-open item resolve through. **On top of it**, a
> re-home WRITE door is added for OPEN items in UNFROZEN periods (the header block's ruling; the
> mechanism sketch is §3.2, amended there). The seven grounds below remain the record of why the
> write half is fenced to open items in open periods rather than applied to everything.

**Decision (the recommendation §4/OQ-1 puts to the owner).** `merge_counterparties` continues to
leave `open_items` and `open_item_allocations` **exactly where they are**, and every read that
speaks about a counterparty resolves through `clara._canonical_counterparty` before it groups,
filters or names. The ruling's outcome — *aging consolidates, the statement is whole, the money
reads as one party's* — is delivered in full. What is **not** done is the ruling's stated
mechanism, an `UPDATE` of `open_items.counterparty_id`.

**Why, in the order the constraints rank.**

1. **Accounting correctness (constraint 1, PRD §6/4-F3).** A physical move cannot preserve
   `item_date`. `open_items` is append-only (**M5**, proven against a superuser), so a "move" is a
   new item pair on a new approved entry, and `0037:713-715` is the estate's own sentence: a new
   item lands in the **current** bucket. Re-homing a 120-day debt would report it as current. The
   report the ruling exists to fix is aging; a fix that falsifies aging is not a fix.
2. **The wall is the product under test (constraint 14).** The only way to keep `item_date` is to
   UPDATE in place, and that needs `_tf_append_only` weakened or a trigger dropped.
   `_tf_append_only` guards eight-plus tables. "Weaken the append-only wall so a hygiene verb is
   easier" is the exact trade constraint 14's operative clause forbids.
3. **The audit trail (PRD §6 invariant 8).** A posted subledger row is history. Repointing it
   erases the fact that the invoice was raised on *that* party — the fact the merge is *about*.
   `merged_into` + the canonicalising read keep both truths: what was recorded, and who it now is.
4. **Period locks (M7).** Items in a closed year cannot be re-homed by a new entry at all without
   a `close_write_permits` row, i.e. without re-opening a signed year. Old duplicates are exactly
   the population most likely to be frozen.
5. **The tie-out and the seals (M4/C5/C6).** Grouping is invariant for the grand total, so
   `ar_control_tie`/`ap_control_tie` digests do not move and no signed attestation is invalidated.
   A physical move rewrites `open_items` rows that a later metric snapshot would capture
   differently from the sealed one (C5).
6. **The un-merge halves in size.** If nothing moved, the un-merge has nothing to move back — it
   clears a column, retires an alias, re-proposes a rule and writes a receipt (§3.5). A physical
   re-home would make the un-merge a second money-movement verb, doubling the blast radius of the
   larger half.
7. **The write path already agrees (M8).** Allocation, settlement, coding, the context pack and
   the review queue have canonicalised since `0011`. Two read bodies are the outliers; the fix
   makes the estate self-consistent instead of adding a third convention.

**The other option's cost, stated so the owner can overrule on one page.** Physical re-home buys
one thing the read layer does not: `select * from clara.open_items where counterparty_id = X`
answers correctly for a human at the SQL prompt, with no resolver. It costs: `_tf_append_only`
weakened or a per-item compensating entry pair; every re-homed debt re-bucketed to `current`
(or `item_date` preserved only by the weakened wall); a `close_write_permits` path for frozen
periods; a re-mint/sealed-snapshot divergence (C5); belt-1/belt-2 congruence work for every
minted pair; and an un-merge that must move money back. **The read layer costs three body recuts
and one census.**

### 3.2 What ships if OQ-1 returns "physically move them"

> **RULED 2026-08-29 (裁-24): this half SHIPS — and with three amendments.** (1) It is **fenced
> to OPEN items in UNFROZEN periods**; a frozen year is not touched at all, so
> `rehome_period_locked` becomes the *fence*, not an edge case. (2) The pair carries the
> **ORIGINAL `item_date`**, not `_book_today()` — the `item_date` provenance the paragraph below
> already flags as owed is now the load-bearing decision, and it needs its own D-number, its own
> cell and an answer to `0037:713-715`. (3) The old row is **marked superseded** and the new row
> **back-points** to it, and **the un-merge appends the reverse pair** rather than clearing a
> column. The paragraph below is kept as the sketch it was; it is not yet the design.

Recorded, not built, so the alternative is not re-designed under time pressure:
`merge_counterparties` gains a step that, per merged-party item with non-zero outstanding, mints a
**re-home pair** (`item_kind='adjustment'`, −outstanding on the merged party, +outstanding on the
survivor) congruent with ONE new approved journal entry — Dr control/cp=survivor, Cr control/cp=
merged, net zero, `_assert_balanced` satisfied — dated `_book_today()`, refused with a typed
`rehome_period_locked` when the entry's date is inside a frozen year. The design then owes:
an `item_date` provenance column (or the aging honestly reporting the re-home date), a
`rehome_group` carrier for the un-merge to reverse, and belt-2 congruence cells for the pair.
**§7/R-1 prices it as roughly triple this design's width.**

### 3.3 The three read recuts — exactly what changes

**(a) `clara._aging_core(uuid,uuid,text,date)`** — the `rows` CTE gains a resolved party column and
the grouping and the name join both move to it:

- `rows` selects `clara._canonical_counterparty(p_client, oi.counterparty_id) as party_id`
  alongside the existing columns (the raw `oi.counterparty_id` is **kept** in the per-item payload
  under a new `recorded_counterparty_id` key — the accountant must still be able to see which
  party the invoice was raised on).
- `per_cp` groups `by f.party_id`; the outer join becomes `on cp.id = pc.party_id`.
- **Fail-closed rung (law 2):** `_canonical_counterparty` returns NULL on an unresolvable row
  (`0011:1324`) and **raises CLR23 on a cyclic/over-deep chain** (`0011:1327-1329`). A NULL party
  must **not** silently drop the item from aging — that would delete money from a report. The
  recut coalesces to the raw id and stamps the counterparty entry `"resolution":"unresolved"`;
  the raise is deliberately **not** caught, because a broken merge chain is a data emergency and a
  report that hides it is worse than one that refuses. (**D-02**; cell **A-6**.)
- **Invariant asserted, not assumed:** `totals` is a sum over `per_cp` and is therefore unchanged
  by regrouping. Cell **A-4** proves byte-equality of `totals` across the recut on a fixture with
  a merge; cell **A-5** proves `ar_control_tie`'s `measured_digest` unmoved (P4).

**(b) `clara._statement_core(uuid,uuid,text,uuid,date,date)`** — the four raw predicates become
canonical ones. `cp` stays as it is; `oi.counterparty_id = cp.id` becomes
`clara._canonical_counterparty(p_client, oi.counterparty_id) = cp.id` at `0040:4022`, `:4029`,
`:4036`, `:4045`. The returned `counterparty_id` stays the **canonical** id (T8's redirect note
depends on it, and it is correct). Each row of `rows[]` gains
`recorded_counterparty_id` so a statement over a merged pair shows, per line, which name the item
was raised under — the professional's own audit trail. (**D-03**.)

**(c) `clara.list_open_items_by_counterparty(uuid,text,uuid)`** — two changes, and the PR body
names them separately because they are two findings:
`_canonical_counterparty(c.firm, p_counterparty)` → `_canonical_counterparty(p_client,
p_counterparty)` (**M9, the live defect**), and the item-side predicate
`oi.counterparty_id = <resolved>` → `clara._canonical_counterparty(p_client, oi.counterparty_id)
= <resolved>` (**the re-home**). Cell **A-7** is a positive control: the door returns a non-empty
list for a party with outstanding items **before** any merge exists — the cell whose absence let
M9 live since `0038`.

**Not recut, and each with its reason.** `_control_tie_core` (consumes totals only, M4) ·
`_subledger_outstanding` / `_subledger_outstanding_asof` (item-keyed, party-blind) ·
`apply_open_items`, both allocate cores, both settle cores, `_subledger_on_approve`,
`_resolve_counterparty`, `_coding_lane_core`, `get_context_pack`, `list_review_queue` (already
canonical, M8/C2) · `_metric_input_dataset_v1` (captures the **recorded** party into a sealed
snapshot; canonicalising it would change what a seal means — **D-04**, and the recut would be a
reporting-agency question, not a hygiene one).

### 3.4 The merge-side recut — what `merge_counterparties` must start recording

The un-merge cannot be honest about an act the merge did not record (M12). `merge_counterparties`
is recut to write, in the same audited transaction, a row of the new carrier:

**`clara.counterparty_merges`** — append-only-plus-one-reversal, forced RLS, owner policy + the
scoped `clara_authenticated` read (`firm_id = clara.jwt_firm()`) + `SELECT` grant, per
`.claude/rules/db-migrations.md`. Columns, in full, in **Annex A.2**; the load-bearing ones:
`survivor_id`, `merged_id`, `reason`, `merged_by`, `merged_at`, **`alias_id`** (the alias this
merge created, or NULL when `on conflict do nothing` fired — M12), **`retired_rule_id`** and
**`reissued_rule_id`**, **`retired_autopost_rule_id`** and **`reissued_autopost_rule_id`**,
`op_key`, and the reversal trio `unmerged_at` / `unmerged_by` / `unmerge_reason`.

Nothing else about the merge changes: the same signature, the same bookkeeper floor, the same six
refusals, the same alias/rule side effects, the same event. **D-05.** The recut is a live audited
writer and carries the D1 obligation (Annex B).

### 3.5 The un-merge door — `clara.unmerge_counterparties`

**Signature.** `clara.unmerge_counterparties(p_client uuid, p_merge uuid, p_reason text,
p_op_key text) returns jsonb` — keyed on the **merge row**, never on the party, because a survivor
may carry several merges (**[RIG-B]** B→A and C→A both landed) and "un-merge B" is ambiguous once
a chain exists.

**Floor: `_human_ctx(admin)`, human-only, no wake wrapper. D-07.** Grounds: (i) it resurrects a
retired identity and re-splits a ledger, which is strictly above the bookkeeper act that created
it; (ii) law 71's posture governs what the AGENT may do, and the agent has **no** verb that
creates a merge (C4: `merge_counterparties` is `clara_authenticated`-only), so there is nothing
here for her to undo; (iii) a correction of a human's judgement belongs to a human. Put to the
owner as **OQ-4** with the bookkeeper-floor alternative priced.

**Tier A — raise, nothing durable.** op-key present (CLR10) · args present · `_reserve_op` on
`hash(client, merge_id, reason)` so a retry replays (**D-08**) · the merge row exists, is in this
firm and client (CLR11) · it is **not already reversed** (`unmerged_at is null`, else CLR23
`already_unmerged`) · advisory `pg_advisory_xact_lock(203005004, hashtext(client))` — the client
rung every subledger writer takes (`0037:3278`) — then both counterparty rows `FOR UPDATE` in id
order.

**Tier B — the named refusals. Each is judgement logic; each has a token; none is a silent
partial reversal.**

| # | rung | token |
|---|---|---|
| **U1** | no `open_item_allocations` **application_group** contains items of both parties (M13, **measured reachable**) | `unmerge_cross_party_allocation` |
| **U2** | no settlement/allocation lineage binds them: no `open_items` row on the survivor whose entry's `settlement_allocation` flag names an item on the merged party (M8 — the `allocate_receipt`/`allocate_payment` shape) | `unmerge_cross_party_settlement` |
| **U3** | the successor coding rule this merge proposed (`reissued_rule_id` / `reissued_autopost_rule_id`) is **not `live`** — a signed rule is a fresh human authority, and un-merging must not silently retire one | `unmerge_successor_rule_signed` |
| **U4** | no approved `journal_lines` row posted **after** `merged_at` carries the survivor on a control leg while its document/fingerprint cited the merged party — i.e. no posting has *already* relied on the identities being one (Annex A.4 gives the exact predicate) | `unmerge_post_merge_attribution` |
| **U5** | the merged party is not itself the survivor of a **later** live merge that this call is not reversing (chain integrity — reversing the middle of `X→B→A` in the wrong order would strand `X`) | `unmerge_chain_ordered` |
| **U6** | no open draft cites either party (the merge's own `open_draft_blocks` guard, `0015:2288-2294`, mirrored so the reversal meets the same bar as the act) | `unmerge_open_draft_blocks` |

**Tier C — the act, one transaction.** In order: clear the merged party
(`update clara.counterparties set merged_into = null, retired_at = null, updated_at = now()`) ·
retire the alias **by recorded `alias_id`, and only if this merge created it** (M12; NULL ⇒ skip,
recorded on the receipt as `alias_restored: false`) · retire the successor rule(s) if `proposed`
(`proposed → retired` is legal, `0016:1542`) · **re-propose** the merged party's retired rule
content as a NEW `proposed` row **after** the clear, so `_tf_coding_rule_insert_0016`'s
live-canonical-vendor check passes (M11) · stamp `unmerged_at/by/reason` on the merge row ·
`_audit('unmerge_counterparties', …)` · `_append_event('counterparty.unmerged', …)` ·
`_finish_op`.

**What it CANNOT restore, named on the receipt and in the consent, never silently:**

1. **The retired coding rule.** `retired` is terminal (M11). The un-merge re-proposes; **a human
   must sign it again**. Receipt: `rule_reproposed: <id>`, `rule_requires_signature: true`.
2. **A pre-existing alias.** If the merge's insert hit `on conflict do nothing`, no alias belongs
   to it, and it retires none. Receipt: `alias_restored: false, reason: "not_created_by_merge"`.
3. **Post-merge postings.** Every journal line, fingerprint and context-pack answer written while
   the parties were one resolved to the survivor and stays there — PRD invariant 8 forbids
   rewriting them, and U4 is what stops an un-merge that would leave them incoherent.
4. **Cross-party allocations** (U1/U2). Reversing them would mean `unallocate_group`-ing a real
   settlement of real money, i.e. undoing an accounting act to make a hygiene act possible.
   **A named refusal beats a partial reversal** — the message tells the human exactly which group
   binds the two parties and that the route is to unallocate it deliberately first, then un-merge.

**Age is NOT the wall. D-09.** 裁-19 asked whether a merge older than N periods should be
un-mergeable at all. The recommendation is **no age bound**: age is a proxy for entanglement and a
bad one — a merge from last year with no activity is perfectly reversible, and a merge from this
morning followed by a receipt is not. U1-U6 measure the thing itself. The fail-closed alternative
(refuse across a closed fiscal year boundary) is priced at **OQ-5**.

### 3.6 Idempotency, receipts and the reversal ledger

One `_reserve_op` key per call (D-08): a retry inside the same request replays the stored outcome;
a genuinely new attempt on an already-reversed merge refuses `already_unmerged` (Tier A), so
"reverse twice" is a refusal, not a second reversal. The `counterparty_merges` row is the durable
record of both halves — the merge and its reversal — and is the read the hygiene panel lists
(§3.8). It is append-only except for the reversal trio, enforced by its own
`_tf_counterparty_merge_update` (Annex A.2), because a reversal stamp that could be edited is not
a receipt.

### 3.7 The trigger recut that makes an un-merge possible

`_tf_counterparty_update_0011` (live tip `0040:6230`) currently refuses **all** updates to a merged
row (M10). It gains **one** branch, and only one: when the row is merged and the update sets
`merged_into` to NULL and `retired_at` to NULL and changes nothing else, the whitelist
`['merged_into','retired_at','updated_at']` applies and the update passes. Everything else about
the body — the DELETE refusal, the merge branch, the non-merge whitelist including `0040`'s
`payment_terms_days` widening — is **byte-preserved** and proven so by a prestate/postcheck pair
(Annex A.3). **D-06.** This is a live trigger body on a written table: D1.

**Honest note.** This branch makes the un-merge possible *and* makes a hand-written UPDATE
possible for anyone holding `clara_fn_owner`. That is unchanged in kind from every other writer in
the estate (all of them are definer bodies owned by that role); the wall that matters is the
EXECUTE grant on the door, which is `clara_authenticated` at the admin floor.

### 3.8 The frontend home

**Merge preview.** Every sentence of the consequence list is re-authored in the same wave. The
exact keys, their current text and their replacement obligation are **Annex E.1**; the two that
invert are `ArApCounterparty.merge.consequence` (*"there is no un-merge door"* → there is one, and
what it can and cannot restore) and `ArApCounterparty.mergePreview.whatChanges1` (*"this cannot be
undone"*). `whatChanges4` (*"…stay recorded under {merged} until settled — this merge does not
move them"*) becomes the read-layer truth: the items stay **recorded** under the merged party and
now **read** as the survivor's everywhere. `whatChanges5` retires with 裁-11.

**Un-merge lives in the counterparty-hygiene panel**, on the row of a party whose status chip
already reads `ArApCounterparty.statusMerged` ("Merged into {name}") — the one place in the product
that admits a merge happened. It opens a two-step dialog on the T8 pattern: a **preview** step that
calls the door's own dry read and shows (i) what will be restored, (ii) **what cannot be**
(the three named items of §3.5), and (iii) the blocking rung if one bites, with its human message;
then the act. **The consent shows what it restores and what it cannot** — 裁-19's own requirement.

**Aging.** After the recut a merged party stops being its own row. The survivor's row gains a
`ClientRegisters.aging` sub-line naming the merged-in parties, so an accountant chasing a debt can
still see which name the invoice was raised under (the `recorded_counterparty_id` of §3.3(a)).

---

## 4 · Owner questions I could not settle

> **ALL SEVEN RULED 2026-08-29 (裁-24)** — the rulings are written per-question in
> `counterparty-merge-gate-record.md` §2.1 and summarised in this design's header block. The
> table below is the recommendation set as it was put, kept for the record.

Under the standing delegation the build proceeds on the recommendation; escalate only if a law or
a ruling would change. Grounds and each alternative's cost: **Annex D.2**.

| # | question | recommendation (the build proceeds on this) | fail-closed default |
|---|---|---|---|
| **OQ-1** | 裁-19 says the merge *moves* the items. This design delivers the outcome with a **canonicalising read layer** and does not move them (D-01). Is the outcome what was ruled, or the mechanism? | **the read layer** — a physical move re-dates every debt into `current` (M6) or needs the append-only wall weakened (M5), both worse than the defect | the read layer; a physical move is the larger, riskier build and §3.2 records it rather than losing it |
| **OQ-2** | should a merged party's items keep a visible **`recorded_counterparty_id`** on aging and statement rows? | **yes** — the accountant must be able to see which name the invoice was raised under; hiding it is the audit-trail loss the physical move was criticised for | yes; dropping it is a later subtraction, never a later addition |
| **OQ-3** | `_metric_input_dataset_v1` captures the **recorded** party into sealed snapshots (C5). Leave it? | **leave it** — a seal records what the books said at seal time; canonicalising it retroactively changes what a seal means. Reporting-agency question, not a hygiene one (D-04) | leave it; the alternative needs F-A5's gate |
| **OQ-4** | the un-merge floor: **admin, human-only** (D-07) or bookkeeper, matching the merge? | **admin, human-only** — un-merging is a correction of a bookkeeper's judgement and resurrects a retired identity | admin. Widening later is a grant; narrowing later is a refusal of a verb already given |
| **OQ-5** | should an un-merge across a **closed fiscal year** boundary be refused outright? | **no separate rung** — U1/U2/U4 already refuse every case where a closed year's numbers would change, and nothing in the un-merge writes a dated row | add rung **U7** `unmerge_crosses_closed_year` refusing when `merged_at` precedes the latest `closed` FY end: strictly safer, strictly narrower |
| **OQ-6** | **M9** (`list_open_items_by_counterparty` inert since `0038`) — fix it inside this PR, or sever it? | **inside this PR** — it is the same three-line surface, and a PR that recut the two siblings and left the third dead would be the worse artifact. Named as its own finding in the PR body | sever to its own PR; costs a second review of one line and a second ceremony slot |
| **OQ-7** | the `counterparty.unmerged` taxonomy decision (version 2, `clara.trigger_taxonomy`) | **`context_update`**, matching `counterparty.created` — an un-merge resurrects an identity Clara resolves against, and her context should learn immediately | `ignore`, matching `counterparty.merged` — quieter, and a stale context is corrected at the next pack build |

---

## 5 · Build sequence

> **Trued 2026-08-29 (裁-24).** OQ-1 is ruled, so prerequisite (i) is **discharged** — but the
> hybrid adds work this sequence does not yet carry: **the re-home write door** (mechanism,
> period fence, `item_date` provenance, the superseded marker and back-pointer, belt/congruence
> cells) lands with **PR-1**, the **reverse pair** with **PR-2**'s un-merge, and **OQ-4's
> propose-an-un-merge needs-you door** is new scope inside PR-2 or its own PR. The gate (PR-0)
> still has not run, and it now attacks the write half too.

**Prerequisites.** (i) **OQ-1 ruled** — the whole shape hangs on it; the build does not start
before it. (ii) 裁-11 (`counterparty_aliases` human read, P4 tranche-2) is **not** a hard
dependency, but if it lands first the un-merge preview can *show* the alias it will retire instead
of describing it; sequence behind it if the calendar allows. (iii) The `counterparty_merges` table
must exist before the un-merge door, so PR-1 precedes PR-2.

1. **PR-0 (gate) — zero code. OPEN.** The independent judgement-logic review over §3.3's three
   recuts, §3.5's six rungs, §3.7's single trigger branch and §4's seven questions, plus the
   rulings lens (does §3.1 deliver 裁-19's outcome?). Record: `counterparty-merge-gate-record.md`.
2. **PR-1 — the read layer + the merge carrier. D1 WINDOW A.** `counterparty_merges` + its RLS
   pair + its update trigger · `merge_counterparties` recut (the carrier write only) ·
   `_aging_core` · `_statement_core` · `list_open_items_by_counterparty`. **The tail census
   re-proves the tie digests (P4/P5) inside the migration.**
3. **PR-2 — the un-merge door. D1 WINDOW B.** `_tf_counterparty_update_0011`'s one branch ·
   `clara.unmerge_counterparties` + its grant · the `counterparty.unmerged` event type +
   taxonomy row · the roster pin naming the hygiene panel as its frontend home
   (`.claude/rules/db-migrations.md`'s 裁-7 rule).
4. **PR-3 — the frontend.** The merge-preview re-truing (Annex E.1) · the un-merge dialog in the
   hygiene panel · the aging sub-line · the statement's `recorded_counterparty_id` column.
5. **PR-4 — acceptance, zero code.** The synthetic round in ROME PUBLIC ADVISORY (labelled
   synthetic per ADR-048), the measured before/after tie-out to the cent, `PROGRESS.md`.

**Two windows, severed at the gate (D-10).** PR-1 replaces one audited writer plus three reads;
PR-2 replaces a live trigger body that fires on **every** counterparty write. Putting them in one
window means a mid-window failure strands both the read layer and the identity trigger. Standing
runbook hazards apply to both (the DSN bridge, the 110s quiesce, `PG*` vars for rig runs).

---

## 6 · Battery and acceptance

Every finding and every rung gets a cell; contract-blind cells are marked ▣ in **Annex C**. The
sharp ones: **M2 and M3 reproduced BEFORE the fix and refused after**, on the same fixture, with
exact cents (Gate-A style: distinct non-round values per party so one wrong cell cannot be masked
by another) ▣ · **`ar_aging` totals byte-identical across the recut** ▣ · **`ar_control_tie`'s
`measured_digest` unmoved** on a fixture carrying a merge (P4) ▣ · **M9's positive control**: a
non-empty `list_open_items_by_counterparty` **before** any merge exists ▣ · the **two-session race**
— session 1 holds the client advisory lock inside `merge_counterparties` while session 2 calls
`apply_open_items` on the same client, and blocking is **proven**, not inferred · **each of U1-U6
refused with its own token, and each ADMITTED once its blocker is removed** (both directions per
wall — a rung that only ever refuses is a rung nobody has proven does anything) · the un-merge
**re-run** replaying its stored outcome · **`_tf_counterparty_update_0011`'s other branches proven
unmoved** by a mutant that tries an illegal column on a merged row and on a live row ·
`_tf_append_only` still refusing an `open_items` UPDATE **after** the migration ▣.

**Acceptance.** A full synthetic round in **ROME PUBLIC ADVISORY**: two duplicate customers with
distinct outstanding balances → merge → aging shows ONE row at the exact summed cents and the
statement shows every item → a receipt is taken → un-merge → aging shows TWO rows at the original
cents and the statement splits back → the receipt names the re-proposed rule and the un-restored
alias. Then the refusal round: settle across the merged pair, attempt the un-merge, read the U2
message. **Three numbers measured and published:** the tie-out diff before/after (must be 0 at
every step), the count of live merges in the estate at ceremony time (P1), and the count of merges
carrying post-merge cross-party activity (P2).

---

## 7 · Registered risks and named non-goals

| # | risk, registered |
|---|---|
| **R-1** | **The design dissents from the ruling's stated mechanism.** If OQ-1 returns "move them physically", §3.2 is a sketch and not a design — the build restarts at a PR-0 for a materially bigger item (item pairs, a re-home group carrier, period-lock handling, belt congruence, and an un-merge that moves money back). **FIRED, and NARROWED, 2026-08-29 (裁-24):** the hybrid keeps the read layer, so the build does not restart — but every item this row names is now genuinely owed for the write half, at open items in unfrozen periods, and §3.2 is still a sketch |
| **R-2** | **A read-layer merge is invisible at the SQL prompt.** Anyone querying `open_items` directly still sees the old party. Mitigated by `recorded_counterparty_id` being explicit in every read's payload and by the `counterparty_merges` table being human-readable — never by a comment |
| **R-3** | **`_canonical_counterparty` is now on the hot path of the two heaviest reads.** It is `stable` and index-backed by primary key, and aging already calls `_subledger_outstanding_asof` per item, but the plan changes; the build measures `ar_aging` on a thousand-item fixture and publishes the number rather than assuming |
| **R-4** | **U1-U6 will refuse un-merges that a human believes are safe.** That is the design's intent (a named refusal beats a partial reversal), and it will feel like an obstruction. The messages name the specific blocking group/rule and the route out |
| **R-5** | **M9's fix changes a shipped UI's behaviour** from "no candidates" to "candidates" in bank matching. Correct, and it will look like a new feature; the release note says so (P3) |
| **R-6** | **Two D1 windows instead of one** (D-10). The residual is a second ceremony night |
| **R-7** | **裁-11 and this item both touch the hygiene panel.** Merge order is the conductor's; neither blocks the other, and the un-merge preview degrades honestly if the alias read is not yet granted |

> **Three non-goals moved 2026-08-29 (裁-24)**, and are listed here so nobody reads the sentence
> below as still standing: **"no agent verb, no wake wrapper"** is overtaken for OQ-4's
> propose-an-un-merge door only · **"no bulk back-population… D-01 moves no data"** is false of
> the write half, so what an already-existing merge gets on the day the door ships is an open
> question the gate must answer · the un-merge is no longer only a column-clear. Everything else
> below stands.

- **Non-goals.** No change to what a merge REFUSES (`0015`'s six guards stand) · no cross-kind or
  cross-client merge · no agent verb, no wake wrapper, no `wake_fn_allowlist` row · no change to
  `_control_tie_core`, `_subledger_outstanding*`, the allocate/settle cores or any belt · no
  re-attribution of posted `journal_lines` (PRD invariant 8) · no canonicalisation of sealed
  metric snapshots (D-04) · no bulk back-population of existing merges (there is nothing to
  populate — D-01 moves no data) · no `counterparty_aliases` read policy (that is 裁-11's, and
  this design must not race it) · **no un-merge that partially reverses**: every case it cannot
  fully handle is a typed refusal.
