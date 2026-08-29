# 裁-18b — the binding-proposal door: PR-0 INDEPENDENT DESIGN GATE

> **Verdict: FOLD REQUIRED — 1 critical, 8 blockers, 9 material, 4 nits.** Not BLOCKED: the item
> should be built, and most of the fold lands on **PR-1**, which was unauthored when this gate opened
> (branch db/binding-proposal-pr-1 at `origin/main`, empty diff).
>
> **Two independent reviewers, merged here into one ranked list.** `[N]` = this native lens pass;
> `[C]` = the Codex cross-model adversarial pass (session scratchpad,
> alignment-audit/codex-binding-design-adversarial.md); `[N+C]` = found by both, or one found the
> defect and the other sharpened it. **Every `[C]` finding was independently re-verified here against
> the live bodies** — all six checked claims CONFIRMED, two with corrections recorded in the annex.
> **Evidence detail, the refuted-candidate table and the overturned refutations are in the companion
> annex**, `binding-proposal-pr0-gate-annex-2026-08-29.md`.
>
> **Why this record exists.** An alignment audit found 裁-18b is the one design set of sixteen
> build-authorised on owner Q&A alone, without the lens review + per-finding adversarial verification
> every sibling ran. ADR-0028 / digest law 82 makes the cross-model pass practice for exactly this
> shape: the door touches the approval path, and 裁-25 pulled `_approve_entry_core`'s replacement
> inside the item.
>
> **Set under gate:** `binding-proposal-survey.md` · `binding-proposal-design.md` ·
> `binding-proposal-annexes.md` · `binding-proposal-gate-record.md`. **Rulings carried:** 裁-18,
> 裁-25, **裁-32**, and the conductor's technical rulings (§2).
>
> **Method.** Every claim verified against the **live migration lineage**, never the design's own
> citations — the superseded-body class. Where a function is redefined by a later `CREATE OR REPLACE`
> or patched by a **dynamic splice** (`pg_get_functiondef` → `replace()` → `execute`, invisible to a
> `create or replace function` grep), the last body in migration order is the one read. Frontier at
> gate **`0147`**; the design set was authored at **`0142`** (annexes F) — five migrations of drift.

## 1 · The lenses

`[N]` **L1** injection surface · **L2** separation of duties · **L3** the eligibility predicate ·
**L4** loop brake + decline semantics · **L5** the one-open-proposal index vs the human door · **L6**
the receipt-surface registry widening · **L7** the basis contract through the LIVE
`_resolve_proposal_basis` · **L8** the post-time re-check and `_approve_entry_core`'s D1 blast radius
· **L9** the expiry sweep as an engine source under law 71 · **L10** the frontend home.
`[C]` added the **identity-corpus** lens (what the three approved invoices actually prove about *which
vendor*) — the one this pass missed, and the one that produced the critical.

## 2 · Rulings this record carries

**裁-32 — who the maker is.** The **directing human is the effective proposer**. A multi-human firm
**cannot self-sign a directed proposal**. A solo firm **may** sign its own directed proposal **with
the PRD §2 self-approval attestation**. **Two accounts held by one person are NOT walled** — recorded
as accepted residual risk, not a defect.

**Conductor's technical rulings.** (a) the 14-day predicate runs over **distinct documents, distinct
sha256s and distinct normalized invoice ids**, plus a **trusted `approved_at` span**; (b) **decline is
durable suppression written in BOTH proposal writers**, reset only by a **named human door**; (c) the
one-open wall covers **`status IN ('proposed','live')`** plus a shared **advisory key**; (d) the basis
must **cover all three documents'** `invoice.vendor_name` / `invoice.invoice_id` regions; (e)
**`name_family_is_ambiguous` is applied at eligibility AND at proposal**.

**Consequence already accepted by the build lane:** PR-1's D1 inventory is now **two writer bodies**
(`sign_vendor_identity_binding` + `propose_vendor_identity_binding`). Annex A.5's "unchanged surfaces"
claim and annex J's "the whole item replaces ZERO live PL/pgSQL WRITER bodies" headline are both
**dead**, and every downstream sentence resting on them must be re-cut (F7).

## 3 · CRITICAL

### C1 · A poisoned approval corpus can bind future invoices to the WRONG VENDOR `[C]` · PR-1 + PR-3

The identity the binding grants is not proven by anything the door checks. Three live facts compose:

1. **F3 corroboration passes on a NAME SUBSTRING alone.** `clara._binding_f3_holds`
   (`0028_vendor_identity_binding.sql:246-326`, single definition, never redefined or spliced) gates on
   page-1 top-quartile geometry and then a two-armed OR — `position(normalize(registration) in
   normalize(text)) > 0` **OR** `position(normalize(name) in normalize(text)) > 0`. Each arm is guarded
   only by its own operand being non-blank, so **when the counterparty carries no usable registration
   the predicate collapses to the name arm.** Both arms are unanchored `position(...)>0` containment —
   not equality, not `LIKE`, not `starts_with`.
