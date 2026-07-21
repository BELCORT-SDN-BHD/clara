# Lane C — Sweep / Rules / Queue substrate + bounded-auto-POST law recon

Grounding brief for Wave A2 (sales-invoice/AR + MyInvois structured_parse + standing rules with bounded auto-POST). FACTS ONLY, as-built, with `file:line` refs. Anything not directly verified is marked **UNVERIFIED**.

Scope of files read: `packages/db/migrations/0011_daily_loop.sql` (4368 lines), `0012_consent_optional_and_rule_proposal.sql`, `0004_governed_fns.sql`; `packages/runtime/workflows/autoDraft.v1.impl.ts`; `apps/dashboard/app/queue/{BatchApprove.tsx,model.ts}`, `app/shared/reviewApi.ts`; `docs/prd/PRD.md`, `docs/architecture/ARCHITECTURE.md`, `docs/plan/{wave-a-daily-loop-contract.md,slice6-thin-e2e-contract.md}`, `docs/PROJECTLOG.md` (ADR-002/003/015/019/022/023/024 + PART 2).

---

## PART 1 — As-built substrate (migrations 0011/0012 + runtime + queue)

### 1.1 The autodraft consumer + `autoDraft_v1` (drafts-only; reserve-first budget; filing-keyed active-attempt registry)

The autodraft path is a **draft-only** lane. Nothing in it approves. The terminal outcomes are `drafted | skipped_lane | noop_existing | failed` — never `approved` (`autoDraft.v1.impl.ts:150-164`; DB check in `settle_autodraft_task` `0011:2648-2649`).

Admission — `clara.admit_autodraft_task(p_filing,p_origin,p_run_id,p_model,p_reserve_tokens)` (`0011:2441`):
- **Filing-keyed active-attempt registry** = `clara.autodraft_attempts` (`0011:699`), `constraint uq_autodraft_attempts_filing unique(filing_id)` (`0011:715`) — at most one live attempt per filing. States: `active | parked | idle` (`0011:709`); `active` requires a bound `task_id`, `reserved_tokens>0`, `usage_date` (`ck_autodraft_attempts_reservation`, `0011:721`).
- **Registry short-circuit runs BEFORE the op-receipt lookup** (`0011:2451-2475`): an existing `active` attempt on a live task → `noop_existing`; a `parked` attempt → `refused_attempts`. A second recheck after taking the filing `FOR UPDATE` lock (`0011:2492-2512`) closes the lock-loser race.
- **Deterministic op-key** = `'autodraft:'||p_filing||':'||p_origin` (`0011:2514`); request hash covers ONLY `{filing,origin}` (`p_run_id`/`p_model` excluded, `0011:2516`) so a replay/refetch dedupes.
- **Lane re-evaluation** — calls `_coding_lane_core` (`0011:2519`); if `lane<>'ready'` → outcome `lane_changed` (writes a `skipped_lane` run item, `0011:2520-2531`).
- **Reserve-first budget** under advisory lock `pg_advisory_xact_lock(202991617, hashtext(firm))` (`0011:2533`): reads `firm_limits.sweep_budget_share` (default 0.60) + `max_concurrent_sweeps` (default 2) (`0011:2534-2538`, cols added `0011:630-635`); concurrency cap check → `refused_budget` (`0011:2543-2554`); sweep origin caps at `daily_token_limit*share`, one_click caps at full `daily_token_limit` (`0011:2555-2566`); on admit, **increments `firm_usage_daily.tokens_used` by the worst-case reserve BEFORE creating the task/registry row** (`0011:2567-2577`).
- `request_autodraft(p_filing)` (`0011:2599`) is the human one-click door (`_human_ctx(role_rank('bookkeeper'))`, `origin='one_click'`, 40000-token reserve, model GUC `clara.autodraft_model` default `openai/gpt-5-mini`).

