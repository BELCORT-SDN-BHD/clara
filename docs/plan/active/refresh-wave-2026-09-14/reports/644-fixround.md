# #644 fix round — final report

Branch `impl/644-knowledge-records`, worktree `C:\Users\zhant\Desktop\clara-wt\644`. Clean.
New this session; `223374e3 · 87391a3a · 78b95335 · 05f8c056` predate it.

```
1b727fa6 fix(web): #644 — which row is in force; a legacy pair is not a conflict
cbf4faed test(db): #644 — red-first cells for the tenant binding and the S-items
8b3ad71b fix(db): #644 — the machine lane names its tenant; no legacy fact is hidden
```

**Rig.** rig644 already held the partial fix (the brief's assumption failed), so it was the *before*
oracle, never reset. **rig644b** was rebuilt from the **committed** file: `migrate: 183 new
migration(s) applied · 183 total` — 0192's tail passed at apply time.

## Finding → what I did → evidence

| Finding | What I did | Evidence (cell + output) |
|---|---|---|
| **B1** claims-less session takes the machine lane | *(kept)* lane picked from the **role** (`current_setting('role')`, `session_user`), never a null `jwt_sub()`; neither ⇒ CLR03. Not `pg_has_role` — the rig is `postgres`. | `ok 11 - kp.11 a claims-less or malformed-claims clara_authenticated session CANNOT reach the machine lane` |
| **B1 second half, open when I started** — the machine arm still took its tenant from the plan id alone | `p_firm` **required** there (CLR10 `promotion_firm_required`); mismatch ⇒ CLR11. Human lane keeps its session firm; a supplied `p_firm` must agree. Not in the op hash. Null `committed_by` ⇒ CLR10. | `kp.12 the MACHINE lane cannot promote without an explicit firm binding, and a wrong one is CLR11` — RED `not ok 12 … expected SQLSTATE CLR10 but the call SUCCEEDED (no error)`, then `ok 12` |
| **B2** legacy keys got lower floors | *(kept, pinned)* `knowledge_keys.min_role` carries each legacy floor (admin+ ×5, **owner** for `customer_identity_policy`, 0063:156); `_knowledge_floor` takes the higher. | `ok 22 - kn.22 a carried legacy key keeps its LEGACY floor…` + 3 tail assertions |
| **B2 second half, only partly closed** — shadowing hid the armed legacy row | The partial fix exempted only authority-bearing keys, but **all five** are still read from `clara.client_facts` (0055:765, 0056:1283, 0062:226, 0121:4797) and 0192 does not dual-write. So **no** legacy row is shadowed; each carries `authoritative:true`, gets an in-force banner, and is **not** the conflict face. | `kn.17` / `kn.23 NO legacy fact is shadowed…` / `kd.07 a LEGACY fact is never hidden…` — RED `not ok 17/23 … expected: 2, actual: 1` and `not ok 1 - kd.07 … AssertionError`, then `ok 29`, `ok 35`, `ok 5` |
| **Shadow-by-applicability** | *(kept, pinned)* both reads shadow on key **and** `applies_when_digest`. | `ok 31 - kn.19 a client row scoped to ONE condition shadows only the firm row with the SAME condition` |
| **S1** `jsonb_pretty(…)::bytea` throws | *(kept)* `sha256(convert_to(…,'UTF8'))`; STABLE ⇒ no generated column, so a plain NOT NULL column stamped by the BEFORE INSERT trigger. | `ok 32 - kn.20 a QUOTED/escaped applies_when stores and digests…` |
| **S2** watermark went backwards | *(kept)* `max(knowledge_version)` over every revision in scope, not the emitted rows. | `ok 33 - kn.21 the watermark is TEXT and never moves backwards on a withdrawal` |
| **S3** version as a JSON number | *(kept, extended)* `::text` everywhere incl. `_knowledge_row_json`; I added a **per-row** assertion across pack, register, history. | kn.21 `rowVersions.every(x => x === "string")`; kp.02 `"0"` |

**My own findings.** (a) The promotion door does not re-floor per key — defensible while its
authority is the promoter (admin+, or `commit_client_onboarding`, admin+ at 0017:2760); new tail
assertion that no mapped key exceeds admin (live `0`). (b) RLS was asserted only as forced+count;
added catalog checks — `_human → (firm_id = clara.jwt_firm())`, `_agent → wake_firm()`
(`_runtime → true` is the estate idiom, 0005:377). (c) Zero app-role DML (live `0`), four relations
forced, legacy UNION read-only, source FKs linked not copied — unchanged. (d) "Three belts"
over-claimed: three for a `policy` row, two otherwise (`ok 16 - kn.04`); header corrected.
(e) Three INVOKER helpers with unpinned `search_path`: no change (PUBLIC-revoked; every caller a
pinned definer). (f) `get_knowledge_pack` omits the legacy rows that still govern — follow-up.

## `item_key → knowledge_key` (owner ratification — verbatim from `clara.knowledge_plan_item_map`)

| item_key | knowledge_key | | item_key | knowledge_key |
|---|---|---|---|---|
| `entity_type` | `entity_type` | | `sst_regime` | `sst_regime` |
| `msic` | `msic` | | `mpers_eligibility` | `mpers_eligibility` |
| `turnover` | `turnover_band` | | `framework` | `reporting_framework` |
| `fye` | `financial_year_end_month` | | `accounting_basis` | `accounting_basis` |
| `currency` | `default_currency` | | `coa_seed_decision` | `coa_seed_decision` |

`reporting_framework` and `accounting_basis` are the two **policy**, authority-bearing keys, and a
policy item answered below admin+ is withheld by name (kp.06); `entity_type`/`msic` carry the admin
floor, the rest bookkeeper. Absent by design (0192 §A.3 lists each): nine identity keys (#647's) and
seven workflow todos / commit gates.

## Deferrals (restated, unchanged)

No reassessment consumer for `knowledge.corrected`/`withdrawn` — both stay `context_update` until
#631's trace and #658/#663 can say which Work is affected. A material conflict gets the C13 conflict
face only; the shared Work question is the v19/v3 lane's. A6 **firm-scope** promotion has a door, no
caller (#648's). "Resume setup from missing applicable facts" is #648/#649's.

## Verification (local only; **no hosted evidence**)

**DB** (rig644b from the committed file, gate flags verbatim from `packages/db/package.json`
"test"): the two knowledge batteries + operation-census + rig-isolation + the x55/legacy and
web-reads batteries → **129 tests, 128 pass, 0 fail, 1 skipped** (rig-isolation T19, destructive,
skipped by instruction). The knowledge batteries alone **37/37, 0 skipped**. **Runtime**
`knowledge-lib.test.mjs` **13/13**. **Touched web units**: `knowledge-detail` **7/7**;
`onboarding/api` + `command/routes` **29/29**. **Whole apps/web suite**: **3383 tests, 3381 pass,
2 fail, 0 skipped** (338 s) — `thread-live-clarify` and `checkout-faces-a11y`, real-timer load
flakes untouched by this branch, named by #615 and named here, not fixed (the first alone 3/3, the
pair 27/27 twice, the second fails on **main** too). #707/#693 absent. **typecheck** and **lint**
green.
**Browser walk** `pnpm --filter @clara/web e2e knowledge-walk` (ports 3170/3171/3172): **13 passed
(2.2 m), 0 failed, no retry used** — an earlier run lost three tests to `page.goto` timeouts while
the unit suite and a 183-migration chain ran alongside it.

## Follow-ups

**The runtime pack omits the legacy facts that still govern** — union them in or retire those four
readers (#658/#663-shaped). **kn.25 proves the live-uniqueness race from `prosrc`, not by racing.**
**Two real-timer web unit files flake under whole-suite load.**
