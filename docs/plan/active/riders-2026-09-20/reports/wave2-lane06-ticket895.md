# Wave 2 · Lane 06 · Ticket #895 — DONE (0218 firm-setup migration polish)

Branch: `riders/w2-lane06` (worktree `C:\Users\zhant\Desktop\clara-wt\656`). Base:
`23cfad947b5598214168ba9c43d391b4e16aa745`. `git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD`
at start showed one commit (#894, already landed):

```
4d23d3c5d fix(db): #894 harden uq_onboarding_plans_one_open_firm's predicate
```

and now shows two:

```
dc9f16db4 fix(db): #895 0218 firm-setup migration polish -- three defects the #648 fix round left
4d23d3c5d fix(db): #894 harden uq_onboarding_plans_one_open_firm's predicate
```

`git status` in the worktree is clean after the commit.

## Ticket

#895 "0218 firm-setup migration polish (three items deferred while byte-frozen this round)" — the
NEWEST (and only) Agent Brief, comment `2026-09-17T17:00:53Z` (`65fde7f3`), re-verified live on
this branch before building: I ran three direct rig probes (`clara.seed_firm_setup_plan`,
`clara.get_firm_setup`, `clara.withdraw_knowledge`/`clara.correct_knowledge` through `humanQuery`)
against `clara_l06` before writing any SQL and reproduced all three defects exactly as the brief
and the AI triage comment describe (raw output kept in this session's transcript; summarised under
each AC below). #894 (0255) does not touch either function this ticket recuts — confirmed by
reading its diff and by this ticket's own prestate pins matching the frontier left after #894.
Out of scope, per the brief: editing `0218_firm_setup.sql` in place, and #891/#892.

## Seams tested at

- **`clara.seed_firm_setup_plan(text)`** and **`clara.get_firm_setup()`** through `humanQuery` as a
  real admin persona — the two public doors the brief's "Key interfaces" names, and the only two
  this ticket recuts.
- **`clara.audit_log`** and **`clara.domain_events`**, read directly (root) to prove the audit row
  and the `firm_setup.seeded` event still fire on a no-op reconciliation.
- **`clara.knowledge_records`**, read directly (root, by `id`) to cross-check a withdrawn /
  superseded / live revision's own `state`/`superseded_at`, independent of what the door reports.
- **The committed `prosrc`** of both recut functions (`pg_proc`), for the migration's own tail
  census — `seed_firm_setup_plan` and `get_firm_setup` are `_human_ctx`-gated (identity from a JWT
  claim), so, like every other migration in this chain that recuts a gated door, the migration's
  tail proves the CODE SHAPE landed structurally; the BEHAVIOURAL proof is the test file's job.

## Migration

`packages/db/migrations/0256_firm_setup_polish.sql` — applied cleanly to `clara_l06` via
`pnpm db:migrate` on top of the lane's chain after #894 (231 files total after apply). Prestate/tail
notices from the real apply:

```
[notice] #895 prestate: clean -- clara.seed_firm_setup_plan and clara.get_firm_setup are live at
  their pinned pre-images, neither already carries a #895 marker or this file's own fix, the exact
  pre-image fragments this file splices are present byte for byte, ck_knowledge_records_state
  reads the text DEFECT 3's reasoning depends on (live and withdrawn both force a null
  superseded_at), and every helper either body calls is present.
[notice] #895 tail: OK -- clara.seed_firm_setup_plan bumps the plan's CAS token, revision number
  and revision history ONLY when its own reconciliation inserted at least one row, while the audit
  row and the firm_setup.seeded event still fire unconditionally (seeded=0 on a no-op run);
  clara.get_firm_setup's counter.required_total is now gated on p.id is not null exactly as
  required_answered already was ... confirmed_facts now filters r.state = 'live' exactly as the
  per-item join two blocks above already does ... both recut functions kept their exact
  clara_fn_owner/SECURITY DEFINER/search_path/plan_cache_mode/ACL posture and stay
  EXECUTE-unreachable by every machine role; and the other six names in the 0218 cohort,
  clara.firm_setup_keys's twelve rows and #894's widened partial unique index are all untouched.
applied 0256_firm_setup_polish · backend pid 362266
migrate: 1 new migration(s) applied · 231 total · target 127.0.0.1:55746/clara_l06
```

**Prestate pins, measured on `clara_l06` at the frontier left after #894 (0255 applied), PostgreSQL
17.11, moments before applying — both hardcoded constants in the migration's own `DO` block, not
transcribed from memory:**

- `clara.seed_firm_setup_plan(text)` `sha256(prosrc)`:
  `e610ca8703948cdd5198467d8a99d0c4aa774fabbf4b5bb654ff67b816964f16`
- `clara.get_firm_setup()` `sha256(prosrc)`:
  `4179599f143a313b9a7a6880d0b5a6473157b4a54b1b0bc37476e7a087519f78`

No redo was needed: the file applied cleanly on the first attempt (after one syntax fix made
*before* the first real apply — `create function` → `create or replace function`, caught by
`function "seed_firm_setup_plan" already exists`), so `CLARA_MIGRATION_REDO` was never used against
the applied ledger.

**Recut shape.** Both functions are full-body recuts (`create or replace function`), pasted
verbatim from their 0218 text except the three deltas below. Neither signature, floor, grant or
ACL moved — `create or replace function` preserves them when the signature is unchanged, and the
tail re-reads owner/`SECURITY DEFINER`/`search_path`/`plan_cache_mode`/ACL off `pg_proc` rather than
trusting that sentence.

## Acceptance criteria

- **[x] AC1 — a cell proves a second seed that adds zero items leaves revision, token and
  snapshot count unchanged, and a first seed still bumps all three.**
  Fix: `clara.seed_firm_setup_plan`'s call to `clara._firm_setup_bump` moved inside
  `if v_added > 0 then … end if;`; the audit row and `firm_setup.seeded` event still fire
  unconditionally.
  Test: `p895.seed.noop a second seed that adds zero items leaves revision/token/history
  unchanged; the first seed still bumps all three` in
  `packages/db/tests/firm-setup-polish.test.mjs` — **PASS**. Seeds an empty plan (bumps:
  `revision_n` 1→2, token rotates, one new `onboarding_plan_revisions` row); seeds again under a
  DIFFERENT `op_key` once every catalogue row is already present (`seeded:0`) and asserts
  `revision_n`, `revision_token` and the revision-history row count are BYTE-UNCHANGED by the
  no-op call, while `clara.audit_log` gained a second `fn='seed_firm_setup_plan'` row and
  `clara.domain_events` gained a second `firm_setup.seeded` row carrying `seeded:0` and the
  CURRENT (unmoved) `revision_n`.
  Before the fix (see "Vacuity control" below): the same cell failed with `3 !== 2` on
  `afterSecond.revision_n` — the no-op call had advanced the revision exactly as the bug report
  predicted.

- **[x] AC2 — a cell proves the read returns an honest counter for a firm with no plan, asserted
  on the door's answer.**
  Fix: `clara.get_firm_setup`'s `v_req_total` query gained the identical `and p.id is not null`
  guard `v_req_done` already carried.
  Test: `p895.read.honest_no_plan get_firm_setup reads an honest zero-over-zero counter for a firm
  with no firm-scope plan at all` — **PASS**. Plants a firm with NO firm-scope plan row at all
  (root, by construction — no door ever creates a firm without one; every real firm gets one
  through `clara._create_firm_core`), calls `get_firm_setup()` as admin, and asserts
  `counter` deep-equals `{required_answered:0, required_total:0}`, `plan_id` is null, `seeded` is
  `false`, and `catalogue_total` stays `12` (the catalogue's own size is a constant about the
  vocabulary, untouched by this fix).
  Before the fix: the same cell failed asserting `{required_answered:0, required_total:0}` against
  the door's actual `{required_answered:0, required_total:8}` — the exact "real-looking counter"
  the AI triage comment named.
  `v_unseeded` (which feeds the `seeded` boolean, the only externally-visible consumer) was already
  plan-aware via its own `LEFT JOIN`'s `p.id is not null` predicate; restated with an explanatory
  comment in the migration, no functional change (measured: PROBE 1 in this session, before any
  code was written, showed `seeded:false` was already correct for a plan-less firm).

- **[x] AC3 — a cell proves a withdrawn firm default leaves confirmed facts, a live one stays, a
  superseded one is absent.**
  Fix: `confirmed_facts`'s `where` gained `and r.state = 'live'`, the exact clause the per-item
  join two blocks above (0218 §F) already carried.
  Test: `p895.facts.state_filter a withdrawn firm default leaves confirmed_facts, a live one
  stays, a superseded one is absent` — **PASS**. Answers `currency` then withdraws it
  (`clara.withdraw_knowledge`); answers `accounting_basis` then corrects it
  (`clara.correct_knowledge`, minting a new live revision under the same `record_id`). Asserts
  `confirmed_facts` excludes the withdrawn revision (and names no revision of
  `default_currency` at all), excludes the pre-correction (now-superseded) revision, and includes
  exactly one live revision for `accounting_basis` — the corrected one. Cross-checked directly
  against `clara.knowledge_records` by row `id`: the withdrawn row reads `state='withdrawn'`,
  `superseded_at is null`; the pre-correction row reads `state='superseded'`,
  `superseded_at is not null`; the corrected row reads `state='live'`, `superseded_at is null` —
  all three sharing exactly the two `record_id` threads the cell minted.
  Before the fix: the same cell failed asserting the withdrawn revision's absence — it was present,
  carrying `state:"withdrawn"` on the object as the one clue the read never acted on.
  Note on identity: `record_id` (`clara._knowledge_row_json`) is the STABLE thread identity shared
  by every revision of one fact; `revision_id` (`clara.knowledge_records.id`) is the one physical
  row a capture/correction/withdrawal each mints fresh. The cell asserts on `revision_id`
  throughout for exactly that reason (an earlier draft asserted on `record_id` and failed for the
  wrong reason — `correct_knowledge`'s receipt correctly returns the SAME `record_id`, not a new
  one — corrected before the cell was accepted as evidence).

**Vacuity control** (work-order rule 4, "a ticket whose whole deliverable is a test or a lint still
needs it" — this ticket's deliverable is three SQL-level fixes with no new relation or grant to
independently anchor a cell to, so the same discipline applies): after the real migration apply
went green, I reverted `clara.seed_firm_setup_plan` and `clara.get_firm_setup` to their EXACT
pre-#895 text via raw `create or replace function` SQL run outside the migration ledger (extracted
byte-for-byte from `0218_firm_setup.sql`'s own source), ran `firm-setup-polish.test.mjs` and watched
all three cells fail for the three stated reasons (`3 !== 2`; `{required_total:8}` vs `{0}`; the
withdrawn revision present), then restored the exact post-#895 bodies (extracted byte-for-byte from
the real, committed `0256_firm_setup_polish.sql`), re-ran the migration's own tail census directly
(passed with no exception) and re-ran the test file (all three green again). `clara.schema_migrations`
was never touched by either step, so the ledger's own record of what applied is unaffected.

