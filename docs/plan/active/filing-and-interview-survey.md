# F-A7 — the filing verb (F-A7a) + the interview model layer (F-A7b): estate survey

> **Estate survey of record for Wave-F Track-A item F-A7** (`docs/plan/active/wave-f-contract.md`
> §F-A7, lines 108-117). Companion to `filing-and-interview-design.md` (**design v2 — the doc of
> record; it GOVERNS on any disagreement with this file**) and `filing-and-interview-annexes-1.md`
> / `-2.md`. **v1.2, 2026-08-22 — reconciled to design v2 after the PR-0 gate**
> (record: `filing-and-interview-gate-record.md`) against `main` at **cfa0710**, frontier **0102**.
>
> **Method, copied from the F-A2 discipline.** Every claim below is a byte read, cited
> `file:line`; **line numbers come from the instrument that prints them** (`grep -n` / `sed -n`
> over the working tree at cfa0710). A body's LIVE tip is the last `create or replace` in its
> lineage, never the migration that created it — where the two differ this survey names both.
> **Absence is not evidence** (review law 2): every "does not exist" below is a positive read of
> the closed world that would have to contain it. Anything the survey could not settle from the
> bytes is carried into the design as a **PREDICTION the PR-1 rig replay must confirm**, never as
> an assertion.
>
> **Binding rulings:** TA-P1 C · TA-P3 A · TA-P4 A · TA-P6 A · TA-P7 C · TA-P8 B · TA-P11 A ·
> TA-P13 A · TA-P14 A (owner sitting, 2026-08-22). **TA-P7 C and TA-P1 C are constitutional
> amendments PENDING the owner's digest sign-off** — this survey records the estate as-found
> under the CURRENT law and marks every place the amendment moves it.

## 0 · Citation audit — v1.1, and the gate's corrections TO it (v1.2)

### 0.0 · v1.2: what the PR-0 gate found wrong in v1.1's own audit

**The audit's method law was right and its execution violated it.** v1.1 states *"a body's LIVE tip
is the last `create or replace` in its lineage"* — and then certifies four stale cites as
"Verified EXACT" in the list below (`0007:1367`, `0007:1434`, `0009:2590-2611`,
`0016:3175`/`:3202-3207`). That is a false positive inside the document's own quality gate, and it
is the reason design v2 authors every CoR from a **rig replay**, not from lineage reading.

- **Eight bodies were cited to superseded text; four are additionally spliced by `0038` at APPLY
  TIME and exist in no file.** The full live-tip register is **`filing-and-interview-annexes-2.md`
  §G** and governs over every body cite in §2 below: `file_document` **`0009:2291`** ·
  `retire_document_filing` **`0027:393`** (spliced `0038:7604`) · `confirm_attribution_candidate`
  **`0027:121`** · `approve_wrong_client_correction` **`0027:196`** (spliced `0038:7495`) ·
  `record_rule_resolution` **`0015:405-475`** · `classify_document` **`0026:1262`** (spliced
  `0038:7816`) · `set_document_kind` **`0026:1439`** (spliced `0038:7766`) ·
  `persist_document_extraction` **`0026:497`** · `list_unassigned_documents` **`0011:3943`**.
- **Migration `0027_filings_lock_order.sql` was cited ZERO times** in all three F-A7 documents. It
  carries the estate's **documents-before-`document_filings` lock-order law** and enumerates the
  **six live `document_filings` writers** from the live catalog (`0027:1-40`). Both are now
  binding — see §2.3 and design §5.
- **C1's "twelve callers" is THREE live bodies.** The eleven grep hits are successive CoRs of
  `_draft_entry_core`, `finalize_document_intake` and `_draft_opening_item_core`; `pg_proc` holds
  one row per function, so the count `pg_proc` returns is three, and v1.1 double-counted
  `0017:3208` (pre-splice) with `0018:252-271` (post-splice) as two live callers.
- **C3 read `0018`'s tail block backwards.** `0018:487-809` is **one `do $tail$` block executed
  once at 0018's apply position** against the body 0018 itself creates — it cannot observe a CoR
  authored in a later migration. Rows 3a/3b are restated in §7 accordingly. The same correction
  applies to row 12's `0038`/`0040` tails.
- **C2 stands.** An attack on the "29 call sites" number was REFUTED at the bytes (the recount
  treated non-invocation matches as calls). Row 5a's *derive by census, never from a list* still
  governs at PR time.
- **The two-value world is SEVEN live bodies, not one** — a fact no caller census can see.
  `filing-and-interview-annexes-2.md` §H is the register.

### 0.1 · The v1.1 audit as issued (retained; read it through §0.0)

Every `file:line` in this survey was **re-derived** at cfa0710 by the instrument that prints them
(`grep -n`, and `sed -n 'X,Yp' | nl -ba -v X` for ranges). The audit is recorded rather than
silently applied, because the drift it found is itself a finding about method.

**Five substantive corrections** (each changed a claim, not only a number):

- **C1 · The caller census was right in total and wrong in composition.** `0018:225` was listed as
  an `assert_client_resolved` call site; it is a `clara._active_document_filing(...)` call. The
  eleven **in-body** call sites are `0004:147` · `0005:998` · `0007:1215` · `0007:2043` ·
  `0009:1252` · `0011:350` · `0015:1855` · `0015:3493` · `0016:4019` · `0017:3208` · `0026:312`.
  The **twelfth is generated at apply time**: `0018:252-271` splices the assert into
  `_draft_opening_item_core` by `pg_get_functiondef` string replacement, so it is invisible to a
  grep over the migrations. Twelve is the right number for the wrong reason — and the invisible
  one is the one a census run with the wrong instrument would miss (§2.1).
- **C2 · `clara._active_document_filing` has 29 call sites across `0007`-`0030`**, not 18 across
  `0007`-`0018`. `0029` and `0030` (the vendor-binding executor and its LCP successor) were
  outside the range the original count swept (§2.3).
- **C3 · Two live apply-time assertions on the recut predicate were unlisted.** `0018:553-568`
  pins the **whitespace-stripped `prosrc`** of `assert_client_resolved` and raises unless it still
  contains the literal `r.bound_scope_kindisnull`; `0018:751-767` is a **functional probe pair**
  asserting the generic assert ACCEPTS an unbound `method='human'` resolution and REJECTS a bound
  one. Both re-run on every fresh rig apply, both bear directly on TA-P7 C's recut, and neither was
  in the §7 break list. They are now rows 3a and 3b (§7).
