# F-A7b — client onboarding: estate survey

> **Estate survey of record for F-A7b**, the JOINT UI+backend design gate ruled by the owner in
> `harness-audit-rulings-2026-08-26.md` **R8(a)** (`:112-121`). Companion to
> **`fa7b-onboarding-design.md`** (the design of record — **it GOVERNS on any disagreement with
> this file**) and **`fa7b-gate-questions.md`** (the owner's must-answer set). Seeded by
> `filing-and-interview-annexes-2.md` **Annex K** (`:411-484`), which this survey now MEASURES
> rather than repeats.
>
> **Read at `main`@`a87cc71`, migration frontier `0136`** (`ls packages/db/migrations/` — highest
> stem `0136_fix_freeform_basis_types.sql`).
>
> **Method, inherited from the F-A2/F-A7a discipline.** Every claim below is a byte read, cited
> `file:line`; **line numbers come from the instrument that prints them** (`grep -n`,
> `sed -n 'X,Yp'`, `Read` with an offset) over this worktree at `a87cc71`. A body's LIVE tip is the
> **last `create or replace` in migration-number order**, never the migration that created it —
> where the two differ this survey names both. **Absence is not evidence** (review law 2): every
> "does not exist" below is stated with the exact search that would have found it, in §4.
>
> **What this survey did NOT do, said plainly.** No rig replay was run in this lane — there was no
> throwaway Postgres. So every claim here is a claim about the **repo's migration text**, not about
> a live catalog. Four bodies in this item's neighbourhood are **spliced by `0038` at apply time**
> (`filing-and-interview-annexes-2.md` §G), so anything the design turns into a CoR must be
> re-derived by replay at PR time. Where this survey could not settle a thing from the bytes it is
> carried into the design as a **PREDICTION**, never an assertion.
>
> **Binding rulings:** R8(a) (the joint gate + the Wave-G scenario) · the 磨合 grill rulings
> **Q2** (rail-first + thread escalation), **Q3** (two-level IA), **Q8** (workbench-first, four new
> part types), **Q9** (per-journey DONE), **Q-C** (the five playbooks —
> `mohe-grill-rulings-2026-08-27.md`:22-36, `:63-72`, `:73-90`, `:102-106`) · the Track-A sitting's
> **TA-P1 C** · **TA-P3 A** · **TA-P4 A** · **TA-P7 C** · **TA-P8 B** · **TA-P11 A** · **TA-P14 A**
> · digest laws **2 · 6 · 22 · 58 · 71 · 72 · 78 · 79**.

---

## 0 · The one-paragraph answer

**The R8(a) chain has six links. Four exist and are load-bearing. The two that do not exist are
links 2 and 6 — "Clara proposes onboarding" and "the document auto-attributes at the close of the
loop" — and they are the two the scenario was written to prove.** Everything between them (the
interview, the client birth, the opening seed, the consent doors) is BUILT, human-only, and
reachable today by a bookkeeper who already knows which client to create. F-A7b's work is
therefore not "build an interview"; it is **to give the existing interview an agent entrance, a
proposal surface, and a return path to the document that triggered it** — and, separately and more
expensively, **to make the interview able to say what to do when the client's materials do not fit
the two-valued opening question it asks today** (finding S3).

---

## 1 · The nine findings that bind the design

**S1 — the chain is four-of-six.** §2 walks it link by link. Links 1, 3, 4 and 5 (carrier,
interview runtime, client birth + Gate O, opening seed) are BUILT and measured; links 2 and 6
(Clara proposes, the auto-attribution close) are ABSENT (§4 absences A1, A7).

**S2 — Gate O does not check that a contributor is HUMAN, and Annex K says it does.**
`commit_client_onboarding` refuses only on `cardinality(p.contributors)=0`
(`0017_wave_b.sql:2788-2791`, `CLR05` / `checker_required`). `contributors` is a bare
`uuid[] not null default '{}'` (`0017_wave_b.sql:1010`) with no membership predicate anywhere in
the gate. `begin_client_onboarding` seeds it with the OPENER —
`values(c.firm,'client',v_client,c.actor,now(),array[c.actor])` (`0017_wave_b.sql:2512-2515`).
**So a shared birth core called with `agent_user_id()` as `c.actor` would seed
`contributors = {clara}`, and Gate O's cardinality refusal would pass on the agent alone.**
Annex K's claim — *"Gate O still needs a human contributor, so a Clara-opened file cannot be
activated without a human having confirmed at least one answer"*
(`filing-and-interview-annexes-2.md:477-478`) — is **true today for a different reason**: the only
writer of `onboarding_plan_items` is the human answer path, so `required_for_commit` items
(`0017_wave_b.sql:2806-2811`) cannot reach `answered` without a human. That is a property of the
ITEM writer, not of Gate O. Naming the wrong wall is how a wall gets removed by a later lane that
believes another one is holding. **Design obligation: §3 gap G2.**

