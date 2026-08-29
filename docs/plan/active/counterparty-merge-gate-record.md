# 裁-19 · counterparty merge re-home + un-merge — PR-0 gate record

> **Status: BUILT — PR-1's READ half (2026-08-29).** The gate's §1 lens list ran against the
> read half, PR-1 is authored, rig-verified and under review, and **the WRITE half is BLOCKED on
> a new owner question, OQ-8 (§2.2).** What this file now is: (1) the standing lens list, still
> live for the write half; (2) the owner questions with the design's recommendation on each,
> plus the 2026-08-29 rulings and **OQ-8**; (3) the fold obligations, with **2 and 7 DISCHARGED
> and 4 discharged in part** by PR-1; and (4) a §5 refuted register that is no longer empty.
>
> *(Historical, pre-build:)* **Status: OPEN.** The design set (`counterparty-merge-survey.md` ·
> `counterparty-merge-design.md` · `counterparty-merge-annexes.md`) is authored and rig-grounded;
> the independent judgement-logic review has **not** run and **the build may not start**.
>
> **Why a gate at all** (review law 1, ADR-061 uniform): this item is judgement logic almost end
> to end — six refusal rungs on the un-merge, a fail-closed branch in an aging read, one added
> branch inside a live identity trigger, and a re-cut of the two reports a professional uses to
> chase money. The author's own read is not sufficient for any of it.
>
> **THE SEVEN OWNER QUESTIONS ARE RULED — 2026-08-29 (裁-24), §2.1 below.** OQ-1 came back
> **PHYSICAL, in the append-only shape**: the canonicalising read layer STAYS (frozen years and
> history use it) **and** an appended **re-home pair** write door is added for OPEN items in
> UNFROZEN periods. **D-01 becomes a HYBRID and the design set is AMENDED, not superseded** — so
> the gate's own §1 lens list still applies to §3 as written, plus the new write half. The gate
> itself has **not** run; the build may not start.
>
> *(Historical, pre-ruling:)* **Prerequisite that outranks the gate: OQ-1.** The design **dissents
> from 裁-19's stated mechanism** (§3.1/D-01). If the owner rules that the ruling meant the
> physical move literally, this design set is superseded, not amended, and a new PR-0 opens for a
> materially larger item. The gate should run **after** OQ-1 is ruled, or its findings against §3
> may be findings against a shape that is about to change.

---

## 1 · What the gate must attack (the lens list)

