# F-A2 PR-0 — the gate record

> **The gate ran 2026-08-21/22** against design **v4** (`f-a2-agentic-posting-design.md` +
> the three annexes). Two legs, per §5 step 1: the **independent judgement-logic review**
> (law 1) — eight fresh-context lenses, every finding adversarially verified by an
> independent verifier — and the **cross-model adversarial pass** (law 28) — GPT-5.6-sol,
> read-only, four findings, each re-verified by an independent Claude lane at the bytes.
> **Verdict: the design's SEAMS hold; three blockers and eleven materials bind the build;
> PR-1 is severed.** Every finding below names its fold target; **the fold is v5's change
> log entry and this file is its spec.**
>
> Every claim here was grounded at file:line by at least one verifier that did not author
> the design. Standing caveat unchanged: migration-source reads are predictions about the
> live catalog; PR-1's rig replay confirms the decisive bodies (`_draft_entry_core`,
> `_assert_supplier_bill_shape_at`, `_assert_sales_invoice_shape_at` — all splice-reached).

## 1 · What was attacked and HELD (clean bills on attacked surfaces)

- **The S1 seam** — wrapper → ungranted core → shared 8th body. Both models judged it
  preferable to S2/S3 independently; no call sequence posts a draft that should not post;
  the grant split leaves no alternate entry point. **Ships as designed.**
- **T3's receipt-keyed pin** — all seven attacks REFUTED (ordering incl. Tier-C
  conversion after the insert; revised-entry re-approval — approved-entry immutability
  breaks the borrow; the flat accessor; dual-source pin; RLS visibility; fail-open on an
  unresolvable pin — `'{}'` reproduces today's null-pin behaviour, which is the designed
  fallback semantics). Codex concurred. **Ships as designed.**
- **Concurrency / rollback / replay** — the entry `FOR UPDATE` serializes competing
  posts; Tier-C subtransaction rollback removes partial writes (counterparty births
  included); `_reserve_op` gives one durable outcome.
- **The three owner rulings' mechanical translation** — OQ-1 threshold-free, OQ-4's exits
  mechanically distinct (one door defect, GM-10), OQ-6 not re-gated anywhere.
- **Post-ceremony drift** — `0102` and runtime v66 touch nothing on the D1 list; the
  queued witnessFacts-v3 prompt fixes do not collide with PR-2's freeze plan (they ride
  their own lane; the §7 non-goal boundary is honest).
- **The retirement inventory** — the verbs-not-names sweep re-run independently found the
  ~118-site census exact but for one surface gap (GM-11) and a batch of cite drifts (§5);
  the sweep re-runs as a PR-3 obligation before the cells-floor number is set.

## 2 · Blockers — the build may not start until each is folded

**GB-1 · The generic lane posts a directional document with the liability suppressed.**
*(Codex F-1, PARTIALLY-CONFIRMED blocker + native lens convergent.)* A corroborated
supplier invoice drafted `coding_kind=NULL` as `Dr Expense / Cr Bank` passes **all
fourteen rungs** (walked rung-by-rung; B10/B11's kind gates are inert on NULL —
`0036:627`, `0022:726-731`; B14 refuses only entries that HAVE a control leg; B5 is
vacuous — the `amount_exception` stamp is kind-gated at `0016:4131`). **No wall ties
`coding_kind` to the bound document's direction**, and `coding_kind` is a model-supplied
input — so the kind SELECTS which walls bind. OQ-5 priced refusal costs; this admits a
**wrong post** (phantom payment, suppressed payable) and is priced nowhere. Chat is
direction-blind today (`chatTurn.v12.tools.ts:292` + the double-gated `0046:2687-2688`
arm); on autoDraft the hole opens exactly where direction is least certain
(`autoDraft.v8.tools.ts:276-296` refuses coded kinds on unresolved direction — only
generic would pass unchecked).
**Fold: a new Tier-B rung** — a NULL-`coding_kind` entry may not anchor to a document
whose direction resolves (`_autodraft_direction_tri` ∈ sales/purchase), token
**`generic_on_directional_document`**. Lives in the ladder (covers both lanes; the 0046
arm is autodraft-gated). This keeps D18 intact — generic stays in the unattended lane for
genuinely generic / direction-unresolved documents — and makes B14 coherent (a
directional invoice NEEDS a control leg; B14 forbids generic ones; so generic-on-
directional was always a contradiction). autoDraft_v9's enum widening must extend
`allowedCodingKindsForDirection` **deliberately**, stated in PR-2. New C.14 cells: the
suppressed-payable fixture refuses at the new rung; a direction-unresolved generic still
posts when tied.

