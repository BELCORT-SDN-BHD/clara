# F-A7b — client onboarding: JOINT UI + backend design **v1 DRAFT**

> **DRAFT — the gate has not sat.** This is the document the owner's F-A7b sitting reads; every
> line labelled **NEEDS-DECISION** is deliberately unresolved and carries its question in
> **`fa7b-gate-questions.md`**. Nothing here is a build authorisation until that record exists.
>
> **Design doc of record for F-A7b**, the **JOINT UI + backend** gate ruled by the owner in
> `harness-audit-rulings-2026-08-26.md` **R8(a)** (`:112-121`) — *"UI and backend contract designed
> together, not sequenced"*. Estate as-found: **`fa7b-onboarding-survey.md`** (findings S1-S10,
> gaps G1-G14, absences A1-A10, predictions P-1..P-5) — every §3/§4 claim below cites a survey
> finding or a byte. Seeded by `filing-and-interview-annexes-2.md` **Annex K** (`:411-484`), which
> the survey MEASURED and corrected in four places (S9, §5 item 3).
>
> **Scope boundary, restated because it is the one thing this item keeps being asked to widen.**
> F-A7b is **CLIENT onboarding only** — `filing-and-interview-design.md:72` (OQ-A7-7 A: *"firm
> setup is a follow-on"*) and `:504` (a named non-goal). **Firm creation and the three firm tiers
> belong to R8(b)** (`harness-audit-rulings-2026-08-26.md:122-130`) and take their own gate and
> their own security review. Nothing in this document designs a firm.
>
> **A merge-order fact, recorded rather than left to be discovered.** `mohe-grill-rulings-2026-08-27.md`
> was **untracked** when this set was authored, so its name is cited in **bold, never backticks**,
> across all four documents — harness-links is right to refuse a backticked path the repo does not
> hold. **Re-backtick when it lands**; the line numbers were read from the file itself.
>
> **Binds under:** 磨合 rulings **Q2** (rail-first + thread escalation), **Q3** (two-level IA),
> **Q4** (ClaraBook visual law), **Q5** (BM+EN on statutory instruments), **Q6** (desktop-first +
> the mobile decision corridor), **Q7** (WCAG 2.1 AA), **Q8** (workbench-first; four new part
> types in one bump), **Q9** (the per-journey DONE formula), **Q-C** (the five playbooks) —
> `mohe-grill-rulings-2026-08-27.md`. Track-A: **TA-P1 C** · **TA-P3 A** · **TA-P4 A** ·
> **TA-P7 C** · **TA-P8 B** · **TA-P11 A** · **TA-P14 A**. Digest laws **2 · 6 · 22 · 58 · 71 ·
> 72 · 78 · 79 · 81**. Every build PR takes the uniform ADR-061 ladder; **§3.2's acceptance
> branch, §4's D-2 and §4's D-7 are all judgement logic** (review law 1), and the interview
> normalizer (§4 D-8) is an **injection surface** — law 28's cross-model adversarial pass is
> mandatory on the train that carries it.

---

## 1 · The ruled shape (fixed, not designable)

- **Clara may open a client file**, with an honest label, the row being permanent because law 6
  gives the estate no delete verb (TA-P1 C; `filing-and-interview-design.md:74-77`,
  `filing-and-interview-annexes-2.md:465-479`). **The estate has already reserved her door:**
  `wake_begin_client_onboarding` is named in `0126_f_a7_beta_filing_verb.sql:2065-2067` as the
  `filing` kind's allowlist **row 7**, *"F-A7b's"*. **This item mints no wake kind** — it adds one
  allowlist row to a seven-value world that already holds `filing` (`0126:594-597`).
- **The segment schema stays the validation skeleton; a model normalizer fronts it**, and every
  proposal walks the EXISTING driver `validate → echo → confirm → persist` unchanged
  (`interview.v1.core.ts:248-275`, refusal-without-persist at `:261-265`). A proposal that fails
  its validator is not persisted and not echoed.
- **Echo-confirm is batch with five per-field confirmations** (TA-P4 A) — and the five fields are
  the LIVE keys, not Annex K's: `legal_name` · `entity_type` · **`fye`** · **`opening_position`** ·
  `coa_seed` (survey S9; `interview.v2.questions.ts:76,77,88,94,92`). Item keys are a DB contract
  read by name inside `commit_client_onboarding` (`interview.v2.questions.ts:59-60`).
- **Gate O is not touched.** The human contributor is supplied by the confirming human, and the
  refusal stays the fail-closed backstop — **but the wall is put where Annex K says it already is**
  (survey S2, §4 D-2).
- **New authority arrives as WAKE SIBLING VERBS; no live human body is rewritten to gain it**
  (TA-P1 C's rider). The one body-move this item takes is Annex K's: `update_onboarding_plan`
  becomes a thin delegate over an extracted core (window **D1-δ**,
  `filing-and-interview-design.md:405`).
- **The DB owns every authoritative number** (constraint 2). Nothing the normalizer proposes is a
  figure; the opening seed's numbers come from the deterministic parse or from a keyed human line,
  and **opening-seed approval stays the reserved human act** (law 71,
  `docs/adr/README.md:413-415`).
- **The UI never invents a number, verb, receipt or link** (Q9 cross-cutting). Every affordance in
  §3 names a live verb or is labelled NEEDS-VERB here.

---

## 2 · The R8(a) scenario, decomposed into numbered acceptance steps

The owner's sentence — *"unknown-counterparty invoice → held in unattributed carrier → Clara
proposes onboarding → interview → doors signed → client born → document auto-attributes"*
(`harness-audit-rulings-2026-08-26.md:118-120`) — is thirteen steps. **The label in the last
column is the whole point of this document.**

| # | step | mechanism | state |
|---|---|---|---|
| **A1** | an invoice is taken in with no client declared | `document_intakes` / the documents tab; the row appears in `list_unassigned_documents` (live tip `0011_daily_loop.sql:3943-3965`) | **EXISTS** |
| **A2** | Clara triages it under the firm-narrow `attribution` moment | `prepare_firm_egress_dispatch` (`0123_f_a7_gamma_egress.sql:1024`), moment CHECKed `('attribution','onboarding_interview')` (`:713`, `:1038`) | **EXISTS** |
| **A3** | the verdict finds no candidate; the filing verb refuses at Tier B and the SAME transaction opens the carrier row | `wake_file_document` (`0126:1522`) → typed non-filing receipt; `wake_open_firm_question` (`0126:1541`) writes `firm_open_questions kind='unattributed'` (`0103:559-593`) | **EXISTS** |
| **A4** | the held document surfaces in the firm **Needs-you** inbox | firm altitude, Q3 (`mohe-grill-rulings-2026-08-27.md`:30-32); reads `firm_open_questions` directly under RLS (`0103:952-953`) | **NEEDS-UI** (backend exists) |
| **A5** | **Clara proposes onboarding** — a typed proposal naming the party, the basis, the sightings and what she could not settle | the carrier's `kind` closed world has no member for it (`0103:563-565`) | **NEEDS-VERB** — §4 D-1 |
| **A6** | a human accepts the proposal, or declines it | nothing | **NEEDS-VERB** — §4 D-1 |
| **A7** | the client file opens, labelled as Clara's | `wake_begin_client_onboarding` (allowlist row 7 reserved, `0126:2065-2067`) over an extracted birth core; the human verb `begin_client_onboarding` (`0017_wave_b.sql:2492-2524`) keeps its body | **NEEDS-VERB** — §4 D-2/D-3 |
| **A8** | the interview runs, escalated to a full-screen thread | `POST /api/interview/client/start` (`interviewRoutes.ts:260`), workflow `clientOnboarding_v3` (`registry.ts:90`) | **EXISTS** (UI re-homed, §3.3) |
| **A9** | the interview asks **which materials the client actually has** and branches | `opening_position` is two-valued (`interview.v2.questions.ts:94`) — survey S3 | **NEEDS-DECISION** — §4 D-5, `fa7b-gate-questions.md` §1 |
| **A10** | the purpose list is presented, the signed original filed, each purpose activated | `grant_client_egress_purpose` (live tip `0123:326-390`, **owner floor** `:331`, `CLR28`/`evidence_mismatch` at `:356-361`) then `activate_client_egress_purpose` (live tip `0123:391-455`, **owner floor** `:396`) | backend **EXISTS**; the click-through is **NEEDS-UI** (`frontend-handoff-2026-08-23.md:295`) |
| **A11** | the required answers are confirmed, per field, by a human | `confirm_onboarding_answers` | **NEEDS-VERB** — §4 D-8 |
| **A12** | Gate O passes and the client is born `active` | `commit_client_onboarding` (`0017:2751-2841`), unchanged | **EXISTS** |
| **A13** | **the held document auto-attributes to the newborn client** | `resolve_firm_question` records `named_client` and **writes no filing** (`0103:669-676`, measured) | **NEEDS-VERB** — §4 D-7 |

**The acceptance walk is one transaction chain a human can re-read afterwards.** TA-P14 A clause 4:
the run is walkable end to end on live test data (ADR-0075), on the **synthetic sandbox** first
(ROME PUBLIC ADVISORY, labelled synthetic per ADR-048 / digest law 22) and then once on a real
BELCORT client, with constraint 13 held throughout.

**A14 — the negative acceptance step, which the scenario does not name and which the gate must.**
The same walk with a **ROME-family** counterparty must NOT reach A5's proposal at all: the family
predicate (`name_family_is_ambiguous`, `0103:781`) returns ≥2 over `clients ∪ counterparties`
(prediction P-5), so the carrier opens `kind='collision'` and Clara asks *which existing client*,
never *shall I make a new one*. A design that only proves the happy path proves nothing about the
wall.

---

## 3 · The UI — rail-first, thread escalation (Q2), on the two-level IA (Q3)

### 3.1 Where onboarding lives

**Firm altitude owns the beginning; the client workspace owns the rest.** Q3's firm altitude is
*firm home · cross-client Needs-you inbox · client register · firm activity · admin*
(`mohe-grill-rulings-2026-08-27.md`:30-33). A held unattributed document has **no client**, so it
can only live at firm altitude — the carrier's schema says the same thing by having no `client_id`
column at all (`0103:559-593`, comment `:579-581`). The moment the client is born, the work moves
into that client's workspace and the URL changes with it (URL-as-truth, Q3 `:35`).

```
FIRM ALTITUDE  /needs-you                    CLIENT WORKSPACE  /c/<client>/…
  ├ firm question "whose invoice is this?"     tabs: journals · documents · bank · close
  └ Clara's proposal "this looks new"                · reports · registers · knowledge
       └─ accept ─► client born ─────────────► /c/<client>/onboarding = the escalated thread
```

**The remove-the-rail test, applied** (PRD §5a, `docs/product/PRD.md:135`). Remove Clara entirely
and the surface must still work: `/needs-you` still lists the held documents with their reasons
and still offers *file to a client* and *dismiss* as object-level verbs; `/c/<client>/onboarding`
is still the plan-as-document at `apps/dashboard/app/clients/plan/page.tsx:224-282` with its
inline resolve and its commit gate; the doors step is still a form over two owner verbs. **Clara's
proposal is the only thing that disappears — and it is a proposal, which is exactly what should.**

### 3.2 The "Clara proposes onboarding" card

**Where it renders: twice, one source.** As a row in `/needs-you` (workbench-first, Q8:
*"build first as workbench objects on direct RLS reads + governed doors — zero wire change"*,
`mohe-grill-rulings-2026-08-27.md`:63-66) and, when the moment is conversational, as the
`firm_question` chat part Q8 already budgets (`:66-67`). **One read, two dressings** — the card
hydrates from the carrier on mount and never trusts a part payload (Q9 (2), hydrate-never-trust).

**What the card says, and what it may not.** It states, in this order: the document (thumbnail +
filename + the region she read), the **party name exactly as printed**, the basis (identifiers
seen, sightings counted, the cited regions), **what she could not settle**, and the two verbs.
It may **never** print a proposed legal name, entity type, FY end, TIN or SSM number as if
established — those are the interview's questions and law 22 forbids constructing them. It may
print them as *"printed on this document"* with the region cite, which is a different sentence and
a different truth claim.

**Its verbs are three, all human.** *Start onboarding from this document* (A6) · *Not a new
client — file it to…* (the existing `resolve_firm_question`, `0103:637`) · *Dismiss* (the existing
`dismiss_firm_question`, `0103:679`). There is no "Clara, go ahead" button: accepting **is** the
go-ahead.

**Accessibility and copy (Q7, Q5).** The card is an `<article>` with a heading, the two verbs are
real buttons in DOM order, the refusal reason sits in an `aria-live` region, and the whole card is
keyboard-operable — the keyboard-walk CI gate binds this journey by name
(`mohe-grill-rulings-2026-08-27.md`:57-60). Chrome is English-first through next-intl (Q5
`:46-50`); nothing here is a statutory instrument, so BM is not day-one on this card — **§3.5's
doors step is, and it is.**

### 3.3 The interview as an escalated thread (Q2)

**Today the interview is a page with its own poller and its own error model** — the route
**/onboarding/client**, reading `client_id`/`plan_id`/`run_id` from the query string
(`apps/dashboard/app/onboarding/client/page.tsx:36-39`), `InterviewPanel` rendering an append-only
thread (`InterviewPanel.tsx:34-118`), `useInterviewRun` polling `GET /state`
(`useInterviewRun.ts:169-193`). **Q2 makes it a Clara thread that ESCALATED**, not a separate
universe: URL-addressable, collapsible back to the rail, the same conversation enlarged
(`mohe-grill-rulings-2026-08-27.md`:22-28).

**What actually changes, and what deliberately does not.**

- **Changes:** the route moves under the client workspace (`/c/<client>/onboarding`, URL-as-truth);
  the thread renders in the rail's own transcript shell so collapsing it leaves a live rail behind;
  the progress line (`step N · seg`) becomes the thread's header rather than a widget.
- **Does NOT change:** the park/answer protocol, the binding (`interview_run` item), the
  bookkeeper+ floor at both routes (`interviewRoutes.ts:277,343`), the validator skeleton, or the
  workflow's segment order. **No optimistic UI** (Q9 (2)): an answer is not in the thread until a
  read says it is.
- **The one honesty fix that is a contract change** (survey S7): the answer route returns
  `{ok:true}` today (`interviewRoutes.ts:365`), so a second submitter cannot be told their answer
  was not the one that landed except by the 409 (`:362`). §4 D-9 gives it a server-minted
  submission id, and **that is why `clientOnboarding_v4` exists** (constraint 9 — a behavioural
  change is a new frozen `_vN` plus a registry repoint, never an edit;
  `.claude/rules/runtime-workflows.md`).

**Mobile (Q6).** The interview is one of the three surfaces the mobile decision corridor explicitly
keeps — *"Clara threads (the full-screen form — resolves the no-modal law on phones)"*
(`mohe-grill-rulings-2026-08-27.md`:53-56). The escalated thread is the mobile shape. No separate
mobile interview is built.

### 3.4 The adaptive interview surface — the materials fork

**The single question this design adds to the interview, and where.** Immediately **before**
`opening_position` (`interview.v2.questions.ts:94`), a new segment **`materials_basis`** asks what
the firm actually received, in the client's own terms, with the five ruled playbooks as its values
(Q-C, `mohe-grill-rulings-2026-08-27.md`:102-106) plus the green-field case that already exists:

```
green_field            brand new entity, nothing before commencement
predecessor_pack   ①   audited FS + GL handed over
management_values  ②   management accounts, values only, unaudited
bank_only          ③   bank statements and nothing else
shoebox            ④   loose documents, no summary of any kind
midyear_gap        ⑤   switching mid-year, a period of records is missing
```

**It CONDITIONS `opening_position`; it does not replace it.** `opening_position`'s two item keys
are read by name inside `commit_client_onboarding` (`0017:2812-2822`; the contract comment at
`interview.v2.questions.ts:59-60`), so they stay exactly as they are. For `green_field` the answer
is derived (`new_first_year`) and the question is not asked; for the other five it is derived
(`ongoing_carry_down`) and the follow-ups differ. **Whether deriving an answer is lawful when the
driver's contract is question→validate→echo→confirm is a gate question** — §4 D-5 and
`fa7b-gate-questions.md` Q-D5; the fail-closed default is to ASK `opening_position` in every branch
and let the derivation only pre-fill the echo.

**What the surface offers per branch** is the substance of `fa7b-gate-questions.md` §1 and is not
duplicated here. The UI contract is uniform across all six: **a materials checklist Clara keeps,
each row in one of three states — *received* (a document id) · *requested from you* (with what and
why) · *will not exist* (with the human's reason recorded)** — and **nothing may sit in a fourth,
implicit state.** A row Clara constructed without evidence is the thing law 22 forbids and this
checklist makes structurally visible.

**The handover-pack intake.** Today the interview touches documents on exactly one segment —
`InterviewAttachments` mounts only when `park.seg === "sample_invoices"`
(`apps/dashboard/app/onboarding/client/page.tsx:138`; survey absence A10). The materials fork needs
a general intake: the same `useUploadQueue` component, mounted on `materials_basis` and on every
follow-up that names a document, with the **declared kind** chosen by the human at the door — the
closed admissible list F-A7a already ruled (`filing-and-interview-design.md:314-317`:
`ssm_rob_certificate · sst_certificate · bank_statement · bank_letter · lhdn_letter ·
engagement_letter`). **IC and passport are not members and the door refuses them by that fact, not
by a blacklist** (`:317-318`). Two of that list's six spellings are **not live**
`documents.document_kind` values (the live 20 are `0123:2054-2061`) — §4 D-11.

### 3.5 The doors-signing step

**Two acts, both the owner's, and the UI must not blur them.** `grant_client_egress_purpose` is
owner-floored (`0123:331`) and refuses `CLR28`/`evidence_mismatch` unless the evidence document is
`document_kind='consent_evidence'` **and** `bytes_verified_at is not null` (`0123:356-361`);
`activate_client_egress_purpose` is owner-floored (`0123:396`) and composite-FK-bound to the exact
consent id. The paper says the same: *"a signature alone authorises nothing … Two acts, by design"*
(`docs/ops/legal/client-ai-authorization-letter-template.md:103-110`).

**The screen, in three panes.**

1. **The list.** The five live purposes, **read from the DB, never a hardcoded array** — the live
   world is `('wiki_synthesis','statement_extraction','witness_extraction','bank_matching',
   'document_processing')` (`0123:271-286`), and a UI that ships its own copy goes stale the next
   time the CHECK is recut. Each row carries the letter's own wording and *what actually leaves the
   firm* (`client-ai-authorization-letter-template.md:87-93`). **A purpose the client did not tick
   stays listed and un-ticked** — the template forbids deleting a row (`:110`).
2. **The signed original.** Upload → `document_kind='consent_evidence'` → **wait for
   `bytes_verified_at`**, which is a read, not an optimistic tick. Until it lands, the grant button
   is disabled with the reason stated, because the DB will refuse anyway and a hidden refusal is
   worse than a visible one.
3. **Activation.** Per purpose, after its grant. The pane shows, per purpose, *signed at / activated
   at / revoked at* from the two relations' own columns (`0020:149-171`, `:194-215`) — never a
   derived "active" boolean the UI computed (review law 2).

**BM + EN from day one, zh to follow** (Q5, `mohe-grill-rulings-2026-08-27.md`:46-48). The letter
already exists in all three (`client-ai-authorization-letter-template.md` §4/§5/§6); the screen
renders the statutory copy from those source texts, and **the owner signs off the BM/zh strings
when they are wired** (Q-F, `:112-114`).

**The firm-narrow purpose is disclosed here, not granted here.** BELCORT signs it once for the
firm; ¶3 of the letter discloses it (`client-ai-authorization-letter-template.md:96-101`). The
client's doors screen shows it read-only, with the words *"signed by your accountant's firm, not
by you"* — because a client who cannot tell the two apart cannot consent to either.

### 3.6 The auto-attribution close

**What the human sees when it works:** the client workspace's documents tab already holds the
invoice, and the firm question that started it reads *resolved — filed to <client> by Clara*, with
her receipt one click away. **What the human sees when it does not:** the question stays open, with
her new reason, and the document stays in `/needs-you`. There is no third outcome and no silent
one — the filing verb's Tier B commits its refusal with the full failing-rung vector
(`filing-and-interview-design.md:156-158`).

**The mechanism is a re-triage, not a side effect of resolving the question** — §4 D-7. A judged
filing carries a receipt, a named egress authorization and a rung vector; a filing bolted onto
`resolve_firm_question` would carry none of them, and `resolve_firm_question` writes no filing
today (`0103:669-676`, measured).

---

## 4 · The backend contract deltas

Each row is **EXISTS** (cited), **NEEDS-VERB** (a proposal — name and shape given) or
**NEEDS-DECISION** (goes to the gate, question number given). Signatures are proposals, not
contracts, until the gate rules.

### D-1 · The proposal and its acceptance — **NEEDS-VERB**

```
kind        firm_open_questions.kind gains 'onboarding_proposed'   -- ALTER, extend-only CHECK
verb        clara.wake_propose_client_onboarding(
              p_document uuid, p_proposed_name text, p_basis jsonb,
              p_rationale text, p_model jsonb, p_authorization uuid, p_op_key text) → jsonb
            granted to clara_wake_filing; allowlist row ('filing', <this>)  -- row 8
            delegates to the EXISTING clara._firm_question_core (0103:604) -- no new carrier
verb        clara.accept_onboarding_proposal(p_question uuid, p_name text, p_op_key text) → jsonb
            bookkeeper+? admin? -- NEEDS-DECISION, Q-D2. Calls the extracted birth core (D-2),
            settles the question, and links plan → question (D-7).
verb        clara.decline_onboarding_proposal — NOT NEW: dismiss_firm_question (0103:679) already
            is it. A declined proposal is a dismissed question; adding a verb would be a second
            architecture for one semantic (TA-P11).
```

**Why the existing carrier and not a new relation.** `firm_open_questions` is firm-scoped, has no
`client_id` (`0103:559-593`) and already carries `candidates jsonb`, `opened_by`, `receipt_id` and
a settle contract (`ck_firm_open_questions_settled`, `0103:583-589`). A proposal IS a firm question
about a document; a second relation would put two items on one semantic. **The CHECK extension is
extend-only and the design must prove it both ways at PR time** (a census, never a list).

**The narrow but real question the gate must answer** is not *may Clara open a client file* —
TA-P1 C already says yes — but **WHEN she may do it unattended versus when she must propose**.
Recommendation and fail-closed default: `fa7b-gate-questions.md` **Q-D1**.

### D-2 · The birth core and Gate O's human wall — **NEEDS-VERB + NEEDS-DECISION**

```
core        clara._begin_client_onboarding_core(p_firm, p_actor, p_name, p_opened_by_agent,
                                                p_opener_model, p_from_question) → jsonb
            UNGRANTED. Carries 0017:2504-2521's insert sequence verbatim.
human       clara.begin_client_onboarding(p_name, p_op_key)  -- body becomes a thin delegate.
            Signature, floor (admin, 0017:2497) and ACL UNCHANGED. Window D1-δ.
wake        clara.wake_begin_client_onboarding(p_name, p_rationale, p_model, p_op_key) → jsonb
            granted to clara_wake_filing; allowlist ROW 7, already reserved (0126:2065-2067).
```

**Gate O's wall, put where Annex K already says it is** (survey S2). The wake core seeds
**`contributors = '{}'::uuid[]`** and leaves `review_maker`/`reviewed_at` NULL — both legal
(`0017:1010` default `'{}'`; `ck_onboarding_plans_review_maker_0017` at `:1022-1023` pairs the two
nulls). Then `commit_client_onboarding`'s existing `cardinality(contributors)=0` refusal
(`0017:2788-2791`, `CLR05`/`checker_required`) does **exactly** the work Annex K claims for it,
**with no CoR of a live human body** — which is TA-P1 C's rider honoured rather than argued around.

**The alternative — a HUMAN predicate inside Gate O — is rejected here and registered, not
dropped.** It would rewrite `commit_client_onboarding`, a live admin-floored human body, for
authority a seeding choice already carries; TA-P1 C's rider forbids exactly that trade. It is
registered as a widening against a later item, with its reason: *seeding is a discipline the next
writer can break; a predicate is not.* **Gate question Q-D3.**

**The cell that proves it, and its inverted twin.** A Clara-opened plan refuses
`commit_client_onboarding` with `CLR05`/`checker_required` **before any human answer**; the same
plan, after one `confirm_onboarding_answers` call, commits. A design that only asserts the refusal
has not proven the gate is reachable.

**The duplicate hazard is mechanical AND judgemental, and both walls ship.** `uq_clients_firm_name`
(`0003_books_core.sql:41`) refuses a same-name client — the wake core surfaces that as
`CLR10` (`0017:2507-2508`), unchanged. Additionally the core refuses when
`name_family_is_ambiguous(firm, name)` (`0103:781`) is true, raising
`client_open_family_collision` and opening a `collision` question instead of a second ROME
(`filing-and-interview-annexes-2.md:480-483`). **Prediction P-5 must be replayed before this wall
ships.**

### D-3 · The honest label — **NEEDS-VERB (columns)**

```
alter       clara.onboarding_plans add column opened_by_agent boolean not null default false
alter       clara.onboarding_plans add column opener_model    text
alter       clara.onboarding_plans add column opened_from_question uuid   -- D-7's link
            ADD COLUMN only. No body CoR. Written ONLY by _begin_client_onboarding_core.
```

Absent today at the bytes (survey absence A5: zero matches for either name, anywhere). The label
the dashboard prints is Annex K's, in the owner's own register and unchanged:
*"Clara opened this client file. A client record can never be deleted — if it is wrong, cancel the
onboarding and the client is archived."* (`filing-and-interview-annexes-2.md:473-476`). The
disposal path it names exists: `cancel_client_onboarding` (`0017:2843`).

**`opened_from_question` is nullable and the CHECK is the honest one:** it is non-null only when
`opened_by_agent` is true, so a human-opened file can never claim a provenance it does not have.

### D-4 · The receipt — **NEEDS-VERB**

`clara.onboarding_agent_receipts`, written in the same transaction as the act (TA-P4 A: no act
without a receipt): `model`, `model_version`, `rationale`, `verdict jsonb`, `via_wake_kind` (never
NULL), `trigger_kind`/`trigger_id` **mechanically bound** to the triggering task, and
`adopted_verbatim boolean` computed by the DB. It joins the receipt surface by **wiring its own
shim view** — the one statement π's contract asks a member to run (`0103` §A) — and that contract
is a nineteen-column PROJECTION contract where **`scope` is not optional: a NULL there hides all
your rows** (`filing-and-interview-design.md:253-258`).

### D-5 · The materials fork — **NEEDS-DECISION**

```
segment     materials_basis, inserted before opening_position (interview.v2.questions.ts:94)
            six values (§3.4). requiredForCommit: true.
item        item_key 'opening_materials_basis', item_kind 'must_ask', required_for_commit true
item        item_key 'opening_capture_plan',    item_kind 'todo'   -- what Clara will do,
                                                                      what the human owes
existing    'first_year_zero_opening' / 'carry_down_deferred' UNCHANGED -- DB contract
                                                                (interview.v2.questions.ts:59-60)
workflow    clientOnboarding_v4 + a registry repoint. NEVER an edit (constraint 9).
```

**The per-branch treatment — what Clara may construct, what she must request, what she must never
fabricate — is `fa7b-gate-questions.md` §1 and is RULED THERE, not here** (Q-C:
*"per-situation treatments … are proposed BY the F-A7b design gate and ruled there"*,
`mohe-grill-rulings-2026-08-27.md`:104-106).

### D-6 · The deferred-opening posture, made visible — **NEEDS-DECISION**

Survey S4: `commit_client_onboarding`'s third arm activates a client on `carry_down_deferred` in
state `deferred`, with the opening uncaptured and nothing on any screen saying so
(`0017:2812-2822`). **Recommendation: derive the posture in the UI from three live reads** —
`opening_seed_registry` for this client+plan, and the two item keys — rather than add a verb; a new
read verb for something three existing reads settle is a second architecture. The client workspace
carries a persistent, dismissible-never banner: *"Opening position not captured. This client's
books start from an assumed nil opening."* **Gate question Q-D6** decides whether a close may seal
while that banner is up.

### D-7 · The auto-attribution close — **NEEDS-VERB**

**Three shapes were weighed; two are rejected on a byte.**

- *(a) widen `resolve_firm_question` with `p_file_document boolean`* — **rejected.** It rewrites a
  live granted human body (`0103:637-677`) for authority a sibling can carry (TA-P1 C's rider), and
  a filing minted there would carry no receipt, no rung vector and no named egress authorization.
- *(b) a human sibling `resolve_firm_question_and_file`* — **kept as the fallback**, so a human can
  close the loop without waiting for a wake. It calls the existing `_file_document_write` delegate,
  so there is one write, and takes `clara.documents FOR UPDATE` first (the lock-order law,
  `0027_filings_lock_order.sql:1-40`).
- **(c) a RE-TRIAGE wake, and this is the primary.** The newborn client makes the candidate set
  non-empty, so `wake_file_document` succeeds **on its own judgement**, with its receipt, its
  authorization and its rungs — which is what "auto-attributes" has to mean if the word is to
  survive an audit.

```
source      clara.wake_engine_sources row (0133_g1_wake_engine.sql:203-237):
              ('onboarding_close','wake_outbox','client.activated','wake','filing',
               '<filingRuntime export>','runtime',5,false)   -- enabled=false until its
                                                                due-predicate and workflow exist
```

**Why `client.activated` and why it is bounded.** The event already exists and is already emitted
by `commit_client_onboarding` (`0017:2835`). `task_kind='wake'` needs no CHECK widening —
`ck_wes_task_kind_wake_owned` already admits it (`0133:236`). The wake reads
`onboarding_plans.opened_from_question` (D-3) → the question → its `document_id`, so it re-triages
**exactly one document**, never a firm-wide sweep. A plan with a NULL link enqueues nothing.

**Gate question Q-D7** is whether the re-triage may file unattended at all, or must land as a
proposal on the newborn client's queue. Fail-closed default: **it files, because law 79 already
rules that attribution is her judgement under walls** — but the walls are the same B1-B9 rungs, and
B2's collision guard now sees the client she herself proposed.

### D-8 · The normalizer and the batch confirm — **NEEDS-VERB**

```
relation    clara.onboarding_answer_proposals (plan_id, item_key) unique, value jsonb, echo text,
            citations jsonb, model, model_version, rationale,
            state in ('proposed','adopted','amended','rejected','superseded')
wake        clara.wake_propose_onboarding_answers(p_plan, p_proposals jsonb, p_rationale,
                                                  p_model, p_op_key)
            Writes proposals ONLY; never an onboarding_plan_items row.
human       clara.confirm_onboarding_answers(p_plan, p_expected_revision, p_confirmations jsonb,
                                             p_op_key)   -- bookkeeper+
            Refuses onboarding_per_field_required unless EACH of legal_name, entity_type, fye,
            opening_position, coa_seed carries its OWN confirmation entry (S9's live keys, not
            Annex K's). One txn: adopt/amend, then _update_onboarding_plan_core with
            p_answered_by = the confirming human. adopted_verbatim computed by the DB.
```

**Which wake kind — NEEDS-DECISION, Q-D8.** `wake_propose_onboarding_answers` is the second (and
only other) consumer of the firm-narrow authorization (`filing-and-interview-design.md:277-279`),
whose `onboarding_interview` moment is live and **unconsumed today** (survey absence A3). By
interview time the client EXISTS, so `interactive_client` fits its own CHECK (`0126:603`) and needs
no new kind. Recommendation: `interactive_client` + one allowlist row. **Fail-closed default: no
normalizer in the first train at all** — the interview stays human-typed and the wall is absence.

**Law 28's cross-model adversarial pass is mandatory on this train.** The normalizer reads
attacker-controlled document text and proposes values a human then confirms in batch: an injection
surface and a consent boundary at once, the pair `filing-and-interview-design.md:28-29` names.

### D-9 … D-12 · The four residual deltas — **`fa7b-onboarding-annexes.md` Annex B**

**D-9** the server-minted submission receipt on the answer route (**NEEDS-VERB**; this is the
workflow contract change that makes `clientOnboarding_v4` necessary) · **D-10** the two Annex-K
residuals — `readClearsError`'s missing `runId` check is closed, and **the interview e2e de-pin
owes NOTHING: the test forbids the pin the residual asks for**
(`packages/runtime/tests/interview-e2e.mjs:7-12`), so satisfying it as written would be a
regression · **D-11** the admissible-kind spellings, five of six absent from the live twenty-value
`document_kind` world (**NEEDS-DECISION, Q-D11**; default = map, no CHECK change) · **D-12** the
pre-activation `document_intakes.origin`, promised by F-A7a and never extended
(**NEEDS-DECISION, Q-D12**; default = do not extend).

---

## 5 · Build sequence · risks · non-goals

**`fa7b-onboarding-annexes.md` — Annex A** (the six-PR sequence, its two D1-δ windows, the
ceremony hazards, and the Q9 DONE formula) and **Annex C** (six registered risks, the named
non-goals). Both are addressed by this document's D-numbers; **this file governs on any
disagreement.**

**The two sentences that must not live only in an annex.** F-A7b is **P5** in Q9's phase order —
it runs EARLY, in parallel with P1/P2, and *"its train builds after it closes"*
(`mohe-grill-rulings-2026-08-27.md`:86-87). And every crude door the survey measured in
`apps/dashboard` is replaced **IN PLACE, same verb, no new gate** (Q9 cross-cutting, `:89-90`) —
this item adds verbs, it does not add gates to journeys that already have them.