## Gates

- **`packages/db/tests/firm-setup-polish.test.mjs`** (new, own stable stem `firm_setup_polish$`, 3
  cells): focused run before the migration was applied → all 3 failed loudly for the right reason
  (`the #895 firm-setup-polish lane is required for a focused run`, from the file's own gate, since
  `firm_setup_polish$` matched no `clara.schema_migrations` row yet). After applying 0256: focused
  run → **3/3 pass**.
- **`packages/db/tests/firm-setup.test.mjs`** (not touched) **+**
  **`packages/db/tests/onboarding-plan-firm-uniqueness.test.mjs`** (not touched) **+**
  **`firm-setup-polish.test.mjs`**, together, with the full 52-entry preintegration-gate chain
  (`node --test --test-concurrency=1 $GATES tests/firm-setup.test.mjs
  tests/firm-setup-polish.test.mjs tests/onboarding-plan-firm-uniqueness.test.mjs`) →
  **23/23 pass, 0 fail** (17 `p648.*` + 3 `p895.*` + 3 `p894.*`) — the "firm-setup batteries green"
  half of AC4, and proof the recut broke no existing p648/p894 assertion.
- **`packages/db/tests/operation-census.test.mjs`**: this ticket added no SQL function (it recuts
  two existing ones), so this gate is not strictly required by work-order rule 8's "if you added
  SQL functions" clause — run anyway per rule 8's unconditional "if you touched packages/db/tests"
  clause, with the full gate chain → **10/10 pass**.
