# Wave 2026-09-15 — the successor cut's fix round (`successors-review.json` F1–F8)

Branch `integration/wave-2026-09-15` @ **`9ec330da`**, worktree `C:\Users\zhant\Desktop\clara-wt\int`,
clean, on top of the re-base tip `d378c18b`. **One commit, twelve files, +647 / −72**; the branch is
now **155 commits ahead of `origin/main` (`7e40e3be`), 362 files changed, +84,995 / −627** (the 362nd
is `interview-kill-resume-e2e.mjs`, which the wave had not touched until F2). Nothing pushed, no PR,
no ticket worktree touched, no migration edited, `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched
(`git diff --name-only origin/main -- docs/` is empty). **`--lock-deployed` has NOT run**, which is
what made all of this re-cuttable: every file changed below is frozen but not deploy-locked.

**Headline.** The blocker is closed at the contract the DATABASE actually holds, not at the one the
module wished for: `clara.answer_work_question` stores a `text` field's answer as a JSON **string**,
so the two depreciation drivers stay `text` and the schema converts. Six `should`s follow, each with
a red cell written before the fix. F8 was closed by the re-base; its three concrete asks are
re-verified here. **F9, F10 and F11 are NOT applied** and §4 says why for each.

**Everything below is LOCAL. Hosted evidence: none, anywhere in this wave.**

---

## 1 · The findings, one at a time

### F1 — blocker. `lib/fixed-asset-acquisition.ts`: the field kind and the schema could not both be satisfied

**The one contract, decided: the DOOR's answer grammar.** `clara._assert_work_answer`
(0180:444-486) judges an answer against the DECLARED FIELDS — a `text` field is a JSON string and
nothing else, a `money` field an integer JSON number and nothing else, and the reserved `note` is
explicitly admitted beside them. `clara._fa_validate_particulars` (0041:2970-3033) judges
`p_particulars`, where the drivers are numbers. Two grammars, both the database's, and the module
had no bridge.

**`FA_PARTICULARS_FIELDS` is UNCHANGED** — the two drivers stay `kind: "text"`. Three reasons, all
measured rather than preferred:

1. `money` would be wrong for a months count. `apps/web/lib/work/question-fields.ts:136-140` runs a
   money control's typed text through `parseAmountToCents`, so a person typing `60` months would
   have sent **6000**. The review's suggested `money` arm is the one option that introduces a
   hundred-fold error.
2. The `text` array is already PROVEN against the door: `clara._assert_work_question_fields`
   accepts it verbatim, and `packages/db/tests/fixed-asset-acquisition.test.mjs`'s
   `p639.question.dependent` answers `useful_life_months: "60"` on a live rig and then applies
   `useful_life_months: 60` through the `_for` door — the string/number split is the DB battery's
   own shape.
3. Changing the field array would have moved a db-battery fixture (`fixed-asset-acquisition-fixtures.mjs:325`
   carries a byte-identical copy) for no gain.

**What changed.** `faParticularsAnswerSchema` is now `z.preprocess(fromDoorAnswer, <the same
`.strict()` object>)`. `fromDoorAnswer` applies three rules, each one the door's own:

* a `text`-declared integer driver arrives as a decimal string and becomes a number; anything that
  is not a whole number is left ALONE so the refusal names the field (`z.coerce.number()` would have
  turned `""` into a zero and `"6.5"` into a rounding argument);
* a BLANK optional is ABSENT — 0180 skips a whitespace-only optional in its validation loop and then
  stores the answer VERBATIM (`answer = p_answer`, 0180:847), so the blank really does arrive;
* the reserved `note` is dropped before `p_particulars` — it stays durable on
  `clara.agent_interruptions.answer`, which is the record every surface renders, and
  `_fa_validate_particulars` would refuse it as `unknown_key`.

**And a schema refusal now names the CONTROL.** `applyParticularsStepV4` reads the first issue's
path and reports it as `field` when it is a key the particulars door accepts. A door CLR37 already
got a control through `refusalFieldForAxis`; a local one returned `null`, which is the single
refusal a surface cannot act on.

**RED FIRST.** `fa.door` (new, `tests/fixed-asset-acquisition-unit.test.mjs`) failed naming all
three breaks at once, which is why it is one cell and not three:

```
the door-shaped answer parses ([
  {"expected":"number","code":"invalid_type","path":["useful_life_months"]},
  {"expected":"number","code":"invalid_type","path":["rate_bps"]},
  {"code":"unrecognized_keys","keys":["note"]}])
