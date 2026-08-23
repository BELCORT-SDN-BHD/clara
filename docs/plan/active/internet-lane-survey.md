# F-A8 — the internet lane: estate survey v3

> **v3, 2026-08-23 — PR-0 leg 2 folded (the law-28 cross-model pass).** Three of this survey's
> findings are amended in place, each marked **[v3]** — **F6** (the `fetch()` precedent it told
> PR-2 to reuse is credential-bearing), **F7** (an enumerated deny list is the wrong SHAPE, not
> merely absent machinery) and **F13** (the identity wall it called for cannot certify a miss, so
> the architecture must) — and **§5 records what leg 2 measured on a live rig at the 0102
> frontier**, including five estate facts this survey never looked for. No v2 conclusion is
> withdrawn.
>
> **v2, 2026-08-22 — gate 1 folded (record: `internet-lane-gate-record.md`).** Six of this
> survey's claims were wrong at the bytes and are re-cut below, each marked **[v2]**: F1's seed
> dates, F2's proof mechanism, F5's line cites, F6's absence claim, F8's roster measurement, and
> §2's census list (which missed the two censuses that fire hardest). Every conclusion the design
> rests on survived; the evidence under three of them did not.
>
> Companion to `internet-lane-design.md` (v2, the design doc of record) and
> `internet-lane-annexes.md` (v2). Scope: `docs/plan/active/wave-f-contract.md` §F-A8 — the
> `### F-A8 · The internet lane` section at **~line 311** with its **[TA-2026-08-22]** amendment
> block; **[v2]** v1's "lines 118-126" was stale (that range is F-A3's bank-matching prose after
> the ADR-0074 sitting commit inserted clauses above it) — plus the F-A10 retirement clause
> (N/A to this item — F-A8 retires nothing). Binds under ADR-0071 G9 + P-FX (digest law 75), the
> 2026-08-22 Track-A
> sitting rulings **TA-P2** (numbers without documents), **TA-P3** (egress governance),
> **TA-P4** (receipts), **TA-P5** (calendar wake), **TA-P8** (identity/learning-loop), cited
> by id throughout. **Discipline borrowed from the F-A2 model** (`f-a2-agentic-posting-design.md`
> + its annexes): every claim below is at the bytes, file:line; every claim this survey cannot
> settle from source alone is named as a PREDICTION for the build's own rig replay to confirm,
> never asserted as measured.
>
> **The shape of this survey differs from F-A2's on purpose.** F-A2 retrofitted walls onto a
> huge, already-live posting engine — its findings are about what an existing body actually
> does. F-A8 builds a genuinely NEW capability into an estate that mostly does not have it yet.
> So most findings below are **"X does not exist" or "X exists but does not meet the new
> ruling's bar"**, not "X's live behaviour is Y" — and each is still cited at the bytes, because
> "does not exist" is only honest when it is a search result, not an assumption (review law 2).

---

## 1 · What already exists (the half-built precedent)

