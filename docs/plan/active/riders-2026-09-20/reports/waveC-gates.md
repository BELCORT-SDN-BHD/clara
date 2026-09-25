# Cut phase — the gate on the integrated head (cutover drill, upgrade path, browser suite)

**Code** `C:\Users\zhant\Desktop\clara-wt\int2`, branch `integration/riders-cut`, head **`34b125e6f`**
— every command below was run at that commit. No tracked file was edited: `git status --porcelain` in int2 reads exactly one line before and
after this gate, `?? docs/plan/active/riders-2026-09-20/ceremony-w4/reads-w4.state.json`, which was
already untracked there when the gate started. Two things this gate DID write into int2 are absent
from that list because both are gitignored, and each was checked rather than assumed:
`apps/web/.env.local` (the two `NEXT_PUBLIC_SUPABASE_*` lines copied from the main checkout;
`git check-ignore -v` → `.gitignore:6:.env*`) and `.scratch/two-build/` (the drill's and §1.3's
images; `.gitignore:65:.scratch/`). Nothing was committed, nothing was pushed, no PR was
opened, no GitHub object was written, no lane worktree and no main-checkout file but this report was
touched. No subagent was spawned. No process this gate did not start was killed. Ports 55741–55749
were not touched.

---

## Counts, one table

| # | gate | command | result |
|---|---|---|---|
| 1 | **two-build cutover drill**, fresh cluster `rigcut` 55706 | `world-gate.mjs tests/two-build-cutover-e2e.mjs` | **ALL PASS**, exit 0, 93 s — three legs (claraWork v5→v6, chatTurn v21→v22, statementFacts v3→v4) |
| 1a | the previous build **as main ships it** (all three pins rolled back) | `scratch-image` + nitro | **57 bodies** vs this head's **60**; lacks exactly `chatTurn_v22`, `claraWork_v6`, `statementFacts_v4`; carries nothing this head does not |
| 1b | boot census of the new build with v21/v5/v3 runs live | `scripts/serve.mjs` | `bodies=60`, all three new pins on the line, **`stranded bodies n=0`** |
| 1c | rollback preflight, four readings | `rollback-preflight.mjs --target-bundle` | ALLOWED / ALLOWED / **REFUSED (unsupported_body)** / ALLOWED — §1.4 |
| 2 | **upgrade path**, `clara_w4_hosted` 55701 (309 → 312) | `pnpm --filter @clara/db migrate` | **3 / 3 applied · 312 total**, exit 0, 6 s; every prestate clean, every tail green |
| 2a | data-dependent branches | planted through doors | **2 of 2 entered** (0321's receipt, 0323's driven arm); 0320 names none |
| 2b | recut-body census vs the from-scratch chain `clara_cutint` | `sha256(prosrc)` | **1499 bodies, diff 0**; columns 4051, constraints 3103, indexes 947, all diff 0 |
| 2c | `clara_w4_coll` 55702, `en_US.UTF-8` | same migrate | **3 / 3 applied · 312 total**, exit 0, 1 s; both branches took the EMPTY arm |
| 2d | baselines | `reads-w4.mjs --export-fingerprint` | pre **11 346** keys @ 309 · post **11 356** keys @ 312 |
| 3 | **browser suite, run 1** | `pnpm --filter @clara/web e2e` | **596 cells · 588 pass · 1 fail · 7 skip**, 19.8 m — the one red is §3.3's known flake |
| 3 | **browser suite, run 2** | same, `-- --no-build` | **596 cells · 589 pass · 0 fail · 7 skip**, 21.6 m, exit 0 — **no cell red in both runs** |
| 3a | the chat walk | `tests/chat-turn-v22-e2e.mjs` | **ALL PASS** (28.4 s), 5 legs |
| 3b | the Work walk | `tests/fixed-asset-acquisition-e2e.mjs` | **PASS**, 7 legs incl. `claraWork_v6`'s #933 proposal park and confirm |
| 3c | the statement walk (#1037) | drill leg 3 + `statement-facts-v4-citation{,-db}.test.mjs` | drill leg **PASS**; **7 / 7** and **10 / 10** |
| 3d | the one red, re-run alone twice | `… e2e -- --no-build work-question-walk` | **14 / 14** and **14 / 14**, exit 0 both |
| 4 | `registry-view.test.mjs` | `node --test` | **7 / 7** |
| 4 | `check-frozen-workflows` | `node scripts/check-frozen-workflows.mjs` | **347 frozen / 60 `"use workflow"` / 3 retired** |
| 4 | … `--compare-base origin/main` | same | **322 unchanged, 25 additions, 3 retirements** — additions-only |
| 4 | `check-parts-parity` | `node packages/runtime/scripts/check-parts-parity.mjs` | OK — emittable set unchanged at **six** kinds |
| 4 | `pnpm typecheck` | `pnpm typecheck` | **exit 0**, both workspaces Done |
| 4 | `CI=true GITHUB_ACTIONS=true pnpm lint` | as written | **exit 0** |
| 5 | the web `next build` in int2 (the merge left it UNVERIFIED) | `pnpm --filter @clara/web build` inside run 1 | **green** — compiled 17.3 s, TypeScript 39.4 s, 35/35 static pages |

**One sentence.** Every gate this worker owns is GREEN at `34b125e6f`: the two-build drill passes all
three legs on a cluster built and dropped for it, the new build's boot census strands nothing, the
three migrations apply cleanly on the hosted stand-in with both data-dependent branches ENTERED and
converge body-for-body with the from-scratch chain, and the browser suite has **no cell red in both
runs**. **Nothing above note.** The cut's rollback verdict is **REFUSED** the moment a v22, v6 or v4
run exists, naming all three bodies — which is the snapshot the runbook's step 9 must record.

---

## Method

`reports/wave4-gates-A.md` is the template, and four things are done differently because this gate
is a CUT's gate rather than a wave's:

1. **The drill gets a cluster of its own, built for it and dropped after it.** `pg_createcluster 17
   rigcut -p 55706`, C.UTF-8, trust (`pg_hba.conf` copied from `rigw4`), then CI's own route
   verbatim: migrate + seed + bootstrap `clara_wave_b_ci`, then
   `create database clara_rt_test template clara_wave_b_ci`. No second from-scratch chain ran on it.
2. **The drill's three scratch images are not the rollback target, so a fourth was built.** Each of
   the drill's legs drops ONE body; main's image drops all three at once. §1.3 builds that shape
   from the drill's own primitives so the rollback question can be asked of one artifact.
3. **The stranded census is read as a number, not inferred from the fact that a process booted.**
   §1.2 boots this head against three non-terminal runs on the retired pins and quotes the line.
4. **The upgrade database is populated through doors for the branches the headers name, and only
   those.** §2.1. 0320 names none, and that is recorded as a measurement rather than passed over.

---

## 1 · The two-build cutover drill (CUT-PLAN §4.4)

### 1.1 The cluster, built the way the action builds CI's

`rigcut`, PostgreSQL 17.11, `127.0.0.1:55706`, `C.UTF-8`, trust for `local` and both loopback hosts.

| step | result |
|---|---|
| `sudo pg_createcluster --locale C.UTF-8 17 rigcut -p 55706 --start` | online; `datcollate = C.UTF-8` |
| `create database clara_wave_b_ci` | done |
| `pnpm --filter @clara/db migrate` | **312 new applied · 312 total**, `0001` → `0323_trade_invoice_probe_self_exclusion`, 03:16:28Z → 03:18:34Z (2 m 06 s), exit 0 |
| `pnpm --filter @clara/db seed` | **2 seed file(s)**, exit 0 |
| `pnpm --filter @clara/runtime exec bootstrap` | schema created, exit 0 |
| `create database clara_rt_test template clara_wave_b_ci` | done; `312 / 0323…`, **0 non-terminal `workflow.workflow_runs`** |

The template copy rather than a second migrate is the action's own reason (0154 pins a
cluster-global clara-role count), and the name is not free: `two-build-cutover-e2e.mjs` THROWS
unless `PGDATABASE` is one of `{clara_rt_test, clara_wave_b_ci}`.

