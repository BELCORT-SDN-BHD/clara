# waveK · lane LC · #1144 — the version cut: `chatTurn_v23` and `claraWork_v7`

**Branch** `riders/wK-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\704`, base `ffb629d73`.
**Lane database** `clara_c04` on 127.0.0.1:55742 — still **337 files / `0361_reservation_release_advice`**
after every gate (read again at the end; the cut applies no migration).
**Drill databases** built by this lane on the disposable cluster `rigl06ac3` (127.0.0.1:55710):
`clara_wave_b_ci` (cloned from `clara_pristine` at 309, migrated forward to **337**, seeded, World
bootstrapped) and `clara_rt_test` (`create database … template clara_wave_b_ci`). Both are LC's own
per CLOSING-PLAN risk 2 and are left in place for the integrator.

**Status: DONE.** Nine commits, `ffb629d73..HEAD`:

```
15974c5a7 feat(runtime): #1144 chatTurn_v23 read_payroll_posting_state, the first of the seven
7253ad661 feat(runtime): #1144 chatTurn_v23 read_payroll_settlement_state and read_agreement_terms
7353c7be3 feat(runtime): #1144 chatTurn_v23 the four tenancy tools of #1137
3967e3e63 feat(runtime): #1144 chatTurn_v23 is cut and the registry pins it
7f0e5bec4 feat(runtime): #1144 claraWork_v7 is cut and grounds the particulars proposal
5344c2771 test(runtime): #1144 the cut's walks — chatTurn_v23 and claraWork_v7 on a real World
872cbeea1 docs(runtime): #1144 the README section for the pins this cut moved
1bf051771 test(runtime): #1144 the closure-attribution roster measures this cut's growth
ea48a81ea test(runtime): #1144 the two censuses the whole suite caught
```

32 files changed. **0 under `packages/db`, 0 migration files, 0 under `apps/web`**
(`git diff --name-only ffb629d73..HEAD -- <path> | wc -l`, each run).

---

## The ticket, as it stands

`gh issue view 1144 --comments` — **OPEN**, labels `enhancement` + `ready-for-agent`, created
2026-09-25T15:20:52Z, **zero comments** (`gh api repos/BELCORT-SDN-BHD/clara/issues/1144/comments`
returns an empty array). So the body IS the newest Agent Brief, and no owner ruling comment dated
2026-09-20 or later overrides it. `CLOSING-PLAN.md` § "LC, the version cut, in detail" narrows the
brief's own roster to what this cut takes, and that narrowing is what I built.

