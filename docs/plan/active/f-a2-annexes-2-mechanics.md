# F-A2 annexes 2 — battery and censuses

> Companion to `f-a2-agentic-posting-design.md` (**v6, 2026-08-22**). **Annex C** the battery ·
> **Annex D** the tier census, the wake-kind sweep, T3's mechanism, the C-3 decision record and
> **GB-3's corrected build recipe (§D.2c)**, **GB-2's projected-state predicate (§D.6)** and **GM-7's
> lock ordering (§D.7)**.
> Sibling files: `f-a2-annexes-1-estate.md` (A, B) and `f-a2-annexes-3-record.md` (E-I).
>
> **Standing caveat.** Everything read from migration *source* is a **prediction about the live
> catalog**. Three classes defeat source reading: `base + dynamic splice` bodies · uppercase
> `pg_get_functiondef` round-trips (three `execute_rule_post` bodies, including the live one, are
> invisible to a case-sensitive grep) · and **trigger deferrability, which is a `pg_trigger` fact**.

---

## Annex C · The battery (design §6; contract-blind cells ▣)

**C.1 · The wrapper.** No credential → CLR03 ▣ · wake kind without the allowlist row → CLR03 ▣ · **a
`'proactive'` credential ATTEMPTING the post is refused** ▣ *(re-cut at the gate: v4's cell read the allowlist
roster, which proves the row is absent, not that the door is shut — the cell must make the call and be
refused)* · blank op key → CLR10 with the typed detail ▣ · blank `rationale` ▣ · `p_model` missing a required
key ▣ · null `books_version` ▣ · the wrapper carries **no DML** (catalog cell) ▣ · replay returns the stored
receipt byte-identically ▣ · a new `taskId` re-attempts after a refusal.

**C.2 · Tier A.** A2/A4/A5/A6/A7 each forced ▣ · **A8: a human's draft refuses** ▣ · **A8's second conjunct —
an AGENT draft a human has REVISED (`revise_entry` sets `last_human_editor` and writes only
`duplicate_override`, so B6 cannot see it) refuses AT A8** ▣ *(C-1's cell; it must fail with the conjunct
removed)* · **the OQ-4 exits: the same revised draft posts through the HUMAN lane under human identity** ▣,
**and an agent RE-DERIVATION of it posts under agent identity with a rationale citing the human suggestion it
weighed** ▣ *(the forbidden middle — human numbers under agent identity — is what A8 refuses)* ·
`closing_transfer` refuses ▣ · the row lock precedes every ladder read (two concurrent posts of one entry, one
wins).

**C.3 · Tier B — all THIRTEEN rungs (B1–B11, B14, B15), each forced non-vacuously, each COMMITTING a receipt +
an `entry.post_refused` event, each appearing in the vector.** **B1: an agent settlement post
(`customer_receipt`, `supplier_payment`) refuses with the rung named** ▣ *(BL-3's cell)* · B2 uncorroborated ▣
· **B2 POSITIVE — a corroborated document DOES post** (the §6 gating cell; needs openers ①②⑥) ▣ · B2 on a
`'{}'`-shaped or absent fact state refuses (absence is the refusal) ▣ · B3 unbound anchor ▣ · **B4 by kind —
the DIFFERENTIAL trio replacing v4's self-referential cell (GM-1)**: (a) a **printed-rounding sales invoice
admitted by BOTH B4 and B11**, which goes RED against v4's `income + tax = total_cents` ▣ · (b) the **nil-tax
rounding twin**, proving the tie is tax-independent (`0022:919-924`) ▣ · (c) the **absent-fact twin** — no
`rounding_cents` on the fact side — where the component tie reports **`not_evaluable`, never `pass`** (GM-2)
and the fabricated `sst_output` shape `0046:1092`'s retiring `account_mismatch` caught is **refused, not
admitted** ▣ · plus the supplier and generic kinds against Annex I ▣ · B5 `amount_exception` without override
▣ · B6 `amount_override` and `duplicate_override` twins ▣ · B7 `model_read` tier ▣ · **B8 forced with
`revision_token` rotation suppressed** ▣ · B9 ×3 scope kinds, receipt naming the `question_id` ▣ · B9
negative: `origin='rule_proposal'` does not block (`0012:100`) ▣ · **B10/B11 on the PROJECTED state (GB-2): an
agent sales draft whose receivable leg carries NO counterparty POSTS** ▣ *(the cell that goes RED against v4's
form, which refused 100% of sales posts with the supplier token)*, while a genuinely mis-shaped supplier bill
still refuses at B10 ▣ · **THE FA AND ADVANCE BELTS ARE NOW TIER-D CELLS (GM-3):** **an FA acquisition debit
and a staff-advance disbursement debit both POST** ▣ *(the two cells that would have gone RED against v4's
pre-checks — the proof the cut was correctness, not width)* · **a genuinely unregistered movement ABORTS at
commit and settles `failed`, with the belt's `(errcode, reason)` in `last_refusal`** ▣ *(C.5's shape, not a
receipt)* · `advance_mirror_unregistered` and `advance_application_missing` are **declared-unreachable rows,
not forced cells** (law 31; E.2 carries the grounds) · **B14: a generic JV carrying an AR/AP control leg
refuses `generic_control_leg` as a RECEIPT**, and the same entry with the leg removed posts ▣ *(M-1; the
negative twin proves the rung was the reason)* · **a CODED-kind entry with a control leg still posts**,
proving `_subledger_on_approve` really does satisfy the belt for those kinds ▣ · **B15 is forced in C.14**
(GB-1's two cells). **The vector cells:** all rungs evaluated even after the first failure ▣ · **a rung whose
inputs are absent reports `not_evaluable`, never `pass`** ▣ *(the ARM-0 shape)* · an empty vector is the only
thing that posts ▣ · at 0/33 corroboration the vector still distinguishes documents ▣ · **a doctored vector
carrying an UNKNOWN value does not admit** ▣ *(M-4's consumer-contract cell — it fails against any consumer
written to test for `'fail'`)* · **the vector is durable in BOTH homes: a refusal's vector is readable from
`op_receipts`, a post's from `entry_post_receipts`** ▣ (M-3).

**C.4 · Tier C — pairs only.** Each pair forced: `(CLR25, currency_unsupported)` and **`(CLR25,
corroboration_contradicted)` — the cell that proves the conversion names the RIGHT wall, i.e. that a
money-wall failure is never reported as a currency refusal** ▣ · `(CLR23, counterparty_landscape_moved)` ▣ ·
`(CLR23, counterparty_birth_race)` ▣ · **`(CLR23, registration_conflict)` forced, and forced FIRST — a fixture
whose counterparty resolution hits the registration conflict one call below `0037:1853` must settle as a typed
REFUSAL, not a task failure, and must NOT be reported as `counterparty_landscape_moved`** ▣ *(GM-5's
pre-emption cell; it fails against v4's pair set)* · **`(CLR10, customer_identity_name_only)` forced on a
ROME-SECRETARY-shaped fixture — a name-only client plus an identifier-bearing counterparty birth — settling as
a typed refusal naming hard constraint 12's wall** ▣ *(GM-6; population ≈ 0 today, which is why the cell and
not the data is the evidence)* · **the CLR26 two-session race: with Tier A's three locks held the post either
waits or refuses at B9 and never reaches the delegate's CLR26 re-check** ▣ *(GM-7; if it ever does, the
fallback pair is required and this cell says so)* · **`(CLR10, already_reversed)` is a DECLARED-DEAD row, not
a forced cell** — it left the pair set at the gate on law 31, and E.2 carries the ground · `(CLR21,
duplicate_bill)` ▣ · `(CLR21, duplicate_sales)` ▣ · `(CLR19, write_into_closed_period)` via the
**non-deferred** `t_period_wall` ▣ · **a bare CLR23 from inside `_assert_supplier_bill_shape_at` does NOT
convert — it propagates** ▣ *(the anti-wildcard cell)* · **an unlisted `(errcode, reason)` propagates as a
task FAILURE** ▣ · the subtransaction rolls back the delegate's partial writes (no orphaned counterparty
birth) ▣.

