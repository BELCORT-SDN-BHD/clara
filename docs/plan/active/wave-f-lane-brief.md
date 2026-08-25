# Wave F sprint — common lane brief (read FIRST, every lane, every time you resume)

Repo: `C:/Users/zhant/Desktop/clara-rebuild` → GitHub `BELCORT-SDN-BHD/clara`. Windows host; use the Bash tool with
forward-slash paths. The repo hooks BLOCK file writes from Bash (`>`, `>>`, `cp`, `sed -i`, heredoc) — use the
Write/Edit tools for every file edit. You work ONLY inside your own git worktree (you were spawned with one) — never
touch `C:/Users/zhant/Desktop/clara-rebuild` itself, never `.claude/worktrees/*` of another lane, never `git stash`,
never `wsl --shutdown`.

## Ground before you author (the first hour of every DB lane)
1. `AGENTS.md` (15 hard constraints — constraint 2 DB-owns-numbers, 4 no credentials, 9 frozen workflow bodies,
   10 rig-validated migrations, 11 pinned ids never written), `docs/adr/README.md` §9-§12 (laws 68-82; 78-82
   ratified 2026-08-22/23), `docs/adr/0074-the-track-a-sitting.md` + `0075-test-data-authority-widened.md`,
   `PROGRESS.md` (state authority), `docs/product/PRD.md` §6 (LAW), your item's design set (survey · design ·
   annexes · gate record — the v2 files named in your order), `packages/db/README.md` (the rig, PG* vars).
2. **Rig replay before authoring:** every live body you will CoR or depend on is re-derived by `pg_get_functiondef`
   / `pg_get_constraintdef` on a fresh rig at the frontier (`pnpm db:migrate` + `pnpm db:seed` on YOUR throwaway
   Postgres), never from migration text (bodies are spliced across generations; the text in any one file is not
   the live body). Record the prosrc sha256 you pin. Report the replay result as a settle-event BEFORE authoring.
3. Query the codebase graph (`codebase-memory-mcp` via ToolSearch: `search_graph` / `query_graph`) before grep.

## Your rig
- One throwaway Postgres 17 per lane in WSL docker, YOUR name and YOUR port only (given in your order):
  `docker run -d --name <name> -p 127.0.0.1:<port>:5432 -e POSTGRES_PASSWORD=rig postgres:17`.
  Prove it is virgin before use (no `clara` schema). Export `PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres
  PGPASSWORD=rig PGDATABASE=postgres` — rigs use PG* vars, NEVER `DATABASE_URL`. Destroy it when you settle.
- Host memory is shared by ~10 lanes + 4 CI runners: keep ONE rig, run your item's battery during authoring, run
  the FULL estate (`pnpm --filter @clara/db test`, then runtime/dashboard/render suites per `packages/*/README.md`)
  ONCE at the end on a pristine rig, tails unfiltered. Report pass/skip/fail per package; name every skip.

