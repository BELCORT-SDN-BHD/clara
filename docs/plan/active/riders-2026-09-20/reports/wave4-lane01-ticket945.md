# Wave 4 · lane 01 · ticket #945 — Payroll summaries: typed facts read from what the payslip prints, summed by a deterministic evaluator

**Status: DONE.** Worktree `C:\Users\zhant\Desktop\clara-wt\635`, branch `riders/w4-lane01`,
database `127.0.0.1:55741/clara_l01`. Base `cd2925391`.

```
git log --oneline cd2925391..HEAD   (at start)  →  (empty — #944 stopped without a commit)
git status                          (at end)    →  clean
```

Eleven commits, all naming #945:

```
6f97eae71 feat(db): #945 the canonical field-path grammar registers the payroll namespace
adeb48411 feat(db): #945 the payroll answer-vocabulary gate, its own closed vocabulary
798bf7ddc feat(db): #945 the payroll run's deterministic evaluator, frozen at one member
a5d44d9f1 feat(db): #945 the facts router gives a payroll summary its own lane
58b6f7e5c feat(db): #945 the payroll persist door stores the run's typed facts and strips the quotes
c576c7cf4 feat(db): #945 the capability registry is re-derived, and says what is now read
2eb218ea9 feat(runtime): #945 payrollFacts_v1, the payroll summary's own frozen questionnaire family
3239e6b58 feat(web): #945 the document page renders payroll facts, and says when the page was silent
87092021a docs: #945 the payroll reading lane in the data-plane README and CONTEXT
0993c326b fix(db): #945 the prestate's lane claim is structural, so both of its branches can be proven
97ab1080e fix(lint): #945 the field-path lint reads the grammar's LATEST cut, not 0191 by name
```

## The ticket is the contract

`gh issue view 945 --comments`, re-read live on this branch 2026-09-24. The BODY is the only Agent
Brief. Its single comment (belcorttao, 2026-09-19T16:22:01Z) is an AI triage coordination note, not
an owner ruling, and nothing is dated 2026-09-20 — so the body stands, and the comment's two
instructions were followed as guidance: #926 is cited as superseding #612's and #643's
payroll-ingestion exclusions (in the migration header and the data-plane README), and the new
answer vocabulary maps one-to-one onto the codes `0150_coa_template_pr_a.sql` already seeds
(2100 EPF, 2110 SOCSO, 2120 EIS, 2130 PCB, 2140 HRDF Levy; 6000 Salaries and Wages, 6010/6020/6030/
6040 employer EPF/SOCSO/EIS/HRDF) rather than minting parallel field names #946 would have to
re-translate.

**Verified live, not already satisfied.** Before building: `clara._assert_field_path` carried ten
namespaces and no `payroll`; `clara._payroll_answers_ok`,
`clara.evaluate_payroll_run_state_v1`, `clara.persist_payroll_facts` and `clara.fail_payroll_facts`
did not exist; `clara._enqueue_invoice_facts_core`'s pdf/image ladder sent `payroll_summary` to the
terminal `skipped_kind` receipt (0016's own tail says so in words); the capability registry
published `typed_facts = stored_only` for all twelve `payroll_summary` pairs at version 4; and
`packages/runtime/workflows/` held no payroll family. The battery cell
`a21-classifier-gate.test.mjs:196` asserted the dead end by name, which is the clearest possible
evidence it was live.

**The triage comment asked for #944 to land first** so this ticket's prompt could quote the
ratified blueprint wording verbatim. #944 STOPPED (see `wave4-lane01-ticket944.md`: its whole
deliverable is edits to `docs/PRD.md` and `docs/ARCHITECTURE.md`, which the work order forbids a
lane ticket from touching), so that wording does not exist in the repo. What this ticket carried
verbatim instead is the estate's OWN ratified wording, live in the invoice family's frozen prompt —
and it is pinned byte-for-byte by a cell that reads both modules, so "verbatim" is a checked fact
rather than a claim. See "Follow-ups".

## The seams I tested at (written before the first test, WORK-ORDER rule 4)

| | Seam | Where |
|---|---|---|
| S1 | `clara._field_path_conforms(text)` — the CHECK's own boolean over `clara._assert_field_path`'s roster | `packages/db/tests/payroll-summary-facts.test.mjs` |
| S2 | `clara._payroll_answers_ok(jsonb, text)` — the answer-vocabulary gate | same |
| S3 | `clara.evaluate_payroll_run_state_v1(jsonb, jsonb)` — the deterministic evaluator | same |
| S4 | `clara.enqueue_invoice_facts(uuid)` — the facts router, through the door every caller reaches | same |
| S5 | `clara.persist_payroll_facts(...)` / `clara.fail_payroll_facts(...)` — the persist door and its terminal twin | same |
| S6 | `clara._document_capability(text, text)` — the capability read | same |
| P1–P5 | the payroll prompt, wire schema, writer envelope, lane guard and closure | `packages/runtime/tests/payroll-facts-v1.test.mjs` |
| W | `DocumentFactsTable`'s rendered behaviour | `apps/web/components/documents/document-facts-table.test.tsx` |

