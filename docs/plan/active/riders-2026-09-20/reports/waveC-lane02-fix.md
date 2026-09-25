# Cut phase, lane C2 — review fix round for ticket #1037 (`statementFacts_v4`)

Branch `riders/wC-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\636`, database `clara_l02` on
`127.0.0.1:55742` (309 files, `0318_knowledge_fye_pair_applicability`), Playwright triple
`https://127.0.0.1:3510` / `3511` / `3512`. Base `6da02a8de`.

**NEW HEAD: `b7e771799`.** Three new commits on top of the lane's six.

At start: `git status` clean, `git log --oneline 6da02a8de..HEAD` showed the six lane commits
(`5d7cf8753`, `fa3805f31`, `feac894dd`, `fe0b3eafc`, `b8916de72`, `e031069c9`). Nothing was redone.

No mid-task message arrived asking for a status report.

## The three commits

| sha | message |
|---|---|
| `b9664432f` | `fix(runtime): #1037 a citation resolves only against what the reader was SHOWN, and only inside its own firm` |
| `7a878e699` | `fix(runtime): #1037 region_idx stays a REQUIRED nullable wire key, and the trade is measured rather than asserted` |
| `b7e771799` | `test(runtime): #1037 the widened text read crosses the engine's OWN memoization boundary intact` |

`git diff --stat e031069c9..HEAD`: 7 files, +420 / −19. Still no file under `apps/web`, no
migration (0322 remains UNUSED), no `chatTurn` or `claraWork` file, no edit to an applied migration
and no edit to a frozen body outside this cut's own five unlocked entries.

## Finding by finding

| id | severity | verdict | where |
|---|---|---|---|
| ADV-1037-01 | major | **FIXED** | `statementFacts.v4.citations.mjs`, `statementFacts.v4.behavior.mjs`; cells 1037.t1, 1037.t2, 1037.c1 |
| C2-SPEC-01 | major | **REFUTED as a fix-round item**, costed and escalated | measured below; no code change |
| ADV-1037-02 | minor | **FIXED** (the claim, which is all that was fixable without a migration) | module header, README, cell 1037.db5 |
| ADV-1037-03 | minor | **FIXED** | the new read's firm predicate; cell 1037.db4 |
| ADV-1037-04 | minor | **REFUTED by measurement**, cost recorded | `statementFacts.v4.prompts.mjs` header; cell 1037.t3 |
| C2-SPEC-02 | minor | **residual closed at the seam it names**; the World wrapper stays the follow-up | cell 1037.db6 |

Notes ADV-1037-05, ADV-1037-06, C2-SPEC-03 … C2-SPEC-08 asked for nothing in this lane; where one
touched code I was already changing it is answered below.

---

### ADV-1037-01 (major, correctness) — FIXED

**Reproduced first, at the behaviour seam.** Cell `1037.t1` in
`packages/runtime/tests/statement-facts-v4-citation.test.mjs` drives the real
`runStatementWitnessTextRead` over four regions whose OCR text is 30,000 / 25,000 / 20,000 / 100
characters — arithmetic written out in the cell so it is checkable by hand: 30,008 + 25,008 = 55,016
used against `buildStatementWitnessTextPrompt`'s 60,000 budget, so regions 3 and 4 are never
printed. The cell asserts its own premise off the prompt the model was handed (`/TRUNCATED/`
present, `[1 p1]` and `[2 p1]` printed, `[3 p2]` and `[4 p3]` not), then scripts the reader to cite
3 and 4. **Before the fix it failed** with `an index naming a region the reader never saw is no
citation at all — true !== false`: the line had been given region 3's real page and real polygon.

