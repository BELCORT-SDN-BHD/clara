# Wave 2026-09-18 integration — the ten merges, the two from-scratch chains, the gates

Branch `integration/wave-2026-09-18` @ **`2f60ff29`** (`2f60ff298b292a6b3aa6531e5d17942af855f46b`),
worktree `C:\Users\zhant\Desktop\clara-wt\int`, base `origin/main` (**`abcc5030`**, re-fetched at the
start of this session and again before the first merge — **0 commits ahead**, so no renumber and
0225–0233 stayed free). Worktree clean; **nothing pushed, no PR, no ticket worktree or cluster
touched, no successor cut.** 134 commits ahead of `origin/main` (10 merge commits, 121 inherited
from the ten branches, 1 plan-folder commit, 3 integration fixes).
**423 files changed, +93,297 / −947.**

Rigs — all three created fresh for this run, none had ever seen a clara migration:

| rig | port | database(s) | used for | `clara%` roles before the chain |
|---|---|---|---|---|
| `rigint` | 127.0.0.1:**55720** | `clara_int` | db-estate chain + batteries | **0** (0 `clara` tables too) |
| `rigrt` | 127.0.0.1:**55721** | `clara_rt`, `clara_rt_test` | runtime unit suite | **0** |
| `rigint3` | 127.0.0.1:**55722** | `clara_intake_ci`, `clara_wave_b_ci`, `clara_rt_test` | World e2e legs (§4.3) | **0** |

PG **17.11** on all three. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set
anywhere. Every number below is **LOCAL**; **hosted evidence: none, anywhere in this wave.**

---

## 1 · Merges, no-migration branch first then migration order

| # | merge sha | branch (tip merged) | migration | conflicted files |
|---|---|---|---|---|
| 1 | `5b320ea8` | `impl/642-chat-stream-admission` (`566665f0`) | — | **none** |
| 2 | `57680113` | `impl/655-invoice-bill` (`0911f7b8`) | 0225 | **none** |
| 3 | `29a2f3f8` | `impl/657-bank-existing-booking` (`43cba443`) | 0226 | 4 |
| 4 | `2f83f2f8` | `impl/651-assets-depreciation` (`9d96ad45`) | 0227 | 5 |
| 5 | `a01d6693` | `impl/656-opening-ledger` (`0a86d5ab`) | 0228 | 7 |
| 6 | `a0ba2ee5` | `impl/636-work-batch` (`879125fd`) | 0229 | 8 |
| 7 | `6cd44caf` | `impl/658-knowledge-retrieval` (`141103cb`) | 0230 | 8 |
| 8 | `097618f4` | `impl/659-firm-home` (`cc19cf18`) | 0231 | 2 |
| 9 | `419c9a1e` | `impl/660-dashboard-cash-profit` (`c14bd953`) | 0232 | 11 |
| 10 | `b255e0e9` | `impl/635-firm-commercial-settings` (`a9d2d964`) | 0233 | 6 |

Every tip was verified against the order before merging. `git merge --no-ff` throughout, **never a
rebase**, so every reviewed SHA on every branch stays reachable. No branch edited `docs/PRD.md` or
`docs/ARCHITECTURE.md`: `git diff --name-only origin/main HEAD -- docs/` is **empty except
`docs/plan/active/refresh-wave-2026-09-18/`**, the wave folder this run committed itself.
`git ls-files --eol` over the 423 changed paths: **no CRLF in the index**.

Then `02d74503` — **`docs: wave 2026-09-18 plan, gap maps, briefs, decisions and lane reports`**:
the whole plan folder copied in (DECISIONS, SYNTHESIS, the ten briefs, the ten gap maps, the orders,
RIG.md, `reports/`), **96 files, +22,319**.

---

## 2 · Conflict resolutions, file by file

Fifty-one conflicted files across the eight conflicting merges, but only eleven distinct files —
most conflicted repeatedly and took the same rule each time.

### Shared registration files — unions