```

**Measured on the live 0224 chain** (`rigint3` 55621 / `clara_int3`, read-only), with the real
`FA_PARTICULARS_FIELDS` array:

| probe | verdict |
|---|---|
| `_assert_work_question_fields(FA_PARTICULARS_FIELDS)` | **ACCEPTS** as shipped |
| `_assert_work_answer` — `useful_life_months` as NUMBER `60` | **REFUSES** `CLR10 {"field":"useful_life_months","constraint":"text"}` |
| … as STRING `"60"` | **ACCEPTS** |
| … plus a reserved `note` and a blank `rate_bps` | **ACCEPTS** |
| `reducing_balance`, both drivers as strings | **ACCEPTS** |
| `residual_cents` as a STRING | **REFUSES** `CLR10 … integer_cents` — which is why the bridge converts the two `text` drivers and NOT the money field |

**Cells moved to the contract, not to the schema.** `clara-work-v4.test.mjs`'s local-mirror cell
drove `useful_life_months: 60` — a number the door can never deliver — so it tested the schema
against itself. It now parses the DOOR shape first and asserts the bridge produced `60`.

### F2 — `interview-kill-resume-e2e.mjs`, a registered `db-live-gates` step that reds under v5

`:331` pinned 15 answered and `:335` pinned 16 business items; `clientOnboarding_v5` answers 16 and
writes 17 because `fye_day` was inserted after `fye`. Both literals moved, and the comment now names
the sixteenth segment and points at `interview-e2e.mjs`'s own already-updated drive. **Measured on
the rig: `INTERVIEW KILL-RESUME E2E: PASS`** (§3).

### F3 — eighteen empty manifest notes

All eighteen new entries now carry a note, written **through the tool's own mechanism**: `--update`
preserves `prev.note` (`scripts/check-frozen-workflows.mjs:264`), so the notes were written into the
manifest and `--update` re-run — twice — to a measured no-op for every note. Each note carries the
three parts the four existing frozen-by-closure notes use: a provenance sentence, a
`DEPLOY ORDER: …` sentence **with the NEW migration numbers**, and `NOT deploy-locked yet`.

| entries | deploy order stated |
|---|---|
| `chatTurn.v20.{ts,impl,prompt,tools,usage}.ts` | **0221** (staff expense claims) AND **0222** (accrual adjustments), on top of v19's 0192 + 0194 |
| `claraWork.v4.{ts,impl,tools,prompt,errors,bundle}.ts` | **0192** (knowledge pack) AND **0216** (particulars door), on top of v3's 0195 — and v3's 0195 rollback cost restated |
| `clientOnboarding.v5.ts`, `interview.v4.{questions,known}.ts` | **0192**, already live from the v19 image; **0219** named as the HUMAN lane, not this body's order |
| `lib/staff-expense-claim-basis.ts` | **0221** |
| `lib/accrual-basis.ts` | **0222** |
| `lib/fixed-asset-acquisition.ts` | **0216** (and the two-spelling bridge F1 added) |
| `lib/knowledge-conflicts.mjs` | **0192** (and the no-module-level-`node:` rule) |

`node -e` over the committed manifest afterwards: **296 entries, 18 new, 0 with an empty note, 3
retired.** (`clientOnboarding.v4.ts` also carries an empty note — it is `deployed: true`, a previous
cut's entry, and not this round's to touch.)

### F4 — the particulars question's `source_ref`

`{ kind: "basis_line", id: pending.assetId }` → **`{ kind: "fixed_asset", asset_id: pending.assetId }`**,
which is #639's stanza verbatim. It is built inside `particularsQuestionV4` (`claraWork.v4.impl.ts`)
so the one cast it needs sits beside its reason, and the workflow body simply passes `asked.sourceRef`.

Why the cast is lawful, measured rather than argued: the database's ONLY rule on that column is
`agent_interruptions_source_ref_check CHECK (source_ref IS NULL OR jsonb_typeof(source_ref) = 'object')`
(0180:183). `workQuestionSourceRefSchema`'s three-kind enum is what a MODEL may put in an
`ask_question` call — a model inventing kinds is a surface nobody can resolve — and this question is
not a model's; it is the workflow's own act after a commit. The DB battery already drives exactly
this shape and asserts `q.source_ref.asset_id`.

**The named consequence.** `sourceRefText` (`apps/web/components/work/work-question-form.tsx:837`)
reads `kind` and `id`, so the answer form's supporting line now reads `fixed_asset` — the right label
with no uuid — instead of `basis_line <asset-uuid>` — the wrong label with one. The asset is named in
the question itself and its cost in the context, so nothing a person needs was lost. Recorded in the
file and here rather than left for the next reader to rediscover.

### F5 — `knownFactsFromPack`'s precedence was asserted, and the database does not provide it

**Measured on the live body, not read off the file.** `clara.get_knowledge_pack`'s `prosrc` on the
0224 chain contains exactly ONE aggregate — `jsonb_agg(j order by knowledge_key)` — and **no ORDER BY
anywhere in it mentions `scope_kind`**; the legacy rows are then concatenated as a second, separate
step. Its firm arm excludes a firm row only when a client row shares the same `applies_when_digest`,
so a firm rule and a narrower client exception under one key both reach the pack in an order nothing
defines. `select knowledge_key from clara.knowledge_key_firm_eligibility` → `accounting_basis,
default_currency, reporting_framework`, and `default_currency` is `KNOWN_FACT_KEYS.currency`.

So the fold makes the rule true instead of hoping for it: **a `scope_kind:'client'` row wins over a
`'firm'` row under the same key, whatever order they arrive in**; among rows of the same scope the
first still wins. The docblock now states the measurement rather than the wish.

RED FIRST: the cell now drives four packs — client-first, **firm-first**, firm-only, and two client
rows — and failed on the firm-first arm before the fold changed.

### F6 — `ask_knowledge_conflict` could kill the Work instead of asking

Three parts, because the finding has three.

1. **`knowledgeConflictFields` de-duplicates by `record_id`** (first mention wins, order preserved).
   Measured: `_assert_work_question_fields` REFUSES a choice whose two options share a value —
   `CLR10 {"field":"which_applies","reason":"invalid_fields","constraint":"option_values_unique"}` —
   and ACCEPTS the de-duplicated list this function now emits.
2. **`findQuestionCallV4` refuses fewer than two DISTINCT records**, the same way it already refuses
   `rows.length < 2`, through a new exported `distinctConflictRecordCount` so the refusal and the
   option list are one count rather than two readings.
3. **Both `openWorkQuestionStep` calls are wrapped.** They are door calls and door calls raise.
   * The **particulars** open (after a commit) now settles **`completed`** with
     `particularsPendingNote(assetId, "not_opened")`. Unwrapped it reached the outer catch and
     settled `failed`/`internal` with *"This Work run failed before it could record an entry.
     Nothing was posted."* — a **false sentence about a posted ledger entry**. The new note says the
     acquisition posted, the particulars are pending, and they can be completed from the asset's own
     page.
   * The **model's** question open settles `failed`/`internal` with a new
     `questionNotOpenedPayload()`: reason `question_not_opened`, `recoverable: true`, "nothing was
     posted and nobody was asked. Re-running the Work is safe."

   `.catch(() => null)` on a step await is this body's own existing idiom (`closeStreamStep().catch`,
   `settle(...).catch`), and a WDK replay memoises the throw, so the branch is deterministic.

RED FIRST: two cells — a three-row list with a repeated id must emit unique option values, and a
two-row call naming ONE record must park nothing. Both failed before the change.

**Deliberately one-sided:** `conflictContext` still lists every row the model reported, including a
repeated record. That is coherent rather than sloppy — the context is the DIAGNOSIS the run reported
("this record, under two readings"), the options are what a person may CHOOSE, and the door decides
the second list.

### F7 — #649's item 3 shipped half; both halves are now built

**(a) `prior` is seeded from the plan's own answered items.** New pure
`priorFromPlanItems(segments, items)` in `interview.v4.known.ts`, and a `planAnswered` set in
`clientOnboarding.v5.ts` that skips a segment the plan already answers. It closes an ordinary case:
a firm that filled part of the plan from the dashboard and then started the interview was asked every
one of those questions again. Each item goes through the SEGMENT'S OWN validator, in segment order
(so `fye_day` is judged against the `fye` the fold just accepted), a value the validator refuses
seeds nothing and the question is asked, and a validator that throws is treated as a refusal.
`answered` still counts what THIS run asked — nothing is written for a question nobody was asked.

**`clara.begin_client_onboarding` (0017:2492) seeds NO plan items**, measured in its body, so a plan
born and interviewed in one go folds to `{}` and a first run is byte-for-byte v4's. That is what
makes this safe, and it is why both World interview legs are unmoved.

**(b) a register-answered item is stamped honestly.** There was no third state available:
`item_kind` is CHECKed closed to `must_ask`/`capture`/`todo` (0017:1045), and
`clara.update_onboarding_plan` REQUIRES `p_answered_by` to be an active bookkeeper+ of the firm
(0017:2661-2666, the `answered_by is not an active bookkeeper for this firm` CLR04) and stamps it onto every non-pending item (0017:2680-2681), so a null actor is
refused outright. Wrapping the value in a provenance envelope was refused for a different reason:
`commit_client_onboarding` reads plan answers BY NAME, and that would have moved the ceremony's gate.

So the provenance sits BESIDE the answer: `knownProvenanceItem(fact)` emits one extra `capture` item
keyed `<segment>__known_from_register`, `required_for_commit: false`, carrying
`{knowledge_key, knowledge_record_id, knowledge_version, scope_kind, trust, source_kind}` — the same
ground `fye_day` stands on (a NEW key nothing in the commit vocabulary reads). It rides in the SAME
CAS write, so it costs no extra revision.

### F8 — the moved main. Closed by the re-base; its three asks re-verified here

| ask | verification |
|---|---|
| main's `retired` section intact | `git show origin/main:frozen-workflows.json` vs ours, compared as parsed JSON: **identical**, 3 entries, `#810 owner ruling 2026-09-15`, top keys `[version, workflows, retired]`. `--compare-base origin/main` reports "3 recorded retirement(s)". |
| the three body headers name the NEW numbers | `chatTurn.v20.ts:40` *"MIGRATIONS 0221 AND 0222 MUST BE LIVE …"*; `claraWork.v4.ts:51` *"MIGRATIONS 0192 … AND 0216 …"*; `clientOnboarding.v5.ts:56-61` *"… `clara.get_knowledge_pack` (0192) …"* with 0219 named as the HUMAN lane. The manifest notes F3 added repeat the same numbers. |
| no wave file cites an old number | `git grep` for all eleven old stems (`0199_client_work_pack` … `0209_preview_invite`): **zero hits**. Every ADDED line still carrying a bare 0199–0209 was read: **9 lines in 7 files**, each a citation of MAIN's own migration — #809's `0203` (`accrual-form.test.tsx`, `prepayments-keyboard.test.tsx`, `accrual-mock.mjs`, `prepayments-mock.mjs`, `serve-built.mjs`), #778's `0201` (three NOTICE strings in `0217_document_source_revision.sql`) and #787's `0204` (one in `0221_staff_expense_claims.sql`). None names a renumbered wave migration. |

