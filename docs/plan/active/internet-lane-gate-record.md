# F-A8 PR-0 — the gate record (gates 1 and 2)

> **Gate 1 ran 2026-08-22** against design **v1** (`internet-lane-design.md` +
> `internet-lane-survey.md` + `internet-lane-annexes.md`): the **independent judgement-logic
> review** (law 1) — a **bytes** lens (every migration cite verified at file:line, every
> closed-world census and roster measured, the D1 list re-derived independently) and a
> **rulings** lens (gated against `wave-f-contract.md` §F-A8, ADR-0074's TA-P1..TA-P14 and the
> F-A2 bar) — **every finding adversarially re-verified by an independent verifier whose
> re-graded severity governs**.
>
> **Verdict: five blockers, nine materials. The design's core shape HOLDS; the width is severed
> into seven limbs; the document set is reconciled.** Every finding below names its fold target;
> **the fold is v2, and `internet-lane-annexes.md` Annex H is its change-log entry.**
>
> **Gate 2 — leg 2, the law-28 cross-model pass — RAN 2026-08-23; §10 is its record.** (This
> header previously read "Leg 2 has NOT run … an open obligation, see §8.1"; §8.1 stands as the
> statement of what was owed.) **Twenty findings, all CONFIRMED, none refuted; the fold is design
> v3 + `internet-lane-annexes-2.md`.** "PR-0 done" still may not be read off this record alone —
> the walls have to be IN the PRs that need them (design §7).
>
> Standing caveat: migration-source reads are **predictions** about the live catalog; PR-1's and
> PR-3's rig replays confirm the decisive ones (§9).

---

## 1 · What was attacked and HELD (clean bills, recorded so they are not re-argued)

- **§2's TA-P1 reasoning.** The rulings lens attacked it directly and found nothing: the design
  correctly reasons through why a **pending** constitutional amendment does not change this
  item's shape either way (approving a statutory rate is the "goes external" case under either
  reading of law 71, so it was never a candidate for Clara-held authority). The lens called it
  "the strongest section in the document." **Ships as written.**
- **The owner-one-click-door-not-a-PR shape (TA-P2/A+)** and its **by-name** relaxation of
  `0016`'s migration-only assertion — never a silent route-around. Correct against the ruling.
- **The three-table Tier-1 closure** (F-A8-M5/A). Contract-faithful. The model **price** table is
  F-A9's by the contract's own F-A9 section plus `metering-design.md` §3.5 — the "F-A8 dropped
  it" finding was REFUTED (§7).
- **The deferral of the SST *rate* table's schema to F-T1** (F-A8-OQ-5/A), with the dependency
  named explicitly rather than silently assumed.
- **Citation as a TOOL-BOUNDARY mechanism** (F-A8-M1/A) — a deferred constraint trigger, not a
  prompt line. Satisfies hard constraint 2's "structural, not prompt-level."
- **TA-P7 does not bind** — F-A8 attributes nothing to a client. Correctly ruled out.
- **TA-P5's "visible notice + hold button" rider is NOT owed here.** A candidate finding was
  checked against the ruling's own text and REFUTED: the rider is scoped to the bank/close lanes
  (F-A3/F-A4), not to F-A8's Tier-1 fetch. The design's silence is correct.
- **No case was found** of the design re-imposing a human gate TA-P1 removed, or of it reaching
  into any of the seven charter-reserved acts.
- **Zero CoRs is correct for F-A8's own verbs** — the bytes lens grepped every
  `create [or replace] function` lineage the item touches and confirmed no live body is recut.

---

## 2 · Blockers — the build may not start until each is folded

### GB-1 · A model-chosen numeral can land in a Tier-1 table with both mechanical checks green
*(bytes lens; CONFIRMED blocker.)* `wake_submit_policy_draft`'s v1 signature
(`internet-lane-design.md` v1:72) took **three independent inputs** — `p_payload`, `p_sources`,
`p_effective_date`. `_policy_sources_agree(p_sources, p_table_key)` compares the sources to **each
other**; `_policy_value_plausible(p_table_key, p_payload)` compares the payload to a band of the
**current live row** (v1:98-99). **Nothing compares `p_payload` to the values quoted inside
`p_sources`.** Submit two genuine BNM quotes of 4.7100 with `p_payload = {rate: 4.8100}`: sources
agree (pass), 4.81 sits inside any sane band (pass), status → `pending_approval`, the owner
one-clicks, and `_policy_draft_commit_core` writes **4.8100** into `fx_rates` as the authoritative
rate for every client. The verifier grepped the whole file: `p_payload` has three hits — the
signature, the storage column, the plausibility check — and no predicate ever reads it against the
quotes. The design's own v1:94 sentence ("neither is bypassable by a clean-looking payload") is a
claim its mechanism does not deliver. The C1 precedent it cites has the opposite shape: F-A1's
witness pair compares the two **reads** and the persisted fact is derived **from them** — there is
no third, separately-supplied value.

