# Wave C · lane 01 · ticket #1030 — the successor a source correction owes, and the rule for an edit that changes nothing

**Branch** `riders/wC-lane01`, cut from `main` at `6da02a8de` (the integrated wave-4 head, PR #1053).
**Worktree** `C:\Users\zhant\Desktop\clara-wt\635`. **Database** `clara_l01` at `127.0.0.1:55741`,
**310 files / `0320_client_financial_pack_wake_read`** when I started, **311 files /
`0321_work_source_correction_rederivation`** now.
**Status: DONE**, with two named remainders (the version-cutover e2e and the browser suite, §Gates).

The ticket is live on this branch: `gh issue view 1030 --repo BELCORT-SDN-BHD/clara` → OPEN, labels
`enhancement` + `ready-for-agent`, **`comments: 0`**, so the Agent Brief in the body is the newest
and only contract and no owner ruling amends it. Nothing on `main` satisfied it: `superseded_by` is
NULL on every source-corrected retirement by construction (0268's own §A3 header says so and its
§T asserts it), no lane re-derives anything, and `apps/web/lib/documents/doors.ts`'s refusal
enumeration still omitted `value_unchanged`.

**Tickets before me in this lane**, read first along with their reports: #985 (`3c935af20` …
`ae88f8ef2`, minted the whole `chatTurn.v22.*` file set and its five registry edits) and #1000
(`1d2d6d238` … `4b732e915`, migration `0320`). `claraWork_v6` was still unminted and its sixth
`CLARA_WORK_BUNDLE_V6_BANNER` still owed — **this ticket mints v6 and lands the banner in the same
commit as the registry repoint** (`411583031`), which is R2, the last cut's one real defect.

**Mid-task status requests:** none arrived.

---

## Commits (`git log 6da02a8de..HEAD`, mine are the top nine)

| commit | what |
|---|---|
| `38619c960` | `feat(db): #1030 a re-spelling is not a correction, where the estate has a canonical form` — migration `0321` §0/§A/§B/§C, the cosmetic-edit decision, three cells |
| `e5d354fa0` | `feat(db): #1030 the lane that hands the Work runtime a correction, and takes back one answer` — 0321 §D, the three doors, six more cells (one redo) |
| `c3fe37beb` | `feat(runtime): #1030 the interpretation act 0268 measured could not be SQL` — `lib/source-correction-rederive.mjs`, 7 cells |
| `07c39f3d1` | `feat(runtime): #1030 the belt that re-reads a corrected document` — `lib/reconciler-work-source-correction.mjs`, wired into the sweep, 7 cells |
| `411583031` | `feat(runtime): #1030 cut claraWork_v6` — the six v6 files, the five registry edits, **the sixth banner**, build-info's sixth identity, the parity ledger, 8 cells |
| `6d86d8946` | `docs: #1030 CONTEXT.md gains the re-derived successor` |
| `923a6473b` | `test(runtime): #1030 the two pin cells that asserted a superseded version as a string literal` |
| `f37af3827` | `test(db): #1030 0268's cohort guard counts NAMES, so an overload is not a half-applied migration` |
| `4d880d301` | `test(db): #1030 AC4 — Needs-you shows the successor's question where before it showed nothing` |

Worktree clean. Nothing pushed, no PR, no GitHub write.

---

## The seams I tested at (written down before the first cell, work-order rule 4)

The brief's Key interfaces name five, and I added no cell at a seam it does not give me:

1. **The retirement's own durable link** — the cancellation op key `source_corrected:<revision>:<retired work>`
   on `clara.op_receipts`, which 0268 already writes and deliberately leaves unclaimed.
2. **The Work admission door and the Work-question door** — `clara.admit_journal_work` and
   `clara.open_work_question`, *called by a new caller*, never changed.
3. **The document's live facts read** — the newest `done` `invoice_facts` extraction's regions, as
   the source of truth for every figure.
4. **The equal-value guard** — `clara._fact_value_changed`, where the cosmetic-edit decision lives.
5. **The web module's typed-refusal enumeration** — `apps/web/lib/documents/doors.ts`.

Two seams I deliberately did NOT test at: the browser (the correcting walk mocks PostgREST — its
own header says the door half is `packages/db/tests/rig-docs-source-revision.test.mjs`, which I ran
green), and the model's own behaviour under v6's new stanza (there is no cell that can drive a
model; what is provable is the text, the roster and the order, and that is what I drove).

---

## The design decision this ticket turned on, and the thing I measured that changed it

