# F-A7b — the gate's must-answer set

> **This is the paper the owner rules from at the F-A7b sitting.** R8(a) made F-A7b a JOINT UI +
> backend design gate and named *"variable-client-materials playbooks … as named must-answer
> questions in that gate"* (`harness-audit-rulings-2026-08-26.md:114-118`). Q-C confirmed the
> **starting five** and ruled that the per-situation treatments — *"what Clara may build, must
> request, and must never fabricate (law 22)"* — **are proposed BY this gate and ruled here**
> (**mohe-grill-rulings-2026-08-27.md**:102-106). §1 is that proposal. §2 is every other open design
> decision.
>
> Companions: **`fa7b-onboarding-design.md`** (the design of record; its D-numbers are cited
> throughout) · **`fa7b-onboarding-survey.md`** (findings S1-S10, gaps G1-G14, absences A1-A10) ·
> **`fa7b-onboarding-annexes.md`**.
>
> **How to read each item.** Every question below carries four things and never fewer:
> **the question in plain words** · **the recommendation** (what the build would do if left alone)
> · **the fail-closed default** (what ships if the sitting runs out of time — always the safer,
> narrower arm) · **the cost**, stated rather than assumed away. Precedence on any collision is
> hard constraint 1: **accounting-correctness > backend contracts > design look and motion.**
>
> **The three laws that bind every §1 answer.** Digest **law 22** — *never fabricate; a gate whose
> evidence class does not exist in the world cannot be closed honestly, only deferred with its
> cause written down* (`docs/adr/README.md:224-227`). Digest **law 79** — attribution and judgement
> run under walls, and **unsure → she asks** (`:465-467`). Digest **law 71** — **opening-seed
> approval is a RESERVED human act** (`:413-415`), and nothing in §1 moves it.

---

## 1 · The five playbooks — per-situation treatment proposals

**The shared frame, so the five read as one design and not five.** Every branch produces the same
three artefacts and they are the only three: a **materials checklist** (each row *received* with a
document id · *requested from you* with what and why · *will not exist* with the human's recorded
reason — design §3.4), an **opening disposition** (a document-tied seed · a keyed seed · **no
seed**), and an **`opening_capture_plan`** plan item that says in the owner's own words what is
outstanding. **There is no fourth, implicit state**, because an implicit state is where a
fabrication hides.

**The DB walls all five run into, measured once here.** A seed's tie document must be
`opening_balance_doc` or `management_account` — `CLR02`, `0017_wave_b.sql:2914-2918`.
`_assert_opening_tie` refuses unless there is ≥1 `opening_tb_targets` row, **no null
`account_code`**, **every delta exactly zero**, and **opening-balance-equity nets to zero** —
`CLR31`/`tie_mismatch` and `CLR31`/`obe_not_nil`, `0017:3674-3698`. The seed slot is **one-shot per
client** (`CLR31`/`duplicate_seed`, `0017:2925-2932`). And `commit_client_onboarding` will activate
a client on a merely **deferred** opening — its third arm, `carry_down_deferred` in state
`deferred` (`0017:2812-2822`; survey S4).

### ⓪ Green-field — the existing case, restated for contrast

A brand-new entity with nothing before commencement. `opening_position = new_first_year`, item
`first_year_zero_opening` answered, Gate O arm 2, no seed
(`interview.v2.questions.ts:61-63`; `0017:2814-2816`). **May construct:** the whole book from
commencement. **Must request:** the commencement date. **Never fabricate:** a pre-commencement
balance of any kind. **Unchanged by this item.**

### ① Predecessor hands over audited FS + GL — **the gold path**

**What the firm receives.** A signed statutory pack (SOFP + SOCI), the predecessor's general
ledger, and usually a certified trial balance — the "ROME PROPERTIES rigor" bar
(`wave-g-e2e-corpus-design.md:143-146`, items 1-2-3-4-7 of the seven-item package `:150-158`).

