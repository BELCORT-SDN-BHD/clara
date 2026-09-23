# Riders wave 3 — integration merge, pass 1

**Worktree** `C:\Users\zhant\Desktop\clara-wt\int2` · **branch** `integration/riders-w3`
**Cut from** `origin/main` `d96a33f31` (waves 1 and 2, migrations through 0272)
**Lane base** `ffe63a0dd084e99b84c1368119845be273c421ce` (an ancestor of main)
**New head** `a7ad924181a6322e8c10aa47ddca8207d85bdc4d`
(eight merge commits through `d5b341141`, then one integration fix — the lane-04 renumber, below)
**Diff vs main** 225 files changed, ~29,061 insertions, ~2,002 deletions

Eight lanes landed, one merge commit each, in the ordered pass: 01, 02, 03, 04, 06, 08, 10, 11.
Lanes 05, 07 and 09 were NOT merged and were not touched; a second pass lands them.

| lane | tickets | migrations | merge commit | lane head merged |
|---|---|---|---|---|
| 01 | #890 #921 | 0273 | `5abe5367a` | `adf980b08` |
| 02 | #982 #1007 | 0274 0275 | `05d689f36` | `342287c71` |
| 03 | #958 #1001 #1002 | 0276 | `d1aa344cc` | `b9fe230d7` |
| 04 | #932 #882 #975 #978 | 0277 0278 0279 **0292 0293** (merged as 0280/0281, renumbered — below) | `d8bdece73` | `a3e9f5d37` |
| 06 | #936 #919 #986 | 0284 0285 0286 | `2d591a54d` | `209bc3cfb` |
| 08 | #857 #990 #1019 #1020 | 0290 0291 | `c26cf4507` | `7fbb0beee` |
| 10 | #1015 #1016 #1018 #1023 #1028 | — | `c4d1cd807` | `c3cb533db` |
| 11 | #1024 #897 #1021 #1022 | — | `d5b341141` | `482c247c7` |

Nothing was stopped on. No `--abort`, no whole-side pick, no push, no GitHub write, no lane branch
or worktree touched.

---

## Per-lane resolutions

### Lane 01 (#890, #921 — migration 0273)

**No conflicts.** Git auto-merged `packages/db/README.md`, `packages/db/package.json`,
`packages/db/tests/rig-meta.mjs`, `apps/web/messages/en.json` and `apps/web/test/manifest.txt`.

Verified rather than assumed:

- the gate chain ends `… retire-create-account-set (0272) → vendor-binding-write-doors-revoked
  (0273)` — the new gate landed last, which is where 0273 belongs.
- `apps/web/messages/en.json`'s eleven **deletions** (`vendorBindings.signTrigger`,
  `.signTitle`, `.signDescription`, `.proposeTrigger`, `.proposeTitle`, `.proposeDescription`,
  `.counterpartyLabel`, `.counterpartyPlaceholder`, `.counterpartyNoneYet`,
  `.counterpartiesLoading`, plus the rewritten `.pageDescription`) are #921's own intent — the
  Propose and Sign controls are retired, so their strings go with them. Not a merge loss.
- `rig-meta.mjs`: `VENDOR_BINDING_0028_COHORT` is now built from the renamed
  `VENDOR_BINDING_0028_ALL_FNS` (existence, all five) while `VENDOR_BINDING_0028_HUMAN_FNS`
  narrows to three, and `BINDING_PROPOSAL_PR1_HUMAN_FNS` drops `decline_vendor_identity_binding`
  — REVOKE, never DROP, as the lane record states.

### Lane 02 (#982, #1007 — migrations 0274, 0275)

**Two conflicted files.**

`packages/db/README.md` — both sides appended a section at end of file (HEAD: `## 0273`;
lane 02: `## 0274`, `## 0275`). Resolved by keeping BOTH, in ascending migration order, which is
already HEAD-then-theirs: markers deleted, no prose merged. Result reads
`0270 · 0271 · 0272 · 0273 · 0274 · 0275`.

`packages/db/package.json` — the `test` script's `--import` gate chain. Resolved as a UNION
ordered by migration number: HEAD's 88 tokens kept whole, lane 02's two new tokens appended
(`trade-invoice-party-tin` = 0274, `trade-invoice-duplicate-probe` = 0275), both after 0273's.
87 unique tokens after the merge, no entry twice. JSON re-parsed.

`apps/web/messages/en.json` auto-merged; checked for duplicate keys with an independent scanner
(no `JSON.parse` silently dropping a second copy) — **no duplicate key, and no key added by both
sides**, so the STOP-and-report rule never fired. Same check after every subsequent lane.

### Lane 03 (#958, #1001, #1002 — migration 0276)

**Two conflicted files.**

`packages/db/package.json` — same union rule; `cash-account-set-membership-read` (0276) appended
after 0275's. 88 unique tokens.

`packages/db/tests/rig-meta.mjs` — both sides added a cohort block at the same seam. Kept BOTH in
migration order: `TRADE_INVOICE_DUPLICATE_0275_*` (HEAD) then
`CASH_ACCOUNT_SET_MEMBERSHIP_READ_0276_*` (lane 03). Neither block was merged into the other.
`rig-meta.mjs` re-imported cleanly afterwards (107 exports).

Lane 03 added no `## 0276` README section — its README change is one door line in the existing
roster at `packages/db/README.md:1865`; nothing was lost.

### Lane 04 (#932, #882, #975, #978 — migrations 0277–0279 + two fix-round files)

> This section records the merge AS IT HAPPENED, with the fix-round files still at 0280 and 0281.
> They were renumbered to **0292** and **0293** one commit later, on the coordinator's ruling —
> see "The duplicate-number blocker, and how it was resolved" below for the final state.

**Three conflicted files.**

`packages/db/package.json` — union, five tokens appended in their own migration order:
`fa-depreciation-policy` (0277), `fa-belt-birth-convention` (0278), `fa-arrears-resolution`
(0279), `fa-policy-enrolment-congruence` (then 0280), `fa-arrears-judgement-scope` (then 0281).
93 unique. The last two later moved to the end of the chain with the renumber.

`packages/db/README.md` — additive; both sides' sections kept, ascending
(`0273 · 0274 · 0275 · 0277 · 0278 · 0279 · 0280 · 0281`); the last two sections later moved after
`## 0291` with the renumber.

`packages/db/tests/rig-meta.mjs` — **two** hunks, both additive but with a SHARED TRAILING TOKEN,
so neither could be resolved by deleting markers alone:

1. the `ALLOWED[ROLES.authenticated]` spread list — HEAD's `…CASH_ACCOUNT_SET_MEMBERSHIP_READ_0276_HUMAN_FNS`
   and lane 04's `…FA_DEFAULT_DEPRECIATION_POLICY_0277_HUMAN_FNS` + `…FA_CLOSED_YEAR_ARREARS_0279_HUMAN_FNS`.
   Both kept, in migration order.
2. the `cohortFailures` block — HEAD's `#1002 [0276]` guard and lane 04's `#932 [0277]` /
   `#975 [0279]` guards shared the closing `}` after the conflict. Resolved by writing HEAD's own
   closing `}` in place of the `=======` marker and letting the shared `}` close lane 04's last
   guard. Both guards present, in order; `rig-meta.mjs` re-imported (109 exports).