- **C4 · `record_rule_resolution`'s successful-hit insert is at `0007:2333-2335`**, not
  `:2337-2340` — the cited lines are the `on conflict` clause, not the `method='rule'` /
  `confidence=1.0` / `evidence` values the claim rests on (§2.2).
- **C5 · `client_facts` and `client_fact_keys` had their line ranges swapped.**
  `client_fact_keys` is `0055:347-368`; `client_facts` is `0055:386-440` (§5.1).

**Line drifts corrected in place** (0-4 lines, no claim changed): `client_resolutions.method`
`0003:92`→**`:90`**, `confidence` `:91`→**`:89`**, `subject_kind` `:89`→**`:87`** ·
`ck_document_filings_resolution` `0007:81-83`→**`:85-87`** · `uq_document_filing_active`
`:92-93`→**`:93-94`** · `attribution_candidates.rule_kind` `0007:277`→**`:278`** ·
`record_rule_resolution` `0007:2295`→**`:2296`** · `confirm_attribution_candidate`
`0007:2356`→**`:2354`** · `open_questions.client_id` `0011:800`→**`:799`** and `scope_kind`
`:799`→**`:800`** · 0017's O6 note `:663-665`→**`:661-663`** and the origin CHECK
`:666-669`→**`:667-669`** · `resolve_onboarding_plan_item` `0017:2707`→**`:2706`** · the CLR06
plan-CAS `:2657-2661`→**`:2655-2660`** · `wake_record_client_resolution`'s `'agent'` literal
`0004:638`→**`:638-639`** · `assert_client_resolved_bound` `0018:75-88`→**`:75-87`** ·
`clientOnboarding.v3.ts` arm-before-announce `:80-87`→**`:81-88`** and the plan/run binding
`:96-116`→**`:91-97`** · `askAndConfirmSegment` `:248-274`→**`:248-275`** and its no-persist arm
`:262-266`→**`:261-265`** · `InterviewAttachments.tsx:17-25`→**`:16-24`** · the `event_types`
registration idiom `0090:640-659`→**`:635-657`** (design §3.3) · the op-key discipline
`0078:150-152`→**`:152-155`** (annex A).

**Verified EXACT and left alone** (the majority, spot-listed because a "corrected" list with no
"confirmed" list is not evidence). **⚠ v1.2: FOUR entries in this list are FALSE POSITIVES** —
`0007:1367`, `0007:1434`, `0009:2590-2611` and `0016:3175`/`:3202-3207` are line-exact but name
**superseded bodies**; the audit checked the line, not the lineage. Read the list through §0.0 and
`filing-and-interview-annexes-2.md` §G. `0018:57-68` and the eight-word predicate at `:60-64` ·
`0004:91-101` · `0003:41` · `0007:71-72`, `:104`, `:223`, `:239`, `:310`, `:1367`, `:1392`,
`:1405-1410`, `:1434`, `:1508`, `:1515-1519`, `:1538`, `:2247`, `:2251`, `:2438`, `:2481`,
`:2761-2772` · `0009:2421`, `:2444`, `:2590-2611`, `:2613-2615` · `0011:816-817`, `:823-829`,
`:910`, `:1156`, `:1163-1165`, `:1178-1186`, `:1920-1930`, `:4169-4176` · `0016:3175`,
`:3202-3207` · `0017:995`, `:1041`, `:1066`, `:2492`, `:2529`, `:2632`, `:2661-2667`, `:2751`,
`:2843` · `0020:149`, `:194` · `0038:5437` · `0055:370-382`, `:499` · `0090:328`, `:346`, `:355`,
`:744`, `:758`, `:806`, `:818`, `:878`, `:890`, `:940`, `:952`, `:1007`, `:1015-1017`, `:1558`,
`:1582` · `0094:53-77`, `:66-69`, `:90` · `classify-llm.mjs:14`, `:106`, `:143` ·
`classify.mjs:40` · `matcher.mjs:8-10` · `pools.mjs:304-312`, `:326-334` ·
`chatTurn.v10.tools.ts:400-407` · `chatTurn.v12.tools.ts:16` · `chatTurn.v10.infra.ts:32-33` ·
`CorrectionWizard.tsx:5` (`apps/dashboard/app/documents/`) · `PROGRESS.md:331-336`.

---

## 1 · The seven findings that bind the design

1. **RESTATED v1.2. The two-value attribution world is re-derived in SEVEN live bodies, and the
   assert that carries it is called by THREE — one of them invisible to grep.**
   `clara.assert_client_resolved` accepts `method in ('human','rule')` at `confidence >= 0.95` and
   nothing else (live tip `0018:57-68`, predicate at `:60-64`; born `0004:91-101`). Its **live
   caller set is three bodies** — `_draft_entry_core` (`0016:3970`), `finalize_document_intake`
   (`0026:234`) and `_draft_opening_item_core` (`0017:3162`), the last reachable only because
   `0018:252-271` splices the call in at apply time by `pg_get_functiondef` string replacement.
   The eleven grep hits v1.1 listed are successive CoRs of those three; `pg_proc` holds one row per
   function. *Measure with the instrument production uses* — the discipline was right, the number
   was not. **The real blast radius is the SEVEN inline re-derivations** (annexes-2 §H), including
   a BEFORE INSERT trigger on `document_filings` (`0007:429`) that no caller census can see.
   **TA-P7 C's new arm lands inside a body every posting path traverses** — the most expensive
   recut in this item (§2.1, §7; design §5 train α2).