| # | lens | the specific claim to break |
|---|---|---|
| **L1 · bytes** | every `file:line` in the survey re-resolved independently, and every **live tip** re-walked by CoR lineage on the reviewer's own rig | the survey names three CoR'd bodies (`merge_counterparties` `0015:2242`, `_tf_counterparty_update_0011` `0040:6230`, `_tf_coding_rule_update` `0016:1542`). A superseded-body cite is this estate's most expensive recurring error |
| **L2 · the pins** | re-derive every `prosrc` sha256 in Annex B.1 on a fresh rig at `0142` | a pin that does not reproduce means the design was written against a body that is not live |
| **L3 · the behavioural claims** | re-drive M2/M3/M9/M13 through the **real doors**, not by setting columns | the survey's four new findings are the load-bearing ones. If any is wrong, §3 changes |
| **L4 · D-01, adversarially** | argue the **physical move** as hard as the design argues against it | in particular: is there a shape that preserves `item_date` without weakening `_tf_append_only` — an `item_date`-carrying re-home pair, a `rehomed_from` column, a superseding-item idiom? The design says no; prove it or break it |
| **L5 · the fail-closed branch (D-02)** | attack `_aging_core`'s unresolvable-party path | the design chose coalesce-to-raw + a tag for NULL, and an uncaught raise for a cyclic chain. Both are judgement calls about **whether a report may be short**. Is "raise out of `ar_aging`" the right failure, or does it take the whole close gate down with it (`_control_tie_core` → `_evaluate_one_gate`)? **This is the single most likely blocker in the set** |
| **L6 · the six rungs** | for each of U1-U6: is it **complete**? Is there a post-merge act that entangles the parties and that no rung sees? | candidates the gate should hunt: bank-line matches (`_settle_from_bank_line_core`), `document_filings` attributed through the merged fingerprint, `client_facts` / vendor identity bindings (`0028`) written against the survivor, `seeding_proposals`, open questions scoped `vendor` (`_open_question_blocks` canonicalises) |
| **L7 · the trigger branch (D-06)** | is A.3's added branch **exactly** as narrow as it claims? | the diff test is `to_jsonb(new) - three columns is not distinct from to_jsonb(old) - three columns`. Does any column default or trigger-set value (`updated_at` from a sibling trigger) slip through? Is `new.merged_into is null AND new.retired_at is null` the right conjunction, or does a legitimate un-merge ever need to keep `retired_at`? |
| **L8 · the digest-neutrality claim (M4/P4/P5)** | prove `ar_control_tie`'s `measured_digest` is unmoved, on a fixture **carrying a merge**, at the bytes | the design asserts regrouping cannot move a total. That is arithmetic, and arithmetic is exactly what an estate gets wrong when a `jsonb_agg` ordering or a `coalesce` moves with it |
| **L9 · M9's blast radius** | who consumes `list_open_items_by_counterparty` today, and what breaks when it starts returning rows? | `apps/web/lib/bank/match-reads.ts`, `apps/dashboard/app/shared/bankApi.ts`. A UI that has never rendered a non-empty list may have untested paths |
| **L10 · the un-merge's own audit** | does the receipt say enough for a professional to know what happened, months later, without the transcript? | `alias_restored:false` and `rule_requires_signature:true` are the two facts the design puts on it. Is that the whole set? |
| **L11 · the rulings lens** | does §3 deliver **裁-19's outcome** — *"aging consolidates"*, *"the same money reads the same in both reports"*, *"splitting re-homed items and history back"* — with the read layer? | the third clause is the sharp one: with nothing re-homed, is "splitting back" even meaningful, or does the un-merge's honest description change? |
| **L12 · the battery** | mutate the fixtures: does each cell fail for its own reason? | the T8 lesson (PR #397 F6/F7): eight of fifteen mutants survived the first pass, and a "fix" once asserted one string that four cells shared |

---

## 2 · Owner questions — each with the design's recommendation

These are restated from `counterparty-merge-design.md` §4 so this record stands alone. **The build
proceeds on the recommendation under the standing delegation, EXCEPT OQ-1, which gates the item.**

| # | question | recommendation | the fail-closed default if unruled |
|---|---|---|---|
| **OQ-1** ⛔ | 裁-19 says merge *moves* the items. The design delivers the outcome with a **canonicalising read layer** and moves nothing (D-01). **Outcome, or mechanism?** | **the read layer.** A physical move re-dates every re-homed debt into `current` (`0037:713-715`), or needs `_tf_append_only` weakened — measured to refuse even a superuser. Both are worse than the defect | **BLOCKS.** The item does not start without this ruling |
| **OQ-2** | keep a visible `recorded_counterparty_id` on aging and statement rows? | **yes** — the accountant must still see which name the invoice was raised under | yes (dropping it later is a subtraction) |
| **OQ-3** | leave sealed metric snapshots capturing the **recorded** party (`_metric_input_dataset_v1`)? | **yes, leave it** — a seal records what the books said at seal time; changing it is a reporting-agency question | leave it |
| **OQ-4** | the un-merge floor: **admin, human-only**, or bookkeeper to match the merge? | **admin, human-only, no wake wrapper** — it resurrects a retired identity and corrects a bookkeeper's judgement | admin (widening later is a grant) |
| **OQ-5** | refuse an un-merge across a **closed fiscal year** boundary? | **no separate rung** — U1/U2/U4 already refuse every case where a closed year's numbers would change, and the un-merge writes no dated row | add **U7** `unmerge_crosses_closed_year`: strictly narrower, strictly safer |
| **OQ-6** | fix **M9** (`list_open_items_by_counterparty` inert since `0038`) inside this PR, or sever it? | **inside PR-1**, named as its own finding in the PR body — it is the same three-line surface and the same census | sever (costs a second review + ceremony slot) |
| **OQ-7** | the `counterparty.unmerged` taxonomy decision at active version 2 | **`context_update`**, matching `counterparty.created` | `ignore`, matching `counterparty.merged` |

### 2.1 · The rulings — 2026-08-29 (裁-24)

The recommendations above are kept verbatim; a gate record that erases what was argued cannot
show why a ruling went the way it did. Ruling of record: `mohe-grill-rulings-2026-08-28.md`
§裁-24.

- **OQ-1 — RULED 2026-08-29 (裁-24): OVERRULED, and then narrowed by the owner himself into a
  HYBRID.** The owner first chose *"physically rewrite the invoice rows"*; **the orchestrator's
  dissent was put and is recorded** (the append-only wall is the audit chain; constraint 14's
  operative clause). He then chose the physical variant that keeps the wall: **for every OPEN
  item of the merged party in an UNFROZEN period, append a "re-home pair"** — the old row marked
  **superseded**, a new row under the **survivor** carrying the **ORIGINAL date** (aging
  preserved) and a **back-pointer** to the old one; **an un-merge appends the reverse pair**.
  **Frozen fiscal years are untouched and fold in the READ layer only**; sealed snapshots are
  unchanged. So the read layer of §3.3 **stays** and a write door is **added** over it. **D-01
  becomes hybrid; the set is AMENDED, not superseded**, and §7/R-1's "the build restarts at a new
  PR-0" narrows to the write half's own design. **Obligation this ruling creates for the gate:**
  §3.2's sketch dated the pair at `_book_today()`; the ruling requires the ORIGINAL date, so the
  `item_date` provenance question §3.2 already named ("an `item_date` provenance column, or the
  aging honestly reporting the re-home date") is now **load-bearing and must be answered with a
  D-number and a cell**, against `0037:713-715`'s current-bucket rule.
- **OQ-2 — RULED 2026-08-29 (裁-24): YES**, as recommended. A visible `recorded_counterparty_id`
  stays on aging and statement rows.
- **OQ-3 — RULED 2026-08-29 (裁-24): LEAVE**, as recommended. Sealed snapshots keep the recorded
  party.
- **OQ-4 — RULED 2026-08-29 (裁-24): WIDENED.** Admin, human-signed — **and Clara MAY PROPOSE an
  un-merge** as a needs-you item, with the admin clicking. The recommendation was "admin,
  human-only, no wake wrapper"; the propose half is new authority and needs its own design.
- **OQ-5 — RULED 2026-08-29 (裁-24): no separate closed-FY rung**, as recommended — the six
  entanglement rungs plus OQ-1's frozen-year clause cover it.
- **OQ-6 — RULED 2026-08-29 (裁-24): fix M9 INSIDE PR-1**, named, as recommended.
- **OQ-7 — RULED 2026-08-29 (裁-24): `context_update`**, as recommended.

### 2.2 · OQ-8 — the write half's SHAPE. RAISED BY PR-1, NOT YET RULED. ⛔

**PR-1 built the read half and stopped at the write door**, on a structural fact measured at the
live catalog rather than on a scoping preference. `clara._subledger_classify_entry`
**canonicalises the counterparty on every ladder**, so after a merge the merged party and the
survivor **ARE one canonical group**; `clara._tf_subledger_item_belt` asserts that each
`(entry, domain, CANONICAL counterparty)` group's SUM and single `item_kind` are exactly what the
classifier produces, so **a re-homed row doubles its own group and the belt refuses it**, and
`clara._tf_subledger_entry_belt` then refuses every later write to that entry. A closed-world
census (`pg_proc.prosrc ~ 'clara[.]open_items'`, **23 bodies**) says the superseded-exclusion fix
is then owed by `_subledger_classify_entry`, **both belts**, `_subledger_outstanding`/`_asof`,
`_agent_get_bank_pack_core`, `_subledger_decompose_preview`, `_resolve_and_book_bank_line_core`
— **and `_metric_input_dataset_v1`, which OQ-3 RULED "leave"**. A ruled answer against a ruled
answer is a hard-constraint-1 collision.

| shape | what it is | cost |
|---|---|---|
| **S0** | the design's original D-01: read layer only, no write door | zero further work; but 裁-24's "physically append a re-home pair" is not delivered, only its OUTCOME |
| **S1** | the ruling's literal shape — old row marked superseded (by an appended back-pointer, never an UPDATE), new row under the survivor at the ORIGINAL date | one clean row per debt and a correct item list; ~10 further live bodies recut, including both belts, the classifier, and the sealed-snapshot source — which **reopens OQ-3** and F-A5's reporting-agency gate |
| **S2** | §3.2's net-zero adjustment pair on a NEW journal entry, minted with the **ORIGINAL** `item_date` | no belt recut (the belts' own "canonical zero-net collapse" comment already blesses the resulting state) and no OQ-3 collision; but the merged party's original invoice stays open offset by an appended −X, so the item list carries THREE rows per re-homed debt, and "the invoice now sits under the survivor" is true only in NET terms |

**`item_date` itself is NOT the open question** — it is settled as **D-13** and holds for either
write shape: the re-home path admits the original `item_date`/`due_date` explicitly through a
dedicated core (never a hand-INSERT). Measured ground: `open_items.item_date` carries no CHECK
tying it to the entry, `_tf_open_items_validate` checks only the counterparty KIND, **neither belt
reads `item_date`**, and the classifier does not emit one — so `0037:713-715`'s "current bucket"
is `_subledger_on_approve`'s own DERIVATION, a writer default rather than a wall.

---

## 3 · What the gate must FOLD into v2 (open obligations, regardless of findings)

1. **The OQ-1 ruling, in the design's own words**, with the dissent kept on file either way
   (`orchestrator dissent recorded` is the estate's idiom — a ruling that overrides a
   recommendation must still show what was argued). **Ruled 2026-08-29 (裁-24): the hybrid.** The
   fold this now owes is the WRITE half — the re-home pair's shape (superseded marker,
   back-pointer, original date), its period gate (OPEN items in UNFROZEN periods only), the
   reverse pair the un-merge appends, and the belt/congruence cells for every minted pair — each
   with its own D-number, plus the OQ-4 propose-an-un-merge door.
