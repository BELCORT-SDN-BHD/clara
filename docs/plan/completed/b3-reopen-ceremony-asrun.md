# The B3 (0085-0086) ceremony — as run (2026-08-16)

**Scope:** the B3 reopen migration pair applied to the live project from merged `main`
(3203093, PR #247), inside a **D1 write-quiesce window** — `reopen_fiscal_year`'s body is
replaced, so no writer may span the swap. **Result: 2/2 applied clean; positive reads
ALL-PASS; `/ready` 200.** Live frontier: 79/`0084` → **81/`0086`**.

## Order of operations (the D1 recipe, third execution this close)

1. **Backup banked first**: `clara-backup` on-demand run → R2
   `db-snapshots/2026/2026-08-15T22-40-38-035Z/` (20,360,578 bytes; hc-ping success;
   machine exit 0).
2. **D1 window OPEN**: the single `clara-runtime` machine stopped.
3. **Apply** via the no-print DSN bridge (sleeper machine + `printenv` piped into
   `dsn-pipe.mjs`; `sslmode=verify-full` with the pinned pooler CA; port 5432 session mode;
   `node scripts/migrate.mjs` direct). 0085's S0 prestates all held on live — including the
   prosrc pin proving the body being replaced was 0056's reviewed body byte-exactly
   (`3ecf3380…`) — and 0086's estate censuses re-took the roster clean.
4. **Positive reads** (asserted by script, ALL PASS): ledger **81** applied, frontier
   `0086_b3_reopen_ends_on_part2` · the 5-arg `reopen_fiscal_year(uuid,text,jsonb,text,text)`
   EXISTS and the 4-arg form is ABSENT from the catalog (no un-gated overload survives) ·
   the live body's sha256 is `b5da82e1…` (≠ 0056's) and carries the four segregation tokens
   (`distinct_checker` · `self_attestation` · `no_closing_entry_to_reverse` ·
   `reopen_reversal`) · `reverse_entry` byte-identical at `cc01323e…` · EXECUTE grantees
   exactly `{clara_authenticated}` · `NOTIFY pgrst` sent.
5. **D1 window CLOSED**: runtime restarted, `/ready` 200. No runtime deploy — B3 is
   DB-only; no freeze-manifest change — no workflow files.

## What B3 changes on live

`reopen_fiscal_year` now mints its own reversal of the year-end closing entry **dated the
reopened year's `ends_on`** (a formal prior-period adjustment, ADR-068 ruling 1), under the
target-bound M2 permit naming the pre-generated mirror id — written while the year is still
`closed`, so the permit is the wall that admits it. The reversal of a close is a
**segregated act**: at ≥2 eligible checkers the reopener must differ from the closer
(`distinct_checker`, no attestation bypass); the sole-eligible path requires a recorded
attestation; a NULL/departed closer routes to its own adoption arm; the determination is
recorded on the receipt. The pre-B3 defect — `is_high_stakes` inheritance leaving the mirror
a DRAFT and the reopen a silent no-op with double-counted re-close P&L — is dead on both
halves.

## Field notes

- The isolation-pin note (#241) spoke again for 0057, as designed.
- Two instrument defects in the ceremony's own read probe (a `42P10` on
  `array_agg(distinct … order by 1)`, then a pg array-as-text comparison artifact) were
  fixed and re-run to ALL-PASS; the estate was correct throughout — both failures were the
  probe's, and the printed values said so before the fix did.
- Runner outage context: the PR's first `ci` leg died with "runner lost communication"
  (the WSL VM stopped); recovered by VM boot + detached keeper + service self-heal, then a
  rerun — recorded because the red was infrastructure, proven by the annotation, not by
  assumption.

## Residue

- The BEE FY2025 first real close may now proceed when the owner sits — B3 landed before
  it, as ADR-068 required.
- The `closing_transfer`/SST-turnover latent defect (found by the B3 review tracing this
  change's downstream, task #17) is registered, unchanged by this ceremony.
- The wording seed (`wording/masb-seed` @ bf72db1) renumbers above `0086` at its own merge,
  after the owner's ms/zh sign-off.