**Fold (design v2 §3.1).** `p_payload` is **deleted from the wrapper**. Three versioned
predicates replace two: `_policy_extract_quoted_value(p_table_key, p_quote)` (total, versioned,
per-table-key parse), `_policy_sources_agree(p_table_key, p_sources)` **returning
`(verdict, derived_value, extracted)`**, and `_policy_value_plausible(p_table_key, p_derived)`
over the derived value. The core writes `payload` from `derived_value` and stamps
`extractor_version`. The owner door **re-derives from the stored sources** and refuses
`(CLR10, draft_value_drifted)` on any difference. Cells C.1b (a signature census with an
adversarial twin), C.2b (the forced cell: agreeing quotes of 4.7100 + a rationale asserting
4.8100 → 4.7100 lands and 4.8100 exists nowhere), C.2c.

### GB-2 · The annex file was a DIFFERENT, incompatible design
*(both lenses independently; CONFIRMED blocker on each.)* `internet-lane-annexes.md` (mtime
19:54) predates `internet-lane-design.md`/`-survey.md` (22:17 / 22:15) by ~2.3 hours and
specifies another architecture: verbs `request_fetch_tier1_source` / `wake_fetch_tier1_source` /
`promote_tier1_row` / `reject_tier1_row` / `_promote_tier1_row_core` / `_web_research_core` over
tables `tier1_fetch_attempts` / `web_research_receipts` / `web_citations` /
`tier1_draft_receipts` / `tier1_promotion_receipts`, with a decision register IL-D1..IL-D11 keyed
to those names. **Zero overlap** with the design's verb/table set. Its §-cites (`design §3.3`
…`§3.7`) resolve to nothing (the design's §3 has only §3.1/§3.2); its "survey findings F1-F9" is
stale against F1-F15; its IL-D7 flatly contradicts the design's ODQ-3. The design names only the
survey as its companion and carries its own inline battery and register — while **every other
Wave-F item's design doc names its annex file explicitly**, strong independent evidence that this
one is an abandoned draft. A builder following the annex's own header would build against verbs
and tables that do not exist. This is TA-P11's two-architectures failure surfacing before any
code.

**Fold.** **The design doc of record WINS.** `internet-lane-annexes.md` is **re-cut wholesale**
against design v2 — nothing of the old vocabulary survives; the header states the supersession in
full so no reader can mistake the old content for live scope. The design's inline battery and
register **move** into the annex (Annex C / Annex D), which also gains Annex E (DDL posture),
Annex F (censuses), Annex G (rig replay) and Annex H (the change log); the design keeps an annex
map (§9). **One idea from the abandoned draft is reinstated on its merits** —
`tier1_fetch_attempts`, which the rulings lens independently found the design owed (GM-9).

### GB-3 · The `sst_threshold_schedule` supersede ALTER is unbuildable as written
*(bytes lens; CONFIRMED blocker.)* `0016:237-244` creates the table with exactly
`(service_group, threshold_cents, effective_from, effective_to, source_note)` and
`primary key (service_group, effective_from)` — **no `id` column of any kind**. The
`client_facts` idiom the design commits to reusing (v1:134-136) works only because
`client_facts` has a uuid PK (`0055:387`) for its deferrable self-FK (`0055:403`) to reference.
`alter table clara.sst_threshold_schedule add column superseded_by uuid references
clara.sst_threshold_schedule(id)` **fails at DDL time**. Two further gaps in the same limb: the
survey's ALTER column list (v1 survey:202) omits the `basis`/`basis_kind` pair the design's own §4
requires so a reader of the LIVE row needs no join, and it never mentions the table's existing
`source_note not null check (btrim(source_note)<>'')` (`0016:242`) which the commit core must
satisfy. *(Corroborating: F-A9's `llm_price_table` — the estate's other composite-PK policy table
— solves the same shape by carrying no self-FK at all. F-A8 needs one, so it must add the key.)*

**Fold (design v2 §3.1).** The ALTER adds, in order: `id uuid not null default gen_random_uuid()`
**plus `unique (id)`** — the composite PK and every existing reader untouched — then
`superseded_by` (deferrable self-FK to `(id)`), `superseded_at`, the paired CHECK, `recorded_by`,
`basis`, `basis_kind`, and a governed-origin conjunct
`check (recorded_by is null or (btrim(coalesce(basis,'')) <> '' and basis_kind is not null))`.
All new columns nullable, so the two seed rows stay valid with no backfill. The core writes the
agreeing sources' URLs + accessed dates into `source_note`. Cells C.5b/C.5c/C.5d; the whole limb
moves to **its own PR** (§6).

### GB-4 · TA-P8 is stated backwards, and the ruling is cited as authority for the inversion
*(bytes lens; CONFIRMED blocker.)* ADR-0074 §TA-P8 (`docs/adr/0074-the-track-a-sitting.md`) rules
**B**: identifiers Clara learns by judgement — explicitly including **web-found registrations** —
are "recorded in the knowledge layer as CONTEXT for her next judgement, never written as
exact-match keys," and "the promotion door… is granted." The sitting's member table scopes TA-P8
to **three** items — F-A3 · F-A7 · **F-A8** — and its member **F-A8-M4** is literally "can
web-found identity facts enter the KB", ruled **B** (option A, "the KB never admits them", was
**rejected**). Design v1:46-49 states the opposite as "the ruled shape (fixed, not designable)" —
"never enter the knowledge base… not even as unconfirmed context… they stay out entirely" — and
v1's non-goal says building the door "is explicitly what TA-P8's ruling warns against." TA-P8
**grants** it. Survey F12's supporting byte proves only that the *citation provenance enum* has no
`'web'` member; `wiki_pages` already carries `fk_wiki_pages_counterparty` and `source_kind`
already admits `'counterparty'`/`'human_note'` (`0017:843-848,915-921`), so the KB body is not
closed by that CHECK at all.

