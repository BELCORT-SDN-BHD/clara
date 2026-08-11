# Slice 3 design contract — the event spine (v2.2 — as landed)

Status: **v2.2** — the contract of record for the Slice-3 build (the finding
tags N*/C*/D*/P*/R*/X* cited in migration 0005, the relay, and the rig
resolve HERE). v1 was amended by BOTH adversarial design reviews and their
DELTA re-reviews: NATIVE SOUND-WITH-FIXES (N1–N13, all accepted) → delta
CLEARED-WITH-NOTES (R1 owner-ruled, R2 recorded); CODEX gpt-5.6-sol xhigh
FLAWED (C1–C18; all accepted except C12 declined→deferred) → delta
STILL-FLAWED with additive residuals D1–D6, ALL integrated (no structural
choice reversed). v2.2 adds the AS-BUILT amendments (§6) from the dual-lane
code review of the finished slice. Authority above this doc: ARCHITECTURE §2
(ADR-007), ADR-009, ADR-015, PROJECTLOG ADR-016, migrations 0002–0004.
**[RATIFIED]** = owner-grilled 2026-07-18. Probe rounds 1+2 PASS (P1–P6).

## v2.1 delta amendments (Codex delta D1–D6 + owner ruling R1)
- **D1 (deploy contract, not a mechanism):** in-flight PL/pgSQL executions
  finish on their STARTING bodies, so a writer running across the 0005
  commit could write without emitting. Materially zero-risk TODAY (no
  runtime is deployed until Slice 4; CI/throwaways have no concurrent
  writers). RULE (recorded in packages/db/README.md by the build):
  **any migration that replaces writer bodies requires an application
  write-quiesce once a live runtime exists.**
- **D2:** the domain_events validation trigger ALSO validates populated
  entry_id/document_id/resolution_id against firm_id (+ client where
  applicable) via lock-free SELECTs; negative tests in the rig.
- **D3:** a minimal idempotent DEAD-LETTER REDRIVE ships IN SLICE 3 (relay
  module op: re-route the event — intent insert is ON CONFLICT DO NOTHING —
  then mark resolved; CLI-invokable).
- **D4:** the P4/P5/P6 schedules + C5 forced deadlock become RIG tests (CI
  runs postgres:17 ⇒ target-version coverage); plus a TWO-VALID-VERSION
  taxonomy flip-mid-drain test (one version per batch txn, correct stamps).
- **D6:** freshness claim narrowed: the DB refuses to COMMIT an agent draft
  whose SUBMITTED token is stale (airtight vs the accidental class);
  token→pack-origin binding is the trusted-runtime contract (Slice 4) +
  deferred C12 hardening.
- **R1 (OWNER-RATIFIED 2026-07-18): archived-client drafting is HARD-BLOCKED
  in the shared core for BOTH lanes** (Tao chose the strict option over
  agent-only and visibility-only). Corrections on an archived client remain
  possible via reverse_entry (it does not call the draft core). A future
  un-archive writer restores full posting.

## 0. Ratified semantics (the six grilled decisions)

1. **[RATIFIED] Staleness scope = client + firm-level.** A pack for client A
   is stale iff a later event affects A: any event with `client_id = A`, or
   any firm-level event (`client_id IS NULL`). Events on other clients never
   stale A's pack. (PM note N12: an UNASSIGNED `document.ingested`
   (client_id null) is firm-level and stales every client's pack — accepted,
   documented asymmetry.)
2. **[RATIFIED] Enforcement = structural DB gate on the agent lane only.**
   `wake_draft_entry` requires a books-version token; the DB RAISEs `CLR12`
   when stale. Human writers unchanged. Honest wording (N8 + C1): the gate,
   WITH the C1 commit-time recheck, guarantees the agent never COMMITS a
   draft made on stale context. LAW clarification to record: ARCHITECTURE
   §2.3 "a write asserts the token" narrows to the wake/agent lane.
3. **[RATIFIED] Uniform emission law.** EVERY audited writer appends its
   domain event(s) in the same transaction — books AND admin writers.
   (Exemption, documented: `mint_/revoke_wake_credential` are runtime
   plumbing, not audited writers — consistent with them not writing
   audit_log. `create_firm` uses admission-token idempotency, not
   op_receipts — a retry fails CLR04 and cannot double-emit — C10c.)
