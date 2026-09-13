# #643 — Spec review (periodic stock adjustment + supplied payroll obligation)

Branch `impl/643-periodic-adjustments`, worktree `clara-wt/643`, 9 commits vs merge-base
`8f0de590` (`main`). Diff confirmed non-empty: 40 files, +8661/-43.

## (a) Brief §3 slice — item by item

| # | Item | Status | file:line |
|---|---|---|---|
| 1 | Widen both purpose CHECKs | present | `packages/db/migrations/0194_periodic_adjustments.sql:228-234` |
| 2 | Frozen `adjustment_basis` column, null iff `purpose='journal_entry'`, in immutable-trigger frozen array | present | `0194:243-266` |
| 3 | `_adjustment_basis_canonical` added to intent-payload comparison | present | `0194:680-717`, used at `0194:1148,1214` |
| 4 | `clara.periodic_adjustments` table, exact columns, FORCE RLS, owner+firm read, zero app-role DML, append-only+no-truncate | present | `0194:309-418` |
| 5 | Admission: `_admit_accounting_work_core` extracted; `admit_journal_work` 7-arg unmoved; `logical_op_id='work:'\|\|id\|\|':'\|\|purpose\|\|':1'` | present | `0194:1027-1284` (logical id at `0194:1197`; 7-arg door at `0194:1246-1254`) |
| 6 | Commit: `_record_journal_entry_core` recut, calls `_assert_adjustment_relationships`, stamps flags, inserts `periodic_adjustments`, adds `adjustment_id` to `effects` | present | `0194:1314-1746` (5 marked insertion points) |
| 7 | Typed refusals with `detail.reason` | present | see seam table below |
| 8 | `_close_gate_closing_stock` recut, drops `no_producer_verb`, names producer | present | `0194:1769-1828`; textual-absence tail probe at `0194` tail §I line "no_producer_verb" |
| 9 | Correction: `corrects_adjustment_id`/`corrected_by_adjustment_id`, reversal via `clara.reverse_entry` gate, evidence release reused | present | `0194:951-977` (world check), `0194:1703-1727` (write); tested `packages/db/tests/periodic-adjustment.test.mjs:560-625` |
| 10 | `list_periodic_adjustments`; extend `list_entry_links`'s purpose projection | present | `0194:1839-1877`; `list_entry_links` needed **no code change** — it already selects `aw.purpose` generically, verified by `periodic-adjustment.test.mjs:196` ("`list_entry_links` already projects `purpose`") |

No gaps found in the ten DB slice items. This is an unusually faithful implementation of a very
long, precise spec — the tail census (`0194` §I) re-reads the catalog for nearly every claim above
rather than trusting the migration's own comments.

## Six TDD seams

| Seam | Test file | Present | Asserts the seam |
|---|---|---|---|
| 1. pa.stock.happy | `packages/db/tests/periodic-adjustment.test.mjs:107` | yes | one marked entry, one receipt, one adjustment row, real `interactive_client` credential |
| 2. pa.payroll.relationships (`advance_not_enrolled`) | `periodic-adjustment.test.mjs:261` | yes | CLR10 `advance_not_enrolled`, counts unmoved |
| 3. pa.refusals (table-driven) | `periodic-adjustment.test.mjs:387-517` | yes | `adjustment_all_zero` (both purposes), `scope_overbroad`, `stale_basis`, `adjustment_lines_mismatch`, CLR19 `write_into_closed_period` (`:490`), CLR04 `obo_not_initiator` (`:508`) — every case asserts `detail.field` |
| 4. pa.correction | `periodic-adjustment.test.mjs:560` | yes | two rows, both pointers, two committed receipts, second-correction and cross-client refusals |
| 5. cs.gate.flips | `packages/db/tests/close-closing-stock-producer.test.mjs:77` | yes | fails without `no_producer_verb` key, passes and names the producer, `measured_digest` moves (`:99-165`); companion tests for bare-marker, services, reversal |
| 6a. Runtime e2e (kill/resume) | `packages/runtime/tests/periodic-adjustment-e2e.mjs` | yes | 5 legs incl. commit-then-SIGKILL-before-checkpoint replay to one entry/receipt/row |
| 6b. Web form | `apps/web/components/accounting/periodic-adjustment-form.test.tsx` | yes | `:234` server field path → focused control in both spellings; `:241/249` `stale_basis` renders via `StateBanner`, reason shown verbatim; all-zero covered structurally through the same banner path |
| 6c. Web walk | `apps/web/e2e/periodic-adjustment-walk.spec.ts` | yes | 320px/200%/keyboard-focus/reduced-motion/URL-Back/draft preservation per report (11/11) |

Refusal-vocabulary cross-check requested in the prompt: `advance_not_enrolled` (`0194:893-899`,
tested), `adjustment_all_zero` (`0194:631-635,663-667`, tested both purposes), `scope_overbroad`
(`0194:919-935`, tested), `stale_basis` (`0194:620-629`, tested), CLR19 locked period
(`0194:941-948`, tested `:490`), CLR04 arms — `obo_not_initiator` is directly tested (`:508`);
`insufficient_role`/`obo_not_active` are inherited, unrenamed arms of the shared
`_record_journal_entry_core` and are exercised generically by the reused neighbour suites
(`work-journal-post.test.mjs` et al., reported 208/208 with the recut core) rather than by a
periodic-adjustment-specific cell — acceptable since the code path is identical, not a new arm.

