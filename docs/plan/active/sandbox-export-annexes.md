# F-A5b annexes — surface, battery, decisions, predictions, owner questions, risks

> **v2, gate-folded 2026-08-23** alongside `sandbox-export-design.md`
> (`sandbox-export-gate-record.md` is the fold's spec). The fold added cells B1.8-B1.13, B2.7,
> B3.6 and B4.5, re-cut B3.5 and B4.1-B4.3, corrected the F.3 acceptance fixture, added decisions
> C-18..C-24 and risk R-7, and took in five sections the design shed to stay under 500 lines:
> **G** (law 28's brief) · **H** (censuses) · **I** (the second render entrance) · **J** (the human
> doors) · **K** (dependencies).
>
> Companion to `sandbox-export-design.md` (the design of record) and `sandbox-export-survey.md`
> (the estate at the bytes). **Where this file and the design disagree, the design is right and this
> file is the bug.** Where this file and the *migration's printed line* disagree, **the printed line
> is right and this file is the bug** — the standing caveat every count in this repo carries.

---

## Annex A · The surface

> **Card 1 widens this surface — read alongside `card1-substitution-seam-annexes.md` Annex A.**
> F-A5b card 1 (the substitution seam) adds SIX verbs this lane's own enumeration does not carry:
> `claim_sandbox_export`, `sandbox_dispatch_begin`, `sandbox_dispatch_record` and
> `reap_exhausted_sandbox_exports` (the claim/dispatch/reap quartet PR-1 registered as a NAMED GAP
> — "no CLAIM verb ships in this PR-1"), plus `wake_compose_metric_preview_v2` and
> `clara.evaluate_metric_v2`. It also ALTERs two relations rather than minting any:
> `clara.sandbox_exports` gains the seven dispatch/cap columns those verbs need, and
> `clara.metric_primitives`' closed CHECK widens 11→12 for the `cell` primitive. No new TABLE, so
> A.1's count of three is unmoved. Card 1 CoRs four of this lane's bodies —
> `_sandbox_client_set`, `sandbox_export_payload`, `_tf_sandbox_export_lifecycle` and (outside this
> lane) `_tf_metric_cell_integrity` — each pinned by pre-image sha in its own prestate.
>
> **Annex B cross-reference:** card 1's own battery (its Annex B) re-runs THIS lane's censuses
> against the widened surface — the wake grant roster, the bidirectional aclexplode EXECUTE census,
> and the block/basis walls — rather than restating them. **Annex C cross-reference:** card 1's
> CD-1..CD-16 and BL-1..BL-8 all descend from §3.6b's ruling above; where they disagree with this
> document, §3.6b's forward pointer says which is later.

### A.1 · Relations — three, enumerated (law 34: an addition is a review event)

| relation | posture | why it exists |
|---|---|---|
| `clara.sandbox_views` | firm-scoped, FORCE RLS, **append-only + no-truncate** (`0005:280-298` idiom) | the referent `p_view` never had (gate defect 1). Immutable because `body_sha256` is what makes an export reproducible |
| `clara.sandbox_exports` | firm-scoped, FORCE RLS, **lifecycle wall** freezing the request half (`0079:136-140` idiom) | the export record TA-P10 C′ (1) requires, and the retry lifecycle a render needs. **Not append-only** — that was gate defect 2 |
| `clara.export_recipients` | firm-scoped, FORCE RLS, **immutable + supersede** | OQ-3's answer; the schema has none (survey X8) |

**No table SELECT is granted to `clara_agent_ro` on any of the three** (F-A5's C4/C5 posture,
inherited). The agent reaches them through the typed readers in A.2 and nowhere else.

### A.2 · The verb enumeration — this list is the count, and every census reads it

| # | verb | lane | grantee |
|---|---|---|---|
| 1 | `clara.wake_mint_sandbox_view(jsonb, jsonb, text, jsonb, text)` | wake wrapper → ungranted core | the wake role |
| 2 | `clara.wake_request_sandbox_export(uuid, uuid, text, text, jsonb, text)` | wake wrapper → ungranted core | the wake role |
| 3 | `clara.wake_sandbox_export_state(uuid)` | definer reader (VOLATILE — a receipted reader cannot be `stable`, A6), own receipt | the wake role |
| 4 | `clara.sandbox_export_payload(uuid, text)` | `stable` definer, **lease-scoped** (`0081:162-168`) | `clara_runtime` |
| 5 | `clara.complete_sandbox_export(uuid, text, text, bigint, text)` | definer, **hash IN**, set-once | `clara_runtime` |
| 6 | `clara.fail_sandbox_export(uuid, text, jsonb)` | definer, attempts/backoff | `clara_runtime` |
| 7 | `clara.register_export_recipient(text, uuid, text, text, uuid[], text)` | human, **admin+** | `clara_authenticated` |
| 8 | `clara.supersede_export_recipient(uuid, text, text)` | human, **admin+** | `clara_authenticated` |
| 9 | `clara.list_sandbox_exports(uuid, int)` | human, **bookkeeper+** (`0002:518-520` idiom) | `clara_authenticated` |

Plus the ungranted cores (`_sandbox_view_mint_core`, `_sandbox_export_request_core`,
**`_sandbox_client_set(p_firm uuid, p_basis jsonb, p_body jsonb)`**, `_recipient_covers`) — **granted
to NOBODY**, reached as internal calls under `clara_fn_owner` (the `0004:749-750` containment,
`0077:22-29`'s rule). **The containment is about WHO MAY INVOKE, never about tenant-scoping the
body** (gate B6): `clara_fn_owner`'s own policy is `using (true)`, so every relation these cores read
is scoped by an **explicit predicate in the body** against `p_firm`, which the wrapper resolves from
`clara.wake_context()` and never reads off a basis row (design §3.2; the `0083:102-108` precedent).

**Allowlist rows: `('interactive', <name>)` for each of the three wrappers — three rows, not six**
(A11/PR-1 truing, 2026-08-25). This text originally read "and the `interactive_client` triple once
F-A2's D34 limb merges" — WRONG, discovered by rig replay at PR-1 authoring: the live estate carries
its own deliberate, independently-tested closed-world invariant (GB-3/D34,
`f-a2-chat-limb.test.mjs` + `f-a2-grants.test.mjs`) capping `interactive_client` at EXACTLY ONE verb
(`wake_open_question`), specifically so that kind can never quietly become a posting kind. Widening
it for this lane would be an owner-ruling-class change to the D34 wall ITSELF, not a seeding
decision this design may make. **This posture is PERMANENT unless the D34 wall is re-ruled** — never
a placeholder pending a merge that already happened. Annex K's own dependency row already priced
this exact fallback (`('interactive', …)` rows only; HOME-scoped sandbox works); PR-1 shipped it.
Never a `'proactive'` or unattended row. The closed-world cell asserts the count **in both
directions** (F5-D30: a roster that can only find extras cannot find omissions) and additionally
proves `interactive_client`'s own one-row invariant is UNTOUCHED.

### A.3 · The token vocabulary — every refusal is typed, none is a bare string

| token | raised by | means |
|---|---|---|
| `sandbox_view_basis_absent` | mint | no basis rows; an unresolved client set is the unknown, not the empty |
| `sandbox_view_basis_unknown` | mint | a basis element that does not resolve **in the caller's firm** — absent, foreign and NULL-`firm_id` answer IDENTICALLY (no existence oracle, `0083:109-111`) |
| `sandbox_view_block_basis_absent` | mint | a body block carries no `basis_ref` — nothing ties it to a durable row (design §3.1) |
| `sandbox_view_block_basis_unknown` | mint | a block's `basis_ref` names no label of this view's own `basis` |
| `sandbox_view_client_set_empty` | mint **and** request | the derived set is `{}`; containment over the empty set is vacuously true, so it is refused at both doors |
| `sandbox_view_body_malformed` | mint | a figure arrived as a number rather than a `displayed_text` string (E-R8 floor 1) |
| `export_recipient_unknown` | request | no such recipient in this firm |
| `export_recipient_superseded` | request | the row has a successor |
| `export_recipient_membership_inactive` | request | `kind='firm_member'` whose membership is `removed` |
| `recipient_coverage_incomplete` | request | `client_set ⊄ covered_clients`; **the uncovered ids are named** |
| `watermark_policy_absent` | request | no `sandbox_watermark` row for this locale in the effective window (law 36; TA-P10 C′ (3)) |
| `sandbox_export_lease_not_held` | payload / complete / fail | the `0081:162-168` shape |
| `sandbox_export_already_completed` | complete | the set-once arm |
| `chart_kind_unknown` | renderer | no fallback to bars on this entrance either |
| `watermark_text_unresolved` | **renderer** | the pinned row's string is absent or blank in the render payload — a `need()`-shaped guard AHEAD of `typstString`, which would otherwise coerce it to `""` (design §3.6, gate B7) |
| `sandbox_authority_refused` | **the receipt schema** (F-A5 PR-1) | F-A5's wall at its true scope. **CORRECTED at the fold** (gate M8): v1 attributed it to "posting / facts / report writers" — two of those have no owning PR and `record_client_fact` cannot raise it at all (`0055:532-545`). What guards the rest is **G-3**, plus the detective control at B4.3 |

---

## Annex B · The battery — what each cell forces, and what would make it a lie

**Standing rules, inherited.** A forced cell asserts its precondition or exits via a NAMED, COUNTED
`skipHere`; never `noteLane`+return, never a `.catch` swallowing a premise, never an OR between two
walls. Fixtures THROW on construction failure. **Differential cells over self-referential ones.**
A wall's proof is a cell that makes the wall REFUSE — never a substring match on source text.

### B.1 · The client-set derivation (§3.2) — judgement logic, so every arm is forced

| cell | forces |
|---|---|
| B1.1 | a preview-cell basis derives the cells' own client ids, `client_set_basis='exact'` |
| B1.2 | a `scope='client'` free-read basis derives `{client_scope}`, `'exact'` |
| B1.3 | a `scope='cross_client'` basis derives the receipt's named set, `'exact'` — **skips, named and counted, until F-A6 v2 merges** |
| B1.4 | a `scope='firm'` basis derives **the whole firm roster**, `'firm_closure'` — and the twin: adding a client to the firm AFTER the mint does not change the frozen set |
| B1.5 | **no basis → REFUSE** `sandbox_view_basis_absent`; the differential twin with one basis row succeeds |
| B1.6 | a mixed basis (preview cells **and** a firm-wide read) derives the **union**, and the union carries `'firm_closure'` — the weaker label wins, never the stronger |
| B1.7 | replay: derive twice from the same row, byte-identical (P-3) |
| **B1.8** | a body block with **no `basis_ref`** → REFUSE `sandbox_view_block_basis_absent`; the twin with the ref present succeeds. *(fold, gate B0)* |
| **B1.9** | **the narrowing differential** — a two-block body, block 1 citing client A's read and block 2 citing client B's, derives `{A,B}`; **the twin that drops block 2's `basis_ref` REFUSES** rather than deriving `{A}`. This is the cell the gate's failure path walks, and a green on the first arm alone proves nothing |
| **B1.10** | a `basis_ref` naming a label absent from this view's own `basis` → REFUSE `sandbox_view_block_basis_unknown`; the twin naming a declared label succeeds |
| **B1.11** | **cross-firm basis** — a `freeform_read_log` id owned by firm B, minted from a firm-A session → REFUSE `sandbox_view_basis_unknown`; the twin on firm A's own row succeeds. **Two further arms, same token, no oracle:** an id that does not exist, and a row whose `firm_id` is NULL (`0002:310` — still nullable until F-A6 hardens it). All three refusals must be **indistinguishable** to the caller |
| **B1.12** | `firm_closure` covers **non-active** clients — an `archived` AND an `onboarding` fixture client are present in `client_set`; the **differential twin** runs an `active`-only derivation against the same fixture and the cell FAILS. *(fold, gate M2 — the estate's house form is the wrong one here: `0016:866`, `0017:4927-4928`)* |
| **B1.13** | a `firm_closure` mint on a firm with **zero** clients → REFUSE `sandbox_view_client_set_empty`; the twin on a one-client firm succeeds |

### B.2 · Coverage (§3.3)

| cell | forces |
|---|---|
| B2.1 | `firm_member` + active membership → covered; the twin with `status='removed'` → `export_recipient_membership_inactive` |
| B2.2 | `external` with `client_set ⊆ covered_clients` → covered; the twin one client short → `recipient_coverage_incomplete`, **and the refusal NAMES the uncovered id** |
| B2.3 | a `firm_closure` view + an `external` recipient covering three of twenty clients → REFUSE. This is the §3.2 consequence made visible, not an accident |
| B2.4 | a recipient of **another firm** → `export_recipient_unknown` (never "found but refused" — it is not visible) |
| B2.5 | a superseded recipient → refuse; the successor row → covered |
| B2.6 | `covered_clients` cannot be written by any wake verb — a prosrc census over the granted wake surface, **plus** a behavioural attempt |
| **B2.7** | **`_recipient_covers` never answers YES on an empty set** — a view whose `client_set` is `{}` (constructed directly, bypassing B1.13's mint refusal, so the second door is proven on its own) REFUSES `sandbox_view_client_set_empty` for **both** kinds; the twin with one client covered succeeds. Without this cell an implementation using `<@` passes every external recipient alive. *(fold, gate M10; the `0020:640-643` idiom)* |

### B.3 · The watermark (§3.6) — the positive control and its differential twin

| cell | forces |
|---|---|
| B3.1 | **the extracted text of the produced PDF contains the ratified STAMP on EVERY page** (P-1). A per-document assertion would pass a one-page stamp on a ten-page export. *(The footer line, if the owner ratifies one, emits ONCE in flow — `layout.mjs:152`'s box sits before the sections loop — so it is asserted per DOCUMENT, never per page: design §3.6.)* |
| B3.2 | with the policy row absent, the **request** refuses (`watermark_policy_absent`) and **no bytes exist** — never unwatermarked bytes |
| B3.3 | the pinned `watermark_policy_version_id` is what the bytes carry: supersede the row, re-render the same export, bytes unchanged |
| B3.4 | a hostile label cannot remove the background — the law-28 payloads run and B3.1 still passes (P-2) |
| B3.5 | **the DECISION axis** — the entrance has no `decision.watermark` branch, forced behaviourally by rendering with every decision shape. **RE-CUT at the fold:** v1 read this as proving *"no code path produces an unwatermarked PDF"*; it proves only that the BRANCH always runs. The string's own axis is B3.6 |
| **B3.6** | **the PAYLOAD-CONTENT axis** — the policy row is present and pinned at request (so B3.2's door passes), then the render payload is mutated so the watermark string is **absent**, then `null`, then `""`, then whitespace-only. Each arm: the render REFUSES `watermark_text_unresolved`, **no bytes exist and `complete_sandbox_export` is never reached**; the twin with the string present renders and B3.1 passes. Forced by mutating the payload, never by a substring match on source. *(fold, gate B7 — `typstString` coerces `null` to `""` and never throws, `layout.mjs:73-79`)* |

### B.4 · The narrative-authority wall at the boundary (§3.7)

**RE-CUT at the fold (gate M8).** v1's B4.1-B4.3 asserted a NAMED refusal from three writers. Only
one of the three has an owning PR and a body that can raise it; `record_client_fact` validates a
non-blank basis, a `basis_kind` in four literals and a document for the document kind, and nothing
else (`0055:394-397`, `:499-501`, `:532-545`), so a `sandbox_view_id` typed into its free-text
`p_basis` **succeeds** — v1's refuse arm was a green that proved nothing, and its differential twin
was self-referential. The battery now proves what is actually walled, and names what is not.

| cell | forces |
|---|---|
| B4.1 | **the receipt schema** refuses a sandbox citation in a field typed as an authoritative basis → `sandbox_authority_refused`; **the twin** with a legitimate basis succeeds. **Skips, named and counted, until F-A5 PR-1 merges** — the wall is F-A5's to build (`reporting-agency-design.md:321-324`), and this lane asserts it rather than claiming it |
| B4.2 | **RETIRED** — see B4.5. There is no `client_facts` refusal to force, and a cell that cannot fail is worse than no cell |
| B4.3 | **the DETECTIVE control is not vacuous** — the PR-4 query counting `client_facts` rows whose free-text `basis` contains a `sandbox_views`/`sandbox_exports` id returns **zero** on a pristine rig, and returns **one** after a fixture plants such a row. This proves the DETECTOR, not a wall: the free-text path is the inherited F-A6 R-8 residual and is registered, never claimed |
| B4.4 | `sandbox_views` has **no** `definition_version_id` and **no** `cell_id` column — a catalog assertion, and the structural reason a caller cannot launder authority through the view row |
| **B4.5** | **G-3, in both directions** — a catalog census over every FK and every uuid column of the posting, reporting and knowledge relations asserts **none** is typed to reference `clara.sandbox_views` or `clara.sandbox_exports`; and the reverse arm asserts the census's own relation name list equals the enumeration in Annex H, so a relation added later cannot slip out of coverage (F5-D30: a roster that can only find extras cannot find omissions) |

### B.5 · One architecture (§3.5)

| cell | forces |
|---|---|
| B5.1 | **G-1**: every `chart.mjs` export is reachable from both entrances or neither — asserted in both directions |
| B5.2 | **G-2**: the sandbox path end to end leaves `clara.render_jobs` empty (census C10 re-proven positively) |
| B5.3 | an unknown `chart_kind` on the sandbox entrance REFUSES; the twin with a known kind renders |
| B5.4 | both entrances produce byte-identical geometry for the same series — the "two mutually-unaware computations" detector |

### B.6 · Lifecycle and forgery

| cell | forces |
|---|---|
| B6.1 | every frozen column of `sandbox_exports` refuses an UPDATE (one cell per column, P-4) |
| B6.2 | every moving column accepts its lawful transition (P-4's other direction) |
| B6.3 | `complete_sandbox_export` twice → `sandbox_export_already_completed` |
| B6.4 | a worker without the lease → `sandbox_export_lease_not_held`, for payload, complete and fail alike |
| B6.5 | `sandbox_views` refuses UPDATE and DELETE (append-only) and TRUNCATE (no-truncate) |
| B6.6 | cross-firm: no session of firm A sees a view, export or recipient of firm B — a POSITIVE read of firm-B fixtures from a firm-A session returning zero, never an empty table |

---

## Annex C · Decisions

| # | decision | ground |
|---|---|---|
| **C-1** | `p_view` becomes **two relations**: an immutable `sandbox_views` and a lifecycle `sandbox_exports` | gate defects 1 + 2; the `render_jobs` split idiom (`0079:136-140`) |
| **C-2** | **The hash comes IN** at completion; the DB never renders and never re-hashes | `_seal_report_artifact_core`'s real signature (`0071:121-124`) |
| **C-3** | **No third artifact relation.** `report_artifacts`' chain machinery serves the seal chain the sandbox is structurally unreachable from | law 74; weight |
| **C-4** | `client_set` is **derived at mint from durable rows**, never supplied | F5-D14 |
| **C-5** | **A firm-wide free read derives the WHOLE firm roster** (`firm_closure`) | `freeform_read_log` cannot name its clients (gate defect 3); review law 2 — absence is not evidence; law 36 |
| **C-6** | The set is **frozen with the view**; a later roster change does not widen an old export's coverage | reproducibility of the coverage proof |
| **C-7** | **`clara.export_recipients` is minted**, with two kinds; firm-member coverage is **computed, never stored** | survey X8; a stored roster copy is stale the moment a client is added |
| **C-8** | **Registering a recipient is a HUMAN act (admin+)** | `covered_clients` IS the wall; law 78 devolves acts, not the authorship of the guard. **Owner question 2** |
| **C-9** | The **presence check runs at request time**, and the resolved version is **pinned** into the frozen half | an actionable refusal beats a dying job; pinning makes the bytes reproducible |
| **C-10** | The sandbox watermark is **unconditional** — no `decision.watermark` branch on this entrance | an unwatermarked sandbox artifact is indistinguishable from a sealed one |
| **C-11** | A **sibling job family**, not a widened `render_jobs` | X3; census C10 stays closed, and closed is now a positive claim (G-2) |
| **C-12** | **One geometry library, two entrances, censused in both directions** (G-1) | TA-P10's rider; TA-P11 A's test |
| **C-13** | An unknown chart kind **refuses** on this entrance too | `reporting-agency-design.md:380-381` — the fallback is how S6 stayed invisible |
| **C-14** | **Export is not TA-P3's egress regime**; `client_egress_purpose_consents` is not widened | survey X9. **Owner question 4** |
| **C-15** | v1 mints the view **on the export path**; the screen seam is stated so F-A5/Wave-G can close the divergence for free | scope. **R-1; owner question 6** |
| **C-16** | This lane's **renderer PR lands after F-A5 PR-4** | two renderer ceremonies must not contend |
| **C-17** | `watermark_policy_versions` is a **shared surface** — the conductor is notified before authoring, and a CHECK extension is priced, not assumed | survey U1/X7 |
| **C-18** | **Every body block carries a `basis_ref` LABEL into the view's own `basis`, and an unattributable block refuses the mint** | gate B0; TA-P10 C′ (2)'s *"every `client_id` in the file"*. A pointer keeps F5-D14 (the model never types a client id) while binding the set to the body |
| **C-19** | **`coverage_proof` records `body_sha256`** | the proof names the exact body it covered, not "a body" |
| **C-20** | **The basis is read under an explicit `firm_id = p_firm` conjunct in the core's body**, with the firm resolved by the wrapper from `wake_context()`; equality, never `is not distinct from` | gate B6; `clara_fn_owner`'s policy is `using (true)` (`0002:485-491`) and the estate has one recorded fail-open of this exact class (`0083:102-108`). NULL is the unknown and must refuse |
| **C-21** | **`firm_closure` is every `clara.clients` row of the firm at ANY `status`**, and `covered_clients` is validated the same way | gate M2; `0003:38` + `0017:658-659` are three-valued and the estate's roster habit filters `active` (`0016:866`) — the wrong way here |
| **C-22** | **An empty derived `client_set` REFUSES at the mint AND at the coverage check** | gate M10; containment over `{}` is vacuously true, so the wall would pass for every recipient. The `0020:640-643` explicit-zero-cardinality idiom |
| **C-23** | **The renderer keeps its own watermark wall** — a `need()`-shaped guard raising `watermark_text_unresolved` on an absent or blank string, ahead of `typstString` | gate B7; `typstString` coerces `null` to `""` (`layout.mjs:73-79`). Law 78's rider R-TA-P1-walls: an entrance's wall sits at its own door |
| **C-24** | **§3.7's refusal is scoped to the receipt schema; G-3 carries the rest and the free-text path is a registered residual with a detective control** | gate M8; F-A5's own wording (`reporting-agency-design.md:321-324`) and `record_client_fact`'s actual validation set |

---

## Annex D · Predictions (the survey's P-1..P-6, restated as what settles them)

**P-1** per-page watermark in extracted PDF text · **P-2** `typstString()` holds against the law-28
payloads · **P-3** the derivation replays byte-identically · **P-4** the lifecycle wall transplants
(a cell per frozen column and per moving column) · **P-5** the sibling job family shares zeta's
worker and Fly app — **if it cannot, the cost is a second machine and it is priced at PR-3, never
absorbed** · **P-6** `watermark_policy_versions` admits the sandbox payload **without** a CHECK
extension — **unpredictable from text; the table does not exist** (U1).

**Every prediction is a prediction until the rig prints it.** None is banked as a green.

---

## Annex E · Owner questions — six, each with its recommendation, default and cost

**Q1 (OQ-1 + OQ-2, moved here by R-L15) — the `sandbox_watermark` trio, and does it ride one
signing with `artifact_watermark`?** *Why it is not a unilateral fix:* a string burned into an
artifact's bytes changes future artifacts' bytes — a renderer ceremony and a wording decision at
once. *Recommendation:* **one sitting, two keys, six rows**, in the register of `0067:142-148`'s
claim labels (a plain statement of what the document is not). **Draft for the sandbox key, for the
owner to cut or replace:**

| locale | stamp (the page background) | footer line (the boxed sentence) |
|---|---|---|
| en | ANALYSIS ONLY — NOT AN AUTHORITATIVE FIGURE | Prepared by Clara for analysis. Not a financial statement, not reviewed, not for filing or lodgement. |
| ms | ANALISIS SAHAJA — BUKAN ANGKA BERAUTORITI | Disediakan oleh Clara untuk analisis. Bukan penyata kewangan, tidak disemak, bukan untuk pemfailan. |
| zh | 仅供分析 — 非权威数字 | 由 Clara 编制，仅供分析之用。非财务报表，未经复核，不得用于报送或申报。 |

*Fail-closed default (the standing one, `gate-record:260-261`):* **no row is seeded** — and for this
lane that means **the export path ships DARK: nothing can be exported at all** (survey X12), because
TA-P10 C′ (3) forbids a code default. That is the honest cost of the default, and it is the reason
Q1 is first.

**Q2 — who may register an EXTERNAL export recipient?** *Recommendation:* **a human at the admin+
floor**, for both kinds, because `covered_clients` is the wall itself (C-8). *Fail-closed default:*
admin+ for both. *The owner rules toward maximum autonomy and may want the `firm_member` kind
devolved to Clara* — that is a narrower widening (a firm member's coverage is total either way) and
would be his to make. *Cost of the default:* one admin action the first time a group owner is added.
*Priced, at the fold, so this is a decision and not a rebuild:* devolving `firm_member` costs **one
wake sibling verb over the same ungranted core plus one allowlist row**. **This question is genuinely
OPEN** — the design's §1 carried the human floor under *"the ruled shape (fixed, not designable)"*
with no ADR-0074 clause behind it, while TA-P1 C's ratified text says **"adding a reservation is an
owner ruling"** (`0074:339`) and this same wave built the closest analogue as an agent-reachable wake
verb (`wake_add_bank_account`, `bank-agency-annexes-1-mechanics.md:53`). The fold moved the item out
of that heading; the question stands as it was. *(gate M9.)*

**Q3 — the `firm_closure` rule.** A chart computed from a HOME (firm-wide) free read carries the
whole firm's client set, so only a firm-covering recipient may receive it (§3.2, C-5).
*Recommendation:* **accept it**; the route to a tight set is to compute from *named* reads, which is
exactly what F-A6 v2 provides. *The alternative, priced:* let a human **declare** a narrower set with
a written attestation — buildable, but it moves the coverage decision from a mechanical check to a
human sentence, which is the thing TA-P10 C′ (2) chose a mechanical check over.
*Fail-closed default:* `firm_closure`, no declared narrowing.

**Q4 — does an EXTERNAL export need a client-level consent?** Today `client_egress_purpose_consents`
governs sending data to a **model provider**, purpose closed to `('wiki_synthesis')` (`0020:153`).
*Recommendation:* **recipient coverage is the whole gate; do not widen the purpose CHECK** (C-14,
survey X9) — merging a human-recipient decision into a provider-processing register would make every
downstream reader of that register wrong about what a consent row means. *Fail-closed default:* the
recommendation. *If the owner wants a consent:* it is a **new** register, not a widened one.

**Q5 — retention for sandbox export bytes.** The sealed lane keeps artifacts seven years (E-R14).
*Recommendation:* **the RECORD forever, the BYTES 24 months** — a non-authoritative analysis PDF has
no statutory retention, and `clara-render` storage only grows (F-A5's own named cost).
*Fail-closed default:* the recommendation, written into `docs/ops/DR-render.md` with PR-4.
*Cost:* an export older than 24 months can be re-rendered from its frozen view, not retrieved.

**Q6 — screen/file divergence.** v1 mints the view at export time, so a chart on screen and the same
chart in a file are not structurally the same bytes (C-15, R-1). *Recommendation:* **accept for v1**
and have the Wave-G screen half render from `sandbox_views.body`, which closes it for free.
*Fail-closed default:* the recommendation, R-1 registered. *Cost:* until Wave-G, "the chart I saw"
and "the chart I sent" are proven identical by discipline, not by structure.

---

## Annex F · Risks, non-goals, acceptance

### F.1 · Risks, each with its owner and its early warning

| # | risk | early warning |
|---|---|---|
| **R-1** | screen/file divergence until the Wave-G seam closes (Q6) | any support question of the form *"the chart in the PDF differs from what I saw"* |
| **R-2** | **U1 bites** — `watermark_policy_versions` closes its payload keys and this lane needs a CHECK extension on a shared surface | read F-A5 PR-1's landed DDL the day it merges; notify the `conductor` before authoring either way |
| **R-3** | the injection surface (X11) is genuinely new; the law-28 pass may find that model-composed strings cannot safely reach Typst at all | a finding at PR-0. *Fallback if so:* the sandbox body's free text is restricted to a **closed set of typed blocks with escaped leaf strings**, and prose moves out of the PDF into the chat turn |
| **R-4** | **the lane never gets scheduled** — the same risk R7 recorded against the severance itself (`reporting-agency-gate-record.md:227`) | it is registered in `PROGRESS.md:128`; this design's landing is the second registration |
| **R-5** | `firm_closure` makes the feature feel broken to a user who expects to export a HOME-computed chart to a client | Q3 puts it in front of the owner **before** it is discovered in use |
| **R-6** | a second renderer ceremony contends with F-A5 PR-4's | C-16 sequences them; the pre-change digest stays pullable seven years either way |
| **R-7** | **the TRANSCRIPTION residual** — §3.1's `basis_ref` binds a block to a durable row, but the figure inside it is still a numeral the model typed. A block correctly cited to client A's read can carry a number read elsewhere or invented, and nothing in the estate can contradict it (`freeform_read_log` stores the query text and no result, `0002:308-315`) | **this is OWNER CARD 1, not a risk the lane may absorb** (design §7; `sandbox-export-gate-record.md` §6). *Early warning:* any support question of the form *"this figure is not what the system says"*. *Fail-closed default while it is open:* **the figure path is not built** |

### F.2 · Non-goals (the design's §7, restated so nothing is inferred)

The sandbox's on-screen half · any change to the seal chain, `report_artifacts`, `render_jobs` or
the claim path · SST-02 · a portal or any **delivery** mechanism (this lane produces a file and a
record; who sends it is out of scope, and Q4 tests whether that stays true) · any widening of
`client_egress_purpose_consents` · e-filing · a per-asker RBAC tier on exports (TA-P9 A(6)'s posture,
inherited) · **and nothing here narrows TA-P10 C′** — §7 enumerates every clause and where it is
built.

### F.3 · Acceptance — done means the loop is walkable (TA-P14 A)

**The fixture, corrected at the fold (gate M4).** v1 named *"RPR (the synthetic sandbox firm)"*. **RPR
is ROME PROPERTIES SDN BHD** — a real BELCORT test **client**, created by `create_client` under
BELCORT (`packages/db/scripts/onboard-rpr.mjs:4-5`, `:54`, `:101`, `:202`;
`packages/db/deploy/rpr-coa.csv:3`), with no clients of its own. The synthetic sandbox **firm** is
**ROME PUBLIC ADVISORY** `39008536` (digest law 66, `docs/adr/README.md:381-382`; ADR-0045). The
conflation was inherited verbatim from `reporting-agency-annexes-2-record.md:179`, whose own `:207`
proves RPR there means ROME PROPERTIES — review law 3's exact shape, and the repo warns against it by
name (`tax-computation-survey.md:87-89`). Under either reading items 2 and 3 were **unrunnable**:
RPR is one client, and ROME PUBLIC ADVISORY has exactly one client
(`f-a2-window-ab-ceremony-asrun.md:141-147`).

**The choice, made visibly rather than left to PR-4.** Three options existed: (a) mint a second client
under ROME PUBLIC ADVISORY — rejected, because **ADR-0072 ⑤ ruled the sandbox firm NOT re-created at
the Wave-G factory reset** (`f-a2-window-ab-ceremony-asrun.md:151-153`), so the fixture has a shelf
life; (b) run on **BELCORT** over two of its three ADR-0075 test-fixture clients — **TAKEN**; (c)
record a TA-P14 (4) deferral — unnecessary, since (b) is available now. **BELCORT is the operator firm
and ROME PROPERTIES · ROME SECRETARY · BEE CREATIVE SOLUTION are resettable test fixtures** authorised
as test data by their owner (hard constraint 13; ADR-0075 §1), which is the true ground — *not* the
"no client harm" gloss, which was wrong about which entity it described. No bytes reach an outside
party either way: §7's non-goal keeps delivery out of scope.

1. On **BELCORT** (the operator firm; its three clients are ADR-0075 test fixtures): a narrative
   aggregate is computed, a view is minted, **exported to a firm member**, the bytes carry the
   watermark on every page, and the export appears in the human list.
2. A **cross-client** view over **ROME PROPERTIES and ROME SECRETARY** is exported to an **external**
   recipient registered by a human as covering both — and the same view **REFUSES** to a recipient
   covering only one, **naming the uncovered client**.
3. A **`firm_closure`** view over BELCORT refuses to that same external recipient (BELCORT has a third
   client, BEE CREATIVE SOLUTION, which the recipient does not cover — so the refusal is real, not
   arranged) and succeeds to a firm member.
4. With the `sandbox_watermark` row for `ms` absent, an `ms` export **refuses at the request** and
   no bytes exist; with it present, it renders.
5. **The receipt schema refuses** the exported view as an authoritative basis and succeeds on a
   legitimate one (B4.1), **G-3's census is green in both directions** (B4.5), and **the detective
   control reports zero** on the estate with a planted-row twin proving it can report one (B4.3).
   *(Re-cut at the fold: v1 asked three writers to refuse; two have no owning PR and the third
   cannot — gate M8.)*
6. **The law-28 pass has run AGAINST v2 and its findings are folded** — an acceptance item, not a
   review preference, **and it is outstanding as of this fold**.
7. The full estate suite is green on a pristine rig, tails unfiltered, **every skip named and
   counted** (B1.3 until F-A6 v2 merges; B4.1 until F-A5 PR-1 merges).
8. **Neither owner card has been closed by a build.** The `displayed_text` figure path ships only
   after card 1 is ruled; Q4's answer is on file or the export path stays firm-member-only.

---

## Annex G · Law 28's cross-model adversarial pass — the brief

**STILL OWED. It runs against v2, before PR-1 merges** (`reporting-agency-gate-record.md:250-253`).
The centre is X11: this is the first path putting **model-composed text** in front of the typesetter.
Given a hostile `p_body` — labels, titles, prose — and a hostile `p_basis`, can it:

1. **Escape `typstString()` and reach `#page(...)`, producing an UNWATERMARKED export?** The headline
   attack. §3.6's positive control (B3.1) is the detector; the pass must try to defeat it.
2. **Defeat the render-time watermark guard** — reach the emit with an unresolved or blank string
   past C-23's `need()`-shaped check. *(New at the fold: v1 had no guard here to attack, only an
   absent branch to observe.)*
3. **Narrow the client set** — a body whose blocks show more than their `basis_ref`s resolve to, so
   a narrower recipient passes coverage. *(The fold gave this a mechanism, C-18/C-19; **the pass must
   attack the mechanism, not re-report the gap**. Note what it does NOT close: R-7's transcription
   channel is owner card 1 and out of the pass's scope.)*
4. **Reach across firms through the basis** — a `freeform_read_log` id of another firm, a NULL-firm
   row, a guessed sequential id. *(New at the fold: C-20's predicate is the thing to defeat.)*
5. **Forge or re-target an export record** — reach `complete_sandbox_export` with another export's
   id, or re-run a completed one.
6. **Exfiltrate through a label** — carry a sibling client's data into a chart label the recipient is
   not covered for.
7. **Launder authority** — get a `sandbox_view_id` accepted as a basis, by any route G-3's census
   does not cover.
8. **Bypass the recipient register** — a row of another firm, a superseded row, or a `firm_member`
   row whose membership was removed; and **an empty `client_set`** against C-22's two doors.

The pass runs on a lane independent of the author's (review law 1 is the floor, not the ceiling), and
its findings fold into v3.

---

## Annex H · Walls, censuses and gates that move (design §4)

**C10 stays closed and is re-proven positively** (G-2). **C6's name list gains
`watermark_policy_versions`** — an F-A5 PR-1 obligation this lane depends on (survey §3); if F-A5
lands without it, F-A5b adds it and says so rather than inheriting an uncovered table. **The wake
grant roster** gains this lane's wrappers, asserted by NAME LIST in both directions (F5-D30). **The
relation/table census** moves by three (`sandbox_views`, `sandbox_exports`, `export_recipients`) —
counted from the migration's printed line, never from an annex. **The RLS forced-relation census**
gains three: all firm-scoped, FORCE RLS, no `clara_agent_ro` table grant anywhere (F-A5's C4/C5).

**Card 1's own additions to the counts that move** (`card1-substitution-seam-design-part3.md` §7):
the **relation/table census does NOT move again** — card 1 mints no table, it ALTERs two that
already exist, so the RLS forced-relation census is likewise unmoved and owes no new row. What DOES
move: the **verb enumeration** by six (A.1's note above), the **wake grant roster** by exactly ONE
allowlist row (`('interactive', 'wake_compose_metric_preview_v2')` — never `interactive_client`,
whose roster card 1 captures at prestate and re-proves byte-identical at its tail), the
**evaluator-closure census** by one registered version (`evaluate_metric` v2, nine members, born
UNDEPLOYED), and the **primitive closure** 11→12. Every one of those counts is printed by card 1's
own migration tail and re-derived from the live catalog, never from this annex — the standing
caveat that the printed line is right and the annex is the bug applies here as it does above.
**G-1** is new and is TA-P11's watch made mechanical (Annex I).

**G-3 is new at the fold** (design §3.7, cell B4.5): **no FK and no uuid column in the posting,
reporting or knowledge layers is typed to reference `clara.sandbox_views` or
`clara.sandbox_exports`.** Its relation name list is enumerated in the migration and asserted equal
to the census's own list, so a relation added later cannot slip out of coverage. **It is a catalog
census, not a text scan** — the free-text path is R-8's residual with B4.3's detective control, and
the two are never conflated.

---

## Annex I · The second render entrance (design §3.5)

**G-1 · every geometry export is shared.** Every function exported by `chart.mjs` is reachable from
**both** entrances or from **neither**. An entrance-local geometry function fails the census — the
"two mutually-unaware computations of the same fact" TA-P11 A forbids — and N3's three new chart
kinds (`lineGeometry` / `areaGeometry` / `stackedBarGeometry`,
`reporting-agency-design.md:377-380`) are exactly where it would happen.

**G-2 · the sandbox mints no `render_jobs` row.** A prosrc census over the sandbox path plus a
behavioural cell: the sandbox verbs, called end to end, leave `render_jobs` empty.

**Ceremony discipline.** A sandbox entrance is a renderer change: a fresh image digest, the
pre-change digest pullable for seven years, run as a ceremony from merged `main`. **It lands AFTER
F-A5 PR-4** so two renderer ceremonies do not contend (C-16, R-6).

---

## Annex J · The minimal human doors (design §3.8, TA-P14 (2))

`/reports` gains a **sandbox exports** panel: a list (view, recipient, client set, watermark version,
state, sha256, when, by whom), the **recipient register** form (register / supersede, admin+), and
every refusal rendered as text a bookkeeper can act on — `recipient_coverage_incomplete` names the
uncovered clients, `watermark_policy_absent` says *"the owner has not ratified the sandbox watermark"*
rather than a token, and the fold's new refusals get the same treatment:
`sandbox_view_basis_unknown` says *"a cited read does not belong to this firm"*,
`sandbox_view_block_basis_absent` says *"part of this view cannot be traced to a read"*, and
`sandbox_view_client_set_empty` says *"this firm has no clients to cover"*. Wave-G restyles them in
place; it does not replace the verb (`frontend-handoff-2026-08-23.md` §0's rule).

---

## Annex K · Dependencies (design §6)

| dependency | why | if it slips |
|---|---|---|
| **F-A5 PR-1** — `watermark_policy_versions` DDL | this lane adds ROWS to a table it does not own (U1). **If the payload's key set is CHECK-closed, this lane needs a CHECK EXTENSION on a shared surface** — routed to the `conductor` lane before authoring, never assumed. **It also owns the receipt-schema wall B4.1 forces** | PR-1 blocks; B4.1 skips, named and counted |
| **F-A5 PR-4** — the sealed lane's renderer ceremony | two renderer ceremonies must not contend; F-A5's drill closes DR-render's unrun boundary first | PR-3 waits |
| **F-A6 PR-1** — `freeform_read_log`'s hardened `scope`/`client_scope` **and its `firm_id` NOT NULL** | §3.2's derivation reads them (U2); until the NOT NULL lands, C-20's equality predicate is what refuses a NULL-firm row | the free-read basis kinds are unavailable; preview-cell bases still work |
| **F-A6 v2** — the cross-client named read | **the only source of an EXACT client set for a multi-client narrative basis** (§3.2). Without it every such view derives `firm_closure` and only a firm-covering recipient may receive it | the capability is narrower, not wrong; stated, not hidden |
| **F-A2 PR-1** — `interactive_client` (D34) | **RESOLVED at PR-1 authoring, 2026-08-25 — merged, but PERMANENTLY NOT what this row assumed.** F-A2 PR-1 IS merged; `interactive_client` itself is real. But the live estate ALSO carries its own deliberate, independently-tested closed-world wall (GB-3/D34) capping `interactive_client` at exactly the one `wake_open_question` verb, discovered by rig replay. Widening it is an owner-ruling-class change to that wall, never a seeding decision this design makes. | `('interactive', …)` rows only shipped in PR-1; HOME-scoped sandbox works; a client-pinned session cannot mint/request an export. **Permanent, not contingent on a future merge.** |
| **the owner's signing** (Q1) | X12 | **the lane ships dark** |
| **owner card 1** (R-7; design §7) | it gates the `displayed_text` **figure path**, not the lane | prose-and-chart-label views without model-typed figures are still buildable; the figure path waits |
