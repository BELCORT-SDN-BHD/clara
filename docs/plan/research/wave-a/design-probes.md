# Wave-A design review — EMPIRICAL PROBE REPORT

**Lane:** empirical PROBE lane (probe-before-arguing). Every claim below was settled
by running SQL against a **throwaway Postgres 16** and quoting the outcome — not by
reading the design docs.

**Target DB (ground truth):** local throwaway `postgresql://postgres@127.0.0.1:5544/clara_test`
(PG 16.13, trust auth). It was **stood up fresh for this run** (initdb → started detached →
`createdb clara_test`), then migrations **0001–0010 applied clean** (`migrate: 10 new
migration(s) applied · 10 total · target 127.0.0.1:5544/clara_test`). So the surface probed is
0001–0010 as-built, no stale schema. (There was no pre-existing 5544 cluster and no Docker;
the intended disposable target was materialized, not substituted.)

**Source under review:** `.tmp/wave-a-design-review-native.md` findings F1–F12 + its PROBE LIST 1–11.

**Scratch objects:** all scratch DDL created in schema `probe_scratch` or inside
`begin…rollback`; nothing in `clara` was mutated destructively (writer-driven seed rows were
inserted through the audited fns as normal, on this disposable DB).

---

## Verdict table

| Probe | Claim under test | Verdict |
|---|---|---|
| P1 | helper grants zero to app lanes; invoker→42501; `_invoice_fact_state` is a cross-firm oracle | **SUPPORTED** (source + live) |
| P2 | OCR-claim time has no reachable client (no filing) | **SUPPORTED** (live) |
| P3 | `autodraft` kind rejected by insert trigger; no held→running edge for non-chat_turn | **SUPPORTED** (source + live) |
| P4 | `document.invoice_facts_completed` carries `client_id = NULL` | **SUPPORTED** (source + live) |
| P5 | naive merge re-key raises 23505 on both unique shapes | **SUPPORTED w/ precision** (rules: yes; alias: hazard real but via auto-alias INSERT, not the re-key) |
| P6 | high-stakes AGENT draft approvable by ONE bookkeeper (DB backstop absent) | **SUPPORTED** (source + live) |
| P7 | additive-insert into ACTIVE taxonomy keeps coverage whole, no flip | **SUPPORTED** (live) |
| P8 | `coding_attempts` fn-fronted: invoker→42501, definer→ok | **SUPPORTED** (live) |
| P9 | facts-persist (FOR UPDATE) vs sweep-draft (FOR SHARE) serialize, no deadlock | **SUPPORTED** (source + live, both orders) |
| P10 | per-firm daily token spend carrier; admission reserve-first vs read-then-act | **SUPPORTED** — carrier exists; admission is **read-then-act (NOT reserve-first)**; token path is chat_turn-only |

---

## P1 — helper grants + invoker 42501 + cross-firm oracle  → SUPPORTED

**ACLs (pg_proc.proacl):**
```
        proname        |              args               | secdef | acl
 _invoice_fact_state   | p_document uuid                 | t      | clara_fn_owner=X/clara_fn_owner
 _resolve_counterparty | p_client uuid, p_proposal jsonb | t      | clara_fn_owner=X/clara_fn_owner
 is_high_stakes        | p_entry uuid                    | t      | clara_fn_owner=X/clara_fn_owner
```
All three are **SECURITY DEFINER, STABLE**, and EXECUTE is granted to **`clara_fn_owner` only**
(PUBLIC revoked). **Zero EXECUTE for `clara_authenticated` / `clara_agent_ro`.**

**42501 via an invoker wrapper** (scratch `probe_scratch.calls_hs` = SECURITY INVOKER calling
`clara.is_high_stakes`), run as `clara_agent_ro`:
```
ERROR:  42501: permission denied for function is_high_stakes
```
So the review's F2 is confirmed at the type level: a SECURITY-INVOKER `coding_lane` calling any
of these helpers as `clara_agent_ro` fails 42501. The 0009 code's inline re-derivation in
`get_draft_review` is the necessary workaround, not an accident.