---

## 2 · The twelve files

| file | what it carries |
|---|---|
| `packages/runtime/lib/fixed-asset-acquisition.ts` | F1 — `fromDoorAnswer` + the two-grammar docblock; the `text`-not-`money` reason on the field array |
| `packages/runtime/lib/knowledge-conflicts.mjs` | F6 — the de-duplicated option list + `distinctConflictRecordCount` |
| `packages/runtime/workflows/claraWork.v4.impl.ts` | F4 — the `fixed_asset` source ref; F6 — the distinct-record refusal; F1 — the named control on a schema refusal |
| `packages/runtime/workflows/claraWork.v4.ts` | F4/F6 — `asked.sourceRef`, and both opens wrapped |
| `packages/runtime/workflows/claraWork.v4.errors.ts` | F6 — `particularsPendingNote(…, "not_opened")` and `questionNotOpenedPayload()` |
| `packages/runtime/workflows/interview.v4.known.ts` | F5 — client-before-firm; F7 — `priorFromPlanItems`, `knownProvenanceItem` |
| `packages/runtime/workflows/clientOnboarding.v5.ts` | F7 — the seeded `prior`, the plan-answered skip, the provenance item; header now states FOUR differences |
| `packages/runtime/tests/fixed-asset-acquisition-unit.test.mjs` | F1's red cell (`fa.door`) |
| `packages/runtime/tests/clara-work-v4.test.mjs` | F1/F4/F6 cells; the mirror cell re-pointed at the door shape |
| `packages/runtime/tests/client-onboarding-v5.test.mjs` | F5's four-pack cell; F7's four cells |
| `packages/runtime/tests/interview-kill-resume-e2e.mjs` | F2 — 15→16, 16→17, the comment |
| `frozen-workflows.json` | F3's eighteen notes + the re-baselined hashes of the seven bodies this round changed |