**Still live before building.** The seven tool names are absent from `buildToolsV22` (asserted by
`chat-turn-v22-tools.test.mjs`'s deferral cell, which still passes), and
`loadFaProposalInputsStepV6` still carries the two-condition predicate at
`packages/runtime/workflows/claraWork.v6.impl.ts:1336-1337`. Nothing on `main` had taken either.

---

## The seams I tested at (work order rule 4, written before the first cell)

1. `buildToolsV23(ctx, modelId, segment)` — the tool map the model is handed.
2. Each tool's zod input schema, through `safeParse`.
3. Each tool's `run…(ctx, input)` result — the ok shape and the refusal envelope.
4. `SYSTEM_PROMPT_V23` — the text the model is instructed with.
5. `registry.workflows` / `workflowBodies` / `workflowPins` — the dispatch, the roster, the pin.
6. `chatEngineId(modelId)` and `runModelSegmentStepV23` — the two names the bundle gate derives.
7. `loadFaProposalInputsStepV7` — its SQL, read as source (a door call cannot be driven without a
   database, and what is worth pinning is which value is bound to which name).
8. `CLARA_WORK_BUNDLE_V7` / `claraWorkBundleIdentityV7` / the banner — the identity a receipt names.
9. `/api/build-info` and the world-start log — the two surfaces that answer "which bodies".
10. A real chat turn over HTTP against a real World — the only seam that can show a DOOR answering.

A source pin is used where the seam is a door call, and the file that ships is the file pinned;
every other cell drives the real function.

---

## Acceptance criteria, each with its evidence

`CLOSING-PLAN.md` § "LC, the version cut, in detail" is the operative criteria list; the ticket
body's own roster is wider and its §3–§6 items are explicitly NOT this cut's.

### AC1 — mint `chatTurn_v23` and `claraWork_v7` exactly the way `CUT-PLAN.md` minted v22 and v6

A new versioned body file beside the old, the old body byte-untouched, `registry.ts` and
`startWorld.ts` pointing the pin at the successor, the manifest gaining the NEW entries only.

* **New files, none of them an edit to a predecessor.** `chatTurn.v23.{ts,impl,prompt,tools,reads,
  tenancy,refusals,usage}.ts` and `claraWork.v7.{ts,impl,prompt,tools,bundle,errors}.ts`.
  `git diff --name-only ffb629d73..HEAD` shows **no `chatTurn.v22.*` and no `claraWork.v6.*`
  source file** — the only v22/v6 paths in the diff are their TEST files.
* **The five registry edits per class**, in the exact textual shapes
  `packages/runtime/tests/scratch-image.mjs` regex-asserts: import, dispatch (two-space indent,
  trailing comma), bare `export { … };`, `workflowBodies` entry, `workflowPins` entry. Proof that
  the shapes are right is not the diff — it is the two-build drill, which rewrites those five and
  throws if a substitution does not apply. It passed (AC5).
* **`registry-view.test.mjs`** 7/7 pass — its `:92-100` cell reds if an export lands without the
  `workflowBodies` entry, and `:102-118` asserts every pin value is in `workflowBodies` and that
  `registryModule[id] === workflows[className]`.
* **Policy (c)**: `chat-turn-v23-tools.test.mjs` asserts every `chatTurn_v2..v22` is still rostered;
  `clara-work-v7.test.mjs` asserts every `claraWork_v1..v6` is still exported AND rostered.
  `check-workflow-bundle.mjs`: "**62 superseded body(ies) still ship for parked runs**".
* **The manifest gains additions only.** `node scripts/check-frozen-workflows.mjs --compare-base
  ffb629d73` → `OK — 347 existing entr(ies) retain the same hash and deployed flag; 15
  addition(s); 3 recorded retirement(s)`. The verify gate: `OK — 362 frozen file(s) verified …;
  62 "use workflow" module(s) all frozen+registered`.
* **`deployed:false` until the release locks them.** The 15 additions carry **no `deployed` key at
  all**, which is the manifest's own shape for "not locked": `--update` "preserves `deployed: true`
  and never grants it" (`check-frozen-workflows.mjs:349`), and `--lock-deployed` sets it at the
  release ceremony (`:368`). Measured: `deployed true 347 / unlocked 15`.

### AC2 — `chatTurn_v23` carries the seven tools of #1144 over the hosted 0352/0353 doors

**The doors, measured on `clara_c04` before a line was written** (not transcribed):

```
confirm_tenancy_rent_plan_for          :: p_client uuid, p_author uuid, p_document uuid,
                                          p_rent_account text, p_payable_account text,
                                          p_judgement text, p_op_key text
confirm_tenancy_rent_plan_revision_for :: p_client uuid, p_author uuid, p_document uuid,
                                          p_judgement text, p_op_key text
get_document_extract                   :: p_document uuid, p_client uuid, p_max_chars integer
get_document_state                     :: p_document uuid, p_client uuid
wake_get_contract_terms                :: p_document uuid
wake_get_payroll_settlement_candidates :: p_client uuid
wake_get_rent_settlement_candidates    :: p_client uuid
wake_get_tenancy_deposit_coding        :: p_client uuid
wake_get_tenancy_escalation_revision   :: p_document uuid
wake_get_tenancy_rent_plan_draft       :: p_document uuid
wake_list_review_queue                 :: p_scope jsonb, p_cursor jsonb, p_limit integer
wake_propose_contract_terms            :: p_document uuid
```

and their grants, `has_function_privilege` on the same database: every wake read is EXECUTE to
`clara_agent_ro` and to nothing else machine-side; both `_for` twins are EXECUTE to `clara_runtime`
and to neither `clara_agent_ro` nor `clara_authenticated`. That is exactly the split `readScoped`
and `pools().withRuntime` need, and it is the measurement that made the v22 deferral ruling
unwindable.

**The roster moved 45 → 52, enumerated rather than assumed** —
`chat-turn-v23-tools.test.mjs`, cell `v23.roster`: it BUILDS both maps and asserts the set
difference is exactly the seven names, that nothing v22 could do stops being possible,
`v22.length === 45` and `v23.length === 52`.

**Per tool, the contract item and the evidence:**

| tool | contract | cells |
|---|---|---|
| `read_payroll_posting_state` | `-ticket1136.md` §1 | input `.strict()` two uuids; client wall (no pin / other client); door source pins for `wake_list_review_queue($1::jsonb,$2::jsonb,$3::int)` and `get_document_state($1::uuid,$2::uuid)`; the CLR03/CLR10 sentences, and the CLR03 one never naming a client |
| `read_payroll_settlement_state` | `-ticket1136.md` §2 | client required, document OPTIONAL; no candidate identifier is takeable; door pin; the panel's own empty sentence |
| `read_agreement_terms` | `-ticket1136.md` §3 + `-fix.md` §7.4 | the `client_id` §7.4 ADDED, and a firm-level session refused BY NAME (below); door pins for the extract and the queue row; the banked PAIR and `not_read_yet` |
| `read_tenancy_terms` | `-ticket1137.md` §1 | the DOCUMENT alone, a `client_id` refused by validation; three doors in order and the proposal ONLY when nothing is recorded; the class verdict driven at both arms |
| `read_rent_settlement_candidates` | `-ticket1137.md` §2 | the CLIENT alone; both doors; client wall; the empty sentence |
| `confirm_tenancy_rent_plan` | `-ticket1137.md` §3 + §7.1/§7.2/§7.3 | five keys, each nullable where the contract says; a client DISAGREEMENT refused; the stable op key (same input → same key, different author → same key, different argument or task → different key); all seven door arguments named with `p_judgement` sent explicitly; the ladder with `client_inactive` LAST; a typed tool result with no `type` discriminant |
| `confirm_tenancy_rent_plan_revision` | `-ticket1137.md` §4 | three keys; the OFFER read on the read pool BEFORE the act on the runtime pool (asserted by source ORDER); `nothing_to_revise`'s two different sentences; both figures on the receipt; its own op-key namespace |

**§7.4's own obligation, discharged rather than deferred.** The amendment asks the cut to "confirm
the chat surface can always supply a client for this tool". **It cannot** — a firm-level (unpinned)
session has no `ctx.clientId` — so `read_agreement_terms` refuses such a session by name
(`agreement_terms_needs_client_pin`, CLR03) rather than discovering a client for it. That is the
narrower of the two routes the report offered and it needs no new door. Driven by a cell, not
asserted in prose: `v23.agreement_terms: §7.4's obligation`.

**§7.1, §7.2 and §7.3, each taken and each pinned.** 7.1: `client_inactive` is in
`CONFIRM_RENT_PLAN_REFUSALS` with `clara.create_accounting_plan`'s own sentence word for word, and
`CONFIRM_RENT_PLAN_LADDER`'s LAST element. 7.2: both confirmations return
`{ok, status, plan, replayed}` with no `type` discriminant, and `check-parts-parity.mjs`'s census
re-takes the measurement it rests on. 7.3: `confirmTenancyRentPlanOpKey` is exported so a cell can
drive the convergence properties without a database.

**The absences are still rulings.** `v23.roster`'s second cell asserts `enrol_prepayment_account`,
`record_prepayment_stated_term`, `open_intake_batch`, `record_counterparty_alias`,
`settle_payroll_net_pay`, `settle_rent_payable` and `record_contract_terms` are all absent from
`buildToolsV23`.

### AC3 — `claraWork_v7` carries `loadFaProposalInputsStepV7` per `waveS-lane05-fix.md` §3

* **The six-condition predicate.** The expected value is an INDEPENDENT source of truth, not a
  re-derivation: `clara._fa_particulars_complete`'s live body, read from `pg_proc` on `clara_c04`
  on 2026-09-26 and transcribed into the cell. It matches the contract's form clause for clause.
  `clara-work-v7.test.mjs` asserts all seven clauses present and the two-condition form absent.
* **Both grounds fed**, from `../lib/fa-proposal-grounds.js`, with the contract's argument orders
  pinned as source: `FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL, [work.clientId, null]` and
  `FA_RETIRED_ACCOUNT_POLICY_SQL, [work.clientId, assetAccount]`, with
  `assetAccount === null ? null :` guarding the second — a statement that cannot be scoped is not
  run. Neither statement is re-spelled in the step (cells assert neither relation name appears).
* **The return gains the two keys** and v6's OMITTED comment does not ride into the step body; the
  cell also asserts v6's file STILL carries it, which is what makes the absence a move rather than
  a file that never had it.
* **Contract item 7 is carried, not silently dropped.** The step reads the relations directly and
  therefore leaves NO work-knowledge-read receipt — written into the section header in the
  contract's own words, because no gate will say it.

### AC4 — every successor body gets its walks

* **`tests/chat-turn-v23-e2e.mjs`** + `chat-turn-v23-serve.mjs`, run on `clara_wave_b_ci` under
  `scripts/ci/world-gate.mjs`: **ALL PASS (25 985 ms)**, three legs —
  1. `read_tenancy_terms` against a document the firm does not hold reached 0353's wake door and
     carried its `CLR11`. That the code is CLR11 and not CLR03 is the whole measurement: CLR03
     would mean the credential never reached the door, which is the state v22's ruling turned on.
  2. `read_rent_settlement_candidates` ANSWERED for the leg's real client — `ok:true`, 0 months,
     0 deposits, the panel's own empty sentence — so leg 1's wall is not the door being shut to
     everyone.
  3. a chat turn admitted a trade-invoice Work, `claraWork_v7` served it, and the committed
     receipt, the Work row's `bundle` and every `work_execution_traces` row carry the digest the
     boot banner logged (`clara-work/v7`, `a0fb27648d30…`), read from the registry's own pin.
  The boot line asserted: `chatTurn=chatTurn_v23 claraWork=claraWork_v7`; `/api/build-info` asserted
  for both pins, the newest bundle first, and its digest equal to the banner's.
* **v21's ADV-S-1 designed out.** Every identifier the new tools take is parsed by the serve child
  out of the PERSON'S own message; the leg's environment carries cues only. A tool whose only
  identifier never reached the model could not appear to work here.
* Registered in `DRIVERS` (`local-db-gate-drivers-census.test.mjs`, 8/8 after) and in
  `.github/actions/db-live-gates/action.yml` beside the v22 leg.

### AC5 — the two-build cutover drill passes with the new pins

`packages/runtime/tests/two-build-cutover-e2e.mjs` under `world-gate`, `PGDATABASE=clara_rt_test`
on 55710: **ALL PASS**. It derives every version pair from `registry.ts`, so this is the pins
themselves being exercised:

* **claraWork v6 → v7**: `W1 parked on claraWork_v6 … bundle clara-work/v6 e716d9b046d6…`; build A
  stopped; build B ready with `claraWork=claraWork_v7`, 62 bodies; `W2 parked on claraWork_v7 …
  bundle clara-work/v7`; `RESUME W1: completed on claraWork_v6 inside build B (name invariant)`;
  `RESUME W2: completed on claraWork_v7`; `preflight: rollback to A REFUSED, naming claraWork_v7`,
  then ALLOWED once both settle.
* **chatTurn v22 → v23**: `chatTurn pair derived from registry.ts: chatTurn_v22 (build A2) ->
  chatTurn_v23 (build B)`; `C1 parked on chatTurn_v22`; `RESUME C1: the turn completed on
  chatTurn_v22 inside build B (run name invariant), clarification delivered`.
* the statementFacts leg (v3 → v4) still passes untouched.

`tests/version-cutover-e2e.mjs` also passes, and prints the static guard for this cut:
`registry repoint (-> chatTurn_v23) + v7 retention + frozen v7/chatTurn.v23.ts hash-locks
(v7 deploy-locked; chatTurn.v23.ts deployed=false — ceremony-dependent, not asserted either way)`.

### AC6 — `check-frozen-workflows.mjs` stays clean for the 347 locked entries

`--compare-base ffb629d73`: **347 existing entries retain the same hash AND deployed flag**; the 15
additions are this cut's 14 new files plus `lib/fa-proposal-grounds.ts`, which joins by closure.

### The one correction to a body being succeeded — **NOT taken, and here is the measurement**

`CLOSING-PLAN.md` asks the cut to correct
`packages/runtime/lib/prepayment-schedule-basis.ts:119` ("CLR10, and NEVER SHOWN" for
`invalid_author`, which migration 0335 moved to `CLR44`), and says "if the cut finds the mapping
already correct in the file it copies, it records that rather than claiming the fix."

**This cut copies no file that carries that comment.** `chatTurn.v23.tools.ts` extends
`buildToolsV22` by import; it does not copy `chatTurn.v22.tools.ts`, and neither v22's tools module
nor any v23 file re-spells `PREPAYMENT_REFUSAL`. `prepayment-schedule-basis.ts` is deploy-locked
(`deployed: true` in the manifest at the base), so correcting it in place is refused by the freeze
law, and minting a successor copy of a 500-line module to change ONE doc comment would hash-lock a
second copy of a constant that must not drift from the first — the exact defect §2.7 exists to
prevent. So the correction is **carried forward as a successor contract** (below) rather than
claimed. `grep -rn 'CLR44' packages/runtime --include=*.ts --include=*.mjs` returns nothing at
HEAD: no runtime code branches on the distinction today, so nothing behaves wrongly because of it.

---

## Migration

**NONE, and none was needed.** The ticket is expected to need no migration and does not: every door
the seven tools call has been live since `0352` and `0353`, and the two the v7 step reads since
`0345`/`0346` — all four hosted 2026-09-25 at frontier `0361_reservation_release_advice`, and all
twelve door signatures re-measured on `clara_c04` (above). **Prestate pins: not applicable** — no
migration file exists, so there is nothing to pin. `git diff --name-only ffb629d73..HEAD --
packages/db` is empty.

Consequently **rule (d) is not triggered**: `apps/web/tests/firm-scope-db-pins.test.ts` is in scope
"whenever a migration file changed", and none did. Stated with the command rather than assumed.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| typecheck | `pnpm typecheck` | `packages/runtime: Done`, `apps/web: Done`, exit 0 |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| freeze verify | `node scripts/check-frozen-workflows.mjs` | OK — **362** frozen files, 62 `"use workflow"` modules all frozen+registered, 3 retired |
| freeze additions-only | `… --compare-base ffb629d73` | OK — **347 unchanged**, **15 additions**, 3 retirements |
| freeze selftest | `node scripts/check-frozen-workflows.selftest.mjs` | OK — all cases |
| freeze registration selftest | `node scripts/check-frozen-workflows.registration.selftest.mjs` | OK |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK — emittable unchanged; `work_result`'s sites are v1…v7 `impl.ts`, none in any `chatTurn.*` |
| bundle gate | `pnpm --filter @clara/runtime build` then `node scripts/check-workflow-bundle.mjs` | OK — 14 pinned classes, **62** superseded bodies ship, chatTurn pinned at **v23** with its step directive, engine stamp and `freeform_result` emitter (46 checks) |
| worker paths | `node scripts/check-worker-paths.mjs` | OK — 2 spawn sites |
| this ticket's new unit files | `node --test tests/chat-turn-v23-tools.test.mjs` | **17/17 pass** |
| | `node --test tests/chat-turn-v23-tenancy.test.mjs` | **17/17 pass** |
| | `node --test tests/clara-work-v7.test.mjs` | **7/7 pass** |
| the test files I edited | `chat-turn-v22-tools.test.mjs` **21/21**, `clara-work-v6.test.mjs` **8/8**, `p6-1-parts-parity.test.mjs` **22/22**, `l9-build-info.test.mjs` **17/17**, `local-db-gate-drivers-census.test.mjs` **8/8**, `registry-view.test.mjs` **7/7** | all pass |
| **the WHOLE runtime suite, once, at the end** | `pnpm --filter @clara/runtime test` on `clara_c04` | **3222 tests · 3181 pass · 3 fail · 38 skipped · 436 s** |
| the two-build cutover drill | `world-gate.mjs tests/two-build-cutover-e2e.mjs`, `clara_rt_test` @55710 | **ALL PASS** |
| the version-cutover e2e | `world-gate.mjs tests/version-cutover-e2e.mjs` | **ALL PASS** |
| **this cut's walk** | `world-gate.mjs tests/chat-turn-v23-e2e.mjs`, `clara_wave_b_ci` @55710 | **ALL PASS (25 985 ms)** |
| apps/web unit suite (no-op, run and reported) | `node scripts/run-tests.mjs` from `apps/web` | **5249 tests · 5247 pass · 0 fail · 2 skipped**, exit 0 |
| browser walks | — | **none touched**: `git diff --name-only ffb629d73..HEAD -- apps/web` is empty |
| db suite / operation-census / rig-isolation | — | **not owed**: no `packages/db` file changed and no SQL function was added |

**The three whole-suite reds, named rather than "fixed":**

1. `scanner rejects EICAR, encrypted PDF, and XML entity expansion` — RIG.md's named Windows-only
   red (#693, Defender eats the EICAR fixture).
2. `(#806) this host's OWN probe: pg_dump/psql are on PATH here` — RIG.md's named Windows-only red
   (no `pg_dump` on the Windows PATH; the postgres clients live in WSL).
3. `ready r2: NO DSN component reaches the /ready payload or a warning line (H-48)` — fails only in
   the whole-suite run with `r.checks.pools.find is not a function`; **`node --test
   tests/ready.test.mjs` alone is 26/26 pass, 0 fail**. It is the load-flake shape RIG.md tells a
   lane to "re-run alone, report both". My diff touches no module on that path (`lib/health.mjs`
   and `tests/ready.test.mjs` are not in the diff). See "unverified" below.

**Two censuses the whole suite caught**, which is precisely why it is run once at the end rather
than trusted to targeted runs: `l9-build-info.test.mjs`'s `bundles: [...]` literal (one of the four
misses the LAST cut's own record names) and the second half of `chat-turn-v22-tools.test.mjs`'s
identity cell. Both are now correct and green.

---

## Docs, in the same commits

* **`packages/runtime/README.md`** — a new `### The two pins the 2026-09-26 CLOSING wave moved`
  section above the 2026-09-25 one (which stays; the two are the version ledger in prose): what each
  successor carries; the seven tools with the doors, argument orders and pool per tool; the stable
  op key and why it departs from #949's fresh one; the no-new-wire-kind measurement; what the cut
  deliberately does NOT add; the deploy order (none owed) and an honest rollback line. The
  frozen-module ledger (`#658`'s section) gains `lib/fa-proposal-grounds.ts` beside the three the
  last cut added.
* **`scripts/check-frozen-workflows.selftest.mjs`** — the `#815` closure-attribution roster, which
  is the census a cut is meant to extend, re-measured with `--print-closure` for all eight modules
  plus a new entry for `lib/fa-proposal-grounds.ts`, and the two prose counts refreshed (24 → 33,
  17 → 24).
* **`CONTEXT.md`: no change, and that is a decision.** This cut mints no domain vocabulary — every
  term it uses (rent plan, escalation revision, standing instruction, posting verdict, deposit
  coding) is the sweep wave's, already in the estate's language. The CLOSING-PLAN's shared-files
  table assigns `CONTEXT.md` to L1 only.

---

## Successor contracts (for a cut AFTER this one)

LC's roster was closed to additions, so these are recorded rather than taken.

### 1 · `prepayment-schedule-basis.ts`'s `invalid_author` comment, and the `CLR44` rule

**Name:** a doc-comment correction inside a deploy-locked module, plus the branch rule it implies.
**What is wrong:** `packages/runtime/lib/prepayment-schedule-basis.ts:119` documents
`invalidAuthor` as "CLR10, and NEVER SHOWN". Migration `0335` moved that refusal to **`CLR44`** and
left `CLR10` meaning only a refusal a surface may render
(`waveS-lane02-ticket1114.md` § Successor contract).
**Why this cut did not take it:** the module is deploy-locked, this cut copies no file carrying the
comment, and minting a successor copy of it to change one comment would hash-lock a second copy of
a constant that must not drift from the first.
**What the next cut that RE-CUTS that module should carry:** the corrected comment, plus the
general rule a handler may now rely on — **`CLR44` is never rendered; `CLR10` may be** — and the
four tokens it applies to: `invalid_author` (both schedule doors),
`prepayment_read_scope_required` and `revenue_recognition_read_scope_required` (the two Work reads).
**Measured state today:** `grep -rn 'CLR44' packages/runtime` returns nothing, so no runtime code
branches on the distinction and nothing behaves wrongly because of the stale comment.
`isGovernedRefusalV23` matches `/^CLR\d{2}$/`, so a `CLR44` WOULD be treated as a governed refusal
and rendered — which is the behaviour the rule says should change. That is the next cut's work.

### 2 · `payrollFacts`'s two page-printed witnesses (#1144 item 3)

**Name:** `payroll.run.employee_count` and `payroll.run.page_count` as OPTIONAL fields of
`PAYROLL_RUN_FIELDS` in `payrollFacts_v2`, with the prompt stanza
`waveS-lane04-ticket1048.md` §9.1 writes out. **Not this cut's family** — CLOSING-PLAN rules it out
by name — and the database half already admits the answers. Until it ships, `0343`'s battery is the
only thing exercising the two witnesses.

### 3 · The contracts that need an owner ruling first (unchanged by this cut)

#1073 (the accrual/bill-conflict remedy), #1056 (`reviseDocumentFact`), #1050 (a web contract plus
a read-only stanza, explicitly NOT a chat tool), #1075 (the side-filtered accrual register). All
four are written out in the ticket body §5 and none is takeable without a ruling.

### 4 · What a frozen v23/v7 body would now need

Nothing was left unbuilt inside this cut's roster. Anything a future lane wants from
`chatTurn_v23` or `claraWork_v7` — a settle tool, a record-terms tool, a `client_id`-free agreement
read, a drift receipt for the proposal's grounds — is a **v24 / v8** contract, because both bodies
are frozen from the moment this branch merges. The drift-receipt one is the most likely to be
asked for: the v7 step reads its two grounds directly and `clara.work_knowledge_drift` will not see
that reliance, and moving it under `clara_runtime` to gain the receipt is a different credential
with a different wall and a decision of its own.

---

## Follow-ups worth filing

1. **`ARCHITECTURE.md`'s workflow pins are four cuts stale, and this cut did not touch them.**
   `docs/ARCHITECTURE.md:183` still says `chatTurn → chatTurn_v19`、`claraWork → claraWork_v3`, and
   `:293` repeats `chatTurn_v19`. Per `AGENTS.md` rule 4 and `CUT-PLAN.md` §2.8 a blueprint edit
   belongs to a wayfinder session, not a ticket, **so this is handed to the orchestrator** rather
   than fixed here. It was already wrong before this cut (recorded in `docs/PROGRESS.md` Known
   Issues); it is now wrong by four versions.
2. **`ready r2` is a whole-suite flake with no owner.** It passes alone and fails under the full
   3222-cell run. Worth either a stabilisation (the lane-probe settle wait is timing-bound) or a
   named entry in RIG.md's known-reds list, so the next lane does not spend the round I spent
   deciding whether it was mine.
3. **`chatTurn_v23` contributes SEVEN entry files to every closure attribution where its
   predecessors contributed four**, because its tools are three modules. That is recorded in the
   `#815` roster with the reason, but it is worth an orchestrator's eye: the split bought a
   readable 600-line module per subject at the price of three more manifest entries per closure,
   and the next cut should decide deliberately rather than inherit it.
4. **A `CLR44` rendering wall.** Once the rule "CLR44 is never rendered" is taken by a cut, the
   governed-refusal helper should probably enforce it rather than leave it to each map — one place
   rather than seven.

---

## Anything unverified

* **No real model has driven any of the seven tools.** The walk uses a scripted model
  (`MockLanguageModelV4`); what it proves is that the tool map reaches the doors and the doors
  answer, not that a provider chooses the right tool. That is the same limit every predecessor
  walk has.
* **Five of the seven tools have no end-to-end leg.** The walk drives `read_tenancy_terms` and
  `read_rent_settlement_candidates`. The other five are covered by unit cells and source pins only.
  In particular **neither confirmation has been driven against `clara.confirm_tenancy_rent_plan_for`
  at all** — doing so needs a filed tenancy with recorded terms, which is a fixture chain the sweep
  wave's own db battery owns (`packages/db/tests/tenancy-agent-twins.test.mjs` drives both doors
  there). The refusal ladders, the op key and the receipt shaping are asserted as contracts, not as
  measured behaviour.
* **Whether `ready r2` reds on the base commit under the whole suite** was not measured — that
  would have cost a second 7-minute whole-suite run on a checkout I may not modify. The evidence I
  do have is that it passes alone, and that nothing in this diff touches `lib/health.mjs`, the lane
  probe or `tests/ready.test.mjs`.
* **The web build does not run on this rig**: `pnpm build` fails at
  `apps/web/scripts/check-public-key.mjs` because `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent from
  this worktree. `pnpm --filter @clara/runtime build` is what every bundle gate above ran against.
  No browser walk could have run here even if one had been owed; none was.
* **The from-scratch chain** was not run, and is not this lane's: LC applies no migration.
* **Hosted was not read.** Every door measurement is on `clara_c04` (337 / `0361`), which the rig
  prep proved equal to the sweep wave's integration chain.
* **The 38 skipped cells** in the whole-suite run are pre-existing frontier skips; I did not
  investigate each one.
* **`.scratch/two-build/`** holds the drill's three scratch images. They are gitignored (the
  worktree's `git status` is clean) and left in place.