4. **[RATIFIED] Relay output = durable `wake_intents` queue** (exactly one
   row per wake-bound event), stamped with the routing taxonomy version;
   `ignore`/`context_update` advance the checkpoint only. Slice 4 drains.
5. **[RATIFIED] Taxonomy = append-only versions, fail-loud.** Versions are
   immutable; ONE active version via a guarded singleton pointer (C8);
   activation validates full catalog coverage in the same txn; an uncovered
   event type under a live active version dead-letters THAT event; a missing
   /empty active pointer HALTs the relay (N7b). Slice-3 routing is
   event-type-only — the ARCHITECTURE §2.4 predicate dimensions (risk,
   materiality, workflow state, period, freshness) arrive with the slices
   that possess that state; the versioned-data + testability property is
   what is structural now (C16 narrowing, recorded in ADR-016).
6. **[RATIFIED] Context pack = typed pack of what exists** +
   `pack_schema_version` + the token.

## 1. Empirically verified claims

Probe round 1 (probe-slice3.mjs, PG16, PASSED 2026-07-18):
- **P1**: per-firm counter (`update … n = n+1 … returning`) serializes
  allocation; waiter blocks until holder commits/aborts; abort reverts (no
  gap); 10-way race with aborts ⇒ exactly contiguous committed seqs.
  Per firm: **commit order = seq order; committed seqs are gap-free** ⇒ a
  checkpoint reader can never skip a committed event.
- **P2**: CREATE OR REPLACE (same signature) preserves EXECUTE ACLs; adding
  a defaulted param as an overload makes old-arity calls ambiguous ⇒
  signature changes are DROP+CREATE.
- **P3**: NOTIFY is transactional (rollback swallows), incl. from a definer
  fn. (C18: transactional DDL also means the DROP+CREATE+GRANT of
  wake_draft_entry is atomic — no grant-less window; migrate.mjs runs each
  migration in one txn.)

Probe round 2 (probe-slice3b.mjs — MUST PASS before build):
- **P4 (C1 fix)**: the freshness recheck AFTER seq allocation closes the
  check/commit race: T1 gate-passes at token v, T2 commits a relevant event,
  T1 allocates and rechecks over (v, own_seq) ⇒ CLR12-class abort; and the
  abort leaves no gap.
- **P5 (C4)**: with an FK from the counter/log to `firms`, the
  add_member-vs-books-writer interleaving deadlocks (reproduce it); with NO
  FK (the chosen design) the same interleaving completes. 
- **P6 (C17)**: the lazy allocator `insert … on conflict do update … returning`
  is correct under CONCURRENT FIRST-events for a firm (both get distinct
  seqs; an aborted first-event leaves a clean state).
- Native review independently re-verified: counter blocking/commit-order,
  abort-no-gap, partial-unique single-active, ACL preservation, and the
  NOTIFY cross-role LISTEN leak (N1 — any wake-role session receives every
  payload; fix below).
- Deferred to the build's rig (test-first, not design-blocking): the C5
  approve/reverse deadlock reproduction + its fix (needs the replaced fn
  bodies), relay bootstrap >1 batch (C2), split-brain (C3/N6), zero-active
  HALT (N7b/C8), 0005-over-populated-DB upgrade (C9/C17).

## 2. New objects (migration `0005_event_spine.sql`)

All owned by `clara_fn_owner` (SET ROLE), FORCE RLS. **Every new table gets
the owner `using(true) with check(true)` policy** (N9 — a miss bricks the
definer writers; explicitly: event_types, firm_event_seq, domain_events,
taxonomy_versions, trigger_taxonomy, taxonomy_active, wake_intents,
relay_checkpoints, relay_dead_letters). New error code: **CLR12 = stale
context** (0005 header documents; 0002 is immutable).
**0005 ENDS with `revoke execute on all functions in schema clara from
public`** + re-asserted grants — the 0004 ALTER DEFAULT PRIVILEGES revoke is
empirically a NO-OP (Slice-2 lesson), so without the explicit sweep every
new/re-created fn is PUBLIC-executable and any schema-USAGE role (e.g.
clara_agent_ro) could reach wake_draft_entry (N13-upgraded).