Lifecycle handoff: `begin_autodraft_task(p_task,p_workflow_run_id)` (`0011:2615`, queued→running, replay-safe) → the frozen `autoDraft_v1` workflow runs the coding model and stops after the FIRST successful `draft_journal_entry` (one coding per task, `impl.ts:220`) → `settle_autodraft_task(p_task,p_outcome,p_tokens,p_entry,p_refusal)` (`0011:2642`).

Settlement (`0011:2642-2707`): re-acquires the budget lock and applies **actual − reserved** as `greatest(0, tokens_used + actual − reserved)` (`0011:2672-2674`) — the refund. `failed` charges 0 tokens (`0011:2668`), increments `attempt_count`, and **parks at attempt ≥2** (`state='parked'`, `0011:2680-2681`) — this is the durable "stop retrying this filing" latch that also demotes the filing out of READY (`_coding_lane_core` adds `parked`, `0011:1524-1527`) and out of `list_autodraft_candidates` (`0011:2780-2781`).

### 1.2 `sweep_runs` / `sweep_run_items` lifecycle (incl. the two hardening fixes)

- `clara.sweep_runs` (`0011:674`): `state text default 'open' check (state in ('open','finalized'))`; carries `expected_count`, `drafted/skipped/refused_count`, `token_reserved/spent`, `acknowledged_by/at`. Terminal CHECK ties `finalized` ⇔ `finalized_at`+`window_ended_at` set (`ck_sweep_runs_terminal`, `0011:691`).
- `clara.sweep_run_items` (`0011:728`): `pk(run_id,filing_id)`; `outcome in ('drafted','skipped_lane','refused_budget','refused_attempts','noop_existing')`; `ck_sweep_run_items_shape` forces `entry_id` present iff `drafted` (`0011:747`).
- Opened by `open_sweep_run(p_firm,p_expected)` (`0011:2421`); every admission/settle writes exactly one item per filing.
- **Noop-item fix (AB-14)** — a run-bound `noop_existing`/`refused_attempts` short-circuit STILL writes its item (`0011:2456-2464`, `2466-2474`, `2496-2512`, `2584-2596`), otherwise `expected_count` is never reached and the run stays `open` forever, accumulating against the concurrent-sweep cap = a firm-wide wedge (comment `0011:2456-2458`).
- **Staleness-finalize fix (AB-14 belt-and-suspenders)** — `reconcile_sweep_runs()` (`0011:2709`) recovers orphaned drafted attempts into items (`0011:2715-2737`), then: a run older than 30 min with items `< expected_count` **and no live bound task** is force-finalized with ACTUAL counts (`0011:2745-2752`; `expected` stays as declared — the receipt honestly shows expected-vs-actual, WA-L6). Finalize sets counts + emits `sweep.run_completed` (`0011:2753-2766`).
- Acknowledgement floor: `acknowledge_sweep_run(p_run,p_op_key)` (`0011:2785`) requires `finalized` (else `CLR29 not_finalized`) and **hard-refuses any agent identity** — `wake_context().credential_id is not null` OR `users.is_agent` → `CLR03 'agent identity cannot acknowledge a sweep'` (`0011:2790-2793`); `_human_ctx(role_rank('bookkeeper'))` floor (`0011:2794`).

### 1.3 `coding_rules` + `rule_sightings` + `rule_decisions` — **WA-D4: rules resolve ACCOUNT-CHOICE only**

WA-D4 verbatim (`wave-a-daily-loop-contract.md:42`):
> **WA-D4 | Rule scope narrowed.** A signed rule resolves ACCOUNT-CHOICE uncertainty only. It never waives the duplicate-bill, amount-exception, currency, consent, high-stakes, attribution, or open-question predicates.

Contract §7 restatement (`wave-a-daily-loop-contract.md:82-84,191-193`):
> A live signed rule for (client, counterparty) badges RULE-backed and satisfies ONLY the account-choice dimension (WA-D4) — every other predicate still binds. … A rule may elevate ONLY the account-choice dimension of a bill's lane (WA-D4); no rule, page, or question lowers an approval gate or authorizes a write.

