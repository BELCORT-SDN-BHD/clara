# Cut phase — the integration merge of lanes C1 and C2

**Branch** `integration/riders-cut` in `C:\Users\zhant\Desktop\clara-wt\int2`, cut from
`origin/main` `7bc5a710f`. **Head verified: `e871c59da`** — every check in §6 was run at that commit, and this report is
the one commit that sits on top of it. Nothing was pushed, no PR was opened, no
GitHub object was written, no lane worktree and no main-checkout file but this report was touched.

| commit | what |
|---|---|
| `de7ee2e06` | merge `riders/wC-lane02` (`4198c3f70`, 10 commits) — `statementFacts_v4`, **no conflict** |
| `1391b87d9` | merge `riders/wC-lane01` (`195250eb7`, 37 commits) — `chatTurn_v22` + `claraWork_v6`, migrations 0320/0321/0323, ONE conflict |
| `fdab2ff1a` | the seventeen `waveC-*` lane reports, reviews, fix rounds and rechecks, copied from the main checkout |
| `e871c59da` | `fix(integration)` — the one cross-lane stale pin the merge could not see |

**Merge order.** The prompt ordered C2 first, then C1; CUT-PLAN §3.2 says the reverse. The order does
not change the result here — the two lanes' `registry.ts` hunks are disjoint except in the
`workflowPins` block, which merged cleanly either way — and wave-4 rule 3's real obligation, that the
merger read the two hunks against each other rather than trust the auto-merge, was met and is what
found the finding in §5.

---

## 1 · Per lane: the merge and every conflict, resolved by intent

### Lane C2 — `riders/wC-lane02` → `de7ee2e06`

**No conflict.** 17 files, +2697 / −28. Six files are shared with lane C1 and all six auto-merged;
each was read afterwards rather than trusted:

| shared file | why it did not collide |
|---|---|
| `packages/runtime/workflows/registry.ts` | C2's five edits sit at lines 41/361/810/1065/1102, C1's at 30/217/953/1054/1098 — disjoint except the pins block, where the two hunks touch different keys |
| `frozen-workflows.json` | disjoint path keys; the union is exact (§3) |
| `packages/runtime/plugins/startWorld.ts` | C2 rewrote one comment at `:216`, C1 added an import at `:45` and a banner at `:317` |
| `packages/runtime/scripts/parts-parity-exemptions.mjs` | C2 appended three rows at `:352`, C1 re-fingerprinted the reconciler block at `:143` and appended three rows at `:428` |
| `CONTEXT.md` | C2 amended one paragraph at `:1268`, C1 amended `:49` and appended five terms at the end; no duplicate term survives the merge |
| `packages/runtime/README.md` | **the one conflict**, below |

### Lane C1 — `riders/wC-lane01` → `1391b87d9`

72 files, +18014 / −92. **One conflict: `packages/runtime/README.md`.**

*The conflict.* CUT-PLAN §2.8 tells every cut lane to write a new
`### The … pins the wave 2026-09-25 cut moved` section above line 22. Both lanes obeyed, at the same
position: C2's reads "The pin the wave 2026-09-25 cut moved" and names `statementFacts → v4`; C1's
reads "The two pins the 2026-09-25 cut phase moved" and names `chatTurn → v22` and `claraWork → v6`.

