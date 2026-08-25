# Gate G1 — the universal wake-execution engine: the ESTATE SURVEY (as-found)

> **The estate survey of record for gate G1** — the cross-item mechanism decision escalated by
> `bank-agency-gate-record.md` §6 item 1 (blocker B2, Annex O.1), shared with F-A4 and F-A5 (register
> A12, TA-P5's "ONE time-triggered wake source"), and now RULED by the owner 2026-08-25: **mechanism
> (b) — build the universal wake-execution engine.** Companion to `g1-wake-engine-design.md` and
> `g1-wake-engine-annexes.md`. Written to the F-A2/F-A3 discipline: every claim carries a file:line,
> every unsettleable claim is a PREDICTION for rig replay, and a body's live tip is found by CoR
> lineage, never by the migration that created it.
>
> **Frontier.** `main@d20f1ad`, live DB 122 migrations, `0127_f_a5_pr3_signed_original_archive.sql`
> the newest file under `packages/db/migrations/` (`PROGRESS.md`, 2026-08-25 posture). Every
> citation below is read at this frontier; none is a prediction unless marked.
>
> **Instruments used.** Direct `Read`/`grep -n` over every migration and runtime file cited — no
> codebase-graph query was available in this worktree session, so every claim is a primary read, not
> a derivation. Two research lanes (`research-runtime`, `research-bytes`) independently re-read the
> runtime and DB surfaces; their findings are folded in and cross-checked against this lane's own
> direct reads wherever both touched the same object (agreement noted; no disagreement was found).

---

## 1 · The ruling, and the mechanism it overruled

**THE RULING (owner, 2026-08-25).** G1 = mechanism (b): the existing `kind='wake'` held
projection gains its ONE consumer plus a settlement path; one engine serves every wake source
(F-A3 bank_agent, F-A4 close_prep, F-A7 filing, F-A5's wake sources) and future sources become
rows-only, zero per-item surgery. The conductor's (a) recommendation was heard and OVERRULED.

**Mechanism (a), as it was argued, for the honest record** (`bank-agency-annexes-3-build.md:40`,
`bank-agency-design.md:340-343`, `close-key-1-annexes-2-record.md:369-372`): mint a dedicated
`agent_tasks.kind` per authority scope (`'bank_agent'`, `'filing'`, …) on the **autodraft
precedent** — the kind CHECK swap plus a D1 recut of **both** `_tf_agent_task_insert` and
`_tf_agent_task_update` for every item that mints a kind, plus an admission/enqueue path on the
`autodraft.mjs` model. Its stated case: autodraft *needed* its own kind, its own insert arm, its
own transition arms and the kind CHECK swap "for exactly this reason" — a `kind='wake'` task is a
held-only projection nothing can execute, so giving every source its own kind, wired the same way
autodraft already proves out, was the path with a working precedent already twice-built
(autodraft, then close_prep). **Its named cost, priced honestly in the same record it was argued
in:** every new source pays its own D1 recut of two live judgement-logic trigger bodies — the same
two bodies, recut again and again — plus its own admission/enqueue code path, forever; a closed
world of `agent_tasks.kind` values that grows by one CHECK value and TWO trigger arms per item,
never converging on a shared shape. **Mechanism (b), what is ruled:** the `kind='wake'` carrier
stays the ONE shape every NEW source rides; the matrix delta (§4 below) is paid ONCE, and a new
source's cost is registry rows plus its own due-predicate and workflow — never another trigger
recut. §6 records why (a) does not simply lose on its own terms: **it already happened once, for
close_prep, before this gate existed to rule between them** — the tension that section resolves.

## 2 · The stranded-row defect (why G1 exists at all)

A `kind='wake'` `agent_task` is a **HELD PROJECTION**, not a work item anything runs:

- It must be created `'held'` — `packages/db/migrations/0006_runtime_core.sql:422`
  (`_tf_agent_task_insert`'s wake arm; live text unchanged through 0127, confirmed by grep across
  every 0119-0127 migration for `_tf_agent_task_insert` — only `0120` touches the function, adding
  the `close_prep` arm, and leaves the `wake` arm byte-identical).
- The LIVE transition matrix `_tf_agent_task_update` (live tip `0120_f_a4_pr_1b_close_lifecycle.sql:1503-1550`,
  read directly) admits, for `old.kind='wake'`: **`old.status='held' and new.status='cancelled'` — and
  nothing else** (`:1530`). No `running`, no `completed`, no `failed`.
- `clara.wakes_outbox` — "the uniform HELD projection of a drained wake decision"
  (`0006_runtime_core.sql:214-215`) — carries the identical one-way guard, enforced by
  `_tf_wakes_outbox_update` (`0006:571-584`, never CoR'd through 0127): `tg_op='DELETE'` refuses
  CLR08, any column but `status` changing refuses CLR08, and `new.status<>old.status and not
  (old.status='held' and new.status='cancelled')` refuses CLR08. **Its grants settle what it is
  FOR**: `grant select, insert, update on clara.wakes_outbox to clara_runtime; grant select …
  to clara_authenticated` (`0006:786-787`) and the RLS comment reads "runtime ALL; human SELECT
  firm-pinned … **No agent**" (`0006:744-748`). No `clara_wake_*`/`clara_agent_*` role holds any
  grant on it at all. **`wakes_outbox` is a firm-visible dashboard NOTICE of a held wake, never a
  work queue anything can claim from** — confirmed independently by research-bytes' grant/role
  read, which reaches the identical conclusion from the ACL side that this survey reaches from the
  consumer side (§ below).
- `packages/runtime/lib/drain.mjs` (177 lines, read in full) is the ONLY writer of both rows: its
  `drainWakeIntents` inserts `agent_tasks(origin_intent_id, kind, status) values ($1,'wake','held')`
  (`:79-83`) and `wakes_outbox(intent_id, condition, status) values ($1,$2,'held')` (`:87-91`) in one
  transaction per drained `wake_intent`, `FOR UPDATE SKIP LOCKED` on the batch (`:61`).
- **Nothing in `packages/runtime` reads either table as a work queue.** `reconciler.mjs:184-189`
  states it outright, in a comment inside `reconcileTasks`: *"kind='wake' can never reach
  `cancel_requested` in the first place — … a wake task (always created 'held', `0006:422`) ever
  is — so this query structurally only ever sees chat_turn/autodraft rows."* research-bytes'
  independent read confirms: drain.mjs writes both projections; nothing else reads `wakes_outbox`
  at all (diagnostic SELECT/human dashboard access aside — `0126`'s tail grants human SELECT-only
  on the relations it touches, never a runtime read of `wakes_outbox`).

**Consequence.** A source's due-predicate belt appends a domain event (e.g. `bank.agent_due`); the
router turns it into a `wake_intent`; drain.mjs turns that into a held `agent_task` + a held
`wakes_outbox` row; **and the run stops there forever** — one stranded row per cadence tick per
client, with no legal way out except a human/operator `cancel`. This is the defect gate B2 named
(`bank-agency-gate-record.md:69-90`) and G4 independently confirmed for close_prep before G1 even
existed as a named gate (`close-key-1-design.md:193-201`, `close-key-1-survey.md:366`).

## 3 · The spine-consumer family, and the proven lifecycle idiom

The runtime already runs **THREE registered spine consumers** beside the router (`CONSUMER =
'router'`, `packages/runtime/lib/relay.mjs:35`): the matcher (bank-matching, referenced but not
read in this survey — out of scope) and **autodraft** (`packages/runtime/lib/autodraft.mjs`, 527
lines, read in full). Autodraft's own header names it explicitly: *"A THIRD registered spine
consumer beside the router + matcher, reusing `packages/runtime/lib/relay.mjs`'s discovery/checkpoint/dead-letter
primitives UNCHANGED (they already take a `consumer`)"* (`autodraft.mjs:2-4`). This is the proven
shape a fourth consumer — the wake engine — mirrors, not reinvents:

- **Own advisory lock**, keyed by consumer name (`acquireLeaderLock(client, AUTODRAFT_CONSUMER)`,
  `:486`; the router's own lock the same way, `packages/runtime/lib/relay.mjs:164-179`) — BLOCKS until that consumer's
  leadership, never SKIP LOCKED (reserved for genuinely multi-worker queues, §5).
- **Own `(consumer, firm_id)` checkpoint** in `clara.relay_checkpoints` (`0005_event_spine.sql:133-139`),
  read/written via `packages/runtime/lib/relay.mjs`'s generic `discoverWork`/`writeCheckpoint` (`:208-238`, `:279-304`) —
  no schema change, no new primitive, a NEW `consumer` string is the entire registration cost.
  `firm_id, event_seq` is the cursor space; `wake_intents.event_seq` (`0005_event_spine.sql:125`) is
  the SAME `domain_events.seq` copied at intent-mint time, so a wake-scoped consumer can checkpoint
  in the identical space without inventing a second sequence.
- **Own dead-letter lane** in `clara.relay_dead_letters` (`0005_event_spine.sql:140-153`), keyed
  `(consumer, event_id)`, `attempt_count` incremented via `ON CONFLICT`, `reason` immutable on
  first write (`_tf_dead_letter_update` pins the mutable set to `{status, attempt_count,
  resolved_at}`, `autodraft.mjs:174-179`'s own comment), a `MAX_ATTEMPTS` poison-skip (default 5,
  `autodraft.mjs:47`) that advances the checkpoint PAST a poisoned event rather than wedging the
  firm's lane forever.
- **Own `/ready` WARN signal** (`autodraftHealth`, `:437-460`) — lag, pending dead-letters, firms
  tracked; warn-only, never a hard down (the header: *"a stalled autodraft consumer must NEVER take
  chat traffic down"*, `:433-434`).
- **Own reconnect-backoff loop**, `startAutodraftLoop` (`:468-526`), byte-for-byte the same shape as
  `startLeaderLoop` (`leader.mjs:139-247`) — `RECONNECT_BASE_MS=500`/`RECONNECT_MAX_MS=5000`
  doubling, `connect → setRuntimeRole → acquireLeaderLock → listen clara_events → poll loop →
  waitForNudge`.
- **Discovery is a firm-scoped, source-typed subscription**, not a taxonomy read: autodraft
  subscribes directly to `document.invoice_facts_completed`/`_failed`/`entry.withdrawn`
  (`AUTODRAFT_EVENT_TYPES`, `:40-45`) and treats every other event type as checkpoint-only. This is
  the DIRECT-QUEUE shape — it never touches `wake_intents`/`agent_tasks(kind='wake')` at all; it
  mints its OWN `agent_tasks(kind='autodraft')` rows via `clara.admit_autodraft_task`.

**Ongoing task-lifecycle reconciliation is a SEPARATE concern from admission**, owned by
`packages/runtime/lib/reconciler.mjs` (635 lines) and its per-kind sibling belts, run inside the
MAIN leader loop (`leader.mjs`), not inside the consumer's own loop:

- `reconcileTasks` (`reconciler.mjs:152-330`) covers **`kind='chat_turn'` only** in its
  queued-without-run repair (§A, `:157-164`, hardcoded `kind = 'chat_turn'`) and its
  engine-truth-vs-status settlement (§C, `:227-235`, same hardcode) and orphan-abort (§D,
  `:296-303`, same hardcode). Its cancel_requested handler (§B, `:190-222`) is the one KIND-GENERIC
  section — it selects across every kind and dispatches settlement `IF (t.kind === 'autodraft')`
  else the generic `settleTaskTerminal` (`:213-219`).
  Comment at `:184-189` states plainly that this generic section "structurally only ever sees
  chat_turn/autodraft rows" TODAY, because wake can never reach `cancel_requested` under the
  current matrix — a fact this gate's matrix delta changes (§4).
- `reconcileAutoDraftTasks` is autodraft's OWN dedicated reconciler belt, registered in
  `runReconcilerSweep`'s belt list (`reconciler.mjs:625`, `belt("autodraft reconcile", () =>
  reconcileAutoDraftTasks(client, deps))`) — the estate's established pattern: **a new task kind
  with a running/completed/failed lifecycle gets its OWN reconciler belt**, not a widened
  `kind='chat_turn'` filter.
- `runReconcilerSweep` (`reconciler.mjs:540-635`, read in full) wraps every belt in a `belt()`
  closure (`:551-564`) that isolates a belt's own throw to that belt alone and names it in a
  positive `beltErrors[]` array — never a silent zero. Born from two measured incidents ("the
  Section-I zombie" on the cancel edge, "the §7-A F1" autodraft-settle zombie) where one unguarded
  belt starved every belt sequenced after it, every ~2s, indefinitely. This is the estate's actual
  circuit-breaker-shaped primitive (§5).
- Module-size discipline already split `reconciler-sst.mjs` / `-lint.mjs` / `-fa.mjs` /
  `-adjustments.mjs` / `-render.mjs` out of `reconciler.mjs`, which "already stands 26 lines over
  the 500-line file discipline" (`leader.mjs:25-29`'s own comment) — a NEW per-kind reconciler belt
  belongs in its own file from the start, not appended to `reconciler.mjs`.

## 4 · The matrix, at the bytes, and the four sources' half-shipped states

**`_tf_agent_task_insert` / `_tf_agent_task_update` — live tip `0120_f_a4_pr_1b_close_lifecycle.sql:1450-1550`,
read in full.** Four `kind` arms exist today: `chat_turn`, `wake`, `autodraft`, `close_prep`. The
insert arm's wake branch (`:1464-1471`) is unchanged since `0006`: resolve firm/client from
`wake_intents ⋈ domain_events`, refuse a non-null `session_id`, require birth `status='held'`. The
update arm's per-kind `case`, verbatim:

```
when old.kind='chat_turn' then case old.status
  when 'queued' then new.status in ('running','cancel_requested','cancelled')
  when 'running' then new.status in ('awaiting_input','cancel_requested','completed','failed')
  when 'awaiting_input' then new.status in ('running','cancel_requested','expired','cancelled')
  when 'cancel_requested' then new.status in ('completed','failed','cancelled')
  else false end
when old.kind='wake' then old.status='held' and new.status='cancelled'
when old.kind='autodraft' then case old.status
  when 'queued' then new.status in ('running','cancel_requested','cancelled')
  when 'running' then new.status in ('completed','failed','cancel_requested')
  when 'cancel_requested' then new.status in ('completed','failed','cancelled')
  else false end
when old.kind='close_prep' then case old.status
  -- The autodraft lifecycle, verbatim (D-27) -- not the 'wake' arm's held-only rule.
  when 'queued' then new.status in ('running','cancel_requested','cancelled')
  when 'running' then new.status in ('completed','failed','cancel_requested')
  when 'cancel_requested' then new.status in ('completed','failed','cancelled')
  else false end
else false end;
```
(`0120:1522-1542`, quoted verbatim.)

**The four named sources' actual state at 0127, per source:**

| source | `agent_tasks.kind` | trigger arm | `wake_credentials.wake_kind` | `mint_wake_credential` gate | allowlist rows | due predicate | hold table | runtime consumer |
|---|---|---|---|---|---|---|---|---|
| **bank_agent** (F-A3) | none — rides `kind='wake'` | wake arm, unchanged (held→cancelled only) | LIVE, `0121:247-274` (dynamic re-derivation of the predecessor disjuncts, never retyped) | LIVE arm, `0126:655-663` (firm-congruent active client required, `on_behalf_of` FORBIDDEN) | LIVE, 13 wrapper verbs + `wake_open_question`/`wake_get_bank_pack`, `bank-agency-annexes-1-mechanics.md:22-59` | **DOES NOT EXIST** — `clara.bank_agent_run_due` is undesigned SQL (exhaustive grep through 0127, zero hits) | LIVE, `clara.bank_agency_holds` + `clara.set_bank_agency_hold` (`0121:4456-4520`) **and** its per-call Tier-A gate `clara._agent_bank_tier_a` (`0121:4928-4949`) — a synchronous "refuse THIS call" check every wrapper consults, not a scheduling-time predicate | none |
| **close_prep** (F-A4) | **own kind, `'close_prep'`**, full autodraft-shaped lifecycle LIVE (`0120:1482-1541`) | own arm, LIVE, full lifecycle | LIVE, admitted by both CHECKs (`0126:596-597`, `:601-605`) | **REFUSES** — `mint_wake_credential`'s per-kind chain (`0126:639-673`) has no `close_prep` arm; a mint attempt falls through to the `elsif p_client is not null` catch-all (`:671-672`) and raises `'legacy wake kinds do not accept a client binding'`, since close_prep IS client-bound | **ZERO** — no `wake_fn_allowlist` row for `wake_kind='close_prep'` exists in any migration through 0127 (grep, no hits) | **DOES NOT EXIST** — `clara.close_prep_due()` is undesigned SQL (`close-key-1-design.md:172-176` describes its intended contract, not a live body) | **DOES NOT EXIST** — no `clara.close_prep_holds` table in any migration through 0127 (grep, no hits); `close-key-1-design.md:187` names it as intended, unbuilt | none — `closePrep.v1` is an unbuilt workflow (`close-key-1-design.md:181`, `:461`) |
| **filing** (F-A7) | none — rides `kind='wake'` | wake arm, unchanged | LIVE, `0126:596-597` (last in the chain) | LIVE arm, `0126:664-670` (client-less by construction — filing has no client at attribution time) | LIVE, 6 provable rows (`0126:2074-2079`), a 7th (`wake_begin_client_onboarding`) reserved for F-A7b | not designed in this train — PR-ρ (the F-A7 runtime train) is UNAUTHORED (`0126:381`: *"the runtime train, rho, has not been authored either"*) | none named | none — PR-ρ unauthored |
| **F-A5's sources** (reportPack etc.) | none — rides `kind='wake'` | wake arm, unchanged | not yet minted | not yet built | not yet built | not yet built | a per-client "hold packs" switch is named, not built (`reporting-agency-design.md:376`) | none — `reportPack.v1` "F-A5 registers a consumer and neither restates nor varies it, and PR-5 does not land until it exists" (`reporting-agency-design.md:367-368`) |

**`clara.wake_credentials`' live CHECKs, `0126_f_a7_beta_filing_verb.sql:594-605`, quoted in full:**

```sql
alter table clara.wake_credentials add constraint ck_wake_credentials_kind_0011
  check (wake_kind = any (array['interactive','proactive','autodraft','interactive_client',
                                 'close_prep','bank_agent','filing']));

alter table clara.wake_credentials add constraint ck_wake_credentials_client_0011
  check ((wake_kind = 'autodraft' and client_id is not null)
      or (wake_kind = any (array['interactive','proactive','filing']) and client_id is null)
      or (wake_kind = 'interactive_client' and client_id is not null)
      or (wake_kind = 'close_prep' and client_id is not null)
      or (wake_kind = 'bank_agent' and client_id is not null));
```

`clara.mint_wake_credential(p_wake_kind, p_firm, p_on_behalf_of default null, p_ttl interval
default '00:15:00', p_client default null)` — live tip `0126:612-681` — **mints per-fire, short-TTL
credentials, never long-lived**: the default TTL is 15 minutes, no credential is cached or reused
across fires, and the estate's own comment records "no TTL-positivity guard: unpinned; a
non-positive TTL mints an already-dead credential — harmless, and the rig's expiry probes rely on
it" (`:630-631`). `clara.assert_wake_allowed(p_wake_kind, p_fn)` (`0004_governed_fns.sql:114-121`)
is a plain table lookup against `clara.wake_fn_allowlist(wake_kind, function_name)` — genuinely
**rows-only today**, unchanged since 0004: a new source's allowlist is INSERT rows, never a CoR.

**`clara.wake_intents`** (`0005_event_spine.sql:121-132`): `event_id, event_seq, event_type,
decision, taxonomy_version, status('pending'|'consumed')`. `event_type` is the per-event domain
event name (e.g. `bank.agent_due`) and is a reliable per-source discriminator: `agent_tasks.
origin_intent_id → wake_intents.id → domain_events(via event_id).event_type` is a two-hop join a
consumer can read at claim time; no schema change is needed to know which SOURCE a held wake row
belongs to.

**The `*_run_due(p_client uuid) returns jsonb` contract, confirmed by two live siblings' full
bodies** (`clara.depreciation_run_due`, `0041_wave_d_a_fa_register.sql:3617-3631`;
`clara.adjustment_run_due`, `0045_wave_d_b2_recurring_adjustments.sql:5513-5592`, both read in
full): resolve `firm_id` from `p_client`; **admission-gate BEFORE answering anything, including
`client_not_found`** (`adjustment_run_due`'s own comment: an unadmitted caller must not be able to
enumerate client ids by probing the oracle); then return one of two shapes —
`{"due": false, "reason": "<short snake_case code>"}` or `{"due": true, ...selector fields...}` —
with `adjustment_run_due` additionally always carrying a `"blocked": [...]` array (empty when
nothing is blocked) naming WHY other candidates were skipped, never silently. `reason` is always a
bounded vocabulary, never free text. Neither `bank_agent_run_due(p_client)` nor
`close_prep_due(p_client)` exists anywhere through 0127 (exhaustive grep, zero hits) — both are
undesigned SQL this gate's rollout must name an owner for (design §5).

## 5 · No circuit breaker exists; the estate's own primitives compose one

Confirmed by direct read of `packages/runtime/lib/reconciler.mjs`, `reconciler-render.mjs`,
`autodraft.mjs`, `packages/runtime/lib/relay.mjs`: **no dedicated circuit-breaker module, no persisted per-source
disable/kill-switch, no generic backoff library exists in `packages/runtime`.** Three real, proven
primitives compose the failure-isolation this gate needs, and none should be reinvented:

1. **Per-event dead-letter + `MAX_ATTEMPTS` poison-skip** (`relay_dead_letters`, §3) — isolates ONE
   poisoned admission from wedging its firm's whole lane.
2. **The `belt()` catch-and-continue wrapper** (`reconciler.mjs:542-564`, quoted in full above) —
   isolates one belt's failure from starving every belt sequenced after it. Born from two named
   incidents, not theory.
3. **A DB-owned cooldown verb for an external call that can storm** — `clara.render_dispatch_begin`
   (cited, not re-read in full here; `reconciler-render.mjs:16-19`, `:49-50`, `:235-238`) stamps its
   attempt INSIDE the DB call, before the Fly API is touched, defaulting to a 10-minute cooldown
   (`CLARA_RENDER_DISPATCH_COOLDOWN`) and a 5-job cap per pass (`CLARA_RENDER_DISPATCH_MAX`) — so a
   persistently failing external call backs off on a DB-held cooldown rather than storming every
   ~2s cycle, and the cooldown survives a leader restart because it lives in the database, not the
   process.

**No per-source kill switch exists anywhere in the estate today.** This gate's registry-owned
enablement door (design §5) is the first of its kind, deliberately mirroring `bank_agency_holds`'
shape (audited, human-written, FORCE RLS) rather than inventing a new idiom.

**Law 76, corrected.** `docs/adr/README.md:442` ("meter, never cap") is chat/LLM **spend**
metering — `packages/db/migrations/0105_f_a9_chat_token_cap.sql:10`, `:331-335` — the removal of a
daily-token spend refusal from `clara.begin_chat_turn`. It is not a belt-observability convention.
The estate's actual belt-observability shape is a typed counter object per belt (e.g.
`{faOk, faExamined, faPosted, faNoop, faFailed, dormant}`, `reconciler-fa.mjs`), spread into one
aggregate by `runReconcilerSweep` (`reconciler.mjs:634`), plus the positive `beltErrors[]` naming
array on failure. A new wake-engine belt/consumer should report the same shape, never a spend cap.

## 6 · The close_prep tension — TA-P11's shared-arm ruling vs. the fresh G1 ruling

**Close-key-1's own gate (numbered G1-G4, its own local numbering, distinct from bank-agency's
cross-item G1) ruled and SHIPPED before this gate existed.** `close-key-1-gate-record.md:369-372`
(cross-item sequencing obligation 3, "GM-11 / D-27"), quoted:

> *"The clock's execution path is shared with F-A3 and F-A5 (GM-11 / D-27). A `kind='wake'`
> `agent_task` is born `held` (`0011:1230`) with `held→cancelled` its only transition (`:1271`) —
> nothing executes it. F-A4 mints the `close_prep` arm on the `autodraft` lifecycle; **F-A3 and F-A5
> adopt that arm rather than each minting their own** (TA-P11)."*

This IS mechanism (a), decided locally and by precedent rather than centrally: F-A4 built its own
`agent_tasks.kind`, its own full transition matrix (`0120`, MERGED, LIVE), and recorded — in the
migration's own comment (`0120:1484-1486`) — that "F-A3/F-A5 adopt this SAME ARM rather than each
minting their own… so a builder finding `'close_prep'` hard-coded in F-A3's belt later is expected,
not a layering violation." **That expectation is now superseded.** The owner's G1 ruling, made
later and explicitly, on the SAME cross-item register entry (`bank-agency-gate-record.md §6 item
1`), rules (b) instead: bank_agent, filing and F-A5's remaining sources ride `kind='wake'`, not a
new per-source kind — the opposite of what close-key-1's obligation 3 told them to do.

**Both rulings are real and both are recorded here, honestly, because neither is wrong on its own
terms and the tension is exactly what a design lane owes an owner an honest account of:**

- Close-key-1's ruling optimized for **reuse of a proven, ALREADY-WORKING lifecycle** (autodraft's
  matrix, which — unlike `wake`'s held-only matrix — actually executes) at a time when no gate had
  yet weighed the compounding cost of repeating that recut per item.
- G1's ruling optimizes for **convergence**: one matrix delta, paid once, versus a `agent_tasks.
  kind` enum and a trigger `case` arm that grows by one member forever, and a single operational
  surface (one consumer, one registry, one kill switch) across every source — which mechanism (a)
  structurally cannot give, because each source's kind is its own island with its own trigger arms.

**Resolution (this design lane's recommendation, §6 of the design doc argues it in full):
close_prep is GRANDFATHERED, not the template.** Its DB shape (`0120`, MERGED) is NOT retrofitted
onto `kind='wake'` — there is no defect in it to justify a D1 recut of an already-correct,
already-tested trigger arm, and constraint 9's spirit (never recut a working body without cause)
argues directly against undoing it. But its RUNTIME CONSUMPTION — the piece that does not exist
yet, `closePrep.v1`'s belt and consumer — folds into the SAME engine this gate builds, exactly as
the owner's ruling names it: "F-A4 close_prep" is one of the four sources the ONE consumer serves.
The engine's claim loop therefore closes over exactly TWO carrier shapes (`wake`-projection and
`close_prep`-direct-queue), never three, and never one per item — a bounded, named exception, not
a second mechanism (a) precedent for anything built after this gate.

## 7 · What the rig replay (or a future PR's own tail census) must confirm

Everything below is a PREDICTION until proven at the bytes by the PR that builds it — this survey
asserts only what is true TODAY, at 0127:

- **P-G1a** — `_tf_agent_task_insert`'s wake arm needs NO change; only `_tf_agent_task_update`'s
  wake arm gains legal transitions (§4's matrix, design §1/annexes §B).
- **P-G1b** — `wakes_outbox`'s status CHECK, today `('held','cancelled')`, needs exactly one new
  terminal value to stay a synchronized projection of the same fact `agent_tasks(kind='wake')`
  carries, never a second, diverging state machine.
- **P-G1c** — the reconciler split (`packages/runtime/lib/reconciler-wake.mjs`, new file) can reuse `terminalFor`'s
  shape (`reconciler.mjs:53-69`) unmodified — the function is already kind-agnostic (a pure
  function of `(taskStatus, engine)`, no `kind` parameter) — a new belt calls it, it does not fork
  it.
- **P-G1d** — `assert_wake_allowed` and `wake_fn_allowlist` need zero DDL for any future source;
  only INSERT rows.
- **P-G1e** — `clara_wake_bank_login` does not exist anywhere in `pools.mjs` today (grep, no hits) —
  it is PR-2/M4 territory named in `bank-agency-annexes-3-build.md:58` and explicitly "GATED ON
  G1"; this design now owns that seam (annexes §E).
