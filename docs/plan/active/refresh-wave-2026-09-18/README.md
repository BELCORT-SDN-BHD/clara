# Wave 2026-09-18 — ten tickets from the #612 refresh spec

Tickets: **#635** firm commercial settings (D2) · **#636** independent batch children (B3/C1) ·
**#642** native chat stream admission (B6) · **#651** depreciation (C7/C9) · **#655** invoice/bill
recognition (C1/C3/C6) · **#656** opening ledger (A6/C3) · **#657** bank match to existing booking
(C4) · **#658** progressive knowledge retrieval (B3/B6/C13) · **#659** firm Home (B1) ·
**#660** dashboard cash/profit (B2).

Base commit for every worktree: `abcc5030` (origin/main at wave start, 2026-09-18). Migration
frontier on that commit: **0224** (219 files). Runtime pins at base: `chatTurn_v20` /
`claraWork_v4` / `clientOnboarding_v5`.

Ceremony (same shape as `../refresh-wave-2026-09-15/`): gap maps (`gap-<n>.md`, read-only
census, two refuters each) → `SYNTHESIS.md` → `DECISIONS.md` (§0 大白话 for the owner,
owner-overridable) → `brief-<n>.md` → implementation in `C:\Users\zhant\Desktop\clara-wt\<n>` →
three-lens review + fix rounds (`reports/`) → `integration/wave-2026-09-18` (merges in migration
order, from-scratch chain on a fresh cluster, successor cut) → PR → `ci` green → main →
hosted release only after the owner says go (`RELEASE-RUNBOOK-*.md`).

Files here are the orchestrator's working record; the tickets carry the durable evidence.