`_close_gate_closing_stock` drop of `no_producer_verb` and gate producer naming: confirmed by
source read and by the tail census's own textual-absence probe (`0194`, tail §I, "confesses
no_producer_verb"). `measured_digest` moves: asserted at `close-closing-stock-producer.test.mjs:99-165`.

Correction chain two-way + releases the document: the pointer pair and the "reverse before you
correct" gate are present and tested (`0194:951-977,1703-1727`; `periodic-adjustment.test.mjs:560`).
The specific "document released by `t_entry_evidence_release`" interaction is not separately
exercised in a periodic-adjustment fixture (the correction test in this file is documentless), but
that trigger sits on `clara.journal_entries` unmodified by this migration and is already proven
generically in `journal-work-evidence.test.mjs`; not a gap since 0194 changes nothing about it.

`logical_op_id = 'work:'||id||':'||purpose||':1'`: matches literally at `0194:1197`.

`admit_journal_work`'s 7-arg signature unmoved: confirmed at `0194:1246-1254` (thin one-statement
delegation) and by the tail census's own re-derivation check (`0194` tail §I, "is not the exact
one-statement delegation").

Form asks before admission, and "post-admission Work question completes the basis" is not claimed
anywhere: confirmed — no `work_question`/`ask_work_question` reference exists anywhere in the new
runtime or web periodic-adjustment code, and grepping docs/copy for "post-admission"/"complete the
basis" returns nothing.

`settled_cents` never presented as a stored particular: confirmed —
`packages/runtime/lib/periodic-adjustment-basis.ts:110,223-241,344-366` uses `settled_cents` only
to shape the derived journal lines (`basisFromAdjustment`); `adjustmentFromInput` (`:252-291`) never
writes it into `p_adjustment`, and `0194`'s `payroll_obligation` particulars schema has no such key.
The split is recoverable only by opening the linked entry's lines, which the history table lets a
reader do (see below) but does not itself display as a number.

History row exposes exact fields, sources, Work/JE/receipt links: confirmed —
`apps/web/components/accounting/periodic-adjustments-table.tsx:95-133` renders posting date, entry
link, Work link, receipt id, logical-op id, source document, both correction pointers, and every
key of the stored `basis` verbatim.

## (b) Scope creep

None found. Every touched file outside the ten-item slice is either (i) the shared purpose-label
plumbing the brief itself asked to coordinate (`work-detail.tsx`, `journal-entry-row.tsx`,
`lib/firm/activity.ts`, `en.json`), (ii) the CI wiring the brief specified
(`db-live-gates/action.yml`, sibling e2e leg after `work-cancel-e2e`), or (iii) two fixes to
pre-existing tests with a diagnosed, documented cause: `Field` hoisted out of the form's render body
(a real remount-on-keystroke bug, `apps/web/components/accounting/periodic-adjustment-form.tsx`,
commit `80a2713f`), and the `checkout-faces-a11y.test.tsx` timing widened from a 30ms/120ms budget to
400ms/600ms with a bisection recorded in the commit and the test's own comment
(`apps/web/components/entry/checkout-faces-a11y.test.tsx:374-389`). Both are argued from evidence,
not asserted.

## (c) Looks implemented but wrong

**BLOCKER: none.**

**SHOULD** — `docs/ARCHITECTURE.md`'s §11 "会计能力" row still states the neighbour-battery figure
as `189／189` (introduced by commit `fae608e6`, before this session's runtime/web work), naming only
8 of the 10 files actually run:

> "邻近既有电池（work-journal-admission／post、journal-work-evidence、work-cancel、work-question、
> x56-rest-h、er9-gates-boundaries、er9-close-lifecycle、operation-census）189／189"

The final report (`docs/plan/active/refresh-wave-2026-09-14/reports/643-final.md`) itself flags this
as stale and disowns it:

> "The `189/189` neighbour figure in `fae608e6`'s §11 text is the previous worker's; mine is the 10
> files above at 208/208."

but the last docs commit in this branch (`06637a8b`) only touched the web/browser-walk sentence in
that same row and left the `189／189` clause untouched. Per AGENTS.md working-protocol item 4
("verify the affected behaviour and update its existing source of truth in the same change") and
item 7 ("no evidence, no claim"), a figure the worker's own report calls not-theirs and not-current
should not still be standing in the merged ARCHITECTURE.md text. Low severity — it is a test-count
footnote, not a behavioural claim — but it is a genuine, checkable discrepancy inside the very
document this ticket updated.

**NOTE** — two items the final report calls "follow-ups" are accurately described and are
conservative, non-blocking readings of the brief, not defects:
1. `payrollObligationInputSchema` (`periodic-adjustment-basis.ts:97-117`) has no
   `advance_account_code`, so the future `chatTurn_v19` tool as currently specced cannot name a
   staff-advance account the direct form can. Confirmed by reading the schema. Not required by the
   brief (v19 is out of this PR), but worth tracking when v19 is authored.
2. `settled_cents` is derivable only by opening the posted entry's lines from the history row, not
   shown as a stated figure on the row itself — confirmed above. Reasonable given the brief's "do
   not invent... missing settlement facts" boundary and that 0194 defines no such column, but a
   small UX gap for a preparer scanning history without opening every entry.

## Totals

BLOCKER: 0. SHOULD: 1 (stale doc figure, `docs/ARCHITECTURE.md`, §11 accounting-capability row).
NOTE: 2 (both self-disclosed by the worker, judged conservative/acceptable). Worst finding: the
stale `189/189` neighbour-count sentence left in `docs/ARCHITECTURE.md` after the worker's own
report disowned it.
