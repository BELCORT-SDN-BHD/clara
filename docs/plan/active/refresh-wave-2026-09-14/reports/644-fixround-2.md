# #644 fix round 2 — final report

Branch `impl/644-knowledge-records`, worktree `clara-wt/644`. **Clean.** New this session, on top of
`1b727fa6`:

```
041b5362 fix(db): #644 — the knowledge pack names its tenant, both reads carry the legacy facts, and no floor leaks an existence oracle
73f20bcd test(db): #644 — red-first cells for the below-floor existence oracle, the pack's tenant binding and the legacy union
e60fd3ad fix(runtime): #644 — readKnowledgePack names the tenant it reads, by NAME
```

**Rigs.** `rig644b` (55444, the committed 0192) was the *before* oracle — query-only, never reset.
`rig644c` (55451) was provisioned from the EDITED file: `migrate: 183 new migration(s) applied · 183
total` in 195 s, so 0192's §I tail passed at apply time.

## Item → what I did → evidence

| Item | What I did | Evidence (cell + output) |
|---|---|---|
| **SHOULD-1** existence oracle below the floor | The lane, its floor and its tenant are settled **before** any plan lookup; the plan is then fetched INSIDE the proved firm (`op.firm_id = v_firm`), so absent and foreign are one answer by construction — and no foreign row is locked. `_human_ctx(admin)` unchanged, so kp.11's in-firm CLR04 survives. | `kp.13` — RED on rig644b: `expected SQLSTATE CLR04 but got CLR11 — onboarding plan not found`; green on rig644c. Also pins admin arms CLR11/CLR11, machine arms CLR11/CLR11, 0 rows in both firms |
| **SHOULD-2** pack had no tenant binding | Bound exactly as the promotion door: machine lane **requires** `p_firm` (CLR10 `pack_firm_required`), client looked up inside it (CLR11 absent *and* foreign); human lane takes the session firm at the viewer floor, supplied `p_firm` must agree; neither lane ⇒ CLR03 `no_pack_context`. ACL **unchanged** (`clara_runtime`-ONLY, measured). | `kn.26` (5 arms) — RED: `expected SQLSTATE CLR10 but the call SUCCEEDED (no error)`; green. `kn.18` re-pins `human_pack=false` at the new signature; §I tail asserts the body carries the check |
| **Worker (f)** pack omitted the governing legacy facts | Both reads now take the union from ONE expression, `clara._knowledge_legacy_rows` (§D.8) — `legacy_client_fact`, `authoritative:true`, `editable:false`, `knowledge_version` null. It never reads `knowledge_records`, so no-shadow is structural. | `kn.27` — RED: `expected: 2, actual: 1`; green. Pins legacy value `services` beside record `mixed`, register≡pack row-for-row, and the watermark **unmoved** by a new legacy fact |

**New signature** (measured from `pg_get_function_arguments`):
`clara.get_knowledge_pack(p_client uuid, p_purpose text, p_firm uuid DEFAULT NULL::uuid)` — STABLE
SECURITY DEFINER, `search_path`/`plan_cache_mode` pinned, PUBLIC revoked, EXECUTE to `clara_runtime`
only. `clara._knowledge_legacy_rows(p_firm uuid, p_client uuid)` is ungranted.

Header restated (decision 1 + a new decision 6 on naming the tenant, ordering included); the
`item_key → knowledge_key` table at §A.3 is untouched. New §I tail assertions: the pack's binding
markers, a **POSITION** comparison proving `_human_ctx` precedes `from clara.onboarding_plans op`,
and both reads calling the one legacy expression.

`packages/runtime/lib/knowledge.mjs`: `readKnowledgePack(sql, {clientId, purpose, firmId})` passes
the binding with **named** args (the door gained a defaulted parameter). No local firm guard — the
door decides authority; an unbound read is `unavailable/refused/CLR10/pack_firm_required`,
`records: []`. Never throws, never null.

## Verification (local only; **no hosted evidence**)

DB, exact gate flags from `packages/db/package.json` "test": `knowledge-records` +
`knowledge-onboarding-promotion` + `x55-client-facts-trio` + `x55-client-facts-door` +
`name-only-guard` + `web-reads-and-doors` + `operation-census` → **107 tests · 107 pass · 0 fail ·
0 skipped** (23.5 s). The two knowledge batteries alone **40/40, 0 skipped**.
`node scripts/migrate.mjs` re-run → **0 new migration(s) applied · 183 total**.
`packages/runtime/tests/knowledge-lib.test.mjs` → **16/16**. `pnpm typecheck` green, `pnpm lint`
green (exit 0). **apps/web untouched** (`git diff --stat 1b727fa6..HEAD` names only db + runtime),
so its suite was not re-run.

**Assumption.** The pack's human arm holds no EXECUTE today (§H keeps it `clara_runtime`-ONLY and
kn.18 pins that), so kn.26 exercises it through a claims-carrying session — the body is what is
under test. I did not widen the grant.