**C.5 · Tier D.** **The replayed census cell: `select tgname, tgdeferrable, tginitdeferred from pg_trigger
where tgrelid='clara.journal_entries'::regclass` matches §D.1's table exactly, in both directions** ▣ · a
Tier-D abort settles the task **`failed`** ▣ · **the commit error's `(errcode, reason)` reaches
`last_refusal`** ▣ · `entry_post_receipts` suppressed → `t_je_agent_post_receipt` → CLR08 ▣ · a human approval
needs no receipt (the trigger is inert) ▣ · ARM-0 declared unreachable-by-FK **with the reason recorded** ▣ ·
the balance / provenance / immutable guards still fire on a doctored fixture ▣.

**C.6 · Identity and receipt.** The receipt carries actor + wake kind + model + rationale + verdict + vector ▣
· **`on_behalf_of` is NULL on an autodraft post and NON-NULL on a chat post** ▣ *(proves the NULL is
structural, not a bug)* · `maker_active_at_approval` is NULL on autodraft, never `false` ▣ ·
**`approval_arm='agent_unattended'` and NO `self_approval_attestation` is written** ▣ · the human lane's three
CLR05 arms are byte-untouched ▣ · **an `is_year_end` and a `tax_affecting` entry both post unattended** ▣
*(OQ-6's ruling made behaviour, so it gets a cell rather than an assumption)* · `_audit` and `entry.posted`
both carry obo and wake kind (the `0037:2102`/`:2111` regression cell) ▣ · unique(entry_id) ▣ · append-only
refuses UPDATE/DELETE/TRUNCATE ▣.

**C.7 · N1 / T3.** Leg-shape refused at **draft** on the agent lane ▣ · the **human** lane's draft is NOT
refused ▣ · **T3: a human approval on a two-generation document behaves byte-identically before and after the
trigger recut** ▣ *(the zero-blast-radius cell)* · **an agent post's trigger and its pinned caller judge the
SAME generation — THE cell that must FAIL on a wrong `gate_verdicts` accessor** ▣ *(C-2a: written so a
nested-vs-flattened mistake, which yields NULL and therefore today's unpinned behaviour, goes RED instead of
silently passing)* · **the sales arm too** ▣ · the 1-arity delegates (`0016:3957-3961`, `0016:2115-2119`) are
**byte-unmoved** ▣ · the direction-family arm now fires on the chat lane ▣.

**C.7b · The receipt write contract (C-2b/c) — three per-tier zero-row cells, and they stay three.** A
successful post writes exactly one `entry_post_receipts` row ▣ · **a Tier-A raise leaves ZERO rows** ▣ · **a
Tier-B refusal leaves ZERO rows** ▣ · **a Tier-C conversion leaves ZERO rows** — the insert rolls back with
the delegate inside the subtransaction ▣ · the row is visible to the deferred `t_je_agent_post_receipt` at
COMMIT (the insert precedes commit and follows the delegate) ▣.

**C.8 · Breeding excision — the inverted twins, fixtured as AGENT posts.** *(A human fixture would prove only
the human case.)* After the 8th body, **an agent post** breeds no `rule_sightings` ▣, no `coding_rules` ▣, no
`open_questions` from the ≥3 loop ▣, no `kb_rule.proposed` ▣ · the `0040:7115` `bank_rule_suggested` conjunct
is gone ▣ · **three employee claims no longer breed a `vendor_account` proposal** — the inversion of
`x37-wave-c-a-subledger.test.mjs:1951` ▣ · **an ORDINARY approval on the same counterparty+account no longer
moves the sighting counter** — the inversion of `x42.prod-23`'s control half (`:296-307`), whose carve-out
half `:335` already records as vacuous ▣ *(M-10)* · **the two re-pointed zero-count heads: an agent post AND a
human approve both leave `rule_sightings` unchanged** ▣ *(absorbing `wb-s-seeding.test.mjs:202-203`, and
`:205` re-pointed off the `?? ""` fail-soft `fnSource` read — M-8)* · `_draft_entry_core` writes no
`rule_decisions` **ever again — OQ-2 RULED, D35** ▣ · **and the KEPT historical rows are still readable** ▣ · **the human approve path is otherwise byte-identical** (rig exact-diff of receipt,
audit row, event and entry) ▣ · **the eight CARRY markers of `0040:7148-7159` survive and the three RETIRE
markers are gone, at the stated counts** ▣ · a parked run against a frozen toolface still reaches
`clara.coding_lane` without `undefined_table` ▣.

**C.9 · The `posted` chain (FIVE layers + six sites).** **GM-8's layer first, because it is the one a naive
widening trips:** with the outcome CHECK widened but `ck_sweep_run_items_shape` untouched, a `posted` row
carrying an `entry_id` **violates the shape constraint** — so the battery forces a posted settle **with** its
`entry_id`, asserts it lands ▣, and asserts it is refused when the shape constraint is left un-widened ▣ *(the
must-fail half: a five-layer fix proven by a four-layer fixture is exactly the defect GM-8 names)*. Then: a
posted settle writes `sweep_run_items.outcome='posted'` — **not `skipped_lane`** ▣ *(the `0036:979-980` cell)*
· the CHECK admits it ▣ · **the `0011:2754-2762` finalize counts it** (drafted+skipped+refused+posted =
expected) ▣ · `entry_id` is recorded ▣ · **no synthetic `CLR29` refusal token is written for a posted row** ▣
*(the false-data cell)* · `last_refusal` is cleared ▣ · the `p_entry`-exists validation runs for `posted` as
it does for `drafted` ▣ · **both `settle_autodraft_task` overloads** accept it ▣ · **`entry_post_receipts`
count == `sweep_run_items` posted count; a disagreement fails the battery** ▣.

**C.10 · The pack.** The block appears, client-scoped, budget-capped ▣ · computed from `status='approved' and
reversed_by is null`, and **moves when an entry is reversed** ▣ · reads no `rule_sightings`/`coding_rules` row
▣ · all five prior markers survive the fifth splice ▣ · the anchor matched **exactly once** and the result
**changed** ▣ · the wiki block still gates on purpose + `pack_consumer` and v9 still sends `'v25'` ▣.

**C.11 · Law 8 / law 73.** `WB_AUTHORITY_FNS` covers the three new verbs, **and the test fails if a new
post-path verb is added without joining it** ▣ · no §3.2 wall references a wiki table or the patterns block ▣
· `get_context_pack` is not on the roster ▣.

**C.12 · Grants and census.** `wake_post_entry` executable by `clara_wake_interactive` and nothing else ▣ ·
`clara_agent_ro` holds nothing in the lane ▣ · the core is ungranted ▣ · `_approve_entry_core`'s zero-grant
pin holds (`0015:3592-3596`) ▣ · the app-executable-DML census against `journal_entries` did not grow ▣ ·
PUBLIC=0 and one-overload on every touched function ▣.

**C.13 · Chat parity and its fail-closed path — IN THIS BATTERY, on the owner's D34** (C-3's shape, R-1's
narrowing, GB-3's corrected build recipe). **A chat post lands with `via_wake_kind='interactive'`** ▣ *(the
post keeps the plain kind)* · **every Tier-B rung re-proven on the chat lane** ▣ *(B15 included — chat is
direction-blind today)* · a chat post of a `journal_entry` generic ▣ · **`interactive_client` is minted for
the `wake_open_question` call and no other** ▣ *(R-1's cell — the pinned credential is not held across the
turn's other reads)* · **GB-3's closed-world cell: after the extension the kind holds EXACTLY ONE allowlist
row** ▣ *(a second row is how this kind would quietly become a posting kind)* · **the CHECK-swap cells: the
extended kind CHECK admits the new name AND the extended client CHECK still refuses a client on a plain
`interactive` row** ▣, and **the swap validates over every pre-existing row** ▣ *(drop+add proven on the rig,
not asserted)* · the new kind mints only with a firm-congruent active client and **KEEPS `on_behalf_of`** ▣ ·
**BOTH mint gates: a mint refused `bad wake_kind` before the fix now succeeds, and an unknown kind still
refuses** ▣ · **`wake_open_question` succeeds from it and still REFUSES an unpinned credential** ▣ *(the wall
is the pin, not the kind name)* · **the extend-only regression cells** — a plain `interactive` credential
still cannot carry a client ▣, `list_unassigned_documents` still admits it on a `p_client => null` call ▣
*(census finding 1)*, and **`coding_lane` returns exactly what it returns today for a plain `interactive`
credential** ▣ *(census finding 2 — the cell that would have caught the frozen-`chatTurn_v12` behaviour
change)* · `chatTurn_v13` **and the new frozen `_vN` infra file** are new exports with registry repoints ▣.

**C.14 · The generic lane, and the two cells GB-1 minted.** A generic JV skips `0016:4020-4034` **and still
cannot post untied** ▣ · a generic JV with no document refuses at Tier B ▣ · **a generic JV on an enrolled FA
or advance account ABORTS at commit and settles `failed`** ▣ *(re-cut from BL-1's receipt cell — Tier D is
where those belts live now, GM-3)*.

**GB-1's two cells, and the first is the gate's own attack fixture.** **(1) The suppressed-payable fixture:**
a corroborated supplier invoice drafted `coding_kind=NULL` as `Dr Expense / Cr Bank` — which passes every one
of v4's fourteen rungs — **refuses at B15 with `generic_on_directional_document`** ▣. The cell is written so
it goes RED with B15 removed, because that is the whole finding. **(2) The direction-unresolved twin:** a
genuinely generic document whose `_autodraft_direction_tri` resolves to neither sales nor purchase **still
POSTS when tied** ▣ — D18 must survive its own new wall.

**GM-10's re-admit door gets a PR-2 cell here.** After a human revises an agent draft and the draft is
**withdrawn**, the designed re-admission must put the document back in front of the agent **without weakening
`0053`'s duplicate-sweep gate**: the cell asserts the re-read happens ▣ **and** that an ordinary repeat sweep
on an already-done filing is still refused `already_done` ▣. *(The cell exists because the mechanism does not
— v4 claimed `entry.revised` did this, and it does not.)*

**C.15 · Retirement.** The rosters are exact in both directions, **eleven names removed and the gated cohort
added** ▣ · **a rig replay proves the live `execute_rule_post` body is gone** (never a grep; any cross-check
grep is case-insensitive) ▣ · the two SOFT-failing helpers are deleted ▣ · `check-binding-post-control` and
its wiring are gone ▣ · **`test-list-d-b2.txt`'s `#!cells-floor:` is trued against the WHOLE sweep —
`x42.prod-23` and `x42.prod-25` in `x42-producer.test.mjs` plus `x42-producer-role.test.mjs`'s cells** ▣ · the
KEEP tables still hold their rows ▣ · **`dbSeamCensus.test.ts:473` is trued** ▣.

**C.16 · End-to-end and corpus.** Witness pair → cited region → `verified` → **post succeeds**, receipt read
back ▣ · the negative twin ▣ · **the advisory runtime read says corroborated while the DB refuses — the DB
wins** ▣ · the 33-document corpus re-run publishing the FOUR numbers plus per-document vectors ▣ · a live post
on ROME PUBLIC ADVISORY then a BELCORT client, **constraint 12 held throughout**.

**C.17 · Acceptance, law 29 — the six obligations design §6 points here for.** **(1) Openers ①②⑥ live are a
hard prerequisite** — without them B2's positive cell has no corroborated document and the battery reports a
safe zero indistinguishable from a broken build. **(2) The forced order: ceremony → re-extract FIRST → then
evaluate** (`f-a1-corpus-measurement.md`) — a `witnessFacts.v1` row holds no SST answer and no coverage
receipt, so it can never satisfy the successor nil-tax arm, and evaluating first re-scores on the wrong
population. **(3) Publish FOUR numbers — opener ①'s three plus POSTED — over the TWENTY re-extracted
documents** (ADR-0072 ①.2), with **the full failing-rung vector** per non-posting document, from `op_receipts`
for those and `entry_post_receipts` for posts; **state the denominator every time**, since twenty is a
*sample* of the measured 33 and a rate off it is not comparable to 0/33 unless it says so. **(4) A live post
on real books**, receipt read back, `entry.posted` carrying obo + wake kind — **ROME PUBLIC ADVISORY first,
then a BELCORT client**; constraints 12 and 13 throughout (**ROME SECRETARY's customers are NAME-ONLY**).
**(5) F-A10's terminal check** — one architecture, executor gone *(by rig replay, never a grep)*, no writer
breeds, the CI gate retired, frozen bodies reachable, history rows present; **it closes at the Wave-G reset**.
**(6) OQ-5's THREE populations are MEASURED AND PUBLISHED — the measurement is part of the ruling (D37), not
an optional extra** — untieable generic JVs, generic entries that would have carried a control leg (B14), and
generic entries refused at B15 for anchoring to a directional document. **PR-4 publishes the size of each**;
the owner accepted the two priced costs knowingly, and the numbers are how that acceptance is checked against
reality rather than left as an estimate.

---

## Annex D · The tier census and the wake-kind sweep

### D.1 · How Tier membership is decided (D5)

**Deferrability is a `pg_trigger` fact.** PR-1 derives it on the rig and pins the result:

```sql
select tgname, tgdeferrable, tginitdeferred, pg_get_triggerdef(oid)
  from pg_trigger where tgrelid = 'clara.journal_entries'::regclass and not tgisinternal
  order by tgname;
```

The table below is the **source-read prediction** the replay must confirm or correct. It is recorded as a
prediction because two independent readers already got it wrong from source: v1 placed two non-deferred
triggers in Tier D, and the review's corrected list was itself **short by five** (P1).

| trigger | source | timing | tier (predicted) | disposition |
|---|---|---|---|---|
| `t_je_balance` | `0003:480-481` | **deferred** | D | structurally satisfied — the core builds balanced entries |
| `t_je_provenance` | `0003:486-487` | **deferred** | D | structurally satisfied — provenance bound at draft |
| `t_je_supplier_bill_shape` | `0009:533-537` | **deferred**, draft→approved | D + **B10 pre-check, on the PROJECTED state** | callable `_at` exists (`0016:3953`), live tip `0036:601`; **its `0036:619-626` prologue is extracted by GB-2 (§D.6) — without that the pre-check refuses every agent sales post** |
| `t_je_sales_invoice_shape` | `0015:1033-1037` | **deferred**, draft→approved | D + **B11 pre-check, on the PROJECTED state** | callable `_at` exists (`0016:2113`), live tip **`0022:714-930`** (CoR of `0016:1958`) — the body GM-1's B4-sales formula is derived against |
| `t_je_customer_receipt_shape` | `0037:674-678` | **deferred**, when approved | D | **unreachable — B1 refuses the kind** |
| `t_je_supplier_payment_shape` | `0037:680-684` | **deferred**, when approved | D | **unreachable — B1 refuses the kind** |
| `t_je_subledger_belt` | `0037:1447-1451` | **deferred**, when approved | D + **B14 shape refusal** | satisfied for the CODED kinds by `clara._subledger_on_approve(p_entry)` (`0037:1050-1274`), *"the hook, called from ALL FOUR approve paths"* (`0037:1032`), invoked at `0037:2028` in the same txn — **and a C.3 cell proves it rather than assuming it**. **CORRECTED (GM-4): the hook does NOT skip a NULL `coding_kind`** — `_subledger_classify_entry` ladder 5 (`0037:995-996`) classifies it `'adjustment'` and materialises open items for its control legs. B14 stands on the re-grounded reason (design §3.2, D25), not on a false claim about this hook |
| `t_je_bank_match_reversal_belt` | `0038:3665-3669` | **deferred**, reversal only | D | **not reachable from draft→approved** (its WHEN is `new.reversed_by is not null and old.reversed_by is null`) |
| `t_je_bank_pending_orphan_belt` | `0038:7719-7724` | **deferred**, draft→approved | D | **unreachable in F-A2** — no `bank_matches` row is created on this path — and a **named forward obligation on F-A3**, which does create them (M-2) |
| `t_je_fa_movement_belt` | `0041:2741-2743` | **deferred**, when approved | **D, pure — B12 CUT (GM-3)** | the predicate is only true AFTER the approve hook runs, so a pre-hook evaluation refuses an ordinary FA acquisition debit. **Tier-D abort → task `failed`, `(errcode, reason)` in `last_refusal`.** Extraction is a future item that must design projected-state inputs first, as GB-2 did |
| `t_je_adv_movement_belt` | `0043:3176-3178` | **deferred**, when approved | **D, pure — B13 CUT (GM-3)** | same defect on a staff-advance disbursement debit; same Tier-D disposition |
| `t_period_wall` | `0056:711-712` | **`before insert or update` — NOT deferred** | **C** | catchable; `(CLR19, write_into_closed_period)` |
| `t_je_immutable` | `0003:468-469` | **`before update or delete` — NOT deferred** | **C** | catchable; CLR08 propagates (never converted) |
| `t_je_stamp` · `t_je_no_truncate` · `t_snapshot_staleness` | `0003:458`, `0003:494`, `0057:1302` | plain | — | not refusal-bearing on this path |

**The extraction pattern the estate uses — kept here because GB-2 now uses it and a future B12/B13 extraction
must.** `_tf_assert_supplier_bill_shape()` (`0009:525-530`) is a two-line delegate onto a callable predicate;
the advance belt's own header (`0043:3149-3152`) states the doctrine — the test *"lives in exactly one body …
so the belt, the hook and the tie cannot drift into two readings of one window"*. **What GM-3 adds:**
extracting a predicate is not enough if the predicate reads state the approve hook has not yet written. The FA
and advance belts fail that test; GB-2's counterparty prologue passes it, because a *projection* of the
missing input can be supplied by the caller. **A3 stands as vocabulary, now Tier-D vocabulary (E.2):** both
belts raise `CLR40` with `detail = jsonb_build_object('reason', …)` — `fa_belt_unregistered_movement` ·
`fa_cost_adjustment_deferred` · `fa_k_gl_balance_on_enrolled` (`0041:2717-2736`) ·
`advance_movement_unregistered` · `advance_application_missing` (`0043:3146-3172`).

### D.2 · The chat fail-closed path — the C-3 decision record

**v2 proposed weakening `ck_wake_credentials_client_0011` (`0011:625-628`) so an `interactive` credential
could carry a client. v3 REVERSES that.** The delta review ran the reader census v2 only *promised*, and the
result kills the weakening. Recorded here as the decision record, because a later reader will otherwise
re-propose it.

| # | census finding | bytes |
|---|---|---|
| 1 | **`list_unassigned_documents` REGRESSES.** Its admission runs through `clara._agent_read_admitted`, which refuses **any** client-pinned credential on a `p_client => null` call: `if w.client_id is not null and (p_client is null or p_client is distinct from w.client_id) then return false;` | `0011:3934-3936` |
| 2 | **`coding_lane` widens SILENTLY — the decisive one.** It is the reader with **no is-not-null guard**: `if p_client is null or w.client_id is distinct from p_client then return; end if;`. For a client-less interactive credential `NULL is distinct from p_client` is TRUE, so chat gets **empty** today; a pinned credential would suddenly return rows. **Frozen `chatTurn_v12`'s answers change with no byte change** — a frozen-workflow behaviour change nothing would catch. | `0011:1570` |
| 3 | **Eight further readers flip** on the same `w.client_id is not null` shape. | census run |
| 4 | **It contradicts a deliberate, documented decision.** A **PIN BLOCKER** comment: *"interactive credentials deliberately carry client_id=NULL, so the required equality against a chat session client cannot be established in DB … the legacy interactive branch refuses closed until the interface carries a verifiable session-client authority."* | `0011:1980-1983` |
| 5 | **And it still needs the fourth change** (the frozen runtime minting, below), so it buys nothing. | — |

**The adopted shape: a NEW wake kind `interactive_client`**, joining `ck_wake_credentials_kind_0011`
(`0011:623-624`) — an **extension**, not a weakening. Its mint requires a firm-congruent active client exactly
as `autodraft` does while **keeping `on_behalf_of`** (which `autodraft` forbids — A.1 finding 7), and it
**satisfies the PIN BLOCKER's own stated exit condition** rather than deleting the blocker. **R-1, NARROW, and
verified sound at the gate:** the kind is minted for **exactly ONE call path, the fail-closed
`wake_open_question` call**, so `_agent_read_admitted`, `coding_lane` and the eight further readers are never
handed a pinned credential and findings 1-3 do not arise at all. **If chat ever goes client-scoped throughout,
that is a future decision which must re-open this table and accept findings 1-3 as deliberate behaviour
changes.** **Honest footnote:** the mint verifies **firm-congruent and active**, not that this human is
authorised for that client — the estate's existing firm-scoped model. **`wake_open_question` re-keys onto the
client pin, not the kind name** (law 27(3)).

**Roster/census surfaces — v4 listed FOUR and GB-3 found it short by two live assertions.** The four: the
allowlist counts at `0011:4170-4175` *(a historical tail that runs only at 0011's apply — but its live test
mirrors must be trued)* · `0078:255-259`'s interactive-only η census · the role map `0011:4293-4294` ·
`assert_wake_allowed`'s rows. **PR-1 trues all SIX, found by census rather than from this list** (§D.2c).
**The fourth change** — `mintWakeCredential` / `mintWakeCredentialObo` (`pools.mjs:304-312`, `:326-334`)
hardcode `"interactive"` with no client parameter, are declared at `chatTurn.v10.infra.ts:32-33` and called at
`:58`/`:66`, and that file carries **`// @frozen` on line 1** — so parity needs a **new frozen `_vN` of the
infra file, and it lands in PR-2** (§D.2c).

### D.2b · T3's mechanism, and why BL-5's implied remedy is declined (design §3.4)

BL-5 correctly locates the NULL pin in the **1-arity delegate** (`0016:3957-3961`; sales at `0016:2115-2119`)
and correctly observes that recutting it reaches the draft floor, human approve and the D-P4 probe — the three
callers its own header names (`0016:3954-3955`). **That is the expensive fix and it is declined.** Recut
instead the two **trigger functions** (`_tf_assert_supplier_bill_shape`, `0009:525-530`, and its sales twin),
resolving the pin from the entry's own post receipt:

```sql
v_pin := (select (gate_verdicts->>'extraction_id')::uuid
            from clara.entry_post_receipts where entry_id = new.id);
perform clara._assert_supplier_bill_shape_at(new.id, v_pin);   -- NULL ⇒ today's exact behaviour
```

**A human approval writes no receipt, so `v_pin` is NULL, so the delegate's null-pin behaviour is reproduced
byte-for-byte.** The human-lane blast radius is **zero by construction**, not by argument; the 1-arity
delegates are byte-untouched and leave the D1 list; the divergence closes on **both** arms. **T1 (leave
unpinned) is the named fallback**; **T2 (a txn-local GUC) stays refused** as a bypass-shaped mechanism on a
wall. **PR-0 attacked this pin SEVEN ways and refuted all seven** — ordering including Tier-C conversion after
the insert, revised-entry re-approval (approved-entry immutability breaks the borrow), the flat accessor, a
dual-source pin, RLS visibility, and fail-open on an unresolvable pin (`'{}'` reproduces today's null-pin
behaviour, which is the designed fallback semantics). Codex concurred. **It ships as designed.**

### D.2c · GB-3 — what the limb actually requires, and where each piece lands (D34)

**v4 could not have been built, and that finding STANDS whatever the schedule is.** v4 ruled *"the durable
client CHECK is untouched"* in four places (R-2 / F26) and extended only the KIND CHECK plus the
`mint_wake_credential` arms named in §D.2. Two independent lenses found that leaves the limb dead on arrival,
in two ways a builder discovers only at apply time:

1. **`ck_wake_credentials_client_0011` is itself a closed-world enumeration over the three existing
   kinds** — `(wake_kind='autodraft' and client_id is not null) or (wake_kind in
   ('interactive','proactive') and client_id is null)` — so an `interactive_client` credential is
   **unmintable** no matter what the KIND CHECK says.
2. **`mint_wake_credential` carries a SECOND kind gate ABOVE the arms §D.2 says to extend** — the early
   `p_wake_kind not in ('interactive','proactive','autodraft')` raise at `0011:1163-1165` — so extending
   only the cited arms leaves every mint refused **`bad wake_kind`**.

Both push a builder toward exactly the durable-CHECK weakening C-3 reversed, which is why this was a blocker.
**PR-0 resolved it by severance; the OWNER OVERRODE that half on 2026-08-22 (D34) and chat parity rides the
main train** — the correction below is what makes that buildable, and **R-1's narrowing was separately
verified SOUND**, so the design shape is unchanged.

**The build steps, and where each lands.** **PR-1 (a): extend BOTH CHECKs and BOTH mint gates.** The kind
CHECK gains the name; the client CHECK gains a **third disjunct**, `or (wake_kind='interactive_client' and
client_id is not null)`, with the three existing disjuncts byte-identical. Both are drop+add and **validate
trivially over existing rows**, which the rig proves. The PR says against C-3's record that *extending an
enumeration is not weakening the client binding* — C-3's reversal was about letting a **plain `interactive`**
credential carry a client, which this does not do, and no existing credential's semantics move. **PR-1 (b):
true all SIX roster/census surfaces**, found **by census, not from §D.2's list of four**, which was short by
two live assertions. **PR-1 (c): the closed-world cell that `interactive_client` holds EXACTLY ONE allowlist
row** — a second row is how this kind would quietly become a posting kind — plus `wake_open_question`'s re-key
onto the client pin. **PR-2: the new frozen `_vN` of `chatTurn.v10.infra.ts`**, minting the pinned kind for
`wake_open_question` ALONE (R-1).

### D.3 · OQ-4's re-derivation trigger, in mechanism (design §3.3.3)

**The ruling.** A8 stands — unattended posting is the agent's own **untouched** derivation only. The
**forbidden middle** is pass-through of human numbers under agent identity with nobody's approval on record.
Two exits are open.

**Exit 1 — the human posts it, under human identity.** Their own chat or review-queue approval on the ordinary
`approve_entry` path, byte-untouched by this design. The right exit whenever the human is confident in their
own edit, and the fast one.

**Exit 2 — the agent re-derives and posts her own conclusion, under agent identity.** The human's edit is
lawful **context input** (law 73), not an instruction; her rationale cites the suggestion she weighed and the
numbers are hers.

**The trigger — CORRECTED AT THE GATE (GM-10), because v4's claim was false at the bytes.** A human revision
*is* observable (`revise_entry` sets `last_human_editor`, rotates the token and emits `entry.revised` —
`0016:4909-4913`, `:4937`), **but `entry.revised` re-admits nothing**: no coding-lane reader keys on it. And
once the human's draft is withdrawn — which the double-coding wall makes a precondition for exit 2 — a fresh
sweep on that filing is **refused `already_done` by the gate `0053` installed on purpose** to stop duplicate
sweeps. **So exit 2 has no mechanical door today.** The door is a **named PR-2 design obligation**: a
deliberate, audited re-admission after withdrawal that does **not** weaken `0053`'s duplicate-sweep gate, with
C.14's paired cell (the re-read happens; the ordinary repeat sweep is still refused). **The ruling is
untouched — what changed is that the mechanism is work, not an existing capability**, and pretending otherwise
would have shipped a ruled exit nobody could take.

**The constraint that shapes exit 2, and it is load-bearing.** She cannot post into the human's draft (A8),
**and she cannot draft a competing one either**: the **double-coding wall** refuses a second coded entry
against the same filing (`0016:4011-4017`, with the unique-index catch at `:4093-4096`, `CLR21 double_coded`).
So **exit 2 becomes available only once the human's draft is withdrawn**. That is the honest shape rather than
a limitation to route around — while a human's numbers are live on a document, the only person who can approve
them is a human.

**The branches.** On re-read the agent **agrees** with her original derivation → after the withdrawal she
drafts and posts her own entry, rationale citing the human's suggestion. She **disagrees** → a typed open
question naming the divergence, or the document simply stays in the human lane. Cells: C.2 carries both exits,
and the forbidden middle is what A8's cell refuses.

### D.4 · The context-pack patterns block, in mechanism (design §3.6)

**The splice.** `clara.get_context_pack(uuid,text)` is base (`0016:4262-4350`) + four dynamic splices; F-A2
adds a **fifth**, contributing one client-scoped, budget-capped block:

```
'approved_coding_patterns' →  (counterparty_id, coding_kind, account_code, side,
                               n, first_seen, last_seen)
   over journal_entries ⋈ journal_lines
   where client_id = … and status = 'approved' and reversed_by is null
```

**Recomputed on read, not accrued — and that is the design decision, not an implementation detail.** This is
precisely the aggregate `clara.rule_sightings` accrued (`0011:843-862`, `side` added at `0016:57-62`) and
precisely what the ≥3-distinct-entry threshold bred rules from (`0037:2067-2099`). Recomputing it therefore
**removes a write from the approve core** — the sighting insert dies with the breeding block rather than being
preserved as a vestigial accrual — and it **cannot drift from the books**, because there is no second copy to
drift. Two consequences worth stating: the block **moves when an entry is reversed** (C.10 asserts it), and
the historical `rule_sightings` / `coding_rules` rows, though KEPT as data, **are not read by the pack** —
they are a frozen corpus superseded by the recomputed aggregate, and reading both would mean learning twice
from the same events.

**Splice discipline, non-negotiable.** The tail at `0036:1826-1850` asserts that **every** post-0016 surgery
marker survived — `sst_registration_watch`, `'wiki'`, the two `bound_scope_*` strips, `stale_at`,
`has_stale_sources`, plus an exact-count check on `'msic'`. F-A2's splice **adds its own marker to that list
and re-asserts the prior five**, under the estate's anchoring rule: **exactly one match, and a changed
result** (`0018:452-461`, `0019:1019-1032`). A splice that matched twice, or that matched and changed nothing,
is the failure mode the anchor discipline exists to catch.

**The law-73 line, restated where the mechanism lives.** `get_context_pack` reads wiki (`0017:5017-5060`) and
now reads approved history; **neither may ever be read by a gate, bound or floor.** `WB_AUTHORITY_FNS`
(`wb-helpers.mjs:212-226`) is the mechanism that proves it, F-A2 extends it with the three new post-path
verbs, and `get_context_pack` stays off it. C.10 and C.11 carry the cells.

### D.5 · Every wake-kind-keyed wall, with a disposition (replaces v1's D10 "law")

| site | what it keys on | disposition |
|---|---|---|
| `0046:2687-2696` | `not p_is_human and p_wake_kind='autodraft'` — the direction-family arm | **RE-CUT to `not p_is_human`** (the narrow verified claim; its postcheck marker is `0046:3193`) |
| `0011:1178-1186` | `mint_wake_credential`'s autodraft/legacy arms | **EXTEND, in PR-1 (D34).** A new `interactive_client` arm **and the early kind gate at `0011:1163-1165` above it** — GB-3's second failure mode; autodraft's "no `on_behalf_of`" untouched (§D.2c) |
| `0011:1990-1995` | `wake_open_question`'s kind arm | **RE-KEY onto the client pin, in PR-1** — admitting `autodraft` and `interactive_client` and still refusing anything unpinned (§D.2c) |
| `0011:625-628` | `ck_wake_credentials_client_0011`, the durable client-binding CHECK | **EXTENDED, in PR-1 — v4's "untouched" ruling is WITHDRAWN.** GB-3 showed this CHECK is itself a closed-world enumeration, so leaving it alone makes the kind unmintable. PR-1 adds a **third disjunct** and leaves the other three byte-identical: an extension, not the C-3 weakening (§D.2c) |
| `0004:673-677` | `wake_record_notification` consumes a **`proactive`** credential single-use | **STANDS** — single-use is the proactive kind's defining property, unrelated to posting |
| `0046:2676-2686` | the counterparty-kind arm, `not p_is_human` alone | **STANDS** — already lane-correct |
| `0011:4170-4175` | a migration tail asserting exactly 6 autodraft allowlist rows | **STANDS** — a historical tail that runs only at 0011's apply; **but any live test mirroring the count must be trued when `wake_post_entry` joins** |
| `0078:255-259` | a census asserting the η wrappers are interactive-only | **STANDS** — its function-name list does not include `wake_post_entry` |

### D.6 · GB-2's projected-state predicate, in mechanism (design §3.2, B10/B11)

**The defect, at the bytes.** `_assert_supplier_bill_shape_at`'s live tip (`0036:601`) opens with a prologue
at **`0036:619-626`** raising CLR23 — *"every control-class line requires a counterparty"* (`0036:625`) —
**before its kind gate**, on **any** control-class line with a NULL `counterparty_id`, **receivable
included**. The counterparty is stamped **inside** the delegate (`0037:1884-1888`), the ladder runs **before**
delegation, the caller cannot supply one (`0009:294-297`, `0016:4100-4105`), and the one draft-time stamp
(`0028:1361-1369`) is vendor-binding-gated. **Every agent sales draft therefore has a NULL-counterparty
receivable leg, so a naive B10 refuses 100% of sales posts — with the SUPPLIER token — and §3.4's draft copies
would regress today's working draft path.**

**The fix, in the estate's own idiom.** Extract the prologue into a callable projected-state predicate —
`clara._assert_control_leg_counterparty_at(p_entry uuid, p_projected uuid)`, evaluating
`coalesce(l.counterparty_id, p_projected)` over the control-class lines — and make
`_assert_supplier_bill_shape_at` a **thin delegate passing NULL**, reproducing today's behaviour byte-for-byte
(the `0016:3957-3961` pattern PR-1 already uses twice). **The ladder resolves the projection from
`proposed_counterparty` the same way the delegate will**, so B10/B11 judge the state the post is about to
create rather than the state it starts from; §3.4's draft copies get it free, since `v_fingerprint` is already
in hand at `0028:1310-1316`. **B12/B13 do NOT share this defect** (neither belt reads line counterparty) —
they were cut for a different reason (GM-3).

**Fallback, if the width ruling is ever re-opened:** drop the pre-checks entirely — the floors still run
inside the delegate at commit, so the cost is evidentiary (a Tier-D abort instead of a typed receipt), **not
safety**. **PR-1's replay confirms the premise** (gate §7).

### D.7 · GM-7's lock ordering — why B9 is not a typed pair (design §3.2, Tier A)

**The estate already closed this window, on three locks:** the filing `FOR SHARE` (`0011:1924-1931` vs
`0007:987-993`), the **vendor advisory `203005003`** and the **client advisory `203005004`** (`0011:1939-1942`
vs `0037:1909-1913`), with the intent in words at `0011:2988-2995` — ***"No check-then-act window."*** v4's B9
read `_open_question_blocks` (`0012:87-108`) **before any of them**, re-opening exactly that window; the
delegate's own CLR26 re-check (`0037:1909-1920`) would then fire on a race and land **unlisted**, its detail
carrying `question_id` and `scope` but **no `reason`** — so it could not be a Tier-C pair without a body edit
anyway.

**The fold is lock ordering, not a typed pair.** Tier A acquires all three before B9: the filing lock through
the **LOCKING overload** of `_active_document_filing` (`0007:982`), the **client advisory immediately after
the entry `FOR UPDATE`**, and the **vendor advisory** through a callable extraction of the delegate's
canonical-counterparty derivation. With them held **CLR26 is provably unreachable from this lane**, and law 31
forbids listing a wall that can never be asked — E.2 records that disposition explicitly rather than leaving
it an absence.

**The named fallback, if the vendor-lock extraction widens PR-1 too far:** take the filing and client locks
only and list **`(CLR26, open_question_race)`** as a Tier-C pair, which costs a `reason` added to the raise at
`0037:1918`. That is a real behavioural difference — a race becomes a typed refusal instead of being
impossible — so it is a decision, not an implementation detail. **C.4 carries the two-session race cell either
way**, and **PR-1's replay must confirm the three locks suffice** (gate §7). *(Review honesty: one verifier
refuted this on population grounds and was outvoted by two byte-grounded confirmations. Rarity is not
unreachability.)*