`apps/web/tests/firm-scope-db-pins.corpus.ts` auto-merged here (lane 04's two entries, 0277 and
0279) — it conflicts at lane 08, below.

### Lane 06 (#936, #919, #986 — migrations 0284–0286)

**Three conflicted files.**

`packages/db/package.json` — union, three tokens appended (0284, 0285, 0286). 96 unique.

`packages/db/README.md` — additive, both sides kept ascending through `## 0286`.

`packages/db/tests/rig-meta.mjs` — **three** hunks:

1. the cohort definitions — HEAD's `#1007 [0275]` / `#1002 [0276]` blocks and lane 06's
   `#936 [0284]` / `#986 [0286]` blocks; both kept, in migration order. (0285 mints no new
   function name — it recuts `get_prepayment_schedule` and `list_prepayment_schedules` — so it owes
   no cohort, which matches the lane record.)
2. the `ALLOWED` spread list — HEAD's 0276/0277/0279 entries and lane 06's
   `…ACCRUAL_CORRECTION_0284_HUMAN_FNS`; both kept.
3. the `cohortFailures` block — same shared-trailing-`}` shape as lane 04's; HEAD's guard closed
   explicitly, lane 06's `#936 [0284]` and `#986 [0286]` guards appended after it.

`rig-meta.mjs` re-imported (111 exports).

### Lane 08 (#857, #990, #1019, #1020 — migrations 0290, 0291)

**Three conflicted files.**

`packages/db/package.json` — union, two tokens appended (0290, 0291). 98 unique — the final count.

`packages/db/README.md` — additive; `## 0290` and `## 0291` after `## 0286`.