The obvious place for the re-derivation is the retired Work's own parked run: the correction
cancels its question, the hook resumes `{kind:'cancelled'}`, and the run could re-derive before it
settles. **Measured on this branch, that is not reliable.** `clara.cancel_accounting_work`'s arm 6
puts the parked task into `cancel_requested` and NOTIFYs (`0199`/`0184`'s body, read on the rig);
`lib/control.mjs` §2 then **aborts** that engine run as well as delivering the resume. So the
retired run is not guaranteed to be resumed at all, and a lane built on its resume would re-derive
*sometimes* — which is the worst of the three options.

So the lane is **durable and restartable**: a backlog read, a pure derivation, an admission under
the correction's own op key, and an exactly-once settlement. The crash window between the admission
and the settlement is safe by construction rather than by compensation — the next sweep reads the
same correction, re-derives the same basis from the same live facts and re-admits under the same
intent key, which `clara.admit_journal_work` answers as a REPLAY with the original work id.

**Where the figures come from, and where the shape comes from.** §3a says "never the retired Work's
`basis`", and §2 says why: `basis_digest` is fixed at admission, so a successor carrying the retired
basis could post ONLY the pre-correction figure, against the corrected document, and be accepted.
The derivation therefore takes **every figure from the document's live facts** and takes only the
SHAPE — which accounts, which side, what memo, what posting date — from the retired instruction,
because a correction of what the document SAYS does not move the instruction a person gave ("the
facts changed, the instruction did not", §2). There is no other durable record of which accounts
that instruction meant, and inventing one would be this lane making an accounting judgement nobody
asked for. **This is the one place a reviewer should push on me**: it is the reading of §3a I can
defend, and it is bounded on both sides — no pre-correction figure survives (proved as an absence),
and where the mapping is not obvious the lane DECLINES by name rather than guessing.

---

## Acceptance criteria, each with its evidence

**AC1 — "a successor Work is admitted carrying the corrected reading — not the retired Work's own
basis — sourced from the document's live facts as of the correction."** DONE, at three seams.
* The BRIEF: `r1030.backlog.names_the_retirement`
  (`packages/db/tests/work-source-correction-rederivation.test.mjs`) corrects RM 640.00 → RM 999.00
  on a document a parked Work cites (both figures literals from the fixture, neither recomputed the
  way the code computes it) and asserts the backlog names the retirement by its own op key,
  carrying `prior_value.cents = 64000`, `new_value.cents = 99900`, `corrected_by`, the retired
  instruction's `source_refs` and `basis`, **and `live_facts["invoice.total"].cents = 99900` read
  off `facts_version 2`'s extraction**. PASS.
* The DERIVATION: `1030.rederive: the corrected figure comes off the LIVE facts and lands on every
  line that carried the retired one` (`packages/runtime/tests/source-correction-rederive.test.mjs`)
  asserts the whole proposed basis against a literal, and `from.source === "live_facts"`. PASS.
* The ADMISSION: `1030.belt: a re-derivable correction is admitted under the correction's OWN op key
  and then settled as a claim` (`tests/reconcile-source-correction-unit.test.mjs`) reads the seven
  arguments the belt hands `clara.admit_journal_work` — client, **the correcting actor as author**,
  the op key as intent, the derived basis (99900 on both lines, 64000 on neither),
  `clara_interpreted`, the retired `source_refs` unchanged, the lane's model id. PASS.

**AC2 — "the successor is admitted queued with a confirmation question open on its own run, naming
both the retired figure and the corrected one, and nothing can post against it until that question
is answered."** DONE, in two halves that do not overlap.
* WHAT THE RUN IS HANDED: `r1030.successor.brief` drives
  `clara.source_correction_successor_brief` on a real successor and asserts `retired_reading.cents
  = 64000`, `corrected_reading.cents = 99900`, the retired basis and the retired work id — and that
  an ORDINARY Work gets NULL, so the brief is not a default. PASS.
* WHAT THE RUN DOES WITH IT: `v6.question: the confirmation names BOTH figures, asks for a decision,
  and never for an amount` (`tests/clara-work-v6.test.mjs`) pins the question text
  (`"The document now says 999.00 where it said 640.00. Record the corrected figures?"`), the
  context, the source ref and the single `choice` field; `v6.question: a confirmation is a POSITIVE
  act` drives ten non-affirmative answers. `v6.body: the confirmation parks BEFORE the knowledge
  read and before any segment` reads the four anchors out of `claraWork.v6.ts` in order — claim,
  probe, park, knowledge read, loop — so **there is no path from admission to a posting tool that
  does not pass through the hook**. PASS.
* **Stated plainly, because it is the weakest link in this ticket:** "nothing may post until it is
  answered" is proved STRUCTURALLY (the park precedes the loop in one function body) and not by a
  live World run. See §Unverified.

**AC3 — "the retired Work's own record now points at the successor it produced, using the
correction's own durable operation key as the provable link."** DONE.
`r1030.settle.claims_the_link` admits a successor whose `intent_key` IS the op key, settles, and
re-reads the committed rows: `accounting_work.superseded_by = <successor>` and the successor's
`supersedes = <retired>`. A second settlement is a REPLAY (`replayed: true`), and the retirement
leaves the backlog. **The wall**: a Work admitted for anything else is refused CLR10
`successor_not_for_this_correction`, and nothing is written — which is what makes the key a link
rather than a label. PASS.

**AC4 — "Needs-you shows the successor's confirmation question after the correction, where before
this change it showed nothing."** DONE at the database seam.
`r1030.needsyou.shows_the_successor` drives all three states in order through
`clara.list_review_queue` as a bookkeeper: the parked Work's question is ON the queue, it is GONE
after the correction (that is #885 as shipped — the retirement cancels it), and the successor's own
question is on it afterwards, bound to the successor by `clara.agent_interruptions.work_id` and
still `pending`. The cell states its own boundary: this file has no World, so the successor's run is
the fixture's claim + open; what `claraWork.v6.ts` opens is AC2's evidence. PASS.

**AC5 — "every non-negotiable property #885 already shipped still holds."** DONE.
* `r1030.nonnegotiables`: the retired question STILL refuses CLR13 `source_corrected` — and now the
  refusal's `detail.current.superseded_by` names the successor, which is the link becoming visible
  where a person meets it; no Work citing the corrected document carries the retired
  `basis_digest`, and the successor's digest differs from the retired one (the blocker #885
  measured, as an absence); a same-value edit still refuses `value_unchanged` before anything is
  written and leaves the parked Work untouched. PASS.
* And #885's OWN battery, re-run unchanged on this database: `work-source-correction-supersede.test.mjs`
  **10/10**, including `w885.posted.untouched` (the #676 carve-out), `w885.no_stale_post` and
  `w885.noop.refused`. PASS.

**AC6 — "the rule for a cosmetically-equivalent edit is decided, pinned by a cell, and stated in
the correcting door's own documentation."** DONE. **The decision: widen the no-op guard, per field,
and only where the estate has a canonical form for that field's value.**

| field | what "unchanged" means | why |
|---|---|---|
| every monetary path | the normalised **cents** | 0268's own rule, unchanged and reached by delegation |
| `invoice.currency` | the **ISO 4217 code**, case-insensitively | the standard defines the code, not its typography, and this estate stores it upper-cased everywhere it reaches the books |
| `invoice.invoice_date` | the **calendar day**, when both sides spell one | `5 March 2026` and `2026-03-05` are the same day |
| everything else | the **trimmed text**, exactly as before, ON PURPOSE | a vendor name or an identifier has no canonical form here, so the recorded spelling IS the fact; a professional correcting `ACME SDN BHD` to the mixed case actually printed on the page is making a real correction, and folding that into the guard would leave them a door that refuses the only edit they wanted |

Why widen at all rather than keep the current behaviour (the ticket offers both): the harm named in
the recheck is irreversible — a re-cased currency code retires every parked Work and makes a
carved-out question's answer **permanently** refused, because `max(recorded_at)` can never fall back
below the question's `created_at`. Under the standing "beta, nothing dark" ruling and the estate's
own "a keystroke is not a correction" principle, an edit that cannot change what the estate
RECORDS should not be able to do that. Why not widen further: a case change in free text can be a
real correction, and refusing it is the same defect pointing the other way.

Pinned by `r1030.cosmetic.canonical` (currency and date respellings refused CLR10 `value_unchanged`,
**no extraction, no revision row, the parked Work untouched, and its question still ANSWERABLE** —
the strongest form of "nothing happened"), `r1030.cosmetic.control` (a real currency change and a
real date change still commit, `facts_version` 2 then 3, so the guard is not a wall) and
`r1030.cosmetic.text` (a re-cased vendor name COMMITS and retires, by decision). Stated in the
correcting door's own documentation: `packages/db/README.md` ("…AND A RE-SPELLING IS NOT A
CORRECTION EITHER, WHERE THE ESTATE HAS A CANONICAL FORM", with the table above), the door's
catalogue row, `CONTEXT.md`, and 0321's own header and §TAIL (which drives all four arms).

**AC7 (the second disclosure gap) — "the web module that documents which typed refusals render
verbatim includes the refusal this feature added."** DONE.
`apps/web/lib/documents/doors.ts`'s `reviseDocumentFact` doc comment now lists `value_unchanged`
in the verbatim set and says what it means per field and what `detail` carries. Comment only — no
behaviour, no new file, no manifest entry.

---

## The migration

**`packages/db/migrations/0321_work_source_correction_rederivation.sql`** — ledger checksum
**`032c1e6fa5c6f9f205fc33358ed891646a09f371ce217bca197a999ad445697a`**, equal to the file on disk
(verified against `clara.schema_migrations` after the last commit).

Six new functions, two recut bodies, **no new relation, no new column, and not one row written at
apply** (§TAIL T9 asserts the last of those).

| object | grant | what |
|---|---|---|
| `clara._fact_calendar_day(text)` | none | the calendar day a value spells, or NULL; exception-safe by construction so the typed notion needs no second, weaker date parser |
| `clara._fact_value_changed(jsonb,jsonb,text)` | none | the TYPED notion: cents → ISO code → calendar day → **delegate to 0268's own two-argument body**. A NULL path is the two-argument answer |
| `clara._source_correction_rederivation_brief(text)` | none | the shared brief builder both reads use, so they cannot disagree |
| `clara.source_correction_rederivations(integer)` | `clara_runtime` | the backlog, oldest first, capped at 200 |
| `clara.settle_source_corrected_rederivation(text,uuid,text)` | `clara_runtime` | the ONE answer per correction: the successor (claiming `superseded_by`) or the decline reason, exactly once |
| `clara.source_correction_successor_brief(uuid)` | `clara_runtime` | is this Work a successor, and both figures its run must name |
| `clara.revise_document_fact(...)` | unchanged | RECUT: 0268's body plus ONE substitution (the guard call gains `p_field_path`) |
| `clara._question_source_corrected(uuid)` | unchanged | RECUT: the same one substitution on the row's own field path |

**`clara._fact_value_changed(jsonb,jsonb)` is NOT recut** — §TAIL T2 asserts its sha is untouched, so
a caller with no field path keeps exactly the answer it always got.

**Both recut bodies were taken from the LIVE catalog rather than retyped**, and §TAIL T1 proves it
the only way that can be proved: it reverses the single substitution on the live body and asserts
the result hashes back to the pinned pre-image. A second edit anywhere — a re-wrapped comment, a
moved wall, a dropped refusal — reds there.

### Prestate pins, ALL MEASURED LIVE on `clara_l01` at this frontier (311 files / `0321`), after #985 (no migration) and #1000 (`0320`)

**The two recut pre-images:**

| signature | sha256(prosrc) |
|---|---|
| `clara.revise_document_fact(uuid,text,jsonb,integer,text,text)` | `6c5b63a8cac64ad2eb8a2eb984bd86b1d0fc15fce340aa0b74d9b55509bf43e6` |
| `clara._question_source_corrected(uuid)` | `52323011550764e77030cb92c5b907004e6525c4511664fae84791f2305d1bd9` |

**The sixteen unconditional neighbour pins** (the integrator reads this list to find a pin another
lane recuts):

| signature | sha256(prosrc) |
|---|---|
| `clara._fact_value_changed(jsonb,jsonb)` | `7d4f995cc61a615def90ba57408ff85d2215582d9114c73b485e7147dd205869` |
| `clara._revisable_invoice_field(text)` | `2d44b64fc0011b0c947cf4fceab9363e814e0fe04a62906d9849b05a164c0b23` |
| `clara._monetary_invoice_field(text)` | `1b5a3e32e949107a910bbc9a6e8239438078a63abb64bcbabd1b5b80872f7219` |
| `clara._reserve_op(uuid,text,text,bytea)` | `8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4` |
| `clara._finish_op(uuid,text,text,jsonb)` | `c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e` |
| `clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid)` | `5d1c5a80591da3762ac6fadf1b2902ffac636fc904b198ae7220281ec9bf4d44` |
| `clara._source_corrected_work(uuid,uuid)` | `ba646c9f90c270e0024106c4add935feb65a39bc5f2cce15ff3d83cdc7458532` |
| `clara._lock_source_corrected_work(uuid,uuid)` | `8ea81da175c1e4d81050ed35530e5c6c594e031a0a5ac83ded0910b9bd47a60d` |
| `clara.cancel_accounting_work(uuid,uuid,text)` | `27c7295b656c779aa80878e30e5113b3512ae773ce64ab64450f44c98eed871b` |
| `clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)` | `011cfeedd4fe30ba37d34630fa43ad12ecd17a5e0f8e6abffe18f872e0697114` |
| `clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb)` | `28505d8b173d83fd582791b3f040630fcbc8d4c98359c6c0ea21ce5a6cbbfc27` |
| `clara._work_question_record(uuid)` | `4a6152f497dc0581396582c3befa46c60140fb5d15591db9f1119f2ec0a4e4ef` |
| `clara.answer_work_question(uuid,integer,jsonb,text)` | `86454f7fb95b8ad82e679ed28acf7d0954bf0aaa3543d101f96e8e1eeb829966` |
| `clara._work_committed_receipt(uuid)` | `82700a7c43b7c08d19f6293d774ae61e623c9a6222394e93ca4c04398930de0c` |
| `clara._document_source_observation(uuid)` | `9e2a7abb60e386f550413709da48c4502ff08084ba1818727936dd7f50fd0483` |
| `clara._journal_basis_digest(jsonb)` | `1e5825cd2e1e003a4d9e485e073a62fbd62262f77365ef38af03ec42f1387e83` |

### Redo record (#957)

0321 was re-applied **once** through the supported redo mode
(`CLARA_MIGRATION_REDO=0321_work_source_correction_rederivation`, with `CLARA_ALLOW_DESTRUCTIVE=1
CLARA_RIG_DB=1` on `clara_l01`), to add §D to the file the previous commit had landed. Every object
in the file is `create or replace`, which is what makes the redo safe. New checksum
`032c1e6fa5c6f9f205fc33358ed891646a09f371ce217bca197a999ad445697a`.

**The redo branch keys on the file's own SUBSTITUTION, not on a marker comment**, because the recut
bodies are 0268's text verbatim and carry no `#1030` string to key on. §0.3's partial-birth check is
exact on the FIRST-APPLY branch (`v_i <> 0`) and deliberately absent on the redo branch — a file
that legitimately GREW between two redos of an unmerged migration is indistinguishable there from a
half-applied one, so completeness is asserted where it can be MEASURED instead: §TAIL T8b requires
all six new objects to exist after every apply.

### The FIRST-APPLY branch, proved separately (wave-3 addendum)

`CLARA_MIGRATION_REDO` only ever takes the "my own body is already live" branch. Inside ONE
transaction I rolled back, I restored the pre-images 0321 expects (derived by REVERSING the single
substitution on the live bodies, exactly as §TAIL does, so the rewind cannot be wrong in a way the
file is not), dropped the six new objects, ran 0321's §0 prestate block **verbatim, sliced out of
the migration file rather than retyped**, and saw it answer:

> `#1030 prestate: clean — mode FIRST APPLY, 0268 cohort present, 16 neighbour bodies
> byte-identical, 40 source-corrected cancellation receipt(s) on this rig`

then rolled the whole thing back. Script:
`C:\Users\zhant\AppData\Local\Temp\claude\l01\firstapply.mjs` (scratch, not committed).

### The data-dependent branch, entered rather than assumed (wave-3 addendum)

The backlog read is only interesting where a `source_corrected:` cancellation receipt EXISTS.
§0.5 counts them and says so in a NOTICE (7 at first apply, 8 at the redo, 40 by the time the
battery had run), and the cells create such rows through the estate's own doors before reading. A
rig with none exercises only the empty arm, which is why the notice is a notice and not a refusal.

---

## The runtime half

**`packages/runtime/lib/source-correction-rederive.mjs`** (new, pure). The rule in one sentence:
every line of the retired instruction that carried the figure the document used to say now carries
the figure the document says; every other line is carried; and if the result does not balance, or
the old figure is on no line at all, the re-derivation is DECLINED. Seven closed decline reasons,
each of which rides the settlement's own receipt where a person reads it:
`correction_not_monetary`, `prior_reading_not_monetary`, `source_moved_again`, `figure_not_in_basis`,
`rederivation_does_not_balance`, `rederivation_is_unchanged`, `retired_basis_unreadable`.
A net-line/tax-line split declines rather than guessing how a professional would re-split the tax.

**`packages/runtime/lib/reconciler-work-source-correction.mjs`** (new belt), wired into
`runReconcilerSweep` after the accounting-work belt and before the trace prune, feature-detected per
cycle so an image that predates 0321 boots DORMANT. Counters `sourceCorrectionAdmitted` /
`Declined` / `Failed` / `Dormant` / `Ok`. A probe that THROWS reports `Ok:false` with
`Dormant:false` — "absent" and "unreadable" must not say the same thing.

**`claraWork_v6`** — six files (`.ts`, `.impl.ts`, `.tools.ts`, `.prompt.ts`, `.errors.ts`,
`.bundle.ts`), the five registry edits, the **sixth `CLARA_WORK_BUNDLE_V6_BANNER`** import and
`console.log` in `plugins/startWorld.ts` in the SAME commit, and `claraWorkBundleIdentityV6()` first
in `/api/build-info`'s bundles array.

*How v6's tools/impl were produced, because it matters for review:* `claraWork.v6.tools.ts` and
`claraWork.v6.impl.ts` were MINTED from v5's by a script that replaces this closure's identity
tokens and the specifiers that point at v6's modules, then appends #1030's two new bodies. A
transcription error in a 1100-line frozen body is the worst kind, so the copy is by construction.
The one hand-made exception is stated in the file: the two tool names and two door names stay
imported from `claraWork.v5.prompt.ts`, the module that declares their STRING LITERAL, because the
parts-parity census refuses a computed key whose import chain's next hop is a re-export — v5's own
header says that rule has been paid for twice.

*Why the identity had to move at all:* `tests/pinned-work-bundle.mjs` derives the serving bundle id
from whatever `registry.ts` pins and compares `work.bundle.id`, `work.bundle.digest`,
`operation_receipts.bundle_digest` and `work_execution_traces.bundle_id` against it. A v6 run
stamped with v5's identity is a run whose receipt names a contract it was not served under.

---

## Frozen-closure decisions (§2.7)

* **`lib/source-correction-rederive.mjs` and `lib/reconciler-work-source-correction.mjs` are NOT in
  any frozen closure.** Measured, not assumed:
  `node scripts/check-frozen-workflows.mjs --print-closure packages/runtime/lib/source-correction-rederive.mjs`
  → *"locked by 0 of 320 @frozen entry file(s)"*. The belt imports the derivation and nothing frozen
  imports the belt, so neither is hash-locked and both stay editable. **That is deliberate:** the
  derivation is a decision procedure this estate will want to sharpen (the tax-split case is the
  obvious next one), and putting it inside a frozen closure would make every sharpening a `_v7`.
* v6's own closure adds **12 additions** to the manifest and rehashes nothing:
  `check-frozen-workflows.mjs --compare-base 6da02a8de` → *"322 existing entr(ies) retain the same
  hash and deployed flag; 12 addition(s); 3 recorded retirement(s)"*.
* `--lock-deployed` was NOT run: it belongs to the hosted release ceremony, after the image is live
  (`packages/runtime/README.md:1037-1039`).

---

## Gates, with counts

| gate | result |
|---|---|
| `packages/db` full 55-module gate chain: `work-source-correction-rederivation` + `work-source-correction-supersede` + `operation-census` + `rig-isolation` + `preintegration-gate-chain` + `web-reads` + `rig-docs-source-revision` | **73 tests, 72 pass, 0 fail, 1 skipped** |
| …the one skip, every time | `rig-isolation` T19, which needs `CLARA_RIG_ALLOW_RESET`; the rig forbids it |
| …after the AC4 cell: `work-source-correction-rederivation` + `operation-census` + `rig-isolation` | **43 tests, 42 pass, 0 fail, 1 skipped** |
| `work-source-correction-rederivation.test.mjs` (`EXPECTED_CELLS` 10) | every cell executed, green |
| `node --test tests/source-correction-rederive.test.mjs` | **7/7** |
| `node --test tests/reconcile-source-correction-unit.test.mjs` | **7/7** |
| `node --test tests/clara-work-v6.test.mjs` | **8/8** |
| `node --test tests/clara-work-v5.test.mjs tests/chat-turn-v22-tools.test.mjs` (the two moved pin cells) | **56/56** |
| `pnpm --filter @clara/runtime build` | green |
| `node scripts/check-worker-paths.mjs` | **OK**, 2 spawn sites |
| `node scripts/check-workflow-bundle.mjs` | **OK** — 14 pinned classes, no superseded pin survives, 59 superseded bodies still ship, 46 checks |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — emittable set unchanged; v6 adds no wire kind |
| `node scripts/check-frozen-workflows.mjs` | **OK** — 334 frozen files, 59 `"use workflow"` modules all frozen+registered |
| `node scripts/check-frozen-workflows.mjs --compare-base 6da02a8de` | **OK** — 322 unchanged, **12 additions**, 3 retirements |
| `node scripts/check-frozen-workflows.selftest.mjs` | **OK — all cases passed** (after the attribution rosters grew by v6's two entries each) |
| `node scripts/check-frozen-workflows.registration.selftest.mjs` | **OK** |
| WHOLE `@clara/runtime` suite (`pnpm --filter @clara/runtime test`) | **3032 tests, 2992 pass, 2 fail, 38 skipped** |
| …the two fails, both KNOWN WINDOWS-ONLY reds, reported as such and not "fixed" | `scanner rejects EICAR…` (#693, Defender eats the fixture) and `(#806) pg_dump/psql on PATH` (not on this host's PATH) |
| WHOLE `apps/web` unit suite (`node scripts/run-tests.mjs`) | **5173 tests, 5171 pass, 0 fail, 2 skipped**, exit 0 |
| `pnpm typecheck` | green, exit 0 |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | green, exit 0 |

**Vacuity control on the cell that matters most.** `v6.boot: the SIXTH banner is imported and
logged` was seen RED by deleting the `console.log(CLARA_WORK_BUNDLE_V6_BANNER)` line from
`plugins/startWorld.ts` (`not ok 7`, 7 pass / 1 fail), then the file was restored byte for byte
(`git diff --stat` back to the intended 9 insertions) and the cell green again at 8/8. The rest of
the battery was red before its subject existed: the db cells failed the frontier gate before 0321
applied, and the three runtime files failed `ERR_MODULE_NOT_FOUND` before their modules were
written.

### Two gates I did NOT run, with the measured reason

1. **The version-cutover e2e (§4.3).** ATTEMPTED and blocked at its own precondition. I cloned
   `clara_l01` into `clara_rt_test` in the lane's own cluster (RIG.md's recipe) and ran
   `node tests/version-cutover-e2e.mjs`; the built server booted and printed
   `pins … claraWork=claraWork_v6`, then the durable world **failed to start** on
   `select … from "workflow"."workflow_runs"` — `select nspname from pg_namespace` confirms the
   lane database carries `graphile_worker` but **no `workflow` schema**. The file's own header names
   the requirement: "the rig DB (the FULL migration chain + seed + **the WDK world bootstrap**)".
   Step 0 of this lane migrated and seeded `clara_l01` but did not bootstrap a World (RIG.md warns
   that doing so reds `rig-isolation` T10b, #866). The clone was dropped; `clara_l01` is untouched
   and still the only `clara*` database in the cluster. **Handed to the orchestrator**: this gate
   needs a World-bootstrapped rig, and it is the gate that proves a parked run resumes on its
   ORIGINAL body across the pin repoint this ticket performed.
2. **The browser suite (§4.6).** `apps/web` is touched by exactly one doc comment and no wire kind
   was added, so §4.6's own rule makes this a no-op — and the walk that would have been the
   candidate, `document-correction-walk.spec.ts`, **mocks PostgREST** (its own header: "nothing here
   says Postgres would accept these calls… THAT half is
   `packages/db/tests/rig-docs-source-revision.test.mjs`", which I ran green inside the 73-test
   chain). It is also not runnable in this worktree today: `pnpm build` fails in `apps/web` at
   `scripts/check-public-key.mjs` ("A secret key, a service_role JWT, or an empty slot must never be
   bundled"), a rig env gap that predates this ticket and that I did not work around.

---

## Docs, in the same commits

* `packages/db/README.md` — the cosmetic-edit rule with its per-field table and its reasoning; the
  re-derivation lane's three doors with their grants, refusals and the "why a backlog and not the
  retired run" measurement; `value_unchanged` added to the correcting door's catalogue row.
* `packages/runtime/README.md` — the `claraWork → claraWork_v6` pin section (what v6 carries, the
  deploy-order stanza, the rollback stanza, and the refinement the digest cannot see, stated by
  hand per R5); the belt's own section under the reconciler.
* `CONTEXT.md` — the `source-corrected work` entry corrected (it said NOTHING IS RE-ADMITTED IN ITS
  PLACE, which is now true only of the correcting TRANSACTION) and a new **Re-derived successor**
  term with its `_Avoid_` line.
* `apps/web/lib/documents/doors.ts` — the typed-refusal enumeration.

---

## Successor contract

Nothing frozen was edited. `claraWork_v6` was MINTED, which is the sanctioned way, and its own
contract is what a later cut or a fix round needs:

**Name.** `claraWork_v6` (`clara-work/v6`, instructions `clara-work-instructions/v6`, skill
`journal-entry/v6`, tool roster `clara-work-tools/v6`). Banner
`[clara-runtime] bundle clara-work/v6 digest=<CLARA_WORK_BUNDLE_V6_DIGEST>`.

**Zod input.** NONE — and that is the point. v6's tool roster is v5's, byte for byte: same seven
names, same input schemas, same declared dependencies (asserted in `v6.bundle: the ROSTER does not
move`). The confirmation is a workflow-BODY act, not a model act.

**Door calls, with argument order.**
* `clara.source_correction_successor_brief($1 work.workId::uuid)` — once, before the loop, on
  `withRuntime`.
* `clara.open_work_question(p_task, p_hook_token, p_question, p_fields, p_reason, p_source_ref)` —
  v2's step, argument order unchanged, with `sourceCorrectionQuestionV6(brief)`'s five values.
* (belt, outside the workflow) `clara.source_correction_rederivations($1 limit::int)`;
  `clara.admit_journal_work($1 client_id, $2 corrected_by, $3 op_key, $4 basis::jsonb,
  $5 'clara_interpreted', $6 retired_source_refs::jsonb, $7 'clara-source-correction-rederive:v1')`;
  `clara.settle_source_corrected_rederivation($1 op_key::text, $2 successor::uuid, $3 reason::text)`.

**Refusal mapping.** Two new settle payloads in `claraWork.v6.errors.ts`:
`source_correction_probe_failed` (code `internal`, RECOVERABLE — the deploy-order failure) and
`source_correction_not_confirmed` (code `cancelled`, RECOVERABLE — the person said stop). The seven
derivation declines are the BELT's vocabulary and never reach a run. Everything else is v5's.

**Part kind.** NONE new. `work_question` is v2/v3's, minted by the imported emitters;
`claraWork.v3.parts.ts` stays the declarer and `check-parts-parity.mjs` needed no new file.

**Prompt stanza.** `SOURCE_CORRECTION_SUCCESSOR_STANZA` (exported on its own so a cell can assert
its text): the basis was re-derived from the corrected document, a human has already been shown BOTH
figures and CONFIRMED it, so record THIS basis verbatim — do not re-read the document, do not
re-derive, do not "improve" an account because the amount moved, and never post the earlier figure.
It names no tool, which `v6.bundle: the stanza…` asserts, because a stanza that named one would be
a roster change in prose.

**What a Work TOOL would need and cannot have.** Nothing here is owed to a frozen body. The one
thing this ticket deliberately did NOT build is a chat-lane tool over this lane: re-deriving a
client's books after a correction is a judgement with a named person behind it, and the confirmation
is where that person stands. The same reasoning as G1 (`wave4-lane04-fix-3` §7.2).

---

## Follow-ups worth filing

1. **The backlog read is a sequential scan of `clara.op_receipts`.** The regex on `op_key` cannot use
   the `(firm_id, fn, op_key)` primary key without a firm, so every sweep scans. Bounded and cheap at
   beta volumes and not worth a migration today, but it is the first thing to measure when
   `op_receipts` grows. A partial index on `(created_at)` where `fn = 'cancel_accounting_work' and
   op_key like 'source\_corrected:%'` is the obvious answer.
2. **The tax-split case declines, and a professional will hit it.** `rederivation_does_not_balance`
   is the honest answer today (the instruction split the corrected total across a net line and a tax
   line, and nothing in this lane knows the client's tax treatment). Re-deriving it needs the
   client's tax rate and a rule about rounding — a product decision, not a patch.
3. **A first-class retirement reason** instead of a derived op key — L09-SPEC-07, still owed to
   #840's feed, and now also the thing that would let the backlog read be keyed rather than scanned.
4. **The World leg this ticket owes** — a real `claraWork_v6` run that is admitted by the belt,
   parks on the confirmation, is answered, and posts the corrected figure. See §Unverified.
5. **`docs/ARCHITECTURE.md` pin drift**, already two cuts old (`:171`, `:183`, `:207`, `:445` say
   `chatTurn_v19` / `claraWork_v3`). Per `AGENTS.md` rule 4 a blueprint edit belongs to a wayfinder
   session; recorded here and handed to the orchestrator, not edited inside a lane. (R8.)

---

## Anything unverified

* **"Nothing may post until the question is answered" is proved STRUCTURALLY, not by a live run.**
  `v6.body` reads the four anchors out of `claraWork.v6.ts` and asserts their ORDER — claim → probe
  → park → knowledge read → segment loop — so no path from admission to a posting tool skips the
  hook. What no cell in this ticket does is drive a real World: admit through the belt, watch the
  engine claim the successor, answer the question, see the entry posted. That is §4.5's Work walk and
  it belongs to the lane's step-5 worker; I did not mint it.
* **The belt has never run against a real database.** Its two database seams are injected in
  `reconcile-source-correction-unit.test.mjs`; the doors it calls are driven for real in the db
  battery, and the derivation is driven for real as a pure function. Nothing has yet driven
  backlog → derive → admit → settle in one process against Postgres.
* **The version-cutover e2e and the browser suite** — see §Gates for the measured reasons.
* **The `source_moved_again` arm is driven only as a pure function.** Constructing a real second
  correction between a backlog read and a derivation needs two sessions; the cell proves the
  decision, not the race.
* **A no-op revision on a document with no prior region** is admitted by construction (0268's
  `v_prior_value is not null` term) and my widening does not change that; no cell drives it, exactly
  as 0268's own report records.
* **`_fact_calendar_day` is `stable`, not `immutable`**, because `::date` reads `DateStyle`. Nothing
  indexes it and nothing generated-column-s it, so the volatility is free today — but a future index
  over `_fact_value_changed(jsonb,jsonb,text)` would not be constructible, and that is a fact about
  this design rather than a defect in it.
* **The web pins corpus** (`apps/web/tests/firm-scope-db-pins.corpus.ts`) keys on none of the bodies
  0321 recuts and on no 0268/0321 name (grepped), so nothing was re-measured there. Wave-4 rule 7's
  scope was checked, not skipped.
