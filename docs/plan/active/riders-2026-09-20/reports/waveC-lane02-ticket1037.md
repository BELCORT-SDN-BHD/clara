# Cut phase, lane C2, ticket #1037 — `statementFacts_v4`, the producer half of #990

Branch `riders/wC-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\636`, database `clara_l02` on
`127.0.0.1:55742` (309 files, `0318_knowledge_fye_pair_applicability`), Playwright triple
`https://127.0.0.1:3510` / `3511` / `3512`. Base `6da02a8de` (PR #1053, riders wave 4 integrated);
the branch was empty at start (`git log --oneline 6da02a8de..HEAD` printed nothing, working tree
clean).

**Status: DONE**, with two acceptance criteria qualified below (AC1 and AC3) and one line of the
written contract corrected against a measurement.

No mid-task message arrived asking for a status report.

## Commits (six, in order)

| sha | message |
|---|---|
| `5d7cf8753` | `feat(runtime): #1037 statementFacts.v4.prompts — the text channel names the region it read each line from` |
| `fa3805f31` | `feat(runtime): #1037 statementFacts.v4.citations — a region index resolved back to a real page and locator` |
| `feac894dd` | `feat(runtime): #1037 statementFacts.v4.behavior — the text read resolves the citation before the writer lines leave the step` |
| `fe0b3eafc` | `feat(runtime): #1037 the statementFacts cut — v4 body, impl, and the five registry edits` |
| `b8916de72` | `test(runtime): #1037 the live-rig battery — a persisted line's citation IS a clara.document_regions row` |
| `e031069c9` | `test(runtime): #1037 the cut keeps registry.ts in the shape the two-build drill rewrites` |

`git diff --stat 6da02a8de..HEAD`: 15 files, +1771 / −23. No file under `apps/web`, no migration,
no edit to any applied migration, no edit to a frozen body.

## Ticket verification, before building

`gh issue view 1037 --repo BELCORT-SDN-BHD/clara --json comments` returns **zero comments**, so the
body's Agent Brief is the newest and only brief; state OPEN, labels `enhancement` +
`ready-for-agent`. Read before building: `WORK-ORDER.md` (including both addenda), `RIG.md`
(including the Cut phase 2026-09-25 addendum), `CUT-PLAN.md` §§1.7, 2, 3.2 and 4,
`reports/wave3-lane08-ticket990.md` § "Successor contract", `AGENTS.md`, `CONTEXT.md`.

Still live on this branch: `packages/runtime/workflows/statementFacts.v3.prompts.mjs`'s `lineShape`
declares exactly five keys and `toWriterLines` rebuilds every line from six named keys (measured on
this branch, lines 151-157 and 349-362), and both files are in the frozen manifest — so no live
producer could state a citation, exactly as #990 recorded. Nothing on `main` had closed it.

## The seams tested at

Written before the first test, per work-order rule 4:

1. **`statementFacts.v4.prompts.mjs`'s own exports** — the TEXT system prompt, the two channel
   schemas, the citation-field roster, and `statementWitnessPromptHash`. This is the seam the
   brief's "key interfaces" names as the prompt stanza.
2. **`statementFacts.v4.citations.mjs`** — `indexStatementRegionCitations` (pure) and
   `attachStatementLineCitations` (pure). The new module the brief's "a successor body emits, per
   line, the page number and the region" needs, driven through its public functions only.
3. **`statementFacts.v4.behavior.mjs`'s `runStatementWitnessTextRead` / `runStatementWitnessVisionRead`** —
   the two exported channel reads, driven with a scripted `pg` client and a scripted model, exactly
   as `f-a2-statement-activation.test.mjs` drives v2's and v3's.
4. **The registry's public surface** — `workflows.statementFacts`, `workflowPins`,
   `workflowBodies`, and the class's own re-exports (the brief's "minted in a workflow cut, with
   its closure, registry entry, bundle banner and the frozen-manifest lock").
5. **The LIVE persist door** — `clara.persist_statement_facts_v2(p_task, p_payload)` reached
   through the real behaviour, and `clara.bank_statement_lines` read back and compared against the
   `clara.document_regions` row the citation came from.
6. **The Matching tab's own read door** — `clara.get_bank_line_matching_context(uuid)`, driven as
   the OWNER (it is granted to `clara_authenticated` alone).
7. **`scratch-image.mjs`'s `deriveVersionPair` / `rewriteRegistryToPrevious`** — the two-build
   drill's own requirement on the registry's text shape.

No test was written at a seam the brief does not give.

## The one line of the contract that could not be built as written

`CUT-PLAN.md` §3.2 and `reports/wave3-lane08-ticket990.md` § "Successor contract" both say the
stanza goes to **"the vision-channel prompt"**. That cannot be built, and the reason is a
measurement rather than an opinion:

* The numbered `clara.witness_citation_regions` rendering is shown **only** to the TEXT channel
  (`buildStatementWitnessTextPrompt`); the vision channel is handed
  `buildStatementWitnessVisionPrompt()`, which carries no regions at all
  (`statementFacts.v3.prompts.mjs:256-304`).
* Migration 0291's splice reads the citation off `v_r1->'lines'` — **reader1** — and
  `persistStatementWitnessPair` fills `readers.reader1.lines` from the **text** read
  (`statementFacts.v3.behavior.mjs:460-463`).

So a vision-side index would have nothing to resolve against and would land in reader2, which the
persist core never reads. The stanza went to the TEXT channel, which is reader1 and the only one
that can honour it. The ticket's own Agent Brief names no channel, so this is a correction to the
plan's prose, not a deviation from the ticket. It is recorded in three places in the code
(`statementFacts.v4.prompts.mjs`'s header, `statementFacts.v4.ts`'s header, and the unit test
file's header) so a later reader does not re-discover it.

## Acceptance criteria, with evidence

| # | Criterion | Evidence |
|---|---|---|
| AC1 | A World leg drives a bank statement through the successor body and finds every extracted line carrying a page and a region that the viewer can render | **MET in substance, with the wrapper qualified.** `packages/runtime/tests/statement-facts-v4-citation-db.test.mjs` cell **1037.db1**, on `clara_l02`: the real v4 behaviour (`runStatementWitnessTextRead` → `runStatementWitnessVisionRead` → `persistStatementWitnessPair`) drives the real `clara.witness_citation_regions` numbering, the real typed-consent `prepare`/`consume` pair, the real `clara.record_llm_usage_event` and the real `clara.persist_statement_facts_v2`; only the MODEL is scripted. All three persisted lines carry `citation_page` equal to the page in the `clara.document_regions` row's own locator, `citation_region` **deep-equal to that locator verbatim** (the same object the viewer's polygon layer renders), and `citation_extraction_id` equal to `result.reader1_extraction_id` — the row the same transaction banked reader1's read into. Pages are distinct per line (`[1,2,3]`), so a blurred citation would be visible. PASS. **Qualified:** the leg does not run inside a durable WDK World (no `statementFacts` World driver exists, and building one is the new work §3.2 cost 1 names); what is exercised is every module the World would call, against the real database. See "Anything unverified". |
| AC2 | A line extracted by the previous body still shows the stated-absence sentence, and a line from the successor shows its citation; a rendered cell proves both | **MET, partly already satisfied by #990.** Producer half, new: cell **1037.db2** drives the SAME fixture and the SAME scripted answer (region indices included) through `statementFacts_v3` and lands three lines with `citation_extraction_id`, `citation_page` and `citation_region` all NULL, while 1037.db1's v4 run lands three cited lines. Read half, new: both cells drive `clara.get_bank_line_matching_context` as the owner and see `line.citation_page = 1` after v4 and `null` after v3 — the exact input #990's three-state decision keys on. Rendered half, **already satisfied on `main`**: `apps/web/lib/bank/citation.test.ts` (4 cells) and `matching-section.test.tsx` `[990]` (3 cells) already render "Page 5 of the source document" / the lane sentence / "No source citation was recorded for this line." from those two column states, and #1037 changes no web file, so no new rendered cell was written (work-order rule 3). The browser walk that owns that surface, `bank-match-walk.spec.ts`, was re-run on this lane's triple: **6/6**. |
| AC3 | The two-build cutover drill passes for the statement-facts family: a run parked on v3 completes on v3 inside the new build | **PARTIAL, and the residual is named.** `packages/runtime/tests/two-build-cutover-e2e.mjs` ran green end to end after the cut (`TWO-BUILD CUTOVER E2E: ALL PASS`, both legs, on a `clara_rt_test` template clone of `clara_l02` with its own bootstrapped World), and both scratch images boot with `statementFacts=statementFacts_v4` in their provenance line. The drill has **no `statementFacts` leg**, which `CUT-PLAN.md` §3.2 cost 1 already priced as new work. What IS proved for this family: cell **1037.x1** drives `deriveVersionPair(registrySrc, "statementFacts")` and `rewriteRegistryToPrevious` against the real `registry.ts` — v4 derives v3 as its predecessor and all five substitutions apply, so a build pinned at `statementFacts_v3` can still be constructed from this cut's edits; `f-a2-statement-activation.test.mjs` proves v1, v2 and v3 stay exported, rostered and reachable by object identity; `check-workflow-bundle.mjs` proves 58 superseded bodies still ship in the built bundle. Why a leg is genuinely new work is measured below under "Follow-ups". |
| AC4 | The frozen manifest records the new body and the retired one; `check-frozen-workflows` and `check-parts-parity` pass | PASS. `node scripts/check-frozen-workflows.mjs` — OK, 327 frozen files, 58 `"use workflow"` modules all frozen+registered, 3 retired entries. `--compare-base 6da02a8de` — OK, **322 existing entries retain the same hash and deployed flag, 5 additions**. Both selftests OK. `node packages/runtime/scripts/check-parts-parity.mjs` — OK. `node scripts/check-workflow-bundle.mjs` — OK, 14 pinned classes, 46 checks. Note on "the retired one": nothing was retired. `statementFacts_v3` **stays** imported, exported, rostered and hash-locked — policy (c); the manifest's `retired` block is for bodies removed from the tree (3 chatTurn v1-era files) and this cut adds none. |

## What the cut consists of, file by file

New, all `@frozen`, all appended to `frozen-workflows.json` (5 additions, none `deployed`):

* `packages/runtime/workflows/statementFacts.v4.prompts.mjs` — re-exports every unchanged v3 symbol
  by name (`CUT-PLAN.md` §2.1) and declares only what moves: `STATEMENT_LINE_CITATION_FIELDS`,
  `statementWitnessTextSchema` (v3's five line fields + `region_idx`, nullable),
  `STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT` (v3's, extended by one block — rules 1-7 carried by
  construction) and `statementWitnessPromptHash` (names `statementFacts.v4` on BOTH channels).
* `packages/runtime/workflows/statementFacts.v4.citations.mjs` — the same
  `witness_citation_regions → document_regions` join the v2 dispatch already performs, asked for the
  locator that one discards, plus the pure mapper.
* `packages/runtime/workflows/statementFacts.v4.behavior.mjs` — the two channel reads copied (both
  stamp the v4 hash, so neither can be v3's under a new name) with their module-private support;
  `persistStatementWitnessPair`, `classifyStatementWitnessFailure`, `statementPersistFailureCode`
  and `ownsStatementWitnessLane` re-exported from v3 unchanged.
* `packages/runtime/workflows/statementFacts.v4.impl.ts` — v3's steps with the behaviour import
  moved.
* `packages/runtime/workflows/statementFacts.v4.ts` — v3's body line for line.

**The closure**: `node scripts/check-frozen-workflows.mjs --print-closure` reports
`statementFacts.v4.ts (11 modules)` — the five new ones plus `statementFacts.v1.behavior.mjs`,
`v1.impl.ts`, `v2.dispatch.mjs`, `v3.behavior.mjs`, `v3.header.mjs`, `v3.prompts.mjs`, **every one
of which was already frozen**. **No `lib/` module joins the freeze at this cut** (contrast
`CUT-PLAN.md` §2.7, which is lane C1's list). `.dispatch.mjs` was not copied (v2's is imported
relatively) and `.services.mjs` was not copied (it is injected at boot, outside the freeze), per
§2.1.

**The five registry edits** (`packages/runtime/workflows/registry.ts`), each in the exact textual
shape `scratch-image.mjs` regex-asserts: the import after v3's, the dispatch line
`  statementFacts: statementFacts_v4,`, the bare `export { statementFacts_v4 };`, the
`workflowBodies` entry `  "statementFacts_v4",`, and `  statementFacts: "statementFacts_v4",` in
`workflowPins`. No edit anywhere else in that file.

**The boot pin** (`CUT-PLAN.md` §2.3): `statementFacts` mints **no bundle banner** — only
`claraWork` does — so the class's boot pin is carried entirely by `emitProvenanceLine`'s read of
`workflowPins` and by `strandedBodyCensusOnWorld(workflowBodies)`, both of which the five edits
move. Measured, not asserted: both scratch images in the two-build drill printed
`… pins … statementFacts=statementFacts_v4 …` in their own boot lines. The one edit
`plugins/startWorld.ts` needed was its comment, which named `statementFacts.v3.impl.ts` and "the
ACTIVE closure, statementFacts.v3's"; it now names v4 and records why no further boot-side edit is
owed. The `claraWork_v6` sixth-banner trap (`CUT-PLAN.md` §2.3, R2) does not apply to this family.

**Parts parity**: three exemption rows in
`packages/runtime/scripts/parts-parity-exemptions.mjs`. The two `withMeteredStatementChannel`
fingerprints are **byte-identical** to v2's and v3's rows (`eb1f1166…`, `6d340dfe…`), which is the
evidence the metered-channel wrapper did not move; the third (`a53b3368…`,
`attachStatementLineCitations`, `...line`) is the only genuinely new spread and is a merge that
assigns no `type`. **No wire kind is added**, so no `.parts.ts`, no `DEFAULT_DECLARERS` entry and no
web parts census are owed (`CUT-PLAN.md` §2.5, §2.6).

**`--lock-deployed` was NOT run.** The lane prompt asked for "the manifest lock via
`check-frozen-workflows --lock-deployed` in the same commit". `CUT-PLAN.md` §2.4 — which the same
prompt told me to read first — says the opposite in terms, quoting `packages/runtime/README.md`
:1037-1039: it is "NOT a cut gate", it belongs to the hosted release ceremony (runbook step 11a)
*after* the image is live, because "locking before deploy would freeze a body that no parked run can
yet exist for", and the command locks every unlocked entry **globally**. Running it from a lane
would also have locked wave 4's ten `payrollFacts.v1.*` / `agreementFacts.v1.*` entries on this
branch. I used `--update` instead and left the five new entries unlocked. The manifest's unlocked
set is now exactly **15**: wave 4's ten plus this cut's five — which is what the release that locks
this cut will lock, and what §2.4 predicts.

## Migration

**NONE.** `0322` is reserved for this lane and is **UNUSED**, as `CUT-PLAN.md` §3.2 expected.
`clara.persist_statement_facts_v2(p_task uuid, p_payload jsonb)` is unchanged in name and argument
order; migration 0291 (`0291_bank_statement_line_citation.sql`, applied 2026-09-20) already carries
the three columns, the four constraints, the persist core's citation guard and the widened payload
shape. Measured on `clara_l02` at 309 files / `0318`: `clara._persist_statement_core_v2(uuid,uuid,
uuid,jsonb,text,uuid,uuid,uuid,text,text)` has `sha256(prosrc)` =
`db99dfe4f86517597a34f7c679c8e4768a165589298d6bc474b3deecc8979001` and carries the `#990` splice.
No prestate pins were written, because no migration was written. No redo was used.

## The hand-checked invariant (`CUT-PLAN.md` §3.2 cost 3)

The engine-literal pairing has no automatic gate, so it was re-checked by hand at this cut and
measured on `clara_l02`:

* runtime: `STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId` =
  `` `llm-openai:${STATEMENT_WITNESS_MODEL_ID}:${STATEMENT_WITNESS_ENGINE_VERSION}` `` =
  `llm-openai:gpt-5.6-terra:stmt-witness-v1` (`statementFacts.v2.services.mjs:41,48,50-54`).
* database: `clara._enqueue_invoice_facts_core`'s statement arm carries the literal
  `llm-openai:gpt-5.6-terra:stmt-witness-v1` (read out of `pg_proc.prosrc`; it is the only function
  in `clara` mentioning `stmt-witness-v1`).

They STRING-EQUAL. v4 reuses v2's services bundle and its `globalThis` slot, so the pairing is
untouched by this cut and no deploy-order obligation arises from it.

## `f-a2-statement-header-v4.test.mjs` is NOT owed

`CUT-PLAN.md` §3.2 cost 2 asks for a sibling of `f-a2-statement-header-v3.test.mjs` because that
file's drift guard mirrors 0038's `clara.bank_institutions` seed inside
`statementFacts.v3.header.mjs`. v4 mints **no header module**: it imports v3's unchanged (the §2.1
convention), so there is exactly one mirror, it is still v3's, and its guard still covers it. The
file is green (21/21) after the cut. A sibling would have asserted the same mirror twice.

## Gates, with counts

Run in the lane worktree with the RIG.md environment
(`PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres PGDATABASE=clara_l02 CLARA_ALLOW_DESTRUCTIVE=1
CLARA_RIG_DB=1`).

**Test files added or touched**

| file | result |
|---|---|
| `packages/runtime/tests/statement-facts-v4-citation.test.mjs` (new) | **7 pass, 0 fail** |
| `packages/runtime/tests/statement-facts-v4-citation-db.test.mjs` (new, live rig) | **4 pass, 0 fail** |
| `packages/runtime/tests/statement-facts-v4-fixtures.mjs` (new, not a test file) | — |
| `packages/runtime/tests/f-a2-statement-activation.test.mjs` (touched) | **12 pass, 0 fail** |

**Version gates** (`CUT-PLAN.md` §4.2): `registry-view` 7/7 · `p6-1-parts-parity` 22/22 ·
`p6-1-chatturn-v16` 29/29 · `local-db-gate-drivers-census` 8/8 · `built-bundle-gate` 7/7 ·
`rollback-preflight` 22/22 · `runtime-contracts` 2/2. Plus the family's own:
`f-a2-statement-header-v3` 21/21 · `f-a2-statement-persist-settle` 22/22 ·
`statement-persist-contract` 2/2.

**Build and the post-build gates, in order** (`CUT-PLAN.md` §4.1):
`pnpm --filter @clara/runtime build` exit 0 · `node scripts/check-worker-paths.mjs` OK (2 spawn
sites) · `node scripts/check-workflow-bundle.mjs` OK (14 pinned classes, no superseded pin
survives, **58 superseded bodies still ship for parked runs**, 46 checks) ·
`node packages/runtime/scripts/check-parts-parity.mjs` OK.
`pnpm build` (the whole monorepo) **fails in `apps/web`** with `check-public-key` REFUSING TO BUILD:
`NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent and this worktree has no `apps/web/.env.local`. That is a
rig fact, not this ticket — the e2e runner supplies its own `sb_publishable_clara_e2e_only`
(`apps/web/e2e/run.mjs:23-24`), which is why the browser walk below still ran.

**Freeze chain**: verify OK (327 files) · `--compare-base 6da02a8de` OK (322 unchanged, 5
additions) · `check-frozen-workflows.selftest.mjs` OK · `check-frozen-workflows.registration.selftest.mjs` OK.

**The whole runtime suite, once, at the end**: `pnpm --filter @clara/runtime test` —
**2984 tests, 2944 pass, 2 fail, 38 skipped**. Both failures are RIG.md's named Windows-only reds
and are reported as such, never "fixed":
* `scanner rejects EICAR, encrypted PDF, and XML entity expansion` (#693, Defender removes the
  EICAR fixture on this host);
* `(#806) this host's OWN probe: pg_dump/psql are on PATH here` (no `pg_dump` on PATH in Git Bash).

**The two cutover e2es** (`CUT-PLAN.md` §4.3, §4.4), on a `clara_rt_test` **template clone** of
`clara_l02` inside this lane's own cluster with its own bootstrapped World (RIG.md wave-2 addendum;
the clone was dropped afterwards and `clara_l02` was never World-bootstrapped, so
`rig-isolation.test.mjs` T10b stays green, #866):
* `RELAY_TEST_MODE=1 node tests/two-build-cutover-e2e.mjs` — **TWO-BUILD CUTOVER E2E: ALL PASS**.
  Both legs: `claraWork_v4 → claraWork_v5` and `chatTurn_v20 → chatTurn_v21`, each with its own
  scratch image (6.5s and 5.8s), W1 resuming on `claraWork_v4` inside build B and C1 resuming on
  `chatTurn_v20` inside build B. Both boot lines carry `statementFacts=statementFacts_v4`.
* `node tests/version-cutover-e2e.mjs` — **VERSION CUTOVER E2E: ALL PASS** (the parked
  `chatTurn_v7` run resumes and completes on its original body; the registry repoint's static
  guards pass).

**Typecheck and lint, as the runner sees them**: `pnpm typecheck` exit 0 (`apps/web` and
`packages/runtime` both "Done") · `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0 across
`packages/db`, `apps/web`, `packages/runtime`, `packages/reporting-render`.

**The browser walk** (`CUT-PLAN.md` §4.6): the web side is untouched (no `apps/web` file in
`git diff --stat 6da02a8de..HEAD`), so the census is a no-op — run and reported as such. The walk
that owns the surface the citation lands on was run anyway, on THIS lane's triple:
`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3510 CLARA_E2E_NEXT_PORT=3511 CLARA_E2E_RUNTIME_PORT=3512
pnpm --filter @clara/web e2e bank-match-walk` — **6/6 passed** (17.7s), including the a11y leg. The
whole `apps/web` unit suite was NOT run: no file under `apps/web` changed.

**`operation-census` / `rig-isolation`**: **not owed and not run**. This ticket adds no SQL function
and touches no file under `packages/db`.

## Vacuity controls

Two cells assert against subjects that already existed when they were written, so each was shown
failing once against a deliberately broken subject and the subject restored byte for byte
(`git diff` empty afterwards, verified both times):

* **1037.p2** (the prompt hash names v4): changing `"statementFacts.v4"` to `"statementFacts.v3"` in
  the hash's folded tuple reds it with "the vision channel's v4 hash must differ from v3's".
* **1037.x1** (the registry's text shape): re-indenting the dispatch line by two spaces reds it with
  the rewriter's own message, `registry rewrite step did not apply: /(\n  statementFacts:\s*)statementFacts_v4(,)/`.

## Docs, in the same commits

* `packages/runtime/README.md` — a new `### The pin the wave 2026-09-25 cut moved` section above the
  2026-09-18 one, in the same per-body template: what `statementFacts_v4` carries, that no wire
  kind, no door, no `WORK_ACCEPTED_PURPOSES` and no migration move, and the explicit **no deploy
  order** sentence with its reason (0291 has been live since 2026-09-20, so a v4 payload cannot meet
  a database that does not understand it, and a rollback to v3 is fail-closed for free).
* `CONTEXT.md` — the **Statement line** entry's `_Avoid_` clause retired the residual #990 recorded
  ("no live producer states one yet"); it now says a v4-read row names the region it was read from,
  that a row the reader could not honestly cite still persists uncited, and that every line banked
  before the cut has no citation at all. Minimal hunk, in place, no new term added.
* `packages/runtime/plugins/startWorld.ts` — the statement-witness bundle comment now names v4 and
  records why no further boot-side edit is owed.
* Module headers carry the reasoning that would otherwise only live here: why the text channel and
  not the vision one, why the region lookup is a second read rather than a copy of the dispatch's
  sort, why an unusable region is not citable, and why the two read functions are copied while the
  persist is re-exported.

## `docs/ARCHITECTURE.md` drift — handed to the orchestrator, NOT edited

Per `AGENTS.md` rule 4 and `CUT-PLAN.md` §2.8, a blueprint edit belongs to a wayfinder session, not
a lane. Measured on this branch:

* `docs/ARCHITECTURE.md:183` — "当前 pin 为 `chatTurn → chatTurn_v19`、`claraWork → claraWork_v3`".
  Live is `chatTurn_v21` / `claraWork_v5`, and after this cut `statementFacts → statementFacts_v4`,
  which that line does not mention at all.
* `docs/ARCHITECTURE.md:293` — "当前 `chatTurn_v19`". Same drift.

Both predate this cut (they were already wrong at `6da02a8de`; `docs/PROGRESS.md` Known Issues
records it). Nothing in this lane touched either line.

## Successor contract

This ticket IS #990's successor contract, discharged. What a **future** frozen body of this family
would need, recorded so it is not re-derived:

**Name / shape.** `statementFacts_v5`, minted from v4 by the same §2.1 convention. The TEXT
channel's answer vocabulary is now `[...STATEMENT_HEADER_FIELDS, ...STATEMENT_LINE_FIELDS,
...STATEMENT_LINE_CITATION_FIELDS]`; the VISION channel's is the first two. The hash must fold the
new class string on both channels.

**Zod input (unchanged by anything below).** Per TEXT line:
`region_idx: z.number().int().nullable()`. Nothing else was widened. The vision schema is v3's,
re-exported.

**Door call, argument order (unchanged).**
`select clara.persist_statement_facts_v2($1, $2::jsonb)` with `[taskId, JSON.stringify(payload)]` —
`p_task uuid, p_payload jsonb`. The widened part of the payload is
`payload.readers.reader1.lines[i]`, which may carry `page: int >= 1` and
`region: <json object>` — **both present or both absent**.

**Refusal mapping (inherited, nothing new).** A malformed per-line shape raises CLR10
`{"reason":"chain_broken"}`; a citation on a lane with no second reader raises CLR10
`{"reason":"internal"}`. Both are already classified by `statementPersistFailureCode` and both were
proven by #990's own cells 990.c and 990.d.

**Part kind: none.** This is a jsonb payload field on an existing SECURITY DEFINER call. No room,
no door, no web registration.

**Prompt stanza, as shipped** (appended to v3's TEXT system prompt, which is carried whole):

> ONE MORE THING, AND IT IS YOURS ALONE — the other reader has no regions to name.
>
> 8. SAY WHERE YOU READ EACH ROW. For every transaction line you report, also answer `region_idx`:
>    the number in square brackets of the numbered region you actually read that row from. Report
>    the number as it is printed in the brackets — never renumber, never add or subtract, and never
>    infer a number from a region's position in the list. If a row was not read from any one region
>    — it was split across several, or you cannot tell which — answer region_idx null. An honest
>    null is worth more than a confident guess here for the same reason as everywhere else (rule 3):
>    a person reading the result is shown the page and the patch of it you name, and a wrong number
>    points them at the wrong part of their own bank statement, which is worse than being told
>    plainly that no source was recorded.

**The one thing a v5 must not do.** Do not ask the VISION channel for a `region_idx`. It is shown no
regions, and `_persist_statement_core_v2` reads reader1 alone; an answer there would be either
ignored or a fabrication with nothing to check it against.

## Follow-ups worth filing

1. **A `statementFacts` leg for the two-build cutover drill** (AC3's residual; `CUT-PLAN.md` §3.2
   cost 1 priced it as new work and this lane confirms it). The reason it is genuinely new, measured
   here: the drill's two existing legs park a run at an **interruption point** — `claraWork`'s typed
   Work question (`openWorkQuestionStep`) and `chatTurn`'s clarification — and `statementFacts` has
   **no interruption point at all**; its body is claim → two reads → one persist. A statementFacts
   run is non-terminal only while a step is *awaiting retry* (a `statementWitnessWait`: an absent
   OCR substrate, an engine-stamp mismatch, a parked task). So the leg's design is: stage a
   `statement_facts` task with **no done OCR extraction**, start the run on build A (pinned v3) so
   the text step WAITs and the run parks on `statementFacts_v3`, stop build A, seed the extraction
   and its regions, start build B (pinned v4), and assert the run completes with
   `workflow.workflow_runs.name` still naming a v3 body. That also needs a
   `statement-facts-serve.mjs` child bootstrap that injects a scripted
   `__claraStatementWitnessServices`, which no existing drill child does.
2. **`clara.bank_statement_lines` is append-only** — measured here: a root `update … set
   citation_region = null` is refused by a trigger with "bank_statement_lines is append-only", so
   the three CHECK constraints 0291 added can never be reached by an UPDATE at all. The practical
   consequence is worth writing down somewhere a person will find it: **a citation can never be
   back-filled onto a line banked before this cut**. #990 listed backfilling as out of scope; it is
   in fact structurally impossible without a new door and a re-ingest.
3. **The seed leaves seven queued, unbound `accounting_work` agent tasks**, which makes any template
   clone of a freshly migrated+seeded lane database refuse the two-build drill at its own inventory
   gate ("REFUSING TO START — this database already carries live state"). I cancelled them on the
   throwaway clone only (the drill's own message offers exactly that), never on `clara_l02`. Worth a
   note in RIG.md for the next lane that needs the drill, or a seed change.
4. **`apps/web` cannot be built in a lane worktree** without `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (`check-public-key` refuses). Any lane whose gate list includes `pnpm build` at the repo root
   will hit this; `pnpm --filter @clara/runtime build` is the one that matters for the cut's
   post-build gates.

## Anything unverified

* **The World wrapper for AC1.** Every module a durable `statementFacts_v4` run would execute was
  driven against the live database, but not *inside* a WDK World: no `statementFacts` World driver
  exists and building one is follow-up 1. What is therefore unproven by a cell of mine: that the
  durable engine memoizes the widened text-read return value across a replay. The step's return
  value grew by two small keys per cited line (one integer and the region's own locator object) and
  crosses the WDK boundary like the rest of the blob; nothing about its shape is new to the
  serializer, but I did not measure a replay.
* **The vision channel's `downloadCanonical` is stubbed** in the live battery: this rig has no
  object store, and storage is not this ticket's subject. The vision channel's own pre-egress guards
  (media type, byte cap) are proven elsewhere and unchanged by this cut.
* **The scripted model.** As in `f-a1-witness-db.test.mjs`, the only mocked thing is the model. No
  cell here measures whether a real model answers a *correct* `region_idx` — that is corpus tuning,
  explicitly out of the ticket's scope, and the body is written so that a wrong index lands as no
  citation rather than as a wrong one (cell 1037.db3).
* **`--lock-deployed` was not run** (see above). The five new manifest entries are unlocked, which
  is the state the hosted release ceremony expects to lock.
* **The whole `apps/web` unit suite was not run**, because no file under `apps/web` changed.
* **CI figures.** Every count above is from this Windows rig. The integrator's own re-run under WSL
  as `runner` (RIG.md wave-3 addendum) has not happened; the two new runtime test files have not been
  run on Linux. The live battery points `CLARA_SPOOL_DIR` nowhere because it never reaches the spool,
  and it depends on no Windows path and on no directory left by an earlier run.