**GB-2 · B10/B11 (and the §3.4 draft copies) falsely refuse on pre-stamp drafts —
the agentic sales lane would be 0% functional.** *(Codex F-2 CONFIRMED + native
convergent.)* `_assert_supplier_bill_shape_at`'s live tip (`0036:601`) raises CLR23 at
`0036:619-626` — **before its kind gate, on any control-class line with NULL
`counterparty_id`, receivable included**. Stamping happens inside the delegate at
`0037:1884-1888`; the ladder runs before delegation; the caller cannot supply a
counterparty (`0009:294-297`, `0016:4100-4105`). Every agent sales draft has a
NULL-counterparty receivable leg (the one draft-time stamp, `0028:1361-1369`, is
vendor-binding-gated). So B10 refuses 100% of sales posts — with the SUPPLIER token —
and the §3.4 draft copies would regress today's working draft path outright.
**Fold:** extract the `0036:619-626` prologue into a callable projected-state predicate —
`_assert_control_leg_counterparty_at(p_entry, p_projected uuid)` evaluating
`coalesce(l.counterparty_id, p_projected)` — the existing floor becomes a thin delegate
passing NULL (the `0016:3957-3961` pattern PR-1 already uses twice). The ladder resolves
the projection the same way the delegate will; the draft copies get it free
(`v_fingerprint` in hand at `0028:1310-1316`). Fallback if PR-0's width ruling is
re-opened: drop the B10/B11 pre-checks — the floors still run inside the delegate; costs
the pre-check, not safety. **B12/B13 do NOT share the defect** (neither belt reads line
counterparty) — but see GM-3.

**GB-3 · The `interactive_client` limb cannot be built as written.** *(Two independent
native lenses, convergent.)* v4 rules "the durable client CHECK is untouched" in four
places (R-2/F26) — but `ck_wake_credentials_client_0011` is a **closed-world enumeration
over the three existing kinds**, so an `interactive_client` credential is **unmintable**;
and `mint_wake_credential` carries a **second kind gate** above the arms §D.5 says to
extend — extending only the cited arms leaves every mint refused `bad wake_kind`. Both
hidden failure modes push a builder toward exactly the durable-CHECK weakening C-3
reversed. §D.2's "four roster surfaces" is also short by two live assertions.
**Fold: resolved by severance (§4).** Chat parity leaves PR-1/PR-2 for its own follow-on
PR, which must (a) extend BOTH CHECKs and the second gate — extending an enumeration is
not weakening the client binding, and the PR must say so against C-3's record; (b) true
all SIX roster/census surfaces; (c) add the closed-world cell that `interactive_client`
holds **exactly one** allowlist row. R-1's narrowing itself was verified sound — the
pinned kind reaches exactly one verb by catalog fact, not runtime promise.

## 3 · Materials — each folds into v5