**Cross-firm oracle:** `_invoice_fact_state(p_document uuid)` body selects purely by
`p_document` through `document_processing_tasks → document_extractions → document_regions`
with **no `firm_id` predicate** and, being DEFINER, **no caller RLS scope**. Live proof: a
single privileged (root) session returned non-empty fact-state for a **firm-A** document AND a
**firm-B** document, with no firm argument:
```
__PROBE__ P1_oracle_firmA_facts = {"document":"da01399d…","nonempty":true,"total_cents":500000}
__PROBE__ P1_oracle_firmB_facts = {"document":"9b7a70b0…","nonempty":true,"total_cents":500000}
```
Granting this helper to an agent lane = a cross-firm facts oracle (an agent in firm X reads
firm Y's facts by passing Y's `document_id`). The only thing preventing it today is the
owner-only grant.

## P2 — OCR-claim time has no reachable client  → SUPPORTED

A verified-but-**unfiled** document (seeded via `seedVerifiedDocument`, no `document_filings`
row) has no reachable client:
```
__PROBE__ P2_doc = {"document_id":"bf2c175b…","status":"ingested","active_filings":"0","reachable_client":null}
```
Reinforcement: `clara.documents` has **no `client_id`/`client` column at all**
(`information_schema.columns` → 0 rows). The **only** client path is `document → document_filings
→ client_id`, which does not exist until the human files the bill (post-OCR/matcher). So a
per-client egress-consent join evaluated **at OCR-claim time yields NULL** — F1 confirmed. OCR
egress cannot be per-client-gated; it must be gated by a firm/global baseline.

## P3 — autodraft task lifecycle collides with agent_tasks machinery  → SUPPORTED

Base CHECK (0006): `agent_tasks_kind_check = CHECK (kind = ANY (ARRAY['chat_turn','wake']))`.

**Insert trigger** `_tf_agent_task_insert` hard-branches `chat_turn` / `elsif wake` / `else raise`.
Live: widened the CHECK to admit `autodraft` in a txn, then inserted — rejected by the trigger,
**not** the CHECK:
```
ERROR:  CLR10: unknown task kind autodraft
CONTEXT:  PL/pgSQL function _tf_agent_task_insert() line 35 at RAISE
```
(rolled back; constraint restored to 2-kind, 0 autodraft rows).

**Update matrix** `_tf_agent_task_update`: `old.kind='wake'` allows **only** `held → cancelled`;
any other kind falls to `else false` → CLR13. So there is **no `held→running/queued` edge for a
non-chat_turn kind**, and a `wake`-kind held task (what the wake drain actually produces) can
only go held→cancelled. F3's three collision axes are real: the insert trigger, the update
matrix, and the wake-drain kind all reject an `autodraft` lane as specified.

## P4 — invoice_facts_completed carries client_id = NULL  → SUPPORTED

`_append_event` signature: `(p_firm, p_type, p_client, p_actor, p_obo, p_wake_kind, p_entry,
p_document, p_resolution, p_payload)`. `persist_invoice_facts` calls it with the **3rd arg
(`p_client`) = null**:
```
perform clara._append_event(t.firm_id,'document.invoice_facts_completed',null,null,null,null,
    null,t.document_id,null, jsonb_build_object('task_id',p_task,…));
```
Live proof — driving a facts completion and reading the event:
```
__PROBE__ P4_event_firmA = {"event_type":"document.invoice_facts_completed","client_id":null,
                            "document_id":"da01399d…","firm_id":"4e88f4eb…"}
```
So an autodraft sweep consumer **cannot** get the client from the event; it must resolve
`document → active filing → client` itself (and handle the multi-filing/shared-doc case). F3's
"plus" is confirmed.

## P5 — merge re-key unique collisions  → SUPPORTED (with precision)

Scratch tables mirroring the two claimed shapes:

(a) **`coding_rules` one-live** `unique(client_id, counterparty_id, rule_type) where retired_at is null`:
a naive UPDATE re-key of the merged vendor's live rule to the survivor collides:
```
ERROR:  23505: duplicate key value violates unique constraint "uq_one_live_rule"
DETAIL:  Key (client_id, counterparty_id, rule_type)=(…, <survivor>, vendor_account) already exists.
```
Matches the review exactly (counterparty_id is IN the key).

