# F-A2 Windows A+B — the combined ceremony, as run (2026-08-21)

**The ceremony of record for the F-A2 opener train's activation.** Run from merged `main`
@ `7f5617e0` (frontier 0102), ~**10:56–11:02 MYT (UTC+8)**, 2026-08-21. Live moved
**92/`0097_f_a1_cutover` → 97/`0102_f_a2_statement_activation`**; runtime **v65 → v66**.

The corpus re-measure that this window existed to unblock ran immediately after and is §9-§12
below, so the ceremony and its acceptance evidence sit in one file rather than two.

> **What was live before this window, and why that matters to every number here.** The whole
> five-PR opener train (#270 `a36044bb` · #271 `e330f421` · #273 `90073b14` · #272 `c695a675` ·
> #274 `7f5617e0`) was merged and **none of it was live**: five migrations unapplied, the v2
> image undeployed. Every "fixed" behaviour was a repo fact until this window made it a live one.

---

## 1 · THE DEVIATION OF RECORD — Windows A and B were COMBINED

The plan of record was **two windows**: A applies `0098`-`0101` and deploys the v2 image; B,
later, applies `0102` and repoints the statement registry. **They were run as ONE window.**

**The grounds, stated before the run and not rationalised after it.** The split existed to keep
a half-built train from sitting live. By ceremony time the train was **fully merged** — `0102`
and its runtime repoint were already on `main` — so a split no longer separated *risk*, it
merely created a **stall gap**: a period in which the statement lane would be live on the new
router with the old registry pointer, i.e. exactly the interim architecture split F-A10 exists
to prevent, held open for no purpose.

**What the combination did NOT relax, each verified in this run:**

- **Both evaluator/registry flips were independently reviewed** before the window, not merged
  into one judgement call.
- **The machine stayed STOPPED across BOTH the apply and the repoint deploy** — `0102`'s own
  spec names that as the one gap with no DB-side guard, and combining the windows makes the
  stop *longer*, never weaker.
- Every per-window positive read below was executed **for both windows' content**, not once.

**Cost accepted:** a single longer write-quiesce (≈6 minutes) instead of two short ones.

---

## 2 · Backup banked FIRST

| | |
|---|---|
| Bundle | **21,893,589 bytes** |
| Destination | `r2:clara-dr/db-snapshots/2026/2026-08-21T02-48-39-153Z` |
| Exit | **0** |

Backup-first is not a formality here: this window applies five migrations including two
writer-body replacements and a router re-key. Nothing else in the run proceeded until this
returned 0.

## 3 · Pre-window PROCESS reads — and the instrument failure the positive control caught

The four F-A2 knobs were read **from inside the running VM** (`printenv`), never from an
app-level `fly secrets list` — the ζ-law: an app-level read reports what was *staged*, not what
the process *has*.

| Read | Expected | Got |
|---|---|---|
| The four F-A2 knobs | **UNSET** (pre-window) | **UNSET** ✅ ×4 |
| `CLARA_STORAGE_ROLE` (positive control) | **SET** | **SET** ✅ |

**The positive control earned its keep, immediately.** The first pass of the read instrument
returned "unset" for **all five** variables — including `CLARA_STORAGE_ROLE`, which is known to
be set. That is the tell: a read that cannot say YES cannot be trusted when it says NO. Cause:
**`$`-expansion** — the variable names were being expanded by the *local* shell before reaching
the VM, so the remote `printenv` was handed empty strings and dutifully reported nothing.

Had the control not been in the set, four genuine "UNSET" readings would have been banked from
an instrument that was structurally incapable of reporting anything else. Fixed by quoting the
remote command, re-run, and the table above is the corrected read. *(This is the
`a-probe-that-cannot-say-NO` law firing in its mirror form: a probe that cannot say YES.)*

## 4 · The pre-quiesce tripwire — ALL-PASS, and one clean abort

The tripwire runs **before** the machine stops, so a refusal costs nothing.

| Check | Result |
|---|---|
| Live frontier is the expected pre-window state | **92 / `0097_f_a1_cutover`** ✅ |
| Extraction backlog drained (no `queued`/`running`/`held_egress`) | **empty** ✅ |
| Migration set matches the merged-`main` expectation | ✅ |

**One abort, at zero cost.** An earlier tripwire attempt died on a **module-resolution error in
the instrument itself** — and it died **BEFORE any stop**, which is the entire design intent of
running the tripwire ahead of the quiesce. No downtime, no partial state, no rollback needed.
Fixed, re-run, ALL-PASS. Recorded because "the tripwire aborted" reads alarming in a log and the
distinction between *aborted before the stop* and *aborted mid-window* is the whole story.

## 5 · The apply — 5 migrations, 92 → 97

Machine **STOPPED**. Applied from merged `main`:

| # | Migration | Content |
|---|---|---|
| 1 | `0098_f_a1_statements.sql` | the statements persist half (shipped UNPOINTED at #268) |
| 2 | `0099_f_a2_nil_tax_arm.sql` | the three live-body recuts |
| 3 | `0100_f_a2_nil_tax_arm_part2.sql` | `evaluate_witness_fact_state_v2` + answers vocabulary + engine `:v2` |
| 4 | `0101_f_a2_witness_readers.sql` | the witness-first reader estate — the lifted generation selector, ~12 bodies |
| 5 | `0102_f_a2_statement_activation.sql` | the statement activation: router re-key + typed-consent re-key |

**Result: 97 migrations, frontier `0102_f_a2_statement_activation`. Every tail notice green.**

## 6 · The positive-read probe — 20/21, and the one red owned as a PROBE DEFECT

| | |
|---|---|
| Probe assertions | **21** |
| Passed | **20** |
| Red | **1 — adjudicated a PROBE DEFECT, not a migration defect** |

**The red, and why it is the instrument's fault.** The failing assertion tested a **comment
string** inside an installed body — an over-strict equality against prose that the migration had
legitimately re-worded. The body's *behaviour* was verified independently by the other
assertions in the same group and by the rig replay that preceded the ceremony.

**This has a precedent and it is deliberately followed here:** the B3 ceremony
(`docs/plan/completed/b3-reopen-ceremony-asrun.md`) owned two probe instrument defects in-line
rather than either suppressing them or treating them as apply failures. **A probe that asserts
on prose is asserting on the wrong thing** — spelling is not identity (evidence law 3). The
assertion is a candidate for re-cutting onto a catalog fact; recorded, not silently dropped.

## 7 · The evaluator flip and NOTIFY

| Step | Result |
|---|---|
| `clara.evaluator_versions` deployed count | **4/4 → 5/5** ✅ |
| `NOTIFY pgrst, 'reload schema'` | issued ✅ |

The fifth is `evaluate_witness_fact_state_v2`. Its manifest deploy-lock was granted at this
ceremony's close — see §14.

## 8 · The `0102` coverage probe SAID NO — as designed — and the adjudication

`0102`'s consent-coverage probe is a **per-client set difference**, deliberately built so it can
report a NEGATIVE. A global count cannot: it would have said "consents exist" and told us
nothing about *which* clients lack one.

**It reported 1 uncovered client**, and that is the probe working, not failing.

| | |
|---|---|
| Uncovered client | firm **`39008536`** |
| Identity | **ROME PUBLIC ADVISORY — the synthetic sandbox tenant** (ADR-0045; hard constraint 13) |
| Adjudication | **ACCEPTED** |

**Grounds.** `39008536` is the Gate-S synthetic sandbox, not a real client — there is no real
counterparty whose statements need a typed `witness_extraction` consent, and manufacturing one
would be inventing a consent nobody gave. It is also **already ruled out of the future**:
ADR-0072 ⑤ ruled the Wave-G factory reset a whole clean product database with **the sandbox firm
NOT re-created**, so this row's uncovered state is terminal by decision rather than by neglect.

**Stated plainly so a later reader does not re-derive it:** the probe's one NO is the sandbox,
every real client is covered, and the gap closes by the sandbox ceasing to exist.

## 9 · Runtime v66 — deployed, and verified by PROCESS read

| Check | Result |
|---|---|
| Release | **v66** ✅ |
| `GET /ready` | **HTTP 200** ✅ |
| Zombie pooler sweep (post-restart, per the runbook) | **0 sessions** ✅ |

**In-VM bundle greps — the positive-read law's second leg, executed rather than assumed:**

| Grep, inside the running VM | Count |
|---|---|
| `witnessFacts_v2` | **8** ✅ |
| `statementFacts_v2` | **1** ✅ |
| reconciler lane-pacing | **present** ✅ |
| the witness adapter timeout knob | **present** ✅ |

That is riders ③ and ④ crossing from merged to live in the same read, and the v2 workflow pair
proven present in the **bundled server output** — the load-bearing copy, not just the lib copy.

**The zombie sweep returned 0**, which is itself the runbook working: the stop was graceful, so
there were no orphaned `clara_runtime_login` sessions to reap. The step is cheap and idempotent
and was run anyway rather than reasoned about.

## 10 · Ceremony hygiene

- The DSN was captured **env-to-env** from a `clara-backup` sleeper machine, **never printed,
  logged or persisted**; **the sleeper was destroyed at close**.
- No pinned id was written or approved (canary `daba7f2e`, witness `d023b48c` — untouched).
- The two stranded `failed_retry` documents were not touched in this window.

---

# THE RE-MEASURE

Run immediately after the window, on the live project at frontier `0102` with runtime v66.
**Population: 20 documents — the owner-ruled sample (ADR-0072 ①.2) of the 33 measured in
`docs/plan/completed/f-a1-corpus-measurement.md`.**

## 11 · The three numbers

| | count | of 20 |
|---|---|---|
| **ARM-CORROBORATED** (`corroborated=true` ∧ `tax_basis='presumed_non_registrant'`) | **12** | 60% |
| **PLAIN-CORROBORATED** (`corroborated=true`, no `tax_basis`) | **0** | 0% |
| **REFUSING** (failing conjunct named per document) | **8** | 40% |

**Corroborated overall: 12 / 20. Under v1, this same 20 scored 0 / 20.**

### THE DENOMINATOR RULE — this travels with every number above

**20 is a SAMPLE of the 33, not the corpus. `12/20` is NOT comparable to `0/33` unless it says
so**, for two reasons that both bias the sample *downward*:

1. **The sample is deliberately refusal-heavy.** Selection forced in **all four** predicted
   refusals. Those are 12% of the 33 but **20% of this 20**.
2. **It over-weights the plain (tax-printed) class** — 4 of the corpus's 6 plain documents are
   here, and that class scored **0/4**.

**What can honestly be said: the same 20 went 0/20 → 12/20. That comparison is like-for-like
and is the real result.** A corpus-wide extrapolation would be an inference, not a measurement —
and one input is already known adverse: the two EZSEC documents here both refused on a currency
answer, and the two undriven EZSEC documents share that issuer and layout.

## 12 · Prediction accuracy — 14/20, with every miss named

Predicted 16 pass / 4 refuse. **Actual 12 pass / 8 refuse. Per-document class hit-rate 14/20.**
Class A (refusals) 3/4 · Class B (arm) 11/12 · Class C (plain) **0/4**. Arm sub-case split among
the 12 passes: **11 × sub-case (b), 1 × sub-case (a)**.

**Four of the six misses share two causes lying entirely OUTSIDE the three-locks arm** — belts
carried verbatim from v1 that this corpus had never exercised.

| Miss | Predicted | Actual | Cause |
|---|---|---|---|
| `aaf31fd6` BODY CHECK | REFUSE | **ARM** | **Flipped, as the spec flagged it might.** The v2 re-read found `invoice.total = RM900.00` on both channels *and* a printed `total_excl_tax`, so it takes **sub-case (a)**: net printed and cited, tax derived 0, identity `900 + 0 = 900` — a real arithmetic check, not a presumption. |
| `bd6d37fb` KONG CHENG | ARM | **REFUSE** | **sub-case (b) derivation withdrawal.** `invoice.discount = value(200.00)` on **both** channels with no printed net. Not a prediction-logic error — a **changed read**: v1 reported no discount, so the pre-freeze count never listed it. The direction is the safe one (refuse rather than derive a net around a printed discount). |
| `616388d4` · `aa8d2010` EZSEC | PLAIN | **REFUSE** | **The MYR evidence conjunct** — see §13 finding 1. |
| `509e788d` · `d3732397` BRIGHTPATH | PLAIN | **REFUSE** | **The per-field agreement conjunct**, on a printed dash — see §13 finding 4. |

### The three results that mattered most

**1 · Opener ② delivered, and it was the bundle's hard floor.** `type_code` answered **`'01'` on
19/20** and **`'03'` on the twentieth — which is CORRECT**: that document is a debit note
(`DN-2509001`). The prediction's "HARD FLOOR IF OPENER ② MISSES: 0/33" is comprehensively
cleared, **and the fix is correct rather than merely permissive** — it did not simply learn to
say `'01'`.

**2 · Lock 3 fired on the genuine registrant, via R7's corpus-calibrated label family.** The
corpus's only true SST registrant (`5174df8a`) was caught by its **text** channel answering
`value("Nombor Pendaftaran ST W10-1808-31022372")` — the exact GST-era string a spelling-based
prompt was predicted to miss. **The false presumption did not fire.** Across all 40 rows this is
the only `value` answer for `invoice.sst_registration`; the other 39 answered `not_printed`.
*(That document refused on two further independent grounds as well: `type_code='03'`, and a
cross-channel disagreement on `total_excl_tax`.)*

**3 · The infrastructure was vindicated.** **19 documents fired at once**, 40 model calls,
20/20 complete pairs, all settled within ~225 s at 2-slot lane concurrency. **Zero terminal
failures, zero timeouts, zero stragglers, zero CLR16.** This is the same lane that in the F-A1
run produced 7 infrastructure casualties and four 30-95-minute hangs — riders ③ and ④ held
under the heaviest load yet put on them, on their first live outing.

**Receipts: 40/40 complete.** `truncated=false` on all 40 rows including the 7-page (1092
regions) and 4-page (777 regions) documents; `regions_shown = regions_total > 0` on all 20 text
rows; `input_sha256` well-formed on all 20 vision rows; **`downgraded_fields` empty on all 40** —
zero downgrades in the whole population, so lock 3's downgrade terms were never the deciding
factor anywhere. **Op keys:** `fa2-remeasure-reext-<docid8>`, 20 of them, each fired exactly
once; `request_reextraction` was the **only** writer verb invoked.

## 13 · Findings for the next round

1. **THE MYR EVIDENCE CONJUNCT REFUSES GENUINELY-MYR DOCUMENTS (2/20).** Both EZSEC documents
   answer `invoice.currency = value("RINGGIT MALAYSIA")` on both channels. The rule reduces the
   raw to letters and demands membership in `('RM','MYR')`; `'RINGGITMALAYSIA'` lands outside it.
   `explicit_non_myr` is `false` — the document is not judged foreign, it is judged **unproven**.
   This is a v1 belt carried verbatim, so **not an F-A2 regression** — but it is now the largest
   single measured refusal cause outside the arm, **and it is a FALSE refusal.** Every other
   conjunct was read individually on both documents and each holds; the MYR term is the sole
   failing one. **Recommended fix: the PROMPT side** (ask for the currency *code*, not the
   printed rendering) — the non-frozen half. **The evaluator's strictness is the property worth
   keeping**, and widening it would be a frozen-evaluator change needing its own version and
   ceremony.
2. **LOCK 3'S MARGIN ON THE ONE GENUINE REGISTRANT WAS A SINGLE CHANNEL.** Text caught the
   number; **vision answered `not_printed`** on the same document. The conjunction saved it
   exactly as designed, but the residual "a document both channels miss" is no longer
   hypothetical-in-kind. **Recommend a targeted vision-prompt check against the bare
   `[A-Z]\d{2}-\d{4}-\d{8}` SST id shape.**
3. **`coverage.pages` IS EMITTED EMPTY ON EVERY TEXT ROW (20/20).** The key is present and typed
   as an array, and **no lock reads it** — verified against the live
   `evaluate_witness_fact_state_v2` body, whose L1 reads five things and `pages` is not among
   them — so nothing fails closed because of it. But it carries no information, and a field that
   always says `[]` **cannot later be promoted into a lock without first being fixed**; a future
   reader could also mistake it for evidence of a zero-page read. **Fix in the v2 behavior
   (non-frozen), or drop the field — before anything reads it.**
4. **THE TWO CHANNELS DISAGREE ABOUT PRINTED NIL-MARKERS.** Vision reports a bare `-` as
   `state:'value'`; text reports `not_printed`. A state mismatch sets `v_agree_ok := false`
   unconditionally, so **both BRIGHTPATH documents refused on the agreement conjunct** — carried
   from v1, nothing to do with the arm. `509e788d` additionally carries a rounding **sign**
   disagreement (text `+0.40` region-verified, vision `- 0.40`). **Recommended prompt
   clarification:** a dash, em-dash or `NIL` in an amount column is not a printed amount —
   answer `not_printed`. *(Quiet second vindication of lock 2's two-channel conjunct: under v1
   the split ran the other way, and what the channels actually disagree about is how to read a
   printed nil-marker, not whether tax exists.)*
5. **THE SUB-CASE (b) COST IS 3 ON THIS SAMPLE, NOT 2.** All three are discount-printers with no
   printed net (`f48a8830`, `6f82065e`, `bd6d37fb`) — all ROME SECRETARY / D&D-family invoices.
   **The pre-freeze count under-read this class, and the on-file owner trigger question's number
   is trued to 3 here.** Whether sub-case (b) should admit a printed discount (net := total +
   discount, where discount is the only component) is **the owner's question, not this run's
   recommendation** — making that change would be the evaluator inventing document structure,
   which the design explicitly forbids.

---

## 14 · The deploy-lock (law 50's closing act)

Run locally from merged `main` at the ceremony's close — **refused under CI by design**, and
never granted by `--update`.

| Manifest | Locked | Hash changes |
|---|---|---|
| `frozen-evaluators.json` | **1** — `clara.evaluate_witness_fact_state_v2` | **0** |
| `frozen-workflows.json` | **24** — the autoDraft v8 / chatTurn v12 / witnessFacts v1 set now live under v65-v66, plus **witnessFacts.v2** and **statementFacts.v2** | **0** |

**Zero unlocked entries remain in either manifest.** The `frozen-workflows.json` diff is
`deployed` flags and the trailing-comma reflow they cause — no body hash moved, which is the
only shape a lock should ever have.

**The reviewer's follow-up, answered:** `check-frozen-workflows.mjs` **does** support
`--lock-deployed` (it is not evaluator-only) — so it was run rather than recorded as a gap.

`evaluate_witness_fact_state_v2`'s manifest note was trued in the same commit: it described the
lock in the future tense ("UNDEPLOYED … granted by the `--lock-deployed` ceremony AFTER the F-A2
window"), which this ceremony made false.

## 15 · Deviations register

| # | Deviation | Grounds |
|---|---|---|
| 1 | **Windows A and B COMBINED into one** | The fully-merged train made a split window create a stall gap rather than separate risk (§1). Both flips independently reviewed; machine stopped across both; every positive read executed for both windows' content. |
| 2 | **One probe assertion RED, adjudicated a probe defect** | An over-strict equality on a re-worded **comment string**, not on behaviour (§6). B3-ceremony precedent for owning instrument defects in-line. Candidate for re-cutting onto a catalog fact. |
| 3 | **The `0102` coverage probe reported 1 uncovered client** | The synthetic sandbox firm `39008536`, ACCEPTED (§8) — no real counterparty, and ADR-0072 ⑤ already rules it out of existence at the Wave-G reset. |
| 4 | **A tripwire attempt aborted before the run** | A module-resolution error in the instrument, **before any stop** — zero downtime, which is precisely why the tripwire runs pre-quiesce (§4). |
| 5 | **The first PROCESS-read pass was invalid** | `$`-expansion by the local shell; caught by the positive control returning a false negative (§3). Re-run after quoting. |

## 16 · What is now live, and what is not

**LIVE:** frontier **97/`0102`** · runtime **v66** · `evaluate_witness_fact_state_v2` deployed
and locked · witnessFacts.v2 prompts · the witness-first reader estate · statementFacts_v2
repointed with the statement router re-keyed · riders ③④ in the bundle.

**NOT live, and unchanged by this window:** **F-A2 proper has not been built.** The unattended
posting lane (`wake_post_entry`, the four-tier ladder, `entry_post_receipts`, the breeding
excision) is designed, ruled and unbuilt — PR-0..PR-4 still to come, over two further D1
windows. Every invoice that now corroborates carries an **unattended-eligible ticket that
nothing yet redeems**: the documents route to the human-confirm draft lane exactly as before.

**The one honest caveat on the headline number:** 12/20 measures the *witness verdict*, not a
posted entry. Nothing in this window posted anything.
