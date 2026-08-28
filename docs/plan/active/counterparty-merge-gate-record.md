# 裁-19 · counterparty merge re-home + un-merge — PR-0 gate record

> **Status: OPEN.** The design set (`counterparty-merge-survey.md` ·
> `counterparty-merge-design.md` · `counterparty-merge-annexes.md`) is authored and rig-grounded;
> the independent judgement-logic review has **not** run and **the build may not start**.
> This file is (1) the standing list of what the gate must attack, (2) the owner questions with
> the design's recommendation on each, and (3) what the gate must fold before v2.
>
> **Why a gate at all** (review law 1, ADR-061 uniform): this item is judgement logic almost end
> to end — six refusal rungs on the un-merge, a fail-closed branch in an aging read, one added
> branch inside a live identity trigger, and a re-cut of the two reports a professional uses to
> chase money. The author's own read is not sufficient for any of it.
>
> **Prerequisite that outranks the gate: OQ-1.** The design **dissents from 裁-19's stated
> mechanism** (§3.1/D-01). If the owner rules that the ruling meant the physical move literally,
> this design set is superseded, not amended, and a new PR-0 opens for a materially larger item.
> The gate should run **after** OQ-1 is ruled, or its findings against §3 may be findings against
> a shape that is about to change.

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

---

## 3 · What the gate must FOLD into v2 (open obligations, regardless of findings)

1. **The OQ-1 ruling, in the design's own words**, with the dissent kept on file either way
   (`orchestrator dissent recorded` is the estate's idiom — a ruling that overrides a
   recommendation must still show what was argued).
2. **L5's answer as a numbered decision.** Whichever way it goes, `_aging_core`'s behaviour on an
   unresolvable party is judgement logic and needs its own D-number and its own cell.
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

*(Empty until the gate runs. Findings raised and adversarially disproven are recorded here so
nobody re-raises them, per the house convention.)*
