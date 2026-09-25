# waveS lane 05 — fix round (2026-09-25)

Branch `riders/wS-lane05`, worktree `C:\Users\zhant\Desktop\clara-wt\642`, database `clara_l03`
(127.0.0.1:55743). Base `7bc5a710f`. Reviewed head was `8b4b5b9ab`; **new head `9d59899ff`**.

Single fix worker for all three review reports (`waveS-lane05-codereview-spec.json`,
`...-codereview-standards.json`, `...-review-adversarial.json`). This run continues a lane whose
first fix worker was killed by a usage limit; its four modified files were judged on their merits
and completed (see "resume", last section), never reverted or re-done.

## Commits in this round, oldest first

| commit | what |
|---|---|
| `4a384baf9` | `fix(runtime): #1090 the knowledge ground's read honours the note's effective window` |
| `77058ae37` | `fix(web): #1093 the identity belt survives the server-side filter, and the comment claims only what was measured` |
| `a10881bad` | `test(db): #1056 the 0344 cohort lists all five ungranted helpers the migration mints` |
| `c89e792ef` | `docs(db): the fix round's corrections to the 0344, 0345 and 0346 sections` |
| `ce6f1a74a` | `fix(db): #1056 the two sentences a payroll correction leaves behind now say what is true` (migration 0360) |
| `9d59899ff` | `fix(runtime): #1090 #1092 the two grounds move out of the deploy-locked deriver file` |

---

## A blocker the review round did not see, found and fixed here