### 2.1 `clara.event_types` — catalog (reference data, append-only)
`(name text pk, client_scoped boolean not null, description text)`.
Append-only guards: BEFORE UPDATE/DELETE → CLR08 + BEFORE TRUNCATE guard
(C13 — catalog immutability is trigger-enforced, not just grant-absence).
Catalog (13 types): firm.created(F), client.created(C), account.upserted(C),
member.added(F), member.role_changed(F), member.removed(F),
document.ingested(C, client nullable), client.resolved(C),
entry.drafted(C), entry.approved(C), entry.reversed(C),
notification.recorded(C, client nullable), **books.baseline(F)** (C9 — the
cutover marker; see §2.10). C=client_scoped, F=firm-level.
`mint_/revoke_wake_credential` do not emit (§0.3).

### 2.2 `clara.firm_event_seq` — the per-firm allocator
`(firm_id uuid pk, n bigint not null default 0)` — **NO FK to firms** (C4:
an FK's KEY SHARE on the firms row deadlocks against add_member's
`firms FOR UPDATE`; the writer already validated the firm — same precedent
as journal_entries.firm_id / audit_log carrying no FKs).
Allocation (inside `_append_event`): `insert … values (p_firm, 1) on
conflict (firm_id) do update set n = firm_event_seq.n + 1 returning n` —
lazy creation + atomic increment + row lock in one statement (P6 probes the
concurrent-first-event path). **Called LAST in every writer txn** — the
counter is the last lock taken by every writer (consistent global order ⇒
no new deadlock cycles); serialization window = allocation→commit.
Window honesty (N5): human RPCs are autocommit (statement=txn); the WAKE
lane runs explicit BEGIN…COMMIT, so its window spans a client round-trip —
the Slice-4 runtime pool sets `idle_in_transaction_session_timeout` and
keeps wake write txns tight. Blast-radius honesty: from 0005 on, ALL of a
firm's audited writes serialize at txn tail (availability note).
Access: owner policy; SELECT → clara_runtime only (`using(true)` policy;
N11 work discovery). No other app access.

### 2.3 `clara.domain_events` — the append-only log
```
firm_id       uuid   not null            -- NO FK (C4)
seq           bigint not null            -- per-firm monotonic (P1)
id            uuid   not null unique default gen_random_uuid()
event_type    text   not null references event_types(name)  -- static ref, safe
client_id     uuid   null                -- NO FK; NULL = firm-level
actor         uuid   null                -- NULL only for system/migration events (books.baseline)
on_behalf_of  uuid   null
via_wake_kind text   null
entry_id      uuid   null                -- NO FK (C4); writer-validated
document_id   uuid   null                -- NO FK
resolution_id uuid   null                -- NO FK
payload       jsonb  not null default '{}'
created_at    timestamptz not null default now()
primary key (firm_id, seq)
```
- **Payload law (N2, CONFIDENTIALITY invariant):** id-shaped values only,
  NEVER amounts/figures — clara_runtime reads all firms' events and the
  relay logs rows. Rig-asserted (no amount-shaped fields).
- Validation trigger (BEFORE INSERT), reading with plain SELECTs (no row
  locks — deadlock-free): event_type client_scoped=false ⇒ client_id IS
  NULL; client_id (when set) belongs to firm_id; **_append_event is the
  SOLE legitimate writer/seq allocator** — a superuser raw INSERT bypasses
  it (same documented honesty boundary as audit_log).
- Append-only: BEFORE UPDATE/DELETE → CLR08; BEFORE TRUNCATE guard.
- RLS: owner true; human SELECT `firm_id = jwt_firm()`; agent SELECT
  `firm_id = wake_firm()`; runtime SELECT `using(true)`. SELECT grants:
  clara_authenticated, clara_agent_ro, clara_runtime. Zero write grants.