---

## 3 · Every command, with its result

Node 22.23.2. All static gates and the unit batteries were re-run **after** the final source edit,
against the image built from that same tree.

### 3.1 · Static gates — all exit 0

| gate | evidence |
|---|---|
| `pnpm --filter @clara/runtime build` | nitro, **53 workflows / 230 steps**; the `input source map` ERROR lines from `@ai-sdk/*` are the pre-existing noise the cut's report already named, exit code unaffected |
| `pnpm typecheck` | `packages/runtime: Done`, `apps/web: Done` |
| `pnpm lint` | the whole chain — freeze-lint + its three selftests, `check-dead-citations` (which is what proves every `0180:…` / `0017:…` citation added above resolves), 13 sibling checkers, eslint, every workspace's own lint |
| `node scripts/check-frozen-workflows.mjs` | `296 frozen file(s) verified … (append-only vs origin/main); 53 "use workflow" module(s) all frozen+registered; 3 retired entr(ies) recorded` |
| `… --compare-base origin/main` | `278 existing entr(ies) retain the same hash and deployed flag; 18 addition(s); 3 recorded retirement(s)` |
| `node packages/runtime/scripts/check-parts-parity.mjs` | reader ⊇ emittable; **no new kind**; `work_result` gains `claraWork.v4.impl.ts:558` (the line moved with this round's edits, the site did not) |
| `node scripts/check-workflow-bundle.mjs` | `12 pinned class(es) … 53 superseded body(ies) still ship for parked runs, chatTurn pinned at v20 … (40 checks)` |
| `node scripts/check-worker-paths.mjs` | 2 spawn sites through `resolveLibWorker`; built bundle verified against the deployed layout |

### 3.2 · The cut's unit batteries

`node --test tests/{chat-turn-v20-tools,clara-work-v4,client-onboarding-v5,fixed-asset-acquisition-unit}.test.mjs`
→ **71 tests, 71 pass, 0 fail, 0 skipped** (53 before this round + 4 FA-module cells + 14 new cells).

Neighbours re-run: `chatturn-v18` **16/16**, `p6-1-parts-parity` **22/22**, `p6-1-chatturn-v16`
**29/29**, `accrual-basis-unit`, `staff-expense-claim-unit`, `prepayment-schedule-basis-unit`,
`counterparty-identity-unit`, `wave-b-interview-park-ordering`, `coa-interview-v4` — all green in
isolation (see §5 for the one cross-file interference found).

### 3.3 · The World legs

All five on **`rigfix` `127.0.0.1:55622`** (§6), against the image built from the FINAL tree, each
leg starting from a database restored out of the pristine post-bootstrap master.

| leg | database | result |
|---|---|---|
| `tests/interview-e2e.mjs` | `clara_wave_b_ci` | **INTERVIEW E2E: ALL PASS**, exit 0 — the two cancel scenarios, `PASS (positive): full 16-segment drive → interview_complete, 17 items, no dupes, revision advanced`, and `PASS (p649.interview.sst_park_closed)` |
| `tests/interview-kill-resume-e2e.mjs` | `clara_wave_b_ci` | **INTERVIEW KILL-RESUME E2E: PASS**, exit 0 — *SIGKILL mid-park → same-index re-park, byte-identical checkpoints, exactly-once drive to complete*. **This is F2, measured**: the file's own assertions are now 16 answered / 17 business items and both hold on a real engine across a hard kill. |
| `tests/version-cutover-e2e.mjs` | `clara_wave_b_ci` | **VERSION CUTOVER E2E: ALL PASS**, exit 0 — `CUTOVER: new admission → chatTurn_v20 (workflow//./workflows/chatTurn.v20//chatTurn_v20)` |
| `tests/chat-turn-v20-e2e.mjs` | `clara_wave_b_ci` | **CHAT TURN V20 E2E: PASS (4 legs)**, exit 0 — serving bundle digest `81e1ffcd5526…`; PASS 1 a real v20 turn admitted a staff-expense-claim Work and the reconciler ran it to a posted entry (17.9 s); PASS 2 the future-window accrual is "configured, nothing due yet"; PASS 3 the run read the client's knowledge AND recorded `knowledge_version=0` as an observed revision; PASS 4 the claim's particulars never reached the run and the transcript carries exactly one card |
| `tests/two-build-cutover-e2e.mjs` | `clara_rt_test` | **TWO-BUILD CUTOVER E2E: ALL PASS**, exit 0 — pair derived `claraWork_v3` → `claraWork_v4`; **A carries 52 bodies, B 53** (52/53, not the cut's 53/54, because `chatTurn_v1` is retired on main); W1 parked on v3 completes on **v3** inside build B; rollback to A REFUSED naming `claraWork_v4`; scoped-to-W1 allowed while the global verdict refuses; the frontier rule measured by constructed difference at `0224_preview_invite`; and the chatTurn half (`chatTurn_v19` → `chatTurn_v20`) resumes a parked turn on v19 inside build B |

**What these legs DO prove about this round:** F2 directly; that nothing in F1's, F4's, F5's, F6's or
F7's edits regressed a real run of any of the three cut bodies; and that the image built from this
tree still cuts over, rolls back and resumes exactly as the cut measured.

**What they do NOT prove, said plainly:**

* **The #639 particulars question is still not driven positively by any World leg.** `chat-turn-v20-e2e`
  leg 4 asserts the particulars never reached the run — which is what that leg is for — so F1's fix is
  proven at the DOOR (the probes in §1, run against the live 0224 chain) and in the unit cells, not in
  a World run. That gap pre-dates this round; the review named it and it is unchanged.
* **F7's two new paths are not reached** (§4, residual 1): the rig carries zero `clara.knowledge_records`
  and the e2e's plan is born empty.
* **F6's wrapped-open branches are not reached** (§4, residual 2).

---

## 4 · What was NOT applied, and why

| finding | why not |
|---|---|
| **F9** (`replayed` is structurally always false on two of three paths) | Outside F1–F7. Its honest fix is a MIGRATION — the two doors setting `'replayed', true` on their dedupe branch the way `_admit_accounting_work_core` (0178) does — and this round writes no migration. The alternative (dropping the field) changes what a settled Work result carries for every run, which is a behavioural change made on the way past. Carried. |
| **F10** (a converged accrual occurrence can mint a `work_accepted` card with an empty `logical_op_id`) | Outside F1–F7, and its fix is an `apps/web` change (a `catalog.ts` fixture) that the cut deliberately avoids — this round changes no file under `apps/web` (`git status` there is empty). Carried. |
| **F11** (the one module-level `node:` import, inherited) | The finding's own text says "No change owed by this cut". Carried. |
| The `conflictContext` half of F6 | Stated in §1 F6 as a deliberate asymmetry, not an omission. |

**Residuals this round creates, named rather than left to be found:**

1. **Neither of F7's new paths is exercised by a World leg.** `clara.knowledge_records` on the rig is
   **empty** (measured: 0 rows) and the e2e's plan is born with no items, so `priorFromPlanItems`
   folds `{}` and `knownProvenanceItem` is never minted in any leg that ran. Both are covered by unit
   cells; a World leg would need a fixture that writes a knowledge record through
   `clara.capture_knowledge` (a human-lane door with a JWT) or pre-answers a plan item, i.e. a new
   e2e file — which is a cut of its own and not this round's act. **The World evidence below is
   therefore a NO-REGRESSION measurement for F7, not a positive one.**
2. **The F6 wrapped-open branches are not driven by any test.** Making `clara.open_work_question`
   raise on a live rig means constructing a refusal (a bound hook token, a duplicate option list) —
   the payloads are celled, the branches are read.
3. **`clientOnboarding.v4.ts`'s manifest note is still empty.** It is `deployed: true`; filling a
   note does not move a hash, but it is a previous cut's entry and out of this round's scope.

---

## 5 · Every red, and what each one actually was

**1 · `623.v18: parts parity passes across the full declarer set` — PRE-EXISTING cross-file
interference, NOT this round's, and not fixed here.** It reds whenever `chatturn-v18.test.mjs` runs
in the same `node --test` invocation as `p6-1-parts-parity.test.mjs`, with
`result.ok === false` and `missing` EMPTY. Cause, read from the source: p6-1's cell *"the real source
reader sees an .mjs construction site"* **writes `packages/runtime/workflows/chatTurn.v17.foo.mjs`
into the real tree** (an `agent_receipt` construction site) for the duration of one cell, and
chatturn-v18's cell scans the real tree — so it sees `allowlistedWithConstructionSites:
["agent_receipt"]` and refuses. Measured three ways:

* the same two files together on the **PRE-change tree** (`git stash`): **failed 3 of 4 attempts**;
* `--test-concurrency=1`: **38/38 pass**;
* either file alone: **16/16** and **22/22**;
* `checkPartsParity` called directly on the final tree: `ok=true, missing=[]`.

It belongs to the p6-1 lane (the cell's whole point is that it reads the REAL source), and it is a
live flake generator in CI. Named, not touched.

**2 · `interview-e2e` FAILED once, on the first boot of a freshly-bootstrapped world — not
reproduced.** The drive stalled on the LAST confirm park (`parkIndex 35`, `fa_depreciation`/`c`) with
**all 17 business items already written and `revision_n` at 18** — i.e. every CAS write of the run
had committed and only the terminal was missing. Re-run on a pristine template copy it is
**`INTERVIEW E2E: ALL PASS`** — **twice**, once on its own and once as the first leg of the final
chain §3.3 records — and `interview-kill-resume-e2e` drove the same sixteen segments to
`interview_complete` on that very (first, failing) database minutes later, which is what rules out
the body. **Cause: unverified.** The one
difference between the two runs is that the first ran against a database whose WDK world had just been
bootstrapped in-place while the second ran against a copy taken after the bootstrap — that is a
correlation, not a measurement, and it is recorded as such.

No other red. No census was widened.

---

## 6 · The rig, and one thing the orchestrator should know

**`rigint3` / `clara_int3` could NOT carry the World legs, and this is worth recording.** The work
order named it, on the understanding that it still held the re-base's pristine 219-migration,
two-firm chain. It does not: the re-base ran the 979-test db estate suite against it, so
`clara_int3` today carries **783 firms, 1 635 clients, 1 319 `queued` `clara.agent_tasks`, 966
`queued` `clara.accounting_work` rows and 601 queued document tasks** (measured on a template copy
before anything was run). A real server booting against that would have spent the whole run
reconciling another suite's backlog — exactly the contamination `successors-final.md` §7.4 describes
and refuses to measure on. It had never carried a World (`workflow`/`graphile_worker` schemas: 0).

So the World legs ran on a **new cluster**, built the way `mkrig.sh` builds one:

```
wsl -u root -- bash …/mkrig.sh rigfix 55622          → PG 17.11, trust auth, 0 clara% roles BEFORE the chain
create database clara_wave_b_ci
pnpm db:migrate   → 219 new migration(s) applied · 219 total · 0001 … 0224_preview_invite, exit 0, 2m07s
pnpm db:seed      → 2 seed file(s) applied, exit 0   (clara.firms = 2)
pnpm --filter @clara/runtime exec bootstrap          → the WDK world + graphile_worker schemas
create database clara_rt_test template clara_wave_b_ci    (the action's own idiom, 0 connections to the template)
```

**ONE from-scratch chain on that cluster**, so 0154's cluster-global role census is honest;
`CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set. A third database
`clara_master` is a copy of the pristine post-bootstrap state, kept so each leg could be re-run from
a known-clean base rather than on a rig that remembers the last one. `clara_int3` was READ ONLY (the
door probes in §1) and never written; the `clara_wave_b_ci` copy taken from it before the
contamination was measured has been **dropped** — `rigint3` is back to `clara_int3` alone, and
`rigfix` carries `clara_master`, `clara_wave_b_ci` and `clara_rt_test`.

**This ADDS `rigfix` (55622) to `WAVE-DIGEST` §5's rig-cleanup census**, alongside `rigint3` (55621),
`rigmain` (55620) and the stale `rig<n>r` family.

---

## 7 · Unverified

* **Everything hosted.** No hosted run exists for any part of this wave and none was attempted.
* **The `--lock-deployed` ceremony has not run.** The eighteen new entries are hash-locked against
  `origin/main` and NOT deploy-locked, which is the correct state before the image is live — and it
  is what let this round re-cut seven frozen bodies at all.
* **The full runtime unit suite (`pnpm test`, ~2 618 cells) was not re-run here.** The four batteries
  this round touches plus nine neighbours were. The suite's own seven documented non-cut reds
  (`pg_dump ENOENT` ×4, #693's EICAR, two shared-database contamination cells) are unchanged by
  anything here.
* **The `apps/web` suites and the browser walks were not re-run**: this round changes no file under
  `apps/web`, and parts-parity proves the reader still covers every emittable kind.
* **Fourteen of the eighteen `db-live-gates` legs were not re-run.** The five that bear on the three
  bodies were (§3.3).