**F1 — `clara.sst_threshold_schedule` is ALREADY LIVE (0016:237-244) and is the ONLY Tier-1
policy table that exists today**, but it does not meet TA-P2's bar. Shape: `(service_group,
threshold_cents, effective_from, effective_to, source_note)`, PK `(service_group,
effective_from)` — **[v2] and NO surrogate `id`, which is why the design's supersede ALTER must
add one** (design §3.1, gate blocker GB-3). Seeded with two rows by the migration itself
(**[v2]** `0016:245-248`; **both** rows are `('G'|'I', 50000000, effective_from '2018-09-01',
effective_to null)` — the date `2024-02-26` appears only inside the group-I row's free-text
`source_note` ("real-estate brokerage in scope from 2024-02-26"), never as a second
`effective_from`. v1 read it as two effective dates; there is **no live example anywhere of a
date-boundary transition on this table**, which is exactly why the design's own C.4d/C.5h cells
have to build one). **It is migration-only by a
standing structural assertion**, not a convention: `0016:5216-5228`'s tail DO-block scans
`pg_proc`/`aclexplode` for any function granted to `clara_authenticated`, `clara_agent_ro`,
`clara_runtime`, `clara_runtime_login` or either wake role whose body writes the table, and
raises CLR10 (`'0016 a granted fn writes sst_threshold_schedule (must be migration-only)'`) if
one is found. **This is the exact assertion TA-P2/A+ says F-A8 "relaxes into a governed
verb"** — it must be relaxed by NAME (the assertion's own wording changes to admit exactly the
new approve verb), never silently routed around; a routed-around assertion that still reads
"must be migration-only" in its own error text would be lying about what the schema now allows
(digest law 22).

**F2 — the table carries NO supersede/revision/actor columns.** `effective_to` is a plain
nullable date; there is no `id`, no `superseded_by`, no `superseded_at`, no `recorded_by`, no
`basis`. **[v2] The proof mechanism v1 claimed is withdrawn.** "The tail assertion proves this at
every migration since" is false: `0016:5216-5230` is a **one-time apply-time DO block** that
queries live `pg_proc`/`pg_roles` state once, at 0016's own apply, and mechanically proves
nothing about migrations 0017-0102. The *conclusion* survives on a different instrument — a
repo-wide grep for INSERT/UPDATE/DELETE against the table across all migrations matches only
`0016:245` and the assertion's own text — and on the STANDING test v1 missed (§2). So the ALTER
ADD COLUMN (nullable) is additive against a **grep-verified** empty write history, and **PR-3's
rig replay re-derives the zero-writer population on the live catalog before relying on it**
(Annex G.3) rather than trusting either source read.

**F3 — no SST *rate* table exists anywhere.** `grep` for `sst_rate_schedule` / `clara.sst_rate`
as a table name returns nothing. The only `sst_rate_bp` in the schema is a **per-line-item
fact** stamped from one invoice (`0017:1138,1164-1166,3465-3469,4129-4133` — `journal_items`
and `journal_item_revisions` columns), not a firm-wide statutory table. **F-A8-OQ-5 is ruled
correctly against this fact**: F-A8 has nothing to "attach fetching to" here — the table is
F-T1's to design (its shape must serve SST-02's real per-service-group rate lookup), and
F-A8's own design (§3 of the design doc) states the interface contract F-T1's table must
expose, not the table itself.

**F4 — no `fx_rates` table exists.** ADR-0071's P-FX names it "the future substrate" and
nothing has claimed it. **F-A8 is the first and only claimant** in Wave F (the contract's own
words at `wave-f-contract.md:120`: "`fx_rates` (BNM; the P-FX principle's future
substrate)").

**F5 — `clara.client_facts` (**[v2]** `0055:386-420`) is the proven immutable+supersede idiom,
and it is the right thing to copy, not `sst_threshold_schedule`'s bare `effective_to`.** Shape: a
uuid PK (`0055:387`), a deferrable self-FK `superseded_by uuid references clara.client_facts(id)
deferrable initially deferred`, a paired `superseded_at timestamptz`, a
`ck_..._supersession_paired check ((superseded_by is null) = (superseded_at is null))`, a
WHO/BASIS/WHEN trio (`recorded_by`/`basis`/`basis_kind`/`recorded_at`), and one lawful UPDATE
enforced by `_tf_client_facts_supersede_only()` (**[v2]** `0055:428`; line 424 is
`ix_client_facts_client`): the one-time supersession stamp, nothing else, ever. A partial unique
index (`uq_client_fact_live`) carries "the current row" per key. **This is TA-P2's
"revision/superseded_by/actor" in the codebase's own words** — `recorded_by` is the actor, the FK
chain depth is the revision (ODQ-6). **[v2] The idiom transfers only because a uuid PK exists to
reference** — copying it onto `sst_threshold_schedule` without first adding a surrogate `id` is a
DDL that cannot apply (F1, gate blocker GB-3). The estate's other composite-PK policy table,
F-A9's planned `llm_price_table` (`metering-design.md` §3.5), sidesteps the problem by carrying
no self-FK at all; F-A8 needs one, so it adds the key.

**F6 — [v2] no WEB-READ TOOL exists anywhere in `packages/runtime` — but outbound HTTP does.**
v1 said "no outbound HTTP/web-fetch capability exists anywhere", which is a narrow grep's
zero-hits reported as a general absence (the same wrong-instrument shape as F2 and §2).
`packages/runtime/lib/storage.mjs:88,122,217,235,307,337` and
`lib/reconciler-render.mjs:128,158` all call `fetch()`, and `reconciler-render.mjs:126` carries a
real timeout convention (`AbortSignal.timeout(FLY_TIMEOUT_MS)`). ~~**PR-2 reuses those client
conventions rather than inventing a second HTTP idiom**~~ **[v3, law-28 E-3, re-read at the bytes
2026-08-23: `storage.mjs:88-90` attaches `authorization: Bearer` and `apikey` to its `fetch()`.
Only the TIMEOUT convention transfers — PR-2 builds a NEW sterile GET-only `web-read` module
under `packages/runtime/lib/`, with a fixed header allowlist (IL-D22).]** What is genuinely absent
is a *model-callable web-read tool* and the guard around it:
`grep -rniE "fetch.*tool|web_read|web_search|WebFetch|undici|node-fetch"` over
`packages/runtime/lib` and the workflow trees returns zero hits outside build output.
**`docs/ARCHITECTURE.md:143` already narrates the tool as if it exists** — *"the WEB
READ tool exists under ADR-0071/G9's two-tier discipline"* — a promise written ahead of the
bytes, the same shape as the freeform-read gap the Wave-F vision audit found for F-A6
(`docs/plan/research/wave-f/vision-alignment-audit.md:241,340`: the table and grant existed
79 migrations before any code wrote them). **Read ARCHITECTURE §4.1's sentence as a target,
not a status.**

**F7 — no non-public-address deny list (SSRF guard) exists anywhere.**
`grep -rniE "rfc1918|169\.254|metadata\.google|is_private_ip|ssrf"` over the runtime and
migrations returns zero hits. TA-P3's "this doesn't count as a domain whitelist" is a
**forward-looking framing ruling**, not a confirmation of live machinery — the deny list is
genuinely new work, and it is a **runtime-side** control (DNS/IP resolution is not something
Postgres does), not a DB wall. **[v3, law-28 N-2/N-3/N-5: the SHAPE was also wrong. An enumerated
deny list checked once before connect loses to rebinding, to address forms nobody enumerated
(IPv4-mapped IPv6, `2130706433`, CGNAT 100.64.0.0/10, `fc00::/7`) and to a redirect. It inverts to
allow-only-globally-routable-unicast, per hop, HTTPS-only, connecting to a pinned address and
asserting the socket's real peer afterwards (IL-D21).]**

**F8 — the wake kind `'proactive'` has existed since the very first migration (0002:230-232)
with a ZERO population of live CREDENTIALS.** **[v2] The roster measurement in v1 was wrong at
the bytes and is re-derived here from all four migrations that mutate the table**, not from one
seed statement: `0002:553-559` seeds five rows — four `'interactive'`
(`wake_draft_entry`, `wake_record_client_resolution`, `wake_ingest_document`,
`wake_record_notification`) **and one `('proactive','wake_record_notification')`** — then
`0007:1100` deletes one interactive row (`wake_ingest_document`), `0011:3903-3910` adds
`wake_open_question`, and `0078:191` adds four more. **Today: ONE `'proactive'` row and EIGHT
`'interactive'` rows**, not zero and one. (The design never depended on the error — its own
§3.1 correctly says "add a row", and it names `wake_record_notification` as already bound to
`'proactive'`.) **The zero-population claim is about minted CREDENTIALS, and that half is
verified true:** the only minters are `pools.mjs:308,330` (`'interactive'`) and the autoDraft
family (`'autodraft'`); no code path anywhere calls
`clara.mint_wake_credential('proactive', ...)`. The one function ever granted to
`clara_wake_proactive` for a *judgement* act,
`wake_record_notification` (`0004:673-696`), has its `'proactive'`-only branch (single-use
credential consumption, `:674-679`) live in the schema but never exercised end-to-end by any
caller. **Law 31's shape applies to a wake KIND, not just a wall**: a kind that has never
carried a live credential is a door nobody has opened, not a door proven safe. F-A8, if it is
the first Wave-F item to actually mint a `'proactive'` credential, is the FIRST real exercise
of this kind — a fact the build's battery must treat as its own finding, not assume away.

**F9 — [v2] F-A8 does not need a new wake KIND — and it must mint its own credential, because no
sibling will.** `'proactive'` already exists and already forbids a client binding
(`ck_wake_credentials_client_0011`, `0011:625-628`: `wake_kind in ('interactive','proactive') and
client_id is null` — **cite discipline: live as of `0011:625-628`, additively extended by F-A2's
D34, whose new enumeration row leaves these three disjuncts byte-identical**,
`f-a2-annexes-2-mechanics.md:442`), and Tier-1 tables are firm-independent (F1 has no `firm_id`).
**But v1's conclusion — "F-A8 is a CONSUMER of whichever runtime scheduler eventually mints
`'proactive'` on a clock" — is wrong at the bytes:** F-A4 mints its own credential kind
`close_prep` through a sibling minter, leaves `mint_wake_credential` byte-unchanged, grants
**zero** EXECUTE to `clara_wake_proactive`, and extends `ck_agent_tasks_kind_0011` with its own
task kind (`close-key-1-annexes-1-mechanics.md:259,268,273`); F-A5 mints `bank_agent`; F-A2 mints
`interactive_client`. **Nobody is going to populate `'proactive'` for F-A8.** It does not need
them to: `mint_wake_credential`'s live tip (`0011:1156-1195`, granted to `clara_runtime`) accepts
`'proactive'` today with a firm and a NULL client, so F-A8's own scheduled job mints its own.
**The real shared gap is the EXECUTION path:** `kind='wake'` `agent_tasks` are born `held`
(`0011:1230`) and the only legal transition is `held → cancelled` (`0011:1271`) — no clocked wake
can run at all today, and both routes out (widen the transition set, or mint a task kind) CoR the
kind arms of `_tf_agent_task_insert` (`0011:1222-1243`) and `_tf_agent_task_update`
(`0011:1248-1285`). That is F-A4's problem too; it is owner item OI-2 (design §6.1).

**F10 — `clara.llm_usage_events` (0094:53-70) cannot record a Tier-1/Tier-2 call today.** Both
`document_id` and `task_id` are `not null` with FKs to `clara.documents` /
`clara.document_processing_tasks`; a policy-table fetch or a web read has neither — and
`firm_id` is `not null` too (`0094:55`), which TA-P13's specified widening does not touch, so a
firm-independent fetch still could not be metered even after it. **TA-P13 assigns the one ledger
to F-A9**, whose design already builds the widening (`metering-design.md`). **[v2] The widening
therefore leaves F-A8's list entirely** (gate width ruling): F-A8 writes no metering row and
records an honest gap until F-A9's door opens — never a fabricated `document_id`/`task_id`, never
an invented `firm_id`. The `firm_id` question is F-A9's to rule (owner item OI-3). *(The gate
attack that this ALTER would force a recut of `record_llm_usage_event`'s frozen-body callers was
**REFUTED**: a plain ALTER is a no-op for the existing 10-arg body. The severance rests on
ownership and blast radius, not on that claim.)*

**F11 — `entry_evidence.document_id` is `not null`, FK'd to `clara.documents`
(0009:883-905/899-900).** A web fetch or a policy-table row produces no `documents` row, so
**"a web page can never be a posting's source document" (law 75) is already true by
construction** — no new wall is needed and none should be built; this is confirmed as a named
non-goal in the design doc, not a gap to close.

**F12 — `clara.wiki_page_citations.source_kind` (0017:891-901) is a closed FIVE-member enum**
(`document`, `entry`, `counterparty`, `human_note`, `prior_gl_line`) with **no `'web'`
member.** The door to cite a **web source** into a wiki page does not exist, and F-A8 does not
build it (a named non-goal, design §8). **[v2] But this proves less than v1 said it did, and the
ruling it invoked says the opposite.** TA-P8/**F-A8-M4 is ruled B**: web-found identifiers ARE
recorded in the knowledge layer **as CONTEXT**, never as exact-match keys, and the promotion door
is **granted** (`docs/adr/0074-the-track-a-sitting.md` §TA-P8). The absent `'web'` enum member
closes only the citation *provenance* channel; `wiki_pages` already carries
`fk_wiki_pages_counterparty` and `source_kind` already admits `'counterparty'`/`'human_note'`
(`0017:843-848,915-921`), so the KB body is not walled shut by this CHECK at all. F-A8 v1 still
writes nothing to the KB — as a **scope** choice with F-A7 named as the owner of the identity
learning loop, **not** as something TA-P8 forbids (design §1; owner item OI-1).

**F13 — egress governance (ADR-011, digest laws 57-58, `packages/runtime/lib/egress.mjs`)
governs data LEAVING Clara to a vendor.** Tier-1 fetch is the opposite direction (public web →
Clara) and has no client content to carry. **[v2] Tier 2 is NOT out of scope "by construction",
and v1's sentence saying so was the gate's blocker GB-5.** `wake_web_search(p_query text, …)` is
a model-composed free-text field going to a third-party vendor; nothing in a parameter list stops
`p_query = '<a client's name> SSM registration number'`. **F-A8-OQ-2 = A is a BEHAVIOURAL policy**
("v1 may only ask general/regulatory questions"), not a claim that a structural wall exists —
the agenda's own F-A8-M1 entry is honest about the same distinction ("prompt-level, not
structural, per G7's precedent"). The construction has to be **built**: a closed `p_purpose`
world plus `_web_text_is_client_free`, a refusal predicate over the model-authored text, both in
`_web_read_core` (design §3.2). With that wall in place TA-P3/A's "identity-free lookups are not
disclosures" holds and no named egress purpose is needed — *because of* the wall, not beside it.
If a future item widens Tier 2 to carry client identity, THAT item re-opens TA-P3's
egress-purpose framework under a new verb, never a widened parameter here. **[v3, law-28 E-1/E-2:
two corrections. (a) The predicate must read the canonical `p_url` too — v2 inspected only
`p_query`/`p_rationale`, so a collection URL carrying a client name and TIN walked past the wall
(IL-D29). (b) A predicate that refuses on a match certifies NOTHING on a miss, so "identity-free"
has to be made true by the architecture, not by the wall: a closed server-owned query taxonomy or
a named TA-P3 purpose — the owner's call, OQ-A. Until it is ruled, free-text research does not
ship (IL-D30).]**

