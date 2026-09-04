# 裁-162 — OD-13: for FS-11 ONLY, constraint 14 supersedes `docs/ops/DR.md:397-402`'s owner-run classifier for the reset / re-migrate / seed steps (2, 4, 7); the crown-jewel items stay owner-run; the supersession EXPIRES at beta live with the data authority itself

**Ruled 2026-09-03 ≈20:5x MYT (owner, AskUserQuestion), verbatim:** 「什麼意思？ beta live launch 後還有嗎？ 沒有的話就按照你的建議做」 → answered: none after beta live (constraint 14: "the data authority is DATA-scoped and expires at beta") → the recommendation stands as the ruling.

- The lead runs FS-11 steps 2 (backup), 4 (reset with `CLARA_ALLOW_DESTRUCTIVE=1` +
  `CLARA_DESTRUCTIVE_TARGET`), 7 (seed) as the owner's delegate through the real audited doors,
  DSN via `scripts/ops/dsn-pipe.mjs` only, receipted in the as-run.
- Stays [O]: reading any live secret; the R2 token; the `age` identity (OD-14); `gh pr merge`; the
  secret-bearing steps 11 and 12 (裁-152); the purges of 裁-161 unless the owner delegates them with
  a Management-API token env-to-env.
- **Scope and expiry, written into DR.md (T-D):** the supersession is one sentence, scoped to
  test data and to the pre-beta ceremonies; from beta live the DR.md owner-run line is in force in
  full — no agent-run destructive command against the live project once a real user exists.

**Record.** Ledger `-09-03` + digest row at the final truing; FS-11 prep D-4 carries it; T-D lands
in `docs/ops/DR.md` at the final truing.