### 2.4 `clara._append_event(...)` — the single emission helper (ungranted)
`_append_event(p_firm, p_type, p_client, p_actor, p_obo, p_wake_kind,
p_entry, p_document, p_resolution, p_payload) returns bigint` — allocates
seq (§2.2), inserts the event, **`pg_notify('clara_events', '')` with an
EMPTY payload (N1/C7: the channel is database-global and any role may
LISTEN — empirically a wake-role session received cross-firm payloads; the
nudge must carry zero information; the relay treats any nudge as "poll
everything")**, returns seq. SECURITY DEFINER, pinned search_path,
ungranted. Multi-event writers call it repeatedly (re-locks the held
counter row — consecutive seqs).

Writer→event wiring (bodies via CREATE OR REPLACE — P2; the TWO signature
changes are DROP+CREATE — §2.5):
- create_firm → firm.created · create_client → client.created ·
  upsert_account → account.upserted · add_member → member.added ·
  set_member_role → member.role_changed · remove_member → member.removed
- _ingest_document_core → document.ingested · _record_client_resolution_core
  → client.resolved · _record_notification_core → notification.recorded ·
  _draft_entry_core → entry.drafted
- approve_entry → entry.approved (+ entry.reversed for the ORIGINAL when it
  links a reversal mirror). **C5 fix (pre-existing Slice-2 latent deadlock):
  when `e.reversal_of is not null`, approve_entry locks the ORIGINAL
  (`for update`) BEFORE updating the mirror — consistent original-before-
  mirror order with reverse_entry; the rig forces both interleavings.**
- reverse_entry → entry.drafted (mirror) + auto-approve path also
  entry.approved (mirror) + entry.reversed (original).
- Receipts UNCHANGED — no books_version in any receipt (N4: a receipt-
  embedded current token enables token-chaining that defeats re-fetch-after-
  write; the ONLY token source is get_context_pack). ADR-009 byte-identical
  replay holds trivially; legacy receipts need no cutover (C10a dissolved).

### 2.5 Freshness: `clara.assert_books_current` + the wake gate
- `clara.assert_books_current(p_firm, p_client, p_version, p_below bigint
  default null)` (ungranted): RAISE CLR12 iff
  (a) `p_version` exceeds the firm's current max seq (forged-high / future
  token is never "current"), OR
  (b) a relevant event exists in `(p_version, coalesce(p_below, +∞))`:
  `seq > p_version and (p_below is null or seq < p_below) and
  (client_id = p_client or client_id is null)`.
- `_draft_entry_core` gains `p_books_version bigint` — a SIGNATURE change ⇒
  **DROP+CREATE** (N3b/C11; ungranted, no ACL at stake), with draft_entry +
  wake_draft_entry updated in the same migration txn; the rig asserts the
  exact catalog signatures post-0005 (no orphan overload).
- Order inside the core: op_key required → `_reserve_op` (an idempotent
  REPLAY short-circuits BEFORE the freshness gate — a committed op replays
  its receipt even if the books moved) → client-in-firm (+ CLR10 when
  client.status='archived' — C14b: no new postings to an archived client)
  → when NOT p_is_human: `assert_books_current(firm, client, v, null)`
  (fast-fail) → existing guards → work → _audit → `v_seq := _append_event`
  → **C1 COMMIT-TIME RECHECK: `assert_books_current(firm, client,
  p_books_version, v_seq)`** — holding the counter, every seq < v_seq is
  committed AND visible to this READ COMMITTED statement snapshot (P1+P4),
  so a relevant event that landed between the fast-fail check and
  allocation aborts the txn (counter reverts, no gap). The gate is now
  airtight at commit time: **the agent can never COMMIT a draft made on
  stale context.**
- **N3a: `p_books_version` is EXCLUDED from the `_reserve_op`
  request_hash** — a freshness assertion is not part of the operation's
  identity; a retry re-asserting a refreshed token after a CLR12 abort is
  the SAME operation, not a CLR10 mismatch. (C10b took the opposite
  default; decision recorded here: exclusion is deliberate.)
- `wake_draft_entry`: DROP+CREATE with trailing `p_books_version bigint
  default null`; RAISE CLR10 when null (the 0004 required-but-defaulted
  pattern); re-GRANT to clara_wake_interactive + explicit revoke-from-
  public. Human draft_entry passes null to the core (gate skipped).
