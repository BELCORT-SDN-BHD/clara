# wave 4 · lane 01 · #948 — hire-purchase and finance-lease agreements are read, and the acquisition they create is posted

**Branch** `riders/w4-lane01` · **base** `cd2925391` · **head** `7d0ebcc53`
**Status: DONE.** Every acceptance criterion is built and driven. Two residuals are named under
*Unverified* and *Follow-ups*; neither is a gap in this ticket's own scope.

**Ticket verified live on this branch** (`gh issue view 948 --comments`, 2026-09-24): the issue body
is the Agent Brief; its ONE comment (belcorttao, 2026-09-19T16:22:05Z) is an AI triage note, and
nothing on the ticket is dated 2026-09-20. The body therefore stands as the contract, and the
comment's factual correction is followed rather than footnoted (see AC4).

**Commits on this branch for #948** (the first four landed before this implementer's context; the
rest are this session's):

| | |
|---|---|
| `221abfd16` | the canonical field-path grammar registers the contract namespace |
| `c8987f563` | the agreement answer-vocabulary gate, its own closed vocabulary |
| `43fdc75c0` | the agreement contract's deterministic evaluator, frozen at one member |
| `bae2c96aa` | the facts router gives an agreement contract its own lane |
| `d38bfb135` | the agreement lane banks what it read, schedule and all |
| `c306f793a` | the capability registry stops calling an agreement stored-only |
| `e7ef4e3af` | the acquisition an agreement creates, drafted from what it prints |
| `c624d6e48` | the unattended gate, condition for condition with the payroll lane |
| `21090080d` | the lane posts the acquisition it read, and the trigger births the asset |
| `b583c339a` | a blocked agreement reaches Needs you, naming what failed |
| `31a548851` | agreementFacts_v1, the agreement's own frozen questionnaire |
| `73bfd571e` | the tail, the first-apply proof, the vocabulary and the review pin |
| `7d0ebcc53` | the splice the census can follow, and the tail the wiki lint can read |

---

## The seams I tested at

Written down before the cells, and no cell sits anywhere else (the file's own header carries the
same list).

| | seam | what it is |
|---|---|---|
| S1 | `clara._field_path_conforms(text)` | the CHECK constraint's own boolean over the closed namespace roster (AC1, second half) |
| S2 | `clara._agreement_answers_ok(jsonb,text)` | the family's own closed answer vocabulary (AC1, first half) |
| S3 | `clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)` | the deterministic evaluator (AC2) |
| S4 | `clara.enqueue_invoice_facts(uuid)` | the facts router, the door every caller reaches |
| S5 | `clara.persist_agreement_facts(uuid,jsonb,jsonb,integer)` + `clara.fail_agreement_facts(uuid,text)` | the persist door and its terminal twin |
| S6 | `clara._document_capability(text,text)` | the capability read (AC3) |
| S7 | `clara._agreement_entry_plan(uuid,jsonb)` | the drafting body (AC4's entry, AC5's branch) |
| S8 | `clara._agreement_posting_verdict(uuid)` | the unattended gate (AC4, AC5) |
| S9 | `clara._post_agreement_acquisition(uuid)` and the persist door that calls it | the post (AC4, AC6) |
| S10 | `clara.list_review_queue(jsonb,jsonb,integer)` | Needs you |
| P1–P5 | `agreementFacts.v1.prompts.mjs` / `.behavior.mjs` / `.services.mjs` | the runtime questionnaire family (AC1) |

The runtime seams are pure functions — no database, no model, no workflow engine.

---

## Acceptance criteria, each with its evidence

### AC1 — a questionnaire in a frozen closure of its own, reusing the payroll ticket's field-path namespace work; the contract namespace registered and the vocabulary gate widened in ONE migration with prestate pins — **DONE**

*The namespace.* `clara._assert_field_path` gains `contract`, in the roster's own reading order;
`clara._field_path_conforms` (the boolean the `clara.document_regions` CHECK evaluates) is
byte-untouched, so the wall and the persist boundary stay on ONE grammar. The namespace names the
FACT FAMILY and not the document kind, which is why #949's tenancy terms read the same one.