**GM-1 · B4-sales is derived from a body superseded seventy migrations ago, and its
formula is arithmetically false on any rounding invoice.** *(FOUR independent
confirmations — the strongest-attested finding of the gate.)* The live
`_assert_sales_invoice_shape_at` is `0022:714-930` (CoR of `0016:1958`; ties at
`:867-872`, `:897-900`, `:913-925`), not `0016:2100-2111`. The live income tie is
`income = gross − tax − rounding`; Annex I's `income + tax = total_cents` differs by
exactly the rounding leg — **in both signs** — so B4 and B11 **contradict on one entry
with no journal satisfying both** (the exact disagreement Annex I claims impossible; the
claim is false against the cited 0016 body too). Rounding is structurally sanctioned
estate-wide (`0009:304-314` auto-appends ≤5-sen legs; the witness predicate certifies
|rounding| ≤ 99 sen as a first-class fact — `0092:463,473-475`, published as
`rounding_cents` `0092:510`) and is tax-independent (`0022:919-924`), so a nil-tax cash
invoice breaks it identically. The supplier row does NOT share the defect (its aggregate
is `account_type`-based and swallows the expense-typed rounding leg — the asymmetry gets
a sentence in Annex I). **Annex C.3's B4 cell tests the formula against its own
derivation, so the battery goes GREEN on the wrong formula.**
**Fold:** corrected sales formula as the live floor's tie set against DB-owned facts:
receivable (direction-correct) = `total_cents`; income + tax = `total_cents −
coalesce(rounding_cents, 0)` (credit-note arm mirrors); `rounding_cents` is the FACT-side
value (`0092`/`0100`), **never the entry's own leg** (the entry may not supply its own
slack). Re-cite Annex I to `0022:714-930`. Replace C.3's self-referential cell with a
**differential cell** (printed-rounding invoice admitted by BOTH B4 and B11) + a nil-tax
rounding twin + the absent-fact twin.

**GM-2 · B4-sales' lumped sum is blind exactly where B11 goes inert, and the one estate
wall that refused a fabricated sst_output leg is retiring with no disposition.** The
nil-tax arm deliberately withholds `total_excl_tax_cents`/`tax_total_cents`
(`0100:553-554`), so ties 2/3/4 of the live floor skip — a fabricated output-SST credit
ties perfectly against a lumped B4 while `0046:1092`'s `account_mismatch` rung retires.
**Fold:** GM-1's component form closes the blindness where facts exist; where the nil-tax
arm withholds components, B4-sales evaluates `not_evaluable` on the component tie rather
than `pass` (law 68); Annex B gains an `account_mismatch` disposition row naming B4's
component tie as its successor.

**GM-3 · B12/B13 pre-checks, as specified, refuse the two most common LAWFUL shapes on
their belts** (an FA acquisition debit; a staff-advance disbursement debit) — the belt
predicates are only true AFTER the approve hook runs, so a pre-hook evaluation has the
wrong inputs by construction. **Fold: B12/B13 are CUT on correctness grounds, not
severed for width** — the designed Tier-D fallback (abort at commit, `(errcode, reason)`
into `last_refusal`) is already the honest behaviour: loud, fail-closed, never wrong.
Their extraction, if ever wanted, is a future item that must design projected-state
inputs. Annex D.1's B12/B13 rows re-dispositioned; their C cells re-cut to Tier-D cells;
E.2's six belt tokens move to the Tier-D vocabulary.

**GM-4 · B14's stated ground is false at the bytes** — `_subledger_classify_entry`
ladder 5 (`0037:995-996`) classifies NULL `coding_kind` as `'adjustment'` and the hook
DOES materialise open items for its control legs; "the hook materialises nothing for a
NULL kind" is wrong. **B14 STANDS** (over-strict is safe, and with GB-1 it is coherent);
**D25 is re-grounded**: B14 refuses control legs on generic entries because a generic
entry's weak anchor (B4-generic) cannot corroborate a subledger consequence, and WCA-R6
keeps settlement judgement human until F-A3 — not because the hook would skip it.

**GM-5 · `(CLR23, registration_conflict)` is unlisted and pre-empts a listed pair.**
`_resolve_counterparty` raises it one call below `0037:1853`, before the
`counterparty_landscape_moved` site the design lists — an ordinary business refusal
becomes a task failure. **Fold:** add the pair; C.4 cell forcing it.

