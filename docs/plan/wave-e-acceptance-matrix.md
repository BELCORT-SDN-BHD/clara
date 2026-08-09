# Wave E — THE ACCEPTANCE MATRICES (minted BEFORE the build)

> **FALSIFIABLE MATRIX, 2026-08-09 — A PRE-BUILD INSTRUMENT, NOT AN EVIDENCE RECORD AND NOT A
> RULING.** E-R9's acceptance-discipline clause requires that *"before each acceptance runs, the
> build mints a falsifiable acceptance matrix … at the `wave-7a-acceptance-h1/h2.md` evidence
> grade."* This is that mint. It states what each acceptance run must be ASKED and what a pass
> must LOOK like, in advance, so that the run cannot grade itself after the fact.
> **Where this document and `docs/plan/wave-e-contract.md` disagree, the contract wins.**
> Siblings: `wave-e-design-skeleton.md` + `-part2.md` (campaign frame · E-a close model · the
> E-R12 trio) · `wave-e-design-reporting.md` (E-b algebra/FS/render · E-c authoring). The as-run
> records that discharge these cells are written LATER, as their own files, at the h1/h2 grade.
> **ONE file, deliberately** — the fix pass grew it to well inside the repo's 500-line discipline,
> so no `-part2` split was taken; if a later round pushes it past that line, split at a section
> boundary on the `wave-e-design-skeleton.md`/`-part2.md` banner pattern.

> **ROUND-1 REVIEW FIX PASS (2026-08-09).** Two independent adversarial reviews (native + Codex
> gpt-5.6) were run against the first mint; the orchestrator's rulings are applied here. Every
> file:line below was re-read in THIS pass — the first mint inherited two stale generations, so
> nothing is inherited, including the reviews' own citations.

> **THE LESSON THIS MATRIX IS SHAPED BY (ADR-066, minted by the A1 field failure, quoted verbatim
> once and never paraphrased again):**
>
> > **A wall that never refused anything is not a wall that held — it is a wall that was never
> > asked.**
>
> Ninety-six synthetic cells were green while the reader failed on the only two real documents it
> existed to fix. Every section below therefore carries **RIGHT-ANSWER cells** — "the mechanism
> produces the CORRECT figure/label on the target corpus" — beside its refusal cells. A refusal
> battery alone does not discharge a section.

---

## 0. How to read a cell

### 0.1 The seven fields (ruled — E-R9 acceptance discipline, verbatim column set)

`ruling → precondition → action → exact DB/artifact assertion → negative case → implementation
owner (lane) → independent verifier`. Every row below carries all seven. A cell with a blank
assertion is not a cell. **A precondition of `—` is legal on a RECORD cell only** — a cell whose
action is `record` rather than an execution — and it is spelled out, not left blank: *"RECORD CELL
— the section's other cells are SEEN."* On a record cell the precondition is the load-bearing
field, so the first mint's five bare dashes (B4, C6, E4, E5, F1d) now carry the sentence.

### 0.2 Outcome vocabulary (ruled by precedent — `wave-7a-acceptance-h2.md`; never conflate)

| token | means |
|---|---|
| **SEEN** | a read actually observed the receipt/row/byte. The only positive evidence class. |
| **NOT SEEN (structural reason)** | the read ran; the thing did not occur, and the run states the MEASURED reason it could not (e.g. a guard sits below another in evaluation order — proven by reading the order, not assumed). |
| **NOT REACHABLE** | no honest path from this lane reaches it; a harness that does not exist would be required. |
| **NOT CAPTURED** | reachable, but blocked by an external resource (an owner gate, a missing document). |
| **NOT PROVEN** | attempted, inconclusive. |

**Absence is not evidence; a derived state is not evidence** (standing law). A cell may be
discharged only by what a read SAW. Every absence and every derivation falls to the fail-closed
branch of its own cell.

### 0.3 The right-answer rule (ruled — ADR-066's standing lesson)

- A **zero-count refusal head is a question to open, never a wall to bank.** If a refusal cell
  counts zero on the live corpus, the cell is recorded **UNPROVEN IN THE FIELD** — never silently
  credited — and the run states whether the wall was never triggered or never *asked*.
- The **verify-before-approve gate is scored independently** of the mechanism under test: a wrong
  name / wrong figure = STOP, file the finding, approve nothing. A gate catch is a PASS of the
  gate and a FAIL of the mechanism, recorded as two separate facts.
- **Counts are re-measured at run time, never inherited — including by this document.** E-R9's
  table says RS carries "19 approved real invoices". ADR-066's acceptance record does **not**
  restate that count: what `wave-e-f6f9-acceptance.md:131-136` actually records is ONE approved
  entry (`f6da5aff`, DR `300-000` / CR `500-000`, **60,000¢**), a trial balance of **3,116,500 =
  3,116,500, difference 0**, and **11 RS customers with 0 registrations**. "A twentieth invoice"
  is an inference from those facts, and this matrix does not make it. A cell that cites a count
  cites the count it MEASURED, with its query, at the moment it ran.

### 0.4 Standing constraints every cell inherits

- **E-R4 governs every numeral path.** No model-generated numeral reaches a durable artifact
  unless a versioned deterministic evaluator ORIGINATES it from DB-owned inputs. Money is
  `bigint` cents end to end; assertions are stated in cents.
- **No new EXECUTE grant to the agent role on any close/approve-class verb.** The mirror is
  `0004_governed_fns.sql:766-780` (the human-writer grant block — `approve_entry(uuid,uuid,text,
  text)` at `:777` and `reverse_entry(uuid,text,text)` at `:778`, all to `clara_authenticated`)
  against `0004:762-764` + `0004:796-797` (`clara_agent_ro`'s whole grant set: `wake_firm()`,
  `shares_my_firm_wake(uuid)`, `current_actor_id()`, `actor_firm_id()`, and the three reads
  `get_journal_entry` / `list_journal_entries` / `trial_balance`). A write call under the agent
  role fails at **`42501`** before any body runs, because `0004:752-753` revokes EXECUTE from
  PUBLIC and from default privileges first.
- **Refusal-token convention.** Existing walls are quoted VERBATIM with file:line. New close/
  report refusals follow the standing shape — a `CLRnn` errcode plus
  `detail = jsonb_build_object('reason','<snake_case_token>', …)::text` (the live exemplar:
  `0044_wave_d_b3_af2_composite.sql:1266-1272`). **(builder choice)** the token spellings
  proposed below are defaults; the exact `CLRnn` code is claimed by the build against the live
  code roster and is never pre-assigned here — same discipline as migration numbers. **Where a
  sibling design document names a specific code — the skeleton's `CLR41` for the drawer-1/close
  family — it reads as a PROPOSAL claimed at merge against the live roster, never as a
  reservation**; the as-run record quotes whatever the shipped code actually raises.
- **Migration numbers are claimed at MERGE.** Cells name build lanes (α..θ), never numbers.
- **The canonical acceptance order is stated ONCE, in §8** (part 2): **F → A → B → C → D → E**.
  E-R9's corpus table names the CORPUS, not the run sequence; where any sibling document states an
  order, §8 governs.
- **Lane letters** (from the campaign frame): **α** E-R12 trio · **β** period spine + close model
  (DB) · **γ** month snapshots + staleness + the period registry (DB) · **δ** metric algebra +
  catalog + evaluator (DB) · **ε** FS template layers + wording structure + claim assessment +
  sealed-artifact registry (DB) · **ζ** render worker + freeze-lint extension + DR §10 (runtime)
  · **η** E-c authoring lane · **θ** minimal surfaces (plumbing grade; all UX polish is Wave G
  per E-R10).

### 0.5 Independent verifier roster (builder choice — the ROLE assignments are adjustable; the
independence law is not)

| handle | who | law it obeys |
|---|---|---|
| **V-DB** | a contract-blind DB read lane, explicit model override, different model from the lane that built the object | must query a DIFFERENT table/angle than the one that produced the claim (`wave-7a-acceptance-h1.md` D5's precedent: predicted one token, measured another, then re-derived the gap from the guard's own precondition rather than editing the prediction away) |
| **V-RT** | a contract-blind runtime/artifact lane, explicit model override | reads bytes and hashes, not code comments |
| **V-CI** | a committed, re-runnable CI cell | a rejected predicate stays executable, per the `x7-path-a-rejected.mjs` precedent (`wave-e-f6f9-acceptance.md:242-243`) |
| **V-OWNER** | the owner's own act | only for cells that are a human professional judgement (attestations, wording verification, the sole-prop label) |

A cell verified only by the lane that built it is NOT discharged (ADR-061 Law 1 — judgement logic
gets an independent pass).

---

## 1. Section A — SANDBOX FULL BATTERY (ROME PUBLIC ADVISORY, the Gate-S synthetic sandbox)