2. **L5's answer as a numbered decision. ✅ DISCHARGED by PR-1 (2026-08-29), and the premise the
   question rested on was FALSE.** L5 asked whether raising out of `ar_aging` "takes the whole
   close gate down with it (`_control_tie_core` → `_evaluate_one_gate`)". **It does not, measured:**
   `clara._measure_one_gate` (`0104:420-450`) wraps EVERY gate probe in
   `exception when others → state='error'` and records the **sqlstate** on the result;
   `clara.finalize_close`'s drawer-1 sweep (`0056:2069-2073`) then refuses the close with **CLR41
   / `drawer1_state_unknown`**, naming the check_key. So the raise becomes a **typed refusal with
   its evidence attached**, never an outage — which is why **D-02 stands as written**: coalesce an
   unresolvable party to the raw id (money never leaves a report), let a cyclic chain raise. PR-1's
   own first draft asserted the opposite in a comment; that comment is corrected in the migration
   and the mechanism is now driven end to end by cell **cm.20** (the gate records `state='error'`
   with `sqlstate='CLR23'`; `finalize_close` refuses CLR41 naming `ar_control_tie`).
3. **The U-rung completeness verdict (L6)** — either "the six are complete, here is the closed-world
   census that says so", or the seventh rung with its token. **A missing rung is a silent partial
   reversal**, which §3.5 exists to forbid.