| | |
|---|---|
| **Clara MAY construct** | the opening TB targets by the **deterministic parse** of the handed document (`POST /api/opening/parse-targets`, `apps/dashboard/app/shared/openingApi.ts:420-426`) — a DB/runtime computation, not a model read · a **proposed** mapping from the predecessor's chart to our CoA, every line human-confirmed before it counts · an FS-to-GL reconciliation stated as **narrative** (TA-P10 C′: an aggregate may be said and cited, and may never become an authoritative number) · a named-differences list where the two disagree |
| **She MUST request** | which document is the tie (the human declares the kind at the intake door) · the as-of date and the FY end · confirmation of every mapped account line · **the approval itself — law 71, unmoved** |
| **She must NEVER fabricate** | a TB line that is not printed on the handed document · **a balancing figure to make the tie pass** · a mapping presented as established rather than proposed · the auditor's name, opinion or date |
| **DB path** | `create_opening_seed` **with** `p_tie_document` + `p_tie_sha256`; the FS files as `opening_balance_doc`, the GL as `prior_gl` — **evidence, never the tie**, because `prior_gl` is not an admissible tie kind (`0017:2915`; survey S5) |
| **End state** | seed `finalized` → Gate O **arm 1** → client `active` with a real, tied opening |

**Recommendation.** Build this branch first and completely; it is the only one of the five that
ends in an opening that ties to a signed original, and it is the branch the Wave-G oracle tier
actually has papers for. **Fail-closed default if unruled:** treat as ② (keyed, not
document-tied). **Cost of that default:** the byte-tie to the signed original is lost, and with it
the only mechanical proof that the opening is the predecessor's and not ours.

**Sub-question — does an audited FS need its own `document_kind`?** **Recommendation: no.**
`opening_balance_doc` is the tie kind and `prior_gl` the ledger; a new kind costs four surfaces at
once (`filing-and-interview-design.md:320-323`). The human's declaration at the door is recorded on
the receipt, so "which document this was" survives without a new enum value.

### ② Values-only management accounts

**What the firm receives.** An unaudited management pack — often a spreadsheet print — with
figures and no ledger behind them.

| | |
|---|---|
| **Clara MAY construct** | the same deterministic parse when the pack is machine-readable — **`management_account` IS an admissible tie kind** (`0017:2915`), so a document-tied seed is lawful here · a proposed CoA mapping, human-confirmed line by line · an **"unaudited" provenance label** carried on everything downstream |
| **She MUST request** | an explicit human acknowledgement that the opening rests on unaudited figures, **recorded as a plan item, not as a checkbox that disappears** · the missing side when the pack prints only a P&L · the approval |
| **She must NEVER fabricate** | an audit assertion of any kind · **the other half of an incomplete pack** — a management pack that prints a P&L and no balance sheet does not contain an opening position, and inferring one is the fabrication law 22 names |
| **DB path** | document-tied on `management_account` when the pack is parseable; **keyed fallback** when it is not — the runtime's 422 is the designed signal (`openingApi.ts:415-417`), and a keyed seed needs its own once-per-seed human attribution through `record_opening_keyed_resolution`, which pins `method='human'`, `confidence=1.0` **server-side with no caller confidence argument** (`openingApi.ts:269-288`) |
| **End state** | seed `finalized` → Gate O arm 1 → `active`, with the unaudited label live |

**Recommendation.** Document-tied when the pack carries both statements; keyed when the figures are
typed from a spreadsheet; **always** with the recorded unaudited acknowledgement. **Fail-closed
default:** keyed + acknowledgement. **Cost:** a keyed seed is slower — every line is a human act —
and that is the correct price for figures nobody certified.

**Sub-question, and it is an accounting-correctness one, so it is the owner's (constraint 1):**
**does an unaudited opening change what the FY1 statutory pack must say?** Recommendation: the
basis-of-preparation note names the opening's source and its unaudited status. **Cost:** a report
spec change, in F-A5's territory, not this item's.

### ③ Bank statements only — **the sharpest law-22 case of the five**

**What the firm receives.** Bank statements. Nothing else.