*The resolution, by each side's primary source.* One section, `### The three pins the 2026-09-25 cut
phase moved`, carrying **both** lanes' bodies verbatim: C1's `claraWork_v6` / `chatTurn_v22` prose and
its frozen-module table first, then C2's two `statementFacts_v4` bullets under a one-line transition.
Nothing was dropped and nothing new was invented. The intro paragraph is the only rewritten text,
because C1's contained a sentence that the merge itself falsified:

> "`statementFacts` is still pinned to `statementFacts_v3` at this commit."

That sentence is true on lane C1 alone and false on the integrated head. It is replaced by an intro
naming all three pins and stating that chatTurn v1–v21, claraWork v1–v5 and statementFacts v1–v3 all
stay exported under policy (c). The 2026-09-18 and 2026-09-15 sections are untouched, so the file
still reads as the version ledger in prose: three pins 2026-09-25, two pins 2026-09-18, three pins
2026-09-15.

---

## 2 · The fifteen registry edits, read against each other

Five per class, as `registry.ts:1030-1034` states the law. All fifteen are present on the merged head
and none is duplicated:

| class | import | dispatch | re-export | `workflowBodies` | `workflowPins` |
|---|---|---|---|---|---|
| chatTurn | `:33` | `:238` | `:994` | `:1097` | `:1144` |
| claraWork | `:39` | `:364` | `:1012` | `:1103` | `:1145` |
| statementFacts | `:46` | `:392` | `:846` | `:1110` | `:1148` |

The textual shapes are load-bearing, not cosmetic (CUT-PLAN §2.2), so they were proved by the
consumer rather than by eye: `tests/scratch-image.mjs`'s own `deriveVersionPair` +
`rewriteRegistryToPrevious` were run against the merged `registry.ts` for all three classes, and each
derived the right pair and applied all five substitutions —
`chatTurn_v22 → v21`, `claraWork_v6 → v5`, `statementFacts_v4 → v3`. A substitution that does not
apply throws there, so this is the two-build drill's own gate answered early.

**The boot pins, observed rather than derived.** Booting the merged head through the supported entry
point (`packages/runtime/scripts/serve.mjs`, which is what the image's `CMD` runs) against
`clara_cutint`'s clone printed:

```
[clara-runtime] serving git_sha=e871c59da350c0181e9abd91d4eb127351c4636a
  frontier=0323_trade_invoice_probe_self_exclusion(312) bodies=60
  pins closeExample=closeExampleV1 chatTurn=chatTurn_v22 claraWork=claraWork_v6
  documentIngest=documentIngest_v2 invoiceFacts=invoiceFacts_v1 statementFacts=statementFacts_v4
  witnessFacts=witnessFacts_v3 payrollFacts=payrollFacts_v1 agreementFacts=agreementFacts_v1
  autoDraft=autoDraft_v10 firmInterview=firmInterview_v3 clientOnboarding=clientOnboarding_v5
  bankAgent=bankAgent_v1 closePrep=closePrep_v1