No cell sits anywhere else. Every slice was one test → red for the right reason → the minimal code
→ green → commit; the migration was re-applied per slice through `CLARA_MIGRATION_REDO` (#957),
recorded below.

## Acceptance criteria, each with its evidence

### AC1 — a new frozen questionnaire family, its own closure, prompt carrying the rule verbatim, every file in the manifest

**DONE.** Five frozen files — `payrollFacts.v1.ts`, `.impl.ts`, `.behavior.mjs`, `.dispatch.mjs`,
`.prompts.mjs` — plus an unfrozen services bundle, in `packages/runtime/workflows/`. Registered in
`frozen-workflows.json` (5 additions, diff is additions-only, each annotated) and pointed at by
`registry.ts` (`payrollFacts: payrollFacts_v1`, plus the census list, the pin map and the export).

- *Its own closure, proven by bytes:* `payroll-facts-v1.test.mjs` P5 reads all five files and
  asserts (a) each declares itself frozen and (b) none imports a `witnessFacts` / `statementFacts` /
  `invoiceFacts` / `autoDraft` / `chatTurn` / `claraWork` module. The one deliberate share — the
  provider adapter and the temp-file lifecycle, reached through the UNFROZEN services bundle — is
  asserted as such in the same cell.
- *The rule verbatim:* P1 "the never-infer-never-compute rule is carried VERBATIM" reads
  `WITNESS_TEXT_SYSTEM_PROMPT` out of the invoice family's own live module and requires two exact
  fragments — `"NEVER INFER, NEVER COMPUTE. Report only what the document PRINTS."` and
  `"Do not add, subtract, or reconcile anything; a\n   deterministic evaluator does all arithmetic from your quotes."`
  — in BOTH payroll prompts, and asserts `PAYROLL_INERT_DATA_LINE === WITNESS_INERT_DATA_LINE`
  (PRD §6 law 5). The cell fails loudly if the ratified wording ever moves, which is the point.
- *Forbids summing:* P1 "the prompt forbids summing in so many words" requires `YOU NEVER SUM.`,
  `Do NOT add a`, `A STATUTORY RATE IS NEVER YOURS TO APPLY.`, `it is NEVER a figure you worked out and`
  and `not as a zero` in both channels' prompts.
- *Manifest:* `FREEZE_BASE_REF=cd2925391 node scripts/check-frozen-workflows.mjs` → OK, 317 frozen
  files, append-only vs the base, 56 `"use workflow"` modules all frozen+registered.

### AC2 — a new deterministic evaluator, registered in the same migration, calling no other function

**DONE.** `clara.evaluate_payroll_run_state_v1(p_text jsonb, p_vision jsonb) returns jsonb` —
`IMMUTABLE`, table-free, ungranted, owned by `clara_fn_owner`, `search_path` pinned. It flattens and
normalizes both channels' quotes ONCE (the rendering-to-cents rule is written in one place), then:
sums each of the six summable columns across the agreed rows; checks every agreed row's
`gross − (epf + socso + eis + pcb) = net`; cross-checks the printed totals row where the page prints
one; compares the two channels on the FIGURE (so `1,000.00` and `1000.00` agree) and on the
rendering when neither normalizes.

Eight cells, with the arithmetic done by hand in the file (an independent source of truth, never a
re-computation of what the code computes):

| Cell | Result |
|---|---|
| a payslip WITH a printed totals row | all eleven `established`; the six summable carry `basis=printed_total_agrees_row_sum` with `printed_cents = computed_cents`; the four employer columns carry `printed_total_no_row_counterpart` and `computed_cents = null` |
| one WITHOUT a totals row | all eleven `not_printed` / `no_printed_total`, and the six summable still offer `computed_cents` (gross 500000, net 425570) — the page is readable because the evaluator sums the rows |
| a row that does not balance | `rows.unbalanced = [2]`, `rows.balanced = 1`, `net_pay.state = rows_unbalanced` / `row_identity_failed`; `epf_employer` (no row counterpart) still `established` |
| a printed total the row sum contradicts | `gross_pay.state = totals_mismatch`, `printed_cents = 510000`, `computed_cents = 500000`; `net_pay` unaffected |
| channels disagree | `pcb.state = channels_disagree`, `text_raw = 160.00`, `vision_raw = 180.00`, `printed_cents = null`; and a row the two channels read differently is `contested`, so NO column sums (a partial sum is a figure no page states) |
| an unprinted HRDF line | `not_printed`, `printed_cents = null`, `computed_cents = null`; the other ten unaffected |
| a rendering that is not a figure | `unreadable` / `rendering_is_not_a_figure`, with the rendering reported verbatim |
| the closure | `clara.evaluator_version_members` carries exactly ONE row, `clara.evaluate_payroll_run_state_v1(jsonb,jsonb)`; a call-shape scan of `prosrc` for `clara.<identifier>(` finds NOTHING; `clara.evaluator_versions` names the entrypoint, `migration_version = 0296_payroll_summary_typed_facts`, `deployed = false` |

Registered **in the same migration that creates it** (§D.1), under `search_path = pg_catalog,
pg_temp` (0059's recorded reason: `clara.verify_evaluator_freeze()` reproduces the hash under that
path). Hand-inserted into `frozen-evaluators.json` rather than `--update` re-baselined, so this
change blesses ONE body and re-hashes nobody else's (0111's own recorded reason);
`check-frozen-evaluators.mjs` → OK, 10 evaluators, append-only vs the base.