**GM-6 · `(CLR10, customer_identity_name_only)` — hard constraint 12's own wall — is
unlisted.** `0062:196-243`: a BEFORE-row trigger on `counterparties`, reachable through
the delegate's birth/update path inside the protected region; its raise **already
carries `detail.reason`**, so the pair costs zero body edits. Live population ≈ 0 (RS
invoices print no buyer registration — the constraint's own basis), but a constraint-12
refusal settling `failed` is the wrong evidentiary shape exactly where evidence matters
most. **Fold:** add the pair; C.4 cell (name_only client + identifier-bearing birth).

**GM-7 · The B9 check-then-act window.** The estate serializes open-question creation
against approval on THREE locks (filing `FOR SHARE` — `0011:1924-1931` vs
`0007:987-993`; vendor advisory `203005003`; client advisory `203005004` —
`0011:1939-1942` vs `0037:1909-1913`; intent in words at `0011:2988-2995`: *"No
check-then-act window"*). The ladder's B9 runs before any of them — re-opening the window
the estate closed; the delegate's own CLR26 re-check (`0037:1909-1920`, detail carries
`question_id`/`scope` but **no `reason`**) then lands unlisted. **Fold: lock ordering,
not a typed pair** — Tier A names the three acquisitions (the filing lock via the
LOCKING overload of `_active_document_filing`; the client advisory right after the entry
`FOR UPDATE`; vendor via a callable extraction of the delegate's canonical-counterparty
derivation, or — if that widens PR-1 — the fallback pair `(CLR26, open_question_race)`
with a `reason` added at `0037:1918`). With the locks held CLR26 is provably unreachable
from this lane and law 31 forbids listing it; E.2 gains the explicit disposition; C.4
gains the two-session race cell. *(One verifier refuted on population grounds and was
outvoted by two byte-grounded confirmations; recorded per review honesty.)*

**GM-8 · Annex F is missing a layer.** `ck_sweep_run_items_shape` forbids a
non-`'drafted'` outcome from carrying an `entry_id` — widening only the outcome CHECK
plus C.9's `entry_id` cell yields a constraint violation. The chain is **five layers**
plus six sites. **Fold:** Annex F row added; C.9 extended.

**GM-9 · The D1 label is untrue.** §3.5 says "eight bodies and one ALTER TABLE …
enumerated in Annex B"; Annex B carries no such enumeration and B.9's own contents
require ≥11 CoR'd live bodies. **Fold:** B.9 gains the explicit numbered D1 list,
recounted AFTER the §4 severance; §3.5 cites the count that list prints.

**GM-10 · OQ-4 exit 2 has no mechanical door.** D.3's trigger claim is false at the
bytes — `entry.revised` re-admits nothing, and after a withdrawal the sweep is refused
`already_done` by the gate `0053` installed on purpose. **Fold:** D.3 corrected to name
the truth; the re-admit door (a deliberate, audited re-admission after withdrawal that
does not weaken `0053`'s duplicate-sweep gate) becomes a **named PR-2 design
obligation** with its own cell. Exit 1 (human posts) is unaffected; the ruling stands.

**GM-11 · The `kb_rule_proposal` part-type surface is absent from the retirement
checklist** — a live dashboard consumer of three retiring verbs (`get_coding_rule`,
`sign_coding_rule`, `decline_coding_rule`). **Fold:** B.6 gains the surface (parts
catalog + card + tests), following the verbs, per B.6's own method header.

## 4 · The width ruling (orchestrator, on three lanes' convergent evidence)

**PR-1 as scoped was five judgement subsystems sharing one window. It is severed:**

1. **Chat parity LEAVES the train** (GB-3: unbuildable as written; §3.7.2's own licence:
   *"If that is out of scope, chat parity does not ship."*). Its own follow-on PR after
   the DB path proves live, carrying GB-3's fold list. §6's acceptance is
   autodraft-lane and loses nothing.
2. **B12/B13 are CUT on correctness grounds** (GM-3). Tier D stays their honest home.
3. **The `posted`-outcome chain stays in PR-1's single D1 window but becomes its OWN
   migration file** (a third file beside the `0077`/`0078`-style pair), reviewed and
   provable in isolation via C.9 — behaviourally inert until PR-2 emits `posted`. A
   separate earlier ceremony was weighed and declined: a third window buys review
   isolation the file split already buys, at the price of another full stop/start night
   with its reconciler-herd and zombie-pooler hazards.
4. **PR-1 core retains:** the ladder (B1–B11, B14, + GB-1's new rung; B10/B11 in GB-2's
   projected-state form), A8 + both structural walls, the receipt table + deferred
   trigger, T3's two recuts (clean bill), the 8th body + draft-core recut, the amended
   Tier-C pair set, and GM-1's corrected B4 formulas.

**The revised train:** PR-0 (this gate — DONE) → PR-1 (DB, THREE files, one D1 window)
→ PR-1b (pack splice, no ceremony) → PR-2 (runtime `autoDraft_v9`/`chatTurn_v13`, no
`interactive_client` minting; + GM-10's re-admit door) → PR-3 (cutover + retirement,
D1) → PR-4 (acceptance) → **then** chat parity (its own PR + PR-2-class runtime change),
and B12/B13 extraction only if a future need re-opens it.

## 5 · Nits (cite/battery trues — folded without argument)

`(CLR10, already_reversed)` ×2 leaves the pair set (dead member, law 31 — the design's
own `settlement_not_autopostable` reasoning) · Annex E's bare-CLR23 census short by one,
line cites off 1-3 · Annex I supplier cite → `0016:4137-4151`; verified-total floor →
`0036:831-847` · B.3's `appliedStem` cites re-trued against the current file (`:417`) ·
`x1-helpers.mjs` fail-soft cite → `:390-392` · `revise_entry` also strips/re-stamps
`amount_exception` and can write `amount_override` (A8's reasoning survives — stronger) ·
`advance_mirror_unregistered` + `advance_application_missing`: tokens for arms declared
unreachable on this path — their C cells become declared-unreachable rows, not forced
cells (law 31), and they ride out with GM-3's re-cut · C.1's `'proactive'` cell re-cut as
a refusal attempt, not a roster read · §3.7.2's allowlist-row cite corrected · D.3's
wording per GM-10.

## 6 · Disposition of every reviewer finding not folded above

REFUTED at the bytes (recorded so nobody re-raises them): the T3 pin's seven attacks
(§1) · B4 generation-pin ambiguity (both cites resolve to the ctx pin at post time) ·
the vacuous-B10/B11-vector claim for generic (the vector's `not_evaluable` value covers
it once GB-2 lands) · the replay-branch receipt gap (the stored-envelope return writes
no receipt row — verified) · witnessFacts-v3 timing collision (none; its own lane) ·
the 20-document sample-coverage objection (the denominator rule already owns it) ·
`origin='sweep_refusal'` mislabeling (no non-sweep caller exists or is designed) ·
frozen-closure objection to R-1's enforcement point (the mint choice rides the NEW
frozen `_vN`, inside the closure) · three retirement-inventory misses (each named file
was already on B.6's lists under another head).

## 7 · What PR-1's rig replay must confirm (the gate's own predictions)

The three splice-reached bodies at their live tips (`_draft_entry_core`,
`_assert_supplier_bill_shape_at` `0036:601`-lineage, `_assert_sales_invoice_shape_at`
`0022:714`-lineage) · Annex D.1's `pg_trigger` census both directions · GB-2's premise
(no draft-time counterparty on agent sales drafts) · GM-6's birth-path reachability ·
GM-7's three-lock sufficiency (or the fallback pair) · the B.9 D1 list recount (GM-9).