**F14 — `clara.role_rank` (0002) ranks `owner` highest (3), above `admin`(2)/`bookkeeper`(1)/
`viewer`(0); `clara.firm_capability_grants` (0056:1060-1072) is a PER-HUMAN grant table for
exactly two close-only capabilities (`close_and_attest`, `reopen`), not a per-firm
agent-capability toggle.** There is no table anywhere that turns an agent capability on/off
per firm. **TA-P1's "capabilities default-on, no per-firm dial" is not merely a ruling to
honour going forward — there is no existing mechanism to extend even if someone wanted a
dial**, which is itself worth recording: the fail-closed cost of TA-P1's default (any firm
gets Tier-1/Tier-2 the moment the grant lands) is real precisely because there is no cheaper
partial rollout path sitting unused in the schema.

**F15 — only ONE real firm exists (BELCORT; constraint 13), and Tier-1 tables are
firm-independent** (F1: no `firm_id` column). **A genuinely open, unprecedented question
follows**: when the audited owner one-click door fires, WHICH firm's owner has standing over a
fact that is not that firm's fact at all? Nothing in the schema answers this — every existing
owner-gated verb (`close_and_attest`, `reopen`, statutory wording) is scoped to a `firm_id` the
verb already has in hand. Carried as ODQ-1 in the design doc; not resolvable from the estate
alone.

