# #641 review fix round — final report

**Branch** `impl/641-work-list-detail` · **worktree** `C:\Users\zhant\Desktop\clara-wt\641` · **clean**. Six new commits (`git log --oneline main..HEAD`):

```
1aeb3f80 docs: #641 — ARCHITECTURE records the door as WIRED, the new index, the Entered-by expression and the caps
ee9ce68d fix(web): #641 — the saved-view caps are mirrored from 0189 and said in words
f2e882f2 fix(web): #641 — the addressed ?work= row is fetched OUTSIDE the page window, announced, and focused
ee4ec031 refactor(web): #641 — ONE enumeration of the seven filter axes, and the dead client-list reader deleted
e9a583ec test(db): #641 — eight new work-list cells for the gaps the migration review measured
45b7cf6c fix(db): #641 — 0189 refuses what only LOOKED empty, bounds its granted helper, and indexes the firm-wide keyset
```

## Finding → what I did → evidence

| Finding | What I did | Evidence (test cell + output) |
|---|---|---|
| **SPEC BLOCKER** addressed-row fetch unwired | `work` field in `WorkListUrlState`; new `components/work/use-addressed-work.ts` (#746 refs) calls `getAccountingWorkRow` only when the page cannot answer; `accounting-work-list.tsx` renders it in a labelled region above the table (`role=status`, focus on its link) or marks the in-page row `aria-current`/`data-addressed`; CLR11 → honest not-found | **Red-first**: with `?work=` parsing disabled `accounting-work-list.test.tsx` = 10 pass / **4 fail**; restored **14/14**. Walk cell "an addressed ?work= row OUTSIDE the page window…" — `work-list-walk` **17/17** |
| **SPEC SHOULD** "Entered by" filtered `w.initiator` | 0189 pass 1 → `coalesce(w.initiated_by, w.initiator) = p_initiator` | db **`wl.26`** (a real Take-over via `admit→claim→settle(authority_lost)→deactivateMember→take_over_accounting_work`): filter by who ASKED finds it, by the new responsible does not — **pass** |
| **SPEC NOTE** dead `listAccountingWork`/`BoundedWork` | Deleted with `WORK_FETCH_CAP` + its test cell (grepped all of `apps/web`, tests/census included — only its own test called it) | `reads.test.ts` **12/12**; typecheck green |
| **STD SHOULD** 7 axes in 5 places | `WORK_LIST_FILTER_AXES` + one `axisValue`; `hasWorkListFilters`, `countWorkListFilters` (moved out of `work-list-filters.tsx`), `workListStateQuery`, `EMPTY_WORK_LIST_FILTERS`, cursor rule all derived; both clear-literals gone | `work-list-url-state.test.ts` **8/8** (axis count 2 for 3 tokens; Clear leaves only `work=`) |
| **STD SHOULD** PaginationLink `role="button"` | Disclosure kept; comment now says the follow-up **issue is filed at integration** (`accounting-work-list.tsx:423-431`) | walk still asserts the role as-is — **17/17** |
| **MIG SHOULD** `p_status => ARRAY[null]` → `rows=0` | `v_status is null or …`; presence check on `p_purpose` elements (`invalid_purpose`) | db **`wl.20`** — `[null]`, `["completed",null]`, `purpose:[null]` CLR10; `[]` still "no filter" — **pass** |
| **MIG SHOULD** helper unbounded | `p_works is null or array_length > 101 → CLR10 invalid_work_ids` | db **`wl.22`** — 101 lawful, 102 + null refuse, cross-firm 0 rows — **pass** |
| **MIG SHOULD** no firm-wide index | §0.5 `ix_accounting_work_firm_created (firm_id, created_at desc, id desc)` + comment; header sentence true; tail asserts `pg_get_indexdef` | db **`wl.27`** — RLS-bound `EXPLAIN` as `clara_authenticated`: `Index Only Scan using ix_accounting_work_firm_created`, `Index Cond: (firm_id = clara.jwt_firm())`, **no Sort** — **pass** |
| **MIG SHOULD** thin tail | Posture loop (owner, `search_path`, `plan_cache_mode`, PUBLIC/authenticated) on all three; **literal `proacl`** on all four (0188 §5b) replacing the grant counts; `save_my_preferences` gains owner/search_path + 2 shape probes | Tail ran on the from-scratch chain: `applied 0189_work_list_reads` · `183 new migration(s) applied · 183 total` |
| **MIG SHOULD** db test gaps | `wl.20`–`wl.27`: the 100 ceiling on a 105-Work client built in ONE statement (so the id tie-break orders the page) + `p_limit null → 25`; helper direct; NULL-rank → CLR04 ×3; ten cursor shapes; workViews caps | `work-list.test.mjs` **27 pass · 0 fail · 0 skip** |
| **MIG SHOULD** web mirrors shapes not caps | `WORK_LIST_MAX_SAVED_VIEWS`/`WORK_LIST_QUERY_MAX`; `capRefusal()` at the Save press *and* at submit; `maxLength=512` on `q`; name field made controlled | `work-saved-views.test.tsx` **3/3** — the two sharp cells assert **no write sent** and **no naming form opened** |
| **MIG NOTE** `-infinity` cursor | Non-finite cursor timestamps → `invalid_cursor` | db **`wl.24`** (both infinities). `yesterday`/`epoch` deliberately not refused — PG accepts them as finite; the cell says so |
| **MIG NOTE** view with no `query` | `query` required as string; control chars in id/name refused; ids deduped once trimmed | db **`wl.25`** (missing key, whitespace-only-differing ids, control chars) |
| **MIG NOTE** unread `last_run_at` | Dropped from the helper's return table | db `wl.22`; typecheck green |

## Verification

- **db** on **rig641b** (`127.0.0.1:55448/clara_641`, fresh chain @ 0189), exact 24 gate flags from `packages/db/package.json`: **27 pass · 0 fail · 0 skip · 3.2 s**. No cell of mine skips.
- **`migrate.mjs` re-run**: `0 new migration(s) applied · 183 total`; the runner re-checksums every applied file (`scripts/migrate.mjs:329-336`) — no drift.
- **touched web unit files**: 14/14, 3/3, 8/8, 9/9 (`work-list.test.ts`), 12/12.
- **whole apps/web suite** ×3: **3410 tests — 3409/1, 3408/2, 3408/2**. Reds differed every run and **each passes alone**: `attach-evidence-dialog` 22/22, `thread-live-clarify` 2/2, `journal-composer` 39/39, `checkout-faces-a11y` 25/25, `use-clara-thread-stop` 25/25 → concurrent-runner load flakes (WORK-ORDER §3). No census red; #707/#693 not in this package.
- **e2e** `work-list` **17/17**. `journal-work-walk`: first run 13/2 (both 30 s timeouts on clock-bound polling, 5.7 m wall), **re-run 15/15** (2.4 m) — load flake, named not fixed.
- **`pnpm typecheck`** green; **`pnpm lint`** green (eslint, token-contrast, manifest ×2, message-keys: 2524 keys resolve). Worktree clean.

## Docs

`docs/ARCHITECTURE.md` §9 #641 paragraph (door now *wired*; the `coalesce` expression; the index + measured plan; the caps) and the §11 "财务界面与输出" row (real counts, hosted evidence pending).

## Assumptions / unverified

- `?work=` is not a filter: it survives filter changes and Clear filters, never enters a saved view.
- The addressed row sits **above** the table, not spliced into it (appendix D row 33 `Item` is uninstalled; only `pagination`/`empty` were installed).
- The e2e mock owns `get_accounting_work_row` for its own `c641c641-2222-` id space (CLR11 for one it did not mint); ownership census note updated, still `{unscopeable: [], debt: []}`.
- **Unverified**: anything hosted; the index's effect at production row counts (rig only).
