# 裁-177 — FS-11 opens tonight WITHOUT the pre-reset dump and WITHOUT the restore-proof (steps 2 / 2b waived): a direct factory reset (`DROP SCHEMA clara CASCADE`) + the full 159-migration re-apply. (Owner ruled AGAINST "(b) a 5-minute forensic dump".)

**Ruled 2026-09-04 ≈01:30 MYT (shell clock; owner, AskUserQuestion), verbatim:** 「今晚接着做,备份不用了, 直接factory reset and sync all newest db migration?」 → after the explanation, 「(a) 兩個都不做，直接重置」.

**Owner's ground.** Everything in the live `clara` schema is test data (裁-161's ground, constraint 14);
the repo re-creates the estate (seed + fixtures) and BELCORT is re-minted through the self-serve door (裁-159).

**Recommendation declined (dissent filed):** (b) a `--profile full` dump kept outside the tree as forensic
insurance, the restore-proof waived. Consequence stated once: the old database's contents survive only in
the nightly `clara-backup` R2 bundle (encrypted; the owner's `age` identity opens it — unproven since
07-22, 裁-163's row); a failure mid-reset is fixed forward (re-run the migrator on the empty schema).

**Effect on the records.** 裁-163's route B is SUPERSEDED for tonight by this ruling (its Known-issues
row about the overdue R2 drill stands). The Wave-G checklist's "confirm the backup completed and is
restorable before the reset" (`:263-265`) is re-cut: "for a TEST-DATA reset before beta live the gate
is waived by ruling (裁-177); for any reset after beta live it binds in full" (T-I). The P-12 throwaway
PG17 is torn down unused. FS-11 steps 2 and 2b are recorded as WAIVED, not skipped silently.

**Record.** Ledger `-09-03/-09-04` (with the dissent line) + digest row at the final truing.
