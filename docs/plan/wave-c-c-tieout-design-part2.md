# Wave C-c design — part 2: the design-ladder record (round 1)

> **This file continues `wave-c-c-tieout-design.md` (v2)** — same status, same authority.
> It records design-ladder round 1 (2026-07-31): THREE independent opus adversarial lenses
> (identity algebra · concurrency/lifecycle · authority/CoR) + ONE Codex cross-model pass
> (`gpt-5.6-sol`, xhigh, direct exec, read-only). Every finding is adjudicated; v2.1 carries
> every accepted fix. **v1 was a working draft never committed** (the C-b docs' false
> "see git history" pointer is a named trap — not repeated here): each finding row quotes or
> describes the clause it attacked, so this record is self-contained.

## Round-1 verdicts (verbatim summaries)

- **Algebra lens:** "§3 as written does not close on the substrate that exists … all four
  terms-level failures share one root cause: the bank-side term was defined as 'open
  exceptions on this statement' when the arithmetic requires 'every bank line through P.end
  that the books do not hold as of P.end', and consumption was dated at the group grain when
  the substrate only ever ties at the line grain. Do not proceed to migration drafting."
- **Races lens:** "The arithmetic spine is wrong in two places the acceptance corpus will
  hit on its first real month, and the belt as written cancels the receipt law it is meant
  to protect … I could not construct a lock cycle from the stated order [004→006 is
  genuinely correct] … the real certify-while-mutating windows are elsewhere:
  `remap_bank_account_coa` and `deactivate_bank_account` take no advisory rung whatsoever."
- **Authority lens:** "Three load-bearing claims are contradicted by the substrate the
  design cites [the `origin='rule'` seam has no writer; the due-date producer is refused by
  `_tf_counterparty_update_0011`; the identity refuses three shapes C-b made legal] … two
  paths move real authority without saying so [the consent door aimed at a
  `clara_runtime`-granted verb; suggestion-born approvals breeding `vendor_account`
  autopost proposals around the WA2-R9 wall]. Do not proceed to build."
- **Codex:** "Not safe to build from this draft. The owner rulings can remain intact, but
  the mechanism currently makes valid cross-period/post-period matches impossible to
  reconcile, permits false-green exception completion, cannot answer historical aging, and
  cannot preserve what a receipt certified across ordinary book or COA mutations."

**Convergence note:** all four lanes independently found the same three blockers (the
exception term's period scoping · the group-grain consumption dating · the as-of aging
impossibility on `_subledger_outstanding`) — the strongest possible signal that they are
real. Every WCC ruling survived untouched; every finding was mechanism, not choice.

## The finding register (deduped; A=algebra R=races Au=authority C=codex)

