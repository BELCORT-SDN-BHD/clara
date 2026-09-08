# Extraction-before-classification — implementation and verification

Date: 2026-09-08. Issue: [等待成功提取后再分类文件，修复 OCR／classify 竞态](https://github.com/BELCORT-SDN-BHD/clara/issues/606).

Status: implemented locally and reviewed. No commit, push or hosted rollout. Full PostgreSQL 17/current-frontier migration validation remains open.

## Behaviour changed

An unknown-kind PDF/image waits for a successful OCR/structured extraction before classification can be queued. `document.extraction_completed` now re-enters the existing facts gate; classification completion retains its existing downstream route. Task deduplication, consent, attempt limits and document/client boundaries remain in the original database body.

The append-only [0177 migration](../../../packages/db/migrations/0177_classify_after_extraction.sql) verifies the preceding function-body hash, owner and ACL, inserts the prerequisite, then verifies the resulting hash and unchanged security attributes. It refuses cutover if a claimable old classify task lacks successful extraction, making that existing work an explicit rollout precondition.

Deploy the compatible consumer first, then apply the DB change under the documented writer-quiescence protocol. To roll back, restore the DB body through a new append-only recovery migration while the new consumer remains live, then revert the consumer if required. Never delete or edit an applied migration. Old consumer plus new wait gate can lose the completion signal by checkpointing it as irrelevant.

Frozen `documentIngest_v2` files and the workflow registry were not changed.

## Executed checks

| Check | Result and limit |
| --- | --- |
| Focused Node test command below | 18 passed: 8 unit, 10 real-DB integration; no failures reported. |
| Runtime TypeScript check | Passed. |
| Focused ESLint | Passed. |
| Frozen workflow lint | 244 frozen files and 46 workflow modules verified. |
| `git diff --check` | Passed. |
| Direct migration application | Passed transactionally on PostgreSQL 16.13 at baseline migration 0143. This is not a full current-frontier runner result. |
| Unsafe pre-cutover task | One classify task without completed extraction produced the expected CLR10 precondition refusal; adding successful extraction allowed application. |
| Security/catalog result | Owner `clara_fn_owner`; ACL `{clara_fn_owner=X/clara_fn_owner}` retained. |

Verified post-image SHA-256: `42e8b0b44babb5dbf71a9018f4d1004f3a9cba46eeff4e4a7178d43f113c2df2`.

```powershell
pnpm --filter @clara/runtime exec node --test --test-concurrency=1 tests/facts-gate-unit.test.mjs tests/facts-gate-consumer.test.mjs
pnpm --filter @clara/runtime exec eslint lib/facts-gate.mjs tests/facts-gate-unit.test.mjs tests/facts-gate-consumer.test.mjs
pnpm --filter @clara/runtime typecheck
pnpm freeze:lint
git diff --check
```

These commands used an isolated local test database connection. The DB tests cover waiting before extraction, failed extraction, already-extracted filing, consent refusal, duplicate extraction events, and a real `set_document_kind` transition followed by late/duplicate events producing exactly one `llm_witness` task. The model itself is not called by this suite.

## Independent review

### Standards

The review confirmed migration hash reconstruction, owner/ACL preservation, no registered control witness for this function, and an unchanged frozen closure. A test had overstated a manually emitted classified event as a real classification transition; its claim was narrowed to a spurious-event guard, and the downstream test now uses the real kind writer. An unnecessary exported event array and assertions mirroring that array were removed.

### Spec

The review found missing rollback ordering and insufficient proof for duplicate classification-completed events. Both were addressed: rollback order is explicit in the migration/Architecture, and the real-writer integration cell asserts one downstream task, checkpoint at head and no dead letters. The root inspected the corrected source before accepting the local slice.

## Remaining verification

The fresh-chain runner applied 0001–0143, then stopped at the pre-existing 0144 ACL-text precondition on PostgreSQL 16.13. Migration 0177 was therefore applied directly with `psql -1 -v ON_ERROR_STOP=1`, against the latest relevant enqueue body and its exact hash. This does not establish the repository's required PostgreSQL 17 full-chain/current-0176 baseline, deployed bytes, or a hosted upload journey. The implementation issue remains open for those checks and rollout.

No standalone command log was created; execution evidence is in the task transcript. The disposable cluster is stopped and port 5545 no longer responds. Its data remains at `C:\Users\zhant\AppData\Local\Temp\clara-pg-0177-20260908`: automatic command review rejected recursive cleanup with only “blocked by policy”. The original user changes in `.codex/config.toml` and `apps/web/README.md` were preserved.
