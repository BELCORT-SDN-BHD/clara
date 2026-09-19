Landed on `impl/658-knowledge-retrieval`, migration `0230_knowledge_retrieval.sql`, merged via PR #954 into `main` at `ede1df83` (11 base + 3 fix-round-1 commits, head `141103cb`), with the successor cut (`claraWork_v5` stanza A, `chatTurn_v21` stanza B) landing in the same integration. **All evidence below is LOCAL; hosted evidence pending — this ticket stays open until the hosted release.**

**AC / historical rows**

| Row | State | Evidence |
|---|---|---|
| AC1 bounded core-first, firm scope | Partial — DB done, Work-lane closes at v5 cut | `p658.retrieve.core_first/.bounds/.legacy_unshadowed/.shadow_parity/.purpose_is_recorded_not_filtered`; stanza (A) |
| AC2 versions/relation; relevant revision replans | Partial — relation + drift done; replan closes at cut. Fix round 1 (A2) applied the read's own shadow, recheck-verified both directions | `clara.work_knowledge_reads`; `p658.reads.append_only`, `p658.drift.relevant/.shadow`; recheck A2 |
| AC3 required-read failure → visible state | Partial — status vocab + faces done; terminal contract-only, honest since fix round 1 removed the dead `core_readable` branch (ratified §6.2.0 R-D) | `p658.reads.status_vocabulary`, `p658.retrieve.envelope_is_atomic`; recheck A1/F1/S1 |
| AC4 conflicting sources; no untrusted-instruction influence | Verify-only, re-measured | `knowledge-records` 27/27, `clara-work-v4` 25/25; residual: two SOURCES disagreeing unrepresented (`0192:750-803`) |
| AC5 C13/Work expose source/applicability/freshness | Done | `p658.record_reads.*`; `knowledge-walk.spec.ts` 18/18 |
| AC6 full state ladder / 320px / 200% / keyboard / a11y / reduced motion / URL-Back / drafts | Done on owned surfaces | `work-knowledge-walk.spec.ts` 9/9; Playwright triple 41/41 (recheck) |
| AC7 least-privileged roles + real Postgres/Workflow World | Done | `work-knowledge-e2e.mjs` exit 0 (SIGKILL replay lands on own id) |
| C-36 versioned instructions/skills/tools | Partial carry — digest rides v5 | stanza (A) |
| C-84 SQL-boundary analyzer fixture | Verify-only, closed | `check-wiki-dynamic-sql.selftest.mjs` OK |
| C-87 Mobbin | Verify-only, partly consumed | 12 stills; motion/video outstanding |
| C34.3 `to_regprocedure` probes | Done | 3 cells, 54/54 |
| C55.6 unread source → parked question | Descoped (authority), tax specifics `PRD:125`; general rule contract-only | stanza (A) |
| C55.17 unavailable/stale/partial states | Done | four-word vocabulary |
| C83.14 official-source access | Duplicate, closes with C55.17 | — |

**Rulings that shaped it.** D16 (§0): core-tier failure stops the run, other tiers degrade to `partial`. R-D/§6.2.0: `retrieve_knowledge` is atomic, so any read failure halts the Work — layered per-tier isolation is deferred. §6.1: the seventh door's "client-scoped" §2 language meant firm-bounded, not client-only. §6.2.1: atomic door, withdrawn records still count as drift, no decade bound on `as_of` — ratified as shipped. §6.4: a durable per-inspection-read row (`read_kind`) is **not this wave**; `inspect_knowledge_source` stays registered at zero rows until then.

**Integration and successor cut.** `claraWork_v5` (six files) cut with `read_knowledge_source`/`read_knowledge_history` rostered, `knowledge_read_failed` extracted as the pure predicate `knowledgeReadFailedV5`, block now naming its records per fix-round-1 ADV-S-1. `chatTurn_v21` stanza (B) was **taken, not contract-only**: `loadClientBasisStepV21` reads `retrieve_knowledge` (`p_purpose='chat_turn'`), corrected (ADV-S-5) to its own 60/300 caps rather than the door's 40/200. Integration fix `2c73431e` taught `journal-work-mock.mjs` #658's `work_knowledge_drift` mount read (with #655/#636's), returning 0230's honest no-observation envelope. §6.3's S5.25 clock census registered `retrieve_knowledge`/`record_work_knowledge_read`/`list_work_knowledge_reads_for_record` as CLASS 2 consumers — no fix owed (unlike #660's two escalated names).

**Named residuals → follow-ups (to be filed).** (1) Widen `ARCHITECTURE:297-299`'s pack-shaped-read rule from the function to the shape. (2) Surface `get_context_pack`'s `last_projected_seq`/`has_stale_sources` (belongs with #663). (3) Represent two independent knowledge *sources* disagreeing, not just two records. (4) State the read-set key grammar as the estate's key law (stricter than the catalog's own CHECK). (5) Note in the raw-hex-colour lint rule that a `#NNN` ticket reference in a string literal trips it. (6) Durable per-inspection-read row (`read_kind`), DECISIONS §6.4.

**Blueprint drift (#683's sync).** `PRD:123` — half satisfied: this slice ships the drift *detector* only, correction/re-evaluation stays #663's. `ARCHITECTURE:182-183,:293` — pins read v19/v3, live is v20/v4 pre-wave, `workflowBodies` holds 53 not 51. `:297-299` — opposite drift: rule too narrow (names one function, not the shape). `:373-386` — writer-side trace bounds now exist but bind only from v5 (rider #847, cut this wave). `:435-445` — schema-covering bundle digest delivered in the v5 cut, replacing `tools:{id,names}`.

**Verify locally**
```
node --test <41 gate flags> packages/db/tests/knowledge-retrieval.test.mjs   # 28/28
node --test packages/runtime/tests/knowledge-retrieval.test.mjs             # 19/19
node packages/runtime/tests/work-knowledge-e2e.mjs                          # exit 0 (World leg)
pnpm --filter @clara/web e2e knowledge                                      # 41/41 (Playwright triple)
```
