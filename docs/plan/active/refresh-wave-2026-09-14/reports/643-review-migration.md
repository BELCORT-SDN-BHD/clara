# #643 — adversarial migration-safety & accounting-integrity review

Target `clara-wt/643` @ `impl/643-periodic-adjustments`; rig `rig643` 127.0.0.1:55439 / `clara_643`
(0001–0187 + 0194, `clara.schema_migrations`). Rig never reset; no tracked file edited; scratch cell
file deleted (`git status --porcelain` → empty).

## BLOCKER

**None.** No pin breaks, no tenant leak, no one-effect hole, no frozen-body edit.

## Merge-order collision table (mandatory)

| lands before 0194 | recuts a 0194-pinned body? | alters `accounting_work`/`operation_receipts`? | pins 0194 touches? | verdict |
|---|---|---|---|---|
| 0188 (#615) | no | no | none | clean |
| 0189 (#641) | no | index only (`ix_accounting_work_firm_created`) | `save_my_preferences` (0179) | clean |
| 0190 (#620) | no | no | `get_document_for_human_read` v1 | clean |
| 0191 (#624) | no | no | none | clean |
| 0192 (#644) | no | no (FKs **to** it, from `knowledge_records`) | none | clean |
| 0193 (#640) | no | no (FKs **to** it) | the five 0045 `adjustment_*` doors | clean |

Command: `grep -nE "create (or replace )?function clara\.(_record_journal_entry_core|admit_journal_work|_close_gate_closing_stock|_tf_accounting_work_immutable|_journal_basis_digest)"` and
`grep -nE "alter table +clara\.(accounting_work|operation_receipts|journal_entries)"` over all six files → **no hits in any**.
0189:133-136 explicitly anticipates the widening ("an unknown purpose matches nothing and raises nothing"), and its result read is `w.result->>'entry_id'`/`'receipt_id'` only. 0193's tail probe reads `_plan_admit_occurrence`'s own prosrc, not `admit_journal_work`'s.
**0195 not measured — it does not exist**: `clara-wt/631` is currently sitting on 643's nine commits (`impl/631-work-egress-trace`, `git log main..HEAD`). 0195 must pin `_record_journal_entry_core` at **`bebee4e4f79f86102580a02d6316cc52de7d02c5cdfe47ae4c8df2677bb5761b`**.

## SAFE, with evidence

1. **Pins are exact.** sha256 of each pre-state body extracted from its own migration file reproduces 0194's literal, byte for byte: core `71825bb8…` (0184), `admit_journal_work` `15535149…` (0182), gate `b5daab9e…` (0056), trigger `2c4e2c9f…` (0184). Live prosrc shas after 0194 match the file's recut bodies exactly.
2. **Every delta is enumerated.** `diff -u` pre→recut: trigger = one array element + one comment; gate = `v_marker` row + six named keys − `no_producer_verb`; core = five marked insertions + widened purpose filter/receipt purpose + result keys, nothing removed; `_admit_accounting_work_core` vs 0182's `admit_journal_work` — every deletion is a widened column list, the purpose in `logical_op_id`, or the audit verb name. `admit_journal_work` is now a 5-line delegation; identity args unmoved (`p_client uuid, p_author uuid, p_intent_key text, p_basis jsonb, p_basis_origin text, p_source_refs jsonb, p_model text`).
3. **Frozen-body compatibility.** `loadWorkStep` (claraWork.v1.impl.ts:137-162) selects named columns, never `purpose`/`adjustment_basis`; `runRecordJournalEntryV2` reads the receipt as `Record<string, unknown>` and picks keys — no strict parse, so extra keys are inert. No workflow file or `frozen-workflows.json` in `git diff main...HEAD --name-only`.
4. **Deploy-onto-existing.** Probe `ALTER TABLE … ADD CONSTRAINT` (identical predicates) + drop, in one txn, over **843 live `accounting_work` / 192 `operation_receipts` rows** → validated. Both CHECK swaps are drop+add inside migrate.mjs's single `begin`.
5. **Posture census (live).** All 26 new/recut functions: owner `clara_fn_owner`, `SECURITY DEFINER`, `search_path=clara, pg_temp`; ACL `{clara_fn_owner}` except `admit_periodic_adjustment_work` (+`clara_runtime`) and `list_periodic_adjustments` (+`clara_authenticated`).
6. **14 adversarial cells, all pass** (scratch `zz-r643-adversarial.test.mjs`, since deleted): cross-firm admit both directions → CLR11 `client_not_found`; viewer → CLR04 `insufficient_role`; `list_periodic_adjustments` cross-firm → CLR11, raw RLS read → 0 rows; `insert/update/delete/truncate` as `clara_authenticated`/`clara_runtime`/`clara_wake_interactive`/`clara_agent_ro` → **42501 × 16**; `adjustment_basis`/`purpose`/`basis` UPDATE post-admission → CLR08 `accounting_work_immutable`; byte-identical + key-reordered + space-padded replay → `replayed:true`, three changed particulars that never move `basis_digest` → CLR10 `intent_payload_conflict`; **two concurrent commits of one logical op → 1 entry / 1 receipt / 1 adjustment row** (second `replayed:true`, same ids); period spanning two FYs and period past FY end → `scope_overbroad`; sealed FY → CLR19 at admission; gate `fail`→`pass` naming `closing_stock_adjustment_id`, `no_producer_verb` textually absent; retired filing between admit and commit → CLR13 `source_conflict`/`not_filed`; a world refusal at commit leaves `clara.op_receipts` rows = **0** and the same identity re-posts.
7. **Suites.** `node --test --test-concurrency=1 $GATES tests/periodic-adjustment.test.mjs tests/close-closing-stock-producer.test.mjs` → **22 pass / 0 fail / 0 skip**. Ten neighbours (admission, post, evidence, cancel, question, census, close-lifecycle) → **177 / 0 / 0**. `node scripts/migrate.mjs` → `0 new migration(s) applied · 183 total`. One new migration file, no merged migration touched.

## SHOULD

- **S1 — the ceremony is half-done.** §I re-reads prosrc, ACL and grants but never `proowner`, `prosecdef` or `proconfig` for any of the 26 objects. I measured all three correct live, so nothing is wrong today; the file simply cannot catch it itself. Add an owner/secdef/search_path loop to §I.
- **S2 — the journal lane's answer shape moved.** `result`/`v_result` now carry `'adjustment_id', v_adjustment` unconditionally, so a fresh `journal_entry` commit returns `"adjustment_id": null` while a **replayed pre-0194** one returns no such key (the stored `_finish_op` payload). Harmless for v2 and for 0189, but it is two shapes for one lane. Guard the key on `v_adjustment is not null`.
- **S3 — 0182's ordering rule has a named exception.** INSERTION 2 (`_assert_adjustment_relationships(..., false)`, payload-shaped) sits **after** `_reserve_op` because it must follow the echo wall at 5b. Measured harmless (adv.unspent: identity unspent on refusal). State it in the §F header, not only in the insertion comment, so the next recut does not "fix" it.
- **S4 — asymmetric FKs.** `entry_id`/`receipt_id`/`source_document_id` are single-column FKs while `work_id`/`client_id` use composite `(id, firm_id, client_id)`. Structurally a row could name another tenant's entry; unreachable because the core is the only writer.

## NOTE

- **N1** `clara.role_rank('nonsense')` → NULL, and `NULL < 1` is NULL, so a membership role outside the four known values would slip the bookkeeper floor. `firm_memberships_role_check` makes it unreachable, and the arm is 0182's verbatim — **not** a #643 regression.
- **N2** the recut gate selects `je.posting_date` into `v_marker` and never emits it.
- **N3** web `ADJUSTMENT_FIELDS` contains `settledCents`, which is no DB particular (worker follow-up 2) — no server refusal can ever name it.
- **N4** brief item (10) needed no code: `clara.list_entry_links` already projects `aw.purpose` generically, so 0194 correctly avoids a fifth, unpinned recut.
- **N5** a commit-time chart refusal on a periodic adjustment surfaces as `lines[N].account_code` (step 6) rather than `adjustment.inventory_account_code`; that path reaches the Work detail page, not the form, so `fieldForAdjustmentPath`'s null→form-level fallback is correct. Admission-time refusals do name the control.