2. **`method='agent'` is already representable and already REFUSED — and a live rig cell proves
   it.** `client_resolutions.method` admits `'agent'` (`0003:90`) and
   `wake_record_client_resolution` hard-stamps it (`0004:638-639`), but the assert excludes it;
   `rig-invariants.test.mjs:168-172` asserts the refusal in words (*"agent-method resolution
   rejected"*). **The design must NOT admit `'agent'`** — a distinct fourth value keeps that cell
   green and leaves the ungated agent-proposal lane ungated (§2.1; design D-3).
3. **`classify` ships client OCR text to OpenAI today with no consent of any kind, and the estate
   states in writing that it does not.** `classify-llm.mjs:14` imports `@ai-sdk/openai`; `:143`
   calls `generateObject` with the document's OCR layout text; the DB's live claim body classifies
   the lane as local — *"Local lanes (structured_parse, local_facts, classify, statement_parse)
   never hold"* (`0090:346`; the egressing list at `:355`) — and the worker's own header repeats
   it: *"a local, no-egress LLM read"* (`classify.mjs:12-14`). **F-A7-M1 confirmed at the bytes**,
   and TA-P3 A puts it on F-A7's critical path (§3.2).
4. **CORRECTED v1.2. The agent can ALREADY read an unattributed document and needs no new EXECUTE
   grant — but a NEW WAKE KIND needs an allowlist ROW.** `get_document_extract` (live tip
   `0090:1558`) admits a document with **no active filing** (`0090:1592-1596`) and pins `p_client`
   only when the credential carries one (`0090:1582`). **But `0090:1579-1580` calls
   `assert_wake_allowed(w.wake_kind,'get_document_extract')` for every kind outside
   `('interactive','proactive')`**, and `assert_wake_allowed` raises `CLR03` on a missing row
   (`0004:114-121`) — which is why `autodraft` needed its own row (`0011:3905`). v1.1's *"the
   pre-attribution READ needs no new grant"* was true of grants and false of the roster. The
   `filing` kind's seven allowlist rows are written out in annexes-1 §A.3. The pre-attribution
   EGRESS still needs a purpose that structurally cannot exist today (§3.1, §3.3).
5. **`wake_open_question` cannot carry an unattributed document, in three independent ways.**
   `open_questions.client_id` is `not null` with a composite FK (`0011:800`, `:816-817`);
   `_open_question_core` requires an **active filing** for a `document`-scope question
   (`0011:1920-1930`); and `wake_open_question` refuses unless `w.wake_kind='autodraft'` **and**
   `w.client_id = p_client` (`0011:1991-1995`). **TA-P7 rider 4's firm-scoped carrier is a new
   object, not a widening** (§4).
6. **The onboarding estate already fails closed against an all-agent interview — and that is the
   feature, not the bug.** Gate O refuses a commit when `cardinality(contributors)=0`
   (`0017:2786-2790`), and `update_onboarding_plan` refuses any `p_answered_by` that is not an
   **active bookkeeper+ member** (`0017:2661-2667`); the agent user is `is_agent=true`
   (`0002:549-551`) and holds no membership. An interview Clara answers alone can therefore never
   be committed. **TA-P4 A's human echo-confirm is exactly what supplies the contributor** — the
   confirming human is `answered_by`, and Clara's authorship is an annotation beside it (§5.1).
7. **Four estate objects are spelled `rule` and none of them is the rules machine F-A10 retires.**
   `client_resolutions.method='rule'` (`0003:92`), `document_filings.basis='rule'` (`0007:71-72`),
   `attribution_candidates.rule_kind` (`0007:277`), and `record_rule_resolution` /
   `matcher_version='rule-v1'` / `uq_resolution_document_rule_live` (`0007:2247-2249`, `:2295-2356`).
   All four are **hard-identifier matchers**. F-A10's retirement census must name them as
   NON-members (§2.2) — spelling is not identity (review law 3).

---

## 2 · The attribution estate at the bytes

### 2.1 The wall itself

| object | bytes | shape as-found |
|---|---|---|
| `clara.client_resolutions` | `0003:83-95` | `method text not null check (method in ('human','rule','agent'))` (`:90`) · `confidence numeric(4,3)` 0..1 (`:89`) · `subject_kind in ('document','chat_task','manual')` (`:87`) · `superseded_at` (`:92`) · `resolved_by` FK users (`:93`) |
| `clara.assert_client_resolved(uuid,uuid,uuid)` | live tip `0018:57-68`; born `0004:91-101` | `method in ('human','rule') and confidence >= 0.95 and superseded_at is null` **and** `bound_scope_kind is null`; with a document, `subject_kind='document' and subject_id=p_document`. Predicate `:60-64`. Raises `CLR01`. SECURITY DEFINER, ungranted |
| `clara.assert_client_resolved_bound(uuid,uuid,text,uuid)` | `0018:75-87` | the same predicate + a binding equality + `for share` (`:82-83`). The opening-seed lane's confinement |
| the live callers — **THREE bodies** (v1.2) | `_draft_entry_core` **`0016:3970`** (call `:4019`) · `finalize_document_intake` **`0026:234`** (call `:312`) · `_draft_opening_item_core` **`0017:3162`** (splice-reached) | the eleven grep hits (`0004:147` · `0005:998` · `0007:1215`, `:2043` · `0009:1252` · `0011:350` · `0015:1855`, `:3493` · `0016:4019` · `0017:3208` · `0026:312`) are successive CoRs of these three; older overloads are explicitly DROPped at `0005:955` / `0009:1200`. **`pg_proc` can only ever return three** |
| the third caller's call site, **generated** | `0018:252-271` | a `do $cor$` block reads `pg_get_functiondef('clara._draft_opening_item_core(...)')`, asserts the literal anchor matches **exactly once** (`:260-263`), replaces it with the keyed-lane switch (`:264-265`), aborts on a no-op (`:266-268`), and `execute`s the result. **Greppable nowhere; live in `pg_proc` after apply** — a replay returning two means the splice did not apply |
| the **seven** live re-derivations of the predicate (v1.2) | annexes-2 §H | `assert_client_resolved` `0018:62` · `assert_client_resolved_bound` `0018:81` · `file_document` `0009:2319`,`:2324` · `_tf_stamp_document_pipeline` `0007:429` · `_seed_verified_document` `0007:1592` · `propose_wrong_client_correction` `0007:2496` · `approve_wrong_client_correction` `0027:268`. **A caller census sees none of them** |
| the prosrc body marker and the functional probes | `0018:553-568`, `0018:751-767` | **v1.2: BOTH live inside `0018:487-809`, ONE `do $tail$` block executed once at 0018's apply position** against the body 0018 itself creates at `:57-68`. They are applied history and **cannot observe a CoR authored in a later migration** — see §7 rows 3a/3b. Their content is re-authored as F-A7's OWN re-runnable postcheck block in train α2 |
| the human mint | `clara.record_client_resolution` `0004:490-498` | bookkeeper+; **stamps `'human'` regardless of `p_method`** |
| the wake mint | `clara.wake_record_client_resolution` `0004:630-641` | **stamps `'agent'`**; allowlisted for `interactive` only (`0002:555`). Its output can never satisfy the assert — by design |
| the categorical precedent | `clara.record_opening_keyed_resolution` `0018:94-…` | a human confirmation pins `confidence` at **1.0** and takes **no caller confidence**. The shape the design copies for a judged attribution |

**What the amendment moves.** PRD §6.2(a) · ARCHITECTURE §0 · AGENTS.md constraint 2 · digest
law 2 (`docs/adr/README.md:163-168`) all carry the same sentence. Its DB half is the eight-word
predicate at `0018:60-64`. **One body, one CHECK, four texts.**

### 2.2 The matchers, and the four things called `rule`

- **`record_rule_resolution(uuid,text)`** — **LIVE TIP `0015:405-475`** (v1.2; `0007:2296-2352` is
  superseded and v1.1's C4 "correction" re-derived lines inside the dead body). A **server-side**
  hard-identifier predicate joining `document_regions` to `client_identifiers` on
  `value_normalized`, with a `field_path` LIKE filter per kind; **`v_n<>1` abstains**; a unique hit
  inserts `method='rule'`, `confidence=1.0`, `evidence={"matcher":"rule-v1"}`. **Two live guards
  the 0007 text does not have, and B1 must inherit both** (design §3.2): the **AB-3 source
  discipline** — *"attribution may consume only identity-bearing OCR/structured snapshots.
  invoice_facts deliberately carries colliding field_path names and is not an attribution
  source"* — enforced by `and e.engine_kind in ('ocr','structured_parse')` (`0015:417-428`), and
  the **MyInvois sentinel-TIN exclusion** `('ei00000000010','ei00000000020','ei00000000030')`
  (`0015:433-442`). Granted to the **`clara_runtime_login` LOGIN shell directly, not the group**
  (`matcher.mjs:14-21`).
- **`record_attribution_attempt(...)`** `0007:2251-2293` — the advisory lane; writes
  `attribution_attempts` + `attribution_candidates` (`rule_kind in ('name_exact','alias_exact')`,
  `0007:278`; table at `:272`) + `attribution_candidate_regions`. Granted to `clara_runtime`
  (`0007:2798`).
- **`confirm_attribution_candidate(uuid,text,boolean)`** — **LIVE TIP `0027:121-190`** (v1.2; CoR'd
  at `0009:2365` and again by 0027's lock-order fix) — the human act: mints a `method='human'`
  resolution at `confidence=1.0` and, with `p_file_document`, files in the same transaction.
  Granted to `clara_authenticated` (`0007:2766`).
- **The consumer**: `matcher.mjs:8-10` — *"Never mints a wake intent, holds a task, runs an LLM, or
  files a document (S5-D2: assignment stays a human act, even for a lane-1 rule hit)."* **That
  sentence is the posture F-A7a overturns**; it is a comment on a live consumer and must be
  rewritten with the lane, not left to rot.

**F-A10 census non-members** (finding 7): the four `rule`-spelled objects above are identifier
matchers. The machine F-A10 retires is `coding_rules` / `rule_sightings` /
`propose|sign_coding_rule` / `propose|sign_autopost_rule` / `execute_rule_post` — a disjoint set.

### 2.3 Filing, retirement, correction

| object | bytes | notes |
|---|---|---|
| `clara.document_filings` | `0007:63-92` | `basis text not null check (basis in ('legacy-0007','human','rule','correction','seed-0007'))` (`:71-72`) · `resolution_id` required unless `legacy-0007` (`:85-87`) · `revision_token` (`:77`) · partial unique `uq_document_filing_active (document_id, client_id) where retired_at is null` (`:93-94`) |
| `clara.file_document(uuid,uuid,text,text)` | **LIVE TIP `0009:2291-2363`** (v1.2; `0007:1367-1432` is superseded) | **bookkeeper+ human.** Re-derives the resolution or mints a `'human'` one at 1.0; refuses a second active filing to the same client; recomputes retention; emits `client.resolved` + `document.filed`. **It re-derives the two-value predicate INLINE at `:2319`/`:2324` and raises `CLR01` at `:2326`** — so the extracted `_file_document_write` carries it (annexes-2 §H row 4) |
| `clara.retire_document_filing(uuid,text,uuid,text)` | **LIVE TIP `0027:393-444`**, spliced `0038:7604-7625` (v1.2; `0007:1434-1466` is superseded) | bookkeeper+, revision-CAS (CLR17); **refuses while any live citation exists** — the blocker query is 0027's restructured form at **`:426-434`**, behind a `v_peek_doc` pre-lock (`:410-413`) that takes `documents` before the filings row. **Reusing 0007's text verbatim would re-open the 40P01 class 0027 closed** |
| `clara._active_document_filing(uuid,text,uuid,boolean)` | `0007:982-1006` | the provenance helper every posting floor calls — **29 call sites across `0007`-`0030`** (`0007`×3 · `0009`×2 · `0011`×4 · `0015`×2 · `0016`×2 · `0017`×5 · `0018`×1 · `0029`×2 · `0030`×1 …, re-derive by census, never from this list). *(A prior count of "18 across 0007-0018" swept too narrow a file range — `0029`/`0030`'s vendor-binding executors call it too.)* |
| the correction trio | `preview` `0007:2438` · `propose` live tip `0007:2481-2516` · `approve` **LIVE TIP `0027:196-…`**, spliced `0038:7495-7520` (v1.2; `0009:2421` is superseded) | `filing_corrections` (`0007:310-337`) carries `maker`/`checker`/`plan_hash`/`books_version`, with `maker uuid not null references clara.users(id)` and **no membership check** (`:317`) — the agent id is accepted. The approve refuses when `c.actor = x.maker` and ≥2 eligible checkers exist (**CLR19**, `0027:228-232`). **Both propose (`0007:2496`) and approve (`0027:268`) re-derive the two-value predicate and raise `CLR01`** — rider 3's posted arm does not work until train α2 extends them |
| **the lock-order law (v1.2, `0027:1-40`)** | `0027:26-40` | *"The full writer set was enumerated from the live catalog (`pg_proc` + `pg_get_functiondef ~* 'document_filings'`) … six functions actually write `document_filings`"* — `file_document`, `finalize_document_intake`, `_seed_verified_document` (already documents-first) and `confirm_attribution_candidate`, `approve_wrong_client_correction`, `retire_document_filing` (filings-first, fixed by 0027). **Every new acquirer takes `clara.documents` FOR UPDATE first**, or the reproduced 40P01 returns |
| the human floor | `0007:2761-2772` | `file_document`, `retire_document_filing`, the correction pair, `confirm|dismiss_attribution_candidate`, `add_client_identifier`, `add_client_alias`, `retire_client_alias` — `clara_authenticated` only |

**No agent-side filing verb exists.** Positive read: the 0007 grant block (`0007:2735-2800`) lists
every grant in the file; `clara_wake_*` appears there only in the two `revoke execute` lines
(`0007:2753-2757`). There is no `wake_file_document`, no `wake_retire_document_filing`.

### 2.4 Identifiers, aliases, and the ROME family

- `clara.client_identifiers` `0007:223-236` — `kind in ('tin','ssm','bank_account')`,
  `value_normalized`, **deliberately non-unique** (`:234-236`: *"sibling-client conflicts must be
  representable"*); lookup index `(firm_id, kind, value_normalized)`.
- `clara.client_aliases` `0007:239-254` — `alias_normalized`, retirable; index
  `(firm_id, alias_normalized) where retired_at is null`.
- `clara.add_client_identifier(uuid,text,text,text)` `0007:1508-1529` — bookkeeper+; normalizes by
  **strip-all-whitespace + lower**, the same expression the matcher predicate uses (`:1515-1519`).
- **The ROME collision is live on BELCORT's own books**: ROME PROPERTIES and ROME SECRETARY are two
  clients of one firm (AGENTS.md constraint 13), and ROME PUBLIC ADVISORY re-enters as a real
  counterparty after the Wave-G reset. Alias normalization is `lower(btrim(...))` and nothing more
  (`0007:1538`) — **no token or family analysis exists anywhere** (positive read of 0007's matcher
  predicate and of `matcher.mjs`'s `matchCandidates`).
- **The name-only wall**: `0062` pins ROME SECRETARY **by uuid**, fact-driven
  (`client_facts.customer_identity_policy='name_only'`), guarding **customer-kind counterparties of
  a flagged client** on INSERT and UPDATE (`0062:19-31`, `:51-58`); `0063` makes lifting it
  OWNER-only through the audited door. **Vendors, unflagged clients and the knowledge base are out
  of its scope** (`0062:29-31`, printed at apply by S4.7) — exactly the gap TA-P8 B closes by rule
  rather than by extending the wall.

---

## 3 · The egress estate

### 3.1 The typed-purpose family — the "how to add a purpose" idiom, measured

| object | bytes |
|---|---|
| legacy purpose-blind consent | `clara.client_egress_consents` `0011:910-934` |
| typed consent | `clara.client_egress_purpose_consents` `0020:149-176` — non-null purpose CHECK; evidence document MANDATORY; one live per `(client,purpose)` |
| activation (owner-only gate) | `clara.client_egress_purpose_activations` `0020:194-219` — composite FK `(consent_id,firm_id,client_id,purpose)` |
| dispatch authorization | `clara.egress_dispatch_authorizations` `0020:240-280` — a per-purpose `document_sha256` arm |
| purpose #2 | `0038:5437-5551` (`statement_extraction`) |
| purpose #3 | `0090:662-1100` (`witness_extraction`) — **the idiom to copy** |
| the four verbs | `grant` `0090:744` · `activate` `0090:806` · `deactivate` `0090:878` · `revoke` `0090:940`; each carries a **hardcoded in-body purpose allowlist** (`0090:758`, `:818`, `:890`, `:952`) |
| the dispatch mint | `clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)` `0090:1007-1059` — **requires a non-null `p_client`** (`:1015-1017` returns `unknown`); 120 s **wall-clock** TTL; **uniform `unknown` refusals, never a distinguishing raise** (0020 §3.3's non-oracle rule) |

**Adding one purpose costs, measured on 0090:** three CHECK recuts **by discovered name**
(`0090:665-707`), one `doc_sha` CHECK recut with the **name preserved** (`0090:710-735`), four verb
CoRs, one `prepare_egress_dispatch` CoR, and a postcheck block pinning **five `prosrc` sha256
values** plus an ACL-matrix comparison against a prestate capture (`0090:1064-1100`).

**A firm-scoped purpose is structurally impossible in this family.** Positive read: `client_id` is
`not null` on all three tables with composite FKs to `clara.clients` (**`0020:152`, `:197`,
`:249`** — v1.2; the previously cited `:151`/`:196`/`:246` are `firm_id` / the bare `create table`
line, i.e. the cites read as evidence for the opposite conclusion),
the one-live indexes key on `client_id` (`0020:175`, `:217`), and `prepare_egress_dispatch` returns
`unknown` for a null client (`0090:1015-1017`). **TA-P3 A's firm-level narrow purpose needs its own
relations.**

### 3.2 The live ungoverned egress (F-A7-M1, CONFIRMED)

- `classify.mjs:12-14` claims the lane is local and no-egress; `classify-llm.mjs:14` imports the
  OpenAI provider and `:143` sends up to 24 000 chars of the document's OCR layout text (`:106`)
  under `CLASSIFY_MODEL = CLARA_CHAT_MODEL || "gpt-5.6-terra"` (`classify.mjs:40`).
- The DB agrees with the comment, not with the code: the live claim body holds only
  `('ocr','invoice_facts','statement_facts','llm_witness')` (`0090:355`) and names classify local
  (`0090:346`). **No consent, no activation, no dispatch authorization and no citation row is
  written on this path** — positive read of `classify.mjs` (no `prepare_egress_dispatch` call
  anywhere in the file) and of the settle verb `clara.classify_document` (`0016:3175-3270`).
- **Blast radius**: every document that reaches the classify lane, for every client, filed or
  unassigned, including a client who has signed nothing.

### 3.3 The pre-attribution read surface

`clara.get_document_extract(uuid,uuid,int)` — live tip `0090:1558-1700+`, **SECURITY DEFINER** (it
was `security invoker` at birth, `0009:2613-2615`; the definer conversion is 0090's). Agent-lane
behaviour: the wake-secret GUC's presence selects the agent branch (`0090:1573-1583`); a credential
with a client pin restricts to that client (`:1582`); **a credential with no client pin reads any
document in the firm, including an unfiled one** (`:1592-1596`). Witness envelopes are starved to
`''` (`:1616-1621`); regions are not.

`clara.list_unassigned_documents(int)` — **LIVE TIP `0011:3943`** (v1.2; `0009:2590-2611` is
superseded and the live body adds an agent-lane consent gate keyed on
`current_role='clara_agent_ro'`) — anti-joins active filings. The chat toolface exposes it
(`chatTurn.v10.tools.ts:400-407`, carried forward by v11/v12 by import —
`chatTurn.v12.tools.ts:16`). **The chat lane can already SEE the unassigned pile and cannot act on
it** — the parity gap F-A7a closes, in **train ε** after F-A2 PR-2 lands `chatTurn_v13`.

---

## 4 · The question carriers

| object | bytes | why it cannot carry an unattributed document |
|---|---|---|
| `clara.open_questions` | `0011:796-835` | `client_id uuid not null` (`:799`) + composite FK (`:816-817`); `scope_kind in ('document','vendor','client')` (`:800`); `ck_open_questions_scope` forces `scope_id = document_id` and a non-null document for document scope (`:823-829`); the table's OWN `origin` CHECK holds only five values (`:804-805`) — the seven-value world is 0016/0017's successor CHECK |
| `clara._open_question_core` | `0011:1902-1959` | document scope **requires an active filing** and locks it `for update` (`:1920-1930`) |
| `clara.wake_open_question` | `0011:1984-2006` | refuses unless `wake_kind='autodraft'` **and** the credential's `client_id` equals `p_client` (`:1991-1995`). F-A2 PR-1 re-keys this onto the client pin rather than the kind name (`f-a2-annexes-2-mechanics.md:297-299`) |
| the `origin` closed world | `0011:804-805` → `0016:203-205` → `0017:667-669` | `('clarify_promotion','rule_proposal','rule_conflict','sweep_refusal','manual','classification','onboarding')` at the live tip. **`'onboarding'` is RESERVED with no writer** — 0017's own note: *"O6: onboarding is reserved in the origin vocabulary. No 0017 writer emits it"* (`0017:661-663`). F-A7b may claim it without a CHECK recut |
| the human resolvers | `resolve_open_question` `0011:2007` · `dismiss_open_question` `0011:2044` · `get_open_question` `0011:3596` | bookkeeper+ |

---

## 5 · The onboarding / interview estate

### 5.1 DB

| object | bytes | notes |
|---|---|---|
| `clara.onboarding_plans` | `0017:995-1039` | `scope_kind in ('firm','client')` · `contributors uuid[]` · `review_maker` · one open plan per `(firm,client)` (`:1039-1040`) |
| `clara.onboarding_plan_items` | `0017:1041-1064` | `item_kind in ('must_ask','capture','todo')` · `state in ('pending','answered','resolved','deferred')` · `answered_by` FK users · unique `(plan_id,item_key)` |
| `clara.onboarding_plan_revisions` | `0017:1066-1073` | a full snapshot per revision |
| `clara.begin_client_onboarding(text,text)` | `0017:2492-2524` | **admin+**; mints the client at `status='onboarding'` and the plan in one txn; the opener seeds `contributors` |
| `clara.create_client(text,text)` | live tip `0017:2529-2562`; born `0004:343-360` | compatibility CoR — *"There is no granted client-minting surface whose post-image is active or lacks a plan"* (`0017:2527-2528`) |
| `clara.update_onboarding_plan(uuid,uuid,jsonb,uuid,text)` | `0017:2632-2705` | **the single item writer.** Revision CAS → `CLR06 stale_plan` (`:2655-2660`); `p_answered_by` must be an **active bookkeeper+ member** → `CLR04` (`:2661-2667`); upserts items (`:2668-…`); accumulates `contributors` (`:2694-2696`); snapshots |
| `clara.resolve_onboarding_plan_item` | `0017:2706-…` | bookkeeper+ |
| `clara.commit_client_onboarding` (Gate O) | `0017:2751-2840` | **admin+**; `cardinality(contributors)=0` → `CLR05 checker_required` (`:2786-2790`); committer ∈ contributors → `distinct_checker` or solo `self_attestation` (`:2791-2802`); required items answered; an opening position required; then `clients.status='active'` |
| `clara.cancel_client_onboarding` | `0017:2843-2880` | archives the client (`:2865`) — **the disposal door for an abandoned file already exists** |
| `clara.client_fact_keys` / `client_facts` | `0055:347-368` / `0055:386-440` | *(the two ranges were swapped in v1 — `client_fact_keys` is the earlier table.)* `basis_kind in ('owner_instruction','document','registry_lookup','interview_carryover')` (`:395-396`); supersede-never-update; keys seeded `entity_type`, `msic` (`0055:370-382`) + `customer_identity_policy` (0062) |
| `clara.record_client_fact(...)` | `0055:499-…` | **admin+ human; no wake sibling exists** (positive read of 0055's grant block) |
| `clara.clients.status` | `0003:38` → `0017:658-659` | `('active','archived','onboarding')`; no delete verb anywhere (law 6 / PRD §6.8) — **the honesty problem TA-P1 C's client-file opening creates** |

### 5.2 Runtime

- **The park contract**: `clientOnboarding_v3` (`clientOnboarding.v3.ts`, `@frozen` line 1) — arms
  `createHook` **before** `streamPromptStep` (`:81-88`, and its own comment says *"Swapping these
  two lines is the whole of v3. Do not reorder them."* at `:85`); binds the plan to the run with a
  first `interview_run` capture item and self-terminates if another run already owns the plan
  (`:91-97`); one CAS write per confirmed answer with an F6 re-echo on conflict (`:122-148`); a
  monotonic `park.n` (`:78-80`) supplies the hook token.
- **P19 at the bytes**: `askAndConfirmSegment` (`interview.v1.core.ts:248-275`) — ask → validate
  (**no persist on refusal**, `:261-265`) → echo → confirm → return; the caller persists **only** on
  `answered`. v2 adds conditional follow-ups and a pre-echo warning (`interview.v2.core.ts:5-10`).
- **The segment set**: `CLIENT_SEGMENTS_V2` (`interview.v2.questions.ts`); validators in
  `interview.v1.core.ts` (`validateSsm`/`validateTin`/`validateFye`/`validateMsic`/`validateTurnover`);
  registration classification in `malaysian-registration.mjs`; entity/framework logic in
  `interview.v2.frameworks.ts` (`ENTITY_TYPES_V2`, `:50-52`).
- **The three v3 residuals** (`PROGRESS.md:331-336`, re-homed to F-A7b): `readClearsError` never
  checks `runId` · **the concurrent-submitter receipt gap** — *"a higher park index ⇒ my answer
  landed" is an inference, not a receipt; the real fix is a server-authored per-(run, park,
  submission) receipt* · the interview e2e de-pin, whose own text calls it a dated tripwire *"stale
  at the next core bump"* — **F-A7b is that bump**.

### 5.3 Dashboard

- `apps/dashboard/app/onboarding/` — `page.tsx`, `InterviewPanel.tsx`,
  `apps/dashboard/app/onboarding/useInterviewRun.ts`,
  `apps/dashboard/app/onboarding/thread.ts`; `apps/dashboard/app/onboarding/client/` — `ClientStarter.tsx`, `page.tsx`,
  `InterviewAttachments.tsx`.
- **`InterviewAttachments.tsx:16-24` records a provenance limit F-A7b must discharge**: every
  interview attachment is tagged `origin='documents_tab'` because the intake origin is a closed
  CHECK, *"an honest `'onboarding_interview'` origin therefore needs a migration, not a dashboard
  constant"*. The comment names the table **`clara.intake_requests`** — **that table does not
  exist** (positive read: zero hits for `intake_requests` across `packages/db/migrations`). The
  real object is `clara.document_intakes`, `origin in ('chat','documents_tab')` at **`0007:104`**,
  paired to `chat_session_id` at `0007:131-133`. *(Spelling is not identity — review law 3: the
  citation is right, the name is wrong.)*
- The attribution surfaces: `documents/api.ts:107` (the unassigned anti-join), `:131-143` (attempts
  + open candidates), `:189` (`file_document`), `:209-216` (`confirm_attribution_candidate` with
  `p_file_document: true`), `:218-220` (dismiss); `DocumentDetail.tsx:172-206` (*"Your explicit
  choice is the human attribution act"*); `documents/page.tsx:53,137-138` (the unassigned lane).
  `CorrectionWizard.tsx:5` — *"Clara is NOT in this loop in Slice 5 — this is a human surface."*

---

## 6 · Wake authority and metering

| object | bytes | shape |
|---|---|---|
| `clara.wake_credentials` | `0002:230-239` + `0011:623-628` | `ck_wake_credentials_kind_0011`: `wake_kind in ('interactive','proactive','autodraft')` · `ck_wake_credentials_client_0011`: `(autodraft and client_id not null) or (interactive|proactive and client_id null)` — **a closed-world enumeration on BOTH sides** |
| `clara.mint_wake_credential(text,uuid,uuid,interval,uuid)` | `0011:1156-1194` | **two** kind gates: the early raise at `:1163-1165` and the arms at `:1178-1186`; granted to `clara_runtime` (`:1196-1197`) |
| `clara.wake_fn_allowlist` | `0002:245-250`; seeds `0002:552-558`; the autodraft count assertion `0011:4169-4176` | the per-kind verb roster; `assert_wake_allowed` `0004:114-121` raises `CLR03` |
| the six roster/census surfaces | `f-a2-annexes-2-mechanics.md:300-303` | the allowlist counts (`0011:4169-4176`), `0078:255-259`'s interactive-only η census, the role map (`0011:4290-4296`), `assert_wake_allowed`'s rows, **plus two more found by census** |
| the runtime minters | `pools.mjs:304-312`, `:326-334` | `mintWakeCredential` / `…Obo` hardcode `"interactive"` and take no client; declared at `chatTurn.v10.infra.ts:32-33` — **that file is `@frozen`** |
| metering | `clara.llm_usage_events` `0094:53-77` | `document_id uuid not null` + `task_id uuid not null` with composite FKs (`:66-69`); **no `client_id`, no actor column**; append-only triggers (`:74-77`); `record_llm_usage_event` `0094:90-…` |

**Consequence for F-A7 (TA-P13 A).** A pre-attribution triage read has **no client**; an
onboarding-interview read has **no processing task**. Both are unrecordable in today's ledger.
F-A7 **depends on** TA-P13's reshape (both FKs nullable + a call-kind discriminator + `client_id`
+ triggering actor) landing first or in the same train.

---

## 7 · Closed-world censuses and live assertions this item will break

| # | census / assertion | bytes | disposition under F-A7 |
|---|---|---|---|
| 1 | `client_resolutions.method` CHECK | `0003:90` | **RECUT — extend only.** A fourth value; the three existing stay byte-identical |
| 2 | `assert_client_resolved` predicate | `0018:60-64` | **CoR — the constitutional body.** D1 |
| 3 | 0018's splice anchor + drift abort | `0018:252-271` (anchor literal `:260`) | **STANDS** — F-A7 changes the predicate body, never a call's TEXT. The spliced twelfth caller is regenerated only if 0018 re-applies, so a fresh rig apply exercises it and an in-place CoR does not |
| **3a** | 0018's `prosrc` body marker | `0018:553-568` (the assert's own marker `:555-557`) | **RESTATED v1.2 — it is APPLY-POSITION HISTORY, not a live gate.** It sits inside `0018:487-809`'s single `do $tail$` block, executed once at 0018's position against the body 0018 creates at `:57-68`, so it cannot see a later CoR. v1.1's *"all break a green apply"* is false in that direction. **The discipline survives as the DESIGN's own** (add beside, never weave through) and the property is re-authored as F-A7's own re-runnable postcheck block in train α2 |
| **3b** | 0018's functional probes on the generic assert | `0018:751-767` | **RESTATED v1.2 — same block, same one-shot semantics.** Accept-unbound (`:752-757`) and reject-bound (`:758-767`) are 0018-apply-time assertions and constrain nothing about a later recut. They are re-authored, not "kept green": design v2's α2 block carries both, and cells 30a/30b force **that** block (annexes-2 §J cell 71) |
| **3c** | **`clara._tf_stamp_document_pipeline()` — the BEFORE INSERT trigger on `document_filings`** | `0007:415`, body arm `:425-431`, attached `:511-517` | **NEWLY SURFACED BY THE GATE, and it is a blocker.** It re-derives `method in ('human','rule') and confidence >= 0.95 and superseded_at is null` and raises `CLR01` on every insert carrying a non-authoritative resolution — so **every agent-judged filing aborts at INSERT** unless it extends. **CoR — extend only. D1-α2** |
| **3d** | **the other four live inline re-derivations** | `0009:2319`/`:2324` · `0007:1592` · `0007:2496` · `0027:268` | **NEWLY SURFACED.** `file_document`, `_seed_verified_document`, `propose_wrong_client_correction`, `approve_wrong_client_correction`. All **CoR — extend only, D1-α2**; `assert_client_resolved_bound` (`0018:81`) is the one that **STAYS** two-value (D-16). Register: annexes-2 §H |
| 4 | `rig-invariants.test.mjs:168-172` "agent-method resolution rejected" | test | **STAYS GREEN** by design (finding 2); gains an inverted twin for the new value |
| 5 | `document_filings.basis` CHECK | `0007:71-72` | **RECUT — extend only** |
| 5a | `clara._active_document_filing`'s 29 call sites | `0007`-`0030` (§2.3) | **UNTOUCHED**, but the count is the denominator for "did the filing semantic move" — re-derived by census in PR-1a's postcheck, never asserted from a list |
| 6 | the three purpose CHECKs (by discovered name) | `0020:153,198,250` → `0038:5504` → `0090:704` | **RECUT — extend only**, 0090's discovered-name idiom verbatim |
| 7 | `ck_egress_dispatch_authorizations_doc_sha` | `0090:731-735` | **RECUT, name preserved** — one new conjunct per new purpose |
| 8 | the four purpose verbs' in-body allowlists + five `prosrc` sha pins | `0090:758,818,890,952,1064-1100` | **CoR + re-pin.** 0090's postcheck block is the template |
| 9 | `ck_wake_credentials_kind_0011` / `…_client_0011` | `0011:623-628` | **RECUT — extend only. SHARED WITH F-A2 PR-1 (D34).** Strict ordering required |
| 10 | `mint_wake_credential`'s two kind gates | `0011:1163-1165`, `:1178-1186` | **CoR. SHARED WITH F-A2 PR-1** |
| 11 | the six wake roster/census surfaces | §6 | **RE-TRUED by census, not from a list** (F-A2's own lesson) |
| 12 | `0038`/`0040` zero-agent-grant tails on the bank/document surface | `0038:9369`…`:9509`, `0040:7850-7851` | **RESTATED v1.2 — they are one-shot DO blocks in applied history**, enumerating roles by literal name at their own apply position. They are NOT "re-cut to the new truth"; a **NEW** zero-grant census is authored in F-A7's own migration and the old tails are left alone (migrations are immutable — `migrate.mjs:1-15`) |
| 13 | `open_questions.origin` CHECK | `0017:667-669` | **UNTOUCHED** — `'onboarding'` already reserved |
| 14 | `document_intakes.origin` CHECK + its paired CHECK | `0007:104`, `:131-133` | **RECUT — extend only** (`'onboarding_interview'`); the paired constraint gains its arm |
| 15 | `classify` in the local-lane comment + the claim body's egressing list | `0090:346`, `:355` | **BOTH CHANGE** — the comment is part of the finding |
| 16 | the document-kind vocabulary — **FOUR surfaces, not one** (v1.2) | `documents_document_kind_check` `0017:692-698` · `classify_document` in-body `0026:1290-1296` · `set_document_kind` in-body `0026:1457` (spliced `0038:7766`) · `CLASSIFY_KINDS`/`DB_REFUSED_KINDS` `classify-llm.mjs:24-46` | **EXTENDED on all four, extend-only** — `identity_document` is a settleable kind and **NOT** a `DB_REFUSED_KINDS` member (D-9 re-cut). The two in-body lists are **live-body CoRs in D1-γ**, not ALTERs, and both must come from a rig replay because 0038 splices them. `classify-unit.test.mjs:151-165`'s disjointness invariant stays green |
| 21 | **`claim_document_processing_task` holds NO typed-consent call edge** (v1.2) | `0090:494-499` (apply postcheck) + `wb-0020-legacy.test.mjs:630-639` (standing battery, live `pg_proc`) | **MUST STAY TRUE — it is not a break, it is a wall.** The classify consent gate lands at ENQUEUE in `_enqueue_invoice_facts_core` (live tip `0090:1125`) instead, per the estate's own recorded reasoning at `0090:1238-1245` (D-18) |
| 22 | **the `document_filings` writer set + the lock order** (v1.2) | `0027:26-40` | **UNTOUCHED but BINDING** — six live writers today, seven after α1's extraction; every new acquirer takes `documents` FOR UPDATE first, with a two-session race cell |
| 17 | `update_onboarding_plan` as the single item writer | `0017:2632` | **CoR (body-move to an ungranted core).** D1 |
| 18 | `matcher.mjs:8-10` "never … files a document" | comment on a live consumer | **REWRITTEN with the lane** |
| 19 | `CorrectionWizard.tsx:5` "Clara is NOT in this loop" | comment | **REWRITTEN** |
| 20 | `InterviewAttachments.tsx:16-24` provenance limit + the stale table name | comment | **DISCHARGED** by row 14 |

---

## 8 · Human doors — what exists, what F-A7 manufactures (TA-P14 clause 2)

**Exists:** `file_document` · `retire_document_filing` · `confirm|dismiss_attribution_candidate`
(with the documents page) · the correction trio (+ `CorrectionWizard.tsx`) · `add_client_identifier`
/ `add_client_alias` / `retire_client_alias` · `open_question` / `resolve_open_question` /
`dismiss_open_question` · `commit_client_onboarding` / `cancel_client_onboarding`
(+ `FirmCommitForm.tsx`; **the client-side commit form is absent** — positive read of
`apps/dashboard/app/onboarding/client/`).

**F-A7 manufactures these human acts and therefore owes each a minimal door:** confirm or override
an agent attribution verdict · answer a **firm-scoped** unattributed-document question · confirm an
onboarding echo batch (with the five per-field confirmations) · confirm a "promote to hard fact"
proposal card · approve a misrouted-document correction · sign and activate **two** new egress
purposes (owner) · commit a client file Clara opened.

## 9 · Lost records re-scan (TA-P14 clause 6)

N2 and N4 are recorded lost. Re-scan performed for F-A7's own surface: a sweep of `docs/plan/` and
`docs/audit/` for those ids returns only the registry entries that declare them lost. **No
F-A7-relevant content recovered.** Any rediscovery is registered anew; the old ids stay retired.

## 10 · What this survey could NOT settle from the bytes

Each is carried into the design as a **PREDICTION for the PR-1 rig replay**, never as a claim.

1. **How many rows exist today with `method='agent'`**, and whether any is referenced by a live
   filing — a data question, not a schema one.
2. **Whether `assert_client_resolved`'s ACL is genuinely empty of app roles at the live tip** —
   `0018:554-566` reads it at apply time; this survey did not run the catalog query.
3. **Whether the six wake roster/census surfaces are still exactly six** after F-A2 PR-1 merges.
4. **Whether any BELCORT client's OCR text has already egressed through classify** — an audit-log
   question for the acceptance record, not a design input.
5. **Whether `document_intakes.origin`'s paired CHECK has any consumer** beyond the runtime intake
   route's `origin='chat'` session-access special case.
