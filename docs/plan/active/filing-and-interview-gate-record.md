# F-A7 PR-0 — the gate record

> **Gate 1 of the Track-A design fan-out ran 2026-08-22** against F-A7 **v1.1**
> (`filing-and-interview-design.md` + `filing-and-interview-survey.md` +
> `filing-and-interview-annexes-1.md`), read against `main` at **cfa0710**, migration
> frontier **0102**. Two lenses, both fresh-context, every finding adversarially re-verified
> by an independent lane at the bytes: the **BYTES lens** (18 findings — estate claims
> re-derived at their cited `file:line`, every planned CoR body's lineage grepped, the D1 set
> derived independently, the closed-world censuses forced) and the **RULINGS lens** (4
> findings — the design read against ADR-0074's TA-P1…TA-P14 and `wave-f-contract.md`).
>
> **Verdict: the ruled shape holds and the prose discipline is real; six blockers and eight
> materials bind the build; the item is severed into five trains and F-A7b is re-scoped as
> its own item.** Every finding below names its fold target. **The fold is v2's change-log
> entry (`filing-and-interview-annexes-1.md` Annex F) and this file is its spec.**
>
> Standing caveat, unchanged from F-A2's gate: **a migration-source read is a prediction
> about the live catalog.** This gate found that prediction wrong eight times in one design
> (§2 AB-3), so every decisive body in §8's list is re-derived by **rig replay against
> `pg_get_functiondef` at frontier 0102**, never from migration text, before its PR is
> authored.

---

## 1 · What was attacked and HELD

Recorded because it is settled and should not be re-argued.

- **The verb seam** — granted wrapper (identity + allowlist + raises, no DML) → ungranted core
  (ladder + receipt + write) → ungranted delegate. The `0077`/`0078` idiom is applied
  correctly; the grant split leaves no alternate entrance. **Ships as designed.**
- **The four-tier ladder's SHAPE** — Tier A raises, Tier B commits a typed non-filing receipt
  and opens the firm question in the same transaction, Tier C is deferred-constraint, Tier D
  is worker-side. The attack that Tier B can abort on a malformed citation was **REFUTED**:
  shape is Tier A's named job (design §3.2 "Tier A — authority and shape. RAISE") and
  `CLR10` malformed input is already its own listed category (annexes-1 §A.2).
- **`method='agent'` stays refused** — finding 2 and D-1 are exact:
  `client_resolutions.method` admits `'agent'` (`0003:90`),
  `wake_record_client_resolution` hard-stamps it (`0004:638-639`), and the assert excludes it
  (`0018:60-64`); `rig-invariants.test.mjs:168-172` proves the refusal in words. A **fourth**
  value keeps that cell green.
- **No model-written numeral reaches a durable artifact** — confidence is pinned 1.0 by the
  core on the `record_opening_keyed_resolution` precedent (`0018:94-…`); the model's own
  stated confidence lives only as an annotation inside the receipt's `verdict` jsonb.
  Constraint 2 / digest law 2 intact.
- **F-A7-M1 (classify's live ungoverned egress) is CONFIRMED at the bytes** —
  `classify-llm.mjs:14` imports `@ai-sdk/openai`, `:106`/`:143` ship up to 24 000 chars of OCR
  layout text, while `0090:346` names the lane local and `0090:355` omits it from the
  egressing list. The survey's finding 3 is exact.
- **The shared-CHECK sequencing with F-A2 D34** — `ck_wake_credentials_kind_0011` /
  `…_client_0011` (`0011:623-628`) and both `mint_wake_credential` gates
  (`0011:1163-1165`, `:1178-1186`) are named correctly and defended with a prestate probe
  (annexes-1 §D.2 item 1). Verified exact.
- **TA-P13's dependency** — `llm_usage_events`' two mandatory FKs (`0094:66-69`) genuinely
  make a pre-attribution read and an interview read unrecordable. Correct against `0094:53-77`.
- **The rulings translation** — TA-P7 C's judged-attribution wall with all four riders,
  TA-P1 C's open-register default with an honest irreversibility label, TA-P4 A's
  mechanically-bound receipts (`via_wake_kind` never NULL, `trigger_id` bound to the real
  task/turn), TA-P8 B's context-not-keys posture with the promotion door, TA-P14's
  closed-loop-done clauses. All implemented as ruled.
- **Gate O is correctly left alone** — `cardinality(contributors)=0 → CLR05`
  (`0017:2786-2790`) plus `update_onboarding_plan`'s bookkeeper+ `p_answered_by` check
  (`0017:2661-2667`) already fail closed against an all-agent interview. Finding 6 exact.

---

## 2 · Blockers — the build may not start until each is folded

**AB-1 · A BEFORE INSERT trigger on `document_filings` re-derives the two-value predicate
and refuses every agent-judged filing.** `clara._tf_stamp_document_pipeline()` is created
once at `0007:415` and never replaced (sole `create[ or replace] function` hit — this IS the
live tip). Its `document_filings` arm at `0007:425-431` re-derives
`method in ('human','rule') and confidence >= 0.95 and superseded_at is null` and raises
`CLR01`; the attach loop at `0007:511-517` fires it `before insert on document_filings`. It
appears in no register of v1 — not the D1 table, not the ALTER list, not the survey's 20-row
break list, not Annex D.3, not Annex E. **Attack:** `wake_file_document` →
`_agent_file_document_core` → `_file_document_write` inserts with a fourth-method resolution;
the trigger raises; the whole judged-filing limb is unbuildable and battery cells 20/21/29
fail for a reason the design never names.
**Fold:** the trigger joins the constitutional CoR set as a hot-path body (annexes-2 §H row 3,
window **D1-α2**), extend-only. Two cells: a fourth-method filing inserted through the
delegate is admitted by the trigger; the inverted twin proves `method='agent'` still raises
`CLR01` there.

**AB-2 · The two-value world lives in SEVEN live bodies, not one — the census counted CALLS,
not re-derivations.** `grep -n "method in ('human','rule')" packages/db/migrations/*.sql`
returns 13 hits; six are inside superseded bodies. The **seven live** re-derivations are
`assert_client_resolved` (`0018:62`) · `assert_client_resolved_bound` (`0018:81`) ·
`file_document` at its true tip (`0009:2319`, `:2324`) · `_tf_stamp_document_pipeline`
(`0007:429`) · `_seed_verified_document` (`0007:1592`) · `propose_wrong_client_correction`
(`0007:2496`) · `approve_wrong_client_correction` at its true tip (`0027:268`, raising `CLR01`
at `:270`). v1's census enumerates callers of the assert and therefore sees **none** of the
inline copies. **Attack (a):** `_file_document_write`, extracted from the live
`file_document`, carries `0009:2317-2325` verbatim — the delegate either raises `CLR01` at
`0009:2326` or silently mints a SECOND `'human'` resolution at 1.0 attributed to the agent
actor, which is exactly the model-authored "human" attribution TA-P7 C's wall exists to
prevent. **Attack (b):** rider 3's posted arm routes the human approval through
`approve_wrong_client_correction`, which raises `CLR01` at `0027:270` because the destination
client's only resolution is Clara's judged one.
**Fold:** the caller census is replaced by a **re-derivation census over `pg_proc.prosrc`
TEXT** (annexes-2 §H), each of the seven given an explicit EXTEND / STAY disposition with a
cell in both directions; the bound assert **STAYS** two-value (it is the opening-seed lane's
confinement) and that is now a recorded decision, not an omission. Rider 3's posted arm is
answered in design §3.3 and its dependency on `approve_wrong_client_correction` extending is
stated.

**AB-3 · Eight bodies are cited to superseded text; four of them are additionally generated at
APPLY TIME; migration 0027 is cited zero times in all three documents.** Live tip vs v1's
cite: `file_document` **`0009:2291`** vs `0007:1367` · `retire_document_filing`
**`0027:393`** (spliced `0038:7604-7625`) vs `0007:1450-1455` "reused verbatim" ·
`confirm_attribution_candidate` **`0027:121`** vs `0007:2356-2402` ·
`approve_wrong_client_correction` **`0027:196`** (spliced `0038:7495-7520`) vs `0009:2444` ·
`record_rule_resolution` **`0015:405-475`** vs `0007:2296-2352` · `classify_document`
**`0026:1262`** (spliced `0038:7816-7840`) vs `0016:3202-3207` · `persist_document_extraction`
**`0026:497`** vs "0007 lineage tip" · `list_unassigned_documents` **`0011:3943`** vs
`0009:2590-2611`. The survey's own v1.1 citation audit **certifies four of these as
"Verified EXACT"** (`survey:71-76`) — a false positive inside the document's own quality gate.
`0027`'s header (`0027:1-40`) carries the estate's documents-before-`document_filings`
lock-order law and enumerates the **six live `document_filings` writers**; `grep -c 0027`
across the three F-A7 files returns 0/0/0. **Attack:** a builder seeding a CoR from
`0016:3202-3207` silently deletes `prior_gl` (`0026:1294`), 0024's `claim_secret_digest`
capability gate, 0026's `doc_classify`-scoped version mint and 0038's bank-statement refusal —
four live safety properties removed by a "widening"; and `wake_reattribute_document` built on
`0007:1450-1455` restores the filings-before-documents order 0027 closed, reproducing 40P01.
**Fold:** annexes-2 **§G** is the live-tip register (every body, its true tip, whether 0038
splices it at apply time, and the safety property a text-copy would drop); every CoR is
re-derived by **rig replay**, never from migration text; the survey gains 0027's lock-order law
and its six-writer enumeration, and design §5 states that **every new `document_filings`
acquirer takes `documents` FOR UPDATE first**, with a two-session race cell per new acquirer.

**AB-4 · The classify consent gate cannot land in `claim_document_processing_task`.**
`0090:494-499` is a live apply-time postcheck raising if that body gains any reference to
`client_egress_purpose*` / `prepare_egress_dispatch` / `consume_egress_dispatch`, and the
STANDING battery test `packages/db/tests/wave-b/wb-0020-legacy.test.mjs:630-639` re-asserts it
against the live `pg_proc` tip on every `pnpm --filter @clara/db test` run — i.e. on every CI
estate leg, not only at 0090's apply. The estate already recorded where the gate belongs:
`0090:1238-1245` — *"THE ENQUEUE-TIME TYPED-CONSENT GATE, statement lanes only. It is here
rather than in the claim body because the ratified 0020 section 6 byte-identity battery
asserts claim_document_processing_task carries no call edge into the typed-consent surface —
and because enqueue is the earlier, more honest place."* v1 puts it in the claim body
(design §3.5, D1 row `0090:328`). `_enqueue_invoice_facts_core` is named zero times in all
three F-A7 files.
**Fold:** the gate moves to **`_enqueue_invoice_facts_core`** (live tip **`0090:1125`**),
following the 0038/0090 statement-lane precedent, with the terminal never-claimed failed
receipt (the `skipped_kind` idiom, never a raise — `0090:1242-1245`, because the function runs
inside `file_document` / `finalize_document_intake` / `confirm_attribution_candidate` /
`approve_wrong_client_correction` and a raise would abort an unrelated filing transaction).
`claim_document_processing_task` **leaves the CoR set entirely**. Battery cell 31 is re-cut to
prove the hold happens at ENQUEUE (no task row in the client's name), not at claim.

**AB-5 · The `identity_document` limb is self-contradictory and names one of four surfaces.**
v1 asks for `identity_document` to join `CLASSIFY_KINDS` **and** `DB_REFUSED_KINDS`
(design §3.5). By `classify-llm.mjs:26-27` the vocabulary is *"the CHECK MINUS
DB_REFUSED_KINDS"*, and `packages/runtime/tests/classify-unit.test.mjs:151-165` pins the
disjointness as a machine-checked invariant — a builder who does both fails a live CI test.
The model could then never return the kind, `documents.document_kind` could never hold it, and
B8's DB half would have nothing to read, so the identity-document refusal degrades to a
prompt-level instruction, which D-9's own reasoning says constraint 2 forbids. The kind
vocabulary also has **four** surfaces, not one: `documents_document_kind_check`
(`0017:692-698`, 19 values) · `classify_document`'s in-body list (`0026:1290-1296`) ·
`set_document_kind`'s in-body list (`0026:1457`, spliced `0038:7766`) · `CLASSIFY_KINDS`
(`classify-llm.mjs:28-46`). v1 lists only "the `classify_document` kind CHECK" and files it
under **ALTERs (no body rewrite)**, hiding two live-body CoRs — one on the hot classify settle
path — from the D1 window.
**Fold:** one mechanism, chosen: `identity_document` becomes a **settleable kind on all four
surfaces and is NOT a `DB_REFUSED_KINDS` member** — the refusal lives in B8 and in the
firm-narrow output wall, where it is a DB fact rather than a prompt instruction, and no
settle-loop is created (the only thing `DB_REFUSED_KINDS` exists to prevent,
`classify-llm.mjs:19-23`). `classify_document` and `set_document_kind` move out of the ALTER
list into the **D1-γ** CoR table, both re-derived by rig replay because 0038 splices them.
D-9 is re-cut in the decision register.

**AB-6 · "Twelve callers" is THREE live bodies, and P-2a's refutation branch would stall the
build.** The eleven grep hits are successive CoRs of three functions: `_draft_entry_core`
(`0004:127` → … → `0016:3970`, live tip; older overloads explicitly DROPped at `0005:955` and
`0009:1200`), `finalize_document_intake` (`0007:1977` → `0015:3431` → `0026:234`, live tip),
and `_draft_opening_item_core` (`0017:3162`, spliced by `0018:252-271`). `pg_proc` holds one
row per function, so a correct replay can only ever return **three**. v1's survey §2.1 makes
the double-count visible: it lists `0017:3208` among "the 11 in-body callers" *and*
`0018:252-271`'s splice as "the 12th, generated" — the pre- and post-splice states of one
function counted as two live callers. P-2a's stated response to a number that is not twelve is
*"stop and re-apply, do not adjust the number"*, so a correct rig chases a number `pg_proc`
cannot produce; and R1 reassures on "all twelve callers re-proven" while the real blast radius
(AB-2's seven inline re-derivations) goes uncounted.
**Fold:** survey finding 1, design §9 R1, battery cell 29 and prediction P-2a are all restated
in terms of **three live caller bodies derived by rig replay**, with **seven live
re-derivation bodies** stated separately as the true blast radius. The replay-not-grep
discipline is kept — it was right; only the number was wrong.

---

## 3 · Materials — each folds into v2

**AM-1 · 0018's tail block is a ONE-SHOT apply-position assertion; rows 3a/3b read it as a
re-runnable gate.** `0018:487` `do $tail$` … `0018:809` `$tail$;` is one block executed once
at 0018's position, and the body it reads is created in the same file at `0018:57-68`;
`migrate.mjs:1-15` makes migrations immutable and applied-once. So the `prosrc` marker
(`0018:553-568`) and the functional probes (`0018:751-767`) **cannot observe a CoR authored in
a later migration**. Survey row 3a ("all break a green apply") and row 3b ("MUST STAY GREEN")
are false in that direction; cell 30a's negative twin — "show a re-woven body FAILING the
marker" — is not forceable non-vacuously, because the only way to exercise it is to hand-copy
the predicate into a new block, which proves the copy. Survey row 12 makes the identical error
about the `0038`/`0040` zero-agent-grant tails (`0038:9369`…`:9509`, `0040:7850-7851` — DO
blocks in applied history enumerating roles by literal name). Survey row 3 states the correct
mechanism one row earlier.
**Fold:** 3a/3b are restated as what they are — apply-position assertions that constrain
nothing about a later CoR — and the **properties are re-authored as NEW postcheck blocks in
F-A7's own migration** (`0090:1062-1100` is the template). Cells 30a/30b are re-cut to force
those new blocks. Row 12 likewise: a **new** census in the new migration, never a re-cut of
0038/0040. The design's "add beside, never weave through" constraint survives — but as the
design's own discipline, honestly labelled, not as an estate constraint.

**AM-2 · B2's family predicate is scoped to `clients` only; the ruling's named collision
source is a COUNTERPARTY.** ADR-0074:185-188: *"BELCORT's own books carry ROME PROPERTIES and
ROME SECRETARY, and ROME PUBLIC ADVISORY returns as a real **counterparty** after the Wave-G
reset."* ROME PUBLIC ADVISORY is a separate FIRM (`39008536`,
`docs/adr/0045-gate-f-closed-rome-public-advisory-born.md:2`) and AGENTS.md constraint 13
names it the synthetic sandbox — v1's worked example (design §3.3 rider 2) calls it a BELCORT
client. **Attack:** a document naming only ROME PUBLIC ADVISORY where a single ROME *client*
partially matches has a one-candidate clients-only set: B2 passes and the document files to
the wrong client. P-3 ("≥2 for the three ROME parties") can only ever return 2 over `clients` —
refuted by construction, and "tune the predicate" would tune against a phantom.
**Fold:** the family predicate spans **`clients` UNION the firm's `counterparties`**; the
worked example is corrected (two clients + one counterparty, one firm); P-3 is re-cut to the
true expected cardinalities over a rig fixture.

**AM-3 · TA-P11's premise is false at the bytes: `document_filings` already has SIX live
writers.** `0027:26-40` enumerates them from the live catalog (`pg_proc` +
`pg_get_functiondef ~* 'document_filings'`): `file_document`, `finalize_document_intake`,
`_seed_verified_document`, `confirm_attribution_candidate`, `approve_wrong_client_correction`,
`retire_document_filing`. `finalize_document_intake` repeats `file_document`'s
`case when v_basis='rule' then 'rule' else 'human' end` verbatim — copy-pasted write logic. So
extracting one delegate yields **seven** writers, six of which never see it, and D-10's stated
property ("two mutually-unaware writers would be two architectures") is falsified the moment it
ships.
**Fold:** the body-move **stays** but its claim is narrowed to what it actually buys — *the
agent core and the human `file_document` share one write, so the JUDGED path has one
semantic* — and the estate-wide unification claim is **withdrawn** in D-10. `0027`'s
documents-before-`document_filings` lock order is stated as **binding on every new acquirer**,
with a two-session race cell per new acquirer (the 0020-resolver test pairs are the template).
The extraction is re-packaged as a **pure, behaviour-inert migration file of its own**
(§4 train α1) so its cost is visible and its revert is single.

**AM-4 · `chatTurn_v13` is already claimed by F-A2's PR-2.** Live registry tip is
`chatTurn_v12` (`packages/runtime/workflows/registry.ts:46`); F-A2 claims v13 in three places
(`f-a2-pr0-gate-record.md:226`, `f-a2-annexes-2-mechanics.md:177`,
`f-a2-agentic-posting-design.md:438`); F-A7 v1 §6 names the same export. Two items minting one
frozen `_vN` collides with hard constraint 9, and Annex D.2's ordering obligations never
mention a workflow version.
**Fold:** a fifth ordering obligation — F-A7's chat parity ships as the **next free `_vN`
above whatever tip F-A2 leaves**, with a prestate check that the registry default is F-A2's
version — and the chat-parity limb is **severed from the runtime PR** until F-A2's `v13` has
landed and its successor number is known (§4 train ε).

**AM-5 · Two contract clauses are silently dropped, and the BUILD GATE blocks work the
contract explicitly permits.** (i) `wave-f-contract.md:297-298` — *"A pre-activation document
class with its disposition (never deleted, retention extend-only, no purge verb) ships with
the narrow door"* — has no counterpart in v1 (B8 says "quarantined" with no class and no
disposition); it is also TA-P3 A's ruled member **F-A7-M6** (`track-a-sitting-1.md:260`).
(ii) `wave-f-contract.md:296` — *"Dual-attributed related-party documents read once under BOTH
sides' authorization"* — is made OQ-A7-e "out of scope for v1" and a named non-goal.
(iii) `wave-f-contract.md:411-413` rules that *"F-A7a's other pieces (the firm-scoped question
carrier, the correction path, the collision guard) can proceed meanwhile"*, while design:23-28
blocks **all** of PR-1 on the digest signature and PR-1a bundles those three pieces with the
constitutional recut into one migration and one window — the packaging destroys a permission
the sitting granted.
**Fold:** (i) design §3.5 gains the pre-activation document class and its disposition, cited to
the estate's existing table-wide guarantees (no delete verb on `clara.documents` or
`clara.document_intakes` anywhere; retention recompute is extend-only) plus the new
`document_intakes.origin='onboarding_interview'` arm — so the class is *stated*, which is what
the clause asks for. (ii) OQ-A7-e is re-labelled a **contract-severance request against
`wave-f-contract.md:296`**, not an owner question — it goes to the owner in §5 below.
(iii) the build sequence is re-packaged so the contract's named three ship **first, additive,
no ceremony, NOT amendment-gated** (§4 train π).