4. **A closed-world census of post-merge entanglement sources**, derived from the live catalog
   (every body that writes a row keyed on a counterparty), not from this design's imagination.
   That census is the evidence for point 3 and belongs in Annex B.
5. **P1 and P2 measured** on the live estate during the ceremony window: how many merges exist,
   how many carry post-merge cross-party activity. If P2 > 0, the un-merge ships already unable to
   reverse a real merge, and that must be stated in `PROGRESS.md` Known issues, not discovered by a
   user.
6. **The `_aging_core` performance number (R-3)**, measured on a thousand-item fixture and
   published — `_canonical_counterparty` is now per-item on the estate's heaviest read.
7. **The D1 inventory re-derived independently** (Annex B.3). The design lists four bodies in
   window A and two in window B; the gate derives its own list and reconciles.
   **✅ DISCHARGED for window A (2026-08-29).** PR-1 replaces **exactly four** bodies —
   `merge_counterparties` (the one audited WRITER), `_aging_core`, `_statement_core`,
   `list_open_items_by_counterparty` — and the independent review re-derived the same four. Each
   is proven to be exactly its own splice by a byte-for-byte re-substitution of the pre-image
   inside the migration, and **fifteen witness bodies** are proven byte-unchanged on `prosrc`
   sha256 in the same tail. Window B is still PR-2's.