Tables:
- `clara.coding_rules` (`0011:753`): `rule_type in ('vendor_account')`; `status in ('proposed','live','declined','retired')`; `pinned bool`; `origin in ('proposed','authored')`; `content_hash` (sha256); `signed_by/signed_at`. `ck_coding_rules_terminal` (`0011:781`): **`status='live'` requires `signed_by`+`signed_at` NOT NULL** — a live rule is human-signed by construction. `uq_coding_rules_one_live_vendor` unique(client,counterparty,rule_type) where `status='live'` (`0011:791`).
- `clara.rule_sightings` (`0011:843`): append-only per-(vendor→account→entry) observation; `uq_rule_sightings_mapping unique(client,counterparty,account_code,entry_id)`.
- `clara.rule_decisions` (`0011:864`): records, per entry-revision, which live rule matched at draft — snapshot incl. `content_hash,pinned,account_matched,signed_by,signed_at` (`0011:490-493`), `uq_rule_decisions_entry_revision unique(entry_id,revision_token)`.

**How a live rule acts today (the account-choice-only reality):** in `_draft_entry_core`, when the counterparty fingerprint decision ∈ {registration_match, name_match_unregistered, alias_match}, it looks up the ONE live `vendor_account` rule for that canonical counterparty (`0011:475-480`) and **records a `rule_decision`** with `account_matched` = whether the agent's proposed debit account equals the rule's account (`0011:482-494`). The rule is **advisory metadata on a DRAFT** — it does NOT post, approve, or override; the entry stays `status='draft'`. In `_coding_lane_core`, a live rule adds the `rule_backed` reason (`0011:1528-1532`), and the lane verdict removes ONLY `rule_backed` from the blocking set: `array_remove(v_reasons,'rule_backed')` empty ⇒ `ready` (`0011:1553`). Every other reason (`open_question`, `non_myr`, `multi_doc`, `near_duplicate`, `high_stakes`, `no_consent`, `tier_a_fails`, `amount_exception`, `parked`, `vendor_ambiguous`) still blocks/demotes.

Rule lifecycle writers (all `_human_ctx(role_rank('bookkeeper'))`, all human PostgREST lane):
- `propose_coding_rule` (`0011:2106`) → `origin='authored'`, `status='proposed'`.
- Auto-proposal: `approve_entry` opens a `proposed` rule + a `rule_proposal` open question after **3 congruent approved-unreversed sightings** for a (vendor→account) with no existing proposed/live rule (`0011:3165-3192`, threshold `v_seen=3` at `0011:3173`).
- `sign_coding_rule` (`0011:2144`) → `status='live'`, stamps `signed_by/signed_at`; re-verifies the account is postable (`account_not_postable` CLR27) and enforces one-live uniqueness (`duplicate_live` CLR27).
- `decline_coding_rule` (`0011:2180`), `retire_coding_rule` (`0011:2203`) — **pinned** rules refuse retirement unless the caller supplies the matching vendor-scoped conflict question (`pinned_conflict` CLR27, `0011:2220-2227`; WA-R9 "human pins never silently decay").

### 1.4 `open_questions` + the CLR26 gate + 0012's `rule_proposal` exclusion

- `clara.open_questions` (`0011:796`): `scope_kind in ('document','vendor','client')`; `origin in ('clarify_promotion','rule_proposal','rule_conflict','sweep_refusal','manual')`; `status in ('open','resolved','dismissed')`; `ck_open_questions_scope` ties scope_id to the right FK per scope_kind (`0011:823`).
- The gate predicate `_open_question_blocks(p_client,p_filing,p_counterparty)` (`0011:1438`, replaced `0012:88`) returns in-scope open questions that block.
- **CLR26 approval gate** in `approve_entry` (`0011:3078-3084`): after locking, `select … from _open_question_blocks(...) limit 1` → if found, `raise CLR26` with `detail={question_id,scope}`. Serialization is **structural, no check-then-act window** (AB-13): approve holds the active filing `FOR SHARE` (`0011:2996-2997`), the document-scope question writer takes the SAME filing row `FOR UPDATE` — SHARE-vs-UPDATE conflict serializes them (comment `0011:2988-2995`); vendor+client scopes use exclusive advisories `203005003/203005004` (`0011:3073-3077`).
- **0012(B) exclusion** (`0012:88-108`): `_open_question_blocks` now filters `q.origin<>'rule_proposal'` (`0012:100`) — a rule PROPOSAL is advisory and never gates an approval (WA-R9 "a proposal is a suggestion, not a stop"); `rule_conflict / clarify_promotion / manual / sweep_refusal` still block. ADR-024(a) is the ruling of record. The paired proposed rule stays `proposed`, never auto-applied.

