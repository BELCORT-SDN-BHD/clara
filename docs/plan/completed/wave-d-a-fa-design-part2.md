# Wave D-a design — PART 2: the review-ladder record

> Companion to `wave-d-a-fa-design.md` (v2.1). Rounds are append-only; the main doc carries
> only the buildable mechanism. Full lens outputs are session artifacts (never committed);
> this file is the durable record of what each round found and how it was folded.

## Round 1 (2026-08-01) — v1 → v2

**Lanes:** three native adversarial lenses (opus/xhigh: accounting 6B/11M/3m · structure
6B/7M/5m · integration 6B/9M/6m) + Codex gpt-5.6-sol/xhigh (14B/12M). The orchestrator
probe-verified the five load-bearing substrate claims before folding: the
`_subledger_on_approve` early return (0037:1122-1123) · the `journal_entries.origin` CHECK
(0003:108) · the `event_types` FK (0005:83) · the carry-down's hardcoded `'straight_line'`
(0017:3456, `v_method` discarded) · the `clara_runtime` inherit-false grant (0006:78) +
`set role clara_runtime` (relay.mjs:153).

**Convergent blockers folded (all four lanes or ≥2):** the v1 tail splice was dead code for
every non-settlement entry → splice before the settlement early-return · K-family
double-birth at K5 + the K6 hand-off wedge → `is_opening_balance` exclusions on both hook
arms · ledger rows minted at run time broke register↔GL for every ramp → materialise at
approve from a flags proposal · client-scoped due periods silently lost late-completed
assets → per-asset due-ness · no FY datum existed for the RB law/annual cadence → client FY
columns · v1's belt (on `journal_lines`) fired at draft-commit or never → `journal_entries`
@approved, all three account roles · `origin='depreciation_run'` violated the live CHECK ·
"widen the spine enum" misread event prose for substrate → event_types + taxonomy rows ·
the disposal GUC died across the maker-checker gap → proposal-shaped disposal · no birth
identity existed → `acquisition_line_id` UNIQUE · multi-period op-keys collided → one
period per call.

**Codex-unique folds:** the NOT-NULL `description` birth-abort → placeholder · the
carry-down baseline lower bound (catch-up would double-depreciate carried history) · the K
`gl_balance` belt door hole → refused on enrolled accounts · ramp satisfiable by a
zero-entry run → nonzero + un-reversed · dependency-ordered reversal (acquisition refuses
while disposal descendants exist) · runtime-first was not actually dormant on 0040 →
feature-detection · profile pairwise distinctness.

