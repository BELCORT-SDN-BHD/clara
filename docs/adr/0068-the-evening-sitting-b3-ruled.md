### ADR-068 — the evening sitting: B3 ruled (the reopen mirror becomes an ends_on-dated formal prior-period adjustment), the two α sign-offs, and Gate-P defers to the Wave-G reset (2026-08-11)

**Three owner rulings in one sitting (in-session, structured-question record; the orchestrator's
briefing preceded each).**

**(1) B3 — RULED: the Codex variant.** `reopen_fiscal_year` shall mint a **DEDICATED reversal
of the year-end closing entry DATED the reopened year's `ends_on`**, under the target-bound
close-write permit (M2 — the permit names exactly one pre-generated entry id and is consumed
exactly once, so no generic backdating door opens), with the **act's real timestamp, actor and
receipt retained** on `created_at`/actor/receipt — a formal prior-period adjustment placed in
its own period, textbook shape. **The never-backdate law STANDS for transaction reversals**;
a year-end close pair is period machinery, not a business transaction, and placing it in its
period falsifies nothing. **Grounds:** the precedence law (accounting-correctness > backend
contracts) — the native alternative would leave the successor year's INTERIM P&L polluted by
the reopened year's entire P&L until the successor's own close, visible to every direct GL
reader, and would tax δ/ε (and every future consumer) with a permanent exclusion rule.
**Consequence:** δ/ε carry **NO** interim-exclusion obligation (the native lane's registered
candidate obligation is void); the ledger is correct at source. **IMPLEMENTATION is a NAMED
BUILD ITEM:** 0056's live `reopen_fiscal_year` currently routes through `reverse_entry`'s
today-dated mirror — the ends_on variant lands as its own migration (D1-class: an audited
writer's body changes) **BEFORE THE FIRST REAL CLOSE FINALIZES** (the E-acceptance's BEE
FY2025 close), and in any case before any real reopen. (Precisely: the D1 deadline is the
first real close, since only a finalized close mints anything to reopen; ADR-067's "activation
= the first human `open_fiscal_year`" describes the machinery arming, a distinct, earlier event.) Registered in PART 2 + REBUILD-PLAN.

**(2) The two V-OWNER record cells are SIGNED** — F1d (the F-1 wall-scope record:
verify-plus-one-guard, no duplicate wall) and F3e (MSIC codes are format-checked only, never
registry-validated; basis capture is the compensating control). The owner's in-session ruling
is the signature act; `wave-e-lane-alpha-acceptance.md` §5 now carries it (Tao, 2026-08-11).

**(3) Gate-P — the reminder clause is SUPERSEDED.** The 2026-08-09 ruling ("owner re-exports
near-term; remind at every session open") gives way to the owner's 2026-08-11 registration of
the **Wave-G factory reset** as the definitive discharge for every stuck-bytes class, the
Gate-P seven included: **reminders STOP**; the seven enter at the reset (their bytes were
proven identical to the live store — content was never the problem). The portal re-export lane
stays available if ever wanted sooner. Gate P itself is unchanged (operating runway; closes on
the first native-MYR SST-stated supplier bill per ADR-062, or discharges at the reset).

**Supersessions.** ADR-066/PART 2's "remind at every session open until the seven PDFs arrive"
clause is superseded by (3). Nothing else changes; ADR-065's E-R11/E-R2 rulings and the
never-backdate law (for transactions) stand.