### 1.2 The drill itself

```
cd packages/runtime
PGHOST=127.0.0.1 PGPORT=55706 PGUSER=postgres PGDATABASE=clara_rt_test RELAY_TEST_MODE=1 \
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55706/clara_rt_test \
CLARA_GATE_STEP="cut-phase two-build drill" \
  node ../../scripts/ci/world-gate.mjs tests/two-build-cutover-e2e.mjs
```

**03:19:25Z → 03:20:58Z, 93 s, exit 0 — `TWO-BUILD CUTOVER E2E: ALL PASS`.** The `world-gate`
launcher reports `budget 2048 MB | peak RSS unavailable (no /proc on this platform) | exit 0`; the
peak figure is a Linux-only reading and is UNVERIFIED here.

Both doors opened before anything was built:

```
[tb-e2e] build gate: .output/server/index.mjs is present, newer than every bundled source, and agrees with registry.ts
[tb-e2e] inventory gate: no non-terminal runs and no unbound accounting_work tasks
```

Every leg, with the line that recorded it:

| leg | pair, derived from `registry.ts` | what the drill printed |
|---|---|---|
| **claraWork** | `claraWork_v5` (A) → `claraWork_v6` (B), A built in 13.5 s | `artifacts: A carries 59 bodies (no claraWork_v6), B carries 60 (both)` |
| | | `W1 parked on claraWork_v5 (typed Work question, 2 fields), bundle clara-work/v5 fe64198207d5…` |
| | | `preflight: target-with-claraWork_v5 allowed; target-without-claraWork_v5 REFUSED naming it` |
| | | `build A stopped (SIGTERM) — W1 is parked on a body no running process now carries` |
| | | `W2 parked on claraWork_v6 …, bundle clara-work/v6` |
| | | `preflight: rollback to A REFUSED, naming claraWork_v6` |
| | | `preflight B2: scoped-to-W1 ALLOWED while the global verdict REFUSES, naming claraWork_v6` |
| | | `RESUME W1: completed on claraWork_v5 inside build B (name invariant), 1 receipt @ fe64198207d5…` |
| | | `RESUME W2: completed on claraWork_v6, 1 receipt @ e716d9b046d6…` |
| | | `preflight: with both Works settled, rollback to A is now ALLOWED` |
| | | `preflight frontier rule: database at 0323… REFUSES a target without claraWork_v3; adding it clears the reason` |
| | | `preflight CLI: --supported <pre-rule roster> exits 1 naming frontier_requires_body` |
| | | `unbound Work: refuses on its own against a claraWork-less target; allowed against build A` |
| **chatTurn** | `chatTurn_v21` (A2) → `chatTurn_v22` (B), A2 built in 6.6 s | `artifacts: A2 carries 59 bodies (no chatTurn_v22), B carries 60` |
| | | `C1 parked on chatTurn_v21 (chat clarification, run workflow//./workflows/chatTurn.v21//chatTurn_v21)` |
| | | `preflight: a target without chatTurn_v21 is refused by the parked turn, naming it` |
| | | `B ready for the chat leg: pins.chatTurn=chatTurn_v22, roster carries chatTurn_v21` |
| | | `RESUME C1: the turn completed on chatTurn_v21 inside build B (run name invariant), clarification delivered` |
| **statementFacts** (#1037, new) | `statementFacts_v3` (A3) → `statementFacts_v4` (B), A3 built in 6.3 s | `artifacts: A3 carries 59 bodies (no statementFacts_v4), B carries 60` |
| | | `S1 parked on statementFacts_v3 (text channel held, run workflow//./workflows/statementFacts.v3//statementFacts_v3)` |
| | | `preflight: a target without statementFacts_v3 is refused by the parked statement, naming it` |
| | | `B ready for the statement leg: pins.statementFacts=statementFacts_v4, roster carries statementFacts_v3` |
| | | `RESUME S1: settled on statementFacts_v3 inside build B (run name invariant), 3 lines, none cited` |
| | | `S2: 3 lines admitted inside build B on statementFacts_v4, every one citing its page and the region's own locator` |

**The new build's boot line, in full** (build B, this head):

```
[clara-runtime] serving git_sha=<unset> frontier=0323_trade_invoice_probe_self_exclusion(312) bodies=60
  pins closeExample=closeExampleV1 chatTurn=chatTurn_v22 claraWork=claraWork_v6
  documentIngest=documentIngest_v2 invoiceFacts=invoiceFacts_v1 statementFacts=statementFacts_v4
  witnessFacts=witnessFacts_v3 payrollFacts=payrollFacts_v1 agreementFacts=agreementFacts_v1
  autoDraft=autoDraft_v10 firmInterview=firmInterview_v3 clientOnboarding=clientOnboarding_v5
  bankAgent=bankAgent_v1 closePrep=closePrep_v1
```

All three new pins are on it. The old ones are in the roster rather than the pin list, which is what
policy (c) asks for: **B carries 60 bodies against each A's 59**, and each A is this head minus
exactly the one successor its leg is about.

**The stranded census, as a number.** The drill proves the carry by resuming each run, but it never
prints the census figure, so it was read separately. Three non-terminal runs were staged on the
retired pins — `stageRun`'s own shape, the one `tests/rollback-preflight.test.mjs:117` uses, because
the preflight and the boot census read ROWS, not engines — on a pristine template copy of
`clara_wave_b_ci`, and this head was booted through its supported entry point
(`packages/runtime/scripts/serve.mjs`, the image's `CMD`):

```
[clara-runtime] serving … bodies=60 pins … chatTurn=chatTurn_v22 claraWork=claraWork_v6 … statementFacts=statementFacts_v4 …
[clara-runtime] stranded bodies n=0 (every live run's body is carried by this image)
[world-postgres] Re-enqueued 3 active run(s) on startup
[clara-runtime] durable world started pid=71892
```

The process was then stopped (SIGTERM at a 50 s timeout) by the same command that started it. After
`durable world started` the engine re-enqueued the three staged rows and graphile-worker failed them
with `Event type 'run_started' not supported for legacy runs (specVersion: undefined)` — a
consequence of the rows being staged rather than real, **after** the census had already answered,
and not a finding about the image.

### 1.3 The previous build as main ships it

The drill's three A images each drop one body. Main at `7bc5a710f` — the image serving hosted today
— drops all three, so a fourth image was built from the drill's own primitives
(`buildPreviousVersionImage`, then `deriveVersionPair` + `rewriteRegistryToPrevious` for the other
two classes, then nitro; 15.6 s + 4.7 s). What it registers was read out of the artifact rather than
assumed:

```
[mainshape] previous carries 57 bodies, this head carries 60
[mainshape] this head has and previous LACKS: chatTurn_v22, claraWork_v6, statementFacts_v4
[mainshape] previous has and this head lacks: (none)
```

57 is main's own figure, arrived at from two directions that did not consult each other: this
artifact registers 57 bodies, and `waveC-merge.md` §3's manifest table reads **57 `"use workflow"`
modules on `origin/main` against 60 on the merged head** — a delta this gate re-measured as
`322 existing entries retain the same hash and deployed flag, 25 additions, 3 retirements`, whose
only new `"use workflow"` modules are `chatTurn.v22.ts`, `claraWork.v6.ts` and
`statementFacts.v4.ts`. The fidelity limit is the drill's own, restated: only `registry.ts` is rewritten and the three successor
body files deleted, so this is main's REGISTRY shape built from this head's other sources. That is
the whole of what the preflight reads.

### 1.4 The rollback preflight, four readings

All on `clara_rt_test` @ 55706 at frontier `0323_trade_invoice_probe_self_exclusion`, through
`node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <path>`.

| # | target | non-terminal runs | verdict | exit |
|---|---|---|---|---|
| A | this head (60 bodies) | `chatTurn_v21`, `claraWork_v5`, `statementFacts_v3` | **ALLOWED** | 0 |
| B | main-shaped previous (57) | the same three | **ALLOWED** | 0 |
| C | main-shaped previous (57) | `chatTurn_v22`, `claraWork_v6`, `statementFacts_v4` | **REFUSED (unsupported_body)** | 1 |
| D | this head (60) | the same three new bodies | **ALLOWED** | 0 |

Reading B is the answer to *"the previous build refuses nothing that the new one carries"*: with a
run parked on each retired pin, the previous image strands nothing, because both images carry
v21/v5/v3 and every body before them.

**Reading C is the cut's rollback verdict, and it is what the runbook must record.** Verbatim:

```
rollback-preflight: REFUSED (global)
  - 1 non-terminal run(s) on chatTurn_v22, which the target image does NOT carry (workflow//./workflows/chatTurn.v22//chatTurn_v22).
  - 1 non-terminal run(s) on claraWork_v6, which the target image does NOT carry (workflow//./workflows/claraWork.v6//claraWork_v6).
  - 1 non-terminal run(s) on statementFacts_v4, which the target image does NOT carry (workflow//./workflows/statementFacts.v4//statementFacts_v4).

The two admissible ways forward are the ones the runbook names: RETAIN every non-terminal bundle in the target …, or DRAIN first and re-run this command until it allows. Elapsed time is not a drain.
```

So **all three bodies strand**, one refusal line each, the moment a non-terminal run of any of them
exists.
Every reading printed `live tasks bound to NO run: 0`, and in all four the database's own frontier
rules (`0195`, `0254`, `0279`) were satisfied by both targets — the refusal is the body census
alone, not the frontier.

CUT-PLAN §2.9's obligation follows unchanged and is now measured rather than reasoned: this wave
REPOINTS three pins, so the previous image is a legal rollback target **only until the first
non-terminal run of v22, v6 or v4 exists**. Step 9 runs immediately after step 7 and is recorded as
a snapshot with its timestamp.

---

## 2 · The upgrade path

### 2.1 What was planted, and through which door

`clara_w4_hosted` on `rigw4h` 55701 started at **309 / `0318_knowledge_fye_pair_applicability`**,
`C.UTF-8`, seeded, carrying wave 4's release-time rows. The three headers were read for the branches
they name, and only those were planted:

| file | branch it names | planted? |
|---|---|---|
| `0320_client_financial_pack_wake_read` | **none** — §0's prestate is mode + 0232's three doors + eleven neighbour pins, and §TAIL is a hash reversal plus catalog posture and ACL reads. Nothing it prints depends on a row. | n/a |
| `0321_work_source_correction_rederivation` | §0.5, "THE DATA-DEPENDENT BRANCH, ENTERED RATHER THAN ASSUMED": `clara.op_receipts` where `fn='cancel_accounting_work'` and `op_key like 'source\_corrected:%'` | **yes** |
| `0323_trade_invoice_probe_self_exclusion` | §0.4 (the census) and §TAIL (T4)'s driven arm: a `clara.trade_invoices` row under an `accounting_work` carrying a non-null `intent_key`, a non-blank reference and no reversed posting | **yes** |

Both rows were minted by calling real doors, driven from a script in the scratchpad that imports the
PRE-CUT tree's own fixtures (`C:\Users\zhant\Desktop\clara-rebuild\packages\db\tests`, `main` at
`7bc5a710f`, 309 files — which is what a 309 database's doors actually are). The sequences are the
two batteries that own those doors: `work-source-correction-supersede.test.mjs` and
`trade-invoice-duplicate-probe.test.mjs`. Nothing was written into the main checkout.

| relation | before | after | the door |
|---|---|---|---|
| `clara.op_receipts` (`cancel_accounting_work` + `source_corrected:`) | 0 | **1** | `buildWorkWorld` → `filedDocument` + `mintLegacyInvoiceFactsTask` + `claimTask` + `persistInvoiceFacts` → `admitJournalWork` + `claimWorkRun` + `openWorkQuestion` → **`clara.revise_document_fact`** as the bookkeeper |
| `clara.trade_invoices` under a keyed Work | 0 | **1** | `freshWorkClient` + `ensureTiChart` + a vendor counterparty → **`clara.admit_trade_invoice_work`** with an explicit intent key |

The rows themselves:

```
[plant] 0321 branch row: op_receipts.op_key = source_corrected:747f4597-…:5fd05921-…
        (reason source_corrected, not_replaced_reason basis_predates_correction)
[plant] 0323 branch row: trade_invoice 5c317f34 reference=ALPHA-2026-0042
        under work 55b6b4f9 status=queued intent_key=ti-wc-46e7d410-…
[plant] census AFTER: 0321 source_corrected receipts = 1 · 0323 keyed trade invoices = 1 · 0323 TAIL-drivable = 1
```

### 2.2 The run, and every branch it entered

```
PGHOST=127.0.0.1 PGPORT=55701 PGUSER=postgres PGDATABASE=clara_w4_hosted \
  CLARA_RIG_DB=1 CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db migrate    # from int2
```

**03:28:59Z → 03:29:05Z, 6 s, exit 0 — `3 new migration(s) applied · 312 total`.**

| file | prestate | tail |
|---|---|---|
| `0320` | `clean — mode FIRST APPLY, 0232's three doors present, 11 neighbour bodies byte-identical` | `OK -- clara._client_financial_pack_core is 0232's body with exactly three reversible edits (proved by hash), the human door is a VIEWER-floored delegate …, clara.wake_get_client_financial_pack is clara_agent_ro's alone with ONE interactive allowlist row, the core is granted to nobody …` |
| `0321` | `clean — mode FIRST APPLY, 0268 cohort present, 16 neighbour bodies byte-identical, **1** source-corrected cancellation receipt(s) on this rig` | `clean — both recut bodies reverse to their pinned pre-images, the two-argument notion is untouched, the typed rule answers all four arms, and the lane is three clara_runtime doors over one ungranted builder` |
| `0323` | `clean — mode FIRST APPLY, 0275 cohort present, 10 neighbour bodies byte-identical, **1** recorded trade invoice(s) under a keyed Work on this rig` | **`driven — the unnarrowed core returns invoice 5c317f34-036e-456b-ad18-5177db9582a0, the narrowed one does not`**, then `clean — two siblings born, five delegated bodies byte-identical, one new clara_runtime EXECUTE and nothing else` |

Both counts read **1** where the from-scratch chain read **0**
(`waveC-merge.md` §4: 0323's "data-dependent arm correctly skipped on a rig carrying no keyed trade
invoice"), and 0323's T4 ran its whole driven block — the vacuity control (the unnarrowed probe must
match the invoice its own particulars were copied from), the narrowing, the `match_count`
restatement, the unknown-key control and the null/blank-key control — rather than the NOTICE.

### 2.3 The two paths converge, measured structurally

Four censuses dumped from `clara_cutint` (55700, the merger's from-scratch 312 chain) and from the
upgraded `clara_w4_hosted`, byte-sorted and diffed:

| census | rows | from-scratch vs upgraded |
|---|---|---|
| every `clara` function: `oid::regprocedure` + `sha256(prosrc)` | **1499** | **IDENTICAL, diff empty** |
| every column: relation, name, type, NOT NULL, default | **4051** | **IDENTICAL** |
| every constraint: relation, name, `pg_get_constraintdef`, `convalidated` | **3103** | **IDENTICAL** |
| every index: `pg_indexes.indexdef` | **947** | **IDENTICAL** |

1499 is wave 4's 1489 plus this cut's ten new functions (0320's 2, 0321's 6, 0323's 2), which is the
whole of what the three files add. The bodies the cut RECUTS or mints, named with their digests,
equal on both paths:

| body | `sha256(prosrc)` (first 16) |
|---|---|
| `clara.get_client_financial_pack(uuid,date,date)` (recut by 0320) | `8a1f39fd4b210049` |
| `clara._client_financial_pack_core(uuid,uuid,date,date)` (new) | `17614a45f00650d7` |
| `clara.wake_get_client_financial_pack(uuid,date,date)` (new) | `d971acded46622c9` |
| `clara.revise_document_fact(uuid,text,jsonb,integer,text,text)` (recut by 0321) | `e0d7ee1c016d1eb7` |
| `clara._question_source_corrected(uuid)` (recut by 0321) | `c1497224413545be` |
| `clara._fact_calendar_day(text)` (new) | `f030aa3ad1286d55` |
| `clara._fact_value_changed(jsonb,jsonb,text)` (new) | `0a5586303dd84c05` |
| `clara._fact_value_changed(jsonb,jsonb)` (untouched, 0321 §TAIL asserts it was not recut) | `7d4f995cc61a615d` |
| `clara._source_correction_rederivation_brief(text)` (new) | `1bfa5da94ad9c503` |
| `clara.source_correction_rederivations(integer)` (new) | `27af16780c824c7c` |
| `clara.settle_source_corrected_rederivation(text,uuid,text)` (new) | `d258639636926e26` |
| `clara.source_correction_successor_brief(uuid)` (new) | `dcce2a919456d352` |
| `clara._trade_invoice_probe_core(uuid,text,jsonb)` / `(…,text)` (0323's pair) | `74215b42802317f0` / `2936baf8496c85b8` |
| `clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)` / `(…,text)` | `d94bbbfde7905d5e` / `a5f92d92e95da6b2` |

### 2.4 The same three on `clara_w4_coll` (55702, `en_US.UTF-8`)

**03:30:11Z → 03:30:12Z, 1 s, exit 0 — `3 new migration(s) applied · 312 total`.** Every prestate
clean, every tail green, and both data-dependent branches took the **empty** arm on this database,
which is the contrast that makes §2.2's entries mean something:

```
#1030 prestate: clean — mode FIRST APPLY, …, 0 source-corrected cancellation receipt(s) on this rig
#1135 prestate: clean — mode FIRST APPLY, …, 0 recorded trade invoice(s) under a keyed Work on this rig
#1135 §TAIL: no recorded trade invoice under a keyed, still-postable Work on this rig — the driven arm is skipped, and T1 to T3 stand alone
```

The same four censuses on this database are byte-identical to the from-scratch chain once both sides
are sorted collation-independently (`LC_ALL=C sort`; sorting inside Postgres differs by server
locale, which is not a difference in content): **1499 / 4051 / 3103 / 947, all diff 0.**

### 2.5 The baselines for the cut's preflight

The cut has **no `reads-wC.mjs` yet**, so both files were exported with wave 4's script, in the shape
`ceremony-w4/README.md` documents.

```
CLARA_MIGRATIONS_DIR=C:/Users/zhant/Desktop/clara-wt/int2/packages/db/migrations \
PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=<db> \
  node docs/plan/active/riders-2026-09-20/ceremony-w4/reads-w4.mjs --export-fingerprint <file> --no-state
```

| file | source | ledger | structural keys | reference counts | taken |
|---|---|---|---|---|---|
| **`fp-wC-hosted.json`** (PRE) | `clara_w4_coll`, 55702, **before** its upgrade | 309 / `0318_knowledge_fye_pair_applicability` | **11 346** | 58 | 03:28:38Z |
| **`fp-wC-upg.json`** (POST) | `clara_w4_hosted`, 55701, **after** its upgrade | 312 / `0323_trade_invoice_probe_self_exclusion` | **11 356** | 54 | 03:29:59Z |

The cut adds **10 structural keys** (11 356 − 11 346), which is the ten new functions and nothing
else — no relation, column, constraint or index moved, which §2.3 measured independently.

Both paths, verbatim, for the release worker:

```
C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\2d0e3faa-4367-4726-8208-67089ecdd96a\scratchpad\wC\fp-wC-hosted.json
C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\2d0e3faa-4367-4726-8208-67089ecdd96a\scratchpad\wC\fp-wC-upg.json
```

**The post baseline was rehearsed, and the wave-4 script generalises to this cut's arithmetic.**
`reads-w4.mjs --post --baseline fp-wC-upg.json --frontier-before 0318_knowledge_fye_pair_applicability
--no-state` against the upgraded `clara_w4_hosted` exits **0, `== verdict: CLEAN ==`**, with zero
STOP, zero GAP and zero `env`:

```
ok   the ledger reads 309 + 3 = 312 at 0323_trade_invoice_probe_self_exclusion
ok   every one of the 3 new migrations has a ledger row at its file checksum - missing=0 checksum-mismatch=0
ok   drift gate: all 312 applied rows match their files
keys compared: 11356  ·  equal: 11356  ·  env: 0
```

Its reference rows confirm the planting reached the two relations the cut's branches turn on
(`op_receipts 667`, and a `trade_invoices` row under a keyed Work) beside wave 4's own
(`accrual_adjustments 2`, `document_capabilities 240`, `document_extractions 12`,
`document_processing_tasks 9`, `document_regions 16`). **What this does NOT give the release** is a
cut-specific preflight: wave 4's script knows wave 4's 21 files, their 189 pins and their hand
checks, and none of that covers 0320/0321/0323. The baselines are exact; a `reads-wC` is still owed
(finding N1).

---

## 3 · The browser suite, twice

### 3.0 The environment, and the one file this gate added

The merge could not `next build` in int2 for lack of `apps/web/.env.local`. The two public lines
were copied from the main checkout and nothing else:

```
grep -E "^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=" ../../clara-rebuild/apps/web/.env.local \
  > apps/web/.env.local        # 2 lines
git check-ignore -v apps/web/.env.local   # .gitignore:6:.env*
```

Both runs used the int2 triple, `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600`,
`CLARA_E2E_NEXT_PORT=3601`, `CLARA_E2E_RUNTIME_PORT=3602`, through
`pnpm --filter @clara/web e2e` — never a bare `npx playwright test` (#865). Run 1 built; run 2 used
`--no-build` **on purpose**, so the two runs measure the SAME artifact, which is what makes a
difference between them a flake rather than a rebuild.

### 3.1 Run 1 — with the build

`pnpm --filter @clara/web e2e`, 03:30:56Z → 03:52:25Z. The build is itself a result and is reported
in §5; the suite then ran **596 cells across 54 spec files, one worker**.

| | |
|---|---|
| cells | **596** |
| passed | **588** |
| failed | **1** |
| skipped | **7** |
| wall clock, suite only | 19.8 m |
| exit | 1 (the one failure) |

**The seven skips are the specs' own fixture gates, not environment failures**, and each names its
reason in the source:

| cells | spec | the spec's own reason |
|---|---|---|
| 275–278 | `interview-walk.spec.ts:211,243,260,316` | `test.skip(!target, "review/merge supplies the isolated COMPLETE / CANCEL / RACE client/thread fixture")` |
| 438 | `reports-download-walk.spec.ts:64` | `test.skip(!provisioned, "run-reports-download-walk.mjs supplies the client/artifact fixture")` |
| 439 | `reports-download-walk.spec.ts:125` | `test.skip(PENDING_ID === "", "the harness supplies a second, unfinished export")` |
| 497 | `signup-confirm-pending.spec.ts:261` | `test.skip(true, "the wall is wired; the SKELETON below covers this arm instead")` |

### 3.2 Run 2 — the same artifact, `--no-build`

`pnpm --filter @clara/web e2e -- --no-build`, 03:56:34Z → 04:18:10Z.

| | run 1 | run 2 |
|---|---|---|
| cells | 596 | **596** |
| passed | 588 | **589** |
| failed | **1** | **0** |
| skipped | 7 | **7** (the same seven) |
| wall clock | 19.8 m | **21.6 m** |
| exit | 1 | **0** |

The two runs differ in exactly one cell, and it is the one run 1 failed.

### 3.3 The one red, diagnosed — and it is the same flake wave 4 recorded

```
1) [chromium] › e2e\work-question-walk.spec.ts:285:1 › B4: the SAME question is answered from
   Needs-you, and the row leaves without dumping focus

   Error: focus was dumped onto the document body when the row disappeared
   expect(received).not.toBe(expected)   Expected: not "BODY"
   at apps\web\e2e\work-question-walk.spec.ts:322:95
```

**It did not reproduce.** Green in run 2, and green in two isolated re-runs taken straight after
(`pnpm --filter @clara/web e2e -- --no-build work-question-walk`, this gate's own triple):

| attempt | window | result |
|---|---|---|
| 1 | 04:19:13Z → 04:20:52Z (1.6 m) | **14 / 14 pass**, exit 0 |
| 2 | 04:20:52Z → 04:22:21Z (1.4 m) | **14 / 14 pass**, exit 0 |

**Ownership check against this cut's own diff, not assumed.** The cut touches **one** file under
`apps/web` — `lib/documents/doors.ts`, and the diff is **comment-only** (`+8 / −2` lines of JSDoc
adding `value_unchanged` to a refusal list that renders verbatim). `git log origin/main..HEAD --
apps/web/e2e/work-question-walk.spec.ts` is empty, and so is the same query for
`components/work/work-question-form.tsx`. Nothing in this cut's diff can reach a focus target after a
list row's removal.

**Same cell, same shape, already classified one wave ago.** `wave4-gates-B.md` §3's first RED is this
exact cell with this exact message: red in run 1 only, green in run 2, green in two isolated re-runs,
and classified there as *"a load-sensitive, non-deterministic focus-landing race, not owned by any
wave-4 lane and not reproducible off the loaded host"*, with the remedy named — assert the row's
removal completed AND focus landed on the Needs-you heading, rather than sampling focus at one
moment. Wave 3's gate B recorded the same shape for `responsive-shell-walk` (#736).

**Classification here: the same, and now twice over.** Not a finding above note by this gate's own
rule (a cell red in BOTH runs would be), but the second consecutive gate run to catch it, which is
the case for finally filing the ticket wave 4 proposed — see F6.

No other cell reddened in either run, so there is **no cell red in both runs** and nothing above note
from the browser suite.

### 3.4 The wave's own walks (CUT-PLAN §4.5)

These are runtime walks, not browser specs, and they ran on the drill's cluster
(`rigcut` 55706) before it was dropped.

| walk | command | result |
|---|---|---|
| **the chat walk** | `PGDATABASE=clara_wave_b_ci … node tests/chat-turn-v22-e2e.mjs` | **`CHAT TURN V22 E2E: ALL PASS (28416ms)`**, exit 0, 5 PASS lines |
| **the Work walk** | `PGDATABASE=clara_rt_test … node tests/fixed-asset-acquisition-e2e.mjs` | **`FIXED ASSET ACQUISITION E2E: PASS`**, exit 0, 7 PASS lines |
| **the statement walk (#1037)**, World half | the drill's third leg (§1.2) | **PASS** — S1 resumes on `statementFacts_v3` inside build B, S2 admits on v4 with every line cited |
| … its two batteries | `node --test tests/statement-facts-v4-citation-db.test.mjs` / `…-citation.test.mjs` | **7 / 7** and **10 / 10**, exit 0 |

The chat walk's five PASS lines, verbatim:

```
[v22-e2e] engine ready; serving bundle=clara-work/v6 digest=e716d9b046d60052b579d2b6a4f69ce72407393b4ff259a391e479d8f2fca0a5
[v22-e2e] PASS 1: turn one admitted one trade-invoice Work and acknowledged nothing
[v22-e2e] PASS 2a: the look-alike ended the turn — question on the transcript, no invoice, no acknowledgement
[v22-e2e] PASS 2b: the person answered in a turn of their own, and one acknowledgement rode with the recording
[v22-e2e] PASS 3: both Works ran on clara-work/v6 and their receipts record its digest
[v22-e2e] PASS 4: one chat turn, a split nobody had confirmed refused, then two advances discharged by one entry and two application rows
```

PASS 4 is CUT-PLAN §4.5's #931 item 10 leg — one chat turn naming two advances, one Work, one
posted entry, two `clara.staff_advance_applications` rows — driven with the unconfirmed split
refused first as the control.

The Work walk's seven PASS lines, verbatim:

```
[fa-acq-e2e] engine ready; serving bundle digest=e716d9b046d6…            (claraWork_v6)
[fa-acq-e2e] PASS 1+2: admit -> run -> one entry, one receipt and ONE register row in one commit
[fa-acq-e2e] PASS 2a: claraWork_v6 parks with the #933 proposal block — start_date 2026-09-01 (the ::text cast, proved end to end), residual 0, no method grounded
[fa-acq-e2e] PASS 2b: the dependent question opens on the ASSET, a person answers it, the run applies it through the particulars door and settles
[fa-acq-e2e] PASS 3: a lost acknowledgement replays onto the same Work and births no twin
[fa-acq-e2e] PASS 3b: with one completed sibling on 1510 the proposal grounds — straight_line over 60 months
[fa-acq-e2e] PASS 5: the particulars door re-reads LIVE authority, refuses a demoted initiator by name, and writes no journal when it succeeds
[fa-acq-e2e] PASS 4: crash after commit / before checkpoint -> resume -> replayed receipt, one entry, one receipt, the SAME asset
```

PASS 2a and 2b are A10's park-with-proposal and confirm path, which is CUT-PLAN §4.5's Work-walk
clause. **A8 and A9's enrolment question is not driven by this walk, and this gate does not close
it.** Lane C1 recorded it as owed and asked the orchestrator to accept it that way
(`waveC-lane01-fix.md` §7 marks A5, A8 and A9 PARTIAL; §10 item 2 asks for AC3's Work-walk clause to
be accepted as PARTIAL with follow-ups 1–3 filed). What this gate adds is a measurement rather than
an opinion: the walk's seven PASS lines are the seven above, and none of them opens an enrolment question.
Three more legs CUT-PLAN §4.5 names — the two accrual World legs (#937, #942) and #915's prepayment
World leg — are likewise not driven by any walk run here, and lane C1's follow-ups 1–3 are where
they live.

---

## 4 · Static gates

| gate | command | result |
|---|---|---|
| `registry-view.test.mjs` | `node --test packages/runtime/tests/registry-view.test.mjs` | **7 / 7**, 24.6 s — the three new versions present, every pin in `workflowBodies`, `registryModule[id] === workflows[className]` |
| freeze chain | `node scripts/check-frozen-workflows.mjs` | **OK — 347 frozen / 60 `"use workflow"` / 3 retired**, the merger's figures reproduced |
| additions-only | `… --compare-base origin/main` | **OK — 322 existing entries retain the same hash and deployed flag, 25 additions, 3 retirements** |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — emittable set unchanged at six kinds (`freeform_result`, `work_accepted`, `work_status`, `work_result`, `work_question`, `knowledge_receipt`); allowlist unchanged at three |
| typecheck | `pnpm typecheck` | **exit 0** — `packages/runtime typecheck: Done`, `apps/web typecheck: Done`, 03:52:31Z → 03:53:34Z |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** — all four workspaces, with the freeze-lint, registration, evaluator and enqueue-traceability self-tests all OK under `CI=true` |

`--lock-deployed` was **not** run, and must not be before the image is live: it is the ceremony's
step 11a, and `waveC-merge.md` §3 records why (it would lock this cut's 25 plus wave 4's 10).

---

## 5 · Findings

**Nothing above note.** No gate failed, no cell was red in both browser runs, no migration prestate
or tail refused, and no census disagreed. What follows is one MODERATE item that is owed work rather
than a defect, and five notes.

### F1 · MODERATE — the cut has no preflight script of its own, and the release needs one

The baselines in §2.5 are exact and the wave-4 script's ledger arithmetic generalises
(`309 + 3 = 312`), but `reads-w4.mjs` knows **wave 4's** 21 files, their 189 `sha256(prosrc)` pins
and their sixteen hand checks. Nothing in it reads 0320's eleven neighbour pins, 0321's sixteen,
0323's ten, or either of the two data-dependent censuses this gate had to plant for. A hosted
pre-window read with this script would print a CLEAN fingerprint comparison and check **none** of
the three files' own preconditions — the refusals that would otherwise fire inside the window.

* **Evidence**: `ceremony-w4/README.md` ("What this script does NOT verify"), and the file's own
  `--plan` roster, which is generated from wave 4's pending set.
* **Owner**: the cut's release-prep worker, as `ceremony-w3` → `ceremony-w4` were written. It is
  release work, not a defect in the head, and it blocks nothing in this gate.
* **What is already done for it**: both baselines, and a `--post` run proving the arithmetic route
  (`--frontier-before 0318_knowledge_fye_pair_applicability`) answers on a 312 database.

### F2 · NOTE — the drill's own output never prints the stranded census

CUT-PLAN §4.4's drill proves the carry by resuming each parked run inside build B, and build B
cannot start at all if the census refuses — but no line in
`packages/runtime/tests/two-build-cutover-e2e.mjs`'s output states the number, so "stranded census
0" is not readable from a drill log. §1.2 read it by booting `scripts/serve.mjs` separately. Worth a
line in the drill, or in the runbook, so the next gate does not have to build the same scaffolding.

### F3 · NOTE — `world-gate`'s peak-RSS line is blank on this host

`peak RSS unavailable (no /proc on this platform)`. The launcher says so itself and it cannot redden
a passing leg; recorded only so nobody reads the drill's log as evidence about memory.

### F4 · NOTE — the Next server logs an aborted-stream error between passing browser cells

`[WebServer] ⨯ Error: failed to pipe response` / `[cause]: TypeError: terminated`, several times per
run. Each occurrence sits between two green cells (first at run 1's cell 224/225), and it is the
server logging a streamed response whose client navigated away — Playwright's own teardown. Not a
test failure and not new to this head; named so a reader scanning the log for `Error` does not stop
on it.

### F5 · NOTE (carry-forward, not new) — three legs CUT-PLAN §4.5 buys are still not driven

§4.5 says the walks must carry #937 and #942's two accrual World legs and #915's prepayment World
leg, on top of #931 item 10. #931 item 10 IS driven (the chat walk's PASS 4). The other three are
not driven by any walk this gate ran, which matches what lane C1 already recorded and handed up:
`waveC-lane01-fix.md` §7 marks A5, A8 and A9 PARTIAL and its §10 item 2 asks the orchestrator to
accept AC3's Work-walk clause as PARTIAL with follow-ups 1–3 filed. This gate adds the measurement,
not a new claim.

### F6 · NOTE — `work-question-walk.spec.ts:285` has now flaked in two consecutive gate runs

§3.3 has the whole diagnosis. It is a note by this gate's own rule (green in run 2 and in two
isolated re-runs), but it is the SECOND gate run in a row to catch it —
`wave4-gates-B.md` §3 caught the identical cell with the identical message one wave ago and
recommended a ticket that was not filed. The remedy it named is the right one: assert that the row's
removal completed AND that focus landed on the Needs-you heading, instead of sampling the document's
active element at one moment. **Recommended: file it now**, as its own small ticket against
`apps/web/e2e/work-question-walk.spec.ts`, so the next gate does not spend a third run re-deriving
the same classification. The orchestrator owns filing; this gate writes to no GitHub object.

### The one thing this gate CLOSED that the merge left open

`waveC-merge.md` §6 and §8 record the web `next build` on this head as **UNVERIFIED**, because int2
had no `apps/web/.env.local` and `scripts/check-public-key.mjs` refuses before compilation. With the
two `NEXT_PUBLIC_SUPABASE_*` lines copied in, the build is green on this head:

```
[check-public-key] NEXT_PUBLIC_SUPABASE_ANON_KEY accepted — class: publishable
▲ Next.js 16.3.3 (Turbopack)
✓ Compiled successfully in 17.3s
  Finished TypeScript in 39.4s
✓ Generating static pages using 23 workers (35/35) in 4.0s
```

The four `[checkout] STRIPE CONFIGURATION REFUSED AT STARTUP: CLARA_STRIPE_LIVEMODE is not set …`
lines during page collection are the harness's own deliberate absence, which `e2e/run.mjs`'s header
states and explains at length; they are not a build failure and the build exits 0.

---

## 6 · Rig hygiene, and what is left on the rigs

- **`rigcut` (55706) was dropped** — `sudo pg_dropcluster 17 rigcut --stop`, exit 0, and
  `pg_lsclusters` no longer lists it. It was created for this gate, held only `clara_wave_b_ci` and
  its template copy `clara_rt_test`, and ran exactly one from-scratch chain.
- **`clara_w4_hosted` (55701) and `clara_w4_coll` (55702) are now at 312 / `0323…`** — both were
  upgraded by this gate, on purpose, and neither is a pre-window baseline any more.
  `clara_w4h_pre` on the same cluster is untouched at **288 / `0293…`** (wave 4's preserved
  pre-window copy).
- `clara_cutint` (55700) is untouched at 312 / `0323…` and was only READ (four censuses). No World
  was bootstrapped on it by this gate.
- `.scratch/two-build/` in int2 holds four images (the drill's three plus `mainshape`). It is
  gitignored and was left in place for a re-run; `removeScratchTree()` clears it.
- No lane cluster (`rl01`–`rl10`, 55741–55750) was touched, no port in 55741–55749 was used, and
  the only ports this gate bound were 3600/3601/3602 (its own Playwright triple), 3699 (the boot
  probe, released) and 55706 (its own cluster, dropped).
- No process this gate did not start was stopped. The boot probe was ended by the same command that
  started it.

---

## 7 · Anything unverified

1. **The `world-gate` peak-RSS figure for the drill.** `peak RSS unavailable (no /proc on this
   platform)` — a Linux-only reading, so this gate has no memory figure for the drill and the
   2048 MB budget was neither approached nor measured here.
2. **The rollback target is a registry-rewrite stand-in for main's image, not main's image.** §1.3
   states the fidelity limit and the two independent readings that make 57 the right roster; what
   is NOT proved is that main's non-registry sources register the same set, and nothing short of
   extracting `7bc5a710f`'s own bundle would prove it. The release's step 9 extracts the LIVE
   previous image's bundle, which is the reading that counts.
3. **The stranded-census reading uses staged run rows.** §1.2's three rows are inserted the way
   `rollback-preflight.test.mjs` inserts them, because the census reads rows; they are not runs an
   engine created. The drill's own legs prove the resume with real runs.
4. **No `reads-wC.mjs` was written or rehearsed.** §2.5 — the baselines are exact and the wave-4
   script's ledger arithmetic generalises, but no preflight covers 0320/0321/0323's own preconditions.
5. **Hosted itself.** Every number here is a rig reading. `clara_w4_hosted` is a stand-in whose
   row population is this gate's planting plus wave 4's, not hosted's.
6. **The whole runtime suite and the whole `packages/db` suite** were not re-run here; they are
   `waveC-merge.md` §6's, at the same head, and this gate ran only CUT-PLAN §4.2's `registry-view`
   plus the three walks and the drill.
7. Each lane's and the merger's own unverified lists stand unchanged.