2. **Runtime matching is a PREFIX match.** `_resolve_vendor_binding` (live = `0030:322` + `0101`'s
   extraction-selection splice) requires `starts_with(v_norm_name, b.f1_vendor_name_norm)`
   (`0030:427`) — the document's normalized name must merely *begin with* the stored F1 LCP.
3. **The firm-wide collision guard exists and is never called here.**
   `clara.name_family_is_ambiguous` (`0103_f_a7_pi_additive.sql:781` — **not `:755`, which is
   `name_family_candidates`; Codex's line pointer is off by one function**) is called only from the
   F-A7 filing/onboarding domain (`0126:1113`, `0126:1160`, `0142:451`, `0143:594`). **Zero call sites
   anywhere in the vendor-binding estate** (0028/0029/0030/0031/0046/0101 grepped clean). Digest **law
   79** (`docs/adr/README.md:472-478`) names the name-family collision guard as one of the four walls
   that make attribution-as-judgement admissible.

**The attack.** Misattribute and approve three crafted invoices of a `ROME…`-family vendor to
counterparty A. The DB derives and stores vendor B's stable LCP against A's registration. The card is
convincing — every figure on it is DB-derived and true. A human signs. Subsequent name-only B invoices
then `starts_with`-match the binding and auto-post to A. **This is not hypothetical for this estate:
constraint 13's own fixture set is a name family — ROME PROPERTIES · ROME SECRETARY · ROME PUBLIC
ADVISORY.**

**Why the design's defences do not reach it.** The design's strength is that no *model-authored value*
enters the row — true, and it does not help: every value here is DB-derived and still wrong, because
the corpus was poisoned upstream of the derivation. The consent surface makes it worse, not better:
the human sees N matching invoices, three resolved citations and a hash, all genuine.

**Fix (ruled (e), extended).** Each corpus member must carry **either an exact printed hard-identifier
match** (registration/TIN read off the document, compared for equality, not containment) **or an
explicit human identity resolution**; a *differing* printed registration/TIN refuses outright. Apply
`name_family_is_ambiguous` at **eligibility, proposal, runtime binding and post-time re-check**. In an
ambiguous family, F1 and the F3 name arm may never authorise identity on their own.

**Open scope question — O1 (§7).** Live bindings already signed under the name-only path are not
re-validated by this fix.

## 4 · BLOCKERS

### B1 · The `interactive` path defeats signer≠proposer — and standing law already said so `[C]` · PR-1 (+ the sign body) · **RULED 裁-32**

The wall stamps Clara and compares `created_by` to the signer (`0144_db_hardening_a_barrier_signer_
wall.sql:375-377`). A `filing`/`interactive` credential carries the directing human in `on_behalf_of`
(`clara.wake_context()`, `0011_daily_loop.sql:1133-1153`). So human H clicks "ask Clara to propose",
Clara's uuid lands in `created_by`, and **H signs H's own directed proposal.** Digest **law 69**
(`docs/adr/README.md:400-404`): *"maker/checker measures the DIRECTING human with standing re-read at
approval time."* The estate already implements exactly that — `0084_wave_e_eta_approval_obo.sql:123`:
`v_maker := case when v_agent then nullif(v.proposal_evidence->>'on_behalf_of','')::uuid else
v.proposed_by end;`

**This pass got this wrong and Codex got it right.** My first-round refuted table argued the T2 path
was 裁-18c's sanctioned way out and therefore not a finding. That reading was against a *narrower*
ruling and ignored standing law 69 and its live precedent. 裁-32 has now settled it in Codex's
direction. The overturned reasoning is recorded in full in the annex rather than quietly deleted.

**Fix (裁-32).** Persist `directed_by`; derive `effective_proposer` = the human proposer, else the
standing `on_behalf_of`; compare the signer to **that principal**, re-reading standing at sign time
(the 0084 idiom). A director-less proposal is signable only as a recorded **adoption**. A **solo firm**
may sign with the **PRD §2 self-approval attestation**. Two accounts / one person stays unwalled, by
ruling.

### B2 · The refusal receipt the design specifies CANNOT BE WRITTEN, because every wall raises `[N]` · PR-1

Annex B gives `binding_agent_receipts` a `failing_rungs text[]`, a nullable `binding_id`, and
`ck_bar_proposed_iff_clean check ((binding_id is not null) = (failing_rungs = '{}'))`; battery cell
R-2 asserts a refused proposal writes a receipt. But **all thirteen walls W1–W13 are `raise
exception`**, and a raise takes every prior insert with it — annex E R6 says so itself. So the CHECK's
refusal half describes a row the door can never produce and `failing_rungs` is dead vocabulary —
**the exact defect (`status` admits `declined`, nothing writes it) this item exists to fix, re-minted
one table over.**

The estate has a **two-tier contract** the design never draws: Tier A raises and is unreceipted; Tier
B is fully evaluated without raising, accumulates a vector, writes a durable receipt and **returns** a
refusal (`0126_f_a7_beta_filing_verb.sql:158-170` and `:846-850`, quoted in the annex — 0126 states
the impossibility in the estate's own words).

**Fix.** Declare the split before writing the core. Suggested cut: **Tier A** = W1 credential, W2
allowlist, W3 firm congruence, W5 rationale/model shape, W6's *shape* half, W13's op_key conflict.
**Tier B** = W4 counterparty liveness, W6's *resolution* half, W7 duplicate-open, W8 live binding, and
C1's new identity rungs — the eligibility refusals a human wants a record of. If the owner wants **no
refusal receipts**, `failing_rungs`, the nullable `binding_id`, the CHECK's refusal half and cell R-2
must be **deleted**, not left unreachable. **RULED (§7 O2): no refusal receipts — the door raises, and
the dead vocabulary is DELETED.** The half that mattered is closed: nothing unwritable stays in the
schema.

### B3 · The design calls `_resolve_proposal_basis` with the WRONG SIGNATURE `[N]` · PR-1

Design §3.2, gate record G2 and annex G-d all name `(p_firm uuid, p_documents uuid[], p_citations
jsonb)`. The live function — `0143_proposal_basis_resolved.sql:241`, the only definition, never
redefined — is `(p_documents uuid[], p_firm uuid, p_basis jsonb)`. Two deltas: the **order** differs
(fails loudly), and **the third argument is the whole basis OBJECT, not the citations ARRAY** — the
body reads `v_citations := p_basis->'citations'` (`0143:274`) after asserting `jsonb_typeof(p_basis) =
'object'` (`0143:269-272`). Passing the array — which the design's parameter *name* says to pass —
refuses every proposal, fail-closed, with a message about a malformed basis when the basis was fine.
Copy the live idiom, `0143:486-487`. Also: the resolver is **ungranted** (`0143:393`), so the new core
must be `SECURITY DEFINER` owned by `clara_fn_owner`.

### B4 · Decline is only a read-side brake; both proposal writers can immediately re-propose `[N+C]` · PR-1 · **RULED (b)**

裁-25 G7 ruled decline "read by the loop brake", but W1–W13 contain no declined-history wall, and the
frozen derivation refuses only on a **live** binding (`0030:282-290`). `[N]` found the read verb's
contract (annex A.1) carries no declined signal — and **no revoked signal either**, which no document
in the set mentions: `revoke_vendor_identity_binding` writes `status='revoked'` (`0028:936-939`), the
derivation cannot see it, and no index covers it, so **an admin who deliberately revokes gets it
re-proposed on the next filing turn.** `[C]` showed the read verb is the wrong place regardless: the
wake wrapper and the unchanged human door can both be called directly.

**Fix (ruled).** Durable suppression in **both** proposal writers — store `declined_by/at/reason`,
suppress on declined **and revoked** history, reset only through a **named human door**. The read verb
also surfaces it so Clara does not propose into a refusal.

### B5 · The one-open index loses a propose-vs-sign race AND creates a permanent deadlock `[C]` race + `[N]` deadlock · PR-1 · **RULED (c)**

**The race `[C]`.** Propose derives (checking only for a *live* binding) before inserting
(`0028:756`); sign locks one proposal and flips it to `live` (`0144:355`, `:425`). A second proposer
passes "no live binding", then blocks on the existing `proposed` index row; the signer commits
`proposed→live`, freeing the partial-index slot; the waiting insert succeeds. **Result: a live binding
plus a fresh open proposal** — precisely what the index was added to prevent.

**The deadlock `[N]`.** **Every `status='expired'` write in the estate filters `status='live'`** — all
three sites (`0028:750-754`, `0028:834-839`, live `0144:385-390`); grepped exhaustively, **nothing
ever moves a `proposed` row to `expired`**. A proposal unanswered for twelve months is then
**unsignable** (`binding_expired`, `0144:381-383`), **un-re-proposable** (the index), and **still
`proposed`** — that vendor can never be bound again by anyone. Today the state cannot arise (N open
proposals are admissible, survey S6). **Widening the index to `proposed+live` per ruling (c) makes
this worse, not better**, because the live half self-heals through the existing sweeps and the
proposed half still does not. Note the obvious escape is illegal: a partial index predicate must be
IMMUTABLE, and `now()` is STABLE.

**Fix (ruled (c), extended).** Unique over `status IN ('proposed','live')`, translate update conflicts
to the typed refusal, and serialise propose/sign/decline/expiry on a shared `(client, counterparty)`
advisory key. **Plus** `[N]`: a stale-`proposed` expiry sweep called by both writers before insert —
otherwise ruling (c) ships a strictly larger deadlock. Preflight and reconcile existing duplicates
before creating the index.

### B6 · "Three invoices, three dates, ≥14 days" is spoofable bookkeeping chronology `[C]` · PR-1 · **RULED (a)**

The window limits **three journal entries** with no distinct-document, distinct-sha or
distinct-invoice-id requirement (`0030:129-144`); the three-date and span predicates read
caller-controlled **`posting_date`**, while `approved_at` is used only for ordering (`0030:181`,
`:201`). One document reused across three approved entries with backdated posting dates passes
immediately. **The design's headline claim — "her own observation, a stable fingerprint repeatedly
approved" — does not hold on the live predicate.**

**Fix (ruled).** Require three **distinct document ids, sha256s and normalized invoice ids**; exclude
duplicate-override entries; require **both** a posting-date span and a **trusted `approved_at` /
first-observed span** ≥14 days.

### B7 · The basis is satisfied by one real-but-irrelevant region `[C]` · PR-1 · **RULED (d)**

`0143` proves the whole document set real (`:257-266`) but each citation is checked only for **document
membership** and **current extraction generation** (`:319-352`) — never `field_path`, never text,
never coverage of all three documents. **One current footer region from one evidence document passes**
and is then rendered to the admin as the support for a vendor identity. Returned `sightings` counts
distinct **regions** (`0143:367`), not invoices.

**Fix (ruled).** After shared resolution require coverage of **all three** evidence documents and only
`invoice.vendor_name` / `invoice.invoice_id` regions whose normalized text equals the values the
derivation used. Rename the resolver's returned `sightings` → `citation_count` at this door's boundary
and derive the approved-invoice count separately. This does **not** disturb `[N]`'s R-6 finding (a
*foreign* document or firm is genuinely walled) — the gap is **relevance**, not provenance.

### B8 · PR-3 has no contract; "replaced" must not be read as "retyped"; and the port source is `0046`, not `0029` `[N+C]` · PR-3

`[N]` **"Replaced" is the wrong verb.** `_approve_entry_core` is *"the most-spliced function in the
system"* (`0040:6994`, `0053:969`); its live body is no single file's text. `0106:1379-1391` records
the nine-generation lineage — the last four changes are **dynamic splices**: `0037:1750` (last literal
text) → `0040:7026-7174` → `0053:967-997` → `0106:1413-1581` (**live**). The 0106 §E splice **excised**
the sighting-accrual / auto-proposal breeding block (`0106:1394-1398`, *"2 -> 0, not 2 -> 1"*). **A
PR-3 that retypes from 0037 silently restores it** — two `rule_sightings` inserts and a
`vendor_account` auto-proposal loop that writes a coding rule and opens a blocking question, the whole
rules tier F-A2 retired at `0118`. **Splice at a pinned anchor with a pre-image prosrc sha; abort on
drift.**

`[C]` **The contract must be the full old control, not a status check.** A shallow restorer that reads
`status='live'` without locking loses to a revoke committing between check and approval, or accepts a
*different* newly-matching binding instead of the draft's exact one. `0029`'s control did fourteen
ordered things — lock the exact binding row `for update`, re-read current facts/OCR, re-validate the
`vendor_identity` receipt shape, independently re-resolve the counterparty from current fields, then a
first-reason-wins ladder over status / expiry / identity drift / draft-resolution match / F1 / F2 / F3
/ *unique exact* binding match, then persist `phase='post'`. Full ordered list with file:line in the
annex.

**`[N]` correction to `[C]`:** `execute_rule_post` was CoR'd twice after `0029` — at `0030:456` (F1 →
`starts_with`) and `0046:782` (sales lane). **The last live shape before the `0118` drop is `0046`,
not `0029`** — port from `0046:1364-1420`, or PR-3 re-introduces the pre-LCP F1 equality test.

