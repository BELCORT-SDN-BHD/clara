### ADR-067 — lanes α+β land: the CI gate survives on zero minutes, the close model arrives inert, and the ADR-062 MSIC debt is discharged live (2026-08-11)

**Decision 1 — the self-hosted CI runner (owner-ruled 2026-08-11 morning).** GitHub Actions
minutes ran out mid-queue (every job zero-step instant-failing on quota); the owner ruled for
a **self-hosted runner over billing**: `clara-wsl` (WSL2 Ubuntu + Docker, systemd service,
labels `self-hosted,linux,clara`), landed with the ci-diet as **PR #227**. **The gate is
UNCHANGED — same workflows, same binding green checks — minutes now free/unlimited.** Runbook
of record: `docs/ops/ci-runner.md`, carrying the hard law: **private-repo only; decommission
the runner BEFORE any visibility change** (public was refused on client confidentiality).

**Decision 2 — lanes α and β are BUILT, MERGED and CEREMONIED.** **α = PR #226** (`0055`,
the E-R12 trio; triple-CLEAN ladder, 16/16 battery) · **β = PR #228** (`0056`, the close
model; **8 review rounds · 8 fix batches · 35 defects killed pre-merge, 0 through · the
69-cell battery green ×2 under both invocations** — the Law-1 records live in the PR bodies;
the strongest evidence yet for ADR-061's uniform ladder). The queue drained in order
(#227 → #226 → #228) after one recorded violation: **β was rebased BEFORE α merged, which
dropped 0055 from its tree — the queue order existed for exactly this**; violated once,
lesson recorded. **One D1 quiesce window then applied 0055+0056 live** (first attempt, zero
rollbacks; the statement_timeout recipe honored IN-FILE). As-run records of record —
**`docs/plan/wave-e-lane-alpha-acceptance.md`** (ceremony narrative + Section-F closes) and
**`docs/plan/wave-e-lane-beta-acceptance.md`** (0056 post-checks + named observations) —
cite them, don't restate them.

**Decision 3 — the ADR-062 sanctioned-lane MSIC debt is DISCHARGED.** The three parked codes
entered through the audited door on the owner's session (RPR 68109 · RS 82110 · BEE 74101,
`basis_kind='owner_instruction'` citing the 2026-08-09 ruling, verbatim strings + fact ids +
replay-proof counts in the α record §2). RPR's `entity_type` took the same door (the one
carryover gap — RPR predates the interview). No hand-written row anywhere.

**Live at the close: 55 migrations (frontier `0056`) · runtime v60 — no deployable runtime
change in the span (the one runtime-lib diff is a single comment word, extracted and read;
v60 stays the intended release, positively read at `fly status`) · RS TB 3,396,500 =
3,396,500 (pre- AND post-migrate) · the
close model INERT ON ARRIVAL** (zero `fiscal_years` rows; activation = the first human
`open_fiscal_year`; the agent structurally key-less and grant-less — E-R11).

**Open from this close (PART 2):** the **B3 reopen-mirror owner ruling** (two lane positions,
PR #228 residual 3) · two **V-OWNER sign-offs** on the α record (F1d, F3e) · the
`closing_stock` producer verb before any real goods-trader close (REBUILD-PLAN) · one dead
re-apply tell in 0056 S0.6, recorded in the β record §3 (fails closed regardless; cosmetic).

**Why:** the ceremony ran EARLY (the α design's ruling) so the door and the wall harden on
live books while γ..θ build on top; the runner decision keeps the binding gate binding at
zero marginal cost; and the queue-order violation is recorded because the process is the
product — the order was load-bearing and the record says so.

**Supersessions.** None. ADR-066's posture line ("53 migrations, frontier 0054 · v60") is
superseded by this close's line above, in the ordinary way of posture pins.