**`packages/db/package.json`** (8 merges, the wave's hottest file). The preintegration-gate
`--import` chain is ordered by **migration number**, never alphabetically: each merge spliced the new
gate immediately after the previous wave-number's. Final chain **49 gates**, tail
`… preview-invite (0224) · trade-invoice (0225) · bank-match-evidence (0226) ·
depreciation-history (0227) · opening-ledger-source (0228) · intake-batches (0229) ·
knowledge-retrieval (0230) · firm-portfolio-pack (0231) · client-financial-pack (0232) ·
firm-commercial-settings (0233)`. Every one of the 49 gate modules exists on disk; no duplicate flag.

**`packages/db/tests/rig-meta.mjs`** (7 merges, 16 hunks). Cohort declarations and
`cohortFailures(...)` calls unioned. **The `];`/`}` hazard DID fire once**, on the #660 merge: #659's
`if (portfolioLive.length !== 0) { … }` and #660's `if (financialPackLive.length !== 0) { … }` are
both bimodal guards, and the union swallowed #659's closing brace — the module then failed to import
(`SyntaxError: Unexpected token 'export'` at :3378). Repaired at the merge, before the commit. Final:
module imports cleanly, **93 exports, 74 cohorts, 108 `cohortFailures` calls**, and all eight wave
cohorts are present — `TRADE_INVOICES_0225`, `BANK_MATCH_EVIDENCE_0226`, `FA_DEPRECIATION_0227`,
`INTAKE_BATCHES_0229`, `KNOWLEDGE_RETRIEVAL_0230`, `FIRM_PORTFOLIO_PACK_0231`,
`CLIENT_FINANCIAL_PACK_0232`, `FIRM_COMMERCIAL_0233`. **0228 ships none by design** (DECISIONS §6.1:
it installs no function, so it stays comment-only — the only row of §2.2's "may be comment-only"
that survives; #635's 0233 cohort is the four-name one §6.1 corrected into existence).
**#651 declared its cohort beside its FA sibling** (`FA_DEPRECIATION_0227_COHORT` at :1971, right
after `FA_ACQUISITION_0216_COHORT`) and its call after #639's, rather than at the 0225–0233 tail:
the file groups by FAMILY, not by number, and the auto-merge landed it where #651's branch put it.
Left as the branch wrote it, recorded here so nobody reads it as drift.

**`apps/web/messages/en.json`** (2 merges). Union with **no duplicate key anywhere**, verified with a
strict duplicate-recording parser rather than `JSON.parse` (which would have hidden one). **Both
unions dropped the `},` that closed the namespace above** — the #658 merge (TradeInvoice ▸
WorkKnowledge) and the #635 merge (IntakeBatch ▸ FirmSettings) — caught by the strict parse at the
merge and repaired before the commit. Each namespace was then diffed against its own branch:
`TradeInvoice` ≡ `impl/655`, `WorkKnowledge` ≡ `impl/658`, `IntakeBatch` ≡ `impl/636`,
`FirmSettings` ≡ `impl/635`, byte-for-byte. Final: **77 top-level namespaces, 0 duplicate keys**, and
`check-message-keys` resolves **4299** static `t("…")` keys.

