# F-A8 annexes — battery, register, DDL posture, censuses, rig replay, change log

> **v2, 2026-08-22 — gate 1 folded (record: `internet-lane-gate-record.md`).**
> Companion to **`internet-lane-design.md` v2, which is the design doc of record** — on any
> divergence the design doc wins. Sibling: `internet-lane-survey.md` v2 (the estate, F1-F15).
>
> **What happened to v1 of this file.** v1 (authored 19:54, ~2.3 hours BEFORE the design/survey
> pair it claimed to serve) specified an entirely different architecture —
> `request_fetch_tier1_source` / `wake_fetch_tier1_source` / `promote_tier1_row` /
> `reject_tier1_row` / `_promote_tier1_row_core` / `_web_research_core` over
> `tier1_fetch_attempts` / `web_research_receipts` / `web_citations` / `tier1_draft_receipts` /
> `tier1_promotion_receipts`, a decision register IL-D1..IL-D11 keyed to those names, §-cites
> (`design §3.3`…`§3.7`) that resolve to nothing in the design, and a "survey findings F1-F9"
> reference against a survey carrying F1-F15. Both gate lenses called it a **blocker**: a builder
> handed the set would build one of two different systems depending on which file they opened.
> **This file is re-cut wholesale against the design of record.** Nothing of v1's vocabulary
> survives. One v1 *idea* is reinstated on its merits and re-expressed in the design's own
> vocabulary — the fetch-attempt/health relation (`tier1_fetch_attempts`), which the rulings lens
> independently found the design owed under F-A8-M2 (design §5).
>
> **Annex C** battery · **Annex D** decision register · **Annex E** table DDL posture ·
> **Annex F** census and roster surgery · **Annex G** rig-replay obligations · **Annex H** the
> change log (the v1 → v2 fold table).

---

## Annex C · Test battery

**▣ = contract-blind** — built against the CONTRACT's stated shape (`wave-f-contract.md` §F-A8 +
ADR-0074's rulings) rather than this design's own vocabulary, so a wrong design choice cannot
make its own test agree with itself.

**Two disciplines this battery holds itself to, both bought at the F-A2 PR-1 gate.** (1) **A
fixture must be buildable in the real order** — a cell whose precondition cannot be reached
through the shipped verbs is not a cell, and every forced cell below states its precondition as
an **assert**, never as an assumption. (2) **A census that cannot say NO is meaningless** — every
catalog scan below carries an **adversarial twin** that hand-adds the thing the scan forbids and
confirms the SAME scan fails.

### C.1 · The Tier-1 door and its ladder (PR-1)

| # | cell | proves |
|---|---|---|
| C.1a ▣ | `wake_submit_policy_draft` refuses `unknown_policy_table` for any key outside the closed set, including a plausible-looking `sst_rate_schedule` | the closed set is the gate, and the not-yet-existing table is named out |
| C.1b | **Signature census, over IN arguments only** (`pg_proc.proargnames` filtered by `proargmodes` ∈ {NULL,`i`,`b`} — a `returns table` function's OUT names, e.g. `_policy_sources_agree`'s own `derived_value`, are excluded by construction): no F-A8 verb takes a value-shaped input (`payload`, `value`, `amount`, `rate`) or a client handle (`client_id`, `client`, `client_name`). **Adversarial twin:** hand-add `p_payload` to a throwaway copy and confirm the SAME scan FAILS | the "no wire for an unbacked numeral" claim is measured, and the detector is real |
| C.1c | **Single-use, on the NEW verb:** mint a `'proactive'` credential → `wake_submit_policy_draft` consumes it (assert `wake_credentials.consumed_at IS NOT NULL` after call 1) → a SECOND call on the same credential fails CLR03 | the consume-first branch is in *this* verb's core, not borrowed from `wake_record_notification` (GM-3) |
| C.1d | A replayed `p_op_key` returns the stored envelope and does NOT consume a second credential | the replay carve-out copied from `0004:670-674` holds |
| C.1e | `p_rationale` / `p_model` / `p_op_key` guards on all six new verbs | "the agent never picks an authoritative input" (0078) |
| C.1f | Zero sources refuses `no_citation` at the door, and a `policy_drafts` count assertion proves **no row was inserted** | TA-P4-M1's floor, applied at the door |

