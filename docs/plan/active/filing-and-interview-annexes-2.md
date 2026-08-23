# F-A7 annexes 2 — the gate-1 fold: live tips, the re-derivation census, the severed train

> Annexes to `filing-and-interview-design.md` (**v2, 2026-08-22 — gate 1 folded**). This file
> exists because annexes 1 is at its working ceiling and because three of the gate's six
> blockers are *registers*, not paragraphs: **G** the live-tip register (AB-3) · **H** the
> two-value re-derivation census (AB-1, AB-2) · **I** the re-cut D1 surface, the severed build
> sequence and the cross-item sequencing obligations (the width ruling, AM-3, AM-4) · **J** the
> new and re-cut battery cells the fold owes.
>
> **Gate record of record: `filing-and-interview-gate-record.md`.** Where this annex and the
> design disagree, **the design governs**; where either disagrees with `wave-f-contract.md` or
> `docs/adr/0074-the-track-a-sitting.md`, those govern.
>
> **Method law, restated because the gate found it violated eight times.** A body's LIVE text
> is what `pg_get_functiondef` returns on a rig at frontier 0102 — **not** the last
> `create or replace` in the migration set, because `0038` patches four of these bodies at
> APPLY TIME by `pg_get_functiondef` → string replace → dynamic install. For those four the
> live text exists in **no file in this repository**. Every CoR below is authored from a rig
> replay; a body copied out of migration text is a defect, not a shortcut.

---

## Annex G · The live-tip register (AB-3)

Every body F-A7 plans to CoR, cite, or reuse, with its **true** live tip, whether `0038`
splices it at apply time, and — for the mis-cited ones — the live safety property a text-copy
from the v1 citation would have deleted.

