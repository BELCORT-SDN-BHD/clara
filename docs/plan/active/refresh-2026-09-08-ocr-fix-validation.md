# Extraction-before-classification — implementation and verification

Dates: 2026-09-08 (local candidate) and 2026-09-09 (full-chain verification, fixture alignment, commit).
Issue: [等待成功提取后再分类文件，修复 OCR／classify 竞态](https://github.com/BELCORT-SDN-BHD/clara/issues/606).

Status: implemented and verified locally on PostgreSQL 17.11 through the repository migration runner across the
full chain 0001–0177, and committed on `main`. No hosted rollout, hosted upload journey or Fly release has been
performed; the issue stays open for those.

## Behaviour changed

An unknown-kind PDF/image waits for a successful OCR/structured extraction before classification can be queued:
`clara._enqueue_invoice_facts_core` answers `awaiting_extraction` (no task, no model call) until a `done`
`ocr`/`structured_parse` extraction exists. `document.extraction_completed` re-enters the existing facts gate through
the runtime's `facts_gate` consumer; classification completion keeps its existing downstream route. Task
deduplication, consent, attempt limits and document/client boundaries remain in the original database body.

The append-only [0177 migration](../../../packages/db/migrations/0177_classify_after_extraction.sql) verifies the
pre-image body hash, owner and anchor uniqueness, refuses cutover while a claimable classify task lacks a successful
extraction, splices the live definition through `pg_get_functiondef` (the 0175 splice shape) and verifies the
post-image hash, unchanged ACL, `SECURITY DEFINER` and `search_path`.

Deploy the compatible consumer first, then apply the DB change under the documented writer-quiescence protocol.
To roll back, restore the DB body through a new append-only recovery migration while the new consumer remains
live, then revert the consumer if required. Never delete or edit an applied migration. An old consumer with the new
gate can checkpoint the completion signal as irrelevant and strand the document.

Frozen `documentIngest_v2` files and the workflow registry were not changed.

## What the 2026-09-09 verification changed

- The repository migration runner refused the 2026-09-08 candidate: `set local statement_timeout` must be the first
  executable statement (`packages/db/scripts/migration-lexer.mjs`). The 2026-09-08 note had applied 0177 with
  `psql`, which bypassed this rule. Fixed by reordering the preamble.
- The web SQL-function census (`apps/web/test/sqlFunctionCensus.ts`) could not resolve the candidate's
  `execute format(...)` dynamic body, failing eight web tests. 0177 was recut into the `pg_get_functiondef` +
  `replace` + `execute` splice shape the census proves, and registered as a reviewed dynamic-SQL barrier
  (content-addressed by sha256) in `apps/web/tests/firm-scope-db-pins.corpus.ts`.
- The 0020 §6 closed-set exact-diff pin (`packages/db/tests/wave-b/wb-0020-legacy.test.mjs`) gained the ratified
  0177 amendment layer, transcribed from the migration's own splice literals and dormancy-safe below the frontier.
- DB test fixtures now reproduce the pre-0177 outcome the way production reaches it: `fileDocument` seeds the
  successful extraction the gate waits for and re-fires the gate through `clara.enqueue_invoice_facts`
  (`packages/db/tests/rig-docs-fixtures.mjs`, opt out with `seedGateExtraction: false`); `seedCitedDocument`
  re-fires after its own OCR row; the gamma-egress enqueue driver and the two TOCTOU cells seed the precondition
  explicitly so their consent and kind-snapshot properties stay isolated.
- The pre-existing local commit-time state (`.codex/config.toml`, `apps/web/README.md` Mobbin edits) was left out
  of this change.

## Executed checks (2026-09-09, local)

| Check | Result and limit |
| --- | --- |
| Fresh PostgreSQL 17.11 cluster, `pnpm db:migrate` over origin/main's 0001–0176 export, then HEAD (deploy-onto-existing shape, four independent clusters) | 172 applied; 0177 applied by the runner; post-image sha256 `42e8b0b44babb5dbf71a9018f4d1004f3a9cba46eeff4e4a7178d43f113c2df2`; owner `clara_fn_owner`; ACL `{clara_fn_owner=X/clara_fn_owner}`; `prosecdef=true`; `search_path=clara, pg_temp`. Also applied on the official `postgres:17` Linux image. |
| Unsafe in-flight precondition drill (scripted, cluster at 0176) | A queued classify task minted by the pre-0177 core without an extraction made `pnpm db:migrate` refuse 0177 with the CLR10 prestate; frontier and body unchanged; after a `done` extraction the same command applied 0177; re-fire on that document deduped to the same task; a fresh NULL-kind PDF answered `awaiting_extraction` with no task, a failed extraction still opened no task, and a done extraction produced exactly one queued classify task under repeated re-fire. 18/18 checks. |
| Focused runtime tests (`tests/facts-gate-unit.test.mjs`, `tests/facts-gate-consumer.test.mjs`) | 18 passed (8 unit, 10 real-DB), 0 skipped, on the full-chain PG17 rig. |
| Full `@clara/db` suite on a fresh full-chain cluster (Node 20.19.5, PostgreSQL 17 client on PATH) | 4087 tests, 3993 passed, 0 failed, 94 skipped (pre-existing frontier/lane skips). |
| Full `@clara/runtime` suite on the same cluster | 2079 tests, 2078 passed, 0 failed, 1 skipped; the pg_dump-dependent files (`relay-taxonomy`, `fs7-v17-chatturn-db`, `correction-adjudication`) also passed 9/9 under Node 22.23.2 with the PG17 client on PATH. |
| Web census tests (`do-action-floors`, `capabilities`, `members-doors`, `firm-scope-db-pins`) | 83 passed, 0 failed after the corpus entry. |
| `pnpm typecheck`, web/db/runtime ESLint, `pnpm freeze:lint` (244 frozen files, 46 workflow modules), `git diff --check` | Passed. |

Commands (rig env: `PGHOST=127.0.0.1 PGPORT=<rig> PGUSER=postgres PGDATABASE=clara_ci CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`):

```powershell
pnpm db:migrate; pnpm db:seed
pnpm --filter @clara/db test
pnpm --filter @clara/runtime test
pnpm --filter @clara/runtime exec node --test --test-concurrency=1 tests/facts-gate-unit.test.mjs tests/facts-gate-consumer.test.mjs
pnpm --filter @clara/web exec node --import tsx --test lib/command/do-action-floors.test.ts lib/firm/capabilities.test.ts lib/members/members-doors.test.ts tests/firm-scope-db-pins.test.ts
pnpm typecheck; pnpm freeze:lint; git diff --check
```

The model itself is not called by any of these suites.

## Remaining verification

Hosted: GitHub CI on the pushed commit (Postgres 17 service containers), the Fly deploy order (consumer image before
0177), the live writer-quiescence window, and a real upload journey on the deployed stack. The migration's
in-flight precondition means a live cutover must first let every queued NULL-kind classify task finish its
extraction or resolve it explicitly.
