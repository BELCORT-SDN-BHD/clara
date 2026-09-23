# Wave 3, lane 07, ticket #1012 — retire the prior-GL seeding lane

Branch `riders/w3-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\657`, database `clara_l07`
(127.0.0.1:55747), base `ffe63a0dd084e99b84c1368119845be273c421ce`.

**Status: done.** All eight acceptance criteria have evidence below; one is delegated by RIG.md
(the from-scratch chain is the integrator's, on a disposable cluster).

## Commits (this ticket only; #899's three sit below them on the branch)

| sha | message |
|---|---|
| `9d627e883` | `feat(db): #1012 the prior-GL seeding lane answers a typed retirement` |
| `9c5c7d3b2` | `feat(db): #1012 the review queue stops chasing a decision nobody can make` |
| `02b6b2604` | `feat(runtime): #1012 the seeding-prepare route is gone, the replay lane is not` |
| `cf36ccaf7` | `feat(web): #1012 the seeding panel goes read-only and the needs-you row is gone` |
| `914a9a4f2` | `feat(db): #1012 the capability registry states the retirement, not an absent entrance` |
| `fc6c676d0` | `test: #1012 the three catalogue censuses 0288 and 0287 move` |
| `104e73339` | `test(db): #1012 history reads back through a real session, and 0288 rewrites none of it` |
| `15c1fdfba` | `docs(web): #1012 ReportsPage names the retired deep link it used to anchor` |

Verified live before building: `gh issue view 1012 --comments` — OPEN, `enhancement` +
`ready-for-agent`, **zero comments**, so the body's Agent Brief is the newest and the whole
contract. Nothing on the branch had retired the lane: `clara.create_seeding_batch` created batches,
`POST /api/seeding/prepare` was mounted, `SeedingBatchesPanel` rendered Tick and Decline, and
`clara.list_review_queue` emitted `seeding_proposal`. All four measured before the first commit.

## The seams I tested at

From the brief's own "Key interfaces", written down before the first test:

1. `clara.create_seeding_batch(uuid,uuid,jsonb,text)` — driven through the **runtime** lane
   (`roleQuery(ROLES.runtime, …)`), on a filed, verified, `prior_gl`-stamped document it would
   have accepted.
2. `clara.tick_seeding_proposal(uuid,text)` and `clara.decline_seeding_proposal(uuid,text,text)` —
   driven through `humanQuery` as a real **admin**, the exact floor both doors used to enforce.
3. `clara.cancel_seeding_batch(uuid,text,text)` and `clara.complete_seeding_batch(uuid,text)` —
   driven for real on a batch left open at the retirement.
4. `clara.list_review_queue(jsonb,jsonb,integer)` — driven through the canonical
   `listReviewQueue(humanPersona(...))` read, firm-wide and client-scoped.
5. The RLS **table reads** of `clara.seeding_batches` / `clara.seeding_proposals` — driven through
   a real per-role session, and cross-firm.
6. `clara.document_capabilities` — read back as rows.
7. `packages/runtime/lib/seeding-parse.mjs`'s `prepareSeeding` and `mapSeedingDbError`, and the
   mounted route set in `packages/runtime/src/index.ts`.
8. `packages/runtime/lib/wiki-projection.mjs`'s `seeding.proposal_decided` lane, driven through
   `runWikiProjectionCycle`.
9. The rendered `SeedingBatchesPanel`, and `apps/web/lib/reports/api.ts`'s export surface.

## Migration

`packages/db/migrations/0288_seeding_lane_retired.sql` (the number reserved for this ticket; used).
Four sections plus a tail: §B the three typed refusals, §C the queue splice, §D the registry
republication, §E the tail and its forced-rollback behavioural probe.

### Prestate pins, MEASURED on `clara_l07` on 2026-09-23, after #899 (0287) applied

**Bimodal** (first apply = the sha; redo = the body already carries `seeding_lane_retired`):

| signature | sha256(prosrc) |
|---|---|
| `clara.create_seeding_batch(uuid,uuid,jsonb,text)` | `cb71109bcb19774b0b9a3cc1ab1c7df308d50f852aa71641e9ba34ec9ddca4b6` |
| `clara.tick_seeding_proposal(uuid,text)` | `17830ded558b0ffcd62b88ada6dab9684dc3ac001589aace557602fd5079084b` |
| `clara.decline_seeding_proposal(uuid,text,text)` | `3cbf7183bde1a411aab8541f3b30d96390cc1f451f887fd17ca7c0196871ad33` |

**Hard, single-valued** (bodies this file must not move, or must splice exactly once):

| signature | sha256(prosrc) | why pinned |
|---|---|---|
| `clara.cancel_seeding_batch(uuid,text,text)` | `0b655b1a5d23920593ae3f41dd8942c0bfaa1cdc7a89daba64eaf50a2ac7eba5` | must not move; re-pinned in the tail |
| `clara.complete_seeding_batch(uuid,text)` | `96a62e0c02387980629ce40ffea06d4a2d4a66dbefb888dac2059e12679bf7ba` | must not move; re-pinned in the tail |
| `clara.list_review_queue(jsonb,jsonb,integer)` | `1641f99f4d295400bd39bd7b2cee3ac4cac2c34e7478078014e7305d99d9b570` | §C's splice pre-image (first apply only) |
| `clara._tf_document_capabilities_version_monotone()` | `170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56` | §D's raise rides it |
| `clara._tf_document_capabilities_version_high_water()` | `b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9` | §D's raise rides it |
| `clara._tf_document_capabilities_high_water_record()` | `839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d` | §D's raise rides it |
| `clara._tf_document_capability_high_water_monotone()` | `62e83a3b249ca1d0186041ac36c6f77615f3631b04d96eb57fc16f010974ec8c` | §D's raise rides it — **0272's post-image**, not 0245's pin |
| `clara._tf_document_capabilities_version_uniform()` | `d21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776` | §D's raise rides it |

> **For the integrator:** `clara.list_review_queue` is the pin most likely to be recut by another
> lane this wave (0260 recut it last wave). `clara._tf_document_capability_high_water_monotone`
> already differs from 0245's published pin because 0272 recut it — I re-measured rather than
> copied. §D's registry version is NOT pinned: it asserts uniformity and a floor (`>= 3`),
> remembers what it measured and asserts measured + 1, exactly as #1012's sequencing note asks,
> so a sibling lane republishing first simply moves both numbers together.

### Redo, and the first-apply branch

Redone four times through `CLARA_MIGRATION_REDO=0288_seeding_lane_retired` while building §C, §D
and two fixes, always the highest applied version, always with `CLARA_ALLOW_DESTRUCTIVE=1` and
`CLARA_RIG_DB=1`. Final state: `redid 0288_seeding_lane_retired · new checksum
6b6c5d031e2fe33de52c935befe35a4efcc8c4e321b53c4c2943f99ca34857bc`, 269 migration files applied.

The wave-3 addendum warns that `CLARA_MIGRATION_REDO` only ever takes the "my own body is already
live" branch. **I proved the FIRST-APPLY branch for real, not by reasoning**: during the vacuity
control (below) I restored all three pre-images byte for byte from `pg_get_functiondef` dumps —
the re-measured shas came back exactly `cb71109b…`, `17830ded…`, `3cbf7183…`, matching the pins —
and then re-ran the file, whose §A took the pinned-sha arm and printed
`#1012 prestate: OK`. §C and §D each print their own REDO notice when their effects are already
live, so a redo never double-cuts the queue or raises the registry version twice.

### Vacuity control

Before the three refusal cells were accepted I broke the subject deliberately: the three
pre-image bodies were restored and `clara.complete_seeding_batch` was replaced by a bare
`raise 'DELIBERATE BREAK'`. All three cells went red for the right reasons —
`expected SQLSTATE CLR34 but the call SUCCEEDED (no error)` twice, and
`DELIBERATE BREAK for the #1012 vacuity control` once. The subject was then restored (complete's
sha back to `96a62e0c…`) and the file re-applied; all three went green. The queue cell and the
registry cell were each seen red against the live estate before their section existed
(`2 !== 0` seeding rows; `7 row(s) carry limits.browser_entrance`).

## Acceptance criteria, with evidence

**AC1 — a new migration turns create/tick/decline into a typed refusal; its prestate pins each
current body and refuses to apply if any has changed.**
`0288` §A pins all three (table above) and raises `CLR10 … has DRIFTED from its measured
pre-image` otherwise; §B recuts all three to one sentence, `CLR34`,
`detail.reason = "seeding_lane_retired"`. §E asserts the literal sentence, the code and the reason
on each body, and that none of them still contains `_reserve_op`, `_finish_op`, `_human_ctx`,
`_append_event`, `_audit` or `insert into`.
Behaviour: `seeding-lane-retired.test.mjs` `p1012.create.retired_refusal_writes_nothing` and
`p1012.deciders.retired_refusal_leaves_the_proposal_open` — PASS. The creator refuses with the
typed reason and leaves no batch, no `clara.op_receipts` row and no `seeding.batch_created` event;
both deciders refuse with a byte-identical message, leave both proposals `proposed` with
`decided_by`/`decided_at`/`decision_reason` still null, reserve nothing and append no
`seeding.proposal_decided`. The creator is still runtime-only: an authenticated caller meets
`42501`, not the new body.

**AC2 — the cancel and complete doors and every read of a batch or proposal are proven unchanged
against their pinned pre-migration shape.**
Bodies: §A and §E both pin `cancel`/`complete` at the shas above; a drift is `CLR10`.
Behaviour: `p1012.closers.cancel_and_complete_still_close_a_batch_left_open` — PASS. On two
planted pre-retirement batches, cancel returns `{status:"cancelled"}` and records the reason
verbatim; complete returns `{status:"completed"}` and derives `stats.still_proposed = 1` from the
proposal nobody can decide any more. Both batches keep their proposal rows, still `proposed`.
Reads: `p1012.reads.history_stays_readable_and_firm_scoped` — PASS. A planted batch and its two
proposals read back through a REAL per-role session under real RLS with state, source binding,
kind, key and payload intact; firm B's owner reads none of it. The structural half is on the
migration's own text: it contains no `update`/`delete` against either relation, so history is not
rewritten by construction rather than by counting rows.

**AC3 — a census names every consumer of these doors and of the proposal relations, and each is
updated to the retired shape or shown to need no change.**
The census (grep over `apps/`, `packages/` for the five door names, the two relation names and
`seeding/prepare`) and its disposition:

| consumer | disposition |
|---|---|
| `packages/runtime/src/seedingRoutes.ts` + its mount in `src/index.ts` | **DELETED** |
| `packages/runtime/lib/seeding-parse.mjs` — `prepareSeeding` | Kept, uncalled; its last step now meets the retirement |
| `packages/runtime/lib/seeding-parse.mjs` — `mapSeedingDbError` | **UPDATED**: `seeding_lane_retired` → 410 Gone with the reason and message verbatim |
| `packages/runtime/lib/wiki-projection.mjs` | **NO CHANGE NEEDED** — it consumes the decided EVENT, and historical events must still replay (AC6) |
| `apps/web/lib/reports/api.ts` | **UPDATED**: `tickSeedingProposal` / `declineSeedingProposal` removed; both closers and both reads kept |
| `apps/web/components/reports/SeedingBatchesPanel.tsx` | **UPDATED**: read-only, retirement notice, closers kept |
| `apps/web/components/firm/seeding-proposal-affordance.tsx` | **DELETED** |
| `apps/web/components/firm/needs-you-affordances.tsx`, `lib/firm/needs-you.ts`, `messages/en.json` | **UPDATED**: the row kind, its registry entry and its two strings are gone |
| `packages/db/tests/wave-b/wb-s-seeding.test.mjs` | **RECUT** (five surviving cells; seven named as lost, with why) |
| `packages/db/tests/ninth-rowkind-seeding-proposal.test.mjs` | **RECUT** to the row kind's retirement |
| `packages/db/tests/wave-b/wb-x-crossfirm.test.mjs` | **RECUT**: batch planted; tick/decline/create moved out of the CLR11 and CLR02 batteries into their own retirement asserts, receipts sweep unchanged |
| `packages/db/tests/wave-b/wb-g-opkeys.test.mjs` | **RECUT**: the three doors move to `EXEMPT` + `RESERVE_LAW_EXEMPT` (a door with one refusal and no reservation has no payload for the G4 hash law to move) |
| `packages/db/tests/rig-meta.mjs` | **COMMENT ONLY** — the grant matrix is unchanged BY DESIGN and the comment records why |
| `packages/db/tests/opening-ledger-source.test.mjs`, `document-capability-registry.test.mjs`, `firm-portfolio-pack.test.mjs`, `x42-s5-helpers.mjs`, `apps/web/tests/firm-scope-db-pins.corpus.ts` | **UPDATED** — five censuses that pin what 0288 moved |
| `packages/db/tests/wave-b/wb-g-tail.test.mjs`, `counterparty-identity.test.mjs`, `counterparty-alias-kind.test.mjs`, `depreciation-authority-pending-rowkind.test.mjs` | **NO CHANGE NEEDED** — each mentions a seeding name in prose or asserts something the recut preserves; all re-run green |
| `packages/db/deploy/wave-b-w2-authority-boundary-audit.sql` | **NO CHANGE NEEDED** — an audit script asserting no authority function reaches wiki state; still true |

**AC4 — the review-queue read emits no seeding row for any client, including one with open
proposals, and the other row kinds are unchanged.**
`p1012.queue.no_seeding_row_even_for_a_client_with_open_proposals` — PASS: a client with TWO open
proposals in an OPEN batch produces zero `seeding_proposal` rows firm-wide and client-scoped, with
an open question on a sibling client as the positive control.
`ninth-rowkind-seeding-proposal.test.mjs` cell 1 — PASS: the 0/1 differential recast (no client
produces the row), with the proposals still readable afterwards.
Cell 2 — PASS: the eight surviving kinds this file's fixtures can produce are each OBSERVED by
name at the **unchanged 31-key** row shape, and the three seeding-only columns are null on EVERY
row. The other two survivors (`work_question`, `depreciation_authority_pending`) keep their own
batteries; `work-question-reads.test.mjs` and `depreciation-authority-pending-rowkind.test.mjs`
both re-run green.
§C's own postcheck asserts the ten survivors at their exact pre-splice marker counts, the removed
kind's marker at zero, and the shared column vector unmoved at 10.

**AC5 — the seeding affordance component is gone and the client offers no control calling the
create, tick or decline doors; remaining history is read-only with a retirement notice.**
`apps/web/components/reports/seeding-batches-retired.test.tsx` (new, three cells, all PASS):
an OPEN proposal in an OPEN batch renders with its kind and payload and carries **no** `Tick` and
**no** `Decline` button (asserted over every rendered `<button>` label, not the first match), the
panel text matches `/retired/i`, both closers still render, and a census over
`lib/reports/api.ts`'s exports proves no `tickSeedingProposal` / `declineSeedingProposal` /
`createSeedingBatch` and both closers plus both reads present.
`apps/web/components/firm/seeding-proposal-affordance.tsx` is deleted; `needs-you-affordances.test.ts`
now asserts `getNeedsYouAffordance("seeding_proposal") === undefined`.

**AC6 — the projection worker still replays a historical decided event successfully after the
migration.**
`packages/runtime/tests/wave-b-seeding-prepare.test.mjs`'s replay cell — PASS. It plants the exact
pre-retirement state (a completed batch, a `ticked` `wiki_fact` proposal with its
`payload.wiki` and `evidence.line_cites`) and appends the decided event through
`clara._append_event` in the shape `tick_seeding_proposal` emitted before 0288 recut it, then
drains `runWikiProjectionCycle`. The page is published: `synthesis = deterministic`,
`engine_id = null`, content verbatim, and every citation `source_kind = 'prior_gl_line'` naming the
source document. `packages/runtime/lib/wiki-projection.mjs` is byte-unchanged.

**AC7 — the registry rows carry a basis and limits stating the retirement, with the
business-operation level unchanged and the registry version increased.**
`p1012.registry.prior_gl_rows_state_the_retirement_not_an_absent_entrance` — PASS. Exactly the
seven formats `seeding-parse.mjs` has a reader for (heic/jpeg/pdf/png/tiff/webp/xlsx) carry
`limits.seeding_lane = "retired"` with
`seeding_lane_reason = "client_kb_replaces_manual_pre_registration"`; no row anywhere still carries
`browser_entrance`; each basis says `RETIRED`, names `0288_seeding_lane_retired.sql` and no longer
carries "NO BROWSER ENTRANCE EXISTS YET"; all twelve `prior_gl` rows keep
`business_operation = stored_only` and their own `typed_facts`; the registry publishes ONE version
(4 on this rig, up from #782's 3) across 240 rows, and every high-water mark rose with it.
`document-capability-registry.test.mjs` (22 cells) and `opening-ledger-source.test.mjs`'s
`p656.registry.*` both re-run green against the republished rows.

**AC8 — the migration applies cleanly on a from-scratch chain, and pre-existing batches and
proposals stay readable with unchanged values.**
Second half: `p1012.reads.*` above, plus §A/§E counting the lane's history before and after (57
batches / 127 proposals on this rig at the last redo, none deleted).
First half — **not run by me.** RIG.md reserves the from-scratch chain for the integrator on a
disposable cluster, and forbids a second from-scratch chain on a lane cluster (0154 pins the
cluster-wide role count). What I can offer instead: 0288 applied cleanly as file 269 on a database
migrated 0001 → 0272 from scratch and then 0287, and its own §A refuses rather than adapts if any
premise is missing.

## Gates, with counts

Every db run below preloads the FULL gate chain (86 `--import` flags taken from
`packages/db/package.json`'s `test` script); `CLARA_RIG_ALLOW_RESET` and
`CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

| gate | result |
|---|---|
| `seeding-lane-retired.test.mjs` (new) | **6/6 pass** |
| `ninth-rowkind-seeding-proposal.test.mjs` (recut) | **2/2 pass** |
| `wb-s-seeding` + `wb-x-crossfirm` + `wb-g-opkeys` + `wb-g-tail` | **22/22 pass**, 0 skipped |
| `firm-portfolio-pack.test.mjs` | **17/17 pass** |
| `opening-ledger-source` + `document-capability-registry` | **35/35 pass, 0 skipped** (the first file had been silently SKIPPING — see follow-ups) |
| `x42b2-r7-s5-clock` + `x42b2-s5c-clock` | **4/4 pass** |
| `x41-wave-d-a-fa` + `fixed-asset-acquisition` | **36/36 pass** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs` | **33 tests, 32 pass, 1 skip, 0 fail** (the skip is T19's destructive poison-role drill — the reset flag is correctly never set) |
| FULL db suite (`pnpm test` in `packages/db`) | see "the full db suite, and why only its FIRST run is readable" below |
| `packages/runtime`: `wave-b-seeding-prepare.test.mjs` | **23/23 pass** |
| `packages/runtime`: `wave-b-wiki-projection-unit` + `wave-b-prior-gl-cells` + `wave-b-0019-filing-retired` | **70/70 pass** |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, 55 `use workflow` modules, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `apps/web`: WHOLE unit suite (`node scripts/run-tests.mjs`) | **4847 tests, 4844 pass, 1 fail, 2 skip** — the one fail is `documents-workbench-refresh.test.tsx` "[633] an UNSETTLED receipt keeps a bounded watch", a poll-timing cell unrelated to this ticket: it PASSED in the earlier whole-suite run and passes **9/9 alone**; it went red only while the db suite was running concurrently. The 2 skips are pre-existing. |
| `apps/web`: `firm-scope-db-pins.test.ts` | **22/22 pass** |
| `apps/web`: `check-message-keys.mjs` | 4310 static keys all resolve |
| `apps/web`: `check-test-manifest.mjs` | 503 test files, alphabetical, all present once |
| `node scripts/check-dead-citations.mjs` | clean |
| `pnpm typecheck` (root) | **exit 0** — `apps/web` and `packages/runtime` both Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root, the wave-3 addendum's runner shape) | **exit 0** |

**Browser walks: none touched.** I changed no `apps/web/e2e/*.spec.ts`. A grep of `apps/web/e2e`
for `seeding`, `SeedingBatches` and `seeding_proposal` returns only two unrelated prose matches
(`journal-work-walk.spec.ts` uses "seeding" to mean test setup), so no walk drives the panel or
the retired row kind. I therefore ran no walk, rather than reporting one I did not run.

### The full db suite, and why only its FIRST run is readable

`packages/db/tests/README.md`, "Freshness and split chains": *"A fresh database per full run is
the reliable default. Some tests prove one-way evaluator deployment or append-only reference
seeds; reusing their database cannot reproduce the initial state. `CLARA_ESTATE_REUSED_DB=1`
acknowledges reuse for tests that support it; it does not make every test repeatable."* I learned
this the expensive way: my SECOND and THIRD full-suite runs on `clara_l07` carry dozens of reds
that are pure re-run artifacts, and they say so themselves —
`f-a5-reporting-agency-pr1.test.mjs` cell D: *"evaluate_fs_pack_agent v1 is already deployed but
CLARA_ESTATE_REUSED_DB is not set to '1' — either this database is not actually fresh … or the
reuse is deliberate"*, and `f-a5b-sandbox-export-pr1.test.mjs`: `sandbox_watermark rows=5/3`. The
evaluator ceremony is ONE-WAY, so a lane database can never be returned to its fresh shape; all
eight registered closures now read `deployed = true` on `clara_l07`, where a fresh chain has five.
**This is rig state I created by re-running the suite, not a change #1012 made to the estate**, and
it does not reach CI or the integrator's from-scratch chain, both of which start fresh.

Run 1 — the only run against the freshly seeded lane database, taken mid-ticket before the last
four fixes: 5391 tests, 5277 pass, **7 fail**, 107 skipped. Every one of the seven is accounted
for, and each was individually re-verified green afterwards with the full gate chain:

| cell | cause | disposition |
|---|---|---|
| `p659.portfolio.no_recut` | 0288 §C moves `list_review_queue`'s pinned sha | pin re-based with its reason; 17/17 green |
| `p1012.registry.…` | my own cell, written before §D existed | green after §D |
| `x42.r7.s5c.5` and `x42.s5c.6` | the bare-clock-token roster: 0288's three refusals stamp no timestamp, AND #899's 0287 moved `begin_client_onboarding`'s body into `_client_birth_core` | both deltas gated on their migration stem; 4/4 green |
| `x41.b2` | **#899 residue** — the birth wall refuses a third client of one name family, and `freshEnrolledFaClient` gave every client the same leading token | unique token now leads, in the helper; 36/36 green |
| `sbm.3` (`sandbox-marker.test.mjs`) | **#899 residue, NOT fixed** — see follow-up 1 | reported, not fixed |
| (the 7th is the file-level rollup of `seeding-lane-retired.test.mjs`, i.e. its `EXPECTED_CELLS` guard, not a separate defect) | — | — |

Runs 2 and 3 were stopped and discarded once the reuse artefact was understood (run 2 had also
overlapped a `CLARA_MIGRATION_REDO`, so it read a moving database and was worthless either way).

**Run 4**, with `CLARA_ESTATE_REUSED_DB=1` set to acknowledge the reuse, ran to completion:
**5391 tests, 5238 pass, 61 fail, 92 skipped.** The discriminating fact: **not one of the 61 is in
a file this ticket owns or touched.** Grouped by file, with the cause read from each:

| file | fails | cause |
|---|---|---|
| `f-a5b-sandbox-export-pr1.test.mjs` | 55 | ONE readiness-hook failure cascading through the file: `F-A5b PR-1 DRIFT: … sandbox_watermark rows=6/3` — an append-only reference seed that gains one row per full-suite run |
| `f-t1-sst-reference.test.mjs` | 2 | `sst_rate_schedule carries exactly 10 seed rows (got 12)` — the same class |
| `delta-catalog-phase.mjs` + `delta-contract.test.mjs` (its rollup) | 2 | the ONE-WAY evaluator ceremony: `verified_deployed` reads 8, the census expects 7, because an earlier run deployed `prepayment_schedule` v1, which "ships DARK" and is deliberately excluded from that census. Irreversible by design |
| `intake-batch.test.mjs` | 1 | `p636.batch.sweep_settles` — "the cancelling parent is on the worklist", a worklist carrying earlier runs' batches |
| `sandbox-marker.test.mjs` | 1 | **the only one that is NOT a reuse artefact** — #899's `0287` quotes `"rig_"` in two comments. See follow-up 1 |

Every file #1012 added or touched was additionally run on its own with the full gate chain, and
every one is green — those counts are in the table above, not inferred from this sweep.

## Docs

- `packages/db/README.md` — new section "0288 — the prior-GL seeding lane is retired (ticket
  1012)" (the four sections, why a refusal and not a drop, why the refusal is the whole body, what
  survives, the splice and its named residual, why the whole registry's version rises, and the
  redo/bimodal argument). The 0228 paragraph that stated `{"browser_entrance":"absent"}` as
  current is corrected in place and points forward.
- `packages/db/tests/README.md` — new section for `seeding-lane-retired.test.mjs` (all six cells,
  the "history is planted, not minted" posture, and what `ninth-rowkind-seeding-proposal.test.mjs`
  and `wb-s-seeding.test.mjs` own now).
- `packages/runtime/README.md` — new section "The prior-GL seeding lane is retired"; the rollback
  paragraph that cited `lib/seeding-parse.mjs` as a live caller of
  `get_document_for_human_read` v1 is corrected without changing its conclusion.
- `apps/web/README.md` — new section covering the read-only panel, the surviving closers, the
  removed row kind and the three `ReviewQueueRow` fields that deliberately stay.
- **`CONTEXT.md` — not touched, deliberately.** The retirement coins no domain term. `Opening
  source` still describes the prior general ledger a firm receives, and the `business operation`
  entry's existing note that `prior_gl` "stays `stored_only` by owner ruling, pending the Client
  Knowledge Base's own prior-GL ingestion path" is exactly what 0288 makes true rather than
  something it changes.
- Shared files, minimal hunks at the sorted position: `packages/db/package.json` (one gate-chain
  entry after `client-birth-wall`), `apps/web/test/manifest.txt` (one line),
  `apps/web/messages/en.json` (three surgical edits, no reformat), `packages/db/tests/rig-meta.mjs`
  (comment only — see below).

### `rig-meta.mjs`, and why the grant matrix does not move

The lane prompt expected both #899 and #1012 to edit the WRITERS grant-matrix census. **#1012's
hunk is a comment, and that is the finding, not an omission.** A retired door must answer a TYPED
REFUSAL to the caller who could reach it yesterday, and that is only possible while that caller can
still reach it: a revoked grant answers `42501 insufficient_privilege`, which is the wrong sentence
and the wrong shape for the web layer's refusal mapping. So no grant moves, the matrix is unchanged
by design, and the two hunks (`WAVE_B_HUMAN_FNS`, `WAVE_B_RUNTIME_FNS`) record why, so the next
reader does not mistake three live grants on refusing doors for an oversight.

## Successor contract

**None is owed.** No frozen workflow body and no frozen closure module calls any of the five
seeding doors or the retired route: a grep of `packages/runtime/workflows` for
`seeding_batch` / `seeding_proposal` / `api/seeding` returns nothing, and
`check-frozen-workflows.mjs` shows no manifest diff after the change.
`parts-parity-exemptions.mjs` pins `seeding-parse.mjs`'s `regionsToEntries`, which this ticket does
not touch; `check-parts-parity.mjs` is green.

For a future surface that must render the retirement, the contract is:

- **Refusal, at the DB seam:** SQLSTATE `CLR34`, `detail.reason = "seeding_lane_retired"`,
  message: *"the prior-GL seeding lane is retired: Clara learns a client's counterparties and
  coding from the source itself, so no seeding batch, tick or decline is accepted; existing
  batches stay readable and can still be cancelled or completed."* Identical on all three doors.
- **Refusal, at the HTTP seam:** `mapSeedingDbError` →
  `{ http: 410, body: { status: "retired", reason: "seeding_lane_retired", message } }`. 410 Gone,
  never 409 or 422 — a caller must not read it as "retry" or "fix the source".
- **Still callable, unchanged:** `clara.cancel_seeding_batch(p_batch, p_reason, p_op_key)` and
  `clara.complete_seeding_batch(p_batch, p_op_key)`, admin+, in that argument order;
  `apps/web/lib/reports/api.ts` keeps `cancelSeedingBatch({batchId, reason})`,
  `completeSeedingBatch(batchId)`, `listSeedingBatches(clientId)`, `listSeedingProposals(clientId)`.
- **Registry limit shape:** `limits.seeding_lane = "retired"`,
  `limits.seeding_lane_reason = "client_kb_replaces_manual_pre_registration"` (the two-key shape
  0245 set). `limits.browser_entrance` no longer exists anywhere.
- **Message key:** `ReportsSnapshotsSeeding.seeding.retiredNotice`.
- No new part kind and no prompt stanza: nothing about this retirement reaches a model.

## Follow-ups worth filing

1. **`sbm.3` is RED on this branch and I did not fix it.** `sandbox-marker.test.mjs`'s census
   ("no production source reads the sandbox marker") now finds two hits, both in #899's
   `0287_client_birth_wall.sql` (lines 58 and 77), which quote the rig's `"rig_"` prefix in
   COMMENTS. The work order forbids editing an applied migration or another ticket's new
   migration, and the only other routes are weakening the census or exempting a migration by name
   — both worse than reporting it. It needs #899's own fix round, or a successor migration whose
   comment re-words the two lines. **The integrator should not treat this as a #1012 red.**
2. **`opening-ledger-source.test.mjs` had been silently skipping since #782 (0245).** Its gate
   skips the WHOLE file when `PUBLISHED_REGISTRY_VERSION` does not match the live registry, and
   0245 raised the registry past its constant without re-basing it — so a stale number retires a
   battery instead of redding it. I re-based it (and 0288's own raise) and added a comment saying
   so, and un-skipping it revealed eight #899 name-family failures I then fixed. **The class is
   worth a ticket**: a frontier gate keyed on a MUTABLE published value fails open. Every other
   battery here keys on a migration STEM, which cannot drift this way.
3. **#899's name-family residue may not be exhausted.** I fixed the three places the suite
   actually redded (`opening-ledger-source.test.mjs`, `x41-fa-world.mjs`,
   `x41-wave-d-a-fa.test.mjs`). Any fixture that passes an explicit client name whose FIRST
   alphanumeric token is shared across three or more clients in one firm will refuse. A cheap
   sweep would be: grep for `onboardingClient(` with a template-literal name and check the leading
   token.
4. **`prepareSeeding` is a kept-but-uncalled writer.** Its read half is what the Client KB lane
   inherits (#663), which is why it survives; but a body whose last step can only be refused is
   the decoy 0271's header argues against. When #663 lands, that composition should either move to
   the Client KB lane or go.
5. **A lane database cannot be re-run through the full db suite.** The one-way evaluator
   ceremony and the append-only reference seeds mean run 2 onward carry reds that say nothing
   about the code, and `CLARA_ESTATE_REUSED_DB=1` "does not make every test repeatable" by the
   estate's own words. The wave's RIG.md tells a lane how to run ONE from-scratch chain but says
   nothing about the full suite being single-shot; a line there would have saved this ticket
   roughly an hour of wall time, and would stop a later lane reporting a wall of false reds.
6. **Three dead columns in the review-queue envelope.** `client_name`, `batch_ids` and
   `open_proposal_count` are now null on every row. Dropping them is a ten-CTE recut of a body ten
   row kinds share plus two pinned rosters and a web type; worth doing the next time that body is
   recut for another reason, not on its own.

## Anything unverified

- **The from-scratch chain.** I did not run `0001 → 0288` from scratch; RIG.md reserves it for the
  integrator on a disposable cluster and forbids a second chain on a lane cluster.
- **The runner's own re-run of new runtime test files under WSL as `runner`.** RIG.md gives that
  to the integrator. I ran `CI=true GITHUB_ACTIONS=true pnpm lint` (exit 0) as the wave-3 addendum
  requires, and no test I added reaches the spool or depends on a Windows path.
- **The one web-suite failure** (`documents-workbench-refresh.test.tsx`) is reported as a
  contention flake on the evidence that it passed in the earlier whole-suite run and passes 9/9
  alone. I did not root-cause it; it touches nothing this ticket changed.
- **`wb-fixtures.mjs`'s wave-b siblings.** I re-ran the four wave-b files this ticket touches plus
  `wb-g-tail`; the rest are covered by the full db suite rather than individually.
- The claim that `0287`'s two `"rig_"` hits pre-date my work rests on the fact that 0287 landed in
  `df415469f`, below my first commit, and on the text being 0287's own comments — I did not
  re-run the suite at the base commit to observe the red there.
