# Harness-audit owner rulings — 2026-08-26

*Minute style, one section per card. The owner ruled all nine cards the night of the
2026-08-26 harness-alignment batch, in parallel with that batch's build. This file is the
ruling record; `PROGRESS.md` carries the resulting Backlog/Next pointers, never the full
argument — cite this file, don't restate it.*

## R1 — PRD §6 invariant 2(a) as-built caveat: CONFIRMED, plus a new forward obligation

The as-built caveat's truing to the shipped `0125` recut (`method in ('human','rule',
'judgement')`, `confidence >= 0.95` retained) — landed this same batch, `docs/product/PRD.md`
— is **CONFIRMED by the owner (option B)**: the wording stands as written, including the
note that law 79's "the numeral leaves with the judgement" is satisfied at the mint —
confidence is PINNED at 1.0 by the minting core itself (`0126_f_a7_beta_filing_verb.sql:46,
1473`, D-2: "confidence is PINNED at 1.0 by this core", the model's own stated confidence
"is never read here; it lives ONLY in the receipt's `verdict` column, as an annotation" —
digest law 72 generalizes the same posture), not merely a convention the model happens to
follow — not by dropping the SQL conjunct.

**New obligation:** a **future migration** removes the `confidence >= 0.95` conjunct from
`assert_client_resolved` specifically for `method = 'judgement'` rows — full review ladder,
not a hotfix (it touches the constitutional gate). Until that migration ships, the conjunct
stands as a **harmless failsafe**: since judgement rows always mint at 1.0, the conjunct
never actually refuses a genuine judgement resolution — it just means the SQL text still
names a numeral the product law no longer requires. Tracked: `PROGRESS.md` Backlog.

## R2 — Two-tier reporting enters PRD law text (owner, option A) — WORDING NOT YET WRITTEN

The owner ruled (**option A**) that the two-tier reporting split — already SHIPPED FACT per
this batch's `docs/ARCHITECTURE.md` §6 truing, cited to digest law 74 — should also enter
`docs/product/PRD.md` as law text, not stay architecture-only:

- **§4** (in-scope capabilities, the reporting item) names the two tiers explicitly.
- **§6** (invariant 1, the DB-owns-every-number invariant) gains one sentence: analysis-
  sandbox outputs carry the burned watermark and are structurally unreachable by the seal
  chain.

**The exact wording is SUBJECT TO THE OWNER'S WORD-BY-WORD REVIEW before it lands** — this
ruling authorizes the *shape* of the change, not a specific sentence. **Do not edit PRD.md
for this without that review** — the obligation is recorded here and in `PROGRESS.md`
Backlog only; no PRD edit ships under this ruling until the owner has read and approved the
proposed sentences.

## R3 — G1 universal wake-execution engine: owed its own ADR

Gate G1 (the wake-execution engine, migration `0133`, built and W4-ceremonied this batch)
was RULED at the design stage (2026-08-25, `g1-wake-engine-design.md`) but never minted its
own ADR entry. The owner ruled it gets **one page, next session**, covering:

- Context: the stranded-row defect at `docs/plan/active/g1-wake-engine-survey.md`'s bytes,
  and the four named consumer lanes (F-A3 bankAgent, F-A4 closePrep, F-A5, F-A7).
- The two mechanisms considered: (a) heard-and-overruled — a `close_prep`-shaped
  per-consumer arm, the mechanism `close-key-1-design.md` originally shipped; (b)
  CHOSEN — one universal engine on the existing `kind='wake'` held projection, with
  `close_prep` folded in as a second registered carrier shape.
- Cross-lane impact: F-A3/F-A4's own INSERT-and-flip obligations on `wake_engine_sources`
  (already recorded in their `PROGRESS.md` lane rows).
- Its own digest line (folds into whichever digest section a future ADR numbering assigns).

Tracked: `PROGRESS.md` Backlog.

## R4 — Digest §10 addendum: the #352 closed-wave-floor law

The closed-wave-floor law minted at PR #352 (retirement/move PRs must true every closed-wave
floor pinning the moved surface, in the same PR; migration-stem-OR-catalog-witness
succession, exact-signature absences + positive controls) — already documented mechanically
in `.claude/rules/db-tests.md` (this batch's R1) — is owed a **one-line addendum in the ADR
digest, §10** (the CI-economics supplement, since closed-wave drills are that section's
subject). Owner-ruled standing; the addendum line itself is a follow-up write, not done in
this batch. Tracked: `PROGRESS.md` Backlog (combined with R5/R7).

## R5 — Digest §5 addendum: the evaluator deploy-flip two-halves ceremony

The evaluator deploy ceremony's two-halves rule (`deploy-evaluator-version.mjs` flips the DB
row under the bare principal; `check-frozen-evaluators.mjs --lock-deployed` separately
stamps the manifest — documented this batch in `packages/db/README.md` and
`docs/ARCHITECTURE.md` Appendix A) is owed a **one-line addendum in the ADR digest, §5**
(Ceremony and deploy law), beside law 50 ("every ceremony ends with freeze `--lock-deployed`
+ commit") — naming the 2026-08-24 half-skip incident (the manifest lock was missed once
after the DB-side flip, caught and fixed 2026-08-26) as the exhibit for why the two acts are
separate and both required. Tracked: `PROGRESS.md` Backlog (combined with R4/R7).

## R6 — a new docs/ops/ceremony-practices.md — owed during 磨合

A standing gap: ceremony practice knowledge lives scattered across session logs and lane
briefs, never consolidated into an ops runbook. The owner ruled a new file, at the path
docs/ops/ceremony-practices.md *(not yet created — this section is its own forward
obligation, not a pointer to an existing file)*, written **during the 磨合 window**, carrying
at minimum:

- The combined-window ceremony practice (when to fold multiple migrations into one
  D1-quiesced window vs. run them separately — the W2+W3 and W4 precedents).
- The sleeper-machine DSN recipe (the `clara-backup`-image sleeper, env-to-env DSN capture,
  the pinned-CA / `sslmode` deviation history).
- Run-id-pinned DONE watchers (the stale-DONE-line watcher lesson from the W4 as-run).

Maintained going forward via the existing clock-out harness-sync sweep + `harness-links`
gate, same as every other harness-menu file. Tracked: `PROGRESS.md` Backlog.

## R7 — Four-runner CI expansion: CONFIRMED STANDING; AMBIGUITY #2 CLOSED

The 2026-08-23 harness-audit's open question #2 (`harness-audit-2026-08-23.md`: "is the
four-runner CI expansion a completed, ratified change, or mid-flight work by a concurrent
lane that hasn't been reviewed/ratified yet?") is **RESOLVED by the owner: CONFIRMED
STANDING.** The expansion (`docs/ops/ci-runner.md` §"Runner count expansion to four",
2026-08-23) is ratified fact, not provisional. This batch's `PROGRESS.md` CI posture bullet
already reads "ADR/digest entry PENDING OWNER" — that pending state is now RULED (confirmed,
not reversed); the digest still owes its own one-line addendum (§10, combined with R4/R5
above) recording the ratification. AMBIGUITY #2 closes. Tracked: `PROGRESS.md` Backlog
(combined with R4/R5).

## R8 — F-A7b onboarding + firm tiers + pricing: the big one

**(a) F-A7b client onboarding** becomes a **JOINT design gate** in the 磨合 session — UI and
backend contract designed together, not sequenced, including variable-client-materials
playbooks (what an accountant does when a new client's documents don't fit the standard
interview shape) as named must-answer questions in that gate. It builds as its own train
immediately after the gate closes. **Wave-G e2e acceptance gains a named scenario:**
*"unknown-counterparty invoice → held in unattributed carrier → Clara proposes onboarding →
interview → doors signed → client born → document auto-attributes."*

**(b) Firm tiers.** All three tiers' UI builds in the 磨合 window — complete frontend, no
re-work later:
- **Tier 1 — staff invite + firm RBAC** — LIVE at 磨合.
- **Tier 2 — operator-approved firm creation** — LIVE at 磨合.
- **Tier 3 — SELF-SERVE PAID FIRM CREATION — LIVE AT BETA** (owner ruling; **the
  conductor's dissent is on file**: this ruling pulls pricing, the per-firm DPA e-sign flow,
  and anti-abuse controls into the beta critical path, which is a materially larger surface
  than tiers 1-2 alone). The self-serve tenant-creation door takes its **own design gate and
  security review**, inside the 磨合/Wave-G window but scoped separately from tiers 1-2.

**(c) Pricing shape RULED.** Base monthly tier per firm + metered overage, with F-A9's
metering ledger as the substrate (already built, `llm_usage_events` reshaped with
`client_id` + triggering actor). **Amounts are deferred to a dedicated pricing sitting** —
this ruling settles the SHAPE only. `docs/product/PRD.md` §9 item 3's usage-CAP half was
already RESOLVED by digest laws 76/81 (meter, never cap); its billing/PRICING half is now
**SHAPE-ruled, amounts still OPEN**. At this ruling's writing that PRD row was not planned for
re-edit here (out of this round's file list); **the row WAS subsequently annotated
PART-RESOLVED at the owner's later direction (commit `4960b39`), consistent with this
ruling's substance** — the SHAPE-ruled/amounts-open split above is exactly what that
annotation states.

Tracked: `PROGRESS.md` Next item 1 (the 磨合 in-scope list, since the pricing sitting runs
DURING 磨合 so tier-3's checkout can finish) for (a)/(b)/(c); `PROGRESS.md` Backlog also
carries the pricing-amounts sitting as its own row.

## R9 — Storage write probe: fix in 磨合. PITR: HOLD again.

**The `/ready` storage write probe** (already MEASURED absent this batch's audit —
`PROGRESS.md`'s own "no storage check at all" paragraph, follow-up (a) of the
2026-07-26 intake-storage incident) is RULED: **fix during 磨合**, as a small backend PR —
write, read back, delete, folded into the existing readiness check set. Tracked:
`PROGRESS.md` Next item 1.

**PITR** (point-in-time recovery, named in the archived Owner/legal block's WB-R26/PITR
history) is **HELD again** — the owner deferred it a second time. **Trigger for re-raising:
the beta-prep checklist**, not a date. Tracked: `PROGRESS.md` Backlog.
