# F-A4 PR-2 — annexes (battery · debt-batch mechanics · the named follow-up)

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
| W5 | **the agent can never sign** | closed-world read: `status='live'` is written by exactly one body, and no wake role holds EXECUTE on it ▣ | a real admin signs the agent's proposed template → succeeds (the human path is open) |
| W6 | B10 fails closed and names the missing fact | no live service period → `prepayment_term_underivable`, payload names `document_service_periods` and the document id; **zero `adjustment_templates` rows written** | record the period through the door, re-run → acted |
| W7 | no bound document is its own refusal | a memo-basis prepaid entry → `prepayment_term_underivable` | the same entry with a document + period → acted |
| W8 | `prepayment_source_unfit` | three cells: unapproved entry · foreign client · ambiguous prepaid leg | the fit case acts |
| W9 | evaluator determinism | two calls return byte-identical `period_lines`; `sum(period_lines) = total_cents` to the sen ▣ | a total with a remainder (100 sen over 3 months) proves the remainder lands **wholly** in the final period |
| W10 | the split-month rule (law 20) | a day-1 start and a day-2 start over the same span produce different first periods | — (the pair *is* the differential) |
| W11 | the single-member closure | `evaluator_version_members` count = 1; a prosrc scan finds no `clara.` call site (ceiling stated in the cell) | add a helper call in a scratch copy → both instruments red |
| W12 | the freeze binds | `verify_evaluator_freeze()` green after registration | `create or replace` the evaluator in a rolled-back txn → red |
| W13 | op-key discipline | a caller-minted key → `op_key_not_derived`; a retry of the same entry replays | two source entries in one task both act, with distinct templates and distinct sub-keys |
| W14 | **receipt honesty under multiplicity** | refusals on entries A and B in ONE task are TWO rows with distinct `subject_id` ▣ | collapse the subject to the client in a scratch build → the second refusal wears the first's receipt (FIX-1 reproduced) |
| W15 | the FIX-1 regression, extended to wrapper 13 | refused→acted and acted→refused within one task give two receipts with honest verdicts | — |
| W16 | `subject_kind` extends, does not loosen | a receipt at `adjustment_template` inserts; an unknown kind still refuses | — |
| W17 | the carrier is supersede-only | an UPDATE of `period_start` refuses; the supersede stamp succeeds; DELETE and TRUNCATE refuse | — |
| W18 | one live period per document | a second live insert hits `uq_document_service_period_live` | after superseding the first, the second inserts |
| W19 | the carrier's basis discipline | `extracted` with no region refuses; a region with `human_stated` refuses; a blank basis refuses | a well-formed `human_stated` row inserts |
| W20 | the carrier's tenancy + floor | a firm viewer reads zero rows; a foreign firm reads zero; a bookkeeper reads its own firm's | drop the rank conjunct in a scratch txn → the viewer reads |
| W21 | **residual 1** | a firm viewer selects zero from `close_proposals` and from `close_prep_holds`; a bookkeeper selects them | drop each conjunct in a rolled-back txn → the viewer reads (both tables, separately) |
| W22 | residual 1 breaks no definer path | `attest_close_exception(p_from_proposal)` and `settle_close_proposal` still work for a bookkeeper after the policy recut ▣ | — |
| W23 | **MED-8** | a fresh task drafting a strict subset with unmoved digests → `close_proposal_no_state_change`; the live proposal is STILL `open` ▣ | move one digest → supersedes, and `settle_reason` names the moved key |
| W24 | MED-8, the coverage arm | a draft adding one new `(check_key, item_key)` → supersedes; the reason names coverage | — |
| W25 | residual 2 | the index census fires on `indrelid`, key columns and predicate text | create a same-named index on another table in a scratch txn → the census reds (0138's own T.1b would have passed it) |
| W26 | residual 3 | the policy census reads `polcmd` / `polroles` / `polqual` | flip one policy's roles, then drop one rank conjunct → two separate reds |
| W27 | residual 4 | `_tf_close_proposal_drafted_unique` is in both closed sets; the PR-1c cohort still resolves whole | — |
| W28 | residual 5 is honest | the demonstration cell: a superseded predecessor's attestation satisfies a successor's settle — the gap, made visible ▣ | — |
| W29 | **the park flips** | both parked objects resolve at exact signatures; allowlist = 13 `close_prep` rows, each naming a live function; no existing row moved | — |
| W30 | constraint 15 | zero PR-2 objects in `workflow` / `graphile_worker` / `spike`; what those schemas hold is REPORTED, not asserted | — |

**Fixtures the battery needs that do not exist today:** a client with an approved prepaid
journal entry bound to a document (W6-W9), and a second such entry on the same client in one
wake task (W13-W14). Both are built through governed doors, never as hand-written rows.

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

Folding the conjunct into the policy therefore costs no live caller and leaves the tables
readable for the bookkeeper+ surfaces that are coming — FIX-6's own reasoning (0138:415-423),
applied to the two tables it did not reach.

### B.1 · Residual 2 — the index census (LOW-10b)

0138's T.1b (`packages/db/migrations/0138_f_a4_pr_1c_close_agent_limb.sql`:2655-2668) pins
`uq_close_proposal_live` and `uq_hold_active` by `relname` + `indisunique` + *"indpred is not
null"*. A same-named index, on another table, over other columns, with any predicate at all,
satisfies all three — the assertion reads a name and calls it an identity (law 3).

PR-2's tail pins each index by **`indrelid` at the exact `regclass`**, the **key column names**
resolved through `pg_attribute`, and the **predicate text** from
`pg_get_expr(indpred, indrelid)` compared against an expected string. Same treatment for the
new `uq_document_service_period_live`.

### B.2 · Residual 3 — the policy census (LOW-10c)

0138's T.1 counts policies `= 2` per table and reads nothing about them, so FIX-6's own rank
conjunct (0138:424-427) is not census-pinned and neither would design §7's mirrors be. PR-2's
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
- **migration half.** PR-2's own tail carries a closed ungranted set that **includes** it
  alongside PR-2's new internals, with a header line saying why it is censused here rather
  than there.
- **PR-2's new names get their OWN cohort** (`F_A4_PR2_COHORT`), never folded into
  `F_A4_PR1C_COHORT` — folding would red every 0138-only database, which rig-meta:277-280
  records as measured, not assumed.

### B.4 · Residual 6 — `uq_aar`'s prose, and where a truing can legally land

0138:1331 spells `uq_aar` as six columns; the live constraint is seven — `verdict` and
`rung_digest` included (0138:396). Same immutability wall as B.3, and the fix order's
"comment truing" cannot mean editing that line.

The truing lands in the **catalog**, where a reader actually queries it:
`comment on constraint uq_aar on clara.agent_act_receipts is '...'` carrying the true
seven-column spelling and naming 0138:1331 as superseded prose. PR-2's own header records the
correction. This is the 0052 principle — put the reasoning where the next
`pg_get_functiondef` reader will find it, not only in a file that reader may never open.

### B.5 · Residual 5 — FIX-7's over-claiming comment

`clara.close_attestations` carries no from-proposal column, so `settle_close_proposal`'s
`adopted` arm proves *a live agent-authored attestation on the run for that key pair*, not one
naming **this** proposal — a superseded predecessor's attestation can cover a successor's item.

**Recommendation: recut the comment in PR-2, carry the column to PR-3 by name.** The recut is a
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

**Why this half is not in PR-2.** Three reasons, each sufficient: it is a **third** live-body
recut in a window sized for one (D-24's severance law); it needs a runtime change that no DB PR
can carry; and reading a service period off an invoice face is a real extraction problem, not a
column. Splitting it keeps PR-2's window honest and lets the human door carry the whole load
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
the closed `subject_kind` set (0138:349-350); `adjustment_template` is the one value PR-2 adds.

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
