# Wave-3 — the forward-cutover BLOCKER is closed

Branch `integration/wave-3`, worktree `clara-wt\integration3`, **clean, LF, not pushed**. Four commits on
`38859f36`: `1310d028` fix(db) · `9e745fc8` feat(runtime) · `b8eeacf3` test(runtime) · `554060ea` docs.
Rig **rigw3b** `:55459` — `clara_w3` (fresh 0001…0195, **190 migrations**, seeded, 137 s) + `clara_rt_test`
(template copy, drained, bootstrapped). rigw3 never touched; no reset/sweep flag ever set.

## The ruling, as implemented

Recorded **verbatim** in 0195's header, again inside the recut core's own insertion comment, and in
ARCHITECTURE §10 — where it is flagged **OWNER CONFIRMATION PENDING**, exactly like the activation
assumption. The gate is ONE conjunct inside the SAME `if` the wall already lives in:

```sql
  if clara._work_committed_receipt(p_work) is null
     and coalesce(w.bundle->>'id','') <> all (array['clara-work/v1','clara-work/v2'])
     and not exists ( … )
```

`w.bundle` is the Work row's own stamp (`claim_work_run`, 0178, immutable by trigger) — never a parameter.
`coalesce(…,'')` walls an ABSENT stamp; an unknown id and every id from `clara-work/v3` on are walled.
The two ids are copied from `claraWork.v1.bundle.ts` / `.v2.bundle.ts`. Nothing else in the write moves.
**Tail census**: the body must carry `w.bundle->>'id'`, and the SET of every `clara-work/vN` literal in it
must be exactly `{v1, v2}` (read as a set, so a third id anywhere reds the migration). 0194 prestate pin
`eca58b99…d4ade` untouched; `consume_egress_dispatch` byte-unmoved `f461ceb0…`.
**NEW installed core sha (LF): `f9c4f5258fdd45c115871c67bfb3af9b91a587ff9f723d340b583e052defa4fb`.**

Preflight (`lib/rollback-preflight.mjs` + CLI + README): frontier ≥ `0195` ∧ `claraWork_v3` ∉ supported →
**REFUSED**, reason `frontier_requires_body`, naming 0195 and the body, exit 1. Rule table is DATA
(`FRONTIER_BODY_RULES`); frontier read = `max(clara.schema_migrations.version)`. **Global only** — a scope
cannot clear it, and the scoped verdict stays honest (B2 preserved).

## Cells, red → green

`work-egress-authority.test.mjs` **28 → 31**; red-first on two scratch template copies (both dropped):
**RED 1** (arm deleted = pre-ruling body, core `4bdf8cd2…`) → `w631.write.grandfathered` FAILS, **30/31**.
**RED 2** (set widened to three ids, coalesce dropped, core `88f384b0…`) → **7 fail / 24 pass**:
`write.walled_from_v3`, `write.unknown_bundle` **and the five `w631.write.*` wall cells**. GREEN **31/31**.
`rollback-preflight.test.mjs` **25 → 31** (4 pure cells: 0194+no-v3 allowed; 0195+no-v3 refused naming both;
0195+v3 allowed; no scope clears it) → **31/31**.

## The drill

```
[tb-e2e] drill pair derived from registry.ts: claraWork_v2 (build A) -> claraWork_v3 (build B)
[tb-e2e] database frontier: 0195_work_egress_purpose_and_execution_trace
[tb-e2e] artifacts: A carries 50 bodies (no claraWork_v3), B carries 51 (both)
[tb-e2e] RESUME W1: completed on claraWork_v2 inside build B (name invariant), 1 receipt @ c8fd7670182d…
[tb-e2e] RESUME W2: completed on claraWork_v3, 1 receipt @ 345f2a38c3c8…
[tb-e2e] preflight frontier rule: database at 0195_… REFUSES build A — claraWork_v3 required, not carried; adding it clears the reason
[tb-e2e] preflight CLI: --target-bundle A exits 1 naming frontier_requires_body; --target-bundle B carries claraWork_v3 and clears the rule
TWO-BUILD CUTOVER E2E: ALL PASS
```

