# Migration 0017 — interface pins (Wave B: knowledge + onboarding)

**Status: DRAFT for orchestrator review (NOT ratified, NOT for build).** Implements
`wave-b-contract.md` v1.0 (ADR-032, rulings WB-R1..R18, pins P1–P19 as amended §2).
Bound to the as-built surfaces in `docs/plan/research/wave-b/0017-asbuilt-reference.md`
(108 extracted surfaces; re-verify any surface against the named migration file before
relying on it in code). Format precedent: `wave-a2.1-migration-0016-design.md` /
ADR-029 discipline — the blind build lane and the contract-blind test battery are cut
from the numbered pins alone; deviations go back through the orchestrator, not into code.

House law (unchanged): 0017 is **ONE atomic transaction** applying clean to the
16-migration prestate · same-arity CoRs only (arity change = DROP+recreate = ACL reset —
avoid; where unavoidable, re-grant + tail-assert) · table ALTERs run as the migration
superuser, new tables/writers under `set role clara_fn_owner` (0014:46-48 / 0011-0016
idiom) · every writer rides `_reserve_op`/`_finish_op` · `_append_event` is the LAST
call in every writer txn (C4) · tail battery: PUBLIC revoke sweep → named grants →
constraintdef/prosrc/ACL/allowlist assertions · rig-validated on throwaway PG17 before
anything live · the deploy ceremony (backup → quiesce → atomic apply → runtime v25) is
WB-R18's single owner-gated event, Supavisor headroom check FIRST.

Hard laws restated for the blind lanes: the DB owns every number; one audited fn per
mutation class; the agent role is structurally read-only and **gains zero EXECUTE
anywhere in 0017**; the wiki never feeds any gate/bound/floor/autopost fn (WB-R6,
dependency-audited in the tail); no sightings from prior GL ever; opening entries are
human-lane high-stakes (CLR05 per entry); reverse-not-delete; never a credential
anywhere.

---

## OPEN FORKS — ADJUDICATED (orchestrator, 2026-07-23)

Each fork was a genuinely open design choice the contract does not settle. The blocks
below are designed against the stated lean, marked `[FORK-n]`. **Adjudication: ALL EIGHT
leans are RATIFIED as written** — FORK-1 (a) `opening_items` · FORK-2 reserved-value,
zero writers, NO blocks-exclusion · FORK-3 must-asks are plan items only · FORK-4 (a)
`'prior_gl'` kind · FORK-5 (a) seeded config table · FORK-6 **(b)** purpose literal AND
the txn-local `clara.pack_consumer` GUC (the wake-secret-GUC precedent; this HARDENS the
ratified P5/WB-R6(2) structural claim against the model-supplied-purpose hazard — a
strengthening, not a behavior change) · FORK-7 **(b)** refuse-per-asset, **with this
nuance pinned: only the FA REGISTER row defers — the asset's cost/accum-dep GL amounts
still carry in the opening set so the OBE tie and the TB tie-out hold; the plan
'still to capture' item covers the register row, completed via B-12** · FORK-8 two
registry classes (`firmInterview_v1`, `clientOnboarding_v1`). No pin re-cuts required;
the marked pins are now binding as designed.

- **FORK-1 — WB-R11 SST-fact home.** Open AR/AP items are `journal_lines` against
  `account_class in ('payable','receivable')` control accounts (no `ar_items`/`ap_items`
  exist; lines are immutable post-approval). Options: (a) a NEW typed `opening_items`
  table, one row per carried item, 1:1 with its OB entry, carrying the SST facts +
  item metadata; (b) typed columns on `journal_lines`; (c) a general opening-items
  subledger intended to grow into Wave C/F. **Lean: (a)** — journal_lines stay untouched
  (immutability + wrong grain), and a full subledger is Wave C/F's decision, not ours;
  `opening_items` is scoped to carry-down and is what Wave C (bank granularity) and
  Wave F (SST fields) read.
- **FORK-2 — `_open_question_core` widening vs direct-insert for an onboarding
  origin.** The origin vocabulary is duplicated (table CHECK + the core's inline
  whitelist, 0011:1911); 0016's precedent widened only the CHECK and direct-inserted.
  **Lean: neither in 0017** — the CHECK swap admits `'onboarding'` as a RESERVED value
  (contract §3 B3 letter) but 0017 ships ZERO writers using it; a future writer uses the
  0016 direct-insert precedent. The blocks-exclusion is decided NOW (silence = CLR26
  block): `'onboarding'` does NOT join the `rule_proposal` exclusion in
  `_open_question_blocks` — if the value is ever written, it blocks coding on that
  client (Layer-2 must-ask semantics), and that is intentional.
