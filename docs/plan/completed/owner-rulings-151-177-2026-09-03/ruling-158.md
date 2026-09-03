# 裁-158 — OD-9: the `apps/dashboard` SOURCE delete lands BEFORE beta live — the code lane opens now. (Owner ruled AGAINST the Backlog-row recommendation.)

**Ruled 2026-09-03 ≈20:3x MYT (owner, AskUserQuestion), verbatim:** 「上線前就刪：現在開這條代碼 lane」.

**Recommendation declined (filed as dissent):** defer to a dated Backlog row. Consequence stated once:
one more full-ladder code PR before the sitting (root build without `apps/dashboard`, the 61-suite
classification table, the docs path sweep so harness-links stays green, CI job edits, ONE fresh opus
review, a hand sweep after merge).

**The sharpened execution (the owner's choice, made lawful):**
1. The lane opens NOW (opus-5 xhigh, own worktree), branch `chore/delete-apps-dashboard`, PR opened
   with a **DO-NOT-MERGE-BEFORE-FS-10-S21** banner in its body.
2. **Merge gate = FS-10's real-origin re-walk (S21) PASSED and its as-run written** — the sequencing
   law (`fe-train-plan-2026-08-30-orders-p6.md:450-454`): repoint first, prove the Workers build serves
   every route, THEN delete; never the same commit as the repoint. #539 merges first; this PR
   rebases onto it.
3. After merge: `gh workflow run ci.yml` (a code merge after the sweep) — green before the sitting.
4. FS-11 does not depend on it (packages/db is untouched); the sitting's go/no-go reads the sweep.
5. 裁-150 is intact: this lane is BEFORE the e2e, not a "next lane".

**Record.** Ledger `-09-03` (with the dissent line) + digest row at the final truing; FS-10 prep
S24/S25 become "the PR merges after S21" instead of "a Backlog row".
