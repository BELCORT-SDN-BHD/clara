# #657 — match bank evidence to an already-approved booking · final report

**Branch** `impl/657-bank-existing-booking` · worktree `C:\Users\zhant\Desktop\clara-wt\657` · HEAD `7aa96d25`

```
7aa96d25 fix(db,web): #657 conform 0226 to the SQL-function census, and make the walk order-independent
d7a55780 docs: #657 CONTEXT terms for the derived candidate row and the deterministic basis, plus the module READMEs
dcee6f5f feat(web): #657 rebuild the /bank Matching tab on 0226's reads, with URL-as-truth tabs and one key per decision
42d53f9e feat(db): #657 migration 0226 — bank match evidence, the no-new-cash proof and a typed task binding
```

Local evidence only. **Hosted evidence pending.**

**Fix round 1 (reviews spec/standards/adversarial) landed on top of `7aa96d25`** — see
`reports/657-fixround-1.md`. Thirteen fixes across fifteen finding ids, one half-finding
deliberately left, one ratification requested (the op key's renewal rule gains a clause). Every
claim below that the fix round moved has been rewritten here rather than annotated.

## Per row

| Row | Result | Evidence |
|---|---|---|
| AC1 | done | line facts in the Table + detail pane (`matching-section.tsx`); candidate enrichment `p657.db.candidate-enrichment`; ambiguity is a **derived** row (D14), no object — CONTEXT *Settlement candidate row* |
| AC2 | verify-only, re-measured | `p657.web.refusal-verbatim` (`matching-refusal.test.tsx`) + walk leg 4 — `CLR10 · already_matched` with its `side`, message verbatim |
| AC3 | **done (the proof)** | `p657.db.no-new-cash` + `packages/db/tests/bank-no-new-cash.mjs` (exported for #666/#667); door states `new_journal_entries:0` (0226 §6) |
| AC4 | done | `p657.db.one-receipt-under-retry`, `p657.db.rematch-needs-a-new-key`, `p657.db.capacity-race` (blocking PROVEN behind a gate; its capacity assertion now reads the ledger, fix round A3), five `p657.web.opkey-*`, walk leg 4. **Fix round SP1/A1:** the key also renews when a selected entry's own match history moves, so `match → unmatch → resubmit` is a new operation and not a replay of the dead match's receipt |
| AC5 | partial | `matching-outcome.tsx` + 4 cells + walk leg 3. **Region: named residual** (0038:1758-1762; `bank_statement_lines` has no region column) |
| AC6 | done | account+period selector; filename via `documents.original_filename`; coverage lifted from `list_bank_statements`' own `tie`. **Page: same residual** |
| AC7 | done | `matching-candidates.tsx` + `matching-residual.tsx`; basis is four facts, never a score (cell asserts no `%`, no 0–1). Fix round A2/SP2: `candidate_basis` now describes EXACTLY the offered candidate set, asserted by entry-id set equality in `p657.db.matching-context` |
| AC8 | done | `candidate-sufficiency` display; two exact ⇒ "the choice is yours", no tie-break |
| AC9 | partial + named residual | derived row (D14); B3's write path **descoped**; per-line isolation in walk leg 5 |
| AC10 | done | as AC4 + reread-before-new-intent (`matching-section.tsx` post-act reloads). The outcome block now names the **operation key** the act was submitted under (fix round A6), asserted in `matching-outcome.test.tsx` and in walk leg 3 against the key observed on the request |
| AC11 | partial | one-cent difference **as a difference** (`matching-residual.test.tsx`); no-duplicate-cash = AC3; open-exception from the face (`p657.db.exception-context`, walk leg 5); keyboard/focus walk leg 6 |
| AC12 | done | `matching-exception-face.tsx`; `remedy_calls` → links into Exceptions; **no resolve control** asserted as an absence |
| AC13 | partial — **two measured residuals** | Table/Field/Alert used. **InputGroup is NOT used** (fix round S3): the cents input is `Field`/`FieldError` around `MoneyInput`, which wraps the plain `Input` — and the brief's own cited precedent (`work-question-form.tsx:70`) does not use InputGroup either, so the pattern was never adopted anywhere this ticket could copy. `ui:add combobox --dry-run` **REFUSES** (would overwrite owner-ruled `components/ui/button.tsx`); `ui:add popover --dry-run` exits 1 in the shadcn CLI itself. Not bought with `CLARA_UI_ADD_OVERWRITE=1`; search-over-Table instead. **No `apps/web/package.json`/lockfile change** |
| AC14 | done | six URLs + `?line=`; walk leg 6 (320px, 200%, reduced motion, keyboard, focus return). **Axe: 6 scans across the whole walk, 2 of them inside leg 6** (fix round S4 — the earlier "4" matched neither count); denied state = viewer CLR04 (`p657.db.acl`) |
| AC15 | partial | `humanQuery` personas throughout; `g1-wake-bank-e2e` 1/1 (**0 skips**) and v14 parity re-run green. No World leg owed |
| H-12 | verify-only | statement header/lineage/void fields rendered from the context read; `p657.db.matching-context` |
| H-14 | descoped (#675) | readiness consequence only |
| C-40 | done (matching half) | `_wdb_line_booking_block` had **zero** consumers; now published through the granted wrapper |
| C33.7 | verify-only + 2 residuals + cell | `p657.db.digest-census`; residuals (a) client-scoped binding, (b) blank-digest `coalesce` — both unchanged, both named |
| C33.8 | done (the smaller half) | intent-hash key (D15) + typed task binding; four key schemas **not** unified |

## Tests and commands

- `packages/db/tests/bank-line-existing-booking.test.mjs` — **11/11 pass, 0 skipped** with the 41 `--import …-preintegration-gate.mjs` flags (fix round added `p657.db.rematch-needs-a-new-key`). A focused run with the gate unset also passes on THIS rig, because 0226 is applied here; the loud-failure claim is about a pre-0226 chain, which this rig cannot be put into (a from-scratch chain on this cluster is forbidden), so what is verified is the premise guard in `before()` — it throws unless `CLARA_ALLOW_MISSING_BANK_MATCH_EVIDENCE=1` — and not a live red. Corrected from the earlier report, which read as though the red had been observed.
- `operation-census` + `rig-isolation` + `x38-wave-c-b-match` + `f-a3-pr3-chatturn-v14-bank-parity` + `f-a3-pr3-doors` in one run (no reset flags): **89 tests, 88 pass, 0 fail, 1 skipped** (the destructive reset cell). `f-a3-pr3-doors` is in that list because fix round S1 repaired its `c2.task-binding` cell, which 0226's signature change had broken.
- `packages/runtime` `g1-wake-bank-e2e`: **1/1, 0 skipped** — a real `bank_agent` credential still admitted against the recut cores.
- Whole `apps/web` suite, re-run after fix round 1: **4160 tests · 4157 pass · 1 fail · 2 skipped** (135 suites). The one failure is `lib/clara/use-clara-thread-stop.test.ts:1004` ("630 a stop the door says had ALREADY FINISHED…"), which passes **25/25 in isolation** — a whole-suite load flake in a lane #657 does not touch, the same class as the known `thread-live-clarify` one and the same lane the standards reviewer saw fail.
- `pnpm --filter @clara/web e2e bank-match`: **6 passed (22.8s)**, re-run after fix round 1 with the walk's new op-key assertion.
- `pnpm typecheck` **green** (exit 0); `pnpm lint` **green** (exit 0), both re-run after fix round 1.
- `node packages/db/scripts/migrate.mjs`: **0 new migration(s) applied · 220 total** — the runner accepts the edited 0226 against the rig ledger (fix round rig note).
- `check-frozen-workflows.mjs` **OK** (296 frozen files); `check-parts-parity.mjs` **OK**. Both no-ops — which is the evidence for "no successor".

New web cells: `matching-candidates/-residual/-outcome/-exception-face/-refusal.test.tsx`, `lib/bank/match-opkey.test.ts`, `lib/bank/matching-context-types.test.ts`. Fix round 1 added three more cells inside those files — `p657.web.opkey-renews-after-unmatch`, `p657.web.opkey-generation-is-data-not-lifecycle` and `p657.web.outcome-op-key` — and one DB cell, `p657.db.rematch-needs-a-new-key`. No new test FILE, so `apps/web/test/manifest.txt` is unchanged by the fix round.

## Docs

`CONTEXT.md` (+2 ratified terms, +4 refinements, *Settlement allocation* extended); `packages/db/README.md`; `packages/db/tests/README.md`; `apps/web/README.md`.

**Blueprint drift (not edited):** `ARCHITECTURE.md:524` — bank is still not in the capability registry after this slice. `PRD.md:109` — 银行对账 sits under 当前版本已交付 while this refines it. `ARCHITECTURE.md:509-512` unaffected.

## Successor contract

**None.** #657 needs no chat/Work-lane tool: the pack rides through as `Record<string, unknown>`, the act result rides verbatim, a new refusal reason is data. No `_vN` cut, no frozen file touched, no new runtime module, no part kind.

## Assumptions and open questions

1. **AC13 Combobox descoped** on the measurement above, taking the conservative reading (WORK-ORDER rule 6) rather than overriding an owner ruling.
2. **`_wdb_line_booking_block` is NOT re-listed** in a new rig-meta cohort — it already rides `AF2_0044_UNGRANTED_FNS`; a second row would be a second copy of one fact. 0226's tail and `p657.db.acl` assert its zero grants.
3. **`.github/actions/db-live-gates/action.yml` untouched** — it carries no gate flags (they live in `packages/db/package.json`). One fewer merge collision.
4. **`tests/firm-scope-db-pins.corpus.ts` gained a barrier row** for 0226 (shared file, one entry at the end, key order = file sort order). Not on the brief's shared list, but the census refuses an unreviewed barrier.
5. **FOR THE OWNER — two cash expressions, one product, nobody ruled them one.** #657 adds no cash reader (its AC3 proof reads `list_bank_statements`' existing `tie.gl_balance_cents`, and the new context read *calls* that function rather than copying it). #660 independently ships `get_client_financial_pack`'s **book cash** over its own governed cash-account set. DECISIONS and SYNTHESIS mention `gl_balance_cents` **zero times**; the only source is gap-657.md:212's unratified recommendation. Safe this wave (#660 recuts nothing), unresolved beyond it.

## LOUD for the integrator

All **thirteen** `_agent_*_core` bodies have NEW `prosrc` shas. Any future bank-family pin measures against #657's post-image, never 0129's. **Fix round A5: these are now PINNED AND ASSERTED in 0226's own tail** (a `v_posts` loop that raises CLR10 on any mismatch), not merely listed here: `_agent_add_bank_account_core` `74275dcf…`, `_agent_book_staff_advance_application_core` `b24efc35…`, `_agent_complete_bank_reconciliation_core` `a3c69597…`, `_agent_match_bank_line_core` `d735c1d7…`, `_agent_propose_bank_identifier_promotion_core` `cc9fcafc…`, `_agent_propose_line_exception_core` `6f83c76a…`, `_agent_resolve_and_book_core` `3bbf947f…`, `_agent_resolve_bank_line_exception_core` `bad39b0a…`, `_agent_settle_from_bank_line_core` `504a6ba1…`, `_agent_unmatch_bank_match_core` `35a3494d…`, `_agent_upsert_account_core` `59f6bad2…`, `_agent_void_bank_reconciliation_core` `6b7e8ce9…`, `_agent_void_bank_statement_core` `87c359a6…`. Also: `_agent_get_bank_pack_core` hashes the WHOLE pack, so **any fixture hard-coding a bank pack digest is invalidated by 0226**.

**Merge order:** `serve-built.mjs`'s dispatch chain is SEMANTIC — `handleP657Supabase` must stay **above** `handleHomeBoardSupabase` (DECISIONS §6.1). `SHARED_RPC_VERBS` deliberately untouched.

## Follow-ups worth filing

1. **Install Combobox/Popover without clobbering the owner-ruled Button.** `ui:add` refuses the whole payload when any file is protected; `popover` also fails in the CLI on `base-nova` + `"registries": {}`. Either teach `ui-add.mjs` to install the non-protected files and report the skipped one, or vendor the two components by hand with the Button fix re-applied. Blocks every lane that wants a searchable high-cardinality picker (appendix D row 18).
2. **Per-line region citations on bank statement lines.** AC5/AC6 want "which page of the PDF"; 0038's lane contract states verbatim that per-line region citations are not carried and `bank_statement_lines` has no column for one. Needs an ingest-side change, not a face-side one.
3. **Rule the two cash expressions into one** (see assumption 5) — a product decision for the owner, spanning #657 and #660.

## Unverified

- **Everything hosted.** No hosted deploy, no hosted read. "Hosted evidence pending."
- **The whole browser suite** beyond `bank-match` (orchestrator's/CI's job) and the **db estate suite** and **runtime suite** in full.
- `bankAgent_v1` is dormant (`0133:1058`, `enabled=false`, zero operator firms) — no claim here is made "for Clara" except through the chat lane (`clara_wake_interactive`), which `g1-wake-bank-e2e` exercises.
- The `counterparty_match: 'id'` rung (registration/TIN whole-word hit in a line description) is proved **shape-wise** by `p657.db.matching-context`; no fixture on this rig carries a registration number that appears in a statement description, so the `'id'` arm itself is **exercised but not positively witnessed**.
