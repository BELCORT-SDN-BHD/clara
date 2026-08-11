# Migration 0017 — interface pins, part 3 of 3 (Blocks L, G; fixtures, battery, post-verify, v25)

**Status: DRAFT for orchestrator review.** Part of the single 0017 design set — see
`wave-b-migration-0017-design.md` (header, OPEN FORKS, Blocks W/O) and
`wave-b-migration-0017-design-part2.md` (Blocks K/S).

---

## Block L — lint (B2: findings lifecycle, the per-client belt, the tie watch, queue surfacing)

**L1 — `lint_findings` (P18: findings are first-class).** Modeled on the
`compliance_watches` state-machine-as-data precedent (0016:298-372):

- `lint_findings(id uuid pk, firm_id, client_id, finding_kind text not null CHECK IN
  ('contradiction','stale_claim','orphan_page','cap_pages','cap_page_size',
  'wiki_synthesis_held','opening_tb_tie_broken','opening_doc_unfiled'), dedupe_key
  text not null (deterministic identity: kind + subject ids — the P18 identity key),
  severity text not null CHECK IN ('info','warn','critical'), page_id uuid null,
  seed_id uuid null, detail jsonb not null default '{}' (figures/deltas — DB-computed
  only), state text not null default 'open' CHECK IN ('open','superseded','resolved'),
  prior_finding_id uuid null (the RECHECK link: a resolved finding whose condition
  re-appears opens a NEW episode citing the prior), opened_at, evaluated_through_
  event_seq bigint, resolved_conclusion text CHECK typed NULL, resolved_note text,
  resolved_by uuid, resolved_at — `ck_lint_findings_resolved` all-or-nothing (the
  0016:343-347 idiom), superseded_at (belt-stamped), created_at, updated_at)` —
  **partial unique `(client_id, dedupe_key) where state='open'`** (one open episode —
  the `uq_compliance_watches_one_open` idiom).
- `lint_finding_events(id, finding_id fk, event_kind text CHECK IN
  ('created','superseded','resolved','recheck_opened','evaluation'), state_before/
  state_after, figures jsonb, actor text, rationale text, created_at)` — append-only
  trigger.

**L2 — kinds + dedupe keys (hygiene-only per WB-R14; mining stays DEFERRED).**
`contradiction` = two published pages whose typed citations disagree on the same
subject — dedupe `'contradiction:<page_a>:<page_b>'`; `stale_claim` = a page whose
newest citation predates a superseding source — `'stale:<page_id>'`; `orphan_page` =
a `verified`-never-`published` version or a page with zero refs —
`'orphan:<page_id>'`; `cap_pages` / `cap_page_size` = W7 budget breach or ≥90%
approach — `'cap:<client>:<budget_key>'`; `wiki_synthesis_held` = the W9 hold —
`'held:<client>'`; `opening_tb_tie_broken` (L4) — `'obtie:<seed_id>'`;
`opening_doc_unfiled` = the tie document's filing retired under a finalized seed —
`'obdoc:<seed_id>'`.

**L3 — the per-client belt fns (the evaluate_sst_watch clone contract, verbatim
discipline).** `run_client_lint(p_client uuid, p_op_key text) returns jsonb` —
SECURITY DEFINER, `set search_path = clara, pg_temp`, **GRANT the clara_runtime GROUP
ONLY** (plain group-role call — the evaluate_sst_watch pattern, not the
execute_rule_post login-direct dance); whole body exception-isolated (`exception when
others then return jsonb {status:'failed', error, sqlstate}` — NEVER raises to the
caller); unknown/non-active client → `{'status':'skipped'}` (O8 row 7); idempotent
recomputation from base tables (op_key validated + audited, NOT op_receipts-reserved);
opens/supersedes findings per L2; emits `lint.finding_transition` **only on real
transitions** (created/superseded/recheck — the 0016:740-823 precedent; a converged
pass takes NO `firm_event_seq` lock); stamps `evaluated_through_event_seq`. Wrapper
`run_lint_all(p_op_key text) returns jsonb` — loops `status='active'` clients,
counts failures WITHOUT raising, writes ONE append-only `lint_runs(id, started_at,
completed_at, clients_examined, clients_changed, clients_failed,
through_event_seq, error_note)` receipt — **the runtime NEVER calls this as the sweep
itself** (the reconciler-sst per-client-statement law: one statement, one implicit
txn, one short-lived event-seq lock per client; the `_all` wrapper is the receipt
writer called ONCE after convergence; per-client failure never re-arms the belt).