**The fix.** `renderedRegionIndexes(prompt, regions)` in `statementFacts.v4.citations.mjs` reads the
printed bracket headers back out of the builder's own output — READ, never recomputed, because a
second copy of the budget arithmetic here is exactly the two-places drift the module's header
refuses. `indexStatementRegionCitations(rows, shownIdxs)` now takes that set as a **required**
second argument, and `readStatementWitnessRegionCitations` is the one door, taking
`{extractionId, firmId, shownIdxs}` — so a lookup that outruns the prompt is not expressible rather
than merely discouraged. `runStatementWitnessTextRead` builds the prompt BEFORE reading the lookup
(both still before the paid call and inside the same `withRuntime` window, so the memoization
property the header claims is unchanged).

**Fail-closed on purpose.** A missing fence, or a printed line that does not open with the header of
the region that position belongs to, yields the EMPTY set — no citations — not a best guess. A later
builder whose rendering this cannot read costs citations and says nothing untrue; one that guessed
would point a person at the wrong patch of their own bank statement.

**Why line-anchored parsing is safe** (and this is also the answer to note ADV-1037-05 for the half
that v4 can control): the builder replaces every newline in a region's OCR text with a space, so
document-controlled text can never START a line inside the fence. Cell `1037.t2` (c) proves it with
a region whose text is `[7 p1] 02/06 TRANSFER IN 500.00\n[8 p1] injected` — the lookalike header is
in the prompt and is still not a region. Neutralizing a leading `[` in the builder itself remains
the v5 follow-up the note asks for; it is not this version's to make.

`1037.t2` also covers the untruncated case (idxs 1, 4, 9 out of numeric order, which is what the
published numbering really looks like beside a spatially sorted prompt) and all four fail-closed
paths. `1037.c1` was split into the shown half and the storable half.

**Vacuity control:** deleting `if (!shown.has(idx)) continue;` reds `1037.t1` and `1037.c1` and
nothing else; subject restored byte for byte (`git diff --numstat` unchanged at 87/10).

### ADV-1037-03 (minor, tenant isolation) — FIXED

The new read now carries `and r.firm_id = $2`, with `doc.firm_id` — already in the caller's hand,
which passes it to `prepare`/`consume` in the same function.

Cell `1037.db4` on `clara_l02`, driven as the RUNTIME role through `fx.asRuntime`: the owning firm
resolves all three of its seeded regions, a second firm resolves **none** of them off the same valid
extraction id, and — the discriminating half — the same role reading the same join WITHOUT the
predicate still sees all three rows. That last assertion is what makes the zero the predicate biting
rather than an empty extraction, and it re-measures the review's own point: `clara.witness_citation_regions`
is SECURITY DEFINER with no firm check and `p_document_regions_runtime_read`'s qual is `true`.

Still not reachable today (the extraction id comes from `readPinnedStatementOcrExtraction`, which
filters on firm) — the reason for the change is the one the review gives: v4 is the first version
that WRITES what this read returns into `clara.bank_statement_lines`.

**Vacuity control:** neutralising the predicate to `(r.firm_id = $2 or true)` — type-inferable, so
the query still runs — reds `1037.db4` **alone**, with db1/db2/db3/db5 green. Subject restored.

### ADV-1037-02 (minor, provenance) — the claim FIXED; the property is not fixable here

No code change can make the trio re-walkable: `clara._persist_statement_core_v2` stamps `v_ext1`
unconditionally and a producer cannot influence it, so linking would need either the OCR extraction
id on the line or a lookup door — both a migration 0291 deliberately did not take, and this lane's
reserved 0322 is expected UNUSED.

What changed is that the claim is now measured rather than assumed. Cell `1037.db5` drives a v4
statement end to end and records: `citation_extraction_id` ≠ the OCR extraction the region came from;
it EQUALS `receipt.reader1_extraction_id`; `select count(*) from clara.document_regions where
extraction_id = <it>` is **0** while the OCR extraction carries all three; and the stored
`citation_region` is the `clara.document_regions` locator **verbatim**. So a stored citation is the
locator COPIED, not a link — the viewer renders it and nothing navigates back. Recorded in
`statementFacts.v4.citations.mjs`'s header and in `packages/runtime/README.md`.