*Why the closure really is one member:* the body does its own rendering-to-cents normalization
inline instead of calling `clara._normalize_invoice_cents`. That leaf is a member of the F-A1
witness closure, and reaching for it would have frozen the whole of that closure here.

### AC3 — the answer-vocabulary gate and the field-path namespace, in the same migration, with pins and a tail census

**DONE**, both in `0296`.

- `clara._payroll_answers_ok(jsonb, text)` — the payroll family's OWN closed vocabulary, never an
  arm of `clara._witness_answers_ok` (whose belt is the invoice family's eleven fields and whose
  body is reached from a frozen-regime writer). Eleven run-level questions and six row cells; the
  envelope itself is closed to three members (`channel`, `answers`, `rows`), so a `totals` key
  smuggled in beside the answers — a computed figure travelling as a read — is refused.
  S2 drives: the admitted shape; `not_printed` admitted; **every one of the eleven** dropped in turn
  and refused; an unknown key at THREE levels (run answer, row cell, envelope member) refused; an
  incomplete row refused; the channel receipt both ways; a blank `raw` refused; a third state
  refused; zero rows admitted; a duplicated `row_no` refused.
- `clara._assert_field_path` gains ONE namespace, `payroll`, in the position the roster's reading
  order gives it. `clara._field_path_conforms` (the CHECK's boolean sibling, 0290) is
  byte-untouched, so the table wall and the persist boundary stay on one grammar. S1 drives all
  eleven run-level paths through the CHECK's own boolean and shows a typo'd namespace still refused
  with `CLR10` / `field_path_namespace`.
- **Prestate pins and tail census:** listed in full below.

### AC4 — the router stops terminating payroll summaries, and the capability registry is re-derived with its reason sentence rewritten

**DONE.**

*Router.* A `payroll_summary` pdf/image enters `payroll_facts` — its OWN lane, never `llm_witness`
(that lane is claimed BY LANE ALONE and `clara._invoice_fact_state` keys the witness REGIME on it, so
a payroll pair parked there would be read with invoice prompts and resolved as an invoice
corroboration; 0098 recorded the same reasoning when it declined to move the bank statement onto it).
Five CHECK widenings, two registered and routed event types, five surgical recuts.
S4 drives: the router admits the document (`status = queued`, exactly one `payroll_facts` task, an
`llm-` engine id, NO `skipped_kind` receipt anywhere, NO invoice_facts task); a re-fire finds the
in-flight task rather than minting a second; a client with no live `witness_extraction` activation
gets `payroll_consent_inactive` as a never-claimed terminal receipt (`attempt_count = 0`,
`started_at = null`); and an invoice still rides `llm_witness` while a kind with no reader still
terminates `skipped_kind`.

*Registry.* Six pairs move — heic/jpeg/pdf/png/tiff/webp, exactly the mimes the router's payroll arm
sits on — to `typed_facts = supported`, with the basis sentence that described the dead end
("The facts router terminates this pair cleanly (skipped_kind / skipped_type)") replaced by one
naming the engine, the eleven questions and the three things Clara still will not do, and `limits`
gaining #782's two-key shape (`payroll_employee_detail = accepted_limitation`,
`payroll_employee_detail_reason = quotes_are_summed_then_discarded`). csv/tsv/xlsx/docx/ofx keep
`stored_only`, xml keeps `unsupported`, and `business_operation` moves on NO row (#945 is the
reading half). The whole registry re-publishes at version 5, 240 rows, one distinct version, the
high-water mark in lockstep. S6 drives the capability READ for all six formats plus the five that do
not move plus xml, and the republication as a whole.

### AC5 — deploy order named in the migration header; the write-quiet obligation honoured

**DONE.** The header carries a `DEPLOY ORDER: DATABASE FIRST, RUNTIME SECOND` section giving the
reason in both directions (a wider questionnaire than the live validator admits is refused on every
persist; the other order queues tasks an older reconciler declines to dispatch rather than
mis-driving them). The **write-quiet** paragraph names the one recut live body,
`clara._enqueue_invoice_facts_core`, and states what changes in the window: the router stops minting
the terminal `failed/skipped_kind` receipt and mints a `queued` row instead — no extraction, no
region, no fact, no event and no journal effect, because the persist door is the only writer of
payroll facts and no live image calls it yet. Every other kind's path is unchanged, driven and
asserted by S4's third cell.

