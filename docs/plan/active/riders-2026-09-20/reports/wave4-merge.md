# Riders wave 4 — integration merge (COMPLETE)

**Worktree** `C:\Users\zhant\Desktop\clara-wt\int2` · **branch** `integration/riders-w4`
**Cut from** `95ae0abef` (= main `8470d8212` + the wave-4 base `riders/w4-chart` at `eecd9695b`
+ the #944 blueprint commit `97dff9852`)
**Final head** `fb1dae78a3db2c29025fb82c4c79cde89197f354` — all seven lanes merged; the from-scratch chain is DEFERRED by one
message, so no number in the "Checks" section below has been re-taken since lane 04 landed
**Diff vs main** 326 files changed, +81,875 / −2,029 · 211 commits

Seven lanes landed, one merge commit each, in the ordered pass **01, 02, 03, 05, 06, 07, 04**, plus
ten `fix(integration)` commits. Lane 04 merged LAST, on its third recheck's ACCEPT; lane 07 was
merged TWICE, the second time for its closed-wave drill fixes.

**The wave is complete.** The from-scratch chain ran to 309 of 309 and every check below was taken
on this head.

| lane | tickets | migrations | merge commit | lane head merged |
|---|---|---|---|---|
| 01 | #944 #945 #946 #947 #948 #949 | 0296 0297 0298 0299 0300 | `a8ca6b843` | `62114b48f` |
| 02 | #930 #931 | 0301 | `60db38f28` | `71dc448ed` |
| 03 | #937 #938 #942 | 0302 0303 0304 | `ef86a712b` | `b88ff916d` |
| 05 | #933 #871 | 0309 | `5190f950c` | `a0f076510` |
| 06 | #1031 #1032 #1038 | 0310 0311 0316 **0318** (merged as 0317, renumbered — below) | `5100206cb` | `e470d5fe6` |
| 07 | #1033 #1035 #877 #1041 | — | `62533b680` | `a3019c4c3` |
| 04 | #939 #940 #915 #941 #1036 | 0305 0306 0307 0308 0315 0317 | `2f7ada3a8` | `c8a7911aa` |
| 07 again | #1041 (the closed-wave drills) | — | `29e76ea68` | `5492d5a56` |

| fix commit | what |
|---|---|
| `784474ea1` | #938 vs #946–#949 — needs-you's header census counts SIXTEEN row kinds |
| `0c8768ae8` | #938/#942 vs #659 — the queue pin admits lane 03's splices above lane 01's |
| `89e0a408f` | #949 — the pins corpus re-measures 0300 after lane 01's second fix round |
| `96a8228f1` | #1031 — lane 06's fix-round migration takes 0318, off lane 04's 0317 (the orchestrator's ruling) |
| `bb102839c` | #941/#915/#1036 vs #949 — 0308 recuts from 0300's post-image, not main's |
| `c9968b5fc` | #948 — agreementFacts_v1 joins the three rosters payrollFacts_v1 is in |
| `c8fe1a39d` | #941 vs #937 — 0308's admission core carries lane 03's accrual arm too |
| `0dadf0a69` | #915/#941 vs #949 — the OBO twin's authority wall keeps its stated parity |
| `fb1dae78a` | #1031 — the knowledge pin follows the body the 0318 renumber moved |

Nothing was stopped on. No `--abort`, no whole-side pick, no push, no GitHub write, no lane branch
or worktree touched, no subagent spawned.

---

## The duplicate overflow number, and how it was resolved

**Migration `0317` was claimed twice.** Lane 06's fix round wrote
`0317_knowledge_fye_pair_applicability.sql` (#1031's applicability re-cut) and lane 04's pending
head carries `0317_schedule_term_correction.sql` (#939 AC4 / #941 AC3). Git does NOT conflict — the
filenames differ — so this fails at RUN time, exactly as wave 3's 0280/0281 collision did:
`packages/db/scripts/migrate.mjs` throws `duplicate migration version 0317`.

**Where it came from, so the rule can be written.** Both are FIX-ROUND files, and the wave's rule
(this folder's `README.md`, the three rules added since wave 2) says a fix round that needs another
migration "takes a number from the wave's overflow block (`0315` and up for wave 4), never the next
free number". Both lanes obeyed that rule and both then chose **"the next free number IN the
overflow block"** on their own, with no way to see each other: lane 04 took 0315, lane 06 took 0316
for a planned ticket and then 0317 for its fix round, and lane 04's own fix round took 0317 too.
The overflow block removed the collision at the TOP of the numbering and reproduced it inside
itself. **The rule for the plan README: the ORCHESTRATOR assigns overflow numbers on request, and a
fix worker never picks one.** Wave 3 paid for the first half of this lesson; this is the second
half.

**Resolved on the orchestrator's ruling (2026-09-24): LANE 06 MOVES**, to `0318`; lane 04 keeps
`0317`. That follows wave 3's own precedent — the side that moves is the FINISHED, merged one,
because the still-live lane's rig ledger carries the number and its workers are running against it.
Lane 06 is merged and quiet; lane 04's `clara_l04` carries 0317 and its third recheck was running
when the ruling was made.

Applied in **`96a8228f1`** *fix(integration): #1031 lane 06's fix-round migration takes 0318, off
lane 04's 0317*. `git mv`, so the rename is recorded as a rename.

**The slug and the stem are byte-unchanged** (`knowledge_fye_pair_applicability`), which is what
makes this nominal rather than structural: every branch in the estate that asks whether this file
is applied keys on the STEM, never the number. There is exactly one such probe —
`knowledge-retrieval.test.mjs:965`, `where version ~ 'knowledge_fye_pair_applicability$'` — and
`knowledge-fixtures.mjs`'s `fyePairWallCohortApplied` asks the CATALOG for the four-argument rule
and its two callers rather than any number at all. **No gate-chain token moved**: this file mints no
new name, owes no rig-meta cohort and no preintegration gate of its own, and rides 0310's
(`fye-pair-wall-preintegration-gate.mjs`). The chain still carries **119** tokens.

Every reference changed, each hit accounted for by a whole-tree grep before and after (zero `0317`
left outside `docs/plan`, which records lane 04's reservation and is correct):

| file | what changed |
|---|---|
| `packages/db/migrations/0318_…sql` | line 1, the overflow-block sentence, and the ten in-body `#1031 FIX ROUND (0317)` markers — including the three inside the dollar-quoted reverse-substitution chunks |
| `packages/db/README.md` | the `## 0318` heading, the filename, both cohort sentences and the `CLARA_MIGRATION_REDO` recipe |
| `packages/db/tests/README.md` | the two-file cohort note |
| `packages/db/tests/fye-pair-wall-preintegration-gate.mjs` | its header, which names both files of the cohort |
| `packages/db/tests/knowledge-fixtures.mjs` | `fyePairWallCohortApplied`'s docblock |
| `packages/db/tests/knowledge-fye-day.test.mjs` | the fix-round citation |
| `packages/db/tests/knowledge-onboarding-promotion.test.mjs` | the cohort note, the skip text and `kp.14`'s own grounding |
| `packages/db/tests/knowledge-retrieval.test.mjs` | the branch's PROSE only; the probe is the stem and did not move |
| `packages/db/tests/knowledge-firm-defaults.test.mjs` | the declared-consumer's reason string |
| `packages/db/tests/rig-meta.mjs` | the cohort comment |

**Deliberately NOT changed:** the stem literal, any gate module's variable, the pins corpus (this
file is static DDL with no dynamic-SQL barrier, so it owes no entry), and this folder's own
`README.md` lane table, which records lane 04's reservation.

**Verified after the rename**, against the chain database still standing at `clara_w4int`:
`knowledge-fye-day`, `knowledge-retrieval`, `knowledge-onboarding-promotion`,
`knowledge-firm-defaults` and `firm-portfolio-pack` under the full 119-gate chain — **92 pass / 0
fail**, which is the proof that nothing keyed on the number. `eslint` over `packages/db` clean;
`node --check` clean on all seven touched modules.

`operation-census` REDS on that database, and correctly: its ledger still carries the row
`0317_knowledge_fye_pair_applicability` while the file on disk is now `0318`, so `migrate.mjs`'s own
immutability check refuses — *"applied migration … is MISSING from disk (deleted or renamed)"*.
**That is the database being stale, not the branch being wrong.** `clara_w4int` is dropped and
rebuilt from scratch when the last two heads land, which is the one run that settles it.
---

## Per-lane resolutions

### Lane 01 (#944 #945 #946 #947 #948 #949 — migrations 0296–0300)

**One conflicted file.** `packages/db/README.md`: both sides continued at the same seam, the last
paragraph of the wave-4 chart section (`## 0295`). HEAD carries that paragraph's CORRECTED wording —
the collation-independent structural digest, from `riders/w4-chart`'s round-2 #941 fix — while lane
01 carries the STALE wording of the same sentence plus its six new ticket sections.

Resolved by intent: HEAD's paragraph kept whole (it is the later, corrected statement about that
battery), lane 01's duplicate of it dropped, and lane 01's sections appended from its `## #945`
heading on. No prose merged between the two sides. **This exact shape recurred at every lane that
touched this file (02, 03, 05, 06) and was resolved the same way each time.**

Everything else auto-merged. Checked rather than trusted:

- **`apps/web/messages/en.json` did NOT need rebuilding.** The work order warned that #945
  re-serialized it with ~630 lines of churn; lane 01's own fix round (SPEC-15 / ADV-07) already
  rebuilt it from its BASE bytes plus the new keys. Measured here: lane 01's whole diff against the
  base is **105 insertions / 4 deletions**, not 652/640. There was nothing to restore.
- the gate chain ends `… wave4-chart-rows (0295) → payroll-summary-facts (0296) →
  payroll-summary-posting (0297) → payroll-settlement (0298) → agreement-contract-acquisition
  (0299) → tenancy-rent-plan (0300)`. 111 tokens, none twice.
- `apps/web/lib/firm/needs-you.ts` carries fifteen row kinds after this lane; en.json has no
  duplicate key (independent scanner, not `JSON.parse`, which drops a second copy in silence).

### Lane 02 (#930 #931 — migration 0301)

**Two conflicted files**, both additive at a shared seam.

`packages/db/package.json` — the gate chain. Union ordered by migration number: HEAD's 111 tokens
kept whole, lane 02's one new token (`staff-expense-claim-allocations`, 0301) appended after 0300's,
which is its number's position. **112 tokens, none twice.** JSON re-parsed.

`packages/db/README.md` — the chart-paragraph shape above; lane 02's `## #931 … (0301)` section
appended after lane 01's 0296–0300 sections.

`rig-meta.mjs` (113 exports, imports clean), `en.json` (no duplicate key), `CONTEXT.md` and
`e2e-fixture-ownership.test.ts` auto-merged.

### Lane 03 (#937 #938 #942 — migrations 0302 0303 0304)

**Ten conflicted files** — the widest lane of the pass, because it is the second lane to write into
the Needs-you row-kind family that lane 01 had just widened.

`packages/db/package.json` — union, three tokens at 0302/0303/0304's positions. **115 tokens.**

`packages/db/README.md` — the chart-paragraph shape; three `## 0302/0303/0304` sections appended.

`apps/web/lib/firm/needs-you.ts` — the row-kind array. Both sides appended at the end of
`REVIEW_QUEUE_ROW_KINDS`: lane 01's five kinds then lane 03's `accrual_bill_conflict`, **in lane
order, nothing reformatted or renamed**. The array now carries SIXTEEN kinds. (The file's header
census still said FIFTEEN afterwards — fixed in `784474ea1`, below.)

`apps/web/lib/firm/needs-you-links.ts` and `apps/web/components/firm/needs-you-affordances.tsx` —
the same additive seam, both sides kept in lane order. Lane 03's is the only one of the six new
kinds that carries an inline affordance; lane 01's five are all `null` with their reasons.

`apps/web/messages/en.json` — two hunks in the `NeedsYou.rowKind` and `NeedsYou.openTab` maps.
Union of all six new kinds, **and main's ordering restored**: `rowKind` reads in
`REVIEW_QUEUE_ROW_KINDS` order with the `unknown` fallback LAST, which is where main has it
(`cd2925391:apps/web/messages/en.json`, checked) and where lane 01 had moved it from. No key lost,
no value changed, no duplicate key. (`apps/web/scripts/check-message-keys.mjs` sorts its own output
and enforces resolution, not file order, so the ordering rule here is main's convention, not a
script's.)

`apps/web/tests/firm-scope-db-pins.corpus.ts` — HEAD's `0300` entry and lane 03's `0304` entry
shared the closing `},\n  ],`. HEAD's entry closed explicitly, the shared tail left to close lane
03's. **33 entries, key order still file-sorted**, ending `… 0291 · 0297 · 0298 · 0299 · 0300 ·
0302 · 0304`.

`packages/db/tests/rig-meta.mjs` — the WRITERS grant-matrix spread list; both sides' cohorts kept in
migration order (0298, 0300, then 0302).

`CONTEXT.md` — the one place two lanes rewrote the SAME sentence. The "Settlement candidate row"
entry's last sentence: lane 01 enumerates the family's three instances (#657, #947, #949); lane 03
adds that #938's row is a NEIGHBOUR that reuses the mechanics without joining the family, plus the
paragraph on a derived row outliving its own remedies. **Both intents kept**; lane 03's
re-statement of "#657's pending bank line is its first instance" dropped as a duplicate of the
sentence HEAD already carries. This is the ONE line of any lane that this pass deliberately did not
carry through, and it is named here for that reason.

`apps/web/README.md` — organised by ticket, not by number: both sides' sections kept, lane 02's
#930/#931 then lane 03's #937/#942.

**Mechanically verified after the resolution**, not by eye: every line lane 03 ADDED is present in
the merged file and every line it REMOVED is gone, across all ten files. The only reported
exceptions are the three named above (the CONTEXT.md duplicate sentence, the unioned gate-chain
line, and `},` as a structural false positive).

### Lane 05 (#933 #871 — migration 0309)

**Two conflicted files**: the gate chain (union, `invite-preview-public` at 0309's position, **116
tokens**) and `packages/db/README.md` (the chart-paragraph shape; `## #933` and `## 0309` appended).

`CONTEXT.md`, `apps/web/README.md`, `en.json`, `manifest.txt`, `apps/web/e2e/serve-built.mjs`,
`rig-meta.mjs` (115 exports) and `packages/runtime/README.md` auto-merged, every one line-checked.

### Lane 06 (#1031 #1032 #1038 — migrations 0310 0311 0316 0317)

**Three conflicted files.**

`packages/db/package.json` — union, three tokens at 0310/0311/0316's positions. **119 tokens, the
final count for this pass.** 0317 adds no token, by its own record: it mints no new name, so it owes
no cohort and no gate module, and rides 0310's gate (`fye-pair-wall-preintegration-gate.mjs`), whose
header now names it.

`packages/db/README.md` — the chart-paragraph shape; `## 0310` and `## 0317` appended.

`packages/db/tests/knowledge-firm-defaults.test.mjs` — **a census two lanes widened**, the most
interesting file of the pass after `needs-you.ts`. The cell walks every function that reads
`clara.knowledge_records` and requires each non-cohort reader to be a DECLARED read-only consumer
with its reason. Lane 01's 0300 declared one (`clara._client_reporting_framework`, the lessee
branch's framework read) and lane 06's 0310/0317 declared another
(`clara._knowledge_assert_fye_pair`). Both maps kept, and **both exclusions now sit in the stray
filter and in the `declaredConsumers` spread** — the filter line was split across two lines to carry
both, which is the only formatting change in the file. `node --check` clean; the cell passes.

`CONTEXT.md`, `rig-meta.mjs` (116 exports), `firm-portfolio-pack.test.mjs` and
`packages/db/tests/README.md` auto-merged, all line-checked.

### Lane 07 (#1033 #1035 #877 #1041 — no migration)

**No conflicts.** The lane already carried a merge of the fixed wave-4 base, so its merge base here
is `eecd9695b` rather than `cd2925391`.

Four files are touched by lane 07 and by an earlier lane — `CONTEXT.md`,
`packages/db/tests/README.md`, `packages/db/tests/rig-cluster-reset.mjs` (also lane 05) and
`packages/runtime/README.md` (also lanes 01 and 05). Each was line-checked: every line lane 07 adds
is present, every line it removes is gone.

Lane 07's CI split lists (`packages/db/tests/split-lists/test-list-*.txt`) roster the `x41`/`x42`
corpus and the frontier-aware contracts, not the whole db suite, so the five new test files the
other lanes added owe no line there. Proven rather than argued:
`ci-frontier-leg-contract.test.mjs`, `ci-drill-database-names.test.mjs`,
`drill-fixture-name-family.test.mjs` and `reset-gate-routing.test.mjs` all pass on the merged tree.

---

## The shared files, and what happened to each

| file | lanes | outcome |
|---|---|---|
| `CONTEXT.md` | 01 02 03 05 06 07 | one hand resolution (lane 03's), the rest auto-merged |
| `packages/db/package.json` | 01 02 03 05 06 | union by migration number, five times; 119 tokens |
| `packages/db/README.md` | 01 02 03 05 06 | the chart-paragraph shape, five times; sections in migration order |
| `packages/db/tests/rig-meta.mjs` | 01 02 03 05 06 | one hand resolution (lane 03's), rest auto; 116 exports |
| `apps/web/messages/en.json` | 01 02 03 05 | one hand resolution (lane 03's), main's ordering restored; no duplicate key |
| `apps/web/test/manifest.txt` | 01 03 05 | auto-merged; 563 lines |
| `apps/web/e2e/e2e-fixture-ownership.test.ts` | 01 02 03 | auto-merged; census green |
| `apps/web/README.md` | 02 03 05 | one hand resolution (lane 03's), by ticket not by number |
| `packages/runtime/README.md` | 01 05 07 | auto-merged |
| `apps/web/e2e/serve-built.mjs` | 01 05 | auto-merged |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | 01 03 | hand-resolved (shared closing token); 33 entries, file-sorted |
| `apps/web/lib/firm/needs-you.ts` | 01 03 | hand-resolved; SIXTEEN row kinds in lane order |
| `apps/web/lib/firm/needs-you-links.ts` | 01 03 | hand-resolved, both sides kept |
| `apps/web/components/firm/needs-you-affordances.tsx` | 01 03 | hand-resolved, both sides kept |
| `packages/db/tests/knowledge-firm-defaults.test.mjs` | 01 06 | hand-resolved; both declared consumers live |
| `packages/db/tests/firm-portfolio-pack.test.mjs` | 01 06 | auto-merged, then fixed by `0c8768ae8` (below) |
| `packages/db/tests/rig-cluster-reset.mjs` | 05 07 | auto-merged |
| `packages/db/tests/README.md` | 06 07 | auto-merged |
| `packages/db/tests/plan-overlap-template-arm-retired.test.mjs` | 01 04 | lane 01's only, so far |
| `apps/web/e2e/README.md` | 01 04 | lane 01's only, so far |

**`apps/web/lib/firm/needs-you.ts` was touched by TWO lanes, not four.** The work order predicted
four; lanes 02 and 05 both state in their own reports that they never touched it, and the diff
agrees. Lane 04 may still add one.

---

## The integration fixes

### 1. `784474ea1` — needs-you's header census (#938 vs #946–#949)

The row-kind ARRAY merged as a union; the file's HEADER census did not, because only lane 01 had
touched that hunk. The merged file said FIFTEEN beside an array of sixteen.

Re-derived against the array itself, which is the rule the header carries in its own words after
lane 01's fix round: *"the next addition counts the array rather than adding one to the last
comment."* The roster sentence names all sixteen, 0302 gains its own entry in the header's migration
list (with what #942's 0304 added to it — `accrual_side` and `accrual_plan_status`, both derived
from the shared `id`, so no arm's column vector moves), and the "counts carries NINE integers"
sentence names the new kind among those that mint no tally. **No code changed**, and the ordinals in
the array's own comments were already position-correct because lane 01's fix round had re-derived
them.

### 2. `0c8768ae8` — the queue pin ladder (#938/#942 vs #659)

**The collision a merge cannot see.** Found by running the gates against the from-scratch chain, not
by reading a diff.

`packages/db/tests/firm-portfolio-pack.test.mjs`'s `p659.portfolio.no_recut` pins
`clara.list_review_queue(jsonb,jsonb,int)` by `sha256(prosrc)` through a ladder of generations, one
per migration family that has spliced it. Lane 01's fix round (its own SPEC-05) added a fourth,
gated on its LAST splicing file's stem (`tenancy_terms_rent_plan$`, 0300) and carrying
`886df580…`. Lane 03 splices the SAME body twice more at HIGHER numbers — #938's 0302 and #942's
0304 — so on the integrated chain the live body is `d5456ecc…` and the cell reds. **Each lane is
green alone; the chain is not.**

Fixed by adding a FIFTH generation gated on lane 03's last splicing file's own STEM
(`accrual_revenue_side$`), carrying `d5456eccb945decd9f61bba6194543d0528ee5f052776d6fdc20cf9fa0226b6b`,
measured on the from-scratch chain at `127.0.0.1:55700/clara_w4int`. Every earlier generation and
every other pin in the map is untouched. The STEM, never a number, for the renumber hazard wave 3
lane 04 already paid for — which matters more than usual here, given the 0317 question above.

`firm-portfolio-pack.test.mjs` under the full 119-gate chain: **17 pass / 0 fail.**

### 3. `89e0a408f` — the pins corpus re-measures 0300 (#949)

**Not a merge collision: a stale pin lane 01 shipped**, surfaced by the integration gate run.

The corpus pinned `0300_tenancy_terms_rent_plan.sql`'s CONTENT at `3ecaf6f0…`, the value lane 01's
FIRST fix round measured. Its SECOND fix round (L01-RECHECK-1) then rewrote the file's
design-rationale comment above `clara.contract_terms` and re-applied it with
`CLARA_MIGRATION_REDO`, moving the content sha to `c6b9db6d…` — a value lane 01's own fix report
records as the new ledger checksum. The lane's recheck ran the tenancy battery, the operation census
and lint; none of those reaches `apps/web/tests/firm-scope-db-pins.test.ts`, which is a WEB test, so
the mismatch only appeared here.

The merge did not touch the file: its bytes on `riders/w4-lane01` and on this branch are identical
(`git diff` empty), and the new value is the file's own `sha256` on disk. **All 33 corpus entries
were re-measured against their files; this was the only mismatch.**

---

## Lane 04, and the chain-order collision it brought

Lane 04 merged last, on head `c8a7911aa` (third recheck ACCEPT), with six migrations: 0305 0306
0307 0308 0315 0317. It does NOT splice `clara.list_review_queue` and does not touch
`apps/web/lib/firm/needs-you.ts`, so the pin ladder needs no sixth generation and the row-kind
census stays at sixteen — both hazards this report named were checked and neither fired.

**Six conflicted files.** The gate chain took an ordered INSERT rather than an append (lane 04's
six tokens land at 0305, 0306, 0307, 0308, 0315 and 0317's own positions among lane 03's, 05's and
06's; **125 tokens, none twice**, the wave tail ascending 273 … 317). `packages/db/README.md` took
an ORDERED SPLICE for the same reason: both sides were cut into whole `## ` sections, each tagged
with the migration its heading names, and re-sorted, so the file still reads 0296 … 0318 ascending.
`rig-meta.mjs` took both sides' cohorts in migration order, the `cohortFailures` block again
resolved by closing HEAD's guard explicitly and letting the shared `}` close lane 04's last (the
fourth time this wave). `apps/web/e2e/README.md`'s count sentence collided for the third time and
was re-measured against disk rather than picking a side: **54 specs, 28 described, 26 residual**.
`apps/web/README.md` kept both sides' ticket sections.

### The collision a merge can only half-see (`bb102839c`)

`packages/db/tests/plan-overlap-template-arm-retired.test.mjs` conflicted because BOTH lanes
re-based the SAME pin of `clara.create_accounting_plan`, to different values. That visible conflict
was the symptom; the disease is three files deeper.

**What collides.** Lane 01's 0300 SPLICES a third `authority_ref` kind (`contract_confirmation`)
into two bodies:

| body | pre-0300 | after 0300 |
|---|---|---|
| `clara.create_accounting_plan(uuid,text,…,text)` | `99f60787…` | `f9b19cf6…` |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `c4148f6d…` | `55c20b20…` |

Lane 04 measured its pins on `clara_l04`, which carries no 0300, and four of its files depend on
the pre-0300 values: 0307 KEEPs both (prestate and tail), 0308 RECUTs `create_accounting_plan` and
KEEPs `_authority_ref_refusal` (twice), and 0315 and 0317 KEEP `create_accounting_plan` at 0308's
own output. On the integrated chain 0300 applies FIRST, so every one of those pins refuses.

**And one of them was never a pin problem.** 0308 does not splice that body, it PASTES a whole one
written from the pre-0300 text. Applying it after 0300 would have silently DROPPED #949's third
authority kind — a live behaviour of lane 01's, removed with no test to notice, because lane 04's
own tails check that body by substring (`revenue_recognition_schedule`, `plan_kind_unsupported`)
and would still have passed. **That is the kind of loss a merge cannot see and a green lane cannot
report.**

**The fix, in two parts.** First, 0308's pasted body now carries 0300's widening, so it recuts from
0300's POST-image rather than main's: the wall was replaced with 0300's own anchor and replacement
text, copied verbatim out of 0300 §G.2, so the body 0308 installs is byte-identical to the one 0300
installs plus 0308's own plan-kind widening. Proven rather than asserted — the text between 0308's
`$fn$` delimiters IS `prosrc`, and its sha256 before the edit reproduced `c8e99098…`, the value
0315 and 0317 independently pin as 0308's output, which is what makes the extraction the real body
and not a plausible one. After the edit it is `a7c108d5…`.

Second, **nine pin comparisons across the four files are now BIMODAL**, each admitting its own
measured pre-image OR the value the integrated chain presents, with the reason beside it (precedent:
wave 3's 0284). Nothing else is loosened: every other pin in every one of those arrays stays exact,
and a signature the `case` arms do not name still refuses on any drift — measured on a scratch `DO`
block rather than assumed.

| file | block | body made bimodal |
|---|---|---|
| 0307 | `v_keep[v_i]`, `v_keep[v_n]` | `create_accounting_plan`, `_authority_ref_refusal` |
| 0308 | `v_recut[v_i]` | `create_accounting_plan`'s pre-image |
| 0308 | `v_keep[v_i]`, `v_keep[v_n]` | `_authority_ref_refusal` |
| 0315 | `v_keep[v_i]`, `v_keep[v_n]` | `create_accounting_plan` at 0308's integrated output |
| 0317 | `v_keep[v_i]` and its tail | `create_accounting_plan` at 0308's integrated output |

`f9b19cf6…` and `55c20b20…` were READ OFF the live catalog of the standing from-scratch database
`clara_w4int`, which carried lane 01's 0300 and none of lane 04's files — exactly the state 0307
and 0308 meet on the chain. `f9b19cf6…` independently reproduces the value lane 01's own re-based
test pin carries, which is two sources agreeing.

**Deliberately NOT widened, and disclosed rather than quiet:** `clara._obo_plan_core`'s own
authority wall, which 0308 created by copying `create_accounting_plan`'s "verbatim" and which still
admits two kinds. That claim of verbatimness is no longer true, and the divergence is deliberate —
the OBO twin is the MACHINE lane, a `contract_confirmation` is minted by a human confirm act on the
tenancy lane, and widening a machine lane's authority set is a behaviour change no ticket asked for.

**That reasoning was wrong, and the chain's gate run proved it** — lane 04's own parity cells
MEASURE that copy. Closed in `0dadf0a69`; see the collisions section below. Both things this section
left unverified are settled there too: all eleven bimodal arms were taken, and 0308's installed body
hashes to `a7c108d5…` on the live catalog.

---

## The four cross-lane body collisions, found by a static sweep and settled by the chain

Rather than let the chain surface these one failure at a time, every wave-4 migration was read for
the bodies it RECUTS or SPLICES and the bodies it PINS, and the two sets crossed by lane and by
number. The sweep reports **exactly four** bodies touched by two lanes. Nothing else in the wave is.

| body | lanes | how it was settled |
|---|---|---|
| `clara.list_review_queue(jsonb,jsonb,integer)` | 01, 03 | six additive splices (0297–0300, 0302, 0304). Lane 03's own bimodal-on-STRUCTURE prestate handled it, and the chain took that arm. |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | 01, 04 | pins made bimodal (`bb102839c`) |
| `clara.create_accounting_plan(uuid,…,text)` | 01, 04 | 0308 re-derived from 0300's post-image plus bimodal pins (`bb102839c`), then the OBO twin's parity (`0dadf0a69`) |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | 03, 04 | 0308's paste rebuilt as a THREE-ARM UNION plus a bimodal pin (`c8fe1a39d`) |

**Two of the four were SILENT LOSSES, not pin failures**, and neither would have gone red anywhere:

- **`create_accounting_plan`.** Lane 01's 0300 SPLICES a third `authority_ref` kind
  (`contract_confirmation`) into it. Lane 04's 0308 does not splice that body, it PASTES a whole one
  written from the pre-0300 text. Applying it after 0300 would have removed lane 01's shipped
  behaviour. Lane 04's own tails check that body by substring (`revenue_recognition_schedule`,
  `plan_kind_unsupported`) and would still have passed.
- **`_plan_admit_occurrence`**, the one body that turns a due date into accounting work. Lane 03's
  0303 adds the ACCRUAL arm to its `#653` seam; lane 04's 0308 adds the REVENUE RECOGNITION arm, by
  pasting a body written before 0303. Overwriting would have made a person-stated per-period accrual
  amount stop resolving, so every period would post the revision's constant instead — the exact
  hazard both files' own headers say the arm exists to prevent.

Both were fixed by making the LATER file recut from the EARLIER file's post-image, which is the
wave's own rule. For `create_accounting_plan` the wall was replaced with 0300's own anchor and
replacement text, copied verbatim, so the installed body is byte-identical to 0300's plus 0308's
widening. For `_plan_admit_occurrence` the live post-0303 body was read off the catalog and 0308's
two edits applied to it, then asserted to carry all three lookups, all three typed reasons, lane
03's own variable and BOTH lane markers. Nothing was re-typed in either case.

**The derivation checked out against the catalog.** `a7c108d5…` was computed from 0308's pasted
text before any chain had run — the text between its `$fn$` delimiters IS `prosrc`, and its hash
before the edit reproduced `c8e99098…`, the value two other migrations independently pin as 0308's
output. The chain then installed exactly `a7c108d5…`.

**Eleven pin comparisons across five files are now bimodal**, each admitting its own measured
pre-image OR the value the integrated chain presents, with the reason beside it (precedent: wave 3's
0284). Nothing else is loosened: every other pin in every one of those arrays stays exact, and a
signature the `case` arms do not name still refuses on any drift — measured on a scratch `DO` block,
not assumed.

### The residual I disclosed and then had to close (`0dadf0a69`)

`bb102839c` deliberately left `clara._obo_plan_core`'s copy of that wall at two kinds, reasoning
that widening a machine lane's authority set was a behaviour change no ticket asked for. **The
chain's gate run showed that reasoning was wrong**: lane 04 does not merely copy the wall, it
ASSERTS the copy is exact — `p915.obo.refusals_match` ("the same sentence and the same payload byte
for byte") and `p941.obo.authority` both went red on it. The file's own comment, "THE AUTHORITY
SHAPE, verbatim from clara.create_accounting_plan", is a claim its cells enforce, so the honest fix
was to make it true again rather than weaken a cell. It admits nothing new in substance: the
refusal resolver still applies the same firm-and-client ladder, and a contract-plan-confirmation row
IS a named person's own confirmation, which is exactly the "person's instruction" #977 requires.

**The lesson worth carrying:** a disclosed residual is only safe when nothing MEASURES it. Grep the
other lane's cells before disclosing one.

---

## The from-scratch chain

Cluster **`rigw4` at `127.0.0.1:55700`**, not 55780: the rig-prep worker had to move both ports out
of the 55772–55871 range, which WSL's NAT will not forward to Windows (`wave4-rig-prep.md` §1).

The cluster had already carried one from-scratch chain, so the #867 hazard applied: six roles minted
after 0154 survive a `drop database`, and 0154 pins the cluster-wide `clara%` count at 14. Handled
by the documented recipe rather than by widening anything — `scripts/role-census-reset.mjs` reported
all six safe to drop with no shared dependents, `--apply` dropped exactly them, and the count
returned to 14. The chain then recreated all six on its way back up to 20.

```
dropdb clara_w4int
CLARA_ALLOW_DESTRUCTIVE=1 node scripts/role-census-reset.mjs --apply     # 20 -> 14
createdb clara_w4int
PGHOST=127.0.0.1 PGPORT=55700 PGUSER=postgres PGDATABASE=clara_w4int CLARA_RIG_DB=1 \
  pnpm --filter @clara/db migrate
```

**Result: `309 new migration(s) applied · 309 total`.** Every one of the wave's files took its
FIRST-apply branch: **zero `=REDO`** anywhere in the log. `packages/db/migrations` holds 309 files
and every number appears exactly once, checked across all 309. `CLARA_RIG_ALLOW_RESET` and
`CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

The wave's own files, in chain order:

```
0295 wave4_chart_rows                    chart      0308 deferred_revenue_recognition        lane 04
0296 payroll_summary_typed_facts         lane 01    0309 invite_preview_public_door          lane 05
0297 payroll_summary_posting             lane 01    0310 knowledge_fye_pair_wall             lane 06
0298 payroll_net_pay_settlement          lane 01    0311 firm_setup_tin_required             lane 06
0299 agreement_contract_acquisition      lane 01    0315 prepayment_wake_reroute             lane 04
0300 tenancy_terms_rent_plan             lane 01    0316 create_client_human_grant_withdrawn lane 06
0301 staff_expense_claim_allocations     lane 02    0317 schedule_term_correction            lane 04
0302 accrual_bill_conflict               lane 03    0318 knowledge_fye_pair_applicability    lane 06
0303 accrual_period_amounts              lane 03         (renumbered from 0317)
0304 accrual_revenue_side                lane 03
0305 prepayment_stated_term              lane 04
0306 prepayment_account_roster           lane 04
0307 prepayment_schedule_obo_twin        lane 04
```

**The branch worth quoting**, because it is what lane 03's fix round was filed for. 0302's prestate
is bimodal by design — a recognised pre-image OR a body admitted on its STRUCTURE — because lane
01's four files splice the same `clara.list_review_queue` at LOWER numbers. On the chain it took the
structural branch, verbatim:

```
[notice] #938 prestate: clara.list_review_queue is NOT at this file's pinned pre-image
  (measured 886df580…) -- a sibling lane of the same wave spliced its own arm first. Admitted on
  STRUCTURE: this file's own row kind is absent and both CTE seams are unique.
[notice] #938: ... the ten pre-existing row kinds survive at their EXACT pre-splice marker counts
  and the shared column vector went 15 -> 16 (+1, measured)
```

Lane 01's SPEC-20, lane 02's SPEC-931-E, lane 03's "the true from-scratch chain WITH lane 01's 0297
in it" and lane 04's own owed proof are all discharged by this run.

### The collided bodies, measured on the final chain

| body | value | carries |
|---|---|---|
| `clara.list_review_queue` | `d5456ecc…` | the value the pin ladder's fifth generation carries |
| `clara.create_accounting_plan` | `a7c108d5…` | lane 01's `contract_confirmation` AND lane 04's `revenue_recognition_schedule` |
| `clara._plan_admit_occurrence` | `02ea6afe…` | all three lookups and all three typed reasons — amortisation (0223), accrual (0303), recognition (0308) |
| `clara._authority_ref_refusal` | `55c20b20…` | 0300's post-image, untouched by lane 04 as it promises |

---

## The registry roster, an omission the merge did not cause (`c9968b5fc`)

Found by the release-prep worker reading the integrated tree, and reproduced here before anything
was changed: `packages/runtime/tests/registry-view.test.mjs` gave **6 pass / 1 FAIL** —
*"workflowPins covers exactly the classes the registry dispatches"*, with `agreementFacts` in the
expected list and absent from the actual.

**It is not a merge collision.** Lane 01's #948 imported `agreementFacts_v1` and added
`agreementFacts: agreementFacts_v1` to the `workflows` dispatch table, but not to the three
provenance rosters beside it — the OWN-export list, `workflowBodies` and `workflowPins`. #945 added
`payrollFacts_v1` to all four, in the same lane. The merge changed no line of `registry.ts`, and
the file is byte-identical to lane 01's; this is an omission in the sibling ticket, the second of
its kind this wave after the 0300 corpus pin.

**Why it matters beyond a red cell**, in the file's own words: `workflowBodies` is "this image's
answer to which bodies this process can actually run", and three surfaces read it that must never
disagree — the one boot line in `plugins/startWorld.ts`, `/api/build-info`'s `bodies`/`pins`, and
the rollback preflight. A dispatched body missing from the roster reads to a preflight as one the
image CANNOT run, so a perfectly runnable `agreementFacts_v1` run would have been reported stranded
at a rollback, and the boot line would have printed `bodies=56` with no `agreementFacts=` pin.

Three lines, each beside `payrollFacts_v1`'s own and in the same shape. Nothing else moved: no
workflow body was touched and no freeze policy changed, since both families were already required
to ship by the bundle gate's pin check.

| check | before | after |
|---|---|---|
| `registry-view.test.mjs` | 6 pass / 1 fail | **7 pass / 0 fail** |
| `workflowBodies` | 56 ids | **57**, `agreementFacts_v1` present |
| `workflowPins` | 13 classes | **14**, `agreementFacts` pinned |
| `ready` + `rollback-preflight` + `l9-build-info` + `runtime-contracts` + `registry-view`, with the rig DB env | — | **95 tests · 73 pass · 0 fail · 22 skipped** |

Every one of those 22 skips is *"the WDK world (workflow tables) is not bootstrapped on this
database"* — which RIG.md forbids bootstrapping here (#866: it would red `rig-isolation` T10b).
`ready.test.mjs` and `rollback-preflight.test.mjs` fail outright with NO database target in the
environment, and do so identically with this change stashed; checked, so the environment
requirement is not mistaken for a regression.

---

## Checks on the final head

| check | result |
|---|---|
| conflict markers, whole tree | **clean** |
| migration roster | **309 files, every number exactly once** |
| gate chain | **125 `--import` tokens, none twice**, the wave tail ascending 273 … 317 |
| `packages/db/package.json` + `apps/web/package.json` | both parse |
| **from-scratch chain** | **309 applied / 309 total**, every file on its FIRST-apply branch, zero REDO |
| cluster roles | 14 at the start (0154's census), **20** at the end, the six recreated by 0160/0163/0309 |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | **33 entries, 0 mismatches** against the files on disk |
| `node scripts/check-frozen-workflows.mjs` | **OK — 322 frozen files, 57 `use workflow` modules, 3 retired** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `packages/runtime/tests/registry-view.test.mjs` | **7 pass / 0 fail** |
| `pnpm typecheck` | **exit 0**, both projects |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** (4,686 message keys resolve; 57 contrast pairs all AA) |
| db: `operation-census` + `rig-isolation` (no reset flags) | **33 tests · 32 pass · 0 fail · 1 skip** (the expected T19 poison-role skip) |
| db: the lanes' own batteries, 19 files, full chain | **300 pass / 0 fail** |
| db: the censuses this wave widened, 17 files, full chain | **234 pass / 0 fail** |
| db: the rosters and wave-b contracts, 15 files, full chain | **214 pass / 0 fail** |
| db: lane 07's CI contracts and drills, 8 files | **36 tests · 25 pass · 0 fail · 11 skip** (every skip is a `CLARA_RIG_ALLOW_RESET`-gated destructive drill, which RIG.md forbids here) |
| web: pins corpus + the five e2e censuses + token contrast + focus ring | **110 pass / 0 fail** |
| web: WHOLE unit suite | **5,173 tests · 5,171 pass · 0 fail · 2 skipped** |

**The frozen-manifest counts differ from main's, and that is correct.** Main prints `312 / 55 / 3`;
this branch prints `322 / 57 / 3`. The manifest is append-only against `origin/main`, and the
difference is exactly lane 01's two new frozen workflow families — `payrollFacts.v1` (#945) and
`agreementFacts.v1` (#948), five files each. Diffed entry by entry: **20 added, 0 removed, 0
changed.** No frozen body moved.

**`CLARA_ALLOW_DESTRUCTIVE=1` belongs in the rig env for db runs.** Without it,
`role-census-reset.test.mjs`'s `rcr.apply REFUSES outright while blocked` reds on the destructive
guard rather than on the refusal it pins — a false red, not a defect.

Per the work order, the full runtime and browser suites are the gate workers', not mine. The web
unit suite was run anyway because `needs-you.ts` is where a row-kind collision hides.

---

## What the gate workers inherit

1. **The chain is proven from scratch on this exact head.** `fb1dae78a` carries the migrations the
   chain ran; the only commit after that run touched a test file. `clara_w4int` on `rigw4` (55700)
   stands at 309/309 if it is useful; `rigw4h` (55701, the hosted baseline at 288/0293) and `rigw4c`
   (55702, the collation stand-in) were never touched.
2. **A cluster that has run one chain needs the #867 recipe before a second.** Six roles minted
   after 0154 survive a `drop database`, and 0154 pins the count at 14.
   `scripts/role-census-reset.mjs --apply` is the documented remedy and was used twice here without
   widening anything.
3. **Watch the four cross-lane bodies.** They agree today because four `fix(integration)` commits
   made them agree; each carries its reason in the file. `clara.list_review_queue` now has six
   splices from two lanes and a five-generation pin ladder in `firm-portfolio-pack.test.mjs`, the
   top rung gated on `accrual_revenue_side$`.
4. **`needs-you.ts` is at SIXTEEN row kinds.** A seventeenth is a union at the end of the array plus
   the header count, the links map, the affordance registry, the two `en.json` maps (with `unknown`
   staying last) and the two db-side `FULL_ROW_KEYS` rosters — the file's own extension-point list.
5. **The `chatTurn_v22` / `claraWork_v6` cut owes these successor contracts**, named by their lanes
   and unchanged by this pass: #949's and #947's settlement-door envelopes (they now return
   `status`, so a caller reading success from the absence of an error would tell a person a
   settlement landed when it is a draft awaiting a checker), #931's §§1–10, #937's and #942's
   together on the same `p_accrual` jsonb, #933's corrected contract, and #941's web
   correction-control seam.

---

## The five lessons this wave paid for

1. **A lane can be green and still be wrong about a body another lane owns.** Two of the four
   collisions were silent losses that no cell on either branch would have caught. The only things
   that found them were reading the two files against each other and a from-scratch chain.
2. **Pin what is live, and say which rig you measured on.** Every collision here traces to a lane
   measuring a pin on a rig that lacked a sibling lane's migration. The lane reports that named the
   rig made the integration fast; the ones that did not cost a chain run each.
3. **The orchestrator assigns overflow numbers; a fix worker never picks one.** Two fix rounds each
   took "the next free number in the overflow block" and both landed on 0317 — the same failure
   wave 3 met at 0280/0281, one level down.
4. **A disclosed residual is only safe when nothing measures it.** `_obo_plan_core`'s wall was
   disclosed and left; the other lane's own parity cells then failed on it.
5. **A renumber reaches inside the bodies a migration installs.** 0318 carries its own number in
   markers that sit in its pasted text, so renaming the file moved three installed bodies and the
   one test that pins them. Grep the installed text, not only the file's prose.

---

*(Complete. The gate workers take over on `fb1dae78a3db2c29025fb82c4c79cde89197f354`.)*