**L4 — the WB-R5 opening-TB tie watch (watched, not blocked).** Inside
`run_client_lint`: for each `'finalized'` `opening_seed_registry` row, recompute
`trial_balance_as_of(client, as_of)` and re-run the K4 tie comparison; a non-zero
delta opens `opening_tb_tie_broken` (severity `'critical'`, per-line deltas in
`detail` — DB-computed, sen-exact); the retired-tie-filing edge opens
`opening_doc_unfiled`. Post-tie-out back-dating is thereby SURFACED daily
(visibility-over-constraint — the owner's standing preference); Wave E's lock system
closes it structurally. Correction path = the K6 supersede verb; resolving the
finding without a books change requires the typed L5 resolution verb (conclusion
`'accepted_revision'` — e.g. a deliberate governed re-statement).

**L5 — queue surfacing (`list_review_queue` CoR) + the read fn + the resolution
verb.** CoR (same 3-arg arity, additive keys ONLY — the 0016:4548-4557 CoR law):

- A sibling `lint_rows` CTE emitting `row_kind='lint_finding'` (severity `'critical'`
  → section_rank 1 / section `'needs_you'`, else rank 2 `'needs_review'`), the same
  widened column tuple with a NEW null-defaulted `finding_id` column added to EVERY
  row CTE (the `watch_id` precedent — pre-0017 envelopes degrade to null).
- `counts` gains integer `lint_findings` (never monetary); the envelope gains
  `lint {stale_evaluator boolean (newest lint_runs receipt >48h old or absent),
  clients[] omitted — hydration is per-row via the read fn, NOT an envelope blob (the
  compliance envelope-match wart is explicitly not replicated)}`.
- **The WB-R1 guard join (`c.status='active'`) lands in EVERY row CTE in this same
  CoR** (O8 row 4). Sort tuple + cursor grammar + every 0011/0016 row shape otherwise
  unchanged. ~~The open owner ruling on queue section-order~~ **RULED before build
  (ADR-031/WA21-R14, 2026-07-23, PR #63): needs_you renders first — the sort-tuple
  alignment IS folded into this CoR per the conditional: draft rows rank by lane
  (needs_you lane = rank 1, the filing_rows pattern), so the envelope's total order
  agrees with the rendered section order across pages. Cursor GRAMMAR unchanged;
  pre-0017 cursors may straddle the re-ordered boundary once at deploy (ephemeral
  UI state; the ceremony quiesces anyway).**
- `get_lint_finding(p_finding uuid) returns jsonb` — GRANT clara_authenticated; the
  hydration card's read (P18: the unknown-kind placeholder is not an acceptable
  surface; the card gets a REAL read fn).
- `resolve_lint_finding(p_finding uuid, p_conclusion text, p_note text, p_op_key
  text) returns jsonb` — `_human_ctx(role_rank('bookkeeper'))`, GRANT
  clara_authenticated; typed conclusion CHECK (e.g.
  `'corrected','accepted_revision','false_positive','superseded_by_edit'`);
  all-or-nothing resolved fields; `lint_finding_events('resolved')`; receipt.

**L6 — exactly-once notification (P18).** On a `created` transition the belt calls
`_record_notification_core(... p_kind 'lint_finding_opened', p_op_key
'lint:'||dedupe_key||':'||finding_id ...)` wrapped best-effort (`begin … exception
when others then null; end` — the 0016:2605-2613 autopost-suspend idiom): the
deterministic op_key IS the exactly-once guarantee; a superseded/recheck transition
does NOT re-notify (episode-scoped).

**L7 — cap enforcement split (WB-R8 mechanism=law).** HARD: the W3 writers refuse a
publish that would breach `max_page_bytes` or mint a page beyond
`max_pages_per_client` (typed CLR31-class refusal — the mechanism is law). SOFT: the
belt opens `cap_pages`/`cap_page_size` findings at ≥90% of a budget (approach
visibility) and `'critical'` at breach-found-in-place (e.g. a budget retuned
downward by ADR). Budget values ALWAYS read from `wiki_budgets` (W7) — no literal in
any prosrc (G5 asserts the fns reference the table).

---

## Block G — cross-cutting (events, ACL, allowlist, receipts, tail battery, ordering)

**G1 — event-type registration (one additive-pair CTE against `taxonomy_active`; the
0009 full-coverage assert re-run in the tail).** All client-scoped unless noted:

| event_type | decision | note |
|---|---|---|
| `wiki.page_published` | ignore | projection output; rebuild metadata in payload (P17) |
| `wiki.page_retired` | ignore | |
| `wiki.source_ingested` | ignore | deterministic-ingest trail |
| `lint.finding_transition` | notification | transition-only emission (L3) — bounded; the compliance.watch_transition precedent |
| `client.onboarding_started` | ignore | |
| `client.activated` | ignore | dashboard reads state; no held-task flood |
| `onboarding.plan_committed` | ignore | |
| `opening_seed.batch_approved` | ignore | |
| `opening_seed.reopened` | ignore | B-12 lane |
| `opening_item.superseded` | ignore | |
| `seeding.batch_created` / `seeding.proposal_decided` / `seeding.batch_completed` | ignore | human-paced |

No new pg_notify channel; empty-payload nudges only; `_append_event` LAST in every
writer (multi-event writers emit consecutively at the tail under the held counter
lock — C4).

**G2 — the ACL tuple matrix (the 0011:4229-4287 row pattern, extended; asserted
row-by-row in the tail).** Tuples are `(signature, authenticated, agent, wake,
runtime)`:

| fn | auth | agent | wake | runtime |
|---|---|---|---|---|
| `publish_wiki_page_version` / `record_wiki_source_ingest` / `set_wiki_synthesis_hold` / `clear_wiki_synthesis_hold` / `create_seeding_batch` / `record_opening_targets_parsed` / `update_onboarding_plan` | ✗ | ✗ | ✗ | ✓ |
| `run_client_lint` / `run_lint_all` | ✗ | ✗ | ✗ | ✓ |
| `retire_wiki_page` / `get_wiki_page` / `list_wiki_pages` (reads also ✓ runtime) | ✓ | ✗ | ✗ | reads ✓ |
| `begin_client_onboarding` / `commit_client_onboarding` / `cancel_client_onboarding` / `resolve_onboarding_plan_item` | ✓ | ✗ | ✗ | ✗ |
| `create_opening_seed` / `draft_opening_item` / `record_opening_target` / `seed_fixed_asset` / `approve_opening_seed` / `supersede_opening_item` / `approve_opening_correction` / `reopen_opening_seed` | ✓ | ✗ | ✗ | ✗ |
| `tick_seeding_proposal` / `decline_seeding_proposal` / `complete_seeding_batch` | ✓ | ✗ | ✗ | ✗ |
| `get_opening_dryrun` / `get_lint_finding` / `resolve_lint_finding` | ✓ | ✗ | ✗ | ✗ |
| `trial_balance_as_of` (INVOKER — grant-only row) | ✓ | ✗ | ✗ | ✓ |
| `_client_operational` / `_assert_client_operational` / `_assert_opening_tie` / `_assert_fa_baseline` / `_approve_opening_entry` (internals) | ✗ | ✗ | ✗ | ✗ |

**THE AGENT ROLE GAINS ZERO EXECUTE ANYWHERE IN 0017** (the 0016 tail law, verbatim
re-assert): the agent receives wiki content only via the purpose-gated pack (W6);
onboarding/carry-down/seeding are human- or runtime-lane by construction.

**G3 — wake authority: ZERO new allowlist rows.** No 0017 fn enters
`wake_fn_allowlist` (interview durable-run state rides `clara_runtime` writers — the
`checkpoint_turn` precedent — not the wake lane; OB/seeding/carry-down are human-only;
the belt + projection are runtime consumers). Tail negative assert (the 0016:5102-5107
idiom): `if exists (select 1 from clara.wake_fn_allowlist where function_name in
(<every 0017 fn name>)) then raise ... CLR10`.

**G4 — receipts + locks.** Every 0017 writer: op_key mandatory (CLR10 on null),
`_reserve_op` hashed over the full semantic payload, `_finish_op` result replayed
byte-identically; the two structural RAISE-not-replay exceptions are documented
in-body (K1 registry unique = semantic double-seed; O7 create_firm token-receipt).
Advisory-lock namespace: 0017 allocates NO new xact-lock keys — K5/K6 reuse the
as-built client key `(203005004, hashtext(client))` to serialize with live approvals;
the open-question keys 203005003/203005004 are not repurposed; runtime consumers use
session-level `hashtext('<consumer name>')` (relay idiom). Any future key must be
registered here first.

**G5 — the tail assertion battery (the migration aborts atomically on any failure).**
(a) constraintdef asserts: `clients_status_check_0017` ~ `'onboarding'`;
`open_questions_origin_check_0017` ~ `'onboarding'`;
`coa_accounts_special_acc_type_check` ~ `'opening_balance_equity'` AND
`'retained_earnings'`; `documents_document_kind_check` ~ `'prior_gl'` [FORK-4];
`ck_coa_obe_equity` / `ck_coa_retained_earnings_equity` exist. (b) prosrc asserts:
`get_context_pack` — `'pack_schema_version',4` + the v7 purpose literal + the wiki
block key + the CARRIED v3 keys (`sst_registration_watch`,
`surface_and_request_professional_review_only`); `list_review_queue` —
`lint_finding` + `finding_id` + the guard predicate; `_draft_entry_core` —
`_assert_client_operational`; `create_firm` — `consumed_op_key`;
`classify_document` / `set_document_kind` — `prior_gl`. (c) must-NOT prosrc greps:
no authority fn references `clara.wiki_` (the W10 named list); K/S approval fns
contain no `rule_sightings` insert / no `'autopost'` (K13/S5); no watch/lint logic
inside `_approve_entry_core`. (d) the WB-R6 dependency audit: the 0016:5218
aclexplode+prosrc scan — every granted fn referencing `clara.wiki_` is in the
wiki-family whitelist. (e) grant matrix: `has_function_privilege` row-by-row per G2;
agent-zero; retained same-arity CoRs keep their as-built ACLs. (f) allowlist leak
(G3). (g) seed asserts: `wiki_budgets` four rows exact; event-type/taxonomy full
coverage (0009 idiom). (h) the PUBLIC sweep ran: `revoke execute on all functions in
schema clara from public` precedes the named grants (N13 — every new fn is
PUBLIC-executable until it).

**G6 — ordering + atomicity.** ONE transaction, sections in order: (1) pre-asserts on
existing data (before every tightening — trivial here, all swaps widen); (2) table
ALTERs + constraint swaps as the migration superuser (clients.status DO-block;
open_questions/coa/documents by-name; firm_admissions columns; fixed_assets columns +
trigger); (3) `set role clara_fn_owner` — new tables (W1/W2/W7/W9, O5, K1/K2/K4,
K5-approvals, S1, L1, lint_runs) + RLS policies + new/CoR'd fns; (4) `reset role`;
(5) grants: PUBLIC sweep → named grants per G2; (6) seeds: `wiki_budgets`,
event types + taxonomy pairs; (7) the G5 tail battery. Applies clean to the
16-migration prestate; the runtime v25 image must remain healthy against the
16-migration DB during the ceremony window (deploy-before-migrate — /ready queries
only pre-0017 spine tables).

**G7 — errcode allocations (provisional; the build lane verifies the next free
numbers against as-built 0001–0016 before cutting).** CLR30 opening-seed family
(K14); CLR31 wiki family (`cap_exceeded`, `citation_required`, `sha_mismatch`,
`bad_state`, `consent_held`, `budget_unknown`); CLR32 lint family
(`finding_not_open`, `bad_conclusion`); CLR33 seeding family (S7). Existing codes
reused for existing classes (CLR02/03/04/05/10/11/13/26/27/28 semantics unchanged).

**G8 — back-compat guarantees (pre-0017 consumers keep working).** Pack v4 is
additive-but-dark (P5): every v3 key byte-identical; the wiki block absent for every
pre-v7 caller (FORK-6 gate). Queue envelope: new keys additive + null-defaulted; a
pre-0017 dashboard degrades exactly like the 0016 watch keys did (mapper defaults).
No existing fn signature changes arity; no existing constraint tightens against live
rows (all swaps widen); no existing event type or taxonomy pointer moves. The frozen
chatTurn v1–v6 / autoDraft v1–v2 closures run UNCHANGED against the 0017 DB (their
literals and shapes are asserted untouched by (b)/(e)).

---

## Prestate fixtures (the rig battery's stage; 16-migration prestate + these rows)

Throwaway PG17 (CI `postgres:17` service or scratch schema), migrations 0001–0016
applied, then: **Firm A** (two bookkeepers + one admin — distinct-checker paths) and
**Firm B** (ONE eligible approver — the solo-attestation variant; plus cross-firm
SECURITY DEFINER probe target). Firm A clients: `active` with approved entry history
(dated-TB fixtures spanning the as_of boundary; the BEE equity fixture: prior TB
105,000.00, closing net equity Dr 65,747.97), `archived`, and (minted in-test via O3)
`onboarding`. CoA per client: full grammar-conformant seed incl. `rounding`, control
accounts with `account_class`, and (post-apply) OBE/RE markers via `upsert_account`.
Documents: a verified+filed `opening_balance_doc` (sha fixture), a
`management_account` (B-12/RPR variant), a `prior_gl` candidate (pdf AND xlsx —
classify vs human-stamp paths), a `consent_evidence` row (exclusion probes), an
unclassified pdf on the onboarding client (O8 row 6). Counterparties: live canonical
vendor, merged, retired, customer — the S3/trigger floor probes; ONE live
`vendor_account` rule + **an EMPTY `rule_sightings` pool asserted pre- and
post-battery** (K13/S5). An open `compliance_watch` on the active client (K11
bit-unchanged probe). Wake credentials of each kind (O8 row 3). op_receipts replay
fixtures per new writer. Event-seq watermarks captured pre-battery for
checkpoint-seeding and projection-lag probes.

## Rig battery map (contract-blind; cut from the pins alone — ADR-029 discipline)

O1/O2/O8 — every matrix row's negative + positive test · O3/O4 — birth → commit
lifecycle; commit refuses on unresolved must-ask / stale plan revision / missing
opening position; cancel → archived · O5 — plan CAS refusal after park; revisions
append-only; runtime-writer attribution floor · O6 — origin swap admits the value;
zero writers emit it; `_open_question_core` still refuses it (unwidened — the
documented duplication) · O7 — create_firm retry-with-same-op_key replays
byte-identically; different-op_key CLR04; token never double-consumes · K1 — second
semantic seed RAISES; cancelled seed frees the slot · K2 — item CHECK matrix (SST
fields only on ar/ap, all-or-none; counterparty per kind; unique item_key re-run =
zero writes) · K3 — the generic writers still hardcode `is_opening_balance=false`;
OB writer refuses control/OBE/RE accounts in `gl_balance` lines; keyed lane memo
basis; BEE fixture exact · K4/K5 — tie holds to the sen or approval RAISES; OBE nets
zero; maker≠checker per entry; solo attestation on Firm B; serializable asserted;
receipt replay; approve leaves `rule_sightings` unchanged (K13) · K6 — supersede
corrects one item at the as_of; one-approved-reversal cap respected; tie re-asserted ·
K7 — marker CHECKs + uq_coa_special one-per-client · K8/K9 — FA writer NOT NULL
floor; non-straight-line refusal (FORK-7); per-asset cost/accum/NBV tie; immutability
trigger allowlist · K10 — dated TB vs 1-arg TB equivalence at `as_of=today`;
INVOKER/RLS scope probe · K11 — watch figures bit-unchanged; coverage flip ·
K12 — reopen → additive batch → whole-set tie · S1–S4 — parse→batch→tick: control
account refused at parse; unbirthed vendor birthed first; duplicate_live CLR27; tick
floor admin+; unticked stays proposed; batch state machine · S5 — zero sightings,
zero autopost, zero new coding_rules columns · W1–W3 — page/version state machine;
citation floor; consent_evidence refused; cap refusals at the writer (L7 hard side) ·
W4 — projection receipts terminal set; seq-embedded op_key idempotence; rebuild-by-
replay reproduces the index bit-identically with zero model calls · W6 — pack v4:
v3 keys byte-identical; wiki block ONLY under purpose+marker (FORK-6) — the frozen-
literal probe (v7 purpose WITHOUT the GUC ⇒ dark); lag marker = checkpoint seq ·
W8/WB-R6 — dependency audit passes; draft authority path bit-identical with/without
wiki rows (the W2 probe's DB half) · L1–L4 — one-open-episode dedupe; transition-only
events (converged pass takes no event-seq lock); tie watch fires on a back-dated
post; retired-filing finding · L5 — queue row + counts + guard join; pre-0017
envelope degrade; unknown-kind never rendered for lint (dashboard parity test
referenced) · L6 — notification exactly-once per episode · G2/G3/G5 — the full tail
battery re-run as rig assertions (grants, allowlist, prosrc, seeds) · RLS — cross-firm
probes on EVERY new table and DEFINER fn (Firm B actor against Firm A objects).

## Post-verify checklist (after apply on the rig AND after the live ceremony)

1. `\d+` / catalog sweep: every G5(a) constraintdef; new tables under
   `clara_fn_owner`; FORCE RLS + policies on every new table.
2. G5(b)–(g) re-run out-of-txn (the 0016 lesson: in-migration asserts ran once —
   re-verify live).
3. Pack probe: `get_context_pack(<client>,'chat')` → `pack_schema_version` 4, NO
   wiki key; the v7-purpose + marker path → wiki block present with lag marker.
4. Queue probe: envelope has `lint` + `counts.lint_findings`; a pre-0017 dashboard
   build renders without crash (mapper degrade).
5. Replay probes: one K5 approval + one W3 publish + one S4 tick re-invoked with the
   same op_key → byte-identical receipts, zero new rows.
6. `rule_sightings` count unchanged across the whole verify pass; `wiki_budgets` =
   the four WB-R8 values; `wake_fn_allowlist` row count unchanged from 0016.
7. Live ceremony extras (owner-gated, WB-R18): Supavisor headroom FIRST (~26/60 +1);
   backup fresh; write-quiesce → atomic apply → runtime v25; the Storage wiki policy
   pair applied in the Supabase SQL editor (W5 — NOT in the migration; the rig cannot
   test it) + one wiki put/verify probe; rollback preflight (non-terminal runs) before
   AND after — v25 is forward-only once the first interview parks.

## Runtime/dashboard consumers (v25 — OUT of migration scope; references only)

- **chatTurn_v7 + autoDraft_v3** (WB-R7: same ceremony): six-file byte-copies each
  (.ts/.impl/.tools/.infra/.prompt/.errors → .v7/.v3), exports/specifiers renamed per
  the fail-closed registry grammar; registry repoints + keeps v6/v2 re-exports; freeze
  manifest append-only 53→65 via local `pnpm freeze:update`. v7/v3 carry: the new
  purpose literal at all four call sites, the FORK-6 marker GUC set server-side in the
  tool txn, the tool schema pinning `purpose` to a literal enum, wiki framing +
  citation-visible-reasoning prompt law (WB-R6(4)), the W2 sweep probe surface.
- **Interview workflow family** `[FORK-8 lean]`: `firmInterview_v1` +
  `clientOnboarding_v1` — "use workflow" + @frozen, own impl modules (never
  steps.ts), memoized hook-token per question, `open_interruption` park (≥48h, Gate
  O), per-segment checkpoints + O5 plan writes via `clara_runtime`, OBO minted
  per-step post-resume (secrets never cross step boundaries or checkpoints), enqueue
  via `start(workflows.<class>, …)` registry provenance.
- **wiki_projection consumer**: sst-watch clone (own name/advisory lock/dead-letter/
  LISTEN session; +1 Supavisor session ≈27 — headroom check first); ceremony seeds
  its checkpoints at head + runs the deterministic backfill belt (W4); health fn
  queries only 0005-era spine tables; startWorld budget comment REWRITTEN by
  walk-the-code, never incremented blindly.
- **lint belt**: leader-phase sibling (`lintReconcileDue` + `lastLintRun`,
  finite-guarded env, first-cycle-at-boot, ok-gated advance; per-client statements,
  `run_lint_all` receipt LAST) — zero new sessions; module split
  `reconciler-lint.mjs`.
- **Dashboard**: `lint_finding` QueueRowKind + `finding_id` + counts key + gated tile
  + QueueRowView title/severity chip + QueueDetail branch + LintFindingCard on
  `get_lint_finding` (useCard discipline; no envelope-regex wart) + a queue-kind
  parity test (the missing gate the 0016 wart exposed); tick-list surface = the
  BatchApprove interaction precedent (N independent `tick_seeding_proposal` calls,
  per-row outcomes, opt-in ticks) — distinct from the K5 single-txn carry-down
  approval (the two ceremonies must never blur); onboarding/dry-run surfaces
  (plan card, `get_opening_dryrun` deltas, commit verb) as object-level verbs (P15);
  client pickers BADGE `onboarding`, never filter (the takeover upload must target
  them); new ClaraPart members (plan/interview parts) land with catalog entries +
  render branches + fixtures in one atomic change, emitted only from v7.
- **Egress registry**: the wiki-synthesis purpose entry in the governed-egress
  registry (WA2-R2 envelope) + consent revocation → W9 hold path — runtime ceremony
  item.
- **Backup**: no wiring change (same-bucket wiki keys ride the `firm-docs` mirror);
  the post-ceremony backup run re-proves zero-501 with wiki objects present.