### 1.5 `/queue` batch approve + `approve_routine_entry` — how the DB refuses high-stakes

- `approve_routine_entry(p_entry,p_expected_revision,p_op_key)` (`0011:3211`): `_human_ctx(role_rank('bookkeeper'))`; if `is_high_stakes(p_entry)` → `raise CLR05 detail='{"reason":"routine_refuses_high_stakes"}'` (`0011:3225-3228`); otherwise delegates to `approve_entry(p_entry,p_expected_revision,null,p_op_key)` (`0011:3229`) — the unchanged approval core with a NULL attestation.
- `is_high_stakes(p_entry)` (`0004:72`): true if `is_opening_balance OR is_year_end OR tax_affecting OR sum(debit_cents) >= firms.high_stakes_amount_cents` — structural, amount-derived, non-bypassable.
- WA-D5 (`wave-a-daily-loop-contract.md:43`): batch approve calls a dedicated `approve_routine_entry` that structurally refuses `is_high_stakes` rows — DB-enforced defense-in-depth (probe P6 proved `approve_entry` alone cannot re-refuse them).
- UI mechanism (`apps/dashboard/app/queue/BatchApprove.tsx`): the selection model already excludes high-stakes (`model.ts:96-102`, `isSelectable = row_kind==='draft' && !high_stakes && !!entry_id`); confirm fires **N INDIVIDUAL `approve_routine_entry` RPCs**, each with the entry's own current `revision_token` and a FRESH op_key, sequential + independent so one refusal never poisons the batch (`BatchApprove.tsx:56-77`). `reviewApi.approveRoutineEntry` sends the **human bookkeeper's PostgREST JWT** (`reviewApi.ts:62-63`). Every batch approval is therefore a real, individually-audited human maker/checker act — not an auto-post.

---

## PART 2 — LAW RECON for bounded auto-POST

The Wave A2 shape "a human-signed rule ⇒ matching routine entries POST with no per-entry approval" collides with a wall of **structural** invariants (DB objects, not model discipline). This section collects the rulings verbatim and enumerates the tensions such a design must resolve. **It does not design a solution.**

### 2.1 The rulings that touch posting authority (verbatim)

**PRD.md** (LAW):
- `PRD.md:37`: "**The AI agent (Clara)** … she never silently acts on high-stakes items, and **she can never satisfy a human sign-off.**"
- `PRD.md:122`: "Maker/checker is modelled and enforced on the high-stakes lane (§2); **the agent never satisfies a human sign-off.**"
- `PRD.md:50`: high-stakes lane checker "**must be a different human** from the last human editor — a hard DB gate where the firm has ≥2 eligible staff."
- `PRD.md:162`: "Autonomy lives in the KB rulebook + the structural invariants + the `estimated_risk` gate." (there is no autonomy dial)

**ARCHITECTURE.md §0/§3.2/§3.3/§3.4:**
- §0 `ARCHITECTURE.md:14`: "**Write authorization** — the agent's read path is **structurally read-only** (a role with no EXECUTE on any volatile writer + `default_transaction_read_only`), so no SELECT-wrapped write is possible; role floors and plan→approve live in the DB."
- §3.2 `ARCHITECTURE.md:69`: "The agent's DB role has **no EXECUTE on any volatile/SECURITY-DEFINER writer** … its session sets `default_transaction_read_only = on`. A `select approve_entry(...)` fails at the role level, not a string check."
- §3.3 `ARCHITECTURE.md:76`: "Role floors + plan→approve — `assert_can_*` floors on every writer; approval binds to an expected revision token (fixes GAP0-5); posted lines immutable via trigger (fixes GAP0-4)."
- §3.4 `ARCHITECTURE.md:81`: "**The agent identity can never be a `checker_actor` on its own postings**, and sweep acknowledgements require a bookkeeper+ human. Enforced in the DB, not the UI."