### C.2 · The derivation — the sharpest cells in this battery (PR-1)

| # | cell | proves |
|---|---|---|
| C.2a | Two sources whose quotes both read `4.7100` → `pending_approval`, and the draft's `derived_value` **is** 4.7100 | the happy path derives, it does not accept |
| C.2b | **The GB-1 cell (forced).** The same two genuine agreeing quotes, submitted with a `p_rationale` that asserts 4.8100 → the draft's `derived_value` is 4.7100 and **no row anywhere carries 4.8100**. *Precondition asserted:* C.1b's census is green (there is no value parameter to smuggle it through) | a model-chosen numeral has no path into a Tier-1 table — constraint 2 / PRD §6 structurally, not procedurally |
| C.2c | **Re-derivation at the door.** Mutate the stored `sources` (rig-only, as `clara_fn_owner`) so the extractor's re-run differs → `decide_policy_draft` refuses `draft_value_drifted` and **nothing lands** in `fx_rates` | a submission-time verdict is not trusted across a time gap |
| C.2d | Two sources quoting different values → `needs_review` / `sources_disagree`, **and the draft row EXISTS** | disagreement is information, never a silent drop |
| C.2e ▣ | One extractable source only → `not_evaluable`, never `pass`; the draft exists | ARM-0, law 68 |
| C.2f ▣ | The FIRST row ever drafted for a key (no live predecessor) → `value_plausible = not_evaluable`, so the draft lands `needs_review` and can only pass through the override door with a written reason | an absent comparator never reads as `pass` (IL-D13) |
| C.2g | **Totality (GM-7).** A quote reading `'RM500,000 (see note)'` and a quote carrying no numeral at all → both predicates return `not_evaluable`, **the transaction COMMITS**, and the `needs_review` row is present. **Adversarial twin:** the same fixture against a copy with the parse guard removed aborts the transaction | the "typed, non-raise" contract is real; the guard is load-bearing |
| C.2h | The extractor's version integer is stamped on the draft and is stable across a re-run of the same input | the evaluator is versioned, per TA-P2's second origin |

### C.3 · The audited owner door (PR-1)

| # | cell | proves |
|---|---|---|
| C.3a | `decide_policy_draft` below `role_rank('owner')` refuses CLR05 `not_owner` | a human-authority check, not a wake check |
| C.3b | `decide_policy_draft` on a `needs_review` draft refuses `draft_not_decidable`; `override_policy_draft` on the SAME draft with a non-blank reason succeeds, and the landed row's `basis_kind='owner_instruction'` with `basis` naming the override | the two doors have different friction, and the live row says which was used with no join |
| C.3c | `override_policy_draft` on a draft whose `derived_value` is NULL refuses | there is no number to approve; override moves verdicts, never the derivation |
| C.3d | A terminal draft (`approved`/`overridden`/`rejected`) refuses a second decision | terminal states are immutable; a fresh cycle makes a NEW row |

### C.4 · Supersede, the date range, and the missing day (PR-1 · `fx_rates`)

| # | cell | proves |
|---|---|---|
| C.4a | Approve/override writes BOTH the predecessor's `superseded_by`/`superseded_at` AND closes its `effective_to` — a point-in-time read sees the OLD value before the correction date and the NEW after, in ONE query, no join to `superseded_by` | the two columns do two different jobs and both are closed |
| C.4b | Stamping `superseded_by` without `superseded_at` (attempted directly as owner) is refused by the paired CHECK | the stamp is one act |
| C.4c ▣ | A missing-day evaluator read refuses `rate_unavailable_for_date`, **and** a catalog scan of the reader bodies asserts no `order by effective_from desc limit 1` fallback outside the covering predicate | the carry-forward is absent by construction, not by discipline |
| C.4d | On the transition day `d = successor.effective_from`, the `>` predicate returns **exactly one** live row; the twin fixture under `>=` returns two | the half-open convention is deliberate (the gate attacked the operator and it was upheld) |

### C.5 · The `sst_threshold_schedule` limb (PR-3)

