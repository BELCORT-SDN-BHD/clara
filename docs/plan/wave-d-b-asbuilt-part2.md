# Wave D-b — the AS-BUILT record, part 2 (confirming round → close)

> Continues `wave-d-b-asbuilt.md`. Same authority (ADR-058). §7 the confirming round · §8 the
> fix waves · §9 the PR chain and the three merge gates · §10 the ceremony · §11 the
> acceptance · §12 the D-b2 (`0045`) hold-ladder inheritance register · §13 the archive branch
> and the do-not-restore list · §14 the standing law this wave added.

---

## 7. The confirming round — five reviewers over the intermediate frontiers

The split created a new class of risk the monolith never had: **the intermediate frontiers
are production states.** Between `0042` and `0045` the live database runs with half of a
family's law installed. Five reviewers attacked exactly that — three slice lenses (opus,
one per shipping slice), a cross lens (opus, 89 probes, over the fork machinery / drills /
contracts / `ci-split.patch`), and Codex `gpt-5.6-sol` read-only over the whole split.
**Close rule: mechanism-free across all five → ship; any money mechanism → fix wave first.**
It fired. **34 findings.**

**TWO money mechanisms, each independently confirmed by two reviewers:**

1. **The phantom staff advance at frontier `0044`** (Codex CX1 ≡ native CF-B3-1, probed:
   `x42.prod-27` fails at the frontier). The `bank_rule_suggested` producer is GRANTED at
   `0044` while its six-axis approval guard lives in HELD `0045` — enrol during the draft
   window → checker approves → `_adv_on_approve` births a staff advance for money nobody
   received. E16's "courtesy" adjudication was **called unsound on this axis and overturned.**
   **MINIMAL ROOT FIX: withhold the producer's `clara_authenticated` grant at `0044`; the
   single guarded grant lands with `0045`.** That one move also kills CX2 (revise a suggested
   draft), CX4 (rollback asymmetry — outstanding suggestion drafts surviving producer
   revocation), CF-B3-2 and most of CX3.
2. **The disposed-asset walk gate at frontier `0042`-only** (native CF-B0-1, probed live).
   S5.15's reservation release is live but S5.19's walk gate is D-b1's, so a disposed asset's
   code passes the bank door and puts an **UNCLEARABLE permanent difference into
   `fa_register_tie`**. FIX: pull S5.19's `_fa_included_at` forward into D-b0 (the E6
   precedent).

**One blocker that was neither money nor tooling:** CF-B1-1 — the D-b1 PR **does not
typecheck** (probed via shadow `tsc`). The per-slice surface roster must be an
**IMPORT-CLOSURE list with named consumer edits**, not a keyword-graded file list. This is
E29 arriving from the other direction: the dashboard splits with the DB.