**S3 — the interview's opening question is TWO-VALUED, and four of the five playbooks fit
neither value.** `opening_position` admits exactly `new_first_year | ongoing_carry_down`
(`interview.v2.questions.ts:94`, enum `OPENING_CHOICES`), and its `toItems` writes one of exactly
two item keys: `first_year_zero_opening` (answered) or `carry_down_deferred` (deferred)
(`interview.v2.questions.ts:61-66`). Playbook ① (audited FS + GL) is `ongoing_carry_down` and the
seed is document-tied. Playbooks ② ③ ④ ⑤ are all *nominally* `ongoing_carry_down` and then differ
completely in what can actually be constructed. **The interview asks one question where the
playbooks need a branch.**

**S4 — commit's opening gate has a THIRD arm, and it is the silent one.**
`commit_client_onboarding` activates the client if ANY of: a `finalized` row in
`opening_seed_registry`; `first_year_zero_opening` in `answered|resolved`; **or
`carry_down_deferred` in `deferred|resolved`** (`0017_wave_b.sql:2812-2822`). The third arm is what
lets a brown-field client go `active` **with its opening position uncaptured and nothing on the
screen saying so**. Every playbook except ① lands on it today. This is not a bug — it is the
deferral the interview was designed to allow — but it is **unlabelled**, and F-A7b's UI is the
first surface that could label it.

**S5 — the tie-document world is two kinds wide, and the predecessor's GL is not one of them.**
`create_opening_seed` refuses a tie document whose `documents.document_kind` is not in
`('opening_balance_doc','management_account')` — `CLR02`, `0017_wave_b.sql:2914-2918`. The live
`document_kind` closed world is **20 values** at its live tip
(`0123_f_a7_gamma_egress.sql:2054-2061`) and includes `prior_gl` and `identity_document`, but
`prior_gl` is **not** admissible as a tie. There is no `audited_financial_statements` kind. So
playbook ①'s audited FS files as `opening_balance_doc` or it cannot tie, and the GL that
corroborates it is evidence, never the tie.

**S6 — the opening tie is absolute, and it is what breaks ③④⑤.** `_assert_opening_tie` refuses
unless there is ≥1 `opening_tb_targets` row for the seed, **no target has a null `account_code`**,
**every delta is exactly zero**, and opening-balance-equity nets to zero
(`0017_wave_b.sql:3674-3698`, `CLR31` / `tie_mismatch` and `obe_not_nil`). A client with no trial
balance has no targets, so **no seed can ever be approved for playbooks ③ and ④**. The seed
registry is additionally **one-shot per client** (`CLR31` / `duplicate_seed`,
`0017_wave_b.sql:2929-2932`; the slot is released only by `cancel_opening_seed`,
`0017_wave_b.sql:2943-2945`).

**S7 — the answer route returns `{ok:true}` and nothing else.** `POST /api/interview/answer`
resolves the hook and replies `res.status(200).json({ ok: true })`
(`packages/runtime/src/interviewRoutes.ts:365`). There is **no server-minted submission id, no
park-index echo, no accepted flag**. A second submitter learns nothing from a 200; the only honest
signal is the 409 `not_pending` on a closed park (`interviewRoutes.ts:362`), whose message already
carries the right words. Annex K residual 2 (`filing-and-interview-annexes-2.md:455-460`) is
**measured true**.

**S8 — `readClearsError` does not check `runId`.** Its parameter is
`Pick<InterviewState, "pendingPark" | "terminal">` — the run id is not in scope at all
(`apps/dashboard/app/onboarding/useInterviewRun.ts:88-101`). Annex K residual 1
(`filing-and-interview-annexes-2.md:453-454`) is **measured true**, and still unreachable today
because the hook re-subscribes on `runId` change (`useInterviewRun.ts:169,180`).

**S9 — Annex K's five hot-field keys are not the live segment keys, and item keys are a DB
contract.** Annex K names `legal_name, entity_type, fy_end, opening_stance, coa_seed`
(`filing-and-interview-annexes-2.md:440-441`). The live client inventory has `legal_name`
(`interview.v2.questions.ts:76`), `entity_type` (`:77`), **`fye`** (`:88`), **`opening_position`**
(`:94`) and `coa_seed` (`:92`). Two of the five are misspelled in the seed spec. That matters
because the DOWNSTREAM keys are pinned by a comment that says so:
*"these item_keys are read BY NAME inside `commit_client_onboarding` (0017), so they are a DB
contract. A rename here silently breaks the client-activation gate."*
(`interview.v2.questions.ts:59-60`).