[clara-runtime] stranded bodies n=0 (every live run's body is carried by this image)
[clara-runtime] durable world started
[clara-runtime] bundle clara-work/v6 digest=e716d9b046d60052b579d2b6a4f69ce72407393b4ff259a391e479d8f2fca0a5
```

All three new pins are on the boot line, the census refuses nothing, and **the sixth
`CLARA_WORK_BUNDLE_V6_BANNER` line prints** — CUT-PLAN §5 R2, the last cut's one real defect, is
closed on the integrated head and not only on the lane.

---

## 3 · The manifest

**No re-hash was needed.** `node scripts/check-frozen-workflows.mjs --update` on the merged tree
produced **no diff at all**: the two lanes' additions are disjoint path keys and the union git
produced is byte-exact.

| measure | `origin/main` | merged head |
|---|---|---|
| frozen entries | 322 | **347** |
| `"use workflow"` modules | 57 | **60** |
| recorded retirements | 3 | **3** |

`--compare-base origin/main`: **322 existing entries retain the same hash and deployed flag, 25
additions, 3 recorded retirements** — additions-only, proven, not asserted. Files added 25, removed
**0**, changed **0** (no sha and no `deployed` flag moved on any pre-existing entry). The 25:

- `lib/`: `accrual-basis.v2.ts`, `fa-particulars-proposal.ts`, `opening-parse.mjs`,
  `payroll-fact-state.ts`, `prepayment-schedule-basis.ts`, `revenue-recognition-basis.ts`,
  `staff-expense-claim-basis.v2.ts`, `trade-invoice-basis.v2.ts` (8)
- `chatTurn.v22.*`: `.ts`, `.impl.ts`, `.prompt.ts`, `.tools.ts`, `.usage.ts` (5)
- `claraWork.v6.*`: `.ts`, `.impl.ts`, `.prompt.ts`, `.tools.ts`, `.bundle.ts`, `.errors.ts`,
  `.schemas.ts` (7)
- `statementFacts.v4.*`: `.ts`, `.impl.ts`, `.behavior.mjs`, `.citations.mjs`, `.prompts.mjs` (5)

### `--lock-deployed` was NOT run, and should not be

The work order asked for the manifest to be "re-locked ONCE on the merged tree" with
`--lock-deployed`. That command was not run, deliberately, and the manifest is correct without it:

1. `--update` is the local re-baseline and it is a **no-op** here, so there is nothing to re-lock.
2. `--lock-deployed` is the CEREMONY act, not a cut gate. `packages/runtime/README.md:1037-1039` and
   CUT-PLAN §2.4: run it "and commit the manifest **after** the image is live — locking before deploy
   would freeze a body that no parked run can yet exist for." It locks **every** unlocked entry
   globally, which today means this cut's 25 **plus wave 4's 10** (`payrollFacts.v1.*`,
   `agreementFacts.v1.*`) — 35 entries that would become immutable against `origin/main` before the
   image serves, so any pre-release fix to a v22/v6/v4 file would then be refused `REHASHED-VS-BASE`.
3. Lane C1's own fix round already ruled the same way and handed the question up:
   `waveC-lane01-fix.md` §8 records "**`--lock-deployed` has not been run**, by decision
   (C1-SPEC-08), and belongs to the release ceremony's step 11a", and its §10 asks the orchestrator to
   confirm "that CUT-PLAN §2.4 beats AC2's `--lock-deployed` wording".

The command belongs in the release runbook's step 11a, where the operator first confirms the unlocked
set is exactly this cut's 25 plus wave 4's 10.

---

## 4 · The chain, from scratch on a disposable cluster

Cluster `rigw4`, `127.0.0.1:55700`, per the #867 recipe (`packages/db/README.md`).

| step | result |
|---|---|
| `drop database clara_w4int` (wave 4's, 309 files) | done; no other database on the cluster |
| `node scripts/role-census-reset.mjs` (read-only) | 20 `clara%` roles; all six post-0154 roles dependent-free once the database was gone |
| `CLARA_ALLOW_DESTRUCTIVE=1 … --apply` | dropped **6** roles (`clara_stripe_webhook`(+`_login`), `clara_auth_wall`(+`_login`), `clara_invite_preview`(+`_login`)); cluster at **14**, 0154's pin, exact match |
| `createdb clara_cutint` + `pnpm --filter @clara/db migrate` | **312 new applied · 312 total**, `0001` → `0323_trade_invoice_probe_self_exclusion` |
| roles after the chain | back to **20**, exactly as the recipe predicts |
| second `migrate` | **0 new applied · 312 total**, no drift |
| `pnpm --filter @clara/db seed` | 2 seed files |

**The count is 312, not the 311 the work order expected.** The difference is
`0323_trade_invoice_probe_self_exclusion`, which lane C1's fix round added under CUT-PLAN §5 R7 ("the
overflow block for the cut phase starts at 0323"); `waveC-lane01-fix.md` records it and the lane's own
frontier as 312 / 0323. **`0319` and `0322` are absent from the tree — reserved and unused, as
planned** (§1.2 A4 and §3.2).

All three wave-C migrations took their **FIRST APPLY** branch on this chain, and each printed its own
prestate and tail verdict:

- `0320` — "prestate: clean — mode FIRST APPLY, 0232's three doors present, 11 neighbour bodies
  byte-identical"; tail OK.
- `0321` — "mode FIRST APPLY, 0268 cohort present, 16 neighbour bodies byte-identical"; §TAIL clean.
- `0323` — "mode FIRST APPLY, 0275 cohort present, 10 neighbour bodies byte-identical"; §TAIL clean,
  with its data-dependent arm correctly skipped on a rig carrying no keyed trade invoice.

---

## 5 · The one finding, and its fix

**`fix(integration)` `e871c59da` — `tests/chat-turn-v22-tools.test.mjs` named the wrong
statementFacts pin.** CUT-PLAN §5 R9's class exactly: the cell titled "the OTHER classes are
untouched by this cut" carried

```js
assert.equal(registry.workflowPins.statementFacts, "statementFacts_v3", "statementFacts_v4 is lane C2's");
```

True on lane C1 alone, false the moment lane C2's #1037 repoint merged, and **no cell on either
branch could see it**. The file's own comment two lines above records the same trap firing once
already inside lane C1 (the `claraWork` literal, moved when #1030 landed); this is that trap one lane
boundary further out.

- **Seen red at the merged head before the fix**: `expected 'statementFacts_v3', actual
  'statementFacts_v4'`, the file's other 20 cells green.
- **Green after**: 21 / 21.
- The literal moves to `statementFacts_v4` with a comment recording why;
  `tests/f-a2-statement-activation.test.mjs:83` remains the owner of that pin's own assertion.
- No production code and no migration changed, so the from-scratch chain above stands at the head.

**What else was hunted and found clean.** Every `workflowPins.<class>` literal assertion in
`packages/runtime` was read (27 sites): all the others derive the pin rather than spell it, or belong
to the class's own owner file. `workflowBodies` is never asserted by count. The gate-chain prefix in
`packages/db/package.json` is byte-identical to main's with exactly three appended entries in
migration order. No `statementFacts` mention in a lane-C1 file, and no `chatTurn`/`claraWork` mention
in a lane-C2 file, is stale.

---

## 6 · Checks on the merged head, with counts

Environment: `PGHOST=127.0.0.1 PGPORT=55700 PGUSER=postgres CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`
on `rigw4`. Everything below was run at `e871c59da` unless the row says otherwise.

| check | result |
|---|---|
| `pnpm typecheck` | **exit 0** (`apps/web` and `packages/runtime` both Done) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0**, all four workspaces |
| `pnpm --filter @clara/runtime build` | exit 0, `.output/server/index.mjs` 11.8 MB |
| `node scripts/check-worker-paths.mjs` | OK — 2 spawn sites; built bundle verified against the deployed layout |
| `node scripts/check-workflow-bundle.mjs` | OK — **14 pinned classes, 60 superseded bodies still ship**, chatTurn pinned at v22 with its step directive, engine stamp and `freeform_result` emitter (**46 checks**) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — emittable set **unchanged at six kinds**; every exemption tuple matched exactly once across both lanes' rows |
| `node scripts/check-frozen-workflows.mjs` | OK — **347 frozen / 60 `"use workflow"` / 3 retired** |
| `… --compare-base origin/main` | OK — **322 unchanged, 25 additions, 3 retirements** |
| `… --update` | **no diff** (§3) |
| `… .selftest.mjs` / `… .registration.selftest.mjs` | OK / OK |
| `registry-view.test.mjs` | **7 / 7** — the three new versions present, every pin in `workflowBodies`, `registryModule[id] === workflows[className]` |
| `p6-1-parts-parity.test.mjs` | **22 / 22** |
| `p6-1-chatturn-v16.test.mjs` | **29 / 29** |
| `local-db-gate-drivers-census.test.mjs` | **8 / 8** (the new `chat-turn-v22-e2e.mjs` is on the roster) |
| `built-bundle-gate.test.mjs` | **7 / 7** |
| `runtime-contracts.test.mjs` | **2 / 2** |
| `rollback-preflight.test.mjs`, pristine database | **44 / 44** |
| **the WHOLE runtime suite** (`node --test --test-concurrency=1 "tests/**/*.test.mjs"`, 343 s) | **3156 tests, 3136 pass, 3 fail, 17 skipped** — all three fails are known reds, see below |
| **the WHOLE `apps/web` unit suite** (`node scripts/run-tests.mjs`, 81 s) | **5173 tests, 5171 pass, 0 fail, 2 skipped** |
| the three new migrations' db batteries, full 256-gate chain | **28 / 28** |
| the four touched db test files, full gate chain | **89 / 89** |
| `operation-census` + `rig-isolation` against `clara_cutint` | **33 tests, 32 pass, 0 fail, 1 skipped** (T19 skips itself without `CLARA_RIG_ALLOW_RESET`, which RIG.md forbids) |
| gate-chain tokens in `packages/db/package.json` | **128 gates**; main's 125 as an identical prefix, then `client-financial-pack-wake-read` (0320), `work-source-correction-rederivation` (0321), `trade-invoice-probe-self-exclusion` (0323) **in migration order** |
| the web pins corpus, re-measured (wave-4 rule 7) | `tests/firm-scope-db-pins.test.ts` **22 / 22** — three migration files are new and none needed a reviewed-barrier row |
| the web parts census (CUT-PLAN §2.6) | **no-op, run and reported as such**: no wire kind added, `apps/web/lib/parts/**` and `test/manifest.txt` untouched by both lanes, `catalog.test.tsx` still totals **31 (29 render branches + 2 status resolvers)**, and the `ClaraPart` arithmetic comment still reads 31. The one `apps/web` file the cut touches (`lib/documents/doors.ts`) is a comment-only change |
| `tests/version-cutover-e2e.mjs` (§4.3) | **ALL PASS** — the parked `chatTurn_v7` run resumes on its ORIGINAL body while the newest derived export is `chatTurn_v22`; the scoped/unscoped preflight split holds with 20 unrelated parked runs present |
| `tests/chat-turn-v22-e2e.mjs`, the chat walk (§4.5) | **ALL PASS** (17.6 s), five legs; serving `bundle=clara-work/v6 digest=e716d9b0…` |
| `tests/fixed-asset-acquisition-e2e.mjs`, the Work walk (§4.5) | **PASS**, all six legs, including `claraWork_v6`'s #933 proposal park and the confirm path |
| the 16 NEW runtime test files, under WSL as user `runner` (`/opt/node/bin/node --test`) | **183 tests, 183 pass, 0 fail** |

### The three runtime-suite reds, each identified

1. `scanner rejects EICAR, encrypted PDF, and XML entity expansion` — **#693**, Windows Defender eats
   the fixture. RIG.md's standing list.
2. `(#806) this host's OWN probe: pg_dump/psql are on PATH here` — they are not on this host's PATH.
   RIG.md's standing list.
3. `637.pf: B2 — a name scope may NOT allow while an out-of-scope body is stranded` —
   **shared-database contamination**, the class CUT-PLAN §4.1 names (it names the sibling cell `B3`;
   on this rig the leftovers land on `B2`). Proven to be contamination rather than a defect, both
   ways: the same file run ALONE against the database the suite left behind still reds (24
   non-terminal `workflow.workflow_runs` rows from earlier files), and run against a **pristine clone
   of the same head** it is **44 / 44 green**.

### The one thing that does not build

`pnpm build` (the whole workspace) fails in `apps/web` only, and before any compilation:
`scripts/check-public-key.mjs` refuses because `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent — the `int2`
worktree has no `apps/web/.env.local`. That is this worktree's environment, not the head: the guard
runs before `next build` and reads only the environment. `pnpm --filter @clara/runtime build` is
green, which is what every post-build gate in CUT-PLAN §4.1 needs, and the whole `apps/web` unit
suite is green. **A web `next build` on this head is therefore UNVERIFIED here**; the release worker
builds the web image in the ceremony with the deploy environment.

### Rig hygiene

`clara_cutint` is the from-scratch chain and was left **pristine** — `operation-census` and
`rig-isolation` ran against it before any World was bootstrapped, and no World was ever bootstrapped
on it. Every World leg ran on a **template clone** of it (`clara_rt_test`, `clara_wave_b_ci`), each
bootstrapped with the documented idempotent `bootstrap` bin and quiesced first (the seed leaves 84
non-terminal `clara.accounting_work` rows and 26 queued document tasks that a served image's
reconciler would otherwise churn — lane C1's own trap). No second from-scratch chain was run on the
cluster. The temporary Linux copy the WSL pass needed (`/tmp/cutint`, a file copy with the deploy
clone's `node_modules` linked in, no git) was removed afterwards. No `git worktree` subcommand, no
`git gc`, no `--depth` fetch, and no git at all from WSL.

---

## 7 · Handed up, not decided here

1. **Two rulings lane C1 asks for and that this merge does not supply** (`waveC-lane01-fix.md` §10):
   0320's SECURITY DEFINER posture (C1-SPEC-01), and accepting AC3's Work-walk clause plus AC1's A5,
   A8 and A9 as PARTIAL. Both are the orchestrator's.
2. **`--lock-deployed` at release step 11a**, per §3 — and the operator should expect it to lock 35
   entries (this cut's 25 and wave 4's 10), which is correct at that point and wrong now.
3. **The two-build cutover drill (CUT-PLAN §4.4) was deliberately NOT run here** — it is the gate
   worker's, on a fresh cluster. Lane C2's recheck 2 left it a live warning worth carrying:
   `waveC-lane02-fix-2.md`'s recipe for quiescing the drill's database under-states what a
   heavily-seeded clone needs (it names `accounting_work` and `document_processing_tasks` but not the
   hundreds of `wake`, `chat_turn` and `close_prep` `clara.agent_tasks` rows), and a literal follow of
   it reproduces a spurious failure in the PRE-EXISTING chatTurn/claraWork legs. The quiesce script
   this merge used clears every non-terminal `clara.agent_tasks` row regardless of kind.
4. **Blueprint drift (CUT-PLAN §5 R8)**, unchanged by this merge and still owed to a wayfinder
   session: `docs/ARCHITECTURE.md:171`, `:183`, `:207`, `:445` carry pins that were already wrong two
   cuts ago.
5. **The boot probe's one oddity, recorded so nobody re-finds it as a defect.** Booting the built
   bundle DIRECTLY (`node .output/server/index.mjs`) prints the provenance line and the stranded
   census and then refuses the durable world with `Invalid version string: "bundled"`. That entry
   point is not how the image starts — `packages/runtime/Dockerfile:73` is
   `CMD ["node", "scripts/serve.mjs"]` — and through `scripts/serve.mjs` the same head starts the
   world clean (§2). Not investigated further; it is an unsupported entry point, not a release path.

## 8 · Anything unverified

* **The web `next build`** on this head (§6, environment, not code).
* **The two-build cutover drill** — the gate worker's, not run here.
* Everything each lane listed as unverified in its own report stands unchanged by the merge:
  lane C1's six items (`waveC-lane01-fix.md` §8) and lane C2's notes. This merge verified integration,
  not the lanes' own claims.
* The runtime suite was run **once** on the merged head, as CUT-PLAN §4.1 requires; the three reds
  above were each re-run individually to identify them, and `rollback-preflight` was additionally run
  on a pristine clone. No other cell was re-run.
