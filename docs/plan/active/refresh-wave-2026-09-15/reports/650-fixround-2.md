# #650 — fix round 2 (recheck lens on `fed8b566`)

**Branch** `impl/650-client-home-work` · worktree `C:\Users\zhant\Desktop\clara-wt\650` · rig PG
`127.0.0.1:55509` / `clara_650` · Playwright **3310/3311/3312**. One new commit:

```
e9deacae fix(web,docs): #650 round-2 review — the drilldown claim is qualified where it is not true
```

`git status --porcelain` clean before and after. No `git worktree` command, no other lane's files,
no push, no `main`. Every run below is **LOCAL**; hosted evidence pending.

Two findings arrived, both carrying `severity: blocker` in the envelope while their own text reads
**"SHOULD-level, not a merge blocker"** (650-R1) and **"NOTE-level … polish, not a defect"**
(650-R2). I applied both rather than arguing the label: R1 is the module-README rule (AGENTS.md
step 4) and R2 was two lines of code plus a message key. Nothing was left to the orchestrator and
nothing contradicted the brief or DECISIONS.

## Finding → what I did → evidence

| Finding | What I did | Evidence |
|---|---|---|
| **650-R1** (should) — `apps/web/README.md:17`, a line this branch added, still said each count links into "that client's own Work list **already narrowed to it**", unqualified, for all three facets. Round 1 fixed `packages/db/README.md`, the tile and the report, and left the web-side source of truth asserting the version B1 disproved. | **Fixed, docs only.** The Client row now reads "narrowed as closely as that list's own axes allow (the recent-success drilldown is the same week over a different subject, which the tile discloses; see below)", and a new paragraph under the band paragraph states BOTH narrowings the list's axes cannot express: "retrying" is not a member of `clara.list_accounting_work`'s status roster so it stays a row label, and "Finished recently" counts a committed receipt while that door fences `p_since`/`p_until` on `accounting_work.created_at` — when the Work was STARTED — and carries no receipt-dated axis. It names `p650.pack.recent_success_drilldown` as the measurement, and states the windowless arm too. No code change, exactly as the finding said. | RED (a docs claim has no cell; the red is the claim itself): `grep -n "already narrowed to it" apps/web/README.md` → line 17, the unqualified sentence, on a branch whose own `p650.pack.recent_success_drilldown` and browser leg land on a DIFFERENT population than the tile counted (`home-board-walk.spec.ts:410-417` — the list returns "Rates accrual" and drops "Bank fee"). GREEN: same grep → **exit 1, no match**; the qualified text is at `apps/web/README.md:17` and `:35-45`. |
| **650-R2** (note) — `recentSuccessListBasis` rendered on every recent-success count > 0, including the arm where `workAttentionHref` deliberately drops both dates because the window is unreadable (`client-work-pack.ts`, pinned by `client-work-pack.test.ts:247-254`). On that link — a bare `?status=completed` — "the same seven days" is false: it opens every completed Work this client has ever had. | **Fixed, not recorded as a residual** (the finding offered either). Chose the "second, dateless line" over "no line": silence would leave a bare `?status=completed` under a seven-day count with LESS explanation, not more. New key `recentSuccessListUndated` names the wider population. And the question "is this drilldown dated" now has **one** spelling — `workAttentionWindowDates(pack)` — read by the href builder, by `workAttentionWindowInstants` and by the board, so the sentence and the URL cannot drift apart (before, the predicate was written twice and the board had no access to it). | RED first: the new cell "a window this build could not read makes the disclosure say the WIDER thing, not the false one" → `not ok 4 … error: 'a dateless link does not open the same seven days, so the tile must not say it does'`, `ERR_ASSERTION`, `client-work-attention.test.tsx:217` (17 tests, 16 pass, **1 fail**). GREEN after the fix: **55 tests, 55 pass, 0 fail, 0 skipped** across the four touched web files. |