| # | cell | proves |
|---|---|---|
| C.5a | The two seed rows (`0016:247-248`) are byte-unchanged in every pre-existing column after the ALTER, and both still read `effective_to IS NULL` until the first governed supersession | the additive ALTER needed no data the seeds never had |
| C.5b | The surrogate `id` is populated for both seed rows, `unique (id)` holds, and `pg_constraint` shows the composite PK `(service_group, effective_from)` **unchanged** | the self-FK became possible without moving the PK any reader depends on |
| C.5c | A governed row with `recorded_by` set and a blank `basis` is refused by the origin conjunct; a seed row with all three NULL is accepted | the CHECK is a real gate for governed rows and silent for migration rows |
| C.5d | A landed row's `source_note` names its source URLs and accessed dates (the existing `not null check (btrim<>'')` is satisfied by the core, not by a placeholder) | the live row cites its own origin with no join |
| C.5e ▣ | **The relaxation, re-derived independently.** Re-run 0016's ORIGINAL census by hand against the post-PR catalog, **extended to the reachable closure** — granted wrappers plus the ungranted `clara.` functions their prosrc names, transitively — and assert exactly ONE writer, `_policy_draft_commit_core`. **Adversarial twin:** add a second throwaway ungranted core that writes the table and confirm the SAME scan FAILS | the trued assertion can actually refuse; v1's proposed narrowing (granted-fn prosrc only) never could (GM-1) |
| C.5f | The trued assertion's own ERROR TEXT no longer reads "must be migration-only" — it names the one governed writer | law 22: a visible record must not lie |
| C.5g | `a21-watch.test.mjs` P1's re-cut passes: the seed-row assertions that survive still pass, and the `effective_to IS NULL` pin is re-expressed as "NULL until superseded by the named writer" | the STANDING estate-suite census was found and trued, not tripped in CI (GM-1) |
| C.5h | `0016:882-886`'s no-tie-break `schedule_note` `string_agg` returns exactly one row per `service_group` after the first supersession | the one live reader with no tie-break is not double-counted the day this table gains a writer |

### C.6 · Fetch health (PR-2)

| # | cell | proves |
|---|---|---|
| C.6a ▣ | A cycle whose source is unreachable writes exactly ONE `tier1_fetch_attempts` row, `outcome='source_unreachable'`, and drafts nothing | "today's non-fetch is itself a readable record" — F-A8-M2's own words, measured |
| C.6b ▣ | A cycle whose page yields no parseable value writes `outcome='unparseable'` and no draft | the total-failure case is visible where `policy_drafts` structurally cannot see it |
| C.6c | Negative control: a successful cycle writes exactly one attempt row (`outcome='drafted'`) and exactly one draft — not two, not zero | the health log does not over- or under-fire on the happy path |

### C.7 · Tier 2 — receipts, citations, and the identity wall (PR-4)

