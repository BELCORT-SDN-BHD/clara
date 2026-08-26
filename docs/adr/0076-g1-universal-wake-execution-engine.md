# ADR-0076 — GATE G1 RULED: the universal wake-execution engine closes the stranded-row defect

**Date:** 2026-08-25 (owner ruling) · migration `0133` merged + W4-ceremonied 2026-08-26 ·
ADR authored 2026-08-27 (磨合 window, per harness-audit ruling R3: "one page, next session").
**Status:** standing
**Ruled by:** the owner (Tao, BELCORT), 2026-08-25, on the cross-item register entry escalated
by `docs/plan/active/bank-agency-gate-record.md` §6 item 1 (blocker B2, Annex O.1) — shared
with F-A4 and F-A5 (register A12, TA-P5's "ONE time-triggered wake source").
**Mechanism of record:** `docs/plan/active/g1-wake-engine-survey.md` (facts, as-found) +
`g1-wake-engine-design.md` (the ruled shape) + `g1-wake-engine-annexes.md` (exact DDL/bodies);
`packages/db/migrations/0133_g1_wake_engine.sql`.

## Context — the stranded-row defect

A `kind='wake'` `agent_task` is a **HELD PROJECTION**, not a work item anything runs. It is
born `'held'` (`0006_runtime_core.sql:422`) and, at the survey's frontier (0127), the live
transition matrix (`_tf_agent_task_update`) admitted for `old.kind='wake'` only `old.status=
'held' and new.status='cancelled'` — no `running`, no `completed`, no `failed`.
`clara.wakes_outbox` — "the uniform HELD projection of a drained wake decision" — carries the
identical one-way guard, and no `clara_wake_*`/`clara_agent_*` role holds any grant on it at
all: it is "a firm-visible dashboard NOTICE of a held wake, never a work queue anything can
claim from" (`g1-wake-engine-survey.md` §2). `packages/runtime/lib/drain.mjs` is the only
writer of both rows, and nothing in `packages/runtime` reads either as a work queue —
`reconciler.mjs`'s own comment states plainly that a `kind='wake'` task can never reach
`cancel_requested` in the first place.

**Consequence.** A source's due-predicate belt fires; the router turns it into a
`wake_intent`; `drain.mjs` turns that into a held `agent_task` plus a held `wakes_outbox`
row; **and the run stops there forever** — one stranded row per cadence tick per client, with
no legal exit except a human/operator cancel. Gate B2 named the defect for bank agency
(`bank-agency-gate-record.md:69-90`); F-A4's own gate (close-key-1) independently confirmed
the identical defect for `close_prep` before G1 existed as a named gate
(`close-key-1-design.md:193-201`; `close-key-1-survey.md:366`). Four consumer lanes share it:
**F-A3 (bank_agent), F-A4 (close_prep), F-A5 (reportPack and siblings), F-A7 (filing)**.

## The two mechanisms considered

**(a) — heard, and OVERRULED.** Mint a dedicated `agent_tasks.kind` per authority scope
(`'bank_agent'`, `'filing'`, …), on the precedent autodraft — and then `close_prep` — had
already proven twice: a kind-CHECK swap plus a D1 recut of both `_tf_agent_task_insert` and
`_tf_agent_task_update` for every item that mints a kind. This is exactly the mechanism
`close-key-1-design.md` shipped for `close_prep` (migration `0120`, MERGED) before G1 existed
to rule between the two options, and that gate's own record told later sources to keep doing
it: *"F-A3 and F-A5 adopt that arm rather than each minting their own"*
(`close-key-1-gate-record.md:369-372`, TA-P11). Priced honestly in the record it was argued
in: every new source pays its own D1 recut of the same two live judgement-logic trigger
bodies, forever — a closed world of `agent_tasks.kind` values that grows by one CHECK value
and two trigger arms per item, never converging on a shared shape.

**(b) — CHOSEN.** One universal wake-execution engine on the **existing** `kind='wake'` held
projection. The matrix delta — `held→running→{completed,failed,cancel_requested}→
{completed,failed,cancelled}`, with `held→cancelled` staying legal — is paid **once**;
`clara.wakes_outbox`'s status CHECK gains exactly one new terminal value (`settled`) as a
synchronized projection of the same fact `agent_tasks(kind='wake')` carries, never a second,
diverging state machine; `clara.wake_engine_sources` is a new per-source registry (forced RLS,
owner-floor write, estate-wide read) so a **future** source's cost is registry rows plus its
own due-predicate and workflow — never another trigger recut. `close_prep` is
**GRANDFATHERED, not retrofitted**: its already-shipped, already-correct `0120` matrix stands
byte-unchanged (no defect justifies a D1 recut of a working body — constraint 9's spirit
against recutting a correct body without cause), but its unbuilt runtime consumption folds
into this same engine as a **second, closed-world registered carrier shape**
(`direct_queue`, walking `agent_tasks(kind='close_prep', status='queued')` `FOR UPDATE SKIP
LOCKED`, mirroring autodraft's proven consumer shape) — never a third mechanism, and never a
second precedent for anything built after this gate. Discovery therefore closes over exactly
**TWO** carrier shapes, forever, unless a future ADR reopens it
(`g1-wake-engine-design.md`, front matter + §1).

## Cross-lane impact — the INSERT-and-flip obligation

`clara.wake_engine_sources` ships **EMPTY of live sources by design** (design §5): the
`bank_agent` and `close_prep` seed rows land at birth `enabled=false`
(`0133_g1_wake_engine.sql` §G1-8). Registering and enabling a source is deliberately **not**
this migration's job — each owning lane inserts its own row and flips it on only once its own
due-predicate and workflow body ship:

- **F-A3 (bankAgent)** owes the INSERT-and-flip for `bank_agent`. `bank_agent_run_due` and the
  `bankAgent` workflow were undesigned SQL as of the survey (exhaustive grep through 0127,
  zero hits) and remain F-A3's own follow-up PR — recorded in `PROGRESS.md`'s F-A3 lane row.
- **F-A4 (closePrep)** owes the INSERT-and-flip for `close_prep`. `close_prep_due()` and
  `clara.close_prep_holds` were undesigned/unbuilt as of the survey and remain F-A4's own
  follow-up PR — recorded in `PROGRESS.md`'s F-A4 lane row.

Neither obligation is discharged by this ADR or by migration `0133`; both stand as named
Backlog items in `PROGRESS.md` until each lane's own PR lands.

## The mechanism

`packages/db/migrations/0133_g1_wake_engine.sql` ships the DB half: the
`wake_engine_sources` registry, the `_tf_agent_task_update` / `_tf_wakes_outbox_update`
matrix delta, `clara._settle_wake_task` (writes both projections in one transaction,
idempotent replay), `clara.wake_engine_task_dead_letters` (the `direct_queue` carrier's own
dead-letter home), and the `mint_wake_credential` fixes required for `close_prep` credentials
to mint at all. The runtime consumer (`packages/runtime/lib/wake-engine.mjs` +
`reconciler-wake.mjs`) ships as a companion, non-DB change. **BUILT + MERGED + W4-ceremonied
2026-08-26** (PR #349; live DB moved 122→131 migrations across the W4 window,
`docs/plan/completed/wave-f-w4-ceremony-asrun.md`).

## Consequences

**What this unblocks.** F-A3's clock PR and F-A5/F-A7's wake sources register against ONE
engine instead of each needing their own trigger recut; the estate gets one operational
surface — one consumer, one registry, one kill switch — across every source, which mechanism
(a) structurally could not give.

**What this does not do.** It does not register or enable any source — `wake_engine_sources`
stays empty of live rows until F-A3 and F-A4 (and later F-A5/F-A7) each complete their own
INSERT-and-flip. It does not retrofit `close_prep`'s already-shipped matrix, and it does not
create a third carrier shape.

## Status

**standing.** Folds as digest **law 83** (§13).