**Fold (design v2 §1, §8; survey v2 F12).** The inverted paragraph and the non-goal are re-cut to
the ruling's actual text. **F-A8 v1 still writes nothing to the knowledge layer** — but as a
*scope* choice with F-A7 named as the owner of the identity learning loop and of TA-P8's granted
promotion door, **not** as a prohibition TA-P8 imposes. Whether F-A8 or F-A7 owes the context
landing is **owner item OI-1** (§8); the fail-closed default the build proceeds on is the narrow
one. *(One thread of the original attack — that the design "drops contract line 124's KB-citation
clause" — did **not** survive: TA-P4/A's in-place contract amendment narrowed Tier-2 citation to
the fetch tool's own citation row with no KB mention, and the design implements the ruled
narrowing faithfully. Recorded in §7.)*

### GB-5 · Tier-2's "structural insulation is an ABSENCE" claim is false at its own signature
*(bytes lens; CONFIRMED blocker.)* Design v1:173-178 asserts "there is no wire for client content
to travel on." The signatures (v1:145-147) carry `p_query`, `p_purpose`, `p_rationale` — **three
model-authored free-text fields**. `wake_web_search(p_query := 'ROME PROPERTIES SDN BHD SSM
registration number')` is fully schema-legal, and nothing in the DB, the runtime guard (which
only checks the resolved fetch address) or the battery inspects their content. Cell C.12 asserted
only that no parameter is **named** `client_id` — a spelling check, review law 3's exact failure
mode, and the design itself concedes the cell is "a schema-shape assertion, not a runtime-
behaviour one." The owner's actual ruling (F-A8-OQ-2 = A) is a **behavioural policy** ("v1 may
only ask general/regulatory questions"), not a claim that a wall exists — and the same sitting's
F-A8-M1 entry is honest about exactly that distinction ("prompt-level, not structural, per G7's
precedent"). TA-P3 = A, ruled the same day, exists **because** model-directed vendor egress
carrying client content is a PDPA-relevant disclosure; opening a new such channel while asserting
it is structurally closed runs against the sitting's own direction. Separately, the design never
names the Tier-2 search **vendor** — one of the agenda's own five F-A8 design-layer questions
(R-B), silently dropped from the register.

**Fold (design v2 §3.2).** Three parts, stated separately and honestly: (a) the **absence** — no
`client_id`, no client-name column, no typed client handle, and a future identity-bearing purpose
is a NEW verb under a NEW TA-P3 purpose; (b) a **closed world** — `p_purpose` ∈
`('regulatory_lookup','general_research')`, refused `unknown_web_purpose` otherwise, deleting the
free-text purpose channel outright; (c) a **refusal predicate** —
`_web_text_is_client_free(p_firm, p_text)` inside `_web_read_core` over `p_query` and
`p_rationale`, refusing `(CLR10, client_identity_in_query)` on a live client name or a
`client_identifiers` pattern for the credential's own firm, with the firm read from the wake
context. The design **states its one-directionality**: a match refuses, a miss certifies nothing
(risk R5). C.12 becomes **C.7e** — a forced refusal on a real client name with a network-call-count
assertion and an adversarial twin (stub the predicate `true` and the same fixture succeeds); the
old spelling check survives as C.7f, a tripwire, never the proof. The vendor question becomes
**ODQ-7** with a fail-closed default: **`wake_web_search` does not ship until a vendor is named**;
`wake_web_fetch` may ship alone.

---

## 3 · Materials — each folds into v2

**GM-1 · The census used the wrong instrument, and the proposed truing could never refuse.**
Survey v1:175-177 searched `packages/db/deploy/*-postverify.sql` and concluded there is "no
standing regression test" for `sst_threshold_schedule`. The instrument production actually uses is
`packages/db/tests/` — and **`a21-watch.test.mjs:98-132` is a STANDING estate-suite test** (the
suite runs migrate → seed → every package's tests on **every code-touching PR**) that
independently re-derives the same writer census AND pins both seed rows' `effective_to IS NULL`,
which the commit core will close. Worse: because the design puts the DML in an **ungranted core**,
both the 0016 tail assertion (`0016:5216-5230`, conjunct
`a.privilege_type='EXECUTE' and r.rolname in (…)`) and the a21 prosrc scan keep passing — the
design silently routes around the very assertion survey F1 says must be relaxed **by name** — and
the survey's proposed truing ("no DML from any OTHER granted function") inherits the identical
blind spot: a wall that can never refuse (law 31).
**Fold:** Annex F names `a21-watch.test.mjs` and the truing rides **PR-3** (C.5g). The 0016 truing
is re-specified as a **reachable-closure** scan — granted wrappers **plus** the ungranted `clara.`
functions their prosrc names, transitively — with an **adversarial twin** (add a second throwaway
ungranted writer; the same scan must FAIL), cell C.5e, and its error text re-worded (C.5f, law 22).

**GM-2 · The estate's largest closed-world census was absent from a section whose whole job is
listing them.** `rig-meta.mjs:1014-1060`'s `grantMatrixFailures` (T17, wired at
`rig-isolation.test.mjs:531`) sweeps every `clara` function × every app role against a hard-coded
`ALLOWED` set (`:811-916`); each of F-A8's granted verbs reds it until the roster is edited by
name. `definerHygieneFailures` (`:1062-1074`) additionally requires every SECURITY DEFINER
function to pin `search_path` and be owned by `clara_fn_owner` — which v1 stated for exactly one
verb, and that the one verb not granted in PR-1. F-A2's own estate annex lists `rig-meta.mjs`
under "Helper/roster surgery (10)" for precisely this.
**Fold:** Annex F names the `ALLOWED` edits per role and per verb; Annex E states the DEFINER
posture for all ten new bodies; cells C.10a/C.10c/C.10e.

**GM-3 · The `'proactive'` single-use property is per-verb, and the new verb omitted it.**
A repo-wide grep for writers of `wake_credentials.consumed_at` returns **exactly one** hit:
`0004:674-678`, inside `wake_record_notification`. `assert_wake_allowed` (`0004:114-121`) checks
the allowlist and nothing else; `wake_context` (`0011:1133`) filters `consumed_at is null` but
never sets it. So v1's Tier-A ladder (v1:83-88) left the credential **replayable for its whole
15-minute TTL**, defeating the invariant `0002:227-228` states for the kind — and cell C.11 cited
`0004:674-679`, proving a **different function's** branch.
**Fold:** design §3.1 Tier A step 1 copies `0004:668-678` verbatim, including the replay
carve-out and the atomic-conditional-UPDATE ordering; cells C.1c/C.1d re-point at the new verb;
**IL-D12** records single-use as a **wave-level** per-verb obligation — the next proactive verb
hits this too.

**GM-4 · A phantom migration cite, and a recommendation resting on it.** Survey v1:204 cites
`entry_post_receipts` as living at "0037/F-A2". `grep -rn entry_post_receipts
packages/db/migrations/` → **zero hits**; `0037` creates `open_items` and
`open_item_allocations`. It is a table F-A2's design **proposes** and has not built
(`f-a2-agentic-posting-design.md:216`). ODQ-5's recommendation asserted that
"`entry_post_receipts`, `freeform_read_log` **are already separate physical tables**" — half of
that pair is imaginary.
**Fold:** the `0037` tag is dropped; the precedent is re-stated honestly as F-A2's unbuilt
proposal; the coupling is named as a cross-item dependency (design §6.5 — if F-A2's column shape
moves under review, `web_fetch_receipts` moves with it); ODQ-5 is re-derived from the one real
precedent, `freeform_read_log` (`0002:308`).

**GM-5 · A clause of a bound law was silently dropped.** Digest law 75 and the contract's own
F-A8 section carry **three** disciplines; v1 restated two and dropped "**official Malaysian
sources are preferred for rules questions**" — absent from §1's ruled shape, from all of Tier 2,
from the decision register, and from the non-goal list that exists "so silence is not read as an
oversight." (The abandoned annex draft actually had a mechanism for it.)
**Fold:** design §1 restates the clause; §3.2 mechanises it as a generated `source_official`
boolean on `web_fetch_citations`, **decorative for acceptance and load-bearing only for prompt
ordering**, with cell C.7h proving it never changes whether a citation or a fetch is accepted.

**GM-6 · Survey F8's roster measurement is wrong at the bytes.** `0002:553-559` seeds five rows —
four `'interactive'` **and `('proactive','wake_record_notification')`**. No migration ever deletes
a `'proactive'` row (`0007:1100` deletes an interactive one). Tracing all four mutating files
(`0002` → `0007` → `0011:3903-3910` → `0078:191`): **one `'proactive'` row and eight
`'interactive'` rows today**, not "zero and one". The headline conclusion survives independently —
minted **credentials** are genuinely zero (only `pools.mjs:308,330` and the autoDraft family
mint) — but the stated evidence did not.
**Fold:** survey v2 F8 re-derives the roster from all four migrations and separates the two
claims (rows vs credentials); cell C.10d asserts the pre-existing row is still present and that
F-A8 adds exactly three.

**GM-7 · The two Tier-B checks are declared "typed, non-raise" but parse model-authored text.**
`_policy_sources_agree` must extract a numeral from `p_sources[].quote`, free text composed from a
fetched page; `('RM500,000'::numeric)` raises `invalid_text_representation`, and a `p_payload`
whose value key is absent or a string raises inside `_policy_value_plausible`. Both run **inside
the core, in the same transaction as the draft INSERT** — so a raise rolls back the very
`needs_review` draft the design promises is never dropped. v1's ARM-0 handling covered only the
fewer-than-two-sources case. C1's shape does not transfer: F-A1's predicate compares two
already-**typed** facts and never parses raw display text.
**Fold:** design §3.1 states both predicates are **TOTAL by contract** — every parse guarded, any
unreadable input yielding `not_evaluable`, never a raise and never `pass`. Cell C.2g forces an
unparseable quote, asserts the transaction COMMITS with the `needs_review` row present, and adds
an adversarial twin (guard removed → aborts).

**GM-8 · Two cross-item sequencing collisions were unstated — and the third is worse than the
finding said.** *(CONFIRMED and strengthened.)* (1) `chatTurn`: F-A2's PR-2 lands `chatTurn_v13`
(`f-a2-agentic-posting-design.md:438-439`) and F-A8's Tier-2 wire-up repoints the same export;
live tip `registry.ts:46`. *Mitigated already* — F-A8 deliberately says "current frozen closure"
rather than hardcoding a predecessor — but the ordering was unnamed. (2) `wake_credentials`'
CHECK pair: F-A2's D34 extends both CHECKs; the verifier established the extension keeps the
three existing disjuncts **byte-identical** (`f-a2-annexes-2-mechanics.md:442`), so survey F9's
cite stays true — the **sub-claim that it is superseded is REFUTED** — but it must be cited as
"live, additively extended", never as a standing closed world. (3) **The strong leg:** F-A8's
"ride F-A4's clock" assumption is wrong at the bytes. F-A4 mints its own kind `close_prep` and
grants **zero** EXECUTE to `clara_wake_proactive` (`close-key-1-annexes-1-mechanics.md:259,273`);
F-A5 mints `bank_agent`; F-A2 mints `interactive_client`. **No sibling will ever populate
`'proactive'`.**
**Fold:** new design **§6**. F-A8 **owns its own trigger** and mints its own credential
(`mint_wake_credential`'s live tip `0011:1156-1195` accepts `'proactive'` today, granted to
`clara_runtime`), so the allowlist row and grant are *not* dead on arrival and stay in PR-1. The
**real** shared gap, which neither lens had named and the fold surfaced while re-deriving the
trigger path: **`kind='wake'` `agent_tasks` are born `held` (`0011:1230`) and the only legal
transition is `held → cancelled` (`0011:1271`) — no clocked wake can execute at all today.** That
is F-A4's problem too, it is a CoR of the live judgement body `_tf_agent_task_update`, and it is
**owner item OI-2**; F-A8's fail-closed default (IL-D15) is a plain runtime job with no
`agent_tasks` row. R3 is re-cut; §6.2/§6.3 carry the chatTurn ordering and the cite discipline.

**GM-9 · The fetch-health obligation was claimed and not delivered.** *(rulings lens.)*
F-A8-M2's ruling imposes **two** obligations — a named point-of-use refusal **and** "表带一张
抓取尝试/健康关系" (the table carries a fetch-attempt/health relation, so "today we couldn't fetch"
is itself a readable record); the contract repeats it verbatim. v1 built the first and discharged
the second with "the `policy_drafts` table is itself a queryable fetch-health record" (v1:239-244).
That is **structurally false for exactly the case the ruling names**: `wake_submit_policy_draft`
refuses `no_citation` before any row is inserted (v1:87-89), so a **zero-citation attempt leaves
no trace anywhere**. Reachable scenario the design itself concedes: a source whose page format
changed, no evaluator querying that key for a month, the missing-row wall never fired because
nobody asked, and active notification named a non-goal — the pipeline rots silently.
**Fold:** design §5 builds `clara.tier1_fetch_attempts`, append-only, written by the runtime job
**outside** the draft door, one row per cycle regardless of outcome, with a closed `outcome`
vocabulary. IL-D4; cells C.6a-c. *(This is the abandoned annex's one good idea, re-expressed in
the design's vocabulary.)*

---

## 4 · Nits (cite and battery trues — folded without argument)

- `0016:245-247` → **`245-248`** (the seed INSERT is four lines; the v1 cite drops the group-I
  row) · **both** seed rows are `effective_from='2018-09-01'`; `2024-02-26` occurs only inside the
  group-I row's free-text `source_note` — v1 read it as two effective dates, so **there is no
  live example anywhere of a date-boundary transition on this table**, which the design's C.4d /
  C.5h cells now have to build.
- `client_facts` is `0055:386-420`, not 387-421 · `_tf_client_facts_supersede_only()` is `:428`.
- Survey F2's "the tail assertion proves this at every migration since" — **withdrawn**. The 0016
  DO block runs once, at 0016's own apply. The conclusion survives on an independent repo-wide
  grep, and PR-3's replay re-derives it on the live catalog.
- Survey F6's "no outbound HTTP/web-fetch capability exists anywhere" — **re-worded to "no
  WEB-READ TOOL"**. `lib/storage.mjs:88,122,217,235,307,337` and
  `lib/reconciler-render.mjs:128,158` call `fetch()`, and `:126` carries a real
  `AbortSignal.timeout` convention PR-2 should reuse. **[v3, law-28 E-3: the TIMEOUT convention
  only — `storage.mjs:88-90` attaches `authorization`/`apikey`, so the request profile must NOT
  be reused. IL-D22.]**
- The contract cite: `§F-A8` is **~line 311**, not 118-126 (that range is now F-A3's prose after
  the ADR-0074 sitting commit). Corrected in the design and survey headers.
- PR-1 said "the **two** `wake_fn_allowlist` rows"; the verb set requires **three**, each named.
- Survey §2 mislabelled the roster as "a T17-style pin"; the real T17 is the EXECUTE grant matrix.

---

## 5 · The width ruling

**Adopted from the bytes lens, on buildability and review-lens grounds. The rulings lens found the
contract scope appropriately severed already and recommended only the document-set fix (GB-2,
discharged in this fold); where the two lenses differ, the bytes lens's three severances are
taken, each with its ground stated.**

1. **`llm_usage_events` leaves F-A8 entirely.** TA-P13 assigns the one metering ledger to F-A9,
   whose design already builds it (`metering-design.md`). F-A8 records an honest metering gap
   until F-A9's door opens. **Ground: ownership and blast radius — NOT the "forces a recut of a
   frozen-body caller" claim, which the verifier REFUTED** (a plain ALTER is a no-op for
   `record_llm_usage_event`'s existing 10-arg body; an INSERT that does not name the new columns
   leaves them NULL either way). The residual `firm_id not null` question for a firm-independent
   call is real and is F-A9's to rule (OI-3).
