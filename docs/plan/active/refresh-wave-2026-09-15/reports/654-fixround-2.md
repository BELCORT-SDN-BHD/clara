# #654 — fix round 2

**Branch** `impl/654-firm-defaults` · **worktree** `C:\Users\zhant\Desktop\clara-wt\654` · rig PG
`127.0.0.1:55512` / `clara_654` (194 migrations) · head at review `ba2c1cfe` → **head now
`1251e374`**. One commit, worktree clean, nothing pushed, no `git worktree` command run, no other
lane's worktree, cluster or port touched. All evidence LOCAL; **hosted evidence pending** (no hosted
lane exists for this slice).

```
1251e374 fix(db): #654 the evidence wall decides the CONCURRENT case, on one advisory key
```

## Finding → what I did → evidence

| # | Finding | Severity as filed | What I did | Evidence (red → green) |
|---|---|---|---|---|
| 1 | **654-RC1** — both halves of the cross-client evidence wall are BEFORE-row triggers that read the OTHER table, so under READ COMMITTED two CONCURRENT transactions (a firm-scope `capture_knowledge` pinning a document, and `clara.file_document` naming that document) each take a snapshot in which the other's row does not exist, and BOTH commit — exactly the state 0205 §0(8) refuses to apply against and §E T.4 asserts is zero, reached with both guards installed. | `severity:"blocker"` in the verdict JSON; the finding's own text says *"SEVERITY: should, NOT a blocker"*. Treated as **must-fix** either way. | **Applied as prescribed, plus one addition the finding did not ask for.** `clara._tf_knowledge_firm_evidence` ARM 1 now takes `select 1 from clara.documents where id = new.source_document_id **for key share**` and then `pg_advisory_xact_lock(hashtextextended('clara.firm_knowledge_evidence:' ‖ new.source_document_id::text, 0))` **before** it counts the filings; `clara._tf_document_filing_firm_knowledge` takes the identical advisory key before it reads `clara.knowledge_records`. The row lock is the addition and it is what makes the pair deadlock-free — see "Why a row lock as well". Migration header §B and §F rewritten (the invariant under concurrency; the acquisition order; the `max_locks_per_transaction` cost); a new §E tail assertion pins that BOTH bodies carry the shared key literal, and the OK notice says so. | RED, measured in **all four** arrival orders before the change (table below): three of the four left `{documents:1}` live violators. First failing assert in the battery: *"capture-first / filing via raw: the second act resolved while the first was still OPEN — nothing serialises the two guards"*. GREEN: `p654.evidence.race_capture_vs_filing` (the 21st cell) passes all four orders, and prints the waits it now takes: `capture-first/door → Lock/transactionid`, `capture-first/raw → **Lock/advisory**`, `file-first/door → Lock/transactionid`, `file-first/raw → **Lock/advisory**`, every follower CLR10, every arm `{documents:0, works:0}` afterwards. |
| 2 | **654-RATIFY-1** — fix round 1's LIVE-only census in §0(8) / §E T.4. | ratification item; the finding says "No action needed from the fix worker". | **No action. RATIFICATION REQUESTED**, left to the orchestrator exactly as asked. Neither census was touched; both still count `state = 'live'` and raise a NOTICE for history. | This round's re-apply printed the NOTICE for real — *"#654 prestate: 11 superseded/withdrawn firm-scope revision(s) still NAME a client-bearing source. Reported, not refused…"* — then *"#654 prestate: clean …"*. `git diff HEAD~1 -- packages/db/migrations/0205_firm_knowledge_defaults.sql` touches §B's two bodies, the header and §E only; both predicates are unchanged. |

## The red, measured in all four arrival orders

Two barrier-synchronised raw connections with explicit `BEGIN`; the leader's statement is held
**uncommitted** while the follower's is issued and watched in `pg_stat_activity` (scratch probe on
55512/`clara_654`, before the migration changed):

| arrival order | filing path | follower queued on a lock? | follower outcome | live violators after |
|---|---|---|---|---|
| capture first | `clara.file_document` | yes — `Lock/transactionid` | CLR10 `document_cited_by_firm_default` | `{documents:0, works:0}` |
| capture first | raw `insert into clara.document_filings` | **no** | **committed** | **`{documents:1, works:0}`** |
| filing first | `clara.file_document` | yes — `Lock/transactionid` | **committed** | **`{documents:1, works:0}`** |
| filing first | raw `insert into clara.document_filings` | **no** | **committed** | **`{documents:1, works:0}`** |

The reviewer measured one violating order; there are **three**. The fourth is not protected by the
wall at all — it is protected by accident, and the accident is measurable: `_file_document_write`
takes `select firm_id from clara.documents where id = p_document **for update**` at its line 19 (read
off `pg_proc` on the rig) before it inserts the filing at line 63, and the capture's own FK check
(`fk_knowledge_records_source_document`) takes FOR KEY SHARE on the same row, which conflicts.
`pg_locks` for the blocked backend confirms it: `locktype=tuple`, `relation=clara.documents`,
`page 10, tuple 8`, plus a non-granted `transactionid` ShareLock on the filing's xid. In the third
row the capture blocks on that same row lock and **still commits**, because the wall's SELECT had
already run against a snapshot taken before the filing existed.

## Why a row lock as well, and why in that order

The finding prescribed the advisory lock alone. Alone it is taken **after** the filing lane has
already taken the documents row lock, which makes the two acquisition orders opposite (filing:
documents → advisory; capture: advisory → documents-via-FK) and a 40P01 reachable in the window
between them. Taking `clara.documents … for key share` first puts both lanes on one order, so the
pair is deadlock-free by construction rather than by a one-second `deadlock_timeout` and a
fail-closed abort. It costs nothing: FOR KEY SHARE is the weakest mode that conflicts with the
filing lane's FOR UPDATE, and it is **exactly** the lock this statement's own FK check takes
microseconds later — the transaction acquires no lock it was not already going to hold.