**Correction the orchestrator should carry:** the lane report
`reports/waveC-lane02-ticket1037.md` AC1 and the lane prompt's criterion (c) both say the citation
"reaches `clara.document_regions`". The accurate sentence is: *the stored page and locator are a
`clara.document_regions` row's own values, copied; no stored column navigates back to that row.*
I did not edit that report — it is not the file this task authorises me to write.

### ADV-1037-04 (minor, failure mode) — REFUTED by measurement; the cost recorded

The review asked for `.optional().nullable()`. That would be worse, and the reason is measured, not
argued:

* `@ai-sdk/openai@4.0.46` defaults `strictJsonSchema` to **true**
  (`strictJsonSchema = (…openaiOptions.strictJsonSchema) != null ? … : true`, twice in its dist),
  and `statementFacts.v2.services.mjs:251` passes no provider options — so every read in this family
  goes out under OpenAI strict structured outputs, which both guarantees that every required key
  comes back and **refuses a schema whose `required` does not list every property**.
* Measured on the installed toolchain (zod 4.4.3 + ai 7.0.77): `.optional()`, `.catch(null)` and
  `.default(null)` **all** drop the key out of `required`. There is no shape that is both tolerant
  at parse time and required on the wire.
* It is also the repo's own documented wire rule — `witnessFacts.v1.prompts.mjs:24-27`, "a
  provider's strict structured-output mode is happiest with a FLAT, all-required, nullable-valued
  object" — and **no `generateObject` schema anywhere in `packages/runtime` uses `.optional()`**
  (the only `.optional()` in `workflows/` are in autoDraft/chatTurn/claraWork TOOL schemas, a
  different path).

So the change would trade a failure nobody has observed for one every statement read would hit.

**The cost is now stated rather than hidden**, in the module header and in cell `1037.t3`: a v3-shaped
answer is rejected at `["lines",0,"region_idx"]`; a schema miss in this family classifies `internal`,
which `RETRYABLE` excludes, so the paid two-channel read settles **failed** rather than landing
uncited. The cell asserts both halves, the second against the JSON Schema the SDK actually sends
(`zodSchema(statementWitnessTextSchema).jsonSchema`), including that `region_idx` is not a special
case — all six line fields are required and the object is closed.

### C2-SPEC-02 (minor, AC1's World wrapper) — the named residual CLOSED at its own seam

The review asked for no code change and one thing left unmeasured: "whether the engine memoizes the
widened text-read return value across a replay".

Measured. `@workflow/world-postgres` stores a step's return value in `steps.output_cbor` through its
`Cbor()` column type (`dist/drizzle/schema.js:74`; `dist/drizzle/cbor.js` — `cbor-x`'s
encode/decode). Cell `1037.db6` drives the real v4 reads on `clara_l02`, crosses both return values
through **that exact codec** — resolved through the engine's own package
(`createRequire(import.meta.resolve("@workflow/world-postgres"))("cbor-x")`) so the two cannot drift —
and then persists FROM THE DECODED VALUES. All three citations survive: pages `[1,2,3]`, each
`citation_region` deep-equal to the seeded locator, each `citation_extraction_id` the receipt's own.
The crossing is asserted to be real (bytes out, a different object back), so the cell cannot pass as
an identity.

**Still not done, and it is the same follow-up as AC3:** this does not run inside a durable WDK
World. No `statementFacts` World driver exists.

### C2-SPEC-01 (major, AC3's two-build leg) — NOT fixed here; refuted as a fix-round item, and costed

The finding is correct and I am not disputing it: `two-build-cutover-e2e.mjs` builds exactly two
scratch images, `className: "chatTurn"` (`:582`, `:1079`) and the original claraWork one, and there
is no `statementFacts` leg. **AC3 must not be recorded as met.**

