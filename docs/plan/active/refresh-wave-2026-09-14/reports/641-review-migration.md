# #641 / 0189 — adversarial migration-safety & data-security review

`clara-wt/641`, `impl/641-work-list-detail`, `packages/db/migrations/0189_work_list_reads.sql`. Rig `clara_641` @ 0187+0189. Scratch batteries in the session scratchpad; worktree `git status --porcelain` → empty.

**No BLOCKER.** Every cross-firm, floor and cursor attack was refused or answered empty.

**Gate run.** `node --test --test-concurrency=1 <the 24 --import gates from packages/db/package.json> tests/work-list.test.mjs` → **19 pass · 0 fail · 0 skip · 2286 ms**.

## SAFE — measured

**1 Cross-firm** (attacker BOB, bookkeeper of firm A). `list(p_client=<firm B client>)` → `{"rows":[],"truncated":false,"next_cursor":null}`. A cursor **minted inside firm B** (`2026-09-14T04:44:20.118026+08:00|b0c37e0f-…`) replayed by BOB → 25 rows, **zero firm-B ids**; same cursor + `p_client=B1` → `[]`. `get_accounting_work_row` on firm B's 4 ids → 4×**CLR11**. `clara._work_run_attempts(<firm B's ids>)` as BOB → **0 rows**; `[firmB, firmA]` → only the firm-A row. `p_initiator=<dave>` → 0; `p_q='bx'` firm-wide → 0.

**2 Floor.** viewer · ghost sub · real user with no membership (`jwt_firm()=null, actor_role_rank()=null`) · no `request.jwt.claims` → **CLR04** on all three functions.

**3 Cursor / limit.** Non-base64, no pipe, leading/trailing pipe, non-uuid id, garbage ts, 200 KB payload, `'; drop table …` → all **CLR10 `invalid_cursor`**; no SQL leaked, no loop. `""`/whitespace → clean first page. On a 108-row client: `0,-1`→1 · `null`→25 · `100,101,1e9,2147483647`→**100**, `truncated=true`; walk at 100 → 108 rows, 108 distinct, 0 missing.

**4 `p_q`.** `%`, `_`, `\`, `'`, `' or 1=1 --`, `%rent%` → **0 rows** (literal `position()` containment); `A-RENT` matches `A-rent`. RLS-bound `EXPLAIN (analyze)` as `clara_authenticated`: `Index Cond: (firm_id = clara.jwt_firm())` — bounded by the firm, not the table.

**5 Determinism.** 6 Works admitted in one txn → `count(distinct created_at)=1`. At limit 2: **3 pages, 6 distinct, 0 missing, 0 dupes**, order identical to a single 100-row page. The cursor round-trips at microsecond precision; identical walk under `Asia/Kuala_Lumpur`, `UTC`, `German,DMY`, `SQL,MDY`, `Postgres,DMY`. A concurrent head insert neither duplicated nor skipped. Fence tuple == ORDER BY tuple.

**6 The recut.** sha256 of 0179's body text recomputed = `3b927762708fc174…8f8399` — **identical to 0189's pin**. `diff` of the two bodies: only 2 declares, 1 comment and the `workViews` arm; every 0179 arm survives live (`unsupported_top_level_key`, `notifications.email`, CLR06 stale, `||` merge keeps `motion`). 21 views / 10k views / query 513 / 10 MB / non-string / nested / `[null]` / id 65 → **CLR10 `interface.workViews`**. Ceiling (20×512) stores 10 961 JSON chars — bounded.

**7 ACL.** All three: `proacl={clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}`, owner `clara_fn_owner`, `proconfig=[search_path=clara, pg_temp, plan_cache_mode=force_custom_plan]`; doors INVOKER, helper DEFINER. `save_my_preferences` kept DEFINER + owner + grant across the `create or replace`.

**8 Merge order 0188→0189→0190.** No object collides (0188: three `*operator_support*`; 0190: `get_document_for_human_read_v2` plus a prosrc pin on **v1**, untouched here); both neighbours' prestates assert only their own names, and filename order fixes application order regardless of merge order. `migrate.mjs` re-run → `0 new migration(s) applied · 183 total`, checksums re-verified.

## SHOULD

- **`p_status => ARRAY[null]` is not refused.** `if v_status not in (…)` is NULL for a NULL element, so validation passes and `= any()` matches nothing: measured **`rows=0`**, no CLR10 — exactly the "`[]` looks like *no such Work*" failure the header says it refuses. Fix: `if v_status is null or v_status not in (…)`.
- **The DEFINER helper's boundedness is claimed, not enforced.** Its COMMENT says "at most p_limit+1 ids", but it is granted and PostgREST-reachable with an unbounded `uuid[]`. As BOB: 1 000 ids → 22 ms · 100 000 → 820 ms · **1 000 000 → 5 623 ms** server CPU. Add `if array_length(p_works,1) > 101 then raise CLR10`.
- **No firm-wide `(firm_id, created_at desc)` index** — `pg_indexes` carries only `ix_accounting_work_client (client_id, created_at desc)`, so firm-wide `EXPLAIN` shows a `top-N heapsort` over the firm's whole Work **per page**, cursor or not. `/work` is that surface. The header's "over the same ordering firm-wide" reads as an index claim the plan does not support.
- **Tail thinner than this wave's own idiom.** It asserts `plan_cache_mode` but not `search_path` nor owner on the three new names, and counts `information_schema.role_routine_grants` instead of asserting the literal `proacl` — the weakness 0188 §5b argues against.
- **Test gaps.** `work-list.test.mjs` never calls `_work_run_attempts` directly, never proves the **100** ceiling (wl.7's client holds 3 Works) nor `limit null → 25`, has no NULL-rank cell, covers one malformed cursor shape, and pins no `workViews` cap — only 6 shape faults.
- **Web mirrors shapes, not caps.** `work-saved-views.tsx` caps `name` at 64 and dedupes ids, but has no 20-view guard and no 512-char guard on `query` (the `q` input has no `maxLength`), so a 21st save surfaces a generic `saveViewFailed` banner.

## NOTE

- A cursor timestamp of `-infinity` or `epoch` yields a **clean empty page** — a hand-edited `?cursor=` can fabricate "nothing here" (`infinity`/`now`/future give a correct first page).
- First-use and no-match are byte-identical at the door; the Empty taxonomy is entirely the browser's job.
- The recut accepts a view with **no `query` key**, which `preferences.ts`'s `toWorkSavedView` then silently drops. Ids differing only by whitespace, or carrying `\n`/control characters, are accepted.
- `_work_run_attempts` returns `last_run_at`, which neither door projects — an extra same-firm fact exposed only because the helper is directly callable.