- **`packages/db/tests/rig-isolation.test.mjs`**: same rationale, full gate chain, never with reset
  flags → **32/33 pass, 1 skip** (`T19 poison-role`, the one destructive cell, correctly SKIPped
  because `CLARA_RIG_ALLOW_RESET` is unset — RIG.md: never set it), **0 fail**.
- **`pnpm --filter @clara/db lint`** (`eslint .`, part of the repo-wide run below) → clean.
- **`pnpm lint`** (repo-wide) → exit 0, all packages' lint/self-test batteries pass.
- **`pnpm typecheck`** (repo-wide) → **fails, but for a reason unrelated to #895 and pre-existing
  on the base commit** (the SAME defect #894's report already flagged):
  `apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name
  'DOCUMENT_KINDS'` (+ one downstream implicit-`any`). Confirmed byte-identical to the base commit
  (`git diff 23cfad947b..HEAD -- apps/web/components/documents/document-kind-dialog.tsx` is empty)
  and untouched by this ticket or #894. Root cause (read, not fixed — out of scope): the file uses
  `DOCUMENT_KINDS` at line 95 but imports only `CLASSIFIABLE_DOCUMENT_KINDS` from
  `./document-kind-control`; `DOCUMENT_KINDS` itself lives in `@/lib/documents/types` and is never
  imported here. `packages/runtime typecheck` reports `Done`. `packages/db` carries no `typecheck`
  script (plain JS), so this gate is structurally inapplicable to this ticket's own files either
  way.
- `apps/web` unit suite / e2e walks: not run — this ticket touches no file under `apps/web`.
  `packages/runtime` gates (`check-frozen-workflows.mjs`, `check-parts-parity.mjs`): not run — this
  ticket touches no file under `packages/runtime`.
- Attempted, not completed: a whole-package `pnpm test` run (the full `packages/db` suite, several
  thousand cells) for extra assurance beyond the required gates above — it exceeded this tool's
  10-minute command budget mid-run (no failures observed before the timeout, one in-flight test's
  process was killed by the timeout and reported a spurious `exitCode: 143`/`ERR_TEST_FAILURE` that
  is the timeout artifact, not a real assertion failure). Not required by work-order rule 8 for a
  `packages/db`-only ticket (the whole-suite requirement is `apps/web`-specific); recorded here as
  an attempted-but-inconclusive extra check rather than silently omitted.

## Docs

- `packages/db/README.md` — the "Firm setup (0218, journey A5)" section gains a new paragraph
  after the #894 one, naming #895/0256 and all three fixes (conditional bump, plan-aware
  `required_total`, the `confirmed_facts` state filter), and states `required_outstanding` as a
  stated residual left untouched.
