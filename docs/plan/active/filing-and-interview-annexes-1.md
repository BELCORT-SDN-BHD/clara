# F-A7 annexes 1 — verbs, battery, registers, D1 detail, predictions

> Annexes to `filing-and-interview-design.md` (**v2, 2026-08-22 — gate 1 folded**; record:
> `filing-and-interview-gate-record.md`). **A** the verb catalog, the typed refusal vocabulary and
> the `filing` kind's allowlist · **B** the test battery · **C** the decision register · **D** the
> D1 detail and the census re-cut list · **E** the predictions a rig replay must confirm ·
> **F** the change log. Estate citations live in `filing-and-interview-survey.md`; the gate's
> live-tip register, the two-value re-derivation census, the re-cut D1 surface with the severed
> build sequence, the fold's new/re-cut cells and F-A7b's seed spec live in
> **`filing-and-interview-annexes-2.md`**. **The design doc governs on any disagreement.**

---

## Annex A · The verb catalog and the refusal vocabulary

### A.1 Signatures (all `security definer`, `set search_path = clara, pg_temp`)

| verb | arity | floor / grant | shape |
|---|---|---|---|
| `wake_file_document` | `(p_document uuid, p_client uuid, p_verdict jsonb, p_rationale text, p_model jsonb, p_authorization uuid, p_op_key text) → jsonb` | `clara_wake_filing` + `clara_wake_interactive`; one allowlist row per kind | wrapper: identity + allowlist + raises; **no DML** |
| `_agent_file_document_core` | `(p_actor, p_firm, p_obo, p_wake_kind, p_trigger_kind, p_trigger_id, …)` | **ungranted** | the ladder (§3.2) + the receipt + the delegate call |
| `_file_document_write` | `(p_ctx jsonb, p_document, p_client, p_resolution, p_basis, …)` | **ungranted** | the extracted filing write; two lawful callers |
| `file_document` | unchanged `(uuid,uuid,text,text)` | `clara_authenticated` (unchanged) | thin delegate over `_file_document_write`; **live tip `0009:2291-2363`**, extracted in train α1 as a behaviour-inert file |
| `wake_open_firm_question` | `(p_document, p_kind, p_question, p_candidates jsonb, p_rationale, p_model, p_op_key)` | `clara_wake_filing` | writes `firm_open_questions` + its receipt |
| `resolve_firm_question` | `(p_question, p_resolution, p_client uuid default null, p_file boolean default false, p_op_key)` | `clara_authenticated`, bookkeeper+ | answering MAY file in the same txn |
| `dismiss_firm_question` | `(p_question, p_reason, p_op_key)` | bookkeeper+ | |
| `wake_reattribute_document` | `(p_filing, p_expected_revision, p_to_client, p_reason, p_rationale, p_model, p_op_key)` | `clara_wake_filing` | **unposted only**; retire + re-file in one txn; emits `egress.misrouted` |
| `wake_propose_filing_correction` | `(p_document, p_from_client, p_to_client, p_reason, p_rationale, p_model, p_op_key)` | `clara_wake_filing` | writes `filing_corrections` with `maker = agent_user_id()`; opens a firm question; emits `egress.misrouted` |
| `wake_propose_identifier_promotion` | `(p_client, p_document uuid, p_kind, p_value, p_sightings int, p_citations jsonb, p_rationale, p_model, p_op_key)` | `clara_wake_filing` | the typed proposal card; `p_citations` DB-resolved against `p_document` since 裁-22 (`UNNUMBERED_proposal_basis_resolved.sql`) |
| `confirm_identifier_promotion` | `(p_proposal, p_op_key)` | bookkeeper+ | calls `add_client_identifier` **unchanged**; derives the inner op-key |
| `grant|activate|deactivate|revoke_firm_egress_purpose` | `(p_purpose, p_moment, p_evidence_document, p_scope_note, p_op_key)` variants | **owner** | the firm-narrow family; 0090's four-verb shape |
| `prepare_firm_egress_dispatch` | `(p_firm, p_purpose, p_moment, p_event_seq, p_event_type, p_document_sha256) → jsonb` | `clara_runtime` | uniform `unknown` refusals; 120 s wall-clock TTL |
| `wake_propose_onboarding_answers` | `(p_plan, p_proposals jsonb, p_rationale, p_model, p_op_key)` | `clara_wake_interactive` | writes `onboarding_answer_proposals` only |
| `confirm_onboarding_answers` | `(p_plan, p_expected_revision, p_confirmations jsonb, p_op_key)` | bookkeeper+ | one txn: adopt + `_update_onboarding_plan_core` |
| `update_onboarding_plan` | unchanged `(uuid,uuid,jsonb,uuid,text)` | unchanged | thin delegate over `_update_onboarding_plan_core` |
| `wake_begin_client_onboarding` | `(p_name, p_rationale, p_model, p_op_key)` | `clara_wake_filing` | shared birth core; sets `opened_by_agent` |

**Op-key discipline** (`0078:152-155`): the caller's key is deterministic; a blank key refuses with
a typed `CLR10` detail **before** `_reserve_op`; every inner key is **derived, never minted**.
0078's own comment states the reason — *"minting one here would defeat"* a replayed WDK step's
reuse of the reservation.