2. **Tier 1 and Tier 2 split.** They share nothing but the word "internet". Tier 1 is a DB item
   whose every limb is judgement logic over numbers that become every client's books' truth;
   Tier 2 is a runtime item whose defining risk is an injection surface and which needs law 28's
   cross-model pass. Reviewing them together makes the wrong-number lens and the injection lens
   compete for one reviewer's attention — and GB-1 is exactly the kind of thing missed when they
   do.
3. **The `sst_threshold_schedule` limb gets its own PR, after `fx_rates` proves the mechanism
   live.** It is the only limb touching something live and shared, the only one whose census story
   was wrong (GM-1), and the only one that was unbuildable (GB-3). `fx_rates` is greenfield: the
   whole draft → checks → owner door → supersede path is proven on a table nobody reads yet, and
   the threshold table then rides a proven mechanism with only its own ALTER and census truing to
   argue about.

**No pure-extraction limb exists** — F-A8 is greenfield, so the extraction-first principle is
discharged vacuously. **NOT severed:** the design's reasoning that Tier 1's fetch-and-draft half
does not depend on how TA-P1 resolves. That holds and does not need re-litigating.

---

## 6 · The revised build sequence

| PR | scope | D1 |
|---|---|---|
| **PR-0** | **Leg 1 DONE** (the fold is v2). **[v3] Leg 2 DONE 2026-08-23** (§10; the fold is v3 + `internet-lane-annexes-2.md`) — **PR-0 closes only when the walls are in the PRs that need them** | — |
| **PR-1** | Tier-1 DB, greenfield only: `fx_rates`, `policy_drafts`, `tier1_fetch_attempts`, the three predicates, the wake wrapper + core, the two human verbs + shared commit core, ONE allowlist row, Annex E's DDL posture, Annex F's T17 roster edits. Closed set = `{'fx_rates'}` | none predicted |
| **PR-2** | Tier-1 runtime: the outbound HTTP client (reusing the estate's conventions), the resolved-address deny list, the scheduled job minting its own `'proactive'` credential, a manual one-shot trigger. **Tier 1 live end-to-end on a table nobody reads yet** | — |
| **PR-3** | The `sst_threshold_schedule` limb alone: the surrogate-`id` ALTER, the closed set widened, the 0016 truing (reachable closure), the `a21-watch` P1 re-cut, the `0016:882-886` cell | none predicted; **replay confirms** |
| **PR-4** | Tier 2 (after leg 2): receipts + citations + deferred trigger, closed purpose world, `_web_text_is_client_free`, the two wake verbs + core, two allowlist rows, the `chatTurn` `_vN` | none predicted |
| **PR-5** | The bookkeeper+ DEFINER read surface for both tiers — independently rollbackable, no new authority | — |
| **PR-6** | Acceptance: a real fetch cycle, a real owner approve AND override, Tier-2 fetch + search from chat with citations readable, the denominator stated, `PROGRESS.md` | — |

---

## 7 · Refuted register (recorded so nobody re-raises them)

| claim | why it did not survive |
|---|---|
| "Zero CoRs / no D1 is wrong once the `llm_usage_events` widening sits on PR-1 — it **forces a recut** of a live `clara_runtime` writer with frozen-body callers" | The byte cites are accurate (the three columns are `not null`; the 10-arg signature is pinned by `to_regprocedure(...)` in two frozen dispatch bodies and a standing test) but the inference fails: TA-P13's ALTER is a plain `ALTER TABLE`, and an INSERT that does not name the new columns leaves them NULL regardless — **`record_llm_usage_event` need not change one byte**. The design's own TA-P1 rider ("sibling verbs, never a rewrite of a live human body") already forecloses the recut reading. *Residue folded anyway:* the widening is severed on **ownership** grounds (§5.1), and ODQ-3 now names `firm_id` explicitly. |
| "Four new tables ship with no RLS/FORCE/owner-policy/zero-grant DDL, which T18 requires" | The observation is byte-true, but its load-bearing premise — that `sst_threshold_schedule`'s owner-only posture is the ONLY firm-less precedent — is wrong: `client_fact_keys` (`0055:346-368`) is firm-less and carries an unconditional read policy **plus** a `clara_authenticated` grant. And the design already anchors its read surface to `get_close_plan`, i.e. the DEFINER-reader idiom the disposition asked for. Worst case is "PR-1 forgets five lines of boilerplate and CI refuses to merge" — T18 fail-closes on any new table. F-A2's own design is equally silent, so this is normal design granularity. *Residue folded anyway:* Annex E states the posture, for clarity, not because the finding stood. |
| "The Tier-1 list closes at three tables without naming the model **price** table TA-P2 listed" | The contract's own F-A8 section closes Tier 1 to three tables and its **F-A9** section assigns the price table there ("the first version builds the price table"); `metering-design.md` §3.5 already designs it. TA-P2's three example categories describe the *mechanism*, not a per-item build list. The design's closure is contract-faithful. *(The same finding's "three of five agenda questions dropped" was ~2× overcounted; the one genuine gap — the Tier-2 vendor — is folded as ODQ-7 under GB-5.)* |
| "C.9 and C.10 are vacuous negative controls — both pass on a database where F-A8 was never built" | True but not disqualifying. They are **contract-blind regression cells** over this item's own named non-goals — the same class `metering-annexes.md` C.1/C.9 labels "regression, contract-blind" — and the risk the attack says they miss (an F-A8 codepath that mints a `documents` row) is a codepath this item never builds. *Residue adopted as a complement:* C.9c adds the prosrc scan with an adversarial twin, alongside them, never replacing them. |
| "§5's point-in-time predicate should use `>=`, matching the four cited 0016 readers" | **The fix would be a regression.** The write side closes `effective_to` to the successor's own `effective_date` — a half-open interval `[from, to)` — whose only non-overlapping read complement is `>`. Under `>=` the transition day double-matches. *Residue folded, and it is the more valuable half:* three of the four 0016 readers survive `>=` only because of an `order by effective_from desc limit 1` tie-break, and **the fourth (`0016:882-886`'s `string_agg`) has none** — a live double-count exposure the day this table gains its first closing writer. Named in §5's impact-scan consumer list and given cell C.5h. |
| "TA-P5's visible-notice + hold-button rider is owed here" | Checked against the ruling's own text: the rider is explicitly scoped to the bank/close lanes (F-A3/F-A4). The design's silence is correct, not a gap. |
| "The design drops the contract's KB-citation clause (`…cited in receipts/KB`)" | TA-P4/A's in-place contract amendment narrowed Tier-2 citation to the fetch tool's own minted citation row, with no KB mention; the design implements the ruled narrowing. This is a ruled narrowing, not design fiat. *(GB-4's TA-P8 half is independently confirmed and stands.)* |

---

## 8 · Owner items and open obligations

**8.1 · Leg 2 of PR-0 — DISCHARGED 2026-08-23 (§10).** Stated as it was owed: the **cross-model
adversarial pass (law 28)**, **wider** than v1 framed it, because Tier-1's own extraction path
also reads attacker-influenced page text into a model before the value reaches the DB — so it was
owed **before PR-2**, extended before PR-4. GB-5's refusal predicate is itself judgement logic
and still takes law 1's independent pass inside PR-4's own review, **as does every wall IL-D17..
IL-D34 that decides whether something is allowed.**

**OI-1 · Who owes TA-P8's context landing for web-found identifiers?** TA-P8 = B rules such
identifiers ARE recorded in the knowledge layer as context (never as keys) and grants the
promotion door; member **F-A8-M4** names F-A8 directly. A KB context landing needs either an
owner-ruled `wiki_page_citations.source_kind` extension with a keys-forbidden conjunct, or a
different carrier. **Recommendation:** F-A7 owns it (the identity learning loop, `0063`'s audited
door); F-A8 supplies the `web_fetch_citations` rows it would cite. **Fail-closed default:** F-A8
v1 writes nothing to the knowledge layer (design §1, IL-D16).

**OI-2 · Which item lands the clocked-wake EXECUTION path, and with what D1 posture?**
`kind='wake'` `agent_tasks` are born `held` (`0011:1230`) and may only go `held → cancelled`
(`0011:1271`) — **no clocked wake can execute at all today.** Widening the transition set or
minting a task kind both CoR the two live judgement bodies whose kind arms end in `raise 'unknown
task kind'` — `_tf_agent_task_insert` (`0011:1222-1243`), `_tf_agent_task_update`
(`0011:1248-1285`). **F-A4 already takes the second route for its own kind**
(`ck_agent_tasks_kind_0011` + `'close_prep'`,
`close-key-1-annexes-1-mechanics.md:268`), so the precedent exists — but the ordering, the shared
body, and the D1 posture are not F-A8's to decide alone. **Fail-closed default:** F-A8's fetch
runs as a plain runtime job with **no `agent_tasks` row**; the credential, the receipt and
**[v3]** the `web_attempts` row (IL-D25) are the durable record (IL-D15). *Surfaced by the fold,
not by either lens: re-deriving the trigger path found the execution path missing for everyone.*

**OI-3 · `llm_usage_events.firm_id` for a firm-independent call.** `0094:55` is `not null` and
TA-P13's widening does not touch it, so a clock-triggered Tier-1 fetch could not be metered even
after it lands. **F-A9's to rule** (its R-L10 makes `firm_id` NULLABLE for platform calls — the
same shape IL-D34 projects). **Fail-closed default:** an honestly-stated gap, never a fabricated
`firm_id`/`document_id`/`task_id` (IL-D7, ODQ-3).

