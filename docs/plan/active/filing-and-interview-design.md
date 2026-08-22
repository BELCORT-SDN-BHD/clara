# F-A7 — the filing verb (F-A7a) + the interview model layer (F-A7b): design v2

> **Design doc of record for Wave-F Track-A item F-A7** (`docs/plan/active/wave-f-contract.md`
> §F-A7, lines 108-117), carrying **F-A10's retirement clause** for the four `rule`-spelled
> matchers. **v2, 2026-08-22 — gate 1 folded (record: `filing-and-interview-gate-record.md`).**
> Six blockers and eight materials bound; the item is **severed into five trains** and **F-A7b is
> re-scoped as its own item** (§5, §6). Estate as-found: **`filing-and-interview-survey.md`**
> (v1.2 — reconciled to this doc) — every §3/§4 decision below cites a survey finding or a byte.
> **Annex map.** `-annexes-1.md`: **A** verbs + refusal vocabulary + the `filing` allowlist · **B**
> battery · **C** decisions · **D** D1 detail · **E** predictions · **F** change log.
> `-annexes-2.md`: **G** live tips · **H** the two-value census · **I** the D1 surface + the build
> sequence · **J** the fold's cells · **K** F-A7b's seed spec. **THIS document governs.**
>
> **Live-tip law, restated because the gate found it violated eight times.** A body's live text
> is what `pg_get_functiondef` returns on a rig at frontier 0102 — never the last
> `create or replace` in the migration set, because `0038` splices four of the bodies this item
> touches at APPLY TIME, so their live text exists in no file in this repo (annexes-2 §G).
>
> **Binds under** the 2026-08-22 Track-A sitting: **TA-P7 C** (attribution is the agent's
> judgement, clarify when unsure) · **TA-P3 A** (one processing class = one named purpose; a
> firm-level narrow purpose for the client-less moments) · **TA-P4 A** (receipts mechanically
> bound; batch echo with five per-field confirmations) · **TA-P1 C** (open register + the
> wake-sibling rider) · **TA-P8 B** (identifiers are context; the promotion door) · **TA-P6 A**
> (walls aim at the directing human; `agent_prepared`, never `two_person`) · **TA-P11 A** (the
> one-architecture test) · **TA-P13 A** (one metering ledger) · **TA-P14 A** (the definition of
> done). Digest **laws 71-76**, **2**, **3**, **4**, **6**, **27**, **28**, **34**, **58**,
> **59**, **69**. Every PR takes the uniform ADR-061 ladder; **every rung of §3.2 is judgement
> logic** (law 1), and §3.5 is an injection surface and a consent boundary at once, so **law 28's
> cross-model adversarial pass is mandatory** on train γ.
>
> **BUILD GATE — narrowed by the gate to the train it actually binds.** TA-P7 C amends
> invariant (a) (PRD §6.2(a) · ARCHITECTURE §0.1 · digest law 2; AGENTS.md's clause is the owner's
> call at sign-off) and TA-P1 C amends law 71's "exactly" enumeration. **The sign-off gates
> train α — the constitutional recut — and nothing else.** `wave-f-contract.md:411-413` rules
> that F-A7a's other pieces (the firm-scoped question carrier, the correction path, the collision
> guard) may proceed meanwhile, and v1's packaging destroyed that permission; **π and γ are
> unblocked** (§6). If the owner declines either amendment, §3.2's B-tier collapses to TA-P7's
> option B (nominate + one-click human confirm) — the fail-closed default, and §8 states what
> changes.
>
> **Method lessons, now four:** an unsettleable claim is a **PREDICTION a rig replay must
> confirm**, never a design assertion · **line numbers come from the instrument that prints them**
> · a body's live tip is found by **CoR lineage** · and — the gate's own addition — **lineage is
> not enough where 0038 splices a body at apply time; only a replay is.**

---

## 1 · The ruled shape (fixed, not designable)

- **F-A7a — attribution is Clara's JUDGEMENT under structural walls; when unsure she clarifies**
  (TA-P7 C). The wall gains **one new arm**, not a widened old one: `method='agent'` stays refused
  exactly as today (survey finding 2), and the model **never supplies the confidence** — a judged
  attribution is categorical, the model's own stated confidence is an annotation
  (the `record_opening_keyed_resolution` precedent, `0018:94-…`).
- **Four walls-validate riders, fail-closed and within the standing delegation** (TA-P7): a
  hard-number **CONTRADICTION** wall · a name-family **COLLISION** guard over the ROME family,
  **spanning `clients` AND the firm's `counterparties`** because ADR-0074:185-188 names ROME
  PUBLIC ADVISORY as a *counterparty* · the **correction path + a named misrouted-egress event** ·
  a **firm-scoped unattributed-document question carrier**. Rider 3's posted arm is **narrower
  than TA-P6 A member OQ-A7-4 grants** and is an open owner item (§8, gate record §5 item 2).