---

## 2 · Closed-world censuses this item touches

**None of F-A8's own artifacts are CoRs of a live body** (§3 of this survey; contrast F-A2,
which CoR'd ten). The censuses that DO need extending, none of them by rewriting a live
function:

**[v2] The full list, with the two the gate found missing, now lives in
`internet-lane-annexes.md` Annex F** — it is a build checklist, and it belongs next to the
battery that proves it. Summarised here:

- **[v2] The T17 exact-set grant matrix (`packages/db/tests/rig-meta.mjs:1014-1060`, rosters at
  `:811-916`) — the largest closed-world census in the estate, and v1 omitted it entirely.**
  Every one of F-A8's six granted verbs produces
  `<role> EXECUTE clara.<fn>: expected false, got true` until `ALLOWED` is extended by name.
  `f-a2-annexes-1-estate.md:135,226` lists `rig-meta.mjs` under its own "Helper/roster surgery
  (10)" for exactly this reason. `definerHygieneFailures` (`:1062-1074`) and T18's governed-RLS
  sweep (`:1076-1117`) ride the same file. *(v1's line about a "T17-style" allowlist pin
  mislabelled a different, smaller census: the real T17 is this EXECUTE matrix.)*
- **The `wake_fn_allowlist` roster.** F-A8 adds **three** rows under the already-existing
  `'proactive'` and `'interactive'` kinds — no CHECK widening. **[v2]** The exhaustive-count
  risk v1 flagged as "a PREDICTION, not a measurement" is now measured:
  `wave-a-shape.test.mjs:191-206` pins `autodraft` at exactly six (F-A8 adds none there, so it is
  safe); the binding census is T17 above. The roster is extended, never re-seeded (F8).