### A.2 The typed refusal vocabulary

**Tier A raises (existing SQLSTATE families, no new classes):** `CLR03` no/blocked wake authority ·
`CLR10` malformed input, blank op-key, incomplete model, already-filed · `CLR11` cross-firm ·
`CLR28` no live egress authorization.

**Tier B tokens (durable, on the receipt's `failing_rungs[]`, never a raise):**
`attribution_contradicted` · `attribution_name_family_collision` · `attribution_no_basis` ·
`attribution_region_unresolvable` · `attribution_stale_generation` · `attribution_cross_firm` ·
`attribution_purpose_mismatch` · `attribution_identity_document` · `attribution_enrichment_refused`.

**Other typed details:** `client_open_family_collision` (§4.4) ·
`onboarding_per_field_required` (§4.2) · `promotion_not_confirmed` ·
`firm_narrow_output_forbidden` (the `persist_document_extraction` wall) ·
`reattribution_blocked_by_citation` (the unposted arm's refusal when a live citation exists).

**Rule:** a token is emitted by exactly ONE rung, and Annex B carries a cell per token proving both
directions. A rung provably unreachable is **not listed** (law 31) and its unreachability argument
lives in the decision register, not in the vocabulary.

### A.3 The `filing` wake kind's allowlist — WRITTEN, not "as intended" (gate AM-6)

`get_document_extract`'s live tip calls `assert_wake_allowed(w.wake_kind,'get_document_extract')`
for every kind outside `('interactive','proactive')` (`0090:1579-1580`), raising `CLR03` on a
missing row (`0004:114-121`) — the reason `autodraft` needed its own row (`0011:3905`). So the
`filing` kind is **not grant-free**; it is EXECUTE-grant-free and roster-bound. Its rows, in full,
so cell 40 has something outside itself to compare against:

| # | `wake_fn_allowlist` row | why |
|---|---|---|
| 1 | `('filing','get_document_extract')` | the pre-attribution read the whole limb is premised on |
| 2 | `('filing','wake_file_document')` | the filing verb |
| 3 | `('filing','wake_open_firm_question')` | the unattributed carrier (rider 4) |
| 4 | `('filing','wake_reattribute_document')` | the unposted correction arm (rider 3) |
| 5 | `('filing','wake_propose_filing_correction')` | the posted arm — proposal only |
| 6 | `('filing','wake_propose_identifier_promotion')` | TA-P8's card |
| 7 | `('filing','wake_begin_client_onboarding')` | TA-P1 C's client-file opening *(moves to F-A7b's own item with train δ; listed here so the closed world is stated once)* |

**Nothing else.** The EXECUTE source for the read verbs is the existing agent read role
(`clara_agent_ro`) — **a prediction to re-derive by catalog census at PR time**, never assumed
(gate record §8 item 7). Cell 40 compares the live rows against **this table**; cell 42 is its
negative twin.

---

## Annex B · The test battery

Cells marked **CB** are **contract-blind**: written from the ruling text and the survey, by a lane
that has not read §3, so a cell agreeing with the design agrees with the *ruling*.

> **Gate-1 fold.** Fourteen NEW cells (58-71) and six RE-CUTS (29 · 30a/30b · 31 · 40 · 10/P-3 ·
> 44) are specified in **annexes-2 Annex J** and are part of this battery. The re-cut cells below
> carry a pointer at their number; **annexes-2 §J governs their wording.** The class the re-cuts
> close is the PR-1 lesson: a fixture must be buildable in the real order, a forced cell's
> precondition is an assert, and a cell that compares a thing against itself can never say NO.

### B.1 Tier A — authority and shape
1. `wake_file_document` with no wake credential → `CLR03` ▣
2. …with a credential whose kind has no allowlist row → `CLR03` ▣
3. …for a document in another firm → `CLR11` ▣ **CB**
4. …to a client already actively filed → `CLR10`, and **no second filing row exists** ▣
5. …with a blank rationale / incomplete `p_model` → `CLR10`, **and `op_receipts` gained no row** ▣
6. …with an expired or foreign `p_authorization` → `CLR28` ▣ **CB**
7. Grant census: `wake_file_document` executable by `clara_wake_filing` and
   `clara_wake_interactive` and **nothing else**; `_agent_file_document_core` and
   `_file_document_write` executable by **no app role** ▣

### B.2 Tier B — one cell plus an inverted twin per rung
8. **B1 contradiction** — a document printing BEE's SSM number, verdict names ROME PROPERTIES →
   `attribution_contradicted`, no filing, a firm question opened **in the same transaction** ▣ **CB**
9. **B1 twin** — the same printed number, verdict names BEE → files ▣
10. **B2 collision — RE-CUT (annexes-2 §J).** The fixture is **two ROME clients plus one ROME
    counterparty** of one firm; name evidence alone matching the family →
    `attribution_name_family_collision`. A clients-only fixture cannot force the ruling's own
    named case (ADR-0074:185-188 makes ROME PUBLIC ADVISORY a counterparty) ▣ **CB**
11. **B2 twin** — name evidence matching BEE alone → files ▣
12. **B2 hard case** — name matches ROME SECRETARY *and* the document prints ROME SECRETARY's TIN →
    files (the identifier disambiguates the family) ▣
13. **B3** — a verdict with zero citations → `attribution_no_basis` ▣ **CB**
14. **B4** — a citation naming a region of a **different** document → `attribution_region_unresolvable` ▣
15. **B5** — a citation naming a **superseded** fact generation → `attribution_stale_generation`;
    twin: an OCR/`structured_parse` citation must **NOT** refuse ▣
16. **B6** — a candidate in another firm → `attribution_cross_firm` ▣
17. **B7** — a firm-narrow authorization whose sha256 is a different document →
    `attribution_purpose_mismatch` ▣
18. **B8** — an identity-document triage verdict → `attribution_identity_document`, the document is
    quarantined, the refusal event exists ▣ **CB**
19. **B9** — a verdict requesting an identifier write → `attribution_enrichment_refused`, and
    `client_identifiers` gained **zero** rows ▣ **CB**
20. **Vector completeness** — a document failing B1 *and* B2 carries **both** tokens; filing
    requires an **empty** vector ▣
21. **Zero-row cell per tier** — no filing, no receipt-less filing, no filing-less receipt ▣

### B.3 Tier C and the receipt
22. The replayed trigger census: `select tgname, tgdeferrable, tginitdeferred from pg_trigger` over
    the new triggers matches Annex E's prediction ▣
23. A filing without its receipt aborts at COMMIT (not at INSERT) ▣
24. `via_wake_kind` is **never NULL** on any receipt row ▣ **CB**
25. `trigger_id` matches the actual wake task / chat turn, **not** a model-supplied value — proven
    by minting a task, filing, and comparing ids ▣ **CB**
26. The model's stated confidence appears **only** inside `verdict`, never in
    `client_resolutions.confidence` (which is 1.0) ▣ **CB**

### B.4 The wall itself
27. `assert_client_resolved` accepts the new method at 1.0 and **still refuses** `method='agent'` —
    `rig-invariants.test.mjs:172` stays green, plus its inverted twin ▣ **CB**
28. A judged resolution **bound** to an opening seed still refuses the generic gate (0018's
    confinement is unmoved) — this **extends** 0018's own reject-bound probe (`0018:758-767`)
    rather than duplicating it: same predicate, new method value ▣
29. **RE-CUT (annexes-2 §J).** The `assert_client_resolved` caller set is **three live bodies**,
    derived by rig replay over `pg_proc` after apply, never by grep: `_draft_entry_core`
    (`0016:3970`), `finalize_document_intake` (`0026:234`), `_draft_opening_item_core`
    (`0017:3162`, reachable only because `0018:252-271` splices the call in at apply time). The
    eleven grep hits were successive CoRs of these three. Each is re-proven both ways: a judged
    filing supports a post; a superseded judged resolution does not. *The cell fails at two
    (the splice did not apply — stop and re-apply) and at four (an unaccounted caller)* ▣ **CB**
30. 0018's splice-anchor drift check still passes after the recut ▣
- **30a / 30b. RE-CUT (annexes-2 §J, cell 71).** `0018:487-809` is a **one-shot apply-position**
  block and cannot observe a later CoR, so it is not a gate to force. The properties move to
  **F-A7's own re-runnable postcheck block** in train α2 (`prosrc` marker + accept-unbound +
  reject-bound + the seven-body census, template `0090:1062-1100`), and the cells force THAT —
  passing on the shipped body, failing on a deliberately re-woven one ▣ **CB**