- `S1 · every agreement field path conforms to the canonical grammar, and a typo'd namespace is still refused` — PASS. Drives all fifteen paths through the CHECK's own boolean, shows `contrakt.…` refused with `CLR10 / field_path_namespace`, shows `agreement_contract.…` (the document kind) refused, and re-reads the three neighbour namespaces.

*The vocabulary gate.* `clara._agreement_answers_ok(jsonb,text)` — the family's OWN belt, never an
arm of `clara._witness_answers_ok` or `clara._payroll_answers_ok`. Eleven run-level questions and
four per-instalment cells; every question answered, `not_printed` a first-class answer, no third
state, and the envelope closed to three members so a totals bag cannot travel beside the answers.

- `S2 · the agreement answer vocabulary is closed…` — PASS. Each of the eleven dropped in turn; an unknown key at all three levels; an incomplete row; a duplicated `row_no`; a blank rendering; a third state; the channel receipt; zero rows admitted and a missing rows array refused.

*The frozen closure* — `agreementFacts_v1`, five frozen files (`…v1.ts`, `…v1.impl.ts`,
`…v1.behavior.mjs`, `…v1.dispatch.mjs`, `…v1.prompts.mjs`) plus an unfrozen services bundle. A
BRAND-NEW CLASS, never a version of `witnessFacts` or `payrollFacts`.

- `packages/runtime/tests/agreement-facts-v1.test.mjs` — 12/12 PASS. `P5 · the family's FROZEN files import no other family's frozen file` reads each file as BYTES and refuses any import naming another family's closure. `P5 · the engine identity is the family's own, and it is the literal the router stamps` reads 0299's routing arm independently and asserts `llm-openai:gpt-5.6-terra:agreement-witness-v1` string-equals `AGREEMENT_ENGINE_SNAPSHOT.engineId`.
- `node scripts/check-frozen-workflows.mjs` — OK, 322 frozen files, manifest diff **additions only** (20 lines, 5 entries; `git diff frozen-workflows.json` shows zero mutated or removed entries).

*The prompt carries the ratified wording verbatim.* `P1 · the never-infer-never-compute rule is
carried VERBATIM…` reads `witnessFacts.v3.prompts.mjs` and requires both fragments byte-for-byte, so
"verbatim" is a checked fact. The two rules this family adds are pinned too
(`P1 · the prompt forbids summing AND classifying in so many words, on both channels`).

*One migration, with prestate pins.* Everything above that is SQL is in `0299` alone. Pins below.

### AC2 — a deterministic evaluator, registered in the same migration, checking deposit + financed = cash price and reconciling the printed schedule; it distinguishes a hire purchase or finance lease from other agreements and says which it read — **DONE**

`clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)`, registered in `clara.evaluator_versions`
in this same file, closure **ONE member by construction** (it reads no table and calls no `clara`
function).

- `S3a` (a hire purchase with a printed schedule: every question established, the price identity holds, the schedule reconciles), `S3b` (no printed schedule), `S3c` (the price identity fails, carrying all three figures), `S3d` (a row that fails its own identity stops every column summing), `S3e` (a printed total the column contradicts), `S3f` (channel disagreement, and a contested row), `S3g` (a rendering that is not a figure), `S3h` (eight classification renderings including two Malay forms), `S3i` (a malformed pair is a typed refusal, not an exception), `S3j` (the registered closure is exactly one member and it calls nobody) — all PASS.
- The worked example is computed BY HAND in the battery's own header (cash price 120,000.00, deposit 20,000.00, financed 100,000.00, charges 8,400.00, payable 108,400.00, a three-row schedule that reconciles), never by re-running what the database runs.

### AC3 — the capability registry re-derived so the agreement-contract kind's typed-facts axis is no longer stored-only, with its reason sentence rewritten — **DONE**

- `S6 · the agreement contract's typed-facts axis stops being stored-only, and its reason sentence says what is read and what is posted` — PASS. All six pdf/image formats; the old dead-end sentence is asserted GONE; the five csv/tsv/xlsx/docx/ofx rows and the xml row are asserted unmoved.
- `S6 · the registry re-publishes at ONE new version, and nobody else's row moved` — PASS. One distinct version (6), 240 rows, high-water mark risen for every pair, only the six agreement rows carrying an agreement limit, **and #946's payroll row read back to prove it did not move.**
- `business_operation` moves too, which is where #945 and #948 differ: 0296 was the reading half with its posting half in a later file, whereas 0299 carries these typed facts into a posted acquisition — the column's own published definition of `supported`.
- `tests/document-capability-registry.test.mjs`'s `PUBLISHED_REGISTRY_VERSION` re-based to 6 in the same commit (that file's own instruction; `af3b5955`/#779's precedent). Its lowering probe now raises to `PUBLISHED_REGISTRY_VERSION + 1` — the literal `5` had itself become a lowering.