**S6-R6** (`slice6-thin-e2e-contract.md:39-41`) — the exact named deferral this wave reopens:
> **S6-R6 — no auto-approval, ever.** Human approves every draft (**agent-never-signs stays the absence of an entry point — ADR-015**). Successor: **standing rules** (human-signed, deterministic, bounded auto-posting) — named deferral, automation slice.

**WA-R7 / WA-D4 / WA-D5** (`wave-a-daily-loop-contract.md:28,42,43`) — the account-choice narrowing + high-stakes exclusion (quoted in §1.3/§1.5 above).

**Daily-loop contract §11 "Invariants preserved"** (`wave-a-daily-loop-contract.md:282`): "Unchanged and load-bearing: the four structural invariants; **no auto-approve ever**; qualitative uncertainty; …". §12 (`:320`): "no auto-posting" (Wave A out-of-scope confirmation).

**ADR-002** (`PROJECTLOG.md:19`): write authorization = "structural read-only agent role — no EXECUTE on writers + `default_transaction_read_only` — enforced in the DB, not by model/prompt discipline."

**ADR-003** (`PROJECTLOG.md:23`): "Distinct-approver is a HARD DB gate only on the high-stakes lane … routine entries keep the one-person flow; solo firms record a self-approval attestation. **The agent can never satisfy a human sign-off.**"

**ADR-015** (`PROJECTLOG.md:71`) — the load-bearing mechanism:
> The structural read/write-authorization boundary … is realized by **splitting each mutating writer into two entry points that trust exactly one identity source** — a *human* entry (`draft_entry`, `approve_entry`, …) granted only to `clara_authenticated`, trusting `request.jwt.claims` … and a `wake_*` entry granted only to the wake role(s), trusting the wake credential … over a shared, **ungranted** internal `_core`. **There is no wake variant of `approve_entry`/`reverse_entry`: agent-never-signs is the *absence of an entry point*, not a runtime check.**

Migration echo (`0004_governed_fns.sql:12`): "There is NO approve/reverse wake entry — the agent can never sign (structural)." and (`0004:518`): "approve_entry / reverse_entry — HUMAN bookkeeper+ ONLY. No wake variant exists."

**ADR-019(2)** (`PROJECTLOG.md:87`): the Slice-6 agent WRITE floor added a third login `clara_wake_write_login` (single-membership `clara_wake_interactive`, a `wake_draft_entry`→`_draft_entry_core` grant only) — "NO new writer grants, NO wake approve — agent-never-signs stays the absence of an entry point."

### 2.2 The current executor topology (what CAN flip `status='approved'` today)

- `approve_entry(uuid,uuid,text,text)` and `approve_routine_entry(uuid,uuid,text)` are **granted ONLY to `clara_authenticated`** (`0004:777`; `0011:4031,4036`) and reachable via PostgREST RPC (`reviewApi.ts:62`).
- Both resolve identity via `_human_ctx(p_min_rank)` (`0004:299`) = `jwt_sub()` + `jwt_firm()` from `request.jwt.claims`; null actor/firm → `CLR04`. **A real authenticated human JWT is mandatory.**
- The **agent roles hold zero EXECUTE on any approve writer**; the runtime login is not a `clara_authenticated` member (ADR-017, `PROJECTLOG.md:79`). `default_transaction_read_only=on` on the agent session (ARCHITECTURE §3.2).
- The autodraft consumer's only DB writes are draft/settle (`impl.ts:150-164`); it can never approve.
- `acknowledge_sweep_run` proves the pattern extends past posting: even a *receipt acknowledgement* structurally refuses any agent identity (`0011:2790-2793`).