### B.5 Egress
31. **RE-CUT (annexes-2 §J cell 64).** Classify on a filed document **without** the client's
    `document_processing` activation: the hold happens **at ENQUEUE** —
    **no task row is created in that client's name at all** — a terminal never-claimed failed
    receipt exists (the `skipped_kind` idiom, never a raise), and **no model call is made** (the
    provider mock records zero invocations) ▣ **CB**
32. …with the activation → proceeds, and a dispatch authorization row exists bound to the document
    sha ▣
33. Classify on an **unfiled** document with the firm-narrow `attribution` moment → proceeds ▣
34. …without it → holds ▣ **CB**
35. `prepare_firm_egress_dispatch` returns **uniform `unknown`** for: null firm, unknown purpose,
    wrong moment, no activation, malformed sha — **five refusals, one indistinguishable payload**
    (the 0020 §3.3 non-oracle rule) ▣ **CB**
36. `persist_document_extraction` refuses a fact-generation kind under a firm-narrow-only
    authorization → `firm_narrow_output_forbidden`; twin: an OCR kind is admitted ▣ **CB**
37. Purpose-family census: the three CHECKs and the `doc_sha` CHECK each admit exactly the expected
    set — **extend-only, both directions** ▣
38. The four client-purpose verbs' `prosrc` sha256 values match the new pins, and the **ACL matrix
    is byte-unmoved** against the prestate capture ▣

### B.6 Wake kind and rosters
39. `filing` credentials mint with `client_id IS NULL` and refuse with a client ▣
40. **RE-CUT (annexes-2 §J).** Closed-world: `filing` holds **exactly the seven rows written in
    §A.3** — compared against that table, never against "its intended rows"; `interactive` gained
    **exactly one** (`wake_file_document`) ▣ **CB**