- Deliberate consequence: Clara's OWN write stales her own pack — the
  runtime re-fetches after every write.
- Other Slice-3 wake writers (ingest/resolution/notification) take no gate
  (not accounting decisions on figures); future wake accounting writers do.
  **R2 (recorded constraint for the future subledger slice):** the C1
  recheck's `p_below = v_seq` is correct ONLY while the gated writer emits
  exactly ONE event. A future gated MULTI-event writer (e.g. ADR-005's
  `code_and_open_ar` emitting entry.drafted + ar_item.opened) must pass
  `p_below` = its FIRST allocated seq — otherwise its own earlier event
  falls inside (token, last_seq) and self-aborts with CLR12.
- **Honesty boundary + C12 (declined, deferred):** the token is a number;
  a DELIBERATE forger reading max(seq) via its SELECT grant can mint a
  fresh-looking token without fetching a pack. The DB gate + C1 recheck
  fully kill the ACCIDENTAL stale class (audit A-7 — the class that
  occurred). Binding token→pack-fetch is the Slice-4 runtime contract
  (runtime injects the pack's token server-side; wake_secret-GUC precedent,
  Slice-2 MEDIUM 14). Codex's cheaper structural options (runtime-issued
  opaque token / HMAC-bound token) are RECORDED AS DEFERRED HARDENING
  (PROJECTLOG PART 2 candidate) — not built now because drafts are
  non-authoritative (human approval + revision token is the authoritative
  gate) and an HMAC secret surface is real added complexity.

### 2.6 `clara.get_context_pack(p_client uuid, p_purpose text)`
**`language plpgsql STABLE security invoker set search_path = clara,
pg_temp`, whose ONLY data read is exactly one statement** — the contract's
earlier "language sql" letter was self-contradictory (a `sql` fn cannot
RAISE the mandated CLR10); the blank-purpose check reads no table, so the
single-statement/single-snapshot guarantee holds in plpgsql (as-built
resolution, sanctioned in the build order and rig-asserted). C14a — the
agent grant rule is "STABLE typed reads only"; STABLE is declared and
catalog-asserted. Granted to clara_authenticated +
clara_agent_ro. CLR10 on blank purpose. ONE single SQL statement (one
snapshot ⇒ `books_version` is exactly the edition of the figures — under
READ COMMITTED a multi-statement assembly could stamp an incoherent token).
Returns jsonb:
```
{ pack_schema_version: 1, purpose, generated_at,
  books_version,            -- max(seq) visible for the client's firm, 0 if none
  client: {id, name, status},          -- archived clients surface status (C14b:
                                       --  and the draft core refuses them)
  firm: {id, name, high_stakes_amount_cents},
  coa: [...], trial_balance: [...],
  recent_entries: [last 50, with lines],
  documents: [last 50], resolutions: [live],
  approval_history: [last 25 — FROM THE BASE TABLES (journal_entries
    approved_at/checker/reversal columns), NOT from domain_events (C9: the
    log begins at the 0005 cutover; base tables are authoritative)] }
```
Invisible/foreign client ⇒ NULL pack (no existence oracle). Build-phase
perf check: pack query cost on a seeded book (C17 note).

### 2.7 Taxonomy: versions + rows + the active pointer
- `clara.taxonomy_versions (version int pk, note text, created_at)` —
  IMMUTABLE rows (no is_active column — C8 redesign), append-only guards +
  no-TRUNCATE (C13).
- `clara.trigger_taxonomy (version int references taxonomy_versions,
  event_type text references event_types, decision text not null check
  (decision in ('internal_task','notification','background_review',
  'context_update','ignore')), note text, primary key (version,
  event_type))` — append-only (a change = full new version + repoint).
- `clara.taxonomy_active (singleton boolean pk default true check
  (singleton), version int not null references taxonomy_versions)` — the
  guarded pointer (C8): exactly one row, INSERTed by 0005; the ONLY legal
  mutation is UPDATE of `version` (trigger-enforced; DELETE/TRUNCATE
  blocked). A future `activate_taxonomy_version(v)` operator fn validates
  FULL catalog coverage of v in the same txn before repointing (0005 seeds
  v1 already-validated; the fn ships when a second version first exists —
  recorded follow-up, not built).
