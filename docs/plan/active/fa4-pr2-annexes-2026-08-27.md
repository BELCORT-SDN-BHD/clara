# F-A4 PR-2a — annexes (battery · debt-batch mechanics · the named follow-up)

*Companion to `docs/plan/active/fa4-pr2-design-2026-08-27.md`, which is the design of record.
Split from it because the repo's own 500-line gate is the estate's design-doc convention (the
close-key-1 and bank-agency sets split the same way). Nothing here is independent of the
design; every annex is cited from it by section.*

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
| W15 | the FIX-1 regression, extended to wrapper 13 | refused→acted and acted→refused within one task give two receipts with honest verdicts | drop `verdict` from `uq_aar` in a rolled-back txn → the second call returns the first's receipt id under the wrong status (FIX-1 reproduced on this verb) |
| W16 | `subject_kind` extends, does not loosen | a receipt at `adjustment_template` inserts; an unknown kind still refuses | in a rolled-back txn restore the pre-PR-2a six-value CHECK → the ACTED insert reds, proving the cell reads the NEW constraint and not an incidentally-permissive one |
| W17 | the carrier is supersede-only | an UPDATE of `period_start` refuses; the supersede stamp succeeds; DELETE and TRUNCATE refuse | disable the supersede-only trigger in a rolled-back txn → the `period_start` UPDATE lands, proving the trigger and not a coincidence is the refusal |
| W18 | one live period per document | a second live insert hits `uq_document_service_period_live` | after superseding the first, the second inserts |
| W19 | the carrier's basis discipline | `extracted` with no region refuses; a region with `human_stated` refuses; a blank basis refuses | a well-formed `human_stated` row inserts |
| W20 | the carrier's tenancy + floor | a firm viewer reads zero rows; a foreign firm reads zero; a bookkeeper reads its own firm's | drop the rank conjunct in a scratch txn → the viewer reads |
| W21 | **residual 1** | a firm viewer selects zero from `close_proposals` and from `close_prep_holds`; a bookkeeper selects them | drop each conjunct in a rolled-back txn → the viewer reads (both tables, separately) |
| W22 | residual 1 breaks no definer path | `attest_close_exception(p_from_proposal)` and `settle_close_proposal` still work for a bookkeeper after the policy recut ▣ | run the same arm as a below-floor VIEWER → it must fail at the door's own floor, not at the policy. A definer path that reads identically for both ranks would mean the cell cannot see a definer break at all |
| W23 | **MED-8** | a fresh task drafting a strict subset with unmoved digests → `close_proposal_no_state_change`; the live proposal is STILL `open` ▣ | move one digest → supersedes, and `settle_reason` names the moved key |
| W24 | MED-8, the STRICT-SUPERSET arm | a draft that is a proper superset of the live set → supersedes, and `settle_reason` names coverage | **the trade case:** a draft that adds one pair and DROPS three → must REFUSE `close_proposal_no_state_change`. This is the arm the review's churn fact killed — under the old non-empty-new-pairs reading it superseded |
| W25 | residual 2 | the index census fires on `indrelid`, key columns and predicate text | create a same-named index on another table in a scratch txn → the census reds (0138's own T.1b would have passed it) |
| W26 | residual 3 | the policy census reads `polcmd` / `polroles` / `polqual` | flip one policy's roles, then drop one rank conjunct → two separate reds |
| W27 | residual 4 | `_tf_close_proposal_drafted_unique` is in both closed sets; the PR-1c cohort still resolves whole | grant it to `clara_authenticated` in a rolled-back txn → the ungranted-set census reds, proving the new member is actually probed and not merely listed |
| W28 | residual 5 is honest | the demonstration cell: a superseded predecessor's attestation satisfies a successor's settle — the gap, made visible ▣ | **the inverse control:** with NO attestation on the run at all, the same settle-to-`adopted` REFUSES — so the cell above shows a mis-BINDING, not a door that never checks anything |
| W29 | **the park flips** | both parked objects resolve at exact signatures; allowlist = 13 `close_prep` rows, each naming a live function; no existing row moved | **a REAL mutant, no exception (F7).** In a rolled-back txn drop the wrapper and re-run → the presence half reds; separately delete the thirteenth allowlist row → the count half reds. A flipped gate that cannot fail is the same false green its parked ancestor was written to avoid |
| W30 | constraint 15 | zero PR-2a objects in `workflow` / `graphile_worker` / `spike`; what those schemas hold is REPORTED, not asserted | create a same-named dummy function in `spike` inside a rolled-back txn → the census reds, proving it looks in those schemas at all |
| W31 | **the FY refusal is SELF-HEALABLE, not a dead end** (conductor's note, design §13 item 4) | the two-phase cell: a term running past the entry's FY with no opened successor → `prepayment_term_underivable`; **the same wake session then opens the successor year through `wake_open_fiscal_year`**; the same draft, re-run, **acts** ▣ | hold the year unopened and re-run → still refuses (the refusal is the year's absence, not a flake) |

| W32 | **F4 — the mint-snapshot collision** | two DIFFERENT months minted in ONE wake task, both refusing on the same vector → **two receipt rows**, each naming its own month in `op_key` ▣ | revert to the bare `p_op_key` in a rolled-back build → the second month's refusal returns the first month's receipt id (the shipped defect, reproduced) |
| W33 | **F6 — the region belongs to THIS document** | a service period on document A citing a region extracted from document B (same firm) → `service_period_evidence_foreign_document` | drop the congruence trigger in a rolled-back txn → the forged row lands, proving the composite FK alone never saw it |
| W34 | **F8(a) — twin equivalence** | the agent core and the human door, given IDENTICAL inputs, produce **byte-identical durable state**: same `content_hash`, same canonical `lines`, same column values on the template row, same `_audit` shape — differing only in the two ctx-derived fields (`proposed_by`, `proposed_op_key`) ▣ | perturb one line's order in the agent's input → the hashes diverge, proving the comparison is live rather than trivially true |
| W35 | **F8(b) — the books actually close** | end-to-end: propose → a human signs → every occurrence runs through `run_adjustment_occurrence` → **the prepaid asset account reaches exactly zero** and the expense side totals `total_cents`, to the sen ▣ | stop one occurrence short → the balance is non-zero, so the cell is reading a real ledger and not asserting a tautology. **PARAMETERIZED on F1/F2:** the target account and the per-period amounts are exactly what the owner's ruling settles, so this cell's final arithmetic is written after it |

**Fixtures the battery needs that do not exist today:** a client with an approved prepaid
journal entry bound to a document (W6-W9), a second such entry on the same client in one wake
task (W13-W14), a client whose service period runs past its open FY with the successor year
**not yet opened** (W31), two months mintable in one task (W32), a second document on the same
firm carrying its own extraction region (W33), and a signed template whose occurrences can all be
run (W35). All built through governed doors, never as hand-written rows.

**Every conditional skip is ARMED and PROBED (F8c).** Vacuity has layers in this estate, and the
battery states its own defence rather than assuming it: (i) no cell may gate on a flag assigned
in `before()` — the 0136 lesson, where `{skip: flag}` always read the initial value; (ii) every
`t.skip()` path prints the catalog fact that triggered it, so a skipped run is legible as a
decision rather than a silence; (iii) the focused PR-2a run is executed with its allow-missing
variable **unset**, which is the shape that fails rather than skips; and (iv) the suite asserts a
**skip count of zero** in that shape. A cell that only ever skips is a false green — which is the
same failure mode the parked W29 gate was written to avoid, one layer up.

**W31 is an integration cell, not a unit cell.** It is the one place this battery proves that
two F-A4 verbs compose inside a single clocked pass — the refusal wrapper 13 writes is one the
lane can itself clear under R6/HIGH-1, and the estate has been bitten before by a rung whose
"blocked" state nothing ever drove to its resolution (0138's own B13 arm-1 carry-forward).

---

## Annex B · Measurements and debt-batch mechanics

### B.0a · The term-carrier blocker, re-measured (design §3)

0138's park says `clara.documents` *"carries no service period, there is no document-fact
register, and `clara.client_facts` is client-grain, not entry-grain"* (0138:49-52). Re-measured
at the live bodies, all three hold — and the third finding is worse than the park recorded.

- **`clara.documents`** (0003:64-77, altered 0007:27-50 and 0017:689-748) carries
  `financial_date` (0007:38): a **single date**, not a period. Nothing on the row is a coverage
  span. Note also that `client_id` was *dropped* from the table at 0007:1105-1106 — a document's
  client comes from `clara.document_filings` (0007:63-83), which is why the carrier below is
  document-grain and firm-scoped rather than client-scoped.
- **`clara.client_facts`** (0055:386-421) is the estate's ratified fact-with-a-basis idiom
  (ADR-062) — `fact_key` / `fact_value` / `basis` / `basis_kind` / `source_document_id` /
  `recorded_by` / the supersession pair — but it is keyed `(client_id, fact_key)` live-unique
  (0055:422). A prepayment term is a fact about **one document**.
- **The extraction register is general; its writer is not.** `clara.document_regions.field_path`
  (0007:203-221) will hold any fact with a page-polygon locator. But `persist_invoice_facts`
  validates `field_path` against a **CLOSED 21-name enumeration** and raises CLR10
  `unsupported invoice field_path %` on anything else (0026:744-757, *"the taxonomy is closed on
  purpose (ADR-047)"*). 0052:22-27 spells out the consequence: a payload carrying an unadmitted
  path *"does not merely drop it — it RAISES, and the whole persist fails, taking the working
  invoice.total capture with it."*

**So the OCR route is a live-writer recut, not a column** — Annex C.

### B.0b · The residual-1 consumer census (design §7)

Run before choosing between folding the rank floor into the policy and revoking SELECT.

| candidate consumer | reads the table? | verdict |
|---|---|---|
| `clara.attest_close_exception`'s `p_from_proposal` arm (0120:1010-1041) | yes | SECURITY DEFINER → reads under the owner policy. **Unaffected** |
| `clara.settle_close_proposal` (0138:1671ff) | yes | definer. **Unaffected** |
| `apps/web/lib/close/api.ts`, `apps/web/components/close/CloseProposalPanel.tsx`, `apps/web/app/(firm)/clients/[clientId]/close/page.tsx` | **no** | the panel deliberately reads nothing — it renders an honest not-built note (`CloseProposalPanel.tsx`:3-10), and `apps/web/lib/close/api.ts`:125-128 records that `p_from_proposal` is never passed. **Zero live reads to break** |
| `packages/db/tests/f-a4-pr1c-fixtures.mjs`:130-134, `packages/db/tests/f-a4-pr1c-close-agent-limb.test.mjs`:127-128, `packages/db/tests/f-a4-pr1c-settle-door.test.mjs`:251 | yes | all via `rootQuery` (superuser, RLS bypassed). **Unaffected** |

**The four rows the first cut of this census omitted (review findings F9-F12).** A consumer
census that misses readers is the instrument failure it exists to prevent, so they are named here
rather than quietly added:

| reader | how it reads | verdict |
|---|---|---|
| `packages/db/tests/f-a4-pr1c-walls-census.test.mjs`:313-318 | `rootQuery` over `information_schema.role_table_grants` for INSERT/UPDATE/DELETE/TRUNCATE across **all three** carriers | a grant census, not a row read — RLS is not in its path at all. **Unaffected**, and it stays true after the recut because the recut touches only SELECT policies |
| `packages/db/tests/f-a4-pr1c-settle-door.test.mjs`:250-256 | `asRole(ROLES.fnOwner, …)` INSERT of a hand-built `close_proposals` row (the duplicate-drafted-item trigger cell) | runs as `clara_fn_owner`, which the owner policy admits `for all`. **Unaffected** |
| `packages/db/tests/f-a4-pr1c-settle-door.test.mjs`:298-299 | `asRole(ROLES.fnOwner, …)` DELETE against a settled proposal | same — owner policy. **Unaffected** |
| `packages/db/tests/f-a4-pr1c-close-agent-limb.test.mjs`:432-433 | `asRole(ROLES.fnOwner, …)` DELETE against a live proposal (the append-only trigger cell) | same — owner policy. **Unaffected** |

So the complete census is: **two definer doors, zero `apps/web` reads, and six rig readers of
which four run as `clara_fn_owner` and two as superuser.** Not one of them is a
`clara_authenticated` row read, which is the only population the rank conjunct can touch.

Folding the conjunct into the policy therefore costs no live caller and leaves the tables
readable for the bookkeeper+ surfaces that are coming — FIX-6's own reasoning (0138:415-423),
applied to the two tables it did not reach.

### B.0c · The extraction's two supporting censuses (design §2)

**The `c` fields.** `clara.propose_adjustment_template`'s body reads exactly `c.firm`
(0045:3864, :3871, :4096, :4136, :4248) and `c.actor` (0045:4098, :4136) off its `_human_ctx`
record — nothing else. The extraction is therefore the 0124 substitution shape verbatim
(`c.firm` → `c_firm`, `c.actor` → `c_actor`, both read out of a `p_ctx jsonb`), with no third
field to reason about. `clara.sign_adjustment_template` reads the same two (0045:4273, :4277,
:4341, :4343, :4347) — recorded only so the review lane can see that the sign core was ruled out
on the R6 dead-member ground, not on a difficulty one.

**The ACL.** Both writers hold `clara_authenticated` and nothing else, granted through 0045's
bulk loop (0045:6705-6728, entries at :6712 and :6713) — no wake role, no runtime role, no
PUBLIC. The extraction must leave that ACL byte-identical, which is cell W4.

### B.1 · Residual 2 — the index census (LOW-10b)

0138's T.1b (`packages/db/migrations/0138_f_a4_pr_1c_close_agent_limb.sql`:2655-2668) pins
`uq_close_proposal_live` and `uq_hold_active` by `relname` + `indisunique` + *"indpred is not
null"*. A same-named index, on another table, over other columns, with any predicate at all,
satisfies all three — the assertion reads a name and calls it an identity (law 3).

PR-2a's tail pins each index by **`indrelid` at the exact `regclass`**, the **key column names**
resolved through `pg_attribute`, and the **predicate text** from
`pg_get_expr(indpred, indrelid)` compared against an expected string. Same treatment for the
new `uq_document_service_period_live`.

### B.2 · Residual 3 — the policy census (LOW-10c)

0138's T.1 counts policies `= 2` per table and reads nothing about them, so FIX-6's own rank
conjunct (0138:424-427) is not census-pinned and neither would design §7's mirrors be. PR-2a's
tail reads, per policy on each of the four tables (`agent_act_receipts`, `close_proposals`,
`close_prep_holds`, `document_service_periods`): `polcmd`, the resolved `polroles` names, and
`pg_get_expr(polqual, polrelid)` — asserting the firm predicate **and** the rank conjunct by
expression, not by count.

### B.3 · Residual 4 — `_tf_close_proposal_drafted_unique` in the closed sets

The function (0138:491-507) is missing from both closed-set censuses. **One half cannot be
fixed where the residual says it is:** `k_ungranted` (0138:2596ff) lives inside an *applied*
migration, and applied files are immutable — the runner records each file's sha256 and an edit
trips a checksum-drift error (`.claude/rules/db-migrations.md`). So the fix splits:

- **rig-meta half.** `_tf_close_proposal_drafted_unique` joins `F_A4_PR1C_UNGRANTED_FNS`
  (`packages/db/tests/rig-meta.mjs`:1061-1071). Safe because it ships in 0138 with the rest of
  that cohort, so the cohort stays wholly-present-or-wholly-absent — which is the condition
  `cohortFailures()` actually cares about (rig-meta:277-280: a WHOLLY absent cohort is
  tolerated, a PARTIAL one fails).
- **migration half.** PR-2a's own tail carries a closed ungranted set that **includes** it
  alongside PR-2a's new internals, with a header line saying why it is censused here rather
  than there.
- **PR-2a's new names get their OWN cohort** (`F_A4_PR2_COHORT`), never folded into
  `F_A4_PR1C_COHORT` — folding would red every 0138-only database, which rig-meta:277-280
  records as measured, not assumed.

### B.4 · Residual 6 — `uq_aar`'s prose, and where a truing can legally land

0138:1331 spells `uq_aar` as six columns; the live constraint is seven — `verdict` and
`rung_digest` included (0138:396). Same immutability wall as B.3, and the fix order's
"comment truing" cannot mean editing that line.

The truing lands in the **catalog**, where a reader actually queries it:
`comment on constraint uq_aar on clara.agent_act_receipts is '...'` carrying the true
seven-column spelling and naming 0138:1331 as superseded prose. PR-2a's own header records the
correction. This is the 0052 principle — put the reasoning where the next
`pg_get_functiondef` reader will find it, not only in a file that reader may never open.

### B.5 · Residual 5 — FIX-7's over-claiming comment

`clara.close_attestations` carries no from-proposal column, so `settle_close_proposal`'s
`adopted` arm proves *a live agent-authored attestation on the run for that key pair*, not one
naming **this** proposal — a superseded predecessor's attestation can cover a successor's item.

**Recommendation: recut the comment in PR-2a, carry the column to PR-3 by name.** The recut is a
`comment on function` stating the true strength and the exact residual gap. The column is
deferred because writing it means recutting `clara.attest_close_exception` — the estate's
most-reviewed close writer — inside a window sized for one body, to close a **provenance blur
rather than a wrong number**: the professional's signed words live on the attestation row
itself, and what mis-binds is which proposal the `adopted` stamp credits. After design §8.1's
churn guard, supersession is rarer, which narrows the window without shutting it. Cell W28
demonstrates the blur so it cannot go quiet.

---

## Annex C · The named follow-up — the OCR half of the service period

Scoped here so a later reader finds the reason rather than the absence (law 31's dead-member
discipline, the 0138:59-62 shape). Design §3 carries the measurement behind it.

1. **`invoice.service_period_start` / `invoice.service_period_end` join
   `persist_invoice_facts`' closed allowlist** (0026:744-757) and its conflicting-duplicate
   text set, by the **0052 harvest-patch** — anchor-counted, byte-proven, derived from the live
   body rather than re-typed. That live body is 0026's CoR *plus 0052's two splices*, so a
   from-file rebuild would silently revert them. A live-writer recut: its own D1 obligation,
   its own window.
2. **An ADR-047 taxonomy extension** recording the two new first-class facts. The taxonomy is
   closed on purpose; extending it is a decision, not a config change.
3. **The runtime emitter** — the Azure adapter at a new `NORMALIZATION_VERSION`. **DB first, or
   both together; never the runtime alone.** 0052:22-27 states the failure mode exactly: an
   unadmitted path does not drop, it *raises*, and takes the working capture with it.
4. **A deterministic promoter** minting a `clara.document_service_periods` row at
   `basis_kind='extracted'` with its `evidence_region_id`, read off the document's
   `authoritative_extraction_id` (0017:729-748). Its consumer is design §4.2's ungranted core —
   which is why that core is built at birth rather than retrofitted.

**Why this half is not in PR-2a.** Three reasons, each sufficient: it is a **third** live-body
recut in a window sized for one (D-24's severance law); it needs a runtime change that no DB PR
can carry; and reading a service period off an invoice face is a real extraction problem, not a
column. Splitting it keeps PR-2a's window honest and lets the human door carry the whole load
until the machine can.

---

## Annex D · MED-8 — why the narrower guard (design §8)

**The reading, at the bytes.** `_agent_close_proposal_core` collects `v_keys` as the distinct
`check_key`s the agent put in `p_drafted` (0138:2251-2252), then builds `v_bound` as
`{check_key → recorded_digest}` over exactly those keys (0138:2258-2277). B11 fires only when a
live proposal exists **and** `v_live_bound is not distinct from v_bound` — full jsonb equality
(0138:2292-2297). A live proposal binding `{A:d1, B:d2}` and an incoming one binding `{A:d1}` are
therefore *not* equal, B11 stays silent, and the act at 0138:2308-2312 stamps the live proposal
`superseded` with a fixed literal reason.

**Nothing moved.** The measurement is identical on the one shared key; the request simply
shrank. The migration's own comment at 0138:2266-2271 shows the author reasoning carefully about
the *opposite* direction (building the vector only from fresh keys would make a stale two-key
request collapse onto a one-key vector, *"a false sentence on a durable record"*) — this is the
same hazard from the other side, and it reaches the record rather than the rung.

**Why B11b rather than canonical coverage.** Requiring the proposal to bind every outstanding
`check_key` would make the key set derived rather than chosen, which is structurally cleaner and
would close the churn as a side effect. It would also **refuse an honest partial offer.** The
carrier's content is *drafted attestation texts per outstanding item* (0138:463-464); an agent
that has defensible language for three of five items and offers three is doing the right thing,
and a professional adopting three of five is an ordinary act. B11b closes the churn without
taking that latitude away — the narrower change. Design §13 item 5 records the alternative and
what it would cost.

**Truth in the durable record.** `settle_reason` stops being a literal and names which arm
fired: the moved `check_key`s, or the newly-covered `(check_key, item_key)` pairs. A supersession
that cannot truthfully say why it happened should not be written, and after B11b every
supersession has a true sentence available to it.

---

## Annex E · The receipt subject and the op key (design §6.3)

**The collision, derived.** `uq_aar` is `(firm_id, act_kind, subject_kind, subject_id, op_key,
verdict, rung_digest)` (0138:396). `_close_wake_ctx` requires the caller's op key to equal
`_close_expected_op_key(task, verb, subject)` (0138:1311-1314), and that helper hashes
`task ‖ verb ‖ subject` (0138:1266-1269). Wrapper 13 pins its ctx subject to the **client** — the
`wake_mint_month_snapshot` precedent (0138:2473) — so every call of this verb inside one wake
task carries the **same** op key.

Now take two prepaid entries A and B in one clocked pass, both refusing for the same reason (no
service period recorded). Same firm, same `act_kind`, same `op_key`, same `verdict`, same
`rung_digest`. If the refusal receipt named the *client* as its subject, the two rows would
collide on `uq_aar`; `_agent_close_receipt`'s `on conflict do nothing` read-back would find the
standing row, its identity guard would find every compared field equal (same task, same actor,
same client, same wake kind, same vector — 0138:1336-1344), and it would return **entry A's
receipt id for entry B's refusal.** That is FIX-1's defect exactly, re-opened not by a missing
comparison but by a subject too coarse to tell two acts apart.

**The fix is the subject.** Refused → `('journal_entry', p_source_entry)`; acted →
`('adjustment_template', v_template_id)`. Both discriminate per entry, and the split across
verdicts is the shipped idiom — the fix order records `begin_close` / `open_fy` /
`mint_snapshot` as *"safe by differing subject"* (§Native, F1). `journal_entry` is already in
the closed `subject_kind` set (0138:349-350); `adjustment_template` is the one value PR-2a adds.

**The null-subject edge.** `subject_id` is `not null`, so a call with `p_source_entry = null`
has no subject to name and no receipt it could honestly write. That case therefore raises
CLR10 `prepayment_source_required` in Tier A, before anything durable — the tier whose contract
is *"RAISES, writes nothing"* (0138:1272-1273).

**The delegate's sub-key.** `propose_adjustment_template` takes its own `_reserve_op` slot
(0045:3864), so two entries in one task need two keys there. The depreciation catch-up already
solves this: it passes `p_op_key || ':' || (v_due ->> 'period_end')` down to `_fa_run_period_core`
while handing the receipt the wrapper's own key (0138:2399 against :2379-2381). Wrapper 13 uses
`p_op_key || ':' || p_source_entry::text`, same shape, same reason.

**The recut not taken.** Pinning the ctx to `('journal_entry', p_source_entry)` would make the
*derived* key discriminate, removing the need for a sub-key — but `clara._close_subject_client`
(0138:1236-1256) is a closed CASE over five subject kinds with an ARM-0 `return null` default,
so it would need a `journal_entry` arm and therefore a `create or replace` on a body 0138 just
installed. Its failure mode on the old body is a refusal (null subject → CLR03 client-pin
mismatch), so the D1 risk is fail-closed rather than wrong — but it is still a second body in
the inventory, bought for a discrimination the receipt subject already provides. Not taken, and
recorded so the review lane sees a decision rather than an omission.

**The collision needs identical rung VECTORS, not merely two refusals** (review's correction to
this annex's first cut). `rung_digest` is in `uq_aar`, so two refusals differing in any rung
already occupy separate rows. The reason that narrowness buys nothing: the vector is a property of
the *task and the client*, not of the entry — a live hold or an incomplete model triple produces
byte-identical vectors for every entry in the pass, which is precisely the common case.

---

## Annex F · The five pre-rungs, derived (design §6.2a — review finding F3)

**Why this annex exists.** `clara.propose_adjustment_template` is untouched by PR-2a, so its
raise paths stay live under the agent core. A raise inside an agent core aborts the transaction
and takes the receipt with it, so each one is a judgement act that leaves no trace. Every path
below was read at the live body, and each is reachable on input the clocked lane will really
produce.

### F.1 · Pre-rung (a) — alignment, and the ONE parameterized predicate

The delegate refuses unless `clara._adj_period_start(p_client, p_cadence, p_start_date)` equals
the supplied start, and likewise `_adj_period_end` for a supplied end (0045:3888-3902). For a
`monthly` cadence that means the start must be the first day of a client period.

**A prepayment beginning mid-month is the ordinary case** — an insurance policy incepting on the
14th, a support contract starting mid-quarter — so this is not an edge the lane occasionally
meets; it is the shape most real prepayments have. Today it aborts with no receipt.

**Two candidate predicates; the ruling picks one.** Both are mechanically the same rung with a
different comparand, which is why the mechanism can be designed now:

- **P-align.** The schedule's own `period_start` is snapped to the client's `_adj_period_*` grid
  and the rung asserts the snap is exact. The refusal then means *"this service period does not
  sit on the client's period grid"*, and the honest response is a human decision about the term.
- **P-carry.** The template's `start_date` is the grid-aligned period CONTAINING the service
  start, and the mid-month remainder is carried by the schedule's own first line rather than by
  the template's date. The rung then fires only on a genuinely underivable grid.

**They differ in what the books do, not merely in what refuses**, which is why this design does
not choose: the choice is downstream of F1's amortisation-convention ruling, and settling it here
would be exactly the model-side numeral decision hard constraint 2 forbids. The build lane
implements the rung with the predicate named as a parameter and **stops** until the ruling lands.

### F.2 · Pre-rungs (b)-(e)

- **(b) `template_duplicate_pending`** (delegate 0045:3948-3952; durable half
  `uq_adjustment_templates_content`, 0045:1257-1258). The rung recomputes `_adj_template_hash`
  over the same canonicalised lines and probes the same `status in ('proposed','live')`
  population, returning the twin's id in its payload. This is the rung a **re-wake** hits: the
  lane drafted a schedule yesterday, nobody signed it, and today's pass would otherwise abort.
- **(c) `template_line_ineligible`** (delegate 0045:3938-3943). The same
  `_adj_line_eligibility_breach` call, the same payload merge.
- **(d) `template_date_unsupported`** (delegate 0045:3929-3937). The DERIVED first period end is
  domain-checked, not the supplied dates — the distinction 0045's own round-9 comment draws.
- **(e) `template_lines_unbalanced`** (delegate 0045:3842-3847). A self-check on the evaluator's
  own output. A red here is a fault in `prepayment_schedule_v1`, not in the caller, and it must
  still land as a receipt rather than an abort — a broken evaluator that leaves no evidence is
  strictly worse than one that refuses loudly.

### F.3 · The honest ceiling — these are courtesies, not walls

Pre-rung (c) reads the eligibility helper WITHOUT the `client:fa-roles` leaf the delegate takes at
0045:3936 immediately before its own check, and (b)'s durable half is a partial unique index.
Between rung and delegate a concurrent writer can change either answer. **The delegate's raise
therefore remains the structural wall**, Tier D captures the abort as `last_refusal` for the next
wake, and **no cell may assert that the pre-rungs make the raise unreachable** — the cells assert
only that the ordinary path now produces a receipt. Stating this is the point: a courtesy sold as
a wall is how a guard quietly stops being one.

---

## Annex G · The mint-snapshot collision, derived (design §6.3a — review finding F4)

**The shipped body.** `clara._agent_mint_month_snapshot_core(p_ctx, p_client, p_month_start,
p_rationale, p_model, p_op_key)` (0138:2437-2465) writes its refused receipt as
`_agent_close_receipt(v_firm, p_client, 'mint_snapshot', 'client', p_client, …, 'refused',
v_rungs, p_op_key)` at 0138:2446-2448. Its wrapper pins the ctx subject to the client
(0138:2473), so `_close_expected_op_key` hashes `task ‖ 'wake_mint_month_snapshot' ‖ client`
(0138:1266-1269) — **one op key for every month the task touches.**

**The collision.** `uq_aar` is `(firm_id, act_kind, subject_kind, subject_id, op_key, verdict,
rung_digest)` (0138:396). For two refusals of two different months inside one wake task, every one
of those seven is equal — **the month appears in none of them.** `_agent_close_receipt`'s
`on conflict do nothing` read-back then finds the standing row, its identity guard compares task,
actor, client, wake kind and vector and finds them all equal (0138:1336-1344), and it returns
**the first month's receipt id for the second month's refusal.**

**It requires identical rung vectors, and that does not save it.** The ordinary way to reach this
is a live hold or an incomplete model triple — conditions of the *task*, which produce exactly the
same vector for every month in the pass.

**Why wrapper 13's fix does not transfer.** There the subject could carry the grain
(`journal_entry` / `adjustment_template`, both uuids). A month start is a **date** and
`subject_id` is `uuid not null` — there is nothing to name. So the discriminator moves to the
`op_key` column, which is already in the key: both receipt calls in the core take
`p_op_key || ':' || p_month_start::text`. The acted path is already safe by its minted
`snapshot_id`, but it takes the month-scoped key too, so every receipt row for this verb says
which month it was about whichever way the act went.

**Blast radius, stated.** This changes no wall, no floor and no grant; it changes what a receipt
is keyed and labelled by, on a verb no live credential can currently reach. The ACTED path's
behaviour is unchanged in every observable except the recorded key. Cell **W32**; its mutant
reverts to the bare key and reproduces the shipped defect.