Codex's remaining findings: **CX3** (the assignment rule launders red safety cells into
D-b2's list → **law: a test for a granted verb belongs NO LATER than the grant slice**) ·
**CX5** (pre-numbered slice files violate numbers-at-MERGE → a template + allocate-at-merge
procedure) · **CX6** (E8's raw-comment idempotency token: a lawful hotfix comment naming
`clara._adj_on_approve(` bricks `0045`'s splice → test call-absence on comment-STRIPPED SQL)
· **CX7** (fork prologues import D-b3-only helpers; early-PR CI dies at module load) ·
**CX8** (`ix_ble_line` `IF NOT EXISTS` with no indexdef postcheck) · **CX9** (`0044`
re-factors clock-bearing verbs but omits an S5.25 rerun) · **CX10** (key-split of S5.10 —
**ADJUDICATED AGAINST**: E7's probed containment stands, a second lens concurs; recorded as
a residue, not a debt).

The cross lens returned **zero money mechanisms in the machinery** and four blockers in it
(a hyphenated DB identifier that kills every matrix leg · the patch cannot land whole at the
first PR · the helper closure is FOUR modules, with the law that **a fork's shipping set is
the transitive closure of its prologue** · §7 must list modified CONSUMERS, not just new
files), plus eleven courtesy/notes. **Clean measurements banked:** forward compatibility
(every earlier list green at every later frontier, zero regressions) · the D-b0 PR
self-contained end-to-end on a realistic checkout · totality closes · role deltas measured
69/69/69/71 runtime and 181/188/189/201 authenticated.

## 8. The fix waves — W-A, W-B, W-C → V1 → the light re-confirm → W-E

- **W-A** (d-b0 + d-b1): CF-B0-1 closed by an S5.19-b0 canonical byte-lift (+153 lines). The
  finding's own probe both ways: `0041` reserved/in-walk `1/true` · OLD `0042` released
  `0/in-walk TRUE` (the blocker) · NEW `0042` in-walk `FALSE`; convergence proven by
  `fa_register_tie` at the D-b1 frontier being sha-IDENTICAL to the whole unit. D-b1's
  prestate 3→4; a NEW `0043` onto an ungated `0042` is REFUSED by name.
- **W-B** (d-b3 + d-b2): **the money fix.** The producer grant is withheld at `0044` (an
  assert block proves no authenticated EXECUTE on the live catalog) and lands as a single
  guarded grant in `0045`. Lens instrument: **42501 at `0044`**, body-level refusal on the
  full chain AND on the whole-unit twin identically. Twin re-measured: diff 0. Battery
  281/25/112 → 274/32/112 — **the delta is EXACTLY the 7 producer cells at 42501**, nothing
  else moved. Grant arithmetic closes: authenticated 190→189 at `0044`, 201 at `0045`
  (= twin); D-b3 +1, D-b2 +12; 189+12 = 201. Also CX8's indexdef postcheck and CX9's S5.25
  rerun — **CX9's premise was FALSE as written** (the whole-unit roster verbatim FAILS at
  `0044`), so it shipped lift-then-narrow with a guard refusing if any of the six D-b2 names
  appears, non-vacuity proven by planting both defect classes.
- **W-C** (the fork machinery): all 13 wiring items + the four inter-lane handoffs. `dbtag` DB
  names; per-leg presence gates; the totality gate lifted into its own DB-free job so
  `0045`'s hold cannot hostage it; a renumber-proof drill-exclusion regex; measured
  `LATER_SLICE_BODIES` (24+16+36=76) verified against the cross lens's decoys; §7 rebuilt as
  new-files + consumer-edits rosters with two runnable instruments (`closure.py`,
  `shadow-typecheck.sh`); **`RENUMBER.md` written** (CX5); the producer-cell move applied
  (8 cells / 4 files).
- **V1 — the all-lanes integration verification: PASS, 11/11 exact.** Regeneration
  byte-identical; chain + zero-client clean first attempt; 4/4 re-apply and both wrong-prefix
  refusals by name; the twin's 14 axes at zero diff on the FINALS; battery 415/0/3 on chain
  AND twin with an identical per-file sweep sha; lists and drills at their floors; the
  `0042`-only PR simulated end-to-end.