- **[v2] `packages/db/tests/a21-watch.test.mjs:98-132` — a STANDING estate-suite test, which v1
  said did not exist.** v1 searched `packages/db/deploy/*-postverify.sql`; the instrument
  production actually uses is `packages/db/tests/`, which the estate suite (migrate → seed →
  every package's tests) runs on **every code-touching PR**. Its P1 test independently re-derives
  the same "no granted fn writes `sst_threshold_schedule`" invariant AND pins both seed rows'
  `effective_to IS NULL` — which the design's commit core will close. **It is re-cut in PR-3**
  (Annex F, cell C.5g).
- **The 0016 tail assertion itself (`0016:5216-5230`).** A ONE-TIME apply-time DO block, not a
  standing test (that is `a21-watch` above — v1 conflated the two). Its WORDING is a public claim
  about the schema (`'0016 a granted fn writes sst_threshold_schedule (must be migration-only)'`)
  that becomes false the day the approve verb ships; truing it is digest law 22, not clean-up.
  **[v2] The truing v1 proposed — "no DML from any OTHER granted function" — inherits the
  assertion's own blind spot and could never refuse:** the scan keys on a function that is
  *directly granted* and whose *own prosrc* holds the DML text, and F-A8 puts the DML in an
  UNGRANTED core called by granted wrappers. The correct truing scans the **reachable closure**
  (granted wrappers plus the ungranted `clara.` functions their prosrc names, transitively) and
  asserts exactly one named writer — with an adversarial twin proving the scan can fail (C.5e).
- **`clara.documents`/`entry_evidence` provenance closed-world (F11).** No census to re-cut —
  the wall already excludes web/policy sources; F-A8 must confirm by NOT adding a path, and
  the battery carries a negative-control cell proving a policy-draft/web-citation id cannot
  satisfy `entry_evidence.document_id`'s FK (Annex C, C.9a), **[v2]** plus C.9c's prosrc scan over
  F-A8's own surface with an adversarial twin.
- **`wiki_page_citations.source_kind` (F12).** Same shape — negative controls C.9b/C.9c, not a
  migration.

---

## 3 · Artifacts this item is expected to create (named here, designed in full in §3 of the
design doc)