## Counts (all LOCAL; hosted evidence pending)

**db** (rigw3b/`clara_w3`, 27 verbatim gate flags): `work-egress-authority` **31**, `work-journal-post` **32**,
`work-journal-admission` **20**, `periodic-adjustment` **19**, `operation-census` **10** = **112/0/0** ·
x42b2 ×9 **17/0/1** (no roster moved) · `rig-runtime-visibility`+`checkout-gate-c3` **77/0/0**.
**runtime unit** (`clara_rt_test`): `rollback-preflight` **31**, `ready` **24**, `work-trace-redaction` **21**,
`work-bundle` **16**, `registry-view` **7**, `l9-build-info` **15** = **114/0/0**.
**World e2es**: work-egress **PASS (3 legs)** · work-journal **PASS** · work-cancel **PASS** · chat-turn-v19
**PASS (4 legs)** · periodic-adjustment **PASS** · two-build **ALL PASS** · world guard **4/4 (last)**.
**Gates**: freeze-lint **OK (281 files, 51 modules)**, `--compare-base origin/main` **OK (264 unchanged, 17
additions)**, parts-parity **OK**, workflow-bundle **OK (51 superseded ship)**, worker-paths **OK**.
**web**: whole suite **3674 / 3672 pass / 0 fail / 2 skip** (the 2 are env-gated `live-provider-auth`) —
unchanged from the integration baseline; no apps/web file touched. `pnpm typecheck` **0** · `pnpm lint` **0** ·
`git ls-files --eol` → **0 CRLF**.

## For the #815 comment (orchestrator's to post)

> Ruled: a Work whose run was claimed under a pre-v3 bundle (`clara-work/v1` / `clara-work/v2`) is
> grandfathered past 0195's egress wall, so a forward cutover finishes parked v1/v2 runs honestly; the wall
> applies in full from `clara-work/v3` on, and `rollback-preflight` now REFUSES (`frontier_requires_body`,
> exit 1) any target image without `claraWork_v3` once the database frontier is at or past 0195 — so #815
> stands unchanged: ship 0195 together with the v3 image, and no drain is required before applying it.

## Assumptions / notes

1. **"§F/§G insertion comments"** — 0195 carries no §F/§G markers; read as the `#631 INSERTION` block in the
   recut core plus SECTION 12's preamble. Both updated.
2. **`defaultBundle()` moved `clara-work/v1` → `clara-work/v3`** (`work-journal-fixtures.mjs`, + the one pin in
   `work-journal-admission.test.mjs:353`). Without it the grandfather arm would silently disarm the wall for
   every db cell in the estate. `bundleForVersion(n)` is the new explicit predecessor shape.
3. **The frontier rule lands on the GLOBAL verdict only.** A scoped verdict is defined over the rows the
   caller named; this rule counts no rows. Folding it in would refuse a scoped answer for a reason the scope
   can neither cause nor clear (#637 review B2 inverted) and would have broken the drill's own B2 leg and
   `version-cutover-e2e`'s scoped inventory legs. A cell pins that no scope clears it.
4. **The drill's frontier leg is measured by DIFFERENCE**, not against a pristine estate: the drill tolerates
   foreign live rows by design (#708), and a stray `held` wake task strands against every target. The same
   question is asked twice at one instant with exactly one body added.
5. `rollback-preflight.test.mjs`'s pre-existing B3 cell asserts a globally empty unbound-task census; it reds
   on any database carrying live rows. Proven pre-existing by running the **pre-change** lib's
   `censusUnboundTasks` against the same database (26 rows). `clara_rt_test` was therefore drained
   (75 agent tasks, 10 document tasks → terminal) before the runtime batteries; it is a scratch copy.
6. **Unverified**: everything hosted; the whole db estate suite and the browser suite (orchestrator's/CI's).
   The owner's confirmation of the ruling is recorded, not obtained.