41. The six roster/census surfaces are re-derived **by census** and match ▣
42. A `filing` credential cannot call `wake_draft_entry`, `wake_post_entry` or any close verb ▣ **CB**

### B.7 Corrections and promotion
43. Unposted misfiling → `wake_reattribute_document` retires and re-files; `egress.misrouted` exists ▣
44. **PENDING OWNER (gate record §5 item 2).** Posted misfiling → the reattribute verb refuses
    `reattribution_blocked_by_citation`; the proposal path writes a `filing_corrections` row with
    `maker = agent`; a human approves; the receipt reads `agent_prepared`, **never `two_person`**.
    *As written this proves the fully human-gated path — the fail-closed default, not necessarily
    what TA-P6 A's member OQ-A7-4 ruled. It is re-cut if the owner grants the agent-executable
    reversal half.* Its hard precondition is train α2 extending `approve_wrong_client_correction`
    (`0027:268`), otherwise the human approval itself raises `CLR01` ▣ **CB**
45. The promotion card writes **no** identifier; `confirm_identifier_promotion` writes exactly one
    and records the confirming human ▣ **CB**
46. Constraint-12 regression: every 0062/0063 cell still passes unchanged ▣

### B.8 F-A7b
47. A proposal failing its validator is **not persisted and not echoed** (P19) ▣ **CB**
48. A batch confirmation missing one of the five hot fields → `onboarding_per_field_required`, and
    **no plan item moved** ▣ **CB**
49. `adopted_verbatim` is true only when the persisted value equals the proposal byte-for-byte ▣
50. An all-agent interview with zero human confirmations still refuses at Gate O
    (`CLR05 checker_required`) ▣ **CB**
51. `wake_begin_client_onboarding` on a colliding family name → `client_open_family_collision`,
    a firm question, **no client row minted** ▣ **CB**
52. The concurrent-submitter receipt: two submitters on one park — the loser receives a receipt
    saying its submission was **not** accepted, and learns it from the receipt, not the index ▣ **CB**
53. `clientOnboarding_v1..v3` bodies are byte-unchanged; the registry points new admissions at v4;
    a parked v3 run completes on v3 ▣
54. The e2e re-pin is a **monotonic direction**, proven both ways (a trued pin and an untrued one) ▣

### B.9 Acceptance (law 29 / TA-P14 clause 4)
55. Full synthetic round on ROME PUBLIC ADVISORY, labelled per ADR-048, with the **denominator
    stated**: N documents in, M filed unattended, K clarified, and the failing-rung vector per
    unfiled document ▣
56. One real attribution on a BELCORT client, constraints 12 and 13 observed ▣
57. The F-A10 census names the four `rule`-spelled matchers as **non-members** of the retirement ▣

---

## Annex C · Decision register