| body | v1 cited | **LIVE tip** | 0038 splice | what a text-copy from the v1 cite would drop |
|---|---|---|---|---|
| `clara.file_document(uuid,uuid,text,text)` | `0007:1367` | **`0009:2291-2363`** | — | 0009's re-cut resolution derivation; the inline two-value re-derivation at `:2319`/`:2324` and its `CLR01` at `:2326` |
| `clara.retire_document_filing(uuid,text,uuid,text)` | `0007:1450-1455` "reused verbatim" | **`0027:393-444`** | `0038:7604-7625` | 0027's `v_peek_doc` pre-lock (`0027:410-413`) — the documents-before-filings order that closed a reproduced 40P01; the restructured blocker query at `:426-434` |
| `clara.confirm_attribution_candidate(uuid,text,boolean)` | `0007:2356-2402` | **`0027:121-190`** | — | the same lock-order fix; 0009's intermediate CoR at `0009:2365` |
| `clara.approve_wrong_client_correction(uuid,text,text,text)` | `0009:2444` (CLR19) | **`0027:196-…`** | `0038:7495-7520` | 0027's lock order; 0017 R1-F1's `opening_entry_k_family_only` marker; 0009's `adopted_reversal` marker; 0038's live bank-statement provenance refusal. Its two-value re-derivation is `0027:268`, `CLR01` at `:270` |
| `clara.record_rule_resolution(uuid,text)` | `0007:2296-2352` | **`0015:405-475`** | — | the **AB-3 source discipline** (`:417-428`, `engine_kind in ('ocr','structured_parse')`) and the **MyInvois sentinel-TIN exclusion** (`:433-442`) — both load-bearing for the design's own B1 (AM-7) |
| `clara.classify_document(...)` | `0016:3202-3207` | **`0026:1262-…`** | `0038:7816-7840` | `prior_gl` in the kind list (`0026:1294`); 0024's `claim_secret_digest` capability gate; 0026's `doc_classify`-scoped version mint; 0038's live bank-statement refusal |
| `clara.set_document_kind(uuid,text,text,text)` | not cited | **`0026:1439-…`** | `0038:7766` | the human-attestation engine id `clara-classify-human:v1`; the `prior_gl` vocabulary patch |
| `clara.persist_document_extraction(...)` | "0007 lineage tip" | **`0026:497-…`** | — | the intermediate 0015/0016 CoRs; the engine-kind closed world it must read (`0090:236-238`) |
| `clara.list_unassigned_documents(int)` | `0009:2590-2611` | **`0011:3943-…`** | — | the agent-lane consent gate (`current_role='clara_agent_ro'` → `wake_firm()` / `_agent_read_admitted`) |
| `clara._tf_stamp_document_pipeline()` | **absent** | **`0007:415-…`** (created once, never replaced) | — | — (AB-1: the omission itself was the defect) |
| `clara.assert_client_resolved(uuid,uuid,uuid)` | `0018:57-68` | `0018:57-68` ✓ | — | correct as cited |
| `clara.assert_client_resolved_bound(...)` | `0018:75-87` | `0018:75-87` ✓ | — | correct as cited |
| `clara._enqueue_invoice_facts_core(...)` | **absent** | **`0090:1125-…`** | — | — (AB-4: the gate's true home) |
| `clara.claim_document_processing_task(...)` | `0090:328` | `0090:328` ✓ | — | correct as cited, but **removed from the CoR set** (AB-4) |
| `clara.prepare_egress_dispatch(...)` | `0090:1007` | `0090:1007` ✓ | — | correct as cited |
| `clara.mint_wake_credential(...)` | `0011:1156` | `0011:1156` ✓ | — | correct as cited |
| `clara.update_onboarding_plan(...)` | `0017:2632` | `0017:2632` ✓ | — | correct as cited |
| `clara.begin_client_onboarding(text,text)` | `0017:2492` | `0017:2492` ✓ | — | correct as cited |

### G.1 · 0027's lock-order law — binding on every new acquirer

`0027`'s header (`0027:1-40`) records the estate's **documents-before-`document_filings`**
lock order, adopted after the 0025 Q-round reproduced a real 40P01 in 1 of 16 concurrent runs.
It enumerates the writer set **from the live catalog**, not from the ledger entry — *"six
functions actually write document_filings"*:

- already documents-first (unchanged, the canonical order): `file_document` ·
  `finalize_document_intake` · `_seed_verified_document`
- filings-first, **fixed by 0027**: `confirm_attribution_candidate` (§A) ·
  `approve_wrong_client_correction` (§B) · `retire_document_filing` (§C)

**F-A7 law, stated here because 0027 was cited nowhere in v1:** every new
`document_filings` acquirer this item introduces — `_file_document_write`,
`_agent_file_document_core`, `wake_reattribute_document` — takes `clara.documents`
`FOR UPDATE` **first**, and each gets a two-session race cell (the 0020-resolver test pairs
are the template). A new acquirer that takes the filings row first re-opens the deadlock class
0027 closed.

---

## Annex H · The two-value re-derivation census (AB-1, AB-2)

**The instrument.** Not "who calls `assert_client_resolved`" — that census sees none of these.
The census is a **text census over `pg_proc.prosrc`** for the predicate
`method in ('human','rule')`, run on a fresh rig apply, and it is re-run as a postcheck in
train α2's own migration. Migration-text grep returns **13** hits; six sit inside superseded
bodies. **Seven live bodies carry the predicate.**

| # | live body | live tip | what the predicate does there | disposition | window |
|---|---|---|---|---|---|
| 1 | `clara.assert_client_resolved(uuid,uuid,uuid)` | `0018:62` | the constitutional gate every posting floor traverses | **EXTEND** — the new arm added *beside* the existing conjuncts | **α2** |
| 2 | `clara.assert_client_resolved_bound(uuid,uuid,text,uuid)` | `0018:81` | the opening-seed lane's confinement (`for share`, binding equality) | **STAYS two-value** — a judged attribution may never satisfy a bound opening-seed gate; recorded as **D-16**, with a cell proving it still refuses the new method | **α2** (assertion only, no CoR) |
| 3 | `clara._tf_stamp_document_pipeline()` | `0007:429` (raise at `:425-431`) | BEFORE INSERT on `document_filings`; raises `CLR01` on a non-authoritative resolution | **EXTEND** — otherwise every judged filing aborts at INSERT (AB-1) | **α2** |
| 4 | `clara.file_document` → `clara._file_document_write` | `0009:2319`, `:2324` (`CLR01` at `:2326`) | re-derives or mints the resolution inside the write | **EXTEND**, inside the extracted delegate — the agent core passes a judged resolution and must not mint a second `'human'` one | **α1** (extraction) + **α2** (predicate) |
| 5 | `clara._seed_verified_document(...)` | `0007:1592` | fixture/seed path; picks the authoritative resolution for a seeded filing | **EXTEND** for parity — a divergent two-value world in the seed path makes every fixture a false negative | **α2** |
| 6 | `clara.propose_wrong_client_correction(...)` | `0007:2496` | destination-client authority check when a correction is proposed | **EXTEND** — rider 3's proposal arm targets a client whose only resolution may be judged | **α2** |
| 7 | `clara.approve_wrong_client_correction(...)` | `0027:268` (`CLR01` at `:270`) | destination-client authority check at approval | **EXTEND** — otherwise rider 3's posted arm cannot be approved by a human at all (AB-2 attack b) | **α2** |

**Superseded copies, recorded so a later reader does not re-raise them:** `0004:96` (the
assert's birth, superseded by `0018:57`) · `0007:1396`, `:1401` (`file_document`'s 0007 body,
superseded by `0009:2291`) · `0007:2564` (0007's `approve_wrong_client_correction`) ·
`0009:2469` (0009's, both superseded by `0027:196`).

**Extend-never-weaken, both directions.** Each of the six EXTEND bodies gets a positive cell
(the fourth method value is admitted) and an inverted twin (`method='agent'` still refused,
`confidence < 0.95` still refused, `superseded_at is not null` still refused). Body 2 gets the
opposite pair. `rig-invariants.test.mjs:168-172` stays green throughout.

---

## Annex I · The re-cut D1 surface and the severed build sequence

### I.1 · The trains

| train | what | ceremony | gated on |
|---|---|---|---|
| **π** | additive only: `firm_open_questions` + verbs · the correction siblings · the family predicate as a pure function · the promotion card · `agent_receipts_visible` | **none** | nothing (`wave-f-contract.md:411-413`) |
| **γ** | the egress train: two purposes + the firm-narrow family · classify re-gated **at enqueue** · the output wall · the kind vocabulary across four surfaces · the comment corrections | **D1-γ** | **C6** |
| **α** | the constitutional train, two separately revertable files: **α1** the pure `_file_document_write` extraction (behaviour-inert) · **α2** the CHECK extensions + Annex H's seven decisions | **D1-α** | the owner's **digest sign-off** |
| **β** | the filing verb: the ladder · `_agent_file_document_core` · `agent_filing_receipts` · the Tier-C triggers · the `filing` wake kind + its enumerated allowlist + the six roster re-truings | **D1-β** | α and γ merged; **F-A2 PR-1** merged |
| **ρ** | runtime: the triage lane (D-5) · `classify.mjs` / `classify-llm.mjs` consent plumbing + the kind · `matcher.mjs`'s posture comment | none | γ, β |
| **ε** | chat parity: one `interactive` allowlist row + the toolface, as the **next free** `chatTurn` `_vN` | none | **F-A2 PR-2's `chatTurn_v13` landed** |
| **δ** | **F-A7b, re-scoped as its own item**: `onboarding_answer_proposals` · `confirm_onboarding_answers` · the two body-moves · `wake_begin_client_onboarding` + the plan columns · `clientOnboarding_v4` + the submission-receipt route contract · the e2e re-pin | **D1-δ** | nothing in F-A7a |

### I.2 · The CoR sets, per window

**D1-γ (the egress window).** ▲ marks a hot runtime path.

| body | live tip | why |
|---|---|---|
| ▲ `clara._enqueue_invoice_facts_core(...)` | `0090:1125` | the classify consent gate, at enqueue (AB-4); terminal never-claimed failed receipt, never a raise |
| ▲ `clara.prepare_egress_dispatch(...)` | `0090:1007` | the `document_processing` arm |
| `clara.grant\|activate\|deactivate\|revoke_client_egress_purpose` | `0090:744/806/878/940` | in-body purpose allowlists + the five `prosrc` sha re-pins |
| ▲ `clara.persist_document_extraction(...)` | **`0026:497`** | the firm-narrow output wall |
| ▲ `clara.classify_document(...)` | **`0026:1262`**, spliced `0038:7816` | the `identity_document` kind (AB-5) — **rig replay only** |
| `clara.set_document_kind(...)` | **`0026:1439`**, spliced `0038:7766` | the same kind vocabulary — **rig replay only** |

*ALTERs in γ:* the three purpose CHECKs by discovered name + the `doc_sha` CHECK ·
`documents_document_kind_check` (`0017:692-698`) · `document_intakes.origin` + its paired
CHECK. *Left out of γ deliberately:* `claim_document_processing_task` (AB-4 — it may not gain
a typed-consent call edge; `0090:494-499` + `wb-0020-legacy.test.mjs:630-639`).

**D1-α (the constitutional window), two migration files.**

- **α1 — pure extraction, behaviour-inert.** `clara.file_document(uuid,uuid,text,text)`
  (live tip **`0009:2291`**) becomes a thin delegate over a new ungranted
  `clara._file_document_write`. Provable in isolation: a normalized-`prosrc` differential
  showing the moved text is byte-equal modulo the wrapper, plus the whole estate suite green.
  No new behaviour, no new value, no new caller.
- **α2 — the recut.** `client_resolutions.method` CHECK (`0003:90`) and
  `document_filings.basis` CHECK (`0007:71-72`), both extend-only; Annex H rows 1, 3, 4, 5, 6,
  7 CoR'd; row 2 asserted unchanged. Plus F-A7's **own** postcheck block re-authoring the
  properties `0018`'s one-shot tail can no longer prove (AM-1): the `prosrc` marker on the
  recut body, the accept-unbound / reject-bound functional probes, and the seven-body
  re-derivation census — template `0090:1062-1100`.

**D1-β (the filing-verb window).**

| body | live tip | why |
|---|---|---|
| ▲ `clara.mint_wake_credential(...)` | `0011:1156` | the `filing` kind — **both gates**, `:1163-1165` and `:1178-1186`; **shared with F-A2 PR-1 (D34)** |

*ALTERs in β:* `ck_wake_credentials_kind_0011` + `ck_wake_credentials_client_0011`
(`0011:623-628`), extend-only, both shared with F-A2 PR-1. *New objects taking a brief lock:*
the two deferred Tier-C triggers on `document_filings`.

**D1-δ (F-A7b, its own item).** `clara.update_onboarding_plan(...)` (`0017:2632`) →
`_update_onboarding_plan_core`; `clara.begin_client_onboarding(text,text)` (`0017:2492`) → the
shared birth core. Lower traffic, still audited human writers with in-flight interview runs.

**New objects, no D1:** `firm_open_questions` · `agent_filing_receipts` · the three
firm-egress relations · `onboarding_answer_proposals` · every new verb · the
`egress.misrouted` event type · the `agent_receipts_visible` view · `onboarding_plans`' two
new columns.

### I.3 · The revised build sequence

1. **PR-0 — the gate. DONE** (`filing-and-interview-gate-record.md`). It was **not** gated on
   the digest signature and neither is π or γ.
2. **PR-π (DB, additive, no ceremony, not amendment-gated).** The contract's named three plus
   the promotion card and the receipts view. `UNNUMBERED_*`, numbered at merge.
3. **PR-γ (DB, the egress train, D1-γ).** Prerequisite **C6**. Law 28's cross-model
   adversarial pass is mandatory on this PR — it is a consent boundary and an injection
   surface at once.
4. **PR-α (DB, the constitutional train, D1-α, TWO migration files).** Gated on the owner's
   digest sign-off. Law 1's independent judgement-logic review is mandatory; the review reads
   **one** change, so the revert is one file.
5. **PR-β (DB, the filing verb, D1-β).** After α and γ. Law 1 review over §3.2's nine rungs and
   §3.3's four riders. α and β may share one ceremony night as two sequential windows.
6. **PR-ρ (runtime).** The triage lane (D-5 settled first) · classify consent plumbing + the
   `identity_document` kind · `matcher.mjs`'s corrected posture comment. Bundle-grep after
   build (the WDK silent directive-swallow lesson).
7. **PR-ε (runtime, chat parity).** After F-A2 PR-2 lands `chatTurn_v13`: one `interactive`
   allowlist row + the toolface, as the next free `_vN` with a registry prestate check.
8. **PR-dash (dashboard).** The firm-question queue · the verdict card with its citations · the
   promotion card · the client-side commit form (survey §8's absent door).
9. **PR-acc (acceptance, zero code).** Re-measure as-run; `PROGRESS.md`; the F-A10 census
   naming the four `rule`-spelled matchers as non-members.
10. **F-A7b — its own item**, opened after F-A7a's acceptance: PR-δ (DB + runtime, D1-δ) then
    its own dashboard and acceptance PRs (the echo-confirm batch with five per-field controls
    and the "opened by Clara" label ride δ's dashboard PR).

### I.4 · Cross-item sequencing obligations (stated, never assumed)

1. **F-A2 PR-1 merges before PR-β.** It extends `ck_wake_credentials_kind_0011`,
   `ck_wake_credentials_client_0011` and both `mint_wake_credential` gates for
   `interactive_client`; β extends the same four for `filing`. **A prestate probe in β's
   migration asserts `interactive_client` is already present and aborts if it is not** — a
   wrong merge order fails at apply, loudly, never silently.
2. **F-A2 PR-2 lands `chatTurn_v13` before PR-ε** (AM-4). ε ships the **next free** `_vN` above
   whatever tip F-A2 leaves and carries a prestate check that the registry default is F-A2's
   version. Two items minting one frozen export is a hard-constraint-9 violation, and
   freeze-lint will catch it only after both are authored.
3. **TA-P13's `llm_usage_events` reshape lands first or in the same train as PR-ρ.** F-A7's
   triage and interview calls are unrecordable in today's shape (`0094:66-69`). A prestate
   probe asserts `document_id`/`task_id` are nullable and `client_id` exists; **absent, the
   metering step of the triage worker fails closed and the lane does not start.**
4. **`_enqueue_invoice_facts_core` is a shared body.** Before authoring γ, re-derive whether
   any other in-flight Wave-F item (F-A3's bank/statement lane is the candidate) CoRs the same
   body — **one CoR or a strict ordering, never two**. The same check applies to
   `persist_document_extraction` and `prepare_egress_dispatch`.
5. **The owner's digest sign-off precedes PR-α only.** A prestate probe cannot check a
   signature — the gate is procedural and is stated in the design's header.
6. **C6 precedes PR-γ's firm-narrow activation.** The activation verb requires an evidence
   document; without the DPA / disclosure / PDPA-basis artefacts there is nothing lawful to
   attach.
7. **The four 0038-spliced bodies** (`approve_wrong_client_correction`,
   `retire_document_filing`, `set_document_kind`, `classify_document`) are authored from a rig
   replay **on the day of the PR**, and each CoR re-asserts 0038's own prestate markers before
   installing (`0038:7495-7500`, `:7604-7609`, `:7766-7770`, `:7816-7822` are the shapes to
   copy) — a body this item cannot account for is not a body it may replace.

### I.5 · π AS BUILT (PR-1, 2026-08-23) — this section GOVERNS the receipt surface

Everything below is measured on a rig replay at frontier 0102 and re-proven by the migration's
own tail plus `packages/db/tests/f-a7-pi.test.mjs` (20 cells). Where it differs from §3.4 or §I.1,
**this section is what exists.**

**1 · The contract is a PROJECTION contract, not a physical-column one.** §3.4's ten names are not
the columns the members have: F-A2's `entry_post_receipts` carries `model_snapshot jsonb` +
`gate_verdicts jsonb` and none of `failing_rungs / trigger_kind / trigger_id / authorization_id /
adopted_verbatim` (`f-a2-annexes-3-record.md` E.1); F-A8 diverges the same way. Each member keeps
its table exactly as designed and PROJECTS onto the contract. No in-flight member PR changed.

**2 · NINETEEN columns**, live at `select ordinal, column_name, data_type from
clara.agent_receipt_contract order by ordinal`: `receipt_kind · receipt_id · firm_id · client_id ·
subject_id · acting_actor · on_behalf_of · occurred_at · model · model_version · rationale ·
verdict · failing_rungs · via_wake_kind · trigger_kind · trigger_id · authorization_id ·
adopted_verbatim · scope`. `receipt_id`/`subject_id`/`trigger_id` are `text` because member PKs are
`uuid` on some tables and `bigint` on others (`freeform_read_log.id`, measured). Nullability is
DOCUMENTED, not enforced — a view column carries no NOT NULL, so the member's CHECK owns it.

**3 · `scope` (R-L26, 2026-08-23) is ordinal 19 — LAST — and non-nullable.** `create or replace
view` permits only a TRAILING append, so placing it beside `firm_id` where it reads better would
break every shim an earlier train position had installed, repairable only by a `drop view` the
union forbids. Non-nullable because a three-valued column in a visibility predicate is how a row
becomes visible to everyone by accident.

**4 · The union floor is TWO CLOSED ARMS**, one notch tighter than R-L26's letter:
`((scope='firm' and firm_id = clara.jwt_firm()) or (scope='platform' and firm_id is null)) and
coalesce(clara.actor_role_rank(),-1) >= clara.role_rank('bookkeeper')`. A bare `or
scope='platform'` would let ONE mislabelled firm-scoped row reach every firm in the estate. With
both arms closed the correspondence `platform ⇔ firm_id IS NULL` holds in both directions and
every inconsistent row is INVISIBLE rather than over-visible — a member that mislabels loses its
own rows and finds out, and can never leak another firm's. *Why the predicate had to move at all:
under a bare `firm_id = jwt_firm()` a NULL `firm_id` evaluates NULL, which `is not true`, so a
platform receipt would be hidden from EVERY firm — worse than the mapping R-L26 rejected.*

**5 · SEVEN per-item SHIM VIEWS, not a union over base tables**, because zero of the seven member
receipt tables exist at the frontier (all measured absent; F-A6's `freeform_read_log` exists but
pre-contract). π creates `_agent_receipt_src_f_a2 … _f_a8` as typed empty stubs, **ungranted**;
`agent_receipts_visible` is created once and **never re-cut by a member**. A member's whole
registration act is one `create or replace view` on its OWN shim plus
`select clara._assert_receipt_surface_conforms('_agent_receipt_src_<item>')` in its tail.
Order-independent; no merge-time coordination. **The wall is Postgres itself** — rename, retype,
drop and reorder are all refused — with one hole it does not close: an extra TRAILING column
installs unseen, so the checker tests **arity first**, deriving the expected count from the
contract (never a literal). `clara.agent_receipt_source_census()` reports per-item wiring from
`pg_depend` (what the shim REACHES), never from `expected_source` (what it claims).
**MEMBER ONBOARDING — the one sentence that matters: `scope` is not optional; a NULL there hides
all your rows.** The stub ships `null::text as scope`, so a member that overrides the eighteen
columns it already knew about and leaves the nineteenth alone projects `scope = NULL`, which
matches NEITHER arm of the floor. There is no DDL error, no read error, and
`_assert_receipt_surface_conforms` PASSES — arity 19 and `null::text` is valid `text`. The rows are
simply visible to nobody. This is the single most likely mistake in the design, which is why the
net exists: `agent_receipt_source_census()` reports a per-shim `dark_rows` count and
`clara.agent_receipt_dark_rows()` gives the detail, both written `… is not true` rather than
`not (…)` so that a NULL `scope` cannot exclude itself from its own census (the three-valued trap
that would make the instrument blind to exactly what it is for). Battery cell `pi-A10` plants one
and proves both instruments name it.

**The shims stay at the DEFAULT (definer semantics) — measured, alternative disproven.** The F-A8
lane built the real nesting on a rig: with `security_invoker = true` the intended path REFUSES with
`42501 permission denied` on the base table, because the human's identity propagates through the
owner-run union into the shim, where that human holds no SELECT grant. The option that reads like
hardening turns every item's arm dark. **The residual hole it cannot close, named:** a wrongly
granted `select` on a shim returns rows to a human, bypassing the bookkeeper floor AND both arm
predicates — so the ACL census is not defence-in-depth, it is the wall. `pi-A9` asserts zero
non-owner grantees on all eight internal views AND grants one to prove the census fails. On F-A8's
firm-less shim that mistake costs Tier-1 draft content below the role floor; on the six
FIRM-SCOPED shims it is a cross-tenant read.

**Do not define the shims off one another** (`select * from <the first> where false`): it makes six
items depend on one item's view and reports `wired=true` before any receipt table exists — a
false green from the census built to be differential. The first draft did exactly this and the
migration tail caught it; all seven are written out in full and depend on nothing.

**Registered cost:** an eighth receipt-bearing item beyond the seven needs one CoR of the union
view; the census fails loudly if one appears. *(A registry of `projection_sql` TEXT rebuilt by a
function was ruled first and superseded: a persisted `clara.*` function containing `EXECUTE` is a
hard red on `check-wiki-dynamic-sql` — measured, with a positive control — and a stored SQL string
executed by a DEFINER is an arbitrary-DDL door past RLS.)*

**6 · π ships NO wake surface; the four wrappers and BOTH correction siblings moved to β.**
`clara_wake_filing` is **not a role** — the live set is `clara_authenticated · clara_agent_ro ·
clara_wake_interactive · clara_wake_proactive · clara_runtime · clara_fn_owner` (+3 LOGIN roles),
and the string appears in no `.sql` in the repo. Annex A.1's floor name means "the wake write role,
gated to the `filing` KIND by `assert_wake_allowed`", and that kind plus its seven allowlist rows
are β's (§A.3). A wrapper shipped in π would be reachable by no principal. The correction siblings
additionally need α1's `_file_document_write` and α2's `method`/`basis` CHECK extensions — the
design already says the posted arm cannot work before α2. **π therefore ships: relations,
UNGRANTED cores (`_firm_question_core`, `_identifier_promotion_core`), the pure family predicate,
the human-side verbs (`resolve_firm_question`, `dismiss_firm_question`,
`confirm_identifier_promotion`, `decline_identifier_promotion`) and the read surface.** β adds one
allowlist row and one grant per wrapper over cores that already exist.

**7 · Three further build deltas, recorded rather than absorbed.** (a) `resolve_firm_question`
carries **no `p_file` arm**: A.1's sketch `(…, p_client uuid default null, p_file boolean default
false, p_op_key)` is not a legal Postgres signature (a defaulted parameter may not precede a
non-defaulted one), and its filing arm needs `confirm_attribution_candidate(p_candidate, p_op_key,
p_file_document)` — measured live signature — which takes an attribution CANDIDATE, not a
(question, client) pair. β adds the arm. (b) **No `egress.misrouted` event type**: it exists for
the correction siblings, so registering it now would touch `event_types` + `trigger_taxonomy` +
`taxonomy_active` for a consumer that arrives in β. For the same reason `_firm_question_core`
writes `clara._audit` and does not `_append_event`. (c) The family predicate uses
**boundary-preserving** normalisation, NOT the estate's `name_normalized` expression
(`lower(regexp_replace(name,'[^a-zA-Z0-9]','','g'))`, live in `create_counterparty`), which strips
spaces too and turns 'ROME PROPERTIES' into 'romeproperties' — no leading token survives it. §3.3's
"strip non-alphanumerics … then take the leading token set" cannot be read both ways at once; the
build takes the reading that produces tokens, and P-3 is confirmed on a fixture with the ruled
cardinalities (ROME = 2 clients + 1 counterparty, ambiguous; BEE = 1, not ambiguous).

---

## Annex J · Cells the fold owes (additions and re-cuts to annexes-1 Annex B)

**New cells.**

- **58 · AB-1 positive** — a filing inserted through `_file_document_write` with a
  fourth-method resolution is **admitted** by `t_document_filings_stamp`.
- **59 · AB-1 twin** — the same insert with `method='agent'` still raises `CLR01` at the
  trigger.
- **60 · AB-2 census** — the `pg_proc.prosrc` predicate census returns exactly the seven bodies
  of Annex H; extend-never-weaken proven per body, both directions (13 assertions).
- **61 · AB-2 rider-3 approval** — a human approves a posted misattribution whose destination
  client carries only a judged resolution; `approve_wrong_client_correction` completes.
  Inverted twin: before α2, the same call raises `CLR01` at `0027:270`.
- **62 · AB-3 provenance** — every CoR'd body's pre-image `prosrc` sha matches the rig-replay
  capture taken at the start of the window (the pre-quiesce sha tripwire).
- **63 · AB-3 lock order** — a two-session race per new `document_filings` acquirer
  (`_file_document_write`, `_agent_file_document_core`, `wake_reattribute_document`): no 40P01,
  `documents` taken first, proven by `pg_locks` ordering.
- **64 · AB-4 enqueue hold** — classify on a filed document without the client's
  `document_processing` activation: **no task row is enqueued in that client's name**, a
  terminal never-claimed failed receipt exists, no model call is made. Twin: with the
  activation, the task enqueues.
- **65 · AB-4 non-regression** — `claim_document_processing_task`'s `prosrc` still carries
  **zero** references to `client_egress_purpose*` / `prepare_egress_dispatch` /
  `consume_egress_dispatch` (`wb-0020-legacy.test.mjs:630-639` stays green).
- **66 · AB-5 kind vocabulary** — `identity_document` present on all four surfaces
  (`documents_document_kind_check`, `classify_document`'s in-body list,
  `set_document_kind`'s in-body list, `CLASSIFY_KINDS`) and **absent** from
  `DB_REFUSED_KINDS`; `classify-unit.test.mjs:151-165`'s disjointness invariant green.
- **67 · AB-5 settle** — `classify_document` settles a task at `identity_document` without a
  refusal loop; `documents.document_kind` holds the value; B8 reads it and refuses the filing.
- **68 · AM-7 source discipline** — an `invoice_facts` extraction carrying a supplier TIN in a
  `tin`-shaped `field_path` does **NOT** trigger `attribution_contradicted`.
- **69 · AM-7 sentinels** — a MyInvois sentinel TIN (`ei00000000010` / `…020` / `…030`) does
  **NOT** trigger `attribution_contradicted`.
- **70 · AM-6 read authority** — a `filing` credential calls `get_document_extract` on an
  unattributed document and succeeds; the inverted twin removes the allowlist row and proves
  `CLR03`.
- **71 · AM-1 postcheck** — F-A7's own new postcheck block (the `prosrc` marker + the two
  functional probes + the census) fails on a deliberately re-woven body and passes on the
  shipped one. *This is the cell 30a wanted to be; unlike 30a it is forceable, because the
  block is F-A7's own and re-runnable.*

**Re-cut cells.**

- **cell 29** — "all twelve callers" becomes **three live caller bodies derived by rig replay**
  (`_draft_entry_core`, `finalize_document_intake`, `_draft_opening_item_core`); the cell fails
  if the replay returns two (the splice did not apply) or four (an unaccounted caller).
- **cells 30a / 30b** — re-pointed from `0018`'s one-shot tail block to F-A7's own postcheck
  block (cell 71). 0018's assertions are recorded as **apply-position history**, not as a live
  gate.
- **cell 31** — moves from "claim holds" to "enqueue refuses" per cell 64.
- **cell 40** — compares the `filing` kind's allowlist rows against **Annex A's written list**,
  not against "its intended rows"; negative twin proves nothing else is reachable.
- **cell 10 / P-3** — the ROME fixture is two clients (ROME PROPERTIES, ROME SECRETARY) plus
  one **counterparty** (ROME PUBLIC ADVISORY) of one firm; the predicate spans
  `clients` ∪ `counterparties` and returns ≥2 for the family, 1 for BEE.
- **cell 44** — annotated **PENDING OWNER** (gate-record §5 item 2): as written it proves the
  fully human-gated path, which is the fail-closed default, not necessarily the ruled one.

---

## Annex K · F-A7b — the interview model layer (the re-scoped item's seed spec)

> Moved here verbatim from design v1 §4 by the gate's width ruling. **F-A7b is its own item**
> (window **D1-δ**); this annex is the seed for its design doc, not a part of F-A7a's train. The
> cells that prove it are annexes-1 §B.8 (47-54).

### K.1 The normalizer in front of the skeleton

The segment schema stays the validation skeleton (`interview.v2.questions.ts` +
`interview.v1.core.ts`'s validators). A **model normalizer** sits in front: the human hands Clara
anything — an SSM certificate, a WhatsApp message, one sentence — and the normalizer proposes
`{segment_key, value, echo, citations[]}` per segment it can fill. **Every proposal then walks the
existing driver**: `validate` (the same validator, unchanged) → `echo` → `confirm` → persist. A
proposal that fails its validator is **not persisted and not echoed** — it re-asks with the reason,
which is P19 unchanged (`interview.v1.core.ts:261-265`).

**The workflow ships as `clientOnboarding_v4`** — a new frozen `_vN` export plus a registry
repoint, never an edit (constraint 9; `clientOnboarding.v3.ts:1-7`). v3's arm-before-announce
ordering is carried byte-identical; **the v4 diff is the normalizer call and the receipt step**.

### K.2 Echo-confirm in batch, five fields per-field (TA-P4 A)

- **New relation `clara.onboarding_answer_proposals`** — `(plan_id, item_key)` unique, `value jsonb`,
  `echo text`, `citations jsonb`, `model`, `model_version`, `rationale`, `state in
  ('proposed','adopted','amended','rejected','superseded')`. Written by
  `wake_propose_onboarding_answers`; **never** by the human lane.
- **New human verb `clara.confirm_onboarding_answers(p_plan, p_expected_revision, p_confirmations,
  p_op_key)`** — bookkeeper+. `p_confirmations` is an array of `{item_key, decision, value?}`.
  It refuses with `onboarding_per_field_required` unless **each of the five hot fields**
  (`legal_name`, `entity_type`, `fy_end`, `opening_stance`, `coa_seed`) carries its **own**
  confirmation entry; the rest may be confirmed as one batch. In ONE transaction it marks the
  proposals adopted/amended and calls the extracted `_update_onboarding_plan_core` with
  `p_answered_by = the confirming human` — so `contributors` accumulates a real member and Gate O
  is untouched (survey finding 6).
- **`adopted_verbatim`** is computed by the DB (`value` unchanged vs the proposal), never asserted
  by the caller — TA-P4's "author = Clara, adopted verbatim" recorded as a fact, not a claim.
- **The body-move**: `update_onboarding_plan` (`0017:2632-2705`) keeps its signature, its floor and
  its ACL, and becomes a thin delegate over `_update_onboarding_plan_core` carrying today's body.
  One item-write semantic, two lawful entrances (TA-P11). Costed in §I.2 as **D1-δ**.

### K.3 The three v3 residuals, closed here

1. **`readClearsError` never checks `runId`** — one line in the dashboard hook
   (`apps/dashboard/app/onboarding/useInterviewRun.ts`); unreachable today, closed anyway.
2. **The concurrent-submitter receipt gap — the runtime-contract fix.** Today "a higher park index
   ⇒ my answer landed" is an **inference**. The fix is a **server-authored per-(run, park,
   submission) receipt**: the answer route returns `{run_id, park_index, submission_id, accepted}`
   minted server-side, and `GET /state` exposes the accepted submission id per park, so a second
   submitter learns *"yours was not the one that landed"* from a receipt rather than from an index.
   This is a **runtime route + workflow contract change** and it is why v4 exists.
3. **The interview e2e de-pin** — its own text calls it a dated tripwire stale at the next core
   bump. F-A7b **is** that bump: the pin is re-cut against v4 and re-stated as a **monotonic
   direction**, never a ceremony state (the dated-tripwire lesson).

### K.4 Clara opens a client file — the honest label (TA-P1 C)

`clara.wake_begin_client_onboarding(p_name, p_rationale, p_model, p_op_key)` — a wake sibling of
`begin_client_onboarding` (`0017:2492-2524`) calling the same insert sequence through an extracted
ungranted core, so there is one client-birth semantic. **The honesty, and it is not decoration:**

- `onboarding_plans` gains `opened_by_agent boolean not null default false` + `opener_model text`
  (ADD COLUMN — no body CoR), set only by the wake core.
- **The client row is permanent.** There is no delete verb anywhere in the schema (law 6). The
  dashboard label says so in the owner's own register: *"Clara opened this client file. A client
  record can never be deleted — if it is wrong, cancel the onboarding and the client is archived."*
  The disposal path already exists: `cancel_client_onboarding` (`0017:2843-2880`) archives it.
- **Gate O still needs a human contributor**, so a Clara-opened file cannot be activated without a
  human having confirmed at least one answer. The irreversible act is therefore the *row*, not the
  *client* — and the label says which.
- **The duplicate hazard is mechanical, not judgemental**: `uq_clients_firm_name` (`0003:41`)
  already refuses a same-name client, and the wake core additionally refuses when the name's
  **family predicate** (design §3.3, now over `clients` ∪ `counterparties`) hits an existing party
  — `client_open_family_collision`, a firm question instead of a second ROME.