**Net:** today the ONLY thing on Earth that can set an entry `approved` is a human bookkeeper+ JWT hitting `approve_entry`/`approve_routine_entry` via PostgREST. A "rule auto-posts" design must introduce a NON-agent executor without re-opening the agent write path.

### 2.3 The exact invariant tensions a bounded-auto-POST design must resolve

**T1 — WHO/WHAT executes the post, given the agent role cannot write.**
The agent lane is structurally barred (ADR-002/015; no EXECUTE + read-only txn). The existing candidate mechanisms already in the codebase:
- (a) A **DB-internal SECURITY DEFINER** function invoked by a non-agent trigger/consumer (SECURITY DEFINER runs as `clara_fn_owner`, the writer-owner). This is how every writer already mutates. But it must derive an authorized human actor from somewhere (see T2) — it cannot use `_human_ctx` (no JWT in a consumer session).
- (b) A **dedicated login** minted at an operator ceremony, precedent = `clara_wake_write_login` (ADR-019(2)) which today holds ONLY `wake_draft_entry`. Granting it an approve entry point would be a NEW approve grant — directly against ADR-015's "no wake approve."
- (c) The **human PostgREST lane at rule-sign time** — i.e., the human who signs the rule is the authority, and the post is attributed to (and pre-authorized by) that signer. This keeps a human as the authorizing identity but decouples authority-in-time from the per-entry click.
The design must pick one and reconcile it with "no wake approve" being the *absence of an entry point*, not a check.

**T2 — maker/checker attribution: who is `checker_actor` on a rule-posted entry?**
`approve_entry` stamps `checker_actor=c.actor` (`0011:3147`). ADR-003 + ARCHITECTURE §3.4 + PRD:37/122: the agent can NEVER be `checker_actor`; on high-stakes the checker must be a DIFFERENT human than the maker. A rule-posted entry needs a lawful `checker_actor`. Existing durable-authority carriers: `coding_rules.signed_by`/`signed_at` (`0011:767`), and `rule_decisions.snapshot` already persists `signed_by/signed_at` per entry-revision (`0011:490-493`). The tension: is the rule's `signed_by` a valid `checker_actor` for entries it posts (delegated standing authority), and if the maker of the draft equals the rule's signer, does that collapse maker/checker on a routine entry (routine keeps the one-person flow per ADR-003, so possibly OK) — but it must NEVER apply on high-stakes.

**T3 — high-stakes is a hard, structural exclusion.**
`approve_routine_entry` already refuses `is_high_stakes` (`0011:3225-3228`, CLR05); WA-D5 makes this DB-enforced defense-in-depth. Any auto-POST executor MUST route through a path that structurally refuses `is_high_stakes` (opening-balance, year-end, tax-affecting, or amount ≥ `high_stakes_amount_cents`) — bounds enforced by `is_high_stakes` (`0004:72`), never by runtime discipline. `_coding_lane_core` already surfaces `high_stakes` as a lane reason (`0011:1534-1537`) but note it is currently NON-hard (does not force `needs_you`) — so READY-ness alone does NOT today exclude high-stakes; the exclusion lives in `approve_routine_entry`. A design relying on lane=READY must add the high-stakes bound explicitly.

**T4 — WA-D4: a rule resolves ACCOUNT-CHOICE only; it waives NOTHING else.**
Every non-account predicate must still bind on the auto-posted entry: duplicate-bill (`CLR21 duplicate_bill`, `0011:3105-3122`), amount-exception (`CLR21 amount_conflict`, `0011:3097-3100`), currency (`CLR25`, `0011:3088`), consent (`no_consent` lane reason `0011:1520-1523`; egress gate in `claim_document_processing_task` `0011:2333-2345`), attribution (`assert_client_resolved`, called in `_draft_entry_core:350`), and open-question (`CLR26`, `0011:3078-3084`). These predicates ALL currently live INSIDE `approve_entry` and `_coding_lane_core`. So a bounded auto-POST that runs *through* `approve_entry` inherits the wall for free; one that shortcuts around it must re-implement every predicate (a divergence risk). This is the single biggest structural constraint: **the bounds are the approve-core predicates, and they must not be bypassed.**