**AM-6 · The new `filing` wake kind DOES need read authority.** `get_document_extract`'s live
tip gates on the roster: `0090:1579-1580` —
`if w.wake_kind not in ('interactive','proactive') then perform clara.assert_wake_allowed(w.wake_kind,'get_document_extract'); end if;`
— and `assert_wake_allowed` raises `CLR03` on a missing row (`0004:114-121`). The autodraft
kind needed its own row when it was introduced (`0011:3905`
`('autodraft','get_document_extract')`). Design:76-77 and survey:113-117 both state F-A7a adds
no read authority. Cell 40 ("`filing` holds **exactly** its intended allowlist rows") is
self-referential — "intended" is whatever PR-1 inserts.
**Fold:** design §1 and survey finding 4 are corrected to *"no new EXECUTE grant — the read
surface is unchanged; one allowlist ROW per read verb the kind uses"*; Annex A gains the
**written enumeration** of the `filing` kind's allowlist rows (`get_document_extract`,
`wake_file_document`, `wake_open_firm_question`, `wake_reattribute_document`,
`wake_propose_filing_correction`, `wake_propose_identifier_promotion`,
`wake_begin_client_onboarding`) and states the EXECUTE source is the existing agent read role;
cell 40 is re-cut to compare against that written list, with a negative twin (cell 42's shape)
proving nothing else is reachable.

**AM-7 · B1 omits the live matcher's AB-3 source discipline and its sentinel-TIN exclusion.**
The live `record_rule_resolution` (`0015:417-428`) carries
*"AB-3: attribution may consume only identity-bearing OCR/structured snapshots. invoice_facts
deliberately carries colliding field_path names and is not an attribution source"* enforced by
`and e.engine_kind in ('ocr','structured_parse')` at `:428`, and `0015:433-442` excludes the
reserved MyInvois sentinels `('ei00000000010','ei00000000020','ei00000000030')`. v1's B1 reads
"any identifier printed on this document" with neither. **Attack:** an `invoice_facts`
extraction whose `field_path` contains "tin" holds the SUPPLIER's TIN, registered to a sibling
client; B1 refuses a correct verdict with `attribution_contradicted` permanently, on every
re-triage.
**Fold:** B1's identifier read is scoped to `engine_kind in ('ocr','structured_parse')` and
carries the sentinel exclusion, both cited to `0015:417-442`, with a cell each (an
`invoice_facts` supplier TIN must NOT contradict; a sentinel TIN must NOT contradict).

**AM-8 · The posted-misattribution path reserves for a human a reversal the owner granted
Clara.** Design §3.3 item 3: *"Posted: she may not unwind it — she calls
`wake_propose_filing_correction` … the human approves through the existing
`approve_wrong_client_correction`."* TA-P7 rider (3) reads *"unposted → she re-attributes;
posted → reverse + question"*, and TA-P6 A's member **OQ-A7-4** answers it explicitly: a
posted error — *she may reverse it herself and flag a question; only the cross-client
re-homing needs human approval plus attestation*. The live
`approve_wrong_client_correction` (`0027:196`, `_human_ctx`-gated) performs reversal **and**
re-file atomically, so there is no mechanism today for the agent-executable half. No
decision-register row records the narrowing.
**Disposition, TRUED AT LANDING 2026-08-22: FOLDED, not escalated.** *(Orchestrator ruling: the
escalation asked a question TA-P6 A's OQ-A7-4 and TA-P7 rider (3) had already answered, so it is
WIDENED here — Clara reverses her own posted misattribution herself and raises the question; only
the cross-client re-home is the human's. §5 owner item 2 is struck. The build owes a reverse-only
wake sibling and the reversed-but-unfiled half-state it implies.)* The paragraph below records the
original v2 disposition, kept because it states the mechanism gap the build must close.
**Original disposition: NOT folded — escalated (§5 owner item 2).** It collides with a sitting
ruling and the fail-closed default is the safe direction (more human, not fewer). The design proceeds
on the current human-gated atomic path and records the technical reason (a reversed-but-
unfiled document is a dangerous half-state) as a **PENDING-OWNER** decision row.

---

## 4 · The width ruling (both lenses convergent; bytes lens's severance adopted)

**Both lenses independently judged v1 too wide for one D1 window.** The bytes lens found
PR-1a naming nine CoR bodies (six on hot paths) with at least seven more added by its own
corrections — ~16 live bodies, four apply-time-spliced, in one window on the document
pipeline's hottest paths — and noted the packaging is self-defeating against
`wave-f-contract.md:411-413`. The rulings lens found three concerns with different blast
radii, different review lenses and different failure costs bundled into one window.
**Severed five ways, along the gate line the contract already drew:**

- **π · SHIP NOW — additive, no ceremony, NOT amendment-gated.** The contract's named three
  (`firm_open_questions` + its verbs · the correction siblings · the collision-guard family
  predicate as a pure function with its own corpus-tune cells) plus the promotion card and
  `agent_receipts_visible`. No live body, no D1. This is today's work and v1 blocked it for no
  reason.
- **γ · THE EGRESS TRAIN — its own PR, its own window, independent of the amendment.** The two
  purposes and the firm-narrow three-relation family · the classify re-gating **at enqueue**
  (AB-4) · the `persist_document_extraction` output wall at its true tip · the kind-vocabulary
  work across all four surfaces (AB-5) · the comment corrections. Its own prerequisite is
  **C6**, not a digest signature.
- **α · THE CONSTITUTIONAL TRAIN — gated on the digest signature, its own window, nothing else
  in it,** as two separately revertable migration files: **α1** the pure, behaviour-inert
  `_file_document_write` extraction; **α2** the `method`/`basis` CHECK extensions plus the
  seven live re-derivations decided one by one. This is the change whose worst case is a wrong
  number in two clients' books; a single revert must undo it. (Precedent for the file split
  inside one window: F-A2's `posted`-outcome chain, `f-a2-pr0-gate-record.md:215-219`.)
- **β · THE FILING VERB — its own PR and window**, after α and γ: the ladder, the agent core,
  `agent_filing_receipts`, the Tier-C triggers, the `filing` wake kind with its **enumerated**
  allowlist (AM-6) and the six roster re-truings. α and β may share ONE ceremony night as two
  sequential windows (the combined-window lesson) provided each migration stays independently
  revertable.
- **ε · CHAT PARITY leaves the runtime PR** until F-A2's `chatTurn_v13` has landed (AM-4).
- **F-A7b is RE-SCOPED as its own item.** It shares no body with F-A7a; its two body-moves
  (`update_onboarding_plan`, `begin_client_onboarding`, window **D1-δ**) are cheap only if they
  are not queued behind a constitutional amendment.

The revised train and every sequencing obligation are in
`filing-and-interview-annexes-2.md` §I; the design's §6 prints it.

---

## 5 · Owner items (the design does NOT decide these)

1. **The digest sign-off** (unchanged, procedural): TA-P7 C amends invariant (a) in PRD §6.2(a)
   · ARCHITECTURE §0.1 · digest law 2 (AGENTS.md's clause is the owner's call per the sitting's
   own correction), and TA-P1 C amends law 71's "exactly" enumeration. **It gates train α
   only** — π and γ proceed meanwhile per `wave-f-contract.md:411-413`.
2. ~~**AM-8 — may Clara reverse a posted misattribution herself?**~~ **RESOLVED AT LANDING, NOT
   ESCALATED — orchestrator ruling 2026-08-22: WIDEN to what the rulings already settle.** TA-P6 A
   member OQ-A7-4 and TA-P7 rider (3) say yes for the reversal half, human approval + attestation
   for the cross-client re-home; the fold lane escalated a question the sitting had already
   answered. **The design widens: Clara REVERSES her own posted misattribution herself and RAISES
   the question; only the cross-client RE-HOME is the human's.** Build consequence, unchanged from
   the analysis: a new **reverse-only** wake sibling, and therefore a legal reversed-but-unfiled
   half-state, because the live `approve_wrong_client_correction` (`0027:196`) reverses and re-files
   atomically. This is not a new authority — it is the authority the sitting granted, so no owner
   ruling is needed and the fail-closed default (fully human-gated atomic reverse+refile) is
   superseded rather than carried.
3. **Dual attribution — a CONTRACT severance ask, not an owner question.**
   `wave-f-contract.md:296` requires dual-attributed related-party documents to be read once
   under both sides' authorization. The design severs it to a later version.
   **Fail-closed default:** a dual verdict refuses at B2 as a collision and asks. *(The rulings
   lens's stronger claim — that TA-P3 A's member OQ-A7-5 was already ruled and is being
   re-asked — was REFUTED: the sitting agenda §R-B classifies the witness-gate recut as
   design-layer work and OQ-A7-5 is not a `blocks_build` member. What survives is the contract
   clause, which only the owner may sever.)*
4. **C6 (DPA · client disclosure · PDPA cross-border basis)** stays critical path and now gates
   **train γ specifically**, so the owner can see exactly which PR waits on it.

---

## 6 · Nits (folded without argument)

- **AN-1** — P-8 says "five named kinds"; design §3.5 names **four**
  (`invoice_facts`, `llm_text_facts`, `llm_vision_facts`, `statement_facts`) and the live
  closed world is seven (`0090:236-238`) minus the three non-fact-generation kinds = four.
  P-8 is corrected **and demoted from a prediction to a byte-cited census**.
- **AN-2** — the v1.1 audit's two corrections were never propagated to the companion files:
  design:314 still prints `interview.v1.core.ts:262-266` (live: **:261-265**) and
  annexes-1:246 still prints `InterviewAttachments.tsx:17-25` (live: **:16-24**). Both fixed;
  Annex F's completeness claim is narrowed to "every cite in the survey", which is what was
  audited.
- **AN-3** — four cites corrected: B6's cross-firm refusal is `0007:2278-2280` (not
  `:2283-2285`) · survey:246's "client_id not null on all three tables" is `0020:152`, `:197`,
  `:249` (the cited `:151`/`:196`/`:246` are `firm_id` lines — the one that matters, because
  the firm-scoped-purpose-is-impossible claim rests on them) · the normalization expression
  applied to the stored value is `0007:1525` (not `:1515-1519`) · **P-10 is settled at the
  bytes** — `filing_corrections.maker uuid not null references clara.users(id)` (`0007:317`),
  no membership check — and becomes a fact, not a prediction.