### AC6 — the document page renders the payroll facts with their regions, including a not-printed answer shown as not printed

**DONE.** The eleven run-level paths join `KNOWN_FACT_PATHS` with a `factLabel` arm each (the drift
cell pins the two spellings against each other), and `factValue` gains ONE non-generic arm: a
`payroll.*` region carrying neither a rendering nor cents renders `Not printed on the page`. Three
cells: the labels, the raw paths and the DB's own integer render; an unprinted answer reads "not
printed" and NEVER `0.00`; and an invoice region with no value keeps its generic dash, because no
other lane writes a region for an unanswered field and saying "not printed" about one would be the
UI asserting something that lane never said.

The REGIONS themselves are S5's: one `clara.document_regions` row per run-level question, hung off
the canonical `payroll_text_facts` row, each with a locator (resolved through
`clara.witness_citation_regions` — the estate's ONE region numbering, which the persist door
resolves a citation against through the same ordering).

### AC7 — the cells

All seven named cells exist and are green; see the table under AC2 for the five evaluator shapes,
S2 for the unknown key, S4/S5 for the lane and the persist, and "Gates" for the batteries.

*"From-scratch apply"* is the one I could not run as such and did not claim: this lane's database
is migrated, not disposable, and the work order forbids a second from-scratch chain on a lane
cluster (0154 pins the cluster-wide role count) — the integrator runs the from-scratch proof on a
disposable cluster. What I DID run in its place is the FIRST-APPLY PRESTATE PROOF the wave-3
addendum asks for by name, below.

*"The documents and facts batteries stay green":* they do, and three cells moved with the behaviour
they describe rather than being left to assert a dead end (below).

## The migration

`packages/db/migrations/0296_payroll_summary_typed_facts.sql`, applied checksum
`e565d3713e90c37d3f3ac3d1e80d334292cac520ca7504bafa061cc7ef7cad25`. Ledger after: **290 files,
frontier `0296_payroll_summary_typed_facts`.**

Structure: header (spec of record, the superseded exclusions, deploy order, write-quiet, the seeded
account codes) · §A prestate · §B the field-path namespace · §C the answer-vocabulary gate · §D the
evaluator · §D.1 the freeze registration · §E the router (E1 five CHECKs, E2 two event types, E3
five recut bodies) · §F the persist door and the fail verb · §G the capability re-derivation ·
§Z tail.

### Prestate pins — MEASURED on this lane database, every one listed (wave-3 addendum)

All are **bimodal**: the pre-image sha, OR a body already carrying this file's own marker (the
literal `payroll_facts`, or `'payroll'` in the grammar's roster). A redo can only ever take the
second branch; the first was proven separately (next section).

| Signature | PRE-image sha (the pin) | POST-image sha (what a later lane will meet) |
|---|---|---|
| `clara._assert_field_path(text)` | `0641f62145e74c353adcb0be248d98fcd804051919b9462989308d2f291b1ace` | `9783e0e77d7f95f2f5566ba62dbe00fc45e7d87e7a8d9e30445978a91666ad44` |
| `clara._enqueue_invoice_facts_core(uuid)` | `42e8b0b44babb5dbf71a9018f4d1004f3a9cba46eeff4e4a7178d43f113c2df2` | `6f44c47e49d0e4403ae97783f5327201bb139c77399cdaa5a496ace692e3f3d5` |
| `clara.enqueue_invoice_facts(uuid)` | `7dd035b2dd52424957fbfb71cc349267bc854498881c6979aba56551f67a5a86` | `8ea7505e76408f939fbf9bbb145a0bf3c258ee7f268b73cf8942ce78d1058fc3` |
| `clara._tf_processing_task_update()` | `54fd2fc5c94ccbb5abe888b95bef8c72f69a2695daa49e635884a24e633f82f4` | `0a31a12b75e1aec2bc155b24b26ed60efd59d30655ca6f2af33a8317dc9459a9` |
| `clara.claim_document_processing_task(uuid,text,boolean)` | `01e517bf575806a01f93441bbc2459856e1f4f12624b312c3ba670ebf111b9a0` | `315336c46f0de7589955f3b509017dbe0928390e3d00ad1b7c6efba2c7bea82e` |
| `clara.release_held_document_tasks(integer)` | `b4bb3dc63901211543a162df08ff6e162779b48b0ff771f8ba4f559d1f95f8dd` | `1f86643e60444b069f3cfd4fd6f33af503de80719f39f499a09e398aff9881f6` |