**OI-4 · A new `agent_tasks.kind` or wake kind, if either becomes necessary.** TA-P5's rider makes
minting one design law within the delegation, so it is not itself an escalation — but F-A8 does
**not** need one (it mints `'proactive'`), and any item deciding otherwise must say so against
this record rather than inherit it silently.

~~**Not an owner item:** whether Tier 2 should register a named TA-P3 egress purpose regardless of
the identity wall.~~ **[v3, 2026-08-23 — RE-OPENED by law-28 E-2, and it is the owner's, not a
design choice: `OQ-A`.]** TA-P3 = A rules identity-free lookups are not disclosures — but the
predicate cannot certify that a free-text query IS identity-free (a miss proves nothing), so
"identity-free" has to be made true by the ARCHITECTURE: a closed server-owned taxonomy, or a
named purpose the owner signs. The v2 sentence was right that removing the wall in favour of a
purpose would be a TA-P3 amendment; what it missed is that keeping free-text research WITHOUT one
is not the safe half. Fail-closed until ruled: free-text research does not ship (IL-D30).

---

## 9 · What the rig replay must confirm (this gate's own predictions)

1. **No existing function's `prosrc` changes** in PR-1, PR-2 or PR-4 — a catalog diff against the
   pre-PR baseline. TA-P1's rider measured, not asserted. *(This is the claim F-A2 discovered was
   FALSE for several of its own bodies.)*