- **AN-4** — design §1 says the TA-P1 C rider has "two exceptions … the constitutional assert,
  and one body-move"; §5's own table carries **three** body-moves on live human writers plus
  the constitutional arm. §1 is trued to the count its own table prints.

---

## 7 · Refuted register (recorded so nobody re-raises them)

- **Tier B can abort on a malformed citation.** REFUTED: shape is Tier A's named job
  (design §3.2 heading) and `CLR10` malformed input is already a listed Tier-A category
  (annexes-1 §A.2). The uuid-cast hazard the finding cited (`0009:2307-2310`) is real estate
  precedent but is discharged by the Tier-A shape gate the design already specifies.
- **Survey correction C2's "29 call sites" is wrong.** REFUTED: the attack's own recount
  treated non-invocation matches (`0058:483`, `:485`, `:487`, `0060:49`) as call sites; the
  file set is exactly the 15 the survey's closed world names. **The survey's 29 stands** — but
  row 5a's "derived by census, never asserted from a list" discipline is what governs at PR
  time regardless.
- **TA-P3 A's member F-A7-M6 is unimplemented.** REFUTED as a mechanism gap: the category IS
  built (`document_intakes.origin` gains `'onboarding_interview'`, `0007:104`) and the
  disposal semantics are pre-existing, table-wide estate laws (no delete verb anywhere; law 6).
  **What was genuinely missing is the STATEMENT** — the contract asks for the class *and its
  disposition* to ship with the door — and that is AM-5(i)'s fold. Recorded here so the two
  gradings do not read as a contradiction.
