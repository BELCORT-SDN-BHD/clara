# #631 — adversarial migration-safety / egress-authority / leak review of 0195

`impl/631-work-egress-trace` @ `b541b38b`, base `46440525`. Rig `rig631b` :55450/`clara_631` (184 migrations, 0195 applied). Worktree left clean; all probes were untracked files under `packages/db/tests/`, deleted.

## BLOCKER

**B1 — `check-parts-parity.mjs` exits 1; CI's `build` job (ci.yml:193) reds. NOT #631's.** `REFUSED — unclassifiable object spread at packages/runtime/lib/periodic-adjustment-basis.ts:73`. `git show 46440525:…` has `...sharedShape`; `git show origin/main:…` → absent. It arrives with **#643** and already fails at #631's base. #631 inherits it. **No blocker inside #631's own diff.**

## SHOULD

**S1 — an owner's `revoke_client_egress_purpose('accounting_work')` is an irreversible per-client kill switch.** Prepare never re-mints (`{"verdict":"unknown"}`), and the only restore door can *never* succeed: `grant_client_egress_purpose(cli,'accounting_work',<bytes-verified consent_evidence doc>,…)` → **`23514 ck_client_egress_purpose_consents_evidence`** (raw constraint violation, not a typed CLR). Same call with `document_processing`, same doc → `{"status":"live"}`. §4 widened the grant allowlist to a purpose §3's CHECK guarantees it can never insert. Recovery = a new migration or a root UPDATE. Fix: refuse it in the grant verb with a typed CLR10 *and* add a restore door.

**S2 — "no payload column" is not a structural guarantee.** One `record_work_execution_trace` call as `clara_runtime` stored NRIC, bank run, email, MY phone, JWT, a bearer token shaped like a live provider key and a database DSN carrying a password verbatim in `refusal` (free jsonb), `skills` (free jsonb, **not** redacted — `work-trace.mjs:196`), an `observed_revisions` *value*, and seven unconstrained id columns — all readable via `get_work_execution_trace`. The only wall is the frozen runtime's best-effort `redactDeep`: the `trace_spans.attributes` posture the header criticises. Tail T.6 checks column *names* only. Correct the claim (0195 header, `work-trace.mjs:1-18`, ARCHITECTURE §10, `631-final.md`) or constrain those columns.

**S3 — the bookkeeper floor is bypassable.** As viewer `carol`: door → `CLR04`; `select … from clara.work_execution_traces where work_id=…` → **1 row with `model_id` and the full `refusal`**. §13's `grant select … to clara_authenticated` plus `PGRST_DB_SCHEMAS=clara` (`run-live-walk.mjs:184`) makes it a live REST endpoint. Firm scope holds (dave/erin → 0 rows). Siblings withhold this grant (`trace_spans`, `egress_dispatch_authorizations`, `op_receipts`). The DEFINER door does not need it: with the grant revoked, the db (154) and runtime (33) batteries still passed.

**S4 — the derived consent is minted silently and mis-attributed.** Prepare inserts a consent with `granted_by = <owner uuid>`, **no** `audit_log` row (40→40) and **no** domain event; the revoke emits `egress.purpose_consent_revoked`.

**S5 — withdrawal is not retroactive to a spent dispatch.** consume → revoke → post **succeeds** (`posted:true`, 1 entry): revoke invalidates only unconsumed rows, the consumed one keeps `invalidated_at=null`. Defensible, but state it.

## NOTE

**N1 — CRLF.** 0195 in the worktree is CRLF, the committed blob LF (`git ls-files --eol`: `i/lf w/crlf`; 0194 `w/lf`). rig631b installed the core as `395f399a…`; a clean checkout installs `bc68a022…`. `migrationChecksum` normalises (`migrate.mjs:91`), re-run = 0 new — but no evidence was taken against the bytes that ship, and future pins must use the LF sha.

**N2 — the trace writer serialises against the posting lock.** Txn A `… for update` on the Work; connection B `record_work_execution_trace` → **blocked 4001 ms, `57014`** (composite FK takes `FOR KEY SHARE`, which conflicts with `FOR UPDATE`). `withRuntime` is autocommit, 30 s cap, `traceSafely` swallows ⇒ silent trace loss under a slow posting txn. The settle trace is also *not* inside the settle transaction, contrary to the header.

**N3 — prune.** `prune_work_execution_traces('2999-01-01',100000)` as `clara_runtime` → `traces_deleted: 22`, table emptied. Same exposure as `prune_trace_spans`, but 0006 writes `trace_prune_log` and 0195 logs nothing.

**N4** — §4 claims the verbs were carried through byte-verbatim; four 0123 comments were dropped. Comment-stripped diffs show the allowlist only — behaviour identical.