- **F-A7a's egress is governed before it runs** (TA-P3 A): one new **client-scoped** purpose
  `document_processing` (which also brings `classify`'s live ungoverned egress under governance —
  survey finding 3) and one new **firm-scoped narrow** purpose signed once by BELCORT, whose
  output is limited to **an attribution verdict or a form suggestion**, with a **closed admissible
  document list** and **IC/passport refused**. The three existing clients need one supplementary
  consent line. **C6 (DPA · client disclosure · PDPA cross-border basis) is critical path.**
- **New authority arrives as WAKE SIBLING VERBS; no live human body is rewritten to gain it**
  (TA-P1 C's rider). **The exceptions, counted honestly against §5's own table** (the gate found
  §1 said "two" where the table lists four): **the constitutional recut** — which is not one body
  but **seven live re-derivations of the two-value predicate** (annexes-2 §H) — plus **three
  body-moves** giving a human writer an ungranted core (`file_document` in F-A7a; the two
  onboarding writers, now in the re-scoped F-A7b). Each is costed and windowed in §5.
- **F-A7b is the CLIENT onboarding interview only** (OQ-A7-7 A; firm setup is a follow-on): the
  validation skeleton stays, a normalizer fronts it, every segment walks validate → echo-confirm →
  persist (P19); **echo-confirm is batch with five per-field confirmations** (TA-P4 A) and the
  receipt records author = Clara and adopted-verbatim; **Clara may open a client file** (TA-P1 C)
  with an honest label, the row being irreversible (no delete verb, law 6). **Now its own item** —
  §4, annexes-2 §K.
- **Learned identifiers are context, never keys** (TA-P8 B), with a **promotion door**: Clara
  proposes, one human click writes the key through the audited counterparty door (0063's shape).

---

## 2 · The estate findings that bind §3-§4

The seven are in `filing-and-interview-survey.md` §1. The three that change the SHAPE:

- **finding 4, corrected by the gate** — the pre-attribution *read* already works and F-A7a adds
  **no new EXECUTE grant**; but `get_document_extract`'s live tip calls
  `assert_wake_allowed(w.wake_kind,'get_document_extract')` for every kind outside
  `('interactive','proactive')` (`0090:1579-1580`), raising `CLR03` on a missing row
  (`0004:114-121`) — which is why `autodraft` needed its own row (`0011:3905`). The `filing` kind
  therefore takes **one allowlist ROW per read verb**, enumerated in annexes-1 §A.3.
- **finding 5** — `wake_open_question` is unusable for an unattributed document in three
  independent ways, so the carrier is a **new relation with new verbs**, never a widened
  `open_questions` (which would force `client_id` nullable and break nine live consumers).
- **finding 6** — Gate O already refuses an all-agent interview, so F-A7b does not touch it: the
  human echo-confirm supplies the contributor and the refusal stays as the fail-closed backstop.

---

## 3 · F-A7a — the filing verb

### 3.1 The verb set — wrappers, ungranted cores, siblings

The `0077`/`0078` idiom: a granted wrapper that resolves identity, raises, and carries **no DML**;
an ungranted core that holds the ladder, the receipt and the write.

**Granted wrappers** (raise only, no DML): `wake_file_document` (to `clara_wake_filing` +
`clara_wake_interactive`, one allowlist row per kind) · `wake_open_firm_question` ·
`wake_reattribute_document` (the UNPOSTED correction arm) · `wake_propose_filing_correction` (the
POSTED arm — proposes, never approves) · `wake_propose_identifier_promotion`. **Ungranted:**
`_agent_file_document_core` (ladder + receipt + filing) · `_file_document_write` (the shared
write) · `_firm_question_core`. **Human:** `confirm_identifier_promotion` (one click →
`add_client_identifier`, body unchanged) · `resolve_firm_question` / `dismiss_firm_question`.
**Owner:** the four `firm_egress_purpose` verbs. **Runtime:** `prepare_firm_egress_dispatch`.
Signatures, floors and the `filing` kind's enumerated allowlist: annexes-1 §A.1/§A.3.

**Why a shared `_file_document_write` delegate — claim narrowed by the gate.** v1 argued that two
mutually-unaware writers of `document_filings` would be two architectures. **False at the bytes:**
`0027:26-40` enumerates **six live writers** from the live catalog, and `finalize_document_intake`
repeats `file_document`'s basis expression verbatim. **Withdrawn:** the estate-wide unification
claim. **What the move actually buys, and why it still earns its place:** the JUDGED path has ONE
write — `file_document` (live tip **`0009:2291-2363`**, not 0007's dead copy) keeps its public
floor and becomes a thin delegate, and the agent core calls the same delegate, so the agent can
never mint a second `'human'` resolution of its own (AB-2). It ships as **train α1: a pure,
behaviour-inert migration file**, provable by a normalized-`prosrc` differential — visible cost,
single revert. **The lock order is law here** (`0027:1-40`): `_file_document_write`,
`_agent_file_document_core` and `wake_reattribute_document` each take `clara.documents`
`FOR UPDATE` first, each with a two-session race cell (annexes-2 §J cell 63).

**Acting identity.** The wrapper resolves `clara.wake_context()`, asserts the allowlist row, and
passes `agent_user_id()` as actor with `on_behalf_of`/`wake_kind` as audit annotations — the
`0004:630-641` shape. **The agent never picks an authoritative input** (`0078:135-146`): a blank
`p_rationale`, an incomplete `p_model`, or a verdict with no citation refuses with a typed
`CLR10` detail before anything is reserved.

**The new wake kind `filing`.** It is firm-scoped with `client_id IS NULL` — by construction, a
document being attributed has no client yet. That extends the same two closed worlds F-A2 PR-1
already extends (`0011:623-628`) and the same two mint gates (`0011:1163-1165`, `:1178-1186`), so
**train β lands strictly after F-A2 PR-1** and re-trues all six roster/census surfaces **by census,
not from a list** (F-A2's own lesson). **Its allowlist rows are ENUMERATED in annexes-1 §A.3** —
`get_document_extract` among them — because a cell that compares against "its intended rows" is
self-referential. Chat parity rides the existing `interactive` kind (one allowlist row, no CHECK
change) and ships as **train ε**, after F-A2 PR-2 lands `chatTurn_v13` (§3.7).

### 3.2 The attribution ladder — four tiers, typed tokens

**Tier A — authority and shape. RAISE (`CLR*`).** `_reserve_op` · a live wake credential and its
allowlist row (`CLR03`) · document in the credential's firm (`CLR11`) · `for update` on the
document row · the target client is `active`/`onboarding` and same-firm (`CLR11`) · no active
filing to that client already (`CLR10`, the `0007:1392` refusal reused) · `p_model` complete and
`p_rationale` non-blank (`CLR10`) · **the egress authorization that produced the verdict is named,
live and of an admissible purpose** (`CLR28`).

**Tier B — the admission gates. TYPED NON-FILING RECEIPT, no raise.** The transaction **commits**,
so the reason is durable, and **the same transaction opens the firm question** — a refusal is never
a silent no-op. **All rungs are EVALUATED, always; the receipt carries the full failing-rung
vector; filing requires an empty vector.**

| rung | wall | typed token |
|---|---|---|
| **B1** | **the hard-number CONTRADICTION wall** — if any identifier printed on this document (TIN/SSM/bank account, normalized by the `0007:1525` expression) resolves in `client_identifiers` to a client **other than** `p_client`, the verdict is refused. **It inherits the live matcher's own two guards verbatim** (`record_rule_resolution`, live tip `0015:405-475`): the **AB-3 source discipline** `engine_kind in ('ocr','structured_parse')` (`:417-428` — *"invoice_facts deliberately carries colliding field_path names and is not an attribution source"*) and the **MyInvois sentinel-TIN exclusion** (`:433-442`). Without them a supplier TIN inside an `invoice_facts` extraction refuses a correct verdict permanently. *Judgement never overrides a registered identifier — but only a registered identifier read from an identity-bearing snapshot.* | `attribution_contradicted` |
| **B2** | **the name-family COLLISION guard** — the deterministic candidate set (name/alias exact, plus the family predicate of §3.3) must not contain a second party, **over `clients` UNION the firm's `counterparties`**. **>1 candidate ⇒ clarify, never choose.** | `attribution_name_family_collision` |
| **B3** | **a basis exists** — at least one of: a printed identifier hit, a name/alias hit, a bank-account hit, or a cited reasoning chain anchored to ≥1 region. A verdict with no cited region is not a judgement, it is a guess | `attribution_no_basis` |
| **B4** | **region anchoring** — every citation in the verdict resolves to a live `document_regions` row of THIS document (id-equality, the `_write_entry_evidence` idiom) | `attribution_region_unresolvable` |
| **B5** | **generation currency** — no citation names a **superseded** fact generation (the F-A2 B8 α-scoping analogue: fact-generation extractions only; OCR/`structured_parse` out of scope) | `attribution_stale_generation` |
| **B6** | **cross-firm** — no candidate crosses a firm boundary (the `0007:2278-2280` `CLR11` refusal, re-derived here) | `attribution_cross_firm` |
| **B7** | **purpose-moment consistency** — the authorization named in Tier A must cover THIS document's sha256 and its moment; a firm-narrow authorization admits only a verdict, never an accounting fact | `attribution_purpose_mismatch` |
| **B8** | **the identity-document refusal** — a document whose `documents.document_kind` is `identity_document` (or whose triage verdict says it is) is refused and quarantined, and the refusal is itself an event. The kind is a **settleable DB value on all four surfaces**, never a `DB_REFUSED_KINDS` member — see §3.5 | `attribution_identity_document` |
| **B9** | **name-only respect** — this verb writes **no** `client_identifiers` row, ever; a verdict that requests one is refused (TA-P8 B; law 59) | `attribution_enrichment_refused` |

**Tier C — deferred constraint triggers. ABORT.** The `(filing, resolution, document, client)`
congruence trigger and the receipt-existence trigger, both `deferrable initially deferred` so the
commit is the judge. *Tier membership is a fact about `pg_trigger.tgdeferrable`, derived by rig
replay, never written from memory.* **Note the estate's THIRD, non-deferred trigger on the same
table** — `_tf_stamp_document_pipeline` (`0007:415`, attached `:511-517`) fires BEFORE INSERT and
re-derives the two-value predicate; it is in train α2 (§5, annexes-2 §H row 3).

**Tier D — worker-side, before the DB.** Model timeout, malformed structured output, an empty
candidate read, a missing extraction — never reaching the verb; they surface as a `last_refusal`
and a firm question after a second verdict-less triage.

### 3.3 The four walls-validate riders

1. **The contradiction wall (B1)** is deliberately **asymmetric**: a printed identifier can only
   ever *refuse* a judgement, never *confirm* one — confirming is `record_rule_resolution`'s job
   and it already exists (live tip **`0015:405-475`**, not 0007's superseded copy). This keeps
   TA-P7 C's ruling intact (judgement decides) while making the one case the ruling's dissent
   named — a registered identifier pointing elsewhere — structurally unreachable.
2. **The name-family collision guard (B2).** The family predicate is deterministic and lives in
   the DB, never in the model: normalize (strip non-alphanumerics, lower — the estate's own
   expression), then take the **leading token set**; two parties sharing the leading token are one
   family. **Its domain is `clients` UNION the firm's `counterparties`**, because the ruling's own
   worked example is a counterparty: ADR-0074:185-188 says *"BELCORT's own books carry ROME
   PROPERTIES and ROME SECRETARY, and ROME PUBLIC ADVISORY returns as a real **counterparty** after
   the Wave-G reset"* — ROME PUBLIC ADVISORY is a separate FIRM (`39008536`, ADR-0045) and the
   synthetic sandbox (constraint 13), never a BELCORT client, and v1's example said otherwise. A
   clients-only predicate leaves the ruling's named collision source invisible: a document naming
   only the counterparty, where one ROME client partially matches, would see a single candidate
   and file to the wrong client. *This is a new predicate; the estate has no token analysis
   anywhere (survey §2.4).* **Prediction P-3, re-cut**: over `clients` ∪ `counterparties` the
   predicate returns ≥2 for the ROME family (two clients + one counterparty) and 1 for BEE — the
   rig replay confirms it on a fixture with those true cardinalities before the wall ships.
3. **The correction path + the misrouted-egress event.** **Unposted** (no live citation on the
   filing — the blocker query at its live tip **`0027:426-434`**, which is 0027's restructured
   form behind a `v_peek_doc` pre-lock, *not* `0007:1450-1455`'s superseded text): 
   `wake_reattribute_document` retires her own filing and files anew in one transaction, both
   reversible acts of her own, **taking `documents` FOR UPDATE first**.
   **Posted — WIDENED at landing 2026-08-22 (orchestrator ruling on gate AM-8; v2 escalated it).**
   **She REVERSES her own posted misattribution herself and RAISES the question; only the
   cross-client RE-HOME is the human's** — TA-P6 A's member OQ-A7-4 and TA-P7's rider (3) already
   granted this, so it is not a new authority. Build obligation: a **reverse-only** wake sibling
   plus a legal reversed-but-unfiled half-state, because the atomic reverse-and-refile body offers
   no seam. The cross-client re-home still runs `wake_propose_filing_correction` — a
   `filing_corrections` row with `maker = agent_user_id()` (`0007:317` takes a plain `users` FK, no
   membership check) plus a firm question — approved by the human through
   `approve_wrong_client_correction` (live tip **`0027:196`**, spliced at `0038:7495`; its
   `actor = maker` `CLR19` refusal at `0027:228-232` can never fire against a human, and its
   receipt is labelled `agent_prepared` per TA-P6 A, never `two_person`).
   **Hard dependency, found by the gate:** `approve_wrong_client_correction` re-derives the
   two-value predicate at `0027:268` and raises `CLR01` at `:270`, so **this arm does not work at
   all until train α2 extends that body** (annexes-2 §H row 7). **Either arm emits
   `egress.misrouted`** — a new event type carrying the wrong client, the purpose and the
   authorization id, because a misattribution is a **consent-routing** failure and not only a
   bookkeeping one (TA-P3's F-A7-M2). *Registration idiom `0090:635-657`: insert into
   `event_types`, insert into `trigger_taxonomy` at the active version, then a postcheck that
   re-reads both.*
4. **The firm-scoped carrier** (train π, unblocked). New relation `clara.firm_open_questions`:
   `firm_id not null`, **no `client_id` column at all** (a client-bound question belongs in
   `open_questions`), `document_id` required, `kind in ('unattributed','collision','contradiction',
   'identity_document','correction_proposed','promotion_proposed')`, `candidates jsonb`,
   `status in ('open','resolved','dismissed')`, `opened_by`, `receipt_id`. Resolution is a human
   act that **may itself file** — the `confirm_attribution_candidate(…, p_file_document := true)`
   shape at its live tip **`0027:121-190`** — so answering is one click, not two.

### 3.4 Receipts and acting identity (TA-P4 A)

New relation `clara.agent_filing_receipts`, written **in the same transaction as the filing or the
refusal** (there is no filing without a receipt — Tier C enforces it): `model`, `model_version`,
`rationale`, `verdict jsonb` (the candidate set, the citations, the model's own stated confidence
**as an annotation only**), `failing_rungs text[]`, `via_wake_kind` (**never NULL** — TA-P4 A(1)),
`trigger_kind in ('wake_task','chat_turn')` + `trigger_id` **mechanically bound** to the triggering
task/turn rather than model-supplied (TA-P4 A(2)), `authorization_id` (the egress authorization
consumed), `adopted_verbatim boolean` for the human-confirmation path.

**The common receipt contract, and why not one mega-table.** TA-P4 A extends receipts across
F-A2/F-A4/F-A5/F-A6/F-A8, and one physical table would make five items co-own one live body — the
opposite of the wake-sibling rider. **A COMMON COLUMN CONTRACT** (the ten names above) plus **one
read surface** — the bookkeeper+ view `clara.agent_receipts_visible`, unioning the per-act tables
with a `receipt_kind` discriminator — satisfies TA-P11's test (shared contract, one entrance per
surface). Registered as **D-6**; the view ships in **train π**.

### 3.5 Egress governance (TA-P3 A)

**Two new purposes** (train γ; prerequisite **C6**).

- **`document_processing` — client-scoped**, by the `0090:662-1100` idiom exactly: three CHECK
  recuts by discovered name, the `doc_sha` CHECK gaining **its own conjunct**, four verb CoRs, one
  `prepare_egress_dispatch` CoR, and a postcheck re-pinning all five `prosrc` sha256 values plus
  the ACL matrix against a prestate capture. It covers **classify** and any future whole-document
  model read that is not the witness pair.
- **`firm_narrow_intake` — firm-scoped**, in its own three-relation family
  (`firm_egress_purpose_consents` / `…_activations` / `firm_egress_dispatch_authorizations`)
  mirroring 0020's shape with `firm_id` where `client_id` stood — the existing family cannot hold
  it: `client_id` is `not null` on all three tables (`0020:152`, `:197`, `:249`) — plus a
  **`moment` column** `check (moment in ('attribution','onboarding_interview'))`.
  `prepare_firm_egress_dispatch` mirrors `prepare_egress_dispatch` including its **uniform
  `unknown` refusals**: the non-oracle rule is a property of the family, not of one function.

**The output limitation, made structural rather than promised.** A firm-narrow authorization is
consumable by exactly two verbs (`wake_file_document`, `wake_propose_onboarding_answers`), asserted
as a closed world with its own census; and `persist_document_extraction` (live tip **`0026:497`**)
**refuses a fact-generation engine kind** when the only live authorization for that document is
firm-narrow. The fact-generation family is **four** members, settled at the bytes, not predicted:
`0090:236-238`'s seven-value `engine_kind` closed world minus the three non-generating kinds
(`ocr`, `structured_parse`, `doc_classify`) = `invoice_facts`, `statement_facts`, `llm_text_facts`,
`llm_vision_facts`. So a firm-narrow read structurally cannot become an accounting fact, and the
corroboration gate refuses downstream anyway — two independent walls, neither relying on the other.

**Classify, brought under governance — AT ENQUEUE, not at claim.** v1 put the gate in
`claim_document_processing_task`; it cannot live there. `0090:494-499` is a live postcheck that
raises if that body gains any reference to `client_egress_purpose*` / `prepare_egress_dispatch` /
`consume_egress_dispatch`, and `wb-0020-legacy.test.mjs:630-639` re-asserts it against the live
`pg_proc` tip on **every** estate-suite run. The estate already recorded the right home
(`0090:1238-1245`): *"THE ENQUEUE-TIME TYPED-CONSENT GATE … enqueue is the earlier, more honest
place: an unauthorized client should never have a task queued in their name at all."* So the gate
lands in **`clara._enqueue_invoice_facts_core`** (live tip **`0090:1125`**), following the
statement-lane precedent: a filed document requires the client's live `document_processing`
consent+activation, an **unfiled** one requires the firm-narrow `attribution` moment, and either
verdict writes the terminal never-claimed **failed receipt** (the `skipped_kind` idiom) — **never a
raise**, because that function runs inside `file_document` / `finalize_document_intake` /
`confirm_attribution_candidate` / `approve_wrong_client_correction` and a raise would abort an
unrelated filing transaction. The lane's comment (`0090:346`) and the worker's header
(`classify.mjs:12-14`) are corrected in the same PR — **the comment is part of the finding**.

**The admissible-document list and the IC refusal.** The closed list rides the **onboarding intake
door**, where a human declares the kind as they hand the file in:
`ssm_rob_certificate · sst_certificate · bank_statement · bank_letter · lhdn_letter ·
engagement_letter`. IC and passport are **not members** and the door refuses them by that fact, not
by a blacklist. For the pre-attribution moment no declaration exists, so the wall is the other way
round: the triage read that returns an identity-document verdict refuses at **B8**, quarantines the
document, and emits the refusal. **The mechanism, decided by the gate (v1 asked for two
contradictory ones):** `identity_document` becomes a **settleable kind on all FOUR surfaces** —
`documents_document_kind_check` (`0017:692-698`) · `classify_document`'s in-body list
(`0026:1290-1296`) · `set_document_kind`'s in-body list (`0026:1457`, 0038-spliced) ·
`CLASSIFY_KINDS` (`classify-llm.mjs:28-46`) — and is **NOT** a `DB_REFUSED_KINDS` member. Adding it
to both would be self-cancelling by that file's own definition (`:26-27`) and would fail
`classify-unit.test.mjs:151-165`'s pinned disjointness invariant; and a kind the DB can never hold
makes B8's refusal a prompt instruction, which constraint 2 forbids. No settle loop is created,
which is the only hazard `DB_REFUSED_KINDS` guards (`classify-llm.mjs:19-23`). The two in-body
lists are **live-body CoRs in D1-γ**, not ALTERs.

**The pre-activation document class and its disposition** (`wave-f-contract.md:297-298`; TA-P3 A's
member F-A7-M6). A document handed in before any client record or consent exists is a
**pre-activation document**: `document_intakes.origin = 'onboarding_interview'` (`0007:104`'s CHECK
extended) or a filing-less `documents` row taken under `firm_narrow_intake`. **Its disposition is
the estate's, restated so the class ships with the door: it is never deleted** — no delete verb on
`clara.documents` or `clara.document_intakes` exists anywhere (law 6 / PRD §6.8) — **its retention
is extend-only** (the retention recompute never shortens), and **no purge verb is added by this
item or any later one**. A quarantined identity document (B8) is a member of this class, not an
exception to it.

**The consent artefacts are human acts** (survey §8): the owner signs and activates both purposes;
the three existing clients each need one supplementary consent line, and **until a client's line
exists that client's classify lane holds at enqueue** — fail-closed, visibly, never degraded.

### 3.6 Learned identifiers and the promotion door (TA-P8 B)

- **Nothing this item writes ever lands in `client_identifiers`** (B9). Judged attributions,
  bank-payer names, web-found registrations are all **context** — knowledge layer plus the
  receipt's `verdict` blob — and never feed the deterministic matcher.
- **The promotion door.** `wake_propose_identifier_promotion` writes a typed proposal card
  (kind + value + **N sightings** + citations + a stability statement) as a firm question of kind
  `promotion_proposed`; `confirm_identifier_promotion` is a bookkeeper+ verb that **calls
  `clara.add_client_identifier` unchanged**, deriving the inner op-key rather than minting one
  (`0078:152-155`), and records the confirming human. **No live body is rewritten** — pure
  addition, and it ships in **train π**, unblocked.
- **The double-read alternative.** TA-P8 B's second key source needs identity fields inside F-A1's
  agreement predicate — **F-A1's body, not F-A7's** (D-8 / OQ-A7-b). Fail-closed default: human
  confirmation only.
- **Constraint 12 is untouched.** `0062`'s wall stays RS-pinned and rides to the Wave-G reset; the
  general rule above is what generalizes, exactly as the owner framed it.

### 3.7 Chat parity (train ε, severed) and where the pile is worked

`wake_file_document` gains **one** `interactive` allowlist row and the chat toolface gains
`file_document` beside the read-only `list_unassigned_documents` (`chatTurn.v10.tools.ts:400-407`;
live tip of the read verb is `0011:3943`). The ladder is identical — same core, same tiers, same
receipt with `trigger_kind='chat_turn'`. **It ships as its own PR after F-A2 PR-2 lands
`chatTurn_v13`** (registry tip today is `chatTurn_v12`, `registry.ts:46`): two Wave-F items may not
mint the same frozen `_vN` (constraint 9), so ε takes the **next free** version with a prestate
check that the registry default is F-A2's. **A closed-world cell asserts `filing` holds exactly the
rows annexes-1 §A.3 enumerates and `interactive` gained exactly one** — a second row is how a kind
quietly becomes something else (F-A2's GB-3 lesson).

---

## 4 · F-A7b — the interview model layer (RE-SCOPED as its own item)

**The gate's width ruling severs F-A7b.** It shares no body with F-A7a, its two body-moves
(`update_onboarding_plan` `0017:2632`, `begin_client_onboarding` `0017:2492`, window **D1-δ**) are
cheap only if they are not queued behind a constitutional amendment, and both lenses judged the
combined item too wide for one train. **The full spec — the normalizer, the batch echo-confirm
with the five per-field confirmations, the three v3 residuals and Clara's client-file opening with
its honest label — moves verbatim to `filing-and-interview-annexes-2.md` Annex K** and is the
seed for the F-A7b item's own design doc, opened after F-A7a's acceptance.

**The four ruled shapes it carries, unchanged** (recorded here so the severance loses nothing):
the segment schema stays the **validation skeleton** and a model normalizer fronts it, every
proposal walking `validate → echo → confirm → persist` (P19, `interview.v1.core.ts:261-265`) ·
**echo-confirm is batch with five per-field confirmations** — legal name, entity type, FY end,
opening stance, CoA seed (TA-P4 A) · **Gate O is untouched**, the confirming human supplies the
contributor (survey finding 6) · **Clara may open a client file** with an honest irreversibility
label, the row being permanent because law 6 gives the estate no delete verb (TA-P1 C).

---

## 5 · The D1 surface — severed into four windows

**The gate re-derived this table and found it wrong in six places** (gate record AB-1..AB-6, AM-3):
v1's single `D1-a` named nine bodies and the true set was ~16, four generated at apply time. **Per-window CoR sets: `filing-and-interview-annexes-2.md` §I.2.** The shape:

| window | train | the bodies, in one line |
|---|---|---|
| **D1-γ** | egress | `_enqueue_invoice_facts_core` (`0090:1125`) · `prepare_egress_dispatch` (`0090:1007`) · the four client-purpose verbs · `persist_document_extraction` (**`0026:497`**) · `classify_document` (**`0026:1262`**, 0038-spliced) · `set_document_kind` (**`0026:1439`**, 0038-spliced) |
| **D1-α** | constitutional, **two revertable files** | **α1** `file_document` (**`0009:2291`**) → thin delegate over `_file_document_write`, behaviour-inert · **α2** the `method`/`basis` CHECK extensions + Annex H's **seven** live re-derivation bodies |
| **D1-β** | the filing verb | `mint_wake_credential` (`0011:1156`, both gates) + the two `wake_credentials` CHECKs — **shared with F-A2 PR-1 (D34)** |
| **D1-δ** | **F-A7b, now its own item** | `update_onboarding_plan` (`0017:2632`) · `begin_client_onboarding` (`0017:2492`) |

**`claim_document_processing_task` LEAVES the CoR set** — `0090:494-499` and the standing battery
`wb-0020-legacy.test.mjs:630-639` assert it holds no typed-consent call edge (§3.5).

> **The constitutional recut's real constraint, corrected.** `0018:487-809` is **one `do $tail$`
> block executed once at 0018's apply position** against the body 0018 creates at `0018:57-68`, so
> its `prosrc` marker (`:553-568`) and functional probes (`:751-767`) **cannot observe a CoR
> authored in a later migration** — applied history, not a live gate (AM-1). **The discipline
> survives as OURS:** the new arm is ADDED beside the existing conjuncts, never woven through them
> — no reordering, no `coalesce`, no `is not distinct from` rewrite — and **α2 authors its OWN
> postcheck block** re-asserting the marker, both probes and the seven-body census (template
> `0090:1062-1100`), which is re-runnable and therefore forceable both ways.

**The lock-order law, binding on every new acquirer** (`0027:1-40`, cited nowhere in v1):
`clara.documents` is taken `FOR UPDATE` **before** `document_filings` on `_file_document_write`,
`_agent_file_document_core` and `wake_reattribute_document`, each with a two-session race cell.
0027 fixed three of the estate's six live filing writers for exactly this.

**ALTERs (no body rewrite):** `client_resolutions.method` · `document_filings.basis` · the three
purpose CHECKs + the `doc_sha` CHECK · `ck_wake_credentials_kind_0011` + `…_client_0011` ·
`document_intakes.origin` + its paired CHECK · `documents_document_kind_check` (`0017:692-698`) ·
`onboarding_plans`' two new columns. **Every window runs from merged `main`**, with the standing
runbook hazards verbatim: the DSN bridge with a 110 s quiesce and a **split** `sleep 5400` argv,
`fly.exe`'s non-zero exit after a successful non-tty `ssh -C`, the post-restart zombie-pooler
sweep, `PG*` vars for rig runs, and the reconciler herd against two lane slots.

---

## 6 · Build sequence — five trains

**The per-train contents, the review legs and the seven cross-item sequencing obligations are in
`filing-and-interview-annexes-2.md` §I.3/§I.4.** In brief:

| # | PR | ceremony | gated on | review leg beyond the ADR-061 ladder |
|---|---|---|---|---|
| 0 | **gate — DONE** (`filing-and-interview-gate-record.md`) | — | nothing | this record |
| 1 | **PR-π** — the contract's named three + the promotion card + `agent_receipts_visible` | none | nothing (`wave-f-contract.md:411-413`) | law 1 on the family predicate |
| 2 | **PR-γ** — the egress train | **D1-γ** | **C6** | **law 28 cross-model, mandatory** (consent boundary + injection surface) |
| 3 | **PR-α** — the constitutional train, TWO files | **D1-α** | the **digest sign-off** | law 1, reading ONE change; revert is one file |
| 4 | **PR-β** — the filing verb + the `filing` kind | **D1-β** | α, γ, **F-A2 PR-1** | law 1 over §3.2's rungs and §3.3's riders |
| 5 | **PR-ρ** — runtime: triage lane (D-5), classify plumbing, the kind, `matcher.mjs`'s comment | none | γ, β | bundle-grep after build (WDK lesson) |
| 6 | **PR-ε** — chat parity, as the next free `chatTurn` `_vN` | none | **F-A2 PR-2 lands `chatTurn_v13`** | registry prestate check (constraint 9) |
| 7 | **PR-dash** · **PR-acc** (zero code) | none | ρ | re-measure as-run; the F-A10 census |
| 8 | **F-A7b — its own item** | **D1-δ** | F-A7a's acceptance | its own design doc, seeded by annexes-2 §K |

α and β may share ONE ceremony night as two sequential windows, each independently revertable.

**Acceptance (TA-P14 A clause 4).** A full synthetic round on **ROME PUBLIC ADVISORY** — a mixed
pile of unattributed documents through triage → verdict → filing → posting, including a deliberate
ROME collision and a deliberate contradiction — labelled synthetic per ADR-048; then a **real**
attribution on a BELCORT client (constraints 12 and 13 throughout). The deferral of any real-books
leg is **recorded**, never implied.

---

## 7 · Battery and gates

`filing-and-interview-annexes-1.md` Annex B, plus the gate's fourteen new and six re-cut cells in
**annexes-2 Annex J**. Every Tier-B rung gets a cell **and an inverted twin**; contract-blind cells
cover the ROME collision, the contradiction wall, the identity-document refusal and the
firm-narrow output wall. **The gates this item's output feeds** (TA-P14 clause 1): the
unassigned-lane count stops being a human-only metric and the attribution-candidate surfaces gain
agent verdicts — both re-measured; a gate that goes vacuous-green is repaired here, not registered.

## 8 · Owner items and delegated questions

**ONE goes to the owner** (gate record §5; OW-1 was ruled at landing) — the design does not decide
it and proceeds fail-closed:

- ~~**OW-1 — may Clara reverse a POSTED misattribution herself?**~~ **RULED 2026-08-22 (gate AM-8,
  widened at landing): YES.** TA-P6 A's member OQ-A7-4 and TA-P7's rider (3) had already granted
  the reversal and reserved only the cross-client re-home, so §3.3 now puts the reversal on her
  lane. Build obligation: a reverse-only sibling plus a legal reversed-but-unfiled half-state.
  **No longer an owner item — only OW-2 below is.**
- **OW-2 — dual attribution: a CONTRACT severance ask.** `wave-f-contract.md:296` requires
  dual-attributed related-party documents to be read once under both sides' authorization; the
  design severs it past v1. *Fail-closed default:* a dual verdict refuses at B2 and asks. (Not an
  open ruling — TA-P3's member OQ-A7-5 is design-layer residue, agenda §R-B.)

**Four stay under the standing delegation** — the design proceeds on the recommendation, each
naming its fail-closed default: **OQ-A7-a** one receipt table or a common contract → the common
column contract + one union view (§3.4) · **OQ-A7-b** identity fields in the witness pair → not in
F-A7; register the widening against F-A1; human confirmation only · **OQ-A7-c** one firm-narrow
purpose with two moments → one purpose, one signature ("signs ONCE"), the `moment` column keeps
the audit line honest · **OQ-A7-d** may a judged attribution file to an `onboarding` client → yes,
filing only, posting still blocked by the status gates; fail-closed default: active clients only.

## 9 · Registered risks and named non-goals

**Risks.** (R1) The constitutional recut is the highest-blast-radius change in Wave F, and the gate
made it **larger, not smaller**: it is **seven live bodies re-deriving the predicate**
(annexes-2 §H), not one, and its callers are **three live bodies** (`_draft_entry_core`,
`finalize_document_intake`, `_draft_opening_item_core`), not twelve — the eleven grep hits were
successive CoRs of three functions, and `pg_proc` holds one row each. Mitigated by extend-only,
by train α's isolation and single-file revert, by F-A7's **own** re-runnable postcheck block
(§5), and by a rig-replay census in both directions. (R2) Classify re-gating will make some
clients' classify lane **hold** until their supplementary consent line exists — visible,
intended, the fail-closed posture TA-P3 A chose; it now holds at ENQUEUE, so no task is even
queued in an unauthorized client's name. (R3) The family predicate is new judgement logic on live
names over `clients` ∪ `counterparties`; it ships with a rig-replayed population, not a claim.
(R4) The `filing` wake kind shares two CHECKs and two mint gates with F-A2 PR-1 — strict ordering
with a prestate probe, or a merge conflict at apply time. (R5) Four of the bodies this item CoRs
are **spliced into existence by 0038 at apply time** and exist in no file; authoring one from
migration text silently deletes live safety properties (annexes-2 §G).

**Non-goals, named so nobody re-opens them mid-build.** Firm-setup interview automation (OQ-A7-7 A)
· dual attribution (OQ-A7-e) · extending the name-only DB wall beyond RS (TA-P8: the general rule generalizes, the wall does not; **[ADR-0075 2026-08-23]** was "constraint 12's DB wall" — retired as a *named* constraint, `0062`/`0063` untouched) · admitting `method='agent'` (survey finding 2) · a model-supplied
confidence anywhere in the wall · web-found identity facts entering the knowledge base (TA-P8's
F-A8-M4 A) · carrying client identity onto the open web (F-A8-OQ-2 A) · any per-firm capability
dial (TA-P1 C: capabilities are default-on).