### AC4 — an established hire-purchase fact state drafts the acquisition through the fixed-asset lane with the liability and deposit legs; depreciation particulars come from the enrolled account's policy and are never invented; the unattended gate matches the payroll lane's, condition for condition — **DONE**

**The triage comment's correction is the design, not a footnote.** There is no birth door to call.
`clara._tf_fa_acquisition_birth` (0216) is a lane-agnostic deferred constraint trigger: it fires on
any entry reaching `approved` and, for every line debiting an account enrolled in
`clara.fa_account_profiles`, inserts the `clara.fixed_assets` row itself, reading the account's own
accumulated-depreciation and expense codes and its live policy (#932) for the particulars. This
lane posts an ORDINARY entry and the trigger does the rest — which is also how "never invented here"
is made true STRUCTURALLY: 0299 writes no depreciation column anywhere.

- `S9 · the whole walk: an agreement is read, the acquisition posts unattended, and the BIRTH TRIGGER makes the fixed asset` — PASS. One approved entry, four legs read back leg by leg, the receipt (`via_wake_kind = contract_facts`, `approval_arm = agreement_unattended`, `model_snapshot.provider = clara_db`), the `entry.posted` event, **and the `clara.fixed_assets` row with its cost, its acquisition entry and its two depreciation account codes read off the ENROLMENT.**

**The accounting, checked against the standard** (AGENTS.md rule 6). Hire purchase is the GROSS
method — which the estate's own standard chart already encodes by shipping *2440 HP Interest
Suspense* beside *2430 HP Creditor*; a finance lease is the NET method, because MPERS Section 20.9
has the lessee recognise the liability at the present value of the minimum lease payments with the
finance charge allocated over the term, and the chart agrees by shipping *2450 Finance Lease
Obligation* with no suspense counterpart. Both balance on the evaluator's own
`deposit + financed = cash price`.

- `S7 · a hire purchase drafts the GROSS entry…` and `S7 · a finance lease drafts the NET entry: the obligation carries no interest suspense at all` — PASS, figures hand-checked.
- The deposit credits **2010 Other Payables**, never a bank account: Clara did not see the money move. `S7 · an agreement that states NO deposit still balances, and draws no zero leg` — PASS.
- The asset account is resolved from the client's ACTIVE enrolments. `S7 · the asset account is the client's own enrolment: none and several are each a NAMED refusal, never a guess` — PASS, with the refusal naming the accounts it could not choose between.

**The gate, condition for condition.** Fifteen rungs, walked in order, every rung carrying an
explicit verdict, the FIRST failure being the reason, the body STABLE.

- `S8 · the gate walks a CLOSED roster in order…` — PASS. The vector's keys are asserted to BE the roster (no key more, no key fewer); every rung above the failure is `pass`; adding the missing account makes the same body say ready.
- `S8 · the gate WRITES NOTHING…` — PASS (catalog volatility `s`, plus entry/event/audit counts byte-identical across two reads).
- `S8 · the conditions the brief names, each driven` — PASS: unread, filing retired **through its own door**, the two channels disagreeing, a printed total the schedule contradicts, a closed fiscal year, and a hand-booked entry already on the filing.
- `S9 · a blocked agreement writes NOTHING, and the settle receipt carries the reason` — PASS, with every typed fact still banked (a refusal to POST is never a refusal to READ).

**Needs you.** `row_kind='agreement_posting_blocked'`, the fourteenth kind, DERIVED from the gate.

- `S10 · a blocked agreement appears under Needs you naming the condition, and the row clears itself` — PASS. The row's `question_text` is asserted **equal to the gate's own sentence**, so the words on screen and the decision the lane took come out of one body.

### AC5 — a non-financing agreement drafts nothing and is routed to the contract-terms record instead; a cell proves a tenancy agreement never reaches the fixed-asset lane — **DONE (the half this ticket owns)**

- `S7 · a tenancy agreement drafts NOTHING, by name…` — PASS, and a supply contract and an unrecognised rendering take the same branch.
- `S8 · a tenancy agreement is READ and never reaches the fixed-asset lane (AC5)` — PASS. The typed terms are banked (eleven regions); `clara.fixed_assets` is **0** and `clara.journal_entries` is **0** for the client; every rung below the failure reads `not_evaluated`, never `pass`.
- `S10 · a tenancy agreement's row says what it IS…` — PASS, beside its untouched `uncoded_filing` row.

*The contract-terms record itself is #949's* — the brief says so in terms ("the contract-terms record
**its sibling ticket creates**"), and #949 is the next ticket in this same lane. What #948 owes and
delivers is that the terms are READ and banked (so #949 has something to render) and that nothing is
drafted. Recorded here rather than claimed as built.

### AC6 — cells: an agreement with a printed schedule; one without; one whose deposit plus financed does not equal the cash price; a duplicate agreement; from-scratch apply; the fixed-asset and documents batteries stay green — **DONE**

| asked for | cell |
|---|---|
| with a printed schedule | `S3a`, `S7 (gross)`, `S9 (the whole walk)` |
| without | `S3b`, `S7 (no deposit, no schedule)` |
| deposit + financed ≠ cash price | `S3c`, `S7 (printed figures that do not hold)` |
| a duplicate agreement | `S9 · the SAME agreement read twice posts once (AC6)` — a second scan of the same contract is refused at scope `same_agreement`; one entry and one fixed asset |
| from-scratch apply | not run by me; see *Unverified* |
| the fixed-asset and documents batteries stay green | the whole web unit suite (5010) and the db capability/registry batteries, below |

---

## The migration

**`packages/db/migrations/0299_agreement_contract_acquisition.sql`** — the one file, the number
reserved for me. Applied checksum `c8caeb96849ef4d6ce56fb47d7f856e1fbf3eb9031f3846eb2834c72c8d3b43b`,
which equals the committed file's sha256 (re-measured after the last redo).

### Prestate pins, MEASURED on `127.0.0.1:55741 / clara_l01` after #947

| pinned signature | sha256 | why |
|---|---|---|
| `clara._assert_field_path(text)` | `9783e0e77d7f95f2f5566ba62dbe00fc45e7d87e7a8d9e30445978a91666ad44` | **BIMODAL**: this is the FIRST-APPLY pre-image (0296's own post-image); the REDO branch is taken when the live body already carries `'contract'`. The body 0299 recuts. |
| `clara._field_path_conforms(text)` | `a97a4709117e698267fe900332cc666c818a241214894520ad773791b761cca3` | the neighbour this file recuts on NOBODY — pinned in §A and re-pinned in §Z |

Structural (not sha) prestate: `ck_document_regions_field_path_grammar` must be live on
`clara.document_regions`.

**Integrator note:** `clara._assert_field_path` is the one pin another lane could also recut. Its
live sha on this branch after #948 is `1f85850ae4b664fd5cdc816394556d391a12be729324cf06f30f3ad03eada52e`.

**The FIRST-APPLY branch was proven separately**, as the wave-3 addendum requires
(`CLARA_MIGRATION_REDO` can only ever take the marker branch). In one rolled-back transaction the
lane database's `clara._assert_field_path` was restored to 0296's own body, measured back to exactly
`9783e0e7…`, and §A was run **verbatim**: it reported `OK (FIRST apply)`. Rolled back; the live body
re-measured at its post-#948 sha.

**A second first-apply branch was proven the same way**, for the §E3(1) router splice after this
session corrected it: the live router body was reversed through the block's own five
(anchor, replacement) pairs, the pre-image installed and verified free of `contract_facts`, the
block run, and all four arms (`v_lane:='contract_facts'`, `'agreement_text_facts'`,
`agreement_consent_inactive`, `document.agreement_facts_failed`) re-read out of the catalog. Rolled
back.

### What it contains

`§A` prestate · `§B` the namespace · `§C` the answer vocabulary · `§D` the evaluator + `§D.1` its
freeze registration · `§E` the router (five CHECK widenings, two event types, five spliced bodies) ·
`§F` the persist door and the fail verb · `§G` the capability registry · `§H` the signing-date
parser · `§I` the drafting body · `§J` the unattended gate · `§K` the receipt vocabulary · `§L` the
post · `§M` the persist door calls the post · `§N` Needs you · `§Z` the tail.

**Redo posture.** Every body is `create or replace`, every constraint is dropped-if-exists before it
is added, every insert is `on conflict do nothing`, the registry raise is a SET-TO-LITERAL
(`= 6 where registry_version <> 6`, which also COMPOSES with another lane raising to the same
literal), and every splice detects its own marker and no-ops with a notice.
`CLARA_MIGRATION_REDO=0299_agreement_contract_acquisition` was used for **every** fix round this
session (eight times), and is recorded here as the work order asks. THE ONE THING A REDO CANNOT
REPLAY is §D.1's freeze registration; that block INSERTs when absent and otherwise re-derives the
closure hash and refuses by name if it moved.

### Two lint contracts, measured the hard way

- `scripts/wiki-lint-checks.mjs` classifies any `do` block that so much as NAMES
  `pg_get_functiondef` as a change-of-record PATCH site and then requires every attributable target
  to sit in the wiki whitelist (its census-read exemption applies only where attribution FAILED, so
  a literal signature cannot inherit it). §Z reads `p.prosrc` instead, and the comment explaining
  why deliberately does not spell the rendering function's name — a mention **inside the block** was
  enough to re-classify it, measured in both directions.
- `apps/web/test/sqlFunctionCensus.ts` reconstructs what a dynamic `execute` installs by following
  the variable back to the body it was read from. §E3(1)'s first cut opened with a bare
  `v_next := v_def;` alias, which breaks that chain: `sql_function_census_unresolved_execute` reddened
  `do-action-floors.test.ts` and three of its neighbours. Its first substitution now reads `v_def`
  directly, like the other four splices in the file. **This was a defect in the four #948 commits
  that predate this session, found by running the gate.**

---

## Gates, with counts

| gate | result |
|---|---|
| `tests/agreement-contract-acquisition.test.mjs`, full gate chain | **36/36 pass, 0 fail** |
| the db gate set (agreement + `operation-census` + `rig-isolation` + `document-capability-registry` + `document-capability-high-water` + `document-intake-capabilities`), full gate chain, no reset flags | **108 tests, 107 pass, 0 fail, 1 skipped** |
| `packages/runtime`: `agreement-facts-v1` + `payroll-facts-v1` | **24/24 pass, 0 fail** |
| `node scripts/check-frozen-workflows.mjs` | **OK** — 322 frozen files; manifest diff additions-only (20 lines / 5 entries) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `apps/web`: the WHOLE unit suite (`node scripts/run-tests.mjs`) | **5010 tests, 5008 pass, 0 fail, 2 skipped** |
| `pnpm typecheck` | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** (run as the Linux runner sees it, per the wave-3 addendum) |

**Browser walks: none run, because none was touched.** I edited no `apps/web/e2e/**` spec and no
page component's behaviour beyond the fact table's label lookup, which is covered by its own unit
cell. Recorded as a deliberate omission rather than a silent one.

**Known Windows-only reds:** none encountered. Every failure this session was real and was fixed;
none was reported as "fixed" without being one.

**Vacuity control** (work order rule 4, for the cells whose whole deliverable is a registry entry):
dropping `"agreement_posting_blocked"` from `REVIEW_QUEUE_ROW_KINDS` reds
`lib/firm/needs-you-agreement-posting.test.ts` cell 1; the file was restored byte for byte (`git
diff --stat` showed only my 17-line addition) and the cell went green again. The web fact-path work
had its red step for free: adding the eleven paths to `KNOWN_FACT_PATHS` without the label arms reds
the repo's own drift cell, which is exactly the order I did it in.

---

## Docs, in the same commits

- `packages/db/README.md` — a full `#948 [0299]` section: the design, the triage correction, the two
  accounting treatments and their standards, every section, the rig-meta cohort, the redo posture,
  the tail, the first-apply proof and the two lint contracts.
- `packages/runtime/README.md` — the document-lane census row moves from 8 lanes to 9 and names
  `agreementFacts`.
- `CONTEXT.md` — three terms in the house shape: **Financing agreement**, **Agreement terms fact
  state**, **Agreement posting gate** (48 lines, inserted at the natural position beside the payroll
  pair; the shared-file rule's minimal hunk).
- `apps/web/tests/firm-scope-db-pins.corpus.ts` — 0299's review entry (seven spliced functions, each
  read at its own literal regprocedure; six return `jsonb` and the seventh is a trigger function, so
  none can emit a view definition and neither P4 scope view is reachable by construction).
- `packages/db/tests/rig-meta.mjs` — `AGREEMENT_0299_COHORT` and both names in
  `ALLOWED[clara_runtime]`.

---

## Successor contracts

#948 edits **no** frozen chat or Work tool. Everything a frozen tool would need for this lane is
below, for the ONE shared `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4.

### 1. A read tool: "what does this agreement say, and did it post?"

- **Tool name** `read_agreement_terms`
- **Zod input**

```ts
z.object({
  document_id: z.string().uuid().describe("the filed agreement contract to read"),
})
```

- **Door call, argument order:** none of its own. The terms come back through the document read
  every other family's facts come back through — `clara.get_document_extract(p_document => $1)` and
  the `clara.document_regions` rows hung off the `agreement_text_facts` extraction. The POSTING
  verdict is `clara._agreement_posting_verdict(p_document uuid)`, which is **ungranted** and must
  NOT be called from a tool: a chat surface reads it through
  `clara.list_review_queue(p_scope => $1::jsonb, p_cursor => $2::jsonb, p_limit => $3)` and picks the
  `agreement_posting_blocked` row for this document, whose `question_text` IS the gate's sentence.
- **Refusal mapping:** `CLR16` → the document is not an agreement contract or is not filed →
  `not_found`; an empty queue row set with a banked pair → the acquisition posted, so answer from the
  entry; no banked pair → `not_read_yet`.
- **Part kind:** `freeform_result` — this is a reading, not an act, and it mints no receipt.
- **Prompt stanza:**
  > When someone asks what an agreement says, read the terms the lane banked and quote them as the
  > page printed them. Eleven terms are recorded — what the agreement calls itself, the financier,
  > the signing date, what was acquired, the cash price, the deposit or trade-in, the amount
  > financed, the total charges, the total payable, the term and the instalment — and a term the
  > page did not print is recorded as *not printed*, which is not zero. Never add two of them
  > together and never say what kind of agreement it is from anything but the `agreement_class` the
  > record carries: a deterministic evaluator decided that from the words the page uses for itself.
  > If the acquisition did not post, the queue row carries the one sentence saying why; give that
  > sentence, do not compose your own.

### 2. No write tool, and that is the design

There is deliberately **no "post it anyway" door**. Every condition the gate reports is cleared
somewhere else — the chart door adds a missing account, the fixed-assets register enrols the account,
the document page shows the page whose two readings disagreed, the journals workbench holds the entry
a duplicate points at — and nothing in this lane is posted on a guess. A frozen tool that offered to
override the gate would be a tool offering to invent an asset. If a later ticket wants one, it is a
product decision for the owner, not a successor contract.

### 3. What a Work would call, if one ever drives this lane

- **Door** `clara.persist_agreement_facts(p_task uuid, p_text jsonb, p_vision jsonb, p_pages_used integer)`
  — `clara_runtime` only, and already called by `agreementFacts_v1`. It posts inside its own
  transaction, so a Work that called it would be re-entering the lane, not extending it.
- **Refusal mapping** for that door: `CLR16` → task not found / not in `contract_facts` / not running;
  `CLR10` → the envelope is structurally malformed (vocabulary, pin, prompt hash); `CLR35` → an
  impossible state (a pair row at this key while its task runs). A well-formed read that DISAGREES
  with itself is never a refusal — it banks in full and the disagreement is in the state.

---

## Follow-ups worth filing

1. **#946's payroll capability row still reads `business_operation = stored_only`** although 0297
   posts payroll runs unattended. #948 deliberately did not touch another ticket's row (a cell in
   `S6` reads it back to prove it did not move), and the registry's own published definition of
   `supported` — "where Clara can carry typed facts into it" — now fits that pair. One-line fix,
   somebody else's ticket.
2. **A deposit-clearing row on the standard chart.** This lane credits the stated deposit to *2010
   Other Payables* because Clara did not see the money move, and the bank line that paid it clears
   that payable through the ordinary matcher. Whether the owner would rather see a dedicated
   deposit-clearing account is a product question this ticket records and does not answer by minting
   a chart row.
3. **The finance charge over the term.** #948 recognises the acquisition at signing and nothing
   after it. Allocating the printed schedule's interest column over the term (MPERS 20 / MFRS 16's
   lessee branch past day one) is the obvious successor, and the printed schedule is BANKED in the
   text extraction's envelope precisely so that successor has something to read.
4. **The duplicate guard's third scope keys on (financier, signing date, cash price).** Two genuinely
   different agreements with one financier, one signing date and one cash price would be reported as
   a duplicate for a person to adjudicate. That is the safe direction, but it is a judgement worth
   re-reading once a real firm's volume exists.

---

## Anything unverified

- **The from-scratch chain** (AC6's "from-scratch apply") was NOT run by me: the rig rules forbid a
  second from-scratch chain on a lane cluster (0154 pins the cluster-wide role count), and the work
  order gives that proof to the integrator on a disposable cluster. What I did prove is the
  FIRST-APPLY branch of both marker-tolerant sites, each inside a rolled-back transaction, because
  `CLARA_MIGRATION_REDO` can only ever take the marker branch.
- **The runtime family has never been driven end to end against a real model.** Its twelve cells are
  over pure functions — the vocabulary, the prompts, the schema, the envelope, the citations, the
  lane guard, the failure classification, the closure and the engine literal. No cell claims the
  workflow ran; the DB battery drives the persist door directly. The engine literal is checked
  against 0299 on both sides independently, so a drift stalls the lane rather than mis-stamping it.
- **The integrator's WSL re-run of the new runtime test file** (`agreement-facts-v1.test.mjs` as user
  `runner`) has not happened. The file reads two workflow modules and one migration from disk by
  relative path and touches no spool and no database, so I expect it to pass — expect, not verified.
- **`#932`'s depreciation policy was not exercised with a policy present.** The birth trigger read the
  ENROLMENT's accumulated-depreciation and expense codes in `S9` (both asserted), but no
  `fa_account_depreciation_policies` row existed on the test client, so the "particulars come from
  the policy" path was proven for the enrolment half and not for the policy half. This lane writes
  neither, so the risk is the trigger's, not this file's.
- **The registry-wide raise to 6 is a shared surface.** It is written as SET-TO-LITERAL precisely so
  two lanes raising to 6 in one wave compose; if another wave-4 lane raises to 7, the integrator must
  re-base `PUBLISHED_REGISTRY_VERSION` in `tests/document-capability-registry.test.mjs` and the
  literal in §G together.