| # | Finding (severity at worst citation) | Adjudication → v2 |
|---|---|---|
| 1 | `excepted(P)` period-scoped while gl/outstanding are all-time — one carried bank dispute wedges every later month [A1/R1/Au5/C4 BLOCKER] | ACCEPTED — all-time excepted term (§3) |
| 2 | Resolved exception leaves a term-less hole; the belt "re-derives from live rows" refuses the lawful resolution it certified [A2/R3/Au6/C4 BLOCKER] | ACCEPTED — disposition-linked resolution (§4.2) + the belt SPLIT: snapshot-coherence vs settled-authority (§5) |
| 3 | Consumption dated at the GROUP grain breaks 0038's blessed cross-month groups — April permanently uncompletable on a straddle [A3/R2/Au4/C1 BLOCKER] | ACCEPTED — line-grain `uncleared(g,P)` (§3) |
| 4 | C-b's acknowledged posting-date exception has NO identity term — the first catch-up payroll match wedges the month [A4/Au3/C2 BLOCKER] | ACCEPTED — folds into `uncleared(g,P)` as an honest timing item (§3) |
| 5 | As-of aging unbuildable: `_subledger_outstanding` sums all allocations ever; allocations carry no business date; append-only blocks backfill [A5/R4/C9 BLOCKER] | ACCEPTED — `effective_date` on allocations + `_subledger_outstanding_asof` + the explicit trigger-window backfill (§4.4/§8) |
| 6 | COA-scoped gl vs account-scoped closing — a deactivated predecessor account on the same COA mixes books, or ties spuriously [A6/R15/C7 MAJOR] | ACCEPTED — `recon_coa_shared` refusal + certified `coa_account_code` on the receipt + account row lock (§4.1/§5) |
| 7 | "Receipts stay true without freezing the book" under-bills the ordered-unwind cost (nine voids for one coding fix) [A7 MAJOR] | ACCEPTED — cost stated §3/§7/§10; /bank shows "voiding N receipts" |
| 8 | The outstanding enumeration never converges (dead reversal pairs accumulate) and the plug is never challenged (a duplicate payment ties GREEN forever) [A8/R10 MAJOR] | ACCEPTED — reversal-pair enumeration exclusion + AGE on every side + `recon_outstanding_stale` with ack-by-id (§3) |
| 9 | Bucket set: five labels over four ranges; day-90 double-counted [A9 MAJOR] | ACCEPTED — current(0-30)/31-60/61-90/91+ disjoint; Σ=control cell (§6) |
| 10 | "Prior live statement" ≠ date-contiguity — a gap month completes over an unexamined hole [A10/Au13 MAJOR] | ACCEPTED — `recon_period_gap`; WCC-R1 rationale corrected (§2/§3) |
| 11 | Pending-reservation wedge: completion over a pending line + `complete_pending_match` missing from the register [A11/R14 MAJOR] | ACCEPTED — `recon_line_reserved` + register entry 3 (§3/§5) |
| 12 | `origin='rule'` unreachable — both writers hardcode `'human', null`; the CHECK is an iff [A12/R9/Au1/C13 BLOCKER] | ACCEPTED — `p_via_rule` overloads, register entry 4 (§5) |
| 13 | The per-side outstanding formula not executable as a scalar; gross two-sided entries mis-sum [A13/C3 MINOR→MAJOR] | ACCEPTED — exact abs() two-term form stated (§3) |
| 14 | `bank_uncleared` "on c" unenforced; item-granularity lineage missing from the snapshot [A14/C16 MINOR→MAJOR] | ACCEPTED — `recon_uncleared_off_account` preflight + opening-item lineage in the snapshot (§3/§5) |
| 15 | The belt on member/exception tables re-deriving live arithmetic refuses every lawful later write [R3/Au6/C4 BLOCKER] | ACCEPTED — the belt split (§5) |
| 16 | `remap_bank_account_coa`/`deactivate_bank_account`: NO advisory rung, only a live-match guard — certify-while-mutating on zero-line months; silent post-hoc invalidation [R5/C7 BLOCKER] | ACCEPTED — register entry 5 (§5) |
| 17 | Row-lock order inverted vs every 0038 writer; no ORDER BY id; FOR SHARE wrong strength vs exception writers [R6 MAJOR] | ACCEPTED — house order (lines-by-id→statement); except/resolve take FOR UPDATE (§5) |
| 18 | Statement backfill demotes a first-period-exempt recon; nothing watches statement inserts [R7/C11 MAJOR] | ACCEPTED — receipt pins `prior_statement_id`(+recon id) + `recon_frontier_backfill` splice, register entry 6 (§3/§5) |
| 19 | `bank_reconciliations.superseded_by` has no writer — dead column; the §9 drill tested the impossible [R8/Au14/C11 MAJOR] | ACCEPTED — column DROPPED; lifecycle is void-only; drill rewritten (§4.1/§9) |
| 20 | Duplicate-payment blindness (the §1 defect C-c exists for survives the identity) [R10 MAJOR] | ACCEPTED — merged into #8 |
| 21 | Open exceptions survive their statement's void [R11 MAJOR] | ACCEPTED — `open_exception_present` + belt statement-live assert (§5/§4.2) |
| 22 | Replay semantics ambiguous (return vs raise; the voided-receipt replay) [R12 MINOR] | ACCEPTED — stated in the verb row (§5) |
| 23 | Refusal lists short of house pattern (reason_required etc.) [R13 MINOR] | ACCEPTED (§5) |
| 24 | `set_counterparty_terms` refused outright by `_tf_counterparty_update_0011`'s column whitelist [Au2 BLOCKER] | ACCEPTED — register entry 8 (§4.4/§5) |
| 25 | Re-kind retirement inexpressible without a third recut of `_tf_processing_task_update` (0011→0038 E2b); the obvious probe anchor survives inside the 0038 body = the silent-revert trap [Au7 BLOCKER] | ACCEPTED — register entry 9 with the 0038-marker probe law; relabelled NOT-small (§5) |
| 26 | The consent door aimed at `classify_document` (granted to `clara_runtime`) would hand the machine the consent-evidence stamp; the CLR28 anchor is 0038-E7e's splice anchor [Au8 MAJOR] | ACCEPTED — door MOVED to `classify_consent_evidence_document` (0020, owner floor); anchors untouched (§5 entry 11) |
| 27 | `request_reextraction` mis-lineaged (live body = 0026, not 0022); a shallow widening bypasses the typed-consent gate + budgets [Au9/C15 MAJOR] | ACCEPTED — register entry 12; routes through the E2 enqueue path (§5) |
| 28 | Rule evidence caller-supplied — the ≥3 floor is decorative between a bookkeeper and the owner's signature [Au10 MAJOR] | ACCEPTED — evidence DERIVED in-verb (§4.3) |
| 29 | Suggestion-born approvals breed `vendor_account` autopost proposals around the WA2-R9 wall — "no new posting authority" true of C-c's verbs, false of the system [Au11 MAJOR] | ACCEPTED — the sighting carve-out (stamp + `_approve_entry_core` patch, register entry 10). Recorded as WA2-R9's law APPLIED, not a new rule |
| 30 | `bank_rules` no uniqueness; contradictory signed rules; no suggestion precedence [Au12 MAJOR] | ACCEPTED — content_hash unique + ≤1/(line,kind) (§4.3/§6) |
| 31 | Bare single-column FKs break the tenancy-congruence law [Au15 MAJOR] | ACCEPTED — composite FKs everywhere (§4) |
| 32 | RLS/grant posture unstated for 2 of 3 tables and all RPCs [Au16 MINOR] | ACCEPTED (§4.1 note + §6 header) |
| 33 | Due-date stamp unscoped by item_kind (settlements would read overdue) [Au17/C12 MINOR→MAJOR] | ACCEPTED — invoice/bill only (§4.4) |
| 34 | `p_segment` forward-reserve absent [Au18 MINOR] | ACCEPTED (§6) |
| 35 | `_subledger_on_approve` probe-direction footgun (0038's four hits are caller-side) [Au19 MINOR] | ACCEPTED — stated in register entry 7 (§5) |
| 36 | The exception door not structurally narrow (free-text + bookkeeper floor cannot enforce "never") [C5 BLOCKER] | ACCEPTED-AMENDED — OWNER floor + optional provenance-bound evidence + disposition-linked resolution (§4.2) |
| 37 | No stable books cutoff — a back-dated approval silently diverges live derivation from the certified receipt [C6 BLOCKER] | ACCEPTED — bitemporal receipt law (terms under the `completed_at` approval-visibility cutoff; verification reproduces byte-exact) (§3) |
| 38 | Exception↔match cross-table write-skew (two txns, both deferred checks pass) [C8 MAJOR] | ACCEPTED — shared line FOR UPDATE + opposite-table recheck inside the spliced writers (§4.2/§5) |
| 39 | `bank_rules` mutable after signing [C14 MAJOR] | ACCEPTED — transition trigger + frozen substantive fields + no-delete (§4.3) |
| 40 | `set_counterparty_terms` unserialized vs approval-time terms reads [C12 MAJOR] | ACCEPTED — 004 + row lock (§4.4/§5) |

## Adjudicated rebuttals (recorded, re-openable at their named trigger)

- **R-a [C10] "Port the close-segmentation seam now":** REBUTTED-PARTIAL. The audit's own
  F12 evidence (`docs/audit/evidence/F12.json:259`) records that item-dated subledger reads
  (aging, statements) stayed correct across closes in the OLD build — the segmentation
  breakage was GL-side only. No segment identity exists to carry (`_correction_period_state`
  is a permanent stub); inventing one now is the half-close-model WC-R3 names as how
  GAP2-1/GAP5-3 were built the first time. The forward shape shipped instead: the reserved
  `p_segment` parameter (cell-asserted ignored) + item-dated arithmetic + bitemporal
  receipts. **Re-open at the close wave.**
- **R-b [R6a, partial] "State 004-only as the serializer and drop the row-lock claims":**
  AMENDED rather than accepted — v2 states 004→006 as the true serializer AND aligns the
  row-lock order with the house (belt and braces; protects any future verb that skips 004).

## What round 1 cost and what it caught

Three opus lanes (~467k worker tokens) + one Codex xhigh pass, all read-only, zero code
written. Between them: **12 blocker-labelled findings** (rows 1-5, 12, 15, 16, 24, 25, 36,
37) — four in the identity algebra itself, two that made ratified acceptance unreachable on
the real corpus, one unbuildable engineering pin (`origin='rule'`), one
structurally-refused verb (the terms whitelist), the belt-vs-receipt contradiction, the
unguarded account-identity verbs, the unstructural exception door, and the missing books
cutoff — plus two MAJOR authority-motion paths (the consent stamp, row 26; the autopost
breeding launder, row 29). Every one was invisible to the lane that wrote v1. The house law
held: cross-model review on money-touching design is not optional, and the ladder found
nothing that required re-opening a single owner ruling.

## Round 2 — the delta check on v2 (opus, single lane, 2026-07-31)

A coherence-only pass: does v2 faithfully apply its own adjudication register, and does the
rewritten identity close symbolically? **Verdict FAIL → all 15 defects applied same-day.**
The catches that mattered:
- **The double-count reading [identity-breaking]:** v2's transcription dropped "not consumed
  by any live group" — under the plain line-dated reading of `unmatched_capacity`, every
  matched-but-uncleared entry counted twice (4 of 6 canonical shapes failed). Fixed: the
  subtracted consumption is each entry's TOTAL live consumption regardless of line dates;
  entry-vs-line timing lives only inside `uncleared(g,P)`. The lane verified all six shapes
  close under the corrected reading (arithmetic in its report).
- **The disposition hole [identity-breaking]:** two of three resolution dispositions left a
  line in NO term. Fixed: `excepted` counts open OR resolved-unmatched; `written_off`
  requires the in-txn booking match; `bank_corrective_line` requires its named counterpart
  pair (nets zero, enumerated closed).
- **The opening anchor [a NEW gap no round-1 lane caught]:** the identity only closed for
  accounts whose first statement opens at zero. Fixed: the §3 opening-anchor rule + the
  takeover tie `recon_opening_mismatch` + `opening_cents` on the receipt.
- Twelve application/coherence fixes: the `outstanding_cents` binding · line-side snapshot
  members · composite-FK notes completed · the whitelist exactly-once probe · three missing
  §9 cells (+ the stale-challenge cell) · the §10 unwind-cost residual · the uncleared
  preflight's registered-COA scope + unrecoverable-shape report · the INSERT-scoped COA
  assert · a prose sign error · this file's own blocker recount.

## Rounds 3–4 — the BUILD, the as-built ladder, and the fix-wave delta (2026-08-01)

**The build** (branch `feat/wave-c-c-tieout`): a preflight verification lane (every splice
anchor byte-verified; two corrections — the 0039 `with ordinality` marker lands ×2, and
allocations are written in `_subledger_on_approve`/`unallocate_group`/`apply_open_items`,
so the `effective_date` NOT NULL demanded those three insert-site splices in the SAME
migration) → a 7-lane fan-out (tables · identity core · doors/RPCs · splices · the
contract-blind x40 battery · runtime · dashboard) → assembly under a 12-adjudication order
(4 build defects caught by the battery incl. a migration that could never apply and a verb
unusable on first call) → composite battery green.

**Round 3 — the as-built ladder** (3-lens opus + Codex `gpt-5.6-sol`, read-only, on the
committed build): 13+15+16 findings, FOUR ship-blockers — the takeover tie
double-subtracted uncleared (its cell false-green, built to the same wrong formula) ·
/aging rendered empty over RM143,650 (envelope + key mismatches; no mapper was ever bound
to the shipped SQL) · the learn-loop card sent a guaranteed refusal · and the root defect
all four lanes converged on: **the exception door verified its disposition once, at the
write, and never again.** Also: three green-by-construction cells guarding blocker-grade
laws, and the `effective_date` backfill had executed against zero rows in every run. All
findings adjudicated in the fix-wave order; notable rulings:
- **CX1 (the books-cutoff blocker) → ratified deviation:** no books-version machinery; the
  algebra makes money divergence inexpressible for the straggler class (an unmatched entry
  moves `gl'` and `capacity'` equally; matched-into-settled is refused), so the verifier
  binds the stored money terms strictly and reports enumeration drift as informational.
- The consent-door aim (a `clara_runtime`-granted verb) was refused at review — it landed
  on `classify_consent_evidence_document` (owner floor) instead; the WA2-R9 sighting
  carve-out was RED-PROVEN live (an unpatched chain bred a real `vendor_account` rule from
  four stamped approvals; patched: zero).

**The fix wave** (clusters A–E + the Codex appendix): the exception-door lifecycle
re-stated (governing-row readers · the atomic reciprocal corrective pair, structural to
the composite FK · the cutoff-gated exception lateral · the belt split kept honest) · the
corrected tie · `opening_anchor_cents` (receipts self-close every period, the differenced
arm deleted) · `verify_bank_reconciliation` · the server-side `can_complete`/`blockers`
verdict · the aging surface rebuilt against the literal SQL envelopes. Lane-caught en
route: every Resolve click had sent an EMPTY exception id (the snapshot's key is
`exception_id`) · all ten blocker appends were untyped `text[] || literal` (runtime crash
on the first blocked preview — green until then by luck) · the preview's derived-closing
remap.

**Round 4 — the delta on the fix wave** (opus 14 + Codex 9 findings): the merge gate was
three — `can_complete` had swept the ack-remediable stale blocker into its veto (the ack
flow unreachable from /bank); the same-txn exclusion was timestamp-keyed (a stalled
transaction could slip a member into a settled period → replaced with a TXN-LOCAL GUC
identity, exact and subxact-safe); and the corrective-pair/narrowed-door laws had no
red-proof cells. Two adjudications AMENDED on Codex's algebra:
- **CX1-v2:** the strict-five per-column bind is false for a lawful straggler
  (`approved_at ≤ cutoff`, committed after): `gl'` and `outstanding` each move by X while
  their DIFFERENCE is invariant. The ratified strict set is `opening_anchor · excepted ·
  closing · (gl' − outstanding) · opening · bank_uncleared_opening`; per-column drift is
  informational, with the rationale in the verifier's header.
- **The A4-door closure (the final micro-fix):** a STALLED resolve+match stamps rows
  before the receipt's cutoff, breaking strict reproducibility for that schedule class —
  the resolved-then-booked carve-out now admits only resolutions whose `resolved_at`
  post-dates every covering receipt's `completed_at` (the lawful fresh-txn flow is
  untouched; the stalled schedule refuses `recon_period_settled`).