**Pinned but NOT recut** (the neighbour this file relies on and must not move):
`clara._field_path_conforms(text)` = `a97a4709117e698267fe900332cc666c818a241214894520ad773791b761cca3`,
asserted unmoved in the tail as well as in the prestate.

**Non-sha prestate claims:** `ck_document_regions_field_path_grammar` is live on
`clara.document_regions`; on a FIRST apply the lane roster CHECK does not already admit
`payroll_facts`; the capability registry publishes ONE version, 4 (first apply) or 5 (redo), over
240 rows with its high-water mark in agreement, and exactly 6 `payroll_summary` pairs sit on the
router's pdf/image branch.

**New bodies this file mints** (a later lane that recuts one will collide with these):
`clara._payroll_answers_ok(jsonb,text)` = `f3e22d9db2b65afecf369fea77e46bab3d0451d053b236374f1a7f2f867e3f02` ·
`clara.evaluate_payroll_run_state_v1(jsonb,jsonb)` = `0b11727c230ff03ec94b758a95e7a2035c5af09d323a6f6da284cdd9d91fc8cd` ·
`clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)` = `85a708a386743ccdf0e3f6763de4a9fe14f793ffdca0e275c637c0cb23d6d83e` ·
`clara.fail_payroll_facts(uuid,text)` = `aad96da21469d9939cd781796e216bb82fe347d80a3453bcf960b8c3362e9b64`.

### The FIRST-APPLY prestate proof (wave-3 addendum) — RUN, and it PASSES

`CLARA_MIGRATION_REDO` only ever takes the "my own body is already live" branch of a bimodal pin, so
I proved the other branch myself. A probe (written to
`packages/db/node_modules/.firstapply.mjs`, outside the tracked tree, because it is a one-off proof
and not a gate) opens ONE transaction and, inside it:

1. reads each of the six live bodies and reverse-applies 0296's OWN named substitutions, then
   `create or replace`s the result — and asserts each restored body's sha equals its pinned
   pre-image, so the restore is proven rather than assumed. **All six matched.**