`apps/web/tests/firm-scope-db-pins.corpus.ts` — the reviewed dynamic-SQL barrier census. HEAD's
last entry (`0279_fa_closed_year_arrears.sql`) and lane 08's entry
(`0291_bank_statement_line_citation.sql`) shared the closing `},\n  ],`. Resolved by closing
HEAD's entry explicitly and letting the shared tail close lane 08's. The Map's key order is
load-bearing (the census compares it to the corpus's file-sorted list): the merged order is
`… 0252 · 0253 · 0254 · 0260 · 0277 · 0279 · 0291`, file-sorted. Lane 04's 0292/0293 (0280/0281 at merge time) and lane 06's
0284–0286 owe no barrier entry (no dynamic SQL of the kind the lexer cannot read) — see
"re-measured pins" below for the proof that the census agrees.

`apps/web/test/manifest.txt` auto-merged. **#1020's restored header survived**: the 38 comment
lines of the merged file are byte-identical to lane 08's, and differ from the pre-merge HEAD's
(which was the plain-string-SORTED, scrambled prose #1020 exists to undo). The header was NOT
re-sorted. The 511 path lines are a plain-string-sorted union with no duplicate.

### Lane 10 (#1015, #1016, #1018, #1023, #1028 — no migration)

**No conflicts**, but one shared file worth naming: `packages/runtime/tests/trade-invoice-e2e.mjs`
is touched by lane 02 (#1007 added leg 8, the duplicate probe over the admission's own route) and
by lane 10 (#1018 replaced the file's own copy of the local-DB gate with the shared
`local-db-gate.mjs`). Git merged them into different regions; both intents verified present in
the merged file — the `assertLocalDbGate({…})` call at line 101 AND leg 8 at lines 48/536 — and
the file passes `node --check`.

`packages/runtime/tests/local-db-gate-drivers-census.test.mjs` derives its roster from the
directory listing, so any new `*-e2e.mjs` from another lane would red it. Re-measured after the
merge: 25 `*-e2e.mjs` on disk, 23 drivers + 2 `NON_GATE_E2ES`, census **8/8 pass**. No merged
lane added an e2e driver.

### Lane 11 (#1024, #897, #1021, #1022 — no migration, web only)

**No conflicts.** `apps/web/e2e/README.md` is touched by lane 08 (#1019, the coverage-map rewrite
and its count sentence) and lane 11 (#897's row for `agentic-finish-walk.spec.ts`); both survived
— diffing the merged file against lane 08's shows exactly one changed line, lane 11's row.
`apps/web/e2e/e2e-fixture-ownership.test.ts` is touched by lane 03 and lane 11; auto-merged and
green (below). The README's "49 specs" count still measures true: 49 `*.spec.ts` on disk, and no
merged lane added one.

---

## The shared docs that never conflicted, and why

`CONTEXT.md`, `apps/web/README.md`, `packages/runtime/README.md`, `apps/web/e2e/README.md` and
`packages/db/tests/README.md` auto-merged for every lane. That is not luck and it was not taken on
trust: each lane's added lines were re-checked line by line against the merged file, and **every
one is present** — CONTEXT.md (lanes 02/03/04/06/08/11, 105 added lines), apps/web/README.md
(02/03/04/06/11, 360), packages/runtime/README.md (02/04/06/10, 202), apps/web/e2e/README.md
(08/11, 27), packages/db/tests/README.md (10, 30); zero lines lost.

These files are organised by CONCEPT, not by migration number, so the lanes wrote into different
sections (lane 06 at CONTEXT.md:115, lane 11 at :164, lane 02 at :411, lane 08 at :633, lane 04 at
:789, lane 03 at :983) rather than at a common append point. The "both sides' sections, ascending
by migration number, never merged into one" rule therefore had nothing to order here — it applies
where two sides append at the SAME seam, which in this pass happened only in
`packages/db/README.md` (five times) and in the three files resolved by hand below.

## Semantic collisions

**None between two lanes' logic.** No two merged lanes changed the same lines. Every conflict in
this pass was additive (a section, a gate token, a cohort, a census row) or an additive pair
sharing a closing token. The one place two lanes wrote into the same function-level file —
`trade-invoice-e2e.mjs`, lanes 02 and 10 — resolved additively at different regions and is
verified above.

One `fix(integration)` commit exists, and it is not a logic collision: the NUMBER collision between
lane 04 and lane 05, resolved by the coordinator's ruling. See the next section.

---

## Re-measured pins and censuses (before → after)

`apps/web/tests/firm-scope-db-pins.corpus.ts` pins the sha256 of a migration file's CONTENT. All
three wave-3 entries re-measured with `sha256sum`, on the lane branch (before) and on the merged
tree (after):

| entry | before (lane branch) | after (merged) |
|---|---|---|
| `0277_fa_default_depreciation_policy.sql` | `90656f46a5a89cc64e97938694c0e5139ab0d5eb6e8ab9cdeb8022a4cb380acb` | **same** |
| `0279_fa_closed_year_arrears.sql` | `ca9ede2bd4b065a8d3b4e67bde07b5afffbe937b2c1c083e580baf563de5a640` | **same** |
| `0291_bank_statement_line_citation.sql` | `45235f2dab6652a3faa15abff761ea953993ecf4636fcbfcab8ad2a6637505b3` | **same** |

Unchanged, as expected: no merge touched a migration file's bytes. The census itself was then run
rather than reasoned about — `firm-scope-db-pins.test.ts`: **22/22 pass**, which is also the proof
that no newly-merged migration (0273–0276, 0284–0286, 0290, 0292, 0293) owes a barrier entry it
does not have.

Other censuses re-measured after the pass:

| census | command | result |
|---|---|---|
| reviewed dynamic-SQL barriers | `node --test tests/firm-scope-db-pins.test.ts` | 22/22 pass |
| GL-balance cash label (#958) + e2e fixture ownership + spec discovery | `node --test tests/gl-balance-cash-label-census.test.ts e2e/e2e-fixture-ownership.test.ts e2e/spec-discovery.test.ts` | 55/55 pass |
| local-DB-gate driver roster (#1018) | `node --test packages/runtime/tests/local-db-gate-drivers-census.test.mjs` | 8/8 pass |
| `apps/web/test/manifest.txt` | 511 path lines, plain-string sorted, no duplicate; header == lane 08's | OK |
| `apps/web/messages/en.json` | independent duplicate-key scan after every lane | no duplicate key |
| db gate chain | 98 `--import` tokens, none twice, strictly ascending by migration number | OK |

The gate chain's ordering was verified by reading each NEW gate module and taking the migration it
is about (each cites it in prose; the module itself keys on a stem, never a number):

The chain's final order, after the lane-04 renumber moved the last two tokens to the end:

```
0273 vendor-binding-write-doors-revoked
0274 trade-invoice-party-tin
0275 trade-invoice-duplicate-probe
0276 cash-account-set-membership-read
0277 fa-depreciation-policy
0278 fa-belt-birth-convention
0279 fa-arrears-resolution
0284 accrual-correction
0285 prepayment-term-liveness
0286 opening-source-reread
0290 document-regions-field-path-check
0291 bank-statement-line-citation
0292 fa-policy-enrolment-congruence   (was 0280)
0293 fa-arrears-judgement-scope       (was 0281)
```

---

## Migration roster

On `integration/riders-w3` at `d5b341141`, `packages/db/migrations` holds **281** files. From 0273
up:

```
0273_vendor_binding_write_doors_revoked.sql      lane 01
0274_trade_invoice_party_tin.sql                 lane 02
0275_trade_invoice_duplicate_probe.sql           lane 02
0276_cash_account_set_membership_read.sql        lane 03
0277_fa_default_depreciation_policy.sql          lane 04
0278_fa_belt_birth_convention.sql                lane 04
0279_fa_closed_year_arrears.sql                  lane 04
0284_accrual_correction.sql                      lane 06
0285_prepayment_term_liveness.sql                lane 06
0286_opening_source_reread.sql                   lane 06
0290_document_regions_field_path_check.sql       lane 08
0291_bank_statement_line_citation.sql            lane 08
0292_fa_policy_enrolment_congruence.sql          lane 04   (fix round, RENUMBERED from 0280)
0293_fa_arrears_judgement_scope.sql              lane 04   (fix round, RENUMBERED from 0281)
```

Every number present exactly once; **no duplicate number anywhere in the directory** (checked over
all 281 files, not only the new ones).

**Gaps, and who owns them:**

- **0280, 0281, 0282, 0283** — lane 05, pending, and now FREE for it again (see below).
- **0287, 0288, 0289** — lane 07, pending.

Lane 09 carries no migration, and neither do lanes 10 and 11.

### The duplicate-number blocker, and how it was resolved

Lane 04's fix round added two files beyond its 0277–0279 reservation and took **0280** and
**0281**, which are lane 05's reservation and which lane 05 has USED
(`0280_plan_schedule_yield_wall.sql`, `0281_plan_overlap_sibling_arm.sql`). Git would NOT have
conflicted — the filenames differ — so this fails at RUN time, not at merge time:
`packages/db/scripts/migrate.mjs:291` throws
`duplicate migration version 0280: "…" and "…". Each version number must be unique.`

**The coordinator ruled that LANE 04 moves, not lane 05**: lane 05 is still in its fix and recheck
rounds with workers running against `clara_l05`, whose ledger carries 0280 to 0283, while lane 04
is finished and merged, so its two extra files are the cheap side. Lane 04's own record licenses it
— `wave3-lane04-fix.md`: *"their numbers are provisional — every gate in this family keys on a
stable stem, never a number, and a number is claimed at MERGE."*

That lane 05 is genuinely still live is observable rather than assumed: over this merge session its
branch head moved `d8ff391a8 → 1db1d36a2` and lane 07's moved `61b7463fb → ac4cae6ee`, with no
action from me. Neither branch nor worktree was touched at any point.

Applied in `a7ad92418` *fix(integration): #932/#975 lane 04's fix-round migrations take 0292 and
0293, off lane 05's reservation*:

| was | is | ticket |
|---|---|---|
| `0280_fa_policy_enrolment_congruence.sql` | `0292_fa_policy_enrolment_congruence.sql` | #932 fix round |
| `0281_fa_arrears_judgement_scope.sql` | `0293_fa_arrears_judgement_scope.sql` | #975 fix round |

`git mv`, so the rename is recorded as a rename. **The slugs and both stems are byte-unchanged**
(`fa_policy_enrolment_congruence$`, `fa_arrears_judgement_scope$`), and both gate modules key on
the stem — `FA_POLICY_ENROLMENT_CONGRUENCE_STEM` at
`packages/db/tests/fa-depreciation-policy-fixtures.mjs:62` and
`FA_ARREARS_JUDGEMENT_SCOPE_STEM` at `packages/db/tests/fa-arrears-resolution-fixtures.mjs:70` —
so **no gate logic changed**: verified by grepping both slugs across the tree, every hit being
either the filename or the stem constant.

**Every reference changed (grep for `\b0280\b` and `\b0281\b` across the tree, each hit accounted
for):**

| file | what changed |
|---|---|
| `packages/db/migrations/0292_…sql` | line 1 header (its own filename); the 8 in-body `#932 FIX ROUND (0280)` markers → `(0292)`; the redo notice "REDO of 0280 itself" → 0292 |
| `packages/db/migrations/0293_…sql` | line 1 header; the 6 `#975 FIX ROUND (0281…)` / `[0281, ADV-…]` markers → 0293; the redo notice; the cross-reference "0278 and **0280** make the same claim" → 0292; the prestate comment "chain 0001..0280" → "0001..0279 plus this lane's own fix-round sibling, renumbered 0292 at merge" |
| `packages/db/README.md` | both `## 0280` / `## 0281` headings renumbered **and the whole 109-line block MOVED to after `## 0291`**, so the file still reads in migration order; the two filename references inside them; and the blank line before the `## 0274`, `## 0277` and `## 0290` headings, which the conflict markers had been providing (the one before `## 0233` is pre-existing on main — checked — and was left alone) |
| `packages/db/package.json` | both `--import` tokens moved to the END of the gate chain, after 0291's. 98 tokens, none twice, still strictly ascending by migration number. One line changed; the JSON round-trip preserved the file's formatting exactly |
| `packages/db/tests/fa-policy-enrolment-congruence-preintegration-gate.mjs` | "(migration 0280)" → 0292 |
| `packages/db/tests/fa-arrears-judgement-scope-preintegration-gate.mjs` | "(migration 0281)", "post-0281 behaviour", "a chain missing 0281" → 0293 |
| `packages/db/tests/fa-depreciation-policy-fixtures.mjs` | the filename in the stem docblock; "`gate932`'s exact shape on 0280's own stem"; "FAILS LOUDLY below 0280" → 0292 |
| `packages/db/tests/fa-arrears-resolution-fixtures.mjs` | the filename in the stem docblock; "`gate975`'s exact shape on 0281's own stem"; "FAILS LOUDLY below 0281" → 0293 |
| `packages/db/tests/fa-depreciation-policy.test.mjs` | "The fix round's own frontier: 0277 AND 0280" → 0292 |
| `packages/db/tests/fa-arrears-resolution.test.mjs` | "the four cells … need 0281 as well" → 0293 |
| `packages/db/tests/fixed-asset-acquisition.test.mjs` | "(0277's, then 0280's, which…)" → 0292 |

**Deliberately NOT changed:**

- `packages/db/tests/rig-meta.mjs` — it carries no cohort or comment for either file. Neither
  migration mints a function name (both are pure recuts), so neither owes one. Grep-confirmed:
  zero hits for `0280`/`0281` in that file before the change.
- `apps/web/tests/firm-scope-db-pins.corpus.ts` — the corpus is keyed by FILENAME, and neither file
  has an entry: both are static `create or replace` DDL with no reviewable dynamic SQL, which is
  the claim each file's own header makes. Its keys remain `… 0252 · 0253 · 0254 · 0260 · 0277 ·
  0279 · 0291`, still file-sorted. **The census was re-run anyway: 22/22 pass**, before and after.
- `docs/plan/active/riders-2026-09-20/README.md:72` — the work-order lane table's row
  `| 05 | … #908 (0280) #909 (0281) #927 (0282) … |`. That is lane 05's RESERVATION, which this
  change hands back to it intact. It is now the only `0280`/`0281` left in the tree, and it is
  correct.
- The lane-04 reports (`wave3-lane04-*.md`) — history, not edited. They are not in this worktree's
  tree in any case.

**Chain-order re-check of the two prestates.** The files were measured on `clara_l04` after 0277 to
0279 only; they now apply after 0280 to 0291. Read out of the migrations rather than assumed:

- `0292` touches **7** bodies — RECUT `clara._tf_fa_acquisition_birth`, `clara._fa_on_approve`;
  pinned unmoved `clara._fa_asset_json`, `clara._fa_particulars_complete`,
  `clara._fa_reversal_blocked`, `clara.set_fa_depreciation_policy`,
  `clara.upsert_fa_account_profile`, plus the birth trigger's catalog comment (0278's 1,553
  characters).
- `0293` touches **11** bodies — RECUT `clara._fa_run_period_core`,
  `clara.record_fa_arrears_resolution`; pinned unmoved `clara._fa_closed_arrears`,
  `clara._fa_oldest_unmet_period`, `clara._fa_assert_period_open`,
  `clara.preview_depreciation_run`, `clara.run_depreciation_period_for`,
  `clara.run_depreciation_manual`, `clara.run_depreciation_period`, `clara.reopen_fiscal_year`,
  `clara.finalize_close`.
- The 23 bodies that 0280–0291 recut, splice or re-comment are: `_assert_plan_schedule` (0280),
  `_plan_overlap_warning` (0281, 0283), `propose_adjustment_template` / `sign_adjustment_template`
  / `run_adjustment_manual` (0282), `correct_accrual_adjustment` (0284, + its comment),
  `get_prepayment_schedule` / `list_prepayment_schedules` (0285),
  `refresh_opening_targets_from_reread` (0286), `_client_birth_core` /
  `begin_client_onboarding` / `open_client_onboarding` (0287, + its comment),
  `create_seeding_batch` / `tick_seeding_proposal` / `decline_seeding_proposal` and the splice of
  `list_review_queue` (0288), the splice of `merge_counterparties` (0289), `_field_path_conforms`
  (0290, + its comment), and the splices of `_persist_statement_core_v2` /
  `get_bank_line_matching_context` (0291).
- **Intersection with 0292's and 0293's 18 bodies: EMPTY.** Nothing in 0280–0291 recuts,
  splices or re-comments a body either file pins, and a grep for `grant`/`revoke` against any
  `_fa_*` / `fixed_asset` / `depreciation` / `arrears` object across 0280–0291 returns nothing —
  the only mention of the fixed-asset lane anywhere in those twelve files is two `row_kind`
  string literals (`'fixed_asset_incomplete'`, `'depreciation_authority_pending'`) inside 0288's
  splice of `clara.list_review_queue`, which neither file pins. The move is safe in chain order.

Checks re-run after the renumber: `check-frozen-workflows.mjs` **OK** (manifest unchanged),
`packages/db/package.json` parses, migration numbers unique across all 281 files, pins corpus
census **22/22**, `pnpm typecheck` clean, `CI=true GITHUB_ACTIONS=true pnpm lint` **exit 0**.

### Lane 07's numbers, and the one rule for the gate worker

After this pass the on-disk order is `… 0286 · 0290 · 0291 · 0292 · 0293`, and lane 07's 0287–0289
sit BELOW 0290–0293 by number. That is **fine on both paths that matter**:

- **from-scratch** — `migrate.mjs` sorts by number and applies in that order, so once lane 07
  lands, 0287–0289 simply run before 0290–0293. Nothing is out of order.
- **the hosted upgrade** — hosted is at 0272, below every wave-3 number, so the whole wave applies
  in one ascending run for the same reason.

The one path it is NOT fine on is an INCREMENTAL apply onto a database that has already applied
0290 or above: `migrate.mjs:385` then refuses the lower numbers — *"migration … is at or below the
highest applied number … Renumber it above the frontier; migration history is append-only."*
**So the gate worker must not reuse a database that already carries 0290 or above.** Build the
chain from scratch, or from a snapshot at or below 0286.

---

## Cross-pin list (for the gate worker)

Every function body a merged lane's migrations RECUT or PIN that ANOTHER merged lane — or one of
the three pending lanes — also recuts or pins. Read out of the migrations themselves (whole-body
`create or replace function clara.…`, plus the `pg_get_functiondef` splice targets of 0288, 0289
and 0291, plus every `'clara.name(args)'` regprocedure literal a prestate or tail pins).

**Seven bodies are touched by two or more lanes. In every one of them, every touch is a PIN — no
lane in the wave recuts a body another lane pins.** That is the good news; these are still the
pins most likely to move if a chain-order re-apply shifts anything, because a pin measured on a
lane rig is a `sha256(prosrc)` equality against whatever is live at apply time.

| body | lanes | who touches it, and how |
|---|---|---|
| `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` | 06, **07 pending** | pin: 0284, 0286 · pin: 0287 |
| `clara._finish_op(uuid,text,text,jsonb)` | 06, **07 pending** | pin: 0284, 0286 · pin: 0287 |
| `clara._hash(jsonb)` | 06, **07 pending** | pin: 0284, 0286 · pin: 0287 |
| `clara._human_ctx(integer)` | 06, **07 pending** | pin: 0284 · pin: 0287 |
| `clara._reserve_op(uuid,text,text,bytea)` | 06, **07 pending** | pin: 0284, 0286 · pin: 0287 |
| `clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)` | **05 pending**, 06 | pin: 0280, 0281, 0283 · pin: 0284 |
| `clara.role_rank(text)` | 03, 06 | pin: 0276 · pin: 0284 |

The only MERGED × MERGED entry is `clara.role_rank(text)`, pinned as unmoved by both 0276 and
0284; nothing in the wave recuts it, so the two pins agree by construction.
`clara.revise_accounting_plan` is the one to watch at pass 2: lane 06's 0284 nests it UNCHANGED
(its cohort note says so explicitly) and lane 05 pins it three times, so any later file that recuts
it breaks four prestates at once.

### Order-locked pairs INSIDE a merged lane (preserved by this pass, listed so a reorder is visibly wrong)

- lane 02: `0274` recuts `clara._trade_invoice_resolve_party`; **`0275` pins 0274's post-image of
  it and then recuts it again**. 0274 must stay before 0275.
- lane 04: `0277` recuts `clara._tf_fa_acquisition_birth`, `clara._fa_on_approve`,
  `clara._fa_asset_json`; `0278` pins the birth trigger's catalog comment and accretes onto it;
  `0292` recuts the birth trigger and `clara._fa_on_approve` again. Order 0277 → 0278 → 0292.
- lane 04: `0279` recuts `clara._fa_run_period_core` and `clara.record_fa_arrears_resolution`;
  `0293` recuts both again. Order 0279 → 0293.
  (These two pairs are why lane 04 was NOT the side that stayed put on its own numbers but IS the
  side that could move: the order inside each pair is what matters, and 0292/0293 keep it while
  sitting above everything else in the wave. Verified body by body in the renumber section above.)
- lane 06: `0285` recuts `clara.get_prepayment_schedule` and `clara.list_prepayment_schedules`,
  pinned at 0223's pre-image (bimodal FIRST/REDO).
- lane 08: `0291` splices `clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)`
  (pre-image `6f694ac0…`) and `clara.get_bank_line_matching_context(uuid)` (pre-image
  `765025f1…`). Nothing else in the wave touches either.

### Bodies the PENDING lanes recut (nothing merged in this pass pins them — verified, listed for pass 2)

- lane 05: `clara._assert_plan_schedule` (0280), `clara._plan_overlap_warning` (0281 and again at
  0283 — order-locked), `clara.propose_adjustment_template`, `clara.sign_adjustment_template`,
  `clara.run_adjustment_manual` (0282).
- lane 07: `clara._client_birth_core`, `clara.begin_client_onboarding`,
  `clara.open_client_onboarding` (0287); `clara.create_seeding_batch`,
  `clara.tick_seeding_proposal`, `clara.decline_seeding_proposal` (0288) plus the splice of
  `clara.list_review_queue(jsonb,jsonb,integer)`; the splice of
  `clara.merge_counterparties(uuid,uuid,uuid,text,text)` (0289).

Note for the gate worker: `clara.list_review_queue` is the same body wave 2's 0260 spliced. Lane 07
measured its pre-image on a rig that carries 0260 (the lane base already held every migration main
holds — the migration sets at `ffe63a0dd` and `d96a33f31` are IDENTICAL, 267 files each), so this
pass introduces no hidden wave-1/2 pin drift.

---

## Checks

After EVERY lane's merge commit:

- `JSON.parse(packages/db/package.json)` — OK, eight times.
- conflict-marker grep over the whole tree (excluding `.git`, `node_modules`) — clean, eight times,
  and clean again at the end via `git grep`.
- `node scripts/check-frozen-workflows.mjs` — **OK** every time, with an unchanged manifest:
  `312 frozen file(s) verified against frozen-workflows.json (append-only vs origin/main); 55 "use
  workflow" module(s) all frozen+registered; 3 retired entr(ies) recorded.` No wave-3 lane touched
  a frozen body.

After the last lane:

| check | result |
|---|---|
| migration roster 0273+ | 14 files, every number once, no duplicate across all 281 |
| `node scripts/ci/world-gate.selftest.mjs` | **world-gate selftest: OK** |
| `pnpm typecheck` | **PASS** — `apps/web` and `packages/runtime`, `tsc --noEmit`, zero errors |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **PASS**, exit 0 (eslint, token contrast, test-manifest + selftest, message keys + selftest — 4,398 keys all resolve — and the ui-add guard selftest) |

Not run, per the work order: the database suites and the browser suites.

Nothing was broken by the merge, so no `fix(integration): …` commit exists.

---

## What the second pass inherits

1. **Lane 05 keeps 0280–0283 — nothing to do.** The duplicate was resolved on lane 04's side
   (`a7ad92418`), so all four of lane 05's numbers are free again and its rig `clara_l05`, whose
   ledger carries 0280 to 0283, stays valid. Its workers were never interrupted.
2. **Lane 07 keeps 0287–0289.** They are below 0290–0293 by number, which is correct on a
   from-scratch chain and on the hosted upgrade from 0272. The one constraint is on the RIG, not on
   the numbers: **do not reuse a database that already carries 0290 or above** — `migrate.mjs:385`
   refuses a lower number onto a higher frontier. Build from scratch, or from a snapshot at or
   below 0286.
3. **Re-measure lane 05's and lane 07's prestates in chain order**, especially
   `clara.revise_accounting_plan` (four pins across two lanes) and the five op-plumbing bodies
   (`_audit`, `_finish_op`, `_hash`, `_human_ctx`, `_reserve_op`) that lane 06 and lane 07 both pin.
4. The shared-file rules used here — gate chain = union ordered by migration number; `rig-meta.mjs`
   = union of cohorts in migration order; the READMEs and `CONTEXT.md` = both sides' sections,
   ascending, never merged into one; `en.json` = union; `manifest.txt` = union with lane 08's
   restored header and a plain-string sort; the pins corpus = union then re-measure — all held with
   no exception, and pass 2 should apply them unchanged.
5. **The next free migration numbers are 0294 and up.** The frontier on
   `integration/riders-w3` is `0293_fa_arrears_judgement_scope`.

---

# Pass 2a: lane 09

**New head** `38a9a91a27f302175ce6e74824514e7172d9fc2d` — `431e61b33` *merge: riders wave 3 lane 09*,
then `38a9a91a2` *fix(integration): #864/#1017/#1019 vs #921/#932/#897*.
**Lane head merged** `bd6a8de4a` · **tickets** #970 #989 #864 #997 #1017 · **no migration**
(`git diff <base>..HEAD -- packages/db` is empty on the lane, and the merge changed nothing under
`packages/db`).
**Lane 09's own diff** 73 files, +3,322/−353. **Whole branch vs main** 285 files, +32,390/−2,355.

Lanes 05 and 07 remain unmerged and untouched: lane 07's recheck is running and lane 05 needs one
more fix round.

## The one conflicted file

`apps/web/README.md` — both sides appended a feature section at the same seam: HEAD's
`## #958 — cash is book cash…` (lane 03) and lane 09's `## #1017 — every accessibility scan settles
through one shared helper…`. Kept BOTH, HEAD first, nothing merged into one. This file is organised
by ticket, not by migration number, so there is no number to order by.

While resolving it I restored the blank line before the `## #1017` heading that the conflict
markers had been providing. Checked rather than guessed: `apps/web/README.md` now has exactly 8
headings with no blank line above them, and all 8 are pre-existing on `d96a33f31`.

## Everything else auto-merged — and was verified, not trusted

Nine `e2e/*.spec.ts` files and `e2e-fixture-ownership.test.ts` were touched by lane 09 AND by
another lane:

| file | other lane |
|---|---|
| `accrual-walk.spec.ts`, `opening-ledger-source-walk.spec.ts` | 06 |
| `agentic-finish-walk.spec.ts`, `interview-walk.spec.ts`, `members-invite-walk.spec.ts` | 11 |
| `depreciation-walk.spec.ts`, `fixed-asset-acquisition-walk.spec.ts` | 04 |
| `firm-navigation-walk.spec.ts` | 01 |
| `trade-invoice-walk.spec.ts` | 02 |
| `e2e-fixture-ownership.test.ts` | 03 and 11 |

Lane 09's intent in all of them is one thing — **every `.analyze()` scan settles first** — so the
union was checked by counting both sides' `.analyze(` and `settleForScan` occurrences against the
merge, and then by running lane 09's own censuses, which ARE the mechanical statement of that
intent. The count table found the collision before any test did: `firm-navigation-walk.spec.ts`
carried **9** scans on HEAD and **8** on lane 09 — lane 01 had added a ninth lane 09 never saw.

`apps/web/package.json` and `pnpm-lock.yaml` auto-merged: lane 09's #970 adds
`@shadcn/react@^0.3.1`, genuinely imported by `components/ui/message-scroller.tsx` and resolved in
the lockfile with its integrity hash. `pnpm install --frozen-lockfile` succeeds on the merged tree,
which is the check that the two files still agree.

`apps/web/test/manifest.txt` auto-merged: **lane 08's restored header survives byte for byte** (38
comment lines, diffed against lane 08's own), and the path lines are a plain-string-sorted union of
514 unique entries (511 before, +3 from lane 09), with lane 09's three new test files present.

## Three semantic collisions — each lane green alone, red together

Lane 09 converts three suite properties into mechanical censuses, so the collisions surface as
census failures rather than as conflicts. All three are fixed in `38a9a91a2`, one commit, each fix
being the remedy the census itself prints, in the house shape already used beside it. **No
threshold was relaxed and no assertion weakened.**

### 1. #1017's settle-before-scan census vs #921 (lane 01)

`e2e/firm-navigation-walk.spec.ts:274` — lane 01's ninth axe scan, the one proving Propose and Sign
are gone from the vendor-bindings panel for both personas, ran without settling. The census named
it exactly: `firm-navigation-walk.spec.ts: 0: 274`.

Fixed by adding `await settleForScan(page);` on its own line before the `AxeBuilder` call —
byte-identical to the shape lane 09 gave the other eight scans in that same file (lines 161, 172,
194, 354, 392, 441, 507…). The import was already there. Census 4/4 after.

### 2. #864's cell-budget census vs #932/#975 (lane 04) and #897 (lane 11)

Three cells wait longer than the 30,000 ms base budget without declaring it. The census computes
the right budget and prints it; each number below is its own prescription, quoted back:

| cell | its own waits | declared | fix |
|---|---|---|---|
| `agentic-finish-walk.spec.ts:376` (#897) | 40,000 ms | 0 ms | add `test.setTimeout(cellBudgetMs({ polls: 3 }))` |
| `depreciation-walk.spec.ts:60` (#975's arrears additions) | 80,000 ms | 60,000 ms | `polls: 4` to `polls: 6` |
| `fixed-asset-acquisition-walk.spec.ts:345` (#932's default-policy cell) | 140,000 ms | 0 ms | add `test.setTimeout(cellBudgetMs({ polls: 10 }))` |

All three files already imported `cellBudgetMs`. Census 5/5 after.

### 3. #1019's coverage-map count (lane 08) vs #997 (lane 09)

Lane 09 adds the **50th** spec, `tax-compliance-watch-receipt-walk.spec.ts`, together with its own
coverage-map row; lane 08's #1019 owns the sentence that counts them and still said "49 specs …
describes 26 of them; the remaining 23". Two cells red: `49 !== 50` and `27 !== 26`.

Fixed to 50 specs and 27 described rows. The residual count stays **23** because the new spec HAS a
row — 27 + 23 = 50 — so the partition the census checks still holds, and nothing was moved between
the table and the residual list.

## Checks

| check | result |
|---|---|
| conflict markers, whole tree | clean |
| `packages/db/package.json` + `apps/web/package.json` | both parse |
| `pnpm install --frozen-lockfile` | up to date, succeeds |
| `node scripts/check-frozen-workflows.mjs` | **OK**, manifest unchanged — 312 frozen files, 55 `use workflow` modules, 3 retired |
| `node scripts/ci/world-gate.selftest.mjs` | **world-gate selftest: OK** |
| the five e2e censuses (settle-before-scan, cell-budget, sign-in, spec-discovery, fixture-ownership) | **61/61 pass** |
| `check-token-contrast.mjs` | **57 pairs, all WCAG 2.1 AA** — #1017's new `foreground-on-muted-selected-document-row` measures **14.32:1** against its 4.5:1 bar |
| `tests/token-contrast.test.ts` + `tests/focus-ring-contract.test.ts` | 27/27 |
| `tests/firm-scope-db-pins.test.ts` | 22/22 (unchanged — lane 09 has no migration) |
| full census + contrast sweep, one run | **110/110 pass** |
| `pnpm typecheck` | clean |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** (4,399 message keys resolve; manifest gate green) |

Database and browser suites not run, per the work order.

## State for the rest of pass 2

- Frontier is still `0293_fa_arrears_judgement_scope`; lane 09 added no migration, so the roster,
  the gate chain (98 tokens) and the pins corpus are all unchanged by this merge.
- The cross-pin list above is unaffected — lane 09 touches no database body.
- Lanes 05 and 07 still to land. Lane 05 keeps 0280–0283; lane 07 keeps 0287–0289; **the gate
  worker must not reuse a database that already carries 0290 or above.**
- A NEW standing hazard for both: lane 09's censuses are now live on the integration branch, so any
  cell lanes 05 or 07 add must **settle before every scan** and **declare a budget sized to its own
  waits**, and any spec file they add moves `apps/web/e2e/README.md`'s count sentence. Run
  `e2e/settle-before-scan-census.test.ts`, `e2e/cell-budget-census.test.ts` and
  `e2e/spec-discovery.test.ts` after each of those merges — they are cheap, they need no browser,
  and they caught all three collisions here.

---

# Pass 2b: lanes 05 and 07

**Final head** `ba54ad2bdc7f858ddd2df3cc4e0009077dfd27f8`

| commit | what |
|---|---|
| `b39793378` | merge: riders wave 3 lane 05 |
| `c7ea63eed` | fix(integration): #929/#1019 vs #936/#997 |
| `bc49eca38` | merge: riders wave 3 lane 07 |
| `ba54ad2bd` | fix(integration): #936 vs #929 — 0284's pin admits 0283's recut |

**Lane 05** `1db1d36a2` · #908 #909 #927 #928 #929 · migrations 0280–0283.
**Lane 07** `ac4cae6ee` · #899 #1012 #889 · migrations 0287–0289.
**Whole branch vs main** 401 files, +42,377/−5,915. The wave is complete: all eleven lanes landed.

## Lane 05 — two conflicted files

`packages/db/package.json` — the gate chain. Lane 05's four tokens were inserted at their
**migration-number positions**, not appended: the chain's pre-0273 prefix is left byte-for-byte
alone (its order is historical), and the wave-3 tail is re-sorted by number, so
`plan-schedule-yield-wall` (0280), `plan-overlap-sibling-arm` (0281),
`adjustment-template-doors-retired` (0282) and `plan-overlap-template-arm-retired` (0283) land
between 0279's and 0284's. Each gate's own migration number was read out of the module rather than
inferred from its name.

`packages/db/README.md` — lane 05's four `## 0280`–`## 0283` sections were **spliced between 0279
and 0284**, not appended, by cutting both sides into whole sections and re-sorting by number. No
section's prose was merged into another. Result: `0273 0274 0275 0277 0278 0279 0280 0281 0282 0283
0284 0285 0286 0290 0291 0292 0293`, ascending.

Everything else auto-merged, and was checked: `en.json` (no duplicate key), `rig-meta.mjs` (111
exports, imports clean), `CONTEXT.md`, `manifest.txt`, `serve-built.mjs`, the runtime README.

### Lane 05's collisions (`c7ea63eed`)

**#929/0283 vs #936/0284 — a TYPE collision the build caught.** Lane 05's 0283 retires the 0045
adjustment-template arm of the plan-overlap advisory and re-keys every entry by `plan_id`:
`lib/plans/api.ts`'s `PlanOverlapWarning` and `lib/accruals/api.ts`'s
`AccrualCreated.overlap_warning` both now say "every entry is keyed by `plan_id`, never
`template_id`". Lane 06's correction form landed a cell whose fixture still built the retired arm's
shape, and `tsc --noEmit` failed on `components/accruals/accrual-correction-form.test.tsx:424` —
the only error in the whole tree.

Fixed in the fixture, not the type: `template_id` → `plan_id`, and
`kind: "adjustment_template_overlap"` → `"accounting_plan_overlap"`, the only kind that can still
fire. The cell's own claim — an overlap warning is PERSISTENT and does NOT block the correction it
reports — is untouched; which arm produced the warning was never what it was about. `kind` stays a
bare `string`, for the reason lane 05 wrote down (a stale client build reading an older server's
payload must still typecheck), so nothing but the fixture moved. 26/26 pass across that file and
its two neighbours.

**#1019 vs #997 — the count sentence again, one lane later.** Lane 05 adds
`e2e/adjustments-retired-walk.spec.ts` with no coverage-map row, so it belongs in the residual list.
`e2e/README.md` now reads 51 specs, 27 described, 24 residual, with the new spec named in its sorted
position after `accrual-walk.spec.ts` and the "These 24 checked-in specs" sentence agreeing.
27 + 24 = 51, so the partition `spec-discovery.test.ts` enforces still holds.

## Lane 07 — six conflicted files

`packages/db/package.json` — same ordered insert; 0287, 0288 and 0289 land between 0286's and
0290's. 105 tokens, none twice.

`packages/db/README.md` — lane 07's one numbered section (`## 0288`) spliced into place. 0287 and
0289 are documented in topical sections (`## The client birth wall (0287, #899)` and the
counterparty-merge section 0289 extends) which auto-merged; nothing was lost.

`apps/web/tests/firm-scope-db-pins.corpus.ts` — the reviewed dynamic-SQL barrier census. Both sides
were truncated by the marker (they shared one closing `},],`), so each side's last entry was
completed before the entries were re-sorted into the **file-sorted key order** the census requires:
`… 0260 · 0277 · 0279 · 0288 · 0289 · 0291`. 0288's and 0289's entries are lane 07's own; 22/22 pass.

`packages/db/tests/rig-meta.mjs` — three hunks. The cohort definitions and the `cohortFailures`
guards took both sides in migration order (the guard hunk sharing a closing `}`, written out
explicitly as in earlier lanes), and the **WRITERS grant-matrix census kept both hunks**: #899's
`...CLIENT_BIRTH_WALL_0287_HUMAN_FNS` spread appended after HEAD's 0276/0277/0279/0284 spreads.
#1012's own edits to that file (the two "RETIRED IN PLACE" notes on the seeding doors, which stay at
their exact grants) auto-merged. Verified mechanically rather than by eye: **every added line of
lane 07's `rig-meta.mjs` diff is present in the merged file and every removed line is gone (0 and
0)**, and the same check passes for HEAD's own additions. 112 exports, imports clean.

`packages/db/tests/x42-s5-helpers.mjs` — a genuine two-sided edit to the SAME line of the
`S5_25_BARE_TOKEN_ROSTER`. Lane 05's #927/0282 removed `sign_adjustment_template` from it; lane 07's
#1012/0288 removed `tick_seeding_proposal` from it. Both lanes use the identical mechanism — a name
that stops stamping a clock leaves the base roster and is pushed back by a REVERSE-gated cohort — so
**both removals stand**, and the comment now names both. Verified: none of the five retired names
(`sign_adjustment_template`, `tick_seeding_proposal`, `begin_client_onboarding`,
`create_seeding_batch`, `decline_seeding_proposal`) remains in the base roster, and all four cohorts
(`ADJ_TEMPLATE_DOORS_PRE_0282_*`, `SEEDING_LANE_RETIRED_0288_*`, `BIRTH_WALL_0287_*`,
`BIRTH_WALL_0287_MOVED_*`) are live.

`packages/db/tests/opening-ledger-source.test.mjs` — **five hunks, and the most interesting file of
the pass: lane 06 and lane 07 independently found the same defect in the same wave and fixed it the
same way.** The battery's premise probe demanded the registry publish EXACTLY version 2, and the
registry is a mutable published value, so the battery went dark the day a neighbouring migration
republished it. Lane 06 (ADV-03) and lane 07 (W3L07-ADV-04) both turned it into a floor.

Resolved by keeping the mechanism both agreed on and both lanes' evidence: lane 07's constant and
guard (`MIN_PUBLISHED_REGISTRY_VERSION = 4`, with `Number.isInteger` in front of the comparison),
because 4 is the version this file's expectations were last re-derived against and the number lane
07's own 0288 publishes — which `document-capability-registry.test.mjs`'s
`PUBLISHED_REGISTRY_VERSION = 4` independently pins; plus lane 06's measurement, which lane 07's
text did not carry (12 tests / 0 pass / 12 skipped on clara_l06 under the full gate chain) and its
cross-reference to 0207's monotonic wall. The cell TITLE took lane 07's wording because the merged
cell BODY is lane 07's: it asserts `browser_entrance` is `undefined` ("a retired lane has no
entrance to be missing"), so lane 06's "the missing browser entrance is NAMED" had become false.

## The chain-order collision — the one a merge cannot see (`ba54ad2bd`)

This is what the cross-pin list is for, and it only appeared once lane 05's own fix rounds had
landed.

Lane 06's `0284_accrual_correction.sql` pins `clara.revise_accounting_plan`'s prosrc sha256 at
`87c9f1e9…`, unconditionally, in BOTH its prestate and its tail. It does so deliberately — its
header records that it chose the "dedicated correction door" shape over "the plan revision door
writes the accrual detail" *because* "lane 05 (#908) … pins `clara.revise_accounting_plan`'s body as
UNCHANGED …, so a migration in THIS lane that recut the plan-revision door's body would collide with
lane 05's own pin at integration". It nests that door and pins it to prove it did not move.

**Lane 05's later fix round changed the premise.** `0283_retire_plan_overlap_template_arm` (#929)
recuts the plan lane's three writers — `create_accounting_plan`, `revise_accounting_plan` and
`_accrual_plan_core` — so each takes the client advisory rung above the plan row lock and passes its
own plan id. 0283 records both values as literals in its own prestate: pre-image `87c9f1e9…` and its
own output `8a6e69ef…`. 0283 sorts BEFORE 0284, so on the integrated chain 0284's prestate measures
`8a6e69ef…` and raises `CLR10 … has DRIFTED from its measured pre-image`. **Each lane is green
alone; the chain is not.** Nothing in the merge surfaces this — only applying the migrations does.

Fixed by accepting that ONE signature at either value, in both blocks, with the reason beside it.
Every other pin in both arrays stays exact, including the four op-plumbing bodies lane 07 also pins.
Neither sha was measured by me: both are literals lane 05's own 0283 carries, which is why this
needed no database. A bimodal pin rather than a re-based one, because re-basing to `8a6e69ef…` alone
would refuse on every `db-slice-frontiers` leg pinned before 0283.

Consistency checked across the whole wave: 0280 and 0281 also pin this body, both at the PRE-image,
and both apply before 0283 — correct, and untouched.

**For the gate worker:** this edit changes 0284's file checksum, so a database that has already
applied 0284 will refuse it as modified (`migrate.mjs`'s immutability check). Build from scratch —
which the wave already requires. **Confirm on the rig that 0284's prestate prints "clean" behind
0283; that is the one claim here no static check can make.**

## Migration roster — COMPLETE

`packages/db/migrations` holds **288** files. From 0273 up, **21 files, 0273 to 0293, every number
exactly once, no gap and no duplicate** (checked across all 288, not only the new ones):

```
0273 vendor_binding_write_doors_revoked    lane 01      0284 accrual_correction                lane 06
0274 trade_invoice_party_tin               lane 02      0285 prepayment_term_liveness          lane 06
0275 trade_invoice_duplicate_probe         lane 02      0286 opening_source_reread             lane 06
0276 cash_account_set_membership_read      lane 03      0287 client_birth_wall                 lane 07
0277 fa_default_depreciation_policy        lane 04      0288 seeding_lane_retired              lane 07
0278 fa_belt_birth_convention              lane 04      0289 merge_alias_lane                  lane 07
0279 fa_closed_year_arrears                lane 04      0290 document_regions_field_path_check lane 08
0280 plan_schedule_yield_wall              lane 05      0291 bank_statement_line_citation       lane 08
0281 plan_overlap_sibling_arm              lane 05      0292 fa_policy_enrolment_congruence    lane 04
0282 retire_adjustment_template_doors      lane 05      0293 fa_arrears_judgement_scope        lane 04
0283 retire_plan_overlap_template_arm      lane 05
```

The gate chain carries **105** `--import` tokens, none twice, and its 21 wave-3 gates read
`273 274 275 … 293` — ascending AND contiguous, every one of them after the 0272 gate, with the
pre-0273 prefix untouched.

## The cross-pin list, final (for the gate worker)

Recomputed over the complete 0273–0293 chain. **Seven bodies are touched by two or more lanes, and
one of them now carries a RECUT** — that one is the collision fixed above.

| body | lanes | who touches it, and how |
|---|---|---|
| `clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)` | **05, 06** | pin 0280 · pin 0281 · **RECUT 0283** · pin 0284 (bimodal since `ba54ad2bd`) |
| `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` | 06, 07 | pin 0284 · pin 0286 · pin 0287 |
| `clara._finish_op(uuid,text,text,jsonb)` | 06, 07 | pin 0284 · pin 0286 · pin 0287 |
| `clara._hash(jsonb)` | 06, 07 | pin 0284 · pin 0286 · pin 0287 |
| `clara._reserve_op(uuid,text,text,bytea)` | 06, 07 | pin 0284 · pin 0286 · pin 0287 |
| `clara._human_ctx(integer)` | 06, 07 | pin 0284 · pin 0287 |
| `clara.role_rank(text)` | 03, 06 | pin 0276 · pin 0284 |

The five op-plumbing bodies are the ones lane 06 and lane 07 both pin, as the work order expected:
all six touches are PINS of bodies no wave-3 migration recuts, so they agree by construction — but
they are the pins most likely to move if anything outside this wave lands between them, because each
is an unconditional `sha256(prosrc)` equality. `clara.role_rank` is the same shape across lanes 03
and 06.

Order-locked pairs inside a lane, preserved and listed so a reorder is visibly wrong: 0274 → 0275
(lane 02, the party resolver), 0277 → 0278 → 0292 and 0279 → 0293 (lane 04), 0281 → 0283 (lane 05,
`_plan_overlap_warning` recut twice), 0285's bimodal pre-image pair (lane 06), 0288's and 0289's
splices of `list_review_queue` and `merge_counterparties` (lane 07), 0291's two splices (lane 08).

## Checks on the final head

| check | result |
|---|---|
| conflict markers, whole tree | clean |
| `packages/db/package.json` + `apps/web/package.json` | both parse |
| migration roster | 288 files, 0273–0293 complete, every number once |
| gate chain | 105 tokens, unique, wave-3 gates ascending and contiguous 273–293 |
| `node scripts/check-frozen-workflows.mjs` | **OK**, manifest unchanged — 312 frozen files, 55 `use workflow` modules, 3 retired |
| `node scripts/ci/world-gate.selftest.mjs` | **world-gate selftest: OK** |
| the five e2e censuses + pins corpus + token contrast | **103/103 pass** |
| `apps/web` FULL unit suite (`pnpm test`) | **4,986 tests, 4,984 pass, 0 fail, 2 skipped** |
| `packages/runtime` suite | 2,364 tests, 77 fail — **byte-identical failure set to the pre-pass-2b head `38a9a91a2`** (same 77 files, no regression, no fix); they are this Windows rig's environment: no `pg_dump` on PATH, the DB-backed consumers, and Defender blocking the EICAR fixture |
| `pnpm typecheck` | clean |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |

Database and browser suites not run, per the work order. The runtime baseline comparison was made by
checking out `38a9a91a2`, running the same command, and diffing the failing-file sets — empty both
ways.

## What the gate worker inherits

1. **Build the migration chain FROM SCRATCH.** Two independent reasons: lane 07's 0287–0289 sit
   below 0290–0293 by number (fine on a fresh chain and on the hosted upgrade from 0272, refused by
   `migrate.mjs:385` onto a frontier at 0290+), and `ba54ad2bd` changed 0284's checksum, which
   `migrate.mjs` refuses on a database that already applied it.
2. **Confirm 0284's prestate behind 0283.** The one claim in this pass that no static check can
   make. If it refuses, the remedy is in the commit message: 0283's own prestate carries both shas.
3. **Watch the six unconditional op-plumbing pins** (`_audit`, `_finish_op`, `_hash`, `_human_ctx`,
   `_reserve_op` across 0284/0286/0287, and `role_rank` across 0276/0284) — they agree today and
   will red together if anything recuts one.
4. **The web censuses are live on this branch.** Any later cell must settle before every scan and
   declare a budget sized to its own waits; any new spec file moves `apps/web/e2e/README.md`'s count
   sentence. `e2e/settle-before-scan-census.test.ts`, `e2e/cell-budget-census.test.ts` and
   `e2e/spec-discovery.test.ts` are cheap, need no browser, and caught four collisions across this
   wave.
5. **Next free migration number is 0294.**