8. **The frontend string set re-read against the shipped file** (Annex E.1) — T8's strings were
   accurate on 2026-08-28 and the port wave is live; a key that has moved makes E.1 a broken
   contract for PR-3.

---

## 4 · Standing method notes for the reviewing lane

- **Isolated worktree + your own rig**, instance-unique port, minted password, bootstrap role
  `postgres` (never a `clara*` name — `0119`'s grantee census matches `rolname like 'clara%'`), db
  suite at `--test-concurrency=1`. Recipe: `docs/plan/active/wave-f-lane-brief.md`.
- **Read the live catalog, not the migration text.** Three of this item's five central bodies are
  CoR'd; the survey's own headline findings only appear when you read `pg_get_functiondef`.
- **Absence is not evidence** (review law 2). "I did not find another entanglement source" is not
  a census; a `pg_proc.prosrc` closed-world query is.
- **Spelling is not identity** (review law 3). The refusal tokens are proven by making the wall
  **refuse**, never by grepping the body for the token.
- **Drive the doors, don't set the columns.** Every behavioural claim in the survey was measured
  through `create_counterparty` / `merge_counterparties` / `apply_open_items` / `ar_aging` /
  `customer_statement` in a real bookkeeper session. A finding produced by `update
  clara.counterparties set merged_into = …` proves something about a state, not about the product.

---

## 5 · Refuted register

Findings raised and adversarially disproven, recorded so nobody re-raises them.

| # | the claim, as raised | how it was refuted | by |
|---|---|---|---|
| **R-01** | *"A raise out of `_aging_core` takes the whole close gate down with it"* — asserted in L5's framing and, at first, in PR-1's own D-02 comment. | **Measured false.** `_measure_one_gate` catches every gate exception and records `state='error'` **with the sqlstate**; `finalize_close`'s drawer-1 sweep then refuses **CLR41 / `drawer1_state_unknown`**. The failure is a typed refusal carrying its evidence, not an outage. Driven end to end by cell **cm.20**. | PR-1 fix round, 2026-08-29 |
| **R-02** | *"`clara.apply_open_items` is a consumer of `_aging_core`"* — a raw `prosrc` census returns it. | **Refuted by the comment-stripped instrument**: its only mention of `_aging_core` sits in a COMMENT (`-- item_date <= as_of (0040 _aging_core) …`). The true consumer set is **four**: `ar_aging`, `ap_aging`, `_control_tie_core`, `_snapshot_dataset`. This is itself the comment-vs-code class the M2 drift guard now defends against. | PR-1 fix round, 2026-08-29 |
| **R-03** | *"PR-1's estate run leaves two pre-existing reds on `main`"* (`p4t2.request…` and `A19g approve_opening_seed…`). | **Half refuted.** `p4t2.request` is `ok` on both pristine rigs — it was an artefact of this lane's chunked/retried run, not a `main` red. `A19g` stands as pre-existing. | independent review of cf4c267c |
| **R-04** | *"M12's NULL `alias_id` branch is a reachable product state"* — implied by the survey's framing. | **Refuted by the doors themselves**: `uq_counterparty_aliases_live_name` is unique on `(client_id, alias_normalized)` client-wide, `add_counterparty_alias` refuses a name colliding with a live canonical counterparty, and `rename_counterparty` refuses a name colliding with another party's live alias. The branch is **defensive**, not reachable; cell **cm.14** seeds the state and says so in its own message. | PR-1, 2026-08-29 |