**S10 — the pre-activation document class has no origin to be filed under.**
F-A7a's design promised *"`document_intakes.origin = 'onboarding_interview'` (`0007:104`'s CHECK
extended)"* as the marker for a document handed in before any client or consent exists
(`filing-and-interview-design.md:330-333`), and listed the CHECK among its ALTERs (`:426`). **It
was not extended.** The live column is `origin text not null check (origin in ('chat','documents_tab'))`
(`0007_document_pipeline.sql:104`), paired with `ck_document_intakes_origin`
(`0007:131-133`) which ties `'chat'` to a non-null `chat_session_id` and `'documents_tab'` to a
null one — so a third value needs BOTH constraints re-cut, not one. §4 absence A9. The class is
therefore reachable today only by its other half — a filing-less `documents` row — which
`list_unassigned_documents` already returns (`0011_daily_loop.sql:3943-3965`: every document with
no live `document_filings` row).

---

## 2 · The chain, link by link, measured

### 2.1 Link 1 — the unattributed carrier and the filing verbs · **EXISTS**

**The carrier.** `clara.firm_open_questions` (`0103_f_a7_pi_additive.sql:559-593`) — `firm_id`
not null, `document_id` not null, **no `client_id` column at all** (deliberate, comment
`0103:579-581`), `kind` in a six-value closed world
`('unattributed','collision','contradiction','identity_document','correction_proposed','promotion_proposed')`
(`0103:563-565`), `candidates jsonb` default `'[]'`, `status in ('open','resolved','dismissed')`,
`named_client` (the client the human names when they answer — settled rows only), `receipt_id`.
Forced RLS at `0103:952-953`.

**Its verbs.** `_firm_question_core` (ungranted, `0103:604-635`) · `resolve_firm_question` and
`dismiss_firm_question`, both granted `to clara_authenticated` (`0103:1046-1047`) ·
`confirm_identifier_promotion` / `decline_identifier_promotion` (`0103:1048-1049`).
The **name-family predicate** is live and deterministic: `name_family_token` (`0103:725`),
`name_family_candidates` (`0103:755`), `name_family_is_ambiguous` (`0103:781`).

**The agent's filing limb.** `0126_f_a7_beta_filing_verb.sql` created the role
`clara_wake_filing` at `0126:576-578` — *note this supersedes `filing-and-interview-annexes-2.md:305`
("`clara_wake_filing` is not a role"), which was true at π and is false at the frontier.* Live wake
verbs, all granted `to clara_wake_filing`: `wake_file_document` (`0126:1522`, also to
`clara_wake_interactive`, `0126:2098-2100`) · `wake_open_firm_question` (`0126:1541`) ·
`wake_propose_identifier_promotion` (`0126:1593`) · `wake_reattribute_document` (`0126:1648`) ·
`wake_propose_filing_correction` (`0126:1829`). Ungranted core `_agent_file_document_core`
(`0126:852`). Two deferred constraint triggers on `document_filings` — the congruence trigger
(`0126:1969`) and the receipt-existence trigger (`0126:2034`).

**The `filing` wake kind.** Live `ck_wake_credentials_kind_0011` tip is `0126:594-597`:
`interactive, proactive, autodraft, interactive_client, close_prep, bank_agent, filing` — **seven
values, no `onboarding`**. `filing` is client-less by construction (`0126:602`). The mint gate's
live tip is `0133_g1_wake_engine.sql:713` (G1 re-cut `mint_wake_credential`), same seven kinds.
The `filing` kind's allowlist holds **six** rows (`0126:2073-2079`): `get_document_extract`,
`wake_file_document`, `wake_open_firm_question`, `wake_reattribute_document`,
`wake_propose_filing_correction`, `wake_propose_identifier_promotion`.

**Row 7 is reserved for F-A7b, by name, in the migration's own header.**
`0126:2065-2067` — *"the filing kind's SIX allowlist rows (annexes-1 §A.3, rows 1-6; **row 7,
`wake_begin_client_onboarding`, is F-A7b's** per that annex's own footnote)"*; repeated at
`0126:376-377`. `filing-and-interview-annexes-1.md:79` is the footnote. **This settles a design
question before the gate opens: F-A7b rides the EXISTING `filing` wake kind and adds one allowlist
row. It does not mint a wake kind.**

### 2.2 Link 2 — "Clara proposes onboarding" · **ABSENT**

