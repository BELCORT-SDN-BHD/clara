# F-A4 PR-2a — Annex A, the battery

*The design of record is `docs/plan/active/fa4-pr2-design-2026-08-27.md` (§§0-6) and
`docs/plan/active/fa4-pr2-design-part2-2026-08-27.md` (§§7-14); the other annexes are in
`docs/plan/active/fa4-pr2-annexes-2026-08-27.md`. This file is **Annex A** and is cited by that
name from all three. Split into its own file at the 2026-08-27 F1/F2 fold, when the annex set
passed the repo's 500-line gate.*

---

## Annex A · The battery — every wall with its cell AND its mutant

Contract-blind cells marked ▣. **The mutant law:** every new or flipped wall re-runs its
mutant *after* the fix, in a rolled-back transaction. A wall whose mutant was only ever run
before the fix has proven that the instrument once worked, not that it still does.

| # | wall | cell | mutant |
|---|---|---|---|
| W1 | the extraction moved text, not behaviour | normalized-prosrc differential (harvested pre vs post, modulo the ctx substitution) ▣ | reorder one statement in a scratch copy → the differential reds |
| W2 | the human door's floor survives | a `viewer` calling `propose_adjustment_template` still refuses at the floor | a `bookkeeper` succeeds (positive control) |
| W3 | the core is ungranted | ACL census over the closed set | grant it to `clara_authenticated` in a rolled-back txn → the census reds |
| W4 | the ACL/ownership/`search_path` triple is byte-unmoved | prestate-vs-tail comparison of `proacl` / `proowner` / `proconfig` | revoke one grant in a scratch txn → reds |
| W5 | **the agent can never sign** | closed-world read: `status='live'` is written by exactly one body, and no wake role holds EXECUTE on it ▣. **Ceiling, stated in the cell as W11's is:** the writer half is a prosrc scan for the `live` status write — a spelling instrument, not an identity one (law 3) — so it is PAIRED with the ACL half, which is structural and is the claim that actually binds | a real admin signs the agent's proposed template → succeeds (the human path is open); and a scratch body writing that status under another name makes the prosrc half red, proving the scan is live |
| W6 | B10 fails closed and names the missing fact | no live service period → `prepayment_term_underivable`, payload names `document_service_periods` and the document id; **zero `adjustment_templates` rows written** | record the period through the door, re-run → acted |
| W7 | no bound document is its own refusal | a memo-basis prepaid entry → `prepayment_term_underivable` | the same entry with a document + period → acted |
| W8 | `prepayment_source_unfit` | three cells: unapproved entry · foreign client · ambiguous prepaid leg | the fit case acts |
| W9 | evaluator determinism | two calls return byte-identical `period_lines`; `sum(period_lines) = total_cents` to the sen ▣ | a total with a remainder (100 sen over 3 months) proves the remainder lands **wholly** in the final period |
| W10 | the split-month rule (law 20) | a day-1 start and a day-2 start over the same span produce different first periods | **self-mutating by construction:** the two arms are each other's mutant — collapse the rule and the two answers become equal, which the cell asserts they are not |
| W11 | the single-member closure | `evaluator_version_members` count = 1; a prosrc scan finds no `clara.` call site (ceiling stated in the cell) | add a helper call in a scratch copy → both instruments red |
| W12 | the freeze binds | `verify_evaluator_freeze()` green after registration | `create or replace` the evaluator in a rolled-back txn → red |
| W13 | op-key discipline | a caller-minted key → `op_key_not_derived`; a retry of the same entry replays | two source entries in one task both act, with distinct templates and distinct sub-keys |
| W14 | **receipt honesty under multiplicity** | refusals on entries A and B in ONE task are TWO rows with distinct `subject_id` ▣ | collapse the subject to the client in a scratch build → the second refusal wears the first's receipt (FIX-1 reproduced) |
| W15 | the FIX-1 regression, extended to wrapper 12 | refused→acted and acted→refused within one task give two receipts with honest verdicts | drop `verdict` from `uq_aar` in a rolled-back txn → the second call returns the first's receipt id under the wrong status (FIX-1 reproduced on this verb) |
| W16 | `subject_kind` extends, does not loosen | a receipt at `adjustment_template` inserts; an unknown kind still refuses | in a rolled-back txn restore the pre-PR-2a six-value CHECK → the ACTED insert reds, proving the cell reads the NEW constraint and not an incidentally-permissive one |
| W17 | the carrier is supersede-only | an UPDATE of `period_start` refuses; the supersede stamp succeeds; DELETE and TRUNCATE refuse | disable the supersede-only trigger in a rolled-back txn → the `period_start` UPDATE lands, proving the trigger and not a coincidence is the refusal |
| W18 | one live period per document | a second live insert hits `uq_document_service_period_live` | after superseding the first, the second inserts |
| W19 | the carrier's basis discipline | `extracted` with no region refuses; a region with `human_stated` refuses; a blank basis refuses | a well-formed `human_stated` row inserts |
| W20 | the carrier's tenancy + floor | a firm viewer reads zero rows; a foreign firm reads zero; a bookkeeper reads its own firm's | drop the rank conjunct in a scratch txn → the viewer reads |
| W21 | **residual 1** | a firm viewer selects zero from `close_proposals` and from `close_prep_holds`; a bookkeeper selects them | drop each conjunct in a rolled-back txn → the viewer reads (both tables, separately) |
| W22 | residual 1 breaks no definer path | `attest_close_exception(p_from_proposal)` and `settle_close_proposal` still work for a bookkeeper after the policy recut ▣ | run the same arm as a below-floor VIEWER → it must fail at the door's own floor, not at the policy. A definer path that reads identically for both ranks would mean the cell cannot see a definer break at all |
| W23 | **MED-8** | a fresh task drafting a strict subset with unmoved digests → `close_proposal_no_state_change`; the live proposal is STILL `open` ▣ | move one digest → supersedes under arm (1), and `settle_reason` names the moved key **AND every dropped `(check_key, item_key)` pair** (N7) — assert the dropped pair appears in the durable reason, since arm (1) is the one arm that can lose coverage |
| W24 | MED-8, the STRICT-SUPERSET arm **over PAIRS** (N5) | a draft that is a proper superset of the live PAIR set → supersedes, `settle_reason` naming the added pairs. **Positive control that pins the granularity:** live `{(A, i1)}` vs incoming `{(A, i1), (A, i2)}` must SUPERSEDE — same check_key set `{A}`, so a check_key-granularity reading would wrongly refuse this legitimate growth | **the trade case:** a draft that adds one pair and DROPS three → must REFUSE `close_proposal_no_state_change`. This is the arm the review's churn fact killed — under the old non-empty-new-pairs reading it superseded |
| W25 | residual 2 | the index census fires on `indrelid`, key columns and predicate text | create a same-named index on another table in a scratch txn → the census reds (0138's own T.1b would have passed it) |
| W26 | residual 3 | the policy census reads `polcmd` / `polroles` / `polqual` | flip one policy's roles, then drop one rank conjunct → two separate reds |
| W27 | residual 4 | `_tf_close_proposal_drafted_unique` is in both closed sets; the PR-1c cohort still resolves whole | grant it to `clara_authenticated` in a rolled-back txn → the ungranted-set census reds, proving the new member is actually probed and not merely listed |
| W28 | residual 5 is honest | the demonstration cell: a superseded predecessor's attestation satisfies a successor's settle — the gap, made visible ▣ | **the inverse control:** with NO attestation on the run at all, the same settle-to-`adopted` REFUSES — so the cell above shows a mis-BINDING, not a door that never checks anything |
| W29 | **the park flips** | both parked objects resolve at exact signatures; allowlist = 13 `close_prep` rows, each naming a live function; no existing row moved | **a REAL mutant, no exception (F7).** In a rolled-back txn drop the wrapper and re-run → the presence half reds; separately delete the thirteenth allowlist row → the count half reds. A flipped gate that cannot fail is the same false green its parked ancestor was written to avoid |
| W30 | constraint 15 | zero PR-2a objects in `workflow` / `graphile_worker` / `spike`; what those schemas hold is REPORTED, not asserted | create a same-named dummy function in `spike` inside a rolled-back txn → the census reds, proving it looks in those schemas at all |
| W31 | **the FY refusal is SELF-HEALABLE, not a dead end** (conductor's note, design §13 item 4) | the two-phase cell: a term running past the entry's FY with no opened successor → `prepayment_term_underivable`; **the same wake session then opens the successor year through `wake_open_fiscal_year`**; the same draft, re-run, **acts** ▣ | hold the year unopened and re-run → still refuses (the refusal is the year's absence, not a flake) |

| W32 | **F4 — the mint-snapshot collision** | two DIFFERENT months minted in ONE wake task, both refusing on the same vector → **two receipt rows**, each naming its own month in `op_key` ▣ | revert to the bare `p_op_key` in a rolled-back build → the second month's refusal returns the first month's receipt id (the shipped defect, reproduced) |
| W33 | **F6 — the region belongs to THIS document** | a service period on document A citing a region extracted from document B (same firm) → `service_period_evidence_foreign_document` | drop the congruence trigger in a rolled-back txn → the forged row lands, proving the composite FK alone never saw it |
| W34 | **F8(a) — twin equivalence** (DE-PARAMETERIZED by F1) | the agent core and the human door, given IDENTICAL inputs **including the same `schedule`**, produce **byte-identical durable state**: same `content_hash`, same canonical `lines`, same `schedule`, same column values, same `_audit` shape — differing only in the two ctx-derived fields (`proposed_by`, `proposed_op_key`) ▣ | perturb one line's order in the agent's input → the hashes diverge, proving the comparison is live rather than trivially true |
| W35 | **F8(b) — the books actually close** (DE-PARAMETERIZED by F1/F2) | end-to-end over the ruled convention: propose a term whose total does NOT divide evenly by `n` → a human signs → every occurrence runs → **the prepaid asset account reaches exactly zero**, the expense side totals `total_cents` on the F2-judged account, and periods 1..n-1 carry the base while period n carries base+remainder ▣ | stop one occurrence short → the balance is non-zero, so the cell reads a real ledger rather than asserting a tautology |
| W36 | **F1 — null-stability of the four recut bodies** | every template with `schedule is null` posts, approves and hashes **byte-identically** across the migration: an occurrence run before and after produces identical `journal_lines`, and `_adj_on_approve` still passes ▣ | give one template a `schedule` and re-run → the amounts differ, proving the cell would SEE a behaviour change rather than passing regardless |
| W37 | **F1 — the hash extension is null-stable** | an existing template's `content_hash` RECOMPUTES to the exact bytes it was stored with under the eight-argument `_adj_template_hash`, so the duplicate guard survives the change ▣ | fold the `schedule` key in unconditionally in a scratch copy → every stored hash mismatches, which is the defect this cell exists to catch |
| W38 | **F3 — pre-rung (a) as a construction invariant** | for a service period starting on ANY day of a month, the constructed template `start_date` equals `_adj_period_start(client,'monthly',start)` — alignment holds by construction under the ruled convention, and the rung does not fire | hand-build a schedule whose start is NOT a month start → the rung fires, proving it is still a live self-check and not dead code |
| W39 | **F2 — the three walls** (third sub-cell rebuilt to the ruled form, N2) | (1) an ineligible target (bank-class, non-P&L, or absent from the COA) → `prepayment_target_ineligible`; (2) the acted receipt carries the account AND its basis; (3a) **the sign surface RENDERS schedule + target account** — a projection cell over `_adj_template_json`; (3b) **a declined-then-corrected re-propose round-trip posts to the CORRECTED account**, and the signed `content_hash` covers the schedule ▣ | pass a well-formed expense account → acts, so wall (1) is not refusing everything; and assert the sign door itself is byte-unmoved, so (3b) cannot be passing because someone widened it |
| W40 | **F2 — the refusal is the no-plausible-account arm** | a client whose COA offers no plausible expense target → `prepayment_target_underivable`, naming the gap | the same client WITH a plausible account → acts, proving the refusal is conditional and not the default path |

| W41 | **N1 — shape congruence, validated AT PROPOSE** | a schedule whose period lines post to a **BANK account** not present in `lines` → `schedule_shape_incongruent` **at propose**, before any row is written ▣ | the congruent schedule proposes cleanly — and with the constraint removed in a scratch build, the bank-account schedule PROPOSES and then posts, which is the defect the constraint exists to make impossible |
| W42 | **N1 — per-period balance** | a schedule with one period out of balance by one sen → `schedule_period_unbalanced` at propose | a balanced schedule proposes; and the poster's own exact-equality check (0045:5196-5199) is never reached, proving the propose-time wall is the one talking |
| W43 | **N10 — coverage, and the resolver's typed no-match** | a schedule that is empty (`'[]'::jsonb`) → refused; one with a gap in the occurrence range → `schedule_coverage_gap` at propose; and a hand-planted gap reaching the resolver → `schedule_period_uncovered`, **never an empty line set** | make the resolver return `'[]'` in a scratch build → the occurrence posts ZERO lines and balances trivially, charging nothing: the silent-nothing this branch exists to prevent |
| W44 | **N1 — the six amount-blind readers stay correct** | with a congruent schedule live, all six `t.lines` readers (Annex H.3) answer exactly as they do for a null-schedule twin: the due oracle, both eligibility reads, both shape reads and the advisory ▣ | make one period incongruent by bypassing propose → the due oracle's answer diverges, proving the cell reads real behaviour and that congruence is what holds those six |

**Fixtures the battery needs that do not exist today:** a client with an approved prepaid
journal entry bound to a document (W6-W9), a second such entry on the same client in one wake
task (W13-W14), a client whose service period runs past its open FY with the successor year
**not yet opened** (W31), two months mintable in one task (W32), a second document on the same
firm carrying its own extraction region (W33), a signed template whose occurrences can all be
run and whose total does NOT divide evenly by `n` (W35), a pre-migration template carrying a live
occurrence history (W36), and a client whose COA offers no plausible expense target (W40). All
built through governed doors, never as hand-written rows.

**Every conditional skip is ARMED and PROBED (F8c).** Vacuity has layers in this estate, and the
battery states its own defence rather than assuming it: (i) no cell may gate on a flag assigned
in `before()` — the 0136 lesson, where `{skip: flag}` always read the initial value; (ii) every
`t.skip()` path prints the catalog fact that triggered it, so a skipped run is legible as a
decision rather than a silence; (iii) the focused PR-2a run is executed with its allow-missing
variable **unset**, which is the shape that fails rather than skips; and (iv) the suite asserts a
**skip count of zero** in that shape. A cell that only ever skips is a false green — which is the
same failure mode the parked W29 gate was written to avoid, one layer up.

**W31 is an integration cell, not a unit cell.** It is the one place this battery proves that
two F-A4 verbs compose inside a single clocked pass — the refusal wrapper 12 writes is one the
lane can itself clear under R6/HIGH-1, and the estate has been bitten before by a rung whose
"blocked" state nothing ever drove to its resolution (0138's own B13 arm-1 carry-forward).