**Ratified deviations register (as-built, binding):** the `p_via_rule` overloads carry NO
defaults (empty overlap by construction — the E1.3 precedent) · `apply_open_items` writes
fresh pairs, never negations — the date-inversion guard is structurally unneeded there;
its `effective_date` is act-dated (`current_date` producer / `created_at::date` backfill) ·
C6: a void receipt rides as a `voided_receipt` SIDECAR on the live preview (the body-status
alternative would make a voided period un-re-completable) · the proposed→retired
withdrawal transition exists (`withdrawn`, reason mandatory) · `disposition_unbooked` is
belt-owned · the preview carries the verdict keys (`can_complete`/`blockers` +
`derived_closing_cents` + the three distinct opening/closing keys) · `list_bank_rules`
serves the card (no `get_bank_rule`) · `counterpart_already_paired` names the
already-recorded-pair refusal distinctly.

**Named residuals (rounds 3–4):** the `bank_rule_suggested` stamp has NO lawful writer —
`_draft_entry_core` drops arbitrary flags keys; the carve-out ships inert and correct; the
producer is its own audited suggestion-accept verb, a named follow-up · the
`matched_booking`/`written_off_adjustment` dispositions are UI-disabled pending a
composite resolve-and-book verb · the completing-recon GUC holds ONE receipt id (a
two-recon single transaction would over-exclude; unreachable from any shipped caller) ·
the F9 coa-shared belt arm is a pure backstop (verbs refuse first) · `BankReconReceiptCard`
shows no void history (display-only) · `reverse_entry` stamps mirrors at session-TZ
`current_date` while the SST evaluator pins MYT (a UTC runtime posts 00:00–08:00 MYT
reversals dated the prior day — cosmetic, month-end-relevant; candidate future splice) ·
`sst-watch-consumer.test.mjs` carries a 2027 date literal (slow-burn rot class) · the
lineage correction: `_approve_entry_core` is 0015→0016→0017(dynamic)→0029→0035→0037
(receipt_preheld/binding markers are 0029-born). Pre-ceremony law: the opening-anchor
census is a CHECKLIST artifact (`docs/ops/wave-c-c-0040-ceremony-checklist.md`) — the tie
is deliberately unconditional.
