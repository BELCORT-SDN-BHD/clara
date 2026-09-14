# #631 — REVIEW FIX ROUND (0195 + `claraWork_v3`)

**Branch** `impl/631-work-egress-trace` · worktree `clara-wt\631` · **clean**, never pushed, no PR.
**HEAD `a1c07360`** on `b541b38b`: `ad7b1a0c` fix(db) · `90f8dbb0` fix(runtime) · `a6642876` test · `a1c07360` docs.
**Rig `rig631c` :55454/`clara_631`** — from-scratch 184-migration chain over the **LF** file, seeded (255 s); `clara_rt_test` a template copy. `rig631`/`rig631b` never reset; the reset/sweep flags never set.
**Red-first**: `clara_631_red`, a template copy of the reviewer's UNFIXED database, ran the new battery at **17 pass / 11 fail** — the failures being exactly the eleven new cells. Both scratch copies dropped.

## Finding → what I did → evidence

| finding | what I did | evidence |
|---|---|---|
| **N1** CRLF worktree vs LF blob | normalised 0195 **and the 27 other files left CRLF**; re-measured everything on an LF chain | `git ls-files --eol` → `w/lf`, **0** CRLF in the tree; file sha256 = checksum = `137708a1…`. **0194's pin re-derived from the LF 0194 file = `eca58b99c45b…3d4ade`, exactly the pin** (and the chain applied — the prestate raises CLR10 otherwise) |
| **S1** revoke = permanent kill switch | grant verb refuses `accounting_work` → CLR10 `purpose_derived_not_grantable`; new `restore_client_egress_purpose(client,purpose,op_key)`: owner floor, derived purpose only, **re-derives** the basis, mints a fresh pair (revoked row kept as history), audit + `egress.purpose_consent_restored` | `w631.grant.derived_refused`, `w631.restore.round_trip/.floor/.foreign/.basis`. **Red**: grant → `CLR28 evidence_mismatch`, restore → `42883` |
| **S3** viewer reads the table | REVOKEd the SELECT **and** its policy (FORCE RLS + no policy ⇒ a later accidental grant fails closed) | `w631.trace.no_table_read` (viewer, bookkeeper **and owner** → `42501`; viewer door → CLR04; bookkeeper door → rows with `model_id`), `631.trace.no_table_grant`. **Red**: the viewer's read SUCCEEDED |
| **S2** "no payload column" over-reached | (a) writer conforms **every** value; (b) §7B's five IMMUTABLE grammars as CHECKs **plus** typed CLR10 `invalid_trace` naming the field; claim corrected in the 0195 header, `work-trace.mjs`, §10, here | `w631.trace.grammar` + `631.trace.grammar_door` (8 literals × 10 fields refused **by field**, 0 rows, real values admitted), `631.trace.grammar_writer` (every planted call still LANDS, redacted, nothing stored), `631.conform`. **Red**: `capability_id/nric` SUCCEEDED |
| **S4** silent derived mint | prepare writes `audit_log` (`derive_client_egress_purpose`) + `egress.purpose_consent_derived`; both new event types registered on the active taxonomy | `w631.derive.audited`: audit **n→n+1**, **one** event naming acceptance, versions, client, owner; not repeated on the second dispatch |
| **S5** withdrawal not retroactive | rule stated in the header + §10 **and implemented** in the core's gate | `w631.write.withdrawn_after_consume`. **Red**: the post SUCCEEDED |
| **N2** trace blocks on the posting lock; settle row outside its txn | dropped the `accounting_work` FK; `settleWorkStepV3` wraps settle + trace in ONE transaction, insert in a SAVEPOINT | `w631.trace.no_lock_wait`: insert completed in **30 ms** under a held `for update`. **Red**: `57014 statement timeout` (review measured 4001 ms) |
| **N3** prune logs nothing | `trace_prune_log` gains `relation` (history defaults `trace_spans`); the sweep appends | `w631.trace.prune_logged`, `631.trace.prune`. **Red**: `column "relation" does not exist` |
| Standards **SHOULD** | hash-lock ruling in §10, the 0195 header and **both** module headers | `a1c07360`, `90f8dbb0` |
| Standards **NOTE** | dropped the unused `"public"` data class | `631.registry` asserts `DATA_CLASSES` == the classes the table uses |
| #643's `periodic-adjustment-basis.ts` | **untouched** | `check-parts-parity.mjs` still REFUSES at `:73` |

## The two rules