- **FORK-3 — do interview must-asks touch `open_questions` at all?** WB-R1 says they
  live on the plan object and block ONLY the commit. **Lean: NO** — must-asks are
  `onboarding_plan_items` rows (`item_kind='must_ask'`, `required_for_commit=true`);
  `open_questions` gets no onboarding rows in Wave B (see FORK-2's reserved value).
- **FORK-4 — the prior-GL document kind.** `document_kind` has
  `'opening_balance_doc'`/`'management_account'` but no prior-GL kind; the 18-kind
  vocabulary is duplicated inside `classify_document` (0016:3202-3206). Options:
  (a) add `'prior_gl'` (CHECK swap + `classify_document`/`set_document_kind` re-create +
  prosrc tail asserts); (b) ride `'management_account'`/`'other'`. **Lean: (a)** — the
  B5 seeding lane and Gate R2 need unambiguous discovery of the seeding source, and the
  classifier can legitimately emit it for pdf/image prior-GL; the swap cost is known and
  the idiom exact. Spreadsheet prior-GL (never reaches classify) is stamped
  `set_document_kind` by the onboarding staff — required by the O8 guard anyway.
- **FORK-5 — where the WB-R8 budget values live.** "Mechanism = law; values = named
  config, retunable by ADR." Options: (a) a system-maintained migration-seeded config
  table (the `sst_threshold_schedule` precedent — no firm-editable writer); (b)
  constants inline in fn bodies with prosrc tail asserts. **Lean: (a)** — a
  `wiki_budgets(budget_key pk, value_int, note)` table seeded in 0017; retune = a
  one-row migration recorded as an ADR; fns read it (no magic numbers in prosrc).
- **FORK-6 — hardening the pack-v4 purpose gate.** P5 (as amended) says the wiki block
  renders ONLY for the new v7 purpose literal — but the as-built `get_context_pack`
  TOOL takes `purpose` as a MODEL-SUPPLIED free string in every frozen closure v2–v6
  (chatTurn.v6.tools.ts:236-240; autoDraft.v2.tools.ts:203-207), so a purpose-literal-only
  gate is not structural against a prompt-injected frozen consumer — violating
  WB-R6(2)'s STRUCTURAL claim. Options: (a) purpose literal only (contract letter;
  accept + document the injection residue); (b) purpose literal AND a txn-local
  consumer-marker GUC (`clara.pack_consumer`) set only by v7/v3 server-side tool code
  (frozen closures cannot supply it — their SQL is hash-locked), plus the v7 tool schema
  pinning `purpose` to a literal enum; (c) a new fn name for the wiki-bearing pack.
  **Lean: (b)** — it keeps P5's purpose-literal mechanism as the gate key and adds the
  second discriminator the as-built hazard demands; (c) forks the pack surface and
  breaks the single-snapshot/books_version discipline for consumers that need both.