- **The light re-confirm** (a fresh native lens + Codex over the fix-wave deltas): **MONEY-FREE.**
  All five original findings CLOSED BY PROBE — `has_function_privilege` false for every
  `clara` role at `0044`, `proacl` owner-only, no `pg_default_acl`, no security-definer
  internal caller, **exactly one function in the cluster names the producer**; no draft can
  exist, so CX2/CX4 die at the source; an early operator grant at `0044` converges `0045` to
  the twin's exact ACL, so the guarded grant cannot refuse a lawful deploy. Eleven findings,
  **all in the unshipped PR-time wiring**: RC1 (the withheld-grant assert is narrower than its
  claim — widen to the complete non-owner ACL roster) · RC2/LENS-1 (**the blocker**:
  derived-drill selection keys on the NUMBER, so a lawful hotfix claiming `0043` reds main CI
  → key on the stable migration SUFFIX) · RC3 (`RENUMBER.md` never renumbers the assembler
  OUT) · RC4/LENS-3 (numeric pins missed by the inventory) · RC5 (all-or-skip presence gates
  let a PARTIAL landing skip green) · RC6/LENS-2 (the ledger's shas match nothing on disk).
- **W-E** — all eight items landed: name-keyed CI selection · none-or-all gates failing
  partials BY NAME · `CLARA_SLICE_NUM`/`CLARA_PRED_NUM` tokenised assembly with a verified
  output path (no-arg = byte-identical finals, PROVEN) · stable-name regexes + an exhaustive
  renumber inventory · the ledger re-measured from the finals · 20 staging copies refreshed
  ("build/ is the sha of record") · the S5.19 mixed-halves message now names its own case ·
  RC1's widened asserts with FOUR non-vacuity plants. Verification: the CI scenario matrix
  21/21 · a **`RENUMBER.md` dry run** (follow the procedure verbatim in a copy, allocate
  `0056/0057`, prove the artifact correct end-to-end; negative control refused-and-deleted).
  **The confirming loop is DRY for the ship slices.**

## 9. The PR chain — three merges, three Codex gates

Every slice landed through the same arc: worktree-isolated construction from its shipping
set → local full verification → real-CI green in BOTH contexts → **Codex merge gate** → a fix
lane where findings demanded → merge under the standing grant.

- **#182 D-b0** (`ace9326`, 49 files, +15,265/−236). Two **pre-existing** lint blockers
  surfaced (identical on the un-split tree — the wave had never run `pnpm lint`; instrument
  lesson recorded): the binding-post-control gate failing closed on a census read, and 35
  eslint `no-unused-vars` from the fork-prologue idiom. **The merge gate's two teeth:**
  **MB1** — the first exemption fix was **FAIL-OPEN**, with five probed evasion shapes
  (`v_cmd := replace(v_def,…)` + execute · array assignment · `EXECUTE..INTO` misread as a
  binding · `EXECUTE..USING` dropped · a string literal `'into v_safe'`) all passing.
  Adjudicated fix: collapse to the **STRICT CENSUS GRAMMAR** (`select count(*) … into
  <scalar>`, `functiondef` only in the predicate, the variable never in any execute text);
  everything else fails closed as before, and the five shapes become permanent negative
  selftests. **MB2** — the exactly-one invariant becomes an **ENFORCED ALLOWLIST** (a const
  in the script; **any new exemption turns the gate red and is a review event**). Plus SF3
  (orphan-drill partial landing fails by name), SF4 (contracts get their own roster), SF5
  (a machine-local `psql` path removed from a committed test). Shipped at `3037c1e`, verified
  with the gate's own probes: 16/16 selftests, five evasion shapes red, allowlist enforced
  both directions, the wiki gate provably untouched (93/93 CoR patches identical).
  **Tree-wide exemption census = EXACTLY 1**, printed as an audit line on every success.
- **#183 D-b1** (`da1beb2`, 41 files, +13,116/−19). Gate **CLEAN**, two notes only (the
  `gitleaks:allow` marker count corrected to four — all the same non-secret client UUID; a
  trailing blank line at the migration EOF **WAIVED**: sha `1a1e6ba8` is the thrice-verified
  artifact of record and cosmetic whitespace never justifies moving reviewed bytes). Merge
  was blocked at the first attempt by the **push-context interview-e2e flake** (red on
  `main@ace9326` itself; the `pull_request` context passes) — re-run green, merged.