- **S5** — *authority must be live at the moment the books move*: a consumed authorization whose consent was revoked (or activation deactivated) after the consume no longer authorises the write (CLR13, identity unspent, committed-replay still skipped) — two joins in the recut core, not an invalidation of the consumed row, which 0020's `ck_…_one_terminal` makes unrepresentable.
- **N2** — *a diagnostic never queues behind an accounting lock, and the settle row is part of the settle*: no FK to `clara.accounting_work` (the writer's positive task→work join is the binding), and `settle_work_run` + its trace row commit together with the insert behind a SAVEPOINT.

## Final LF sha256 (installed `prosrc`; the file text re-derives each identically)

```
7f7fecbb61560d4ad97cda07806f9843a74365068fb6951ce551759d0ec0c013  _record_journal_entry_core
f051fe1ff8cacfe15e570b668413e43d41e562b78f0f99524d03bf0889dcb3a9  prepare_egress_dispatch
9801ab7107805cdef673de82bebc5191734d995d3c0c274da31dccf429b8e012  grant_client_egress_purpose
b2657c488c3412fd42d8495e71b41530dd542dc7cf9cf84417546a04df473cca  activate_client_egress_purpose
6463184d56f8ed33caf5d6201d8959c93cf36c40bbb226176e86f73d82f4499c  deactivate_client_egress_purpose
86473b60b8a15043afbe43e0fa89fa2703ece61e08110ce8f70ea1f28710b54d  revoke_client_egress_purpose
97e3f3ee783bb18374d5f8efb51fe14569a9ea2ad16e601058a52a65731f1cba  restore_client_egress_purpose
53f690091c24bb82ec529d5cb818647374d0181ed609777155d2f9eae87596a0  _accounting_work_egress_live
04d66cf7b97cda469edfed6534eec2a4a7d171e7604bb1ec1242e9fe2c212d20  _work_egress_event_seq
6db55fcdcf6b683c1b295fedee3aba06e3c2ab40aafdf413fbc1bf9c9422f25c  prepare_work_egress_dispatch
2e243c4bf80577983e43df3c47e7904dc8f112cdc8ba475bf9cd041142d4fe78  record_work_execution_trace
057a5d9a1c2a3688883241db83fbff859e7d4be25c33353342326592466567c0  get_work_execution_trace
b7c9a04b594204327d3c7c13e982b19a289bb0beb9f28f540895bf508df5fa21  prune_work_execution_traces
c14f29e8654bb646fcd79f311b9052b0312c11b5c7e5b466e910cbbde2506754  _tf_work_execution_trace_append_only
109a8b0d4e3a8ecce86793df08f89189661ecda5599c78a596eadf2f20e3ba4b  _work_trace_secret_shaped
cca9a1ef0664fdbe1f4e7f370f49e6f334306fcc3d46904339e6047e8cf9a9a9  _work_trace_text_ok
9e14d1ead1c7bc34576dc47955c36cd7307f9ea8bca807d2292e78fbc08ed36f  _work_trace_skills_ok
8ec5451e051e9af6cf4c69a13c65519f342b981b2dfd07aefcf07d32f85b85fc  _work_trace_revisions_ok
2f85dfc89f1c9687cea72cc0dd97fa4e581b4b9a8bb0770c586d435930ce661b  _work_trace_refusal_ok
f461ceb0d8e7f59e5a9753170c5fb17831ff6e3dbb3f57906e14653044592ba3  consume_egress_dispatch (UNMOVED = the pin)
```

## Runs (LOCAL, Node 22.23.2, on rig631c)

- db, **12 files** (the 9 named + `f-a7-gamma-egress`, `wave-a-egress`, `f-a3-pr1c-egress-bank-matching`), verbatim gate flags: **258 / 0 / 0**.
- runtime unit `work-trace-redaction` (21), `work-bundle`, `work-journal-db`, `work-routes-unit`: **81 / 0 / 0**.
- `check-frozen-workflows` **OK** (273); `--compare-base origin/main` **OK** (264 unchanged, 9 additions); `check-workflow-bundle` **OK**; `check-parts-parity` **REFUSED (#643's)**.
- World e2es: `work-egress` **PASS (3 legs)**, `work-journal`, `work-cancel`, `periodic-adjustment` **PASS**.
- Diagnostics web units **24 / 0 / 0**; `e2e journal-work` (3200/3201/3202) **19 passed (1.9 m)**.
- Whole apps/web suite **3431 / 3430 / 1 / 0** — the fail is `thread-live-clarify.test.tsx` (`timed out waiting for the one answer control`, `ENVIRONMENT_FALLBACK` from `use-intl`), a load flake in an untouched file; **re-run alone → 2/2**.
- `pnpm typecheck` **0**; `pnpm lint` **0**; `migrate.mjs` re-run **0 new, 184 total**.

## Docs

ARCHITECTURE §10 (three-layer trace claim; reversible withdrawal; the retroactive rule; no-privilege / no-FK / settle-txn / prune-log; a hash-lock ruling) and the §11 rows **Agent 与宿主** / **准入与运行保障**; CONTEXT *Purpose authorisation*, *Execution trace*. Hosted claims pending.

## Assumptions, deviations, follow-ups

- **The closed refusal shape is FIVE keys, not three**: the estate's own payloads carry `message` and `recoverable` too. Still closed — an unknown key is refused (door) or dropped (writer).
- **`run_id` is the one field the writer does not rewrite** (the WDK's id, half the `(work,run,seq)` replay identity); its grammar is enforced at the door.
- **The `chatTurn_v1` census waiver cannot retire here — v19 owns it.** The only caller of the bare `clara.get_journal_entry` left is `chatTurn.impl.ts:112`, `@frozen`/`deployed:true`. v19 must switch it to `get_journal_entry_for` **and** delete `operation-census-waivers.mjs:57-81` in the same change, or `waivers_unused == []` reds. Do not close #631 as "waiver retired".
- New follow-ups: `deactivate_client_egress_purpose` has no restore door; making a withdrawal reach the authorization ROW needs a recut of 0020's one-terminal CHECK.
- **Unverified**: all hosted evidence; the db estate and browser suites (orchestrator/CI); the provider-eval lane still runs only in its skip modes.