- RLS/grants: reference data — SELECT to clara_authenticated,
  clara_agent_ro, clara_runtime; `using(true)` read policies; owner policy.
- **Seed v1 (active):** document.ingested → background_review; ALL other
  types (incl. books.baseline, notification.recorded, member.*, firm/
  client/account.*, entry.*) → context_update or ignore exactly as v1.1:
  notification.recorded → ignore; everything else → context_update.
  Human-noise law: nothing wakes Clara on human-direct edits.

### 2.8 Relay tables
- `clara.wake_intents (id uuid pk default gen_random_uuid(), firm_id uuid
  not null, event_id uuid not null references domain_events(id),
  event_seq bigint not null, event_type text not null, decision text not
  null, taxonomy_version int not null, status text not null default
  'pending' check (status in ('pending')), created_at timestamptz default
  now(), unique(event_id))`.
  **C6 fix (stamping law):** a BEFORE INSERT trigger (SECURITY DEFINER,
  pinned search_path — 0003 stamping-trigger house style) DERIVES firm_id,
  event_seq, event_type FROM domain_events(event_id) — caller values are
  overwritten, never trusted — and VALIDATES (taxonomy_version, event_type,
  decision) is an actual trigger_taxonomy row (CLR10 otherwise). RLS never
  evaluates a runtime-forged firm. Slice 3 blocks UPDATE/DELETE/TRUNCATE
  outright (no consumer yet; Slice 4 replaces the guard with the
  consumption lifecycle). Grants: INSERT+SELECT clara_runtime (using(true)/
  with check(true)); SELECT clara_authenticated (firm-pinned policy).
  No agent access.
- `clara.relay_checkpoints (consumer text, firm_id uuid, last_seq bigint
  not null default 0, updated_at timestamptz, primary key (consumer,
  firm_id))` — runtime-only (SELECT/INSERT/UPDATE, using(true)).
- `clara.relay_dead_letters (consumer text not null, event_id uuid not null
  references domain_events(id), firm_id uuid not null, event_seq bigint,
  event_type text, attempted_taxonomy_version int, reason text not null,
  attempt_count int not null default 1, status text not null default
  'pending' check (status in ('pending','resolved')), created_at, resolved_at,
  primary key (consumer, event_id))` (C15 lifecycle columns; the same C6
  stamping trigger derives firm/seq/type from the event). Runtime
  INSERT/SELECT/UPDATE(status,attempt_count,resolved_at only — trigger-
  allowlisted); human SELECT (firm-pinned) — visible, not a write-only
  grave. An explicit replay operation is Slice-4 work (recorded).

### 2.9 The relay (packages/runtime, plain .mjs + pg — worker.mjs precedent)
Single logical consumer `router`. **Every relay connection issues
`SET ROLE clara_runtime` immediately after connect (N10) — the relay and
its tests never run as the bare superuser, so a missing grant fails in CI
(anti-misleading-green).** Leader election (N6/C3): `pg_advisory_lock` on a
constant key per consumer at startup; a second instance waits/exits —
single-writer ENFORCED; effects remain exactly-once-safe regardless.
1. `LISTEN clara_events` (empty-payload nudge) + 2s poll — polling is the
   guarantee.
2. Work discovery (N11/C15b): `firm_event_seq.n` LEFT JOIN
   `relay_checkpoints` (consumer='router') — O(firms), never a log scan.
   Read the ACTIVE taxonomy (pointer → version rows) ONCE per routing
   transaction (N7a/C8); missing/empty pointer ⇒ **HALT loudly** (N7b —
   never advance past an un-routable state).
3. Per firm with `n > last_seq`: batch `seq > last_seq order by seq limit
   N` (contiguous & committed, P1). ONE relay txn per batch: wake-bound →
   `insert into wake_intents … on conflict (event_id) do nothing` (the
   stamping trigger derives/validates — C6); after insert, ASSERT the
   surviving row's (decision, taxonomy_version) matches this batch's (C3
   consistency assertion — log loudly on mismatch); uncovered type →
   dead-letter that event (upsert attempt_count); then checkpoint
   MONOTONICALLY: `insert … on conflict (consumer, firm_id) do update set
   last_seq = greatest(relay_checkpoints.last_seq, excluded.last_seq)`
   (C2: the upsert BOOTSTRAPS a new firm's row — a bare UPDATE would
   silently no-op forever on head-of-line batches). Commit. Crash ⇒ batch
   replays; dedupe ⇒ **at-least-once delivery, exactly-once effect**.
