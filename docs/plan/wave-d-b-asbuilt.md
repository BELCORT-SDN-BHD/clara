# Wave D-b — the AS-BUILT record (the four-slice split)

> **Status: CLOSED (ADR-058, 2026-08-05).** This file and `-part2.md` are the as-built truth
> for Wave D-b. The DESIGN-time record is `wave-d-b-design.md` + `-abi.md` + `-part2/-part3`
> (ADR-057) — those describe a **single 0042 monolith that never shipped**. What shipped is a
> **four-slice split**: `0042` D-b0 · `0043` D-b1 · `0044` D-b3 LIVE; `0045` D-b2 **HELD**.
> Contract: `wave-d-contract.md` §4 D-b (WD-R8/R9/R10/R13). Rulings of record: WDB-G1..G16
> (ADR-057) — **never re-litigated here**. Part 1 = the ladder, the split and its two
> completeness proofs. Part 2 = the confirming round, the fix waves, the PR chain, the
> ceremony, the acceptance, and the D-b2 inheritance register.

---

## 1. What shipped

| Slice | Migration | Final sha256 | Lines | PR | Squash | Live |
|---|---|---|---|---|---|---|
| **D-b0** shared class authorities | `0042_wave_d_b0_shared_authorities` | `f701d3d1…` | 6,888 | [#182](https://github.com/BELCORT-SDN-BHD/clara/pull/182) | `ace9326` | ✅ |
| **D-b1** staff advances | `0043_wave_d_b1_staff_advances` | `1a1e6ba8…` | 5,607 | [#183](https://github.com/BELCORT-SDN-BHD/clara/pull/183) | `da1beb2` | ✅ |
| **D-b3** AF-2 composite + producer | `0044_wave_d_b3_af2_composite` | `c1ce10c2…` | 6,649 | [#184](https://github.com/BELCORT-SDN-BHD/clara/pull/184) | `dda9655` | ✅ |
| **D-b2** recurring adjustments | `0045_wave_d_b2_recurring_adjustments` | `f66f4631…` | 7,706 | — | — | **HELD** |

Live posture after the 2026-08-05 ceremony: **43 migrations, frontier `0044`** · runtime
**v53 untouched** (the slices ship no runtime change; dormancy proven pre-merge) · dashboard
from `main` · Supavisor 32/60. `0045` is built, verified and parked; **it claims its number
at ITS merge**, like every other migration.

The monolith of record it replaces: `0042_wave_d_b_adjustments.sql`, sha `6770ea84…`,
21,163 lines — never merged, never deployed, preserved on the archive branch (§13, part 2).

---

## 2. The as-built ladder — eleven rounds

Each round = three fresh native lenses (opus/sonnet, xhigh) + a Codex `gpt-5.6-sol` lens,
all contract-blind, each attacking the previous round's repair. **127 findings across
rounds 1–11** (rounds 1–8 = 83, the count the owner sitting quotes). The closing rule was a
mechanism-free round; it never came — which is the finding that produced the split.

| R | Subject | Findings | Mech-free votes | The defect that mattered |
|---|---|---|---|---|
| 1 | first contact | 9 (5 fixed, 4 open) | — | the advance belt's **unconditional reversal-mirror exemption** — a mirror of an unregistered movement walked through accounted for by nothing |
| 2 | the checksum-verified build | 13 | 0/4 | the **transaction-START watermark** as a visibility boundary (found natively AND cross-model); the producer minting a **phantom staff advance**; /advances and /rules both DEAD ON ARRIVAL |
| 3 | + the ROOT wave (owner: 以彻底根除问题为原则) | 8 | 0/3 | the exception REOPEN **double-booked** 84,000 of bank GL for one 42,000 line; the census found a **third claiming door nobody knew about** (`_draft_opening_item_core`) and is now self-enforcing |
| 4 | the post-root build | 9 (2C/4H) | 1/3 | — |
| 5 | the convergence test | 9 (2C/2H) | 0/3 | GUARD III (one body, one lock) — the bank booking invariant not yet converged |
| 6 | composition + seam | 7 (1C/2H) | 0/3 | two individually-correct repairs disagreeing exactly at their boundary |
| 7 | the class authorities | 16 | 0/4 | `fa_disposal` outside `_wdb_period_stamps()` → `_wdb_rerun_breach` refuses `correction_out_of_period` for the WHOLE client, **irreparably**; the shape gate was a per-LINE multiset where the law says account-SET |
| 8 | the round-7 repairs | 12 | 0/4 | the shape gate asked **"identical?"** where accounting asks **"collides?"** — six months re-posted unattended, `blocked:[]`, RM6,000-for-RM3,000 measured |
| 9 | the round-8 repairs | 12 | 1/4 | the **auto-reversal mirror invisible to the collision gate in all three terms** — two inverse templates drift RM2,500/mo with impossible natures, forever |
| 10 | the union-term gate | 16 | 1/4 | the remedy discriminant is a **status-snapshot proxy for lineage the schema does not record**; fails BOTH ways (a false assertion destroying RM6,000 of lawful accruals; propose-before-retire re-prints the doubling instruction) |
| 11 | over the owner's rulings | 16 | 1/4 | the **silent re-code double** (both defences shape-scoped) + P1's **period-blind prohibition** |

Eight fix waves ran between rounds (L1–L5 · M1–M5 · R9F N1/N2 · the O-wave O1/O2/O3 · P1
the lineage build). Every finding was reproduced before it was fixed and re-probed after.

**The pattern, stated once because it is the wave's central fact:** for **eight consecutive
rounds the worst defect of the round lived inside the previous round's repair.** The
families were not equally guilty — advances, AF-2/bank and the FA residuals went dry and
stayed dry across multiple rounds and every lens; **every surviving mechanism lived in ONE
family, recurring adjustments** (s2's gate/remedy/lineage complex and its correction
surfaces).

Instruments earned their keep repeatedly and are recorded as such: the arm-(D) clock census
refused the first round-8 integrated assembly (drift across two individually-green lanes);
the upgrade drill refused the same assembly (a zero-client database — CI's own shape); the
model's gloss census flagged an unraisable gloss; the assembly's own `migrate` caught an
advisory patch applied as if it were mechanical (**lesson: a cross-section patch whose text
says OPTIONAL is a PROPOSAL — the applicator must screen for advisory markers**).

---

## 3. The owner sitting and the grant resolution (2026-08-04)

Drafted at the round-8 close as ONE sitting covering every open ruling; resolved under the
owner's blanket grant *"you have all permission and any GO i gave you, execute when you
think is the perfect timing."* Adjudications, each per the recommendation already on the
document:

- **THE SPLIT → whole-ship, CONDITIONAL** — the split's evidence was judged superseded by
  rounds 9–10 converging; **the condition was a hard rule: if round 11 finds another money
  mechanism, the unit is proven non-convergent and the SPLIT becomes the executed ruling.**
- **The G13 lineage fork → BUILD option (b)** (`replaces_template_id` recorded at re-propose)
  — round 10 proved the status-snapshot proxy fails both directions, and WDB-R1
  (root-not-symptom) makes the additive stamp the mandated root. Built as lane P1.
- **Task #61 (bank in the reservation union) → (a) leave as-is** this wave, duplication
  documented (promotion is a product change: a bank account would refuse against its own row,
  and template lines/coding suggestions would start refusing bank codes).
- **The excepted-advance-repayment door → (c) scope out**; the shipped honest interim IS v1
  law (the corridor was measured never advance-specific).
- **The real-half acceptance → STILL THE OWNER'S, non-delegable** — naming an accrual on a
  real client's books is a business fact; "all permission" cannot authorise fabricating one.
  If none is named the wave closes on an honest NAMED deviation (the ADR-056 precedent). It
  closed that way; the measurement is §11 of part 2.
- Residues ACCEPTED for v1: the due-oracle T×E wall clock · R5 (auto-post reachability at
  acceptance) · R8 attestation ("non-blank" is the whole bar) · the TAIL-19 non-widening.

**Round 11 found two money mechanisms plus a repair-regression class, quadruply confirmed by
Codex. The condition FIRED. The split became the executed ruling** — not as a preference but
as the discharge of a rule written before the evidence existed.

---

## 4. The split — the census and the four slices

`split-dependency-census.md` (the partition map) measured the monolith on a rig
(`clara_0042_p1`, sha `6770ea84…`) against frontier `0041`: 7 new relations · 4 column/
constraint additions on pre-existing tables · 40 new indexes · 17 new triggers · 14 RLS
policies · 21 `clara_authenticated` verbs + exactly 2 `clara_runtime` verbs · 3 registry-row
families · 91 new + 35 recut function bodies · 21 tail blocks · **23 cross-slice dependency
edges in five classes** (A misfiling · B the reservation union · C the approve hook · D the
re-run gate · E late-table reads in D-b0 splices). Ship order throughout:
**D-b0 → D-b1 → D-b3 → D-b2**.

Each slice was assembled from **canonical section files by deterministic generators**
(`work/gen_s*.py` + a role-balance-asserting `assemble.sh`), regenerable byte-for-byte, and
verified on its own throwaway rigs. **The repo migration is GENERATED, never hand-edited.**

| Slice | Cut regions verbatim | Byte-exact canonical | Role scopes | Split markers |
|---|---|---|---|---|
| D-b0 | — (5 sections) | — | 26/26 | 43 |
| D-b1 | 65/65 | 4,583/5,576 (82.2%) | 7/7 | 43 |
| D-b3 | — (5 sections) | 5,560/6,060 (91.7%) | 3/3 | 25 |
| D-b2 | 45/45 | 6,861/7,580 (90.5%) | 6/6 | 41 |

Chain verification, every slice: apply clean on the `0041` template in order · a ZERO-CLIENT
`0001→N` fresh chain clean (the CI shape) · re-apply refused by name · every wrong-frontier
apply refused at probe 1 by name. Sections that **moved WHOLE** were proven by `diff`, not
asserted: D-b1's S3 (0 lines removed) and D-b3's S4 (zero lines against the canonical
section) — the r11 prediction "the AF-2/bank family is DRY" verified rather than believed.
(D-b3's S4 claim was **amended by fix-wave W-B**: the money fix removes 2 canonical lines and
adds 70 authored ones; 4,434/4,436 remain byte-exact. Recorded, not hidden.)

Three guard proofs were **fired by name on purpose-built rigs rather than argued**: dropping
`_wdb_rerun_breach` → D-b2's probe 7 refuses (without it, `create or replace` would silently
create a body with no FA arms and D-b0's two callers would lose their gate); dropping D-b3's
`_wdb_suggestion_lines` → probe 7 refuses; removing D-b1's advance-hook line from
`_subledger_on_approve` → probe 11 refuses.

**HELD was honoured literally in D-b2: not one round-11 finding is built.** The canonical
sections predate the round-11 record, so faithful extraction leaves the entire fix list to
D-b2's own hold-ladder (§12, part 2).

---

## 5. Errata E1–E30 — the census's own defect register

Every slice lane appended errata as it measured the census. Canonical numbering: R1's E1–E6,
R2's E7–E11, R3's E12–E18, R4's E19–E23, then lane F1's seven (locally numbered E19–E25) map
to **E24–E30** (F1-E19→E24 … F1-E25→E30; references inside `PARTITION.md` cite the local
numbers).

- **E1** (resolved) a 23rd cross-slice edge — D-b0 ships the re-run ENFORCEMENT so it must
  also ship S5.9's correction-date half, else reverse-then-rerun is refused CLR38 forever.
- **E2/E3/E4** census imprecisions (S5.15f consumer count; probe 7's 13 S5 subjects; probe 6
  omits `_assert_due_read_ctx`). **E4's direction was later found unhonourable as written**
  (E19): the body EXISTS by D-b2, so a negative pre-state probe naming it would refuse a
  correctly-ordered deploy.
- **E5** the S5.25 arm-(D) roster needs `settle_from_bank_line` in D-b0/D-b1; **E12** its
  residue is a COVERAGE GAP, not a wrong roster (the delta is exactly three names, and the
  whole-unit roster is already the post-D-b3 truth).
- **E6** (adjudicated → pulled forward) S5.12's `fa_depreciation_authorities` guard arm is
  pure D-b0 — the census misassigned it.
- **E7** between D-b1 and D-b2, `revise_entry` does not refuse a draft carrying the
  `staff_advance_application` key. **PROBED, not argued:** the revise succeeds, the approve
  is REFUSED CLR40 `advance_application_missing` by the ONE authoritative guard (two callers,
  the verb AND the act), zero register rows born. A COURTESY gap, not a money hole. Splitting
  S5.10 into a third form was REFUSED (its flags, its pair refusal and its ordering are ONE
  replacement).
- **E8** an ordering trap closed in-source: D-b1's anchor comment omits an open paren
  deliberately, because D-b2's idempotency probe reads RAW `pg_get_functiondef` text and a
  comment containing `clara._adj_on_approve(` would make D-b2 conclude "already applied".
  (**CX6 later hardened this**: test call-absence on comment-stripped SQL — a D-b2 item.)
- **E9** (precedent-setting) `create or replace` on an ABSENT body CREATES it silently — the
  inverse of what probe 6 exists to catch. Any lane COMPLETING a shell must widen probe 7
  with `[SPLIT-CREATED]` anchors; both refusals were proven by applying onto a bare `0041`.
- **E10/E11/E15/E21** grant/body arithmetic corrected by measurement, not transcription
  (D-b1 grants 7 not 6; D-b1 creates 24 bodies not 23; D-b3 creates 16 not 13; D-b2 adds
  ELEVEN authenticated grants and exactly TWO runtime grants — the latter is the number that
  carries a security claim).
- **E13/E14/E19** probe-completeness findings RECORDED, NOT REPAIRED: the scope law is
  faithful extraction, never invention. E19 is the sharpest — the whole-unit probe 6 declares
  itself "the COMPLETE as-built set of names this file CREATES" and is missing SIX.
- **E16** the seven surviving reds at the D-b3 frontier, each probed on the rig: six are
  `_adj_on_approve` arm-(3) cells (a stale suggestion approves instead of refusing CLR39),
  the seventh is E7's. **Worst axis probed:** the duplicate lands OUTSIDE any bank match
  group — a VISIBLE unexplained GL movement the reconciliation cannot close over, not a
  silent doubling, and `reverse_entry` is the remedy. *(The confirming round later overturned
  the "courtesy" reading of the CX1 axis — see part 2 §7.)*
- **E17** (INSTRUMENT, binding) the battery MUST set `CLARA_MIGRATIONS_DIR` at the
  slice-shaped migrations copy the rig was built from; measured cost of getting it wrong is
  exactly one falsely-red cell.
- **E18** one inherited non-ASCII character in D-b3 (and one in D-b2) — canonical
  inheritances, not the lane's to edit. Their true count only became visible after V1's
  locale fix (§14).
- **E20** the ONE place the census's own file map, followed literally, would have LOST a
  claim: §8's D-b2 bullet omits TAIL 14, so the `adjustment.posted` emitter would have been
  asserted by no slice at all. Shipped in whole-unit form.
- **E22** the census's conditional RESOLVED: S5.9 is COMPLETE before D-b2 opens, so D-b2
  ships no S5.9 block at all (measured on the rig before the section was written).
- **E23** TAIL 10 ships the canonical seven-row loop, not an authored narrowing — being LAST,
  D-b2's "final form" IS the canonical text, which discharges every FORWARD TOLERANCE note
  the other three slices wrote by copying rather than authoring.
- **E24–E30** (lane F1) the fork machinery's own errata, incl. **E29: the dashboard must
  split with the DB** — 20 unknown RPCs at a D-b0 frontier are the FIRST failure and are
  unreachable by ledger edits.

---

## 6. The two completeness proofs

### 6.1 Twin-rig equivalence — ZERO semantic difference

`clara_b2_twin` = the `0041` template + the **whole-unit** `0042` (sha `6770ea84…`).
`clara_b2_rig` = the same template + `0042→0043→0044→0045`. Both end-states dumped
exhaustively and diffed — re-measured on the FINAL post-fix-wave artifacts (V1):

| axis | count | diff |
|---|---|---|
| `pg_get_functiondef` roster (names + signatures) | 599 | **0** |
| function owner + ACL (`proacl`) | 599 | **0** |
| columns · indexes · constraints · triggers | 1,514 · 399 · 1,054 · 277 | **0** |
| RLS policies · enable+FORCE · table grants per role | 283 · 127 · 1,084 | **0** |
| `event_types` · `trigger_taxonomy` · `ea1955_policy` seeds | 86 · 99 · 3 | **0** |
| row counts of all 7 new relations + `auto_reversal_of` · sequences | 8 · 5 | **0** |

**Exactly three function bodies differ, all COMMENT-ONLY**, each proven executable-identical
under comment stripping (9,356 / 505 / 3,073 characters both sides) AND string-literal
identical (no error message differs). Each is adjudicated by the census or the errata —
`_subledger_on_approve` (Class C/E8: two `perform` lines that could not ship together, so
one comment became two written a slice apart; the executable lines are byte-identical and in
the canonical order) · `depreciation_run_due` (§7.5/E2, one word inside a parenthetical) ·
`set_client_fy_end` (Class E/E6, D-b0's in-body note recording why the template arm was not
yet there; the arm landed byte-exact in the canonical POSITION).

**POLICY, stated so it is not rediscovered: a slice never rewrites or deletes comment text a
prior slice installed in a live body.** Cosmetic byte-identity with a unit that will never
ship is not worth an edit whose only purpose is to erase the audit trail of how the body
reached its state; a reader who greps `[SPLIT D-b` in a live body should find the whole
history.

### 6.2 The 418-cell test partition

The x41+x42 corpus — 75 files, **418 cells** — was partitioned so that every cell lands in
exactly ONE slice's list: **D-b0 146 · D-b1 66 · D-b3 70 · D-b2 134 · superseded 2 = 418.**
24 forks across 12 spanning files; 85 forked cells byte-identical to their originals. Four
per-slice upgrade drills, three frontier-aware cross-slice contract tests, per-slice
dashboard surface rosters, and `ci-split.patch` (a four-leg frontier matrix + a
partition-totality gate in its own DB-free job + the standing "0042 alone is deployable"
proof).

Battery arithmetic, reproduced to the cell on fresh rigs at every step: `149 → 214 → 281 →`
**415 pass / 0 fail / 3 skip** (the 3 = the reset-gated destructive drills). **The whole unit
scores the same, per file** — the identical sweep against the twin returns 415/0/3 and the
per-file tally `diff` is EMPTY (sweep sha `f71a7ba6` both sides). The four-slice chain is not
merely "as green"; it is green in exactly the same cells.

Per-slice list floors, enforced in CI: **149/0/4 · 76/0/6 · 70/0/4 · 150/0/4**; drills
3/0 · 1/0 · 2/0 · 1/0; contracts 0-fail on all four rigs.

*(Continued in `wave-d-b-asbuilt-part2.md`.)*