**Lens conflicts resolved:** disposal month CHARGED (integration + practice-map §2.6-C over
v1's charge-to-prior-month; the stub-at-disposal mechanism makes it free) · belt widened to
all three roles (accounting's hand-journal hole over structure's cost-only reading — the
structure lens had only cleared the run's own legs).

## Round 2 — the delta (2026-08-01) — v2 → v2.1

**Lanes:** native opus/xhigh delta (8B/12M/6m) + Codex gpt-5.6-sol/xhigh delta (8B/3M),
both instructed to attack the FOLDS and the new mechanisms, not re-review. Convergence was
near-total on the heavy findings; each arm added unique ones.

**Fold-fidelity verdicts (spot-checked by both arms):** CLOSED clean — splice reachability ·
K-family exclusions · origin CHECK · event registration · carry-down literal recut ·
description placeholder · baseline lower bound · K gl_balance refusal · dormancy probe ·
pairwise distinctness · MYT anchor claim · five-marker census claim. PARTIAL/NOT-CLOSED —
everything below.

**Round-2 blockers → v2.1 folds:**
1. **Receipt lifecycle** (both arms): v2 minted receipts at run time under a
   (client, period) unique — the sweep re-called drafted periods into a unique violation
   every cycle (permanently for high-stakes clients), and the design's own correction door
   (reverse + re-run) was blocked by its own constraint. → Receipts mint AT APPROVE beside
   the ledger rows, 1:1 with the entry, NO (client, period) unique; eligibility/coverage
   never read from receipts; a nothing-due run persists nothing; the run verb refuses while
   an earlier period's draft is outstanding (draft-N blocks N+1 — which also pins the RB
   sequencing).
2. **`is_live`/unwind slot collision** (both): the unwind row's default-true `is_live`
   collided with the freed slot; and `is_live` in the as-of read made `Accumulated()` wrong
   in BOTH time directions (a June read lost a March charge unwound in August; a September
   read double-voided). → Unwind rows born dead; `is_live` exists ONLY for the uniqueness
   index; the read is a signed sum over ALL rows by `effective_date`.
3. **Split effective dating** (both; native worked a RM100,000 false break on a certified
   as-of): successors had no effective-from; `superseded_at` was wall-clock. →
   `effective_from date` on successors + `superseded_at date`, both = the governing entry's
   posting date; the as-of inclusion rule restated over them.
4. **Immutability allowlist** (both): `disposal_entry_id`/`superseded_at` were not mutable
   post-approval — the first disposal would raise CLR13. → The full transition table in
   §1.1 (lifecycle columns unconditional; particulars while incomplete, evaluated on OLD).
5. **Enrolment watermark** (native): enrolling an account with history made every
   pre-enrolment entry un-reversible (`reversed_by` UPDATE trips the belt with no openable
   door). → `enrolled_at` watermark; belt scoped to entries approved at/after it; door (a)
   status-blind.
6. **Cadence never consumed** (both): `annual` was stored and surfaced but the period
   generator was months-only — the ratified compliance-only shape silently became monthly.
   → The generator is a function of cadence; annual posts once at FY end; the mid-FY
   disposal stub is that asset's only in-year charge (which also closed the native arm's
   annual-overcharge-on-disposal finding).
