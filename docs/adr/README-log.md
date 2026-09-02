# The digest's re-truing log — dated minutes, append-only

**This file is NOT the law.** The standing laws live in `README.md` and govern; this file holds
the dated **re-truing minutes** that record *when* the digest was re-read against a new ADR and
*what* that reading found. They were split out of `README.md` on 2026-08-23 when that file hit
its 500-line ceiling — **every byte below is verbatim**, in the order it stood.

**The rule this file inherits:** a minute is a record of what was true on its date. It is
**append-only** — a later reading is a NEW dated entry, never an edit to an old one. When a
minute names a fact that has since changed (a law "enters the ratified set at the owner's next
sign-off" that has since been ratified), that is not rot: the current status lives in the law
entry itself, in `README.md`.

Read `README.md` first. Come here only to answer "when did this change, and what did the
re-reading find?"

---

## The sign-off anchor (kept in README.md, repeated here for reading order)

> **SIGNED OFF — Tao (BELCORT), 2026-08-12.** Laws 1-67 are ratified as the current standing set
> at the ADR-0069 harness refactor. Additions or supersessions land as new ADR entries; this
> digest is re-trued whenever one does.

## The dated minutes (moved verbatim from `README.md`, 2026-08-23)

> **RE-TRUED 2026-08-16 (the Wave-E clock-out):** laws 68-70 fold ADR-0070's wave-close
> supplement (rulings 10-13) into the digest; they carry the standing status of their
> source ADR and enter the ratified set at the owner's next digest sign-off.

> **RE-TRUED 2026-08-18 (ADR-0071, the Agentic Charter):** the owner's twelve-ruling
> grilling supersedes the clauses annotated below (nine annotations: laws 2, 3, 4, 5,
> 8, 12, 13, 14, 25) and folds laws 71-76 (§9). The supersessions were ruled in-session
> by the owner directly; the annotations here are the re-truing that ADR's own text
> mandates.

> **RE-TRUED 2026-08-20 (ADR-0072, the F-A2 rulings + the corpus sitting):** **no law
> changes, and that is the finding.** The night's five ruling blocks land entirely inside
> ADR-0071's existing scoping and re-confirm it at the two places it was most likely to be
> read wider than it was written: **law 71** binds at ANY amount with no threshold and no
> per-firm amount dial (0072 ②), and **law 4's human half is untouched** — the human lane
> keeps its distinct-checker gate on `is_year_end` and `tax_affecting` even though the agent
> lane is freed of it (0072 ③, supplementary). **Law 12** stays superseded-and-moot; 0072 ①
> fixes only WHEN the machinery it governed retires. Hard constraint 15's spike clause is
> superseded **prospectively** — at the Wave-G reset, after a cold archive — and is not
> lifted here; `AGENTS.md` stands unchanged until that ceremony.

> **RE-TRUED 2026-08-21 (ADR-0073, the CI economics overhaul):** law 77 folds below (§10). No existing law
> changes: law 26 (uniform review intensity) is expressly untouched — 0073 amends per-PR **CI scope**, not
> review scope — and law 39's named legs (deploy-onto-existing · freeze-lint · leak-scan · the DR round-trip)
> all stay per-PR. **Law 77 RATIFIED by the owner 2026-08-22 (digest sign-off).**

> **RE-TRUED 2026-08-22 (ADR-0074, the Track-A sitting):** laws 78-81 fold below (§11) and laws 2 (invariant
> (a)), 21, 71 and 76 are amended in place — **all eight RATIFIED 2026-08-22 (owner), with law 78 carrying the
> rider R-TA-P1-walls.** The three CONSTITUTIONAL ones are ratified as LAW here; the product-text homes
> (PRD §6.2(a) · ARCHITECTURE §0.1) were **amended to match in #287**, `AGENTS.md` stays FLAGGED — this
> digest governs. TA-P2 routes AROUND law 1; constraints 12/13 re-confirmed.

> **RE-TRUED 2026-08-23 (ADR-0075, the test-data authority):** law 82 folds as §12. **No existing law
> changes** — 0075 is an authority over DATA and over who WALKS a gate, never over a mechanism, and law 82
> says so in its own text. `AGENTS.md` hard constraints 12, 13 and 14 are re-scoped by that entry (12
> retired as a *named* constraint with the GENERIC name-only wall kept, 13 rewritten to
> operator-firm/resettable-fixture, 14 widened and still expiring at beta); the `0062`/`0063` migrations are
> untouched. Same session: this log was split out of `README.md` at its 500-line ceiling.

> **RE-TRUED 2026-08-23 (the harness-truing batch — no law changes, two records closed).** Law 79 gains a
> one-sentence **as-built caveat**: the live `assert_client_resolved` body still enforces
> `method in ('human','rule')` and `confidence >= 0.95` (`0018_gate_k_domain.sql:57,62`) until F-A7a recuts
> it, so the law and the shipped function are not read as agreeing before they do. And the **`AGENTS.md`
> home question for invariant (a) is DECIDED (b) by the owner: PRD §6 is the single home; `AGENTS.md`
> points at §6 and gains no duplicate clause.** That closes the last open item from the 2026-08-22
> ratification. The 2026-08-22 minute above still reads "`AGENTS.md` stays FLAGGED" — correct on its date,
> superseded here rather than rewritten.

## 2026-08-27 — the 磨合-window docs batch (ADR-0076 · law 83 · law 79's caveat trued)

> ADR-0076 mints the G1 universal wake-execution engine ruling (digest law 83, new §13), and
> §5/§10 gain the R4/R5/R7 addenda — all four owner-ruled 2026-08-26
> (`docs/plan/active/harness-audit-rulings-2026-08-26.md`). **Law 79's as-built caveat is
> TRUED**: the F-A7 α recut shipped at `0125` (`method in ('human','rule','judgement')`,
> `0125_f_a7_alpha2_judgement_recut.sql:184,209`), so the caveat no longer says "until F-A7a
> recuts it" — the `>= 0.95` conjunct stays as R1's harmless failsafe (judgement confidence
> mints pinned 1.0) until its Backlogged follow-up migration. The 2026-08-23 minute above
> quotes the pre-recut wording — correct on its date, superseded here rather than rewritten.