## Authoring laws (each cost real money to learn)
- Migrations: `packages/db/migrations/UNNUMBERED_<item>_<slug>.sql` — numbers are claimed at MERGE by the conductor;
  never name a number; never edit `0001-0102`. Battery gating keys on the file STEM, never a number. **Stems are
  underscore-only** (`0001`-`0102` all are; the runner's regex allows hyphens but the estate does not use them).
- **MEASURED (conductor, 2026-08-23): `pnpm db:migrate` silently SKIPS any file not starting with a digit** —
  `loadMigrationFiles` in `packages/db/scripts/migrate.mjs` (`MIGRATION_LIKE = /^\d+.*\.sql$/`). A green
  `pnpm db:migrate` has NOT applied your `UNNUMBERED_*` file. For every rig run: COPY your file to the next free
  number(s) in your working tree (e.g. `0103_<stem>.sql`, in the order the train will claim), run the migrate
  runner so the deploy-onto-existing path and the tail self-proofs actually execute, then DELETE the numbered
  copies before committing — the numbered copy is NEVER committed (the conductor claims the real number at merge).
  State in your settle report that the migration ran through the runner, with the number you used on the rig.
  **PREFERRED (L01's method, stricter): stage the numbered copies in a scratch directory OUTSIDE the repo and run the
  runner with `CLARA_MIGRATIONS_DIR=<that dir>` — then a numbered copy can never leak into a commit.**
  **CORRECTED RULE (conductor, measured at migrate.mjs:331-345 + rig-helpers.mjs:286):** copy `UNNUMBERED_<stem>.sql` →
  `0103_<stem>.sql` and KEEP IT ON DISK FOR THE WHOLE RIG SESSION. Once the copy has a `clara.schema_migrations` row, every
  later `migrate()` on that database (including `ensureReady()` inside `pnpm --filter @clara/db test`) ABORTS with a
  history-integrity error if the file is missing — it presents as "everything red before any assertion". Editing the
  applied file is checksum DRIFT, not a re-apply: the authoring loop is edit → `pnpm db:reset` → migrate → seed →
  battery, never edit-and-re-run. Delete the copy as the LAST act before `git add` (restore it first if anything must
  re-run); `git status` must show no `0103_*` before you commit. The scratch-dir method avoids all of this.
- A migration that replaces a live writer's body: prosrc-SHA prestate pin at the frontier → DROP+CREATE in place →
  tail self-proof that raises on failure. List every such body in the file's §0 quiesce inventory.
- Walls are behavioural: the proof of a wall is a cell that makes the wall REFUSE; never a substring match on
  source text (law: spelling is not identity). Absence is not evidence (a read that cannot say NO has a meaningless
  YES). A forced cell asserts its precondition or exits via `skipHere`/`t.skip` (named, counted) — NEVER
  `noteLane`+return/continue, never `.catch(()=>…)` swallowing a premise, never `?? wire.x` hiding a durable read,
  never an OR between two walls. Fixtures THROW on construction failure. Differential cells over self-referential.
- **Relaxing a `firm_id` NOT NULL silently HIDES the NULL rows from every human** — 144 clara policies use
  `USING (firm_id = clara.jwt_firm())`, which evaluates NULL (not TRUE) on a NULL firm_id in both directions. Any lane
  that makes `firm_id` nullable recuts the read policy in the SAME migration (e.g. `OR firm_id IS NULL` / a scope-aware
  predicate) and proves visibility with a POSITIVE cell (a platform row IS returned to a bookkeeper of another firm).
  Never infer "platform" from a NULL — that fails OPEN; use an explicit `scope in ('firm','platform')` column with the
  CHECK `(scope='firm') = (firm_id is not null)` (the receipts contract shape, R-L26).
- **A plain `create view` owned by `clara_fn_owner` over an RLS+FORCE table LEAKS cross-tenant** (measured by L19: the
  view runs as its owner, whose policy is USING(true); FORCE does not help). Every view over a firm-scoped table is
  `with (security_invoker = true)` OR carries the firm predicate explicitly in its body, and ships a leak cell: read the
  view as a bookkeeper of firm B and assert zero rows of firm A. NUANCE (measured by L19): `security_invoker` on an
  INNER view that sits under an owner-run outer view BREAKS the outer (the human's identity propagates to the inner's
  base table, where the human holds no grant → 42501). So nested shapes (the receipt shims under `agent_receipts_visible`)
  keep the inner views DEFAULT and UNGRANTED, the outer carries the predicate, and an ACL CENSUS cell (zero non-owner
  grantees on every inner view, with an adversarial twin that grants one and proves the census fails) is THE wall — not
  defence-in-depth.
- **Evaluator freeze bites at MERGE, not at the deploy flip** (`verify_evaluator_freeze` iterates with no `where
  deployed`, hashing the full `pg_get_functiondef`). When F-A5/PR-1 merges, `clara._hash` (defined 0004:32, called in 55
  migrations) becomes a frozen closure member: no lane may change its ACL/owner/search_path without a new evaluator
  version — the raise lands at YOUR apply. Keep closures single-member where you can. HALF-FREEZE: the review-time lint
  (`check-frozen-evaluators.mjs`) sees only `clara.evaluate_*` names — an underscore-named member is catalog-frozen but
  source-unfrozen; name new members `clara.evaluate_*` unless you state why not.
- Three-valued evaluation where the design says so (pass / fail / not_evaluable); fail-closed on the missing,
  the malformed and the unknown; a rung's own evaluation may never raise out of the ladder.
- Shared surfaces (extend-only, merge-ordered): `wake_credentials` CHECK pairs (re-read live text with
  `pg_get_constraintdef`; prestate probe aborts loudly if the predecessor's value is absent), `mint_wake_credential`,
  chatTurn `_vN` (number at merge; never trust a number in a design), `registry.ts`, `pools.mjs`, egress purpose
  CHECKs, `llm_usage_events`, `_approve_entry_core` generations, `wake_fn_allowlist`, `agent_tasks` triggers,
  `finalize_close`. BEFORE you author against one, SendMessage the lane named `conductor` (summary: "surface:
  <name>") with what you will change; it keeps the shared-surface ledger and will tell you the merge order.
- Workflow bodies (`packages/runtime/workflows/*.vN.*`) are IMMUTABLE once deployed: ship a new `_vN` export and
  repoint the registry; freeze-lint enforces it. After ANY workflow-file edit, `pnpm build` and grep the built
  bundle for the directive registrations (the WDK silently swallows a `"use workflow"` it cannot place).
- Never commit a credential; DSNs from env only; the pinned ids `daba7f2e` / `d023b48c` are never written.
- Test data is free (ADR-0075): any client's data may be reseeded/reset on rigs; the MECHANISMS (RLS, walls,
  receipts, roles) are the product under test and never move for convenience.
- Official docs first: Context7 (`mcp__plugin_context7_context7__*` via ToolSearch) for AI SDK / WDK / Next /
  Postgres / Supabase; LHDN / RMCD / SSM / MIA official pages for Malaysian law. No stale memory of an API.

## Git and reporting
- Branch name given in your order; base as given (some bases are UNMERGED stacked branches — that is intended; you
  will be told when to rebase). Commit per coherent step with a clear message ending in
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01LsXm2Yg7CmW8fijrbULvxR`. Push your branch. Do NOT open a PR
  unless your order says so; NEVER merge.
- `pnpm lint` / `pnpm typecheck` / `pnpm build` green before you settle. A fresh worktree has NO `node_modules`, so
  `pnpm lint` fails on eslint alone while the 44 dependency-free gates pass — run `pnpm install` ONCE in your worktree
  first (≈1 min; node_modules is gitignored), then lint is real.
- Report ONLY settle-events, ONLY via `SendMessage` to `main` (plain assistant text is invisible): (1) rig replay
  done (what you pinned, any divergence from the design's cites), (2) a blocker you cannot resolve (with the
  measured error — never a guess), (3) DONE: branch + HEAD, files, the battery totals per package, every skip
  named, the D1 body inventory, what you could not build and why. Keep each report under 60 lines.
- Models/effort are pinned by the orchestrator; never spawn sub-agents without an explicit `model`.

## Rules minted on the 2026-08-24 train night (each cost real time; binding)
- **An idle lane is NEVER woken by background-task completion — only SendMessage wakes you.**
  Run long suites foreground with a generous timeout, or actively poll the output in-turn; do
  not end your turn while a run you must report on is in flight. (Re-bitten twice this night.)
- **`revoke all on <table|view> from public` is FORBIDDEN** — relations carry no default PUBLIC
  privileges; the no-op materializes the acl and reds the DR ACL round-trip (dr-verify 4.6).
  Functions-only (they default to PUBLIC EXECUTE).
- **Live-gates e2es bind OS-assigned ports** (`packages/runtime/tests/ephemeral-port.mjs`);
  never a fixed default (the shared-runner-host 401 cross-wire class).
- **Fixture labels must not look like secrets**: gitleaks scans EVERY ref, so one entropy-shaped
  `key='…'` constant on ANY branch reds every PR's lint. Adjudicate-then-allowlist by CAPTURED
  VALUE, never fingerprint (squash rewrites shas).
- **Merge state is read from main's migration ledger** (`ls packages/db/migrations/` /
  `schema_migrations`), never from the branch list — squash-merges leave branch history
  un-contained forever.
- **Squash-artifact conflicts**: classify each conflicted file against YOUR branch's own
  merge-base; a file you never touched resolves to main's copy wholesale.
- **Gate your chains**: `grep -c` exits 1 at zero — use `! grep -q` for marker gates; never
  chain `rebase --continue`/push behind an unverified check.
- **Docker hygiene is a settle obligation**: prune your rig container AND volume when your
  stage finishes (the 2026-08-24 disk-zero event was 369 orphaned volumes / 100.8 GB).

## Rules minted on the 2026-08-25 W2/W3 close

- **① A migration minting a NEW CLUSTER ROLE joins `packages/db/deploy/roles-bootstrap.sql`
  SAME-COMMIT.** `pg_dump` carries no roles — a DR restore replays the migration's `GRANT`s into
  a fresh cluster whose roles come only from the bootstrap script, so a role minted only in the
  migration makes restore-full FAIL with `role does not exist` (found at F-A3 PR-1b's `0121`,
  `clara_wake_bank` + `clara_wake_bank_login`). **Plain-grant mirroring must be EXACT**, not
  restyled: PG16+ plain `GRANT` takes `INHERIT` from the member's own `rolinherit`, so writing
  `inherit false, set true` in the bootstrap when the migration used a plain grant desyncs
  `dr-verify` §4.5's membership differential (`(f,t,f)` restored vs `(t,t,f)` source). Same
  family as new-grants-join-rig-meta.
- **② The FROZEN-WINDOW law, cross-PR face: a battery that byte-pins another PR's body must
  window the pin at the first successor CoR.** A battery written against a body at one frontier
  can legitimately need that body to change again later (F-A3 PR-1a's `f-a3.1a-a` byte-inversion
  cell reds the first time it runs on a chain containing `0121`, because PR-1b legitimately
  re-CoRs 4 of PR-1a's 9 cores). The fix is stem-gated: a `SUPERSEDED_BY_<PR>` set plus a stem
  gate turns the inversion check into a pre-successor-window claim, while presence and
  no-`_human_ctx` checks stay un-windowed. The successor's own §0 pre-state pins are the machine
  proof of where that boundary sits — read them, don't guess.
- **③ The VACUOUS-RELAXATION class: a "relaxed" guard that a pre-existing CHECK already subsumes
  is proof DELETION in disguise.** F-A7 β's first fix-round rewrite of CLR01 was judged vacuous
  because `ck_agent_filing_receipts_filed_iff_clean` already subsumed the congruence it claimed
  to add — the "relaxation" would have deleted the only proof of a real property, not narrowed an
  over-broad one. The adopted fix scopes the EXISTENCE mandate to agent-sourced filings instead
  (discriminator: `client_resolutions.evidence->>'source'`) rather than relaxing the guard's
  reach. When a proposed fix makes a guard redundant with something already enforced, check
  whether the guard was carrying independent weight before relaxing it.
- **④ A wall-introducing PR's shared-fixture remedy must reach EVERY package whose fixtures walk
  the walled path.** γ's `ensureClassifyConsent` fixture remedy landed only in
  `packages/db/tests/rig-docs-fixtures.mjs`; `packages/runtime`'s own fixtures create NULL-kind
  documents without the consent, so 4 runtime cells born `failed` — first surfaced on the estate
  leg, the only place all packages meet on one chain. **A lane verification that runs one
  package's suite is not estate verification.** Any wall-introducing PR enumerates the packages
  whose fixtures exercise the walled path and trues them all same-branch.
- **⑤ Closed-world censuses extend same-branch.** Four separate W2 cars re-learned this: a
  census that enumerates a closed world (roles, event types, clock rosters, seam ledgers) must be
  extended in the SAME migration/branch that adds the new member, never left for a later PR to
  discover the gap (er9 R9.H3's role census missing `clara_wake_filing` was the sharpest
  instance, caught only on the first-chain-meeting estate leg).
- **⑥ Pattern note — candidate future mechanism.** Four of the six W2 cars (pr-1b: DR roles +
  frozen-window · γ: cross-package fixture · β: three failure classes) needed a fix round found
  only when their closed, individually-green ladders met each other for the first time on the
  estate leg. Closed ladders built on stale bases prove nothing about how they behave once
  merged together. Candidate mechanism for a future wave: a pre-merge TRAIN RIG that applies the
  whole queued batch to one chain before car 1 merges, so this class of red surfaces before the
  ceremony window rather than during it.
- **⑦ `clara._tf_processing_task_update` joins the shared-surface list** beside `agent_tasks`
  triggers (≥6 lanes CoR'd it across the W2/W3 window — read its live body via
  `pg_get_functiondef` before authoring against it, per the shared-surfaces rule above; SendMessage
  the surface owner first).