- **FORK-7 — non-straight-line depreciation at carry-down (P8 delegated decision).**
  `fixed_assets.depreciation_method` is CHECK-locked to `'straight_line'`. Options:
  (a) widen the CHECK now; (b) REFUSE per asset at carry-down with a typed refusal and
  a plan `'still to capture'` item, keeping the CHECK until Wave D ships an executor.
  **Lean: (b)** — widening without a Wave D depreciation engine invites junk baselines;
  the refusal is visible (owner's visibility-over-constraint preference) and B-12
  completes the asset later.
- **FORK-8 — interview workflow registry class naming (runtime scope, but FOREVER).**
  `REGISTRY-CLASS-REMOVED` makes a registry class permanent once added. Options: one
  `interview` class vs separate `firmInterview` / `clientOnboarding` classes. **Lean:
  two classes** (`firmInterview_v1`, `clientOnboarding_v1`) — the two interviews have
  different lifecycles (Gate F vs Gate O), different park profiles, and independent
  version cadence. Named here so v25 does not decide it ad hoc.

---

## Block W — the wiki core (B1: Layer-1 tables, writers, projection, pack v4, budgets)

**W1 — `wiki_pages` (the index).** New table, `clara` schema, created under
`clara_fn_owner`, full 0007 RLS posture (FORCE RLS + owner policy + `jwt_firm()` /
`wake_firm()` read policies + explicit `clara_runtime` SELECT grant; zero app-role DML):

- `wiki_pages(id uuid pk default gen_random_uuid(), firm_id uuid not null, client_id
  uuid not null, slug text not null CHECK (slug ~ '^[a-z0-9][a-z0-9/_-]{0,199}$'),
  page_kind text not null CHECK IN
  ('profile','counterparty','treatment','recurring_pattern','open_question','period_context')
  (the P2 ratified taxonomy), title text not null CHECK (btrim(title) <> ''),
  counterparty_id uuid null, current_version_id uuid null, state text not null default
  'active' CHECK IN ('active','retired'), retired_at timestamptz, retired_by uuid,
  retire_reason text, created_at, updated_at)`.
- Constraints: `unique (client_id, slug)`; `unique (id, firm_id, client_id)` (child-FK
  anchor, the 0011 counterparty idiom); FK `(client_id, firm_id)` →
  `clients (id, firm_id)` via `uq_clients_id_firm` (0007:59); CHECK
  `ck_wiki_pages_counterparty`: `(page_kind='counterparty') = (counterparty_id is not
  null)`, with composite FK `(counterparty_id, firm_id, client_id)` → counterparties
  (the C2 cross-link pin: counterparty narrative keys to the ENTITY id);
  `ck_wiki_pages_retired`: retired fields all-or-nothing with `state='retired'`.
- `projected_through_seq` does NOT live here — projection lag is read from
  `relay_checkpoints` for consumer `'wiki_projection'` (W6), one source of truth.

**W2 — versions, citations, refs, and the append-only wiki log.**

- `wiki_page_versions(id uuid pk, page_id uuid not null, firm_id, client_id,
  version_n int not null CHECK (version_n >= 1), content text not null CHECK
  (octet_length(content) between 1 and 65536) (sanity ceiling — the BINDING cap is the
  W7 config value, writer-enforced), content_sha256 text not null CHECK
  ('^[0-9a-f]{64}$'), storage_key text not null CHECK (storage_key ~ ('^firms/' ||
  firm_id::text || '/wiki/' || client_id::text || '/' || content_sha256 || '[.]md$')),
  size_bytes bigint not null, state text not null CHECK IN
  ('uploaded','verified','published','superseded') (the P17 upload→verify→publish
  ladder + supersede), synthesis text not null CHECK IN ('deterministic','model'),
  engine_id text CHECK ((synthesis='model') = (engine_id is not null)),
  projected_from_seq bigint, created_at)` — `unique (page_id, version_n)`; composite
  firm/client FKs; **DB-mirrored content is the pack-injection surface** (a DB fn
  cannot read Storage); the Storage object is the durable immutable artifact and
  `content_sha256` ties the two (writer verifies `content_sha256 =
  encode(digest(content,'sha256'),'hex')`).
- `wiki_page_citations(id, version_id fk, firm_id, source_kind text CHECK IN
  ('document','entry','counterparty','human_note','prior_gl_line'), document_id uuid
  null, entry_id uuid null, counterparty_id uuid null, detail jsonb not null default
  '{}', created_at)` — per-kind ref-presence CHECK; ≥1 citation per published version
  is writer-enforced (provenance-cited law, P2/P11). `consent_evidence` documents are
  REFUSED as citation targets (the CLR28 class re-asserted in the writer — a Wave B
  reader over extractions bypasses `classify_document`'s gate and must re-assert).
- `wiki_page_refs(id, page_id fk, ref_kind text CHECK IN
  ('wiki_page','counterparty','document','entry','account'), ref_page_id uuid null,
  counterparty_id uuid null, document_id uuid null, entry_id uuid null, account_code
  text null, created_at)` — per-kind exactly-one-target CHECK (interlinking, P2).
- `wiki_log(id, firm_id, client_id, page_id uuid null, action text CHECK IN
  ('ingest','publish','supersede','retire','lint_pass','hold','release'), actor_kind
  text CHECK IN ('runtime','human'), actor uuid null, detail jsonb not null default
  '{}', created_at)` — **append-only trigger** (no UPDATE/DELETE, the
  `compliance_watch_events` idiom). Every W3 writer appends here in-txn.

**W3 — the audited writer family (one fn per mutation class; all SECURITY DEFINER,
`set search_path = clara, pg_temp`, `_reserve_op`/`_finish_op`, `_append_event` LAST).**

- `publish_wiki_page_version(p_client uuid, p_slug text, p_page_kind text, p_title
  text, p_counterparty uuid, p_content text, p_content_sha256 text, p_storage_key
  text, p_citations jsonb, p_refs jsonb, p_synthesis text, p_engine_id text,
  p_projected_from_seq bigint, p_op_key text) returns jsonb` — **GRANT clara_runtime
  ONLY** (the projection consumer + the interview/seeding runtime steps; the
  `evaluate_sst_watch` plain group-role pattern, no login-direct dance). Behavior:
  firm hard-scoped in SQL (runtime RLS is `using(true)` — 0008 law); client must be
  `status in ('active','onboarding')` (wiki seeding happens pre-commit; O8);
  creates-or-versions the page (`version_n = prior + 1`; prior `published` row →
  `superseded`; `current_version_id` pointer swap — "every edit reversible" = new
  version + pointer, WB-R9); sha verified against content; W7 budgets enforced
  (page-size cap on `octet_length(content)`; page-count cap when minting a NEW slug —
  typed refusal, never silent truncation); ≥1 citation; `wiki_log('publish')`;
  `_append_event('wiki.page_published')` LAST with the P17 immutable-metadata payload
  `{page_id, slug, page_kind, version_n, storage_key, content_sha256, size_bytes,
  synthesis, engine_id}` — enough to rebuild the index by replay, never re-synthesis.
- `record_wiki_source_ingest(p_client uuid, p_document uuid, p_note text, p_op_key
  text) returns jsonb` — GRANT clara_runtime ONLY. The **deterministic ingest** lane
  (WB-R10): registers the source into the index (a stub/verbatim-extract page,
  `synthesis='deterministic'`) with a `document` citation; NO model call, NO consent
  required; refuses `consent_evidence` (CLR28 class); `wiki_log('ingest')` +
  `_append_event('wiki.source_ingested')`.
- `retire_wiki_page(p_page uuid, p_reason text, p_op_key text) returns jsonb` — human
  lane, `_human_ctx(role_rank('bookkeeper'))`, GRANT clara_authenticated. State flip +
  `wiki_log('retire')` + `_append_event('wiki.page_retired')`. Retire is
  reverse-not-delete: versions and Storage objects are never deleted.
- **Query stays pure (P17):** no wiki read fn writes anything; "file the analysis
  back" is the runtime dispatching `publish_wiki_page_version`, never a read fn
  side-effect.

**W4 — the projection consumer contract (runtime v25 clones the sst_watch template;
DB side pinned here).** Consumer name `'wiki_projection'`; dedicated `clara_runtime`
LISTEN client on `clara_events` (never a new channel; empty-payload nudges only);
own advisory lock via `hashtext('wiki_projection')`; relay primitives verbatim.
Subscription is a SET of input event types (the one sanctioned deviation from the
single-type template): minimally `{'document.classified','entry.approved'}` + the
counterparty-lifecycle types as registered in `event_types` at build time (bind the
exact set from the live registry, do not invent names). Effect contract (the
facts-gate receipt pattern): the consumer calls the W3 writers and CHECKPOINTS
terminal-by-design jsonb statuses without retry — `{'projected','already_projected',
'skipped_inactive_client','held_consent','skipped_kind'}`; only a genuine throw
dead-letters (attempt counts in their OWN txn — the matcher idiom); op_key idiom
`'wikiproj:<client>:<seq>'` (seq-embedded exactly-once). **Cold start (decided, not
inherited):** the deploy ceremony seeds `relay_checkpoints` at head —
`insert into relay_checkpoints (consumer, firm_id, last_seq) select 'wiki_projection',
firm_id, n from firm_event_seq` — plus a deterministic backfill pass over pre-0017
finalized documents (the belt-covers-everyone pattern); pre-0017 events carry no wiki
metadata, so full-log replay is wrong by construction. **Rebuild procedure (P17):**
truncate index tables → replay `wiki.page_published`/`wiki.page_retired` events →
re-download content from Storage by `storage_key` + verify `content_sha256` — an LLM
is never in the rebuild path.

**W5 — Storage doctrine (ceremony artifacts named now).** Key family
`firms/{firm_id}/wiki/{client_id}/{content_sha256}.md` — content-addressed, immutable,
deterministic (P17). Same private bucket `firm-docs` (the daily rclone mirror covers
wiki bytes for FREE; a new bucket would silently escape the zero-501-proven backup).
Four lockstep enforcement points: (1) the W2 `storage_key` CHECK; (2) a runtime
`safeWikiKey` validator sibling of `safeKey` (storage.mjs:16-22 — the docs regex must
NOT be widened; new fn); (3) a NEW Storage RLS policy pair (INSERT+SELECT only, same
`clara_storage_docs` role) whose name-regex admits ONLY the wiki family — a **ceremony
artifact** (Supabase SQL editor; the local rig has no storage schema; the ceremony
checklist MUST include it or every wiki put 403s in production while passing the rig);
(4) the runtime put path: `putCanonical`-style POST with `x-upsert:false` → verify
(re-download, sha compare) → `publish_wiki_page_version` flips the DB state. Overwrite
is structurally impossible (no UPDATE/DELETE grants); orphan repair treats put-409
(`existed:true`) as idempotent success; a `verified`-but-never-`published` version is
the orphan the repair pass re-drives.

**W6 — `get_context_pack` v4 CoR (pack_schema_version 3 → 4).** Same signature
`(p_client uuid, p_purpose text)`, CREATE OR REPLACE, dual-lane prologue copied
VERBATIM (0016:4266-4288 — the wake-secret GUC presence is the lane marker; never a
new discriminator for lanes). Every v3 key byte-identical and in the same build order;
the `wiki` block APPENDED LAST; `'pack_schema_version',4`. The wiki block renders ONLY
when BOTH hold `[FORK-6 lean]`: (a) `p_purpose` = the new v7 purpose literal (pin the
literal at build; it is also the autoDraft_v3 wrapper literal), AND (b)
`current_setting('clara.pack_consumer', true)` equals a v25-only marker set txn-locally
by v7/v3 server-side tool code (`select set_config('clara.pack_consumer', ..., true)`
inside the same readScoped txn — frozen v2–v6 closures structurally cannot supply it;
their SQL is hash-locked) — OR the caller is the human lane (dashboard onboarding/
dry-run surfaces read the wiki block without a GUC). For every other caller the block
is ABSENT (additive-but-dark, P5). Block shape (the 0016 framing-key idiom): `'wiki':
{last_projected_seq (from relay_checkpoints consumer='wiki_projection' for v_firm, in
the SAME snapshot as books_version — WB-R3 lag surfaced, freshness token stays
authoritative), held boolean (W9), budget {pages, bytes} (the W7 values used), pages
[{slug, title, page_kind, version_n, updated_at, citations[], content}],
'basis','clara_maintained_advisory_notes', 'permitted_use','inform_never_decide'}`.
Page selection = the budgeted-CTE running-window idiom (get_document_extract
0011:3283-3287) with `ord` = relevance rank (rank: page_kind priority profile <
period_context < treatment < recurring_pattern < counterparty < open_question, then
`updated_at desc`), budgets read from `wiki_budgets` (≤6 pages AND ≤12 KB — WB-R8),
never inline literals. The pack body stays ONE data-reading statement (books_version
shares the snapshot; N4). Tail prosrc asserts: `'pack_schema_version',4` present,
the v7 purpose literal present, `'sst_registration_watch'` +
`'surface_and_request_professional_review_only'` STILL present (v3 keys re-asserted —
the 0016 self-check only ran in 0016's txn).

**W7 — budgets as named config `[FORK-5 lean]`.** New table `wiki_budgets(budget_key
text pk, value_int bigint not null CHECK (value_int > 0), note text not null)` —
system-maintained, migration-seeded, **no firm-editable writer exists** (the
`sst_threshold_schedule` precedent); retune = a one-row migration recorded by ADR.
Seeds (WB-R8 ratified values): `('max_pages_per_client', 40)`, `('max_page_bytes',
8192)`, `('pack_max_pages', 6)`, `('pack_max_bytes', 12288)`. Consumers: the W3
writers (caps), the W6 pack CTE (injection budget), the L belt (cap findings).
Tail-assert the four seeded rows exist with these exact values.

**W8 — wiki read fns (query verb).** `get_wiki_page(p_client uuid, p_slug text)
returns jsonb` and `list_wiki_pages(p_client uuid) returns jsonb` — STABLE SECURITY
DEFINER, `_human_ctx(role_rank('viewer'))` human lane; GRANT `clara_authenticated` +
`clara_runtime` (the belt and interview steps read them). **NO agent-lane prologue and
NO `clara_agent_ro` grant** — 0017 keeps the 0016 "agent gains zero execute" rule; the
agent receives wiki content ONLY via the purpose-gated pack (W6). Pure reads (P17):
zero writes, zero side effects.

**W9 — consent/egress (WB-R10).** Model synthesis rides the existing WA2-R2 envelope +
governed-egress registry (runtime-side registry entry for the wiki-synthesis purpose —
a v25 ceremony item, referenced in the consumers section). DB piece: per-client hold
surface `wiki_synthesis_holds(client_id pk, firm_id, reason text not null, since
timestamptz not null default now())` + runtime-granted writers
`set_wiki_synthesis_hold(p_client, p_reason, p_op_key)` /
`clear_wiki_synthesis_hold(p_client, p_op_key)` (`wiki_log('hold'/'release')`).
Consent absent/revoked ⇒ the projection consumer receipts `held_consent`, sets the
hold, and the pack's `wiki.held=true` + an L-block finding make the claim-boundary
state VISIBLE; deterministic ingest (W3) continues regardless — onboarding stays
functional without consent.

**W10 — wiki event kinds + WB-R6 negative surface.** Event types registered via the
additive-pair taxonomy idiom (0016:421-433), all decision **'ignore'** (bulk
projection types never 'notification' — a held-outbox flood otherwise):
`wiki.page_published`, `wiki.page_retired`, `wiki.source_ingested` (all
client-scoped). **WB-R6 structural negatives (designed here, asserted in G5):** (1)
no gate/bound/floor/autopost fn's prosrc references `clara.wiki_` (named-list scan:
`_approve_entry_core`, `_draft_entry_core`, `draft_entry`, `wake_draft_entry`,
`approve_entry`, `execute_rule_post`, `propose_coding_rule`, `sign_coding_rule`,
`propose_autopost_rule`, `sign_autopost_rule`, `reconcile_autopost_rules`,
`_assert_supplier_bill_shape`, `is_high_stakes`, `assert_client_resolved`,
`assert_books_current`, `assert_provenance`, `_open_question_blocks`,
`evaluate_sst_watch`, `coding_lane`, plus every K/S-block writer); (2) the generic
inverse scan: every fn whose prosrc references `clara.wiki_` must be in the enumerated
wiki-family whitelist (the 0016:5218 aclexplode+prosrc idiom); (3) rig probe: a draft
proposed with and without wiki content present takes a bit-identical authority path
(WB-R6(3) — the runtime W2 gate probe references this pin); (4) a wiki-informed draft
carries the citation in its visible reasoning (v7 prompt law, consumers section).

---

## Block O — onboarding (B3: lifecycle status, the shared guard, plan object, firm wrap)

**O1 — `clients.status` swap (WB-R1).** The CHECK is system-named inline
(0003:38, never altered): drop by the **find-by-definition DO-block** (0016:189-201
idiom — locate via `pg_get_constraintdef(con.oid) ilike '%status%'` and
`ilike '%archived%'` on `clients` `contype='c'`; raise CLR10 if absent), run as the
migration superuser (NOT `clara_fn_owner` — it does not own the table); re-add NAMED:
`alter table clara.clients add constraint clients_status_check_0017 check (status in
('active','archived','onboarding'))`. Pre-assert existing rows conform (trivially true
— widening). Tail-assert `pg_get_constraintdef` for `clients_status_check_0017`
contains `'onboarding'`.

**O2 — the shared client-enumeration guard (NEW; no shared guard exists as-built).**
Two internal ungranted fns under `clara_fn_owner`:

- `clara._client_operational(p_client uuid) returns boolean` — STABLE predicate
  (`exists (select 1 from clara.clients where id = p_client and status = 'active')`)
  for set-based use (queue CTEs, enumerators join it or inline
  `c.status = 'active'` WITH a comment citing this pin).
- `clara._assert_client_operational(p_client uuid, p_firm uuid)` — raises CLR11 on
  firm mismatch, CLR10 `'client is not active -- operational consumers exclude
  onboarding/archived clients (WB-R1)'` otherwise; for writer prologues.

CoR `_draft_entry_core` (same 19-param arity, ungranted internal): the client gate
flips from the archived-only BLACKLIST (0016:4000-4002) to the **active ALLOWLIST**
via `_assert_client_operational` — an `'onboarding'` client is NOT postable through
`draft_entry` / `wake_draft_entry` / the sweep (the as-built hazard: the blacklist
would have made onboarding clients immediately postable). The K-block OB core is the
deliberate sibling that admits `('active','onboarding')` — see K3.

**O3 — `begin_client_onboarding` (the birth verb).** NEW audited fn (a distinct
mutation class — `create_client` stays untouched for frozen consumers):
`begin_client_onboarding(p_name text, p_op_key text) returns jsonb` —
`_human_ctx(role_rank('admin'))` (the B-2 admin+ floor on onboarding), op_key
mandatory, `_reserve_op` hashed over the name; inserts the client with
`status='onboarding'` (real id/CoA/identifier FKs exist for dry-run validation —
WB-R1), mints the O5 plan object in the SAME txn, maps `unique_violation` on
`uq_clients_firm_name` to the create_client refusal text; emits
`client.onboarding_started` + receipt `{client_id, plan_id}`.

**O4 — the commit/activation + cancel verbs.** `commit_client_onboarding(p_client
uuid, p_plan uuid, p_expected_plan_revision uuid, p_op_key text) returns jsonb` —
`_human_ctx(role_rank('admin'))`, GRANT clara_authenticated ONLY (never wake/agent/
runtime). Verifies in one txn: plan belongs to client + revision matches (stale-plan
refusal — the rig gate); every `required_for_commit` plan item resolved (must-asks
block ONLY here — WB-R1); the opening position is either (a) an approved K1 registry,
(b) `first_year_zero_opening` attested on the plan, or (c) an explicit
`carry_down_deferred` plan item (the B-12 lane); flips `status='onboarding'→'active'`
**exactly here** (refuses any other prior status); plan `state='committed'`; emits
`client.activated`; receipt. `cancel_client_onboarding(p_client, p_plan, p_reason,
p_op_key)` — admin+, server-cancel (invariant 13): plan `'cancelled'`, client →
`'archived'` (never was operational; reverse-not-delete leaves all rows in place).

**O5 — the plan-as-document object (P14/P19, WB-R1).** First-class versioned DB
objects, full RLS posture:

- `onboarding_plans(id uuid pk, firm_id uuid not null, scope_kind text CHECK IN
  ('firm','client'), client_id uuid null CHECK ((scope_kind='client') = (client_id is
  not null)), state text not null default 'open' CHECK IN
  ('open','committed','cancelled'), revision_token uuid not null default
  gen_random_uuid(), revision_n int not null default 1, committed_at/by, cancelled_at/
  by/reason (all-or-nothing CHECKs per state), created_at, updated_at)` — partial
  unique: one open plan per `(firm_id, client_id)` where `state='open'`.
- `onboarding_plan_items(id, plan_id fk, firm_id, item_kind text CHECK IN
  ('must_ask','capture','todo'), item_key text not null, question text, answer jsonb,
  state text not null default 'pending' CHECK IN
  ('pending','answered','resolved','deferred'), required_for_commit boolean not null
  default false, answered_by uuid null, answered_at, created_at, updated_at)` —
  `unique (plan_id, item_key)`. The salvaged 13-Q/11-Q interview content, the B-14
  fixture to-dos (PSR, recurring templates, recon hints — explicit tracked to-dos per
  WB-R18's dissolved list), the B-12 `'still to capture'` checklist, and FORK-7 refused
  assets all land as items. Intended-vs-actual: `onboarding_plan_revisions(id, plan_id,
  revision_n, snapshot jsonb, created_at)` — append-only trigger; every plan write
  appends the post-image.
- Writers (the `checkpoint_turn` precedent — durable-run state is runtime-written):
  `update_onboarding_plan(p_plan uuid, p_expected_revision uuid, p_items jsonb,
  p_answered_by uuid, p_op_key text) returns jsonb` — **GRANT clara_runtime ONLY**
  (the interview workflow steps call it via withRuntime); `p_answered_by` validated as
  an active bookkeeper+ member of the plan's firm (explicit attribution — runtime RLS
  is not the boundary); revision CAS (mismatch = typed stale-plan refusal, the
  ≥48h-park rig gate); P19: interview outputs persist ONLY here + run checkpoints
  until commit — no books/identifier/wiki rows pre-commit except the deliberately
  allowed dry-run FKs (CoA via O9, identifiers via the existing writers, documents via
  O8 filings, K drafts). Human dashboard edits ride
  `resolve_onboarding_plan_item(p_plan, p_item_key, p_resolution, p_op_key)` —
  bookkeeper+, GRANT clara_authenticated (the workbench verb; agent-native test P15).

**O6 — `open_questions` origin swap (RESERVED value) `[FORK-2/FORK-3 lean]`.** Drop
`open_questions_origin_check_0016` BY NAME (it is named — never the DO-block dance
here); re-add `open_questions_origin_check_0017` with
`('clarify_promotion','rule_proposal','rule_conflict','sweep_refusal','manual',
'classification','onboarding')`. **Zero 0017 writers emit `'onboarding'`** (must-asks
are plan items); `_open_question_core`'s inline whitelist is NOT widened (the 0016
direct-insert precedent governs any future writer); `_open_question_blocks` is NOT
CoR'd — the decided semantics (documented in the migration comment): an
`'onboarding'`-origin open question, if ever written, BLOCKS coding on that client
(does not join the `rule_proposal` exclusion). Tail-assert constraintdef contains
`'onboarding'`.

**O7 — `create_firm` receipt-wrap CoR (WB-R1, Gate F).** Same-arity CoR of
`create_firm(p_name text, p_admission_token uuid, p_op_key text)` (0005:596-620) +
two new columns on `firm_admissions`: `consumed_op_key text`, `consumed_result jsonb`.
New behavior: token consumption stamps `consumed_op_key = p_op_key` and
`consumed_result = <the return jsonb>`; a retry that finds the token consumed compares
`consumed_op_key` — match ⇒ **replay `consumed_result` byte-identically** (the durable
firm-interview commit step becomes exactly-once across runtime kills); mismatch ⇒
CLR04 unchanged (`'invalid or consumed admission token'`). op_receipts stays unusable
here by construction (no firm_id exists pre-commit — the documented exception
stands); the receipt lives on the token row instead. Tail prosrc assert on
`consumed_op_key`. The firm interview's pre-commit state lives ONLY in run checkpoints
(P19); a `scope_kind='firm'` plan row is minted immediately AFTER `create_firm`
succeeds (intended-vs-actual record for member setup + first client).

**O8 — the per-consumer routing audit (WB-R1 — the matrix IS the spec; each row gets a
contract-blind negative test).** Two directions: operational consumers EXCLUDE
non-active; intake/filing surfaces WIDEN to admit `'onboarding'` (the takeover pack
must be fileable — real FKs for dry-run).

| # | Consumer (as-built site) | 0017 change | Blind test |
|---|---|---|---|
| 1 | `_draft_entry_core` client gate (0016:3995-4002, archived blacklist) | flip to `_assert_client_operational` (O2) | draft_entry + wake_draft_entry on an onboarding client ⇒ CLR10; on active ⇒ ok |
| 2 | autodraft sweep lane (`coding_lane`, sweep enumerators over document_filings) | guard join `_client_operational` | onboarding client with uncoded filings ⇒ zero sweep tasks/drafts |
| 3 | `mint_wake_credential` autodraft kind (0011:1180) | already `status='active'` — cite, keep | autodraft mint pinned to onboarding client ⇒ refused (existing behavior re-asserted) |
| 4 | `list_review_queue` (NO status predicate as-built) | guard join in EVERY row CTE (see L5 CoR) | onboarding client's drafts/filings/questions/tasks/watches ⇒ zero rows; counts exclude them |
| 5 | `evaluate_sst_watch(es_all)` (0016:866 active loop) | already active-scoped — cite, keep | onboarding client with entries ⇒ never examined |
| 6 | classify + facts gate (`_enqueue_invoice_facts_core`) | guard: documents whose active filing is a non-active client receipt terminal `'skipped_client_onboarding'`; onboarding docs get kinds via `set_document_kind` (human — required by the K flow anyway) | pdf filed to onboarding client ⇒ no classify task; terminal receipt shape asserted |
| 7 | lint belt (L3, new) | enumerates `status='active'` only, built-in | onboarding client ⇒ not in lint run receipt |
| 8 | wiki projection (W4, new) | receipts `'skipped_inactive_client'` for event-driven synthesis; W3 writers admit `('active','onboarding')` for the SEEDING lane only | synthesis event for onboarding client ⇒ skip receipt; seeding publish ⇒ ok |
| 9 | `get_context_pack` (NO status predicate) | **deliberate EXCEPTION — unchanged** (interview + dry-run need the pack) | pack for onboarding client returns (positive test); documented in-body comment |
| 10 | `file_document` (0007:1386) + filing move (0007:2447) | **WIDEN** to `status in ('active','onboarding')` | takeover doc files to onboarding client ⇒ ok; to archived ⇒ refused |
| 11 | `record_client_resolution` lane (0009:2311-adjacent) | **WIDEN** same set (filing needs a resolution) | resolution for onboarding client ⇒ ok |
| 12 | K-block OB writer family + batch approval | admit `('active','onboarding')` by design (K3/K5; 'active' = B-12 incremental) | OB draft on archived ⇒ refused; on onboarding ⇒ ok |
| 13 | S-block tick ceremony (`sign_coding_rule` path) | no status gate as-built; rules may go live on an onboarding client (coding lanes stay excluded until activation) — documented, unchanged | seeded rule live pre-activation ⇒ zero autodraft activity until commit (test rides row 2) |

Consumers NOT listed here must be swept at build: the build lane greps every
`status='active'` / `clients` join in 0007–0016 fn bodies + runtime discovery SQL and
either cites this table or adds a row (orchestrator sign-off on additions).

**O9 — the LHDN CoA seed (reference pin; no new DB object).** The B3 seed +
F12-11 marker fixes ride `upsert_account(p_client, p_code, p_name, p_type,
p_special_acc_type, p_op_key, p_account_class)` (0009:1460-1505) — every code conforms
to `'^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$'` (0009:761; no grammar swap); the OBE/RE
markers (K7) land through the same writer once the CHECK admits them; SST markers on
the 460/461-class accounts seed non-NULL (the F12-11 fix); control accounts seed
`account_class` (`'receivable'`/`'payable'`) so K resolves controls by marker, never
literal codes. Seed content is an interview-step/script artifact (runtime scope), NOT
migration payload; the ADR-027 #44 stale-constants class is re-checked at build.

---

**CONTINUED — this design is a three-part set (a repo lint caps files at 500 lines;
the parts are ONE document for ratification purposes):**
**Part 2** `wave-b-migration-0017-design-part2.md` — Block K (carry-down) + Block S
(seeding). **Part 3** `wave-b-migration-0017-design-part3.md` — Block L (lint) +
Block G (cross-cutting) + prestate fixtures + rig battery map + post-verify checklist
+ runtime/dashboard consumers (v25, out of migration scope).