And the advisory key is why the row lock is not enough on its own: the row lock serialises only
because **another migration's body** happens to take FOR UPDATE, and an invariant resting on a body
this file does not own is one nobody can state. The advisory key is taken by both halves of this
wall, so the serialisation survives a filing writer that never touches the document row. The two
raw-INSERT arms are that proof — they are the two that now wait on `Lock/advisory`.

## Counts (all re-measured this round, 55512/`clara_654`, 29-gate chain)

| Check | Result |
|---|---|
| `knowledge-firm-defaults.test.mjs` | **21 cells — 21 pass / 0 fail / 0 skipped** (was 20) |
| + `knowledge-records` + `knowledge-onboarding-promotion` | **61 / 61 / 0** (was 60/60) |
| All five together (+ `operation-census` + `rig-isolation`, no reset flags) | **92 tests, 91 pass, 0 fail, 1 skipped**, 246 s (the skip is the destructive T19, by design; was 91/90/0/1) |
| FILING-lane regression set (`document-filing-conflict`, `rig-docs-filings-provenance`, `rig-docs-attribution`, `rig-docs-correction`, `rig-docs-download-door`, `f-a7-beta-filing-verb`) — run because `t_document_filings_firm_knowledge` now takes a lock on a core table's write path | **99 tests, 98 pass, 0 fail, 1 skipped** — identical to the reviewer's own measurement of the same set |
| `apps/web` census suites that read `packages/db/migrations` (`sql-oracle`, `parity-holes`, `firm-scope-surfaces`, `firm-scope-fourth-entrance`) | **88 / 88 / 0** |
| `pnpm typecheck` (worktree root) | **exit 0** — `apps/web typecheck: Done`, `packages/runtime typecheck: Done` |
| `pnpm lint` (worktree root) | **exit 0**, all four workspaces, `check-message-keys` selftests green |
| `node scripts/check-frozen-workflows.mjs` | **exit 0** — "OK — 281 frozen file(s) verified … 51 `use workflow` module(s) all frozen+registered" |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **exit 0** — reader ⊇ emittable, `work_question` still the part kind (run though not applicable: `packages/runtime` is untouched this round) |

No test failed anywhere this round, so there was no host-contention call to make.

## The migration was rolled back and re-applied from a true prestate

`0205` is unmerged, so this is the ordinary loop. On 55512/`clara_654`: the three triggers, three
trigger functions, two reads and the eligibility table dropped; the `clara.schema_migrations` row for
`0205_firm_knowledge_defaults` deleted (194 → **193**); the **seven** live firm-scope rows the RED
race arms had left citing a filed document deleted under a **session-local**
`session_replication_role = 'replica'` (never a global `alter table … disable trigger`). Prestate
predicates then re-read: `migrations 193, keys 13, eligibility table null, live_doc_violators 0,
live_work_violators 0, ineligible 0, historical 11`. `pnpm db:migrate` → *"migrate: 1 new
migration(s) applied · 194 total"*, with the history NOTICE, *"#654 prestate: clean …"* and *"#654
tail: OK …"* printed — the OK line now also names the shared advisory lock, and the new T.1
assertion (both guards carry the key literal) passed on that apply.

## What I deliberately left

- **The LIVE-only census (654-RATIFY-1)** — untouched, **ratification requested**. It is the
  orchestrator's call and the finding says so.
- **The whole `apps/web` unit suite and the Playwright `knowledge` run.** No file under `apps/web`
  changed this round (`git diff HEAD~1 --stat` = four files, all under `packages/db`), so neither
  would measure anything this commit did. I ran the four `apps/web` census suites that actually read
  `packages/db/migrations` instead; `pnpm typecheck` and `pnpm lint` cover the workspace either way.
  The last full-suite and Playwright figures stand as the reviewer re-measured them (3744 / 3742 / 0
  / 2 on the clean re-run; 27 passed / 0 failed).
- **The reviewer's from-scratch cluster 55612/`clara_654r` (`rig654r`).** It still carries the
  **pre-fix** 0205 and is therefore stale by one commit; I did not touch a port or cluster my order
  did not assign me. The orchestrator should re-apply there before reading it as current, or drop it
  (`wsl -u root -- pg_dropcluster --stop 17 rig654r`) at wave close.
- **`p_source: {}` in the shipped promote dialog** (`apps/web/lib/registers/knowledge.ts`), which the
  finding itself gives as the reason this race cannot be reached from today's UI. Unchanged, and
  still the honest caveat: the wall now holds against the door that *can* create a sourced firm
  record (`clara.capture_knowledge`, granted to `clara_authenticated`, with no RPC allowlist in the
  web proxy).
- **Hosted evidence** for any part of this slice.

## Rig state left for integration

Censused against 0205's own prestate predicates on 55512/`clara_654`:
`{migrations: 194, keys: 13, live_doc_violators: 0, live_work_violators: 0, ineligible: 0,
historical: 11}` — prestate-satisfiable, the 11 historical revisions being the notice-only path
654-RATIFY-1 is about.

## Sources of truth updated on the branch

`packages/db/README.md` — a new bullet in "Knowledge scope, firm defaults and exceptions": the wall
decides the concurrent case, the shared advisory key, the row-lock ordering and the cell that proves
it. `packages/db/tests/README.md` — twenty cells → twenty-one, the race cell described, and the
`freshResolution` dependency the real filing door needs. `docs/PRD.md` / `docs/ARCHITECTURE.md`
untouched. `654-final.md` updated in place: commit list, AC1/AC4 evidence pointers, cell and battery
counts, the filing-regression figure, and a "Fix round 2" section.