- **#184 D-b3** (`dda9655`, 36 files, +13,842/−66; both CI contexts green first run).
  **The gate's real tooth: MG1, the show-B-settle-A bug.** `ExceptionBookingFields` cleared
  the DISPLAYED items on a counterparty/kind switch but preserved `allocations`, so the
  payload still carried the previous party's item IDs — **and the DB derives the counterparty
  FROM those IDs.** The UI could show party B while silently settling party A. Fixed by
  clearing on both transitions, restricting the payload to the current `openItems` (walled at
  the model level) and a switching regression test. Plus MG2 (refund quadrants left submit
  enabled into a known refusal), **MG3** (the ACL header falsely claimed both verbs granted —
  the HEADER-TRUTH precedent, **no waiver**: generator-driven reword, the sha moves once and
  the ledger + staging refresh with it → final `c1ce10c2`), MG4b (test whitespace).
  **Also found by RUNNING the battery at `0044`:** x37/x38/x40 carried UNASSIGNED D-b3 hunks
  — the totality gate partitions only x41/x42. Triaged; the `x40.am` producer-caller cell
  DEFERRED to D-b2 with an in-source note.

**The gate cycle earned its cost every time.** Three sittings, three different classes: a
security-gate fail-open, a clean pass, and a money-UI blocker no DB probe could have seen.

## 10. The ceremony (2026-08-05, owner GO)

Recipe: the D-a pattern (`wave-d-a-fa-design-part2.md` §ceremony). Pre-flight: live frontier
`0041` / 40 migrations / 4 firms / 508 functions.

**HAZARD CAUGHT AT PRE-FLIGHT:** the ceremony's migrate runner resolved its DB path to the
**WAVE CHECKOUT**, which still carries the uncommitted whole-unit `0042`. The ceremony ran
instead through a **main-pinned runner** aimed at a checkout verified `≡ origin/main dda9655`,
with all three shas confirmed in-tree before a single statement ran.

Quiesce (`fly machine stop` → 130s) → runtime sessions 0, active 0 (25→7) → **apply
`0042→0043→0044` CLEAN ON THE FIRST ATTEMPT** (43 total; every in-txn tail census passed on
production) → **postverify 12/12 EXACT**: frontier `0044` · authenticated grants 189 ·
runtime grants 69 · `producer_authed` **FALSE** (the money fix, live) · composite TRUE · the
4 new tables RLS-FORCED at 0 rows · adjustment tables 0 (D-b2 held) · `ea1955` seed 3 · the
advance belt trigger 1 · functions **563** (= twin 599 − D-b2's 36) → `NOTIFY pgrst, 'reload
schema'` → restart → `/ready` 200, checks 2/2, **Supavisor 32 sessions** (12
`runtime_login`, 0 active; cap 60). **Runtime remains v53 — zero deploys.**

## 11. The acceptance

### 11.1 Sandbox — ROME PUBLIC ADVISORY / Fictional Test Services, every artifact SYNTHETIC-labelled

Executed as **ONE THREAD, end to end, through the production verbs** — not a checklist of
isolated drills:

a synthetic Nov-2026 statement PDF → **the live intake transport** (the restarted runtime's
first task; Azure OCR done) → attribution **ABSTAINED honestly** (two rules, fail-closed
≥0.95 on a fabricated doc) → **the live agent SAW the unassigned document and REFUSED to file
it, naming the human's door** → the human two-step (`record_client_resolution` 1.0/human →
`file_document`) → `set_document_kind bank_statement` → `enter_bank_statement` **CHAINED to
October's closing** (349,490 → 337,490; the `duplicate_period` wall fired honestly TWICE
first — Aug and Sep are C-c corpus, preserved untouched) → `except_bank_line` (disputed) →
**`resolve_and_book_bank_line` in ONE ACT**: resolution minted + entry APPROVED + match LIVE
+ exception resolved, line −12,000 = entry −12,000 → **`_adv_on_approve` BIRTHED advance
`76adf913`** (3,500 · RM120 · issue 2026-11-15 · entry + disbursement-line double-bound) →
`complete_staff_advance_particulars` (the incomplete→complete nudge surface worked) →
`staff_advance_summary` (EA-1955 `policy_notes` speaking, `days_outstanding` 15) →
**`staff_advance_tie` TRUE, DIFFERENCE EXACTLY 0** → `reverse_entry` walled BY NAME
(`live_bank_match_present` — the match wall structurally precedes the advance admission
chain) → **`accept_bank_rule_suggestion` 42501 ON PRODUCTION** (the money instrument's final
firing).