**N5** — negative payloads byte-identical; latencies 2.2–4.9 ms vs 6.6 ms granted. Weak, within noise.

**N6** — 0195 + a v2 image refuses every Work, and a v2 rollback under 0195 too. Ship together (`registry.ts:156-176`).

## SAFE, with evidence

- **Pins.** sha256 of the merged 0194 core (LF) = `eca58b99c45b…3d4ade`, the file's pin exactly. All five 0123 prestate pins recomputed and matched (`bc270350…`, `653a9d35…`, `071c2e43…`, `c3054920…`, `d41c649b…`).
- **`consume_egress_dispatch` byte-unmoved**: installed prosrc `f461ceb0d8e7…4592ba3` = prestate + tail T.4; never re-created.
- **Core delta = the #631 insertion only** — one hunk, after `client_inactive`, before the canonical basis and `_reserve_op`.
- **Run binding.** Run B with run A's consumed authorization → `CLR13 egress_not_authorized`, 0 entries. A forged `event_seq` mints *and* consumes but is refused at the write (the core re-derives it). Run A's own posts.
- **No oracle.** Foreign / absent client, doc-sha supplied, inactive client, revoked purpose, second consume, TTL-expired → byte-identical `{"verdict":"unknown","authorization_id":null}`.
- **Committed-receipt skip is replay-only.** Unauthorised replay returns the ORIGINAL receipt (`replayed:true`, 1 entry/1 receipt); a changed basis → `operation_payload_conflict`. One `logical_op_id` per Work, so no second entry is reachable.
- **Trace refusals, zero rows.** OOV key / bad digest / unknown phase → `CLR10 invalid_trace`; foreign or non-`accounting_work` task → `CLR11 work_not_found`.
- **Belts.** UPDATE/DELETE/TRUNCATE → `42501` for all app roles; `CLR08 work_execution_trace_immutable` for `clara_fn_owner` **and** `postgres`.
- **Firm scope.** Cross-firm door → `CLR11`; cross-firm table read → 0 rows.
- **`input_digest` hashes the redacted form** (`work-trace.mjs:122-128`).
- **Frozen law.** `check-frozen-workflows.mjs` OK (273, append-only vs origin/main); the workflows/manifest diff is new `claraWork.v3.*` + 9 additive entries, **none deploy-locked**, no existing entry changed; `registry.ts` repoints to v3, v1/v2 exported. `buildClaraWorkToolsV3` is a fixed three-tool literal with no basis/wiki/Knowledge path; 4 × `.strict()`.
- **Runs.** db battery with the verbatim `packages/db/package.json` gate flags over 6 files → **154 / 0 fail / 0 skip**. Runtime `work-trace-redaction` + `work-bundle` → **33 / 0 / 0**. `migrate.mjs` → **0 new, 184 total**.

## Merge order — 0195 last, after 0188–0194 (scanned `clara-wt/integration2`)

| File | Objects 0195 recuts/alters | Verdict |
|---|---|---|
| 0188 operator_support_console | none | no collision |
| 0189 work_list_reads | `list_accounting_work` etc. — reads only, no ALTER | no collision |
| 0190 document_byte_door_v2 | none | no collision |
| 0191 document_capability_registry | only `document_processing_tasks` (name adjacency) | no collision |
| 0192 client_knowledge_records | none | no collision |
| 0193 accounting_plans | `_record_journal_entry_core` in **comments only** (:214, :919) | no collision |
| 0194 periodic_adjustments | **recuts the core** — 0195 pins its merged body | pinned, verified |

Object-name intersection of every `create [or replace] function` / `create table` / `alter table` in 0188–0193 against 0195's 18 objects: **empty**. Neither the three purpose CHECKs, the doc-sha CHECK, `prepare`/`consume_egress_dispatch`, the four owner verbs nor the legal relations is touched by 0191–0193, so 0194-then-0191–0193-then-0195 preserves every pin.

## The activation assumption, for the owner

Clara's model will be let onto a client's books on nothing more than one active owner having accepted the current Terms and DPA plus the client being active — no per-client switch, so publishing a new legal version silently stops every firm's AI until someone re-accepts, and onboarding a client silently starts it. The one manual control, an owner's withdrawal, is **permanent** — as built there is no way back on (S1) — and the consent it withdraws was minted in that owner's name with no audit trail (S4).

## Verdict

**MERGEABLE** — no blocker inside #631's own diff; B1 is #643's and must be fixed for the wave. S1 and S3 want a small follow-up migration before the hosted release; S2/S4/S5 are claim corrections. *Owner confirmation of the activation assumption is explicitly **not** a blocker.*