**`packages/runtime/lib/fa-particulars-proposal.ts` is frozen AND deploy-locked on `main`, and this
lane had appended to it.** Measured: `git show origin/main:frozen-workflows.json` carries that path
with `{"sha256": "49d583fc…07cd51c3", "deployed": true}`, and that sha is exactly this lane's BASE
content of the file. The entry was minted by the cut phase (PR #1140, `061a6992b`) AFTER this lane
branched, so the manifest in this worktree has no such entry and `check-frozen-workflows.mjs` here
reports only base staleness — 38 violations, all `REMOVED-VS-BASE` / `UNLOCKED-VS-BASE` /
`REGISTRY-DOWNGRADE`, and **identical with the lane's runtime edits stashed**, which is how I
established none of them is the lane's doing. The standards axis saw those violations and correctly
called them staleness; what it did not notice is that one of the stale-looking entries is a file
this lane writes.

At integration that is a changed deploy-locked body, which no re-baseline may absolve: the script's
own words are "you can never mutate or remove an existing frozen entry", and the deploy-lock is
monotonic on top of that.

**Fixed in `9d59899ff`.** The lane's entire change to that file was ONE appended block
(`git diff 7bc5a710f` shows a single `@@ -478,3 +478,223 @@` hunk, and the current file started
with the base byte for byte — verified in python, not by eye). That block now lives in
`packages/runtime/lib/fa-proposal-grounds.ts`, a new module that imports `FaMethod`,
`FaProposalKnowledgeNote` and `FaProposalRetiredPolicy` and nothing else, and whose header records
why it is separate. Proof the deriver is untouched again: `sha256` is
`49d583fc7dc9e89717dcdf1a285bbc2b1c0b757430d00d919b281fc307cd51c3` and
`git diff origin/main -- packages/runtime/lib/fa-particulars-proposal.ts` is empty. Re-checked over
the whole lane: of the 36 files this branch changes, **none** appears in `main`'s frozen manifest.

---

## Findings, one by one

### ADV-L05-01 (major, #1056) — FIXED, in migration 0360

Reproduced structurally on `clara_l03` before fixing: the live body of `clara.list_review_queue`'s
payroll arm asks only that a done `payroll_text_facts` row exists and that the filing carries no
live draft or approved entry — it never asks the verdict — so a correction that clears the block
leaves the Needs-you row standing and merely swaps in `clara._payroll_posting_verdict`'s `ready`
sentence, *"…re-file the payslip to post it."* Re-filing creates a NEW document whose extraction
chain does not carry the correction.

**What I did NOT do, and why.** I did not make the correction post the run. That needs a second
posting arm: `clara._post_payroll_run` writes `clara.entry_post_receipts` with
`approval_arm = 'payroll_unattended'` and a rationale whose own words are "posted unattended from a
payroll summary whose two readings agreed" — false of a run a person declared a figure on. Who may
cause an approved journal entry with no second reading behind it is an owner-grade accounting
decision (the standing rule: accounting treatments are checked against the standard, and Clara asks
for a professional judgement), not a fix round's to invent. **Owner question, carried below.**

**What I did.** 0360 splices the `ready` arm into two, keyed on the reading's own `human_declared`
array (0344's disclosure, which a machine-produced state never carries):

* corrected reading → *"Payroll run January 2027 reads as ready after the correction recorded on
  this payslip, but nothing will post it: a payroll run is booked only by the unattended read of a
  filed payslip, and re-filing reads the page afresh without that correction. Book this month by
  hand from the corrected figures."*
* every other reading → 0297's sentence, to the byte.

The remedy is reachable by the person who reads it: `clara.draft_entry` and `clara.approve_entry`
are both `clara_authenticated`, which the migration's own tail re-measures rather than assumes.
Driven by `packages/db/tests/payroll-correction-sentence.test.mjs` S3c, which reads the words off
the QUEUE (the surface a person sees), with the reversed-clean-run control asserting 0297's
sentence as an exact string.

### ADV-L05-02 (major, #1090) — FIXED

The successor contract's read was prose in a comment and asked only `state = 'live'`. A record's
`state` does not move when its window simply closes, so a 2024-only note grounded a 2026 proposal
under the deriver's present-tense sentence. The statement is now code with one home,
`FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL` (`packages/runtime/lib/fa-proposal-grounds.ts`), taking the
calendar day as `$2` (null = today in MYT) and carrying the SAME window terms
`clara.retrieve_knowledge` computes `in_effect` from (`0230:361-362`). It DROPS where that door
MARKS, and says why: that door hands a model a marked record so the model can say "this expired";
this ground feeds a deterministic deriver with no vocabulary for an expired note.

Cells `dk.08` (closed window → nothing; inside the window → the same row, mapped; an unwindowed note
at three as-of days; the null default) and `dk.09` (why not `clara.retrieve_knowledge`:
`clara_agent_ro` holds EXECUTE on neither that door nor `clara.record_work_knowledge_read`, while
`clara_runtime` holds both — so the successor step leaves NO drift receipt, which the contract now
states in those words). Vacuity control: with the two window terms deleted `dk.08` fails at "an
expired note grounds nothing" (expected 0, actual 1); subject restored byte for byte.

### ADV-L05-03 (major, #1093) — FIXED

The jsonb-path filter is this app's first, nothing drives it against a real PostgREST, and the same
commit deleted the client-side identity check while the reader swallows every error by design — so
a server that ignores the filter (answering with the client's whole pending roster) would pre-fill
ANOTHER asset's drivers under a sentence naming this one, silently. I took the reviewer's third
option: the belt is back in the loop (kind AND asset_id), so an ignored filter degrades to the
pre-#1093 client-side scan — slower, never wrong — and two cells drive it (a roster with a sibling's
question at the head; a question of another kind carrying the same asset_id). The comment now says
plainly which hop remains unmeasured and names the belt as its consequence. The wire itself is still
not driven against a real PostgREST; that is recorded as a follow-up below rather than claimed.

### ADV-L05-04 (minor, #1092) — FIXED (prose, in the README section)

0346's header says "52 of the 52 policies `clara_agent_ro` holds today are plain tenancy
predicates". Re-measured live after 0346: 53 policies name that role — 37 × `(firm_id =
clara.wake_firm())` (mine is one, so 36 of the 52 before it), 7 × `((firm_id is null) or (firm_id =
clara.wake_firm()))`, 6 × `true` (the catalogue reads `clara.event_types`, `clara.knowledge_keys`,
`clara.knowledge_plan_item_map`, `clara.taxonomy_active`, `clara.taxonomy_versions`,
`clara.trigger_taxonomy`), 1 × `(id = clara.wake_firm())`, 1 × `clara.shares_my_firm_wake(id)`, 1
EXISTS join. The corrected statistic is in `packages/db/README.md` § "0346, corrections from the fix
round", never by editing the applied file — the house rule the reviewer named, and the only one open
to me: `CLARA_MIGRATION_REDO` takes the highest applied version only, and 0345/0346 sit above 0344.

### ADV-L05-05 (minor, #1056) — FIXED (prose, in the README section)

Re-measured: `clara.revise_document_fact` and `clara.persist_invoice_facts` both take the
`clara.documents` row `for update`; `clara.persist_payroll_facts` takes no lock at all, and neither
does `clara._post_payroll_run`. The door's "serialised against every other writer of this document's
reading" is therefore wider than the estate. The README section now states what is true — a
reachability argument (a payroll document is read exactly once, nothing posts outside that
transaction) that lapses the day anyone adds a payroll re-read or a post-it-now door, at which point
the payroll writer needs the same `for update`.

### SPEC-1056-A (minor, #1056) — FIXED, in migration 0360

The probe `clara._document_live_posted_entry` admits a live `entry_evidence_links` row (that arm
tests no status of its own) or any approved un-reversed entry bound to the document — no payroll
qualification — while the refusal said "this payroll run is already posted as entry %". The probe is
KEPT deliberately: narrowing it to `flags->'payroll_run'` would let a reading move underneath a
hand-booked entry raised from that very reading, which is exactly what the new ready sentence now
recommends. Corrected instead: the sentence states what was found, the reason code is
`live_entry_present` (0217's own `live_bank_statement_present` shape) and the detail gains
`is_payroll_run`. ONE remedy is named because one exists — measured: both writers of
`clara.entry_evidence_links` only create a link for an already-posted entry
(`clara.attach_entry_evidence` refuses a draft in those words, which a cell drove;
`clara._record_journal_entry_core` writes its link inside the posting transaction), and
`t_entry_evidence_release` releases every live link when `reversed_by` is set, so a reversal clears
both arms. Cells S6b drive a manual journal citing the payslip as evidence (`is_payroll_run` false)
and the acquisition itself (true). The 0344 battery is frontier-aware on the renamed reason: it
asserts ONE exact name per frontier rather than tolerating both.

### STD-1 (minor, #1056) and ADV-L05-07 (note) — FIXED

`PAYROLL_FACT_REVISION_0344_UNGRANTED_FNS` now lists all five ungranted helpers 0344 mints, and its
comment says which job the list actually does: it is the partial-frontier detector
(`cohortFailures`), not the grant guard (`grantMatrixFailures`, which walks the live catalogue and
holds every function outside ALLOWED to no grant, listed or not). Matches 0217's precedent in the
same file. `operation-census` + `rig-isolation` re-run: 33 tests, 32 pass, 1 skipped, 0 fail.

### STD-2 (note, #1093) — FIXED

The web comment cited `p933.read.by_asset` for the TWO-path predicate; that cell drove
`source_ref->>'asset_id'` alone. Rather than narrow the claim, the db cell now drives BOTH paths
together under the human role, with a control showing the `kind` half really excludes
(`tenancy_rent_plan` → zero rows). The comment states what remains unmeasured.

### SPEC-1092-B (minor, #1092) — RECORDED as a knowing acceptance

Written into `packages/db/README.md` § "0346, corrections…" in these words: `clara_agent_ro` can now
SELECT EVERY depreciation-policy row of every client of the firm, LIVE rows included, not only
retired ones, and at table level, so the free-text columns (`reason`, `created_by`, `retired_by`,
`retired_reason`) are reachable even though `FA_RETIRED_ACCOUNT_POLICY_SQL` selects five driver
columns and no commentary. The narrower wall was rejected for a measured reason (a retired-only
policy makes the read's own supersession guard vacuous under the very credential that runs it) and
no column-level SELECT grant exists anywhere in this estate to copy. **This belongs in the
integration record as a decision, not as an implementation detail.**

### SPEC-1090-B, SPEC-1056-B, SPEC-1056-C, ADV-L05-06, ADV-L05-08 (notes) — RECORDED, not changed

All five are now written down where the next reader looks (`packages/db/README.md`, the 0344/0345
correction sections): the admin floor above the binding door's bookkeeper floor; the Revise control
offered for every run-level payroll path; the facts-version note taking the payroll version; the
`knowledge_keys` equality census on an append-only catalogue; and the commentary columns reachable
under the table-level grant. None is changed here: the first is an owner question, the middle two
are declared supersets the ticket's own "beta, nothing dark" posture wants, the fourth is not live
this wave (no other lane touches that relation), and the fifth is the shape the estate already uses.

### SPEC-1093-B (note) — the correction, recorded here

`waveS-lane05-ticket1093.md` states that `claraWork.v4.impl.ts` "is not in `frozen-workflows.json`".
**That is wrong**: it is at line 1199 of the lane's own manifest, and #1092's report says so
correctly. I have NOT edited that ticket report — this fix report is the only file outside the
worktree I may write — so the correction lives here, and the integrator should read the freeze fact
from #1092's report (or from the manifest), never from #1093's.

### SPEC-1090-A, SPEC-1092-A, SPEC-1093-A (three majors) — REFUTED as lane work, ANSWERED as a contract

All three require wiring into `packages/runtime/workflows/claraWork.v6.impl.ts`. Measured:

* that file **does not exist at this lane's base** `7bc5a710f`;
* on `main` (`061a6992b`) it is in `frozen-workflows.json` with `"deployed": true`;
* `SWEEP-PLAN.md`'s shared-files table allocates `frozen-workflows.json` to **L8 only** ("the cut
  phase mints the `chatTurn_v22` and `claraWork_v6` entries; L8 adds its tools into them, after the
  cut merges");
* the work order forbids a lane worker to edit a frozen workflow body at all (rule 5; the wave-2
  addendum: "A frozen chat or Work tool is never edited. Everything such a tool would need is a
  'successor contract' in your report").

So the fix the reviewer asks for is exactly the act the plan of record reserves for another lane,
and the deploy-lock means it cannot be an in-place edit even there: a behavioural change to a
deploy-locked body ships as a new `_vN`. What I owe instead is a contract precise enough to apply
without re-deriving anything. It follows.

---

## Successor contract — the proposal input-loading step

**Target.** `loadFaProposalInputsStepV6`, `packages/runtime/workflows/claraWork.v6.impl.ts:1323-1398`
on `main` at `061a6992b`. The body is deploy-locked, so this lands as `claraWork_v7`'s own step (or
inside whatever new `_vN` the cut family opens), never as an edit to v6.

**1 · Import (the module is NOT frozen and is this lane's own):**

```ts
import {
  FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL, mapDepreciationKnowledgeRows,
  FA_RETIRED_ACCOUNT_POLICY_SQL, mapRetiredAccountPolicyRow,
  type DepreciationPolicyKnowledgeRow, type RetiredAccountPolicyRow,
} from "../lib/fa-proposal-grounds.js";
```

**2 · Step (c), the client's recorded note** — after step (b)'s `siblings` loop, inside the same
`readScoped` callback (the credential is `clara_agent_ro`, which is exactly what both statements
were driven under in the db batteries):

```ts
const knowledgeRows = await c.query(FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL, [work.clientId, null]);
const knowledge = mapDepreciationKnowledgeRows(
  knowledgeRows.rows as DepreciationPolicyKnowledgeRow[]);
```

`$2` is the calendar day the proposal is made for; `null` means today in MYT, computed in the
statement. Pass a date ONLY if the run carries its own as-of. The statement drops a note whose
effective window is closed — do not re-add a `state = 'live'`-only form.

**3 · Step (d), the account's retired policy** — `$2` is the row's own account, which step (a)
already selected as `assetAccount`, and a null account has no policy:

```ts
const retiredPolicy = assetAccount === null ? null : mapRetiredAccountPolicyRow(
  (await c.query(FA_RETIRED_ACCOUNT_POLICY_SQL, [work.clientId, assetAccount]))
    .rows[0] as RetiredAccountPolicyRow ?? null);
```

**4 · The return** gains the two keys the deriver already ranks, and the OMITTED comment at
`claraWork.v6.impl.ts:1389-1392` goes with them:

```ts
      return { asset: { … }, siblings, knowledge, retiredPolicy };
```

**5 · `particulars_complete` (SPEC-1093-A).** v6's step (a) at lines 1336-1337 carries the
two-condition form `(fa.depreciation_start_date is not null and fa.depreciation_method is not null)`.
The estate's own predicate is six conditions — `clara._fa_particulars_complete` (re-read live from
`pg_proc`, 2026-09-25) and `loadPendingFixedAssetStepV4` (`claraWork.v4.impl.ts:707-714`) both use:

```sql
(fa.depreciation_start_date is not null
 and fa.depreciation_method is not null
 and (fa.depreciation_method = 'none'
      or (fa.depreciation_method = 'straight_line'
          and fa.useful_life_months is not null and fa.residual_cents is not null)
      or (fa.depreciation_method = 'reducing_balance'
          and fa.useful_life_months is not null and fa.residual_cents is not null
          and fa.depreciation_rate_bps is not null))) as particulars_complete
```

Under the narrow form a row with a method and a start date but no useful life reads COMPLETE, and
the question that would have collected the missing drivers is skipped. Take the six-condition form,
and pin it with a cell.

**6 · Three sentences on `main` this lane makes false**, to correct in the same change:
`claraWork.v6.impl.ts:1389-1392` ("`clara.knowledge_keys` catalogues no depreciation key yet, and
the retired-policy relation is unreachable from this credential" — 0345 catalogues it and 0346
reaches it); and, in this lane's own prose, the two the README corrections already fix.

**7 · What the contract does NOT include, and must not be assumed.** The step reads the relations
directly and therefore leaves **no** work-knowledge-read receipt: `clara.work_knowledge_drift` will
not see this reliance. That is measured, not a choice made lightly — `clara_agent_ro` holds EXECUTE
on neither `clara.retrieve_knowledge` nor `clara.record_work_knowledge_read` (cell `dk.09`). If the
drift trail is wanted for this ground, the step must run under `clara_runtime` instead, which is a
different credential with a different wall and a decision of its own.

---

## Gates

| gate | result |
|---|---|
| `packages/db` `payroll-correction-sentence.test.mjs` (new) | 4/4 pass (focused, full gate chain, `clara_l03`) |
| `packages/db` `payroll-fact-revision.test.mjs` | 11/11 pass |
| `packages/db` `depreciation-policy-knowledge.test.mjs` | 9/9 pass (7 → 9: `dk.08`, `dk.09`) |
| `packages/db` `fa-retired-policy-agent-read.test.mjs` | 3/3 pass |
| `packages/db` `fa-particulars-proposal.test.mjs` | 5/5 pass (the `by_asset` cell gained the two-path predicate and its control) |
| `packages/db` `operation-census` + `rig-isolation` | 33 tests, 32 pass, 1 skipped, 0 fail (never with the reset flags) |
| `packages/db` all five touched batteries in ONE invocation | 32 tests, 32 pass, 0 skipped, 0 fail |
| `packages/runtime` `fa-particulars-proposal-unit.test.mjs` | 35/35 pass |
| `node scripts/check-frozen-workflows.mjs` | 38 violations, ALL base staleness — identical with this lane's runtime edits stashed, and no lane file is in `main`'s manifest any more |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `apps/web` `lib/registers/fa-particulars-proposal.test.ts` | 19/19 pass (17 → 19) |
| `apps/web` `tests/firm-scope-db-pins.test.ts` | 22/22 pass (rule (d): 0360's barrier entry added, sha `cc79bbfc…`) |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | 5188 tests, 5186 pass, 2 skipped, 0 fail (142 suites) |
| `pnpm typecheck` | green |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | every step green EXCEPT step 1, `check-frozen-workflows.mjs`, which fails on the 38 base-staleness violations above and short-circuits the `&&` chain — so the chain was run from step 2 onward by hand: all fifteen selftests/checks pass, `eslint scripts eslint.config.mjs` passes, `pnpm -r --if-present lint` exits 0 and `packages/reporting-render` lint exits 0 |
| browser walks | none touched: this round changed no e2e spec, no component and no route |

Migration 0360 was applied FIRST through `pnpm --filter @clara/db migrate` (prestate reported
`FIRST`, both splices moved a sha, tail OK) and then REDONE through
`CLARA_MIGRATION_REDO=0360_payroll_correction_sentences` (prestate `REDO`, both splices reported as
guarded no-ops, tail re-read from the committed catalog). One honest limitation, written into the
README section: a redo cannot heal an edit INSIDE a spliced string, because the marker is already
live and the splice no-ops. When I changed the refusal's wording mid-round I restored both bodies to
their pinned pre-images by re-running 0297's and 0344's own `create or replace function` statements
as `clara_fn_owner` (an out-of-band rig operation on a disposable database — the hand procedure #957
replaced), confirmed both shas matched §0's pins, and then let the redo take its FIRST branch, which
is the branch a from-scratch chain takes.

## Follow-ups worth filing

1. **Who may post a corrected payroll run?** Today nothing does, and 0360's sentence says so out
   loud. Posting it needs a new `approval_arm` on `clara.entry_post_receipts` and a rationale that is
   not "whose two readings agreed". Owner question; the ticket's own words allow either answer.
2. **The Needs-you row cannot clear when the block clears.** Its WHERE clause never asks the verdict,
   so only an entry retires it. If (1) is ruled the other way, this row's condition should move with
   it.
3. **The jsonb-path filter is still unproven at the wire** (ADV-L05-03): no test drives
   `source_ref->>asset_id` through a real PostgREST. The belt makes a regression harmless, not
   visible. Worth one hosted or local PGRST check, or an e2e mock that parses the query string.
4. **The `depreciation_policy` floor** (`admin`) sits above the binding door it advises on
   (`bookkeeper`). If bookkeepers are the people who record a client's depreciation note, the ground
   will rarely be fed.
5. **`clara.list_review_queue`'s payroll arm and `clara.persist_payroll_facts`' missing
   `for update`** are both safe today only by reachability (ADV-L05-05). Any payroll re-read or
   post-it-now door must bring them.

## Resume note

The earlier worker left four modified files. Judged and completed, not reverted: the web belt and its
two cells (ADV-L05-03), the db `by_asset` pair cell (STD-2), and the two `dk.08`/`dk.09` cells, which
were written against an exported constant that did not exist yet — I wrote the constant (with the
effective-window terms the finding asks for), pointed the battery's `READ` at it so the statement has
one home, and saw both cells green and then red against a deliberately broken subject.

A mid-task message asked for a status report and a hand-over; per sweep rule (f) it was noted and the
work continued. The orchestrator's ruling of the same hour confirmed there is no second writer on
this lane and that the four commits ahead were my own.

Scratch left by the earlier worker (`packages/db/.verify-scratch/`) is removed; the worktree carries
no untracked file.