## 2026-09-02 — the pre-pause truing sweep (ADR-0077's missed minute · 裁-111 folded)

> Written at the owner-ordered quiet-window sweep (seven read-only drift-scan lanes over the
> whole harness). Two digest changes minuted: **(1) the ADR-0077 fold finally gets its
> minute** — 0077 (signed 2026-08-31 evening, 裁-93) folded laws 84-85 into §14 directly with
> no dated minute at the time; this entry records that fold retroactively, honestly late.
> **(2) Law 28's cross-family read-only leg is TIME-BOXED SUSPENDED until beta live**
> (裁-111, owner, 2026-09-01, `docs/plan/active/mohe-grill-rulings-2026-09-01-pm.md`) — the
> digest's law-28 entry and §14's "Law 28 KEPT" clause both gain the suspension note; the
> opus lane is the complete review gate for the sprint, Codex stays a BUILD lane. ADR-0077's
> own title line and point 8 predate 裁-111 and now read stale on the review-leg clause —
> correct on their date, superseded by the ledger rather than rewritten (this file's own
> convention). The sweep found the digest otherwise current: the five newest ADR one-liners
> (0073…0077) match their ADRs; ADR-061's uniform intensity (law 26) is untouched by 裁-111.

## 2026-09-02 — the beta checkpoint sitting minted NO digest law (裁-115 … 裁-128)

> Written at the checkpoint truing so a later reader does not hunt: the fourteen rulings of
> the 2026-09-02 morning sitting (`docs/plan/active/mohe-grill-rulings-2026-09-02.md`, §"The
> 2026-09-02 checkpoint sitting") are SPRINT rulings — scope, sequencing, the Stripe sandbox,
> the legal-template posture, the archive of the parked backend queue — and none of them
> amends a digest law or an ADR. Two touch standing text elsewhere and are recorded there:
> 裁-125 (agent-authored legal templates for beta, lawyer-refined at official launch — a
> posture under ADR-0077's "TEST-mode beta, KYB at launch", not a new law) lives in the
> ledger + `PROGRESS.md`'s posture; 裁-123's cleanup incident corrected a Known-issues LAW
> line in `PROGRESS.md` (`git worktree remove --force` follows junctions on this host). The
> digest's law-28 suspension note (裁-111) is unchanged and still time-boxed to beta live.

## 2026-09-02 — the CI concurrency cap (裁-134, zero spend) — ADR-0073 unamended

> 裁-134 (owner: 只加并发上限，不花钱) adds a per-branch cancel-in-progress fix (push-to-main was
> wrongly sharing one group across every merge) and a zero-cost job-level slot cap (PR number
> mod 3) on the four ADR-0073 runner-heavy legs, after two same-afternoon contention-class
> false reds on the self-hosted fleet. This is an OPERATING addendum to `.github/workflows/
> ci.yml` and `docs/ops/ci-runner.md`, not a digest-law or ADR-0073 change — §10's law 77 is
> untouched.
