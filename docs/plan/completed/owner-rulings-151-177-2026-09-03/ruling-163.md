# 裁-163 — OD-14: the pre-reset restore-proof uses the FRESH LOCAL `--profile full` dump, restored by the lead into a throwaway PG17 (route B). The R2 bundle is NOT decrypted at FS-11; the monthly-light drill stays overdue → a Known-issues row. (Owner ruled AGAINST route A.)

**Ruled 2026-09-03 ≈21:0x MYT (owner, AskUserQuestion), verbatim:** 「(B) 本地新備份，我自己做」.

**Recommendation declined (dissent filed):** route A — the latest R2 bundle decrypted with the
owner's `age` identity, discharging the pre-reset gate AND the monthly-light cadence (last run
2026-07-22, `docs/ops/DR.md:404-415`) in one act, proving the OFF-SITE copy. Consequence stated once:
only the local dump is proven; the off-site bundle's decryptability stays unproven since 07-22.

**The sharpened execution (route B, made a real proof):**
1. FS-11 step 2: `--profile full` dump of the live project (DSN via `scripts/ops/dsn-pipe.mjs`),
   sha256 + byte size recorded in the as-run; the artifact kept OUTSIDE the run's working tree until
   FS-11 closes.
2. Step 2b: restore it into a throwaway PG17 (fresh container, instance-unique name), run the
   `dr-verify` subset (`packages/db/scripts/dr-verify-checks.mjs`) AND the post-restore ceremonies of
   `docs/ops/DR-full-drill.md:128-146` — a restore that skips them is not a proven restore. Any
   check other than clean ⇒ the reset does NOT open.
3. The as-run names the instrument and its outputs (never "the dump completed").
4. **Known-issues row (owner · next step · ruling):** the monthly-light restore drill is overdue
   since 2026-07-22 and the latest R2 bundle's decryptability is unproven since then; owner action:
   run `DR.md:376-381` / `:431-436` with the `age` identity (custody: owner, off-repo, off-R2) on a
   date the owner picks; ruling 裁-163. Launch blocker 16's "the `age` identity in hand" is asked
   at the launch sitting under OD-21 (the knowingly-open list), not skipped.

**Record.** Ledger `-09-03` (with the dissent line) + digest row at the final truing; FS-11 prep
step 2b and launch-sitting G3/G9 carry it.
