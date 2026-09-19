Landed via PR #954 ("Wave 2026-09-18"), merge commit `ede1df83`; migration `0226_bank_match_evidence.sql` (edited in fix round 1, checksum `55b6e279…`, re-verified on a from-scratch chain at integration — `integration-merge.md` §3.1/§3.3, battery **11/0/0**). All evidence below is LOCAL; hosted evidence pending — this ticket stays open until the hosted release.

**AC / historical rows**

| Row | State | Evidence |
|---|---|---|
| AC1 identity/candidate facts | done | `p657.db.candidate-enrichment`; `matching-section.tsx`; ambiguity is a **derived** row (D14) |
| AC2 lock/reread/refuse | verify-only, re-measured | `p657.web.refusal-verbatim` + leg 4 — `CLR10 · already_matched` verbatim |
| AC3 no-new-cash proof | **done** | `p657.db.no-new-cash` + `bank-no-new-cash.mjs` (for #666/#667); 0226 §6 tail `new_journal_entries:0` |
| AC4 duplicate/lost-response/race | done — fix round closed a blocker | `p657.db.rematch-needs-a-new-key`, `-one-receipt-under-retry`, `-capacity-race`, 5× `p657.web.opkey-*`; SP1/A1 — key folds each entry's match-history generation |
| AC5 C4/Work links + no-new-cash text | partial — **named residual**: no per-line PDF region column (0038) | `matching-outcome.tsx` + 4 cells, walk leg 3 |
| AC6 account/period/filename/coverage | done — page-level = same residual | account+period selector; filename via `original_filename`; coverage from `list_bank_statements` |
| AC7 candidate facts side by side | done — fix round closed a spec-drift | `matching-candidates.tsx`; `p657.db.matching-context` now asserts entry-id set equality (was a superset) |
| AC8 unique-sufficient completes | done | `candidate-sufficiency`; two exact ⇒ "the choice is yours" |
| AC9 ambiguous/stale leaves one pending row | partial + residual (B3 write path **descoped**, D14) | derived row (D14); leg 5 |
| AC10 retry/refusal/reread | done | reread-before-new-intent; outcome names op key (A6), `matching-outcome.test.tsx` + leg 3 |
| AC11 exact/one-cent/multi/exception fixtures | partial | one-cent diff (`matching-residual.test.tsx`); no-dup-cash = AC3; leg 5/6 |
| AC12 open-exception retained, no resolve | done | `matching-exception-face.tsx`; `remedy_calls` links Exceptions; no resolve control (asserted as an absence) |
| AC13 Table/Combobox/Field+InputGroup/Alert | partial — **two residuals** | Table/Field/Alert used; InputGroup NOT used (S3); `ui:add combobox`/`popover --dry-run` both refuse/exit 1 |
| AC14 states/a11y/zoom/URL | done | 6 URLs + `?line=`; leg 6 (320px, 200%, reduced motion, keyboard, focus); **6 axe scans, 2 in leg 6** (S4, was "4"); denied = CLR04 |
| AC15 real journey, least-priv, World | partial (no World leg owed) | `humanQuery` personas; `g1-wake-bank-e2e` 1/1, 0 skips |
| H-12 statement facts | verify-only | header/lineage/void from context read; `p657.db.matching-context` |
| H-14 | descoped (authority: #675) | readiness consequence only |
| C-40 exception/reconciliation actions | done (matching half) | `_wdb_line_booking_block` had zero consumers, now published via the granted wrapper |
| C33.7 bank security re-census | verify-only + 2 residuals | `p657.db.digest-census`; client-scoped binding, blank-digest `coalesce` |
| C33.8 one op-key schema | done (smaller half) | intent-hash key (D15) + typed task binding; 4 schemas not unified |

**Rulings.** D14 — no new Work/question object; a derived, non-stored Needs-you row, sibling to #947/#949, first written into CONTEXT.md. D15 — one decision one key (intent hash); §6.2.1 amends D15: key also folds each entry's match-history generation (ratifies SP1/A1). §6.1 — `serve-built.mjs` dispatch is semantic, `handleP657Supabase` stays above `handleHomeBoardSupabase`'s `EMPTY_RPCS` arm, unmoved at integration. §6.2.2 — fix round 2 softened the isolation-flake claim to 1-in-4.

**Integration/successor.** No successor contract — no chat/Work-lane tool (pack rides as `Record<string, unknown>`, no frozen file, no new part kind; WAVE-DIGEST §4). Integration re-verified edited 0226 on a fresh chain on two clusters, reconciled the corpus checksum pin, confirmed dispatch order survived the `serve-built.mjs` merge with #656.

**Residuals → follow-ups (to be filed).** Install Combobox/Popover without clobbering the owner-ruled Button (ready-for-agent). Per-line region citations on statement lines, ingest-side (ready-for-human). Rule the two cash expressions (`gl_balance_cents` vs. #660's book cash) into one, shared with #660 (ready-for-human). `maskComments` desyncs after an unbalanced comment token (ready-for-agent). `migrate.mjs` has no "redo one migration" mode, cross-cutting (ready-for-agent). `use-clara-thread-stop.test.ts` flake, pre-existing, untouched here, cross-cutting 8 tickets (ready-for-agent).

**Blueprint drift (#683 sync).** `PRD.md:109` — 银行对账 listed as delivered; this ticket refines it. `ARCHITECTURE.md:524` — bank still not in the capability registry. `ARCHITECTURE.md:509-512` — unaffected, noted not drifted.

**Verify locally.**
```
node packages/db/scripts/migrate.mjs                                        # 0 new · 228 total
node --test --test-concurrency=1 <49 gates> tests/bank-line-existing-booking.test.mjs  # 11/11
pnpm --filter @clara/web e2e bank-match                                     # 6 passed
pnpm typecheck && pnpm lint                                                 # exit 0
```