| | |
|---|---|
| **Clara MAY construct** | the bank-account registration and the statement entry (F-A3's live verbs) · the transaction stream from the statement's first date forward · **the opening BANK balance as one known figure with its cite** — and only that one figure |
| **She MUST request** | everything else, or the human's ruling that there is no opening to capture |
| **She must NEVER fabricate** | **the other side of the entry.** A bank balance is one line. Forcing its counterpart into opening-balance-equity and calling the result the client's capital invents an equity position out of a cash figure. This is the case the gate exists to name |
| **DB path** | **none — and the DB already says so.** A bank-only opening leaves OBE non-nil by construction, so `_assert_opening_tie` refuses `CLR31`/`obe_not_nil` (`0017:3693-3697`). The wall is not advisory and it is not new |
| **End state** | **no seed.** Gate O **arm 3** (`carry_down_deferred` in `deferred`, `0017:2817-2819`) → `active` **with the deferred-opening banner up** (design D-6) |

**Recommendation.** No opening seed. Activate deferred, banner visible, and **Clara's first job is a
chase list** — what is needed before an opening can exist — following law 80's own precedent that
*"a missing statement yields a chase notice, never a fabricated reconciliation"*
(`docs/adr/README.md:470-472`). **Fail-closed default:** exactly that.
**Cost, stated plainly for the owner rather than buried:** until an opening exists or the year is
genuinely the entity's first, this client's FY1 statutory pack cannot honestly be filed. That is a
real engagement cost and the product should say it on the screen on day one, not discover it at
close.

### ④ Shoebox

**What the firm receives.** A bag of source documents. No summary of any kind.

| | |
|---|---|
| **Clara MAY construct** | the document corpus itself — intake, classify, extract, file · a **reconstruction plan**: an ordered, costed list of what a prior period would need · posting from the documents forward, once the opening question is settled |
| **She MUST request** | the same as ③, plus **the decision on whether to reconstruct the prior period at all** |
| **She must NEVER fabricate** | an opening · **a "derived" trial balance assembled from partial documents and presented as the opening TB.** A total computed from an incomplete corpus is not an opening position; it is a number with no closed world behind it |
| **DB path** | as ③ — no seed, `carry_down_deferred`, banner |
| **End state** | `active`, deferred, with an `opening_capture_plan` item recording **"reconstruction not commissioned"** in as many words |

**Recommendation, and it is the distinction that matters between ③ and ④.** A shoebox often
*does* contain enough to reconstruct a prior period — which is precisely why **the interview must
not silently start one.** Reconstruction is a separate engagement with its own scope and its own
fee; the interview names it as a decision and stops. **Fail-closed default:** no seed, deferred,
banner, the plan item written. **Cost:** a firm that wanted the reconstruction has to ask for it —
one extra conversation, against the alternative of an unbilled, unscoped rebuild starting itself.

### ⑤ Mid-year switch with a records gap — **the hardest**

**What the firm receives.** A predecessor's close covering part of the year, then a period with no
records, then the client's current papers.

| | |
|---|---|
| **Clara MAY construct** | the opening seed from the predecessor's TB, exactly as ① or ② · **the GAP itself** — its start and end dates derived from the `financial_date` range of the documents she actually holds, which is a DB-owned computation over DB-owned rows · a typed open question per gap period · the named unexplained difference where the opening plus recorded movements does not meet the first recorded balance |
| **She MUST request** | the gap's records — **or a human ruling that the gap is empty**, recorded as the human's assertion with their name on it, never as her inference |
| **She must NEVER fabricate** | transactions inside the gap · **a plug entry bridging the opening to the first recorded balance.** The difference is a named, carried, visible difference until a human disposes of it through a real audited door |
| **DB path** | `create_opening_seed` with `p_as_of` = **the predecessor's TB date**, not the FY start. *No CHECK tying `p_as_of` to a fiscal-year boundary was found in `create_opening_seed`'s body (`0017:2885-2941`) — **PREDICTION P-6**, to be confirmed by rig replay before this branch ships* |
| **End state** | seed `finalized` at a mid-year date, plus one open question per gap period, plus the difference carried by name |

**Recommendation.** Seed at the predecessor's date; open the gap questions; **never plug.** The
close's own machinery then holds the line: drawer 1 **must be CLEARED, never overridden — no
attestation path exists** (`wave-g-e2e-corpus-design.md:238-240`), so the gap cannot be attested
away at close. **Fail-closed default:** treat as ③ — no seed at all — if the mid-year `p_as_of`
prediction fails. **Cost:** the close cannot seal until the gap is filled or formally disposed of.
That is the cost of not plugging, and it is the right one.

---

## 2 · The open design decisions

### Q-D1 · When may Clara open a client file unattended, and when must she propose? — **the big one**

**Plainly:** TA-P1 C already grants that *"Clara may open a client file"*
(`filing-and-interview-design.md:74-77`), and law 71's open register makes her judgement the
unattended authority. But R8(a)'s own scenario uses the word **"proposes"**
(`harness-audit-rulings-2026-08-26.md:119`). Which is it — and is that a contradiction?

**It is not a contradiction, and the answer is a narrowing of WHEN, never of WHETHER.** Law 79
already supplies the rule: judgement under walls, **unsure → she asks**
(`docs/adr/README.md:465-467`). A new client is exactly the "unsure" class when the only evidence
is a name.

**Recommendation.** She opens the file **unattended** when the family predicate
`name_family_is_ambiguous(firm, name)` returns false (`0103_f_a7_pi_additive.sql:781`) **and** the
document carries a printed registration identifier (TIN/SSM) that resolves to no existing client.
She **proposes** in every other case — which is R8(a)'s scenario, an *unknown counterparty*.
**Fail-closed default:** propose in all cases. **Cost of the default:** one human click per new
client, against a permanent client row (law 6 — no delete verb anywhere, survey absence A6) opened
on a name alone. **The default is cheap and the error is forever; take the default unless the
owner wants the speed.**

### Q-D2 · What is `accept_onboarding_proposal`'s floor — bookkeeper+ or admin?

`begin_client_onboarding` is **admin**-floored today (`0017:2497`). Accepting a proposal *is*
opening a client. **Recommendation: admin**, matching the human door it stands beside — a lower
floor on the agent-assisted path would make the assisted route the weaker one, which is backwards.
**Fail-closed default: admin. Cost:** in a small firm the bookkeeper must fetch the principal;
against a bookkeeper being able to mint permanent client rows from a proposal card.

### Q-D3 · Gate O's human wall — a seeding discipline, or a predicate?

**Plainly:** Annex K says Gate O stops a Clara-opened file from activating without a human
(`filing-and-interview-annexes-2.md:477-478`). **It does not** — Gate O checks only
`cardinality(contributors)=0` (`0017:2788-2791`) and the birth path seeds `contributors` with the
opener (`0017:2512-2515`), so an agent opener satisfies it alone (survey S2).

**Recommendation:** the wake birth core seeds `contributors = '{}'` and leaves
`review_maker`/`reviewed_at` NULL — both legal (`0017:1010`, `:1022-1023`) — so the existing
refusal does exactly the claimed work **with no CoR of a live human body**, honouring TA-P1 C's
sibling rider. **Fail-closed default: the same.** **Cost:** the wall then rests on a seeding
choice a future writer can undo without touching the gate. Registered as a widening against a
later item, with that sentence attached, plus the cell pair that fails loudly (design D-2).

### Q-D4 · Does the proposal ride the existing carrier or a new relation?

**Recommendation: the existing `firm_open_questions`**, with `kind` gaining
`'onboarding_proposed'` (extend-only, over the six at `0103:563-565`). It is already firm-scoped
with no `client_id` (`0103:559-593`) and already carries candidates, opener and receipt.
**Fail-closed default: the same.** **Cost:** one closed-world CHECK extension that needs a census
in both directions (annexes, R4) — against a second relation putting two items on one semantic
(TA-P11).

### Q-D5 · May the materials fork DERIVE `opening_position`, or must it always ask?

The driver's contract is question → validate → echo → confirm
(`interview.v1.core.ts:248-275`), and the two item keys it writes are read by name inside
`commit_client_onboarding` (`interview.v2.questions.ts:59-60`). Deriving an answer from
`materials_basis` would skip a park. **Recommendation: always ask; let the derivation only
pre-fill the echo**, so the human confirms a sentence rather than a blank. **Fail-closed default:
the same.** **Cost:** one extra park per onboarding — against a confirmed answer that no human
actually read.

### Q-D6 · May a close SEAL while the deferred-opening banner is up?

**Plainly:** today a client can go `active` with its opening uncaptured (survey S4) and nothing
downstream knows. **Recommendation: it may not seal.** An FY1 pack whose opening was never captured
is not a true and fair statement of position, and constraint 1 puts accounting-correctness first.
The honest mechanism is drawer 1, which *"must be CLEARED, never overridden"*
(`wave-g-e2e-corpus-design.md:238-240`). **Fail-closed default: it may not seal.**
**Cost:** clients on playbooks ③/④ cannot close FY1 until their opening question is settled — which
is the true position stated early rather than discovered at seal.

### Q-D7 · May the re-triage file the held document unattended?

**Recommendation: yes** — law 79 already rules attribution is her judgement under walls, and the
walls are the same B1-B9 rungs, with B2's collision guard now seeing the very client she proposed.
**Fail-closed default: it lands as a proposal on the newborn client's queue.**
**Cost of the default:** R8(a)'s word **"auto-attributes"** stops being true, and the acceptance
sentence must be re-worded rather than quietly re-interpreted.

### Q-D8 · Which wake kind carries the interview normalizer — and does it ship at all in train 1?

The firm-narrow purpose's `onboarding_interview` moment is **live and unconsumed** (`0123:655`,
`:713`; survey absence A3). By interview time the client exists, so `interactive_client` fits its
own CHECK (`0126:603`) and needs no new kind. **Recommendation: `interactive_client`, one allowlist
row.** **Fail-closed default: no normalizer in train 1 at all** — the interview stays human-typed
and the wall is absence, the cheapest correct thing. **Cost of the default:** the handover pack
still has to be read by a person, which is most of the labour F-A7b exists to remove; **this is the
one default whose cost the owner may well want to pay to avoid.** Note that this train carries
law 28's mandatory cross-model adversarial pass either way it is ruled.

