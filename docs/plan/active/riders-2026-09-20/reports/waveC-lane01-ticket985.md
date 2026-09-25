# Wave C · lane 01 · ticket #985 — `read_opening_source`, and the `chatTurn_v22` cut

**Branch** `riders/wC-lane01`, cut from `main` at `6da02a8de` (the integrated wave-4 head, PR #1053).
**Worktree** `C:\Users\zhant\Desktop\clara-wt\635`. **Database** `clara_l01` at `127.0.0.1:55741`,
309 files / `0318_knowledge_fye_pair_applicability`.
**Status: DONE.** The ticket is live on this branch (`gh issue view 985`: OPEN, `ready-for-agent`,
the Agent Brief in the body is the newest — **no comments at all on the issue**, so no later ruling
amends it), and nothing on `main` satisfied it: `chatTurn_v21`'s own roster cell pins the tool's
deliberate ABSENCE by name (`tests/chat-turn-v21-tools.test.mjs`, "the contracts this cut could NOT
deliver are absent BY NAME").

## Commits (`git log 6da02a8de..HEAD`)

| commit | what |
|---|---|
| `3c935af20` | `feat(runtime): #985 cut chatTurn_v22 and land read_opening_source` — the whole `chatTurn.v22.*` file set, the five registry edits, the manifest, the parts-parity ledger rows, the freeze selftest rosters, and the DB-free battery |
| `99fd636ac` | `test(runtime): #985 the opening read against a real database — AC2 both ways` |
| `a56ec7b7f` | `docs(runtime): #985 the README records the v22 pin and the module the cut froze` |
| `ae88f8ef2` | `docs(runtime): #985 the floor comment names the cell that drives it` — a claim in a header that named no source, corrected, plus the manifest's new hash for that file |

## The seams I tested at (written down before the first cell, work-order rule 4)

The brief's Key interfaces name exactly two, and I added no cell at a seam it does not give me:

1. **The tool as the model meets it** — `read_opening_source`'s zod input, its place in the built
   tool map (`buildToolsV22`), and the envelope it answers with. Driven through the public
   functions `readOpeningSourceInputSchema`, `buildToolsV22` and `runReadOpeningSource`.
2. **The route core** — `parseOpeningTargets(client, { seedId, firmId, reassert })`, the same
   function `POST /api/opening/parse-targets` calls. Its `{http, body}` answer is the seam the
   refusal mapping is written against; `openingSourceOutcome` is that mapping, exported so a
   reviewer can drive it without a database.
3. (structural, and the repo's own documented standard rather than a behaviour seam) the version
   cut itself: the registry's five edits, the frozen manifest, the parts-parity site ledger and the
   closure-attribution rosters. Work-order rule 4's "where this repo's own documented standard asks
   for a structural cell, that standard wins" — stated here because those cells pin text and
   catalogs rather than behaviour.

Two seams I deliberately did NOT test at: the browser route handler (`src/openingRoutes.ts` is
untouched, and #985 is out of scope for it) and `clara.record_opening_targets_parsed` itself (the
tool never calls it; `packages/db/tests/opening-ledger-source.test.mjs` owns the door).

## Acceptance criteria, each with its evidence

**AC1 — "the tool accepts only `{client_id, seed_id}`; an amount, account code or document id is
rejected by validation, not silently ignored."** DONE.
`readOpeningSourceInputSchema` is `z.object({client_id: uuid, seed_id: uuid}).strict()`.
Cell `v22.opening: the input is `.strict()` and carries ONLY client_id and seed_id`
(`packages/runtime/tests/chat-turn-v22-tools.test.mjs`) drives `safeParse` over
`amount_cents`, `account_code`, `document_id`, `extraction_id` and `lines` — every one refused —
plus a non-uuid seed and a missing field. PASS.

**AC2 — "a successful read records the same targets, and reports the same recorded count, as the
browser action on the same basis."** DONE, and proved two ways against real Postgres
(`packages/runtime/tests/chat-turn-v22-opening-db.test.mjs`, 5/5 on `clara_l01`):
* `985.db: the tool records what the BROWSER action records, on its own basis` — one fixture read
  by the ROUTE CORE on a `clara_runtime` connection (the browser's own road) and a twin fixture read
  by the REAL tool through the supervisor's pool slot: the same recorded count, and the same three
  rows account for account, label for label, cent for cent, each `provenance_kind = document` and
  each citing the region it was re-derived from.
* `985.db: reading a basis the BROWSER already read is the SAME operation, replayed` — the sharper
  half, because both roads mint `openingparse:<seed>:<document>` (`openingOpKey`). The tool reports
  the FIRST read's recorded count, the basis is not doubled (3 rows, not 6), and `clara.op_receipts`
  holds exactly ONE row for that key.
The count itself is never derived here: `openingSourceOutcome` carries `body.lines`, which
`parseOpeningTargets` sets from the door's own `targets_recorded`, and a 202 whose body carries no
usable count is answered as a FAULT rather than as "0 lines" (cell
`v22.opening: a 202 WITHOUT a count is not a successful read`, the sibling door's ADV-08 lesson).

**AC3 — "every refusal the underlying door can return reaches the model verbatim, never replaced by
a generic message."** DONE. `openingSourceOutcome` carries `reason` verbatim, puts the whole body
under `details`, and writes a sentence ONLY for the five fixed tokens the estate can speak about
(`opening_basis_not_found`, `registry_not_open`, `source_reread_since_parse`, `no_opening_tb_lines`,
`no_tie_document`). Cells:
* `the 422 reason travels VERBATIM — its counts, its region ids, its account list` (the named
  all-or-nothing reason inside the model's own message; the chart gap's `unmapped_accounts` array;
  the producer's own refusal text with `source_refusal` and `failing_rows`),
* `the two FIXED 422 tokens are spoken, not printed as machine words`,
* `the two 409 CONFLICTS carry their token and a sentence that names the act a person takes`,
* `a typed CLR refusal reaches the model with its OWN code and reason, unreworded` (CLR31/CLR02/
  CLR28, including a null reason),
* `a 404 is the MASKED answer`,
and end to end on the database: `985.db: an unreadable row forfeits the WHOLE document, and the
answer names the region` — the model is handed `namedUnparseableReason`'s own sentence with the
failing region's uuid in it, and zero targets are authored.
The envelope's `code` is the DOOR's own word (`body.code` when the core carried one, otherwise the
core's own status word, `conflict` / `unparseable` / `not_found`): no CLR code is invented by this
module, because an invented code is a refusal nobody can trace.

**AC4 — "the tool ships on a new `chatTurn` cut, never backported onto an already-frozen one."**
DONE. `chatTurn.v22.{ts,impl.ts,prompt.ts,tools.ts,usage.ts}` are new files; v21's five files are
byte-untouched (`git diff 6da02a8de..HEAD` touches no `chatTurn.v21.*` source file — only its TEST
file, see "what else moved"). The registry carries the five edits §2.2 names, in the exact textual
shapes `tests/scratch-image.mjs`'s `rewriteRegistryToPrevious` asserts. `frozen-workflows.json`
gained six entries and mutated none (`--compare-base 6da02a8de`: 322 existing entries retain the
same hash and deployed flag, 6 additions).

**AC5 — "Clara's prompt guidance states she may only report a figure returned by this tool's read,
never one she infers."** DONE. `OPENING_SOURCE_CHAT_GUIDANCE` says it in the form this tool makes
true: the read answers ONE figure, the recorded line count, and every amount stays on the basis —
"Report that count, and never a figure you did not get back — not a total, not a balance, not one
line's own amount." Cells `SYSTEM_PROMPT_V22 is v21's text plus ONE paragraph, byte for byte` and
`the stanza says she may report ONLY what the read returned` (which also pins the all-or-nothing
law, "reading is not approving", the refusal-is-final rule, and that the stanza names no tool this
body does not carry).

## Out of scope, honoured

"Writing parsed targets or approving a basis from chat" — the tool reaches the writer only through
the route core, and the stanza says in the model's own words that she cannot approve an opening
basis. "Changing the read-and-parse door's own behavior (#986)" — `lib/opening-parse.mjs` is
byte-untouched; it is now hash-locked, which is a manifest fact rather than an edit.

## Migration

**NONE. `0319` is reserved and UNUSED**, exactly as §1.2 A4 predicted, and the prediction was
re-measured rather than trusted: `clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)` is
EXECUTE-granted to `clara_runtime` in 0017's grant block, and `clara.resolve_chat_principal(uuid)`
to `clara_runtime` in `0006_runtime_core.sql:1175`. **Measured live on `clara_l01`, not transcribed:**
`has_function_privilege('clara_runtime', …)` answers `true` for both, and
`has_function_privilege('clara_authenticated','clara.record_opening_targets_parsed(…)','EXECUTE')`
answers `false` — which is also why the bookkeeper+ floor had to be restated in the tool: there is
no human-lane twin to carry it. The DB-backed battery then drives both doors on this rig through
the tool itself. No prestate pins, no
gate-chain entry, no rig-meta cohort — there is no migration to carry them.

## The lib module that joined a frozen closure (§2.7 / R4), and why I chose the lock

`packages/runtime/lib/opening-parse.mjs` is now frozen, because `chatTurn.v22.tools.ts` imports
`parseOpeningTargets` and `readOpeningSeed` from it.

* MEASURED before writing the import: `--print-closure packages/runtime/lib/opening-parse.mjs` on
  `main` → "locked by 0 of 309 @frozen entry file(s)". After: "locked by 4 of 314" (v22's four
  files), and `--print-closure packages/runtime/workflows/chatTurn.v22.ts` → itself alone.
* **THE COST IS EXACTLY ONE FILE.** `opening-parse.mjs` has NO imports at all, so nothing travels
  with it — and #656 arranged that deliberately: its `OPENING_TB_REFUSAL_ENVELOPE_KEY` comment
  spells the producer's envelope key out rather than importing `lib/opening-tb-produce.mjs`, "the
  door must not gain an import edge into the producer, **which would freeze the producer the day a
  Clara tool imports this door**". The estate anticipated this exact import.
* The four other importers (`src/openingRoutes.ts`, `lib/opening-tb-cells.mjs`,
  `lib/opening-tb-produce.mjs`, `lib/egress.mjs`) keep importing it and stay editable; what is
  frozen is this file's own text.
* **The versioned copy the prompt prefers was considered and REFUSED, with the reason.** A copy
  under the frozen file set would put a SECOND derivation of a client's opening figures in the
  estate, and it would break the two clauses that make this ticket checkable: #656's contract fixes
  the door call as "the existing route core … it must **not** call `clara.record_opening_targets
  _parsed` directly", and AC2 asks for "the same targets … as the browser action", which is only
  provable while both roads run ONE derivation under ONE op key (the replay cell above is exactly
  that proof). Freezing one 511-line module with no dependents inside the closure is the smaller
  price than two copies of an accounting derivation drifting apart.
* Consequence recorded for whoever needs it later: a behavioural change to the opening parse is now
  a NEW module plus a chatTurn successor that imports it, never an edit in place (owner ruling
  2026-09-15, `packages/runtime/README.md`). The manifest entry says so in its `note`.

## What else moved, and why (the censuses a cut always grows)

* `packages/runtime/scripts/parts-parity-exemptions.mjs` — three rows for `chatTurn.v22.ts`
  (`tool-call`, `tool-result`, `json`). All three fingerprints came back byte-identical to v19's,
  v20's and v21's, which is the ledger (not a reviewer's eye) establishing that the park/resume
  statements were carried over unchanged.
* `scripts/check-frozen-workflows.selftest.mjs` — the #815 attribution rosters: `knowledge.mjs`
  18 → 22, `periodic-adjustment-basis.ts` 13 → 17, `knowledge-retrieval.mjs` 4 → 6 (all reached
  transitively, because v22's prompt re-exports v21's and v22's impl imports v21's step), plus a NEW
  roster for `lib/opening-parse.mjs` recorded at its birth, the way the previous cut recorded its
  three.
* `packages/runtime/tests/chat-turn-v21-tools.test.mjs` — its identity cell asserted
  `workflowPins.chatTurn === "chatTurn_v21"` as a LITERAL and went red at the repoint. Rewritten to
  what v20's own cell was rewritten to at the previous cut: v21 is still exported, still on the body
  roster, and the pin/dispatch table agree whatever the pin is. This is R3's named trap, met once.
* No `chatTurn.v22.parts.ts`: no new wire kind (#985's contract says "reuse the existing typed
  receipt part"), so `check-parts-parity.mjs` has no new declarer and `chatTurn.v19.parts.ts` stays
  the declarer, byte-untouched. `apps/web` is **untouched** — the web parts census (§2.6) is a no-op
  for this ticket and was run as such (see gates).

## Gates, with counts

| gate | result |
|---|---|
| `node --test tests/chat-turn-v22-tools.test.mjs` | **18/18 pass** |
| `node --test tests/chat-turn-v22-opening-db.test.mjs` (PG env → `clara_l01`) | **5/5 pass** |
| `node --test tests/chat-turn-v21-tools.test.mjs` (touched) | **26/26 pass** |
| `node --test tests/registry-view.test.mjs` | 7/7 |
| `node --test tests/p6-1-parts-parity.test.mjs` | 22/22 |
| `node --test tests/p6-1-chatturn-v16.test.mjs` | 28/28 |
| `node --test tests/runtime-contracts.test.mjs` | 2/2 |
| `node scripts/check-frozen-workflows.mjs` | OK — 328 frozen files, 58 `"use workflow"` modules all frozen+registered |
| `node scripts/check-frozen-workflows.mjs --compare-base 6da02a8de` | OK — 322 unchanged, **6 additions**, 0 mutations |
| `node scripts/check-frozen-workflows.selftest.mjs` | OK — all cases |
| `node scripts/check-frozen-workflows.registration.selftest.mjs` | OK |
| `pnpm --filter @clara/runtime build` | OK (nitro, `.output/server/index.mjs`) |
| `node scripts/check-worker-paths.mjs` | OK — 2 spawn sites |
| `node scripts/check-workflow-bundle.mjs` | OK — 14 pinned classes, **chatTurn pinned at v22 with its step directive, engine stamp and `freeform_result` emitter**, 58 superseded bodies still shipping (46 checks) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — reader ⊇ emittable |
| **whole runtime suite** (`node --test --test-concurrency=1 "tests/**/*.test.mjs"`, PG env → `clara_l01`) | **2993 tests, 2953 pass, 2 fail, 38 skipped, 307s** — and BOTH failures are RIG.md's named Windows-only reds, reported as such and not "fixed": `scanner rejects EICAR…` (#693, Defender eats the fixture) and `(#806) this host's OWN probe: pg_dump/psql are on PATH here` (no `pg_dump` on this PATH). The other named reds (`rollback-preflight 637.pf: B3`, `wake-engine M1`, `relay-runner`) were GREEN in this run. |
| **version-cutover e2e** (§4.3) | **ALL PASS.** `PGDATABASE=clara_rt_test` + matching DSN, `RELAY_TEST_MODE=1`, against a TEMPLATE COPY of `clara_l01` (`create database clara_rt_test template clara_l01`, then `pnpm --filter @clara/runtime exec bootstrap` for the WDK world) — never a second from-scratch chain, because 0154 pins a cluster-global role count. It staged a parked run on the retained `chatTurn_v7` fixture, cut a second turn over to whatever the registry pins, and printed `RESUME v7: completed on v7 body (name-invariant)` and `static guards: registry repoint (-> chatTurn_v22) + v7 retention + frozen v7/chatTurn.v22.ts hash-locks (v7 deploy-locked; chatTurn.v22.ts deployed=false — ceremony-dependent, not asserted either way)`. The clone was DROPPED afterwards and the lane database re-measured: 0 world schemas, 309 migrations, max `0318` — so `rig-isolation` T10b stays green on `clara_l01` (#866). The file needed no edit for v22, as §4.3 predicted. |
| `pnpm typecheck` (root, 3 projects) | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root, the runner's own shape) | **exit 0** |
| `apps/web` unit suite / browser walks | NOT RUN, and correctly: this ticket touches no file under `apps/web` (`git diff --stat 6da02a8de..HEAD`). The web parts census (§2.6) is a no-op because no wire kind was added; run and reported as such. |

## Successor contracts and obligations I am handing on

This ticket EDITS the new v22 files rather than needing a successor contract of its own. What the
tickets behind me in this lane inherit:

1. **The `source_reread_since_parse` fix sentence names the PERSON's act, not a tool.** #656's
   contract says the guidance beside that mapping should name `refresh_opening_source`; that tool is
   roster entry A3 (#986's chat half) and this body does not carry it. Pointing a model at a tool it
   has not been handed is how a turn ends in an invented call, so `OPENING_SOURCE_FIXES
   .source_reread_since_parse` currently reads "A person brings the basis onto the newest reading of
   the document from the client's Registers page" — which is true, and is the act the browser
   already offers (`isSourceRereadConflict` + the Refresh control). **When A3 lands, that one string
   becomes the tool's name**, and the comment above it says so.
2. **`claraWork_v6` is NOT minted here** (no claraWork change was needed), so its sixth
   `CLARA_WORK_BUNDLE_V6_BANNER` import and `console.log` line in `plugins/startWorld.ts` is still
   owed, in the SAME commit as the claraWork registry repoint — the last cut's one real defect
   (R2). `workflowPins.claraWork` is still `claraWork_v5` and `statementFacts` still
   `statementFacts_v3` at this HEAD; my identity cell pins both so the next ticket's repoint is a
   deliberate edit rather than a silent one.
3. **The roster count cell** (`v22.roster: v22 is v21's tool set plus EXACTLY read_opening_source`,
   39 → 40) is the cell each later ticket of this lane edits when it adds its tool. That is the
   estate's own pattern (v21's cell counts 39) and it is the one place the roster is enumerated
   rather than assumed.
4. **`chatTurn.v22.prompt.ts` appends ONE stanza today.** A later ticket appends its own after it;
   `SYSTEM_PROMPT_V22 = v21 + stanzas` and the "byte for byte" cell will need its added-text
   assertions extended, not replaced.

## Follow-ups worth filing

* **`apps/web/lib/clara/toolLabel.ts`'s `CHAT_TOOL_TOKENS` is two cuts behind.** It carries neither
  of v21's tools (`start_trade_invoice_work`, `run_depreciation_period_for_client`) nor v22's
  `read_opening_source`, so the transcript shows the raw token as its own label. An unknown token is
  explicitly NOT a defect there (the helper falls back to the token), which is why the previous cut
  left it too — but three missing labels is now a small, real polish item for whichever ticket next
  touches `apps/web`, together with the `Clara.tools.*` message keys.
* **A World walk for `read_opening_source`.** §4.5 assigns `chat-turn-v22-e2e.mjs` to the
  roster-application step of this lane, and it is not mine to mint (it would collide with that
  worker's own file, its `DRIVERS` roster row and its `db-live-gates/action.yml` row). What this
  ticket proves instead is stronger than a mock: the DB-backed battery drives the REAL tool through
  the REAL pool slot against real Postgres. The gap that remains is specifically "a MODEL reaches
  this tool inside a running engine" — and §4.5's own trap 3 applies to it: the seed id must reach
  the model through the prompt, never out of band.

## Anything unverified

* **Hosted.** Nothing hosted: no deploy, no hosted read, no `--lock-deployed` (correctly — §2.4:
  locking belongs to the release ceremony, after the image is live).
* **The two-build cutover drill (§4.4)** is the integrator's, on a fresh cluster, and was not run
  here.
* **The claraWork and statementFacts halves of the cut phase** are other tickets' and other lanes';
  this report speaks only for `chatTurn_v22` at this HEAD.
* **A second membership.** `clara.resolve_chat_principal` answers ONE row (`limit 1`), so a user
  with memberships in two firms resolves to whichever the door returns — the SAME property
  `src/openingRoutes.ts` has today through `resolvePrincipal`. This ticket neither widened nor
  narrowed it; it is named here because the floor check now has a second caller.
* **The Windows-only reds** named in RIG.md are reported as such, never "fixed" (see the whole-suite
  line).