**Walls fired by name en route**, each a live acceptance cell: `advance_enrolment_invalid`
(a control-class code refused, remedy followed) · CLR01 ×2 (attribution demanded before draft
AND before file) · `duplicate_period` ×2 · `bad_type` · `live_bank_match_present` · 42501.

**All four structural invariants witnessed live:** attribution fail-closed · provenance (a
statement requires the sha-bound filed document of the right kind) · wake authority (the
agent refused to file) · write authorization (42501 at the ROLE, not in prose).

### 11.2 The real half — the NAMED, MEASURED deviation

Executed against the owner's directed scope (`RS - YA2025\` and `Rome Properties YA2025
Files\`, read in full: P&L, BS, GL, JVs). Evidence:
`recovered/real-half-acceptance-evidence-2026-08-04.md`.

**BOTH real clients are in STRIKE-OFF; no open real period exists.** RPR's GL runs
10/02/2025–08/12/2025 (a cessation cut, not an FYE) with a 2/12/2025 strike-off secretary
invoice, bank driven to 0.00 on 5/12/2025 and a director's debt waiver on 8/12/2025; RS's
first period 05/05/2025–31/03/2026 carries a 6/3/2026 "STRIKE OFF COMPANY FEE" and both banks
at 0.00 by 19/3/2026. Both end at a final net loss of exactly RM1,000.00 = share capital.
There is **no going-concern real client on which a live recurring template can run**, and
RPR's nine Clara months are closed-reconciled at difference exactly 0 (ADR-054) — booking
replayed accruals into them would disturb byte-verified receipts.

The deviation is **strictly stronger than D-a's** because it CITES the real pattern: RPR's
month-end salary-accrual JV series (RPRJV-202507/001 … 202510/001, three of them identical to
the sen) is exactly the mechanism D-b2 automates, and the sandbox template was modelled
structurally on it. Nothing was booked on real books; nothing was fabricated. The first LIVE
real template defers, named, to the first going-concern client — the ADR-056 precedent.

## 12. The D-b2 (`0045`) hold-ladder inheritance register

`0045` is BUILT, twin-proven and PARKED. It ships **no round-11 fix by design**. Its ladder
inherits, in one list:

1. **The round-11 fix list** (its agenda; every subject is a body or table created in `0045`,
   so no other slice has to move): the period-membership wall (a declared edge needs its own
   period wall independent of shape) · P1's period-blind prohibition · the period-overlap
   advisory + the false in-source justification · the single-live-successor law · the
   `truncated` dangling-pointer flag (the ancestry walker fails OPEN) · the declare/render
   surface chain (XP2 — the lineage feature is inert in the product) · `pair_already_active`
   returning before the admission authority · the parked-pair completer (a reload strands a
   high-stakes park).
2. **CX6** — the E8 comment-token hardening: test call-absence on comment-STRIPPED SQL so a
   lawful hotfix comment cannot brick the splice.
3. **The declared-party cross-check question** (recorded by the #184 merge gate): should
   `resolve_and_book_bank_line` carry a DB-side declared-party cross-check so stale-ID
   payloads are refused **structurally**, not only walled in the UI? **The contrast is
   concrete:** `settle_from_bank_line` takes an explicit `p_counterparty uuid` — the caller
   DECLARES the party — while the composite **derives** it from the items named. MG1 was
   fixed at the UI; the structural question is open.
4. **The D-b3 lane inheritance, itemised:** the `x40.am` producer-caller cell · the
   `StatementDetail` chip thread · the `reconApi` producer wrapper · the `rig-isolation`
   cohort comment · **the cohort roster** (D1: `rig-meta.mjs` fails PARTIAL by design, so the
   roster lands with the slice that makes it whole) · the producer-cell files (8 cells / 4
   files, incl. `x42.prod-21` which was a FALSE GREEN — it asserted only that the call threw,
   so it passes on 42501).
5. **The producer's own grant** lands here as a single guarded S2.9-b3 block, and with it the
   seven `_adj_on_approve` arm-(3) cells (E16) and E7's `revise_entry` three-flags refusal.
6. **CX10 stands ADJUDICATED AGAINST** — the key-split of S5.10 is refused; E7's probed
   containment is the record. Do not re-open it.
7. Instrument notes: the twin-rig harness is reusable (after any fix the diff grows by exactly
   that fix) · the ONE `create or replace` in the file (`_wdb_rerun_breach`) is where a
   careless fix silently deletes D-b0's FA arms, and probe 7's `[SPLIT-CREATED]` anchor is the
   only thing that would catch it · `auto_reversal_of` goes 0-rows→live at this slice, so the
   drill should assert the TRANSITION · F10's runtime dormancy note (the
   reconciler-adjustments bundle is D-b2-coupled and ships with it).

## 13. The archive branch and the do-not-restore list

**`build/wave-d-b-0042` — NEVER MERGE.** It is the wave's working tree: the uncommitted
whole-unit `0042` and eleven rounds of in-tree state. It is kept as evidence only. Three
files on it are **known-stale and must NOT be restored over what shipped**:

- `x42-r7-fa-stamp` copies still carry the **dead `runPeriod`** (removed at source in #182).
- `ExceptionBookingFields.tsx` still carries **MG1/MG2** (the show-B-settle-A bug and the
  enabled-into-a-refusal submit).
- the `x42-af2-rebook` **trailing whitespace** the #184 gate removed.

The shipped versions are the truth. Anyone reconciling the wave tree against `main` reconciles
**toward `main`**.

## 14. The standing law this wave added

- **Migration numbers are claimed at MERGE — now with a procedure.** `RENUMBER.md` is the
  mechanism: templates, an exhaustive stable-name inventory (never prefix-only), the version
  as a shared assembler input with a verified output path, a re-measured ledger, and a
  dry-run that must be executed before an allocation is trusted.
- **The binding-gate exemption allowlist is EXACTLY ONE.** It is a const in the script,
  printed as an audit line on every success. **A second exemption turns the gate red and is a
  review event** — never a quiet addition.
- **A test for a granted verb belongs NO LATER than the grant slice** (CX3). A slice that
  grants a verb ships the cells that guard it; deferring them launders red safety cells into
  a later list.
- **A fork's shipping set is the transitive closure of its prologue** — and **the dashboard
  splits with the DB**: a per-slice surface roster is an import-closure list with named
  consumer edits, verified by a shadow typecheck, not a keyword-graded file list.
- **Ceremonies run a main-pinned migrate runner.** Never the wave checkout — a working tree
  can carry an artifact that was never merged, and the runner will happily apply it.
- **`NOTIFY pgrst, 'reload schema'` after any ceremony that adds RPCs.** PostgREST serves
  PGRST202 for new verbs until it reloads; the DB looks perfect while the dashboard 404s.
- **A probe that can error under `|| true` reports blank as success — force the locale, never
  trust the ambient.** Measured: this Git Bash's GNU grep 3.0 ignores ambient
  `LC_CTYPE=C.UTF-8`, and `LC_ALL=C` alone still fails; the `.UTF-8` form is required. Four
  assemblers reported "0 non-ASCII" for months; the real counts are 0/0/1/1.
- **A slice never rewrites or deletes comment text a prior slice installed in a live body**
  (part 1 §6.1). Grep `[SPLIT D-b` in a live body and the whole history is there.
- **A cross-section patch whose text says OPTIONAL is a PROPOSAL** — the applicator screens
  for advisory markers before applying anything mechanically.