### Q-D9 · Does an unaudited opening (playbook ②) change the FY1 pack?

Restated from §1②'s sub-question because it is an **accounting-correctness** call and therefore the
owner's, not the build's (constraint 1). **Recommendation:** the basis-of-preparation note names
the opening's source and its unaudited status. **Fail-closed default:** name it.
**Cost:** a report spec change in F-A5's territory, not this item's — so ruling it here schedules
work elsewhere, which is why it is asked here rather than assumed.

### Q-D10 · The consent paper owes two lines

**(a)** The legal template's purpose table still reads *"(key not yet minted)"* for document
classification and attribution (`docs/ops/legal/client-ai-authorization-letter-template.md:93`).
`document_processing` **is live** — the five-value CHECK at `0123:271-286`. A client signing today
should see the real key. **(b)** F-A7a's design says the three existing clients each need **one
supplementary consent line** and that *"until a client's line exists that client's classify lane
holds at enqueue"* (`filing-and-interview-design.md:340-342`) — §7 of the template is the
mechanism (`:401`). **Recommendation: true the table and run the supplementary line for all three
clients before F-A7b's acceptance walk.** **Fail-closed default: the same** — the lane holding is
the intended, visible, fail-closed posture, not a bug to route around.

### Q-D11 · The admissible-kind spellings — map, or widen the CHECK?