2. **PR-1's no-D1 prediction** — a fresh-DB apply and a deploy-onto-existing apply both clean.
3. **PR-3's zero-writer population, re-derived on the LIVE catalog** before the ALTER relies on
   it; both seed rows unchanged afterwards, the `add column id …` rewrite stated, not assumed.
4. **The live tips of every body this record cites**, found by replay: `mint_wake_credential`
   (`0011:1156`, superseding `0004:687` dropped at `0011:1131`), `wake_context` (`0011:1133`),
   `assert_wake_allowed` (`0004:114`), `_tf_agent_task_update` (`0011:1248`). **[v3 adds
   `_wake_cred_full` (`0002:389`), `_human_ctx` (`0004:299`) and `verify_evaluator_freeze`.]**
5. **T17 / T18 / DEFINER-hygiene green at the end of each PR, and RED before that PR's roster
   edit** — proving the edit was necessary rather than decorative.
6. **The allowlist arithmetic**: three new pairs, the pre-existing `'proactive'` row still present.
   **[v3, measured on a live rig at the 0102 frontier: 15 rows today — 6 `autodraft`, 8
   `interactive`, 1 `proactive` — so F-A8 takes it to 18.]**

---

## 10 · Leg 2 — the law-28 cross-model adversarial pass (2026-08-23)