**T5 — durable human authority: signature as a revision-token analog.**
Two distinct "tokens" already exist and must not be conflated:
- The **rule's** durable authority: `content_hash` (immutable rule identity, `0011:764`) + `signed_by/signed_at` + `pinned`; a live rule is human-signed by construction (`ck_coding_rules_terminal`). `pinned` rules never silently decay — a contradicting approval opens a vendor-scoped conflict question (WA-R9; retire requires the conflict question, `0011:2220`).
- The **entry's** optimistic-concurrency token: `journal_entries.revision_token`, matched against `p_expected_revision` in `approve_entry` (`0011:3007`, `CLR06` on mismatch). A later facts completion ROTATES this token on every open citing draft (`0011:264-266`) and refuses stale approval (`CLR25`). So auto-POST must bind the entry's CURRENT `revision_token` (freshness) AND cite the authorizing rule's `content_hash` (authority). The design question "signature = revision-token analog?" resolves as: the rule's `content_hash`+`signed_by` is the *authority* token, but it does NOT replace the *entry* revision token — both are needed (authority + freshness). `rule_decisions.snapshot` (`0011:864-884`) is the existing join between the two.

**T6 — idempotency / exactly-once (ADR-009).**
A durable executor re-invoked after a commit+crash must be a no-op. Existing floor: `_reserve_op`/`op_receipts` stable op-key replay (`0004:46-68`; ADR-009 `PROJECTLOG.md:47`). An auto-POST needs a deterministic op-key (precedent: `admit_autodraft_task`'s `'autodraft:'||filing||':'||origin`, `0011:2514`).

**T7 — freshness gate posture (ADR-016(2)).**
The books-version staleness gate (`assert_books_current`, `CLR12`) is applied on the AGENT draft lane only, not human approve (ADR-016(2), `PROJECTLOG.md:75`; `_draft_entry_core:334-335,539-541`). A rule-executed post is neither the interactive agent lane nor a live-UI human — the design must DEFINE its freshness posture explicitly rather than inherit one by accident.

**T8 — reversibility + the posted-by-rule audit feed (existing surfaces to reuse).**
- Reverse-not-delete is the correction path (`approve_entry` handles `reversal_of`/`reversed_by`, `0011:3151-3155`; posted lines immutable via trigger, ARCHITECTURE §3.3).
- `journal_entry_revisions` (`0011:886`) is append-only with `actor_kind in ('human','agent','facts')` (`0011:893`) and already carries `rule_decision_id` FK (`0011:898`) — a new `actor_kind` (e.g. `'rule'`) fits the existing shape. **UNVERIFIED** whether adding an actor_kind value is intended; noted as the natural extension point.
- `audit_log` via `_audit` records every writer with `actor`/`on_behalf_of`/`via_wake_kind` (`0004:35`).
- The event spine emits `entry.approved` (`0011:3201`); a rule-posted feed could add a typed event.
- The **sweep-run receipt + bookkeeper acknowledgement** model (`sweep_runs`/`sweep_run_items` + `acknowledge_sweep_run`, WA-R5) is the existing precedent for "a batch of automated actions that a human must later acknowledge" — a posted-by-rule feed likely mirrors it (passive + receipt-acknowledgement floor).

### 2.4 MyInvois-as-`structured_parse` — the AB-3 attribution interaction (Lane-C-relevant)

Wave A2 adds MyInvois UBL XML as a `structured_parse` engine. Note the AB-3 pin already treats `structured_parse` as an **attribution source**: `record_rule_resolution` reads `engine_kind in ('ocr','structured_parse')` and deliberately EXCLUDES `invoice_facts` (`0011:46-48`, comment `0011:38-40`). So a MyInvois XML extraction carrying a `field_path like '%tin%'` region WOULD authorize client attribution (`0011:49-51`) — likely desirable (XML TIN is authoritative) but must be a DELIBERATE decision, not an accident of vocabulary. The HARD pre-MyInvois gate is recorded in PROJECTLOG PART 2 (`PROJECTLOG.md:136`):
> **HARD PRE-MYINVOIS GATE: pin `record_rule_resolution`'s extraction read to `engine_kind in ('ocr','structured_parse')` BEFORE any slice widens the facts vocabulary** (AB-3 — benign today by vocabulary disjointness only).
The pin is IN PLACE (`0011:46-48`); the gate is that adding a new facts vocabulary/engine must re-audit which `field_path` names the attribution matcher's `%tin%`/`%ssm%`/`%account%` LIKE patterns (`0011:49-51`) will now match. AR/sales side note: `ARCHITECTURE.md:85` names `code_and_open_ar(...)` as the intended one-transaction sales-invoice→Trade-Debtors+AR-open-item writer; WA-R1 (`wave-a-daily-loop-contract.md:22`) explicitly deferred it out of Wave A to the sales-invoice wave.

---

## Open questions for design

1. **Executor identity (T1/T2).** Which of the three existing mechanisms carries the post — a DB-internal SECURITY-DEFINER consumer, a dedicated ceremony login, or the human-at-sign-time lane — and what becomes `checker_actor`? Is `coding_rules.signed_by` a lawful standing `checker_actor`, and does it collapse maker/checker when the draft's maker == the rule signer (allowed on routine, forbidden on high-stakes)?
2. **Through-the-core vs around-it (T4).** Does auto-POST call `approve_entry`/`approve_routine_entry` (inheriting the full predicate wall — CLR21/25/26 + attribution + consent) via some non-agent authorized path, or a new writer? If new, how is predicate-parity with `approve_entry` guaranteed against drift (a review/test obligation)?
3. **"no auto-approve ever" reconciliation (S6-R6 / §11).** S6-R6 names standing-rules-with-bounded-auto-posting as the SUCCESSOR, yet the daily-loop contract §11 lists "no auto-approve ever" as UNCHANGED load-bearing. Does Wave A2 file a new ADR that supersedes the "ever" for the bounded case, and how is the boundary phrased so the invariant still means something (e.g. "no *unbounded/agent-initiated* auto-approve; a human-signed deterministic rule may post routine entries under DB bounds")?
4. **What "bounded" is, enumerated as DB objects (T3).** Beyond `is_high_stakes` refusal — is auto-POST gated on lane=READY only, or an explicit allowlist (routine + rule_backed + account_matched + non-high-stakes + all §2.3 predicates green)? Where is each bound a CHECK/fn? (Note `high_stakes` is currently a soft lane reason, `0011:1534-1537` — must be hardened for this path.)
5. **Authority token semantics (T5).** Does the post cite the rule's `content_hash` at post time and refuse if the live rule changed/retired since signing? Must `rule_decisions.account_matched` be true (agent's account == rule's account) for auto-POST eligibility? How does a `pinned`-rule conflict question interact with an in-flight auto-POST?
6. **Freshness posture (T7).** Does a rule-posted entry assert a books-version token, the entry `revision_token` only, or both — and what makes a rule-posted draft "stale" (a rotated token from later facts already refuses via CLR25)?
7. **Receipt + acknowledgement + reversibility (T8).** Does the posted-by-rule feed mirror the sweep-run receipt+`acknowledge` model (a human bookkeeper acknowledges a batch of rule-posts)? New `actor_kind='rule'` on `journal_entry_revisions`? New event type? Confirm reverse-not-delete is the only correction path for a wrongly-auto-posted entry.
8. **Scope of the rule vocabulary.** WA-D4 rules are `rule_type='vendor_account'` (account-choice) only. Does Wave A2's auto-POST rule remain vendor→account, or introduce a new `rule_type` (and does the sales/AR side need a symmetric customer→revenue-account rule)?
9. **MyInvois attribution decision (§2.4).** Confirm whether a MyInvois `structured_parse` TIN region SHOULD authorize client attribution (deliberate), and re-audit the `%tin%/%ssm%/%account%` LIKE matchers against the new XML field vocabulary before it lands.