Nothing in the estate proposes a client. There is no verb, no card, no wake source, no UI. §4
absence A1 states the search. The nearest live thing is `firm_open_questions.kind='unattributed'`
plus `named_client` — i.e. the human answers *"it's for X"* where X is an **existing** client
(`resolve_firm_question`'s `p_client`, `0103:637`). The carrier has no shape for *"it's for a
client you don't have yet."*

### 2.3 Link 3 — the interview runtime · **EXISTS, human-only**

**The routes** (`packages/runtime/src/interviewRoutes.ts`): `POST /api/interview/firm/start`
(`:238`), `POST /api/interview/client/start` (`:260`), `POST /api/interview/answer` (`:301`),
`POST /api/interview/cancel` (`:307`), `GET /api/interview/state` (`:376`).

**Every write door is bookkeeper+ and bound before it acts.** Client start requires the plan to be
in the caller's firm, `state='open'`, and `isBookkeeperPlus(p.role)` (`:273-277`); it is
**idempotent** on a plan already carrying an `interview_run` item (`:279-284`). The answer route
binds the run to the caller via the same `interview_run` item and re-checks bookkeeper+
(`:338-350`), then resumes the hook with `{ kind: "answer", value, answeredBy }` (`:357-358`).
`answeredBy` rides into `update_onboarding_plan.p_answered_by`, DB-revalidated (comment `:297-300`).
`GET /state` returns the plan, its items, a typed `pending_park`, a `terminal`, and a folded
`activity[]` (`:409-412`).

**The workflow.** `packages/runtime/workflows/clientOnboarding.v3.ts` and its v1/v2 predecessors. The
segment driver is `askAndConfirmSegment` (`interview.v1.core.ts:248-275`) and it is exactly
**question → validate → echo → confirm**, persisting nothing on a validator refusal
(`:261-265` — the P19 the seed spec cites, measured verbatim) and re-asking the plain question on
a "no" (`:269-272`).

**The question set.** `CLIENT_SEGMENTS_V2` is **eighteen segments**
(`interview.v2.questions.ts:75-98`): `legal_name` · `entity_type` · the registration segment
(`:78`, built by `registrationSegment`, `interview.v2.segments.ts:79-89`, key `ssm`) · `turnover` ·
`tin` · `msic` · `sst_regime` · `sst_no` · `statutory` · `banks` · `currency` · `fye` ·
the eligibility segment (`:89`) · `framework` (`:90`, `segments.ts:230`) · `accounting_basis`
(`:91`, `segments.ts:355`) · `coa_seed` · `opening_position` · `fa_depreciation` ·
`sample_invoices`. `requiredForCommit: true` on `legal_name`, `entity_type`, `turnover`, `fye`,
`coa_seed`, `opening_position` (`:76,77,80,88,92,94`).

**The registry default is `clientOnboarding_v3`** — `packages/runtime/workflows/registry.ts:90`
(`clientOnboarding: clientOnboarding_v3`, sibling `firmInterview: firmInterview_v3` at `:89`).

**The dashboard, route by route.** The route **/onboarding** is a two-link hub
(`apps/dashboard/app/onboarding/page.tsx:7-19`). **/onboarding/client** drives the client interview
and takes its identity **entirely from the URL** —
`p.get("client_id") / p.get("plan_id") / p.get("run_id")`
(`apps/dashboard/app/onboarding/client/page.tsx:36-39`), written back by `syncUrl` via
`window.history.replaceState` (`:42-50`). With no client/plan yet it mounts `ClientStarter`
(`client/page.tsx:119`), which **calls `begin_client_onboarding` directly** through
`beginClientOnboarding(token, clean)` (`client/ClientStarter.tsx:25-33`) and can resume an existing
`state='open'` plan (`:45,47`). `InterviewPanel.tsx:34-118` is the shared surface — chip, `step N ·
seg` progress, the append-only thread, and either a commit slot, an attach slot, an answer box, or
terminal copy; `thread.ts:1-109` is its pure data model. **The only document side-channel in the
whole interview is `InterviewAttachments`, and it mounts on exactly one segment** —
`park.seg === "sample_invoices"` (`client/page.tsx:138`; the component at
`client/InterviewAttachments.tsx:31-65` uploads into the unassigned pool).
`/clients/plan?client_id=` is the **plan-as-document**: items grouped `must_ask`/`capture`/`todo`
with state and `required_for_commit` (`apps/dashboard/app/clients/plan/page.tsx:224-235`), a
"still to capture" checklist with an inline `resolveOnboardingPlanItem` (`:139-151,237-258`), the
append-only revisions record (`:260-269`), and the `CommitGate` wired to
`commitClientOnboarding` (`:122-137,271-282`).

The API client is `apps/dashboard/app/shared/interviewApi.ts` — `startFirmInterview` (`:312`),
`startClientInterview` (`:321`), `getInterviewState` (`:335`), `answerInterview` (`:450`),
`cancelInterview` (`:485`), plus a pinned `CLIENT_SEG_KEYS` progress list (`:156`) and
`deriveChip` (`:214`).

### 2.4 Link 4 — client birth and Gate O · **EXISTS, admin-floored**

**Birth.** `begin_client_onboarding(p_name, p_op_key)` (`0017_wave_b.sql:2492-2524`) —
`_human_ctx(role_rank('admin'))` (`:2497`); inserts `clients(firm_id,name,status='onboarding')`
(`:2505-2506`), catching `unique_violation` on `uq_clients_firm_name` (`0003_books_core.sql:41`)
as `CLR10` (`:2507-2508`); inserts the plan with `review_maker = c.actor`, `reviewed_at = now()`,
`contributors = array[c.actor]` (`:2512-2515`); snapshots revision 1 (`:2516-2517`); audits and
emits `client.onboarding_started` (`:2518-2521`). `create_client` is a same-arity compatibility
CoR onto the same birth semantics (`0017:2529`).

**`clients.status`** is a **three-value** closed world at its live tip:
`check (status in ('active','archived','onboarding'))`, `clients_status_check_0017`,
`0017_wave_b.sql:658-659` (origin `0003_books_core.sql:38` was two values, superseded).

**`onboarding_plans`** (`0017_wave_b.sql:995-1025+`): `state in ('open','committed','cancelled')`
(`:1000`), `revision_token` + `revision_n` (`:1001-1002`), `review_maker` nullable but paired with
`reviewed_at` by `ck_onboarding_plans_review_maker_0017` (`:1022-1023`), and
**`contributors uuid[] not null default '{}'::uuid[]`** (`:1010`) — **an empty array is a legal
plan state**, which §3 gap G2 turns into the fix.

**Contribution.** `_record_onboarding_contributor(p_plan,p_actor)` (`0017_wave_b.sql:1923-1946`)
refuses a null actor `CLR10` (`:1928-1931`), no-ops if already present (`:1936`), otherwise
appends, bumps the revision and snapshots (`:1937-1945`). It is called by every material maker —
`create_opening_seed` calls it at `0017:2934`.

**Gate O** — `commit_client_onboarding(p_client,p_plan,p_expected_plan_revision,p_op_key,
p_attestation)` (`0017_wave_b.sql:2751-2841`), admin floor (`:2760`). In order: plan CAS on
`revision_token` → `CLR06` / `stale_plan` (`:2780-2785`) · `cardinality(contributors)=0` →
`CLR05` / `checker_required` (`:2788-2791`) · actor ∈ contributors → `CLR05` / `distinct_checker`
if `eligible_checker_count(firm) >= 2`, else `CLR05` / `self_attestation` unless an attestation is
supplied (`:2792-2805`) · any `required_for_commit` item not in `('answered','resolved')` →
`CLR10` (`:2806-2811`) · **the three-armed opening gate** (`:2812-2822`) · then
`clients.status='active'`, a plan revision, and the `onboarding.plan_committed` +
`client.activated` events (`:2823-2836`).

**Disposal.** `cancel_client_onboarding` (`0017_wave_b.sql:2843`) archives; there is no delete
verb (law 6 — §4 absence A6).

### 2.5 Link 5 — the opening seed · **EXISTS, and it is the playbooks' wall**

`create_opening_seed(p_client,p_plan,p_as_of,p_tie_document,p_tie_sha256,p_op_key)`
(`0017_wave_b.sql:2885-2941`), bookkeeper floor (`:2893`). `p_tie_document` and `p_tie_sha256` are
**all-or-nothing** (`:2894-2897`, `CLR10`); the client must be `active|onboarding` (`:2902-2905`);
a tie document must be actively filed to this client at that sha (`_active_document_filing`,
`:2912-2913`) and of kind `opening_balance_doc | management_account` (`:2914-2918`, `CLR02`); the
registry insert is one-shot per client (`:2925-2932`, `CLR31` / `duplicate_seed`).

Two shapes therefore exist and the DB names them: a **document-tied** seed (a tie document, the
runtime's deterministic `POST /api/opening/parse-targets` producing targets —
`apps/dashboard/app/shared/openingApi.ts:420-426`, whose **422 is "unparseable → keyed fallback"**,
comment `:415-417`) and a **keyed** seed (`record_opening_target` line by line,
`openingApi.ts:246-248`, refused on a document seed by `parsed_target_writer_required`,
comment `:244-245`). A keyed seed additionally needs an explicit once-per-seed human attribution:
`record_opening_keyed_resolution` pins `method='human'`, `confidence=1.0` **server-side, no caller
confidence argument** (`openingApi.ts:269-288`).

**Approval is the reserved human act.** `approve_opening_seed` (`0017_wave_b.sql:3825`; the
dashboard call is `openingApi.ts:373-397` with a plan-revision CAS, a tie sha, an entry-revision
map and an optional self-approval attestation) runs `_assert_opening_tie`
(`0017_wave_b.sql:3674-3698`) — see S6 for the four conditions. Digest **law 71** names
*"opening-seed approval"* among the acts reserved to a human by RESERVATION
(`docs/adr/README.md:413-415`).

### 2.6 Link 6 — the consent doors and the auto-attribution close

**The doors are two acts by design and the second is the owner's.** The legal template states it:
the signed original is scanned in as the consent's `evidence_document_id` — *"the column is NOT
NULL — no document, no consent"* — and *"only then may the owner activate each purpose. Two acts,
by design."* (`docs/ops/legal/client-ai-authorization-letter-template.md:110`); the mechanism half
is `:103-106` — *"a signature alone authorises nothing … every dispatch re-checks both records at
the boundary."* The purpose vocabulary is the literal DB value set (`:84-85`), listed at `:87-93`.

**The two acts are two relations and two verbs, measured.** `client_egress_purpose_consents`
(`0020_typed_consent.sql:149-171`) carries **`evidence_document_id uuid NOT NULL`** (`0020:155`)
with a composite FK to `documents(id,firm_id)` (`0020:165-166`), plus `granted_at`/`granted_by`
and a `revoked_at` terminal; `client_egress_purpose_activations` (`0020:194-215`) carries
`activated_at`/`activated_by` and a `deactivated_at` terminal;
`egress_dispatch_authorizations` (`0020:246-277`) is the per-dispatch record.
**Act one** is `grant_client_egress_purpose(p_client,p_purpose,p_evidence_document,p_scope_note,
p_op_key)` — live tip `0123_f_a7_gamma_egress.sql:326-390` — which refuses `CLR28` /
`evidence_mismatch` unless the evidence document is `document_kind='consent_evidence'` **and**
`bytes_verified_at is not null` (`0123:356-361`). **Act two** is
`activate_client_egress_purpose(p_client,p_purpose,p_consent,p_op_key)` — live tip
`0123:391-455` — composite-FK-bound to the exact consent id, so an activation can never float free
of the paper it rests on.

**The live client purpose world is FIVE values**, at its live tip `0123:271-286` (a CHECK recut on
all three relations, re-asserted by 0123's own postcheck at `:2418`, `:2425`, `:2432`):
`('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing')`.
The recut chain, in migration order: `0020:153` (one value) → `0038_wave_c_b_bank.sql:5504` →
`0090_f_a1_walls.sql:704` → `0122_f_a3_egress_purpose_bank_matching.sql:174-187` → `0123:271-286`.
**`document_processing` is LIVE** — so the classification/attribution purpose the legal template
still lists as *"(key not yet minted)"*
(`client-ai-authorization-letter-template.md:93`) has since been minted, and the template's
purpose table owes a line. (Gate question Q-D10.)

**The metering substrate carries both dimensions R8(c) needs.** `llm_usage_events` gained
`client_id uuid` (`0110_f_a9_llm_usage_reshape.sql:194`, composite FK at `:253-254`) and
`triggering_actor uuid` (`0110:197`, FK to `users(id)` at `:255-256`); the original
`0094_f_a1_usage.sql:53-70` had neither.

**The FIRM-narrow family is BUILT** and it already carries this item's moment.
`0123_f_a7_gamma_egress.sql` creates `firm_egress_purpose_consents` (`:642`),
`firm_egress_purpose_activations` (`:670`) and `firm_egress_dispatch_authorizations` (`:697`),
each with a `moment` column CHECKed to **`('attribution','onboarding_interview')`**
(`:655`, `:682`, `:713`), plus the four owner verbs `grant_firm_egress_purpose` (`:799`),
`activate_firm_egress_purpose` (`:855`), `deactivate_firm_egress_purpose` (`:913`),
`revoke_firm_egress_purpose` (`:964`) and `prepare_firm_egress_dispatch` (`:1024`), all four verb
bodies re-checking the moment (`:815`, `:871`, `:929`, `:980`, `:1038`).
**The `onboarding_interview` moment exists in the DB and nothing consumes it.** §4 absence A3.

**The close of the loop does not exist.** Nothing re-visits a `firm_open_questions` row when a
client is born. §4 absence A7.

### 2.7 The surfaces — where onboarding lives on screen today

The chat wire's card catalog is **16 visible part types + 2 status resolvers = 18**
(`apps/dashboard/app/chat/partCatalog.ts:25-142`, `:16`), compile-guarded both ways (`:154-157`).
**None of the 18 is an onboarding part.** The interview is a separate route
(`apps/dashboard/app/onboarding/`) with its own poller and its own error model; Clara does not
speak in it and it does not appear in her transcript. The frontend handoff already records the
consent half as unbuilt: *"Interview BUILT … the purpose-list consent step is UNBUILT"*
(`docs/plan/active/frontend-handoff-2026-08-23.md:295`).

---

## 3 · Where the chain breaks — the gaps F-A7b must fill

| # | gap | what exists | what is missing | evidence |
|---|---|---|---|---|
| **G1** | **Clara cannot open a client file** | `begin_client_onboarding`, admin-floored, human-only | a wake sibling + an extracted ungranted birth core + allowlist row 7 | `0017:2492-2524`; `0126:2065-2067` reserves the row |
| **G2** | **Gate O's human wall is not where Annex K says it is** | `cardinality(contributors)=0` | either a HUMAN predicate on the gate, or a birth core that seeds `contributors='{}'` | `0017:2788-2791`, `:1010`, `:2512-2515` |
| **G3** | **no honest label for an agent-opened, permanent client row** | `cancel_client_onboarding` archives (`0017:2843`) | `opened_by_agent` / `opener_model` columns; the label copy | §4 absence A5 |
| **G4** | **no model normalizer in front of the interview** | the validator skeleton, unchanged | a proposal writer + a batch human confirm; both absent | §4 absence A2 |
| **G5** | **the answer route cannot say "yours did not land"** | `{ok:true}` (`interviewRoutes.ts:365`) + the 409 (`:362`) | a server-minted `submission_id` and its exposure on `GET /state` | S7 |
| **G6** | **the opening question has two values and the playbooks need five** | `opening_position` (`interview.v2.questions.ts:94`) | a materials branch, and the item keys it writes | S3, S4 |
| **G7** | **`carry_down_deferred` activates a client silently** | `0017:2812-2822` arm 3 | a visible deferred-opening state on the client workspace | S4 |
| **G8** | **`onboarding_interview` egress moment is unconsumed** | the whole firm-narrow family (`0123:642-1024`) | a verb that consumes it; the closed-world census that walls its output | §2.6, absence A3 |
| **G9** | **the purpose-list consent step is unbuilt** | the legal template + the client-scoped consent family | the click-through, the signed-original upload, the owner activation surface | `frontend-handoff-2026-08-23.md:295` |
| **G10** | **the loop never closes on the document** | `firm_open_questions.named_client` on settle (`0103:574`) | attribution of the held document to the newborn client | absence A7 |
| **G11** | **the interview has no rail presence** | 18 chat parts, none onboarding (`partCatalog.ts:25-142`) | Q8's part types + the Q2 escalated thread | §2.7 |
| **G12** | **the seed spec's field keys are wrong** | `fye`, `opening_position` live | `fy_end`, `opening_stance` in Annex K | S9 |
| **G13** | **the pre-activation document class has no origin** | `origin in ('chat','documents_tab')` | a third value + its paired CHECK re-cut, or a ruled decision not to have one | S10, absence A9 |
| **G14** | **the interview touches documents on ONE segment** | `sample_invoices` only (`client/page.tsx:138`) | a handover-pack intake the playbooks can hand materials to | absence A10 |

---

## 4 · Absences, each with the method that would have found it

Every line here is a **positive read of the closed world that would have to contain the thing**,
per review law 2. All searches were run over this worktree at `a87cc71`.

- **A1 — no "propose onboarding" anything.**
  `grep -rn "propose_onboarding\|proposes onboarding\|onboarding_proposal" packages/db/migrations packages/runtime apps`
  → no hits outside plan docs. The carrier's `kind` closed world (`0103:563-565`) has no member for
  it, and `resolve_firm_question`'s `p_client` takes an existing client (`0103:664-668`).
- **A2 — `onboarding_answer_proposals`, `wake_propose_onboarding_answers`,
  `confirm_onboarding_answers` do not exist.**
  `grep -rn "wake_begin_client_onboarding\|wake_propose_onboarding_answers\|confirm_onboarding_answers\|onboarding_answer_proposals" packages/db/migrations/*.sql`
  → **two hits, both comments**, `0126:376-377` and `0126:2065-2067`, both naming
  `wake_begin_client_onboarding` as F-A7b's future allowlist row. Zero hits for the other three,
  including in comments.
- **A3 — nothing consumes the `onboarding_interview` egress moment.**
  `grep -rn "onboarding_interview" packages/db/migrations/*.sql` → **10 hits, all inside
  `0123_f_a7_gamma_egress.sql`** (`:21`, `:632`, `:655`, `:682`, `:713`, `:815`, `:871`, `:929`,
  `:980`, `:1038`) — i.e. the CHECKs and the verb guards that *define* the moment, and no caller.
- **A4 — no `onboarding` wake kind.** The live `ck_wake_credentials_kind_0011` tip enumerates
  seven values (`0126:594-597`) and the live `mint_wake_credential` gate the same seven
  (`0133:713`). Every prior version of the constraint was checked in migration order
  (`0011:623`, `0106:1897-1898`, `0120:242-243`, `0121:267-268`).
- **A5 — no `opened_by_agent` / `opener_model`.**
  `grep -rn "opened_by_agent\|opener_model" packages/db/migrations/*.sql` → **zero matches
  anywhere** — no column, no parameter, no comment.
- **A6 — no delete verb on the onboarding objects.**
  `grep -rniE "create (or replace )?function clara\.(delete|purge|drop)_" packages/db/migrations/*.sql`
  → nothing targeting `clients`, `onboarding_plans` or `documents`. The disposal path is
  `cancel_client_onboarding` → archived (`0017:2843`), consistent with digest law 6.
- **A7 — nothing re-attributes a held document when a client is born.** The only writers of
  `document_filings` are the six enumerated at `0027_filings_lock_order.sql:26-40` plus F-A7a's
  `_agent_file_document_core` (`0126:852`); none takes an onboarding plan, a client birth or a
  `firm_open_questions` row as an input.
- **A8 — no onboarding part type on the chat wire.** `PART_CATALOG`'s sixteen keys are enumerated
  at `apps/dashboard/app/chat/partCatalog.ts:25-142`; the compile-time guards at `:154-157` make
  the list total in both directions, so this is a closed-world read, not a scan.
- **A9 — `document_intakes.origin` was never extended.** `grep -rn "ck_document_intakes_origin"`
  and `grep -rn "alter table clara.document_intakes"` over `packages/db/migrations/*.sql` → **zero
  hits outside `0007_document_pipeline.sql`**; the live CHECK is the original two-value form
  (`0007:104`), its paired constraint `0007:131-133`.
- **A10 — the interview reaches a document on ONE segment.** The only mount of
  `InterviewAttachments` is gated `park.seg === "sample_invoices"`
  (`apps/dashboard/app/onboarding/client/page.tsx:138`) — no handover-pack intake, no
  predecessor-FS upload, no bank-statement upload inside the interview.

---

## 5 · Standing texts this survey found STALE or already discharged

Recorded here rather than silently corrected, because both are cited by live documents.

1. **Digest law 79's as-built caveat** (`docs/adr/README.md:468-469`) reads *"the live
   `assert_client_resolved` body still enforces `method in ('human','rule')` and
   `confidence >= 0.95` (`0018_gate_k_domain.sql:57,62`) **until F-A7a recuts it**."* F-A7a's
   α train has since landed — `0124_f_a7_alpha1_file_document_extraction.sql` and
   `0125_f_a7_alpha2_judgement_recut.sql` are on `main` at the frontier. **The caveat needs a
   dated re-true or a positive re-measure**; this survey did not run the replay that would settle
   which, so it is flagged, not corrected. (Design gate question Q-D9.)
2. **`filing-and-interview-annexes-2.md:305`** states *"`clara_wake_filing` is **not a role**"*.
   `0126:576-578` creates it (`create role clara_wake_filing nologin`). True at π, false at the
   frontier.
3. **Annex K residual 3 is ALREADY DISCHARGED, and re-doing it would be a regression.** The seed
   spec asks F-A7b to *"re-cut"* the interview e2e's version pin
   (`filing-and-interview-annexes-2.md:461-463`). The test carries no pin: its header refuses one
   in terms — *"VERSION-AGNOSTIC BY CONSTRUCTION: it starts runs through the HTTP routes, which
   enqueue via the registry — so it drives WHATEVER THE REGISTRY POINTS AT … **Do not
   re-pin a version into this header** — a version named in prose goes stale at the next repoint
   and misleads the next reader about what actually ran"*
   (`packages/runtime/tests/interview-e2e.mjs:7-12`, discipline repeated at `:250-251`). The
   prose "today clientOnboarding_v3 / firmInterview_v3" is informational, asserted nowhere.
   **F-A7b's obligation here is zero, and the design must say so** rather than let a build lane
   satisfy a residual by adding the exact thing the file forbids.
4. **The legal template's purpose table still reads *"(key not yet minted)"*** for document
   classification and attribution (`client-ai-authorization-letter-template.md:93`).
   `document_processing` is live at `0123:271-286`. A client signing today should see the real key.

---

## 6 · Predictions the build's rig replay must confirm

Stated as predictions, not assertions, because this lane had no throwaway Postgres (§0).

- **P-1** — `pg_proc` holds exactly one `begin_client_onboarding` row, live text = `0017:2492-2524`
  verbatim, no `0038` splice. *Method: `pg_get_functiondef` at 0136, byte-compared to the file.*
- **P-2** — one `commit_client_onboarding` row, live text carrying the three-armed opening gate
  (`0017:2812-2822`) unchanged.
- **P-3** — `wake_fn_allowlist` holds **exactly six** `filing` rows (`0126:2073-2079`) and nothing
  else, so row 7 is a genuine addition, not a re-assertion.
- **P-4** — `firm_egress_purpose_activations` holds **zero** live rows at
  `moment='onboarding_interview'` on every firm — A3 confirmed at the data, not only the code.
- **P-5** — `name_family_candidates(BELCORT, 'ROME …')` returns ≥2 over `clients ∪ counterparties`
  and 1 for BEE, on a fixture with those true cardinalities (from
  `filing-and-interview-design.md`'s P-3; F-A7b's client-birth collision guard depends on it).
- **P-6** — **`create_opening_seed` accepts a MID-YEAR `p_as_of`.** Its body (`0017:2885-2941`)
  carries no CHECK tying `p_as_of` to a fiscal-year boundary — the only validation found is the
  null check at `:2894-2897`. **Playbook ⑤'s whole treatment rests on this**
  (`fa7b-gate-questions.md` §1⑤), and a downstream `open_fiscal_year` or `_opening_seed_deltas`
  constraint could still refuse it at a distance; **replay before that branch ships.**