Pure additions; **zero CoRs** predicted (PR-1's own rig replay must confirm this, per the
F-A2 lesson that a body's live tip is found by replay, never assumed from a migration number):

| PR | Artifact | Kind | Precedent copied |
|---|---|---|---|
| PR-1 | `clara.fx_rates` | new table | `client_facts`' supersede idiom (F5) |
| PR-1 | `clara.policy_drafts` | new table (staging) | none — genuinely new shape |
| PR-1 | **[v2] `clara.tier1_fetch_attempts`** | new table (health log) | none — the contract's own "fetch-attempt/health relation" |
| PR-1 | `_policy_extract_quoted_value` / `_policy_sources_agree` / `_policy_value_plausible` | **[v2]** three versioned total predicates | C1's "the model never grades its own agreement" (law 72) |
| PR-1 | `clara.wake_submit_policy_draft` / `_policy_draft_submit_core` | wrapper/core pair | 0077/0078 idiom |
| PR-1 | `clara.decide_policy_draft` / `clara.override_policy_draft` / `_policy_draft_commit_core` | human verb pair, shared delegate | `_approve_entry_core`'s "one core, two callers" (F-A2 §3.1) |
| PR-1 | `wake_fn_allowlist` **[v2] `('proactive','wake_submit_policy_draft')`** | INSERT | `0002:553-559` + `0078:191` |
| PR-3 | **[v2]** `sst_threshold_schedule` ALTER: `id` **+ `unique (id)`**, `superseded_by`, `superseded_at`, the paired CHECK, `recorded_by`, `basis`, `basis_kind`, the governed-origin conjunct | ALTER ADD COLUMN, all nullable | `client_facts` (F5) — **only after the surrogate key exists** |
| PR-4 | `clara.web_fetch_receipts` | new table | **[v2]** F-A2's **PROPOSED** `entry_post_receipts` (`f-a2-agentic-posting-design.md:216`) — **it exists in no migration**; v1's "(0037/F-A2)" attached an unbuilt proposal to an applied number |
| PR-4 | `clara.web_fetch_citations` | new table | `wiki_page_citations` (`0017:891-901`) shape, NOT its enum |
| PR-4 | `clara.wake_web_fetch` / `clara.wake_web_search` / `_web_read_core` / `_web_text_is_client_free` | wrapper ×2, shared core, **[v2]** + the identity refusal predicate | 0077/0078 idiom |
| PR-4 | `wake_fn_allowlist` **[v2] `('interactive','wake_web_fetch')`, `('interactive','wake_web_search')`** | INSERT | same |
| PR-5 | four DEFINER typed readers (bookkeeper+) | read surface | `get_close_plan` (`0064:154,280-285,312`) |
| **[v3] PR-1** | `clara.fetch_artifacts` · `tier1_endpoints` · `web_attempts` + `web_attempt_events` (**replacing** `tier1_fetch_attempts`) · `policy_fact_spans` · `policy_approval_cards` · `record_fetch_artifact` | six tables + one privileged writer | `report_artifacts` (digest/path/chain habits) + `documents` (`0007:28`) — see §5 F16 |
| **[v3] PR-1** | `clara.evaluate_policy_source_value_v1` + its `evaluator_versions` row and `frozen-evaluators.json` entry | **registered frozen evaluator** | the freeze family, §5 F17 |
| **[v3] PR-2** | the `web-read` module under `packages/runtime/lib/` — sterile GET-only client, per-hop policy, versioned canonicalizers | new runtime module | **NOT** `storage.mjs`'s request profile (F6) |

**[v2] `clara.llm_usage_events` is NO LONGER ON THIS LIST** — the widening is F-A9's entirely
(F10, gate width ruling). v1 carried it as a jointly-owned ALTER; it is severed out.

**No D1 write-quiesce window is predicted for F-A8's own artifacts** — every row above is an ADD
(table, column, allowlist row, function) against new ground or against a table with a
grep-verified zero-writer population (F2). **PR-3's rig replay re-derives that population on the
live catalog before the ALTER relies on it** (Annex G.3); the `add column id … default
gen_random_uuid()` rewrites a two-row table, which the replay states rather than assumes.

---

## 4 · Risks this survey found (carried into design §8)

- **R1 — the "two independent official sources" check has no named endpoints yet.** Per
  `official-source-fetch this survey did not resolve` (R-B's own listing:
  track-a-sitting-agenda.md:853-855, "每张 Tier-1 表的确切官方端点"), this is explicitly a
  design-stage research question, not something the contract or the rulings settle. Carried as
  ODQ-2.
- **R2 — a firm-independent fact needs a firm-scoped approver, and nothing in the schema names
  one.** F15 above; carried as ODQ-1.
- **R3 — [v2] re-cut and sharpened.** F-A8 is the first real exercise of `'proactive'`, and the
  risk is stronger than "zero prior population": **no sibling item will ever populate this kind**
  — F-A4 mints `close_prep`, F-A5 `bank_agent`, F-A2 `interactive_client` (F9). So F-A8 mints its
  own credential, and its battery must exercise the FULL proactive path on **its own verb**
  (mint → consume → single-use re-check → replay-does-not-consume), never through
  `wake_record_notification` — the single-use branch (`0004:674-678`) is that other function's,
  and copying it into the new core is a build obligation, not an inherited property
  (Annex D IL-D12, cell C.1c).
- **R4 — [v2] withdrawn as a joint ALTER, replaced by an accepted gap.** `llm_usage_events` is
  F-A9's entirely (F10). F-A8 writes no metering row and records the gap honestly; the residual
  question — `firm_id not null` for a firm-independent call — is F-A9's to rule (OI-3).
- **[v2] R5 — `_web_text_is_client_free` is one-directional.** It refuses on a match against the
  firm's own client names and identifiers; a miss certifies nothing. It is a wall that CAN
  refuse, which is what v1's "structural absence" claim was not (design §3.2, cell C.7e).
- **[v2] R6 — the Tier-2 search VENDOR is unnamed**, and it is one of the agenda's own five
  F-A8 design-layer questions (R-B, `track-a-sitting-agenda.md:855`) that v1's register never
  picked up. Carried as ODQ-7, with a fail-closed default: `wake_web_search` does not ship until
  a vendor is named; `wake_web_fetch` may ship alone.
- **[v2] R7 — no clocked wake can execute today.** `kind='wake'` `agent_tasks` are born `held`
  and may only be cancelled (F9). Shared with F-A4; owner item OI-2; F-A8's fail-closed default
  is a plain runtime job with no `agent_tasks` row.
- **[v3] R8-R11** (design §8): a digest proves which bytes Clara saw, never that they were
  authentic · the artifact writer is `clara_runtime`, so the privilege sits in the verb, not in
  role separation · registering the extractor in the evaluator freeze makes any later recut of
  its closure fail at apply until a new `_vN` ships · the canonicalizer is a new parsing surface
  of our own, and HTML v1 is the whole of it.

---

## 5 · [v3] What leg 2 measured on a live rig (0102 frontier, 2026-08-23)

Five estate facts this survey never looked for, each of which changes a build decision — measured
by replay (`pnpm db:migrate` + `pnpm db:seed` on a throwaway Postgres 17), never read off
migration text.

**F16 — the estate has NO raw-bytes column anywhere in `clara`, and TWO digest idioms to copy.**
`clara.documents` carries `sha256` + `mime_type` + `byte_size` + `storage_path` +
`bytes_verified_at` (`0007:28`); `clara.report_artifacts` adds the four habits F-A8's
`fetch_artifacts` copies — a digest **shape CHECK**, `byte_size > 0`, a **content-addressed path
CHECK** binding the storage key to the digest, and **partial unique indexes** that make a chain
non-forkable (`uq_report_artifacts_linear_chain`). F-A8 drops the firm segment from the path form
(its artifacts are firm-independent) and adds `unique (id, sha256)` so children can carry a
composite FK onto the digest (IL-D17/IL-D26).

**F17 — the evaluator-freeze family is a live, self-proving mechanism, and NAMING is its
trigger.** `scripts/check-frozen-evaluators.mjs` fires on any `clara.evaluate_*`-shaped body and
demands an `evaluator_versions` row in the SAME migration plus an append-only
`frozen-evaluators.json` entry; `clara.verify_evaluator_freeze()` runs between every later
migration's body and its commit, over **all** registry rows regardless of `deployed`, checking
`sha256(pg_get_functiondef(...))` per member — the full functiondef, so a re-GRANT moves the hash
— plus the closure hash and the entry count. v2's `_policy_extract_quoted_value` matched nothing;
v3 renames into the mechanism and accepts its cost explicitly (IL-D20).

**F18 — the live app roles are exactly five** (`clara_authenticated`, `clara_agent_ro`,
`clara_wake_interactive`, `clara_wake_proactive`, `clara_runtime`, plus three `*_login` and
`clara_fn_owner`). There is no "privileged runtime role" to reach for and minting one is three
census surfaces at once, so F-A8 mints none (IL-D33).

**F19 — the human-authority helper is `clara._human_ctx(p_min_rank int, out actor, out firm)`
(`0004:299`) and it raises CLR04**, the authz/role-floor class (`0002:40`). Every existing human
door uses it; the design's hand-rolled `role_rank` comparison raising CLR05 is struck (IL-D32).

**F20 — `wake_fn_allowlist` holds 15 rows today: 6 `autodraft`, 8 `interactive`, 1 `proactive`.**
F8 re-derived the interactive/proactive halves correctly from migration text but never counted
`autodraft`. F-A8's three rows take it to 18 (Annex F, C.10d).

*Also confirmed by the same replay, exactly as this survey predicted:* `sst_threshold_schedule`
has a composite PK and **no `id`** (F1/GB-3 is real), and `client_facts`' supersede idiom
transfers to `fx_rates` unchanged **except its key**, which v3 makes an exact `rate_date`
(IL-D23).