| id | decision | why | alternative refused |
|---|---|---|---|
| **D-1** | A **fourth** `method` value, never `'agent'` | keeps `rig-invariants.test.mjs:168-172` green and leaves the ungated proposal lane ungated (survey finding 2) | admitting `'agent'` — it would silently authorize every existing `wake_record_client_resolution` row |
| **D-2** | `confidence` pinned **1.0** by the core; the model's number is an annotation | TA-P7's option C (model self-scores) was explicitly excluded; law 72's "never grades itself" is the same shape. Precedent `0018:94-…` | trusting a model-supplied confidence |
| **D-3** | The contradiction wall is **asymmetric** (refuse only) | a printed identifier confirming a client is already `record_rule_resolution`'s job; making it confirm here would be two architectures (TA-P11) | a symmetric wall |
| **D-4** | The collision family predicate lives in the **DB**, leading-token based | judgement decides *which* client; the *duty to clarify* must be mechanical | a model-judged "is this a family?" |
| **D-5** | Triage is a **new lane**, not the classify lane widened | classify's verdict is a document KIND; attribution is a different question with a different purpose and a different output wall. Open for review — the cheaper alternative is real | reusing the classify lane and branching in the worker |
| **D-6** | Receipts: a **common column contract + one union read view**, not one physical table | five Wave-F items would otherwise co-own one live body, against TA-P1's rider; TA-P11's test is satisfied by contract + one entrance | a single `agent_receipts` mega-table |
| **D-7** | The firm-narrow purpose is **one purpose, two moments** | the owner's word was "signs ONCE"; the `moment` column keeps the audit line honest | two separate purposes and two signatures |
| **D-8** | Identity fields do **not** join the F-A1 agreement predicate in this item | it is F-A1's body; F-A7 ships the human-confirmation arm and registers the widening | wiring identity corroboration here |
| **D-9 · RE-CUT (gate AB-5)** | `identity_document` is a **settleable kind on all FOUR surfaces** (`0017:692-698` · `classify_document` `0026:1290-1296` · `set_document_kind` `0026:1457` · `CLASSIFY_KINDS`) and **NOT** a `DB_REFUSED_KINDS` member | v1 asked for both, which is self-cancelling by `classify-llm.mjs:26-27` and fails `classify-unit.test.mjs:151-165`'s pinned disjointness; a kind the DB can never hold makes B8 a prompt instruction (constraint 2). No settle loop is created, which is the only hazard `DB_REFUSED_KINDS` guards | refusing it in the vocabulary (unbuildable); a separate triage-verdict field (a second kind surface, TA-P11) |
| **D-10 · NARROWED (gate AM-3)** | **Three** body-moves — `file_document` (F-A7a) plus `update_onboarding_plan` and `begin_client_onboarding` (now F-A7b) — buying **one semantic on the JUDGED path**, not estate-wide unification | `0027:26-40` enumerates **six** live `document_filings` writers from the live catalog, so the "two mutually-unaware writers" premise was false; the move still earns its place because the agent core must not be able to mint its own `'human'` resolution | duplicating the write in the new verb; widening the unification to all six writers (not costed, not earned here) |
| **D-16 · NEW (gate AB-2)** | `assert_client_resolved_bound` **STAYS two-value** while the generic assert extends | the bound assert is the opening-seed lane's confinement (`0018:75-87`, `for share` + a binding equality); a judged attribution may never satisfy an opening-seed gate. Recorded rather than omitted, with a cell proving it still refuses the new method | extending both asserts in one sweep — it would silently widen the keyed opening lane |
| **D-17 · NEW (gate AB-1/AB-2)** | The two-value world is measured by a **`pg_proc.prosrc` TEXT census**, not by a caller census | a caller census sees none of the seven inline re-derivations, including the BEFORE INSERT trigger that would refuse every judged filing | counting calls to the assert (v1's method) |
| **D-18 · NEW (gate AB-4)** | The classify consent gate lands in **`_enqueue_invoice_facts_core`**, not the claim body | `0090:494-499` + `wb-0020-legacy.test.mjs:630-639` forbid a typed-consent call edge in the claim body, and `0090:1238-1245` already ruled enqueue "the earlier, more honest place" | the claim body (breaks a ratified CI-enforced contract and queues tasks for unauthorized clients) |
| **D-19 · NEW (gate AM-2)** | The family predicate spans **`clients` ∪ the firm's `counterparties`** | ADR-0074:185-188 names ROME PUBLIC ADVISORY a **counterparty**; a clients-only predicate cannot see the collision the ruling named | clients only (v1) |
| **D-20 · NEW (gate AM-7)** | B1 inherits `record_rule_resolution`'s **AB-3 source discipline** and **sentinel-TIN exclusion** verbatim (`0015:417-442`) | `invoice_facts` carries colliding `field_path` names by design; without the scoping a supplier TIN refuses a correct verdict forever | reading any identifier on the document (v1) |
| **D-21 · NEW (gate AM-5)** | A **pre-activation document class** is named with its disposition — never deleted, retention extend-only, no purge verb | `wave-f-contract.md:297-298` and TA-P3 A's member F-A7-M6 require the class to ship *with* the narrow door; the mechanism already exists, the STATEMENT did not | leaving it implicit in the estate's table-wide laws |
| **D-22 · RULED 2026-08-22 (gate AM-8, WIDENED at landing)** | **Clara REVERSES her own posted misattribution herself and RAISES the question; only the cross-client RE-HOME is the human's.** *(Orchestrator ruling 2026-08-22: the escalation asked what TA-P6 A member OQ-A7-4 and TA-P7 rider (3) already settled — no new authority, so no owner ruling. The v2 "stays fully human-gated for now" default is SUPERSEDED.)* | the live `approve_wrong_client_correction` (`0027:196`) reverses and re-files atomically, so splitting it needs a legal reversed-but-unfiled half-state — that is a BUILD obligation now, not a blocker | a new reverse-only wake sibling + the reversed-but-unfiled half-state |
| **D-11** | `firm_open_questions` is a **new relation**, not a widened `open_questions` | nullable `client_id` would break the FK, the scope CHECK and nine consumers (survey finding 5) | widening `open_questions` |
| **D-12** | The `filing` wake kind is firm-scoped (`client_id IS NULL`) | a document being attributed has no client by construction | reusing `autodraft` (requires a client) |
| **D-13** | Chat parity rides `interactive` with **one** allowlist row | it is already firm-scoped with a null client; no CHECK change | a second new wake kind for chat |
| **D-14** | Gate O is **untouched** | it already fails closed against an all-agent interview, and that is the property we want (survey finding 6) | widening Gate O to accept an agent contributor |
| **D-15** | The client-file label states irreversibility in plain words | law 6 / PRD §6.8: no delete verb exists; a soft label would be a lie by omission | a neutral "created by assistant" chip |

---

## Annex D · D1 detail and the census re-cut list

### D.1 Window contents — SUPERSEDED by the gate

v1's `D1-a` / `D1-b` split is replaced by **four windows — D1-γ · D1-α (two files) · D1-β ·
D1-δ — enumerated in `filing-and-interview-annexes-2.md` §I.2**, because the true CoR set was
~16 bodies rather than nine and one of them (`claim_document_processing_task`) may not be CoR'd
at all. Nothing in v1's window contents survives unamended; do not build from this section.

### D.2 Ordering obligations, stated in both directions

> **The full seven, including the three the gate added (`chatTurn_v13`, the shared
> `_enqueue_invoice_facts_core`, and the per-train gating), are in annexes-2 §I.4.** The four
> below stand as originally written and are repeated because they were verified exact.
1. **F-A2 PR-1 merges first.** It extends `ck_wake_credentials_kind_0011`,
   `ck_wake_credentials_client_0011` and both `mint_wake_credential` gates for
   `interactive_client`. F-A7a extends the same four for `filing`. **A prestate probe in F-A7a's
   migration asserts `interactive_client` is already present and aborts if it is not** — a wrong
   merge order fails at apply, loudly, never silently.
2. **TA-P13's `llm_usage_events` reshape lands first or in the same train.** F-A7's triage and
   interview calls are unrecordable in today's shape (survey §6). A prestate probe asserts
   `document_id`/`task_id` are nullable and `client_id` exists; **absent, the metering step of the
   triage worker fails closed and the lane does not start.**
3. **The owner's digest sign-off precedes PR-α, and NOTHING else** (v2 narrowing; π and γ proceed
   meanwhile per `wave-f-contract.md:411-413`). A prestate probe cannot check a signature — the
   gate is procedural and stated in the design's header.