What I did instead of building it is measure exactly what it costs, so the follow-up is priced from
evidence rather than from the lane's estimate. Three of the five pieces already exist:

* **The third scratch image is free.** `buildPreviousVersionImage({name, className})` is already
  parameterized by class, and cell `1037.x1` proves `deriveVersionPair` / `rewriteRegistryToPrevious`
  apply to `statementFacts` against the real `registry.ts`.
* **Discovery and start are free.** `reconciler-documents.mjs:103` routes `statement_facts` to
  `deps.enqueueStatementFacts`, which `startWorld.ts:381` wires to
  `start(workflows.statementFacts, [{ task_id }])` — so a queued task in build A starts a run on the
  body that image pins.
* **The scripted model seam exists.** `statementFacts.v2.services.mjs:193-194`'s `resolveModel`
  honours `globalThis.__claraModelForTest`, the same override `two-build-serve.mjs` installs.

The two that do NOT exist are the real cost, and neither is a review fix:

1. **A `statement-facts-serve.mjs` child that can serve the VISION channel.** Unlike both existing
   legs, this lane downloads canonical bytes. That is servable — `lib/storage.mjs:292-293`'s
   `responseFor` has a `RELAY_TEST_MODE` branch over `localPath` (`:44`), and the drill already runs
   with `RELAY_TEST_MODE=1` — but the child must WRITE the canonical object into that local store
   first, which no existing drill child does, and must script a `generateObject` answer that
   satisfies BOTH v3's five-key line schema and v4's six-key one.
2. **The parking shape is a RETRY, not an interruption.** Both existing legs park on a durable
   question a human answers (`openWorkQuestionStep`, `clarify`). `statementFacts` has no
   interruption point at all: its body is claim → two reads → one persist, and it is non-terminal
   only while a step is awaiting retry (a `statementWitnessWait` — no done OCR extraction). So the
   leg's assertions are a different shape from anything the drill has today: "non-terminal and still
   bound to v3 across a process boundary", not "answered the question the predecessor opened". That
   design, plus its own cleanup obligations against the drill's inventory gate, is the new work
   `CUT-PLAN.md` §3.2 cost 1 priced before the lane started.

**Recommendation to the orchestrator** (the decision the review says is yours): ship the cut with AC3
PARTIAL, citing the compensating evidence — `f-a2-statement-activation.test.mjs`'s object-identity
and roster cells (12/12), `registry-view.test.mjs` (7/7), `check-workflow-bundle`'s **58 superseded
bodies still ship for parked runs**, and `1037.x1`'s rewrite proof — and file the leg as its own
ticket together with the `statementFacts` World driver, since they share the same prerequisite.

---

## Gates re-run after the fixes

Run in the lane worktree with the RIG.md environment (`PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres
PGDATABASE=clara_l02 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`).

| gate | result |
|---|---|
| `tests/statement-facts-v4-citation.test.mjs` | **10 pass, 0 fail** (was 7 — t1, t2, t3 added) |
| `tests/statement-facts-v4-citation-db.test.mjs` (live rig) | **7 pass, 0 fail** (was 4 — db4, db5, db6 added) |
| `f-a2-statement-activation` + `registry-view` + `f-a2-statement-header-v3` + `f-a2-statement-persist-settle` + `statement-persist-contract` | **64 pass, 0 fail** |
| `node scripts/check-frozen-workflows.mjs` | OK — 327 frozen files, 58 `"use workflow"` modules, 3 retired |
| `… --compare-base 6da02a8de` | OK — **322 existing entries retain the same hash and deployed flag, 5 additions** |
| `check-frozen-workflows.selftest.mjs` / `.registration.selftest.mjs` | OK / OK |
| `pnpm --filter @clara/runtime build` | exit 0 |
| `node scripts/check-worker-paths.mjs` | OK — 2 spawn sites |
| `node scripts/check-workflow-bundle.mjs` | OK — 14 pinned classes, 58 superseded bodies still ship, 46 checks |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — emittable set unchanged, no new wire kind |
| `pnpm typecheck` | exit 0 (`apps/web` and `packages/runtime` both Done) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 across `packages/db`, `apps/web`, `packages/runtime`, `packages/reporting-render` |
| `pnpm --filter @clara/runtime test` (whole suite, once) | **2990 tests, 2950 pass, 2 fail, 38 skipped** |
| `pnpm --filter @clara/web e2e bank-match-walk` on the lane triple | **6/6 passed** (17.6s) |