| # | cell | proves |
|---|---|---|
| C.7a ▣ | A call with ≥1 citation → receipt and citations persist in the same transaction | the happy path is atomic |
| C.7b ▣ | **Must-fail:** the same call with the citation insert removed (fault injection) aborts the WHOLE transaction at commit; no receipt-with-no-citation row survives | TA-P4-M1 verbatim, as a mechanism |
| C.7c | A citation `url` that is not `http`/`https`, or whose hostname is a literal IP in a denied range, refuses the insert | the DB's cheap second layer is real |
| C.7d | `p_purpose` outside `('regulatory_lookup','general_research')` refuses `unknown_web_purpose` | the free-text purpose channel is closed |
| C.7e | **The GB-5 cell (forced).** `wake_web_search(p_query := '<a REAL active client of the credential's firm> SSM registration number', …)` refuses `client_identity_in_query` and **no outbound call is attempted** (a network-call-count assertion). *Precondition asserted:* the fixture asserts the client row exists, is `active`, and belongs to the credential's firm before calling. **Adversarial twin:** with `_web_text_is_client_free` stubbed to `true`, the SAME fixture succeeds | the wall is the predicate, not the parameter list — review law 3 |
| C.7f | The C.1b signature census, re-run for the two Tier-2 verbs | kept as the cheap tripwire it is, never called the proof (this is what v1's C.12 was, alone) |
| C.7g | A caller who names a different firm inside `p_rationale` text cannot change which firm's client list the predicate scans — the firm comes from the wake context | the split-trust corollary (`PRD.md:173`) holds on the new surface |
| C.7h | `source_official` is TRUE for `bnm.gov.my` and FALSE for a random `.com`, and **neither value changes whether the citation or the fetch is accepted** | law 75's third discipline is mechanised and is decorative for acceptance (GM-5) |

### C.8 · The non-public-address deny list (PR-2, runtime)

| # | cell | proves |
|---|---|---|
| C.8a-d | Loopback `127.0.0.1`, RFC1918 (`10.x`, `172.16-31.x`, `192.168.x`), `169.254.169.254`, and a Fly 6PN address are each refused **before any socket connects** | every named range is denied by name, not swept up incidentally |
| C.8e ▣ | **A DNS name that RESOLVES to a denied address is refused on the RESOLVED address**, not waved through because the hostname string looked public | review law 2 — a string-only check is absence of evidence dressed as a wall |
| C.8f | Negative control: a fetch to a real public HTTPS official-source URL succeeds | the guard is not so wide it denies everything |

### C.9 · Contract-blind negative controls (PR-1)

| # | cell | proves |
|---|---|---|
| C.9a ▣ | No value in `web_fetch_citations` or `policy_drafts` can satisfy `entry_evidence.document_id`'s FK (`0009:899-900`) — attempted directly, must fail at the constraint | law 75's "a web page is never a posting's source document", without relying on application code to have remembered not to try |
| C.9b ▣ | `wiki_page_citations.source_kind='web'` is rejected by the five-member CHECK (`0017:896-897`) | the KB door stays shut (survey F12) |
| C.9c | **Defence in depth (added at the gate).** A prosrc scan proving no F-A8 function inserts into `clara.documents`, `clara.entry_evidence` or `clara.wiki_page_citations`, with an adversarial twin that hand-adds one and confirms the scan FAILS | covers this item's own surface, which C.9a/C.9b (correctly) do not |

*The gate's "C.9a/C.9b are vacuous" finding was **REFUTED**: they are legitimate contract-blind
regression cells over this item's own named non-goals, the same class `metering-annexes.md` C.1/C.9
labels "regression, contract-blind". C.9c is added as a complement, never as their replacement.*

### C.10 · Grants, hygiene, rosters (each PR that adds a verb or a table)

| # | cell | proves |
|---|---|---|
| C.10a | T17's exact-set grant matrix (`rig-meta.mjs:1014-1060`) is green after each PR: each new verb is EXECUTE-able by exactly the one role that may call it and by no other | the largest closed-world census in the estate is extended deliberately (GM-2) |
| C.10b | No app role can reach any `_core` — a catalog scan across all six roles | the wrapper/ungranted-core seam has no alternate entry point |
| C.10c | Every new verb is SECURITY DEFINER, `set search_path = clara, pg_temp`, owned by `clara_fn_owner`, PUBLIC revoked (`definerHygieneFailures`, `rig-meta.mjs:1062-1074`) | the hygiene the design now states is measured, not assumed |
| C.10d | The `wake_fn_allowlist` roster holds **exactly** F-A8's three new pairs and no more, **and** the pre-existing `('proactive','wake_record_notification')` row (`0002:558`) is still present | the roster is extended, never re-seeded — and the count is three, not two (the v1 slip) |
| C.10e | T18 (`rig-meta.mjs:1076-1117`): all five new tables carry RLS + FORCE, one `clara_fn_owner` policy, zero direct app-role grants | Annex E's posture is measured |

---

## Annex D · Decision register

| id | decision | status |
|---|---|---|
| **IL-D1** | **The value that lands is DERIVED, never supplied.** The wrapper carries no value parameter; a versioned total extractor reads it out of the cited quotes and the core writes that. | **gate-ruled** (F1/GB-1) |
| **IL-D2** | The `0016` relaxation is a NEW migration's own trued assertion over the **reachable closure** (granted wrappers plus the ungranted cores they call), never an edit to applied `0016` and never a scan the new writer can slip past. | derived (F1) · **amended at the gate** (GM-1) |
| **IL-D3** | Tier-1 rows are append + a one-way supersede stamp; **no UPDATE grant to any role, ever**, on `fx_rates` or on governed `sst_threshold_schedule` rows. | derived (TA-P2's "immutable + supersede") |
| **IL-D4** | The fetch-attempt/health relation is its own append-only table (`tier1_fetch_attempts`) written by the runtime job **outside** the draft door — `policy_drafts` structurally cannot record a zero-citation attempt. | **gate-ruled** (F14/rulings-2) |
| **IL-D5** | No egress purpose is registered for Tier-1/Tier-2 (TA-P3/A: identity-free lookups are not disclosures) — **and the identity-free property is MADE true** by a closed purpose world plus a refusal predicate, not asserted by an absent parameter. | derived · **amended at the gate** (F5/GB-5) |
| **IL-D6** | The deny list checks the **resolved** address, proved by live connection attempts, never by the URL string alone. | derived (survey F7, review law 2) |
| **IL-D7** | **F-A8 performs no `llm_usage_events` work and writes no metering row.** The one ledger is F-A9's (TA-P13); F-A8 records an honest gap and consumes the door once F-A9 opens it. v1's joint-ALTER model is withdrawn. | **amended at the gate** (F15) |
| **IL-D8** | The door is gated at `role_rank('owner')` only — TA-P2's literal "audited owner one-click door". No admin+ authorization list in v1. | ruled here, per TA-P2 |
| **IL-D9** | The backdated-correction obligation is discharged by a **named, CLOSED** consumer list in the impact scan (design §5), extend-never-weaken. v1 left the list open. | derived · **amended at the gate** |
| **IL-D10** | One receipt table per act class, with a SHARED naming convention rather than a shared table. Re-derived from the ONE real precedent, `freeform_read_log` (`0002:308`); `entry_post_receipts` is F-A2's **unbuilt proposal**. | derived · **corrected at the gate** (F9) |
| **IL-D11** | The SST **rate** table is not designed here; F-A8's closed set gains a case-arm once F-T1 ships its schema. | contract-ruled (F-A8-OQ-5) |
| **IL-D12** | **`'proactive'` single-use is a PER-VERB obligation with no central enforcement.** `0004:674-678` is the estate's only writer of `consumed_at`; every new proactive verb copies it. Recorded as a **wave-level** finding, not only F-A8's. | **gate-ruled** (F8/GM-3) |
| **IL-D13** | The genesis row for a key (no live predecessor) is `not_evaluable` on plausibility, lands `needs_review`, and reaches the table only through the override door with a written reason. | derived (ARM-0, law 68) |
| **IL-D14** | **F-A8 owns its own scheduled trigger** and mints its own `'proactive'` credential (`mint_wake_credential`, `0011:1156-1195`, granted to `clara_runtime`). It does not ride F-A4's clock — F-A4 mints `close_prep`, F-A5 `bank_agent`, F-A2 `interactive_client`. | **gate-ruled** (F13/GM-8) |
| **IL-D15** | The fetch job runs with **no `agent_tasks` row** in v1: `kind='wake'` tasks are born `held` (`0011:1230`) and the only legal transition is `held → cancelled` (`0011:1271`). The credential, the receipt and the health row are the durable record. **Fail-closed default pending OI-2.** | **gate-ruled**, provisional |
| **IL-D16** | **No KB write path in v1** — a scope choice, with F-A7 named as the owner of TA-P8's context landing and promotion door. Not a prohibition TA-P8 imposes (v1 said it was). **Fail-closed default pending OI-1.** | **corrected at the gate** (F4/GB-4), provisional |

### D.2 · Open design questions (recommendation + fail-closed default; the standing delegation)

| id | question | recommendation · fail-closed default |
|---|---|---|
| **ODQ-1** | Which firm's owner has standing over a firm-independent Tier-1 draft? | Gate v1 to BELCORT's owner (constraint 13). The gate narrowed this mechanically: `mint_wake_credential` requires a firm, so the draft records `minted_by_firm` and the standing question has a recorded answer per draft. *Default:* same. |
| **ODQ-2** | The exact two official endpoints per Tier-1 table. | The same-provider-two-channel pattern G1.1 ratified for the witness pair. *Default:* until BOTH channels are confirmed reachable and parseable, `sources_agree` is structurally `not_evaluable` for that table — never a one-channel `pass`. |
| **ODQ-3** | Metering. | **Re-cut at the gate:** not F-A8's at all (IL-D7). *Default:* an honestly-recorded gap. `llm_usage_events.firm_id`'s `not null` (`0094:55`) for a firm-independent call is **F-A9's to rule — OI-3**. |
| **ODQ-4** | Does `autodraft` get Tier-2 in v1? | No — `interactive` only. *Default:* same. |
| **ODQ-5** | One shared cross-item receipt table, or one per item? | One per item (IL-D10), re-derived from the one real precedent. *Default:* same. |
| **ODQ-6** | An explicit integer `revision` column beyond supersede-chain depth? | No — `client_facts`' proven shape has none, and a redundant counter is a fresh place for two numbers to drift. *Default:* same. |
| **ODQ-7** | **(NEW at the gate)** The Tier-2 search **vendor/mechanism** — the agenda's fifth F-A8 design-layer question (R-B), which v1's register never picked up. | Name one search API in PR-4's own research pass and record it in the design before PR-4 opens. *Default:* **`wake_web_search` does not ship until a vendor is named**; `wake_web_fetch` (a direct URL read, no vendor) may ship alone. |

---

## Annex E · Table DDL posture and DEFINER hygiene

Stated once here so PR-1/PR-3/PR-4 do not each re-derive it. *(The gate finding that raised this
was REFUTED as normal design granularity — T18 fail-closes on any new table regardless. It is
stated anyway because saying it costs five lines and forgetting it costs a red estate suite.)*

- **All five new tables** (`fx_rates`, `policy_drafts`, `tier1_fetch_attempts`,
  `web_fetch_receipts`, `web_fetch_citations`) are **firm-less** and follow
  `sst_threshold_schedule`'s own idiom (`0016:400-411`, asserted at `0016:5335-5351`): `enable row
  level security` + `force row level security`, exactly one policy
  `p_<t>_owner … for all to clara_fn_owner using (true) with check (true)`, **zero direct
  app-role grants**, and a `t_<t>_no_truncate` trigger. Reads reach humans only through the
  DEFINER typed readers of design §4 — never a `SELECT` grant on a base table.
  *(The estate does carry a second firm-less idiom — `client_fact_keys` (`0055:346-368`) grants
  `clara_authenticated` an unconditional read. It is not adopted: these tables carry decision
  and receipt content, not product vocabulary.)*
- **All six new verbs and all four cores** are `security definer`, `set search_path = clara,
  pg_temp`, owned by `clara_fn_owner`, with `revoke all … from public` and EXECUTE granted to
  exactly one role each (cores: none). Measured by C.10a/C.10c against
  `rig-meta.mjs:1014-1074`.
- **Append-only enforcement**: `web_fetch_receipts`, `web_fetch_citations` and
  `tier1_fetch_attempts` take the estate's no-update/no-delete trigger idiom; `policy_drafts`
  takes a supersede-only-style update trigger allowing exactly the decision stamp.

---

## Annex F · Censuses and roster surgery this item touches

Every closed world F-A8 extends, with the instrument that actually measures it. *(v1's survey §2
listed four and missed the two that fire hardest — the gate's GM-1 and GM-2.)*

| surface | instrument | what F-A8 must do |
|---|---|---|
| **T17 exact-set grant matrix** | `packages/db/tests/rig-meta.mjs:1014-1060`, rosters at `:811-916`, wired at `rig-isolation.test.mjs:531` | Extend `ALLOWED` **per role, by name**: `clara_wake_proactive` += `wake_submit_policy_draft`; `clara_wake_interactive` += `wake_web_fetch`, `wake_web_search`; `clara_authenticated` += `decide_policy_draft`, `override_policy_draft`, the four typed readers. Every core stays out of every set. **The single most certain-to-fire census in the estate** (GM-2). |
| **T17 dead-exemption sweep** | `rig-meta.mjs:1040+` | No roster entry for a function that does not exist — the compensating assertion for every explicit-enumeration widening. |
| **T18 governed-RLS sweep** | `rig-meta.mjs:1076-1117`, `RLS_EXEMPT` at `:961` | Annex E's posture on all new tables; nothing is added to `RLS_EXEMPT`. |
| **DEFINER hygiene** | `rig-meta.mjs:1062-1074` | Annex E's second bullet, for all ten new bodies. |
| **`sst_threshold_schedule` writer census — the STANDING one** | `packages/db/tests/a21-watch.test.mjs:98-132` (runs in the estate suite on **every code PR**) | **Re-cut in PR-3** (C.5g): the direct-grant assertion survives untouched; the granted-fn prosrc scan is replaced by the reachable-closure scan; the `effective_to IS NULL` seed pin is re-expressed as "NULL until superseded by the named writer". v1's survey searched `packages/db/deploy/` and concluded no standing test existed (GM-1). |
| **The `0016` tail assertion** | `0016:5216-5230` (a ONE-TIME apply-time DO block) | **Trued by name in PR-3**, in the reachable-closure form, with its error text re-worded (C.5e/C.5f). It is not a standing test — that is `a21-watch` above, and v1 conflated the two. |
| **`wake_fn_allowlist` roster** | `0002:553-559` seed; mutated also by `0007:1100`, `0011:3903-3910`, `0078:191` | Add **three** rows: `('proactive','wake_submit_policy_draft')`, `('interactive','wake_web_fetch')`, `('interactive','wake_web_search')`. The roster today already holds a `'proactive'` row and **eight** `'interactive'` rows — never re-seed, only extend (C.10d, GM-6). |
| **`documents`/`entry_evidence` provenance** | `0009:899-900` FK | No census to re-cut; C.9a/C.9c prove F-A8 adds no path. |
| **`wiki_page_citations.source_kind`** | `0017:891-901` five-member CHECK | Unextended; C.9b/C.9c prove it. |

---

## Annex G · What the rig replay must confirm (the design's own predictions)

| # | prediction | what the replay must show |
|---|---|---|
| G.1 | **Zero CoR'd live bodies on F-A8's own list.** | A catalog `prosrc` diff against the pre-PR baseline shows no existing function's body changed, in PR-1, PR-2 and PR-4 alike. This is TA-P1's rider measured, not asserted — and it is the claim F-A2 discovered was FALSE for several of its own bodies. |
| G.2 | **No D1 write-quiesce window, PR-1.** | A fresh-DB apply and a deploy-onto-existing apply both succeed with no window declared; every artifact is new. |
| G.3 | **No D1 window, PR-3 either** — but only after measurement. | The `sst_threshold_schedule` zero-writer population is **re-derived on the live catalog** (not read from the migration source) before the ALTER is relied on; the two seed rows are unchanged in every pre-existing column afterwards (C.5a). `add column … default gen_random_uuid()` rewrites the table — trivial at two rows, but the replay states the fact rather than assuming it. |
| G.4 | **The live tips of every body F-A8 cites** are found by REPLAY, never by migration number: `mint_wake_credential` (`0011:1156`, superseding `0004:687` dropped at `0011:1131`), `wake_context` (`0011:1133`), `assert_wake_allowed` (`0004:114`), `_tf_agent_task_update` (`0011:1248`). |
| G.5 | **The three allowlist rows** exist after PR-4 and the roster's total count matches Annex F's arithmetic exactly. |
| G.6 | **The T17/T18/DEFINER sweeps** are green at the end of each PR, and each was RED before that PR's roster edit — proving the roster edit was necessary, not decorative. |

---

## Annex H · Change log

**v1 (2026-08-22, 19:54).** Superseded in full — see the header. It described a different
architecture and was never reconciled with the design doc it claimed to serve.

**v2 (2026-08-22) — gate 1 folded (record: `internet-lane-gate-record.md`).** The gate ran one
leg: the independent judgement-logic review (law 1), two fresh-context lenses (bytes and
rulings), every finding adversarially re-verified by an independent verifier whose re-graded
severity governs. **Five blockers, nine materials; the width is severed; the document set is
reconciled.** What HELD, recorded so it is not re-argued: the design's TA-P1 reasoning (§2), the
owner-one-click-door-not-a-PR shape and its by-name relaxation of `0016`, the three-table Tier-1
closure, the deferral of the SST rate schema to F-T1, citation as a tool-boundary mechanism, and
TA-P7's non-application.

| fold | the defect, and where it now lives |
|---|---|
| **F1** (GB-1) | Neither v1 check bound the landed value to the agreeing sources — two genuine BNM quotes of 4.7100 could land 4.8100 with both checks green. **`p_payload` is DELETED from the wrapper; the value is DERIVED** by a versioned total extractor; the agreement predicate RETURNS it; plausibility runs on it; the door re-derives and refuses `draft_value_drifted`. Design §3.1; cells C.1b/C.2b/C.2c. |
| **F2** (GB-2, both lenses) | This file was a different design. **Reconciled: the design doc of record WINS** — re-cut wholesale; the design's inline battery and register moved here as Annex C/D. `tier1_fetch_attempts` is reinstated on its merits. |
| **F3** (GB-3) | The supersede ALTER could not apply — `sst_threshold_schedule` has a composite PK and no `id` (`0016:237-244`). Design §3.1 adds a surrogate `id` + `unique (id)` beside the untouched PK, the full column list incl. `basis`/`basis_kind`, and the existing `source_note not null` CHECK the core must satisfy. Cells C.5b/C.5c/C.5d. |
| **F4** (GB-4) | TA-P8 was stated backwards and cited as its own authority. Design §1/§8 re-cut to the ruling's text; the no-KB-write posture survives as **scope** with F-A7 named. IL-D16; **OI-1**. |
| **F5** (GB-5) | "No wire for client content" was false at the signature. Design §3.2 separates the absence, a CLOSED purpose world, and a refusal predicate — one-directionality stated. v1's C.12 becomes C.7e (a forced refusal + adversarial twin) with C.7f keeping the old spelling check as a tripwire only. IL-D5. |
| **F6** (GM-1) | Wrong instrument: `a21-watch.test.mjs:98-132` is a STANDING estate-suite census. Annex F + PR-3 + C.5g. The `0016` truing is re-specified as a **reachable-closure** scan (C.5e) — v1's narrowing could never have refused. IL-D2. |
| **F7** (GM-2) | The largest closed-world census was missing: T17's grant matrix (`rig-meta.mjs:1014-1060`) plus `definerHygieneFailures`. Annex E + Annex F + C.10a/C.10c. |
| **F8** (GM-3) | The `'proactive'` single-use consume was absent from the ladder. Design §3.1 Tier A step 1 copies `0004:668-678`; C.1c re-points at the NEW verb; **IL-D12** records the wave-level obligation. |
| **F9** (GM-4) | Phantom cite: `entry_post_receipts` is in no migration — it is F-A2's proposal. The `0037` tag is dropped, the coupling named (design §6.5), ODQ-5 re-derived from `freeform_read_log`. IL-D10. |
| **F10** (GM-5) | Law 75's third discipline was absent. Design §1 restates it; §3.2 mechanises `source_official`; C.7h proves it never gates. |
| **F11** (GM-6) | Survey F8 was wrong at the bytes: the roster holds a `'proactive'` row (`0002:558`) and **eight** `'interactive'` rows. Annex F + C.10d; survey v2 re-derives from all four mutating migrations. |
| **F12** (GM-7) | The Tier-B predicates are **TOTAL by contract**; C.2g forces an unparseable quote and asserts the `needs_review` row survives, with an adversarial twin. |
| **F13** (GM-8) | Cross-item sequencing was unstated. Design §6: the clocked-wake execution path (held-only, shared with F-A4 — **OI-2**, IL-D15), the `chatTurn` `_vN` ordering, the CHECK-pair cite discipline, and **F-A8 owns its own trigger** (IL-D14). |
| **F14** (GM-9) | The fetch-health relation is BUILT (`tier1_fetch_attempts`, design §5; IL-D4; C.6a-c) — F-A8-M2's second obligation, which v1 claimed and could not deliver. |
| **F15** (width) | Seven limbs (design §7): `llm_usage_events` leaves F-A8 entirely (IL-D7; ground = ownership and blast radius, **not** the REFUTED "forces a recut" claim); Tier 1 and Tier 2 split; the `sst_threshold_schedule` limb rides its own PR after `fx_rates` proves the mechanism live. |
| **Nits** | Cite trues folded without argument, listed in the gate record §5 and applied across all three files. |
| **REFUTED** | Five findings did not survive verification and are recorded in the gate record §6 so nobody re-raises them; two of them left useful residue that IS folded (the `0016:882-886` no-tie-break exposure → design §5 + C.5h; the RLS posture → Annex E). |