4. **C6 precedes the firm-narrow activation.** The activation verb requires an evidence document;
   without the DPA/disclosure/PDPA-basis artefacts there is nothing lawful to attach.

### D.3 Census re-cut list (extend-never-weaken, each re-derived by query, not from this list)
`client_resolutions.method` · `document_filings.basis` · **the seven-body `prosrc` predicate
census (annexes-2 §H)** · the three purpose CHECKs + the `doc_sha` CHECK ·
`ck_wake_credentials_kind_0011` + `…_client_0011` · `mint_wake_credential`'s two gates · the
autodraft allowlist count (`0011:4169-4176`) and its live test mirrors · `0078:255-259`'s
interactive-only η census · the role map (`0011:4290-4296`) · `assert_wake_allowed`'s rows,
including the `filing` kind's seven (§A.3) · `document_intakes.origin` + its paired CHECK · **the
kind vocabulary on all FOUR surfaces** — `documents_document_kind_check` (`0017:692-698`),
`classify_document` (`0026:1290-1296`), `set_document_kind` (`0026:1457`),
`CLASSIFY_KINDS`/`DB_REFUSED_KINDS` — · the 0090 five-sha postcheck block + its ACL prestate
capture · **the `document_filings` writer set (`0027:26-40`, six before, seven after α1)**.

**Corrected out of this list by the gate:** `0016:3202-3207` was the wrong location for the
classify kind CHECK (live tip `0026:1262`, 0038-spliced), and the `0038`/`0040` zero-agent-grant
tails are **one-shot DO blocks in applied history** — they are not "re-cut to the new truth"; a
**new** census is authored in F-A7's own migration and the old tails are left alone (gate AM-1).

### D.4 Comments that are part of the change, not decoration
`0090:346` (classify named a local lane) · `classify.mjs:12-14` ("no-egress") ·
`matcher.mjs:8-10` ("never … files a document") · `CorrectionWizard.tsx:5` ("Clara is NOT in this
loop") · `InterviewAttachments.tsx:16-24` (the provenance limit **and** its stale
`clara.intake_requests` name — the real object is `clara.document_intakes`, `0007:104`).

---

## Annex E · Predictions the PR-1 rig replay must confirm

Each is a claim this design could **not** settle from the bytes. None is relied on by any wall; each
has a stated fallback if the replay refutes it.

| id | prediction | if refuted |
|---|---|---|
| **P-1** | The new Tier-C triggers are `deferrable initially deferred` and fire at COMMIT; no existing trigger on `document_filings` changes tier | re-derive the tier table from the replayed census and re-cut §3.2 Tier C |
| **P-2** | `assert_client_resolved` has **zero** app-role EXECUTE grants at the live tip | if any exists, the recut becomes a grant question before it is a predicate question |
| **P-2a · CORRECTED (gate AB-6)** | The replayed caller census over `pg_proc` returns **THREE** live bodies — `_draft_entry_core` (`0016:3970`), `finalize_document_intake` (`0026:234`), `_draft_opening_item_core` (`0017:3162`, splice-reached). The eleven grep hits are successive CoRs of these three; `pg_proc` holds one row per function | if it returns **two**, 0018's splice did not apply and the opening-seed lane is unproven — stop and re-apply. If it returns four+, an unaccounted caller exists — stop and census |
| **P-2b · RE-AIMED (gate AM-1)** | The new arm added beside the existing conjuncts satisfies **F-A7's own** postcheck block (marker + accept-unbound + reject-bound + the seven-body census). `0018`'s tail is applied history and cannot observe the recut | if the new block fails, the arm's placement is wrong before the predicate is wrong — re-place. Never re-cut 0018 |
| **P-2c · NEW (gate AB-1/AB-2)** | The `prosrc` predicate census returns exactly the **seven** bodies of annexes-2 §H | more means an unaccounted re-derivation — census, then decide each before authoring α2 |
| **P-3 · RE-CUT (gate AM-2)** | Over **`clients` ∪ the firm's `counterparties`** the leading-token predicate returns ≥2 for the ROME family (two clients + one counterparty) and 1 for BEE CREATIVE SOLUTION | tune the predicate **before** the wall ships (the corpus-tune-pre-freeze lesson) |
| **P-4** | Zero live `document_filings` rows reference a `method='agent'` resolution | a backfill question, answered before the CHECK recut |
| **P-5** | The six wake roster/census surfaces are still exactly six after F-A2 PR-1 | re-census; the number is derived, never asserted |
| **P-6** | Extending `client_resolutions.method` and `document_filings.basis` validates trivially over existing rows | a data cleanup precedes the ALTER |
| **P-7** | No consumer of `document_intakes.origin` branches on anything but `'chat'` | the new origin gains an explicit arm at each branching consumer |
| **P-8 · SETTLED, no longer a prediction (gate AN-1)** | The fact-generation family is **FOUR**: `0090:236-238`'s seven-value `engine_kind` closed world minus `ocr`, `structured_parse`, `doc_classify`. `persist_document_extraction`'s live tip is `0026:497` | — (it is a byte-cited census now; the cell asserts it both ways) |
| **P-9** | Classify's per-firm task volume is low enough that consent-gating produces a visible hold count, not a silent stall | the hold surfaces as a dashboard count regardless; the prediction is about magnitude |
| **P-10 · SETTLED, no longer a prediction (gate AN-3)** | `filing_corrections.maker uuid not null references clara.users(id)` (`0007:317`) — a plain FK, no membership check, so the agent user id is accepted | — |
| **P-11 · NEW (gate AB-3)** | Every live tip in annexes-2 §G is what the rig replay returns, and the four 0038-spliced bodies carry their own prestate markers | a body this item cannot account for is not a body it may replace — stop, re-derive, and re-issue §G before authoring |

