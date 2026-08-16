# The #43 wording-seed (0087-0088) ceremony — as run (2026-08-16)

**Scope:** the owner-approved MASB statutory-wording seed applied to the live project from
merged `main` (cd0dea2, PR #249). No D1 quiesce — pure curated-table INSERTs through the
0067-sanctioned `clara_fn_owner` path inside the migrations; no writer body changes; the
runtime stayed up throughout. **Result: 2/2 applied clean; positive reads ALL-PASS.** Live
frontier: 81/`0086` → **83/`0088`**.

## Order of operations

1. **Backup banked first**: `clara-backup` on-demand run 2026-08-16T06:17Z → R2 (machine
   exit 0; hc-ping success).
2. **Apply** via the no-print DSN bridge (sleeper + `printenv` → `dsn-pipe.mjs`;
   `sslmode=verify-full`, pinned pooler CA, port 5432 session mode; `node scripts/migrate.mjs`
   direct). Both prestates held; both tail censuses re-read the outcome clean.
3. **Positive reads** (asserted by script, ALL PASS): ledger **83**, frontier
   `0088_masb_wording_seed_lexicon` · `statutory_wording` by locale **en 13/13 verified ·
   ms 4/4 · zh 5/5** (22 rows total, byte-per-packet) · **the E-R14 milestone read**:
   `mpers_company` required-section wording per revision/locale = `{1/en: 5, 1/zh: 5,
   1/ms: 4, 2/en: 5, 2/ms: 0, 2/zh: 0}` — **en and zh statutory packs are ISSUABLE from
   this moment** (revision 1, periods beginning 2016-01-01; revision 2's en ready for
   2027-01-01); ms stays gated at 4/5 per the owner's sign-off (the `notes.title` hold-back)
   · `claim_phrase_lexicon` 9 rows · `claim_policy_versions` one per locale (en/ms/zh) ·
   `NOTIFY pgrst` sent.

## The sign-off of record

The owner approved task #43 on 2026-08-16 with three dispositions: the amendment-2 Issue-3
substitution applied to BOTH matching ms labels (the builder's disclosed judgment call,
ratified); `benar dan patut` NOT seeded (stays on the held-back list for a future sitting);
the zh/ms issuability asymmetry accepted as stated (zh opens on best-practice-translation
rows while ms waits on an official source for one slot; `authority_level` is decorative at
the gate — a registered Wave-F question).

## Residue

- One probe defect in the ceremony's own read script (guessed join-column names in the
  five-slot query) was fixed from 0065's DDL and re-run to ALL-PASS; the estate was correct
  throughout — the failure was the instrument's.
- The first real render/seal round-trip still awaits the BEE FY2025 close (the owner's
  sitting; the close packet is delivered). DR-render.md's unrun-drill boundary stands.