`[N]` **Three edges needing a ruling, or legitimate work strands.** Gate on `e.vendor_binding_id is
not null` or the check fires in all **fourteen** `_approve_entry_core` call sites, most carrying no
binding (`0015:1542`, `0106:1304`, `0121:789/808/1088/1104/459/475/3779`, `0041:3558/3993`, 0129 SS2,
`0140:2855/3121`, `0045:6215/6219/6375/6380`). Then: (1) **reversals must bypass** — an entry posted
under a since-revoked binding is exactly the entry you need to reverse, and refusing blocks its own
remedy; (2) `_adj_on_approve` (`0140:2884`) **re-enters** `_approve_entry_core` in the same
transaction, and `_pair_reverse_core` approves both halves, so an inner raise fails the whole run; (3)
**expiry is a clock, revocation is an act** — an entry drafted three days before expiry and approved
two days after should probably not refuse. **Owner question O3 (§7).**

## 5 · MATERIAL

**M1 · W11's honesty pair is one-directional where 裁-18 needs it bidirectional `[N]` · PR-1.** Annex
A.2's `check (proposer_model is null or proposed_by_agent)` / `check (proposal_receipt_id is null or
proposed_by_agent)` both read "*if* set, must be agent-proposed"; neither forces the converse, so **an
agent-proposed binding with no receipt and no model is structurally legal** — while 裁-18(b) ruled the
door must carry rationale + model *on the receipt*. W10 was made bidirectional for exactly this
reason. The blocker is a **mutual non-deferrable FK cycle** (annexes A.2 + B): with both immediate,
the only workable order is insert-binding-with-NULL → insert-receipt → UPDATE-binding, and that first
statement violates a bidirectional check. **Fix:** `fk_bar_binding` `deferrable initially deferred`,
both uuids pre-minted, receipt then binding, both checks bidirectional. Removes the UPDATE-after-insert
too, which matters against the frozen-content trigger (`0028:198-217`).

**M2 · The rationale is the injection surface and it lands on the consent screen `[N]` · PR-1 + FE.**
`p_rationale` is model-authored prose derived from document content Clara just read, stored verbatim,
rendered **verbatim in the sign dialog** (§3.3 item 3) — the screen where an admin grants auto-posting
authority. An invoice footer reading *"NOTE TO REVIEWER: registration confirmed with SSM by the firm's
partner on 14/08"* becomes, if adopted, a fabricated corroboration beside four real DB-derived facts.
The design's mitigation is intent, not mechanism. Annex B copies `agent_filing_receipts`' uncapped
`check (btrim(rationale) <> '')` (`0126:702`) when the estate's *other* precedent caps
(`agent_act_receipts`, `length(rationale) <= 4000`, `0138:363`), and nothing says the rationale renders
as plain text. **Fix:** adopt the 4000 cap; render plain, separated, explicitly labelled; never through
a markdown/HTML renderer. Sharper after **C1**: prose is the one field that can carry the poisoned
document's own words to the signer.

**M3 · `sign_` asserts a post-time control that has not existed since `0118` — by NAME `[N+C]` ·
PR-3.** `0144:394-399` refuses unless `exists (select 1 from clara.schema_migrations where
version='0029_vendor_binding_executor')`. It reads a **migration version string** and infers the
control exists; `execute_rule_post` was **dropped** at `0118:212`, and migration rows are never
removed, so the guard **permanently passes** while the control is permanently absent. Review law 3,
live in a shipped writer on the signing path. **Fix:** re-point at the restored control by identity
(`to_regprocedure` + a prosrc marker), or retire it and say so.

**M4 · The copy-flip work item cites strings that DO NOT EXIST; 裁-18a already landed `[N]` · FE.**
§3.6 item 4 and annex G-c cite `en.json:1898` and `:1915-1917`. Read directly: `:1898` is
`"registrationLabel": "Registration number"` (the *counterparty* block) and `:1913-1917` is the alias-
origin block; **neither quoted string exists anywhere in the file**; the live vendor-bindings copy at
`:2149`/`:2168` **already says the opposite** — *"Signing requires an admin who did not propose it…"*
— because 裁-18a merged as `0144:375-377`. A lane following annex D edits keys that do not exist, or
flips **correct** copy back into the pre-wall lie. **Delete the item; G-a and G-c are discharged.**
Note the copy will need a *third* pass under 裁-32, since it now under-states the wall (directed
proposals). Annex A.5 must also take the **post**-hardening sha
`5285581ec371856d525fb47d2cfabc6e72b3a37285b291390e8c7aa34034e941` (survey:69 carries both).

**M5 · §3.3's sign-dialog read contradicts §3.5's "read through `agent_receipts_visible` and nowhere
else" `[N]` · reads PR.** Annex J routes the rationale/model/citations through a CoR of
`get_vendor_binding` — a definer function that would read the base table directly, minting a second
unregistered read path. **Fix:** select from `clara.agent_receipts_visible` (`0103:406-410`), whose
`jwt_firm()` / `actor_role_rank()` filters are session GUCs and still bind the caller inside a definer
body. Verified reachable: the contract table carries **`verdict jsonb` at ordinal 12** (`0103:245-277`).

**M6 · The expiry sweep has neither its authority nor its receipts specified — and it would be the
estate's FIRST live engine source `[N+C]` · PR-4.** `[C]`/law 80 (`docs/adr/README.md:479-481`):
*"every clocked act is receipted"* — the design specifies no per-run or per-row receipt, and no due
predicate, workflow export, model pin, pool or idempotent core. Enabling must go **only** through
`clara.set_wake_source_enabled` (`0133:283-368`, owner-floor + operator-firm + audited), never a
migration or raw update; sources are structurally disabled at birth (`0133:225`). `[N]` adds the
rollout fact: `wake_engine_sources` holds two rows, **both `enabled=false`**, never flipped through
`0147` (`PROGRESS.md:106` concurs), and the loop reads `… where enabled` every cycle
(`wake-engine.mjs:149-155`), so **enabling this sweep is the wake engine's first real workload ever**
— exercising the claim CAS, `reenqueueStuckRows`, `settleFromEngineTruth` and `wakeEngineHealth` in
anger. **Owner question O4 (§7).**

**M7 · The annexes were never trued — and are now two rulings behind `[N+C]` · all PRs.** Annex F's
change log has one row, the header still says gate **OPEN**, and the body asserts pre-ruling scope:
N3 "no engine source" (G7 widened it), N5 "no post-time re-check" (G6 overruled), R2 "PR-2 holds"
(G2 closed by fact), R7 "`has_open_proposal`/`has_live_binding` are the only loop brakes" (G7 ruled
decline in), R4/G-e "defer the tenth row_kind" (G5: 裁-17 live at `0146`). **Annex A specifies no
`decline` verb at all** — no name, signature, floor, audit/event or transition guard — yet the ruling
puts it in PR-1, and annex A is the contract a lane builds from. Since 裁-32 and the conductor's
rulings, A.5's "unchanged surfaces" and J's "ZERO writer bodies" are also **false**. **Fold G1–G8 +
裁-32 + the technical rulings into the normative design and annexes before PR-1 opens.**

**M8 · `sightings` — the resolver does not enforce the ban, and its output names a different quantity
`[N+C]` · PR-1.** W6 makes `sightings` a forbidden key, but the live resolver reads only
`p_basis->'citations'` (`0143:274`) and ignores every other key — the estate's existing caller
*deliberately passes one* (`0143:487`). **The closed-key check must live in the door, before the
resolver call**, and the PR body must say so or a later "simplification" will delete it on the grounds
the shared resolver handles it. Output side: see **B7**.

**M9 · The `pb_*` widening is not specified tightly enough to review as a closed-world change `[C]` ·
PR-1.** Live checks are exact F-A regexes (`0142:307-312`); the ruling says only "admit a `pb_*`
family". A broad `^pb_.*$` admits blank or garbage suffixes while the nine-row census still reads
green. Note `pb_binding` carries **no digits**, so a naive widening that keeps `[0-9]+` refuses it.
**Fix:** byte-exact item and shim regexes in the design, the F-A arm preserved, the `pb_binding ↔
_agent_receipt_src_pb_binding` pairing required, and R-7 probing valid old **and** new names plus
malformed near-misses, with an exact nine-member census.

## 6 · NITS

| # | nit | PR |
|---|---|---|
| **N1** `[N]` | **State the call order.** The three evidence documents that become `p_documents` are chosen *by* the derivation, which also raises W4/W8 and the whole ladder. Real order: `reserve → derive (once) → take the 3 document ids → resolve basis → insert`. Call the derivation **once** and reuse its output for both the durable fields and the document set — twice is two computations of one fact that can disagree under concurrency. | 1 |
| **N2** `[N]` | **`p_model` is a claim, not a measurement.** W5 checks only non-blank `provider`/`model`/`version`. Inherent and accepted elsewhere, but the sign dialog must label it **self-reported**, not verified provenance. | 1 + FE |
| **N3** `[N]` | **PR-2's splice pre-image.** `list_review_queue` is splice-patched; `0146_ninth_rowkind_seeding_proposal.sql:114-495` is live, pinning `74be2568…aaf1cfa → dd2dee4f…eac6c8ed`. PR-2's pre-image is `0146`'s **post**-splice sha, re-censused at merge. The compile-time gate is real and helpful: `NEEDS_YOU_AFFORDANCES` is a closed `Record<ReviewQueueRowKind,…>` with `satisfies` (`needs-you-affordances.tsx:80-111`), so a tenth kind without its affordance fails `tsc`. | 2 |
| **N4** `[N]` | **Prestate the index.** The unique index fails at apply if any pair already carries two open rows — admissible today (survey S6), and more likely under ruling (c)'s widened predicate. §0 counts and aborts readably rather than failing on the index build; carry `set local lock_timeout`. | 1 |

## 7 · Owner questions

Codex's three questions are all **already ruled** (§2 — 裁-32 answers "who is the maker", the
conductor's (a) answers "what does 14 days mean", (b) answers "what does decline suppress"). Four
were raised here, each with a recommendation, its cost and a fail-closed default.

> **STATUS 2026-08-29 — O1, O2 and O3 are RULED by delegation; O4 stays with the owner.** The
> recommendations below are kept **verbatim as argued**, per the estate's gate-record convention: a
> record that erases what was recommended cannot show why a ruling went the other way. **O2 went
> against this pass's recommendation** and is annotated as such.

**O1 · Do C1's identity rungs apply RETROACTIVELY to bindings already signed?** *(大白话: the fix stops
future wrong-vendor bindings. It does not check the ones already signed under the old, weaker rule.)*
**Recommend: yes, as a read-only census, not an automatic revoke** — PR-1 ships a
`binding_identity_review()` read listing every live binding whose F3 could only have passed on the
name arm or whose family is ambiguous, and a human decides. Cost: one read verb and a needs-you row.
**Fail-closed default: run the census and report; do not auto-revoke** — a mass revoke strands posting
for vendors that are probably fine.

> **RULED (delegation, 2026-08-29) — as recommended: a READ-ONLY CENSUS, no retroactive revoke.**

**O2 · Does a REFUSED proposal write a receipt (B2)?** **Recommend: yes, Tier B** — the eligibility
refusals are exactly what a human wants a record of, and the estate has the idiom. Cost: the door
returns a verdict for Tier B instead of raising, which changes its contract and its battery.
**Fail-closed default: no refusal receipts — and then DELETE `failing_rungs`, the nullable
`binding_id`, the CHECK's refusal half and cell R-2.** Leaving unreachable vocabulary is the one answer
that is wrong either way.

> **RULED (delegation, 2026-08-29) — AGAINST this recommendation: NO refusal-receipt rows.** The door
> **raises**, as designed, and stays a pure Tier-A ladder. **The dead vocabulary is therefore DELETED,
> not left standing** — the fail-closed arm above, taken deliberately: PR-1 drops `failing_rungs`, the
> nullable `binding_id`, the refusal half of `ck_bar_proposed_iff_clean` and battery cell R-2, and
> `binding_id` becomes `NOT NULL` with the shim's `subject_id` reading it directly rather than
> `coalesce(binding_id, counterparty_id)`. **B1's defect is closed by deletion, which is the half that
> mattered**: what this record refused to allow was an unwritable refusal shape left in the schema as
> vocabulary nothing can produce. A refused proposal now leaves an audit line and no receipt — the same
> posture `0126` records for its own Tier A ("Tier A stays unreceipted").

**O3 · PR-3's re-check semantics on EXPIRY vs REVOCATION (B8)?** *(大白话: revoked means a human took
the authority away; expired means a clock ran out, maybe two days ago, on an entry drafted last week.)*
**Recommend: refuse on revoked, annotate-and-post on expired**, plus two rules under any arm —
**reversals bypass entirely**, and the check is gated on `e.vendor_binding_id is not null`.
**Fail-closed default: refuse both, WITH the reversal bypass** — the bypass is not optional under any
arm.

> **RULED (delegation, 2026-08-29) — as recommended: REFUSE on revoked, ANNOTATE-and-post on expired,
> REVERSALS BYPASS.** The `e.vendor_binding_id is not null` gate rides with it.

**O4 · Is a housekeeping sweep the right FIRST live wake-engine source (M6)?** **Recommend: yes, but
name it as the engine's rollout in the PR body** and watch `wakeEngineHealth`'s
`held_for_disabled_source` / `cancel_requested_stuck`. A cheap job is a good first exercise of
claim/reconcile/health. **Fail-closed default: ship the row disabled and do not run the ceremony** —
the sweep is then dead code, which is safe only if B5's in-door sweep landed, so O4 and B5 must be
decided together.

> **NOT RULED — O4 stays with the owner. PR-4 is HELD, unbuilt, until he rules.** This is the one
> question the delegation did not take, and it is the right one to reserve: enabling the source is a
> wake-engine rollout, not a registry row (M6). **The hold has a consequence PR-1 must absorb:** with
> PR-4 unbuilt there is no clock, so **B5's in-door stale-`proposed` sweep is now load-bearing, not
> belt-and-braces** — it is the only thing standing between the widened `('proposed','live')` index and
> the permanent per-vendor deadlock. Ship it in PR-1 or the deadlock is live with no scheduled drain.

## 8 · The fold list, PR by PR

**PR-1 — the door + `wake_list_binding_candidates` + `decline` + the index + the `pb_*` widening.
D1 inventory is now TWO writer bodies (`sign_` + `propose_`).**

1. **C1** — hard-identifier-or-human-resolution per corpus member; refuse on a differing printed
   registration/TIN; `name_family_is_ambiguous` at eligibility **and** proposal (ruled (e)); F1 / F3-name
   may not authorise identity in an ambiguous family. Note the correct symbol is at `0103:781`.
2. **B1** — persist `directed_by`, derive `effective_proposer`, compare the signer to it with standing
   re-read (the `0084:123` idiom); adoption for director-less; solo firm signs with the PRD §2
   attestation (裁-32). Touches `sign_vendor_identity_binding`.
3. **B2** — per **O2 as ruled: DELETE the refusal vocabulary.** Drop `failing_rungs`, the refusal half
   of `ck_bar_proposed_iff_clean` and battery cell R-2; make `binding_id` `NOT NULL`; the shim's
   `subject_id` reads `r.binding_id::text`, not `coalesce(binding_id, counterparty_id)`. The door stays
   a pure Tier-A raising ladder. **Cross-check before merging:** M1's honesty checks and this deletion
   both touch the same columns — with `binding_id NOT NULL` the receipt→binding FK is now always
   enforced, which makes M1's deferrable-FK + pre-minted-uuid ordering mandatory rather than optional.
4. **B3** — call `_resolve_proposal_basis(array[…3 doc ids…], w.firm_id, p_basis)`; core
   `SECURITY DEFINER` owned by `clara_fn_owner`.
5. **B4** — durable decline **and revoke** suppression in **both** writers + a named human reset door
   (ruled (b)); the read verb surfaces it.
6. **B5** — unique over `('proposed','live')` + advisory key + conflict translation (ruled (c)),
   **plus** the stale-`proposed` expiry sweep in both writers, **plus** the duplicate preflight (N4).
   **The sweep is now load-bearing, not optional: O4 is unruled, so PR-4 is held and there is no
   clock.** Shipping the widened index without the in-door sweep ships the deadlock with no drain.
7. **B6** — distinct document ids / sha256s / normalized invoice ids, duplicate-overrides excluded,
   posting-date span **and** trusted `approved_at` span ≥14 days (ruled (a)).
8. **B7** — basis must cover all three documents' `invoice.vendor_name` / `invoice.invoice_id` regions
   with normalized-text equality to the derivation's values (ruled (d)); `citation_count` naming.
9. **M1** deferrable FK + pre-minted uuids + bidirectional honesty checks · **M2** 4000-char rationale
   cap · **M8** door-side `sightings` closed-key check · **M9** byte-exact `pb_*` regexes + pairing ·
   **N1** call the derivation once · **M4** post-hardening sha; re-take A.5 at `0147`.
10. **M7** — fold G1–G8 + 裁-32 + the technical rulings **and O1/O2/O3** into design/annexes **before**
    authoring, and add the missing `decline` verb specification.
11. **O1 as ruled** — ship `binding_identity_review()`, a read-only census of live bindings whose F3
    could only have passed on the name arm or whose counterparty family is ambiguous. No retroactive
    revoke; a human decides per row.

**PR-2 — the tenth `row_kind`.** **N3**: splice against `0146`'s post-splice sha, re-censused at merge.

**PR-3 — the post-time re-check.** **B8**: write the contract first; **splice, never retype**; **port
from `0046:1364-1420`, not `0029`**; port the full fourteen-step control (lock the exact binding, re-read
facts/OCR, re-validate receipt shape, re-resolve counterparty, the first-reason-wins ladder, persist
`phase='post'`); gate on `e.vendor_binding_id is not null`; **reversals bypass; refuse on revoked,
annotate-and-post on expired (O3 as ruled)**;
apply `name_family_is_ambiguous` (C1). **M3**: re-point or retire `post_control_absent`. Add concurrent
revoke / expiry / re-extraction tests.

**PR-4 — the expiry sweep engine source. HELD, UNBUILT, until the owner rules O4.** When it is built,
**M6**: exact disabled-at-birth registry row, due predicate, workflow export + model pin, pool,
idempotent core; enable **only** via `set_wake_source_enabled`; receipt every run **and** every
`proposed→expired` transition (law 80). **While it is held, PR-1's in-door sweep (B5) is the only
drain** — do not let the widened index ship without it.

**Frontend train.** **M4** delete the copy-flip item (and re-cut the copy for 裁-32's wider wall) ·
**M2** rationale plain, separated, labelled · **N2** model labelled self-reported · **M5** read through
`agent_receipts_visible` · surface `effective_proposer`, not `created_by`, in the "Proposed by Clara"
chip and the sign dialog.

## 9 · What this gate did NOT find

Recorded so absence is not read as an unexamined area. **The wake-kind choice is correct and
measured** — `clara_wake_autodraft` does not exist (migrations **and**
`packages/db/deploy/roles-bootstrap.sql` agree: `{interactive, proactive, bank, filing}` + the
`bank_login` shell); `filing`/`interactive` credentials both carry `client_id IS NULL`
(`ck_wake_credentials_client_0011`, `0126:599-605`), so W3's firm wall is required, not padding; zero
new roles ⇒ the W2/W3 roles-bootstrap law does not fire; annex A.4's delta is right. **No cross-tenant
or credential exposure** was found: W3 + the resolver's own firm proof + the receipt's composite FKs
are congruent, and the receipt carries zero non-owner table grants. **No model-authored value reaches
the binding row** — which C1 shows is necessary but not sufficient, since the corpus feeding the
derivation is the attack surface, not the arguments. **The battery is strong where it exists** (B5's
allowlist-vs-grant cell, B10's adversarial ACL twin, W10-b's other-direction probe, E-7's non-vacuity
control, R-7's real-INSERT probes); the gaps are cells that do not exist yet — identity/name-family,
effective-proposer, decline+revoke suppression, the propose-vs-sign race, the stale-proposal deadlock,
post-time concurrency, the enable ceremony — not the discipline of the ones that do.