---

## Annex F · Change log

### v1.1 → v2 (the PR-0 gate: 6 blockers, 8 materials — record: `filing-and-interview-gate-record.md`)

**Gate 1 ran 2026-08-22 on two lenses** — a **BYTES** lens (18 findings; every estate claim
re-derived at its cited `file:line`, every planned CoR body's lineage grepped, the D1 set derived
independently, the closed-world censuses forced) and a **RULINGS** lens (4 findings; the design
read against ADR-0074 and `wave-f-contract.md`), each finding adversarially re-verified by an
independent lane. **Verdict: the ruled shape holds; six blockers and eight materials bind; the
item is severed into five trains and F-A7b is re-scoped as its own item.** What HELD is recorded
in the gate record §1 and should not be re-argued: the verb seam, the four-tier ladder's shape,
`method='agent'` staying refused, no model numeral in a durable artifact, F-A7-M1 confirmed, the
D34 shared-CHECK sequencing, TA-P13's dependency, and Gate O left alone.

**F1 (AB-1) — the `document_filings` BEFORE INSERT trigger joins the constitutional set.**
`_tf_stamp_document_pipeline` (`0007:415`, attached `:511-517`) re-derives the two-value predicate
at `:425-431` and raises `CLR01` on every judged filing. It was in no register of v1. Now
annexes-2 §H row 3, train α2, with a positive cell and an inverted twin (§J 58/59); design §3.2's
Tier-C note names it.

**F2 (AB-2) — the caller census is replaced by a `pg_proc.prosrc` RE-DERIVATION census: SEVEN live
bodies.** v1 counted calls to the assert and therefore saw none of the inline copies. Annexes-2 §H
gives each an EXTEND/STAY disposition (the bound assert STAYS — new **D-16**); the method itself
is **D-17**. Rider 3's posted arm gains its hard dependency: it cannot work until
`approve_wrong_client_correction` (`0027:268`) extends.

**F3 (AB-3) — eight bodies were cited to superseded text; annexes-2 §G is the live-tip register.**
Four are additionally spliced by `0038` at apply time and exist in no file, so **every CoR is
authored from a rig replay**. Migration `0027` — cited 0/0/0 times in v1 — enters the documents:
its lock-order law is stated as binding on every new acquirer (design §3.1, §5) with a
two-session race cell each (§J 63), and its six-writer enumeration re-grounds **D-10**.

**F4 (AB-4) — the classify consent gate moves to `_enqueue_invoice_facts_core` (`0090:1125`).**
`claim_document_processing_task` may not gain a typed-consent call edge (`0090:494-499` +
`wb-0020-legacy.test.mjs:630-639`) and the estate already ruled enqueue the honest place
(`0090:1238-1245`). New **D-18**; the body LEAVES the CoR set; cell 31 re-cut to prove the hold
happens before a task exists in the client's name.

**F5 (AB-5) — `identity_document` becomes a settleable kind on all FOUR surfaces and is NOT a
`DB_REFUSED_KINDS` member.** v1 asked for both, which is self-cancelling and fails a pinned CI
invariant. `classify_document` and `set_document_kind` move out of the ALTER list into D1-γ's CoR
table. **D-9 re-cut**; cells §J 66/67.

**F6 (AB-6) — "twelve callers" becomes THREE live caller bodies.** The eleven grep hits were
successive CoRs of three functions; `pg_proc` holds one row each, so P-2a's refutation branch
would have stalled the build. Cell 29, P-2a and design §9 R1 all restated, with the **seven**
re-derivations named separately as the true blast radius.