E-R9 row 1: *close → reopen → guard activation → abuse drills.* The sandbox is the only place the
abuse drills may run; its only client is fictional (never confuse it with BELCORT's real ROME
pair). The battery does not yet exist on disk — `.tmp/h2/` (generator → corpus dir → driver) is
the PRECEDENT SHAPE for building one, not the battery itself. **A19–A32 are the round-1 review's
additions**: the closed-period wall, the attestation-staleness re-measurement, FY contiguity,
`abandon_close`, the drawer-1 AP/bank arms, drawer-2 items 4 and 5, the E-R11 capability split,
the curated-table writer probe, and the E-R5/E-R14 validator and chart cells — each of them
judgement logic that the first mint left with zero cells.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **A1** | E-R2, E-R3 | sandbox FY defined via `clients.fy_end_month/day` (columns added `0041_wave_d_a_fa_register.sql:774-775`, bounded by `ck_clients_fy_end` at `:779`) | close a clean FY | close receipt row exists ONCE; `verify_*`-style recompute returns `verified:true`; P&L→RE roll ties to the sen (closing(n) = opening(n+1), both cents, both read) | a receipt that verifies against its own stored snapshot instead of a fresh recompute is a FAIL — the live law is `clara.verify_bank_reconciliation` (`0040_wave_c_c_tieout.sql:4537-4644`): recompute, never trust storage | β | V-DB |
| **A2** | E-R2 drawer 1 (AR arm) | force a control tie break (AR control ≠ Σ open items) | attempt close | refusal token fires, naming domain `receivable`, the control account code, BOTH measured sides in cents and the difference; **no override argument exists in the signature** (proven by `pg_get_function_arguments`, not by reading a comment) | a drawer-1 break that an attestation clears is a FAIL of the drawer model | β | V-DB |
| **A3** | E-R2 drawer 2 | an unapproved in-period draft exists | close without attestation, then with | first call refuses (`reason` token verbatim); second call succeeds and the attestation is written into the close receipt PERMANENTLY with who/why/when | an attested override that leaves no permanent receipt row is a FAIL | β | V-DB |
| **A4** | E-R2 drawer 3 | a soft signal is red | close | close SUCCEEDS; the signal is present in the readiness read | a drawer-3 signal that blocks is a FAIL | β,θ | V-DB |
| **A5** | E-R11 key ③, ARCHITECTURE §3.6 | FY(n) closed, FY(n+1) close live | attempt to reverse an FY(n) entry | ordering guard refuses (`reason` token verbatim); reopen with stated reason + named correction target mints a reopen receipt | a reopen that records no correction target is a FAIL | β | V-DB |
| **A5b** | E-R11 key ③ + E-R2 drawer 1 (**DECIDED — orchestrator R2/R19**: the reopen's effect order is REQUIRED, not incidental) | FY(n) `closed` with its closing entry posted; a key-③ member | `reopen_fiscal_year(...)` | the reopen SUCCEEDS **and** its reversal of the closing entry lands — because the FY status leaves `closed` BEFORE `clara.reverse_entry` stamps the entry. Both halves are read: (i) the receipt's ordered effect list, and (ii) a separate probe transaction that attempts the reversal FIRST and is refused by the §2.5 wall | an implementation that reverses first and flips status second is a FAIL: the wall refuses that UPDATE on an entry inside a `closing`/`closed` FY, so a reopen that "happens to work" without the order stated in the migration is a FAIL of the record | β | V-DB |
| **A6a** | **E-R6** | close model live | correct an entry inside a CLOSED period | `clara._correction_period_state` returns a real closed-state token; the dormant guard raises **`CLR19` `'correction touches a closed period'`**. The guard text appears in three FILE generations (the raise at `0007_document_pipeline.sql:2560`, `0009_coding_floor.sql:2465`, `0027_filings_lock_order.sql:264`; the live predicate `_correction_period_state(i.entry_id)<>'no_period_model'` at `0027:262-263`) but there is **ONE live function**, `clara.approve_wrong_client_correction` — and its live body is **0027's text AS PATCHED three times**: `0037_wave_c_a_subledger.sql` §H.3 (header `:2304`, `execute v_next;` `:2392`), `0038_wave_c_b_bank.sql` §E7b (`do $awcc38$` `:7492`, `execute v_next;` `:7579`), `0042_wave_d_b0_shared_authorities.sql` §S5.21 (header `:4675`, `execute v_def;` `:4758`). The assertion therefore reads the live `prosrc` via `pg_get_functiondef`, **never file text from any of those five files** | the guard NOT firing on a closed-period correction is the whole point of E-R6 and a hard FAIL; and diffing the live body against `0027`'s file text — a false drift alarm by construction — is a FAIL of method | β | V-DB |
| **A6b** | **E-R6 — THE ACTIVATION TRAP** | close model live | correct an entry inside an **OPEN** period | the correction **SUCCEEDS**. The live predicate is `_correction_period_state(...) <> 'no_period_model'` → raise (`0027:262-263`). A body that returns `'open'` for open periods makes **every** correction refuse. The skeleton pins the mechanism (`wave-e-design-skeleton-part2.md` §2.9) — `'no_period_model'` stays the PERMIT token, the live guard is not recut, and an honest twin (`clara.correction_period_state`) serves every new consumer — but this cell asserts the OUTCOME either way | an activated model that breaks open-period corrections is a silent, total regression and a hard FAIL | β | V-DB + V-CI |
| **A6c** | E-R6 + Law 2 | as above | call the state fn with an entry id that does not exist | the state resolves **fail-closed**. Today the stub is `select 'no_period_model'::text where exists(...)` (`0007:2421-2424`, body line `:2423`) — a missing entry returns **NULL**, and `NULL <> 'no_period_model'` is NULL, so the guard does NOT raise: an absence reads as "not closed". The activated body must return a non-NULL sentinel (`'entry_missing'`) for an unknown id — a `coalesce((subquery),'entry_missing')` shape — so the **untouched** guard refuses. **This cell governs; §2.9's earlier "preserved exactly" reading is superseded (orchestrator R3c)** | leaving the NULL path fail-open after activation is a FAIL (absence-is-not-evidence, applied to the guard itself) | β | V-DB |
| **A6d** | E-R6 + Law 3 (spelling is not identity) | the honest-twin migration written | enumerate the readers | a `pg_proc` scan for bodies referencing `_correction_period_state` returns exactly **three** live functions — `approve_wrong_client_correction` (created `0007:2518`; the guard), `retire_document_filing` (created `0007:1434`, reader at `:1450`; live recut at `0027:393`+, reader at `0027:428`), and `preview_wrong_client_correction` (created `0007:2438`, reader at `0007:2459`) — and the guard PREDICATE is pinned to the first only. The two readers are repointed at the honest twin in the SAME migration (they are reads, not audited writers — no D1 exposure), so no payload carries two vocabularies | asserting the set equals `{approve_wrong_client_correction}` RAISES on a correct database — the first mint's roster was wrong by two. Leaving the human-facing preview (`0007:2459`) on the protocol token, so it reports `"no_period_model"` for an OPEN period to the human deciding whether a correction is safe, is a FAIL | β | V-DB |
| **A7** | E-R4, E-R8 | a close/period narrative is generated | ask the model to state a figure in prose | narration carries **placeholders only**; the rendered artifact's numerals all trace to evaluator cells carrying the full E-R5 provenance element set (asserted by A31, which measures the set rather than citing a count) | a literal numeral typed by the model into narration and rendered is a FAIL of the cardinal law | δ,η | V-RT |
| **A8** | E-R4, E-R14 charts | a chart spec is authored | submit a spec containing an inline value / SQL / JS / a literal threshold line | the closed AST validator REJECTS it by name; every plotted series resolves to an approved metric version evaluated in the DB and PERSISTED before render | a chart that renders from an inline array is a FAIL | δ,ε | V-CI |
| **A9** | E-R11, invariant 4 | the campaign's new function set deployed on the rig | (i) live call under `clara_agent_ro`; (ii) a catalog sweep | (i) `select <close_verb>(…)` raises **`42501` insufficient_privilege** before any body runs; (ii) a **`pg_proc` × `has_function_privilege` sweep** over EVERY function the campaign creates returns FALSE for `has_function_privilege('clara_agent_ro', p.oid, 'EXECUTE')`, and FALSE for `clara_wake_proactive`/`clara_wake_interactive` on every close/approve-class verb — a positive read of the live privilege state, under each role by name | grading grants by DIFFING the lane's grant statements against `0004:766-780` reads migration FILE TEXT — a projection of the privilege state, not the state (spelling is not identity) — and is a FAIL of method even if the conclusion is right. Any close/approve-class EXECUTE reachable by the agent role is a FAIL whether or not it is exercised | β,δ,ε | V-CI |
| **A10** | E-R11 key ② | a `bookkeeper`-rank actor (`clara.role_rank`, `0002_foundation.sql:326-331` — viewer 0 · bookkeeper 1 · admin 2 · owner 3) | attempt close | refused at the role floor; the same actor's key-① prepare acts SUCCEED (right-answer half — a boundary that refuses everything is not a boundary) | a bookkeeper who can close, or one who can no longer prepare, are both FAILs | β | V-DB |
| **A11** | E-R11 key ③ | bookkeeper-rank actor; then an owner-granted key-③ member | attempt reopen as each | first refused; second succeeds; the grant and the revoke are each their own audited act with actor + timestamp | a capability list mutable by anyone but the firm owner is a FAIL | β | V-DB |
| **A12** | E-R11 SoD / PRD §2 (`wave-e-contract.md:236-241`) | sandbox firm with ≥2 eligible humans; the FY's entries PREPARED by H1 and APPROVED by H2 | H1 attempts the close; then H2 attempts it | H1 is **REFUSED**, and the refusal's basis is read: the predicate tests the FY's last human preparer/editor from **`journal_entries.last_human_editor`** (`0003_books_core.sql:116` — the same column `_approve_entry_core` itself tests at `0004:541`), **never `checker_actor`** (`0003:117`). The build states, and this cell asserts, the ordering column and the population (entries with `posting_date` inside the FY, close-prep edits included). Right-answer half: **H2 closes successfully**; a solo firm records the explicit self-approval attestation instead | a predicate on `checker_actor` lets the human who prepared every entry close their own year whenever someone else approved them — a FAIL of E-R11. An agent identity appearing as closer or checker anywhere is a hard FAIL | β | V-DB |
| **A13** | E-R2 drawer 1 (serialized lock) | two sessions, same client, FY ready; a third session for observation | both call `begin_close` concurrently | **the loser WAITS, then loses** (the design takes the blocking `pg_advisory_xact_lock`, so this is the falsifiable form): the observer reads S2's backend at `pg_stat_activity.wait_event_type='Lock'` while S1 holds; S1 commits; S2 then returns/refuses **without minting a second run**; exactly ONE `close_runs` + ONE `close_receipts` row exist at the end, read by count. **Namespace:** the skeleton proposes `203005007`; the migration re-greps in its own prestate probe with BOTH instruments and records both — (i) `20300[0-9]{4}` and (ii) `pg_advisory[a-z_]*\(\s*[0-9]+` over `packages/` — because the first cannot see `202991617` (`0046_wave_7a_sales_lane.sql:2211`, inside a spliced body literal) and neither sees the single-arg SESSION space the runtime uses (`packages/runtime/lib/relay.mjs:164-168`, `pg_advisory_lock(hashtext($1)::bigint)`) | "the loser refuses **or** waits" cannot fail — a disjunction over the two possible outcomes is not an assertion, and the first mint's wording is retired here. Two receipts, or a namespace collision with an existing lane, are both FAILs; so is citing any advisory census as complete without naming the instrument that measured it | β | V-DB |
| **A14** | Appendix A finding 1 | a completed close | replay the SAME close call with the same `op_key` | `clara.op_receipts` (PK `firm_id,fn,op_key`, `0002:295-303`) returns the stored result; **no second receipt, no second entry, no second event** | a replay that mints a second close, or that silently returns a fresh unrecorded result, is a FAIL | β | V-DB |
| **A15** | E-R5 edge policies | catalog metric with a zero denominator, a negative denominator, missing data, a sign-flip case, and a rounding boundary | evaluate each | each of the **five named, versioned policies** resolves to its declared outcome, recorded per cell; the policy VERSION appears in the cell's provenance; the `allow_negative` opt-in is read from the definition VERSION's hashed field, not from a call-time flag | an evaluator that silently returns NULL, 0, or an unlabelled sentinel for any of the five is a FAIL | δ | V-CI |
| **A16** | E-R5 lifecycle | a `draft` definition | render it into a management artifact, then attempt a statutory pack | management render succeeds **under the mandatory "uncertified" watermark**; statutory use is refused | a draft definition reaching a statutory pack, or a management render missing the watermark, are both FAILs | δ,ε | V-RT |
| **A17** | E-R14 seven-year reproducibility | a sealed sandbox artifact | re-render from the sealed manifest on a second machine/run | **pre-sign PDF SHA-256 is byte-identical**; the signed original (where one exists) is RETRIEVED, never regenerated | a "reproduced" artifact whose bytes differ, or a regenerated signature presented as the original, are FAILs | ζ | V-RT |
| **A18** | invariant: RLS isolation | sandbox and BELCORT credentials | run the whole battery | **zero writes to any other firm**, asserted by firm id; the sandbox lane never holds a BELCORT credential | any cross-firm row is a hard FAIL and a stop-the-batch event | all | V-DB |
| **A19a** | E-R2 drawer 1 — "no writer escapes into the FY mid-close" (the wall FIRES) | FY(n) `closed`; an authenticated key-① actor with a draft dated inside FY(n) | `approve_entry`, then a SECOND JE-writing verb (`reverse_entry` on an FY(n) entry) | both refuse with the wall's token (`write_into_closed_period`, spelling per §0.4); the refusal is raised by the TRIGGER, proven by reading `pg_trigger.tgrelid = 'clara.journal_entries'::regclass` and the trigger function's own `pg_get_functiondef`, not by a writer body; the same `approve_entry` with a posting_date in the OPEN FY **succeeds** (right-answer half) | a wall that refuses `approve_entry` while a second JE-writing verb walks past is a FAIL — refusing N writer recuts in favour of one trigger is the whole argument of §2.5, and one verb tested is one verb proven | β | V-DB |
| **A19b** | E-R2 drawer 1 (**DECIDED — orchestrator R2a**: shared/exclusive advisory pair on ONE key) | two sessions + an observer session; FY(n) `open` with a ready draft | S1 `begin_close` and HOLD the transaction; S2 `approve_entry` into FY(n). Then the reverse ordering | direction 1: S2 **BLOCKS** — the observer reads `wait_event_type='Lock'` for S2's pid — until S1 commits, then S2 **REFUSES** with the wall's token. Direction 2: S2 posts first, S1's `begin_close` waits for S2's commit and then succeeds with S2's entry inside the FY. The instrument is the observed WAIT STATE, never a timeout | S2 completing while S1 holds the exclusive form, **or** S2 refusing without ever having waited (i.e. reading FY status from an MVCC snapshot taken before S1's uncommitted flip), are both FAILs — that race is the defect this redesign exists to kill, and the first mint raced close-vs-close only | β | V-DB |
| **A19c** | E-R2 drawer 1 (**DECIDED — orchestrator R2b**: the permit is a ROW fact, never session state) | an authenticated session that has called NO close verb; FY(n) `closing` | in ONE transaction manufacture the session state a caller can reach — `pg_advisory_xact_lock_shared(203005007, hashtext(<client>))` and `set_config('clara.close_run', <any close_run id>, true)` — then `approve_entry` into FY(n) | **REFUSED.** The permit admits a write only when `NEW.close_receipt_id` references a `close_runs`/`close_receipts` row whose `xmin = pg_current_xact_id()` — a fact only the audited close verbs can have created in THIS transaction. Two positive reads back it: a lex pass over the live trigger body shows **zero** `current_setting` occurrences and **zero** `pg_locks` reads | any permit a caller can construct without having created the close row in-transaction is a FAIL of drawer 1's "no override, nobody" — including a body that keeps a GUC read as a fallback. `set_config` and `pg_advisory_xact_lock` are `pg_catalog` functions PUBLIC may execute; `0004:752-753` revokes only within schema `clara` | β | V-DB + V-CI |
| **A19d** | **RIGHT ANSWER** · E-R2 drawer 1 | FY(n) with a clean drawer set | `finalize_close` | the closing entry **POSTS** into FY(n) in the same transaction that stamps the FY closed: read the entry id, its `close_receipt_id`, and the receipt row's xmin identity with that transaction; the wall did not refuse the close's own write | a wall so tight the close cannot write its own entry is a brick — A19a-c green with A19d unrun does not discharge the wall | β | V-DB |
| **A19e** | E-R11 SoD / PRD §2 (**DECIDED — orchestrator R6**: the proof lives in the migration tail, not in prose) | the closing entry's authoring path built | read the migration tail | whichever path was taken is PROVEN in the tail: **if authored in-body**, the pinned approve-writer census is updated to five members WITH a per-hook disposition — `is_high_stakes` (a closing entry is `is_year_end` by construction, `0003:113`), the maker/checker branch (`0004:541-546`), and `clara._subledger_on_approve` — each hook either called or proven a no-op for a P&L→RE closing entry; **if routed through `_approve_entry_core`**, the roster stays as-is and the tail proves how the close's own E-R11 segregation composes with maker/checker. The census roster is **re-read at the frontier**, never inherited: today's pinned expectation is `'_approve_entry_core, _approve_opening_entry, approve_wrong_client_correction, reverse_entry'` (`0042:6240`) | a fifth body writing `status='approved'` without appearing in the census is exactly the drift `0037` §H.3 (`:2304`) was written to repair — a FAIL | β | V-CI |
| **A20** | E-R2 drawer 2 (attestation binds the exact measured state) | a drawer-2 item red; a named human attestation recorded against the digest the gate measured (skeleton §2.2) | change the underlying facts (post another in-period draft / run more depreciation), re-run the gate, attempt close | the prior attestation NO LONGER clears the gate: the close refuses with `close_attestation_stale` and names BOTH digests — the one measured now and the one the attestation bound. A fresh attestation over the new digest clears it, and **both** attestations survive in the receipt history | an attestation that clears a gate whose measured state changed after it was signed is a signature outliving what it signed — the PRD-invariant-8 defect and a hard FAIL. Deleting or overwriting the stale attestation is equally a FAIL | β | V-DB |
| **A21a** | E-R3 (FY windows are DATE RANGES; contiguity is a DB invariant) | FY(n) 2025-01-01..2025-12-31 registered | propose/open an FY starting 2026-02-01 (a one-month gap) | **REFUSED** by the before-insert contiguity trigger, with the prior FY's `ends_on` and the proposed `starts_on` in the detail | a gap admitted silently makes "one FY per posting_date" false — and the E-R6 state function's multi-FY fail-closed ordering is a backstop, never the primary. A contiguity claim resting on the guard that depends on it is circular and a FAIL | β | V-DB |
| **A21b** | E-R3 | as A21a | propose an FY 2025-07-01..2026-06-30 (overlapping FY(n)); then propose 2026-01-01..2026-12-31 | the overlap is **REFUSED**, naming both windows; the contiguous successor is **ADMITTED** (right-answer half), and an 18-month first FY is admitted while a 19-month one is refused by the span bound | a trigger that refuses every neighbour is not contiguity, it is a brick; admitting an overlap is a FAIL of E-R3 | β | V-DB |
| **A22** | E-R3 / E-R2 (the ruled `closing → open` transition) | a close run in `closing` | `abandon_close(...)` with a reason | `fiscal_years.status` returns to `open`; the `close_runs` row is STAMPED abandoned (actor, reason, timestamp) and **never deleted**; a subsequent `begin_close` mints a NEW run; and the wall disarms — one posting into the FY succeeds afterwards, read | an abandon that deletes the run row, leaves the FY stuck in `closing`, or leaves the wall armed are each a FAIL — a client that can never post again is worse than a close that never started | β | V-DB |
| **A23** | E-R3 (`fy_end_month/day` nullable-default handling) | two clients: one with `clients.fy_end_month/day` SET (`0041:774-775`), one NULL | propose an FY for each; read `fy_end_source` on the FY row, the close receipt and the readiness panel | the defaulted client's FY carries `fy_end_source='defaulted'` — **never** `'asserted'` — and every surface reproduces that label; the asserted client's reads `'asserted'` and matches the columns. The live precedent for surfacing the fallback is `get_depreciation_authority`, which emits `'fallback', cl.fy_end_month is null` (`0041:4244-4245`) | a defaulted 12/31 that reads as asserted anywhere (row, receipt, panel, pack) is a FAIL: 0041's own words (`:4241-4243`) are that a cadence computed against the wrong FY posts a year of depreciation into the wrong period "with nothing visible to say so" | β | V-DB |
| **A24** | E-R2 drawer 1 (**AP** control arm) | sandbox client with a payable control account and open AP items | approve a manual JE to the payable control account with no matching open item; attempt close | the close REFUSES **on the AP leg specifically**: the refusal names domain `payable`, the control account code, both measured sides in cents and the difference; `pg_get_function_arguments` shows no override argument. Today's readable instruments are `clara.ap_aging` (`0040:4001`) over `clara._aging_core` (`0040:3937-3946`) against the control balance from `clara.trial_balance_as_of` (`0017_wave_b.sql:3572-3586`) — **`ap_control_tie` is NEW**: a repo scan for `control_tie` over migrations 0001–0054 returns exactly ONE hit, and it is a deferral note (`0041:4254`) | a drawer-1 battery that only ever exercised AR proves the AR arm only; an AP break walking past is a FAIL, and an AP break reported as an AR break is a FAIL of the instrument | β | V-DB |
| **A25a** | E-R2 drawer 1 (**the bank reconciliation IDENTITY**, `wave-e-contract.md:42-48`) | a COMPLETED reconciliation covering `fy.ends_on` (`clara.bank_reconciliations`, created `0040:262`; the stored identity terms `opening_anchor_cents` `:282`, `gl_balance_cents` `:283`, `closing_cents` `:284`, `outstanding_cents` `:290`, `excepted_cents` `:291`, and the identity's own form written into the column comment at `:279` — `opening_anchor + gl' - outstanding + excepted = closing`) | break the identity (approve a JE against the bank COA account after the reconciliation), attempt close | the close **REFUSES**, carrying the identity's own terms; and the break is independently visible through `clara.verify_bank_reconciliation(p_recon)` (`0040:4537-4644`), which RECOMPUTES. The close cell asserts against the **recompute**, never the stored row | a close that reads `bank_reconciliations.status='complete'` and calls the identity satisfied is a FAIL — a stored receipt is a derived state; only the recompute is evidence | β | V-DB |
| **A25b** | E-R2 drawer 1 UNKNOWN (**ruled — `wave-e-contract.md:46-48`**; the first mint routed this to drawer 2 and is corrected here per orchestrator R1) | a client with a live bank account and **NO completed reconciliation covering `fy.ends_on`** | attempt close; then attempt to attest past it | the close **REFUSES** with `drawer1_state_unknown`, fail-closed; and the attestation verb **REFUSES the attestation itself** — asserted twice: the live refusal, plus the structural fact that `attest_close_exception`'s item domain cannot name a drawer-1 item (read the signature/CHECK, not a comment) | routing "no reconciliation exists" into drawer 2 as missing evidence opens the widest override in the design and is a FAIL of the drawer model: drawer 2's carve-out is unmatched statement lines and a missing bank **STATEMENT** for a period (`wave-e-contract.md:61-63`), never a missing reconciliation RECEIPT. With no completed reconciliation there is no identity to evaluate — that is the UNKNOWN state, which fails closed with no override | β | V-DB |
| **A26** | E-R2 drawer 2 item 4 (open bank-reconciliation items) | a reconciliation covering the FY end carries unmatched lines / open exceptions (live doors: `clara.except_bank_line` `0040:3222`, `clara.resolve_bank_line_exception` `0040:3372`) | close without attestation; then attest; separately, RESOLVE the exceptions and close again | first call REFUSES, naming the open items with the count and the statement/line ids it MEASURED; the attested call succeeds and writes who/why/when **per item** into the receipt permanently. Right-answer half: after `resolve_bank_line_exception` clears them, the close succeeds with **no** attestation | an ABSOLUTE refusal here is a FAIL (that is drawer 1's shape, and this is the evidence-dependent state the contract carves out); a single blanket "all bank items" attestation instead of per-item is a FAIL of E-R2's per-item rule | β | V-DB |
| **A27** | E-R2 drawer 2 item 5 (uncoded documents) | filings inside the FY with no draft and no live approved entry; plus one such filing dated in the NEXT FY | close without attestation, then with | refuses, naming the uncoded population it MEASURED with its query — **and the date scope is asserted explicitly**: the live reader `clara.list_uncoded_filings(p_client)` (`0011_daily_loop.sql:3967-3990`) has NO date predicate (it filters `f.retired_at is null` + client only, `:3984-3988`), so the gate's population must be date-scoped by the build (`d.financial_date`, surfaced at `:3980`, or the filing date) and the NEXT-FY document must NOT block. Also asserted: the definer close verb does not inherit that reader's `security invoker` posture (`:3969`) without an explicit client-in-firm check | a gate that blocks this year's close for next year's document is a FAIL (the client could never close); a definer that evaluates an INVOKER read under the owner's `using(true)` policies without its own client-in-firm check is an isolation FAIL | β | V-DB |
| **A28** | E-R11 — keys ② and ③ are **SEPARATELY grantable** (`wave-e-contract.md:231-235`) | a non-owner human with no capabilities | owner grants ONLY key ②; the human attempts close, then reopen. Owner revokes ② and grants ONLY ③; the human attempts each again | four outcomes, all read: **close SUCCEEDS / reopen REFUSED** under the first grant; **close REFUSED / reopen SUCCEEDS** under the second — neither capability implies the other. Each grant and each revoke is its own audited row (actor + timestamp) and only the firm owner may write them | one fused "close_and_reopen" capability, a grant of ② that silently admits ③, or a role-rank check standing in for the capability, are each a FAIL of E-R11 | β | V-DB |
| **A29** | E-R5 (canonical/curated definitions are product-curated) — the 0016 idiom | the canonical metric-definition, MPERS wording and metric-constant tables exist | run the migration-tail probe | the probe is the 0016 shape, committed in the tail: `pg_proc` × `aclexplode(coalesce(p.proacl,'{}'))` × `pg_roles` where `privilege_type='EXECUTE'` and the grantee is one of the six app roles (`clara_authenticated`, `clara_agent_ro`, `clara_runtime`, `clara_runtime_login`, `clara_wake_interactive`, `clara_wake_proactive`), matched against bodies that `insert into`/`update`/`delete from` each curated table → **ZERO rows**, and the tail RAISES if not (`0016_a21_compliance_watch.sql:5216-5230`, the role list at `:5223-5224`, the raise at `:5228`) | asserting "no writer exists" by reading the migration's own grant statements is file text, not privilege state — a FAIL of method, the same defect A9 was rewritten to remove. A curated table with any granted writer is a FAIL of E-R5's curation boundary | δ,ε | V-CI |
| **A30a** | E-R5 — "incompatible compositions are rejected mechanically … the validator names the fix" (`wave-e-contract.md:135-137`) | the closed AST validator live | submit definitions that are well-formed but type/scope-illegal: closing-balance ÷ annual-flow (point_in_time ÷ flow), currency + ratio, a `lag` reaching before the first registered period, and a cross-entity composition | each is **REFUSED at APPROVAL time** (not at evaluation), with a named token per class, and the refusal NAMES the fix; none of the four reaches `firm_approved` | a composition that assembles and yields a number is the semantic-error class the E-R4 amendment was ratified to contain — a hard FAIL. A refusal with no named fix is a FAIL of the ruling's second half | δ | V-CI |
| **A30b** | E-R5 cost proof, split honestly (**DECIDED — orchestrator R12**) | published bounds | (i) submit a definition breaching a DEFINITION-STATIC bound (node count / depth / measure leaves / lag depth); (ii) evaluate an ALREADY-APPROVED definition after the client's chart has grown past the evaluation-time bound (account-set expansion / cell count / statement_timeout) | (i) refuses at APPROVAL with its token; (ii) refuses at EVALUATION with a `cost_exceeded`-class token, and the cell persists `cell_status='refused'` with the measured number — never a silent NULL or 0 | calling account-set expansion "static, provable at approval" is falsified by this cell: the selector resolves against live `clara.coa_accounts`, which grows after approval, so a definition approved at N accounts can breach later — and a design that calls that impossible cannot then refuse it. Either bound proven in the wrong phase is a FAIL | δ | V-CI |
| **A31** | E-R5 per-cell provenance (`wave-e-contract.md:147-152`) | any evaluated cell | read the persisted `metric_cells` row | **every** provenance element the contract bullet enumerates is present — definition version / normalized formula hash · periods · account-set + presentation-map versions · input values and entry/document references · books watermark · evaluator version · exact result and displayed rounding · the model proposal · the human approval · supersession links — each either populated or carrying an explicit VERSIONED not-applicable reason. **The count is measured, never inherited:** the bullet is TEN dot-separated groups whose atoms number more (two groups carry two atoms each), so "ten fields" names a grouping, not a field set; the run lists the atoms it checked and states the count it measured (§0.3) | a cell that renders with any element absent is a FAIL — this record is the mechanism the E-R4 amendment rests on (`wave-e-contract.md:151-152`). "The column exists but is null here" without a versioned not-applicable reason is absence, not evidence | δ | V-DB |
| **A32a** | E-R14 charts — "named axis policies (no arbitrary clipping)" (`wave-e-contract.md:315-319`) | a chart spec whose series carries a large outlier | render under each named axis policy; then submit a spec with an ad-hoc numeric axis min/max | each named policy produces its declared bounds, recorded in the sealed manifest with the policy VERSION; the ad-hoc bound is REJECTED by the closed AST validator by name | a renderer free to choose a clip is a number-injection path with a picture around it — a FAIL of E-R4 as much as of E-R14 | δ,ε | V-RT |
| **A32b** | E-R14 charts — "every chart carries an accessible same-source data table" | a rendered chart inside a sealed artifact | read the plotted series and the accompanying table | the table's values are the SAME persisted `metric_cells` rows the chart plotted — asserted **by cell id**, not by comparing rendered strings — and the table is inside the sealed artifact, not generated client-side | a table re-derived at render time, or one whose numbers agree today by coincidence, is a FAIL: same-source means the same rows | ε,ζ | V-RT |

**Section A right-answer anchors:** A1, A4, A10 (prepare half), A16 (management render), the
positive half of A6b, **A19d (the close's own write passes), A21b (the contiguous successor is
admitted), A26 (resolving the exceptions clears the gate with no attestation), A28 (each granted
key works)** are the cells that prove the battery was *asked* something it should say YES to. If
Section A closes with refusals only, it is not discharged.

---

## 2. Section B — SYNTHETIC GOODS-TRADER FIXTURE (WD-R11 closing stock)

E-R9 row 2, verbatim: **Sandbox synthetic goods-trader fixture ONLY** — no real goods-trading
client exists; **NAMED DEBT:** the first real goods-trading client's onboarding carries the real
acceptance. The fixture does not exist on disk yet.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **B1** | E-R2 drawer 2 item 2 | fixture client flagged goods-trading; no closing-stock entry in the FY | close | refuses with the completeness token verbatim; the refusal names the missing period | a goods-trader closing with no stock entry and no attestation is a FAIL | β | V-DB |
| **B2** | E-R2 drawer 2 | same, with a named human attestation | close | succeeds; who/why/when written permanently into the close receipt | an attestation that is not per-item, or not recoverable from the receipt years later, is a FAIL | β | V-DB |
| **B3** | **RIGHT ANSWER** · E-R4 | closing stock entered as a real fixture figure | close and render the FS pack | COGS and gross margin on the pack reproduce **to the cent** from DB-owned inputs through the versioned evaluator; opening stock + purchases − closing stock = COGS as an evaluator-originated identity | a correct refusal battery with no proven correct FIGURE does not discharge WD-R11 | δ,ε | V-DB |
| **B4** | E-R9 named debt | RECORD CELL — B1, B2 and B3 are SEEN | record | the acceptance record states in its own words that this is a SYNTHETIC discharge and that the **real** WD-R11 acceptance rides the first real goods-trading client's onboarding | claiming WD-R11 discharged on a synthetic fixture is a FAIL of the record, not of the code | β | V-OWNER |

---

## 3. Section C — BEE FY2025 · THE FIRST REAL CLOSE

E-R9 row 3 + row 6. BEE CREATIVE SOLUTION is the going-concern real client. **A sole proprietor is
NOT an employee — his account is EQUITY**, never a staff advance and never a counterparty (WC-R10).
Books are real; ADR-060's data authority is DATA-scoped and every mechanism stays at full force.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **C1** | E-R2 drawer 2 item 1 (the WD-R6 answer) | depreciation not run through FY end | close FY2025 | **the gate's FIRST REAL FIRING**: refuses, default-refuse-attestable (NOT absolute), token verbatim | a real close that walks past un-run depreciation is a FAIL; so is an ABSOLUTE refusal with no attestation path (that is drawer 1, not drawer 2) | β | V-DB |
| **C2** | **RIGHT ANSWER** · E-R9 | draft **`3c05ab82`** exists (the 11-period catch-up, Feb-2025, 10,393¢; the 0041 ramp rule explains draft-vs-posted — a first-ever run under an authority always drafts) | pull it through human approval, then close | draft `3c05ab82` reaches `approved`; the drawer-2 depreciation gate then reads CLEAR **without** an attestation; TB re-ties to the sen after approval | approving the catch-up and finding the gate still red, or finding it clear only via attestation, is a FAIL | β | V-DB |
| **C3** | **RIGHT ANSWER** · E-R9 (the close-time FA continuity roll, the rolling posture's task #72) | asset **`dfd0fc52`** live (born from the real scanned ENOTEX invoice through acquisition-from-coding; authority live) | close FY2025 | FY2025 **closing NBV in cents = FY2026 opening NBV in cents**, both read (not derived from one another); the roll fires inside the same close act | a roll that reconstructs the opening figure from the closing figure by arithmetic in the agent, rather than reading both from the DB, is a FAIL of E-R4 | β | V-DB |
| **C4** | E-R2 drawer 1 (FA register tie, segment-aware rebuild) | as above | close | the FA tie asserts at the close boundary. Today `clara.fa_register_tie(p_client,p_as_of)` EXISTS (`0041_wave_d_a_fa_register.sql:4257`, revoked at `:4399`) and is **visibility-only, never blocking** (its own header, `0041:4251-4255`); the segment-aware `fa_control_tie_out` is **MISSING by name** — the same header defers it to "Wave E's close-segment primitive", and a repo scan for `control_tie` across 0001–0054 returns that one deferral line only. The cell asserts the NEW blocking tie, and separately that the old visibility read still reports | shipping the close with only the non-blocking `fa_register_tie` and calling drawer 1 satisfied is a FAIL | β | V-DB |
| **C5** | E-R14 sole-prop format | BEE FS pack generated | read the claim assessment | the pack is labelled **convention-based (P&L + SoFP + capital-account movement)** and its claim assessment is `not_applicable`/`stripped` — **never MPERS-claimed**; the label cannot be reintroduced via filename, cover, or metadata | any MPERS claim on a sole-prop pack is a FAIL. **Status until task #44 clears: NOT CAPTURED** — the positive primary check (LHDN/MIA/ROBA) has not run, and no authoritative sole-prop format was FOUND (UNRESOLVED, not proven-absent) | ε | V-OWNER + V-RT |
| **C6** | E-R9's own exclusion | RECORD CELL — C3 is SEEN | record | the record states that C3 **does NOT discharge WD-R14's opening carry-down deferral**, and cites the measured reason: **BEE held ZERO assets at its 1/1/2025 opening**; the carry-down needs a client that owned assets at opening | folding C3 into a WD-R14 discharge is a FAIL of the record | β | V-OWNER |

---

## 4. Section D — RPR HISTORICAL FY · THE MPERS COMPANY-FORMAT PACK

E-R9 row 4: Sdn Bhd, **9 real months to the sen**; strike-off companies legitimately prepare
historical accounts. RPR carries **two documented allocation scars**, and E-R12 item 1 records that
they self-heal at as-of ≥ 2026-08-01 (`wave-e-contract.md:245-249`). **D2/D3 are recut here
(orchestrator R10):** an annual close evaluates its drawer-1 ties at `fy.ends_on`, not at an
operator-chosen date, so "the same close at two as-ofs" was never expressible — the tie is measured
directly at two as-ofs, and the close is run once, on a real FY, at its own stated end.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **D1** | **RIGHT ANSWER** · E-R9 | 9 real months booked | run TB + the pack | TB ties **to the sen**, both sides read directly (never one side derived from the other); every FS figure reproduces from the evaluator against the pinned books snapshot | a pack whose totals are assembled anywhere but the evaluator is a FAIL | δ,ε | V-DB |
| **D2** | E-R12 item 1 + E-R2 drawer 1 — the TIE, measured directly at two as-ofs | RPR's two scars stand (measured, not inherited: read them at run time) | call the drawer-1 tie for RPR at as-of **2026-07-31** and at as-of **2026-08-01** — `ar_control_tie(p_client, p_as_of)`, the NEW lane-β primitive; the readable-today proxy is `clara.ar_aging` (`0040:3989`) over `clara._aging_core` (`0040:3937-3946`) against the control balance from `clara.trial_balance_as_of` (`0017:3572-3586`) | the 2026-07-31 read reports a NON-ZERO difference in cents; the 2026-08-01 read reports **zero**. Both numbers are recorded with their queries. This is the self-heal, observed rather than asserted | a tie that reports clean at both as-ofs, or dirty at both, means the instrument is not measuring the scars — record UNPROVEN and stop, never "the scars are gone" | β | V-DB |
| **D2a** | **PRECONDITION ROW** · E-R2 drawer 1 (no override, nobody) + E-R12 item 1 | RECORD CELL — D2 is SEEN, with both numbers | before scheduling any RPR close, read the scar state **at the candidate FY's own `ends_on`** | the run states, in cents, whether the drawer-1 tie is clean at `fy.ends_on`. **If `ends_on` falls inside the scar window, the close is UNREACHABLE without remediation** — drawer 1 has no override, so the honest path is to remediate the two scars through the audited verbs (`clara.unallocate_group` → re-apply via `clara.apply_open_items`) BEFORE the close, each act audited, and to re-measure D2 afterwards. Which path was taken is recorded | scheduling the RPR close without this measurement risks discovering mid-acceptance that E-R9's "RPR historical FY MPERS pack" cannot close at all; recording the refusal as a product bug, or opening an override to clear it, are both FAILs of the drawer model | β | V-DB |
| **D3** | **RIGHT ANSWER** · E-R2 drawer 1 + E-R9 | a REAL RPR fiscal year with a stated `ends_on` (the value is read from the FY row and quoted in the record), drawer-1 clean at that date per D2a | close that FY | the close **SUCCEEDS**; the receipt records the FY id, its `ends_on`, and the drawer-1 tie results measured AT `ends_on`; `fy_end_source` is quoted (A23's honesty rule applies to a real client too) | a close whose receipt does not name the as-of it evaluated is a FAIL of the record; a drawer-1 refusal here after D2a read clean means the close used a different as-of than the tie did — a FAIL of the mechanism, recorded as such | β | V-DB |
| **D4** | E-R14 | pack sealed | re-render from the sealed manifest | **byte-reproduction: pre-sign PDF SHA-256 identical** across two independent renders; the manifest pins spec/profile/wording/style/chart versions + books snapshot + dataset hash + evaluator versions + renderer image digest + font/asset hashes | a pack that cannot be re-rendered byte-identically is NOT sealed, whatever the registry says | ζ | V-RT |
| **D5** | E-R14 wording | period begins before 2027-01-01 | generate | the pack resolves **MPERS(2016)** wording rows by effective date (the dual-version table is born two-versioned, on the `clara.sst_threshold_schedule` idiom — table `0016_a21_compliance_watch.sql:237-244`, both seed rows inserted at `:245-248`, the system-maintained note at `:234-236`) | **STATUS: NOT CAPTURED until task #43 clears.** The MASB illustrative PDF's automated extraction FAILED and only the failure was observed; a manual pull + HUMAN verify is REQUIRED before any wording enters the policy tables. **Structure cells may run on placeholder keys; wording-CONTENT cells may not run at all.** Inventing wording is a FAIL | ε | V-OWNER |
| **D6** | E-R8, E-R14 claim states | pack + a custom cut of it | assess both | assessments read `eligible` on the conforming pack and `stripped` on the custom cut; `stripped` **never blocks generation** — the pack seals and renders with the claim removed and the assessment recorded; the claim cannot be smuggled back via filename, cover, or metadata | a custom cut that blocks, or one that silently keeps the claim, are both FAILs. Only `failed` — or a MISSING/unreadable assessment — refuses the seal | ε | V-RT |
| **D7** | PRD §4 item 14 (the honest-FS law) | the RPR pack generated and sealed (D4's artifact) | inspect the pack | the pack ships **SoFP + SoCI + SOCE + cash-flow + basic notes**, or it does not claim MPERS compliance — the two are one cell, asserted together | claiming compliance on an incomplete pack is a FAIL of the cardinal honest-FS law | ε | V-DB |
| **D8** | E-R5 per-cell provenance (capacity) | the RPR pack sealed + the RS snapshot minted | measure | the run records the **COUNT of `clara.metric_cells` rows** minted by the full pack + the snapshot witness, with its query, and projects seven-year growth at the ≤5,000-cells-per-run budget (CA 2016 s.245: seven-year retention, no pruning — the campaign's largest new table, `wave-e-design-reporting.md` §4.3) | closing the campaign with no measured capacity number leaves the seven-year table unsized — a FAIL of the record | δ,ε | V-DB |

---

## 5. Section E — RS SNAPSHOT + STALENESS WITNESS

E-R9 row 5. **ROME SECRETARY's customers are NAME-ONLY — never enrich them with registrations or
TINs** (the standing enrichment trap; `_resolve_counterparty` would then refuse every later
invoice at CLR23 `registration_conflict`, unattended and silently). **E7–E10 are the round-1
review's additions:** E-R3 rules staleness for *"posting, reversal, allocation, correction …
anything that moves a number the snapshot presented"* (`wave-e-contract.md:79-85`), and the first
mint exercised a posting only.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **E1** | E-R3 (months never lock) | a month with real approved invoices | snapshot the month | a management-accounts artifact is minted: timestamped, durable, hash recorded, bound to a `clara.reporting_periods` row (the lane-γ period registry the reporting engine's `period_ids`/`days_in_period` read); **the books stay OPEN** (a post into that month afterwards must succeed) | a snapshot that locks the month is a FAIL of E-R3 | γ | V-DB |
| **E2** | **E-R3 staleness, the load-bearing cell** | E1 artifact exists | post an approved entry whose effect **intersects** the snapshotted period | the artifact is marked **STALE in the SAME audited transaction** as the posting. The mechanism is pinned (`wave-e-design-skeleton-part2.md` §2.11): an `after` row trigger inside the mutating statement — so the assertion instrument is transactional identity: read `snapshot_state` = `'stale'` **inside the same uncommitted transaction** as the posting, or diff the assessment row's `xmin` against the entry's; never observe staleness "eventually" | any asynchronous window in which a stale artifact reads as current is a FAIL (Invariant-4 discipline) | γ | V-DB |
| **E2b** | E-R3 — *intersects*, not *contains* | E1 artifact for month M exists | post an approved entry dated in month **M−1** | the month-M artifact is marked STALE in the same transaction — because a prior-period posting moves month M's opening, YTD and comparative figures. The predicate is a watermark/INTERSECTS test (effect date `<= period_end` and outside the snapshot's `books_watermark`), asserted by exercising a date **outside** `[period_start, period_end]` | a containment predicate (`posting_date` between the snapshot's two dates) silently narrows E-R3's ruled word "intersects" — a snapshot that keeps reading CURRENT after a prior-period posting is a FAIL | γ | V-DB |
| **E3** | E-R3 immutability | after E2 | re-hash the artifact bytes | **bytes UNCHANGED**; staleness lives only in a separate append-only assessment row | mutating the artifact to express staleness is a FAIL — "change is free, silent change is impossible" | γ,ζ | V-RT |
| **E4** | §0.3 corpus-count discipline | RECORD CELL — E1 and E2 are SEEN | measure | the run records the approved-invoice count **it measured**, with its query, at run time. E-R9's "19" was the ratification-day figure; ADR-066's record (`wave-e-f6f9-acceptance.md:131-136`) adds ONE approved entry (`f6da5aff`, 60,000¢) and a TB of **3,116,500 = 3,116,500** — it states no invoice count at all, so no count is inherited from it either | citing 19, or arithmetic on ADR-066's entry to reach 20, without re-measuring is a FAIL of the discipline — even if the number happens to be right | γ | V-DB |
| **E5** | the enrichment trap | RECORD CELL — the section's other cells are SEEN (read at start AND at end) | read at start and at end | **registrations = 0 across every RS customer**, positively read both times; the count of customers is re-measured, not inherited (ADR-066 read 11 on 2026-08-09 — that is a dated observation, not a standing fact) | one enriched RS customer is an irreversible field defect and a stop-the-batch event | γ | V-DB |
| **E6** | **RIGHT ANSWER** · E-R4 | E1 artifact | read a figure off the artifact | every figure on the snapshot reproduces from the evaluator against the artifact's pinned books watermark | a snapshot whose figures cannot be re-derived is not reproducible, whatever it is labelled | δ,γ | V-DB |
| **E7** | E-R3 staleness — **allocation** (the writer class the first mint's trigger set could not see) | E1 artifact exists for a month with open AR items | `clara.apply_open_items` — apply a credit note to an invoice, both inside the snapshotted period | the artifact is marked STALE **in the same transaction**, even though the act writes **no journal entry and no `clara.open_items` row**: the live body inserts only into `clara.open_item_allocations`, stamped `clara._book_today()` (`0042_wave_d_b0_shared_authorities.sql:4896-4903`; `_book_today` created `:4592`), and it moves every aging figure because `clara._subledger_outstanding_asof` sums allocation rows with `effective_date <= p_as_of` (`0040_wave_c_c_tieout.sql:3203-3208`) and `clara._aging_core` consumes it (`0040:3937-3946`). The trigger must therefore sit on **`open_item_allocations`** | an `open_items` trigger cannot fire for this act — that table is append-only by trigger (`0037_wave_c_a_subledger.sql:824-825`), and the apply path never writes it (`0037:3384-3389`, superseded by the 0042 generation). A management pack presenting AR aging that stays CURRENT after a credit-note application is a FAIL of E-R3. A SECOND stale assessment for the same snapshot is EXPECTED, not a defect: the assessment table is append-only and two concurrent movers may each insert — a run that grades a duplicate as a failure is a FAIL of the vocabulary | γ | V-DB |
| **E8** | E-R3 staleness — **unallocation** | after E7 | `clara.unallocate_group(<group>)` | the artifact is marked STALE in the same transaction; the act writes only negation rows into `open_item_allocations` (`0037:3191-3197`) — again no JE, no `open_items` write | an undo that leaves the snapshot reading current after the apply marked it stale is a one-way staleness model and a FAIL | γ | V-DB |
| **E9** | E-R3 staleness — **reversal and correction** | E1 artifact exists; an approved entry inside the period | `clara.reverse_entry` on that entry; separately, a wrong-client correction touching it | each marks the artifact STALE in its own audited transaction, asserted by the same transactional-identity instrument as E2 | E-R3 names posting, reversal, allocation and correction; a trigger set proven on postings alone proves postings alone | γ | V-DB |
| **E10** | E-R3 honest boundary — `verify_snapshot` | a snapshot with a known un-triggered mover (the boundary the design names in prose: counterparty renames, chart relabels, bank-reconciliation state) | run `clara.verify_snapshot(<snapshot>)` | the backstop RECOMPUTES the snapshot's figures against the live books and REPORTS the drift it finds, as a positive read; the honest-boundary list it cannot catch by trigger is named in the function's own comment, not only in the design doc | a backstop named in prose with no callable function and no cell is not a backstop — the first mint left `verify_snapshot` uncelled, and an unrun backstop is indistinguishable from an absent one | γ | V-DB |

---

## 6. Section F — THE E-R12 CLIENT-FACTS TRIO

Lane **α**, the first strike of the campaign. This section is the one where the ADR-066 lesson
bites hardest: **F-1's wall already exists in the schema**, so a battery that only proves it
refuses would prove nothing new.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **F1a** | **THE VERIFY-FIRST CELL** · E-R12 item 1 | before writing any code | prove the wall's IDENTITY, not its spelling | `pg_get_functiondef` on the LIVE `clara.allocate_receipt` / `clara.allocate_payment` (thin wrappers, `0044_wave_d_b3_af2_composite.sql:1642-1657` / `:1659-1674`) resolves to the `_core` bodies at `0044:1034` / `0044:1353`, and those bodies contain the unborn-item wall at **`0044:1266-1272`** (receipt) and **`0044:1557-1563`** (payment) | reading a matching STRING in a migration file and calling the wall live is exactly the "spelling is not identity" failure — a FAIL of method even if the conclusion is right | α | V-DB |
| **F1b** | **RIGHT ANSWER** · E-R12 item 1 | a legitimate advance/deposit scenario: money received BEFORE the bill exists | book the money as an advance, then `apply_open_items` once the item exists | the money **POSTS**; the open item settles; AR/aging ties at every as-of in cents. The sanctioned remedy the refusal message itself names must work | if the only proven behaviour is refusal, the guard is a brick: money-before-bill economics is served by the advances machinery, and this cell is what proves it | α | V-DB |
| **F1c** | E-R12 item 1 refusal | an open item dated later than the settlement | call `allocate_receipt` / `allocate_payment` with `p_posting_date < i.item_date` | **`errcode='CLR10'`**, `detail->>'reason' = 'allocation_to_unborn_item'`, carrying `item_id`, `item_date`, `posting_date` — quoted verbatim from the live raise at `0044:1266-1272`; **no override argument exists** (WD-R13 ruled no-override; asserted against the function's argument list, not its comments) | an override flag appearing anywhere on this path is a FAIL of the ruling | α | V-CI |
| **F1d** | E-R12 item 1 scope | RECORD CELL — F1a, F1b, F1c, F1e and F1f are SEEN | record | the record states what F-1 actually required: **ratify-plus-regression on the `allocate_*` wall, PLUS one new guard on the apply path** (F1e). The `allocate_*` wall is live and carried byte-for-byte into 0044; **if a second, duplicate wall is written there, the record must say why** | writing a duplicate wall without stating the reason is a FAIL of the record; so is recording F-1 as "no new code" now that F1e exists | α | V-OWNER |
| **F1e** | E-R12 item 1 — **the apply-path guard** (both round-1 reviews converged; **DECIDED — orchestrator R18**) | RPR-shaped fixture: a post-dated source item (credit note dated in the future) and a historical target invoice | `clara.apply_open_items` pairing them | **REFUSED** — the guard is `clara._book_today() < greatest(si.item_date, ti.item_date)` → raise in the standing shape (token spelling per §0.4). The defect it closes is read, not argued: the live body stamps both legs `clara._book_today()` (`0042:4896-4903`) but performs **no date test** against either item; aging admits items at `item_date <= p_as_of` (`0040:3946`) while allocations enter at `effective_date <= p_as_of` (`0040:3207`), so between the act date and the source's `item_date` the target carries its allocation while the source is invisible — Σ aging buckets ≠ the unmoved control account | the live comment at `0044:1265` says `apply_open_items` "is act-dated and structurally immune to this defect": act-dating is PROVEN (the producer law, `0040:789-811`; the column added `0040:813`), but immunity is CONDITIONAL on the act date being ≥ both item dates, and a repo scan for a future-posting-date guard returns nothing. Shipping the comment as the mechanism is a FAIL — a comment is not a mechanism | α | V-DB |
| **F1f** | **RIGHT ANSWER** · E-R12 item 1 | both items dated on or before today | `clara.apply_open_items` on a same-day pair, and on a historical pair | both **SUCCEED**; the allocation pair is written with one `effective_date`, and the AR aging vs control tie holds in cents at as-of = the act date and at as-of = a later date | a guard that refuses the ordinary same-day application would break the very remedy F1b's refusal message names — the wall would become a brick, and F1e without F1f is an unproven wall | α | V-DB |
| **F2a** | **RIGHT ANSWER** · E-R12 item 2 | BEE (sole prop) and RPR (Sdn Bhd) | call `clara.get_context_pack(client_id, purpose)` and **read the returned PACK** | the pack's `client` object carries `entity_type` with the correct value per client (`sole_prop` for BEE, `sdn_bhd` for RPR — both members of `ENTITY_TYPES_V2`, `packages/runtime/workflows/interview.v2.frameworks.ts:50-52`). **The assertion is on the pack JSON, not on the migration source** | asserting the splice landed by grepping the migration is derived-state-as-evidence and a FAIL of method | α | V-DB |
| **F2b** | E-R12 item 2 (the BEE lesson made structural) | F2a green | drive a coding/drafting prompt for BEE | the sole-prop signal reaches the model surface; a proprietor-draw draft codes to **EQUITY**, never to a staff advance and never to a counterparty | a proprietor draw coded as an employee advance is the exact WC-R10 defect this ruling exists to prevent | α,η | V-RT |
| **F2c** | patch-not-rebuild law | before the splice | harvest | the `entity_type` splice is applied against the **LIVE** `get_context_pack` body (harvested via `pg_get_functiondef`). Its current change-of-record is the msic-augmented client object **CONSTRUCTED** at `0036_wave_c0_deferred_belts.sql:1559-1566` (a concatenated literal assembled into `v_next`, not a single string) — **not** `v_anchor` as declared at `0036:1554`, which is the PRE-0036 anchor and appears ZERO times in the live body after the splice. A builder who counts `v_anchor` finds nothing and must not conclude the splice is absent | a from-file rebuild silently reverts the 0017/0018/0019/0036 splices — a quiet, total regression and a hard FAIL; counting the wrong literal is a FAIL of method | α | V-DB |
| **F3a** | E-R12 item 3 | MSIC door built; RPR active | enter **68109** through the door, then **replay the identical call with the same `op_key`** | the fact is readable on RPR; the receipt carries **who** (actor id), **basis** (the owner's instruction/evidence), **when** (timestamp); the act appears in `clara.audit_log` (`0002_foundation.sql:276-288`; `outcome` is CHECKed to `'ok'` at `:285` — committed successes only). **The replay returns the STORED result from `clara.op_receipts` (`0002:295-303`) and mints NO second fact row, NO second audit_log row, NO second event** — asserted by counting all three before and after | a code written with no basis captured is a FAIL — who/when alone is not the ruled trio. A replay that writes a second fact, or that returns a fresh unrecorded result, is a FAIL of idempotency | α | V-DB |
| **F3b** | E-R12 item 3 | RS active | enter **82110**, then replay under the same `op_key` | as F3a | as F3a | α | V-DB |
| **F3c** | E-R12 item 3 | BEE active | enter **74101**, then replay under the same `op_key` | as F3a | as F3a | α | V-DB |
| **F3d** | E-R12 item 3 / ADR-062 | after F3a-c | attempt the OLD path | `clara.commit_client_onboarding` still refuses an active client — **`CLR10` `'client onboarding is not open'`** (`0017_wave_b.sql:2777-2778`). The new door is a NEW door, not a reopening of the interview commit | a door that reopens onboarding for an active client is a FAIL: it would let any committed fact be silently re-answered | α | V-CI |
| **F3e** | E-R4 / Law 2 | RECORD CELL — F3a, F3b and F3c are SEEN | validate | the door does **not** validate against an official MSIC registry, because **no `clara.msic_codes` reference table exists** — a scan of migrations 0001–0054 finds `msic` only as an interview item key and as the 0036 context-pack splice (`0036:1550`, `:1561`, `:1565`) — the record states this as a measured absence and names basis-capture as the compensating control | claiming the codes were "validated" when only their format was checked is a FAIL of the record | α | V-OWNER |
| **F3f** | Appendix A finding 1 (the arg-tuple half of idempotency) | F3a SEEN | replay the door with the **same `op_key` and DIFFERENT arguments** | the call is **REFUSED** (a `CLR10`-class refusal), not silently answered from the stored receipt — asserted as BEHAVIOUR. The intent is documented at `0002:292-294` (*"request_hash pins the arg tuple so op_key reuse with DIFFERENT args is rejected (CLR10) rather than silently returning a stale receipt"*), and this cell proves the mechanism rather than quoting the comment | returning the stored result for a different arg tuple would let one op_key launder a second, unrelated fact into the book — a FAIL; and a comment standing in for the proof is a FAIL of method | α | V-CI |
| **F4** | E-R12 item 3 + E-R3 immutability discipline (supersession, never mutation) | a client fact already entered through the door (e.g. RPR's `68109`) | enter a CORRECTED value through the same audited door | the new fact SUPERSEDES the old: the prior row remains readable with its original who/basis/when, the new row carries its own trio plus an explicit supersession link, and the read surface returns the CURRENT fact exactly once (no duplicate, no silent overwrite). Asserted by reading both rows and the reader's single answer | an in-place UPDATE of a client fact destroys the basis the ruling exists to capture — a FAIL; a reader that returns both the superseded and the current fact as equals is a FAIL of the surface | α | V-DB |

---

## 7. Coverage sweeps

### 7.1 The eight mandatory coverage dimensions — sweep index (rebuilt from cell TEXT)

E-R9's closing sentence lists eight dimensions that must be swept **across** the corpus rows, not
treated as a ninth machine. Each cell below was re-read and listed only where its own assertion
text carries the dimension — the first mint's index credited two dimensions with cells borrowed
from another. Each dimension must close with at least one **SEEN** cell.

| # | dimension | cells (each verified to assert it in its own text) |
|---|---|---|
| **D1** | role / RLS boundaries | A9 (`has_function_privilege` sweep + live `42501`), A10, A11, A12, A18, A27 (definer/invoker + client-in-firm), A28 (keys ②③ separately grantable), A29 (zero granted writers on curated tables), F3d |
| **D2** | concurrency | A13 (two `begin_close`, the loser's WAIT observed), A19b (close-vs-**post**, both directions), E2/E2b/E7 (same-transaction staleness identity) |
| **D3** | idempotency | A14 (close replay), F3a/F3b/F3c (door replay under the same `op_key`, three counts before/after), F3f (same key, different args → refused) |
| **D4** | evaluator edge policies | A15 (the five named policies), A30a (type/scope rejection), A30b (static vs evaluation-time cost), A31 (provenance completeness), A16, B3, D1, E6 |
| **D5** | number-injection attempts | A7 (narration placeholders), A8 (inline chart values), A32a (ad-hoc axis bounds), A32b (same-source table), B3, D1 |
| **D6** | reopen ordering | A5 (the ordering guard), A5b (the reopen's REQUIRED effect order, proven by the wall's refusal of the reversed order), A19a (a post/reverse into a closed FY refuses), A22 (`abandon_close` returns the FY to `open` and disarms the wall) |
| **D7** | guard activation (E-R6) | A6a (fires on a closed period), A6b (open periods still work), A6c (unknown entry fails closed), A6d (the three-reader roster + the honest twin) |
| **D8** | byte-reproduction of sealed artifacts | A17, D4, E3 |

A dimension whose only cells are refusals is flagged in the as-run record and re-asked with a
right-answer cell before the section closes.

### 7.2 Ruling-disposition rows (no ruling leaves this matrix silent)

Three rulings carry no execution cell. Their disposition is stated here rather than inferred from
absence — the same discipline §0.2 applies to evidence.

| ruling | disposition | where it is discharged |
|---|---|---|
| **E-R1 first strike** (`wave-e-contract.md:21-24`) | **EXTERNALLY DISCHARGED — no cell in this matrix.** The F6–F9 fix batch closed at ADR-066 with its own as-run record; re-asserting it here would inherit a discharge instead of measuring one | `docs/plan/wave-e-f6f9-acceptance.md` (and the ADR). Note the record's own boundary: it does **not** state that F6 unblocked Gate P |
| **E-R10 UX debt** (`wave-e-contract.md:213-222`) | **NON-BUILD RULING — no execution cell.** All of it ships in Wave G; lane θ builds plumbing-grade surfaces only, and this matrix asserts no UX behaviour. A cell here would grade something Wave E is ruled not to build | Wave G's own acceptance. The lane-θ surfaces are covered only where a cell needs them as a READ (A4's readiness read) |
| **E-R13 settlement-corroboration door** (`wave-e-contract.md:256-285`) | **DESIGN-ONLY IN E — no execution cell, and none may be added.** The build rides Wave F, and until that ADR lands 7A-R3 stands whole: no tax-silent document posts unattended | Wave F's build ADR + acceptance. If any Wave-E lane finds itself needing a corroboration cell, that is scope leak — stop and escalate |

---

## 8. Run order (E-R7 / E-R9 — dependency, not slicing) — **the canonical order, stated once**

E-R7's one stated dependency is binding: **statements cannot be accepted before a close model
exists.** The canonical acceptance order is **F → A → B → C → D → E**; E-R9's corpus table names
the CORPUS, not the run sequence, and where any sibling document states an order this section
governs. Everything beyond the stated dependency is **(builder choice)** and may be re-sequenced
without reopening a ruling.

1. **Section F (lane α)** — the trio is independent of the close model and may ride early. F1e's
   guard is a lane-α build item, not a test-only cell.
2. **Section A (β, then γ/δ/ε/ζ cells as their lanes land)** — the sandbox battery. A6a–A6d
   cannot run before β births the period model; A19a–A19e wait on the wall; A15/A16/A30/A31 wait
   on δ; A32a/A32b and A17 wait on ε/ζ.
3. **Section B (β + δ/ε)** — the goods-trader fixture.
4. **Section C (β)** — BEE FY2025, the first REAL close. Runs only after Section A's close/reopen
   cells are SEEN in the sandbox.
5. **Section D (δ, ε, ζ)** — the RPR MPERS pack. **D2 and D2a run FIRST and gate the rest of the
   section**: if the candidate FY's `ends_on` sits inside the scar window, remediation precedes
   the close. D5's wording-content cells are **NOT CAPTURED** until task #43 clears; D1 does not
   depend on it.
6. **Section E (γ)** — the RS snapshot/staleness witness.

**Gate between 2 and 4:** no real-client close is attempted until the sandbox has SEEN close,
reopen, all four guard-activation cells (A6a–A6d) and the wall battery (A19a–A19d). The sandbox is
fully controllable; BELCORT's books are not.

---

## 9. Closing-Verification-Block — the template every acceptance session ends with

Copy verbatim into each as-run record; fill only with what a read SAW.

```
CLOSING VERIFICATION — <section> · <UTC timestamp> · <lane> · <model override>

1. TB TO THE SEN        <client>: debits <n>¢ = credits <n>¢, difference 0
                        (both sides read directly; NOT one derived from the other)
2. STRANDED COUNT       <query> -> 0 rows  (a POSITIVE read of zero, quoted with its query;
                        an empty result set is only evidence when the query is shown)
3. PROTECTED WITNESSES  canary daba7f2e   -> UNANSWERED (read again, still untouched)
                        b2 witness d023b48c -> status 'draft' (read again, unmoved)
                        RS registrations -> 0 across <n> customers (n re-measured today)
4. CROSS-FIRM ISOLATION zero writes outside firm <id>, asserted by firm id
5. COUNTS RE-MEASURED   every count in this record was measured today; none inherited
6. REFUSAL HEADS        <token>: <n> ; any head at 0 is listed here as an OPEN QUESTION,
                        never as a witnessed wall
7. GATE CATCHES         every verify-before-approve stop, with what it prevented
8. VOCABULARY           each claim tagged SEEN / NOT SEEN (reason) / NOT REACHABLE /
                        NOT CAPTURED / NOT PROVEN
9. SUPAVISOR            <n>/60, runtime pool <n>   (headroom re-checked before any deploy)
```

---

## 10. What this matrix does NOT claim

1. **Nothing here has run.** Every cell is a question minted before the build; not one is
   evidence. The as-run records are separate files.
2. **The sandbox battery, the goods-trader fixture, the close model, the closed-period wall, the
   period registry, the algebra evaluator, the FS template layers, the render worker and the MSIC
   door do not exist on disk.** Cells that assert their behaviour assert an OUTCOME the build must
   produce, not a mechanism this document has read. Where a cell names a live object it carries
   that object's file:line, re-read on 2026-08-09.
3. **Two owner gates block content cells, not structure cells:** task #43 (MASB golden-wording
   manual pull + HUMAN verify — D5) and task #44 (sole-prop positive primary check — C5). Both
   are **NOT CAPTURED**, not "absent therefore free to invent".
4. **Proposed refusal-token spellings and `CLRnn` codes in §0.4 are (builder choice)** and bind
   nothing; the as-run record quotes whatever the shipped code actually raises, verbatim. The same
   holds for the advisory namespace `203005007` and every migration number.
5. **The lane→cell assignments and the verifier roster are (builder choice)**; the independence
   law behind them (ADR-061 Law 1, and a verifier that reads a different angle than the claim's
   producer) is not.
6. **Cell counts are not coverage.** A section with every cell green and no right-answer cell in
   it is not discharged — see the header lesson, which this document exists to obey.
7. **This matrix does not decide the two owner-open items it depends on.** The E-R11 factory
   default (owner-only vs owner/partner) is PROPOSED, pending the owner's one-line confirmation —
   A28 asserts the SEPARATE-grantability ruling, which holds under either default; and the
   RPR-close reachability question (D2a) is a measurement to be taken, not a conclusion recorded
   here.