- **OQ-A7-5 (dual attribution) is a ruled member being quietly re-asked.** REFUTED: the sitting
  agenda §R-B lists the dual-attribution witness-gate recut among F-A7's **design-layer**
  items, and OQ-A7-5 carries no `blocks_build` bold. The residue is the **contract** clause
  (`wave-f-contract.md:296`) — owner item 3, not a ruling violation.

---

## 8 · Rig-replay obligations (this gate's own predictions, and what must be re-derived)

Nothing below is settleable from migration text. Each is re-derived on a fresh rig apply
(0001-0102) against `pg_get_functiondef` / `pg_proc` **before its PR is authored**.

1. **Every live tip in annexes-2 §G**, re-derived by rig replay — in particular the four bodies
   0038 splices at apply time (`approve_wrong_client_correction`, `retire_document_filing`,
   `set_document_kind`, `classify_document`), whose live text exists in **no** migration file.
2. **The two-value re-derivation census** (annexes-2 §H): a `pg_proc.prosrc` text census for
   the predicate, expected **seven** live bodies. Extend-never-weaken, both directions.
3. **The `assert_client_resolved` caller census**: expected **three** live bodies
   (`_draft_entry_core`, `finalize_document_intake`, `_draft_opening_item_core`), the third
   reachable only because `0018:252-271` spliced it. *If the replay returns two, the splice did
   not apply and the opening-seed lane is unproven — stop and re-apply.*
4. **`assert_client_resolved`'s ACL** — zero app-role EXECUTE grants at the live tip (P-2).
5. **The `document_filings` writer set** — expected **six** before F-A7 (`0027:26-40`), seven
   after α1; each new acquirer proven to take `documents` FOR UPDATE first, with a two-session
   race cell.
6. **The `pg_trigger` census** over `document_filings` — the new Tier-C triggers'
   `tgdeferrable`/`tginitdeferred`, and no existing trigger changing tier (P-1).
7. **The six wake roster/census surfaces** re-derived by census after F-A2 PR-1 (P-5), plus the
   `filing` kind's allowlist rows against Annex A's written list (AM-6).
8. **`_enqueue_invoice_facts_core`'s live tip** (`0090:1125` predicted) and whether any other
   in-flight Wave-F item CoRs the same body — one CoR or strict ordering, never two.
9. **The kind-vocabulary closed worlds** across all four surfaces (AB-5), extend-only, both
   directions, including `classify-unit.test.mjs:151-165`'s disjointness invariant staying
   green.
10. **The family predicate's population** over `clients` ∪ `counterparties` on live rows (P-3,
    re-cut per AM-2) — tuned **before** the wall ships.