- `packages/db/tests/README.md` — a new "Firm setup polish (#895, `0256_firm_setup_polish.sql`)"
  section describes the new test file's frontier gate, its three cells, the `record_id` vs
  `revision_id` distinction the cells rely on, and the vacuity-control procedure run against the
  real migration text.
- `CONTEXT.md` — not touched: no new domain term is introduced (three SQL-level correctness fixes
  to an already-defined "Firm setup" surface; nothing here changes what a Knowledge revision,
  withdrawal or correction MEANS, only that `get_firm_setup` now reads that meaning correctly).

## Successor contract

None. Neither `clara.seed_firm_setup_plan` nor `clara.get_firm_setup` is a frozen chat or Work tool
body or closure module; both are ordinary `clara_authenticated`-only human doors, recut in place at
their existing signatures. Nothing here is a surface a frozen chat or Work tool would need.

## Follow-ups worth filing

- `required_outstanding` (the `v_out` query in `get_firm_setup`) is built the same
  plan-unaware-looking way `required_total` was: for a plan-less firm it lists EVERY required
  catalogue key as "outstanding". Unlike `required_total` it carries no denominator to look
  dishonest against (arguably true of a plan that has never been opened), and #895's Agent Brief
  names only the counter and the unseeded count, so it is untouched here — but it is the one
  remaining plan-unaware-looking shape in this door, worth a look if a future caller ever renders
  it before checking `plan_id` the way today's two web consumers do.
- The pre-existing `apps/web` typecheck failure (`document-kind-dialog.tsx`, `DOCUMENT_KINDS` not
  imported) — already flagged by #894's report; still present, still unrelated to this lane's
  tickets, still worth its own ticket for whoever next touches that dialog or for the integrator.

## Unverified

- Whether any hosted/production firm has ever actually seeded its plan twice (the scenario DEFECT
  1 fixes) or captured-then-withdrawn a firm-defaultable fact (DEFECT 3) — I have no access to
  hosted catalog state from this lane; the rig probes and cells above establish the DEFECT existed
  in the code, not that it has manifested on a real firm's data.
- The full `packages/db` whole-suite run's outcome beyond the point it was cut off by the 10-minute
  tool timeout (see "Gates" above) — no failure was observed in the portion that ran, but the run
  did not reach completion, so "the whole suite is green" is not a claim I can make; the explicitly
  required gates (touched/adjacent test files, operation-census, rig-isolation) are fully green and
  reported above.
