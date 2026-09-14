# #643 — REVIEW FIX ROUND — final report

**Branch** `impl/643-periodic-adjustments` · worktree `C:\Users\zhant\Desktop\clara-wt\643` · **clean**, never pushed, no PR.
Six new commits (`git log --oneline main..HEAD`, newest first):
`46440525` docs · `e6719b4c` fix(web,e2e) mock + two cells · `be0e06bd` test(web,runtime) the citation · `99db4e94` feat(web) the chooser · `af22d1ea` test(db) · `ac1dd6e6` fix(db) 0194.

`clara.admit_periodic_adjustment_work` **did not move** — read from rig643b's catalog:
`clara.admit_periodic_adjustment_work(p_client uuid, p_author uuid, p_intent_key text, p_purpose text, p_basis jsonb, p_adjustment jsonb, p_basis_origin text, p_source_refs jsonb, p_model text)`; `clara.admit_journal_work`'s 7-arg door likewise.

**New `_record_journal_entry_core` body sha256 (installed prosrc, rig643b): `eca58b99c45b53fe3c36dcd1b238a1d94b2b8c01a305e8debc4f0a6ca03d4ade`** (was `bebee4e4…`). #631's 0195 pins against this.

## Finding → what I did → evidence

| finding | what I did | evidence |
|---|---|---|
| **STANDARDS BLOCKER** — no evidence chooser; `submitPeriodicAdjustmentWork` took no `sourceRefs` | Extracted the composer's chooser **and its two reads** into `apps/web/components/accounting/evidence-chooser.tsx` (`EvidenceChooser` + `useEvidenceReads`); **both** forms mount it, markup/ids/keys carried over. Threaded `sourceRefs` through `lib/work/api.ts` (omitted when absent) + the `source_conflict` 409 arm; the form gained the phase, the disabled Submit, the handler guard, the claimant read, retire-on-new-choice; the citation rides the draft. **The route needed no change** — `workRoutes.ts:735-751` already passes `p_source_refs`; proved end-to-end, so no route unit cell. | `periodic-adjustment-form.test.tsx` **18/18** (4 new cells). **Red measured**: removing the `sourceRefs` fold → 16/18; disabling the `source_conflict` arm → 17/18; both reverted. `journal-composer.test.tsx` **39/39** unchanged. World e2e **leg 6** (new): cited doc → `entry_evidence_links` + `source_document_id`; unfiled → 400 `sourceRefs[1]`/`not_filed`. Walk cell `t643 a CITED DOCUMENT…` (12/12). ARCHITECTURE §4 discloses it as AC3's entrance. |
| **STANDARDS SHOULD** — mock control endpoint claimed client scoping it did not do | Added `if (body?.client !== PA.clientId) return false;` (the sibling's shape); the walk's `control()` names the lane on every call; the ownership declaration now says which key scopes which handler. | `e2e/e2e-fixture-ownership.test.ts` **7/7**; walk **12/12** with the scoped endpoint driving every op. |
| **STANDARDS NOTE** — 11 `WorkCancel` lines re-encoded | Restored to main's exact bytes. | `git diff main -- apps/web/messages/en.json` → **119 insertions, 1 deletion**; the one deletion is #643's own Activity label line gaining a comma. |
| **STANDARDS NOTE** — checkout clock widening | **Left as disclosed.** Untouched. | `git diff main -- components/entry/checkout-faces-a11y.test.tsx` unchanged since `3e7f5306`. |
| **SPEC SHOULD** — §11 stale `189／189`, 8 files | Replaced with this round's measurement and the ten files named in full; also re-measured the 财务界面与输出 row. | `docs/ARCHITECTURE.md` §11 (commit `46440525`). |
| **MIGRATION S1** — posture ceremony half-done | §I (T.8) re-reads owner, `prosecdef`, `proconfig` and the **exact `proacl` text** (grantor included) for all **18** functions 0194 creates/recuts. Expected values measured live before writing. | Migration applied with the census in it → `183 total`; syntax + semantics pre-checked read-only on rig643. |
| **MIGRATION S2** — `adjustment_id` unconditional | `result` / `v_result` fold the key in only when `v_adjustment is not null` (the `||` `effects` already used). | New db cell **`pa.answer-shape`**: a `journal_entry` commit's answer, `accounting_work.result` **and** receipt `effects` carry **no** `adjustment_id` key; the PA lane still names its own. |
| **MIGRATION S3** — INSERTION 2 after `_reserve_op` | §F header now names it as an **exception to 0182's rule**, with the reason (must follow the echo wall at 5b, or a drifted echo mis-diagnoses as a relationship failure instead of `basis_mismatch`) and the measured cost (same transaction; a raise rolls the reservation back unspent). | `0194:§F` header, commit `ac1dd6e6`. |
| **MIGRATION S4** — single-column FKs | `entry_id`/`receipt_id` → composite `(…, firm_id, client_id)`; `source_document_id` → `(…, firm_id)` (the widest `clara.documents` has). §C.0 adds the additive `uq_operation_receipts_id_firm_client`. Tail asserts all three constraint defs verbatim. | Catalog read on rig643b: three composite FKs present as declared; receipts unique present. Neighbours unmoved (below). |
| **MIGRATION N2** — dead `posting_date` select | **Emitted** as `closing_stock_posted_on`. | `cs.gate.flips` asserts the key exists in **both** states (null with no marker, `fx.endsOn` with one). |
| **MIGRATION N3** — `settledCents` with no DB particular | Removed from `ADJUSTMENT_FIELDS` (no server refusal can name it) **and** labelled derived on the control; three money hints wired into `aria-describedby`. | `periodic-adjustment.test.ts` **15/15** incl. the new `adjustment.settled_cents → null` pin. |

## Verification (all local; rig643b 127.0.0.1:55447 / `clara_643`, 0001→0194 from scratch, 183 migrations; `$GATES` verbatim from `packages/db/package.json` "test")

| command | result |
|---|---|
| `node --test --test-concurrency=1 $GATES tests/periodic-adjustment.test.mjs tests/close-closing-stock-producer.test.mjs` | **23 / 0 fail / 0 skip** (19 + 4) |
| same, the ten neighbours (admission, post, journal-work-evidence, cancel, question, question-reads, x56-rest-h, er9-gates-boundaries, er9-close-lifecycle, operation-census) | **208 / 0 / 0** |
| `node scripts/migrate.mjs` | `0 new migration(s) applied · 183 total` |
| runtime `periodic-adjustment-unit` · `work-routes-unit` · `work-journal-db` (PG env) | **13/13** · **21/21** · **23/23** |
| `pnpm --filter @clara/runtime build`, `… exec bootstrap`, `RELAY_TEST_MODE=1 … node tests/periodic-adjustment-e2e.mjs` (`clara_rt_test`, template copy) | **PERIODIC ADJUSTMENT E2E: PASS**, legs 1–6 |
| `node --import ./test/bootstrap.mjs --import tsx --test components/accounting/periodic-adjustment-form.test.tsx` | **18/18** |
| `node scripts/run-tests.mjs` (whole apps/web suite) | **3413 / 3413 / 0 fail / 0 skip** |
| `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3190 … pnpm --filter @clara/web e2e periodic-adjustment` | **12 passed (1.2 m)** |
| `pnpm typecheck` · `pnpm lint` | **exit 0** · **exit 0** |

`rig643` was never reset; `CLARA_RIG_ALLOW_RESET` / `…_ROLE_SWEEP` were never set.

## Reds seen and their causes (named, all resolved or known)

1. **`643.draft: a round trip restores BOTH halves`** — a real red I caused: a `deepEqual` against a literal, and the draft gained `documentId`. Fixed at the fixture and extended with a second cell for the new field's rules.
2. **`t728: a document already spoken for renders DISABLED…`** (journal-composer) — appeared **only** in a suite run sharing the CPU with two other test processes, with React's own `act(…)` warning beside it; the file alone is 39/39 and the clean suite run is 0 fail. This is the load flake the work order names; **not fixed**.
3. **World e2e, first attempt** — `Graphile Worker: Failed task (workflow_flows) with error 'fetch failed'`, attempt 1 of 3, before any assertion. Machine-level transient; the immediate re-run passed all six legs. Named, not worked around.
4. **Walk, first attempt** — my new cell red on `toBeDisabled()`. Cause found, not silenced: `serve-built.mjs` dispatches `journal-work-mock` first and it drains the POST body, so this lane's uncached `readJson` saw `{}` and fell through, offering a spoken-for document as free. The lane mock now caches under `request.__e2eParsedBody` like every sibling.

`#707` / `#693` appeared in nothing I ran.

## Assumptions / not verified

- **Attribution line**: commits use `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` — WORK-ORDER.md rule 4 and every existing commit on this branch. My harness reminder names a different line; I kept the branch consistent and am flagging it rather than deciding silently.
- "Reuse the composer's evidence chooser" was read as **extract and mount**, because no shared component existed — a second copy would have been two places for the spoken-for, disabled-option and degradation rules to drift.
- **All hosted evidence** is unverified and written as pending in ARCHITECTURE. The whole db estate suite and the whole browser suite remain the orchestrator's/CI's.