7. **RB completions** (both): carried-asset basis collided with the `baseline_as_of`
   refusal (the acceptance's own RB asset could not run); intra-FY rate revision had two
   readings (only one prospective); the ×m/12 arm had no sen law; "last charged month" was
   unknowable under disposal/life-end. → The `greatest(FY_open−1, baseline_as_of)` basis;
   month-segmented prospective entitlements (Σ segments); floor+absorb sen law; the true-up
   rides whichever charge terminates the FY, including the disposal stub.
8. **Machine-born high-stakes** (native, verified against 0037:1992-2010): with
   `last_human_editor` NULL, `_approve_entry_core` accepts ANY approver + an attestation —
   WD-R5's distinct-checker intent did not bind. → Both verbs stamp `last_human_editor`
   (run: the authority signer; disposal: the maker), putting the signer/maker on the
   distinct-checker arm; the §7 cell approves AS the signer and must refuse.
9. **Partial-disposal reversal undefined** (Codex): → defined (both successors unwound,
   original restored, stub unwound; refused when a successor carries later state) + cell.
10. **Proposal ingress/authenticity unstated** (both, as MAJOR/BLOCKER): the verbs insert
    `journal_entries` directly (the `allocate_receipt` precedent); `_draft_entry_core` is
    never widened; authenticity is structural and tail-censused (§9.5) — the hook
    additionally validates authority + the durable op-receipt binding (the disposal's
    issuer proof that survives the maker-checker gap).

**Round-2 majors → v2.1 folds:** the non-unique `end loop;` anchor → the multi-line
live-body anchor, count 1 · the RB true-up/stub interaction stated · the carry-down FOURTH
recut part (zero-accumulated assets and land refused at `_validate_entry_lines` — the
zero/NULL accum leg is omitted, OBE absorbs) · successors carry `acquisition_line_id` NULL ·
`revise_entry` = the sixth recut with its marker census · receipts carry `entry_id` (ramp
predicate restated over entries; no receipt join) · pending-disposal freeze (the run skips
assets with an outstanding disposal draft — the month-boundary un-approvable-draft race) ·
annual mid-FY disposal correction (subsumed by fold 6) · K6 same-item hand-off = a NAMED
refusal (`fixed_asset_lifecycle_advanced`), other-item green · posting path stated
(`_approve_entry_core`; the four-caller re-pin survives; CLR26/attestation refusals leave
the period due honestly) · `revise_fixed_asset_particulars` full signature with
`p_effective_from` · run-vs-dispose serialization actually installed in §4.1 (the rung was
only on the run in v2) · tenant congruence on birth (by-construction from the entry's own
legs + a congruence CHECK) · the §7 composition cells (the round-2 list).

**Round-2 minors folded:** unwound rows keep `superseded_by NULL` (the 0017 CHECK is safe —
stated) · taxonomy decision `'ignore'` ×3 stated · `fa_register_tie` named with a signature ·
`rate_bps` bounded 1..10000 · the one-asset-per-line no-merge-door convention stated ·
profile unique `WHERE active` + reactivation semantics.

**Clean surfaces both arms certified (recorded so nobody re-litigates):** proposal forgery is
structurally impossible TODAY (no `journal_entries` table grants anywhere in the chain;
`_draft_entry_core`'s INSERT carries no flags column — 0016:4079-4090) — v2.1 §9.5 makes the
facts censused law so a later migration cannot silently re-open them · ramp flap cannot occur
(the 203005004 rung serializes the mode decision, the post, and any reversal; the total lock
order cannot invert because depreciation/disposal entries carry no control leg) · the
stub-vs-run index collision resolves to the pending-disposal freeze + `disposal_stale`.

## Standing observations for the build

- The 0041 tail must re-pin: the four-caller census · the five markers on
  `_subledger_on_approve` + the new FA marker · every recut lineage
  (`reverse_entry` ×5 splices · `revise_entry` ×7 markers · `_draft_opening_item_core` ×4
  parts · `_assert_fa_baseline` · the immutability trigger transition table) · the
  single-writer censuses (origin `'scheduled_run'`; the two proposal keys).
- The build's contract-blind lane authors x41 cells from the CONTRACT + this design's laws,
  never from the migration text (the C-b lesson: three production bugs were caught only by
  contract-authored cells).
- Round 3 (as-built) runs on the assembled migration + runtime before merge, per house law.

## Round 3 (2026-08-02) — the as-built ladder (build commits 6828ddb → a659019 → 25bd280)

**Build:** four parallel lanes (migration opus/xhigh · contract-blind x41 opus/xhigh · runtime
sonnet/xhigh · dashboard sonnet/xhigh) under an orchestrator-pinned interface contract. The
first x41-vs-0041 run went 27/60 → 60/60 with THREE class-(a) migration defects caught
contract-blind (the C-b lesson, a third time): the disposal per-asset precondition folded away
"by construction" · the reversal dependency refusal unfollowable · the RB Σ-segments law
unreachable (the design's OWN RM14,000 worked figure charged RM2,000).

**Lanes:** three native lenses (opus/xhigh: accounting 1B/3M · structure 3B/2M · integration
1B/5M) + Codex gpt-5.6-sol/xhigh (5B/2M). DO-NOT-SHIP ×3, SHIP-WITH-FIXES ×1. The structural
spine held everywhere (splices, grants, RLS, authenticity, lock order); the defects clustered
in TWO shapes — frozen snapshots standing in for effective-dated/lineage reads, and row-shape
(not entry-shape) reversal dispatch. Headline folds (F1–F10): the lineage-accumulated read
(a revision successor's bake went stale — RM1,200,000 in the GL, gone from the register) ·
no frozen arithmetic snapshots (the correction law had under-depreciated with the tie GREEN) ·
ONE due oracle, due ⇔ compute (a sub-RM1 asset had wedged a whole client's ladder) ·
entry-shape dispatch + the revision-chain closure (revise-then-reverse-acquisition had become
PERMANENTLY un-reversible) · immutable enrolment intervals (`retired_at`, version-forward,
the belt at `approved_at` closed both ends — the same-transaction retire TOCTOU) · client-wide
role topology + bank reservation · the verb-side reversal guard (the TENTH splice, one
`_fa_reversal_blocked` for verb AND hook) · pre-birth act dates · tie explained columns.
**Adjudications:** the eager `:approve` reservation STANDS (TAIL 7's 0037 deadlock law; the
lazy-reservation fold withdrawn on evidence) · A1's figures corrected (RM40,000 then
64,000/51,200/40,960 — the code was conformant, the record wrong) · `_fa_lineage_accumulated`
deleted (one walk, two wrappers) · RB charge blocks flush per FY · `p_memo` out of the
disposal request hash · expense codes deliberately not unique.

## Round 3.5 — the delta ladder on the fix surgery

Two native delta lenses + Codex, DO-NOT-SHIP ×3, while certifying the surgery core sound
(deep-lineage conservation EXACT; due ⇔ compute over 1,246 clients; the due probe measured
~0.84 ms/asset — affordable DAILY, never at the 2s cycle). Folds (G1–G8): the as-of read is
not "accumulated of this asset" — a [charge, mirror) window counts original + replacement
(2,800,000 where truth was 1,400,000; an INCREASING RB projection; the tie green on the
doubled figure) → the PERIOD-NET companion read (unwinds joined to their ORIGINAL's period;
the §1.3 is_live law verbatim) routing exactly two consumers + the approve-time
`accum_relieved_cents` re-derivation (`disposal_stale` axis `accum`) · K6's writer never
stamped `superseded_at` (the acceptance instrument read 2× on the exact WD-R14 carry-down
shape) → the S1.8 derived-or-refuse backfill + the ELEVENTH splice + TAIL 12 · ONE reservation
predicate (profile roles ∪ codes baked on register rows) for topology, disposal hardening AND
an undeferred bank-side TABLE belt (leaf key `client:fa-roles` last; the live remap verb
genuinely holds 203005004+203005006 first — the 0038 file text was stale) · the split-reversal
arm reuses the certified closure · freeze symmetry + the shrinking-horizon probe. **A6
extended with figures:** the window class covers full-disposal reversal; accum_diff −10,000
inside the correction window, EXACTLY 0/0 once the mirror lands; ZERO at any settled as-of —
the G1 re-route made the window VISIBLE where the defect had masked it by doubling. Re-green:
1524/1499/0-fail TWICE (fresh + populated); the x41.s4 whole-DB sweep excuses the A6 class
STRUCTURALLY and hard-asserts zero windows at a settled as-of.

## Round 4 — the dry check, and the closing folds

One native verify lens + Codex over the surgery only, plus the ninth cell (G5's admission)
from a fresh blind lane. SHIP-WITH-FIXES ×2, NO blockers, no wrong number anywhere — wrapper
equivalence proven old-vs-new over all 262 corpus assets (zero divergence); the blind G5 cells
green first-contact (a revision below a split births exactly ONE lineage row; the refusal
lives at the VERB; the restored original keeps its history). Closing folds: G2's ancestors
bound had refused a CURRENT-period disposal with a remedy the run verb itself rejects (annual
cadence: un-disposable up to a year) → ancestor months INSIDE the disposal cadence period
ride the STUB as per-asset rows through ONE `_fa_disposal_stub` body for verb and hook (the
design's own mid-FY-stub law across a revision segment boundary); ENDED periods keep the
executable refusal · TAIL 13(c) deepened to a TRANSITIVE whole-schema advisory census, both
directions (~0.7 s; DOWN closure 6 members, the only acquirer the lawful 203005001 chain) ·
unwound rows STAY reserved (an ever-used FA code is role-reserved for good — the tie's pair
census is permanent) · separate cost/accum pre-enrolment watermarks (measured: explains
24,000,000 sen exactly where the single watermark explained 0) · the 64-hop cap admits
exactly 64 in both readers · fingerprints totally ordered by (asset_id, period_start) at all
four sites. **Cell re-pins ratified by the orchestrator:** x41.s2 → the SUCCESS (the per-asset
ancestor stub row pinned by entry id); x41.s3's fixture moved mid-month so `disposal_stale`
stays provable; the token order `period_earlier_unmet` before `disposal_stale` recorded (the
actionable root cause first). Blind corroboration: x41.t1–t4 green on first contact with the
implementation, incl. the two properties the fix lane could not self-certify (the ended-period
refusal's executable remedy; ladder convergence with no month charged twice).

**Closing state:** migration sha256 `d4765676…` applied = on-disk, four from-zero rebuilds ·
DB suite 1531/1506/0-fail TWICE · the isolated 0041 upgrade drill 1/1 · runtime 986/986 ·
dashboard 488/488 (16 routes) · all seven root gates + typecheck + lint · x41 family 99 cells.

## Round 4.6 — the merge gate, honoured

The final Codex merge gate on PR #177 returned DO-NOT-MERGE (1B/2M/1m) and CI failed on both
runs — both correctly. Folds (H1–H4 + the CI re-pin): **the lineage-wide stub could
depreciate beyond cost** (the successor's money clock read only PERSISTED accumulation; the
Codex worked case 375 where the cap is 300) → `_fa_disposal_stub` walks ROOT-FIRST with ONE
shared projected-accumulated clamp across every block (measured: 375 → 300 = cost − residual
exactly; the RB life-end variant 1,016,666 → 1,000,000) · the ended-period refusal now names
the CADENCE window at both sites (annual names the FY pair `run_depreciation_manual` accepts
verbatim) · the TAIL 13c census recognises bare + qualified calls and bank writes and FAILS
CLOSED on dynamic SQL in the closure (strict-superset edge set, zero old edges lost) · the
local walk admits exactly 64 edges like both other readers. **The CI red was the MYT splice
WORKING:** CI ran at 23:1x UTC = 07:1x MYT — inside the exact 00:00–08:00 window — and the
pre-existing T11 cell asserted the UTC date the splice exists to leave behind; T11 now derives
today from the DB's MYT clock (proven on a UTC-timezone database). A green CI OUTSIDE the
16:00–24:00 UTC window does not exercise the splice — the acceptance does. Blind
corroboration: x41.u1–u4 (life-end across a revision both methods, sen-exact; the annual
executable remedy driven to green; the 64/65 boundary) green on first contact.
**s4 amendment ratified:** the whole-DB sweep gains a second, EVIDENCE-GATED exemption
(count-capped at 1, admitted only when a recursive register walk proves the lineage really
exceeds 64 edges) so x41.u4's deliberate over-cap fixture can coexist with the zero-error law.
**Closing state:** DB 1535/1510/0-fail twice + a UTC CI simulation · upgrade drill 1/1 ·
runtime 986/986 · dashboard 488/488 · all gates.

## The ceremony + the acceptance round (2026-08-02, ADR-056)

**Ceremony (owner GO):** dashboard auto-deployed from main (/assets live) → runtime **v53**
first, provably dormant on 0040 → quiesce (beats stale 118–120s) → 0041 applied live (40
total; the thirteen tail censuses in-txn on production) → fifteen postverify probes green
(grants exact; both belts live; RLS forced; register empty) → restart → /ready 200 ·
Supavisor **38/60** (D-a added zero sessions).

**Sandbox acceptance (ROME PUBLIC ADVISORY, labelled synthetic) — every drill green through
the production verbs:** soft-birth + queue chase + placeholder · completion · authority with
the Dec-31 fallback SURFACED · the ramp (first run DRAFTED at exactly RM100.00; ledger row +
receipt minted AT approve; July POSTED autonomously; August honestly period_not_ended) ·
late-completion catch-up (a second June receipt, lawful) · RB at the exact sen floor
(13,333 = floor(160,000/12)) · the mid-year 20%→10% prospective revision (supersede-forward,
history intact) · partial disposal sen-exact + the partial REVERSAL (original restored,
successors unwound, the stub flipped dead beside its born-dead unwind row) · a high-stakes
disposal DRAFTED with the register untouched through the maker-checker window, executed only
at the attested approve · the AF-1 wall by name (`allocation_to_unborn_item`, the deposit
remedy verbatim) + the deposit route green · `fa_register_tie` TRUE, diffs EXACTLY 0, at
TWO as-ofs.

**The WD-R14 real half — the NAMED DEVIATION (owner-ruled 2026-08-02):** the raw YA2025
documents for both real registers were measured — RPR (TB/BS/GL/P&L to 08-12-2025) is a
P&L-only book with premises and equipment RENTED; RS (BS/GL/P&L 05-05-2025→31-03-2026)
prints its Cost/AccDeprn/NBV columns EMPTY; the "RM20,000" supplier invoice is a mis-named
RM2,000 SSM service fee. **Neither company has ever owned a fixed asset.** Under the
never-fabricate law both real registers stay honestly empty; the carry-down's first real
firing + the ≥1 real reducing-balance asset DEFER, named, to the first asset-owning client.
The sandbox half had already fired every mechanism (incl. RB) under the ADR-048 sanction
WD-R7 itself invokes. Recorded: **RS's real FYE is 31 MARCH** — the first genuine
non-December FY for `set_client_fy_end` when RS ever holds assets.

## Standing observations for the ceremony + acceptance (from the ladder)

- WD-R14 pre-flight: before enrolling ANY real cost account, assert zero approved non-opening
  GL movement on it (the tie's pre-enrolment columns EXPLAIN such history, never absorb it);
  confirm no legitimate manual depreciation-expense journals remain (the belt covers all three
  roles at enrolment); check for parked depreciation/disposal DRAFTS (an abandoned draft is a
  client-wide sequencing stop by design — §3.2).
- Annual cadence windows open on the FIRST of the month after the FYE month (probed: FYE
  Apr-28 ⇒ 2025-05-01..2026-04-28); acceptance scripts must not assume FYE-date+1. The FY
  helpers are ungranted internals — capture the window as a literal, never call them inline
  as `clara_authenticated`.
- The dashboard parity test needs PGPORT=5432 locally (defaults to the CI port).
- clara_wccv_main is a STALE 0040 image (intermediate checksum) — never a migrate target or
  drill baseline.
- Wave-D-b register items from the ladder: `dispose_fixed_asset` admits a SECOND outstanding
  disposal draft per asset (an abandoned draft freezes charging AND revision until withdrawn) ·
  `fixed_assets.cost_cents` should become NOT NULL (the CHECK passes on NULL; backstopped by
  `fa_lineage_cost_invalid` today) · which lineage row owns the split month after a mid-month
  revision is UNRULED (x41.s2 lane-notes the observed allocation; pin at the D-b grilling) ·
  the 64-edge lineage cap is READER-side only — `revise_fixed_asset_particulars` will mint the
  65th edge and permanently brick that client's tie/disposal with no unwind verb (65 deliberate
  audited revisions of one asset; guard the writer or provide an unwind at D-b).
- Rig hygiene: every full-suite run leaves x41.u4's deliberate over-cap lineage behind on a
  persistent rig DB — rebuild the rig periodically; CI (fresh DB per run) is unaffected. The
  runtime suite locally needs PGPORT=5432 exported (one file defaults to the CI port 55432).
- The wave-a-autodraft-db "no-ops cleanly" cell asserts a globally-empty corpus — green on a
  pristine DB and in CI; misleading on any shared image.