(b) **`aliases`** `unique(client_id, alias_normalized) where retired_at is null` — **PRECISION**:
a pure `counterparty_id` re-key does **NOT** collide, because `counterparty_id` is not in the
unique key:
```
-- (b1) re-key counterparty_id → survivor : UPDATE 1 (succeeded, no 23505)
```
The real `23505` hazard is the merge's **auto-created former-name alias INSERT** duplicating a
normalized alias the survivor already holds:
```
-- (b2) insert survivor former-name alias 'tnbberhad' (survivor already holds it)
ERROR:  23505: duplicate key value violates unique constraint "uq_alias2_live"
```
So the alias collision is real and unhandled, but its mechanism is the auto-alias INSERT / a
duplicate normalized value — **not** the re-key UPDATE. Also note two live same-normalized
aliases for one client can't pre-coexist under this shape (the setup INSERT itself 23505s), so
the design must dedupe the auto-alias and re-keyed aliases on-conflict.

**open_questions un-re-key (third ask):** not rig-testable — `open_questions`, `counterparties`,
and `merge_counterparties` **do not exist yet** (this is unbuilt Wave-A surface; `s6Ready`
markers `counterparties`/`revise_entry` are absent). The finding is a **design-doc-level** gap:
the companion §2 re-key set omits `open_questions.counterparty_id`, and the block predicate keys
on the entry's *resolved* (survivor) counterparty, so a question left pointing at the retired
vendor stops gating — mechanically sound, confirmed by construction, not by a live table.

## P6 — high-stakes AGENT draft approved by a single bookkeeper  → SUPPORTED

`approve_entry` high-stakes gate (source):
```
144:  if clara.is_high_stakes(p_entry) and e.last_human_editor is not null
145:     and e.last_human_editor=c.actor then
146:    if clara.eligible_checker_count(c.firm)>=2 then raise …'needs a distinct checker' CLR05;
148:    elsif p_attestation is null or btrim(p_attestation)='' then raise …'requires an attestation' CLR05;
```
The gate fires **only when `last_human_editor IS NOT NULL AND = the checker`**. An agent (wake)
draft has `last_human_editor = NULL`, so the entire gate is skipped. Live proof:
```
__PROBE__ P6_draft = {"maker_actor":"…c1a7a0"(AGENT), "last_human_editor":null, "is_high_stakes":true, "status":"draft"}
__PROBE__ P6_after_single_bookkeeper_approve = {"final_status":"approved","checker_actor":"…"(alice),"self_attest":null,"error":null}
```
A high-stakes (`is_high_stakes=true`, RM15k) AGENT draft was **approved by ONE bookkeeper with
no attestation and no distinct checker**. Reinforcement: firm A has `eligible_checker_count = 2`,
so the distinct-checker rule *could* have been enforced — it was bypassed purely because the
draft is agent-made. F7 confirmed: the "re-refused at the DB" double-enforcement does **not**
exist for the exact rows batch-approve drafts. WA-R7's high-stakes exclusion rests entirely on
the client-side selection filter today.

## P7 — additive-insert into ACTIVE taxonomy, no repoint  → SUPPORTED

Active version = **2**. `_tf_taxonomy_active_guard` guards only the active *pointer* (repoint
`version` only; never delete) — it does **not** block additive `trigger_taxonomy` inserts.
`_tf_stamp_wake_intent` validates the `(version, event_type, decision)` triple. Live, in a txn:
inserted a new `event_type` + `trigger_taxonomy(version=2, decision='notification')` into the
ACTIVE version:
```
uncovered_event_types = 0        -- coverage still whole
router_triple_ok      = 1        -- routing valid for the new type
active_version_before = 2  →  active_version_after = 2   -- NO flip
```
(rolled back; type gone, version untouched.) The companion §12 "repoint via new version + flip"
is unnecessary and heavier than needed — the true 0009 additive pattern reproduces cleanly. F8
confirmed.