4. Acceptance tests:
   a. Kill-mid-stream (the plan's gate): pump K events, SIGKILL the relay
      repeatedly mid-batch, restart ⇒ exactly one intent per wake-bound
      event, zero dupes/gaps, checkpoint = max seq, version stamps correct.
   b. Split-brain (N6/C3): two relays racing ⇒ still exactly-once, no
      checkpoint regression.
   c. Zero-active pointer (N7b): HALT, checkpoint frozen, no dead-letters.
   d. NOTIFY hygiene (N1): a wake-role listener during a full pump receives
      zero payload bytes.
   e. Bootstrap (C2): a brand-new firm with > one batch of events fully
      drains.
Prod wiring (login, pool timeouts incl. idle_in_transaction_session_timeout
— N5) is Slice 4.

### 2.10 Cutover (C9)
0005's tail (after fn replacement, still as clara_fn_owner): for every
EXISTING firm, `_append_event(firm, 'books.baseline', null client, NULL
actor, …, payload {})` — one firm-level marker meaning "history before this
seq lives in the base tables, not the log". Consequences: firm_event_seq
rows bootstrap; every pre-0005 pack is staled once at cutover (correct);
projections-rebuildable-from-log formally starts AT the baseline (pack
composition reads base tables for history — §2.6). Upgrade test (C17):
apply 0002–0004, create data through the writers, apply 0005 ⇒ baseline
events exist, packs coherent, writers emit from then on.

## 3. What does NOT change
- No change to approve/reverse authorization (human-only, no wake variant),
  RLS lane-pinning, roles, or grant philosophy. The agent still holds
  EXECUTE on ZERO writers.
- 0002–0004 untouched (append-only law). All changes in 0005: same-signature
  bodies via CREATE OR REPLACE (P2); exactly TWO DROP+CREATEs
  (wake_draft_entry — granted, re-grant + revoke-from-public;
  _draft_entry_core — ungranted); the explicit REVOKE-from-PUBLIC sweep at
  the end (§2 header).
- Spike schemas untouched.

## 4. Tests (rig extensions + runtime tests)
DB rig (packages/db/tests, node --test, throwaway target):
1. Every writer emits exactly its event set in-txn; types/actor/ids correct;
   per-firm seq strictly monotonic + dense.
2. A failing writer emits NOTHING (abort ⇒ no event, no gap).
3. op_key replay returns the ORIGINAL receipt byte-identically even after
   later events (no CLR12 on replay); replay-after-CLR12-retry with a
   refreshed token succeeds as the SAME op (N3a).
4. assert_books_current: current ⇒ ok; stale-by-own-client event ⇒ CLR12;
   client-B event does NOT stale A; firm-level event DOES; forged-high
   token ⇒ CLR12; null books_version on wake_draft_entry ⇒ CLR10; the C1
   interleaving (T2 commits between T1's gate and allocation) ⇒ CLR12
   (two-session forced schedule).
5. RLS + matrix: firm-A lanes can't see firm-B events/intents; agent cannot
   INSERT events/intents; exact fn signature set in catalog (C11 — no
   orphan overload); agent_ro holds NO EXECUTE on wake_draft_entry;
   get_context_pack granted exactly to authenticated+agent_ro; the full
   EXECUTE matrix re-asserted post-0005 (N13).
6. Append-only/immutability: UPDATE/DELETE/TRUNCATE ⇒ CLR08 on
   domain_events, event_types, taxonomy_versions, trigger_taxonomy,
   (Slice-3) wake_intents; taxonomy_active allows ONLY the version repoint;
   dead-letter updates allowlisted to status/attempt/resolved (C13).
7. Catalog/coverage: active version covers every event_type (anti-join ∅);
   firm-level types carry null client_id (validation-trigger negative);
   payload confidentiality — no amount-shaped fields emitted (N2).
8. get_context_pack: shape; books_version = firm max seq at read; STABLE +
   provolatile asserted in catalog (C14a); blank purpose ⇒ CLR10;
   cross-firm ⇒ NULL (no oracle); archived client ⇒ pack surfaces status
   AND draft core refuses (C14b).
9. Deadlock regressions (C4/C5, two-session forced schedules): add_member
   vs draft_entry interleaving completes (no FK cycle); approve-mirror vs
   reverse-original completes under the original-before-mirror order.
10. Stamping (C6): a runtime INSERT into wake_intents/dead_letters with a
    WRONG firm_id/seq/type is corrected from the event row; an invalid
    (version, type, decision) triple ⇒ CLR10.
11. Upgrade/cutover (C9): 0002–0004 + data → 0005 ⇒ baseline events, packs
    coherent (approval_history from base tables), emission works.
Runtime tests (SET ROLE clara_runtime — N10): §2.9.4 a–e + unit tests for
routing/dead-letter/checkpoint.

## 5. Follow-ups this design creates (documented, not built)
- Slice 4: wake_intents consumption lifecycle; dead-letter replay op;
  relay health/alerting (dead-letter count, lag); pool timeouts; runtime
  token-binding contract (pack token injected server-side, never
  model-supplied).
- Deferred hardening (PROJECTLOG PART 2 candidates): opaque/HMAC pack
  tokens (C12); `activate_taxonomy_version` operator fn (with a second
  version); predicate-dimension taxonomy schema (C16) when workflow/period
  state exists.
- `firm.settings_changed` event when a threshold writer first exists.
- ADR-016: the six ratified semantics + the C16 narrowing + the §2.5
  enforcement-locus LAW clarification.

## 6. As-built amendments (v2.2 — dual-lane CODE review of the finished slice)

The as-built dual-lane review (native standards+spec axes; Codex gpt-5.6-sol
xhigh live-verifying) EMPIRICALLY CONFIRMED the security core: zero
PUBLIC-executable clara functions, the full 110-attempt five-lane EXECUTE
matrix, forced RLS on all nine new tables, firm-pinned event reads, the C1
interleaving aborting CLR12, byte-identical proactive replay, the C5
original-before-slot order, and one-transaction migration atomicity. The
accepted findings (all integrated on the branch before merge):
- **X1**: the relay drains a bounded number of batches per firm per cycle
  (round-robin — a busy firm cannot starve other tenants) + starvation test.
- **X2**: the runner has a full reconnect lifecycle (a dead client is
  discarded; reconnect → SET ROLE → re-acquire leadership → re-LISTEN);
  a taxonomy HALT exits non-zero for supervision.
- **X3**: the test-only knobs (RELAY_ONLY_FIRM, RELAY_TEST_BATCH_DELAY_MS)
  are inert unless RELAY_TEST_MODE=1 — a leaked prod value cannot silently
  narrow discovery or throttle batches.
- **X4**: the relay enforces the repo's canonical-target law (an
  assertNoTargetSplit equivalent: conflicting DATABASE_URL /
  WORKFLOW_POSTGRES_URL / PG* targets fail closed before any connection).
- **X5**: redrive requires an EXISTING dead-letter row (FOR UPDATE; a
  missing row is an error, never resolved:true); a still-uncovered retry
  atomically restores status='pending', clears resolved_at, bumps attempts.
- **X6**: 0005 adds the pack/TB access-path indexes (client/time on
  journal_entries + documents, live-resolution partial, client/account on
  journal_lines, approved_at partial) — live EXPLAIN had shown seq scans.
- **X7**: the C1 rig schedule proves T1 is blocked at the allocator (not
  merely slept); the D4 flip test straddles a genuinely pending stream.
  (The C5 counterfactual AB-BA schedule cannot be reproduced against the
  fixed code; covered by probes + the race + single-slot assertions.)
- **X8**: CI runs the populated-upgrade/cutover test in a dedicated
  isolated step on a second throwaway database (it can no longer
  silently skip everywhere).
- **X9**: the rig asserts every derived dead-letter field and includes all
  nine Slice-3 tables in the governed FORCE-RLS sweep.