**Scope.** Content injection through fetched bytes · the allowlist/network boundary ·
poisoned-but-plausible facts at the owner door · client-data egress · replay, freshness and
receipt authenticity — Tier 1 **and** Tier 2, because §8.1's widening is right: Tier-1's own
extraction reads attacker-influenced page text too.

**Verdict: BUILDABLE WITH THE LISTED WALLS — not mergeable as designed. PR-2 and PR-4 stay
blocked until the walls are built.** Two advertised mechanisms did not exist in the design of
record: **no raw response bytes or content digest were stored anywhere**, and **no destination
registry existed** (`wake_fn_allowlist` governs callable DB verbs, not network destinations). The
durable evidence was caller/model-supplied `{url, accessed_at, quote}` — so the owner was
guaranteed neither source bytes nor a byte-bound excerpt, and a model could cite a fetch that
never happened.

**Counts. Twenty findings — fifteen blockers, four HIGH, one MEDIUM — every one re-derived
against the design text and the cited repo bytes: all twenty CONFIRMED, none refuted.** Three
narrowed, recorded (N-1: ODQ-2's default already intended two channels, only the mechanism was
missing · N-3: C.8e already contracted resolved-address checking, so what failed was connect-time
pinning, peer verification and the non-enumerable address forms · N-4: a plain `fetch()` does
load no subresources — a property to CONTRACT and TEST, cell C.12g, not a refutation).

**The fold.** Walls **IL-D17..IL-D34** (register: `internet-lane-annexes.md` Annex D.1b; specs:
`internet-lane-annexes-2.md` Annex K), cells **C.11-C.16** (Annex L), the per-finding table
(Annex J), every struck v2 passage verbatim (Annex M). Design §7 is re-cut — **the evidence
substrate moves INTO PR-1**, because a wall that arrives after the door it guards is not a wall.
**Six owner questions** (Annex N); **OQ-A — the client-free query architecture — GATES PR-4.**
Where a wall's shape was a genuine choice rather than a mechanism (bytes retention, PDF, the
registry's own landing door, the two-phase click, the item's width) it became one of those
questions, each with a fail-closed default the build proceeds on.
