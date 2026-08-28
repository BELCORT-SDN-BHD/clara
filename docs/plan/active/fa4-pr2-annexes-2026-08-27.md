# F-A4 PR-2a — annexes B-C (measurements · debt-batch mechanics · the OCR follow-up)

*Companion to the design of record — `docs/plan/active/fa4-pr2-design-2026-08-27.md` (§§0-6) and
`docs/plan/active/fa4-pr2-design-part2-2026-08-27.md` (§§7-14). **Annex A, the battery, lives in
`docs/plan/active/fa4-pr2-battery-2026-08-27.md`.** Split at the estate's design + annex
convention and again at the 2026-08-27 F1/F2 fold, each time against the repo's 500-line gate.
Nothing here is independent of the design; every annex is cited from it by section.*

---

## Annex A · The battery — **moved to its own file**

The forty-five walls, each with its cell AND its mutant, plus the fixtures and the armed-skip
statement, are in `docs/plan/active/fa4-pr2-battery-2026-08-27.md`. Split out when the F1/F2
fold pushed this file past the 500-line gate; it is cited as **Annex A** throughout the design.

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

**The four rows the first cut of this census omitted (review finding F9).** A consumer
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

### B.0d · The region-congruence trigger, derived (design §4.1a — review finding F6)

`clara.document_regions` hangs off `extraction_id`, not off a document (0007:203-221): its own
composite FK is `(extraction_id, firm_id)`. So `(evidence_region_id, firm_id)` on the service-period
carrier establishes only that the cited region belongs to the same **firm** — **a period on
document A could cite a region extracted from document B and every declared constraint would
pass.** That is provenance theatre of exactly the kind §4.1 rejects two-columns-on-`documents`
for, and it would be worse here, because the whole reason `basis_kind='extracted'` exists is to
say *this fact was read off THIS page*.

The wall is a BEFORE INSERT/UPDATE trigger: resolve `evidence_region_id` → its
`document_extractions` row → assert that row's `document_id` equals **this row's own**
`document_id`, else refuse `service_period_evidence_foreign_document`. It fires only when
`evidence_region_id` is non-null, so the `human_stated` path never meets it. Cell **W33** plants a
region from a second document on the same firm; its mutant drops the trigger in a rolled-back
transaction and watches the forged row land — which is what proves the composite FK never saw it.

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

## Annexes D-H · **moved to their own file**

The derivations — **D** MED-8 · **E** the receipt subject and op key · **F** the five pre-rungs ·
**G** the mint-snapshot collision · **H** F1's carrier surgery — are in
`docs/plan/active/fa4-pr2-derivations-2026-08-27.md`. Split out when the F1/F2 and N-fold rounds
pushed this file past the 500-line gate; they keep their letters and are cited by them.