2. drops and re-adds `ck_processing_task_lane_f_a1` at its pre-image definition (NOT VALID: the rig
   carries `payroll_facts` rows this probe is not there to judge, and the prestate reads the
   constraint's DEFINITION TEXT, which NOT VALID leaves byte-identical);
3. puts the capability registry back to version 4 with the six payroll rows' pre-#945
   `typed_facts`, `basis` and `limits`, under `session_replication_role = replica` so the
   append-only high-water wall and the monotone wall are out of the way for exactly those
   statements;
4. runs 0296's prestate **verbatim**, extracted from the migration file by its own dollar-quote tags
   and never re-typed;
5. rolls back, and re-reads the live catalog.

Transcript:

```
restored 6 pre-images, every sha matching its pin
restored the lane roster CHECK to its pre-image
restored the registry to version 4 with the six payroll rows' pre-#945 content
prestate said: #945 prestate: OK (FIRST apply) -- clara._assert_field_path is at a pinned sha,
  clara._field_path_conforms is untouched by this file, ck_document_regions_field_path_grammar is
  live, the five router-side bodies are at their pinned pre-images (or already carry this file's
  lane), and the capability registry publishes one version across 240 rows with its high-water mark
  in agreement.
after rollback: _assert_field_path sha 9783e0e7… | registry version 5 | payroll supported rows 6
FIRST-APPLY PRESTATE PROOF: PASS
```

**The probe changed the migration.** Its first run refused on clause (d), which counted
`payroll_facts` task rows — 48 of them, left by this lane's own battery. That clause was wrong twice
over: on a genuine first apply the count is vacuously zero (the lane CHECK refuses the lane, so no
row can exist), and on any database that has already run this file it is a claim about DATA that no
restore-the-pre-images probe can honour. It is now the STRUCTURAL claim that says the same thing —
the lane roster CHECK must not already admit `payroll_facts` — and both of its branches are proven
(commit `0993c326b`).

### Redo (#957) — used, and recorded

`CLARA_MIGRATION_REDO=0296_payroll_summary_typed_facts` was used **seven times** during the
slice-by-slice build (after §C, §D, §E, the §E VALUES-alias fix, the freeze-registration fix, §F,
§G, the prestate fix), each time with `CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1` against
`127.0.0.1:55741/clara_l01`. The file is written to be safe over its own old effects: every body is
`create or replace`, every constraint is `drop constraint if exists` before `add constraint`, every
insert is `on conflict do nothing`, and the registry raise is a SET-TO-LITERAL
(`registry_version = 5 where registry_version <> 5`) rather than 0245's `+ 1`, because a `+ 1`
re-run would carry the registry past the version this file publishes.

**The one thing a redo cannot replay, found by running it:** the evaluator's freeze registration.
`clara.evaluator_versions` is historical (its trigger refuses every DELETE and every UPDATE but the
one deploy flip) and `clara.evaluator_version_members` is append-only — which is the whole point of
a freeze. The first cut deleted and re-inserted, and the second redo failed with
`evaluator_version_members is append-only`. §D.1 now INSERTS when the registration is absent and,
when it is present, RE-DERIVES the closure hash from the live catalog and refuses BY NAME if it has
moved. A redo of an unchanged evaluator passes silently; a redo after an edit to the evaluator body
fails loudly, and its only lawful repair is a `_v2` — which is exactly the law this registry exists
to enforce, applied to this file as to any other.

### Rig-meta cohort

`PAYROLL_0296_COHORT = ["persist_payroll_facts", "fail_payroll_facts"]` — its own cohort per the
"wholly present or wholly absent" rule (folding it into `WITNESS_F_A1_*` would red every pre-0296
database), added to the `clara_runtime` roster and to the `cohortFailures` list, with the block
naming each verb and its consumer. The internals — `_payroll_answers_ok`,
`evaluate_payroll_run_state_v1` — stay ungranted to every application role, and the migration tail
asserts it. **#945 adds no human EXECUTE at all.**

## Gates, with counts

| Gate | Command | Result |
|---|---|---|
| the new db battery, full gate chain | `node --test --test-concurrency=1 $GATES tests/payroll-summary-facts.test.mjs` (107 gate modules) | **18 pass, 0 fail, 0 skip** |
| every db test file I added or touched + the census pair | same runner, `payroll-summary-facts` + `a21-classifier-gate` + `x-receipt-routing` + `f-a2-statement-activation` + `firm-document-limits-writer` + `document-capability-registry` + `operation-census` + `rig-isolation` | **125 tests, 124 pass, 0 fail, 1 skip** |
| operation-census / rig-isolation (SQL functions added; never with reset flags) | included above | **green**; the 1 skip is `rig-isolation`'s own pre-existing one |
| the wider documents/facts batteries | `s6-invoice-facts`, `s6-metering`, `x-lane-widen-0026`, `x-receipt-routing`, `x-fail-classify`, `x1-reextraction`, `x38-wave-c-b-bank`, `intake-batch`, `unassigned-intake-reuse`, `wave-a-egress`, `wave-a-0014-consent-evidence`, `rig-events-structure` | **203 pass, 0 fail** (after the one cell that asserted the dead end moved) |
| the witness/router batteries | `a21-adversarial`, `f-a1-cutover`, `f-a1-walls`, `f-a2-regression`, `f-a2-statement-activation`, `f-a2-witness-readers`, `f-a7-gamma-egress`, `firm-document-limits-writer` | **125 pass, 0 fail, 14 skip** (all skips pre-existing: retired F-A2 PR-3 subjects and an awaiting-live-fixture cell) |
| typecheck | `pnpm typecheck` | **Done** (both projects) |
| lint | `pnpm lint` | **clean** |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| the WHOLE web unit suite | `node scripts/run-tests.mjs` from `apps/web` | **4989 tests, 4987 pass, 0 fail, 2 skip** |
| browser walk (facts table) | `pnpm --filter @clara/web e2e documents-viewer-walk` on 3500/3501/3502 | **22 passed** |
| browser walk (fact revision) | `… e2e document-correction-walk` | **15 passed** |
| browser walk (trade invoice) | `… e2e trade-invoice-walk` | **15 passed** |
| runtime unit (files touched/added) | `node --test tests/payroll-facts-v1.test.mjs tests/reconcile-documents.test.mjs tests/rollback-preflight.test.mjs` | **23 pass, 0 fail, 22 skip** (rollback-preflight's own DB-gated skips) |
| frozen workflows | `FREEZE_BASE_REF=cd2925391 node scripts/check-frozen-workflows.mjs` | **OK — 317 files, append-only** |
| frozen evaluators | `FREEZE_BASE_REF=cd2925391 node scripts/check-frozen-evaluators.mjs` | **OK — 10 evaluators, append-only** |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| field-path lint + its selftest | `node scripts/check-document-region-field-paths{,.selftest}.mjs` | **clean over 1051 files; selftest OK** |

**One environmental repair, recorded rather than hidden:** `pnpm typecheck` first failed with
`Cannot find module '@shadcn/react/message-scroller'` in `apps/web/components/ui/message-scroller.tsx`
— a file this ticket never touches, introduced by `b5462ab36` (#970, an earlier wave). The package
is in `pnpm-lock.yaml` but was not installed in this worktree. `pnpm install --frozen-lockfile
--filter @clara/web` added it (2 packages, lockfile untouched, `git status` clean afterwards) and
typecheck then passed. This is a rig install gap, not a code defect.

**`check-workflow-bundle.mjs` was NOT run:** it certifies the SERVED artifact and refuses without
`packages/runtime/.output/server/index.mjs`, i.e. it must run after `pnpm build`. Rule 8 does not
list it; noted so its absence is not mistaken for a pass.

## Neighbouring cells that moved with their subject

Four cells asserted the behaviour #945 changes. Each was rewritten to assert the NEW truth and to
say, in the file, what moved and why — never deleted, never weakened.

| File | What moved |
|---|---|
| `packages/db/tests/a21-classifier-gate.test.mjs:196` | asserted `payroll_summary → invoice_facts/failed/skipped_kind`. Now asserts the half that was always the point (a payroll summary enters NO invoice_facts task of any status) and drives `tax_correspondence` to prove the skipped_kind arm still serves a kind with no reader. |
| `packages/db/tests/x-receipt-routing.test.mjs:146` | the same, over `payroll_summary` and `claim_form`. Now: `claim_form` still yields `skipped_kind`; `payroll_summary` refuses the invoice lane by having its OWN. |
| `packages/db/tests/f-a2-statement-activation.test.mjs:351` | counted the `witness_extraction` activation lookups in the router at 2. Now 3, with 0296's own recorded reason for reusing the purpose, and a fourth would still be a finding. |
| `packages/db/tests/firm-document-limits-writer.test.mjs` | pinned `claim_document_processing_task`'s sha as "0270 must not move a body that enforces a cap". Re-measured to what the ordered chain now leaves live, with the same note shape the four 0252-recut pins already carry. 0270 still does not move it; #945 lawfully does. |
| `packages/db/tests/document-capability-registry.test.mjs` | `PUBLISHED_REGISTRY_VERSION` 4 → 5 with the reasoning beside the number (the file's own one place for that), and the payroll-PDF cell now asserts `typed_facts = supported` plus the named limit, keeping the half that was always the point (a pair whose facts Clara does not post never presents as EXECUTABLE) and adding a csv control. |
| `apps/web/lib/documents/extract-shape.test.ts` | the closed-set cell now names both lanes' sets and drives the new `isPayrollFactPath` predicate both ways. |

## Docs, in the same commits

- `packages/db/README.md` — a `## #945` section in the house shape: the superseded exclusions, the
  deploy order and the write-quiet window, the seven parts and why each is its own, the rig-meta
  cohort, the redo posture including the one thing a redo cannot replay, and the cell census.
- `CONTEXT.md` — **Payroll run fact state**, in the house `term` / `_Avoid_` shape.
- `packages/runtime/README.md` — the lane census table moves from 7 lanes to 8 and names
  `payrollFacts`.
- `frozen-workflows.json` — five annotated entries; `frozen-evaluators.json` — one annotated entry.

## Successor contract

**#945 needs nothing from a frozen chat or Work tool to work.** The lane is machine-driven end to
end: the router mints the task, the reconciler dispatches it through `enqueuePayrollFacts`, the
workflow reads and persists, and a person reads the result on the document page. No frozen body was
edited and `node scripts/check-frozen-workflows.mjs` shows no manifest diff beyond this family's own
five additions.

What a frozen tool WILL need — and what #946 will reach for first — is a way to put a payroll run's
fact state in front of a person in conversation. Delivered here as a contract for the
`chatTurn_v22` / `claraWork_v6` cut, not built:

**Tool name:** `read_payroll_fact_state`

**Zod input** (`.strict()` throughout, the `trade-invoice-basis.ts` discipline):

```ts
export const readPayrollFactStateInputSchema = z.object({
  client_id: z.string().uuid().describe("the client whose payroll summary this is"),
  document_id: z.string().uuid().describe("the payroll summary document to read back"),
}).strict();
```

**Door call, with argument order.** No new door is needed: the state is banked on the pair's
canonical text row and is reachable through the read this estate already publishes.

```ts
// clara.get_document_extract(p_document uuid, p_max_chars int) — argument order as written.
const extract = await callDoor("clara.get_document_extract", [input.document_id, 20000]);
const textRow = extract.extractions.find((e) => e.engine_kind === "payroll_text_facts");
const state = JSON.parse(textRow.envelope_text).payroll_state;   // {state_version:"v1", rows, facts, established, disagreed, missing}
const regions = extract.regions.filter((r) => String(r.field_path ?? "").startsWith("payroll."));
```

If a future reviewer prefers a first-class read over an envelope parse, the door to mint is
`clara.get_payroll_fact_state(p_document uuid) returns jsonb`, `clara_authenticated`-only, floored at
viewer, returning `{state_version, rows, facts, established, disagreed, missing, regions[]}` — but
that is a NEW migration's business, not a successor contract's, and the parse above works today.

**Refusal mapping** (the estate's typed codes → what the tool says):

| SQLSTATE / shape | Tool refusal | What the person is told |
|---|---|---|
| `CLR03` | `not_permitted` | "You are not a member of the firm that holds this document." |
| `CLR11` | `document_not_found` | "I cannot find that document under this client." |
| no `payroll_text_facts` row in the extract | `payroll_not_read` | "That payroll summary has not been read yet." Name the task's own status from `clara.get_document_state` rather than guessing. |
| `payroll_state.disagreed` non-empty | NOT a refusal | Report each named question with its `reason`; never publish a `printed_cents` the state left null. |

**Part kind:** `freeform_result` — already declared and already emittable
(`chatTurn.v16.prompt.ts:187`), so this contract adds NO part kind and `check-parts-parity.mjs`
needs no new entry. A payroll read is a READING, not an admitted Work: it mints no
`work_accepted` and asks no `work_question`.

**Prompt stanza** (for the successor chat body, verbatim):

```
READING BACK A PAYROLL SUMMARY. When a person asks what a payroll summary says, call
read_payroll_fact_state and report ONLY what it returns. Every figure in it is either a rendering
the page printed or a sum the database computed from quoted rows — you add nothing up yourself and
you never apply a statutory rate. Say which figures are established, and for each one that is not,
say which of the four things happened: the two readings disagreed, the printed total contradicted
the rows, a row did not balance, or the page simply does not print it. A figure the page does not
print is NOT zero and must never be reported as zero — say the page does not print it. The
per-employee rows are not stored and you cannot report them; if you are asked for one, say the
document was read for its run totals and the employee detail was not kept.
```

## Follow-ups worth filing

1. **#944's blueprint wording is still owed** (`docs/PRD.md:112`, `CONTEXT.md:761`,
   `docs/ARCHITECTURE.md:529` §7). Its report drafted all three edits; the §7 row it drafts for
   payroll can now be trued against what actually shipped — the capability registry publishes
   `typed_facts = supported` for the six OCR-family payroll pairs at version 5, and
   `business_operation` is still `stored_only` pending #946. `CONTEXT.md` gained a payroll term from
   THIS ticket, which does not close #944's own one-word `derives`→`computes` change at line 761.
2. **A payroll-specific egress consent purpose is a product question for the owner, not a
   technical one.** This lane reuses `witness_extraction` — the typed consent that authorizes sending
   a client's document bytes to a model in order to read them, which is exactly what it does — and
   0296 §E records the reasoning in full: minting a new purpose would need its own CHECK widening,
   its own capture surface and its own activation act, and until all three existed the lane would be
   dark for every firm, which the standing "nothing dark" ruling refuses. But a payroll summary
   carries employee-level personal data an invoice does not, and whether that class deserves a
   consent moment of its own is the owner's call. Worth filing as a question, with the note that the
   gate is live either way — a client with no live activation gets a terminal refusal today.
3. **The payroll lane's terminal receipts are event-registered but consumer-less.**
   `document.payroll_facts_completed` and `document.payroll_facts_failed` are registered and routed
   at the active taxonomy version with decision `ignore`, because nothing drafts from a payroll read
   yet. #946 is the consumer; nothing is owed until then, and the emit exists so that consumer needs
   no second migration.
4. **A payroll-aware `_revisable_invoice_field`.** `document-facts-table.tsx` offers the per-row
   Revise control only for paths `clara._revisable_invoice_field` admits, so a payroll fact renders
   "not revisable". That is correct today (no door would admit it) and is the honest surface; a
   human correction path for a mis-read payroll total is a separate ticket.
5. **`packages/runtime/README.md:1465`** lists the engine-snapshot sites by file and now under-counts
   by one (`payrollFacts.v1.services.mjs`). Cosmetic; the census sentence around it is unchanged in
   meaning. Left alone rather than widened inside a ticket that does not own that paragraph.

## Anything unverified

- **A real model has never driven this family.** Every runtime cell is a pure-function cell; no
  payroll read has gone through an actual provider call, and no real payroll PDF exists on this rig
  to read. What IS driven end to end is the database half: the persist door, the evaluator, the
  router and the capability read are all exercised against real doors on a real database.
- **The workflow's own steps have not been executed by the WDK.** `payrollFacts_v1`'s four steps are
  frozen, typechecked, registered and reachable through `registry.ts` and `startWorld.ts`, but no run
  has been started — that needs a live World, and bootstrapping one on this lane database would make
  `rig-isolation.test.mjs` T10b red afterwards (#866, RIG.md).
- **The from-scratch chain** (0001 → 0296 on a fresh cluster) was not run here — the work order
  assigns it to the integrator on a disposable cluster, and a second chain on a lane cluster is
  forbidden. The first-apply PRESTATE branch was proven separately, above.
- **The hosted registry's starting version is assumed to be this rig's.** §G's prestate accepts 4
  (first apply) or 5 (redo) and would refuse anything else by name, so a hosted registry at a
  different version fails loudly at apply rather than silently republishing — but I did not read
  hosted.
- **The claim that `clara.witness_citation_regions` is family-agnostic** is a reading of its body
  (it numbers an extraction's regions in reading order and has no invoice-specific term), not a
  ruling. If a reviewer disagrees, the repair is a payroll-named alias over the same query, not a
  second numbering.