**`apps/web/test/manifest.txt`** (1 merge). Sorted union: `lib/dashboard/*` (#660) sorts above
`lib/documents/batch-url-state.test.ts` (#636), so the union went theirs-first at that hunk. The file
was **not** whole-file re-sorted (#636's report records that a whole-file sort lifts other tickets'
inline attribution comments into the header). Final **479 entries**, sorted, no duplicates.

**`CONTEXT.md`** (2 merges). Both term groups kept every time, in the order the merges landed. **No
term collided** — 141 terms, 141 unique, every §3.1 ratified term present.

**`.github/actions/db-live-gates/action.yml`** (1 merge, 2 hunks). #656's and #658's legs both landed
on the same anchor and both relied on the shared env block below the conflict, so the union was a
**graft**: #656's leg keeps the shared block, #658's leg gets its own copy of the same four
`PGPORT / PGDATABASE / RELAY_TEST_MODE / WORKFLOW_POSTGRES_URL` lines. Final file: **7 steps, 501
lines, no dangling `\` continuation**, 22 registered `node tests/*-e2e.mjs` legs plus the world guard.
(#657 deliberately adds no step — its gate flag lives in `packages/db/package.json`.)

**`apps/web/e2e/e2e-fixture-ownership.test.ts`** (2 merges). `LANE_MOCKS` unioned in ASCII order
(`trade-invoice-mock.mjs` < `work-knowledge-mock.mjs`); `LANE_DECLARATIONS` unioned in place (that map
is lineage-grouped at base, not sorted — #636's report states the rule). The **one real collision**
was #659's and #660's `"home-board-mock.mjs"` row, which both sides rewrote whole: folded into ONE
entry carrying #659's `unscopeable: ["/rest/v1/rpc/get_firm_portfolio_pack"]` and the four-verb union
of the `debt` list (`get_client_financial_pack`, `get_client_work_pack`,
`propose_client_cash_accounts`, `publish_client_cash_account_set`), with both sides' reasons kept.
**32 lane mocks, 32 unique**; the census is 20/20.

**`apps/web/tests/firm-scope-db-pins.corpus.ts`** (2 merges). Barrier rows unioned at their sorted
positions. **Both unions left the appended row unterminated** (each entry's `},` + `],` tail is shared
with the entry below): the tree still merged, and `pnpm typecheck` caught it — see fix 1. Final **16
entries**, three of them this wave's (0226, 0227, 0232).

### `apps/web/e2e/serve-built.mjs` — dispatch order is SEMANTIC (DECISIONS §6.1)

One merge, two hunks. #656's opening lane and the #657 comment that annotates the home-board arm
landed on the same anchor; resolved **theirs-first** so the chain reads

```
… handlePrepaymentsSupabase                                   :751
    # 656's comment: ABOVE the home board, and that position IS load-bearing
    handleP656Supabase                                        :759
    # 657's comment: this arm answers list_bank_statements / list_bank_accounts
    #                UNCONDITIONALLY through EMPTY_RPCS
    handleHomeBoardSupabase                                   :770
```

Verified at the final head: `handleP657Supabase` **:730** < `handleWorkKnowledgeSupabase` **:692** …
all **above** `handleHomeBoardSupabase` **:777**, with `handleActivitySupabase` at **:624** above it
too (#659's `list_activity` finding). `home-board-mock.mjs`'s `EMPTY_RPCS` arm and its dispatch
position were **not** moved. The second hunk (#655's and #656's runtime routes) was a plain union —
both are scoped to their own lane's ids. **32 lane imports, 32 unique.**

### Owned files — the owner's version with the other side's one-liner grafted

**`apps/web/components/work/work-detail.tsx`** (1 merge, 5 hunks). #655's trade-invoice link block
and #636's batch row both add an import, a default prop, a prop type, a `useState` and a mount
effect. Four hunks unioned; the fifth could not be, because both sides' effect BODIES sat under one
shared `useEffect(() => { … void (async () => {` header — a union would have produced one effect with
two bodies and two returns. Grafted instead: #655's effect closes, then **#636's own complete
`useEffect`** follows, in the shape its branch wrote. The DECISIONS §3 sequence (#658 → #655 → #636)
holds on the page: #658's mount line sits in the Sources tab, #655's link block inside the existing
identity block, #636's one row below it.

**`apps/web/components/work/work-detail.test.tsx`** (2 merges, 8 hunks). Helper functions and cells
unioned; **hunks 3 and 6 grafted** — both sides rewrote the same `.filter(…)` exclusion chain, and a
union would have declared `get_work_claim_origin` twice. Folded into one chain carrying all three
exclusions (`get_work_claim_origin`, `get_trade_invoice`, `work_knowledge_drift`), each with its own
pinned count beside it. The `tradeInvoiceCalls` helper also lost its closing `}` to the shared-tail
effect and was closed by hand.

**`apps/web/e2e/home-board-mock.mjs`** and **`home-board-walk.spec.ts`** (1 merge each) — the two
files DECISIONS §6.2 rules **both #659 and #660 append to**. Both conflicts were the shared-tail
shape again: in the mock, #659's `get_firm_portfolio_pack` arm and #660's three money verbs both
ended just before the shared `return true; }`, so #659's arm was closed and #660's block grafted
after it, still **above** the `EMPTY_RPCS` array arm; in the spec, #659's whole portfolio section was
closed with its own `});` and #660's money-band section grafted after. Neither restructured the
dispatch; **#902's `debt` declaration is untouched.**

**READMEs** (`apps/web`, `packages/db`, `packages/db/tests`, `packages/runtime`): section unions, the
later ticket appended below the earlier — 10 merges' worth, no content lost from either side.

### `apps/web/package.json` + `pnpm-lock.yaml`

Only **#660** moved either (`recharts@3.8.0`; #657 installed nothing after its `ui:add` measurement,
#642 added no `@shadcn/react`). The lockfile auto-merged and was then regenerated **once**:
`pnpm install --lockfile-only` → **no change**, i.e. the merged lockfile is exactly what pnpm
resolves. Then `CI=true pnpm install --frozen-lockfile --prefer-offline` → **exit 0**;
`apps/web/node_modules/recharts` resolves at **3.8.0**.

### `frozen-workflows.json`

**Byte-identical to `origin/main` after all ten merges** — no branch touched it, so §2's "take
origin/main's file verbatim" was already satisfied. `node scripts/check-frozen-workflows.mjs --update`
(never under `CI=true`) re-baselined **296 frozen files** and produced **no diff**;
`--compare-base origin/main` reports **"296 existing entries retain the same hash and deployed flag;
0 additions; 3 recorded retirements"**. No successor is cut in this branch.

---

## 3 · Gates

### 3.1 · From-scratch chain 0001→0233 on a cluster that had never seen a clara migration

```
clara_int  (rigint,  55720)   pnpm db:migrate → 228 new migration(s) applied · 228 total, exit 0, 104 s
                              pnpm db:seed    → 2 seed file(s), exit 0
clara_rt   (rigrt,   55721)   pnpm db:migrate → 228 new migration(s) applied · 228 total, exit 0, 104 s
                              pnpm db:seed    → 2 seed file(s), exit 0
```

**228 = 219 (at `abcc5030`) + 9** — exactly the nine this wave numbered, 0225 … 0233, all present in
`clara.schema_migrations` on both clusters. Measured **before**: 0 `clara%` roles, 0 `clara` tables.
Measured **after**: 228 migrations, **18 `clara%` roles**, 2 firms. Every migration's own prestate
pins and tail assertions ran inside the chain and passed (the runner aborts on a raise); the printed
notices for 0228, 0229, 0230, 0231, 0232 and 0233 are quoted in full in the run log. **No migration
file was edited, weakened or re-pinned at any point during integration.**

This closes the largest open question the lane reports carried: **#651's 0227 had never applied end
to end from a clean 0224 on any cluster** (`651-final.md` §5, adversarial ADV-651-3 accepted in full —
its rig's catalog was hand-assembled and its ledger checksum repaired three times). It applies, twice,
from 0001, on two clusters. **#657's 0226, edited in place after its rig had already applied it**
(`657-fixround-1.md`, checksum `55b6e279…`), likewise.

### 3.2 · typecheck, lint, freeze

| gate | exit | evidence |
|---|---|---|
| `pnpm typecheck` | **0** | `apps/web` Done, `packages/runtime` Done (re-run at the final head) |
| `pnpm lint` | **0** | freeze-lint + the sibling checkers + eslint in all four workspaces; `check-test-manifest` PASS, `check-message-keys` **4299** keys resolve, `check-ui-add-guard.selftest` all cases pass |
| `node scripts/check-frozen-workflows.mjs` | **0** | **296** frozen files append-only vs `origin/main`; **53** `"use workflow"` modules all frozen+registered; 3 retired entries |
| `node scripts/check-frozen-workflows.mjs --compare-base origin/main` | **0** | 296 unchanged, **0 additions** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **0** | reader ⊇ emittable; emittable = 6 kinds (`freeform_result`, `work_accepted`, `work_status`, `work_result`, `work_question`, `knowledge_receipt`), allowlist = 3, full census printed. **No new part kind this wave** — #658's finding that none of the 29 fits stands, and `knowledge_unavailable` is the integrator's call at the v21 cut, not made here |
| `pnpm --filter @clara/runtime build` | **0** | nitro, `.output/server/index.mjs` **10.4 MB**, 53 workflows |

### 3.3 · db estate suite — `rigint` 55720 / `clara_int`, chain 0001…0233, the exact **49** gate flags from `packages/db/package.json`, **no reset flags**

`node --test --test-concurrency=1 $GATES "tests/**/*.test.mjs"` (410 test files):
**5148 tests · 5048 pass · 5 fail · 95 skip · 1173 s · exit 1.**

**Zero frontier skips.** The 95 skips are 42 destructive upgrade-drill cells (`CLARA_RIG_ALLOW_RESET`
deliberately never set), ~30 "subject retired with F-A2 PR-3" cells, 8 "0037/0038/0040 bank substrate
absent" cells and 2 named structural ones. **No cell anywhere skipped for a missing migration**, which
is what makes every wave battery below evidence rather than absence.

The nine new batteries, each re-run on its own at the final head with the full gate chain:

| battery | ticket / migration | pass / fail / skip |
|---|---|---|
| `trade-invoice` | #655 · 0225 | **29 / 0 / 0** |
| `bank-line-existing-booking` | #657 · 0226 | **11 / 0 / 0** |
| `depreciation-history` | #651 · 0227 | **19 / 0 / 0** |
| `opening-ledger-source` | #656 · 0228 | **12 / 0 / 0** |
| `intake-batch` | #636 · 0229 | **31 / 0 / 0** |
| `knowledge-retrieval` | #658 · 0230 | **28 / 0 / 0** |
| `firm-portfolio-pack` | #659 · 0231 | **17 / 0 / 0** |
| `compliance-watch-disposition` | #659 · 0231 | **6 / 0 / 0** |
| `client-financial-pack` | #660 · 0232 | **35 / 0 / 0** |
| `firm-commercial-settings` | #635 · 0233 | **24 / 0 / 0** |

and the two the order names by hand:

| battery | pass / fail / skip |
|---|---|
| `operation-census` | **10 / 0 / 0** |
| `rig-isolation` | **20 / 0 / 1** — the one skip is **T19**, the destructive poison-role cell, by design. **T10b is GREEN** (#866 did not fire: no Workflow World was ever bootstrapped on `clara_int`, which is the whole reason the World legs were given their own cluster) |

**The five failures are in §5 — none is a merge defect and none was papered over.**

### 3.4 · runtime — `rigrt` 55721 / `clara_rt`

`node --test --test-force-exit "tests/**/*.test.mjs"` from `packages/runtime`:
**2731 tests · 2688 pass · 7 fail · 36 skip · 32.9 s.**

(A first pass read 13 failures; five of them were `wave-b-interview-plan-db` / `F2 (DB)` cells failing
their `seed owner has exactly one active owner membership` hook because **`clara_rt` had been migrated
but not seeded**. Seeded — `2 seed file(s), exit 0` — and re-run. That was my omission, not a defect,
and it is named here so the number of record is the second one.)

Each of the seven was then re-run **alone** on the same database:

| failure | file | alone | verdict |
|---|---|---|---|
| `scanner rejects EICAR, encrypted PDF, XML entity expansion` | intake scanner | — | **#693**, RIG.md's named Windows/Defender red. Not fixed |
| `(#806) this host's OWN probe: pg_dump/psql are on PATH here` | pg-tools fixture | — | **no `pg_dump` on PATH**, RIG.md's named environment gap. Not fixed |
| `ready MAJOR-1: a BLACK-HOLED lane leaves /ready far inside fly's 5 s timeout` | `ready.test.mjs` | **24 / 24** | whole-suite contention artifact (the 2026-09-15 wave recorded the same cell) |
| `a probe failure inside a DAILY belt skips that belt ONLY` | `reconcile-belt-isolation-unit.test.mjs` | **21 / 1 — still red** | **REAL. #636 lane defect, §5.2** |
| `(a) kill-mid-stream: repeated SIGKILL mid-batch` | `relay-runner.test.mjs` | **4 / 4** | whole-suite artifact |
| `M1 skip-locked variant … CLR10 invalid (taxonomy_version, event_type, decision) triple` | `wake-engine.test.mjs` | **32 / 32** | whole-suite artifact |
| `a real per-client transition (a wiki-synthesis hold) …` | `wave-b-lint-belt.test.mjs` | **4 / 4** | whole-suite artifact |

### 3.5 · World e2e — every leg `.github/actions/db-live-gates/action.yml` registers, plus the two-build cutover and the world guard

**Run on a third fresh cluster, `rigint3` 55722, and the reason is worth stating.** Every leg in this
battery is hard-gated to `PGDATABASE ∈ {clara_rt_test, clara_intake_ci, clara_wave_b_ci, clara_<ddd>}`,
so `clara_rt` could not host them by name. More importantly, by the time the runtime unit suite had
finished, `clara_rt` carried 76 non-terminal `accounting_work` tasks and 323 same-day
`document_intakes`, and a template copy of it inherited both: the two-build drill **correctly refused
to start** ("this database already carries live state a two-build drill cannot tell from its own"),
`intake-admission-e2e` was refused at `bytes` by the firm's UTC-day document ceiling (113 intakes
against a 100-file limit), and `intake-batch-e2e` never converged. 0154 forbids a second from-scratch
chain on one cluster, so the honest fix was a third cluster, exactly as the 2026-09-15 wave built
`rigint2` for the same reason. `rigint3` was built with `mkrig.sh`, `clara_intake_ci` was migrated
(228), seeded (2) and world-bootstrapped, and `clara_wave_b_ci` + `clara_rt_test` were cut from it as
**template copies at the pristine moment** — which is the CI action's own idiom, spelled out in its
`create database clara_rt_test template clara_wave_b_ci` comment.

| # | leg | db | result |
|---|---|---|---|
| 1 | `intake-e2e` | `clara_intake_ci` | **PASS** (5 s) |
| 2 | `intake-admission-e2e` (#633) | `clara_intake_ci` | **PASS** (12 s) |
| 3 | `intake-batch-e2e` (**#636, new**) | `clara_intake_ci` | **PASS** (158 s) |
| 4 | `interview-e2e` | `clara_wave_b_ci` | **PASS** (94 s) |
| 5 | `interview-kill-resume-e2e` | `clara_wave_b_ci` | **PASS** (47 s) |
| 6 | `version-cutover-e2e` | `clara_wave_b_ci` | **PASS** (9 s) |
| 7 | `work-journal-e2e` (#623) | `clara_wave_b_ci` | **PASS** (33 s) |
| 8 | `work-question-e2e` (#629) | `clara_wave_b_ci` | **PASS** (47 s) |
| 9 | `work-cancel-e2e` (#630) | `clara_wave_b_ci` | **PASS** (30 s) |
| 10 | `periodic-adjustment-e2e` (#643) | `clara_wave_b_ci` | **PASS** (23 s) |
| 11 | `fixed-asset-acquisition-e2e` (#639) | `clara_wave_b_ci` | **PASS** (17 s) |
| 12 | `staff-expense-claim-e2e` (#638) | `clara_wave_b_ci` | **PASS** (25 s) |
| 13 | `trade-invoice-e2e` (**#655, new**) | `clara_wave_b_ci` | **PASS** (14 s) |
| 14 | `work-egress-e2e` (#631) | `clara_wave_b_ci` | **PASS** (10 s) |
| 15 | `chat-turn-v19-e2e` | `clara_wave_b_ci` | **PASS** (7 s) |
| 16 | `chat-turn-v20-e2e` | `clara_wave_b_ci` | **PASS** (17 s) |
| 17 | `plan-occurrence-e2e` (#640) | `clara_wave_b_ci` | **PASS** (17 s) |
| 18 | `accrual-e2e` (#652) | `clara_wave_b_ci` | **PASS** (19 s) |
| 19 | `prepayment-occurrence-e2e` (#653) | `clara_wave_b_ci` | **PASS** (6 s) |
| 20 | `opening-ledger-source-e2e` (**#656, new**) | `clara_wave_b_ci` | **PASS** — producer → persist → cite → approve, `trial_balance_as_of` answers cent for cent |
| 21 | `work-knowledge-e2e` (**#658, new**) | `clara_wave_b_ci` | **PASS** — one read-set row survived a SIGKILL and replayed onto its own id, seq 2 is a second read, a non-`accounting_work` task is CLR11 |
| 22 | `two-build-cutover-e2e` (#637) | `clara_rt_test` | **PASS** — `TWO-BUILD CUTOVER E2E: ALL PASS` |
| 23 | `body-census-guard-db.test.mjs` (world guard, LAST) | `clara_rt_test` | **PASS — 4 / 4** |

**All 23 green.** The cutover leg's own printout pins the merged tree: build B serves
`frontier=0233_firm_commercial_settings(228) bodies=53 pins … chatTurn=chatTurn_v20
claraWork=claraWork_v4`, and the drill still proves rollback refusal, scoped-vs-global verdicts,
resume across images and the frontier rule on this chain. `claraWork_v4`'s bundle digest is
`81e1ffcd5526…` — unchanged, which is the "no successor cut here" claim measured rather than asserted.

**Not run: the two DR legs at the bottom of `action.yml`** (`pnpm --filter @clara/db dr:selftest` and
the full-profile two-cluster backup → restore → verify). They are a backup/restore battery, not a
World e2e — the file itself lists them under their own names — and the full-profile leg needs three
further clusters with their own `postgres_b/_c/_d` roles. Residual for whoever owns the DR gate;
the same leg was left for the same reason in 2026-09-15.

### 3.6 · web

**Unit suite** — `node scripts/run-tests.mjs` from `apps/web`:
**4628 tests · 4626 pass · 0 fail · 2 skip · 73.3 s · exit 0.** The two skips are the env-gated
`live-provider-auth` cells. The known `use-clara-thread-stop` flake (DECISIONS §6.2.2 NF-2) **did not
fire** on this run.

**Browser suite** — `pnpm --filter @clara/web e2e`, one run, triple
`https://127.0.0.1:3400 / 3401 / 3402`, 48 spec files including all six new walks
(`bank-match`, `depreciation`, `firm-commercial`, `intake-batch`, `opening-ledger-source`,
`trade-invoice`, plus the extended `home-board` and `knowledge` walks):
**545 passed · 3 failed · 7 skipped · 15.7 min.** The three were then each taken on its own:

| failed walk | alone | verdict |
|---|---|---|
| `journal-work-walk.spec.ts:836` (#727 console census) | **20 / 20 after fix 2 + fix 3** | **merge defect, fixed** — §4 |
| `documents-viewer-walk.spec.ts:149` (polygon layer after a width change) | **22 / 22** | whole-suite flake, named, not fixed |
| `fixed-asset-acquisition-walk.spec.ts:273` (#639 keyboard + axe under reduced motion) | **7 / 1 — still red** | **REAL. #651 lane defect, §5.3** |

---

## 4 · The integration fixes — three commits, each red first

**1 · `26babaac` — `fix(integration): close the 0226 and 0227 rows in firm-scope-db-pins.corpus.ts`.**
The #657 and #651 merges each appended a corpus entry whose closing `},` + `],` lines were shared with
the entry below, so both unions left their row unterminated. **Red first:** `pnpm typecheck` —
`apps/web tests/firm-scope-db-pins.corpus.ts(185,3): error TS1109: Expression expected` plus three
more. Both rows now close like every sibling; the file carries 16 entries, three of them this wave's.
Typecheck green after.

**2 · `2c73431e` — `fix(integration,web): the journal-work walk's Work detail answers the three mount
reads this wave added`.** The only conflict class where every lane was individually right and the
merged tree was wrong. #655, #636 and #658 each added a **mount-effect read** to `work-detail.tsx`
(`clara.get_trade_invoice`, `clara.intake_batch_members`, `clara.work_knowledge_drift`) and each
taught only its OWN e2e lane's mock — exactly what #638 had to do for `get_work_claim_origin` one wave
earlier. `journal-work-walk.spec.ts:836` (#727) refuses **any** read the mock server turns away, so on
the merged tree the Work detail route 404s three times per mount. **Red first:** the whole-suite run
named `404 …/rpc/get_trade_invoice`, `404 …/intake_batch_members`, `404 …/rpc/work_knowledge_drift`.
Three arms added to `journal-work-mock.mjs` in #638's exact shape — gated on this lane's own two Work
ids, answered with each door's own honest-empty value (SQL `NULL`; `[]`; and **0230:845-848's
no-observation envelope verbatim**, so `drifted` is `null` rather than a fabricated `false` and the
banner says nothing at all), falling through on any foreign id. The two rpc verbs are declared in
`SHARED_RPC_VERBS` beside their owning lanes; `intake_batch_members` is a relation read the census
cannot see, so its gate is stated at the arm. `e2e-fixture-ownership` **20 / 20**.

**3 · `2f60ff29` — `fix(integration,web): the intake_batch_members arm belongs in the relation
handler, not the rpc one`.** Fix 2 put all three arms in `handleJournalWorkRpc`, which `serve-built`
only reaches for `/rest/v1/rpc/…`. **Red first:** the re-run was 19 passed / 1 failed with the received
list down to two `404 …/intake_batch_members` lines — the two rpc reads answered, the relation read
still refused. The arm now sits beside `handleJournalWorkSupabase`'s own `operation_receipts` GET arm.
**`journal-work-walk` 20 / 20.**

---

## 5 · Lane defects found at integration — recorded, NOT papered over

### 5.1 · #655 — 0225 adds an UNPINNED trigger to `clara.journal_entries`

`packages/db/tests/f-a2-tier-d.test.mjs:47` cell **`f-a2.c5.census`**, "the pg_trigger replay matches
§D.1's table EXACTLY, in BOTH directions":

```
c5.census: no UNPINNED trigger sits on clara.journal_entries.
Extra: t_je_open_item_birth — an unpinned constraint trigger has no tier,
which means nobody decided whether it aborts or converts
  actual:   [ 't_je_open_item_birth' ]
  expected: []
```

0225 installs `t_je_open_item_birth` (the lane-agnostic deferred open-item birth trigger,
`0225_trade_invoices.sql:248`). `f-a2-tier-d.test.mjs` is **byte-unchanged** on the integration branch
**and on `impl/655-invoice-bill`** — #655's branch never touched it, so this is not a merge artifact.
The census demands a **tier** for every trigger on that relation (does it abort, or does it convert?),
and nobody has decided which `t_je_open_item_birth` is. **Not fixed here**: choosing the tier is a
ruling about what a failed open-item birth does to a posting, not a merge repair.

### 5.2 · #636 — the new reconciler belt does not contain its own probe failure

`packages/runtime/tests/reconcile-belt-isolation-unit.test.mjs:343`, "a probe failure inside a DAILY
belt skips that belt ONLY — the sweep behind it completes":

```
both contained THEMSELVES — nothing escaped to the assembly wrapper
  actual:   [ 'intake batch cancellations' ]
  expected: []
```

`lib/reconciler.mjs`'s new `belt("intake batch cancellations", …)` arm (0229) lets its
`to_regprocedure` feature-probe throw into the assembly wrapper, so `beltErrors` names it; the FA and
ADJ belts beside it swallow the same injected failure and report `faOk:false` / `adjOk:false` instead.
The test file and `src/reconcile.ts` are unchanged this wave; `lib/reconciler.mjs` is not.
**Measured at the base:** the same file on the `clara-rebuild` checkout at `abcc5030` is **22 / 22**;
on this branch it is **21 / 1**, in isolation as well as in the whole suite. Whether #636's belt should
contain the error or the cell's law should widen is #636's call, not mine.

### 5.3 · #651 — a new tab inserted into #639's asset-detail strip breaks #639's keyboard walk

`apps/web/e2e/fixed-asset-acquisition-walk.spec.ts:296`:

```
expect(getByRole('tab', { name: 'Schedule' })).toBeFocused()
  → resolved 14× to the tab, "unexpected value inactive"
```

#651 (`10187fe3`, `907d6e4c`) added a **"Policy & effective revisions"** tab between *Particulars &
policy* and *Schedule*: its own `fa-detail-tab-url.test.tsx:115` pins the new five-label order, and
the string does not exist in `fixed-asset-detail.tsx` on `origin/main`. #639's cell walks
*Particulars & policy* → ArrowRight → *Schedule* → End → *History*, and ArrowRight now lands on the
new tab. `fixed-asset-acquisition-walk.spec.ts` is **unchanged** on this branch. Reproducible alone
(**7 passed / 1 failed**). **Not fixed here**: re-pointing another ticket's accessibility walk is a
decision about which tab order #639's cell is meant to assert.

### 5.4 · Wave-level census ratchets — four cells, thirteen new names, six lanes

Four forward-ratchet cells hold a CLOSED roster of every `clara` object that touches a clock or
duplicates the house-calendar derivation, and this wave's nine migrations add thirteen names none of
them knows. Nothing was removed from any roster — every diff is **additions only**:

| cell | file | what it pins |
|---|---|---|
| `x42.r7.s5.census.4b` | `x42b2-r7-s5-census.test.mjs:123` | S5.25 **(B)** duplication roster + (B2) authority-clock pin |
| `x42.s5c.5` | `x42b2-s5c-clock.test.mjs:230` | "no clara object derives a date from the session clock", same roster |
| `x42.r7.s5c.5` | `x42b2-r7-s5-clock.test.mjs:140` | arm **(D)**'s bare-token detector + roster |
| `x42.s5c.6` | `x42b2-s5c-clock.test.mjs:369` | arm (D)'s roster, re-derived independently of the migration |

The (B) roster gains **7**: `get_client_financial_pack`, `get_firm_portfolio_pack`, `get_intake_batch`,
`propose_client_cash_accounts`, `publish_client_cash_account_set`, `record_work_knowledge_read`,
`retrieve_knowledge`. Arm (D) gains **13** — those seven plus `cancel_intake_batch`,
`set_intake_batch_member_dependency`, `sweep_intake_batch_cancellations`,
`list_work_knowledge_reads_for_record`, `_tf_intake_batch_member_intake_stamp` and
`_tf_intake_batch_member_work_stamp`.

**Deliberately not fixed here.** The 2026-09-15 integrator taught these same rosters twenty-two names
(its §6 fix 5), and did it by running each arm's own detector over the live catalog and arguing, name
by name, whether the clock each object reads is a **money** date or a display/sampling one — two of
that wave's three CLASS-2 names were escalated rather than settled. That is a measurement pass and a
ruling, not a merge repair, and it belongs to the orchestrator's review before §4. The four cells are
the only db-suite reds besides §5.1, and none of them is vacuous: each one caught exactly what it
exists to catch.

---

## 6 · Reds left standing at `2f60ff29`, in full

| # | red | class | fixed? |
|---|---|---|---|
| 1 | `f-a2.c5.census` — `t_je_open_item_birth` unpinned (§5.1) | **#655 lane defect** | no — needs a tier ruling |
| 2 | `reconcile-belt-isolation-unit` cell 13 (§5.2) | **#636 lane defect** | no — green at `abcc5030`, red here |
| 3 | `fixed-asset-acquisition-walk.spec.ts:273` (§5.3) | **#651 lane defect** | no — cross-lane walk breakage |
| 4–7 | the four S5.25 clock/duplication rosters (§5.4) | **wave-level census ratchet** | no — a measurement pass, orchestrator's call |
| 8 | intake scanner EICAR | **#693**, RIG.md's named Windows red | no, by instruction |
| 9 | `(#806)` pg_dump/psql PATH probe | **no `pg_dump` on Windows**, RIG.md's named gap | no, by instruction |
| 10 | `ready MAJOR-1` BLACK-HOLED lane | whole-suite contention flake — **24 / 24 alone** | no, named |
| 11 | `relay-runner` kill-mid-stream | whole-suite flake — **4 / 4 alone** | no, named |
| 12 | `wake-engine` M1 skip-locked | whole-suite flake — **32 / 32 alone** | no, named |
| 13 | `wave-b-lint-belt` per-client transition | whole-suite flake — **4 / 4 alone** | no, named |
| 14 | `documents-viewer-walk.spec.ts:149` polygon layer | whole-suite flake — **22 / 22 alone** | no, named |

`#707` (x56-rest-c shelling out to grep) and the `use-clara-thread-stop` flake did not fire on these
runs. **#866's T10b did not fire either**, because the World legs never touched `clara_int`.

---

## 7 · What was NOT done here, and what the next step needs

1. **The successor cut is not in this branch.** `chatTurn_v21` and `claraWork_v5` are uncut,
   `registry.ts` is untouched, `frozen-workflows.json` is unchanged at 296 files, and
   `check-workflow-bundle` still reports `chatTurn` pinned at **v20** / `claraWork` at **v4**.
   DECISIONS §1.2's warning applies verbatim: the cut worker reads **each report's own successor
   stanza**, not §1.1's summary — in particular #658's, which states (fix round 1, A1/F1/S1) that
   `clara.retrieve_knowledge` is **atomic** and the `knowledge_read_failed` terminal must fire on ANY
   `{status:'unavailable'}` answer, never on a per-tier signal the door has never emitted.
2. **No `pnpm build` of the web half** — `apps/web/.env.local` is `.gitignore`d and absent from this
   worktree, and `scripts/check-public-key.mjs` refuses the build without it (the same wall
   2026-09-15 §4 recorded). Nothing in this wave changes that; CI supplies its own.
3. **Nothing pushed, no PR.** §4 and §5 of the order are untouched, as instructed.
4. **Rigs left up** for the orchestrator: `rigint` (55720, `clara_int` at the merged chain + seed),
   `rigrt` (55721, `clara_rt` + `clara_rt_test`) and **`rigint3` (55722)** with `clara_intake_ci`,
   `clara_wave_b_ci` and `clara_rt_test`. `rigint3` is new; it is not any ticket's assigned rig and is
   safe to drop. **No impl worktree, branch, cluster or port was touched at any point.**
5. **Rig hygiene performed, stated so it is never mistaken for evidence:** on the throwaway
   `clara_rt`/`clara_rt_test` pair (rigrt) I cancelled 76 non-terminal `accounting_work` agent tasks
   left by the runtime unit suite, and on `rigint3`'s `clara_intake_ci` I back-dated 323
   `document_intakes` by three days to restore a fresh UTC day. Both are the remedies the tools
   themselves name ("Use a fresh database, or settle/cancel those rows first"). **Neither touched
   `clara_int`**, and no gate number in §3 was taken on a database I had edited except the World legs,
   whose own databases are throwaways in every environment including CI.

**Follow-ups the merge itself surfaced** (beyond the lane defects in §5):

6. **Three lanes added a Work-detail mount read and none taught the sibling walks.** Fix 2 repairs the
   one walk that has a census strict enough to notice. A lane that adds a read to a SHARED page owes an
   arm to every mock that serves that page — worth a rule in the next wave's WORK-ORDER rather than a
   fourth rediscovery.
7. **`intake-batch-e2e` cannot share a database with the intake legs on a slow host.** On a DB whose
   UTC-day quota is already spent, four of its hundred intakes expire their capability before
   `finalize_document_intake` reaches them, the workflow retries CLR16 forever and the leg never
   converges; on its own pristine database it passes in 158 s. #636's own follow-up 5 predicted exactly
   this about the CI step order. A drain, a separate database for the third intake leg, or a bounded
   terminal for an expired capability would all close it.
8. **`docs/plan/active/refresh-wave-2026-09-18/` is now committed to the branch** (`02d74503`), so the
   wave's own plan, gap maps, briefs, decisions and lane reports travel with the PR.

**Unverified:** everything hosted (no hosted deploy, no hosted read, nowhere in this wave); the DR
battery (§3.5); and whether the four S5.25 names classed as "money dates" by the 2026-09-15 escalation
are still the right two — that question is inherited, not answered here.