Five of F-A7a's six admissible onboarding-intake kinds
(`filing-and-interview-design.md:314-317`) are **not** live `documents.document_kind` values; the
live world is twenty (`0123:2054-2061`) and only `bank_statement` matches exactly.
**Recommendation and fail-closed default: map onto live kinds, no CHECK change** — a widened kind
world touches four surfaces at once (`:320-323`). **Cost:** the door's list is less legible than
its ruled spelling, so the UI shows the ruled label and stores the live kind, and the mapping is
written down once rather than re-derived per screen.

### Q-D12 · The pre-activation `document_intakes.origin` — extend, or not?

F-A7a promised `origin = 'onboarding_interview'` (`filing-and-interview-design.md:330-333`, listed
among its ALTERs at `:426`) and **it was never done** (survey S10, absence A9). The live CHECK is
two-valued (`0007:104`) and its paired constraint (`0007:131-133`) ties each value to the presence
or absence of `chat_session_id`, so a third value re-cuts two constraints.
**Recommendation and fail-closed default: do not extend it.** The class is already reachable by its
other half — a filing-less `documents` row, returned by `list_unassigned_documents`
(`0011:3943-3965`) — and its disposition is identical either way. **Cost:** the class has no
single positive marker, so a census over it is a join rather than a column read.

### Q-D13 · Digest law 79's as-built caveat is stale — re-true or re-measure?

Law 79 still reads *"the live `assert_client_resolved` body still enforces
`method in ('human','rule')` … **until F-A7a recuts it**"* (`docs/adr/README.md:468-469`). F-A7a's
α train has landed (`0124`, `0125` at the frontier). **Recommendation: re-measure by rig replay,
then re-true the caveat with the date** — not edit it from the migration text, because that is the
superseded-body class this estate has paid for repeatedly. **Fail-closed default: leave it and flag
it**, which is what this gate does. **Cost:** one replay.

---

## 3 · What this gate does NOT decide

Firm creation and the three firm tiers — **R8(b)**, its own design gate and its own security
review (`harness-audit-rulings-2026-08-26.md:122-130`). Pricing amounts — **R8(c)**, its own
sitting (`:132-141`). Dual attribution — F-A7a's OW-2 (`filing-and-interview-design.md:479-482`).
The Wave-G corpus's per-client acceptance figures — **OD-3, still open for every slot but BEE**
(`wave-g-e2e-corpus-design.md:160-164`), and **the build never proposes one.**