The two suite failures are RIG.md's named Windows-only reds, unchanged from the lane's own baseline
and reported as such, never "fixed": `scanner rejects EICAR, encrypted PDF, and XML entity expansion`
(#693, Defender removes the EICAR fixture on this host) and `(#806) this host's OWN probe:
pg_dump/psql are on PATH here` (no `pg_dump` on PATH in Git Bash). Pass count moved 2944 → 2950,
which is exactly the six cells added.

**The frozen manifest.** Three of this cut's five entries moved hash (`behavior`, `citations`,
`prompts`) — all five are this lane's own, unmerged, and **unlocked** (`--lock-deployed` was
correctly not run; `CUT-PLAN.md` §2.4). I did **not** re-baseline with `--update`: on this tree that
command rewrites every `note` string's `\uXXXX` escapes and would have produced a 322-entry textual
diff across other lanes' entries. The three `sha256` values were computed
(`sha256` of the file bytes — verified against what `--update` produces for the same file) and
patched in place, leaving the manifest diff at **3 lines changed**. Both the verify gate and
`--compare-base 6da02a8de` are green afterwards, and no new entry carries `deployed`.

**Not owed, not run, with the reason:** `operation-census` / `rig-isolation` (no file under
`packages/db`, no SQL function); the whole `apps/web` unit suite and the web parts census (no
`apps/web` file in `git diff --name-only 6da02a8de..HEAD`); `apps/web/tests/firm-scope-db-pins.corpus.ts`
(no migration, so no content sha to re-measure); the migration redo path (0322 UNUSED).

**The two cutover e2es were NOT re-run**, and that is a decision rather than an omission: my changes
are confined to three modules inside the `statementFacts_v4` closure, which those images only IMPORT
at boot and never execute — the drill's two legs are `claraWork` and `chatTurn`, and the boot pin
line (`statementFacts=statementFacts_v4`, carried by `workflowPins`) is untouched. That the edited
module loads and ships is proven positively rather than assumed: `pnpm --filter @clara/runtime build`
exit 0, `check-workflow-bundle` OK, the whole 2990-test runtime suite, and
`grep -c renderedRegionIndexes packages/runtime/.output/server/index.mjs` = **3**, so the fix is in
the built artifact. The integrator should still re-run both drills on the integration branch.

## Anything unverified

* **AC3 remains PARTIAL** (C2-SPEC-01 above), and with it the durable World WRAPPER for AC1 — cell
  1037.db6 closes the memoization crossing, not the World.
* **CI figures.** Every count is from this Windows rig; the integrator's WSL re-run as `runner` has
  not happened, and the three new cells in the live battery have not been run on Linux. They add no
  Windows path dependency, no spool use, and no dependency on rows another file leaves behind (each
  builds its own firm through `fx.buildFirm`).
* **The scripted model** is still the only mocked thing; no cell measures whether a real model
  answers a CORRECT `region_idx`. That is corpus tuning and out of the ticket's scope — and after
  this round a wrong index lands as no citation in one more way than before.
* **The vision channel's `downloadCanonical` stays stubbed** in the live battery; this rig has no
  object store and storage is not this ticket's subject.
* **`--lock-deployed` still not run**; the five entries stay unlocked, which is the state the hosted
  release ceremony expects to lock (15 unlocked in total: wave 4's ten plus this cut's five).
