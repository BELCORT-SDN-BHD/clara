# #631 — CLOSURE RE-CHECK of the fix round (`a1c07360`)

`impl/631-work-egress-trace` @ `a1c07360` (base `46440525`). Rig `rig631c` :55454/`clara_631` (184 migrations,
LF chain) + World `clara_rt_test`. Read-only: worktree left **clean**, all probes ran from the scratchpad by
file-URL import of the repo's own fixtures; no scratch database created.

| item | verdict | what I measured |
|---|---|---|
| **S1** way back on | **CLOSED** | revoke → prepare `{"verdict":"unknown"}`; `grant(…,'accounting_work',…)` → **CLR10 `purpose_derived_not_grantable`** (raised before `_reserve_op` and before the evidence check, so no 23514 is reachable); owner `restore` → `status:"live"`, audit **0→1**, **one** `egress.purpose_consent_restored` naming consent/activation/`restored_over`/acceptance/terms 1/dpa 2; next dispatch **granted**; revoked consent kept (2 rows, first `revoked_at` set); op_key replay → identical `consent_id`, still 2 rows; admin **CLR04**, bookkeeper **CLR04**; foreign client and a random uuid → **CLR11 with byte-identical message and detail**; `restore('document_processing')` → CLR10 `purpose_not_restorable`. |
| **S3** trace-table read | **CLOSED** | direct `select` as viewer, bookkeeper **and owner** → **42501**; door viewer → CLR04, bookkeeper → rows incl. `model_id`; `pg_policies` = **one** policy, `{clara_fn_owner}`; `relrowsecurity` **and** `relforcerowsecurity` true; `role_table_grants` holds only `clara_fn_owner`; `clara_runtime` direct INSERT/UPDATE/DELETE/SELECT/TRUNCATE → **42501** ×5, row intact. |
| **S2** claim corrected | **CLOSED** | **12 field slots × 8 literals (NRIC, grouped bank run, email, MY phone, JWT, `Bearer`+`sk-ant-…`, DSN-with-password, `sk_live_…`) = 96 calls, every one CLR10 `invalid_trace` naming the field; 0 rows written.** Real values still admitted; unknown refusal key → `grammar_refusal`; all five estate keys admitted. Through `lib/work-trace.mjs`: all 8 planted calls **land**, and scanning **every column of every stored row** finds **none** of the 8 literals (ids/model/purpose dropped to null, refusal masked `[redacted:nric]`, unknown key dropped). `REFUSAL_KEYS` = the five. Claim text now reads "**NO FREE PAYLOAD COLUMN; BOUNDED, FORMAT-CHECKED FIELDS; BEST-EFFORT REDACTION AT THE WRITER**" (0195 header), the same three layers in ARCHITECTURE §10 and in `work-trace.mjs:3-30`. |
| **S4** derived mint audited | **CLOSED** | first `prepare_work_egress_dispatch` → **one** `audit_log` row `fn=derive_client_egress_purpose` (actor = owner) and **one** `egress.purpose_consent_derived` naming `legal_acceptance_id`, `terms_acceptance_id`, versions 1/2, client, owner; second dispatch grants and writes **neither**. |
| **S5** live-at-write | **CLOSED** | consume → revoke → post = **CLR13 `egress_not_authorized`**, 0 entries, 0 receipts, authorization still `consumed/not-invalidated`; same for a **deactivated** activation through the owner door; restore → settle → Retry **posts**. consume → post → revoke → replay returns the **original** receipt (`replayed:true`), still 1 entry / 1 receipt. |
| **N2** lock + settle txn | **CLOSED** | trace insert under a held `for update` on the Work: **24 ms** (was 4001 ms + 57014); catalog FKs = clients, firms, operation_receipts, agent_tasks — **none to `accounting_work`**; unknown task → CLR11; a firm-A task naming firm-B's Work is **unrepresentable** (`agent_tasks` trigger refuses "firm/client-congruent work id"), and `ck_agent_tasks_work_id_kind` makes a non-`accounting_work` task carrying a Work impossible; a CLR10-refused settle trace inside the settle transaction leaves the task **`failed`** — the SAVEPOINT holds (source `claraWork.v3.impl.ts:626-655` + World leg A's settle row). |
| **N3** prune logged | **CLOSED** | prune → `traces_deleted 15`, **one** new `trace_prune_log` row `relation='work_execution_traces'`, table empty; 0006's rows unchanged and the column default is still `'trace_spans'`. |
| **N1 / pins** | **CLOSED** | `git ls-files --eol` → `w/lf`, **0** CRLF in the whole tree, file sha `137708a1…`; 0194 core body re-hashed from the LF file = **`eca58b99…d4ade`** = 0195's pin; installed `_record_journal_entry_core` = **`7f7fecbb…`**, `record_work_execution_trace` = `2e243c4b…`, `restore_client_egress_purpose` = `97e3f3ee…` (all three re-derive identically from the 0195 file text); `consume_egress_dispatch` = **`f461ceb0…` unmoved**; `migrate.mjs` → **0 new, 184 total**. |
| **Frozen law** | **CLOSED** | `check-frozen-workflows` **OK (273)**; `--compare-base origin/main` **OK — 264 existing entries same hash and deployed flag, 9 additions, 0 changed**; none of the 9 carries `deployed`; diff vs `46440525` = 7 new `claraWork.v3.*` files + `registry.ts` repoint (not a frozen entry) + additive manifest. Hash-lock ruling present in ARCHITECTURE §10 and in **both** module headers. |
| **Runs** | **CLOSED** | db, verbatim gate flags: `work-egress-authority` **28**, `f-a7-gamma-egress` **21**, `wave-a-egress` **13**, `f-a3-pr1c-egress-bank-matching` **7**, `work-journal-post` **32** = **101 / 0 fail / 0 skip**. runtime `work-trace-redaction` **21**, `work-bundle` **16** = **37 / 0 / 0**. `work-egress-e2e` on the real World: **PASS (3 legs)**. |

## New findings

- **NOTE — a numeric `observed_revisions` value is unbounded at BOTH layers.** `_work_trace_revisions_ok`
  admits `jsonb_typeof = 'number'` with no digit test, and `traceRevisionOf` returns any finite number, so
  `{"books_version": 5141882293107742}` (a 16-digit account run) is stored verbatim by the door **and** by
  `lib/work-trace.mjs`, and reads back through the human door. Narrow and unreachable from the shipping
  closure — `claraWork.v3.impl.ts:474` only ever sends `observedRevisions({basis_digest:null})`, and only
  `clara_runtime` can call the writer — but it is the one channel S2's layer-2 sweep did not close. A later
  migration can bound it without a runtime cutover, exactly as the header says.
- **NOTE — the `run` grammar has no long-digit clause.** `run-5141882293107742` is admitted at the door and
  by the writer (`traceRunOf` passes `digits:false`). Deliberate and documented (`run_id` is the WDK's
  `getWorkflowMetadata().workflowRunId`, machine-minted, half the `(work,run,seq)` replay identity), but the
  claim "`model_id` and `run_id` to their own bounded grammars" is bounded in length, not in shape.
- **B1 re-confirmed, still not #631's.** `check-parts-parity.mjs` → `REFUSED — unclassifiable object spread at
  packages/runtime/lib/periodic-adjustment-basis.ts:73`, unchanged, inherited from #643 at #631's base.

## Verdict

**MERGEABLE** — every S1–S5 and N1–N3 finding is closed on measured evidence; the two new notes are residual
grammar narrowings for a later migration, not blockers, and B1 belongs to #643. *The owner's confirmation of
the activation assumption is explicitly **not** a blocker.*