Both cells stay: the second new one ("a readable window keeps the narrow disclosure — the wider
sentence is not the default") is the control that stops the wide sentence becoming the default.

**The arm really is defensive, and I checked rather than repeated the claim.** 0199 computes
`v_from_date := v_today - 6` and publishes `'from_date', v_from_date::text` /
`'to_date', v_today::text` unconditionally (`0199_client_work_pack.sql:290-291,423-427`), so a
window without dates is a malformed body, not a state the door can produce. That is why R2 is
polish, and why the fix is a sentence rather than a new facet state.

## Counts

| Run | Result |
|---|---|
| `node --import ./test/bootstrap.mjs --import tsx --test lib/work/client-work-pack.test.ts lib/work/use-client-work-pack.test.ts components/firm/client-home/client-work-attention.test.tsx components/firm/client-workspace-overview.test.tsx` | **55 tests, 55 pass, 0 fail, 0 skipped**, 5.4 s (53 at `fed8b566`; the two new ones are this round's) |
| whole `apps/web` unit suite, `node scripts/run-tests.mjs` | **3,762 tests, 135 suites, 3,760 pass, 0 fail, 2 skipped**, 361.1 s, exit 0 (3,760/3,758 at `fed8b566`). The 2 skips are the live-provider auth cells. The `#630` `use-clara-thread-stop.test.ts` failure the recheck lens saw under load did **not** recur here; the census suites (`sql-oracle`, `parity-holes`, `firm-scope-surfaces`, `firm-scope-fourth-entrance`, `e2e-fixture-ownership`) are green |
| `pnpm --filter @clara/web e2e home-board-walk` on 3310/3311/3312 (all three verified free with `netstat` first; no listener killed, no other lane's port touched) | **9 passed, 0 failed**, 50.0 s, exit 0 — **first solo run**, no re-run owed |
| `pnpm typecheck` (worktree root) | apps/web Done, packages/runtime Done, **exit 0** |
| `pnpm lint` (worktree root) | **exit 0** across all four workspaces; `check-message-keys` **2,932** keys (2,931 + the one new key) with its selftest, `check-test-manifest` (+ selftest; no manifest row owed — no new test FILE), `check-token-contrast` |
| `node scripts/check-frozen-workflows.mjs` | **OK**, 281 frozen files verified append-only vs `origin/main`, 51 `use workflow` modules frozen+registered, exit 0 |

**Not run, and why:** the `packages/db` battery, `operation-census`, `rig-isolation` and
`check-parts-parity`. `git diff fed8b566..HEAD --stat` is five files, all under `apps/web` — no SQL,
no migration, no `packages/runtime` file. The migration stays byte-identical to `a948fb8b`, so **no
rollback, no re-apply and no from-scratch chain** was owed.

## Final report updated in place

`reports/650-final.md`: the commit block gains `e9deacae`; the round paragraph now names both fix
rounds and states that neither touched `packages/db/migrations/` or `packages/runtime/`; the **AC3**
row gains the windowless arm and the one-predicate note; "Docs updated" names the README's new
drilldown paragraph; the counts carry the numbers above.

## What I deliberately left

1. **The `severity: blocker` labels.** Both findings self-describe as should/note and I fixed both,
   so the label needs no adjudication — recorded only so the orchestrator is not hunting a third,
   larger defect behind the word.
2. **No new e2e leg for the windowless arm.** The door cannot produce that envelope (evidence
   above); reaching it in the browser would need a mock publishing a malformed window, which would
   assert about the mock rather than about the estate. The unit cell is the right altitude, and
   `home-board-walk.spec.ts:421` already pins the dated sentence on the populated board.
3. **`countRecentSuccess`'s `days: pack.window?.days ?? 7`** still prints "7" when the window is
   unreadable. That fallback restates the door's FIXED contract (seven MYT dates, `0199:290`)
   rather than guessing about a read, and the count itself came from the door. Left as is.
4. **Every residual and follow-up already named in `650-final.md`** — D13's activity-kind
   misfiling, `stopping` carrying no tile, the needs-you chip's active-client guard, and the five
   filed follow-ups (including the receipt-dated list axis this round's sentence exists because of).
   None is a fix-round item.
5. **`responsive-shell-walk` was not re-run.** The recheck lens ran it green (24/24) on
   `fed8b566`, and this round changed one conditional sentence inside an already-populated tile.
   Another run would add a twelve-lane contention data point, not evidence.