## P8 — coding_attempts fn-fronted readability  → SUPPORTED

`has_table_privilege` → `clara_authenticated`=**f**, `clara_agent_ro`=**f** on
`clara.coding_attempts` (relacl NULL = owner-only). Live:
```
-- INVOKER fn read as clara_agent_ro:
ERROR:  42501: permission denied for table coding_attempts
-- DEFINER fn read as clara_agent_ro:  definer_read = 0  (success)
```
Confirms the invoker-vs-definer tension the review flags for the shared `_open_question_blocks`
predicate (F9): an invoker lane fn cannot read a fn-fronted table; only a (firm-scoped,
oracle-safe) DEFINER can.

## P9 — facts-persist vs sweep-draft race  → SUPPORTED (both orders, no deadlock)

Lock protocol (source): `persist_invoice_facts` locks `document_filings` **FOR UPDATE**
(`order by f.id for update`); the draft path `_draft_entry_core → _active_document_filing(…,
p_lock=true)` takes **FOR SHARE** (`for share of f`). FOR UPDATE and FOR SHARE conflict. Live,
two sessions, both orders:
```
persist(FOR UPDATE) holds, draft(FOR SHARE) waits:
  blocked_before_commit=true  waiter_blocking_pids=[<holder>]  wait=Lock/transactionid
  after holder commit: waiter_resolved=true  deadlock(40P01)=null
draft(FOR SHARE) holds, persist(FOR UPDATE) waits:
  blocked_before_commit=true  waiter_blocking_pids=[<holder>]  wait=Lock/transactionid
  after holder commit: waiter_resolved=true  deadlock(40P01)=null
```
In both orders the two paths **serialize on the filing row lock** — one waits, the other
proceeds, **no deadlock**. This confirms F-low: the serialization/correctness guard is the
filing row lock (+ the `uq_journal_entries_one_open_draft_filing` unique + `double_coded`
idempotent no-op), **not** the lock-free "admission recheck." The "no TOCTOU" framing should be
reworded to name the row lock as the guarantee.

## P10 — per-firm daily-token-spend carrier + admission model  → SUPPORTED (read-then-act, not reserve-first)

**Carrier:** `clara.firm_usage_daily(firm_id, usage_date, tokens_used)` is the per-firm daily
spend; the limit is `firm_limits.daily_token_limit` (fn-constant default 1,000,000 when NULL).
`settle_chat_turn` **increments** `firm_usage_daily.tokens_used` **after** the work (settle-first).

**Admission** = `begin_chat_turn` (the only fn that reads the budget). Under a per-firm advisory
xact lock (`pg_advisory_xact_lock(202991617, hashtext(firm))`) it **READS** settled usage and
fail-closes:
```
select coalesce(tokens_used,0) into v_tokens_used from clara.firm_usage_daily where firm_id=v_firm and usage_date=v_today;
if coalesce(v_tokens_used,0) >= v_token_limit then raise …'daily token budget exhausted' CLR14;
```
This is **read-then-act, NOT reserve-first** — admission does not reserve/increment any tokens.
The code comment is explicit: *"Overshoot ≤ the in-flight admitted runs' spend (they check at
admission, settle later)."* So two concurrent admissions see the same pre-settlement
`tokens_used` and can jointly overshoot by the sum of their eventual spends. The **atomic**
reservation that exists is the **concurrency-run cap** (`max_concurrent_runs`), race-free under
the advisory lock (count+insert) — not a token reservation.

Crucially for WA-L5: `begin_chat_turn` is **chat_turn-only** (it raises if the task is any other
kind), so the wake/autodraft sweep lane has **no existing token-budget admission** to consult at
all, atomically or otherwise. An autodraft sweep would need a new reserve-first primitive; none
exists today.

---

### Probe 11 (captured_invoice_id coupling) — NOT RUN
Requires the eval corpus + the runtime mapper fix; out of scope for a rig-only SQL lane and
noted as such.

### Environment note
The throwaway PG16 on 127.0.0.1:5544 (`clara_test`) is disposable and was left running (detached)
in case re-probing is wanted; its data dir is under the session scratchpad and can be discarded.