**F7 (AM-1) — 0018's tail block is one-shot apply-position history, not a live gate.** Survey rows
3a/3b are restated; cells 30a/30b are re-pointed at **F-A7's own re-runnable postcheck block**
(§J 71) authored in train α2. Row 12's `0038`/`0040` tails get the same treatment: a NEW census in
the new migration, never a re-cut of applied history.

**F8 (AM-2) — the family predicate spans `clients` ∪ `counterparties`** (new **D-19**), the worked
example is corrected (ROME PUBLIC ADVISORY is a separate firm and a counterparty, never a BELCORT
client), and P-3 and cell 10 are re-cut to the true cardinalities.

**F9 (AM-3) — D-10 narrowed.** Six live `document_filings` writers exist (`0027:26-40`), so the
estate-wide unification claim is withdrawn; the body-move survives on what it actually buys and
ships as **train α1, a pure behaviour-inert file**.

**F10 (AM-4) — `chatTurn_v13` belongs to F-A2's PR-2.** Chat parity leaves the runtime PR as
**train ε** and takes the next free `_vN` with a registry prestate check (annexes-2 §I.4 item 2).

**F11 (AM-5) — two contract clauses restored, one packaging fixed.** The **pre-activation document
class and its disposition** enter §3.5 (new **D-21**); **dual attribution** is re-labelled a
CONTRACT-severance ask against `wave-f-contract.md:296` (owner item, §8 OW-2); and the BUILD GATE
is narrowed to train α so the contract's named three can ship first, unblocked (train π).

**F12 (AM-6) — the `filing` kind's allowlist is WRITTEN** (new **§A.3**, seven rows), survey
finding 4 and design §1 are corrected to "no new EXECUTE grant, one allowlist ROW per read verb",
and cell 40 compares against that table instead of itself.

**F13 (AM-7) — B1 inherits the live matcher's AB-3 source discipline and sentinel-TIN exclusion**
(`0015:417-442`; new **D-20**), with a cell each (§J 68/69).

**F14 (AM-8) — WIDENED AT LANDING 2026-08-22, not escalated.** The v2 posted-misattribution
reversal was narrower than TA-P6 A's member OQ-A7-4 grants, and the orchestrator ruled that the
escalation asked an already-settled question: **Clara reverses her own posted misattribution
herself and raises the question; only the cross-client re-home is the human's.** Recorded as
**D-22 RULED**; cell 44 asserts the widened behaviour; gate record §5 item 2 is struck.

**Nits folded without argument (AN-1..AN-4):** P-8 corrected to four and demoted to a census ·
the v1.1 audit's two stale cites propagated (`interview.v1.core.ts:261-265`,
`InterviewAttachments.tsx:16-24`) and Annex F's completeness claim narrowed to the survey ·
four cite corrections (`0007:2278-2280`, `0020:152/197/249`, `0007:1525`) and P-10 settled at
`0007:317` · design §1's "two exceptions" trued to the count §5's table prints.

**Structure.** F-A7b's full spec moved verbatim to **annexes-2 Annex K** (it is now its own item);
the gate's registers, the re-cut D1 surface, the severed build sequence, the cross-item sequencing
obligations and the fold's new/re-cut cells are **annexes-2 §G-§J**. **The companion documents are
reconciled to the design doc of record:** where the survey's v1.1 audit certified a stale cite as
"Verified EXACT", the design's §5 and annexes-2 §G govern, and the survey carries the correction
in its own §0.

**v1.1 — 2026-08-22.** Citation audit against cfa0710, every `file:line` re-derived by the
instrument that prints it. Recorded in full at **survey §0**. Five substantive corrections
(the `assert_client_resolved` caller census composition and its invisible twelfth caller ·
`_active_document_filing`'s 29 sites across `0007`-`0030` · two previously unlisted live apply-time
assertions on the recut predicate, `0018:553-568` and `0018:751-767` · `record_rule_resolution`'s
insert lines · the `client_facts`/`client_fact_keys` swap) and ~20 line drifts. Consequences
carried into this issue: survey §7 gains rows **3a**, **3b**, **5a**; design §5 gains the
**`prosrc`-marker constraint on the constitutional recut** and §9's R1 is restated; annex B.4 gains
cells **30a**/**30b** and cell 29 is re-specified to derive its caller set by rig replay rather than
by grep; annex E gains **P-2a**/**P-2b**. No ruling, wall, verb or D1 window changed — the audit
moved evidence, not design.

**v1 — 2026-08-22.** First issue. Written against `main` at cfa0710 (frontier 0102) under the
2026-08-22 Track-A sitting rulings TA-P1 C · TA-P3 A · TA-P4 A · TA-P6 A · TA-P7 C · TA-P8 B ·
TA-P11 A · TA-P13 A · TA-P14 A. Estate survey issued as a companion. **Open at issue:** the owner's
digest sign-off on the two constitutional amendments (gating PR-1), five owner questions carried
under the standing delegation (design §8), and ten predictions (Annex E). **Not yet reviewed:** the
law-1 judgement-logic pass and the law-28 cross-model adversarial pass — both are PR-0's content,
and this document is their input, not their output.
